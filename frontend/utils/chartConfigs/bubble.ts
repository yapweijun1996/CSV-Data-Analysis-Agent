import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getZoomOptions } from './common';

export const createBubbleChartConfig = (props: ChartConfigProps): any => {
    const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
    const { xValueColumn, yValueColumn, valueColumn } = plan;

    if (!xValueColumn || !yValueColumn || !valueColumn) return {};

    // Data should already be in {x, y, r} format from the executor.
    const bubbleData = data; 
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);

    return {
        type: 'bubble',
        data: {
            datasets: [{
                label: `${yValueColumn} vs ${xValueColumn} (Size: ${valueColumn})`,
                data: bubbleData,
                backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                borderWidth: 1.5,
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