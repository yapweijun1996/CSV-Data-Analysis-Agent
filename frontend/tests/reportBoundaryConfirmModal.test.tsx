import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportBoundaryConfirmModal } from '../components/modals/ReportBoundaryConfirmModal';
import * as useAppStoreModule from '../store/useAppStore';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

describe('ReportBoundaryConfirmModal guided repair', () => {
    it('explains the block, allows field-role correction, and waits for explicit confirmation', async () => {
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
        expect(screen.getByText('Why continuing is unsafe')).toBeInTheDocument();
        expect(screen.queryByText(/Auto-confirm/i)).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole('combobox', { name: 'Business role for Project' }), {
            target: { value: 'dimension' },
        });
        expect(setColumnAnnotation).toHaveBeenCalledWith({
            columnName: 'Project',
            businessLabel: 'Project',
            description: '',
            businessRole: 'dimension',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Start Analysis' }));
        await waitFor(() => expect(saveBoundary).toHaveBeenCalledWith(expect.objectContaining({
            bodyStartIndex: 1,
            summaryStartIndex: null,
        })));
    });
});
