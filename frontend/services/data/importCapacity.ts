export type ImportDeviceClass = 'desktop' | 'mobile';

export interface ImportCapacity {
    deviceClass: ImportDeviceClass;
    maxBytes: number;
    maxRows: number;
}

export interface ImportEnvironment {
    userAgent?: string;
    viewportWidth?: number;
    coarsePointer?: boolean;
}

const MEBIBYTE = 1024 * 1024;

export const DESKTOP_IMPORT_CAPACITY: ImportCapacity = {
    deviceClass: 'desktop',
    maxBytes: 25 * MEBIBYTE,
    maxRows: 100_000,
};

/**
 * Large desktop CSVs bypass main-thread materialisation and are loaded directly
 * into DuckDB. Mobile keeps the normal limit because WebKit/Android memory
 * pressure is much less predictable.
 */
export const DESKTOP_DUCKDB_FILE_CAPACITY: ImportCapacity = {
    deviceClass: 'desktop',
    maxBytes: 100 * MEBIBYTE,
    maxRows: 1_000_000,
};

export const shouldUseDuckDbFileIntake = (
    fileSize: number,
    capacity: ImportCapacity,
): boolean => capacity.deviceClass === 'desktop'
    && fileSize > DESKTOP_IMPORT_CAPACITY.maxBytes
    && fileSize <= DESKTOP_DUCKDB_FILE_CAPACITY.maxBytes;

export const MOBILE_IMPORT_CAPACITY: ImportCapacity = {
    deviceClass: 'mobile',
    maxBytes: 10 * MEBIBYTE,
    maxRows: 50_000,
};

const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Mobile/i;

const readBrowserEnvironment = (): ImportEnvironment => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {};
    }

    return {
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        coarsePointer: typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false,
    };
};

export const resolveImportCapacity = (
    environment: ImportEnvironment = readBrowserEnvironment(),
): ImportCapacity => {
    const mobileUserAgent = MOBILE_USER_AGENT_PATTERN.test(environment.userAgent ?? '');
    const mobileTouchViewport = environment.coarsePointer === true
        && typeof environment.viewportWidth === 'number'
        && environment.viewportWidth <= 1024;

    return mobileUserAgent || mobileTouchViewport
        ? MOBILE_IMPORT_CAPACITY
        : DESKTOP_IMPORT_CAPACITY;
};

export const importCapacityMegabytes = (capacity: ImportCapacity): number =>
    Math.round(capacity.maxBytes / MEBIBYTE);
