import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = {
  "package.json": `{
  "name": "project-aegis",
  "displayName": "Project Aegis | Sovereign Memory",
  "version": "1.0.0",
  "description": "Immutable ledger for AI interactions protected by client-side encryption.",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "idb": "^8.0.0",
    "lucide-react": "^0.344.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.23",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.4"
  }
}`,

  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: 'index.html',
      },
    },
  },
})`,

  "src/utils/vault.js": `import { openDB } from 'idb';

const DB_NAME = 'AegisVault';
const STORE_NAME = 'secure_logs';
const KEY_STORAGE = 'aegis_master_key';

async function getMasterKey() {
  if (typeof chrome === 'undefined' || !chrome.storage) return null;

  const stored = await chrome.storage.local.get(KEY_STORAGE);
  
  if (stored[KEY_STORAGE]) {
    return window.crypto.subtle.importKey(
      "jwk",
      stored[KEY_STORAGE],
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  } else {
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    await chrome.storage.local.set({ [KEY_STORAGE]: exported });
    return key;
  }
}

export async function encryptAndSave(plainText, url, tabId) {
  try {
    const key = await getMasterKey();
    if (!key) throw new Error("Key generation failed");

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);

    const ciphertext = await window.crypto.subtle.encrypt(
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
    console.log(\`[Aegis] Encrypted packet stored: \${entry.id}\`);
  } catch (err) {
    console.error("[Aegis] Encryption Error:", err);
  }
}

export async function fetchDecryptedHistory() {
  const db = await openDB(DB_NAME, 1);
  const logs = await db.getAllFromIndex(STORE_NAME, 'timestamp');
  
  const key = await getMasterKey();
  const decoder = new TextDecoder();

  const decryptedLogs = await Promise.all(logs.map(async (log) => {
    try {
      const iv = new Uint8Array(log.iv);
      const data = new Uint8Array(log.data);
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
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
      console.error("[Aegis] Attach failed:", chrome.runtime.lastError.message);
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
    
    if (!payload || payload.length < 5) return;

    try {
      const tab = await chrome.tabs.get(tabId);
      await encryptAndSave(payload, tab.url, tabId);
    } catch (err) {
      console.error("[Aegis] Capture Error:", err);
    }
  }
});

chrome.debugger.onDetach.addListener((source) => {
  attachedTabs.delete(source.tabId);
  chrome.action.setBadgeText({ tabId: source.tabId, text: "" });
});`,

  "src/popup/index.jsx": `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchDecryptedHistory } from '../utils/vault.js';
import { Shield, Play, Database, AlertTriangle } from 'lucide-react';
import './popup.css';

const Popup = () => {
  const [status, setStatus] = useState("idle");

  const activateInterceptor = async () => {
    setStatus("loading");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab");

      chrome.runtime.sendMessage({ 
        action: "ACTIVATE_AEGIS", 
        tabId: tab.id 
      }, (response) => {
        setStatus("active");
      });
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  const resurrectData = async () => {
    setStatus("decrypting");
    const history = await fetchDecryptedHistory();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, {
      action: "MOUNT_OVERLAY",
      data: history
    });
    
    window.close();
  };

  return (
    <div className="w-80 bg-neutral-900 text-white p-4 font-sans">
      <div className="flex items-center gap-2 mb-6 border-b border-neutral-800 pb-4">
        <Shield className="text-emerald-500" size={24} />
        <div>
          <h1 className="font-bold text-lg">Project Aegis</h1>
          <p className="text-xs text-neutral-500">Sovereign Memory Layer v1.0</p>
        </div>
      </div>

      <div className="space-y-3">
        <button 
          onClick={activateInterceptor}
          disabled={status === "active"}
          className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 py-3 rounded text-sm font-medium transition-colors border border-neutral-700"
        >
          {status === "active" ? (
            <span className="text-emerald-500 flex items-center gap-2">● Interceptor Active</span>
          ) : (
            <>
              <Play size={16} /> Activate Interceptor
            </>
          )}
        </button>

        <button 
          onClick={resurrectData}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 py-3 rounded text-sm font-medium transition-colors text-black"
        >
          <Database size={16} /> Resurrect History
        </button>
      </div>

      <div className="mt-6 p-3 bg-neutral-950 rounded border border-neutral-800 text-xs text-neutral-400 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 text-amber-500" />
        <p>
          Data is encrypted with AES-GCM and stored locally. Server deletion commands are ignored.
        </p>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<Popup />);`,

  "src/popup/popup.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
    background-color: #171717;
    margin: 0;
    padding: 0;
    width: 320px;
    height: 100vh;
}`,

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

// Write files
Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(__dirname, filePath);
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, content);
  console.log(`✅ Updated: ${filePath}`);
});

console.log("\nAll files fixed successfully! Now run 'npm install' then 'npm run build'");