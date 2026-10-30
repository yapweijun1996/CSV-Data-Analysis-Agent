import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportBoundaryConfirmModal } from '../components/modals/ReportBoundaryConfirmModal';
import * as useAppStoreModule from '../store/useAppStore';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

const mockStore = (overrides: {
    summaryStartIndex: number | null;
    normalizedRows: string[][];
    bodyStartIndex?: number;
    headerLayerRowIndexes?: number[];
    setAsideSections?: { rowStart: number; rowCount: number }[];
    saveBoundary?: ReturnType<typeof vi.fn>;
    blockingReasons?: string[];
    language?: string;
}) => {
    const blockingReasons = overrides.blockingReasons ?? ['detail_series_coverage_rate'];
    const decisionReason = `Structure needs review: ${blockingReasons.join(', ')}.`;
    const store = {
        isReportBoundaryConfirmModalOpen: true,
        setIsReportBoundaryConfirmModalOpen: vi.fn(),
        reportStructureResolution: {
            headerRowIndex: 0,
            headerLayerRowIndexes: overrides.headerLayerRowIndexes ?? [],
            bodyStartIndex: overrides.bodyStartIndex ?? 1,
            summaryStartIndex: overrides.summaryStartIndex,
            parameterRowIndexes: [],
            repeatedHeaderRowIndexes: [],
            blockingReasons,
            requiresHumanReview: true,
            decision: {
                targetShape: 'row_table',
                shouldCanonicalize: false,
                reason: decisionReason,
            },
        },
        rawIntakeIr: {
            normalizedRows: overrides.normalizedRows,
            diagnostics: { setAsideSections: overrides.setAsideSections ?? [] },
        },
        saveReportStructureBoundaryOverride: overrides.saveBoundary ?? vi.fn(async () => undefined),
        isBusy: false,
        settings: { language: overrides.language ?? 'English' },
        pipelineOutcome: {
            status: 'needs_structure_review',
            canAutoAnalyze: false,
            severity: 'warning',
            reasonCode: blockingReasons[0],
            message: `Structure review is required before automatic analysis. ${decisionReason}`,
        },
        cleaningRun: null,
        columnProfiles: [],
        userColumnAnnotations: {},
        setColumnAnnotation: vi.fn(),
    };
    (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>)
        .mockImplementation((selector: (value: typeof store) => unknown) => selector(store));
    return store;
};

const getSummaryCard = () => screen.getByText('Summary Rows').parentElement as HTMLElement;

