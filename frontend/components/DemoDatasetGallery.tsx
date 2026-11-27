import React, { useEffect, useId, useState } from 'react';
import { IconLoadingSpinner } from '../icons/IconLoadingSpinner';
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

// Collapsed view: three cards on phones and tablets, six on desktop. This keeps
// the gallery from burying the primary upload action while still showing the
// breadth of the catalog. Visibility is CSS-only so no resize listener is needed.
const COLLAPSED_COUNT_SMALL = 3;
const COLLAPSED_COUNT_DESKTOP = 6;

const NUMBER_LOCALES: Record<string, string> = {
    English: 'en-SG',
    Mandarin: 'zh-SG',
    Malay: 'ms-SG',
    Vietnamese: 'vi-VN',
    Japanese: 'ja-JP',
};

// Full class strings so Tailwind's content scanner keeps them.
const THEME_DOT_CLASSES: Record<DemoDatasetTheme, string> = {
    housing: 'bg-blue-500',
    jobs: 'bg-violet-500',
    business: 'bg-amber-500',
    transport: 'bg-emerald-500',
    tourism: 'bg-pink-500',
    environment: 'bg-green-600',
    population: 'bg-sky-500',
};

const formatCount = (value: number, language: string): string =>
    new Intl.NumberFormat(NUMBER_LOCALES[language] ?? 'en-SG').format(value);

const formatSize = (bytes: number): string => {
    const megabyte = 1024 * 1024;
    if (bytes < megabyte) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / megabyte).toFixed(bytes >= 10 * megabyte ? 0 : 1)} MB`;
};

export const getDemoCardVisibilityClass = (index: number, expanded: boolean): string => {
    if (expanded || index < COLLAPSED_COUNT_SMALL) return 'flex';
    if (index < COLLAPSED_COUNT_DESKTOP) return 'hidden lg:flex';
    return 'hidden';
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
            className="flex h-full w-full min-w-0 flex-col rounded-card border border-slate-200 bg-white px-4 pb-1 pt-4 text-left shadow-sm transition-shadow hover:shadow-md"
        >
            <div className="flex flex-wrap items-center gap-1.5">
                {dataset.theme && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-slate-600">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${THEME_DOT_CLASSES[dataset.theme]}`} />
                        {getTranslation(`demo_gallery_theme_${dataset.theme}`, language)}
                    </span>
                )}
                <span
                    data-demo-speed={dataset.speed}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ring-inset ${
                        isSlow
                            ? 'bg-amber-50 text-amber-800 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}
                >
                    {getTranslation(isSlow ? 'demo_gallery_speed_slow' : 'demo_gallery_speed_fast', language)}
                </span>
            </div>
            <h4 id={titleId} className="mt-2 line-clamp-2 break-words text-md font-semibold text-slate-900">
                {title}
            </h4>
            <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600" title={description}>
                {description}
            </p>
            <p className="mt-2 text-xs tabular-nums text-slate-500">
                {stats}
                {dataset.sizeBytes !== null && <> · {formatSize(dataset.sizeBytes)}</>}
            </p>
            <div className="mt-auto pt-3">
                <button
                    type="button"
                    onClick={() => onAnalyse(dataset)}
                    disabled={disabled}
                    aria-label={getTranslation(loading ? 'demo_gallery_loading_dataset_named' : 'demo_gallery_analyse_named', language, { title })}
                    className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-card border-2 border-blue-600 bg-white px-4 py-2 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-blue-600 ${focusRing}`}
                >
                    {loading && <IconLoadingSpinner className="h-4 w-4" />}
                    {getTranslation(loading ? 'demo_gallery_loading_dataset' : 'demo_gallery_analyse', language)}
                </button>
                {status === 'error' && (
                    <p role="alert" className="mt-2 text-xs text-red-600">
                        {getTranslation('demo_gallery_error', language)}
                    </p>
                )}
                {/* The whole two-line footer is the link so the small text still
                    gets a 44px touch target without adding empty space. */}
                <a
                    href={dataset.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group mt-1 flex min-h-[44px] min-w-0 flex-col justify-center rounded-sm py-1 text-2xs text-slate-500 ${focusRing}`}
                >
                    <span className="break-words">
                        {getTranslation('demo_gallery_source_label', language)}:{' '}
                        <span className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 group-hover:decoration-blue-700">
                            {dataset.source.publisher}
                        </span>
                    </span>
                    {dataset.source.licence && (
                        <span className="break-words">
                            <span className="sr-only">{' · '}</span>
                            {dataset.source.licence}
                        </span>
                    )}
                    <span className="sr-only"> {getTranslation('demo_gallery_opens_new_tab', language)}</span>
                </a>
            </div>
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
    const hasHiddenOnSmall = total > COLLAPSED_COUNT_SMALL;
    const hasHiddenOnDesktop = total > COLLAPSED_COUNT_DESKTOP;

    return (
        <section
            aria-labelledby={headingId}
            data-demo-gallery="true"
            className="mt-8 w-full max-w-5xl border-t border-slate-200 pt-6"
        >
            <div className="text-center">
                <h3 id={headingId} className="text-lg font-semibold text-slate-900">
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
                    className="mt-4 grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3"
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

            {hasHiddenOnSmall && (
                <div className={`mt-3 flex justify-center ${hasHiddenOnDesktop ? '' : 'lg:hidden'}`}>
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={listId}
                        onClick={() => setExpanded(value => !value)}
                        className={`inline-flex min-h-[44px] items-center rounded-card px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 ${focusRing}`}
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
