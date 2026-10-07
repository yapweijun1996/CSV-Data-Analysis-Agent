import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppStore } from '../../store/useAppStore';

const CARD_SPOTLIGHT_DURATION_MS = 10000;
const INITIAL_VISIBLE_CARDS = 6;
const CARD_LOAD_INCREMENT = 4;

/**
 * Owns how many cards are rendered and which new card is highlighted:
 * progressive loading while scrolling, a short spotlight with auto-scroll for
 * small additions (chat follow-ups), and a reset when a new analysis starts.
 */
export const useCardWindow = (cards: AppStore['analysisCards']) => {
    const previousCardCountRef = useRef(cards.length);
    const hasMountedRef = useRef(false);
    const spotlightTimeoutRef = useRef<number | null>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    const [spotlightCardId, setSpotlightCardId] = useState<string | null>(null);
    const [visibleCardCount, setVisibleCardCount] = useState(INITIAL_VISIBLE_CARDS);

    // PERF-306: Stabilize cardIds reference — only recompute when the card list
    // actually changes (by ID), so AnalysisCardGrid's memo is not invalidated by
    // unrelated state changes.
    const prevCardIdsRef = useRef<string[]>([]);
    const stableCardIds = useMemo(() => {
        const nextIds = cards.slice(0, visibleCardCount).map(card => card.id);
        const prev = prevCardIdsRef.current;
        if (nextIds.length === prev.length && nextIds.every((id, index) => id === prev[index])) {
            return prev;
        }
        prevCardIdsRef.current = nextIds;
        return nextIds;
    }, [cards, visibleCardCount]);

    // Reset visible card count when a new analysis starts (cards drop to 0 then grow)
    useEffect(() => {
        if (cards.length === 0) {
            setVisibleCardCount(INITIAL_VISIBLE_CARDS);
        }
    }, [cards.length]);

    // Spotlight new cards and auto-scroll for follow-up additions
    useEffect(() => {
        const previousCardCount = previousCardCountRef.current;
        previousCardCountRef.current = cards.length;

        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        if (cards.length === 0 || cards.length <= previousCardCount) {
            return;
        }

        // Ensure newly added cards are within the visible window
        setVisibleCardCount(prev => Math.max(prev, cards.length));

        const newestCardId = cards[0].id;
        setSpotlightCardId(newestCardId);

        // Auto-scroll for small additions (chat follow-up, group-by create card).
        // Skip large batches (initial auto-analysis) to avoid a jarring scroll.
        const addedCount = cards.length - previousCardCount;
        if (addedCount <= 2) {
            requestAnimationFrame(() => {
                const element = document.querySelector(`[data-card-id="${newestCardId}"]`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }

        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }

        spotlightTimeoutRef.current = window.setTimeout(() => {
            setSpotlightCardId(current => (current === newestCardId ? null : current));
            spotlightTimeoutRef.current = null;
        }, CARD_SPOTLIGHT_DURATION_MS);
    }, [cards]);

    // Progressive loading: observe a sentinel element to load more cards on scroll
    useEffect(() => {
        const sentinel = loadMoreSentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) {
                setVisibleCardCount(prev => prev + CARD_LOAD_INCREMENT);
            }
        }, { rootMargin: '200px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    useEffect(() => () => {
        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }
    }, []);

    return { stableCardIds, visibleCardCount, spotlightCardId, loadMoreSentinelRef };
};
