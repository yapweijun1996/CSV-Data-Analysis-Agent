import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CredibilityBanner } from '../components/dashboard/CredibilityBanner';

describe('CredibilityBanner', () => {
    afterEach(() => cleanup());

    it('does not direct users to verified cards when none exist', () => {
        render(
            <CredibilityBanner
                overallVerdict="caveated"
                trustedCount={0}
                caveatedCount={3}
                weakCount={0}
                language="English"
            />,
        );

        expect(screen.getByText(
            '0 verified, 3 need review — review these cards and data warnings before using the findings.',
        )).toBeTruthy();
        expect(screen.queryByText(/start with verified cards/i)).toBeNull();
    });

    it('keeps the verified-first guidance when trusted cards exist', () => {
        render(
            <CredibilityBanner
                overallVerdict="caveated"
                trustedCount={2}
                caveatedCount={1}
                weakCount={0}
                language="English"
            />,
        );

        expect(screen.getByText(
            '2 verified, 1 need review — start with verified cards.',
        )).toBeTruthy();
    });

    it('does not claim unrestricted use when the run completed with data caveats', () => {
        render(
            <CredibilityBanner
                overallVerdict="trusted"
                trustedCount={5}
                caveatedCount={0}
                weakCount={0}
                hasRunCaveats
                language="English"
            />,
        );

        expect(screen.getByText('Results ready with limitations')).toBeTruthy();
        expect(screen.getByText(/data-quality limitations remain/i)).toBeTruthy();
        expect(screen.queryByText(/use these findings directly/i)).toBeNull();
    });
});
