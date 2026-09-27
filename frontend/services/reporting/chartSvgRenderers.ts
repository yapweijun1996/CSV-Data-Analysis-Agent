/**
 * Low-level SVG rendering helpers for report charts.
 *
 * Extracted from renderReportChartSvg.ts to keep each file under 300 lines.
 * Only the four chart-level renderers are exported; the geometric / formatting
 * utilities remain module-private.
 */

import type { ReportChartPayload } from '../../types';

// ---------------------------------------------------------------------------
// Formatting helpers (private)
// ---------------------------------------------------------------------------

const numberFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

export const escapeXml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const wrapLabel = (value: string, maxChars = 26, maxLines = 2): string[] => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return ['Untitled'];
    }

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        if (current) {
            lines.push(current);
            current = word;
        } else {
            lines.push(`${word.slice(0, Math.max(0, maxChars - 1))}…`);
            current = '';
        }

        if (lines.length >= maxLines - 1) {
            break;
        }
    }

    if (current && lines.length < maxLines) {
        lines.push(current);
    }

    if (words.join(' ').length > lines.join(' ').length && lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        lines[lines.length - 1] = lastLine.length >= maxChars
            ? `${lastLine.slice(0, Math.max(0, maxChars - 1))}…`
            : `${lastLine}…`;
    }

    return lines.slice(0, maxLines);
};

// ---------------------------------------------------------------------------
// Geometry helpers (private)
// ---------------------------------------------------------------------------

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
};

const describeArc = (
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    innerRadius = 0,
): string => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    if (innerRadius <= 0) {
        return [
            `M ${centerX} ${centerY}`,
            `L ${start.x} ${start.y}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
            'Z',
        ].join(' ');
    }

    const innerStart = polarToCartesian(centerX, centerY, innerRadius, endAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle);

    return [
        `M ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
        'Z',
    ].join(' ');
};

const buildBarColor = (value: number, index: number): string => {
    const positivePalette = ['#264f7d', '#356897', '#4a83b5', '#699cc8', '#6b8c55', '#4f7a42'];
    const negativePalette = ['#8a392d', '#a94c3d', '#c46654', '#d98a6f', '#e7b39a', '#f1d7c8'];
    const palette = value < 0 ? negativePalette : positivePalette;
    return palette[index % palette.length];
};

