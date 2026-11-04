/* CAG + PTCA Proforma Scanner — shared registry, OT list, daily Gemini
 * model check and the INBOX BATCH SCANNER, v13.
 *
 * Version numbers: from here on the sheet script and the app share one
 * number — Code13.gs goes with cagscannergemini13.html. (Code8.gs was the
 * last of the old series; nothing between 8 and 13 exists.)
 *
 * Paste this whole file into the Google Sheet's Apps Script editor
 * (Extensions → Apps Script), replacing what is there, then
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.
 * (Keep the same deployment so the web-app URL in every phone stays valid;
 * if you create a NEW deployment instead, its URL changes and every device
 * must be given the new one.)
 *
 * Web app settings: Execute as "Me", Who has access "Anyone".
 *
 * Editing rights: in Project Settings → Script properties add
 *     EDIT_KEY = <any password you choose>
 * Devices that have that key in the app's Settings can add/remove cases and
 * change OT lists; every other device is view-only. With no EDIT_KEY set,
 * everyone can edit (the old behaviour).
 *
 * ============================================================
 * What changed in v13 — the inbox batch scanner
 * ============================================================
 * Residents drop the paperwork of a case into ONE Drive folder ("CAG Inbox")
 * — either the whole proforma as one PDF, or JPEG photos of its pages — and
 * walk away. Every 5 minutes this script looks in the folder, groups the
 * files into cases, and reads each case ONE PAGE AT A TIME with Gemini,
 * pausing 3 seconds between every step. What it reads is stored, raw, in a
 * "Batch scans" tab; the files move to "Processed" (or "Failed"). The app
 * then shows a Batch screen: every scanned case, every failed one with
 * which page and which step failed and why, and a tap on a scanned case
 * opens it on the ordinary review screen with its pages alongside, so the
 * report can be checked against the paperwork before the Word file is
 * downloaded — which saves it to the registry exactly as a phone scan does.
 *
 * Set it up once:
 *   1. The script needs a Gemini key of its own in Project Settings →
 *      Script properties:  GEMINI_KEY = <a Gemini API key>  (the same key
 *      the daily model check uses). Every batch read comes out of THIS
 *      key's quota, not any phone's.
 *   2. Paste this file, deploy a new version (as above). Google asks for
 *      Drive permission the first time — accept it.
 *   3. In the editor choose setupBatchScanner in the function box and press
 *      Run. It creates the folders (CAG Inbox, with Processed and Failed
 *      inside it), schedules the 5-minute check, and prints the inbox's
 *      link in the Execution log. Share that folder with the residents
 *      (Editor), or set the script property BATCH_INBOX_SHARE = link-edit
 *      before running setup and anyone with the link can drop files in.
 *   4. Open the app (v13 or later) once as an editor: it sends its reading
 *      prompts to the sheet ("Batch prompts" tab) so the batch reads use
 *      exactly what the phones use. Until that has happened the scanner
 *      waits and says so in the log. (It is repeated automatically whenever
 *      a newer app version opens.)
 *   removeBatchScanner turns the 5-minute check off.
 *
 * How files become cases
 *   - One PDF = one case (all its pages).
 *   - JPEG / PNG photos whose names share a stem are one case:
 *       1906_1.jpg 1906_2.jpg …   or   ramesh-1.jpg ramesh-2.jpg …
 *       or   IMG_2041 (1).jpg IMG_2041 (2).jpg
 *   - Photos without a shared stem are grouped by upload time: pictures
 *     uploaded within 3 minutes of each other are taken as one case, and
 *     the case is marked "grouped by time" in the log so it is checked.
 *   - A file is only picked up once it is at least 2 minutes old, so a
 *     set of photos still being uploaded is not split in two.
 *
 * Optional script properties
 *   BATCH_INBOX        folder name, default "CAG Inbox"
 *   BATCH_INBOX_SHARE  link-edit | private   default private (share by hand)
 *   BATCH_GAP_SEC      seconds between steps, default 3
 *   BATCH_MODEL_READ   Gemini model for reading pages (default: the best
 *                      Flash model the daily check found free)
 *   BATCH_MODEL_PAGE   Gemini model for recognising which page is which
 *                      (default: the best Flash-Lite model found free)
 *   (Files are sent to Gemini exactly as uploaded — the script cannot
 *   shrink them, so phone photos should be the usual 2–5 MB JPEGs.)
 *
 * New actions for the app: batchStatus, batchList, batchGet, batchFile
 * (anyone with the URL); batchPrompts, batchRetry, batchMark, batchRunNow
 * (edit key). "whoami" replies v: 13 and says whether the scanner is set up.
 *
 * What changed in v8 — the daily check of Google's Gemini models
 * - Every morning between 5:00 and 5:30 (India time) this script asks Google
 *   which Gemini models exist, sends each likely reading model ONE tiny test
 *   request, and keeps the verdict. The app builds its model buttons from it.
 *   Set up once: GEMINI_KEY in Script properties, then run setupDailyModelCheck.
 *   removeDailyModelCheck turns the daily check off.
 *
 * What changed in v7
 * - A second PTCA for the same patient (same CAG No, same year) is its own
 *   row: a PTCA that has a PTCA No is matched by its PTCA No and nothing else.
 *
 * What changed in v6
 * - Editing a saved case (app v10): the save carries "orig" — the identity of
 *   the row the case was opened from — and this script REPLACES that row.
 *
 * What changed in v5
 * - The 1200 px copy of the coronary DIAGRAM sheet is filed in a Drive folder
 *   ("CAG diagrams") and its link written into the "Diagram image" column.
 *   Optional: DIAGRAM_FOLDER, DIAGRAM_SHARE = link | private.
 *
 * What changed in v4 — read-only "fetchCase" action.
 * What changed in v3 — CAG and PTCA on separate tabs per year, "lookup",
 *   "Case JSON" column, OT "NC" column.
 *
 * Sheets used (created if missing): "CAG <year>" / "PTCA <year>", "Lesions",
 * "OT lists", and now "Batch scans", "Batch log", "Batch prompts".
 */

var SCRIPT_VERSION = 13;   // 13.34: a model that hit its daily limit rests until Google's reset (midnight Pacific), not just an hour
var LEGACY_REG = "Registry", LES = "Lesions", OT = "OT lists";
var OT_HEAD = ["Date", "Order", "Case id", "CAG No", "Name", "IPD/OPD No", "Age", "Sex",
               "Clinical Diagnosis", "Vessel disease", "Type", "Status", "Note", "Updated",
               "Hb", "Creatinine", "Potassium", "LVEF", "RWMA", "HIV", "HBsAg", "HCV",
               "Boxes ticked", "Boxes known", "Approval", "Amount", "NC", "Height", "Weight"];
var LES_HEAD = ["CAG No", "Name", "Vessel", "Arises from", "Segment", "Stenosis %", "Characteristics",
                "Stent", "Stent type", "ISR %", "NIH", "Well endothelialized", "Stent thrombosis",
                "Stent thrombosis %", "Note"];
var CASE_JSON_COL = "Case JSON";
var CASE_JSON_MAX = 49000;          // a Sheets cell holds 50k characters
var DIAGRAM_COL = "Diagram image";  // Drive link of the 1200 px diagram copy
var DIAGRAM_FOLDER_DEFAULT = "CAG diagrams";

function doPost(e) { return handle(e); }
function doGet(e)  { return handle(e); }

function handle(e) {
  var req = {};
  try {
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    else if (e && e.parameter) req = e.parameter;
  } catch (err) { return out({ ok: false, error: "bad request" }); }
  if (!req || typeof req !== "object") req = {};
  var action = req.action || (req.headers ? "append" : "whoami");
  // The model list lives in the script's properties, not in the sheet, so
  // reading it — or running a check, which takes a few seconds — never holds
  // up a case being saved or an OT list being changed.
  if (action === "models" || action === "modelsCheck") {
    try {
      var mayEdit = editAllowed(req.key);
      if (action === "modelsCheck" && !mayEdit) return out({ ok: false, error: "This device is view-only. Add the edit key in Settings to make changes.", canEdit: false });
      return out(Object.assign({ ok: true, canEdit: mayEdit, v: SCRIPT_VERSION }, modelsInfo_(action === "modelsCheck")));
    } catch (err) {
      return out({ ok: false, error: String(err && err.message || err) });
    }
  }
  // A page image for the app's review screen can be a few MB; serving it
  // must not wait behind a running batch (which holds the lock for minutes).
  if (action === "batchFile") {
    try { return out(Object.assign({ ok: true, canEdit: editAllowed(req.key), v: SCRIPT_VERSION }, batchFile_(req))); }
    catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  if (action === "batchStatus" || action === "batchList" || action === "batchGet") {
    // read-only; the sheet is only read, so no lock is needed either
    try {
      var r0 = action === "batchStatus" ? batchStatus_() : action === "batchList" ? { cases: batchList_() } : batchGet_(req);
      return out(Object.assign({ ok: true, canEdit: editAllowed(req.key), v: SCRIPT_VERSION }, r0));
    } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  var lock = LockService.getScriptLock();
  try {
    // a batch run can hold the lock for up to 5 minutes; a phone saving a
    // case waits a little, then is told to try again rather than hanging
    if (!lock.tryLock(25000)) return out({ ok: false, error: "The sheet is busy (the batch scanner is reading a case) — try again in a minute.", busy: true });
    var canEdit = editAllowed(req.key);
    var needEdit = { append: 1, remove: 1, otSave: 1, batchPrompts: 1, batchRetry: 1, batchMark: 1, batchRunNow: 1, rosterSave: 1, batchDraft: 1, batchHousekeepSet: 1 };
    if (needEdit[action] && !canEdit) return out({ ok: false, error: "This device is view-only. Add the edit key in Settings to make changes.", canEdit: false });
    switch (action) {
      case "whoami": return out({ ok: true, canEdit: canEdit, v: SCRIPT_VERSION, modelCheck: modelsSummary_(), batch: batchStatus_() });
      case "append": { var r = appendCase(req); return out({ ok: true, canEdit: true, diagramUrl: r.diagramUrl || "", replaced: !!r.replaced, v: SCRIPT_VERSION }); }
      case "list":   return out({ ok: true, canEdit: canEdit, cases: listCases() });
      case "lookup": return out(Object.assign({ ok: true, canEdit: canEdit }, lookupCase(String(req.q || ""))));
      case "fetchCase": return out(Object.assign({ ok: true, canEdit: canEdit }, fetchCase(req)));
      case "remove": return out({ ok: true, canEdit: true, removed: removeCase(String(req.id || "")) });
      case "otGet":  return out({ ok: true, canEdit: canEdit, date: req.date, list: otGet(String(req.date || "")) });
      case "otSave": otSave(String(req.date || ""), req.list); return out({ ok: true, canEdit: true });
      case "rosterGet": return out(Object.assign({ ok: true, canEdit: canEdit, v: SCRIPT_VERSION }, rosterGet_()));
      case "rosterSave": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, rosterSave_(req)));
      case "batchPrompts": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, batchSavePrompts_(req)));
      case "batchRetry": return out({ ok: true, canEdit: true, v: SCRIPT_VERSION, retried: batchRetry_(String(req.caseId || "")) });
      case "batchMark": return out({ ok: true, canEdit: true, v: SCRIPT_VERSION, marked: batchMark_(String(req.caseId || ""), String(req.mark || ""), String(req.by || "")) });
      case "batchDraft": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, batchDraft_(req)));
      case "batchHousekeepSet": {
        var hp = PropertiesService.getScriptProperties();
        if (req.on != null) { if (req.on) hp.deleteProperty("BATCH_HOUSEKEEP_OFF"); else hp.setProperty("BATCH_HOUSEKEEP_OFF", "1"); }
        if (req.keep != null) { var kk = Number(req.keep); if (!isFinite(kk) || kk < 50) throw new Error("the limit must be at least 50 cases"); hp.setProperty("BATCH_KEEP", String(Math.round(kk))); }
        return out({ ok: true, canEdit: true, v: SCRIPT_VERSION, hkOn: !batchHousekeepOff_(), keep: batchKeepN_(), prune: batchPruneN_() });
      }
      case "batchRunNow": { lock.releaseLock(); return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, batchTick({ fromApp: true, caseId: String(req.caseId || "") }))); }
      default: return out({ ok: false, error: "unknown action " + action });
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function editAllowed(key) {
  var want = PropertiesService.getScriptProperties().getProperty("EDIT_KEY");
  return !want || String(key || "") === String(want);
}

/* A range wider than the sheet's grid throws, so grow the grid first. */
function ensureCols(sh, n) {
  var maxc = sh.getMaxColumns();
  if (maxc < n) sh.insertColumnsAfter(maxc, n - maxc);
}

function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && name === LEGACY_REG) sh = findRegistrySheet(ss);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (head) { ensureCols(sh, head.length); sh.appendRow(head); }
  } else if (head && sh.getLastRow() === 0) {
    ensureCols(sh, head.length);
    sh.appendRow(head);
  }
  return sh;
}
/* An early version of the script wrote cases to whatever tab it was given
   (often "Sheet1"). If there is no "Registry" tab, the first tab whose header
   row has "CAG No" is the legacy registry, and is renamed so it stays so. */
function findRegistrySheet(ss) {
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var sh = all[i];
    if (/^(CAG|PTCA) \d{4}$/.test(sh.getName())) continue;
    if (/^Batch /.test(sh.getName())) continue;
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) continue;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    if (head.indexOf("CAG No") >= 0 && head.indexOf("Name") >= 0 && head.indexOf("Vessel") < 0 && head.indexOf("Type") < 0) {
      try { sh.setName(LEGACY_REG); } catch (e) {}
      return sh;
    }
  }
  return null;
}

function headersOf(sh) {
  if (sh.getLastColumn() === 0) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

/* ---------- the registry sheets: one per type per year ---------- */
function regSheetName(type, year) { return (type === "PTCA" ? "PTCA " : "CAG ") + year; }

/* Every sheet that holds cases, newest year first; the legacy Registry tab
   (if it exists and has rows) comes last, read as CAG cases. */
function regSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = [];
  ss.getSheets().forEach(function (sh) {
    var m = /^(CAG|PTCA) (\d{4})$/.exec(sh.getName());
    if (m) list.push({ sh: sh, type: m[1], year: Number(m[2]) });
  });
  list.sort(function (a, b) { return b.year - a.year || (a.type < b.type ? -1 : 1); });
  var legacy = ss.getSheetByName(LEGACY_REG) || findRegistrySheet(ss);
  if (legacy && legacy.getLastRow() > 1) list.push({ sh: legacy, type: "CAG", year: 0, legacy: true });
  return list;
}

