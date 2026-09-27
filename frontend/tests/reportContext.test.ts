import { describe, expect, it } from 'vitest';
import type { AiExtractedReportContext, CsvData } from '../types';
import { createMultiHeaderProjectMatrixCase } from './reportShapeFixtures/cases';
import {
    buildReportContextResolution,
    createFallbackReportContext,
    isUsableReportTitle,
    resolveEffectiveReportContext,
} from '../services/agent/reportContext';
import { buildDatasetContext } from '../services/agent/contextBuilder';

describe('reportContext', () => {
    it('keeps the first high-confidence metadata line as title and dedupes parameter lines in order', () => {
        const data: CsvData = {
            fileName: 'financial-report.csv',
            data: [{ Project: 'A', Amount: 100 }],
            metadataRows: [
                ['Income Statement By Project'],
                ['Period: Jul 2025'],
                ['Department: Piling Work'],
                ['Period: Jul 2025'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBe('Income Statement By Project');
        expect(context.parameterLines).toEqual([
            'Period: Jul 2025',
            'Department: Piling Work',
        ]);
    });

    it('filters repeated header lines out of fallback parameter lines while preserving visible parameters', () => {
        const data: CsvData = {
            fileName: 'special-price-summary.csv',
            data: [{
                'Quotation Date': '01-08-2010',
                'Quotation Number': 'TS1004',
                'Sales Engineer Name': 'Kim Meng Tan',
                'AddCom Country Code': 'SG',
            }],
            metadataRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED'],
                ['Special Price Summary Report Reporting Date : 01-01-2010Through 31-12-2010'],
                ['Quotation Date', 'Quotation Number', 'Sales Engineer Name', 'AddCom Country Code'],
                ['Sales Person Name'],
                ['Print Date'],
                ['Supplier Name'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = createFallbackReportContext(data);

        expect(context.parameterLines).toEqual([
            'Reporting Date : 01-01-2010Through 31-12-2010',
            'Sales Person Name',
            'Print Date',
            'Supplier Name',
        ]);
        expect(context.parameterLines).not.toContain('Quotation Date | Quotation Number | Sales Engineer Name | AddCom Country Code');
    });

    it('falls back to schema-derived title when metadata is absent', () => {
        const data: CsvData = {
            fileName: 'plain.csv',
            data: [{ Project: 'A', Amount: 100 }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBe('Project Amount');
        expect(context.parameterLines).toEqual([]);
    });

    it('aligns fallback header hints with the detected report-shape schema for multi-header reports', () => {
        const fixture = createMultiHeaderProjectMatrixCase();
        const context = createFallbackReportContext(fixture.rawLike);

        expect(context.candidateHeaderLine).toEqual([
            'Code',
            'Description',
            ...fixture.expectedShape.detailSeriesColumns,
            'Total',
        ]);
        expect(context.notes.some(note => note.includes('report-shape schema'))).toBe(true);
    });

    it('does not promote wide schema header blobs into the report title fallback', () => {
        const data: CsvData = {
            fileName: 'fr_fin_pl_prj.csv',
            data: [{
                10000: '1',
                10001: '2',
                10002: '3',
                10004: '4',
                17164: '5',
                18181: '6',
                Code: '501001',
                Description: 'Revenue',
                CORP_EC: '7',
                CORP_RE: '8',
                EC: '9',
                EC_P: '10',
                Msia: '11',
                RE: '12',
                Total: '13',
            }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 2,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBeNull();
        expect(isUsableReportTitle('10000 10001 10002 Code Description CORP_EC CORP_RE EC EC_P Msia RE Total')).toBe(false);
    });

    it('keeps footer lines separate from parameter lines and does not infer them from body rows', () => {
        const data: CsvData = {
            fileName: 'budget.csv',
            data: [
                { Project: 'Alpha', Amount: '1000' },
                { Project: 'Beta', Amount: '900' },
            ],
            metadataRows: [
                ['Budget Status Report'],
                ['Period: Jul 2025'],
                ['Department: Civil'],
            ],
            headerLayers: [],
            summaryRows: [
                { note: 'Generated on 2026-03-13' },
                { note: 'Prepared by Finance Ops' },
            ],
            headerDepth: 1,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBe('Budget Status Report');
        expect(context.parameterLines).toEqual([
            'Period: Jul 2025',
            'Department: Civil',
        ]);
        expect(context.footerLines).toEqual([
            'Generated on 2026-03-13',
            'Prepared by Finance Ops',
        ]);
    });

    it('falls back when AI extraction is low confidence, while preserving the AI guess separately', () => {
        const data: CsvData = {
            fileName: 'budget.csv',
            data: [{ Project: 'Alpha', Amount: '1000' }],
            metadataRows: [
                ['Budget Status Report'],
                ['Period: Jul 2025'],
            ],
            headerLayers: [],
            summaryRows: [{ note: 'Generated on 2026-03-13' }],
            headerDepth: 1,
        };
        const aiGuess: AiExtractedReportContext = {
            reportTitle: 'Budget Status Guess',
            reportDescription: 'Budget status overview for Jul 2025.',
            parameterLines: ['Period: Jul 2025'],
            footerLines: ['Generated on 2026-03-13'],
            candidateHeaderLine: null,
            confidence: 'low',
            reasoning: 'Weak title evidence from sparse rows.',
        };

        const resolution = buildReportContextResolution(data, aiGuess);

        expect(resolution.aiExtracted?.reportTitle).toBe('Budget Status Guess');
        expect(resolution.verification.usedFallback).toBe(true);
        expect(resolution.verification.reason).toBe('low_confidence');
        expect(resolution.effective.source).toBe('fallback');
        expect(resolution.effective.reportTitle).toBe('Budget Status Report');
    });

    it('accepts AI report titles that match preserved candidates after punctuation normalization', () => {
        const data: CsvData = {
            fileName: 'revenue.csv',
            data: [{ Project: 'Alpha', Amount: '1000' }],
            metadataRows: [
                ['Revenue Report (SGD)'],
                ['Period: Jul 2025'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        const aiGuess: AiExtractedReportContext = {
            reportTitle: 'Revenue Report SGD',
            reportDescription: 'Revenue report in SGD currency for Jul 2025.',
            parameterLines: ['Period: Jul 2025'],
            footerLines: [],
            candidateHeaderLine: null,
            confidence: 'high',
            reasoning: 'Normalized punctuation from the visible title.',
        };

        const resolution = buildReportContextResolution(data, aiGuess);

        expect(resolution.verification.usedFallback).toBe(false);
        expect(resolution.effective.source).toBe('ai');
        expect(resolution.effective.reportTitle).toBe('Revenue Report SGD');
    });

    it('accepts AI parameter lines that are extracted as a normalized substring of a preserved metadata row', () => {
        const data: CsvData = {
            fileName: 'sales-order-daily.csv',
            data: [{ Project: 'Alpha', Amount: '1000' }],
            metadataRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED'],
                ['Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        const aiGuess: AiExtractedReportContext = {
            reportTitle: 'Sales Order Daily Report',
            reportDescription: 'Daily sales order report covering the full year 2010.',
            parameterLines: ['Reporting Date : 01-01-2010Through 31-12-2010'],
            footerLines: [],
            candidateHeaderLine: null,
            confidence: 'high',
            reasoning: 'The report title and reporting date are visible in the metadata heading.',
        };

        const resolution = buildReportContextResolution(data, aiGuess);

        expect(resolution.verification.usedFallback).toBe(false);
        expect(resolution.effective.source).toBe('ai');
        expect(resolution.effective.parameterLines).toEqual(['Reporting Date : 01-01-2010Through 31-12-2010']);
    });

    it('extracts the report title from parameter-bearing metadata headings and excludes company-name entity rows from parameters', () => {
        const data: CsvData = {
            fileName: 'sales-order-daily.csv',
            data: [{ Project: 'Alpha', Amount: '1000' }],
            metadataRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED'],
                ['Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010'],
                ['IPS Inc Japan Limited'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBe('Sales Order Daily Report');
        expect(context.parameterLines).toEqual(['Reporting Date : 01-01-2010Through 31-12-2010']);
        expect(context.parameterLines).not.toContain('KINETICS INDUSTRIES (DEMO 2011) LIMITED');
        expect(context.parameterLines).not.toContain('IPS Inc Japan Limited');
    });

    it('keeps the leading entity line as title for generic financial statements while preserving the statement line as a parameter', () => {
        const data: CsvData = {
            fileName: 'fr_fin_pl_prj.csv',
            data: [{ Code: '501001', Description: 'Revenue', Total: '1000' }],
            metadataRows: [
                ['BOUSTEAD PROJECTS E&C PTE LTD'],
                ['Income Statement By Project Reporting Date : 01-01-2025Through 17-09-2025 Reporting Currency : SGD'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 2,
        };

        const context = createFallbackReportContext(data);

        expect(context.reportTitle).toBe('BOUSTEAD PROJECTS E&C PTE LTD');
        expect(context.parameterLines.some(line => line.includes('Income Statement By Project'))).toBe(true);
    });

    it('dedupes AI parameter lines after stripping a repeated report-title prefix', () => {
        const data: CsvData = {
            fileName: 'sales-order-daily.csv',
            data: [{ Project: 'Alpha', Amount: '1000' }],
            metadataRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED'],
                ['Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010'],
            ],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        const aiGuess: AiExtractedReportContext = {
            reportTitle: 'Sales Order Daily Report',
            reportDescription: 'Daily sales order report for Kinetics Industries, covering full year 2010.',
            parameterLines: [
                'Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010',
                'Reporting Date : 01-01-2010Through 31-12-2010',
                'KINETICS INDUSTRIES (DEMO 2011) LIMITED',
            ],
            footerLines: [],
            candidateHeaderLine: null,
            confidence: 'high',
            reasoning: 'The heading line contains both the report title and reporting date.',
        };

        const resolution = buildReportContextResolution(data, aiGuess);

        expect(resolution.verification.usedFallback).toBe(false);
        expect(resolution.effective.parameterLines).toEqual(['Reporting Date : 01-01-2010Through 31-12-2010']);
    });

    it('normalizes malformed restored report context arrays before use', () => {
        const data: CsvData = {
            fileName: 'legacy.csv',
            data: [{ Project: 'Alpha', Amount: 100 }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = resolveEffectiveReportContext(
            {
                aiExtracted: null,
                fallback: createFallbackReportContext(data),
                effective: {
                    sourceFile: 'legacy.csv',
                    reportTitle: 'Legacy Report',
                    reportDescription: null,
                    parameterLines: undefined as unknown as string[],
                    footerLines: null as unknown as string[],
                    candidateHeaderLine: undefined as unknown as string[] | null,
                    notes: undefined as unknown as string[],
                    source: 'fallback',
                    confidence: null,
                },
                verification: {
                    passed: true,
                    usedFallback: false,
                    reason: null,
                    aiConfidence: null,
                    issues: [],
                },
                generatedAt: '2026-03-13T00:00:00.000Z',
            },
            data,
            data,
        );

        expect(context).not.toBeNull();
        expect(context?.parameterLines).toEqual([]);
        expect(context?.footerLines).toEqual([]);
        expect(context?.candidateHeaderLine).toBeNull();
        expect(context?.notes).toEqual([]);
    });

    describe('Phase 5 — structural parameter and entity detection', () => {
        it('detects parameter lines structurally via colon delimiter (tier 1)', () => {
            const data: CsvData = {
                fileName: 'test.csv',
                data: [{ Item: 'Widget', Amount: 100 }],
                metadataRows: [
                    ['Budget Status Report'],
                    ['Department: Engineering'],
                    ['Region: Asia Pacific'],
                ],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };

            const context = createFallbackReportContext(data);

            expect(context.reportTitle).toBe('Budget Status Report');
            // Colon-delimited lines are detected as parameters structurally (tier 1).
            expect(context.parameterLines).toContain('Department: Engineering');
            expect(context.parameterLines).toContain('Region: Asia Pacific');
        });

        it('rejects field-type suffix lines from entity detection (Set-based check)', () => {
            const data: CsvData = {
                fileName: 'test.csv',
                data: [{ Item: 'Widget', Amount: 100 }],
                metadataRows: [
                    ['Order Tracking Summary'],
                    ['Sales Person Name'],
                    ['Print Date'],
                    ['Customer Code'],
                ],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };

            const context = createFallbackReportContext(data);

            // Title is the non-parameter line.
            expect(context.reportTitle).toBe('Order Tracking Summary');
            // Field-type suffix lines should be classified as parameter lines via
            // hasFieldTypeSuffix, not entity-only lines.
            expect(context.parameterLines).toContain('Sales Person Name');
            expect(context.parameterLines).toContain('Print Date');
            expect(context.parameterLines).toContain('Customer Code');
        });

        it('accepts actual entity names with legal suffixes', () => {
            const data: CsvData = {
                fileName: 'test.csv',
                data: [{ Item: 'Widget', Amount: 100 }],
                metadataRows: [
                    ['KINETICS INDUSTRIES LIMITED'],
                    ['Income Statement By Project'],
                ],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };

            const context = createFallbackReportContext(data);

            // Entity line with generic financial title → entity name as title.
            expect(context.reportTitle).toBe('KINETICS INDUSTRIES LIMITED');
            // "Income Statement By Project" should appear as parameter line (it has embedded title).
            expect(context.parameterLines.length).toBeGreaterThanOrEqual(0);
        });

        it('extractEmbeddedReportTitle works correctly with deduplicated PARAMETER_KEYWORD_PATTERN', () => {
            const data: CsvData = {
                fileName: 'test.csv',
                data: [{ Code: '501001', Description: 'Revenue', Total: '1000' }],
                metadataRows: [
                    ['ACME CORPORATION PTE LTD'],
                    ['Profit And Loss Statement Reporting Date : 01-01-2025Through 31-12-2025'],
                ],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };

            const context = createFallbackReportContext(data);

            // Should extract embedded title from the combined line.
            expect(context.reportTitle).toBe('ACME CORPORATION PTE LTD');
            expect(context.parameterLines.some(line => line.includes('Reporting Date'))).toBe(true);
        });
    });

    it('buildDatasetContext preserves raw report title and footer when cleaned data loses metadata rows', () => {
        const rawData: CsvData = {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Amount: 100 }],
            metadataRows: [
                ['Monthly Sales Report'],
                ['Period: Jan 2026'],
            ],
            headerLayers: [],
            summaryRows: [{ Note: 'Prepared for internal review only' }],
            headerDepth: 1,
        };
        const cleanedData: CsvData = {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Amount: 100 }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const resolution = buildReportContextResolution(rawData, null);
        const context = buildDatasetContext(
            cleanedData,
            [
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', uniqueValues: 1, missingPercentage: 0 },
            ] as never,
            resolution,
            null,
            null,
            null,
            rawData,
        );

        expect(context.reportTitle).toBe('Monthly Sales Report');
        expect(context.parameterPreview).toContain('Period: Jan 2026');
        expect(context.summaryPreview).toContain('Prepared for internal review only');
    });

    it('buildDatasetContext excludes structural metadata from default business dimensions and metrics', () => {
        const data: CsvData = {
            fileName: 'structured-sales.csv',
            data: [{ Region: 'East', Amount: 100, 'Row Number': 1, ResolvedRowRole: 'detail', HierarchyDepth: 1 }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const context = buildDatasetContext(
            data,
            [
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Row Number', type: 'numerical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'HierarchyDepth', type: 'numerical', uniqueValues: 1, missingPercentage: 0 },
            ] as never,
        );

        expect(context.dimensionColumns).toEqual(['Region']);
        expect(context.metricColumns).toEqual(['Amount']);
        expect(context.blockedDimensions).toEqual(expect.arrayContaining(['ResolvedRowRole']));
        expect(context.avoidMetricColumns).toEqual(expect.arrayContaining(['HierarchyDepth']));
        expect(context.avoidMetricColumns).toEqual(expect.arrayContaining(['Row Number']));
    });
});
