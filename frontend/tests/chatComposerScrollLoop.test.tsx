import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../components/chat/ChatComposer';

/**
 * Regression: ChatComposer previously used a useState + separate useEffect pair
 * for multiline tracking, creating a render-feedback loop:
 *   setIsMultiline → useEffect([isMultiline]) → onScrollNeeded → parent setState → re-render → repeat
 *
 * The fix replaces the state with a ref and calls onScrollNeeded directly when the
 * multiline value actually changes, eliminating the secondary effect entirely.
 */
describe('ChatComposer — no infinite scroll notification loop', () => {
    const baseProps = {
        language: 'English',
        isApiKeySet: true,
        isAssistantBusy: false,
        isComposerDisabled: false,
        isGeneratingReport: false,
        currentView: 'analysis_dashboard',
        timelineLength: 3,
        composerBusyState: null,
        composerSuggestedActions: [] as { label: string; action: string }[],
        hasRunningTurn: false,
        queuedCount: 0,
        reportProgressLabel: null,
        canCancelActiveTurn: false,
        isCancellationPending: false,
        effectivePendingClarification: null,
        pendingMutationConfirmation: null,
        placeholder: 'Type a message',
        onSend: vi.fn(),
        onSuggestedAction: vi.fn(),
        onCancelActiveTurn: vi.fn(),
    };

    afterEach(() => {
        cleanup();
    });

    it('does not call onScrollNeeded when multiline state stays the same across input changes', () => {
        const onScrollNeeded = vi.fn();
        render(<ChatComposer {...baseProps} onScrollNeeded={onScrollNeeded} />);

        const textarea = screen.getByRole('textbox');

        // jsdom scrollHeight defaults to 0, so multiline stays false throughout
        fireEvent.change(textarea, { target: { value: 'a' } });
        fireEvent.change(textarea, { target: { value: 'ab' } });
        fireEvent.change(textarea, { target: { value: 'abc' } });

        expect(onScrollNeeded).not.toHaveBeenCalled();
    });

    it('calls onScrollNeeded exactly once when multiline transitions from false to true', () => {
        const onScrollNeeded = vi.fn();
        render(<ChatComposer {...baseProps} onScrollNeeded={onScrollNeeded} />);

        const textarea = screen.getByRole('textbox');

        // Simulate textarea growing past the multiline threshold
        Object.defineProperty(textarea, 'scrollHeight', {
            configurable: true,
            get: () => 80, // > 40 threshold
        });

        fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3' } });
        expect(onScrollNeeded).toHaveBeenCalledTimes(1);

        // Additional typing that keeps multiline=true must NOT fire onScrollNeeded again
        onScrollNeeded.mockClear();
        fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3\nline4' } });
        expect(onScrollNeeded).not.toHaveBeenCalled();
    });

    it('calls onScrollNeeded exactly once when multiline transitions back to false (e.g. send clears input)', () => {
        const onScrollNeeded = vi.fn();
        render(<ChatComposer {...baseProps} onScrollNeeded={onScrollNeeded} />);

        const textarea = screen.getByRole('textbox');

        // Enter multiline state
        let mockScrollHeight = 80;
        Object.defineProperty(textarea, 'scrollHeight', {
            configurable: true,
            get: () => mockScrollHeight,
        });

        fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3' } });
        expect(onScrollNeeded).toHaveBeenCalledTimes(1);

        // Simulate clearing input (send) — scrollHeight drops below threshold
        onScrollNeeded.mockClear();
        mockScrollHeight = 24;
        fireEvent.change(textarea, { target: { value: '' } });
        expect(onScrollNeeded).toHaveBeenCalledTimes(1);

        // Further empty re-renders must NOT call onScrollNeeded again
        onScrollNeeded.mockClear();
        fireEvent.change(textarea, { target: { value: '' } });
        expect(onScrollNeeded).not.toHaveBeenCalled();
    });

    it('tolerates re-renders from parent without calling onScrollNeeded spuriously', () => {
        const onScrollNeeded = vi.fn();
        const { rerender } = render(
            <ChatComposer {...baseProps} onScrollNeeded={onScrollNeeded} />,
        );

        // Parent re-renders (e.g. busy state change) with a new onScrollNeeded reference
        const onScrollNeeded2 = vi.fn();
        rerender(
            <ChatComposer {...baseProps} isAssistantBusy={true} onScrollNeeded={onScrollNeeded2} />,
        );

        // Neither callback should have been called — no multiline transition occurred
        expect(onScrollNeeded).not.toHaveBeenCalled();
        expect(onScrollNeeded2).not.toHaveBeenCalled();
    });
});
