// === Suppress all runtime errors & unhandled rejections ===
window.onerror = function(message, source, lineno, colno, error) {
  return true; // stops Chrome from logging the error
};

window.addEventListener("unhandledrejection", function(event) {
  event.preventDefault(); // stops unhandled promise rejections from logging
});

// Optional: silence console.error too (comment out if you still want logs)
console.error = () => {};
// =========================================================
// Pick a folder from the popup context
async function getOrPickFolder() {
  try {
    return await window.showDirectoryPicker({ mode: "read" });
  } catch (err) {
    throw err;
  }
}
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('toolbar-main-btn');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('data-open') === 'true';
      btn.setAttribute('data-open', String(!open));
      btn.setAttribute('aria-pressed', String(!open));
      btn.title = open ? 'Menu' : 'Close';
    });
  });
  
// Save a feature state in chrome.storage.local
function setFeatureState(feature, isActive) {
  chrome.storage.local.get("activeFeatures", (data) => {
    let active = data.activeFeatures || [];
    if (isActive && !active.includes(feature)) {
      active.push(feature);
    } else if (!isActive) {
      active = active.filter(f => f !== feature);
    }
    chrome.storage.local.set({ activeFeatures: active });
  });
}

// === Active Panel injected into webpage (draggable, closable, interactive) ===
function updateActivePanel() {
  chrome.storage.local.get(["activePanelVisible", "activeFeatures"], (data) => {
    const isVisible = data.activePanelVisible ?? false;
    if (!isVisible) return;

    const active = data.activeFeatures || [];

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (initialActive) => {
          try {
            const old = document.getElementById("__active_panel__");
            if (old) old.remove();

            // Panel container
            const panel = document.createElement("div");
            panel.id = "__active_panel__";
            Object.assign(panel.style, {
              position: "fixed",
              bottom: "20px",
              right: "20px",
              background: "rgba(0,0,0,0.9)",
              color: "#fff",
              padding: "10px 12px",
              borderRadius: "10px",
              fontFamily: "system-ui, sans-serif",
              fontSize: "13px",
              zIndex: 2147483647,
              boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
              width: "280px",
              userSelect: "none",
            });

            // Header
            const header = document.createElement("div");
            Object.assign(header.style, {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "move",
              marginBottom: "8px",
            });

            const title = document.createElement("div");
            title.textContent = "🧩 Active Tools";
            Object.assign(title.style, {
              fontWeight: "700",
              fontSize: "13px",
            });

            const closePanelBtn = document.createElement("button");
            closePanelBtn.textContent = "✖";
            closePanelBtn.title = "Close Panel";
            Object.assign(closePanelBtn.style, {
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "15px",
              padding: "2px",
              lineHeight: "1",
            });

            closePanelBtn.addEventListener("click", () => {
              panel.remove();
              chrome.storage.local.set({
                activePanelVisible: false,
                activeFeatures: [],
              });
            });

            header.append(title, closePanelBtn);
            panel.appendChild(header);

            // Body
            const body = document.createElement("div");
            Object.assign(body.style, {
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              maxHeight: "320px",
              overflow: "auto",
            });

            if (!initialActive.length) {
              const msg = document.createElement("div");
              msg.textContent = "No active tools.";
              msg.style.opacity = "0.85";
              msg.style.fontSize = "13px";
              body.appendChild(msg);
            } else {
              initialActive.forEach((f) => {
                const row = document.createElement("div");
                row.className = "feature-row";
                Object.assign(row.style, {
                  display: "flex",
                  alignItems: "center",
                  background: "#111",
                  borderRadius: "6px",
                  padding: "6px 8px",
                });

                const label = document.createElement("span");
                label.textContent = f;
                label.style.fontSize = "13px";
                row.appendChild(label);
                body.appendChild(row);
              });
            }

            panel.appendChild(body);
            document.body.appendChild(panel);

            // Drag panel
            let isDragging = false,
              offsetX = 0,
              offsetY = 0;
            header.addEventListener("mousedown", (e) => {
              isDragging = true;
              offsetX = e.clientX - panel.getBoundingClientRect().left;
              offsetY = e.clientY - panel.getBoundingClientRect().top;
              panel.style.transition = "none";
            });
            document.addEventListener("mousemove", (e) => {
              if (!isDragging) return;
              panel.style.left = e.clientX - offsetX + "px";
              panel.style.top = e.clientY - offsetY + "px";
              panel.style.right = "auto";
              panel.style.bottom = "auto";
            });
            document.addEventListener("mouseup", () => {
              isDragging = false;
              panel.style.transition = "all 0.08s ease";
            });
          } catch (err) {
            console.error("Active panel error", err);
          }
        },
        args: [active],
      });
    });
  });
}

// 👇 Auto-refresh Active Panel when features change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.activeFeatures || changes.activePanelVisible)) {
    updateActivePanel();
  }
});

// 👇 Reset on extension startup or reload
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ activeFeatures: [], activePanelVisible: true });
});

// 👇 Also reset when popup's Save button is clicked
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "saveClicked") {
    chrome.storage.local.set({ activeFeatures: [], activePanelVisible: true }, () => {
      updateActivePanel();
    });
  }
});

// Setup a toggle for a popup button
function setupFeatureToggle(buttonId, featureLabel) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.setAttribute("data-feature", featureLabel);

  btn.addEventListener("click", () => {
    const isActive = btn.classList.toggle("active");

    // store in sync for persistence
    chrome.storage.sync.get("featureStates", (data) => {
      const states = data.featureStates || {};
      states[featureLabel] = isActive;
      chrome.storage.sync.set({ featureStates: states }, updateActivePanel);
    });

    setFeatureState(featureLabel, isActive);
    //updateActivePanel(); // refresh after toggle
  });

  // restore saved state on popup open
  chrome.storage.sync.get("featureStates", (data) => {
    if (data.featureStates && data.featureStates[featureLabel]) {
      btn.classList.add("active");
      setFeatureState(featureLabel, true);
      //updateActivePanel(); // refresh after load
    }
  });
}

// ============================
// Popup Initialization
// ============================
document.addEventListener("DOMContentLoaded", () => {
  // Register feature buttons
  setupFeatureToggle("highlight-btn", "Highlight");
  setupFeatureToggle("clear-btn", "Clear Highlight");
  setupFeatureToggle("remove-style-btn", "Remove Styles");
  setupFeatureToggle("remove-attributes", "Remove Classes & IDs");
  setupFeatureToggle("remove-span-btn", "Remove <span>");
  setupFeatureToggle("organize", "Organize HTML");
  setupFeatureToggle("stylings-btn", "Append Stylings");
  setupFeatureToggle("remove-ul-li", "List Cleaner");
  setupFeatureToggle("remove-unicode", "Fix Unicode Entities");
  setupFeatureToggle("assign-heading", "Heading Assigner");
  setupFeatureToggle("enable-inline-editing", "Inline Editing");
  setupFeatureToggle("save-inline-editing", "Save Inline Editing");
  setupFeatureToggle("activate-content-editor", "Content Editor");
  setupFeatureToggle("save-content-editor", "Save Content Editor");
  setupFeatureToggle("activate-hyperlink-injector", "Hyperlink Injector");
  setupFeatureToggle("clean-google-links", "Hyperlink Cleaner");
  setupFeatureToggle("activate-image-inserter", "Image Inserter");
  setupFeatureToggle("open-gemini", "Image → Table Converter");
  setupFeatureToggle("openEditorBtn", "Table Editor");
  setupFeatureToggle("btnRemoveScraps", "Remove Scraps");
  setupFeatureToggle("pdfDownloaderBtn", "PDF Downloader");
  setupFeatureToggle("validate-html-btn", "HTML Validator");
  setupFeatureToggle("broken-link-checker", "Broken Link Checker");

  // 🔹 Ensure panel updates on popup open
  //updateActivePanel();

  // Save & Proceed handler
  const saveProceedBtn = document.getElementById("saveProceedBtn");
  if (saveProceedBtn) {
    saveProceedBtn.addEventListener("click", async () => {
      try {
        // Run page cleanup inside active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => {
    localStorage.removeItem("headingMode");
    localStorage.removeItem("contentEditorMode");
    localStorage.removeItem("imageInserter");

    // properly disable hyperlink injector
    if (typeof disableHyperlinkInjector === "function") {
      disableHyperlinkInjector();
    }

    document.querySelectorAll("[contenteditable='true']").forEach(el => {
      el.removeAttribute("contenteditable");
      el.style.outline = "";
      el.style.cursor = "";
    });
    window.__inlineEditing = false;
  }
});
        }

        alert("✅ All changes saved on page. You may proceed.");

        // Reset popup buttons
        document.querySelectorAll("[data-feature]").forEach(btn => {
          btn.classList.remove("active");
        });

        // Clear storage states
        chrome.storage.sync.set({ featureStates: {} });
        chrome.storage.local.set({ activeFeatures: [] });

        // Refresh active panel
        //updateActivePanel();

      } catch (err) {
        console.error("Save & Proceed failed:", err);
        alert("⚠️ Save failed: " + (err && err.message ? err.message : err));
      }
    });
  }
});

console.log("popup.js with Active Panel (list only) loaded ✅");
console.log("popup.js loaded ✅");
document.addEventListener("DOMContentLoaded", async () => {
  function initVersionHistory(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (!window.__versionHistory) {
        window.__versionHistory = { stack: [], index: -1 };
      }

      const saveSnapshot = () => {
        const html = document.body.innerHTML;
        if (window.__versionHistory.index < window.__versionHistory.stack.length - 1) {
          window.__versionHistory.stack = window.__versionHistory.stack.slice(0, window.__versionHistory.index + 1);
        }
        window.__versionHistory.stack.push(html);
        window.__versionHistory.index++;
      };

      const undo = () => {
        if (window.__versionHistory.index > 0) {
          window.__versionHistory.index--;
          document.body.innerHTML = window.__versionHistory.stack[window.__versionHistory.index];
          alert("↩️ Undo applied");
        } else {
          alert("⚠️ Nothing to undo.");
        }
      };

      const redo = () => {
        if (window.__versionHistory.index < window.__versionHistory.stack.length - 1) {
          window.__versionHistory.index++;
          document.body.innerHTML = window.__versionHistory.stack[window.__versionHistory.index];
          alert("↪️ Redo applied");
        } else {
          alert("⚠️ Nothing to redo.");
        }
      };

      // Inject only once
      if (!window.__versionHistoryInjected) {
        document.addEventListener("keydown", (e) => {
          if (e.ctrlKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            undo();
          }
          if (e.ctrlKey && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
          }
        });
        window.__versionHistoryInjected = true;
      }

      // Save an initial snapshot when first enabled
      saveSnapshot();
      console.log("✅ Version History initialized");
    }
  });
}
  // ==== IndexedDB helpers to store the folder handle ====
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('image-folder-db', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function saveDirHandle(handle) {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'imageFolder');
    return tx.complete;
  }

  async function getDirHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('imageFolder');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getOrPickFolderInTab(tabId) {
  // First try existing
  let handle = await getDirHandle();
  if (handle) return handle;

  // If none, ask the tab to pick
  const result = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "pickFolderInTab" }, resolve);
  });

  if (result?.success && result.handle) {
    await saveDirHandle(result.handle);
    return result.handle;
  } else {
    throw new Error(result?.error || "Folder selection cancelled");
  }
}


  // ===== Existing UI elements =====
  const toggle = document.getElementById("extension-enabled");
  const removerOptions = document.getElementById("remover-options");
  const ulOption = document.getElementById("fixer-options");
  const headingOption = document.getElementById("heading-assigner-option");
  const contentEditorOption = document.getElementById("content-editor-option");
  const inlineEditorOption = document.getElementById("inline-editor-option");
  const tableToolsOption = document.getElementById("table-tools-option");
  const removeStyleBtn = document.getElementById("remove-style-btn");
  const removeAttrBtn = document.getElementById("remove-attributes");
  const removeSpanBtn = document.getElementById("remove-span-btn");
  const organizeHtmlBtn = document.getElementById("organize");
  const removeUlLiBtn = document.getElementById("remove-ul-li");
  const fixEntitiesBtn = document.getElementById("remove-unicode");
  const assignHeadingBtn = document.getElementById("assign-heading");
  const contentEditorBtn = document.getElementById("activate-content-editor");
  const saveContentEditorBtn = document.getElementById("save-content-editor");
  const inlineEditBtn = document.getElementById("enable-inline-editing");
  const xmtConversionOption = document.getElementById("xmt-conversion-option");
  const readmeBtn = document.getElementById("readme-btn");
  const readmeManual = document.getElementById("readme-manual");
  const bulkDownloaderOption = document.getElementById("bulk-downloader-option");
  const htmlValidatorOption = document.getElementById("html-validator-option");
  const advancedToolsOption = document.getElementById("advanced-tools-option");
  const tocOption = document.getElementById("toc-option");
  const footnoteOption = document.getElementById("footnote-option");
  const footnoteToggleBtn = document.getElementById("footnoteToggleBtn");
  // some pages may not have the toggle etc. - guard
  if (!contentEditorOption) {
    console.warn("contentEditorOption not found in popup DOM");
  }

  readmeBtn?.addEventListener("click", () => {
    if (readmeManual.classList.contains("visible")) {
      readmeManual.classList.add("hiding");
      setTimeout(() => {
        readmeManual.classList.remove("visible", "hiding");
        readmeManual.style.display = "none";
      }, 350);
    } else {
      readmeManual.style.display = "block";
      readmeManual.classList.add("visible");
    }
  });
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "refreshActivePanel") {
    //updateActivePanel();
  }
});

document.getElementById('openEditorBtn').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('editor.html'),
    type: 'popup',
    width: 900,
    height: 700
  });
});
  // Restore toggle state from localStorage
  const savedToggle = localStorage.getItem("extensionEnabled");
  if (savedToggle === "true") {
    if (toggle) toggle.checked = true;
    [removerOptions, ulOption, headingOption, contentEditorOption, inlineEditorOption, tableToolsOption, xmtConversionOption, bulkDownloaderOption, htmlValidatorOption, advancedToolsOption, tocOption, footnoteOption].forEach(el => el && (el.style.display = "block"));
  } else {
    [removerOptions, ulOption, headingOption, contentEditorOption, inlineEditorOption, tableToolsOption, xmtConversionOption, bulkDownloaderOption, htmlValidatorOption, advancedToolsOption, tocOption, footnoteOption].forEach(el => el && (el.style.display = "none"));
  }

