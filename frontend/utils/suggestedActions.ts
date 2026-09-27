const INTERNAL_ACTION_PREFIXES = [
    'analysis.',
    'data.',
    'card.',
    'conversation.',
    'spreadsheet.',
    'workspace.',
    'cleaning.',
    'ui.',
] as const;

export interface SuggestedActionEntry {
    label: string;
    action: string;
}

export const isInternalSuggestedAction = (value: string): boolean => {
    const normalized = value.trim();
    if (!normalized) {
        return false;
    }

    return INTERNAL_ACTION_PREFIXES.some(prefix => normalized.startsWith(prefix))
        || /^[a-z]+(?:\.[a-z0-9_]+)+$/.test(normalized);
};

export const resolveSuggestedActionPrompt = (entry: SuggestedActionEntry): string => {
    const label = entry.label.trim();
    const action = entry.action.trim();
    if (!action) {
        return label;
    }

    return isInternalSuggestedAction(action) ? label : action;
};

export const normalizeSuggestedActionEntry = (entry: Partial<SuggestedActionEntry> | null | undefined): SuggestedActionEntry | null => {
    const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
    const action = typeof entry?.action === 'string' ? entry.action.trim() : '';
    if (!label || !action) {
        return null;
    }

    return {
        label,
        action: resolveSuggestedActionPrompt({ label, action }),
    };
};
