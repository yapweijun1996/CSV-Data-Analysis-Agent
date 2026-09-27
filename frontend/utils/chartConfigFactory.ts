import { ChartConfigProps } from './chartConfigs/types';
import { createBarChartConfig } from './chartConfigs/bar';
import { createHorizontalBarChartConfig } from './chartConfigs/horizontalBar';
import { createLineChartConfig } from './chartConfigs/line';
import { createAreaChartConfig } from './chartConfigs/area';
import { createPieChartConfig } from './chartConfigs/pie';
import { createPolarAreaChartConfig } from './chartConfigs/polarArea';
import { createScatterChartConfig } from './chartConfigs/scatter';
import { createComboChartConfig } from './chartConfigs/combo';
import { createRadarChartConfig } from './chartConfigs/radar';
import { createBubbleChartConfig } from './chartConfigs/bubble';
import { createStackedChartConfig } from './chartConfigs/stacked';
import { createMultiLineChartConfig } from './chartConfigs/multiLine';

export const createChartConfig = (props: ChartConfigProps): any => {
    switch (props.chartType) {
        case 'bar':
            return createBarChartConfig(props);
        case 'horizontal_bar':
            return createHorizontalBarChartConfig(props);
        case 'stacked_bar':
        case 'stacked_column':
            return createStackedChartConfig(props);
        case 'line':
            return createLineChartConfig(props);
        case 'area':
            return createAreaChartConfig(props);
        case 'pie':
        case 'doughnut':
            return createPieChartConfig(props);
        case 'polar_area':
            return createPolarAreaChartConfig(props);
        case 'scatter':
            return createScatterChartConfig(props);
        case 'combo':
            return createComboChartConfig(props);
        case 'radar':
            return createRadarChartConfig(props);
        case 'bubble':
            return createBubbleChartConfig(props);
        case 'multi_line':
            return createMultiLineChartConfig(props);
        default:
            return createBarChartConfig(props);
    }
};