toggle?.addEventListener("change", async () => {
  const visible = toggle.checked;
  localStorage.setItem("extensionEnabled", visible);
  [removerOptions, ulOption, headingOption, contentEditorOption, inlineEditorOption, tableToolsOption, xmtConversionOption, bulkDownloaderOption, htmlValidatorOption, advancedToolsOption, tocOption, footnoteOption].forEach(el => {
    if (el) el.style.display = visible ? "block" : "none";
  });

  if (visible) {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      initVersionHistory(tab.id);  // 🔹 start version history
    }
  }
});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const exec = (func) => {
  // First save a snapshot of current page before applying changes
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.__versionHistory) {
        const html = document.body.innerHTML;
        if (window.__versionHistory.index < window.__versionHistory.stack.length - 1) {
          window.__versionHistory.stack = window.__versionHistory.stack.slice(0, window.__versionHistory.index + 1);
        }
        window.__versionHistory.stack.push(html);
        window.__versionHistory.index++;
        console.log("💾 Snapshot saved before feature execution");
      }
    }
  }, () => {
    // Then run the feature function
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func });
  });

  showSaveBtn();
};
if (footnoteToggleBtn) {
  // Restore saved state
  chrome.storage.local.get("footnoteExtensionEnabled", (data) => {
    if (data.footnoteExtensionEnabled) {
      footnoteToggleBtn.classList.add("active");
      footnoteToggleBtn.textContent = "Disable Footnote Editor";
    }
  });

  // Button click handler
  footnoteToggleBtn.addEventListener("click", async () => {
    const isActive = footnoteToggleBtn.classList.toggle("active");

    if (isActive) {
      footnoteToggleBtn.textContent = "Disable Footnote Editor";
      await chrome.storage.local.set({ footnoteExtensionEnabled: true });
      // inject your footnote content script
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["Footnote.js"] // or footnote.js if that’s your editor script
        });
      }
    } else {
      footnoteToggleBtn.textContent = "Enable Footnote Editor";
      await chrome.storage.local.set({ footnoteExtensionEnabled: false });
      // optionally notify content script to clean up
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "disableFootnote" });
        }
      });
    }
  });
}
// === Active Panel Toggle Icon ===
const activePanelToggle = document.getElementById("activePanelToggle");
if (activePanelToggle) {
  // Restore last saved state
  chrome.storage.local.get("activePanelVisible", (data) => {
    const isVisible = data.activePanelVisible ?? false;
    activePanelToggle.style.color = isVisible ? "#007acc" : "#999";
    if (isVisible) updateActivePanel();
  });

  // Toggle click
  activePanelToggle.addEventListener("click", () => {
    chrome.storage.local.get("activePanelVisible", (data) => {
      const current = data.activePanelVisible ?? false;
      const newState = !current;
      chrome.storage.local.set({ activePanelVisible: newState }, () => {
        activePanelToggle.style.color = newState ? "#007acc" : "#999";
        if (newState) updateActivePanel();
        else {
          // Remove panel if disabling
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                const panel = document.getElementById("__active_panel__");
                if (panel) panel.remove();
              }
            });
          });
        }
      });
    });
  });
}

// === Feature Toggles should respect Active Panel state ===
function safeUpdatePanel() {
  chrome.storage.local.get("activePanelVisible", (data) => {
    if (data.activePanelVisible) updateActivePanel();
  });
}

  // === Existing feature event listeners (removeAttrBtn, removeSpanBtn, etc.) ===
  if (removeStyleBtn) {
    removeStyleBtn.addEventListener("click", () => {
      exec(() => {
        // This runs inside the page context:
        document.querySelectorAll("[style]").forEach(el => {
          el.removeAttribute("style");
        });
        alert(" All inline styles removed.");
      });
    });
  }

if (removeAttrBtn) {
  removeAttrBtn.addEventListener("click", () => {
    exec(() => {
      document.querySelectorAll("*").forEach(el => {
        const cls = el.getAttribute("class");
        const id  = el.getAttribute("id");

        // Remove all class attributes except footnote-related
        if (cls && !cls.toLowerCase().includes("footnote")) {
          el.removeAttribute("class");
        }

        // Remove ID only if it matches ^h.* (starts with "h")
        if (id && /^h.*/i.test(id)) {
          el.removeAttribute("id");
        }
      });

      alert('Removed all "class" attributes (except footnotes) and IDs starting with "h".');
    });
  });
}

  if (removeSpanBtn) {
    removeSpanBtn.addEventListener("click", () => {
      exec(() => {
        document.querySelectorAll("span").forEach(span => {
          const parent = span.parentNode;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        });
        alert(" All <span> tags removed.");
      });
    });
  }
// Search Bar
const searchInput = document.getElementById("feature-search");

searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase();

  // Get all buttons in the popup
  const buttons = document.querySelectorAll(".option-group button, .button-grid button");

  buttons.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    btn.style.display = text.includes(query) ? "inline-block" : "none";
  });

  // Optionally hide empty groups
  const groups = document.querySelectorAll(".option-group");
  groups.forEach(group => {
    const visibleButtons = group.querySelectorAll("button:not([style*='display: none'])");
    group.style.display = visibleButtons.length ? "block" : "none";
  });
});


//  NEW FEATURE: Organize all tags (skip tables & formatting tags)
  if (organizeHtmlBtn) {
  organizeHtmlBtn.addEventListener("click", () => {
    exec(() => {
      // Equivalent of flatten_html_except_tables
      const tableTags = new Set(["TABLE","THEAD","TBODY","TFOOT","TR","TD","TH"]);

      document.querySelectorAll("body *").forEach(el => {
        if (tableTags.has(el.tagName)) return; // skip table-related tags

        // Flatten text nodes inside non-table tags
        el.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const flattened = node.textContent.split(/\s+/).join(" ").trim();
            node.textContent = flattened;
          }
        });

        // Clean innerHTML for non-table elements (remove line breaks)
        if (![...el.querySelectorAll("*")].some(c => tableTags.has(c.tagName))) {
          el.innerHTML = el.innerHTML.replace(/\n+/g, "").trim();
        }
      });

      alert("✅ HTML flattened (tables preserved).");
    });
  });
}
//&nbsp;
const removeNbspBtn = document.getElementById("remove-nbsp-btn");

if (removeNbspBtn) {
  removeNbspBtn.addEventListener("click", () => {
    exec(() => {
      // Replace all non-breaking spaces (&nbsp; = \u00A0) with normal spaces
      document.querySelectorAll("body *").forEach(el => {
        if (el.childNodes.length) {
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              node.textContent = node.textContent.replace(/\u00A0/g, "");
            }
          });
        }
      });

      alert("✅ All non-breaking spaces (&nbsp;) removed.");
    });
  });
}

if (removeUlLiBtn) {
  removeUlLiBtn.addEventListener("click", () => {
    exec(() => {
      document.querySelectorAll("ul, ol").forEach(list => {
        const parent = list.parentNode;
        const isOrdered = list.tagName === "OL";
        const type = (list.getAttribute("type") || "1").toLowerCase();
        const start = parseInt(list.getAttribute("start") || "1", 10);

        list.querySelectorAll("li").forEach((li, idx) => {
          const p = document.createElement("p");
          let prefix = "";

          if (isOrdered) {
            // Ordered list numbering
            const num = start + idx;
            switch (type) {
              case "1": prefix = num + ". "; break;
              case "a": prefix = String.fromCharCode(97 + (num - 1)) + ". "; break; // a, b, c
              case "A": prefix = String.fromCharCode(65 + (num - 1)) + ". "; break; // A, B, C
              case "i": prefix = toRoman(num).toLowerCase() + ". "; break; // i, ii, iii
              case "I": prefix = toRoman(num).toUpperCase() + ". "; break; // I, II, III
              default:  prefix = num + ". ";
            }
          } else {
            // Unordered list → preserve bullet type
const style = getComputedStyle(list).listStyleType;
switch (style) {
  case "disc":   prefix = "\u2022 "; break; // •
  case "circle": prefix = "\u25CB "; break; // ○
  case "square": prefix = "\u25AA "; break; // ▪
  default:       prefix = "\u2022 "; // fallback
}
          }

          p.textContent = prefix + li.textContent.trim();
          parent.insertBefore(p, list);
        });

        list.remove();
      });

      alert("✅ All lists converted to <p> with bullets/numbers preserved.");

      // Helper to convert numbers → Roman numerals
      function toRoman(num) {
        const map = [
          [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
          [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
          [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
        ];
        let result = "";
        for (let [val, sym] of map) {
          while (num >= val) {
            result += sym;
            num -= val;
          }
        }
        return result;
      }
    });
  });
}

  // ==== Complete Fix Unicode Entities Handler ====
if (fixEntitiesBtn) {
  fixEntitiesBtn.addEventListener("click", () => {
    exec(() => {
      function decodeEntities(str) {
        const txt = document.createElement("textarea");
        txt.innerHTML = str;
        return txt.value;
      }

      function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = decodeEntities(node.nodeValue);
        } else {
          let child = node.firstChild;
          while (child) {
            walk(child);
            child = child.nextSibling;
          }
        }
      }

      walk(document.body);

      alert("✅ All HTML entities and broken Unicode fixed.");
    });
  });
}
// Heading Mode
if (assignHeadingBtn) {
  assignHeadingBtn.addEventListener("click", () => {
    exec(() => {
      const isActive = document.body.getAttribute("data-heading-mode") === "true";

      if (isActive) {
        // Disable Heading Mode
        document.body.removeAttribute("data-heading-mode");
        document.querySelectorAll("p,h1,h2,h3,h4,h5,h6,h7,h8,h9").forEach(el => {
          el.removeAttribute("contenteditable");
          el.style.cursor = "";
          el.style.outline = "";
        });
        localStorage.setItem("headingMode", "false");
      } else {
        // Enable Heading Mode
        document.body.setAttribute("data-heading-mode", "true");
        document.querySelectorAll("p,h1,h2,h3,h4,h5,h6,h7,h8,h9").forEach(el => {
          el.setAttribute("contenteditable", "true");
          el.style.cursor = "text";
          el.style.outline = "none";
          el.style.caretColor = "auto";
        });
        localStorage.setItem("headingMode", "true");
        alert("📑 Heading Mode enabled (Ctrl+Alt+1–9 = H1–H9, Ctrl+Alt+0 = P)");

        // Inject key handler once
        if (!window.__headingModeInjected) {
          document.addEventListener("keydown", (e) => {
            if (localStorage.getItem("headingMode") !== "true") return;
            if (!(e.ctrlKey && e.altKey)) return;

            let targetTag = null;
            if (e.key === "0") {
              targetTag = "p"; // Ctrl+Alt+0 → convert to paragraph
            } else {
              const num = parseInt(e.key, 10);
              if (!isNaN(num) && num >= 1 && num <= 9) {
                targetTag = `h${num}`;
              }
            }

            if (targetTag) {
              e.preventDefault();
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                let el = sel.anchorNode;
                while (el && !(el.tagName && /^P|H[1-9]$/i.test(el.tagName))) {
                  el = el.parentNode;
                }
                if (el) {
                  const newEl = document.createElement(targetTag);
                  newEl.innerHTML = el.innerHTML;
                  newEl.setAttribute("contenteditable", "true");
                  newEl.style.cursor = "text";
                  newEl.style.outline = "none";
                  newEl.style.caretColor = "auto";
                  el.replaceWith(newEl);

                  // ✅ Restore caret inside new element
                  const range = document.createRange();
                  range.selectNodeContents(newEl);
                  range.collapse(true); // caret at start
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            }
          });
          window.__headingModeInjected = true;
        }
      }
    });
  });
}

//Line break fixer
if (contentEditorBtn) {
  contentEditorBtn.addEventListener("click", () => {
    exec(() => {
      localStorage.setItem("contentEditorMode", "true");

      // Enable editing for <p> and all headings
      document.querySelectorAll("p,h1,h2,h3,h4,h5,h6,h7,h8,h9").forEach(block => {
        block.setAttribute("contenteditable", "true");
        block.style.cursor = "text";
        block.style.outline = "none";
        block.style.caretColor = "auto";
      });

      if (!window.__contentEditorEnterInjected) {
        document.addEventListener("keydown", function (e) {
          if (localStorage.getItem("contentEditorMode") !== "true") return;

          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          const range = sel.getRangeAt(0);

          // Find editable block (P or H1-H9)
          let block = range.startContainer;
          while (block && !(block.nodeName && /^(P|H[1-9])$/.test(block.nodeName))) {
            block = block.parentNode;
          }
          if (!block) return;

          // ---------- Split on Enter ----------
          if (e.key === "Enter" && sel.isCollapsed) {
            e.preventDefault();

            try {
              // Split content before/after caret
              const beforeRange = document.createRange();
              beforeRange.setStart(block, 0);
              beforeRange.setEnd(range.startContainer, range.startOffset);
              const beforeFrag = beforeRange.cloneContents();

              const afterRange = document.createRange();
              afterRange.setStart(range.startContainer, range.startOffset);
              afterRange.setEnd(block, block.childNodes.length);
              const afterFrag = afterRange.cloneContents();

              // Build two blocks of the same tag
              const tagName = block.tagName.toLowerCase();
              const b1 = document.createElement(tagName);
              const b2 = document.createElement(tagName);

              b1.appendChild(beforeFrag);
              if (afterFrag.childNodes.length === 0) {
                b2.appendChild(document.createTextNode("\u00A0"));
              } else {
                b2.appendChild(afterFrag);
              }

              [b1, b2].forEach(b => {
                b.setAttribute("contenteditable", "true");
                b.style.cursor = "text";
                b.style.outline = "none";
                b.style.caretColor = "auto";
              });

              const parent = block.parentNode;
              parent.insertBefore(b1, block);
              parent.insertBefore(b2, block);
              parent.removeChild(block);

              // Place caret inside new block (start of b2)
              const walker = document.createTreeWalker(b2, NodeFilter.SHOW_TEXT, null, false);
              let firstText = walker.nextNode();
              const newRange = document.createRange();
              if (firstText) {
                newRange.setStart(firstText, 0);
              } else {
                const tn = document.createTextNode("");
                b2.appendChild(tn);
                newRange.setStart(tn, 0);
              }
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);

            } catch (err) {
              console.error("Error splitting block:", err);
            }
          }

          // ---------- Merge on Backspace ----------
          if (e.key === "Backspace" && sel.isCollapsed) {
            const caretTest = document.createRange();
            try {
              caretTest.setStart(block, 0);
              caretTest.setEnd(range.startContainer, range.startOffset);
            } catch (err) {
              return;
            }
            if (caretTest.toString().trim().length !== 0) return;

            const prev = block.previousElementSibling;
            if (!prev || !/^(P|H[1-9])$/.test(prev.tagName)) return;

            e.preventDefault();

            // Merge contents
            while (block.firstChild) {
              const node = block.firstChild;
              if (node.nodeType === Node.TEXT_NODE &&
                 (node.textContent.trim() === "" || node.textContent === "\u00A0")) {
                block.removeChild(node);
                continue;
              }
              prev.appendChild(node);
            }

            // Caret goes to end of prev
            function getLastTextNode(node) {
              if (!node) return null;
              if (node.nodeType === Node.TEXT_NODE) return node;
              for (let i = node.childNodes.length - 1; i >= 0; i--) {
                const t = getLastTextNode(node.childNodes[i]);
                if (t) return t;
              }
              return null;
            }
            const lastText = getLastTextNode(prev);
            const newRange = document.createRange();
            if (lastText) {
              newRange.setStart(lastText, lastText.length);
            } else {
              const tn = document.createTextNode("");
              prev.appendChild(tn);
              newRange.setStart(tn, 0);
            }
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            block.remove();
          }

        }, false);

        window.__contentEditorEnterInjected = true;
      }

      alert("✏️ Content Editor Mode ON\nEnter = split block\nBackspace at start = merge with previous.");
    });

    saveContentEditorBtn.style.display = "inline-block";
  });
}

// =======================
// Inline Editing Feature
// =======================
  if (inlineEditBtn) {
    inlineEditBtn.addEventListener("click", () => {
      exec(() => {
        window.__inlineEditing = true;
        document.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, span").forEach(el => {
          el.setAttribute("contenteditable", "true");
          el.style.outline = "1px dashed #00acc1";
          el.style.cursor = "text";
        });
      });
      alert(" Click on any text to edit it.");
      saveInlineEditBtn.style.display = "inline-block";
      showSaveBtn();
      toggleButtonActive(inlineEditBtn, true);
  setFeatureState("inlineEdit", true);   // ✅ save active
    });
  }
