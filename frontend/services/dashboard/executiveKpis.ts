import type { AnalysisCardData, ColumnProfile, CsvData, CsvRow, Settings } from '../../types';
import { getCsvDataRowCount } from '../../utils/datasetId';
import {
    buildGroupCountKpiDetail,
    buildGroupCountKpiLabel,
    buildInactiveKpiDetail,
    buildInactiveKpiLabel,
    buildTopGroupKpiDetail,
    buildTopGroupKpiLabel,
    buildTopShareKpiDetail,
    buildTopShareKpiLabel,
    buildTotalMetricKpiDetail,
    buildTotalMetricKpiLabel,
} from './executiveKpiCopy';
import { buildExecutiveKpiDelta } from './executiveKpiTrend';
import type { ExecutiveKpi } from './executiveKpiTypes';
import {
    buildMetricLabel,
    formatMetricValue,
    formatShareValue,
    getRowValue,
    pluralizeLabel,
    toDisplayLabel,
    toNumericValue,
} from './executiveKpiUtils';
import { buildDisplayAnalysisIrList } from './displayAnalysisIr';
import { resolveCardTrustDecision } from '../agent/cardTrustDecision';
import { getTranslation } from '../../utils/localization';
import { isStructuralMetadataColumn } from '../agent/structuralMetadata';

export type { ExecutiveKpi } from './executiveKpiTypes';

const STATUS_COLUMN_PATTERN = /status|state|active|activity|enabled|lifecycle|stage/i;
const INACTIVE_VALUE_PATTERN = /inactive|closed|disabled|archived|cancelled|terminated|dormant|paused|stopped|offboarded|obsolete/;
const FALSEY_INACTIVE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

const getSortedMetricRows = (card: AnalysisCardData): Array<{ row: CsvRow; value: number }> => {
    const valueKey = card.plan.valueColumn || 'count';
    return card.aggregatedData
        .filter(row => {
            const filter = card.filter;
            if (!filter?.column || filter.values.length === 0) return true;
            const candidate = getRowValue(row, filter.column);
            return (typeof candidate === 'string' || typeof candidate === 'number')
                ? filter.values.includes(candidate)
                : false;
        })
        .map(row => ({
            row,
            value: toNumericValue(getRowValue(row, valueKey)) ?? 0,
        }))
        .filter(entry => Number.isFinite(entry.value))
        .sort((left, right) => right.value - left.value);
};

const getEffectiveTopN = (card: AnalysisCardData): number | null => {
    if (card.plan.disableTopNControls || card.plan.chartType === 'scatter') return null;
    if (card.topN !== undefined) return card.topN;
    return card.plan.defaultTopN ?? null;
};

const getScopedMetricRows = (
    card: AnalysisCardData,
    metricRows: Array<{ row: CsvRow; value: number }>,
): Array<{ row: CsvRow; value: number }> => {
    const groupByColumn = card.plan.groupByColumn;
    const hiddenLabels = new Set(card.hiddenLabels ?? []);
    const visibleRows = groupByColumn && hiddenLabels.size > 0
        ? metricRows.filter(({ row }) => !hiddenLabels.has(String(getRowValue(row, groupByColumn))))
        : metricRows;
    const topN = getEffectiveTopN(card);

    // With "Others" visible, the chart still represents the complete filtered
    // result because the remainder is folded into that synthetic category.
    if (topN === null || !card.hideOthers) return visibleRows;
    return visibleRows.slice(0, topN);
};

const buildInteractiveKpi = ({
    id,
    label,
    value,
    detail,
    tone,
    hierarchy,
    sourceCardId,
    scope,
}: {
    id: string;
    label: string;
    value: string;
    detail: string;
    tone: ExecutiveKpi['tone'];
    hierarchy: ExecutiveKpi['hierarchy'];
    sourceCardId: string;
    scope: ExecutiveKpi['scope'];
}): ExecutiveKpi => ({
    id,
    label,
    value,
    detail,
    tone,
    hierarchy,
    sourceCardId,
    scope,
    action: { type: 'show-card' },
});