const cleanChartSubtitle = (valueColumn: string | undefined): string => {
    if (!valueColumn) return 'Metric';
    return valueColumn
        .replace(/^(sum_|total_|row_|count_)/i, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim() || 'Metric';
};

// ---------------------------------------------------------------------------
// Chart renderers (exported)
// ---------------------------------------------------------------------------

export const renderBarChart = (payload: ReportChartPayload): string => {
    const labels = payload.displayLabels?.length ? payload.displayLabels : payload.labels;
    const rowCount = payload.numericValues.length;
    const width = 860;
    const leftLabelWidth = 228;
    const valueColumnWidth = 118;
    const chartX = leftLabelWidth + 26;
    const chartWidth = width - chartX - valueColumnWidth - 22;
    const topPadding = 28;
    const rowHeight = 26;
    const rowGap = 18;
    const chartHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;
    const height = topPadding + chartHeight + 30;
    const minValue = Math.min(...payload.numericValues, 0);
    const maxValue = Math.max(...payload.numericValues, 0);
    const valueRange = Math.max(1, maxValue - minValue);
    const zeroX = chartX + ((0 - minValue) / valueRange) * chartWidth;
    const maxGuideX = chartX + ((maxValue - minValue) / valueRange) * chartWidth;
    const axisLabel = `${cleanChartSubtitle(payload.valueColumn)} by ${payload.groupByColumn ?? 'Group'}`;

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(payload.title)}" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, Helvetica, sans-serif; font-size: 12px;">
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fffefb" />
  <text x="0" y="14" font-size="10" font-weight="700" letter-spacing="1.2" fill="#7a6f64">${escapeXml(axisLabel)}</text>
  <line x1="${chartX}" y1="${topPadding - 4}" x2="${chartX + chartWidth}" y2="${topPadding - 4}" stroke="#d9d0c5" stroke-width="1" />
  <line x1="${maxGuideX}" y1="${topPadding - 4}" x2="${maxGuideX}" y2="${topPadding + chartHeight + 4}" stroke="#ece2d4" stroke-width="1" />
  <line x1="${zeroX}" y1="${topPadding - 4}" x2="${zeroX}" y2="${topPadding + chartHeight + 4}" stroke="#cdbca8" stroke-width="1.5" stroke-dasharray="4 4" />
  <text x="${zeroX}" y="${topPadding - 10}" text-anchor="middle" font-size="10" fill="#7a6f64">Zero baseline</text>
  ${labels.map((label, index) => {
        const y = topPadding + index * (rowHeight + rowGap);
        const value = payload.numericValues[index];
        const valueX = chartX + ((value - minValue) / valueRange) * chartWidth;
        const barX = value >= 0 ? zeroX : valueX;
        const barWidth = Math.abs(valueX - zeroX);
        const textLines = wrapLabel(label, 24, 2);
        const labelY = y + rowHeight / 2 - (textLines.length - 1) * 6;
        const valueLabelX = chartX + chartWidth + 18;

        return `
    <g class="chart-row ${value < 0 ? 'negative' : 'positive'}">
      ${textLines.map((line, lineIndex) => `
      <text x="0" y="${labelY + lineIndex * 12}" font-size="11" fill="#2d271f">${escapeXml(line)}</text>
      `).join('')}
      <rect x="${chartX}" y="${y}" width="${chartWidth}" height="${rowHeight}" rx="9" fill="#f5efe4" />
      ${barWidth > 0
            ? `<rect x="${Math.min(barX, zeroX)}" y="${y}" width="${Math.max(2, barWidth)}" height="${rowHeight}" rx="9" fill="${buildBarColor(value, index)}" />`
            : `<circle cx="${zeroX}" cy="${y + rowHeight / 2}" r="4" fill="${buildBarColor(value, index)}" />`}
      <text x="${valueLabelX}" y="${y + rowHeight / 2 + 4}" text-anchor="start" font-size="11" font-weight="700" fill="#1f1a14">${escapeXml(payload.formattedValues[index])}</text>
    </g>`;
    }).join('')}
</svg>`;
};

export const renderLineChart = (payload: ReportChartPayload): string => {
    // Line chart labels come from the already-normalised payload — do not
    // re-sort here; the upstream buildReportChartPayload has already applied
    // ordinal / date sorting.
    const labels = payload.displayLabels?.length ? payload.displayLabels : payload.labels;
    const width = 860;
    const height = 334;
    const chartX = 58;
    const chartY = 36;
    const chartWidth = 712;
    const chartHeight = 190;

    // Zero-baseline policy for line charts:
    //   mixed domain  → include zero in range + show zero reference line
    //   positive-only → fit-data (better use of visual space)
    //   negative-only → fit-data
    const isMixed = payload.valueDomain === 'mixed';
    const maxValue = isMixed ? Math.max(...payload.numericValues, 0) : Math.max(...payload.numericValues);
    const minValue = isMixed ? Math.min(...payload.numericValues, 0) : Math.min(...payload.numericValues);
    const valueRange = Math.max(1, maxValue - minValue);
    const stepX = payload.numericValues.length === 1 ? 0 : chartWidth / (payload.numericValues.length - 1);
    const zeroY = chartY + chartHeight - ((0 - minValue) / valueRange) * chartHeight;
    const points = payload.numericValues.map((value, index) => {
        const x = chartX + stepX * index;
        const y = chartY + chartHeight - ((value - minValue) / valueRange) * chartHeight;
        return { x, y, value, label: labels[index], formattedValue: payload.formattedValues[index] };
    });

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(payload.title)}" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, Helvetica, sans-serif; font-size: 12px;">
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fffefb" />
  <text x="${chartX}" y="16" font-size="10" font-weight="700" letter-spacing="1.2" fill="#7a6f64">${escapeXml(`${cleanChartSubtitle(payload.valueColumn)} trend`)}</text>
  <line x1="${chartX}" y1="${chartY + chartHeight}" x2="${chartX + chartWidth}" y2="${chartY + chartHeight}" stroke="#d9d0c5" stroke-width="1.2" />
  <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartHeight}" stroke="#d9d0c5" stroke-width="1.2" />
  ${isMixed ? `<line x1="${chartX}" y1="${zeroY}" x2="${chartX + chartWidth}" y2="${zeroY}" stroke="#cdbca8" stroke-width="1.2" stroke-dasharray="4 4" />` : ''}
  <polyline fill="none" stroke="#264f7d" stroke-width="2.5" points="${points.map(point => `${point.x},${point.y}`).join(' ')}" />
  ${points.map((point, index) => `
    <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${buildBarColor(point.value, index)}" />
    ${wrapLabel(point.label, 20, 2).map((line, lineIndex) => `<text x="${point.x}" y="${chartY + chartHeight + 20 + lineIndex * 12}" text-anchor="middle" font-size="10.5" fill="#6b6156">${escapeXml(line)}</text>`).join('')}
    <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1f1a14">${escapeXml(point.formattedValue)}</text>
  `).join('')}
</svg>`;
};

