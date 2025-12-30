(() => {
let suppressNextPopup = false;
let clickPosition = null; // {x, y}
let popupLocked = false; // prevents duplicate popups
let popupEl = null;
let listenersAttached = false;
let footnoteCounter = 1;
let lastDeletedFootnote = null;
let clickedInsidePanel = false;
function isClickInsideActiveTools(target) {
    const p = document.getElementById("__active_panel__");
    return p && p.contains(target);
}
const highlightTimers = new Map();
let undoStack = [];
let redoStack = [];
/* ───────────── FLOATING FOOTNOTE PANEL ───────────── */
let panelEl = null;

let activeToolsObserverStarted = false;

function adjustFootnotePanelPosition() {
  if (!panelEl) return;
  const activePanel = document.getElementById("__active_panel__");
  if (activePanel) {
    const rect = activePanel.getBoundingClientRect();
    // move footnote panel above the Active Tools panel
    panelEl.style.bottom = rect.height + 60 + "px"; // 20px tools bottom + ~40px gap
  } else {
    panelEl.style.bottom = "16px";
  }
}

function ensureActiveToolsObserver() {
  if (activeToolsObserverStarted) return;
  activeToolsObserverStarted = true;

  const obs = new MutationObserver(() => {
    adjustFootnotePanelPosition();
  });

  obs.observe(document.body, { childList: true, subtree: true });
}

function createFootnotePanel() {
  document.querySelectorAll("#footnotePanel").forEach(el => el.remove());
  panelEl = null;

  panelEl = document.createElement("div");
panelEl.id = "footnotePanel";
panelEl.style.position = "fixed";
panelEl.style.right = "16px";
panelEl.style.bottom = "16px";
panelEl.style.width = "305px";
panelEl.style.maxHeight = "260px";

/* MATCH ACTIVE PANEL THEME */
panelEl.style.background = "rgba(0,0,0,0.9)";
panelEl.style.border = "1px solid rgba(255,255,255,0.15)";
panelEl.style.borderRadius = "8px";
panelEl.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
panelEl.style.color = "#ffffff";

panelEl.style.fontFamily = "Arial, sans-serif";
panelEl.style.fontSize = "12px";
panelEl.style.zIndex = 2147483646;
panelEl.style.display = "flex";
panelEl.style.flexDirection = "column";
panelEl.style.overflow = "hidden";

panelEl.innerHTML = `
  <div id="fn_panel_header" style="
    font-weight:600;
    padding:6px 8px;
    border-bottom:1px solid rgba(255,255,255,0.2);
    background:#111;           /* MATCH ACTIVE TOOLS HEADER */
    color:#fff;
    display:flex;
    justify-content:space-between;
    align-items:center;
  ">
    <span>Footnotes <span id="fn_panel_count" style="font-size:11px; color:#bbb;"></span></span>

    <div style="display:flex; gap:4px; align-items:center;">
      <button id="fn_panel_undo" style="
        border:none;
        background:#222;
        color:#fff;
        padding:2px 6px;
        cursor:pointer;
        border-radius:4px;
      ">Undo</button>

      <button id="fn_panel_redo" style="
        border:none;
        background:#222;
        color:#fff;
        padding:2px 6px;
        cursor:pointer;
        border-radius:4px;
      ">Redo</button>

      <button id="fn_panel_close" style="
        border:none;
        background:none;
        font-size:14px;
        cursor:pointer;
        padding:2px 6px;
        color:#fff;
      ">✖</button>
    </div>
  </div>

  <div id="fn_panel_list" style="
    flex:1;
    overflow:auto;
    background:#000; 
  "></div>
`;
  document.body.appendChild(panelEl);

  // NEW: keep panel above Active Tools panel
  ensureActiveToolsObserver();
  adjustFootnotePanelPosition();
  const closeBtn = panelEl.querySelector("#fn_panel_close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      panelEl.style.display = "none";
    });
  }

  const undoBtn = panelEl.querySelector("#fn_panel_undo");
  const redoBtn = panelEl.querySelector("#fn_panel_redo");
  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (redoBtn) redoBtn.addEventListener("click", redo);

  updateUndoRedoButtons();

  makePopupDraggable(panelEl, "#fn_panel_header");

  // mark that click happened inside the floating panel
  panelEl.addEventListener("mousedown", () => {
    clickedInsidePanel = true;
  }, true);

  panelEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = e.target.closest(".fn-panel-row");
    if (!row) return;

    const refId = row.dataset.refId;
    const footnoteP = document.getElementById(refId);
    if (!footnoteP) return;

    const strong = row.querySelector("strong");
    const numberWidth = strong ? strong.getBoundingClientRect().width + 8 : 32;
    const clickX = e.clientX - row.getBoundingClientRect().left;

    if (clickX <= numberWidth) {
      // CLICK NUMBER → scroll to top reference
      const topA = document.querySelector(`a[href="#${refId}"]`);
      if (topA) smoothScrollToElement(topA);
    } else {
      // CLICK CONTENT → scroll to bottom footnote
      smoothScrollToElement(footnoteP);
    }
  });

  panelEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const row = e.target.closest(".fn-panel-row");
    if (!row) return;
    const refId = row.dataset.refId;
    const topA = document.querySelector(`a[href="#${refId}"]`);
    if (topA) smoothScrollToElement(topA);
  });
}

