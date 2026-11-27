// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateOverlay } from '../components/UpdateOverlay';
import { __resetToastsForTests, getToasts } from '../services/ui/toastService';

const pwaState = vi.hoisted(() => ({ flow: 'idle' as string, flowManual: false, version: 'v1.0.0' as string | null }));
const ack = vi.hoisted(() => vi.fn());
vi.mock('../hooks/usePwaLifecycle', () => ({ usePwaLifecycle: () => pwaState }));
vi.mock('../services/pwa/pwaManager', () => ({ acknowledgePwaFlow: ack, checkForPwaUpdate: vi.fn() }));

describe('UpdateOverlay', () => {
    afterEach(() => { cleanup(); __resetToastsForTests(); ack.mockClear(); Object.assign(pwaState, { flow: 'idle', flowManual: false }); });

    it('stays hidden for silent background checks', () => {
        Object.assign(pwaState, { flow: 'checking', flowManual: false });
        render(<UpdateOverlay />);
        expect(document.querySelector('[data-update-overlay]')).toBeNull();
    });

    it.each([
        ['checking', 'Checking for updates'],
        ['downloading', 'Downloading the new version'],
        ['reloading', 'Installing and reloading'],
    ])('shows a full-screen loader while %s', (flow, title) => {
        Object.assign(pwaState, { flow, flowManual: true });
        render(<UpdateOverlay />);
        expect(document.querySelector('[data-update-overlay]')).not.toBeNull();
        expect(screen.getByText(title)).toBeTruthy();
        expect(document.querySelector('[data-step-state="active"]')).not.toBeNull();
    });

    it('reports the final outcome as a toast and acknowledges the flow', () => {
        Object.assign(pwaState, { flow: 'up_to_date', flowManual: true });
        render(<UpdateOverlay />);
        expect(document.querySelector('[data-update-overlay]')).toBeNull();
        expect(getToasts()[0]?.type).toBe('success');
        expect(ack).toHaveBeenCalled();
    });

    it('offers retry on error', () => {
        Object.assign(pwaState, { flow: 'error', flowManual: true });
        render(<UpdateOverlay />);
        act(() => undefined);
        expect(getToasts()[0]).toMatchObject({ type: 'error' });
        expect(getToasts()[0].actions).toHaveLength(1);
    });
});
