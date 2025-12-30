// ========================================
// Listen for popup request
// ========================================
chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === "START_RTL_AI_FIX") {

        // Inject the AI fixer engine (aiFixerEngine.js) into the webpage
        const s = document.createElement("script");
        s.src = chrome.runtime.getURL("aiFixerEngine.js");
        s.onload = () => {
            // After script loads, trigger the fixer
            window.postMessage({
                type: "RUN_AI_RTL_FIX",
                apiKey: msg.apiKey
            }, "*");

            s.remove();
        };
        document.documentElement.appendChild(s);
    }
});