function refreshFootnotePanel() {
  createFootnotePanel();
  const list = panelEl.querySelector("#fn_panel_list");
  const count = panelEl.querySelector("#fn_panel_count");

  const blocks = Array.from(document.querySelectorAll("div.footnote"));
  const allP = blocks.map(b => b.querySelector("p")).filter(p => p);

  list.innerHTML = "";

  allP.forEach(p => {
    const raw = p.innerHTML.trim();
    const m = raw.match(/^(\S+)[\.\)\]]?/);
    const refChar = m ? m[1] : "";
    const span = p.querySelector("span");
    const content = span ? span.textContent.trim() : raw.replace(/^(\S+)[\.\)\]]?\s*/, "").trim();
    const preview = content.length > 70 ? content.slice(0, 67) + "..." : content;

    const row = document.createElement("div");
    row.className = "fn-panel-row";
    row.dataset.refId = p.id;
    row.style.padding = "4px 6px";
    row.style.cursor = "pointer";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
    row.style.background = "#000";     // darker row background
    row.style.color = "#fff";          // ensure text stays visible
    row.style.whiteSpace = "nowrap";
    row.style.overflow = "hidden";
    row.style.textOverflow = "ellipsis";
    row.innerHTML = `<strong>${refChar}</strong> ${preview}`;
    list.appendChild(row);
  });

  count.textContent = `(${allP.length})`;
  if (panelEl.style.display === "none") {
    panelEl.style.display = "flex";
  }
  updateUndoRedoButtons();
}
/* ────────── END FLOATING PANEL ────────── */
// Smooth scroll with highlight
function smoothScrollToElement(elem, duration = 600) {
  if (!elem) return;
  const targetY = elem.getBoundingClientRect().top + window.pageYOffset - window.innerHeight / 2 + elem.offsetHeight / 2;
  const startY = window.pageYOffset;
  const distance = targetY - startY;
  let startTime = null;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;
    window.scrollTo(0, startY + distance * ease);
    if (elapsed < duration) {
      requestAnimationFrame(step);
    } else {
      highlightElement(elem);
    }
  }
  requestAnimationFrame(step);
}

function highlightElement(elem) {
  // Cancel any existing un-highlight timer on this element
  if (highlightTimers.has(elem)) {
    clearTimeout(highlightTimers.get(elem));
  }

  elem.style.transition = "background-color .35s ease";
  elem.style.backgroundColor = "#ffff99"; // highlight yellow

  // Remove highlight after a pause
  const t = setTimeout(() => {
    elem.style.transition = "background-color 1.5s ease";
    elem.style.backgroundColor = "";
    highlightTimers.delete(elem);
  }, 900);

  highlightTimers.set(elem, t);
}

// Helper: get caret range from point
function getRangeFromPoint(x, y) {
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (document.caretRangeFromPoint) {
    try { return document.caretRangeFromPoint(x, y); } catch { return null; }
  }
  if (document.caretPositionFromPoint) {
    try {
      const pos = document.caretPositionFromPoint(x, y);
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    } catch { return null; }
  }
  return null;
}

// Bind smooth scroll + highlight on all refs for refId
function bindSmoothScrollToRef(refId) {
  document.querySelectorAll(`a[href="#${refId}"]`).forEach(link => {
    // replace node to remove duplicate handlers
    const clone = link.cloneNode(true);
    link.parentNode.replaceChild(clone, link);
    clone.addEventListener("click", e => {
      e.preventDefault();
      const target = document.getElementById(refId);
      if (target) smoothScrollToElement(target);
    });
  });
}

// ===== Utility =====
function pushUndo(action) {
  undoStack.push(action);
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  const action = undoStack.pop();
  if (!action) return;
  redoStack.push(action);
  action.undo();
  refreshFootnotePanel();
  updateUndoRedoButtons();
}

function redo() {
  const action = redoStack.pop();
  if (!action) return;
  undoStack.push(action);
  action.redo();
  refreshFootnotePanel();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  if (!panelEl) return;
  const undoBtn = panelEl.querySelector("#fn_panel_undo");
  const redoBtn = panelEl.querySelector("#fn_panel_redo");
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
    undoBtn.style.opacity = undoStack.length === 0 ? "0.4" : "1";
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0;
    redoBtn.style.opacity = redoStack.length === 0 ? "0.4" : "1";
  }
}

