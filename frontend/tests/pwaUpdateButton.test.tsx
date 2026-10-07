// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateButton, formatPwaVersion } from '../components/PwaUpdateButton';

const checkMock = vi.hoisted(() => vi.fn(async () => 'up_to_date'));
const pwaState = vi.hoisted(() => ({
    status: 'ready' as string,
    checkStatus: 'idle' as string,
    isOnline: true,
    version: '1.0.0-6ff1812f5311' as string | null,
}));

vi.mock('../hooks/usePwaLifecycle', () => ({ usePwaLifecycle: () => pwaState }));
vi.mock('../hooks/usePwaAutoUpdate', () => ({ usePwaAutoUpdate: () => undefined }));
vi.mock('../services/pwa/pwaManager', () => ({ checkForPwaUpdate: checkMock }));

describe('PwaUpdateButton', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        Object.assign(pwaState, { status: 'ready', checkStatus: 'idle', isOnline: true, version: '1.0.0-6ff1812f5311' });
    });

    it('formats the build version compactly', () => {
        expect(formatPwaVersion('1.0.0-6ff1812f5311')).toBe('v1.0.0 · 6ff1812');
        expect(formatPwaVersion('1.0.0')).toBe('v1.0.0');
        expect(formatPwaVersion(null)).toBeNull();
    });

    it('shows the version and checks for updates on click', () => {
        render(<PwaUpdateButton className="x" language="English" />);

        expect(screen.getByText('v1.0.0 · 6ff1812')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Check update/ }));
        expect(checkMock).toHaveBeenCalledOnce();
    });

    it('is disabled while offline or checking', () => {
        pwaState.isOnline = false;
        const { rerender } = render(<PwaUpdateButton className="x" language="English" />);
        expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

        pwaState.isOnline = true;
        pwaState.checkStatus = 'checking';
        rerender(<PwaUpdateButton className="x" language="English" />);
        expect(screen.getByText('Checking…')).toBeTruthy();
        expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('renders nothing when service workers are unsupported', () => {
        pwaState.status = 'unsupported';
        const { container } = render(<PwaUpdateButton className="x" language="English" />);
        expect(container.firstChild).toBeNull();
    });
});
