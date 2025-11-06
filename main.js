import {
  processCsv,
  profileData,
  executePlan,
  executeJavaScriptDataTransform,
  applyTopNWithOthers,
} from './utils/dataProcessor.js';
import {
  generateAnalysisPlans,
  generateSummary,
  generateFinalSummary,
  generateChatResponse,
  generateDataPreparationPlan,
  generateCoreAnalysisSummary,
  generateProactiveInsights,
} from './services/geminiService.js';
import {
  getSettings,
  saveSettings,
  getReportsList,
  saveReport,
  getReport,
  deleteReport,
  CURRENT_SESSION_KEY,
} from './storageService.js';
import { getSkillCatalog } from './services/skillLibrary.js';
import { detectIntent } from './utils/intentClassifier.js';
import { storeMemory, retrieveRelevantMemories } from './services/memoryService.js';
import { auditAnalysisState } from './utils/pipelineAudit.js';
import {
  determineRepairActions,
  summariseRepairActions,
  hasCriticalIssues,
} from './utils/repairEngine.js';
import { exportToPng, exportToCsv, exportToHtml } from './utils/exportUtils.js';
import { escapeHtml as escapeHtmlHelper } from './render/helpers.js';
import { renderFinalSummary } from './render/finalSummary.js';
import { renderDataPreviewPanel as renderDataPreviewPanelView } from './render/dataPreviewPanel.js';
import { renderRawDataPanel as renderRawDataPanelView } from './render/rawDataPanel.js';
import { renderAnalysisCard as renderAnalysisCardView } from './render/analysisCard.js';
import { renderAnalysisSection } from './render/analysisPanel.js';
import { renderAssistantPanel as renderAssistantPanelView } from './render/assistantPanel.js';
import { renderWorkflowTimeline } from './render/workflowTimeline.js';
import { renderDataPrepDebugPanel as renderDataPrepDebugPanelView } from './render/dataPrepDebugPanel.js';
import { renderMemoryPanel as renderMemoryPanelView } from './render/memoryPanel.js';
import { createTaskOrchestrator } from './services/taskOrchestrator.js';
import { createHeaderMapping } from './utils/headerMapping.js';
import {
  detectHeadersTool as detectHeadersHelper,
  removeSummaryRowsTool as removeSummaryRowsHelper,
  detectIdentifierColumnsTool as detectIdentifierColumnsHelper,
} from './utils/dataPrepTools.js';
import { ENABLE_MEMORY_FEATURES } from './services/memoryConfig.js';
import { ensureMemoryVectorReady as ensureMemoryVectorReadyHelper } from './services/memoryServiceHelpers.js';
import { bindMemoryPanelEvents as bindMemoryPanelEventsHelper } from './handlers/memoryPanelEvents.js';
import {
  refreshMemoryDocuments as refreshMemoryDocumentsHelper,
  searchMemoryPanel as searchMemoryPanelHelper,
  handleMemoryDelete as handleMemoryDeleteHelper,
  handleMemoryClear as handleMemoryClearHelper,
} from './handlers/memoryPanelHandlers.js';
import { rawDataEditingMethods } from './handlers/rawDataEditing.js';
import { bindRawDataPanelEvents as bindRawDataPanelEventsHelper } from './handlers/rawDataPanelEvents.js';
import { chartRenderingMethods } from './render/chartRenderer.js';
import {
  COLORS,
  SUPPORTED_CHART_TYPES,
  SUPPORTED_AGGREGATIONS,
  RAW_ROWS_PER_PAGE,
  MIN_RAW_COLUMN_WIDTH,
  MEMORY_CAPACITY_KB,
  DOM_ACTION_TOOL_NAMES,
  MIN_ASIDE_WIDTH,
  MAX_ASIDE_WIDTH,
  ENABLE_PIPELINE_REPAIR,
} from './state/constants.js';
import { normaliseTitleKey } from './utils/stringUtils.js';
import { pickFirstString, parseValueList } from './utils/domActionUtils.js';

const DEFAULT_WORKFLOW_CONSTRAINTS = ['Vanilla frontend', 'No backend server'];
/** @typedef {import('./types/typedefs.js').AnalysisPlan} AnalysisPlan */
/** @typedef {import('./types/typedefs.js').AnalysisCardData} AnalysisCardData */
/** @typedef {import('./types/typedefs.js').ColumnProfile} ColumnProfile */

class CsvDataAnalysisApp extends HTMLElement {
  constructor() {
    super();
    const defaultAsideWidth = (() => {
      if (typeof window === 'undefined') return MIN_ASIDE_WIDTH + 40;
      const ideal = window.innerWidth / 4;
      return Math.max(MIN_ASIDE_WIDTH, Math.min(MAX_ASIDE_WIDTH, ideal));
    })();

this.state = {
      currentView: 'file_upload',
      isBusy: false,
      isThinking: false,
      progressMessages: [],
      csvData: null,
      /** @type {ColumnProfile[]} */
      columnProfiles: [],
      /** @type {AnalysisCardData[]} */
      analysisCards: [],
      finalSummary: null,
      aiCoreAnalysisSummary: null,
      dataPreparationPlan: null,
      initialDataSample: null,
      isDataPrepDebugVisible: false,
      chatHistory: [],
      highlightedCardId: null,
      showSettings: false,
      isRawDataVisible: true,
      rawDataFilter: '',
      rawDataWholeWord: false,
      rawDataSort: null,
      rawDataView: 'cleaned',
      rawDataPage: 0,
      rawDataColumnWidths: {},
      originalCsvData: null,
      csvMetadata: null,
      currentDatasetId: null,
      lastAuditReport: null,
      lastRepairSummary: null,
      lastRepairTimestamp: null,
      generatedReport: null,
      reportsList: [],
      isHistoryPanelOpen: false,
      isAsideVisible: true,
      asideWidth: defaultAsideWidth,
      isMemoryPanelOpen: false,
      memoryPanelDocuments: [],
      memoryPanelQuery: '',
      memoryPanelResults: [],
      memoryPanelHighlightedId: null,
      memoryPanelIsSearching: false,
      memoryPanelIsLoading: false,
      memoryPanelLoadError: null,
      workflowTimeline: null,
      workflowPlan: [],
    };
    this.settings = getSettings();
    this.chartInstances = new Map();
    this.renderPending = false;
    this.isMounted = false;
    this.pendingFocus = null;
    this.shouldAutoScrollConversation = true;
    this.conversationLogElement = null;
    this.handleConversationScroll = this.onConversationScroll.bind(this);
    this.chatDraft = '';
    this.sessionSaveTimer = null;
    this.isRestoringSession = false;
    this.initialDataLoaded = false;
    this.isResizingAside = false;
    this.boundAsideMouseMove = this.handleAsideMouseMove.bind(this);
    this.boundAsideMouseUp = this.handleAsideMouseUp.bind(this);
    this.mainScrollElement = null;
    this.savedMainScrollTop = null;
    this.savedConversationScroll = null;
    this.boundDocumentClick = this.onDocumentClick.bind(this);
    this.pendingRawEdits = new Map();
    this.rawEditDatasetId = this.getCurrentDatasetId();
    this.cardTitleRegistry = new Map();
    this.cardIdAlias = new Map();
    this.memoryVectorReady = false;
    this.lastReferencedCard = null;
    this.highlightClearTimer = null;
    this.rawPanelHighlightTimer = null;

    this.workflowSessionId = null;
    this.orchestrator = createTaskOrchestrator({
      onPlanUpdate: planItems => this.handleWorkflowPlanUpdate(planItems),
      onProgress: entry => this.handleWorkflowProgress(entry),
      onChatLog: payload => this.handleWorkflowChat(payload),
    });
    this.workflowActivePhase = null;
    this.hasSavedHistoryEntry = false;
  }

  captureSerializableAppState() {
    const normaliseTimestamp = value => {
      if (value instanceof Date) return value;
      const candidate = new Date(value);
      return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
    };

    const cloneTimeline = list =>
      Array.isArray(list)
        ? list.map(item => ({
            ...item,
            timestamp: normaliseTimestamp(item?.timestamp),
          }))
        : [];

    return {
      currentView: this.state.currentView,
      isBusy: false,
      isThinking: false,
      progressMessages: cloneTimeline(this.state.progressMessages),
      csvData: this.state.csvData,
      columnProfiles: this.state.columnProfiles,
      analysisCards: this.state.analysisCards,
      finalSummary: this.state.finalSummary,
      aiCoreAnalysisSummary: this.state.aiCoreAnalysisSummary,
      dataPreparationPlan: this.state.dataPreparationPlan,
      initialDataSample: this.state.initialDataSample,
      isDataPrepDebugVisible: this.state.isDataPrepDebugVisible,
      chatHistory: cloneTimeline(this.state.chatHistory),
      highlightedCardId: this.state.highlightedCardId,
      showSettings: false,
      isRawDataVisible: this.state.isRawDataVisible,
      rawDataFilter: this.state.rawDataFilter,
      rawDataWholeWord: this.state.rawDataWholeWord,
      rawDataSort: this.state.rawDataSort,
      rawDataView: this.state.rawDataView,
      originalCsvData: this.state.originalCsvData,
      csvMetadata: this.state.csvMetadata,
      currentDatasetId: this.state.currentDatasetId,
      lastAuditReport: this.state.lastAuditReport,
      lastRepairSummary: this.state.lastRepairSummary,
      lastRepairTimestamp: this.state.lastRepairTimestamp,
      workflowTimeline: this.state.workflowTimeline,
      workflowPlan: this.state.workflowPlan,
      generatedReport: this.state.generatedReport,
    };
  }

