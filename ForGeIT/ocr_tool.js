// === Suppress all runtime errors & unhandled rejections ===
window.onerror = function(message, source, lineno, colno, error) {
  return true; // stops Chrome from logging the error
};

window.addEventListener("unhandledrejection", function(event) {
  event.preventDefault(); // stops unhandled promise rejections from logging
});

// Optional: silence console.error too (comment out if you still want logs)
console.error = () => {};
/* ocr_tool.js — cleaned and fixed
   Dependencies: pdf.js (pdfjsLib must be available globally)
*/

/* ----------------------------
   Configuration
   ---------------------------- */
const OCR_API_URL = "https://api.get-text-from-image.work/api/ocr"; // keep as-is or change to your OCR endpoint
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome?.runtime?.getURL
  ? chrome.runtime.getURL("pdf.worker.js")
  : "pdf.worker.js";

/* ----------------------------
   DOM Elements
   ---------------------------- */
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const pasteBtn = document.getElementById("pasteBtn");
const convertBtn = document.getElementById("convertBtn");
const resultBox = document.getElementById("result");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

const imageCanvas = document.getElementById("imageCanvas");
const ctx = imageCanvas.getContext("2d");

const pdfInput = document.getElementById("pdfInput");
const uploadPdfBtn = document.getElementById("uploadPdfBtn");
const pdfNav = document.getElementById("pdfNav");
const prevSmall = document.getElementById("prevSmall");
const nextSmall = document.getElementById("nextSmall");
const pdfPageIndicator = document.getElementById("pdfPageIndicator");

const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

/* ----------------------------
   State variables
   ---------------------------- */
let selectedFile = null;   // File to send to OCR (updated after crop or PDF render)
let imgObj = null;         // Image object used as the drawn content on canvas
let undoStack = [];
let redoStack = [];

/* Crop state */
let crop = { x: 0, y: 0, w: 0, h: 0 };
let isDrawing = false, isMoving = false, isResizing = false;
let resizeDir = null;
let dragOffset = { x: 0, y: 0 };
const handleSize = 8;

/* PDF state */
let pdfDoc = null;
let currentPage = 1;
function updateNavControls() {
  document.getElementById("prevSmall").style.opacity = currentPage === 1 ? "0.4" : "1";
  document.getElementById("nextSmall").style.opacity = currentPage === pdfDoc.numPages ? "0.4" : "1";
}
/* ----------------------------
   Utility: show/hide helpers
   ---------------------------- */
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

/* ----------------------------
   Uploads / Paste
   ---------------------------- */
uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (!e.target.files || !e.target.files[0]) return;
  const f = e.target.files[0];
  if (f.type.startsWith("image/")) {
    pdfDoc = null;
    currentPage = 1;
    renderImageFile(f);
  } else {
    alert("Please select an image file.");
  }
});

uploadPdfBtn.addEventListener("click", () => pdfInput.click());
pdfInput.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.type !== "application/pdf") return alert("Please select a PDF file.");
  selectedFile = null;
  await loadPdfFile(f);
});

pasteBtn.addEventListener("click", async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      for (const t of it.types) {
        if (t.startsWith("image/")) {
          const blob = await it.getType(t);
          const f = new File([blob], "clipboard.png", { type: blob.type });
          pdfDoc = null;
          renderImageFile(f);
          return;
        }
      }
    }
    alert("No image in clipboard.");
  } catch (err) {
    alert("Paste from clipboard not available in this environment.");
  }
});

/* ----------------------------
   Render uploaded image (non-PDF)
   ---------------------------- */
function renderImageFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      imgObj = img;
      // Set canvas size to the natural image dimensions but constrain width to max container width
      const maxWidth = 900; // large enough; CSS will scale down for display
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      imageCanvas.width = Math.round(img.width * scale);
      imageCanvas.height = Math.round(img.height * scale);
      // draw
      drawCanvas(true);
      // save selectedFile as the original file for OCR (unless cropped later)
      selectedFile = file;
      saveHistory(); // initial state
      hide(pdfNav);
      pdfDoc = null;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ----------------------------
   Load & render PDF (single-page render to same canvas)
   ---------------------------- */
async function loadPdfFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loading = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    pdfDoc = await loading.promise;
    if (!pdfDoc || !pdfDoc.numPages) throw new Error("Invalid PDF");
    currentPage = 1;
    await renderPdfPage(currentPage);
    if (pdfDoc.numPages > 1) show(pdfNav);
    else hide(pdfNav);
  } catch (err) {
    console.error(err);
    alert("Failed to load PDF: " + err.message);
  }
}

