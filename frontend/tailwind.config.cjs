const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
/* SSOT: every colour comes from a CSS custom property defined in index.css (RGB channels). */
const tokenScale = (name) => Object.fromEntries(
    STEPS.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]),
);
const accent = tokenScale('accent');

module.exports = {
    content: [
        './index.html',
        './App.tsx',
        './index.tsx',
        './components/**/*.{ts,tsx}',
        './icons/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
        './store/**/*.{ts,tsx}',
        './utils/**/*.{ts,tsx}',
    ],
    theme: {
        /* Typography scale — base: 12px (standard) — overrides Tailwind defaults */
        fontSize: {
            '2xs': ['10px', { lineHeight: '14px' }],   /* fine print, micro badges */
            'xs':  ['11px', { lineHeight: '16px' }],    /* standard - 1: captions, secondary labels */
            'sm':  ['12px', { lineHeight: '18px' }],    /* STANDARD: body text */
            'base':['13px', { lineHeight: '20px' }],    /* standard + 1: emphasized body */
            'md':  ['14px', { lineHeight: '20px' }],    /* standard + 2: sub-headings */
            'lg':  ['16px', { lineHeight: '24px' }],    /* card titles, section headings */
            'xl':  ['18px', { lineHeight: '26px' }],    /* panel titles, major headings */
            '2xl': ['20px', { lineHeight: '28px' }],    /* page title */
            '3xl': ['24px', { lineHeight: '32px' }],    /* hero (rarely used) */
        },
        extend: {
            gradientColorStops: { white: 'rgb(var(--surface) / <alpha-value>)' },
            ringOffsetColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
            backgroundColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
            borderColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
            borderRadius: {
                card: '10px',
            },
            colors: {
                accent,
                scrim: 'rgb(var(--scrim) / <alpha-value>)',
                ink: {
                    100: 'rgb(241 245 249 / <alpha-value>)',
                    200: 'rgb(226 232 240 / <alpha-value>)',
                    300: 'rgb(203 213 225 / <alpha-value>)',
                    800: 'rgb(30 41 59 / <alpha-value>)',
                    900: 'rgb(15 23 42 / <alpha-value>)',
                    950: 'rgb(2 6 23 / <alpha-value>)',
                },
                /* Legacy utility names resolve to the themed accent so existing classes follow the palette. */
                blue: accent,
                indigo: accent,
                violet: accent,
                gray: tokenScale('neutral'),
                info: tokenScale('info'),
                sky: tokenScale('info'),
                emerald: tokenScale('success'),
                rose: tokenScale('danger'),
                yellow: tokenScale('warning'),
                slate: tokenScale('neutral'),
                danger: tokenScale('danger'),
                red: tokenScale('danger'),
                success: tokenScale('success'),
                green: tokenScale('success'),
                warning: tokenScale('warning'),
                amber: tokenScale('warning'),
                'brand-primary': 'rgb(var(--accent-600) / <alpha-value>)',
                'brand-secondary': 'rgb(var(--accent-500) / <alpha-value>)',
            },
            animation: {
                'loading-shimmer': 'loading-shimmer 2s infinite linear',
                'fade-in': 'fade-in 0.5s ease-out forwards',
                spin: 'spin 1s linear infinite',
            },
            keyframes: {
                'loading-shimmer': {
                    '0%': { 'background-position': '-200% 0' },
                    '100%': { 'background-position': '200% 0' },
                },
                'fade-in': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                spin: {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                },
            },
        },
    },
};
