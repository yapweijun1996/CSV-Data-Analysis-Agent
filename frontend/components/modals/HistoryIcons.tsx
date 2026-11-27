import React from 'react';

// Inline SVG assets for the Analysis History modal. Kept dependency-free so they ship in the main bundle.

export const HistoryStackIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
        <path d="m3 12 9 4.5 9-4.5" />
        <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
);

export const HistorySearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
    </svg>
);

export const HistoryTrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
);

export const HistoryPlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M7 5v14l12-7L7 5Z" />
    </svg>
);

export const HistoryChartIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
);

export const HistoryChevronIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M6 8l4 4 4-4" />
    </svg>
);

export type CsvTone = 'green' | 'blue' | 'violet';

const CSV_TONES: Record<CsvTone, { top: string; bottom: string; fold: string }> = {
    green: { top: '#34d399', bottom: '#059669', fold: '#a7f3d0' },
    blue: { top: '#60a5fa', bottom: '#2563eb', fold: '#bfdbfe' },
    violet: { top: '#a78bfa', bottom: '#7c3aed', fold: '#ddd6fe' },
};

/** Deterministic tone per file name so a dataset keeps its colour across renders. */
export const csvToneFor = (name: string): CsvTone => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return (['green', 'blue', 'violet'] as const)[hash % 3];
};

export const CsvFileIcon: React.FC<{ tone: CsvTone; className?: string }> = ({ tone, className }) => {
    const c = CSV_TONES[tone];
    const gid = `csv-grad-${tone}`;
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" className={className} aria-hidden="true">
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={c.top} />
                    <stop offset="1" stopColor={c.bottom} />
                </linearGradient>
            </defs>
            <path d="M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#fff" stroke={c.bottom} strokeOpacity=".35" strokeWidth="1.5" />
            <path d="M26 2v8a2 2 0 0 0 2 2h8L26 2Z" fill={c.fold} />
            <rect x="2" y="24" width="30" height="14" rx="3" fill={`url(#${gid})`} />
            <text x="17" y="34.2" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">CSV</text>
        </svg>
    );
};
