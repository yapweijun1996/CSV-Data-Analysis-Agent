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
            borderRadius: {
                card: '10px',
            },
            colors: {
                'brand-primary': '#2563eb',
                'brand-secondary': '#3b82f6',
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
