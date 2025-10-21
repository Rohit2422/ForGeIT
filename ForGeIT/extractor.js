const statusEl   = document.getElementById('status');
const fileInput  = document.getElementById('file');
const pasteBtn   = document.getElementById('pasteBtn');
const apiKeyEl   = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKey');

const previewDiv = document.getElementById('previewContent');
const codeBox    = document.getElementById('codeBox');
const copyCode   = document.getElementById('copyCode');
const copyPrev   = document.getElementById('copyPreview');

const DEFAULT_API_KEY = ""; // Optional: put your dev key here

// ===== Key storage helpers =====
async function getStoredKey() {
  try {
    if (chrome?.storage?.local) {
      return await new Promise(resolve => {
        chrome.storage.local.get(['GEMINI_API_KEY'], res => {
          resolve(res?.GEMINI_API_KEY || "");
        });
      });
    }
  } catch {}
  return localStorage.getItem('GEMINI_API_KEY') || DEFAULT_API_KEY || "";
}

async function setStoredKey(key) {
  try { chrome?.storage?.local?.set({ GEMINI_API_KEY: key }); } catch {}
  try { localStorage.setItem('GEMINI_API_KEY', key); } catch {}
}

// ===== Load stored key at startup =====
(async () => {
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['GEMINI_API_KEY'], (res) => {
        if (res?.GEMINI_API_KEY) {
          apiKeyEl.value = res.GEMINI_API_KEY;
        } else {
          const local = localStorage.getItem('GEMINI_API_KEY') || "";
          if (local) apiKeyEl.value = local;
          else if (DEFAULT_API_KEY) apiKeyEl.value = DEFAULT_API_KEY;
        }
      });
    } else {
      const local = localStorage.getItem('GEMINI_API_KEY') || "";
      if (local) apiKeyEl.value = local;
      else if (DEFAULT_API_KEY) apiKeyEl.value = DEFAULT_API_KEY;
    }
  } catch (e) {
    console.warn("Key load error", e);
    const local = localStorage.getItem('GEMINI_API_KEY') || "";
    if (local) apiKeyEl.value = local;
    else if (DEFAULT_API_KEY) apiKeyEl.value = DEFAULT_API_KEY;
  }
})();

// ===== Save key button =====
saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyEl.value.trim();
  if (!key) return setStatus('Please enter an API key.');
  await setStoredKey(key);
  setStatus('API key saved.');
});

// ===== File upload =====
fileInput.addEventListener('change', async () => {
  if (!fileInput.files?.length) return;
  await handleImage(fileInput.files[0]);
});

// ===== Paste from clipboard =====
pasteBtn.addEventListener('click', async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          await handleImage(blob);
          return;
        }
      }
    }
    setStatus('No image found in clipboard.');
  } catch (err) {
    setStatus('Clipboard read failed: ' + err.message);
  }
});

// ===== Copy HTML code =====
copyCode.addEventListener('click', async () => {
  const html = codeBox.value;
  if (!html.trim()) return;
  await navigator.clipboard.writeText(html);
  setStatus('HTML code copied.');
});

// ===== Copy Preview as rendered table =====
copyPrev.addEventListener('click', async () => {
  const html = previewDiv.innerHTML; // the rendered table HTML
  if (!html.trim()) return;

  const blob = new Blob([html], { type: "text/html" });
  const data = [new ClipboardItem({ "text/html": blob })];

  await navigator.clipboard.write(data);
  setStatus('Preview table copied as rich HTML.');
});

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function handleImage(fileOrBlob) {
  let apiKey = (apiKeyEl.value || "").trim();
  if (!apiKey) {
    apiKey = await getStoredKey();
    if (apiKey) apiKeyEl.value = apiKey;
  }
  if (!apiKey) {
    setStatus('Enter your Gemini API key first (then click Save Key).');
    return;
  }
  setStatus('Reading image');

  const { base64, mime } = await toBase64(fileOrBlob);

  setStatus('Asking Gemini to extract the table');
  try {
    const html = await callGemini(apiKey, base64, mime);

    const sanitized = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                          .replace(/on\w+="[^"]*"/gi, '');

    previewDiv.innerHTML = sanitized || '<div class="hint">No table returned.</div>';
    codeBox.value = sanitized || '';

    setStatus('Done.');
  } catch (err) {
    console.error(err);
    setStatus('Gemini error: ' + (err.message || 'unknown error'));
  }
}

function toBase64(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const [, meta, b64] = String(dataUrl).match(/^data:(.*?);base64,(.*)$/) || [];
      if (!b64) return reject(new Error('Could not read image.'));
      resolve({ base64: b64, mime: meta || 'image/png' });
    };
    reader.onerror = e => reject(e);
    reader.readAsDataURL(fileOrBlob);
  });
}

async function callGemini(apiKey, base64Data, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `You are given an image of a table. Return ONLY the clean HTML for that table.
Rules:
- Output strictly a single <table></table> element. No markdown, no backticks, no explanations.
- Reconstruct proper rows and columns; merge multi-line cells.
- Use <th> for header cells when appropriate.
- Add minimal borders (border="1", cellpadding="5", cellspacing="0", style="border-collapse: collapse; width: 100%;").
- Do NOT include any <script> or event handlers.`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}  ${text}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let text = parts.map(p => p.text || '').join('\n').trim();

  if (!text) throw new Error('Empty response from Gemini.');

  const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  const tableMatch = text.match(/<table[\s\S]*<\/table>/i);
  if (tableMatch) text = tableMatch[0].trim();

  return text;
}
