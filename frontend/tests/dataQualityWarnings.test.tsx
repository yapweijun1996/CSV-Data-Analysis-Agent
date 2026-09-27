import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityWarnings } from '../components/DataQualityWarnings';
import { summarizeDataQualityIssues, summarizeDataQualityForEndUser } from '../services/data/dataProfiler';
import * as useAppStoreModule from '../store/useAppStore';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

describe('data quality warning summaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('summarizes repeated high-missing warnings into a short user-facing message', () => {
        const summary = summarizeDataQualityIssues([
            "Column 'Reference Number' has a high percentage of missing values (94%).",
            "Column 'Master Number' has a high percentage of missing values (100%).",
            "Column 'Project Code' has a high percentage of missing values (96%).",
            "Column 'Barcode' has a high percentage of missing values (100%).",
        ]);

        expect(summary).toContain('4 columns are mostly empty');
        expect(summary).toContain('AI will treat them as low-priority');
        expect(summary).toContain('Reference Number, Master Number, Project Code');
    });

    it('produces user-friendly summary without technical instructions', () => {
        const result = summarizeDataQualityForEndUser([
            "Column 'NET TOTAL FOREX' contains comma-formatted numbers (e.g. \"1,234.56\"). Strip commas with replace_values before casting to avoid SQL type errors.",
            "Column 'GST' contains comma-formatted numbers (e.g. \"1,234.56\"). Strip commas with replace_values before casting to avoid SQL type errors.",
        ]);

        expect(result).not.toBeNull();
        expect(result!.userSummary).toContain('auto-corrected during cleaning');
        expect(result!.userSummary).not.toContain('replace_values');
        expect(result!.userSummary).not.toContain('cast_column');
        expect(result!.technicalDetail).toContain('Comma-formatted columns (auto-corrected)');
    });

    it('separates user summary from technical detail for missing-value warnings', () => {
        const result = summarizeDataQualityForEndUser([
            "Column 'Reference Number' has a high percentage of missing values (94%).",
            "Column 'Master Number' has a high percentage of missing values (100%).",
        ]);

        expect(result).not.toBeNull();
        expect(result!.userSummary).toContain('mostly empty');
        expect(result!.userSummary).toContain('low-priority');
        expect(result!.technicalDetail).toContain('Reference Number (94%)');
    });

    it('renders user-friendly summary for end users', () => {
        const store = {
            agentMemoryRun: null,
            dataQualityIssues: [
                "Column 'Reference Number' has a high percentage of missing values (94%).",
                "Column 'Master Number' has a high percentage of missing values (100%).",
                "Column 'Project Code' has a high percentage of missing values (96%).",
                "Column 'Barcode' has a high percentage of missing values (100%).",
            ],
            settings: { language: 'English' },
        };
        (useAppStoreModule.useAppStore as any).mockImplementation((selector: any) => selector(store));

        render(<DataQualityWarnings />);

        expect(screen.getByText(/4 columns have mostly empty values/i)).toBeInTheDocument();
        expect(screen.getByText(/Full diagnostics are available/i)).toBeInTheDocument();
        expect(screen.queryByText(/Column 'Reference Number' has a high percentage of missing values/i)).not.toBeInTheDocument();
    });

    it('surfaces CSV intake warnings when structural parsing confidence is low', () => {
        const store = {
            agentMemoryRun: null,
            dataQualityIssues: [],
            csvData: {
                intakeDetection: {
                    warnings: [
                        {
                            code: 'low_confidence',
                            message: 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.',
                        },
                    ],
                },
            },
            settings: { language: 'English' },
        };
        (useAppStoreModule.useAppStore as any).mockImplementation((selector: any) => selector(store));

        render(<DataQualityWarnings />);

        expect(screen.getByText(/CSV structure check found 1 issue/i)).toBeInTheDocument();
        expect(screen.getByText(/CSV Structure Warnings/i)).toBeInTheDocument();
        expect(screen.getByText(/CSV dialect detection confidence is limited/i)).toBeInTheDocument();
    });
});
