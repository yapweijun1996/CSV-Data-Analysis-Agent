import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

describe('MarkdownRenderer layout guards', () => {
    it('adds overflow-safe classes and language-aware highlighting for long paragraphs and code blocks', () => {
        const { container } = render(
            <MarkdownRenderer
                compact={true}
                content={'A long paragraph with `SeriesLabelL1` and a code block.\n\n```sql\nSELECT "Code", "Description" FROM "session_clean_dataset"\n```'}
            />,
        );

        const root = container.firstElementChild as HTMLElement | null;
        const paragraph = screen.getByText(/A long paragraph/i);
        const inlineCode = screen.getByText('SeriesLabelL1');
        const codeBlock = container.querySelector('pre');
        const codeNode = codeBlock?.querySelector('code');
        const codeLanguage = screen.getByText('sql');

        expect(root).toHaveClass('min-w-0');
        expect(paragraph).toHaveClass('break-words');
        expect(inlineCode).toHaveClass('break-all');
        expect(codeBlock).toHaveClass('max-w-full', 'overflow-x-auto');
        expect(codeNode).toHaveClass('block', 'min-w-max');
        expect(codeNode).toHaveClass('hljs', 'language-sql');
        expect(codeLanguage).toBeInTheDocument();
    });

    it('falls back to a plain code block for unknown languages', () => {
        const { container } = render(
            <MarkdownRenderer
                compact={true}
                content={'```brainfuck\n++>---\n```'}
            />,
        );

        const codeNode = container.querySelector('pre code');

        expect(screen.queryByText('brainfuck')).not.toBeInTheDocument();
        expect(codeNode).toHaveTextContent('++>---');
        expect(codeNode).not.toHaveClass('hljs');
    });

    it('fits a four-column evidence table inside the compact assistant panel', () => {
        const { container } = render(
            <MarkdownRenderer
                compact={true}
                content={'| Ad Name | Total Spend | Total Results | Cost per Result |\n| --- | --- | --- | --- |\n| A very long ad name | 57.04 | 48,891.00 | 0.0012 |'}
            />,
        );

        const table = container.querySelector('table');
        const firstHeader = screen.getByRole('columnheader', { name: 'Ad Name' });

        expect(table).toHaveClass('w-full', 'table-fixed', 'text-xs');
        expect(firstHeader).toHaveClass('w-[46%]', 'break-words');
        expect(screen.getByRole('columnheader', { name: 'Cost per Result' })).toBeVisible();
    });

    it('renders common provider math as readable text instead of raw LaTeX', () => {
        const { container } = render(
            <MarkdownRenderer
                compact={true}
                content={'$$\\text{Percentage} = \\left( \\frac{63,292,800}{72,954,278.87} \\right) \\times 100 \\approx \\mathbf{86.76\\%}$$'}
            />,
        );

        expect(container).toHaveTextContent('Percentage = ( 63,292,800 ÷ 72,954,278.87 ) × 100 ≈ 86.76%');
        expect(screen.getByText('86.76%')).toBeVisible();
        expect(screen.queryByText(/\\frac|\\mathbf|\$\$/)).not.toBeInTheDocument();
    });
});
