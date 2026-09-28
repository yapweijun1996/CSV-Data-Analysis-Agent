
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChartType, AnalysisPlan, type CardTrustStatus } from '../../types';
import { IconExport } from '../../icons/IconExport';
import { IconMoreHorizontal } from '../../icons/IconMoreHorizontal';
import { ChartTypeIcon } from './chartTypePresentation';
import { resolveDisplayPlanDescription, resolveDisplayPlanTitle, resolvePlanGroupLabel, resolvePlanMetricLabel } from '../../services/dashboard/businessLabelResolver';
import { getTranslation } from '../../utils/localization';

interface AnalysisCardHeaderProps {
    cardId?: string;
    plan: AnalysisPlan;
    displayChartType: ChartType;
    availableChartTypes: ChartType[];
    isExporting: boolean;
    trustStatus: CardTrustStatus;
    isCardExpanded: boolean;
    language: string;
    onToggleExpand: () => void;
    onToggleProvenance: () => void;
    onVerdictClick?: () => void;
    onChartTypeChange: (newType: ChartType) => void;
    onExport: (format: 'png' | 'png_full' | 'csv' | 'html') => void;
    onDelete: () => void;
    showActions?: boolean;
}

const trustBorderClass = (status: CardTrustStatus) => {
    if (status === 'verified') return 'border-l-emerald-400';
    if (status === 'caveated') return 'border-l-amber-400';
    if (status === 'weak' || status === 'stale') return 'border-l-red-400';
    return 'border-l-slate-400';
};

const trustIconClass = (status: CardTrustStatus) => {
    if (status === 'verified') return 'bg-emerald-50 text-emerald-600';
    if (status === 'caveated') return 'bg-amber-50 text-amber-600';
    if (status === 'weak' || status === 'stale') return 'bg-red-50 text-red-600';
    return 'bg-slate-100 text-slate-600';
};

