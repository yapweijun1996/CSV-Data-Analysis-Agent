import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CsvSourceScanPanel } from '../components/CsvSourceScanPanel';
import { useAppStore } from '../store/useAppStore';
import { beginSessionTransition } from '../services/session/sessionOwnership';
import { scanCsvSourceForImport } from '../services/data/csvSourceScan';

const store = { getState: useAppStore.getState, setState: useAppStore.setState };
afterEach(() => { beginSessionTransition(store); useAppStore.setState({ isBusy: false, csvData: null, datasetBundle: null, csvSourceScan: null }); cleanup(); });

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
    it('shows a source-bound trust summary without turning unknown row accounting into zero or scan completion into approval', async () => {
        const file = new File(['id,amount\nA,10\nB,20\n'], 'trusted.csv');
        const scan = await scanCsvSourceForImport(store, file);
        useAppStore.setState({
            csvData: { fileName: file.name, data: [{ id: 'A', amount: 10 }, { id: 'B', amount: 20 }], summaryRows: [['Total', '30']], metadataRows: [], headerDepth: 1 } as never,
            datasetBundle: { datasetVersion: 'accepted-v1', acceptedCommit: { revision: 3, commitId: 'accepted-v1' }, source: { fileName: file.name, inspection: { sha256: scan.sha256 } } } as never,
        });
        render(<CsvSourceScanPanel />);
        expect(screen.getByRole('region', { name: 'Source trust summary' })).toBeInTheDocument();
        expect(screen.getByText(`Source SHA-256: ${scan.sha256}`)).toBeInTheDocument();
        expect(screen.getByText('Business rows: 2')).toBeInTheDocument();
        expect(screen.getByText('Summary rows: 1')).toBeInTheDocument();
        expect(screen.getByText('Excluded rows: unknown')).toBeInTheDocument();
        expect(screen.getByText(/Current accepted dataset: accepted-v1/)).toBeInTheDocument();
        expect(screen.getByText(/Structural scan completion is not Dataset Commit approval/)).toBeInTheDocument();
    });
    it('does not show zero business rows for an empty upload placeholder while the source scan is running', async () => {
        const file = new File(['id,amount\nA,10\n'], 'pending.csv');
        await scanCsvSourceForImport(store, file);
        const completed = useAppStore.getState().csvSourceScan!;
        useAppStore.setState({ isBusy: true, csvData: { fileName: file.name, data: [] } as never,
            csvSourceScan: { ...completed, status: 'running', sha256: null } });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Business rows: pending')).toBeInTheDocument();
        expect(screen.queryByText('Business rows: 0')).toBeNull();
    });
    it('does not show zero while the import remains busy even after the structural scan completes', async () => {
        const file = new File(['id,amount\nA,10\n'], 'still-importing.csv');
        await scanCsvSourceForImport(store, file);
        useAppStore.setState({ isBusy: true, csvData: { fileName: file.name, data: [] } as never });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Business rows: pending')).toBeInTheDocument();
        expect(screen.queryByText('Business rows: 0')).toBeNull();
    });
    it('shows unavailable instead of pending or zero for a cancelled or failed scan', async () => {
        const file = new File(['id,amount\\nA,10\\n'], 'cancelled.csv');
        await scanCsvSourceForImport(store, file);
        const completed = useAppStore.getState().csvSourceScan!;
        useAppStore.setState({ isBusy: true, csvData: { fileName: file.name, data: [] } as never,
            csvSourceScan: { ...completed, status: 'cancelled', sha256: null } });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Business rows: unavailable')).toBeInTheDocument();
        expect(screen.queryByText('Business rows: pending')).toBeNull();
    });
    it('only reports an actual zero after the completed scan and completed import', async () => {
        const file = new File(['id,amount\n'], 'header-only.csv');
        await scanCsvSourceForImport(store, file);
        useAppStore.setState({ isBusy: false, csvData: { fileName: file.name, data: [], summaryRows: [] } as never });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Business rows: 0')).toBeInTheDocument();
    });
    it('does not label a prior accepted dataset as current when its source is not bound to this scan', async () => {
        const file = new File(['id,amount\nA,10\n'], 'different.csv');
        await scanCsvSourceForImport(store, file);
        useAppStore.setState({
            isBusy: false,
            csvData: { fileName: file.name, data: [{ id: 'A', amount: 10 }] } as never,
            datasetBundle: { datasetVersion: 'old-accepted', acceptedCommit: { commitId: 'old-accepted' }, source: { fileName: 'other.csv' } } as never,
        });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText(/Previous accepted dataset: old-accepted/)).toBeInTheDocument();
        expect(screen.queryByText('Current accepted dataset: old-accepted')).toBeNull();
    });
    it('withholds row counts when the current CSV filename differs from the scanned source', async () => {
        await scanCsvSourceForImport(store, new File(['id\nA\n'], 'scanned.csv'));
        useAppStore.setState({ csvData: { fileName: 'later.csv', data: [{ id: 'PRIVATE_CELL_SENTINEL' }], summaryRows: [['Total']] } as never });
        render(<CsvSourceScanPanel />);
        expect(screen.getByText('Business rows: unavailable')).toBeInTheDocument();
        expect(screen.getByText('Summary rows: unavailable')).toBeInTheDocument();
        expect(screen.getByText(/Current CSV source does not match this scan/)).toBeInTheDocument();
        expect(screen.queryByText(/PRIVATE_CELL_SENTINEL/)).toBeNull();
    });
});
