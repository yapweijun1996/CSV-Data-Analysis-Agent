import React, { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoHideHeader } from '../hooks/useAutoHideHeader';
import { APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT } from '../utils/cardNavigation';

class ResizeObserverMock {
    constructor(_callback?: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
}

const HookHarness: React.FC = () => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { headerRef, isHeaderHidden } = useAutoHideHeader({ scrollContainerRef });

    return (
        <div>
            <header ref={headerRef} data-testid="header" data-hidden={isHeaderHidden ? 'true' : 'false'} />
            <div ref={scrollContainerRef} data-testid="scroll-container" />
        </div>
    );
};

describe('useAutoHideHeader', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('temporarily hides the header during card navigation', () => {
        render(<HookHarness />);

        const header = screen.getByTestId('header');

        Object.defineProperty(header, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 0, left: 0, bottom: 72, right: 1200, width: 1200, height: 72, x: 0, y: 0, toJSON: () => ({}) }),
        });

        expect(header).toHaveAttribute('data-hidden', 'false');

        act(() => {
            window.dispatchEvent(new CustomEvent(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, {
                detail: { durationMs: 1200 },
            }));
        });

        expect(header).toHaveAttribute('data-hidden', 'true');

        act(() => {
            vi.advanceTimersByTime(1200);
        });

        expect(header).toHaveAttribute('data-hidden', 'false');
    });
});
