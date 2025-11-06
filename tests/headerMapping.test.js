import { describe, it, expect } from 'vitest';

import { createHeaderMapping, applyHeaderMapping } from '../utils/headerMapping.js';

describe('headerMapping utils', () => {
  it('builds mapping with fallback names when inferred headers are missing', () => {
    const metadata = {
      genericHeaders: ['column_1', 'column_2', 'column_3'],
      inferredHeaders: ['Invoice No', '', 'Amount'],
    };

    const result = createHeaderMapping(metadata);

    expect(result.mapping).toEqual({
      column_1: 'Invoice No',
      column_2: 'column_2',
      column_3: 'Amount',
    });
    expect(result.detected).toBe(2);
    expect(result.total).toBe(3);
    expect(result.hasUnmapped).toBe(true);
  });

  it('applies mapping to transform generic row keys', () => {
    const metadata = {
      genericHeaders: ['column_1', 'column_2'],
      inferredHeaders: ['Project', 'Amount'],
    };
    const { mapping } = createHeaderMapping(metadata);
    const remapped = applyHeaderMapping(
      {
        column_1: 'A1',
        column_2: '1000',
        column_3: 'Extra',
      },
      mapping
    );

    expect(remapped).toEqual({
      Project: 'A1',
      Amount: '1000',
      column_3: 'Extra',
    });
  });
});
