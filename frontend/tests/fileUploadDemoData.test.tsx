import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileUpload } from '../components/FileUpload';

const handleFileUpload = vi.fn();
const storeState = {
    handleFileUpload,
    isBusy: false,
    isApiKeySet: true,
    progressMessages: [] as Array<{
        text: string;
        type: 'system' | 'warning' | 'error';
    }>,
    csvData: null as { fileName: string } | null,
    settings: { language: 'English' as const },
    cleaningRun: null as { status: string } | null,
    aiTaskStatus: null,
    setIsDebugLogsModalOpen: vi.fn(),
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

describe('FileUpload demo data button', () => {
    beforeEach(() => {
        handleFileUpload.mockReset();
        storeState.isApiKeySet = true;
        storeState.isBusy = false;
        storeState.csvData = null;
        storeState.progressMessages = [];
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['a,b\n1,2\n']), { status: 200 })));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('fetches the bundled demo CSV and hands it to handleFileUpload as a File', async () => {
        render(<FileUpload />);

        expect(screen.getByRole('heading', { name: 'Upload a CSV to begin' })).toBeInTheDocument();
        expect(screen.getByText(/recognize the fields, check data quality/)).toBeInTheDocument();
        expect(screen.getByText(/every official HDB resale record from 1990 onward/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Load Full Raw HDB Data' }));

        await waitFor(() => expect(handleFileUpload).toHaveBeenCalledTimes(1));
        const [file] = handleFileUpload.mock.calls[0];
        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe('singapore-hdb-resale-prices.csv');
        expect(fetch).toHaveBeenCalledWith('demo-data/singapore-hdb-resale-prices.csv');
    });

    it('shows an inline error and does not call handleFileUpload when the fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
        render(<FileUpload />);

        fireEvent.click(screen.getByRole('button', { name: 'Load Full Raw HDB Data' }));

        await waitFor(() => expect(screen.getByText(/Could not load the full raw HDB dataset/)).toBeInTheDocument());
        expect(handleFileUpload).not.toHaveBeenCalled();
    });

    it('does not render the upload surface at all when no provider is configured', () => {
        storeState.isApiKeySet = false;
        render(<FileUpload />);
        expect(screen.queryByRole('button', { name: 'Load Full Raw HDB Data' })).not.toBeInTheDocument();
    });

    it('keeps a file-processing error visible after returning to the upload surface', () => {
        storeState.progressMessages = [{
            text: 'File Processing Error: malformed quoted row',
            type: 'error',
        }];

        render(<FileUpload />);

        expect(screen.getByRole('alert')).toHaveTextContent(
            'This CSV could not be imported',
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            'File Processing Error: malformed quoted row',
        );
    });

    it('keeps the upload flow visible but unavailable while the workspace is restoring', () => {
        render(<FileUpload isWorkspaceRestoring />);

        expect(screen.getByRole('status')).toHaveTextContent('Preparing AI Analysis');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Upload will be available as soon as the workspace is ready.',
        );
        expect(screen.getByLabelText('Preparing upload…')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Load Full Raw HDB Data' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Load Full Raw HDB Data' }));
        expect(fetch).not.toHaveBeenCalled();
        expect(handleFileUpload).not.toHaveBeenCalled();
    });
});
