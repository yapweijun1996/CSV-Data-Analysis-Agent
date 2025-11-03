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
      rawDataView: 'cleaned',
      originalCsvData: null,
      csvMetadata: null,
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

  validatePlanForExecution(plan) {
    if (!plan || typeof plan !== 'object') {
      return '分析設定缺失。';
    }
    if (!plan.chartType) {
      return '缺少圖表類型。';
    }
    if (plan.chartType === 'scatter') {
      return null;
    }
    const aggregation = typeof plan.aggregation === 'string' ? plan.aggregation.toLowerCase() : '';
    if (!['sum', 'count', 'avg'].includes(aggregation)) {
      return '缺少有效的彙總方式（sum / count / avg）。';
    }
    if (!plan.groupByColumn) {
      return '缺少分組欄位。';
    }
    if (aggregation !== 'count' && !plan.valueColumn) {
      return '缺少數值欄位。';
    }
    return null;
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
    const prevCsv = this.state.csvData;
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
        this.addProgress(`偵測到報表標題：「${metadata.reportTitle}」。`);
      }
      const contextCount = metadata?.contextRowCount || metadata?.leadingRows?.length || 0;
      if (contextCount) {
        this.addProgress(
          `已擷取前 ${Math.min(contextCount, 20)} 列資料作為報表上下文（含表頭/前導列與首批資料列），供 AI 理解資料來源。`
        );
      }
      if (
        metadata &&
        typeof metadata.originalRowCount === 'number' &&
        typeof metadata.cleanedRowCount === 'number'
      ) {
        const removed = Math.max(metadata.originalRowCount - metadata.cleanedRowCount, 0);
        this.addProgress(
          `原始資料共有 ${metadata.originalRowCount.toLocaleString()} 列，清理後保留 ${metadata.cleanedRowCount.toLocaleString()} 列${removed > 0 ? `，其中 ${removed.toLocaleString()} 列為標題或總計等非資料列。` : '。'}`
        );
      }

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
        this.addProgress('API key is missing. Skipping AI-driven preprocessing and analysis.', 'error');
      }

      if (!dataForAnalysis.data.length) {
        throw new Error('Dataset is empty; analysis cannot continue.');
      }

      this.setState({
        csvData: dataForAnalysis,
        columnProfiles: profiles,
        originalCsvData: parsedData.originalData
          ? { fileName: file.name, data: parsedData.originalData }
          : null,
        csvMetadata: dataForAnalysis.metadata || metadata || null,
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

  async runAnalysisPipeline(plans, csvData, isChatRequest) {
    let isFirstCard = true;
    const createdCards = [];
    const metadata = csvData?.metadata || null;
    for (const plan of plans) {
      const planValidationIssue = this.validatePlanForExecution(plan);
      if (planValidationIssue) {
        const title = plan?.title || '未命名分析';
        this.addProgress(`「${title}」因設定不完整而被跳過：${planValidationIssue}`, 'error');
        continue;
      }
      try {
        this.addProgress(`Executing analysis: ${plan.title}...`);
        const aggregatedData = executePlan(csvData, plan);
        if (!aggregatedData.length) {
          this.addProgress(`"${plan.title}" produced no results and was skipped.`, 'error');
          continue;
        }
        this.addProgress(`AI is drafting a summary for: ${plan.title}...`);
        const summary = await generateSummary(
          plan.title,
          aggregatedData,
          this.settings,
          metadata
        );
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
      const metadata = this.state.csvMetadata || this.state.csvData?.metadata || null;
      const response = await generateChatResponse(
        this.state.columnProfiles,
        this.state.chatHistory,
        message,
        cardContext,
        this.settings,
        this.state.aiCoreAnalysisSummary,
        this.state.currentView,
        rawDataSample,
        metadata
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

  async rebuildAfterDataChange(newData, progressMessage) {
    if (!this.state.csvData) {
      return { success: false, error: 'No dataset is loaded yet.' };
    }
    const existingPlans = this.state.analysisCards.map(card => card.plan);
    const newCsvData = { ...this.state.csvData, data: newData };
    if (newCsvData.metadata) {
      newCsvData.metadata = {
        ...newCsvData.metadata,
        cleanedRowCount: newData.length,
      };
    } else {
      newCsvData.metadata = { cleanedRowCount: newData.length };
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
    });
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
          <h3 class="text-base font-semibold text-slate-900">AI 正在分析資料</h3>
          <p class="text-sm text-slate-500">系統會依序完成資料剖析、圖表生成與重點摘要，請稍候。</p>
          ${progressHtml}
        </div>
      </div>
    `;
  }

  renderEmptyCardsState() {
    const hasCsv = Boolean(this.state.csvData);
    const title = hasCsv ? '目前沒有分析卡片' : '尚未開始分析';
    const subtitle = hasCsv
      ? '可透過右側對話請 AI 建立新的分析，或重新上傳資料進行探索。'
      : '上傳 CSV 後會在此顯示由 AI 產生的分析卡片與洞察。';

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
    const processedRows = this.getProcessedRawData(activeData);
    const rowLimit = 500;
    const visibleRows = processedRows.slice(0, rowLimit);
    const hasMore = processedRows.length > rowLimit;

    const cleanedCount = metadata?.cleanedRowCount ?? (csvData.data?.length || 0);
    const originalCount =
      metadata?.originalRowCount ??
      (originalCsvData?.data?.length || cleanedCount);
    const removedCount = Math.max(originalCount - cleanedCount, 0);

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
        `<p class="text-[11px] text-slate-400 mt-0.5">已擷取 ${contextCount} 列上下文資料（包含表頭與首批資料列）。</p>`
      );
    }
    metadataLines.push(
      `<p class="text-[11px] text-slate-400 mt-0.5">原始 ${originalCount.toLocaleString()} 行 • 清理後 ${cleanedCount.toLocaleString()} 行${removedCount > 0 ? ` • 已移除 ${removedCount.toLocaleString()} 行` : ''}</p>`
    );
    metadataLines.push(
      `<p class="text-[11px] ${resolvedView === 'original' ? 'text-amber-600' : 'text-slate-400'} mt-0.5">目前檢視：${resolvedView === 'original' ? '原始 CSV 內容（包含標題 / 總計列）' : '清理後可供分析的資料'}</p>`
    );
    const metadataBlock = metadataLines.join('');

    const viewOptions = [
      { key: 'cleaned', label: '清理後資料' },
      { key: 'original', label: '原始資料' },
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
      .map(
        header =>
          `<th class="px-3 py-2 text-xs font-semibold text-slate-600 cursor-pointer" data-raw-sort="${header}">${this.escapeHtml(header)}</th>`
      )
      .join('');

    const tableBody = visibleRows
      .map(
        row => `
        <tr class="border-t border-slate-100">
          ${headers
            .map(header => `<td class="px-3 py-2 text-xs text-slate-700">${this.escapeHtml(row[header])}</td>`)
            .join('')}
        </tr>`
      )
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
              ${metadataBlock}
              <p class="text-xs text-slate-500">${this.escapeHtml(csvData.fileName)} • ${csvData.data.length.toLocaleString()} 行 (清理後)</p>
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
                  </div>
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
    let cardsSection;
    if (cardsHtml) {
      cardsSection = `<div class="grid gap-6 grid-cols-1 2xl:grid-cols-2">${cardsHtml}</div>`;
    } else if (isBusy && csvData) {
      cardsSection = this.renderCardsLoadingState();
    } else {
      cardsSection = this.renderEmptyCardsState();
    }
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