async function renderPdfPage(pageNum) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNum);
  // Choose a scale so page fits nicely in the canvas width
  const desiredWidth = 900; // logical canvas width
  const viewportUnscaled = page.getViewport({ scale: 1 });
  const scale = desiredWidth / viewportUnscaled.width;
  const viewport = page.getViewport({ scale });

  imageCanvas.width = Math.round(viewport.width);
  imageCanvas.height = Math.round(viewport.height);

  // render
  await page.render({ canvasContext: ctx, viewport }).promise;

  // create image object for crop tools and history
  const dataURL = imageCanvas.toDataURL("image/png");
  const img = new Image();
  img.onload = () => {
    imgObj = img;
    drawCanvas(true);
    // update selectedFile so OCR will send current page image if user doesn't crop
    dataURLToFile(dataURL, `page${pageNum}.png`).then(f => selectedFile = f);
    saveHistory(); // initial history entry for this page
  };
  img.src = dataURL;

  pageInput.value = pageNum;
  totalPages.textContent = pdfDoc.numPages;

  show(pdfNav);
}
function updateNavControls() {
  if (!pdfDoc) return;
  document.getElementById("prevSmall").style.opacity = currentPage === 1 ? "0.4" : "1";
  document.getElementById("nextSmall").style.opacity = currentPage === pdfDoc.numPages ? "0.4" : "1";
  document.getElementById("pageInput").value = currentPage;
  document.getElementById("totalPages").textContent = pdfDoc.numPages;
}

/* small helpers */
function dataURLToFile(dataurl, filename) {
  return fetch(dataurl).then(res => res.blob()).then(blob => new File([blob], filename, { type: blob.type }));
}

/* PDF nav events */
prevSmall.addEventListener("click", async () => {
  if (currentPage <= 1) return;
  currentPage--;
  await renderPdfPage(currentPage);
  updateNavControls();
});

nextSmall.addEventListener("click", async () => {
  if (currentPage >= pdfDoc.numPages) return;
  currentPage++;
  await renderPdfPage(currentPage);
  updateNavControls();
});

// Manual Page Jump
pageInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && pdfDoc) {
    const pageNum = parseInt(pageInput.value);
    if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
      currentPage = pageNum;
      await renderPdfPage(currentPage);
    } else {
      alert(`Please enter a page number between 1 and ${pdfDoc.numPages}`);
      pageInput.value = currentPage; // reset
    }
  }
});

/* ----------------------------
   Canvas drawing & cropping
   ---------------------------- */
