/**
 * PERF-303: Isolated card grid component that only re-renders when card IDs,
 * skeleton count, or layout props change. Prevents card list from re-rendering
 * when unrelated state (aiTaskStatus, reportGenerationProgress) changes in
 * the parent AnalysisPanel.
 */
import React, { memo } from 'react';
import Masonry from 'react-masonry-css';
import { ErrorBoundary } from '../ErrorBoundary';
import { AnalysisCard } from '../analysis-card/AnalysisCard';
import { SkeletonCard } from '../analysis-card/SkeletonCard';

interface AnalysisCardGridProps {
    cardIds: string[];
    skeletonCount: number;
    columnCount: number;
    spotlightCardId: string | null;
    expandOverrideKey: number;
    expandOverrideValue: boolean;
    showExplorationControls: boolean;
}

export const AnalysisCardGrid: React.FC<AnalysisCardGridProps> = memo(({
    cardIds,
    skeletonCount,
    columnCount,
    spotlightCardId,
    expandOverrideKey,
    expandOverrideValue,
    showExplorationControls,
}) => (
    <Masonry
        breakpointCols={columnCount}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
    >
        {cardIds.map((cardId, index) => (
            <div
                key={cardId}
                data-card-id={cardId}
                className="mb-6 animate-fade-in"
                style={{ animationDelay: `${Math.min(index, 5) * 50}ms` }}
            >
                <ErrorBoundary>
                    <AnalysisCard
                        cardId={cardId}
                        isSpotlighted={cardId === spotlightCardId}
                        expandOverrideKey={expandOverrideKey}
                        expandOverrideValue={expandOverrideValue}
                        showExplorationControls={showExplorationControls}
                    />
                </ErrorBoundary>
            </div>
        ))}
        {Array.from({ length: skeletonCount }).map((_, index) => (
            <div key={`skeleton-${index}`} className="mb-6">
                <SkeletonCard />
            </div>
        ))}
    </Masonry>
));

AnalysisCardGrid.displayName = 'AnalysisCardGrid';