const buildCardScope = (
    card: AnalysisCardData,
    rowCount: number | null,
    pluralGroupLabel: string,
    language?: Settings['language'],
): ExecutiveKpi['scope'] => {
    const explicitTopN = getEffectiveTopN(card);
    const filters = [
        ...(card.plan.preFilter ?? [])
            .filter(filter => !isStructuralMetadataColumn(filter.column))
            .map(filter =>
            `${filter.column} ${filter.operator ?? 'eq'} ${Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}`),
        ...(card.filter ? [`${card.filter.column} in ${card.filter.values.join(', ')}`] : []),
    ];

    if (explicitTopN !== null && card.hideOthers) {
        return {
            kind: 'top_n',
            sourceCardId: card.id,
            label: language === 'Mandarin'
                ? `前 ${explicitTopN} 个${pluralGroupLabel}`
                : `Top ${explicitTopN} ${pluralGroupLabel}`,
            topN: explicitTopN,
            rowCount: rowCount ?? undefined,
            ...(filters.length > 0 ? { filterSummary: filters.join(' · ') } : {}),
        };
    }

    if ((card.hiddenLabels?.length ?? 0) > 0) {
        return {
            kind: 'visible_series',
            sourceCardId: card.id,
            label: getTranslation('executive_kpi_visible_series_scope', language),
            rowCount: rowCount ?? undefined,
            ...(filters.length > 0 ? { filterSummary: filters.join(' · ') } : {}),
        };
    }

    if (filters.length > 0) {
        return {
            kind: 'filtered',
            sourceCardId: card.id,
            label: language === 'Mandarin' ? '筛选范围' : 'Filtered scope',
            rowCount: rowCount ?? undefined,
            filterSummary: filters.join(' · '),
        };
    }

    return {
        kind: 'dataset',
        sourceCardId: card.id,
        label: language === 'Mandarin' ? '完整数据范围' : 'Full dataset scope',
        rowCount: rowCount ?? undefined,
    };
};

const buildInactiveKpi = (
    csvData: CsvData | null | undefined,
    groupByColumn: string,
    groupLabel: string,
    sourceCardId: string,
    scope: ExecutiveKpi['scope'],
    language?: Settings['language'],
): ExecutiveKpi | null => {
    if (!csvData?.data?.length || csvData.backing?.mode === 'duckdb_file') return null;

    const headerRow = csvData.data[0];
    const statusColumn = Object.keys(headerRow).find(key => STATUS_COLUMN_PATTERN.test(key));
    if (!statusColumn) return null;

    const inactiveGroups = new Set<string>();
    csvData.data.forEach(row => {
        const rawGroup = getRowValue(row, groupByColumn);
        const rawStatus = getRowValue(row, statusColumn);
        const groupValue = String(rawGroup ?? '').trim();
        const normalizedStatus = String(rawStatus ?? '').trim().toLowerCase();
        if (!groupValue || !normalizedStatus) return;

        if (INACTIVE_VALUE_PATTERN.test(normalizedStatus) || FALSEY_INACTIVE_VALUES.has(normalizedStatus)) {
            inactiveGroups.add(groupValue);
        }
    });

    if (inactiveGroups.size === 0) return null;

    return buildInteractiveKpi({
        id: 'inactive-groups',
        label: buildInactiveKpiLabel(pluralizeLabel(groupLabel), language),
        value: inactiveGroups.size.toLocaleString(),
        detail: buildInactiveKpiDetail({
            statusLabel: toDisplayLabel(statusColumn, 'status'),
            language,
        }),
        tone: 'warning',
        hierarchy: 'insight',
        sourceCardId,
        scope,
    });
};

