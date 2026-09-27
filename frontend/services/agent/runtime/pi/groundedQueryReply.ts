import type { ActiveDataQuery, AppLanguage } from '../../../../types';
import {
    isDerivedCostPerResultRequest,
    isDerivedMarginRequest,
    isShareOfTotalRequest,
} from '../../derivedMetricIntent';

const ENGLISH_COMPLETE_LIST = /\b(all|every|each|complete|entire)\b[\s\S]{0,80}\b(list|show|include|enumerate|breakdown|result|row|value|category|uom)\b|\b(list|show|include|enumerate)\b[\s\S]{0,80}\b(all|every|each|complete|entire)\b/i;
const MANDARIN_COMPLETE_LIST = /(全部|所有|每个|每一|逐一|完整).{0,40}(列出|显示|清单|结果|行|数值|类别)|(列出|显示|清单).{0,40}(全部|所有|每个|每一|逐一|完整)/;
const JAPANESE_COMPLETE_LIST = /(すべて|全て|各|完全).{0,40}(一覧|表示|列挙|結果|行|値|カテゴリ)|(一覧|表示|列挙).{0,40}(すべて|全て|各|完全)/;
const TOP_N_REQUEST_PATTERNS = [
    /\btop\s*(\d{1,2})\b/i,
    /前\s*(\d{1,2})\s*(?:名|个|個|项|項|家)?/,
    /上位\s*(\d{1,2})/,
    /(?:teratas|tertinggi)\s*(\d{1,2})/i,
];
const ENGLISH_NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
};
const PROFIT_MEASURE = /\bprofit\b|gross[\s_-]*margin|利润|利潤|利益|粗利/i;
const SALES_MEASURE = /sales[\s_-]*amount|net[\s_-]*sales|\brevenue\b|\bturnover\b|销售额|銷售額|营业额|營業額|売上/i;
const SPEND_MEASURE = /amount[\s_-]*spent|ad[\s_-]*spend|\bspend\b|\bcost\b|花费|花費|支出|消費額/i;
const RESULT_MEASURE = /\bresults?\b|\bconversions?\b|转化|轉化|结果|結果/i;
const LOWEST_RANKING_REQUEST = /\blowest\b|\bsmallest\b|\bminimum\b|\bcheapest\b|最低|最小|最少|低い|最小/i;
const HIGHEST_RANKING_REQUEST = /\bhighest\b|\blargest\b|\bmaximum\b|\btop\b|最高|最大|最多|最も高い|最大/i;
const QUALITY_CAVEAT_REQUEST = /\b(?:quality|data quality|caveat|warning|limitation|risk)\b|质量|品質|警告|限制|注意点|留意点|リスク/i;

const isCompleteListRequest = (message: string): boolean =>
    ENGLISH_COMPLETE_LIST.test(message)
    || MANDARIN_COMPLETE_LIST.test(message)
    || JAPANESE_COMPLETE_LIST.test(message);

const escapeMarkdownCell = (value: string): string =>
    value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();

const resolveLocale = (language: AppLanguage): string => {
    switch (language) {
        case 'Mandarin': return 'zh-CN';
        case 'Japanese': return 'ja-JP';
        case 'Malay': return 'ms-MY';
        default: return 'en-US';
    }
};

const humanizeColumn = (column: string): string =>
    column.replace(/_/g, ' ').replace(/\b\w/g, value => value.toUpperCase());

const formatCell = (
    value: unknown,
    column: string,
    query: ActiveDataQuery,
    language: AppLanguage,
): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return escapeMarkdownCell(String(value));
    }

    const aggregate = query.plan.aggregates?.find(item => item.as === column);
    if (!aggregate) return escapeMarkdownCell(String(value));
    const fractionDigits = aggregate.function === 'count' || aggregate.function === 'count_distinct'
        ? 0
        : 2;
    return new Intl.NumberFormat(resolveLocale(language), {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);
};

