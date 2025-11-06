import { describe, it, expect } from 'vitest';

import {
  normaliseBooleanFlag,
  resolveBooleanFromKeys,
  collectStringList,
  parseTopNValue,
  parseIndexValue,
  normaliseChartType,
  pickFirstString,
  parseValueList,
} from '../utils/domActionUtils.js';

describe('domActionUtils', () => {
  describe('normaliseBooleanFlag / resolveBooleanFromKeys', () => {
    it('normalises various truthy/falsy inputs', () => {
      expect(normaliseBooleanFlag(true)).toBe(true);
      expect(normaliseBooleanFlag(1)).toBe(true);
      expect(normaliseBooleanFlag('YES')).toBe(true);
      expect(normaliseBooleanFlag(false)).toBe(false);
      expect(normaliseBooleanFlag(0)).toBe(false);
      expect(normaliseBooleanFlag('No')).toBe(false);
      expect(normaliseBooleanFlag('maybe')).toBeNull();
    });

    it('resolves boolean value from multiple keys', () => {
      expect(
        resolveBooleanFromKeys(
          { enabled: 'ON', disabled: false },
          ['disabled', 'enabled']
        )
      ).toBe(false);
      expect(resolveBooleanFromKeys({ foo: 'bar', show: 'true' }, ['show'])).toBe(true);
      expect(resolveBooleanFromKeys({}, ['missing'])).toBeNull();
    });
  });

  describe('collectStringList / pickFirstString', () => {
    it('collects unique string tokens from arrays or CSV values', () => {
      const list = collectStringList(
        { ids: [' card-1 ', 'card-2'], alias: 'card-2,card-3' },
        ['ids', 'alias']
      );
      expect(list).toEqual(['card-1', 'card-2', 'card-3']);
    });

    it('picks the first non-empty string from provided keys', () => {
      expect(pickFirstString({ a: '', b: ' value ', c: 'other' }, ['a', 'b', 'c'])).toBe('value');
      expect(pickFirstString({}, ['missing'])).toBeNull();
    });
  });

  describe('parse helpers', () => {
    it('parses Top-N values and handles aliases', () => {
      expect(parseTopNValue(5)).toEqual({ valid: true, value: 5 });
      expect(parseTopNValue(' 8 ')).toEqual({ valid: true, value: 8 });
      expect(parseTopNValue('all')).toEqual({ valid: true, value: null });
      expect(parseTopNValue('zero')).toEqual({ valid: false });
    });

    it('parses row indices with optional base offset', () => {
      expect(parseIndexValue(4)).toBe(4);
      expect(parseIndexValue('#10', 1)).toBe(9);
      expect(parseIndexValue('invalid')).toBeNull();
    });

    it('normalises chart type aliases', () => {
      expect(normaliseChartType('Bar Chart')).toBe('bar');
      expect(normaliseChartType('donut')).toBe('doughnut');
      expect(normaliseChartType('scatter plot')).toBe('scatter');
      expect(normaliseChartType('unknown')).toBeNull();
    });

    it('parses flexible value lists', () => {
      expect(parseValueList(['A', 'B'])).toEqual(['A', 'B']);
      expect(parseValueList('A, B; C')).toEqual(['A', 'B; C']);
      expect(parseValueList(null)).toEqual([]);
    });
  });
});
