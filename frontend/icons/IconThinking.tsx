import React from 'react';

const pulseStyle = (delayMs: number): React.CSSProperties => ({
    animationDelay: `${delayMs}ms`,
    animationDuration: '1.8s',
});

export const IconThinking: React.FC<React.SVGProps<SVGSVGElement>> = ({ className = 'h-5 w-5', ...props }) => (
    <svg
        aria-hidden="true"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <circle cx="12" cy="12" r="8.5" opacity="0.16" stroke="currentColor" strokeWidth="1.5" />
        <path
            d="M8 12a4 4 0 0 1 6.8-2.8"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
        />
        <path
            d="M16 12a4 4 0 0 1-6.8 2.8"
            opacity="0.45"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
        />
        <circle cx="15" cy="9.2" r="1.4" className="animate-pulse" fill="currentColor" style={pulseStyle(0)} />
        <circle cx="12.1" cy="12.1" r="1.25" className="animate-pulse" fill="currentColor" style={pulseStyle(180)} />
        <circle cx="9.1" cy="14.9" r="1.1" className="animate-pulse" fill="currentColor" style={pulseStyle(360)} />
        <path
            d="M17.4 5.7l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z"
            fill="currentColor"
            opacity="0.9"
        />
    </svg>
);