const getCopy = (language: AppLanguage, rowCount: number) => {
    switch (language) {
        case 'Mandarin':
            return {
                intro: `以下是查询返回的完整 ${rowCount} 行结果：`,
                evidence: '证据',
                rows: '行',
            };
        case 'Japanese':
            return {
                intro: `クエリが返した完全な ${rowCount} 行の結果です：`,
                evidence: '根拠',
                rows: '行',
            };
        case 'Malay':
            return {
                intro: `Berikut ialah hasil lengkap ${rowCount} baris yang dikembalikan oleh pertanyaan:`,
                evidence: 'Bukti',
                rows: 'baris',
            };
        default:
            return {
                intro: `Here is the complete ${rowCount}-row query result:`,
                evidence: 'Evidence',
                rows: 'rows',
            };
    }
};

const getShareOfTotalCopy = (language: AppLanguage) => {
    switch (language) {
        case 'Mandarin':
            return {
                intro: '查询结果中占总额最高的分组是：',
                group: '分组',
                value: '分组总额',
                overall: '总体总额',
                share: '占比',
                calculation: '计算',
                evidence: '证据',
                caveat: '数据质量提醒',
                noCaveat: '此次回答没有记录到特定的数据集质量警告。',
                rows: '行',
            };
        case 'Japanese':
            return {
                intro: 'クエリ結果で全体に占める割合が最も高いグループは次のとおりです：',
                group: 'グループ',
                value: 'グループ合計',
                overall: '全体合計',
                share: '割合',
                calculation: '計算',
                evidence: '根拠',
                caveat: 'データ品質上の注意',
                noCaveat: 'この回答に関する特定のデータ品質警告は記録されていません。',
                rows: '行',
            };
        case 'Malay':
            return {
                intro: 'Kumpulan dengan bahagian tertinggi daripada jumlah keseluruhan ialah:',
                group: 'Kumpulan',
                value: 'Jumlah kumpulan',
                overall: 'Jumlah keseluruhan',
                share: 'Bahagian',
                calculation: 'Pengiraan',
                evidence: 'Bukti',
                caveat: 'Peringatan kualiti data',
                noCaveat: 'Tiada amaran kualiti data khusus direkodkan untuk jawapan ini.',
                rows: 'baris',
            };
        default:
            return {
                intro: 'The group with the highest share of the overall total is:',
                group: 'Group',
                value: 'Group Total',
                overall: 'Overall Total',
                share: 'Share',
                calculation: 'Calculation',
                evidence: 'Evidence',
                caveat: 'Data quality caveat',
                noCaveat: 'No specific dataset-level quality warning was recorded for this answer.',
                rows: 'rows',
            };
    }
};

const isCompleteBoundedAggregateQuery = (query: ActiveDataQuery): boolean => {
    const { result, plan } = query;
    return result.truncated !== true
        && result.returnedRows > 0
        && result.returnedRows <= 25
        && result.returnedRows === result.totalMatchedRows
        && result.rows.length === result.returnedRows
        && (plan.groupBy?.length ?? 0) > 0
        && (plan.aggregates?.length ?? 0) > 0
        && result.selectedColumns.length > 0
        && result.selectedColumns.length <= 8;
};

