const toColumnSet = (columnProfiles, csvData) => {
  if (Array.isArray(columnProfiles) && columnProfiles.length) {
    return new Set(columnProfiles.map(profile => profile?.name).filter(Boolean));
  }
  const firstRow = Array.isArray(csvData?.data) && csvData.data.length ? csvData.data[0] : null;
  return firstRow ? new Set(Object.keys(firstRow)) : new Set();
};

const normaliseName = name => (typeof name === 'string' ? name.trim() : '');

const createIssue = (severity, message, details = {}) => ({
  severity,
  message,
  details,
});

const severityOrder = ['info', 'warning', 'critical'];

const sortIssues = issues =>
  [...issues].sort((a, b) => severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity));

export const auditAnalysisState = state => {
  const issues = [];
  const columnSet = toColumnSet(state?.columnProfiles, state?.csvData);
  const datasetName = normaliseName(state?.csvMetadata?.reportTitle) || 'Current dataset';

  if (!Array.isArray(state?.csvData?.data) || state.csvData.data.length === 0) {
    issues.push(
      createIssue('critical', 'Dataset is missing or empty. Upload a CSV before running analysis.', {})
    );
  }

  if (!columnSet.size) {
    issues.push(
      createIssue('critical', 'No columns detected in the dataset. Check CSV parsing results.', {})
    );
  }

  const numericColumns = new Set(
    (state?.columnProfiles || [])
      .filter(profile => profile?.type === 'numerical')
      .map(profile => profile.name)
      .filter(Boolean)
  );

  if (!Array.isArray(state?.analysisCards) || !state.analysisCards.length) {
    issues.push(
      createIssue('warning', 'No analysis cards are available. Ask the agent to generate insights.', {})
    );
  } else {
    state.analysisCards.forEach(card => {
      const plan = card.plan || {};
      const cardTitle = plan.title || card.id || 'Unnamed card';
      const chartType = normaliseName(plan.chartType);

      if (!chartType) {
        issues.push(
          createIssue('critical', `Card "${cardTitle}" is missing a chart type.`, { cardId: card.id })
        );
      }

      if (!Array.isArray(card.aggregatedData) || card.aggregatedData.length === 0) {
        issues.push(
          createIssue('warning', `Card "${cardTitle}" has no aggregated data.`, { cardId: card.id })
        );
      }

      const groupByColumn = normaliseName(plan.groupByColumn);
      const valueColumn = normaliseName(plan.valueColumn);
      const isCorrelation = plan.analysisType === 'correlation';
  
      if (chartType !== 'scatter') {
        if (!groupByColumn) {
          issues.push(
            createIssue('critical', `Card "${cardTitle}" is missing a group-by column.`, {
              cardId: card.id,
            })
          );
        } else if (!columnSet.has(groupByColumn) && !isCorrelation) {
          issues.push(
            createIssue('critical', `Card "${cardTitle}" references missing column "${groupByColumn}".`, {
              cardId: card.id,
              column: groupByColumn,
            })
          );
        }
  
        if (valueColumn) {
          if (!columnSet.has(valueColumn) && !isCorrelation) {
            issues.push(
              createIssue('critical', `Card "${cardTitle}" references missing value column "${valueColumn}".`, {
                cardId: card.id,
                column: valueColumn,
              })
            );
          } else if (!numericColumns.has(valueColumn) && !isCorrelation) {
            issues.push(
              createIssue(
                'warning',
                `Card "${cardTitle}" uses value column "${valueColumn}" that is not profiled as numerical.`,
                { cardId: card.id, column: valueColumn }
              )
            );
          }
        } else if (plan.aggregation !== 'count' && !isCorrelation) {
          issues.push(
            createIssue(
              'critical',
              `Card "${cardTitle}" requires a value column for aggregation "${plan.aggregation}".`,
              { cardId: card.id }
            )
          );
        }
      } else {
        const xColumn = normaliseName(plan.xValueColumn);
        const yColumn = normaliseName(plan.yValueColumn);
        if (!xColumn || !yColumn) {
          issues.push(
            createIssue('critical', `Scatter plot "${cardTitle}" is missing axis columns.`, {
              cardId: card.id,
            })
          );
        } else {
          [xColumn, yColumn].forEach(axis => {
            if (axis !== 'Row Index' && !columnSet.has(axis)) {
              issues.push(
                createIssue('critical', `Scatter plot "${cardTitle}" references missing column "${axis}".`, {
                  cardId: card.id,
                  column: axis,
                })
              );
            } else if (axis !== 'Row Index' && !numericColumns.has(axis)) {
              issues.push(
                createIssue(
                  'warning',
                  `Scatter plot "${cardTitle}" uses axis column "${axis}" that is not profiled as numerical.`,
                  { cardId: card.id, column: axis }
                )
              );
            }
          });
        }
      }

      if (Array.isArray(card.aggregatedData) && card.aggregatedData.length) {
        const sample = card.aggregatedData[0];
        if (groupByColumn && !(groupByColumn in sample)) {
          issues.push(
            createIssue(
              'warning',
              `Card "${cardTitle}" aggregated sample does not include the group-by column "${groupByColumn}".`,
              { cardId: card.id }
            )
          );
        }
        if (chartType !== 'scatter' && !('value' in sample)) {
          issues.push(
            createIssue(
              'warning',
              `Card "${cardTitle}" aggregated sample is missing the "value" field expected for Chart.js datasets.`,
              { cardId: card.id }
            )
          );
        }
      }
    });
  }

  if (!state?.aiCoreAnalysisSummary) {
    issues.push(
      createIssue(
        'info',
        'AI core analysis summary is empty. Consider regenerating the initial insight briefing.',
        {}
      )
    );
  }

  if (!state?.finalSummary) {
    issues.push(
      createIssue(
        'info',
        'Final executive summary is empty. Ask the agent to synthesize key takeaways.',
        {}
      )
    );
  }

  const stats = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 }
  );

  const summary =
    issues.length === 0
      ? `${datasetName}: No problems detected in current analysis pipeline.`
      : `${datasetName}: ${stats.critical} critical, ${stats.warning} warnings, ${stats.info} suggestions detected.`;

  return {
    dataset: datasetName,
    generatedAt: new Date().toISOString(),
    stats,
    issues: sortIssues(issues),
    summary,
  };
};
