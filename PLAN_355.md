# Plan: Siasat & Baiki Ralat tgstrm TypeError readUInt32LE (GitHub #355)

## 1. Pengenalan & Requirement

### 1.1 Latar Belakang
Pada log pelayan `tgstrm.julietmike.net/logs`, dikesan ralat berulang semasa penstriman video:
```text
[STREAM RECONNECT] Sender connection on DC 4 invalid (CONNECTION_NOT_INITED). Re-initializing...
[TG CLIENT ERROR] TypeError: Cannot read properties of undefined (reading 'readUInt32LE')
    at BinaryReader.readInt (/app/node_modules/telegram/extensions/BinaryReader.js:37:31)
    at BinaryReader.tgReadObject (/app/node_modules/telegram/extensions/BinaryReader.js:165:36)
    at MTProtoSender._handleRPCResult (/app/node_modules/telegram/network/MTProtoSender.js:546:30)
```
Isu ini dicatatkan pada GitHub Issue #355 (https://github.com/jefrimustapa/tmdb-app/issues/355).

### 1.2 Skop Tugasan & Requirement
1. Siasat punca sebenar ralat `TypeError: Cannot read properties of undefined (reading 'readUInt32LE')` dalam interaksi antara `server/tg-streamer/index.js` dengan klien MTProto GramJS (`telegram`).
2. Sediakan mekanisme perlindungan dan pembaikan (defensive patch) yang menghalang `TypeError` daripada terhasil apabila respons RPC tanpa parent request atau ralat RPC (seperti `CONNECTION_NOT_INITED`) diterima.
3. Memastikan pemulihan sambungan DC (DC reconnect) berjalan lancar tanpa mencetuskan ralat tidak tertangkap (unhandled error) atau kitaran reconnect yang merosakkan sesi penstriman.
4. Menyediakan ujian unit automatik dan ujian regresi berasaskan BVA bagi membuktikan penyelesaian berfungsi dengan mantap sebelum dan selepas patch diaplikasikan.

---

## 2. Kriteria Penerimaan Pengguna (Acceptance Criteria)

1. **Kriteria 1:** Bila `tg-streamer` menerima respons RPC tanpa parent request atau respons ralat RPC ketika sambungan DC sedang dimulakan semula (reconnect), `tg-streamer` tidak lagi mencetuskan `TypeError: Cannot read properties of undefined (reading 'readUInt32LE')`.
2. **Kriteria 2:** Bila sambungan Telegram mengalami kegagalan sementara seperti `CONNECTION_NOT_INITED`, proses pemulihan (reconnect) berjalan lancar tanpa kitaran ralat pada konsol atau mencemari log pelayan.
3. **Kriteria 3:** Bila pengguna menonton video melalui `tgstrm` semasa gangguan rangkaian atau pertukaran sambungan DC berlaku, penstriman video pulih secara telus (graceful recovery) tanpa sambungan terputus secara mendadak.

---

## 3. Analisis Punca Masalah (Root Cause Analysis)

### 3.1 Mekanisme Dalaman GramJS (`MTProtoSender._handleRPCResult`)
Pemerhatian terperinci terhadap kod sumber perpustakaan `telegram` (`node_modules/telegram/network/MTProtoSender.js` baris 535-555):
```javascript
_handleRPCResult(message) {
    const result = message.obj;
    const state = this._pendingState.getAndDelete(result.reqMsgId);
    this._log.debug(`Handling RPC result for message ${result.reqMsgId}`);
    if (!state) {
        try {
            const reader = new extensions_1.BinaryReader(result.body);
            if (!(reader.tgReadObject() instanceof tl_1.Api.upload.File)) {
                throw new errors_1.TypeNotFoundError(0, Buffer.alloc(0));
            }
        }
        catch (e) {
            if (e instanceof errors_1.TypeNotFoundError) {
                this._log.info(`Received response without parent request: ${result.body}`);
                return;
            }
            throw e;
        }
        return;
    }
    if (result.error) {
        ...
```

Perhatikan struktur logik di atas:
1. Apabila mesej RPC Result tiba dari Telegram, GramJS mencari `state` dalam `this._pendingState` menggunakan `result.reqMsgId`.
2. Jika `!state` (iaitu `reqMsgId` tiada dalam senarai permintaan tertunggak):
   - GramJS cuba menyemak sama ada kandungan objek tersebut ialah `Api.upload.File` kosong.
   - GramJS membina pembaca binari secara terus: `new extensions_1.BinaryReader(result.body);`.
   - Kemudian memanggil `reader.tgReadObject()`.
