import type { CsvData, DataPreparationPlan } from '../../types';
import type { CleaningRuntimeState } from './orchestration/cleaningRuntimePolicy';
import {
    buildCleaningVerificationReport,
    getVerificationFailureSignal,
    getVerificationFailureDetail,
    getVerificationFailureReason,
    getVerificationSignalValue,
    getWideCrosstabReasonFromVerification,
    isRecoverableCleaningSignalKey,
} from './reportShapeVerification';

export const getWideCrosstabReason = (
    rawData: CsvData | null,
    cleanedData: CsvData | null,
): string | null => getWideCrosstabReasonFromVerification(rawData, cleanedData);

export const verifyCleanedDatasetShape = (
    rawData: CsvData | null,
    cleanedData: CsvData | null,
    plan?: DataPreparationPlan | null,
    runtimeState?: Pick<CleaningRuntimeState, 'inspectedRaw' | 'dominantBlockResolved'> | null,
): { passed: boolean; reason: string | null; signalKey: string | null; detail: string | null } => {
    const report = buildCleaningVerificationReport(rawData, cleanedData, plan, runtimeState);
    const passed = report.overallStatus !== 'fail';
    return {
        passed,
        reason: passed ? null : getVerificationFailureReason(report),
        signalKey: passed ? null : getVerificationFailureSignal(report)?.key ?? null,
        detail: passed ? null : getVerificationFailureDetail(report),
    };
};

export { buildCleaningVerificationReport } from './reportShapeVerification';
export { isRecoverableCleaningSignalKey, getVerificationSignalValue } from './reportShapeVerification';
