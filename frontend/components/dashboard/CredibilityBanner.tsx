import React from 'react';
import { getTranslation } from '../../utils/localization';
type CredibilityVerdict = 'trusted' | 'caveated' | 'weak';

export interface CredibilityBannerProps {
    overallVerdict: CredibilityVerdict;
    trustedCount: number;
    caveatedCount: number;
    weakCount: number;
    hasRunCaveats?: boolean;
    /** Research questions in the run; the banner states the gap when some could not be answered. */
    questionCount?: number;
    answeredQuestionCount?: number;
    unsupportedQuestionCount?: number;
    language: string;
    /** Shown when the current view hides every card the hint asks the user to review. */
    reviewActionLabel?: string;
    onReviewAction?: () => void;
}

const TIER_CONFIG: Record<CredibilityVerdict, {
    titleKey: string;
    hintKey: string;
    border: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    hintColor: string;
    /** The review action is the main control of the banner, so it is a filled button. */
    button: string;
}> = {
    trusted: {
        titleKey: 'credibility_ready',
        hintKey: 'credibility_ready_hint',
        border: 'border-success-200',
        bg: 'bg-success-50',
        iconBg: 'bg-success-100',
        iconColor: 'text-success-600',
        titleColor: 'text-success-900',
        hintColor: 'text-success-700',
        button: 'border-success-700 bg-success-700 text-white hover:bg-success-800',
    },
    caveated: {
        titleKey: 'credibility_review',
        hintKey: 'credibility_review_hint',
        border: 'border-warning-200',
        bg: 'bg-warning-50',
        iconBg: 'bg-warning-100',
        iconColor: 'text-warning-600',
        titleColor: 'text-warning-900',
        hintColor: 'text-warning-700',
        button: 'border-warning-700 bg-warning-700 text-white hover:bg-warning-800',
    },
    weak: {
        titleKey: 'credibility_insufficient',
        hintKey: 'credibility_insufficient_hint',
        border: 'border-danger-200',
        bg: 'bg-danger-50',
        iconBg: 'bg-danger-100',
        iconColor: 'text-danger-600',
        titleColor: 'text-danger-900',
        hintColor: 'text-danger-700',
        button: 'border-danger-700 bg-danger-700 text-white hover:bg-danger-800',
    },
};

const CheckIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
);

const AlertIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
);

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
    </svg>
);

export const CredibilityBanner: React.FC<CredibilityBannerProps> = ({
    overallVerdict,
    trustedCount,
    caveatedCount,
    weakCount,
    hasRunCaveats = false,
    questionCount = 0,
    answeredQuestionCount = 0,
    unsupportedQuestionCount = 0,
    language,
    reviewActionLabel,
    onReviewAction,
}) => {
    // Green means nothing is missing. A question the data could not answer is missing,
    // so the banner states the gap instead of saying every card passed.
    const hasUnsupportedQuestions = unsupportedQuestionCount > 0 && questionCount > 0;
    const isPartialAnswer = overallVerdict === 'trusted' && hasUnsupportedQuestions;
    const effectiveVerdict = overallVerdict === 'trusted' && (hasRunCaveats || isPartialAnswer)
        ? 'caveated'
        : overallVerdict;
    const config = TIER_CONFIG[effectiveVerdict];
    const reviewCount = caveatedCount + weakCount;
    const title = isPartialAnswer
        ? getTranslation(questionCount === 1 ? 'credibility_partial_title_one' : 'credibility_partial_title', language, {
            answered: String(answeredQuestionCount),
            total: String(questionCount),
        })
        : getTranslation(
            overallVerdict === 'trusted' && hasRunCaveats
                ? 'credibility_ready_with_caveats'
                : config.titleKey,
            language,
        );
    const hintKey = isPartialAnswer
        ? (unsupportedQuestionCount === 1 ? 'credibility_partial_hint_one' : 'credibility_partial_hint_many')
        : overallVerdict === 'trusted' && hasRunCaveats
            ? 'credibility_ready_with_caveats_hint'
            : overallVerdict === 'caveated' && trustedCount === 0
                ? 'credibility_review_hint_no_verified'
                : config.hintKey;
    const baseHint = getTranslation(hintKey, language, {
        trusted: String(trustedCount),
        review: String(reviewCount),
        unsupported: String(unsupportedQuestionCount),
    });
    const hint = isPartialAnswer && hasRunCaveats
        ? `${baseHint} ${getTranslation('credibility_partial_caveats_suffix', language)}`
        : baseHint;
    // Cards needing review already change the hint; the gap is named next to it.
    const gapNote = hasUnsupportedQuestions && !isPartialAnswer
        ? getTranslation(
            unsupportedQuestionCount === 1 ? 'credibility_unsupported_extra_one' : 'credibility_unsupported_extra_many',
            language,
            { count: String(unsupportedQuestionCount) },
        )
        : null;

    const Icon = effectiveVerdict === 'trusted' ? CheckIcon
        : effectiveVerdict === 'caveated' ? InfoIcon
        : AlertIcon;

    return (
        <div className={`rounded-xl border ${config.border} ${config.bg} p-4`} role="status">
            <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.iconBg} ${config.iconColor}`}>
                    <Icon />
                </span>
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${config.titleColor}`}>
                        {title}
                    </p>
                    <p className={`mt-1 text-xs leading-relaxed ${config.hintColor}`}>
                        {hint}
                    </p>
                    {gapNote && (
                        <p className={`mt-1 text-xs font-medium leading-relaxed ${config.hintColor}`}>
                            {gapNote}
                        </p>
                    )}
                    {reviewActionLabel && onReviewAction && (
                        <button
                            type="button"
                            onClick={onReviewAction}
                            className={`mt-3 inline-flex min-h-[44px] items-center rounded-lg border px-4 text-sm font-semibold shadow-sm transition-colors md:min-h-[36px] ${config.button}`}
                        >
                            {reviewActionLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
