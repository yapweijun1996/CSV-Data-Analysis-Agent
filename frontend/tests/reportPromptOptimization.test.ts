import { describe, expect, it } from 'vitest';
import {
    createIntakeStructurePrompt,
    intakeStructureSystemPrompt,
} from '../services/prompts/intakeStructurePrompts';
import {
    createReportContextExtractionPrompt,
    reportContextExtractionSystemPrompt,
} from '../services/prompts/reportContextPrompts';
import {
    createDataPreparationPrompt,
    dataPreparationSystemPrompt,
} from '../services/prompts/dataPrompts';

describe('report prompt optimization', () => {
    it('keeps intake structure prompts focused on boundary detection only', () => {
        expect(intakeStructureSystemPrompt).toContain('locate CSV report boundaries');
        expect(intakeStructureSystemPrompt).toContain('schema-valid JSON object');

        const prompt = createIntakeStructurePrompt('Row evidence here');
        expect(prompt).toContain('Choose the CSV report boundaries');
        expect(prompt).toContain('Decision contract');
        expect(prompt).toContain('choose the later line immediately above the body as headerRowIndex');
        expect(prompt).toContain('summaryStartIndex');
    });

    it('keeps report context extraction prompts focused on explicit framing text only', () => {
        expect(reportContextExtractionSystemPrompt).toContain('extract framing context');
        expect(reportContextExtractionSystemPrompt).toContain('Do not invent parameter or footer lines');

        const prompt = createReportContextExtractionPrompt('Context block');
        expect(prompt).toContain('Extract framing context only');
        expect(prompt).toContain('Do not solve table structure here');
        expect(prompt).toContain('reportTitle');
        expect(prompt).toContain('parameterLines');
        expect(prompt).toContain('footerLines');
    });

    it('keeps data preparation prompts minimal and reshape-oriented for wide reports', () => {
        expect(dataPreparationSystemPrompt).toContain('smallest deterministic cleanup or reshape plan');

        const prompt = createDataPreparationPrompt('Dataset context', null, {
            wideTable: true,
            requiredLabelLayers: 2,
            hierarchySignal: true,
        });
        expect(prompt).toContain('Priority order');
        expect(prompt).toContain('If the dataset is pivot, crosstab, or wide-matrix shaped, convert it into a long table');
        expect(prompt).toContain('prefer `unpivot_columns`');
        expect(prompt).toContain('SeriesLabelL1');
        expect(prompt).toContain('hierarchyDepthColumn');
        expect(prompt).toContain('Zero-operation plans are invalid');
        expect(prompt).toContain('Do not emit JavaScript, pseudo-code, helpers, or custom parsing logic');
    });
});
