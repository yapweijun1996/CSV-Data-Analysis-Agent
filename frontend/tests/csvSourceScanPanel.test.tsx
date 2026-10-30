import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CsvSourceScanPanel } from '../components/CsvSourceScanPanel';
import { useAppStore } from '../store/useAppStore';
import { beginSessionTransition } from '../services/session/sessionOwnership';
import { scanCsvSourceForImport } from '../services/data/csvSourceScan';

const store = { getState: useAppStore.getState, setState: useAppStore.setState };
afterEach(() => { beginSessionTransition(store); cleanup(); });

describe('actual source scan UI actions', () => {
    it('shows real progress, cancels/resumes, and reopens retained details without granting authority', async () => {
        const file = new File(['key,value\n' + 'x,1\n'.repeat(100000)], 'synthetic.csv');
        const pending = scanCsvSourceForImport(store, file);
        render(<CsvSourceScanPanel />);
        expect(screen.getByRole('progressbar', { name: 'Source bytes scanned' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel structural scan' }));
        await screen.findByText('Structural scan cancelled — incomplete, not verified');
        expect(useAppStore.getState().csvSourceScan?.sha256).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show scan details' }));
        expect(screen.getByText('SHA-256: unverified')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide scan details' }));
        fireEvent.click(screen.getByRole('button', { name: 'Resume structural scan' }));
        await pending;
        await screen.findByText('Full-source parsing complete — no structural signal detected');
        fireEvent.click(screen.getByRole('button', { name: 'Show scan details' }));
        expect(screen.getByText(/SHA-256: [a-f0-9]{64}/)).toBeInTheDocument();
        expect(useAppStore.getState().csvSourceScan?.commitAllowed).toBe(false);
        expect(useAppStore.getState().datasetBundle?.acceptedCommit).toBeUndefined();
        cleanup();
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Full-source parsing complete — no structural signal detected')).toBeInTheDocument();
    });
    it('distinguishes anomalies from failed encoding and never requests human review because of size', async () => {
        render(<CsvSourceScanPanel />);
        await scanCsvSourceForImport(store, new File(['a,b\n1,2\nPRIVATE_CELL_SENTINEL\n'], 'ragged.csv'));
        await screen.findByText('Full-source parsing complete — structural evidence needs repair');
        expect(screen.getByText(/File size alone is not a reason for human review/)).toBeInTheDocument();
        expect(screen.getByText(/completing this scan does not mean repair succeeded/)).toBeInTheDocument();
        expect(screen.getByText(/correct the original CSV and re-import it/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show scan details' }));
        expect(screen.getByRole('region', { name: 'Full-source CSV scan' }).textContent).not.toContain('PRIVATE_CELL_SENTINEL');
        expect(screen.queryByText(/does not yet implement the Pi repair coordinator/)).toBeNull();
        await scanCsvSourceForImport(store, new File([new Uint8Array([0xff, 0xfe, 97, 0])], 'encoding.csv'));
        await screen.findByText('Structural scan failed — not verified');
        await waitFor(() => expect(screen.getByText(/scan_unsupported_encoding/)).toBeInTheDocument());
    });
});
