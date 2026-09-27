import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface CardMentionItem {
    id: string;
    title: string;
    chartType: string;
}

interface CardMentionPopupProps {
    cards: CardMentionItem[];
    query: string;
    onSelect: (card: CardMentionItem) => void;
    onClose: () => void;
}

// No artificial limit — popup uses max-h with overflow scroll

const chartTypeLabel = (t: string): string => {
    const map: Record<string, string> = {
        bar: 'Bar', column: 'Bar', line: 'Line', pie: 'Pie', doughnut: 'Pie',
        scatter: 'Dot', radar: 'Radar', area: 'Area', stacked_bar: 'Stack', stacked_column: 'Stack',
        combo: 'Combo', bubble: 'Dot', polar_area: 'Polar', pivot_matrix: 'Pivot',
    };
    return map[t] ?? '';
};

export const CardMentionPopup: React.FC<CardMentionPopupProps> = ({
    cards, query, onSelect, onClose,
}) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    const filtered = cards.filter(c =>
        c.title.toLowerCase().includes(query.toLowerCase()),
    );

    // Reset active index when filter changes
    useEffect(() => { setActiveIndex(0); }, [query]);

    // Scroll active item into view
    useEffect(() => {
        const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (filtered.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => (i + 1) % filtered.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => (i - 1 + filtered.length) % filtered.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onSelect(filtered[activeIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    }, [filtered, activeIndex, onSelect, onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [handleKeyDown]);

    if (filtered.length === 0) {
        return (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-400 shadow-lg">
                No matching cards
            </div>
        );
    }

    return (
        <ul
            ref={listRef}
            role="listbox"
            className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
            {filtered.map((card, i) => (
                <li
                    key={card.id}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => { e.preventDefault(); onSelect(card); }}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        i === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <span className="flex-shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">{chartTypeLabel(card.chartType)}</span>
                    <span className="truncate">{card.title}</span>
                </li>
            ))}
        </ul>
    );
};
