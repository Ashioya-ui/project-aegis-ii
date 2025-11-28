import { openDB } from 'idb';

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
    console.log(`[Aegis] Encrypted packet stored: ${entry.id}`);
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
}