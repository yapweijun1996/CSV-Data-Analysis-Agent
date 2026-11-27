import React from 'react';

interface IconBugProps {
    className?: string;
}

export const IconBug: React.FC<IconBugProps> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5M8 8h8a2 2 0 0 1 2 2v3.5a6 6 0 0 1-12 0V10a2 2 0 0 1 2-2Zm4 0v11.5M3 12h3m12 0h3M4 6.5l2.5 2M20 6.5l-2.5 2M4 19l2.5-2M20 19l-2.5-2"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
