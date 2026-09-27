/** Embedded stylesheet for the analyst report HTML. */
export const reportStylesheet = `
    :root {
      color-scheme: light;
      --bg: #f0f2f5;
      --paper: #ffffff;
      --paper-soft: #f8f9fb;
      --ink: #1a1f2e;
      --muted: #64748b;
      --line: #e2e8f0;
      --line-strong: #cbd5e1;
      --accent: #2563eb;
      --accent-soft: #eff6ff;
      --warning: #b45309;
      --danger: #dc2626;
      --good: #16a34a;
    }
    * { box-sizing: border-box; }
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.6;
    }
    .viewer-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
    }
    .toolbar-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .toolbar-button {
      appearance: none;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      border-radius: 8px;
      padding: 0.5rem 1.25rem;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, box-shadow 0.15s;
    }
    .toolbar-button:hover {
      background: #1d4ed8;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
    }
    .toolbar-button.secondary {
      background: transparent;
      color: var(--ink);
      border-color: var(--line-strong);
    }
    .toolbar-button.secondary:hover {
      background: var(--paper-soft);
      box-shadow: none;
    }
    main.report-shell {
      max-width: 820px;
      margin: 0 auto;
      padding: 24px 16px 40px;
    }
    .paper_width,
    .printform,
    .printform_formatter_processed,
    .physical_page_wrapper,
    .printform_page {
      width: 780px;
      max-width: 100%;
    }
    .printform,
    .printform_formatter_processed {
      margin: 0 auto;
    }
    .printform_page {
      position: relative;
      margin: 0 auto 20px;
      padding-top: 24px;
      padding-bottom: 48px;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }
    body[data-printform-pages-ready="y"] .physical_page_wrapper,
    body[data-printform-pages-ready="y"] .printform_page {
      min-height: 1080px;
    }
    .div_page_break_before { height: 18px; }
    .pheader, .pheader_processed,
    .pdocinfo, .pdocinfo_processed,
    .prowheader, .prowheader_processed,
    .prowitem, .prowitem_processed,
    .ptac, .ptac_processed,
    .paddt, .paddt_processed,
    .pfooter_pagenum, .pfooter_pagenum_processed {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .pheader, .pheader_processed,
    .pdocinfo, .pdocinfo_processed,
    .prowitem, .prowitem_processed,
    .ptac, .ptac_processed,
    .paddt, .paddt_processed {
      padding: 0 0 14px;
    }
    .report-shell-table,
    .report-shell-table_processed {
      table-layout: fixed;
      border-collapse: collapse;
      background: transparent;
      width: 780px;
    }
    .report-shell-col--gutter {
      width: 24px;
    }
    .report-shell-col--content {
      width: auto;
    }
    .report-shell-table td,
    .report-shell-table_processed td {
      padding: 0;
      border-bottom: none;
      vertical-align: top;
      background: transparent;
    }
    .report-shell-gutter,
    .report-shell-gutter_processed {
      width: 24px;
    }
    .report-shell-content {
      padding-bottom: 16px;
    }
    .report-header-card {
      border: none;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #f1f5f9;
      border-radius: 10px;
      padding: 28px 24px 24px;
    }
    .report-header-card .eyebrow { color: #94a3b8; font-size: 10px; letter-spacing: 0.22em; }
    .report-header-card h1 { color: #ffffff; font-size: 22px; letter-spacing: -0.01em; }
    .report-header-card p { color: #cbd5e1; }
    .report-header-card .meta-line { color: #64748b; font-size: 10px; }
    .report-header-card .badge { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); color: #e2e8f0; }
    .report-header-card .badge-good { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.1); }
    .report-header-card .badge-warning { color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.1); }
    .report-header-card .badge-danger { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.1); }
    .report-header-card .badge-neutral { color: #94a3b8; border-color: rgba(148,163,184,0.2); }
    .report-header-card .hero-stat { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); border-radius: 8px; }
    .report-header-card .hero-stat .eyebrow { color: #94a3b8; font-size: 10px; }
    .report-header-card .hero-stat-value { color: #ffffff; font-size: 20px; }
    .docinfo-card,
    .supporting-card,
    .narrative-sheet,
    .kpi-card,
    .chart-card {
      border: 1px solid var(--line);
      background: var(--paper-soft);
      border-radius: 8px;
    }
    .docinfo-card,
    .narrative-sheet {
      padding: 20px 22px;
    }
    .supporting-card,
    .kpi-card {
      padding: 16px;
    }
    .chart-card {
      padding: 16px;
      background: var(--paper);
    }
    .pfooter_pagenum, .pfooter_pagenum_processed {
      position: absolute;
      right: 0;
      bottom: 18px;
      left: 0;
      padding: 0;
      color: var(--muted);
      font-size: 11px;
    }
    .page-number-shell {
      text-align: right;
    }
    h1, h2, h3, h4 {
      margin: 0 0 8px;
      line-height: 1.25;
    }
    h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    h2 { font-size: 16px; font-weight: 700; }
    h3 { font-size: 14px; font-weight: 600; }
    h4 {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    p { margin: 0 0 10px; }
    p:last-child { margin-bottom: 0; }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      background: rgba(100, 116, 139, 0.08);
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .meta-line {
      color: var(--muted);
      font-size: 11px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid transparent;
      background: var(--paper-soft);
    }
    .badge-neutral { color: var(--muted); border-color: var(--line); }
    .badge-good { color: var(--good); border-color: rgba(22, 163, 74, 0.2); background: rgba(22, 163, 74, 0.06); }
    .badge-warning { color: var(--warning); border-color: rgba(180, 83, 9, 0.2); background: rgba(180, 83, 9, 0.06); }
    .badge-danger { color: var(--danger); border-color: rgba(220, 38, 38, 0.18); background: rgba(220, 38, 38, 0.06); }
    .badge-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .hero-stat {
      border: 1px solid var(--line);
      background: #fff;
      padding: 12px 14px;
      border-radius: 8px;
    }
    .hero-stat-value {
      font-size: 20px;
      font-weight: 700;
      margin-top: 4px;
    }
    .docinfo-card {
      display: grid;
      gap: 12px;
    }
    .contents-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .contents-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
      text-decoration: none;
      background: #fff;
      font-size: 12px;
      font-weight: 600;
      transition: border-color 0.15s, background 0.15s;
    }
    .contents-item:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-end;
      padding: 0 24px 8px;
      margin-top: 4px;
    }
    .report-row__body {
      padding: 0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--ink);
    }
    .kpi-value-good { color: var(--good); }
    .kpi-value-warning { color: var(--warning); }
    .kpi-value-neutral { color: var(--ink); }
    .kpi-note {
      color: var(--muted);
      font-size: 11px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .visual-surface {
      border: 1px solid var(--line);
      background: #fff;
      padding: 14px;
      border-radius: 6px;
    }
    .visual-surface svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .narrative-grid--short {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .chart-warning {
      margin-top: 10px;
    }
    .bullet-list, .compact-list {
      margin: 0;
      padding-left: 18px;
    }
    .compact-list li, .bullet-list li {
      margin-bottom: 4px;
    }
    .empty-state {
      color: var(--muted);
      font-style: italic;
    }
    .finding-high { border-left: 4px solid var(--good); }
    .finding-medium { border-left: 3px solid var(--warning); }
    .finding-low { border-left: 3px solid var(--line); }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      background: var(--paper-soft);
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: none; }
    .recommended-actions-list {
      counter-reset: action;
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    .recommended-actions-list li {
      counter-increment: action;
      padding: 0.5em 0 0.5em 2em;
      position: relative;
      line-height: 1.6;
      border-bottom: 1px solid var(--line);
    }
    .recommended-actions-list li:last-child {
      border-bottom: none;
    }
    .recommended-actions-list li::before {
      content: counter(action) ".";
      position: absolute;
      left: 0;
      font-weight: 700;
      color: var(--accent);
    }
    .caveat-notice {
      padding: 10px 14px;
      border: 1px solid rgba(180, 83, 9, 0.2);
      border-radius: 6px;
      background: rgba(180, 83, 9, 0.04);
      font-size: 11px;
      color: #92400e;
    }
    .caveat-notice h4 {
      color: #92400e;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .section-intro-card h2 {
      color: var(--accent);
    }
    @media (max-width: 960px) {
      main.report-shell {
        max-width: none;
        padding: 12px;
      }
      .paper_width,
      .printform,
      .printform_formatter_processed,
      .physical_page_wrapper,
      .printform_page {
        width: calc(100vw - 24px);
      }
      .contents-grid,
      .hero-stats,
      .kpi-grid,
      .narrative-grid--short {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 720px) {
      .viewer-toolbar {
        align-items: flex-start;
        flex-direction: column;
      }
      .card-header {
        flex-direction: column;
      }
      .badge-stack {
        justify-content: flex-start;
      }
    }
    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      body { background: #fff; }
      .viewer-toolbar { display: none !important; }
      main.report-shell {
        max-width: none;
        padding: 0;
        margin: 0;
      }
      .printform_page {
        width: auto;
        margin: 0;
        border: none;
        box-shadow: none;
        page-break-after: always;
      }
      .hero-stats {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .contents-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .kpi-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .narrative-grid--short {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .printform_page {
        border-radius: 0;
        border: none;
        box-shadow: none;
      }
      .report-header-card {
        border-radius: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .printform_page:last-child { page-break-after: auto; }
      .div_page_break_before { display: none; }
    }
`;
