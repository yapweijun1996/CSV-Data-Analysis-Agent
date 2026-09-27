declare module 'tabulator-tables' {
    export interface TabulatorCellComponent {
        getValue(): unknown;
        getRow(): TabulatorRowComponent;
    }

    export interface TabulatorRowComponent {
        getPosition(active?: boolean): number | false;
        toggleSelect(): void;
    }

    export interface TabulatorColumnDefinition {
        title?: string;
        field?: string;
        formatter?: string | ((cell: TabulatorCellComponent) => string);
        tooltip?: boolean | ((event: Event, cell: TabulatorCellComponent) => string);
        cssClass?: string;
        headerSort?: boolean;
        resizable?: boolean;
        frozen?: boolean;
        hozAlign?: 'left' | 'center' | 'right';
        headerHozAlign?: 'left' | 'center' | 'right';
        minWidth?: number;
        width?: number;
        maxWidth?: number;
    }

    export interface TabulatorSortDescriptor {
        column: string;
        dir: 'asc' | 'desc';
    }

    export interface TabulatorOptions {
        data?: Record<string, unknown>[];
        columns?: TabulatorColumnDefinition[];
        index?: string;
        layout?: string;
        layoutColumnsOnNewData?: boolean;
        height?: string | number;
        placeholder?: string;
        pagination?: boolean;
        paginationMode?: 'local' | 'remote';
        paginationSize?: number;
        paginationSizeSelector?: false | boolean | Array<number | true>;
        paginationCounter?: false | 'rows' | 'pages';
        initialSort?: false | TabulatorSortDescriptor[];
        columnHeaderSortMulti?: boolean;
        selectableRows?: boolean | number | 'highlight';
        selectableRowsPersistence?: boolean;
        rowClick?: (event: Event, row: TabulatorRowComponent) => void;
        langs?: Record<string, unknown>;
        locale?: string;
    }

    export class TabulatorFull {
        constructor(element: HTMLElement, options: TabulatorOptions);
        setData(data: Record<string, unknown>[]): void | Promise<void>;
        setColumns(columns: TabulatorColumnDefinition[]): void;
        on(event: string, callback: (...args: unknown[]) => void): void;
        destroy(): void;
    }

    export { TabulatorFull as Tabulator };
}