function removePopup() {
  if (!popupEl) return;
  const el = popupEl;
  popupEl = null;  // release BEFORE animation
  el.style.transition = "opacity .18s ease, transform .18s ease";
  el.style.opacity = "0";
  el.style.transform = "scale(0.96)";
  setTimeout(() => el.remove(), 200);
}


// Make popup draggable by its header (headerSelector is found inside the popup)
function makePopupDraggable(popup, headerSelector) {
  if (!popup) return;
  const header = popup.querySelector(headerSelector);
  if (!header) return;

  let isDragging = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  header.style.cursor = "move";

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    popup.style.left = (origX + dx) + "px";
    popup.style.top = (origY + dy) + "px";
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = popup.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  });
}

// Show first popup step: enter footnote content
function showFootnotePopup(pos) {
  if (popupEl) return;          // popup already open
  if (popupLocked) return;      // lock enabled
  popupLocked = true;
  setTimeout(() => popupLocked = false, 500);

  popupEl = document.createElement("div");
  popupEl.id = "footnotePopup";
  popupEl.style.position = "fixed";
  const px = Math.min(pos.x + 6, window.innerWidth - 320 - 20);
  const py = Math.min(pos.y + 6, window.innerHeight - 180 - 20);

  popupEl.style.left = px + "px";
  popupEl.style.top = py + "px";
  popupEl.style.zIndex = 2147483647;
  popupEl.style.background = "white";
  popupEl.style.border = "1px solid #ccc";
  popupEl.style.padding = "10px";
  popupEl.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
  popupEl.style.borderRadius = "8px";
  popupEl.style.width = "280px";
  popupEl.style.boxSizing = "border-box";
  popupEl.style.fontFamily = "Arial, sans-serif";
  popupEl.style.userSelect = "none";
  popupEl.style.opacity = "0";
  popupEl.style.transform = "scale(0.99)";

  popupEl.addEventListener("click", ev => ev.stopPropagation()); // prevent outer click handler

  popupEl.innerHTML = `
    <div id="fn_header" style="font-weight:600;margin-bottom:6px; background:#eee; padding:6px; border-radius:5px 5px 0 0; user-select:none;">
      Step 1: Footnote Content
    </div>
    <textarea id="fn_content" rows="4" style="width:100%;box-sizing:border-box; user-select:text; margin-top:6px;"></textarea>
    <div style="text-align:right;margin-top:8px;">
      <button id="fn_next" style="padding:6px 10px;cursor:pointer;">Next</button>
      <button id="fn_cancel" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Cancel</button>
    </div>
  `;

  document.body.appendChild(popupEl);

  // animate in
  requestAnimationFrame(() => {
    popupEl.style.transition = "opacity 0.18s ease, transform 0.18s ease";
    popupEl.style.opacity = "1";
    popupEl.style.transform = "scale(1)";
  });

  makePopupDraggable(popupEl, "#fn_header");

  popupEl.querySelector("#fn_cancel").addEventListener("click", () => removePopup());

  popupEl.querySelector("#fn_next").addEventListener("click", () => {
    const content = (popupEl.querySelector("#fn_content")?.value || "").trim();
    if (!content) {
      alert("Please enter footnote content.");
      return;
    }
    showReferenceStep(content);
  });

  // focus textarea
  const ta = popupEl.querySelector("#fn_content");
  if (ta) ta.focus();
}

// Show second popup step: enter reference character
function showReferenceStep(content) {
  if (!popupEl) return;
  // replace inner html but keep the same popupEl reference (so dragging continues)
  popupEl.innerHTML = `
  <div id="fn_header2" style="font-weight:600;margin-bottom:6px; background:#f5f5f5; padding:6px; border-radius:5px 5px 0 0; user-select:none;">
    Step 2: Reference Character
  </div>
  <input id="fn_char" style="width:100%;box-sizing:border-box;padding:6px;margin-top:6px;" placeholder="e.g., 1, a, *" />
  
  <label style="display:flex;align-items:center;gap:6px;margin-top:10px;">
    <input type="checkbox" id="fn_merge_toggle">
    <span  style="font-size:11px; opacity:0.8;">Merge if same reference already exists</span>
  </label>

  <div style="text-align:right;margin-top:8px;">
    <button id="fn_append" style="padding:6px 10px;cursor:pointer;">Append</button>
    <button id="fn_close" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Close</button>
    <button id="fn_back" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Back</button>
  </div>
`;

  // re-attach dragging on new header
  makePopupDraggable(popupEl, "#fn_header2");

  // Append footnote and close automatically
  popupEl.querySelector("#fn_append").addEventListener("click", () => {
    const refChar = (popupEl.querySelector("#fn_char")?.value || "").trim();
    const merge = popupEl.querySelector("#fn_merge_toggle").checked;
    if (!refChar) {
      alert("Enter reference character");
      return;
    }
    insertFootnote(refChar, content, merge);
    removePopup();
  });

  // Close popup without saving
  popupEl.querySelector("#fn_close").addEventListener("click", () => {
    removePopup();
  });

  // Back to Step 1 (reopen step 1 at current coordinates)
  popupEl.querySelector("#fn_back").addEventListener("click", () => {
    const oldLeft = parseInt(popupEl.style.left, 10) || (clickPosition?.x || 100);
    const oldTop = parseInt(popupEl.style.top, 10) || (clickPosition?.y || 100);
    const savedContent = content;

    // remove current popup BEFORE recreating Step-1
    removePopup();

    // reopen Step-1 popup at same coordinates
    showFootnotePopup({ x: oldLeft - 6, y: oldTop - 6 });

    // restore textarea
    setTimeout(() => {
      const ta = popupEl?.querySelector("#fn_content");
      if (ta) ta.value = savedContent;
    }, 50);
  });

  // focus input
  const ip = popupEl.querySelector("#fn_char");
  if (ip) ip.focus();
}

