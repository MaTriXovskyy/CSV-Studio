/**
 * Trwały magazyn obszaru roboczego.
 *
 * localStorage daje synchroniczny zapis potrzebny m.in. tuż przed F5.
 * IndexedDB jest kopią zapasową dla sesji, które nie mieszczą się w limicie
 * localStorage (zwykle kilka MB).
 */

const CSVStorage = {
  STORAGE_KEY: 'csv_studio_active_workspace_v3',
  LEGACY_STORAGE_KEYS: ['csv_studio_active_workspace_v2'],
  DB_NAME: 'CSVStudioPro_DB_v2',
  DB_VERSION: 1,
  STORE_NAME: 'workspaces',
  WORKSPACE_ID: 'main_workspace',
  db: null,
  dbPromise: null,
  writeQueue: Promise.resolve(),

  serializeTabs(tabs) {
    return (tabs || []).map(tab => ({
      id: tab.id,
      filename: tab.filename,
      data: tab.data,
      headers: tab.headers,
      hasHeader: tab.hasHeader,
      delimiter: tab.delimiter,
      encoding: tab.encoding,
      colWidths: tab.colWidths || null,
      viewState: tab.viewState || null
    }));
  },

  createPayload(tabs, activeTabId) {
    return {
      id: this.WORKSPACE_ID,
      version: 3,
      activeTabId: activeTabId || null,
      tabs: this.serializeTabs(tabs),
      timestamp: Date.now()
    };
  },

  isValidPayload(payload) {
    return !!payload && Array.isArray(payload.tabs);
  },

  savePayloadSync(payload) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
      for (const legacyKey of this.LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(legacyKey);
      }
      return true;
    } catch (error) {
      // QuotaExceededError jest spodziewany przy dużych plikach. Wtedy pełną
      // sesję nadal zachowa IndexedDB.
      console.warn('Nie udało się zapisać pełnej sesji w localStorage:', error);
      return false;
    }
  },

  /**
   * Zapis synchroniczny do localStorage oraz kolejka kopii w IndexedDB.
   */
  save(tabs, activeTabId) {
    const payload = this.createPayload(tabs, activeTabId);
    const savedLocally = this.savePayloadSync(payload);
    this.queueIndexedDBSave(payload);
    return { payload, savedLocally };
  },

  loadSync() {
    const keys = [this.STORAGE_KEY, ...this.LEGACY_STORAGE_KEYS];
    let newest = null;

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const payload = JSON.parse(raw);
        if (!this.isValidPayload(payload)) continue;

        if (!newest || (payload.timestamp || 0) > (newest.timestamp || 0)) {
          newest = payload;
        }
      } catch (error) {
        console.warn(`Nie udało się odczytać sesji z ${key}:`, error);
      }
    }

    return newest;
  },

  openDatabase() {
    if (this.db) return Promise.resolve(this.db);
    if (this.dbPromise) return this.dbPromise;
    if (!window.indexedDB) return Promise.resolve(null);

    this.dbPromise = new Promise(resolve => {
      let request;
      try {
        request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      } catch (error) {
        console.warn('IndexedDB jest niedostępne:', error);
        resolve(null);
        return;
      }

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = event => {
        this.db = event.target.result;
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          this.dbPromise = null;
        };
        resolve(this.db);
      };

      request.onerror = () => {
        console.warn('Nie udało się otworzyć IndexedDB:', request.error);
        this.dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('Otwarcie IndexedDB zostało zablokowane przez inną kartę.');
      };
    });

    return this.dbPromise;
  },

  initIndexedDB() {
    return this.openDatabase();
  },

  async savePayloadToIndexedDB(payload) {
    const db = await this.openDatabase();
    if (!db) return false;

    return new Promise(resolve => {
      try {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        transaction.objectStore(this.STORE_NAME).put(payload);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => {
          console.warn('Nie udało się zapisać sesji w IndexedDB:', transaction.error);
          resolve(false);
        };
        transaction.onabort = () => resolve(false);
      } catch (error) {
        console.warn('Nie udało się rozpocząć zapisu w IndexedDB:', error);
        resolve(false);
      }
    });
  },

  queueIndexedDBSave(payload) {
    this.writeQueue = this.writeQueue
      .catch(() => false)
      .then(() => this.savePayloadToIndexedDB(payload));
    return this.writeQueue;
  },

  async loadFromIndexedDB() {
    const db = await this.openDatabase();
    if (!db) return null;

    return new Promise(resolve => {
      try {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const request = transaction.objectStore(this.STORE_NAME).get(this.WORKSPACE_ID);
        request.onsuccess = () => resolve(this.isValidPayload(request.result) ? request.result : null);
        request.onerror = () => {
          console.warn('Nie udało się odczytać sesji z IndexedDB:', request.error);
          resolve(null);
        };
      } catch (error) {
        console.warn('Nie udało się rozpocząć odczytu z IndexedDB:', error);
        resolve(null);
      }
    });
  },

  /**
   * Zwraca najnowszą z dostępnych kopii. Pozwala to odtworzyć również duże
   * pliki, których pełna treść nie zmieściła się w localStorage.
   */
  async load() {
    const localPayload = this.loadSync();
    const indexedPayload = await this.loadFromIndexedDB();

    const newest = !localPayload
      ? indexedPayload
      : !indexedPayload
        ? localPayload
        : (indexedPayload.timestamp || 0) > (localPayload.timestamp || 0)
          ? indexedPayload
          : localPayload;

    if (newest && newest !== localPayload) {
      // Odśwież szybką kopię, jeśli tylko mieści się w localStorage.
      this.savePayloadSync(newest);
    }

    return newest;
  },

  clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      for (const legacyKey of this.LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(legacyKey);
      }
    } catch (error) {
      console.warn('Nie udało się wyczyścić localStorage:', error);
    }

    this.writeQueue = this.writeQueue
      .catch(() => false)
      .then(async () => {
        const db = await this.openDatabase();
        if (!db) return false;

        return new Promise(resolve => {
          try {
            const transaction = db.transaction([this.STORE_NAME], 'readwrite');
            transaction.objectStore(this.STORE_NAME).delete(this.WORKSPACE_ID);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
            transaction.onabort = () => resolve(false);
          } catch (error) {
            resolve(false);
          }
        });
      });

    return this.writeQueue;
  }
};

if (typeof window !== 'undefined') {
  window.CSVStorage = CSVStorage;
}
