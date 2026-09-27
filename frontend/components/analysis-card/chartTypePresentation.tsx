import React from 'react';
import { ChartType } from '../../types';
import { IconBarChart } from '../../icons/IconBarChart';
import { IconHorizontalBarChart } from '../../icons/IconHorizontalBarChart';
import { IconLineChart } from '../../icons/IconLineChart';
import { IconAreaChart } from '../../icons/IconAreaChart';
import { IconPieChart } from '../../icons/IconPieChart';
import { IconDoughnutChart } from '../../icons/IconDoughnutChart';
import { IconPolarAreaChart } from '../../icons/IconPolarAreaChart';
import { IconScatterChart } from '../../icons/IconScatterChart';
import { IconComboChart } from '../../icons/IconComboChart';
import { IconRadarChart } from '../../icons/IconRadarChart';
import { IconBubbleChart } from '../../icons/IconBubbleChart';

export const chartTypeLabels: Record<ChartType, string> = {
    bar: 'Bar',
    horizontal_bar: 'Horizontal Bar',
    line: 'Line',
    multi_line: 'Multi Line',
    area: 'Area',
    pie: 'Pie',
    doughnut: 'Doughnut',
    polar_area: 'Polar Area',
    scatter: 'Scatter',
    combo: 'Combo',
    radar: 'Radar',
    bubble: 'Bubble',
    stacked_bar: 'Stacked Bar',
    stacked_column: 'Stacked Column',
};

interface ChartTypeIconProps {
    type: ChartType;
    className?: string;
}

const iconClassName = 'h-4 w-4';

export const ChartTypeIcon: React.FC<ChartTypeIconProps> = ({ type, className = iconClassName }) => {
    switch (type) {
        case 'bar':
        case 'stacked_bar':
        case 'stacked_column':
            return <IconBarChart className={className} />;
        case 'horizontal_bar':
            return <IconHorizontalBarChart className={className} />;
        case 'line':
        case 'multi_line':
            return <IconLineChart className={className} />;
        case 'area':
            return <IconAreaChart className={className} />;
        case 'pie':
            return <IconPieChart className={className} />;
        case 'doughnut':
            return <IconDoughnutChart className={className} />;
        case 'polar_area':
            return <IconPolarAreaChart className={className} />;
        case 'scatter':
            return <IconScatterChart className={className} />;
        case 'combo':
            return <IconComboChart className={className} />;
        case 'radar':
            return <IconRadarChart className={className} />;
        case 'bubble':
            return <IconBubbleChart className={className} />;
        default:
            return null;
    }
};