/* ---------- saving a case ---------- */
function appendCase(req) {
  var headers = (req.headers || []).map(String);
  var values = (req.values || []).map(function (v) { return v == null ? "" : String(v); });
  if (!headers.length) throw new Error("no fields");
  var type = String(req.type || "").trim() === "PTCA" ? "PTCA" : "CAG";
  var year = /^\d{4}$/.test(String(req.year || "")) ? String(req.year) : String(new Date().getFullYear());
  var diagramB64 = String(req.diagramB64 || "");

  var sh = sheet(regSheetName(type, year), null);
  var have = headersOf(sh);
  var wanted = headers.concat([CASE_JSON_COL, "Saved at"]);
  if (diagramB64) wanted.push(DIAGRAM_COL);
  if (!have.length) {
    have = wanted.slice();
    ensureCols(sh, have.length);
    sh.appendRow(have);
  }
  // new fields the app has started sending become new columns at the end
  var added = false;
  wanted.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); added = true; } });
  if (added) { ensureCols(sh, have.length); sh.getRange(1, 1, 1, have.length).setValues([have]); }

  var row = have.map(function (h) { var i = headers.indexOf(h); return i >= 0 ? values[i] : ""; });
  row[have.indexOf("Saved at")] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var cj = String(req.caseJson || "");
  row[have.indexOf(CASE_JSON_COL)] = cj.length && cj.length <= CASE_JSON_MAX ? cj : "";

  var g = function (h) { var i = headers.indexOf(h); return i >= 0 ? String(values[i] || "").trim() : ""; };
  var cagNo = g("CAG No");
  var ptcaNo = String(req.ptcaNo || g("PTCA No") || "").trim();
  var name = g("Name");

  // upsert within this sheet: a PTCA that has a PTCA No is that PTCA No and
  // nothing else — one patient can have several PTCAs under one CAG No (v7);
  // a PTCA without one is its CAG No; a CAG row is its CAG No; last resort,
  // the name
  var at = 0;
  if (type === "PTCA" && ptcaNo) at = findRow(sh, have.indexOf("PTCA No") + 1, ptcaNo);
  else if (cagNo) at = findRow(sh, have.indexOf("CAG No") + 1, cagNo);
  else if (!ptcaNo && name) at = findRow(sh, have.indexOf("Name") + 1, name);
  // 13.26 — the real PTCA replaces the "Planned PTCA" entry saved for the same CAG
  if (type === "PTCA" && !at && cagNo && have.indexOf("Case status") >= 0 && sh.getLastRow() >= 2) {
    var cs = have.indexOf("Case status") + 1, cc = have.indexOf("CAG No") + 1;
    var vals2 = sh.getRange(2, 1, sh.getLastRow() - 1, have.length).getValues();
    for (var pi = 0; pi < vals2.length; pi++) {
      if (String(vals2[pi][cc - 1]).trim() === cagNo && /planned/i.test(String(vals2[pi][cs - 1]))) { at = pi + 2; break; }
    }
  }

  // v6 — an edited case replaces the row it was opened from ("orig"), found by
  // its list id and verified by its numbers, wherever that row now sits
  var orig = req.orig && typeof req.orig === "object" ? req.orig : null;
  var origWant = orig ? {
    cagNo: String(orig.cagNo || "").trim(), ptcaNo: String(orig.ptcaNo || "").trim(), name: String(orig.name || "").trim()
  } : null;
  var from = orig ? locateCase(String(orig.type || "") === "PTCA" ? "PTCA" : "CAG", origWant, String(orig.id || "")) : null;
  // the old row is on this very tab and nothing else carries the new identity:
  // rewrite it in place, so the case keeps its position in the sheet
  if (from && !at && from.sheet.getName() === sh.getName()) at = from.row;

  // the diagram: a new photo is filed in Drive and its link written to the
  // row; a re-save without one keeps the link the row already has
  var dcol = have.indexOf(DIAGRAM_COL);
  var diagramUrl = "";
  if (dcol >= 0) {
    var old = at ? cell(sh.getRange(at, dcol + 1).getValue()) : "";
    if (diagramB64) {
      diagramUrl = saveDiagram(type, year, type === "PTCA" ? (ptcaNo || cagNo) : cagNo, name, diagramB64);
    } else if (from) {
      // an edit: the case's own link, else the one on the row it replaces
      var sent = String(row[dcol] || "");
      var fromLink = linkIn(from);
      diagramUrl = /^https?:\/\//.test(sent) ? sent : /^https?:\/\//.test(fromLink) ? fromLink : (/^https?:\/\//.test(old) ? old : sent);
    } else {
      diagramUrl = /^https?:\/\//.test(old) ? old : String(row[dcol] || "");
    }
    row[dcol] = diagramUrl;
  }

  if (at) sh.getRange(at, 1, 1, have.length).setValues([row]);
  else sh.appendRow(row);

  // the row the edit came from, when it is not the one just written: gone
  // (checked once more against its numbers right before deleting)
  var replaced = false;
  if (from && !(from.sheet.getName() === sh.getName() && from.row === at)) {
    if (from.row >= 2 && from.row <= from.sheet.getLastRow()) {
      var fh = headersOf(from.sheet);
      var fv = from.sheet.getRange(from.row, 1, 1, fh.length).getValues()[0];
      if (rowMatches(fh, fv, origWant)) { from.sheet.deleteRow(from.row); replaced = true; }
    }
  } else if (from) replaced = true;

  if (type === "CAG") {
    // the same case saved before v3 sits on the legacy Registry tab — remove
    // it there so the shared list never shows it twice
    if (cagNo) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var legacy = ss.getSheetByName(LEGACY_REG);
      if (legacy && legacy !== sh && legacy.getLastRow() > 1) {
        var lh = headersOf(legacy);
        var ci = lh.indexOf("CAG No");
        if (ci >= 0) deleteRowsWhere(legacy, ci + 1, cagNo);
      }
    }
    // lesions: replace this case's rows — and those filed under its old CAG No
    var les = sheet(LES, LES_HEAD);
    if (cagNo) deleteRowsWhere(les, 1, cagNo);
    if (from && origWant.cagNo && origWant.cagNo !== cagNo) deleteRowsWhere(les, 1, origWant.cagNo);
    (req.lesions || []).forEach(function (l) { if (Array.isArray(l)) les.appendRow(l.map(function (v) { return v == null ? "" : String(v); })); });
  }
  // v13 — a case that came through the inbox is marked saved in the Batch tab
  if (req.batchCaseId) { try { batchMark_(String(req.batchCaseId), "saved", g("Saved by") || String(req.by || "")); } catch (e) {} }
  return { diagramUrl: diagramUrl, replaced: replaced };
}

/* ---------- finding one case's row (v6) ----------
   By its list id ("<tab>!<row>", or a legacy "r<n>") when that row still
   carries the case's numbers; otherwise by PTCA No (PTCA) / CAG No / name
   across that type's tabs, newest year first. Never a row that merely sits
   where the case used to be. */
function locateCase(type, want, id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = null, row = 0;
  var legacy = /^r(\d+)$/.exec(String(id || ""));
  if (legacy) { sh = ss.getSheetByName(LEGACY_REG); row = Number(legacy[1]); }
  else if (id) {
    var bang = String(id).lastIndexOf("!");
    if (bang > 0) { sh = ss.getSheetByName(String(id).slice(0, bang)); row = Number(String(id).slice(bang + 1)); }
  }
  if (sh && row >= 2 && row <= sh.getLastRow()) {
    var have = headersOf(sh);
    var vals = sh.getRange(row, 1, 1, have.length).getValues()[0];
    if (rowMatches(have, vals, want)) return { sheet: sh, row: row, have: have, vals: vals };
  }
  var entries = regSheets().filter(function (e) { return e.type === type; });
  for (var i = 0; i < entries.length; i++) {
    var s2 = entries[i].sh;
    var have2 = headersOf(s2);
    if (!have2.length || s2.getLastRow() < 2) continue;
    var r2 = 0;
    if (type === "PTCA" && want.ptcaNo) r2 = findRow(s2, have2.indexOf("PTCA No") + 1, want.ptcaNo);
    else if (want.cagNo) r2 = findRow(s2, have2.indexOf("CAG No") + 1, want.cagNo);
    else if (want.name) r2 = findRow(s2, have2.indexOf("Name") + 1, want.name);
    if (r2) return { sheet: s2, row: r2, have: have2, vals: s2.getRange(r2, 1, 1, have2.length).getValues()[0] };
  }
  return null;
}
/* a row carries the case when its own number matches — PTCA No for a PTCA
   case that has one, else CAG No, else the name; a case with none of them
   matches nothing, so nothing can ever be deleted for it by accident */
function rowMatches(have, vals, want) {
  var g = function (h) { var i = have.indexOf(h); return i < 0 ? "" : String(cell(vals[i])).trim(); };
  if (want.ptcaNo && have.indexOf("PTCA No") >= 0) return g("PTCA No") === want.ptcaNo;
  if (want.cagNo) return g("CAG No") === want.cagNo;
  if (want.name) return g("Name") === want.name;
  return false;
}
function linkIn(hit) {
  var i = hit.have.indexOf(DIAGRAM_COL);
  return i < 0 ? "" : cell(hit.vals[i]);
}

/* ---------- the diagram copies in Drive ---------- */
function diagramFolder() {
  var name = PropertiesService.getScriptProperties().getProperty("DIAGRAM_FOLDER") || DIAGRAM_FOLDER_DEFAULT;
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
/* One JPEG per case: "CAG_2026_1906_Ramesh_Patil.jpg". A case re-saved with
   a new photo replaces its earlier file (matched on type, year and number),
   so the folder never fills with stale copies. Returns the file's link. */
function saveDiagram(type, year, number, name, b64) {
  var folder = diagramFolder();
  var num = String(number || "").replace(/[^A-Za-z0-9\-]/g, "");
  var base = type + "_" + year + "_" + (num || "no-number");
  var who = String(name || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  var fname = base + (who ? "_" + who : "") + ".jpg";
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, "image/jpeg", fname);
  if (num) {
    var older = folder.searchFiles("title contains '" + base + "'");
    while (older.hasNext()) {
      var f = older.next();
      var fn = f.getName();
      if (fn === base + ".jpg" || fn.indexOf(base + "_") === 0) f.setTrashed(true);
    }
  }
  var file = folder.createFile(blob);
  var share = String(PropertiesService.getScriptProperties().getProperty("DIAGRAM_SHARE") || "link").toLowerCase();
  if (share !== "private") {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }
  return "https://drive.google.com/file/d/" + file.getId() + "/view";
}

function findRow(sh, col, value) {
  if (col < 1 || sh.getLastRow() < 2) return 0;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === value) return i + 2;
  return 0;
}

function deleteRowsWhere(sh, col, value) {
  if (sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() === value) sh.deleteRow(i + 2);
}

/* ---------- listing ---------- */
function listCases() {
  var list = [];
  regSheets().forEach(function (entry) {
    var sh = entry.sh;
    var have = headersOf(sh);
    if (!have.length || sh.getLastRow() < 2) return;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, have.length).getValues();
    var g = function (r, h) { var i = have.indexOf(h); return i < 0 ? "" : cell(r[i]); };
    // prefer a post-CAG repeat value where the PTCA row carries one
    var g2 = function (r, h) { return g(r, h + " (repeat)") || g(r, h); };
    var sheetName = sh.getName();
    rows.forEach(function (r, i) {
      var name = g(r, "Name"), cag = g(r, "CAG No");
      if (!name && !cag) return;
      var isPtca = entry.type === "PTCA";
      list.push({
        id: sheetName + "!" + (i + 2), ptype: entry.type,
        name: name, cagNo: cag, ptcaNo: g(r, "PTCA No"), ipd: g(r, "IPD/OPD No"), date: g(r, "Date"),
        savedAt: g(r, "Saved at"), age: g(r, "Age"), sex: g(r, "Sex"), dx: g(r, "Clinical Diagnosis"),
        vessel: isPtca
          ? (g(r, "CAG finding") ? "CAG s/o " + g(r, "CAG finding")
             : (g(r, "PTCA to") ? "PTCA to " + g(r, "PTCA to") : ""))
          : g(r, "Vessel disease"),
        plan: g(r, "Plan"), lm: g(r, "LM involved"), lad: g(r, "LAD involved"),
        lcx: g(r, "LCx involved"), rca: g(r, "RCA involved"),
        hb: g2(r, "Hb"),
        creat: isPtca ? (g(r, "Latest creatinine") || g2(r, "Sr. Creatinine")) : g(r, "Sr. Creatinine"),
        naK: g2(r, "Sr. Na/K"), lvef: g(r, "LVEF (%)"), rwma: g(r, "RWMA"),
        hiv: g2(r, "HIV"), hbsag: g2(r, "HBsAg"), hcv: g2(r, "HCV"),
        ckTicked: g(r, "Checklist ticked"), ckMissing: g(r, "Checklist missing"),
        ckKnown: have.indexOf("Checklist ticked") >= 0 && !!(g(r, "Checklist ticked") || g(r, "Checklist missing")),
        approval: g(r, "Approval"), amount: g(r, "Amount of approval"), nc: g(r, "NC status"),
        ptcaTo: g(r, "PTCA to"), savedBy: g(r, "Saved by"),
        height: g(r, "Height (cm)"), weight: g(r, "Weight (kg)"), caseStatus: g(r, "Case status"),
        diagram: g(r, DIAGRAM_COL),
      });
    });
  });
  return list;
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  return v == null ? "" : String(v);
}

function removeCase(id) {
  id = String(id || "");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = null, row = 0;
  var legacy = /^r(\d+)$/.exec(id);          // ids issued by the v2 script
  if (legacy) {
    sh = ss.getSheetByName(LEGACY_REG);
    row = Number(legacy[1]);
  } else {
    var bang = id.lastIndexOf("!");
    if (bang < 1) return false;
    sh = ss.getSheetByName(id.slice(0, bang));
    row = Number(id.slice(bang + 1));
  }
  if (!sh || !(row >= 2) || row > sh.getLastRow()) return false;
  var have = headersOf(sh);
  var cag = have.indexOf("CAG No") >= 0 ? String(sh.getRange(row, have.indexOf("CAG No") + 1).getValue() || "").trim() : "";
  var isPtca = /^PTCA /.test(sh.getName());
  sh.deleteRow(row);
  if (cag && !isPtca) deleteRowsWhere(sheet(LES, LES_HEAD), 1, cag);
  return true;
}

/* ---------- lookup: a CAG case by CAG No or IPD/OPD No ----------
   Used by the app's PTCA screen to auto-fill bloods, echo and the vessel
   findings. CAG sheets are searched newest year first, then the legacy tab;
   an exact CAG No match wins over an IPD/OPD match. */
function lookupCase(q) {
  q = String(q || "").trim();
  if (!q) return { found: false };
  var sheets = regSheets().filter(function (e) { return e.type === "CAG"; });
  var byIpd = null;
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s].sh;
    var have = headersOf(sh);
    if (!have.length || sh.getLastRow() < 2) continue;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, have.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var g = function (h) { var k = have.indexOf(h); return k < 0 ? "" : cell(rows[i][k]); };
      if (String(g("CAG No")).trim() === q) return lookupHit(have, rows[i]);
      if (!byIpd && String(g("IPD/OPD No")).trim() === q) byIpd = { have: have, row: rows[i] };
    }
  }
  if (byIpd) return lookupHit(byIpd.have, byIpd.row);
  return { found: false };
}
function lookupHit(have, row, noLesions) {
  var fields = [];
  var caseJson = "";
  var cagNo = "";
  have.forEach(function (h, i) {
    var v = cell(row[i]);
    if (h === CASE_JSON_COL) { caseJson = v; return; }
    if (h === "CAG No") cagNo = String(v).trim();
    if (v !== "") fields.push([h, v]);
  });
  var lesions = [];
  if (cagNo && !noLesions) {
    var les = sheet(LES, LES_HEAD);
    if (les.getLastRow() > 1) {
      var lr = les.getRange(2, 1, les.getLastRow() - 1, Math.max(les.getLastColumn(), LES_HEAD.length)).getValues();
      lr.forEach(function (r) {
        if (String(r[0]).trim() === cagNo) lesions.push(r.map(cell));
      });
    }
  }
  return { found: true, fields: fields, lesions: lesions, caseJson: caseJson };
}

/* ---------- fetchCase: one case's complete data, for rebuilding its report --
   Read-only, so view-only devices can use it. The id ("<sheet>!<row>", or a
   legacy "r<n>") is tried first and VERIFIED against the identifying numbers
   sent with it — rows shift when one above is deleted — and on a mismatch the
   case is re-found by PTCA No (PTCA rows) or CAG No, else by name. */
function fetchCase(req) {
  var id = String(req.id || "");
  var type = String(req.type || "") === "PTCA" ? "PTCA" : "CAG";
  var want = {
    cagNo: String(req.cagNo || "").trim(),
    ptcaNo: String(req.ptcaNo || "").trim(),
    name: String(req.name || "").trim(),
  };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = null, row = 0;
  var legacy = /^r(\d+)$/.exec(id);
  if (legacy) { sh = ss.getSheetByName(LEGACY_REG); row = Number(legacy[1]); }
  else {
    var bang = id.lastIndexOf("!");
    if (bang > 0) { sh = ss.getSheetByName(id.slice(0, bang)); row = Number(id.slice(bang + 1)); }
  }
  var hit = null;
  if (sh && row >= 2 && row <= sh.getLastRow()) {
    var have = headersOf(sh);
    var vals = sh.getRange(row, 1, 1, have.length).getValues()[0];
    var g = function (h) { var i = have.indexOf(h); return i < 0 ? "" : String(cell(vals[i])).trim(); };
    var matches = want.ptcaNo ? g("PTCA No") === want.ptcaNo
      : want.cagNo ? g("CAG No") === want.cagNo
      : want.name ? g("Name") === want.name
      : true;
    if (matches) hit = { have: have, row: vals, sheet: sh };
  }
  if (!hit) {
    var entries = regSheets().filter(function (e) { return e.type === type; });
    for (var i = 0; i < entries.length && !hit; i++) {
      var s2 = entries[i].sh;
      var have2 = headersOf(s2);
      if (!have2.length || s2.getLastRow() < 2) continue;
      var r2 = 0;
      if (type === "PTCA" && want.ptcaNo) r2 = findRow(s2, have2.indexOf("PTCA No") + 1, want.ptcaNo);
      else if (want.cagNo) r2 = findRow(s2, have2.indexOf("CAG No") + 1, want.cagNo);
      else if (!want.ptcaNo && want.name) r2 = findRow(s2, have2.indexOf("Name") + 1, want.name);
      if (r2) hit = { have: have2, row: s2.getRange(r2, 1, 1, have2.length).getValues()[0], sheet: s2 };
    }
  }
  if (!hit) return { found: false };
  var res = lookupHit(hit.have, hit.row, /^PTCA /.test(hit.sheet.getName()));
  res.ptype = /^PTCA /.test(hit.sheet.getName()) ? "PTCA" : "CAG";
  return res;
}

/* ---------- the department's rosters (13.22) ----------
   "Rosters" tab: Key | Value | Updated | By. The value is the Settings
   screen's text form ("Name | Role | aliases", one per line); an empty value
   means "use the app's built-in list". */