export const buildGroundedRankedShareReply = (params: {
    userMessage: string;
    query: ActiveDataQuery | null;
    fileName: string | null;
    language: AppLanguage;
    qualityCaveats?: string[] | null;
}): string | null => {
    const { userMessage, query, fileName, language, qualityCaveats } = params;
    if (
        !query
        || !isShareOfTotalRequest(userMessage)
        || (!HIGHEST_RANKING_REQUEST.test(userMessage) && !LOWEST_RANKING_REQUEST.test(userMessage))
    ) {
        return null;
    }

    const { plan, result } = query;
    const sumAggregates = (plan.aggregates ?? []).filter(aggregate => (
        aggregate.function === 'sum'
        && result.selectedColumns.includes(aggregate.as)
    ));
    if (
        result.truncated === true
        || result.returnedRows < 1
        || result.returnedRows > 500
        || result.returnedRows !== result.totalMatchedRows
        || result.rows.length !== result.returnedRows
        || (plan.groupBy?.length ?? 0) < 1
        || sumAggregates.length !== 1
    ) {
        return null;
    }

    const aggregate = sumAggregates[0];
    const rankedRows = result.rows
        .map(row => ({ row, value: Number(row[aggregate.as]) }))
        .filter((entry): entry is { row: typeof entry.row; value: number } => Number.isFinite(entry.value));
    const overall = rankedRows.reduce((total, entry) => total + entry.value, 0);
    if (rankedRows.length === 0 || overall === 0) return null;

    rankedRows.sort((left, right) => LOWEST_RANKING_REQUEST.test(userMessage)
        ? left.value - right.value
        : right.value - left.value);
    const winner = rankedRows[0];
    const share = winner.value / overall;
    if (!Number.isFinite(share)) return null;

    const copy = getShareOfTotalCopy(language);
    const groupColumns = plan.groupBy ?? [];
    const groupLabel = groupColumns
        .map(column => `${humanizeColumn(column)}: ${formatCell(winner.row[column], column, query, language)}`)
        .join(' · ');
    const formattedValue = formatCell(winner.value, aggregate.as, query, language);
    const formattedOverall = new Intl.NumberFormat(resolveLocale(language), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(overall);
    const formattedShare = `${new Intl.NumberFormat(resolveLocale(language), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(share * 100)}%`;
    const source = fileName?.trim() || 'current dataset';

    const caveatLines = QUALITY_CAVEAT_REQUEST.test(userMessage)
        ? [
            '',
            `**${copy.caveat}:** ${qualityCaveats?.find(value => value.trim()) ?? copy.noCaveat}`,
        ]
        : [];

    return [
        copy.intro,
        '',
        `- **${copy.group}:** ${groupLabel}`,
        `- **${copy.value}:** ${formattedValue}`,
        `- **${copy.overall}:** ${formattedOverall}`,
        `- **${copy.share}:** ${formattedShare}`,
        '',
        `**${copy.calculation}:** ${formattedValue} ÷ ${formattedOverall} × 100 = **${formattedShare}**`,
        ...caveatLines,
        '',
        `_${copy.evidence}: ${escapeMarkdownCell(source)} · complete grouped query, ${result.returnedRows}/${result.totalMatchedRows} ${copy.rows} · ${escapeMarkdownCell(query.explanation)}_`,
    ].join('\n');
};

export const buildIncompleteRankedShareReply = (params: {
    userMessage: string;
    query: ActiveDataQuery | null;
    language: AppLanguage;
}): string | null => {
    const { userMessage, query, language } = params;
    if (
        !query
        || !isShareOfTotalRequest(userMessage)
        || (!HIGHEST_RANKING_REQUEST.test(userMessage) && !LOWEST_RANKING_REQUEST.test(userMessage))
        || (
            query.result.truncated !== true
            && query.result.returnedRows === query.result.totalMatchedRows
        )
    ) {
        return null;
    }

    const coverage = `${query.result.returnedRows}/${query.result.totalMatchedRows}`;
    switch (language) {
        case 'Mandarin':
            return `目前不能可靠计算全量占比：分组查询只返回了 ${coverage} 行。请先运行完整分组查询；在证据完整前不会估算或输出可信结论。`;
        case 'Japanese':
            return `全体比率を信頼できる形で計算できません。グループ化クエリは ${coverage} 行のみ返しました。完全なクエリ結果が得られるまで推定値は表示しません。`;
        case 'Malay':
            return `Bahagian keseluruhan belum boleh dikira dengan yakin kerana pertanyaan terkumpul hanya memulangkan ${coverage} baris. Anggaran tidak akan dipaparkan sehingga hasil lengkap tersedia.`;
        default:
            return `I cannot calculate a reliable full-dataset share because the grouped query returned only ${coverage} rows. I will not estimate or present a trusted percentage until a complete grouped query is available.`;
    }
};

const readRequestedTopN = (message: string): number | null => {
    for (const pattern of TOP_N_REQUEST_PATTERNS) {
        const match = message.match(pattern);
        if (!match) continue;
        const value = Number(match[1]);
        if (Number.isInteger(value) && value > 0 && value <= 25) return value;
    }
    const wordMatch = message.match(new RegExp(
        `(?:\\b(?:top|bottom|lowest|highest)\\s+(${Object.keys(ENGLISH_NUMBER_WORDS).join('|')})\\b|\\b(${Object.keys(ENGLISH_NUMBER_WORDS).join('|')})\\s+(?:lowest|highest|smallest|largest)\\b)`,
        'i',
    ));
    if (wordMatch) {
        return ENGLISH_NUMBER_WORDS[(wordMatch[1] ?? wordMatch[2]).toLowerCase()] ?? null;
    }
    return null;
};

const isBoundedMarginQuery = (query: ActiveDataQuery, userMessage: string): boolean => {
    if (isCompleteBoundedAggregateQuery(query)) return true;
    const requestedTopN = readRequestedTopN(userMessage);
    const { result, plan } = query;
    return requestedTopN !== null
        && result.truncated !== true
        && result.returnedRows > 0
        && result.returnedRows <= 500
        && result.returnedRows === result.totalMatchedRows
        && result.rows.length === result.returnedRows
        && (plan.groupBy?.length ?? 0) > 0
        && (plan.aggregates?.length ?? 0) > 0
        && result.selectedColumns.length > 0
        && result.selectedColumns.length <= 8;
};

const getMarginCopy = (language: AppLanguage, rowCount: number) => {
    switch (language) {
        case 'Mandarin':
            return {
                intro: `以下 ${rowCount} 行使用查询总额确定性计算利润率（总利润 ÷ 总销售额）：`,
                margin: '利润率',
                evidence: '证据',
                rows: '行',
            };
        case 'Japanese':
            return {
                intro: `以下の ${rowCount} 行では、クエリ合計から利益率（利益合計 ÷ 売上合計）を確定的に計算しています：`,
                margin: '利益率',
                evidence: '根拠',
                rows: '行',
            };
        case 'Malay':
            return {
                intro: `${rowCount} baris berikut mengira margin untung secara deterministik daripada jumlah pertanyaan (jumlah untung ÷ jumlah jualan):`,
                margin: 'Margin untung',
                evidence: 'Bukti',
                rows: 'baris',
            };
        default:
            return {
                intro: `The following ${rowCount} rows calculate profit margin deterministically from the query totals (total profit ÷ total sales):`,
                margin: 'Profit Margin',
                evidence: 'Evidence',
                rows: 'rows',
            };
    }
};

export const buildGroundedDerivedMarginReply = (params: {
    userMessage: string;
    query: ActiveDataQuery | null;
    fileName: string | null;
    language: AppLanguage;
}): string | null => {
    const { userMessage, query, fileName, language } = params;
    if (!query || !isDerivedMarginRequest(userMessage) || !isBoundedMarginQuery(query, userMessage)) {
        return null;
    }

    const sumAggregates = (query.plan.aggregates ?? []).filter(aggregate => (
        aggregate.function === 'sum'
        && typeof aggregate.column === 'string'
        && query.result.selectedColumns.includes(aggregate.as)
    ));
    const profitAggregate = sumAggregates.find(aggregate => PROFIT_MEASURE.test(aggregate.column ?? ''));
    const salesAggregate = sumAggregates.find(aggregate => SALES_MEASURE.test(aggregate.column ?? ''));
    if (!profitAggregate || !salesAggregate || profitAggregate.as === salesAggregate.as) return null;

    const groupColumns = query.plan.groupBy ?? [];
    const selectedColumns = [...groupColumns, salesAggregate.as, profitAggregate.as];
    if (!selectedColumns.every(column => query.result.selectedColumns.includes(column))) return null;

    const requestedTopN = readRequestedTopN(userMessage);
    const rankedRows = query.result.rows
        .map(row => {
            const sales = Number(row[salesAggregate.as]);
            const profit = Number(row[profitAggregate.as]);
            const margin = Number.isFinite(sales) && Number.isFinite(profit) && sales !== 0
                ? profit / sales
                : null;
            return { row, margin };
        })
        .filter((entry): entry is { row: typeof entry.row; margin: number } => entry.margin !== null)
        .sort((left, right) => right.margin - left.margin);
    const displayedRows = requestedTopN === null
        ? rankedRows
        : rankedRows.slice(0, requestedTopN);
    if (displayedRows.length === 0) return null;

    const copy = getMarginCopy(language, displayedRows.length);
    const headers = [
        ...selectedColumns.map(column => escapeMarkdownCell(humanizeColumn(column))),
        copy.margin,
    ];
    const table = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...displayedRows.map(({ row, margin }) => {
            const formattedMargin = `${new Intl.NumberFormat(resolveLocale(language), {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(margin * 100)}%`;
            return `| ${[
                ...selectedColumns.map(column => formatCell(row[column], column, query, language)),
                formattedMargin,
            ].join(' | ')} |`;
        }),
    ].join('\n');
    const source = fileName?.trim() || 'current dataset';

    return [
        copy.intro,
        '',
        table,
        '',
        `_${copy.evidence}: ${escapeMarkdownCell(source)} · ${displayedRows.length}/${query.result.totalMatchedRows} ${copy.rows} · ${escapeMarkdownCell(query.explanation)}_`,
    ].join('\n');
};

