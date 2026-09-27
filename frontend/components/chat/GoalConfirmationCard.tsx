
import React, { useState, useEffect, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { ChatMessage } from '../../types';
import { useAppStore, AppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import { IconChangeGoal } from '../../icons/IconChangeGoal';

export const GoalConfirmationCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const { confirmGoal, isBusy, settings, isChangingGoal } = useAppStore((state: AppStore) => ({
        confirmGoal: state.confirmGoal,
        isBusy: state.isBusy,
        settings: state.settings,
        isChangingGoal: state.isChangingGoal,
        dataQualityIssues: state.dataQualityIssues,
    }), shallow);
    const [customGoal, setCustomGoal] = useState('');
    const [countdown, setCountdown] = useState<number | null>(null);
    const timerRef = useRef<number | null>(null);

    const recommendedGoal = msg.goalCandidates?.find(g => g.isRecommended);
    const otherGoals = msg.goalCandidates?.filter(g => !g.isRecommended);

    // "Auto forever": Auto-confirm is now safe as long as there is a recommended goal.
    // The confidence and data quality checks have been removed per user request.
    const isAutoConfirmSafe = !!recommendedGoal;
    const canAutoConfirm = settings.autoConfirmGoal && isAutoConfirmSafe && !isChangingGoal;

    const cancelTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setCountdown(null);
    };

    useEffect(() => {
        if (canAutoConfirm) {
            setCountdown(10);
            timerRef.current = window.setInterval(() => {
                setCountdown(prev => (prev !== null && prev > 1) ? prev - 1 : 0);
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [canAutoConfirm]);

    useEffect(() => {
        if (countdown === 0 && recommendedGoal) {
            if (timerRef.current) clearInterval(timerRef.current);
            confirmGoal(recommendedGoal.title);
        }
    }, [countdown, recommendedGoal, confirmGoal]);

    if (!msg.goalCandidates) return null;

    const handleCustomGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        cancelTimer();
        setCustomGoal(e.target.value);
    };

    const handleConfirm = (goalTitle: string) => {
        cancelTimer();
        confirmGoal(goalTitle);
    };
    
    return (
        <div className="animate-fade-in rounded-card border border-blue-200 bg-white p-4 shadow-md">
            <div className="mb-3 flex items-start text-blue-700">
                <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700" aria-hidden="true">
                    <IconChangeGoal />
                </span>
                <div>
                    <h4 className="font-semibold text-base">{getTranslation('goal_confirm_title', settings.language)}</h4>
                    <p className="text-sm text-slate-600">{getTranslation('goal_confirm_description', settings.language)}</p>
                </div>
            </div>

            {recommendedGoal && (
                <div className="rounded-card border border-blue-200 bg-blue-50 p-3">
                    <p className="mb-1 text-sm font-bold text-blue-800">{getTranslation('goal_confirm_recommended', settings.language)}</p>
                    <p className="font-semibold text-slate-800">{recommendedGoal.title}</p>
                    <p className="text-xs text-slate-600 mt-1">{recommendedGoal.description}</p>
                    <button
                        onClick={() => handleConfirm(recommendedGoal.title)}
                        disabled={isBusy}
                        className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {getTranslation('goal_confirm_use_recommended', settings.language)}
                    </button>
                    {canAutoConfirm && countdown !== null && (
                        <div className="mt-2">
                            <p className="text-xs text-slate-500 text-center">
                                {getTranslation('goal_confirm_auto_start', settings.language, { count: countdown })}
                            </p>
                            <div className="w-full bg-blue-200 rounded-full h-1 mt-1 overflow-hidden">
                                <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${countdown * 10}%`, transition: 'width 1s linear' }}></div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {otherGoals && otherGoals.length > 0 && (
                <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500">{getTranslation('goal_confirm_other_options', settings.language)}</p>
                    {otherGoals.map(goal => (
                        <button
                            key={goal.title}
                            onClick={() => handleConfirm(goal.title)}
                            disabled={isBusy}
                            className="w-full rounded-md border border-slate-200 bg-slate-100 p-3 text-left text-sm transition-colors hover:border-blue-500 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <p className="font-semibold text-slate-800">{goal.title}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{goal.description}</p>
                        </button>
                    ))}
                </div>
            )}
            
            <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 mb-1">{getTranslation('goal_confirm_custom', settings.language)}</p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        name="custom-analysis-goal"
                        value={customGoal}
                        onChange={handleCustomGoalChange}
                        placeholder={getTranslation('goal_confirm_custom_placeholder', settings.language)}
                        disabled={isBusy}
                        className="flex-grow bg-white border border-slate-300 rounded-md py-1.5 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleConfirm(customGoal)}
                        disabled={isBusy || !customGoal.trim()}
                        className="rounded-md bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:bg-slate-300"
                    >
                        {getTranslation('goal_confirm_use', settings.language)}
                    </button>
                </div>
            </div>
        </div>
    );
};
