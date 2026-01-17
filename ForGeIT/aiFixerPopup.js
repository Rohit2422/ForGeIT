// ===========================
// Load API Key
// ===========================
document.addEventListener("DOMContentLoaded", () => {

  chrome.storage.local.get(["geminiKeys","activeIndex"], (res) => {

    let keys = res.geminiKeys || [];
    let idx  = res.activeIndex ?? 0;

    // if there are keys but index is out of range → fix it
    if (idx >= keys.length) idx = 0;

    chrome.storage.local.set({ activeIndex: idx }, () => {
      renderKeysUI(keys, idx);   // ⬅️ ALWAYS render here
      updateApiUsageDisplay();
    });
  });

});

function renderKeysUI(keys, activeIndex) {
  const box = document.getElementById("keysContainer");
  box.innerHTML = "";

  keys.forEach((item, i) => {
    const remainingLines = Math.max(0, 400 - item.usedLines);
    const remainingChunks = Math.ceil(remainingLines / 40);

    const div = document.createElement("div");
    div.style.marginTop = "8px";
    div.style.padding = "10px";
    div.style.borderRadius = "6px";
    div.style.background = "#181818";
    div.style.border = i === activeIndex 
      ? "1px solid #4ade80" 
      : "1px solid #2a2a2a";

    div.innerHTML = `
  <div style="display:flex;align-items:center;gap:6px;">
    <div style="font-size:12px;color:#aaa;">
      Key ${i + 1} ${i === activeIndex ? "(Current)" : ""}
    </div>

    <input type="checkbox" class="keySelect" data-index="${i}">
  </div>

  <input type="text" value="${item.key}" style="width:100%;margin-top:6px;">

  <div style="font-size:12px;color:#bbb;margin-top:4px;">
    Remaining: ${remainingChunks} chunks (${remainingLines} lines)
  </div>
`;


    div.addEventListener("click", (e) => {

  // ⛔ ignore clicks on checkbox
  if (e.target.classList.contains("keySelect")) return;

  chrome.storage.local.set({ activeIndex: i }, () => {
    renderKeysUI(keys, i);
  });

});


box.appendChild(div);
  });
}
// ===========================
// API USAGE DISPLAY (TOTAL ACROSS ALL KEYS)
// ===========================
function updateApiUsageDisplay() {

  chrome.storage.local.get(["geminiKeys"], (res) => {

    const keys = res.geminiKeys || [];

    const MAX_CHUNKS_PER_KEY = 10;
    const LINES_PER_CHUNK   = 40;

    // TOTAL capacity across ALL keys
    const totalCapacityLines = keys.length * MAX_CHUNKS_PER_KEY * LINES_PER_CHUNK;

    let usedLines = 0;
    keys.forEach(k => usedLines += (k.usedLines || 0));

    const usedChunks      = Math.ceil(usedLines / LINES_PER_CHUNK);
    const remainingLines  = Math.max(0, totalCapacityLines - usedLines);
    const remainingChunks = Math.ceil(remainingLines / LINES_PER_CHUNK);

    // Fill UI values
    document.getElementById("apiLimitChunks").textContent     = keys.length * MAX_CHUNKS_PER_KEY;
    document.getElementById("apiLimitLines").textContent      = totalCapacityLines;

    document.getElementById("apiUsedChunks").textContent      = usedChunks;
    document.getElementById("apiUsedLines").textContent       = usedLines;

    document.getElementById("apiRemainingChunks").textContent = remainingChunks;
    document.getElementById("apiRemainingLines").textContent  = remainingLines;

    // animated bar
    const percent = totalCapacityLines === 0
      ? 0
      : Math.min((usedLines / totalCapacityLines) * 100, 100);

    const bar = document.getElementById("apiUsageBar");
    bar.style.transition = "width .45s ease-out";
    bar.style.width = percent + "%";

    bar.style.background =
      percent >= 90 ? "#e53935" :
      percent >= 70 ? "#ff9800" :
      "#4caf50";
  });
}
// listen for usage updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RTL_USAGE") {

  chrome.storage.local.get(["geminiKeys","activeIndex"], (res) => {

    const keys = res.geminiKeys || [];
    let idx = res.activeIndex || 0;

    if (!keys[idx]) return;

    // NO usage modification here

    chrome.storage.local.set({
      geminiKeys: keys,
      activeIndex: idx
    }, () => {
      renderKeysUI(keys, idx);
      updateApiUsageDisplay();
    });

  });
}

});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "GET_NEXT_KEY") {

    chrome.storage.local.get(["geminiKeys","activeIndex"], (res) => {
      let keys = res.geminiKeys || [];
      let idx  = res.activeIndex ?? 0;

      while (idx < keys.length && keys[idx].usedLines >= 400) idx++;

      if (idx >= keys.length) {
        sendResponse({ key: null });
        return;
      }

      chrome.storage.local.set({ activeIndex: idx }, () => {
        sendResponse({ key: keys[idx].key, index: idx });
      });
    });

    return true;
  }

  if (msg.type === "CONSUME_LINES") {

    chrome.storage.local.get(["geminiKeys","activeIndex"], (res) => {

      const keys = res.geminiKeys || [];
      let idx = res.activeIndex ?? 0;

      if (!keys[idx]) return;

      keys[idx].usedLines += msg.lines;

      chrome.storage.local.set({ geminiKeys: keys }, () => {
        renderKeysUI(keys, idx);
updateApiUsageDisplay();
sendResponse({ ok:true });
      });
    });

    return true;
  }
});

