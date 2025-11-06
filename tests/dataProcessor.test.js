import { describe, expect, it } from 'vitest';

import { executePlan } from '../utils/dataProcessor.js';

const buildPlan = () => ({
  chartType: 'bar',
  groupByColumn: 'Invoice Month',
  valueColumn: 'Amount',
  aggregation: 'sum',
});

describe('executePlan month sorting', () => {
  it('sorts month labels that include slash-delimited years', () => {
    const csvData = {
      data: [
        { 'Invoice Month': 'JAN/11', Amount: 970918 },
        { 'Invoice Month': 'MAY/10', Amount: 954451.56 },
        { 'Invoice Month': 'AUG/10', Amount: 821031.55 },
        { 'Invoice Month': 'OCT/10', Amount: 742835.73 },
        { 'Invoice Month': 'JUN/10', Amount: 616007.15 },
        { 'Invoice Month': 'NOV/10', Amount: 457468.48 },
        { 'Invoice Month': 'SEP/10', Amount: 417947.45 },
        { 'Invoice Month': 'MAR/10', Amount: 388645.4 },
        { 'Invoice Month': 'APR/10', Amount: 321265.76 },
        { 'Invoice Month': 'JUL/10', Amount: 316417.51 },
        { 'Invoice Month': 'DEC/10', Amount: 77311.5 },
        { 'Invoice Month': 'JAN/10', Amount: 60623.79 },
        { 'Invoice Month': 'FEB/10', Amount: 1682.04 },
      ],
    };

    const result = executePlan(csvData, buildPlan());
    const labels = result.map(entry => entry['Invoice Month']);

    expect(labels).toEqual([
      'JAN/10',
      'FEB/10',
      'MAR/10',
      'APR/10',
      'MAY/10',
      'JUN/10',
      'JUL/10',
      'AUG/10',
      'SEP/10',
      'OCT/10',
      'NOV/10',
      'DEC/10',
      'JAN/11',
    ]);
  });

  it('sorts month labels that include dash-delimited years', () => {
    const csvData = {
      data: [
        { 'Invoice Month': 'Oct-24', Amount: 100 },
        { 'Invoice Month': 'Sep-24', Amount: 100 },
        { 'Invoice Month': 'Nov-24', Amount: 100 },
      ],
    };

    const result = executePlan(csvData, buildPlan());
    const labels = result.map(entry => entry['Invoice Month']);

    expect(labels).toEqual(['Sep-24', 'Oct-24', 'Nov-24']);
  });
});

describe('executePlan quarter and day sorting', () => {
  it('sorts quarter labels even when they include prefixes or suffixes', () => {
    const csvData = {
      data: [
        { Quarter: 'FY24 Q1', Amount: 10 },
        { Quarter: 'Q4 FY23', Amount: 10 },
        { Quarter: 'Q2/23', Amount: 10 },
        { Quarter: 'Q3 2022', Amount: 10 },
      ],
    };

    const plan = {
      chartType: 'bar',
      groupByColumn: 'Quarter',
      valueColumn: 'Amount',
      aggregation: 'sum',
    };

    const result = executePlan(csvData, plan);
    const labels = result.map(entry => entry.Quarter);

    expect(labels).toEqual(['Q3 2022', 'Q2/23', 'Q4 FY23', 'FY24 Q1']);
  });

  it('sorts day-of-week labels that include punctuation', () => {
    const csvData = {
      data: [
        { Day: 'Fri/Shift', Amount: 5 },
        { Day: 'Mon.', Amount: 5 },
        { Day: 'Wed-', Amount: 5 },
        { Day: 'Tue,', Amount: 5 },
      ],
    };

    const plan = {
      chartType: 'bar',
      groupByColumn: 'Day',
      valueColumn: 'Amount',
      aggregation: 'sum',
    };

    const result = executePlan(csvData, plan);
    const labels = result.map(entry => entry.Day);

    expect(labels).toEqual(['Mon.', 'Tue,', 'Wed-', 'Fri/Shift']);
  });
});
