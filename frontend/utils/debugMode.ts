/**
 * Developer-only features (e.g. Pi Browser Lab) are enabled only when the page
 * URL carries `debug_yn=y` in the query string (works with a GitHub Pages base
 * path) or in the hash route query (e.g. `#/route?debug_yn=y`).
 */
export const isDebugModeEnabled = (loc: Pick<Location, 'search' | 'hash'> | undefined =
    typeof window !== 'undefined' ? window.location : undefined): boolean => {
    if (!loc) return false;
    const isOn = (params: URLSearchParams) => params.get('debug_yn')?.toLowerCase() === 'y';
    try {
        if (isOn(new URLSearchParams(loc.search))) return true;
        const hash = loc.hash || '';
        const queryIndex = hash.indexOf('?');
        return queryIndex >= 0 && isOn(new URLSearchParams(hash.slice(queryIndex + 1)));
    } catch {
        return false;
    }
};