// ==================================
// Auto-clean on Copy (Clipboard Fix)
// ==================================
document.addEventListener("copy", (e) => {
  const activePanel = document.getElementById("active-tools-panel");
  let wasDetached = false;

  // 🔹 Temporarily detach the panel from DOM
  if (activePanel && activePanel.parentNode) {
    activePanel.parentNode.removeChild(activePanel);
    wasDetached = true;
  }

  // 🔹 Clone selection (or body if nothing selected)
  const selection = document.getSelection();
  const container = document.createElement("div");

  if (selection && !selection.isCollapsed) {
    container.appendChild(selection.getRangeAt(0).cloneContents());
  } else {
    container.innerHTML = document.body.innerHTML;
  }

  // 🔹 Restore the panel back into DOM
  if (wasDetached) {
    document.body.appendChild(activePanel);
  }

  // 🔹 Clean unwanted inline styles
  container.querySelectorAll("[style]").forEach(el => {
    const style = el.getAttribute("style") || "";
    if (
      style.includes("user-select") ||
      style.includes("outline") ||
      style.includes("-webkit-user-modify")
    ) {
      el.removeAttribute("style");
    }
  });

  // 🔹 Write clean HTML & text into clipboard
  e.clipboardData.setData("text/html", container.innerHTML.trim());
  e.clipboardData.setData("text/plain", container.innerText.trim());
  e.preventDefault();
});
// Toggle Stylings Toolbar
document.getElementById('stylings-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const existing = document.getElementById('floating-stylings-toolbar');
        if (existing) {
          existing.remove(); // Remove toolbar if it exists
        } else {
          // Inject toolbar
          (function injectFloatingToolbar() {
            if (document.getElementById('floating-stylings-toolbar')) return;

            const undoStack = [];
            const redoStack = [];
            const maxStackSize = 50;

            const toolbar = document.createElement('div');
            toolbar.id = 'floating-stylings-toolbar';
            toolbar.style.position = 'absolute';
            toolbar.style.zIndex = 100000;
            toolbar.style.background = '#fff';
            toolbar.style.border = '1px solid #007acc';
            toolbar.style.borderRadius = '8px';
            toolbar.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            toolbar.style.padding = '6px 10px';
            toolbar.style.display = 'flex';
            toolbar.style.flexWrap = 'wrap';
            toolbar.style.gap = '4px';
            toolbar.style.fontSize = '13px';
            toolbar.style.userSelect = 'none';
            toolbar.style.minWidth = '180px';
            toolbar.style.opacity = '0';
            toolbar.style.transition = 'opacity 0.15s, top 0.1s, left 0.1s';

            toolbar.innerHTML = `
              <button data-style="bold" title="Bold (Ctrl+B)"><b>B</b></button>
              <button data-style="italic" title="Italic (Ctrl+I)"><i>I</i></button>
              <button data-style="underline" title="Underline (Ctrl+U)"><u>U</u></button>
              <button data-style="strike" title="Strikethrough (Alt+Shift+5)"><s>S</s></button>
              <button data-style="sub" title="Subscript (Ctrl+,)">Sub</button>
              <button data-style="sup" title="Superscript (Ctrl+.)">Sup</button>
            `;

            document.body.appendChild(toolbar);

            // Undo/Redo snapshot
            function saveSnapshot() {
              const bodyClone = document.body.cloneNode(true);
              const toolbarEl = bodyClone.querySelector('#floating-stylings-toolbar');
              if (toolbarEl) toolbarEl.remove();
              undoStack.push(bodyClone.innerHTML);
              if (undoStack.length > maxStackSize) undoStack.shift();
              redoStack.length = 0;
            }

            function undo() {
              if (!undoStack.length) return;
              redoStack.push(getBodyContentWithoutToolbar());
              const html = undoStack.pop();
              setBodyContentWithoutToolbar(html);
            }

            function redo() {
              if (!redoStack.length) return;
              undoStack.push(getBodyContentWithoutToolbar());
              const html = redoStack.pop();
              setBodyContentWithoutToolbar(html);
            }

            function getBodyContentWithoutToolbar() {
              const clone = document.body.cloneNode(true);
              const toolbarEl = clone.querySelector('#floating-stylings-toolbar');
              if (toolbarEl) toolbarEl.remove();
              return clone.innerHTML;
            }

            function setBodyContentWithoutToolbar(html) {
              const toolbarEl = document.getElementById('floating-stylings-toolbar');
              document.body.innerHTML = html;
              if (toolbarEl) document.body.appendChild(toolbarEl);
            }

            // Apply styling to selected text
            function applyStyle(style) {
              const sel = window.getSelection();
              if (!sel.rangeCount) return;
              const range = sel.getRangeAt(0);
              if (range.collapsed) return;

              saveSnapshot();

              let node;
              switch (style) {
                case 'bold': node = document.createElement('b'); break;
                case 'italic': node = document.createElement('i'); break;
                case 'underline': node = document.createElement('u'); break;
                case 'strike': node = document.createElement('s'); break;
                case 'sub': node = document.createElement('sub'); break;
                case 'sup': node = document.createElement('sup'); break;
                default: node = document.createElement('span'); break;
              }

              node.appendChild(range.extractContents());
              range.insertNode(node);
              sel.removeAllRanges();
              updateActiveButtons();
            }

            // Update active button highlights
            function updateActiveButtons() {
              const sel = window.getSelection();
              if (!sel.rangeCount) return;
              const parent = sel.anchorNode && sel.anchorNode.parentElement;
              if (!parent) return;

              toolbar.querySelectorAll('button[data-style]').forEach(btn => {
                const style = btn.getAttribute('data-style');
                btn.classList.remove('active');
                switch (style) {
                  case 'bold': if (document.queryCommandState('bold') || parent.closest('b')) btn.classList.add('active'); break;
                  case 'italic': if (document.queryCommandState('italic') || parent.closest('i')) btn.classList.add('active'); break;
                  case 'underline': if (document.queryCommandState('underline') || parent.closest('u')) btn.classList.add('active'); break;
                  case 'strike': if (parent.closest('s')) btn.classList.add('active'); break;
                  case 'sub': if (parent.closest('sub')) btn.classList.add('active'); break;
                  case 'sup': if (parent.closest('sup')) btn.classList.add('active'); break;
                }
              });
            }

            // Button events
            toolbar.querySelectorAll('button[data-style]').forEach(btn => {
              const style = btn.getAttribute('data-style');
              if (!style) return;
              btn.addEventListener('click', () => applyStyle(style));
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', e => {
              if (e.ctrlKey && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                  case 'b': e.preventDefault(); applyStyle('bold'); break;
                  case 'i': e.preventDefault(); applyStyle('italic'); break;
                  case 'u': e.preventDefault(); applyStyle('underline'); break;
                  case 'z': e.preventDefault(); undo(); break;
                  case 'y': e.preventDefault(); redo(); break;
                  case '.': e.preventDefault(); applyStyle('sup'); break;
                  case ',': e.preventDefault(); applyStyle('sub'); break;
                }
              }
              if (e.altKey && e.shiftKey && e.key === '5') e.preventDefault(), applyStyle('strike');
              setTimeout(updateActiveButtons, 10);
            });

            // Show toolbar near selection
            document.addEventListener('mouseup', updateToolbarPosition);
            document.addEventListener('keyup', updateToolbarPosition);

            function updateToolbarPosition() {
              const sel = window.getSelection();
              if (!sel.rangeCount || sel.isCollapsed) {
                toolbar.style.opacity = '0';
                return;
              }
              const range = sel.getRangeAt(0).getBoundingClientRect();
              toolbar.style.top = `${window.scrollY + range.top - toolbar.offsetHeight - 5}px`;
              toolbar.style.left = `${window.scrollX + range.left}px`;
              toolbar.style.opacity = '1';
              updateActiveButtons();
            }

            // Toolbar CSS
            const styleEl = document.createElement('style');
            styleEl.textContent = `
              #floating-stylings-toolbar button.active { background:#007acc; color:#fff; }
              #floating-stylings-toolbar button { cursor:pointer; }
            `;
            document.head.appendChild(styleEl);

          })();
        }
      }
    });
  });
});
// --- Google Link Cleaner ---
document.getElementById("clean-google-links").addEventListener("click", () => {
  exec(() => {
    const anchors = document.querySelectorAll("a[href*='google.com/url?']");
    let cleanedCount = 0;

    anchors.forEach(a => {
      // Match actual link inside q= parameter
      const match = a.href.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/);
      if (match && match[1]) {
        const realLink = decodeURIComponent(match[1]);
        a.href = realLink;
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      alert(`✅ Cleaned ${cleanedCount} Google redirect links.`);
    } else {
      alert("ℹ️ No Google redirect links found.");
    }
  });
});
//OCR
document.getElementById("openOcrTool").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("ocr_tool.html"),
    type: "popup",
    width: 500,
    height: 500
  });
});
//Table Extracter
document.getElementById("open-gemini")?.addEventListener("click", () => {
  chrome.windows.create({
    url: "gemini.html",
    type: "popup",
    width: 820,
    height: 650
  });
});
document.getElementById('openEditorBtn').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('editor.html'),
    type: 'popup',
    width: 900,
    height: 700
  });
});

// =============== Hyperlink Injector Toggle ===============
(function () {
  const btn = document.getElementById("hyperlink-injector");
  if (!btn) return;

  // Restore state on popup load
  chrome.storage.local.get("hyperlinkInjectorEnabled", ({ hyperlinkInjectorEnabled }) => {
    if (hyperlinkInjectorEnabled) {
      btn.classList.add("active");
      btn.textContent = "Disable Hyperlink Injector";
    }
  });

  btn.addEventListener("click", () => {
    chrome.storage.local.get("hyperlinkInjectorEnabled", ({ hyperlinkInjectorEnabled }) => {
      const newState = !hyperlinkInjectorEnabled;
      chrome.storage.local.set({ hyperlinkInjectorEnabled: newState });

      if (newState) {
        btn.classList.add("active");
        btn.textContent = "Disable Hyperlink Injector";

        // Inject feature into page
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: enableHyperlinkInjector
          });
        });

        alert(
          "🔗 Hyperlink Injector Enabled!\n\n" +
          "1. Select text → you'll be prompted to paste a link.\n" +
          "2. Click a hyperlink → you can edit or remove it.\n" +
          "3. Ctrl + Click a hyperlink → opens it in a new tab."
        );

      } else {
        btn.classList.remove("active");
        btn.textContent = "Enable Hyperlink Injector";

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: disableHyperlinkInjector
          });
        });
      }
    });
  });

  // ===== Functions injected into the page =====
  function enableHyperlinkInjector() {
    if (window.__hyperlinkInjectorActive) return;
    window.__hyperlinkInjectorActive = true;

    // Handle text selection → add link
    window.__injectLinkHandler = (e) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const sel = window.getSelection().toString().trim();
      const url = prompt(`Enter URL to link "${sel}":`);
      if (url) {
        const range = selection.getRangeAt(0);
        const a = document.createElement("a");
        a.href = url; // ✅ only href, no target attribute
        a.textContent = range.toString();
        range.deleteContents();
        range.insertNode(a);
        selection.removeAllRanges();
      }
    };

    // Handle hyperlink click → edit/remove
    window.__editLinkHandler = (e) => {
      const target = e.target.closest("a");
      if (!target) return;

      if (e.ctrlKey) {
        // Ctrl+Click → open in new tab (default)
        window.open(target.href, "_blank");
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const action = prompt(
        `Current link: ${target.href}\n\nChoose an action:\n1. Paste new URL to update\n2. Leave blank to remove link\n3. Cancel to do nothing`
      );

      if (action === null) return; // cancel
      if (action === "") {
        const textNode = document.createTextNode(target.textContent);
        target.replaceWith(textNode);
      } else {
        target.href = action;
      }
    };

    document.addEventListener("mouseup", window.__injectLinkHandler);
    document.addEventListener("click", window.__editLinkHandler);
  }

  function disableHyperlinkInjector() {
    if (!window.__hyperlinkInjectorActive) return;
    window.__hyperlinkInjectorActive = false;

    document.removeEventListener("mouseup", window.__injectLinkHandler);
    document.removeEventListener("click", window.__editLinkHandler);

    delete window.__injectLinkHandler;
    delete window.__editLinkHandler;
  }
})();

