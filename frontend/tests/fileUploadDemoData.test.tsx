import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileUpload } from '../components/FileUpload';
import { getDemoCardVisibilityClass } from '../components/DemoDatasetGallery';
import { __resetDemoDatasetCatalogCacheForTests } from '../services/data/demoDatasetCatalog';

const handleFileUpload = vi.fn();
const storeState = {
    handleFileUpload,
    isBusy: false,
    isApiKeySet: true,
    progressMessages: [] as Array<{
        text: string;
        type: 'system' | 'warning' | 'error';
    }>,
    csvData: null as { fileName: string } | null,
    settings: { language: 'English' as string },
    cleaningRun: null as { status: string } | null,
    aiTaskStatus: null,
    setIsDebugLogsModalOpen: vi.fn(),
    datasetBundle: null as unknown,
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

const THEMES = ['housing', 'jobs', 'business', 'transport', 'tourism', 'environment', 'population'];

const catalogEntry = (index: number) => ({
    id: `sg-demo-${index}`,
    file: `sg-demo-${index}.csv`,
    title: { English: `Dataset ${index}`, Mandarin: `数据集 ${index}`, Malay: `Set data ${index}`, Japanese: `データセット ${index}` },
    description: { English: `Description ${index}` },
    theme: THEMES[index % THEMES.length],
    rows: 4988 + index,
    columns: 11,
    sizeBytes: 423089,
    speed: index === 1 ? 'slow' : 'fast',
    suggestedQuestion: { English: `Question ${index}` },
    source: {
        publisher: `Publisher ${index}`,
        datasetIds: [`d_${index}`],
        url: `https://data.gov.sg/datasets/d_${index}/view`,
        licence: 'Singapore Open Data Licence',
    },
});

const catalog = (count: number) => ({
    version: 1,
    datasets: Array.from({ length: count }, (_, index) => catalogEntry(index)),
});

type CatalogBody = ReturnType<typeof catalog> | null;

const stubFetch = (catalogBody: CatalogBody, csvStatus = 200) => {
    const fetchMock = vi.fn(async (input: string) => {
        if (input === 'demo-data/catalog.json') {
            return catalogBody
                ? new Response(JSON.stringify(catalogBody), { status: 200 })
                : new Response('Not found', { status: 404 });
        }
        return csvStatus === 200
            ? new Response(new Blob(['a,b\n1,2\n']), { status: 200 })
            : new Response(null, { status: csvStatus });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

const csvFetchCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls.filter(([input]) => input !== 'demo-data/catalog.json');

describe('FileUpload demo dataset gallery', () => {
    beforeEach(() => {
        __resetDemoDatasetCatalogCacheForTests();
        handleFileUpload.mockReset();
        storeState.isApiKeySet = true;
        storeState.isBusy = false;
        storeState.csvData = null;
        storeState.progressMessages = [];
        storeState.settings = { language: 'English' };
        storeState.datasetBundle = null;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('lists slow (large) datasets after the fast ones', async () => {
        stubFetch(catalog(4));
        render(<FileUpload />);

        const buttons = await screen.findAllByRole('button', { name: /^Analyse this data: / });
        expect(buttons.map(button => button.getAttribute('aria-label') ?? button.textContent))
            .toEqual(expect.arrayContaining([expect.stringContaining('Dataset 1')]));
        const names = buttons.map(button => button.getAttribute('aria-label') ?? '');
        expect(names[names.length - 1]).toContain('Dataset 1');
        expect(names[0]).toContain('Dataset 0');
    });

    it('keeps the upload action first and renders one card per catalog dataset', async () => {
        stubFetch(catalog(2));
        render(<FileUpload />);

        expect(screen.getByRole('heading', { name: 'Upload a CSV to begin' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select a file' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Or try a Singapore open dataset' })).toBeInTheDocument();

        const list = await screen.findByRole('list');
        const cards = within(list).getAllByRole('listitem');
        expect(cards).toHaveLength(2);

        const first = within(cards[0]);
        expect(first.getByRole('heading', { name: 'Dataset 0' })).toBeInTheDocument();
        expect(first.getByText('Description 0')).toBeInTheDocument();
        expect(first.getByText('Housing')).toBeInTheDocument();
        expect(first.getByText('Fast')).toBeInTheDocument();
        expect(first.getByText(/4,988 rows · 11 columns/)).toBeInTheDocument();
        expect(first.getByText('Singapore Open Data Licence')).toBeInTheDocument();
        expect(first.getByText('Publisher 0')).toBeInTheDocument();
        expect(within(cards[1]).getByText('Large · takes longer')).toBeInTheDocument();

        const selectButton = screen.getByRole('button', { name: 'Select a file' });
        const firstAnalyse = first.getByRole('button', { name: 'Analyse this data: Dataset 0' });
        expect(selectButton.compareDocumentPosition(firstAnalyse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('loads the selected dataset file through handleFileUpload', async () => {
        const fetchMock = stubFetch(catalog(3));
        render(<FileUpload />);

        fireEvent.click(await screen.findByRole('button', { name: 'Analyse this data: Dataset 2' }));

        await waitFor(() => expect(handleFileUpload).toHaveBeenCalledTimes(1));
        const [file] = handleFileUpload.mock.calls[0];
        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe('sg-demo-2.csv');
        expect(file.type).toBe('text/csv');
        expect(csvFetchCalls(fetchMock)).toEqual([['demo-data/sg-demo-2.csv']]);
    });

    it('falls back to the built-in HDB datasets when the catalog is missing', async () => {
        const fetchMock = stubFetch(null);
        render(<FileUpload />);

        expect(await screen.findByRole('button', { name: /HDB resale prices \(full history\)/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Analyse this data: HDB resale prices (small sample)' }));

        await waitFor(() => expect(handleFileUpload).toHaveBeenCalledTimes(1));
        expect(handleFileUpload.mock.calls[0][0].name).toBe('singapore-hdb-resale-prices-sample.csv');
        expect(csvFetchCalls(fetchMock)).toEqual([['demo-data/singapore-hdb-resale-prices-sample.csv']]);
    });

    it('shows the error only on the card whose file failed and does not upload', async () => {
        stubFetch(catalog(2), 404);
        render(<FileUpload />);

        fireEvent.click(await screen.findByRole('button', { name: 'Analyse this data: Dataset 1' }));

        const cards = screen.getAllByRole('listitem');
        await waitFor(() => expect(within(cards[1]).getByRole('alert')).toHaveTextContent('Could not load this dataset'));
        expect(within(cards[0]).queryByRole('alert')).not.toBeInTheDocument();
        expect(handleFileUpload).not.toHaveBeenCalled();
        expect(within(cards[1]).getByRole('button', { name: 'Analyse this data: Dataset 1' })).toBeEnabled();
    });

    it('disables every card while one dataset is loading and names the loading card', async () => {
        let resolveCsv: (response: Response) => void = () => {};
        vi.stubGlobal('fetch', vi.fn((input: string) => input === 'demo-data/catalog.json'
            ? Promise.resolve(new Response(JSON.stringify(catalog(2)), { status: 200 }))
            : new Promise<Response>(resolve => { resolveCsv = resolve; })));
        render(<FileUpload />);

        fireEvent.click(await screen.findByRole('button', { name: 'Analyse this data: Dataset 0' }));

        expect(await screen.findByRole('button', { name: 'Loading Dataset 0…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Analyse this data: Dataset 1' })).toBeDisabled();

        resolveCsv(new Response(new Blob(['a\n1\n']), { status: 200 }));
        await waitFor(() => expect(handleFileUpload).toHaveBeenCalledTimes(1));
    });

    it('keeps the cards visible but disabled while busy or restoring', async () => {
        const fetchMock = stubFetch(catalog(2));
        storeState.isBusy = true;
        const { rerender } = render(<FileUpload />);

        const button = await screen.findByRole('button', { name: 'Analyse this data: Dataset 0' });
        expect(button).toBeDisabled();

        storeState.isBusy = false;
        rerender(<FileUpload isWorkspaceRestoring />);
        expect(screen.getByRole('button', { name: 'Preparing upload…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Analyse this data: Dataset 0' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Analyse this data: Dataset 0' }));
        expect(csvFetchCalls(fetchMock)).toHaveLength(0);
        expect(handleFileUpload).not.toHaveBeenCalled();
    });

    it('disables the cards when the API key is not set during workspace restore', async () => {
        stubFetch(catalog(1));
        storeState.isApiKeySet = false;
        render(<FileUpload isWorkspaceRestoring />);

        expect(await screen.findByRole('button', { name: 'Analyse this data: Dataset 0' })).toBeDisabled();
    });

    it('does not render the upload surface or the gallery when no provider is configured', () => {
        const fetchMock = stubFetch(catalog(2));
        storeState.isApiKeySet = false;
        render(<FileUpload />);

        expect(screen.queryByText('Or try a Singapore open dataset')).not.toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('hides the gallery while a saved analysis is waiting for its original CSV', () => {
        stubFetch(catalog(2));
        storeState.datasetBundle = { source: { fileName: 'original.csv' } };
        render(<FileUpload />);

        expect(screen.queryByText('Or try a Singapore open dataset')).not.toBeInTheDocument();
    });

    it('opens the source link safely in a new tab', async () => {
        stubFetch(catalog(1));
        render(<FileUpload />);

        const link = await screen.findByRole('link', {
            name: 'Source: Publisher 0 · Singapore Open Data Licence (opens in a new tab)',
        });
        expect(link).toHaveAttribute('href', 'https://data.gov.sg/datasets/d_0/view');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('localizes the gallery and falls back to English for missing catalog strings', async () => {
        stubFetch(catalog(1));
        storeState.settings = { language: 'Japanese' };
        render(<FileUpload />);

        expect(screen.getByRole('heading', { name: 'またはシンガポールのオープンデータを試す' })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: 'このデータを分析：データセット 0' })).toBeInTheDocument();
        expect(screen.getByText('Description 0')).toBeInTheDocument();
        expect(screen.getByText(/4,988 行 · 11 列/)).toBeInTheDocument();
    });

    it('keeps a file-processing error visible after returning to the upload surface', () => {
        stubFetch(catalog(1));
        storeState.progressMessages = [{
            text: 'File Processing Error: malformed quoted row',
            type: 'error',
        }];

        render(<FileUpload />);

        expect(screen.getByRole('alert')).toHaveTextContent('This CSV could not be imported');
        expect(screen.getByRole('alert')).toHaveTextContent('File Processing Error: malformed quoted row');
    });

    it('keeps the upload flow visible but unavailable while the workspace is restoring', () => {
        stubFetch(catalog(1));
        render(<FileUpload isWorkspaceRestoring />);

        const restoring = screen.getByText('Preparing AI Analysis').closest('[role="status"]');
        expect(restoring).toHaveTextContent('Upload will be available as soon as the workspace is ready.');
        expect(screen.getByRole('button', { name: 'Preparing upload…' })).toBeDisabled();
    });
});

// jsdom has no layout engine, so this pins the class contract that a real
// browser measured: one column on phones, two on tablets, three on desktop,
// equal-height cards, 44px targets, and a collapsed view that never buries
// the upload action.
describe('demo dataset gallery layout contract', () => {
    beforeEach(() => {
        __resetDemoDatasetCatalogCacheForTests();
        storeState.isApiKeySet = true;
        storeState.isBusy = false;
        storeState.datasetBundle = null;
        storeState.settings = { language: 'English' };
        storeState.progressMessages = [];
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('uses a 1/2/3 column grid with equal-height cards and 44px targets', async () => {
        stubFetch(catalog(7));
        const { container } = render(<FileUpload />);

        const grid = await screen.findByRole('list');
        expect(grid.getAttribute('data-demo-gallery-grid')).toBe('true');
        for (const name of ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'sm:auto-rows-fr']) {
            expect(grid.classList).toContain(name);
        }

        const gallery = container.querySelector('[data-demo-gallery="true"]')!;
        expect(gallery.classList).toContain('w-full');
        expect(gallery.classList).toContain('max-w-5xl');

        const card = container.querySelector('[data-demo-dataset-card="sg-demo-0"]')!;
        expect(card.classList).toContain('h-full');
        expect(card.classList).toContain('min-w-0');
        expect(card.querySelector('h4')!.classList).toContain('sm:line-clamp-2');

        const buttons = within(gallery as HTMLElement).getAllByRole('button');
        for (const button of buttons) {
            expect(button.classList).toContain('min-h-[44px]');
            expect(button.className).toContain('focus-visible:ring-2');
        }
        for (const link of within(gallery as HTMLElement).getAllByRole('link')) {
            expect(link.classList).toContain('min-h-[44px]');
        }

        // The drop zone grows with the gallery instead of clipping its top.
        const dropZone = container.firstElementChild!;
        expect(dropZone.classList).toContain('min-h-full');
        expect(dropZone.classList).not.toContain('h-full');
        expect(dropZone.classList).toContain('p-3');
        expect(dropZone.classList).toContain('sm:p-4');
    });

    it('shows 2 cards by default and reveals more on roomier viewports until "Show all" is pressed', async () => {
        stubFetch(catalog(10));
        render(<FileUpload />);

        const items = within(await screen.findByRole('list')).getAllByRole('listitem', { hidden: true });
        const classes = items.map(item => item.className.replace('min-w-0 ', ''));
        expect(classes.slice(0, 2)).toEqual(['flex', 'flex']);
        expect(classes.slice(2).every(value => value.startsWith('hidden '))).toBe(true);
        expect(classes[2]).toContain('lg:flex');
        expect(classes[3]).toContain('min-height:800px');
        expect(classes[9]).toContain('min-height:900px');

        const toggle = screen.getByRole('button', { name: 'Show all 10 datasets' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);
        expect(screen.getByRole('button', { name: 'Show fewer datasets' })).toHaveAttribute('aria-expanded', 'true');
        expect(items.every(item => item.classList.contains('flex') && !item.classList.contains('hidden'))).toBe(true);
    });

    it('hides the toggle on tall desktops when every dataset already fits', async () => {
        stubFetch(catalog(5));
        render(<FileUpload />);

        await screen.findByRole('list');
        expect(screen.getByRole('button', { name: 'Show all 5 datasets' }).parentElement!.className).toContain('min-height:900px');
    });

    it('omits the toggle when two or fewer datasets exist', async () => {
        stubFetch(catalog(2));
        render(<FileUpload />);

        await screen.findByRole('list');
        expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
        expect(getDemoCardVisibilityClass(1, false)).toBe('flex');
    });
});
