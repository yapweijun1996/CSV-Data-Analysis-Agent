import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getZoomOptions } from './common';

export const createScatterChartConfig = (props: ChartConfigProps): any => {
    const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
    const { xValueColumn, yValueColumn } = plan;
    const hasSelection = selectedIndices.length > 0;
    
    if (!xValueColumn || !yValueColumn) return {};

    const scatterData = data.map(d => ({ x: d[xValueColumn], y: d[yValueColumn] }));
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);

    return {
        type: 'scatter',
        data: {
            datasets: [{
                label: `${yValueColumn} vs ${xValueColumn}`,
                data: scatterData,
                backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                borderWidth: 1.5,
                pointRadius: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 7 : 4) : 5,
                pointHoverRadius: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 9 : 6) : 7,
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: { ...commonOptions.scales.x, title: { display: true, text: xValueColumn, color: '#64748b' } },
                y: { ...commonOptions.scales.y, title: { display: true, text: yValueColumn, color: '#64748b' } }
            },
            plugins: { ...commonOptions.plugins, zoom: getZoomOptions(onZoomChange) }
        }
    };
};
