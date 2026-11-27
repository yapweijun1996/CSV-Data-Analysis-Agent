import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReasoningBlock } from '../components/chat/ReasoningBlock';

describe('ReasoningBlock', () => {
    it('renders markdown instead of raw asterisks', () => {
        render(<ReasoningBlock text={'**Analyzing Data**\n\nSome text with `code`.'} language="en" live />);
        const body = screen.getByTestId('reasoning-body');
        expect(body.textContent).toContain('Analyzing Data');
        expect(body.textContent).not.toContain('**');
        expect(body.querySelector('h5')).not.toBeNull();
    });
});
