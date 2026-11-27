import type { AppLanguage } from '../../types';
import { getTranslation } from '../../utils/localization';

/**
 * Demo dataset gallery catalog.
 *
 * The upload screen offers bundled Singapore open datasets. Their metadata
 * lives in `demo-data/catalog.json`, which is deployment data rather than
 * source code, so it is validated defensively here: malformed entries are
 * dropped, and a missing or invalid catalog falls back to the two HDB
 * datasets that have always shipped with the app.
 */

// Relative (no leading slash) so it resolves against <base href> in
// index.html; the app supports deployment from arbitrary subpaths.
export const DEMO_DATA_BASE_PATH = 'demo-data/';
export const DEMO_DATASET_CATALOG_URL = `${DEMO_DATA_BASE_PATH}catalog.json`;
export const DEMO_DATASET_CATALOG_VERSION = 1;

export const DEMO_DATASET_THEMES = [
    'housing',
    'jobs',
    'business',
    'transport',
    'tourism',
    'environment',
    'population',
] as const;

export type DemoDatasetTheme = typeof DEMO_DATASET_THEMES[number];
export type DemoDatasetSpeed = 'fast' | 'slow';

/** English is mandatory so every other language has a fallback. */
export type DemoLocalizedText = { English: string } & Partial<Record<AppLanguage, string>>;

export interface DemoDatasetSource {
    publisher: string;
    datasetIds: string[];
    url: string;
    licence: string | null;
}

export interface DemoDataset {
    id: string;
    /** Bare CSV file name inside `demo-data/`; also used as the uploaded File name. */
    file: string;
    /** Relative fetch URL, derived from `file`. */
    url: string;
    title: DemoLocalizedText;
    description: DemoLocalizedText;
    /** `null` when the catalog names a theme this build does not know yet. */
    theme: DemoDatasetTheme | null;
    rows: number;
    columns: number;
    sizeBytes: number | null;
    speed: DemoDatasetSpeed;
    suggestedQuestion: DemoLocalizedText | null;
    source: DemoDatasetSource;
}

export interface DemoDatasetCatalogResult {
    datasets: DemoDataset[];
    origin: 'catalog' | 'fallback';
}

const APP_LANGUAGES: readonly AppLanguage[] = ['English', 'Mandarin', 'Malay', 'Vietnamese', 'Japanese'];

// A bare file name keeps every fetch inside `demo-data/`: no directories,
// no parent traversal, no absolute or cross-origin URLs.
const SAFE_CSV_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

const nonNegativeInteger = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const parseLocalizedText = (value: unknown): DemoLocalizedText | null => {
    if (!isRecord(value)) return null;
    const english = nonEmptyString(value.English);
    if (!english) return null;
    const text: DemoLocalizedText = { English: english };
    for (const language of APP_LANGUAGES) {
        if (language === 'English') continue;
        const translated = nonEmptyString(value[language]);
        if (translated) text[language] = translated;
    }
    return text;
};

// Source links open in a new tab, so only plain https URLs are accepted;
// this also rules out `javascript:` and `data:` links from a bad catalog.
const parseHttpsUrl = (value: unknown): string | null => {
    const raw = nonEmptyString(value);
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
};

const parseSource = (value: unknown): DemoDatasetSource | null => {
    if (!isRecord(value)) return null;
    const publisher = nonEmptyString(value.publisher);
    const url = parseHttpsUrl(value.url);
    if (!publisher || !url) return null;
    const datasetIds = Array.isArray(value.datasetIds)
        ? value.datasetIds.map(nonEmptyString).filter((id): id is string => id !== null)
        : [];
    return { publisher, datasetIds, url, licence: nonEmptyString(value.licence) };
};

const parseTheme = (value: unknown): DemoDatasetTheme | null =>
    typeof value === 'string' && (DEMO_DATASET_THEMES as readonly string[]).includes(value)
        ? value as DemoDatasetTheme
        : null;

/** Returns a validated dataset, or `null` when a required field is missing or malformed. */
export const parseDemoDatasetEntry = (value: unknown): DemoDataset | null => {
    if (!isRecord(value)) return null;
    const id = nonEmptyString(value.id);
    const file = nonEmptyString(value.file);
    const title = parseLocalizedText(value.title);
    const description = parseLocalizedText(value.description);
    const rows = nonNegativeInteger(value.rows);
    const columns = nonNegativeInteger(value.columns);
    const speed = value.speed === 'fast' || value.speed === 'slow' ? value.speed : null;
    const source = parseSource(value.source);
    if (!id || !file || !SAFE_CSV_FILE_NAME.test(file) || file.includes('..')) return null;
    if (!title || !description || rows === null || columns === null || !speed || !source) return null;
    return {
        id,
        file,
        url: `${DEMO_DATA_BASE_PATH}${file}`,
        title,
        description,
        theme: parseTheme(value.theme),
        rows,
        columns,
        sizeBytes: nonNegativeInteger(value.sizeBytes),
        speed,
        suggestedQuestion: parseLocalizedText(value.suggestedQuestion),
        source,
    };
};

