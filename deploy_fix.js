import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- THE UPDATED CODE BLOCK ---
const updates = {
  "src/utils/vault.js": `import { openDB } from 'idb';

const DB_NAME = 'AegisVault';
const STORE_NAME = 'secure_logs';
const KEY_STORAGE = 'aegis_master_key';

// CHANGE 1: Universal Crypto Helper
// Fixes "window is not defined" crash in Service Worker
const getCrypto = () => {
  if (typeof crypto !== 'undefined') return crypto;
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof self !== 'undefined' && self.crypto) return self.crypto;
  throw new Error("Cryptography API not available");
};

async function getMasterKey() {
  if (typeof chrome === 'undefined' || !chrome.storage) return null;

  const stored = await chrome.storage.local.get(KEY_STORAGE);
  const cryptoLib = getCrypto();
  
  if (stored[KEY_STORAGE]) {
    return cryptoLib.subtle.importKey(
      "jwk",
      stored[KEY_STORAGE],
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  } else {
    const key = await cryptoLib.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exported = await cryptoLib.subtle.exportKey("jwk", key);
    await chrome.storage.local.set({ [KEY_STORAGE]: exported });
    return key;
  }
}

export async function encryptAndSave(plainText, url, tabId) {
  try {
    const cryptoLib = getCrypto();
    const key = await getMasterKey();
    if (!key) throw new Error("Key generation failed");

    // Fix: Handle non-string payloads safely
    const textStr = typeof plainText === 'string' ? plainText : JSON.stringify(plainText);
    
    const iv = cryptoLib.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(textStr);

    const ciphertext = await cryptoLib.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );

    const entry = {
      id: crypto.randomUUID(),
      tabId: tabId,
      timestamp: Date.now(),
      url: url,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext))
    };

    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('tabId', 'tabId');
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });

    await db.add(STORE_NAME, entry);
  } catch (err) {
    console.error("[Aegis] Encryption Error:", err);
  }
}

export async function fetchDecryptedHistory() {
  const db = await openDB(DB_NAME, 1);
  const logs = await db.getAllFromIndex(STORE_NAME, 'timestamp');
  
  const cryptoLib = getCrypto();
  const key = await getMasterKey();
  const decoder = new TextDecoder();

  const decryptedLogs = await Promise.all(logs.map(async (log) => {
    try {
      const iv = new Uint8Array(log.iv);
      const data = new Uint8Array(log.data);
      
      const decryptedBuffer = await cryptoLib.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
      );
      
      return {
        ...log,
        text: decoder.decode(decryptedBuffer),
        status: 'verified'
      };
    } catch (e) {
      return { ...log, text: "[[DECRYPTION FAILED]]", status: 'corrupted' };
    }
  }));

  return decryptedLogs.reverse();
}`,

  "src/background/index.js": `import { encryptAndSave } from '../utils/vault.js';

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
    
    console.log(\`[Aegis] Secure Tunnel Established on Tab \${tabId}\`);
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
});`,

  "src/content/index.jsx": `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, X, Lock } from 'lucide-react';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "MOUNT_OVERLAY") {
    mountAegisOverlay(request.data);
  }
});

function mountAegisOverlay(historyData) {
  if (document.getElementById('aegis-root-host')) return;

  const host = document.createElement('div');
  host.id = 'aegis-root-host';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.right = '0';
  // CHANGE 4: Nuclear Z-Index
  // Uses max integer to beat any fullscreen overlay
  host.style.zIndex = '2147483647'; 
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const root = createRoot(shadow);
  
  root.render(<AegisInterface history={historyData} onClose={() => host.remove()} />);
}

const AegisInterface = ({ history, onClose }) => {
  return (
    <div style={{
      fontFamily: 'monospace',
      width: '450px',
      height: '100vh',
      backgroundColor: '#0a0a0a',
      borderLeft: '1px solid #333',
      color: '#e5e5e5',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-10px 0 30px rgba(0,0,0,0.8)'
    }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={20} color="#10b981" />
          <span style={{ fontWeight: 'bold', letterSpacing: '1px' }}>AEGIS VAULT</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '10px 20px', background: '#0f1f15', borderBottom: '1px solid #10b981', fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Lock size={12} />
        {history.length} Packets Resurrected | End-to-End Encrypted
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {history.map((log) => (
          <div key={log.id} style={{ 
            background: '#171717', 
            border: '1px solid #333', 
            borderRadius: '4px',
            padding: '12px' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span>ID: {log.id.slice(0,8)}</span>
            </div>
            <div style={{ 
              fontSize: '13px', 
              lineHeight: '1.5', 
              wordBreak: 'break-all',
              color: '#d4d4d4'
            }}>
              {log.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};`
};

console.log("🚀 Starting Project Aegis Hotfix...");

// 1. WRITE FILES
Object.entries(updates).forEach(([filePath, content]) => {
  const fullPath = path.join(__dirname, filePath);
  fs.writeFileSync(fullPath, content);
  console.log(`✅ Patched: ${filePath}`);
});

// 2. EXECUTE GIT COMMANDS
try {
  console.log("\n📦 Staging changes...");
  execSync('git add .', { stdio: 'inherit' });

  console.log("💾 Committing fix...");
  // Using the specific comment
  execSync('git commit -m "Fix Service Worker crypto crash and improve overlays"', { stdio: 'inherit' });

  console.log("🚀 Pushing to GitHub...");
  execSync('git push', { stdio: 'inherit' });

  console.log("\n✅ SUCCESS! All changes are live on GitHub.");
} catch (error) {
  console.error("\n❌ Git Error:", error.message);
  console.log("You may need to run 'git pull' first if there are conflicts.");
}