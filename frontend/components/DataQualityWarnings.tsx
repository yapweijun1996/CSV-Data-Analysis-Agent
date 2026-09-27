
import React, { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, AppStore } from '../store/useAppStore';
import { IconWarning } from '../icons/IconWarning';
import { summarizeDataQualityForEndUser } from '../services/data/dataProfiler';
import { getTranslation } from '../utils/localization';

const DataQualityWarningsComponent: React.FC = () => {
    const { dataWarnings, intakeWarnings, language } = useAppStore((state: AppStore) => ({
        dataWarnings: state.agentMemoryRun?.findings.warnings.map(w => w.message) ?? state.dataQualityIssues ?? [],
        intakeWarnings: state.csvData?.intakeDetection?.warnings ?? [],
        language: state.settings.language,
    }), shallow);
    const [showTechnical, setShowTechnical] = useState(false);

    const warningMessages = Array.isArray(dataWarnings) ? dataWarnings : [];
    const intakeWarningMessages = intakeWarnings.map(warning => warning.message);
    const hasWarnings = warningMessages.length > 0 || intakeWarningMessages.length > 0;
    if (!hasWarnings) return null;

    const endUserResult = warningMessages.length > 0
        ? summarizeDataQualityForEndUser(warningMessages)
        : null;
    const userSummary = endUserResult?.userSummary
        ?? getTranslation('data_warnings_intake_reported', language, { count: intakeWarningMessages.length });
    const technicalDetail = endUserResult?.technicalDetail ?? null;

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-card p-4 shadow-sm">
            <div className="flex items-center mb-2">
                <IconWarning className="text-amber-600 w-5 h-5 mr-2" />
                <h3 className="text-amber-800 font-semibold text-sm uppercase tracking-wide">
                    {getTranslation('data_warnings_title', language)}
                </h3>
            </div>
            <p className="text-sm text-amber-800">{userSummary}</p>
            {intakeWarningMessages.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-white/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        {getTranslation('data_warnings_intake_label', language)}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-800">
                        {intakeWarningMessages.slice(0, 3).map(message => (
                            <li key={message}>- {message}</li>
                        ))}
                    </ul>
                </div>
            )}
            {technicalDetail && (
                <details
                    open={showTechnical}
                    onToggle={(e) => setShowTechnical((e.target as HTMLDetailsElement).open)}
                    className="mt-2"
                >
                    <summary className="cursor-pointer text-xs font-medium text-amber-600 hover:text-amber-800">
                        {getTranslation('data_warnings_technical_toggle', language)}
                    </summary>
                    <p className="mt-1 rounded-md bg-white/50 p-2 text-xs text-amber-700 font-mono">
                        {technicalDetail}
                    </p>
                </details>
            )}
            <p className="mt-2 text-xs text-amber-700">
                {getTranslation('data_warnings_footer', language)}
            </p>
        </div>
    );
};

export const DataQualityWarnings = React.memo(DataQualityWarningsComponent);