// Image Inserter
const imageInserterBtn = document.getElementById("activate-image-inserter");

imageInserterBtn.addEventListener("click", async () => {
  const { imageInserter } = await chrome.storage.local.get("imageInserter");
  const newState = !imageInserter; // toggle on/off

  await chrome.storage.local.set({ imageInserter: newState });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (enabled) => {
      if (enabled) {
        if (window.__imageInserterListenerInjected) return;
        window.__imageInserterListenerInjected = true;

        document.addEventListener("click", (e) => {
          chrome.storage.local.get("imageInserter", (res) => {
            if (!res.imageInserter) return;

            const target = e.target;
            if (
              target.tagName === "P" &&
              target.textContent.replace(/\u00A0/g, "").trim() === ""
            ) {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = "image/*";

              fileInput.addEventListener("change", () => {
                const file = fileInput.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (evt) => {
                  const img = document.createElement("img");
                  img.src = evt.target.result;
                  img.style.maxWidth = "100%";

                  target.innerHTML = "";
                  target.appendChild(img);
                };
                reader.readAsDataURL(file);
              });

              fileInput.click();
            }
          });
        });

        alert("✅ Image Inserter enabled.\nClick on an empty <p> to insert an image.");
      } else {
        alert("❌ Image Inserter disabled.");
      }
    },
    args: [newState]
  });
});

  // NOTE: Old convert-to-base64 code removed here and replaced with a proper popup -> background -> page flow.
// ---- Convert All Images to Base64 (Folder + Fetch + Canvas fallbacks) ----
(function setupConvertAllImagesButton() {
  const contentEditorOption = document.getElementById("content-editor-option");
  if (!contentEditorOption) return;

  // Create button once
  const BTN_ID = "convert-all-images-b64-btn";
  let convertAllImagesBtn = document.getElementById(BTN_ID);
  if (!convertAllImagesBtn) {
    convertAllImagesBtn = document.createElement("button");
    convertAllImagesBtn.id = BTN_ID;
    convertAllImagesBtn.textContent = "Convert All Images to Base64";
    convertAllImagesBtn.style.marginTop = "8px";
    contentEditorOption.appendChild(convertAllImagesBtn);
  }

  // Helpers
  const fileToDataURL = (file) =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const blobToDataURL = (blob) =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });

  // Main click handler
  convertAllImagesBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab.");

      // 1) Let user pick a folder (optional; we’ll still work if they cancel)
      let dirHandle = null;
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "read" });
      } catch (e) {
        if (e.name === "AbortError") {
          console.log("Folder picker canceled. Proceeding with fetch/canvas fallback.");
        } else {
          console.warn("Folder picker error:", e);
        }
      }

      // 2) Collect all <img> srcs from the page
      const srcListRet = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => Array.from(document.images).map((img) => img.src),
      });
      const srcList = srcListRet?.[0]?.result || [];
      if (!srcList.length) {
        alert("No <img> elements found on this page.");
        return;
      }

      // 3) Build updates with robust fallbacks
      const updates = [];

      for (const src of srcList) {
        if (!src || src.startsWith("data:")) continue; // skip already-base64

        const filename = src.split("/").pop().split("?")[0];
        let dataURL = null;

        // 3a) Try local file match (if a folder was chosen)
        if (dirHandle) {
          try {
            let fh = null;
            // Exact match first
            try {
              fh = await dirHandle.getFileHandle(filename);
            } catch {
              // Case-insensitive scan
              for await (const [name, handle] of dirHandle.entries()) {
                if (name.toLowerCase() === filename.toLowerCase()) {
                  fh = handle;
                  break;
                }
              }
            }
            if (fh) {
              const file = await fh.getFile();
              dataURL = await fileToDataURL(file);
              console.log("Matched local file:", filename);
            }
          } catch (e) {
            console.debug("Local lookup failed for", filename, e);
          }
        }

        // 3b) Fallback: fetch from extension context (needs host_permissions)
        if (!dataURL) {
          try {
            const resp = await fetch(src, { credentials: "omit" });
            if (resp.ok) {
              const blob = await resp.blob();
              dataURL = await blobToDataURL(blob);
              console.log("Fetched & converted:", src);
            } else {
              console.warn("Fetch not OK", resp.status, src);
            }
          } catch (e) {
            console.warn("Fetch failed for", src, e);
          }
        }

        // 3c) Final fallback: do it in-page via canvas (works when same-origin/CORS allows)
        if (!dataURL) {
          try {
            const ret = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (imageSrc) =>
                new Promise((resolve) => {
                  const im = new Image();
                  im.crossOrigin = "anonymous";
                  im.onload = () => {
                    try {
                      const c = document.createElement("canvas");
                      c.width = im.naturalWidth || im.width;
                      c.height = im.naturalHeight || im.height;
                      const ctx = c.getContext("2d");
                      ctx.drawImage(im, 0, 0);
                      resolve(c.toDataURL("image/png"));
                    } catch (err) {
                      console.error("Canvas toDataURL failed", err);
                      resolve(null);
                    }
                  };
                  im.onerror = () => resolve(null);
                  im.src = imageSrc;
                }),
              args: [src],
            });
            dataURL = ret?.[0]?.result || null;
          } catch (e) {
            console.warn("Canvas fallback failed:", e);
          }
        }

        if (dataURL) {
          updates.push({ oldSrc: src, newSrc: dataURL });
        }
      }

      // 4) Replace in the page
      if (updates.length) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (updates) => {
            const map = new Map(updates.map((u) => [u.oldSrc, u.newSrc]));
            document.querySelectorAll("img").forEach((img) => {
              const nu = map.get(img.src);
              if (nu) img.src = nu;
            });
          },
          args: [updates],
        });
        alert(`✅ Converted ${updates.length} images to Base64.`);
      } else {
        alert("⚠️ Couldn't convert any images. Check the console for details (CORS/local match).");
      }
    } catch (err) {
      console.error("Convert All Images error:", err);
      alert("⚠️ Error: " + (err && err.message ? err.message : String(err)));
    }
  });
})();


  // Utility to inject content script (footnote or combined)
  function injectContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["Footnote.js"]
        });
      }
    });
  }

  // Utility to send messages to active tab
  function sendMessageToTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {
  const selectorInput = document.getElementById("selector-input");
  const highlightBtn = document.getElementById("highlight-btn");
  const clearBtn = document.getElementById("clear-btn");
  const resultsDiv = document.getElementById("results");

  function showResult(message, type) {
    resultsDiv.textContent = message;
    resultsDiv.className = type;
  }

  highlightBtn.addEventListener("click", () => {
    let selector = selectorInput.value.trim().toLowerCase();
    if (!selector) {
      showResult("Please enter a selector", "error");
      return;
    }

    // If just "h", match h1h15
    if (selector === "h") {
      selector = Array.from({ length: 15 }, (_, i) => `h${i + 1}`).join(",");
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id, allFrames: true },
          func: (selector) => {
            // Clear previous highlights
            const oldHighlights = document.querySelectorAll("[data-css-highlight]");
            oldHighlights.forEach((el) => {
              el.style.outline = "";
              el.removeAttribute("data-css-highlight");
            });

            // Apply new highlights
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach((el) => {
                el.style.outline = "2px solid red";
                el.style.outlineOffset = "2px";
                el.setAttribute("data-css-highlight", "true");
              });
              return elements.length;
            } catch (e) {
              console.error("Invalid selector:", e);
              return 0;
            }
          },
          args: [selector],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            showResult("Error: " + chrome.runtime.lastError.message, "error");
            return;
          }
          showResult(`Found ${results[0].result} elements`, "success");
        }
      );
    });
  });

  clearBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id, allFrames: true },
        func: () => {
          const highlighted = document.querySelectorAll("[data-css-highlight]");
          highlighted.forEach((el) => {
            el.style.outline = "";
            el.removeAttribute("data-css-highlight");
          });
        },
      });
      showResult("Highlights cleared", "success");
    });
  });
document.addEventListener("DOMContentLoaded", () => {
  setupFeatureToggle("highlight-btn", "highlightFeature");
  setupFeatureToggle("clear-btn", "clearFeature");
  setupFeatureToggle("remove-style-btn", "removeStyleFeature");
  setupFeatureToggle("remove-attributes", "removeAttributesFeature");
  setupFeatureToggle("remove-span-btn", "removeSpanFeature");
  setupFeatureToggle("organize", "organizeFeature");
  setupFeatureToggle("stylings-btn", "AppendStylingsFeature");
  setupFeatureToggle("remove-ul-li", "removeListFeature");
  setupFeatureToggle("remove-unicode", "fixUnicodeFeature");
  setupFeatureToggle("assign-heading", "headingAssignerFeature");
  setupFeatureToggle("enable-inline-editing", "inlineEditingFeature");
  setupFeatureToggle("activate-content-editor", "contentEditorFeature");
  setupFeatureToggle("activate-hyperlink-injector", "HyperlinkInjectorFeature");
  setupFeatureToggle("clean-google-links", "HyperlinkCleanerFeature");
  setupFeatureToggle("activate-image-inserter", "imageInserterFeature");
  setupFeatureToggle("open-gemini", "geminiTableFeature");
  setupFeatureToggle("openEditorBtn", "tableEditorFeature");
  setupFeatureToggle("btnRemoveScraps", "xmtScrapsFeature");
  setupFeatureToggle("pdfDownloaderBtn", "pdfDownloaderFeature");
});
});
const upload = document.getElementById('upload');
const resultDiv = document.getElementById('result');
function organizeAllTags() {
  const skipTags = new Set([
    "PRE","CODE","SCRIPT","STYLE","TEXTAREA",
    "TABLE","TR","TD","TH","THEAD","TBODY","TFOOT"
  ]);

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // collapse all whitespace to a single space
      node.textContent = node.textContent.replace(/\s+/g, ' ');
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    if (skipTags.has(node.tagName)) return node.outerHTML;

    let html = `<${node.tagName.toLowerCase()}`;

    // copy attributes
    Array.from(node.attributes).forEach(attr => {
      html += ` ${attr.name}="${attr.value}"`;
    });
    html += ">";

    // recursively process children
    node.childNodes.forEach(child => {
      html += processNode(child);
    });

    html += `</${node.tagName.toLowerCase()}>`;

    return html;
  }

  let bodyClone = document.body.cloneNode(true);
  let flattenedHTML = '';
  bodyClone.childNodes.forEach(node => {
    flattenedHTML += processNode(node);
  });

  // remove whitespace between tags
  flattenedHTML = flattenedHTML.replace(/>\s+</g, '><');

  navigator.clipboard.writeText(flattenedHTML).then(() => {
    alert("✅ Flattened HTML copied to clipboard (div spacing fixed).");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const copyCard = document.getElementById("copyHtmlIcon");
  if (copyCard) {
    copyCard.addEventListener("click", async () => {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Clone body to avoid touching live DOM
          const container = document.createElement("div");
          container.innerHTML = document.body.outerHTML;

          // Remove active panel if exists
          const panel = container.querySelector("#__active_panel__");
          if (panel) panel.remove();

          // Clean styles & contenteditable only
          container.querySelectorAll("*").forEach(el => {
            if (el.hasAttribute("style")) el.removeAttribute("style");
            if (el.hasAttribute("contenteditable")) el.removeAttribute("contenteditable");
          });

          return container.innerHTML.trim();
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          const cleanedHtml = results[0].result;
          navigator.clipboard.writeText(cleanedHtml).then(() => {
            alert("✅ Clean HTML copied");
          }).catch(err => {
            console.error("Copy failed: ", err);
            alert("❌ Failed to copy HTML");
          });
        }
      });
    });
  }
});


