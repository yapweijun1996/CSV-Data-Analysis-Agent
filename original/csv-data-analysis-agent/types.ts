export type CsvRow = { [key: string]: string | number };

// Changed from CsvRow[] to an object to include filename metadata
export interface CsvData {
    fileName: string;
    data: CsvRow[];
}

export interface ColumnProfile {
    name: string;
    type: 'numerical' | 'categorical' | 'date' | 'time' | 'currency' | 'percentage';
    uniqueValues?: number;
    valueRange?: [number, number];
    missingPercentage?: number;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter';
export type AggregationType = 'sum' | 'count' | 'avg';

export interface AnalysisPlan {
    chartType: ChartType;
    title: string;
    description: string;
    aggregation?: AggregationType; // Optional for scatter plots
    groupByColumn?: string; // Optional for scatter plots
    valueColumn?: string; // Optional for 'count' aggregation
    xValueColumn?: string; // For scatter plots
    yValueColumn?: string; // For scatter plots
    defaultTopN?: number; // Suggested Top N for charts with many categories
    defaultHideOthers?: boolean; // Suggestion for hiding 'Others' in Top N
}

export interface AnalysisCardData {
    id: string;
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    summary: string;
    displayChartType: ChartType;
    isDataVisible: boolean;
    topN: number | null; // For Top N filtering
    hideOthers: boolean; // For hiding the 'Others' category in Top N
    disableAnimation?: boolean; // To control loading animations
    filter?: { column: string; values: (string | number)[] }; // For interactive filtering by the AI
    hiddenLabels?: string[]; // For interactive legend visibility
}

export interface ProgressMessage {
    text: string;
    type: 'system' | 'error';
    timestamp: Date;
}

export interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
    type?: 'user_message' | 'ai_message' | 'ai_thinking' | 'ai_proactive_insight' | 'ai_plan_start'; // New field for special message types
    isError?: boolean; // To style error messages in the chat
    cardId?: string; // ID of the card this message refers to
}

export interface Settings {
    provider: 'google' | 'openai';
    geminiApiKey: string;
    openAIApiKey: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gpt-4o' | 'gpt-4-turbo';
    language: 'English' | 'Mandarin' | 'Spanish' | 'Japanese' | 'French';
}

export type AppView = 'file_upload' | 'analysis_dashboard';

export interface AppState {
    currentView: AppView;
    isBusy: boolean;
    progressMessages: ProgressMessage[];
    csvData: CsvData | null;
    columnProfiles: ColumnProfile[];
    analysisCards: AnalysisCardData[];
    chatHistory: ChatMessage[];
    finalSummary: string | null;
    aiCoreAnalysisSummary: string | null; // AI's internal monologue/memory about the dataset
    dataPreparationPlan: DataPreparationPlan | null; // The plan used to clean the data
    initialDataSample: CsvRow[] | null; // Snapshot of raw data for debug view
    vectorStoreDocuments: VectorStoreDocument[]; // For persisting AI memory
}

export interface DomAction {
    toolName: 'highlightCard' | 'changeCardChartType' | 'showCardData' | 'filterCard';
    args: { [key: string]: any };
}

export interface AiAction {
  thought?: string; // The AI's reasoning for this action (ReAct pattern).
  responseType: 'plan_creation' | 'text_response' | 'dom_action' | 'execute_js_code' | 'proceed_to_analysis';
  plan?: AnalysisPlan;
  text?: string;
  cardId?: string; // For text_response, the ID of the card being discussed
  domAction?: DomAction;
  code?: {
    explanation: string;
    jsFunctionBody: string;
  };
}

export interface AiChatResponse {
    actions: AiAction[];
}

export interface DataPreparationPlan {
    explanation: string;
    jsFunctionBody: string | null;
    // CRITICAL FIX: The AI must now define the output schema of its own transformation.
    outputColumns: ColumnProfile[];
}

// For Session History
export interface Report {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
    appState: AppState;
}

export interface ReportListItem {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
}

// For providing richer context to the AI
export interface CardContext {
    id: string;
    title: string;
    aggregatedDataSample: CsvRow[];
}

// For Long-Term Memory / Vector Store
export interface VectorStoreDocument {
    id: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, any>;
}

// For interactive spreadsheet sorting
export interface SortConfig {
    key: string;
    direction: 'ascending' | 'descending';
}