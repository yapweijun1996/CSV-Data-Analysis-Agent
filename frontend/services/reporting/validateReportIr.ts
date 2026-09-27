import type { ReportIr } from '../../types';

export interface ReportIrValidationResult {
    valid: boolean;
    errors: string[];
}

export const validateReportIr = (ir: ReportIr): ReportIrValidationResult => {
    const errors: string[] = [];

    if (!ir.reportId) {
        errors.push('reportId is required.');
    }
    if (!ir.generatedAt) {
        errors.push('generatedAt is required.');
    }
    if (!ir.dataset?.title) {
        errors.push('dataset.title is required.');
    }
    if (!ir.summary?.title) {
        errors.push('summary.title is required.');
    }
    if (!Array.isArray(ir.sections)) {
        errors.push('sections must be an array.');
    }
    if (!Array.isArray(ir.reportVisuals)) {
        errors.push('reportVisuals must be an array.');
    }
    if (!ir.appendix || !Array.isArray(ir.appendix.evidenceCatalog)) {
        errors.push('appendix.evidenceCatalog must be an array.');
    }

    const allowedEvidenceIds = new Set(ir.appendix?.evidenceCatalog?.map(entry => entry.id) ?? []);
    ir.sections
        .filter(section => section.type === 'findings')
        .forEach(section => {
            section.items.forEach(item => {
                item.evidenceRefs.forEach(ref => {
                    if (!allowedEvidenceIds.has(ref)) {
                        errors.push(`Unknown evidence ref "${ref}" in findings section.`);
                    }
                });
            });
        });

    ir.sections
        .filter(section => section.type === 'disagreements')
        .forEach(section => {
            section.items.forEach(item => {
                item.positions.forEach(position => {
                    position.evidenceRefs.forEach(ref => {
                        if (!allowedEvidenceIds.has(ref)) {
                            errors.push(`Unknown evidence ref "${ref}" in disagreement section.`);
                        }
                    });
                });
            });
        });

    if (ir.dataset.generationGate === 'blocked' && (ir.sections.length > 0 || ir.reportVisuals.length > 0)) {
        errors.push('Blocked reports must not contain sections or report visuals.');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};
