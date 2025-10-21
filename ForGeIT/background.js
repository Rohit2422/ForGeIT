let frame = 0;
const frames = [
"icons/frame1.png",
"icons/frame2.png",
"icons/frame3.png",
"icons/frame4.png",
"icons/frame5.png",
"icons/frame6.png",
"icons/frame7.png",
"icons/frame8.png",
"icons/frame9.png",
"icons/frame10.png",
"icons/frame11.png",
"icons/frame12.png",
"icons/frame13.png",
"icons/frame14.png",
"icons/frame15.png",
"icons/frame16.png",
"icons/frame17.png",
"icons/frame18.png",
"icons/frame19.png",
"icons/frame20.png",
"icons/frame21.png",
"icons/frame22.png",
"icons/frame23.png",
"icons/frame24.png",
"icons/frame25.png",
"icons/frame26.png",
"icons/frame27.png",
"icons/frame28.png",
"icons/frame29.png",
"icons/frame30.png",
"icons/frame31.png",
"icons/frame32.png"
];

function startAnimation() {
  const cycleDuration = 2000; // 2 seconds for one full loop
  const interval = cycleDuration / frames.length; // ~41.6 ms per frame
  setInterval(() => {
    chrome.action.setIcon({ path: frames[frame] });
    frame = (frame + 1) % frames.length;
  }, interval);
}
// Start animation when extension loads
startAnimation();
// Fires once when the extension is first installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log(" ForGeIT extension installed.");
});

// ===== IndexedDB Helpers to retrieve saved folder handle =====
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('image-folder-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
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

// ===== Unified message listener =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(" Message received in background:", message);

  // Request for saved image folder handle
  if (message.action === "getDirHandle") {
    getDirHandle()
      .then(handle => sendResponse(handle))
      .catch(() => sendResponse(null));
    return true; // Keep channel open for async sendResponse
  }

  // Simple log messages
  if (message.action === "log") {
    console.log("", message.data);
    sendResponse({ status: "received" });
  }

  // Trigger image conversion in the current tab
  if (message.action === "convertImages") {
    if (!sender.tab?.id) {
      console.warn("No active tab to run conversion.");
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        // This will run inside the page context
        console.log(" Convert images to Base64 function called from background.");
        // You can directly call the function in your content script if it's injected
      }
    });
  }
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "downloadFiles") {
    const files = msg.files || [];
    if (!files.length) return;

    if (files.length > 5) {
      // Load JSZip dynamically
      const script = document.createElement("script");
      script.src = "jszip.min.js";
      script.onload = async () => {
        const zip = new JSZip();
        for (const f of files) {
          try {
            const blob = await fetch(f.url).then(r => r.blob());
            zip.file(f.name, blob);
          } catch (e) {
            console.warn("Failed to fetch:", f.url);
          }
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const blobUrl = URL.createObjectURL(blob);
        chrome.downloads.download({
          url: blobUrl,
          filename: "downloaded_files.zip"
        });
      };
      document.body.appendChild(script);
    } else {
      for (const f of files) {
        chrome.downloads.download({
          url: f.url,
          filename: f.name,
          conflictAction: "uniquify"
        });
      }
    }
  }
});