import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'streams.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class CentralDatabase {
  constructor() {
    this.byQuery = new Map(); // queryKey -> record
    this.byDocId = new Map(); // docId -> record
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const records = JSON.parse(raw);
        for (const r of records) {
          if (r.queryKey) this.byQuery.set(r.queryKey, r);
          if (r.docId) this.byDocId.set(r.docId, r);
        }
        console.log(`[DB] Successfully loaded ${this.byDocId.size} permanent stream records from ${DB_FILE}`);
      }
    } catch (err) {
      console.error('[DB ERROR] Failed to load streams.json:', err.message);
    }
  }

  save() {
    try {
      const records = Array.from(this.byDocId.values());
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[DB ERROR] Failed to persist streams.json:', err.message);
    }
  }

  get(queryKey) {
    return this.byQuery.get(queryKey);
  }

  getByDocId(docId) {
    return this.byDocId.get(docId);
  }

  set(queryKey, data) {
    const record = {
      queryKey,
      docId: String(data.docId),
      accessHash: String(data.accessHash || ''),
      fileReference: String(data.fileReference || ''),
      filename: data.filename || `video_${data.docId}.mp4`,
      size: String(data.size || '0'),
      mimeType: data.mimeType || 'video/mp4',
      dcId: data.dcId || 4,
      date: data.date || Math.floor(Date.now() / 1000),
      createdAt: data.createdAt || Date.now(),
    };

    if (queryKey) this.byQuery.set(queryKey, record);
    this.byDocId.set(String(data.docId), record);
    this.save();
    console.log(`[DB] Persisted to central DB: "${queryKey}" -> Doc ID: ${data.docId} (${record.filename})`);
    return record;
  }

  delete(queryKey) {
    const existing = this.byQuery.get(queryKey);
    if (existing) {
      this.byQuery.delete(queryKey);
      if (existing.docId) this.byDocId.delete(String(existing.docId));
      this.save();
      console.log(`[DB] Evicted cache entry: "${queryKey}" (Doc ID: ${existing.docId})`);
      return true;
    }
    return false;
  }

  deleteByDocId(docId) {
    const docIdStr = String(docId);
    const existing = this.byDocId.get(docIdStr);
    if (existing) {
      this.byDocId.delete(docIdStr);
      if (existing.queryKey) this.byQuery.delete(existing.queryKey);
      this.save();
      console.log(`[DB] Evicted record by Doc ID: ${docIdStr} ("${existing.queryKey}")`);
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
    return this.byDocId.size;
  }
}

export const db = new CentralDatabase();
