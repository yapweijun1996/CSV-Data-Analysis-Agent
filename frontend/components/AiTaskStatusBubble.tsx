import React from 'react';
import { AiTaskStatusMessage, MicroTask } from '../types';
import { IconCheck } from '../icons/IconCheck';
import { IconSearch } from '../icons/IconSearch';
import { IconSettings } from '../icons/IconSettings';
import { IconThinking } from '../icons/IconThinking';
import { IconWarning } from '../icons/IconWarning';
import { useAppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';

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
const ExecutingIcon: React.FC = () => (
    <IconWrapper colorClass="bg-indigo-100 text-indigo-600">
        <IconSettings className="h-5 w-5" aria-hidden="true" />
    </IconWrapper>
);
const ObservingIcon: React.FC = () => (
    <IconWrapper colorClass="bg-purple-100 text-purple-600">
        <IconSearch className="h-5 w-5 text-current" aria-hidden="true" />
    </IconWrapper>
);
const DoneIcon: React.FC = () => (
    <IconWrapper colorClass="bg-emerald-100 text-emerald-700">
        <IconCheck className="h-5 w-5" aria-hidden="true" />
    </IconWrapper>
);
const ErrorIcon: React.FC = () => (
    <IconWrapper colorClass="bg-red-100 text-red-600">
        <IconWarning className="h-5 w-5" aria-hidden="true" />
    </IconWrapper>
);

interface AiTaskStatusBubbleProps {
    task: AiTaskStatusMessage;
    variant?: 'default' | 'compact';
}

const useLocalizedTask = (task: AiTaskStatusMessage) => {
    const language = useAppStore(state => state.settings.language);
    const title = task.titleKey
        ? getTranslation(task.titleKey, language, task.titleParams)
        : task.title;
    const subtitle = task.subtitleKey
        ? getTranslation(task.subtitleKey, language, task.subtitleParams)
        : task.subtitle;
    return { title, subtitle, language };
};

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


export const AiTaskStatusBubble: React.FC<AiTaskStatusBubbleProps> = ({ task, variant = 'default' }) => {
    const { title, subtitle, language } = useLocalizedTask(task);

    const renderIcon = () => {
        switch (task.status) {
            case 'thinking': return <ThinkingIcon />;
            case 'acting': return <ExecutingIcon />;
            case 'observing': return <ObservingIcon />;
            case 'done': return <DoneIcon />;
            case 'error': return <ErrorIcon />;
        }
    };

    if (variant === 'compact') {
        return (
            <div className="rounded-card border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="scale-75">{renderIcon()}</div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
                            <span className="shrink-0 text-xs font-medium text-slate-400">
                                {task.currentStep}/{task.totalSteps}
                            </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in flex flex-col rounded-card border border-slate-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center">
                {renderIcon()}
                <div className="ml-3">
                    <h3 className="text-lg font-bold text-slate-900">{title} ({task.currentStep}/{task.totalSteps})</h3>
                    <p className="text-sm text-slate-500">{subtitle}</p>
                </div>
            </div>

            {task.totalSteps > 1 && task.status !== 'done' && task.status !== 'error' && (
                <div className="mb-3">
                    <div
                        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={task.totalSteps}
                        aria-valuenow={Math.max(0, task.currentStep - 1)}
                        aria-label={title}
                    >
                        {Array.from({ length: task.totalSteps }, (_, index) => (
                            <span
                                key={index}
                                className={`h-full flex-1 ${
                                    index < task.currentStep - 1 ? 'bg-blue-600'
                                        : index === task.currentStep - 1 ? 'animate-pulse bg-blue-400' : 'bg-transparent'
                                }`}
                            />
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                        {getTranslation('analysis_progress_caption', language, {
                            done: Math.max(0, task.currentStep - 1),
                            total: task.totalSteps,
                        })}
                    </p>
                </div>
            )}

            {task.microTasks && task.microTasks.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
                    {task.microTasks.map((microTask) => (
                        <MicroTaskStep key={microTask.name} task={microTask} />
                    ))}
                </div>
            )}

            {task.status === 'error' && task.error && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <details>
                        <summary className="cursor-pointer font-semibold">
                            {getTranslation('task_error_details', language)}
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap font-mono break-all">{task.error}</p>
                    </details>
                </div>
            )}
        </div>
    );
};
