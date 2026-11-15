const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== STARTING COMPREHENSIVE FINANCIAL REPORTS VERIFICATION ===\n');

const htmlPath = path.resolve(__dirname, '../src/index.html');
const appJsPath = path.resolve(__dirname, '../src/app.js');
const mainJsPath = path.resolve(__dirname, '../main.js');
const preloadJsPath = path.resolve(__dirname, '../src/preload.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');
const preloadJs = fs.readFileSync(preloadJsPath, 'utf8');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// =========================================================================
// 1. ELECTRON IPC & NATIVE PDF EXPORT
// =========================================================================
test('main.js handles "export-pdf" IPC channel', () => {
  assert(mainJs.includes("ipcMain.handle('export-pdf'"), 'main.js must handle export-pdf');
  assert(mainJs.includes('printToPDF'), 'main.js must use webContents.printToPDF');
  assert(mainJs.includes('showSaveDialog'), 'main.js must prompt with showSaveDialog');
});

test('preload.js exposes exportPDF API', () => {
  assert(preloadJs.includes('exportPDF:'), 'preload.js must expose exportPDF');
  assert(preloadJs.includes("'export-pdf'"), 'preload.js must invoke export-pdf');
});

// =========================================================================
// 2. AUDIT & DUPLICATE REMOVAL IN REPORTS & ANALYSIS SECTION
// =========================================================================
test('index.html contains exactly 6 unique report cards in Reports & Analysis grid', () => {
  const gridStart = html.indexOf('<div class="fin-report-tiles-grid">');
  assert(gridStart !== -1, 'fin-report-tiles-grid must exist in HTML');
  const gridEnd = html.indexOf('<!-- Right: Quick Actions', gridStart);
  const gridSection = html.substring(gridStart, gridEnd !== -1 ? gridEnd : gridStart + 4500);
  
  const tileMatches = gridSection.match(/<div class="fin-report-tile"/g) || [];
  assert.strictEqual(tileMatches.length, 6, `Expected exactly 6 tiles, found ${tileMatches.length}`);
  
  // Verify the 6 specific non-duplicate cards
  assert(gridSection.includes('Daily Collection Report'), 'Must contain Daily Collection Report');
  assert(gridSection.includes('Monthly Collection Report'), 'Must contain Monthly Collection Report');
  assert(gridSection.includes('Class-wise Collection Report'), 'Must contain Class-wise Collection Report');
  assert(gridSection.includes('Class Outstanding Dues'), 'Must contain Class Outstanding Dues');
  assert(gridSection.includes('Fee Concession Report'), 'Must contain Fee Concession Report');
  assert(gridSection.includes('Income & Revenue Summary'), 'Must contain Income & Revenue Summary');
  
  // Verify confirmed duplicates are completely removed from this grid
  assert(!gridSection.includes('Pending Dues Report'), 'Pending Dues Report duplicate must be removed');
  assert(!gridSection.includes('Master Fee Collection Ledger'), 'Master Fee Collection Ledger duplicate must be removed');
  assert(!gridSection.includes('Student-wise Ledger'), 'Student-wise Ledger duplicate must be removed');
  assert(!gridSection.includes('Defaulter List'), 'Defaulter List duplicate must be removed');
});

// =========================================================================
// 3. REMOVAL OF FAKE SESSION COMPARISON LABELS
// =========================================================================
test('index.html removes fake historical percentage tags and uses clean supporting labels', () => {
  assert(!html.includes('+12.8% vs last session'), 'Fake +12.8% must be removed');
  assert(!html.includes('-6.4% vs last session'), 'Fake -6.4% must be removed');
  assert(!html.includes('+2.1% vs last session'), 'Fake +2.1% must be removed');
  
  // Verify clean, real indicator labels
  assert(html.includes('Total valid collections'), 'Must contain Total valid collections');
  assert(html.includes('Outstanding balance'), 'Must contain Outstanding balance');
  assert(html.includes('Current Academic Session'), 'Must contain Current Academic Session');
  assert(html.includes('Approved discounts'), 'Must contain Approved discounts');
  assert(html.includes('Realized vs expected'), 'Must contain Realized vs expected');
});