function getMousePos(e) {
  const rect = imageCanvas.getBoundingClientRect();
  const scaleX = imageCanvas.width / rect.width;
  const scaleY = imageCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function insideCrop(pos) {
  return pos.x >= crop.x && pos.x <= crop.x + crop.w && pos.y >= crop.y && pos.y <= crop.y + crop.h;
}

function getResizeDir(pos) {
  const corners = [
    { x: crop.x, y: crop.y, dir: "tl" },
    { x: crop.x + crop.w, y: crop.y, dir: "tr" },
    { x: crop.x, y: crop.y + crop.h, dir: "bl" },
    { x: crop.x + crop.w, y: crop.y + crop.h, dir: "br" }
  ];
  for (let c of corners) if (Math.abs(pos.x - c.x) < handleSize && Math.abs(pos.y - c.y) < handleSize) return c.dir;

  const edges = [
    { x: crop.x + crop.w / 2, y: crop.y, dir: "t" },
    { x: crop.x + crop.w / 2, y: crop.y + crop.h, dir: "b" },
    { x: crop.x, y: crop.y + crop.h / 2, dir: "l" },
    { x: crop.x + crop.w, y: crop.y + crop.h / 2, dir: "r" }
  ];
  for (let e of edges) if (Math.abs(pos.x - e.x) < handleSize && Math.abs(pos.y - e.y) < handleSize) return e.dir;

  return null;
}

imageCanvas.addEventListener("mousedown", (e) => {
  if (!imgObj) return;
  const pos = getMousePos(e);
  const dir = getResizeDir(pos);
  if (dir) {
    isResizing = true; resizeDir = dir;
  } else if (insideCrop(pos)) {
    isMoving = true;
    dragOffset.x = pos.x - crop.x;
    dragOffset.y = pos.y - crop.y;
  } else {
    isDrawing = true;
    crop.x = pos.x; crop.y = pos.y; crop.w = 0; crop.h = 0;
  }
  drawCanvas();
});

imageCanvas.addEventListener("mousemove", (e) => {
  if (!imgObj) return;
  const pos = getMousePos(e);
  if (isDrawing) {
    crop.w = pos.x - crop.x; crop.h = pos.y - crop.y;
    drawCanvas();
  } else if (isMoving) {
    crop.x = pos.x - dragOffset.x; crop.y = pos.y - dragOffset.y;
    drawCanvas();
  } else if (isResizing) {
    if (resizeDir.includes("r")) crop.w = pos.x - crop.x;
    if (resizeDir.includes("b")) crop.h = pos.y - crop.y;
    if (resizeDir.includes("l")) { crop.w += crop.x - pos.x; crop.x = pos.x; }
    if (resizeDir.includes("t")) { crop.h += crop.y - pos.y; crop.y = pos.y; }
    drawCanvas();
  }
});

window.addEventListener("mouseup", () => {
  if (isDrawing || isMoving || isResizing) {
    isDrawing = isMoving = isResizing = false;
    resizeDir = null;
    saveHistory();
  }
});

/* drawCanvas: draws image and crop overlay */
function drawCanvas(skipClearHistory) {
  if (!imgObj) return;
  // draw background image sized to canvas
  ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  ctx.drawImage(imgObj, 0, 0, imageCanvas.width, imageCanvas.height);

  // draw crop overlay if present
  if (crop.w && crop.h) {
    ctx.save();
    ctx.strokeStyle = "red"; ctx.lineWidth = 2; ctx.setLineDash([6]);
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    ctx.setLineDash([]);
    // handles
    const points = [
      [crop.x, crop.y], [crop.x + crop.w, crop.y],
      [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h],
      [crop.x + crop.w / 2, crop.y], [crop.x + crop.w / 2, crop.y + crop.h],
      [crop.x, crop.y + crop.h / 2], [crop.x + crop.w, crop.y + crop.h / 2]
    ];
    ctx.fillStyle = "white"; ctx.strokeStyle = "red";
    for (let p of points) {
      ctx.fillRect(p[0] - handleSize/2, p[1] - handleSize/2, handleSize, handleSize);
      ctx.strokeRect(p[0] - handleSize/2, p[1] - handleSize/2, handleSize, handleSize);
    }
    ctx.restore();
  }
}

/* ----------------------------
   Keyboard: Crop apply (Enter), Undo/Redo
   ---------------------------- */
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && crop.w && crop.h && imgObj) {
    // Create a cropped canvas and replace imgObj + selectedFile
    const w = Math.abs(crop.w), h = Math.abs(crop.h);
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d");
    // copy from main canvas (accounts for scaling)
    tctx.drawImage(imageCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    tmp.toBlob(async (blob) => {
      const filename = selectedFile && selectedFile.name ? selectedFile.name : "cropped.png";
      selectedFile = new File([blob], filename, { type: blob.type || "image/png" });
      const newImg = new Image();
      newImg.onload = () => {
        imgObj = newImg;
        // resize main canvas to cropped content
        imageCanvas.width = newImg.width;
        imageCanvas.height = newImg.height;
        crop = { x:0, y:0, w:0, h:0 };
        drawCanvas();
        saveHistory();
      };
      newImg.src = URL.createObjectURL(blob);
    }, "image/png");
    return;
  }

  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
  }
});

/* ----------------------------
   History: Undo/Redo
   ---------------------------- */
function saveHistory() {
  if (!imgObj) return;
  try {
    // store current canvas dataURL
    undoStack.push(imageCanvas.toDataURL());
    // limit history size
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
  } catch (err) { console.warn("saveHistory failed:", err); }
}

function restoreFromDataURL(dataURL) {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => {
      imgObj = i;
      imageCanvas.width = i.width;
      imageCanvas.height = i.height;
      drawCanvas();
      resolve();
    };
    i.src = dataURL;
  });
}

function undo() {
  if (!undoStack.length) return;
  const current = imageCanvas.toDataURL();
  redoStack.push(current);
  const last = undoStack.pop();
  restoreFromDataURL(last).then(() => {
    // update selectedFile to match canvas snapshot
    dataURLToFile(last, "undo.png").then(f => selectedFile = f);
  });
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(imageCanvas.toDataURL());
  const data = redoStack.pop();
  restoreFromDataURL(data).then(() => {
    dataURLToFile(data, "redo.png").then(f => selectedFile = f);
  });
}

