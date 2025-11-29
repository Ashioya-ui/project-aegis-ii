import { encryptAndSave } from '../utils/vault.js';

const attachedTabs = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ACTIVATE_AEGIS") {
    const tabId = request.tabId;
    attachDebugger(tabId);
    sendResponse({ status: "attempting_attach" });
  }
  return true;
});

function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;

  chrome.debugger.attach({ tabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.warn("[Aegis] Attach failed:", chrome.runtime.lastError.message);
      return;
    }

    attachedTabs.add(tabId);
    chrome.debugger.sendCommand({ tabId }, "Network.enable");
    
    chrome.action.setBadgeText({ tabId, text: "REC" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
    
    console.log(`[Aegis] Secure Tunnel Established on Tab ${tabId}`);
  });
}

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (method === "Network.webSocketFrameReceived") {
    const payload = params.response.payloadData;
    const tabId = source.tabId;
    
    // CHANGE 2: Noise Filter
    // Ignored packets < 5 chars (Keep-Alive/Ping) to save DB space
    if (!payload || payload.length < 5) return;

    try {
      // CHANGE 3: Tab Survival Check
      // Prevents crash if tab was closed mid-stream
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        await encryptAndSave(payload, tab.url, tabId);
      }
    } catch (err) {
      console.error("[Aegis] Capture Error:", err);
    }
  }
});

chrome.debugger.onDetach.addListener((source) => {
  attachedTabs.delete(source.tabId);
  chrome.action.setBadgeText({ tabId: source.tabId, text: "" });
});