// Show popup for editing existing footnote
function showFootnoteEditPopup(refId, refChar, content) {
  if (!refId) return;
  // remove existing popup and create edit popup
  removePopup();

  popupEl = document.createElement("div");
  popupEl.id = "footnotePopup";
  popupEl.style.position = "fixed";
  // popup size
  const popupW = 320;
  const popupH = 250;

  // Calculate safe position
  let left = clickPosition?.x + 6 || 80;
  let top  = clickPosition?.y + 6 || 80;

  // Keep inside right edge
  if (left + popupW > window.innerWidth - 20) {
    left = window.innerWidth - popupW - 20;
  }

  // Keep inside bottom edge
  if (top + popupH > window.innerHeight - 20) {
    top = window.innerHeight - popupH - 20;
  }

  popupEl.style.left = left + "px";
  popupEl.style.top  = top  + "px";
  popupEl.style.zIndex = 2147483647;
  popupEl.style.background = "white";
  popupEl.style.border = "1px solid #ccc";
  popupEl.style.padding = "10px";
  popupEl.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
  popupEl.style.borderRadius = "8px";
  popupEl.style.width = "320px";
  popupEl.style.boxSizing = "border-box";
  popupEl.style.fontFamily = "Arial, sans-serif";
  popupEl.style.userSelect = "none";
  popupEl.style.opacity = "0";
  popupEl.style.transform = "scale(0.99)";

  popupEl.addEventListener("click", ev => ev.stopPropagation());

  popupEl.innerHTML = `
  <div id="fn_edit_header" style="font-weight:600;margin-bottom:6px; background:#eee; padding:6px; border-radius:5px 5px 0 0; user-select:none;">
    Edit Footnote
  </div>

  <textarea id="fn_content" rows="4" style="width:100%;box-sizing:border-box; user-select:text; margin-top:6px;">${document.getElementById(refId)?.querySelector("span")?.textContent.trim() || ""}</textarea>

  <input id="fn_char" maxlength="10" placeholder="Reference character" style="width:100%;box-sizing:border-box;padding:6px;margin-top:6px;" value="${refChar || ""}">

  <div style="text-align:right;margin-top:10px; display:flex; justify-content:space-between;">
      <button id="fn_delete" style="padding:6px 10px;cursor:pointer; background:#d9534f; color:#fff; border:none; border-radius:4px;">Delete</button>
      
      <div>
        <button id="fn_save" style="padding:6px 6px;cursor:pointer;">Save</button>
        <button id="fn_cancel" style="padding:6px 6px;cursor:pointer;margin-left:8px;">Cancel</button>
        <button id="fn_saveclose" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Save & Close</button>
      </div>
  </div>
`;

  document.body.appendChild(popupEl);

  // animate in
  requestAnimationFrame(() => {
    popupEl.style.transition = "opacity 0.18s ease, transform 0.18s ease";
    popupEl.style.opacity = "1";
    popupEl.style.transform = "scale(1)";
  });

  makePopupDraggable(popupEl, "#fn_edit_header");

  popupEl.querySelector("#fn_cancel").addEventListener("click", () => removePopup());

  // Save (update footnote paragraph and references). Save & Close does same as Save but also ensures popup is closed (we'll close after both)
  function doSave(closeAfter = true) {
    const newContent = (popupEl.querySelector("#fn_content")?.value || "").trim();
    const newRefChar = (popupEl.querySelector("#fn_char")?.value || "").trim();

    if (!newContent) {
      alert("Footnote content cannot be empty.");
      return;
    }
    if (!newRefChar) {
      alert("Reference character cannot be empty.");
      return;
    }

    const footnoteP = document.getElementById(refId);
    if (!footnoteP) {
      alert("Footnote not found.");
      if (closeAfter) removePopup();
      return;
    }
    const oldContent = footnoteP.querySelector("span")?.textContent || "";
    const oldRefChar = refChar;

    pushUndo({
      undo: () => {
        footnoteP.innerHTML = `${oldRefChar}. <span>${oldContent}</span>`;
        document.querySelectorAll(`a[href="#${refId}"]`).forEach(a => {
          a.textContent = oldRefChar;
        });
      },
      redo: () => {
        footnoteP.innerHTML = `${newRefChar}. <span>${newContent}</span>`;
        document.querySelectorAll(`a[href="#${refId}"]`).forEach(a => {
          a.textContent = newRefChar;
        });
      }
    });

    footnoteP.innerHTML = `${newRefChar}. <span>${newContent.trim()}</span>`;

    // update all references
    document.querySelectorAll(`a[href="#${refId}"]`).forEach(a => {
      a.textContent = newRefChar;
    });

    if (closeAfter) {
      removePopup();
      refreshInlineFootnoteEditing();
      refreshFootnotePanel();
    }
  }

  popupEl.querySelector("#fn_save").addEventListener("click", () => doSave(false));
  popupEl.querySelector("#fn_saveclose").addEventListener("click", () => doSave(true));

  // DELETE footnote completely (with full undo backup)
  popupEl.querySelector("#fn_delete").addEventListener("click", () => {
    if (!confirm("Delete this footnote and all references?")) return;

    const p = document.getElementById(refId);
    if (!p) return;

    // ---- SAVE FULL UNDO SNAPSHOT ----
    lastDeletedFootnote = {
      refId,
      html: p.outerHTML,                       // full <p> HTML
      wrapperHTML: p.parentElement.outerHTML,  // <div class="footnote"> wrapper
      references: [],                          // all <sup><a> locations
    };

    document.querySelectorAll(`a[href="#${refId}"]`).forEach(a => {
      lastDeletedFootnote.references.push({
        parent: a.closest("sup").parentNode,   // where to reinsert
        nextSibling: a.closest("sup").nextSibling,
        outerHTML: a.closest("sup").outerHTML  // the sup+a HTML
      });
    });

    // ---- REMOVE FOOTNOTE + REFERENCES ----
    pushUndo({
      undo: () => {
        const container = document.createElement("div");
        container.innerHTML = lastDeletedFootnote.wrapperHTML;
        const restored = container.firstChild;
        document.body.appendChild(restored);

        lastDeletedFootnote.references.forEach(ref => {
          const temp = document.createElement("div");
          temp.innerHTML = ref.outerHTML;
          const supNode = temp.firstChild;
          ref.parent.insertBefore(supNode, ref.nextSibling);
        });
      },
      redo: () => {
        const existing = document.getElementById(refId)?.parentElement;
        if (existing) existing.remove();

        lastDeletedFootnote.references.forEach(ref => {
          const temp = document.createElement("div");
          temp.innerHTML = ref.outerHTML;
          const supNode = temp.firstChild;

          // remove only if exists
          const found = ref.parent.querySelector(`sup a[href="#${refId}"]`)?.closest("sup");
          if (found) found.remove();
        });
      }
    });

    p.parentElement.remove();
    lastDeletedFootnote.references.forEach(ref => {
      const temp = document.createElement("div");
      temp.innerHTML = ref.outerHTML;
      const supNode = temp.firstChild;
      if (ref.parent.contains(supNode)) return;
      if (ref.nextSibling)
        ref.parent.removeChild(ref.nextSibling.previousSibling);
      else
        ref.parent.removeChild(ref.parent.lastChild);
    });

    removePopup();
    refreshFootnotePanel();
  });
}

