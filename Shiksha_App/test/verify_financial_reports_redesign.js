const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const demoDataPath = path.resolve(__dirname, '../../DEMO_TEST_KIT/demo_school_data_large.json');
const demoDB = JSON.parse(fs.readFileSync(demoDataPath, 'utf8'));

// Mock Electron IPC
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(demoDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => demoDataPath);
ipcMain.handle('export-csv', () => ({ success: true }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log(`[RENDERER L${line}] ${message}`);
  });

  await win.loadFile(path.resolve(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1200));

  console.log('=== TEST SUITE: FINANCIAL REPORTS REDESIGN VERIFICATION ===\n');

  try {
    const results = await win.webContents.executeJavaScript(`
      (() => {
        try {
          const report = { passed: 0, failed: 0, errors: [] };
          function assert(cond, desc) {
            if (cond) {
              report.passed++;
              console.log('  ✓ ' + desc);
            } else {
              report.failed++;
              report.errors.push(desc);
              console.error('  ✗ FAIL: ' + desc);
            }
          }

          // TEST 1: Page Navigation
          showPage('financial-reports');
          const pageEl = document.getElementById('page-financial-reports');
          assert(pageEl && pageEl.classList.contains('active'), 'page-financial-reports exists and becomes active');

          // TEST 2: Header Elements
          const headerTitle = document.querySelector('.fin-title')?.textContent;
          assert(headerTitle === 'Financial & Collection Reports', 'Header title matches "Financial & Collection Reports"');
          
          const searchInp = document.getElementById('fin_global_search');
          assert(searchInp !== null, 'Global search input exists');

          const sessSelect = document.getElementById('fin_sess_select');
          assert(sessSelect !== null && sessSelect.value.includes('2026'), 'Session pill exists and defaults to 2026–27');

          const princTag = document.getElementById('fin_principal_tag');
          assert(princTag !== null && princTag.textContent.includes('Principal:'), 'Principal tag displays correctly: ' + (princTag?.textContent));

          // TEST 3: 5 KPI Cards Values
          const colVal = document.getElementById('fin_kpi_val_collected')?.textContent || '';
          const penVal = document.getElementById('fin_kpi_val_pending')?.textContent || '';
          const expVal = document.getElementById('fin_kpi_val_expected')?.textContent || '';
          const discVal = document.getElementById('fin_kpi_val_discount')?.textContent || '';
          const rateVal = document.getElementById('fin_kpi_val_rate')?.textContent || '';

          assert(colVal.startsWith('₹') && colVal.length > 3, 'KPI 1 Total Fee Collected formatted properly: ' + colVal);
          assert(penVal.startsWith('₹') && penVal.length > 3, 'KPI 2 Pending Dues formatted properly: ' + penVal);
          assert(expVal.startsWith('₹') && expVal.length > 3, 'KPI 3 Total Expected formatted properly: ' + expVal);
          assert(discVal.startsWith('₹'), 'KPI 4 Discount Given formatted properly: ' + discVal);
          assert(rateVal.endsWith('%'), 'KPI 5 Collection Rate formatted properly: ' + rateVal);

          // Verify Mathematical Coherence
          const parseINR = s => parseInt(s.replace(/[^0-9]/g, '')) || 0;
          const numCol = parseINR(colVal);
          const numPen = parseINR(penVal);
          const numExp = parseINR(expVal);
          assert(Math.abs((numCol + numPen) - numExp) <= 1, 'Total Expected equals Collected + Pending (' + numCol + ' + ' + numPen + ' = ' + numExp + ')');

          // TEST 4: Monthly Collection Bar Chart
          const barSvg = document.querySelector('#fin_bar_chart_container svg');
          assert(barSvg !== null, 'Monthly Collection SVG chart is rendered');
          const rects = document.querySelectorAll('#fin_bar_chart_container rect');
          assert(rects.length > 0, 'Bar chart has rendered ' + rects.length + ' monthly bars');

          // TEST 5: Fee Collection Overview Donut Chart
          const donutSvg = document.getElementById('fin_donut_svg');
          assert(donutSvg !== null && donutSvg.children.length >= 3, 'Donut chart SVG has rendered track, fill, and center text');
          
          const legCol = document.getElementById('fin_legend_collected')?.textContent;
          const legPen = document.getElementById('fin_legend_pending')?.textContent;
          const legExp = document.getElementById('fin_legend_expected')?.textContent;
          assert(legCol === colVal, 'Donut legend Collected matches KPI (' + legCol + ')');
          assert(legPen === penVal, 'Donut legend Pending matches KPI (' + legPen + ')');
          assert(legExp === expVal, 'Donut legend Expected matches KPI (' + legExp + ')');

          // TEST 6: Reports & Analysis (6 Unique Tiles)
          const reportTiles = document.querySelectorAll('.fin-report-tile');
          assert(reportTiles.length === 6, 'Exactly 6 unique report tiles exist in Reports & Analysis (found: ' + reportTiles.length + ')');

          // TEST 7: Quick Actions (4 Tiles)
          const actionTiles = document.querySelectorAll('.fin-action-btn');
          assert(actionTiles.length === 4, 'Exactly 4 quick action tiles exist (found: ' + actionTiles.length + ')');

          // TEST 8: Recent Collections Table
          const recentRows = document.querySelectorAll('#fin_recent_table_body tr');
          assert(recentRows.length === 3, 'Recent collections displays exactly top 3 rows (found: ' + recentRows.length + ')');
          const receiptLinks = document.querySelectorAll('#fin_recent_table_body .fin-receipt-link');
          assert(receiptLinks.length === 3, 'Receipt numbers are clickable links');

          // TEST 9: Top Outstanding Classes List
          const classRows = document.querySelectorAll('#fin_top_classes_list .fin-class-due-row');
          assert(classRows.length === 5, 'Top outstanding classes displays top 5 ranked classes');

          // TEST 10: Modal Handlers Exist
          const modalsToCheck = [
            'openDailyCollectionReport',
            'showPendingDetail',
            'showCollectedDetail',
            'openMonthlyCollectionModal',
            'openClassWiseCollectionModal',
            'openClassOutstandingModal',
            'openFeeConcessionModal',
            'openTopDefaultersModal',
            'openIncomeSummaryModal',
            'openQuickExportModal',
            'printFinancialReportSummary',
            'downloadMasterLedgerPDF',
            'openCustomFinancialReportModal'
          ];
          modalsToCheck.forEach(fnName => {
            assert(typeof window[fnName] === 'function', 'Function ' + fnName + ' is defined and callable');
          });

          // TEST 11: Trigger Modals and ensure they open
          openMonthlyCollectionModal();
          assert(document.getElementById('modalMonthlyCollectionReport')?.classList.contains('show'), 'modalMonthlyCollectionReport opened successfully');
          closeM('modalMonthlyCollectionReport');

          openClassWiseCollectionModal();
          assert(document.getElementById('modalClassWiseCollectionReport')?.classList.contains('show'), 'modalClassWiseCollectionReport opened successfully');
          closeM('modalClassWiseCollectionReport');

          openClassOutstandingModal();
          assert(document.getElementById('modalClassOutstandingDues')?.classList.contains('show'), 'modalClassOutstandingDues opened successfully');
          closeM('modalClassOutstandingDues');

          openFeeConcessionModal();
          assert(document.getElementById('modalFeeConcessionReport')?.classList.contains('show'), 'modalFeeConcessionReport opened successfully');
          closeM('modalFeeConcessionReport');

          openIncomeSummaryModal();
          assert(document.getElementById('modalIncomeSummary')?.classList.contains('show'), 'modalIncomeSummary opened successfully');
          closeM('modalIncomeSummary');

          openQuickExportModal();
          assert(document.getElementById('modalQuickExportReports')?.classList.contains('show'), 'modalQuickExportReports opened successfully');
          closeM('modalQuickExportReports');

          openCustomFinancialReportModal();
          assert(document.getElementById('modalCustomFinancialReport')?.classList.contains('show'), 'modalCustomFinancialReport opened successfully');
          closeM('modalCustomFinancialReport');

          return report;
        } catch (err) {
          console.error('INNER RENDERER ERROR:', err.stack || err.message);
          return { passed: 0, failed: 1, errors: [err.message] };
        }
      })()
    `);

    console.log('\nVERIFICATION SUMMARY:');
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    if (results.errors.length > 0) {
      console.error('Errors:', results.errors);
    }
  } catch (outerErr) {
    console.error('OUTER EXEC ERROR:', outerErr);
  }

  app.quit();
});
