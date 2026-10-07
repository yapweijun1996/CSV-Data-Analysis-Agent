// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportHeader } from '../components/dashboard/ReportHeader';
import { AiTaskStatusBubble } from '../components/AiTaskStatusBubble';
import { vi } from 'vitest';
import { isSchemaDerivedReportTitle } from '../services/agent/reportContext';

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: unknown) => unknown) => selector({ settings: { language: 'English' } }),
}));

const baseProps = {
    reportContextResolution: null,
    effectiveReportContext: { reportTitle: 'singapore-hdb-resale-prices.csv', reportDescription: null, parameterLines: [] } as never,
    fileName: 'singapore-hdb-resale-prices.csv',
    preparedRowCount: 982589,
    headerDepth: 1,
    summaryRowCount: 0,
    language: 'English' as const,
};

describe('compact dataset header and named step track', () => {
    afterEach(cleanup);

    it('shows the file name once, rows once, and no redundant AI badge or generic hint', () => {
        const { container } = render(<ReportHeader {...baseProps} />);
        const visibleText = container.querySelector('section > div')!.textContent ?? '';

        expect(visibleText.match(/singapore-hdb-resale-prices\.csv/g)).toHaveLength(1);
        expect(visibleText.match(/982,589/g)).toHaveLength(1);
        expect(visibleText).toContain('982,589 rows');
        expect(visibleText).not.toMatch(/AI Analysis|inferred from the uploaded report|prepared rows/i);
    });

    it('adds the file name only when the title is something else', () => {
        render(<ReportHeader {...baseProps} effectiveReportContext={{ reportTitle: 'HDB Resale Prices', reportDescription: 'Monthly transactions', parameterLines: [] } as never} />);

        expect(screen.getByText('HDB Resale Prices')).toBeTruthy();
        expect(screen.getByText('Monthly transactions')).toBeTruthy();
        expect(screen.getByText(/982,589 rows · singapore-hdb-resale-prices\.csv/)).toBeTruthy();
    });

    it('names every analysis step and marks finished ones', () => {
        const { container } = render(<AiTaskStatusBubble task={{
            status: 'acting', title: 'Analysing your data',
            titleKey: 'analysis_initial_stage_4_title', subtitleKey: 'analysis_initial_stage_4_desc',
            totalSteps: 9, currentStep: 4,
        }} />);

        const labels = Array.from(container.querySelectorAll('ol li')).map(li => li.textContent);
        expect(labels).toHaveLength(9);
        expect(labels[0]).toBe('✓ Structure');
        expect(labels[3]).toBe('Prepare');
        expect(labels[8]).toBe('Results');
    });

    it('shows the file name when the title is only the column names', () => {
        const { container } = render(<ReportHeader
            {...baseProps}
            fileName="mid.csv"
            effectiveReportContext={{ reportTitle: 'month town flat_type resale_price', reportDescription: null, parameterLines: [] } as never}
            columnNames={['month', 'town', 'flat_type', 'resale_price']}
        />);

        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('mid.csv');
        expect(container.textContent).not.toContain('flat_type resale_price');
    });

    it('keeps a real report title even when a dataset has columns', () => {
        render(<ReportHeader
            {...baseProps}
            effectiveReportContext={{ reportTitle: 'Quarterly Sales Review', reportDescription: null, parameterLines: [] } as never}
            columnNames={['Region', 'Sales']}
        />);
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Quarterly Sales Review');
    });
});

describe('isSchemaDerivedReportTitle', () => {
    it('matches joined column names, reordered or partial', () => {
        expect(isSchemaDerivedReportTitle('Project Amount', ['Project', 'Amount'])).toBe(true);
        expect(isSchemaDerivedReportTitle('amount project', ['Project', 'Amount', 'Date'])).toBe(true);
        expect(isSchemaDerivedReportTitle('month town', ['month', 'town', 'flat_type'])).toBe(true);
    });

    it('does not match real titles, empty input or datasets without columns', () => {
        expect(isSchemaDerivedReportTitle('HDB Resale Prices', ['month', 'town'])).toBe(false);
        expect(isSchemaDerivedReportTitle('Region', ['Region', 'Sales'])).toBe(false); // a single word may be a real title
        expect(isSchemaDerivedReportTitle('', ['a'])).toBe(false);
        expect(isSchemaDerivedReportTitle('anything here', [])).toBe(false);
    });
});
