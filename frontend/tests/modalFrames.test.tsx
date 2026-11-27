import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullScreenFrame } from '../components/ui/FullScreenFrame';
import { ModalFrame } from '../components/ui/ModalFrame';

describe('shared dialog frames', () => {
    afterEach(cleanup);

    it('ModalFrame labels the dialog, caps its height and closes from the header button and Escape', () => {
        const onClose = vi.fn();
        render(
            <ModalFrame isOpen onClose={onClose} titleId="t" title="Example" closeLabel="Close example" footer={<button>Save</button>}>
                <p>Body</p>
            </ModalFrame>,
        );
        const dialog = screen.getByRole('dialog', { name: 'Example' });
        expect(dialog.className).toContain('max-h-[90dvh]');
        fireEvent.click(screen.getByRole('button', { name: 'Close example' }));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ModalFrame can hide the header close button when the footer carries the dismiss action', () => {
        render(<ModalFrame isOpen onClose={() => {}} titleId="t" title="Consent" closeLabel="Decline" hideClose><p>Body</p></ModalFrame>);
        expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    });

    it('ModalFrame renders nothing when closed', () => {
        render(<ModalFrame isOpen={false} onClose={() => {}} titleId="t" title="Closed" closeLabel="x"><p>Body</p></ModalFrame>);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('FullScreenFrame shows eyebrow, title, actions and one close button', () => {
        const onClose = vi.fn();
        render(
            <FullScreenFrame isOpen onClose={onClose} titleId="f" eyebrow="Area" title="Panel" description="About" closeLabel="Close panel" actions={<button>Export</button>}>
                <p>Content</p>
            </FullScreenFrame>,
        );
        expect(screen.getByRole('dialog', { name: 'Panel' })).toBeInTheDocument();
        expect(screen.getByText('Area')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('FullScreenFrame supports an aria-label with a custom header', () => {
        render(
            <FullScreenFrame isOpen onClose={() => {}} titleId="f" ariaLabel="Diagnostic logs" header={<header><button>Own close</button></header>}>
                <p>Content</p>
            </FullScreenFrame>,
        );
        expect(screen.getByRole('dialog', { name: 'Diagnostic logs' })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
    });
});
