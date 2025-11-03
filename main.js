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
} from './storageService.js';

const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
const BORDER_COLORS = COLORS.map(color => `${color}B3`);
const BG_COLORS = COLORS.map(color => `${color}80`);
const HIGHLIGHT_COLOR = '#3b82f6';
const HIGHLIGHT_BORDER_COLOR = '#2563eb';
const DESELECTED_COLOR = 'rgba(107, 114, 128, 0.2)';
const DESELECTED_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)';
let zoomPluginRegistered = false;

class CsvDataAnalysisApp extends HTMLElement {
  constructor() {
    super();
    this.state = {
      currentView: 'file_upload',
      isBusy: false,
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
    };
    this.settings = getSettings();
    this.chartInstances = new Map();
    this.renderPending = false;
    this.isMounted = false;
    this.pendingFocus = null;
    this.shouldAutoScrollConversation = true;
    this.conversationLogElement = null;
    this.handleConversationScroll = this.onConversationScroll.bind(this);
  }

  connectedCallback() {
    this.isMounted = true;
    this.render();
  }

  disconnectedCallback() {
    this.isMounted = false;
    this.destroyCharts();
    if (this.conversationLogElement) {
      this.conversationLogElement.removeEventListener('scroll', this.handleConversationScroll);
      this.conversationLogElement = null;
    }
  }