var ROSTERS = "Rosters";
function rosterSheet_() { return sheet(ROSTERS, ["Key", "Value", "Updated", "By"]); }
function rosterGet_() {
  var sh = rosterSheet_();
  var o = { operators: "", technicians: "", updatedAt: "", by: "" };
  if (sh.getLastRow() < 2) return o;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var k = String(r[0] || "");
    if (k === "operators" || k === "technicians") { o[k] = cell(r[1]); var u = cell(r[2]); if (u > o.updatedAt) { o.updatedAt = u; o.by = cell(r[3]); } }
  });
  return o;
}
function rosterSave_(req) {
  var sh = rosterSheet_();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var by = String(req.by || "");
  var rows = {};
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) { rows[String(r[0] || "")] = i + 2; });
  ["operators", "technicians"].forEach(function (k) {
    if (req[k] == null) return;
    var v = String(req[k]);
    if (v.length > 49000) throw new Error("the " + k + " list is longer than a cell can hold");
    var row = rows[k];
    if (!row) { sh.appendRow([k, v, now, by]); rows[k] = sh.getLastRow(); }
    else sh.getRange(row, 1, 1, 4).setValues([[k, v, now, by]]);
  });
  return { updatedAt: now, by: by };
}

/* ---------- OT lists ---------- */
function otSheet() {
  var sh = sheet(OT, OT_HEAD);
  ensureCols(sh, OT_HEAD.length);
  if (sh.getLastColumn() < OT_HEAD.length || String(sh.getRange(1, OT_HEAD.length).getValue()) !== OT_HEAD[OT_HEAD.length - 1]) {
    sh.getRange(1, 1, 1, OT_HEAD.length).setValues([OT_HEAD]);
  }
  return sh;
}
function otGet(date) {
  var sh = otSheet();
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, OT_HEAD.length).getValues();
  var list = [];
  rows.forEach(function (r) {
    if (cell(r[0]).slice(0, 10) !== date) return;
    list.push({ order: Number(r[1]) || 0, id: cell(r[2]), cagNo: cell(r[3]), name: cell(r[4]), ipd: cell(r[5]),
      age: cell(r[6]), sex: cell(r[7]), dx: cell(r[8]), vessel: cell(r[9]), type: cell(r[10]) || "CAG",
      status: cell(r[11]), note: cell(r[12]),
      hb: cell(r[14]), creat: cell(r[15]), k: cell(r[16]), ef: cell(r[17]), rwma: cell(r[18]),
      hiv: cell(r[19]), hbsag: cell(r[20]), hcv: cell(r[21]),
      boxes: cell(r[22]), boxesKnown: String(r[23]) === "true", approval: cell(r[24]), amount: cell(r[25]),
      nc: cell(r[26]), height: cell(r[27]), weight: cell(r[28]) });
  });
  list.sort(function (a, b) { return a.order - b.order; });
  return list;
}

function otSave(date, list) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("bad date");
  if (!Array.isArray(list)) list = [];
  var sh = otSheet();
  // drop that day's rows, then write the new list
  if (sh.getLastRow() >= 2) {
    var dates = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = dates.length - 1; i >= 0; i--) if (cell(dates[i][0]).slice(0, 10) === date) sh.deleteRow(i + 2);
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var rows = list.map(function (e, i) {
    e = e || {};
    return [date, Number(e.order) || (i + 1), e.id || "", e.cagNo || "", e.name || "", e.ipd || "", e.age || "", e.sex || "",
            e.dx || "", e.vessel || "", e.type || "CAG", e.status || "", e.note || "", now,
            e.hb || "", e.creat || "", e.k || "", e.ef || "", e.rwma || "", e.hiv || "", e.hbsag || "", e.hcv || "",
            e.boxes || "", e.boxesKnown ? "true" : "false", e.approval || "", e.amount || "", e.nc || "", e.height || "", e.weight || ""];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, OT_HEAD.length).setValues(rows);
  // date column as text so 2026-09-22 never turns into a Date object
  sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat("@");
}

/* ============================================================
   The inbox batch scanner (v13)
   ============================================================ */
var BATCH_INBOX_DEFAULT = "CAG Inbox";
var BATCH_DONE = "Processed", BATCH_FAIL = "Failed";
var BATCH_TAB = "Batch scans", BATCH_LOG = "Batch log", BATCH_PROMPTS = "Batch prompts";
var BATCH_FN = "batchTick";
var BATCH_EVERY_MIN = 5;
var BATCH_GAP_MS_DEFAULT = 3000;        // the pause between every step
var BATCH_BUDGET_MS = 240000;           // a run stops starting new steps after 4 min (Google kills it at 6;
                                        // a slow 503 chain can eat a minute, so the margin is generous)
var BATCH_MIN_AGE_MS = 2 * 60 * 1000;   // a file is picked up once it is this old (uploads finish)
var BATCH_BURST_MS = 3 * 60 * 1000;     // photos this close together, with no shared stem, are one case
var BATCH_MAX_FILE = 20 * 1024 * 1024;  // Gemini's inline limit is 20 MB
var BATCH_FETCH_TIMEOUT_NOTE = "Google did not answer within the time limit (the file may be too large or the service slow)";
var BATCH_HEAD = ["Case id", "Status", "Created", "Updated", "Files", "File ids", "Pages", "Grouping",
                  "Name", "CAG No", "Page map", "Results", "Errors", "Log", "Models", "Opened by", "Saved by", "Run id", "Type",
                  "Uploaded", "Scanned at", "Checked at", "Files removed", "Draft", "Draft at", "Draft by", "Draft ms"];
/* Drive housekeeping: once more than BATCH_KEEP cases still have their files
   in Processed/Failed, the oldest BATCH_PRUNE of them that have been checked
   (saved or dismissed) or failed lose their files; the readings stay in the
   sheet. Script properties BATCH_KEEP / BATCH_PRUNE override. */
var BATCH_KEEP_DEFAULT = 150, BATCH_PRUNE_DEFAULT = 20;
/* the inbox has two sub-folders: CAG (angiogram proformas) and PTCA (PTCA
   proformas + the utilization sheet). Files dropped in the inbox root count
   as CAG, as before 13.13. */
var BATCH_SUB_CAG = "CAG", BATCH_SUB_PTCA = "PTCA";
/* the sheet slots the app knows. CAG: the page footer "Page N of 4" gives
   p1/a1/a2/a3 directly; the diagram sheet has no footer and is recognised by
   its drawing. PTCA: "PTCA — Page N of 4" gives q1–q4; the utilization
   report (qu) has no footer. */
var BATCH_SLOTS = ["p1", "a1", "a2", "a3", "d", "q1", "q2", "q3", "q4", "qu"];
var BATCH_SLOTS_OF = { CAG: ["p1", "a1", "a2", "a3", "d"], PTCA: ["q1", "q2", "q3", "q4", "qu"] };
var BATCH_NEEDED_OF = { CAG: ["p1", "a1", "a2", "a3"], PTCA: ["q1", "q2", "q3", "q4"] };
var BATCH_SLOT_WORD = { p1: "Sheet 1 (clinical proforma)", a1: "Sheet 2 (angiogram page 1)",
  a2: "Sheet 3 (angiogram page 2)", a3: "Sheet 4 (angiogram page 3)", d: "Sheet 5 (coronary diagram)",
  q1: "PTCA sheet 1 (front page)", q2: "PTCA sheet 2 (investigations)", q3: "PTCA sheet 3 (procedure & technique)",
  q4: "PTCA sheet 4 (bif / thrombus / calcium)", qu: "PTCA utilization report", other: "not a proforma page" };
function batchType_(t) { return String(t || "").toUpperCase() === "PTCA" ? "PTCA" : "CAG"; }

/* ---- setup / teardown (run from the editor) ---- */
function setupBatchScanner() {
  if (!geminiKey_()) {
    throw new Error("Add the key first: Project Settings → Script properties → Add script property → " +
      "GEMINI_KEY = a Gemini API key. Then run setupBatchScanner again.");
  }
  var f = batchFolders_();
  var share = String(PropertiesService.getScriptProperties().getProperty("BATCH_INBOX_SHARE") || "private").toLowerCase();
  if (share === "link-edit") {
    try { f.inbox.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch (e) { Logger.log("Could not share the inbox by link: " + e); }
  }
  PropertiesService.getScriptProperties().deleteProperty("BATCH_OFF");
  var installed = installBatchTrigger_();
  sheet(BATCH_TAB, BATCH_HEAD); sheet(BATCH_LOG, ["Time", "Case id", "Page", "Step", "Outcome", "Detail", "Run id"]);
  Logger.log("Inbox folder: " + f.inbox.getUrl());
  Logger.log("  CAG proformas go in: " + f.cag.getUrl());
  Logger.log("  PTCA proformas go in: " + f.ptca.getUrl());
  Logger.log("  Read files move to Processed/CAG, Processed/PTCA, Failed/CAG, Failed/PTCA.");
  Logger.log(share === "link-edit" ? "Anyone with that link can add files." : "Share that folder with the residents (Editor) so they can upload.");
  Logger.log(installed ? "The inbox is now checked every " + BATCH_EVERY_MIN + " minutes." : "The " + BATCH_EVERY_MIN + "-minute check was already set up.");
  var p = batchPrompts_();
  Logger.log(p ? "Reading prompts: app v" + (p.appVersion || "?") + " (sent " + (p.sentAt || "?") + ")."
    : "No reading prompts yet — open the app (v13 or later) once as an editor; it sends them. Until then the scanner waits.");
  return { inbox: f.inbox.getUrl(), installed: installed, promptsReady: !!p };
}
/* Run from the editor's function box to scan the inbox now, as the app's
   "Scan the inbox now" button does. */
function runBatchNow() {
  var r = batchTick({ fromApp: true });
  Logger.log(!r.ran ? "Did not run: " + r.why : r.cases ? r.scanned + " scanned, " + r.failed + " failed" + (r.why ? " (" + r.why + ")" : "") : "Nothing new in the inbox" + (r.why ? " (" + r.why + ")" : "") + ".");
  return r;
}
function removeBatchScanner() {
  PropertiesService.getScriptProperties().setProperty("BATCH_OFF", "1");
  batchTriggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log("The inbox check is off. Run setupBatchScanner to turn it back on.");
}
function batchTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === BATCH_FN; });
}
function installBatchTrigger_() {
  var have = batchTriggers_();
  for (var i = 1; i < have.length; i++) ScriptApp.deleteTrigger(have[i]);
  if (have.length) return false;
  ScriptApp.newTrigger(BATCH_FN).timeBased().everyMinutes(BATCH_EVERY_MIN).create();
  return true;
}
function batchOff_() { return PropertiesService.getScriptProperties().getProperty("BATCH_OFF") === "1"; }
function batchGapMs_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BATCH_GAP_SEC");
  if (raw == null || String(raw).trim() === "") return BATCH_GAP_MS_DEFAULT;
  var s = Number(raw);
  return isFinite(s) && s >= 0 ? Math.round(s * 1000) : BATCH_GAP_MS_DEFAULT;
}
/* how many runs a page that Google could not answer (503, timeout, an
   unreadable reply) is tried again in before it counts as failed */
var BATCH_MAX_TRIES = 4;
function batchFolders_() {
  var name = PropertiesService.getScriptProperties().getProperty("BATCH_INBOX") || BATCH_INBOX_DEFAULT;
  var it = DriveApp.getFoldersByName(name);
  var inbox = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  var sub = function (n) { var s = inbox.getFoldersByName(n); return s.hasNext() ? s.next() : inbox.createFolder(n); };
  return { inbox: inbox, cag: sub(BATCH_SUB_CAG), ptca: sub(BATCH_SUB_PTCA), done: sub(BATCH_DONE), fail: sub(BATCH_FAIL) };
}

/* ---- the prompts the app sent ---- */
function batchSavePrompts_(req) {
  var p = req.prompts && typeof req.prompts === "object" ? req.prompts : null;
  if (!p) throw new Error("no prompts");
  var sh = sheet(BATCH_PROMPTS, ["Key", "Value"]);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var rows = [["appVersion", String(req.appVersion || "")], ["sentAt", stamp], ["sentBy", String(req.by || "")]];
  var n = 0;
  Object.keys(p).forEach(function (k) {
    var v = String(p[k] == null ? "" : p[k]);
    if (v.length > 49000) throw new Error("prompt " + k + " is longer than a cell can hold");
    rows.push([k, v]); n++;
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  CacheService.getScriptCache().remove("batchPrompts");
  return { prompts: n, appVersion: String(req.appVersion || ""), sentAt: stamp };
}
function batchPrompts_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BATCH_PROMPTS);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var o = {};
  rows.forEach(function (r) { if (String(r[0])) o[String(r[0])] = cell(r[1]); });
  // the four CAG tick sheets are the minimum; the diagram and page prompts
  // are optional, and so is the PTCA set (q1–q4, qu, pagePtca) — a PTCA case
  // waits until an app of 13.13 or later has sent them
  if (!o.p1 || !o.a1 || !o.a2 || !o.a3) return null;
  o.ptcaReady = !!(o.q1 && o.q2 && o.q3 && o.q4 && o.qu);
  return o;
}

/* ---- which models to use ---- */
function batchModels_() {
  var props = PropertiesService.getScriptProperties();
  var read = String(props.getProperty("BATCH_MODEL_READ") || "").trim();
  var page = String(props.getProperty("BATCH_MODEL_PAGE") || "").trim();
  if (!read || !page) {
    var m = readModels_();
    var usable = ((m && m.models) || []).filter(function (x) { return x && x.usable; }).sort(mcCompareIds);
    var pick = function (tier) { var hit = usable.filter(function (x) { return x.tier === tier; })[0]; return hit ? hit.id : ""; };
    if (!read) read = pick("mid") || pick("high") || pick("low") || "gemini-2.5-flash";
    if (!page) page = pick("low") || pick("mid") || read;
  }
  // fallbacks when Google is overloaded for one model (503): the other free
  // models, mid tier first for reading, low first for page recognition
  var m2 = readModels_();
  var free = ((m2 && m2.models) || []).filter(function (x) { return x && x.usable; }).sort(mcCompareIds);
  var order = function (first, tiers) {
    var out = [first];
    tiers.forEach(function (t) { free.forEach(function (x) { if (x.tier === t && out.indexOf(x.id) < 0) out.push(x.id); }); });
    return out.slice(0, 5);
  };
  return { read: read, page: page, readChain: order(read, ["mid", "high", "low"]), pageChain: order(page, ["low", "mid"]) };
}
/* one step, tried on each model of the chain in turn while Google answers
   with a temporary fault, with the usual pause between attempts */
function batchCallChain_(key, chain, prompt, item, pdfPage, pause, timeLeft) {
  var r = null, tried = 0;
  // a model whose free limit was hit in the last hour is skipped outright
  var resting = batchResting_();
  var live = chain.filter(function (m) { return !resting[m]; });
  if (!live.length) return { ok: false, quota: true, retry: true, reason: "every free model's limit is used up for now (" + chain.join(", ") + ") — the scanner carries on in a later run" };
  for (var i = 0; i < live.length; i++) {
    // a slow Google answer can take a minute: no further model is tried
    // when the run is short of time — the page waits for the next run
    if (tried && timeLeft && timeLeft() < 90000) { r.reason = r.reason + " (no time left this run to try another model)"; return r; }
    if (tried) pause();
    r = batchGemini_(key, live[i], prompt, item, pdfPage);
    tried++;
    if (r.ok) { if (live[i] !== chain[0]) r.via = live[i]; return r; }
    if (r.quota && r.nofree) return r;             // the model name is wrong for a free key: a setting, not a fault
    if (r.quota) { r.retry = true; continue; }     // limit hit: the next model carries on
    if (!r.retry && !r.tryOther) return r;         // not a temporary fault: another model won't help
  }
  if (r && r.quota) r.reason = "the free limit is used up on every model tried this hour — the scanner carries on in a later run";
  return r;
}

