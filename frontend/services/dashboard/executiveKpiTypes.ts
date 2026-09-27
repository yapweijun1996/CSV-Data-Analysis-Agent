export type ExecutiveKpiTone = 'primary' | 'neutral' | 'accent' | 'warning';

export type ExecutiveKpiHierarchy = 'primary' | 'secondary' | 'insight';

export interface ExecutiveKpiAction {
    type: 'show-card';
}

export interface ExecutiveKpiDelta {
    kind: 'period' | 'distribution';
    direction: 'up' | 'down' | 'flat';
    value: string;
    label: string;
}

export type ExecutiveKpiScopeKind = 'dataset' | 'filtered' | 'top_n' | 'visible_series';

export interface ExecutiveKpiScope {
    kind: ExecutiveKpiScopeKind;
    sourceCardId: string;
    label: string;
    topN?: number;
    rowCount?: number;
    filterSummary?: string;
}

export interface ExecutiveKpi {
    id: string;
    label: string;
    value: string;
    detail: string;
    tone: ExecutiveKpiTone;
    hierarchy: ExecutiveKpiHierarchy;
    sourceCardId?: string;
    scope: ExecutiveKpiScope;
    action?: ExecutiveKpiAction;
    delta?: ExecutiveKpiDelta;
}
