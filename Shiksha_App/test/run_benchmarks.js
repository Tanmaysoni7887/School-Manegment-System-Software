/**
 * SHIKSHA — SCHOOL MANAGEMENT SOFTWARE PERFORMANCE BENCHMARK HARNESS (v2.0)
 * Evaluates all 14 performance metrics across 6 dataset sizes:
 * A: 275, B: 1000, C: 1476, D: 2000, E: 2500, F: 3000 students
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DATASETS = [
  { key: 'A', name: '275 Students (Baseline)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_A_275.json') },
  { key: 'B', name: '1,000 Students (Medium School)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_B_1000.json') },
  { key: 'C', name: '1,476 Students (Demo Kit Dataset)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_C_1476.json') },
  { key: 'D', name: '2,000 Students (Target Requirement)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_D_2000.json') },
  { key: 'E', name: '2,500 Students (Stress Capacity)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_E_2500.json') },
  { key: 'F', name: '3,000 Students (Extreme Stress Limit)', path: path.join(__dirname, 'benchmark_datasets', 'dataset_F_3000.json') }
];

// Allow running a subset if passed via CLI (e.g. --only=C)
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const targetDatasets = onlyArg 
  ? DATASETS.filter(d => d.key === onlyArg.split('=')[1].toUpperCase())
  : DATASETS;

let activeDataset = null;

// Mock IPC handlers so app can communicate cleanly
ipcMain.handle('load-data', () => activeDataset);
ipcMain.handle('save-data', (e, d) => ({ success: true, timestamp: new Date().toISOString() }));
ipcMain.handle('get-student-photo-data', () => null);
ipcMain.handle('get-data-path', () => 'MOCK_BENCHMARK_PATH');

async function runBenchmarkForDataset(win, datasetInfo) {
  console.log(`\n======================================================================`);
  console.log(`RUNNING BENCHMARK: Test ${datasetInfo.key} — ${datasetInfo.name}`);
  console.log(`File: ${datasetInfo.path}`);
  console.log(`======================================================================`);

  // 1. Initial cold boot & DB loading time from disk
  const loadStart = process.hrtime.bigint();
  const rawJson = fs.readFileSync(datasetInfo.path, 'utf8');
  const fileSizeBytes = Buffer.byteLength(rawJson, 'utf8');
  const fileSizeMB = +(fileSizeBytes / (1024 * 1024)).toFixed(2);
  const parsedData = JSON.parse(rawJson);
  const loadEnd = process.hrtime.bigint();
  const coldBootLoadTimeMs = +((Number(loadEnd - loadStart) / 1e6).toFixed(2));

  activeDataset = parsedData;

  // Run in renderer
  const metrics = await win.webContents.executeJavaScript(`(async () => {
    // Inject parsed data into app state
    DB = window.DB = ${JSON.stringify(parsedData)};
    invalidatePerformanceIndices();
    ensurePerformanceIndices();

    // Reset page navigation
    curActivePage = null;
    showPage('dashboard', null);

    // 2. Dashboard First Render (renderDB)
    const t0 = performance.now();
    renderDB();
    const reflow0 = document.getElementById('page-dashboard').offsetHeight;
    const dashFirstRenderMs = performance.now() - t0;

    // 3. Dashboard Month Switch Time
    const t1 = performance.now();
    const periodSel = document.getElementById('dashboardPeriodSelect');
    if (periodSel) {
      periodSel.value = 'select_month';
      const mSel = document.getElementById('dashboardMonthSelect');
      if (mSel) mSel.value = 'October';
      renderDB();
    }
    const reflow1 = document.getElementById('page-dashboard').offsetHeight;
    const monthSwitchMs = performance.now() - t1;
    // Restore default
    if (periodSel) {
      periodSel.value = 'current_month';
      renderDB();
    }

    // 4. Navigation to All Students Page
    const t2 = performance.now();
    showPage('students', null);
    const reflow2 = document.getElementById('page-students').offsetHeight;
    const navStudentsPageMs = performance.now() - t2;

    // 5. Students List Rendering Time (renderSt)
    const t3 = performance.now();
    renderSt();
    const reflow3 = document.getElementById('sTb').offsetHeight;
    const renderStMs = performance.now() - t3;

    // 6. Live Search Response Time (Filter for 'Komal')
    const searchInp = document.getElementById('gSch');
    const t4 = performance.now();
    if (searchInp) {
      searchInp.value = 'Komal';
      renderSt();
    }
    const reflow4 = document.getElementById('sTb').offsetHeight;
    const searchResponseMs = performance.now() - t4;
    // Reset search
    if (searchInp) {
      searchInp.value = '';
      renderSt();
    }

    // 7. Navigation to Fee Collection Page
    const t5 = performance.now();
    showPage('fees', null);
    const reflow5 = document.getElementById('page-fees').offsetHeight;
    const navFeePageMs = performance.now() - t5;

    // 8. Student Profile Modal Open Time (viewProf)
    const firstStudent = (DB.students && DB.students[0]) ? DB.students[0].id : 1;
    const t6 = performance.now();
    viewProf(firstStudent);
    const reflow6 = document.getElementById('profM').offsetHeight;
    const viewProfMs = performance.now() - t6;
    closeM('profM');

    // 9. Defaulters List Calculation & Display Time
    const t7 = performance.now();
    const dues = getPendingFeesDueList({ sessMode: 'current', dueType: 'all', month: '' });
    const defaultersCalcMs = performance.now() - t7;

    // 10. Month-wise Summary Render Time (renderMonthWiseSummary)
    const t8 = performance.now();
    renderMonthWiseSummary();
    const monthWiseSummaryMs = performance.now() - t8;

    // 11. Transport Fee Calculation Time (50 students sample accounting)
    const t9 = performance.now();
    if (DB.transport && DB.transport.assignments) {
      const sampleIds = Object.keys(DB.transport.assignments).slice(0, 50);
      for (const sid of sampleIds) {
        getStudentMonthTransportAccounting(sid, 'April', 2026);
      }
    }
    const transportFeeCalcMs = performance.now() - t9;

    // 12. Fee Master CSV Export Generation Time
    const t10 = performance.now();
    const students = DB.students || [];
    const fees = DB.fees || {};
    let exportRows = 0;
    let csv = 'Student ID,Admission No,Name,Class,Section,Month,Year,Amount,Status\\n';
    for (const [key, f] of Object.entries(fees)) {
      const s = typeof getStudentById === 'function' ? getStudentById(f.studentId) : students.find(x => x.id === f.studentId);
      if (s) {
        csv += f.studentId + ',' + (s.admissionNo || '') + ',"' + (s.name || '') + '",' + (s.class || '') + ',' + (s.section || '') + ',' + (f.month || '') + ',' + (f.year || '') + ',' + (f.amount || 0) + ',' + (f.status || '') + '\\n';
        exportRows++;
      }
    }
    const feeExportMs = performance.now() - t10;

    // 13. Database Save Time (Serialization + IPC payload)
    const t11 = performance.now();
    const serialized = JSON.stringify(DB);
    const dbSaveSerializationMs = performance.now() - t11;

    // 15. Collected Detail Click Cold (showCollectedDetail cold)
    invalidatePerformanceIndices();
    const t12 = performance.now();
    showCollectedDetail();
    applyCollectedFilters();
    const collectedDetailColdMs = performance.now() - t12;

    // 16. Collected Detail Click Cached (reopen)
    const t13 = performance.now();
    showCollectedDetail();
    const collectedDetailCachedMs = performance.now() - t13;

    // 17. Collected Filter Test (Class NC + Mode Cheque)
    const t14 = performance.now();
    const clsFilterEl = document.getElementById('col_f_cls');
    const modeFilterEl = document.getElementById('col_f_mode');
    if (clsFilterEl) clsFilterEl.value = 'NC';
    if (modeFilterEl) modeFilterEl.value = 'Cheque';
    applyCollectedFilters();
    const collectedFilterMs = performance.now() - t14;

    // 18. Pagination Navigation Test
    const t15 = performance.now();
    goToCollectedPage(2);
    const collectedPaginationMs = performance.now() - t15;

    // Restore filters and close modal
    resetCollectedFilters();
    closeM('collectedM');

    // 14. Renderer JS Heap
    const rendererHeapMB = window.performance && window.performance.memory
      ? +(window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)
      : 0;

    const studentCount = DB.students ? DB.students.length : 0;
    const activeStudentCount = DB.students ? DB.students.filter(s => s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni').length : 0;
    const paymentsCount = DB.payments ? DB.payments.length : 0;
    const feesKeyCount = DB.fees ? Object.keys(DB.fees).length : 0;

    return {
      studentCount,
      activeStudentCount,
      paymentsCount,
      feesKeyCount,
      exportRows,
      dashFirstRenderMs: +dashFirstRenderMs.toFixed(2),
      monthSwitchMs: +monthSwitchMs.toFixed(2),
      navStudentsPageMs: +navStudentsPageMs.toFixed(2),
      renderStMs: +renderStMs.toFixed(2),
      searchResponseMs: +searchResponseMs.toFixed(2),
      navFeePageMs: +navFeePageMs.toFixed(2),
      viewProfMs: +viewProfMs.toFixed(2),
      defaultersCalcMs: +defaultersCalcMs.toFixed(2),
      monthWiseSummaryMs: +monthWiseSummaryMs.toFixed(2),
      transportFeeCalcMs: +transportFeeCalcMs.toFixed(2),
      feeExportMs: +feeExportMs.toFixed(2),
      dbSaveSerializationMs: +dbSaveSerializationMs.toFixed(2),
      collectedDetailColdMs: +collectedDetailColdMs.toFixed(2),
      collectedDetailCachedMs: +collectedDetailCachedMs.toFixed(2),
      collectedFilterMs: +collectedFilterMs.toFixed(2),
      collectedPaginationMs: +collectedPaginationMs.toFixed(2),
      rendererHeapMB
    };
  })()`);

  // Main process memory
  const mainMem = process.memoryUsage();
  const mainRssMB = +(mainMem.rss / (1024 * 1024)).toFixed(2);
  const mainHeapUsedMB = +(mainMem.heapUsed / (1024 * 1024)).toFixed(2);

  const finalResult = {
    testKey: datasetInfo.key,
    testName: datasetInfo.name,
    fileSizeMB,
    studentCount: metrics.studentCount,
    activeStudentCount: metrics.activeStudentCount,
    paymentsCount: metrics.paymentsCount,
    feesKeyCount: metrics.feesKeyCount,
    exportRows: metrics.exportRows,
    metrics: {
      metric1_coldBootLoadMs: coldBootLoadTimeMs,
      metric2_dashFirstRenderMs: metrics.dashFirstRenderMs,
      metric3_dashMonthSwitchMs: metrics.monthSwitchMs,
      metric4_navStudentsPageMs: metrics.navStudentsPageMs,
      metric5_renderStMs: metrics.renderStMs,
      metric6_searchResponseMs: metrics.searchResponseMs,
      metric7_navFeePageMs: metrics.navFeePageMs,
      metric8_viewProfMs: metrics.viewProfMs,
      metric9_defaultersCalcMs: metrics.defaultersCalcMs,
      metric10_monthWiseSummaryMs: metrics.monthWiseSummaryMs,
      metric11_transportFeeCalcMs: metrics.transportFeeCalcMs,
      metric12_feeExportMs: metrics.feeExportMs,
      metric13_dbSaveSerializationMs: metrics.dbSaveSerializationMs,
      metric15_collectedDetailColdMs: metrics.collectedDetailColdMs,
      metric16_collectedDetailCachedMs: metrics.collectedDetailCachedMs,
      metric17_collectedFilterMs: metrics.collectedFilterMs,
      metric18_collectedPaginationMs: metrics.collectedPaginationMs,
      metric14_memory: {
        rendererJSHeapUsedMB: metrics.rendererHeapMB,
        mainProcessRssMB: mainRssMB,
        mainProcessHeapUsedMB: mainHeapUsedMB
      }
    }
  };

  console.log(`[Results for Test ${datasetInfo.key} (${metrics.studentCount} students, ${metrics.paymentsCount} payments)]`);
  console.log(`   1. Cold Boot & DB Load Time:       ${finalResult.metrics.metric1_coldBootLoadMs} ms`);
  console.log(`   2. Dashboard First Render:         ${finalResult.metrics.metric2_dashFirstRenderMs} ms`);
  console.log(`   3. Dashboard Month Switch:         ${finalResult.metrics.metric3_dashMonthSwitchMs} ms`);
  console.log(`   4. Nav to All Students Page:       ${finalResult.metrics.metric4_navStudentsPageMs} ms`);
  console.log(`   5. Students List Render (renderSt): ${finalResult.metrics.metric5_renderStMs} ms`);
  console.log(`   6. Live Search Response ('Komal'): ${finalResult.metrics.metric6_searchResponseMs} ms`);
  console.log(`   7. Nav to Fee Collection Page:     ${finalResult.metrics.metric7_navFeePageMs} ms`);
  console.log(`   8. Student Profile Modal (viewProf):${finalResult.metrics.metric8_viewProfMs} ms`);
  console.log(`   9. Defaulters List Calculation:    ${finalResult.metrics.metric9_defaultersCalcMs} ms`);
  console.log(`  10. Month-wise Summary Render:      ${finalResult.metrics.metric10_monthWiseSummaryMs} ms`);
  console.log(`  11. Transport Fee Calc (50 sample): ${finalResult.metrics.metric11_transportFeeCalcMs} ms`);
  console.log(`  12. Fee Master CSV Export:          ${finalResult.metrics.metric12_feeExportMs} ms`);
  console.log(`  13. Database Save (Serialization):  ${finalResult.metrics.metric13_dbSaveSerializationMs} ms`);
  console.log(`  14. Fee Collected Cold Click:       ${finalResult.metrics.metric15_collectedDetailColdMs} ms`);
  console.log(`  15. Fee Collected Cached Click:     ${finalResult.metrics.metric16_collectedDetailCachedMs} ms`);
  console.log(`  16. Fee Collected Filter (NC+Cheque):${finalResult.metrics.metric17_collectedFilterMs} ms`);
  console.log(`  17. Fee Collected Pagination (Pg 2):${finalResult.metrics.metric18_collectedPaginationMs} ms`);
  console.log(`  18. Memory Usage:`);
  console.log(`      - Renderer JS Heap Used:        ${finalResult.metrics.metric14_memory.rendererJSHeapUsedMB} MB`);
  console.log(`      - Main Process RSS:             ${finalResult.metrics.metric14_memory.mainProcessRssMB} MB`);

  return finalResult;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(r => setTimeout(r, 1200));

  const allResults = [];
  for (const ds of targetDatasets) {
    try {
      const res = await runBenchmarkForDataset(win, ds);
      allResults.push(res);
    } catch (err) {
      console.error(`ERROR running benchmark for ${ds.key}:`, err);
    }
  }

  const outPath = path.join(__dirname, 'benchmark_results_current.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n======================================================================`);
  console.log(`ALL 6 BENCHMARK RUNS COMPLETED! Results saved to:\n${outPath}`);
  console.log(`======================================================================\n`);

  app.quit();
});
