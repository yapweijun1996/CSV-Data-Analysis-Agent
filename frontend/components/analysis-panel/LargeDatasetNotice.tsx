import React from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';

/** One neutral line explaining that the full file is queried while previews use a sample. */
export const LargeDatasetNotice: React.FC<{
    rowCount: number;
    sampleRowCount: number;
    language: Settings['language'];
}> = ({ rowCount, sampleRowCount, language }) => (
    <section className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
        <p className="font-semibold text-slate-900">{getTranslation('large_dataset_mode_title', language)}</p>
        <p className="mt-0.5 text-slate-600">
            {getTranslation('large_dataset_mode_body', language, {
                totalRows: rowCount.toLocaleString(),
                sampleRows: sampleRowCount.toLocaleString(),
            })}
        </p>
    </section>
);