const getCostPerResultCopy = (language: AppLanguage, rowCount: number) => {
    switch (language) {
        case 'Mandarin':
            return {
                intro: `以下 ${rowCount} 行使用查询总额确定性计算每次结果成本（总支出 ÷ 总结果数）：`,
                ratio: '每次结果成本',
                evidence: '证据',
                rows: '行',
            };
        case 'Japanese':
            return {
                intro: `以下の ${rowCount} 行では、クエリ合計から結果あたりのコスト（総支出 ÷ 総結果数）を確定的に計算しています：`,
                ratio: '結果あたりのコスト',
                evidence: '根拠',
                rows: '行',
            };
        case 'Malay':
            return {
                intro: `${rowCount} baris berikut mengira kos setiap hasil secara deterministik daripada jumlah pertanyaan (jumlah perbelanjaan ÷ jumlah hasil):`,
                ratio: 'Kos setiap hasil',
                evidence: 'Bukti',
                rows: 'baris',
            };
        default:
            return {
                intro: `The following ${rowCount} rows calculate cost per result deterministically from the query totals (total spend ÷ total results):`,
                ratio: 'Cost per Result',
                evidence: 'Evidence',
                rows: 'rows',
            };
    }
};

const resolveRatioFractionDigits = (values: number[]): number => {
    const smallestPositive = values
        .filter(value => Number.isFinite(value) && value > 0)
        .reduce((smallest, value) => Math.min(smallest, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(smallestPositive) || smallestPositive >= 0.01) return 2;
    if (smallestPositive >= 0.001) return 4;
    if (smallestPositive >= 0.0001) return 5;
    return 6;
};

export const buildGroundedDerivedCostPerResultReply = (params: {
    userMessage: string;
    query: ActiveDataQuery | null;
    fileName: string | null;
    language: AppLanguage;
}): string | null => {
    const { userMessage, query, fileName, language } = params;
    if (
        !query
        || !isDerivedCostPerResultRequest(userMessage)
        || !isBoundedMarginQuery(query, userMessage)
    ) {
        return null;
    }

    const sumAggregates = (query.plan.aggregates ?? []).filter(aggregate => (
        aggregate.function === 'sum'
        && typeof aggregate.column === 'string'
        && query.result.selectedColumns.includes(aggregate.as)
    ));
    const spendAggregate = sumAggregates.find(aggregate => SPEND_MEASURE.test(aggregate.column ?? ''));
    const resultAggregate = sumAggregates.find(aggregate => RESULT_MEASURE.test(aggregate.column ?? ''));
    if (!spendAggregate || !resultAggregate || spendAggregate.as === resultAggregate.as) return null;

    const groupColumns = query.plan.groupBy ?? [];
    const selectedColumns = [...groupColumns, spendAggregate.as, resultAggregate.as];
    if (!selectedColumns.every(column => query.result.selectedColumns.includes(column))) return null;

    const requestedTopN = readRequestedTopN(userMessage);
    const rankedRows = query.result.rows
        .map(row => {
            const spend = Number(row[spendAggregate.as]);
            const results = Number(row[resultAggregate.as]);
            const ratio = Number.isFinite(spend) && Number.isFinite(results) && results > 0
                ? spend / results
                : null;
            return { row, ratio };
        })
        .filter((entry): entry is { row: typeof entry.row; ratio: number } => entry.ratio !== null)
        .sort((left, right) => LOWEST_RANKING_REQUEST.test(userMessage)
            ? left.ratio - right.ratio
            : right.ratio - left.ratio);
    const displayedRows = requestedTopN === null
        ? rankedRows
        : rankedRows.slice(0, requestedTopN);
    if (displayedRows.length === 0) return null;

    const copy = getCostPerResultCopy(language, displayedRows.length);
    const ratioFractionDigits = resolveRatioFractionDigits(displayedRows.map(entry => entry.ratio));
    const headers = [
        ...selectedColumns.map(column => escapeMarkdownCell(humanizeColumn(column))),
        copy.ratio,
    ];
    const table = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...displayedRows.map(({ row, ratio }) => `| ${[
            ...selectedColumns.map(column => formatCell(row[column], column, query, language)),
            new Intl.NumberFormat(resolveLocale(language), {
                minimumFractionDigits: ratioFractionDigits,
                maximumFractionDigits: ratioFractionDigits,
            }).format(ratio),
        ].join(' | ')} |`),
    ].join('\n');
    const source = fileName?.trim() || 'current dataset';

    return [
        copy.intro,
        '',
        table,
        '',
        `_${copy.evidence}: ${escapeMarkdownCell(source)} · ${displayedRows.length}/${query.result.totalMatchedRows} ${copy.rows} · ${escapeMarkdownCell(query.explanation)}_`,
    ].join('\n');
};

export const buildGroundedCompleteQueryReply = (params: {
    userMessage: string;
    query: ActiveDataQuery | null;
    fileName: string | null;
    language: AppLanguage;
}): string | null => {
    const { userMessage, query, fileName, language } = params;
    if (!query || !isCompleteListRequest(userMessage)) return null;

    const { result } = query;
    if (!isCompleteBoundedAggregateQuery(query)) return null;

    const copy = getCopy(language, result.returnedRows);
    const headers = result.selectedColumns.map(column => escapeMarkdownCell(humanizeColumn(column)));
    const table = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...result.rows.map(row => `| ${result.selectedColumns
            .map(column => formatCell(row[column], column, query, language))
            .join(' | ')} |`),
    ].join('\n');
    const source = fileName?.trim() || 'current dataset';

    return [
        copy.intro,
        '',
        table,
        '',
        `_${copy.evidence}: ${escapeMarkdownCell(source)} · ${result.returnedRows}/${result.totalMatchedRows} ${copy.rows} · ${escapeMarkdownCell(query.explanation)}_`,
    ].join('\n');
};