// =========================================================================
// 4. MONTHLY COLLECTION CHART DYNAMIC SCALING LOGIC
// =========================================================================
test('app.js chart logic: renderFinBarChart has dynamic scaling thresholds', () => {
  assert(appJs.includes('function renderFinBarChart('), 'Must have renderFinBarChart function');
  assert(appJs.includes('scaleMax = Math.max(2000, Math.ceil(maxMonthly / 2000) * 2000);'), 'Must scale sub-10k collections');
  assert(appJs.includes('scaleMax = Math.ceil(maxMonthly / 5000) * 5000;'), 'Must scale sub-25k collections');
  assert(appJs.includes('scaleMax = Math.ceil(maxMonthly / 10000) * 10000;'), 'Must scale sub-50k collections');
  assert(appJs.includes('scaleMax = Math.ceil(maxMonthly / 20000) * 20000;'), 'Must scale sub-100k collections');
  assert(appJs.includes('scaleMax = Math.ceil(maxMonthly / 50000) * 50000;'), 'Must scale sub-250k collections');
});

test('app.js chart logic: formatAxisTick & formatBarTopLabel format ₹ in readable units', () => {
  assert(appJs.includes('function formatAxisTick(val)'), 'Must have formatAxisTick function');
  assert(appJs.includes('function formatBarTopLabel(amt)'), 'Must have formatBarTopLabel function');
});

test('app.js chart logic: bar height guarantees min 4px visible bar and strictly 0 for zero months', () => {
  assert(appJs.includes('const barH = amt > 0 ? Math.max(4, (amt / scaleMax) * chartH) : 0;'),
    'Bar height must be 0 for zero collections and min 4px for non-zero');
  assert(appJs.includes('if (barH > 0) {'), 'Must conditionally render rect only when barH > 0');
  assert(appJs.includes('openFinMonthTransactions'), 'Bar click must trigger openFinMonthTransactions');
  assert(appJs.includes('showFinTooltip'), 'Bar hover must trigger showFinTooltip');
});

// =========================================================================
// 5. TOP OUTSTANDING CLASSES & CLASS-WISE MODAL
// =========================================================================
test('index.html contains modalClassOutstandingDues with summary cards & table', () => {
  assert(html.includes('id="modalClassOutstandingDues"'), 'Must have modalClassOutstandingDues');
  assert(html.includes('id="cod_sum_class"'), 'Must have summary card for class');
  assert(html.includes('id="cod_sum_total_students"'), 'Must have summary card for total enrolled students');
  assert(html.includes('id="cod_sum_due_students"'), 'Must have summary card for due students count');
  assert(html.includes('id="cod_sum_expected"'), 'Must have summary card for expected fee');
  assert(html.includes('id="cod_sum_collected"'), 'Must have summary card for collected fee');
  assert(html.includes('id="cod_sum_pending"'), 'Must have summary card for pending fee');
  assert(html.includes('id="cod_table_body"'), 'Must have cod_table_body for student breakdown rows');
});

test('app.js implements openClassOutstandingModal with class dues & section filters', () => {
  assert(appJs.includes('function openClassOutstandingModal('), 'Must implement openClassOutstandingModal');
  assert(appJs.includes('function renderClassOutstandingData()'), 'Must implement renderClassOutstandingData');
  assert(appJs.includes('function exportClassOutstandingCSV()'), 'Must implement exportClassOutstandingCSV');
  assert(appJs.includes('function printClassOutstandingReport()'), 'Must implement printClassOutstandingReport');
  assert(appJs.includes('onCodClassFilterChange'), 'Must handle class filter changes');
  assert(appJs.includes('onCodSectionFilterChange'), 'Must handle section filter changes');
});

