const APP_MAIN_SCROLL_CONTAINER_ID = 'app-main-scroll-container';
const CARD_NAVIGATION_HEADER_GAP_PX = 16;
const CARD_HIGHLIGHT_DURATION_MS = 2500;
const CARD_HIGHLIGHT_CLASSES = ['ring-4', 'ring-blue-500', 'transition-all', 'duration-500'] as const;

export const APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT = 'app:hide-header-for-card-navigation';

type NavigateToCardOptions = {
    highlight?: boolean;
    hideHeader?: boolean;
    headerHideDurationMs?: number;
};

const getMainScrollContainer = (): HTMLElement | null =>
    document.getElementById(APP_MAIN_SCROLL_CONTAINER_ID);

const getAppHeaderElement = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-app-header-root="true"]');

const scrollCardIntoTitleView = (element: HTMLElement) => {
    const scrollContainer = getMainScrollContainer();

    if (!scrollContainer) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const headerHeight = getAppHeaderElement()?.getBoundingClientRect().height ?? 0;
    const targetTop = scrollContainer.scrollTop
        + (elementRect.top - containerRect.top)
        - headerHeight
        - CARD_NAVIGATION_HEADER_GAP_PX;

    scrollContainer.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
    });
};

const highlightCardElement = (element: HTMLElement) => {
    element.classList.add(...CARD_HIGHLIGHT_CLASSES);
    window.setTimeout(() => {
        element.classList.remove(...CARD_HIGHLIGHT_CLASSES);
    }, CARD_HIGHLIGHT_DURATION_MS);
};

const requestTemporaryHeaderHide = (durationMs: number) => {
    window.dispatchEvent(new CustomEvent(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, {
        detail: { durationMs },
    }));
};

export const navigateToCard = (
    cardId: string,
    {
        highlight = true,
        hideHeader = true,
        headerHideDurationMs = 1200,
    }: NavigateToCardOptions = {},
): boolean => {
    const element = document.getElementById(cardId);
    if (!element) {
        return false;
    }

    if (hideHeader) {
        requestTemporaryHeaderHide(headerHideDurationMs);
    }

    scrollCardIntoTitleView(element);

    if (highlight) {
        highlightCardElement(element);
    }

    return true;
};

const NARRATIVE_HIGHLIGHT_CLASSES = ['ring-2', 'ring-blue-400', 'rounded-lg', 'bg-blue-50/50', 'transition-all', 'duration-500'] as const;

/**
 * Navigate to a card's AI Narrative section — auto-expand, scroll into view, highlight.
 * Dispatches a custom event to force the narrative section open, then scrolls to it.
 */
export const navigateToCardNarrative = (cardId: string): boolean => {
    // Step 1: Dispatch event to auto-expand the narrative section in React
    window.dispatchEvent(new CustomEvent('card:expand-narrative', { detail: { cardId } }));

    // Step 2: Wait for React to render the expanded narrative, then scroll + highlight
    window.setTimeout(() => {
        const narrativeEl = document.getElementById(`narrative-${cardId}`);
        if (narrativeEl) {
            const scrollContainer = getMainScrollContainer();
            if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const elementRect = narrativeEl.getBoundingClientRect();
                const headerHeight = getAppHeaderElement()?.getBoundingClientRect().height ?? 0;
                const targetTop = scrollContainer.scrollTop
                    + (elementRect.top - containerRect.top)
                    - headerHeight
                    - CARD_NAVIGATION_HEADER_GAP_PX;
                scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
            } else {
                narrativeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            narrativeEl.classList.add(...NARRATIVE_HIGHLIGHT_CLASSES);
            window.setTimeout(() => {
                narrativeEl.classList.remove(...NARRATIVE_HIGHLIGHT_CLASSES);
            }, CARD_HIGHLIGHT_DURATION_MS);
            return;
        }
        // Fallback: navigate to card if narrative still not in DOM
        navigateToCard(cardId);
    }, 300);
    return true;
};
