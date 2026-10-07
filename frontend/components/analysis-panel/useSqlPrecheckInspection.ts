import { useCallback, useEffect, useRef } from 'react';
import type { AppStore } from '../../store/useAppStore';
import type { SqlPrecheckFinding, WorkspacePreviewRowsQueryRequest } from '../../types';
import { getTranslation } from '../../utils/localization';

const SQL_PRECHECK_PREVIEW_LIMIT = 25;

/** Opens the data explorer on the columns behind a data-readiness finding. */
export const useSqlPrecheckInspection = (params: {
    columnProfiles: AppStore['columnProfiles'];
    language: Parameters<typeof getTranslation>[1];
    addProgress: AppStore['addProgress'];
    setIsSpreadsheetVisible: AppStore['setIsSpreadsheetVisible'];
    runWorkspaceDataQuery: AppStore['runWorkspaceDataQuery'];
}) => {
    const { columnProfiles, language, addProgress, setIsSpreadsheetVisible, runWorkspaceDataQuery } = params;
    const scrollTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (scrollTimeoutRef.current !== null) {
            window.clearTimeout(scrollTimeoutRef.current);
        }
    }, []);

    return useCallback(async (finding: SqlPrecheckFinding) => {
        const availableColumnNames = Array.isArray(columnProfiles)
            ? columnProfiles.map(profile => profile.name)
            : [];
        const relatedColumns = Array.from(new Set([
            finding.dimension,
            finding.column,
            finding.metric,
        ].filter((value): value is string => Boolean(value && availableColumnNames.includes(value)))));

        if (relatedColumns.length === 0) {
            addProgress(getTranslation('analysis_readiness_columns_unavailable', language), 'warning');
            return;
        }

        setIsSpreadsheetVisible(true);

        try {
            const payload: WorkspacePreviewRowsQueryRequest = {
                templateId: 'preview_rows',
                columns: relatedColumns,
                limit: SQL_PRECHECK_PREVIEW_LIMIT,
                orderBy: null,
            };
            await runWorkspaceDataQuery(payload);
            if (scrollTimeoutRef.current !== null) {
                window.clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = window.setTimeout(() => {
                if (typeof document === 'undefined') {
                    return;
                }
                document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrollTimeoutRef.current = null;
            }, 100);
        } catch (error) {
            addProgress(
                getTranslation('analysis_readiness_inspection_failed', language),
                'error',
            );
            console.warn('[AnalysisPanel] Failed to inspect data-readiness finding.', error);
        }
    }, [addProgress, columnProfiles, language, runWorkspaceDataQuery, setIsSpreadsheetVisible]);
};
