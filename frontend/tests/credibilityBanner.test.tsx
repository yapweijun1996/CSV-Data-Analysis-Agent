import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

    it('offers a way to the cards under review when the current view hides them', () => {
        const onReviewAction = vi.fn();
        render(
            <CredibilityBanner
                overallVerdict="caveated"
                trustedCount={0}
                caveatedCount={2}
                weakCount={0}
                language="English"
                reviewActionLabel="Show the 2 cards to review"
                onReviewAction={onReviewAction}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Show the 2 cards to review' }));
        expect(onReviewAction).toHaveBeenCalledTimes(1);
    });

    it('shows no review action unless the view asks for one', () => {
        render(
            <CredibilityBanner overallVerdict="caveated" trustedCount={0} caveatedCount={2} weakCount={0} language="English" />,
        );

        expect(screen.queryByRole('button')).toBeNull();
    });
    it('does not say "all cards passed" when a question could not be answered', () => {
        render(
            <CredibilityBanner
                overallVerdict="trusted"
                trustedCount={3}
                caveatedCount={0}
                weakCount={0}
                questionCount={4}
                answeredQuestionCount={3}
                unsupportedQuestionCount={1}
                language="English"
            />,
        );

        expect(screen.getByText('3 of 4 questions answered')).toBeTruthy();
        expect(screen.getByText(/1 could not be calculated from this data\./)).toBeTruthy();
        expect(screen.getByText(/the missing answer is not covered/)).toBeTruthy();
        expect(screen.queryByText(/All cards passed quality checks/i)).toBeNull();
        expect(screen.queryByText('Results ready to use')).toBeNull();
    });

    it('uses plural and singular forms for the unanswered questions', () => {
        const { rerender } = render(
            <CredibilityBanner overallVerdict="trusted" trustedCount={2} caveatedCount={0} weakCount={0}
                questionCount={4} answeredQuestionCount={2} unsupportedQuestionCount={2} language="English" />,
        );
        expect(screen.getByText(/2 could not be calculated from this data\..*the missing answers are not covered/)).toBeTruthy();

        rerender(
            <CredibilityBanner overallVerdict="trusted" trustedCount={0} caveatedCount={0} weakCount={0}
                questionCount={1} answeredQuestionCount={0} unsupportedQuestionCount={1} language="English" />,
        );
        expect(screen.getByText('0 of 1 question answered')).toBeTruthy();
    });

    it('names the gap next to the review hint when cards also need review', () => {
        render(
            <CredibilityBanner overallVerdict="caveated" trustedCount={2} caveatedCount={1} weakCount={0}
                questionCount={4} answeredQuestionCount={3} unsupportedQuestionCount={1} language="English" />,
        );

        expect(screen.getByText('2 verified, 1 need review — start with verified cards.')).toBeTruthy();
        expect(screen.getByText('1 question could not be calculated from this data.')).toBeTruthy();
    });

    it('keeps the data-quality caveat when the run was degraded and a question is missing', () => {
        render(
            <CredibilityBanner overallVerdict="trusted" trustedCount={3} caveatedCount={0} weakCount={0} hasRunCaveats
                questionCount={4} answeredQuestionCount={3} unsupportedQuestionCount={1} language="English" />,
        );

        expect(screen.getByText(/Data-quality limitations also remain/)).toBeTruthy();
    });

    it('states the gap in every language', () => {
        const expected: Record<string, string> = {
            English: '3 of 4 questions answered',
            Mandarin: '4 个问题中已回答 3 个',
            Japanese: '4 件の質問のうち 3 件に回答しました',
            Malay: '3 daripada 4 soalan telah dijawab',
        };
        for (const [language, title] of Object.entries(expected)) {
            const { unmount } = render(
                <CredibilityBanner overallVerdict="trusted" trustedCount={3} caveatedCount={0} weakCount={0}
                    questionCount={4} answeredQuestionCount={3} unsupportedQuestionCount={1} language={language} />,
            );
            expect(screen.getByText(title)).toBeTruthy();
            unmount();
        }
    });

    it('keeps the unconditional green banner when every question was answered', () => {
        render(
            <CredibilityBanner overallVerdict="trusted" trustedCount={4} caveatedCount={0} weakCount={0}
                questionCount={4} answeredQuestionCount={4} unsupportedQuestionCount={0} language="English" />,
        );

        expect(screen.getByText('Results ready to use')).toBeTruthy();
    });

    it('makes the review action the filled, primary control of the banner', () => {
        render(
            <CredibilityBanner overallVerdict="caveated" trustedCount={1} caveatedCount={4} weakCount={0} language="English"
                reviewActionLabel="Review the 4 cards" onReviewAction={() => undefined} />,
        );

        const button = screen.getByRole('button', { name: 'Review the 4 cards' });
        expect(button.className).toContain('text-white');
        expect(button.className).toMatch(/\bbg-warning-700\b/);
        expect(button.className).not.toContain('bg-white');
    });
});