export const buildExecutiveKpis = ({
    cards,
    columnProfiles,
    csvData,
    language,
    currentDatasetVersion,
}: {
    cards: AnalysisCardData[] | undefined;
    columnProfiles: ColumnProfile[] | undefined;
    csvData: CsvData | null | undefined;
    language?: Settings['language'];
    currentDatasetVersion?: string | null;
}): ExecutiveKpi[] => {
    const safeCards = Array.isArray(cards) ? cards : [];
    const safeProfiles = Array.isArray(columnProfiles) ? columnProfiles : [];
    const cardMap = new Map(safeCards.map(card => [card.id, card]));
    const candidateIrs = buildDisplayAnalysisIrList(safeCards, safeProfiles)
        .filter(ir => !ir.isFallback && Boolean(ir.groupByColumn) && ir.aggregatedRows > 0)
        .sort((left, right) => right.selectionScore - left.selectionScore);
    const trustedCandidateIrs = candidateIrs.filter(ir => {
        const card = cardMap.get(ir.cardId);
        if (!card) return false;
        const effectiveVersion = currentDatasetVersion === undefined
            ? card.provenance?.datasetVersion ?? null
            : currentDatasetVersion;
        return resolveCardTrustDecision(card, effectiveVersion).status === 'verified';
    });
    if (trustedCandidateIrs.length === 0) {
        return [];
    }
    const scoringPool = trustedCandidateIrs;

    const businessCandidateIrs = scoringPool.filter(ir => ir.semanticRole === 'business_dimension');
    const primaryIr = businessCandidateIrs[0] ?? scoringPool[0];
    const primaryCard = primaryIr ? cardMap.get(primaryIr.cardId) : undefined;

    if (!primaryCard?.plan.groupByColumn || !primaryIr) {
        return [];
    }

    const allMetricRows = getSortedMetricRows(primaryCard);
    const metricRows = getScopedMetricRows(primaryCard, allMetricRows);
    if (metricRows.length === 0) {
        return [];
    }

    const valueKey = primaryCard.plan.valueColumn || 'count';
    const metricLabel = primaryIr.displayMetricLabel ?? buildMetricLabel(valueKey);
    const groupLabel = primaryIr.displayGroupLabel;
    const pluralGroupLabel = pluralizeLabel(groupLabel);
    const datasetRowCount = csvData ? getCsvDataRowCount(csvData) : null;
    const scope = buildCardScope(primaryCard, datasetRowCount, pluralGroupLabel, language);
    const totalValue = metricRows.reduce((sum, entry) => sum + entry.value, 0);
    const topEntry = metricRows[0];
    const rawTopLabel = getRowValue(topEntry.row, primaryIr.groupByColumn ?? primaryCard.plan.groupByColumn);
    const topLabelValue = rawTopLabel != null && String(rawTopLabel).trim() !== ''
        ? String(rawTopLabel).trim()
        : null;
    const topEntryShare = totalValue !== 0 ? topEntry.value / totalValue : null;
    const datasetRowDetail = buildTotalMetricKpiDetail({
        rowCount: scope.kind === 'dataset' ? datasetRowCount : null,
        groupCount: metricRows.length,
        pluralGroupLabel,
        language,
    });

    const kpis: ExecutiveKpi[] = [
        {
            ...buildInteractiveKpi({
            id: 'total-metric',
            label: scope.kind === 'top_n'
                ? `${scope.label} · ${buildTotalMetricKpiLabel(metricLabel, language)}`
                : buildTotalMetricKpiLabel(metricLabel, language),
            value: formatMetricValue(totalValue, primaryCard.plan.valueColumn, safeProfiles),
            detail: datasetRowDetail,
            tone: 'primary',
                hierarchy: 'primary',
                sourceCardId: primaryCard.id,
                scope,
            }),
            delta: buildExecutiveKpiDelta({
                card: primaryCard,
                columnProfiles: safeProfiles,
                csvData,
                metricRows,
                totalValue,
                groupLabel,
                language,
            }),
        },
        buildInteractiveKpi({
            id: 'top-group',
            label: buildTopGroupKpiLabel(groupLabel, language),
            value: formatMetricValue(topEntry.value, primaryCard.plan.valueColumn, safeProfiles),
            detail: buildTopGroupKpiDetail({
                topLabelValue,
                shareValue: topEntryShare !== null ? formatShareValue(topEntryShare) : null,
                metricLabel,
                language,
            }),
            tone: 'accent',
            hierarchy: 'secondary',
            sourceCardId: primaryCard.id,
            scope,
        }),
        buildInteractiveKpi({
            id: 'group-count',
            label: buildGroupCountKpiLabel(pluralGroupLabel, language),
            value: metricRows.length.toLocaleString(),
            detail: buildGroupCountKpiDetail({
                pluralGroupLabel,
                language,
            }),
            tone: 'neutral',
            hierarchy: 'secondary',
            sourceCardId: primaryCard.id,
            scope,
        }),
    ];

    const inactiveKpi = scope.kind === 'dataset'
        ? buildInactiveKpi(csvData, primaryCard.plan.groupByColumn, groupLabel, primaryCard.id, scope, language)
        : null;
    if (inactiveKpi) {
        kpis.push(inactiveKpi);
    } else if (metricRows.length > 1 && totalValue !== 0) {
        const concentrationSize = Math.min(3, metricRows.length);
        const concentrationTotal = metricRows.slice(0, concentrationSize).reduce((sum, entry) => sum + entry.value, 0);
        kpis.push(buildInteractiveKpi({
            id: 'top-share',
            label: buildTopShareKpiLabel(concentrationSize, language),
            value: formatShareValue(concentrationTotal / totalValue),
            detail: buildTopShareKpiDetail({
                count: concentrationSize,
                pluralGroupLabel,
                language,
            }),
            tone: 'accent',
            hierarchy: 'insight',
            sourceCardId: primaryCard.id,
            scope,
        }));
    }

    return kpis.slice(0, 4);
};
