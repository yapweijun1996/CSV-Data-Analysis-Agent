import React, { useState, useEffect, useRef } from 'react';
import { ProgressMessage, ChatMessage, AppView } from '../types';

interface ChatPanelProps {
    progressMessages: ProgressMessage[];
    chatHistory: ChatMessage[];
    isBusy: boolean;
    onSendMessage: (message: string) => void;
    isApiKeySet: boolean;
    onToggleVisibility: () => void;
    onOpenSettings: () => void;
    onShowCard: (cardId: string) => void;
    currentView: AppView;
}

const HideIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

const SettingsIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);


export const ChatPanel: React.FC<ChatPanelProps> = ({ progressMessages, chatHistory, isBusy, onSendMessage, isApiKeySet, onToggleVisibility, onOpenSettings, onShowCard, currentView }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const timeline = [...progressMessages, ...chatHistory]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [timeline]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isBusy) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const getPlaceholder = () => {
        if (!isApiKeySet) return "Set API Key in settings to chat";
        switch (currentView) {
            // Fix: Removed 'data_preview' case as it's not a valid AppView type and merged its intent.
            case 'analysis_dashboard':
                return "Ask for a new analysis or data transformation...";
            case 'file_upload':
            default:
                return "Upload a file to begin chatting";
        }
    };

    const renderMessage = (item: ProgressMessage | ChatMessage, index: number) => {
        if ('sender' in item) { // It's a ChatMessage
            const msg = item as ChatMessage;

            if (msg.type === 'ai_thinking') {
                return (
                    <div key={`chat-${index}`} className="my-2 p-3 bg-white border border-blue-200 rounded-lg">
                        <div className="flex items-center text-blue-700 mb-2">
                             <span className="text-lg mr-2">🧠</span>
                             <h4 className="font-semibold">AI's Initial Analysis</h4>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.text}</p>
                    </div>
                )
            }


            if (msg.sender === 'user') {
                return (
                    <div key={`chat-${index}`} className="flex justify-end">
                        <div className="bg-blue-600 rounded-lg px-3 py-2 max-w-xs lg:max-w-md">
                            <p className="text-sm text-white">{msg.text}</p>
                        </div>
                    </div>
                );
            }
            // AI message
            return (
                <div key={`chat-${index}`} className="flex">
                    <div className={`rounded-lg px-3 py-2 max-w-xs lg:max-w-md ${msg.isError ? 'bg-red-100' : 'bg-slate-200'}`}>
                         <p className={`text-sm ${msg.isError ? 'text-red-800' : 'text-slate-800'}`}>{msg.text}</p>
                         {msg.cardId && !msg.isError && (
                            <button 
                                onClick={() => onShowCard(msg.cardId!)}
                                className="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md hover:bg-blue-200 transition-colors w-full text-left font-medium"
                            >
                                → Show Related Card
                            </button>
                         )}
                    </div>
                </div>
            );
        } else { // It's a ProgressMessage
            const msg = item as ProgressMessage;
             return (
                 <div key={`prog-${index}`} className={`flex text-xs ${msg.type === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                    <span className="mr-2 text-slate-400">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{msg.text}</span>
                </div>
            )
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-100 rounded-lg md:rounded-none">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-900">Assistant</h2>
                 <div className="flex items-center space-x-3">
                    <button
                        onClick={onOpenSettings}
                        className="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors"
                        title="Settings"
                        aria-label="Open Settings"
                    >
                        <SettingsIcon />
                    </button>
                    <button 
                        onClick={onToggleVisibility} 
                        className="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors"
                        title="Hide Panel"
                        aria-label="Hide Assistant Panel"
                    >
                        <HideIcon />
                    </button>
                </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {timeline.map(renderMessage)}

                {isBusy && (
                    <div className="flex items-center text-blue-600">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-slate-200 bg-white">
                <form onSubmit={handleSend}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={getPlaceholder()}
                        disabled={isBusy || !isApiKeySet || currentView === 'file_upload'}
                        className="w-full bg-white border border-slate-300 rounded-md py-2 px-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                </form>
                 <div className="text-xs text-slate-400 mt-2">
                    {/* Fix: Replaced check against deprecated 'data_preview' view. The logic is updated to only show example prompts on the analysis dashboard. */}
                    {currentView === 'analysis_dashboard' 
                        ? 'e.g., "Sum of sales by region", or "Remove rows for USA"'
                        : ''
                    }
                </div>
            </div>
        </div>
    );
};