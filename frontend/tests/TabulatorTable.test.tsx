import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabulatorTable } from '../components/spreadsheet/TabulatorTable';

const { tabulatorConstructorMock } = vi.hoisted(() => ({
    tabulatorConstructorMock: vi.fn(),
}));

vi.mock('tabulator-tables', () => ({
    TabulatorFull: tabulatorConstructorMock,
}));

describe('TabulatorTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createInstance = (options?: { autoBuild?: boolean }) => {
        const eventHandlers = new Map<string, (...args: unknown[]) => void>();
        const instance = {
            destroy: vi.fn(),
            setColumns: vi.fn(),
            setData: vi.fn(),
            blockRedraw: vi.fn(),
            restoreRedraw: vi.fn(),
            redraw: vi.fn(),
            on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
                eventHandlers.set(event, callback);
                if (event === 'tableBuilt' && options?.autoBuild !== false) {
                    callback();
                }
            }),
            setSort: vi.fn(),
            clearSort: vi.fn(),
            getSorters: vi.fn(() => []),
        };
        tabulatorConstructorMock.mockImplementation(() => instance);
        return {
            instance,
            emit: (event: string, ...args: unknown[]) => eventHandlers.get(event)?.(...args),
        };
    };

    it('initializes Tabulator with local pagination, selection, and raw-value formatter', async () => {
        createInstance();

        render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 501001, Name: 'Alpha' }]}
                    columns={['Code', 'Name']}
                    pageSize={50}
                    tableKey="clean:sales.csv"
                    language="English"
                    emptyStateText="No data matches your search."
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];

        expect(options.pagination).toBe(true);
        expect(options.paginationMode).toBe('local');
        expect(options.paginationSize).toBe(50);
        expect(options.paginationCounter).toBe('rows');
        expect(options.selectableRows).toBe(1);
        expect(options.selectableRowsPersistence).toBe(false);
        expect(options.columns).toHaveLength(3);
        expect(options.columns[1].title).toBe('A - Code');
        expect(options.columns[2].title).toBe('B - Name');

        const formatted = options.columns[1].formatter({
            getValue: () => 501001,
            getRow: () => ({ getPosition: () => 1, toggleSelect: vi.fn() }),
        });
        expect(formatted).toContain('501001');
        expect(formatted).not.toContain('501,001');
    });

    it('renders blank cells explicitly instead of leaving an unexplained gap', async () => {
        createInstance();

        render(
            <TabulatorTable
                data={[{ Code: '' }]}
                columns={['Code']}
                pageSize={25}
                language="English"
            />,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];
        const formatted = options.columns[1].formatter({ getValue: () => '' });
        const tooltip = options.columns[1].tooltip(null, { getValue: () => null });

        expect(formatted).toContain('(blank)');
        expect(formatted).toContain('italic');
        expect(tooltip).toBe('(blank)');
    });

    it('formats declared aggregate measure columns with a stable two-decimal scale', async () => {
        createInstance();

        render(
            <TabulatorTable
                data={[{ CCY: 'SGD', sum_bal_amount: 71132256.91999997, row_count: 349 }]}
                columns={['CCY', 'sum_bal_amount', 'row_count']}
                measureColumns={['sum_bal_amount']}
                pageSize={25}
                language="English"
            />,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];
        const amount = options.columns[2].formatter({ getValue: () => 71132256.91999997 });
        const count = options.columns[3].formatter({ getValue: () => 349 });

        expect(amount).toContain('71,132,256.92');
        expect(count).toContain('349');
        expect(count).not.toContain('349.00');
    });

    it('uses only the supported locale keys and maps Malay correctly', async () => {
        createInstance();

        render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 501001, Name: 'Alpha' }]}
                    columns={['Code', 'Name']}
                    pageSize={50}
                    tableKey="clean:sales.csv"
                    language="Malay"
                    emptyStateText="Tiada data."
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];
        expect(options.locale).toBe('ms');
        expect(options.langs.ms.pagination.page_size).toBe('Baris');
        expect(Object.keys(options.langs)).toEqual(['ms']);
        expect(options.langs.es).toBeUndefined();
        expect(options.langs.fr).toBeUndefined();
    });

    it('configures database modal variant with page-size selector and sort sync', async () => {
        const { instance } = createInstance();
        const onSortChange = vi.fn();

        render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 501001, Name: 'Alpha' }]}
                    columns={['Code', 'Name']}
                    pageSize={25}
                    pageSizeOptions={[10, 25, 50, 100]}
                    tableKey="database:base"
                    language="English"
                    variant="database-modal"
                    sortState={{ column: 'Code', direction: 'desc' }}
                    onSortChange={onSortChange}
                    containerClassName="h-[calc(100vh-260px)]"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];
        expect(options.paginationSize).toBe(25);
        expect(options.paginationSizeSelector).toEqual([10, 25, 50, 100]);
        expect(options.initialSort).toEqual([{ column: 'Code', dir: 'desc' }]);
        expect(options.columnHeaderSortMulti).toBe(false);
        expect(instance.on).toHaveBeenCalledWith('dataSorted', expect.any(Function));

        const callback = instance.on.mock.calls.find(([event]) => event === 'dataSorted')?.[1] as ((sorters: unknown[]) => void) | undefined;
        expect(callback).toBeTypeOf('function');
        callback([{ field: 'Name', dir: 'asc' }]);
        expect(onSortChange).toHaveBeenCalledWith({ column: 'Name', direction: 'asc' });
    });

    it('does not echo unchanged sort state back to the parent or rebuild on sort-only rerenders', async () => {
        const { instance } = createInstance();
        instance.getSorters.mockReturnValue([{ field: 'Code', dir: 'desc' }]);
        const onSortChange = vi.fn();
        const data = [{ Code: 501001, Name: 'Alpha' }];
        const columns = ['Code', 'Name'];

        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={data}
                    columns={columns}
                    pageSize={25}
                    tableKey="database:base"
                    language="English"
                    variant="database-modal"
                    sortState={{ column: 'Code', direction: 'desc' }}
                    onSortChange={onSortChange}
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const callback = instance.on.mock.calls.find(([event]) => event === 'dataSorted')?.[1] as ((sorters: unknown[]) => void) | undefined;
        expect(callback).toBeTypeOf('function');
        callback([{ field: 'Code', dir: 'desc' }]);

        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={data}
                    columns={columns}
                    pageSize={25}
                    tableKey="database:base"
                    language="English"
                    variant="database-modal"
                    sortState={{ column: 'Code', direction: 'desc' }}
                    onSortChange={onSortChange}
                />
            </div>,
        );

        expect(onSortChange).not.toHaveBeenCalled();
        expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1);
        expect(instance.setSort).not.toHaveBeenCalled();
    });

    it('applies sort changes without rebuilding the table instance', async () => {
        const { instance } = createInstance();
        instance.getSorters.mockReturnValue([]);
        const data = [{ Code: 501001, Name: 'Alpha' }];
        const columns = ['Code', 'Name'];

        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={data}
                    columns={columns}
                    pageSize={25}
                    tableKey="database:base"
                    language="English"
                    variant="database-modal"
                    sortState={{ column: null, direction: 'asc' }}
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={data}
                    columns={columns}
                    pageSize={25}
                    tableKey="database:base"
                    language="English"
                    variant="database-modal"
                    sortState={{ column: 'Name', direction: 'asc' }}
                />
            </div>,
        );

        expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(instance.setSort).toHaveBeenCalledWith('Name', 'asc'));
        expect(instance.destroy).not.toHaveBeenCalled();
    });

    it('renders inline empty state when no columns are available', () => {
        createInstance();
        const { container } = render(
            <TabulatorTable
                data={[]}
                columns={[]}
                pageSize={25}
                tableKey="database:empty"
                language="English"
                emptyStateText="No columns available for this preview."
            />,
        );

        expect(tabulatorConstructorMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain('No columns available for this preview.');
    });

    it('updates table data without rebuilding the table instance', async () => {
        const { instance } = createInstance();
        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 2 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1);
        expect(instance.destroy).not.toHaveBeenCalled();
        expect(instance.setData).toHaveBeenLastCalledWith([{ Code: 2 }]);
    });

    it('updates table columns without rebuilding the table instance', async () => {
        const { instance } = createInstance();
        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1, Name: 'Alpha' }]}
                    columns={['Code', 'Name']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1);
        expect(instance.destroy).not.toHaveBeenCalled();
        expect(instance.setColumns).toHaveBeenLastCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ title: '#' }),
                expect.objectContaining({ title: 'A - Code' }),
                expect.objectContaining({ title: 'B - Name' }),
            ]),
        );
    });

    it('destroys and rebuilds the table when the view key changes', async () => {
        const { instance: firstInstance } = createInstance();
        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="clean"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        createInstance();
        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="raw"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => {
            expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
            expect(tabulatorConstructorMock).toHaveBeenCalledTimes(2);
        });
    });

    it('waits for tableBuilt before issuing redraw-sensitive updates', async () => {
        const { instance, emit } = createInstance({ autoBuild: false });
        const { rerender } = render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 1 }]}
                    columns={['Code']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        rerender(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ Code: 2, Name: 'Alpha' }]}
                    columns={['Code', 'Name']}
                    pageSize={50}
                    tableKey="dataset"
                    language="English"
                />
            </div>,
        );

        expect(instance.blockRedraw).not.toHaveBeenCalled();
        expect(instance.setColumns).not.toHaveBeenCalled();
        expect(instance.setData).not.toHaveBeenCalled();

        emit('tableBuilt');

        expect(instance.blockRedraw).toHaveBeenCalledTimes(1);
        expect(instance.setColumns).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ title: '#' }),
                expect.objectContaining({ title: 'A - Code' }),
                expect.objectContaining({ title: 'B - Name' }),
            ]),
        );
        expect(instance.setData).toHaveBeenCalledWith([{ Code: 2, Name: 'Alpha' }]);
    });
});
