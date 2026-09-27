import React, { memo } from 'react';
import { ChatMessage } from '../../types';
import { GoalConfirmationCard } from './GoalConfirmationCard';
import { AiMessage } from './AiMessage';
import { ClarificationCard } from './ClarificationCard';
import { PlanStartCard } from './PlanStartCard';
import { ProactiveInsightCard } from './ProactiveInsightCard';
import { ThinkingCard } from './ThinkingCard';
import { ThoughtCard } from './ThoughtCard';
import { UserMessage } from './UserMessage';
import { EnhancementSuggestionCard } from './EnhancementSuggestionCard';


interface MessageRendererProps {
    item: ChatMessage;
    onShowCardFromChat: (cardId: string) => void;
}

const MessageRendererComponent: React.FC<MessageRendererProps> = ({
    item,
    onShowCardFromChat,
}) => {
    const msg = item;

    switch(msg.type) {
        case 'ai_goal_clarification': return <GoalConfirmationCard msg={msg} />;
        case 'ai_clarification': return <ClarificationCard msg={msg} />;
        case 'ai_plan_start': return <PlanStartCard msg={msg} />;
        case 'ai_thought': return null;
        case 'ai_thinking': return <ThinkingCard msg={msg} />;
        case 'ai_proactive_insight': return <ProactiveInsightCard msg={msg} />;
        case 'ai_enhancement_suggestion': return <EnhancementSuggestionCard msg={msg} />;
        case 'ai_cleaning_step': return <AiMessage msg={msg} onShowCardFromChat={onShowCardFromChat} />;
        case 'ai_query_trace': return <AiMessage msg={msg} onShowCardFromChat={onShowCardFromChat} />;
        case 'ai_mutation_confirmation': return <AiMessage msg={msg} onShowCardFromChat={onShowCardFromChat} />;
        case 'user_message': return <UserMessage msg={msg} />;
        default:
            return <AiMessage msg={msg} onShowCardFromChat={onShowCardFromChat} />;
    }
};

export const MessageRenderer = memo(MessageRendererComponent);
