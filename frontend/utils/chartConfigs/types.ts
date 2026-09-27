import { ChartType, CsvRow, AnalysisPlan } from '../../types';

export interface ChartConfigProps {
    chartType: ChartType;
    data: CsvRow[];
    plan: AnalysisPlan;
    selectedIndices: number[];
    onElementClick: (index: number, event: MouseEvent) => void;
    onZoomChange: (isZoomed: boolean) => void;
    disableAnimation?: boolean;
    showDataLabels?: boolean;
}
