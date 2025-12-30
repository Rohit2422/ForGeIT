// ===========================
// Load API Key
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["geminiKey"], (res) => {
    if (res.geminiKey) {
      document.getElementById("apiKey").value = res.geminiKey;
    }
  });
});

// ===========================
// Save API Key
// ===========================
document.getElementById("saveKey").addEventListener("click", () => {
  const key = document.getElementById("apiKey").value.trim();
  const msg = document.getElementById("saveMsg");

  chrome.storage.local.set({ geminiKey: key }, () => {
    
    // Show success text
    msg.textContent = "API key saved";
    msg.style.opacity = "1";

    // Hide after 2 seconds
    setTimeout(() => {
      msg.style.opacity = "0";
    }, 2000);
  });
});


// ===========================
// FIX RTL
// ===========================
document.getElementById("fixRTL").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true });

  chrome.storage.local.get(["geminiKey"], ({ geminiKey }) => {
    if (!geminiKey) return alert("Please save your API key first.");

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: advancedRTLFixerInsidePage,
      args: [geminiKey]
    });

    // 🔥 Close popup immediately after triggering the script
    window.close();
  });
});

// =====================================================================
//        INSIDE PAGE - ADVANCED RTL FIXER + C#-STYLE NARRATOR + CHUNKING
// =====================================================================
async function advancedRTLFixerInsidePage(apiKey) {

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

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
      out.push(arr.slice(i, i + size));
    return out;
  }

  const nodeChunks = chunkArray(nodes, CHUNK_SIZE);
  const correctedGlobal = new Array(nodes.length);

  async function processChunk(chunkIndex, chunkNodes) {
    const startIndex = chunkIndex * CHUNK_SIZE;

    let blockChunk = "";
    chunkNodes.forEach((node, i) => {
      blockChunk += `LINE_${startIndex + i}: ${node.nodeValue}\n`;
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

    let raw = "";

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      const json = await response.json();
      raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (e) {
      console.error("Chunk error:", e);
      return;
    }

    raw.split("\n").forEach(line => {
      const m = line.match(/^LINE_(\d+):\s*(.*)$/);
      if (!m) return;
      correctedGlobal[Number(m[1])] = m[2];
    });
  }

  // Process all chunks
  for (let c = 0; c < nodeChunks.length; c++) {
    await processChunk(c, nodeChunks[c]);
  }

  // =========================
  // Step 4 - Apply fixes per-line
  // =========================
  const totalLines = nodes.length;
  statusEl.textContent = "Applying corrections";

  for (let i = 0; i < totalLines; i++) {
    const before = nodes[i].nodeValue;
    const after = correctedGlobal[i] ?? before;

    await showNarration(
      `Fixing line ${i + 1} of ${totalLines}`,
      `Original: ${shorten(before)}`
    );

    // Punctuation-only change, spacing preserved by prompt
    nodes[i].nodeValue = after;

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