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
    this.byQuery = new Map(); // cleanKey -> Array<record>
    this.byDocId = new Map(); // docId -> record
    this.saveTimer = null;
    this.isSaving = false;
    this.needsSaveAgain = false;
    this.load();
  }

  _stripQualitySuffix(key) {
    if (!key || typeof key !== 'string') return '';
    return key.replace(/_(4k|2160p|1080p|720p|480p|sd)$/i, '').trim();
  }

  _normQuality(q) {
    if (!q) return '';
    const s = String(q).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s === '4k' || s === '2160p' || s === '2160') return '4k';
    if (s === '1080p' || s === '1080' || s === 'fhd') return '1080p';
    if (s === '720p' || s === '720' || s === 'hd') return '720p';
    if (s === '480p' || s === '480' || s === 'sd' || s === '360p' || s === '540p') return 'sd';
    return s;
  }

  _inferQuality(record, fallbackKey = '') {
    if (!record) return '';
    if (record.actualQuality) {
      const q = this._normQuality(record.actualQuality);
      if (q) return q;
    }
    const w = Number(record.width) || 0;
    const h = Number(record.height) || 0;
    if (w >= 3200 || h >= 1800) return '4k';
    if (w >= 1600 || h >= 900) return '1080p';
    if (w >= 960 || h >= 530) return '720p';
    if (w > 0 && h > 0) return 'sd';

    const fn = String(record.filename || '').toLowerCase();
    if (/\b(4k|2160p|2160|uhd)\b/i.test(fn)) return '4k';
    if (/\b(1080p|1080|fhd)\b/i.test(fn)) return '1080p';
    if (/\b(720p|720|hd)\b/i.test(fn)) return '720p';
    if (/\b(480p|480|360p|540p|sd)\b/i.test(fn)) return 'sd';

    const match = String(fallbackKey || record.queryKey || '').match(/_(4k|2160p|1080p|720p|480p|sd)$/i);
    if (match) return this._normQuality(match[1]);

    if (record.requestedQuality) {
      const q = this._normQuality(record.requestedQuality);
      if (q) return q;
    }
    if (Array.isArray(record.requestedQualities) && record.requestedQualities.length > 0) {
      const q = this._normQuality(record.requestedQualities[0]);
      if (q) return q;
    }
    return '';
  }

  load() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const records = JSON.parse(raw);
        let diskNeedsSave = false;

        for (const r of records) {
          if (!r || typeof r !== 'object' || !r.docId) continue;
          const cleanKey = this._stripQualitySuffix(r.queryKey);
          r.queryKey = cleanKey;

          // Normalize requestedQualities
          const rawRequested = [
            ...(Array.isArray(r.requestedQualities) ? r.requestedQualities : []),
            ...(r.requestedQuality ? [r.requestedQuality] : []),
          ];
          const normRequested = Array.from(new Set(rawRequested.map(q => this._normQuality(q)))).filter(Boolean);
          r.requestedQualities = normRequested.length > 0 ? normRequested : undefined;
          if (r.requestedQuality) {
            r.requestedQuality = this._normQuality(r.requestedQuality);
          } else if (normRequested.length > 0) {
            r.requestedQuality = normRequested[0];
          }

          // Ensure actualQuality is populated if possible
          const inferredActual = this._inferQuality(r, r.queryKey);
          if (inferredActual && (!r.actualQuality || this._normQuality(r.actualQuality) !== inferredActual)) {
            r.actualQuality = inferredActual;
          }

          const docIdStr = String(r.docId);

          // Deduplicate if cleanKey already has a record with the SAME actualQuality (#246)
          if (cleanKey) {
            const list = this.byQuery.get(cleanKey) || [];
            const rQuality = this._normQuality(r.actualQuality);
            const dupIndex = rQuality
              ? list.findIndex(doc => String(doc.docId) !== docIdStr && this._normQuality(doc.actualQuality) === rQuality)
              : -1;

            if (dupIndex !== -1) {
              const existingDoc = list[dupIndex];
              const rTime = Number(r.createdAt || (r.date ? r.date * 1000 : 0) || 0);
              const existingTime = Number(existingDoc.createdAt || (existingDoc.date ? existingDoc.date * 1000 : 0) || 0);

              if (rTime >= existingTime) {
                // Incoming record r is newer: supersede existingDoc
                const mergedReq = Array.from(new Set([
                  ...(Array.isArray(r.requestedQualities) ? r.requestedQualities : []),
                  ...(Array.isArray(existingDoc.requestedQualities) ? existingDoc.requestedQualities : []),
                  ...(r.requestedQuality ? [r.requestedQuality] : []),
                  ...(existingDoc.requestedQuality ? [existingDoc.requestedQuality] : []),
                ])).filter(Boolean);
                r.requestedQualities = mergedReq.length > 0 ? mergedReq : undefined;
                r.requestedQuality = r.requestedQuality || existingDoc.requestedQuality;

                this.byDocId.delete(String(existingDoc.docId));
                list[dupIndex] = r;
                this.byDocId.set(docIdStr, r);
                this.byQuery.set(cleanKey, list);
                diskNeedsSave = true;
                continue;
              } else {
                // existingDoc is newer: keep existingDoc, merge r's requested qualities
                const mergedReq = Array.from(new Set([
                  ...(Array.isArray(existingDoc.requestedQualities) ? existingDoc.requestedQualities : []),
                  ...(Array.isArray(r.requestedQualities) ? r.requestedQualities : []),
                  ...(existingDoc.requestedQuality ? [existingDoc.requestedQuality] : []),
                  ...(r.requestedQuality ? [r.requestedQuality] : []),
                ])).filter(Boolean);
                existingDoc.requestedQualities = mergedReq.length > 0 ? mergedReq : undefined;
                diskNeedsSave = true;
                continue;
              }
            }

            if (!list.some(doc => String(doc.docId) === docIdStr)) {
              list.push(r);
            }
            this.byQuery.set(cleanKey, list);
          }

          this.byDocId.set(docIdStr, r);
        }
        console.log(`[DB] Successfully loaded ${this.byQuery.size} queries (${this.byDocId.size} unique docs) from ${this.dbFile}`);
        const purgedStale = this.purgeStaleLegacyRecords(12 * 60 * 60 * 1000);
        if (purgedStale > 0) diskNeedsSave = true;
        if (diskNeedsSave) {
          console.log(`[DB] Deduplicated and synchronized stream cache records on disk.`);
          this.save();
        }
      }
    } catch (err) {
      console.error('[DB ERROR] Failed to load streams.json:', err.message);
    }
  }

  _getSerializableRecords() {
    return Array.from(this.byDocId.values());
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

  _isStaleNoBot(record, maxAgeMs = 12 * 60 * 60 * 1000) {
    if (!record || record.bot) return false;
    const now = Date.now();
    const recordTime = Number(record.updatedAt || record.createdAt || (record.date ? record.date * 1000 : 0) || 0);
    // Only purge real timestamps (> year 2001), ignoring synthetic test numbers (e.g. 1000, 2000)
    if (!recordTime || recordTime < 1000000000000) return false;
    return (now - recordTime) > maxAgeMs;
  }

  purgeStaleLegacyRecords(maxAgeMs = 12 * 60 * 60 * 1000) {
    let purged = 0;
    for (const [docId, r] of Array.from(this.byDocId.entries())) {
      if (this._isStaleNoBot(r, maxAgeMs)) {
        this.deleteByDocId(docId);
        purged++;
      }
    }
    if (purged > 0) {
      console.log(`[DB] Auto-purged ${purged} stale legacy stream records without bot name (> ${Math.round(maxAgeMs / 3600000)}h).`);
      this.save();
    }
    return purged;
  }

  get(queryKey, targetQuality) {
    if (!queryKey) return undefined;
    const cleanKey = this._stripQualitySuffix(queryKey);
    let target = targetQuality;
    if (!target) {
      const match = String(queryKey).match(/_(4k|2160p|1080p|720p|480p|sd)$/i);
      if (match) target = match[1];
    }

    let docs = this.byQuery.get(cleanKey);
    if (!docs || docs.length === 0) {
      // Check partial/prefix match
      for (const [qk, list] of this.byQuery.entries()) {
        if (qk.startsWith(cleanKey) || cleanKey.startsWith(qk)) {
          docs = list;
          break;
        }
      }
    }
    if (docs && docs.length > 0) {
      const validDocs = [];
      for (const d of docs) {
        if (this._isStaleNoBot(d)) {
          this.deleteByDocId(d.docId);
        } else {
          validDocs.push(d);
        }
      }
      docs = validDocs.length > 0 ? validDocs : undefined;
    }
    if (!docs || docs.length === 0) {
      const docRecord = this.byDocId.get(String(queryKey));
      if (docRecord && this._isStaleNoBot(docRecord)) {
        this.deleteByDocId(String(queryKey));
        return undefined;
      }
      return docRecord || undefined;
    }

    if (!target) {
      return docs[0] || undefined;
    }

    const targetNorm = this._normQuality(target);

    // 1. Exact match on actualQuality
    for (const doc of docs) {
      if (this._normQuality(doc.actualQuality) === targetNorm) {
        return doc;
      }
    }

    // 2. Match on requestedQualities (Scenario B / previous request fallback)
    for (const doc of docs) {
      const reqList = Array.isArray(doc.requestedQualities)
        ? doc.requestedQualities.map(q => this._normQuality(q))
        : (doc.requestedQuality ? [this._normQuality(doc.requestedQuality)] : []);
      if (reqList.includes(targetNorm)) {
        return doc;
      }
    }

    return undefined;
  }

  getFallback(queryKey, requestedTier) {
    if (!queryKey) return undefined;
    const cleanKey = this._stripQualitySuffix(queryKey);
    let docs = this.byQuery.get(cleanKey);
    if (!docs || docs.length === 0) {
      for (const [qk, list] of this.byQuery.entries()) {
        if (qk.startsWith(cleanKey) || cleanKey.startsWith(qk)) {
          docs = list;
          break;
        }
      }
    }
    if (docs && docs.length > 0) {
      const validDocs = [];
      for (const d of docs) {
        if (this._isStaleNoBot(d)) {
          this.deleteByDocId(d.docId);
        } else {
          validDocs.push(d);
        }
      }
      docs = validDocs.length > 0 ? validDocs : undefined;
    }
    if (!docs || docs.length === 0) return undefined;

    let preferred = [];
    const reqNorm = this._normQuality(requestedTier);
    if (reqNorm === '4k') preferred = ['1080p', '720p', 'sd'];
    else if (reqNorm === '1080p') preferred = ['720p', '4k', 'sd'];
    else if (reqNorm === 'sd') preferred = ['720p', '1080p', '4k'];
    else preferred = ['1080p', 'sd', '4k'];

    for (const pref of preferred) {
      const match = docs.find(d => this._normQuality(d.actualQuality) === pref);
      if (match) return match;
    }
    return docs[0] || undefined;
  }

  getByDocId(docId) {
    const record = this.byDocId.get(String(docId));
    if (record && this._isStaleNoBot(record)) {
      this.deleteByDocId(String(docId));
      return undefined;
    }
    return record;
  }

  findByTitleAndQuality(baseCacheKey, targetQuality) {
    if (!baseCacheKey) return null;
    return this.get(baseCacheKey, targetQuality);
  }

  addRequestedQuality(docId, quality) {
    if (!docId || !quality) return false;
    const docIdStr = String(docId);
    const record = this.byDocId.get(docIdStr);
    if (!record) return false;

    const norm = this._normQuality(quality);
    if (!norm) return false;

    if (!Array.isArray(record.requestedQualities)) {
      record.requestedQualities = [];
    }
    if (record.requestedQuality && !record.requestedQualities.includes(record.requestedQuality)) {
      record.requestedQualities.push(this._normQuality(record.requestedQuality));
    }

    const alreadyPresent = record.requestedQualities.some(q => this._normQuality(q) === norm);
    if (!alreadyPresent) {
      record.requestedQualities.push(norm);
      if (!record.requestedQuality) record.requestedQuality = norm;
      this.save();
      console.log(`[DB] Added requestedQuality "${norm}" to Doc ID: ${docIdStr} (${record.filename}) -> [${record.requestedQualities.join(', ')}]`);
      return true;
    }
    return false;
  }

  set(queryKey, data) {
    const docIdStr = String(data.docId);
    const existing = this.byDocId.get(docIdStr);

    const cleanKey = this._stripQualitySuffix(queryKey || data.queryKey || existing?.queryKey);

    // Determine normalized actual quality
    const inferredQuality = this._inferQuality(data, queryKey) || this._inferQuality(existing, queryKey);
    const normActualQuality = inferredQuality || undefined;

    const existingRequested = Array.isArray(existing?.requestedQualities) ? existing.requestedQualities : [];
    const incomingRequested = Array.isArray(data.requestedQualities) ? data.requestedQualities : [];
    const rawList = [
      ...existingRequested,
      ...incomingRequested,
      ...(data.requestedQuality ? [data.requestedQuality] : []),
      ...(existing?.requestedQuality ? [existing.requestedQuality] : []),
    ];
    const match = String(queryKey).match(/_(4k|2160p|1080p|720p|480p|sd)$/i);
    if (match) rawList.push(match[1]);

    // If there is an existing record with the same cleanKey and same quality tier, merge its requestedQualities and evict it (#246)
    if (cleanKey && normActualQuality) {
      const currentList = this.byQuery.get(cleanKey) || [];
      for (const oldDoc of currentList) {
        if (String(oldDoc.docId) !== docIdStr && this._normQuality(oldDoc.actualQuality) === normActualQuality) {
          if (Array.isArray(oldDoc.requestedQualities)) rawList.push(...oldDoc.requestedQualities);
          if (oldDoc.requestedQuality) rawList.push(oldDoc.requestedQuality);
          // Evict superseded duplicate docId from byDocId!
          this.byDocId.delete(String(oldDoc.docId));
          console.log(`[DB] Superseded older docId ${oldDoc.docId} (${oldDoc.filename}) for "${cleanKey}" tier ${normActualQuality} (#246)`);
        }
      }
    }

    const combinedRequestedQualities = Array.from(new Set(rawList.map(q => this._normQuality(q)))).filter(Boolean);

    const record = {
      queryKey: cleanKey || existing?.queryKey,
      docId: docIdStr,
      accessHash: String(data.accessHash || existing?.accessHash || ''),
      fileReference: String(data.fileReference || existing?.fileReference || ''),
      filename: data.filename || existing?.filename || `video_${docIdStr}.mp4`,
      size: String(data.size || existing?.size || '0'),
      mimeType: data.mimeType || existing?.mimeType || 'video/mp4',
      dcId: data.dcId || existing?.dcId || 4,
      date: data.date || existing?.date || Math.floor(Date.now() / 1000),
      createdAt: data.createdAt || existing?.createdAt || Date.now(),
      msgId: data.msgId !== undefined ? data.msgId : existing?.msgId,
      bot: data.bot || existing?.bot || undefined,
      resolver: data.resolver || existing?.resolver || undefined,
      videoCodec: data.videoCodec || existing?.videoCodec || undefined,
      width: data.width !== undefined ? data.width : existing?.width,
      height: data.height !== undefined ? data.height : existing?.height,
      actualQuality: normActualQuality,
      requestedQuality: data.requestedQuality || existing?.requestedQuality || (combinedRequestedQualities[0] || undefined),
      requestedQualities: combinedRequestedQualities.length > 0 ? combinedRequestedQualities : undefined,
    };

    // Capacity eviction if >= 3000
    if (this.byDocId.size >= 3000 && !this.byDocId.has(docIdStr)) {
      const oldestKey = this.byDocId.keys().next().value;
      this.deleteByDocId(oldestKey);
    }

    this.byDocId.set(docIdStr, record);

    if (cleanKey) {
      const list = this.byQuery.get(cleanKey) || [];
      // Filter out any doc that has the same docId OR the same normalized actual quality!
      const filtered = list.filter(r => {
        if (String(r.docId) === docIdStr) return false;
        if (normActualQuality && this._normQuality(r.actualQuality) === normActualQuality) return false;
        return true;
      });
      filtered.push(record);
      this.byQuery.set(cleanKey, filtered);
    }

    this.save();
    console.log(`[DB] Persisted to central DB: "${cleanKey}" -> Doc ID: ${docIdStr} (${record.filename}) [act: ${record.actualQuality || '-'}, req: ${record.requestedQualities ? record.requestedQualities.join(',') : '-'}]`);
    return record;
  }

  delete(queryKey) {
    if (!queryKey) return false;
    const cleanKey = this._stripQualitySuffix(queryKey);
    let list = this.byQuery.get(cleanKey);
    if (!list || list.length === 0) {
      if (this.byDocId.has(String(queryKey))) {
        return this.deleteByDocId(queryKey);
      }
      return false;
    }

    const match = String(queryKey).match(/_(4k|2160p|1080p|720p|480p|sd)$/i);
    if (match) {
      const targetNorm = this._normQuality(match[1]);
      const docToDelete = list.find(d => this._normQuality(d.actualQuality) === targetNorm || (Array.isArray(d.requestedQualities) && d.requestedQualities.map(q => this._normQuality(q)).includes(targetNorm)));
      if (docToDelete) {
        return this.deleteByDocId(docToDelete.docId);
      }
    }

    for (const doc of [...list]) {
      this.byDocId.delete(String(doc.docId));
    }
    this.byQuery.delete(cleanKey);
    this.save();
    console.log(`[DB] Evicted cache entry for: "${cleanKey}" (${list.length} docs)`);
    return true;
  }

  deleteByDocId(docId) {
    const docIdStr = String(docId);
    const record = this.byDocId.get(docIdStr);
    if (!record) return false;
    this.byDocId.delete(docIdStr);
    if (record.queryKey) {
      const list = this.byQuery.get(record.queryKey);
      if (list) {
        const filtered = list.filter(r => String(r.docId) !== docIdStr);
        if (filtered.length > 0) {
          this.byQuery.set(record.queryKey, filtered);
        } else {
          this.byQuery.delete(record.queryKey);
        }
      }
    }
    this.save();
    console.log(`[DB] Evicted record by Doc ID: ${docIdStr} ("${record.queryKey}")`);
    return true;
  }

  updateVideoCodec(docId, videoCodec) {
    const docIdStr = String(docId);
    const existing = this.byDocId.get(docIdStr);
    if (existing && existing.videoCodec !== videoCodec) {
      existing.videoCodec = videoCodec;
      this.save();
      console.log(`[DB] Updated videoCodec for doc ${docIdStr}: ${videoCodec}`);
      return true;
    }
    return false;
  }

  updateVideoDimensions(docId, width, height) {
    const docIdStr = String(docId);
    const existing = this.byDocId.get(docIdStr);
    if (existing && (existing.width !== width || existing.height !== height)) {
      existing.width = width;
      existing.height = height;
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
    return this.byDocId.size;
  }

  getAll(search = '') {
    let items = this._getSerializableRecords();
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(r => 
        (r.queryKey && r.queryKey.toLowerCase().includes(q)) ||
        (r.filename && r.filename.toLowerCase().includes(q)) ||
        (r.docId && r.docId.includes(q)) ||
        (Array.isArray(r.requestedQualities) && r.requestedQualities.some(rq => String(rq).toLowerCase().includes(q))) ||
        (r.requestedQuality && String(r.requestedQuality).toLowerCase().includes(q))
      );
    }
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getTotalSizeBytes() {
    let total = 0;
    for (const r of this.byDocId.values()) {
      const bytes = parseInt(r.size, 10);
      if (!isNaN(bytes) && bytes > 0) total += bytes;
    }
    return total;
  }
}

export const db = new CentralDatabase();
