import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { SpreadsheetPanel } from './components/SpreadsheetPanel';
import { DataPrepDebugPanel } from './components/DataPrepDebugPanel';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile, AiAction, CardContext, ChartType, DomAction, Settings, Report, ReportListItem, AppView, CsvRow, DataPreparationPlan } from './types';
import { processCsv, profileData, executePlan, executeJavaScriptDataTransform } from './utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateChatResponse, generateDataPreparationPlan, generateCoreAnalysisSummary, generateProactiveInsights } from './services/geminiService';
import { getReportsList, saveReport, getReport, deleteReport, getSettings, saveSettings, CURRENT_SESSION_KEY } from './storageService';
import { vectorStore } from './services/vectorStore';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;

const ShowAssistantIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

const HistoryIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const NewIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" />
    </svg>
);

const initialState: AppState = {
    currentView: 'file_upload',
    isBusy: false,
    progressMessages: [],
    csvData: null,
    columnProfiles: [],
    analysisCards: [],
    chatHistory: [],
    finalSummary: null,
    aiCoreAnalysisSummary: null,
    dataPreparationPlan: null,
    initialDataSample: null,
    vectorStoreDocuments: [],
};


const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(initialState);
    
    const [isAsideVisible, setIsAsideVisible] = useState(true);
    const [asideWidth, setAsideWidth] = useState(window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH);
    const [isSpreadsheetVisible, setIsSpreadsheetVisible] = useState(true);
    const [isDataPrepDebugVisible, setIsDataPrepDebugVisible] = useState(false);

    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
    const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(() => getSettings());
    const [reportsList, setReportsList] = useState<ReportListItem[]>([]);

    const isResizingAsideRef = useRef(false);
    const isMounted = useRef(false);

    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;

    const loadReportsList = useCallback(async () => {
        const list = await getReportsList();
        if (isMounted.current) {
            setReportsList(list);
        }
    }, []);

    const addProgress = useCallback((message: string, type: 'system' | 'error' = 'system') => {
        if (!isMounted.current) return;
        const newMessage: ProgressMessage = { text: message, type, timestamp: new Date() };
        setAppState(prev => ({ ...prev, progressMessages: [...prev.progressMessages, newMessage] }));
    }, []);
    
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);


    // Load current session or reports list on initial mount
    useEffect(() => {
        const loadInitialData = async () => {
            const currentSession = await getReport(CURRENT_SESSION_KEY);
            if (isMounted.current) {
                if (currentSession) {
                     setAppState({
                        ...currentSession.appState,
                        currentView: currentSession.appState.csvData ? 'analysis_dashboard' : 'file_upload',
                    });
                     if (currentSession.appState.vectorStoreDocuments && vectorStore.getIsInitialized()) {
                        vectorStore.rehydrate(currentSession.appState.vectorStoreDocuments);
                        addProgress('Restored AI long-term memory from last session.');
                    }
                }
                await loadReportsList();
            }
        };
        loadInitialData();
    }, [loadReportsList, addProgress]);

    // Debounced saving of the current session state
    useEffect(() => {
        if (!isMounted.current) return;
        
        const saveCurrentState = async () => {
            if (appState.csvData && appState.csvData.data.length > 0) {
                 const existingReport = await getReport(CURRENT_SESSION_KEY);
                 const stateToSave: AppState = { ...appState, vectorStoreDocuments: vectorStore.getDocuments() };
                 const currentReport: Report = {
                    id: CURRENT_SESSION_KEY,
                    filename: appState.csvData.fileName || 'Current Session',
                    createdAt: existingReport?.createdAt || new Date(),
                    updatedAt: new Date(),
                    appState: stateToSave,
                };
                await saveReport(currentReport);
                if (isHistoryPanelOpen) {
                    await loadReportsList();
                }
            }
        };
        const debounceSave = setTimeout(saveCurrentState, 1000);
        return () => clearTimeout(debounceSave);
    }, [appState, loadReportsList, isHistoryPanelOpen]);
    
    const handleSaveSettings = (newSettings: Settings) => {
        saveSettings(newSettings);
        setSettings(newSettings);
    };

    const handleAsideMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizingAsideRef.current) return;
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth < MIN_ASIDE_WIDTH) newWidth = MIN_ASIDE_WIDTH;
        if (newWidth > MAX_ASIDE_WIDTH) newWidth = MAX_ASIDE_WIDTH;
        setAsideWidth(newWidth);
    }, []);
    

    const handleMouseUp = useCallback(() => {
        isResizingAsideRef.current = false;
        document.removeEventListener('mousemove', handleAsideMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';

    }, [handleAsideMouseMove]);

    const handleAsideMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingAsideRef.current = true;
        document.addEventListener('mousemove', handleAsideMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    }, [handleAsideMouseMove, handleMouseUp]);

    const runAnalysisPipeline = useCallback(async (plans: AnalysisPlan[], data: CsvData, isChatRequest: boolean = false) => {
        let isFirstCardInPipeline = true;
        
        const processPlan = async (plan: AnalysisPlan) => {
            try {
                addProgress(`Executing plan: ${plan.title}...`);
                const aggregatedData = executePlan(data, plan);
                if (aggregatedData.length === 0) {
                    addProgress(`Skipping "${plan.title}" due to empty result.`, 'error');
                    return null;
                }
                
                addProgress(`AI is summarizing: ${plan.title}...`);
                const summary = await generateSummary(plan.title, aggregatedData, settings);

                const categoryCount = aggregatedData.length;
                const shouldApplyDefaultTop8 = plan.chartType !== 'scatter' && categoryCount > 15;

                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`,
                    plan: plan,
                    aggregatedData: aggregatedData,
                    summary: summary,
                    displayChartType: plan.chartType,
                    isDataVisible: false,
                    topN: shouldApplyDefaultTop8 ? 8 : (plan.defaultTopN || null),
                    hideOthers: shouldApplyDefaultTop8 ? true : (plan.defaultHideOthers || false),
                    disableAnimation: isChatRequest || !isFirstCardInPipeline || appState.analysisCards.length > 0,
                    hiddenLabels: [],
                };
                
                if (isMounted.current) {
                    setAppState(prev => ({...prev, analysisCards: [...prev.analysisCards, newCard] }));
                }

                const cardMemoryText = `[Chart: ${plan.title}] Description: ${plan.description}. AI Summary: ${summary.split('---')[0]}`;
                await vectorStore.addDocument({ id: newCard.id, text: cardMemoryText });
                addProgress(`View #${newCard.id.slice(-6)} indexed for long-term memory.`);

                isFirstCardInPipeline = false; 
                addProgress(`Saved as View #${newCard.id.slice(-6)}`);
                return newCard;
            } catch (error) {
                console.error('Error executing plan:', plan.title, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
                return null;
            }
        };

        const createdCards = (await Promise.all(plans.map(processPlan))).filter((c): c is AnalysisCardData => c !== null);

        if (!isChatRequest && isMounted.current && createdCards.length > 0) {
            addProgress('AI is forming its core understanding of the data...');

            const cardContext: CardContext[] = createdCards.map(c => ({
                id: c.id,
                title: c.plan.title,
                aggregatedDataSample: c.aggregatedData.slice(0, 10),
            }));

            const coreSummary = await generateCoreAnalysisSummary(cardContext, appState.columnProfiles, settings);
            
            if (isMounted.current) {
                const thinkingMessage: ChatMessage = { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' };
                setAppState(prev => ({
                    ...prev,
                    aiCoreAnalysisSummary: coreSummary,
                    chatHistory: [...prev.chatHistory, thinkingMessage],
                }));
                
                addProgress("Indexing core analysis for long-term memory...");
                await vectorStore.addDocument({ id: 'core-summary', text: `Core Analysis Summary: ${coreSummary}` });
                addProgress("Core analysis indexed.");
            }
            
            addProgress('AI is looking for key insights...');
            const proactiveInsight = await generateProactiveInsights(cardContext, settings);
            
            if (isMounted.current && proactiveInsight) {
                const insightMessage: ChatMessage = {
                    sender: 'ai',
                    text: proactiveInsight.insight,
                    timestamp: new Date(),
                    type: 'ai_proactive_insight',
                    cardId: proactiveInsight.cardId,
                };
                setAppState(prev => ({
                    ...prev,
                    chatHistory: [...prev.chatHistory, insightMessage],
                }));
                addProgress(`AI proactively identified an insight in View #${proactiveInsight.cardId.slice(-6)}.`);
            }

            const finalSummaryText = await generateFinalSummary(createdCards, settings);
            if(isMounted.current) {
                setAppState(prev => ({...prev, finalSummary: finalSummaryText}));
            }
            addProgress('Overall summary generated.');
        }
        return createdCards;
    }, [addProgress, settings, appState.analysisCards.length, appState.columnProfiles]);

    const handleInitialAnalysis = useCallback(async (dataForAnalysis: CsvData) => {
        if (!dataForAnalysis || !isMounted.current) return;

        setAppState(prev => ({...prev, isBusy: true}));
        addProgress('Starting main analysis...');

        try {
            addProgress('AI is generating analysis plans...');
            const plans = await generateAnalysisPlans(appState.columnProfiles, dataForAnalysis.data.slice(0, 5), settings);
            addProgress(`AI proposed ${plans.length} plans.`);
            
            if (plans.length > 0) {
                await runAnalysisPipeline(plans, dataForAnalysis, false);
            } else {
                addProgress('AI did not propose any analysis plans.', 'error');
            }

        } catch (error) {
            console.error('Analysis pipeline error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error during analysis: ${errorMessage}`, 'error');
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
                addProgress('Analysis complete. Ready for chat.');
            }
        }
    }, [appState.columnProfiles, settings, runAnalysisPipeline, addProgress]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!isMounted.current) return;

        const currentState = appState;
        if (currentState.csvData && currentState.csvData.data.length > 0) {
             const existingSession = await getReport(CURRENT_SESSION_KEY);
             if (existingSession) {
                const archiveId = `report-${existingSession.createdAt.getTime()}`;
                const sessionToArchive: Report = { ...existingSession, id: archiveId, updatedAt: new Date() };
                await saveReport(sessionToArchive);
             }
        }
        
        vectorStore.clear();
        await deleteReport(CURRENT_SESSION_KEY);
        await loadReportsList();

        const newInitialState: AppState = { ...initialState, isBusy: true, csvData: { fileName: file.name, data: [] } };
        setAppState(newInitialState);
        
        try {
            addProgress('Parsing CSV file...');
            const parsedData = await processCsv(file);
            if (!isMounted.current) return;
            addProgress(`Parsed ${parsedData.data.length} rows.`);

            // Capture the initial data sample for the debug log before transformation
            setAppState(prev => ({ ...prev, initialDataSample: parsedData.data.slice(0, 20) }));
            
            let dataForAnalysis = parsedData;
            let profiles: ColumnProfile[];
            let prepPlan: DataPreparationPlan | null = null;

            if (isApiKeySet) {
                await vectorStore.init(addProgress);

                addProgress('AI is analyzing data for cleaning and reshaping...');
                const initialProfiles = profileData(dataForAnalysis.data);
                
                prepPlan = await generateDataPreparationPlan(initialProfiles, dataForAnalysis.data.slice(0, 20), settings);
                
                if (prepPlan && prepPlan.jsFunctionBody) {
                    addProgress(`AI Plan: ${prepPlan.explanation}`);
                    addProgress('Executing AI data transformation...');
                    const originalRowCount = dataForAnalysis.data.length;
                    dataForAnalysis.data = executeJavaScriptDataTransform(dataForAnalysis.data, prepPlan.jsFunctionBody);
                    const newRowCount = dataForAnalysis.data.length;
                    addProgress(`Transformation complete. Row count changed from ${originalRowCount} to ${newRowCount}. You can ask me how the data was cleaned.`);
                } else {
                     addProgress('AI found no necessary data transformations.');
                }
                profiles = prepPlan.outputColumns;
                addProgress('AI has defined the new data structure.');
                
                if (dataForAnalysis.data.length === 0) {
                    throw new Error('The dataset became empty after AI-driven cleaning or reshaping.');
                }
                
                if (!isMounted.current) return;
                 setAppState(prev => ({ 
                    ...prev, 
                    csvData: dataForAnalysis, 
                    columnProfiles: profiles,
                    dataPreparationPlan: prepPlan,
                    currentView: 'analysis_dashboard'
                }));
                await handleInitialAnalysis(dataForAnalysis);

            } else {
                 const providerName = settings.provider === 'google' ? 'Gemini' : 'OpenAI';
                 addProgress(`API Key not set. Please add your ${providerName} API Key in the settings.`, 'error');
                 setIsSettingsModalOpen(true);
                 profiles = profileData(dataForAnalysis.data);
                 addProgress('Profiling data columns...');
                 addProgress('Data profiling complete.');
                 setAppState(prev => ({ 
                     ...prev, 
                     csvData: dataForAnalysis, 
                     columnProfiles: profiles, 
                     isBusy: false,
                     currentView: 'analysis_dashboard'
                    }));
                 addProgress('No API Key, skipping AI analysis. You can explore the raw data.', 'error');
            }

        } catch (error) {
            console.error('File processing error:', error);
            let errorMessage = error instanceof Error ? error.message : String(error);
            if (error instanceof Error && error.message.startsWith('AI failed to generate a valid data preparation plan')) {
                errorMessage = `The AI failed to prepare your data for analysis, even after several self-correction attempts. This can happen with very unusual or complex file formats. Please check the file or try another one. Final error: ${error.message}`;
            }
            addProgress(`File Processing Error: ${errorMessage}`, 'error');
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false, currentView: 'file_upload' }));
            }
        }
    }, [addProgress, settings, loadReportsList, handleInitialAnalysis, isApiKeySet, appState]);


    const regenerateAnalyses = useCallback(async (newData: CsvData) => {
        if (!isMounted.current) return;
        addProgress('Data has changed. Regenerating all analysis cards...');
        setAppState(prev => ({ ...prev, isBusy: true, analysisCards: [], finalSummary: null }));
        
        try {
            const existingPlans = appState.analysisCards.map(card => card.plan);
            if (existingPlans.length > 0) {
                const newCards = await runAnalysisPipeline(existingPlans, newData, true);
                
                if (isMounted.current && newCards.length > 0) {
                    const newFinalSummary = await generateFinalSummary(newCards, settings);
                    if (isMounted.current) {
                        setAppState(prev => ({ ...prev, finalSummary: newFinalSummary }));
                    }
                    addProgress('All analysis cards have been updated.');
                }
            } else {
                 addProgress('No existing analysis to update. Ready for chat.');
            }
        } catch (error) {
             console.error("Error regenerating analyses:", error);
             const errorMessage = error instanceof Error ? error.message : String(error);
             addProgress(`Error updating analyses: ${errorMessage}`, 'error');
        } finally {
             if (isMounted.current) {
                 setAppState(prev => ({ ...prev, isBusy: false }));
             }
        }
    }, [appState.analysisCards, runAnalysisPipeline, addProgress, settings]);


    const executeDomAction = (action: DomAction) => {
        addProgress(`AI is performing action: ${action.toolName}...`);
        
        setAppState(prev => {
            const newCards = [...prev.analysisCards];
            let cardUpdated = false;

            switch(action.toolName) {
                case 'highlightCard': {
                    const cardId = action.args.cardId;
                    const element = document.getElementById(cardId);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
                        setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 2500);
                    } else {
                        addProgress(`Could not find card ID ${cardId} to highlight.`, 'error');
                    }
                    break;
                }
                case 'changeCardChartType': {
                    const { cardId, newType } = action.args;
                    const cardIndex = newCards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        newCards[cardIndex].displayChartType = newType as ChartType;
                        cardUpdated = true;
                    } else {
                         addProgress(`Could not find card ID ${cardId} to change chart type.`, 'error');
                    }
                    break;
                }
                case 'showCardData': {
                     const { cardId, visible } = action.args;
                     const cardIndex = newCards.findIndex(c => c.id === cardId);
                     if (cardIndex > -1) {
                         newCards[cardIndex].isDataVisible = visible;
                         cardUpdated = true;
                     } else {
                         addProgress(`Could not find card ID ${cardId} to show data for.`, 'error');
                     }
                     break;
                }
                 case 'filterCard': {
                    const { cardId, column, values } = action.args;
                    const cardIndex = newCards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        newCards[cardIndex].filter = values.length > 0 ? { column, values } : undefined;
                        cardUpdated = true;
                        addProgress(`AI is filtering the '${newCards[cardIndex].plan.title}' card.`);
                    } else {
                        addProgress(`Could not find card ID ${cardId} to filter.`, 'error');
                    }
                    break;
                }
                default:
                     addProgress(`Unknown DOM action: ${action.toolName}`, 'error');
            }

            if (cardUpdated) {
                return { ...prev, analysisCards: newCards };
            }
            return prev;
        });
    }

     const handleChatMessage = useCallback(async (message: string) => {
        if (!appState.csvData || !appState.columnProfiles.length) {
            addProgress("Please upload a CSV file first.", "error");
            return;
        }
        if (!isApiKeySet) {
            const providerName = settings.provider === 'google' ? 'Gemini' : 'OpenAI';
            addProgress(`API Key not set. Please add your ${providerName} API Key in the settings.`, 'error');
            setIsSettingsModalOpen(true);
            return;
        }
        
        if (!vectorStore.getIsInitialized()) {
            await vectorStore.init(addProgress);
        }

        if (!isMounted.current) return;
        const newChatMessage: ChatMessage = { sender: 'user', text: message, timestamp: new Date(), type: 'user_message' };
        setAppState(prev => ({ ...prev, isBusy: true, chatHistory: [...prev.chatHistory, newChatMessage] }));
        await vectorStore.addDocument({id: `chat-${newChatMessage.timestamp.getTime()}-user`, text: `User asks: "${message}"`});

        try {
            const relevantMemories = await vectorStore.search(message, 5);
            const memoryContext = relevantMemories.map(r => r.text);
            if (memoryContext.length > 0) {
                addProgress(`Found ${memoryContext.length} relevant memories.`);
            }
            
            const cardContext: CardContext[] = appState.analysisCards.map(c => ({
                id: c.id,
                title: c.plan.title,
                aggregatedDataSample: c.aggregatedData.slice(0, 100),
            }));

            const response = await generateChatResponse(
                appState.columnProfiles,
                appState.chatHistory,
                message,
                cardContext,
                settings,
                appState.aiCoreAnalysisSummary,
                appState.currentView,
                appState.csvData.data.slice(0, 20),
                memoryContext,
                appState.dataPreparationPlan
            );

            const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
            const actions = response.actions;
            
            if (actions.length > 1) {
                const planText = actions[0]?.thought || `I've formulated a ${actions.length}-step plan to address your request.`;
                const planMessage: ChatMessage = {
                    sender: 'ai',
                    text: planText,
                    timestamp: new Date(),
                    type: 'ai_plan_start',
                };
                if (isMounted.current) {
                    setAppState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, planMessage] }));
                }
                addProgress(`AI is executing a ${actions.length}-step plan.`);
                await sleep(1000);
            }

            for (const [index, action] of actions.entries()) {
                if (!isMounted.current) break;

                if (action.thought) {
                    // The first thought of a multi-step plan is already displayed in the chat.
                    // We only log subsequent thoughts for individual steps, or thoughts for single-step actions.
                    if (index > 0 || actions.length === 1) {
                        addProgress(`AI Thought: ${action.thought}`);
                        await sleep(1500); // Give user time to read the thought
                    }
                }
                
                switch (action.responseType) {
                    case 'text_response':
                        if (action.text && isMounted.current) {
                            const aiMessage: ChatMessage = { 
                                sender: 'ai', 
                                text: action.text, 
                                timestamp: new Date(),
                                type: 'ai_message',
                                cardId: action.cardId
                            };
                            setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                            await vectorStore.addDocument({id: `chat-${aiMessage.timestamp.getTime()}-ai`, text: `AI responds: "${action.text}"`});
                        }
                        break;
                    case 'plan_creation':
                        if (action.plan && appState.csvData) {
                            await runAnalysisPipeline([action.plan], appState.csvData, true);
                        }
                        break;
                    case 'dom_action':
                        if (action.domAction) {
                            executeDomAction(action.domAction);
                        }
                        break;
                    case 'execute_js_code':
                        if (action.code && action.code.jsFunctionBody && appState.csvData) {
                            addProgress(`AI is performing a complex data transformation: ${action.code.explanation}`);
                            const newDataArray = executeJavaScriptDataTransform(appState.csvData.data, action.code.jsFunctionBody);
                            const newData: CsvData = { ...appState.csvData, data: newDataArray };
                            const newProfiles = profileData(newData.data);

                             if (isMounted.current) {
                                setAppState(prev => ({
                                    ...prev,
                                    csvData: newData,
                                    columnProfiles: newProfiles
                                }));
                                await regenerateAnalyses(newData);
                                addProgress("Data transformation successful. All charts have been updated.");
                             }
                        }
                        break;
                    case 'proceed_to_analysis':
                        // This action is deprecated but kept for compatibility.
                        // The flow is now automatic. We can add a user message.
                         if (isMounted.current) {
                            const aiMessage: ChatMessage = { 
                                sender: 'ai', 
                                text: "The initial analysis is already complete. You can ask me to create new charts or modify the data.", 
                                timestamp: new Date(),
                                type: 'ai_message',
                            };
                            setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                        }
                        break;
                    default:
                        console.warn('Unknown AI action type:', (action as any).responseType);
                }

                if (actions.length > 1) {
                    await sleep(750);
                }
            }
        } catch(error) {
            console.error('Chat processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error processing chat: ${errorMessage}`, 'error');
            if (isMounted.current) {
                const aiMessage: ChatMessage = { 
                    sender: 'ai', 
                    text: `Sorry, I had trouble with that request: ${errorMessage}. Could you try rephrasing it?`, 
                    timestamp: new Date(),
                    type: 'ai_message',
                    isError: true,
                };
                setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
            }
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
            }
        }
    }, [appState, addProgress, runAnalysisPipeline, settings, regenerateAnalyses, isApiKeySet]);
    
    const handleChartTypeChange = (cardId: string, newType: ChartType) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, displayChartType: newType} : c)
        }))
    }
    
    const handleToggleDataVisibility = (cardId: string) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, isDataVisible: !c.isDataVisible} : c)
        }))
    }

    const handleTopNChange = (cardId: string, topN: number | null) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, topN: topN} : c)
        }));
    };

    const handleHideOthersChange = (cardId: string, hide: boolean) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, hideOthers: hide} : c)
        }));
    };

    const handleToggleLegendLabel = (cardId: string, label: string) => {
        setAppState(prev => {
            const newCards = prev.analysisCards.map(c => {
                if (c.id === cardId) {
                    const currentHidden = c.hiddenLabels || [];
                    const newHidden = currentHidden.includes(label)
                        ? currentHidden.filter(l => l !== label)
                        : [...currentHidden, label];
                    return { ...c, hiddenLabels: newHidden };
                }
                return c;
            });
            return { ...prev, analysisCards: newCards };
        });
    };

    const handleLoadReport = async (id: string) => {
        addProgress(`Loading report ${id}...`);
        const report = await getReport(id);
        if (report && isMounted.current) {
            // Must clear old vector store before loading new state
            vectorStore.clear();
            setAppState({
                ...report.appState,
                currentView: 'analysis_dashboard'
            });
            // Rehydrate vector store with documents from the loaded report
            if (report.appState.vectorStoreDocuments) {
                vectorStore.rehydrate(report.appState.vectorStoreDocuments);
                addProgress('AI long-term memory restored from report.');
            }
            setIsHistoryPanelOpen(false);
            addProgress(`Report "${report.filename}" loaded successfully.`);
        } else {
            addProgress(`Failed to load report ${id}.`, 'error');
        }
    };

    const handleDeleteReport = async (id: string) => {
        await deleteReport(id);
        await loadReportsList();
    };
    
    const handleShowCardFromChat = (cardId: string) => {
        const element = document.getElementById(cardId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
            setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 2500);
        } else {
            addProgress(`Could not find card ID ${cardId} to show.`, 'error');
        }
    };

    const handleNewSession = async () => {
        addProgress('Starting new session...');
        if (appState.csvData && appState.csvData.data.length > 0) {
            const existingSession = await getReport(CURRENT_SESSION_KEY);
            if (existingSession) {
                const archiveId = `report-${existingSession.createdAt.getTime()}`;
                const sessionToArchive: Report = { ...existingSession, id: archiveId, updatedAt: new Date() };
                await saveReport(sessionToArchive);
            }
        }
        vectorStore.clear();
        await deleteReport(CURRENT_SESSION_KEY);
        setAppState(initialState);
        await loadReportsList();
        addProgress('New session started. Please upload a file.');
    };


    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary, currentView } = appState;

    const renderMainContent = () => {
        if (currentView === 'file_upload' || !csvData) {
            return (
                <div className="flex-grow min-h-0">
                    <FileUpload 
                        onFileUpload={handleFileUpload} 
                        isBusy={isBusy}
                        progressMessages={progressMessages}
                        fileName={csvData?.fileName || null}
                        isApiKeySet={isApiKeySet}
                    />
                </div>
            );
        }
        return (
            <div className="flex-grow min-h-0 overflow-y-auto">
                <AnalysisPanel 
                    cards={analysisCards} 
                    finalSummary={finalSummary}
                    onChartTypeChange={handleChartTypeChange}
                    onToggleDataVisibility={handleToggleDataVisibility}
                    onTopNChange={handleTopNChange}
                    onHideOthersChange={handleHideOthersChange}
                    onToggleLegendLabel={handleToggleLegendLabel}
                />
                {appState.dataPreparationPlan && appState.dataPreparationPlan.jsFunctionBody && appState.initialDataSample && (
                    <div className="mt-8">
                        <DataPrepDebugPanel
                            plan={appState.dataPreparationPlan}
                            originalSample={appState.initialDataSample}
                            transformedSample={csvData.data.slice(0, 20)}
                            isVisible={isDataPrepDebugVisible}
                            onToggleVisibility={() => setIsDataPrepDebugVisible(prev => !prev)}
                        />
                    </div>
                )}
                <div className="mt-8">
                    <SpreadsheetPanel
                        csvData={csvData}
                        isVisible={isSpreadsheetVisible}
                        onToggleVisibility={() => setIsSpreadsheetVisible(prev => !prev)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800 font-sans">
            <SettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                onSave={handleSaveSettings}
                currentSettings={settings}
            />
            <HistoryPanel
                isOpen={isHistoryPanelOpen}
                onClose={() => setIsHistoryPanelOpen(false)}
                reports={reportsList}
                onLoadReport={handleLoadReport}
                onDeleteReport={handleDeleteReport}
            />
            <MemoryPanel
                isOpen={isMemoryPanelOpen}
                onClose={() => setIsMemoryPanelOpen(false)}
            />
            <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8 flex flex-col">
                <header className="mb-6 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">CSV Data Analysis Agent</h1>
                    </div>
                     <div className="flex items-center space-x-2">
                         <button
                            onClick={handleNewSession}
                            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            title="Start a new analysis session"
                        >
                           <NewIcon />
                           <span className="hidden sm:inline">New</span>
                        </button>
                        <button 
                            onClick={() => {loadReportsList(); setIsHistoryPanelOpen(true);}}
                            className="flex items-center space-x-2 px-3 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
                            title="View analysis history"
                        >
                           <HistoryIcon />
                           <span className="hidden sm:inline">History</span>
                        </button>
                        {!isAsideVisible && (
                             <button
                                onClick={() => setIsAsideVisible(true)}
                                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                aria-label="Show Assistant Panel"
                                title="Show Assistant Panel"
                            >
                                <ShowAssistantIcon />
                            </button>
                        )}
                    </div>
                </header>
                {renderMainContent()}
            </main>
            
            {isAsideVisible && (
                <>
                    <div onMouseDown={handleAsideMouseDown} className="hidden md:block w-1.5 cursor-col-resize bg-slate-300 hover:bg-brand-secondary transition-colors duration-200"/>
                    <aside className="w-full md:w-auto bg-white flex flex-col h-full border-l border-slate-200" style={{ width: asideWidth }}>
                        <ChatPanel 
                            progressMessages={progressMessages} 
                            chatHistory={chatHistory}
                            isBusy={isBusy} 
                            onSendMessage={handleChatMessage} 
                            isApiKeySet={isApiKeySet}
                            onToggleVisibility={() => setIsAsideVisible(false)}
                            onOpenSettings={() => setIsSettingsModalOpen(true)}
                            onOpenMemory={() => setIsMemoryPanelOpen(true)}
                            onShowCard={handleShowCardFromChat}
                            currentView={currentView}
                        />
                    </aside>
                </>
            )}
        </div>
    );
};

export default App;