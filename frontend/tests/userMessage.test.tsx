import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserMessage } from '../components/chat/UserMessage';

describe('UserMessage markdown rendering', () => {
    it('renders markdown and syntax-highlighted code blocks inside the user bubble', () => {
        const { container } = render(
            <UserMessage
                msg={{
                    id: 'user-message-1',
                    sender: 'user',
                    text: '**Need this**\n\n```js\nconst total = revenue - cost;\n```',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'user_message',
                }}
            />,
        );

        const bubble = container.querySelector('.bg-blue-600');
        const codeNode = container.querySelector('pre code');

        expect(screen.getByText('Need this')).toBeInTheDocument();
        expect(screen.getByText('js')).toBeInTheDocument();
        expect(bubble).toBeInTheDocument();
        expect(codeNode).toHaveClass('hljs', 'language-js');
    });
});
