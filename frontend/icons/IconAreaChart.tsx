import React from 'react';

export const IconAreaChart: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
        <path fillRule="evenodd" d="M3 17V7l4 3 3-5 4 2 3-4v14H3zm4-7.5L3 6.5V17h14V4.5l-3 4-4-2-3 5z" clipRule="evenodd" />
        <path d="M3 17V9.5l4 3 3-5 4 2 3-4V17H3z" opacity="0.3" />
    </svg>
);