3. Namun, dalam kelas `RPCResult` (`node_modules/telegram/tl/core/RPCResult.js`):
   ```javascript
   if (innerCode === api_1.Api.RpcError.CONSTRUCTOR_ID) {
       return new RPCResult(msgId, undefined, api_1.Api.RpcError.fromReader(reader));
   }
   ```
   Apabila Telegram memulangkan respons ralat (RPC Error), nilai `result.body` adalah **`undefined`** dan objek ralat diletakkan pada `result.error`.
4. Dalam kelas `BinaryReader` (`node_modules/telegram/extensions/BinaryReader.js`):
   ```javascript
   constructor(data) {
       this.stream = data;
       this._last = undefined;
       this.offset = 0;
   }
   readInt(signed = true) {
       let res;
       if (signed) {
           res = this.stream.readInt32LE(this.offset);
       } else {
           res = this.stream.readUInt32LE(this.offset);
       }
       this.offset += 4;
       return res;
   }
   ```
   Bila `result.body` adalah `undefined`, `this.stream` bernilai `undefined`. Panggilan `tgReadObject()` memanggil `this.readInt(false)`, yang mencuba `undefined.readUInt32LE(0)`.
5. Ralat ini ialah **`TypeError`**, bukannya `TypeNotFoundError`. Blok `catch (e)` dalam GramJS hanya mengabaikan `TypeNotFoundError`. Oleh itu, `TypeError` dilemparkan keluar (`throw e`).

### 3.2 Korelasi dengan `[STREAM RECONNECT]` dan `CONNECTION_NOT_INITED`
1. Apabila pengguna menstrim video, permintaan blok dibuat melalui `client.invokeWithSender(request, sender)`.
2. Jika sambungan DC belum selesai inisialisasi lapisan protokol Telegram, Telegram membalas ralat RPC `CONNECTION_NOT_INITED`.
3. Di `server/tg-streamer/index.js`, blok `catch (err)` mengesan rentetan `CONNECTION_NOT_INITED` dan memanggil `getOrAcquireSender(dcId, true)`.
4. Tindakan `forceReconnect` memutuskan sambungan pengirim sedia ada (`await sender.disconnect()`).
5. Pemutusan sambungan dan permulaan gelung penghantaran baru mengosongkan/membersihkan `_pendingState` (`this._pendingState.clear()`).
6. Sementara itu, gelung penerimaan soket lama (`_recvLoop`) menerima paket respons daripada pelayan Telegram bagi permintaan yang telah dipadamkan daripada `_pendingState`.
7. `_handleRPCResult` dipanggil dengan `!state`. Oleh kerana mesej berkenaan adalah respons ralat (tanpa `body`), berlakulah letupan `TypeError: Cannot read properties of undefined (reading 'readUInt32LE')`.
8. `_recvLoop` menangkap `TypeError`, menganggapnya sebagai ralat tidak tertangani, memanggil `client._errorHandler` (yang mencetak `[TG CLIENT ERROR]`), dan memulakan percubaan `this.reconnect()` yang tidak perlu pada soket yang sudah dinyahaktifkan.