new MutationObserver(() => {
  document.querySelectorAll("[style='']").forEach(el => el.removeAttribute("style"));
}).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["style"] });
// Broken URL Checker
document.getElementById("broken-link-checker")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: "MAIN",
      func: () => {
        const PANEL_ID = "__broken_links_panel__";
        document.getElementById(PANEL_ID)?.remove();

        // collect only <a> that are NOT inside footnotes
        const links = [...document.querySelectorAll("a[href]")].filter(a => !a.closest(".footnotes"));
          if (!links.length) {
          alert("⚠️ No links found on this page (excluding footnotes).");
          return;
          }

        const panel = document.createElement("div");
        panel.id = PANEL_ID;
        Object.assign(panel.style, {
          position: "fixed",
          top: "80px",
          left: "16px",
          width: "460px",
          maxHeight: "70vh",
          overflowY: "auto",
          background: "#fff",
          color: "#111",
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: "10px",
          boxShadow: "0 10px 24px rgba(0,0,0,.18)",
          zIndex: 2147483647,
          padding: "10px",
          font: "12px/1.4 system-ui, sans-serif"
        });

        // Header with refresh + close
        panel.innerHTML = `
          <div id="blc-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:move;">
            <strong style="display:flex;align-items:center;gap:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 1 0 7.54-6.54l-1.83-1.83a5 5 0 0 0-7.54 6.54" />
                <path d="M14 11l-2-2m6 6l-2-2" />
              </svg>
              Broken Link Checker
            </strong>
            <div style="display:flex;gap:6px;">
              <button id="blc-refresh" style="background:none;border:none;cursor:pointer;padding:2px;" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <circle cx="25" cy="25" r="20" stroke="#555" stroke-width="3" fill="none" stroke-opacity="0.2"/>
              <path fill="#555" d="M45 25a20 20 0 0 1-20 20V5a20 20 0 0 1 20 20z">
                <animateTransform 
                  attributeName="transform" 
                  type="rotate" 
                  from="0 25 25" 
                  to="360 25 25" 
                  dur="1s" 
                  repeatCount="indefinite"/>
              </path>
            </svg>
              </button>
              <button id="blc-close" style="background:none;border:none;cursor:pointer;padding:2px;" title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="blc-summary" style="margin:6px 0; font-weight:600; font-size:13px;">
            Checking ${links.length} links…
          </div>
          <ul id="blc-list" style="list-style:none;padding:0;margin:0;font-size:12px"></ul>
          <hr>
          <details open>
            <summary style="cursor:pointer;font-weight:600;">✅ Working Links</summary>
            <ul id="blc-working" style="list-style:none;padding:0;margin:0;font-size:12px"></ul>
          </details>
          <details open>
            <summary style="cursor:pointer;font-weight:600;">❌ Broken Links</summary>
            <ul id="blc-broken" style="list-style:none;padding:0;margin:0;font-size:12px"></ul>
          </details>
        `;

        const list = panel.querySelector("#blc-list");
        const summary = panel.querySelector("#blc-summary");
        const workingList = panel.querySelector("#blc-working");
        const brokenList = panel.querySelector("#blc-broken");

        document.documentElement.appendChild(panel);
        document.getElementById("blc-close").onclick = () => panel.remove();

        // Draggable
        (() => {
          const header = document.getElementById("blc-header");
          let isDown = false, offsetX = 0, offsetY = 0;
          header.addEventListener("mousedown", (e) => {
            isDown = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
          });
          document.addEventListener("mouseup", () => {
            isDown = false;
            document.body.style.userSelect = "";
          });
          document.addEventListener("mousemove", (e) => {
            if (!isDown) return;
            panel.style.left = `${e.clientX - offsetX}px`;
            panel.style.top = `${e.clientY - offsetY}px`;
          });
        })();

        // Styles (spinner + refresh spin + blink)
        if (!document.getElementById("__blc_styles__")) {
          const style = document.createElement("style");
          style.id = "__blc_styles__";
          style.textContent = `
            @keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);} }
            .blc-spinner {animation:spin 1s linear infinite; transform-origin:center;}
            @keyframes blc-rotate {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);} }
            #blc-refresh.spin svg { animation: blc-rotate 1s linear infinite; }
            @keyframes blc-blink {0%,100%{background-color:transparent;}50%{background-color:yellow;} }
            .blc-blink { animation: blc-blink 0.8s ease-in-out 3; }
            .highlighted-heading { transition: background 0.5s; background: yellow; }
  .color-popup { transition: transform 0.2s ease, opacity 0.2s ease; transform-origin: top right; }
          `;
          document.head.appendChild(style);
        }

        // central runner
        async function runBrokenLinkCheck() {
          const refreshBtn = document.getElementById("blc-refresh");
          refreshBtn?.classList.add("spin");

          list.innerHTML = "";
          workingList.innerHTML = "";
          brokenList.innerHTML = "";
          summary.textContent = `Checking ${links.length} links…`;

          let working = 0, broken = 0;

          for (const a of links) {
            const li = document.createElement("li");
            li.innerHTML = `
            <svg class="blc-spinner" width="14" height="14" viewBox="0 0 24 24" stroke="#555" fill="none" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
                <path d="M22 12a10 10 0 0 1-10 10" />
              </svg> ${a.href} (checking…)`;
            li.style.cursor = "pointer";
            li.style.margin = "4px 0";
            list.appendChild(li);

            // 🚨 Local link = broken
            if (!/^https?:/i.test(a.href)) {
            const li = document.createElement("li");
              li.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" stroke="red" stroke-width="2" fill="none">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="8" y1="8" x2="16" y2="16"/>
                  <line x1="16" y1="8" x2="8" y2="16"/>
                </svg> ${a.href} (local)`;
              li.style.color = "red";
              broken++;
              brokenList.appendChild(li.cloneNode(true));
            } else {
              try {
                const res = await fetch(a.href, { method: "HEAD", mode: "no-cors" });
                if (!res.ok && res.type !== "opaque") {
                  const li = document.createElement("li");
                  li.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="red" stroke-width="2" fill="none">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="8" y1="8" x2="16" y2="16"/>
                      <line x1="16" y1="8" x2="8" y2="16"/>
                    </svg> ${a.href} (${res.status})`;
                  li.style.color = "red";
                  broken++;
                  brokenList.appendChild(li.cloneNode(true));
                } else {
                  const li = document.createElement("li");
                  li.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="green" stroke-width="2" fill="none">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg> ${a.href}`;
                  li.style.color = "green";
                  working++;
                  workingList.appendChild(li.cloneNode(true));
                }
              } catch {
                const li = document.createElement("li");
                li.innerHTML = `
                  <svg width="14" height="14" viewBox="0 0 24 24" stroke="red" stroke-width="2" fill="none">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="8" y1="8" x2="16" y2="16"/>
                    <line x1="16" y1="8" x2="8" y2="16"/>
                  </svg> ${a.href} (error)`;
                li.style.color = "red";
                broken++;
                brokenList.appendChild(li.cloneNode(true));
              }
            }

            // 🔹 click → scroll + blink
            li.addEventListener("click", (e) => {
              e.preventDefault();
              try {
                a.scrollIntoView({ behavior: "smooth", block: "center" });
                a.classList.add("blc-blink");
                setTimeout(() => a.classList.remove("blc-blink"), 2400);
              } catch {}
            });
          }

          summary.textContent = `Checked ${links.length} links → ✅ ${working} working | ❌ ${broken} broken`;
          refreshBtn?.classList.remove("spin");
        }

        // hook refresh
        document.getElementById("blc-refresh").onclick = () => runBrokenLinkCheck();

        // initial run
        runBrokenLinkCheck();
      }
    });
  });
});

// === EXPORT DROPDOWN TOGGLE ===
document.getElementById("exportMenuBtn")?.addEventListener("click", () => {
  const dropdown = document.getElementById("exportDropdown");
  dropdown.style.display = (dropdown.style.display === "block") ? "none" : "block";
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown")) {
    const dropdown = document.getElementById("exportDropdown");
    if (dropdown) dropdown.style.display = "none";
  }
});

// === EXPORT HANDLER ===
document.querySelectorAll(".export-option").forEach(option => {
  option.addEventListener("click", async (e) => {
    e.preventDefault();
    const format = option.dataset.format;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return alert("No active tab found");

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          html: document.documentElement.outerHTML,
          text: document.body.innerText,
          // send tables as array-of-arrays (safe JSON)
          tables: Array.from(document.querySelectorAll("table")).map(t => {
            return Array.from(t.rows).map(row =>
              Array.from(row.cells).map(cell => cell.innerText.trim())
            );
          })
        };
      }
    }, (results) => {
      if (!results || !results[0] || !results[0].result) {
        alert("❌ Could not extract content");
        return;
      }

      const { html, text, tables } = results[0].result;

      if (format === "html") {
        downloadFile(html, "page.html", "text/html");

      } else if (format === "txt") {
        downloadFile(text, "page.txt", "text/plain");

      } else if (format === "md") {
        // basic plain text dump as markdown
        downloadFile(text, "page.md", "text/markdown");

      } else if (format === "doc") {
        const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
                          xmlns:w='urn:schemas-microsoft-com:office:word'
                          xmlns='http://www.w3.org/TR/REC-html40'>
                        <head><meta charset='utf-8'></head><body>`;
        const footer = "</body></html>";
        downloadFile(header + html + footer, "page.doc", "application/msword");

      } else if (format === "pdf") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url);
        win.print();

      } else if (format === "xlsx") {
        if (!tables.length) {
          alert("⚠️ No tables found on this page");
          return;
        }

        const wb = XLSX.utils.book_new();

        tables.forEach((rows, idx) => {
          // rows is an array of arrays [[cell1, cell2], ...]
          const ws = XLSX.utils.aoa_to_sheet(rows);

          // === Auto column widths ===
          const colWidths = [];
          const range = XLSX.utils.decode_range(ws['!ref']);
          for (let C = range.s.c; C <= range.e.c; ++C) {
            let maxWidth = 10;
            for (let R = range.s.r; R <= range.e.r; ++R) {
              const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.v) {
                const len = String(cell.v).length;
                if (len > maxWidth) maxWidth = len;
              }
            }
            colWidths.push({ wch: maxWidth + 2 });
          }
          ws['!cols'] = colWidths;

          // === Style first row as header ===
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[addr]) {
              ws[addr].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "4F81BD" } }
              };
            }
          }

          XLSX.utils.book_append_sheet(wb, ws, "Table" + (idx + 1));
        });

        XLSX.writeFile(wb, "page.xlsx");
      }

      // hide dropdown after click
      const dropdown = document.getElementById("exportDropdown");
      if (dropdown) dropdown.style.display = "none";
    });
  });
});

