import React from 'react';

export const IconPolarAreaChart: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
        <path d="M10 2a8 8 0 018 8h-8V2z" opacity="0.7" />
        <path d="M10 10h8a8 8 0 01-4 6.93L10 10z" opacity="0.5" />
        <path d="M14 16.93A8 8 0 012 10h8l4 6.93z" opacity="0.3" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
);
