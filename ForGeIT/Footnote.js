(() => {
let clickPosition = null; // {x, y}
let popupEl = null;
let listenersAttached = false;
let footnoteCounter = 1;
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
  const originalBg = elem.style.backgroundColor || "";
  elem.style.transition = "background-color 1.5s ease";
  elem.style.backgroundColor = "#ffff99"; // highlight yellow
  setTimeout(() => {
    elem.style.backgroundColor = originalBg;
  }, 1500);
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
function removePopup() {
  if (!popupEl) return;
  // simple fade-out
  popupEl.style.transition = "opacity 0.18s ease, transform 0.18s ease";
  popupEl.style.opacity = "0";
  popupEl.style.transform = "scale(0.98)";
  setTimeout(() => {
    if (popupEl && popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
    popupEl = null;
  }, 200);
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
  // If popup already exists, don't spawn a duplicate
  if (popupEl) return;

  popupEl = document.createElement("div");
  popupEl.id = "footnotePopup";
  popupEl.style.position = "fixed";
  popupEl.style.left = (pos.x + 6) + "px";
  popupEl.style.top = (pos.y + 6) + "px";
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
    if (!refChar) {
      alert("Enter reference character");
      return;
    }
    insertFootnote(refChar, content);
    removePopup(); // close automatically after append
  });

  // Close popup without saving
  popupEl.querySelector("#fn_close").addEventListener("click", () => {
    removePopup();
  });

  // Back to Step 1 (reopen step 1 at current coordinates)
  popupEl.querySelector("#fn_back").addEventListener("click", () => {
    // compute approximate click position from popup's current position
    const left = parseInt(popupEl.style.left, 10) || (clickPosition && clickPosition.x) || 100;
    const top = parseInt(popupEl.style.top, 10) || (clickPosition && clickPosition.y) || 100;
    showFootnotePopup({ x: left - 6, y: top - 6 });
    // prefill textarea with content
    if (popupEl) {
      const ta = popupEl.querySelector("#fn_content");
      if (ta) ta.value = content;
    }
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
  popupEl.style.left = (clickPosition?.x + 6 || 80) + "px";
  popupEl.style.top = (clickPosition?.y + 6 || 80) + "px";
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
    <textarea id="fn_content" rows="4" style="width:100%;box-sizing:border-box; user-select:text; margin-top:6px;">${content || ""}</textarea>
    <input id="fn_char" maxlength="10" placeholder="Reference character" style="width:100%;box-sizing:border-box;padding:6px;margin-top:6px;" value="${refChar || ""}">
    <div style="text-align:right;margin-top:8px;">
      <button id="fn_save" style="padding:6px 10px;cursor:pointer;">Save</button>
      <button id="fn_cancel" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Cancel</button>
      <button id="fn_saveclose" style="padding:6px 8px;cursor:pointer;margin-left:8px;">Save & Close</button>
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

    footnoteP.textContent = `${newRefChar} ${newContent}`;
    footnoteP.dataset.refChar = newRefChar;

    // update all references
    document.querySelectorAll(`a[href="#${refId}"]`).forEach(a => {
      a.textContent = newRefChar;
    });

    if (closeAfter) {
      removePopup();
      // rebind if needed
      refreshInlineFootnoteEditing();
    }
  }

  popupEl.querySelector("#fn_save").addEventListener("click", () => doSave(false));
  popupEl.querySelector("#fn_saveclose").addEventListener("click", () => doSave(true));
}

// Insert or update footnote and add reference link in text
function insertFootnote(refChar, content) {
  if (!refChar || !content) return;

  let footnoteSection = document.getElementById("footnoteSection");
  if (!footnoteSection) {
    footnoteSection = document.createElement("div");
    footnoteSection.id = "footnoteSection";
    footnoteSection.style.marginTop = "40px";
    footnoteSection.style.borderTop = "1px solid #ddd";
    footnoteSection.style.paddingTop = "10px";
    document.body.appendChild(footnoteSection);
  }

  // find existing paragraph by refChar
  let existingP = null;
  footnoteSection.querySelectorAll("p").forEach(p => {
    if (p.dataset && p.dataset.refChar === refChar) existingP = p;
  });

  let refId;
  let createNew = false;
  if (existingP) {
    refId = existingP.id;
    // update content of existing footnote
    existingP.textContent = `${refChar} ${content}`;
  } else {
    refId = `footnote-${Date.now()}-${footnoteCounter++}`;
    const p = document.createElement("p");
    p.id = refId;
    p.dataset.refChar = refChar;
    p.style.margin = "6px 0";
    p.style.lineHeight = "1.4";
    p.textContent = `${refChar} ${content}`;
    footnoteSection.appendChild(p);
    existingP = p;
    createNew = true;
  }

  // Insert reference link at saved click position
  const range = getRangeFromPoint(clickPosition?.x, clickPosition?.y);
  const sup = document.createElement("sup");
  const a = document.createElement("a");
  a.href = `#${refId}`;
  a.textContent = refChar;
  a.style.textDecoration = "none";
  a.style.color = "blue";
  a.style.cursor = "pointer";

  a.addEventListener("click", e => {
    e.preventDefault();
    const target = document.getElementById(refId);
    if (target) smoothScrollToElement(target);
  });

  sup.appendChild(a);

  if (range) {
    try {
      range.insertNode(sup);
    } catch (err) {
      // fallback to elementFromPoint
      const el = document.elementFromPoint(clickPosition.x, clickPosition.y);
      if (el && el.nodeType === 1) el.appendChild(sup);
      else document.body.appendChild(sup);
    }
  } else {
    const el = document.elementFromPoint(clickPosition?.x || 0, clickPosition?.y || 0);
    if (el && el.nodeType === 1) {
      el.appendChild(sup);
    } else if (el && el.parentNode) {
      el.parentNode.appendChild(sup);
    } else {
      document.body.appendChild(sup);
    }
  }

  if (createNew) bindSmoothScrollToRef(refId);

  // refresh any bottom-section bindings (placeholder; kept for compatibility)
  refreshInlineFootnoteEditing();
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
    // Only active when extension/editor are enabled
    if (!extensionEnabled || !editorActive) return;

    // If click inside popup, let it handle its clicks (no new popups)
    if (popupEl && popupEl.contains(e.target)) {
      return;
    }

    // If a popup is open and the user clicks outside, close it (and don't open another)
    if (popupEl) {
      removePopup();
      return;
    }

    // If user clicked inside bottom footnote section
    const footnoteSection = document.getElementById("footnoteSection");
    if (footnoteSection && footnoteSection.contains(e.target)) {
      const p = e.target.closest("p");
      if (!p) return;

      // Ctrl+click => open edit popup for that footnote
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const refId = p.id;
        if (!refId) {
          alert("Footnote paragraph has no ID.");
          return;
        }
        const existingText = p.textContent || "";
        const firstSpace = existingText.indexOf(" ");
        const content = firstSpace > -1 ? existingText.substring(firstSpace + 1) : "";
        clickPosition = { x: e.clientX, y: e.clientY };
        showFootnoteEditPopup(refId, p.dataset.refChar || "", content);
        return;
      }

      // Normal click => open the "add footnote" popup (normal popup)
      e.preventDefault();
      e.stopPropagation();
      clickPosition = { x: e.clientX, y: e.clientY };
      showFootnotePopup(clickPosition);
      return;
    }

    // Clicked a footnote reference anchor in main text (e.g., <sup><a href="#footnote-...">1</a></sup>)
    let el = e.target;
    if (el.tagName === "A" && el.parentElement && el.parentElement.tagName === "SUP") {
      const href = el.getAttribute("href");
      if (href && href.startsWith("#footnote-")) {
        e.preventDefault();
        e.stopPropagation();

        const refId = href.substring(1);
        const footnoteP = document.getElementById(refId);
        if (!footnoteP) {
          alert("Footnote not found.");
          return;
        }

        const existingText = footnoteP.textContent || "";
        const firstSpace = existingText.indexOf(" ");
        const content = firstSpace > -1 ? existingText.substring(firstSpace + 1) : "";
        clickPosition = { x: e.clientX, y: e.clientY };

        // open edit popup for this footnote
        showFootnoteEditPopup(refId, el.textContent, content);
        return;
      }
    }

    // Otherwise: regular click anywhere else in the document opens add-footnote popup
    clickPosition = { x: e.clientX, y: e.clientY };
    showFootnotePopup(clickPosition);

  }, true); // capturing to intercept before page-level handlers

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
        if (msg.type === "toggleExtension") extensionEnabled = !!msg.enabled;
        if (msg.type === "activateEditor") editorActive = true;
        if (msg.type === "deactivateEditor") editorActive = false;
      });
    }
  } catch (err) {
    // ignore when not available
  }
}

// Initialize extension state & listeners
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
})();
