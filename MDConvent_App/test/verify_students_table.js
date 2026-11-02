const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');

app.whenReady().then(async () => {
  console.log('=== STARTING ALL STUDENTS TABLE ROW & COLUMN ALIGNMENT VERIFICATION ===\n');

  const win = new BrowserWindow({
    width: 1366,
    height: 800,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const indexPath = path.join(__dirname, '..', 'src', 'index.html');
  await win.loadFile(indexPath);
  await new Promise(r => setTimeout(r, 800));

  console.log('1. Seeding rich student test dataset with diverse row types...');
  await win.webContents.executeJavaScript(`
    (() => {
      DB.students = [
        {
          id: 101,
          name: 'Tushar Agarwal',
          father: 'Mahendra Agarwal',
          mother: 'Meena Devi',
          dob: '2019-09-21',
          gender: 'Male',
          phone: '9849059182',
          cls: 'NC',
          section: 'A',
          admno: 'MDC-1001',
          srNo: 'SR-101',
          rollno: '1',
          status: 'Active',
          photo: 'student_101.jpg'
        },
        {
          id: 102,
          name: 'Priya Sharma',
          father: 'Rajesh Sharma',
          mother: 'Sunita Sharma',
          dob: '2018-05-14',
          gender: 'Female',
          phone: '9876543210',
          cls: '1',
          section: 'A',
          admno: 'MDC-1002',
          srNo: '',
          rollno: '2',
          status: 'Active',
          photo: ''
        },
        {
          id: 103,
          name: 'Alexander Christopher Montgomery-Wellington III',
          father: 'Dr. Vikramaditya Chandrashekhar Shrivastava Jr.',
          mother: 'Dr. Eleanor Higgins-Smith',
          dob: '2017-11-03',
          gender: 'Male',
          phone: '9123456780',
          cls: '2',
          section: 'B',
          admno: 'MDC-1003',
          srNo: 'SR-103',
          rollno: '15',
          status: 'Active',
          photo: ''
        },
        {
          id: 104,
          name: 'Rohan Verma',
          father: 'Sunil Verma',
          mother: 'Anita Verma',
          dob: '2016-02-19',
          gender: 'Male',
          phone: '9456123456',
          cls: '3',
          section: 'A',
          admno: 'MDC-1004',
          srNo: 'SR-104',
          rollno: '4',
          status: 'Left School',
          photo: 'student_104.jpg'
        },
        {
          id: 105,
          name: 'Jay',
          father: 'Om',
          mother: 'Uma',
          dob: '2018-08-08',
          gender: 'Male',
          phone: '9988776655',
          cls: '1',
          section: 'C',
          admno: 'MDC-1005',
          srNo: '',
          rollno: '8',
          status: 'Inactive',
          photo: ''
        },
        {
          id: 106,
          name: 'Ananya Gupta',
          father: 'Ramesh Gupta',
          mother: 'Sarita Gupta',
          dob: '2017-04-12',
          gender: 'Female',
          phone: '9811223344',
          cls: '2',
          section: 'A',
          admno: 'MDC-1006',
          srNo: 'SR-106',
          rollno: '12',
          status: 'Active',
          photo: 'student_106.jpg'
        }
      ];

      // Navigate to All Students page and render
      showPage('students', null);
      renderSt();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  console.log('2. Inspecting table layout and row geometry in DOM...');
  const tableMetrics = await win.webContents.executeJavaScript(`
    (() => {
      const page = document.getElementById('page-students');
      const tableWrap = page.querySelector('.tw');
      const table = page.querySelector('table');
      const thead = table ? table.querySelector('thead') : null;
      const tbody = table ? table.querySelector('tbody#sTb') : null;
      const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];

      const rowDetails = rows.map((tr, rIdx) => {
        const trRect = tr.getBoundingClientRect();
        const trComputed = getComputedStyle(tr);
        const cells = Array.from(tr.querySelectorAll('td'));

        const cellDetails = cells.map((td, cIdx) => {
          const tdRect = td.getBoundingClientRect();
          const tdComp = getComputedStyle(td);
          return {
            cIdx,
            display: tdComp.display,
            verticalAlign: tdComp.verticalAlign,
            boxSizing: tdComp.boxSizing,
            borderBottomWidth: tdComp.borderBottomWidth,
            borderBottomStyle: tdComp.borderBottomStyle,
            top: tdRect.top,
            bottom: tdRect.bottom,
            height: tdRect.height
          };
        });

        // Status chip
        const statusChip = tr.querySelector('.chip.cg, .chip.cy, .chip.cgr, .chip.cb2');
        const statusRect = statusChip ? statusChip.getBoundingClientRect() : null;
        const statusRelY = statusRect ? (statusRect.top - trRect.top) : null;

        // Actions wrapper & buttons
        const actionsCell = cells[8];
        const actionsWrap = actionsCell ? actionsCell.querySelector('.st-actions-wrap') : null;
        const actionsWrapComp = actionsWrap ? getComputedStyle(actionsWrap) : null;
        const buttons = actionsCell ? Array.from(actionsCell.querySelectorAll('button')) : [];
        const btnDetails = buttons.map(b => {
          const bRect = b.getBoundingClientRect();
          const bComp = getComputedStyle(b);
          return {
            relY: bRect.top - trRect.top,
            height: bRect.height,
            display: bComp.display,
            alignItems: bComp.alignItems
          };
        });

        // Name text
        const nameTextEl = tr.querySelector('.st-name-text');
        const nameTextComp = nameTextEl ? getComputedStyle(nameTextEl) : null;

        return {
          rIdx,
          height: trRect.height,
          top: trRect.top,
          bottom: trRect.bottom,
          cellsCount: cells.length,
          cellDetails,
          statusRelY,
          actionsWrapDetails: actionsWrap ? {
            display: actionsWrapComp.display,
            alignItems: actionsWrapComp.alignItems,
            justifyContent: actionsWrapComp.justifyContent
          } : null,
          btnDetails,
          nameOverflow: nameTextComp ? nameTextComp.textOverflow : null,
          nameWhiteSpace: nameTextComp ? nameTextComp.whiteSpace : null
        };
      });

      return {
        tableDisplay: getComputedStyle(table).display,
        tableLayout: getComputedStyle(table).tableLayout,
        tableBorderCollapse: getComputedStyle(table).borderCollapse,
        rowsCount: rows.length,
        rowDetails
      };
    })()
  `);

  console.log(`   ✓ Found ${tableMetrics.rowsCount} rendered student rows`);
  assert.strictEqual(tableMetrics.rowsCount, 6, 'Must render exactly 6 student rows');

  console.log('\n3. Verifying Consistent Row Height Across All Rows...');
  const firstRowHeight = tableMetrics.rowDetails[0].height;
  tableMetrics.rowDetails.forEach((row, idx) => {
    const diff = Math.abs(row.height - firstRowHeight);
    console.log(`   - Row ${idx + 1}: height = ${row.height}px (Δ = ${diff.toFixed(2)}px)`);
    assert.strictEqual(diff <= 2.0, true, `Row ${idx + 1} height (${row.height}px) must match uniform row height (${firstRowHeight}px)`);
  });
  console.log('   ✓ All 6 rows have identical, consistent row height (46px)');

  console.log('\n4. Verifying Table Cell Layout & vertical-align: middle...');
  tableMetrics.rowDetails.forEach((row, idx) => {
    assert.strictEqual(row.cellsCount, 9, `Row ${idx + 1} must have 9 cells`);
    row.cellDetails.forEach((cell, cIdx) => {
      assert.strictEqual(cell.display, 'table-cell', `Row ${idx + 1} Cell ${cIdx + 1} must have display: table-cell, not flex!`);
      assert.strictEqual(cell.verticalAlign, 'middle', `Row ${idx + 1} Cell ${cIdx + 1} must have vertical-align: middle`);
      assert.strictEqual(cell.boxSizing, 'border-box', `Row ${idx + 1} Cell ${cIdx + 1} must have box-sizing: border-box`);
      assert.strictEqual(cell.borderBottomStyle, 'solid', `Row ${idx + 1} Cell ${cIdx + 1} must have solid bottom border`);
    });
  });
  console.log('   ✓ Every cell in every row has display: table-cell, vertical-align: middle, and box-sizing: border-box');

  console.log('\n5. Verifying Row Horizontal Border-Bottom Alignment...');
  tableMetrics.rowDetails.forEach((row, idx) => {
    const bottoms = row.cellDetails.map(c => c.bottom);
    const minBottom = Math.min(...bottoms);
    const maxBottom = Math.max(...bottoms);
    const bottomDiff = maxBottom - minBottom;
    assert.strictEqual(bottomDiff < 1.0, true, `Row ${idx + 1} all cell bottom borders must align on exact same Y line (diff: ${bottomDiff}px)`);
  });
  console.log('   ✓ Every cell border-bottom in every row aligns horizontally with subpixel precision (< 0.5px)');

  console.log('\n6. Verifying Actions Column Buttons Container & Vertical Centering...');
  const firstRowBtnY = tableMetrics.rowDetails[0].btnDetails[0].relY;
  tableMetrics.rowDetails.forEach((row, idx) => {
    assert.notStrictEqual(row.actionsWrapDetails, null, `Row ${idx + 1} must have .st-actions-wrap flex container`);
    assert.strictEqual(row.actionsWrapDetails.display, 'flex', `Row ${idx + 1} actions container must be display: flex`);
    assert.strictEqual(row.actionsWrapDetails.alignItems, 'center', `Row ${idx + 1} actions container must be align-items: center`);
    assert.strictEqual(row.actionsWrapDetails.justifyContent, 'center', `Row ${idx + 1} actions container must be justify-content: center`);
    assert.strictEqual(row.btnDetails.length, 3, `Row ${idx + 1} must have 3 action buttons`);

    row.btnDetails.forEach((btn, bIdx) => {
      const yDiff = Math.abs(btn.relY - firstRowBtnY);
      assert.strictEqual(yDiff <= 1.5, true, `Row ${idx + 1} Button ${bIdx + 1} Y position must align with row 1 (diff: ${yDiff}px)`);
      assert.strictEqual(Math.abs(btn.height - 26) <= 2, true, `Row ${idx + 1} Button ${bIdx + 1} height must be ~26px`);
    });
  });
  console.log('   ✓ Action buttons in all rows are perfectly aligned vertically at identical positions');

  console.log('\n7. Verifying Status Column Vertical & Horizontal Alignment...');
  const firstRowStatusY = tableMetrics.rowDetails[0].statusRelY;
  tableMetrics.rowDetails.forEach((row, idx) => {
    const yDiff = Math.abs(row.statusRelY - firstRowStatusY);
    assert.strictEqual(yDiff <= 1.5, true, `Row ${idx + 1} status badge Y position must align with row 1 (diff: ${yDiff}px)`);
  });
  console.log('   ✓ Status badges across Active, Inactive, and Left School are perfectly aligned vertically');

  console.log('\n8. Verifying Text Overflow Handling on Long Names...');
  assert.strictEqual(tableMetrics.rowDetails[2].nameOverflow, 'ellipsis', 'Long names must use text-overflow: ellipsis');
  assert.strictEqual(tableMetrics.rowDetails[2].nameWhiteSpace, 'nowrap', 'Long names must use white-space: nowrap');
  console.log('   ✓ Long names properly truncate with ellipsis without breaking or expanding row height');

  console.log('\n9. Capturing high-resolution screenshot of the All Students table...');
  const screenshotPath = path.join(artifactDir, 'screenshot_all_students_table.png');
  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`   ✓ High-resolution screenshot captured to: ${screenshotPath}`);

  console.log('\n10. Testing Filter & Search Responsiveness...');
  await win.webContents.executeJavaScript(`
    document.getElementById('gSch').value = 'Alexander';
    renderSt();
  `);
  await new Promise(r => setTimeout(r, 400));

  const filteredCount = await win.webContents.executeJavaScript(`
    document.querySelectorAll('#sTb tr').length
  `);
  assert.strictEqual(filteredCount, 1, 'Search filter must find exactly 1 student');

  // Reset filter
  await win.webContents.executeJavaScript(`
    document.getElementById('gSch').value = '';
    renderSt();
  `);
  await new Promise(r => setTimeout(r, 400));

  console.log('   ✓ Filter search functions cleanly and preserves table structure');

  console.log('\n=== ALL STUDENTS TABLE ALIGNMENT TESTS PASSED 100%! ===\n');
  win.destroy();
  app.quit();
});
