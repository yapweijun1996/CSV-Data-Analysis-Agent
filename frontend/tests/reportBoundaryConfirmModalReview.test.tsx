import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReportBoundaryConfirmModal } from '../components/modals/ReportBoundaryConfirmModal';
import * as useAppStoreModule from '../store/useAppStore';
import { processCsvWithIntakeIr } from '../services/data/csvParser';
import { profileData } from '../services/data/dataProfiler';
import { resolveReportStructureArtifacts } from '../services/agent/reportStructureState';
import type { ColumnProfile, CsvData, DataPreparationPlan, ReportIntakeIr } from '../types';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

// The dialog for the real weird-report fixtures, built through the production intake.
const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/weird-reports');
const schemaOnlyPlan: DataPreparationPlan = {
    explanation: 'Import keeps the source rows unchanged.',
    operations: [],
    outputColumns: [],
    planStatus: 'schema_only',
    consistencyIssues: [],
};

type Fixture = { csvData: CsvData; intakeIr: ReportIntakeIr; profiles: ColumnProfile[]; resolution: unknown };
const loadFixture = async (name: string): Promise<Fixture> => {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
    const file = { name, size: text.length, text: async () => text } as unknown as File;
    const { csvData, intakeIr } = await processCsvWithIntakeIr(file);
    const artifacts = resolveReportStructureArtifacts({
        rawCsvData: csvData,
        csvData,
        rawIntakeIr: intakeIr,
        cleaningRun: null,
        dataPreparationPlan: schemaOnlyPlan,
    });
    return { csvData, intakeIr, profiles: profileData(csvData.data).profiles, resolution: artifacts.reportStructureResolution };
};

const truth = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'truth.json'), 'utf8')) as { f3: { rows: number[] } };
const [, creditRows, paymentRows] = truth.f3.rows;

const fixtures: Record<string, Fixture> = {};
beforeAll(async () => {
    for (const name of ['w3_three_sections.csv', 'w6_grouped_header_carryforward.csv', 'w7_fixed_width_text.csv']) {
        fixtures[name] = await loadFixture(name);
    }
});

const mockStoreFor = (fixture: Fixture, language = 'English') => {
    const store = {
        isReportBoundaryConfirmModalOpen: true,
        setIsReportBoundaryConfirmModalOpen: vi.fn(),
        reportStructureResolution: {
            ...(fixture.resolution as Record<string, unknown>),
            requiresHumanReview: true,
            blockingReasons: ['stacked_sections_set_aside'],
        },
        rawIntakeIr: fixture.intakeIr,
        csvData: fixture.csvData,
        datasetSemanticSnapshot: null,
        saveReportStructureBoundaryOverride: vi.fn(async () => undefined),
        isBusy: false,
        settings: { language },
        pipelineOutcome: {
            status: 'needs_structure_review',
            canAutoAnalyze: false,
            severity: 'warning',
            reasonCode: 'stacked_sections_set_aside',
            message: 'Structure review is required before automatic analysis.',
        },
        cleaningRun: null,
        columnProfiles: fixture.profiles,
        userColumnAnnotations: {} as Record<string, unknown>,
        setColumnAnnotation: vi.fn(),
    };
    (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>)
        .mockImplementation((selector: (value: typeof store) => unknown) => selector(store));
    return store;
};

const roleSelect = (column: string) => screen.getByRole('combobox', { name: `Business role for ${column}` }) as HTMLSelectElement;
const rowOf = (column: string) => roleSelect(column).closest('label') as HTMLElement;

