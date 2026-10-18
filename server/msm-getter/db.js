import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'streams.json');

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // Directory already exists or created
}

export class CentralDatabase {
  constructor(dbFile = DB_FILE) {
    this.dbFile = dbFile;
    this.byQuery = new Map(); // queryKey -> record
    this.byDocId = new Map(); // docId -> record
    this.saveTimer = null;
    this.isSaving = false;
    this.needsSaveAgain = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const records = JSON.parse(raw);
        for (const r of records) {
          if (!r || typeof r !== 'object') continue;
          if (r.queryKey) this.byQuery.set(r.queryKey, r);
          if (r.docId) this.byDocId.set(String(r.docId), r);
        }
        console.log(`[DB] Successfully loaded ${this.byQuery.size} queries (${this.byDocId.size} unique docs) from ${this.dbFile}`);
      }
    } catch (err) {
      console.error('[DB ERROR] Failed to load streams.json:', err.message);
    }
  }

  _getSerializableRecords() {
    const recordsMap = new Map();
    // 1. All records indexed by queryKey (e.g. title_720p, title_1080p)
    for (const r of this.byQuery.values()) {
      const key = r.queryKey || `doc_${r.docId}`;
      recordsMap.set(key, r);
    }
    // 2. Standalone docId records without queryKey (or not yet included)
    for (const r of this.byDocId.values()) {
      const key = r.queryKey || `doc_${r.docId}`;
      if (!recordsMap.has(key)) {
        recordsMap.set(key, r);
      }
    }
    return Array.from(recordsMap.values());
  }

  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveAsync().catch(err => {
        console.error('[DB ERROR] Failed to persist streams.json async:', err.message);
      });
    }, 300);
  }

  async saveAsync() {
    if (this.isSaving) {
      this.needsSaveAgain = true;
      return;
    }
    this.isSaving = true;
    try {
      const records = this._getSerializableRecords();
      const tmpFile = `${this.dbFile}.tmp`;
      await fs.promises.writeFile(tmpFile, JSON.stringify(records, null, 2), 'utf-8');
      await fs.promises.rename(tmpFile, this.dbFile);
    } catch (err) {
      console.error('[DB ERROR] Failed to persist streams.json:', err.message);
    } finally {
      this.isSaving = false;
      if (this.needsSaveAgain) {
        this.needsSaveAgain = false;
        this.save();
      }
    }
  }

  saveSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const records = this._getSerializableRecords();
      const tmpFile = `${this.dbFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.dbFile);
    } catch (err) {
      console.error('[DB ERROR] Failed to persist streams.json synchronously:', err.message);
    }
  }

  get(queryKey) {
    return this.byQuery.get(queryKey);
  }

  getByDocId(docId) {
    return this.byDocId.get(String(docId));
  }

  set(queryKey, data) {
    const docIdStr = String(data.docId);
    const existing = this.byDocId.get(docIdStr);
    const record = {
      queryKey: queryKey || existing?.queryKey,
      docId: docIdStr,
      accessHash: String(data.accessHash || existing?.accessHash || ''),
      fileReference: String(data.fileReference || existing?.fileReference || ''),
      filename: data.filename || existing?.filename || `video_${docIdStr}.mp4`,
      size: String(data.size || existing?.size || '0'),
      mimeType: data.mimeType || existing?.mimeType || 'video/mp4',
      dcId: data.dcId || existing?.dcId || 4,
      date: data.date || existing?.date || Math.floor(Date.now() / 1000),
      createdAt: data.createdAt || existing?.createdAt || Date.now(),
      videoCodec: data.videoCodec || existing?.videoCodec || undefined,
      width: data.width !== undefined ? data.width : existing?.width,
      height: data.height !== undefined ? data.height : existing?.height,
    };

    // Prevent unbounded memory/disk growth by evicting oldest query record if cap is reached
    if (this.byQuery.size >= 3000) {
      const oldestKey = this.byQuery.keys().next().value;
      const oldestRecord = this.byQuery.get(oldestKey);
      this.byQuery.delete(oldestKey);
      if (oldestRecord?.docId) {
        let hasOther = false;
        for (const r of this.byQuery.values()) {
          if (r.docId === oldestRecord.docId) {
            hasOther = true;
            break;
          }
        }
        if (!hasOther) this.byDocId.delete(oldestRecord.docId);
      }
    }

    if (queryKey) this.byQuery.set(queryKey, record);
    this.byDocId.set(docIdStr, record);
    this.save();
    console.log(`[DB] Persisted to central DB: "${queryKey || docIdStr}" -> Doc ID: ${docIdStr} (${record.filename})`);
    return record;
  }

  delete(queryKey) {
    const existing = this.byQuery.get(queryKey);
    if (existing) {
      this.byQuery.delete(queryKey);
      if (existing.docId) {
        let hasOther = false;
        for (const r of this.byQuery.values()) {
          if (r.docId === existing.docId) {
            hasOther = true;
            break;
          }
        }
        if (!hasOther) {
          this.byDocId.delete(String(existing.docId));
        }
      }
      this.save();
      console.log(`[DB] Evicted cache entry: "${queryKey}" (Doc ID: ${existing.docId})`);
      return true;
    }
    return false;
  }

  deleteByDocId(docId) {
    const docIdStr = String(docId);
    let evicted = false;
    if (this.byDocId.has(docIdStr)) {
      this.byDocId.delete(docIdStr);
      evicted = true;
    }
    for (const [qk, r] of Array.from(this.byQuery.entries())) {
      if (r.docId === docIdStr) {
        this.byQuery.delete(qk);
        evicted = true;
        console.log(`[DB] Evicted record by Doc ID: ${docIdStr} ("${qk}")`);
      }
    }
    if (evicted) {
      this.save();
      return true;
    }
    return false;
  }

  updateVideoCodec(docId, videoCodec) {
    const docIdStr = String(docId);
    let updated = false;
    const existing = this.byDocId.get(docIdStr);
    if (existing && existing.videoCodec !== videoCodec) {
      existing.videoCodec = videoCodec;
      updated = true;
    }
    for (const r of this.byQuery.values()) {
      if (r.docId === docIdStr && r.videoCodec !== videoCodec) {
        r.videoCodec = videoCodec;
        updated = true;
      }
    }
    if (updated) {
      this.save();
      console.log(`[DB] Updated videoCodec for doc ${docIdStr}: ${videoCodec}`);
      return true;
    }
    return false;
  }

  updateVideoDimensions(docId, width, height) {
    const docIdStr = String(docId);
    let updated = false;
    const existing = this.byDocId.get(docIdStr);
    if (existing && (existing.width !== width || existing.height !== height)) {
      existing.width = width;
      existing.height = height;
      updated = true;
    }
    for (const r of this.byQuery.values()) {
      if (r.docId === docIdStr && (r.width !== width || r.height !== height)) {
        r.width = width;
        r.height = height;
        updated = true;
      }
    }
    if (updated) {
      this.save();
      console.log(`[DB] Updated dimensions for doc ${docIdStr}: ${width}x${height}`);
      return true;
    }
    return false;
  }

  clear() {
    this.byQuery.clear();
    this.byDocId.clear();
    this.save();
    console.log('[DB] Cleared all cache records from central DB.');
  }

  size() {
    return this.byQuery.size || this.byDocId.size;
  }

  getAll(search = '') {
    let items = this._getSerializableRecords();
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(r => 
        (r.queryKey && r.queryKey.toLowerCase().includes(q)) ||
        (r.filename && r.filename.toLowerCase().includes(q)) ||
        (r.docId && r.docId.includes(q))
      );
    }
    // Sort newest first
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getTotalSizeBytes() {
    let total = 0;
    const seenDocIds = new Set();
    for (const r of this.byDocId.values()) {
      seenDocIds.add(String(r.docId));
      const bytes = parseInt(r.size, 10);
      if (!isNaN(bytes) && bytes > 0) total += bytes;
    }
    for (const r of this.byQuery.values()) {
      if (r.docId && !seenDocIds.has(String(r.docId))) {
        seenDocIds.add(String(r.docId));
        const bytes = parseInt(r.size, 10);
        if (!isNaN(bytes) && bytes > 0) total += bytes;
      }
    }
    return total;
  }
}

export const db = new CentralDatabase();
