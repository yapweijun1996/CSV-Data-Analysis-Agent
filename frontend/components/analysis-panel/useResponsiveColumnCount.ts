import { useEffect, useState, type RefObject } from 'react';

// Panel widths (px) at which the card grid switches from one to two to three columns.
const BREAKPOINTS = {
    oneCol: 900,
    twoCols: 1350,
};

const calculateColumnCount = (width: number) => {
    if (width < BREAKPOINTS.oneCol) return 1;
    if (width < BREAKPOINTS.twoCols) return 2;
    return 3;
};

/** Tracks how many card columns fit the measured panel width. */
export const useResponsiveColumnCount = (panelRef: RefObject<HTMLElement | null>): number => {
    const [columnCount, setColumnCount] = useState(3);

    useEffect(() => {
        // Ensure ResizeObserver is available before using it
        if (typeof ResizeObserver === 'undefined') {
            console.warn('ResizeObserver not supported; layout may not be responsive to panel resizing.');
            return;
        }

        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const next = calculateColumnCount(entries[0].contentRect.width);
                // Only update when the count actually changes to avoid unnecessary re-renders
                setColumnCount(prev => (prev === next ? prev : next));
            }
        });

        const currentPanel = panelRef.current;
        if (currentPanel) {
            setColumnCount(calculateColumnCount(currentPanel.offsetWidth));
            observer.observe(currentPanel);
        }

        return () => {
            if (currentPanel) {
                observer.unobserve(currentPanel);
            }
        };
    }, [panelRef]);

    return columnCount;
};
