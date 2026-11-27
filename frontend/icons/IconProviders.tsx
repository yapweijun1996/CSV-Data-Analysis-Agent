import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;
const frame = { xmlns: 'http://www.w3.org/2000/svg', className: 'h-5 w-5', viewBox: '0 0 24 24', 'aria-hidden': true as const };

/** Default (zero-config) provider: sparkles in the app accent colour. */
export const IconProviderDefault: React.FC<IconProps> = (props) => (
    <svg {...frame} fill="currentColor" {...props}>
        <path d="M9.5 3.5 11 9l5.5 1.5L11 12l-1.5 5.5L8 12 2.5 10.5 8 9l1.5-5.5Z" />
        <path d="m18 13 .9 2.9 2.9.9-2.9.9-.9 2.9-.9-2.9-2.9-.9 2.9-.9.9-2.9ZM18.5 2.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" />
    </svg>
);
/** Google "G" in the official four brand colours (brand colours are intentional, not theme tokens). */
export const IconProviderGoogle: React.FC<IconProps> = (props) => (
    <svg {...frame} {...props}>
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
);
/** OpenAI-style knot: six rounded strokes rotated around the centre. */
export const IconProviderOpenAI: React.FC<IconProps> = (props) => (
    <svg {...frame} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...props}>
        {[0, 60, 120, 180, 240, 300].map(angle => (
            <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 2.8 17.6 6v4.3L12 13.5" />
        ))}
    </svg>
);
/** Anthropic "A\" mark. */
export const IconProviderAnthropic: React.FC<IconProps> = (props) => (
    <svg {...frame} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M3 19.5 8.5 5l5.5 14.5M5.4 14.5h6.2M15 5l6 14.5" />
    </svg>
);
/** OpenRouter routing arrows. */
export const IconProviderOpenRouter: React.FC<IconProps> = (props) => (
    <svg {...frame} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M2.5 12h4.5c3 0 3.5-6 7-6h5M16.5 3l3 3-3 3M2.5 12h4.5c3 0 3.5 6 7 6h5M16.5 15l3 3-3 3" />
    </svg>
);
