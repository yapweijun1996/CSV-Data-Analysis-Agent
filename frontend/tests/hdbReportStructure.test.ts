import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DataPreparationPlan } from '../types';
import { parseCsvTextWithDetection } from '../services/data/csvDialectDetector';
import { buildCsvDataFromIntakeIr, buildReportIntakeIr } from '../services/data/reportCsvIntake';
import { detectReportShape } from '../services/agent/reportShapeDetector';
import { verifyCleanedDatasetShape } from '../services/agent/cleaningVerification';
import { resolveReportStructureArtifacts } from '../services/agent/reportStructureState';

const HDB_CSV_PATH = path.resolve(process.cwd(), '../demo-data/singapore-hdb-resale-prices.csv');
const baselinePlan: DataPreparationPlan = {
    explanation: 'No reshape is required for a row-oriented transaction table.',
    operations: [],
    outputColumns: [],
    planStatus: 'schema_only',
    consistencyIssues: [],
};

const loadHdbPreview = () => {
    const descriptor = fs.openSync(HDB_CSV_PATH, 'r');
    const bytes = Buffer.alloc(512 * 1024);
    try {
        const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
        const lines = bytes.toString('utf8', 0, count).split('\n');
        expect(lines.length).toBeGreaterThan(2001);
        const { rawRows, detection } = parseCsvTextWithDetection(lines.slice(0, 2001).join('\n'));
        const intakeIr = buildReportIntakeIr('singapore-hdb-resale-prices.csv', rawRows, detection);
        return { intakeIr, csvData: buildCsvDataFromIntakeIr(intakeIr) };
    } finally {
        fs.closeSync(descriptor);
    }
};

describe('HDB resale CSV structure', () => {
    it('auto-accepts a standard row table from the public demo data', () => {
        const { intakeIr, csvData } = loadHdbPreview();
        const shape = detectReportShape(csvData);
        const verification = verifyCleanedDatasetShape(csvData, csvData, baselinePlan);
        const artifacts = resolveReportStructureArtifacts({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            cleaningRun: null,
            dataPreparationPlan: baselinePlan,
        });

        expect(shape.primaryKind).toBe('already_tabular');
        expect(verification.passed).toBe(true);
        expect(verification.signalKey).toBeNull();
        expect(artifacts.reportStructureResolution?.requiresHumanReview).toBe(false);
        expect(artifacts.pipelineOutcome?.canAutoAnalyze).toBe(true);
    }, 30_000);
});
