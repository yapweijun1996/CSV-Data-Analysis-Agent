// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCanonicalAnalysisSteering, formatAnalysisSteeringBundle } from '../services/agent/analysisSteering';

describe('analysisSteering', () => {
    it('builds a canonical hierarchical steering bundle from semantic and harness signals', () => {
        const steering = buildCanonicalAnalysisSteering({
            reportShapeKind: 'hierarchical_statement',
            semanticUnderstanding: {
                businessGrains: ['Description'],
                candidateMetrics: ['Amount'],
                timeGrains: [],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'exclude_non_detail_rows',
                businessGlossary: ['Revenue'],
                businessGrainConfidence: 'high',
                unsafeForBusinessNarrative: false,
                signalSources: ['semantic_annotations', 'analysis_brief'],
                signalConfidence: 'high',
            },
            base: {
                preferGroupBy: ['Description'],
                blockGroupBy: ['SeriesKey'],
                softDeprioritizeGroupBy: [],
                excludeFromAggregation: ['Grand Total'],
                hierarchyColumn: 'Description',
                parentDescriptions: ['Grand Total'],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'detail',
                promotedChartType: null,
                blockedChartTypes: [],
                suggestedHideOthers: false,
                recommendedTopN: 8,
                widePivotShape: true,
                formattedNumberColumns: ['Amount'],
                pivotOnlyCombinations: [{ dimA: 'Description', dimB: 'Period', product: 144 }],
                pairingSignals: [],
            },
        });

        expect(steering).toMatchObject({
            reportShapeClass: 'hierarchical_statement',
            detailRowPolicy: 'exclude_non_detail_rows',
            hierarchyMode: 'preserve',
            widePivotMode: 'annotation_fallback',
            signalConfidence: 'high',
        });
        expect(steering.signalSources).toEqual(expect.arrayContaining([
            'semantic_annotations',
            'analysis_brief',
            'investigation_harness',
        ]));
    });

    it('consumes reshapeDecision directive from harness (hierarchy + period columns)', () => {
        // Simulates the harness conflict resolution producing reshapeDecision='reshape_required'
        // when both hierarchy signals and period column families are detected.
        const steering = buildCanonicalAnalysisSteering({
            reportShapeKind: 'hierarchical_statement',
            semanticUnderstanding: {
                businessGrains: ['STAFF NAME'],
                candidateMetrics: ['TOTAL'],
                timeGrains: [],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'preserve_all_rows',
                businessGlossary: [],
                businessGrainConfidence: 'medium',
                unsafeForBusinessNarrative: false,
                signalSources: ['investigation_harness'],
                signalConfidence: 'medium',
            },
            base: {
                preferGroupBy: ['STAFF NAME'],
                blockGroupBy: ['_unnamed_column_1', '_unnamed_column_4'],
                softDeprioritizeGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: ['(row 1 subtotal)'],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                promotedChartType: 'line',
                blockedChartTypes: [],
                suggestedHideOthers: false,
                recommendedTopN: 10,
                widePivotShape: true,
                periodColumnFamilies: [{
                    pattern: 'monthly',
                    year: '2010',
                    columns: [
                        'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010',
                        'MAY 2010', 'JUN 2010', 'JUL 2010', 'AUG 2010',
                        'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
                    ],
                    quarterMap: {},
                    ytdColumns: [],
                }],
                formattedNumberColumns: [],
                pivotOnlyCombinations: [],
                pairingSignals: [],
                // Harness-produced directive — period columns override hierarchy
                reshapeDecision: 'reshape_required',
                reshapeDecisionReasons: ['period_columns_override_hierarchy', 'period_families=1', 'parent_descriptions=1'],
            },
        });

        expect(steering).toMatchObject({
            reportShapeClass: 'hierarchical_statement',
            widePivotMode: 'reshape_required',
            reshapeDecision: 'reshape_required',
            reshapeDecisionReasons: ['period_columns_override_hierarchy', 'period_families=1', 'parent_descriptions=1'],
        });
    });

    it('falls back to annotation_fallback when no reshapeDecision and hierarchical', () => {
        // Legacy path: no reshapeDecision directive, so deriveWidePivotMode
        // falls back to checking reportShapeClass.
        const steering = buildCanonicalAnalysisSteering({
            reportShapeKind: 'hierarchical_statement',
            base: {
                preferGroupBy: ['Description'],
                blockGroupBy: [],
                softDeprioritizeGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: 'Description',
                parentDescriptions: ['Grand Total'],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                promotedChartType: null,
                blockedChartTypes: [],
                suggestedHideOthers: false,
                recommendedTopN: null,
                widePivotShape: true,
                formattedNumberColumns: [],
                pivotOnlyCombinations: [],
                pairingSignals: [],
                // No reshapeDecision — legacy/manual steering
            },
        });

        expect(steering).toMatchObject({
            reportShapeClass: 'hierarchical_statement',
            widePivotMode: 'annotation_fallback',
        });
    });

    it('formats the new canonical fields in the steering summary', () => {
        const summary = formatAnalysisSteeringBundle({
            preferGroupBy: ['Region'],
            blockGroupBy: [],
            softDeprioritizeGroupBy: [],
            reportShapeClass: 'wide_pivot',
            detailRowPolicy: 'preserve_all_rows',
            hierarchyMode: 'none',
            widePivotMode: 'reshape_required',
            signalSources: ['investigation_harness', 'fallback_heuristics'],
            signalConfidence: 'medium',
            excludeFromAggregation: [],
            hierarchyColumn: null,
            parentDescriptions: [],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
            promotedChartType: 'bar',
            blockedChartTypes: ['line'],
            suggestedHideOthers: false,
            recommendedTopN: 10,
            widePivotShape: true,
            formattedNumberColumns: ['Amount'],
            pivotOnlyCombinations: [],
            pairingSignals: [],
        });

        expect(summary).toContain('Report shape class: wide_pivot');
        expect(summary).toContain('Detail row policy: preserve_all_rows');
        expect(summary).toContain('Wide pivot mode: reshape_required');
        expect(summary).toContain('Signal confidence: medium');
    });
});
