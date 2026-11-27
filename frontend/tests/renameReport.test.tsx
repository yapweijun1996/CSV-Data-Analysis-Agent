import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RenameReportField } from '../components/RenameReportField';
import { normalizeReportName, MAX_REPORT_NAME_LENGTH } from '../services/storageService';

describe('normalizeReportName', () => {
    it('trims, collapses whitespace and returns null for empty input', () => {
        expect(normalizeReportName('  Q3   sales  ')).toBe('Q3 sales');
        expect(normalizeReportName('   ')).toBeNull();
        expect(normalizeReportName(null)).toBeNull();
    });
    it('caps the length', () => {
        expect(normalizeReportName('x'.repeat(500))?.length).toBe(MAX_REPORT_NAME_LENGTH);
    });
});

describe('RenameReportField', () => {
    it('commits on Enter and cancels on Escape without committing twice', () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        render(<RenameReportField initialValue="" placeholder="data.csv" language="English" onCommit={onCommit} onCancel={onCancel} />);
        const input = screen.getByPlaceholderText('data.csv');
        fireEvent.change(input, { target: { value: 'My report' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.blur(input);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('My report');
        expect(onCancel).not.toHaveBeenCalled();
    });
    it('cancels on Escape', () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        render(<RenameReportField initialValue="a" placeholder="d.csv" language="English" onCommit={onCommit} onCancel={onCancel} />);
        fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
    });
});