const addKeyPanel = document.getElementById("addKeyPanel");
const newKeyInput = document.getElementById("newKeyInput");

document.getElementById("addKeyBtn").addEventListener("click", () => {
  addKeyPanel.style.display = "block";
  newKeyInput.focus();
});
document.getElementById("saveNewKeyBtn").addEventListener("click", () => {

  const newKey = newKeyInput.value.trim();
  if (!newKey) return;

  chrome.storage.local.get(["geminiKeys"], (res) => {

    const arr = res.geminiKeys || [];

    arr.push({
      key: newKey,
      usedLines: 0
    });

    chrome.storage.local.set({ geminiKeys: arr }, () => {

      newKeyInput.value = "";
      addKeyPanel.style.display = "none";

      renderKeysUI(arr, arr.length - 1);
      updateApiUsageDisplay();
    });
  });

});

document.getElementById("deleteKeysBtn").addEventListener("click", () => {

  chrome.storage.local.get(["geminiKeys","activeIndex"], (res) => {

    let keys = res.geminiKeys || [];
    let idx  = res.activeIndex ?? 0;

    // collect selected checkboxes
    const selected = Array.from(
      document.querySelectorAll(".keySelect:checked")
    ).map(cb => Number(cb.dataset.index));

    if (!selected.length) {
      alert("Select at least one key to delete.");
      return;
    }

    // filter out deleted keys
    keys = keys.filter((_, i) => !selected.includes(i));

    // fix active index
    if (idx >= keys.length) idx = keys.length - 1;
    if (idx < 0) idx = 0;

    chrome.storage.local.set({
      geminiKeys: keys,
      activeIndex: idx
    }, () => {
      renderKeysUI(keys, idx);
      updateApiUsageDisplay();
    });

  });

});

