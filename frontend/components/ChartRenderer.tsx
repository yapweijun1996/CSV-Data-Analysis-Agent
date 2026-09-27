import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Chart from 'chart.js/auto';
import { ChartType, CsvRow, AnalysisPlan } from '../types';
import { useChartJs } from '../hooks/useChartJs';
import { createChartConfig } from '../utils/chartConfigFactory';
import {
    getCachedChart,
    setCachedChart,
    computeChartCacheKey,
    computeDataContentHash,
} from '../utils/chartCache';

export interface ChartRendererHandle {
    resetZoom: () => void;
    /** Capture the current chart as a base64 PNG data URL. */
    captureImage: () => string | null;
}
interface ChartRendererProps {
    /** Card ID for chart cache keying. When provided, enables PNG caching. */
    cardId?: string;
    chartType: ChartType;
    data: CsvRow[];
    plan: AnalysisPlan;
    selectedIndices: number[];
    onElementClick: (index: number, event: MouseEvent) => void;
    onZoomChange: (isZoomed: boolean) => void;
    disableAnimation?: boolean;
    showDataLabels?: boolean;
}

export const ChartRenderer = forwardRef<ChartRendererHandle, ChartRendererProps>((props, ref) => {
    useChartJs();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);
    const activeChartTypeRef = useRef<ChartType | null>(null);
    const callbackRef = useRef({
        onElementClick: props.onElementClick,
        onZoomChange: props.onZoomChange,
    });

    const {
        chartType,
        data,
        plan,
        selectedIndices,
        onElementClick,
        onZoomChange,
        disableAnimation,
        showDataLabels,
    } = props;

    const currentSpecKeyRef = useRef<string>('');

    useImperativeHandle(ref, () => ({
        resetZoom: () => {
            chartRef.current?.resetZoom();
        },
        captureImage: () => {
            // Check cache first
            if (props.cardId) {
                const cached = getCachedChart(props.cardId);
                if (cached && cached.specKey === currentSpecKeyRef.current) {
                    return cached.pngDataUrl;
                }
            }
            try { return canvasRef.current?.toDataURL('image/png') ?? null; }
            catch { return null; }
        },
    }));

    useEffect(() => {
        callbackRef.current = {
            onElementClick,
            onZoomChange,
        };
    }, [onElementClick, onZoomChange]);

    // Create or recreate chart only when chart type changes or on first mount.
    // Data/option changes are handled by the update effect below.
    useEffect(() => {
        if (!canvasRef.current || !plan) return;

        // Skip recreation if chart already exists and type hasn't changed
        if (chartRef.current && activeChartTypeRef.current === chartType) {
            return;
        }

        // Destroy previous chart before creating a new one
        chartRef.current?.destroy();
        chartRef.current = null;
        activeChartTypeRef.current = chartType;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        performance.mark('chart-create-start');
        const config = createChartConfig({
            chartType,
            data,
            plan,
            selectedIndices,
            disableAnimation,
            showDataLabels,
            onElementClick: (index: number, event: MouseEvent) => {
                callbackRef.current.onElementClick(index, event);
            },
            onZoomChange: (isZoomed: boolean) => {
                callbackRef.current.onZoomChange(isZoomed);
            },
        });

        chartRef.current = new Chart(ctx, config);
        performance.mark('chart-create-end');
        performance.measure('chart-create', 'chart-create-start', 'chart-create-end');
        // No cleanup — lifecycle managed by refs and the unmount effect below.
    }, [chartType, data, plan, selectedIndices, disableAnimation, showDataLabels]);

    // Incremental update: when data/options change but chart type stays the same,
    // update datasets and options in-place instead of destroying the chart.
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !plan) {
            return;
        }

        const nextConfig = createChartConfig({
            chartType,
            data,
            plan,
            selectedIndices,
            disableAnimation,
            showDataLabels,
            onElementClick: (index: number, event: MouseEvent) => {
                callbackRef.current.onElementClick(index, event);
            },
            onZoomChange: (isZoomed: boolean) => {
                callbackRef.current.onZoomChange(isZoomed);
            },
        });

        if (nextConfig.data) {
            chart.data.labels = nextConfig.data.labels ?? [];
            chart.data.datasets = nextConfig.data.datasets ?? [];
        }
        if (nextConfig.options) {
            chart.options.animation = nextConfig.options.animation;
            chart.options.onClick = nextConfig.options.onClick;
            chart.options.plugins = nextConfig.options.plugins;
            chart.options.scales = nextConfig.options.scales;
            chart.options.elements = nextConfig.options.elements;
            chart.options.layout = nextConfig.options.layout;
        }
        chart.update('none');

        // Store snapshot in chart cache after update
        if (props.cardId && canvasRef.current) {
            const specKey = computeChartCacheKey({
                chartType,
                dataRowCount: data.length,
                dataContentHash: computeDataContentHash(data),
                groupByColumn: plan.groupByColumn,
                valueColumn: plan.valueColumn,
                topN: plan.topN,
                hideOthers: plan.hideOthers,
                showDataLabels,
            });
            currentSpecKeyRef.current = specKey;
            try {
                const pngDataUrl = canvasRef.current.toDataURL('image/png');
                setCachedChart(props.cardId, { pngDataUrl, specKey, capturedAt: Date.now() });
            } catch { /* canvas tainted or unavailable — skip caching */ }
        }
    }, [chartType, data, plan, selectedIndices, disableAnimation, showDataLabels, props.cardId]);

    // Cleanup on unmount only
    useEffect(() => () => {
        chartRef.current?.destroy();
        chartRef.current = null;
        activeChartTypeRef.current = null;
    }, []);

    return <canvas ref={canvasRef} />;
});