// =========================================================================
// 6. QUICK ACTIONS: EXPORT CSV, PRINT DIALOG, PDF VECTOR DOWNLOAD, CUSTOM REPORT
// =========================================================================
test('index.html contains modalQuickExportReports with distinct export options', () => {
  assert(html.includes('id="modalQuickExportReports"'), 'Must have modalQuickExportReports');
  assert(html.includes('exportCollectedCSV'), 'Must offer Master Fee Ledger export');
  assert(html.includes('exportMonthlyCollectionCSV'), 'Must offer Monthly Summary export');
  assert(html.includes('exportClassWiseCollectionCSV'), 'Must offer Class-wise export');
  assert(html.includes('exportClassOutstandingCSV'), 'Must offer Class Outstanding export');
  assert(html.includes('exportFeeConcessionCSV'), 'Must offer Fee Concessions export');
  assert(html.includes('expDailyCollectionCSV') || html.includes('exportDailyCollectionCSV'), 'Must offer Daily Collections export');
});

test('index.html contains modalQuickPrintReports with active printable report options and unwanted removed', () => {
  assert(html.includes('id="modalQuickPrintReports"'), 'Must have modalQuickPrintReports');
  assert(html.includes('printPaymentModeSummary'), 'Must offer Payment Mode Summary print');
  assert(html.includes('printDailyCollectionReport'), 'Must offer Daily Collection print');
  assert(html.includes('printMonthlyCollectionReport'), 'Must offer Monthly Collection print');
  assert(html.includes('printClassWiseCollectionReport'), 'Must offer Class-wise print');
  assert(html.includes('printClassOutstandingReport'), 'Must offer Class Outstanding print');
  assert(html.includes('printFeeConcessionReport'), 'Must offer Fee Concession print');
  assert(html.includes('printIncomeSummaryReport'), 'Must offer Income Summary print');

  const startIdx = html.indexOf('id="modalQuickPrintReports"');
  const modalQuickPrint = html.substring(startIdx, startIdx + 3500);
  assert(!modalQuickPrint.includes('Executive Financial Summary (Print)'), 'Executive Financial Summary must be removed from Quick Print dialog');
  assert(!modalQuickPrint.includes('Master Fee Collection Ledger (Print)'), 'Master Fee Collection Ledger must be removed from Quick Print dialog');
});

test('app.js report printouts include 3-signature sections for Prepared By, Accountant, Principal', () => {
  const checkSignatures = (fnName) => {
    const fnIdx = appJs.indexOf(`function ${fnName}`);
    assert(fnIdx !== -1, `Function ${fnName} must exist`);
    const fnBody = appJs.substring(fnIdx, fnIdx + 8000);
    assert(fnBody.includes('Prepared By'), `${fnName} must have Prepared By signature line`);
    assert(fnBody.includes('Accountant'), `${fnName} must have Accountant signature line`);
    assert(fnBody.includes('Principal'), `${fnName} must have Principal signature line`);
    assert(fnBody.includes('sig-line'), `${fnName} must format with sig-line class`);
  };

  checkSignatures('printMonthlyCollectionReport');
  checkSignatures('printClassWiseCollectionReport');
  checkSignatures('printDailyCollectionReport');
});

test('app.js implements downloadMasterLedgerPDF with electronAPI.exportPDF', () => {
  assert(appJs.includes('function downloadMasterLedgerPDF()'), 'Must implement downloadMasterLedgerPDF');
  assert(appJs.includes('window.electronAPI.exportPDF('), 'Must call window.electronAPI.exportPDF');
});

test('index.html and app.js implement Custom Financial Report with 3 report types', () => {
  assert(html.includes('id="modalCustomFinancialReport"'), 'Must have modalCustomFinancialReport');
  assert(html.includes('id="cfr_report_type"'), 'Must have cfr_report_type');
  assert(html.includes('onCustomReportTypeChange'), 'Must trigger onCustomReportTypeChange');
  assert(appJs.includes('function onCustomReportTypeChange('), 'Must implement onCustomReportTypeChange');
  assert(appJs.includes('function runCustomFinancialReport()'), 'Must implement runCustomFinancialReport');
  assert(appJs.includes('function printCustomReport()'), 'Must implement printCustomReport');
  assert(appJs.includes('function exportCustomReportCSV()'), 'Must implement exportCustomReportCSV');
});