export const renderCircularChart = (payload: ReportChartPayload, innerRadius: number): string => {
    const labels = payload.displayLabels?.length ? payload.displayLabels : payload.labels;
    const width = 860;
    const height = 340;
    const centerX = 176;
    const centerY = 174;
    const radius = 90;
    const total = payload.numericValues.reduce((sum, value) => sum + value, 0) || 1;
    let currentAngle = 0;

    const arcs = payload.numericValues.map((value, index) => {
        const segmentAngle = (value / total) * 360;
        const path = describeArc(centerX, centerY, radius, currentAngle, currentAngle + segmentAngle, innerRadius);
        currentAngle += segmentAngle;
        return `<path d="${path}" fill="${buildBarColor(value, index)}" />`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(payload.title)}" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, Helvetica, sans-serif; font-size: 12px;">
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fffefb" />
  <text x="36" y="20" font-size="10" font-weight="700" letter-spacing="1.2" fill="#7a6f64">${escapeXml(`${cleanChartSubtitle(payload.valueColumn)} mix`)}</text>
  ${arcs}
  <text x="${centerX}" y="${centerY - 4}" text-anchor="middle" font-size="10" fill="#7a6f64">Total</text>
  <text x="${centerX}" y="${centerY + 16}" text-anchor="middle" font-size="18" font-weight="700" fill="#1f1a14">${escapeXml(numberFormatter.format(total))}</text>
  ${labels.map((label, index) => {
        if (payload.numericValues[index] === 0) return '';
        const lines = wrapLabel(label, 28, 2);
        const nonZeroIndex = payload.numericValues.slice(0, index).filter(v => v !== 0).length;
        const y = 48 + nonZeroIndex * 42;
        return `
    <rect x="366" y="${y}" width="12" height="12" rx="3" fill="${buildBarColor(payload.numericValues[index], index)}" />
    ${lines.map((line, lineIndex) => `
    <text x="388" y="${y + 10 + lineIndex * 11}" font-size="11" fill="#2d271f">${escapeXml(line)}</text>
    `).join('')}
    <text x="790" y="${y + 10}" text-anchor="end" font-size="11" font-weight="700" fill="#1f1a14">${escapeXml(payload.formattedValues[index])}</text>
    `;
    }).join('')}
</svg>`;
};

// ---------------------------------------------------------------------------
// Fallback SVG for unrecoverable payloads
// ---------------------------------------------------------------------------

/**
 * Return a minimal placeholder SVG when a payload cannot be rendered.
 * Communicates the error title and the first blocking error without
 * exposing raw data.
 */
export const renderFallbackSvg = (
    title: string,
    reason: string,
): string => {
    const safeTitle = escapeXml(title || 'Chart');
    const safeReason = escapeXml(reason || 'Unable to render chart.');
    return (
        `<svg viewBox="0 0 860 120" role="img" aria-label="${safeTitle}" ` +
        `xmlns="http://www.w3.org/2000/svg" ` +
        `style="font-family: Arial, Helvetica, sans-serif; font-size: 13px;">` +
        `<rect x="0" y="0" width="860" height="120" rx="12" fill="#faf8f4" stroke="#d0c8bd" stroke-width="1.5"/>` +
        `<text x="430" y="44" text-anchor="middle" font-size="13" font-weight="700" fill="#5a4e44">${safeTitle}</text>` +
        `<text x="430" y="72" text-anchor="middle" font-size="11" fill="#8a7d70">⚠ ${safeReason}</text>` +
        `<text x="430" y="94" text-anchor="middle" font-size="10" fill="#bbb0a4">Chart data could not be rendered — see the data table below.</text>` +
        `</svg>`
    );
};