/* ---- the 5-minute tick ---- */
function batchTick(opts) {
  opts = opts || {};
  var start = Date.now();
  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  if (batchOff_()) return { ran: false, why: "off" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(opts.fromApp ? 5000 : 1000)) { batchLogRow_(runId, "", "", "run", "skipped", "another run is in progress"); return { ran: false, why: "another run is in progress" }; }
  var summary = { ran: true, runId: runId, cases: 0, scanned: 0, failed: 0, pending: 0, why: "" };
  // a heartbeat: a run that Google kills at its 6-minute limit never gets to
  // write BATCH_LAST, so the start is written first and a stale start is
  // reported by batchStatus_ as "cut off"
  var props = PropertiesService.getScriptProperties();
  props.setProperty("BATCH_RUNNING", JSON.stringify({ at: new Date().toISOString(), runId: runId, fromApp: !!opts.fromApp, caseId: String(opts.caseId || "") }));
  try {
    var key = geminiKey_();
    if (!key) { batchLogRow_(runId, "", "", "run", "skipped", "no GEMINI_KEY in the script properties"); summary.why = "no GEMINI_KEY"; return summary; }
    var prompts = batchPrompts_();
    if (!prompts) { batchLogRow_(runId, "", "", "run", "skipped", "no reading prompts yet — open the app once as an editor"); summary.why = "no prompts"; return summary; }
    var models = batchModels_();
    var f = batchFolders_();
    var tab = batchTabRows_();
    // resume anything a previous run left half-read, then take new files
    var work = tab.rows.filter(function (r) { return r.status === "reading" || r.status === "queued"; });
    if (opts.caseId) {
      // "Scan now" on one case: that case alone, whatever its state
      work = tab.rows.filter(function (r) { return r.caseId === String(opts.caseId); });
      if (!work.length) { summary.why = "case not found"; return summary; }
      if (work[0].status !== "reading" && work[0].status !== "queued") { work[0].status = "queued"; }
    } else {
      // a run started from the app takes what is in the inbox now: the
      // upload-still-in-progress wait drops to 20 s and a lone photo is not held back
      var fresh = batchGroupInbox_(f, tab, !!opts.fromApp);
      fresh.forEach(function (c) { work.push(c); });
    }
    summary.pending = work.length;
    // one line per run that has something to do (quiet runs are not logged)
    if (work.length) batchLogRow_(runId, "", "", "run", opts.fromApp ? (opts.caseId ? "scan now (one case)" : "scan now") : "started",
      work.length + " case(s) to work on: " + work.map(function (c) { return c.caseId + " [" + c.status + "]"; }).join(", "));
    for (var i = 0; i < work.length; i++) {
      if (Date.now() - start > BATCH_BUDGET_MS - 30000) { summary.why = "time budget used; the rest continue next run"; break; }
      var c = work[i];
      var r = batchProcessCase_(c, f, prompts, models, key, start, runId);
      summary.cases++;
      if (r === "scanned") summary.scanned++;
      else if (r === "failed") summary.failed++;
      else if (r === "stopped") { summary.why = c.stopWhy || "stopped"; break; }
    }
    summary.pending = Math.max(0, summary.pending - summary.scanned - summary.failed);
    try { var hk = batchHousekeep_(f, runId); if (hk) summary.why = (summary.why ? summary.why + "; " : "") + hk; } catch (e) { batchLogRow_(runId, "", "", "housekeeping", "failed", String(e && e.message || e)); }
    if (summary.cases || summary.why) batchLogRow_(runId, "", "", "run", "finished", summary.cases + " case(s) worked on, " + summary.scanned + " scanned, " + summary.failed + " failed" + (summary.why ? " \u2014 " + summary.why : "") + ", " + Math.round((Date.now() - start) / 1000) + " s");
    props.setProperty("BATCH_LAST", JSON.stringify({ at: new Date().toISOString(), runId: runId,
      cases: summary.cases, scanned: summary.scanned, failed: summary.failed, why: summary.why, secs: Math.round((Date.now() - start) / 1000) }));
    props.deleteProperty("BATCH_RUNNING");
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return summary;
}

/* ---- the Batch scans tab ---- */
function batchTab_() {
  var sh = sheet(BATCH_TAB, BATCH_HEAD); ensureCols(sh, BATCH_HEAD.length);
  // a tab made before 13.13/13.15 lacks the newer columns: add their headings (old rows read as CAG, no times)
  try {
    for (var ci = 19; ci <= BATCH_HEAD.length; ci++) {
      var h = sh.getRange(1, ci).getValue();
      if (!String(h || "")) sh.getRange(1, ci).setValue(BATCH_HEAD[ci - 1]);
    }
  } catch (e) {}
  return sh;
}
function batchTabRows_() {
  var sh = batchTab_();
  var rows = [];
  if (sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, BATCH_HEAD.length).getValues();
    vals.forEach(function (v, i) {
      var o = batchRowObj_(v);
      o.row = i + 2;
      rows.push(o);
    });
  }
  var byId = {}; rows.forEach(function (r) { byId[r.caseId] = r; });
  // only a case still being worked on claims its files: a file put back into
  // the inbox after its case was finished (dismissed, failed, scanned, saved)
  // is picked up again as a new case
  var fileIds = {}; rows.forEach(function (r) {
    if (r.status !== "queued" && r.status !== "reading") return;
    (r.fileIds || []).forEach(function (id) { fileIds[id] = r.caseId; });
  });
  return { sh: sh, rows: rows, byId: byId, fileIds: fileIds };
}
function batchRowObj_(v) {
  var j = function (s, d) { try { var x = JSON.parse(String(s || "")); return x == null ? d : x; } catch (e) { return d; } };
  return { caseId: cell(v[0]), status: cell(v[1]), created: cell(v[2]), updated: cell(v[3]),
    files: cell(v[4]).split("\n").filter(Boolean), fileIds: cell(v[5]).split("\n").filter(Boolean),
    pages: Number(v[6]) || 0, grouping: cell(v[7]), name: cell(v[8]), cagNo: cell(v[9]),
    pageMap: j(v[10], []), results: j(v[11], {}), errors: j(v[12], []), log: cell(v[13]),
    models: cell(v[14]), openedBy: cell(v[15]), savedBy: cell(v[16]), runId: cell(v[17]), type: batchType_(v[18]),
    uploaded: cell(v[19]), scannedAt: cell(v[20]), checkedAt: cell(v[21]), filesRemoved: cell(v[22]),
    draft: cell(v[23]), draftAt: cell(v[24]), draftBy: cell(v[25]), draftMs: Number(v[26]) || 0 };
}
function batchRowVals_(c) {
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var cap = function (s) { s = String(s == null ? "" : s); return s.length > 49000 ? s.slice(0, 48900) + "…(cut)" : s; };
  return [c.caseId, c.status, c.created || now, now, (c.files || []).join("\n"), (c.fileIds || []).join("\n"),
    c.pages || 0, c.grouping || "", c.name || "", c.cagNo || "", cap(JSON.stringify(c.pageMap || [])),
    cap(JSON.stringify(c.results || {})), cap(JSON.stringify(c.errors || [])), cap(c.log || ""),
    c.models || "", c.openedBy || "", c.savedBy || "", c.runId || "", batchType_(c.type),
    c.uploaded || "", c.scannedAt || "", c.checkedAt || "", c.filesRemoved || "", c.draft || "", c.draftAt || "", c.draftBy || "", c.draftMs || ""];
}
function batchWriteRow_(c) {
  var sh = batchTab_();
  var vals = batchRowVals_(c);
  if (!c.row) {
    sh.appendRow(vals);
    c.row = sh.getLastRow();
  } else sh.getRange(c.row, 1, 1, BATCH_HEAD.length).setValues([vals]);
  // ids and numbers as text, never dates or numbers
  sh.getRange(c.row, 1, 1, 10).setNumberFormat("@");
}
function batchLogRow_(runId, caseId, page, step, outcome, detail) {
  try {
    var sh = sheet(BATCH_LOG, ["Time", "Case id", "Page", "Step", "Outcome", "Detail", "Run id"]);
    sh.appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      caseId || "", page || "", step || "", outcome || "", String(detail || "").slice(0, 2000), runId || ""]);
  } catch (e) {}
}
function batchNote_(c, runId, page, step, outcome, detail) {
  var t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
  c.log = (c.log ? c.log + "\n" : "") + t + " " + (page ? "page " + page + " · " : "") + step + ": " + outcome + (detail ? " — " + detail : "");
  batchLogRow_(runId, c.caseId, page, step, outcome, detail);
}