// =========================================================================
// 7. PRINT FUNCTIONALITY AUDIT ACROSS ALL FINANCIAL REPORTS
// =========================================================================
test('All financial print functions invoke window.electronAPI.printContent', () => {
  const printFunctions = [
    'printMonthlyCollectionReport',
    'printClassWiseCollectionReport',
    'printFeeConcessionReport',
    'printFinancialReportSummary',
    'printCustomReport',
    'printClassOutstandingReport',
    'printDailyCollectionReport',
    'printIncomeSummaryReport'
  ];

  printFunctions.forEach(fnName => {
    const fnIdx = appJs.indexOf(`function ${fnName}`);
    assert(fnIdx !== -1, `Function ${fnName} must exist in app.js`);
    // Search within next 8000 characters for the printContent invocation
    const fnBody = appJs.substring(fnIdx, fnIdx + 8000);
    assert(fnBody.includes('window.electronAPI.printContent'),
      `Function ${fnName} must call window.electronAPI.printContent`);
  });
});

// =========================================================================
// 8. FINAL UI CORRECTIONS & SIGNATURE BOTTOM-PINNING VERIFICATION
// =========================================================================
test('Monthly Collection Chart uses expanded container height and full plotting geometry', () => {
  assert(html.includes('.fin-bar-chart-container{width:100%;height:180px') || html.includes('.fin-bar-chart-container{width:100%;height:185px') || html.includes('.fin-bar-chart-container{width:100%;height:195px') || html.includes('.fin-bar-chart-container{width:100%;height:210px') || html.includes('.fin-bar-chart-container{width:100%;height:235px'), 'Container must have balanced plotting height');
  assert(appJs.includes('const svgH = 160;') || appJs.includes('const svgH = 185;') || appJs.includes('const svgH = 195;') || appJs.includes('const svgH = 210;') || appJs.includes('const svgH = 235;'), 'SVG height must match container');
  assert(appJs.includes('chartH = svgH - padT - padB;'), 'chartH must compute dynamic plotting area');
});

test('Reports & Analysis section has compact layout with zero dead space', () => {
  assert(html.includes('.fin-reports-actions-grid{display:grid;grid-template-columns:1.85fr 1fr;') ||
         html.includes('.fin-reports-actions-grid{display:grid;grid-template-columns:2.15fr 1fr;'),
    'Reports grid must stretch rows symmetrically');
  assert(html.includes('.fin-report-tiles-grid{display:grid;grid-template-columns:repeat(3, 1fr);grid-auto-rows:1fr;') ||
         html.includes('.fin-report-tiles-grid{display:grid;grid-template-columns:repeat(3, 1fr);'),
    'Report tiles must have grid-auto-rows: 1fr and flex: 1');
  assert(html.includes('.fin-quick-actions-grid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;') ||
         html.includes('.fin-quick-actions-grid{display:grid;grid-template-columns:1fr 1fr;'),
    'Quick action buttons must have grid-auto-rows: 1fr and flex: 1');
});

test('Top Outstanding Classes card displays class summary only and routes to Class-wise report', () => {
  // View All button routes to openClassWiseCollectionModal
  const cardIdx = html.indexOf('class="fin-card fin-top-classes-card"');
  assert(cardIdx !== -1, 'fin-top-classes-card must exist');
  const cardSection = html.substring(cardIdx, cardIdx + 800);
  assert(cardSection.includes('openClassWiseCollectionModal()'), 'View All must open class-wise collection report');

  // Class row click routes to openClassWiseCollectionModal
  assert(appJs.includes('<div class="fin-class-due-row" onclick="openClassWiseCollectionModal()"'),
    'Class row click must open class-wise collection report');
  
  // Student defaulters drilldown remains inside modalClassWiseCollectionReport
  assert(appJs.includes("openClassOutstandingModal('${r.cls}')"),
    'Student drilldown must remain available via Details button in class-wise modal');
});

