import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { IconNew } from '../icons/IconNew';
import { IconHistory } from '../icons/IconHistory';
import { IconShowAssistant } from '../icons/IconShowAssistant';
import { isDebugModeEnabled } from '../utils/debugMode';
import { IconCode } from '../icons/IconCode';
import { IconFileUpload } from '../icons/IconFileUpload';
import { IconMoreHorizontal } from '../icons/IconMoreHorizontal';
import {
    shouldShowAssistantToggleButton,
    shouldShowDatabaseButton,
    shouldShowHistoryButton,
    shouldShowLogsButton,
    shouldShowNewSessionButton,
    shouldShowWorkflowButton,
} from '../config/runtimeConfig';
import { useAppStore, AppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';
import { confirmModal } from '../services/ui/modalService';
import { PwaUpdateButton } from './PwaUpdateButton';
import { LanguageSwitcher } from './LanguageSwitcher';

export const AppHeader: React.FC = () => {
    const primaryButtonClass = 'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium leading-none transition-colors md:min-h-0 md:min-w-0 md:py-1.5';
    const secondaryButtonClass = `${primaryButtonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`;
    const {
        onNewSession,
        onOpenHistory,
        onOpenDatabase,
        onOpenWorkflow,
        onOpenLogs,
        isAsideVisible,
        onShowAssistant,
        showAnalysisTools,
        hasPendingRestore,
        fileName,
        language,
    } = useAppStore(
        (state: AppStore) => ({
            onNewSession: state.handleNewSession,
            onOpenHistory: () => {
                state.loadReportsListIfNeeded();
                state.setIsHistoryPanelOpen(true);
            },
            onOpenDatabase: () => state.setIsDatabaseModalOpen(true),
            onOpenWorkflow: () => state.setIsDataPreparationModalOpen(true),
            onOpenLogs: () => state.setIsDebugLogsModalOpen(true),
            isAsideVisible: state.isAsideVisible,
            onShowAssistant: () => state.setIsAsideVisible(true),
            showAnalysisTools: Boolean(state.csvData),
            hasPendingRestore: Boolean(state.datasetBundle && !state.csvData),
            fileName: state.csvData?.fileName ?? null,
            language: state.settings?.language ?? 'English',
        }),
        shallow
    );
    const showNewSessionButton = shouldShowNewSessionButton();
    const showHistoryButton = shouldShowHistoryButton();
    const showDatabaseButton = shouldShowDatabaseButton();
    const showWorkflowButton = shouldShowWorkflowButton();
    const showLogsButton = shouldShowLogsButton();
    const showAssistantToggleButton = shouldShowAssistantToggleButton();
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const advancedRootRef = useRef<HTMLDivElement>(null);
    const advancedMenuRef = useRef<HTMLDivElement>(null);
    const advancedButtonRef = useRef<HTMLButtonElement>(null);
    const firstAdvancedItemRef = useRef<HTMLButtonElement>(null);
    const [advancedMenuPosition, setAdvancedMenuPosition] = useState<React.CSSProperties>({
        left: 12,
        top: 56,
    });
    const showAdvancedMenu = Boolean(
        isDebugModeEnabled() && showAnalysisTools && (
            showWorkflowButton
            || showLogsButton
        ),
    );

    const updateAdvancedMenuPosition = useCallback(() => {
        const trigger = advancedButtonRef.current;
        if (!trigger) return;

        const triggerRect = trigger.getBoundingClientRect();
        const viewportMargin = 12;
        const menuGap = 8;
        const menuWidth = Math.min(288, Math.max(0, window.innerWidth - (viewportMargin * 2)));
        const maximumLeft = Math.max(viewportMargin, window.innerWidth - menuWidth - viewportMargin);
        const anchoredLeft = triggerRect.right - menuWidth;

        setAdvancedMenuPosition({
            left: Math.min(Math.max(viewportMargin, anchoredLeft), maximumLeft),
            top: Math.max(viewportMargin, triggerRect.bottom + menuGap),
            width: menuWidth,
        });
    }, []);

    useEffect(() => {
        if (!isAdvancedOpen) return;
        updateAdvancedMenuPosition();
        firstAdvancedItemRef.current?.focus();
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                !advancedRootRef.current?.contains(target)
                && !advancedMenuRef.current?.contains(target)
            ) {
                setIsAdvancedOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsAdvancedOpen(false);
                advancedButtonRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updateAdvancedMenuPosition);
        window.addEventListener('scroll', updateAdvancedMenuPosition, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updateAdvancedMenuPosition);
            window.removeEventListener('scroll', updateAdvancedMenuPosition, true);
        };
    }, [isAdvancedOpen, updateAdvancedMenuPosition]);

    const runAdvancedAction = (action: () => void) => {
        setIsAdvancedOpen(false);
        action();
    };

    const requestNewSession = async () => {
        const confirmed = await confirmModal({
            title: getTranslation('new_session_confirm_title', language),
            message: getTranslation('new_session_confirm_description', language),
            confirmLabel: getTranslation('new_session_confirm_action', language),
            cancelLabel: getTranslation('new_session_confirm_cancel', language),
        });
        if (confirmed) void onNewSession();
    };

    return (
        <>
        {/* Six 44px touch targets plus the title do not fit one row on phones, so the actions
            wrap to a second row there instead of covering the title. */}
        <header
            data-app-header-root="true"
            className="flex min-w-0 flex-row flex-wrap items-center gap-2 overflow-hidden px-0 py-2 md:flex-nowrap"
        >
            <div className="shrink-0">
                <h1 className="whitespace-nowrap text-xl font-extrabold leading-tight text-slate-900">AI Analysis</h1>
            </div>
            {fileName && (
                <div className="hidden min-w-0 items-center gap-2 border-l border-slate-200 pl-3 text-sm text-slate-600 lg:flex" title={fileName}>
                    <IconFileUpload className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="max-w-[22rem] truncate">{fileName}</span>
                </div>
            )}
            <nav
                aria-label={getTranslation('header_analysis_actions', language)}
                className="ml-auto flex w-full min-w-0 flex-nowrap items-center justify-between gap-0.5 overflow-visible md:w-auto md:justify-end md:gap-1.5"
            >
                {showNewSessionButton && (showAnalysisTools || hasPendingRestore) && (
                    <button
                        onClick={() => void requestNewSession()}
                        data-new-session-trigger="true"
                        className={`${primaryButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
                        title={getTranslation('header_new_title', language)}
                        aria-label={getTranslation('header_new', language)}
                    >
                       <IconNew />
                       <span className="hidden lg:inline">{getTranslation('header_new', language)}</span>
                    </button>
                )}
                <LanguageSwitcher buttonClassName={secondaryButtonClass} />
                <PwaUpdateButton
                    className={`${primaryButtonClass} border border-transparent text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700`}
                    language={language}
                />
                {showHistoryButton && (
                    <button
                        onClick={onOpenHistory}
                        data-history-trigger="true"
                        className={secondaryButtonClass}
                        title={getTranslation('header_history_title', language)}
                        aria-label={getTranslation('header_history', language)}
                    >
                       <IconHistory />
                       <span className="hidden lg:inline">{getTranslation('header_history', language)}</span>
                    </button>
                )}
                {showDatabaseButton && (
                    <button
                        onClick={showAnalysisTools ? onOpenDatabase : undefined}
                        data-data-explorer-trigger="true"
                        className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                        title={getTranslation(
                            showAnalysisTools
                                ? 'header_data_explorer_title'
                                : 'header_data_explorer_requires_upload',
                            language,
                        )}
                        aria-label={getTranslation('header_data_explorer', language)}
                        aria-disabled={!showAnalysisTools}
                        disabled={!showAnalysisTools}
                    >
                       <IconCode className="m-0 h-6 w-6 md:h-5 md:w-5" />
                       <span className="hidden md:inline">{getTranslation('header_data_explorer', language)}</span>
                    </button>
                )}
                {showAdvancedMenu && (
                    <div ref={advancedRootRef} className="relative shrink-0">
                        <button
                            ref={advancedButtonRef}
                            data-advanced-trigger="true"
                            type="button"
                            className={secondaryButtonClass}
                            title={getTranslation('header_advanced_title', language)}
                            aria-label={getTranslation('header_advanced', language)}
                            aria-haspopup="menu"
                            aria-expanded={isAdvancedOpen}
                            onClick={() => setIsAdvancedOpen(open => !open)}
                        >
                            <IconMoreHorizontal className="h-6 w-6 md:h-5 md:w-5" />
                            <span className="hidden md:inline">{getTranslation('header_advanced', language)}</span>
                        </button>
                        {isAdvancedOpen && createPortal(
                            <div
                                ref={advancedMenuRef}
                                role="menu"
                                aria-label={getTranslation('header_advanced', language)}
                                className="fixed z-50 grid gap-1 rounded-card border border-slate-200 bg-white p-1.5 shadow-xl"
                                style={advancedMenuPosition}
                            >
                                {showAnalysisTools && showWorkflowButton && (
                                    <button
                                        ref={firstAdvancedItemRef}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => runAdvancedAction(onOpenWorkflow)}
                                        className="min-h-[44px] rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        <span className="block font-medium">{getTranslation('header_workflow', language)}</span>
                                        <span className="block text-xs text-slate-500">{getTranslation('header_workflow_hint', language)}</span>
                                    </button>
                                )}
                                {showAnalysisTools && showLogsButton && (
                                    <button
                                        ref={!showWorkflowButton ? firstAdvancedItemRef : undefined}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => runAdvancedAction(onOpenLogs)}
                                        className="min-h-[44px] rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        <span className="block font-medium">{getTranslation('header_logs', language)}</span>
                                        <span className="block text-xs text-slate-500">{getTranslation('header_logs_hint', language)}</span>
                                    </button>
                                )}
                            </div>
                        , document.body)}
                    </div>
                )}
                {!isAsideVisible && showAssistantToggleButton && (
                    <button
                        onClick={onShowAssistant}
                        data-mobile-assistant-trigger="true"
                        className={`${primaryButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
                        aria-label={getTranslation('header_show_assistant', language)}
                        title={getTranslation('header_show_assistant', language)}
                    >
                        <IconShowAssistant />
                        <span className="hidden lg:inline">{getTranslation('assistant', language)}</span>
                    </button>
                )}
            </nav>
        </header>
        </>
    );
};
