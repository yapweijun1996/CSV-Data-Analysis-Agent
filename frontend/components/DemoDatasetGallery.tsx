import React, { useEffect, useId, useState } from 'react';
import { IconLoadingSpinner } from '../icons/IconLoadingSpinner';
import { IconBolt, IconClock, IconDemoTheme, IconExternalLink, IconSparkChart } from '../icons/IconDemoGallery';
import { getTranslation } from '../utils/localization';
import {
    loadDemoDatasetCatalog,
    resolveDemoText,
    type DemoDataset,
    type DemoDatasetTheme,
} from '../services/data/demoDatasetCatalog';

export type DemoDatasetLoadStatus = 'idle' | 'loading' | 'error';

export interface DemoDatasetLoadState {
    datasetId: string | null;
    status: DemoDatasetLoadStatus;
}

interface DemoDatasetGalleryProps {
    language: string;
    /** True while the app is busy, restoring, unconfigured, or another demo is loading. */
    disabled: boolean;
    loadState: DemoDatasetLoadState;
    onAnalyse: (dataset: DemoDataset) => void;
}

// Collapsed view adapts to the viewport so the first screen never needs a
// scroll: phones and short windows show two cards, tall tablets four, desktops
// six from 800px tall and the whole catalog from 900px tall. Visibility is CSS-only (width and height media queries), so no
// resize listener is needed. "Show all" still reveals the full catalog.
// Full literal class strings: Tailwind's content scanner cannot see interpolated names.
const HIDE_ON_TALL_DESKTOP = '[@media(min-width:1024px)_and_(min-height:900px)]:hidden';

const NUMBER_LOCALES: Record<string, string> = {
    English: 'en-SG',
    Mandarin: 'zh-SG',
    Malay: 'ms-SG',
    Vietnamese: 'vi-VN',
    Japanese: 'ja-JP',
};

// Full class strings so Tailwind's content scanner keeps them.
const THEME_BADGE_CLASSES: Record<DemoDatasetTheme, string> = {
    housing: 'text-blue-600',
    jobs: 'text-violet-600',
    business: 'text-amber-600',
    transport: 'text-emerald-600',
    tourism: 'text-pink-600',
    environment: 'text-green-700',
    population: 'text-sky-600',
};

const formatCount = (value: number, language: string): string =>
    new Intl.NumberFormat(NUMBER_LOCALES[language] ?? 'en-SG').format(value);

const formatSize = (bytes: number): string => {
    const megabyte = 1024 * 1024;
    if (bytes < megabyte) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / megabyte).toFixed(bytes >= 10 * megabyte ? 0 : 1)} MB`;
};

export const getDemoCardVisibilityClass = (index: number, expanded: boolean): string => {
    if (expanded || index < 2) return 'flex';
    if (index < 3) {
        return 'hidden lg:flex [@media(max-width:639px)_and_(min-height:900px)]:flex [@media(min-width:640px)_and_(min-height:900px)]:flex';
    }
    if (index < 4) {
        return 'hidden [@media(min-width:640px)_and_(min-height:900px)]:flex [@media(min-width:1024px)_and_(min-height:800px)]:flex';
    }
    if (index < 6) return 'hidden [@media(min-width:1024px)_and_(min-height:800px)]:flex';
    return 'hidden [@media(min-width:1024px)_and_(min-height:900px)]:flex';
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

interface DemoDatasetCardProps {
    dataset: DemoDataset;
    language: string;
    disabled: boolean;
    status: DemoDatasetLoadStatus;
    onAnalyse: (dataset: DemoDataset) => void;
}

const DemoDatasetCard: React.FC<DemoDatasetCardProps> = ({ dataset, language, disabled, status, onAnalyse }) => {
    const titleId = useId();
    const title = resolveDemoText(dataset.title, language);
    const description = resolveDemoText(dataset.description, language);
    const loading = status === 'loading';
    const stats = getTranslation('demo_gallery_stats', language, {
        rows: formatCount(dataset.rows, language),
        columns: formatCount(dataset.columns, language),
    });
    const isSlow = dataset.speed === 'slow';

    return (
        <article
            aria-labelledby={titleId}
            data-demo-dataset-card={dataset.id}
            className="flex h-full w-full min-w-0 flex-col rounded-card border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-shadow hover:shadow-md"
        >
            <div className="flex items-center justify-between gap-2">
                {dataset.theme ? (
                    <span className={`inline-flex min-w-0 items-center gap-1 text-2xs font-semibold uppercase tracking-wide ${THEME_BADGE_CLASSES[dataset.theme]}`}>
                        <IconDemoTheme theme={dataset.theme} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-slate-600">{getTranslation(`demo_gallery_theme_${dataset.theme}`, language)}</span>
                    </span>
                ) : <span />}
                <span
                    data-demo-speed={dataset.speed}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset ${
                        isSlow
                            ? 'bg-amber-50 text-amber-800 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}
                >
                    {isSlow ? <IconClock className="h-3 w-3" /> : <IconBolt className="h-3 w-3" />}
                    {getTranslation(isSlow ? 'demo_gallery_speed_slow' : 'demo_gallery_speed_fast', language)}
                </span>
            </div>
            <h4 id={titleId} className="mt-1.5 line-clamp-1 break-words text-sm font-semibold leading-snug text-slate-900 sm:line-clamp-2" title={title}>
                {title}
            </h4>
            <p className="mt-0.5 line-clamp-1 break-words text-xs text-slate-600 [@media(min-height:880px)]:line-clamp-2" title={description}>
                {description}
            </p>
            <p className="mt-1 text-2xs tabular-nums text-slate-500">
                {stats}
                {dataset.sizeBytes !== null && <> · {formatSize(dataset.sizeBytes)}</>}
            </p>
            <div className="mt-auto flex items-center gap-2 pt-2">
                <button
                    type="button"
                    onClick={() => onAnalyse(dataset)}
                    disabled={disabled}
                    aria-label={getTranslation(loading ? 'demo_gallery_loading_dataset_named' : 'demo_gallery_analyse_named', language, { title })}
                    className={`inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-card border-2 border-blue-600 bg-white px-3 py-1 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-blue-600 [@media(pointer:fine)]:min-h-[36px] ${focusRing}`}
                >
                    {loading ? <IconLoadingSpinner className="h-4 w-4" /> : <IconSparkChart className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{getTranslation(loading ? 'demo_gallery_loading_dataset' : 'demo_gallery_analyse', language)}</span>
                </button>
                <a
                    href={dataset.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={[dataset.source.publisher, dataset.source.licence].filter(Boolean).join(' · ')}
                    className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-card px-1.5 text-2xs font-medium text-blue-700 hover:bg-blue-50 [@media(pointer:fine)]:min-h-[36px] [@media(pointer:fine)]:min-w-[36px] ${focusRing}`}
                >
                    <span className="sr-only">
                        {getTranslation('demo_gallery_source_label', language)}: <span>{dataset.source.publisher}</span>
                        {dataset.source.licence && <>{' · '}<span>{dataset.source.licence}</span></>}
                        {' '}{getTranslation('demo_gallery_opens_new_tab', language)}
                    </span>
                    <IconExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
            </div>
            {status === 'error' && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                    {getTranslation('demo_gallery_error', language)}
                </p>
            )}
        </article>
    );
};

