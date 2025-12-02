// --- Universal Crypto Helper ---
        const getCrypto = () => {
          if (typeof crypto !== 'undefined') return crypto;
          if (typeof self !== 'undefined' && self.crypto) return self.crypto;
          if (typeof window !== 'undefined' && window.crypto) return window.crypto;
          throw new Error("Aegis Critical: Cryptography API unavailable.");
        };

        // --- IDB Wrapper ---
        const DB_NAME = 'AegisVault';
        const STORE_NAME = 'secure_logs';
        const KEY_STORAGE = 'aegis_master_key_v2';

        const dbApi = {
          open: () => {
            return new Promise((resolve, reject) => {
              const request = indexedDB.open(DB_NAME, 1);
              request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                  const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                  store.createIndex('timestamp', 'timestamp');
                }
              };
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          },
          add: async (entry) => {
            const db = await dbApi.open();
            return new Promise((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, 'readwrite');
              tx.objectStore(STORE_NAME).add(entry);
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
          },
          getAll: async () => {
            const db = await dbApi.open();
            return new Promise((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, 'readonly');
              const request = tx.objectStore(STORE_NAME).getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          },
          clear: async () => {
            const db = await dbApi.open();
            return new Promise((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, 'readwrite');
              tx.objectStore(STORE_NAME).clear();
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
          }
        };

        // --- Key Management ---
        async function getMasterKey() {
          const stored = await chrome.storage.local.get(KEY_STORAGE);
          const cryptoLib = getCrypto();
          
          if (stored[KEY_STORAGE]) {
            return cryptoLib.subtle.importKey("jwk", stored[KEY_STORAGE], { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
          } else {
            const key = await cryptoLib.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
            const exported = await cryptoLib.subtle.exportKey("jwk", key);
            await chrome.storage.local.set({ [KEY_STORAGE]: exported });
            return key;
          }
        }

        // --- Public API ---
        export async function encryptAndSave(plainText, url, tabId) {
          try {
            const key = await getMasterKey();
            const iv = getCrypto().getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(plainText);

            const ciphertext = await getCrypto().subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);

            const entry = {
              id: self.crypto.randomUUID(),
              tabId: tabId,
              timestamp: Date.now(),
              url: url,
              iv: Array.from(iv),
              data: Array.from(new Uint8Array(ciphertext))
            };

            await dbApi.add(entry);
            return true;
          } catch (err) {
            console.error("[Aegis] Encryption Failed:", err);
            return false;
          }
        }

        export async function fetchDecryptedHistory() {
          const logs = await dbApi.getAll();
          const key = await getMasterKey();
          const decoder = new TextDecoder();
          const cryptoLib = getCrypto();

          return Promise.all(logs.map(async (log) => {
            try {
              const iv = new Uint8Array(log.iv);
              const data = new Uint8Array(log.data);
              const decryptedBuffer = await cryptoLib.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
              return { ...log, text: decoder.decode(decryptedBuffer), status: 'ok' };
            } catch (e) {
              return { ...log, text: '*** DECRYPTION ERROR ***', status: 'error' };
            }
          })).then(results => results.sort((a,b) => b.timestamp - a.timestamp));
        }

        export async function clearVault() {
          await dbApi.clear();
        }