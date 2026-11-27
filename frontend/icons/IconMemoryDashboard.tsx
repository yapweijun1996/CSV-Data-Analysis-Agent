import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
    xmlns: 'http://www.w3.org/2000/svg',
    className: 'h-5 w-5',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
});

export const IconDatabase: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
        <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
);

export const IconAnalysisCard: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 17v-4M12 17V8M16 17v-6" />
    </svg>
);

export const IconNote: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
);

export const IconLayers: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 13 9 5 9-5" />
    </svg>
);

export const IconBookmark: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
);

export const IconCheckCircle: React.FC<IconProps> = (props) => (
    <svg {...base(props)} fill="currentColor" stroke="none">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm4.7-12.3a1 1 0 0 0-1.4-1.4L10.5 13.1 8.7 11.3a1 1 0 0 0-1.4 1.4l2.5 2.5a1 1 0 0 0 1.4 0z" />
    </svg>
);

export const IconAlertCircle: React.FC<IconProps> = (props) => (
    <svg {...base(props)}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
    </svg>
);

export const IconSpinner: React.FC<IconProps> = (props) => (
    <svg {...base(props)} className="h-5 w-5 animate-spin">
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
);

export const IconCopy: React.FC<IconProps> = (props) => (
    <svg {...base(props)} className="h-3.5 w-3.5">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
);