/* ---- grouping the inbox into cases ---- */
function batchFileStem_(name) {
  var s = String(name || "").replace(/\.[A-Za-z0-9]+$/, "").trim();
  var m;
  var clean = function (t) { return String(t).replace(/[\s_\-]+$/, "").trim(); };
  if ((m = /^(.*?)[\s_\-]*\((\d+)\)$/.exec(s)) && clean(m[1])) return { stem: clean(m[1]), n: Number(m[2]) };   // IMG (2)
  if ((m = /^(.+?)[\s_\-]+(\d{1,2})$/.exec(s)) && clean(m[1])) return { stem: clean(m[1]), n: Number(m[2]) };  // 1906_2, ramesh-2, scan 3
  if ((m = /^([A-Za-z]{3,}[A-Za-z\s]*)(\d{1})$/.exec(s))) return { stem: clean(m[1]), n: Number(m[2]) };          // scan3, page2
  return { stem: "", n: 0 };
}
function batchGroupInbox_(f, tab, manual) {
  var minAge = manual ? 20 * 1000 : BATCH_MIN_AGE_MS;
  var now = Date.now();
  var groups = [];
  // the CAG folder, the PTCA folder, and the inbox root (CAG, as before
  // 13.13) — each grouped on its own, so a CAG photo never joins a PTCA case
  var sources = [{ folder: f.cag, type: "CAG" }, { folder: f.ptca, type: "PTCA" }, { folder: f.inbox, type: "CAG" }];
  sources.forEach(function (src) {
    if (!src.folder) return;
    var files = [];
    var it = src.folder.getFiles();
    while (it.hasNext()) {
      var file = it.next();
      var mime = String(file.getMimeType() || "").toLowerCase();
      var isPdf = mime === "application/pdf", isImg = /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime);
      if (!isPdf && !isImg) continue;
      if (tab.fileIds[file.getId()]) continue;                             // already part of a case
      if (now - file.getLastUpdated().getTime() < minAge) continue;   // still being uploaded, maybe
      files.push({ id: file.getId(), name: file.getName(), mime: mime, isPdf: isPdf, size: file.getSize(),
        t: file.getDateCreated().getTime(), file: file });
    }
    files.sort(function (a, b) { return a.t - b.t || (a.name < b.name ? -1 : 1); });
    var byStem = {};
    var loose = [];
    files.forEach(function (x) {
      if (x.isPdf) { groups.push({ grouping: "one PDF", items: [x], type: src.type }); return; }
      var st = batchFileStem_(x.name);
      if (st.stem) { (byStem[st.stem] = byStem[st.stem] || []).push(Object.assign({ n: st.n }, x)); }
      else loose.push(x);
    });
    Object.keys(byStem).forEach(function (k) {
      var items = byStem[k].sort(function (a, b) { return a.n - b.n || a.t - b.t; });
      groups.push({ grouping: items.length > 1 ? "photos named " + k + "_1, _2, …" : "one photo", items: items, type: src.type });
    });
    // photos with no shared stem: a burst uploaded within BATCH_BURST_MS is one case
    var burst = null;
    loose.forEach(function (x) {
      if (burst && x.t - burst.last <= BATCH_BURST_MS) { burst.items.push(x); burst.last = x.t; }
      else { burst = { grouping: "grouped by upload time — check that the pages belong together", items: [x], last: x.t, type: src.type }; groups.push(burst); }
    });
  });
  groups.sort(function (a, b) { return a.items[0].t - b.items[0].t; });
  // a lone loose photo that is still "young" may be the first of a burst: wait for it
  var out = [];
  groups.forEach(function (g) {
    if (!manual && /upload time/.test(g.grouping) && g.items.length === 1 && now - g.items[0].t < BATCH_BURST_MS + BATCH_MIN_AGE_MS) return;
    if (g.items.length === 1 && !g.items[0].isPdf) g.grouping = "one photo only";
    var first = g.items[0];
    var base = first.isPdf ? first.name.replace(/\.pdf$/i, "") : (batchFileStem_(first.name).stem || first.name.replace(/\.[A-Za-z0-9]+$/, ""));
    var caseId = Utilities.formatDate(new Date(first.t), Session.getScriptTimeZone(), "yyyyMMdd-HHmm") + "_" + (g.type === "PTCA" ? "PTCA-" : "") + base.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    var n = 2;
    while (tab.byId[caseId]) caseId = caseId.replace(/(-\d+)?$/, "") + "-" + (n++);
    var c = { caseId: caseId, status: "queued", created: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      files: g.items.map(function (x) { return x.name; }), fileIds: g.items.map(function (x) { return x.id; }),
      pages: 0, grouping: g.grouping, pageMap: [], results: {}, errors: [], log: "", row: 0, type: g.type,
      uploaded: Utilities.formatDate(new Date(first.t), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") };
    batchWriteRow_(c);
    tab.byId[caseId] = c;
    g.items.forEach(function (x) { tab.fileIds[x.id] = caseId; });
    out.push(c);
  });
  return out;
}

/* ---- reading one case, one step at a time ----
   Returns "scanned", "failed", "paused" (budget ran out; resumes next run)
   or "stopped" (quota exhausted; nothing more this run). */
function batchProcessCase_(c, f, prompts, models, key, runStart, runId) {
  var gap = batchGapMs_();
  var pause = function () { Utilities.sleep(gap); };
  var timeLeft = function () { return BATCH_BUDGET_MS - (Date.now() - runStart); };
  var type = batchType_(c.type);
  c.type = type;
  if (type === "PTCA" && !prompts.ptcaReady) {
    // the app has not sent the PTCA prompts yet (needs app 13.13 or later, opened by an editor)
    if (!/no PTCA reading prompts/.test(c.log || "")) { batchNote_(c, runId, "", "start", "waiting", "no PTCA reading prompts yet \u2014 open the app (13.13 or later) as an editor once; it sends them"); batchWriteRow_(c); }
    return "paused";
  }
  c.runId = runId;
  c.models = models.read + " / " + models.page;
  if (c.status === "queued") { c.status = "reading"; batchNote_(c, runId, "", "start", "reading", type + ": " + c.files.length + " file(s), " + c.grouping); batchWriteRow_(c); }

  // the files, as Drive has them now (a file removed from the inbox fails the case)
  var items = [];
  for (var i = 0; i < c.fileIds.length; i++) {
    var file;
    try { file = DriveApp.getFileById(c.fileIds[i]); if (file.isTrashed()) file = null; } catch (e) { file = null; }
    // items keeps the same index as c.fileIds, so pageMap.fileIdx stays valid
    if (!file) { c.errors.push({ page: "", step: "file", reason: "the file " + c.files[i] + " is no longer in the inbox" }); items.push(null); continue; }
    var mime = String(file.getMimeType() || "").toLowerCase();
    if (file.getSize() > BATCH_MAX_FILE) { c.errors.push({ page: "", step: "file", reason: c.files[i] + " is larger than 20 MB, which Gemini will not accept — re-upload it smaller" }); items.push(null); continue; }
    items.push({ file: file, name: c.files[i], mime: mime === "image/jpg" ? "image/jpeg" : mime, isPdf: mime === "application/pdf" });
  }
  if (!items.some(Boolean)) return batchFinish_(c, f, runId, "failed", "no readable file");

  // 1. which page is which — once per file (a PDF answers for all its pages)
  if (!c.pageMap.length) {
    var map = [];
    for (var k = 0; k < items.length; k++) {
      if (timeLeft() < 100000) { batchWriteRow_(c); return "paused"; }
      var it = items[k];
      if (!it) continue;
      var r = batchCallChain_(key, models.pageChain || [models.page], batchPagePrompt_(it.isPdf, prompts, type), it, null, pause, timeLeft);
      if (r.quota && !r.ok) { c.stopWhy = r.reason; batchNote_(c, runId, "", "page recognition", "stopped", r.reason); batchWriteRow_(c); return "stopped"; }
      if (!r.ok && r.retry && batchTry_(c, "page:" + k) < BATCH_MAX_TRIES) {
        batchNote_(c, runId, it.name, "page recognition", "will retry", r.reason + " \u2014 tried again next run");
        batchWriteRow_(c);
        return "paused";
      }
      if (!r.ok) {
        // recognition failed: a photo falls back to "read it as whatever the model says
        // while reading"; a PDF cannot be read page by page without a count, so fail
        batchNote_(c, runId, it.name, "page recognition", "failed", r.reason);
        c.errors.push({ page: it.name, step: "page recognition", reason: r.reason });
        if (it.isPdf) return batchFinish_(c, f, runId, "failed", "could not tell which page is which in " + it.name);
        map.push({ fileIdx: k, pdfPage: 0, slot: "unknown", label: it.name });
        pause();
        continue;
      }
      var pages = batchParsePages_(r.json, it.isPdf, type);
      if (!pages.length) {
        batchNote_(c, runId, it.name, "page recognition", "failed", "the model listed no pages in " + it.name);
        c.errors.push({ page: it.name, step: "page recognition", reason: "no pages recognised in " + it.name });
        if (it.isPdf) return batchFinish_(c, f, runId, "failed", "no pages recognised in " + it.name);
        pause();
        continue;
      }
      pages.forEach(function (p) { map.push({ fileIdx: k, pdfPage: it.isPdf ? p.page : 0, slot: p.slot, label: it.isPdf ? it.name + " p." + p.page : it.name, footer: p.footer || "" }); });
      batchNote_(c, runId, it.name, "page recognition", "ok", pages.map(function (p) { return (it.isPdf ? "p." + p.page + " → " : "") + BATCH_SLOT_WORD[p.slot] || p.slot; }).join("; "));
      pause();
    }
    // a slot seen twice: the whole-PDF answer sometimes repeats a slot (the
    // diagram sheet called "Sheet 1" again, say), so each repeat in a PDF is
    // looked at on its own with the single-page prompt before being written
    // off; the first page keeps the slot, a repeat that still matches is noted
    var seen = {};
    map.forEach(function (m) {
      if (m.slot === "other" || m.slot === "unknown") return;
      if (!seen[m.slot]) { seen[m.slot] = m.label; return; }
      var again = null;
      if (m.pdfPage && timeLeft() > 100000) {
        var it2 = items[m.fileIdx];
        var r2 = batchCallChain_(key, models.pageChain || [models.page], batchReadPrompt_(batchPagePrompt_(false, prompts, type), true, m.pdfPage), it2, m.pdfPage, pause, timeLeft);
        if (r2.ok) { var pg2 = batchParsePages_(r2.json, false, type); if (pg2.length) again = pg2[0].slot; }
        pause();
      }
      if (again && again !== m.slot && again !== "unknown" && !seen[again]) {
        batchNote_(c, runId, m.label, "page recognition", "ok", "looked at again on its own: " + (BATCH_SLOT_WORD[again] || again) + " (the whole-PDF pass had said " + BATCH_SLOT_WORD[m.slot] + " again)");
        m.slot = again; seen[again] = m.label;
        return;
      }
      if (again === "other") {
        batchNote_(c, runId, m.label, "page recognition", "ok", "looked at again on its own: not a proforma page");
        m.slot = "other";
        return;
      }
      m.dup = true;
      c.errors.push({ page: m.label, step: "page recognition", reason: "looks like " + BATCH_SLOT_WORD[m.slot] + " again — " + seen[m.slot] + " was already taken as that sheet; this page was not read" });
    });
    c.pageMap = map;
    c.pages = map.length;
    batchWriteRow_(c);
  }

  // 2. read each recognised page with the app's prompt for that sheet
  var attempted = 0;
  for (var p = 0; p < c.pageMap.length; p++) {
    var m = c.pageMap[p];
    if (m.dup || m.slot === "other") continue;
    var slot = m.slot;
    if (slot === "unknown") {
      // an unrecognised photo: ask the reader to identify it as part of reading
      slot = "";
    }
    if (c.results[slot] || (slot === "" && c.results["unknown:" + m.label])) continue;   // read on an earlier run
    if (slot && (c.errors || []).some(function (e) { return e.slot === slot; })) continue;   // failed for good on an earlier run
    if (timeLeft() < 100000) { batchWriteRow_(c); return "paused"; }
    var item = items[m.fileIdx];
    if (!item) continue;
    var prompt = slot ? prompts[slot] : "";
    if (slot === "d" && !prompts.d) { c.errors.push({ page: m.label, step: "reading", reason: "the app sent no diagram-sheet prompt; this version reads only the four tick sheets" }); continue; }
    if (!slot) {
      // identify-and-read in one go: the model names the sheet, then the app's prompt is applied next run
      var rid = batchGemini_(key, models.page, batchPagePrompt_(false, prompts, type), item, null);
      if (rid.ok) { var pg = batchParsePages_(rid.json, false, type); if (pg.length && pg[0].slot !== "other") { m.slot = pg[0].slot; slot = m.slot; prompt = prompts[slot]; } }
      if (!slot) { c.errors.push({ page: m.label, step: "page recognition", reason: rid.ok ? "this photo does not look like a proforma page" : rid.reason }); pause(); continue; }
      pause();
    }
    attempted++;
    var rr = batchCallChain_(key, models.readChain || [models.read], batchReadPrompt_(prompt, item.isPdf, m.pdfPage), item, m.pdfPage, pause, timeLeft);
    if (rr.quota && !rr.ok) { c.stopWhy = rr.reason; batchNote_(c, runId, m.label, "reading " + BATCH_SLOT_WORD[slot], "stopped", rr.reason); batchWriteRow_(c); return "stopped"; }
    if (!rr.ok && rr.retry && batchTry_(c, "read:" + slot) < BATCH_MAX_TRIES) {
      // Google's temporary fault: leave this page for a later run rather than
      // writing it off; the other pages carry on now
      c.pending = true;
      batchNote_(c, runId, m.label, "reading " + BATCH_SLOT_WORD[slot], "will retry", rr.reason + " \u2014 tried again next run");
      batchWriteRow_(c);
      pause();
      continue;
    }
    if (!rr.ok) {
      batchNote_(c, runId, m.label, "reading " + BATCH_SLOT_WORD[slot], "failed", rr.reason);
      c.errors.push({ page: m.label, step: "reading " + BATCH_SLOT_WORD[slot], reason: rr.reason, slot: slot });
    } else {
      c.results[slot] = rr.json;
      var hdr = rr.json && typeof rr.json === "object" ? rr.json : {};
      if (slot === "p1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.cagNo || ""); }
      else if (slot === "q1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.ptcaNo || hdr.cathNo || hdr.cagNo || ""); }
      else if (!c.cagNo && (hdr.cagNo || hdr.ptcaNo)) c.cagNo = String(hdr.ptcaNo || hdr.cagNo);
      // a page that failed on an earlier run and has now been read: its old error goes
      c.errors = (c.errors || []).filter(function (e) { return e.slot !== slot; });
      batchNote_(c, runId, m.label, "reading " + BATCH_SLOT_WORD[slot], "ok", (slot === "p1" || slot === "q1" ? (c.name + (c.cagNo ? " · " + (slot === "q1" ? "PTCA " : "CAG ") + c.cagNo : "")) : "") + (rr.via ? " (via " + rr.via + ")" : "") + (item.isPdf ? " · " + (rr.asImage || "whole PDF") : ""));
    }
    batchWriteRow_(c);
    pause();
  }

  if (c.pending) { c.pending = false; batchWriteRow_(c); return "paused"; }
  if (!attempted && c.pageMap.length) batchNote_(c, runId, "", "reading", "nothing to do", "every page is read already, a duplicate, not a proforma page, or failed for good");
  // 3. done: what was read decides the verdict
  var got = Object.keys(c.results).filter(function (k) { return BATCH_SLOTS_OF[type].indexOf(k) >= 0; });
  var missing = BATCH_NEEDED_OF[type].filter(function (s) { return !c.results[s]; });
  if (!got.length) return batchFinish_(c, f, runId, "failed", "no sheet could be read");
  missing.forEach(function (s) {
    var attempted = c.pageMap.some(function (m) { return m.slot === s && !m.dup; });
    if (!attempted) c.errors.push({ page: "", step: "missing", reason: BATCH_SLOT_WORD[s] + " was not among the uploaded pages", slot: s });
  });
  if (type === "PTCA" && !c.results.qu && !c.pageMap.some(function (m) { return m.slot === "qu"; }))
    c.errors.push({ page: "", step: "missing", reason: "the PTCA utilization report was not among the uploaded pages \u2014 hardware will be blank", slot: "qu" });
  var nTick = got.filter(function (k) { return BATCH_NEEDED_OF[type].indexOf(k) >= 0; }).length;
  return batchFinish_(c, f, runId, "scanned", nTick + " of 4 " + (type === "PTCA" ? "PTCA sheets" : "tick sheets") + " read" +
    (c.results.d ? " + diagram" : "") + (c.results.qu ? " + utilization report" : "") +
    (c.errors.length ? "; " + c.errors.length + " problem(s) noted" : ""));
}
/* ---- Drive housekeeping ----
   Counts the cases whose files are still in Drive. Past BATCH_KEEP, the
   oldest BATCH_PRUNE checked (saved / dismissed) or failed cases have their
   files trashed and their per-case folder removed; a case still waiting to
   be checked ("scanned") is never touched. Returns a one-line note or "". */
function batchKeepN_() { var v = Number(PropertiesService.getScriptProperties().getProperty("BATCH_KEEP")); return isFinite(v) && v > 0 ? v : BATCH_KEEP_DEFAULT; }
function batchPruneN_() { var v = Number(PropertiesService.getScriptProperties().getProperty("BATCH_PRUNE")); return isFinite(v) && v > 0 ? v : BATCH_PRUNE_DEFAULT; }
function batchHousekeepOff_() { return PropertiesService.getScriptProperties().getProperty("BATCH_HOUSEKEEP_OFF") === "1"; }
function batchHousekeep_(f, runId) {
  if (batchHousekeepOff_()) return "";
  var tab = batchTabRows_();
  var withFiles = tab.rows.filter(function (r) { return (r.fileIds || []).length && !r.filesRemoved && r.status !== "queued" && r.status !== "reading"; });
  if (withFiles.length <= batchKeepN_()) return "";
  var done = withFiles.filter(function (r) { return r.status === "saved" || r.status === "dismissed" || r.status === "failed"; });
  done.sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); });
  var pick = done.slice(0, batchPruneN_());
  if (!pick.length) return "";
  var n = 0;
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  pick.forEach(function (r) {
    (r.fileIds || []).forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); n++; } catch (e) {} });
    // the empty per-case folder under Processed/<type> or Failed/<type> (or the pre-13.14 root)
    var typeName = batchType_(r.type) === "PTCA" ? BATCH_SUB_PTCA : BATCH_SUB_CAG;
    [f.done, f.fail].forEach(function (root) {
      var parents = [root];
      var t = root.getFoldersByName(typeName); if (t.hasNext()) parents.push(t.next());
      parents.forEach(function (parent) {
        try { var d = parent.getFoldersByName(r.caseId); if (d.hasNext()) { var sub = d.next(); if (!sub.getFiles().hasNext()) sub.setTrashed(true); } } catch (e) {}
      });
    });
    r.filesRemoved = stamp;
    r.log = (r.log ? r.log + "\n" : "") + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss") + " housekeeping: files removed from Drive (" + withFiles.length + " cases had files, limit " + batchKeepN_() + ")";
    batchWriteRow_(r);
  });
  var note = "housekeeping: files of the " + pick.length + " oldest checked case(s) removed from Drive (" + n + " file(s))";
  batchLogRow_(runId, "", "", "housekeeping", "ok", note);
  return note;
}
/* run from the editor to tidy now */
function runHousekeepingNow() { var r = batchHousekeep_(batchFolders_(), "manual"); Logger.log(r || "Nothing to do: " + batchKeepN_() + " or fewer cases have files."); return r; }
function batchTry_(c, key) {
  if (!c.results || typeof c.results !== "object") c.results = {};
  var t = c.results._tries = c.results._tries || {};
  t[key] = (t[key] || 0) + 1;
  return t[key];
}
function batchFinish_(c, f, runId, status, why) {
  c.status = status;
  c.scannedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  batchNote_(c, runId, "", "finish", status, why);
  // the files move out of the inbox: a sub-folder per case under
  // Processed/CAG, Processed/PTCA, Failed/CAG or Failed/PTCA
  try {
    var dest = status === "scanned" ? f.done : f.fail;
    var typeName = batchType_(c.type) === "PTCA" ? BATCH_SUB_PTCA : BATCH_SUB_CAG;
    var tf = dest.getFoldersByName(typeName); dest = tf.hasNext() ? tf.next() : dest.createFolder(typeName);
    var sub = dest.getFoldersByName(c.caseId);
    sub = sub.hasNext() ? sub.next() : dest.createFolder(c.caseId);
    c.fileIds.forEach(function (id) {
      try { var file = DriveApp.getFileById(id); file.moveTo(sub); } catch (e) {}
    });
  } catch (e) { batchNote_(c, runId, "", "move files", "failed", String(e && e.message || e)); }
  batchWriteRow_(c);
  if (status === "scanned") batchSupersede_(c, runId);
  return status;
}
/* A resident who deletes or renames an upload and puts it back leaves a
   failed case behind ("the file … is no longer in the inbox") beside the new
   one. When the new upload is scanned, an earlier failed case of the same
   type whose only problems were vanished files, carrying the same CAG No
   (or, with no CAG No read, the same name), is dismissed as superseded. */
function batchSupersede_(c, runId) {
  try {
    var key = String(c.cagNo || "").replace(/\D/g, "");
    var nm = String(c.name || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!key && !nm) return;
    var tab = batchTabRows_();
    tab.rows.forEach(function (r) {
      if (r.caseId === c.caseId || r.status !== "failed" || batchType_(r.type) !== batchType_(c.type)) return;
      var errs = r.errors || [];
      if (!errs.length || !errs.every(function (e) { return e.step === "file" && /no longer in the inbox/.test(e.reason || ""); })) return;
      var rk = String(r.cagNo || "").replace(/\D/g, ""), rn = String(r.name || "").toLowerCase().replace(/[^a-z]/g, "");
      var same = key && rk ? key === rk : (nm && rn && nm === rn);
      if (!same) return;
      r.status = "dismissed";
      batchNote_(r, runId, "", "superseded", "dismissed", "its file had gone from the inbox; the same case was uploaded again as " + (c.files || []).join(", ") + " and scanned");
      batchWriteRow_(r);
    });
  } catch (e) { batchNote_(c, runId, "", "supersede", "failed", String(e && e.message || e)); }
}

/* ---- prompts ----
   Page recognition: the app's own prompt when it sent one (key "page"),
   else this one. Either way the answer is normalised by batchParsePages_. */
