// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from '../components/ui/ToastHost';
import { ModalHost } from '../components/ui/ModalHost';
import { __resetToastsForTests, getToasts, toast } from '../services/ui/toastService';
import { __resetModalsForTests, confirmModal } from '../services/ui/modalService';

describe('toast service (single source of truth)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { cleanup(); __resetToastsForTests(); vi.useRealTimers(); });

    it('merges identical toasts and caps the stack at three', () => {
        toast.info('a'); toast.info('a');
        expect(getToasts()).toHaveLength(1);
        toast.info('b'); toast.info('c'); toast.info('d');
        expect(getToasts().map(item => item.message)).toEqual(['b', 'c', 'd']);
    });

    it('auto-hides success after 4 s but keeps errors until dismissed', () => {
        render(<ToastHost />);
        act(() => { toast.success('saved'); toast.error('boom'); });
        expect(screen.getByText('saved')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(4100); });
        expect(screen.queryByText('saved')).toBeNull();
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(screen.getByText('boom')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByText('boom')).toBeNull();
    });

    it('pauses the countdown while hovered and renders text, not HTML', () => {
        render(<ToastHost />);
        act(() => { toast.info('<img src=x onerror=alert(1)>'); });
        const card = screen.getByText('<img src=x onerror=alert(1)>').closest('[data-toast-type]')!;
        expect(card.querySelector('img')).toBeNull();
        fireEvent.mouseEnter(card);
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(getToasts()).toHaveLength(1);
        fireEvent.mouseLeave(card);
        act(() => { vi.advanceTimersByTime(4100); });
        expect(getToasts()).toHaveLength(0);
    });
});

describe('modal service (single source of truth)', () => {
    afterEach(() => { cleanup(); __resetModalsForTests(); });

    it('resolves confirm with the chosen button and queues later requests', async () => {
        render(<ModalHost />);
        let first: Promise<boolean>; let second: Promise<boolean>;
        act(() => {
            first = confirmModal({ title: 'One', message: 'm1', confirmLabel: 'OK1', cancelLabel: 'No1' });
            second = confirmModal({ title: 'Two', message: 'm2', confirmLabel: 'OK2' });
        });
        expect(screen.getByRole('dialog').textContent).toContain('One');
        await act(async () => { fireEvent.click(screen.getByText('OK1')); });
        await expect(first!).resolves.toBe(true);
        expect(screen.getByRole('dialog').textContent).toContain('Two');
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        await expect(second!).resolves.toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