// Insert or update footnote and add reference link in text
function insertFootnote(refChar, content, merge = true) {
  if (!refChar || !content) return;

  // Collect all existing .footnote blocks (each block has exactly 1 <p>)
  const footnoteBlocks = Array.from(document.querySelectorAll("div.footnote"));

  // Extract all <p> elements in those blocks
  const allFootnotes = footnoteBlocks
    .map(div => div.querySelector("p"))
    .filter(p => p);

  // Check for existing footnote with same refChar (only if merge is on)
  let existingP = null;
  if (merge) {
    allFootnotes.forEach(p => {
      const match = p.innerHTML.trim().match(/^(\S+)\./);
      if (match && match[1] === refChar) existingP = p;
    });
  }

  let refId;
  let createNew = false;
  let wrapper = null;
  let afterNode = null;

  if (existingP) {
    // reuse existing footnote
    refId = existingP.id;
  } else {
    createNew = true;

    // Find highest existing ftnt number
    let maxFtnt = 0;
    allFootnotes.forEach(p => {
      const num = parseInt(p.id.replace("ftnt", ""), 10);
      if (!isNaN(num) && num > maxFtnt) maxFtnt = num;
    });

    refId = `ftnt${maxFtnt + 1}`;

    // Create new wrapper + <p>
    wrapper = document.createElement("div");
    wrapper.className = "footnote";

    const p = document.createElement("p");
    p.id = refId;
    p.innerHTML = `${refChar}. <span>${content}</span>`;
    wrapper.appendChild(p);

    // Insert wrapper after last footnote, otherwise append to body
    if (footnoteBlocks.length > 0) {
      afterNode = footnoteBlocks[footnoteBlocks.length - 1];
      afterNode.insertAdjacentElement("afterend", wrapper);
    } else {
      document.body.appendChild(wrapper);
    }
  }

  // Create reference <sup><a>
  const range = getRangeFromPoint(clickPosition?.x, clickPosition?.y);
  const sup = document.createElement("sup");
  const a = document.createElement("a");
  a.href = `#${refId}`;
  a.id = `ftnt_ref${refId.replace("ftnt", "")}`;
  a.textContent = refChar;

  a.addEventListener("click", e => {
    e.preventDefault();
    const target = document.getElementById(refId);
    if (target) smoothScrollToElement(target);
  });

  sup.appendChild(a);

  // Insert at caret (or fallback)
  try {
    if (range) {
      range.insertNode(sup);
    } else {
      throw new Error();
    }
  } catch {
    const safeX = Math.min(clickPosition.x, window.innerWidth - 5);
    const safeY = Math.min(clickPosition.y, window.innerHeight - 5);
    const r = getRangeFromPoint(safeX, safeY);
    if (r) {
      r.insertNode(sup);
    } else {
      document.body.appendChild(sup);
    }
  }

  const refParent = sup.parentNode;
  const refNext = sup.nextSibling;

  // Register undo/redo for this insertion
  pushUndo({
    undo: () => {
      // remove reference
      if (sup.parentNode) sup.parentNode.removeChild(sup);
      // remove new footnote block if it was created
      if (createNew && wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    },
    redo: () => {
      // restore footnote block if needed
      if (createNew && wrapper && !document.getElementById(refId)) {
        if (afterNode && afterNode.parentNode) {
          afterNode.parentNode.insertBefore(wrapper, afterNode.nextSibling);
        } else {
          document.body.appendChild(wrapper);
        }
      }
      // restore reference at its original place
      if (refParent) {
        refParent.insertBefore(sup, refNext);
      }
    }
  });

  if (createNew) bindSmoothScrollToRef(refId);
  refreshInlineFootnoteEditing();
  refreshFootnotePanel();
}

// Placeholder function in case you expand inline editing later
function refreshInlineFootnoteEditing() {
  // In your current flow inline editing is handled via ctrl+click => showFootnoteEditPopup.
  // If you add inline editing elements later, rebind them here.
  return;
}

// Setup event listeners once
function ensureListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

document.addEventListener("click", (e) => {

    // ⛔ BLOCK ALL FOOTNOTE POPUPS WHEN CLICKING ACTIVE TOOLS PANEL
    if (isClickInsideActiveTools(e.target)) return;

    if (clickedInsidePanel) {
        clickedInsidePanel = false;
        return;  // block popup completely
    }
    // Only active when extension/editor are enabled
    if (!extensionEnabled || !editorActive) return;

    if (e.target.closest("#footnotePanel")) return;
    if (e.target.closest("#footnotePopup")) return;

    // If click inside popup, let it handle its clicks (no new popups)
    if (popupEl && popupEl.contains(e.target)) {
      return;
    }

    // If a popup is open and the user clicks outside → close it,
    // BUT suppress the next popup creation triggered by the same click
    if (popupEl) {
      removePopup();
      suppressNextPopup = true;
      setTimeout(() => suppressNextPopup = false, 80);   // reset shortly
      return;
    }

    const footnoteBlock = e.target.closest("div.footnote");
    if (footnoteBlock) {
      const p = footnoteBlock.querySelector("p");
      if (!p) return;

      const refId = p.id;
      const footnoteP = document.getElementById(refId);
      if (!footnoteP) return;

      // UNIVERSAL extractor for refChar + content
      const raw = footnoteP.innerHTML.trim();
      let refChar = "";
      const m = raw.match(/^(\S+)[\.\)\]]?\s*/);
      if (m) refChar = m[1];
      let content = "";
      const span = footnoteP.querySelector("span");
      content = span ? span.textContent.trim() : raw.replace(/^(\S+)[\.\)\]]?\s*/, "").trim();

      // ▬▬ Ctrl + click → EDIT ▬▬
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        clickPosition = { x: e.clientX, y: e.clientY };
        showFootnoteEditPopup(refId, refChar, content);   // ✔ EDIT POPUP
        return;
      }

      // ▬▬ Alt + click → ADD NEW FOOTNOTE INSIDE THIS FOOTNOTE ▬▬
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        clickPosition = { x: e.clientX, y: e.clientY };

        if (!suppressNextPopup) {
          showFootnotePopup(clickPosition); // Step 1 popup
        }
        return;
      }

      // ▬▬ Normal click → SCROLL TO TOP REFERENCE ▬▬
      e.preventDefault();
      e.stopPropagation();
      const topA = document.querySelector(`a[href="#${refId}"]`);
      if (topA) smoothScrollToElement(topA);
      return;
    }
    // Clicked a footnote reference anchor in main text (e.g., <sup><a href="#footnote-...">1</a></sup>)
    let el = e.target;
    if (el.tagName === "A" && el.parentElement.tagName === "SUP") {
      const href = el.getAttribute("href");
      if (href && href.startsWith("#ftnt")) {
        const refId = href.substring(1);
        const footnoteP = document.getElementById(refId);
        if (!footnoteP) return;

        // UNIVERSAL extractor for refChar + content
        const raw = footnoteP.innerHTML.trim();

        // 1) extract ref char (before first dot OR space OR bracket)
        let refChar = "";
        const m = raw.match(/^(\S+)[\.\)\]]?\s*/);
        if (m) refChar = m[1];

        // 2) extract content (prefer span, otherwise strip refChar)
        let content = "";
        const span = footnoteP.querySelector("span");
        if (span) {
          content = span.textContent.trim();
        } else {
          content = raw.replace(/^(\S+)[\.\)\]]?\s*/, "").trim();
        }

        // CTRL + click → edit
        if (e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          clickPosition = { x: e.clientX, y: e.clientY };
          showFootnoteEditPopup(refId, refChar, content);   // ✔ EDIT POPUP
          return;
        }

        // Single click → scroll to bottom
        e.preventDefault();
        e.stopPropagation();
        smoothScrollToElement(footnoteP);
        return;
      }
    }

    // OTHERWISE → ALWAYS OPEN POPUP WHEN CLICKING TEXT-LIKE AREAS
    if (!e.ctrlKey && !e.altKey && !suppressNextPopup) {

      // ignore right margin background / empty divs
      const t = e.target;
      const isTextLike =
        (t.nodeType === 3) || // text node
        (t.tagName === "SPAN") ||
        (t.tagName === "P") ||
        (window.getSelection()?.toString()?.length === 0);

      if (isTextLike) {
        clickPosition = { x: e.clientX, y: e.clientY };
        showFootnotePopup(clickPosition);
      }
    }

  }, true); // capturing to intercept before page-level handlers

  // SHIFT + drag to move reference
  let dragRef = null;

  document.addEventListener("mousedown", (e) => {
    if (isClickInsideActiveTools(e.target)) {
        return; // Do nothing
    }
    if (e.shiftKey && e.target.tagName === "A" && e.target.closest("sup")) {
      dragRef = e.target.closest("sup");
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragRef) return;
    dragRef.style.position = "fixed";
    dragRef.style.pointerEvents = "none";
    dragRef.style.left = e.clientX + "px";
    dragRef.style.top = e.clientY + "px";
  });

  document.addEventListener("mouseup", (e) => {
    if (!dragRef) return;
    const ref = dragRef;
    dragRef = null;

    ref.style.position = "";
    ref.style.left = "";
    ref.style.top = "";
    ref.style.pointerEvents = "";

    const range = getRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    const oldParent = ref.parentNode;
    const oldNext = ref.nextSibling;

    const newParent = range.startContainer.parentNode;
    const newNext = range.startContainer.nextSibling;

    pushUndo({
      undo: () => {
        oldParent.insertBefore(ref, oldNext);
      },
      redo: () => {
        newParent.insertBefore(ref, newNext);
      }
    });

    range.insertNode(ref);
  });

  // Optional: listen to chrome.storage changes (if used in extension)
  try {
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(changes => {
        if (changes.footnoteExtensionEnabled) extensionEnabled = !!changes.footnoteExtensionEnabled.newValue;
        if (changes.footnoteEditorActive) editorActive = !!changes.footnoteEditorActive.newValue;
      });
    }
  } catch (err) {
    // ignore if not in extension environment
  }

  // Optional: runtime messages
  try {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(msg => {
        if (msg.type === "toggleExtension") {
          extensionEnabled = !!msg.enabled;
          if (extensionEnabled && editorActive) {     // auto-show only when editor mode is on
            refreshFootnotePanel();
            panelEl.style.display = "flex";
          } else if (!extensionEnabled) {
            if (panelEl) panelEl.style.display = "none";
          }
        }
        if (msg.type === "activateEditor") {
          editorActive = true;
          refreshFootnotePanel();
          panelEl.style.display = "flex";   // <--- show panel instantly
        }
        if (msg.type === "deactivateEditor") {
          editorActive = false;
          if (panelEl) panelEl.style.display = "none";
        }
      });
    }
  } catch (err) {
    // ignore when not available
  }
}
// Initialize extension state & listeners
function initialize() {
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        ["footnoteExtensionEnabled", "footnoteEditorActive"],
        (data) => {
          extensionEnabled = data.footnoteExtensionEnabled !== undefined
            ? !!data.footnoteExtensionEnabled
            : true;

          editorActive = data.footnoteEditorActive !== undefined
            ? !!data.footnoteEditorActive
            : true;

          ensureListeners();
        }
      );
      return;
    }
  } catch (err) {
    // ignore
  }

  // If chrome.storage isn't available (testing mode), enable directly
  extensionEnabled = true;
  editorActive = true;
  ensureListeners();
  refreshFootnotePanel();
  panelEl.style.display = "flex";
}


