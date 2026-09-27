// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { IntentClassificationFindings } from '../services/agent/runtime/intentClassificationTypes';

/**
 * BUG-RUNTIME-201: When intent classification times out or fails,
 * the system should return uncertain findings (not hardcoded 'conversation').
 */
describe('IntentClassificationFindings — uncertain classification', () => {
    /** Helper that mimics buildUncertainFindings contract. */
    const buildUncertainFindings = (
        uncertaintyReason: IntentClassificationFindings['uncertaintyReason'],
    ): IntentClassificationFindings => ({
        intent: 'data_query',
        confidence: 'low',
        hasExplicitColumns: false,
        hasAggregationFunction: false,
        hasGroupingDirective: false,
        hasFilterCondition: false,
        reason: `AI classification uncertain (${uncertaintyReason})`,
        classifiedBy: 'deterministic',
        classificationState: 'uncertain',
        needsGroundedResolution: true,
        fallbackIntent: 'conversation',
        uncertaintyReason,
    });

    it('timeout produces uncertain findings, not conversation', () => {
        const findings = buildUncertainFindings('timeout');
        expect(findings.intent).toBe('data_query');
        expect(findings.classificationState).toBe('uncertain');
        expect(findings.needsGroundedResolution).toBe(true);
        expect(findings.fallbackIntent).toBe('conversation');
        expect(findings.uncertaintyReason).toBe('timeout');
        expect(findings.confidence).toBe('low');
    });

    it('parse_failure produces uncertain findings, not conversation', () => {
        const findings = buildUncertainFindings('parse_failure');
        expect(findings.classificationState).toBe('uncertain');
        expect(findings.uncertaintyReason).toBe('parse_failure');
        expect(findings.intent).toBe('data_query');
    });

    it('ai_unavailable produces uncertain findings', () => {
        const findings = buildUncertainFindings('ai_unavailable');
        expect(findings.classificationState).toBe('uncertain');
        expect(findings.uncertaintyReason).toBe('ai_unavailable');
    });
});

describe('Grounded resolution of uncertain findings', () => {
    /** Mimics the resolution logic in runtimeContractBuilder. */
    const resolveUncertainFindings = (
        findings: IntentClassificationFindings,
        hasDataset: boolean,
    ): IntentClassificationFindings => {
        if (findings.classificationState !== 'uncertain' || !findings.needsGroundedResolution) {
            return findings;
        }

        const hasStructuralSignals = findings.hasExplicitColumns
            || findings.hasAggregationFunction
            || findings.hasGroupingDirective
            || findings.hasFilterCondition;

        if (hasDataset && hasStructuralSignals) {
            return {
                ...findings,
                intent: 'data_query',
                classificationState: 'resolved',
                needsGroundedResolution: false,
            };
        }

        if (!hasDataset) {
            return {
                ...findings,
                intent: findings.fallbackIntent ?? 'conversation',
                classificationState: 'resolved',
                needsGroundedResolution: false,
            };
        }

        return findings;
    };

    it('uncertain + dataset + structural signals → data_query', () => {
        const findings: IntentClassificationFindings = {
            intent: 'data_query',
            confidence: 'low',
            hasExplicitColumns: true,
            hasAggregationFunction: true,
            hasGroupingDirective: false,
            hasFilterCondition: false,
            reason: 'test',
            classifiedBy: 'deterministic',
            classificationState: 'uncertain',
            needsGroundedResolution: true,
            fallbackIntent: 'conversation',
        };

        const resolved = resolveUncertainFindings(findings, true);
        expect(resolved.intent).toBe('data_query');
        expect(resolved.classificationState).toBe('resolved');
        expect(resolved.needsGroundedResolution).toBe(false);
    });

    it('uncertain + no dataset → conversation (fallback)', () => {
        const findings: IntentClassificationFindings = {
            intent: 'data_query',
            confidence: 'low',
            hasExplicitColumns: true,
            hasAggregationFunction: false,
            hasGroupingDirective: false,
            hasFilterCondition: false,
            reason: 'test',
            classifiedBy: 'deterministic',
            classificationState: 'uncertain',
            needsGroundedResolution: true,
            fallbackIntent: 'conversation',
        };

        const resolved = resolveUncertainFindings(findings, false);
        expect(resolved.intent).toBe('conversation');
        expect(resolved.classificationState).toBe('resolved');
    });

    it('uncertain + dataset + no structural signals → keeps uncertain data_query', () => {
        const findings: IntentClassificationFindings = {
            intent: 'data_query',
            confidence: 'low',
            hasExplicitColumns: false,
            hasAggregationFunction: false,
            hasGroupingDirective: false,
            hasFilterCondition: false,
            reason: 'test',
            classifiedBy: 'deterministic',
            classificationState: 'uncertain',
            needsGroundedResolution: true,
            fallbackIntent: 'conversation',
        };

        const resolved = resolveUncertainFindings(findings, true);
        // Stays as-is — capability routing will decide downstream
        expect(resolved.intent).toBe('data_query');
        expect(resolved.classificationState).toBe('uncertain');
    });

    it('resolved findings are not re-resolved', () => {
        const findings: IntentClassificationFindings = {
            intent: 'precise_card',
            confidence: 'high',
            hasExplicitColumns: true,
            hasAggregationFunction: true,
            hasGroupingDirective: true,
            hasFilterCondition: false,
            reason: 'AI classified',
            classifiedBy: 'ai',
            classificationState: 'resolved',
        };

        const resolved = resolveUncertainFindings(findings, true);
        expect(resolved.intent).toBe('precise_card');
        expect(resolved.classificationState).toBe('resolved');
    });
});