// === HELPER: trigger download ===
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
// Generate TOC button -> inject TOC generator into page
document.getElementById("generateTocBtn")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { alert("No active tab found"); return; }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      (function generateAndInjectTOC() {
        try {
          const existing = document.getElementById("__ext_toc_panel__");
          if (existing) existing.remove();

          // Load stored colors
          let storedColors = JSON.parse(localStorage.getItem("tocHeadingColors") || "{}");

          // Collect headings
          const headings = [];
          for (let i = 1; i <= 15; i++) {
            const nodes = Array.from(document.getElementsByTagName("h" + i));
            nodes.forEach(n => headings.push({ node: n, level: i }));
          }
          headings.sort((a, b) => {
            const pos = a.node.compareDocumentPosition(b.node);
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
          });
          if (!headings.length) { alert("No headings (h1–h15) found."); return; }

          // Assign IDs
          headings.forEach((h, idx) => {
            const el = h.node;
            if (!el.id) {
              const txt = el.textContent.trim().slice(0, 60).replace(/\s+/g, "-").replace(/[^\w\-]/g, "").toLowerCase();
              el.id = `ext-toc-${txt || 'heading'}-${idx}`;
            }
          });

          // Add highlight CSS
          const style = document.createElement("style");
          style.textContent = `
            .highlighted-heading { transition: background 0.5s; background: yellow; }
            .color-popup { transition: transform 0.2s ease, opacity 0.2s ease; transform-origin: top right; }
          `;
          document.head.appendChild(style);

          // Build nested UL
          const rootUl = document.createElement("ul");
          rootUl.style.listStyle = "none";
          rootUl.style.margin = "0";
          rootUl.style.padding = "0 8px";
          const stack = [{ level: Math.min(...headings.map(h => h.level)), element: rootUl }];

          function createArrow() {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", "18");
            svg.setAttribute("height", "18");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.style.verticalAlign = "middle";
            svg.style.marginRight = "4px";
            svg.style.cursor = "pointer";
            svg.style.transition = "transform 0.3s ease";
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("fill", "currentColor");
            path.setAttribute("d", "M7 10l5 5 5-5z");
            svg.appendChild(path);
            return svg;
          }

          function appendItem(level, text, href, nodeRef) {
            while (stack.length && level <= stack[stack.length - 1].level && stack.length > 1) stack.pop();
            const parentUl = stack[stack.length - 1].element;
            const li = document.createElement("li");
            li.style.margin = "4px 0";
            li.style.display = "flex";
            li.style.alignItems = "center";
            li.style.gap = "4px";

            const levelSpan = document.createElement("span");
            levelSpan.textContent = `H${level}`;
            levelSpan.style.fontSize = "10px";
            levelSpan.style.fontWeight = "600";
            levelSpan.style.color = "#888";
            li.appendChild(levelSpan);

            const toggle = createArrow();
            li.appendChild(toggle);

            const a = document.createElement("a");
            a.href = "#" + href;
            a.textContent = text;
            Object.assign(a.style, { cursor: "pointer", color: storedColors[`h${level}`] || "#007acc", textDecoration: "none" });
            a.classList.add(`toc-level-${level}`);

            // Highlight on click
            a.onclick = (ev) => {
              ev.preventDefault();
              nodeRef.scrollIntoView({ behavior: "smooth", block: "center" });
              document.querySelectorAll(".highlighted-heading").forEach(el => el.classList.remove("highlighted-heading"));
              nodeRef.classList.add("highlighted-heading");
              setTimeout(() => nodeRef.classList.remove("highlighted-heading"), 2000);
            };

            li.appendChild(a);
            parentUl.appendChild(li);

            const childUl = document.createElement("ul");
            Object.assign(childUl.style, { listStyle: "none", margin: "4px 0 4px 12px", padding: "0" });
            parentUl.appendChild(childUl);

            toggle.addEventListener("click", () => {
              const isCollapsed = childUl.style.display === "none" || !childUl.style.display;
              childUl.style.display = isCollapsed ? "block" : "none";
              toggle.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(-90deg)";
            });

            stack.push({ level: level, element: childUl });
          }

          for (let h of headings) appendItem(h.level || 1, h.node.textContent.trim() || "Heading", h.node.id, h.node);

          // Cleanup empty ULs
          const cleanEmpty = (ul) => {
            Array.from(ul.children).forEach(child => {
              if (child.tagName === 'UL') {
                if (!child.querySelector('li')) child.remove();
                else cleanEmpty(child);
              }
            });
          };
          cleanEmpty(rootUl);

          // Panel container
          const panel = document.createElement("div");
          panel.id = "__ext_toc_panel__";
          Object.assign(panel.style, {
            position: "fixed", right: "16px", top: "80px",
            width: "360px", maxHeight: "75vh", overflowY: "auto",
            background: "#fefefe", border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            zIndex: 2147483647, padding: "12px", fontFamily: "system-ui, sans-serif",
            fontSize: "13px", color: "#222", transition: "all 0.3s ease",
            opacity: "0", transform: "translateY(-20px)", resize: "both"
          });

          const dragHandle = document.createElement("div");
          dragHandle.style.cursor = "move"; dragHandle.style.display = "flex"; dragHandle.style.alignItems = "center"; dragHandle.style.gap = "6px"; dragHandle.style.marginBottom = "8px";

          const dragIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          dragIcon.setAttribute("width", "16"); dragIcon.setAttribute("height", "16"); dragIcon.setAttribute("viewBox", "0 0 24 24");
          const dragPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          dragPath.setAttribute("fill", "currentColor"); dragPath.setAttribute("d", "M4 9h16v2H4zm0 4h16v2H4z"); dragIcon.appendChild(dragPath);

          const title = document.createElement("div"); title.textContent = "Table of Contents"; title.style.fontWeight = "600"; title.style.fontSize = "14px"; title.style.flex = "1";

          dragHandle.appendChild(dragIcon); dragHandle.appendChild(title); panel.appendChild(dragHandle);

          // Top controls
          const topControls = document.createElement("div");
          topControls.style.position = "absolute"; topControls.style.top = "6px"; topControls.style.right = "8px"; topControls.style.display = "flex"; topControls.style.gap = "4px";

          const topCloseBtn = document.createElement("button"); topCloseBtn.textContent = "×"; Object.assign(topCloseBtn.style, { border: "none", background: "transparent", fontSize: "16px", cursor: "pointer", color: "#555", padding: "0", lineHeight: "1" });
          const reloadBtn = document.createElement("button"); reloadBtn.textContent = "⟳"; Object.assign(reloadBtn.style, { border: "none", background: "transparent", fontSize: "14px", cursor: "pointer", color: "#007acc", padding: "0", lineHeight: "1" });

          topControls.appendChild(reloadBtn); topControls.appendChild(topCloseBtn); panel.appendChild(topControls);

          topCloseBtn.addEventListener("click", () => panel.remove());
          reloadBtn.addEventListener("click", () => { panel.remove(); generateAndInjectTOC(); });

          const search = document.createElement("input"); search.placeholder = "Filter...";
          Object.assign(search.style, { width: "100%", padding: "6px 8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #ddd", boxSizing: "border-box" });

          const controls = document.createElement("div"); controls.style.display = "flex"; controls.style.flexWrap = "wrap"; controls.style.gap = "6px"; controls.style.marginBottom = "8px";

          const btnInsert = document.createElement("button"); btnInsert.textContent = "Insert";
          const btnCopy = document.createElement("button"); btnCopy.textContent = "Copy HTML";
          const btnHtml = document.createElement("button"); btnHtml.textContent = "Export HTML";
          const btnToggle = document.createElement("button"); btnToggle.textContent = "Collapse All";

          [btnInsert, btnCopy, btnHtml, btnToggle].forEach(btn => {
            Object.assign(btn.style, { padding: "6px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", transition: "all 0.2s ease" });
            btn.onmouseover = () => btn.style.transform = "scale(1.05)";
            btn.onmouseout = () => btn.style.transform = "scale(1)";
          });
          btnCopy.style.background = "#fff"; btnCopy.style.border = "1px solid #ddd"; btnCopy.style.color = "#007acc";
          btnHtml.style.background = "#fff"; btnHtml.style.border = "1px solid #ddd"; btnHtml.style.color = "#007acc";
          btnToggle.style.background = "#fff"; btnToggle.style.border = "1px solid #ddd"; btnToggle.style.color = "#007acc";
          btnInsert.style.background = "#007acc"; btnInsert.style.color = "#fff";

          controls.appendChild(btnInsert); controls.appendChild(btnCopy); controls.appendChild(btnHtml); controls.appendChild(btnToggle);

          // --- COLORS BUTTON AND POPUP ---
          const btnColors = document.createElement("button");
          btnColors.textContent = "Colors";
          Object.assign(btnColors.style, { padding: "6px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", background: "#eee", marginLeft: "4px" });
          controls.appendChild(btnColors);

          const colorPopup = document.createElement("div");
          colorPopup.classList.add("color-popup");
          Object.assign(colorPopup.style, {
            display: "none", position: "absolute", top: "32px", right: "0",
            background: "#fff", border: "1px solid #ddd", padding: "6px", borderRadius: "6px", zIndex: 1000,
            flexWrap: "wrap", gap: "4px", transform: "scale(0)", opacity: "0"
          });

          const closeIcon = document.createElement("span");
          closeIcon.textContent = "×";
          Object.assign(closeIcon.style, { cursor: "pointer", fontWeight: "bold", float: "right", marginBottom: "4px" });
          closeIcon.addEventListener("click", () => {
            colorPopup.style.transform = "scale(0)";
            colorPopup.style.opacity = "0";
            setTimeout(() => colorPopup.style.display = "none", 200);
          });
          colorPopup.appendChild(closeIcon);

          for (let i = 1; i <= 15; i++) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = storedColors[`h${i}`] || "#007acc";
  input.title = `H${i} Color`;
  input.addEventListener("input", (e) => {
    storedColors[`h${i}`] = e.target.value;
    localStorage.setItem("tocHeadingColors", JSON.stringify(storedColors));
    // Apply color only to TOC links, not page headings
    panel.querySelectorAll(`a.toc-level-${i}`).forEach(a => a.style.color = e.target.value);
  });
  colorPopup.appendChild(input);
}


          btnColors.addEventListener("click", () => {
            if (colorPopup.style.display === "none") {
              colorPopup.style.display = "flex";
              setTimeout(() => { colorPopup.style.transform = "scale(1)"; colorPopup.style.opacity = "1"; }, 10);
            } else {
              colorPopup.style.transform = "scale(0)";
              colorPopup.style.opacity = "0";
              setTimeout(() => { colorPopup.style.display = "none"; }, 200);
            }
          });

          panel.appendChild(search); panel.appendChild(controls); panel.appendChild(rootUl);
          panel.appendChild(colorPopup);
          document.documentElement.appendChild(panel);

          // Animate panel in
          setTimeout(() => { panel.style.opacity = "1"; panel.style.transform = "translateY(0)"; }, 10);

          // Dragging
          let isDragging = false, offsetX = 0, offsetY = 0;
          dragHandle.addEventListener("mousedown", (e) => { isDragging = true; offsetX = e.clientX - panel.offsetLeft; offsetY = e.clientY - panel.offsetTop; panel.style.right = "auto"; e.preventDefault(); });
          document.addEventListener("mousemove", (e) => { if (isDragging) { panel.style.left = (e.clientX - offsetX) + "px"; panel.style.top = (e.clientY - offsetY) + "px"; } });
          document.addEventListener("mouseup", () => { isDragging = false; });

          // Filter logic
          search.addEventListener("input", () => {
            const q = search.value.trim().toLowerCase();
            panel.querySelectorAll("a").forEach(a => { a.parentElement.style.display = a.textContent.toLowerCase().includes(q) ? "" : "none"; });
          });

          // Copy, Insert, Export HTML logic
          btnCopy.addEventListener("click", () => { const wrapper = document.createElement("div"); wrapper.appendChild(rootUl.cloneNode(true)); navigator.clipboard.writeText(wrapper.innerHTML).then(() => { btnCopy.textContent = "Copied!"; setTimeout(() => btnCopy.textContent = "Copy HTML", 1200); }); });
          btnHtml.addEventListener("click", () => { const wrapper = document.createElement("div"); wrapper.appendChild(rootUl.cloneNode(true)); const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TOC</title><style>body{font-family:system-ui,sans-serif;padding:16px}ul{list-style:none;padding-left:0}li{margin:4px 0}a{color:#007acc;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h2>Table of Contents</h2>${wrapper.innerHTML}</body></html>`; const blob = new Blob([htmlContent], { type: "text/html" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "toc.html"; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); });
          btnInsert.addEventListener("click", () => { const container = document.createElement("nav"); container.id = "injected-toc"; Object.assign(container.style, { border: "1px solid #ddd", padding: "12px", borderRadius: "6px", margin: "12px 0", background: "#fbfbfb" }); const h = document.createElement("h2"); h.textContent = "Table of Contents"; container.appendChild(h); container.appendChild(rootUl.cloneNode(true)); const firstHeading = document.querySelector("h1,h2,h3,h4,h5,h6,h7,h8,h9,h10,h11,h12,h13,h14,h15"); if (firstHeading && firstHeading.parentElement) firstHeading.parentElement.insertBefore(container, firstHeading); else document.body.insertBefore(container, document.body.firstChild); btnInsert.textContent = "Inserted ✓"; setTimeout(() => btnInsert.textContent = "Insert", 1200); });

          // Expand/Collapse All
          btnToggle.addEventListener("click", () => {
            const collapsing = btnToggle.textContent === "Collapse All";
            const uls = Array.from(panel.querySelectorAll("ul")).slice(1); // skip root UL
            const arrows = panel.querySelectorAll("svg");

            uls.forEach(ul => {
              const parentLi = ul.parentElement;
              const isTopLevel = parentLi?.parentElement === panel.querySelector("ul");
              if (collapsing && isTopLevel) return; // keep top-level visible
              ul.style.display = collapsing ? "none" : "block";
            });

            arrows.forEach(a => {
              const parentUl = a.closest("li")?.querySelector("ul");
              if (!parentUl) return;
              a.style.transform = collapsing ? "rotate(-90deg)" : "rotate(0deg)";
            });

            btnToggle.textContent = collapsing ? "Expand All" : "Collapse All";
          });

          // Individual arrow click toggles
          panel.querySelectorAll("svg").forEach(arrow => {
            const childUL = arrow.closest("li")?.querySelector("ul");
            if (!childUL) return;

            arrow.addEventListener("click", () => {
              const isCollapsed = childUL.style.display === "none";
              childUL.style.display = isCollapsed ? "block" : "none";
              arrow.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(-90deg)";
            });
          });

          panel.tabIndex = 0; panel.addEventListener("keydown", (ev) => { if (ev.key === "Escape") panel.remove(); });

        } catch (err) { console.error("TOC generation error", err); alert("Error generating TOC: " + (err?.message || err)); }
      })();
    }
  });
});




// === Auto Footnote Generator ===
document.getElementById("auto-footnote-generator")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: "MAIN",
      func: injectedFootnoteGenerator
    });
  });
});

// === This function runs inside the page ===
function injectedFootnoteGenerator() {
  try {
    // Ask user for marker format
    let format = prompt("Enter footnote format (use 'n' for number placeholder):", "[n]");
    if (!format) return;

    const esc = format.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regexStr = esc.replace("n", "(\\d+)");
    const regex = new RegExp(regexStr, "g");

    const html = document.body.innerHTML;
    const matches = [...html.matchAll(regex)];
    if (!matches.length) {
      alert(`⚠️ No ${format} style footnotes found.`);
      return;
    }

    // === Draggable helper ===
    function makeDraggable(el, handle) {
      let isDragging = false, offsetX = 0, offsetY = 0;
      handle.style.cursor = "move";
      handle.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
        document.addEventListener("mousemove", moveAt);
        document.addEventListener("mouseup", stopDrag);
      });
      function moveAt(e) {
        if (!isDragging) return;
        el.style.left = e.clientX - offsetX + "px";
        el.style.top = e.clientY - offsetY + "px";
      }
      function stopDrag() {
        isDragging = false;
        document.removeEventListener("mousemove", moveAt);
        document.removeEventListener("mouseup", stopDrag);
      }
    }

    // Remove old modal if exists
    document.getElementById("__auto_footnotes_modal__")?.remove();

    // === Modal container ===
    const modal = document.createElement("div");
    modal.id = "__auto_footnotes_modal__";
    Object.assign(modal.style, {
      position: "fixed",
      top: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: 2147483647,
      padding: "16px",
      width: "520px",
      maxHeight: "80vh",
      overflowY: "auto"
    });

    // === Header (drag handle) ===
    const header = document.createElement("div");
    header.textContent = `Found ${matches.length} markers (${format}) — drag me`;
    Object.assign(header.style, {
      fontWeight: "bold",
      marginBottom: "10px",
      background: "#f5f5f5",
      padding: "6px",
      borderRadius: "4px"
    });
    modal.appendChild(header);

    // === Form with textareas ===
    const form = document.createElement("div");
    form.style.display = "grid";
    form.style.gap = "10px";
    const inputs = [];

    matches.forEach((match) => {
      const num = match[1];
      const markerText = match[0];

      const row = document.createElement("div");
      Object.assign(row.style, {
        border: "1px solid #eee",
        padding: "8px",
        borderRadius: "6px"
      });

      const label = document.createElement("div");
      label.textContent = `Marker ${markerText}`;
      label.style.color = "#0366d6";
      label.style.cursor = "pointer";
      label.style.marginBottom = "6px";
      label.onclick = () => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue.includes(markerText)) {
            node.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
            node.parentElement.style.outline = "2px solid orange";
            setTimeout(() => (node.parentElement.style.outline = ""), 1500);
            break;
          }
        }
      };

      const ta = document.createElement("textarea");
      ta.rows = 2;
      ta.style.width = "100%";
      ta.placeholder = `Enter text for ${markerText}`;
      ta.dataset.num = num;

      row.appendChild(label);
      row.appendChild(ta);
      form.appendChild(row);

      inputs.push({ num, textarea: ta });
    });
    modal.appendChild(form);

    // === Controls (Cancel + Generate) ===
    const controls = document.createElement("div");
    controls.style.textAlign = "right";
    controls.style.marginTop = "12px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginRight = "8px";
    cancelBtn.onclick = () => modal.remove();

    const genBtn = document.createElement("button");
    genBtn.textContent = "Generate Footnotes";
    genBtn.style.background = "#4CAF50";
    genBtn.style.color = "white";
    genBtn.style.border = "none";
    genBtn.style.padding = "6px 12px";
    genBtn.style.borderRadius = "4px";
    genBtn.style.cursor = "pointer";

    genBtn.onclick = () => {
      let newHtml = html;
      matches.forEach((match) => {
        const num = match[1];
        const specRegexStr = regexStr.replace("(\\d+)", num);
        const specRegex = new RegExp(specRegexStr, "g");
        newHtml = newHtml.replace(
          specRegex,
          `<sup><a href="#ftnt${num}" id="ftnt_ref${num}">${num}</a></sup>`
        );
      });
      document.body.innerHTML = newHtml;

      let section = document.getElementById("__auto_footnotes__");
      if (!section) {
        section = document.createElement("div");
        section.id = "__auto_footnotes__";
        section.style.borderTop = "2px solid #ccc";
        section.style.marginTop = "30px";
        section.style.paddingTop = "10px";
        const h3 = document.createElement("h3");
        h3.textContent = "Footnotes";
        section.appendChild(h3);
        document.body.appendChild(section);
      }

      const escapeHtml = (s) =>
        (s + "").replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      inputs.forEach(({ num, textarea }) => {
        const li = document.createElement("div");
        li.className = "footnote";
        li.innerHTML = `${num}. <span>${escapeHtml(textarea.value.trim() || "")}</span>`;
        li.id = `ftnt${num}`;
        section.appendChild(li);
      });

      alert(`✅ Converted ${matches.length} markers into linked footnotes.`);
      modal.remove();
    };

    controls.appendChild(cancelBtn);
    controls.appendChild(genBtn);
    modal.appendChild(controls);

    document.body.appendChild(modal);
    makeDraggable(modal, header);

  } catch (err) {
    alert("❌ Auto Footnote Generator failed: " + (err?.message || err));
  }
}