  setState(updater) {
    const prevState = this.state;
    const nextPartial = typeof updater === 'function' ? updater(prevState) : updater;
    this.state = { ...prevState, ...nextPartial };
    this.captureFocus();
    this.scheduleRender();
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
    if (card.plan.chartType === 'scatter') {
      return card.plan.valueColumn || 'value';
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
      data = applyTopNWithOthers(data, plan.groupByColumn, 'value', topN);
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
    return legendData.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
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

  getProcessedRawData() {
    const { csvData, rawDataFilter, rawDataWholeWord, rawDataSort } = this.state;
    if (!csvData || !csvData.data) {
      return [];
    }
    let rows = [...csvData.data];

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
    const prevCsv = this.state.csvData;
    this.setState({
      isBusy: true,
      progressMessages: [],
      csvData: { fileName: file.name, data: [] },
      analysisCards: [],
      finalSummary: null,
      aiCoreAnalysisSummary: null,
      chatHistory: [],
      highlightedCardId: null,
      currentView: 'analysis_dashboard',
    });

    try {
      this.addProgress('Parsing CSV file...');
      const parsedData = await processCsv(file);
      this.addProgress(`Parsed ${parsedData.data.length} rows.`);

      let dataForAnalysis = parsedData;
      let profiles = profileData(parsedData.data);

      const isApiKeySet =
        this.settings.provider === 'google'
          ? !!this.settings.geminiApiKey
          : !!this.settings.openAIApiKey;

      if (isApiKeySet) {
        this.addProgress('AI is evaluating the data and proposing preprocessing steps...');
        const prepPlan = await generateDataPreparationPlan(
          profiles,
          dataForAnalysis.data.slice(0, 20),
          this.settings
        );
        if (prepPlan && prepPlan.jsFunctionBody) {
          this.addProgress(prepPlan.explanation || 'AI suggested applying a data transformation.');
          const originalCount = dataForAnalysis.data.length;
          dataForAnalysis.data = executeJavaScriptDataTransform(
            dataForAnalysis.data,
            prepPlan.jsFunctionBody
          );
          const newCount = dataForAnalysis.data.length;
          this.addProgress(`Transformation complete. Row count changed from ${originalCount} to ${newCount}.`);
          profiles = prepPlan.outputColumns || profileData(dataForAnalysis.data);
        } else {
          this.addProgress('AI determined no additional transformation is required.');
        }
      } else {
        this.addProgress('API key is missing. Skipping AI-driven preprocessing and analysis.', 'error');
      }

      if (!dataForAnalysis.data.length) {
        throw new Error('Dataset is empty; analysis cannot continue.');
      }

      this.setState({
        csvData: dataForAnalysis,
        columnProfiles: profiles,
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
      const plans = await generateAnalysisPlans(profiles, csvData.data.slice(0, 20), this.settings);
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

  async runAnalysisPipeline(plans, csvData, isChatRequest) {
    let isFirstCard = true;
    const createdCards = [];
    for (const plan of plans) {
      try {
        this.addProgress(`Executing analysis: ${plan.title}...`);
        const aggregatedData = executePlan(csvData, plan);
        if (!aggregatedData.length) {
          this.addProgress(`"${plan.title}" produced no results and was skipped.`, 'error');
          continue;
        }
        this.addProgress(`AI is drafting a summary for: ${plan.title}...`);
        const summary = await generateSummary(plan.title, aggregatedData, this.settings);
        const categoryCount = aggregatedData.length;
        const shouldDefaultTopN = plan.chartType !== 'scatter' && categoryCount > 15;
        const defaultTopN = shouldDefaultTopN ? 8 : plan.defaultTopN || null;
        const newCard = {
          id: `card-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          plan,
          aggregatedData,
          summary,
          displayChartType: plan.chartType,
          isDataVisible: false,
          topN: defaultTopN,
          hideOthers: shouldDefaultTopN ? true : Boolean(plan.defaultHideOthers),
          hiddenLabels: [],
          filter: null,
          disableAnimation: isChatRequest || !isFirstCard || (this.state.analysisCards?.length ?? 0) > 0,
          selectedIndices: [],
          isZoomed: false,
        };

        createdCards.push(newCard);
        this.setState(prev => ({
          analysisCards: [...prev.analysisCards, newCard],
        }));
        isFirstCard = false;
        this.addProgress(`Analysis card created: ${plan.title}`);
      } catch (error) {
        console.error(error);
        this.addProgress(
          `Analysis "${plan.title}" failed: ${error instanceof Error ? error.message : String(error)}`,
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
        this.settings
      );
      this.setState(prev => ({
        aiCoreAnalysisSummary: coreSummary,
        chatHistory: [
          ...prev.chatHistory,
          { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' },
        ],
      }));

      const finalSummary = await generateFinalSummary(createdCards, this.settings);
      this.setState({ finalSummary });
      this.addProgress('Overall summary created.');
    }

    return createdCards;
  }

  async handleChatSubmit(message) {
    if (!message.trim()) return;
    if (!this.state.csvData) {
      this.addProgress('Please upload a CSV file before chatting with the assistant.', 'error');
      return;
    }

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
      const cardContext = this.state.analysisCards.map(card => ({
        id: card.id,
        title: card.plan.title,
        aggregatedDataSample: card.aggregatedData.slice(0, 10),
      }));
      const rawDataSample = this.state.csvData.data.slice(0, 20);
      const response = await generateChatResponse(
        this.state.columnProfiles,
        this.state.chatHistory,
        message,
        cardContext,
        this.settings,
        this.state.aiCoreAnalysisSummary,
        this.state.currentView,
        rawDataSample
      );

      await this.applyChatActions(response.actions || []);
    } catch (error) {
      console.error(error);
      this.addProgress(
        `AI response failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
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
            } else {
              this.addProgress(result.error || 'AI UI action failed.', 'error');
            }
          }
          break;
        default:
          this.addProgress('AI returned an unsupported action type.', 'error');
      }
    }
  }

  handleSettingsSave(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    saveSettings(this.settings);
    this.setState({ showSettings: false });
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

  async rebuildAfterDataChange(newData, progressMessage) {
    if (!this.state.csvData) {
      return { success: false, error: 'No dataset is loaded yet.' };
    }
    const existingPlans = this.state.analysisCards.map(card => card.plan);
    const newCsvData = { ...this.state.csvData, data: newData };
    const newProfiles = profileData(newData);
    this.setState({
      csvData: newCsvData,
      columnProfiles: newProfiles,
      analysisCards: [],
      finalSummary: null,
      highlightedCardId: null,
    });
    if (progressMessage) {
      this.addProgress(progressMessage);
    }
    this.addProgress('Recomputing analysis after data update...');
    try {
      const regeneratedCards = await this.runAnalysisPipeline(existingPlans, newCsvData, true);
      if (regeneratedCards.length) {
        const finalSummary = await generateFinalSummary(this.state.analysisCards, this.settings);
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
    const { column, values, operator, matchMode, caseSensitive } = domAction || {};
    if (!column) {
      return { success: false, error: 'Column is required to remove rows from raw data.' };
    }
    const dataRows = this.state.csvData.data;
    if (!dataRows.length) {
      return { success: true, message: 'No rows available in the raw data table.' };
    }

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
        wheel: { enabled: true },
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

    const chatForm = this.querySelector('#chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', e => {
        e.preventDefault();
        const input = this.querySelector('#chat-input');
        const value = input?.value || '';
        if (input) input.value = '';
        this.handleChatSubmit(value);
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

    this.querySelectorAll('[data-raw-sort]').forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.rawSort;
        if (column) {
          this.handleRawDataSort(column);
        }
      });
    });
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
    return `
      <div class="flex flex-col">
        <div class="text-xs uppercase tracking-wide text-slate-400 mb-2">Legend</div>
        <div class="text-sm space-y-1 max-h-48 overflow-y-auto pr-1">
          ${legendData
            .map((item, index) => {
              const label = String(item[groupKey]);
              const value = Number(item.value) || 0;
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
    const showTopNControls = plan.chartType !== 'scatter' && legendData.length > 5;

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
          <button type="button" class="w-full text-left font-semibold text-blue-600 mb-2" data-clear-selection="${card.id}">
            Clear selection (${selectedData.length})
          </button>
          ${this.renderDataTable(selectedData)}
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
    const { csvData, isRawDataVisible, rawDataFilter, rawDataWholeWord } = this.state;
    if (!csvData || !csvData.data) {
      return '';
    }
    const headers = csvData.data.length ? Object.keys(csvData.data[0]) : [];
    const processedRows = this.getProcessedRawData();
    const rowLimit = 500;
    const visibleRows = processedRows.slice(0, rowLimit);
    const hasMore = processedRows.length > rowLimit;

    const tableHeader = headers
      .map(header => `<th class="px-3 py-2 text-xs font-semibold text-slate-600 cursor-pointer" data-raw-sort="${header}">${this.escapeHtml(header)}</th>`)
      .join('');

    const tableBody = visibleRows
      .map(row => `
        <tr class="border-t border-slate-100">
          ${headers.map(header => `<td class="px-3 py-2 text-xs text-slate-700">${this.escapeHtml(row[header])}</td>`).join('')}
        </tr>`)
      .join('');

    const tableHtml = headers.length
      ? `<div class="overflow-auto border border-slate-200 rounded-md" style="max-height: 60vh;">
          <table class="min-w-full text-left">
            <thead class="bg-slate-100">
              <tr>${tableHeader}</tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>`
      : '<p class="text-xs text-slate-500">No data rows available.</p>';

    return `
      <section class="mx-auto max-w-6xl px-6 pb-8">
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm">
          <button type="button" class="flex justify-between items-center w-full px-4 py-3 text-left hover:bg-slate-50" data-raw-toggle>
            <div>
              <h3 class="text-base font-semibold text-slate-900">Raw Data Explorer</h3>
              <p class="text-xs text-slate-500">${this.escapeHtml(csvData.fileName)} • ${csvData.data.length.toLocaleString()} rows</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-400 transition-transform ${isRawDataVisible ? 'transform rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          ${isRawDataVisible
            ? `<div class="px-4 pb-4 space-y-4">
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
                </div>
                ${tableHtml}
                ${hasMore ? '<p class="text-xs text-slate-500">Showing first 500 rows. Refine your filters to view more.</p>' : ''}
              </div>`
            : ''}
        </div>
      </section>
    `;
  }

  render() {
    const { isBusy, csvData, analysisCards, finalSummary, chatHistory } = this.state;
    const isApiKeySet =
      this.settings.provider === 'google'
        ? !!this.settings.geminiApiKey
        : !!this.settings.openAIApiKey;

    const cardsHtml = analysisCards.map(card => this.renderAnalysisCard(card)).join('');
    const cardsSection = cardsHtml
      ? `<div class="grid gap-6 grid-cols-1 2xl:grid-cols-2">${cardsHtml}</div>`
      : '<p class="text-sm text-slate-500">No analysis cards yet.</p>';
    const rawDataPanel = this.renderRawDataPanel();

    const conversationEntries = Array.isArray(chatHistory) ? chatHistory.slice(-200) : [];
    const conversationHtml = conversationEntries
      .map(msg => {
        const timestamp = msg?.timestamp ? new Date(msg.timestamp) : null;
        const hasTime = timestamp && !Number.isNaN(timestamp.getTime());
        const timeLabel = hasTime
          ? timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : '';
        const senderLabel =
          msg.sender === 'user' ? 'You' : msg.sender === 'ai' ? 'AI' : 'System';
        const metaParts = [];
        if (timeLabel) metaParts.push(timeLabel);
        metaParts.push(senderLabel);
        if (msg.cardId) metaParts.push(`Card ${msg.cardId}`);
        const metaLine = metaParts.map(part => this.escapeHtml(part)).join(' • ');
        const alignmentClass = msg.sender === 'user' ? 'justify-end' : 'justify-start';
        const orientationClass =
          msg.sender === 'user' ? 'items-end text-right' : 'items-start text-left';
        let bubbleClass;
        if (msg.type === 'system_error') {
          bubbleClass = 'bg-rose-50 text-rose-700 border border-rose-200';
        } else if (msg.sender === 'user') {
          bubbleClass = 'bg-blue-600 text-white shadow-sm';
        } else if (msg.type === 'ai_thinking') {
          bubbleClass = 'bg-slate-200 text-slate-600 italic';
        } else if (msg.sender === 'system') {
          bubbleClass = 'bg-amber-50 text-amber-800 border border-amber-200';
        } else {
          bubbleClass = 'bg-white border border-slate-200 text-slate-800';
        }
        return `
        <div class="flex ${alignmentClass} w-full">
          <div class="flex flex-col ${orientationClass} max-w-full gap-1">
            <div class="text-[10px] uppercase tracking-wide text-slate-400">${metaLine}</div>
            <div class="inline-block max-w-[28rem] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${bubbleClass}">
              ${this.escapeHtml(msg.text || '')}
            </div>
          </div>
        </div>`;
      })
      .join('');

    this.innerHTML = `
      <div class="min-h-screen flex flex-col">
        <header class="bg-white border-b border-slate-200">
          <div class="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-slate-900">CSV Data Analysis Agent</h1>
              <p class="text-sm text-slate-500">Frontend-only Web Component build</p>
            </div>
            <div class="flex items-center gap-3">
              <button class="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100" data-toggle-settings>
                Settings
              </button>
              <label class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
                Upload CSV
                <input id="file-upload-input" type="file" accept=".csv" class="hidden" ${isBusy ? 'disabled' : ''} />
              </label>
            </div>
          </div>
        </header>

        <main class="flex-1">
          <div class="mx-auto max-w-6xl px-6 py-6 grid lg:grid-cols-3 gap-6">
            <section class="lg:col-span-2 space-y-6">
              ${
                !csvData
                  ? `<div class="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center" data-drop-zone>
                      <p class="text-xl text-slate-500 mb-4">Drag and drop your CSV here or use the button above.</p>
                      <p class="text-sm text-slate-400">All processing happens locally in your browser.</p>
                    </div>`
                  : ''
              }

              ${
                finalSummary
                  ? `<article class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4">
                      <h2 class="text-lg font-semibold mb-2">AI Summary</h2>
                      <p class="text-sm leading-relaxed whitespace-pre-line">${this.escapeHtml(finalSummary)}</p>
                    </article>`
                  : ''
              }

              <div class="space-y-6">${cardsSection}</div>
            </section>

            <aside class="lg:col-span-1 space-y-6">
              <section class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[40rem]">
                <h2 class="text-sm font-semibold text-slate-700 mb-3">Conversation Log</h2>
                <div class="flex-1 overflow-y-auto space-y-3 pr-1" data-conversation-log>${
                  conversationHtml ||
                  '<p class="text-xs text-slate-400">No activity yet. Upload a CSV or start chatting to begin.</p>'
                }</div>
                <form id="chat-form" class="mt-3 flex gap-2">
                  <textarea id="chat-input" data-focus-key="chat-input" rows="2" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y" placeholder="${
                    isApiKeySet ? 'Type a message...' : 'Set an API key first'
                  }" ${isApiKeySet ? '' : 'disabled'}></textarea>
                  <button type="submit" class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg ${
                    isApiKeySet ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
                  }" ${isApiKeySet ? '' : 'disabled'}>Send</button>
                </form>
              </section>
            </aside>
          </div>
        </main>
      </div>
      ${rawDataPanel}
      ${this.renderSettingsModal()}
    `;

    this.bindEvents();
    this.bindSettingsEvents();
    this.renderCharts();
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
