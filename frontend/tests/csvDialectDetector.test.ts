import { describe, expect, it } from 'vitest';
import { detectCsvDialect, parseCsvTextWithDetection } from '../services/data/csvDialectDetector';

describe('csvDialectDetector', () => {
    it('detects comma-separated csv with high confidence', () => {
        const detection = detectCsvDialect([
            'Name,Amount',
            'Alice,10',
            'Bob,20',
        ].join('\n'));

        expect(detection.delimiter).toBe(',');
        expect(detection.confidence).toBe('high');
        expect(detection.strategy).toBe('scored_candidate');
    });

    it('detects semicolon and tab delimiters correctly', () => {
        const semicolon = detectCsvDialect([
            'Name;Amount',
            'Alice;10',
            'Bob;20',
        ].join('\n'));
        const tab = detectCsvDialect([
            'Name\tAmount',
            'Alice\t10',
            'Bob\t20',
        ].join('\n'));

        expect(semicolon.delimiter).toBe(';');
        expect(tab.delimiter).toBe('\t');
    });

    it('keeps quoted delimiters inside single-quoted fields from becoming real separators', () => {
        const detection = detectCsvDialect([
            "'Name'|'Comment'",
            "'Alice'|'North|East'",
            "'Bob'|'South|West'",
        ].join('\n'));

        expect(detection.delimiter).toBe('|');
        expect(detection.quoteChar).toBe('\'');
        expect(detection.confidence).not.toBe('low');
    });

    it('flags malformed quotes and keeps import output available', () => {
        const parsed = parseCsvTextWithDetection([
            '"Name","Comment"',
            '"Alice","broken quote',
            '"Bob","ok"',
        ].join('\n'));

        expect(parsed.rawRows.length).toBeGreaterThan(0);
        expect(parsed.detection.warnings.some(warning => warning.code === 'malformed_quote')).toBe(true);
        expect(['papaparse_auto_fallback', 'raw_line_fallback', 'scored_candidate']).toContain(parsed.detection.strategy);
        expect(parsed.detection.confidence).toBe('low');
    });

    it('does not treat apostrophes in free text as malformed single-quote csv fields', () => {
        const parsed = parseCsvTextWithDetection([
            '"SO No.","Comment","Amount"',
            `"SOM1115","The ProLiant DL380 has always been the star player in HP's rack server line-up, and we've seen iLO3's remote control improve.","278,850.00"`,
            '"SOE12166","Pulled to Production Routing.","4,800.00"',
        ].join('\n'));

        expect(parsed.detection.delimiter).toBe(',');
        expect(parsed.detection.quoteChar).toBe('"');
        expect(parsed.detection.warnings.some(warning => warning.code === 'malformed_quote')).toBe(false);
    });

    it('marks mixed delimiters as a warning while still returning rows', () => {
        const parsed = parseCsvTextWithDetection([
            'Name,Amount',
            'Alice,10',
            'Bob;20',
        ].join('\n'));

        expect(parsed.rawRows.length).toBe(3);
        expect(parsed.detection.warnings.some(warning => warning.code === 'mixed_delimiter')).toBe(true);
    });

    it('prefers comma over pipe for ERP report-style CSVs with embedded pipe chars', () => {
        // Real-world ERP export: metadata header rows + footer with pipe chars
        const parsed = parseCsvTextWithDetection([
            'KINETICS INDUSTRIES (DEMO 2011) LIMITED,',
            ',Inward RFQ Listing All Records Reporting Date : 01-01-2010Through 31-12-2010,',
            ',Date,Document Number,Reference Number,Master Number,Status,Party Code,Party Name,Stock Code,Stock Description,Remarks,Qty,UOM,CCY,Unit Price Forex,Amount Forex,Unit Price Local,Amount Local,Sales Executive',
            '"1","31-12-2010","RFQ-10001","","","Open","GL","General Ledger","","micro switch","","5.00","","SGD","0.0000","0.00","0.0000","0.00",""',
            '"2","31-12-2010","RFQ-10001","","","Open","GL","General Ledger","VINYL MP41","MP41 MARLEY","","11.00","PCS","SGD","3.2500","35.75","3.2500","35.75",""',
            '"","18-03-2026@ 09:34 | m8 | 124.155.214.47",""',
        ].join('\n'));

        expect(parsed.detection.delimiter).toBe(',');
        expect(parsed.rawRows[0].length).toBeGreaterThan(1);
    });

    it('returns low confidence when runner-up candidates remain close or structure is weak', () => {
        const detection = detectCsvDialect([
            '2026/03/01',
            '2026/03/02',
            '2026/03/03',
        ].join('\n'));

        expect(detection.confidence).toBe('low');
        expect(detection.warnings.some(warning => warning.code === 'low_confidence')).toBe(true);
    });
});
