# Singapore HDB raw resale-price demo

`singapore-hdb-resale-prices.csv` is a reproducible union of the five official HDB resale-price CSV datasets published by data.gov.sg, covering January 1990 through the latest available month.

Run `npm run demo:hdb:refresh` to download the current source files and rebuild the CSV and its integrity manifest.

The refresh script does not clean, normalize, deduplicate, filter, or sort source values. It appends the official era files in chronological era order. Older datasets do not publish `remaining_lease`; the union CSV leaves that field empty for those rows. See `singapore-hdb-resale-prices.manifest.json` for dataset IDs, coverage, row counts, source hashes, and the final output hash.

`singapore-hdb-resale-prices-sample.csv` is a small fast-start sample of the full file: every 197th data row (about 5,000 rows, first row included), copied byte for byte in source order. It is not cleaned, so it keeps every era's quirks. Run `npm run demo:hdb:sample` after refreshing the full file to rebuild it; the manifest's `sample` block records its method, row count and SHA-256.
