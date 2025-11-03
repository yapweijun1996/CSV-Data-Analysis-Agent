const BASE_SKILLS = [
  {
    id: 'group_sum',
    label: 'Sum by Category',
    intents: ['analysis'],
    description: 'Aggregate a numeric value by a categorical column (default to bar chart).',
    priority: 30,
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
    priority: 35,
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
    priority: 40,
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
    priority: 45,
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
    id: 'correlation_matrix',
    label: 'Correlation Matrix',
    intents: ['analysis', 'insight'],
    description: 'Compute Pearson correlations among numeric columns and render as heatmap.',
    priority: 46,
    planTemplate: {
      analysisType: 'correlation',
      chartType: 'bar',
      valueColumns: '<numericColumns>',
      method: 'pearson',
      title: 'Correlation matrix for numeric columns',
      description: 'Matrix of pairwise correlations to reveal linear relationships.',
    },
  },
  {
    id: 'clustering_kmeans',
    label: 'K-Means Clustering',
    intents: ['analysis', 'insight'],
    description: 'Cluster data points into k groups over selected numeric features.',
    priority: 50,
    planTemplate: {
      analysisType: 'clustering_kmeans',
      chartType: 'scatter',
      featureColumns: '<numericColumns>',
      xValueColumn: '<xNumericColumn|auto>',
      yValueColumn: '<yNumericColumn|auto>',
      k: 3,
      standardize: true,
      title: 'K-Means clustering on &lt;featureColumns&gt;',
      description: 'Shows cluster assignments in 2D projection using &lt;xValueColumn&gt; vs &lt;yValueColumn&gt;.',
    },
  },
  {
    id: 'time_series_decompose',
    label: 'Time Series Decomposition',
    intents: ['analysis', 'forecast'],
    description: 'Decompose a time series into trend, seasonal, and residual components.',
    priority: 48,
    planTemplate: {
      analysisType: 'time_series_decompose',
      chartType: 'line',
      groupByColumn: '<timeColumn>',
      valueColumn: '<numericColumn>',
      frequency: '<auto|7|12|365>',
      method: 'moving_average',
      window: 7,
      title: 'Decomposition of &lt;numericColumn&gt; over &lt;timeColumn&gt;',
      description: 'Separates series into trend, seasonality, and noise using &lt;method&gt;.',
    },
  },
  {
    id: 'predict_linear',
    label: 'Linear Forecast',
    intents: ['analysis', 'forecast'],
    description: 'Fit a simple linear regression to forecast future values.',
    priority: 52,
    planTemplate: {
      analysisType: 'prediction_linear',
      chartType: 'line',
      groupByColumn: '<timeColumn>',
      valueColumn: '<numericColumn>',
      horizon: 10,
      includeConfidence: true,
      title: 'Linear forecast for &lt;numericColumn&gt; over &lt;timeColumn&gt;',
      description: 'Predicts next &lt;horizon&gt; periods with a linear model.',
    },
  },
  {
    id: 'data_cleaning_remove',
    label: 'Remove Rows',
    intents: ['cleaning'],
    description: 'Remove rows that match a value or pattern in a column.',
    priority: 20,
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
    priority: 25,
    transformHint: 'Use execute_js_code with a function that maps each row to expanded fields.',
  },
  {
    id: 'repair_missing_chart_type',
    label: 'Fix Missing Chart Type',
    intents: ['repair'],
    description: 'Assign a default bar chart when a plan lacks chartType.',
    priority: 5,
    repair: {
      type: 'plan_patch',
      patch: { chartType: 'bar' },
      condition: issue =>
        issue?.details?.cardId && issue.message?.toLowerCase().includes('missing a chart type'),
    },
  },
  {
    id: 'repair_missing_group_by',
    label: 'Fix Missing Group-By',
    intents: ['repair'],
    description: 'Set the group-by column to the first categorical field when missing.',
    priority: 6,
    repair: {
      type: 'plan_patch',
      patch: { groupByColumn: '<categoricalFallback>' },
      condition: issue =>
        issue?.details?.cardId && issue.message?.toLowerCase().includes('missing a group-by column'),
    },
  },
  {
    id: 'repair_value_column',
    label: 'Fix Value Column',
    intents: ['repair'],
    description: 'Switch aggregation to count when no numeric value column exists.',
    priority: 7,
    repair: {
      type: 'plan_patch',
      patch: { aggregation: 'count', valueColumn: null },
      condition: issue =>
        issue?.details?.cardId &&
        issue.message?.toLowerCase().includes('requires a value column'),
    },
  },
  {
    id: 'repair_missing_column',
    label: 'Replace Missing Column',
    intents: ['repair'],
    description: 'Swap broken columns for available fallbacks based on audit findings.',
    priority: 8,
    repair: {
      type: 'plan_patch',
      patch: {
        groupByColumn: '<categoricalFallback>',
        valueColumn: '<numericFallback>',
      },
      condition: issue =>
        issue?.details?.cardId && issue.message?.toLowerCase().includes('references missing column'),
    },
  },
  {
    id: 'audit_report',
    label: 'Explain Audit Findings',
    intents: ['repair', 'analysis'],
    description: 'Provide a summarised audit report for the agent to reason about next actions.',
    priority: 15,
    repair: {
      type: 'audit_summary',
    },
  },
];

export const getSkillCatalog = (intent = 'general') => {
  const target = intent.toLowerCase();
  return BASE_SKILLS.filter(skill => !skill.intents || skill.intents.includes(target)).sort(
    (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
  );
};

export const getRepairSkills = () =>
  BASE_SKILLS.filter(skill => skill.repair).sort(
    (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
  );

export const listAllSkills = () => [...BASE_SKILLS];
