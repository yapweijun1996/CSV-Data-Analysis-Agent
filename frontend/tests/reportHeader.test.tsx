import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportHeader } from '../components/dashboard/ReportHeader';
import type { ReportContextResolution, ResolvedReportContext } from '../types';

describe('ReportHeader', () => {
    it('falls back to the file name when the restored report title looks like a schema header blob', () => {
        const effectiveReportContext: ResolvedReportContext = {
            sourceFile: 'fr_fin_pl_prj.csv',
            reportTitle: '10000 10001 10002 10004 10006 10007 10008 10009 Code Description CORP_EC CORP_RE EC EC_P Msia RE Total',
            reportDescription: null,
            parameterLines: [],
            footerLines: [],
            candidateHeaderLine: ['Code', 'Description', 'Total'],
            notes: [],
            source: 'fallback',
            confidence: null,
        };

        const reportContextResolution: ReportContextResolution = {
            aiExtracted: null,
            fallback: effectiveReportContext,
            effective: effectiveReportContext,
            verification: {
                passed: false,
                usedFallback: true,
                reason: 'ai_extraction_unavailable',
                aiConfidence: null,
                issues: [],
            },
            generatedAt: '2026-03-13T00:00:00.000Z',
        };

        render(
            <ReportHeader
                reportContextResolution={reportContextResolution}
                effectiveReportContext={effectiveReportContext}
                fileName="fr_fin_pl_prj.csv"
                preparedRowCount={109}
                headerDepth={2}
                summaryRowCount={1}
                language="Chinese"
            />,
        );

        expect(screen.getAllByRole('heading', { level: 2 }).at(-1)).toHaveTextContent('fr_fin_pl_prj.csv');
    });

    it('does not crash when restored report context is missing parameter arrays', () => {
        const effectiveReportContext = {
            sourceFile: 'legacy.csv',
            reportTitle: null,
            notes: [],
            source: 'fallback',
            confidence: null,
        } as unknown as ResolvedReportContext;

        render(
            <ReportHeader
                reportContextResolution={null}
                effectiveReportContext={effectiveReportContext}
                fileName="legacy.csv"
                preparedRowCount={10}
                headerDepth={1}
                summaryRowCount={0}
                language="Chinese"
            />,
        );

        expect(screen.getAllByRole('heading', { level: 2 }).at(-1)).toHaveTextContent('legacy.csv');
    });
});
