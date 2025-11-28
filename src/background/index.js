import { encryptAndSave } from '../utils/vault.js';

// Track which tabs are currently being monitored
const attachedTabs = new Set();

// 1. LISTEN FOR COMMANDS FROM POPUP
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ACTIVATE_AEGIS") {
    const tabId = request.tabId;
    attachDebugger(tabId);
    sendResponse({ status: "attempting_attach" });
  }
  return true;
});

// 2. DEBUGGER ATTACHMENT LOGIC
function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;

  chrome.debugger.attach({ tabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("[Aegis] Attach failed:", chrome.runtime.lastError.message);
      return;
    }

    attachedTabs.add(tabId);
    
    // Enable Network domain to see WebSockets
    chrome.debugger.sendCommand({ tabId }, "Network.enable");
    
    // Visual indicator that Aegis is active
    chrome.action.setBadgeText({ tabId, text: "REC" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" }); // Red for recording
    
    console.log(`[Aegis] Secure Tunnel Established on Tab ${tabId}`);
  });
}

// 3. EVENT LISTENER (THE INTERCEPTOR)
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  // We only care about incoming WebSocket frames
  if (method === "Network.webSocketFrameReceived") {
    const payload = params.response.payloadData;
    const tabId = source.tabId;
    
    // Filter empty keep-alive packets
    if (!payload || payload.length < 5) return;

    try {
      // Capture context
      const tab = await chrome.tabs.get(tabId);
      
      // FIRE AND FORGET: Encrypt and store immediately
      // This happens continuously as the AI streams tokens
      await encryptAndSave(payload, tab.url, tabId);
      
    } catch (err) {
      console.error("[Aegis] Capture Error:", err);
    }
  }
});

// Cleanup on detach
chrome.debugger.onDetach.addListener((source) => {
  attachedTabs.delete(source.tabId);
  chrome.action.setBadgeText({ tabId: source.tabId, text: "" });
});