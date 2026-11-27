import type { ProgressMessage } from '../types/app';
import { summarizeDataQualityForEndUser } from '../services/data/dataQualityNotes';

/** Progress text in the current UI language; falls back to the stored text when it cannot be rebuilt. */
export const resolveProgressText = (message: Pick<ProgressMessage, 'text' | 'localize'> | null | undefined, language: string): string | null => {
    if (!message) return null;
    if (message.localize?.kind === 'data_quality') {
        const summary = summarizeDataQualityForEndUser(message.localize.issues, language)?.userSummary;
        if (summary) return summary;
    }
    return message.text;
};