function batchPagePrompt_(isPdf, prompts, type) {
  // a single photo: the app's own page-recognition prompt (printedPage /
  // sheet), when it was sent; a PDF needs the whole-document form below
  if (batchType_(type) === "PTCA") return batchPagePromptPtca_(isPdf, prompts);
  if (!isPdf && prompts && prompts.page) return prompts.page;
  var base = "You are looking at paperwork from the Department of Cardiology, LTMG Hospital, Sion, Mumbai: the CORONARY ANGIOGRAPHY REPORT proforma. " +
    "It has four pre-printed tick sheets, each with a footer reading \"Page N of 4\": page 1 is the clinical proforma (name, diagnosis, ECG, echo, bloods); " +
    "page 2 is the angiogram sheet with Catheter, Left main and LAD; page 3 has the LCx, OM and RCA; page 4 has PDA, PLV, Ramus, collaterals, grafts, renals, Final Diagnosis and Plan. " +
    "There may also be a fifth sheet: a printed CORONARY DIAGRAM (a drawing of the coronary tree with stenoses drawn on it), which has no page footer. " +
    "Anything else (a blank page, a blood report, an ECG strip) is \"other\".\n" +
    "Slot codes: p1 = page 1 of 4, a1 = page 2 of 4, a2 = page 3 of 4, a3 = page 4 of 4, d = coronary diagram, other = anything else. " +
    "Use the printed footer when it is readable; otherwise decide from the headings.\n";
  if (isPdf) return base + "Go through EVERY page of this PDF in order. Return ONLY minified JSON, no fences: " +
    "{\"pages\":[{\"page\":1,\"slot\":\"p1\",\"footer\":\"Page 1 of 4\"},{\"page\":2,\"slot\":\"a1\",\"footer\":\"\"}]} — one entry per page, page numbers starting at 1, every page listed.";
  return base + "Return ONLY minified JSON, no fences: {\"slot\":\"p1\",\"footer\":\"Page 1 of 4\"}";
}
function batchPagePromptPtca_(isPdf, prompts) {
  if (!isPdf && prompts && prompts.pagePtca) return prompts.pagePtca;
  var base = "You are looking at PTCA paperwork from the Department of Cardiology, LTMG Hospital, Sion, Mumbai. " +
    "The printed PTCA & STENTING PROFORMA has four pages, each with a small centred footer reading \"PTCA \u2014 Page N of 4\": " +
    "page 1 is the front page (letterhead, Approval/NC/Self boxes, PTCA/Cath No., CAG No., Clinical Diagnosis, CAG s/o, PTCA to, Past History, CAD Risk, Procedural Risk, LVIDd/LVIDs/EF/Creatinine/K+ strip); " +
    "page 2 is investigations (Examination, blood table with At CAG / Repeat, ECG, echo grids); " +
    "page 3 is procedure & technique (CAG Reference lines, Access, AK/Fluoro/Heparin/ACT, strategy boxes PrD/Stent/PoD, the segment PTCA-to box rows, Wiring technique, Support, Predilation, Stent position, Post dilation); " +
    "page 4 is Bif techniques, Bifurcation vessels MB/SB, Recross wire, POT, Thrombus Mx, Calcium Mx, Complications, Other hardware, Recommendations. " +
    "There may also be the separate one-page PTCA UTILIZATION REPORT (no footer): a Vessel grid LM LAD D1 LCx OM RCA PDA PLV Ramus with rows Guiding Catheter, Guide Wire, Balloon 1/2, Stent 1/2/3, and a bottom table with Cutting balloon, Microcatheter, Guide extension, Rota burr, Aspiration catheter. " +
    "Anything else (a blank page, a blood report, an ECG strip, a CAG proforma page) is \"other\".\n" +
    "Slot codes: q1 = page 1 of 4, q2 = page 2 of 4, q3 = page 3 of 4, q4 = page 4 of 4, qu = utilization report, other = anything else. " +
    "Use the printed footer when it is readable; otherwise decide from the headings.\n";
  if (isPdf) return base + "Go through EVERY page of this PDF in order. Return ONLY minified JSON, no fences: " +
    "{\"pages\":[{\"page\":1,\"slot\":\"q1\",\"footer\":\"PTCA \u2014 Page 1 of 4\"},{\"page\":2,\"slot\":\"q2\",\"footer\":\"\"}]} \u2014 one entry per page, page numbers starting at 1, every page listed.";
  return base + "Return ONLY minified JSON, no fences: {\"slot\":\"q1\",\"footer\":\"PTCA \u2014 Page 1 of 4\"}";
}
function batchParsePages_(j, isPdf, type) {
  if (batchType_(type) === "PTCA") return batchParsePagesPtca_(j, isPdf);
  var norm = function (s) {
    s = String(s == null ? "" : s).trim().toLowerCase();
    if (/^p1$|^1$|page ?1|sheet ?1|clinical/.test(s)) return "p1";
    if (/^a1$|^2$|page ?2|sheet ?2/.test(s)) return "a1";
    if (/^a2$|^3$|page ?3|sheet ?3/.test(s)) return "a2";
    if (/^a3$|^4$|page ?4|sheet ?4/.test(s)) return "a3";
    if (/^d$|^5$|diagram|drawing|sheet ?5/.test(s)) return "d";
    return "other";
  };
  if (!j || typeof j !== "object") return [];
  if (isPdf) {
    var list = Array.isArray(j.pages) ? j.pages : Array.isArray(j) ? j : [];
    return list.map(function (p, i) {
      p = p && typeof p === "object" ? p : {};
      var slot = norm(p.slot != null ? p.slot : (p.sheet != null ? p.sheet : p.type));
      var ft = String(p.footer || "");
      var fm = /page\s*(\d)\s*of\s*4/i.exec(ft);
      if (fm) slot = ["", "p1", "a1", "a2", "a3"][Number(fm[1])] || slot;   // the footer decides when it was read
      return { page: Number(p.page) || (i + 1), slot: slot, footer: ft };
    });
  }
  var one = j.slot != null || j.sheet != null || j.printedPage != null ? j : (Array.isArray(j.pages) && j.pages[0]) || {};
  // the app's sorter answers {printedPage, sheet, confidence}: the printed
  // footer decides, else the headings (sheet 5 = the diagram)
  var pp = Number(one.printedPage) || 0, sh = Number(one.sheet) || 0;
  var s;
  if (pp >= 1 && pp <= 5) s = ["", "p1", "a1", "a2", "a3", "d"][pp];
  else if (sh >= 1 && sh <= 5) s = ["", "p1", "a1", "a2", "a3", "d"][sh];
  else s = norm(one.slot != null ? one.slot : (one.sheet != null ? one.sheet : one.type));
  var f2 = /page\s*(\d)\s*of\s*4/i.exec(String(one.footer || ""));
  if (f2) s = ["", "p1", "a1", "a2", "a3"][Number(f2[1])] || s;
  return [{ page: 1, slot: s, footer: String(one.footer || "") }];
}
function batchParsePagesPtca_(j, isPdf) {
  var BY_N = ["", "q1", "q2", "q3", "q4", "qu"];
  var norm = function (s) {
    s = String(s == null ? "" : s).trim().toLowerCase();
    if (/^q1$|^1$|page ?1|sheet ?1|front/.test(s)) return "q1";
    if (/^q2$|^2$|page ?2|sheet ?2|investig/.test(s)) return "q2";
    if (/^q3$|^3$|page ?3|sheet ?3|procedure|technique/.test(s)) return "q3";
    if (/^q4$|^4$|page ?4|sheet ?4|bif/.test(s)) return "q4";
    if (/^qu$|^u$|^5$|sheet ?5|utili/.test(s)) return "qu";
    return "other";
  };
  if (!j || typeof j !== "object") return [];
  if (isPdf) {
    var list = Array.isArray(j.pages) ? j.pages : Array.isArray(j) ? j : [];
    return list.map(function (p, i) {
      p = p && typeof p === "object" ? p : {};
      var slot = norm(p.slot != null ? p.slot : (p.sheet != null ? p.sheet : p.type));
      var ft = String(p.footer || "");
      var fm = /page\s*(\d)\s*of\s*4/i.exec(ft);
      if (fm) slot = BY_N[Number(fm[1])] || slot;
      return { page: Number(p.page) || (i + 1), slot: slot, footer: ft };
    });
  }
  var one = j.slot != null || j.sheet != null || j.printedPage != null ? j : (Array.isArray(j.pages) && j.pages[0]) || {};
  // the app's PTCA sorter answers {printedPage, sheet, confidence}: the
  // printed footer decides, else the headings (sheet 5 = utilization report)
  var pp = Number(one.printedPage) || 0, sh = Number(one.sheet) || 0;
  var s;
  if (pp >= 1 && pp <= 4) s = BY_N[pp];
  else if (sh >= 1 && sh <= 5) s = BY_N[sh];
  else s = norm(one.slot != null ? one.slot : (one.sheet != null ? one.sheet : one.type));
  var f2 = /page\s*(\d)\s*of\s*4/i.exec(String(one.footer || ""));
  if (f2) s = BY_N[Number(f2[1])] || s;
  return [{ page: 1, slot: s, footer: String(one.footer || "") }];
}
function batchReadPrompt_(prompt, isPdf, pdfPage) {
  if (!isPdf) return prompt;
  return "The attached PDF has several pages. Read ONLY page " + pdfPage + " (counting from 1). Ignore every other page entirely — " +
    "nothing from any other page may appear in your answer.\n\n" + prompt;
}
// the wrapper above, taken off again when the page goes as its own image
var BATCH_PDF_WRAP_RE = /^The attached PDF has several pages\. Read ONLY page \d+ \(counting from 1\)\. Ignore every other page entirely — nothing from any other page may appear in your answer\.\n\n/;

/* ---- one page of an uploaded PDF on its own ----
   Sending Gemini the whole PDF and asking for "page N" gives it that page
   rendered by Google with three other pages to look at, and it reads worse
   than the phone, which sends one page as one image. So each page is cut out
   of the PDF first:
   - a page that is exactly one upright JPEG (a phone-scanner PDF) goes as
     that JPEG, the way the phone sends it;
   - any other page (rotated scan, typed form, drawn page) goes as a one-page
     PDF holding just that page's objects, copied verbatim, so Google renders
     it upright as before but alone.
   Returns an array by page (index = page − 1) of { bytes, mime, how } or null
   where the parser could not follow the file (object streams, odd structure);
   a null page is sent as the whole PDF, as before. */
function batchPdfPages_(bytes) {
  var s;
  try { s = Utilities.newBlob(bytes).getDataAsString("ISO-8859-1"); } catch (e) { return []; }
  if (!s || s.length !== bytes.length) return [];
  var objs = {}, starts = [], re = /(\d+)\s+(\d+)\s+obj\b/g, m;
  while ((m = re.exec(s))) starts.push({ num: Number(m[1]), hdr: m.index + m[0].length });
  for (var i = 0; i < starts.length; i++) {
    var end = s.indexOf("endobj", starts[i].hdr); if (end < 0) end = s.length;
    objs[starts[i].num] = { at: starts[i].hdr, end: end };   // a later definition (incremental save) wins
  }
  function dict(num) {
    var o = objs[num]; if (!o) return "";
    var st = s.indexOf("stream", o.at);
    return s.slice(o.at, st >= 0 && st < o.end ? st : o.end);
  }
  function length(d) {
    var lm = d.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/); if (!lm) return -1;
    return lm[2] ? Number((dict(Number(lm[1])).match(/\d+/) || [-1])[0]) : Number(lm[1]);
  }
  /* an object's pieces: dict text, and for a stream its byte range */
  function piece(num) {
    var o = objs[num]; if (!o) return null;
    var d = dict(num);
    var st = s.indexOf("stream", o.at);
    if (st < 0 || st > o.end) return { d: d.trim(), from: -1, to: -1 };
    var p0 = st + 6;
    if (s.charCodeAt(p0) === 13) p0++;
    if (s.charCodeAt(p0) === 10) p0++;
    var len = length(d);
    if (len < 0) {                                   // no usable Length: measure to endstream
      var e = s.indexOf("endstream", p0); if (e < 0) return null;
      len = e - p0; while (len > 0 && (s.charCodeAt(p0 + len - 1) === 10 || s.charCodeAt(p0 + len - 1) === 13)) len--;
    }
    if (p0 + len > s.length) return null;
    return { d: d.trim(), from: p0, to: p0 + len };
  }
  function kids(num, depth, out) {
    if (depth > 10 || !objs[num]) return;
    var d = dict(num);
    if (/\/Type\s*\/Pages\b/.test(d)) {
      var km = d.match(/\/Kids\s*\[([^\]]*)\]/); if (!km) return;
      var kr = /(\d+)\s+\d+\s+R/g, k;
      while ((k = kr.exec(km[1]))) kids(Number(k[1]), depth + 1, out);
    } else if (/\/Type\s*\/Page\b/.test(d)) out.push(num);
  }
  var order = [], rootNum = null;
  var trailer = s.lastIndexOf("/Root");
  var cm = trailer >= 0 ? s.slice(trailer).match(/^\/Root\s+(\d+)\s+\d+\s+R/) : null;
  if (cm) { var pm = dict(Number(cm[1])).match(/\/Pages\s+(\d+)\s+\d+\s+R/); if (pm) rootNum = Number(pm[1]); }
  if (rootNum !== null) kids(rootNum, 0, order);
  if (!order.length) starts.forEach(function (x) { if (/\/Type\s*\/Page\b/.test(dict(x.num)) && order.indexOf(x.num) < 0) order.push(x.num); });
  if (!order.length) return [];

  /* the page as its own JPEG, when it is one upright image and nothing else */
  function asJpeg(pnum) {
    var d = dict(pnum);
    var rr = d.match(/\/Resources\s+(\d+)\s+\d+\s+R/), rd = rr ? dict(Number(rr[1])) : "";
    function xobjects(dd) {
      var inl = dd.match(/\/XObject\s*<<([^>]*)>>/); if (inl) return inl[1];
      var ref = dd.match(/\/XObject\s+(\d+)\s+\d+\s+R/); return ref ? dict(Number(ref[1])) : "";
    }
    var xs = xobjects(d) || (rd ? xobjects(rd) : "");
    if (!xs) return null;
    var refs = [], rx = /(\d+)\s+\d+\s+R/g, q;
    while ((q = rx.exec(xs))) if (refs.indexOf(Number(q[1])) < 0) refs.push(Number(q[1]));
    var imgs = refs.filter(function (n) { return /\/Subtype\s*\/Image\b/.test(dict(n)); });
    if (imgs.length !== 1) return null;
    var id = dict(imgs[0]);
    if (!/\/Filter\s*(\/DCTDecode\b|\[\s*\/DCTDecode\s*\])/.test(id)) return null;
    var wm = id.match(/\/Width\s+(\d+)/), hm = id.match(/\/Height\s+(\d+)/);
    if (!wm || !hm || Number(wm[1]) < 800 || Number(hm[1]) < 800) return null;   // a crest or a thumbnail, not a page
    if (/\/Rotate\s+(?!0\b)\d+/.test(d)) return null;
    // the image must be drawn upright: its content stream, readable only when
    // uncompressed, places it with "a b c d e f cm" — upright means b = c = 0
    var cref = d.match(/\/Contents\s+(\d+)\s+\d+\s+R/); if (!cref) return null;
    var cp = piece(Number(cref[1])); if (!cp || cp.from < 0 || /\/Filter/.test(cp.d)) return null;
    var content = s.slice(cp.from, cp.to);
    var place = content.match(/(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm\s+(?:[^Q]*?\s)?\/\w+\s+Do/);
    if (!place) return null;
    var a = Number(place[1]), b = Number(place[2]), c = Number(place[3]), dd = Number(place[4]);
    if (!(a > 0 && dd > 0 && Math.abs(b) < 1 && Math.abs(c) < 1)) return null;
    var ip = piece(imgs[0]); if (!ip || ip.from < 0) return null;
    if ((s.charCodeAt(ip.from) & 255) !== 0xFF || (s.charCodeAt(ip.from + 1) & 255) !== 0xD8) return null;
    return { bytes: bytes.slice(ip.from, ip.to), mime: "image/jpeg", how: "page image" };
  }

  /* the page as a one-page PDF: the page object and everything it refers to,
     copied verbatim and renumbered, under a fresh catalog */
  function asPdf(pnum) {
    var map = {}, list = [], queue = [pnum];
    map[pnum] = 3; list.push(pnum);
    var next = 4;
    function strip(d, isPage) {
      // links to the rest of the document that a lone page does not need
      d = d.replace(/\/(Annots|AF|StructParents|Metadata|PieceInfo|Group|Tabs|B|Thumb)\s*(\[[^\]]*\]|\d+\s+\d+\s+R|\d+|\/\w+)/g, "");
      if (isPage) d = d.replace(/\/Parent\s+\d+\s+\d+\s+R/, "/Parent 2 0 R");
      return d;
    }
    while (queue.length) {
      var n = queue.shift();
      var pc = piece(n); if (!pc) return null;
      var d = strip(pc.d, n === pnum);
      var rx = /(\d+)\s+(\d+)\s+R\b/g, q;
      while ((q = rx.exec(d))) {
        var ref = Number(q[1]);
        if (n === pnum && /\/Parent\s+2\s+0\s+R$/.test(d.slice(0, q.index + q[0].length))) continue;
        if (!objs[ref]) return null;
        if (!(ref in map)) { map[ref] = next++; list.push(ref); queue.push(ref); }
      }
    }
    var segs = [], offs = [], pos = 0;
    function text(t) { segs.push(t); pos += t.length; }
    function raw(from, to) { segs.push([from, to]); pos += to - from; }
    text("%PDF-1.4\n%âãÏÓ\n");
    offs[1] = pos; text("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offs[2] = pos; text("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    for (var i = 0; i < list.length; i++) {
      var old = list[i], nn = map[old], pc2 = piece(old);
      var d2 = strip(pc2.d, old === pnum).replace(/(\d+)\s+(\d+)\s+R\b/g, function (all, a) {
        return old === pnum && all === "2 0 R" ? all : (map[Number(a)] + " 0 R");
      });
      if (old === pnum) d2 = d2.replace(/\/Parent\s+\d+\s+0\s+R/, "/Parent 2 0 R");
      offs[nn] = pos;
      if (pc2.from < 0) text(nn + " 0 obj\n" + d2 + "\nendobj\n");
      else {
        d2 = d2.replace(/\/Length\s+\d+(\s+\d+\s+R)?/, "/Length " + (pc2.to - pc2.from));
        if (!/\/Length\s/.test(d2)) d2 = d2.replace(/>>\s*$/, " /Length " + (pc2.to - pc2.from) + " >>");
        text(nn + " 0 obj\n" + d2 + "\nstream\n"); raw(pc2.from, pc2.to); text("\nendstream\nendobj\n");
      }
    }
    var xref = pos, count = next;
    var xr = "xref\n0 " + count + "\n0000000000 65535 f \n";
    for (var k = 1; k < count; k++) xr += ("0000000000" + offs[k]).slice(-10) + " 00000 n \n";
    text(xr + "trailer\n<< /Size " + count + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    var out = [];
    segs.forEach(function (sg) {
      if (typeof sg === "string") { for (var j = 0; j < sg.length; j++) { var cc = sg.charCodeAt(j) & 255; out.push(cc > 127 ? cc - 256 : cc); } }
      else for (var q2 = sg[0]; q2 < sg[1]; q2++) out.push(bytes[q2]);
    });
    return { bytes: out, mime: "application/pdf", how: "own page" };
  }
  return order.map(function (pnum) {
    try { return asJpeg(pnum) || asPdf(pnum); } catch (e) { return null; }
  });
}
function batchGemini_(key, model, prompt, item, pdfPage) {
  // the file's bytes, read from Drive once per run
  if (!item.bytes) {
    try { item.bytes = item.file.getBlob().getBytes(); }
    catch (e) { return { ok: false, reason: "could not read " + item.name + " from Drive: " + String(e && e.message || e), retry: true }; }
  }
  var bytes = item.bytes, mime = item.mime, asImage = "";
  if (pdfPage && item.isPdf) {
    // one page of a scanned PDF goes as its own JPEG, the way a phone sends it
    if (!item.pageImgs) { try { item.pageImgs = batchPdfPages_(item.bytes); } catch (e) { item.pageImgs = []; } }
    var pi = item.pageImgs[pdfPage - 1];
    if (pi && pi.bytes && pi.bytes.length) { bytes = pi.bytes; mime = pi.mime; asImage = pi.how; prompt = prompt.replace(BATCH_PDF_WRAP_RE, ""); }
  }
  var body = {
    contents: [{ role: "user", parts: [
      { inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } },
      { text: prompt }
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: "application/json" }
  };
  batchCount_(model);
  var resp;
  try {
    resp = UrlFetchApp.fetch(GEMINI_API + "/models/" + model + ":generateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key },
      payload: JSON.stringify(body), muteHttpExceptions: true });
  } catch (e) {
    var msg = String(e && e.message || e);
    return { ok: false, reason: /timed? ?out|Timeout/i.test(msg) ? BATCH_FETCH_TIMEOUT_NOTE : "the request to Google failed: " + msg, retry: true };
  }
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) {
    var cls = mcClassify(code, text, model);
    // either kind of 429 ends this run: a used-up limit resets later, a
    // model with no free tier needs a different model name — neither is
    // helped by trying the next page
    var nofree = code === 429 && cls.status === "nofree";
    var quota = code === 429;
    // which limit: Google names it (…PerMinute… / …PerDay…) and often says how long to wait
    var kind = code === 429 ? batch429Kind_(text) : null;
    if (quota) batchCount_("", model + (nofree ? " (no free tier)" : " (" + (kind ? kind.word : "limit") + " reached)"), nofree ? "" : model, kind ? kind.restMs : 0);
    var reason = code === 429
      ? (nofree ? "the model " + model + " has no free tier for this key — set BATCH_MODEL_READ / BATCH_MODEL_PAGE to a free one"
                : "Google's " + (kind ? kind.word : "limit") + " for " + model + " is used up (429) — other models are tried; this one rests for " + (kind ? kind.restWord : "an hour"))
      : code === 404 ? "the model " + model + " is not offered any more — set BATCH_MODEL_READ / BATCH_MODEL_PAGE to a current one"
      : code === 400 && /too large|exceeds|size/i.test(text) ? item.name + " is too large for the model — re-upload it smaller"
      : code >= 500 ? "Google answered " + code + " (a temporary fault on their side)"
      : "Google answered " + code + ": " + cls.note;
    return { ok: false, reason: reason, retry: code >= 500 || code === 0, quota: quota, nofree: nofree };
  }
  var j;
  try { j = JSON.parse(text); } catch (e) { return { ok: false, reason: "Google's reply was not readable", retry: true }; }
  var cand = j && j.candidates && j.candidates[0];
  var fin = cand && cand.finishReason;
  if (!cand) {
    var block = j && j.promptFeedback && j.promptFeedback.blockReason;
    return { ok: false, reason: block ? "Google declined to read this page (" + block + ")" : "the model returned nothing for this page", retry: !block };
  }
  var out = ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ""; }).join("");
  if (fin === "MAX_TOKENS") return { ok: false, reason: "the model's answer was cut off (too long) — the page may be very busy; try re-scanning it on a phone", retry: false, tryOther: true };
  if (fin === "SAFETY" || fin === "RECITATION") return { ok: false, reason: "the model stopped (" + fin + ")", retry: false };
  var parsed = batchParseJson_(out);
  if (parsed === undefined) return { ok: false, reason: "the model's answer was not valid JSON (it wrote text instead of the form's fields)", retry: true };
  return { ok: true, json: parsed, asImage: asImage };
}
function batchParseJson_(s) {
  s = String(s == null ? "" : s).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(s); } catch (e) {}
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e2) {} }
  return undefined;
}

