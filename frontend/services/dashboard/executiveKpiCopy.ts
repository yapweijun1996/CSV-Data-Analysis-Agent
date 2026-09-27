import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';

type Language = Settings['language'];

const TOTAL_PREFIX_PATTERN = /^total\b/i;

const toDetailLabel = (value: string, language?: Language): string =>
    language === 'English' ? value.toLowerCase() : value;

export const buildTotalMetricKpiLabel = (metricLabel: string, language?: Language): string => {
    if (TOTAL_PREFIX_PATTERN.test(metricLabel)) {
        return metricLabel;
    }

    return getTranslation('executive_kpi_total_metric_label', language, { metric: metricLabel });
};

export const buildTopGroupKpiLabel = (groupLabel: string, language?: Language): string =>
    getTranslation('executive_kpi_top_group_label', language, { group: groupLabel });

export const buildGroupCountKpiLabel = (pluralGroupLabel: string, language?: Language): string =>
    getTranslation('executive_kpi_group_count_label', language, { groups: pluralGroupLabel });

export const buildInactiveKpiLabel = (pluralGroupLabel: string, language?: Language): string =>
    getTranslation('executive_kpi_inactive_label', language, { groups: pluralGroupLabel });

export const buildTopShareKpiLabel = (count: number, language?: Language): string =>
    getTranslation('executive_kpi_top_share_label', language, { count });

export const buildTotalMetricKpiDetail = ({
    rowCount,
    groupCount,
    pluralGroupLabel,
    language,
}: {
    rowCount?: number | null;
    groupCount: number;
    pluralGroupLabel: string;
    language?: Language;
}): string => (
    rowCount
        ? getTranslation('executive_kpi_total_detail_rows', language, { rows: rowCount.toLocaleString() })
        : getTranslation('executive_kpi_total_detail_groups', language, {
            count: groupCount.toLocaleString(),
            groups: toDetailLabel(pluralGroupLabel, language),
        })
);

export const buildTopGroupKpiDetail = ({
    topLabelValue,
    shareValue,
    metricLabel,
    language,
}: {
    topLabelValue: string | null;
    shareValue: string | null;
    metricLabel: string;
    language?: Language;
}): string => {
    if (!topLabelValue && shareValue) {
        return getTranslation('executive_kpi_top_group_detail_share_only', language, {
            share: shareValue,
            metric: toDetailLabel(metricLabel, language),
        });
    }
    if (!topLabelValue) {
        return getTranslation('executive_kpi_top_group_detail_unnamed', language);
    }
    return shareValue
        ? getTranslation('executive_kpi_top_group_detail', language, {
            group: topLabelValue,
            share: shareValue,
            metric: toDetailLabel(metricLabel, language),
        })
        : getTranslation('executive_kpi_top_group_detail_fallback', language, {
            group: topLabelValue,
        });
};

export const buildGroupCountKpiDetail = ({
    pluralGroupLabel,
    language,
}: {
    pluralGroupLabel: string;
    language?: Language;
}): string =>
    getTranslation('executive_kpi_group_count_detail', language, {
        groups: toDetailLabel(pluralGroupLabel, language),
    });

export const buildInactiveKpiDetail = ({
    statusLabel,
    language,
}: {
    statusLabel: string;
    language?: Language;
}): string =>
    getTranslation('executive_kpi_inactive_detail', language, {
        status: statusLabel,
    });

export const buildTopShareKpiDetail = ({
    count,
    pluralGroupLabel,
    language,
}: {
    count: number;
    pluralGroupLabel: string;
    language?: Language;
}): string =>
    getTranslation('executive_kpi_top_share_detail', language, {
        count,
        groups: toDetailLabel(pluralGroupLabel, language),
    });

export const buildPeriodDeltaLabel = (period: 'month' | 'day', language?: Language): string =>
    getTranslation(period === 'month' ? 'executive_kpi_delta_month' : 'executive_kpi_delta_day', language);

export const buildDistributionDeltaLabel = (groupLabel: string, language?: Language): string =>
    getTranslation('executive_kpi_delta_distribution', language, {
        group: groupLabel,
    });
