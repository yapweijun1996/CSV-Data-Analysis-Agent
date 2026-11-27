import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;
const base = {
    xmlns: 'http://www.w3.org/2000/svg',
    className: 'h-5 w-5',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

/** Small stroke glyphs used by the Settings dialog sections. All inherit currentColor. */
export const IconEye: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-3.2 3.9M6.6 7.6A16 16 0 0 0 2.5 12S6 18.1 12 18.1c1.5 0 2.9-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
);
export const IconCopy: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></svg>
);
export const IconExternalLink: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M13.5 4.5h6v6M19.5 4.5 11 13M17.5 14v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" /></svg>
);
export const IconKey: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><circle cx="8" cy="15.5" r="4" /><path d="M10.9 12.6 20.5 3M16.5 7l3 3M14 9.5l2 2" /></svg>
);
export const IconLayers: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></svg>
);
export const IconChatBubble: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 4v-4H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeWidth={2.4} /></svg>
);
export const IconBars: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M4 20.5h16M6.5 20V13M12 20V4.5M17.5 20v-9" /></svg>
);
export const IconDatabase: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" /></svg>
);
export const IconBrain: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 2.8 3 3 0 0 0 1.2 2.4A3.2 3.2 0 0 0 6 15a3 3 0 0 0 3 4.5 2.5 2.5 0 0 0 3-2V6.5a2 2 0 0 0-3-2Z" /><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 2.8 3 3 0 0 1-1.2 2.4A3.2 3.2 0 0 1 18 15a3 3 0 0 1-3 4.5 2.5 2.5 0 0 1-3-2V6.5a2 2 0 0 1 3-2Z" /></svg>
);
export const IconSave: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M5 3.5h11l3.5 3.5v11.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M7.5 3.5v5h7v-5M7.5 20.5v-6h9v6" /></svg>
);
export const IconLink: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>
);
export const IconCheckCircle: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><circle cx="12" cy="12" r="9.5" /><path d="m7.8 12.4 3 3 5.4-6" /></svg>
);
export const IconAlertCircle: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5M12 16.4h.01" strokeWidth={2.4} /></svg>
);
export const IconChevronDown: React.FC<IconProps> = (props) => (
    <svg {...base} {...props}><path d="m6 9 6 6 6-6" /></svg>
);
