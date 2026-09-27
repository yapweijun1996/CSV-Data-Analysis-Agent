import { RefObject, useEffect, useRef, useState } from 'react';
import { APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT } from '../utils/cardNavigation';

type UseAutoHideHeaderOptions = {
    scrollContainerRef: RefObject<HTMLElement | null>;
};

type UseAutoHideHeaderResult = {
    headerRef: RefObject<HTMLElement | null>;
    headerHeight: number;
    isHeaderHidden: boolean;
};

const SCROLL_DELTA_THRESHOLD = 10;
const TOP_REVEAL_THRESHOLD = 12;

export const useAutoHideHeader = ({
    scrollContainerRef,
}: UseAutoHideHeaderOptions): UseAutoHideHeaderResult => {
    const headerRef = useRef<HTMLElement | null>(null);
    const lastScrollTopRef = useRef(0);
    const forcedHiddenTimeoutRef = useRef<number | null>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [isHeaderHidden, setIsHeaderHidden] = useState(false);

    useEffect(() => {
        const headerElement = headerRef.current;
        if (!headerElement) {
            return;
        }

        const updateHeaderHeight = () => {
            setHeaderHeight(headerElement.getBoundingClientRect().height);
        };

        updateHeaderHeight();

        const resizeObserver = new ResizeObserver(() => {
            updateHeaderHeight();
        });

        resizeObserver.observe(headerElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const handleTemporaryHide = (event: Event) => {
            const customEvent = event as CustomEvent<{ durationMs?: number }>;
            const durationMs = customEvent.detail?.durationMs ?? 1200;

            if (forcedHiddenTimeoutRef.current !== null) {
                window.clearTimeout(forcedHiddenTimeoutRef.current);
            }

            setIsHeaderHidden(true);
            forcedHiddenTimeoutRef.current = window.setTimeout(() => {
                setIsHeaderHidden(false);
                forcedHiddenTimeoutRef.current = null;
            }, durationMs);
        };

        window.addEventListener(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, handleTemporaryHide);
        return () => {
            window.removeEventListener(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, handleTemporaryHide);
            if (forcedHiddenTimeoutRef.current !== null) {
                window.clearTimeout(forcedHiddenTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const scrollElement = scrollContainerRef.current;
        if (!scrollElement) {
            return;
        }

        const onScroll = () => {
            const scrollTop = scrollElement.scrollTop;
            const delta = scrollTop - lastScrollTopRef.current;

            if (forcedHiddenTimeoutRef.current !== null) {
                lastScrollTopRef.current = scrollTop;
                return;
            }

            if (scrollTop <= TOP_REVEAL_THRESHOLD) {
                setIsHeaderHidden(false);
                lastScrollTopRef.current = scrollTop;
                return;
            }

            if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) {
                return;
            }

            if (delta > 0 && scrollTop > headerHeight) {
                setIsHeaderHidden(true);
            } else if (delta < 0) {
                setIsHeaderHidden(false);
            }

            lastScrollTopRef.current = scrollTop;
        };

        lastScrollTopRef.current = scrollElement.scrollTop;
        scrollElement.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            scrollElement.removeEventListener('scroll', onScroll);
        };
    }, [headerHeight, scrollContainerRef]);

    return {
        headerRef,
        headerHeight,
        isHeaderHidden,
    };
};