describe('ReportBoundaryConfirmModal review dialog (real fixtures)', () => {
    afterEach(() => cleanup());

    it('pre-selects the role the app can infer and marks it as a suggestion (w3)', () => {
        mockStoreFor(fixtures['w3_three_sections.csv']);
        render(<ReportBoundaryConfirmModal />);

        expect(screen.getByRole('heading', { name: 'How should each column be used?' })).toBeInTheDocument();
        expect(screen.queryByText('Field roles')).not.toBeInTheDocument();
        expect(screen.getByText(/^Example: /)).toBeInTheDocument();
        expect(roleSelect('Invoice No').value).toBe('identifier');
        expect(roleSelect('Date').value).toBe('dimension');
        expect(roleSelect('Customer').value).toBe('dimension');
        expect(roleSelect('Amount').value).toBe('metric');
        expect(roleSelect('Tax').value).toBe('metric');
        for (const column of ['Invoice No', 'Date', 'Customer', 'Amount', 'Tax']) {
            expect(within(rowOf(column)).getByText('Suggested')).toBeInTheDocument();
            expect(within(rowOf(column)).queryByText('Please choose')).not.toBeInTheDocument();
        }
        // Plain option names; the internal role names are not shown.
        const options = within(roleSelect('Amount')).getAllByRole('option').map(option => option.textContent);
        expect(options).toContain('Number to add up (amount, quantity)');
        expect(options).toContain('ID or code (never added up)');
        expect(options.join('|')).not.toMatch(/Dimension|Metric|Identifier/);
    });

    it('pre-selects roles for the fixed-width text report (w7) and the carry-forward report (w6)', () => {
        mockStoreFor(fixtures['w7_fixed_width_text.csv']);
        const { unmount } = render(<ReportBoundaryConfirmModal />);
        expect(roleSelect('ITEM CODE').value).toBe('identifier');
        expect(roleSelect('ON HAND').value).toBe('metric');
        expect(roleSelect('VALUE').value).toBe('metric');
        expect(roleSelect('LOCATION').value).toBe('dimension');
        unmount();

        mockStoreFor(fixtures['w6_grouped_header_carryforward.csv']);
        render(<ReportBoundaryConfirmModal />);
        expect(roleSelect('Category').value).toBe('dimension');
        expect(roleSelect('FY2025 :: Q1').value).toBe('metric');
    });

    it('leaves only undecidable columns unspecified, asks about them first, and keeps stored values unchanged', () => {
        const store = mockStoreFor(fixtures['w3_three_sections.csv']);
        // A column of many different short free texts has no evidence either way.
        const rowsWithUnclear = fixtures['w3_three_sections.csv'].csvData.data.slice(0, 120).map((row, index) => ({
            ...row,
            Mystery: `x${(index * 7919) % 100003}${String.fromCharCode(97 + (index % 26))}`,
        }));
        store.columnProfiles = [...store.columnProfiles, { name: 'Mystery', type: 'categorical' }];
        (store as unknown as { csvData: CsvData }).csvData = { ...fixtures['w3_three_sections.csv'].csvData, data: rowsWithUnclear };
        render(<ReportBoundaryConfirmModal />);

        expect(roleSelect('Mystery').value).toBe('');
        expect(within(rowOf('Mystery')).getByText('Please choose')).toBeInTheDocument();
        expect(within(rowOf('Mystery')).queryByText('Suggested')).not.toBeInTheDocument();
        const labels = screen.getAllByRole('combobox').map(select => select.getAttribute('aria-label'));
        expect(labels[0]).toBe('Business role for Mystery');

        // Choosing a role stores the unchanged internal value and drops the suggestion tag.
        fireEvent.change(roleSelect('Mystery'), { target: { value: 'helper' } });
        expect(store.setColumnAnnotation).toHaveBeenCalledWith({
            columnName: 'Mystery', businessLabel: 'Mystery', description: '', businessRole: 'helper',
        });
        // Untouched suggestions are not written as user annotations.
        expect(store.setColumnAnnotation).toHaveBeenCalledTimes(1);
    });

    it('lets the user decline a suggestion with "not sure"', () => {
        const store = mockStoreFor(fixtures['w3_three_sections.csv']);
        render(<ReportBoundaryConfirmModal />);

        fireEvent.change(roleSelect('Amount'), { target: { value: '' } });
        expect(store.setColumnAnnotation).toHaveBeenCalledWith(expect.objectContaining({ columnName: 'Amount', businessRole: undefined }));
        expect(roleSelect('Amount').value).toBe('');
        expect(within(rowOf('Amount')).getByText('Please choose')).toBeInTheDocument();
    });

    it('collapses the diagnostic box to a plain reason and the action, with the rest in a disclosure', () => {
        mockStoreFor(fixtures['w3_three_sections.csv']);
        render(<ReportBoundaryConfirmModal />);

        const dialog = screen.getByRole('dialog', { name: 'Review and repair data structure' });
        const box = within(dialog).getByRole('region', { name: 'Why your review is needed' });
        const disclosure = box.querySelector('details') as HTMLDetailsElement;
        expect(disclosure.open).toBe(false);
        const visible = (box.textContent ?? '').replace(disclosure.textContent ?? '', '');
        expect(visible).toContain('The file stacks several different tables.');
        expect(visible).toContain('Check where the data starts and ends and how each column is used');
        expect(visible).not.toContain('What the app tried');
        expect(visible).not.toContain('Why continuing is unsafe');
        expect(disclosure.textContent).toContain('What the app tried');
        expect(disclosure.textContent).toContain('Technical details');
    });

    it('explains ambiguous runtime boundaries with an action and no source cells in diagnostic guidance', () => {
        const store = mockStoreFor(fixtures['w3_three_sections.csv']);
        store.reportStructureResolution.blockingReasons = ['runtime_boundary_ambiguous'];
        store.rawIntakeIr = {
            ...store.rawIntakeIr,
            normalizedRows: [['PRIVATE_CELL_SENTINEL'], ...store.rawIntakeIr.normalizedRows.slice(1)],
        };
        render(<ReportBoundaryConfirmModal />);

        const guidance = screen.getByRole('region', { name: 'Why your review is needed' });
        expect(guidance).toHaveTextContent('The table boundaries are unclear');
        expect(guidance).toHaveTextContent('Check where the data starts and ends');
        expect(guidance).not.toHaveTextContent('PRIVATE_CELL_SENTINEL');
    });

    it('puts the editable boundary and the preview above the column roles', () => {
        mockStoreFor(fixtures['w3_three_sections.csv']);
        render(<ReportBoundaryConfirmModal />);

        const boundary = screen.getByRole('region', { name: 'Where the data starts and ends' });
        const preview = screen.getByText('Data Preview');
        const roles = screen.getByRole('region', { name: 'How should each column be used?' });
        expect(boundary.compareDocumentPosition(roles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(preview.compareDocumentPosition(roles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(boundary.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows stacked tables as set aside, not as summary rows (w3)', () => {
        mockStoreFor(fixtures['w3_three_sections.csv']);
        render(<ReportBoundaryConfirmModal />);

        expect(screen.getByText('Your file has 3 tables stacked. Only the first is analysed.')).toBeInTheDocument();
        const tile = screen.getByText('Other tables set aside').parentElement as HTMLElement;
        expect(within(tile).getByText('2')).toBeInTheDocument();
        expect(within(tile).getByText(`${creditRows} and ${paymentRows} rows`)).toBeInTheDocument();
        const summaryTile = screen.getByText('Summary Rows').parentElement as HTMLElement;
        expect(within(summaryTile).getByText('0')).toBeInTheDocument();
        expect(within(summaryTile).getByText('None detected')).toBeInTheDocument();
        // The stacked rows are not reported as summary rows.
        expect(summaryTile.textContent).not.toContain(String(creditRows + paymentRows));
    });

    it('uses singular forms for one layer and one set-aside table, and plural forms otherwise', () => {
        const w3 = fixtures['w3_three_sections.csv'];
        const oneSection = {
            ...w3.intakeIr,
            diagnostics: { ...w3.intakeIr.diagnostics, setAsideSections: [w3.intakeIr.diagnostics.setAsideSections![0]] },
        };
        mockStoreFor({ ...w3, intakeIr: oneSection });
        const { unmount } = render(<ReportBoundaryConfirmModal />);
        expect(screen.getByText('1 layer')).toBeInTheDocument();
        expect(screen.queryByText(/layer\(s\)/)).not.toBeInTheDocument();
        expect(screen.getByText('Other table set aside')).toBeInTheDocument();
        expect(screen.getByText(`${creditRows} rows`)).toBeInTheDocument();
        expect(screen.getByText('Your file has 2 tables stacked. Only the first is analysed.')).toBeInTheDocument();
        unmount();

        // A two-row grouped header ("FY2025" over "Q1") is two layers.
        const w6 = fixtures['w6_grouped_header_carryforward.csv'];
        mockStoreFor({ ...w6, resolution: { ...(w6.resolution as object), headerLayerRowIndexes: [0, 1] } });
        render(<ReportBoundaryConfirmModal />);
        expect(screen.getByText('2 layers')).toBeInTheDocument();
        expect(screen.queryByText('Other tables set aside')).not.toBeInTheDocument();
        expect(screen.queryByText(/tables stacked/)).not.toBeInTheDocument();
    });

    it('reassures that the original file is not changed, under the confirm button, in every language', () => {
        const expected: Record<string, string> = {
            English: 'Your original file is not changed.',
            Mandarin: '你的原始文件不会被修改。',
            Japanese: '元のファイルは変更されません。',
            Malay: 'Fail asal anda tidak diubah.',
        };
        for (const [language, text] of Object.entries(expected)) {
            mockStoreFor(fixtures['w7_fixed_width_text.csv'], language);
            const { unmount } = render(<ReportBoundaryConfirmModal />);
            const line = screen.getByText(text);
            const confirm = within(screen.getByRole('dialog')).getAllByRole('button').at(-1) as HTMLElement;
            expect(confirm.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            unmount();
        }
        mockStoreFor(fixtures['w7_fixed_width_text.csv']);
        render(<ReportBoundaryConfirmModal />);
        expect(screen.getByRole('button', { name: 'Confirm & Start Analysis' })).toBeInTheDocument();
    });

    it('lets the role list grow with the dialog instead of scrolling inside it', () => {
        mockStoreFor(fixtures['w6_grouped_header_carryforward.csv']);
        render(<ReportBoundaryConfirmModal />);

        const list = rowOf('Category').parentElement as HTMLElement;
        expect(list.className).not.toMatch(/max-h-|overflow-y/);
    });
});