describe('ReportBoundaryConfirmModal guided repair', () => {
    afterEach(() => cleanup());

    it('previews a fictional footer once and updates the edited boundaries', () => {
        mockStore({
            headerLayerRowIndexes: [0, 1],
            bodyStartIndex: 2,
            summaryStartIndex: 5,
            normalizedRows: [
                ['Fictional report'], ['Item', 'Value'],
                ['Amber', '1'], ['Blue', '2'], ['Cyan', '3'],
                ['TOTAL', '6'], ['Note A'], ['Note B'], ['Note C'], ['Note D'],
            ],
        });
        render(<ReportBoundaryConfirmModal />);
        const table = screen.getByRole('table');
        const preview = () => within(table).getAllByRole('row').map(row =>
            within(row).getAllByRole('cell').map(cell => cell.textContent));
        expect(preview()).toEqual([
            ['1', 'Header', 'Fictional report'], ['2', 'Header', 'Item', 'Value'],
            ['3', 'Data', 'Amber', '1'], ['4', 'Data', 'Blue', '2'], ['5', 'Data', 'Cyan', '3'],
            ['6', 'Summary', 'TOTAL', '6'], ['7', 'Summary', 'Note A'],
        ]);
        expect(within(screen.getByText('Data Rows').parentElement as HTMLElement).getByText('3')).toBeInTheDocument();
        expect(within(screen.getByText('Summary Rows').parentElement as HTMLElement).getByText('5')).toBeInTheDocument();

        const inputs = screen.getAllByRole('spinbutton');
        fireEvent.change(inputs[1], { target: { value: '7' } });
        expect(preview().find(row => row.includes('TOTAL'))?.[1]).toBe('Data');
        fireEvent.change(inputs[0], { target: { value: '4' } });
        expect(preview().filter(row => row[1] === 'Data').map(row => row[0])).toEqual(['4', '5', '6']);
        fireEvent.change(inputs[1], { target: { value: '6' } });
        expect(preview().filter(row => row[1] === 'Data').map(row => row[0])).toEqual(['4', '5']);
        expect(preview().find(row => row.includes('TOTAL'))?.[1]).toBe('Summary');
    });

    it.each([
        { name: 'no summary', body: 1, summary: null, stack: undefined, data: ['2', '3', '4', '5'], summaries: [], count: '5' },
        { name: 'summary adjacent to header', body: 1, summary: 1, stack: undefined, data: [], summaries: ['2', '3'], count: '0' },
        { name: 'summary before body', body: 4, summary: 2, stack: undefined, data: [], summaries: ['3', '4'], count: '0' },
        { name: 'summary after body', body: 1, summary: 4, stack: undefined, data: ['2', '3', '4'], summaries: ['5', '6'], count: '3' },
        { name: 'stack without summary', body: 1, summary: null, stack: 3, data: ['2', '3'], summaries: [], count: '2' },
        { name: 'stack after summary', body: 1, summary: 2, stack: 3, data: ['2'], summaries: ['3'], count: '1' },
        { name: 'summary inside stack', body: 1, summary: 4, stack: 3, data: ['2', '3'], summaries: [], count: '2' },
    ])('respects preview intervals: $name', ({ body, summary, stack, data, summaries, count }) => {
        mockStore({
            headerLayerRowIndexes: [0], bodyStartIndex: body, summaryStartIndex: summary,
            normalizedRows: [['Header'], ['One'], ['Two'], ['Three'], ['Four'], ['Five']],
            setAsideSections: stack === undefined ? [] : [{ rowStart: stack, rowCount: 6 - stack }],
        });
        render(<ReportBoundaryConfirmModal />);
        const preview = within(screen.getByRole('table')).getAllByRole('row').map(row =>
            within(row).getAllByRole('cell').map(cell => cell.textContent));
        expect(preview.filter(row => row[1] === 'Data').map(row => row[0])).toEqual(data);
        expect(preview.filter(row => row[1] === 'Summary').map(row => row[0])).toEqual(summaries);
        expect(new Set(preview.map(row => row[0])).size).toBe(preview.length);
        expect(within(screen.getByText('Data Rows').parentElement as HTMLElement).getByText(count)).toBeInTheDocument();
    });

    it('does not duplicate or count header rows inside conflicting boundaries', () => {
        mockStore({
            headerLayerRowIndexes: [0, 1, 1], bodyStartIndex: 1, summaryStartIndex: 1,
            normalizedRows: [['Header A'], ['Header B'], ['Footer']],
        });
        render(<ReportBoundaryConfirmModal />);
        const preview = within(screen.getByRole('table')).getAllByRole('row').map(row =>
            within(row).getAllByRole('cell').map(cell => cell.textContent));
        expect(preview.map(row => row.slice(0, 2))).toEqual([['1', 'Header'], ['2', 'Header'], ['3', 'Summary']]);
        expect(within(screen.getByText('Data Rows').parentElement as HTMLElement).getByText('0')).toBeInTheDocument();
        expect(within(getSummaryCard()).getByText('1')).toBeInTheDocument();
    });

    it('does not offer unproven field-role guesses or the old boundary approval during shape repair', async () => {
        const saveBoundary = vi.fn(async () => undefined);
        const setColumnAnnotation = vi.fn();
        const store = {
            isReportBoundaryConfirmModalOpen: true,
            setIsReportBoundaryConfirmModalOpen: vi.fn(),
            reportStructureResolution: {
                headerRowIndex: 0,
                headerLayerRowIndexes: [0],
                bodyStartIndex: 1,
                summaryStartIndex: null,
                parameterRowIndexes: [],
                repeatedHeaderRowIndexes: [],
                decision: {
                    targetShape: 'row_table',
                    shouldCanonicalize: true,
                    reason: 'The header boundary is uncertain.',
                },
            },
            rawIntakeIr: {
                normalizedRows: [
                    ['Project', 'Amount'],
                    ['Alpha', '1200'],
                    ['Beta', '900'],
                ],
            },
            saveReportStructureBoundaryOverride: saveBoundary,
            isBusy: false,
            settings: { language: 'English' },
            pipelineOutcome: {
                status: 'needs_structure_review',
                canAutoAnalyze: false,
                severity: 'warning',
                reasonCode: 'header_shape_drift',
                message: 'Structure review is required before automatic analysis.',
            },
            cleaningRun: { loopCount: 2 },
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Amount', type: 'numerical' },
            ],
            userColumnAnnotations: {},
            setColumnAnnotation,
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>)
            .mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<ReportBoundaryConfirmModal />);

        expect(screen.getByRole('dialog', { name: 'Review and repair data structure' })).toBeInTheDocument();
        expect(screen.getByText(/Boundary confirmation cannot approve structural repair/)).toBeInTheDocument();
        expect(screen.queryByText(/Auto-confirm/i)).not.toBeInTheDocument();

        expect(screen.queryByRole('combobox', { name: 'Business role for Project' })).toBeNull();
        expect(setColumnAnnotation).not.toHaveBeenCalled();

        expect(screen.getByRole('button', { name: 'Confirm & Start Analysis' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Start Analysis' }));
        expect(saveBoundary).not.toHaveBeenCalled();
    });

    it('shows no summary rows when the boundary only covers the trailing blank line', async () => {
        const saveBoundary = vi.fn(async () => undefined);
        // A file ending with a newline parses to a final empty row; intake
        // places summaryStartIndex on it (index 3 of 4 rows).
        mockStore({
            summaryStartIndex: 3,
            normalizedRows: [
                ['month', 'quota', 'premium'],
                ['2024-01', '1000', '90000'],
                ['2024-02', '1010', '91000'],
                [''],
            ],
            saveBoundary,
        });

        render(<ReportBoundaryConfirmModal />);

        const summaryCard = getSummaryCard();
        expect(within(summaryCard).getByText('0')).toBeInTheDocument();
        expect(within(summaryCard).getByText('None detected')).toBeInTheDocument();
        expect(within(summaryCard).queryByText(/from row/)).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('None detected')).toHaveValue(null);

        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Start Analysis' }));
        await waitFor(() => expect(saveBoundary).toHaveBeenCalledWith(expect.objectContaining({
            summaryStartIndex: null,
        })));
    });

    it('still shows a real summary row with its one-based start row', () => {
        mockStore({
            summaryStartIndex: 3,
            normalizedRows: [
                ['Project', 'Amount', 'Cost'],
                ['Alpha', '1200', '700'],
                ['Beta', '900', '400'],
                ['Total', '2100', '1100'],
                [''],
            ],
        });

        render(<ReportBoundaryConfirmModal />);

        const summaryCard = getSummaryCard();
        expect(within(summaryCard).getByText('1')).toBeInTheDocument();
        expect(within(summaryCard).getByText('from row 4')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('None detected')).toHaveValue(4);
    });

    it('explains structure review reasons in plain language and keeps codes in technical details', () => {
        const codes = ['hierarchy_depth_retention_rate', 'structure_proposal_verification_failed', 'complex_report_requires_confirmation'];
        mockStore({
            summaryStartIndex: null,
            normalizedRows: [['Section', 'Item', 'Amount'], ['A', 'One', '10'], ['A', 'Two', '20']],
            blockingReasons: codes,
        });

        render(<ReportBoundaryConfirmModal />);

        const dialog = screen.getByRole('dialog', { name: 'Review and repair data structure' });
        const details = within(dialog).getByText('Technical details').closest('details');
        expect(details).not.toBeNull();
        const visibleText = (dialog.textContent ?? '').replace(details!.textContent ?? '', '');
        for (const code of codes) {
            expect(visibleText).not.toContain(code);
            expect(details!.textContent).toContain(code);
        }
        expect(screen.getByText('The rows look grouped into levels, such as sections and items, and that grouping would be lost.')).toBeInTheDocument();
        expect(screen.getByText('The suggested table layout did not pass the data checks.')).toBeInTheDocument();
        expect(screen.getByText('This looks like a complex report layout, so please confirm it before analysis.')).toBeInTheDocument();
        expect(screen.getByText('Automatic analysis is paused until you confirm the table structure.')).toBeInTheDocument();
        expect(within(details!).getByText('Technical details')).toBeInTheDocument();
    });

    it('redacts source-derived decision, pipeline message, and unknown codes in expanded details', () => {
        const store = mockStore({
            summaryStartIndex: null,
            normalizedRows: [['Header'], ['Value']],
            blockingReasons: ['hierarchy_depth_retention_rate', 'PRIVATE_CELL_SENTINEL'],
        });
        store.reportStructureResolution.decision.reason = 'Decision includes PRIVATE_CELL_SENTINEL';
        store.pipelineOutcome.message = 'Pipeline includes PRIVATE_CELL_SENTINEL';
        store.pipelineOutcome.reasonCode = 'PRIVATE_CELL_SENTINEL';

        render(<ReportBoundaryConfirmModal />);
        fireEvent.click(screen.getByText('More about this check'));
        fireEvent.click(screen.getByText('Technical details'));
        const dialog = screen.getByRole('dialog', { name: 'Review and repair data structure' });
        const details = within(dialog).getByText('Technical details').closest('details')!;
        expect(details).toHaveAttribute('open');
        expect(details).toHaveTextContent('hierarchy_depth_retention_rate');
        expect(details).toHaveTextContent('unknown_diagnostic');
        expect(details).toHaveTextContent('The data structure did not pass an automatic check.');
        expect(dialog).not.toHaveTextContent('PRIVATE_CELL_SENTINEL');
    });

    it('retains explicitly safe pipeline messages and localizes unknown diagnostic fallback', () => {
        const store = mockStore({
            summaryStartIndex: null,
            normalizedRows: [['Header'], ['Value']],
            blockingReasons: ['synthetic_secret_code'],
            language: 'Mandarin',
        });
        store.reportStructureResolution.decision.reason = 'synthetic_secret_decision';
        store.pipelineOutcome.message = 'Structure review is required before automatic analysis.';

        render(<ReportBoundaryConfirmModal />);
        const details = screen.getByText('技术详情').closest('details')!;
        fireEvent.click(screen.getByText('关于此检查的更多信息'));
        fireEvent.click(within(details).getByText('技术详情'));
        expect(details).toHaveAttribute('open');
        expect(details).toHaveTextContent('Structure review is required before automatic analysis.');
        expect(details).toHaveTextContent('数据结构未通过一项自动检查。');
        expect(details).toHaveTextContent('unknown_diagnostic');
        expect(screen.getByRole('dialog')).not.toHaveTextContent('synthetic_secret');
    });

    it('does not fall back to a raw pipeline message when the outcome is not blocked', () => {
        const store = mockStore({
            summaryStartIndex: null,
            normalizedRows: [['Header'], ['Value']],
            blockingReasons: [],
        });
        store.reportStructureResolution.requiresHumanReview = false;
        store.pipelineOutcome.status = 'ready';
        store.pipelineOutcome.message = 'synthetic_secret_unblocked';
        render(<ReportBoundaryConfirmModal />);
        fireEvent.click(screen.getByText('More about this check'));
        fireEvent.click(screen.getByText('Technical details'));
        expect(screen.getByRole('dialog')).not.toHaveTextContent('synthetic_secret_unblocked');
    });

    it('shows the plain-language reason in the selected language', () => {
        mockStore({
            summaryStartIndex: null,
            normalizedRows: [['DataSeries', '2026Aug', '2026Jul'], ['Total', '100', '90']],
            blockingReasons: ['detail_series_coverage_rate'],
            language: 'Mandarin',
        });

        render(<ReportBoundaryConfirmModal />);

        expect(screen.getByText('表格仍是宽表格式（例如每月一列），可能需要转换。')).toBeInTheDocument();
        expect(screen.getByText('技术详情')).toBeInTheDocument();
    });
});
