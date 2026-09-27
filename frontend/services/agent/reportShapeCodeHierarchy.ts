import type { CsvData, CsvRow, RowRoleCandidate } from '../../types';

const STRUCTURAL_CODE_COLUMN_PATTERN = /\b(?:code|account|wbs|id)\b/i;
const CODE_VALUE_PATTERN = /^[A-Z0-9]+$/i;
const PASS_TOLERANCE = 0.02;
const WARN_TOLERANCE = 0.05;
const MIN_CODE_COUNT = 8;
const MIN_VERIFIED_PARENT_COUNT = 2;
const MIN_COMPARABLE_SERIES = 1;
const MIN_TOTAL_PARENT_COMPARISONS = 8;
const MIN_VERIFIED_PARENT_RATIO = 0.6;
const MIN_NON_FAIL_RECONCILIATION_RATIO = 0.8;
const MIN_PASS_RECONCILIATION_RATIO = 0.6;
const MAX_UNKEYED_SUMMARY_RATIO = 0.25;

interface CodeRow {
    rowIndex: number;
    code: string;
    row: CsvRow;
}

interface ParentVerification {
    code: string;
    comparableSeries: number;
    passCount: number;
    warnCount: number;
    failCount: number;
}

const normalizeCode = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, '');

const parseNumber = (value: unknown): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    let normalized = String(value ?? '').trim();
    if (!normalized) return 0;
    const negativeParentheses = /^\(.*\)$/.test(normalized);
    normalized = normalized
        .replace(/[(),]/g, '')
        .replace(/[^0-9.+-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
        return null;
    }
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return null;
    return negativeParentheses ? -Math.abs(parsed) : parsed;
};

const getDirectChildren = (parent: CodeRow, codeRows: CodeRow[]) => {
    const descendants = codeRows.filter(candidate =>
        candidate.code.length > parent.code.length
        && candidate.code.startsWith(parent.code),
    );
    return descendants.filter(candidate =>
        !descendants.some(intermediate =>
            intermediate.code.length > parent.code.length
            && intermediate.code.length < candidate.code.length
            && candidate.code.startsWith(intermediate.code),
        ),
    );
};

const verifyParent = (
    parent: CodeRow,
    children: CodeRow[],
    valueColumns: string[],
): ParentVerification => {
    let comparableSeries = 0;
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;

    valueColumns.forEach(column => {
        const parentValue = parseNumber(parent.row[column]);
        const childValues = children.map(child => parseNumber(child.row[column]));
        if (parentValue === null || childValues.some(value => value === null)) {
            return;
        }
        const childSum = childValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
        if (Math.max(Math.abs(parentValue), Math.abs(childSum)) < 0.01) {
            return;
        }

        comparableSeries += 1;
        const relativeDifference = Math.abs(parentValue - childSum)
            / Math.max(Math.abs(parentValue), Math.abs(childSum), 1);
        if (relativeDifference <= PASS_TOLERANCE) {
            passCount += 1;
        } else if (relativeDifference <= WARN_TOLERANCE) {
            warnCount += 1;
        } else {
            failCount += 1;
        }
    });

    return {
        code: parent.code,
        comparableSeries,
        passCount,
        warnCount,
        failCount,
    };
};

const isVerifiedParent = (verification: ParentVerification) => {
    if (verification.comparableSeries < MIN_COMPARABLE_SERIES) return false;
    const nonFailRatio = (verification.passCount + verification.warnCount) / verification.comparableSeries;
    const passRatio = verification.passCount / verification.comparableSeries;
    return nonFailRatio >= MIN_NON_FAIL_RECONCILIATION_RATIO
        && passRatio >= MIN_PASS_RECONCILIATION_RATIO;
};

/**
 * Refines wide-statement row roles only when a structural code hierarchy is
 * independently verified against numeric series. The model/cleaning planner
 * remains the primary structure proposer; this is the deterministic verifier
 * and timeout fallback that preserves parent rows while preventing downstream
 * detail-only aggregations from double-counting them.
 */