### 3.3 Mengapa Isu Ini Baru Kelihatan (Sebelum Ini Tiada Masalah)
1. **Keadaan Perlumbaan Rangkaian (Asynchronous Race Condition):** Ralat ini bukan pepijat sintaks tetap yang berlaku setiap kali strim dibuka, sebaliknya berlaku hanya apabila berlaku pertindihan masa (timing race) spesifik: sambungan DC Telegram terputus (contohnya akibat NAT idle timeout atau reset sesi) semasa ada blok in-flight yang sedang menunggu respons, dan disconnect membersihkan `_pendingState` sebelum respons ralat sampai ke soket TCP.
2. **Peningkatan Konkurensi & Fitur Baharu (Issues #342 & #346):** Penambahan fungsi prefetch latar belakang (`/api/prefetch`) dan sokongan video berbilang episod serentak baru-baru ini meningkatkan bilangan permintaan serentak (concurrency) ke DC Telegram. Konkurensi yang lebih tinggi meningkatkan kebarangkalian berlakunya `CONNECTION_NOT_INITED` semasa permintaan lain masih tergantung di rangkaian.
3. **Keterlihatan Log Masa Nyata (Issues #344 & #HOM-181):** Papan pemuka `/logs` baharu berasaskan React/MUI dengan penstriman log SSE masa nyata dan autoscroll (baru digabungkan pada 15 Nov) memaparkan setiap baris `console.error` secara terus kepada mata pengguna. Sebelum ini, ralat ini mungkin pernah berlaku di peringkat soket dan diserap oleh fallback retry blok seterusnya tanpa disedari melainkan disemak secara manual di fail log pelayan.
4. **Pepijat Sedia Ada dalam Perpustakaan Pihak Ketiga (Upstream GramJS):** Andaian bahawa `result.body` sentiasa sebuah Buffer dalam `node_modules/telegram/network/MTProtoSender.js:546` sememangnya wujud sejak awal dalam GramJS, namun ia terpendam sehingga keadaan perlumbaan di atas mencetuskannya.

---

## 4. Fail / Modul yang Akan Diubah

1. **`server/tg-streamer/index.js`**:
   - Menambah defensive monkey-patch pada `MTProtoSender.prototype._handleRPCResult` bagi menangani kes `!state` dengan selamat (memeriksa kewujudan `result.body` dan menangkap sebarang pengecualian parsing binari).
   - Menambah defensive patch pada pembina `BinaryReader` untuk memastikan `this.stream` sentiasa sebuah Buffer sah (contoh: fallback ke `Buffer.alloc(0)` jika `undefined`/`null`).
   - Mengemas kini fungsi `isTransientTelegramError(err)` supaya turut mengenali ralat transien seperti `readUInt32LE`, `Cannot read properties of undefined`, dan `CONNECTION_NOT_INITED`.
   - Memastikan rutin `patchExportedSenderProtection` merangkumi pengirim DC sekunder dan menangani sebarang ralat terasing tanpa menyebabkan kebocoran event loop.

2. **`server/tg-streamer/matching.test.js`** (atau test suite berkaitan):
   - Menambah ujian unit terperinci bagi menguji tingkah laku `BinaryReader` dan `_handleRPCResult` apabila menerima `undefined`, `null`, objek RPC Error tanpa state, dan buffer pendek.
   - Menguji pengesanan `isTransientTelegramError` terhadap ralat berkaitan `readUInt32LE`.
   - Menguji aliran `fetchBlock` / `getOrAcquireSender` simulasi apabila ralat `CONNECTION_NOT_INITED` berlaku.

3. **`PLAN_355.md`**:
   - Dokumentasi rasmi pelan seni bina dan strategi penyelesaian isu #355.

---

## 5. Pendekatan Penyelesaian & Alternatif yang Ditolak

### 5.1 Pendekatan Terpilih: Multi-Layer Defense in Depth
Penyelesaian dilaksanakan melalui 3 lapisan pertahanan:

1. **Lapisan 1: Patch Proaktif pada `MTProtoSender.prototype._handleRPCResult`**
   - Sebelum GramJS memproses respons RPC tanpa `state`, periksa sama ada `result.error` wujud atau jika `!result.body` / `!Buffer.isBuffer(result.body)` / panjang buffer < 4.
   - Jika tiada `state` dan terdapat `result.error`, rekod log bermaklumat (debug) dan tamatkan secara bersih tanpa memanggil `BinaryReader`.
   - Jika terdapat `result.body`, laksanakan pembedahan objek di dalam blok `try/catch` komprehensif yang menangkap sebarang `Error` (termasuk `TypeError` dan `RangeError`), bukan hanya `TypeNotFoundError`.

2. **Lapisan 2: Hardening pada `BinaryReader`**
   - Lakukan monkey-patch pada `BinaryReader.prototype.constructor` atau fungsi `readInt`/`readByte` supaya jika `this.stream` tidak wujud atau bukan Buffer, ia sentiasa fallback kepada `Buffer.alloc(0)` dan mengelakkan `TypeError: Cannot read properties of undefined`.

3. **Lapisan 3: Pengukuhan `isTransientTelegramError` & Handler Kesilapan Klien**
   - Kemas kini `isTransientTelegramError` dalam `server/tg-streamer/index.js` untuk menyaring mesej ralat yang mengandungi `readUInt32LE` atau `CONNECTION_NOT_INITED` sebagai ralat transien jika ia terlepas daripada klien.

### 5.2 Alternatif yang Ditolak & Sebab Penolakan
- **Alternatif 1: Mengubah fail di dalam `node_modules/telegram/` secara langsung.**
  - *Sebab Ditolak:* Perubahan dalam `node_modules` tidak akan disimpan dalam Git dan akan hilang serta-merta apabila `npm install` dijalankan atau apabila kontena Docker dibina semula.
- **Alternatif 2: Hanya menyekat ralat dalam `isTransientTelegramError` tanpa membaiki `_handleRPCResult`.**
  - *Sebab Ditolak:* Menyekat log ralat semata-mata tidak menyelesaikan masalah asas. Di dalam GramJS, pengecualian yang dilemparkan oleh `_handleRPCResult` menyebabkan `_recvLoop` memanggil `this.reconnect()`, menghasilkan kitaran sambungan semula yang membebankan soket TCP dan berisiko menyebabkan kebocoran memori.
- **Alternatif 3: Mengabaikan ralat `CONNECTION_NOT_INITED`.**
  - *Sebab Ditolak:* `CONNECTION_NOT_INITED` menandakan bahawa sesi MTProto pada DC tersebut belum sedia untuk menerima pertanyaan muat turun. Klien wajib menginisialisasi semula pengirim pada DC berkenaan agar blok data video seterusnya dapat diambil.

---

## 6. Analisis Risiko & Mitigasi

| Risiko | Keterangan Risiko | Langkah Mitigasi |
| :--- | :--- | :--- |
| **Gangguan pada Aliran RPC Sah** | Pengubahsuaian pada `_handleRPCResult` berisiko mengganggu respons biasa yang mempunyai `state`. | Patch hanya bertindak sekiranya `!state` (tiada parent request berdaftar). Aliran biasa di mana `state` wujud diserahkan sepenuhnya kepada fungsi asal tanpa sebarang perubahan. |
| **Regresi Keserasian Versi GramJS** | Penggunaan nama pemboleh ubah dalaman GramJS mungkin berbeza jika versi dinaik taraf. | Patch memeriksa jenis fungsi (`typeof originalHandleRPCResult === 'function'`) dan menggunakan fallback selamat jika struktur GramJS berubah. |
| **Kelewatan Pengesanan Isu Tulen** | Penapisan ralat `readUInt32LE` dalam `isTransientTelegramError` mungkin menyembunyikan pepijat pembacaan strim yang sah. | Patch mengutamakan pembaikan di punca (`_handleRPCResult`) supaya ralat tidak berlaku langsung; penapisan transien hanya bertindak sebagai jaring keselamatan sekunder. |

---

## 7. Rancangan Pengujian & SDLC (Termasuk 5a & BVA)

### 7.1 SDLC Checklist Mapping
1. **Langkah 1 (/git-branch):** Beroperasi pada cawangan khusus `fix/issue-355-tgstrm-error` dari `main`.
2. **Langkah 2 (Kriteria Penerimaan Pengguna):** 3 ayat ukuran siap didokumentasikan di Seksyen 2.
3. **Langkah 3 (Development & Ujian BVA):**
   - Ujian Boundary Value Analysis (BVA) pada `BinaryReader`:
     - Input `undefined`, `null`, `Buffer.alloc(0)`, `Buffer.alloc(2)` (< 4 bait), dan buffer sah.
   - Ujian Branch Coverage pada `_handleRPCResult` patch:
     - Kes 1: `state` wujud (laluan biasa).
     - Kes 2: `!state` dengan `result.error` wujud dan `result.body` ialah `undefined`.
     - Kes 3: `!state` dengan `result.body` kosong / rosak.
     - Kes 4: `!state` dengan `result.body` sah mewakili `Api.upload.File`.
4. **Langkah 4 (Test Hujung-ke-Hujung / E2E):**
   - Menjalankan simulasi penstriman di mana pemutusan DC secara sengaja dilakukan dan membuktikan tiada unhandled error dicetuskan.
5. **Langkah 5 (QA Bebas oleh Zahrin):**
   - Hakeem akan melantik Zahrin untuk mengesahkan tiada lagi ralat pada log `/logs` dan penstriman berfungsi lancar.
6. **Langkah 5a (Semakan Keselamatan & Auth Cloudflare):**
   - Memastikan pengesahan JWT dwiarah (`cf-access-jwt-assertion` dan `CF_Authorization`) pada laluan API dan papan pemuka `/logs` kekal beroperasi mengikut standard keselamatan tanpa kebocoran data sesi Telegram.
7. **Langkah 6 (Update GitHub Ticket #355):**
   - Mengemas kini ulasan kemajuan pada isu #355 dengan ringkasan punca dan pelan penyelesaian.
8. **Langkah 7 & 7a (Rujukan Fizikal & Status HTTPS):**
   - Menguji servis melalui `https://tgstrm.beta.julietmike.net/` atau endpoint berkaitan pada rangkaian `npm_default` dengan HTTP/2 dan Force SSL.
9. **Langkah 8 (Pengendalian Kecacatan Terlepas):**
   - Menulis automated test yang **GAGAL** pada kod sedia ada (reproducing `TypeError: Cannot read properties of undefined (reading 'readUInt32LE')`), kemudian mengesahkan test tersebut bertukar **LULUS** selepas kod dibaiki.

---

## 8. Apa yang Tidak Termasuk (Out of Scope)
- Naik taraf besar ke atas pakej `telegram` (GramJS) kepada versi berbeza yang berpotensi merosakkan fungsi penstriman video sedia ada.
- Perubahan pada logik UI papan pemuka `/logs` atau frontend TMDB app.
- Mengubah reka bentuk enkripsi MTProto Telegram.

---

## 9. Langkah Seterusnya
- Menghantar dokumen ini ke Paperclip Task Document `plan`.
- Memohon pengesahan pemohon (Jefri) melalui kad pengesahan interaksi.
- Menukar status subtask kepada `in_review`.
- Menunggu kelulusan pemohon sebelum memulakan fasa pelaksanaan kod.