// ===========================
// FIX RTL
// ===========================
document.getElementById("fixRTL").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true });

  chrome.storage.local.get(["geminiKeys","activeIndex"], ({ geminiKeys, activeIndex }) => {

  if (!geminiKeys || !geminiKeys.length)
    return alert("Please add at least one API key.");

  const currentKey = geminiKeys[activeIndex]?.key;
  if (!currentKey) return alert("Invalid active API key.");

  chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: advancedRTLFixerInsidePage,
  args: []   // ⬅️ no more key passed
});
});
});
// =====================================================================
//        INSIDE PAGE - ADVANCED RTL FIXER (FULL, FIXED, UNSHRUNK VERSION)
// =====================================================================
async function advancedRTLFixerInsidePage() {

  async function getNextKey() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "GET_NEXT_KEY" }, resolve);
    });
  }

  async function consumeLines(lines) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "CONSUME_LINES", lines }, resolve);
    });
  }

  // =========================
  // Step 1 - Collect RTL nodes
  // =========================
  const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF]/;
  const PUNC = /[()\[\]{};:,.!?'"״„\-\u05BE]/;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const t = node.nodeValue;
        if (!t) return NodeFilter.FILTER_REJECT;
        if (!RTL_RE.test(t)) return NodeFilter.FILTER_REJECT;
        if (!PUNC.test(t)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  let x;
  while ((x = walker.nextNode())) nodes.push(x);

  if (!nodes.length) {
    alert("No RTL text containing punctuation found.");
    return;
  }

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const shorten = (txt, max = 120) => {
    txt = txt.replace(/\s+/g, " ").trim();
    if (txt.length <= max) return txt;
    return txt.slice(0, max - 3) + "...";
  };

  // =========================
  // Step 2 - UI Overlay
  // =========================
  const overlay = document.createElement("div");
  overlay.id = "ai-rtl-overlay";
  overlay.innerHTML = `
    <div class="ai-blur"></div>

    <div class="ai-panel-wrapper">
      <div class="ai-panel">

        <div class="ai-header">
          <div class="ai-dot d1"></div>
          <div class="ai-dot d2"></div>
          <div class="ai-dot d3"></div>
          <span class="ai-title">Fixing RTL punctuation</span>
        </div>

        <div class="ai-core">
          <div class="ai-line-main" id="ai-line-main">Preparing AI engine</div>
          <div class="ai-line-sub" id="ai-line-sub"></div>

          <div class="ai-progress-bar">
            <div class="ai-progress-fill" id="ai-fill"></div>
          </div>

          <div class="ai-percent-row">
            <span id="ai-percent">0%</span>
          </div>
        </div>

        <div id="ai-status" class="ai-status">
          Analyzing & fixing
        </div>

      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
#ai-rtl-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999999999;
  pointer-events: none;
  font-family: system-ui, sans-serif;
}

.ai-blur {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
}

.ai-panel-wrapper {
  position: relative;
  background: #05070c;
  padding: 18px;
  border-radius: 26px;
  box-shadow: 0 24px 70px rgba(0,0,0,0.7);
}

.ai-panel {
  background: #0b0e16;
  border-radius: 20px;
  padding: 22px 26px;
  width: 460px;
  border: 1px solid rgba(255,255,255,0.1);
  pointer-events: auto;
}

.ai-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.ai-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: #60a5fa;
  opacity: 0.6;
  animation: pulseDot 1.4s infinite;
}
.d2 { animation-delay: .18s; }
.d3 { animation-delay: .36s; }

@keyframes pulseDot {
  0%,100% { transform: scale(1); opacity: .55; }
  50%     { transform: scale(1.6); opacity: 1; }
}

.ai-title {
  font-size: 15px;
  font-weight: 600;
  color: #e5e7eb;
}

.ai-core {
  background: #050814;
  border-radius: 14px;
  padding: 16px;
  border: 1px solid rgba(148,163,184,0.35);
}

.ai-line-main {
  min-height: 22px;
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
  text-align: center;
  opacity: 0;
  transform: translateY(5px);
  transition: all .25s ease;
}

.ai-line-sub {
  min-height: 18px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  opacity: 0;
  transform: translateY(5px);
  transition: all .25s ease;
}

.ai-line-visible {
  opacity: 1 !important;
  transform: translateY(0) !important;
}

.ai-progress-bar {
  margin-top: 14px;
  height: 10px;
  background: #111827;
  border-radius: 999px;
  overflow: hidden;
}

.ai-progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg,#22c55e,#3b82f6,#8b5cf6,#ec4899);
  transition: width .18s ease-out;
}

.ai-percent-row {
  margin-top: 6px;
  display: flex;
  justify-content: center;
  font-size: 13px;
  color: #e5e7eb;
}

.ai-status {
  margin-top: 12px;
  font-size: 13px;
  text-align: center;
  color: #9ca3af;
}
`;

  document.body.appendChild(style);
  document.body.appendChild(overlay);

  // UI references
  const fillEl = document.getElementById("ai-fill");
  const percentEl = document.getElementById("ai-percent");
  const lineMainEl = document.getElementById("ai-line-main");
  const lineSubEl = document.getElementById("ai-line-sub");
  const statusEl = document.getElementById("ai-status");

  async function showNarration(main, sub) {
    lineMainEl.classList.remove("ai-line-visible");
    lineSubEl.classList.remove("ai-line-visible");
    await delay(140);
    lineMainEl.textContent = main || "";
    lineSubEl.textContent = sub || "";
    if (main) lineMainEl.classList.add("ai-line-visible");
    if (sub) lineSubEl.classList.add("ai-line-visible");
  }

  await showNarration("Contacting AI model", "Preparing chunk requests");

  // =========================
  // Step 3 - CHUNKING SYSTEM
  // =========================
  const CHUNK_SIZE = 40;

  // Take a safe snapshot of all text nodes
  const lines = nodes.map(n => ({
    node: n,
    text: n.nodeValue
  }));

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  const nodeChunks = chunkArray(lines, CHUNK_SIZE);

  try {
    chrome.runtime?.sendMessage({
      type: "RTL_USAGE",
      chunks: nodeChunks.length,
      lines: lines.length
    });
  } catch(e){}

  const correctedGlobal = new Array(lines.length);

  // Helper: force each text node into ONE AI line
  function oneLine(txt) {
  return txt.replace(/\r?\n/g, " <<NEWLINE>> ");
}

  async function processChunk(chunkIndex, chunkNodes) {
    const startIndex = chunkIndex * CHUNK_SIZE;

    let blockChunk = "";
    chunkNodes.forEach((item, i) => {
      blockChunk += `LINE_${startIndex + i}: ${oneLine(item.text)}\n`;
    });

    const prompt = `
You are an expert multilingual punctuation engine.

SUPPORTED LANGUAGES:
Hebrew, Arabic, English, French, Spanish, German, Russian, Greek, Hindi,
Tamil, Chinese, Japanese, Korean - and ANY other language.

GLOBAL RULES (CRITICAL):
- DO NOT add or remove ANY spaces.
- DO NOT rewrite, translate, or reorder words.
- DO NOT merge or split words.
- ONLY modify punctuation characters, NEVER letters or digits.
- Preserve whitespace EXACTLY.

BRACKET RULES:
ROUND: 
- Fix )x( → (x)
- Leave (x) unchanged.

SQUARE:
- If [x] is correct → do NOT modify it.
- If ]x[ → fix to [x]
- NEVER convert [x] → ]x[
- Preserve all spacing inside/outside brackets.

CURLY:
- Fix }x{ → {x}
- Leave {x} unchanged.

MULTILINGUAL PUNCTUATION RULES:
- Fix duplicated punctuation: .. → . , , → , !! → ! ?? → ?
- Fix punctuation ordering around brackets for ALL LANGUAGES.
- Respect RTL rules for Hebrew/Arabic.
- Respect LTR rules for European languages.
- Respect East Asian punctuation positioning (。、？！).

DO NOT CHANGE ANY SPACES.

Return lines in EXACT format:
LINE_k: corrected text

LINES:
${blockChunk}
`;

    await showNarration(
      `Processing chunk ${chunkIndex + 1}/${nodeChunks.length}`,
      `Sending ${chunkNodes.length} lines to Gemini`
    );

    const keyInfo = await getNextKey();
    if (!keyInfo || !keyInfo.key) {
      alert("All API keys are exhausted.");
      throw new Error("NO_KEYS_LEFT");
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + keyInfo.key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    await consumeLines(chunkNodes.length);

    const json = await response.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    raw.split("\n").forEach(line => {
      const m = line.match(/^LINE_(\d+):\s*(.*)$/);
      if (!m) return;

      const idx = Number(m[1]);
      let text = m[2];

      if (typeof text === "string" && text.length > 0) {
        correctedGlobal[idx] = text.replace(/ *<<NEWLINE>> */g, "\n");
      }
    });
  }

  try {
    for (let c = 0; c < nodeChunks.length; c++) {
      await processChunk(c, nodeChunks[c]);
    }
  } catch (e) {
    if (e.message === "NO_KEYS_LEFT") {
      alert("Processing stopped — all API keys reached limit.");
    } else {
      console.error(e);
    }
  }

  // FINAL SANITY BACKUP: prevent any deletion
  for (let i = 0; i < lines.length; i++) {
    if (
      typeof correctedGlobal[i] !== "string" ||
      correctedGlobal[i].trim().length === 0
    ) {
      correctedGlobal[i] = lines[i].text;
    }
  }

  // =========================
  // Step 4 - Apply fixes per-line
  // =========================
  const totalLines = lines.length;
  statusEl.textContent = "Applying corrections";

  for (let i = 0; i < totalLines; i++) {
    const node = lines[i].node;
    const before = node.nodeValue;
    const after = correctedGlobal[i];

    await showNarration(
      `Fixing line ${i + 1} of ${totalLines}`,
      `Original: ${shorten(before)}`
    );

    node.nodeValue = after;

    const pct = Math.round(((i + 1) / totalLines) * 100);
    fillEl.style.width = pct + "%";
    percentEl.textContent = pct + "%";

    await delay(70);
  }

  // =========================
  // Step 5 - Final UI
  // =========================
  await showNarration(
    "Completed - all lines processed.",
    "All RTL punctuation successfully corrected."
  );

  fillEl.style.width = "100%";
  percentEl.textContent = "100%";
  statusEl.textContent = "Finalized - punctuation fixed.";

  await delay(900);
  overlay.remove();
  style.remove();
}
