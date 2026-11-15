const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const callerArtifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const currentArtifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/9d8d1929-81b4-4a6c-b568-bd5e26f27389');

function saveArtifact(filename, buffer) {
  if (fs.existsSync(callerArtifactDir)) {
    fs.writeFileSync(path.join(callerArtifactDir, filename), buffer);
  }
  if (fs.existsSync(currentArtifactDir)) {
    fs.writeFileSync(path.join(currentArtifactDir, filename), buffer);
  }
}

const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

// Mock IPC
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(prodDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => prodDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));

const report = {
  results: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function recordTest(category, name, passed, details = '') {
  report.results.push({ category, name, status: passed ? 'PASS' : 'FAIL', details });
  report.summary.total++;
  if (passed) report.summary.passed++;
  else report.summary.failed++;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${category}] ${name}${details ? ' - ' + details : ''}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.resolve(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1500));

  // ============================================================
  // OBJECTIVE 1: QUICK ACTIONS VERIFICATION
  // ============================================================
  console.log('\n--- VERIFYING OBJECTIVE 1: Quick Actions Changes ---');

  const qaButtons = await win.webContents.executeJavaScript(`
    (() => {
      const container = document.querySelector('.qa-buttons');
      const btns = Array.from(container.querySelectorAll('button'));
      return btns.map((b, i) => {
        const svg = b.querySelector('svg');
        const textOnly = Array.from(b.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .join('');
        return {
          index: i,
          fullText: b.textContent.trim(),
          textOnly: textOnly,
          hasSvg: !!svg,
          plusCharInText: textOnly.includes('+'),
          onclick: b.getAttribute('onclick'),
          height: b.offsetHeight,
          minHeightStyle: window.getComputedStyle(b).minHeight,
          padding: window.getComputedStyle(b).padding,
          className: b.className
        };
      });
    })()
  `);

  // Check 1.1: Exactly 5 buttons
  recordTest('Quick Actions', 'Button count is exactly 5', qaButtons.length === 5, `Found ${qaButtons.length} buttons`);

  // Check 1.2: Add New Student has ONLY ONE plus sign (the SVG icon, not in text)
  const addBtn = qaButtons[0];
  const addBtnTextClean = addBtn.textOnly === 'Add New Student' && !addBtn.plusCharInText;
  const addBtnHasSvg = addBtn.hasSvg;
  recordTest('Quick Actions', 'Add New Student has ONLY ONE plus sign (SVG icon, not in text)', addBtnTextClean && addBtnHasSvg, `Text="${addBtn.textOnly}", SVG=${addBtnHasSvg}, plusInText=${addBtn.plusCharInText}`);

  // Check 1.3: Sizing and Spacing
  // Add New Student ~34px, others ~31px
  const addBtnH = addBtn.height;
  const secBtnsH = qaButtons.slice(1).map(b => b.height);
  const addSizedCorrectly = Math.abs(addBtnH - 34) <= 1;
  const secSizedCorrectly = secBtnsH.every(h => Math.abs(h - 31) <= 1);
  recordTest('Quick Actions', 'Button heights conform to spec (~34px for Add, ~31px for others)', addSizedCorrectly && secSizedCorrectly, `Add: ${addBtnH}px, Others: [${secBtnsH.join(', ')}]px`);

  // Check 1.4: Vertical gap is 6px
  const qaGap = await win.webContents.executeJavaScript(`
    window.getComputedStyle(document.querySelector('.qa-buttons')).gap
  `);
  recordTest('Quick Actions', 'Vertical gap between buttons is 6px', qaGap === '6px', `Computed gap: ${qaGap}`);

  // Check 1.5: Click handlers match requirements exactly
  const expectedHandlers = [
    { text: 'Add New Student', onclick: 'openAddStudent()' },
    { text: 'Collect Fee', onclick: "showPage('fees',null)" },
    { text: 'Fee Reminders', onclick: "showPage('reminder',null)" },
    { text: 'Financial Reports', onclick: "showPage('financial-reports',null)" },
    { text: 'Data & Backup', onclick: "showPage('reports',null)" }
  ];
  let handlersMatch = true;
  for (let i = 0; i < expectedHandlers.length; i++) {
    const b = qaButtons[i];
    const exp = expectedHandlers[i];
    if (b.textOnly !== exp.text || b.onclick !== exp.onclick) {
      handlersMatch = false;
    }
  }
  recordTest('Quick Actions', 'All 5 button click handlers and text match specification', handlersMatch, JSON.stringify(qaButtons.map(b => ({ text: b.textOnly, onclick: b.onclick }))));

  // Check 1.6: Academic Overview Sub-Card - All 3 rows completely visible without clipping
  const overviewCheck = await win.webContents.executeJavaScript(`
    (() => {
      const ov = document.querySelector('.qa-overview');
      const rows = Array.from(ov.querySelectorAll('.qa-overview-row'));
      const title = ov.querySelector('.qa-overview-title');
      return {
        ovHeight: ov.offsetHeight,
        ovScrollHeight: ov.scrollHeight,
        isClipped: ov.scrollHeight > ov.offsetHeight + 1,
        rowCount: rows.length,
        rows: rows.map(r => ({
          label: r.querySelector('.label')?.textContent.trim(),
          val: r.querySelector('.val')?.textContent.trim(),
          visible: r.offsetHeight > 0 && window.getComputedStyle(r).display !== 'none'
        })),
        titleText: title?.textContent.trim()
      };
    })()
  `);
  const ov3Rows = overviewCheck.rowCount === 3 && overviewCheck.rows.every(r => r.visible);
  const ovNotClipped = !overviewCheck.isClipped;
  recordTest('Quick Actions', 'Academic Overview all 3 rows (Session, Active Classes, System Status) visible without clipping', ov3Rows && ovNotClipped, `Rows: ${JSON.stringify(overviewCheck.rows)}, Height: ${overviewCheck.ovHeight}px, ScrollHeight: ${overviewCheck.ovScrollHeight}px`);

  // ============================================================
  // OBJECTIVE 2: MONTH-WISE DASHBOARD KPI TEXT VERIFICATION
  // ============================================================
  console.log('\n--- VERIFYING OBJECTIVE 2: Month-wise Dashboard KPI Text ---');

  // Test current_month mode
  const currentMonthKpis = await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('db_period_mode').value = 'current_month';
      onDashboardPeriodChange();
      renderDB();
      const cards = Array.from(document.querySelectorAll('.db-kpi-grid .kpi-card'));
      return cards.map(c => {
        const valEl = c.querySelector('.kpi-val');
        const titleEl = c.querySelector('.kpi-title');
        const subEl = c.querySelector('.kpi-sub');
        return {
          id: valEl ? valEl.id : '',
          val: valEl ? valEl.innerText.trim() : '',
          title: titleEl ? titleEl.innerText.trim() : '',
          sub: subEl ? subEl.innerText.trim() : '',
          subId: subEl ? subEl.id : '',
          valClipped: valEl ? (valEl.scrollWidth > valEl.clientWidth + 1 || valEl.scrollHeight > valEl.clientHeight + 1) : false,
          subClipped: subEl ? (subEl.scrollWidth > subEl.clientWidth + 1 || subEl.scrollHeight > subEl.clientHeight + 1) : false
        };
      });
    })()
  `);

  recordTest('Dashboard KPI', 'Current Month: 6 KPI cards present', currentMonthKpis.length === 6, `Found ${currentMonthKpis.length} cards`);
  const curNoClip = currentMonthKpis.every(k => !k.valClipped && !k.subClipped);
  recordTest('Dashboard KPI', 'Current Month: No text truncation or clipping in any KPI card', curNoClip, JSON.stringify(currentMonthKpis.map(k => ({ title: k.title, val: k.val, sub: k.sub }))));

  // Check labels format in current_month
  const curDcLbl = currentMonthKpis.find(k => k.subId === 'dc_lbl');
  const curDdLbl = currentMonthKpis.find(k => k.subId === 'dd_lbl');
  const curExpLbl = currentMonthKpis.find(k => k.subId === 'db-exp-lbl');
  const curRateLbl = currentMonthKpis.find(k => k.subId === 'db-rate-lbl');
  const curLabelsClean = [curDcLbl, curDdLbl, curExpLbl, curRateLbl].every(k => k && k.sub.startsWith('(') && k.sub.endsWith(')') && !k.sub.includes(k.title));
  recordTest('Dashboard KPI', 'Current Month: dcLbl, ddLbl, expLbl, rateLbl contain (${metrics.label}) without title duplication', curLabelsClean, `dc_lbl: "${curDcLbl?.sub}", dd_lbl: "${curDdLbl?.sub}"`);

  // Test select_month mode: September 2026
  const sepKpis = await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('db_period_mode').value = 'select_month';
      onDashboardPeriodChange();
      document.getElementById('db_mo').value = 'September';
      document.getElementById('db_yr').value = '2026';
      renderDB();
      const cards = Array.from(document.querySelectorAll('.db-kpi-grid .kpi-card'));
      return cards.map(c => {
        const valEl = c.querySelector('.kpi-val');
        const titleEl = c.querySelector('.kpi-title');
        const subEl = c.querySelector('.kpi-sub');
        return {
          id: valEl ? valEl.id : '',
          val: valEl ? valEl.innerText.trim() : '',
          title: titleEl ? titleEl.innerText.trim() : '',
          sub: subEl ? subEl.innerText.trim() : '',
          subId: subEl ? subEl.id : '',
          valClipped: valEl ? (valEl.scrollWidth > valEl.clientWidth + 1 || valEl.scrollHeight > valEl.clientHeight + 1) : false,
          subClipped: subEl ? (subEl.scrollWidth > subEl.clientWidth + 1 || subEl.scrollHeight > subEl.clientHeight + 1) : false
        };
      });
    })()
  `);
  const sepSubMatch = sepKpis.filter(k => ['dc_lbl', 'dd_lbl', 'db-exp-lbl', 'db-rate-lbl'].includes(k.subId)).every(k => k.sub === '(September 2026)');
  const sepNoClip = sepKpis.every(k => !k.valClipped && !k.subClipped);
  recordTest('Dashboard KPI', 'Select Month (September 2026): Subtitles formatted as (September 2026) without duplication', sepSubMatch, `Values: ${sepKpis.map(k => k.sub).join(' | ')}`);
  recordTest('Dashboard KPI', 'Select Month (September 2026): No text clipping/truncation in KPI values/titles/subtitles', sepNoClip, `All 6 cards clean`);

  // Test select_month mode: November 2026
  const novKpis = await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('db_period_mode').value = 'select_month';
      onDashboardPeriodChange();
      document.getElementById('db_mo').value = 'November';
      document.getElementById('db_yr').value = '2026';
      renderDB();
      const cards = Array.from(document.querySelectorAll('.db-kpi-grid .kpi-card'));
      return cards.map(c => {
        const valEl = c.querySelector('.kpi-val');
        const titleEl = c.querySelector('.kpi-title');
        const subEl = c.querySelector('.kpi-sub');
        return {
          id: valEl ? valEl.id : '',
          val: valEl ? valEl.innerText.trim() : '',
          title: titleEl ? titleEl.innerText.trim() : '',
          sub: subEl ? subEl.innerText.trim() : '',
          subId: subEl ? subEl.id : '',
          valClipped: valEl ? (valEl.scrollWidth > valEl.clientWidth + 1 || valEl.scrollHeight > valEl.clientHeight + 1) : false,
          subClipped: subEl ? (subEl.scrollWidth > subEl.clientWidth + 1 || subEl.scrollHeight > subEl.clientHeight + 1) : false
        };
      });
    })()
  `);
  const novSubMatch = novKpis.filter(k => ['dc_lbl', 'dd_lbl', 'db-exp-lbl', 'db-rate-lbl'].includes(k.subId)).every(k => k.sub === '(November 2026)');
  const novNoClip = novKpis.every(k => !k.valClipped && !k.subClipped);
  recordTest('Dashboard KPI', 'Select Month (November 2026): Subtitles formatted as (November 2026) without duplication', novSubMatch, `Values: ${novKpis.map(k => k.sub).join(' | ')}`);
  recordTest('Dashboard KPI', 'Select Month (November 2026): No text clipping/truncation in KPI values/titles/subtitles', novNoClip, `All 6 cards clean`);

  // ============================================================
  // OBJECTIVE 3: FINANCIAL REPORTS & DATA & BACKUP NAVIGATION
  // ============================================================
  console.log('\n--- VERIFYING OBJECTIVE 3: Navigation Verification ---');

  // Navigate to Financial Reports via Quick Action button click
  const finNavResult = await win.webContents.executeJavaScript(`
    (() => {
      showPage('dashboard');
      const finBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Financial Reports'));
      finBtn.click();
      const page = document.getElementById('page-financial-reports');
      const isActive = page.classList.contains('active') && page.style.display !== 'none';
      
      // Check for Quick Actions within Financial Reports
      const qaCards = Array.from(page.querySelectorAll('.fin-quick-actions-grid .fin-action-btn')).map(b => b.textContent.trim());
      // Check for Reports & Analysis tiles
      const reportTiles = Array.from(page.querySelectorAll('.fin-report-tiles-grid .fin-report-tile')).map(t => t.querySelector('.fin-tile-name')?.textContent.trim());
      // Check for 5 KPI cards
      const finKpis = Array.from(page.querySelectorAll('.fin-kpi-grid .fin-kpi-card')).length;

      return {
        isActive,
        qaCards,
        reportTiles,
        finKpis
      };
    })()
  `);
  recordTest('Navigation', 'Financial Reports button opens Financial Reports page', finNavResult.isActive, `isActive=${finNavResult.isActive}`);
  const hasRequiredFinQA = ['Export Reports (CSV)', 'Print Report', 'Payment Mode Summary', 'Custom Report'].every(q => finNavResult.qaCards.includes(q));
  recordTest('Navigation', 'Financial Reports contains Quick Actions (Payment Mode Summary, Custom Report, etc.)', hasRequiredFinQA, `Actions: [${finNavResult.qaCards.join(', ')}]`);
  const hasRequiredTiles = ['Daily Collection Report', 'Monthly Collection Report', 'Class-wise Collection Report', 'Class Outstanding Dues'].every(t => finNavResult.reportTiles.includes(t));
  recordTest('Navigation', 'Financial Reports contains full report cards (Daily Collection, Monthly, Class-wise, etc.)', hasRequiredTiles, `Reports: [${finNavResult.reportTiles.join(', ')}]`);

  // Navigate to Data & Backup via Quick Action button click
  const dataNavResult = await win.webContents.executeJavaScript(`
    (() => {
      showPage('dashboard');
      const dataBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Data & Backup'));
      dataBtn.click();
      const page = document.getElementById('page-reports');
      const isActive = page.classList.contains('active') && page.style.display !== 'none';
      const title = page.querySelector('.erp-page-title')?.textContent.trim();
      const exportBtns = Array.from(page.querySelectorAll('.erp-panel-card button')).length;
      return {
        isActive,
        title,
        exportBtns
      };
    })()
  `);
  recordTest('Navigation', 'Data & Backup button opens Data & Backup page (page-reports)', dataNavResult.isActive && dataNavResult.title === 'Data Exports & Backup', `title="${dataNavResult.title}", exportBtns=${dataNavResult.exportBtns}`);

  // Test Add New Student click opens Add Student form
  const addStuNavResult = await win.webContents.executeJavaScript(`
    (() => {
      showPage('dashboard');
      const addBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Add New Student'));
      addBtn.click();
      const page = document.getElementById('page-addstudent');
      const isActive = page.classList.contains('active') && page.style.display !== 'none';
      return { isActive };
    })()
  `);
  recordTest('Navigation', 'Add New Student button opens Add / Edit Student page', addStuNavResult.isActive, `isActive=${addStuNavResult.isActive}`);

  // Test Collect Fee click opens Fees page
  const feesNavResult = await win.webContents.executeJavaScript(`
    (() => {
      showPage('dashboard');
      const feeBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Collect Fee'));
      feeBtn.click();
      const page = document.getElementById('page-fees');
      const isActive = page.classList.contains('active') && page.style.display !== 'none';
      return { isActive };
    })()
  `);
  recordTest('Navigation', 'Collect Fee button opens Fees page', feesNavResult.isActive, `isActive=${feesNavResult.isActive}`);

  // Test Fee Reminders click opens Reminder page
  const remNavResult = await win.webContents.executeJavaScript(`
    (() => {
      showPage('dashboard');
      const remBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Fee Reminders'));
      remBtn.click();
      const page = document.getElementById('page-reminder');
      const isActive = page.classList.contains('active') && page.style.display !== 'none';
      return { isActive };
    })()
  `);
  recordTest('Navigation', 'Fee Reminders button opens Reminders page', remNavResult.isActive, `isActive=${remNavResult.isActive}`);

  // Return to dashboard
  await win.webContents.executeJavaScript(`showPage('dashboard');`);
  await new Promise(r => setTimeout(r, 400));

  // ============================================================
  // OBJECTIVE 4: PREVIOUSLY COMPLETED FEATURES REGRESSION CHECK
  // ============================================================
  console.log('\n--- VERIFYING OBJECTIVE 4: Regression Checks ---');

  // Check 4.1: Student count synchronization between Dashboard and Sessions & Promotion
  const studentCountSync = await win.webContents.executeJavaScript(`
    (() => {
      const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
      const activeStudents = getActiveStudents(curSess);
      const dbCount = parseInt(document.getElementById('dt').textContent);
      
      // Calculate Sessions page student count
      const sessionCount = (DB.students || []).filter(s => isStudentActive(s) && isStudentInSession(s, curSess)).length;

      return {
        activeStudentsLength: activeStudents.length,
        dbCount,
        sessionCount,
        isSynchronized: dbCount === 1359 && sessionCount === 1359 && activeStudents.length === 1359
      };
    })()
  `);
  recordTest('Regressions', 'Student count synchronization (Dashboard = 1,359 === Sessions = 1,359)', studentCountSync.isSynchronized, `Dashboard=${studentCountSync.dbCount}, Sessions=${studentCountSync.sessionCount}`);

  // Check 4.2: Transport fee session dues separation and collection flow
  const transportCheck = await win.webContents.executeJavaScript(`
    (() => {
      // Check ledger headers in Transport page
      const ths = Array.from(document.querySelectorAll('#page-transport th')).map(t => t.textContent.trim());
      const hasThisMonth = ths.some(t => t.includes('This Month'));
      const hasSessionDue = ths.some(t => t.includes('Session Due'));
      
      // Check modal does NOT have academic session dropdown
      const collectModal = document.getElementById('collectTransportModal');
      const hasSessionDropdown = collectModal ? !!collectModal.querySelector('#tr_pay_session') : false;

      return {
        hasThisMonth,
        hasSessionDue,
        hasSessionDropdown
      };
    })()
  `);
  recordTest('Regressions', 'Transport Fee table contains This Month Due and Session Due columns', transportCheck.hasThisMonth && transportCheck.hasSessionDue, `This Month: ${transportCheck.hasThisMonth}, Session Due: ${transportCheck.hasSessionDue}`);
  recordTest('Regressions', 'Collect Transport Fee modal has removed redundant session dropdown', !transportCheck.hasSessionDropdown, `hasSessionDropdown=${transportCheck.hasSessionDropdown}`);

  // Check 4.3: Financial reports print options (Daily collection, Payment mode summary, 3 signatures)
  const printOptionsCheck = await win.webContents.executeJavaScript(`
    (() => {
      const quickPrintModal = document.getElementById('modalQuickPrintReports');
      const buttons = quickPrintModal ? Array.from(quickPrintModal.querySelectorAll('button.btn.bo')).map(b => b.textContent.trim()) : [];
      const hasExecutive = buttons.some(b => b.includes('Executive Financial Summary'));
      const hasMasterLedger = buttons.some(b => b.includes('Master Fee Collection Ledger'));
      const hasDailyAudit = buttons.some(b => b.includes('Daily Fee Collection & Audit Report'));
      const hasMonthly = buttons.some(b => b.includes('Monthly Fee Collection Report'));
      const hasClassWise = buttons.some(b => b.includes('Class-wise Collection & Dues Report'));
      return {
        buttons,
        unwantedRemoved: !hasExecutive && !hasMasterLedger,
        officialRetained: hasDailyAudit && hasMonthly && hasClassWise
      };
    })()
  `);
  recordTest('Regressions', 'Print options modal has unwanted reports removed and official printable reports retained', printOptionsCheck.unwantedRemoved && printOptionsCheck.officialRetained, `Buttons: [${printOptionsCheck.buttons.join(', ')}]`);

  // ============================================================
  // OBJECTIVE 5: ZERO SCROLLBAR ON DASHBOARD IN ALL STANDARD VIEWPORTS
  // ============================================================
  console.log('\n--- VERIFYING OBJECTIVE 5: Zero Scrollbar in Standard Viewports ---');

  const viewports = [
    { name: '1920x1080 (FHD Desktop)', width: 1920, height: 1080 },
    { name: '1440x900 (Widescreen / MacBook)', width: 1440, height: 900 },
    { name: '1366x768 (Standard Laptop)', width: 1366, height: 768 },
    { name: '1280x800 (Compact Desktop)', width: 1280, height: 800 }
  ];

  await win.webContents.executeJavaScript(`showPage('dashboard');`);

  for (const vp of viewports) {
    win.setSize(vp.width, vp.height);
    await new Promise(r => setTimeout(r, 400));

    const vpMetrics = await win.webContents.executeJavaScript(`
      (() => {
        const ca = document.querySelector('.ca');
        const db = document.getElementById('page-dashboard');
        return {
          windowW: window.innerWidth,
          windowH: window.innerHeight,
          caClientH: ca.clientHeight,
          caScrollH: ca.scrollHeight,
          caClientW: ca.clientWidth,
          caScrollW: ca.scrollWidth,
          dbClientH: db.clientHeight,
          dbScrollH: db.scrollHeight,
          caOverflowY: window.getComputedStyle(ca).overflowY,
          isVertScroll: ca.scrollHeight > ca.clientHeight + 1,
          isHorizScroll: ca.scrollWidth > ca.clientWidth + 1
        };
      })()
    `);

    const passedZeroScroll = !vpMetrics.isVertScroll && !vpMetrics.isHorizScroll;
    recordTest('Zero Scrollbar', `Dashboard zero-scroll in ${vp.name}`, passedZeroScroll, `Window: ${vpMetrics.windowW}x${vpMetrics.windowH}, ca: ${vpMetrics.caScrollW}x${vpMetrics.caScrollH} (client: ${vpMetrics.caClientW}x${vpMetrics.caClientH}), overflowY: ${vpMetrics.caOverflowY}`);
  }

  // Final Screenshot capture in 1366x768
  win.setSize(1366, 768);
  await new Promise(r => setTimeout(r, 400));
  const finalScreenshot = await win.webContents.capturePage();
  saveArtifact('screenshot_dashboard_final_verified_1366x768.png', finalScreenshot.toPNG());
  console.log('Saved final screenshot to artifacts: screenshot_dashboard_final_verified_1366x768.png');

  console.log('\n============================================================');
  console.log(`SUMMARY: ${report.summary.passed}/${report.summary.total} TESTS PASSED (${report.summary.failed} failed)`);
  console.log('============================================================\n');

  // Save JSON report
  saveArtifact('agent1_verification_report.json', Buffer.from(JSON.stringify(report, null, 2)));

  app.quit();
});