document.addEventListener('DOMContentLoaded', () => {
  const themeBtn  = document.getElementById('themeSwitcherBtn');
  const themeBox  = document.getElementById('theme-chooser');
  const applyBtn  = document.getElementById('applyPageDark');
  const clearBtn  = document.getElementById('clearPageTheme');
  const extBtn    = document.getElementById('toggleExtDark');

  // --- mini popup open/close
  if (themeBtn && themeBox) {
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      themeBox.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!themeBox.contains(e.target) && e.target !== themeBtn) {
        themeBox.classList.remove('show');
      }
    });
  }

  // --- Apply VSCode Dark+ to the CURRENT PAGE (in tab)
  applyBtn?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const STYLE_ID = '__vscode_dark_plus_css__';
          const DATA_ATTR = 'data-vscode-theme';

          const css = `
:root[${DATA_ATTR}="dark"]{
  --vs-bg:#1e1e1e; --vs-panel:#252526; --vs-border:#3c3c3c; --vs-text:#d4d4d4; --vs-muted:#9f9f9f;
  --vs-heading:#dcdcaa; --vs-link:#569cd6; --vs-accent:#0e639c; --vs-selection:#264f78;
  --vs-code-bg:#252526; --vs-code-inline:#2d2d2d;
  --vs-tag:#569cd6; --vs-attr:#9cdcfe; --vs-string:#ce9178; --vs-number:#b5cea8;
  --vs-comment:#6a9955; --vs-punct:#d4d4d4; --vs-key:#c586c0; --vs-const:#4fc1ff;
}
[${DATA_ATTR}="dark"] body{
  background:var(--vs-bg) !important; color:var(--vs-text) !important;
}
[${DATA_ATTR}="dark"] a{ color:var(--vs-link) !important; }
[${DATA_ATTR}="dark"] h1,h2,h3,h4,h5,h6{ color:var(--vs-heading) !important; }
[${DATA_ATTR}="dark"] table, [${DATA_ATTR}="dark"] th, [${DATA_ATTR}="dark"] td{
  border-color:var(--vs-border) !important;
}
[${DATA_ATTR}="dark"] pre, [${DATA_ATTR}="dark"] code{
  background:var(--vs-code-bg) !important; color:var(--vs-text) !important;
  border:1px solid var(--vs-border); border-radius:6px; padding:.5em .75em;
}
[${DATA_ATTR}="dark"] code{ background:var(--vs-code-inline) !important; }
[${DATA_ATTR}="dark"] ::selection{ background:var(--vs-selection); color:#fff; }
`;

          let styleEl = document.getElementById(STYLE_ID);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = STYLE_ID;
            styleEl.textContent = css;
            document.documentElement.appendChild(styleEl);
          } else {
            styleEl.textContent = css;
          }
          document.documentElement.setAttribute(DATA_ATTR, 'dark');
        }
      });
    });
  });

  // --- Reset page theme (remove injected style + attribute)
  clearBtn?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const STYLE_ID = '__vscode_dark_plus_css__';
          const DATA_ATTR = 'data-vscode-theme';
          document.getElementById(STYLE_ID)?.remove();
          document.documentElement.removeAttribute(DATA_ATTR);
        }
      });
    });
  });

  // --- Toggle Extension UI theme (the popup itself)
  const THEME_KEY = 'extTheme';
  const applyExtTheme = (mode) => {
    if (mode === 'dark') {
      document.documentElement.setAttribute('data-ext-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-ext-theme');
    }
  };

  extBtn?.addEventListener('click', async () => {
    const { extTheme } = await chrome.storage.local.get(THEME_KEY);
    const next = extTheme === 'dark' ? 'light' : 'dark';
    await chrome.storage.local.set({ [THEME_KEY]: next });
    applyExtTheme(next);
  });

  // restore popup UI theme on open
  chrome.storage.local.get(THEME_KEY, ({ extTheme }) => applyExtTheme(extTheme || 'light'));
});

// === Improved validator handler (FINAL) ===
const validateBtn = document.getElementById("validate-html-btn");
const copyBtn = document.getElementById("copy-report-btn");
const clearBtn = document.getElementById("clear-report-btn");
const validatorPanel = document.getElementById("html-validator-panel");
const srcPanel = document.getElementById("html-source-panel");

// === Validate Handler ===
if (validateBtn) {
  validateBtn.addEventListener("click", async () => {
    try {
      // Show spinner immediately
      validatorPanel.innerHTML = `
        <div id="validator-loading"
             style="display:flex;align-items:center;gap:6px;
                    color:#555;padding:6px;font-size:13px;
                    opacity:1;transition:opacity 0.4s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" 
               style="width:16px;height:16px;animation:spin 1s linear infinite;" 
               viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M22 12a10 10 0 0 1-10 10" />
          </svg>
          <span>Validating HTML...</span>
        </div>
      `;

      srcPanel.innerHTML = "";
      copyBtn.style.display = "none";
      clearBtn.style.display = "none";

      // Get raw HTML
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const rawHtml = await fetch(tab.url, { cache: "no-store" }).then(r => r.text());

      let results = (HTMLHint && HTMLHint.HTMLHint)
        ? HTMLHint.HTMLHint.verify(rawHtml, { "tag-pair": true })
        : [];

      // Filter duplicates by line
      const seenLines = new Set();
      results = results.filter(r => {
        if (seenLines.has(r.line)) return false;
        seenLines.add(r.line);
        return true;
      });

      // Fade out spinner → fade in results
      const loadingEl = document.getElementById("validator-loading");
      if (loadingEl) {
        loadingEl.style.opacity = "0";
        setTimeout(() => {
          validatorPanel.innerHTML = `
            <div id="validator-results" style="opacity:0;transition:opacity 0.4s ease;">
              ${
                results.length
                  ? results.map((r, i) =>
                      `<div class="validator-error" data-idx="${i}" style="padding:4px;cursor:pointer;">
                         ❌ [Line ${r.line}, Col ${r.col}] ${r.message}
                       </div>`
                    ).join("")
                  : `<div style="padding:4px">✅ No tag-pair issues found.</div>`
              }
            </div>
          `;

          // trigger fade-in
          requestAnimationFrame(() => {
            const resultsEl = document.getElementById("validator-results");
            if (resultsEl) resultsEl.style.opacity = "1";
          });

          // Show buttons if results exist
          copyBtn.style.display = results.length ? "inline-block" : "none";
          clearBtn.style.display = results.length ? "inline-block" : "none";

          // Attach click handler ONCE per render
          const resultsEl = document.getElementById("validator-results");
          if (resultsEl) {
            resultsEl.addEventListener("click", (e) => {
              const div = e.target.closest(".validator-error");
              if (!div) return;
              const idx = parseInt(div.dataset.idx, 10);
              const lineNum = results[idx].line;
              const target = srcPanel.querySelector(`#src-line-${lineNum}`);
              if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.style.transition = "background-color 0.3s";
                target.style.backgroundColor = "yellow";
                setTimeout(() => {
                  target.style.backgroundColor = badLines.has(lineNum) ? "#ffeeba" : "";
                }, 1200);
              }
            }, { once: true }); // 👈 no stacking!
          }
        }, 400);
      }

      // Highlight source panel
      const lines = rawHtml.split(/\r\n|\r|\n/);
      const badLines = new Set(results.map(r => r.line));

      srcPanel.innerHTML = lines.map((line, i) => {
        const n = i + 1;
        if (badLines.has(n)) {
          return `<div id="src-line-${n}" style="background:#ffeeba">
                    <span style="color:#d00">❌ ${n.toString().padStart(4," ")}</span> ${line}
                  </div>`;
        }
        return `<div id="src-line-${n}">
                  <span style="color:#999">${n.toString().padStart(4," ")}</span> ${line}
                </div>`;
      }).join("");

    } catch (err) {
      validatorPanel.innerHTML = `<div style="color:red">❌ Error: ${err.message}</div>`;
      copyBtn.style.display = "none";
      clearBtn.style.display = "none";
      srcPanel.innerHTML = "";
    }
  });
}
// ✅ Copy Report
if (copyBtn) {
  copyBtn.addEventListener("click", () => {
    const text = validatorPanel.innerText;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy Report"), 1500);
    });
  });
}

// ✅ Clear Report (with fade-out)
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const resultsEl = document.getElementById("validator-results") || validatorPanel;

    // apply fade-out
    resultsEl.style.transition = "opacity 0.4s ease";
    resultsEl.style.opacity = "0";

    // after fade, clear content
    setTimeout(() => {
      validatorPanel.innerHTML = "";
      srcPanel.innerHTML = "";
      copyBtn.style.display = "none";
      clearBtn.style.display = "none";
    }, 400); // match transition time
  });
}


function setupToggle(buttonId, storageKey, scriptFile, enableMsg, disableMsg) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  chrome.storage.local.get(storageKey, (data) => {
    if (data[storageKey]) {
      btn.classList.add("active");
      btn.textContent = disableMsg;
    }
  });

  btn.addEventListener("click", async () => {
    const isActive = btn.classList.toggle("active");
    if (isActive) {
      btn.textContent = disableMsg;
      await chrome.storage.local.set({ [storageKey]: true });
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && scriptFile) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [scriptFile] });
      }
    } else {
      btn.textContent = enableMsg;
      await chrome.storage.local.set({ [storageKey]: false });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: `disable-${storageKey}` });
        }
      });
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const themeBtn = document.getElementById("theme-btn");
  const themeMenu = document.getElementById("theme-menu");

  // Load saved theme
  chrome.storage.sync.get("selectedTheme", ({ selectedTheme }) => {
    if (selectedTheme) {
      document.body.classList.add(selectedTheme);
    } else {
      document.body.classList.add("theme-yellow"); // default
    }
  });

  themeBtn.addEventListener("click", () => {
    themeMenu.style.display = themeMenu.style.display === "block" ? "none" : "block";
  });

  themeMenu.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme");

      // remove old theme
      document.body.classList.remove("theme-yellow","theme-cyber","theme-purple","theme-navy","theme-green");
      document.body.classList.add(theme);

      // save choice
      chrome.storage.sync.set({ selectedTheme: theme });

      // close menu
      themeMenu.style.display = "none";
    });
  });
});
// === THEME SWITCHER ===
const themeBtn = document.getElementById("theme-btn");
const themeMenu = document.getElementById("theme-menu");

// Toggle dropdown menu
themeBtn?.addEventListener("click", () => {
  themeMenu.classList.toggle("hidden");
});

// Handle theme button clicks
document.querySelectorAll("#theme-menu button").forEach(btn => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme;
    document.body.className = theme; // apply theme
    localStorage.setItem("selectedTheme", theme);
    themeMenu.classList.add("hidden");
  });
});
// Toggle visibility of tools when extension is enabled/disabled
const extensionToggle = document.getElementById("extension-enabled");

extensionToggle.addEventListener("change", (e) => {
  const enabled = e.target.checked;

  // show/hide all option groups
  document.querySelectorAll(".option-group").forEach(group => {
    group.classList.toggle("hidden", !enabled);
  });

  // Optional: persist state
  localStorage.setItem("extensionEnabled", enabled);
});
// Restore on load
window.addEventListener("DOMContentLoaded", () => {
  const enabled = localStorage.getItem("extensionEnabled") === "true";
  extensionToggle.checked = enabled;
  document.querySelectorAll(".option-group").forEach(group => {
    group.classList.toggle("hidden", !enabled);
  });
});
// Toolbar dropdown toggle
const toolbarBtn = document.getElementById("toolbar-main-btn");
const toolbarDropdown = document.getElementById("toolbar-dropdown");

if (toolbarBtn && toolbarDropdown) {
  toolbarBtn.addEventListener("click", () => {
    if (toolbarDropdown.classList.contains("hidden")) {
      // Show with animation
      toolbarDropdown.classList.remove("hidden");
      // restart animations
      toolbarDropdown.querySelectorAll("button, .dropdown").forEach(el => {
        el.style.animation = "none";
        el.offsetHeight; // trigger reflow
        el.style.animation = "";
      });
    } else {
      toolbarDropdown.classList.add("hidden");
    }
  });

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!toolbarDropdown.contains(e.target) && !toolbarBtn.contains(e.target)) {
      toolbarDropdown.classList.add("hidden");
    }
  });
}
const exportBtn = document.getElementById("exportMenuBtn");
const exportDropdown = document.getElementById("exportDropdown");