/* ---- what the app asks ---- */
/* The scanner's own Gemini requests today, per model — Google does not say
   how much free quota is left, so this is the count to set against the
   model's daily free limit; a 429 is the real signal that it is used up,
   and the last one is remembered here too. Days turn over at midnight
   Pacific time, when Google resets the free tier. */
function batchUsageDay_() { return Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd"); }
var BATCH_REST_MS = 60 * 60000;   // a model that answered a daily-limit 429 is left alone this long
var BATCH_REST_MIN_MS = 70000;    // … a per-minute one, this long
/* what a 429 says: "…PerMinute…" is a rate limit (requests or tokens per
   minute — the scanner's whole-PDF uploads are heavy on tokens), "…PerDay…"
   the daily allowance; retryDelay, when given, is honoured */
function batch429Kind_(text) {
  var t = String(text || "");
  var perMin = /PerMinute|per minute|RPM|TPM|TokensPerMinute/i.test(t);
  var perDay = /PerDay|per day|RPD|daily/i.test(t);
  var delay = 0; var dm = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i.exec(t) || /retry in (\d+(?:\.\d+)?)\s*s/i.exec(t);
  if (dm) delay = Math.ceil(Number(dm[1]) * 1000);
  var tokens = /token/i.test(t) && !/requests/i.test(t);
  if (perMin && !perDay) return { word: tokens ? "per-minute token limit" : "per-minute limit", restMs: Math.max(BATCH_REST_MIN_MS, delay + 5000), restWord: "a minute or two" };
  if (perDay) { var r = batchPacificReset_(); return { word: "daily limit", restMs: r.ms, restWord: "Google's daily reset at " + r.local + " (midnight Pacific time)" }; }
  return { word: "limit", restMs: delay ? Math.max(BATCH_REST_MIN_MS, delay + 5000) : BATCH_REST_MS, restWord: delay ? "a minute or two" : "an hour" };
}
/* Google's free-tier daily counters reset at midnight Pacific time: how long
   until the next one, and that moment on the sheet's own clock */
function batchPacificReset_() {
  var now = new Date();
  var hms = Utilities.formatDate(now, "America/Los_Angeles", "HH:mm:ss").split(":");
  var secIn = Number(hms[0]) * 3600 + Number(hms[1]) * 60 + Number(hms[2]);
  var ms = (86400 - secIn) * 1000 + 2 * 60000;          // two minutes' grace
  var at = new Date(now.getTime() + ms);
  return { ms: ms, local: Utilities.formatDate(at, Session.getScriptTimeZone(), "HH:mm"), at: at };
}
function batchUsage_() {
  var u = null;
  try { u = JSON.parse(PropertiesService.getScriptProperties().getProperty("BATCH_USAGE") || "null"); } catch (e) {}
  if (!u || u.day !== batchUsageDay_()) u = { day: batchUsageDay_(), counts: {}, last429: "", rest: {} };
  if (!u.rest) u.rest = {};
  return u;
}
function batchCount_(model, hit429, restModel, restMs) {
  try {
    var u = batchUsage_();
    if (model) u.counts[model] = (u.counts[model] || 0) + 1;
    if (hit429) u.last429 = hit429 + " at " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    if (restModel) u.rest[restModel] = Date.now() + (restMs || BATCH_REST_MS) - BATCH_REST_MS;   // "until" stored as start + rest − hour
    PropertiesService.getScriptProperties().setProperty("BATCH_USAGE", JSON.stringify(u));
  } catch (e) {}
}
/* models resting after a 429 (limit hit within the last hour) */
function batchResting_() {
  var u = batchUsage_(), out = {};
  Object.keys(u.rest || {}).forEach(function (m) { if (Date.now() - Number(u.rest[m]) < BATCH_REST_MS) out[m] = Number(u.rest[m]); });
  return out;
}
function batchStatus_() {
  var props = PropertiesService.getScriptProperties();
  var last = null; try { last = JSON.parse(props.getProperty("BATCH_LAST") || "null"); } catch (e) {}
  // a run that started and never finished (Google's 6-minute limit)
  var running = null; try { running = JSON.parse(props.getProperty("BATCH_RUNNING") || "null"); } catch (e) {}
  var cutOff = "";
  if (running && running.at) {
    var age = Date.now() - new Date(running.at).getTime();
    if (age > 7 * 60000) cutOff = "a run that started at " + String(running.at).replace("T", " ").slice(0, 16) + " UTC did not finish \u2014 cut off at Google's 6-minute limit; what it had read is kept and the rest continues";
    else running = Object.assign(running, { live: true });
  }
  var u = batchUsage_();
  var usage = Object.keys(u.counts).map(function (m) { return { model: m, label: mcLabel(m), n: u.counts[m] }; });
  var rest = batchResting_();
  var resting = Object.keys(rest).map(function (m) { return { model: m, label: mcLabel(m), until: Utilities.formatDate(new Date(rest[m] + BATCH_REST_MS), Session.getScriptTimeZone(), "HH:mm") }; });
  var p = batchPrompts_();
  var inboxUrl = "", cagUrl = "", ptcaUrl = "";
  try {
    var it = DriveApp.getFoldersByName(props.getProperty("BATCH_INBOX") || BATCH_INBOX_DEFAULT);
    if (it.hasNext()) {
      var ib = it.next(); inboxUrl = ib.getUrl();
      var s1 = ib.getFoldersByName(BATCH_SUB_CAG); if (s1.hasNext()) cagUrl = s1.next().getUrl();
      var s2 = ib.getFoldersByName(BATCH_SUB_PTCA); if (s2.hasNext()) ptcaUrl = s2.next().getUrl();
    }
  } catch (e) {}
  var sheetWebUrl = ""; try { sheetWebUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) {}
  return { scheduled: batchTriggers_().length > 0 && !batchOff_(), off: batchOff_(), keySet: !!geminiKey_(), sheetWebUrl: sheetWebUrl,
    promptsVersion: p ? String(p.appVersion || "") : "", promptsSentAt: p ? String(p.sentAt || "") : "",
    inboxUrl: inboxUrl, cagUrl: cagUrl, ptcaUrl: ptcaUrl, ptcaPrompts: !!(p && p.ptcaReady),
    everyMin: BATCH_EVERY_MIN, gapSec: batchGapMs_() / 1000, models: batchModels_(), last: last, keep: batchKeepN_(), prune: batchPruneN_(), hkOn: !batchHousekeepOff_(),
    running: running && running.live ? running : null, cutOff: cutOff, usage: usage, last429: u.last429 || "", resting: resting };
}
function batchList_() {
  var tab = batchTabRows_();
  return tab.rows.map(function (r) {
    return { caseId: r.caseId, status: r.status, created: r.created, updated: r.updated, files: r.files,
      pages: r.pages, grouping: r.grouping, name: r.name, cagNo: r.cagNo, type: r.type,
      uploaded: r.uploaded, scannedAt: r.scannedAt, checkedAt: r.checkedAt, filesRemoved: r.filesRemoved,
      sheets: Object.keys(r.results || {}).filter(function (k) { return BATCH_SLOTS.indexOf(k) >= 0; }),
      errors: r.errors, openedBy: r.openedBy, savedBy: r.savedBy };
  }).reverse();
}
function batchGet_(req) {
  var tab = batchTabRows_();
  var r = tab.byId[String(req.caseId || "")];
  if (!r) return { found: false };
  var files = r.fileIds.map(function (id, i) {
    var o = { id: id, name: r.files[i] || "", mime: "", size: 0, url: "" };
    try { var f = DriveApp.getFileById(id); o.mime = String(f.getMimeType() || ""); o.size = f.getSize(); o.url = f.getUrl(); } catch (e) {}
    return o;
  });
  return { found: true, caseId: r.caseId, status: r.status, created: r.created, updated: r.updated, grouping: r.grouping,
    name: r.name, cagNo: r.cagNo, type: r.type, uploaded: r.uploaded, scannedAt: r.scannedAt, checkedAt: r.checkedAt, filesRemoved: r.filesRemoved,
    draft: r.draft, draftAt: r.draftAt, draftBy: r.draftBy, draftMs: r.draftMs, pageMap: r.pageMap, results: r.results, errors: r.errors, log: r.log,
    models: r.models, files: files, openedBy: r.openedBy, savedBy: r.savedBy };
}
/* the bytes of one of a case's files, so the app can show the page beside
   the review screen (and, for a PDF, split it itself the way it does now) */
function batchFile_(req) {
  var tab = batchTabRows_();
  var r = tab.byId[String(req.caseId || "")];
  var id = String(req.fileId || "");
  if (!r || r.fileIds.indexOf(id) < 0) throw new Error("that file is not part of that case");
  var f = DriveApp.getFileById(id);
  var blob = f.getBlob();
  return { fileId: id, name: f.getName(), mime: String(blob.getContentType() || f.getMimeType() || ""),
    b64: Utilities.base64Encode(blob.getBytes()) };
}
/* "Save draft" from the review screen: the case as the resident left it,
   kept on the row so any phone opens it that way next */
function batchDraft_(req) {
  var tab = batchTabRows_();
  var r = tab.byId[String(req.caseId || "")];
  if (!r) throw new Error("this case is no longer in the sheet");
  var d = String(req.draft || "");
  if (d.length > 49000) throw new Error("this case is too large to keep as a draft in the sheet (" + d.length + " characters)");
  r.draft = d;
  r.draftAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  r.draftBy = String(req.by || "");
  r.draftMs = Number(req.ms) || Date.now();
  r.log = (r.log ? r.log + "\n" : "") + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss") + " draft saved" + (r.draftBy ? " by " + r.draftBy : "");
  batchWriteRow_(r);
  return { draftAt: r.draftAt, draftBy: r.draftBy, draftMs: r.draftMs };
}
function batchMark_(caseId, mark, by) {
  var tab = batchTabRows_();
  var r = tab.byId[caseId];
  if (!r) return false;
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  if (mark === "opened") r.openedBy = (by ? by + " " : "") + now;
  else if (mark === "saved") { r.savedBy = (by ? by + " " : "") + now; r.status = "saved"; r.checkedAt = now; }
  else if (mark === "dismissed") r.status = "dismissed";
  else return false;
  batchWriteRow_(r);
  return true;
}
/* a failed (or scanned) case read again from scratch: its files go back to
   the inbox and the row is reset to queued */
function batchRetry_(caseId) {
  var tab = batchTabRows_();
  var r = tab.byId[caseId];
  if (!r) return false;
  if (r.filesRemoved) throw new Error("this case's files were removed from Drive by housekeeping on " + r.filesRemoved + " — upload the PDF again as a new case");
  var f = batchFolders_();
  var typeName = batchType_(r.type) === "PTCA" ? BATCH_SUB_PTCA : BATCH_SUB_CAG;
  var back = batchType_(r.type) === "PTCA" ? f.ptca : f.cag;
  r.fileIds.forEach(function (id) { try { DriveApp.getFileById(id).moveTo(back); } catch (e) {} });
  [f.done, f.fail].forEach(function (root) {
    [root].concat((function () { var t = root.getFoldersByName(typeName); return t.hasNext() ? [t.next()] : []; })()).forEach(function (parent) {
      try { var d = parent.getFoldersByName(caseId); if (d.hasNext()) { var sub = d.next(); if (!sub.getFiles().hasNext()) sub.setTrashed(true); } } catch (e) {}
    });
  });
  r.status = "queued"; r.pageMap = []; r.results = {}; r.errors = []; r.pages = 0; r.scannedAt = ""; r.checkedAt = ""; r.savedBy = "";
  r.draft = ""; r.draftAt = ""; r.draftBy = ""; r.draftMs = 0;
  r.log = (r.log ? r.log + "\n" : "") + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss") + " retry: queued again from the app";
  batchWriteRow_(r);
  return true;
}

/* ============================================================
   The daily check of Google's Gemini models (v8)
   Runs every morning between 5:00 and 5:30 India time on a trigger that
   setupDailyModelCheck installs. It needs the script property GEMINI_KEY.
   What it finds is kept in the script property GEMINI_MODELS (JSON) and
   handed to the app by the "models" action.
   ============================================================ */
var GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
var MODELS_PROP = "GEMINI_MODELS";
var MODEL_OFF_PROP = "MODEL_CHECK_OFF";     // set by removeDailyModelCheck
var MODEL_CHECK_FN = "checkGeminiModels";
var MODEL_HOUR = 5, MODEL_TZ = "Asia/Kolkata";

/* Run this ONCE from the editor (choose it in the function box, press Run).
   It schedules the daily check, runs the first one now and writes what it
   found to the Execution log. */
function setupDailyModelCheck() {
  if (!geminiKey_()) {
    throw new Error("Add the key first: Project Settings → Script properties → Add script property → " +
      "GEMINI_KEY = a free Gemini API key from Google AI Studio. Then run setupDailyModelCheck again.");
  }
  PropertiesService.getScriptProperties().deleteProperty(MODEL_OFF_PROP);
  CacheService.getScriptCache().remove("mcTrigOK");
  installModelTrigger_();
  var r = checkGeminiModels();
  Logger.log("The model check now runs every day between " + MODEL_HOUR + ":00 and " + MODEL_HOUR + ":30 (" + MODEL_TZ + ").");
  if (r.lastError) Logger.log("This first check failed: " + r.lastError);
  if (r.shown && r.shown.length) Logger.log("The app will offer: " + r.shown.map(mcLabel).join(", ") + ".");
  (r.models || []).forEach(function (m) { Logger.log("  " + m.label + " (" + MC_TIER_WORD[m.tier] + "): " + m.note); });
  return r;
}

/* Turns the daily check off until setupDailyModelCheck is run again (the
   last list stays; phones then check with their own keys once it is a day
   old). */
function removeDailyModelCheck() {
  PropertiesService.getScriptProperties().setProperty(MODEL_OFF_PROP, "1");
  modelTriggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  CacheService.getScriptCache().remove("mcTrigOK");
  Logger.log("The daily model check is off. Run setupDailyModelCheck to turn it back on.");
}
function modelCheckOff_() {
  return PropertiesService.getScriptProperties().getProperty(MODEL_OFF_PROP) === "1";
}

/* What the 5 a.m. trigger runs — and "Check now" in the app. A check that
   fails (no key, no internet, Google refusing the key) keeps the last good
   list and records why beside it. Only one check runs at a time. */
function checkGeminiModels() {
  var cache = CacheService.getScriptCache();
  if (cache.get("mcRunning")) return readModels_();
  cache.put("mcRunning", "1", 300);
  try {
    var prev = readModels_();
    var now = new Date().toISOString();
    var key = geminiKey_(), res;
    if (!key) res = { ok: false, error: "There is no GEMINI_KEY in the script properties." };
    else {
      try { res = runModelCheck_(key, prev, now); }
      catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
    }
    var stored = res.ok
      ? Object.assign(res, { lastAttemptAt: now, lastError: "" })
      : Object.assign({ v: 1, source: "sheet", ok: false, checkedAt: "", models: [], shown: [] },
          prev && prev.checkedAt ? prev : {}, { lastAttemptAt: now, lastError: res.error });
    saveModels_(stored);
    return stored;
  } finally {
    cache.remove("mcRunning");
  }
}

function runModelCheck_(key, prev, nowIso) {
  var cands = mcCandidates(listGeminiModels_(key));
  var results = {};
  for (var round = 0; round < 8; round++) {
    var batch = mcNextBatch(cands, results);
    if (!batch.length) break;
    var answers = fetchAllSafe_(batch.map(function (c) {
      return { url: GEMINI_API + "/models/" + c.id + ":generateContent", method: "post",
        contentType: "application/json", headers: { "x-goog-api-key": key },
        payload: JSON.stringify(MC_PROBE_BODY), muteHttpExceptions: true };
    }));
    answers.forEach(function (a, i) { results[batch[i].id] = mcClassify(a.code, a.body, batch[i].id); });
  }
  return mcBuild(cands, results, prev, "sheet", nowIso);
}
/* fetchAll throws when ANY request gets no answer at all (a timeout, say),
   even with muteHttpExceptions. Then each is sent on its own, so one
   silent model only marks that model as "no answer". */
function fetchAllSafe_(reqs) {
  var read = function (a) { return { code: a.getResponseCode(), body: a.getContentText() }; };
  try {
    return UrlFetchApp.fetchAll(reqs).map(read);
  } catch (e) {
    return reqs.map(function (r) {
      try { return read(UrlFetchApp.fetch(r.url, r)); }
      catch (e2) { return { code: 0, body: String((e2 && e2.message) || e2) }; }
    });
  }
}

function listGeminiModels_(key) {
  var all = [], token = "";
  for (var page = 0; page < 10; page++) {
    var r = UrlFetchApp.fetch(GEMINI_API + "/models?pageSize=1000" + (token ? "&pageToken=" + encodeURIComponent(token) : ""),
      { headers: { "x-goog-api-key": key }, muteHttpExceptions: true });
    var code = r.getResponseCode(), text = r.getContentText();
    if (code !== 200) {
      var c = mcClassify(code, text, "");
      throw new Error(c.status === "badkey" ? "Google refused the API key in GEMINI_KEY."
        : "Google's model list could not be read (" + code + "): " + c.note);
    }
    var j = JSON.parse(text);
    all = all.concat(j.models || []);
    token = j.nextPageToken || "";
    if (!token) break;
  }
  return all;
}

function geminiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty("GEMINI_KEY") || "").trim();
}
function readModels_() {
  try {
    var s = PropertiesService.getScriptProperties().getProperty(MODELS_PROP);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}
/* A script property holds 9 kB; the list is normally under 3 kB, but long
   notes from Google are shortened if it ever comes close. */
function saveModels_(o) {
  var s = JSON.stringify(o);
  if (s.length > 8500) {
    (o.models || []).forEach(function (m) { m.note = String(m.note || "").slice(0, 60); });
    s = JSON.stringify(o);
  }
  PropertiesService.getScriptProperties().setProperty(MODELS_PROP, s);
}

function modelTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === MODEL_CHECK_FN; });
}
/* One daily trigger at 5 a.m. India time. nearMinute(15) asks Google for
   5:15 give or take 15 minutes, so it never runs before 5:00. */
