import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchDecryptedHistory } from '../utils/vault';
import { Shield, Play, Database, AlertTriangle } from 'lucide-react';
import './popup.css';

const Popup = () => {
  const [status, setStatus] = useState("idle");

  const activateInterceptor = async () => {
    setStatus("loading");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.runtime.sendMessage({ 
      action: "ACTIVATE_AEGIS", 
      tabId: tab.id 
    }, (response) => {
      setStatus("active");
    });
  };

  const resurrectData = async () => {
    setStatus("decrypting");
    const history = await fetchDecryptedHistory();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send data to content script to render overlay
    chrome.tabs.sendMessage(tab.id, {
      action: "MOUNT_OVERLAY",
      data: history
    });
    
    // Close popup so user can see overlay
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
root.render(<Popup />);