if (exportBtn && exportDropdown) {
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (exportDropdown.classList.contains("show")) {
      exportDropdown.classList.remove("show");
    } else {
      // get button position
      const rect = exportBtn.getBoundingClientRect();
      exportDropdown.style.top = rect.top + rect.height / 2 + "px";
      exportDropdown.style.left = rect.left - exportDropdown.offsetWidth - 10 + "px"; // 👈 place LEFT of button
      exportDropdown.style.transform = "translateY(-50%)";
      exportDropdown.classList.add("show");
    }
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!exportBtn.contains(e.target) && !exportDropdown.contains(e.target)) {
      exportDropdown.classList.remove("show");
    }
  });
}
(() => {
  const btn = document.getElementById("readme-btn");
  const panel = document.getElementById("readme-manual");
  if (!btn || !panel) return;

  const GAP = 8; // space between icon and popup

  function measure(el) {
    const prev = { d: el.style.display, v: el.style.visibility };
    el.style.display = "block";
    el.style.visibility = "hidden";
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.display = prev.d || "";
    el.style.visibility = prev.v || "";
    return { w, h };
  }

  function positionPanel() {
    const r = btn.getBoundingClientRect();
    const { w: pw, h: ph } = measure(panel);

    let top = r.top + (r.height - ph) / 2; // center vertically to icon
    let left = r.left - pw - GAP;          // place to the LEFT of icon

    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.left = `${left}px`;
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.classList.contains("visible")) {
      panel.classList.add("hiding");
      setTimeout(() => panel.classList.remove("visible", "hiding"), 180);
    } else {
      positionPanel();
      requestAnimationFrame(() => panel.classList.add("visible"));
    }
  });

  window.addEventListener("resize", () => {
    if (panel.classList.contains("visible")) positionPanel();
  });

  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !panel.contains(e.target) && panel.classList.contains("visible")) {
      panel.classList.add("hiding");
      setTimeout(() => panel.classList.remove("visible", "hiding"), 180);
    }
  });
})();
//PDF to HTML
document.getElementById("openPdfConverterBtn").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("pdfConverter.html"),
    type: "popup",
    width: 500,
    height: 600
  });
});
// PDF Downloader
document.addEventListener("DOMContentLoaded", () => {
  const pdfDownloaderBtn = document.getElementById("pdfDownloaderBtn");

  pdfDownloaderBtn.addEventListener("click", async () => {
    const modeInput = prompt(
      "Enter class name or full CSS selector:\n" +
      "Examples:\n- class → statute\n- selector → .statute a, a[href*='.pdf']",
      "statute"
    );
    if (!modeInput) return;

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectLinksAndShowPopup,
      args: [modeInput]
    });
  });
});

// -------------------- Content Script --------------------
function collectLinksAndShowPopup(modeInput) {
  function normalizeUrl(u) {
    try { return new URL(u, location.href).toString(); } catch { return null; }
  }

  function filenameFromUrl(u) {
    try {
      const urlObj = new URL(u);
      let file = urlObj.pathname.split("/").pop() || "file";
      if (!file.includes(".")) {
        for (let [k, v] of urlObj.searchParams) {
          if (/\.[a-z0-9]{2,5}$/i.test(v)) { file = v.split("/").pop(); break; }
        }
      }
      return decodeURIComponent(file) || "file";
    } catch { return "file"; }
  }

  function isGeneric(text) {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    return t.length < 5 || ["download","pdf","view","open"].includes(t);
  }

  // Collect elements
  let elements = [];
  if (modeInput.startsWith(".") || modeInput.includes(" ") || modeInput.includes("[")) {
    try { elements = document.querySelectorAll(modeInput); } 
    catch(e){ console.warn("Invalid selector", modeInput, e);}
  } else {
    elements = document.getElementsByClassName(modeInput);
  }

  let results = [];
  for (let el of elements) {
    const link = el.href || el.getAttribute("href");
    const url = link ? normalizeUrl(link) : null;
    if (!url) continue;
    let filename = el.textContent.trim();
    if (isGeneric(filename)) filename = filenameFromUrl(url);
    if (!/\.[a-z0-9]{1,5}$/i.test(filename)) filename += ".pdf";
    results.push({ url, filename });
  }

  // Deduplicate
  const seen = {};
  results = results.filter(r => { if(seen[r.url]) return false; seen[r.url]=true; return true; });

  if (!results.length) return alert("No matching downloadable links found.");
  showFileSelectionPopup(results);

  // -------------------- Modal --------------------
function showFileSelectionPopup(files) {
  const existing = document.getElementById("__bulk_download_popup__");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "__bulk_download_popup__";
  Object.assign(popup.style, {
    position: "fixed",
    top: "50%",
    left: "30%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    color: "#000",
    padding: "12px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    zIndex: 999999,
    width: "450px",
    maxHeight: "65vh",
    overflowY: "auto",
    fontFamily: "system-ui,sans-serif",
    fontSize: "15px",
    cursor: "move",
  });

  // ----- Drag Handling -----
  let offsetX, offsetY, isDragging = false;
  popup.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, input, label")) return; // Ignore clicks on interactive elements
    isDragging = true;
    offsetX = e.clientX - popup.offsetLeft;
    offsetY = e.clientY - popup.offsetTop;
    popup.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    popup.style.left = e.clientX - offsetX + "px";
    popup.style.top = e.clientY - offsetY + "px";
    popup.style.transform = ""; // disable centering transform during drag
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    popup.style.cursor = "move";
  });

  // Header
const header = document.createElement("div");
Object.assign(header.style, { 
  display: "flex", 
  justifyContent: "space-between", 
  alignItems: "center", 
  marginBottom: "8px" 
});

// Title with counts
const title = document.createElement("div");
title.textContent = `Select Files to Download<br>(${files.length} total, 0 selected)`;
Object.assign(title.style, { fontWeight: "bold" });
header.appendChild(title);

// Icons container
const icons = document.createElement("div");
icons.style.display = "flex";
icons.style.gap = "6px";

// Helper for icon buttons
const createIconButton = (label, tooltip) => {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.title = tooltip;
  Object.assign(btn.style, { 
    padding: "2px 6px", 
    cursor: "pointer", 
    border: "none", 
    borderRadius: "4px", 
    background: "#eee", 
    fontWeight: "bold" 
  });
  btn.onmouseover = () => btn.style.background = "#ddd";
  btn.onmouseleave = () => btn.style.background = "#eee";
  return btn;
};

// Download icon
const downloadBtn = createIconButton("⬇️", "Download Selected");
downloadBtn.onclick = () => downloadBtnWorkflow();
icons.appendChild(downloadBtn);

// Refresh icon
const refreshBtn = createIconButton("🔄", "Refresh file info");
refreshBtn.onclick = () => {
  popup.remove();
  showFileSelectionPopup(files);
};
icons.appendChild(refreshBtn);

// Close icon
const closeBtnIcon = createIconButton("❌", "Close popup");
closeBtnIcon.onclick = () => popup.remove();
icons.appendChild(closeBtnIcon);

header.appendChild(icons);
popup.appendChild(header);


  // ----- Select/Deselect -----
const controls = document.createElement("div");
controls.style.marginBottom = "8px";

const selectAllBtn = document.createElement("button");
selectAllBtn.textContent = "Select All";
selectAllBtn.style.marginRight = "6px";
selectAllBtn.onclick = () => {
  popup.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = true;
    cb.dispatchEvent(new Event("change")); // trigger updateSelectionCount
  });
};

const deselectAllBtn = document.createElement("button");
deselectAllBtn.textContent = "Deselect All";
deselectAllBtn.onclick = () => {
  popup.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = false;
    cb.dispatchEvent(new Event("change")); // trigger updateSelectionCount
  });
};

controls.appendChild(selectAllBtn);
controls.appendChild(deselectAllBtn);
popup.appendChild(controls);


  // ----- File List -----
  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "4px";

  files.forEach((file) => {
    const row = document.createElement("label");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "#f8f8f8",
      padding: "4px 6px",
      borderRadius: "4px",
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", updateSelectionCount);
    checkbox.dataset.url = file.url;
    checkbox.dataset.filename = file.filename;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = file.filename;
    nameSpan.style.flex = "1";
    nameSpan.style.marginLeft = "8px";
    nameSpan.style.wordBreak = "break-all";

    const infoSpan = document.createElement("span");
    infoSpan.style.fontSize = "11px";
    infoSpan.style.opacity = "0.7";
    infoSpan.textContent = "(Fetching...)";

    row.appendChild(checkbox);
    row.appendChild(nameSpan);
    row.appendChild(infoSpan);
    list.appendChild(row);

    // Fetch file type & size
    fetch(file.url, { method: "HEAD" })
      .then((r) => {
        const size = r.headers.get("content-length");
        const type = r.headers.get("content-type");
        infoSpan.textContent = `(${type || "Unknown"}, ${size ? formatBytes(+size) : "Unknown"})`;
      })
      .catch(() => {
        infoSpan.textContent = "(Unknown)";
      });
  });

  popup.appendChild(list);
updateSelectionCount();
  // ----- Download Workflow -----
  function downloadBtnWorkflow() {
    const selected = [...popup.querySelectorAll("input[type=checkbox]:checked")];
    if (!selected.length) return alert("No files selected.");

    selected.forEach((cb, i) => {
      const url = cb.dataset.url;
      const filename = cb.dataset.filename;
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });

    popup.remove();
  }
function updateSelectionCount() {
  const total = files.length;
  const selected = popup.querySelectorAll("input[type=checkbox]:checked").length;
  title.innerHTML = `Select Files to Download<br>(${total} total, ${selected} selected)`;
}
  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024,
      dm = 2,
      sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  document.body.appendChild(popup);
}
}
document.querySelectorAll('.tooltip').forEach(el => {
  const tooltipText = el.getAttribute('data-tip');
  if (!tooltipText) return;

  const tooltipBox = document.createElement('div');
  tooltipBox.className = 'tooltip-box';
  tooltipBox.textContent = tooltipText;
  document.body.appendChild(tooltipBox);

  el.addEventListener('mouseenter', () => {
    tooltipBox.classList.add('visible');
  });

  el.addEventListener('mousemove', e => {
    const offset = 12; // distance from cursor
    tooltipBox.style.left = `${e.clientX + offset}px`;
    tooltipBox.style.top = `${e.clientY + offset}px`;
  });

  el.addEventListener('mouseleave', () => {
    tooltipBox.classList.remove('visible');
  });
});
const hero = document.querySelector('.hero-header');
if (hero) {
  hero.addEventListener('click', (e) => {
    if (e.target === hero) {
      window.open('https://www.cube.global', '_blank', 'noopener,noreferrer');
    }
  });
}
const sidebar = document.querySelector('sidebar-menu');
const cubeFrame = document.getElementById('cube-logo-frame');

// Function to hide/show cube
function toggleCube() {
  // Check if the sidebar has a shadowRoot
  let isOpen = false;

  if (sidebar.shadowRoot) {
    // Try to find a class inside shadow DOM that indicates open
    // Example: sidebar content has 'open' class
    const content = sidebar.shadowRoot.querySelector('nav, .sidebar-content, .container');
    if (content) {
      isOpen = content.classList.contains('open') || content.style.display !== 'none';
    }
  } else {
    // fallback: check attribute
    isOpen = sidebar.hasAttribute('open');
  }

  if (isOpen) {
    cubeFrame.style.opacity = 0;
    cubeFrame.style.pointerEvents = 'none';
  } else {
    cubeFrame.style.opacity = 1;
    cubeFrame.style.pointerEvents = 'auto';
  }
}

// Observe mutations in sidebar or shadowRoot
const observer = new MutationObserver(toggleCube);
observer.observe(sidebar, { attributes: true, subtree: true, childList: true });

// Initial check
toggleCube();
document.addEventListener("DOMContentLoaded", () => {
  const title = document.querySelector(".forgeit-title-merge");
  const tagline = document.querySelector(".forgeit-tagline-merge");

  if (!title || !tagline) return;

  // === Logo Magnetic Spring ===
  const stiffnessLogo = 0.1;  // spring tension
  const dampingLogo = 0.82;   // friction
  const targetGap = 2;
  let gap = 25;
  let velocity = 0;
  let animatingLogo = false;

  function runLogoSpring() {
    if (animatingLogo) return;
    animatingLogo = true;
    gap = 25;
    velocity = 0;

    const step = () => {
      const force = (targetGap - gap) * stiffnessLogo;
      velocity = velocity * dampingLogo + force;
      gap += velocity;

      const time = performance.now();
      const wobble = Math.sin(time / 120) * velocity * 1.8;
      const sway = Math.sin(time / 250) * velocity;

      title.style.gap = `${gap}px`;
      title.style.transform = `translateX(${wobble + sway}px)`;

      if (Math.abs(velocity) > 0.01 || Math.abs(targetGap - gap) > 0.5) {
        requestAnimationFrame(step);
      } else {
        title.style.gap = `${targetGap}px`;
        title.style.transform = "translateX(0)";
        animatingLogo = false;
      }
    };
    requestAnimationFrame(step);
  }

  // === Tagline Smooth Spring ===
  const stiffnessTagline = 0.08;
  const dampingTagline = 0.82;
  let y = 25;
  let velocityTagline = 0;
  let animatingTagline = false;

  function runTaglineSpring() {
    if (animatingTagline) return;
    animatingTagline = true;
    y = 25;
    velocityTagline = 0;

    const step = () => {
      const force = (0 - y) * stiffnessTagline;
      velocityTagline = velocityTagline * dampingTagline + force;
      y += velocityTagline;

      tagline.style.transform = `translateY(${y}px)`;
      tagline.style.opacity = 1 - y/30;

      if (Math.abs(velocityTagline) > 0.01 || Math.abs(0 - y) > 0.5) {
        requestAnimationFrame(step);
      } else {
        tagline.style.transform = `translateY(0)`;
        tagline.style.opacity = 1;
        animatingTagline = false;
      }
    };
    requestAnimationFrame(step);
  }

  // Initial animations after logo entry
  setTimeout(() => {
    runLogoSpring();
    runTaglineSpring();
  }, 1300);

  // Hover / tap triggers for logo
  title.addEventListener("mouseenter", runLogoSpring);
  title.addEventListener("click", runLogoSpring);
  title.addEventListener("touchstart", runLogoSpring, { passive: true });

  // Optional: hover / tap triggers for tagline
  tagline.addEventListener("mouseenter", runTaglineSpring);
  tagline.addEventListener("click", runTaglineSpring);
  tagline.addEventListener("touchstart", runTaglineSpring, { passive: true });
});
document.addEventListener('DOMContentLoaded', () => {
  featureButtonIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return; // skip if button doesn't exist

    btn.addEventListener('click', () => {
      btn.classList.toggle('active'); // toggle green
    });
  });
});