/**
 * Validates a parsed `catalog.json` document. Returns `null` when the document
 * itself is unusable or contains no valid dataset, so the caller can fall back.
 */
export const parseDemoDatasetCatalog = (value: unknown): DemoDataset[] | null => {
    if (!isRecord(value) || value.version !== DEMO_DATASET_CATALOG_VERSION || !Array.isArray(value.datasets)) {
        return null;
    }
    const seenIds = new Set<string>();
    const datasets: DemoDataset[] = [];
    for (const entry of value.datasets) {
        const dataset = parseDemoDatasetEntry(entry);
        if (!dataset || seenIds.has(dataset.id)) continue;
        seenIds.add(dataset.id);
        datasets.push(dataset);
    }
    return datasets.length > 0 ? datasets : null;
};

const localizedFromTranslation = (key: string): DemoLocalizedText => {
    const text: DemoLocalizedText = { English: getTranslation(key, 'English') };
    for (const language of APP_LANGUAGES) {
        if (language !== 'English') text[language] = getTranslation(key, language);
    }
    return text;
};

const HDB_SOURCE: DemoDatasetSource = {
    publisher: 'Housing & Development Board',
    datasetIds: [
        'd_ebc5ab87086db484f88045b47411ebc5',
        'd_43f493c6c50d54243cc1eab0df142d6a',
        'd_2d5ff9ea31397b66239f245f57751537',
        'd_ea9ed51da2787afaf8e51f827c304208',
        'd_8b84c4ee58e3cfc0ece0d773c8ca6abc',
    ],
    url: 'https://data.gov.sg/collections/189/view',
    licence: 'Singapore Open Data Licence',
};

/**
 * The two HDB datasets that ship in `demo-data/` regardless of the catalog.
 * Row and size figures come from `demo-data/singapore-hdb-resale-prices.manifest.json`.
 */
export const getBuiltInDemoDatasets = (): DemoDataset[] => [
    {
        id: 'sg-hdb-resale-sample',
        file: 'singapore-hdb-resale-prices-sample.csv',
        url: `${DEMO_DATA_BASE_PATH}singapore-hdb-resale-prices-sample.csv`,
        title: localizedFromTranslation('demo_dataset_hdb_sample_title'),
        description: localizedFromTranslation('demo_dataset_hdb_sample_description'),
        theme: 'housing',
        rows: 4988,
        columns: 11,
        sizeBytes: 423089,
        speed: 'fast',
        suggestedQuestion: localizedFromTranslation('demo_dataset_hdb_sample_question'),
        source: { ...HDB_SOURCE, datasetIds: [...HDB_SOURCE.datasetIds] },
    },
    {
        id: 'sg-hdb-resale-full',
        file: 'singapore-hdb-resale-prices.csv',
        url: `${DEMO_DATA_BASE_PATH}singapore-hdb-resale-prices.csv`,
        title: localizedFromTranslation('demo_dataset_hdb_full_title'),
        description: localizedFromTranslation('demo_dataset_hdb_full_description'),
        theme: 'housing',
        rows: 982589,
        columns: 11,
        sizeBytes: 83320843,
        speed: 'slow',
        suggestedQuestion: localizedFromTranslation('demo_dataset_hdb_full_question'),
        source: { ...HDB_SOURCE, datasetIds: [...HDB_SOURCE.datasetIds] },
    },
];

/** Picks the requested language and falls back to English. */
export const resolveDemoText = (text: DemoLocalizedText, language: string): string =>
    (APP_LANGUAGES as readonly string[]).includes(language)
        ? text[language as AppLanguage] || text.English
        : text.English;

type FetchLike = (input: string) => Promise<Response>;

/** Fetches and validates the catalog; never rejects. */
export const fetchDemoDatasetCatalog = async (
    fetchImpl: FetchLike = input => fetch(input),
): Promise<DemoDatasetCatalogResult> => {
    try {
        const response = await fetchImpl(DEMO_DATASET_CATALOG_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const datasets = parseDemoDatasetCatalog(await response.json());
        if (datasets) return { datasets, origin: 'catalog' };
        console.warn('[DemoDatasetCatalog] Catalog has no valid datasets; using the built-in HDB demos.');
    } catch (error) {
        console.warn('[DemoDatasetCatalog] Catalog unavailable; using the built-in HDB demos.', error);
    }
    return { datasets: getBuiltInDemoDatasets(), origin: 'fallback' };
};

let cachedCatalog: Promise<DemoDatasetCatalogResult> | null = null;

/**
 * Memoized loader for the upload screen. A valid catalog is kept for the page
 * lifetime so returning to the upload screen does not flash; a fallback result
 * is not kept, so the next visit retries (for example after a network blip).
 */
export const loadDemoDatasetCatalog = (): Promise<DemoDatasetCatalogResult> => {
    if (!cachedCatalog) {
        const pending = fetchDemoDatasetCatalog();
        cachedCatalog = pending;
        void pending.then(result => {
            if (result.origin === 'fallback' && cachedCatalog === pending) cachedCatalog = null;
        });
    }
    return cachedCatalog;
};

export const __resetDemoDatasetCatalogCacheForTests = (): void => {
    cachedCatalog = null;
};
