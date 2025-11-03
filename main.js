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

const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
const BORDER_COLORS = COLORS.map(color => `${color}B3`);
const BG_COLORS = COLORS.map(color => `${color}80`);
const HIGHLIGHT_COLOR = '#3b82f6';
const HIGHLIGHT_BORDER_COLOR = '#2563eb';
const DESELECTED_COLOR = 'rgba(107, 114, 128, 0.2)';
const DESELECTED_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)';
const SUPPORTED_CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'scatter']);
const SUPPORTED_AGGREGATIONS = new Set(['sum', 'count', 'avg']);
const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;
let zoomPluginRegistered = false;
const ENABLE_MEMORY_FEATURES = false;
const ENABLE_PIPELINE_REPAIR = false;

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
      columnProfiles: [],
      analysisCards: [],
      finalSummary: null,
      aiCoreAnalysisSummary: null,
      chatHistory: [],
      highlightedCardId: null,
      showSettings: false,
      isRawDataVisible: true,
      rawDataFilter: '',
      rawDataWholeWord: false,
      rawDataSort: null,
      rawDataView: 'cleaned',
      originalCsvData: null,
      csvMetadata: null,
      currentDatasetId: null,
      lastAuditReport: null,
      lastRepairSummary: null,
      lastRepairTimestamp: null,
      reportsList: [],
      isHistoryPanelOpen: false,
      isAsideVisible: true,
      asideWidth: defaultAsideWidth,
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
    this.boundDocumentClick = this.onDocumentClick.bind(this);
    this.pendingRawEdits = new Map();
    this.rawEditDatasetId = this.getCurrentDatasetId();
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
    };

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

  generateDatasetId(fileName, metadata = null) {
    const baseName = (fileName || 'dataset').toLowerCase().replace(/\s+/g, '-');
    const totalRows =
      metadata?.originalRowCount ??
      metadata?.totalRowsBeforeFilter ??
      this.state.csvData?.data?.length ??
      0;
    const headerHash = metadata?.headerRow
      ? metadata.headerRow.join('|').toLowerCase().slice(0, 32)
      : 'noheader';
    return `${baseName}-${totalRows}-${headerHash}`;
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
    this.captureMainScrollPosition();
    this.state = { ...prevState, ...nextPartial };
    this.captureFocus();
    this.scheduleRender();
    this.scheduleSessionSave();
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
    const newMessage = {
      text,
      type,
      timestamp,
    };
    const chatMessage = {
      sender: 'system',
      text,
      timestamp,
      type: type === 'error' ? 'system_error' : 'system_progress',
    };
    this.setState(prev => ({
      progressMessages: [...prev.progressMessages, newMessage],
      chatHistory: [...prev.chatHistory, chatMessage],
    }));
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
    const { plan, aggregatedData, topN } = card;
    if (plan.chartType === 'scatter' || !plan.groupByColumn) {
      return [...aggregatedData];
    }
    let data = [...aggregatedData];
    if (topN) {
      const valueKey = this.getCardValueKey(card);
      data = applyTopNWithOthers(data, plan.groupByColumn, valueKey, topN);
    }
    return data;
  }

  getCardDisplayData(card) {
    const { plan, hideOthers, hiddenLabels = [] } = card;
    if (plan.chartType === 'scatter') {
      return [...card.aggregatedData];
    }
    const groupKey = plan.groupByColumn;
    if (!groupKey) {
      return [...card.aggregatedData];
    }
    let data = this.getCardLegendData(card);
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
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  normalizeRawCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/\u00a0/g, ' ').replace(/\r?\n/g, ' ').trim();
  }

  normaliseComparisonValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  ensureRawEditContext() {
    const datasetId = this.getCurrentDatasetId();
    if (this.rawEditDatasetId !== datasetId) {
      this.pendingRawEdits = new Map();
      this.rawEditDatasetId = datasetId;
      this.updateRawEditControls();
    }
  }

  clearPendingRawEdits() {
    this.pendingRawEdits = new Map();
    this.rawEditDatasetId = this.getCurrentDatasetId();
    this.updateRawEditControls();
  }

  hasPendingRawEdits() {
    if (!this.pendingRawEdits || !(this.pendingRawEdits instanceof Map)) {
      return false;
    }
    for (const entry of this.pendingRawEdits.values()) {
      if (entry && Object.keys(entry).length > 0) {
        return true;
      }
    }
    return false;
  }

  getPendingRawEditCount() {
    if (!this.pendingRawEdits || !(this.pendingRawEdits instanceof Map)) {
      return 0;
    }
    let count = 0;
    for (const entry of this.pendingRawEdits.values()) {
      count += Object.keys(entry || {}).length;
    }
    return count;
  }

  getPendingRawRow(rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return null;
    }
    const key = String(rowIndex);
    return this.pendingRawEdits?.get(key) || null;
  }

  getPendingRawValue(rowIndex, column, fallback) {
    const rowUpdates = this.getPendingRawRow(rowIndex);
    if (rowUpdates && Object.prototype.hasOwnProperty.call(rowUpdates, column)) {
      return rowUpdates[column];
    }
    return fallback;
  }

  getBaseRawValue(rowIndex, column) {
    const dataRows = this.state?.csvData?.data;
    if (!Array.isArray(dataRows) || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= dataRows.length) {
      return '';
    }
    const baseValue = dataRows[rowIndex]?.[column];
    if (baseValue === null || baseValue === undefined) {
      return '';
    }
    return baseValue;
  }

  setPendingRawEdit(rowIndex, column, newValue) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || !column) {
      return 'unchanged';
    }
    const key = String(rowIndex);
    const baseValue = this.getBaseRawValue(rowIndex, column);

    const baseComparison = this.normaliseComparisonValue(baseValue);
    const newComparison = this.normaliseComparisonValue(newValue);

    if (newComparison === baseComparison) {
      if (this.pendingRawEdits?.has(key)) {
        const existing = { ...this.pendingRawEdits.get(key) };
        if (Object.prototype.hasOwnProperty.call(existing, column)) {
          delete existing[column];
          if (Object.keys(existing).length === 0) {
            this.pendingRawEdits.delete(key);
          } else {
            this.pendingRawEdits.set(key, existing);
          }
          this.updateRawEditControls();
          return 'removed';
        }
      }
      this.updateRawEditControls();
      return 'unchanged';
    }

    const currentUpdates = this.pendingRawEdits?.get(key) || {};
    const updated = { ...currentUpdates, [column]: newValue };
    this.pendingRawEdits.set(key, updated);
    this.updateRawEditControls();
    return 'added';
  }

  discardPendingRawEdits() {
    this.clearPendingRawEdits();
    this.scheduleRender();
  }

  coerceRawCellValue(baseValue, newValue) {
    if (newValue === null || newValue === undefined) {
      return '';
    }
    if (typeof baseValue === 'number') {
      const normalised = String(newValue).replace(/,/g, '').trim();
      const parsed = Number(normalised);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (typeof baseValue === 'boolean') {
      const lower = String(newValue).trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return newValue;
  }

  applyPendingRawEditsToDataset() {
    const currentData = this.state?.csvData;
    if (!currentData || !Array.isArray(currentData.data)) {
      return null;
    }
    if (!this.hasPendingRawEdits()) {
      return currentData.data;
    }
    const cloned = currentData.data.map(row => ({ ...row }));
    for (const [key, updates] of this.pendingRawEdits.entries()) {
      const rowIndex = Number(key);
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= cloned.length) {
        continue;
      }
      const originalRow = cloned[rowIndex];
      const sourceRow = currentData.data[rowIndex] || {};
      const nextRow = { ...originalRow };
      for (const [column, value] of Object.entries(updates)) {
        const coerced = this.coerceRawCellValue(sourceRow[column], value);
        nextRow[column] = coerced;
      }
      cloned[rowIndex] = nextRow;
    }
    return cloned;
  }

  updateRawEditControls() {
    if (typeof document === 'undefined' || !this.isConnected) {
      return;
    }
    const saveButton = this.querySelector('[data-raw-save]');
    const discardButton = this.querySelector('[data-raw-discard]');
    const label = this.querySelector('[data-raw-unsaved-label]');
    const count = this.getPendingRawEditCount();
    const hasEdits = count > 0;

    if (saveButton) {
      saveButton.disabled = !hasEdits;
      saveButton.classList.toggle('opacity-60', !hasEdits);
      saveButton.classList.toggle('cursor-not-allowed', !hasEdits);
      saveButton.classList.toggle('hover:bg-blue-700', hasEdits);
    }
    if (discardButton) {
      discardButton.disabled = !hasEdits;
      discardButton.classList.toggle('opacity-40', !hasEdits);
      discardButton.classList.toggle('cursor-not-allowed', !hasEdits);
      discardButton.classList.toggle('hover:text-slate-700', hasEdits);
    }
    if (label) {
      label.textContent = hasEdits
        ? `${count} unsaved ${count === 1 ? 'cell' : 'cells'}`
        : 'No unsaved changes';
      label.classList.toggle('text-amber-600', hasEdits);
      label.classList.toggle('text-slate-500', !hasEdits);
    }
  }

  getProcessedRawData(dataSource) {
    const { rawDataFilter, rawDataWholeWord, rawDataSort } = this.state;
    if (!dataSource || !Array.isArray(dataSource.data)) {
      return [];
    }
    let rows = [...dataSource.data];

    if (rawDataFilter) {
      if (rawDataWholeWord) {
        const escaped = rawDataFilter.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        rows = rows.filter(row =>
          Object.values(row).some(value => regex.test(String(value)))
        );
      } else {
        const needle = rawDataFilter.toLowerCase();
        rows = rows.filter(row =>
          Object.values(row).some(value =>
            String(value).toLowerCase().includes(needle)
          )
        );
      }
    }

    if (rawDataSort && rawDataSort.key) {
      const { key, direction } = rawDataSort;
      const asc = direction === 'ascending';
      rows.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (!Number.isNaN(Number(aValue)) && !Number.isNaN(Number(bValue))) {
          const delta = Number(aValue) - Number(bValue);
          return asc ? delta : -delta;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        if (aStr < bStr) return asc ? -1 : 1;
        if (aStr > bStr) return asc ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }

  async handleFileInput(file) {
    if (!file) return;
    this.clearPendingRawEdits();
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
      chatHistory: [],
      highlightedCardId: null,
      currentView: 'analysis_dashboard',
      rawDataView: 'cleaned',
    });

    try {
      this.addProgress('Parsing CSV file...');
      const parsedData = await processCsv(file);
      this.addProgress(`Parsed ${parsedData.data.length} rows.`);

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

      const isApiKeySet = this.hasConfiguredApiKey();

      if (isApiKeySet) {
        this.addProgress('AI is evaluating the data and proposing preprocessing steps...');
        const prepPlan = await generateDataPreparationPlan(
          profiles,
          dataForAnalysis.data.slice(0, 20),
          this.settings,
          dataForAnalysis.metadata || metadata || null
        );
        if (prepPlan && prepPlan.jsFunctionBody) {
          this.addProgress(prepPlan.explanation || 'AI suggested applying a data transformation.');
          const originalCount = dataForAnalysis.data.length;
          dataForAnalysis.data = executeJavaScriptDataTransform(
            dataForAnalysis.data,
            prepPlan.jsFunctionBody
          );
          const newCount = dataForAnalysis.data.length;
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
          this.addProgress(`Transformation complete. Row count changed from ${originalCount} to ${newCount}.`);
          profiles = prepPlan.outputColumns || profileData(dataForAnalysis.data);
        } else {
          this.addProgress('AI determined no additional transformation is required.');
        }
      } else {
        this.ensureApiCredentials({
          reason:
            'API key is missing. Skipping AI-driven preprocessing and analysis while settings open for update.',
        });
      }

      if (!dataForAnalysis.data.length) {
        throw new Error('Dataset is empty; analysis cannot continue.');
      }

      const datasetId = this.generateDatasetId(file.name, dataForAnalysis.metadata || metadata || null);
      if (dataForAnalysis.metadata) {
        dataForAnalysis.metadata = {
          ...dataForAnalysis.metadata,
          datasetId,
        };
      } else {
        dataForAnalysis.metadata = {
          datasetId,
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
      });

      if (isApiKeySet) {
        await this.handleInitialAnalysis(dataForAnalysis, profiles);
      } else {
        this.setState({ isBusy: false });
      }
    } catch (error) {
      console.error(error);
      this.addProgress(
        `File processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
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
        await this.runAnalysisPipeline(plans, csvData, false);
      } else {
        this.addProgress('AI could not produce any analysis plans.', 'error');
      }
    } catch (error) {
      console.error(error);
      this.addProgress(
        `Analysis pipeline error: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
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
        continue;
      }

      const planValidationIssue = this.validatePlanForExecution(normalizedPlan);
      if (planValidationIssue) {
        this.addProgress(`"${planTitle}" skipped: ${planValidationIssue}`, 'error');
        continue;
      }
      try {
        this.addProgress(`Executing analysis: ${planTitle}...`);
        const aggregatedData = executePlan(csvData, normalizedPlan);
        if (!aggregatedData.length) {
          this.addProgress(`"${planTitle}" produced no results and was skipped.`, 'error');
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
          } catch (memoryError) {
            console.warn('Failed to store analysis memory entry.', memoryError);
          }
        }
        this.setState(prev => ({
          analysisCards: [...prev.analysisCards, newCard],
        }));
        isFirstCard = false;
        this.addProgress(`Analysis card created: ${planTitle}`);
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
      }
    }

    if (!isChatRequest && createdCards.length) {
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
      this.setState(prev => ({
        aiCoreAnalysisSummary: coreSummary,
        chatHistory: [
          ...prev.chatHistory,
          { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' },
        ],
      }));

      const finalSummary = await generateFinalSummary(createdCards, this.settings, metadata);
      this.setState({ finalSummary });
      this.addProgress('Overall summary created.');
      if (ENABLE_MEMORY_FEATURES) {
        try {
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

    this.setState(prev => ({
      chatHistory: [...prev.chatHistory, userMessage],
    }));

    try {
      this.addProgress('AI is composing a reply...');
      const userIntent = detectIntent(message, this.state.columnProfiles);
      const datasetId = this.getCurrentDatasetId();
      if (ENABLE_MEMORY_FEATURES) {
        try {
          await storeMemory(datasetId, {
            kind: 'user_prompt',
            intent: userIntent,
            text: message,
            summary: message.slice(0, 220),
          });
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
      const memoryContext = ENABLE_MEMORY_FEATURES
        ? await retrieveRelevantMemories(datasetId, message, 6)
        : [];
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
        memoryContext
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
    const { toolName } = domAction;
    if (!toolName) {
      return { success: false, error: 'DOM action requires a toolName.' };
    }

    const findCard = id => this.state.analysisCards.find(card => card.id === id);

    switch (toolName) {
      case 'highlightCard': {
        const { cardId, scrollIntoView } = domAction;
        const success = this.highlightCard(cardId, { scrollIntoView: scrollIntoView !== false });
        return success
          ? { success: true, message: `Highlighted card ${cardId}.` }
          : { success: false, error: `Card ${cardId || ''} not found.` };
      }
      case 'clearHighlight': {
        this.setState({ highlightedCardId: null });
        return { success: true, message: 'Cleared highlighted card.' };
      }
      case 'changeCardChartType': {
        const { cardId, chartType } = domAction;
        if (!cardId || !chartType) {
          return { success: false, error: 'Card ID and chart type are required.' };
        }
        const allowed = new Set(['bar', 'line', 'pie', 'doughnut', 'scatter']);
        if (!allowed.has(chartType)) {
          return { success: false, error: `Unsupported chart type: ${chartType}.` };
        }
        if (!findCard(cardId)) {
          return { success: false, error: `Card ${cardId} not found.` };
        }
        this.handleChartTypeChange(cardId, chartType);
        return { success: true, message: `Switched card ${cardId} to ${chartType} chart.` };
      }
      case 'toggleCardData':
      case 'showCardData': {
        const { cardId, visible } = domAction;
        const success = this.setCardDataVisibility(cardId, visible);
        return success
          ? {
              success: true,
              message: `Card ${cardId} data ${visible === false ? 'hidden' : 'shown'}.`,
            }
          : { success: false, error: `Unable to toggle data table for card ${cardId || ''}.` };
      }
      case 'setCardTopN': {
        const { cardId, topN, hideOthers } = domAction;
        const success = this.setCardTopN(cardId, topN, hideOthers);
        return success
          ? { success: true, message: `Updated Top-N setting for card ${cardId}.` }
          : { success: false, error: `Unable to update Top-N for card ${cardId || ''}.` };
      }
      case 'setCardHideOthers': {
        const { cardId, hideOthers } = domAction;
        const success = this.setCardHideOthers(cardId, hideOthers);
        return success
          ? {
              success: true,
              message: `Hide "Others" is now ${hideOthers ? 'enabled' : 'disabled'} for card ${cardId}.`,
            }
          : { success: false, error: `Unable to toggle hide others for card ${cardId || ''}.` };
      }
      case 'clearCardSelection': {
        const { cardId } = domAction;
        const success = this.clearCardSelection(cardId);
        return success
          ? { success: true, message: `Cleared selection for card ${cardId}.` }
          : { success: false, error: `Unable to clear selection for card ${cardId || ''}.` };
      }
      case 'resetCardZoom': {
        const { cardId } = domAction;
        const success = this.resetCardZoom(cardId);
        return success
          ? { success: true, message: `Reset zoom for card ${cardId}.` }
          : { success: false, error: `Unable to reset zoom for card ${cardId || ''}.` };
      }
      case 'setRawDataVisibility': {
        const { visible } = domAction;
        this.setRawDataVisibility(visible);
        return { success: true, message: `Raw data explorer ${visible === false ? 'collapsed' : 'expanded'}.` };
      }
      case 'setRawDataFilter': {
        const { query, wholeWord } = domAction;
        this.setRawDataFilterValue(query, wholeWord);
        return { success: true, message: 'Updated raw data filter.' };
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
      case 'removeRawDataRows': {
        return this.removeRawDataRows(domAction);
      }
      default:
        return { success: false, error: `Unknown DOM action: ${toolName}.` };
    }
  }

  async applyChatActions(actions) {
    const datasetId = this.getCurrentDatasetId();
    for (const action of actions) {
      switch (action.responseType) {
        case 'text_response':
          this.setState(prev => ({
            chatHistory: [
              ...prev.chatHistory,
              {
                sender: 'ai',
                text: action.text || '',
                timestamp: new Date(),
                type: 'ai_message',
                cardId: action.cardId,
              },
            ],
          }));
          if (action.text && ENABLE_MEMORY_FEATURES) {
            try {
              await storeMemory(datasetId, {
                kind: 'chat_response',
                intent: 'narrative',
                text: action.text,
                summary: action.text.slice(0, 220),
                metadata: { cardId: action.cardId },
              });
            } catch (memoryError) {
              console.warn('Failed to store AI chat memory entry.', memoryError);
            }
          }
          break;
        case 'plan_creation':
          if (action.plan && this.state.csvData) {
            await this.runAnalysisPipeline([action.plan], this.state.csvData, true);
          }
          break;
        case 'execute_js_code':
          if (action.code && action.code.jsFunctionBody && this.state.csvData) {
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
              if (result.success && ENABLE_MEMORY_FEATURES) {
                try {
                  await storeMemory(datasetId, {
                    kind: 'transformation',
                    intent: 'cleaning',
                    text: action.code.jsFunctionBody,
                    summary: 'AI transformation applied to dataset.',
                    metadata: { codePreview: action.code.jsFunctionBody.slice(0, 200) },
                  });
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
            }
          }
          break;
        case 'dom_action':
          {
            const result = await this.handleDomAction(action.domAction);
            if (result.success) {
              if (result.message) {
                this.addProgress(result.message);
              }
              if (ENABLE_MEMORY_FEATURES) {
                try {
                  await storeMemory(datasetId, {
                    kind: 'dom_action',
                    intent: 'interaction',
                    text: result.message,
                    summary: result.message,
                    metadata: { domAction: action.domAction },
                  });
                } catch (memoryError) {
                  console.warn('Failed to store DOM action memory entry.', memoryError);
                }
              }
            } else {
              this.addProgress(result.error || 'AI UI action failed.', 'error');
            }
          }
          break;
        default:
          console.error('Unsupported AI action type received:', action);
          this.addProgress('AI returned an unsupported action type.', 'error');
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
      this.setState(prev => ({
        ...prev,
        ...restored,
        isHistoryPanelOpen: false,
      }));
      this.isRestoringSession = previousFlag;
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
      chatHistory: [],
      highlightedCardId: null,
      isRawDataVisible: true,
      rawDataFilter: '',
      rawDataWholeWord: false,
      rawDataSort: null,
      rawDataView: 'cleaned',
      originalCsvData: null,
      csvMetadata: null,
      currentDatasetId: null,
      lastAuditReport: null,
      lastRepairSummary: null,
      lastRepairTimestamp: null,
      isHistoryPanelOpen: false,
    }));
    this.isRestoringSession = previousFlag;
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

  highlightCard(cardId, options = {}) {
    if (!cardId) return false;
    const cardExists = this.state.analysisCards.some(card => card.id === cardId);
    if (!cardExists) return false;
    this.setState({ highlightedCardId: cardId });
    const { scrollIntoView = true } = options;
    if (scrollIntoView) {
      queueMicrotask(() => {
        const cardElement = this.querySelector(`[data-card-id="${cardId}"]`);
        cardElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
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
    this.setState({ rawDataView: mode });
  }

  handleRawDataFilterChange(value) {
    this.setState({ rawDataFilter: value });
  }

  handleRawDataWholeWordChange(checked) {
    this.setState({ rawDataWholeWord: checked });
  }

  handleRawDataSort(column) {
    this.setState(prev => {
      if (!column) {
        return { rawDataSort: null };
      }
      if (prev.rawDataSort && prev.rawDataSort.key === column) {
        const direction = prev.rawDataSort.direction === 'ascending' ? 'descending' : 'ascending';
        return { rawDataSort: { key: column, direction } };
      }
      return { rawDataSort: { key: column, direction: 'ascending' } };
    });
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

  processRawCellChange(cell, options = {}) {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const { commit = false } = options || {};
    const rowIndexRaw = cell.dataset.rowIndex;
    const columnKey = cell.dataset.colKey;
    if (columnKey === undefined) {
      return;
    }
    const rowIndex = Number(rowIndexRaw);
    const newValue = this.normalizeRawCellValue(cell.textContent);
    if (commit && cell.textContent !== newValue) {
      cell.textContent = newValue;
    }
    const action = this.setPendingRawEdit(rowIndex, columnKey, newValue);
    if (action === 'added') {
      cell.classList.add('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
      cell.setAttribute('data-edited', 'true');
    } else if (action === 'removed') {
      cell.classList.remove('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
      cell.removeAttribute('data-edited');
    }
    cell.dataset.currentValue = newValue;
  }

  resetRawCellToBaseValue(cell) {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const rowIndex = Number(cell.dataset.rowIndex);
    const columnKey = cell.dataset.colKey;
    const baseValue = this.getBaseRawValue(rowIndex, columnKey);
    const baseString = baseValue === null || baseValue === undefined ? '' : String(baseValue);
    cell.textContent = baseString;
    cell.dataset.currentValue = baseString;
    this.setPendingRawEdit(rowIndex, columnKey, baseString);
    cell.classList.remove('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
    cell.removeAttribute('data-edited');
  }

  handleRawCellInput(event) {
    const cell = event.currentTarget;
    this.processRawCellChange(cell);
  }

  handleRawCellBlur(event) {
    const cell = event.currentTarget;
    this.processRawCellChange(cell, { commit: true });
  }

  handleRawCellKeydown(event) {
    const cell = event.currentTarget;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      cell.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.resetRawCellToBaseValue(cell);
      cell.blur();
    }
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

  destroyCharts() {
    this.chartInstances.forEach(chart => chart.destroy());
    this.chartInstances.clear();
  }

  createChart(card, canvas) {
    const ChartLib = window.Chart;
    const ChartZoom = window.ChartZoom || window.chartjsPluginZoom;
    if (!ChartLib) {
      console.warn('Chart.js is not available; charts cannot be rendered.');
      return;
    }
    if (!zoomPluginRegistered && ChartZoom) {
      ChartLib.register(ChartZoom);
      zoomPluginRegistered = true;
    }
    if (!canvas) return;

    const plan = card.plan;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const existing = this.chartInstances.get(card.id);
    if (existing) {
      existing.destroy();
      this.chartInstances.delete(card.id);
    }

    const chartType = card.displayChartType || plan.chartType;
    const legendData = this.getCardLegendData(card);
    const chartData = chartType === 'scatter' ? card.aggregatedData : this.getCardDisplayData(card);
    const groupKey = plan.groupByColumn;
    const valueKey = this.getCardValueKey(card);
    const selectedIndices = Array.isArray(card.selectedIndices) ? card.selectedIndices : [];
    const selectedSet = new Set(selectedIndices);
    const hasSelection = selectedIndices.length > 0;

    const getColors = base =>
      hasSelection
        ? chartData.map((_, index) => (selectedSet.has(index) ? HIGHLIGHT_COLOR : DESELECTED_COLOR))
        : base;
    const getBorderColors = base =>
      hasSelection
        ? chartData.map((_, index) => (selectedSet.has(index) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR))
        : base;

    const isChartZoomedOrPanned = chartInstance => {
      if (!chartInstance || !chartInstance.scales || !chartInstance.scales.x) return false;
      if (typeof chartInstance.getInitialScaleBounds !== 'function') {
        return chartInstance.getZoomLevel?.() > 1;
      }
      const initial = chartInstance.getInitialScaleBounds().x;
      const current = { min: chartInstance.scales.x.min, max: chartInstance.scales.x.max };
      return initial.min !== current.min || initial.max !== current.max;
    };

    const commonOptions = {
      maintainAspectRatio: false,
      responsive: true,
      animation: card.disableAnimation ? { duration: 0 } : undefined,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const nativeEvent = event?.native || event;
          this.handleChartElementClick(card.id, index, nativeEvent);
        }
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1e293b',
          bodyColor: '#475569',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          titleFont: { weight: 'bold' },
          bodyFont: { size: 13 },
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#64748b',
            callback: function callback(value) {
              const label = this.getLabelForValue(Number(value));
              if (typeof label === 'string' && label.length > 30) {
                return `${label.substring(0, 27)}...`;
              }
              return label;
            },
          },
          grid: { color: '#e2e8f0' },
        },
        y: {
          ticks: { color: '#64748b' },
          grid: { color: '#e2e8f0' },
        },
      },
    };

    const zoomOptions = {
      pan: {
        enabled: true,
        mode: 'xy',
        onPanComplete: ({ chart: chartInstance }) => {
          this.handleZoomState(card.id, isChartZoomedOrPanned(chartInstance));
        },
      },
      zoom: {
        // Disable mouse wheel zoom to prevent scroll from changing chart layout
        wheel: { enabled: false },
        // Keep pinch zoom for touch devices (does not trigger on mouse scroll)
        pinch: { enabled: true },
        mode: 'xy',
        onZoomComplete: ({ chart: chartInstance }) => {
          this.handleZoomState(card.id, isChartZoomedOrPanned(chartInstance));
        },
      },
    };

    let chartInstance;

    if (chartType === 'scatter') {
      const pointColors = chartData.map((_, index) =>
        hasSelection ? (selectedSet.has(index) ? HIGHLIGHT_COLOR : DESELECTED_COLOR) : COLORS[index % COLORS.length]
      );
      const borderColors = chartData.map((_, index) =>
        hasSelection ? (selectedSet.has(index) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR) : BORDER_COLORS[index % BORDER_COLORS.length]
      );
      chartInstance = new ChartLib(ctx, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: plan.title,
              data: chartData.map(row => ({
                x: Number(row[plan.xValueColumn]),
                y: Number(row[plan.yValueColumn]),
              })),
              pointBackgroundColor: pointColors,
              pointBorderColor: borderColors,
              pointRadius: hasSelection ? 6 : 4,
            },
          ],
        },
        options: {
          ...commonOptions,
          plugins: { ...commonOptions.plugins, zoom: zoomOptions },
          scales: {
            x: {
              title: { display: true, text: plan.xValueColumn },
              ticks: { color: '#64748b' },
              grid: { color: '#e2e8f0' },
            },
            y: {
              title: { display: true, text: plan.yValueColumn },
              ticks: { color: '#64748b' },
              grid: { color: '#e2e8f0' },
            },
          },
        },
      });
    } else {
      const labels = groupKey ? chartData.map(row => row[groupKey]) : [];
      const values = chartData.map(row => Number(row[valueKey]) || 0);

      switch (chartType) {
        case 'bar':
          chartInstance = new ChartLib(ctx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: plan.title,
                  data: values,
                  backgroundColor: getColors(BG_COLORS),
                  borderColor: getBorderColors(BORDER_COLORS),
                  borderWidth: 1,
                },
              ],
            },
            options: {
              ...commonOptions,
              plugins: { ...commonOptions.plugins, zoom: zoomOptions },
            },
          });
          break;
        case 'line':
          chartInstance = new ChartLib(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: plan.title,
                  data: values,
                  fill: false,
                  borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[0],
                  pointBackgroundColor: hasSelection
                    ? chartData.map((_, index) => (selectedSet.has(index) ? HIGHLIGHT_COLOR : DESELECTED_COLOR))
                    : [COLORS[0]],
                  pointBorderColor: hasSelection
                    ? chartData.map((_, index) => (selectedSet.has(index) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR))
                    : [BORDER_COLORS[0]],
                  pointRadius: hasSelection ? 5 : 3,
                  pointHoverRadius: 7,
                  tension: 0.1,
                },
              ],
            },
            options: {
              ...commonOptions,
              plugins: { ...commonOptions.plugins, zoom: zoomOptions },
            },
          });
          break;
        case 'pie':
        case 'doughnut':
          chartInstance = new ChartLib(ctx, {
            type: chartType,
            data: {
              labels,
              datasets: [
                {
                  label: plan.title,
                  data: values,
                  backgroundColor: getColors(BG_COLORS),
                  borderColor: getBorderColors(BORDER_COLORS),
                  borderWidth: 1,
                  offset: hasSelection ? chartData.map((_, index) => (selectedSet.has(index) ? 20 : 0)) : 0,
                },
              ],
            },
            options: {
              ...commonOptions,
              plugins: { ...commonOptions.plugins, legend: { display: false }, zoom: zoomOptions },
              scales: {},
            },
          });
          break;
        default:
          chartInstance = new ChartLib(ctx, {
            type: chartType,
            data: {
              labels,
              datasets: [
                {
                  label: plan.title,
                  data: values,
                  backgroundColor: getColors(BG_COLORS),
                  borderColor: getBorderColors(BORDER_COLORS),
                  borderWidth: 1,
                },
              ],
            },
            options: {
              ...commonOptions,
              plugins: { ...commonOptions.plugins, zoom: zoomOptions },
            },
          });
      }
    }

    if (chartInstance) {
      this.chartInstances.set(card.id, chartInstance);
    }
  }

  bindEvents() {
    const fileInput = this.querySelector('#file-upload-input');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const target = e.target;
        if (target.files && target.files[0]) {
          this.handleFileInput(target.files[0]);
          target.value = '';
        }
      });
    }

    const uploadDropZone = this.querySelector('[data-drop-zone]');
    if (uploadDropZone) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadDropZone.addEventListener(eventName, event => {
          event.preventDefault();
          event.stopPropagation();
        });
      });
      uploadDropZone.addEventListener('drop', event => {
        const file = event.dataTransfer?.files?.[0];
        if (file) this.handleFileInput(file);
      });
    }

    this.querySelectorAll('[data-new-session]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.handleNewSession();
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
      const cardId = btn.dataset.showCard;
      btn.addEventListener('click', () => {
        if (!cardId) return;
        const highlighted = this.highlightCard(cardId, { scrollIntoView: true });
        if (!highlighted) {
          this.addProgress(`Could not find card ID ${cardId} to show.`, 'error');
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

    const rawToggle = this.querySelector('[data-raw-toggle]');
    if (rawToggle) {
      rawToggle.addEventListener('click', () => this.handleRawDataToggle());
    }

    this.querySelectorAll('[data-raw-view]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.rawView;
        if (mode) {
          this.handleRawDataViewChange(mode);
        }
      });
    });

    const rawSearch = this.querySelector('[data-raw-search]');
    if (rawSearch) {
      rawSearch.addEventListener('input', event => {
        this.handleRawDataFilterChange(event.target.value);
      });
    }

    const rawWholeWord = this.querySelector('[data-raw-whole]');
    if (rawWholeWord) {
      rawWholeWord.addEventListener('change', event => {
        this.handleRawDataWholeWordChange(event.target.checked);
      });
    }

    const rawReset = this.querySelector('[data-raw-reset]');
    if (rawReset) {
      rawReset.addEventListener('click', () => this.handleRawDataReset());
    }

    this.querySelectorAll('[data-raw-sort]').forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.rawSort;
        if (column) {
          this.handleRawDataSort(column);
        }
      });
    });

    const rawSaveButton = this.querySelector('[data-raw-save]');
    if (rawSaveButton) {
      rawSaveButton.addEventListener('click', () => this.handleRawDataSave(rawSaveButton));
    }

    const rawDiscardButton = this.querySelector('[data-raw-discard]');
    if (rawDiscardButton) {
      rawDiscardButton.addEventListener('click', () => this.handleRawDataDiscard());
    }

    this.querySelectorAll('[data-raw-cell]').forEach(cell => {
      if (cell.getAttribute('contenteditable') === 'true') {
        cell.addEventListener('keydown', event => this.handleRawCellKeydown(event));
        cell.addEventListener('input', event => this.handleRawCellInput(event));
        cell.addEventListener('blur', event => this.handleRawCellBlur(event));
      }
    });

    this.updateRawEditControls();
  }

  renderCharts() {
    this.destroyCharts();
    this.state.analysisCards.forEach(card => {
      const canvas = this.querySelector(`#chart-${card.id}`);
      if (canvas) {
        this.createChart(card, canvas);
      }
    });
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
    combined.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
    const isBusy = this.state.isBusy;
    const isChatDisabled = !isApiKeySet || isBusy || this.state.isThinking;
    const currentView = this.state.currentView;
    const placeholder = !isApiKeySet
      ? 'Set API Key in settings to chat'
      : currentView === 'analysis_dashboard'
      ? 'Ask for a new analysis or data transformation...'
      : 'Upload a file to begin chatting';

    const conversationHtml = timeline
      .map(entry => {
        const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
        const hasTime = timestamp && !Number.isNaN(timestamp.getTime());
        const timeLabel = hasTime
          ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';

        if (entry.__kind === 'progress') {
          const colorClass = entry.type === 'error' ? 'text-rose-600' : 'text-slate-500';
          return `
            <div class="flex text-xs ${colorClass}">
              <span class="mr-2 text-slate-400">${this.escapeHtml(timeLabel)}</span>
              <span>${this.escapeHtml(entry.text || '')}</span>
            </div>`;
        }

        const sender = entry.sender;
        if (entry.type === 'ai_thinking') {
          return `
            <div class="my-2 p-3 bg-white border border-blue-200 rounded-lg">
              <div class="flex items-center text-blue-700 mb-2">
                <span class="text-lg mr-2">🧠</span>
                <h4 class="font-semibold">AI's Initial Analysis</h4>
              </div>
              <p class="text-sm text-slate-700 whitespace-pre-wrap">${this.escapeHtml(entry.text || '')}</p>
            </div>`;
        }

        if (sender === 'system') {
          const badge = timeLabel
            ? `<span class="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold">${this.escapeHtml(timeLabel)}</span>`
            : '';
          return `
            <div class="flex justify-start w-full">
              <div class="flex items-start gap-2 max-w-full text-left">
                <span class="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-500">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7a1 1 0 112 0v1a1 1 0 01-2 0V7zm2 3a1 1 0 10-2 0v4a1 1 0 102 0v-4z" clip-rule="evenodd" />
                  </svg>
                </span>
                <div class="flex flex-col items-start gap-1 min-w-0">
                  <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-amber-500">
                    ${badge}
                    <span class="px-1.5 py-0.5 rounded-full bg-amber-50 font-semibold text-amber-600">System</span>
                  </div>
                  <div class="inline-block max-w-[28rem] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm">
                    ${this.escapeHtml(entry.text || '')}
                  </div>
                </div>
              </div>
            </div>`;
        }

        const alignmentClass = sender === 'user' ? 'justify-end' : 'justify-start';
        const orientationClass = sender === 'user' ? 'items-end text-right' : 'items-start text-left';
        let bubbleClass;
        if (entry.isError) {
          bubbleClass = 'bg-rose-100 text-rose-800 border border-rose-200';
        } else if (sender === 'user') {
          bubbleClass = 'bg-blue-600 text-white shadow-sm';
        } else {
          bubbleClass = 'bg-slate-200 text-slate-800';
        }

        const metaParts = [];
        if (timeLabel) metaParts.push(timeLabel);
        if (entry.cardId) metaParts.push(`Card ${entry.cardId}`);
        const metaLine = metaParts.filter(Boolean).map(part => this.escapeHtml(part)).join(' • ');

        const senderBadge = sender === 'user'
          ? '<span class="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold text-[10px] uppercase tracking-wide">You</span>'
          : sender === 'ai'
          ? '<span class="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[10px] uppercase tracking-wide">AI</span>'
          : '';

        const cardButton = entry.cardId && !entry.isError
          ? `<button type="button" class="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md hover:bg-blue-200 transition-colors w-full text-left font-medium" data-show-card="${this.escapeHtml(entry.cardId)}">
                → Show Related Card
             </button>`
          : '';

        return `
          <div class="flex ${alignmentClass} w-full">
            <div class="flex flex-col ${orientationClass} max-w-full gap-1">
              <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                ${senderBadge}
                ${metaLine ? `<span>${metaLine}</span>` : ''}
              </div>
              <div class="inline-block max-w-[28rem] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${bubbleClass}">
                ${this.escapeHtml(entry.text || '')}
                ${cardButton}
              </div>
            </div>
          </div>`;
      })
      .join('');

    const timelineFallback = isBusy
      ? '<p class="text-xs text-slate-400">Processing... The assistant will respond shortly.</p>'
      : '<p class="text-xs text-slate-400">No activity yet. Upload a CSV or start chatting to begin.</p>';

    return `
      <div class="flex flex-col h-full">
        <div class="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 class="text-xl font-semibold text-slate-900">Assistant</h2>
          <div class="flex items-center gap-2">
            <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Open Settings" aria-label="Open Settings" data-toggle-settings>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Hide Assistant Panel" aria-label="Hide Assistant Panel" data-toggle-aside="hide">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto space-y-4 p-4 bg-slate-100" data-conversation-log>
          ${conversationHtml || timelineFallback}
          ${isBusy ? `<div class="flex items-center text-blue-600"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</div>` : ''}
        </div>
        <div class="p-4 border-t border-slate-200 bg-white">
          <form id="chat-form" class="flex gap-2">
            <input type="text" id="chat-input" data-focus-key="chat-input" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="${this.escapeHtml(placeholder)}" ${isChatDisabled ? 'disabled' : ''} />
            <button type="submit" class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg ${
              !isChatDisabled ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
            }" ${isChatDisabled ? 'disabled' : ''}>Send</button>
          </form>
          <p class="text-xs text-slate-400 mt-2">${
            currentView === 'analysis_dashboard'
              ? 'e.g., "Sum of sales by region", or "Remove rows for USA"'
              : ''
          }</p>
        </div>
      </div>
    `;
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

  renderLegend(card, legendData, totalValue) {
    const plan = card.plan;
    const groupKey = plan.groupByColumn;
    if (!groupKey || plan.chartType === 'scatter') {
      return '';
    }
    const hidden = new Set(card.hiddenLabels || []);
    const valueKey = this.getCardValueKey(card);
    return `
      <div class="flex flex-col">
        <div class="text-xs uppercase tracking-wide text-slate-400 mb-2">Legend</div>
        <div class="text-sm space-y-1 max-h-48 overflow-y-auto pr-1">
          ${legendData
            .map((item, index) => {
              const label = String(item[groupKey]);
              const value = Number(item?.[valueKey]) || 0;
              const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0.0';
              const isHidden = hidden.has(label);
              const color = COLORS[index % COLORS.length];
              const encodedLabel = encodeURIComponent(label);
              return `
                <button
                  type="button"
                  class="w-full flex items-center justify-between p-1.5 rounded-md transition-all duration-200 ${isHidden ? 'opacity-50' : 'hover:bg-slate-100'}"
                  data-legend-toggle="${card.id}"
                  data-legend-label="${encodedLabel}"
                  title="${isHidden ? 'Show' : 'Hide'} \"${this.escapeHtml(label)}\""
                >
                  <div class="flex items-center truncate mr-2">
                    <span class="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style="background-color:${isHidden ? '#9ca3af' : color}"></span>
                    <span class="truncate text-xs ${isHidden ? 'line-through text-slate-400' : 'text-slate-700'}">${this.escapeHtml(label)}</span>
                  </div>
                  <div class="flex items-baseline ml-2 flex-shrink-0">
                    <span class="font-semibold text-xs ${isHidden ? 'text-slate-400' : 'text-slate-800'}">${value.toLocaleString()}</span>
                    <span class="text-xs text-slate-500 ml-1.5 w-12 text-right">(${percentage}%)</span>
                  </div>
                </button>`;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  renderCardsLoadingState() {
    const recentProgress = (this.state.progressMessages || []).slice(-5);
    const progressItems = recentProgress
      .map(message => {
        const text = this.escapeHtml(message.text || '');
        return `<li class="flex items-center gap-2 text-xs text-slate-500">
          <span class="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
          <span class="truncate">${text}</span>
        </li>`;
      })
      .join('');
    const progressHtml = progressItems
      ? `<ul class="mt-4 space-y-1">${progressItems}</ul>`
      : '';

    return `
      <div class="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4 shadow-sm">
        <div class="h-12 w-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
        <div class="flex-1">
          <h3 class="text-base font-semibold text-slate-900">AI is analyzing the data</h3>
          <p class="text-sm text-slate-500">The system will complete data analysis, chart generation, and summary in sequence. Please wait.</p>
          ${progressHtml}
        </div>
      </div>
    `;
  }

  renderEmptyCardsState() {
    const hasCsv = Boolean(this.state.csvData);
    const title = hasCsv ? 'No analysis cards at the moment' : 'Analysis has not started yet';
    const subtitle = hasCsv
      ? 'You can ask the AI to create a new analysis through the conversation on the right, or re-upload data to explore.'
      : 'After uploading the CSV, AI-generated analysis cards and insights will be displayed here.';

    return `
      <div class="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7l9-4 9 4-9 4-9-4z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12l-9 4-9-4" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 17l-9 4-9-4" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-900">${this.escapeHtml(title)}</h3>
        <p class="mt-2 text-sm text-slate-500">${this.escapeHtml(subtitle)}</p>
      </div>
    `;
  }

  renderDataTable(data) {
    if (!data || data.length === 0) {
      return '<p class="text-xs text-slate-500 p-2">No data available.</p>';
    }
    const headers = Object.keys(data[0]);
    return `
      <div class="overflow-auto">
        <table class="min-w-full text-xs text-left">
          <thead class="bg-slate-100 text-slate-600">
            <tr>
              ${headers.map(header => `<th class="px-3 py-2 font-semibold">${this.escapeHtml(header)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data
              .map(row => `
                <tr class="border-t border-slate-100">
                  ${headers
                    .map(header => `<td class="px-3 py-2 text-slate-700">${this.escapeHtml(row[header])}</td>`)
                    .join('')}
                </tr>`)
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderAnalysisCard(card) {
    const plan = card.plan;
    const chartId = `chart-${card.id}`;
    const displayType = card.displayChartType || plan.chartType;
    const isHighlighted = this.state.highlightedCardId === card.id;
    const legendData = this.getCardLegendData(card);
    const displayData = this.getCardDisplayData(card);
    const totalValue = this.getCardTotalValue(card);
    const summary = this.splitSummary(card.summary || '');
    const selectedData = (card.selectedIndices || []).map(index => displayData[index]).filter(Boolean);
    const selectionExpanded = card.showSelectionDetails !== false;
    const isExporting = Boolean(card.isExporting);
    const showTopNControls = plan.chartType !== 'scatter' && legendData.length > 5;
    const valueKey = this.getCardValueKey(card);

    const topNValue = card.topN ? String(card.topN) : 'all';
    const topNOptions = ['all', '5', '8', '10', '20']
      .map(option => `<option value="${option}" ${topNValue === option ? 'selected' : ''}>${option === 'all' ? 'All' : `Top ${option}`}</option>`)
      .join('');

    const totalSummary = plan.aggregation === 'sum'
      ? `<p class="text-xs text-slate-500">Total: <span class="font-semibold text-slate-800">${totalValue.toLocaleString()}</span></p>`
      : '';

    const legendHtml = this.renderLegend(card, legendData, totalValue);
    const showLegend = Boolean(legendHtml);

    const selectionDetails = selectedData.length
      ? `
        <div class="mt-4 bg-slate-50 p-3 rounded-md text-sm border border-slate-200">
          <div class="flex items-center justify-between gap-3">
            <button type="button" class="font-semibold text-blue-600 flex items-center gap-1" data-toggle-selection="${card.id}">
              <span>${selectionExpanded ? '▾' : '▸'}</span>
              <span>Selection details (${selectedData.length})</span>
            </button>
            <button type="button" class="text-xs text-slate-500 hover:text-slate-700" data-clear-selection="${card.id}">
              Clear selection
            </button>
          </div>
          ${selectionExpanded ? `<div class="mt-2 border border-slate-200 rounded-md max-h-48 overflow-auto">${this.renderDataTable(selectedData)}</div>` : ''}
        </div>
      `
      : '';

    const dataTableHtml = card.isDataVisible
      ? `<div class="mt-3 border border-slate-200 rounded-md max-h-48 overflow-auto">${this.renderDataTable(displayData)}</div>`
      : '';

    const secondarySummary = summary.secondary
      ? `<p class="text-xs text-slate-500 mt-2">${this.escapeHtml(summary.secondary)}</p>`
      : '';

    const legendColumn = showLegend
      ? `<div class="flex flex-col">${legendHtml}</div>`
      : '';

    return `
      <article class="bg-white rounded-xl shadow border border-slate-200 p-4 flex flex-col gap-4 transition-shadow ${
        isHighlighted ? 'ring-2 ring-blue-400 shadow-lg' : ''
      }" data-card-id="${card.id}">
        <div class="flex justify-between items-start gap-4">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-slate-900">${this.escapeHtml(plan.title)}</h3>
            <p class="text-sm text-slate-500">${this.escapeHtml(plan.description || '')}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="flex items-center bg-slate-100 rounded-md p-0.5 space-x-0.5">
              ${['bar', 'line', 'pie', 'doughnut', 'scatter']
                .map(type => `
                  <button
                    type="button"
                    class="p-1.5 rounded-md transition-colors ${displayType === type ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'}"
                    data-chart-type="${type}"
                    data-card="${card.id}"
                    title="Switch to ${type} chart"
                  >
                    ${this.renderChartTypeIcon(type)}
                  </button>`)
                .join('')}
            </div>
            <div class="relative" data-export-menu-container data-export-ignore>
              <button
                type="button"
                class="p-1.5 rounded-md border border-transparent transition-colors ${isExporting ? 'opacity-60 cursor-wait text-slate-400' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}"
                data-export-menu-toggle
                data-card="${card.id}"
                aria-haspopup="true"
                aria-expanded="false"
                ${isExporting ? 'disabled' : ''}
                title="Export card"
                data-export-ignore
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
              <div class="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-md shadow-lg hidden z-20" data-export-menu data-export-ignore>
                <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" data-export-card="png" data-card="${card.id}" data-export-ignore>
                  <span>Export as PNG</span>
                  <span class="text-xs text-slate-400">.png</span>
                </button>
                <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" data-export-card="csv" data-card="${card.id}" data-export-ignore>
                  <span>Export data (CSV)</span>
                  <span class="text-xs text-slate-400">.csv</span>
                </button>
                <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-b-md" data-export-card="html" data-card="${card.id}" data-export-ignore>
                  <span>Export report (HTML)</span>
                  <span class="text-xs text-slate-400">.html</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-${showLegend ? '2' : '1'}">
          <div class="relative h-72">
            <canvas id="${chartId}"></canvas>
            <div class="absolute top-2 right-2 flex items-center space-x-1">
              ${selectedData.length > 0 ? `<button class="p-1.5 bg-white/70 rounded-full hover:bg-white text-slate-600" data-clear-selection="${card.id}" title="Clear selection">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /><path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" /></svg>
              </button>` : ''}
              ${card.isZoomed ? `<button class="p-1.5 bg-white/70 rounded-full hover:bg-white text-slate-600" data-reset-zoom="${card.id}" title="Reset zoom">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /><path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" /></svg>
              </button>` : ''}
            </div>
          </div>
          ${legendColumn}
        </div>

        <div class="border-t border-slate-200 pt-3 text-sm text-slate-700">
          <p>${this.escapeHtml(summary.primary)}</p>
          ${secondarySummary}
          ${totalSummary}
        </div>

        <div class="flex flex-wrap justify-between items-center gap-3 text-sm">
          <button type="button" class="text-blue-600 hover:underline" data-toggle-data="${card.id}">
            ${card.isDataVisible ? 'Hide' : 'Show'} full data table
          </button>
          ${showTopNControls
            ? `<div class="flex items-center space-x-2 text-xs">
                <label class="text-slate-500" for="top-n-${card.id}">Show</label>
                <select id="top-n-${card.id}" class="bg-white border border-slate-300 text-slate-800 rounded-md py-1 px-2" data-top-n="${card.id}">${topNOptions}</select>
                ${topNValue !== 'all'
                  ? `<label class="flex items-center space-x-1 text-slate-500">
                       <input type="checkbox" class="h-3.5 w-3.5 text-blue-600 border-slate-300 rounded" data-hide-others="${card.id}" ${card.hideOthers ? 'checked' : ''}>
                       <span>Hide "Others"</span>
                     </label>`
                  : ''}
              </div>`
            : ''}
        </div>

        ${selectionDetails}
        ${dataTableHtml}
      </article>
    `;
  }

  renderChartTypeIcon(type) {
    switch (type) {
      case 'bar':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zM8 8a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V8zM14 4a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V4z" /></svg>';
      case 'line':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a1 1 0 001 1h12a1 1 0 100-2H5V3a1 1 0 00-2 0zm12.293 4.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L15 8.414l-2.293 2.293a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414L12 7.586l1.293-1.293z" clip-rule="evenodd" /></svg>';
      case 'pie':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>';
      case 'doughnut':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 10a3 3 0 116 0 3 3 0 01-6 0z" clip-rule="evenodd" /></svg>';
      case 'scatter':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 100 4 2 2 0 000-4zM5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4zM15 13a2 2 0 100 4 2 2 0 000-4zM8 8a2 2 0 100 4 2 2 0 000-4zM12 8a2 2 0 100 4 2 2 0 000-4z" /></svg>';
      default:
        return '';
    }
  }

  renderRawDataPanel() {
    const {
      csvData,
      originalCsvData,
      isRawDataVisible,
      rawDataFilter,
      rawDataWholeWord,
      rawDataView,
    } = this.state;
    if (!csvData || !Array.isArray(csvData.data)) {
      return '';
    }

    const metadata = this.state.csvMetadata || csvData.metadata || null;
    const originalAvailable =
      Boolean(originalCsvData) && Array.isArray(originalCsvData.data) && originalCsvData.data.length > 0;
    const resolvedView =
      rawDataView === 'original' && originalAvailable ? 'original' : 'cleaned';
    const activeData = resolvedView === 'original' ? originalCsvData : csvData;
    const headers = activeData?.data?.length
      ? Object.keys(activeData.data[0])
      : csvData.data.length
      ? Object.keys(csvData.data[0])
      : [];
    const sortState = this.state.rawDataSort || null;
    const processedRows = this.getProcessedRawData(activeData);
    const rowLimit = 500;
    const visibleRows = processedRows.slice(0, rowLimit);
    const hasMore = processedRows.length > rowLimit;
    const totalRowsInView = Array.isArray(activeData?.data) ? activeData.data.length : csvData.data.length;
    const filteredRowCount = processedRows.length;
    const filterActive = Boolean(rawDataFilter || rawDataWholeWord || sortState);
    const filterSummaryText = filterActive
      ? `Showing ${visibleRows.length.toLocaleString()} of ${filteredRowCount.toLocaleString()} matching rows`
      : `Showing ${visibleRows.length.toLocaleString()} of ${totalRowsInView.toLocaleString()} rows`;
    const filterSummary = hasMore
      ? `${filterSummaryText} (first ${rowLimit.toLocaleString()} rows displayed)`
      : filterSummaryText;
    const sortSummary = sortState
      ? `Sorted by ${sortState.key} (${sortState.direction === 'ascending' ? 'ascending' : 'descending'})`
      : '';

    const cleanedCount = metadata?.cleanedRowCount ?? (csvData.data?.length || 0);
    const originalCount =
      metadata?.originalRowCount ??
      (originalCsvData?.data?.length || cleanedCount);
    const removedCount = Math.max(originalCount - cleanedCount, 0);

    this.ensureRawEditContext();
    const metadataLines = [];
    if (metadata?.reportTitle) {
      metadataLines.push(
        `<p class="text-xs font-semibold text-slate-600">${this.escapeHtml(metadata.reportTitle)}</p>`
      );
    }
    const contextRows = Array.isArray(metadata?.contextRows)
      ? metadata.contextRows
      : Array.isArray(metadata?.leadingRows)
      ? metadata.leadingRows
      : [];
    if (contextRows.length) {
      const preview = contextRows
        .map(row => row.filter(cell => cell).join(' | '))
        .find(text => text);
      if (preview) {
        metadataLines.push(
          `<p class="text-[11px] text-slate-400 mt-0.5">${this.escapeHtml(preview)}</p>`
        );
      }
    }
    const contextCount = metadata?.contextRowCount || contextRows.length || 0;
    if (contextCount) {
      metadataLines.push(
        `<p class="text-[11px] text-slate-400 mt-0.5">Extracted ${contextCount} rows of context data (including headers and initial data rows).</p>`
      );
    }
    metadataLines.push(
      `<p class="text-[11px] text-slate-400 mt-0.5">Original ${originalCount.toLocaleString()} rows • ${cleanedCount.toLocaleString()} rows after cleaning${removedCount > 0 ? ` • ${removedCount.toLocaleString()} rows removed` : ''}</p>`
    );
    metadataLines.push(
      `<p class="text-[11px] ${resolvedView === 'original' ? 'text-amber-600' : 'text-slate-400'} mt-0.5">Current view: ${resolvedView === 'original' ? 'Original CSV content (including title/total rows)' : 'Cleaned data ready for analysis'}</p>`
    );
    const metadataBlock = metadataLines.join('');

    const viewOptions = [
      { key: 'cleaned', label: 'Cleaned Data' },
      { key: 'original', label: 'Original Data' },
    ];
    const viewButtons = viewOptions
      .map(option => {
        const isActive = resolvedView === option.key;
        const disabled = option.key === 'original' && !originalAvailable;
        const classes = [
          'px-3 py-1 text-xs font-medium rounded-md transition-colors',
          isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${classes}" data-raw-view="${option.key}" ${
          disabled ? 'disabled' : ''
        }>${option.label}</button>`;
      })
      .join('<span class="w-1"></span>');

    const tableHeader = headers
      .map(header => {
        const label = this.escapeHtml(header);
        const isSorted = sortState && sortState.key === header;
        const direction = isSorted ? sortState.direction : null;
        const indicator = direction
          ? `<span class="text-[10px] ${isSorted ? 'text-blue-600' : 'text-slate-400'}">${direction === 'ascending' ? '&#9650;' : '&#9660;'}</span>`
          : '<span class="text-[10px] text-slate-300">&#8597;</span>';
        const cellClasses = [
          'px-3 py-2 text-xs font-semibold select-none',
          isSorted ? 'text-blue-600 bg-blue-50/60' : 'text-slate-600',
        ].join(' ');
        return `
          <th class="${cellClasses}">
            <button type="button" class="w-full flex items-center justify-between gap-1 text-left" data-raw-sort="${header}" title="Sort by ${label}">
              <span class="truncate">${label}</span>
              ${indicator}
            </button>
          </th>`;
      })
      .join('');

    const datasetRows = Array.isArray(activeData?.data) ? activeData.data : [];
    const editingEnabled = resolvedView === 'cleaned';
    const pendingEditCount = this.getPendingRawEditCount();
    const hasPendingEdits = pendingEditCount > 0;

    const tableBody = visibleRows
      .map((row, rowIndex) => {
        const rowClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
        const datasetIndex = datasetRows.indexOf(row);
        const resolvedRowIndex = datasetIndex >= 0 ? datasetIndex : rowIndex;
        const rowUpdates = this.getPendingRawRow(resolvedRowIndex);
        const cells = headers
          .map(header => {
            const baseValue = row?.[header];
            const displayValue = this.getPendingRawValue(resolvedRowIndex, header, baseValue);
            const isEdited =
              Boolean(rowUpdates) && Object.prototype.hasOwnProperty.call(rowUpdates, header);
            const cellClasses = [
              'px-3 py-2 text-xs whitespace-nowrap align-top text-slate-700',
              editingEnabled ? 'focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400' : '',
              isEdited ? 'bg-amber-50 ring-2 ring-amber-200 rounded-sm shadow-inner' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const originalString =
              baseValue === null || baseValue === undefined ? '' : String(baseValue);
            const displayString =
              displayValue === null || displayValue === undefined ? '' : String(displayValue);
            const editableAttrs = editingEnabled
              ? ` contenteditable="true" spellcheck="false" data-raw-cell data-row-index="${resolvedRowIndex}" data-col-key="${this.escapeHtml(
                  header
                )}" data-original-value="${this.escapeHtml(originalString)}"`
              : '';
            const editedAttr = isEdited ? ' data-edited="true"' : '';
            return `<td class="${cellClasses}"${editableAttrs}${editedAttr}>${this.escapeHtml(
              displayString
            )}</td>`;
          })
          .join('');
        return `<tr class="border-t border-slate-100 ${rowClass} hover:bg-blue-50/40 transition-colors" data-row-source="${resolvedRowIndex}">${cells}</tr>`;
      })
      .join('');

    const tableHtml = headers.length
      ? `<div class="overflow-auto border border-slate-200 rounded-md shadow-sm" style="max-height: 60vh;">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-slate-100 sticky top-0 z-10 shadow-sm">
              <tr>${tableHeader}</tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>`
      : '<p class="text-xs text-slate-500">No data rows available.</p>';

    const editToolbar = editingEnabled
      ? `<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span class="${hasPendingEdits ? 'text-amber-600 font-medium' : 'text-slate-500'}" data-raw-unsaved-label>
            ${hasPendingEdits ? `${pendingEditCount} unsaved ${pendingEditCount === 1 ? 'cell' : 'cells'}` : 'No unsaved changes'}
          </span>
          <div class="flex items-center gap-2">
            <button type="button" class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white transition disabled:opacity-60 disabled:cursor-not-allowed${hasPendingEdits ? ' hover:bg-blue-700' : ''}" data-raw-save ${hasPendingEdits ? '' : 'disabled'}>
              Save changes
            </button>
            <button type="button" class="text-xs text-slate-500 transition disabled:opacity-40 disabled:cursor-not-allowed${hasPendingEdits ? ' hover:text-slate-700' : ''}" data-raw-discard ${hasPendingEdits ? '' : 'disabled'}>
              Discard
            </button>
          </div>
        </div>`
      : `<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Switch to the cleaned dataset to make inline edits.
        </div>`;

    return `
      <section class="mx-auto max-w-6xl px-6 pb-8">
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm">
          <button type="button" class="flex justify-between items-center w-full px-4 py-3 text-left hover:bg-slate-50" data-raw-toggle>
            <div>
              <h3 class="text-base font-semibold text-slate-900">Raw Data Explorer</h3>
              ${metadataBlock}
              <p class="text-xs text-slate-500">${this.escapeHtml(csvData.fileName)} • ${csvData.data.length.toLocaleString()} rows (cleaned)</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-400 transition-transform ${isRawDataVisible ? 'transform rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          ${isRawDataVisible
            ? `<div class="px-4 pb-4 space-y-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div class="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-md p-1">
                    ${viewButtons}
                  </div>
                  <div class="flex flex-wrap items-center gap-4">
                    <div class="relative">
                      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      </div>
                      <input type="text" data-raw-search data-focus-key="raw-search" class="bg-white border border-slate-300 rounded-md py-1.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Search table..." value="${this.escapeHtml(rawDataFilter)}" />
                    </div>
                    <label class="flex items-center space-x-2 text-xs text-slate-600">
                      <input type="checkbox" data-raw-whole class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${rawDataWholeWord ? 'checked' : ''}>
                      <span>Match whole word only</span>
                    </label>
                    ${filterActive ? '<button type="button" class="text-xs text-slate-500 hover:text-slate-700 underline" data-raw-reset>Reset filters</button>' : ''}
                  </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>${this.escapeHtml(filterSummary)}</span>
                  ${sortSummary ? `<span>${this.escapeHtml(sortSummary)}</span>` : ''}
                </div>
                ${editToolbar}
                ${tableHtml}
                ${hasMore ? '<p class="text-xs text-slate-500">Showing first 500 rows. Refine your filters to view more.</p>' : ''}
              </div>`
            : ''}
        </div>
      </section>
    `;
  }

  render() {
    const { isBusy, csvData, analysisCards, finalSummary } = this.state;
    const isApiKeySet = this.hasConfiguredApiKey();
    const cardsHtml = analysisCards.map(card => this.renderAnalysisCard(card)).join('');
    let cardsSection;
    if (cardsHtml) {
      cardsSection = `<div class="grid gap-6 grid-cols-1 xl:grid-cols-2">${cardsHtml}</div>`;
    } else if (isBusy && csvData) {
      cardsSection = this.renderCardsLoadingState();
    } else {
      cardsSection = this.renderEmptyCardsState();
    }
    const rawDataPanel = this.renderRawDataPanel();

    const summaryBlock = finalSummary
      ? `<article class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4">
          <h2 class="text-lg font-semibold mb-2">AI Summary</h2>
          <p class="text-sm leading-relaxed whitespace-pre-line">${this.escapeHtml(finalSummary)}</p>
        </article>`
      : '';

    const mainContent = !csvData
      ? `<div class="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center" data-drop-zone>
          <p class="text-xl text-slate-500 mb-4">Drag and drop your CSV here or use the button above.</p>
          <p class="text-sm text-slate-400">All processing happens locally in your browser.</p>
        </div>`
      : `
        ${summaryBlock}
        <div class="space-y-6">${cardsSection}</div>
        ${rawDataPanel}
      `;

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
              <label class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}">
                Upload CSV
                <input id="file-upload-input" type="file" accept=".csv" class="hidden" ${isBusy ? 'disabled' : ''} />
              </label>
            </div>
          </header>
          <div class="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-6" data-main-scroll>
            ${mainContent}
          </div>
        </main>
        ${assistantPanelHtml}
      </div>
      ${this.renderSettingsModal()}
      ${this.renderHistoryPanel()}
    `;

    this.bindEvents();
    this.bindSettingsEvents();
    this.renderCharts();
    this.setupMainScrollElement();
    this.restoreMainScrollPosition();
    this.setupConversationLogAutoScroll();
    this.restoreFocus();
  }
}

customElements.define('csv-data-analysis-app', CsvDataAnalysisApp);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found; unable to initialise the application.');
}
root.innerHTML = '<csv-data-analysis-app></csv-data-analysis-app>';
