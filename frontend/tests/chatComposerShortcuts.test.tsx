import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../components/chat/ChatComposer';

const baseProps = {
    language: 'English', isApiKeySet: true, isAssistantBusy: false, isComposerDisabled: false, isGeneratingReport: false,
    currentView: 'analysis_dashboard', timelineLength: 3, composerBusyState: null,
    composerSuggestedActions: [] as { label: string; action: string }[], hasRunningTurn: false, queuedCount: 0,
    reportProgressLabel: null, canCancelActiveTurn: false, isCancellationPending: false, effectivePendingClarification: null,
    pendingMutationConfirmation: null, placeholder: 'Type a message', onSend: vi.fn(), onSuggestedAction: vi.fn(), onCancelActiveTurn: vi.fn(),
};

describe('ChatComposer keyboard shortcuts', () => {
    afterEach(() => { cleanup(); vi.clearAllMocks(); });

    it('Enter sends and Shift+Enter does not', () => {
        const onSend = vi.fn();
        render(<ChatComposer {...baseProps} onSend={onSend} />);
        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'hello' } });
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('Esc stops a running turn from the textarea and from the page', () => {
        const onCancelActiveTurn = vi.fn();
        render(<ChatComposer {...baseProps} canCancelActiveTurn hasRunningTurn onCancelActiveTurn={onCancelActiveTurn} />);
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
        expect(onCancelActiveTurn).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onCancelActiveTurn).toHaveBeenCalledTimes(2);
    });

    it('Esc does nothing when no turn can be cancelled, and yields to open dialogs', () => {
        const onCancelActiveTurn = vi.fn();
        const { rerender } = render(<ChatComposer {...baseProps} onCancelActiveTurn={onCancelActiveTurn} />);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onCancelActiveTurn).not.toHaveBeenCalled();
        rerender(<ChatComposer {...baseProps} canCancelActiveTurn onCancelActiveTurn={onCancelActiveTurn} />);
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        document.body.appendChild(dialog);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onCancelActiveTurn).not.toHaveBeenCalled();
        dialog.remove();
    });
});
