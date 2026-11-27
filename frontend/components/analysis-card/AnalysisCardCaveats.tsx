import React from 'react';
import type { EvidenceSampleSizeCaveat, Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { formatAnalysisMeasureValue, normalizeCategoryLabel } from '../../utils/analysisCardPresentation';
import type { TiedLeadingWindow } from '../../utils/rankedPresentation';

interface AnalysisCardCaveatsProps {
    sampleSizeCaveat?: EvidenceSampleSizeCaveat | null;
    tiedLeadingWindow?: TiedLeadingWindow | null;
    language: Settings['language'];
}

/**
 * Caveats a reader must see next to the ranking itself, in the compact and the
 * expanded card alike: a leader that rests on very few rows, and a shown window
 * whose values are all tied.
 */
const AnalysisCardCaveatsComponent: React.FC<AnalysisCardCaveatsProps> = ({ sampleSizeCaveat, tiedLeadingWindow, language }) => {
    const leaders = sampleSizeCaveat?.leaders ?? [];
    if (leaders.length === 0 && !tiedLeadingWindow) return null;
    return (
        <div className="flex flex-col gap-1 rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900" role="note" data-testid="analysis-card-caveats">
            {leaders.length > 0 && sampleSizeCaveat && (
                <p data-testid="analysis-card-caveat-small-group">
                    <b>{getTranslation('analysis_card_caveat_small_group_title', language)}</b>{' '}
                    {[
                        ...leaders.map(leader => getTranslation('analysis_card_caveat_small_group', language, {
                            label: normalizeCategoryLabel(leader.label),
                            rank: leader.rank,
                            rows: leader.rows.toLocaleString(),
                        })),
                        getTranslation('analysis_card_caveat_small_group_median', language, {
                            median: sampleSizeCaveat.medianGroupRows.toLocaleString(),
                        }),
                    ].join(' ')}
                </p>
            )}
            {tiedLeadingWindow && (
                <p data-testid="analysis-card-caveat-tied-window">
                    <b>{getTranslation('analysis_card_caveat_tied_window_title', language)}</b>{' '}
                    {getTranslation('analysis_card_caveat_tied_window', language, {
                        count: tiedLeadingWindow.count,
                        value: formatAnalysisMeasureValue(tiedLeadingWindow.value),
                        tied: tiedLeadingWindow.tiedGroupCount,
                        total: tiedLeadingWindow.totalGroupCount,
                    })}
                </p>
            )}
        </div>
    );
};

export const AnalysisCardCaveats = React.memo(AnalysisCardCaveatsComponent);