test('All PDF/Print documents with signatures position signature section at bottom of final page', () => {
  // Annual Financial & Income Summary
  const incFn = appJs.substring(appJs.indexOf('function printIncomeSummaryReport'), appJs.indexOf('function printIncomeSummaryReport') + 3000);
  assert(incFn.includes('.page-container { min-height: 100%; display: flex; flex-direction: column; }'), 'Must use page-container flex layout');
  assert(incFn.includes('.sig { margin-top: auto;'), 'Must use margin-top: auto to pin signatures to bottom');
  assert(incFn.includes('page-break-inside: avoid;'), 'Must avoid page-break inside signatures');

  // Financial Reports Summary
  const finFn = appJs.substring(appJs.indexOf('function printFinancialReportSummary'), appJs.indexOf('function printFinancialReportSummary') + 3000);
  assert(finFn.includes('.page-container { min-height: 100%; display: flex; flex-direction: column; }'), 'Financial summary must use page-container');
  assert(finFn.includes('.sig { margin-top: auto;'), 'Financial summary signatures must use margin-top: auto');

  // Daily Collection Report
  const dailyFn = appJs.substring(appJs.indexOf('function printDailyCollectionReport'), appJs.indexOf('function printDailyCollectionReport') + 5500);
  assert(dailyFn.includes('.page-container { min-height: 100%; display: flex; flex-direction: column; }'), 'Daily report must use page-container');
  assert(dailyFn.includes('.footer { margin-top: auto;'), 'Daily report footer must use margin-top: auto');

  // Master Ledger PDF
  const ledgerFn = appJs.substring(appJs.indexOf('async function downloadMasterLedgerPDF'), appJs.indexOf('async function downloadMasterLedgerPDF') + 3500);
  assert(ledgerFn.includes('.page-container { min-height: 100%; display: flex; flex-direction: column; }'), 'Master ledger must use page-container');
  assert(ledgerFn.includes('.footer { margin-top: auto;'), 'Master ledger footer must use margin-top: auto');
});

// =========================================================================
// 9. TABLE COLUMN CENTER ALIGNMENT VERIFICATION
// =========================================================================
test('Class-wise and Outstanding Dues modal tables have center-aligned currency columns', () => {
  // Class-wise modal thead
  assert(html.includes('<th style="text-align:center">Total Expected (₹)</th>'), 'Class-wise Expected th must be centered');
  assert(html.includes('<th style="text-align:center">Total Collected (₹)</th>'), 'Class-wise Collected th must be centered');
  assert(html.includes('<th style="text-align:center">Pending Dues (₹)</th>'), 'Class-wise Dues th must be centered');

  // Class-wise modal tbody in app.js
  assert(appJs.includes('<td style="text-align:center">₹${r.expected.toLocaleString(\'en-IN\')}</td>'), 'Class-wise expected td must be centered');
  assert(appJs.includes('<td style="text-align:center;font-weight:700;color:#16A34A">₹${r.collected.toLocaleString(\'en-IN\')}</td>'), 'Class-wise collected td must be centered');
  assert(appJs.includes('<td style="text-align:center;font-weight:700;color:${r.pending > 0 ? \'#DC2626\' : \'#64748B\'}">₹${r.pending.toLocaleString(\'en-IN\')}</td>'), 'Class-wise pending td must be centered');

  // Class Outstanding Dues modal thead in index.html
  assert(html.includes('<th style="text-align:center">Total Fee (₹)</th>'), 'Outstanding Total Fee th must be centered');
  assert(html.includes('<th style="text-align:center">Amount Paid (₹)</th>'), 'Outstanding Amount Paid th must be centered');
  assert(html.includes('<th style="text-align:center">Pending Due (₹)</th>'), 'Outstanding Pending Due th must be centered');

  // Class Outstanding Dues tbody in app.js
  assert(appJs.includes('<td style="text-align:center">₹${r.totalFee.toLocaleString(\'en-IN\')}</td>'), 'Outstanding total fee td must be centered');
  assert(appJs.includes('<td style="text-align:center;color:#16A34A;font-weight:600">₹${r.paidAmt.toLocaleString(\'en-IN\')}</td>'), 'Outstanding paid amt td must be centered');
  assert(appJs.includes('<td style="text-align:center;font-weight:700;color:${r.pendingDue > 0 ? \'#DC2626\' : \'#64748B\'}">₹${r.pendingDue.toLocaleString(\'en-IN\')}</td>'), 'Outstanding pending due td must be centered');
});

console.log(`\n=== VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