/* ----------------------------
   OCR Call (uses XHR for upload progress)
   ---------------------------- */
function updateProgress(val) {
  const p = Math.min(100, Math.max(0, Math.round(val)));
  progressBar.style.width = p + "%";
  progressText.textContent = p + "%";
}

async function convertImageToText(file) {
  if (!file) throw new Error("No file selected.");
  const formData = new FormData();
  formData.append("image", file);

  progressWrap.classList.remove("hidden");
  updateProgress(0);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", OCR_API_URL, true);
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // show partial progress for upload (0-60)
        updateProgress(Math.round(e.loaded / e.total * 60));
      }
    };

    xhr.onloadstart = () => updateProgress(10);
    xhr.onerror = () => {
      updateProgress(0);
      hide(progressWrap);
      reject(new Error("Network error"));
    };

    xhr.onload = () => {
      updateProgress(100);
      setTimeout(() => hide(progressWrap), 600);
      const res = xhr.response;
      if (!res) return reject(new Error("Invalid server response"));
      // server may return different keys; try common ones
      resolve(res.text || res.result || res.message || (typeof res === "string" ? res : "No text found."));
    };

    xhr.send(formData);
  });
}

/* Convert button */
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) { alert("Please upload or paste an image (or a PDF page) first."); return; }
  resultBox.value = "Processing...";
  try {
    const text = await convertImageToText(selectedFile);
    resultBox.value = text;
  } catch (err) {
    resultBox.value = `Error: ${err.message}`;
  }
});

/* Copy / Clear */
copyBtn.addEventListener("click", () => {
  if (!resultBox.value.trim()) return;
  navigator.clipboard.writeText(resultBox.value).then(() => alert("Copied to clipboard")).catch(() => alert("Copy failed"));
});

clearBtn.addEventListener("click", () => {
  fileInput.value = "";
  pdfInput.value = "";
  selectedFile = null;
  imgObj = null;
  pdfDoc = null;
  currentPage = 1;
  undoStack = []; redoStack = [];
  crop = { x:0, y:0, w:0, h:0 };
  resultBox.value = "";
  updateProgress(0);
  hide(progressWrap);
  hide(pdfNav);
  ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
  imageCanvas.style.display = "none";
});

/* When an image is rendered we display the canvas */
function ensureCanvasVisible() {
  imageCanvas.style.display = "block";
}

/* Ensure saveHistory called after image load/draw */
(function attachAutoShowAndHistory() {
  // intercept drawCanvas to show and save
  const origDraw = drawCanvas;
  drawCanvas = function(forceShow) {
    origDraw(forceShow);
    ensureCanvasVisible();
  };
})();
/* ----------------------------
   HTML Output Panel + Copy HTML
   ---------------------------- */
const htmlResult = document.getElementById("htmlResult");
const copyHtmlBtn = document.getElementById("copyHtmlBtn");

/* Helper: Convert plain text to <p> paragraphs */
function textToHtmlParagraphs(text) {
  if (!text) return "";
  return text
    .split(/\r?\n+/)               // split by new lines
    .map(line => line.trim())      // trim whitespace
    .filter(line => line.length)   // skip empty
    .map(line => `<p>${line}</p>`) // wrap each in <p>
    .join("\n");                   // keep readable
}

/* Update the HTML panel */
function updateHtmlPanel(text) {
  if (!htmlResult) return;
  const html = textToHtmlParagraphs(text);
  htmlResult.value = html;
}

/* Hook OCR completion */
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    alert("Please upload or paste an image (or a PDF page) first.");
    return;
  }
  resultBox.value = "Processing...";
  try {
    const text = await convertImageToText(selectedFile);
    resultBox.value = text;
    updateHtmlPanel(text); // update HTML view
  } catch (err) {
    resultBox.value = `Error: ${err.message}`;
    updateHtmlPanel("");
  }
});

/* Copy HTML button */
copyHtmlBtn.addEventListener("click", () => {
  const html = htmlResult.value.trim();
  if (!html) return alert("Nothing to copy.");
  navigator.clipboard.writeText(html)
    .then(() => alert("HTML copied to clipboard"))
    .catch(() => alert("Copy failed."));
});
