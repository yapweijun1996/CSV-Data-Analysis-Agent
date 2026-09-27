
import React from 'react';
import { AiTaskStatusMessage, MicroTask } from '../../types';
import { IconCheck } from '../../icons/IconCheck';
import { IconThinking } from '../../icons/IconThinking';

// Encapsulate icon styling for a more polished look
const IconWrapper: React.FC<{ children: React.ReactNode; colorClass: string }> = ({ children, colorClass }) => (
    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
        {children}
    </div>
);

const ThinkingIcon: React.FC = () => (
    <IconWrapper colorClass="bg-blue-100 text-blue-600">
        <IconThinking className="h-5 w-5" />
    </IconWrapper>
);
const ExecutingIcon: React.FC = () => <IconWrapper colorClass="bg-indigo-100 text-indigo-600"><span className="text-xl">⚙️</span></IconWrapper>;
const ObservingIcon: React.FC = () => <IconWrapper colorClass="bg-purple-100 text-purple-600"><span className="text-xl">🔬</span></IconWrapper>;
const DoneIcon: React.FC = () => <IconWrapper colorClass="bg-green-100 text-green-600"><span className="text-xl">✅</span></IconWrapper>;
const ErrorIcon: React.FC = () => <IconWrapper colorClass="bg-red-100 text-red-600"><span className="text-xl">⚠️</span></IconWrapper>;

interface AiTaskStatusBubbleProps {
    task: AiTaskStatusMessage;
}

const MicroTaskStep: React.FC<{ task: MicroTask }> = ({ task }) => {
    const { name, status } = task;
    
    const renderIcon = () => {
        switch (status) {
            case 'done':
                return (
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <IconCheck />
                    </div>
                );
            case 'in_progress':
                return (
                    <div className="w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-100 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                    </div>
                );
            case 'pending':
            default:
                 return <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>;
        }
    };
    
    const textClass = () => {
        switch(status) {
            case 'done': return 'text-slate-400 line-through';
            case 'in_progress': return 'text-slate-800 font-medium';
            default: return 'text-slate-500';
        }
    }

    return (
        <div className="flex items-start">
            <div className="mr-3 mt-1 flex-shrink-0">
                {renderIcon()}
            </div>
            <p className={`transition-colors duration-300 ${textClass()}`}>
                {name}
            </p>
        </div>
    );
};


export const AiTaskStatusBubble: React.FC<AiTaskStatusBubbleProps> = ({ task }) => {
    const renderIcon = () => {
        switch (task.status) {
            case 'thinking': return <ThinkingIcon />;
            case 'acting': return <ExecutingIcon />;
            case 'observing': return <ObservingIcon />;
            case 'done': return <DoneIcon />;
            case 'error': return <ErrorIcon />;
        }
    };

    return (
        <div className="bg-white rounded-card shadow-lg p-4 flex flex-col border border-slate-200 animate-fade-in">
            <div className="flex items-center mb-4">
                {renderIcon()}
                <div className="ml-4">
                    <h3 className="text-lg font-bold text-slate-900">{task.title} ({task.currentStep}/{task.totalSteps})</h3>
                    <p className="text-sm text-slate-500">{task.subtitle}</p>
                </div>
            </div>

            {task.microTasks && task.microTasks.length > 0 && (
                <div className="space-y-3 text-sm border-t border-slate-200 pt-4">
                    {task.microTasks.map((microTask) => (
                        <MicroTaskStep key={microTask.name} task={microTask} />
                    ))}
                </div>
            )}
            
            {task.status === 'error' && task.error && (
                <div className="mt-3 text-xs text-red-700 bg-red-50 p-3 rounded-md border border-red-200">
                    <p className="font-semibold mb-1">Error Details:</p>
                    <p className="whitespace-pre-wrap font-mono break-all">{task.error}</p>
                </div>
            )}
        </div>
    );
};
