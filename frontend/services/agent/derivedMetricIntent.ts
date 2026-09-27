const DERIVED_MARGIN_REQUEST = /\b(?:profit|gross)\s+margin\b|利润率|利潤率|利益率|粗利率|margin\s*(?:percentage|%)/i;
const DERIVED_COST_PER_RESULT_REQUEST = /\bcost\s+per\s+result\b|每(?:个|個|次)结果成本|每(?:个|個|次)結果成本|結果単価|結果あたりのコスト/i;
const SHARE_OF_TOTAL_REQUEST = /(?:\b(?:percent(?:age)?|share|proportion)\b[\s\S]{0,80}\b(?:overall|total|whole|full dataset)\b)|(?:\b(?:overall|total|whole|full dataset)\b[\s\S]{0,80}\b(?:percent(?:age)?|share|proportion|represent)\b)|(?:百分比|占比|比例|比率).{0,40}(?:总额|總額|总体|總體|全部|合计|合計)|(?:总额|總額|总体|總體|全部|合计|合計).{0,40}(?:百分比|占比|比例|比率)|(?:全体|合計).{0,40}(?:割合|比率|パーセント)|(?:割合|比率|パーセント).{0,40}(?:全体|合計)/i;

export const isDerivedMarginRequest = (message: string): boolean =>
    DERIVED_MARGIN_REQUEST.test(message);

export const isDerivedCostPerResultRequest = (message: string): boolean =>
    DERIVED_COST_PER_RESULT_REQUEST.test(message);

export const isShareOfTotalRequest = (message: string): boolean =>
    SHARE_OF_TOTAL_REQUEST.test(message);

export const requiresCompleteDerivedMetricEvidence = (message: string): boolean =>
    isDerivedMarginRequest(message) || isDerivedCostPerResultRequest(message);

export const requiresCompleteAggregateEvidence = (message: string): boolean =>
    requiresCompleteDerivedMetricEvidence(message) || isShareOfTotalRequest(message);