export const DemoDatasetGallery: React.FC<DemoDatasetGalleryProps> = ({ language, disabled, loadState, onAnalyse }) => {
    const [datasets, setDatasets] = useState<DemoDataset[] | null>(null);
    const [expanded, setExpanded] = useState(false);
    const headingId = useId();
    const listId = useId();

    useEffect(() => {
        let active = true;
        void loadDemoDatasetCatalog().then(result => {
            // Large downloads go last so a first tap, especially on a phone, starts a quick run.
            if (active) setDatasets([...result.datasets].sort((a, b) => Number(a.speed === 'slow') - Number(b.speed === 'slow')));
        });
        return () => {
            active = false;
        };
    }, []);

    const total = datasets?.length ?? 0;
    const hasHidden = total > 2;
    const fitsOnTallDesktop = total <= 9;

    return (
        <section
            aria-labelledby={headingId}
            data-demo-gallery="true"
            className="mt-3 w-full max-w-5xl border-t border-slate-200 pt-3 [@media(min-height:880px)]:mt-5 [@media(min-height:880px)]:pt-4"
        >
            <div className="text-center">
                <h3 id={headingId} className="text-md font-semibold text-slate-900">
                    {getTranslation('demo_gallery_heading', language)}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">{getTranslation('demo_gallery_subheading', language)}</p>
            </div>

            {datasets === null ? (
                <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <IconLoadingSpinner className="h-4 w-4" />
                    {getTranslation('demo_gallery_loading', language)}
                </p>
            ) : (
                <ul
                    id={listId}
                    data-demo-gallery-grid="true"
                    className="mt-2 grid grid-cols-1 gap-2 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3"
                >
                    {datasets.map((dataset, index) => (
                        <li key={dataset.id} className={`min-w-0 ${getDemoCardVisibilityClass(index, expanded)}`}>
                            <DemoDatasetCard
                                dataset={dataset}
                                language={language}
                                disabled={disabled}
                                status={loadState.datasetId === dataset.id ? loadState.status : 'idle'}
                                onAnalyse={onAnalyse}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {hasHidden && (
                <div className={`mt-1 flex justify-center ${fitsOnTallDesktop && !expanded ? HIDE_ON_TALL_DESKTOP : ''}`}>
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={listId}
                        onClick={() => setExpanded(value => !value)}
                        className={`inline-flex min-h-[44px] items-center rounded-card px-4 text-xs font-semibold [@media(pointer:fine)]:min-h-[32px] text-blue-700 transition-colors hover:bg-blue-50 ${focusRing}`}
                    >
                        {expanded
                            ? getTranslation('demo_gallery_show_fewer', language)
                            : getTranslation('demo_gallery_show_all', language, { count: total })}
                    </button>
                </div>
            )}
        </section>
    );
};