const AnalysisCardHeaderComponent: React.FC<AnalysisCardHeaderProps> = ({
    cardId,
    plan,
    displayChartType,
    availableChartTypes,
    isExporting,
    trustStatus,
    isCardExpanded,
    language,
    onToggleExpand,
    onToggleProvenance,
    onVerdictClick,
    onChartTypeChange,
    onExport,
    onDelete,
    showActions = true,
}) => {
    const [openMenu, setOpenMenu] = useState<'chart' | 'export' | 'more' | null>(null);
    const chartMenuRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const chartButtonRef = useRef<HTMLButtonElement>(null);
    const exportButtonRef = useRef<HTMLButtonElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const chartItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const exportItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const moreItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const focusTrigger = useCallback((menu: 'chart' | 'export' | 'more') => {
        const triggerMap = {
            chart: chartButtonRef,
            export: exportButtonRef,
            more: moreButtonRef,
        };
        requestAnimationFrame(() => triggerMap[menu].current?.focus());
    }, []);

    const closeMenus = useCallback((returnFocusTo?: 'chart' | 'export' | 'more') => {
        setOpenMenu(null);
        if (returnFocusTo) {
            focusTrigger(returnFocusTo);
        }
    }, [focusTrigger]);

    const getItemRefs = useCallback((menu: 'chart' | 'export' | 'more') => {
        if (menu === 'chart') return chartItemRefs;
        if (menu === 'export') return exportItemRefs;
        return moreItemRefs;
    }, []);

    const openMenuAndFocus = useCallback((menu: 'chart' | 'export' | 'more', focusIndex = 0) => {
        setOpenMenu(menu);
        requestAnimationFrame(() => {
            const items = getItemRefs(menu).current.filter(Boolean);
            items[focusIndex]?.focus();
        });
    }, [getItemRefs]);

    useEffect(() => {
        if (!openMenu) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                chartMenuRef.current?.contains(target)
                || exportMenuRef.current?.contains(target)
                || moreMenuRef.current?.contains(target)
            ) {
                return;
            }
            closeMenus();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenu, closeMenus]);

    useEffect(() => {
        if (!openMenu) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenus(openMenu);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [openMenu, closeMenus]);

    useEffect(() => {
        if (isExporting) {
            closeMenus();
        }
    }, [isExporting, closeMenus]);

    useEffect(() => {
        if (!openMenu) return;
        requestAnimationFrame(() => {
            const items = getItemRefs(openMenu).current.filter(Boolean);
            items[0]?.focus();
        });
    }, [openMenu, getItemRefs]);

    const toggleMenu = (menu: 'chart' | 'export' | 'more') => {
        setOpenMenu(previous => previous === menu ? null : menu);
    };

    const moveFocusInMenu = (menu: 'chart' | 'export' | 'more', direction: 1 | -1) => {
        const items = getItemRefs(menu).current.filter(Boolean);
        if (items.length === 0) return;
        const currentIndex = items.findIndex(item => item === document.activeElement);
        const nextIndex = currentIndex === -1
            ? (direction === 1 ? 0 : items.length - 1)
            : (currentIndex + direction + items.length) % items.length;
        items[nextIndex]?.focus();
    };

    const handleExport = (format: 'png' | 'png_full' | 'csv' | 'html') => {
        closeMenus();
        onExport(format);
    };

    const handleChartTypeSelect = (type: ChartType) => {
        closeMenus();
        onChartTypeChange(type);
    };

    const handleDelete = () => {
        closeMenus();
        onDelete();
    };

    const handleTriggerKeyDown = (menu: 'chart' | 'export' | 'more') => (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMenuAndFocus(menu, 0);
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            const items = getItemRefs(menu).current.filter(Boolean);
            openMenuAndFocus(menu, Math.max(items.length - 1, 0));
        }
    };

    const handleMenuKeyDown = (menu: 'chart' | 'export' | 'more') => (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveFocusInMenu(menu, 1);
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveFocusInMenu(menu, -1);
        }
        if (event.key === 'Home') {
            event.preventDefault();
            getItemRefs(menu).current.filter(Boolean)[0]?.focus();
        }
        if (event.key === 'End') {
            event.preventDefault();
            const items = getItemRefs(menu).current.filter(Boolean);
            items[items.length - 1]?.focus();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenus(menu);
        }
        if (event.key === 'Tab') {
            closeMenus();
        }
    };

    const displayTitle = resolveDisplayPlanTitle(plan);
    const displayDescription = resolveDisplayPlanDescription(plan);
    const chartTypeLabel = (type: ChartType) => getTranslation(`chart_type_${type}`, language);
    const groupLabel = resolvePlanGroupLabel(plan);
    const metricLabel = resolvePlanMetricLabel(plan);
    const grainSubtitle = [
        plan.groupByColumn && `by ${groupLabel}`,
        plan.valueColumn && `→ ${metricLabel ?? plan.valueColumn}`,
    ].filter(Boolean).join(' ');

    return (
        <>
            {plan.isFallback && (
                <div className="rounded-r-lg border-l-4 border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-800" role="alert">
                    <p className="font-bold">{getTranslation('card_fallback_view', language)}</p>
                    <p className="mt-1">{getTranslation('card_fallback_view_hint', language)}</p>
                </div>
            )}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                {/* title block with left-border accent */}
                <div className={`flex-1 min-w-0 border-l-4 pl-3 ${trustBorderClass(trustStatus)}`}>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`shrink-0 rounded-md p-1 ${trustIconClass(trustStatus)}`} aria-hidden="true">
                            <ChartTypeIcon type={displayChartType} className="h-3.5 w-3.5" />
                        </span>
                        <h3 className="text-lg font-semibold leading-snug text-slate-800">{displayTitle}</h3>
                        <button
                            type="button"
                            onClick={onVerdictClick}
                            className={`inline-flex min-h-[44px] items-center rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer md:min-h-0 ${
                                trustStatus === 'verified'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : trustStatus === 'caveated'
                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                        : trustStatus === 'unverified'
                                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                            title={getTranslation('verdict_explainer_click_hint', language)}
                        >
                            {getTranslation(`card_trust_${trustStatus}`, language)}
                        </button>
                    </div>
                    {grainSubtitle && (
                        <p className="mt-0.5 pl-7 text-xs text-slate-400">{grainSubtitle}</p>
                    )}
                </div>
                {showActions && <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0" data-export-exclude>
                    <button
                        type="button"
                        onClick={onToggleExpand}
                        aria-label={isCardExpanded ? getTranslation('analysis_card_collapse', language) : getTranslation('analysis_card_expand', language)}
                        title={isCardExpanded ? getTranslation('analysis_card_collapse', language) : getTranslation('analysis_card_expand', language)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 md:h-8 md:min-h-0 md:min-w-0 md:w-8"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            className={`h-4 w-4 transition-transform duration-200 ${isCardExpanded ? '' : '-rotate-90'}`}
                            aria-hidden="true"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                        </svg>
                    </button>
                    {plan.artifactType !== 'pivot_matrix' && !plan.artifactMetadata?.hideChartByDefault && (<div className="relative" ref={chartMenuRef}>
                        <button
                            ref={chartButtonRef}
                            type="button"
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow md:h-8 md:min-h-0"
                            aria-haspopup="menu"
                            aria-expanded={openMenu === 'chart'}
                            aria-label={`${getTranslation('card_controls_chart_type', language)}: ${chartTypeLabel(displayChartType)}`}
                            onClick={() => toggleMenu('chart')}
                            onKeyDown={handleTriggerKeyDown('chart')}
                        >
                            <span className="flex h-5 w-5 items-center justify-center rounded text-slate-600">
                                <ChartTypeIcon type={displayChartType} className="h-4 w-4" />
                            </span>
                            <span>{chartTypeLabel(displayChartType)}</span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                className={`h-4 w-4 text-slate-400 transition-transform ${openMenu === 'chart' ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                            </svg>
                        </button>
                        {openMenu === 'chart' && <div
                            role="menu"
                            aria-orientation="vertical"
                            onKeyDown={handleMenuKeyDown('chart')}
                            className="absolute right-0 z-10 mt-2 w-44 rounded-card border border-slate-200 bg-white p-1.5 shadow-lg"
                        >
                            {availableChartTypes.map(type => (
                                <button
                                    ref={element => {
                                        chartItemRefs.current[availableChartTypes.indexOf(type)] = element;
                                    }}
                                    key={type}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={displayChartType === type}
                                    onClick={() => handleChartTypeSelect(type)}
                                    tabIndex={0}
                                    className={`flex min-h-[44px] w-full items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
                                        displayChartType === type
                                            ? 'bg-slate-100 font-semibold text-slate-900'
                                            : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                                            <ChartTypeIcon type={type} className="h-3.5 w-3.5" />
                                        </span>
                                        <span>{chartTypeLabel(type)}</span>
                                    </span>
                                    {displayChartType === type && (
                                        <span className="text-xs text-slate-500">{getTranslation('card_current', language)}</span>
                                    )}
                                </button>
                            ))}
                        </div>}
                    </div>)}
                    <div className="relative" ref={exportMenuRef}>
                        <button
                            ref={exportButtonRef}
                            type="button"
                            disabled={isExporting}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 md:h-8 md:min-h-0"
                            title={getTranslation('card_export_title', language)}
                            aria-label={getTranslation('card_export_title', language)}
                            aria-haspopup="menu"
                            aria-expanded={openMenu === 'export'}
                            onClick={() => toggleMenu('export')}
                            onKeyDown={handleTriggerKeyDown('export')}
                        >
                            <IconExport />
                            <span>{getTranslation('card_export', language)}</span>
                        </button>
                        {openMenu === 'export' && <div
                            role="menu"
                            aria-orientation="vertical"
                            onKeyDown={handleMenuKeyDown('export')}
                            className="absolute right-0 z-10 mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 bg-white p-1 shadow-lg"
                        >
                            {!plan.artifactMetadata?.hideChartByDefault && <button
                                ref={element => {
                                    exportItemRefs.current[0] = element;
                                }}
                                type="button"
                                onClick={() => handleExport('png')}
                                role="menuitem"
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50"
                            >
                                <span className="block text-sm font-medium text-slate-700">{getTranslation('export_png_chart', language)}</span>
                                <span className="block text-xs text-slate-500">{getTranslation('export_png_chart_desc', language)}</span>
                            </button>}
                            <button
                                ref={element => {
                                    exportItemRefs.current[1] = element;
                                }}
                                type="button"
                                onClick={() => handleExport('png_full')}
                                role="menuitem"
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50"
                            >
                                <span className="block text-sm font-medium text-slate-700">{getTranslation('export_png_full', language)}</span>
                                <span className="block text-xs text-slate-500">{getTranslation('export_png_full_desc', language)}</span>
                            </button>
                            <button
                                ref={element => {
                                    exportItemRefs.current[2] = element;
                                }}
                                type="button"
                                onClick={() => handleExport('csv')}
                                role="menuitem"
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50"
                            >
                                <span className="block text-sm font-medium text-slate-700">{getTranslation('export_csv', language)}</span>
                                <span className="block text-xs text-slate-500">{getTranslation('export_csv_desc', language)}</span>
                            </button>
                            <button
                                ref={element => {
                                    exportItemRefs.current[3] = element;
                                }}
                                type="button"
                                onClick={() => handleExport('html')}
                                role="menuitem"
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50"
                            >
                                <span className="block text-sm font-medium text-slate-700">{getTranslation('export_html', language)}</span>
                                <span className="block text-xs text-slate-500">{getTranslation('export_html_desc', language)}</span>
                            </button>
                        </div>}
                    </div>
                    <div className="relative" ref={moreMenuRef}>
                        <button
                            ref={moreButtonRef}
                            data-card-more-trigger={cardId}
                            type="button"
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 md:h-8 md:min-h-0 md:min-w-0 md:w-8"
                            title={getTranslation('card_more_actions', language)}
                            aria-label={getTranslation('card_more_actions', language)}
                            aria-haspopup="menu"
                            aria-expanded={openMenu === 'more'}
                            onClick={() => toggleMenu('more')}
                            onKeyDown={handleTriggerKeyDown('more')}
                        >
                            <IconMoreHorizontal />
                        </button>
                        {openMenu === 'more' && <div
                            role="menu"
                            aria-orientation="vertical"
                            onKeyDown={handleMenuKeyDown('more')}
                            className="absolute right-0 z-10 mt-2 w-44 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 bg-white p-1 shadow-lg"
                        >
                            <button
                                ref={element => {
                                    moreItemRefs.current[0] = element;
                                }}
                                type="button"
                                role="menuitem"
                                onClick={() => { closeMenus(); onToggleProvenance(); }}
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                                {getTranslation('provenance_title', language)}
                            </button>
                            <button
                                ref={element => {
                                    moreItemRefs.current[1] = element;
                                }}
                                type="button"
                                role="menuitem"
                                onClick={handleDelete}
                                tabIndex={0}
                                className="block min-h-[44px] w-full rounded-card px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                                {getTranslation('card_delete', language)}
                            </button>
                        </div>}
                    </div>
                </div>}
            </div>
            <p className="mb-3 text-xs text-slate-500">{displayDescription}</p>
        </>
    );
};

export const AnalysisCardHeader = React.memo(AnalysisCardHeaderComponent);
