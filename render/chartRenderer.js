import {
  COLORS,
  BORDER_COLORS,
  BG_COLORS,
  HIGHLIGHT_COLOR,
  HIGHLIGHT_BORDER_COLOR,
  DESELECTED_COLOR,
  DESELECTED_BORDER_COLOR,
} from '../state/constants.js';

let zoomPluginRegistered = false;

export const chartRenderingMethods = {
  destroyCharts() {
    this.chartInstances.forEach(chart => chart.destroy());
    this.chartInstances.clear();
  },

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
    const chartData = this.getCardDisplayData(card);
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
        wheel: { enabled: false },
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
        hasSelection
          ? (selectedSet.has(index) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR)
          : BORDER_COLORS[index % BORDER_COLORS.length]
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
  },

  renderCharts() {
    this.destroyCharts();
    this.state.analysisCards.forEach(card => {
      const canvas = this.querySelector(`#chart-${card.id}`);
      if (canvas) {
        this.createChart(card, canvas);
      }
    });
  },
};
