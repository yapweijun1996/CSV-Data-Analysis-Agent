export const COLORS = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
];

export const BORDER_COLORS = COLORS.map(color => `${color}B3`);
export const BG_COLORS = COLORS.map(color => `${color}80`);

export const HIGHLIGHT_COLOR = '#3b82f6';
export const HIGHLIGHT_BORDER_COLOR = '#2563eb';
export const DESELECTED_COLOR = 'rgba(107, 114, 128, 0.2)';
export const DESELECTED_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)';

export const SUPPORTED_CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'scatter']);
export const SUPPORTED_AGGREGATIONS = new Set(['sum', 'count', 'avg']);

export const RAW_ROWS_PER_PAGE = 50;
export const MIN_RAW_COLUMN_WIDTH = 60;
export const DEFAULT_RAW_COLUMN_WIDTH = 120;

export const MEMORY_CAPACITY_KB = 5 * 1024;

export const DOM_ACTION_TOOL_NAMES = new Set([
  'highlightCard',
  'clearHighlight',
  'changeCardChartType',
  'toggleCardData',
  'showCardData',
  'setCardTopN',
  'setCardHideOthers',
  'filterCard',
  'clearCardSelection',
  'resetCardZoom',
  'setRawDataVisibility',
  'setRawDataFilter',
  'setRawDataWholeWord',
  'setRawDataSort',
  'removeRawDataRows',
  'focusRawDataPanel',
  'removeCard',
  'removeAnalysisCard',
  'deleteCard',
  'deleteAnalysisCard',
  'renameCard',
  'setCardTitle',
  'updateCardTitle',
]);

export const MIN_ASIDE_WIDTH = 320;
export const MAX_ASIDE_WIDTH = 800;

export const ENABLE_PIPELINE_REPAIR = false;
