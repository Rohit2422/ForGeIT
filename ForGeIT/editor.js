(() => {
  const editor = document.getElementById('editor');
  let anchorCell = null; // First cell clicked for range selections

  // ==== Undo / Redo Stacks ====
  let undoStack = [];
  let redoStack = [];

  function saveState() {
    undoStack.push(editor.innerHTML);
    redoStack = []; // Clear redo history after a new change
  }

  function undo() {
    if (undoStack.length > 1) {
      redoStack.push(undoStack.pop());
      editor.innerHTML = undoStack[undoStack.length - 1];
    } else {
      alert("Nothing to undo.");
    }
  }
document.getElementById('undoBtn').addEventListener('click', undo);
  function redo() {
    if (redoStack.length > 0) {
      const state = redoStack.pop();
      undoStack.push(state);
      editor.innerHTML = state;
    } else {
      alert("Nothing to redo.");
    }
  }
document.getElementById('redoBtn').addEventListener('click', redo);
  // Save initial state
  saveState();

  // ==== Keyboard Shortcuts for Undo/Redo ====
  document.addEventListener('keydown', (e) => {
    // Undo: Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
    else if ((e.ctrlKey && e.key.toLowerCase() === 'y') ||
             ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      redo();
    }
  });

  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function ensureTableExists(rows=3, cols=3) {
    let table = editor.querySelector('table');
    if (!table) {
      table = document.createElement('table');
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      editor.appendChild(table);
      for (let r=0;r<rows;r++){
        const tr = document.createElement('tr');
        for (let c=0;c<cols;c++){
          const td = document.createElement('td');
          td.contentEditable = "true";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    return table;
  }

  function getCurrentTableAndCells() {
    const selCells = $$('#editor td.selected, #editor th.selected');
    const any = selCells[0];
    if (any) {
      const table = any.closest('table');
      return { table, selCells };
    }
    const table = editor.querySelector('table');
    return { table, selCells: [] };
  }

  function clearSelection() {
    $$('#editor td.selected, #editor th.selected').forEach(td => td.classList.remove('selected'));
  }

  function getCellPosition(cell) {
    const table = cell.closest('table');
    const rows = Array.from(table.rows);
    let rIndex=-1, cIndex=-1;
    rows.forEach((tr, ri) => {
      Array.from(tr.cells).forEach((td, ci) => {
        if (td === cell) { rIndex = ri; cIndex = ci; }
      });
    });
    return { row: rIndex, col: cIndex };
  }

  function normalizeTable(table) {
    const matrix = [];
    const rows = Array.from(table.rows);
    for (let r = 0; r < rows.length; r++) {
      const tr = rows[r];
      matrix[r] = matrix[r] || [];
      let col = 0;
      for (let c = 0; c < tr.cells.length; c++) {
        const cell = tr.cells[c];
        while (matrix[r][col]) col++;
        const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
        const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
        for (let rr = 0; rr < rs; rr++) {
          for (let cc = 0; cc < cs; cc++) {
            matrix[r + rr] = matrix[r + rr] || [];
            matrix[r + rr][col + cc] = cell;
          }
        }
        col += cs;
      }
    }
    return matrix;
  }

  function selectRect(anchor, target) {
    const table = anchor.closest('table');
    if (!table || table !== target.closest('table')) return;
    clearSelection();
    const matrix = normalizeTable(table);
    let aPos = null, tPos = null;
    for (let r=0;r<matrix.length;r++){
      for (let c=0;c<(matrix[r]||[]).length;c++){
        if (matrix[r][c] === anchor) aPos = {r,c};
        if (matrix[r][c] === target) tPos = {r,c};
      }
    }
    if (!aPos || !tPos) return;
    const r1 = Math.min(aPos.r, tPos.r), r2 = Math.max(aPos.r, tPos.r);
    const c1 = Math.min(aPos.c, tPos.c), c2 = Math.max(aPos.c, tPos.c);
    const setSel = new Set();
    for (let r=r1;r<=r2;r++){
      for (let c=c1;c<=c2;c++){
        const cell = matrix[r][c];
        if (cell) setSel.add(cell);
      }
    }
    setSel.forEach(cell => cell.classList.add('selected'));
  }

  editor.addEventListener('click', (e) => {
    const cell = e.target.closest('td,th');
    if (!cell) return;
    if (e.shiftKey && anchorCell) {
      selectRect(anchorCell, cell);
    } else {
      clearSelection();
      cell.classList.add('selected');
      anchorCell = cell;
    }
  });

  // Toolbar actions
  $('#newTableBtn').addEventListener('click', () => { saveState(); 
    const rows = Math.min(20, Math.max(1, parseInt(prompt('Rows?', '3') || '3', 10)));
    const cols = Math.min(20, Math.max(1, parseInt(prompt('Columns?', '3') || '3', 10)));
    editor.innerHTML = ''; 
    ensureTableExists(rows, cols);
  });

  function forEachSelectedCell(fn){
    const { selCells } = getCurrentTableAndCells();
    if (selCells.length === 0 && editor.querySelector('table')) {
      if (anchorCell) fn(anchorCell);
      return;
    }
    selCells.forEach(fn);
  }

  function addRow(relative) {
    const { table } = getCurrentTableAndCells();
    if (!table) return;
    const rows = Array.from(table.rows);
    const target = anchorCell || (rows[0]?.cells[0]);
    if (!target) return;
    const tr = target.parentElement;
    const idx = rows.indexOf(tr);
    const insertIndex = relative === 'above' ? idx : idx + 1;
    const cols = rows[0] ? rows[0].cells.length : 1;
    const newRow = document.createElement('tr');
    for (let i=0;i<cols;i++){
      const td = document.createElement('td'); td.contentEditable = "true"; newRow.appendChild(td);
    }
    if (insertIndex >= rows.length) table.tBodies[0].appendChild(newRow);
    else table.tBodies[0].insertBefore(newRow, rows[insertIndex]);
  }

  function addCol(direction){
    const { table } = getCurrentTableAndCells();
    if (!table) return;
    const rows = Array.from(table.rows);
    const target = anchorCell || (rows[0]?.cells[0]);
    if (!target) return;
    const cellIndex = Array.from(target.parentElement.cells).indexOf(target);
    const insertIndex = direction === 'left' ? cellIndex : cellIndex + 1;
    rows.forEach(tr => {
      const td = document.createElement('td'); td.contentEditable = "true";
      const cells = Array.from(tr.cells);
      if (insertIndex >= cells.length) tr.appendChild(td);
      else tr.insertBefore(td, cells[insertIndex]);
    });
  }

  function deleteRow(){
    const { table, selCells } = getCurrentTableAndCells();
    if (!table) return;
    const rowsToDelete = new Set();
    (selCells.length ? selCells : [anchorCell]).forEach(c => rowsToDelete.add(c.parentElement));
    rowsToDelete.forEach(tr => tr.remove());
  }

  function deleteCol(){
    const { table, selCells } = getCurrentTableAndCells();
    if (!table) return;
    const colsToDelete = new Set();
    const rows = Array.from(table.rows);
    const targetCells = (selCells.length ? selCells : [anchorCell]);
    targetCells.forEach(c => {
      const i = Array.from(c.parentElement.cells).indexOf(c);
      colsToDelete.add(i);
    });
    const idxs = Array.from(colsToDelete).sort((a,b)=>b-a);
    rows.forEach(tr => {
      idxs.forEach(i => tr.cells[i] && tr.deleteCell(i));
    });
  }

  function mergeCells(){
    const { table, selCells } = getCurrentTableAndCells();
    if (!table || selCells.length < 2) return;
    const matrix = normalizeTable(table);
    let rows = [], cols = [];
    selCells.forEach(c => {
      for (let r=0;r<matrix.length;r++){
        for (let k=0;k<(matrix[r]||[]).length;k++){
          if (matrix[r][k] === c){ rows.push(r); cols.push(k); }
        }
      }
    });
    const r1 = Math.min(...rows), r2 = Math.max(...rows);
    const c1 = Math.min(...cols), c2 = Math.max(...cols);
    const width = c2 - c1 + 1;
    const height = r2 - r1 + 1;
    const topLeft = matrix[r1][c1];
    let mergedText = selCells.map(c => c.innerHTML).join(' ');
    selCells.forEach(c => { if (c !== topLeft) c.remove(); });
    topLeft.setAttribute('colspan', String(width));
    topLeft.setAttribute('rowspan', String(height));
    topLeft.innerHTML = mergedText;
    clearSelection();
    topLeft.classList.add('selected');
    anchorCell = topLeft;
  }

  function splitCell() {
  const cell = (getCurrentTableAndCells().selCells[0] || anchorCell);
  if (!cell) return;

  const cols = Math.max(2, parseInt(prompt('Split into how many columns?', '2'), 10) || 2);
  const rows = Math.max(1, parseInt(prompt('How many rows?', '1'), 10) || 1);

  // Create inner table
  const innerTable = document.createElement('table');
  const tbody = document.createElement('tbody');
  innerTable.appendChild(tbody);

  // Copy border style from outer table for consistency
  innerTable.style.borderCollapse = "collapse";
  innerTable.style.width = "100%";
  innerTable.style.height = "100%";

  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.contentEditable = "true";
      td.style.border = "1px solid #2b3a50"; // Match your table border color
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  // Clear the original cell and insert the mini table
  cell.innerHTML = '';
  cell.contentEditable = "false"; // prevent editing outside inner table
  cell.appendChild(innerTable);
}


  function setBorderColor(color){
    forEachSelectedCell(td => td.style.borderColor = color);
  }
  function setCellBg(color){
    forEachSelectedCell(td => td.style.backgroundColor = color);
  }

  function format(cmd){
    document.execCommand(cmd, false, null);
  }
  function align(dir){
    forEachSelectedCell(td => td.style.textAlign = dir);
  }

  function copyHtml(){
    const table = editor.querySelector('table');
    if (!table) return;
    const html = table.outerHTML;
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = new Blob([html], { type: "text/html" });
      const data = [new ClipboardItem({ "text/html": blob })];
      navigator.clipboard.write(data).then(() => {
        alert('Table HTML copied to clipboard.');
      }).catch(() => fallbackCopyHtml(html));
    } else {
      fallbackCopyHtml(html);
    }
  }

  function fallbackCopyHtml(html){
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Table HTML copied to clipboard.');
  }

  function copyCode(){
    const table = editor.querySelector('table');
    if (!table) return;
    const html = table.outerHTML;
    navigator.clipboard.writeText(html).then(()=>{
      alert('Table Code copied to clipboard.');
    }).catch(()=>{
      const ta = document.createElement('textarea');
      ta.value = html; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      alert('Table Code copied to clipboard.');
    });
  }

  function mergeTables() {
  const tables = editor.querySelectorAll('table');
  if (tables.length < 2) {
    alert('Need at least two tables to merge.');
    return;
  }

  const table1 = tables[0];
  const table2 = tables[1];

  // Append rows from table2 into table1
  Array.from(table2.rows).forEach(row => {
    table1.tBodies[0].appendChild(row.cloneNode(true));
  });

  // Remove second table
  table2.remove();

  alert('Tables merged successfully.');
}
document.getElementById('mergeTablesBtn').addEventListener('click', mergeTables);

function mergeTablesSideBySide() {
    const tables = editor.querySelectorAll('table');
    if (tables.length < 2) {
      alert('Need at least two tables to merge.');
      return;
    }
    const table1 = tables[0];
    const table2 = tables[1];
    const rows1 = table1.rows;
    const rows2 = table2.rows;
    const maxRows = Math.max(rows1.length, rows2.length);
    for (let i = 0; i < maxRows; i++) {
      if (!rows1[i]) {
        const newRow = table1.insertRow();
        for (let j = 0; j < (rows1[0]?.cells.length || 0); j++) {
          newRow.insertCell().contentEditable = "true";
        }
      }
      if (rows2[i]) {
        Array.from(rows2[i].cells).forEach(cell => {
          rows1[i].appendChild(cell.cloneNode(true));
        });
      }
    }
    table2.remove();
    alert('Tables merged side-by-side successfully.');
  }

  $('#addRowAboveBtn').addEventListener('click', () => { saveState(); addRow('above'); });
  $('#addRowBelowBtn').addEventListener('click', () => { saveState(); addRow('below'); });
  $('#addColLeftBtn').addEventListener('click', () => { saveState(); addCol('left'); });
  $('#addColRightBtn').addEventListener('click', () => { saveState(); addCol('right'); });
  $('#delRowBtn').addEventListener('click', () => { saveState(); deleteRow(); });
  $('#delColBtn').addEventListener('click', () => { saveState(); deleteCol(); });
  $('#mergeBtn').addEventListener('click', () => { saveState(); mergeCells(); });
  $('#splitBtn').addEventListener('click', () => { saveState(); splitCell(); });
  $('#borderColor').addEventListener('input', e => { saveState(); setBorderColor(e.target.value); });
  $('#cellBg').addEventListener('input', e => { saveState(); setCellBg(e.target.value); });
  $('#boldBtn').addEventListener('click', () => { saveState(); format('bold'); });
  $('#italicBtn').addEventListener('click', () => { saveState(); format('italic'); });
  $('#underlineBtn').addEventListener('click', () => { saveState(); format('underline'); });
  $('#alignLeftBtn').addEventListener('click', () => { saveState(); align('left'); });
  $('#alignCenterBtn').addEventListener('click', () => { saveState(); align('center'); });
  $('#alignRightBtn').addEventListener('click', () => { saveState(); align('right'); });
  $('#copyHtmlBtn').addEventListener('click', copyHtml);
  $('#copyCodeBtn').addEventListener('click', copyCode);
  $('#mergeTablesBtn').addEventListener('click', () => { saveState(); mergeTables(); });
  $('#mergeTablesSideBtn').addEventListener('click', () => { saveState(); mergeTablesSideBySide(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);

  ensureTableExists(3, 4);
  // Load from chrome.storage.local
chrome.storage.local.get("tableData", (data) => {
  if (data.tableData) {
    editor.innerHTML = data.tableData;
  } else {
    ensureTableExists(3, 4);
  }
  saveState();
});
})();


// --- Moved from inline <script> in editor.html to satisfy MV3 CSP ---
(function(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      
          // Restore table from storage on load
          chrome.storage.local.get("tableContent", (data) => {
            if (data.tableContent) {
              document.getElementById("editor").innerHTML = data.tableContent;
            }
          });
      
          // Save & Close button
          document.getElementById("saveCloseBtn").addEventListener("click", () => {
            const html = document.getElementById("editor").innerHTML;
            chrome.storage.local.set({ tableContent: html }, () => {
              window.close();
            });
          });
        
    });
  } else {
    
        // Restore table from storage on load
        chrome.storage.local.get("tableContent", (data) => {
          if (data.tableContent) {
            document.getElementById("editor").innerHTML = data.tableContent;
          }
        });
    
        // Save & Close button
        document.getElementById("saveCloseBtn").addEventListener("click", () => {
          const html = document.getElementById("editor").innerHTML;
          chrome.storage.local.set({ tableContent: html }, () => {
            window.close();
          });
        });
      
  }
})();
