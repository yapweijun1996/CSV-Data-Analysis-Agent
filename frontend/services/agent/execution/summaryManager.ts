import { generateSummary, generateFinalSummary, generateCoreAnalysisSummary, generateProactiveInsights } from '../../aiService';
import { StoreApi } from '../types';
import type { AnalysisCardData, CardContext, LocalizedText } from '../../../types';
import { createChatMessage } from '../../../utils/messageState';
import { getTranslation } from '../../../utils/localization';
import { buildDisplayAnalysisIrList } from '../../dashboard/displayAnalysisIr';
import { buildNarrativeAnalysisIrInputList } from '../../dashboard/displayAnalysisNarrative';
import { buildNarrativeArtifactProvenance } from '../artifactProvenance';

const LOG_PREFIX = '[SummaryManager]';

const normalizeCountLabel = (value: string | undefined): string => (
    (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
);

const isCountEvidenceCard = (card: AnalysisCardData): boolean => {
    const aggregation = card.plan.aggregation;
    return aggregation === 'count'
        || aggregation === 'count_distinct'
        || normalizeCountLabel(card.plan.valueColumn) === 'countrows'
        || normalizeCountLabel(card.plan.title).startsWith('countrowsby');
};

const isCountOnlyEvidence = (cards: AnalysisCardData[]): boolean => cards.length > 0
    && cards.every(isCountEvidenceCard);

const getSummaryLocale = (language: LocalizedText['language']): string => {
    if (language === 'Mandarin') return 'zh-CN';
    if (language === 'Japanese') return 'ja-JP';
    if (language === 'Malay') return 'ms-MY';
    return 'en-SG';
};

const formatSummaryNumber = (value: number, language: LocalizedText['language']): string => (
    new Intl.NumberFormat(getSummaryLocale(language), { maximumFractionDigits: 2 }).format(value)
);

interface CountOnlyCardFact {
    title: string;
    dimension: string;
    topLabel: string;
    topCount: number;
    totalCount: number;
    share: string;
}

const buildCountOnlyCardFacts = (
    cards: AnalysisCardData[],
    language: LocalizedText['language'],
): CountOnlyCardFact[] => {
    const displayIrList = buildDisplayAnalysisIrList(cards);
    return cards.flatMap(card => {
        const groupByColumn = card.plan.groupByColumn;
        if (!groupByColumn || card.aggregatedData.length === 0) return [];

        const countEntries = card.aggregatedData.flatMap(row => {
            const numericEntry = Object.entries(row).find(([key, value]) => (
                key !== groupByColumn
                && typeof value === 'number'
                && Number.isFinite(value)
            ));
            if (!numericEntry) return [];
            return [{ label: String(row[groupByColumn] ?? 'Unknown'), count: numericEntry[1] as number }];
        });
        if (countEntries.length === 0) return [];

        const top = countEntries.reduce((current, candidate) => (
            candidate.count > current.count ? candidate : current
        ));
        const totalCount = countEntries.reduce((total, entry) => total + entry.count, 0);
        const ir = displayIrList.find(candidate => candidate.cardId === card.id);
        return [{
            title: ir?.displayTitle ?? card.plan.title,
            dimension: ir?.displayGroupLabel ?? groupByColumn,
            topLabel: top.label,
            topCount: top.count,
            totalCount,
            share: totalCount > 0
                ? new Intl.NumberFormat(getSummaryLocale(language), {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                }).format(top.count / totalCount)
                : '0.0%',
        }];
    });
};

const buildCountOnlySummaries = (
    cards: AnalysisCardData[],
    language: LocalizedText['language'],
): { core: LocalizedText; final: LocalizedText } => {
    const facts = buildCountOnlyCardFacts(cards, language);
    const formattedFacts = facts.map(fact => ({
        ...fact,
        topCount: formatSummaryNumber(fact.topCount, language),
        totalCount: formatSummaryNumber(fact.totalCount, language),
    }));

    if (language === 'Mandarin') {
        const factLines = formattedFacts.map(fact => (
            `- ${fact.title}：${fact.dimension} 中最多的是“${fact.topLabel}”，共 ${fact.topCount} 条，占该卡片 ${fact.totalCount} 条记录的 ${fact.share}。`
        ));
        return {
            core: {
                language,
                text: [
                    '### 初步分析',
                    ...factLines,
                    '',
                    '### 可用口径',
                    '本轮证据卡仅包含记录数指标；这些证据只支持记录量与类别分布分析，不能据此推断价格、成本、利润或收入。',
                    '',
                    '### 建议下一步',
                    '继续按主要类别与日期检查记录量，或明确选择一个已验证的数值指标再进行金额分析。',
                ].join('\n'),
            },
            final: {
                language,
                text: [
                    '### 整体洞察',
                    ...factLines,
                    '',
                    '### 可信度说明',
                    `以上结论只来自 ${cards.length} 张记录数分析卡片。本轮证据没有汇总任何价格、成本、利润或收入指标，因此不会生成相关结论。`,
                ].join('\n'),
            },
        };
    }

    if (language === 'Japanese') {
        const factLines = formattedFacts.map(fact => (
            `- ${fact.title}: ${fact.dimension}では「${fact.topLabel}」が最多で、${fact.totalCount}件中${fact.topCount}件（${fact.share}）です。`
        ));
        return {
            core: {
                language,
                text: [
                    '### 初期分析',
                    ...factLines,
                    '',
                    '### 利用可能な指標',
                    '今回のエビデンスカードは件数指標のみです。この分析は件数とカテゴリ分布のみを示し、価格、コスト、利益、売上を推測しません。',
                    '',
                    '### 次のステップ',
                    '主要カテゴリと日付ごとの件数を詳しく調べるか、検証済みの数値指標を明示して金額分析を続けてください。',
                ].join('\n'),
            },
            final: {
                language,
                text: [
                    '### 全体的な洞察',
                    ...factLines,
                    '',
                    '### 信頼性に関する注記',
                    `上記は${cards.length}件の件数分析カードだけに基づいています。今回のエビデンスには価格、コスト、利益、売上の集計がないため、それらに関する結論は生成していません。`,
                ].join('\n'),
            },
        };
    }

    const factLines = formattedFacts.map(fact => (
        `- ${fact.title}: ${fact.topLabel} is the largest ${fact.dimension} group with ${fact.topCount} of ${fact.totalCount} records (${fact.share}).`
    ));
    return {
        core: {
            language,
            text: [
                '### Initial analysis',
                ...factLines,
                '',
                '### Available measure',
                'These evidence cards contain record counts only. They support record-volume and category-distribution analysis, but do not support price, cost, profit, or revenue conclusions.',
                '',
                '### Suggested next step',
                'Continue by comparing record counts across the leading categories and dates, or explicitly select a validated numeric measure for amount analysis.',
            ].join('\n'),
        },
        final: {
            language,
            text: [
                '### Overall insights',
                ...factLines,
                '',
                '### Reliability note',
                `These findings use only ${cards.length} record-count analysis cards. This evidence does not aggregate price, cost, profit, or revenue, so no conclusion about those measures has been generated.`,
            ].join('\n'),
        },
    };
};

const buildCardContext = (cards: AnalysisCardData[]): CardContext[] => {
    const irList = buildDisplayAnalysisIrList(cards);
    return cards.map(c => {
        const ir = irList.find(candidate => candidate.cardId === c.id);
        return {
            id: c.id,
            title: ir?.displayTitle ?? c.plan.title,
            description: ir?.displayDescription ?? c.plan.description,
            summary: c.summary.text,
            chartType: c.displayChartType,
            groupByColumn: c.plan.groupByColumn,
            valueColumn: c.plan.valueColumn,
            aggregation: c.plan.aggregation,
            rowCount: c.aggregatedData.length,
            aggregatedDataSample: c.aggregatedData.slice(0, 10),
        };
    });
};

const buildFallbackOnlyCoreSummary = (
    cards: AnalysisCardData[],
    language: LocalizedText['language'],
): LocalizedText => {
    const sampleIr = buildDisplayAnalysisIrList(cards)[0];
    const groupBy = sampleIr?.displayGroupLabel ?? sampleIr?.groupByColumn ?? 'the fallback dimension';
    const valueColumn = sampleIr?.displayMetricLabel ?? sampleIr?.valueColumn ?? 'the fallback metric';
    return {
        language,
        text: [
            getTranslation('fallback_core_intro', language),
            getTranslation('fallback_core_unavailable', language, { count: cards.length }),
            getTranslation('fallback_core_safe_view', language, { count: cards.length, metric: valueColumn, dimension: groupBy }),
        ].join(' '),
    };
};

const buildFallbackOnlyFinalSummary = (
    cards: AnalysisCardData[],
    language: LocalizedText['language'],
): LocalizedText => {
    const sampleIr = buildDisplayAnalysisIrList(cards)[0];
    const groupBy = sampleIr?.displayGroupLabel ?? sampleIr?.groupByColumn ?? 'the fallback dimension';
    const valueColumn = sampleIr?.displayMetricLabel ?? sampleIr?.valueColumn ?? 'the fallback metric';
    return {
        language,
        text: [
            getTranslation('fallback_summary_title', language),
            getTranslation('fallback_summary_point_one', language, { count: cards.length }),
            getTranslation('fallback_summary_point_two', language, { metric: valueColumn, dimension: groupBy }),
            getTranslation('fallback_summary_point_three', language),
        ].join('\n'),
    };
};

const appendReliabilityNote = (summary: LocalizedText, fallbackCards: AnalysisCardData[]): LocalizedText => {
    if (fallbackCards.length === 0) return summary;
    return {
        ...summary,
        text: `${summary.text}\n\n${getTranslation('reliability_note_title', summary.language)}\n${getTranslation('reliability_note_body', summary.language, { count: fallbackCards.length })}`,
    };
};

export const generateAllSummaries = async (
    store: StoreApi,
    options?: { signal?: AbortSignal },
) => {
    const { getState, setState } = store;
    const isCancelled = () => options?.signal?.aborted === true;
    if (getState().isChangingGoal || isCancelled()) return;

    let cardsSnapshot = [...getState().analysisCards];
    const columnProfiles = getState().columnProfiles;
    const settings = getState().settings;

    // ── PERF-201: Batch card summary generation ──
    // Card summaries were deferred during the hypothesis loop (uses buildFallbackSummary
    // for instant card display). Generate all AI summaries in parallel now, then
    // update cards before building cardContext for Core/Final/Proactive summaries.
    const skipAiCardSummaries = isCountOnlyEvidence(cardsSnapshot);
    const cardsNeedingAiSummary = skipAiCardSummaries
        ? []
        : cardsSnapshot.filter(c => !c.plan.isFallback);
    if (cardsNeedingAiSummary.length > 0) {
        const batchStart = performance.now();
        console.log(`${LOG_PREFIX} Batch generating ${cardsNeedingAiSummary.length} card summaries in parallel...`);
        getState().addProgress(`Generating ${cardsNeedingAiSummary.length} card summaries in parallel...`, 'system', settings.simpleModel);
        const displayIrList = buildDisplayAnalysisIrList(cardsNeedingAiSummary, columnProfiles);
        const summaryResults = await Promise.all(
            cardsNeedingAiSummary.map(card => {
                const ir = displayIrList.find(d => d.cardId === card.id);
                const title = ir?.displayTitle ?? card.plan.title ?? '';
                const t0 = performance.now();
                return generateSummary(title, card.aggregatedData, settings, columnProfiles, getState())
                    .then(result => { console.log(`[Perf:BatchSummary] "${title.slice(0, 40)}" OK in ${Math.round(performance.now() - t0)}ms`); return result; })
                    .catch(() => { console.log(`[Perf:BatchSummary] "${title.slice(0, 40)}" FAILED in ${Math.round(performance.now() - t0)}ms`); return card.summary; });
            }),
        );
        if (isCancelled()) return;
        // PERF-308: Yield before heavy setState — break the chain between
        // AI callback processing and React re-render (2.3s).
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        setState(prev => ({
            analysisCards: prev.analysisCards.map(card => {
                const idx = cardsNeedingAiSummary.findIndex(c => c.id === card.id);
                return idx >= 0 ? { ...card, summary: summaryResults[idx] } : card;
            }),
        }));
        // PERF-304: Yield after batch summary setState so browser can paint
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        cardsSnapshot = [...getState().analysisCards];
        console.log(`[Perf:BatchSummary] Batch complete: ${cardsNeedingAiSummary.length} summaries in ${Math.round(performance.now() - batchStart)}ms (parallel)`);
    }

    const fallbackCards = cardsSnapshot.filter(card => card.plan.isFallback);
    const nonFallbackCards = cardsSnapshot.filter(card => !card.plan.isFallback);
    const irList = buildDisplayAnalysisIrList(nonFallbackCards, columnProfiles);
    // Prefer trusted evidence exclusively whenever it exists. A caveated card
    // can remain visible for review, but mixing it into the headline narrative
    // lets a weak pivot dominate otherwise verified findings. Only fall back to
    // caveated evidence when the run produced no trusted card at all.
    const trustedCardIds = irList
        .filter(ir => ir.autoAnalysisVerdict === 'trusted')
        .map(ir => ir.cardId);
    const caveatedCardIds = irList
        .filter(ir => ir.autoAnalysisVerdict === 'caveated')
        .map(ir => ir.cardId);
    const summaryEligibleCardIds = new Set(
        trustedCardIds.length > 0 ? trustedCardIds : caveatedCardIds,
    );
    const summaryCards = nonFallbackCards.filter(card => summaryEligibleCardIds.has(card.id));
    const cardContext = buildCardContext(summaryCards);
    const narrativeInputs = buildNarrativeAnalysisIrInputList(summaryCards, columnProfiles);

    if (cardsSnapshot.length === 0) {
        return;
    }

    // BUG-2 fix: Only show "Fallback-only" when ALL cards are fallback.
    // When SQL-first cards exist but are non-eligible (e.g., weak verdict),
    // don't contradict the "SQL-first" status with "Fallback-only" messaging.
    if (summaryCards.length === 0 && fallbackCards.length > 0 && nonFallbackCards.length === 0) {
        const fallbackCoreSummary = buildFallbackOnlyCoreSummary(fallbackCards, settings.language);
        const fallbackFinalSummary = buildFallbackOnlyFinalSummary(fallbackCards, settings.language);
        const narrativeProvenance = buildNarrativeArtifactProvenance(getState(), fallbackCards);
        getState().addProgress('Fallback-only run detected. Skipping AI-generated summary synthesis.', 'error');
        setState(prev => ({
            aiCoreAnalysisSummary: fallbackCoreSummary,
            finalSummary: fallbackFinalSummary,
            aiCoreAnalysisSummaryProvenance: narrativeProvenance,
            finalSummaryProvenance: narrativeProvenance,
            chatHistory: [...prev.chatHistory, createChatMessage({ sender: 'ai', text: fallbackCoreSummary.text, timestamp: new Date(), type: 'ai_thinking' })],
        }));
        return;
    }

    if (summaryCards.length === 0) {
        getState().addProgress('No trusted analysis cards are available. Skipping headline summary synthesis.', 'warning');
        setState({
            aiCoreAnalysisSummary: null,
            finalSummary: null,
            aiCoreAnalysisSummaryProvenance: null,
            finalSummaryProvenance: null,
        });
        return;
    }
    const narrativeProvenance = buildNarrativeArtifactProvenance(getState(), summaryCards);

    if (isCountOnlyEvidence(summaryCards)) {
        const deterministicSummaries = buildCountOnlySummaries(summaryCards, settings.language);
        getState().addProgress(
            'Count-only evidence detected. Generated a deterministic summary without inferring unavailable numeric measures.',
            'warning',
        );
        setState(prev => ({
            aiCoreAnalysisSummary: deterministicSummaries.core,
            finalSummary: deterministicSummaries.final,
            aiCoreAnalysisSummaryProvenance: narrativeProvenance,
            finalSummaryProvenance: narrativeProvenance,
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: deterministicSummaries.core.text,
                    timestamp: new Date(),
                    type: 'ai_thinking',
                }),
            ],
        }));
        return;
    }

    // ── Sequential chat messages (core summary → proactive insight) ──
    // These must append to chatHistory in a deterministic order so the
    // timeline reads: AI Initial Analysis → Proactive Insight.
    // The final summary (stored in state, not chatHistory) runs in parallel.

    const finalSummaryTask = (async () => {
        if (isCancelled()) return;
        getState().addProgress('AI is composing the final summary...', 'system', getState().settings.complexModel);
        console.log(`${LOG_PREFIX} Generating final summary...`);
        try {
            const finalSummaryText = appendReliabilityNote(
                await generateFinalSummary(summaryCards, settings, getState()),
                fallbackCards,
            );
            if (getState().isChangingGoal || isCancelled()) return;
            setState({
                finalSummary: finalSummaryText,
                finalSummaryProvenance: narrativeProvenance,
            });
            // PERF-304: Yield after final summary setState
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            getState().addProgress('Overall summary generated.');
        } catch (summaryError) {
            const message = summaryError instanceof Error ? summaryError.message : String(summaryError);
            console.error(`${LOG_PREFIX} Final summary failed:`, summaryError);
            getState().addProgress(`Final summary failed: ${message}`, 'error');
        }
    })();

    const chatMessageTask = (async () => {
        if (isCancelled()) return;
        // Step 1: Core analysis summary (ai_thinking)
        getState().addProgress('AI is forming its core understanding of the data...', 'system', getState().settings.complexModel);
        console.log(`${LOG_PREFIX} Generating core analysis summary...`);
        try {
            const coreSummary = await generateCoreAnalysisSummary(cardContext, columnProfiles, settings, getState());
            if (getState().isChangingGoal || isCancelled()) return;
            console.log(`${LOG_PREFIX} Core summary generated.`);
            const finalCoreSummary = appendReliabilityNote(coreSummary, fallbackCards);
            setState(prev => ({
                aiCoreAnalysisSummary: finalCoreSummary,
                aiCoreAnalysisSummaryProvenance: narrativeProvenance,
                chatHistory: [...prev.chatHistory, createChatMessage({ sender: 'ai', text: finalCoreSummary.text, timestamp: new Date(), type: 'ai_thinking' })]
            }));
            // PERF-304: Yield after core summary setState
            await new Promise<void>(resolve => setTimeout(resolve, 0));
        } catch (coreError) {
            const message = coreError instanceof Error ? coreError.message : String(coreError);
            console.error(`${LOG_PREFIX} Core summary failed:`, coreError);
            getState().addProgress(`Core summary failed: ${message}`, 'error');
        }

        // Step 2: Proactive insights (ai_proactive_insight) — after core summary
        if (isCancelled()) return;
        getState().addProgress('AI is looking for key insights...', 'system', getState().settings.simpleModel);
        console.log(`${LOG_PREFIX} Generating proactive insights...`);
        try {
            const proactiveInsight = await generateProactiveInsights(cardContext, settings, getState(), narrativeInputs);
            if (!proactiveInsight || getState().isChangingGoal || isCancelled()) {
                console.log(`${LOG_PREFIX} No proactive insights found.`);
                return;
            }
            console.log(`${LOG_PREFIX} Proactive insight found:`, proactiveInsight);
            setState(prev => ({
                chatHistory: [...prev.chatHistory, createChatMessage({ sender: 'ai', text: proactiveInsight.insight, timestamp: new Date(), type: 'ai_proactive_insight', cardId: proactiveInsight.cardId })]
            }));
        } catch (insightError) {
            const message = insightError instanceof Error ? insightError.message : String(insightError);
            console.error(`${LOG_PREFIX} Proactive insight generation failed:`, insightError);
            getState().addProgress(`Proactive insight failed: ${message}`, 'error');
        }
    })();

    await Promise.all([finalSummaryTask, chatMessageTask]);
};
