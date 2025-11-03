const BASE_SKILLS = [
  {
    id: 'group_sum',
    label: 'Sum by Category',
    intents: ['analysis'],
    description: 'Aggregate a numeric value by a categorical column (default to bar chart).',
    planTemplate: {
      chartType: 'bar',
      aggregation: 'sum',
      groupByColumn: '<categoricalColumn>',
      valueColumn: '<numericColumn>',
      title: 'Sum of <numericColumn> by <categoricalColumn>',
      description: 'Shows how <numericColumn> totals distribute across <categoricalColumn>.',
    },
  },
  {
    id: 'group_count',
    label: 'Count Records',
    intents: ['analysis', 'monitoring'],
    description: 'Count rows per categorical field for distribution overviews.',
    planTemplate: {
      chartType: 'bar',
      aggregation: 'count',
      groupByColumn: '<categoricalColumn>',
      title: 'Record count by <categoricalColumn>',
      description: 'Counts how many rows map to each <categoricalColumn> category.',
    },
  },
  {
    id: 'top_n_metric',
    label: 'Top-N Breakdown',
    intents: ['analysis', 'insight'],
    description: 'Highlight the top categories by a numeric metric with automatic Others bucket.',
    planTemplate: {
      chartType: 'bar',
      aggregation: 'sum',
      groupByColumn: '<categoricalColumn>',
      valueColumn: '<numericColumn>',
      defaultTopN: 8,
      defaultHideOthers: true,
      title: 'Top <N> <categoricalColumn> by <numericColumn>',
      description: 'Focuses on the highest contributors and groups the remainder into Others.',
    },
  },
  {
    id: 'time_series',
    label: 'Time Series Trend',
    intents: ['analysis', 'forecast'],
    description: 'Plot numeric values across a temporal axis (line chart).',
    planTemplate: {
      chartType: 'line',
      aggregation: 'sum',
      groupByColumn: '<timeColumn>',
      valueColumn: '<numericColumn>',
      title: '<numericColumn> trend over <timeColumn>',
      description: 'Line chart summarizing how <numericColumn> changes over time.',
    },
  },
  {
    id: 'data_cleaning_remove',
    label: 'Remove Rows',
    intents: ['cleaning'],
    description: 'Remove rows that match a value or pattern in a column.',
    domActionTemplate: {
      toolName: 'removeRawDataRows',
      column: '<column>',
      values: '<value or list>',
      operator: 'equals',
    },
  },
  {
    id: 'data_cleaning_split',
    label: 'Split Column',
    intents: ['cleaning'],
    description: 'Split a column into multiple fields using JavaScript transformation.',
    transformHint: 'Use execute_js_code with a function that maps each row to expanded fields.',
  },
];

export const getSkillCatalog = (intent = 'general') => {
  const target = intent.toLowerCase();
  return BASE_SKILLS.filter(skill => !skill.intents || skill.intents.includes(target));
};

export const listAllSkills = () => [...BASE_SKILLS];
