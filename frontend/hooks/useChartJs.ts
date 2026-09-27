import { useEffect } from 'react';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import ChartDataLabels from 'chartjs-plugin-datalabels';

let pluginsRegistered = false;

/**
 * A custom hook to ensure Chart.js plugins are registered only once.
 */
export const useChartJs = () => {
    useEffect(() => {
        if (!pluginsRegistered) {
            try {
                Chart.register(zoomPlugin, ChartDataLabels);
                // Disable datalabels by default — individual charts opt in
                // via their own plugin config when showDataLabels is true.
                Chart.defaults.plugins.datalabels = { display: false };
                pluginsRegistered = true;
            } catch (error) {
                console.error('Failed to register chart plugins:', error);
            }
        }
    }, []);
};
