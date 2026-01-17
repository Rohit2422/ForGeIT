const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const renderFallbackCheckbox = document.getElementById('renderFallback');
const logEl = document.getElementById('log');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

let lastGeneratedHTML = null;
let pdfFile = null;

fileInput.addEventListener('change', e=>{
    pdfFile = e.target.files[0]||null;
    convertBtn.disabled = !pdfFile;
});

downloadBtn.addEventListener('click', ()=>{
    if(!lastGeneratedHTML) return;
    const blob = new Blob([lastGeneratedHTML], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (pdfFile ? pdfFile.name.replace(/\.pdf$/i,'') : 'converted') + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

function log(...args){
    logEl.innerText = args.join(' ') + '\n' + logEl.innerText;
    console.log(...args);
}

convertBtn.addEventListener('click', async ()=>{
    if(!pdfFile) return;
    convertBtn.disabled = true;
    downloadBtn.disabled = true;
    log('Starting conversion...');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';

    try {
        lastGeneratedHTML = await convertPdfToHtml(pdfFile, {
            includePageImageFallback: renderFallbackCheckbox.checked
        });
        downloadBtn.disabled = false;
        log('Conversion complete. Click "Download HTML".');
    } catch(err){
        log('Error:', err.message || err);
        console.error(err);
    } finally {
        convertBtn.disabled = false;
    }
});

/* ============================================================
   MAIN CONVERTER — HYBRID PDF.JS + AI
   (Same workflow as your original — just upgraded)
============================================================ */

async function convertPdfToHtml(file, opts = {}) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    log('Pages:', numPages);

    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(file.name)}</title>
<style>
body{font-family:Arial, sans-serif; line-height:1.6; margin:40px;}
hr{margin:40px 0; border:0; border-top:1px solid #ddd;}
h1,h2,h3,h4,h5,h6{margin-top:1em;}
p{margin:0.5em 0;}
ul,ol{margin:0.6em 0 0.6em 24px;}
table{border-collapse:collapse; width:100%; margin:12px 0;}
th,td{border:1px solid #ccc; padding:6px;}
img{max-width:100%; margin-top:20px; opacity:0.7;}
</style>
</head>
<body>
<h1>${escapeHtml(file.name)}</h1>
`;

    for(let p = 1; p <= numPages; p++){
        progressBar.style.width = Math.round((p/numPages)*100) + '%';
        log(`Processing page ${p}/${numPages}...`);

        const page = await pdf.getPage(p);
        const viewport = page.getViewport({scale: 2.0});

        // --- Your original image fallback (kept) ---
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({canvasContext: ctx, viewport}).promise;
        const pageImg = canvas.toDataURL('image/png');

        // --- Extract structured text (your pipeline) ---
        const textContent = await page.getTextContent();
        let lines = buildLines(textContent.items);

        // Remove stray page numbers / markers
        lines = lines.filter(l => !isPageMarker(l.text));

        // Detect real tables
        const tableRows = detectRealTable(lines);

        // Group into blocks (your logic)
        const blocks = groupLinesToBlocks(lines);
        blocks.forEach(b => b.lines.sort((a,b) => a.xMin - b.xMin));

        // --- Send structured data to AI for cleanup ---
        const aiInput = {
            page: p,
            blocks: blocks.map(b => ({
                text: b.text,
                xMin: b.xMin,
                avgFontSize: b.avgFontSize
            })),
            hasTable: !!tableRows
        };

        const aiHtml = await callAI(aiInput);
        html += aiHtml;

        // --- Render table if detected ---
        if(tableRows){
            html += renderTableHTML(tableRows);
        }

        // --- Page image fallback ---
        if(opts.includePageImageFallback){
            html += `<img src="${pageImg}" alt="Page ${p} image">`;
        }

        // Page separator (no divs)
        html += `<hr>\n`;
    }

    html += `</body></html>`;
    return html;
}

/* ============================================================
   YOUR ORIGINAL HELPERS (KEPT)
============================================================ */

function escapeHtml(s){
    return s
      ? s.replaceAll('&','&amp;')
           .replaceAll('<','&lt;')
           .replaceAll('>','&gt;')
      : "";
}

function median(arr){
    if(!arr || !arr.length) return null;
    const a = Array.from(arr).sort((x,y)=>x-y);
    const mid = Math.floor(a.length/2);
    return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
}

function buildLines(items){
    const lines = [];
    const tol = 4;

    for(const it of items){
        const tx = it.transform ? it.transform[4] : (it.x || 0);
        const ty = it.transform ? it.transform[5] : (it.y || 0);
        const fontSize = Math.hypot(it.transform[0], it.transform[1]) || 10;
        const str = it.str || '';
        if(!str) continue;

        let found = null;
        for(const l of lines){
            if(Math.abs(l.y - ty) <= tol){
                found = l;
                break;
            }
        }

        if(!found){
            found = {
                y: ty,
                lines: [it],
                xMin: tx,
                xMax: tx,
                text: '',
                fontSizes: [fontSize],
                avgFontSize: fontSize
            };
            lines.push(found);
        } else {
            found.lines.push(it);
            found.fontSizes.push(fontSize);
            found.xMin = Math.min(found.xMin, tx);
            found.xMax = Math.max(found.xMax, tx);
        }
    }

    lines.sort((a,b) => b.y - a.y);

    lines.forEach(l => {
        l.text = l.lines.map(i => i.str).join(' ').trim();
        l.avgFontSize = median(l.fontSizes) || 10;
    });

    return lines;
}

function groupLinesToBlocks(lines){
    const blocks = [];
    if(!lines.length) return blocks;

    let current = {
        lines: [],
        text: '',
        avgFontSize: 0,
        lineCount: 0,
        avgY: 0,
        xMin: Infinity
    };

    for(let i=0; i<lines.length; i++){
        const line = lines[i];

        if(current.lineCount === 0){
            current.lines.push(line);
            current.lineCount = 1;
            current.avgFontSize = line.avgFontSize;
            current.avgY = line.y;
            current.xMin = line.xMin;
        } else {
            const prev = lines[i-1];
            const gap = Math.abs(prev.y - line.y);
            const threshold = Math.max(12, current.avgFontSize * 2.2);

            if(gap > threshold){
                current.text = current.lines.map(l => l.text).join('\n').trim();
                blocks.push(current);

                current = {
                    lines: [line],
                    text: '',
                    avgFontSize: line.avgFontSize,
                    lineCount: 1,
                    avgY: line.y,
                    xMin: line.xMin
                };
            } else {
                current.lines.push(line);
                current.lineCount++;
                current.avgFontSize =
                    (current.avgFontSize * (current.lineCount - 1) + line.avgFontSize)
                    / current.lineCount;
                current.avgY =
                    (current.avgY * (current.lineCount - 1) + line.y)
                    / current.lineCount;
                current.xMin = Math.min(current.xMin, line.xMin);
            }
        }
    }

    if(current.lineCount){
        current.text = current.lines.map(l => l.text).join('\n').trim();
        blocks.push(current);
    }

    return blocks;
}

/* ============================================================
   STRICT HELPERS (UPGRADED)
============================================================ */

function isPageMarker(text){
    const t = text.trim();
    return /^[\divxlcdm\s]+$/i.test(t) && !/[a-z]/i.test(t);
}

/* ---- Better Auto Hyperlinks ---- */
function autoLink(text){
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

    return text
      .replace(urlRegex, url => {
        const href = url.startsWith('http') ? url : 'https://' + url;
        return `<a href="${href}">${url}</a>`;
      })
      .replace(emailRegex, email => `<a href="mailto:${email}">${email}</a>`);
}

/* ---- Stronger Table Detection ---- */
function detectRealTable(lines){
    if(lines.length < 4) return null;

    const rows = [];
    const rowTol = 6;

    lines.forEach(line=>{
        let found = rows.find(r => Math.abs(r.y - line.y) <= rowTol);
        if(!found){
            rows.push({y: line.y, cells: [line]});
        } else {
            found.cells.push(line);
        }
    });

    const validRows = rows.filter(r => r.cells.length >= 2);
    if(validRows.length < 3) return null;

    const colCounts = validRows.map(r => r.cells.length);
    const modeCount = mostFrequent(colCounts);

    if(colCounts.filter(c => c === modeCount).length < validRows.length * 0.7){
        return null;
    }

    return validRows.sort((a,b) => b.y - a.y);
}

function mostFrequent(arr){
    const map = {};
    let max = 0, res = arr[0];
    for(const n of arr){
        map[n] = (map[n] || 0) + 1;
        if(map[n] > max){
            max = map[n];
            res = n;
        }
    }
    return res;
}

function renderTableHTML(rows){
    let table = "<table>\n";

    rows.forEach((row,i) => {
        table += "<tr>";
        row.cells.sort((a,b) => a.xMin - b.xMin);

        row.cells.forEach(cell => {
            const text = escapeHtml(cell.text);
            table += i === 0 ? `<th>${text}</th>` : `<td>${text}</td>`;
        });

        table += "</tr>\n";
    });

    table += "</table>\n";
    return table;
}

/* ============================================================
   AI CLEANUP STEP — PLUG YOUR MODEL HERE
============================================================ */

async function callAI(structuredData){
    const prompt = `
You are a perfect PDF-to-HTML formatter.

RULES:
- Use ONLY: h1,h2,h3,p,ul,ol,li,table,tr,th,td,a,img,hr,strong.
- NO divs, NO spans, NO classes, NO inline styles.
- Fix ALL broken words (e.g., "independen t" → "independent").
- Fix ALL hyphen line breaks ("over - the - counter" → "over-the-counter").
- Reconstruct broken URLs into full working links.
- Convert "CONTENTS" into a real <ol> list.
- Convert Q&A sections into:
   <h3>Qx.x Question</h3>
   <p><strong>Ax.x:</strong> Answer text</p>
- Detect real tables and convert them to proper HTML tables.
- Preserve meaning exactly.

Structured content:
${JSON.stringify(structuredData, null, 2)}
    `;

    // === YOU PLUG YOUR REAL AI API HERE ===
    /*
    const res = await fetch("YOUR_AI_ENDPOINT", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({prompt})
    });
    const data = await res.json();
    return data.html;
    */

    // Temporary fallback if no AI is connected yet
    let fallback = "";
    structuredData.blocks.forEach(b => {
        let text = escapeHtml(b.text.trim());
        text = autoLink(text);
        fallback += `<p>${text}</p>\n`;
    });
    return fallback;
}
