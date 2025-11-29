import { openDB } from 'idb';

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
}