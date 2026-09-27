const ROOT_DIRECTORY = 'csv-analysis-agent-temp';
const SESSION_METADATA_FILE = '.session.json';
export const OPFS_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface OpfsSessionMetadata {
    sessionId: string;
    createdAt: string;
}

type IterableFileSystemDirectoryHandle = FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

const sanitizeSegment = (value: string): string =>
    value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'dataset';

const getOpfsRoot = async (): Promise<FileSystemDirectoryHandle | null> => {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    return navigator.storage.getDirectory();
};

const writeTextFile = async (
    directory: FileSystemDirectoryHandle,
    name: string,
    text: string,
): Promise<void> => {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
};

export const isOpfsAvailable = (): boolean =>
    typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';

/**
 * Stages a large source file in session-scoped origin-private storage. The
 * returned path is metadata only; callers must never persist the File payload
 * in application state.
 */
export const stageDatasetFileInOpfs = async (
    sessionId: string,
    file: File,
): Promise<string | null> => {
    const root = await getOpfsRoot();
    if (!root) return null;
    const appDirectory = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true });
    const safeSessionId = sanitizeSegment(sessionId);
    const sessionDirectory = await appDirectory.getDirectoryHandle(safeSessionId, { create: true });
    const safeFileName = sanitizeSegment(file.name);
    const fileHandle = await sessionDirectory.getFileHandle(safeFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    const metadata: OpfsSessionMetadata = {
        sessionId,
        createdAt: new Date().toISOString(),
    };
    await writeTextFile(sessionDirectory, SESSION_METADATA_FILE, JSON.stringify(metadata));
    return `${ROOT_DIRECTORY}/${safeSessionId}/${safeFileName}`;
};

export const removeOpfsDatasetSession = async (sessionId: string): Promise<void> => {
    const root = await getOpfsRoot();
    if (!root) return;
    try {
        const appDirectory = await root.getDirectoryHandle(ROOT_DIRECTORY);
        await appDirectory.removeEntry(sanitizeSegment(sessionId), { recursive: true });
    } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
    }
};

/** Removes every app-owned OPFS temporary file without touching other origins. */
export const clearAllOpfsDatasetData = async (): Promise<boolean> => {
    const root = await getOpfsRoot();
    if (!root) return true;
    try {
        await root.removeEntry(ROOT_DIRECTORY, { recursive: true });
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return true;
        throw error;
    }
};

export const readDatasetFileFromOpfs = async (path: string): Promise<File | null> => {
    const root = await getOpfsRoot();
    if (!root) return null;
    const segments = path.split('/').filter(Boolean);
    if (segments[0] !== ROOT_DIRECTORY || segments.length !== 3) return null;
    try {
        const appDirectory = await root.getDirectoryHandle(segments[0]);
        const sessionDirectory = await appDirectory.getDirectoryHandle(sanitizeSegment(segments[1]));
        const fileHandle = await sessionDirectory.getFileHandle(sanitizeSegment(segments[2]));
        return fileHandle.getFile();
    } catch {
        return null;
    }
};

const readSessionMetadata = async (
    directory: FileSystemDirectoryHandle,
): Promise<OpfsSessionMetadata | null> => {
    try {
        const handle = await directory.getFileHandle(SESSION_METADATA_FILE);
        const file = await handle.getFile();
        return JSON.parse(await file.text()) as OpfsSessionMetadata;
    } catch {
        return null;
    }
};

/** Removes abandoned temporary imports on startup while preserving active tabs. */
export const cleanupStaleOpfsSessions = async (
    activeSessionIds: string[],
    now = Date.now(),
    maxAgeMs = OPFS_SESSION_MAX_AGE_MS,
): Promise<number> => {
    const root = await getOpfsRoot();
    if (!root) return 0;
    let appDirectory: FileSystemDirectoryHandle;
    try {
        appDirectory = await root.getDirectoryHandle(ROOT_DIRECTORY);
    } catch {
        return 0;
    }
    const active = new Set(activeSessionIds.map(sanitizeSegment));
    let removed = 0;
    for await (const [name, handle] of (appDirectory as IterableFileSystemDirectoryHandle).entries()) {
        if (handle.kind !== 'directory' || active.has(name)) continue;
        const metadata = await readSessionMetadata(handle as FileSystemDirectoryHandle);
        const createdAt = metadata ? new Date(metadata.createdAt).getTime() : 0;
        if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
            await appDirectory.removeEntry(name, { recursive: true });
            removed += 1;
        }
    }
    return removed;
};
