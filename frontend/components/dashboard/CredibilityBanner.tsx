import React from 'react';
import { getTranslation } from '../../utils/localization';
type CredibilityVerdict = 'trusted' | 'caveated' | 'weak';

export interface CredibilityBannerProps {
    overallVerdict: CredibilityVerdict;
    trustedCount: number;
    caveatedCount: number;
    weakCount: number;
    hasRunCaveats?: boolean;
    language: string;
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
}> = {
    trusted: {
        titleKey: 'credibility_ready',
        hintKey: 'credibility_ready_hint',
        border: 'border-emerald-200',
        bg: 'bg-emerald-50',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        titleColor: 'text-emerald-900',
        hintColor: 'text-emerald-700',
    },
    caveated: {
        titleKey: 'credibility_review',
        hintKey: 'credibility_review_hint',
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        titleColor: 'text-amber-900',
        hintColor: 'text-amber-700',
    },
    weak: {
        titleKey: 'credibility_insufficient',
        hintKey: 'credibility_insufficient_hint',
        border: 'border-red-200',
        bg: 'bg-red-50',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        titleColor: 'text-red-900',
        hintColor: 'text-red-700',
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
    language,
}) => {
    const effectiveVerdict = overallVerdict === 'trusted' && hasRunCaveats
        ? 'caveated'
        : overallVerdict;
    const config = TIER_CONFIG[effectiveVerdict];
    const title = getTranslation(
        overallVerdict === 'trusted' && hasRunCaveats
            ? 'credibility_ready_with_caveats'
            : config.titleKey,
        language,
    );
    const reviewCount = caveatedCount + weakCount;
    const hintKey = overallVerdict === 'trusted' && hasRunCaveats
        ? 'credibility_ready_with_caveats_hint'
        : overallVerdict === 'caveated' && trustedCount === 0
            ? 'credibility_review_hint_no_verified'
            : config.hintKey;
    const hint = getTranslation(hintKey, language, {
        trusted: String(trustedCount),
        review: String(reviewCount),
    });

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
                </div>
            </div>
        </div>
    );
};
