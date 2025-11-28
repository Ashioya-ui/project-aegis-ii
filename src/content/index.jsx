import React from 'react';
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
};