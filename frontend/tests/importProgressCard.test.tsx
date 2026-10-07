// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportProgressCard } from '../components/ImportProgressCard';

const baseProps = {
    language: 'English' as const,
    fileName: 'singapore-hdb-resale-prices.csv',
    title: 'Importing data',
    detail: 'Large-file mode: loading the original CSV directly into the local query engine…',
    tone: 'info' as const,
    stage: 'parse' as const,
    providerLabel: 'default',
};

describe('ImportProgressCard', () => {
    afterEach(cleanup);

    it('shows the file, the live status line and both privacy cards', () => {
        render(<ImportProgressCard {...baseProps} />);

        expect(screen.getByText('Importing data')).toBeTruthy();
        expect(screen.getByText('Preparing singapore-hdb-resale-prices.csv')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('loading the original CSV');
        expect(screen.getByText('Processed locally')).toBeTruthy();
        expect(screen.getByText('AI protected')).toBeTruthy();
    });

    it('marks upload done, the current stage active and later stages waiting', () => {
        const { rerender } = render(<ImportProgressCard {...baseProps} stage="parse" />);
        const steps = () => screen.getAllByRole('listitem');

        expect(steps()[1].getAttribute('aria-current')).toBe('step');
        expect(steps()[2].getAttribute('aria-current')).toBeNull();

        rerender(<ImportProgressCard {...baseProps} stage="analyse" />);
        expect(steps()[2].getAttribute('aria-current')).toBe('step');
    });

    it('never claims a percentage, row count or ETA it does not have', () => {
        const { container } = render(<ImportProgressCard {...baseProps} />);
        expect(container.textContent).not.toMatch(/\d+\s*%|rows processed|remaining/i);
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
    });

    it('reveals technical details on demand and opens diagnostics', () => {
        const onOpenLogs = vi.fn();
        render(<ImportProgressCard {...baseProps} onOpenLogs={onOpenLogs} />);

        expect(screen.queryByText('Local query engine')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Technical details/ }));
        expect(screen.getByText('Local query engine')).toBeTruthy();
        expect(screen.getByText('CSV')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'View technical details' }));
        expect(onOpenLogs).toHaveBeenCalledOnce();
    });

    it('hides the stepper and keeps the error text visible on failure', () => {
        render(<ImportProgressCard {...baseProps} tone="error" detail="Import failed" />);
        expect(screen.queryByRole('list')).toBeNull();
        expect(screen.getByText('Import failed')).toBeTruthy();
    });
});
