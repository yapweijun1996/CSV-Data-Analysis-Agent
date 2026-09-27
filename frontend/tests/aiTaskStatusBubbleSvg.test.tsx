import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiTaskStatusBubble } from '../components/AiTaskStatusBubble';

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: { settings: { language: 'English' } }) => unknown) => selector({
        settings: { language: 'English' },
    }),
}));

describe('AiTaskStatusBubble status icon', () => {
    it('uses the SVG check icon for a completed analysis status', () => {
        const { container } = render(
            <AiTaskStatusBubble
                variant="compact"
                task={{
                    status: 'done',
                    title: 'Analysis ready with limitations',
                    subtitle: 'Review the evidence before use.',
                    currentStep: 9,
                    totalSteps: 9,
                }}
            />,
        );

        expect(screen.getByText('Analysis ready with limitations')).toBeInTheDocument();
        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container).not.toHaveTextContent('✅');
    });

    it.each([
        ['acting', '⚙️'],
        ['observing', '🔬'],
        ['error', '⚠️'],
    ] as const)('uses an SVG icon for %s status', (status, legacyEmoji) => {
        const { container } = render(
            <AiTaskStatusBubble
                variant="compact"
                task={{
                    status,
                    title: 'Analysis status',
                    subtitle: 'Status details',
                    currentStep: 1,
                    totalSteps: 1,
                }}
            />,
        );

        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container).not.toHaveTextContent(legacyEmoji);
    });
});