function installModelTrigger_() {
  var have = modelTriggers_();
  for (var i = 1; i < have.length; i++) ScriptApp.deleteTrigger(have[i]);   // one is enough
  if (have.length) return false;
  var ways = [
    function () { return ScriptApp.newTrigger(MODEL_CHECK_FN).timeBased().atHour(MODEL_HOUR).nearMinute(15).everyDays(1).inTimezone(MODEL_TZ).create(); },
    function () { return ScriptApp.newTrigger(MODEL_CHECK_FN).timeBased().atHour(MODEL_HOUR).everyDays(1).inTimezone(MODEL_TZ).create(); }
  ];
  var err = null;
  for (var k = 0; k < ways.length; k++) {
    try { ways[k](); return true; } catch (e) { err = e; }
  }
  throw err;
}

/* The "models" / "modelsCheck" reply. When GEMINI_KEY is set the daily
   trigger is (re)installed if it has gone missing — looked at once every six
   hours, not on every request — unless removeDailyModelCheck turned the
   check off. */
function modelsInfo_(runNow) {
  var hasKey = !!geminiKey_(), off = modelCheckOff_();
  var scheduled = null, scheduleError = "";
  var cache = CacheService.getScriptCache();
  try {
    if (hasKey && !off && cache.get("mcTrigOK")) scheduled = true;
    else {
      if (hasKey && !off) installModelTrigger_();
      scheduled = modelTriggers_().length > 0;
      if (scheduled) cache.put("mcTrigOK", "1", 21600);
    }
  } catch (e) {
    scheduleError = String((e && e.message) || e);
  }
  var stored = runNow ? checkGeminiModels() : readModels_();
  return { models: stored, keySet: hasKey, off: off, scheduled: scheduled, scheduleError: scheduleError,
    hour: MODEL_HOUR, tz: MODEL_TZ };
}
/* For "whoami" (Settings → Test connection): is the daily check working? */
function modelsSummary_() {
  var m = readModels_();
  return { keySet: !!geminiKey_(), off: modelCheckOff_(), checkedAt: (m && m.checkedAt) || "",
    lastAttemptAt: (m && m.lastAttemptAt) || "", lastError: (m && m.lastError) || "", shown: (m && m.shown) || [] };
}

/* ============================================================
   Gemini model catalogue — which models are free today, and which to offer.
   The same block sits in the app (cagscannergemini13.html) and in the sheet
   script, so the phone and the 5 a.m. check rank and pick models in
   exactly the same way.

   Tiers come from Google's own names: Pro (and Ultra) = high, Flash = mid,
   Flash-Lite = low. Only plain text-and-vision models are considered — the
   image, speech, live, audio and tool variants cannot read a proforma.
   ============================================================ */
var MC_FAMILY = {
  "ultra":      { tier: "high", rank: 4, word: "Ultra" },
  "pro":        { tier: "high", rank: 3, word: "Pro" },
  "flash":      { tier: "mid",  rank: 2, word: "Flash" },
  "flash-lite": { tier: "low",  rank: 1, word: "Flash-Lite" }
};
var MC_TIER_ORDER = ["high", "mid", "low"];
var MC_TIER_WORD = { high: "High", mid: "Mid", low: "Low" };
var MC_STAGE_RANK = { stable: 3, preview: 2, exp: 1 };
var MC_SHOW = 5;          // model buttons offered, at most
var MC_WANT = 3;          // free models looked for in each tier
var MC_PROBE_MAX = 6;     // test requests per tier per check, at most (retired names
                          // that Google routes elsewhere use some of these)
/* The test request is as small as a request can be: it only has to show
   whether this key may use the model free of charge. */
var MC_PROBE_BODY = { contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
                      generationConfig: { maxOutputTokens: 32 } };

/* "gemini-3.6-flash" -> { tier: "mid", version: "3.6", stage: "stable", label: "Gemini 3.6 Flash", … }.
   null for anything that is not a plain reading model. */
function mcParse(id) {
  id = String(id == null ? "" : id).replace(/^models\//, "").trim();
  var m = /^gemini-(\d+)(?:\.(\d+))?-(ultra|pro|flash-lite|flash)(?:-([a-z0-9][a-z0-9-]*))?$/.exec(id);
  if (!m) return null;
  var suffix = m[4] || "", stage;
  if (!suffix || /^\d{3}$/.test(suffix)) stage = "stable";
  else if (/^preview(?:-\d{2,4}){0,3}$/.test(suffix)) stage = "preview";
  else if (/^exp(?:-\d{2,4}){0,3}$/.test(suffix)) stage = "exp";
  else return null;          // -image, -tts, -live, -native-audio, -customtools …
  var fam = MC_FAMILY[m[3]];
  var version = m[2] == null ? m[1] : m[1] + "." + m[2];
  return {
    id: id, family: m[3], tier: fam.tier, major: Number(m[1]), minor: m[2] == null ? 0 : Number(m[2]),
    version: version, stage: stage, suffix: suffix,
    label: "Gemini " + version + " " + fam.word + (stage === "preview" ? " Preview" : stage === "exp" ? " Experimental" : "")
  };
}
function mcTier(id) { var p = mcParse(id); return p ? p.tier : ""; }
function mcLabel(id) { var p = mcParse(id); return p ? p.label : String(id || ""); }

/* plain name first ("gemini-2.5-flash" before "gemini-2.5-flash-001"),
   an undated preview before a dated one */
function mcSuffixRank(p) {
  if (!p.suffix || p.suffix === "preview" || p.suffix === "exp") return 2;
  return /^\d{3}$/.test(p.suffix) ? 1 : 0;
}
/* Best first: the higher tier, then the newer version (3.10 above 3.8 —
   versions compare as numbers), then stable before preview before
   experimental. */
function mcCompare(a, b) {
  return (MC_FAMILY[b.family].rank - MC_FAMILY[a.family].rank) ||
    (b.major - a.major) || (b.minor - a.minor) ||
    (MC_STAGE_RANK[b.stage] - MC_STAGE_RANK[a.stage]) ||
    (mcSuffixRank(b) - mcSuffixRank(a)) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function mcCompareIds(a, b) {
  var pa = mcParse(a && a.id != null ? a.id : a), pb = mcParse(b && b.id != null ? b.id : b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return mcCompare(pa, pb);
}

/* Google's model list -> the reading models worth testing, best first, one
   per version (a stable name wins over its preview, an undated preview over
   a dated one). Accepts Google's entries or bare ids. */
function mcCandidates(list) {
  var byKey = {}, out = [];
  (list || []).forEach(function (m) {
    if (!m) return;
    var methods = m.supportedGenerationMethods;
    if (Array.isArray(methods) && methods.indexOf("generateContent") < 0) return;
    var p = mcParse(typeof m === "string" ? m : m.name);
    if (!p) return;
    var k = p.family + "|" + p.major + "." + p.minor;
    if (!byKey[k] || mcCompare(p, byKey[k]) < 0) byKey[k] = p;
  });
  Object.keys(byKey).forEach(function (k) { out.push(byKey[k]); });
  return out.sort(mcCompare);
}

/* What one test request's answer says about the model, for THIS key.
   429 with "free_tier_requests, limit: 0" is Google's way of saying the
   model has no free tier; a 429 with a real limit only means today's free
   quota is used up — the model is still free. A retired name that Google
   now quietly routes to its successor answers 200 too, but its reply names
   the model that actually answered (modelVersion): such a name is an alias,
   not a model of its own, and is left out. */
function mcClassify(code, text, id) {
  code = Number(code) || 0;
  var body = String(text == null ? "" : text), msg = body, j = null;
  try { j = JSON.parse(body); if (j && j.error && j.error.message) msg = String(j.error.message); } catch (e) {}
  var said = msg.replace(/\s+/g, " ").trim().slice(0, 160);
  if (code >= 200 && code < 300) {
    var served = mcParse(j && j.modelVersion), asked = mcParse(id);
    if (served && asked && (served.family !== asked.family || served.major !== asked.major || served.minor !== asked.minor)) {
      return { status: "alias", note: "now answered by " + served.label, servedBy: served.id };
    }
    return { status: "free", note: "free" };
  }
  if (code === 429) {
    var lims = [], re = /free_tier[a-z_]*,\s*limit:\s*(\d+)/gi, mm;
    while ((mm = re.exec(msg))) lims.push(Number(mm[1]));
    if (!lims.length) { re = /\blimit:\s*(\d+)/gi; while ((mm = re.exec(msg))) lims.push(Number(mm[1])); }
    if (lims.length && lims.indexOf(0) >= 0) return { status: "nofree", note: "no free tier" };
    return { status: "busy", note: "free — its daily limit was used up at the time of the check" };
  }
  if (code === 404) return { status: "gone", note: "not offered any more (retired)" };
  if (code === 400 || code === 401 || code === 403) {
    if (/api[_ ]?key|API_KEY_INVALID|unregistered callers/i.test(msg)) return { status: "badkey", note: "Google refused the API key" };
    if (/location is not supported/i.test(msg)) return { status: "denied", note: "not offered in this region" };
    if (code === 403) return { status: "denied", note: said ? "no access for this key — " + said : "no access for this key" };
    return { status: "unusable", note: said ? "Google refused the test — " + said : "Google refused the test" };
  }
  return { status: "unknown", note: code ? "Google answered " + code : "no answer" };
}
function mcUsableStatus(s) { return s === "free" || s === "busy" || s === "unknown"; }

/* The next test requests to send: in each tier, the best untested models,
   until MC_WANT free ones are found or MC_PROBE_MAX have been tried. */
function mcNextBatch(cands, results) {
  var batch = [];
  MC_TIER_ORDER.forEach(function (t) {
    var inTier = cands.filter(function (c) { return c.tier === t; });
    var probed = inTier.filter(function (c) { return results[c.id]; });
    var good = probed.filter(function (c) { return mcUsableStatus(results[c.id].status); }).length;
    var n = Math.min(MC_WANT - good, MC_PROBE_MAX - probed.length);
    if (n > 0) batch = batch.concat(inTier.filter(function (c) { return !results[c.id]; }).slice(0, n));
  });
  return batch;
}

/* Up to `max` models, highest first, with every tier that has a free model
   represented: the best of each tier is taken in turn (high, mid, low), then
   the next best of each, until the buttons are full. */
function mcPick(models, max) {
  var q = { high: [], mid: [], low: [] }, picked = [];
  (models || []).filter(function (m) { return m && m.usable === true && Object.prototype.hasOwnProperty.call(q, m.tier); })
    .slice().sort(mcCompareIds).forEach(function (m) { q[m.tier].push(m); });
  while (picked.length < max && (q.high.length || q.mid.length || q.low.length)) {
    MC_TIER_ORDER.forEach(function (t) { if (picked.length < max && q[t].length) picked.push(q[t].shift()); });
  }
  return picked.sort(mcCompareIds);
}

/* One check's outcome. A model Google was too busy to answer for keeps the
   verdict of the previous check (and counts as free when there was none). */
function mcBuild(cands, results, prev, source, nowIso) {
  var prevBy = {};
  ((prev && prev.models) || []).forEach(function (m) { prevBy[m.id] = m; });
  var models = cands.map(function (c) {
    var r = results[c.id];
    var o = { id: c.id, label: c.label, tier: c.tier, stage: c.stage,
      status: r ? r.status : "unchecked", note: r ? r.note : "not tested (an older version)" };
    if (r && r.status === "unknown" && prevBy[c.id]) {
      o.usable = !!prevBy[c.id].usable;
      o.note = o.usable ? "Google did not answer; free at the last check" : "Google did not answer; not free at the last check";
    } else o.usable = !!r && mcUsableStatus(r.status);
    return o;
  });
  var shown = mcPick(models, MC_SHOW);
  var tested = models.filter(function (m) { return m.status !== "unchecked"; });
  var every = function (s) { return tested.length > 0 && tested.every(function (m) { return m.status === s; }); };
  var error = "";
  if (every("badkey")) error = "Google refused the API key.";
  else if (every("denied")) error = "Google refused this key: " + tested[0].note.replace(/^no access for this key — /, "");
  else if (!shown.length) error = tested.length ? "No model answered as free." : "Google listed no model that can read forms.";
  return { v: 1, source: source, ok: !error, error: error, checkedAt: nowIso,
    models: models, shown: shown.map(function (m) { return m.id; }) };
}