export const applyVerifiedCodeHierarchyRoles = (params: {
    data: CsvData | null;
    rowRoles: RowRoleCandidate[];
    descriptorColumns: string[];
    valueColumns: string[];
}): RowRoleCandidate[] => {
    const { data, rowRoles, descriptorColumns, valueColumns } = params;
    if (!data || rowRoles.length === 0 || valueColumns.length < MIN_COMPARABLE_SERIES) {
        return rowRoles;
    }

    const codeColumn = descriptorColumns.find(column => STRUCTURAL_CODE_COLUMN_PATTERN.test(column));
    const descriptionColumn = descriptorColumns.find(column => column !== codeColumn);
    if (!codeColumn || !descriptionColumn) return rowRoles;

    const rows = data.data;
    const codeRows = rows
        .map((row, rowIndex): CodeRow => ({
            rowIndex,
            code: normalizeCode(row[codeColumn]),
            row,
        }))
        .filter(candidate =>
            candidate.code.length >= 2
            && CODE_VALUE_PATTERN.test(candidate.code),
        );
    if (codeRows.length < MIN_CODE_COUNT) return rowRoles;

    const uniqueCodes = new Set(codeRows.map(candidate => candidate.code));
    if (uniqueCodes.size / codeRows.length < 0.9) return rowRoles;

    const parentRows = codeRows.filter(parent =>
        codeRows.some(candidate =>
            candidate.code.length > parent.code.length
            && candidate.code.startsWith(parent.code),
        ),
    );
    if (parentRows.length < MIN_VERIFIED_PARENT_COUNT) return rowRoles;

    const verifications = parentRows.map(parent =>
        verifyParent(parent, getDirectChildren(parent, codeRows), valueColumns),
    );
    if (
        verifications.reduce((sum, verification) => sum + verification.comparableSeries, 0)
        < MIN_TOTAL_PARENT_COMPARISONS
    ) {
        return rowRoles;
    }
    const verifiedParentCodes = new Set(
        verifications.filter(isVerifiedParent).map(verification => verification.code),
    );
    if (
        verifiedParentCodes.size < MIN_VERIFIED_PARENT_COUNT
        || verifiedParentCodes.size / parentRows.length < MIN_VERIFIED_PARENT_RATIO
    ) {
        return rowRoles;
    }

    const codeLengths = [...new Set(codeRows.map(candidate => candidate.code.length))]
        .sort((left, right) => left - right);
    const maxDepth = Math.max(codeLengths.length - 1, 0);
    const depthByLength = new Map(codeLengths.map((length, index) => [length, index]));
    const unkeyedSummaryRows = rows.filter(row =>
        !normalizeCode(row[codeColumn])
        && String(row[descriptionColumn] ?? '').trim().length > 0
        && valueColumns.some(column => {
            const value = parseNumber(row[column]);
            return value !== null && Math.abs(value) > 0;
        }),
    );
    const canClassifyUnkeyedSummaries = unkeyedSummaryRows.length > 0
        && unkeyedSummaryRows.length / rows.length <= MAX_UNKEYED_SUMMARY_RATIO;

    return rowRoles.map(candidate => {
        const row = rows[candidate.rowIndex];
        if (!row) return candidate;
        const code = normalizeCode(row[codeColumn]);

        if (verifiedParentCodes.has(code)) {
            return {
                ...candidate,
                role: 'subtotal',
                depth: depthByLength.get(code.length) ?? 0,
                confidence: 0.96,
            };
        }
        if (code && uniqueCodes.has(code)) {
            return {
                ...candidate,
                role: 'fact',
                depth: depthByLength.get(code.length) ?? maxDepth,
                confidence: Math.max(candidate.confidence, 0.9),
            };
        }
        if (
            canClassifyUnkeyedSummaries
            && !code
            && String(row[descriptionColumn] ?? '').trim().length > 0
            && valueColumns.some(column => {
                const value = parseNumber(row[column]);
                return value !== null && Math.abs(value) > 0;
            })
        ) {
            return {
                ...candidate,
                role: 'total',
                depth: 0,
                confidence: 0.88,
            };
        }
        return candidate;
    });
};
