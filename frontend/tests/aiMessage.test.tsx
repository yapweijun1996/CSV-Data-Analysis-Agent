import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiMessage, sanitizeAssistantDisplayText } from '../components/chat/AiMessage';

describe('AiMessage suggested actions', () => {
    it('keeps internal query implementation terms out of ordinary assistant text', () => {
        const text = sanitizeAssistantDisplayText(
            'SQL precheck kept cleaned.csv stable; review SQL evidence from DuckDB using trace ID 123.',
        );

        expect(text).toBe(
            'data readiness check kept prepared dataset stable; review query result from local query engine using technical reference 123.',
        );
        expect(text).not.toMatch(/SQL|DuckDB|cleaned\.csv|trace ID/i);
    });

    it('preserves Markdown block boundaries while sanitizing assistant text', () => {
        const text = sanitizeAssistantDisplayText(
            'Complete result:\n\n| UOM | Total |\n| --- | ---: |\n| PCS | 10.00 |\n\n- Evidence: query result',
        );

        expect(text).toContain('\n\n| UOM | Total |');
        expect(text).toContain('\n- Evidence: query result');
    });

    it('removes redundant label-only Markdown list items', () => {
        const text = sanitizeAssistantDisplayText([
            'The top account is supported by the query result.',
            '',
            '- **System / Internal Ledger Dominance:**',
            '- **Key Commercial Drivers**',
            '- **Complete finding** — Balance: 1,000.00',
        ].join('\n'));

        expect(text).not.toContain('System / Internal Ledger Dominance');
        expect(text).not.toContain('Key Commercial Drivers');
        expect(text).toContain('**Complete finding** — Balance: 1,000.00');
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('does not render suggested actions inside the AI message bubble while a runtime turn is running', () => {
        const onSuggestedAction = vi.fn();

        render(
            <AiMessage
                msg={{
                    id: 'chat-1',
                    sender: 'ai',
                    text: 'Try one of these next steps.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message',
                    suggestedActions: [
                        { label: 'Show top rows', action: 'show top rows' },
                    ],
                }}
                hasRunningTurn={true}
                onShowCardFromChat={vi.fn()}
                onSuggestedAction={onSuggestedAction}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Show top rows' })).toBeNull();
        expect(onSuggestedAction).not.toHaveBeenCalled();
    });

    it('does not render suggested actions inside the AI message bubble when idle', () => {
        const onSuggestedAction = vi.fn();

        render(
            <AiMessage
                msg={{
                    id: 'chat-2',
                    sender: 'ai',
                    text: 'Try one of these next steps.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message',
                    suggestedActions: [
                        { label: 'Show top rows', action: 'show top rows' },
                    ],
                }}
                hasRunningTurn={false}
                onShowCardFromChat={vi.fn()}
                onSuggestedAction={onSuggestedAction}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Show top rows' })).toBeNull();
        expect(onSuggestedAction).not.toHaveBeenCalled();
    });

    it('does not expose internal-tool suggested actions inside the AI message bubble', () => {
        const onSuggestedAction = vi.fn();

        render(
            <AiMessage
                msg={{
                    id: 'chat-technical-action',
                    sender: 'ai',
                    text: 'Try one of these next steps.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message',
                    suggestedActions: [
                        { label: '验证利润与毛利率映射逻辑', action: 'analysis.validate_metric_mapping' },
                    ],
                }}
                hasRunningTurn={false}
                onShowCardFromChat={vi.fn()}
                onSuggestedAction={onSuggestedAction}
            />,
        );

        expect(screen.queryByRole('button', { name: '验证利润与毛利率映射逻辑' })).toBeNull();
        expect(onSuggestedAction).not.toHaveBeenCalled();
    });

    it('keeps assistant cards width-bound to the panel when rendering query traces', () => {
        const { container } = render(
            <AiMessage
                msg={{
                    id: 'chat-3',
                    sender: 'ai',
                    text: 'Query complete. Rows: 100/4687.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_query_trace',
                    queryTrace: {
                        phase: 'analysis',
                        engine: 'duckdb',
                        returnedRows: 100,
                        totalMatchedRows: 4687,
                        durationMs: 57,
                        sqlPreview: 'SELECT "Code", "Description", "SeriesLabelL1", "Value", "occurrence_count" FROM query_result',
                    },
                }}
                hasRunningTurn={false}
                onShowCardFromChat={vi.fn()}
                onSuggestedAction={vi.fn()}
            />,
        );

        const wrapper = container.firstElementChild;
        const card = wrapper?.firstElementChild as HTMLElement | null;
        const codeNode = container.querySelector('pre code');

        expect(wrapper).toHaveClass('min-w-0', 'w-full');
        expect(card).toHaveClass('min-w-0', 'w-full', 'max-w-full');
        expect(screen.getByText('Technical details')).toBeInTheDocument();
        expect(screen.getByText('Analysis activity')).toBeInTheDocument();
        expect(codeNode).toHaveTextContent('SELECT "Code"');
    });
});
