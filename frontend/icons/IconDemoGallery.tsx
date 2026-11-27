import React from 'react';
import type { DemoDatasetTheme } from '../services/data/demoDatasetCatalog';

type SvgProps = React.SVGProps<SVGSVGElement>;

const base = (className: string | undefined, props: SvgProps): SvgProps => ({
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    className,
    ...props,
});

const THEME_PATHS: Record<DemoDatasetTheme, React.ReactNode> = {
    housing: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
    jobs: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />,
    business: <path d="M4 20V10l6-3v13M10 20V4l10 4v12M3 20h18M14 12h2M14 16h2" />,
    transport: <path d="M6 16V6a2 2 0 012-2h8a2 2 0 012 2v10M6 12h12M4 16h16v2H4zM8 20v-2M16 20v-2" />,
    tourism: <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
    environment: <path d="M5 19c0-8 5-13 15-14 0 9-5 14-13 14M5 19c2-5 5-8 9-10" />,
    population: <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1a5 5 0 0110 0v1M16 11a2.5 2.5 0 100-5M17 14.5a4.5 4.5 0 014 4.5v1" />,
};

/** Category glyph for a demo dataset card. Falls back to a generic table when the theme is unknown. */
export const IconDemoTheme: React.FC<SvgProps & { theme: DemoDatasetTheme | null }> = ({ theme, className = 'h-3.5 w-3.5', ...props }) => (
    <svg {...base(className, props)}>
        {theme ? THEME_PATHS[theme] : <path d="M4 5h16v14H4zM4 10h16M10 5v14" />}
    </svg>
);

export const IconBolt: React.FC<SvgProps> = ({ className = 'h-3 w-3', ...props }) => (
    <svg {...base(className, props)}><path d="M13 3L5 13h6l-1 8 8-10h-6z" /></svg>
);

export const IconClock: React.FC<SvgProps> = ({ className = 'h-3 w-3', ...props }) => (
    <svg {...base(className, props)}><path d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

export const IconExternalLink: React.FC<SvgProps> = ({ className = 'h-3 w-3', ...props }) => (
    <svg {...base(className, props)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
);

export const IconSparkChart: React.FC<SvgProps> = ({ className = 'h-4 w-4', ...props }) => (
    <svg {...base(className, props)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);

export const IconBrain: React.FC<SvgProps> = ({ className = 'h-3.5 w-3.5', ...props }) => (
    <svg {...base(className, props)}>
        <path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 1V5a2 2 0 00-3-1zM15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 1V5a2 2 0 013-1z" />
    </svg>
);
