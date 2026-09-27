import React from 'react';

export const IconBubbleChart: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
      <circle cx="10" cy="10" r="5" opacity="0.8" />
      <circle cx="4" cy="5" r="3" opacity="0.7" />
      <circle cx="16" cy="15" r="4" opacity="0.6" />
    </svg>
);