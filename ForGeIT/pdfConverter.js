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
    convertBtn.disabled=!pdfFile;
});

downloadBtn.addEventListener('click', ()=>{
    if(!lastGeneratedHTML) return;
    const blob=new Blob([lastGeneratedHTML],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=(pdfFile?pdfFile.name.replace(/\.pdf$/i,''):'converted')+'.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

function log(...args){logEl.innerText=args.join(' ')+'\n'+logEl.innerText;console.log(...args);}

convertBtn.addEventListener('click', async ()=>{
    if(!pdfFile) return;
    convertBtn.disabled=true;
    downloadBtn.disabled=true;
    log('Starting conversion...');
    progressContainer.style.display='block';
    progressBar.style.width='0%';

    try{
        lastGeneratedHTML = await convertPdfToHtml(pdfFile,{includePageImageFallback:renderFallbackCheckbox.checked});
        downloadBtn.disabled=false;
        log('Conversion complete. Click "Download HTML".');
    }catch(err){
        log('Error:',err.message||err);
        console.error(err);
    }finally{convertBtn.disabled=false;}
});

async function convertPdfToHtml(file,opts={}) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
    const numPages = pdf.numPages;
    log('Pages:',numPages);

    let html = `<h1>${escapeHtml(file.name)}</h1>\n`;

    for(let p=1;p<=numPages;p++){
        progressBar.style.width = Math.round((p/numPages)*100)+'%';
        log(`Processing page ${p}/${numPages}...`);

        const page = await pdf.getPage(p);
        const viewport = page.getViewport({scale:2.0});

        // Render fallback image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({canvasContext:ctx,viewport}).promise;
        const pageImg = canvas.toDataURL('image/png');

        // Extract text
        const textContent = await page.getTextContent();
        const lines = buildLines(textContent.items);
        const medianFont = median(lines.map(l=>l.avgFontSize).filter(Boolean)) || 10;
        const blocks = groupLinesToBlocks(lines);

        // Multi-column: sort lines left-to-right
        blocks.forEach(b=>b.lines.sort((a,b)=>a.xMin-b.xMin));

        for(const block of blocks){
            const fontFactor = (block.avgFontSize||medianFont)/(medianFont||1);
            const isSmall = (block.avgFontSize||0)<medianFont*0.85;
            const text = escapeHtml(block.text.trim());
            if(!text) continue;

            // Dynamic heading levels
            if(fontFactor >= 1.6) html += `<h1>${text}</h1>\n`;
            else if(fontFactor >= 1.3) html += `<h2>${text}</h2>\n`;
            else if(fontFactor >= 1.1) html += `<h3>${text}</h3>\n`;
            else if(isSmall && /^\d+[\.\)]/.test(text)) html += `<p class="footnotes">${text}</p>\n`;
            else html += `<p>${text}</p>\n`;
        }

        if(opts.includePageImageFallback){
            html += `<img class="page-image" src="${pageImg}" alt="Page ${p} image">\n`;
        }
    }

    return html; // only body content
}

// --- Helpers ---
function escapeHtml(s){return s?s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'):"";}
function median(arr){if(!arr||!arr.length)return null;const a=Array.from(arr).sort((x,y)=>x-y);const mid=Math.floor(a.length/2);return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;}
function buildLines(items){
    const lines=[]; const tol=4;
    for(const it of items){
        const tx=it.transform?it.transform[4]:(it.x||0);
        const ty=it.transform?it.transform[5]:(it.y||0);
        const fontSize = Math.hypot(it.transform[0],it.transform[1])||10;
        const str = it.str||'';
        if(!str) continue;
        let found=null;
        for(const l of lines){if(Math.abs(l.y-ty)<=tol){found=l;break;}}
        if(!found){found={y:ty,lines:[it],xMin:tx,xMax:tx,text:'',fontSizes:[fontSize],avgFontSize:fontSize}; lines.push(found);}
        else {found.lines.push(it); found.fontSizes.push(fontSize); found.xMin=Math.min(found.xMin,tx); found.xMax=Math.max(found.xMax,tx);}
    }
    lines.sort((a,b)=>b.y-a.y);
    lines.forEach(l=>{l.text=l.lines.map(i=>i.str).join(' ').trim(); l.avgFontSize=median(l.fontSizes)||10; l.xMin=l.xMin||0; l.xMax=l.xMax||0;});
    return lines;
}

function groupLinesToBlocks(lines){
    const blocks=[]; if(!lines.length) return blocks;
    let current={lines:[],text:'',avgFontSize:0,lineCount:0,avgY:0,xMin:Infinity};
    for(let i=0;i<lines.length;i++){
        const line=lines[i];
        if(current.lineCount===0){current.lines.push(line);current.lineCount=1;current.avgFontSize=line.avgFontSize;current.avgY=line.y;current.xMin=line.xMin;}
        else{
            const prev = lines[i-1];
            const gap = Math.abs(prev.y - line.y);
            const threshold = Math.max(12,current.avgFontSize*2.2);
            if(gap>threshold){
                current.text = current.lines.map(l=>l.text).join('\n').trim(); blocks.push(current);
                current = {lines:[line],text:'',avgFontSize:line.avgFontSize,lineCount:1,avgY:line.y,xMin:line.xMin};
            } else {
                current.lines.push(line);
                current.lineCount++;
                current.avgFontSize = (current.avgFontSize*(current.lineCount-1)+line.avgFontSize)/current.lineCount;
                current.avgY = (current.avgY*(current.lineCount-1)+line.y)/current.lineCount;
                current.xMin = Math.min(current.xMin,line.xMin);
            }
        }
    }
    if(current.lineCount){current.text=current.lines.map(l=>l.text).join('\n').trim(); blocks.push(current);}
    return blocks;
}