initialize();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pickFolderAndConvert") {
    (async () => {
      try {
        if (!defaultImageFolderHandle) {
          if (isPickingFolder) return; // prevent duplicate picker calls
          isPickingFolder = true;
          defaultImageFolderHandle = await window.showDirectoryPicker();
          isPickingFolder = false;
          console.log(" Default folder chosen:", defaultImageFolderHandle.name);
        }

        let missingFiles = [];
        const imgs = Array.from(document.querySelectorAll("img"));

        for (const img of imgs) {
          const filename = img.src.split("/").pop().split("?")[0];
          try {
            const fileHandle = await defaultImageFolderHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const base64 = await fileToBase64(file);
            img.src = base64;
          } catch {
            missingFiles.push(filename);
          }
        }

        if (missingFiles.length > 0) {
          alert(` ${missingFiles.length} image(s) not found:\n${missingFiles.join("\n")}`);
        } else {
          sendResponse({ success: true }); // signal success to popup.js
        }

      } catch (err) {
        isPickingFolder = false;
        console.error(" Folder picker failed:", err);
      }
    })();
    return true; // keep message channel open
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runConvertWithPicker") {
    (async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        console.log("Folder chosen:", dirHandle.name);
        // TODO: match images and replace with base64 here directly in content script
      } catch (err) {
        if (err.name === "AbortError") {
          console.log("User cancelled folder selection");
        } else {
          console.error("Folder pick failed:", err);
          alert(` Folder pick failed: ${err.message}`);
        }
      }
    })();
  }
});
// Store folder handle in page context
let defaultImageFolderHandle = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pickFolderAndConvert") {
    (async () => {
      try {
        if (!defaultImageFolderHandle) {
          if (isPickingFolder) return; // prevent duplicate picker calls
          isPickingFolder = true;
          defaultImageFolderHandle = await window.showDirectoryPicker();
          isPickingFolder = false;
          console.log(" Default folder chosen:", defaultImageFolderHandle.name);
        }

        let missingFiles = [];
        const imgs = Array.from(document.querySelectorAll("img"));

        for (const img of imgs) {
          const filename = img.src.split("/").pop().split("?")[0];
          try {
            const fileHandle = await defaultImageFolderHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const base64 = await fileToBase64(file);
            img.src = base64;
          } catch {
            missingFiles.push(filename);
          }
        }

        //  Only show popup if something is missing
        if (missingFiles.length > 0) {
          alert(` ${missingFiles.length} image(s) not found:\n${missingFiles.join("\n")}`);
        }

      } catch (err) {
        isPickingFolder = false;
        if (err.name === "AbortError") {
          // User cancelled → just log silently
          console.log("User cancelled folder selection");
        } else {
          console.error("Folder picker failed:", err);
          alert(` Folder pick failed: ${err.message}`);
        }
      }
    })();
  }
  if (missingFiles.length > 0) {
    alert(` ${missingFiles.length} image(s) not found:\n${missingFiles.join("\n")}`);
  } else {
    sendResponse({ success: true }); // let popup.js show the final success message
  }
  return true; // keep message channel open
});



// Helper: convert File  Base64
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "disableFootnote") {
    // cleanup or disable footnote functionality
    console.log("Footnote Editor disabled");
  }
});
document.addEventListener("copy", (e) => {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  try {
    const htmlFragment = sel.getRangeAt(0).cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(htmlFragment);

    temp.querySelectorAll("#footnotePanel, #footnotePopup").forEach(el => el.remove());

    // Put clean HTML into clipboard
    e.clipboardData.setData("text/html", temp.innerHTML);

    // Also set plain text for compatibility
    e.clipboardData.setData("text/plain", temp.innerText);

    e.preventDefault();
  } catch (err) {
    console.warn("Copy handler safe-fail:", err);
    // allow the default copy — DO NOT block copy if an error happened
  }
});
})();