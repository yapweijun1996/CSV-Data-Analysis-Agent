import type { AppStore } from '../../../store/useAppStore';
import { CsvData } from '../../../types';
import { generateAnalysisGoalCandidates } from '../../aiService';
import { createChatMessage } from '../../../utils/messageState';
import { getSemanticSampleRows } from '../datasetSemantics';
import { mapGoalCandidatesToSuggestedActions } from '../analysisDefaults';
import { buildAnalysisIntentBrief, buildAnalysisRankingHints } from '../analysisBrief';
import { resolveEffectiveReportContext } from '../reportContext';
import { findTemplateMatches, TemplateMatch } from '../memory/cardRetrieval';
import { vectorStore } from '../../vectorStore';
import { formatPatternPreferences } from '../memory/analysisPatternExtractor';
import { getTranslation } from '../../../utils/localization';
import { resolveReportMemoryScope } from '../memory/memoryScope';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

const LOG_PREFIX = '[GoalProposer]';

/** Format template matches as additional suggested actions. */
const formatTemplateHints = (matches: TemplateMatch[]): Array<{ label: string; action: string }> =>
    matches.map(m => ({
        label: `📋 ${m.title}`,
        action: m.description || m.title,
    }));

interface ProposeAnalysisGoalsOptions {
    mode?: 'follow_up' | 'change_goal';
}

export const proposeAnalysisGoals = async (
    dataForAnalysis: CsvData,
    store: StoreApi,
    options: ProposeAnalysisGoalsOptions = {},
) => {
    const { getState, setState } = store;
    const mode = options.mode ?? 'follow_up';

    if (!dataForAnalysis) {
        return;
    }

    getState().addProgress('AI is preparing follow-up analysis suggestions...', 'system', getState().settings.complexModel);
    console.log(`${LOG_PREFIX} Generating follow-up analysis suggestions...`);
    try {
        const columnProfiles = getState().columnProfiles;
        const memoryScope = resolveReportMemoryScope(getState()) ?? undefined;

        // Retrieve template hints and pattern preferences from vector memory in parallel.
        const templateMatchesPromise = findTemplateMatches(columnProfiles, 2, memoryScope).catch(error => {
            console.warn(`${LOG_PREFIX} Template match retrieval failed (non-blocking):`, error);
            return [] as TemplateMatch[];
        });
        const patternQueryText = `Analysis patterns: ${columnProfiles.map(c => `${c.name} (${c.type})`).join(', ')}`;
        const patternMatchesPromise = memoryScope
            ? vectorStore.searchIfReady(patternQueryText, 3, memoryScope).catch(error => {
                console.warn(`${LOG_PREFIX} Vector pattern search failed (non-blocking):`, error);
                return [];
            })
            : Promise.resolve([]);

        const reportContext = resolveEffectiveReportContext(
            getState().reportContextResolution ?? null,
            getState().rawCsvData ?? null,
            dataForAnalysis,
        );
        const brief = buildAnalysisIntentBrief({
            columns: columnProfiles,
            csvData: dataForAnalysis,
            dataPreparationPlan: getState().dataPreparationPlan ?? null,
            datasetSemanticSnapshot: getState().datasetSemanticSnapshot ?? null,
            semanticDatasetVersion: getState().semanticDatasetVersion ?? null,
        });
        const goals = await generateAnalysisGoalCandidates(
            columnProfiles,
            getSemanticSampleRows(
                dataForAnalysis,
                getState().datasetSemanticSnapshot,
                getState().semanticDatasetVersion,
                5,
            ),
            getState().settings,
            getState(),
        );
        console.log(`${LOG_PREFIX} AI suggested follow-up goals:`, goals);

        const [templateMatches, patternMatches] = await Promise.all([templateMatchesPromise, patternMatchesPromise]);
        if (templateMatches.length > 0) {
            console.log(`${LOG_PREFIX} Found ${templateMatches.length} template hints from prior analyses.`);
        }
        const patternSummary = formatPatternPreferences(patternMatches);
        if (patternSummary) {
            console.log(`${LOG_PREFIX} Found report-scoped pattern preferences.`);
        }

        if (mode === 'change_goal') {
            setState(prev => ({
                chatHistory: [
                    ...prev.chatHistory.filter(message => message.type !== 'ai_goal_clarification'),
                    createChatMessage({
                        sender: 'ai',
                        text: 'Choose a new analysis goal. The current results will remain unchanged until you confirm one.',
                        timestamp: new Date(),
                        type: 'ai_goal_clarification',
                        goalCandidates: goals,
                    }),
                ],
                goalState: 'awaiting_user_confirmation',
                isBusy: false,
            }));
            getState().addProgress('New analysis goals are ready for review.');
            return;
        }

        const suggestedActions = [
            ...mapGoalCandidatesToSuggestedActions(goals, buildAnalysisRankingHints(brief, columnProfiles, {
                title: dataForAnalysis.fileName,
                reportTitle: reportContext?.reportTitle ?? null,
                parameterLines: reportContext?.parameterLines ?? [],
            })),
            ...formatTemplateHints(templateMatches),
            ...(patternSummary ? [{ label: getTranslation('goal_history_preference', getState().settings.language), action: patternSummary }] : []),
        ];
        setState(prev => ({
            chatHistory: [...prev.chatHistory, createChatMessage({
            sender: 'ai',
            text: 'Initial analysis is ready. If you want to go deeper, choose one of these follow-up directions or type your own question.',
            timestamp: new Date(),
            type: 'ai_message',
            suggestedActions,
        })],
        }));
        getState().addProgress('Follow-up analysis suggestions are ready.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} Failed to suggest follow-up goals:`, error);
        getState().addProgress(`Could not prepare follow-up suggestions: ${errorMessage}`, 'warning');
        setState(prev => ({
            chatHistory: [...prev.chatHistory, createChatMessage({
                sender: 'ai',
                text: mode === 'change_goal'
                    ? 'I could not prepare new analysis goals. Your current results are unchanged; please try again.'
                    : 'Initial analysis is ready. You can ask for trends, anomalies, or segment comparisons to refine it further.',
                timestamp: new Date(),
                type: 'ai_message',
                suggestedActions: mapGoalCandidatesToSuggestedActions([]),
            })],
            ...(mode === 'change_goal' ? {
                goalState: 'confirmed' as const,
                isChangingGoal: false,
                isBusy: false,
            } : {}),
        }));
    }
};
