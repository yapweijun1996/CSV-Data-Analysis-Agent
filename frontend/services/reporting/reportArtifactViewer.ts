const BLOB_URL_REVOKE_DELAY_MS = 180_000;

const openReportWindow = (
    html: string,
    mode: 'open' | 'print',
): Window | null => {
    if (typeof window === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        return null;
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const targetUrl = mode === 'print' ? `${objectUrl}#print` : objectUrl;
    const openedWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');

    window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
    }, BLOB_URL_REVOKE_DELAY_MS);

    return openedWindow;
};

export const openReportArtifact = (html: string): Window | null => openReportWindow(html, 'open');

export const printReportArtifact = (html: string): Window | null => openReportWindow(html, 'print');