  rehydrateAppState(appState) {
    if (!appState || typeof appState !== 'object') {
      return null;
    }

    const reviveTimeline = list =>
      Array.isArray(list)
        ? list.map(item => {
            const entry = { ...item };
            if (entry.timestamp && !(entry.timestamp instanceof Date)) {
              const parsed = new Date(entry.timestamp);
              if (!Number.isNaN(parsed.getTime())) {
                entry.timestamp = parsed;
              }
            }
            return entry;
          })
        : [];

    const restored = {
      ...appState,
      isBusy: false,
      isThinking: false,
      progressMessages: reviveTimeline(appState.progressMessages),
      chatHistory: reviveTimeline(appState.chatHistory),
      showSettings: false,
      reportsList: Array.isArray(this.state.reportsList) ? this.state.reportsList : [],
      isHistoryPanelOpen: false,
      generatedReport: appState.generatedReport || null,
    };

    if (!Object.prototype.hasOwnProperty.call(restored, 'dataPreparationPlan')) {
      restored.dataPreparationPlan = null;
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'initialDataSample')) {
      restored.initialDataSample = null;
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'isDataPrepDebugVisible')) {
      restored.isDataPrepDebugVisible = false;
    }

    if (Array.isArray(restored.analysisCards)) {
      restored.analysisCards = restored.analysisCards.map(card => ({
        ...card,
        showSelectionDetails:
          card && Object.prototype.hasOwnProperty.call(card, 'showSelectionDetails')
            ? card.showSelectionDetails
            : true,
        isExporting: false,
      }));
    }

    if (Array.isArray(restored.chatHistory) && Array.isArray(restored.analysisCards)) {
      restored.chatHistory = restored.chatHistory.map(entry => {
        if (!entry || entry.cardTitle || !entry.cardId) {
          return entry;
        }
        const card = restored.analysisCards.find(cardItem => cardItem.id === entry.cardId);
        return card?.plan?.title ? { ...entry, cardTitle: card.plan.title } : entry;
      });
    }

    if (!Object.prototype.hasOwnProperty.call(restored, 'isMemoryPanelOpen')) {
      restored.isMemoryPanelOpen = false;
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'memoryPanelDocuments')) {
      restored.memoryPanelDocuments = [];
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'memoryPanelQuery')) {
      restored.memoryPanelQuery = '';
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'memoryPanelResults')) {
      restored.memoryPanelResults = [];
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'memoryPanelHighlightedId')) {
      restored.memoryPanelHighlightedId = null;
    }
    if (!Object.prototype.hasOwnProperty.call(restored, 'memoryPanelIsSearching')) {
      restored.memoryPanelIsSearching = false;
    }

    if (!restored.currentView) {
      restored.currentView =
        restored.csvData && Array.isArray(restored.csvData.data) && restored.csvData.data.length
          ? 'analysis_dashboard'
          : 'file_upload';
    }

    return restored;
  }

  async initializeAppState() {
    try {
      this.isRestoringSession = true;
      const updates = {};

      try {
        const currentSession = await getReport(CURRENT_SESSION_KEY);
        if (currentSession?.appState) {
          const restoredState = this.rehydrateAppState(currentSession.appState);
          if (restoredState) {
            Object.assign(updates, restoredState);
          }
        }
      } catch (error) {
        console.error('Failed to restore current session from IndexedDB:', error);
      }

      try {
        const reports = await getReportsList();
        updates.reportsList = reports;
      } catch (error) {
        console.error('Failed to load reports list from IndexedDB:', error);
      }

      if (Object.keys(updates).length) {
        this.setState(prev => ({ ...prev, ...updates }));
      }
    } finally {
      this.isRestoringSession = false;
      this.initialDataLoaded = true;
    }
  }

  scheduleSessionSave() {
    if (this.isRestoringSession || !this.initialDataLoaded) return;
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.saveCurrentSession();
    }, 800);
  }

  async saveCurrentSession() {
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }
    if (this.isRestoringSession || !this.initialDataLoaded) return;
    if (!this.state.csvData || !Array.isArray(this.state.csvData.data) || !this.state.csvData.data.length) {
      return;
    }

    try {
      const existing = await getReport(CURRENT_SESSION_KEY);
      const payload = {
        id: CURRENT_SESSION_KEY,
        filename: this.state.csvData.fileName || 'Current Session',
        createdAt: existing?.createdAt ? new Date(existing.createdAt) : new Date(),
        updatedAt: new Date(),
        appState: this.captureSerializableAppState(),
      };
      await saveReport(payload);
      if (this.state.isHistoryPanelOpen) {
        const fresh = await getReportsList();
        const previousFlag = this.isRestoringSession;
        this.isRestoringSession = true;
        this.setState({ reportsList: fresh });
        this.isRestoringSession = previousFlag;
      }
    } catch (error) {
      console.error('Failed to persist current session to IndexedDB:', error);
    }
  }

  async archiveCurrentSession() {
    try {
      const existing = await getReport(CURRENT_SESSION_KEY);
      if (existing) {
        const createdAt = existing.createdAt ? new Date(existing.createdAt) : new Date();
        const archiveId = `report-${createdAt.getTime()}`;
        await saveReport({
          ...existing,
          id: archiveId,
          updatedAt: new Date(),
        });
      }
      await deleteReport(CURRENT_SESSION_KEY);
    } catch (error) {
      console.error('Failed to archive previous session:', error);
    }
  }

  async loadReportsList() {
    const previousFlag = this.isRestoringSession;
    try {
      const reports = await getReportsList();
      this.isRestoringSession = true;
      this.setState({ reportsList: reports });
    } catch (error) {
      console.error('Failed to refresh reports list:', error);
    } finally {
      this.isRestoringSession = previousFlag;
    }
  }

  validatePlanForExecution(plan) {
    if (!plan || typeof plan !== 'object') {
      return 'Plan configuration is missing.';
    }
    if (!plan.chartType) {
      return 'Missing chart type.';
    }
    // Allow advanced correlation analysis to bypass aggregation checks; executePlan will populate fields.
    if (plan.analysisType === 'correlation') {
      return null;
    }
    if (plan.chartType === 'scatter') {
      return null;
    }
    const aggregation = typeof plan.aggregation === 'string' ? plan.aggregation.toLowerCase() : '';
    if (!SUPPORTED_AGGREGATIONS.has(aggregation)) {
      return 'Missing valid aggregation (sum/count/avg).';
    }
    if (!plan.groupByColumn) {
      return 'Missing group-by column.';
    }
    if (aggregation !== 'count' && !plan.valueColumn) {
      return 'Missing value column.';
    }
    return null;
  }

  getAvailableColumns() {
    if (Array.isArray(this.state.columnProfiles) && this.state.columnProfiles.length) {
      return this.state.columnProfiles.map(profile => profile.name);
    }
    const firstRow = this.state.csvData?.data?.[0];
    return firstRow ? Object.keys(firstRow) : [];
  }

  getNumericColumns() {
    if (!Array.isArray(this.state.columnProfiles)) {
      return [];
    }
    return this.state.columnProfiles
      .filter(profile => profile?.type === 'numerical')
      .map(profile => profile.name);
  }

  getCategoricalColumns(availableColumns = [], numericColumns = []) {
    if (!Array.isArray(this.state.columnProfiles)) {
      return availableColumns.filter(name => !numericColumns.includes(name));
    }

    const categorical = this.state.columnProfiles
      .filter(profile => profile?.type !== 'numerical')
      .map(profile => profile.name);

    if (categorical.length) {
      return categorical;
    }

    if (!availableColumns.length) {
      availableColumns = this.getAvailableColumns();
    }

    if (!numericColumns.length) {
      numericColumns = this.getNumericColumns();
    }

    const numericSet = new Set(numericColumns);
    return availableColumns.filter(name => !numericSet.has(name));
  }

  resolveColumnName(name, availableColumns = null) {
    if (!name) return null;
    const columns = Array.isArray(availableColumns) ? availableColumns : this.getAvailableColumns();
    if (!columns.length) return null;
    if (columns.includes(name)) {
      return name;
    }
    const target = String(name).toLowerCase();
    return columns.find(column => column.toLowerCase() === target) || null;
  }

  preparePlanForExecution(plan) {
    if (!plan || typeof plan !== 'object') {
      return { plan: null, adjustments: [], error: 'Plan payload is missing.' };
    }

    const availableColumns = this.getAvailableColumns();
    if (!availableColumns.length) {
      return { plan: null, adjustments: [], error: 'No columns available to build the analysis.' };
    }

    const normalized = { ...plan };
    const adjustments = [];

    if (!normalized.title) {
      normalized.title = 'Untitled Analysis';
      adjustments.push('Assigned default title "Untitled Analysis".');
    }
    const titleLabel = normalized.title;

    if (normalized.chartType) {
      normalized.chartType = String(normalized.chartType).toLowerCase();
    }
    if (!SUPPORTED_CHART_TYPES.has(normalized.chartType)) {
      normalized.chartType = 'bar';
      adjustments.push(`${titleLabel}: Missing chart type; defaulted to bar chart.`);
    }
  
    if (normalized.chartType === 'scatter') {
      Object.assign(plan, normalized);
      return { plan, adjustments, error: null };
    }
    // Allow correlation plans to skip standard aggregation/group-by resolution.
    if (normalized.analysisType === 'correlation') {
      Object.assign(plan, normalized);
      return { plan, adjustments, error: null };
    }
  
    let aggregation = typeof normalized.aggregation === 'string' ? normalized.aggregation.toLowerCase() : '';
    if (!SUPPORTED_AGGREGATIONS.has(aggregation)) {
      aggregation = normalized.valueColumn ? 'sum' : 'count';
      adjustments.push(`${titleLabel}: Invalid aggregation; switched to ${aggregation}.`);
    }
    normalized.aggregation = aggregation;

    const numericColumns = this.getNumericColumns();
    const categoricalColumns = this.getCategoricalColumns(availableColumns, numericColumns);

    let groupBy = this.resolveColumnName(normalized.groupByColumn, availableColumns);
    if (!groupBy) {
      groupBy =
        categoricalColumns.find(col => col !== normalized.valueColumn) ||
        availableColumns.find(col => col !== normalized.valueColumn) ||
        availableColumns[0] ||
        null;

      if (!groupBy) {
        return { plan: null, adjustments, error: 'No suitable column available for grouping.' };
      }
      adjustments.push(`${titleLabel}: Missing group-by column; defaulted to "${groupBy}".`);
    }
    normalized.groupByColumn = groupBy;

    if (normalized.aggregation === 'count') {
      normalized.valueColumn = null;
    } else {
      let valueColumn = this.resolveColumnName(normalized.valueColumn, availableColumns);
      if (!valueColumn || valueColumn === groupBy) {
        valueColumn =
          numericColumns.find(col => col !== groupBy) ||
          numericColumns[0] ||
          null;
      }

      if (!valueColumn || valueColumn === groupBy) {
        normalized.aggregation = 'count';
        normalized.valueColumn = null;
        adjustments.push(`${titleLabel}: No numeric column available; switched aggregation to count.`);
      } else {
        normalized.valueColumn = valueColumn;
        if (!plan.valueColumn || plan.valueColumn !== valueColumn) {
          adjustments.push(`${titleLabel}: Value column set to "${valueColumn}".`);
        }
      }
    }

    Object.assign(plan, normalized);
    return { plan, adjustments, error: null };
  }

  createStableHash(input) {
    const source = typeof input === 'string' ? input : String(input ?? '');
    if (!source.length) {
      return '00000000';
    }
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
      hash >>>= 0;
    }
    return (`0000000${(hash >>> 0).toString(16)}`).slice(-8);
  }

  computeDatasetFingerprint(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return 'no-data';
    }
    const sample = rows.slice(0, 25);
    const sampleSignature = sample
      .map(row => {
        if (!row || typeof row !== 'object') {
          return '';
        }
        const keys = Object.keys(row).sort();
        return keys
          .map(key => `${key}:${row[key] === null || row[key] === undefined ? '' : String(row[key])}`)
          .join('|');
      })
      .join('||');
    return this.createStableHash(sampleSignature);
  }

  async runPipelineAudit(options = {}) {
    const { log = false } = options;
    const report = auditAnalysisState({
      csvData: this.state.csvData,
      columnProfiles: this.state.columnProfiles,
      analysisCards: this.state.analysisCards,
      chatHistory: this.state.chatHistory,
      csvMetadata: this.state.csvMetadata,
      settings: this.settings,
    });

    this.setState({ lastAuditReport: report });

    if (log) {
      if (!report.issues.length) {
        this.addProgress(`Audit clean: ${report.summary}`);
      } else {
        this.addProgress(`Audit detected issues: ${report.summary}`);
        report.issues.slice(0, 5).forEach(issue => {
          this.addProgress(`[${issue.severity.toUpperCase()}] ${issue.message}`);
        });
      if (report.issues.length > 5) {
          this.addProgress(`...and ${report.issues.length - 5} more issue(s).`);
        }
        console.warn('Audit issues detected:', report);
      }
    }

    return report;
  }

  removeCardById(cardId) {
    if (!cardId) return;
    this.setState(prev => ({
      analysisCards: prev.analysisCards.filter(card => card.id !== cardId),
    }));
  }

  async rebuildCardWithPlan(cardId, newPlan) {
    if (!this.state.csvData || !newPlan) {
      return { success: false, error: 'Cannot rebuild card without dataset or plan.' };
    }
    this.removeCardById(cardId);
    const resultCards = await this.runAnalysisPipeline([newPlan], this.state.csvData, true, {
      skipAutoRepair: true,
    });
    if (resultCards.length) {
      const newCard = resultCards[resultCards.length - 1];
      this.addProgress(`Card ${cardId} rebuilt using repair plan.`);
      return { success: true, card: newCard };
    }
    return { success: false, error: 'Repair plan produced no card.' };
  }

  async autoRepairIfNeeded(auditReport) {
    if (!auditReport) return null;
    const repairPlan = determineRepairActions(
      {
        csvData: this.state.csvData,
        columnProfiles: this.state.columnProfiles,
        analysisCards: this.state.analysisCards,
        chatHistory: this.state.chatHistory,
        csvMetadata: this.state.csvMetadata,
        currentDatasetId: this.getCurrentDatasetId(),
      },
      { auditReport }
    );

    if (!repairPlan.actions.length) {
      let summaryText = 'Audit clean; no repair actions required.';
      if (hasCriticalIssues(auditReport)) {
        summaryText = 'Audit found critical issues but no automated repair actions are available.';
        this.addProgress(summaryText, 'error');
        console.error('Critical issues without repair actions:', {
          auditReport,
        });
      }
      this.setState({
        lastRepairSummary: summaryText,
        lastRepairTimestamp: new Date().toISOString(),
      });
      return repairPlan;
    }

    this.addProgress('Auto-repair starting...');
    const repairSummaryText = summariseRepairActions(repairPlan);
    this.addProgress(repairSummaryText);
    this.setState({
      lastRepairSummary: repairSummaryText,
      lastRepairTimestamp: new Date().toISOString(),
    });

    for (const action of repairPlan.actions) {
      if (action.type === 'system_message') {
        this.addProgress(`Audit summary: ${action.summary}`);
        continue;
      }
      if (action.type === 'plan_patch') {
        try {
          await this.rebuildCardWithPlan(action.cardId, action.patchedPlan);
          console.info('Applied repair action', action);
        } catch (error) {
          this.addProgress(
            `Failed to apply repair to card ${action.cardId}: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
          console.error('Repair action failure:', { action, error });
        }
      }
    }

    const postAudit = await this.runPipelineAudit({ log: true });
    return { ...repairPlan, postAudit };
  }

  generateDatasetId(fileName, metadata = null, dataRows = null) {
    const baseName = (fileName || 'dataset').toLowerCase().replace(/\s+/g, '-');
    const totalRows =
      metadata?.originalRowCount ??
      metadata?.totalRowsBeforeFilter ??
      (Array.isArray(dataRows) ? dataRows.length : this.state.csvData?.data?.length ?? 0);
    const headerSignature = metadata?.headerRow
      ? this.createStableHash(metadata.headerRow.join('|').toLowerCase())
      : 'noheader';
    const fingerprint =
      typeof metadata?.datasetFingerprint === 'string' && metadata.datasetFingerprint
        ? metadata.datasetFingerprint
        : typeof metadata?.sourceFingerprint === 'string' && metadata.sourceFingerprint
        ? metadata.sourceFingerprint
        : this.computeDatasetFingerprint(
            Array.isArray(dataRows) && dataRows.length ? dataRows : this.state.csvData?.data || []
          );
    return `${baseName}-${totalRows}-${headerSignature}-${fingerprint}`;
  }

  getCurrentDatasetId() {
    return this.state.currentDatasetId || 'session';
  }

  updateMetadataContext(metadata, dataRows) {
    if (!metadata) {
      return metadata;
    }
    const rowsArray = Array.isArray(dataRows) ? dataRows : [];
    const contextLimit = 20;
    const headerRow = Array.isArray(metadata.headerRow) && metadata.headerRow.length
      ? metadata.headerRow
      : rowsArray.length
      ? Object.keys(rowsArray[0])
      : [];
    const leadingRows = Array.isArray(metadata.leadingRows)
      ? metadata.leadingRows
      : [];
    const dataContextRows = rowsArray.slice(0, contextLimit).map(row =>
      headerRow.map(column => {
        const value = row?.[column];
        return value === null || value === undefined ? '' : String(value);
      })
    );
    const combinedContextRows = [...leadingRows, ...dataContextRows].slice(0, contextLimit);
    return {
      ...metadata,
      contextRows: combinedContextRows,
      contextRowCount: combinedContextRows.length,
    };
  }

  connectedCallback() {
    this.isMounted = true;
    this.render();
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.boundDocumentClick, true);
    }
    this.initializeAppState().catch(error =>
      console.error('Failed during initial app state restoration:', error)
    );
  }

  disconnectedCallback() {
    this.isMounted = false;
    this.destroyCharts();
    if (this.conversationLogElement) {
      this.conversationLogElement.removeEventListener('scroll', this.handleConversationScroll);
      this.conversationLogElement = null;
    }
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }
    if (this.isResizingAside) {
      this.handleAsideMouseUp();
    }
    if (this.highlightClearTimer) {
      clearTimeout(this.highlightClearTimer);
      this.highlightClearTimer = null;
    }
    if (this.rawPanelHighlightTimer) {
      clearTimeout(this.rawPanelHighlightTimer);
      this.rawPanelHighlightTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.boundDocumentClick, true);
    }
  }

  setState(updater) {
    const prevState = this.state;
    const nextPartial = typeof updater === 'function' ? updater(prevState) : updater;
    if (!nextPartial || typeof nextPartial !== 'object') {
      return;
    }
    const nextState = { ...prevState, ...nextPartial };
    const hasAnalysisCardsUpdate = Object.prototype.hasOwnProperty.call(nextPartial, 'analysisCards');
    this.captureConversationScrollPosition();
    this.captureMainScrollPosition();
    if (hasAnalysisCardsUpdate) {
      const cards = Array.isArray(nextState.analysisCards) ? nextState.analysisCards : [];
      this.syncCardRegistries(cards);
    }
    this.state = nextState;
    this.captureFocus();
    this.scheduleRender();
    this.scheduleSessionSave();
  }

  resetCardRegistries() {
    if (this.cardTitleRegistry) {
      this.cardTitleRegistry.clear();
    } else {
      this.cardTitleRegistry = new Map();
    }
    if (this.cardIdAlias) {
      this.cardIdAlias.clear();
    } else {
      this.cardIdAlias = new Map();
    }
    this.lastReferencedCard = null;
  }

  linkAliasToCard(card, aliasId = null) {
    if (!card || typeof card !== 'object') return;
    const canonicalId = typeof card.id === 'string' ? card.id : null;
    if (!canonicalId) return;

    if (!this.cardIdAlias) {
      this.cardIdAlias = new Map();
    }
    this.cardIdAlias.set(canonicalId, canonicalId);

    const shouldLinkAlias = typeof aliasId === 'string' && aliasId && aliasId !== canonicalId;
    const titleKey = normaliseTitleKey(card.plan?.title);
    if (!titleKey) {
      if (shouldLinkAlias) {
        this.cardIdAlias.set(aliasId, canonicalId);
      }
      return;
    }

    if (!this.cardTitleRegistry) {
      this.cardTitleRegistry = new Map();
    }
    let record = this.cardTitleRegistry.get(titleKey);
    if (!record) {
      record = { latestId: canonicalId, history: new Set() };
    }
    record.latestId = canonicalId;
    record.history.add(canonicalId);
    if (shouldLinkAlias) {
      record.history.add(aliasId);
    }
    this.cardTitleRegistry.set(titleKey, record);

    record.history.forEach(existingAlias => {
      if (existingAlias && typeof existingAlias === 'string') {
        this.cardIdAlias.set(existingAlias, canonicalId);
      }
    });
  }

  registerAnalysisCard(card) {
    if (!card || typeof card !== 'object') return;
    this.linkAliasToCard(card);
  }

  syncCardRegistries(cards) {
    if (!Array.isArray(cards)) return;
    cards.forEach(card => this.registerAnalysisCard(card));
  }

  async ensureMemoryVectorReady(progressCallback) {
    return ensureMemoryVectorReadyHelper({
      app: this,
      progressCallback,
    });
  }

  async openMemoryPanel() {
    if (!ENABLE_MEMORY_FEATURES) {
      this.addProgress('Memory features are currently disabled.', 'error');
      return;
    }
    this.setState({
      isMemoryPanelOpen: true,
      memoryPanelQuery: '',
      memoryPanelResults: [],
      memoryPanelHighlightedId: null,
      memoryPanelIsSearching: false,
      memoryPanelIsLoading: true,
      memoryPanelLoadError: null,
    });
    try {
      const ready = this.memoryVectorReady
        ? true
        : await this.ensureMemoryVectorReady(message => this.addProgress(message));
      if (!ready) {
        this.setState({
          memoryPanelIsLoading: false,
          memoryPanelLoadError: 'Unable to load the AI memory model. Please try again later.',
        });
        return;
      }
      await this.refreshMemoryDocuments({ showSpinner: false, skipEnsure: true, silent: true });
      this.setState({
        memoryPanelIsLoading: false,
        memoryPanelLoadError: null,
      });
    } catch (error) {
      console.warn('Failed to initialise memory panel.', error);
      this.setState({
        memoryPanelIsLoading: false,
        memoryPanelLoadError: 'Failed to load memories. Check your connection and retry.',
      });
      this.addProgress('Unable to load memories right now.', 'error');
    }
  }

  closeMemoryPanel() {
    this.setState({
      isMemoryPanelOpen: false,
      memoryPanelQuery: '',
      memoryPanelResults: [],
      memoryPanelHighlightedId: null,
      memoryPanelIsSearching: false,
      memoryPanelIsLoading: false,
      memoryPanelLoadError: null,
    });
  }

  async refreshMemoryDocuments(options = {}) {
    if (!ENABLE_MEMORY_FEATURES) {
      return;
    }
    const config = options && typeof options === 'object' ? options : {};
    const showSpinner = Boolean(config.showSpinner);
    const skipEnsure = Boolean(config.skipEnsure);
    const silent = Boolean(config.silent);
    if (showSpinner) {
      this.setState({
        memoryPanelIsLoading: true,
        memoryPanelLoadError: null,
      });
    }
    try {
      if (!skipEnsure && !this.memoryVectorReady) {
        const ready = await this.ensureMemoryVectorReady(message => this.addProgress(message));
        if (!ready) {
          if (showSpinner) {
            this.setState({
              memoryPanelIsLoading: false,
              memoryPanelLoadError: 'Unable to load the AI memory model. Please try again later.',
            });
          }
          return;
        }
      }
      refreshMemoryDocumentsHelper({ app: this, enableMemory: ENABLE_MEMORY_FEATURES });
      if (showSpinner) {
        this.setState({
          memoryPanelIsLoading: false,
          memoryPanelLoadError: null,
        });
      } else if (this.state.memoryPanelLoadError) {
        this.setState({ memoryPanelLoadError: null });
      }
    } catch (error) {
      console.warn('Failed to refresh memory documents.', error);
      if (showSpinner) {
        this.setState({
          memoryPanelIsLoading: false,
          memoryPanelLoadError: 'Failed to refresh memories. Try again shortly.',
        });
      }
      if (!silent) {
        this.addProgress('Unable to refresh memory panel right now.', 'error');
      }
    }
  }

  async searchMemoryPanel(query) {
    await searchMemoryPanelHelper({
      app: this,
      query,
      enableMemory: ENABLE_MEMORY_FEATURES,
    });
  }

  focusMemoryDocument(docId) {
    if (!docId) return;
    this.setState({ memoryPanelHighlightedId: docId });
    queueMicrotask(() => {
      try {
        const escapedId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(docId)
            : docId.replace(/"/g, '\\"');
        const element = this.querySelector(`[data-memory-doc="${escapedId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        console.warn('Failed to focus memory document element.', error);
      }
    });
  }

  async handleMemoryDelete(id) {
    await handleMemoryDeleteHelper({
      app: this,
      id,
      enableMemory: ENABLE_MEMORY_FEATURES,
    });
  }

  async handleMemoryClear() {
    await handleMemoryClearHelper({
      app: this,
      enableMemory: ENABLE_MEMORY_FEATURES,
    });
  }

  calculateMemoryUsage(documents) {
    if (!Array.isArray(documents) || !documents.length) {
      return 0;
    }
    const textSize = documents.reduce((total, doc) => total + (doc.text?.length || 0) * 2, 0);
    const embeddingSize = documents.reduce((total, doc) => {
      const embedding = doc.embedding || {};
      if (embedding.type === 'transformer' && Array.isArray(embedding.values)) {
        return total + embedding.values.length * 4;
      }
      if (embedding.type === 'bow' && embedding.weights) {
        return total + Object.keys(embedding.weights).length * 8;
      }
      if (Array.isArray(embedding)) {
        return total + embedding.length * 4;
      }
      if (embedding.weights) {
        return total + Object.keys(embedding.weights).length * 8;
      }
      return total;
    }, 0);
    return (textSize + embeddingSize) / 1024;
  }

  getCardByIdOrAlias(cardId) {
    if (typeof cardId !== 'string' || !cardId) {
      return null;
    }
    const direct = this.state.analysisCards.find(card => card.id === cardId);
    if (direct) {
      return direct;
    }
    if (this.cardIdAlias && typeof this.cardIdAlias.get === 'function') {
      const canonicalId = this.cardIdAlias.get(cardId);
      if (canonicalId && typeof canonicalId === 'string') {
        const aliasCard = this.state.analysisCards.find(card => card.id === canonicalId);
        if (aliasCard) {
          return aliasCard;
        }
      }
    }
    return null;
  }

  resolveCardReference(cardIdInput, fallbackTitle) {
    const trimmedTitle =
      typeof fallbackTitle === 'string' && fallbackTitle.trim() ? fallbackTitle.trim() : null;
    const titleKey = trimmedTitle ? normaliseTitleKey(trimmedTitle) : null;

    let card = null;
    let resolvedId = null;

    if (typeof cardIdInput === 'string' && cardIdInput) {
      card = this.getCardByIdOrAlias(cardIdInput);
      if (card) {
        resolvedId = card.id;
      }
    }

    if (!card && titleKey) {
      card =
        this.state.analysisCards.find(
          existing => normaliseTitleKey(existing.plan?.title) === titleKey
        ) || null;
      if (!card) {
        const registry =
          this.cardTitleRegistry && typeof this.cardTitleRegistry.get === 'function'
            ? this.cardTitleRegistry.get(titleKey)
            : null;
        if (registry?.latestId) {
          card =
            this.state.analysisCards.find(existing => existing.id === registry.latestId) || card;
        }
      }
      if (card) {
        resolvedId = card.id;
      }
    }

    if (card) {
      if (typeof cardIdInput === 'string' && cardIdInput && cardIdInput !== card.id) {
        this.linkAliasToCard(card, cardIdInput);
      } else {
        this.linkAliasToCard(card);
      }
      this.lastReferencedCard = {
        id: card.id,
        title: card.plan?.title || trimmedTitle || null,
      };
    }

    const fallback =
      card?.plan?.title || (trimmedTitle && trimmedTitle.length ? trimmedTitle : null) || null;

    return {
      card,
      cardId: resolvedId || (typeof cardIdInput === 'string' ? cardIdInput : null),
      fallbackTitle: fallback,
    };
  }

  captureFocus() {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (!this.contains(active)) return;
    if (
      !(active instanceof HTMLInputElement) &&
      !(active instanceof HTMLTextAreaElement) &&
      active.contentEditable !== 'true'
    ) {
      return;
    }
    const focusKey = active.getAttribute('data-focus-key') || active.id;
    if (!focusKey) return;
    let selectionStart = null;
    let selectionEnd = null;
    if ('selectionStart' in active) {
      selectionStart = active.selectionStart;
      selectionEnd = active.selectionEnd;
    }
    this.pendingFocus = {
      focusKey,
      useDataset: Boolean(active.getAttribute('data-focus-key')),
      selectionStart,
      selectionEnd,
      scrollTop: active.scrollTop ?? null,
    };
  }

  updateCard(cardId, updater) {
    this.setState(prev => {
      const cards = prev.analysisCards.map(card => {
        if (card.id !== cardId) {
          return card;
        }
        const updates = updater(card) || {};
        return { ...card, ...updates };
      });
      return { analysisCards: cards };
    });
  }

  scheduleRender() {
    if (!this.isMounted) return;
    if (this.renderPending) return;
    this.renderPending = true;
    queueMicrotask(() => {
      this.renderPending = false;
      if (this.isMounted) {
        this.render();
      }
    });
  }

  waitForNextFrame() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  addProgress(text, type = 'system') {
    const timestamp = new Date();
    const shouldStick = this.isConversationNearBottom();
    const newMessage = {
      text,
      type,
      timestamp,
    };
    this.setState(prev => ({
      progressMessages: [...prev.progressMessages, newMessage],
    }));
    if (shouldStick) {
      this.shouldAutoScrollConversation = true;
    }
  }

  getCardValueKey(card) {
    if (!card || !card.plan) return 'value';
    if (card.plan.chartType === 'scatter') {
      return card.plan.valueColumn || card.plan.yValueColumn || 'value';
    }
    if (card.plan.valueColumn) {
      return card.plan.valueColumn;
    }
    if (card.plan.aggregation === 'count') {
      return 'count';
    }
    return 'value';
  }

  getCardLegendData(card) {
    const { plan, aggregatedData, topN, filter } = card;
    let data = Array.isArray(aggregatedData) ? [...aggregatedData] : [];
    if (filter && filter.column && Array.isArray(filter.values) && filter.values.length) {
      const allowed = new Set(filter.values.map(value => String(value)));
      data = data.filter(row => allowed.has(String(row?.[filter.column])));
    }
    if (plan.chartType === 'scatter' || !plan.groupByColumn) {
      return data;
    }
    const groupByColumn = plan.groupByColumn;
    if (topN) {
      const valueKey = this.getCardValueKey(card);
      data = applyTopNWithOthers(data, groupByColumn, valueKey, topN);
    }
    return data;
  }

  getCardDisplayData(card) {
    const { plan, hideOthers, hiddenLabels = [] } = card;
    if (plan.chartType === 'scatter') {
      return this.getCardLegendData(card);
    }
    const groupKey = plan.groupByColumn;
    let data = this.getCardLegendData(card);
    if (!groupKey) {
      return data;
    }
    if (card.topN && hideOthers) {
      data = data.filter(row => row[groupKey] !== 'Others');
    }
    if (hiddenLabels.length > 0) {
      data = data.filter(row => !hiddenLabels.includes(String(row[groupKey])));
    }
    return data;
  }

  getCardTotalValue(card) {
    const legendData = this.getCardLegendData(card);
    const valueKey = this.getCardValueKey(card);
    return legendData.reduce((sum, row) => sum + (Number(row?.[valueKey]) || 0), 0);
  }

  splitSummary(summary) {
    if (!summary) {
      return { primary: '', secondary: '' };
    }
    const parts = summary.split('---');
    return {
      primary: (parts[0] || '').trim(),
      secondary: (parts[1] || '').trim(),
    };
  }

  escapeHtml(value) {
    return escapeHtmlHelper(value);
  }

  async handleFileInput(file) {
    if (!file) return;
    this.clearPendingRawEdits();
    this.resetCardRegistries();
    if (this.workflowSessionId) {
      this.finalizeWorkflow('切換到新的 CSV 檔案，結束上一段工作流程。');
    }
    const prevCsv = this.state.csvData;
    if (prevCsv && Array.isArray(prevCsv.data) && prevCsv.data.length) {
      await this.archiveCurrentSession();
    } else {
      try {
        await deleteReport(CURRENT_SESSION_KEY);
      } catch (error) {
        console.error('Failed to clear previous current session before upload:', error);
      }
    }
    await this.loadReportsList();
    this.setState({
      isBusy: true,
      progressMessages: [],
      csvData: { fileName: file.name, data: [] },
      originalCsvData: null,
      csvMetadata: null,
      analysisCards: [],
      finalSummary: null,
      aiCoreAnalysisSummary: null,
      dataPreparationPlan: null,
      initialDataSample: null,
      isDataPrepDebugVisible: false,
      chatHistory: [],
      highlightedCardId: null,
      currentView: 'analysis_dashboard',
      rawDataView: 'cleaned',
      rawDataPage: 0,
      rawDataColumnWidths: {},
    });

    this.startWorkflowSession(`分析資料集 ${file.name}`, DEFAULT_WORKFLOW_CONSTRAINTS);
    this.startWorkflowPhase('diagnose', '先快速檢查 CSV 檔案格式與欄位資訊。');
    this.hasSavedHistoryEntry = false;

    try {
      if (this.orchestrator) {
        const { clearContextValue, setAutoTaskFlag } = this.orchestrator;
        if (typeof clearContextValue === 'function') {
          clearContextValue('headerMapping');
        }
        if (typeof setAutoTaskFlag === 'function') {
          setAutoTaskFlag('header_mapping_logged', false);
        }
      }
      this.addProgress('Parsing CSV file...');
      this.appendWorkflowThought('開始解析 CSV，確認原始列數。');
      const parsedData = await processCsv(file);
      this.addProgress(`Parsed ${parsedData.data.length} rows.`);
      this.completeWorkflowStep({
        label: '解析 CSV',
        outcome: `${parsedData.data.length} rows`,
      });
      const initialSample = parsedData.data.slice(0, 20);

      const metadata = parsedData.metadata || null;
      if (metadata?.reportTitle) {
        this.addProgress(`Detected report title: "${metadata.reportTitle}".`);
      }
      const contextCount = metadata?.contextRowCount || metadata?.leadingRows?.length || 0;
      if (contextCount) {
        this.addProgress(
          `Extracted the first ${Math.min(contextCount, 20)} rows as context for the report (including headers/leading rows and initial data rows) for the AI to understand the data source.`
        );
      }
      if (
        metadata &&
        typeof metadata.originalRowCount === 'number' &&
        typeof metadata.cleanedRowCount === 'number'
      ) {
        const removed = Math.max(metadata.originalRowCount - metadata.cleanedRowCount, 0);
        this.addProgress(
          `The original data has ${metadata.originalRowCount.toLocaleString()} rows, and after cleaning, ${metadata.cleanedRowCount.toLocaleString()} rows are retained${removed > 0 ? `, of which ${removed.toLocaleString()} rows are non-data rows such as titles or totals.` : '.'}`
        );
      }

      let dataForAnalysis = parsedData;
      let profiles = profileData(parsedData.data);
      this.completeWorkflowStep({
        label: '欄位型態分析',
        outcome: `${profiles.length} columns`,
      });
      this.endWorkflowPhase();

      const isApiKeySet = this.hasConfiguredApiKey();
      let prepPlan = null;
      let prepIterationsLog = [];
      let toolHistory = [];
      let activeMetadata = dataForAnalysis.metadata || metadata || null;
      let headerMappingContext = this.ensureHeaderMappingContext(activeMetadata, {
        reason: 'preflight',
        logStep: false,
      });

      if (isApiKeySet) {
        this.startWorkflowPhase('plan', '規劃資料清理與前處理步驟。');
        this.resetAdditionalPrepIterations();
        this.clearViolationCounter();
        const basePrepIterations = 3;
        const maxRetriesPerIteration = 3;
        let iteration = 0;
        let continueIterating = true;
        let lastIterationError = null;
        let lastSuccessfulPlan = null;

        while (continueIterating) {
          const maxPrepIterations = basePrepIterations + this.getAdditionalPrepIterations();
          if (iteration >= maxPrepIterations) {
            this.addProgress(
              `AI preprocessing reached the maximum of ${maxPrepIterations} iterations. Stopping further retries.`,
              'error'
            );
            break;
          }
          iteration += 1;
          const iterationLabel = `AI prep iteration ${iteration}`;
          const sampleRowsForPlan = dataForAnalysis.data.slice(0, 20);
          let iterationPlan = null;
          let attemptErrorForPrompt = lastIterationError;
          let iterationCompleted = false;

          if (iteration === 1 && !lastIterationError) {
            this.addProgress('AI is evaluating the data and proposing preprocessing steps...');
          } else {
            this.addProgress(`${iterationLabel} in progress...`);
          }

          for (let attempt = 0; attempt < maxRetriesPerIteration; attempt += 1) {
            const attemptLabel = attempt + 1;
            this.addProgress(
              `${iterationLabel} attempt ${attemptLabel}: requesting updated preprocessing plan...`
            );
            const iterationContextPayload = {
              iteration,
              maxIterations: maxPrepIterations,
              attempt: attemptLabel,
              history: prepIterationsLog.map(entry => ({
                iteration: entry.iteration,
                status: entry.status,
                summary: entry.summary,
                explanation: entry.explanation,
                lastError: entry.lastError || null,
              })),
              headerMapping: headerMappingContext,
              toolHistory: toolHistory.slice(-5),
            };
            iterationContextPayload.onViolation = violation => {
              if (!violation || typeof violation !== 'object') return;
              if (violation.type === 'hard_coded_structure') {
                const violationMessage =
                  typeof violation.message === 'string' && violation.message.trim()
                    ? violation.message.trim()
                    : 'Generated transform relies on hard-coded structure.';
                this.addProgress(
                  `${iterationLabel} attempt ${attemptLabel} 被拒絕：${violationMessage}`,
                  'error'
                );
                const violationCount = this.incrementViolationCounter(violation.type);
                if (violationCount >= 2) {
                  this.enterAdjustPhase('偵測到重複的欄位硬編錯誤，進入調整階段修正策略。');
                  this.extendPrepIterationBudget(1);
                }
                iterationContextPayload.violationGuidance =
                  'Do NOT hard-code column names (e.g., "column_3") anywhere in the transform. Use metadata.genericHeaders and `_util.applyHeaderMapping(row, mapping)` to resolve canonical column names dynamically.';
                const updatedContext = this.ensureHeaderMappingContext(activeMetadata, {
                  reason: 'hard_coded_structure',
                  logStep: true,
                  iterationLabel,
                  attemptLabel,
                  violationMessage,
                });
                if (updatedContext) {
                  headerMappingContext = updatedContext;
                  iterationContextPayload.headerMapping = updatedContext;
                  this.addProgress(
                    'Plan 調整：套用 header mapping，準備重新嘗試資料轉換。',
                    'system'
                  );
                  this.resumePlanPhase('完成調整，返回規劃步驟重新嘗試。');
                }
                attemptErrorForPrompt = new Error(violationMessage);
                lastIterationError = attemptErrorForPrompt;
              }
            };
            try {
              iterationPlan = await generateDataPreparationPlan(
                profiles,
                sampleRowsForPlan,
                this.settings,
                activeMetadata,
                attemptErrorForPrompt,
                iterationContextPayload
              );
            } catch (planError) {
              const rawResponse = planError && planError.rawResponse ? String(planError.rawResponse) : null;
              if (rawResponse) {
                this.addProgress(
                  `${iterationLabel} 無法解析模型 JSON，請求重新輸出有效格式。`,
                  'error'
                );
                attemptErrorForPrompt = new Error('Malformed JSON response from model.');
                attemptErrorForPrompt.rawResponse = rawResponse;
                lastIterationError = attemptErrorForPrompt;
                const violationCount = this.incrementViolationCounter('malformed_json');
                if (violationCount >= 2) {
                  this.enterAdjustPhase('因模型多次輸出無效 JSON，進入調整階段修正提示。');
                  this.extendPrepIterationBudget(1);
                }
                continue;
              }
              throw planError;
            }
            if (!iterationPlan) {
              this.addProgress(
                `${iterationLabel} did not return a plan. Skipping remaining preprocessing.`,
                'error'
              );
              this.failWorkflowStep({
                label: iterationLabel,
                error: 'AI 未提供可執行的 preprocessing plan。',
              });
              continueIterating = false;
              break;
            }

            const rawExplanation =
              (typeof iterationPlan.explanation === 'string' && iterationPlan.explanation.trim()) ||
              'AI suggested applying a data transformation.';
            const iterationStatus =
              typeof iterationPlan.status === 'string' ? iterationPlan.status : null;
            const statusLabel = iterationStatus ? iterationStatus.toUpperCase() : 'UNSPECIFIED';
            const summaryMessage =
              attempt > 0
                ? `${iterationLabel} retry ${attemptLabel} (${statusLabel}): ${rawExplanation}`
                : `${iterationLabel} (${statusLabel}): ${rawExplanation}`;
            const failureHint =
              attemptErrorForPrompt && attemptErrorForPrompt.message
                ? attemptErrorForPrompt.message.toLowerCase()
                : null;
            if (failureHint && failureHint.includes('summary')) {
              this.addProgress('上一輪檢查：資料仍含 Total/Subtotal 等摘要列，AI 正在嘗試移除這些摘要行。');
            } else if (failureHint && failureHint.includes('zero rows')) {
              this.addProgress('上一輪檢查：轉換結果為零筆資料，AI 正在重新定位 header/欄位以避免資料被全部濾掉。');
            }

            if (Array.isArray(iterationPlan.toolCalls) && iterationPlan.toolCalls.length) {
              const toolOutputs = await this.executeDataPrepToolCalls(
                iterationPlan.toolCalls,
                dataForAnalysis,
                activeMetadata
              );
              if (toolOutputs && toolOutputs.length) {
                toolHistory = toolHistory.concat(toolOutputs).slice(-10);
              }
              this.addProgress(
                `${iterationLabel} 使用 ${iterationPlan.toolCalls.length} 個工具後將重新規劃下一步。`,
                'system'
              );
              continue;
            }

            if (!iterationPlan.jsFunctionBody) {
              if (iterationStatus === 'continue') {
                this.addProgress(
                  `${iterationLabel} reported that more passes are required but did not supply code. Stopping preprocessing.`,
                  'error'
                );
              }
              this.addProgress(summaryMessage);
              this.completeWorkflowStep({
                label: iterationLabel,
                outcome: iterationStatus ? iterationStatus.toUpperCase() : 'DONE',
              });
              prepIterationsLog.push({
                iteration,
                status: iterationStatus || 'done',
                summary: rawExplanation,
                explanation: rawExplanation,
                code: null,
                lastError:
                  attemptErrorForPrompt && attemptErrorForPrompt.message
                    ? attemptErrorForPrompt.message
                    : null,
                rowCountBefore: dataForAnalysis.data.length,
                rowCountAfter: dataForAnalysis.data.length,
              });
              lastSuccessfulPlan = iterationPlan;
              lastIterationError = null;
              continueIterating = false;
              iterationCompleted = true;
              break;
            }

            this.addProgress(`${summaryMessage} Executing transformation...`);

            try {
              const originalCount = dataForAnalysis.data.length;
              const transformed = executeJavaScriptDataTransform(
                dataForAnalysis.data,
                iterationPlan.jsFunctionBody
              );
              if (!Array.isArray(transformed) || !transformed.length) {
                throw new Error('Transformation returned zero rows. Headers or filters may be incorrect.');
              }

              dataForAnalysis.data = transformed;
              const newCount = dataForAnalysis.data.length;
              this.completeWorkflowStep({
                label: `${iterationLabel} transformation`,
                outcome: `${originalCount} → ${newCount}`,
              });
              if (dataForAnalysis.metadata) {
                dataForAnalysis.metadata = {
                  ...dataForAnalysis.metadata,
                  cleanedRowCount: newCount,
                };
                dataForAnalysis.metadata = this.updateMetadataContext(
                  dataForAnalysis.metadata,
                  dataForAnalysis.data
                );
              } else {
                dataForAnalysis.metadata = this.updateMetadataContext(
                  { cleanedRowCount: newCount },
                  dataForAnalysis.data
                );
              }
              activeMetadata = dataForAnalysis.metadata || activeMetadata;
              if (activeMetadata) {
                headerMappingContext =
                  this.ensureHeaderMappingContext(activeMetadata, {
                    reason: 'post_transform',
                    logStep: false,
                  }) || headerMappingContext;
              }

              this.addProgress(
                `${iterationLabel} completed. Row count changed from ${originalCount} to ${newCount}.`
              );
              this.clearViolationCounter();
              this.resetAdditionalPrepIterations();
              this.resumePlanPhase('資料清理流程已調整完成，返回規劃。');

              profiles = iterationPlan.outputColumns || profileData(dataForAnalysis.data);
              prepIterationsLog.push({
                iteration,
                status: iterationStatus || 'continue',
                summary: rawExplanation,
                explanation: rawExplanation,
                code: iterationPlan.jsFunctionBody,
                lastError:
                  attemptErrorForPrompt && attemptErrorForPrompt.message
                    ? attemptErrorForPrompt.message
                    : null,
                rowCountBefore: originalCount,
                rowCountAfter: newCount,
              });
              lastSuccessfulPlan = iterationPlan;
              iterationCompleted = true;

              if (iterationStatus === 'done' || !iterationStatus) {
                continueIterating = false;
              } else if (iterationStatus === 'abort') {
                this.addProgress(
                  `${iterationLabel} requested to abort further preprocessing.`,
                  'error'
                );
                continueIterating = false;
              } else {
                this.addProgress(`${iterationLabel} completed. AI requested another pass to finish cleanup.`);
                continueIterating = iteration < maxPrepIterations;
              }

              lastIterationError = null;
              break;
            } catch (prepError) {
              const prepMessage =
                prepError instanceof Error ? prepError.message : String(prepError);
              this.addProgress(
                attempt > 0
                  ? `${iterationLabel} retry ${attemptLabel} failed: ${prepMessage}`
                  : `${iterationLabel} failed: ${prepMessage}`
              );
            if (prepMessage && prepMessage.toLowerCase().includes('summary')) {
              this.addProgress(
                'Agent 正在調整：目前資料仍含 Total/Subtotal 等摘要列，正在請求模型移除這些摘要行後再試。',
                'info'
              );
              const offendingIndex = prepMessage.indexOf('Offending rows include:');
              if (offendingIndex !== -1) {
                const offendingText = prepMessage.slice(offendingIndex + 'Offending rows include:'.length).trim();
                if (offendingText) {
                  this.addProgress(
                    `摘要列範例：${offendingText.replace(/\.$/, '')}`,
                    'info'
                  );
                }
              }
            } else if (prepMessage && prepMessage.toLowerCase().includes('empty dataset')) {
              this.addProgress(
                'Agent 警告：轉換後資料為空，AI 正在檢查過濾條件是否過於嚴格或 header 偵測是否錯誤。',
                'error'
              );
            } else if (prepMessage && prepMessage.toLowerCase().includes('zero rows')) {
              this.addProgress(
                'Agent 正在調整：轉換結果為零筆資料，可能 header 偵測錯誤，已要求模型重新定位欄位。',
                'info'
              );
            } else if (prepError instanceof Error && prepError.rawResponse) {
              this.addProgress(
                `${iterationLabel} attempt ${attemptLabel} 無法解析模型 JSON 回應，通知模型重新輸出有效格式。`,
                'error'
              );
              const violationCount = this.incrementViolationCounter('malformed_json');
              if (violationCount >= 2) {
                this.enterAdjustPhase('多次解析失敗，進入調整階段修正提示。');
                this.extendPrepIterationBudget(1);
              }
              attemptErrorForPrompt = new Error('Malformed JSON response from model.');
              attemptErrorForPrompt.rawResponse = prepError.rawResponse;
              lastIterationError = attemptErrorForPrompt;
              continue;
            }
              if (attempt === maxRetriesPerIteration - 1) {
                  this.addProgress(
                    `${iterationLabel} reached maximum retries. Stopping AI preprocessing.`,
                    'error'
                  );
                  continueIterating = false;
                  lastIterationError = prepError instanceof Error ? prepError : new Error(prepMessage);
                } else {
                  this.addProgress('Requesting AI to adjust preprocessing plan and retry...');
                  attemptErrorForPrompt =
                    prepError instanceof Error ? prepError : new Error(prepMessage);
                  lastIterationError = attemptErrorForPrompt;
                }
                this.failWorkflowStep({
                  label: `${iterationLabel} attempt ${attemptLabel}`,
                  error: prepMessage,
                });
              }
            }

          if (!continueIterating || iterationCompleted) {
            continue;
          }
        }

        prepPlan = lastSuccessfulPlan;
        this.endWorkflowPhase(prepPlan ? 'completed' : 'completed');
      } else {
        this.ensureApiCredentials({
          reason:
            'API key is missing. Skipping AI-driven preprocessing and analysis while settings open for update.',
        });
      }

      if (!dataForAnalysis.data.length) {
        throw new Error('Dataset is empty; analysis cannot continue.');
      }

      const datasetId = this.generateDatasetId(
        file.name,
        dataForAnalysis.metadata || metadata || null,
        dataForAnalysis.data
      );
      const datasetFingerprint =
        dataForAnalysis.metadata?.datasetFingerprint ?? this.computeDatasetFingerprint(dataForAnalysis.data);
      if (dataForAnalysis.metadata) {
        dataForAnalysis.metadata = {
          ...dataForAnalysis.metadata,
          datasetId,
          datasetFingerprint,
        };
      } else {
        dataForAnalysis.metadata = {
          datasetId,
          datasetFingerprint,
        };
      }

      this.setState({
        csvData: dataForAnalysis,
        columnProfiles: profiles,
        originalCsvData: parsedData.originalData
          ? { fileName: file.name, data: parsedData.originalData }
          : null,
        csvMetadata: dataForAnalysis.metadata || metadata || null,
        currentDatasetId: datasetId,
        generatedReport: null,
        dataPreparationPlan: prepPlan
          ? { ...prepPlan, iterations: prepIterationsLog }
          : prepIterationsLog.length
          ? { explanation: 'AI performed partial preprocessing steps.', iterations: prepIterationsLog, jsFunctionBody: null }
          : prepPlan,
        initialDataSample: initialSample,
        isDataPrepDebugVisible: false,
        rawDataPage: 0,
        rawDataColumnWidths: {},
      });

      if (isApiKeySet) {
        this.startWorkflowPhase('execute', '執行初始分析計畫並生成圖表。');
        await this.handleInitialAnalysis(dataForAnalysis, profiles);
        if (this.workflowActivePhase === 'execute') {
          this.endWorkflowPhase();
        }
      } else {
        this.setState({ isBusy: false });
      }
    } catch (error) {
      console.error(error);
      this.addProgress(
        `File processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      this.failWorkflowStep({
        label: '處理檔案',
        error: error instanceof Error ? error.message : String(error),
      });
      this.endWorkflowPhase('failed');
      this.setState({
        isBusy: false,
        currentView: prevCsv ? 'analysis_dashboard' : 'file_upload',
      });
    }
  }

  async handleInitialAnalysis(csvData, profiles) {
    if (!csvData || !csvData.data.length) return;
    this.setState({ isBusy: true });
    this.addProgress('AI is generating analysis plans...');
    this.appendWorkflowThought('AI 正在建立初始分析計畫。');
    try {
      const metadata = csvData?.metadata || null;
      const plans = await generateAnalysisPlans(
        profiles,
        csvData.data.slice(0, 20),
        this.settings,
        metadata
      );
      this.addProgress(`AI proposed ${plans.length} plan(s).`);
      if (plans.length) {
        this.completeWorkflowStep({
          label: '產生分析計畫',
          outcome: `${plans.length} plans`,
        });
        await this.runAnalysisPipeline(plans, csvData, false);
      } else {
        this.addProgress('AI could not produce any analysis plans.', 'error');
        this.failWorkflowStep({
          label: '產生分析計畫',
          error: 'No plans returned',
        });
      }
    } catch (error) {
      console.error(error);
      this.addProgress(
        `Analysis pipeline error: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      this.failWorkflowStep({
        label: '初始分析流程',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.setState({ isBusy: false });
      this.addProgress('Analysis complete. You can now chat with the assistant.');
    }
  }

  async runAnalysisPipeline(plans, csvData, isChatRequest, options = {}) {
    let isFirstCard = true;
    const createdCards = [];
    const metadata = csvData?.metadata || null;
    const datasetId = this.getCurrentDatasetId();
    for (const plan of plans) {
      const preparation = this.preparePlanForExecution(plan);
      const normalizedPlan = preparation.plan || plan;
      const planTitle = normalizedPlan?.title || plan?.title || 'Untitled Analysis';

      if (preparation.adjustments && preparation.adjustments.length) {
        preparation.adjustments.forEach(message => this.addProgress(message));
      }

      if (preparation.error) {
        this.addProgress(`"${planTitle}" skipped: ${preparation.error}`, 'error');
        this.failWorkflowStep({
          label: planTitle,
          error: preparation.error,
        });
        continue;
      }

      const planValidationIssue = this.validatePlanForExecution(normalizedPlan);
      if (planValidationIssue) {
        this.addProgress(`"${planTitle}" skipped: ${planValidationIssue}`, 'error');
        this.failWorkflowStep({
          label: planTitle,
          error: planValidationIssue,
        });
        continue;
      }
      try {
        this.addProgress(`Executing analysis: ${planTitle}...`);
        const aggregatedData = executePlan(csvData, normalizedPlan);
        if (!aggregatedData.length) {
          this.addProgress(`"${planTitle}" produced no results and was skipped.`, 'error');
          this.failWorkflowStep({
            label: planTitle,
            error: 'No data returned',
          });
          continue;
        }
        this.addProgress(`AI is drafting a summary for: ${planTitle}...`);
        const summary = await generateSummary(
          planTitle,
          aggregatedData,
          this.settings,
          metadata
        );
        const categoryCount = aggregatedData.length;
        const shouldDefaultTopN = normalizedPlan.chartType !== 'scatter' && categoryCount > 15;
        const defaultTopN = shouldDefaultTopN ? 8 : normalizedPlan.defaultTopN || null;
        const newCard = {
          id: `card-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          plan: normalizedPlan,
          aggregatedData,
          summary,
          displayChartType: normalizedPlan.chartType,
          isDataVisible: false,
          topN: defaultTopN,
          hideOthers: shouldDefaultTopN ? true : Boolean(normalizedPlan.defaultHideOthers),
          hiddenLabels: [],
          filter: null,
          disableAnimation: isChatRequest || !isFirstCard || (this.state.analysisCards?.length ?? 0) > 0,
          selectedIndices: [],
          isZoomed: false,
          showSelectionDetails: true,
          isExporting: false,
        };

        createdCards.push(newCard);
        if (ENABLE_MEMORY_FEATURES) {
          try {
            await this.ensureMemoryVectorReady();
            await storeMemory(datasetId, {
              kind: 'analysis_plan',
              intent: normalizedPlan?.aggregation ? 'analysis' : 'general',
              text: `${planTitle}: ${summary}`,
              summary,
              metadata: {
                plan: normalizedPlan,
                sampleRows: aggregatedData.slice(0, 10),
              },
            });
            if (this.state.isMemoryPanelOpen) {
              this.refreshMemoryDocuments();
            }
          } catch (memoryError) {
            console.warn('Failed to store analysis memory entry.', memoryError);
          }
        }
        this.setState(prev => ({
          analysisCards: [...prev.analysisCards, newCard],
        }));
        isFirstCard = false;
        this.addProgress(`Analysis card created: ${planTitle}`);
        this.completeWorkflowStep({
          label: planTitle,
          outcome: `${aggregatedData.length} rows`,
        });
      } catch (error) {
        console.error('Plan execution error:', error, {
          plan: normalizedPlan,
          cardTitle: planTitle,
          csvDataSample: Array.isArray(csvData?.data) ? csvData.data.slice(0, 5) : null,
        });
        this.addProgress(
          `Analysis "${planTitle}" failed: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        );
        this.failWorkflowStep({
          label: planTitle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!isChatRequest && createdCards.length) {
      this.ensureWorkflowPhase('verify', '整理核心摘要與洞察。');
      this.addProgress('AI is synthesizing its overall understanding...');
      const cardContext = createdCards.map(card => ({
        id: card.id,
        title: card.plan.title,
        aggregatedDataSample: card.aggregatedData.slice(0, 10),
      }));
      const coreSummary = await generateCoreAnalysisSummary(
        cardContext,
        this.state.columnProfiles,
        this.settings,
        metadata
      );
      this.completeWorkflowStep({
        label: '核心摘要',
        outcome: '已生成',
      });
      const shouldStick = this.isConversationNearBottom();
      this.setState(prev => ({
        aiCoreAnalysisSummary: coreSummary,
        chatHistory: [
          ...prev.chatHistory,
          { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' },
        ],
      }));
      if (shouldStick) {
        this.shouldAutoScrollConversation = true;
      }

      this.addProgress('AI is looking for key insights...');
      const proactiveInsight = await generateProactiveInsights(cardContext, this.settings);
      if (proactiveInsight && proactiveInsight.insight && proactiveInsight.cardId) {
        const insightShouldStick = this.isConversationNearBottom();
        const targetCard = createdCards.find(card => card.id === proactiveInsight.cardId);
        const insightMessage = {
          sender: 'ai',
          text: proactiveInsight.insight,
          timestamp: new Date(),
          type: 'ai_proactive_insight',
          cardId: proactiveInsight.cardId,
          cardTitle: targetCard?.plan?.title || null,
        };
        if (targetCard) {
          this.lastReferencedCard = {
            id: targetCard.id,
            title: targetCard.plan?.title || null,
          };
        }
        this.setState(prev => ({
          chatHistory: [...prev.chatHistory, insightMessage],
        }));
        if (insightShouldStick) {
          this.shouldAutoScrollConversation = true;
        }
        const insightLabel = targetCard?.plan?.title ? `"${targetCard.plan.title}"` : proactiveInsight.cardId;
        this.addProgress(`Proactive insight surfaced for ${insightLabel}.`);
        this.completeWorkflowStep({
          label: '主動洞察',
          outcome: targetCard?.plan?.title || proactiveInsight.cardId,
        });
      }

      const finalSummary = await generateFinalSummary(createdCards, this.settings, metadata);
      const generatedReport = this.buildGeneratedReport(createdCards, finalSummary);
      this.setState({ finalSummary, generatedReport });
      await this.saveCompletedAnalysisToHistory();
      this.addProgress('Overall summary created.');
      this.completeWorkflowStep({
        label: '總結報告',
        outcome: '完成',
      });
      if (ENABLE_MEMORY_FEATURES) {
        try {
          await this.ensureMemoryVectorReady();
          await storeMemory(datasetId, {
            kind: 'summary',
            intent: 'narrative',
            text: finalSummary,
            summary: finalSummary,
            metadata: {
              cards: createdCards.map(card => ({
                title: card.plan.title,
                chartType: card.plan.chartType,
              })),
            },
          });
          if (this.state.isMemoryPanelOpen) {
            this.refreshMemoryDocuments();
          }
        } catch (memoryError) {
          console.warn('Failed to store final summary memory entry.', memoryError);
        }
      }
    }

    if (ENABLE_PIPELINE_REPAIR) {
      const auditReport = await this.runPipelineAudit({ log: !isChatRequest });
      if (!options.skipAutoRepair) {
        await this.autoRepairIfNeeded(auditReport);
      }
    }

    return createdCards;
  }

  handleWorkflowPlanUpdate(planItems) {
    const mapped = Array.isArray(planItems)
      ? planItems.map(item => ({
          step: item.step,
          status: item.status,
        }))
      : [];
    const previousPlan = Array.isArray(this.state.workflowPlan) ? this.state.workflowPlan : [];
    const changeMessages = [];

    mapped.forEach(item => {
      const prev = previousPlan.find(entry => entry.step === item.step);
      const label = this.getPlanStepLabel(item.step);
      const statusLabel = this.getPlanStatusLabel(item.status);

      if (!prev) {
        changeMessages.push(`Plan 更新：加入 ${label}（狀態：${statusLabel}）`);
      } else if (prev.status !== item.status) {
        const prevStatusLabel = this.getPlanStatusLabel(prev.status);
        changeMessages.push(`Plan 更新：${label} 從 ${prevStatusLabel} → ${statusLabel}`);
      }
    });

    let timeline = null;
    if (this.orchestrator && typeof this.orchestrator.getTimeline === 'function') {
      timeline = this.orchestrator.getTimeline();
    }
    this.setState({ workflowPlan: mapped, workflowTimeline: timeline });

    if (changeMessages.length) {
      changeMessages.forEach(message => this.addProgress(message, 'system'));
    }
  }

  getPlanStepLabel(step) {
    const STEP_LABELS = {
      diagnose: 'Diagnose 診斷',
      plan: 'Plan 規劃',
      execute: 'Execute 執行',
      adjust: 'Adjust 調整',
      verify: 'Verify 驗證',
    };
    if (typeof step === 'string' && STEP_LABELS[step]) {
      return STEP_LABELS[step];
    }
    if (typeof step === 'string' && step.trim()) {
      return step.trim();
    }
    return '未知階段';
  }

  getPlanStatusLabel(status) {
    const STATUS_LABELS = {
      pending: '待開始',
      in_progress: '進行中',
      completed: '已完成',
      failed: '失敗',
    };
    if (typeof status === 'string' && STATUS_LABELS[status]) {
      return STATUS_LABELS[status];
    }
    return status ? status : '未知';
  }

  incrementViolationCounter(type) {
    if (!type || !this.orchestrator || typeof this.orchestrator.getContextValue !== 'function') {
      return 1;
    }
    if (!this.ensureWorkflowSession()) {
      return 1;
    }
    const counters = this.orchestrator.getContextValue('violationCounts') || {};
    const nextValue = (counters[type] || 0) + 1;
    counters[type] = nextValue;
    if (typeof this.orchestrator.setContextValue === 'function') {
      this.orchestrator.setContextValue('violationCounts', counters);
    }
    return nextValue;
  }

  clearViolationCounter(type = null) {
    if (!this.orchestrator || typeof this.orchestrator.getContextValue !== 'function') {
      return;
    }
    if (typeof this.orchestrator.setContextValue !== 'function') {
      return;
    }
    if (!this.ensureWorkflowSession()) {
      return;
    }
    const counters = this.orchestrator.getContextValue('violationCounts') || {};
    if (!type) {
      this.orchestrator.setContextValue('violationCounts', {});
      return;
    }
    if (counters[type]) {
      delete counters[type];
      this.orchestrator.setContextValue('violationCounts', counters);
    }
  }

  enterAdjustPhase(reason) {
    if (!this.orchestrator) {
      return;
    }
    if (!this.ensureWorkflowSession(reason)) {
      return;
    }
    const adjustActive =
      typeof this.orchestrator.getAutoTaskFlag === 'function'
        ? this.orchestrator.getAutoTaskFlag('adjust_phase_active')
        : false;
    if (adjustActive) {
      if (reason) {
        this.appendWorkflowThought(reason);
      }
      return;
    }
    this.startWorkflowPhase('adjust', reason || '進入調整階段，修正策略。');
    if (typeof this.orchestrator.setAutoTaskFlag === 'function') {
      this.orchestrator.setAutoTaskFlag('adjust_phase_active', true);
    }
  }

  resumePlanPhase(reason) {
    if (!this.orchestrator) {
      return;
    }
    if (!this.ensureWorkflowSession(reason)) {
      return;
    }
    const adjustActive =
      typeof this.orchestrator.getAutoTaskFlag === 'function'
        ? this.orchestrator.getAutoTaskFlag('adjust_phase_active')
        : false;
    if (!adjustActive) {
      return;
    }
    this.startWorkflowPhase('plan', reason || '調整完成，返回規劃階段。');
    if (typeof this.orchestrator.setAutoTaskFlag === 'function') {
      this.orchestrator.setAutoTaskFlag('adjust_phase_active', false);
    }
  }

  getAdditionalPrepIterations() {
    if (!this.orchestrator || typeof this.orchestrator.getContextValue !== 'function') {
      return 0;
    }
    if (!this.ensureWorkflowSession()) {
      return 0;
    }
    const value = this.orchestrator.getContextValue('additionalPrepIterations');
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  extendPrepIterationBudget(increment = 1) {
    if (!this.orchestrator || typeof this.orchestrator.getContextValue !== 'function') {
      return 0;
    }
    if (!this.ensureWorkflowSession()) {
      return 0;
    }
    const current = this.getAdditionalPrepIterations();
    const next = Math.min(current + increment, 3);
    if (typeof this.orchestrator.setContextValue === 'function') {
      this.orchestrator.setContextValue('additionalPrepIterations', next);
    }
    return next;
  }

  resetAdditionalPrepIterations() {
    if (!this.orchestrator || typeof this.orchestrator.setContextValue !== 'function') {
      return;
    }
    if (!this.ensureWorkflowSession()) {
      return;
    }
    this.orchestrator.setContextValue('additionalPrepIterations', 0);
  }

  async executeDataPrepToolCalls(toolCalls, dataForAnalysis, metadata) {
    const outputs = [];
    const parseArgs = rawArgs => {
      if (!rawArgs) return {};
      if (typeof rawArgs === 'string') {
        try {
          return JSON.parse(rawArgs);
        } catch (error) {
          console.warn('Failed to parse tool args JSON:', rawArgs, error);
          this.addProgress('工具參數 JSON 解析失敗，已忽略該工具 call。', 'error');
          return null;
        }
      }
      if (typeof rawArgs === 'object') {
        return rawArgs;
      }
      return {};
    };
    for (const call of toolCalls) {
      if (!call || typeof call !== 'object') {
        continue;
      }
      const tool = call.tool || call.name;
      const argsObject = parseArgs(call.args);
      if (argsObject === null) {
        outputs.push({ tool, error: 'invalid_args' });
        continue;
      }
      switch (tool) {
        case 'detect_headers': {
          const result = detectHeadersHelper({
            metadata,
            sampleRows: argsObject.sampleRows || dataForAnalysis.data?.slice(0, 5) || [],
            strategies: argsObject.strategies || [],
          });
          outputs.push({ tool, result });
          this.addProgress(
            `工具：detect_headers → 偵測欄位 ${result.headers.join(', ') || '(unknown)'}`,
            'info'
          );
          break;
        }
        case 'remove_summary_rows': {
          const currentRows = Array.isArray(dataForAnalysis.data) ? dataForAnalysis.data : [];
          const result = removeSummaryRowsHelper({
            data: currentRows,
            keywords: argsObject.keywords,
          });
          dataForAnalysis.data = result.cleanedData;
          if (dataForAnalysis.metadata) {
            dataForAnalysis.metadata = {
              ...dataForAnalysis.metadata,
              cleanedRowCount: dataForAnalysis.data.length,
            };
            dataForAnalysis.metadata = this.updateMetadataContext(
              dataForAnalysis.metadata,
              dataForAnalysis.data
            );
          }
          outputs.push({
            tool,
            removedRows: result.removedRows.length,
            remaining: dataForAnalysis.data.length,
          });
          this.addProgress(
            `工具：remove_summary_rows → 移除 ${result.removedRows.length} 筆摘要列`,
            'info'
          );
          break;
        }
        case 'detect_identifier_columns': {
          const currentRows = Array.isArray(dataForAnalysis.data) ? dataForAnalysis.data : [];
          const result = detectIdentifierColumnsHelper({
            data: currentRows,
            metadata,
          });
          outputs.push({ tool, identifiers: result.identifiers });
          this.addProgress(
            `工具：detect_identifier_columns → 候選欄位 ${result.identifiers.join(', ') || '無'}`,
            'info'
          );
          break;
        }
        default: {
          outputs.push({ tool, error: 'Unsupported tool' });
          this.addProgress(`工具 ${tool || '(unknown)'} 不受支援，已略過。`, 'error');
          break;
        }
      }
    }
    return outputs;
  }

  buildGeneratedReport(cards = [], overviewText = null) {
    if (!Array.isArray(cards) || !cards.length) {
      return overviewText ? { overview: overviewText, keyInsights: [], visuals: [], recommendations: [] } : null;
    }
    const keyInsights = cards.slice(0, 3).map(card => ({
      title: card.plan?.title || 'Insight',
      detail:
        (typeof card.summary === 'string' && card.summary.trim()
          ? card.summary.split('---')[0]
          : card.plan?.description || 'See chart for details.'),
    }));
    const visuals = cards.map(card => ({
      title: card.plan?.title || 'Visual',
      description: card.plan?.description || '',
    }));
    const recommendations =
      keyInsights.length > 0
        ? keyInsights.map(insight => `深入檢視 ${insight.title}，確認其對營運的具體影響。`)
        : overviewText
        ? [overviewText.slice(0, 200)]
        : [];
    return {
      overview: overviewText,
      keyInsights,
      visuals,
      recommendations,
    };
  }

  async saveCompletedAnalysisToHistory() {
    if (this.hasSavedHistoryEntry || !this.state.csvData) {
      return;
    }
    try {
      const snapshot = this.captureSerializableAppState();
      const entry = {
        id: `report-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        filename: this.state.csvData.fileName || 'Analysis Report',
        createdAt: new Date(),
        updatedAt: new Date(),
        appState: snapshot,
      };
      await saveReport(entry);
      this.hasSavedHistoryEntry = true;
      const reports = await getReportsList();
      this.setState({ reportsList: reports });
    } catch (error) {
      console.error('Failed to archive completed report:', error);
    }
  }

  handleWorkflowProgress(entry) {
    if (!entry || typeof entry !== 'object' || !entry.message) {
      return;
    }
    const level = entry.level === 'error' ? 'error' : entry.level === 'success' ? 'success' : 'system';
    this.addProgress(entry.message, level);
    this.syncWorkflowTimeline();
  }

  handleWorkflowChat(payload) {
    if (!payload || typeof payload !== 'object' || !payload.text) {
      return;
    }
    const shouldStick = this.isConversationNearBottom();
    this.setState(prev => ({
      chatHistory: [
        ...prev.chatHistory,
        {
          sender: 'ai',
          text: payload.text,
          timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
          type: payload.type || 'ai_plan_thought',
          workflowPhase: payload.phase || null,
        },
      ],
    }));
    if (shouldStick) {
      this.shouldAutoScrollConversation = true;
    }
    this.syncWorkflowTimeline();
  }

  syncWorkflowTimeline() {
    if (!this.orchestrator || typeof this.orchestrator.getTimeline !== 'function') {
      return;
    }
    const timeline = this.orchestrator.getTimeline();
    if (timeline) {
      this.setState({ workflowTimeline: timeline });
    }
  }

  deriveWorkflowGoal(goalOverride = null) {
    if (typeof goalOverride === 'string' && goalOverride.trim()) {
      return goalOverride.trim();
    }
    if (this.state?.csvData?.fileName) {
      return `分析資料集 ${this.state.csvData.fileName}`;
    }
    if (Array.isArray(this.state?.csvData?.data) && this.state.csvData.data.length) {
      return '分析資料集 (未命名)';
    }
    return 'CSV 資料分析工作流程';
  }

  ensureWorkflowSession(goalOverride = null, constraintsOverride = null) {
    if (!this.orchestrator) {
      return false;
    }
    if (this.workflowSessionId) {
      return true;
    }
    const goal = this.deriveWorkflowGoal(goalOverride);
    const constraints =
      Array.isArray(constraintsOverride) && constraintsOverride.length
        ? constraintsOverride
        : DEFAULT_WORKFLOW_CONSTRAINTS;
    this.startWorkflowSession(goal, constraints);
    return Boolean(this.workflowSessionId);
  }

  startWorkflowSession(goal, constraints = DEFAULT_WORKFLOW_CONSTRAINTS) {
    if (!this.orchestrator) return;
    try {
      const appliedConstraints =
        Array.isArray(constraints) && constraints.length ? constraints : DEFAULT_WORKFLOW_CONSTRAINTS;
      const resolvedGoal = this.deriveWorkflowGoal(goal);
      this.workflowSessionId = this.orchestrator.startSession({
        goal: resolvedGoal,
        constraints: appliedConstraints,
      });
      this.workflowActivePhase = null;
      this.syncWorkflowTimeline();
    } catch (error) {
      console.warn('Failed to start workflow session:', error);
    }
  }

  startWorkflowPhase(phaseId, thought = null) {
    if (!this.orchestrator) return;
    if (!this.ensureWorkflowSession()) {
      return;
    }
    try {
      const alreadyActive = this.workflowActivePhase === phaseId;
      if (!alreadyActive) {
        if (this.workflowActivePhase) {
          this.endWorkflowPhase('completed');
        }
        this.orchestrator.startPhase(phaseId);
        this.workflowActivePhase = phaseId;
        this.syncWorkflowTimeline();
      }
      if (thought) {
        this.appendWorkflowThought(thought);
      }
    } catch (error) {
      console.warn(`Failed to start workflow phase ${phaseId}:`, error);
    }
  }

  ensureWorkflowPhase(phaseId, thought = null) {
    if (this.workflowActivePhase === phaseId) {
      if (thought) {
        this.appendWorkflowThought(thought);
      }
      return;
    }
    this.startWorkflowPhase(phaseId, thought);
  }

  endWorkflowPhase(status = 'completed') {
    if (!this.orchestrator || !this.workflowActivePhase) {
      return;
    }
    try {
      this.orchestrator.endPhase(status);
      this.workflowActivePhase = null;
      this.syncWorkflowTimeline();
    } catch (error) {
      console.warn('Failed to end workflow phase:', error);
    }
  }

  appendWorkflowThought(message) {
    if (!this.orchestrator) return;
    if (!this.ensureWorkflowSession()) {
      return;
    }
    try {
      this.orchestrator.appendThought(message);
      this.syncWorkflowTimeline();
    } catch (error) {
      console.warn('Failed to append workflow thought:', error);
    }
  }

  completeWorkflowStep(payload) {
    if (!this.orchestrator) return;
    if (!this.ensureWorkflowSession()) {
      return;
    }
    try {
      this.orchestrator.completeStep(payload);
      this.syncWorkflowTimeline();
    } catch (error) {
      console.warn('Failed to complete workflow step:', error);
    }
  }

  failWorkflowStep(payload) {
    if (!this.orchestrator) return;
    const hadSession = Boolean(this.workflowSessionId);
    if (!this.ensureWorkflowSession('AI 工作流程')) {
      return;
    }
    if (!hadSession) {
      this.startWorkflowPhase('diagnose', '啟動工作流程以追蹤錯誤。');
    }
    try {
      this.orchestrator.failStep(payload);
      this.syncWorkflowTimeline();
    } catch (error) {
      console.warn('Failed to record workflow failure:', error);
    }
  }

  ensureHeaderMappingContext(metadata, options = {}) {
    if (
      !metadata ||
      !Array.isArray(metadata.genericHeaders) ||
      metadata.genericHeaders.length === 0
    ) {
      return null;
    }
    const reason = typeof options.reason === 'string' ? options.reason : 'auto';
    const fingerprintSource =
      metadata.datasetFingerprint ||
      metadata.datasetId ||
      JSON.stringify({
        headers: metadata.headerRow || [],
        generic: metadata.genericHeaders,
        detectedHeaderIndex: metadata.detectedHeaderIndex ?? null,
      });
    if (!this.orchestrator || typeof this.orchestrator.getContextValue !== 'function') {
      return null;
    }
    if (!this.ensureWorkflowSession()) {
      return null;
    }
    const existing = this.orchestrator.getContextValue('headerMapping');
    if (existing && existing.fingerprint === fingerprintSource && !options.forceRefresh) {
      if (options.logStep) {
        this.logHeaderMappingStep(existing, options);
      }
      return existing;
    }

    const details = createHeaderMapping(metadata);
    const payload = {
      ...details,
      fingerprint: fingerprintSource,
      datasetId: metadata.datasetId ?? null,
      createdAt: new Date().toISOString(),
      reason,
      violationMessage: typeof options.violationMessage === 'string' ? options.violationMessage : null,
    };

    if (typeof this.orchestrator.setContextValue === 'function') {
      this.orchestrator.setContextValue('headerMapping', payload);
    }
    if (typeof this.orchestrator.setAutoTaskFlag === 'function') {
      this.orchestrator.setAutoTaskFlag('header_mapping_logged', false);
    }

    if (options.logStep) {
      this.logHeaderMappingStep(payload, options);
    }

    return payload;
  }

  logHeaderMappingStep(context, options = {}) {
    if (!context || !this.orchestrator) {
      return;
    }
    if (!this.ensureWorkflowSession()) {
      return;
    }

    const alreadyLogged =
      typeof this.orchestrator.getAutoTaskFlag === 'function'
        ? this.orchestrator.getAutoTaskFlag('header_mapping_logged')
        : false;
    if (alreadyLogged) {
      return;
    }

    const iterationLabel =
      typeof options.iterationLabel === 'string' && options.iterationLabel.trim()
        ? options.iterationLabel.trim()
        : null;
    const attemptLabel =
      typeof options.attemptLabel === 'number' || typeof options.attemptLabel === 'string'
        ? ` attempt ${options.attemptLabel}`
        : '';
    const prefix = iterationLabel ? `${iterationLabel}${attemptLabel}` : 'Auto detect header mapping';
    const mappedSummary = context.total
      ? `${context.detected}/${context.total} mapped${context.hasUnmapped ? ' (fallback for remaining columns)' : ''}`
      : 'Mapping ready';

    this.addProgress(`${prefix}：已建立 header mapping (${mappedSummary})，將在下一輪重試使用動態欄位。`, 'info');
    if (typeof options.violationMessage === 'string' && options.violationMessage.trim()) {
      this.addProgress(`上一輪錯誤：${options.violationMessage.trim()}`, 'error');
    }
    this.appendWorkflowThought('已建立 header mapping，接下來會以動態欄位名稱重新撰寫轉換程式。');
    if (this.workflowActivePhase) {
      this.completeWorkflowStep({
        label: 'Detect header mapping',
        outcome: mappedSummary,
      });
    }
    if (typeof this.orchestrator.setAutoTaskFlag === 'function') {
      this.orchestrator.setAutoTaskFlag('header_mapping_logged', true);
    }
  }

  sanitiseActionForError(action) {
    if (!action || typeof action !== 'object') {
      return null;
    }
    const cloned = JSON.parse(JSON.stringify(action));
    const truncateString = value => {
      if (typeof value !== 'string') return value;
      return value.length > 160 ? `${value.slice(0, 157)}...` : value;
    };
    const sanitise = obj => {
      if (!obj || typeof obj !== 'object') return obj;
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
          sanitise(value);
        } else if (typeof value === 'string') {
          obj[key] = truncateString(value);
        }
      });
      return obj;
    };
    return sanitise(cloned);
  }

  finalizeWorkflow(summary = null) {
    if (!this.orchestrator || !this.workflowSessionId) return;
    try {
      const timeline = this.orchestrator.endSession({ summary });
      this.workflowActivePhase = null;
      this.workflowSessionId = null;
      if (timeline) {
        this.setState({ workflowTimeline: timeline });
      }
    } catch (error) {
      console.warn('Failed to finalise workflow session:', error);
    }
  }

  async handleChatSubmit(message) {
    if (!message.trim()) return;
    if (!this.state.csvData) {
      this.addProgress('Please upload a CSV file before chatting with the assistant.', 'error');
      return;
    }
    if (!this.hasConfiguredApiKey()) {
      this.ensureApiCredentials({
        reason: 'API key is missing. Opening settings so you can add it before chatting.',
      });
      return;
    }

    // Disable chat UI while agent is working
    this.setState({ isThinking: true });

    const userMessage = {
      sender: 'user',
      text: message,
      timestamp: new Date(),
      type: 'user_message',
    };

    const shouldStick = this.isConversationNearBottom();
    this.setState(prev => ({
      chatHistory: [...prev.chatHistory, userMessage],
    }));
    if (shouldStick) {
      this.shouldAutoScrollConversation = true;
    }

    try {
      this.addProgress('AI is composing a reply...');
      const userIntent = detectIntent(message, this.state.columnProfiles);
      const datasetId = this.getCurrentDatasetId();
      if (ENABLE_MEMORY_FEATURES) {
        try {
          await this.ensureMemoryVectorReady();
          await storeMemory(datasetId, {
            kind: 'user_prompt',
            intent: userIntent,
            text: message,
            summary: message.slice(0, 220),
          });
          if (this.state.isMemoryPanelOpen) {
            this.refreshMemoryDocuments();
          }
        } catch (memoryError) {
          console.warn('Failed to store user prompt memory entry.', memoryError);
        }
      }
      const skillCatalog = getSkillCatalog(userIntent);
      const cardContext = this.state.analysisCards.map(card => ({
        id: card.id,
        title: card.plan.title,
        aggregatedDataSample: card.aggregatedData.slice(0, 10),
      }));
      const rawDataSample = this.state.csvData.data.slice(0, 20);
      const metadata = this.state.csvMetadata || this.state.csvData?.metadata || null;
      let memoryContext = [];
      if (ENABLE_MEMORY_FEATURES) {
        await this.ensureMemoryVectorReady();
        memoryContext = await retrieveRelevantMemories(datasetId, message, 6);
      }
      const response = await generateChatResponse(
        this.state.columnProfiles,
        this.state.chatHistory,
        message,
        cardContext,
        this.settings,
        this.state.aiCoreAnalysisSummary,
        this.state.currentView,
        rawDataSample,
        metadata,
        userIntent,
        skillCatalog,
        memoryContext,
        this.state.dataPreparationPlan
      );

      await this.applyChatActions(response.actions || []);
    } catch (error) {
      console.error(error);
      this.addProgress(
        `AI response failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      // Re-enable chat UI after agent completes work
      this.setState({ isThinking: false });
    }
  }

  async handleDomAction(domAction) {
    if (!domAction || typeof domAction !== 'object') {
      return { success: false, error: 'Missing DOM action payload.' };
    }
    const rawToolName =
      (typeof domAction.toolName === 'string' && domAction.toolName) ||
      (typeof domAction.action === 'string' && domAction.action) ||
      null;
    const toolName = this.normaliseDomToolName(rawToolName);
    if (!toolName || !DOM_ACTION_TOOL_NAMES.has(toolName)) {
      return { success: false, error: `Unknown DOM action: ${rawToolName || 'unknown'}.` };
    }
    domAction.toolName = toolName;

    const resolveCardContext = payload => {
      const args = payload && typeof payload.args === 'object' ? payload.args : {};
      const cardIdInput =
        (Array.isArray(payload.cardId) ? payload.cardId[0] : payload.cardId) ??
        payload.card_id ??
        args.cardId ??
        args.card_id ??
        null;
      const fallbackTitle =
        payload.cardTitle ??
        payload.card_title ??
        payload.planTitle ??
        args.cardTitle ??
        args.card_title ??
        args.planTitle ??
        payload.cardLabel ??
        payload.label ??
        payload.title ??
        payload.name ??
        payload.card_name ??
        null;
      const resolved = this.resolveCardReference(cardIdInput, fallbackTitle);
      if (!resolved.card) {
        const last = this.lastReferencedCard;
        if (last?.id || last?.title) {
          const fallbackCard = last.id ? this.getCardByIdOrAlias(last.id) : null;
          if (fallbackCard) {
            return {
              card: fallbackCard,
              cardId: fallbackCard.id,
              fallbackTitle: fallbackCard.plan?.title || last.title || resolved.fallbackTitle || null,
            };
          }
          if (!resolved.cardId && last.title) {
            const titleFallback = this.resolveCardReference(null, last.title);
            if (titleFallback.card) {
              return titleFallback;
            }
          }
        }
      }
      return resolved;
    };

    const describeCardTarget = (card, fallbackTitle, fallbackId) => {
      if (card?.plan?.title) {
        return `"${card.plan.title}"`;
      }
      if (typeof fallbackTitle === 'string' && fallbackTitle.trim()) {
        return `"${fallbackTitle.trim()}"`;
      }
      if (fallbackId) {
        return fallbackId;
      }
      return 'card';
    };

    switch (toolName) {
      case 'highlightCard': {
        const { scrollIntoView } = domAction;
        const autoClearDelay =
          typeof domAction.autoClearDelay === 'number' ? domAction.autoClearDelay : undefined;
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.highlightCard(cardId, {
          scrollIntoView: scrollIntoView !== false,
          autoClearDelay,
        });
        return success
          ? { success: true, message: `Highlighted ${describeCardTarget(card)}.` }
          : {
              success: false,
              error: `Card ${describeCardTarget(card, fallbackTitle, domAction.cardId)} not found.`,
            };
      }
      case 'clearHighlight': {
        this.clearHighlightState();
        return { success: true, message: 'Cleared highlighted card.' };
      }
      case 'changeCardChartType': {
        const chartType =
          typeof domAction.chartType === 'string'
            ? domAction.chartType
            : typeof domAction.newType === 'string'
            ? domAction.newType
            : null;
        if (!chartType) {
          return { success: false, error: 'Card ID and chart type are required.' };
        }
        const allowed = new Set(['bar', 'line', 'pie', 'doughnut', 'scatter']);
        if (!allowed.has(chartType)) {
          return { success: false, error: `Unsupported chart type: ${chartType}.` };
        }
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        this.handleChartTypeChange(cardId, chartType);
        return {
          success: true,
          message: `Switched ${describeCardTarget(card)} to ${chartType} chart.`,
        };
      }
      case 'toggleCardData':
      case 'showCardData': {
        const { visible } = domAction;
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.setCardDataVisibility(cardId, visible);
        return success
          ? {
              success: true,
              message: `${describeCardTarget(card)} data ${visible === false ? 'hidden' : 'shown'}.`,
            }
          : {
              success: false,
              error: `Unable to toggle data table for ${describeCardTarget(
                card,
                fallbackTitle,
                domAction.cardId
              )}.`,
            };
      }
      case 'setCardTopN': {
        const { topN, hideOthers } = domAction;
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.setCardTopN(cardId, topN, hideOthers);
        return success
          ? { success: true, message: `Updated Top-N setting for ${describeCardTarget(card)}.` }
          : {
              success: false,
              error: `Unable to update Top-N for ${describeCardTarget(
                card,
                fallbackTitle,
                domAction.cardId
              )}.`,
            };
      }
      case 'setCardHideOthers': {
        const { hideOthers } = domAction;
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.setCardHideOthers(cardId, hideOthers);
        return success
          ? {
              success: true,
              message: `Hide "Others" is now ${hideOthers ? 'enabled' : 'disabled'} for ${describeCardTarget(
                card
              )}.`,
            }
          : {
              success: false,
              error: `Unable to toggle hide others for ${describeCardTarget(
                card,
                fallbackTitle,
                domAction.cardId
              )}.`,
            };
      }
      case 'filterCard': {
        const { column, values } = domAction;
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const columnName =
          typeof column === 'string' && column.trim()
            ? column.trim()
            : card.plan?.groupByColumn;
        if (!columnName) {
          return { success: false, error: 'Filter requires a target column.' };
        }
        const filterResult = this.setCardFilter(cardId, {
          column: columnName,
          values: Array.isArray(values) ? values : [],
        });
        if (!filterResult.success) {
          return { success: false, error: filterResult.error || 'Unable to apply filter.' };
        }
        if (filterResult.cleared) {
          return {
            success: true,
            message: `Cleared filter for "${filterResult.cardTitle}".`,
          };
        }
        const appliedValues = filterResult.filter?.values || [];
        const previewValues = appliedValues.slice(0, 3).join(', ');
        const remaining = appliedValues.length > 3 ? ` (+${appliedValues.length - 3} more)` : '';
        return {
          success: true,
          message: `Applied filter for "${filterResult.cardTitle}" • ${columnName}: ${previewValues}${remaining}`,
        };
      }
      case 'clearCardSelection': {
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.clearCardSelection(cardId);
        return success
          ? { success: true, message: `Cleared selection for ${describeCardTarget(card)}.` }
          : {
              success: false,
              error: `Unable to clear selection for ${describeCardTarget(
                card,
                fallbackTitle,
                domAction.cardId
              )}.`,
            };
      }
      case 'resetCardZoom': {
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        const success = this.resetCardZoom(cardId);
        return success
          ? { success: true, message: `Reset zoom for ${describeCardTarget(card)}.` }
          : {
              success: false,
              error: `Unable to reset zoom for ${describeCardTarget(
                card,
                fallbackTitle,
                domAction.cardId
              )}.`,
            };
      }
      case 'setRawDataVisibility': {
        const resolvedVisibility =
          typeof domAction.visible === 'boolean'
            ? domAction.visible
            : typeof domAction.open === 'boolean'
            ? domAction.open
            : typeof domAction.expanded === 'boolean'
            ? domAction.expanded
            : typeof domAction.show === 'boolean'
            ? domAction.show
            : true;
        this.setRawDataVisibility(resolvedVisibility);
        return {
          success: true,
          message: `Raw data explorer ${resolvedVisibility ? 'expanded' : 'collapsed'}.`,
        };
      }
      case 'setRawDataFilter': {
        const usedInferredQuery = domAction.__inferredQuery === true;
        if (Object.prototype.hasOwnProperty.call(domAction, '__inferredQuery')) {
          delete domAction.__inferredQuery;
        }
        const candidateKeys = [
          'query',
          'value',
          'term',
          'text',
          'filter',
          'filterValue',
          'filter_value',
          'filterQuery',
          'filter_query',
          'filterTerm',
          'filter_term',
          'keyword',
          'search',
          'searchTerm',
          'search_term',
          'searchQuery',
          'search_query',
          'queryText',
          'textQuery',
          'text_query',
          'query_string',
        ];
        const valueKeys = ['values', 'value', 'targets', 'terms', 'matchValues', 'match_values', 'options'];
        const columnKeys = ['column', 'columnName', 'field'];
        let columnHintRaw = null;
        const containers = [];
        const seenContainers = new Set();
        const registerContainer = candidate => {
          if (!candidate || typeof candidate !== 'object') {
            return;
          }
          if (seenContainers.has(candidate)) {
            return;
          }
          seenContainers.add(candidate);
          if (Array.isArray(candidate)) {
            candidate.forEach(item => registerContainer(item));
            return;
          }
          containers.push(candidate);
          const nestedKeys = ['args', 'toolInput', 'tool_input', 'payload', 'input', 'data', 'options', 'config'];
          nestedKeys.forEach(key => {
            if (candidate[key] && typeof candidate[key] === 'object') {
              registerContainer(candidate[key]);
            }
          });
        };
        registerContainer(domAction);

        const pickFirstStringFromContainers = keys => {
          for (const container of containers) {
            const value = pickFirstString(container, keys);
            if (value) {
              return value;
            }
          }
          return null;
        };

        const pickValueListItem = keys => {
          for (const container of containers) {
            if (!container || typeof container !== 'object') continue;
            for (const key of keys) {
              if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
              const list = parseValueList(container[key]);
              if (list.length) {
                const first = String(list[0]).trim();
                if (first) return first;
              }
            }
          }
          return null;
        };

        let resolvedQuery = pickFirstStringFromContainers(candidateKeys);
        if (!resolvedQuery) {
          resolvedQuery = pickValueListItem(valueKeys);
        }
        const wantsReset =
          domAction.reset === true ||
          domAction.clear === true ||
          domAction.clearFilter === true ||
          domAction.resetFilter === true;
        if (!resolvedQuery) {
          const nestedFilter =
            domAction.filter ||
            (domAction.args && domAction.args.filter) ||
            (Array.isArray(domAction.filters) ? domAction.filters[0] : null);
          if (nestedFilter && typeof nestedFilter === 'object') {
            const nestedValue =
              nestedFilter.query ||
              nestedFilter.value ||
              pickFirstString(nestedFilter, ['term']) ||
              (parseValueList(nestedFilter.values).find(Boolean) || null);
            if (typeof nestedValue === 'string' && nestedValue.trim()) {
              resolvedQuery = nestedValue.trim();
            }
            if (!columnHintRaw && typeof nestedFilter.column === 'string') {
              columnHintRaw = nestedFilter.column;
            }
          }
        }
        if (!resolvedQuery) {
          if (wantsReset) {
            this.handleRawDataReset();
            return { success: true, message: 'Cleared raw data filters.' };
          }
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('setRawDataFilter missing query payload:', {
              domAction,
              expectedKeys: candidateKeys,
            });
          }
          return {
            success: false,
            error: 'Raw data filter query is missing. Include a `query` or `value` when calling setRawDataFilter.',
          };
        }
        const wholeWord =
          typeof domAction.wholeWord === 'boolean'
            ? domAction.wholeWord
            : typeof domAction.matchWholeWord === 'boolean'
            ? domAction.matchWholeWord
            : undefined;
        this.setRawDataFilterValue(resolvedQuery, wholeWord);
        const columnHintRawFinal = columnHintRaw || (pickFirstStringFromContainers(columnKeys) || null);
        const columnHint =
          typeof columnHintRawFinal === 'string' && columnHintRawFinal.trim()
            ? columnHintRawFinal.trim()
            : null;
        const suffix = columnHint ? ` in ${columnHint}` : '';
        const displayQuery =
          resolvedQuery.length > 80 ? `${resolvedQuery.slice(0, 77)}...` : resolvedQuery;
        const baseMessage = `Filtered raw data for "${displayQuery}"${suffix}.`;
        return {
          success: true,
          message: usedInferredQuery ? `Auto-filled query. ${baseMessage}` : baseMessage,
        };
      }
      case 'setRawDataWholeWord': {
        const { wholeWord } = domAction;
        const success = this.setRawDataWholeWordValue(wholeWord);
        return success
          ? { success: true, message: `Whole word match ${wholeWord ? 'enabled' : 'disabled'}.` }
          : { success: false, error: 'Invalid whole word flag.' };
      }
      case 'setRawDataSort': {
        const { column, direction } = domAction;
        this.setRawDataSortState(column, direction);
        return { success: true, message: column ? `Sorted raw data by ${column}.` : 'Cleared raw data sorting.' };
      }
      case 'focusRawDataPanel': {
        const focusSearch = domAction.focusSearch === true;
        const highlight = domAction.highlight !== false;
        const success = this.focusRawDataPanel({ focusSearch, highlight });
        return success
          ? { success: true, message: 'Focused raw data explorer.' }
          : { success: false, error: 'Raw data explorer is not available yet.' };
      }
      case 'removeRawDataRows': {
        return this.removeRawDataRows(domAction);
      }
      case 'removeCard':
      case 'removeAnalysisCard':
      case 'deleteCard':
      case 'deleteAnalysisCard': {
        const cardIds = [
          ...(Array.isArray(domAction.cardIds) ? domAction.cardIds : []),
          ...(Array.isArray(domAction.cardId) ? domAction.cardId : []),
        ]
          .concat(
            typeof domAction.cardId === 'string' ? [domAction.cardId] : [],
            typeof domAction.id === 'string' ? [domAction.id] : []
          )
          .filter(id => typeof id === 'string' && id.trim().length);

        if (cardIds.length) {
          let removedCount = 0;
          cardIds.forEach(rawId => {
            const id = rawId.trim();
            const targetCard = this.getCardByIdOrAlias(id);
            if (targetCard) {
              this.removeCardById(targetCard.id);
              removedCount += 1;
            }
          });
          if (removedCount) {
            return {
              success: true,
              message: `Removed ${removedCount} card${removedCount > 1 ? 's' : ''}.`,
            };
          }
          return {
            success: false,
            error: 'No matching cards found to remove.',
          };
        }

        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        this.removeCardById(cardId);
        return { success: true, message: `Removed ${describeCardTarget(card)}.` };
      }
      case 'setCardTitle':
      case 'updateCardTitle':
      case 'renameCard': {
        const titleCandidates = [
          domAction.newTitle,
          domAction.title,
          domAction.label,
          domAction.text,
          domAction.value,
        ];
        const titleCandidate = titleCandidates.find(
          candidate => typeof candidate === 'string' && candidate.trim().length
        );
        if (!titleCandidate) {
          return { success: false, error: 'New title is required.' };
        }
        const newTitle = titleCandidate.trim();

        const ids = Array.isArray(domAction.cardId)
          ? domAction.cardId.filter(id => typeof id === 'string' && id.trim().length)
          : [];
        if (ids.length) {
          let updated = 0;
          ids.forEach(rawId => {
            const id = rawId.trim();
            const targetCard = this.getCardByIdOrAlias(id);
            if (targetCard) {
              this.updateCard(targetCard.id, current => {
                const plan = current.plan ? { ...current.plan, title: newTitle } : { title: newTitle };
                return { plan };
              });
              const updatedCard = this.getCardByIdOrAlias(targetCard.id);
              if (updatedCard) {
                this.linkAliasToCard(updatedCard);
                this.lastReferencedCard = {
                  id: updatedCard.id,
                  title: newTitle,
                };
              }
              updated += 1;
            }
          });
          if (updated) {
            return {
              success: true,
              message: `Updated title for ${updated} card${updated > 1 ? 's' : ''}.`,
            };
          }
        }
        const { card, cardId, fallbackTitle } = resolveCardContext(domAction);
        if (!cardId || !card) {
          return {
            success: false,
            error: `Card ${describeCardTarget(null, fallbackTitle, domAction.cardId)} not found.`,
          };
        }
        this.updateCard(cardId, current => {
          const plan = current.plan ? { ...current.plan, title: newTitle } : { title: newTitle };
          return { plan };
        });
        const updatedCard = this.getCardByIdOrAlias(cardId);
        if (updatedCard) {
          this.linkAliasToCard(updatedCard);
        }
        this.lastReferencedCard = {
          id: cardId,
          title: newTitle,
        };
        return { success: true, message: `Card title updated to "${newTitle}".` };
      }
      default:
        return { success: false, error: `Unknown DOM action: ${toolName}.` };
    }
  }

  domActionHasFilterValue(domAction) {
    if (!domAction || typeof domAction !== 'object') {
      return false;
    }
    const candidateKeys = [
      'query',
      'value',
      'term',
      'text',
      'filter',
      'filterValue',
      'filter_value',
      'filterQuery',
      'filter_query',
      'filterTerm',
      'filter_term',
      'keyword',
      'search',
      'searchTerm',
      'search_term',
      'searchQuery',
      'search_query',
      'queryText',
      'textQuery',
      'text_query',
      'query_string',
    ];
    for (const key of candidateKeys) {
      const raw = domAction[key];
      if (typeof raw === 'string' && raw.trim()) {
        return true;
      }
    }
    const valueKeys = ['values', 'targets', 'terms', 'matchValues', 'match_values', 'options'];
    for (const key of valueKeys) {
      const raw = domAction[key];
      if (Array.isArray(raw) && raw.some(item => typeof item === 'string' && item.trim())) {
        return true;
      }
    }
    return false;
  }

  getLastUserChatText() {
    const history = Array.isArray(this.state.chatHistory) ? this.state.chatHistory : [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry && entry.sender === 'user' && typeof entry.text === 'string') {
        const trimmed = entry.text.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  }

  extractQuotedTerms(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return [];
    }
    const matches = [];
    const pattern = /["'“”‘’`´]([^"'“”‘’`´]+)["'“”‘’`´]/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (candidate && candidate.length <= 120) {
        matches.push(candidate);
      }
    }
    return matches;
  }

  deriveRawFilterQueryHint(action, domAction) {
    const sources = [];
    if (action && typeof action.thought === 'string') {
      sources.push(action.thought);
    }
    if (action && typeof action.text === 'string') {
      sources.push(action.text);
    }
    if (domAction && typeof domAction.reason === 'string') {
      sources.push(domAction.reason);
    }
    const lastUser = this.getLastUserChatText();
    if (lastUser) {
      sources.push(lastUser);
    }
    for (const source of sources) {
      const quoted = this.extractQuotedTerms(source);
      if (quoted.length) {
        const hint = quoted[quoted.length - 1];
        if (hint) {
          return hint;
        }
      }
    }
    return null;
  }

  maybeAttachInferredRawFilter(domAction, action) {
    if (!domAction || domAction.toolName !== 'setRawDataFilter') {
      return;
    }
    if (this.domActionHasFilterValue(domAction)) {
      return;
    }
    const queryHint = this.deriveRawFilterQueryHint(action, domAction);
    if (queryHint && typeof queryHint === 'string') {
      domAction.query = queryHint;
      domAction.__inferredQuery = true;
    }
  }

  normaliseDomToolName(name) {
    if (typeof name !== 'string') {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    if (/[_\s-]/.test(trimmed)) {
      const camel = trimmed
        .toLowerCase()
        .replace(/[_\s-]+([a-z0-9])/g, (_, char) => (char ? char.toUpperCase() : ''));
      return camel.charAt(0).toLowerCase() + camel.slice(1);
    }
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }

  normaliseAiAction(action, depth = 0) {
    if (!action || typeof action !== 'object') {
      return null;
    }
    if (depth > 3) {
      return null;
    }
    const getThought = source => {
      if (!source || typeof source !== 'object') return null;
      const value = source.thought ?? source.reason ?? null;
      return typeof value === 'string' ? value : null;
    };

    const unwrapNestedAction = candidate => {
      if (!candidate || typeof candidate !== 'object') return null;
      const merged = { ...candidate };
      const nestedThought = getThought(candidate) || getThought(action);
      if (nestedThought && typeof merged.thought !== 'string') {
        merged.thought = nestedThought;
      }
      if (action.cardId && !Object.prototype.hasOwnProperty.call(merged, 'cardId')) {
        merged.cardId = action.cardId;
      }
      return this.normaliseAiAction(merged, depth + 1);
    };

    if (!action.responseType) {
      if (action.action && typeof action.action === 'object' && action.action !== action) {
        const result = unwrapNestedAction(action.action);
        if (result) {
          return result;
        }
      }
      if (Array.isArray(action.actions) && action.actions.length === 1) {
        const result = unwrapNestedAction(action.actions[0]);
        if (result) {
          return result;
        }
      }
    }

    if (action.responseType) {
      const normalised = { ...action };
      const thought = getThought(action);
      if (thought) {
        normalised.thought = thought;
      } else {
        delete normalised.thought;
      }
      return normalised;
    }

    const explicitAction =
      typeof action.action === 'string'
        ? action.action
        : typeof (action.action?.type ?? action.action?.toolName) === 'string'
        ? action.action.type || action.action.toolName
        : null;
    const toolNameCandidate =
      typeof action.toolName === 'string'
        ? action.toolName
        : typeof action.type === 'string'
        ? action.type
        : null;
    const props = action && typeof action.props === 'object' && action.props ? { ...action.props } : {};
    if (!toolNameCandidate && !explicitAction && typeof props.action === 'string') {
      props.toolName = props.toolName || props.action;
      delete props.action;
    }
    const toolName = toolNameCandidate || explicitAction || (typeof props.toolName === 'string' ? props.toolName : null);
    if (action && typeof action.args === 'object' && action.args) {
      Object.assign(props, action.args);
    }
    if (action && typeof action.toolInput === 'object' && action.toolInput) {
      Object.entries(action.toolInput).forEach(([key, value]) => {
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          props[key] = value;
        }
      });
      if (!Object.prototype.hasOwnProperty.call(props, 'cardId') && action.toolInput?.cardId) {
        props.cardId = action.toolInput.cardId;
      }
    }
    if (props.toolInput && typeof props.toolInput === 'object') {
      Object.entries(props.toolInput).forEach(([key, value]) => {
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          props[key] = value;
        }
      });
      delete props.toolInput;
    }
    const thought = getThought(action) || getThought(props);

    if (toolName === 'text_response') {
      const text =
        typeof action.text === 'string'
          ? action.text
          : typeof props.text === 'string'
          ? props.text
          : '';
      const cardId = props.cardId ?? action.cardId ?? null;
      return { responseType: 'text_response', text, cardId, thought };
    }

    if (toolName === 'plan_creation') {
      const plan = action.plan || props.plan;
      return plan ? { responseType: 'plan_creation', plan, thought } : null;
    }

    if (toolName === 'execute_js_code' || toolName === 'code_execution') {
      const codePayload = action.code || props.code;
      if (codePayload && typeof codePayload === 'object') {
        return { responseType: 'execute_js_code', code: codePayload, thought };
      }
      const jsBody =
        typeof props.jsFunctionBody === 'string'
          ? props.jsFunctionBody
          : typeof action.jsFunctionBody === 'string'
          ? action.jsFunctionBody
          : null;
      if (jsBody) {
        return {
          responseType: 'execute_js_code',
          code: {
            explanation:
              typeof props.explanation === 'string'
                ? props.explanation
                : typeof action.explanation === 'string'
                ? action.explanation
                : '',
            jsFunctionBody: jsBody,
          },
          thought,
        };
      }
      return null;
    }

    if (toolName === 'dom_action') {
      const domAction =
        action.domAction && typeof action.domAction === 'object' ? { ...action.domAction } : {};
      if (domAction.args && typeof domAction.args === 'object') {
        Object.entries(domAction.args).forEach(([key, value]) => {
          if (!Object.prototype.hasOwnProperty.call(domAction, key)) {
            domAction[key] = value;
          }
        });
        delete domAction.args;
      }
      Object.entries(props).forEach(([key, value]) => {
        if (!Object.prototype.hasOwnProperty.call(domAction, key)) {
          domAction[key] = value;
        }
      });
      if (!domAction.toolName && typeof domAction.action === 'string') {
        domAction.toolName = domAction.action;
        delete domAction.action;
      }
      if (!domAction.toolName && props.toolName && typeof props.toolName === 'string') {
        domAction.toolName = props.toolName;
      }
      const domActionToolCandidates = [
        domAction.toolName,
        props.toolName,
        domAction.action,
        props.action,
        props.tool,
        props.command,
        action.toolName,
        action.action,
      ];
      let canonicalTool = null;
      for (const candidate of domActionToolCandidates) {
        canonicalTool = this.normaliseDomToolName(candidate);
        if (canonicalTool && DOM_ACTION_TOOL_NAMES.has(canonicalTool)) {
          break;
        }
      }
      if (!canonicalTool) {
        if (domAction.remove === true || domAction.delete === true || props.remove === true || props.delete === true) {
          canonicalTool = 'removeCard';
        } else if (
          typeof domAction.newTitle === 'string' ||
          typeof domAction.title === 'string' ||
          typeof domAction.label === 'string' ||
          typeof props.newTitle === 'string' ||
          typeof props.title === 'string' ||
          typeof props.label === 'string'
        ) {
          canonicalTool = 'setCardTitle';
        }
      }
      if (!canonicalTool || !DOM_ACTION_TOOL_NAMES.has(canonicalTool)) {
        return null;
      }
      domAction.toolName = canonicalTool;
      if (action.cardId && !Object.prototype.hasOwnProperty.call(domAction, 'cardId')) {
        domAction.cardId = action.cardId;
      }
      return { responseType: 'dom_action', domAction, thought };
    }

    let canonicalToolName = typeof toolName === 'string' ? this.normaliseDomToolName(toolName) : null;
    if (!canonicalToolName) {
      if (props && (props.remove === true || props.delete === true)) {
        canonicalToolName = 'removeCard';
      } else if (
        props &&
        (typeof props.newTitle === 'string' || typeof props.title === 'string' || typeof props.label === 'string')
      ) {
        canonicalToolName = 'setCardTitle';
      }
    }
    if (canonicalToolName && DOM_ACTION_TOOL_NAMES.has(canonicalToolName)) {
      const domAction = { ...props, toolName: canonicalToolName };
      if (action.cardId && !Object.prototype.hasOwnProperty.call(domAction, 'cardId')) {
        domAction.cardId = action.cardId;
      }
      return { responseType: 'dom_action', domAction, thought };
    }

    return null;
  }

  sleep(ms = 800) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async applyChatActions(actions) {
    if (!Array.isArray(actions) || !actions.length) {
      return;
    }
    const datasetId = this.getCurrentDatasetId();
    const normalisedActions = [];
    actions.forEach(rawAction => {
      const normalised = this.normaliseAiAction(rawAction);
      if (normalised) {
        normalisedActions.push(normalised);
      } else {
        console.error('Unsupported AI action type received:', rawAction);
        this.addProgress('AI returned an unsupported action type.', 'error');
        normalisedActions.push({
          responseType: 'error_report',
          errorType: 'unsupported_action',
          message: 'The requested action could not be interpreted.',
          raw: this.sanitiseActionForError(rawAction),
        });
      }
    });

    if (!normalisedActions.length) {
      const fallbackText = (() => {
        for (const raw of actions) {
          if (!raw || typeof raw !== 'object') continue;
          if (typeof raw.text === 'string' && raw.text.trim()) {
            return raw.text.trim();
          }
          const nested = raw.action && typeof raw.action === 'object' ? raw.action : null;
          if (nested && typeof nested.text === 'string' && nested.text.trim()) {
            return nested.text.trim();
          }
          const toolPayload =
            raw.toolInput && typeof raw.toolInput === 'object' ? raw.toolInput : null;
          if (toolPayload && typeof toolPayload.text === 'string' && toolPayload.text.trim()) {
            return toolPayload.text.trim();
          }
          if (nested && Array.isArray(nested.actions) && nested.actions.length) {
            for (const inner of nested.actions) {
              if (inner && typeof inner.text === 'string' && inner.text.trim()) {
                return inner.text.trim();
              }
            }
          }
        }
        return null;
      })();

      if (fallbackText) {
        const shouldStick = this.isConversationNearBottom();
        this.setState(prev => ({
          chatHistory: [
            ...prev.chatHistory,
            {
              sender: 'ai',
              text: fallbackText,
              timestamp: new Date(),
              type: 'ai_fallback_message',
            },
          ],
        }));
        if (shouldStick) {
          this.shouldAutoScrollConversation = true;
        }
        this.addProgress(
          'AI response used fallback mode due to unsupported action format.',
          'warning'
        );
      } else {
        this.addProgress(
          'AI response could not be interpreted. Please retry or rephrase your request.',
          'error'
        );
      }
      return;
    }

    const sanitiseQuickActions = quickActionsList => {
      if (!Array.isArray(quickActionsList) || !quickActionsList.length) {
        return [];
      }
      const seen = new Set();
      const sanitized = [];
      quickActionsList.forEach(item => {
        if (!item || typeof item !== 'object') {
          return;
        }
        const rawLabel =
          typeof item.label === 'string'
            ? item.label
            : typeof item.title === 'string'
            ? item.title
            : '';
        const label = rawLabel.trim();
        const domAction =
          item.domAction && typeof item.domAction === 'object'
            ? { ...item.domAction }
            : typeof item.toolName === 'string'
            ? { toolName: item.toolName }
            : null;
        if (!label || !domAction || typeof domAction.toolName !== 'string') {
          return;
        }
        const toolName = domAction.toolName;
        if (!DOM_ACTION_TOOL_NAMES.has(toolName)) {
          return;
        }
        const signature = `${label}::${toolName}`;
        if (seen.has(signature)) {
          return;
        }
        seen.add(signature);
        sanitized.push({ label, domAction });
      });
      return sanitized;
    };

    const pendingQuickActions = [];
    const appendPendingQuickAction = quickAction => {
      const [sanitized] = sanitiseQuickActions([quickAction]);
      if (!sanitized) {
        return;
      }
      const exists = pendingQuickActions.some(
        existing =>
          existing.label === sanitized.label &&
          existing.domAction?.toolName === sanitized.domAction?.toolName
      );
      if (!exists) {
        pendingQuickActions.push(sanitized);
      }
    };

    const RAW_DATA_CTA_LABEL = '→ 查看篩選後資料';
    const createRawDataQuickAction = () => ({
      label: RAW_DATA_CTA_LABEL,
      domAction: { toolName: 'focusRawDataPanel', highlight: true },
    });

    const totalActions = normalisedActions.length;
    let abortActionSequence = null;
    const firstThought = normalisedActions[0].thought;
    if (totalActions > 1) {
      const planText =
        typeof firstThought === 'string' && firstThought.trim().length
          ? firstThought.trim()
          : `I've prepared a ${totalActions}-step plan to address your request.`;
      const shouldStick = this.isConversationNearBottom();
      this.setState(prev => ({
        chatHistory: [
          ...prev.chatHistory,
          {
            sender: 'ai',
            text: planText,
            timestamp: new Date(),
            type: 'ai_plan_start',
          },
        ],
      }));
      if (shouldStick) {
        this.shouldAutoScrollConversation = true;
      }
      this.addProgress(`AI is executing a ${totalActions}-step plan.`);
      await this.sleep(1000);
    }

    for (let index = 0; index < normalisedActions.length; index++) {
      const action = normalisedActions[index];

      if (action.responseType === 'error_report') {
        const summary =
          typeof action.message === 'string' && action.message.trim()
            ? action.message.trim()
            : 'An action could not be completed.';
        this.failWorkflowStep({
          label: 'AI action error',
          error: summary,
        });
        const shouldStick = this.isConversationNearBottom();
        this.setState(prev => ({
          chatHistory: [
            ...prev.chatHistory,
            {
              sender: 'system',
              text: summary,
              timestamp: new Date(),
              type: 'ai_error_report',
            },
          ],
        }));
        if (shouldStick) {
          this.shouldAutoScrollConversation = true;
        }
        continue;
      }

      if (action.thought && (totalActions === 1 || index > 0)) {
        this.addProgress(`AI Thought: ${action.thought}`);
        await this.sleep(1500);
      }

      switch (action.responseType) {
        case 'text_response':
          {
            const context = this.resolveCardReference(action.cardId, action.cardTitle);
            if (context.card) {
              this.lastReferencedCard = {
                id: context.card.id,
                title: context.fallbackTitle || context.card.plan?.title || null,
              };
            } else if (context.cardId || context.fallbackTitle) {
              this.lastReferencedCard = {
                id: context.cardId || null,
                title: context.fallbackTitle || null,
              };
            }
            const shouldStick = this.isConversationNearBottom();
            const actionQuickActions = Array.isArray(action.quickActions)
              ? action.quickActions
              : Array.isArray(action.quick_actions)
              ? action.quick_actions
              : Array.isArray(action.buttons)
              ? action.buttons
              : [];
            const quickActions = sanitiseQuickActions([
              ...actionQuickActions,
              ...pendingQuickActions,
            ]);
            pendingQuickActions.length = 0;
            const chatEntry = {
              sender: 'ai',
              text: action.text || '',
              timestamp: new Date(),
              type: 'ai_message',
              cardId: context.cardId,
              cardTitle: context.fallbackTitle,
            };
            if (quickActions.length) {
              chatEntry.quickActions = quickActions;
            }
            this.setState(prev => ({
              chatHistory: [
                ...prev.chatHistory,
                chatEntry,
              ],
            }));
            if (shouldStick) {
              this.shouldAutoScrollConversation = true;
            }
          }
          if (action.text && ENABLE_MEMORY_FEATURES) {
            try {
              await this.ensureMemoryVectorReady();
              await storeMemory(datasetId, {
                kind: 'chat_response',
                intent: 'narrative',
                text: action.text,
                summary: action.text.slice(0, 220),
                metadata: { cardId: action.cardId },
              });
              if (this.state.isMemoryPanelOpen) {
                this.refreshMemoryDocuments();
              }
            } catch (memoryError) {
              console.warn('Failed to store AI chat memory entry.', memoryError);
            }
          }
          break;
        case 'plan_creation':
          if (action.plan && this.state.csvData) {
            this.ensureWorkflowPhase('execute', '使用者請求新的分析，執行追加計畫。');
            const aliasId =
              typeof action.cardId === 'string' && action.cardId.trim()
                ? action.cardId.trim()
                : typeof action.plan.cardId === 'string' && action.plan.cardId.trim()
                ? action.plan.cardId.trim()
                : typeof action.plan.id === 'string' && action.plan.id.trim()
                ? action.plan.id.trim()
                : null;
            const newCards = await this.runAnalysisPipeline([action.plan], this.state.csvData, true);
            if (aliasId && newCards.length) {
              const latestCard = newCards[newCards.length - 1];
              this.linkAliasToCard(latestCard, aliasId);
            }
          }
          break;
        case 'proceed_to_analysis': {
          const text =
            action.text ||
            'Initial analysis is ready. Ask me for new charts, deeper exploration, or data refinements any time.';
          const shouldStick = this.isConversationNearBottom();
          this.setState(prev => ({
            chatHistory: [
              ...prev.chatHistory,
              {
                sender: 'ai',
                text,
                timestamp: new Date(),
                type: 'ai_message',
              },
            ],
          }));
          if (shouldStick) {
            this.shouldAutoScrollConversation = true;
          }
          this.addProgress('AI requested proceed_to_analysis (deprecated). Responded with guidance.');
          if (ENABLE_MEMORY_FEATURES) {
            try {
              await this.ensureMemoryVectorReady();
              await storeMemory(datasetId, {
                kind: 'chat_response',
                intent: 'narrative',
                text,
                summary: text.slice(0, 220),
              });
              if (this.state.isMemoryPanelOpen) {
                this.refreshMemoryDocuments();
              }
            } catch (memoryError) {
              console.warn('Failed to store AI chat memory entry.', memoryError);
            }
          }
          break;
        }
        case 'execute_js_code':
          if (action.code && action.code.jsFunctionBody && this.state.csvData) {
            this.ensureWorkflowPhase('adjust', 'AI 正在調整資料集。');
            this.addProgress('AI is applying a data transformation...');
            try {
              const transformed = executeJavaScriptDataTransform(
                this.state.csvData.data,
                action.code.jsFunctionBody
              );
              const result = await this.rebuildAfterDataChange(
                transformed,
                'Data updated after applying AI transformation.'
              );
              if (result.success) {
                this.completeWorkflowStep({
                  label: '資料轉換',
                  outcome: '成功更新資料集',
                });
              } else if (result.error) {
                this.failWorkflowStep({
                  label: '資料轉換',
                  error: result.error,
                });
              }
              if (result.success && ENABLE_MEMORY_FEATURES) {
                try {
                  await this.ensureMemoryVectorReady();
                  await storeMemory(datasetId, {
                    kind: 'transformation',
                    intent: 'cleaning',
                    text: action.code.jsFunctionBody,
                    summary: 'AI transformation applied to dataset.',
                    metadata: { codePreview: action.code.jsFunctionBody.slice(0, 200) },
                  });
                  if (this.state.isMemoryPanelOpen) {
                    this.refreshMemoryDocuments();
                  }
                } catch (memoryError) {
                  console.warn('Failed to store transformation memory entry.', memoryError);
                }
              }
              if (!result.success && result.error) {
                this.addProgress(result.error, 'error');
              }
            } catch (error) {
              this.addProgress(
                `AI transformation failed: ${error instanceof Error ? error.message : String(error)}`,
                'error'
              );
              this.failWorkflowStep({
                label: '資料轉換',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          break;
        case 'dom_action':
          {
            const domAction = action.domAction || {};
            const label =
              typeof domAction.toolName === 'string' && domAction.toolName.trim()
                ? domAction.toolName.trim()
                : 'dom_action';
            this.addProgress(`AI is performing action: ${label}...`);
            this.maybeAttachInferredRawFilter(domAction, action);
            const result = await this.handleDomAction(domAction);
            if (result.success) {
              if (domAction && typeof domAction === 'object') {
                const context = this.resolveCardReference(
                  domAction.cardId ?? null,
                  domAction.cardTitle ?? domAction.title ?? null
                );
                if (context.card) {
                  this.lastReferencedCard = {
                    id: context.card.id,
                    title: context.fallbackTitle || context.card.plan?.title || null,
                  };
                }
                const tool = typeof domAction.toolName === 'string' ? domAction.toolName : '';
                if (tool === 'setRawDataFilter') {
                  appendPendingQuickAction(createRawDataQuickAction());
                }
                if (tool === 'setRawDataVisibility' && domAction.visible !== false) {
                  appendPendingQuickAction(createRawDataQuickAction());
                }
                if (tool === 'focusRawDataPanel') {
                  pendingQuickActions.length = 0;
                }
              }
              if (result.message) {
                this.addProgress(result.message);
              }
            } else if (result.error) {
              this.addProgress(result.error, 'error');
              this.failWorkflowStep({
                label: `DOM action: ${label}`,
                error: result.error,
              });
              const shouldStick = this.isConversationNearBottom();
              this.setState(prev => ({
                chatHistory: [
                  ...prev.chatHistory,
                  {
                    sender: 'system',
                    text: `⚠️ ${label} failed: ${result.error}`,
                    timestamp: new Date(),
                    type: 'ai_action_error',
                  },
                ],
              }));
              if (shouldStick) {
                this.shouldAutoScrollConversation = true;
              }
              const isMissingFilterQuery =
                label === 'setRawDataFilter' &&
                typeof result.error === 'string' &&
                result.error.toLowerCase().includes('filter query');
              if (isMissingFilterQuery) {
                abortActionSequence = {
                  label,
                  error: result.error,
                };
                break;
              }
              continue;
            }
            if (result.success && ENABLE_MEMORY_FEATURES && action.domAction) {
              try {
                await this.ensureMemoryVectorReady();
                await storeMemory(datasetId, {
                  kind: 'dom_action',
                  intent: 'interaction',
                  text: JSON.stringify(action.domAction),
                  summary: 'Saved assistant UI action.',
                  metadata: { domAction: action.domAction },
                });
                if (this.state.isMemoryPanelOpen) {
                  this.refreshMemoryDocuments();
                }
              } catch (memoryError) {
                console.warn('Failed to store DOM action memory entry.', memoryError);
              }
            }
          }
          break;
        default:
          this.addProgress('AI returned an unsupported action type.', 'error');
          break;
      }

      if (abortActionSequence) {
        const guidanceText =
          'setRawDataFilter requires a `query` or `value`. 請重新送出包含查詢字串的 dom_action，例如 {"toolName":"setRawDataFilter","query":"<keyword>"}。';
        this.addProgress('Aborted remaining actions because filter query was missing.', 'warning');
        const shouldStick = this.isConversationNearBottom();
        this.setState(prev => ({
          chatHistory: [
            ...prev.chatHistory,
            {
              sender: 'system',
              text: `⚠️ ${abortActionSequence.label} aborted: ${abortActionSequence.error}\n\n${guidanceText}`,
              timestamp: new Date(),
              type: 'ai_action_error',
            },
          ],
        }));
        if (shouldStick) {
          this.shouldAutoScrollConversation = true;
        }
        break;
      }

      if (totalActions > 1) {
        await this.sleep(750);
      }
    }
  }

  handleSettingsSave(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    saveSettings(this.settings);
    this.setState({ showSettings: false });
  }

  onDocumentClick(event) {
    if (!this.isMounted || !event) return;
    const target = event.target;
    if (target && this.contains(target)) {
      if (target.closest('[data-export-menu-container]')) {
        return;
      }
      if (target.closest('[data-export-menu-toggle]')) {
        return;
      }
    }
    this.closeExportMenus();
  }

  closeExportMenus() {
    this.querySelectorAll('[data-export-menu]').forEach(menu => menu.classList.add('hidden'));
    this.querySelectorAll('[data-export-menu-toggle]').forEach(button =>
      button.setAttribute('aria-expanded', 'false')
    );
  }

  toggleExportMenu(button) {
    if (!button) return;
    const container = button.closest('[data-export-menu-container]');
    if (!container) return;
    const menu = container.querySelector('[data-export-menu]');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    this.closeExportMenus();
    if (willOpen) {
      menu.classList.remove('hidden');
      button.setAttribute('aria-expanded', 'true');
    }
  }

  toggleSelectionDetails(cardId) {
    if (!cardId) return;
    this.updateCard(cardId, card => ({
      showSelectionDetails: card.showSelectionDetails === false,
    }));
  }

  handleRawDataReset() {
    this.setState({
      rawDataFilter: '',
      rawDataWholeWord: false,
      rawDataSort: null,
      rawDataPage: 0,
    });
  }

  async handleCardExport(cardId, format) {
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) {
      this.addProgress(`Cannot export: card ${cardId || ''} not found.`, 'error');
      return;
    }
    const title = card.plan?.title || 'analysis-card';
    const dataRows = this.getCardDisplayData(card);
    const hasRows = Array.isArray(dataRows) && dataRows.length > 0;
    if ((format === 'csv' || format === 'html') && !hasRows) {
      this.closeExportMenus();
      this.addProgress(`Cannot export "${title}" — no table data is available yet.`, 'error');
      return;
    }
    this.closeExportMenus();
    this.updateCard(cardId, () => ({ isExporting: true }));
    await this.waitForNextFrame();
    const cardElement = this.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardElement) {
      this.addProgress('Cannot export because the card element is missing.', 'error');
      this.updateCard(cardId, () => ({ isExporting: false }));
      return;
    }
    try {
      switch (format) {
        case 'png':
          await exportToPng(cardElement, title);
          break;
        case 'csv':
          exportToCsv(dataRows, title);
          break;
        case 'html':
          await exportToHtml(cardElement, title, dataRows, card.summary);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Card export failed:', error);
      this.addProgress(
        `Failed to export "${title}" as ${format.toUpperCase()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'error'
      );
    } finally {
      this.updateCard(cardId, () => ({ isExporting: false }));
      await this.waitForNextFrame();
      this.closeExportMenus();
    }
  }

  hasConfiguredApiKey() {
    const provider = this.settings.provider || 'google';
    return provider === 'google'
      ? Boolean(this.settings.geminiApiKey)
      : Boolean(this.settings.openAIApiKey);
  }

  ensureApiCredentials(options = {}) {
    const config = typeof options === 'string' ? { reason: options } : options;
    const provider = this.settings.provider || 'google';
    if (this.hasConfiguredApiKey()) {
      return true;
    }
    const providerLabel = provider === 'google' ? 'Google Gemini' : 'OpenAI';
    const message =
      config?.reason ||
      `${providerLabel} API key is missing. Opening settings so you can add it and retry.`;
    this.addProgress(message, 'error');
    this.setState({ showSettings: true });
    const focusField =
      config?.focusField || (provider === 'google' ? 'settings-gemini-key' : 'settings-openai-key');
    this.pendingFocus = {
      focusKey: focusField,
      useDataset: false,
      selectionStart: null,
      selectionEnd: null,
      scrollTop: null,
    };
    return false;
  }

  toggleHistoryPanel(forceOpen) {
    const isOpen =
      typeof forceOpen === 'boolean' ? forceOpen : !(this.state.isHistoryPanelOpen ?? false);
    const previousFlag = this.isRestoringSession;
    this.isRestoringSession = true;
    this.setState({ isHistoryPanelOpen: isOpen });
    this.isRestoringSession = previousFlag;
    if (isOpen) {
      this.loadReportsList();
    }
  }

  toggleAsideVisibility(forceVisible) {
    const isVisible =
      typeof forceVisible === 'boolean' ? forceVisible : !(this.state.isAsideVisible ?? true);
    this.setState({ isAsideVisible: isVisible });
    if (isVisible) {
      queueMicrotask(() => this.scrollConversationToBottom());
    }
  }

  toggleDataPrepDebugPanel(forceVisible) {
    this.setState(prev => ({
      isDataPrepDebugVisible:
        typeof forceVisible === 'boolean' ? forceVisible : !prev.isDataPrepDebugVisible,
    }));
  }

  handleAsideMouseDown(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation?.();
    }
    if (this.isResizingAside) return;
    this.isResizingAside = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.boundAsideMouseMove);
      document.addEventListener('mouseup', this.boundAsideMouseUp);
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'col-resize';
    }
  }

  handleAsideMouseMove(event) {
    if (!this.isResizingAside) return;
    if (typeof window === 'undefined') return;
    const clientX = event?.clientX;
    if (typeof clientX !== 'number') return;
    let newWidth = window.innerWidth - clientX;
    if (newWidth < MIN_ASIDE_WIDTH) newWidth = MIN_ASIDE_WIDTH;
    if (newWidth > MAX_ASIDE_WIDTH) newWidth = MAX_ASIDE_WIDTH;
    this.setState({ asideWidth: newWidth });
  }

  handleAsideMouseUp() {
    if (!this.isResizingAside) return;
    this.isResizingAside = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.boundAsideMouseMove);
      document.removeEventListener('mouseup', this.boundAsideMouseUp);
      if (document.body) {
        document.body.style.cursor = '';
      }
    }
  }

  async handleLoadReport(reportId) {
    if (!reportId) return;
    try {
      this.addProgress(`Loading report ${reportId}...`);
      this.finalizeWorkflow('載入歷史報告前關閉目前的工作流程。');
      const report = await getReport(reportId);
      if (!report?.appState) {
        this.addProgress('Unable to load the selected report.', 'error');
        return;
      }
      const restored = this.rehydrateAppState(report.appState);
      if (!restored) {
        this.addProgress('Report data is incompatible with the current app version.', 'error');
        return;
      }
      const previousFlag = this.isRestoringSession;
      this.isRestoringSession = true;
      this.resetCardRegistries();
      this.setState(prev => ({
        ...prev,
        ...restored,
        isHistoryPanelOpen: false,
      }));
      this.isRestoringSession = previousFlag;
      this.workflowSessionId = null;
      this.workflowActivePhase = null;
      await saveReport({
        id: CURRENT_SESSION_KEY,
        filename: report.filename,
        createdAt: report.createdAt ? new Date(report.createdAt) : new Date(),
        updatedAt: new Date(),
        appState: this.captureSerializableAppState(),
      });
      await this.loadReportsList();
      this.addProgress(`Report "${report.filename}" loaded successfully.`);
    } catch (error) {
      console.error('Failed to load report:', error);
      this.addProgress('Failed to load the selected report.', 'error');
    }
  }

  async handleDeleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReport(reportId);
      if (reportId === CURRENT_SESSION_KEY) {
        this.addProgress('Cleared current session history entry.');
      } else {
        this.addProgress('Report deleted from history.');
      }
      await this.loadReportsList();
    } catch (error) {
      console.error('Failed to delete report:', error);
      this.addProgress('Failed to delete the selected report.', 'error');
    }
  }

  async handleNewSession() {
    const hasExistingData =
      this.state.csvData && Array.isArray(this.state.csvData.data) && this.state.csvData.data.length;
    this.addProgress('Starting new session...');
    this.finalizeWorkflow('使用者啟動新的空白工作階段。');
    if (hasExistingData) {
      await this.archiveCurrentSession();
    } else {
      try {
        await deleteReport(CURRENT_SESSION_KEY);
      } catch (error) {
        console.error('Failed to clear current session:', error);
      }
    }
    const previousFlag = this.isRestoringSession;
    this.isRestoringSession = true;
    this.resetCardRegistries();
    this.setState(prev => ({
      ...prev,
      currentView: 'file_upload',
      isBusy: false,
      isThinking: false,
      progressMessages: [],
      csvData: null,
      columnProfiles: [],
      analysisCards: [],
      finalSummary: null,
      aiCoreAnalysisSummary: null,
      dataPreparationPlan: null,
      initialDataSample: null,
      isDataPrepDebugVisible: false,
      chatHistory: [],
      highlightedCardId: null,
      isRawDataVisible: true,
      rawDataFilter: '',
      rawDataWholeWord: false,
      rawDataSort: null,
      rawDataView: 'cleaned',
      rawDataPage: 0,
      rawDataColumnWidths: {},
      originalCsvData: null,
      csvMetadata: null,
      currentDatasetId: null,
      lastAuditReport: null,
      lastRepairSummary: null,
      lastRepairTimestamp: null,
      isHistoryPanelOpen: false,
      workflowTimeline: null,
      workflowPlan: [],
    }));
    this.isRestoringSession = previousFlag;
    this.workflowSessionId = null;
    this.workflowActivePhase = null;
    await this.loadReportsList();
    this.addProgress('New session started. Please upload a CSV file to begin.');
  }

  handleChartTypeChange(cardId, newType) {
    this.updateCard(cardId, () => ({
      displayChartType: newType,
      selectedIndices: [],
      isZoomed: false,
    }));
    const chart = this.chartInstances.get(cardId);
    chart?.resetZoom?.();
  }

  handleToggleDataVisibility(cardId) {
    this.updateCard(cardId, card => ({
      isDataVisible: !card.isDataVisible,
    }));
  }

  handleTopNChange(cardId, topN) {
    this.updateCard(cardId, card => ({
      topN,
      hideOthers: topN ? card.hideOthers : false,
      selectedIndices: [],
      isZoomed: false,
    }));
  }

  handleHideOthersChange(cardId, hide) {
    this.updateCard(cardId, () => ({
      hideOthers: hide,
      selectedIndices: [],
      isZoomed: false,
    }));
  }

  handleLegendToggle(cardId, label) {
    this.updateCard(cardId, card => {
      const hidden = new Set(card.hiddenLabels || []);
      if (hidden.has(label)) {
        hidden.delete(label);
      } else {
        hidden.add(label);
      }
      return {
        hiddenLabels: Array.from(hidden),
        selectedIndices: [],
        isZoomed: false,
      };
    });
  }

  handleClearSelection(cardId) {
    this.updateCard(cardId, () => ({ selectedIndices: [] }));
  }

  handleResetZoom(cardId) {
    const chart = this.chartInstances.get(cardId);
    chart?.resetZoom?.();
    this.updateCard(cardId, () => ({ isZoomed: false }));
  }

  clearHighlightState() {
    if (this.highlightClearTimer) {
      clearTimeout(this.highlightClearTimer);
      this.highlightClearTimer = null;
    }
    if (this.state.highlightedCardId !== null) {
      this.setState({ highlightedCardId: null });
    }
  }

  highlightCard(cardId, options = {}) {
    if (!cardId) return false;
    const cardExists = this.state.analysisCards.some(card => card.id === cardId);
    if (!cardExists) return false;
    if (this.highlightClearTimer) {
      clearTimeout(this.highlightClearTimer);
      this.highlightClearTimer = null;
    }
    this.setState({ highlightedCardId: cardId });
    const { scrollIntoView = true, autoClearDelay } = options;
    if (scrollIntoView) {
      this.waitForNextFrame().then(() => {
        const cardElement = this.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardElement) return;
        const container = this.mainScrollElement || this.querySelector('[data-main-scroll]');
        if (container && typeof container.scrollTo === 'function') {
          const containerRect = container.getBoundingClientRect();
          const cardRect = cardElement.getBoundingClientRect();
          const offsetWithinContainer = cardRect.top - containerRect.top;
          const targetTop = container.scrollTop + offsetWithinContainer - container.clientHeight / 2 + cardElement.offsetHeight / 2;
          container.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth',
          });
        } else if (typeof cardElement.scrollIntoView === 'function') {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
    const delay =
      typeof autoClearDelay === 'number' && Number.isFinite(autoClearDelay)
        ? Math.max(0, autoClearDelay)
        : 2500;
    if (delay > 0) {
      this.highlightClearTimer = setTimeout(() => {
        this.highlightClearTimer = null;
        if (this.state.highlightedCardId === cardId) {
          this.setState({ highlightedCardId: null });
        }
      }, delay);
    }
    return true;
  }

  setCardDataVisibility(cardId, visible) {
    if (!cardId) return false;
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) return false;
    const nextVisible =
      typeof visible === 'boolean' ? visible : !(card.isDataVisible ?? false);
    this.updateCard(cardId, () => ({
      isDataVisible: nextVisible,
    }));
    return true;
  }

  normalizeCardFilter(filterInput) {
    if (!filterInput || typeof filterInput !== 'object') {
      return null;
    }
    const column = typeof filterInput.column === 'string' ? filterInput.column.trim() : '';
    if (!column) {
      return null;
    }
    const values = Array.isArray(filterInput.values) ? filterInput.values : [];
    const normalizedValues = Array.from(
      new Set(
        values
          .map(value => {
            if (value === null || value === undefined) {
              return null;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
              return String(value);
            }
            if (typeof value === 'boolean') {
              return value ? 'true' : 'false';
            }
            const text = String(value).trim();
            return text ? text : null;
          })
          .filter(Boolean)
      )
    );
    if (!normalizedValues.length) {
      return null;
    }
    return {
      column,
      values: normalizedValues,
    };
  }

  setCardFilter(cardId, filterInput) {
    if (!cardId) {
      return { success: false, error: 'Missing card ID.' };
    }
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) {
      return { success: false, error: `Card ${cardId} not found.` };
    }
    const normalized = this.normalizeCardFilter(filterInput);
    this.updateCard(cardId, () => ({
      filter: normalized,
      selectedIndices: [],
    }));
    return {
      success: true,
      cleared: !normalized,
      filter: normalized,
      card,
      cardTitle: card.plan?.title || cardId,
    };
  }

  setCardTopN(cardId, topN, hideOthers) {
    if (!cardId) return false;
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) return false;
    let normalized = null;
    if (topN !== undefined && topN !== null && topN !== 'all') {
      const parsed = Number(topN);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return false;
      }
      normalized = parsed;
    }
    this.handleTopNChange(cardId, normalized);
    if (typeof hideOthers === 'boolean') {
      this.handleHideOthersChange(cardId, hideOthers);
    }
    return true;
  }

  setCardHideOthers(cardId, hideOthers) {
    if (!cardId || typeof hideOthers !== 'boolean') return false;
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) return false;
    this.handleHideOthersChange(cardId, hideOthers);
    return true;
  }

  clearCardSelection(cardId) {
    if (!cardId) return false;
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) return false;
    this.handleClearSelection(cardId);
    return true;
  }

  resetCardZoom(cardId) {
    if (!cardId) return false;
    const card = this.state.analysisCards.find(item => item.id === cardId);
    if (!card) return false;
    this.handleResetZoom(cardId);
    return true;
  }

  handleChartElementClick(cardId, index, nativeEvent) {
    const isMultiSelect = nativeEvent && (nativeEvent.ctrlKey || nativeEvent.metaKey);
    this.updateCard(cardId, card => {
      const previous = Array.isArray(card.selectedIndices) ? card.selectedIndices : [];
      let nextSelection;
      if (isMultiSelect) {
        if (previous.includes(index)) {
          nextSelection = previous.filter(i => i !== index);
        } else {
          nextSelection = [...previous, index];
        }
      } else {
        nextSelection = previous.includes(index) ? [] : [index];
      }
      nextSelection.sort((a, b) => a - b);
      return { selectedIndices: nextSelection };
    });
  }

  handleZoomState(cardId, isZoomed) {
    this.updateCard(cardId, () => ({ isZoomed }));
  }

  handleRawDataToggle() {
    this.setState(prev => ({ isRawDataVisible: !prev.isRawDataVisible }));
  }

  handleRawDataViewChange(mode) {
    if (mode !== 'cleaned' && mode !== 'original') return;
    this.setState({ rawDataView: mode, rawDataPage: 0, rawDataColumnWidths: {} });
  }

  handleRawDataFilterChange(value) {
    this.setState({ rawDataFilter: value, rawDataPage: 0 });
  }

  handleRawDataWholeWordChange(checked) {
    this.setState({ rawDataWholeWord: checked, rawDataPage: 0 });
  }

  handleRawDataSort(column) {
    this.setState(prev => {
      if (!column) {
        return { rawDataSort: null, rawDataPage: 0 };
      }
      if (prev.rawDataSort && prev.rawDataSort.key === column) {
        const direction = prev.rawDataSort.direction === 'ascending' ? 'descending' : 'ascending';
        return { rawDataSort: { key: column, direction }, rawDataPage: 0 };
      }
      return { rawDataSort: { key: column, direction: 'ascending' }, rawDataPage: 0 };
    });
  }

  handleRawDataPageChange(direction) {
    if (!direction || (direction !== 'next' && direction !== 'prev')) {
      return;
    }
    const context = this.getDatasetViewContext();
    if (!context) {
      this.setState({ rawDataPage: 0 });
      return;
    }
    const dataset = context.activeDataset || this.state.csvData;
    const rows = this.getProcessedRawData(dataset);
    const totalRows = rows.length;
    if (!totalRows) {
      this.setState({ rawDataPage: 0 });
      return;
    }
    const totalPages = Math.max(1, Math.ceil(totalRows / RAW_ROWS_PER_PAGE));
    const currentPage = this.state.rawDataPage || 0;
    const delta = direction === 'next' ? 1 : -1;
    const nextPage = Math.min(totalPages - 1, Math.max(0, currentPage + delta));
    if (nextPage !== currentPage) {
      this.setState({ rawDataPage: nextPage });
    }
  }

  handleRawColumnResizeStart(event) {
    const pointerEvent = event;
    if (!pointerEvent || typeof pointerEvent.clientX !== 'number') {
      return;
    }
    const handle = pointerEvent.currentTarget;
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    const headerKey = handle.dataset.rawResize;
    if (!headerKey) {
      return;
    }
    const headerCell = handle.closest('th');
    if (!(headerCell instanceof HTMLElement)) {
      return;
    }
    const table = headerCell.closest('table');
    const cells =
      table instanceof HTMLElement
        ? Array.from(table.querySelectorAll('[data-raw-cell-col]')).filter(
            cell => cell.getAttribute('data-raw-cell-col') === headerKey
          )
        : [];
    const startX = pointerEvent.clientX;
    const initialWidth = headerCell.offsetWidth;
    let latestWidth = initialWidth;
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    const cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };
    const applyWidth = width => {
      const clamped = Math.max(MIN_RAW_COLUMN_WIDTH, width);
      latestWidth = clamped;
      const widthPx = `${clamped}px`;
      headerCell.style.width = widthPx;
      headerCell.style.minWidth = widthPx;
      headerCell.style.maxWidth = widthPx;
      cells.forEach(cell => {
        if (cell instanceof HTMLElement) {
          cell.style.width = widthPx;
          cell.style.minWidth = widthPx;
        }
      });
    };
    const onPointerMove = moveEvent => {
      if (typeof moveEvent.clientX !== 'number') {
        return;
      }
      const delta = moveEvent.clientX - startX;
      applyWidth(initialWidth + delta);
    };
    const onPointerUp = () => {
      cleanup();
      this.persistRawColumnWidth(headerKey, latestWidth);
    };

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
  }

  setRawDataVisibility(visible) {
    const nextVisible = typeof visible === 'boolean' ? visible : true;
    this.setState({ isRawDataVisible: nextVisible });
    return true;
  }

  setRawDataFilterValue(value, wholeWord) {
    this.handleRawDataFilterChange(value || '');
    if (typeof wholeWord === 'boolean') {
      this.handleRawDataWholeWordChange(wholeWord);
    }
    return true;
  }

  setRawDataWholeWordValue(wholeWord) {
    if (typeof wholeWord !== 'boolean') return false;
    this.handleRawDataWholeWordChange(wholeWord);
    return true;
  }

  setRawDataSortState(column, direction) {
    if (!column) {
      this.setState({ rawDataSort: null });
      return true;
    }
    const normalizedDirection = direction === 'descending' ? 'descending' : 'ascending';
    this.setState({ rawDataSort: { key: column, direction: normalizedDirection } });
    return true;
  }

  focusRawDataPanel(options = {}) {
    if (!this.state.csvData) {
      return false;
    }
    this.setRawDataVisibility(true);
    const focusSearch = options && options.focusSearch === true;
    const highlight = options && options.highlight !== false;

    this.waitForNextFrame().then(() => {
      const panel = this.querySelector('[data-raw-panel]');
      if (!panel) {
        return;
      }
      if (typeof panel.scrollIntoView === 'function') {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (highlight) {
        panel.classList.add('raw-panel--focused');
        if (this.rawPanelHighlightTimer) {
          clearTimeout(this.rawPanelHighlightTimer);
        }
        this.rawPanelHighlightTimer = setTimeout(() => {
          panel.classList.remove('raw-panel--focused');
          this.rawPanelHighlightTimer = null;
        }, 1800);
      }
      if (focusSearch) {
        const searchInput = panel.querySelector('[data-raw-search]');
        if (searchInput && typeof searchInput.focus === 'function') {
          searchInput.focus();
        }
      }
    });

    return true;
  }

  async handleRawDataSave(trigger) {
    if (!this.hasPendingRawEdits()) {
      return;
    }
    if (this.state.rawDataView !== 'cleaned') {
      this.addProgress('Please switch to the cleaned dataset before saving inline edits.', 'error');
      return;
    }
    const button =
      trigger instanceof HTMLElement ? trigger : this.querySelector('[data-raw-save]');
    let originalLabel = null;
    if (button) {
      originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Saving...';
      button.classList.add('opacity-60');
    }
    try {
      const updatedRows = this.applyPendingRawEditsToDataset();
      if (!updatedRows) {
        this.addProgress('Cannot apply edits because the dataset is unavailable.', 'error');
        return;
      }
      this.addProgress('Applying inline spreadsheet edits to the dataset...');
      const result = await this.rebuildAfterDataChange(
        updatedRows,
        'Inline spreadsheet edits saved; refreshing analysis.'
      );
      if (!result?.success) {
        this.addProgress(
          result?.error || 'Failed to refresh analysis after applying inline edits.',
          'error'
        );
        return;
      }
      this.clearPendingRawEdits();
      this.addProgress('Inline edits saved successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addProgress(`Failed to save inline edits: ${message}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        if (originalLabel !== null) {
          button.textContent = originalLabel;
        }
        button.classList.remove('opacity-60');
        this.updateRawEditControls();
      }
    }
  }

  handleRawDataDiscard() {
    if (!this.hasPendingRawEdits()) {
      return;
    }
    this.discardPendingRawEdits();
    this.addProgress('Inline edits discarded.');
  }

  async rebuildAfterDataChange(newData, progressMessage) {
    if (!this.state.csvData) {
      return { success: false, error: 'No dataset is loaded yet.' };
    }
    const existingPlans = this.state.analysisCards.map(card => card.plan);
    const newCsvData = { ...this.state.csvData, data: newData };
    const datasetId = this.getCurrentDatasetId();
    if (newCsvData.metadata) {
      newCsvData.metadata = {
        ...newCsvData.metadata,
        cleanedRowCount: newData.length,
        datasetId,
      };
    } else {
      newCsvData.metadata = { cleanedRowCount: newData.length, datasetId };
    }
    newCsvData.metadata = this.updateMetadataContext(newCsvData.metadata, newData);
    const newProfiles = profileData(newData);
    this.setState({
      csvData: newCsvData,
      columnProfiles: newProfiles,
      analysisCards: [],
      finalSummary: null,
      highlightedCardId: null,
      csvMetadata: newCsvData.metadata || this.state.csvMetadata || null,
      currentDatasetId: datasetId,
    });
    this.clearPendingRawEdits();
    if (progressMessage) {
      this.addProgress(progressMessage);
    }
    this.addProgress('Recomputing analysis after data update...');
    try {
      const regeneratedCards = await this.runAnalysisPipeline(existingPlans, newCsvData, true);
      if (regeneratedCards.length) {
        const finalSummary = await generateFinalSummary(
          this.state.analysisCards,
          this.settings,
          newCsvData.metadata || this.state.csvMetadata || null
        );
        this.setState({ finalSummary });
        this.addProgress('Updated overall summary generated.');
      } else {
        this.addProgress('No existing cards were regenerated; create new analyses if needed.');
      }
      return {
        success: true,
        message: null,
      };
    } catch (error) {
      const message = `Failed to rebuild analysis after data change: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.addProgress(message, 'error');
      return { success: false, error: message };
    }
  }

  async removeRawDataRows(domAction) {
    if (!this.state.csvData || !Array.isArray(this.state.csvData.data)) {
      return { success: false, error: 'No dataset loaded; please upload a CSV first.' };
    }
    const {
      column,
      values,
      operator,
      matchMode,
      caseSensitive,
      rowIndex,
      rowIndices,
    } = domAction || {};
    const dataRows = this.state.csvData.data;
    if (!dataRows.length) {
      return { success: true, message: 'No rows available in the raw data table.' };
    }

    const requestedRowIndices = [];
    if (Number.isInteger(rowIndex)) {
      requestedRowIndices.push(rowIndex);
    }
    if (Array.isArray(rowIndices)) {
      for (const idx of rowIndices) {
        if (Number.isInteger(idx)) {
          requestedRowIndices.push(idx);
        }
      }
    }

    if (!column && requestedRowIndices.length === 0) {
      return { success: false, error: 'Please specify a column or provide rowIndex / rowIndices to remove rows.' };
    }

    if (column) {
      const mode = (operator || matchMode || 'equals').toLowerCase();
      const caseSensitiveMatch = caseSensitive === true;
      const rawValues =
        values === undefined || values === null
          ? []
          : Array.isArray(values)
          ? values
          : [values];

      if (mode !== 'is_empty' && rawValues.length === 0) {
        return { success: false, error: 'Please provide one or more values to match when removing rows.' };
      }

      const normalise = value => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        return caseSensitiveMatch ? stringValue : stringValue.toLowerCase();
      };

      const targetValues = rawValues.map(normalise);

      let removedCount = 0;
      const filtered = dataRows.filter(row => {
        const cellValue = row?.[column];
        const normalisedCell = normalise(cellValue);
        let isMatch = false;
        switch (mode) {
          case 'is_empty':
            isMatch = normalisedCell.length === 0;
            break;
          case 'contains':
            isMatch = targetValues.some(value => normalisedCell.includes(value));
            break;
          case 'starts_with':
            isMatch = targetValues.some(value => normalisedCell.startsWith(value));
            break;
          case 'ends_with':
            isMatch = targetValues.some(value => normalisedCell.endsWith(value));
            break;
          case 'equals':
          case 'equal':
          default:
            isMatch = targetValues.includes(normalisedCell);
            break;
        }
        if (isMatch) {
          removedCount += 1;
          return false;
        }
        return true;
      });

      if (removedCount === 0) {
        return {
          success: true,
          message: `No rows matched the criteria on column "${column}".`,
        };
      }

      const operatorLabelRaw = mode === 'equal' ? 'equals' : mode;
      const operatorLabel = operatorLabelRaw.replace(/_/g, ' ');
      const valuesPreview =
        mode === 'is_empty'
          ? ''
          : rawValues
              .slice(0, 3)
              .map(v => `"${v}"`)
              .join(', ') + (rawValues.length > 3 ? ', …' : '');
      const conditionDescription =
        mode === 'is_empty'
          ? 'that are empty'
          : `${operatorLabel} ${valuesPreview}`;
      const progressMessage = `Removed ${removedCount.toLocaleString()} row(s) where "${column}" ${conditionDescription}.`;

      const result = await this.rebuildAfterDataChange(filtered, progressMessage);
      return {
        success: result.success,
        message: null,
        error: result.success ? undefined : result.error,
      };
    }

    // Fallback: remove by explicit row index list
    const maxIndex = dataRows.length - 1;
    const uniqueValidIndices = Array.from(
      new Set(
        requestedRowIndices.filter(idx => idx >= 0 && idx <= maxIndex)
      )
    ).sort((a, b) => a - b);

    if (!uniqueValidIndices.length) {
      return {
        success: false,
        error: 'Unable to remove rows because the specified row indices are out of range.',
      };
    }

    let removedCount = 0;
    const indexSet = new Set(uniqueValidIndices);
    const filtered = dataRows.filter((_, index) => {
      if (indexSet.has(index)) {
        removedCount += 1;
        return false;
      }
      return true;
    });
    if (removedCount === 0) {
      return {
        success: true,
        message: 'No rows were removed because none of the provided indices matched existing rows.',
      };
    }

    const humanReadable = uniqueValidIndices
      .slice(0, 5)
      .map(idx => `#${(idx + 1).toLocaleString()}`)
      .join(', ') + (uniqueValidIndices.length > 5 ? ', …' : '');
    const progressMessage = `Removed ${removedCount.toLocaleString()} row(s) at positions ${humanReadable}.`;

    const result = await this.rebuildAfterDataChange(filtered, progressMessage);
    return {
      success: result.success,
      message: null,
      error: result.success ? undefined : result.error,
    };
  }

  bindEvents() {
    const fileInput = this.querySelector('#file-upload-input');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const target = e.target;
        if (!this.hasConfiguredApiKey()) {
          this.ensureApiCredentials('API key is required before uploading files.');
          if (target && typeof target.value === 'string') {
            target.value = '';
          }
          return;
        }
        if (target && target.files && target.files[0]) {
          this.handleFileInput(target.files[0]);
          target.value = '';
        }
      });
    }

    const uploadDropZone = this.querySelector('[data-drop-zone]');
    if (uploadDropZone) {
      let dragDepth = 0;
      const toggleDragActive = isActive => {
        uploadDropZone.classList.toggle('border-blue-500', Boolean(isActive));
        uploadDropZone.classList.toggle('bg-slate-100', Boolean(isActive));
        uploadDropZone.classList.toggle('border-slate-300', !isActive);
      };
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadDropZone.addEventListener(eventName, event => {
          event.preventDefault();
          event.stopPropagation();
          if (!this.hasConfiguredApiKey()) {
            if (eventName === 'drop') {
              this.ensureApiCredentials('Set your API key in settings before uploading files.');
            }
            if (eventName === 'drop' || eventName === 'dragleave') {
              dragDepth = 0;
              toggleDragActive(false);
            }
            return;
          }

          if (eventName === 'dragenter') {
            dragDepth += 1;
            toggleDragActive(true);
          } else if (eventName === 'dragover') {
            toggleDragActive(true);
          } else if (eventName === 'dragleave') {
            dragDepth = Math.max(dragDepth - 1, 0);
            if (dragDepth === 0) toggleDragActive(false);
          } else if (eventName === 'drop') {
            dragDepth = 0;
            toggleDragActive(false);
          }
        });
      });
      uploadDropZone.addEventListener('drop', event => {
        const file = event.dataTransfer?.files?.[0];
        if (!this.hasConfiguredApiKey()) {
          return;
        }
        if (file) this.handleFileInput(file);
      });
    }

    this.querySelectorAll('[data-new-session]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.handleNewSession();
      });
    });

    this.querySelectorAll('[data-open-memory]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openMemoryPanel();
      });
    });

    this.querySelectorAll('[data-toggle-history]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toggleHistoryPanel();
      });
    });

    this.querySelectorAll('[data-toggle-aside]').forEach(btn => {
      const mode = btn.dataset.toggleAside;
      btn.addEventListener('click', () => {
        if (mode === 'show') {
          this.toggleAsideVisibility(true);
        } else if (mode === 'hide') {
          this.toggleAsideVisibility(false);
        } else {
          this.toggleAsideVisibility();
        }
      });
    });

    this.querySelectorAll('[data-toggle-data-prep]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleDataPrepDebugPanel());
    });

    const asideResizer = this.querySelector('[data-aside-resizer]');
    if (asideResizer) {
      asideResizer.addEventListener('mousedown', event => this.handleAsideMouseDown(event));
    }

    const historyOverlay = this.querySelector('[data-history-overlay]');
    if (historyOverlay) {
      historyOverlay.addEventListener('click', () => this.toggleHistoryPanel(false));
    }

    const historyPanel = this.querySelector('[data-history-panel]');
    if (historyPanel) {
      historyPanel.addEventListener('click', event => event.stopPropagation());
    }

    this.querySelectorAll('[data-history-close]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleHistoryPanel(false));
    });

    this.querySelectorAll('[data-history-load]').forEach(btn => {
      const reportId = btn.dataset.historyLoad;
      btn.addEventListener('click', () => {
        this.handleLoadReport(reportId);
      });
    });

    this.querySelectorAll('[data-history-delete]').forEach(btn => {
      const reportId = btn.dataset.historyDelete;
      btn.addEventListener('click', () => {
        this.handleDeleteReport(reportId);
      });
    });

    this.querySelectorAll('[data-show-card]').forEach(btn => {
      const rawCardId = btn.dataset.showCard || null;
      const fallbackTitle = btn.dataset.showCardTitle || null;
      btn.addEventListener('click', () => {
        if (!rawCardId && !fallbackTitle) {
          return;
        }
        const { cardId, card, fallbackTitle: resolvedTitle } = this.resolveCardReference(
          rawCardId,
          fallbackTitle
        );
        if (cardId) {
          const highlighted = this.highlightCard(cardId, { scrollIntoView: true });
          if (highlighted) {
            return;
          }
        }
        const label = card?.plan?.title || resolvedTitle || rawCardId || 'card';
        this.addProgress(`Could not find card ${label} to show.`, 'error');
      });
    });

    this.querySelectorAll('[data-chat-quick-action]').forEach(btn => {
      const payloadText = btn.dataset.chatQuickAction || '';
      btn.addEventListener('click', async () => {
        if (!payloadText || btn.disabled) {
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(payloadText);
        } catch (error) {
          this.addProgress('Quick action payload invalid.', 'error');
          return;
        }
        const domAction =
          parsed && typeof parsed === 'object' && typeof parsed.domAction === 'object'
            ? parsed.domAction
            : null;
        if (!domAction) {
          this.addProgress('Quick action is missing a DOM command.', 'error');
          return;
        }
        btn.disabled = true;
        try {
          const result = await this.handleDomAction(domAction);
          if (result?.message) {
            this.addProgress(result.message);
          } else if (!result?.success && result?.error) {
            this.addProgress(result.error, 'error');
          }
        } catch (error) {
          this.addProgress(
            `Quick action failed: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
        } finally {
          btn.disabled = false;
        }
      });
    });

    const chatForm = this.querySelector('#chat-form');
    const chatInput = this.querySelector('#chat-input');
    if (chatInput) {
      chatInput.value = this.chatDraft || '';
    }
    const submitChatMessage = () => {
      if (!chatInput || chatInput.disabled) return;
      const value = chatInput.value || this.chatDraft || '';
      if (!value.trim()) return;
      this.chatDraft = '';
      chatInput.value = '';
      this.handleChatSubmit(value);
    };
    if (chatForm) {
      chatForm.addEventListener('submit', e => {
        e.preventDefault();
        submitChatMessage();
      });
    }
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        this.chatDraft = chatInput.value;
      });
      chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submitChatMessage();
        }
      });
    }

    this.querySelectorAll('[data-toggle-settings]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setState(prev => ({ showSettings: !prev.showSettings }));
      });
    });

    this.querySelectorAll('[data-chart-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.card;
        const type = btn.dataset.chartType;
        if (cardId && type) {
          this.handleChartTypeChange(cardId, type);
        }
      });

      // Keyboard support: Enter/Space = activate; ArrowLeft/ArrowRight = move focus across options
      btn.addEventListener('keydown', event => {
        const key = event.key;
        if (key === 'Enter' || key === ' ') {
          event.preventDefault();
          btn.click();
          return;
        }
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
          event.preventDefault();
          const cardId = btn.dataset.card;
          if (!cardId) return;

          const cssEscape = value => {
            try {
              return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                ? CSS.escape(value)
                : String(value).replace(/"/g, '\\"');
            } catch {
              return String(value);
            }
          };

          const selector = `[data-chart-type][data-card="\${cssEscape(cardId)}"]`;
          const all = Array.from(this.querySelectorAll(selector));
          if (!all.length) return;
          const index = all.indexOf(btn);
          const dir = key === 'ArrowRight' ? 1 : -1;
          const next = all[(index + dir + all.length) % all.length];
          if (next && typeof next.focus === 'function') next.focus();
        }
      });
    });

    this.querySelectorAll('[data-export-menu-toggle]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleExportMenu(btn);
      });
    });

    this.querySelectorAll('[data-export-card]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        const cardId = btn.dataset.card;
        const format = btn.dataset.exportCard;
        if (cardId && format) {
          this.handleCardExport(cardId, format);
        }
      });
    });

    this.querySelectorAll('[data-toggle-selection]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.toggleSelection;
        if (cardId) {
          this.toggleSelectionDetails(cardId);
        }
      });
    });

    this.querySelectorAll('[data-toggle-data]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.toggleData;
        if (cardId) {
          this.handleToggleDataVisibility(cardId);
        }
      });
    });

    this.querySelectorAll('[data-top-n]').forEach(select => {
      select.addEventListener('change', event => {
        const cardId = select.dataset.topN;
        if (!cardId) return;
        const value = event.target.value;
        const topN = value === 'all' ? null : parseInt(value, 10);
        this.handleTopNChange(cardId, Number.isNaN(topN) ? null : topN);
      });
    });

    this.querySelectorAll('[data-hide-others]').forEach(input => {
      input.addEventListener('change', event => {
        const cardId = input.dataset.hideOthers;
        if (!cardId) return;
        this.handleHideOthersChange(cardId, event.target.checked);
      });
    });

    this.querySelectorAll('[data-reset-zoom]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.resetZoom;
        if (cardId) {
          this.handleResetZoom(cardId);
        }
      });
    });

    this.querySelectorAll('[data-clear-selection]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.clearSelection;
        if (cardId) {
          this.handleClearSelection(cardId);
        }
      });
    });

    this.querySelectorAll('[data-legend-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.legendToggle;
        const encoded = btn.dataset.legendLabel || '';
        if (cardId) {
          this.handleLegendToggle(cardId, decodeURIComponent(encoded));
        }
      });
    });

    bindRawDataPanelEventsHelper(this);
  }

  restoreFocus() {
    if (!this.pendingFocus) return;
    const { focusKey, useDataset, selectionStart, selectionEnd, scrollTop } = this.pendingFocus;
    let target = null;
    if (useDataset) {
      target = this.querySelector(`[data-focus-key="${focusKey}"]`);
    } else if (focusKey) {
      target = this.querySelector(`#${focusKey}`);
    }
    if (target) {
      if ('disabled' in target && target.disabled) {
        return;
      }
      const canSelect =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (typeof target.focus === 'function') {
        try {
          target.focus({ preventScroll: true });
        } catch (error) {
          target.focus();
        }
      }
      if (canSelect && selectionStart !== null && selectionEnd !== null) {
        try {
          target.setSelectionRange(selectionStart, selectionEnd);
        } catch (error) {
          /* ignore selection errors */
        }
      }
      if (canSelect && scrollTop !== null && typeof scrollTop === 'number') {
        target.scrollTop = scrollTop;
      }
    }
    this.pendingFocus = null;
  }

  scrollConversationToBottom(container = this.conversationLogElement) {
    if (!container) return;
    this.shouldAutoScrollConversation = true;
    const scroll = () => {
      container.scrollTop = container.scrollHeight;
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scroll);
    } else {
      setTimeout(scroll, 0);
    }
  }

  captureConversationScrollPosition() {
    if (this.shouldAutoScrollConversation) {
      this.savedConversationScroll = null;
      return;
    }
    const container = this.conversationLogElement;
    if (!container) {
      this.savedConversationScroll = null;
      return;
    }
    this.savedConversationScroll = {
      top: container.scrollTop,
      height: container.scrollHeight,
    };
  }

  restoreConversationScrollPosition() {
    const container = this.conversationLogElement;
    if (!container) {
      this.savedConversationScroll = null;
      return;
    }
    if (this.shouldAutoScrollConversation || !this.savedConversationScroll) {
      this.savedConversationScroll = null;
      return;
    }
    const { top, height } = this.savedConversationScroll;
    const currentHeight = container.scrollHeight;
    const delta = currentHeight - height;
    const targetTop = Math.max(0, top + (Number.isFinite(delta) ? delta : 0));
    container.scrollTop = targetTop;
    this.savedConversationScroll = null;
  }

  isConversationNearBottom(threshold = 48) {
    const container = this.conversationLogElement;
    if (!container) {
      return true;
    }
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    return distanceFromBottom <= threshold;
  }

  captureMainScrollPosition() {
    const container = this.mainScrollElement || this.querySelector('[data-main-scroll]');
    if (container) {
      this.savedMainScrollTop = container.scrollTop;
    }
  }

  setupMainScrollElement() {
    const container = this.querySelector('[data-main-scroll]');
    this.mainScrollElement = container || null;
  }

  restoreMainScrollPosition() {
    if (!this.mainScrollElement) return;
    if (this.savedMainScrollTop !== null) {
      this.mainScrollElement.scrollTop = this.savedMainScrollTop;
      this.savedMainScrollTop = null;
    }
  }

  setupConversationLogAutoScroll() {
    const container = this.querySelector('[data-conversation-log]');
    if (this.conversationLogElement && this.conversationLogElement !== container) {
      this.conversationLogElement.removeEventListener('scroll', this.handleConversationScroll);
    }
    if (!container) {
      this.conversationLogElement = null;
      return;
    }
    this.conversationLogElement = container;
    container.addEventListener('scroll', this.handleConversationScroll, { passive: true });
    if (this.shouldAutoScrollConversation) {
      this.scrollConversationToBottom(container);
    }
  }

  onConversationScroll(event) {
    const target = event?.target;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    this.shouldAutoScrollConversation = distanceFromBottom <= 48;
  }

  buildConversationTimeline() {
    const normaliseTimestamp = value => {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? new Date() : date;
    };

    const progress = Array.isArray(this.state.progressMessages)
      ? this.state.progressMessages.map(item => ({
          ...item,
          timestamp: normaliseTimestamp(item?.timestamp),
          __kind: 'progress',
        }))
      : [];

    const chat = Array.isArray(this.state.chatHistory)
      ? this.state.chatHistory.map(item => ({
          ...item,
          timestamp: normaliseTimestamp(item?.timestamp),
          __kind: 'chat',
        }))
      : [];

    const combined = [...progress, ...chat];
    combined.sort((a, b) => {
      const timeA = a.timestamp.getTime();
      const timeB = b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      if (a.__kind === b.__kind) {
        return 0;
      }
      return a.__kind === 'chat' ? -1 : 1;
    });
    return combined.slice(-300);
  }

  renderSettingsModal() {
    if (!this.state.showSettings) return '';
    return `
      <div class="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50" data-toggle-settings>
        <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg relative" onclick="event.stopPropagation()">
          <h2 class="text-2xl font-semibold text-slate-900 mb-4">Settings</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">AI Provider</label>
              <select id="settings-provider" class="w-full border border-slate-300 rounded-md px-3 py-2">
                <option value="google" ${this.settings.provider === 'google' ? 'selected' : ''}>Google Gemini</option>
                <option value="openai" ${this.settings.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
              <input type="password" id="settings-gemini-key" class="w-full border border-slate-300 rounded-md px-3 py-2" value="${this.settings.geminiApiKey || ''}" placeholder="Required when using Gemini" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">OpenAI API Key</label>
              <input type="password" id="settings-openai-key" class="w-full border border-slate-300 rounded-md px-3 py-2" value="${this.settings.openAIApiKey || ''}" placeholder="Required when using OpenAI" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Model</label>
              <select id="settings-model" class="w-full border border-slate-300 rounded-md px-3 py-2">
                <option value="gemini-2.5-flash" ${this.settings.model === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
                <option value="gemini-2.5-pro" ${this.settings.model === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro</option>
                <option value="gpt-4o" ${this.settings.model === 'gpt-4o' ? 'selected' : ''}>gpt-4o</option>
                <option value="gpt-4-turbo" ${this.settings.model === 'gpt-4-turbo' ? 'selected' : ''}>gpt-4-turbo</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Language</label>
              <select id="settings-language" class="w-full border border-slate-300 rounded-md px-3 py-2">
                ${['English', 'Mandarin', 'Spanish', 'Japanese', 'French']
                  .map(
                    lang =>
                      `<option value="${lang}" ${
                        this.settings.language === lang ? 'selected' : ''
                      }>${lang}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button class="px-4 py-2 rounded-md border border-slate-300 text-slate-700" data-toggle-settings>Cancel</button>
            <button class="px-4 py-2 rounded-md bg-blue-600 text-white" data-save-settings>Save</button>
          </div>
        </div>
      </div>
    `;
  }

  renderHistoryPanel() {
    if (!this.state.isHistoryPanelOpen) return '';
    const reports = Array.isArray(this.state.reportsList) ? this.state.reportsList : [];
    const formatTimestamp = value => {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime())
        ? 'Unknown'
        : date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const itemsHtml = reports.length
      ? reports
          .map(report => {
            const isCurrent = report.id === CURRENT_SESSION_KEY;
            const title = this.escapeHtml(report.filename || 'Untitled report');
            const updated = formatTimestamp(report.updatedAt);
            const created = formatTimestamp(report.createdAt);
            const badge = isCurrent
              ? '<span class="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Current</span>'
              : '';
            const deleteButton = isCurrent
              ? ''
              : `<button class="px-2 py-1 text-xs text-rose-600 border border-rose-200 rounded-md hover:bg-rose-50" data-history-delete="${this.escapeHtml(
                  report.id
                )}">
                Delete
              </button>`;
            return `
              <li class="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div class="flex-1">
                  <div class="text-sm font-semibold text-slate-900 flex items-center flex-wrap gap-1">${title}${badge}</div>
                  <div class="text-xs text-slate-500">Updated ${this.escapeHtml(updated)} • Created ${this.escapeHtml(created)}</div>
                </div>
                <div class="flex items-center gap-2">
                  ${
                    isCurrent
                      ? '<button class="px-2 py-1 text-xs border border-slate-200 text-slate-400 rounded-md cursor-default" disabled>Current</button>'
                      : `<button class="px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700" data-history-load="${this.escapeHtml(
                          report.id
                        )}">Open</button>`
                  }
                  ${deleteButton}
                </div>
              </li>`;
          })
          .join('')
      : '<li class="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-300 rounded-lg">No saved reports yet. Upload a CSV to generate your first analysis.</li>';
    return `
      <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center px-4" data-history-overlay>
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-history-panel>
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 class="text-xl font-semibold text-slate-900">Analysis History</h2>
            <button class="text-slate-400 hover:text-slate-600" data-history-close aria-label="Close history panel">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="px-5 py-4 overflow-y-auto">
            <ul class="space-y-3">${itemsHtml}</ul>
          </div>
        </div>
      </div>
    `;
  }

  renderAssistantPanel(options = {}) {
    const isApiKeySet = options.isApiKeySet ?? this.hasConfiguredApiKey();
    const timeline = this.buildConversationTimeline();
    const { isBusy, currentView, isThinking } = this.state;

    return renderAssistantPanelView({
      timeline,
      isApiKeySet,
      isBusy,
      isThinking,
      currentView,
      resolveCardReference: (cardId, cardTitle) =>
        this.resolveCardReference(cardId, cardTitle),
      workflowPhase: this.workflowActivePhase,
      isWorkflowActive: Boolean(this.workflowSessionId),
    });
  }

  bindSettingsEvents() {
    const saveBtn = this.querySelector('[data-save-settings]');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', () => {
      const provider = this.querySelector('#settings-provider')?.value || this.settings.provider;
      const geminiApiKey = this.querySelector('#settings-gemini-key')?.value || '';
      const openAIApiKey = this.querySelector('#settings-openai-key')?.value || '';
      const model = this.querySelector('#settings-model')?.value || this.settings.model;
      const language = this.querySelector('#settings-language')?.value || this.settings.language;
      this.handleSettingsSave({
        provider,
        geminiApiKey,
        openAIApiKey,
        model,
        language,
      });
    });
  }

  bindMemoryPanelEvents() {
    bindMemoryPanelEventsHelper(this);
  }

  renderMemoryPanel() {
    if (!this.state.isMemoryPanelOpen) {
      return '';
    }
    const documents = Array.isArray(this.state.memoryPanelDocuments)
      ? this.state.memoryPanelDocuments
      : [];
    const query =
      typeof this.state.memoryPanelQuery === 'string' ? this.state.memoryPanelQuery : '';
    const results = Array.isArray(this.state.memoryPanelResults)
      ? this.state.memoryPanelResults
      : [];
    const isSearching = Boolean(this.state.memoryPanelIsSearching);
    const highlightedId = this.state.memoryPanelHighlightedId || null;
    const memoryUsage = this.calculateMemoryUsage(documents);
    const modelStatus = this.memoryVectorReady ? 'Model ready' : 'Loading memory model...';

    return renderMemoryPanelView({
      documents,
      query,
      results,
      isSearching,
      highlightedId,
      memoryUsage,
      capacityKb: MEMORY_CAPACITY_KB,
      modelStatus,
      isLoading: Boolean(this.state.memoryPanelIsLoading),
      loadError: this.state.memoryPanelLoadError,
      isModelReady: Boolean(this.memoryVectorReady),
    });
  }

  renderAnalysisCard(card) {
    return renderAnalysisCardView({ app: this, card, colors: COLORS });
  }

  getDatasetViewOptions() {
    return [
      { key: 'cleaned', label: 'Cleaned Data' },
      { key: 'original', label: 'Original Data' },
    ];
  }

  getDatasetViewContext() {
    const { csvData, originalCsvData } = this.state;
    if (!csvData || !Array.isArray(csvData.data) || !csvData.data.length) {
      return null;
    }
    const metadata = this.state.csvMetadata || csvData.metadata || null;
    const rawDataView = this.state.rawDataView || 'cleaned';
    const originalAvailable =
      Boolean(originalCsvData) && Array.isArray(originalCsvData.data) && originalCsvData.data.length > 0;
    const resolvedView = rawDataView === 'original' && originalAvailable ? 'original' : 'cleaned';
    const activeDataset = resolvedView === 'original' ? originalCsvData : csvData;
    const allRows = Array.isArray(activeDataset?.data) ? activeDataset.data : [];
    const headers = allRows.length ? Object.keys(allRows[0]) : [];
    const cleanedCount = metadata?.cleanedRowCount ?? csvData.data.length;
    const originalCount =
      metadata?.originalRowCount ?? (originalCsvData?.data?.length || cleanedCount);
    const removedCount = Math.max(originalCount - cleanedCount, 0);
    const contextRows = Array.isArray(metadata?.contextRows)
      ? metadata.contextRows
      : Array.isArray(metadata?.leadingRows)
      ? metadata.leadingRows
      : [];
    const contextPreview = contextRows
      .map(row => row.filter(Boolean).join(' | '))
      .find(Boolean);
    const contextCount = metadata?.contextRowCount || contextRows.length || 0;
    const datasetLabel =
      resolvedView === 'original'
        ? 'Original data sample (before cleaning)'
        : 'Cleaned data sample (ready for analysis)';

    return {
      metadata,
      rawDataView,
      originalAvailable,
      resolvedView,
      activeDataset,
      allRows,
      headers,
      cleanedCount,
      originalCount,
      removedCount,
      contextPreview: contextPreview || null,
      contextCount,
      datasetLabel,
    };
  }

  renderDataPreviewPanel() {
    return renderDataPreviewPanelView();
  }

  renderDataPrepDebugPanel() {
    return renderDataPrepDebugPanelView({
      plan: this.state.dataPreparationPlan,
      originalSample: this.state.initialDataSample,
      transformedSample:
        this.state.csvData && Array.isArray(this.state.csvData.data)
          ? this.state.csvData.data.slice(0, 20)
          : [],
      isVisible: this.state.isDataPrepDebugVisible,
    });
  }

  renderRawDataPanel() {
    return renderRawDataPanelView({
      app: this,
      rowsPerPage: RAW_ROWS_PER_PAGE,
    });
  }

  render() {
    const { isBusy, csvData, analysisCards, finalSummary } = this.state;
    const isApiKeySet = this.hasConfiguredApiKey();
    const disableUpload = isBusy || !isApiKeySet;
    const cardsHtml = analysisCards.map(card => this.renderAnalysisCard(card)).join('');
    const cardsSection = renderAnalysisSection({
      isBusy,
      hasCsv: Boolean(csvData),
      cardsHtml,
      progressMessages: this.state.progressMessages || [],
    });
    const dataPreviewPanel = this.renderDataPreviewPanel();
    const dataPrepDebugPanel = this.renderDataPrepDebugPanel();
    const dataPrepDebugHtml = dataPrepDebugPanel ? `<div class="mt-6">${dataPrepDebugPanel}</div>` : '';
    const rawDataPanel = this.renderRawDataPanel();

    const summaryBlock = renderFinalSummary(finalSummary, this.state.generatedReport || null);
    const workflowTimelineHtml = renderWorkflowTimeline(
      this.state.workflowTimeline,
      this.state.workflowPlan
    );

    let mainContent;
    if (!csvData) {
      if (!isApiKeySet) {
        mainContent = `<div class="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-white">
            <svg class="w-16 h-16 text-slate-400 mb-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6.364-3.636l-1.414 1.414M21 12h-2M4 12H2m15.636-6.364l-1.414-1.414M6.364 6.364L4.95 4.95M12 3V1m0 18v-2M4.95 19.05l1.414-1.414m12.728 0l-1.414-1.414M12 6a6 6 0 100 12 6 6 0 000-12z"></path></svg>
            <h3 class="text-xl font-semibold text-slate-800">API Key Required</h3>
            <p class="mt-2 max-w-md mx-auto text-sm text-slate-500">
              Add your Google Gemini API key in the settings panel to unlock CSV uploads and AI analysis features.
            </p>
            <button class="mt-6 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" data-toggle-settings>
              Open Settings
            </button>
            <p class="mt-6 text-xs text-slate-400">Your CSV stays private—processing happens in your browser.</p>
          </div>`;
      } else {
        mainContent = `<div class="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-blue-500 transition-colors" data-drop-zone>
            <p class="text-xl text-slate-500 mb-4">Drag and drop your CSV here or use the button above.</p>
            <p class="text-sm text-slate-400">All processing happens locally in your browser.</p>
          </div>`;
      }
    } else {
      mainContent = `
        ${summaryBlock}
        ${dataPreviewPanel}
        <div class="space-y-6">${cardsSection}</div>
        ${dataPrepDebugHtml}
        ${rawDataPanel}
      `;
    }

    const disableNewSession = isBusy || this.state.isThinking;
    const isAsideVisible = this.state.isAsideVisible !== false;
    const asideWidth = this.state.asideWidth || MIN_ASIDE_WIDTH;
    const assistantPanelHtml = isAsideVisible
      ? `<div class="hidden md:block w-1.5 cursor-col-resize bg-slate-300 hover:bg-blue-400 transition-colors duration-200" data-aside-resizer></div>
         <aside class="w-full md:w-auto bg-white flex flex-col h-full border-l border-slate-200" style="width:${asideWidth}px">
           ${this.renderAssistantPanel({ isApiKeySet })}
         </aside>`
      : '';
    const showAssistantButton = isAsideVisible
      ? ''
      : `<button class="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors" data-toggle-aside="show">
           Show Assistant
         </button>`;

    this.innerHTML = `
      <div class="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800">
        <main class="flex-1 overflow-hidden flex flex-col">
          <header class="flex-shrink-0 px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
            <h1 class="text-2xl md:text-3xl font-bold text-slate-900">CSV Data Analysis Agent</h1>
            <div class="flex items-center gap-2 flex-wrap justify-end">
              <button class="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed" data-new-session ${disableNewSession ? 'disabled' : ''}>
                New Session
              </button>
              <button class="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100" data-toggle-history>
                History
              </button>
              <button class="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100" data-toggle-settings>
                Settings
              </button>
              ${showAssistantButton}
              <label class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 ${disableUpload ? 'opacity-60 cursor-not-allowed' : ''}">
                Upload CSV
                <input id="file-upload-input" type="file" accept=".csv" class="hidden" ${disableUpload ? 'disabled' : ''} />
              </label>
            </div>
          </header>
	        <div class="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-6" data-main-scroll>
	            ${workflowTimelineHtml}
	            ${mainContent}
          </div>
        </main>
        ${assistantPanelHtml}
      </div>
      ${this.renderSettingsModal()}
      ${this.renderHistoryPanel()}
      ${this.renderMemoryPanel()}
    `;

    this.bindEvents();
    this.bindSettingsEvents();
    this.bindMemoryPanelEvents();
    this.renderCharts();
    this.setupMainScrollElement();
    this.restoreMainScrollPosition();
    this.setupConversationLogAutoScroll();
    this.restoreConversationScrollPosition();
    this.restoreFocus();
  }
}

Object.assign(CsvDataAnalysisApp.prototype, rawDataEditingMethods, chartRenderingMethods);

customElements.define('csv-data-analysis-app', CsvDataAnalysisApp);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found; unable to initialise the application.');
}
root.innerHTML = '<csv-data-analysis-app></csv-data-analysis-app>';

const appElement = root.querySelector('csv-data-analysis-app');
const messageOrigin = window.location.origin;

const notifyOpenerReady = () => {
  if (!window.opener || window.opener.closed) return;
  try {
    window.opener.postMessage({ type: 'ready' }, messageOrigin);
  } catch (error) {
    console.warn('Unable to notify opener about readiness:', error);
  }
};

if (document.readyState === 'complete') {
  notifyOpenerReady();
} else {
  window.addEventListener('load', () => {
    notifyOpenerReady();
  });
}

const sanitiseFileStem = input => {
  const stem = String(input || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return stem || 'table-export';
};

let lastReceivedSignature = null;

window.addEventListener('message', event => {
  if (event.origin !== messageOrigin) return;
  const payload = event.data;
  if (!payload || payload.type !== 'table_csv' || typeof payload.csv !== 'string') return;
  if (!appElement || typeof appElement.handleFileInput !== 'function') {
    console.warn('CSV payload received before app initialised; ignoring.');
    return;
  }

  const signature = `${payload.header ?? ''}::${payload.csv.length}`;
  if (signature === lastReceivedSignature) {
    return;
  }
  lastReceivedSignature = signature;

  const fileStem = sanitiseFileStem(payload.header);
  const fileName = `${fileStem}.csv`;
  const blob = new Blob([payload.csv], { type: 'text/csv' });
  let file;
  if (typeof File === 'function') {
    file = new File([blob], fileName, { type: 'text/csv' });
  } else {
    blob.name = fileName;
    file = blob;
  }
  try {
    appElement.handleFileInput(file);
  } catch (error) {
    console.error('Failed to ingest CSV payload from postMessage:', error);
  }
});
