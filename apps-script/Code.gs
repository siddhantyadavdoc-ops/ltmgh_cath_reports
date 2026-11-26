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
 *   BATCH_FETCH_SEC    seconds one request to a model may take, default 90
 *                      (20 to 240) — see 13.43 below
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
 * What changed in 13.51 — barcodes read on the phone, LOT and expiry checked
 *   - The app reads the barcodes of a stock, weekly or used-instruments photo
 *     on the full-size picture before it is made smaller, and sends them with
 *     the upload (stentUpload: scan [{t, x, y}]); they are kept in the new
 *     "Photo barcodes" tab. When the photo is read, each barcode is given to
 *     the box whose label it lies on. Such a box takes its LOT, expiry, serial
 *     and GTIN from the barcode (new column "Scanned barcode"), and its own
 *     number — (91) on Abbott boxes, (93) on Terumo, (21) or the serial —
 *     decides repeat or new: the same number as a counted box is that box;
 *     a number no counted box has is another box of the LOT. A barcode on a
 *     box whose counted twin had its LOT misread corrects that LOT.
 *   - A photo read from its barcodes alone, with no Gemini request: when the
 *     phone read a barcode on every box (the technician says so) and every
 *     product is already known (GTIN, or an NC Rockstar's size code, from
 *     boxes counted before — the catalogue goes to the app with the list),
 *     the photo is read at once on upload and filed. Otherwise Gemini reads
 *     it as before. A barcode whose own number is on a box already used or
 *     returned is kept to check; two LOTs both read from barcodes are never
 *     taken as a misread of one another.
 *   - A box read from a photo must have a LOT and an expiry that fit together
 *     (Terumo: the end of the month 23 months after the LOT's date; Xience:
 *     2–10 days short of 3 years after it; NC Trek / Mini Trek: the end of the
 *     month 35 months after; NC Rockstar: the serial carries the expiry). One
 *     that does not is kept to check, not counted.
 *   - A used-instruments label is matched to its box by the barcode's own
 *     number first.
 *   - Drive folders renamed (their files and links stay): "Inventory uploads /
 *     processed" → "Stock in upload / processed"; "Instruments used upload /
 *     processed" → "Stock out upload / processed".
 *   - Once after deploying: the barcode check of 24 Nov (read by Claude, no
 *     Gemini) — one box read twice discarded, four boxes made repeats of boxes
 *     already counted, four boxes counted that were not (net +3 in stock), ten
 *     misread LOTs corrected, and the barcodes of 201 boxes kept.
 *
 * What changed in 13.50 — every instrument from stock photos, start dates, photos
 *   - Thinking: every request asks the model to think "low" (script property
 *     THINKING: minimal / low / medium / high / auto), set from the app's
 *     Gemini costs page with no new version (action thinkSet).
 *   - Stock by count: anything but stents can be added as type, brand, size and
 *     a number (no LOT, number or expiry); stents only from a stock photo.
 *   - Stock photos are read for every kind of equipment (balloons, wires,
 *     guides… not only stents), foreground boxes only; boxes behind are
 *     listed as "background", not counted. Each box keeps its place in the
 *     photo (box_2d), so the page can ring it ("Show in photo"). A brand that
 *     prints no LOT is told apart by its own number (serial).
 *   - Balloons and other diameter × length kinds are grouped like stents.
 *   - Each item has its own "Counts from" date (Inventory tab, new column):
 *     uses dated before it are not taken off. An item first counted from a
 *     photo taken from 20 Nov 2026 starts the day after that photo; set by
 *     hand (one item or a whole brand) it is never changed automatically.
 *   - "Inventory uploads" and "Inventory processed" get a folder per kind of
 *     equipment. A photo is filed in the processed folder of what it mostly
 *     shows (a tie: stents if any, else alphabetically); a photo in the wrong
 *     folder is read as what it shows, and said so.
 *   - "Instruments used upload" / "processed": one or two photos a day of the
 *     box flaps / labels of everything opened. Each label is matched to its
 *     box (LOT or own number) — that box becomes "used" (its receipt stays:
 *     the utilization sheet took it off); a label with no box is kept as a
 *     used row. The photo is compared with the day's utilization sheets.
 *   - "Weekly shelf photos" (inside Inventory uploads): read like stock
 *     photos; once a day's are all read, boxes of the brands photographed
 *     that were not seen become "unseen" (out of the expiry alerts; seen
 *     again → in stock), and each size's photo count is put beside its list
 *     count. The app reminds for the day photo from 3 pm, and weekly.
 *   - Once after deploying: the balloon boxes of the 20 Nov photos (read by
 *     Claude, no Gemini) are written into Stock boxes; balloon uses are taken
 *     off from 21 Nov; expired boxes are put to check.
 *
 * What changed in 13.49 — inbox cases open faster, CAG number from the diagram,
 *   stock photos read box by box
 *   - Stock photos (Inventory uploads) are read with a prompt for boxes on a
 *     shelf; every box becomes a row of the new "Stock boxes" tab with its
 *     LOT, REF, GTIN, expiry and barcode text. Overlapping photos of one
 *     shelf count a box once (per GTIN/REF and LOT, a photo adds only the
 *     boxes beyond those already in stock); a box without brand, diameter,
 *     length or a clear LOT — or whose LOT disagrees with its barcode line —
 *     is kept "to check", not counted. Actions invReread (read every stock
 *     photo again) and boxSave (add, count as another box, discard).
 *   - Done once, automatically, on the first run after 13.49 goes in: the
 *     stock photos read by 13.48 are read again box by box, and stock photos
 *     still among the used-stent photos (from 19 Nov, no patient, 3+
 *     stickers) are moved to the inventory and read the same way. That one
 *     correction runs at once, outside the night window too (stock photos only).
 *   - "Open & check": a case's file is served after reading only the case-ID
 *     and file-ID columns (not every row's readings), and the inbox list now
 *     carries each case's file ids, so the app fetches the pages ahead of time
 *     and opens the review screen before the pages arrive.
 *   - A CAG proforma with no CAG number takes it from the diagram sheet (or an
 *     angiography sheet), with a note on the case saying where it came from.
 *
 * What changed in 13.48 — lower Gemini bills, wrong-folder uploads, PTCA numbers
 * - Google's half-price batch queue: on the automatic (night) runs, once a
 *   case's pages are recognised, all its sheets go to Google as ONE batch
 *   job (Batch API, 50% of the normal price) instead of one request at a
 *   time. Every 5 minutes the script asks whether the job is done — also
 *   outside the scan window — and stores the answers as before. A sheet the
 *   queue could not read, a job Google fails, or one not back within
 *   BATCH_QUEUE_HOURS (default 6) is read directly, as before. Scans started
 *   from the app are never queued: "Scan the inbox now" reads new cases at
 *   once (a case already queued keeps waiting), and "Scan now" on a queued
 *   case cancels its job and reads it at once. Script property
 *   BATCH_HALF_PRICE = on (default) | off.
 * - The PTCA number: written xxxxAPzzzz (cath number, AP, PTCA number). When
 *   the front page has no full number it is taken from the "PTCA / Cath No."
 *   line at the top of pages 2-4 (hdrPtcaNo, read by app 13.48's prompts) or
 *   the utilization sheet (Cath No. + "IP No. PTCA"). It labels the case in
 *   the inbox list, and sheets that disagree (or a CAG number written in the
 *   PTCA box) are noted as a problem on the case ("numbers").
 * - The CAG proforma's CAG No.: digits only, the CAG number + the year of the
 *   CAG. Letters, another form, or a year that is not the CAG date's (2020
 *   read for 2026) are noted on the case ("numbers"). PTCA lookups by CAG No.
 *   now match "2343/2026" and "23432026" as the same number.
 * - Tokens: each page's note in the case log gives Google's own count —
 *   tokens in, answer, thinking — and the case's finish note the totals.
 * - Technicians: the stent folders are renamed "Used stents upload" and "Used
 *   stents processed" (the same folders, renamed on the first run). A new
 *   folder pair, "Inventory uploads" / "Inventory processed", takes photos of
 *   stock RECEIVED: each sticker read there is added to the inventory
 *   ("received", keyed STOCK <upload>-<n>). Action stentToStock moves a photo
 *   read as used stents to the inventory instead (its stickers leave the
 *   Stents tab, are added as received, the photo moves to Inventory
 *   processed). invScanNow reads the inventory photos only; stentScanNow
 *   still reads the used-stent photos only. Uploads tab: new "Purpose" column.
 * - The wrong folder: a CAG proforma uploaded into the PTCA folder (or a
 *   PTCA one into CAG) is noticed at page recognition — few pages fit and
 *   several are "other" — looked at once more as the other form, and read
 *   as that type ("wrong folder" in the case's log). If no page fits either
 *   form the case fails before any reading is paid for.
 *
 * What changed in 13.44 — the cath lab's technicians: stents and inventory
 * - A key of their own: script property TECH_KEY (different from EDIT_KEY).
 *   An editor can set it from the app (Settings → Technicians' key → "Make
 *   this the technicians' key"). A device with it has the "Stents &
 *   inventory" page; nobody else does. With no TECH_KEY, nobody has it.
 * - Stent stickers: the inbox gets two more folders, "Stents uploads" and
 *   "Stents scanned" (created by the first run; share "Stents uploads" with
 *   the technicians, or they upload from the app). One photo per patient:
 *   name and PTCA / Cath No. written on a sheet, the device labels stuck
 *   beside them. The inbox scanner reads each photo after the proformas of a
 *   run, writes one row per sticker to the "Stents" tab (brand, size, REF,
 *   LOT, serial, expiry, GTIN, the barcode / QR numbers), keeps a row per
 *   photo in "Stent uploads", and moves the photo to "Stents scanned", where
 *   only the newest STENT_KEEP (default 200) photos stay.
 * - Bills: the app sends a bill's photo (stentReadBill), the script reads it
 *   with its Gemini key and the app finds the sticker (and the case) it
 *   belongs to. A sticker can be marked billed (bill no., date, vendor).
 * - Inventory: "Inventory" (one row per Type / Brand / Size, with the stock
 *   now, coloured by type) and "Inventory moves" (every received, used,
 *   reused, counted or corrected unit). Each saved PTCA brings its hardware
 *   from the app ("invUse"); a device marked ox / oxy on the utilization
 *   sheet is reused and subtracts nothing. Saving the case again replaces its
 *   entries; removing the case gives them back. PTCAs dated before
 *   INV_START (default 2026-11-17) are listed but not deducted.
 * - New actions: techStatus, invGet, stentList, stentUploads, stentPhoto,
 *   stentReadBill, stentUpload (technicians' key, no lock); invSave,
 *   invApplyPending, stentSave, stentRetry, stentDismiss, stentScanNow
 *   (technicians' key). A PTCA saved from an app older than 13.44 is noted
 *   (INV_PENDING) and its hardware taken off from the technicians' page;
 *   techKeySet (edit key). whoami also says canTech / techSet.
 * - Optional script properties: STENT_KEEP (photos kept, default 200),
 *   STENT_IN / STENT_DONE (folder names), INV_START (yyyy-mm-dd).
 *
 * What changed in 13.43 — a model that does not answer no longer stops the scanner
 * - On 13 Nov 2026 Gemini 3.8 Flash, the first-choice reading model, held
 *   requests for minutes without answering. Apps Script waits 6 minutes for
 *   an answer by default, and Google ends a run at 6 minutes, so every run
 *   was spent waiting: nothing was read, and the next run began with the same
 *   model. "Scan now" in the app ended with "the sheet did not answer".
 * - Every request to a model now has its own limit: 90 s (script property
 *   BATCH_FETCH_SEC), and never past the 300th second of a run.
 * - A model that does not answer in that time, or answers with a fault only
 *   after 45 s, is left alone for 30 minutes; the next model of the chain
 *   carries on with the same page. The log and the app say which model.
 * - If Google still ends a run while it waits (the request "in the air" is
 *   kept in BATCH_FLIGHT), the next run leaves that model alone for an hour
 *   before doing anything else, and says so in the Batch log.
 * - Each case row is written through to the sheet at once, so a run that is
 *   cut off cannot lose the page it had just read.
 * - A run that stops on an error of the script's own says so ("run: error"),
 *   instead of looking like one cut off by Google.
 * - The daily model check's requests have a limit as well (30 s each): that
 *   morning's check had been lost the same way, waiting for the same model.
 * - batchRunNow also answers with "more" (work is left only because the run
 *   ran out of time, and it got somewhere) and "note" (models set aside), so
 *   the app can carry on by itself. batchStatus adds lastSlow, fetchSec, and
 *   why each resting model rests ("slow" or "limit").
 *
 * What changed in 13.41 — the hardware list
 * - The "Rosters" tab keeps a third list beside the doctors' and the
 *   technicians': key "hardware" — the department's devices and their short
 *   forms ("Full name | Type | short form, other spellings", one per line),
 *   edited in the app's Settings. rosterGet answers with it; rosterSave
 *   writes it and says which lists it kept ("keys").
 *
 * What changed in 13.40 — the PTCA utilization sheet is kept with its case
 * - The app sends a 1600 px copy of the technician's utilization sheet with a
 *   PTCA case ("utilB64"). It is filed in a Drive folder ("PTCA utilization
 *   sheets") and its link written into the "Utilization sheet image" column
 *   of the PTCA tab, exactly as the coronary diagram's copy is for a CAG, so
 *   whoever opens the case later can still see the sheet.
 *   Optional: UTIL_FOLDER; sharing follows DIAGRAM_SHARE (link | private).
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

var SCRIPT_VERSION = 13;   // 13.60: the Ultimaster shelf of 26 Nov (60 boxes) put right once — LOTs of stock_20261120-100045 re-read, a third 3.0 × 28 and a new 2.75 × 15 counted, the boxes of PTCA 2397 and 2411 marked used, Ultimaster uses counted from 20 Nov; a sticker photo's barcodes (read on the phone) are given to its stickers ("Scanned barcode", the LOT corrected by them) and every sticker — stent or any other device — marks its very box used (own number (91)/(93)/(21), serial, else LOT among boxes photographed by then); a barcode naming a box not in stock is flagged; a removed sticker gives its box back. 13.58: no script change (scan screen: whole-case upload, then the tabs Upload page by page / Scan page by page NOW). 13.57: no script change (the app can upload a whole CAG or PTCA case file straight to Drive). 13.56: no script change (the app keeps photos as taken and sends nothing to Gemini until "Read now"). 13.55: caseUpload takes one PDF holding all of a case's sheets (stored once if sent twice); 13.54: caseUpload - the app's "Upload to Drive - read later" saves a case in the CAG or PTCA inbox folder for the night scan. 13.53: no script change (Dr. Abhinav Anand taken off the printed PTCA report). 13.52: the PTCA diagram sheet (heart drawing with the stent sticker) is its own slot qd — never read as the utilization report — and its Cath No. is one more PTCA-number source; caseStickers gives the review screen a case's technicians' stickers; CAG numbers are stored as number/year (2145/2026), a bare number taking the year of its CAG, the inbox cases flagged only for a missing year put right once. 13.51: a photo whose every box was read by barcode (known products) is read with no Gemini; the barcodes read on the phone (Photo barcodes tab) settle a box's LOT and expiry and, by its own (91)/(93) number, repeat or new; a LOT and expiry that do not fit are kept to check; the 24 Nov barcode corrections, once. 13.50: stock photos read for every instrument (foreground only, each box placed in the photo), per-item "Counts from" date, a folder per instrument. 13.49: a case's files are served without reading every row's readings, and the inbox list carries each case's file ids (the app fetches the pages ahead); a CAG proforma with no CAG number takes it from the diagram sheet, with a note. 13.48: the night runs send each case's sheets to Google's half-price batch queue (BATCH_HALF_PRICE, BATCH_QUEUE_HOURS); a CAG proforma in the PTCA folder (or the reverse) is read as what it is; the PTCA number is checked across the sheets and the CAG proforma's CAG number against its year; each page's token use is logged. 13.47 / 13.46: no script change. 13.45: stents are taken off the inventory from their stickers (a stent on a utilization sheet with no sticker is put to the technicians to accept or reject), IVUS, OCT and contrast have inventory kinds of their own, contrast and other items can be taken off by hand, and the department's hardware list is put on the inventory once. 13.44: the cath lab's technicians — their own key (TECH_KEY), the stent stickers read from the photos in "Stents uploads" (Stents / Stent uploads tabs, photos moved to "Stents scanned", the newest 200 kept), bills read and matched from the app, and the inventory (Inventory / Inventory moves tabs) that every saved PTCA's utilization sheet subtracts from, ox / oxy items excepted. 13.43: every request to a Gemini model has a time limit of its own (90 s; BATCH_FETCH_SEC), a model that does not answer is left alone for 30 minutes and the next one carries on, a run that Google still cuts off leaves its model alone for an hour, each case row is written through at once, and a scan started from the app is told when more work is left (more). 13.42: no script change (the app prints "Rockstar" as NC Rockstar and a stent's site code in words). 13.41: the Rosters tab also keeps the hardware list (key "hardware"). 13.40: the PTCA utilization sheet's copy is filed in Drive and its link kept on the PTCA row ("Utilization sheet image"). 13.39: no script change (white text on the Read by labels). 13.38: reserve 12 by default; the model that read each sheet is kept (Read by) and shown in the app. 13.37: automatic scans only in a night window (default 20:00–04:00 IST), keeping a reserve of requests for scans started from the app; the leftover reserve is spent in the 90 min before Google's daily reset
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
var UTIL_COL = "Utilization sheet image";   // Drive link of the PTCA utilization sheet's copy (13.40)
var UTIL_FOLDER_DEFAULT = "PTCA utilization sheets";

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
  // 13.44 — the technicians' page: what it reads, a bill read by Gemini and a
  // photo dropped into Stents uploads never wait behind a running batch
  if (action === "techStatus") {
    try { return out(Object.assign({ ok: true }, techStatus_(req))); }
    catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  // 13.52: the technicians' stickers of one PTCA, for the diagram-sheet check on
  // the review screen — an editor (or a technician) may read them
  if (action === "caseStickers") {
    try {
      if (!editAllowed(req.key) && !techAllowed(req.tkey)) return out({ ok: false, error: "needs the edit key or the technicians' key" });
      return out(Object.assign({ ok: true, v: SCRIPT_VERSION }, caseStickers_(req)));
    } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  // 13.54: the app's "Upload to Drive - read later": one photo of a case into the
  // CAG or PTCA inbox folder, named app_<time>_<n> so the night scan keeps them together
  if (action === "caseUpload") {
    try {
      if (!editAllowed(req.key)) return out({ ok: false, error: "needs the edit key" });
      return out(Object.assign({ ok: true, v: SCRIPT_VERSION }, caseUpload_(req)));
    } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  if (action === "invGet" || action === "stentList" || action === "stentUploads" || action === "stentPhoto" || action === "stentReadBill" || action === "stentUpload") {
    try {
      if (!techAllowed(req.tkey)) return out({ ok: false, error: techRefused_(), canTech: false });
      var rt = action === "invGet" ? invGet_(req) : action === "stentList" ? stentList_() : action === "stentUploads" ? stentUploads_()
        : action === "stentPhoto" ? stentPhoto_(req) : action === "stentReadBill" ? stentReadBill_(req) : stentUpload_(req);
      return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, rt));
    } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  if (action === "batchStatus" || action === "batchList" || action === "batchGet") {
    // read-only; the sheet is only read, so no lock is needed either
    try {
      var r0 = action === "batchStatus" ? batchStatus_() : action === "batchList" ? { cases: batchList_() } : batchGet_(req);
      return out(Object.assign({ ok: true, canEdit: editAllowed(req.key), v: SCRIPT_VERSION }, r0));
    } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  }
  // 13.50: the thinking level, read by every phone without waiting for the lock
  if (action === "thinkGet") return out({ ok: true, v: SCRIPT_VERSION, think: thinkInfo_() });
  var lock = LockService.getScriptLock();
  try {
    // a batch run can hold the lock for up to 5 minutes; a phone saving a
    // case waits a little, then is told to try again rather than hanging
    if (!lock.tryLock(25000)) return out({ ok: false, error: "The sheet is busy (the batch scanner is reading a case) — try again in a minute.", busy: true });
    var canEdit = editAllowed(req.key);
    var needEdit = { append: 1, remove: 1, otSave: 1, batchPrompts: 1, batchRetry: 1, batchMark: 1, batchRunNow: 1, rosterSave: 1, batchDraft: 1, batchHousekeepSet: 1, batchScheduleSet: 1, techKeySet: 1 };
    if (needEdit[action] && !canEdit) return out({ ok: false, error: "This device is view-only. Add the edit key in Settings to make changes.", canEdit: false });
    // 13.44 — what changes the inventory or the stents needs the technicians' key
    var needTech = { invSave: 1, invApplyPending: 1, stentSave: 1, stentRetry: 1, stentDismiss: 1, stentScanNow: 1, stentToStock: 1, invScanNow: 1, invReread: 1, boxSave: 1, boxNoMatchOk: 1, boxPhoto: 1 };
    if (needTech[action] && !techAllowed(req.tkey)) return out({ ok: false, error: techRefused_(), canTech: false });
    // 13.50 — costs: a phone's scans are logged with either key; the list and the prices need the edit key
    if (action === "costLog" && !canEdit && !techAllowed(req.tkey)) return out({ ok: false, error: "no key to log costs" });
    if ((action === "costList" || action === "costPricesSet" || action === "thinkSet") && !canEdit) return out({ ok: false, error: "This device is view-only. Add the edit key in Settings to see the costs.", canEdit: false });
    switch (action) {
      case "costLog": return out(Object.assign({ ok: true, v: SCRIPT_VERSION }, costLog_(req)));
      case "costList": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, costList_(req)));
      case "thinkSet": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, thinkSet_(req)));
      case "costPricesSet": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, costPricesSet_(req)));
      case "whoami": return out({ ok: true, canEdit: canEdit, v: SCRIPT_VERSION, modelCheck: modelsSummary_(), batch: batchStatus_(), canTech: techAllowed(req.tkey), techSet: techKeyIsSet_(), think: thinkInfo_() });
      case "append": { var r = appendCase(req); return out({ ok: true, canEdit: true, diagramUrl: r.diagramUrl || "", utilUrl: r.utilUrl || "", utilError: r.utilError || "", replaced: !!r.replaced, inv: r.inv || null, v: SCRIPT_VERSION }); }
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
      case "batchScheduleSet": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, batchScheduleSet_(req)));
      case "batchRunNow": { lock.releaseLock(); return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, batchTick({ fromApp: true, caseId: String(req.caseId || "") }))); }
      // 13.44 — the technicians' key, the inventory and the stents
      case "techKeySet": return out(Object.assign({ ok: true, canEdit: true, v: SCRIPT_VERSION }, techKeySet_(req)));
      case "invSave": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, invSave_(req)));
      case "invApplyPending": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, invApplyPending_(req)));
      case "stentSave": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, stentSave_(req)));
      case "stentRetry": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, stentRetry_(req)));
      case "stentDismiss": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, stentDismiss_(req)));
      case "stentScanNow": { lock.releaseLock(); return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, stentScanNow_())); }
      // 13.48 — stock photos put in the used-stent folder by mistake; the inventory photos read now
      case "stentToStock": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, stentToStock_(req)));
      case "invReread": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, invReread_(req)));
      case "boxNoMatchOk": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, boxNoMatchOk_(req)));
      case "boxPhoto": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, boxPhoto_(req)));
      case "boxSave": return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, boxSave_(req)));
      case "invScanNow": { lock.releaseLock(); return out(Object.assign({ ok: true, canTech: true, v: SCRIPT_VERSION }, invScanNow_())); }
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
  // 13.40 — the technician's utilization sheet travels with a PTCA case
  var utilB64 = type === "PTCA" ? String(req.utilB64 || "") : "";

  var sh = sheet(regSheetName(type, year), null);
  var have = headersOf(sh);
  var wanted = headers.concat([CASE_JSON_COL, "Saved at"]);
  if (diagramB64) wanted.push(DIAGRAM_COL);
  if (utilB64) wanted.push(UTIL_COL);
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
  else if (cagNo) at = findRow(sh, have.indexOf("CAG No") + 1, cagNo) || (type !== "PTCA" ? findCagRow_(sh, have.indexOf("CAG No") + 1, cagNo) : 0);
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

  // 13.40 — the utilization sheet of a PTCA, by the same rules: a new photo is
  // filed in its own Drive folder and its link written to the row; a re-save
  // without one keeps the link the row already has
  var ucol = have.indexOf(UTIL_COL);
  var utilUrl = "", utilError = "";
  if (ucol >= 0) {
    var oldU = at ? cell(sh.getRange(at, ucol + 1).getValue()) : "";
    if (utilB64) {
      // a photo that cannot be filed must never cost the case its row
      try { utilUrl = saveDiagram("UTIL", year, ptcaNo || cagNo, name, utilB64, utilFolder()); }
      catch (eU) {
        var keptU = String(row[ucol] || "");
        utilUrl = /^https?:\/\//.test(oldU) ? oldU : (/^https?:\/\//.test(keptU) ? keptU : "");
        utilError = String(eU && eU.message || eU);
      }
    } else if (from) {
      var sentU = String(row[ucol] || "");
      var fromU = linkIn(from, UTIL_COL);
      utilUrl = /^https?:\/\//.test(sentU) ? sentU : /^https?:\/\//.test(fromU) ? fromU : (/^https?:\/\//.test(oldU) ? oldU : sentU);
    } else {
      utilUrl = /^https?:\/\//.test(oldU) ? oldU : String(row[ucol] || "");
    }
    row[ucol] = utilUrl;
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
  // 13.44 — the PTCA's hardware, worked out by the app from its utilization
  // sheet, into the inventory (an app older than 13.44 sends none: nothing changes)
  var inv = null;
  if (type === "PTCA") {
    try {
      var caseKey = invCaseKey_(year, ptcaNo, cagNo, name);
      var origKey = orig && String(orig.type || "") === "PTCA"
        ? invCaseKey_(/^\d{4}$/.test(String(orig.year || "")) ? String(orig.year) : year, origWant.ptcaNo, origWant.cagNo, origWant.name) : "";
      if (Array.isArray(req.invUse)) {
        inv = invApplyCase_({ caseKey: caseKey, origKey: origKey, ptcaNo: ptcaNo || cagNo, patient: name,
          caseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(req.invDate || "")) ? String(req.invDate) : cathToday_(), uses: req.invUse, by: g("Saved by") || String(req.by || "") });
        invPendingDrop_([caseKey, origKey]);
      } else inv = invPendingNote_(cj, { key: caseKey, year: year, ptcaNo: ptcaNo, cagNo: cagNo, name: name });
      // 13.52: the diagram stent sheet's stickers
      if (Array.isArray(req.diagStickers)) {
        try { var dgs = diagStickersSave_(ptcaNo || cagNo, name, String(req.diagDate || ""), req.diagStickers, g("Saved by") || String(req.by || "")); inv = inv || {}; inv.diag = dgs; }
        catch (eD) { inv = inv || {}; inv.diagError = String(eD && eD.message || eD); }
      }
    } catch (eI) { inv = { error: String(eI && eI.message || eI) }; }
  }
  return { diagramUrl: diagramUrl, utilUrl: utilUrl, utilError: utilError, replaced: replaced, inv: inv };
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
function linkIn(hit, col) {
  var i = hit.have.indexOf(col || DIAGRAM_COL);
  return i < 0 ? "" : cell(hit.vals[i]);
}

/* ---------- the diagram copies in Drive ---------- */
function diagramFolder() {
  var name = PropertiesService.getScriptProperties().getProperty("DIAGRAM_FOLDER") || DIAGRAM_FOLDER_DEFAULT;
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
/* 13.40 — the folder for the PTCA utilization sheets' copies */
function utilFolder() {
  var name = PropertiesService.getScriptProperties().getProperty("UTIL_FOLDER") || UTIL_FOLDER_DEFAULT;
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
/* One JPEG per case: "CAG_2026_1906_Ramesh_Patil.jpg". A case re-saved with
   a new photo replaces its earlier file (matched on type, year and number),
   so the folder never fills with stale copies. Returns the file's link.
   A utilization sheet is filed the same way under the type "UTIL"
   ("UTIL_2026_1234AP56_Name.jpg"), in the folder passed in. */
function saveDiagram(type, year, number, name, b64, intoFolder) {
  var folder = intoFolder || diagramFolder();
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
        name: name, cagNo: cag, ptcaNo: g(r, "PTCA No"), ipd: g(r, "IPD No") || g(r, "IPD/OPD No"), opd: g(r, "OPD No"), date: g(r, "Date"),
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
        util: g(r, UTIL_COL),
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
  // 13.44 — the ledger's name for this PTCA, read before the row goes
  var invKey = "";
  if (isPtca) {
    var gv = function (h) { var i = have.indexOf(h); return i >= 0 ? String(cell(sh.getRange(row, i + 1).getValue())).trim() : ""; };
    invKey = invCaseKey_((/^PTCA (\d{4})$/.exec(sh.getName()) || [])[1] || "", gv("PTCA No"), cag, gv("Name"));
  }
  sh.deleteRow(row);
  if (cag && !isPtca) deleteRowsWhere(sheet(LES, LES_HEAD), 1, cag);
  if (invKey) { try { invRemoveCase_(invKey); invPendingDrop_([invKey]); } catch (e) {} }
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
      if (String(g("CAG No")).trim() === q || cagSame_(g("CAG No"), q)) return lookupHit(have, rows[i]);
      if (!byIpd && (String(g("IPD No")).trim() === q || String(g("OPD No")).trim() === q || String(g("IPD/OPD No")).trim() === q)) byIpd = { have: have, row: rows[i] };
    }
  }
  if (byIpd) return lookupHit(byIpd.have, byIpd.row);
  return { found: false };
}
/* 13.48: one CAG number however it is written ("2343/2026" = "23432026") */
function cagSame_(a, b) {
  a = String(a == null ? "" : a).trim(); b = String(b == null ? "" : b).trim();
  if (!a || !b) return false;
  if (a === b) return true;
  var da = a.replace(/\D/g, ""), db = b.replace(/\D/g, "");
  if (da.length >= 5 && da === db && !/[A-Za-z]/.test(a + b)) return true;
  // 13.52: 2145 = 2145/2026 — a number written without its year matches it
  var x = cagParse_(a), z = cagParse_(b);
  return !!(x && z && x.n === z.n && (!x.y || !z.y || x.y === z.y));
}
/* 13.52: a CAG number is stored as number/year (2145/2026), the year being the
   year of the angiography; residents rarely write it. Returns {n, y} or null. */
function cagParse_(s) {
  var t = String(s == null ? "" : s).trim();
  if (!t || /[A-Za-z]/.test(t)) return null;
  var m = /^(\d{1,5})\s*[\/\-.\s]\s*(\d{4}|\d{2})$/.exec(t);
  if (m) { var y = m[2].length === 2 ? "20" + m[2] : m[2]; if (/^(?:19|20)\d\d$/.test(y)) return { n: m[1].replace(/^0+(?=\d)/, ""), y: y }; }
  var d = t.replace(/\D/g, "");
  if (/^\d{1,4}$/.test(d)) return { n: d.replace(/^0+(?=\d)/, ""), y: "" };
  m = /^(\d{1,4})((?:19|20)\d\d)$/.exec(d);
  return m ? { n: m[1].replace(/^0+(?=\d)/, ""), y: m[2] } : null;
}
/* the stored form, "2145/2026": a bare number takes the given year */
function cagCanon_(s, year) {
  var p = cagParse_(s);
  if (!p) return String(s == null ? "" : s).trim();
  return p.n + "/" + (p.y || year || new Date().getFullYear());
}
/* a CAG row of this sheet with the same CAG number however it was written */
function findCagRow_(sh, col, value) {
  if (col < 1 || sh.getLastRow() < 2 || !cagParse_(value)) return 0;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (cagSame_(vals[i][0], value)) return i + 2;
  return 0;
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
   means "use the app's built-in list". 13.41: a third key, "hardware" — the
   devices and their short forms ("Full name | Type | short form, …"). */
var ROSTER_KEYS = ["operators", "technicians", "hardware"];
var ROSTERS = "Rosters";
function rosterSheet_() { return sheet(ROSTERS, ["Key", "Value", "Updated", "By"]); }
function rosterGet_() {
  var sh = rosterSheet_();
  var o = { operators: "", technicians: "", hardware: "", updatedAt: "", by: "" };
  if (sh.getLastRow() < 2) return o;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var k = String(r[0] || "");
    if (ROSTER_KEYS.indexOf(k) >= 0) { o[k] = cell(r[1]); var u = cell(r[2]); if (u > o.updatedAt) { o.updatedAt = u; o.by = cell(r[3]); } }
  });
  return o;
}
function rosterSave_(req) {
  var sh = rosterSheet_();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var by = String(req.by || "");
  var rows = {};
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) { rows[String(r[0] || "")] = i + 2; });
  // checked before anything is written, so a save is never half done
  ROSTER_KEYS.forEach(function (k) {
    if (req[k] != null && String(req[k]).length > 49000) throw new Error("the " + k + " list is longer than a cell can hold");
  });
  var kept = [];
  ROSTER_KEYS.forEach(function (k) {
    if (req[k] == null) return;
    var v = String(req[k]);
    var row = rows[k];
    if (!row) { sh.appendRow([k, v, now, by]); rows[k] = sh.getLastRow(); }
    else sh.getRange(row, 1, 1, 4).setValues([[k, v, now, by]]);
    kept.push(k);
  });
  // "keys": the lists this script kept — an app newer than the script learns
  // from it that a list it sent was not stored
  return { updatedAt: now, by: by, keys: kept };
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
/* 13.43 — one request to a model may not take the whole run.
   Apps Script waits up to 6 minutes for an answer unless told otherwise, and
   6 minutes is also when Google ends the run: a model that stays silent
   (Gemini 3.8 Flash did, on 13 Nov 2026) used to cost the whole run, nothing
   was read, and the next run began with the same model again. Now:
   - every request carries its own limit (timeoutSeconds), BATCH_FETCH_SEC
     seconds (script property; default 90), and never past BATCH_RUN_END_MS
     of the run;
   - a model that does not answer in that time, or answers with a fault only
     after BATCH_SLOW_MS, is left alone for BATCH_SLOW_REST_MS and the next
     model of the chain carries on;
   - should a run still be cut off while waiting (BATCH_FLIGHT is written
     before each request and removed after it), the next run leaves that
     model alone for BATCH_CUT_REST_MS before it does anything else. */
var BATCH_FETCH_SEC_DEFAULT = 90;
var BATCH_RUN_END_MS = 300000;          // no request may run past this point of a run (Google ends the run at 360 s; the app waits 330 s)
var BATCH_SLOW_MS = 45000;              // a fault that took this long to arrive counts as "not answering"
var BATCH_SLOW_REST_MS = 30 * 60000;    // a model that did not answer is left alone this long
var BATCH_CUT_REST_MS = 60 * 60000;     // … one that a whole run was lost waiting for, this long
var BATCH_RUN_ = { start: 0, ok: 0, rested: 0, notes: [] };   // this run: when it began, answers received, models set aside (and what to say about them)
var BATCH_NO_TIMEOUT_ = false;          // an Apps Script that refuses timeoutSeconds: requests go without it for the rest of the run
var BATCH_HEAD = ["Case id", "Status", "Created", "Updated", "Files", "File ids", "Pages", "Grouping",
                  "Name", "CAG No", "Page map", "Results", "Errors", "Log", "Models", "Opened by", "Saved by", "Run id", "Type",
                  "Uploaded", "Scanned at", "Checked at", "Files removed", "Draft", "Draft at", "Draft by", "Draft ms", "Read by"];
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
var BATCH_SLOTS = ["p1", "a1", "a2", "a3", "d", "q1", "q2", "q3", "q4", "qu", "qd"];
var BATCH_SLOTS_OF = { CAG: ["p1", "a1", "a2", "a3", "d"], PTCA: ["q1", "q2", "q3", "q4", "qu", "qd"] };
var BATCH_NEEDED_OF = { CAG: ["p1", "a1", "a2", "a3"], PTCA: ["q1", "q2", "q3", "q4"] };
var BATCH_SLOT_WORD = { p1: "Sheet 1 (clinical proforma)", a1: "Sheet 2 (angiogram page 1)",
  a2: "Sheet 3 (angiogram page 2)", a3: "Sheet 4 (angiogram page 3)", d: "Sheet 5 (coronary diagram)",
  q1: "PTCA sheet 1 (front page)", q2: "PTCA sheet 2 (investigations)", q3: "PTCA sheet 3 (procedure & technique)",
  q4: "PTCA sheet 4 (bif / thrombus / calcium)", qu: "PTCA utilization report", qd: "Diagram stent sheet", other: "not a proforma page" };
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
  Logger.log("  Technicians' stent photos go in: " + f.stentsIn.getUrl() + " (read ones move to " + f.stentsDone.getName() + ")");
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
  var props = PropertiesService.getScriptProperties();
  // 13.48: the stent folders are "Used stents upload" / "Used stents processed";
  // a folder still under its old name is renamed (its files and link stay)
  var renamed = function (prop, now, old) {
    var custom = props.getProperty(prop);
    if (custom) return sub(custom);
    var a = inbox.getFoldersByName(now); if (a.hasNext()) return a.next();
    var b = inbox.getFoldersByName(old); if (b.hasNext()) { var fo = b.next(); try { fo.setName(now); } catch (e) {} return fo; }
    return inbox.createFolder(now);
  };
  var invIn = renamed("INVUP_IN", INVUP_IN_DEFAULT, "Inventory uploads");
  // 13.44 — the technicians' stent photos: in, and once read; 13.48 — stock photos for the inventory
  return { inbox: inbox, cag: sub(BATCH_SUB_CAG), ptca: sub(BATCH_SUB_PTCA), done: sub(BATCH_DONE), fail: sub(BATCH_FAIL),
    stentsIn: renamed("STENT_IN", STENT_IN_DEFAULT, STENT_IN_OLD), stentsDone: renamed("STENT_DONE", STENT_DONE_DEFAULT, STENT_DONE_OLD),
    // 13.51: renamed "Stock in" (was Inventory uploads / processed) and "Stock out" (was Instruments used upload / processed)
    invIn: invIn, invDone: renamed("INVUP_DONE", INVUP_DONE_DEFAULT, "Inventory processed"),
    // 13.50: the day's used instruments (box flaps), and the weekly shelf photos
    usedIn: renamed("", USEDDAY_IN_DEFAULT, "Instruments used upload"), usedDone: renamed("", USEDDAY_DONE_DEFAULT, "Instruments used processed"),
    weeklyIn: (function () { var p0 = invIn; var q = p0.getFoldersByName(WEEKLY_DEFAULT); return q.hasNext() ? q.next() : p0.createFolder(WEEKLY_DEFAULT); })() };
}
var USEDDAY_IN_DEFAULT = "Stock out upload", USEDDAY_DONE_DEFAULT = "Stock out processed", WEEKLY_DEFAULT = "Weekly shelf photos";

/* 13.50 — one folder per kind of equipment inside "Inventory uploads", and its
   twin inside "Inventory processed": made on first need, their ids kept (so a
   run does not look up 32 folders by name each time) */
var INV_KIND_FOLDER = { stent: "Stents", balloon: "Balloons", dcb: "Drug-coated balloons", cutting: "Cutting balloons", wire: "Guide wires",
  guide: "Guide catheters", ge: "Guide extensions", mc: "Microcatheters", asp: "Aspiration catheters", rota: "Rota burrs", ivus: "IVUS",
  oct: "OCT", imaging: "ELCA and other imaging", sheath: "Sheaths", contrast: "Contrast", other: "Other" };
function invKindFolders_(f) {
  var pr = PropertiesService.getScriptProperties(), saved = {};
  try { saved = JSON.parse(pr.getProperty("INV_KIND_FOLDERS") || "{}") || {}; } catch (e) { saved = {}; }
  var out = {}, changed = false;
  var get = function (parent, name, id) {
    if (id) { try { var fo = DriveApp.getFolderById(id); if (!fo.isTrashed()) return fo; } catch (e) {} }
    var it = parent.getFoldersByName(name);
    changed = true;
    return it.hasNext() ? it.next() : parent.createFolder(name);
  };
  INV_KIND_ORDER.forEach(function (k) {
    var s0 = saved[k] || {};
    var inF = get(f.invIn, INV_KIND_FOLDER[k], s0.i), doneF = get(f.invDone, INV_KIND_FOLDER[k], s0.d);
    out[k] = { inF: inF, doneF: doneF };
    if (s0.i !== inF.getId() || s0.d !== doneF.getId()) { saved[k] = { i: inF.getId(), d: doneF.getId() }; changed = true; }
  });
  if (changed) pr.setProperty("INV_KIND_FOLDERS", JSON.stringify(saved));
  return out;
}
/* which instrument a photo is mostly of: the most boxes read in the
   foreground; a tie goes to stents if there are stents, else alphabetically */
function invPhotoKind_(counts) {
  var ks = Object.keys(counts).filter(function (k) { return counts[k] > 0; });
  if (!ks.length) return "";
  var top = Math.max.apply(null, ks.map(function (k) { return counts[k]; }));
  var tied = ks.filter(function (k) { return counts[k] === top; });
  if (tied.length === 1) return tied[0];
  if (tied.indexOf("stent") >= 0) return "stent";
  return tied.sort(function (a, b) { return INV_KIND_FOLDER[a].localeCompare(INV_KIND_FOLDER[b]); })[0];
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
  if (!live.length) {
    // 13.43: a model may also be resting because it did not answer
    var why = batchUsage_().restWhy || {};
    var silent = chain.filter(function (m) { return why[m] === "slow"; });
    return { ok: false, quota: true, retry: true, reason: (!silent.length ? "every free model's limit is used up for now (" + chain.join(", ") + ")"
      : silent.length === chain.length ? "none of the models is answering just now (" + chain.join(", ") + ")"
      : "no model is free just now (" + chain.map(function (m) { return m + (why[m] === "slow" ? ": not answering" : ": limit used up"); }).join(", ") + ")") + " — the scanner carries on in a later run" };
  }
  if (BATCH_GUARD_) {
    var cl = batchCappedLeft_(), caps0 = {};
    cl.models.forEach(function (x) { caps0[x.model] = 1; });
    if (cl.left <= BATCH_GUARD_.reserve) {
      var kept = live.filter(function (m) { return caps0[m]; });
      live = live.filter(function (m) { return !caps0[m]; });
      if (!live.length) return { ok: false, quota: true, retry: true, reserve: true,
        reason: "the last " + BATCH_GUARD_.reserve + " requests of the day on " + kept.join(", ") + " are kept for scans started from the app (" + cl.left + " left) \u2014 the automatic scan uses them before Google's daily reset, or carries on after it" };
    }
  }
  for (var i = 0; i < live.length; i++) {
    // a slow Google answer can take a minute: no further model is tried
    // when the run is short of time — the page waits for the next run
    if (tried && timeLeft && timeLeft() < 90000) { r.reason = r.reason + " (no time left this run to try another model)"; return r; }
    if (tried) pause();
    r = batchGemini_(key, live[i], prompt, item, pdfPage);
    tried++;
    if (r.ok) { r.model = live[i]; if (live[i] !== chain[0]) r.via = live[i]; return r; }
    if (r.quota && r.nofree) return r;             // the model name is wrong for a free key: a setting, not a fault
    if (r.quota) { r.retry = true; continue; }     // limit hit: the next model carries on
    if (!r.retry && !r.tryOther) return r;         // not a temporary fault: another model won't help
  }
  if (r && r.quota) r.reason = "the free limit is used up on every model tried this hour — the scanner carries on in a later run";
  return r;
}

/* ---- when the automatic (5-minute) runs may read ----
   Google's free daily limits reset at midnight Pacific (13:30 IST in winter,
   12:30 IST in summer), so a "quota day" runs from one reset to the next.
   Uploads arrive in the evening; the bulk is read at night inside the scan
   window (BATCH_WINDOW, default 20:00-04:00 on the department's clock). At night
   the automatic runs stop short of the models' known daily limits by
   BATCH_RESERVE requests (default 25), kept for scans started from the app in
   the morning. In the last BATCH_SPEND_MIN minutes before the reset (default
   90: 12:00-13:30 in winter) the automatic runs read again and may spend that
   reserve, since whatever is left is lost at the reset. Outside both windows the
   automatic runs do nothing. Scans started from the app ("Scan the inbox
   now", "Scan now" on a case) always run and may use the reserve.
   A model's daily limit is learned the first time it answers a daily 429 (the
   number of requests it took that day), kept in BATCH_CAPS; models whose limit
   has never been hit are not counted towards the reserve. */
var BATCH_TZ = "Asia/Kolkata";
var BATCH_WINDOW_DEFAULT = "20:00-04:00", BATCH_RESERVE_DEFAULT = 12, BATCH_SPEND_DEFAULT = 90;
var BATCH_GUARD_ = null;   // set by batchTick for an automatic night run: { reserve: n }
function batchHm_(m) { m = ((m % 1440) + 1440) % 1440; return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function batchParseHm_(t) { var m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(t || "")); if (!m) return null; var h = Number(m[1]), mi = Number(m[2]); return h < 24 && mi < 60 ? h * 60 + mi : null; }
function batchWindow_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BATCH_WINDOW");
  if (raw == null) raw = BATCH_WINDOW_DEFAULT;
  raw = String(raw).trim();
  if (!raw || /^(always|all ?day|off|none)$/i.test(raw)) return null;
  var p = raw.split(/\s*(?:-|\u2013|to)\s*/);
  var a = batchParseHm_(p[0]), b = batchParseHm_(p[1]);
  if (a == null || b == null || a === b) return null;
  return { from: a, to: b, text: batchHm_(a) + "\u2013" + batchHm_(b) };
}
function batchReserveN_() {
  var pp = PropertiesService.getScriptProperties(), raw = pp.getProperty("BATCH_RESERVE");
  // 13.38: the department's reserve is 12; a 25 saved under 13.37 (the old default) moves to 12 once
  if (raw === "25" && !pp.getProperty("BATCH_RESERVE_1338")) { pp.setProperty("BATCH_RESERVE", "12"); raw = "12"; }
  if (!pp.getProperty("BATCH_RESERVE_1338")) pp.setProperty("BATCH_RESERVE_1338", "1");
  return batchReserveOf_(raw);
}
function batchReserveOf_(raw) { var v = Number(raw); return raw != null && String(raw).trim() !== "" && isFinite(v) && v >= 0 ? Math.round(v) : BATCH_RESERVE_DEFAULT; }
function batchSpendMin_() { var raw = PropertiesService.getScriptProperties().getProperty("BATCH_SPEND_MIN"); var v = Number(raw); return raw != null && String(raw).trim() !== "" && isFinite(v) && v >= 0 ? Math.min(600, Math.round(v)) : BATCH_SPEND_DEFAULT; }
function batchInRange_(m, a, b) { return a < b ? (m >= a && m < b) : (m >= a || m < b); }
/* what an automatic run may do now: mode "always" (no window set), "night"
   (inside the window, reserve kept), "spend" (before the reset, reserve may
   be used) or "closed"; plus the times for the app's status line */
function batchPlan_(now) {
  now = now || new Date();
  var hm = Utilities.formatDate(now, BATCH_TZ, "HH:mm").split(":");
  var m = Number(hm[0]) * 60 + Number(hm[1]);
  var w = batchWindow_(), reserve = batchReserveN_(), spend = batchSpendMin_();
  var r = batchPacificReset_(now);
  var resetMin = m + Math.round((r.ms - 2 * 60000) / 60000);         // the reset, on today's clock (may pass midnight)
  var spendFrom = resetMin - spend;
  var inSpend = spend > 0 && reserve > 0 && (r.ms - 2 * 60000) <= spend * 60000;
  var plan = { window: w ? w.text : "", reserve: reserve, spendMin: spend, resetAt: batchHm_(resetMin), spendFrom: batchHm_(spendFrom), tz: BATCH_TZ };
  if (!w) { plan.mode = "always"; plan.guard = false; return plan; }
  if (batchInRange_(m, w.from, w.to)) { plan.mode = "night"; plan.guard = reserve > 0; plan.until = batchHm_(w.to); return plan; }
  if (inSpend) { plan.mode = "spend"; plan.guard = false; plan.until = batchHm_(resetMin); return plan; }
  plan.mode = "closed"; plan.guard = false;
  // the next time an automatic run reads: the spend slot if it comes first today, else the window
  var toWin = (w.from - m + 1440) % 1440, toSpend = spend > 0 && reserve > 0 ? (spendFrom - m + 1440) % 1440 : 1e9;
  plan.next = toSpend < toWin ? batchHm_(spendFrom) : batchHm_(w.from);
  return plan;
}
function batchScheduleSet_(req) {
  var p = PropertiesService.getScriptProperties();
  if (req.window != null) {
    var w = String(req.window).trim();
    if (/^(always|all ?day|)$/i.test(w)) p.setProperty("BATCH_WINDOW", "always");
    else {
      var parts = w.split(/\s*[-\u2013]\s*/), a = batchParseHm_(parts[0]), b = batchParseHm_(parts[1]);
      if (a == null || b == null || a === b) throw new Error("the scan window must be two times like 20:00-04:00");
      p.setProperty("BATCH_WINDOW", batchHm_(a) + "-" + batchHm_(b));
    }
  }
  if (req.reserve != null) { var n = Number(req.reserve); if (!isFinite(n) || n < 0 || n > 500) throw new Error("the reserve must be 0 to 500 requests"); p.setProperty("BATCH_RESERVE", String(Math.round(n))); }
  if (req.spendMin != null) { var sm = Number(req.spendMin); if (!isFinite(sm) || sm < 0 || sm > 600) throw new Error("the spend time must be 0 to 600 minutes"); p.setProperty("BATCH_SPEND_MIN", String(Math.round(sm))); }
  return { schedule: batchPlan_(), reserveLeft: batchCappedLeft_() };
}
/* the daily limit learned for each model (requests answered before its daily 429) */
function batchCaps_() {
  var caps = {};
  try { caps = JSON.parse(PropertiesService.getScriptProperties().getProperty("BATCH_CAPS") || "{}") || {}; } catch (e) {}
  // a model resting for the daily limit today, from before limits were kept, teaches its limit too
  try {
    var u = batchUsage_(), rest = batchResting_();
    Object.keys(rest).forEach(function (mm) {
      if (caps[mm]) return;
      var left = rest[mm] + BATCH_REST_MS - Date.now();
      if (left > 2 * 3600000 && (u.counts[mm] || 0) > 1) caps[mm] = (u.counts[mm] || 0) - 1;
    });
  } catch (e) {}
  return caps;
}
/* requests left today on the models whose daily limit is known */
function batchCappedLeft_() {
  var caps = batchCaps_(), u = batchUsage_(), rest = batchResting_(), left = 0, models = [];
  Object.keys(caps).forEach(function (mm) {
    var restDaily = rest[mm] != null && (rest[mm] + BATCH_REST_MS - Date.now()) > 2 * 3600000;
    var l = restDaily ? 0 : Math.max(0, Number(caps[mm]) - (u.counts[mm] || 0));
    left += l; models.push({ model: mm, label: mcLabel(mm), cap: Number(caps[mm]), left: l });
  });
  return { left: left, models: models };
}

/* ---- the 5-minute tick ---- */
function batchTick(opts) {
  opts = opts || {};
  var start = Date.now();
  BATCH_RUN_ = { start: start, ok: 0, rested: 0, notes: [] };
  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  if (batchOff_()) return { ran: false, why: "off" };
  // an automatic run outside the scan window does nothing (a scan started from the app always runs)
  BATCH_GUARD_ = null;
  // 13.48: which part the half-price queue plays in this run
  var pollOnly = false;
  BATCH_QUEUE_MODE_ = opts.only === "stents" || opts.only === "inventory" ? "" : opts.fromApp ? (opts.caseId ? "now" : "poll") : "send";
  PHOTO_MODE_ = opts.only === "stents" || opts.only === "inventory" ? "now" : opts.fromApp ? "poll" : "send";
  // 13.49: the one-time correction of the stock read before box-by-box
  // reading; while its photos wait, a run outside the window reads them (only them)
  var fixing = false;
  try { fixing = invAutoFix_(runId); headFill_();
    // 13.50: the one-time imports, ONE per run (in this order), so no run comes near Google's 6-minute limit
    invImport20Nov_(runId) || invFix21Nov_(runId) || invImport23Nov_(runId) || invImport23NovB_(runId) || invImport23NovC_(runId) ||
      invReturn23Nov_(runId) || invUsed23Nov_(runId) || invStickers23Nov_(runId) || invFix24Nov_(runId) || invShelf24Nov_(runId) || cagYears1352_(runId) || ptcaSorte25Nov_(runId) || boxUltima25Nov_(runId) || boxRockstar25Nov_(runId) || boxPhoto20Nov9_(runId) || stickers25Nov_(runId) || ptcaDiagResort_(runId) || boxX12Fix25Nov_(runId) || boxUltShelf26Nov_(runId); } catch (eF) { batchLogRow_(runId, "", "", "stock correction", "error", String(eF && eF.message || eF)); }
  if (!opts.fromApp && fixing && batchPlan_().mode === "closed") { opts.only = "inventory"; opts.fromApp = true; BATCH_QUEUE_MODE_ = ""; PHOTO_MODE_ = "now"; }
  if (!opts.fromApp) {
    var plan = batchPlan_();
    if (plan.mode === "closed") {
      // outside the window the run only collects the answers of queued jobs
      if (!PropertiesService.getScriptProperties().getProperty("BATCH_QUEUE_OPEN")) return { ran: false, why: "outside the scan window (next automatic read at " + plan.next + ")" };
      pollOnly = true; BATCH_QUEUE_MODE_ = "poll"; PHOTO_MODE_ = "poll";
    }
    else if (plan.guard) BATCH_GUARD_ = { reserve: plan.reserve };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(opts.fromApp ? 5000 : 1000)) { batchLogRow_(runId, "", "", "run", "skipped", "another run is in progress"); return { ran: false, why: "another run is in progress" }; }
  var summary = { ran: true, runId: runId, cases: 0, scanned: 0, failed: 0, pending: 0, why: "", more: false, note: "" };
  var props = PropertiesService.getScriptProperties();
  // 13.43: the run before this one never reached its end (this run holds the
  // lock, so that one is over) — the model it was waiting for is set aside
  batchPrevCutOff_(props, runId);
  // a heartbeat: a run that Google kills at its 6-minute limit never gets to
  // write BATCH_LAST, so the start is written first and a stale start is
  // reported by batchStatus_ as "cut off"
  props.setProperty("BATCH_RUNNING", JSON.stringify({ at: new Date().toISOString(), runId: runId, fromApp: !!opts.fromApp, caseId: String(opts.caseId || "") }));
  var ended = false;     // true once the run has reached an end of its own (so BATCH_RUNNING may go)
  try {
    var key = geminiKey_();
    if (!key) { batchLogRow_(runId, "", "", "run", "skipped", "no GEMINI_KEY in the script properties"); summary.why = "no GEMINI_KEY"; ended = true; return summary; }
    // 13.44: "Scan now" on the technicians' page reads the stent photos only
    // (they need no prompt from the app — the script has its own)
    var onlyStents = opts.only === "stents" || opts.only === "inventory";   // the technicians' photos only
    var prompts = onlyStents ? null : batchPrompts_();
    if (!onlyStents && !prompts) { batchLogRow_(runId, "", "", "run", "skipped", "no reading prompts yet — open the app once as an editor"); summary.why = "no prompts"; ended = true; return summary; }
    var models = batchModels_();
    var f = batchFolders_();
    var work = [];
    if (!onlyStents) {
      var tab = batchTabRows_();
      // resume anything a previous run left half-read, then take new files
      work = tab.rows.filter(function (r) { return r.status === "reading" || r.status === "queued"; });
      if (pollOnly) {
        work = work.filter(function (r) { return r.results && r.results._job; });
        if (!work.length) { batchQueueOpenSet_(false); ended = true; return { ran: false, why: "outside the scan window; no queued job left" }; }
      } else if (opts.caseId) {
        // "Scan now" on one case: that case alone, whatever its state
        work = tab.rows.filter(function (r) { return r.caseId === String(opts.caseId); });
        if (!work.length) { summary.why = "case not found"; ended = true; return summary; }
        if (work[0].status !== "reading" && work[0].status !== "queued") { work[0].status = "queued"; }
      } else if (!pollOnly) {
        // a run started from the app takes what is in the inbox now: the
        // upload-still-in-progress wait drops to 20 s and a lone photo is not held back
        var fresh = batchGroupInbox_(f, tab, !!opts.fromApp);
        fresh.forEach(function (c) { work.push(c); });
      }
    }
    summary.pending = work.length;
    // one line per run that has something to do (quiet runs are not logged;
    // nor is a run whose cases only wait on the half-price queue)
    var onlyWaiting = !opts.fromApp && work.length && work.every(function (c) { return c.results && c.results._job; });
    if (work.length && !onlyWaiting) batchLogRow_(runId, "", "", "run", opts.fromApp ? (opts.caseId ? "scan now (one case)" : "scan now") : "started",
      work.length + " case(s) to work on: " + work.map(function (c) { return c.caseId + " [" + c.status + "]"; }).join(", "));
    var paused = 0, stopped = false;
    for (var i = 0; i < work.length; i++) {
      if (Date.now() - start > BATCH_BUDGET_MS - 30000) { summary.why = "time budget used; the rest continue next run"; paused++; break; }
      var c = work[i];
      var r = batchProcessCase_(c, f, prompts, models, key, start, runId);
      if (r === "paused" && c.waiting) { summary.waiting = (summary.waiting || 0) + 1; summary.pending--; continue; }   // waits on the half-price queue
      summary.cases++;
      if (r === "scanned") summary.scanned++;
      else if (r === "failed") summary.failed++;
      else if (r === "stopped") { summary.why = c.stopWhy || "stopped"; stopped = true; break; }
      else paused++;
    }
    summary.pending = Math.max(0, summary.pending - summary.scanned - summary.failed);
    // 13.44 — then the technicians' stent photos, with the time this run has
    // left (not on "Scan now" of one case, nor once a limit stopped the run)
    if (!opts.caseId && !stopped && opts.only !== "inventory") {
      try {
        var gapS = batchGapMs_();
        var st = stentTick_(f, models, key, runId, !!opts.fromApp, function () { Utilities.sleep(gapS); },
          function () { return BATCH_BUDGET_MS - (Date.now() - start); });
        summary.stents = st;
        if (st.stopped) { stopped = true; summary.why = (summary.why ? summary.why + "; " : "") + "stent photos: " + st.why; }
        else if (st.pending) { paused++; summary.why = (summary.why ? summary.why + "; " : "") + st.pending + " stent photo(s) continue next run"; }
      } catch (eS) { batchLogRow_(runId, "", "", "stent photos", "error", String(eS && eS.message || eS)); }
    }
    // 13.48 — the stock photos in "Inventory uploads", with the time left
    if (!opts.caseId && !stopped && opts.only !== "stents") {
      try {
        var gapI = batchGapMs_();
        var iv = invPhotoTick_(f, models, key, runId, !!opts.fromApp, function () { Utilities.sleep(gapI); },
          function () { return BATCH_BUDGET_MS - (Date.now() - start); });
        summary.inventory = iv;
        if (iv.stopped) { stopped = true; summary.why = (summary.why ? summary.why + "; " : "") + "inventory photos: " + iv.why; }
        else if (iv.pending) { paused++; summary.why = (summary.why ? summary.why + "; " : "") + iv.pending + " inventory photo(s) continue next run"; }
        if (iv.scanned || iv.failed) batchLogRow_(runId, "", "", "inventory photos", "finished", iv.scanned + " read (" + iv.units + " item(s) received), " + iv.failed + " failed");
      } catch (eI) { batchLogRow_(runId, "", "", "inventory photos", "error", String(eI && eI.message || eI)); }
    }
    // 13.43, for a scan started from the app: work is left only because this
    // run ran out of time, and it got somewhere (a page was answered, or a
    // silent model was set aside) — the app starts the next run itself
    summary.more = paused > 0 && !stopped && (BATCH_RUN_.ok > 0 || BATCH_RUN_.rested > 0);
    summary.note = BATCH_RUN_.notes.join("; ");
    // 13.48: the queue flag goes once no case waits on a job any more
    if (BATCH_QUEUE_MODE_ && PropertiesService.getScriptProperties().getProperty("BATCH_QUEUE_OPEN")) {
      try { if (!batchTabRows_().rows.some(function (x) { return (x.status === "reading" || x.status === "queued") && x.results && x.results._job; }) &&
                 !stentUpRows_().rows.some(function (x) { return x.status === "queued" && x.result && x.result._job; })) batchQueueOpenSet_(false); } catch (eQ) {}
    }
    var whyCore = summary.why;   // what the log line reports (a case merely waiting is not news every 5 minutes)
    if (summary.waiting) summary.why = (summary.why ? summary.why + "; " : "") + summary.waiting + " case(s) waiting in Google's half-price queue";
    try { var hk = pollOnly ? "" : batchHousekeep_(f, runId); if (hk) whyCore = (whyCore ? whyCore + "; " : "") + hk; if (hk) summary.why = (summary.why ? summary.why + "; " : "") + hk; } catch (e) { batchLogRow_(runId, "", "", "housekeeping", "failed", String(e && e.message || e)); }
    var stDone = summary.stents && (summary.stents.scanned || summary.stents.failed) ? summary.stents : null;
    if (summary.cases || whyCore || stDone) batchLogRow_(runId, "", "", "run", "finished", summary.cases + " case(s) worked on, " + summary.scanned + " scanned, " + summary.failed + " failed" +
      (stDone ? "; stent photos " + stDone.scanned + " read (" + stDone.stickers + " sticker(s)), " + stDone.failed + " failed" : "") +
      (summary.why ? " — " + summary.why : "") + (summary.note ? " — " + summary.note : "") + ", " + Math.round((Date.now() - start) / 1000) + " s");
    // a stent-only run leaves the proformas' last-run line as it was
    if (!onlyStents && (!pollOnly || summary.cases)) props.setProperty("BATCH_LAST", JSON.stringify({ at: new Date().toISOString(), runId: runId,
      cases: summary.cases, scanned: summary.scanned, failed: summary.failed, why: summary.why, secs: Math.round((Date.now() - start) / 1000) }));
    ended = true;
  } catch (err) {
    // an error of the script's own (Drive, the sheet): said so, rather than left looking like Google's time limit
    var em = String(err && err.message || err);
    batchLogRow_(runId, "", "", "run", "error", em);
    try { props.setProperty("BATCH_LAST", JSON.stringify({ at: new Date().toISOString(), runId: runId,
      cases: summary.cases, scanned: summary.scanned, failed: summary.failed, why: "stopped by an error: " + em.slice(0, 300), secs: Math.round((Date.now() - start) / 1000) })); } catch (x) {}
    ended = true;
    throw err;
  } finally {
    if (ended) { try { props.deleteProperty("BATCH_RUNNING"); } catch (x) {} }
    try { lock.releaseLock(); } catch (x) {}
  }
  return summary;
}
/* The run before this one left its heartbeat behind: it never reached its
   end. If a request to a model was in the air at that moment (BATCH_FLIGHT),
   Google ended the run while it waited for that model — the model is left
   alone for BATCH_CUT_REST_MS, so this run starts with the next one instead
   of waiting for the same silence again. */
function batchPrevCutOff_(props, runId) {
  try {
    var prev = null, flight = null;
    try { prev = JSON.parse(props.getProperty("BATCH_RUNNING") || "null"); } catch (e) {}
    try { flight = JSON.parse(props.getProperty("BATCH_FLIGHT") || "null"); } catch (e) {}
    if (flight) props.deleteProperty("BATCH_FLIGHT");
    if (!prev || !prev.at) return;
    var when = String(prev.at).replace("T", " ").slice(0, 16) + " UTC";
    if (flight && flight.model && Date.now() - Number(flight.at || 0) < 3 * 3600000) {
      var until = batchRestSlow_(String(flight.model), BATCH_CUT_REST_MS, "a run was ended by Google while waiting for it");
      batchLogRow_(runId, "", "", "run", "cut off earlier", "the run that started at " + when + " was ended by Google at its 6-minute limit while waiting for " + flight.model + " — that model is left alone until " + until + "; the other models carry on");
    } else {
      batchLogRow_(runId, "", "", "run", "cut off earlier", "the run that started at " + when + " did not finish (Google's 6-minute limit)");
    }
  } catch (e) {}
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
    draft: cell(v[23]), draftAt: cell(v[24]), draftBy: cell(v[25]), draftMs: Number(v[26]) || 0, readBy: j(v[27], {}) };
}
function batchRowVals_(c) {
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var cap = function (s) { s = String(s == null ? "" : s); return s.length > 49000 ? s.slice(0, 48900) + "…(cut)" : s; };
  return [c.caseId, c.status, c.created || now, now, (c.files || []).join("\n"), (c.fileIds || []).join("\n"),
    c.pages || 0, c.grouping || "", c.name || "", c.cagNo || "", cap(JSON.stringify(c.pageMap || [])),
    cap(JSON.stringify(c.results || {})), cap(JSON.stringify(c.errors || [])), cap(c.log || ""),
    c.models || "", c.openedBy || "", c.savedBy || "", c.runId || "", batchType_(c.type),
    c.uploaded || "", c.scannedAt || "", c.checkedAt || "", c.filesRemoved || "", c.draft || "", c.draftAt || "", c.draftBy || "", c.draftMs || "", JSON.stringify(c.readBy || {})];
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
  // 13.43: written through at once — a run that Google ends while it waits
  // for a model must not take the last page's reading with it
  try { SpreadsheetApp.flush(); } catch (e) {}
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
  if (!c.results || typeof c.results !== "object") c.results = {};
  BATCH_CASE_TOK_ = c.results._tokens = c.results._tokens || {};
  COST_CTX_ = { what: batchType_(c.type) + " case", id: c.caseId || "", name: c.name || "", runId: runId || "" };
  try { return batchProcessCase0_(c, f, prompts, models, key, runStart, runId); }
  finally { BATCH_CASE_TOK_ = null; COST_CTX_ = null; }
}
function batchProcessCase0_(c, f, prompts, models, key, runStart, runId) {
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
    // 13.48 — the wrong folder: a CAG proforma dropped in PTCA (or the other
    // way round) gives few or no pages of this type and several "other" ones.
    // The pages are then looked at once more as the other form (one cheap
    // page-recognition request per file); if that fits better, the case is
    // read as that type. If no page fits either form, the case fails here,
    // before any reading is paid for.
    var fits = function (mp, t) { return mp.filter(function (m) { return BATCH_NEEDED_OF[t].indexOf(m.slot) >= 0; }).length; };
    var hits = fits(map, type), others = map.filter(function (m) { return m.slot === "other"; }).length;
    if (hits < 2 && others >= 2) {
      var alt = type === "PTCA" ? "CAG" : "PTCA";
      var map2 = [], okAlt = !(alt === "PTCA" && !prompts.ptcaReady);
      for (var k2 = 0; okAlt && k2 < items.length; k2++) {
        var itA = items[k2];
        if (!itA) continue;
        if (timeLeft() < 100000) { okAlt = false; break; }
        var rA = batchCallChain_(key, models.pageChain || [models.page], batchPagePrompt_(itA.isPdf, prompts, alt), itA, null, pause, timeLeft);
        if (!rA.ok) { okAlt = false; break; }
        batchParsePages_(rA.json, itA.isPdf, alt).forEach(function (pA) {
          map2.push({ fileIdx: k2, pdfPage: itA.isPdf ? pA.page : 0, slot: pA.slot, label: itA.isPdf ? itA.name + " p." + pA.page : itA.name, footer: pA.footer || "" });
        });
        pause();
      }
      var hits2 = okAlt ? fits(map2, alt) : 0;
      if (hits2 >= 2 && hits2 > hits) {
        batchNote_(c, runId, "", "page recognition", "wrong folder", "uploaded as " + type + " but " + hits2 + " page(s) are " + alt + " proforma pages \u2014 read as a " + alt + " case");
        type = alt; c.type = alt; map = map2;
      } else if (!hits) {
        return batchFinish_(c, f, runId, "failed", "none of the pages is a " + type + (okAlt ? " or " + alt : "") + " proforma page \u2014 check the upload (nothing was read)");
      }
    }
    // a slot seen twice: the whole-PDF answer sometimes repeats a slot (the
    // diagram sheet called "Sheet 1" again, say), so each repeat in a PDF is
    // looked at on its own with the single-page prompt before being written
    // off; the first page keeps the slot, a repeat that still matches is noted
    // 13.52: a PTCA page called "other" is looked at once more on its own —
    // the diagram stent sheet was often taken for "not a proforma page"
    if (type === "PTCA") map.forEach(function (m) {
      if (m.slot !== "other" || !m.pdfPage || timeLeft() < 100000) return;
      var r3 = batchCallChain_(key, models.pageChain || [models.page], batchReadPrompt_(batchPagePrompt_(false, prompts, type), true, m.pdfPage), items[m.fileIdx], m.pdfPage, pause, timeLeft);
      if (r3.ok) { var pg3 = batchParsePages_(r3.json, false, type); if (pg3.length && pg3[0].slot && pg3[0].slot !== "other" && pg3[0].slot !== "unknown") {
        batchNote_(c, runId, m.label, "page recognition", "ok", "looked at again on its own: " + (BATCH_SLOT_WORD[pg3[0].slot] || pg3[0].slot));
        m.slot = pg3[0].slot; } }
      pause();
    });
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

  // 13.48 — the half-price queue: send the sheets as one job, or collect a
  // finished job's answers; whatever is still unread is read directly below
  if (BATCH_QUEUE_MODE_) {
    var qs = batchQueueStep_(c, items, prompts, models, key, runId);
    if (qs === "waiting") { c.waiting = true; return "paused"; }
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
    if (slot === "qd" && !prompts.qd) { c.errors.push({ page: m.label, step: "reading", reason: "the app sent no PTCA diagram-sheet prompt (needs app 13.52 or later, opened by an editor) \u2014 the page is kept but not read" }); continue; }
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
      c.readBy = c.readBy || {}; c.readBy[slot] = rr.model || (models.readChain || [models.read])[0];
      var hdr = rr.json && typeof rr.json === "object" ? rr.json : {};
      if (slot === "p1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.cagNo || ""); }
      else if (slot === "q1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.ptcaNo || hdr.cathNo || hdr.cagNo || ""); }
      else if (!c.cagNo && (hdr.cagNo || hdr.ptcaNo)) c.cagNo = String(hdr.ptcaNo || hdr.cagNo);
      // a page that failed on an earlier run and has now been read: its old error goes
      c.errors = (c.errors || []).filter(function (e) { return e.slot !== slot; });
      batchNote_(c, runId, m.label, "reading " + BATCH_SLOT_WORD[slot], "ok", (slot === "p1" || slot === "q1" ? (c.name + (c.cagNo ? " · " + (slot === "q1" ? "PTCA " : "CAG ") + c.cagNo : "")) : "") + (rr.via ? " (via " + rr.via + ")" : "") + (item.isPdf ? " · " + (rr.asImage || "whole PDF") : "") + (rr.tok ? " · " + rr.tok : ""));
    }
    batchWriteRow_(c);
    pause();
  }

  if (c.pending) { c.pending = false; batchWriteRow_(c); return "paused"; }
  if (!attempted && c.pageMap.length) batchNote_(c, runId, "", "reading", "nothing to do", "every page is read already, a duplicate, not a proforma page, or failed for good");
  // 13.48: the PTCA number from every sheet that carries it, checked against each other
  if (type === "PTCA") batchPtcaNumbers_(c); else batchCagNumber_(c);
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
    (c.results.d ? " + diagram" : "") + (c.results.qu ? " + utilization report" : "") + (c.results.qd ? " + diagram sheet" : "") +
    (c.errors.length ? "; " + c.errors.length + " problem(s) noted" : ""));
}
/* ---- 13.48: the PTCA number ----
   Written xxxxAPzzzz: the cath number, AP, the PTCA number (2356AP657). The
   front page's PTCA / Cath No. comes first; the "PTCA / Cath No." line at the
   top of pages 2-4 (hdrPtcaNo) and the utilization sheet (Cath No. + "IP No.
   PTCA") fill it when the front page has no full number. Sheets that disagree
   are noted as a problem on the case (step "numbers"), shown in the inbox
   list and on the review screen, where the app flags the field as well. The
   number becomes the case's label in the inbox list. */
function batchPtcaNoNorm_(s) {
  var t = String(s == null ? "" : s).trim().toUpperCase();
  if (!t) return { kind: "", v: "" };
  var m = /^(\d{2,6})\s*[-\/.\s]*\s*A\s*\.?\s*P\s*\.?\s*[-\/.\s]*\s*(\d{1,6})$/.exec(t);
  if (m) return { kind: "full", v: m[1] + "AP" + m[2], cath: m[1], ptca: m[2] };
  var d = t.replace(/\s+/g, "");
  if (/^\d{2,6}$/.test(d)) return { kind: "cath", v: d, cath: d };
  if (/^\d{1,4}[\/-]?20\d\d$/.test(d)) return { kind: "cagLike", v: d.replace(/\D/g, "") };
  return { kind: "odd", v: t };
}
/* 13.48: the CAG proforma's CAG No. — digits only, CAG number + the year of
   the CAG; a year that is not the CAG date's (2020 read for 2026) or letters
   are noted on the case. The number is kept as written. */
function batchYearOf_(s) {
  var t = String(s == null ? "" : s).trim();
  var m = /\b((?:19|20)\d\d)\b/.exec(t);
  if (m) return Number(m[1]);
  m = /\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*(\d{2})\s*$/.exec(t);
  return m ? 2000 + Number(m[1]) : 0;
}
function batchCagNumber_(c) {
  var p1 = (c.results || {}).p1;
  c.errors = (c.errors || []).filter(function (e) { return e.step !== "numbers"; });
  if (!p1) return;
  var t = String(p1.cagNo || "").trim(), why = "", from = "";
  var r = c.results || {}, dg = r.d && (r.d.diagram || r.d);
  // 13.49: no number on the proforma: the diagram sheet's (or an angiography sheet's)
  if (!t) {
    var alt = [["the diagram sheet", dg && dg.cagNo], ["angiography sheet 2", r.a1 && r.a1.cagNo], ["angiography sheet 3", r.a2 && r.a2.cagNo], ["angiography sheet 4", r.a3 && r.a3.cagNo]];
    for (var i = 0; i < alt.length && !t; i++) if (String(alt[i][1] || "").replace(/\D/g, "")) { t = String(alt[i][1]).trim(); from = alt[i][0]; }
  }
  // 13.52: stored as number/year — the year of the CAG (its date; else the
  // diagram's; else the day it was uploaded)
  var dy = batchYearOf_(p1.date) || batchYearOf_(dg && dg.date);
  var upY = (/^(\d{4})/.exec(String(c.uploaded || "")) || [])[1];
  if (!t) why = "no CAG number was read on the proforma or the diagram sheet";
  else if (/[A-Za-z]/.test(t)) why = "CAG No. " + t + " contains letters \u2014 CAG numbers are digits only";
  else {
    var pp = cagParse_(t);
    if (!pp) why = "CAG No. " + t + " is not a CAG number (up to four digits, with or without its year)";
    else if (pp.y && dy && Number(pp.y) !== dy) why = "CAG No. " + t + " ends in " + pp.y + " but the CAG date is in " + dy;
    else if (pp.y && !dy && Number(pp.y) > new Date().getFullYear()) why = "CAG No. " + t + " ends in " + pp.y + ", which has not come yet";
    if (pp) t = cagCanon_(t, dy || Number(upY) || 0);
  }
  if (t) c.cagNo = t;
  if (from) why = "the proforma has no CAG number \u2014 " + t + " was taken from " + from + (why ? "; " + why : "");
  if (why) c.errors.push({ page: "", step: "numbers", reason: why + " \u2014 check against the paperwork" });
}
function batchPtcaNumbers_(c) {
  var r = c.results || {}, src = [];
  if (r.q1 && r.q1.ptcaNo) src.push({ where: "front page", n: batchPtcaNoNorm_(r.q1.ptcaNo), raw: String(r.q1.ptcaNo) });
  ["q2", "q3", "q4"].forEach(function (k, i) { if (r[k] && r[k].hdrPtcaNo) src.push({ where: "page " + (i + 2) + " header", n: batchPtcaNoNorm_(r[k].hdrPtcaNo), raw: String(r[k].hdrPtcaNo) }); });
  // 13.52: the PTCA diagram sheet's Cath No.
  var pdg = r.qd && r.qd.pdiag;
  if (pdg && pdg.cathNo) src.push({ where: "diagram sheet", n: batchPtcaNoNorm_(pdg.cathNo), raw: String(pdg.cathNo) });
  var u = r.qu && r.qu.util;
  if (u && (u.cathNo || u.ipNo)) {
    var whole = batchPtcaNoNorm_(u.cathNo);
    var cc = String(u.cathNo || "").replace(/\D/g, ""), pp = String(u.ipNo || "").replace(/\D/g, "");
    src.push({ where: "utilization sheet", n: whole.kind === "full" ? whole : cc && pp ? batchPtcaNoNorm_(cc + "AP" + pp) : cc ? batchPtcaNoNorm_(cc) : { kind: "", v: "" } });
  }
  var front = src.length && src[0].where === "front page" ? src[0].n : { kind: "", v: "" };
  var fulls = src.filter(function (x) { return x.n.kind === "full"; });
  var best = front.kind === "full" ? front
    : front.kind === "cath" ? ((fulls.filter(function (x) { return x.n.cath === front.cath; })[0] || {}).n || front)
    : (fulls[0] || {}).n || null;
  var probs = [];
  src.forEach(function (x) {
    if (x.n.kind === "cagLike") probs.push("the " + x.where + " PTCA No. was read as " + x.raw + ", which looks like a CAG number");
    else if (best && best.kind === "full" && x.n.kind === "full" && x.n.v !== best.v) probs.push("the " + x.where + " reads " + x.n.v);
    else if (best && x.n.kind === "cath" && best.cath && x.n.cath !== best.cath) probs.push("the " + x.where + " gives cath number " + x.n.cath);
  });
  c.errors = (c.errors || []).filter(function (e) { return e.step !== "numbers"; });
  if (!best || !best.v) c.errors.push({ page: "", step: "numbers", reason: "no PTCA number was found on any sheet — type it in from the paperwork" });
  else {
    c.cagNo = best.v;
    if (probs.length) c.errors.push({ page: "", step: "numbers", reason: "the PTCA numbers on the sheets disagree — the report has " + best.v + "; " + probs.join("; ") + " — check against the paperwork" });
    else if (best.kind !== "full") c.errors.push({ page: "", step: "numbers", reason: "only the cath number " + best.v + " was found — the PTCA number (xxxxAPzzzz) is incomplete" });
  }
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
  var tk = c.results && c.results._tokens;
  if (tk && tk.requests) why += " \u2014 " + tk.requests + " request(s), tokens in " + (tk["in"] || 0) + ", answer " + (tk.answer || 0) + ", thinking " + (tk.thinking || 0);
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
    "There may also be the PTCA DIAGRAM SHEET (no PTCA footer): the department's letterhead over Name, Cath No. (e.g. 2413 AP 669) and Date, and, filling most of the page, a large printed HEART DRAWING of the coronary arteries (labels LCA, RCA, LAD, CM, DI, PLV, PD, RAO 30, LVEF), usually with a stent drawn on a vessel and one or more small printed STENT STICKERS (brand, REF, LOT, diameter, length, QR code) pasted on it. A page whose main content is a heart drawing is ALWAYS qd, never qu, whatever stickers are pasted on it — qu is a printed table with no drawing. " +
    "Anything else (a blank page, a blood report, an ECG strip, a CAG proforma page) is \"other\".\n" +
    "Slot codes: q1 = page 1 of 4, q2 = page 2 of 4, q3 = page 3 of 4, q4 = page 4 of 4, qu = utilization report, qd = diagram sheet (heart drawing), other = anything else. " +
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
  var BY_N = ["", "q1", "q2", "q3", "q4", "qu", "qd"];
  var norm = function (s) {
    s = String(s == null ? "" : s).trim().toLowerCase();
    if (/^q1$|^1$|page ?1|sheet ?1|front/.test(s)) return "q1";
    if (/^q2$|^2$|page ?2|sheet ?2|investig/.test(s)) return "q2";
    if (/^q3$|^3$|page ?3|sheet ?3|procedure|technique/.test(s)) return "q3";
    if (/^q4$|^4$|page ?4|sheet ?4|bif/.test(s)) return "q4";
    if (/^qd$|^6$|sheet ?6|diagram|drawing|heart/.test(s)) return "qd";
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
  // printed footer decides, else the headings (sheet 5 = utilization report,
  // sheet 6 = the diagram sheet, 13.52)
  var pp = Number(one.printedPage) || 0, sh = Number(one.sheet) || 0;
  var s;
  if (pp >= 1 && pp <= 4) s = BY_N[pp];
  else if (sh >= 1 && sh <= 6) s = BY_N[sh];
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
/* 13.50 — how much the model thinks before it answers. Thinking is billed as
   output (₹357 per million tokens on 3.8 Flash, half in the queue) and was most
   of the bill at the model's own default (high). Kept in the script property
   THINKING — "minimal", "low" (the default), "medium", "high" or "auto" (send
   nothing: the model's own default) — and changed from the app's Gemini costs
   page with no new version. A model that refuses the setting (Google answers
   400 naming thinking) is remembered in THINK_REFUSED and sent without it. */
var THINK_LEVELS = ["minimal", "low", "medium", "high", "auto"], THINK_DEFAULT = "low";
function thinkLevel_() {
  var v = String(PropertiesService.getScriptProperties().getProperty("THINKING") || "").trim().toLowerCase();
  return THINK_LEVELS.indexOf(v) >= 0 ? v : THINK_DEFAULT;
}
function thinkInfo_() {
  var pp = PropertiesService.getScriptProperties();
  return { level: thinkLevel_(), levels: THINK_LEVELS, def: THINK_DEFAULT, at: pp.getProperty("THINKING_AT") || "", by: pp.getProperty("THINKING_BY") || "", refused: Object.keys(thinkRefused_()) };
}
function thinkSet_(req) {
  var v = String(req.level || "").trim().toLowerCase();
  if (THINK_LEVELS.indexOf(v) < 0) throw new Error("the thinking level must be one of " + THINK_LEVELS.join(", "));
  var pp = PropertiesService.getScriptProperties();
  pp.setProperty("THINKING", v); pp.setProperty("THINKING_AT", cathNow_()); pp.setProperty("THINKING_BY", cathStr_(req.by, 60));
  return { think: thinkInfo_(), said: "Thinking set to " + v + " — from the next request on (phones and the sheet alike)." };
}
function thinkRefused_() {
  try { var o = JSON.parse(PropertiesService.getScriptProperties().getProperty("THINK_REFUSED") || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
}
function thinkRefusedNote_(model, text) {
  if (!model || !/think/i.test(String(text || ""))) return false;
  var o = thinkRefused_();
  if (o[model]) return false;
  o[model] = cathNow_();
  PropertiesService.getScriptProperties().setProperty("THINK_REFUSED", JSON.stringify(o));
  return true;
}
/* the thinkingConfig for a model, or null (send none) */
function thinkConfig_(model) {
  var lv = thinkLevel_();
  if (lv === "auto" || thinkRefused_()[model]) return null;
  // the Pro models take only low and high
  if (/pro/i.test(String(model || ""))) lv = lv === "minimal" ? "low" : lv === "medium" ? "high" : lv;
  return { thinkingLevel: lv };
}

/* the request for one page: { body, asImage } or { ok:false, reason, retry } */
function batchBody_(model, prompt, item, pdfPage) {
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
  var gc = { temperature: 0, maxOutputTokens: 16384, responseMimeType: "application/json" };
  var tc = thinkConfig_(model);
  if (tc) gc.thinkingConfig = tc;
  return { body: {
    contents: [{ role: "user", parts: [
      { inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } },
      { text: prompt }
    ] }],
    generationConfig: gc
  }, asImage: asImage };
}
function batchGemini_(key, model, prompt, item, pdfPage) {
  var built = batchBody_(model, prompt, item, pdfPage);
  if (!built.body) return built;
  var body = built.body, asImage = built.asImage;
  batchCount_(model);
  // 13.43: the request has a time limit of its own, and is marked as "in the
  // air" while it waits — see BATCH_FETCH_SEC_DEFAULT
  var limit = batchFetchSec_();
  var resp, t0 = Date.now(), took;
  batchFlight_(model);
  try {
    resp = batchFetch_(GEMINI_API + "/models/" + model + ":generateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key },
      payload: JSON.stringify(body), muteHttpExceptions: true }, limit);
  } catch (e) {
    took = Date.now() - t0;
    batchFlightEnd_();
    var msg = String(e && e.message || e);
    if (/timed? ?out|Timeout|deadline/i.test(msg) || took >= (limit - 2) * 1000) {
      var till = batchRestSlow_(model, BATCH_SLOW_REST_MS, "no answer in " + Math.round(took / 1000) + " s");
      return { ok: false, slow: true, retry: true, reason: model + " did not answer within " + Math.round(took / 1000) + " s — it is left alone until " + till + " and the other models are used" };
    }
    return { ok: false, reason: "the request to Google failed: " + msg, retry: true };
  }
  took = Date.now() - t0;
  batchFlightEnd_();
  var code = resp.getResponseCode(), text = resp.getContentText();
  // a fault that took most of a minute to arrive — or, whatever its number, the
  // whole time allowed — is the same trouble as no answer at all (a used-up
  // limit, 429, has its own rest below)
  var late = code !== 200 && code !== 429 && took >= (limit - 2) * 1000;
  if ((code >= 500 && took >= BATCH_SLOW_MS) || late) batchRestSlow_(model, BATCH_SLOW_REST_MS, "answered " + code + " only after " + Math.round(took / 1000) + " s");
  if (code === 400 && body.generationConfig && body.generationConfig.thinkingConfig && thinkRefusedNote_(model, text)) {
    batchLogRow_("", "", item && item.name || "", "thinking", "refused", model + " does not take the thinking setting — sent again without it, and from now on");
    return batchGemini_(key, model, prompt, item, pdfPage);
  }
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
    if (quota && !nofree && kind && kind.word === "daily limit") batchLearnCap_(model);
    var reason = code === 429
      ? (nofree ? "the model " + model + " has no free tier for this key — set BATCH_MODEL_READ / BATCH_MODEL_PAGE to a free one"
                : "Google's " + (kind ? kind.word : "limit") + " for " + model + " is used up (429) — other models are tried; this one rests for " + (kind ? kind.restWord : "an hour"))
      : code === 404 ? "the model " + model + " is not offered any more — set BATCH_MODEL_READ / BATCH_MODEL_PAGE to a current one"
      : code === 400 && /too large|exceeds|size/i.test(text) ? item.name + " is too large for the model — re-upload it smaller"
      : code >= 500 ? "Google answered " + code + " (a temporary fault on their side)"
      : "Google answered " + code + ": " + cls.note;
    return { ok: false, reason: reason, retry: code >= 500 || code === 0 || late, quota: quota, nofree: nofree };
  }
  var j;
  try { j = JSON.parse(text); } catch (e) { return { ok: false, reason: "Google's reply was not readable", retry: true }; }
  batchTokAdd_(j && j.usageMetadata, model, false, (item && item.name ? item.name : "") + (pdfPage ? " p." + pdfPage : ""));
  var rp = batchReply_(j);
  if (!rp.ok) return rp;
  BATCH_RUN_.ok++;
  return { ok: true, json: rp.json, asImage: asImage, tok: batchTokWord_(j && j.usageMetadata) };
}
/* 13.48: what each request used, from Google's own count (usageMetadata):
   tokens in (the page and the prompt), the answer, and the model's thinking
   (thoughtsTokenCount, billed as output). Noted per page in the case log and
   added up per case (results._tokens), so the cost of a case can be read off. */
var BATCH_CASE_TOK_ = null;   // the case being read: its running totals
function batchTokAdd_(u, model, half, step) {
  if (u) costNote_(u, model, half, step);
  if (!u || !BATCH_CASE_TOK_) return;
  var t = BATCH_CASE_TOK_;
  t["in"] = (t["in"] || 0) + (Number(u.promptTokenCount) || 0);
  t.answer = (t.answer || 0) + (Number(u.candidatesTokenCount) || 0);
  t.thinking = (t.thinking || 0) + (Number(u.thoughtsTokenCount) || 0);
  t.requests = (t.requests || 0) + 1;
}
function batchTokWord_(u) {
  if (!u) return "";
  return "tokens: in " + (Number(u.promptTokenCount) || 0) + ", answer " + (Number(u.candidatesTokenCount) || 0) + ", thinking " + (Number(u.thoughtsTokenCount) || 0);
}
/* one generateContent answer (from a direct request, or one item of a batch
   job) -> { ok, json } or { ok:false, reason, retry, tryOther } */
function batchReply_(j) {
  var cand = j && j.candidates && j.candidates[0];
  var fin = cand && cand.finishReason;
  if (!cand) {
    var block = j && j.promptFeedback && j.promptFeedback.blockReason;
    return { ok: false, reason: block ? "Google declined to read this page (" + block + ")" : "the model returned nothing for this page", retry: !block };
  }
  // a thinking model's thought summary (thought: true) is never part of the answer
  var out = ((cand.content && cand.content.parts) || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ""; }).join("");
  if (fin === "MAX_TOKENS") return { ok: false, reason: "the model's answer was cut off (too long) — the page may be very busy; try re-scanning it on a phone", retry: false, tryOther: true };
  if (fin === "SAFETY" || fin === "RECITATION") return { ok: false, reason: "the model stopped (" + fin + ")", retry: false };
  var parsed = batchParseJson_(out);
  if (parsed === undefined) return { ok: false, reason: "the model's answer was not valid JSON (it wrote text instead of the form's fields)", retry: true };
  return { ok: true, json: parsed };
}

/* ============================================================
   13.48 — Google's half-price batch queue (Batch API)
   On an automatic run, once a case's pages are recognised, the sheets still
   to read go to Google as one batch job on the reading model, at half the
   normal price. Google's target is 24 hours; most jobs come back within
   minutes to an hour or two. The job's name sits in the case's results
   (_job) until its answers are in; a case is queued once (_queued), so a
   sheet the queue could not read is read directly, never queued again.
   ============================================================ */
var BATCH_QUEUE_HOURS_DEFAULT = 6;
var BATCH_QUEUE_MAX_BYTES = 18 * 1024 * 1024;     // Google takes inline batch jobs under 20 MB
/* 13.50 — the technicians' photos (used stents, stock, weekly shelf, the
   day's used instruments) go to Google's half-price batch queue on the night
   runs and are read when the answer is back; outside the night only "Read
   now" on the technicians' page reads them — at once, at the full price
   (and a photo already in the queue is taken out of it).
   PHOTO_MODE_: "send" (a night run), "poll" (only collect answers), "now". */
var PHOTO_MODE_ = "poll";
function photoRead_(r, prompt, item, models, key, runId, pause, timeLeft) {
  COST_CTX_ = { what: COST_PHOTO_WHAT[r.purpose] || "used-stent photo", id: r.id || "", name: r.file || "", runId: runId || "" };
  try { return photoRead0_(r, prompt, item, models, key, runId, pause, timeLeft); }
  finally { COST_CTX_ = null; }
}
var COST_PHOTO_WHAT = { used: "used-stent photo", stock: "stock photo", day: "day photo (used instruments)", weekly: "weekly shelf photo" };
function photoRead0_(r, prompt, item, models, key, runId, pause, timeLeft) {
  var mode = PHOTO_MODE_;
  r.result = r.result && typeof r.result === "object" ? r.result : {};
  var job = r.result._job;
  if (job && job.name) {
    var st = batchJobPoll_(key, job.name);
    var mins = Math.round((Date.now() - Number(job.at || 0)) / 60000);
    if (st.state === "running" || st.state === "unknown") {
      var tooLong = mins >= batchQueueHours_() * 60;
      if (mode !== "now" && !tooLong) return { waiting: true };
      batchJobCancel_(key, job.name);
      delete r.result._job;
      stentNote_(r, runId, "half-price queue", "cancelled", mode === "now" ? "Read now: taken out of the queue (" + mins + " min) and read at once" : "not back after " + mins + " min — read directly instead");
      stentUpWrite_(r);
      if (mode === "poll" && !tooLong) return { waiting: true };
    } else {
      delete r.result._job;
      var it = st.state === "done" ? st.items[0] : null;
      var rp = st.state !== "done" ? { ok: false, reason: st.reason } : !it ? { ok: false, reason: "no answer came back" }
        : it.error ? (thinkRefusedNote_(job.model, it.error.message), { ok: false, reason: "Google: " + String(it.error.message || it.error.code || "error").slice(0, 200) }) : batchReply_(it.response || it);
      if (it && !it.error) batchTokAdd_((it.response || it).usageMetadata, job.model, true, r.file || "");
      if (rp.ok) {
        stentNote_(r, runId, "half-price queue", "ok", "answer back after " + mins + " min (half price)");
        return { ok: true, json: rp.json, model: job.model, queued: true };
      }
      stentNote_(r, runId, "half-price queue", "failed", rp.reason + " — read directly instead");
      stentUpWrite_(r);
    }
  }
  if (mode === "send" && batchQueueOn_() && !r.result._sent) {
    var model = (models.readChain || [models.read])[0];
    var b = batchBody_(model, prompt, item, null);
    if (b.body) {
      var sub = batchJobSubmit_(key, model, [{ request: b.body, metadata: { key: r.id } }], "cag-scanner photo " + r.id);
      r.result._sent = 1;
      if (sub.ok) {
        r.result._job = { name: sub.name, model: model, at: Date.now() };
        batchQueueOpenSet_(true);
        stentNote_(r, runId, "half-price queue", "sent", "sent to Google's half-price queue on " + model + " — usually back within minutes to a few hours");
        stentUpWrite_(r);
        return { waiting: true };
      }
      stentNote_(r, runId, "half-price queue", "not used", sub.reason + " — read directly");
    }
  }
  if (mode === "poll") return { waiting: true };     // read at night, or on "Read now"
  return batchCallChain_(key, models.readChain || [models.read], prompt, item, null, pause, timeLeft);
}
var BATCH_QUEUE_MODE_ = "";   // set by batchTick: "send" (automatic run), "poll" (only look at queued jobs), "now" (Scan now on one case: cancel and read at once)
function batchQueueOn_() {
  var raw = String(PropertiesService.getScriptProperties().getProperty("BATCH_HALF_PRICE") || "").trim().toLowerCase();
  return !/^(off|no|0|false)$/.test(raw);
}
function batchQueueHours_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BATCH_QUEUE_HOURS"), v = Number(raw);
  return raw != null && String(raw).trim() !== "" && isFinite(v) && v > 0 ? Math.min(40, v) : BATCH_QUEUE_HOURS_DEFAULT;
}
function batchJobSubmit_(key, model, reqs, label) {
  var resp;
  try {
    resp = batchFetch_(GEMINI_API + "/models/" + model + ":batchGenerateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key }, muteHttpExceptions: true,
      payload: JSON.stringify({ batch: { display_name: String(label || "cag-scanner").slice(0, 120), input_config: { requests: { requests: reqs } } } }) }, 90);
  } catch (e) { return { ok: false, reason: "the request to Google failed: " + String(e && e.message || e) }; }
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) {
    if (code === 400) thinkRefusedNote_(model, text);
    return { ok: false, reason: "Google answered " + code + ": " + mcClassify(code, text, model).note };
  }
  var j = null; try { j = JSON.parse(text); } catch (e) {}
  var name = j && (j.name || (j.metadata && j.metadata.name) || (j.batch && j.batch.name));
  if (!name) return { ok: false, reason: "Google's answer named no batch job" };
  return { ok: true, name: String(name) };
}
/* the answers of a finished job, wherever Google put them (the docs show
   both response.inlinedResponses and dest.inlinedResponses, nested once more) */
function batchFindInlined_(o, depth) {
  depth = depth || 0;
  if (!o || typeof o !== "object" || depth > 6) return null;
  if (Array.isArray(o.inlinedResponses)) return o.inlinedResponses;
  var ks = Object.keys(o);
  for (var i = 0; i < ks.length; i++) { var r = batchFindInlined_(o[ks[i]], depth + 1); if (r) return r; }
  return null;
}
/* -> { state: "running" | "done" | "failed" | "unknown", items, reason } */
function batchJobPoll_(key, name) {
  var resp;
  try { resp = batchFetch_(GEMINI_API + "/" + name, { method: "get", headers: { "x-goog-api-key": key }, muteHttpExceptions: true }, 60); }
  catch (e) { return { state: "unknown", reason: "the request to Google failed: " + String(e && e.message || e) }; }
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code === 404) return { state: "failed", reason: "Google no longer has this batch job" };
  if (code !== 200) return { state: "unknown", reason: "Google answered " + code };
  var j = null; try { j = JSON.parse(text); } catch (e) { return { state: "unknown", reason: "Google's answer was not readable" }; }
  var st = String((j.metadata && j.metadata.state) || j.state || (j.batch && j.batch.state) || "");
  if (/FAILED|CANCELL?ED|EXPIRED/i.test(st) || (j.done && j.error)) {
    return { state: "failed", reason: (st || "the job failed") + (j.error && j.error.message ? ": " + String(j.error.message).slice(0, 200) : "") };
  }
  if (/SUCCEEDED/i.test(st) || j.done) {
    var items = batchFindInlined_(j);
    return items ? { state: "done", items: items } : { state: "failed", reason: "the finished job held no answers" };
  }
  return { state: "running", what: st };
}
function batchJobCancel_(key, name) {
  try { batchFetch_(GEMINI_API + "/" + name + ":cancel", { method: "post", contentType: "application/json", payload: "{}", headers: { "x-goog-api-key": key }, muteHttpExceptions: true }, 30); } catch (e) {}
}
/* Is there any case waiting on a job? (kept in BATCH_QUEUE_OPEN so the
   5-minute runs outside the scan window can skip the sheet when there is none) */
function batchQueueOpenSet_(on) {
  var pp = PropertiesService.getScriptProperties();
  if (on) pp.setProperty("BATCH_QUEUE_OPEN", "1"); else pp.deleteProperty("BATCH_QUEUE_OPEN");
}
/* One case's part in the queue, called before its sheets are read directly.
   Returns "waiting" (the case waits for its job; nothing else to do now) or
   "live" (read whatever is still unread directly, as before). */
function batchQueueStep_(c, items, prompts, models, key, runId) {
  var mode = BATCH_QUEUE_MODE_;
  if (!c.results || typeof c.results !== "object") c.results = {};
  var job = c.results._job;
  if (job && job.name) {
    var st = batchJobPoll_(key, job.name);
    var mins = Math.round((Date.now() - Number(job.at || 0)) / 60000);
    if (st.state === "running" || st.state === "unknown") {
      var tooLong = mins >= batchQueueHours_() * 60;
      if (mode !== "now" && !tooLong) return "waiting";
      batchJobCancel_(key, job.name);
      delete c.results._job;
      batchNote_(c, runId, "", "half-price queue", "cancelled", mode === "now" ? "Scan now: the queued job (" + mins + " min) is cancelled and the sheets are read at once"
        : "not back after " + mins + " min — the sheets are read directly instead");
      batchWriteRow_(c);
      return "live";
    }
    delete c.results._job;
    if (st.state === "failed") {
      batchNote_(c, runId, "", "half-price queue", "failed", st.reason + " — the sheets are read directly instead");
      batchWriteRow_(c);
      return "live";
    }
    // done: each answer goes where a direct read's would
    var got = 0, miss = [];
    (job.slots || []).forEach(function (sl, i) {
      var it = null;
      for (var k = 0; k < st.items.length; k++) { var md = st.items[k] && st.items[k].metadata; if (md && md.key === sl.slot) { it = st.items[k]; break; } }
      if (!it) it = st.items[i];
      var rp = !it ? { ok: false, reason: "no answer came back" }
        : it.error ? (thinkRefusedNote_(job.model, it.error.message), { ok: false, reason: "Google: " + String(it.error.message || it.error.code || "error").slice(0, 200) })
        : batchReply_(it.response || it);
      var um = it && !it.error ? (it.response || it).usageMetadata : null;
      batchTokAdd_(um, job.model, true, sl.label || "");
      if (!rp.ok) { miss.push(BATCH_SLOT_WORD[sl.slot] + " (" + rp.reason + ")"); return; }
      c.results[sl.slot] = rp.json;
      c.readBy = c.readBy || {}; c.readBy[sl.slot] = job.model;
      var hdr = rp.json && typeof rp.json === "object" ? rp.json : {};
      if (sl.slot === "p1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.cagNo || ""); }
      else if (sl.slot === "q1") { c.name = String(hdr.name || ""); c.cagNo = String(hdr.ptcaNo || hdr.cathNo || hdr.cagNo || ""); }
      else if (!c.cagNo && (hdr.cagNo || hdr.ptcaNo)) c.cagNo = String(hdr.ptcaNo || hdr.cagNo);
      c.errors = (c.errors || []).filter(function (e) { return e.slot !== sl.slot; });
      batchNote_(c, runId, sl.label, "reading " + BATCH_SLOT_WORD[sl.slot], "ok",
        (sl.slot === "p1" || sl.slot === "q1" ? c.name + (c.cagNo ? " · " + (sl.slot === "q1" ? "PTCA " : "CAG ") + c.cagNo + " · " : " · ") : "") + "half-price queue, " + mins + " min" + (sl.how ? " · " + sl.how : "") + (um ? " · " + batchTokWord_(um) : ""));
      got++;
    });
    BATCH_RUN_.ok += got;
    if (miss.length) batchNote_(c, runId, "", "half-price queue", "partly", got + " sheet(s) read; read directly instead: " + miss.join("; "));
    batchWriteRow_(c);
    return "live";
  }
  if (mode !== "send" || !batchQueueOn_() || c.results._queued) return "live";
  // the sheets still to read — the same ones the direct loop would read
  var todo = [];
  c.pageMap.forEach(function (m) {
    if (m.dup || m.slot === "other" || m.slot === "unknown" || !m.slot) return;
    if (c.results[m.slot]) return;
    if ((c.errors || []).some(function (e) { return e.slot === m.slot; })) return;
    if (m.slot === "d" && !prompts.d) return;
    if (m.slot === "qd" && !prompts.qd) return;
    if (!prompts[m.slot] || !items[m.fileIdx]) return;
    if (todo.some(function (t) { return t.slot === m.slot; })) return;
    todo.push({ m: m, slot: m.slot, item: items[m.fileIdx] });
  });
  if (!todo.length) return "live";
  var model = (models.readChain || [models.read])[0];
  var reqs = [], slots = [], size = 0;
  for (var t = 0; t < todo.length; t++) {
    var b = batchBody_(model, batchReadPrompt_(prompts[todo[t].slot], todo[t].item.isPdf, todo[t].m.pdfPage), todo[t].item, todo[t].m.pdfPage);
    if (!b.body) return "live";
    size += b.body.contents[0].parts[0].inline_data.data.length + 4000;
    reqs.push({ request: b.body, metadata: { key: todo[t].slot } });
    slots.push({ slot: todo[t].slot, label: todo[t].m.label, how: todo[t].item.isPdf ? (b.asImage || "whole PDF") : "" });
  }
  c.results._queued = 1;
  if (size > BATCH_QUEUE_MAX_BYTES) {
    batchNote_(c, runId, "", "half-price queue", "skipped", "the pages are too large together (" + Math.round(size / 1048576) + " MB) for one job — read directly");
    batchWriteRow_(c);
    return "live";
  }
  var sub = batchJobSubmit_(key, model, reqs, "cag-scanner " + c.caseId);
  if (!sub.ok) {
    batchNote_(c, runId, "", "half-price queue", "not used", sub.reason + " — the sheets are read directly");
    batchWriteRow_(c);
    return "live";
  }
  c.results._job = { name: sub.name, model: model, at: Date.now(), slots: slots };
  batchQueueOpenSet_(true);
  batchNote_(c, runId, "", "half-price queue", "sent", slots.length + " sheet(s) sent to Google's batch queue on " + model + " (half price) — usually back within minutes to a few hours; read directly if not back in " + batchQueueHours_() + " h");
  batchWriteRow_(c);
  return "waiting";
}
/* how long this request may take: BATCH_FETCH_SEC (script property, 20 to
   240 s; default 90), and never past BATCH_RUN_END_MS of the run */
function batchFetchSec_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BATCH_FETCH_SEC");
  var v = Number(raw);
  var sec = raw != null && String(raw).trim() !== "" && isFinite(v) ? Math.max(20, Math.min(240, Math.round(v))) : BATCH_FETCH_SEC_DEFAULT;
  if (BATCH_RUN_.start) sec = Math.min(sec, Math.floor((BATCH_RUN_END_MS - (Date.now() - BATCH_RUN_.start)) / 1000));
  return Math.max(15, sec);
}
/* UrlFetchApp with the time limit.
   An Apps Script that will not take timeoutSeconds throws at once instead of
   sending. When it names the option ("Attribute provided with invalid value:
   timeoutseconds") the request is sent again as before, and so are the rest
   of this run's. When it throws at once without naming it, that may be a
   passing fault ("Unexpected error"), so the first such request simply fails
   (the next model, or the next run, carries on); a second in a row is sent
   again without the option, and if that goes through the option is dropped
   for the rest of the run. A request that waited before failing is never
   taken for a refusal — the limit stays. */
var BATCH_REFUSED_RE = /timeout[ _]?seconds|attribute provided/i;
var BATCH_REFUSALS_ = 0;       // requests in a row that were thrown back at once
function batchFetch_(url, opt, limitSec) {
  if (BATCH_NO_TIMEOUT_) return UrlFetchApp.fetch(url, opt);
  var withLimit = { timeoutSeconds: limitSec };
  Object.keys(opt).forEach(function (k) { withLimit[k] = opt[k]; });
  var t0 = Date.now(), resp;
  try { resp = UrlFetchApp.fetch(url, withLimit); }
  catch (e) {
    if (Date.now() - t0 >= 3000) { BATCH_REFUSALS_ = 0; throw e; }
    var named = BATCH_REFUSED_RE.test(String(e && e.message || e));
    if (!named && ++BATCH_REFUSALS_ < 2) throw e;
    resp = UrlFetchApp.fetch(url, opt);           // a fault of its own is thrown on from here
    BATCH_NO_TIMEOUT_ = true;
    return resp;
  }
  BATCH_REFUSALS_ = 0;
  return resp;
}
/* the request now in the air (written before it, removed after it): what a
   run that Google ended was waiting for */
function batchFlight_(model) {
  try { PropertiesService.getScriptProperties().setProperty("BATCH_FLIGHT", JSON.stringify({ model: model, at: Date.now() })); } catch (e) {}
}
function batchFlightEnd_() {
  try { PropertiesService.getScriptProperties().deleteProperty("BATCH_FLIGHT"); } catch (e) {}
}
/* a model that is not answering is left alone for a while (kept with the
   limit rests, so batchCallChain_ passes over it); a longer rest it already
   has stays. Returns the time it is left alone until, on the sheet's clock. */
function batchRestSlow_(model, restMs, note) {
  var until = Date.now() + restMs;
  try {
    var u = batchUsage_();
    var had = u.rest[model] != null ? Number(u.rest[model]) + BATCH_REST_MS : 0;
    if (had > until) until = had;
    else { u.rest[model] = until - BATCH_REST_MS; u.restWhy = u.restWhy || {}; u.restWhy[model] = "slow"; }
    u.lastSlow = model + " (" + note + ") at " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    PropertiesService.getScriptProperties().setProperty("BATCH_USAGE", JSON.stringify(u));
  } catch (e) {}
  var till = Utilities.formatDate(new Date(until), Session.getScriptTimeZone(), "HH:mm");
  BATCH_RUN_.rested++;
  BATCH_RUN_.notes.push(mcLabel(model) + " did not answer (" + note + ") and is left alone until " + till);
  return till;
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
function batchPacificReset_(now) {
  now = now || new Date();
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
    if (restModel) { u.rest[restModel] = Date.now() + (restMs || BATCH_REST_MS) - BATCH_REST_MS;   // "until" stored as start + rest − hour
      if (u.restWhy) delete u.restWhy[restModel]; }
    PropertiesService.getScriptProperties().setProperty("BATCH_USAGE", JSON.stringify(u));
  } catch (e) {}
}
function batchLearnCap_(model) {
  try {
    var props = PropertiesService.getScriptProperties();
    var caps = {}; try { caps = JSON.parse(props.getProperty("BATCH_CAPS") || "{}") || {}; } catch (e) {}
    var n = (batchUsage_().counts[model] || 0) - 1;     // the 429 itself was counted
    if (n > 0) { caps[model] = n; props.setProperty("BATCH_CAPS", JSON.stringify(caps)); }
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
    if (age > 7 * 60000) {
      // 13.43: what it was waiting for, when that is known
      var flight = null; try { flight = JSON.parse(props.getProperty("BATCH_FLIGHT") || "null"); } catch (e) {}
      cutOff = "a run that started at " + String(running.at).replace("T", " ").slice(0, 16) + " UTC did not finish \u2014 cut off at Google's 6-minute limit" +
        (flight && flight.model ? " while waiting for " + mcLabel(flight.model) + "; the next scan leaves that model alone and uses the others" : "") + "; what it had read is kept and the rest continues";
    }
    else running = Object.assign(running, { live: true });
  }
  var u = batchUsage_();
  var usage = Object.keys(u.counts).map(function (m) { return { model: m, label: mcLabel(m), n: u.counts[m] }; });
  var rest = batchResting_();
  var restWhy = u.restWhy || {};
  var resting = Object.keys(rest).map(function (m) { return { model: m, label: mcLabel(m), why: restWhy[m] === "slow" ? "slow" : "limit", until: Utilities.formatDate(new Date(rest[m] + BATCH_REST_MS), Session.getScriptTimeZone(), "HH:mm") }; });
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
    running: running && running.live ? running : null, cutOff: cutOff, usage: usage, last429: u.last429 || "", lastSlow: u.lastSlow || "", resting: resting, fetchSec: batchFetchSec_(),
    schedule: batchPlan_(), reserveLeft: batchCappedLeft_() };
}
/* 13.52: the date of the procedure as read off the sheets — the CAG / PTCA
   proforma's own date first, then the utilization or diagram sheet's */
function batchCaseDate_(r) {
  var x = r.results || {}, pick = function (v) { return String(v == null ? "" : v).trim(); };
  var ds = batchType_(r.type) === "PTCA"
    ? [x.q1 && x.q1.date, x.qu && x.qu.util && x.qu.util.date, x.qd && x.qd.pdiag && x.qd.pdiag.date]
    : [x.p1 && x.p1.date, x.d && (x.d.diagram || x.d).date];
  for (var i = 0; i < ds.length; i++) if (pick(ds[i])) return pick(ds[i]);
  return "";
}
function batchList_() {
  var tab = batchTabRows_();
  return tab.rows.map(function (r) {
    return { caseId: r.caseId, status: r.status, created: r.created, updated: r.updated, files: r.files, fileIds: r.fileIds,
      pages: r.pages, grouping: r.grouping, name: r.name, cagNo: r.cagNo, type: r.type,
      uploaded: r.uploaded, scannedAt: r.scannedAt, checkedAt: r.checkedAt, filesRemoved: r.filesRemoved,
      sheets: Object.keys(r.results || {}).filter(function (k) { return BATCH_SLOTS.indexOf(k) >= 0; }),
      errors: r.errors, openedBy: r.openedBy, savedBy: r.savedBy, readBy: batchReadBy_(r), date: batchCaseDate_(r) };
  }).reverse();
}
/* which model read each sheet; a case read before 13.38 has it worked out from its log
   (the last "reading <sheet>: ok" line, "(via …)" when a fallback model answered) */
function batchReadBy_(r) {
  var have = r.readBy && typeof r.readBy === "object" ? r.readBy : {};
  var out = {}, read0 = String(r.models || "").split(" / ")[0].trim();
  var lines = String(r.log || "").split("\n");
  Object.keys(r.results || {}).forEach(function (slot) {
    if (BATCH_SLOTS.indexOf(slot) < 0) return;
    if (have[slot]) { out[slot] = have[slot]; return; }
    var word = BATCH_SLOT_WORD[slot], got = "";
    for (var i = lines.length - 1; i >= 0; i--) {
      if (lines[i].indexOf("reading " + word + ": ok") < 0) continue;
      var v = /\(via ([^)\s]+)\)/.exec(lines[i]);
      got = v ? v[1] : read0; break;
    }
    if (got) out[slot] = got;
  });
  return out;
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
    models: r.models, files: files, openedBy: r.openedBy, savedBy: r.savedBy, readBy: batchReadBy_(r) };
}
/* the bytes of one of a case's files, so the app can show the page beside
   the review screen (and, for a PDF, split it itself the way it does now) */
function batchFile_(req) {
  // 13.49: only the case-ID and file-ID columns are read (not every row's readings)
  var sh = batchTab_(), id = String(req.fileId || ""), cid = String(req.caseId || ""), ok = false;
  if (sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < vals.length && !ok; i++) if (cell(vals[i][0]) === cid && cell(vals[i][5]).split("\n").indexOf(id) >= 0) ok = true;
  }
  if (!ok) throw new Error("that file is not part of that case");
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
  // 13.48: a job still in Google's half-price queue for this case is cancelled
  if (r.results && r.results._job && r.results._job.name) { var kq = geminiKey_(); if (kq) batchJobCancel_(kq, r.results._job.name); }
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
  r.draft = ""; r.draftAt = ""; r.draftBy = ""; r.draftMs = 0; r.readBy = {};
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

/* 13.43 — the daily check's requests have a time limit too. A model that
   holds a request without answering kept the whole check waiting until
   Google ended it at 6 minutes, and the day's list was never written (13 Nov
   2026). Each test request, and the model list itself, is now given
   MC_PROBE_SEC; a model that stays silent is marked "no answer", as a
   request that failed outright always was. No new test request is sent once
   the check has run for MC_BUDGET_MS. */
var MC_PROBE_SEC = 30;
var MC_BUDGET_MS = 240000;
var MC_T0_ = 0;            // when this check began
function runModelCheck_(key, prev, nowIso) {
  MC_T0_ = Date.now();
  var cands = mcCandidates(listGeminiModels_(key));
  var results = {};
  for (var round = 0; round < 8; round++) {
    if (Date.now() - MC_T0_ > MC_BUDGET_MS) break;
    var batch = mcNextBatch(cands, results);
    if (!batch.length) break;
    var answers = fetchAllSafe_(batch.map(function (c) {
      return { url: GEMINI_API + "/models/" + c.id + ":generateContent", method: "post",
        contentType: "application/json", headers: { "x-goog-api-key": key },
        payload: JSON.stringify(MC_PROBE_BODY), muteHttpExceptions: true };
    }));
    answers.forEach(function (a, i) {
      results[batch[i].id] = mcClassify(a.code, a.body, batch[i].id);
      if (a.code === 200) { try { var pj = JSON.parse(a.body); COST_CTX_ = { what: "model check", id: "", name: "Reply with the single word OK" }; costNote_(pj && pj.usageMetadata, batch[i].id, false, ""); } catch (e) {} finally { COST_CTX_ = null; } }
    });
  }
  return mcBuild(cands, results, prev, "sheet", nowIso);
}
/* fetchAll throws when ANY request gets no answer at all (a timeout, say),
   even with muteHttpExceptions. Then each is sent on its own, so one
   silent model only marks that model as "no answer". */
function fetchAllSafe_(reqs) {
  var read = function (a) { return { code: a.getResponseCode(), body: a.getContentText() }; };
  var limited = !BATCH_NO_TIMEOUT_;
  var list = !limited ? reqs : reqs.map(function (r) {
    var o = { timeoutSeconds: MC_PROBE_SEC };
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    return o;
  });
  var t0 = Date.now();
  try {
    return UrlFetchApp.fetchAll(list).map(read);
  } catch (e) {
    // an Apps Script that will not take timeoutSeconds refuses it at once, naming it: the same again
    // without it (a refusal that does not name it is found out one request at a time, by batchFetch_)
    if (limited && Date.now() - t0 < 3000 && BATCH_REFUSED_RE.test(String(e && e.message || e))) { BATCH_NO_TIMEOUT_ = true; return fetchAllSafe_(reqs); }
    return reqs.map(function (r) {
      if (MC_T0_ && Date.now() - MC_T0_ > MC_BUDGET_MS) return { code: 0, body: "not tested (the check ran out of time)" };
      try { return read(batchFetch_(r.url, r, MC_PROBE_SEC)); }
      catch (e2) { return { code: 0, body: String((e2 && e2.message) || e2) }; }
    });
  }
}

function listGeminiModels_(key) {
  var all = [], token = "";
  for (var page = 0; page < 10; page++) {
    var listUrl = GEMINI_API + "/models?pageSize=1000" + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    var listOpt = { headers: { "x-goog-api-key": key }, muteHttpExceptions: true };
    var r;
    // 13.43: with a time limit, and asked once more when it fails (a passing fault, or
    // an Apps Script that will not take the limit — batchFetch_ finds that out on the second request)
    try { r = batchFetch_(listUrl, listOpt, MC_PROBE_SEC); }
    catch (e0) { r = batchFetch_(listUrl, listOpt, MC_PROBE_SEC); }
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

/* ============================================================
   13.44 — the cath lab's technicians: their key, the stents, the inventory
   ============================================================
   The technicians get a page of their own in the app ("Stents & inventory"),
   opened by a key of their own: script property TECH_KEY (an editor can set
   it from the app's Settings; techKeySet). It must differ from EDIT_KEY.
   With no TECH_KEY set, nobody has the technicians' page.

   STENT STICKERS
   - The technicians photograph a sheet with the patient's name and PTCA /
     Cath number written on it and the peel-off labels of the stents (and
     any other device) stuck beside them, and drop the photo in the inbox's
     "Stents uploads" folder (or upload it from the app, stentUpload).
   - The inbox scanner reads each photo with the same Gemini models and
     pauses as the proformas (after the proformas of the run, with the time
     left), one row per sticker in the "Stents" tab: patient, number, device,
     brand, size, REF, LOT, serial, expiry, GTIN and the numbers printed under
     the barcode / QR code (GS1 — "(01)…(17)…(10)…" — taken apart into GTIN,
     expiry, lot and serial when the sticker does not print them itself).
     Every photo has a row in "Stent uploads" (status, errors, the log).
   - A read photo moves to "Stents scanned". Only the newest STENT_KEEP
     (default 200) photos are kept there; older ones are deleted — what was
     read from them stays in the sheet.
   - Bills: the app sends the photo of a bill (stentReadBill), the script
     reads it with Gemini, and the app matches what it says (LOT, serial,
     REF, size, brand, patient) against the Stents tab and opens the case.
     A matched sticker can be marked billed (bill no., date, vendor).

   INVENTORY
   - "Inventory": one row per item — Type, Brand, Size — with what is in
     stock now, worked out from "Inventory moves" (the ledger: received,
     used in a PTCA, reused, counted, corrected). Colour by type.
   - Every saved PTCA brings its hardware list ("invUse", worked out by the
     app from the utilization sheet): one "used" move per device, a device
     marked ox / oxy a "reused" move that subtracts nothing. Saving the case
     again replaces its moves; removing it from the registry removes them.
   - Items start at zero and go below zero as PTCAs use them, until the
     technicians record what came in (received +N) or what is on the shelf
     (counted = N).
   - PTCAs done before INV_START (default INV_START_DEFAULT) are listed with
     their hardware but subtract nothing — so an old case corrected later
     does not take from today's stock.
*/
var TECH_KEY_PROP = "TECH_KEY";
function techAllowed(tkey) {
  var want = String(PropertiesService.getScriptProperties().getProperty(TECH_KEY_PROP) || "").trim();
  return !!want && String(tkey == null ? "" : tkey).trim() === want;
}
function techKeyIsSet_() { return !!String(PropertiesService.getScriptProperties().getProperty(TECH_KEY_PROP) || "").trim(); }
/* an editor sets (or, with an empty key, removes) the technicians' key */
function techKeySet_(req) {
  var k = String(req.newTechKey == null ? "" : req.newTechKey).trim();
  var props = PropertiesService.getScriptProperties();
  if (!k) { props.deleteProperty(TECH_KEY_PROP); return { techSet: false }; }
  if (k.length < 4) throw new Error("the technicians' key must be at least 4 characters long");
  if (k === String(props.getProperty("EDIT_KEY") || "").trim()) throw new Error("the technicians' key must not be the edit key — it would let them edit cases too");
  props.setProperty(TECH_KEY_PROP, k);
  return { techSet: true };
}
function cathNow_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"); }
function cathToday_() { return Utilities.formatDate(new Date(), BATCH_TZ, "yyyy-MM-dd"); }
var CATH_SEQ_ = 0;
function cathId_(prefix) { return prefix + Date.now().toString(36).toUpperCase() + (++CATH_SEQ_).toString(36).toUpperCase(); }
function cathStr_(v, max) { var s = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return max && s.length > max ? s.slice(0, max) : s; }

/* ---------------- inventory ---------------- */
var INV_TAB = "Inventory", INV_MOVES = "Inventory moves";
var INV_HEAD = ["Item id", "Type", "Brand", "Size", "In stock", "Received", "Used", "Adjusted (+/−)", "Reused (not deducted)",
  "Low at", "Tracked", "Notes", "Keys", "Last used", "Updated", "By", "Counts from"];
var MOVE_HEAD = ["Move id", "Time", "Item id", "Kind", "Units", "Qty", "Case key", "PTCA No", "Patient", "Case date",
  "Written as", "Where", "By", "Note"];
var INV_START_DEFAULT = "2026-11-17";     // the day 13.44 went out
/* the kinds of equipment, in the order the app and the tab list them; the
   same keys as the app's hardware list types, plus the inventory's own */
/* 13.45: IVUS and OCT have their own kinds (ELCA and anything else of the
   kind stays "imaging"), and contrast is kept here too — taken in, counted
   and used by hand from the technicians' page, never from a utilization sheet */
var INV_KIND_ORDER = ["stent", "balloon", "dcb", "cutting", "wire", "guide", "ge", "mc", "asp", "rota", "ivus", "oct", "imaging", "sheath", "contrast", "other"];
var INV_KIND_LABEL = { stent: "Stent", balloon: "Balloon", dcb: "Drug-coated balloon", cutting: "Cutting balloon", wire: "Guide wire",
  guide: "Guide catheter", ge: "Guide extension", mc: "Microcatheter", asp: "Aspiration catheter", rota: "Rota burr",
  ivus: "IVUS catheter", oct: "OCT catheter", imaging: "ELCA / other imaging", sheath: "Sheath", contrast: "Contrast", other: "Other" };
var INV_KIND_TINT = { stent: "#fde7e5", balloon: "#f1e8fb", dcb: "#fff0dc", cutting: "#f3e9df", wire: "#e1f3f4", guide: "#e3edfb",
  ge: "#e8eaf6", mc: "#e5f3e6", asp: "#fce4ef", rota: "#efe7e4", ivus: "#e0f4f6", oct: "#e3f2fd", imaging: "#eef7f8", sheath: "#eceff1",
  contrast: "#fff8e1", other: "#f2f2f2" };
function invKindOf_(t) {
  var r = String(t == null ? "" : t).toLowerCase().trim();
  if (!r) return "other";
  if (INV_KIND_LABEL[r]) return r;
  if (/exten|\bge\b|zilla|telescope/.test(r)) return "ge";
  if (/micro|\bmc\b/.test(r)) return "mc";
  if (/aspir|thromb/.test(r)) return "asp";
  if (/sheath|introducer/.test(r)) return "sheath";
  if (/rota|burr/.test(r)) return "rota";
  if (/contrast|omnipaque|iohexol|visipaque|iodixanol|ultravist|iopromide|iopamidol|isovue|iomeron|iomeprol/.test(r)) return "contrast";
  if (/ivus|intravascular ultra|opticross|eagle ?eye|refinity|altaview/.test(r)) return "ivus";
  if (/\boct\b|optical coherence|dragonfly/.test(r)) return "oct";
  if (/elca|laser|imaging/.test(r)) return "imaging";
  if (/wire/.test(r)) return "wire";
  if (/dcb|\bdeb\b|drug/.test(r)) return "dcb";
  if (/cut|scor/.test(r)) return "cutting";
  if (/bal+oon|poba/.test(r)) return "balloon";
  if (/stent|\bdes\b/.test(r)) return "stent";
  if (/guid|cath/.test(r)) return "guide";
  return "other";
}
function invNorm_(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
/* "2.50 x 12 mm" = "2.5×12" = "2.5*12"; "6 Fr" = "6F"; "3.0" = "3" */
function invSizeKey_(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/mm\b/g, "").replace(/[×*]/g, "x").replace(/\s+/g, "")
    .replace(/fr?\.?$/, "f")
    .replace(/(\d+\.\d*?)0+(?=\D|$)/g, "$1").replace(/\.(?=\D|$)/g, "")
    .replace(/[^0-9a-z.]/g, "");
}
function invKey_(kind, brand, size) { return invKindOf_(kind) + "|" + invNorm_(brand) + "|" + invSizeKey_(size); }
function invItemKey_(it) { return invKey_(it.kind, it.brand, it.size); }

function invTab_() { var sh = sheet(INV_TAB, INV_HEAD); ensureCols(sh, INV_HEAD.length); return sh; }
function invMovesSheet_() { var sh = sheet(INV_MOVES, MOVE_HEAD); ensureCols(sh, MOVE_HEAD.length); return sh; }
/* the items as the Inventory tab lists them; a row typed into the tab by hand
   (no Item id yet) is taken in and given one */
function invItems_() {
  var sh = invTab_();
  var out = [];
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, INV_HEAD.length).getValues();
  vals.forEach(function (v) {
    var brand = cathStr_(cell(v[2]), 120), size = cathStr_(cell(v[3]), 60), type = cathStr_(cell(v[1]), 60);
    if (!brand && !size) return;
    var kind = invKindOf_(type);
    var tracked = String(cell(v[10])).trim().toLowerCase();
    var low = String(cell(v[9])).trim();
    // a row typed in by hand has no id yet: one made from what it says, the
    // same on every read until the tab is next written
    out.push({ id: cathStr_(cell(v[0]), 40) || invHandId_(kind, brand, size), kind: kind, type: INV_KIND_LABEL[kind], brand: brand || INV_KIND_LABEL[kind], size: size,
      low: low !== "" && isFinite(Number(low)) ? Number(low) : null, tracked: !(tracked === "no" || tracked === "false" || tracked === "0"),
      notes: cathStr_(cell(v[11]), 500), keys: cell(v[12]).split("\n").map(function (k) { return k.trim(); }).filter(Boolean),
      updated: cell(v[14]), by: cell(v[15]), from: /^\d{4}-\d{2}-\d{2}/.test(cell(v[16])) ? cell(v[16]).slice(0, 10) : "",
      fromSetBy: cell(v[16]).trim() === "-" ? "hand" : "", fromAuto: /photo/.test(cell(v[16])) });
  });
  return out;
}
function invHandId_(kind, brand, size) {
  var k = invKey_(kind, brand, size), h = 5381;
  for (var i = 0; i < k.length; i++) h = ((h * 33) ^ k.charCodeAt(i)) >>> 0;
  return "IH" + h.toString(36).toUpperCase();
}
function invMovesAll_() {
  var sh = invMovesSheet_();
  var out = [];
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, MOVE_HEAD.length).getValues();
  vals.forEach(function (v, i) {
    if (!cell(v[0]) && !cell(v[2])) return;
    out.push({ row: i + 2, id: cell(v[0]), t: cell(v[1]), item: cell(v[2]), kind: cell(v[3]), units: Number(v[4]) || 0, qty: Number(v[5]) || 0,
      caseKey: cell(v[6]), ptcaNo: cell(v[7]), patient: cell(v[8]), caseDate: cell(v[9]).slice(0, 10), raw: cell(v[10]), where: cell(v[11]),
      by: cell(v[12]), note: cell(v[13]) });
  });
  return out;
}
function invStart_() {
  var s = String(PropertiesService.getScriptProperties().getProperty("INV_START") || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : INV_START_DEFAULT;
}
/* 13.50: an item's own start ("Counts from"): a use (a PTCA's or a sticker's)
   dated before it is not taken off — the stock was counted after it */
function invTotals_(items, moves) {
  var by = {}, from = {};
  items.forEach(function (it) { by[it.id] = { stock: 0, received: 0, used: 0, adjusted: 0, reused: 0, early: 0, before: 0, lastUsed: "", cases: 0, onSheet: 0, counted: false }; from[it.id] = it.from || ""; });
  moves.forEach(function (m) {
    var t = by[m.item];
    if (!t) return;
    if (m.kind === "used" && from[m.item] && m.caseDate && m.caseDate < from[m.item]) { t.before += m.units || -m.qty; return; }
    t.stock += m.qty;
    if (m.kind === "received") t.received += m.qty;
    else if (m.kind === "used") { t.used += -m.qty; t.cases++; if (m.caseDate > t.lastUsed) t.lastUsed = m.caseDate; }
    else if (m.kind === "reused") { t.reused += m.units; if (m.caseDate > t.lastUsed) t.lastUsed = m.caseDate; }
    else if (m.kind === "early") t.early += m.units;
    else if (m.kind === "sheet") t.onSheet += m.units;   // 13.45: a stent on a utilization sheet — the stickers take stents off
    else if (m.kind === "rejected") { }
    else if (m.kind === "handuse") { t.used += -m.qty; if ((m.t || "").slice(0, 10) > t.lastUsed) t.lastUsed = (m.t || "").slice(0, 10); }                    // a sheet's stent the technicians said was not used
    else { t.adjusted += m.qty; if (m.kind === "count") t.counted = true; }   // count, correction, use by hand
  });
  return by;
}
/* sizes in the order a shelf has them: by diameter, then length */
function invSizeSort_(a, b) {
  var na = String(a || "").match(/\d+(?:\.\d+)?/g) || [], nb = String(b || "").match(/\d+(?:\.\d+)?/g) || [];
  for (var i = 0; i < Math.max(na.length, nb.length); i++) {
    if (na[i] == null) return -1;
    if (nb[i] == null) return 1;
    var d = Number(na[i]) - Number(nb[i]);
    if (d) return d;
  }
  return String(a || "").localeCompare(String(b || ""));
}
function invSort_(items) {
  return items.slice().sort(function (a, b) {
    return (INV_KIND_ORDER.indexOf(a.kind) - INV_KIND_ORDER.indexOf(b.kind)) ||
      a.brand.toLowerCase().localeCompare(b.brand.toLowerCase()) || invSizeSort_(a.size, b.size);
  });
}
/* the Inventory tab, written afresh: sorted by type, brand and size, each
   type in its own colour, a stock below zero in red */
function invWriteTab_(items, moves) {
  var sh = invTab_();
  var tot = invTotals_(items, moves || invMovesAll_());
  var list = invSort_(items);
  var rows = list.map(function (it) {
    var t = tot[it.id];
    return [it.id, it.type, it.brand, it.size, t.stock, t.received, t.used, t.adjusted, t.reused,
      it.low == null ? "" : it.low, it.tracked ? "yes" : "no", it.notes, (it.keys || []).join("\n"), t.lastUsed, it.updated || "", it.by || "", it.from ? it.from + (it.fromAuto ? " (first stock photo)" : "") : (it.fromSetBy === "hand" ? "-" : "")];
  });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, INV_HEAD.length).clearContent().setBackground(null).setFontColor(null).setFontWeight(null);
  if (!rows.length) return tot;
  // text columns stay text (a size "3.0" or "12/15" must not become a number or a date)
  sh.getRange(2, 1, rows.length, 4).setNumberFormat("@");
  sh.getRange(2, 5, rows.length, 5).setNumberFormat("0");
  sh.getRange(2, 10, rows.length, INV_HEAD.length - 9).setNumberFormat("@");
  sh.getRange(2, 1, rows.length, INV_HEAD.length).setValues(rows.map(function (r) { return r.map(function (v) { return typeof v === "number" ? v : String(v); }); }));
  sh.getRange(2, 1, rows.length, INV_HEAD.length).setBackgrounds(list.map(function (it) {
    var c = INV_KIND_TINT[it.kind] || "#ffffff"; var r = []; for (var k = 0; k < INV_HEAD.length; k++) r.push(c); return r; }));
  sh.getRange(2, 5, rows.length, 1).setFontColors(list.map(function (it) { var s = tot[it.id].stock; return [s < 0 ? "#c00000" : s === 0 ? "#8a6a12" : "#1c7a55"]; }))
    .setFontWeights(list.map(function () { return ["bold"]; }));
  try { sh.setFrozenRows(1); } catch (e) {}
  return tot;
}
/* the item a device belongs to: same type, brand and size (or a name it had
   before — an edit or a merge keeps the old one among its keys), else the
   only item of that brand and size whatever its type */
function invFind_(items, kind, brand, size) {
  var key = invKey_(kind, brand, size);
  for (var i = 0; i < items.length; i++) {
    if (invItemKey_(items[i]) === key || (items[i].keys || []).indexOf(key) >= 0) return items[i];
  }
  var tail = key.slice(key.indexOf("|"));
  var hits = items.filter(function (it) {
    if (invItemKey_(it).slice(invItemKey_(it).indexOf("|")) === tail) return true;
    return (it.keys || []).some(function (k) { return k.slice(k.indexOf("|")) === tail; });
  });
  return hits.length === 1 ? hits[0] : null;
}
function invEnsure_(items, kind, brand, size, by) {
  kind = invKindOf_(kind);
  var it = invFind_(items, kind, brand, size);
  if (it) return it;
  it = { id: cathId_("I"), kind: kind, type: INV_KIND_LABEL[kind], brand: brand || INV_KIND_LABEL[kind], size: size || "",
    low: null, tracked: true, notes: "", keys: [], updated: cathNow_(), by: by || "", isNew: true };
  items.push(it);
  return it;
}
function invMoveRow_(m) {
  return [m.id || cathId_("M"), m.t || cathNow_(), m.item, m.kind, m.units || 0, m.qty || 0, m.caseKey || "", m.ptcaNo || "", m.patient || "",
    m.caseDate || "", m.raw || "", m.where || "", m.by || "", m.note || ""];
}
function invAppendMoves_(rows) {
  if (!rows.length) return;
  var sh = invMovesSheet_();
  var at = sh.getLastRow() + 1;
  sh.getRange(at, 1, rows.length, MOVE_HEAD.length).setNumberFormat("@").setValues(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
  sh.getRange(at, 5, rows.length, 2).setNumberFormat("0").setValues(rows.map(function (r) { return [Number(r[4]) || 0, Number(r[5]) || 0]; }));
}
/* rows of the ledger deleted, bottom up, a run of neighbours at a time */
function invDeleteRows_(rowNums) {
  if (!rowNums.length) return;
  var sh = invMovesSheet_();
  var r = rowNums.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < r.length) {
    var end = r[i], start = end;
    while (i + 1 < r.length && r[i + 1] === start - 1) { i++; start = r[i]; }
    sh.deleteRows(start, end - start + 1);
    i++;
  }
}
/* the ledger's name for a PTCA: its tab's year and its number */
function invCaseKey_(year, ptcaNo, cagNo, name) {
  var n = String(ptcaNo || "").trim() ? "PTCA " + String(ptcaNo).trim()
    : String(cagNo || "").trim() ? "CAG " + String(cagNo).trim()
    : String(name || "").trim() ? "name " + String(name).trim().toLowerCase() : "";
  return n ? "PTCA " + year + " · " + n : "";
}
/* A saved PTCA's hardware (from appendCase): its moves are replaced by the
   ones sent now. Nothing is written when nothing changed. */
function invApplyCase_(c) {
  var r = invApplyCase0_(c);
  try { boxLinkUse_(c.caseDate); } catch (e) {}   // 13.50: a box used that day is named with its case
  return r;
}
function invApplyCase0_(c) {
  if (!c.caseKey) return { n: 0, note: "the case has no number or name" };
  var items = invItems_();
  var moves = invMovesAll_();
  var keys = [c.caseKey]; if (c.origKey && c.origKey !== c.caseKey) keys.push(c.origKey);
  var old = moves.filter(function (m) { return keys.indexOf(m.caseKey) >= 0 && (m.kind === "used" || m.kind === "reused" || m.kind === "early" || m.kind === "sheet"); });
  var start = invStart_();
  var early = c.caseDate && c.caseDate < start;
  var now = cathNow_(), rows = [];
  (c.uses || []).slice(0, 80).forEach(function (u) {
    if (!u || typeof u !== "object") return;
    var kind = invKindOf_(u.kind || u.type);
    var brand = cathStr_(u.brand, 120), size = cathStr_(u.size, 60);
    if (!brand && !size) return;
    var it = invEnsure_(items, kind, brand || INV_KIND_LABEL[kind], size, c.by);
    var units = Math.max(1, Math.min(20, Math.round(Number(u.units) || 1)));
    // 13.45: the stent stickers are what take stents off; a stent written on
    // the sheet is recorded beside them ("sheet") and checked against them
    var kindOf = early ? "early" : u.reused ? "reused" : kind === "stent" ? "sheet" : "used";
    rows.push({ id: cathId_("M"), t: now, item: it.id, kind: kindOf, units: units, qty: kindOf === "used" ? -units : 0,
      caseKey: c.caseKey, ptcaNo: c.ptcaNo, patient: c.patient, caseDate: c.caseDate, raw: cathStr_(u.raw, 200), where: cathStr_(u.where, 60), by: c.by,
      note: early ? "PTCA before the inventory start (" + start + ") — not deducted" : u.reused ? "marked ox / oxy — reused, not deducted"
        : kindOf === "sheet" ? "on the utilization sheet — stents are taken off from their stickers" : (u.note ? cathStr_(u.note, 200) : "") });
  });
  var sig = function (list) {
    return list.map(function (m) { return [m.item, m.kind, m.units, m.raw, m.where, m.caseKey, m.caseDate, m.ptcaNo, m.patient].join("|"); }).sort().join("\n");
  };
  var anyNew = items.some(function (it) { return it.isNew; });
  if (sig(old) === sig(rows)) {
    if (anyNew) invWriteTab_(items, moves);
    return { n: rows.length, same: true, early: !!early };
  }
  invDeleteRows_(old.map(function (m) { return m.row; }));
  invAppendMoves_(rows.map(invMoveRow_));
  // the totals from what is now in the ledger, without reading it again
  invWriteTab_(items, moves.filter(function (m) { return old.indexOf(m) < 0; }).concat(rows));
  return { n: rows.length, early: !!early, start: start };
}
/* A PTCA saved from an app older than 13.44 brings no hardware list. When its
   case data has a utilization sheet (and it is not a planned PTCA, nor done
   before the inventory start) it is noted here; the technicians' page reads
   the case and takes its hardware off with invApplyPending — or saving the
   case again from a 13.44 app does it. At most 60 are kept. */
var INV_PENDING_PROP = "INV_PENDING";
function invPending_() {
  try { var l = JSON.parse(PropertiesService.getScriptProperties().getProperty(INV_PENDING_PROP) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function invPendingSave_(list) {
  var p = PropertiesService.getScriptProperties();
  if (!list.length) { p.deleteProperty(INV_PENDING_PROP); return; }
  var keep = list.slice(-60), sj = JSON.stringify(keep);
  while (sj.length > 8500 && keep.length > 1) { keep = keep.slice(1); sj = JSON.stringify(keep); }
  p.setProperty(INV_PENDING_PROP, sj);
}
function invPendingDrop_(keys) {
  var list = invPending_();
  var left = list.filter(function (x) { return keys.indexOf(x.key) < 0; });
  if (left.length !== list.length) invPendingSave_(left);
}
function invLooseIso_(v) {
  var m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*$/.exec(String(v == null ? "" : v));
  if (!m) return "";
  var y = Number(m[3]); if (y < 100) y += 2000;
  var mo = Number(m[2]), d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
}
function invPendingNote_(caseJson, c) {
  if (!c.key) return null;
  var o = null; try { o = JSON.parse(String(caseJson || "")); } catch (e) {}
  if (!o || typeof o !== "object" || o.planned || !o.util || typeof o.util !== "object") return null;
  var grid = o.util.grid && typeof o.util.grid === "object" ? o.util.grid : {};
  var any = Object.keys(grid).some(function (v) { var col = grid[v] || {}; return Object.keys(col).some(function (k) { return String(col[k] || "").trim(); }); }) ||
    ["cutting", "microcatheter", "guideExtension", "rotaBurr", "aspiration", "ivusOctElca", "otherHardware", "accessSheath"].some(function (k) { return String(o.util[k] || "").trim(); });
  if (!any) return null;
  var d = invLooseIso_(o.date) || invLooseIso_(o.util.date);
  if (d && d < invStart_()) return null;
  // a case already in the ledger (saved earlier from 13.44) keeps its entries
  var list = invPending_().filter(function (x) { return x.key !== c.key; });
  list.push({ key: c.key, year: c.year, ptcaNo: c.ptcaNo, cagNo: c.cagNo, name: c.name, date: d, at: cathNow_() });
  invPendingSave_(list);
  return { pending: true };
}
/* the technicians' page sends the hardware of a case the sheet noted */
function invApplyPending_(req) {
  var p = req.pend && typeof req.pend === "object" ? req.pend : null;
  if (!p || !p.key) throw new Error("which case?");
  if (!invPending_().some(function (x) { return x.key === String(p.key); })) throw new Error("this case is no longer waiting \u2014 refresh the list");
  var r = null;
  if (Array.isArray(req.invUse)) {
    r = invApplyCase_({ caseKey: String(p.key), origKey: "", ptcaNo: cathStr_(p.ptcaNo || p.cagNo, 40), patient: cathStr_(p.name, 120),
      caseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(req.invDate || "")) ? String(req.invDate) : (p.date || cathToday_()), uses: req.invUse, by: cathStr_(req.by, 60) });
  }
  invPendingDrop_([String(p.key)]);
  return Object.assign(invGet_({}), { said: r ? (p.name || p.ptcaNo) + ": " + r.n + " device(s) recorded" + (r.early ? " (before the start date \u2014 not taken off)" : "") + "." : (p.name || p.ptcaNo) + " taken off the waiting list." });
}
/* a PTCA removed from the registry gives its hardware back */
function invRemoveCase_(caseKey) {
  if (!caseKey) return 0;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INV_MOVES);
  if (!sh || sh.getLastRow() < 2) return 0;
  var moves = invMovesAll_().filter(function (m) { return m.caseKey === caseKey; });
  if (!moves.length) return 0;
  invDeleteRows_(moves.map(function (m) { return m.row; }));
  invWriteTab_(invItems_());
  return moves.length;
}
function invMoveOut_(m) {
  return { id: m.id, t: m.t, item: m.item, kind: m.kind, units: m.units, qty: m.qty, caseKey: m.caseKey, ptcaNo: m.ptcaNo,
    patient: m.patient, caseDate: m.caseDate, raw: m.raw, where: m.where, by: m.by, note: m.note };
}
/* ---------------- 13.45: stents from their stickers ----------------
   The sticker photos are the surer record of which stents went in, so each
   stent sticker on the Stents tab takes one stent off (case key "STICKER
   <id>"). A stent written on a utilization sheet is kept as a "sheet" entry
   and matched to the case's stickers; one with no sticker is put in front
   of the technicians, who add its sticker details (accept) or say it was not
   used (reject). */
function invDigits_(s) { return String(s == null ? "" : s).replace(/\D/g, "").replace(/^0+/, ""); }
/* 13.52: "2368AP660" is Cath no. 2368 (the year's cath serial, unique) and
   angioplasty no. AP 660. Cases are the same when the Cath numbers agree and
   the AP numbers do not disagree (a sticker page often has the Cath no. alone) */
function invCaseNo_(s) {
  var t = String(s == null ? "" : s).toUpperCase();
  var m = t.match(/^\D*(\d+)/), a = t.match(/AP\D*(\d+)/);
  return { cath: m ? m[1].replace(/^0+/, "") : "", ap: a ? a[1].replace(/^0+/, "") : "" };
}
function invSameCase_(x, y) {
  var a = invCaseNo_(x), b = invCaseNo_(y);
  if (!a.cath || !b.cath) return false;
  if (a.cath !== b.cath) return false;
  return !a.ap || !b.ap || a.ap === b.ap;
}
function invStickerSize_(s) {
  if (s.dia && s.len) return s.dia + "×" + s.len;
  return cathStr_(s.size, 60).replace(/\s*mm\b/ig, "").replace(/\s*[x*×]\s*/g, "×").trim();
}
function invStickerDate_(s) {
  var d = invLooseIso_(s.date) || (/^\d{4}-\d{2}-\d{2}/.test(String(s.date || "")) ? String(s.date).slice(0, 10) : "");
  var sc = /^\d{4}-\d{2}-\d{2}/.test(String(s.scannedAt || "")) ? String(s.scannedAt).slice(0, 10) : "";
  // a date read short or wrong ("17/11/20" for 17/11/2026) — more than 60 days
  // from the day its photo was read: the photo's day is the surer one
  if (d && sc && Math.abs(Date.parse(d) - Date.parse(sc)) > 60 * 86400000) d = sc;
  return d || sc || cathToday_();
}
function invIsStentSticker_(s) { return s && s.id && String(s.device || "Stent") === "Stent" && (s.brand || s.size || s.dia); }
/* 13.52 — stickers read off the PTCA "diagram stent sheet" are kept with the
   upload id "DIAGRAM <PTCA No>". They take a stent off the stock only while
   the technicians' sticker photo of that case has not been read: that photo
   is the more reliable one. Once it is, the diagram ones are kept only to be
   compared with it (stentDiagDiffs_). */
var DIAG_UP = "DIAGRAM ";
function stentIsDiag_(s) { return String(s && s.up || "").indexOf(DIAG_UP) === 0; }
function stentSameCaseOf_(a, b) {
  var pa = invDigits_(a.ptcaNo), pb = invDigits_(b.ptcaNo);
  if (pa && pb) return invSameCase_(a.ptcaNo, b.ptcaNo);
  var na = invNorm_(a.patient), nb = invNorm_(b.patient);
  return !!na && na === nb;
}
/* the stent stickers that count: the technicians' ones, and the diagram
   sheet's where the case has no technicians' sticker yet */
function stentCounted_(all) {
  var st = (all || []).filter(invIsStentSticker_), tech = st.filter(function (x) { return !stentIsDiag_(x); });
  return st.filter(function (x) { return !stentIsDiag_(x) || !tech.some(function (t) { return stentSameCaseOf_(t, x); }); });
}
/* where the diagram sheet's stickers and the technicians' stickers of one case disagree */
function stentDiagDiffs_(all) {
  var st = (all || []).filter(invIsStentSticker_), diag = st.filter(stentIsDiag_), tech = st.filter(function (x) { return !stentIsDiag_(x); });
  var cases = {}, out = [];
  diag.forEach(function (d) { var k = invCaseNo_(d.ptcaNo).cath || invNorm_(d.patient); (cases[k] = cases[k] || []).push(d); });
  Object.keys(cases).forEach(function (k) {
    var ds = cases[k], ts = tech.filter(function (t) { return stentSameCaseOf_(t, ds[0]); });
    if (!ts.length) return;
    var left = ts.slice(), msgs = [];
    var txt = function (x) { return [x.brand, x.size || (x.dia && x.len ? x.dia + " × " + x.len + " mm" : ""), x.lot ? "LOT " + x.lot : ""].filter(Boolean).join(" "); };
    var sz = function (x) { return invSizeKey_(invStickerSize_(x)); };
    ds.forEach(function (d) {
      var i = -1, l;
      for (l = 0; l < left.length; l++) if (invNorm_(d.lot) && invNorm_(left[l].lot) === invNorm_(d.lot)) { i = l; break; }
      if (i < 0) for (l = 0; l < left.length; l++) if (sz(left[l]) && sz(left[l]) === sz(d)) { i = l; break; }
      if (i < 0) { msgs.push("diagram sheet " + txt(d) + " — no technicians' sticker like it"); return; }
      var t = left.splice(i, 1)[0];
      if (invNorm_(d.lot) && invNorm_(t.lot) && invNorm_(d.lot) !== invNorm_(t.lot)) msgs.push("diagram sheet LOT " + d.lot + ", technicians' sticker LOT " + t.lot + " (" + txt(t) + ")");
      else if (sz(d) && sz(t) && sz(d) !== sz(t)) msgs.push("diagram sheet " + txt(d) + ", technicians' sticker " + txt(t));
    });
    left.forEach(function (t) { msgs.push("technicians' sticker " + txt(t) + " — not on the diagram sheet"); });
    if (msgs.length) out.push({ ptcaNo: ds[0].ptcaNo, patient: ds[0].patient || ts[0].patient, date: ds[0].date, diffs: msgs });
  });
  return out.slice(-40);
}
/* the app saves a PTCA case: the stickers on its diagram stent sheet are
   written (replacing that case's earlier diagram ones); the inventory follows */
function diagStickersSave_(ptcaNo, name, date, list, by) {
  var key = invCaseNo_(ptcaNo).cath ? String(ptcaNo).replace(/\s+/g, "") : invNorm_(name);
  if (!key) return { n: 0 };
  var up = DIAG_UP + key, all = stentRowsAll_();
  var old = all.filter(function (x) { return stentIsDiag_(x) && (x.up === up || stentSameCaseOf_(x, { ptcaNo: ptcaNo, patient: name })); });
  if (old.length) stentDeleteRows_(old.map(function (x) { return x.row; }));
  var rows = [];
  (list || []).slice(0, 8).forEach(function (x, i) {
    x = x || {};
    if (!x.dia && !x.lot && !x.brand && !x.product) return;
    var st = stentNormItem_({ device: "Stent", brand: x.product || x.brand, manufacturer: x.brand && x.product ? x.brand : "", diameter: x.dia, length: x.len,
      ref: x.ref, lot: x.lot, serial: x.serial, expiry: x.expiry, codes: [], other: x.position || "" });
    var row = stentRowOf_(cathId_("DG"), up, { name: name, ptcaNo: ptcaNo, ipNo: "", date: date }, st, "", "", "diagram stent sheet");
    row[STENT_KEYS.indexOf("notes")] = "from the PTCA diagram stent sheet" + (x.position ? " · " + x.position : "") + " — the technicians' sticker photo, when read, is taken instead";
    rows.push(row);
  });
  if (rows.length) stentWriteRows_(rows);
  if (rows.length || old.length) invAfterSticker_(by);
  var tech = stentRowsAll_().filter(function (x) { return invIsStentSticker_(x) && !stentIsDiag_(x) && stentSameCaseOf_(x, { ptcaNo: ptcaNo, patient: name }); });
  return { n: rows.length, tech: tech.length };
}
function invNeedSync_(moves, stickers) {
  if (String(PropertiesService.getScriptProperties().getProperty("INV_SEEDED") || "") !== "1") return true;
  var have = {};
  moves.forEach(function (m) { if (m.caseKey.indexOf("STICKER ") === 0) have[m.caseKey.slice(8)] = true; });
  var want = {};
  var miss = stickers.some(function (s) { if (!invIsStentSticker_(s)) return false; want[s.id] = true; return !have[s.id]; });
  return miss || Object.keys(have).some(function (id) { return !want[id]; });
}
function invSyncStickers_(items, moves, by) {
  var start = invStart_(), now = cathNow_();
  var stickers = stentCounted_(stentRowsAll_());
  var oldBy = {};
  moves.forEach(function (m) { if (m.caseKey.indexOf("STICKER ") === 0) (oldBy[m.caseKey] = oldBy[m.caseKey] || []).push(m); });
  var add = [], del = [], seen = {};
  stickers.forEach(function (s) {
    var key = "STICKER " + s.id; seen[key] = true;
    var it = invEnsure_(items, "stent", s.brand || "Stent", invStickerSize_(s), by);
    var d = invStickerDate_(s), early = d < start;
    var row = { id: cathId_("M"), t: now, item: it.id, kind: early ? "early" : "used", units: 1, qty: early ? 0 : -1, caseKey: key,
      ptcaNo: cathStr_(s.ptcaNo, 40), patient: cathStr_(s.patient, 120), caseDate: d,
      raw: [s.brand, s.size, s.lot ? "LOT " + s.lot : ""].filter(Boolean).join(" "), where: "stent sticker", by: by || "",
      note: early ? "sticker before the inventory start (" + start + ") — not deducted" : "from the stent sticker" };
    var old = oldBy[key] || [];
    var same = old.length === 1 && old[0].item === row.item && old[0].kind === row.kind && old[0].caseDate === row.caseDate &&
      old[0].ptcaNo === row.ptcaNo && old[0].patient === row.patient;
    if (same) return;
    old.forEach(function (m) { del.push(m); });
    add.push(row);
  });
  Object.keys(oldBy).forEach(function (k) { if (!seen[k]) oldBy[k].forEach(function (m) { del.push(m); }); });
  if (del.length) invDeleteRows_(del.map(function (m) { return m.row; }));
  if (add.length) invAppendMoves_(add.map(invMoveRow_));
  var removedStickers = {};
  del.forEach(function (m) { if (!seen[m.caseKey]) removedStickers[m.caseKey] = 1; });
  return { added: add.length, removed: Object.keys(removedStickers).length };
}
/* the devices of the department's hardware list, put on the inventory once
   (at zero; "not counted yet" until stock is entered) */
var INV_SEED = [
  ["stent", "Yukon Choice", ""], ["stent", "Yukon Choice Swift", ""], ["stent", "Xience Alpine", ""], ["stent", "Ultimaster Tansei", ""], ["stent", "Biomime Aura", ""],
  ["balloon", "NC Rockstar", ""], ["balloon", "Lineage", ""], ["balloon", "Seguro", ""], ["balloon", "Tanzor", ""], ["balloon", "Sapphire", ""],
  ["dcb", "Elutax", ""],
  ["wire", "Runthrough NS", ""], ["wire", "Blue Star", ""], ["wire", "Fielder FC", ""], ["wire", "BMW", ""], ["wire", "Amplatz Super Stiff", ""],
  ["guide", "XB 3.0", "6F"], ["guide", "JR 3.5 SH", "6F"],
  ["ge", "Guidezilla", ""], ["asp", "Thrombuster", ""]];
function invSeed_(items, by) {
  var p = PropertiesService.getScriptProperties();
  if (String(p.getProperty("INV_SEEDED") || "") === "1") return 0;
  var n = 0;
  INV_SEED.forEach(function (x) {
    var nb = invNorm_(x[1]);
    var have = items.some(function (it) { return it.kind === x[0] && invNorm_(it.brand) === nb; });
    if (have) return;
    items.push({ id: cathId_("I"), kind: x[0], type: INV_KIND_LABEL[x[0]], brand: x[1], size: x[2], low: null, tracked: true,
      notes: "from the department's hardware list", keys: [], updated: cathNow_(), by: by || "" });
    n++;
  });
  p.setProperty("INV_SEEDED", "1");
  return n;
}
/* every case's sheet stents against its stickers → what the technicians must look at */
function invStickerCheck_(moves, stickers, items) {
  var start = invStart_();
  var cases = {}, order = [];
  moves.forEach(function (m) {
    if (m.kind !== "sheet" && m.kind !== "rejected") return;
    var c = cases[m.caseKey];
    if (!c) { c = cases[m.caseKey] = { caseKey: m.caseKey, ptcaNo: m.ptcaNo, patient: m.patient, caseDate: m.caseDate, sheet: [], rejected: [] }; order.push(c); }
    if (m.kind === "sheet") {
      for (var u = 0; u < Math.max(1, m.units); u++) c.sheet.push({ item: m.item, raw: m.raw, where: m.where });
      if (m.caseDate) c.caseDate = m.caseDate;
    } else c.rejected.push({ item: m.item, raw: m.raw });
  });
  var st = stickers.filter(invIsStentSticker_);
  var used = {};
  var itemsById = {};
  (items || invItems_()).forEach(function (it) { itemsById[it.id] = it; });
  var review = [];
  order.forEach(function (c) {
    if (!c.sheet.length || (c.caseDate && c.caseDate < start)) return;
    var pn = invDigits_(c.ptcaNo), nm = invNorm_(c.patient);
    var mine = st.filter(function (s) {
      if (used[s.id]) return false;
      var sp = invDigits_(s.ptcaNo);
      if (pn && sp) return invSameCase_(c.ptcaNo, s.ptcaNo);
      return !!nm && invNorm_(s.patient) === nm;
    });
    mine.forEach(function (s) { used[s.id] = true; });
    var left = mine.slice();
    var sizeOf = function (x) { var it = itemsById[x.item]; return it ? invSizeKey_(it.size) : ""; };
    var missing = [];
    // a sticker of the same size first, then any sticker of the case
    c.sheet.forEach(function (x) {
      var k = sizeOf(x), i = -1;
      for (var a = 0; a < left.length; a++) if (k && invSizeKey_(invStickerSize_(left[a])) === k) { i = a; break; }
      if (i >= 0) left.splice(i, 1); else missing.push(x);
    });
    missing = missing.filter(function (x) { if (left.length) { left.shift(); return false; } return true; });
    // what the technicians already said was not used
    var rej = c.rejected.slice();
    missing = missing.filter(function (x) {
      for (var r = 0; r < rej.length; r++) if (rej[r].item === x.item && rej[r].raw === x.raw) { rej.splice(r, 1); return false; }
      return true;
    });
    if (!missing.length) return;
    review.push({ caseKey: c.caseKey, ptcaNo: c.ptcaNo, patient: c.patient, caseDate: c.caseDate, sheetCount: c.sheet.length, stickerCount: mine.length,
      missing: missing.map(function (x) { var it = itemsById[x.item] || {}; return { brand: it.brand || "", size: it.size || "", raw: x.raw, where: x.where }; }) });
  });
  // stickers of a case whose utilization sheet has not been saved (they are taken off all the same)
  var noSheet = {}, nsList = [];
  st.forEach(function (s) {
    if (used[s.id]) return;
    var d = invStickerDate_(s);
    if (d < start) return;
    var k = invCaseNo_(s.ptcaNo).cath || invNorm_(s.patient) || s.id;
    if (!noSheet[k]) { noSheet[k] = { ptcaNo: s.ptcaNo, patient: s.patient, date: d, n: 0 }; nsList.push(noSheet[k]); }
    noSheet[k].n++;
  });
  return { review: review.slice(-40), noSheet: nsList.slice(-40) };
}
/* what the technicians' page shows: every item with its stock, and the
   ledger's latest moves (all of one item's with req.item) */
function invGet_(req) {
  req = req || {};
  var items = invItems_();
  var moves = invMovesAll_();
  var tot = invTotals_(items, moves);
  var list = invSort_(items).map(function (it) {
    var t = tot[it.id];
    return { id: it.id, kind: it.kind, type: it.type, brand: it.brand, size: it.size, low: it.low, tracked: it.tracked, notes: it.notes,
      stock: t.stock, received: t.received, used: t.used, adjusted: t.adjusted, reused: t.reused, early: t.early, lastUsed: t.lastUsed, cases: t.cases,
      onSheet: t.onSheet, counted: t.counted, from: it.from || "", fromAuto: !!it.fromAuto, before: t.before };
  });
  var stickers = [], diagDiff = [];
  try { var allSt = stentRowsAll_(); stickers = stentCounted_(allSt); diagDiff = stentDiagDiffs_(allSt); } catch (e) {}
  var chk = invStickerCheck_(moves, stickers, items);
  var o = { items: list, start: invStart_(), moves: moves.slice(-400).reverse().map(invMoveOut_), moveCount: moves.length, pending: invPending_(),
    kinds: INV_KIND_ORDER.map(function (k) { return { kind: k, label: INV_KIND_LABEL[k] }; }),
    review: chk.review, noSheet: chk.noSheet, diagDiff: diagDiff, boxFlags: stentBoxFlags_(), needSync: invNeedSync_(moves, stickers) };
  try { o.boxFix = invAutoFixStatus_(); } catch (e) {}
  try { o.stockPhotos = invPhotoList_(); } catch (e) {}
  try {
    var ur = stentUpRows_().rows;
    var lastOf = function (p) { var l = ur.filter(function (r) { return r.purpose === p; }).map(function (r) { return String(r.uploaded).slice(0, 10); }).sort(); return l.length ? l[l.length - 1] : ""; };
    o.dayLast = lastOf("day"); o.weeklyLast = lastOf("weekly");
    o.dayPhotos = ur.filter(function (r) { return r.purpose === "day"; }).slice(-14).reverse().map(function (r) {
      return { id: r.id, file: r.file, url: stentPhotoUrl_(r.fileId), status: r.status, uploaded: r.uploaded, result: r.result || null, error: (r.errors || [])[0] ? (r.errors[0].reason || "") : "" };
    });
    o.weeklyResult = JSON.parse(PropertiesService.getScriptProperties().getProperty("WEEKLY_LAST") || "null");
    o.ptcaToday = moves.some(function (m) { return m.caseDate === cathToday_() && (m.kind === "used" || m.kind === "sheet" || m.kind === "reused"); });
  } catch (e) {}
  try { var bl = boxList_(); o.boxes = bl.boxes; o.boxNoMatch = bl.noBox; } catch (e) { o.boxes = []; o.boxesError = String(e && e.message || e); }
  try { o.catalog = boxCatalog_(o.boxes); } catch (e) { o.catalog = {}; }   // 13.51: product → kind, brand, size (barcode-only photos)
  // one item's whole history, for the item open on the page
  if (req.item) { o.item = String(req.item); o.itemMoves = moves.filter(function (m) { return m.item === String(req.item); }).reverse().map(invMoveOut_); }
  return o;
}
/* One change from the technicians' page (req.op). Each is applied and the
   tab rewritten; the answer is the inventory as it now stands. */
function invSave_(req) {
  var op = req.op && typeof req.op === "object" ? req.op : null;
  if (!op) throw new Error("nothing to change");
  var by = cathStr_(req.by, 60);
  var items = invItems_();
  var find = function (id) { for (var i = 0; i < items.length; i++) if (items[i].id === String(id || "")) return items[i]; return null; };
  var note = cathStr_(op.note, 300);
  var said = "", moves;
  var whole = function (v, lo, hi, what) {
    var n = Number(v);
    if (!isFinite(n) || Math.round(n) !== n) throw new Error(what + " must be a whole number");
    if (n < lo || n > hi) throw new Error(what + " must be between " + lo + " and " + hi);
    return n;
  };
  var label = function (it) { return [it.brand, it.size].filter(Boolean).join(" ") + " (" + it.type + ")"; };
  // 13.50: stents come into stock only from a stock photo (each box's LOT and
  // number are needed to match the bills) — never as a bare number
  var STENT_NO = "Stents are added from a stock photo, so each box has its LOT and number for billing — not as a number typed in";
  var kind, brand, size, it;
  switch (String(op.op || "")) {
    case "add":
      kind = invKindOf_(op.kind || op.type); brand = cathStr_(op.brand, 120); size = cathStr_(op.size, 60);
      if (!brand) throw new Error("give the brand (the device's name)");
      it = invFind_(items, kind, brand, size);
      if (it && invItemKey_(it) === invKey_(kind, brand, size)) throw new Error(label(it) + " is already on the list");
      it = { id: cathId_("I"), kind: kind, type: INV_KIND_LABEL[kind], brand: brand, size: size, low: null, tracked: true, notes: cathStr_(op.notes, 500), keys: [], updated: cathNow_(), by: by };
      if (op.low != null && String(op.low).trim() !== "") it.low = whole(op.low, 0, 100000, "The low-stock level");
      items.push(it);
      if (op.units != null && String(op.units).trim() !== "" && Number(op.units) !== 0) {
        if (kind === "stent") throw new Error(STENT_NO);
        invAppendMoves_([invMoveRow_({ item: it.id, kind: "received", units: whole(op.units, 1, 100000, "The number received"), qty: Number(op.units), by: by, note: note || "on adding the item" })]);
      }
      said = "Added " + label(it) + ".";
      break;
    case "edit":
      it = find(op.id); if (!it) throw new Error("that item is no longer on the list");
      var oldKey = invItemKey_(it);
      kind = op.kind || op.type ? invKindOf_(op.kind || op.type) : it.kind;
      brand = op.brand != null ? cathStr_(op.brand, 120) : it.brand;
      size = op.size != null ? cathStr_(op.size, 60) : it.size;
      if (!brand) throw new Error("the brand cannot be empty");
      var newKey = invKey_(kind, brand, size);
      if (newKey !== oldKey) {
        var clash = items.filter(function (x) { return x !== it && (invItemKey_(x) === newKey || (x.keys || []).indexOf(newKey) >= 0); })[0];
        if (clash) throw new Error(label(clash) + " is already on the list — use Merge to put the two together");
        if ((it.keys || []).indexOf(oldKey) < 0) it.keys = (it.keys || []).concat([oldKey]);
      }
      it.kind = kind; it.type = INV_KIND_LABEL[kind]; it.brand = brand; it.size = size;
      if (op.low !== undefined) it.low = op.low == null || String(op.low).trim() === "" ? null : whole(op.low, 0, 100000, "The low-stock level");
      if (op.tracked !== undefined) it.tracked = !!op.tracked;
      if (op.notes !== undefined) it.notes = cathStr_(op.notes, 500);
      it.updated = cathNow_(); it.by = by;
      said = "Saved " + label(it) + ".";
      break;
    case "merge":
      it = find(op.id); var into = find(op.into);
      if (!it || !into) throw new Error("one of the two items is no longer on the list");
      if (it === into) throw new Error("pick a different item to merge into");
      var sh = invMovesSheet_();
      if (sh.getLastRow() >= 2) {
        var col = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues();
        var changed = false;
        col.forEach(function (r) { if (String(r[0]) === it.id) { r[0] = into.id; changed = true; } });
        if (changed) sh.getRange(2, 3, col.length, 1).setValues(col);
      }
      into.keys = (into.keys || []).concat([invItemKey_(it)], it.keys || []).filter(function (k, i, a) { return k && a.indexOf(k) === i && k !== invItemKey_(into); });
      if (it.notes && into.notes.indexOf(it.notes) < 0) into.notes = cathStr_((into.notes ? into.notes + "; " : "") + it.notes, 500);
      into.updated = cathNow_(); into.by = by;
      items.splice(items.indexOf(it), 1);
      said = label(it) + " merged into " + label(into) + ".";
      break;
    case "delete":
      it = find(op.id); if (!it) throw new Error("that item is no longer on the list");
      moves = invMovesAll_().filter(function (m) { return m.item === it.id; });
      var used = moves.filter(function (m) { return m.kind === "used" || m.kind === "reused" || m.kind === "early" || m.kind === "sheet"; });
      if (used.length) throw new Error(label(it) + " is in " + used.length + " PTCA record(s) — merge it into the right item, or mark it Not tracked, instead of deleting it");
      invDeleteRows_(moves.map(function (m) { return m.row; }));
      items.splice(items.indexOf(it), 1);
      said = label(it) + " deleted.";
      break;
    case "receive":
      it = op.id ? find(op.id) : null;
      if (!it && !op.id) {
        brand = cathStr_(op.brand, 120); if (!brand) throw new Error("give the brand (the device's name)");
        it = invEnsure_(items, op.kind || op.type, brand, cathStr_(op.size, 60), by);
      }
      if (!it) throw new Error("that item is no longer on the list");
      if (it.kind === "stent") throw new Error(STENT_NO);
      var nIn = whole(op.units, 1, 100000, "The number received");
      var had0 = invTotals_(items, invMovesAll_())[it.id].stock;
      invAppendMoves_([invMoveRow_({ item: it.id, kind: "received", units: nIn, qty: nIn, by: by, note: note || "added by count" })]);
      said = nIn + " × " + label(it) + " added: " + had0 + " + " + nIn + " = " + (had0 + nIn) + " in stock.";
      break;
    case "from": {
      // 13.50: the day an item's uses start being taken off (one item, or several — a brand)
      var ids = Array.isArray(op.ids) ? op.ids.map(String) : [String(op.id || "")];
      var d0 = String(op.from || "").trim();
      if (d0 && !/^\d{4}-\d{2}-\d{2}$/.test(d0)) throw new Error("the date must be yyyy-mm-dd");
      var nF = 0;
      // cleared by hand it reads "-" (the inventory start), so a stock photo never sets it again
      ids.forEach(function (id) { var x = find(id); if (x) { x.from = d0; x.fromSetBy = "hand"; x.fromAuto = false; x.updated = cathNow_(); x.by = by; nF++; } });
      if (!nF) throw new Error("that item is no longer on the list");
      said = nF + " item" + (nF === 1 ? "" : "s") + (d0 ? ": uses taken off from " + d0 : ": uses taken off from the inventory start") + ".";
      break;
    }
    case "count":
      it = find(op.id); if (!it) throw new Error("that item is no longer on the list");
      if (it.kind === "stent") throw new Error(STENT_NO);
      var counted = whole(op.counted, 0, 100000, "The count");
      var had = invTotals_(items, invMovesAll_())[it.id].stock;
      invAppendMoves_([invMoveRow_({ item: it.id, kind: "count", units: counted, qty: counted - had, by: by,
        note: "counted " + counted + " (the list said " + had + ")" + (note ? " — " + note : "") })]);
      said = label(it) + ": " + counted + " on the shelf (was " + had + " on the list).";
      break;
    case "correct":
      it = find(op.id); if (!it) throw new Error("that item is no longer on the list");
      var q = whole(op.qty, -100000, 100000, "The correction");
      if (!q) throw new Error("the correction cannot be 0");
      invAppendMoves_([invMoveRow_({ item: it.id, kind: "correction", units: Math.abs(q), qty: q, by: by, note: note })]);
      said = label(it) + " " + (q > 0 ? "+" : "") + q + ".";
      break;
    case "undo":
      var mv = invMovesAll_().filter(function (m) { return m.id === String(op.moveId || ""); })[0];
      if (!mv) throw new Error("that entry is no longer in the ledger");
      if (["received", "count", "correction", "handuse", "rejected"].indexOf(mv.kind) < 0) throw new Error("a PTCA's own entries change only when the case is saved again or removed");
      invDeleteRows_([mv.row]);
      said = "Entry of " + mv.t + " undone.";
      break;
    case "use":
      // 13.45: taken off by hand — contrast, or anything used outside a PTCA's sheet
      it = find(op.id); if (!it) throw new Error("that item is no longer on the list");
      var nUse = whole(op.units, 1, 100000, "The number used");
      invAppendMoves_([invMoveRow_({ item: it.id, kind: "handuse", units: nUse, qty: -nUse, by: by, note: note || "used" })]);
      said = nUse + " × " + label(it) + " taken off.";
      break;
    case "sync":
      // 13.45: the department's devices put on the list once, and the stent
      // stickers' entries brought in line with the Stents tab
      var seeded = invSeed_(items, by);
      moves = invMovesAll_();
      var sy = invSyncStickers_(items, moves, by);
      try { var sbx = stentBoxUse_(by); if (sbx.taken || sbx.back) said = sbx.taken + " box(es) named by their stickers" + (sbx.back ? ", " + sbx.back + " put back" : "") + ". "; } catch (eB) {}
      said = (said || "") + (seeded ? seeded + " device(s) from the hardware list put on the inventory. " : "") +
        (sy.added || sy.removed ? "Stent stickers: " + sy.added + " taken off, " + sy.removed + " given back." : "Stent stickers are up to date.");
      break;
    case "reject":
      // a stent on the utilization sheet with no sticker: the technicians say it was not used
      var ck = cathStr_(op.caseKey, 120);
      if (!ck) throw new Error("which case?");
      it = invEnsure_(items, "stent", cathStr_(op.brand, 120) || "Stent", cathStr_(op.size, 60), by);
      invAppendMoves_([invMoveRow_({ item: it.id, kind: "rejected", units: 1, qty: 0, caseKey: ck, ptcaNo: cathStr_(op.ptcaNo, 40), patient: cathStr_(op.patient, 120),
        caseDate: cathStr_(op.caseDate, 10), raw: cathStr_(op.raw, 200), where: cathStr_(op.where, 60), by: by,
        note: "not used (no sticker)" + (note ? " — " + note : "") })]);
      said = label(it) + " for " + (op.patient || op.ptcaNo || "the case") + ": marked not used.";
      break;
    case "start":
      var d = String(op.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("give the date as yyyy-mm-dd");
      PropertiesService.getScriptProperties().setProperty("INV_START", d);
      said = "PTCAs done from " + d + " on are deducted (from the next save of each case).";
      break;
    default:
      throw new Error("unknown change " + op.op);
  }
  invWriteTab_(items);
  return Object.assign(invGet_({ item: req.item }), { said: said });
}

/* ---------------- stent stickers ---------------- */
var STENT_TAB = "Stents", STENT_UP_TAB = "Stent uploads";
var STENT_IN_DEFAULT = "Used stents upload", STENT_DONE_DEFAULT = "Used stents processed";
var STENT_IN_OLD = "Stents uploads", STENT_DONE_OLD = "Stents scanned";          // names before 13.48: renamed on the first run
/* 13.48: photos of stock RECEIVED (stent boxes, other devices) go in their own
   folder; each sticker read there is added to the inventory, never taken off */
var INVUP_IN_DEFAULT = "Stock in upload", INVUP_DONE_DEFAULT = "Stock in processed";
var STENT_KEEP_DEFAULT = 200;
var STENT_HEAD = ["Sticker id", "Upload id", "Patient", "PTCA / Cath No", "IP No", "Date", "Device", "Brand", "Manufacturer", "Size",
  "Diameter (mm)", "Length (mm)", "REF", "LOT", "Serial No", "Expiry", "Mfg date", "GTIN", "Barcode / QR text", "Other",
  "Unsure", "Photo", "Scanned at", "Read by", "Bill no", "Bill date", "Vendor", "Billed at", "Billed by", "Edited", "Notes", "File id", "Photo removed", "Scanned barcode"];
var STENT_UP_HEAD = ["Upload id", "Status", "File", "File id", "Uploaded", "Scanned at", "Stickers", "Patient", "Number",
  "Errors", "Log", "Tries", "Read by", "Photo removed", "By", "Purpose", "Folder", "Result"];
/* the fields of a sticker row as the app knows them (index = column) */
var STENT_KEYS = ["id", "up", "patient", "ptcaNo", "ipNo", "date", "device", "brand", "mfr", "size", "dia", "len", "ref", "lot", "serial",
  "expiry", "mfg", "gtin", "codes", "other", "unsure", "photo", "scannedAt", "readBy", "billNo", "billDate", "vendor", "billedAt", "billedBy",
  "edited", "notes", "fileId", "photoGone", "scan"];
var STENT_EDITABLE = ["patient", "ptcaNo", "ipNo", "date", "device", "brand", "mfr", "size", "dia", "len", "ref", "lot", "serial", "expiry", "mfg", "gtin", "codes", "other", "notes"];
function stentKeepN_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty("STENT_KEEP"));
  return isFinite(v) && v >= 20 ? Math.round(v) : STENT_KEEP_DEFAULT;
}
function stentTab_() { var sh = sheet(STENT_TAB, STENT_HEAD); ensureCols(sh, STENT_HEAD.length); return sh; }
function stentUpTab_() { var sh = sheet(STENT_UP_TAB, STENT_UP_HEAD); ensureCols(sh, STENT_UP_HEAD.length); return sh; }

/* What the scanner asks Gemini about a photo of stickers. Kept here, not in
   the app: only the sheet's script ever reads these photos. */
var STENT_PROMPT = "You are reading a photograph (or scan) taken in the cardiac catheterisation laboratory of the Department of Cardiology, LTMG Hospital, Sion, Mumbai. " +
  "A technician has HANDWRITTEN a patient's details on a sheet of paper — the patient's name, the PTCA / Cath number, sometimes the IP number and the date — " +
  "and stuck beside them the peel-off labels (\"stickers\") from the boxes of the devices used for that patient: mostly coronary stents, sometimes balloons, drug-coated balloons or other devices.\n\n" +
  "Every manufacturer prints its own label (Abbott, Medtronic, Boston Scientific, Terumo, Meril, SMT, Sahajanand, Translumina, Biotronik, MicroPort and others), so find each field by its printed label or symbol, wherever it is on the sticker:\n" +
  "- device: Stent, Balloon, DCB (drug-coated / drug-eluting balloon) or Other.\n" +
  "- brand: the product name as printed (for example XIENCE Alpine, Resolute Onyx, Ultimaster Tansei, BioMime Aura, Supraflex Cruz, Yukon Choice PC); the company goes in manufacturer.\n" +
  "- size: diameter × length as printed (\"3.00 x 38 mm\", \"Ø 2.75 mm / L 28 mm\"); also diameter and length as plain numbers in mm.\n" +
  "- ref: REF, Cat. No., Catalogue No., Model or Product code, or the REF symbol.\n" +
  "- lot: LOT, Lot No., Batch, Batch No. or B.No., or the LOT symbol (a small box with LOT in it).\n" +
  "- serial: SN, S/N or Serial No., or the SN symbol — only when printed.\n" +
  "- expiry: Use by, Exp. or Expiry, or the hourglass symbol — as printed. mfgDate: Mfg. / Manufactured, or the factory symbol with a date — as printed.\n" +
  "- gtin: a GTIN / UDI-DI number printed on its own (often after GTIN or (01)).\n" +
  "- codes: every line of characters printed under or beside a barcode, a QR code or a Data Matrix square, copied exactly, for example \"(01)08717648200274(17)270930(10)0012345678\". Copy only text that is printed; never decode the bars or squares yourself.\n" +
  "- other: any other number printed that identifies the unit.\n\n" +
  "Rules:\n" +
  "- One entry per sticker, in reading order (top to bottom, left to right), even when two stickers look identical — two stents of the same size and lot are two entries.\n" +
  "- Copy letters and digits exactly, never guess. Mark a character you cannot read with \"?\". Leave a field empty when it is not on the sticker.\n" +
  "- The patient's details are handwritten on the sheet, not printed on the stickers. If the photo holds two or more patients' sheets, give each its own entry in sheets.\n\n" +
  "Return ONLY minified JSON, no fences:\n" +
  "{\"sheets\":[{\"patient\":{\"name\":\"\",\"ptcaNo\":\"\",\"ipNo\":\"\",\"date\":\"\"},\"stickers\":[{\"device\":\"Stent\",\"brand\":\"\",\"manufacturer\":\"\",\"size\":\"\",\"diameter\":\"\",\"length\":\"\",\"ref\":\"\",\"lot\":\"\",\"serial\":\"\",\"expiry\":\"\",\"mfgDate\":\"\",\"gtin\":\"\",\"codes\":[\"\"],\"other\":\"\"}]}]}";
var BILL_PROMPT = "You are reading a photograph of a bill, invoice, delivery challan or consumption form for coronary devices (stents, balloons and other cath-lab hardware) supplied to the Department of Cardiology, LTMG Hospital, Sion, Mumbai. " +
  "A device's peel-off label may be stuck on it, or the photo may be of such a label alone.\n\n" +
  "Read:\n" +
  "- bill: number (Invoice / Bill / Challan No.), date, vendor (the company that issued it), patient (the patient's name, when written), ipNo, ptcaNo (PTCA / Cath No., when written), amount (the grand total).\n" +
  "- items: one entry per device line, and one per stuck-on label: device (Stent, Balloon, DCB or Other), brand (the product name), description (the line as written), " +
  "size (diameter × length) with diameter and length as plain numbers in mm, ref (REF / Cat. No. / Model / Product code), lot (LOT / Batch / B.No.), serial (SN), expiry, gtin, " +
  "codes (every line of characters printed under or beside a barcode or QR code, copied exactly), qty, amount.\n\n" +
  "Rules: copy letters and digits exactly, never guess; mark a character you cannot read with \"?\"; leave a field empty when it is not there. Never decode the bars of a barcode yourself — only copy text that is printed.\n\n" +
  "Return ONLY minified JSON, no fences:\n" +
  "{\"bill\":{\"number\":\"\",\"date\":\"\",\"vendor\":\"\",\"patient\":\"\",\"ipNo\":\"\",\"ptcaNo\":\"\",\"amount\":\"\"},\"items\":[{\"device\":\"Stent\",\"brand\":\"\",\"description\":\"\",\"size\":\"\",\"diameter\":\"\",\"length\":\"\",\"ref\":\"\",\"lot\":\"\",\"serial\":\"\",\"expiry\":\"\",\"gtin\":\"\",\"codes\":[\"\"],\"qty\":\"\",\"amount\":\"\"}]}";

/* 13.49 — photos of stock on the shelf: every BOX is a row of "Stock boxes",
   with its LOT, REF, expiry and barcode text, so a box photographed twice
   is counted once, a bill can be matched to it, and a box later used (its
   sticker read) is known. */
var BOX_TAB = "Stock boxes";
var BOX_HEAD = ["Box id", "Upload id", "Photo", "File id", "Status", "Why", "Kind", "Brand", "Manufacturer", "Diameter (mm)", "Length (mm)",
  "REF", "LOT", "Serial No", "Expiry", "GTIN", "Barcode text", "Place in photo", "Item id", "Same as", "Read at", "Read by", "Checked by", "Checked at",
  "Size", "Area in photo", "Used in", "Scanned barcode"];
var BOX_KEYS = ["id", "up", "photo", "fileId", "status", "why", "kind", "brand", "mfr", "dia", "len", "ref", "lot", "serial", "expiry", "gtin",
  "codes", "place", "item", "same", "readAt", "readBy", "checkedBy", "checkedAt", "size", "area", "usedIn", "scan"];
/* status: "in stock" (counted), "repeat" (the same box seen before — not
   counted), "check" (not read well enough — not counted until fixed),
   "discarded" (not a device / a mistake — never counted) */
function boxTab_() { var sh = sheet(BOX_TAB, BOX_HEAD); ensureCols(sh, BOX_HEAD.length); return sh; }
function boxRowsAll_() {
  var sh = boxTab_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, BOX_HEAD.length).getValues().map(function (v, i) {
    var o = { row: i + 2 };
    BOX_KEYS.forEach(function (k, c) { o[k] = cell(v[c]); });
    return o;
  }).filter(function (o) { return o.id; });
}
function boxVals_(b) { return BOX_KEYS.map(function (k) { return String(b[k] == null ? "" : b[k]); }); }
function boxAppend_(list) {
  if (!list.length) return;
  var sh = boxTab_(), at = sh.getLastRow() + 1;
  sh.getRange(at, 1, list.length, BOX_HEAD.length).setNumberFormat("@").setValues(list.map(boxVals_));
  list.forEach(function (b, i) { b.row = at + i; });
}
function boxWrite_(b) { boxTab_().getRange(b.row, 1, 1, BOX_HEAD.length).setNumberFormat("@").setValues([boxVals_(b)]); }
function boxDeleteRows_(rowNums) {
  if (!rowNums.length) return;
  var sh = boxTab_(), r = rowNums.slice().sort(function (a, c) { return c - a; }), i = 0;
  while (i < r.length) { var end = r[i], start = end; while (i + 1 < r.length && r[i + 1] === start - 1) { i++; start = r[i]; } sh.deleteRows(start, end - start + 1); i++; }
}
var STOCK_PROMPT = "You are reading a photograph taken in the cardiac catheterisation laboratory store of the Department of Cardiology, LTMG Hospital, Sion, Mumbai. " +
  "It shows BOXES of coronary devices — drug-eluting stents, balloons (NC, semi-compliant, drug-coated, cutting/scoring), guide wires, guide catheters, guide extensions, microcatheters and other hardware — " +
  "standing side by side with their narrow ends (spines) to the camera, or lying flat in a stack, or a single box label. A spine label prints the brand, the size (for a stent or balloon: the diameter " +
  "and the length in mm, e.g. \"2.75\" beside \"12\"; the shaft length such as \"145 cm\" is not the length), the expiry beside an hourglass, and usually a barcode with REF and LOT beside it and a line " +
  "of numbers under it such as \"(01)08717648205538(17)290610(10)6061841(91)5073\". Some brands print no LOT but a long number of the box's own under the barcode (e.g. \"133329072026H0337014\") — that is its serial.\n\n" +
  "FOREGROUND ONLY: read the boxes the photo was taken of — the nearest stack or row, large, in focus and readable. Boxes behind them, on another shelf, out of focus or tiny are BACKGROUND: " +
  "give each background box (or each background group of the same brand) one entry with background:true and only what you can see of it; do not read their numbers.\n\n" +
  "For every foreground box, one entry (top to bottom for a stack, left to right for a row):\n" +
  "- device: Stent, Balloon, DCB (drug-coated balloon), Cutting balloon, Guide wire, Guide catheter, Guide extension, Microcatheter, Aspiration catheter or Other. " +
  "A product called a \"Dilatation Catheter\" or \"Balloon Catheter\" is a Balloon.\n" +
  "- brand: the product name as printed (Xience Alpine, NC Trek, Mini Trek, Tanzor NC, NC Rockstar…); manufacturer: the company.\n" +
  "- diameter and length (stents and balloons): plain numbers in mm. size (anything else): as printed, e.g. \"6F XB 3.5\", \"0.014 x 180 cm\".\n" +
  "- ref, lot, serial (the box's own number when there is no LOT), expiry (as printed), gtin (after (01)), codes (the line under the barcode, exactly, with brackets).\n" +
  "- place: where it is, e.g. \"stack, box 3 from the top\", \"row 1, box 7 from the left\", \"lying on top\".\n" +
  "- box_2d: where the box's label is in the photo, as [ymin, xmin, ymax, xmax] scaled 0-1000.\n" +
  "- partial: true when the box is cut off by the edge of the photo, or its size or LOT is hidden.\n\n" +
  "Rules: one entry per physical box — two boxes of the same size are two entries, never the same box twice. Copy letters and digits exactly, never guess; mark an unreadable character \"?\"; " +
  "leave a field empty when you cannot see it. The LOT and the number after (10) are the same; the expiry and the number after (17) (YYMMDD) are the same date.\n\n" +
  "Return ONLY minified JSON, no fences:\n" +
  "{\"boxes\":[{\"device\":\"\",\"brand\":\"\",\"manufacturer\":\"\",\"diameter\":\"\",\"length\":\"\",\"size\":\"\",\"ref\":\"\",\"lot\":\"\",\"serial\":\"\",\"expiry\":\"\",\"gtin\":\"\",\"codes\":[\"\"],\"place\":\"\",\"box_2d\":[0,0,0,0],\"partial\":false,\"background\":false}]}";

/* GS1 — the numbers under a medical device's barcode: "(01)…(17)…(10)…(21)…"
   as printed, or the raw data a scanner gives ("]d2" + digits, fields of
   varying length ended by the group separator \u001d). Returns { "01": …,
   "10": …, … } or null. */
var GS1_FIXED_ = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
var GS1_VAR_ = { "10": 20, "21": 20, "22": 20, "30": 8, "240": 30, "241": 30, "250": 30 };
function gs1Parse_(text) {
  var s = String(text == null ? "" : text);
  var out = {}, m;
  if (/\(\d{2,4}\)/.test(s)) {
    var re = /\((\d{2,4})\)\s*([^()]*)/g;
    while ((m = re.exec(s))) { var v = m[2].replace(/[\u001d\s]+$/, "").replace(/^\s+/, ""); if (v && out[m[1]] == null) out[m[1]] = v; }
  } else {
    s = s.replace(/^\][A-Za-z]\d/, "").replace(/^\u001d+/, "");
    if (!/^\d{4}/.test(s)) return null;
    var i = 0, guard = 0;
    while (i < s.length && guard++ < 20) {
      if (s.charAt(i) === "\u001d") { i++; continue; }
      var a2 = s.substr(i, 2), a3 = s.substr(i, 3);
      if (GS1_FIXED_[a2] != null) { out[a2] = s.substr(i + 2, GS1_FIXED_[a2]); i += 2 + GS1_FIXED_[a2]; continue; }
      var ai = GS1_VAR_[a3] != null ? a3 : GS1_VAR_[a2] != null ? a2 : "";
      if (!ai) break;
      var st = i + ai.length, end = s.indexOf("\u001d", st);
      if (end < 0) end = s.length;
      out[ai] = s.slice(st, Math.min(end, st + GS1_VAR_[ai]));
      i = end;
    }
  }
  return Object.keys(out).length ? out : null;
}
function gs1Date_(yymmdd) {
  var m = /^(\d{2})(\d{2})(\d{2})$/.exec(String(yymmdd || ""));
  if (!m) return "";
  return "20" + m[1] + "-" + m[2] + (m[3] === "00" ? "" : "-" + m[3]);
}
function stentNum_(v) { var m = /\d+(?:\.\d+)?/.exec(String(v == null ? "" : v).replace(",", ".")); return m ? String(Number(m[0])) : ""; }
function stentDevice_(d) {
  var r = String(d || "").toLowerCase();
  if (/dcb|deb|drug.*(coat|elut).*bal|bal.*drug/.test(r)) return "DCB";
  if (/stent|scaffold|\bdes\b/.test(r)) return "Stent";
  if (/bal+oon/.test(r)) return "Balloon";
  return r ? "Other" : "Stent";
}
/* one sticker (or one line of a bill) as read, tidied: diameter and length
   from the size, GTIN / lot / serial / expiry from the barcode text when the
   sticker does not print them on their own */
function stentNormItem_(s) {
  s = s && typeof s === "object" ? s : {};
  var o = { device: stentDevice_(s.device || s.type), brand: cathStr_(s.brand, 120), mfr: cathStr_(s.manufacturer || s.mfr, 80),
    size: cathStr_(s.size, 60), dia: stentNum_(s.diameter), len: stentNum_(s.length), ref: cathStr_(s.ref, 60), lot: cathStr_(s.lot, 60),
    serial: cathStr_(s.serial, 60), expiry: cathStr_(s.expiry, 30), mfg: cathStr_(s.mfgDate || s.mfg, 30), gtin: cathStr_(s.gtin, 40),
    codes: (Array.isArray(s.codes) ? s.codes : s.codes ? [s.codes] : []).map(function (c) { return cathStr_(c, 200); }).filter(Boolean).slice(0, 8),
    other: cathStr_(s.other, 200), description: cathStr_(s.description, 200), qty: cathStr_(s.qty, 10), amount: cathStr_(s.amount, 30) };
  if ((!o.dia || !o.len) && o.size) {
    var sz = /(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:[x×*\/]|by)\s*(?:l\s*)?(\d+(?:[.,]\d+)?)/i.exec(o.size);
    if (sz) { if (!o.dia) o.dia = stentNum_(sz[1]); if (!o.len) o.len = stentNum_(sz[2]); }
  }
  o.codes.forEach(function (c) {
    var g = gs1Parse_(c);
    if (!g) return;
    if (!o.gtin && g["01"]) o.gtin = g["01"];
    if (!o.lot && g["10"]) o.lot = g["10"];
    if (!o.serial && g["21"]) o.serial = g["21"];
    if (!o.expiry && g["17"]) o.expiry = gs1Date_(g["17"]);
    if (!o.mfg && g["11"]) o.mfg = gs1Date_(g["11"]);
    if (!o.ref && g["240"]) o.ref = g["240"];
  });
  var unsure = [];
  ["brand", "size", "ref", "lot", "serial", "expiry", "gtin"].forEach(function (k) { if (String(o[k]).indexOf("?") >= 0) unsure.push(k); });
  o.unsure = unsure.join(", ");
  return o;
}
/* a photo's reading → [{ patient, stickers: [...] }] */
function stentNormRead_(j) {
  j = j && typeof j === "object" ? j : {};
  var sheets = Array.isArray(j.sheets) ? j.sheets : (j.patient || j.stickers ? [j] : []);
  return sheets.map(function (sh) {
    sh = sh && typeof sh === "object" ? sh : {};
    var p = sh.patient && typeof sh.patient === "object" ? sh.patient : {};
    return { patient: { name: cathStr_(p.name, 120), ptcaNo: cathStr_(p.ptcaNo || p.cathNo || p.number, 40), ipNo: cathStr_(p.ipNo, 40), date: cathStr_(p.date, 30) },
      stickers: (Array.isArray(sh.stickers) ? sh.stickers : []).map(stentNormItem_).filter(function (s) {
        return s.brand || s.lot || s.ref || s.serial || s.gtin || s.codes.length || s.size; }) };
  });
}
function stentRowOf_(id, up, p, s, photo, fileId, readBy) {
  var size = s.dia && s.len ? s.dia + " × " + s.len + " mm" : s.size;
  var o = { id: id, up: up, patient: p.name, ptcaNo: p.ptcaNo, ipNo: p.ipNo, date: p.date, device: s.device, brand: s.brand, mfr: s.mfr, size: size,
    dia: s.dia, len: s.len, ref: s.ref, lot: s.lot, serial: s.serial, expiry: s.expiry, mfg: s.mfg, gtin: s.gtin, codes: s.codes.join("\n"), other: s.other,
    unsure: s.unsure, photo: photo || "", scannedAt: cathNow_(), readBy: readBy || "", billNo: "", billDate: "", vendor: "", billedAt: "", billedBy: "",
    edited: "", notes: "", fileId: fileId || "", photoGone: "", scan: s.scan || "" };
  return STENT_KEYS.map(function (k) { return String(o[k] == null ? "" : o[k]); });
}
function stentRowsAll_() {
  var sh = stentTab_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, STENT_HEAD.length).getValues().map(function (v, i) {
    var o = { row: i + 2 };
    STENT_KEYS.forEach(function (k, c) { o[k] = cell(v[c]); });
    return o;
  }).filter(function (o) { return o.id; });
}
function stentWriteRows_(rows) {
  if (!rows.length) return;
  var sh = stentTab_();
  var at = sh.getLastRow() + 1;
  sh.getRange(at, 1, rows.length, STENT_HEAD.length).setNumberFormat("@").setValues(rows);
}
/* the uploads tab: one row per photo */
function stentUpRows_() {
  var sh = stentUpTab_();
  var rows = [];
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, STENT_UP_HEAD.length).getValues().forEach(function (v, i) {
      if (!cell(v[0])) return;
      var errs = []; try { errs = JSON.parse(cell(v[9]) || "[]") || []; } catch (e) { errs = cell(v[9]) ? [cell(v[9])] : []; }
      rows.push({ row: i + 2, id: cell(v[0]), status: cell(v[1]), file: cell(v[2]), fileId: cell(v[3]), uploaded: cell(v[4]), scannedAt: cell(v[5]),
        stickers: Number(v[6]) || 0, patient: cell(v[7]), number: cell(v[8]), errors: errs, log: cell(v[10]), tries: Number(v[11]) || 0,
        readBy: cell(v[12]), photoGone: cell(v[13]), by: cell(v[14]), purpose: UP_PURPOSES[cell(v[15])] ? cell(v[15]) : "used",
        folder: cell(v[16]), result: (function () { try { return JSON.parse(cell(v[17]) || "null"); } catch (e) { return null; } })() });
    });
  }
  var byId = {}, byFile = {};
  rows.forEach(function (r) { byId[r.id] = r; if (r.fileId) byFile[r.fileId] = r; });
  return { rows: rows, byId: byId, byFile: byFile };
}
function stentUpWrite_(r) {
  var sh = stentUpTab_();
  var vals = [r.id, r.status, r.file || "", r.fileId || "", r.uploaded || "", r.scannedAt || "", r.stickers || 0, r.patient || "", r.number || "",
    JSON.stringify(r.errors || []).slice(0, 20000), String(r.log || "").slice(-20000), r.tries || 0, r.readBy || "", r.photoGone || "", r.by || "", UP_PURPOSES[r.purpose] ? r.purpose : "used",
    r.folder || "", r.result ? JSON.stringify(r.result).slice(0, 5000) : ""];
  // formatted as text before the values go in, so a time is never turned into a date
  if (!r.row) r.row = sh.getLastRow() + 1;
  var rg = sh.getRange(r.row, 1, 1, STENT_UP_HEAD.length);
  rg.setNumberFormat("@");
  rg.setValues([vals.map(function (v) { return String(v == null ? "" : v); })]);
  try { SpreadsheetApp.flush(); } catch (e) {}
}
function stentNote_(r, runId, step, outcome, detail) {
  var t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
  r.log = (r.log ? r.log + "\n" : "") + t + " " + step + ": " + outcome + (detail ? " — " + detail : "");
  batchLogRow_(runId, r.id, r.file, "stent photo · " + step, outcome, detail);
}
function stentPhotoUrl_(fileId) { return fileId ? "https://drive.google.com/file/d/" + fileId + "/view" : ""; }
/* the photos waiting in Stents uploads become rows of the uploads tab */
var UP_PURPOSES = { used: 1, stock: 1, day: 1, weekly: 1 };   // 13.50: day = instruments used that day; weekly = the weekly shelf photos
function stentTakeNew_(f, tab, manual, purpose, onlyFile) {
  var stock = purpose !== "used";
  var minAge = manual ? 20 * 1000 : BATCH_MIN_AGE_MS;
  var now = Date.now(), fresh = [];
  // 13.50: a stock photo may sit in Inventory uploads itself or in one of its
  // instrument folders (Stents, Balloons, …); the folder is kept with it
  var sources = [{ folder: purpose === "day" ? f.usedIn : purpose === "weekly" ? f.weeklyIn : stock ? f.invIn : f.stentsIn, kind: "" }];
  if (purpose === "stock") { var kf = invKindFolders_(f); INV_KIND_ORDER.forEach(function (k) { if (kf[k]) sources.push({ folder: kf[k].inF, kind: k }); }); }
  sources.forEach(function (src) {
    var it = src.folder.getFiles();
    while (it.hasNext()) {
      var file = it.next();
      var mime = String(file.getMimeType() || "").toLowerCase();
      var ok = mime === "application/pdf" || /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime);
      if (!ok || tab.byFile[file.getId()]) continue;
      if (onlyFile && file.getId() !== onlyFile) continue;      // 13.51: one photo read from its barcodes at once
      if (!onlyFile && now - file.getLastUpdated().getTime() < minAge) continue;
      fresh.push({ file: file, t: file.getDateCreated().getTime(), kind: src.kind });
    }
  });
  fresh.sort(function (a, b) { return a.t - b.t; });
  return fresh.map(function (x) {
    var stem = String(x.file.getName()).replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    var id = ({ stock: "IN", day: "DU", weekly: "WK" }[purpose] || "ST") + Utilities.formatDate(new Date(x.t), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + (stem ? "-" + stem : "");
    var n = 2; while (tab.byId[id]) id = id.replace(/~\d+$/, "") + "~" + (n++);
    var r = { id: id, status: "queued", file: x.file.getName(), fileId: x.file.getId(),
      uploaded: Utilities.formatDate(new Date(x.t), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"), errors: [], log: "", tries: 0, row: 0, purpose: purpose, folder: x.kind || "" };
    stentUpWrite_(r);
    tab.rows.push(r); tab.byId[id] = r; tab.byFile[r.fileId] = r;
    return r;
  });
}
/* One run's share of the stent photos: new ones taken in, every queued one
   read in turn with the usual pause, its stickers written to the Stents tab
   and the photo moved to Stents scanned. Returns what happened. */
function stentTick_(f, models, key, runId, manual, pause, timeLeft) {
  var out = { scanned: 0, failed: 0, stickers: 0, pending: 0, stopped: false, why: "", taken: 0 };
  var tab = stentUpRows_();
  out.taken = stentTakeNew_(f, tab, manual, "used").length;
  var work = tab.rows.filter(function (r) { return r.status === "queued" && r.purpose === "used"; });
  if (work.length) batchLogRow_(runId, "", "", "stent photos", "started", work.length + " photo(s) to read");
  for (var i = 0; i < work.length; i++) {
    if (timeLeft() < 100000) { out.pending = work.length - i; out.why = "time budget used; the other stent photos continue next run"; break; }
    var r = work[i];
    var file = null;
    try { file = DriveApp.getFileById(r.fileId); if (file.isTrashed()) file = null; } catch (e) { file = null; }
    if (!file) { r.status = "failed"; r.errors = [{ step: "file", reason: "the photo is no longer in Drive" }]; stentNote_(r, runId, "file", "failed", "the photo is no longer in Drive"); stentUpWrite_(r); out.failed++; continue; }
    if (file.getSize() > BATCH_MAX_FILE) { r.status = "failed"; r.errors = [{ step: "file", reason: "larger than 20 MB, which Gemini will not accept — upload it smaller" }]; stentNote_(r, runId, "file", "failed", "larger than 20 MB"); stentFinishMove_(f, file, r, runId); stentUpWrite_(r); out.failed++; continue; }
    var mime = String(file.getMimeType() || "").toLowerCase();
    var item = { file: file, name: r.file, mime: mime === "image/jpg" ? "image/jpeg" : mime, isPdf: mime === "application/pdf" };
    var res = photoRead_(r, STENT_PROMPT, item, models, key, runId, pause, timeLeft);
    if (res.waiting) { out.waiting = (out.waiting || 0) + 1; continue; }
    if (res.quota && !res.ok) { out.stopped = true; out.why = res.reason; stentNote_(r, runId, "reading", "stopped", res.reason); stentUpWrite_(r); break; }
    r.tries = (r.tries || 0) + 1;
    if (!res.ok && res.retry && r.tries < BATCH_MAX_TRIES) { stentNote_(r, runId, "reading", "will retry", res.reason + " — tried again next run"); stentUpWrite_(r); pause(); continue; }
    if (!res.ok) {
      r.status = "failed"; r.errors = [{ step: "reading", reason: res.reason }];
      stentNote_(r, runId, "reading", "failed", res.reason); stentFinishMove_(f, file, r, runId); stentUpWrite_(r); out.failed++; pause(); continue;
    }
    var sheets = stentNormRead_(res.json);
    var n = 0; sheets.forEach(function (s) { n += s.stickers.length; });
    var scanNote = "";
    try {
      var scS = photoCodesOf_(r.fileId);
      if (scS.length && n) {
        var at = stentAttachScan_(sheets, scS, boxCatalog_(boxRowsAll_()));
        scanNote = at.matched + " barcode(s) matched to stickers" + (at.fixed.length ? "; LOT corrected by the barcode: " + at.fixed.join(", ") : "");
        if (at.left.length) scanNote += "; barcode with no sticker read: " + at.left.join(", ");
        r.codesLeft = at.left;
      }
    } catch (eS) {}
    if (!n) {
      r.status = "failed"; r.errors = [{ step: "reading", reason: "no sticker could be read on this photo — photograph the stickers flat and close, then upload again" }];
      stentNote_(r, runId, "reading", "failed", "no sticker found"); stentFinishMove_(f, file, r, runId); stentUpWrite_(r); out.failed++; pause(); continue;
    }
    // a photo read again replaces its earlier stickers
    var olds = stentRowsAll_().filter(function (x) { return x.up === r.id; }).map(function (x) { return x.row; });
    if (olds.length) stentDeleteRows_(olds);
    var rows = [], k = 0, photo = stentPhotoUrl_(r.fileId);
    sheets.forEach(function (s) { s.stickers.forEach(function (st) { k++; rows.push(stentRowOf_(r.id + "-" + k, r.id, s.patient, st, photo, r.fileId, res.model || "")); }); });
    stentWriteRows_(rows);
    r.status = "scanned"; r.stickers = n; r.readBy = res.model || "";
    r.errors = r.codesLeft && r.codesLeft.length ? [{ step: "barcodes", reason: "a barcode on this photo matches no sticker read — check the page: " + r.codesLeft.join(", ") }] : [];
    if (scanNote) stentNote_(r, runId, "barcodes", r.codesLeft && r.codesLeft.length ? "check" : "ok", scanNote);
    r.patient = sheets.map(function (s) { return s.patient.name; }).filter(Boolean).join("; ");
    r.number = sheets.map(function (s) { return s.patient.ptcaNo; }).filter(Boolean).join("; ");
    r.scannedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    stentNote_(r, runId, "reading", "ok", n + " sticker(s)" + (r.patient ? " · " + r.patient : "") + (r.number ? " · " + r.number : "") + (res.via ? " (via " + res.via + ")" : ""));
    stentFinishMove_(f, file, r, runId);
    stentUpWrite_(r);
    out.scanned++; out.stickers += n;
    pause();
  }
  if (out.scanned) { try { invAfterSticker_("stent photos"); } catch (eA) {} }
  if (out.scanned || out.failed) {
    try { var hk = stentHousekeep_(f, runId); if (hk) out.why = (out.why ? out.why + "; " : "") + hk; }
    catch (e) { batchLogRow_(runId, "", "", "stent housekeeping", "failed", String(e && e.message || e)); }
    try { costTrim_(); } catch (eC) {}
  }
  if (out.scanned || out.failed || out.stopped) {
    try { PropertiesService.getScriptProperties().setProperty("STENT_LAST", JSON.stringify({ at: new Date().toISOString(), scanned: out.scanned, failed: out.failed, stickers: out.stickers, why: out.why })); } catch (e) {}
  }
  return out;
}
function stentFinishMove_(f, file, r, runId) {
  try { file.moveTo(f.stentsDone); }
  catch (e) { stentNote_(r, runId, "move", "failed", "could not move the photo to " + STENT_DONE_DEFAULT + ": " + String(e && e.message || e)); }
}
function stentDeleteRows_(rowNums) {
  var sh = stentTab_();
  rowNums.slice().sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
}
/* 13.52 — the photos once read (used stents, stock in, stock out) are kept
   six months at full quality, then six months more as a smaller,
   lower-quality copy (the same Drive file, so every link to it still works),
   and are then deleted. What was read from them stays in the sheet. Runs at
   most once a day, a few photos at a time. */
var PHOTO_FULL_DAYS = 183, PHOTO_LOW_DAYS = 365, PHOTO_LOW_PX = 1280, PHOTO_LOW_TAG = "low quality copy (13.52)";
function stentHousekeep_(f, runId) {
  var pr = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (pr.getProperty("PHOTO_AGE_DAY") === day) return "";
  pr.setProperty("PHOTO_AGE_DAY", day);
  var now = Date.now(), files = [];
  var walk = function (fo, depth) {
    var it = fo.getFiles();
    while (it.hasNext()) { var x = it.next(); if (/^image\//.test(x.getMimeType())) files.push(x); }
    if (depth < 2) { var sub = fo.getFolders(); while (sub.hasNext()) walk(sub.next(), depth + 1); }
  };
  [f.stentsDone, f.invDone, f.usedDone].forEach(function (fo) { try { walk(fo, 0); } catch (e) {} });
  var gone = {}, low = 0, failed = 0, budget = 25;
  files.forEach(function (x) {
    var age = (now - x.getDateCreated().getTime()) / 864e5;
    try {
      if (age > PHOTO_LOW_DAYS) { x.setTrashed(true); gone[x.getId()] = true; }
      else if (age > PHOTO_FULL_DAYS && budget > 0 && String(x.getDescription() || "").indexOf(PHOTO_LOW_TAG) < 0) {
        budget--; if (photoShrink_(x)) low++; else failed++;
      }
    } catch (e) { failed++; }
  });
  photoMarkGone_(gone, day);
  var n = Object.keys(gone).length;
  if (!n && !low && !failed) return "";
  var note = "photos: " + [low ? low + " older than 6 months made a smaller copy" : "", n ? n + " older than a year deleted (what was read stays in the sheet)" : "",
    failed ? failed + " could not be changed (owned by another account?)" : ""].filter(Boolean).join("; ");
  batchLogRow_(runId, "", "", "photo housekeeping", "ok", note);
  return note;
}
/* the photo replaced, in place, by a JPEG at most PHOTO_LOW_PX on its long side (Drive's own preview of it) */
function photoShrink_(file) {
  var tok = ScriptApp.getOAuthToken(), id = file.getId();
  var meta = JSON.parse(UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + id + "?fields=thumbnailLink&supportsAllDrives=true",
    { headers: { Authorization: "Bearer " + tok } }).getContentText());
  if (!meta.thumbnailLink) return false;
  var r = UrlFetchApp.fetch(String(meta.thumbnailLink).replace(/=s\d+$/, "") + "=s" + PHOTO_LOW_PX, { headers: { Authorization: "Bearer " + tok }, muteHttpExceptions: true });
  var h = r.getHeaders(), ct = String(h["Content-Type"] || h["content-type"] || "");
  if (r.getResponseCode() !== 200 || !/^image\//.test(ct)) return false;
  var bytes = r.getContent();
  if (bytes.length >= file.getSize()) { file.setDescription(PHOTO_LOW_TAG + " — already small"); return true; }
  var up = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files/" + id + "?uploadType=media&supportsAllDrives=true",
    { method: "patch", contentType: ct.split(";")[0], payload: bytes, headers: { Authorization: "Bearer " + tok }, muteHttpExceptions: true });
  if (up.getResponseCode() !== 200) return false;
  DriveApp.getFileById(id).setDescription(PHOTO_LOW_TAG + " " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"));
  return true;
}
/* a deleted photo is marked "photo removed" where it is listed */
function photoMarkGone_(gone, day) {
  if (!Object.keys(gone).length) return;
  var tab = stentUpRows_();
  tab.rows.forEach(function (r) { if (gone[r.fileId] && !r.photoGone) { r.photoGone = day; stentUpWrite_(r); } });
  var sh = stentTab_();
  if (sh.getLastRow() >= 2) {
    var fc = STENT_KEYS.indexOf("fileId") + 1, gc = STENT_KEYS.indexOf("photoGone") + 1;
    var ids = sh.getRange(2, fc, sh.getLastRow() - 1, 1).getValues();
    var g = sh.getRange(2, gc, sh.getLastRow() - 1, 1).getValues();
    var changed = false;
    ids.forEach(function (v, i) { if (gone[String(v[0])] && !String(g[i][0])) { g[i][0] = day; changed = true; } });
    if (changed) sh.getRange(2, gc, g.length, 1).setNumberFormat("@").setValues(g);
  }
}
/* ---- what the app asks ---- */
/* 13.52: the used-stent stickers of one case — by its PTCA / Cath number
   (digits), else by the patient's name */
function caseStickers_(req) {
  var pn = String(req.ptcaNo || "").replace(/\D/g, ""), nm = String(req.name || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!pn && !nm) return { stickers: [] };
  var rows = stentRowsAll_().filter(function (o) {
    if (!invIsStentSticker_(o) || stentIsDiag_(o)) return false;   // the technicians' stickers only
    var sp = String(o.ptcaNo || "").replace(/\D/g, "");
    if (pn && sp) return invSameCase_(req.ptcaNo, o.ptcaNo);
    return !!nm && String(o.patient || "").toLowerCase().replace(/[^a-z]/g, "") === nm;
  });
  return { stickers: rows.map(function (o) { return { id: o.id, patient: o.patient, ptcaNo: o.ptcaNo, brand: o.brand, device: o.device, size: o.size, dia: o.dia, len: o.len, lot: o.lot, ref: o.ref, serial: o.serial, expiry: o.expiry, photo: o.photo }; }) };
}
function stentList_() {
  return { stents: stentRowsAll_().map(function (o) { var c = {}; STENT_KEYS.forEach(function (k) { c[k] = o[k]; }); return c; }) };
}
function stentStatus_() {
  var f = batchFolders_();
  var tab = stentUpRows_();
  var count = function (s) { return tab.rows.filter(function (r) { return r.status === s && r.purpose === "used"; }).length; };
  var waiting = 0; try { var it = f.stentsIn.getFiles(); while (it.hasNext()) { var x = it.next(); if (!tab.byFile[x.getId()]) waiting++; } } catch (e) {}
  var inDone = 0; try { var it2 = f.stentsDone.getFiles(); while (it2.hasNext()) { it2.next(); inDone++; } } catch (e) {}
  var last = null; try { last = JSON.parse(PropertiesService.getScriptProperties().getProperty("STENT_LAST") || "null"); } catch (e) {}
  var invWaiting = 0;
  [f.invIn, f.usedIn, f.weeklyIn].forEach(function (fo) { try { var it3 = fo.getFiles(); while (it3.hasNext()) { var y = it3.next(); if (!tab.byFile[y.getId()]) invWaiting++; } } catch (e) {} });
  try { var kf = invKindFolders_(f); INV_KIND_ORDER.forEach(function (k) { var it4 = kf[k].inF.getFiles(); while (it4.hasNext()) { var z = it4.next(); if (!tab.byFile[z.getId()]) invWaiting++; } }); } catch (e) {}
  // 13.50: "stock" here = every photo that is not a used-stent photo (stock, weekly, the day's used instruments)
  var cnt = function (s, p) { return tab.rows.filter(function (r) { return r.status === s && (r.purpose !== "used") === (p === "stock"); }).length; };
  var inQueue = tab.rows.filter(function (r) { return r.status === "queued" && r.result && r.result._job; }).length;
  return { invInUrl: f.invIn.getUrl(), invInName: f.invIn.getName(), invDoneUrl: f.invDone.getUrl(), invDoneName: f.invDone.getName(),
    invWaiting: invWaiting + cnt("queued", "stock"), invFailed: cnt("failed", "stock"), invScanned: cnt("scanned", "stock"),
    inUrl: f.stentsIn.getUrl(), doneUrl: f.stentsDone.getUrl(), inName: f.stentsIn.getName(), doneName: f.stentsDone.getName(),
    keep: stentKeepN_(), inDone: inDone, waiting: waiting + count("queued"), failed: count("failed"), scanned: count("scanned"),
    inQueue: inQueue, last: last, schedule: batchPlan_(), keySet: !!geminiKey_(), scheduled: batchTriggers_().length > 0 && !batchOff_() };
}
function stentUploads_() {
  var tab = stentUpRows_();
  return { uploads: tab.rows.slice(-300).reverse().map(function (r) {
    return { id: r.id, status: r.status, file: r.file, fileId: r.fileId, uploaded: r.uploaded, scannedAt: r.scannedAt, stickers: r.stickers,
      patient: r.patient, number: r.number, errors: r.errors, log: String(r.log || "").split("\n").slice(-12).join("\n"), tries: r.tries, readBy: r.readBy, photoGone: r.photoGone, by: r.by, purpose: r.purpose,
      inQueue: !!(r.result && r.result._job), queuedAt: r.result && r.result._job ? r.result._job.at : 0 };
  }), night: batchPlan_() };
}
/* a sticker row corrected, added by hand, marked billed, or deleted */
function stentSave_(req) {
  var by = cathStr_(req.by, 60), now = cathNow_();
  var sh = stentTab_();
  if (req.add && typeof req.add === "object") {
    var a = req.add;
    var s = stentNormItem_(a);
    var row = stentRowOf_(cathId_("SH"), "by hand", { name: cathStr_(a.patient, 120), ptcaNo: cathStr_(a.ptcaNo, 40), ipNo: cathStr_(a.ipNo, 40), date: cathStr_(a.date, 30) }, s, "", "", "");
    row[STENT_KEYS.indexOf("edited")] = "added by " + (by || "?") + " " + now;
    row[STENT_KEYS.indexOf("notes")] = cathStr_(a.notes, 300);
    stentWriteRows_([row]);
    invAfterSticker_(by);
    return { saved: row[0] };
  }
  var all = stentRowsAll_();
  var r = all.filter(function (x) { return x.id === String(req.id || ""); })[0];
  if (!r) throw new Error("that sticker is no longer in the sheet — refresh the list");
  if (req.remove) {
    if (r.billNo || r.billedAt) throw new Error("this sticker is marked billed — take the bill off it first");
    sh.deleteRow(r.row);
    invAfterSticker_(by);
    return { removed: r.id };
  }
  var vals = sh.getRange(r.row, 1, 1, STENT_HEAD.length).getValues()[0].map(cell);
  var set = req.set && typeof req.set === "object" ? req.set : null;
  var changed = [];
  if (set) {
    STENT_EDITABLE.forEach(function (k) {
      if (set[k] === undefined) return;
      var c = STENT_KEYS.indexOf(k), v = cathStr_(set[k], k === "codes" ? 1000 : 200);
      if (k === "codes") v = String(set[k] == null ? "" : set[k]).split(/\n+/).map(function (x) { return cathStr_(x, 200); }).filter(Boolean).join("\n");
      if (vals[c] !== v) { vals[c] = v; changed.push(k); }
    });
    // a corrected size gives its diameter and length; corrected barcode text its numbers
    if (changed.indexOf("size") >= 0 && changed.indexOf("dia") < 0 && changed.indexOf("len") < 0) {
      var n = stentNormItem_({ size: vals[STENT_KEYS.indexOf("size")] });
      vals[STENT_KEYS.indexOf("dia")] = n.dia; vals[STENT_KEYS.indexOf("len")] = n.len;
    }
    vals[STENT_KEYS.indexOf("unsure")] = ["brand", "size", "ref", "lot", "serial", "expiry", "gtin"].filter(function (k) { return vals[STENT_KEYS.indexOf(k)].indexOf("?") >= 0; }).join(", ");
    if (changed.length) vals[STENT_KEYS.indexOf("edited")] = (by || "?") + " " + now + " (" + changed.join(", ") + ")";
  }
  if (req.bill && typeof req.bill === "object") {
    vals[STENT_KEYS.indexOf("billNo")] = cathStr_(req.bill.no, 60);
    vals[STENT_KEYS.indexOf("billDate")] = cathStr_(req.bill.date, 30);
    vals[STENT_KEYS.indexOf("vendor")] = cathStr_(req.bill.vendor, 120);
    vals[STENT_KEYS.indexOf("billedAt")] = now;
    vals[STENT_KEYS.indexOf("billedBy")] = by;
    changed.push("bill");
  } else if (req.unbill) {
    ["billNo", "billDate", "vendor", "billedAt", "billedBy"].forEach(function (k) { vals[STENT_KEYS.indexOf(k)] = ""; });
    changed.push("bill taken off");
  }
  sh.getRange(r.row, 1, 1, STENT_HEAD.length).setNumberFormat("@").setValues([vals]);
  if (changed.length) invAfterSticker_(by);
  var o = {}; STENT_KEYS.forEach(function (k, i) { o[k] = vals[i]; });
  return { saved: r.id, changed: changed, stent: o };
}
/* 13.45: a sticker added, corrected or removed brings the inventory in line */
function invAfterSticker_(by) {
  try { var items = invItems_(); var mv = invMovesAll_(); var r = invSyncStickers_(items, mv, by); if (r.added || r.removed || items.some(function (x) { return x.isNew; })) invWriteTab_(items); }
  catch (e) { Logger.log("inventory after a sticker: " + e); }
  try { stentBoxUse_(by); } catch (e2) { Logger.log("sticker boxes: " + e2); }
}
/* ---- 13.60: a sticker's barcode takes off its very box ----
   The phone reads the barcodes on a sticker photo before it is made smaller
   (as on stock photos); when the stickers are read, each barcode is given to
   the sticker of the same LOT (or the same product, the LOT read one character
   off — a barcode is never misread, so it corrects the LOT). Its text is kept
   on the sticker ("Scanned barcode").
   Then every sticker — stents and every other device with a sticker — is
   matched to its box on the stock list: by the box's own number in the
   barcode ((91) Abbott, (93) Terumo, (21) / serial), else by LOT, size and
   brand among the boxes in stock that were photographed on or before the
   sticker's day. That box becomes "used", in that case. The counts do not
   change: a stent's sticker (and a device's utilization sheet line) takes it
   off; the box is only named. A sticker whose barcode names a box that is not
   in stock (returned, discarded, used in another case) is flagged. A box
   taken by a sticker that is later removed or corrected is put back. */
function stentAttachScan_(sheets, codes, cat) {
  var out = { matched: 0, fixed: [], left: [] };
  var cs = [];
  (codes || []).forEach(function (c) {
    var p = boxScanParse_(c && c.t);
    if (!p) return;
    if (cs.some(function (d) { return d.t === String(c.t) && Math.hypot(d.x - c.x, d.y - c.y) < 20; })) return;
    var k = boxProdKey_(c.t), v = k && cat ? cat[k] : null;
    cs.push({ t: String(c.t), x: Number(c.x) || 0, y: Number(c.y) || 0, p: p, v: v });
  });
  var sts = [];
  (sheets || []).forEach(function (s) { s.stickers.forEach(function (st) { sts.push(st); }); });
  var sizeOf = function (st) { return invSizeKey_(invStickerSize_(st)); };
  var prodOk = function (c, st) {
    if (c.p.gtin && st.gtin && /^\d{14}$/.test(String(st.gtin))) return c.p.gtin === String(st.gtin);
    if (c.v && (c.v.dia || c.v.size) && sizeOf(st)) return invSizeKey_(c.v.dia ? c.v.dia + "×" + c.v.len : c.v.size) === sizeOf(st);
    return true;
  };
  var lotOf = function (x) { return invNorm_(x.lot) || invNorm_(x.serial); };
  var pass = function (test) {
    cs.forEach(function (c) {
      if (c.done) return;
      var id = invNorm_(c.p.lot) || invNorm_(c.p.serial);
      var hit = sts.filter(function (st) { return !st.scan && test(c, st, id); });
      if (!hit.length) return;
      var st = hit[0];
      st.scan = c.t; c.done = true; out.matched++;
      if (c.p.lot && invNorm_(st.lot) !== invNorm_(c.p.lot)) { out.fixed.push((st.lot || "no LOT") + " → " + c.p.lot); st.lot = c.p.lot; }
      if (!st.gtin && c.p.gtin) st.gtin = c.p.gtin;
      if (!st.serial && c.p.serial) st.serial = c.p.serial;
      if (!st.expiry && c.p.exp) st.expiry = c.p.exp;
    });
  };
  pass(function (c, st, id) { return id && lotOf(st) === id && prodOk(c, st); });
  pass(function (c, st, id) { return id && lotOf(st) && boxEdit1_(lotOf(st), id) && prodOk(c, st) && (c.p.gtin && st.gtin || c.v); });
  pass(function (c, st, id) { return !lotOf(st) && c.v && prodOk(c, st); });
  cs.forEach(function (c) { if (!c.done) out.left.push(c.v ? [c.v.brand, c.v.dia ? c.v.dia + "×" + c.v.len : c.v.size, c.p.lot ? "LOT " + c.p.lot : ""].filter(Boolean).join(" ") : c.t); });
  return out;
}
function stentBoxUse_(by) {
  var all = stentRowsAll_(), boxes = boxRowsAll_();
  var list = stentCounted_(all).concat(all.filter(function (s) { return !invIsStentSticker_(s) && !stentIsDiag_(s) && (s.lot || s.scan || s.serial); }));
  var byKey = {}; list.forEach(function (s) { byKey["STICKER " + s.id] = s; });
  var upDay = {}; try { stentUpRows_().rows.forEach(function (r) { upDay[r.id] = String(r.uploaded || "").slice(0, 10); }); } catch (e) {}
  var dayOf = function (b) { return upDay[b.up] || String(b.readAt || "").slice(0, 10); };
  var unitOf = function (s) { var p = s.scan ? boxScanParse_(s.scan) : null; return p ? p.unit : ""; };
  var lotOf = function (x) { return invNorm_(x.lot) || invNorm_(x.serial); };
  var caseTxt = function (s) { return [s.ptcaNo ? "PTCA " + s.ptcaNo : "", s.patient].filter(Boolean).join(" · "); };
  var fits = function (s, b) {
    var u = unitOf(s), bu = boxScanUnit_(b);
    if (u && bu) return u === bu;
    if (!lotOf(s) || lotOf(b) !== lotOf(s)) return false;
    if (invIsStentSticker_(s)) {
      if ((b.kind || "stent") !== "stent") return false;
      if (invSizeKey_(boxSizeText_(b)) !== invSizeKey_(invStickerSize_(s))) return false;
      var sb = invNorm_(s.brand), bb = invNorm_(b.brand);
      return !sb || !bb || sb.indexOf(bb) >= 0 || bb.indexOf(sb) >= 0;
    }
    if (s.gtin && b.gtin) return String(s.gtin) === String(b.gtin);
    return (b.kind || "stent") !== "stent";
  };
  var changed = 0, taken = 0, back = 0, flags = [];
  var write = function (b) { if (b.row) boxWrite_(b); changed++; };
  // a box taken by a sticker that is gone, or no longer fits it: back in stock
  boxes.forEach(function (b) {
    if (String(b.same || "").indexOf("STICKER ") !== 0) return;
    var s = byKey[b.same];
    if (s && fits(s, b)) return;
    b.status = "in stock"; b.why = "back in stock: the sticker that took it off was removed or corrected (" + cathNow_().slice(0, 10) + ")";
    b.same = ""; b.usedIn = ""; write(b); back++;
  });
  var claimed = {}; boxes.forEach(function (b) { if (String(b.same || "").indexOf("STICKER ") === 0) claimed[b.same] = b; });
  list.forEach(function (s) {
    var key = "STICKER " + s.id;
    if (claimed[key]) return;
    var d = invStickerDate_(s), u = unitOf(s), how = "";
    var pool = boxes.filter(function (b) { return String(b.same || "").indexOf("STICKER ") !== 0 && fits(s, b); });
    var hit = null;
    if (u) {
      hit = pool.filter(function (b) { return boxScanUnit_(b) === u; })[0] || null;
      if (hit && !/^(in stock|unseen|used)$/.test(hit.status)) {
        flags.push({ ptcaNo: s.ptcaNo, patient: s.patient, date: d, what: [s.brand, invStickerSize_(s), s.lot ? "LOT " + s.lot : ""].filter(Boolean).join(" "),
          why: "its barcode is the box marked " + hit.status + (hit.why ? " (" + hit.why + ")" : "") });
        return;
      }
      if (hit) how = "by its barcode";
    }
    if (!hit && invNorm_(s.serial)) {
      hit = pool.filter(function (b) { return /^(in stock|unseen)$/.test(b.status) && invNorm_(b.serial) === invNorm_(s.serial); })[0] || null;
      if (hit) how = "by its serial number";
    }
    if (!hit) {
      // a box already marked used (the day's photo, or by hand) for this case
      hit = pool.filter(function (b) { return b.status === "used" && !b.same && b.usedIn && invSameCase_(String(b.usedIn).replace(/^PTCA\s*/i, ""), s.ptcaNo); })[0] || null;
      if (hit) how = "already marked used";
    }
    if (!hit) {
      var free = pool.filter(function (b) { return (b.status === "in stock" || b.status === "unseen") && (!dayOf(b) || dayOf(b) <= d) && !(u && boxScanUnit_(b)); });
      free.sort(function (a, c) { return (boxExpiryIso_(a.expiry) || "9999") < (boxExpiryIso_(c.expiry) || "9999") ? -1 : 1; });
      hit = free[0] || null;
      if (hit) how = "by its LOT" + (dayOf(hit) === d ? " (the same day as its stock photo — taken as used after the photo)" : "");
    }
    if (!hit) return;
    if (hit.status !== "used") hit.why = "sticker of " + caseTxt(s) + " (" + d + ") — " + how;
    else hit.why = (hit.why ? hit.why + " · " : "") + "sticker of " + caseTxt(s);
    hit.status = "used"; hit.same = key; hit.usedIn = caseTxt(s);
    claimed[key] = hit; write(hit); taken++;
  });
  try { PropertiesService.getScriptProperties().setProperty("STICKER_BOX_FLAGS", JSON.stringify(flags.slice(-40))); } catch (e) {}
  return { taken: taken, back: back, flags: flags.length };
}
function stentBoxFlags_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("STICKER_BOX_FLAGS") || "[]") || []; } catch (e) { return []; } }
/* a photo read again from the start (its file is wherever it now is) */
function stentRetry_(req) {
  var tab = stentUpRows_();
  var r = tab.byId[String(req.id || "")];
  if (!r) throw new Error("that photo is no longer in the uploads list");
  if (r.photoGone) throw new Error("this photo was deleted on " + r.photoGone + " (photos are kept a year: six months full size, six months smaller) — upload it again");
  var billed = stentRowsAll_().filter(function (x) { return x.up === r.id && (x.billNo || x.billedAt || x.edited); });
  if (billed.length) throw new Error("a sticker from this photo has been corrected or marked billed — reading it again would lose that; correct the stickers by hand instead");
  r.status = "queued"; r.result = null; r.tries = 0; r.errors = [];
  r.log = (r.log ? r.log + "\n" : "") + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss") + " retry: queued again from the app" + (req.by ? " by " + cathStr_(req.by, 60) : "");
  stentUpWrite_(r);
  return { queued: r.id };
}
function stentDismiss_(req) {
  var tab = stentUpRows_();
  var r = tab.byId[String(req.id || "")];
  if (!r) throw new Error("that photo is no longer in the uploads list");
  r.status = "dismissed";
  r.log = (r.log ? r.log + "\n" : "") + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss") + " dismissed" + (req.by ? " by " + cathStr_(req.by, 60) : "");
  stentUpWrite_(r);
  return { dismissed: r.id };
}
/* the photo of one upload, for the app to show (only photos the uploads tab knows) */
function stentPhoto_(req) {
  var id = String(req.fileId || "");
  var tab = stentUpRows_();
  if (!id || !tab.byFile[id]) throw new Error("that photo is not one of the stent uploads");
  var f = DriveApp.getFileById(id);
  if (f.isTrashed()) throw new Error("this photo has been deleted (photos are kept a year: six months full size, six months smaller)");
  var blob = f.getBlob();
  if (blob.getBytes().length > 15 * 1024 * 1024) throw new Error("the photo is too large to show here — open it in Drive");
  return { fileId: id, name: f.getName(), mime: String(blob.getContentType() || f.getMimeType() || ""), b64: Utilities.base64Encode(blob.getBytes()) };
}
/* a photo taken in the app goes into Stents uploads like any other */
function caseUpload_(req) {
  var b64 = String(req.b64 || "");
  if (!b64) throw new Error("no file");
  var mime = String(req.mime || "image/jpeg").toLowerCase();
  if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(mime)) throw new Error("only photos (JPEG/PNG) and PDFs can be uploaded");
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > 19 * 1024 * 1024) throw new Error("the file is larger than 19 MB");
  if (mime === "application/pdf" && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "%PDF") throw new Error("the PDF did not arrive whole - nothing was stored");
  var stem = String(req.stem || "").replace(/[^A-Za-z0-9_\-]+/g, "");
  if (!stem) stem = "app_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  else if (stem.indexOf("app") !== 0) stem = "app_" + stem;
  var f = batchFolders_();
  var dir = String(req.type || "").toUpperCase() === "PTCA" ? f.ptca : f.cag;
  var isPdf = mime === "application/pdf";
  var ext = isPdf ? ".pdf" : mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  var name = isPdf ? stem + ext : stem + "_" + Math.max(1, Math.min(99, Number(req.n) || 1)) + ext;
  // a repeat of the same upload (the phone did not hear the answer) is stored once - also if the case has already been picked up
  var same = dir.getFilesByName(name);
  if (same.hasNext()) { var old = same.next(); return { fileId: old.getId(), name: name, folder: dir.getName(), dup: true }; }
  var file = dir.createFile(Utilities.newBlob(bytes, mime, name));
  if (req.by) { try { file.setDescription("uploaded from the app by " + cathStr_(req.by, 60) + (req.pages ? " (" + Number(req.pages) + " sheets)" : "") + " to be read by the night scan"); } catch (e) {} }
  return { fileId: file.getId(), name: name, folder: dir.getName() };
}
function stentUpload_(req) {
  var b64 = String(req.b64 || "");
  if (!b64) throw new Error("no photo");
  var mime = String(req.mime || "image/jpeg").toLowerCase();
  if (!/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(mime)) throw new Error("only photos (JPEG/PNG) and PDFs can be uploaded");
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > 15 * 1024 * 1024) throw new Error("the photo is larger than 15 MB");
  var f = batchFolders_();
  var ext = mime === "application/pdf" ? ".pdf" : mime === "image/png" ? ".png" : ".jpg";
  var who = cathStr_(req.label, 40).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  var name = "stent_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + (who ? "_" + who : "") + ext;
  // 13.48: a stock photo (purpose "stock") goes to Inventory uploads
  var pu = String(req.purpose || "");
  var kindDir = pu === "stock" && req.kind && INV_KIND_FOLDER[String(req.kind)] ? invKindFolders_(f)[String(req.kind)].inF : null;
  var dir = kindDir || (pu === "stock" ? f.invIn : pu === "day" ? f.usedIn : pu === "weekly" ? f.weeklyIn : f.stentsIn);
  var nm = pu === "stock" ? name.replace(/^stent_/, "stock_") : pu === "day" ? name.replace(/^stent_/, "used_") : pu === "weekly" ? name.replace(/^stent_/, "weekly_") : name;
  var file = dir.createFile(Utilities.newBlob(bytes, mime, nm));
  if (req.by) { try { file.setDescription("uploaded from the app by " + cathStr_(req.by, 60)); } catch (e) {} }
  // 13.51: the barcodes the phone read on the full-size photo, kept for when the photo is read
  var nScan = 0;
  try { nScan = photoCodesSave_(file.getId(), nm, req.by, req.scan, req.allByCode === true); } catch (e) {}
  // 13.51: every box read by barcode → the photo is read now from its barcodes, no Gemini
  var byCode = null;
  if (req.allByCode === true && nScan && (pu === "stock" || pu === "weekly" || pu === "day")) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(20000)) {
      try {
        var t0 = Date.now(), runId = "up-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HHmmss");
        var left = function () { return 240000 - (Date.now() - t0); }, nap = function () {};
        var o = pu === "day" ? dayTick_(f, null, "", runId, true, nap, left, file.getId()) : invPhotoTick_(f, null, "", runId, true, nap, left, file.getId());
        byCode = o && o.scanned ? (pu === "day" ? { read: true, matched: o.matched || 0, noBox: o.noBox || 0 } : { read: true, added: o.units || 0, repeats: o.repeats || 0, check: o.check || 0 }) : { read: false };
      } catch (eB) { byCode = { read: false, error: String(eB && eB.message || eB) }; }
      finally { lock.releaseLock(); }
    }
  }
  return { fileId: file.getId(), name: name, barcodes: nScan, byCode: byCode };
}
/* a bill (or a sticker) photographed in the app: read now, with the
   scanner's models; nothing is written */
function stentReadBill_(req) {
  var key = geminiKey_();
  if (!key) throw new Error("the sheet has no GEMINI_KEY in its script properties, so it cannot read photos");
  var b64 = String(req.b64 || "");
  if (!b64) throw new Error("no photo");
  var mime = String(req.mime || "image/jpeg").toLowerCase();
  var t0 = Date.now();
  BATCH_RUN_ = { start: t0, ok: 0, rested: 0, notes: [] };
  var item = { bytes: Utilities.base64Decode(b64), name: "bill", mime: mime, isPdf: mime === "application/pdf" };
  var models = batchModels_();
  COST_CTX_ = { what: "bill", id: "", name: "bill photo" };
  var res = batchCallChain_(key, (models.readChain || [models.read]).slice(0, 3), BILL_PROMPT, item, null,
    function () { Utilities.sleep(1500); }, function () { return 200000 - (Date.now() - t0); });
  COST_CTX_ = null;
  if (!res || !res.ok) throw new Error("the bill could not be read: " + ((res && res.reason) || "no answer") + " — type what it says below instead");
  var j = res.json && typeof res.json === "object" ? res.json : {};
  var b = j.bill && typeof j.bill === "object" ? j.bill : {};
  return { model: res.model || "", bill: { number: cathStr_(b.number, 60), date: cathStr_(b.date, 30), vendor: cathStr_(b.vendor, 120),
      patient: cathStr_(b.patient, 120), ipNo: cathStr_(b.ipNo, 40), ptcaNo: cathStr_(b.ptcaNo, 40), amount: cathStr_(b.amount, 30) },
    items: (Array.isArray(j.items) ? j.items : []).slice(0, 30).map(stentNormItem_) };
}
/* ---- 13.49: stock photos (Inventory uploads), box by box ----
   Each box read on a photo in "Inventory uploads" becomes a row of "Stock
   boxes". A box is counted (one "received" move, keyed "BOX <id>") only when
   it is read well enough — brand, diameter, length and LOT, with the LOT
   agreeing with the barcode line — and it is not a repeat: photos of one
   shelf overlap, so for each kind of box (brand, size and LOT) a photo adds only the boxes beyond those already in stock. A box
   that falls short is kept "to check" for the technicians, not counted. */
/* 13.50: the kinds measured by diameter × length */
var BOX_SIZED = { stent: 1, balloon: 1, dcb: 1, cutting: 1 };
function boxSizeText_(b) { return BOX_SIZED[b.kind] ? (Number(b.dia) && Number(b.len) ? stentNum_(b.dia) + "×" + stentNum_(b.len) : "") : String(b.size || ""); }
/* a kind of box: device, brand, size and its LOT — or, for a brand that prints
   no LOT, its own serial number (what every counted box has; a GTIN or REF
   read on one photo and missed on another must not split one box in two) */
/* 13.52: Ultima PC boxes carry no LOT on the side — read without one they are
   counted (each box on its own: never taken as a repeat), and the app shows
   a caveat on them for a day after the photo */
var BOX_NO_LOT_RE = /ultima\s*pc/i;
function boxNoLot_(b) { return BOX_NO_LOT_RE.test(String(b.brand || "")) && !invNorm_(b.lot) && !invNorm_(b.serial); }
function boxKey_(b) {
  var id = invNorm_(b.lot) ? invNorm_(b.lot) : invNorm_(b.serial) ? "s" + invNorm_(b.serial) : boxNoLot_(b) && b.id ? "x" + b.id : "";
  return (b.kind || "stent") + "|" + invNorm_(b.brand) + "|" + invSizeKey_(boxSizeText_(b)) + "|" + id;
}
/* the same kind of stent for a sticker of a USED stent (it may carry only some of the numbers) */
function boxStickerFits_(b, st) {
  if ((b.kind || "stent") !== "stent") return false;
  if (!invNorm_(b.lot) || invNorm_(b.lot) !== invNorm_(st.lot)) return false;
  if (invDigits_(b.gtin) && invDigits_(st.gtin)) return invDigits_(b.gtin) === invDigits_(st.gtin);
  if (invNorm_(b.ref) && invNorm_(st.ref)) return invNorm_(b.ref) === invNorm_(st.ref);
  return Number(b.dia) === Number(st.dia) && Number(b.len) === Number(st.len);
}
/* 13.50: brands whose used stent takes any box of its size (Yukon) */
var BOX_ANY_SIZE_RE = /yukon/i;
function boxAnySize_(brand) { return BOX_ANY_SIZE_RE.test(String(brand || "")); }
function boxSizeSame_(b, st) { return Number(b.dia) === Number(st.dia) && Number(b.len) === Number(st.len); }
function boxSizeOk_(kind, dia, len) {
  var d = Number(dia), l = Number(len);
  if (kind === "stent") return d >= 1.5 && d <= 6 && l >= 6 && l <= 60;
  if (BOX_SIZED[kind]) return d >= 0.8 && d <= 6 && l >= 4 && l <= 40;
  return true;
}
/* what is missing or wrong on a box as read; "" when it can be counted */
function boxWhy_(b, raw) {
  var miss = [];
  if (raw && raw.partial === true) return "cut off at the edge of the photo, or its size or LOT hidden";
  if (!b.brand) miss.push("brand");
  if (BOX_SIZED[b.kind]) { if (!Number(b.dia)) miss.push("diameter"); if (!Number(b.len)) miss.push("length"); }
  if (!invNorm_(b.lot) && !invNorm_(b.serial) && !BOX_NO_LOT_RE.test(String(b.brand || ""))) miss.push("LOT");
  if (miss.length) return miss.join(", ") + " not read";
  if (String(b.lot).indexOf("?") >= 0 || String(b.serial).indexOf("?") >= 0) return "LOT not read clearly (" + (b.lot || b.serial) + ")";
  if (BOX_SIZED[b.kind] && !boxSizeOk_(b.kind, b.dia, b.len)) return "size " + b.dia + " × " + b.len + " is not a " + INV_KIND_LABEL[b.kind].toLowerCase() + " size";
  return "";
}
function boxArea_(raw) {
  var a = raw && (raw.box_2d || raw.box2d || raw.bbox);
  if (!Array.isArray(a) || a.length !== 4) return "";
  var n = a.map(function (x) { return Math.max(0, Math.min(1000, Math.round(Number(x) || 0))); });
  if (n[2] <= n[0] || n[3] <= n[1]) return "";
  return n.join(",");
}
function boxFromRead_(raw, up, by, readBy) {
  var s = stentNormItem_(raw);
  var scanned = boxScanApply_(raw, s);   // 13.51: the barcode read on the phone, where one was matched to this box
  var g = {};
  s.codes.forEach(function (c) { var x = gs1Parse_(c); if (x) Object.keys(x).forEach(function (k) { if (g[k] == null) g[k] = x[k]; }); });
  var printedLot = cathStr_(raw && raw.lot, 60);
  var kind = invKindOf_(raw && (raw.device || raw.type) || s.device || "stent");
  if (kind === "other" && /dilat|balloon/i.test(String(raw && raw.brand || "") + " " + String(raw && raw.device || ""))) kind = "balloon";
  var b = { id: cathId_("X"), up: up.id, photo: up.file, fileId: up.fileId, status: "", why: "", kind: kind,
    brand: s.brand, mfr: s.mfr, dia: s.dia, len: s.len, ref: s.ref, lot: s.lot, serial: s.serial || cathStr_(raw && raw.serial, 60), expiry: s.expiry, gtin: s.gtin,
    codes: s.codes.join("\n"), place: cathStr_(raw && raw.place, 80), item: "", same: "", readAt: cathNow_(), readBy: readBy || "", checkedBy: "", checkedAt: "",
    size: BOX_SIZED[kind] ? "" : cathStr_(raw && raw.size, 60), area: boxArea_(raw), scan: scanned ? cathStr_(raw.scan, 200) : "" };
  if (raw && raw.background === true) { b.status = "background"; b.why = "in the background of the photo — not counted"; return b; }
  b.why = boxWhy_(b, scanned ? null : raw);
  if (!b.why && !scanned && printedLot && g["10"] && invNorm_(printedLot) !== invNorm_(g["10"]))
    b.why = "LOT read as " + printedLot + " beside the barcode but " + g["10"] + " in the barcode line";
  // 13.51: a LOT and an expiry that do not fit the maker's dating are a misread: kept to check
  if (!b.why && !scanned) b.why = boxRule_(b);
  return b;
}
function boxHaveOf_(key, boxes, stickers, exceptUp) {
  var mine = boxes.filter(function (x) { return (x.status === "in stock" || x.status === "unseen") && boxKey_(x) === key && x.up !== exceptUp; });
  mine.sort(function (a, c) { return (a.status === "unseen") - (c.status === "unseen"); });   // seen ones matched first
  if (!mine.length) return { n: 0, list: mine };
  var since = mine.map(function (x) { return String(x.readAt).slice(0, 10); }).sort()[0];
  var used = stickers.filter(function (st) { return invStickerDate_(st) >= since && boxStickerFits_(mine[0], st); }).length;
  return { n: Math.max(0, mine.length - used), list: mine };
}
/* one photo's boxes → rows of Stock boxes (its earlier rows replaced) */
/* 13.52: a box's LOT / number is backed by its barcode text when it is in it */
/* how sure a box's LOT / number is: 2 read by the phone from its barcode,
   1 the number printed beside the barcode read off the photo, 0 neither */
function boxSureOf_(b, id) {
  var n = invNorm_(id);
  if (!n) return 0;
  if (String(b.scan || "").trim() && invNorm_(b.scan).indexOf(n) >= 0) return 2;
  return String(b.codes || "").trim() && invNorm_(b.codes).indexOf(n) >= 0 ? 1 : 0;
}
function boxTakePhoto_(up, list, by, readBy, boxes, stickers) {
  var old = boxes.filter(function (x) { return x.up === up.id; });
  if (old.length) {
    // a photo read again: its earlier boxes go (the rows below move up, so the list is read afresh)
    boxDeleteRows_(old.map(function (x) { return x.row; }));
    var fresh = boxRowsAll_(); boxes.length = 0; fresh.forEach(function (x) { boxes.push(x); });
  }
  var mine = list.map(function (raw) { return boxFromRead_(raw, up, by, readBy); });
  var counts = { added: 0, repeat: 0, check: 0 };
  var groups = {};
  counts.background = 0; counts.kinds = {};
  mine.forEach(function (b) {
    if (b.status === "background") { counts.background++; return; }
    counts.kinds[b.kind] = (counts.kinds[b.kind] || 0) + 1;
    if (b.why) { b.status = "check"; counts.check++; } else (groups[boxKey_(b)] = groups[boxKey_(b)] || []).push(b);
  });
  // 13.49: a LOT read one character differently from a box already in stock
  // of the same size and expiry is most likely that box (a misread), not a
  // new one: it is taken as a repeat, and says so, so it can be counted if not
  var nearUsed = {};
  var nearOf = function (b) {
    var hits = boxes.filter(function (x) {
      var xi = invNorm_(x.lot) || invNorm_(x.serial), bi = invNorm_(b.lot) || invNorm_(b.serial);
      // 13.52: a box known by its own serial number (NC Rockstar) is never a misread of another:
      // boxes of one batch carry numbers one digit apart (…179106, …179108, …179128)
      if (!invNorm_(b.lot) && invNorm_(b.serial) && !invNorm_(x.lot) && invNorm_(x.serial)) return false;
      return x.status === "in stock" && x.up !== up.id && (x.kind || "stent") === (b.kind || "stent") && invNorm_(x.brand) === invNorm_(b.brand) && invSizeKey_(boxSizeText_(x)) === invSizeKey_(boxSizeText_(b)) &&
        xi !== bi && boxEdit1_(xi, bi) && (!b.expiry || !x.expiry || boxYmd_(b.expiry) === boxYmd_(x.expiry)) &&
        // 13.51: two LOTs both read from barcodes are exact — never a misread of one another
        !(b.scan && x.scan) &&
        // the box's own number after (91), where both were read, must agree (to one character)
        (!boxUnit_(b) || !boxUnit_(x) || (boxUnit_(b).length === boxUnit_(x).length && boxDiff_(boxUnit_(b), boxUnit_(x)) <= 1));
    });
    for (var i = 0; i < hits.length; i++) {
      var k2 = boxKey_(hits[i]);
      var free = boxHaveOf_(k2, boxes, stickers, up.id).n - (groups[k2] ? groups[k2].length : 0) - (nearUsed[k2] || 0);
      if (free > 0) { nearUsed[k2] = (nearUsed[k2] || 0) + 1; return hits[i]; }
    }
    return null;
  };
  // 13.51: a barcode whose own number is on a box already used or returned:
  // that very box is gone from the shelf — not counted, kept to check
  Object.keys(groups).forEach(function (k) {
    groups[k].forEach(function (b) {
      var u = boxScanUnit_(b); if (!u || b.status) return;
      var gone = boxes.filter(function (x) { return (x.status === "used" || x.status === "returned") && x.up !== up.id && boxScanUnit_(x) === u; })[0];
      if (gone) { b.status = "check"; b.why = "its barcode's own number (" + u + ") is on a box marked " + gone.status + (gone.usedIn ? " (" + gone.usedIn + ")" : "") + " — check it is not that box"; counts.check++; }
    });
    groups[k] = groups[k].filter(function (b) { return !b.status; });
  });
  Object.keys(groups).forEach(function (k) {
    var g = groups[k], have = boxHaveOf_(k, boxes, stickers, up.id);
    // 13.51: a box whose barcode was read on the phone carries its own number ((91) Abbott, (93) Terumo,
    // (21) or the serial): the same number on a box already counted is that box; a number that differs
    // from every box already counted of this LOT and size (all scanned too) is another box
    if (have.list.length) {
      var twins = [];
      g.forEach(function (b) {
        var u = boxScanUnit_(b); if (!u) return;
        var twin = have.list.filter(function (x) { return twins.indexOf(x) < 0 && boxScanUnit_(x) === u; })[0];
        if (twin) {
          twins.push(twin); b.status = "repeat"; b.same = twin.id;
          b.why = "same box as on " + (twin.photo || "another photo") + " — its barcode's own number (" + u + ") is the same"; counts.repeat++;
        } else if (have.list.every(function (x) { return boxScanUnit_(x); })) {
          b.status = "in stock"; b.why = "another box of this LOT: its barcode's own number (" + u + ") is on no box counted before"; counts.added++;
        }
      });
      if (twins.length) have = { n: Math.max(0, have.n - twins.length), list: have.list.filter(function (x) { return twins.indexOf(x) < 0; }) };
      g = g.filter(function (b) { return !b.status; });
    }
    // 13.50: a box whose serial is read and differs from the serial of every box already counted
    // under this LOT and size is another box (the serial is what the bill is matched on), not a repeat
    if (have.list.length) {
      var distinct = g.filter(function (b) {
        return invNorm_(b.serial) && have.list.every(function (x) { return invNorm_(x.serial) && invNorm_(x.serial) !== invNorm_(b.serial); });
      });
      distinct.forEach(function (b) { b.status = "in stock"; counts.added++; });
      g = g.filter(function (b) { return distinct.indexOf(b) < 0; });
    }
    g.forEach(function (b, i) {
      var near = i < have.n ? null : nearOf(b);
      if (near) {
        b.status = "repeat"; b.same = near.id;
        var was = near.lot || near.serial, now = b.lot || b.serial;
        // 13.51: the box read from its barcode has the true LOT: the counted box's misread LOT is corrected.
        // 13.52: so does a box whose number is printed beside its barcode on this photo
        // when the counted box's was not (read off a stack or a shelf)
        var rNow = boxSureOf_(b, now), rWas = boxSureOf_(near, was);
        if (rNow > rWas && near.row) {
          near.why = "LOT corrected from " + was + " to " + now + " (" + (rNow === 2 ? "barcode" : "number beside the barcode") + " on " + (up.file || "a later photo") + ")";
          if (b.lot) near.lot = b.lot; if (b.serial) near.serial = b.serial;
          if (b.expiry) near.expiry = b.expiry; if (b.scan) near.scan = b.scan; if (b.codes) near.codes = b.codes;
          boxWrite_(near);
          b.why = "the same box as on " + (near.photo || "another photo") + " (its number there was misread as " + was + ") — not counted again";
          b.checkedBy = "app (13.52)"; b.checkedAt = cathNow_();
        } else if (rWas > rNow) {
          b.why = "the same box as on " + (near.photo || "another photo") + " (No. " + was + "; read here as " + now + ") — not counted again";
          b.checkedBy = "app (13.52)"; b.checkedAt = cathNow_();
        } else
          b.why = "LOT read as " + now + " here but " + was + " on " + (near.photo || "another photo") + " (same size and expiry) — taken as the same box; check the LOT";
        counts.repeat++;
      } else if (i < have.n) {
        b.status = "repeat"; b.same = have.list[i] ? have.list[i].id : "";
        b.why = (b.lot ? "LOT " + b.lot : "No. " + b.serial) + " " + (boxSizeText_(b) || b.brand) + ": " + have.n + " already in stock from " +
          uniq_(have.list.map(function (x) { return x.photo; })).join(", ") + " — taken as the same box" + (have.n === 1 ? "" : "es");
        counts.repeat++;
      } else { b.status = "in stock"; counts.added++; }
    });
  });
  // 13.50: a box missing from an earlier weekly photo that turns up again is in stock again
  counts.seen = [];
  mine.forEach(function (b) {
    if (b.status !== "repeat" || !b.same) return;
    counts.seen.push(b.same);
    boxes.forEach(function (x) { if (x.id === b.same && x.status === "unseen") { x.status = "in stock"; x.why = "seen again on " + up.file; if (x.row) boxWrite_(x); } });
  });
  boxAppend_(mine);
  mine.forEach(function (b) { boxes.push(b); });
  return counts;
}
var BOX_FROM_SINCE = "2026-11-20";
/* the statuses of a box that came in (its "received" stays): in stock; used
   (on a used-instruments photo — the utilization sheet already took it off);
   unseen (missing from the weekly shelf photos) */
var BOX_RECEIVED = { "in stock": 1, used: 1, unseen: 1 };     // 13.50: stock photographed from this day sets each new item's start
function boxNextDay_(d) { var t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }
function boxEdit1_(a, b) {
  if (!a || !b || Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  var i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
/* Abbott prints a number of the box's own after (91) in the barcode line —
   two boxes of one LOT carry different ones */
function boxUnit_(b) {
  var out = "";
  String(b.codes || "").split("\n").forEach(function (c) { var g = gs1Parse_(c); if (g && g["91"] && !out) out = invNorm_(g["91"]); });
  return out;
}
function boxDiff_(a, b) { var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
function boxYmd_(v) { var m = /(20\d\d)\D?(\d\d)\D?(\d\d)?/.exec(String(v || "")); return m ? m[1] + m[2] + (m[3] || "") : String(v || ""); }
function uniq_(a) { var o = []; a.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }
/* ---- 13.51: the LOT and the expiry must fit together. Each maker dates its
   LOT and gives a fixed shelf life, so a LOT read one digit wrong shows up as a
   LOT and an expiry that do not fit. Checked on boxes read from photos (such a
   box is kept to check, not counted); a box fixed by hand is taken as typed.
   Found on the 20–23 Nov stock (220 boxes, no false alarm):
   - Terumo Ultimaster: LOT yymmdd; expiry = last day of the month 23 months on
   - Abbott Xience: LOT y mm dd + 2 digits; expiry 2–10 days short of 3 years on
   - Abbott NC Trek / Mini Trek: LOT y mm dd G n; expiry = last day of the month 35 months on
   - NC Rockstar: the serial carries the expiry (yymmdd from the 5th digit) ---- */
function boxEom_(y, m) { return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }   // m 1–12 → its last day
function boxMonthsOn_(y, m, n) { var t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), t % 12 + 1]; }
function boxRuleWant_(b) {
  var brand = String(b.brand || "") + " " + String(b.mfr || ""), lot = String(b.lot || "").toUpperCase().replace(/\s/g, ""), m;
  if (/ultimaster|terumo/i.test(brand) && (m = /^(\d\d)(\d\d)(\d\d)$/.exec(lot)) && +m[2] >= 1 && +m[2] <= 12) {
    var t = boxMonthsOn_(2000 + +m[1], +m[2], 23);
    return { exp: boxEom_(t[0], t[1]), how: "Terumo boxes expire at the end of the month 23 months after the LOT's date" };
  }
  if (/trek/i.test(brand) && (m = /^(\d)(\d\d)(\d\d)G\d$/.exec(lot)) && +m[2] >= 1 && +m[2] <= 12) {
    var t2 = boxMonthsOn_(2020 + +m[1], +m[2], 35);
    return { exp: boxEom_(t2[0], t2[1]), how: "Abbott Trek balloons expire at the end of the month 35 months after the LOT's date" };
  }
  if (/xience/i.test(brand) && (m = /^(\d)(\d\d)(\d\d)\d\d$/.exec(lot)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    return { made: new Date(Date.UTC(2023 + +m[1] /* y+3 */, +m[2] - 1, +m[3])), how: "Xience boxes expire 2–10 days short of three years after the LOT's date" };
  }
  var sn = String(b.serial || "").toUpperCase();
  if (/rockstar/i.test(brand) && (m = /^\d{4}(\d\d)(\d\d)(\d\d)\d\d[A-Z]\d{4,5}\d{3}$/.exec(sn))) {
    return { exp: "20" + m[1] + "-" + m[2] + "-" + m[3], how: "an NC Rockstar serial carries its expiry", serial: true };
  }
  return null;
}
function boxRule_(b) {
  var w = boxRuleWant_(b), e = String(b.expiry || "");
  var have = /^(20\d\d)-(\d\d)(?:-(\d\d))?$/.exec(e) || (/^(\d\d)-(20\d\d)$/.exec(e) ? [0, /^(\d\d)-(20\d\d)$/.exec(e)[2], /^(\d\d)-(20\d\d)$/.exec(e)[1], ""] : null);
  if (!w || !have) return "";
  var what = w.serial ? "No. " + b.serial : "LOT " + b.lot;
  if (w.made) {
    if (!have[3]) return "";
    var gap = Math.round((w.made.getTime() - Date.UTC(+have[1], +have[2] - 1, +have[3])) / 864e5);
    if (gap >= 2 && gap <= 10) return "";
    return what + " does not fit the expiry " + e + " (" + w.how + ") — check the LOT and the expiry on the box";
  }
  var ok = have[3] ? e === w.exp : e === w.exp.slice(0, 7);
  return ok ? "" : what + " does not fit the expiry " + e + " (" + w.how + ": " + w.exp + ") — check the " + (w.serial ? "number" : "LOT") + " and the expiry on the box";
}
/* ---- 13.51: barcodes read on the phone. The app reads the barcodes of a
   stock (or used-instruments) photo on the full-size picture before it is made
   smaller, and sends them with the upload: {t: text, x, y} (0–1000 across and
   down). They are kept in "Photo barcodes" and, when the photo is read, each is
   given to the box whose label it lies on. A box with a barcode takes its LOT,
   expiry, serial and GTIN from it (a barcode is never misread by a digit), and
   its own number — (91) on Abbott boxes, (93) on Terumo, (21) or the serial —
   tells two boxes of one LOT apart. ---- */
var PHOTO_CODES_TAB = "Photo barcodes";
var PHOTO_CODES_HEAD = ["File id", "File", "Saved", "By", "Barcodes", "Every box by barcode"];
var PHOTO_CODES_ALL_ = null;
var PHOTO_CODES_CACHE_ = null;
function photoCodesSave_(fileId, name, by, scan, all) {
  if (!Array.isArray(scan) || !scan.length) return 0;
  var list = scan.slice(0, 150).map(function (c) {
    return { t: cathStr_(c && c.t, 200), x: Math.max(0, Math.min(1000, Math.round(Number(c && c.x) || 0))), y: Math.max(0, Math.min(1000, Math.round(Number(c && c.y) || 0))) };
  }).filter(function (c) { return c.t; });
  if (!list.length) return 0;
  var sh = sheet(PHOTO_CODES_TAB, PHOTO_CODES_HEAD);
  ensureCols(sh, PHOTO_CODES_HEAD.length);
  sh.appendRow([fileId, cathStr_(name, 120), cathNow_(), cathStr_(by, 60), JSON.stringify(list), all ? "yes" : ""]);
  PHOTO_CODES_CACHE_ = null; PHOTO_CODES_ALL_ = null;
  return list.length;
}
function photoCodesOf_(fileId) {
  if (!fileId) return [];
  if (!PHOTO_CODES_CACHE_) {
    PHOTO_CODES_CACHE_ = {}; PHOTO_CODES_ALL_ = {};
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PHOTO_CODES_TAB);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, PHOTO_CODES_HEAD.length).getValues().forEach(function (v) {
        try { PHOTO_CODES_CACHE_[String(v[0])] = JSON.parse(String(v[4] || "[]")) || []; } catch (e) {}
        if (String(v[5] || "") === "yes") PHOTO_CODES_ALL_[String(v[0])] = true;
      });
    }
  }
  return PHOTO_CODES_CACHE_[String(fileId)] || [];
}
/* ---- 13.51: a photo read from its barcodes alone, with no Gemini ----
   A barcode names the product: the GTIN in (01), or for NC Rockstar the first
   four digits of its own number (size code). Every product already counted
   from a photo is kept in a catalogue (product → kind, brand, size, REF); one
   that two boxes disagree on is left out. When the technician says the phone
   read every box on a photo, and every barcode is in the catalogue, the photo
   is read from its barcodes — no Gemini request is made. Otherwise Gemini
   reads it as before. */
var BOX_RS_SN = /^13\d{10}[A-Z]\d{6,8}$/;   // e.g. 131029082026J0191153
function boxProdKey_(t) {
  var p = boxScanParse_(t);
  if (!p) return "";
  if (p.gtin) return "G:" + p.gtin;
  if (BOX_RS_SN.test(String(p.serial || ""))) return "R:" + String(p.serial).slice(0, 4);   // NC Rockstar: 13 + size code
  return "";
}
function boxCatalog_(boxes) {
  var cat = {}, bad = {};
  (boxes || []).forEach(function (b) {
    if (!/^(in stock|repeat|used|returned|unseen)$/.test(String(b.status || "")) || !b.brand) return;
    var sized = BOX_SIZED[b.kind || "stent"];
    if (sized ? !(Number(b.dia) && Number(b.len)) : !b.size) return;
    var keys = [];
    String((b.scan || "") + "\n" + (b.codes || "")).split("\n").forEach(function (c) { var k = c ? boxProdKey_(c) : ""; if (k && keys.indexOf(k) < 0) keys.push(k); });
    if (b.gtin && /^\d{14}$/.test(b.gtin) && keys.indexOf("G:" + b.gtin) < 0) keys.push("G:" + b.gtin);
    if (BOX_RS_SN.test(String(b.serial || "")) && /rockstar/i.test(b.brand) && keys.indexOf("R:" + String(b.serial).slice(0, 4)) < 0) keys.push("R:" + String(b.serial).slice(0, 4));
    var v = { kind: b.kind || "stent", brand: b.brand, mfr: b.mfr || "", dia: sized ? stentNum_(b.dia) : "", len: sized ? stentNum_(b.len) : "", size: sized ? "" : b.size, ref: b.ref || "" };
    keys.forEach(function (k) {
      if (bad[k]) return;
      var o = cat[k];
      if (!o) { cat[k] = v; return; }
      if (invNorm_(o.brand) !== invNorm_(v.brand) || o.dia !== v.dia || o.len !== v.len || o.size !== v.size || o.kind !== v.kind) { bad[k] = 1; delete cat[k]; }
      else if (!o.ref && v.ref) o.ref = v.ref;
    });
  });
  return cat;
}
/* the boxes of a photo from its barcodes, or null (then Gemini reads it) */
function photoCodesBoxes_(fileId, boxes) {
  photoCodesOf_(fileId);
  if (!PHOTO_CODES_ALL_ || !PHOTO_CODES_ALL_[String(fileId)]) return null;
  var codes = photoCodesOf_(fileId);
  if (!codes.length) return null;
  var cat = boxCatalog_(boxes), out = [];
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i], p = boxScanParse_(c.t), k = boxProdKey_(c.t), v = k ? cat[k] : null;
    if (!p) continue;                       // not a device's barcode (a QR to a website…)
    if (!v) return null;                    // a product never counted before: Gemini reads the photo
    if (out.some(function (o) { return o.scan === c.t && Math.hypot(o._x - c.x, o._y - c.y) < 20; })) continue;
    out.push({ device: v.kind, brand: v.brand, manufacturer: v.mfr, diameter: v.dia, length: v.len, size: v.size, ref: v.ref,
      lot: p.lot, expiry: p.exp, serial: p.serial, gtin: p.gtin, codes: /^\(/.test(c.t) ? [c.t] : [], scan: c.t,
      place: "barcode at " + Math.round(c.x / 10) + "% across, " + Math.round(c.y / 10) + "% down", _x: c.x, _y: c.y });
  }
  return out.length ? out : null;
}
function boxGtinOk_(g) {
  if (!/^\d{14}$/.test(String(g || ""))) return false;
  var d = String(g).split("").map(Number), s = 0;
  for (var i = 0; i < 13; i++) s += d[12 - i] * (i % 2 === 0 ? 3 : 1);
  return (10 - s % 10) % 10 === d[13];
}
/* what one scanned code says: {lot, exp, serial, gtin, unit} or null */
function boxScanParse_(t) {
  var text = String(t || "");
  var g = gs1Parse_(text);
  if (g && g["01"] && (g["10"] || g["21"])) {   // a device's GS1 code always starts with its GTIN (01)
    if (!boxGtinOk_(g["01"])) return null;
    var unit = g["91"] ? "91:" + g["91"] : g["93"] ? "93:" + g["93"] : g["21"] ? "21:" + g["21"] : "";
    return { lot: g["10"] || "", exp: g["17"] ? gs1Date_(g["17"]) : "", serial: g["21"] || "", gtin: g["01"] || "", unit: unit };
  }
  // a box whose barcode is just its own number (e.g. NC Rockstar)
  if (/^[0-9A-Z]{14,30}$/.test(text) && /\d{6}/.test(text) && /[A-Z]/.test(text)) return { lot: "", exp: "", serial: text, gtin: "", unit: "SN:" + text };
  return null;
}
function boxScanUnit_(b) { var p = b && b.scan ? boxScanParse_(b.scan) : null; return p ? p.unit : ""; }
/* the boxes Gemini read (raw, with box_2d) ← the phone's barcodes, by where
   they lie on the photo, then (a barcode left over) by LOT */
function boxAttachScan_(list, scan) {
  var codes = [];
  (scan || []).forEach(function (c) { var p = boxScanParse_(c && c.t); if (p) codes.push({ t: String(c.t), x: Number(c.x) || 0, y: Number(c.y) || 0, p: p, used: false }); });
  // one barcode read twice is one; the same text in two places is two boxes (no number of their own)
  codes = codes.filter(function (c, i) { return !codes.slice(0, i).some(function (d) { return d.t === c.t && Math.hypot(d.x - c.x, d.y - c.y) < 20; }); });
  var matched = 0;
  var lotOf = function (raw) { return invNorm_(raw && raw.lot) || invNorm_(raw && raw.serial); };
  (list || []).forEach(function (raw) {
    if (!raw || raw.background === true) return;
    var a = raw.box_2d || raw.box2d || raw.bbox;
    if (!Array.isArray(a) || a.length !== 4) return;
    var y0 = +a[0] - 25, x0 = +a[1] - 25, y1 = +a[2] + 25, x1 = +a[3] + 25;
    var inside = codes.filter(function (c) { return !c.used && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1; });
    if (!inside.length) return;
    var want = lotOf(raw);
    var pick = inside.filter(function (c) { return want && (invNorm_(c.p.lot) === want || invNorm_(c.p.serial) === want); })[0];
    if (!pick && inside.length === 1) pick = inside[0];
    if (!pick) {   // nearest to the middle of the label
      var mx = (+a[1] + +a[3]) / 2, my = (+a[0] + +a[2]) / 2;
      pick = inside.slice().sort(function (p, q) { return Math.hypot(p.x - mx, p.y - my) - Math.hypot(q.x - mx, q.y - my); })[0];
    }
    pick.used = true; raw.scan = pick.t; matched++;
  });
  // a barcode not on any box's label: the one box of its LOT left without a barcode
  codes.filter(function (c) { return !c.used; }).forEach(function (c) {
    var id = invNorm_(c.p.lot) || invNorm_(c.p.serial);
    var cand = (list || []).filter(function (raw) { return raw && raw.background !== true && !raw.scan && lotOf(raw) === id; });
    if (cand.length === 1) { cand[0].scan = c.t; c.used = true; matched++; }
  });
  return { codes: codes.length, matched: matched };
}
/* a box read by Gemini ← its barcode: LOT, expiry, serial, GTIN and the line itself */
function boxScanApply_(raw, s) {
  if (!raw || !raw.scan) return false;
  var p = boxScanParse_(raw.scan);
  if (!p) return false;
  if (p.lot) s.lot = p.lot;
  if (p.exp) s.expiry = p.exp;
  if (p.serial) s.serial = p.serial;
  if (p.gtin) s.gtin = p.gtin;
  if (/^\(/.test(String(raw.scan))) s.codes = [String(raw.scan)].concat((s.codes || []).filter(function (c) { return c !== raw.scan; })).slice(0, 8);
  return true;
}
/* the ledger follows the boxes: one "received" per box in stock; the moves
   of 13.48's photo reading ("STOCK <upload>-n") give way to them */
function boxSyncMoves_(by) {
  var items = invItems_(), moves = invMovesAll_(), boxes = boxRowsAll_();
  var haveMv = {}, del = [], add = [], seen = {}, fromSet = {}, upDay = {}, firstDay = {};
  try { stentUpRows_().rows.forEach(function (r) { upDay[r.id] = r.uploaded; }); } catch (e) {}
  var stockUps = {};
  boxes.forEach(function (b) { stockUps[b.up] = 1; });
  moves.forEach(function (m) {
    if (m.caseKey.indexOf("BOX ") === 0) haveMv[m.caseKey.slice(4)] = m;
    var sm = /^STOCK (\S+)-\d+$/.exec(m.caseKey);
    if (sm && stockUps[sm[1]]) del.push(m);         // replaced by its boxes
  });
  boxes.forEach(function (b) {
    if (!BOX_RECEIVED[b.status]) return;
    seen[b.id] = 1;
    var it = invEnsure_(items, b.kind || "stent", b.brand || INV_KIND_LABEL[b.kind || "stent"], boxSizeText_(b), by);
    if (b.item !== it.id) { b.item = it.id; if (b.row) boxWrite_(b); }
    var day = String(upDay[b.up] || b.readAt || "").slice(0, 10);
    // 13.50: a box first seen as "used" on a day's instrument photo (not on the shelf list)
    // does not start the item's tracking, or that day's own sheet would be skipped
    var dayOnly = b.status === "used" && !b.same && /^used \d{4}-\d{2}-\d{2}/.test(String(b.why));
    if (!dayOnly && day && (!firstDay[it.id] || day < firstDay[it.id])) firstDay[it.id] = day;
    var m = haveMv[b.id];
    if (m && m.item === it.id) return;
    if (m) del.push(m);
    add.push(invMoveRow_({ item: it.id, kind: "received", units: 1, qty: 1, caseKey: "BOX " + b.id,
      raw: [b.brand, boxSizeText_(b), b.lot ? "LOT " + b.lot : b.serial ? "No. " + b.serial : "", b.ref ? "REF " + b.ref : "", b.expiry ? "EXP " + b.expiry : ""].filter(Boolean).join(" "),
      where: "stock photo", by: by || "", note: "box on " + (b.photo || b.up) + (b.place ? " (" + b.place + ")" : "") }));
  });
  Object.keys(haveMv).forEach(function (id) { if (!seen[id]) del.push(haveMv[id]); });
  // 13.50: an item whose stock was first counted from a photo taken on or
  // after BOX_FROM_SINCE takes off uses from the day after that photo (the
  // shelf was counted then); set by hand, or first counted earlier, it stays
  items.forEach(function (it) {
    var d = firstDay[it.id];
    if (!d || d < BOX_FROM_SINCE || it.fromSetBy === "hand") return;
    if (it.from && !it.fromAuto) return;
    var want = boxNextDay_(d);
    if (it.from !== want) { it.from = want; it.fromAuto = true; it.updated = cathNow_(); fromSet[it.id] = 1; }
  });
  if (del.length) invDeleteRows_(uniq_(del.map(function (m) { return m.row; })));
  if (add.length) invAppendMoves_(add);
  // an item made only by a size read wrong ("3.0" with no length) and now empty goes
  var after = invMovesAll_(), used = {};
  after.forEach(function (m) { used[m.item] = 1; });
  for (var i = items.length - 1; i >= 0; i--) {
    var it = items[i];
    if (it.kind === "stent" && !used[it.id] && it.size && !/\d\s*×\s*\d/.test(it.size.replace(/x/i, "×")) && it.low == null && !it.notes) { items.splice(i, 1); it.gone = true; }
  }
  invWriteTab_(items, after);
  return { added: add.length, removed: del.length, fromSet: Object.keys(fromSet).length };
}
function invPhotoTick_(f, models, key, runId, manual, pause, timeLeft, codesOnly) {
  var out = { scanned: 0, failed: 0, units: 0, repeats: 0, check: 0, pending: 0, stopped: false, why: "" };
  var tab = stentUpRows_();
  stentTakeNew_(f, tab, manual, "stock", codesOnly);
  stentTakeNew_(f, tab, manual, "weekly", codesOnly);
  var work = tab.rows.filter(function (r) { return r.status === "queued" && (r.purpose === "stock" || r.purpose === "weekly") && (!codesOnly || r.fileId === codesOnly); });
  var weeklyDays = {};
  if (!work.length) {
    if (codesOnly) return out;
    // 13.50: the day's used-instruments photos are read even when no stock photo waits
    if (timeLeft() > 100000) { try { out.day = dayTick_(f, models, key, runId, manual, pause, timeLeft); } catch (e) { batchLogRow_(runId, "", "", "used instruments", "error", String(e && e.message || e)); } }
    return out;
  }
  batchLogRow_(runId, "", "", "inventory photos", "started", work.length + " photo(s) to read");
  var boxes = boxRowsAll_(), stickers = stentCounted_(stentRowsAll_()), changed = false;
  for (var i = 0; i < work.length; i++) {
    if (timeLeft() < 100000) { out.pending = work.length - i; out.why = "time budget used; the other inventory photos continue next run"; break; }
    var r = work[i], file = null;
    try { file = DriveApp.getFileById(r.fileId); if (file.isTrashed()) file = null; } catch (e) { file = null; }
    // 13.50: the photo goes to the processed folder of the instrument it mostly shows
    var done = function (kind) {
      try {
        if (!file) return;
        var kf = kind ? invKindFolders_(f)[kind] : null;
        file.moveTo(kf ? kf.doneF : f.invDone);
      } catch (e) { stentNote_(r, runId, "move", "failed", String(e && e.message || e)); }
    };
    if (!file) { r.status = "failed"; r.errors = [{ step: "file", reason: "the photo is no longer in Drive" }]; stentUpWrite_(r); out.failed++; continue; }
    var mime = String(file.getMimeType() || "").toLowerCase();
    var item = { file: file, name: r.file, mime: mime === "image/jpg" ? "image/jpeg" : mime, isPdf: mime === "application/pdf" };
    // 13.51: every box read by barcode on the phone, all known products → no Gemini
    var byCode = null;
    try { byCode = photoCodesBoxes_(r.fileId, boxes); } catch (eC) { byCode = null; }
    if (codesOnly && !byCode) continue;
    var res = byCode ? { ok: true, json: { boxes: byCode }, model: "barcodes (phone, no Gemini)" } : photoRead_(r, STOCK_PROMPT, item, models, key, runId, pause, timeLeft);
    if (res.waiting) { out.waiting = (out.waiting || 0) + 1; continue; }
    if (res.quota && !res.ok) { out.stopped = true; out.why = res.reason; stentNote_(r, runId, "reading", "stopped", res.reason); stentUpWrite_(r); break; }
    r.tries = (r.tries || 0) + 1;
    if (!res.ok && res.retry && r.tries < BATCH_MAX_TRIES) { stentNote_(r, runId, "reading", "will retry", res.reason); stentUpWrite_(r); pause(); continue; }
    var j = res.ok && res.json && typeof res.json === "object" ? res.json : {};
    var list = Array.isArray(j.boxes) ? j.boxes : [];
    if (!list.length && res.ok) stentNormRead_(j).forEach(function (sh) { list = list.concat(sh.stickers); });   // a label sheet read the old way
    list = list.filter(function (x) { return x && typeof x === "object"; }).slice(0, 120);
    if (!res.ok || !list.length) {
      r.status = "failed"; r.errors = [{ step: "reading", reason: res.ok ? "no box could be read on this photo" : res.reason }];
      stentNote_(r, runId, "reading", "failed", r.errors[0].reason); done(); stentUpWrite_(r); out.failed++; pause(); continue;
    }
    var scanSaid = "";
    try { var sc = photoCodesOf_(r.fileId); if (sc.length) { var at = boxAttachScan_(list, sc); scanSaid = "; " + sc.length + " barcode(s) read on the phone, " + at.matched + " matched to a box"; } } catch (eS) {}
    var c = boxTakePhoto_(r, list, "inventory photo", res.model || "", boxes, stickers);
    changed = true;
    var mostly = invPhotoKind_(c.kinds || {});
    var kindsSaid = Object.keys(c.kinds || {}).map(function (k) { return c.kinds[k] + " " + INV_KIND_LABEL[k].toLowerCase() + (c.kinds[k] === 1 ? "" : "s"); }).join(", ");
    var wrongFolder = r.folder && mostly && r.folder !== mostly;
    r.status = "scanned"; r.stickers = c.added; r.errors = []; r.readBy = res.model || "";
    r.scannedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    r.result = { kinds: c.kinds || {}, mostly: mostly, added: c.added, repeat: c.repeat, check: c.check, background: c.background || 0,
      movedTo: mostly ? INVUP_DONE_DEFAULT + " / " + INV_KIND_FOLDER[mostly] : INVUP_DONE_DEFAULT,
      note: wrongFolder ? "uploaded to the " + INV_KIND_FOLDER[r.folder] + " folder but shows " + kindsSaid + " — read as what it shows and filed under " + INV_KIND_FOLDER[mostly] : "" };
    stentNote_(r, runId, "reading", "ok", list.length + " box(es) read (" + (kindsSaid || "none in the foreground") + "): " + c.added + " added to the stock, " + c.repeat + " already counted from another photo, " +
      c.check + " to check, " + (c.background || 0) + " in the background not counted" + scanSaid + (r.result.note ? "; " + r.result.note : ""));
    done(mostly); stentUpWrite_(r);
    out.scanned++; out.units += c.added; out.repeats += c.repeat; out.check += c.check;
    if (r.purpose === "weekly") { r.result.seen = c.seen; stentUpWrite_(r); weeklyDays[String(r.uploaded).slice(0, 10)] = 1; }
    if (wrongFolder) out.wrongFolder = (out.wrongFolder || []).concat([r.file + ": " + r.result.note]);
    pause();
  }
  if (changed) boxSyncMoves_("inventory photo");
  // 13.50: a day's weekly shelf photos, all read: what they did not show is noted
  Object.keys(weeklyDays).forEach(function (d) { try { out.weekly = weeklyCheck_(d); } catch (e) { batchLogRow_(runId, "", "", "weekly shelf check", "error", String(e && e.message || e)); } });
  // 13.50: the photos of the instruments used that day
  if (timeLeft() > 100000 && !out.stopped && !codesOnly) { try { out.day = dayTick_(f, models, key, runId, manual, pause, timeLeft); } catch (e) { batchLogRow_(runId, "", "", "used instruments", "error", String(e && e.message || e)); } }
  return out;
}

/* ---- 13.50: the instruments used that day (one or two photos of the box
   flaps / labels of everything opened) ---- */
var DAY_PROMPT = "You are reading a photograph taken at the end of the day in the cardiac catheterisation laboratory of LTMG Hospital, Sion, Mumbai. " +
  "It shows the labels of the devices USED that day — box end-flaps, torn box labels, pouch labels or whole empty boxes of stents, balloons, guide wires, guide catheters and other hardware — " +
  "laid out together. Read EVERY label in the photo the same way as a box on a shelf: one entry per label (two labels of the same device are two devices used).\n\n" +
  "How the labels look (as on the shelf boxes they came from):\n" +
  STOCK_PROMPT.split("\n\n").filter(function (p) { return p.indexOf("FOREGROUND ONLY") !== 0; }).join("\n\n").replace("For every foreground box", "For every label laid out");
function dayTick_(f, models, key, runId, manual, pause, timeLeft, codesOnly) {
  var out = { scanned: 0, failed: 0, matched: 0, noBox: 0 };
  var tab = stentUpRows_();
  stentTakeNew_(f, tab, manual, "day", codesOnly);
  var work = tab.rows.filter(function (r) { return r.status === "queued" && r.purpose === "day" && (!codesOnly || r.fileId === codesOnly); });
  if (!work.length) return out;
  var boxes = boxRowsAll_();
  for (var i = 0; i < work.length; i++) {
    if (timeLeft() < 100000) break;
    var r = work[i], file = null;
    try { file = DriveApp.getFileById(r.fileId); if (file.isTrashed()) file = null; } catch (e) { file = null; }
    if (!file) { r.status = "failed"; r.errors = [{ step: "file", reason: "the photo is no longer in Drive" }]; stentUpWrite_(r); out.failed++; continue; }
    var mime = String(file.getMimeType() || "").toLowerCase();
    var byCodeD = null;
    try { byCodeD = photoCodesBoxes_(r.fileId, boxes); } catch (eC) { byCodeD = null; }
    if (codesOnly && !byCodeD) continue;
    var res = byCodeD ? { ok: true, json: { boxes: byCodeD }, model: "barcodes (phone, no Gemini)" } : photoRead_(r, DAY_PROMPT, { file: file, name: r.file, mime: mime === "image/jpg" ? "image/jpeg" : mime, isPdf: mime === "application/pdf" }, models, key, runId, pause, timeLeft);
    if (res.waiting) { out.waiting = (out.waiting || 0) + 1; continue; }
    if (res.quota && !res.ok) { stentNote_(r, runId, "reading", "stopped", res.reason); stentUpWrite_(r); break; }
    r.tries = (r.tries || 0) + 1;
    if (!res.ok && res.retry && r.tries < BATCH_MAX_TRIES) { stentNote_(r, runId, "reading", "will retry", res.reason); stentUpWrite_(r); pause(); continue; }
    var list = res.ok && res.json && Array.isArray(res.json.boxes) ? res.json.boxes.filter(function (x) { return x && typeof x === "object" && x.background !== true; }) : [];
    if (!res.ok || !list.length) {
      r.status = "failed"; r.errors = [{ step: "reading", reason: res.ok ? "no label could be read on this photo" : res.reason }];
      try { file.moveTo(f.usedDone); } catch (e) {} stentUpWrite_(r); out.failed++; pause(); continue;
    }
    var day = String(r.uploaded || cathNow_()).slice(0, 10);
    try { var scD = photoCodesOf_(r.fileId); if (scD.length) boxAttachScan_(list, scD); } catch (eS) {}
    var c = dayTakePhoto_(r, list, day, res.model || "", boxes);
    r.status = "scanned"; r.stickers = list.length; r.errors = []; r.readBy = res.model || ""; r.result = c;
    r.scannedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    stentNote_(r, runId, "reading", "ok", list.length + " device(s) read: " + c.matched + " matched to a stock box, " + c.noBox.length + " with no stock box, " + c.differs.length + " differing from the utilization sheets of " + day);
    try { file.moveTo(f.usedDone); } catch (e) {}
    stentUpWrite_(r);
    out.scanned++; out.matched += c.matched; out.noBox += c.noBox.length;
    pause();
  }
  return out;
}
/* the labels of one used-instruments photo: each matched to its box in stock
   (by LOT or its own number, then the same LOT read one character apart) —
   that box becomes "used"; a label with no box is kept as a "used" row of its
   own (its LOT, for bills). The counts are not changed: the utilization
   sheets took the devices off. What the photo shows is compared with them. */
function dayTakePhoto_(up, list, day, readBy, boxes) {
  var out = { matched: 0, noBox: [], differs: [], kinds: {} };
  var add = [];
  var free = boxes.filter(function (x) { return x.status === "in stock" || x.status === "unseen"; });
  var shown = {};
  list.forEach(function (raw) {
    var b = boxFromRead_(raw, up, "used instruments", readBy);
    out.kinds[b.kind] = (out.kinds[b.kind] || 0) + 1;
    var id = invNorm_(b.lot) || invNorm_(b.serial);
    var same = function (x) { return (x.kind || "stent") === b.kind && invNorm_(x.brand) === invNorm_(b.brand) && invSizeKey_(boxSizeText_(x)) === invSizeKey_(boxSizeText_(b)); };
    var sn = invNorm_(b.serial);
    // 13.51: a barcode read on the phone names the very box (its own number)
    var bu = boxScanUnit_(b);
    var hit = bu ? free.filter(function (x) { return boxScanUnit_(x) === bu && invNorm_(x.lot) === invNorm_(b.lot); }) : [];
    if (!hit.length) hit = sn ? free.filter(function (x) { return same(x) && invNorm_(x.serial) === sn; }) : [];
    if (!hit.length && id) hit = free.filter(function (x) { return same(x) && (invNorm_(x.lot) || invNorm_(x.serial)) === id; });
    if (!hit.length && id) hit = free.filter(function (x) { return same(x) && boxEdit1_(invNorm_(x.lot) || invNorm_(x.serial), id); });
    // 13.50: Yukon — any box of its size
    if (!hit.length && boxAnySize_(b.brand)) hit = free.filter(same);
    var sk = b.kind + "|" + invNorm_(b.brand) + "|" + invSizeKey_(boxSizeText_(b));
    shown[sk] = shown[sk] || { kind: b.kind, brand: b.brand, size: boxSizeText_(b), n: 0 }; shown[sk].n++;
    if (hit.length) {
      // the box expiring first, if more than one of that LOT is on the shelf
      hit.sort(function (a, c) { return (boxExpiryIso_(a.expiry) || "9999") < (boxExpiryIso_(c.expiry) || "9999") ? -1 : 1; });
      var x = hit[0];
      free.splice(free.indexOf(x), 1);
      x.status = "used"; x.why = "used " + day + " (on " + up.file + ")"; x.same = up.id;
      if (x.row) boxWrite_(x);
      out.matched++;
    } else {
      b.status = "used"; b.why = "used " + day + " (on " + up.file + ") — no stock box with this LOT; " + (b.why || "not on the stock photos");
      b.readAt = day + " 15:00";
      add.push(b);
      out.noBox.push([b.brand, boxSizeText_(b), b.lot ? "LOT " + b.lot : b.serial ? "No. " + b.serial : ""].filter(Boolean).join(" "));
    }
  });
  boxAppend_(add);
  // the utilization sheets of that day against the photo
  var items = invItems_(), moves = invMovesAll_(), onSheet = {};
  moves.forEach(function (m) {
    if (m.caseDate !== day || (m.kind !== "used" && m.kind !== "sheet")) return;
    var it = null; for (var i = 0; i < items.length; i++) if (items[i].id === m.item) it = items[i];
    if (!it) return;
    var k = it.kind + "|" + invNorm_(it.brand) + "|" + invSizeKey_(it.size);
    onSheet[k] = onSheet[k] || { kind: it.kind, brand: it.brand, size: it.size, n: 0 }; onSheet[k].n += m.units || 1;
  });
  var keys = uniq_(Object.keys(onSheet).concat(Object.keys(shown)));
  keys.forEach(function (k) {
    var a = onSheet[k] ? onSheet[k].n : 0, p = shown[k] ? shown[k].n : 0;
    if (a === p) return;
    var o = onSheet[k] || shown[k];
    out.differs.push({ what: [o.brand, o.size].filter(Boolean).join(" "), kind: o.kind, sheets: a, photo: p });
  });
  out.day = day;
  return out;
}

/* ---- 13.50: the weekly shelf photos. Once a day's weekly photos are all
   read, every box of a brand they show that is in stock but was not seen on
   them is marked "unseen" (most likely used — it stays counted until the
   sheets or a count say otherwise); each size's boxes on the photos are put
   beside its count. A box seen again later is in stock again. ---- */
function weeklyCheck_(day) {
  var tab = stentUpRows_();
  var ups = tab.rows.filter(function (r) { return r.purpose === "weekly" && String(r.uploaded).slice(0, 10) === day; });
  if (!ups.length || ups.some(function (r) { return r.status === "queued"; })) return null;
  var upIds = {}, seen = {};
  ups.forEach(function (r) { upIds[r.id] = 1; ((r.result && r.result.seen) || []).forEach(function (id) { seen[id] = 1; }); });
  var boxes = boxRowsAll_();
  var onPhotos = boxes.filter(function (b) { return upIds[b.up] && b.status !== "background" && b.status !== "discarded"; });
  var brands = {}, perSize = {};
  onPhotos.forEach(function (b) {
    brands[(b.kind || "stent") + "|" + invNorm_(b.brand)] = 1;
    if (b.status === "check") return;
    var k = (b.kind || "stent") + "|" + invNorm_(b.brand) + "|" + invSizeKey_(boxSizeText_(b));
    perSize[k] = perSize[k] || { kind: b.kind || "stent", brand: b.brand, size: boxSizeText_(b), n: 0 }; perSize[k].n++;
  });
  var unseen = 0;
  boxes.forEach(function (b) {
    if (b.status !== "in stock" || upIds[b.up] || seen[b.id]) return;
    if (!brands[(b.kind || "stent") + "|" + invNorm_(b.brand)]) return;   // a brand not photographed this week is left alone
    if (String(b.readAt).slice(0, 10) >= day) return;
    b.status = "unseen"; b.why = "not on the weekly shelf photos of " + day + " — most likely used"; boxWrite_(b); unseen++;
  });
  // each size on the photos beside its count
  var items = invItems_(), tot = invTotals_(items, invMovesAll_()), sizes = [];
  Object.keys(perSize).forEach(function (k) {
    var o = perSize[k], it = invFind_(items, o.kind, o.brand, o.size);
    var have = it ? tot[it.id].stock : 0;
    if (have !== o.n) sizes.push({ item: it ? it.id : "", what: [o.brand, o.size].join(" "), kind: o.kind, photo: o.n, stock: have });
  });
  var res = { day: day, photos: ups.length, unseen: unseen, sizes: sizes, brands: Object.keys(brands).map(function (k) { return k.split("|")[1]; }) };
  PropertiesService.getScriptProperties().setProperty("WEEKLY_LAST", JSON.stringify(res).slice(0, 8500));
  return res;
}
/* The fix for stock photos put in "Used stents upload" by mistake: their
   stickers leave the Stents tab (so they are no longer taken off as used),
   and the photo is read again as a stock photo, box by box. */
function stentToStock_(req) {
  var ids = Array.isArray(req.ids) ? req.ids.map(String) : [];
  if (!ids.length) throw new Error("no photo picked");
  var by = cathStr_(req.by, 60) || "technician";
  var f = batchFolders_(), tab = stentUpRows_(), all = stentRowsAll_();
  var moved = 0, skipped = [];
  ids.forEach(function (id) {
    var r = tab.byId[id];
    if (!r || r.purpose === "stock") { skipped.push(id); return; }
    var mine = all.filter(function (x) { return x.up === r.id; });
    if (mine.length) stentDeleteRows_(mine.map(function (x) { return x.row; }));
    all = stentRowsAll_();
    try { DriveApp.getFileById(r.fileId).moveTo(f.invDone); } catch (e) {}
    r.purpose = "stock"; r.status = "queued"; r.result = null; r.tries = 0; r.stickers = 0;
    r.log = (r.log ? r.log + "\n" : "") + cathNow_() + " moved to the inventory by " + by + ": " + mine.length + " sticker(s) no longer taken off as used; to be read again as a stock photo";
    stentUpWrite_(r);
    moved++;
  });
  var items = invItems_(), mv = invMovesAll_();
  invSyncStickers_(items, mv, by);
  if (items.some(function (x) { return x.isNew; })) invWriteTab_(items);
  try { stentBoxUse_(by); } catch (eB) {}
  return { moved: moved, skipped: skipped, said: moved + " photo(s) moved to the inventory; they are read box by box on the next run (or press Read inventory photos now)" + (skipped.length ? "; " + skipped.length + " skipped (already stock or not found)" : "") + "." };
}
/* "Read all stock photos again": every stock photo's boxes (and the stock
   they added) are cleared and the photos read again, box by box */
function invReread_(req) {
  var by = cathStr_(req.by, 60) || "technician";
  var tab = stentUpRows_(), ids = Array.isArray(req.ids) && req.ids.length ? req.ids.map(String) : null;
  var list = tab.rows.filter(function (r) { return r.purpose === "stock" && (!ids || ids.indexOf(r.id) >= 0) && r.status !== "dismissed"; });
  if (!list.length) throw new Error("no stock photo to read again");
  var want = {}; list.forEach(function (r) { want[r.id] = 1; });
  var boxes = boxRowsAll_().filter(function (b) { return want[b.up]; });
  boxDeleteRows_(boxes.map(function (b) { return b.row; }));
  list.forEach(function (r) {
    r.status = "queued"; r.result = null; r.tries = 0; r.stickers = 0; r.errors = [];
    r.log = (r.log ? r.log + "\n" : "") + cathNow_() + " to be read again (box by box) — asked by " + by;
    stentUpWrite_(r);
  });
  var sync = boxSyncMoves_(by);
  return { queued: list.length, said: list.length + " stock photo(s) will be read again box by box; the " + boxes.length + " box(es) and the stock they added are cleared until then." };
}
/* 13.49 — the automatic correction, done once after 13.49 goes in:
   - the stock photos read photo-by-photo by 13.48 (no boxes yet) are read
     again box by box;
   - the photos of stock put in "Used stents upload" by mistake and not yet
     moved — read as used stents from 19 Nov 2026, with no patient name or
     number and three or more stickers — leave the Stents tab and are read as
     stock photos too.
   Until each is read again its 13.48 stock stays; once read, its boxes
   replace it (repeats across the overlapping photos counted once).
   Returns true while photos of the correction still wait to be read. */
var INV_FIX_FROM = "2026-11-19";
function invAutoFix_(runId) {
  var pr = PropertiesService.getScriptProperties();
  var done = pr.getProperty("INV_BOXFIX");
  if (done) {
    var d = {}; try { d = JSON.parse(done) || {}; } catch (e) {}
    if (d.finished) return false;
    var tab0 = stentUpRows_(), want = {}; (d.ids || []).forEach(function (id) { want[id] = 1; });
    var left = tab0.rows.filter(function (r) { return want[r.id] && r.status === "queued"; }).length;
    if (!left) {
      d.finished = cathNow_();
      var bx = boxRowsAll_().filter(function (b) { return want[b.up]; });
      d.result = { counted: bx.filter(function (b) { return b.status === "in stock"; }).length, repeats: bx.filter(function (b) { return b.status === "repeat"; }).length,
        check: bx.filter(function (b) { return b.status === "check"; }).length,
        failed: tab0.rows.filter(function (r) { return want[r.id] && r.status === "failed"; }).length };
      pr.setProperty("INV_BOXFIX", JSON.stringify(d));
      batchLogRow_(runId, "", "", "stock correction", "finished", d.result.counted + " box(es) counted, " + d.result.repeats + " repeat(s) not counted, " + d.result.check + " to check");
    }
    return left > 0;
  }
  var tab = stentUpRows_(), boxes = boxRowsAll_(), hasBoxes = {};
  boxes.forEach(function (b) { hasBoxes[b.up] = 1; });
  var stock = tab.rows.filter(function (r) { return r.purpose === "stock" && r.status !== "dismissed" && r.status !== "queued" && !hasBoxes[r.id]; });
  var misplaced = tab.rows.filter(function (r) {
    var day = String(r.uploaded || r.scannedAt || "").slice(0, 10);
    return r.purpose === "used" && r.status === "scanned" && !String(r.patient || "").trim() && !String(r.number || "").trim() && (r.stickers || 0) >= 3 && day >= INV_FIX_FROM;
  });
  var rec = { at: cathNow_(), ids: [], reread: stock.map(function (r) { return r.file; }), moved: misplaced.map(function (r) { return r.file; }) };
  if (misplaced.length) stentToStock_({ ids: misplaced.map(function (r) { return r.id; }), by: "automatic correction (13.49)" });
  tab = stentUpRows_();
  stock.forEach(function (r0) {
    var r = tab.byId[r0.id];
    r.status = "queued"; r.result = null; r.tries = 0; r.stickers = 0; r.errors = [];
    r.log = (r.log ? r.log + "\n" : "") + cathNow_() + " automatic correction (13.49): to be read again box by box";
    stentUpWrite_(r);
  });
  rec.ids = stock.map(function (r) { return r.id; }).concat(misplaced.map(function (r) { return r.id; }));
  if (!rec.ids.length) rec.finished = rec.at;
  pr.setProperty("INV_BOXFIX", JSON.stringify(rec));
  batchLogRow_(runId, "", "", "stock correction", "started", rec.reread.length + " stock photo(s) to read again box by box" +
    (rec.moved.length ? "; " + rec.moved.length + " photo(s) of stock found among the used-stent photos (" + rec.moved.join(", ") + ") moved to the inventory" : ""));
  return rec.ids.length > 0;
}

/* 13.50 — the balloon boxes of 20 Nov 2026, read by Claude from the
   technicians' photos sent in chat (not through Gemini), written once into
   "Stock boxes" on the first run after 13.50 goes in. Uses of these balloons
   are taken off from 21 Nov (the day after the photos). A box past its expiry
   is put "to check", not counted.
   Each: [photo, brand, diameter, length, LOT, own No., REF, expiry, barcode line, place] */
var IMPORT_20NOV = [
  // Tanzor NC (Veiva Scientific)
  ["Tanzor NC stack 1", "Tanzor NC", 2, 12, "E1226AQ", "", "VSTZN20012", "06-2028", "", "stack, box 1 from the top"],
  ["Tanzor NC stack 1", "Tanzor NC", 2, 12, "E1226AQ", "", "VSTZN20012", "06-2028", "", "stack, box 2"],
  ["Tanzor NC stack 1", "Tanzor NC", 2, 12, "E1226AJ", "", "VSTZN20012", "04-2028", "", "stack, box 3"],
  ["Tanzor NC stack 1", "Tanzor NC", 2.5, 12, "G1226AQ", "", "VSTZN25012", "06-2028", "", "stack, box 4"],
  ["Tanzor NC stack 1", "Tanzor NC", 2.5, 12, "G1226AJ", "", "VSTZN25012", "04-2028", "", "stack, box 5"],
  ["Tanzor NC stack 1", "Tanzor NC", 2.5, 12, "G1226AN", "", "VSTZN25012", "05-2028", "", "stack, box 6"],
  ["Tanzor NC stack 1", "Tanzor NC", 2.5, 12, "G1226AN", "", "VSTZN25012", "05-2028", "", "stack, box 7"],
  ["Tanzor NC stack 2", "Tanzor NC", 2.25, 12, "F1226AW", "", "VSTZN22512", "06-2028", "", "stack, box 1 from the top"],
  ["Tanzor NC stack 2", "Tanzor NC", 2.75, 12, "H1226AG", "", "VSTZN27512", "04-2028", "", "stack, box 2"],
  ["Tanzor NC stack 2", "Tanzor NC", 3, 10, "I1026AN", "", "VSTZN30010", "05-2028", "", "stack, box 3"],
  ["Tanzor NC stack 2", "Tanzor NC", 3.5, 12, "K1226AS", "", "VSTZN35012", "06-2028", "", "stack, box 4"],
  ["Tanzor NC stack 2", "Tanzor NC", 3.75, 10, "L1026AX", "", "VSTZN37510", "06-2028", "", "stack, box 5"],
  ["Tanzor NC stack 2", "Tanzor NC", 3.75, 12, "L1226AX", "", "VSTZN37512", "06-2028", "", "stack, box 6"],
  // NC Trek (Abbott)
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2.75, 12, "51217G1", "", "1012448-12", "2028-11-30", "(01)08717648151811(17)281130(10)51217G1(91)6736", "stack, box 1 from the top"],
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2.75, 12, "51120G2", "", "1012448-12", "2028-10-31", "(01)08717648151811(17)281031(10)51120G2(91)7488", "stack, box 2"],
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2.5, 12, "60414G1", "", "1012447-12", "2029-03-31", "(01)08717648151750(17)290331(10)60414G1(91)6015", "stack, box 3"],
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2.5, 8, "51204G1", "", "1012447-08", "2028-11-30", "(01)08717648151743(17)281130(10)51204G1(91)6678", "stack, box 4"],
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2.5, 8, "60625G2", "", "1012447-08", "2029-05-31", "(01)08717648151743(17)290531(10)60625G2(91)6716", "stack, box 5"],
  ["NC Trek 2.00–2.75 stack", "NC Trek", 2, 12, "41107G1", "", "1012445-12", "2027-10-31", "(01)08717648151644(17)271031(10)41107G1(91)6171", "stack, box 6"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 6, "40828G1", "", "1012451-06", "2027-07-31", "(01)08717648151958(17)270731(10)40828G1(91)6265", "stack, box 1 from the top"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 6, "20331G1", "", "1012451-06", "2025-02-28", "(01)08717648151958(17)250228(10)20331G1(91)4790", "stack, box 2 — \"Billed\" written on it"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 8, "50721G1", "", "1012451-08", "2028-06-30", "(01)08717648151965(17)280630(10)50721G1(91)6136", "stack, box 3"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 8, "50513G1", "", "1012451-08", "2028-04-30", "(01)08717648151965(17)280430(10)50513G1(91)6957", "stack, box 4"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 8, "50513G1", "", "1012451-08", "2028-04-30", "(01)08717648151965(17)280430(10)50513G1(91)6928", "stack, box 5"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 12, "50505G1", "", "1012451-12", "2028-04-30", "(01)08717648151972(17)280430(10)50505G1(91)6722", "stack, box 6"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 12, "50902G1", "", "1012451-12", "2028-08-31", "", "stack, box 7"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 12, "50821G2", "", "1012451-12", "2028-07-31", "(01)08717648151972(17)280731(10)50821G2(91)7023", "stack, box 8"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 12, "50505G1", "", "1012451-12", "2028-04-30", "", "stack, box 9"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 15, "20822G1", "", "1012451-15", "2025-07-31", "", "stack, box 10 — marked in pen"],
  ["NC Trek 3.50 stack", "NC Trek", 3.5, 15, "50918G2", "", "1012451-15", "2028-08-31", "(01)08717648151989(17)280831(10)50918G2(91)6314", "stack, box 11"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 8, "41104G1", "", "1012450-08", "2027-10-31", "(01)08717648151910(17)271031(10)41104G1(91)6203", "stack, box 1 from the top"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 8, "50401G1", "", "1012450-08", "2028-03-31", "(01)08717648151910(17)280331(10)50401G1(91)6471", "stack, box 2"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 8, "50401G1", "", "1012450-08", "2028-03-31", "(01)08717648151910(17)280331(10)50401G1(91)6693", "stack, box 3"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 8, "31128G1", "", "1012450-08", "2026-10-31", "", "stack, box 4"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 12, "50404G1", "", "1012450-12", "2028-03-31", "(01)08717648151927(17)280331(10)50404G1(91)6900", "stack, box 5"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 12, "40810G1", "", "1012450-12", "2027-07-31", "", "stack, box 6"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 12, "40605G1", "", "1012450-12", "2027-05-31", "(01)08717648151927(17)270531(10)40605G1(91)6573", "stack, box 7 — marked in pen"],
  ["NC Trek 3.25 stack", "NC Trek", 3.25, 15, "21101G1", "", "1012450-15", "2025-10-31", "", "stack, box 8 — \"Billed\" written on it"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 12, "60205G1", "", "1012449-12", "2029-01-31", "(01)08717648151866(17)290131(10)60205G1(91)6263", "stack, box 1 from the top"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 12, "50917G1", "", "1012449-12", "2028-08-31", "(01)08717648151866(17)280831(10)50917G1(91)6892", "stack, box 2"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 12, "60207G1", "", "1012449-12", "2029-01-31", "(01)08717648151866(17)290131(10)60207G1(91)6391", "stack, box 3"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 12, "60318G1", "", "1012449-12", "2029-02-28", "(01)08717648151866(17)290228(10)60318G1(91)6466", "stack, box 4"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 8, "50702G1", "", "1012449-08", "2028-06-30", "(01)08717648151859(17)280630(10)50702G1(91)6109", "stack, box 5"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 8, "51121G1", "", "1012449-08", "2028-10-31", "(01)08717648151859(17)281031(10)51121G1(91)7250", "stack, box 6"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 8, "50301G1", "", "1012449-08", "2028-02-29", "(01)08717648151859(17)280229(10)50301G1(91)7093", "stack, box 7"],
  ["NC Trek 3.00 stack", "NC Trek", 3, 6, "40518G1", "", "1012449-06", "2027-04-30", "(01)08717648151842(17)270430(10)40518G1(91)6136", "stack, box 8"],
  // Mini Trek (Abbott)
  ["Mini Trek stack", "Mini Trek", 1.5, 12, "60401G1", "", "1012269-12", "2029-03-31", "(01)08717648138096(17)290331(10)60401G1(91)6219", "stack, box 1 from the top"],
  ["Mini Trek stack", "Mini Trek", 1.5, 12, "60817G1", "", "1012269-12", "2029-07-31", "(01)08717648138096(17)290731(10)60817G1(91)6180", "stack, box 2"],
  ["Mini Trek stack", "Mini Trek", 1.5, 8, "60123G1", "", "1012269-08", "2028-12-31", "(01)08717648138089(17)281231(10)60123G1(91)6976", "stack, box 3"],
  ["Mini Trek stack", "Mini Trek", 1.5, 8, "60414G1", "", "1012269-08", "2029-03-31", "(01)08717648138089(17)290331(10)60414G1(91)6548", "stack, box 4"],
  ["Mini Trek stack", "Mini Trek", 1.5, 8, "60123G1", "", "1012269-08", "2028-12-31", "(01)08717648138089(17)281231(10)60123G1(91)6190", "stack, box 5"],
  ["Mini Trek stack", "Mini Trek", 1.2, 6, "41022G1", "", "1012268-06", "2027-09-30", "(01)08717648138027(17)270930(10)41022G1(91)6592", "stack, box 6"],
  ["Mini Trek stack", "Mini Trek", 1.2, 12, "41121G1", "", "1012268-12", "2027-10-31", "(01)08717648138041(17)271031(10)41121G1(91)6271", "stack, box 7"],
  ["Mini Trek stack", "Mini Trek", 1.2, 15, "31208G1", "", "1012268-15", "2026-11-30", "(01)08717648138058(17)261130(10)31208G1(91)6985", "stack, box 8 — expires 30 Nov 2026"],
  // NC Rockstar (Sanavascular) — no LOT; each box's own number
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 8, "", "133329072026H0337014", "NCP-4.00-08-RX", "2029-07-20", "", "stack, box 1 from the top"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 8, "", "133329081426J0185011", "NCP-4.00-08-RX", "2029-08-14", "", "stack, box 2"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 8, "", "133329081426J0185002", "NCP-4.00-08-RX", "2029-08-14", "", "stack, box 3"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 12, "", "133428112125M0300008", "NCP-4.00-12-RX", "2028-11-21", "", "stack, box 4"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 12, "", "133428112125M0300001", "NCP-4.00-12-RX", "2028-11-21", "", "stack, box 5"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 12, "", "133428122226A0520010", "NCP-4.00-12-RX", "2028-12-22", "", "stack, box 6"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 15, "", "133528081925J0254007", "NCP-4.00-15-RX", "2028-08-19", "", "stack, box 7"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4, 15, "", "133528110425M0292011", "NCP-4.00-15-RX", "2028-11-04", "", "stack, box 8"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4.5, 8, "", "133728042825F0125007", "NCP-4.50-08-RX", "2028-04-28", "", "stack, box 9"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4.5, 12, "", "133828042825F0159005", "NCP-4.50-12-RX", "2028-04-28", "", "stack, box 10"],
  ["NC Rockstar 4.00–4.50 stack", "NC Rockstar", 4.5, 15, "", "133928021325C293002", "NCP-4.50-15-RX", "2028-02-13", "", "stack, box 11"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 12, "", "130229080926J0179108", "NCP-2.00-12-RX", "2029-08-09", "", "stack, box 1 from the top"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 12, "", "130229080926J0179106", "NCP-2.00-12-RX", "2029-08-09", "", "stack, box 2"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 15, "", "130329011226A0535034", "NCP-2.00-15-RX", "2029-01-12", "", "stack, box 3"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 15, "", "130328111825M0298015", "NCP-2.00-15-RX", "2028-11-18", "", "stack, box 4"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 15, "", "130328111825M0298019", "NCP-2.00-15-RX", "2028-11-18", "", "stack, box 5"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 15, "", "130329011226A0535010", "NCP-2.00-15-RX", "2029-01-12", "", "stack, box 6"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2, 15, "", "130329011226A0535035", "NCP-2.00-15-RX", "2029-01-12", "", "stack, box 7"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2.5, 8, "", "130929040926E0218018", "NCP-2.50-08-RX", "2029-04-09", "", "stack, box 8"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2.5, 12, "", "131029082026J0191151", "NCP-2.50-12-RX", "2029-08-20", "", "stack, box 9"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2.5, 12, "", "131029082026J0191109", "NCP-2.50-12-RX", "2029-08-20", "", "stack, box 10"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2.5, 15, "", "131129072026H0338076", "NCP-2.50-15-RX", "2029-07-20", "", "stack, box 11"],
  ["NC Rockstar 2.00–2.50 stack", "NC Rockstar", 2.5, 15, "", "131129072026H0338051", "NCP-2.50-15-RX", "2029-07-20", "", "stack, box 12"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 2.75, 12, "", "131429060926G0095051", "NCP-2.75-12-RX", "2029-06-09", "", "stack, box 1 from the top"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829082026J0188111", "NCP-3.00-12-RX", "2029-08-20", "", "stack, box 2"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829082026J0188073", "NCP-3.00-12-RX", "2029-08-20", "", "stack, box 3"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829082026J0188087", "NCP-3.00-12-RX", "2029-08-20", "", "stack, box 4"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829082026J0188100", "NCP-3.00-12-RX", "2029-08-20", "", "stack, box 5"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829040226E0212034", "NCP-3.00-12-RX", "2029-04-02", "", "stack, box 6"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 12, "", "131829082026J0188094", "NCP-3.00-12-RX", "2029-08-20", "", "stack, box 7"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 15, "", "131929060126F0602039", "NCP-3.00-15-RX", "2029-06-01", "", "stack, box 8"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 15, "", "131929081426J0184049", "NCP-3.00-15-RX", "2029-08-14", "", "stack, box 9"],
  ["NC Rockstar 2.75–3.00 stack", "NC Rockstar", 3, 15, "", "131929081426J0184082", "NCP-3.00-15-RX", "2029-08-14", "", "stack, box 10"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 8, "", "132129010826A0534003", "NCP-3.25-08-RX", "2029-01-08", "", "stack, box 1 from the top"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 8, "", "132128020925C286013", "NCP-3.25-08-RX", "2028-02-09", "", "stack, box 2"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 8, "", "132128091125M0286010", "NCP-3.25-08-RX", "2028-09-11", "", "stack, box 3"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 12, "", "132229082026J0189038", "NCP-3.25-12-RX", "2029-08-20", "", "stack, box 4"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 15, "", "132329080926J0178013", "NCP-3.25-15-RX", "2029-08-09", "", "stack, box 5"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 15, "", "132329080926J0178025", "NCP-3.25-15-RX", "2029-08-09", "", "stack, box 6"],
  ["NC Rockstar 3.25 stack", "NC Rockstar", 3.25, 20, "", "132428022625C301004", "NCP-3.25-20-RX", "2028-02-26", "", "stack, box 7"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.5, 12, "", "132629082026J0187092", "NCP-3.50-12-RX", "2029-08-20", "", "stack, box 1 from the top"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.5, 12, "", "132629082026J0187069", "NCP-3.50-12-RX", "2029-08-20", "", "stack, box 2"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.5, 15, "", "132729060126F0601003", "NCP-3.50-15-RX", "2029-06-01", "", "stack, box 3"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.75, 12, "", "133028111025M0296005", "NCP-3.75-12-RX", "2028-11-10", "", "stack, box 4"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.75, 8, "", "132928022625C304007", "NCP-3.75-08-RX", "2028-02-26", "", "stack, box 5"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.75, 8, "", "132929030926E0204003", "NCP-3.75-08-RX", "2029-03-09", "", "stack, box 6"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.75, 12, "", "133029041726E0221002", "NCP-3.75-12-RX", "2029-04-17", "", "stack, box 7"],
  ["NC Rockstar 3.50–3.75 stack", "NC Rockstar", 3.75, 15, "", "133128011925C285013", "NCP-3.75-15-RX", "2028-01-19", "", "stack, box 8"]
];
var IMPORT_20NOV_DAY = "2026-11-20";
function boxExpiryIso_(e) {
  var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(e || "")) || null;
  if (m) return m[1] + "-" + m[2] + "-" + (m[3] || "28");
  var n = /^(\d{2})-(\d{4})$/.exec(String(e || ""));
  return n ? n[2] + "-" + n[1] + "-28" : "";
}
function invImport20Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_IMPORT_20NOV")) return false;
  pr.setProperty("INV_IMPORT_20NOV", "started " + cathNow_());
  var boxes = boxRowsAll_(), photos = [], byPhoto = {}, tot = { added: 0, repeat: 0, check: 0 };
  IMPORT_20NOV.forEach(function (x) { if (!byPhoto[x[0]]) { byPhoto[x[0]] = []; photos.push(x[0]); } byPhoto[x[0]].push(x); });
  photos.forEach(function (ph, i) {
    var up = { id: "CLAUDE-20NOV-" + (i + 1), file: ph + " (photo sent 20 Nov, read by Claude)", fileId: "" };
    var list = byPhoto[ph].map(function (x) {
      return { device: "Balloon", brand: x[1], manufacturer: x[1] === "Tanzor NC" ? "Veiva Scientific" : x[1] === "NC Rockstar" ? "Sanavascular" : "Abbott",
        diameter: String(x[2]), length: String(x[3]), lot: x[4], serial: x[5], ref: x[6], expiry: x[7], codes: x[8] ? [x[8]] : [], place: x[9] };
    });
    var c = boxTakePhoto_(up, list, "Claude (photos of 20 Nov)", "Claude", boxes, []);
    tot.added += c.added; tot.repeat += c.repeat; tot.check += c.check;
  });
  // the day of the photos (the start of these balloons counts from the day after), and expired boxes put to check
  var mine = boxRowsAll_().filter(function (b) { return String(b.up).indexOf("CLAUDE-20NOV-") === 0; });
  mine.forEach(function (b) {
    var changed = false;
    if (String(b.readAt).slice(0, 10) !== IMPORT_20NOV_DAY) { b.readAt = IMPORT_20NOV_DAY + " 16:00"; changed = true; }
    var ex = boxExpiryIso_(b.expiry);
    if (b.status === "in stock" && ex && ex < IMPORT_20NOV_DAY) { b.status = "check"; b.why = "expired " + b.expiry + (/billed/i.test(b.place) ? " and \"Billed\" written on the box" : "") + " — not counted; add it only if it is really in use"; changed = true; tot.added--; tot.check++; }
    if (changed) boxWrite_(b);
  });
  var sync = boxSyncMoves_("Claude (photos of 20 Nov)");
  pr.setProperty("INV_IMPORT_20NOV", JSON.stringify({ at: cathNow_(), boxes: IMPORT_20NOV.length, added: tot.added, repeat: tot.repeat, check: tot.check }));
  batchLogRow_(runId, "", "", "balloon stock of 20 Nov (read by Claude)", "written", IMPORT_20NOV.length + " box(es): " + tot.added + " counted, " + tot.repeat + " repeat(s), " + tot.check + " to check (expired)");
  return true;
}

/* 13.50 — once: the second Xience Alpine 4.0 × 33 on IMG_0035 (19 Nov, box 27,
   put to check with its LOT hidden) was photographed again on 21 Nov and
   confirmed on the shelf: same REF and expiry as LOT 5032541 beside it; its
   own LOT is not readable, so it is counted with no LOT */
var FIX_21NOV = [{ id: "XMWOJO0CO26", photo: "IMG_0035.JPG", brand: "Xience Alpine", dia: 4, len: 33,
  set: { ref: "1120400-33", expiry: "2028-03-23" },
  why: "confirmed on the shelf from Dr Yadav's photo of 21 Nov 2026 (read by Claude): REF 1120400-33, EXP 2028-03-23; LOT not readable on the box" }];
function invFix21Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_FIX_21NOV")) return false;
  var boxes = boxRowsAll_(), done = [], missed = [];
  FIX_21NOV.forEach(function (f) {
    var b = null;
    boxes.forEach(function (x) { if (x.id === f.id) b = x; });
    if (!b) boxes.forEach(function (x) {
      if (!b && x.status === "check" && x.photo === f.photo && invNorm_(x.brand) === invNorm_(f.brand) && Number(x.dia) === f.dia && Number(x.len) === f.len) b = x;
    });
    if (!b) { missed.push(f.id); return; }
    if (b.status === "check") {
      Object.keys(f.set).forEach(function (k) { if (!b[k] || k === "expiry") b[k] = f.set[k]; });
      b.status = "in stock"; b.why = f.why; b.same = "";
      b.checkedBy = "Claude (photo of 21 Nov)"; b.checkedAt = cathNow_();
      boxWrite_(b);
    }
    done.push(b.id + " " + b.status);
  });
  var sync = done.length ? boxSyncMoves_("Claude (photo of 21 Nov)") : null;
  pr.setProperty("INV_FIX_21NOV", JSON.stringify({ at: cathNow_(), done: done, missed: missed }));
  batchLogRow_(runId, "", "", "stock fix of 21 Nov (read by Claude)", missed.length ? "partly done" : "written",
    "Xience Alpine 4.0×33 EXP 2028-03-23: " + (done.join(", ") || "none") + (missed.length ? " · not found: " + missed.join(", ") : "") + (sync ? " · " + sync.added + " received move(s)" : ""));
  return true;
}

/* 13.50 — once: new stock of 23 Nov 2026 (Dr Yadav's photos, read by Claude):
   27 Yukon Choice Swift (each with its own serial; no expiry on the box end)
   and 7 Tanzor NC. All are new boxes: a Tanzor of the same LOT as a box of the
   20 Nov photos is another box (Dr Yadav), so it is counted, not taken as a repeat.
   [photo, kind, brand, maker, diameter, length, LOT, serial, REF, expiry, place] */
var IMPORT_23NOV = [
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 18, "SAAX110726", "SAAX110451", "", "", "stack, box 1 from the top"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 18, "SAAX110726", "SAAX110456", "", "", "stack, box 2"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 21, "SAAX110726", "SAAX110705", "", "", "stack, box 3"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 21, "SAAX110726", "SAAX110688", "", "", "stack, box 4"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 24, "SAAX110726", "SAAX110959", "", "", "stack, box 5"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 24, "SAAX110726", "SAAX110963", "", "", "stack, box 6"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 28, "SAAX110726", "SAAX111413", "", "", "stack, box 7"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 28, "SAAX110726", "SAAX111414", "", "", "stack, box 8"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 32, "SAAX110726", "SAAX111645", "", "", "stack, box 9"],
  ["Yukon Choice Swift 2.50 stack", "stent", "Yukon Choice Swift", "Translumina", 2.5, 32, "SAAX110726", "SAAX111641", "", "", "stack, box 10"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 21, "SAAX110726", "SAAX110797", "", "", "stack, box 1 from the top"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 21, "SAAX110726", "SAAX110794", "", "", "stack, box 2"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 24, "SAAX110726", "SAAX111015", "", "", "stack, box 3"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 24, "SAAX110726", "SAAX111013", "", "", "stack, box 4"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 28, "SAAX110726", "SAAX111437", "", "", "stack, box 5"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 28, "SAAX110726", "SAAX111436", "", "", "stack, box 6"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 32, "SAAY050826", "SAAY051478", "", "", "stack, box 7"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 32, "SAAX110726", "SAAX111673", "", "", "stack, box 8"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 36, "SAAW060726", "SAAW060236", "", "", "stack, box 9"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 36, "SAAW060726", "SAAW060248", "", "", "stack, box 10"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 40, "SAAX110726", "SAAX111867", "", "", "stack, box 11"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 40, "SAAX110726", "SAAX111866", "", "", "stack, box 12"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 44, "SAAQ090426", "SAAQ09690", "", "", "stack, box 13 (SN printed with 5 digits)"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 48, "SAAW060726", "SAAW060433", "", "", "stack, box 14"],
  ["Yukon Choice Swift 2.75 stack", "stent", "Yukon Choice Swift", "Translumina", 2.75, 48, "SAAW060726", "SAAW060443", "", "", "stack, box 15"],
  ["Yukon Choice Swift 2.75×18 pair", "stent", "Yukon Choice Swift", "Translumina", 2.75, 18, "SAAX110726", "SAAX110516", "", "", "upper box"],
  ["Yukon Choice Swift 2.75×18 pair", "stent", "Yukon Choice Swift", "Translumina", 2.75, 18, "SAAX110726", "SAAX110499", "", "", "lower box"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 3.5, 12, "K1226AS", "", "VSTZN35012", "06-2028", "box 1 from the left"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 3.5, 10, "K1026AN", "", "VSTZN35010", "05-2028", "box 2"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 3.5, 10, "K1026AN", "", "VSTZN35010", "05-2028", "box 3"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 2.5, 12, "G1226AQ", "", "VSTZN25012", "06-2028", "box 4"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 2.5, 12, "G1226AQ", "", "VSTZN25012", "06-2028", "box 5"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 2, 12, "E1226AQ", "", "VSTZN20012", "06-2028", "box 6"],
  ["Tanzor NC row", "balloon", "Tanzor NC", "Veiva Scientific", 2, 12, "E1226AS", "", "VSTZN20012", "06-2028", "box 7"],
];
var IMPORT_23NOV_DAY = "2026-11-23";
function invImport23Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_IMPORT_23NOV")) return false;
  pr.setProperty("INV_IMPORT_23NOV", "started " + cathNow_());
  var boxes = boxRowsAll_(), photos = [], byPhoto = {}, tot = { added: 0, check: 0 };
  IMPORT_23NOV.forEach(function (x) { if (!byPhoto[x[0]]) { byPhoto[x[0]] = []; photos.push(x[0]); } byPhoto[x[0]].push(x); });
  photos.forEach(function (ph, i) {
    var up = { id: "CLAUDE-23NOV-" + (i + 1), file: ph + " (photo sent 23 Nov, read by Claude)", fileId: "" };
    var list = byPhoto[ph].map(function (x) {
      return { device: x[1] === "balloon" ? "Balloon" : "Stent", brand: x[2], manufacturer: x[3], diameter: String(x[4]), length: String(x[5]),
        lot: x[6], serial: x[7], ref: x[8], expiry: x[9], codes: [], place: x[10] };
    });
    boxTakePhoto_(up, list, "Claude (photos of 23 Nov)", "Claude", boxes, []);
  });
  var mine = boxRowsAll_().filter(function (b) { return String(b.up).indexOf("CLAUDE-23NOV-") === 0; });
  mine.forEach(function (b) {
    var changed = false;
    if (String(b.readAt).slice(0, 10) !== IMPORT_23NOV_DAY) { b.readAt = IMPORT_23NOV_DAY + " 11:30"; changed = true; }
    if (b.status === "repeat") {
      b.why = "new delivery of 23 Nov — another box of a LOT already in stock (" + (b.lot || b.serial) + "), confirmed new by Dr Yadav";
      b.status = "in stock"; b.same = ""; changed = true;
    }
    if (changed) boxWrite_(b);
    if (b.status === "in stock") tot.added++; else tot.check++;
  });
  boxSyncMoves_("Claude (photos of 23 Nov)");
  pr.setProperty("INV_IMPORT_23NOV", JSON.stringify({ at: cathNow_(), boxes: IMPORT_23NOV.length, added: tot.added, check: tot.check }));
  batchLogRow_(runId, "", "", "new stock of 23 Nov (read by Claude)", tot.check ? "partly written" : "written",
    IMPORT_23NOV.length + " box(es): " + tot.added + " counted" + (tot.check ? ", " + tot.check + " to check" : "") + " (27 Yukon Choice Swift, 7 Tanzor NC)");
  return true;
}


/* 13.50 — once: more stock of 23 Nov 2026 (Dr Yadav's photos, read by Claude):
   17 Ultima PC (Translumina; each box with REF, LOT, serial and use-by), a
   stack of 13 Yukon Choice Swift 3.00 mm and one of 8 Yukon Choice Swift 3.50 mm. Counted as found on the shelf: a box
   already in stock from an earlier photo (the 3.00×32 of LOT SAAX110726 on the
   20 Nov photo, which had no serial) is taken as the same box and given its
   serial, not counted twice.
   [photo, kind, brand, maker, diameter, length, LOT, serial, REF, expiry, place] */
var IMPORT_23NOV_B = [
  ["Ultima PC box 1", "stent", "Ultima PC", "Translumina", 3, 18, "UAWD210226", "UAWD21284", "UAPC3018", "01-2028", "box label"],
  ["Ultima PC box 2", "stent", "Ultima PC", "Translumina", 3, 21, "UAWE240226", "UAWE24273", "UAPC3021", "01-2028", "box label"],
  ["Ultima PC box 3", "stent", "Ultima PC", "Translumina", 3, 18, "UAVK261225", "UAVK26311", "UAPC3018", "11-2027", "box label"],
  ["Ultima PC box 4", "stent", "Ultima PC", "Translumina", 3, 28, "UAWJ170326", "UAWJ17857", "UAPC3028", "02-2028", "box label"],
  ["Ultima PC box 5", "stent", "Ultima PC", "Translumina", 3, 28, "UAWA160226", "UAWA16859", "UAPC3028", "01-2028", "box label"],
  ["Ultima PC box 6", "stent", "Ultima PC", "Translumina", 3, 40, "UAWI110326", "UAWI11970", "UAPC3040", "02-2028", "box label"],
  ["Ultima PC box 7", "stent", "Ultima PC", "Translumina", 3, 44, "UAXI020626", "UAXI021609", "UAPC3044", "05-2029", "box label"],
  ["Ultima PC box 8", "stent", "Ultima PC", "Translumina", 3.5, 44, "UAVJ251225", "UAVJ25806", "UAPC3544", "11-2028", "box label"],
  ["Ultima PC box 9", "stent", "Ultima PC", "Translumina", 3.5, 36, "UAWW180426", "UAWW18554", "UAPC3536", "03-2029", "box label"],
  ["Ultima PC box 10", "stent", "Ultima PC", "Translumina", 3.5, 40, "UAWI110326", "UAWI11995", "UAPC3540", "02-2028", "box label"],
  ["Ultima PC box 11", "stent", "Ultima PC", "Translumina", 3.5, 48, "UAXC150526", "UAXC151980", "UAPC3548", "04-2029", "box label"],
  ["Ultima PC box 12", "stent", "Ultima PC", "Translumina", 3.5, 36, "UAWW180426", "UAWW18565", "UAPC3536", "03-2029", "box label"],
  ["Ultima PC box 13", "stent", "Ultima PC", "Translumina", 3.5, 28, "UAXS170726", "UAXS171399", "UAPC3528", "06-2028", "box label"],
  ["Ultima PC box 14", "stent", "Ultima PC", "Translumina", 3.5, 24, "UAWE240226", "UAWE24627", "UAPC3524", "01-2028", "box label"],
  ["Ultima PC box 15", "stent", "Ultima PC", "Translumina", 3.5, 18, "UAWI110326", "UAWI11483", "UAPC3518", "02-2028", "box label"],
  ["Ultima PC box 16", "stent", "Ultima PC", "Translumina", 3.5, 48, "UAXT200726", "UAXT201937", "UAPC3548", "06-2029", "box label"],
  ["Ultima PC box 17", "stent", "Ultima PC", "Translumina", 3.5, 44, "UAVJ251225", "UAVJ25809", "UAPC3544", "11-2028", "box label"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 32, "SAAY050826", "SAAY051550", "", "", "stack, box 1 from the top"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 32, "SAAX110726", "SAAX111715", "", "", "stack, box 2"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 44, "SABA070926", "SABA071740", "", "", "stack, box 3"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 21, "SAAX110726", "SAAX110813", "", "", "stack, box 4"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 21, "SAAX110726", "SAAX110820", "", "", "stack, box 5"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 24, "SAAX110726", "SAAX111128", "", "", "stack, box 6"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 24, "SAAX110726", "SAAX111129", "", "", "stack, box 7"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 28, "SAAX110726", "SAAX111527", "", "", "stack, box 8"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 36, "SAAW060726", "SAAW060308", "", "", "stack, box 9"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 36, "SAAW060726", "SAAW060305", "", "", "stack, box 10"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 40, "SAAY050826", "SAAY051752", "", "", "stack, box 11"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 48, "SAAW060726", "SAAW060456", "", "", "stack, box 12"],
  ["Yukon Choice Swift 3.00 stack", "stent", "Yukon Choice Swift", "Translumina", 3, 48, "SAAW060726", "SAAW060460", "", "", "stack, box 13"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 18, "SAAX110726", "SAAX110593", "", "", "stack, box 1 from the top"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 24, "SAAX110726", "SAAX111291", "", "", "stack, box 2"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 21, "SAAX110726", "SAAX110910", "", "", "stack, box 3"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 21, "SAAX110726", "SAAX110892", "", "", "stack, box 4"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 28, "SAAX110726", "SAAX111545", "", "", "stack, box 5"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 32, "SAAX110726", "SAAX111738", "", "", "stack, box 6"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 32, "SAAX110726", "SAAX111736", "", "", "stack, box 7"],
  ["Yukon Choice Swift 3.50 stack", "stent", "Yukon Choice Swift", "Translumina", 3.5, 40, "SAAX110726", "SAAX111924", "", "", "stack, box 8"],
];
function invImport23NovB_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_IMPORT_23NOV_B")) return false;
  pr.setProperty("INV_IMPORT_23NOV_B", "started " + cathNow_());
  var who = "Claude (photos of 23 Nov, Ultima PC and Yukon 3.00 / 3.50)";
  var boxes = boxRowsAll_(), photos = [], byPhoto = {}, tot = { added: 0, same: 0, check: 0 };
  IMPORT_23NOV_B.forEach(function (x) { if (!byPhoto[x[0]]) { byPhoto[x[0]] = []; photos.push(x[0]); } byPhoto[x[0]].push(x); });
  photos.forEach(function (ph, i) {
    var up = { id: "CLAUDE-23NOVB-" + (i + 1), file: ph + " (photo sent 23 Nov, read by Claude)", fileId: "" };
    var list = byPhoto[ph].map(function (x) {
      return { device: "Stent", brand: x[2], manufacturer: x[3], diameter: String(x[4]), length: String(x[5]),
        lot: x[6], serial: x[7], ref: x[8], expiry: x[9], codes: [], place: x[10] };
    });
    boxTakePhoto_(up, list, who, "Claude", boxes, []);
  });
  var all = boxRowsAll_(), byId = {};
  all.forEach(function (b) { byId[b.id] = b; });
  all.filter(function (b) { return String(b.up).indexOf("CLAUDE-23NOVB-") === 0; }).forEach(function (b) {
    var changed = false;
    if (String(b.readAt).slice(0, 10) !== IMPORT_23NOV_DAY) { b.readAt = IMPORT_23NOV_DAY + " 13:30"; changed = true; }
    if (b.status === "repeat") {
      // the same box as one already counted: the older row gets this one's serial
      var old = b.same ? byId[b.same] : null;
      if (old && !old.serial && b.serial) { old.serial = b.serial; old.why = cathStr_((old.why ? old.why + "; " : "") + "serial " + b.serial + " from the photo of 23 Nov", 300); boxWrite_(old); }
      tot.same++;
    } else if (b.status === "in stock") tot.added++; else tot.check++;
    if (changed) boxWrite_(b);
  });
  boxSyncMoves_(who);
  pr.setProperty("INV_IMPORT_23NOV_B", JSON.stringify({ at: cathNow_(), boxes: IMPORT_23NOV_B.length, added: tot.added, same: tot.same, check: tot.check }));
  batchLogRow_(runId, "", "", "more stock of 23 Nov (read by Claude)", tot.check ? "partly written" : "written",
    IMPORT_23NOV_B.length + " box(es): " + tot.added + " counted" + (tot.same ? ", " + tot.same + " already in stock from an earlier photo" : "") + (tot.check ? ", " + tot.check + " to check" : "") + " (17 Ultima PC, 13 Yukon Choice Swift 3.00, 8 Yukon Choice Swift 3.50)");
  return true;
}

/* 13.50: 54 Biomime Aura boxes (Meril) photographed on 23 Nov: 4.00 (3), 3.50 (13), 3.00 (9),
   2.75 (12), 2.25 (4) and 2.50 (13). Each has its own serial (SN) on the box; they are counted as found. */
var IMPORT_23NOV_C = [
  ["Biomime Aura 4.00 trio", "stent", "Biomime Aura", "Meril", 4, 19, "AJ99", "CL19AJ99006", "BIA40019", "2027-05-18", "box on the shelf photo"],
  ["Biomime Aura 4.00 trio", "stent", "Biomime Aura", "Meril", 4, 37, "AL10", "CL37AL10002", "BIA40037", "2028-02-08", "box on the shelf photo"],
  ["Biomime Aura 4.00 trio", "stent", "Biomime Aura", "Meril", 4, 19, "AJ18", "CL19AJ18001", "BIA40019", "2026-11-15", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 13, "AJ78", "CM13AJ78075", "BIA35013", "2027-04-08", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 16, "AJ78", "CM16AJ78026", "BIA35016", "2027-04-08", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 19, "PFJ16", "CM19PFJ16193", "BIA35019", "2029-02-01", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 24, "AL49", "CM24AL49003", "BIA35024", "2028-04-24", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 29, "PFJ26", "CM29PFJ26139", "BIA35029", "2029-02-21", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 32, "AJ44", "CM32AJ44042", "BIA35032", "2027-02-28", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 37, "PFJ34", "CM37PFJ34026", "BIA35037", "2029-03-10", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 37, "AO50", "CM37AO50168", "BIA35037", "2029-04-21", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 40, "AO75", "CM40AO75058", "BIA35040", "2029-06-19", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 40, "AO49", "CM40AO49027", "BIA35040", "2029-04-20", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 44, "PFJ41", "CM44PFJ41132", "BIA35044", "2029-03-13", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 44, "AO54", "CM44AO54029", "BIA35044", "2029-04-29", "box on the shelf photo"],
  ["Biomime Aura 3.50 stack", "stent", "Biomime Aura", "Meril", 3.5, 48, "AJ92", "CM48AJ92078", "BIA35048", "2027-05-03", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 13, "AK54", "CM13AK54002", "BIA30013", "2027-08-30", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 16, "AO45", "CM16AO45129", "BIA30016", "2029-04-20", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 19, "AN29", "CM19AN29072", "BIA30019", "2028-12-22", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 19, "AN26", "CM19AN26070", "BIA30019", "2028-12-17", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 24, "AO56", "CM24AO56032", "BIA30024", "2029-05-01", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 29, "AO65", "CM29AO65083", "BIA30029", "2029-05-27", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 32, "AO23", "CM32AO23265", "BIA30032", "2029-03-25", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 40, "AJ69", "CM40AJ69024", "BIA30040", "2027-03-29", "box on the shelf photo"],
  ["Biomime Aura 3.00 stack", "stent", "Biomime Aura", "Meril", 3, 44, "PFJ37", "CM44PFJ37007", "BIA30044", "2029-03-15", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 13, "AK18", "CM13AK18096", "BIA27513", "2027-06-12", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 16, "AN32", "CM16AN32012", "BIA27516", "2028-12-23", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 16, "AK25", "CM16AK25002", "BIA27516", "2027-06-18", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 19, "AM08", "CM19AM08029", "BIA27519", "2028-08-21", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 19, "AO39", "CM19AO39169", "BIA27519", "2029-04-11", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 24, "AK25", "CM24AK25021", "BIA27524", "2027-06-18", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 29, "AO37", "CM29AO37191", "BIA27529", "2029-04-09", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 32, "AN27", "CM32AN27045", "BIA27532", "2028-12-19", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 32, "AO33", "CM32AO33057", "BIA27532", "2029-04-01", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 40, "AO48", "CM40AO48059", "BIA27540", "2029-04-19", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 44, "AO69", "CM44AO69003", "BIA27544", "2029-06-01", "box on the shelf photo"],
  ["Biomime Aura 2.75 stack", "stent", "Biomime Aura", "Meril", 2.75, 48, "AO73", "CM48AO73001", "BIA27548", "2029-06-16", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.25, 13, "AJ93", "CS13AJ93008", "BIA22513", "2027-05-04", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.25, 16, "AO67", "CS16AO67016", "BIA22516", "2029-05-28", "SN last digits half hidden in the photo, check on the box"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.25, 19, "AO39", "CS19AO39093", "BIA22519", "2029-04-11", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.25, 24, "AK17", "CS24AK17038", "BIA22524", "2027-06-11", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 13, "AJ19", "CS13AJ19023", "BIA25013", "2026-11-18", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 16, "AO54", "CS16AO54022", "BIA25016", "2029-04-29", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 19, "AO37", "CS19AO37034", "BIA25019", "2029-04-09", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 19, "AN18", "CS19AN18180", "BIA25019", "2028-12-11", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 24, "AO30", "CS24AO30067", "BIA25024", "2029-03-28", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 29, "AO34", "CS29AO34025", "BIA25029", "2029-04-02", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 29, "AO70", "CS29AO70072", "BIA25029", "2029-06-12", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 32, "AO57", "CS32AO57011", "BIA25032", "2029-05-02", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 37, "PFJ14", "CS37PFJ14027", "BIA25037", "2029-01-30", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 40, "AO59", "CS40AO59014", "BIA25040", "2029-05-04", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 44, "AO34", "CS44AO34034", "BIA25044", "2029-04-02", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 48, "AJ64", "CS48AJ64007", "BIA25048", "2027-03-22", "box on the shelf photo"],
  ["Biomime Aura 2.25 and 2.50 stack", "stent", "Biomime Aura", "Meril", 2.5, 48, "AN95", "CS48AN95140", "BIA25048", "2029-02-27", "box on the shelf photo"],
];
function invImport23NovC_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_IMPORT_23NOV_C")) return false;
  pr.setProperty("INV_IMPORT_23NOV_C", "started " + cathNow_());
  var who = "Claude (photos of 23 Nov, Biomime Aura)";
  var boxes = boxRowsAll_(), photos = [], byPhoto = {}, tot = { added: 0, same: 0, check: 0 };
  IMPORT_23NOV_C.forEach(function (x) { if (!byPhoto[x[0]]) { byPhoto[x[0]] = []; photos.push(x[0]); } byPhoto[x[0]].push(x); });
  photos.forEach(function (ph, i) {
    var up = { id: "CLAUDE-23NOVC-" + (i + 1), file: ph + " (photo sent 23 Nov, read by Claude)", fileId: "" };
    var list = byPhoto[ph].map(function (x) {
      return { device: "Stent", brand: x[2], manufacturer: x[3], diameter: String(x[4]), length: String(x[5]),
        lot: x[6], serial: x[7], ref: x[8], expiry: x[9], codes: [], place: x[10] };
    });
    boxTakePhoto_(up, list, who, "Claude", boxes, []);
  });
  boxRowsAll_().filter(function (b) { return String(b.up).indexOf("CLAUDE-23NOVC-") === 0; }).forEach(function (b) {
    if (String(b.readAt).slice(0, 10) !== IMPORT_23NOV_DAY) { b.readAt = IMPORT_23NOV_DAY + " 14:55"; boxWrite_(b); }
    if (b.status === "repeat") tot.same++; else if (b.status === "in stock") tot.added++; else tot.check++;
  });
  boxSyncMoves_(who);
  pr.setProperty("INV_IMPORT_23NOV_C", JSON.stringify({ at: cathNow_(), boxes: IMPORT_23NOV_C.length, added: tot.added, same: tot.same, check: tot.check }));
  batchLogRow_(runId, "", "", "more stock of 23 Nov (Biomime Aura, read by Claude)", tot.check ? "partly written" : "written",
    IMPORT_23NOV_C.length + " box(es): " + tot.added + " counted" + (tot.same ? ", " + tot.same + " already in stock" : "") + (tot.check ? ", " + tot.check + " to check" : ""));
  return true;
}

/* 13.50: three Ultimaster Tansei boxes sent back to the company on 23 Nov
   (message with photo, "Ultimater stock out — return to company"). Each is
   taken off the stock: status "returned" is not counted, so its "received"
   move goes and the shelf count drops by one. The row stays, with why. */
var RETURN_23NOV = [["Ultimaster Tansei", 2.75, 24, "260205"], ["Ultimaster Tansei", 2.75, 28, "260119"], ["Ultimaster Tansei", 2.75, 38, "260108"]];
function invReturn23Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_RETURN_23NOV")) return false;
  var who = "Claude (returned to company, 23 Nov)", boxes = boxRowsAll_(), done = [], miss = [];
  RETURN_23NOV.forEach(function (r) {
    var hit = null;
    boxes.forEach(function (b) {
      if (!hit && b.status === "in stock" && invNorm_(b.brand) === invNorm_(r[0]) && Number(b.dia) === r[1] && Number(b.len) === r[2] && invNorm_(b.lot) === invNorm_(r[3])) hit = b;
    });
    if (!hit) { miss.push(r[0] + " " + r[1] + "×" + r[2] + " LOT " + r[3]); return; }
    hit.status = "returned"; hit.why = "returned to the company on 23 Nov (stock out)"; hit.checkedBy = who; hit.checkedAt = cathNow_();
    boxWrite_(hit); done.push(hit.id);
  });
  boxSyncMoves_(who);
  pr.setProperty("INV_RETURN_23NOV", JSON.stringify({ at: cathNow_(), done: done, miss: miss }));
  batchLogRow_(runId, "", "", "returned to company (Ultimaster Tansei)", miss.length ? "partly written" : "written",
    done.length + " box(es) taken off the stock" + (miss.length ? "; not found in stock: " + miss.join(", ") : ""));
  return true;
}

/* ---- 13.50: which case used which box. A box marked "used" from the day's
   instrument photo (not from a sticker) is matched, once the utilization
   sheets are saved, to the cases of that day that used a device of its brand
   and size. The sheet carries no LOT, so: one case that day → "PTCA n · name"
   exactly; more than one → "one of: PTCA a, PTCA b" (never a guess). ---- */
function boxLinkUse_(onlyDay) {
  var boxes = boxRowsAll_().filter(function (b) {
    return b.status === "used" && (b.kind || "stent") !== "stent" && /^used (\d{4}-\d{2}-\d{2})/.test(String(b.why));
  });
  if (!boxes.length) return 0;
  var items = invItems_(), moves = invMovesAll_(), byId = {};
  items.forEach(function (it) { byId[it.id] = it; });
  var changed = 0;
  boxes.forEach(function (b) {
    var day = /^used (\d{4}-\d{2}-\d{2})/.exec(String(b.why))[1];
    if (onlyDay && day !== onlyDay) return;
    var cases = {}, order = [];
    moves.forEach(function (m) {
      if (m.kind !== "used" || m.caseDate !== day) return;
      var it = byId[m.item]; if (!it) return;
      if (it.kind !== (b.kind || "stent") || invNorm_(it.brand) !== invNorm_(b.brand) || invSizeKey_(it.size) !== invSizeKey_(boxSizeText_(b))) return;
      if (!cases[m.caseKey]) { cases[m.caseKey] = { no: m.ptcaNo, patient: m.patient }; order.push(m.caseKey); }
    });
    var lab = function (c) { return [c.no ? "PTCA " + c.no : "", c.patient].filter(Boolean).join(" · "); };
    var v = !order.length ? "" : order.length === 1 ? lab(cases[order[0]]) : "one of: " + order.map(function (k) { return cases[k].no ? "PTCA " + cases[k].no : cases[k].patient; }).join(", ");
    if (v !== String(b.usedIn || "")) { b.usedIn = v; boxWrite_(b); changed++; }
  });
  return changed;
}

/* 13.50: balloons used on 23 Nov (photo of the seven boxes, 15:03).
   Each is marked "used" without changing the count — the utilization sheet
   takes it off; one that is not on the stock list becomes its own "used" row. */
var USED_23NOV = [
  ["balloon", "Tanzor NC", "Veiva Scientific", 2.5, 12, "G1226AJ", "", "VSTZN25012", "2028-04"],
  ["balloon", "Tanzor NC", "Veiva Scientific", 2.5, 12, "G1226AQ", "", "VSTZN25012", "2028-06"],
  ["balloon", "Tanzor NC", "Veiva Scientific", 3.5, 12, "K1226AS", "", "VSTZN35012", "2028-06"],
  ["balloon", "Tanzor NC", "Veiva Scientific", 2, 12, "E1226AQ", "", "VSTZN20012", "2028-06"],
  ["balloon", "Seguro", "", 3, 12, "S26NC009", "NS2600930012155", "SLS/NC/30012", "2029-06"],
  ["balloon", "Seguro", "", 3, 12, "S26NC002", "NS2630012088", "SLS/NC/30012", "2029-02"],
  ["balloon", "Seguro", "", 2, 15, "S25NC006", "NS2520015007", "SLS/NC/20015", "2028-08"]
];
function invUsed23Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_USED_23NOV")) return false;
  pr.setProperty("INV_USED_23NOV", "started " + cathNow_());
  var who = "Claude (balloons used 23 Nov)", day = "2026-11-23";
  var up = { id: "CLAUDE-23NOVU-1", file: "balloons used today (photo sent 23 Nov, read by Claude)", fileId: "" };
  var list = USED_23NOV.map(function (x) {
    return { device: "Balloon", brand: x[1], manufacturer: x[2], diameter: String(x[3]), length: String(x[4]), lot: x[5], serial: x[6], ref: x[7], expiry: x[8], codes: [], place: "used today" };
  });
  var r = dayTakePhoto_(up, list, day, "Claude", boxRowsAll_());
  boxSyncMoves_(who);
  try { boxLinkUse_(day); } catch (e) {}
  pr.setProperty("INV_USED_23NOV", JSON.stringify({ at: cathNow_(), matched: r.matched, noBox: r.noBox }));
  batchLogRow_(runId, "", "", "balloons used 23 Nov (read by Claude)", "written",
    USED_23NOV.length + " balloon(s): " + r.matched + " marked used in stock" + (r.noBox.length ? ", " + r.noBox.length + " not on the stock list: " + r.noBox.join("; ") : ""));
  return true;
}

/* 13.50: the stent stickers of 23 Nov (four photos of the register, 15:15),
   written to the Stents tab as if read from a photo, so each takes its stent
   off, is linked to its box (by serial, or LOT) and can be matched to a bill.
   The PTCA No is the registry's form ("2413AP-669") so the case's sheet finds
   its stickers. These boxes were on the shelf photos of that same day, so they
   were used after the photo: an item whose counting would start the next day
   starts on the 23rd instead, or these stickers would not be taken off. */
var STICKERS_23NOV_DAY = "2026-11-23";
var STICKERS_23NOV = [
  // [patient, PTCA No, payer, vessel, brand, mfr, dia, len, ref, lot, serial, expiry, barcode text]
  ["Dhiraj Kori", "2411AP-668", "PBCF / self", "RCA", "Ultimaster Tansei", "Terumo", 3.5, 38, "DE-RQ3538KSM", "260310", "", "", ""],
  ["Uttam Mahadik", "2412AP-671", "self / PBCF", "OM", "Xience Alpine", "Abbott", 2.75, 23, "1120275-23", "6052741", "", "", "(01)08717648205613"],
  ["Shekh Abdul Mannan", "2413AP-669", "PMJAY", "LAD", "Yukon Choice Swift", "Translumina", 2.75, 36, "YCST2736", "SAAW060726", "SAAW060248", "2029-06",
    "(01)18904271606338(17)290600(10)SAAW060726(21)SAAW060248"],
  ["Satendra Sav", "2414AP-670", "PMJAY", "LAD mid", "Yukon Choice Swift", "Translumina", 2.75, 28, "YCST2728", "SAAX110726", "SAAX111437", "2028-06",
    "(01)18904271606314(17)280600(10)SAAX110726(21)SAAX111437"],
  ["Satendra Sav", "2414AP-670", "PMJAY", "LAD prox", "Yukon Choice Swift", "Translumina", 3, 24, "YCST3024", "SAAX110726", "SAAX111129", "2028-06",
    "(01)18904271606420(17)280600(10)SAAX110726(21)SAAX111129"]
];
function invStickers23Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_STICKERS_23NOV")) return false;
  pr.setProperty("INV_STICKERS_23NOV", "started " + cathNow_());
  var who = "Claude (stent stickers of 23 Nov)", up = "CLAUDE-23NOVS";
  var have = {}; stentRowsAll_().forEach(function (x) { have[x.id] = 1; });
  var rows = [];
  STICKERS_23NOV.forEach(function (x, i) {
    var id = up + "-" + (i + 1);
    if (have[id]) return;
    var st = stentNormItem_({ device: "Stent", brand: x[4], manufacturer: x[5], diameter: String(x[6]), length: String(x[7]), ref: x[8], lot: x[9], serial: x[10],
      expiry: x[11], codes: x[12] ? [x[12]] : [], other: x[3] });
    var row = stentRowOf_(id, up, { name: x[0], ptcaNo: x[1], ipNo: "", date: "23/11/26" }, st, "", "", "Claude");
    row[STENT_KEYS.indexOf("edited")] = "added by " + who + " " + cathNow_();
    row[STENT_KEYS.indexOf("notes")] = x[3] + " · " + x[2] + (x[0] === "Satendra Sav" ? " · surname cut off at the page edge — check" : "");
    rows.push(row);
  });
  stentWriteRows_(rows);
  // the items of these stents count uses from the 23rd (see above)
  var items = invItems_(), moved = [];
  STICKERS_23NOV.forEach(function (x) {
    var it = invFind_(items, "stent", x[4], stentNum_(x[6]) + "×" + stentNum_(x[7]));
    if (it && it.from && it.from > STICKERS_23NOV_DAY && it.fromSetBy !== "hand") { it.from = STICKERS_23NOV_DAY; it.fromAuto = false; it.updated = cathNow_(); it.by = who; moved.push(x[4] + " " + x[6] + "×" + x[7]); }
  });
  if (moved.length) invWriteTab_(items);
  invAfterSticker_(who);
  pr.setProperty("INV_STICKERS_23NOV", JSON.stringify({ at: cathNow_(), stickers: rows.length, fromMoved: moved }));
  batchLogRow_(runId, "", "", "stent stickers of 23 Nov (read by Claude)", "written",
    rows.length + " sticker(s) for PTCA 2411–2414" + (moved.length ? "; counted from 23 Nov: " + uniq_(moved).join(", ") : ""));
  return true;
}

/* 13.51 — the shelf check of 24 Nov (Shraddha, sent by Dr Yadav at 19:34),
   once: 2.25×38 LOT 260330 — 2 on the shelf (the IMG_0056 box is the second);
   2.75×28 LOT 260119 — 1 on the shelf: the box returned on 23 Nov is IMG_0055's
   ((93)001708), so the box standing in the 9:59 row is still here; Xience
   2.75×12 LOT 4112041 — none on the shelf and no use recorded since the count
   of 20 Nov: left exactly as it is (Dr Yadav checks on 25 Nov). And the sticker of PTCA 2389 AP-664
   (Jamnaben Bharadwa, 3.0×15 Xience Alpine LOT 6051241), which answers the
   "Stents to check" entry for that case; her PTCA was before the count of
   20 Nov, so it takes nothing off the stock. */
var SHELF_24NOV = [
  ["XMWOM9EFW3", { status: "in stock" }, "2 boxes of 2.25×38 LOT 260330 on the shelf (shelf check 24 Nov) — this is the second"],
  ["XMWOLZNLTV", { status: "in stock", scan: "", codes: "" }, "on the shelf (shelf check 24 Nov): the box returned on 23 Nov was IMG_0055's, (93)001708, not this one"],
  ["XMWOM5Q61O", { status: "returned", same: "" }, "returned to the company on 23 Nov (stock out); its barcode number (93)001708 is the returned box's"]
];
/* 13.52 — PTCA 2397 AP-667 (Rahul Sorte), once: the utilization sheet's LCx
   row was read into the D1 row, so the 3×38 Ultimaster Tansei (sticker: LCx,
   LOT 260521), the Fielder FC wire and the postdilation sat on a D1 target.
   Dr Yadav (25 Nov): the stents are LAD and LCx. Moved to the LCx target;
   the D1 target and the D1 row emptied; the registry columns and the
   inventory "where" follow. */
/* 13.52, once: the Ultima PC boxes kept to check only for their LOT (none
   printed on the side) are counted, with the app's one-day caveat */
/* 13.52, once: NC Rockstar 2×12 No. 130229080926J0179128 on
   stock_20261125-112554 was taken as a misread of No. …179108 (the 20 Nov
   stack photo, where the barcode reads …179108 and the box below it
   …179106). The numbers are printed and barcoded on both photos: three
   different boxes. Today's box is counted. */
function boxRockstar25Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("BOX_ROCKSTAR_25NOV")) return false;
  pr.setProperty("BOX_ROCKSTAR_25NOV", "started " + cathNow_());
  var at = cathNow_(), n = 0;
  boxRowsAll_().forEach(function (b) {
    if (b.id !== "XMWVRA55W4" || b.status !== "repeat") return;
    b.status = "in stock"; b.same = "";
    b.why = "a different box from No. 130229080926J0179108 of the 20 Nov photo (numbers of one batch run one digit apart) — counted";
    b.checkedBy = "Claude (barcode and printed number checked, 25 Nov)"; b.checkedAt = at; boxWrite_(b); n++;
  });
  if (n) { try { boxSyncMoves_(); } catch (e) {} }
  pr.setProperty("BOX_ROCKSTAR_25NOV", JSON.stringify({ at: at, rows: n }));
  batchLogRow_(runId, "", "", "NC Rockstar 2×12 …179128", "written", n ? "counted as a new box" : "not found as a repeat — nothing changed");
  return true;
}

/* 13.52, once: the 20 Nov NC Rockstar 2.00–2.50 stack photo (sent to Claude in
   the chat) put in "Stock in processed", so its boxes can be shown */
/* 13.52, once: the used-stent sticker pages Dr Yadav photographed on 25 Nov
   (sent to Claude in the chat, not uploaded through the app) for the four
   cases still in "Stents to check": PTCA 2379 AP-661, 2390 AP-665,
   2395 AP-666, 2397 AP-667. The stock follows as for any sticker. */
var STICKERS_25NOV = [
  ["CLAUDE-25NOVS-1", "Girijashankar Yadav", "2379AP661", "18/11/26", "Xience Alpine", "Abbott", "3.5", "38", "1120350-38", "6080641", "(01)08717648205859", "LAD", "PMJAY · POBA to D1 · Cordis 6F XB 3 guide LOT 18551483"],
  ["CLAUDE-25NOVS-2", "Girijashankar Yadav", "2379AP661", "18/11/26", "Xience Alpine", "Abbott", "2.5", "15", "1120250-15", "6042841", "(01)08717648205514", "Ramus", "PMJAY"],
  ["CLAUDE-25NOVS-3", "Mohd. Abrar Shaikh", "2390AP665", "19/11/26", "Xience Alpine", "Abbott", "3", "33", "1120300-33", "6081241", "(01)08717648205460", "LAD", "PMJAY · Cordis 6F XB 3 guide LOT 18551483"],
  ["CLAUDE-25NOVS-4", "Pravin Khetani", "2395AP666", "20/11/26", "Xience Alpine", "Abbott", "3", "38", "1120300-38", "6072141", "(01)08717648205477", "LAD", "PMJAY · CTO ISR with IVUS · Cordis 6F XB 3 guide LOT 18551483"],
  ["CLAUDE-25NOVS-5", "Rahul Sorte", "2397AP667", "20/11/26", "Ultimaster Tansei", "Terumo", "3", "33", "DE-RQ3033KSM", "260130", "", "LAD", "PMJAY"],
  ["CLAUDE-25NOVS-6", "Rahul Sorte", "2397AP667", "20/11/26", "Ultimaster Tansei", "Terumo", "3", "38", "DE-RQ3038KSM", "260521", "", "LCx", "PMJAY · the utilization sheet's row read as D1 is LCx (Dr Yadav 25 Nov)"]
];
/* 13.52, once: PTCA inbox cases sorted before the diagram stent sheet was
   known: a case with all four proforma pages and the utilization report read,
   and exactly one page called "other", has that page as its diagram stent
   sheet — relabelled and queued, so only that page is read */
/* 13.52, once: Xience Alpine 2.75 × 12 LOT 4112041 — IMG_0033 and IMG_0034
   show the same TWO boxes ((91)5518 and (91)5515); the count of 20 Nov had
   three. IMG_0034's "box 5" is not a box of this size (the boxes after the two
   are 2.75 × 15): discarded. IMG_0034's box 3 reads (91)5518 on its barcode
   line, not 5515. */
function boxX12Fix25Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("BOX_X12_25NOV")) return false;
  pr.setProperty("BOX_X12_25NOV", "started " + cathNow_());
  var at = cathNow_(), n = 0, who = "Claude (photos checked 25 Nov)";
  boxRowsAll_().forEach(function (b) {
    if (b.id === "XMWOJN4VOS" && b.status === "in stock") {
      b.status = "discarded"; b.why = "not a third 2.75 × 12 box: IMG_0033 and IMG_0034 show two ((91)5518 and (91)5515) — checked 25 Nov";
      b.checkedBy = who; b.checkedAt = at; boxWrite_(b); n++;
    } else if (b.id === "XMWOJN4VKQ" && /\(91\)5515/.test(b.codes)) {
      b.codes = b.codes.replace("(91)5515", "(91)5518");
      b.why = (b.why ? b.why + " · " : "") + "barcode line reads (91)5518 (checked 25 Nov)";
      b.checkedBy = who; b.checkedAt = at; boxWrite_(b); n++;
    }
  });
  if (n) { try { boxSyncMoves_(who); } catch (e) {} }
  pr.setProperty("BOX_X12_25NOV", JSON.stringify({ at: at, rows: n }));
  batchLogRow_(runId, "", "", "Xience 2.75 × 12 count", "written", n + " row(s): two boxes, not three");
  return true;
}

/* 13.60, once — the Ultimaster Tansei shelf of 26 Nov (six photos Dr Yadav
   sent, read box by box by Claude: 60 boxes). What the photos settle:
   - stock_20261120-100045.jpg's LOTs, boxes 10–13, were shifted by one box,
     and its third 3.5 × 33 is not there (two 3.5 × 33, both LOT 260128);
   - IMG_0056's 3.0 × 28 LOT 260225 was a third box, not a repeat;
   - a 2.75 × 15 LOT 250619 (2027-05-31) was never on the list;
   - the 3.0 × 33 LOT 260130 and 3.0 × 38 LOT 260521 (PTCA 2397 AP-667,
     20 Nov) and one 3.5 × 38 LOT 260310 (PTCA 2411 AP-668, 23 Nov) are gone —
     their stickers mark those boxes used (stentBoxUse_, at the end);
   - the 20 Nov shelf photos were taken at 10 am: PTCA 2397's two stents were
     on them, so Ultimaster uses count from 20 Nov, not 21 Nov.
   Three boxes show their own (93) number on the label; it is kept. */
var ULT_26NOV_PHOTO = "Ultimaster shelf, 26 Nov morning (photos sent in the chat, read by Claude)";
var ULT_26NOV_BOX = [
  ["XMWOM5A8YA", { lot: "260113", expiry: "2027-12-31" }, "LOT corrected from 250806 (the box to its left) — shelf photo of 26 Nov"],
  ["XMWOM5A8ZB", { lot: "260304", expiry: "2028-02-29" }, "LOT corrected from 260113 — shelf photo of 26 Nov"],
  ["XMWOM5A90C", { lot: "260105", expiry: "2027-12-31" }, "LOT corrected from 260304 — shelf photo of 26 Nov"],
  ["XMWOM5A91D", { lot: "260219", expiry: "2028-01-31" }, "LOT corrected from 260105 — shelf photo of 26 Nov"],
  ["XMWOM5A93F", { status: "discarded" }, "not a box: the shelf has two 3.5 × 33 (both LOT 260128), not three — shelf photo of 26 Nov"],
  ["XMWOM9EFR1", { status: "in stock", same: "" }, "a third 3.0 × 28 of LOT 260225, not a repeat: the shelf of 26 Nov has three"],
  ["XMWOLXPRUG", { scan: "(01)05413206221370(17)280430(10)260528(93)000573" }, ""],
  ["XMWOM9EFZ4", { scan: "(01)05413206221110(17)280430(10)260519(93)000158" }, ""],
  ["XMWOLXPRG2", { scan: "(01)05413206221097(17)280430(10)260527(93)000510" }, ""]
];
function boxUltShelf26Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("BOX_ULT_26NOV")) return false;
  pr.setProperty("BOX_ULT_26NOV", "started " + cathNow_());
  var who = "Claude (Ultimaster shelf of 26 Nov)", at = cathNow_(), boxes = boxRowsAll_(), byId = {}, n = 0, missed = [];
  boxes.forEach(function (b) { byId[b.id] = b; });
  ULT_26NOV_BOX.forEach(function (f) {
    var b = byId[f[0]]; if (!b) { missed.push(f[0]); return; }
    Object.keys(f[1]).forEach(function (k) { if (k === "scan" && b.scan) return; b[k] = f[1][k]; });
    if (f[2]) b.why = f[2];
    b.checkedBy = who; b.checkedAt = at; boxWrite_(b); n++;
  });
  // the 2.75 × 15 LOT 250619 that was not on the list
  var added = 0;
  if (!boxes.some(function (b) { return b.up === "CLAUDE-26NOV-ULT"; })) {
    boxAppend_([{ id: cathId_("X"), up: "CLAUDE-26NOV-ULT", photo: ULT_26NOV_PHOTO, fileId: "", status: "in stock",
      why: "on the shelf of 26 Nov; not on the photos of 20 Nov", kind: "stent", brand: "Ultimaster Tansei", mfr: "Terumo",
      dia: "2.75", len: "15", ref: "DE-RQ2715KSM", lot: "250619", serial: "", expiry: "2027-05-31", gtin: "", codes: "", place: "2.75 stack, bottom box",
      item: "", same: "", readAt: at, readBy: "Claude", checkedBy: who, checkedAt: at, size: "", area: "", usedIn: "", scan: "" }]);
    added = 1;
  }
  try { boxSyncMoves_(who); } catch (e) {}
  // Ultimaster uses count from 20 Nov (the shelf photos were taken that morning)
  var items = invItems_(), nf = 0;
  items.forEach(function (it) {
    if (it.kind !== "stent" || !/ultimaster/i.test(it.brand) || it.fromSetBy === "hand") return;
    if (it.from === "2026-11-20") return;
    it.from = "2026-11-20"; it.fromAuto = false; it.updated = at; it.by = who; nf++;
  });
  if (nf) invWriteTab_(items);
  invAfterSticker_(who);
  pr.setProperty("BOX_ULT_26NOV", JSON.stringify({ at: at, rows: n, added: added, from: nf, missed: missed }));
  batchLogRow_(runId, "", "", "Ultimaster shelf of 26 Nov", "written", n + " box row(s) corrected, " + added + " new box (2.75 × 15 LOT 250619); " + nf +
    " Ultimaster size(s) count uses from 20 Nov — the list now matches the 60 boxes on the shelf" + (missed.length ? "; not found: " + missed.join(", ") : ""));
  return true;
}

function ptcaDiagResort_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("PTCA_DIAG_RESORT")) return false;
  pr.setProperty("PTCA_DIAG_RESORT", "started " + cathNow_());
  var tab = batchTabRows_(), n = 0, names = [];
  tab.rows.forEach(function (c) {
    if (c.type !== "PTCA" || c.status === "failed" || c.results.qd) return;
    var other = c.pageMap.filter(function (m) { return m.slot === "other" && !m.dup; });
    var have = ["q1", "q2", "q3", "q4", "qu"].every(function (k) { return c.pageMap.some(function (m) { return m.slot === k; }); });
    if (other.length !== 1 || !have || c.pageMap.some(function (m) { return m.slot === "qd"; })) return;
    other[0].slot = "qd";
    c.errors = (c.errors || []).filter(function (e) { return e.slot !== "qd"; });
    batchNote_(c, runId, other[0].label, "page recognition", "ok", "taken as the diagram stent sheet (the one page left over in a full PTCA set); queued to read that page");
    if (c.status !== "saved") c.status = "queued";   // a saved case keeps its status (the page is only relabelled)
    batchWriteRow_(c); n++; names.push(c.name || c.caseId);
  });
  pr.setProperty("PTCA_DIAG_RESORT", JSON.stringify({ at: cathNow_(), cases: names }));
  batchLogRow_(runId, "", "", "PTCA diagram pages", "written", n + " case(s): " + names.join(", "));
  return true;
}

function stickers25Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("STICKERS_25NOV")) return false;
  pr.setProperty("STICKERS_25NOV", "started " + cathNow_());
  var who = "Claude (sticker pages of 25 Nov)", have = {}, rows = [];
  stentRowsAll_().forEach(function (x) { have[x.id] = true; });
  STICKERS_25NOV.forEach(function (s) {
    if (have[s[0]]) return;
    var st = stentNormItem_({ device: "Stent", brand: s[4], manufacturer: s[5], diameter: s[6], length: s[7], ref: s[8], lot: s[9], serial: "", expiry: "",
      codes: s[10] ? [s[10]] : [], other: s[11] });
    var row = stentRowOf_(s[0], "CLAUDE-25NOVS", { name: s[1], ptcaNo: s[2], ipNo: "", date: s[3] }, st, "", "", "Claude");
    row[STENT_KEYS.indexOf("edited")] = "added by " + who + " " + cathNow_();
    row[STENT_KEYS.indexOf("notes")] = s[11] + " · " + s[12];
    rows.push(row);
  });
  if (rows.length) { stentWriteRows_(rows); invAfterSticker_(who); }
  pr.setProperty("STICKERS_25NOV", JSON.stringify({ at: cathNow_(), added: rows.length }));
  batchLogRow_(runId, "", "", "stickers of 25 Nov", "written", rows.length + " sticker(s) added (PTCA 2379, 2390, 2395, 2397)");
  return true;
}

function boxPhoto20Nov9_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("BOX_PHOTO_20NOV9")) return false;
  pr.setProperty("BOX_PHOTO_20NOV9", "started " + cathNow_());
  var n = 0;
  boxRowsAll_().forEach(function (b) { if (b.up === "CLAUDE-20NOV-9" && !b.fileId) { b.fileId = "1vuvPcLIPhygQ1gbxiyADOUhlByQ0MC6n"; boxWrite_(b); n++; } });
  pr.setProperty("BOX_PHOTO_20NOV9", JSON.stringify({ at: cathNow_(), rows: n }));
  batchLogRow_(runId, "", "", "20 Nov Rockstar photo", "written", n + " box row(s) linked to the photo");
  return true;
}

function boxUltima25Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("BOX_ULTIMA_25NOV")) return false;
  pr.setProperty("BOX_ULTIMA_25NOV", "started " + cathNow_());
  var n = 0, at = cathNow_();
  boxRowsAll_().forEach(function (b) {
    if (b.status !== "check" || !boxNoLot_(b) || boxWhy_(b, null)) return;
    b.status = "in stock"; b.why = ""; b.checkedBy = "Dr Yadav (Ultima PC: no LOT on the box)"; b.checkedAt = at;
    boxWrite_(b); n++;
  });
  if (n) { try { boxSyncMoves_(); } catch (e) {} }
  pr.setProperty("BOX_ULTIMA_25NOV", JSON.stringify({ at: at, counted: n }));
  batchLogRow_(runId, "", "", "Ultima PC boxes without a LOT", "written", n + " box(es) counted");
  return true;
}

function ptcaSorte25Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("PTCA_SORTE_25NOV")) return false;
  pr.setProperty("PTCA_SORTE_25NOV", "started " + cathNow_());
  var sh = SpreadsheetApp.getActive().getSheetByName("PTCA 2026");
  var have = headersOf(sh), vals = sh.getDataRange().getValues();
  var cNo = have.indexOf("PTCA No"), cJ = have.indexOf(CASE_JSON_COL), r = -1;
  for (var i = 1; i < vals.length; i++) if (invSameCase_(vals[i][cNo], "2397AP667") && /sorte/i.test(String(vals[i][have.indexOf("Name")]))) { r = i; break; }
  if (r < 0) { pr.setProperty("PTCA_SORTE_25NOV", "not found " + cathNow_()); batchLogRow_(runId, "", "", "PTCA 2397 vessel fix", "skipped", "case not found"); return false; }
  var row = vals[r].slice(), P = JSON.parse(String(row[cJ] || "{}")), note = [];
  var fixed = ptcaSorteFix_(P);
  if (fixed) { row[cJ] = JSON.stringify(P); note.push("case JSON"); }
  ["Stents", "Predilated (balloon → lesion)", "Stent placed (stent → site)", "Postdilated (balloon → stent)"].forEach(function (h) {
    var c = have.indexOf(h); if (c < 0) return;
    var v = String(row[c] || ""), seen = {}, out = [];
    v.split(/;\s*/).forEach(function (x) { x = x.replace(/\bD1\b/g, "LCx"); if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    var nv = out.join("; ");
    if (nv !== v) { row[c] = nv; note.push(h); }
  });
  sh.getRange(r + 1, 1, 1, row.length).setValues([row]);
  var moves = invMovesAll_(), sm = invMovesSheet_(), n = 0;
  moves.forEach(function (m) {
    if (!invSameCase_(m.ptcaNo, "2397AP667") || !/^d1$/i.test(m.where)) return;
    sm.getRange(m.row, 12).setValue("LCx"); n++;
  });
  pr.setProperty("PTCA_SORTE_25NOV", JSON.stringify({ at: cathNow_(), fixed: note, moves: n }));
  batchLogRow_(runId, "", "", "PTCA 2397 vessel fix", "written", "3×38 Ultimaster Tansei moved from D1 to LCx (" + note.join(", ") + "; " + n + " inventory line(s))");
  return true;
}
/* the case JSON: the D1 target's wire, stent and postdilation go to the LCx target */
function ptcaSorteFix_(P) {
  var T = (P.proc && P.proc.targets) || [], d = -1, x = -1;
  T.forEach(function (t, i) { if (/^d1$/i.test(t.site)) d = i; else if (/^lcx$/i.test(t.site)) x = i; });
  if (d < 0) return false;
  var D = T[d];
  (D.stents || []).forEach(function (st) { if (/d1/i.test(st.site || "")) st.site = "LCx"; });
  if (x >= 0) {
    var X = T[x];
    X.wire = D.wire || X.wire; X.pre = X.pre || D.pre; X.preAtm = X.preAtm || D.preAtm; X.preSec = X.preSec || D.preSec;
    X.stents = (D.stents || []).filter(function (st) { return st.size || st.name; });
    X.post = D.post; X.postAtm = D.postAtm; X.postSec = D.postSec;
    T.splice(d, 1);
  } else D.site = "LCx";
  var g = P.util && P.util.grid;
  if (g && g.D1) {
    var lc = g.LCx || {}, empty = Object.keys(lc).every(function (k) { return !lc[k]; });
    if (empty) { g.LCx = g.D1; g.D1 = {}; Object.keys(g.LCx).forEach(function (k) { g.D1[k] = ""; }); }
  }
  return true;
}

function invShelf24Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_SHELF_24NOV")) return false;
  pr.setProperty("INV_SHELF_24NOV", "started " + cathNow_());
  var who = "Claude (shelf check of 24 Nov)", boxes = boxRowsAll_(), byId = {}, changed = 0, missed = [];
  boxes.forEach(function (b) { byId[b.id] = b; });
  SHELF_24NOV.forEach(function (f) {
    var b = byId[f[0]]; if (!b) { missed.push(f[0]); return; }
    Object.keys(f[1]).forEach(function (k) { b[k] = f[1][k]; });
    b.why = f[2]; b.checkedBy = who; b.checkedAt = cathNow_(); boxWrite_(b); changed++;
  });
  boxSyncMoves_(who);
  // the sticker of PTCA 2389 AP-664
  var id = "CLAUDE-24NOVS-1", sticker = 0;
  if (!stentRowsAll_().some(function (x) { return x.id === id; })) {
    var st = stentNormItem_({ device: "Stent", brand: "Xience Alpine", manufacturer: "Abbott", diameter: "3", length: "15", ref: "1120300-15", lot: "6051241", serial: "",
      expiry: "", codes: ["(01)08717648205675"], other: "Osti. LAD" });
    var row = stentRowOf_(id, "CLAUDE-24NOVS", { name: "Jamnaben Bharadwa", ptcaNo: "2389AP664", ipNo: "", date: "19/11/26" }, st, "", "", "Claude");
    row[STENT_KEYS.indexOf("edited")] = "added by " + who + " " + cathNow_();
    row[STENT_KEYS.indexOf("notes")] = "Osti. LAD · PMJAY · sticker page dated 19/11/26 (the utilization sheet says 17 Nov) · also on the page: Cordis 6F XB 3 guide, LOT 18007338";
    stentWriteRows_([row]); sticker = 1;
    invAfterSticker_(who);
  }
  pr.setProperty("INV_SHELF_24NOV", JSON.stringify({ at: cathNow_(), changed: changed, sticker: sticker, missed: missed }));
  batchLogRow_(runId, "", "", "shelf check of 24 Nov", "written", changed + " box row(s) changed (2.25×38 +1, 2.75×28 LOT 260119 back on the shelf; Xience 2.75×12 left as it was, to be checked 25 Nov); " + sticker + " sticker added (PTCA 2389 AP-664)" + (missed.length ? "; not found: " + missed.join(", ") : ""));
  return true;
}

/* 13.50: tabs made before a column was added keep a blank title over it.
   Blank title cells are filled once per version; a title already there
   (even one changed by hand) is left as it is. */
function headFill_() {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("HEAD_FILL") === "13.60") return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [[BOX_TAB, BOX_HEAD], [STENT_TAB, STENT_HEAD], [STENT_UP_TAB, STENT_UP_HEAD], [INV_TAB, INV_HEAD], [INV_MOVES, MOVE_HEAD]].forEach(function (t) {
    try {
      var sh = ss.getSheetByName(t[0]);
      if (!sh || sh.getLastRow() < 1) return;
      ensureCols(sh, t[1].length);
      var r = sh.getRange(1, 1, 1, t[1].length), v = r.getValues()[0], ch = false;
      t[1].forEach(function (h, i) { if (String(v[i] == null ? "" : v[i]).trim() === "") { v[i] = h; ch = true; } });
      if (ch) r.setValues([v]);
    } catch (e) {}
  });
  pr.setProperty("HEAD_FILL", "13.60");
}

/* 13.51: the barcode check of 24 Nov (Claude, from the stock photos at full size).
   Each entry: [box id, fields to set, why]. The fixes: "box 29" (box 27 read
   twice); the LOT-to-confirm 2.75 x 38 (same barcode on both photos); the
   9:57/9:59/10:00 boxes read from the zoomed photos; the Xience 3.0 x 18 counted
   twice; LOTs misread on counted boxes (corrected by their barcodes); the
   2.75 x 24 LOT 260205 that was not the box returned (its (93) differs). Every
   barcode decoded that day is kept on its box ("Scanned barcode"), so a later
   photo whose barcodes are read on the phone can be matched to the very box. */
var FIX_24NOV = [
  ["XMWOLZNLIL",{"status":"discarded"},"not counted: the 2.5 x 18 at the left edge of this photo is one of the two already counted (Dr Yadav, 24 Nov)"],
  ["XMWOLZNLHK",{"status":"discarded"},"not counted: the box lying on top is the 2.25 x 24 LOT 260519 already counted from IMG_0056 (Dr Yadav, 24 Nov)"],
  ["XMWOJO0CU28",{"status":"discarded"},"not a box: \"box 29\" was box 27 (the second 4.0 x 33, LOT 5032841) read again (photo checked 24 Nov)"],
  ["XMWOJO0CO26",{"lot":"5032841","codes":""},"LOT read from the box label on the photo (24 Nov)"],
  ["XMWOJO09T1H",{"status":"repeat","same":"XMWOJN4W613","scan":"(01)08717648205644(17)290614(10)6061841(91)5909"},"same box as IMG_0034.JPG box 16: its barcode reads (10)6061841 (91)5909 on both photos (24 Nov)"],
  ["XMWOJN4W613",{"lot":"6061841","scan":"(01)08717648205644(17)290614(10)6061841(91)5909"},"LOT corrected from 6061541 by the barcode (24 Nov)"],
  ["XMWOLXPRVH",{"status":"repeat","same":"XMWOLZNLQQ"},"same box as the 2.75 x 15 LOT 250513 on stock_20261120-095932.jpg: its neighbour (2.75 x 18 LOT 251127) shows beside it on both photos (24 Nov)"],
  ["XMWOLZNLRR",{"status":"in stock","dia":"2.75","len":"18","lot":"251127","expiry":"2027-10-31","ref":"DE-RQ2718KSM"},"read on the zoomed photo (24 Nov): 2.75 x 18, LOT 251127 (two digits half hidden here, whole on stock_20261120-095741.jpg)"],
  ["XMWOLZNM114",{"status":"in stock","dia":"3","len":"24","lot":"260114","expiry":"2027-12-31","ref":"DE-RQ3024KSM"},"the box lying across the front: 3.0 x 24, LOT 260114 (zoomed photo, 24 Nov)"],
  ["XMWOLZNM215",{"status":"repeat","same":"XMWOLZNM114"},"the other end of the same lying 3.0 x 24 box (REF DE-RQ3024KSM) (24 Nov)"],
  ["XMWOLZNM013",{"lot":"260306","expiry":"2028-02-29"},"LOT corrected from 260114 (the lying box's) to 260306 on the zoomed photo (24 Nov)"],
  ["XMWOM5A8G1",{"status":"in stock","dia":"3","len":"28","lot":"260225","expiry":"2028-01-31","ref":"DE-RQ3028KSM"},"a second 3.0 x 28 of LOT 260225, standing beside box 2 (zoomed photo, 24 Nov)"],
  ["XMWOJO0AJ1L",{"status":"repeat","same":"XMWOJN4WI17","lot":"6062041","scan":"(01)08717648205682(17)290615(10)6062041(91)5763"},"same box as IMG_0034.JPG box 20: its barcode reads (10)6062041 (91)5763 on both photos; it had been counted twice (24 Nov)"],
  ["XMWOJO0BP1W",{"lot":"6070941","scan":"(01)08717648205811(17)290702(10)6070941(91)6555"},"LOT corrected from 6070541 by the barcode (24 Nov)"],
  ["XMWOJO0C220",{"lot":"4042541","scan":"(01)08717648205873(17)270418(10)4042541(91)5215"},"LOT corrected from 4042841 by the barcode (24 Nov)"],
  ["XMWOJO0C321",{"lot":"5062641","scan":"(01)08717648205880(17)280619(10)5062641(91)5265"},"LOT corrected from 5062541 by the barcode (24 Nov)"],
  ["XMWOJO0C522",{"lot":"6052941","scan":"(01)08717648205897(17)290525(10)6052941(91)5789"},"LOT corrected from 6052841 by the barcode (24 Nov)"],
  ["XMWOJO0CI23",{"lot":"5032841","scan":"(01)08717648205927(17)280323(10)5032841(91)5719"},"LOT corrected from 5032541 by the barcode (24 Nov)"],
  ["XMWOJO0CS27",{"lot":"6061841","scan":"(01)08717648205903(17)290611(10)6061841(91)5592"},"LOT corrected from 6061141 by the barcode (24 Nov)"],
  ["XMWOJO0CM25",{"lot":"5090941","codes":"(01)08717648205910(17)280902(10)5090941(91)5260"},"LOT corrected from 5090241 by the line under the barcode (24 Nov)"],
  ["XMWOM5Q5WL",{"status":"in stock","same":"","scan":"(01)05413206221516(17)280131(10)260205(93)000149"},"not the box returned on 23 Nov: this box's barcode number is (93)000149, the returned box's (93)000264 (24 Nov)"],
  ["XMWOLZNLTU",{"scan":"(01)05413206221516(17)280131(10)260205(93)000264"},"returned to the company on 23 Nov (stock out); the returned box's barcode number (93)000264"],
  ["XMWOLZNLTV",{"scan":"(01)05413206221530(17)271231(10)260119(93)001708"},"returned to the company on 23 Nov (stock out); the returned box's barcode number (93)001708 (the box on IMG_0055.JPG)"],
  ["XMWOM5Q61O",{"scan":"(01)05413206221530(17)271231(10)260119(93)001708"},"the box returned on 23 Nov (barcode number (93)001708)"],
  ["XMWOJO0A11I",{"scan":"(01)08717648205644(17)290707(10)6071441(91)6625"},""],
  ["XMWOJO0A61J",{"scan":"(01)08717648205675(17)290506(10)6051241(91)5144"},""],
  ["XMWOJO0AD1K",{"scan":"(01)08717648205675(17)290506(10)6051241(91)5345"},""],
  ["XMWOJO0AL1M",{"scan":"(01)08717648205699(17)290708(10)6071441(91)5514"},""],
  ["XMWOJO0AT1N",{"scan":"(01)08717648205705(17)290712(10)6071541(91)5263"},""],
  ["XMWOJO0AV1O",{"scan":"(01)08717648205460(17)290803(10)6081241(91)6588"},""],
  ["XMWOJO0AW1P",{"scan":"(01)08717648205460(17)290803(10)6081241(91)5952"},""],
  ["XMWOJO0B01Q",{"scan":"(01)08717648205477(17)290714(10)6072141(91)6189"},""],
  ["XMWOJO0B11R",{"scan":"(01)08717648205798(17)290510(10)6051341(91)5373"},""],
  ["XMWOJO0B21S",{"scan":"(01)08717648205798(17)280917(10)5092641(91)5638"},""],
  ["XMWOJO0BC1T",{"scan":"(01)08717648205804(17)290512(10)6051841(91)5244"},""],
  ["XMWOJO0BL1U",{"scan":"(01)08717648205804(17)290512(10)6051841(91)5253"},""],
  ["XMWOJO0BN1V",{"scan":"(01)08717648205811(17)290510(10)6051441(91)6425"},""],
  ["XMWOJO0BT1X",{"scan":"(01)08717648205828(17)290716(10)6072341(91)6704"},""],
  ["XMWOJO0C01Y",{"scan":"(01)08717648205835(17)290610(10)6061641(91)6155"},""],
  ["XMWOJO0C11Z",{"scan":"(01)08717648205842(17)290608(10)6061241(91)5400"},""],
  ["XMWOJO0CJ24",{"scan":"(01)08717648205934(17)271119(10)4112541(91)6067"},""],
  ["XMWOJN4VZX",{"scan":"(01)08717648205613(17)290520(10)6052741(91)5524"},""],
  ["XMWOJN4W0Y",{"scan":"(01)08717648205613(17)290520(10)6052741(91)6533"},""],
  ["XMWOJN4W512",{"scan":"(01)08717648205637(17)290809(10)6081241(91)5411"},""],
  ["XMWOJN4WC14",{"scan":"(01)08717648205644(17)290707(10)6071441(91)6625"},""],
  ["XMWOJN4WD15",{"scan":"(01)08717648205675(17)290506(10)6051241(91)5144"},""],
  ["XMWOJN4WF16",{"scan":"(01)08717648205675(17)290506(10)6051241(91)5345"},""],
  ["XMWOJN4WI17",{"scan":"(01)08717648205682(17)290615(10)6062041(91)5763"},""],
  ["XMWOJN4WK18",{"scan":"(01)08717648205699(17)290708(10)6071441(91)5514"},""],
  ["XMWOJN4WM19",{"scan":"(01)08717648205705(17)290712(10)6071541(91)5263"},""],
  ["XMWOJN4WN1A",{"scan":"(01)08717648205460(17)290803(10)6081241(91)6588"},""],
  ["XMWOJN4WO1B",{"scan":"(01)08717648205460(17)290803(10)6081241(91)5952"},""],
  ["XMWOJN4WQ1C",{"scan":"(01)08717648205477(17)290714(10)6072141(91)6189"},""],
  ["XMWOJLS3U3",{"scan":"(01)08717648205484(17)290428(10)6050741(91)5290"},""],
  ["XMWOJLS464",{"scan":"(01)08717648205484(17)290428(10)6050741(91)5282"},""],
  ["XMWOJLS496",{"scan":"(01)08717648205439(17)280624(10)5063041(91)6146"},""],
  ["XMWOJLS4Q7",{"scan":"(01)08717648205712(17)290511(10)6051441(91)5672"},""],
  ["XMWOJLS4S8",{"scan":"(01)08717648205514(17)290421(10)6042841(91)5541"},""],
  ["XMWOJLS4Z9",{"scan":"(01)08717648205521(17)290428(10)6050741(91)5156"},""],
  ["XMWOJLS51A",{"scan":"(01)08717648205521(17)290428(10)6050741(91)5161"},""],
  ["XMWOJLS54B",{"scan":"(01)08717648205538(17)290601(10)6060841(91)6536"},""],
  ["XMWOJLS5IC",{"scan":"(01)08717648205538(17)290610(10)6061841(91)5073"},""],
  ["XMWOJLS74D",{"scan":"(01)08717648205538(17)290610(10)6061841(91)5879"},""],
  ["XMWOJLS75E",{"scan":"(01)08717648205545(17)290610(10)6061741(91)6033"},""],
  ["XMWOJLS7BF",{"scan":"(01)08717648205545(17)290719(10)6072241(91)6286"},""],
  ["XMWOJLS7EG",{"scan":"(01)08717648205552(17)290614(10)6061641(91)5809"},""],
  ["XMWOJLS7GH",{"scan":"(01)08717648205552(17)290614(10)6061641(91)5662"},""],
  ["XMWOM5Q5XM",{"scan":"(01)05413206221639(17)280131(10)260209(93)001149"},""],
  ["XMWOM5Q60N",{"scan":"(01)05413206221578(17)271231(10)260108(93)001139"},""],
  ["XMWOM5Q62P",{"scan":"(01)05413206221493(17)271231(10)260122(93)000029"},""],
  ["XMWOM5Q65Q",{"scan":"(01)05413206221356(17)280229(10)260304(93)001182"},""],
  ["XMWOM5Q68R",{"scan":"(01)05413206221738(17)280131(10)260224(93)001737"},""],
  ["XMWOM9EFU2",{"scan":"(01)05413206221851(17)271130(10)251210(93)000360"},""],
  ["XMWOM9EFZ4",{"scan":"(01)05413206221110(17)280430(10)260519(93)000158"},""],
  ["XMWT36IYPE",{"scan":"(01)08717648151811(17)281130(10)51217G1(91)6736"},""],
  ["XMWT36IYRF",{"scan":"(01)08717648151811(17)281031(10)51120G2(91)7488"},""],
  ["XMWT36IYSG",{"scan":"(01)08717648151750(17)290331(10)60414G1(91)6015"},""],
  ["XMWT36IYTH",{"scan":"(01)08717648151743(17)281130(10)51204G1(91)6678"},""],
  ["XMWT36IYUI",{"scan":"(01)08717648151743(17)290531(10)60625G2(91)6716"},""],
  ["XMWT36IYWJ",{"scan":"(01)08717648151644(17)271031(10)41107G1(91)6171"},""],
  ["XMWT36J7ZK",{"scan":"(01)08717648151958(17)270731(10)40828G1(91)6265"},""],
  ["XMWT36J8DL",{"scan":"(01)08717648151958(17)250228(10)20331G1(91)4790"},""],
  ["XMWT36J8MM",{"scan":"(01)08717648151965(17)280630(10)50721G1(91)6136"},""],
  ["XMWT36J8TN",{"scan":"(01)08717648151965(17)280430(10)50513G1(91)6957"},""],
  ["XMWT36J95O",{"scan":"(01)08717648151965(17)280430(10)50513G1(91)6928"},""],
  ["XMWT36J9IP",{"scan":"(01)08717648151972(17)280430(10)50505G1(91)6722"},""],
  ["XMWT36J9PQ",{"scan":"(01)08717648151972(17)280831(10)50902G1(91)6514"},""],
  ["XMWT36JA2R",{"scan":"(01)08717648151972(17)280731(10)50821G2(91)7023"},""],
  ["XMWT36JAAS",{"scan":"(01)08717648151972(17)280430(10)50505G1(91)6394"},""],
  ["XMWT36JAHT",{"scan":"(01)08717648151989(17)250731(10)20822G1(91)4420"},""],
  ["XMWT36JANU",{"scan":"(01)08717648151989(17)280831(10)50918G2(91)6314"},""],
  ["XMWT36JILV",{"scan":"(01)08717648151910(17)271031(10)41104G1(91)6203"},""],
  ["XMWT36JIPW",{"scan":"(01)08717648151910(17)280331(10)50401G1(91)6471"},""],
  ["XMWT36JITX",{"scan":"(01)08717648151910(17)280331(10)50401G1(91)6693"},""],
  ["XMWT36JJ0Y",{"scan":"(01)08717648151910(17)261031(10)31128G1(91)6206"},""],
  ["XMWT36JJ8Z",{"scan":"(01)08717648151927(17)280331(10)50404G1(91)6900"},""],
  ["XMWT36JJK10",{"scan":"(01)08717648151927(17)270731(10)40810G1(91)6535"},""],
  ["XMWT36JJT11",{"scan":"(01)08717648151927(17)270531(10)40605G1(91)6573"},""],
  ["XMWT36JJW12",{"scan":"(01)08717648151934(17)251031(10)21101G1(91)5350"},""],
  ["XMWT36JU013",{"scan":"(01)08717648151866(17)290131(10)60205G1(91)6263"},""],
  ["XMWT36JUC14",{"scan":"(01)08717648151866(17)280831(10)50917G1(91)6892"},""],
  ["XMWT36JUJ15",{"scan":"(01)08717648151866(17)290131(10)60207G1(91)6391"},""],
  ["XMWT36JUT16",{"scan":"(01)08717648151866(17)290228(10)60318G1(91)6466"},""],
  ["XMWT36JV417",{"scan":"(01)08717648151859(17)280630(10)50702G1(91)6109"},""],
  ["XMWT36JVA18",{"scan":"(01)08717648151859(17)281031(10)51121G1(91)7250"},""],
  ["XMWT36JVM19",{"scan":"(01)08717648151859(17)280229(10)50301G1(91)7093"},""],
  ["XMWT36JW11A",{"scan":"(01)08717648151842(17)270430(10)40518G1(91)6136"},""],
  ["XMWT36K3O1B",{"scan":"(01)08717648138096(17)290331(10)60401G1(91)6219"},""],
  ["XMWT36K3Z1C",{"scan":"(01)08717648138096(17)290731(10)60817G1(91)6180"},""],
  ["XMWT36K491D",{"scan":"(01)08717648138089(17)281231(10)60123G1(91)6976"},""],
  ["XMWT36K4I1E",{"scan":"(01)08717648138089(17)290331(10)60414G1(91)6548"},""],
  ["XMWT36K4T1F",{"scan":"(01)08717648138089(17)281231(10)60123G1(91)6190"},""],
  ["XMWT36K531G",{"scan":"(01)08717648138027(17)270930(10)41022G1(91)6592"},""],
  ["XMWT36K551H",{"scan":"(01)08717648138041(17)271031(10)41121G1(91)6271"},""],
  ["XMWT36K5A1I",{"scan":"(01)08717648138058(17)261130(10)31208G1(91)6985"},""],
  ["XMWT36KHH1J",{"scan":"133329072026H0337014"},""],
  ["XMWT36KHJ1K",{"scan":"133329081426J0185011"},""],
  ["XMWT36KHK1L",{"scan":"133329081426J0185002"},""],
  ["XMWT36KHL1M",{"scan":"133428112125M0300008"},""],
  ["XMWT36KHM1N",{"scan":"133428112125M0300001"},""],
  ["XMWT36KHN1O",{"scan":"133428122226A0520010"},""],
  ["XMWT36KHO1P",{"scan":"133528081925J0254007"},""],
  ["XMWT36KHP1Q",{"scan":"133528110425M0292011"},""],
  ["XMWT36KHQ1R",{"scan":"133728042825F0125007"},""],
  ["XMWT36KO21U",{"scan":"130229080926J0179108"},""],
  ["XMWT36KO41V",{"scan":"130229080926J0179106"},""],
  ["XMWT36KO51W",{"scan":"130329011226A0535034"},""],
  ["XMWT36KO61X",{"scan":"130328111825M0298015"},""],
  ["XMWT36KO71Y",{"scan":"130328111825M0298019"},""],
  ["XMWT36KO91Z",{"scan":"130329011226A0535010"},""],
  ["XMWT36KOA20",{"scan":"130329011226A0535035"},""],
  ["XMWT36KOB21",{"scan":"130929040926E0218018"},""],
  ["XMWT36KOC22",{"scan":"131029082026J0191151"},""],
  ["XMWT36KOD23",{"scan":"131029082026J0191109"},""],
  ["XMWT36KOE24",{"scan":"131129072026H0338076"},""],
  ["XMWT36KOF25",{"scan":"131129072026H0338051"},""],
  ["XMWT36KV126",{"scan":"131429060926G0095051"},""],
  ["XMWT36KV227",{"scan":"131829082026J0188111"},""],
  ["XMWT36KV428",{"scan":"131829082026J0188073"},""],
  ["XMWT36KV629",{"scan":"131829082026J0188087"},""],
  ["XMWT36KV82A",{"scan":"131829082026J0188100"},""],
  ["XMWT36KVA2B",{"scan":"131829040226E0212034"},""],
  ["XMWT36KVB2C",{"scan":"131829082026J0188094"},""],
  ["XMWT36KVC2D",{"scan":"131929060126F0602039"},""],
  ["XMWT36KVD2E",{"scan":"131929081426J0184049"},""],
  ["XMWT36KVG2F",{"scan":"131929081426J0184082"},""],
  ["XMWT36L1H2G",{"scan":"132129010826A0534003"},""],
  ["XMWT36L1I2H",{"scan":"132128020925C286013"},""],
  ["XMWT36L1J2I",{"scan":"132128091125M0286010"},""],
  ["XMWT36L1K2J",{"scan":"132229082026J0189038"},""],
  ["XMWT36L1L2K",{"scan":"132329080926J0178013"},""],
  ["XMWT36L1N2L",{"scan":"132329080926J0178025"},""],
  ["XMWT36L1N2M",{"scan":"132428022625C301004"},""],
  ["XMWT36L802N",{"scan":"132629082026J0187092"},""],
  ["XMWT36L822O",{"scan":"132629082026J0187069"},""],
  ["XMWT36L832P",{"scan":"132729060126F0601003"},""],
  ["XMWT36L842Q",{"scan":"133028111025M0296005"},""],
  ["XMWT36L852R",{"scan":"132928022625C304007"},""],
  ["XMWT36L862S",{"scan":"132929030926E0204003"},""],
  ["XMWT36L872T",{"scan":"133029041726E0221002"},""],
  ["XMWT36L882U",{"scan":"133128011925C285013"},""],
  ["XMWT3PQS11",{"scan":"(01)18904271614401(17)280100(10)UAWD210226(21)UAWD21284"},""],
  ["XMWT3PRDC2",{"scan":"(01)18904271614418(17)280100(10)UAWE240226(21)UAWE24273"},""],
  ["XMWT3PRJO3",{"scan":"(01)18904271614401(17)271100(10)UAVK261225(21)UAVK26311"},""],
  ["XMWT3PS4E4",{"scan":"(01)18904271614432(17)280200(10)UAWJ170326(21)UAWJ17857"},""],
  ["XMWT3PSBG5",{"scan":"(01)18904271614432(17)280100(10)UAWA160226(21)UAWA16859"},""],
  ["XMWT3PSTU6",{"scan":"(01)18904271614463(17)280200(10)UAWI110326(21)UAWI11970"},""],
  ["XMWT3PSZP7",{"scan":"(01)18904271614470(17)290500(10)UAXI020626(21)UAXI021609"},""],
  ["XMWT3PT658",{"scan":"(01)18904271614593(17)281100(10)UAVJ251225(21)UAVJ25806"},""],
  ["XMWT3PTL49",{"scan":"(01)18904271614579(17)290300(10)UAWW180426(21)UAWW18554"},""],
  ["XMWT3PTRJA",{"scan":"(01)18904271614586(17)280200(10)UAWI110326(21)UAWI11995"},""],
  ["XMWT3PTXNB",{"scan":"(01)18904271614609(17)290400(10)UAXC150526(21)UAXC151980"},""],
  ["XMWT3PU3MC",{"scan":"(01)18904271614579(17)290300(10)UAWW180426(21)UAWW18565"},""],
  ["XMWT3PU9VD",{"scan":"(01)18904271614555(17)280600(10)UAXS170726(21)UAXS171399"},""],
  ["XMWT3PUO1E",{"scan":"(01)18904271614548(17)280100(10)UAWE240226(21)UAWE24627"},""],
  ["XMWT3PV17F",{"scan":"(01)18904271614524(17)280200(10)UAWI110326(21)UAWI11483"},""],
  ["XMWT3PVA3G",{"scan":"(01)18904271614609(17)290600(10)UAXT200726(21)UAXT201937"},""],
  ["XMWT3PVGBH",{"scan":"(01)18904271614593(17)281100(10)UAVJ251225(21)UAVJ25809"},""],
  ["XMWT3W6T51",{"scan":"(01)18906029357844(17)270518(21)CL19AJ99006"},""],
  ["XMWT3W6T72",{"scan":"(01)18906029357882(17)280208(21)CL37AL10002"},""],
  ["XMWT3W6T93",{"scan":"(01)18906029357844(17)261115(21)CL19AJ18001"},""],
  ["XMWT3W7034",{"scan":"(01)18906029357714(17)270408(21)CM13AJ78075"},""],
  ["XMWT3W7055",{"scan":"(01)18906029357721(17)270408(21)CM16AJ78026"},""],
  ["XMWT3W7066",{"scan":"(01)18906029357738(17)290201(21)CM19PFJ16193"},""],
  ["XMWT3W7087",{"scan":"(01)18906029357745(17)280424(21)CM24AL49003"},""],
  ["XMWT3W70EB",{"scan":"(01)18906029357776(17)290421(21)CM37AO50168"},""],
  ["XMWT3W70GC",{"scan":"(01)18906029357783(17)290619(21)CM40AO75058"},""],
  ["XMWT3W70ID",{"scan":"(01)18906029357783(17)290420(21)CM40AO49027"},""],
  ["XMWT3W70JE",{"scan":"(01)18906029357790(17)290313(21)CM44PFJ41132"},""],
  ["XMWT3W70LF",{"scan":"(01)18906029357790(17)290429(21)CM44AO54029"},""],
  ["XMWT3W70MG",{"scan":"(01)18906029357806(17)270503(21)CM48AJ92078"},""],
  ["XMWT3W79CH",{"scan":"(01)18906029357608(17)270830(21)CM13AK54002"},""],
  ["XMWT3W79GK",{"scan":"(01)18906029357622(17)281217(21)CM19AN26070"},""],
  ["XMWT3W79LO",{"scan":"(01)18906029357677(17)270329(21)CM40AJ69024"},""],
  ["XMWT3W79NP",{"scan":"(01)18906029357684(17)290315(21)CM44PFJ37007"},""],
  ["XMWT3W7IWQ",{"scan":"(01)18906029357493(17)270612(21)CM13AK18096"},""],
  ["XMWT3W7IXR",{"scan":"(01)18906029357509(17)281223(21)CM16AN32012"},""],
  ["XMWT3W7IZS",{"scan":"(01)18906029357509(17)270618(21)CM16AK25002"},""],
  ["XMWT3W7J0T",{"scan":"(01)18906029357516(17)280821(21)CM19AM08029"},""],
  ["XMWT3W7J6X",{"scan":"(01)18906029357547(17)281219(21)CM32AN27045"},""],
  ["XMWT3W7J9Z",{"scan":"(01)18906029357561(17)290419(21)CM40AO48059"},""],
  ["XMWT3W7TJ12",{"scan":"(01)18906029357271(17)270504(21)CS13AJ93008"},""],
  ["XMWT3W7TL13",{"scan":"(01)18906029357288(17)290528(21)CS16AO67016"},""],
  ["XMWT3W7TM14",{"scan":"(01)18906029357295(17)290411(21)CS19AO39093"},""],
  ["XMWT3W7TP16",{"scan":"(01)18906029357387(17)261118(21)CS13AJ19023"},""],
  ["XMWT3W7TQ17",{"scan":"(01)18906029357394(17)290429(21)CS16AO54022"},""],
  ["XMWT3W7TS18",{"scan":"(01)18906029357400(17)290409(21)CS19AO37034"},""],
  ["XMWT3W7TT19",{"scan":"(01)18906029357400(17)281211(21)CS19AN18180"},""],
  ["XMWT3W7TW1B",{"scan":"(01)18906029357424(17)290402(21)CS29AO34025"},""],
  ["XMWT3W7U01D",{"scan":"(01)18906029357431(17)290502(21)CS32AO57011"},""],
  ["XMWT3W7U21E",{"scan":"(01)18906029357448(17)290130(21)CS37PFJ14027"},""],
  ["XMWT3W7U61G",{"scan":"(01)18906029357462(17)290402(21)CS44AO34034"},""]
];
/* boxes photographed by Dr Yadav on 24 Nov, read by Claude: new stock, added with the correction */
var NEW_24NOV = [
  ["stent", "Yukon Choice Swift", "Translumina", "2.75", "28", "", "SAAY060826", "SAAY061176", "", "Yukon 2.75 x 28 (photo of 24 Nov, box 1 of 3)"],
  ["stent", "Yukon Choice Swift", "Translumina", "3", "24", "", "SAAX110726", "SAAX111145", "", "Yukon 3.00 x 24 (photo of 24 Nov, box 2 of 3)"],
  ["stent", "Yukon Choice Swift", "Translumina", "2.75", "36", "", "SAAW060726", "SAAW060250", "", "Yukon 2.75 x 36 (photo of 24 Nov, box 3 of 3)"],
  ["balloon", "NC Rockstar", "Sanavascular", "2.5", "12", "NCP-2.50-12-RX", "", "131029082026J0191153", "2029-08-20", "Rockstar stack of 24 Nov, box 1 of 5"],
  ["balloon", "NC Rockstar", "Sanavascular", "2", "12", "NCP-2.00-12-RX", "", "130229080926J0179089", "2029-08-09", "Rockstar stack of 24 Nov, box 2 of 5"],
  ["balloon", "NC Rockstar", "Sanavascular", "3.5", "12", "NCP-3.50-12-RX", "", "132629082026J0187111", "2029-08-20", "Rockstar stack of 24 Nov, box 3 of 5"],
  ["balloon", "NC Rockstar", "Sanavascular", "2.75", "12", "NCP-2.75-12-RX", "", "131429060926G0095053", "2029-06-09", "Rockstar stack of 24 Nov, box 4 of 5"],
  ["balloon", "NC Rockstar", "Sanavascular", "3.5", "12", "NCP-3.50-12-RX", "", "132629082026J0187110", "2029-08-20", "Rockstar stack of 24 Nov, box 5 of 5"],
  ["stent", "Xience Alpine", "Abbott", "2.75", "23", "1120275-23", "6071341", "", "2029-07-06", "Xience 2.75 x 23 (photo of 24 Nov, 13:01)", "(01)08717648205613(17)290706(10)6071341(91)5684"]
];
/* 13.52, once: the inbox CAG cases flagged only because their CAG number had
   no year get it (2407 → 2407/2026) and lose that note; their readings stay */
function cagYears1352_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("CAG_YEARS_1352")) return false;
  pr.setProperty("CAG_YEARS_1352", "started " + cathNow_());
  var tab = batchTabRows_(), n = 0;
  tab.rows.forEach(function (c) {
    if (batchType_(c.type) !== "CAG" || !c.results || !c.results.p1) return;
    var had = JSON.stringify(c.errors || []), cag = c.cagNo;
    batchCagNumber_(c);
    if (JSON.stringify(c.errors || []) === had && c.cagNo === cag) return;
    batchWriteRow_(c); n++;
  });
  pr.setProperty("CAG_YEARS_1352", JSON.stringify({ at: cathNow_(), cases: n }));
  batchLogRow_(runId, "", "", "CAG numbers", "ok", n + " inbox case(s) given the year of their CAG (number/year)");
  return n > 0;
}
function invFix24Nov_(runId) {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("INV_FIX_24NOV")) return false;
  pr.setProperty("INV_FIX_24NOV", "started " + cathNow_());
  var who = "Claude (barcode check of 24 Nov)";
  var boxes = boxRowsAll_(), byId = {}, changed = 0, missed = [], statuses = {};
  boxes.forEach(function (b) { byId[b.id] = b; });
  FIX_24NOV.forEach(function (f) {
    var b = byId[f[0]];
    if (!b) { missed.push(f[0]); return; }
    var set = f[1] || {};
    Object.keys(set).forEach(function (k) { b[k] = set[k]; });
    if (set.scan && /^\(/.test(set.scan) && set.codes == null) b.codes = set.scan;
    if (f[2]) { b.why = f[2]; b.checkedBy = who; b.checkedAt = cathNow_(); }
    if (set.status) statuses[set.status] = (statuses[set.status] || 0) + 1;
    b._dirty = true; changed++;
  });
  // the new boxes of 24 Nov (a serial already on the list is not added twice)
  var haveSn = {}, added = 0;
  boxes.forEach(function (b) { if (b.serial) haveSn[invNorm_(b.serial)] = 1; if (b.scan) haveSn["S" + b.scan] = 1; if (/\(91\)/.test(b.codes || "")) haveSn["S" + String(b.codes).split("\n")[0]] = 1; });
  var fresh = [];
  NEW_24NOV.forEach(function (n) {
    if ((n[7] && haveSn[invNorm_(n[7])]) || (n[10] && haveSn["S" + n[10]])) return;
    fresh.push({ id: cathId_("X"), up: "CLAUDE-24NOV", photo: n[9] + ", read by Claude", fileId: "", status: "in stock", why: "added from the photo Dr Yadav sent on 24 Nov", kind: n[0], brand: n[1], mfr: n[2],
      dia: n[3], len: n[4], ref: n[5], lot: n[6], serial: n[7], expiry: n[8], gtin: n[10] ? n[10].slice(4, 18) : "", codes: n[10] || "", place: "", item: "", same: "", readAt: cathNow_(), readBy: "Claude", checkedBy: who, checkedAt: cathNow_(), size: "", area: "", usedIn: "", scan: n[10] || "" });
    added++;
  });
  // one write for the whole tab (rows keep their places)
  if (changed) boxTab_().getRange(2, 1, boxes.length, BOX_HEAD.length).setNumberFormat("@").setValues(boxes.map(boxVals_));
  if (fresh.length) boxAppend_(fresh);
  boxSyncMoves_(who);
  pr.setProperty("INV_FIX_24NOV", JSON.stringify({ at: cathNow_(), changed: changed, added: added, missed: missed, statuses: statuses }));
  batchLogRow_(runId, "", "", "barcode check of 24 Nov (read by Claude)", "written",
    changed + " box row(s) updated (" + Object.keys(statuses).map(function (k) { return statuses[k] + " now " + k; }).join(", ") + "; barcodes kept on " +
    FIX_24NOV.filter(function (f) { return f[1] && f[1].scan; }).length + " boxes); " + added + " new box(es) added from the photos of 24 Nov" + (missed.length ? "; not found: " + missed.join(", ") : ""));
  return true;
}
/* ==== 13.50 — what each Gemini request cost ====
   Every answer from Google carries its own count of tokens (usageMetadata):
   tokens in (the page and the prompt), the answer, and the model's thinking
   (billed as output). Each request is written to the "Costs" tab with what it
   was for (a CAG or PTCA case, a used-stent / stock / day / weekly photo, a
   bill, the daily model check, a scan on a phone), the case or photo, the
   model and whether it went at the batch queue's half price. The app's Costs
   page adds these up with the prices set there (₹ per million tokens). */
var COSTS_TAB = "Costs";
var COST_HEAD = ["Time", "What", "Case / photo id", "Name", "Step", "Model", "Price", "Tokens in", "Answer", "Thinking", "Run id"];
var COST_CTX_ = null;
var COST_KEEP = 20000;
function costNote_(u, model, half, step) {
  if (!u) return;
  var c = COST_CTX_ || { what: "other" };
  try {
    sheet(COSTS_TAB, COST_HEAD).appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      c.what || "other", c.id || "", String(c.name || "").slice(0, 80), String(step || "").slice(0, 80), String(model || ""), half ? "half" : "full",
      Number(u.promptTokenCount) || 0, Number(u.candidatesTokenCount) || 0, Number(u.thoughtsTokenCount) || 0, c.runId || ""]);
  } catch (e) {}
}
/* the phone's own scans (the app reads a sheet straight from Google) are sent
   here afterwards, a few at a time */
function costLog_(req) {
  var rows = Array.isArray(req.rows) ? req.rows.slice(0, 200) : [];
  var sh = sheet(COSTS_TAB, COST_HEAD), out = [];
  rows.forEach(function (r) {
    if (!r || typeof r !== "object") return;
    var at = /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(String(r.at || "")) ? String(r.at) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    out.push([at, cathStr_(r.what, 40) || "phone scan", cathStr_(r.id, 80), cathStr_(r.name, 80), cathStr_(r.step, 80), cathStr_(r.model, 60), r.half ? "half" : "full",
      Number(r["in"]) || 0, Number(r.answer) || 0, Number(r.thinking) || 0, "phone"]);
  });
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, COST_HEAD.length).setValues(out);
  return { logged: out.length };
}
/* prices, ₹ per million tokens, per model ("*" for any model not listed);
   the half-price queue costs half (COST_PRICES.half, default 0.5) */
function costPrices_() {
  var d = null;
  try { d = JSON.parse(PropertiesService.getScriptProperties().getProperty("COST_PRICES") || "null"); } catch (e) {}
  if (!d || typeof d !== "object") d = {};
  if (!d.models || typeof d.models !== "object") d.models = {};
  if (!(Number(d.half) > 0)) d.half = 0.5;
  /* default from the Google bill of 17-20 Nov 2026 (Gemini 3.8 Flash): input ₹71.4, output incl. thinking ₹357 per million tokens */
  if (!Object.keys(d.models).length) d.models["*"] = { "in": 71.4, out: 357 };
  return d;
}
function costPricesSet_(req) {
  var p = req.prices && typeof req.prices === "object" ? req.prices : {};
  var d = { models: {}, half: Number(p.half) > 0 && Number(p.half) <= 1 ? Number(p.half) : 0.5, note: cathStr_(p.note, 200), at: cathNow_(), by: cathStr_(req.by, 60) };
  Object.keys(p.models || {}).slice(0, 40).forEach(function (m) {
    var x = p.models[m] || {}, i = Number(x["in"]), o = Number(x.out);
    if (isFinite(i) && isFinite(o) && i >= 0 && o >= 0 && (i || o)) d.models[cathStr_(m, 60)] = { "in": i, out: o };
  });
  PropertiesService.getScriptProperties().setProperty("COST_PRICES", JSON.stringify(d));
  return { prices: d };
}
/* the requests of the last days for the Costs page (the app adds them up) */
function costList_(req) {
  costBackfill_();
  var days = Math.max(1, Math.min(400, Number(req.days) || 31));
  var from = Utilities.formatDate(new Date(Date.now() - days * 86400000), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COSTS_TAB), rows = [];
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, COST_HEAD.length).getValues();
    v.forEach(function (r) {
      var t = r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : String(r[0]);
      if (t.slice(0, 10) < from) return;
      rows.push([t, String(r[1]), String(r[2]), String(r[3]), String(r[4]), String(r[5]), String(r[6]), Number(r[7]) || 0, Number(r[8]) || 0, Number(r[9]) || 0]);
    });
  }
  return { rows: rows, prices: costPrices_(), since: costSince_(), think: thinkInfo_() };
}
function costSince_() { return PropertiesService.getScriptProperties().getProperty("COST_SINCE") || ""; }
/* once: the token counts the Batch log already holds (each page read since
   13.48, 19 Nov 2026) are put on the Costs tab, so the page starts with them */
function costBackfill_() {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty("COST_SINCE")) return;
  pr.setProperty("COST_SINCE", cathNow_());
  var lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BATCH_LOG);
  if (!lg || lg.getLastRow() < 2) return;
  var v = lg.getRange(2, 1, lg.getLastRow() - 1, 7).getValues(), names = {}, out = [];
  var tz = Session.getScriptTimeZone();
  var sum = {};
  v.forEach(function (r) {
    var det = String(r[5] || ""), id = String(r[1] || ""), t = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, "yyyy-MM-dd HH:mm:ss") : String(r[0]);
    var what = /PTCA/i.test(id) || /PTCA/.test(String(r[3])) ? "PTCA case" : "CAG case";
    if (String(r[3]) === "finish") {
      // the case's totals: what its pages do not account for is the page recognition (read at once)
      var f = /(\d+) request\(s\), tokens in (\d+), answer (\d+), thinking (\d+)/.exec(det), sm = sum[id];
      if (f && sm) {
        var left = [Number(f[1]) - sm.n, Number(f[2]) - sm.i, Number(f[3]) - sm.a, Number(f[4]) - sm.k];
        if (left[0] > 0 && left[1] >= 0 && left[2] >= 0 && left[3] >= 0)
          out.push([t, what, id, "", "page recognition" + (left[0] > 1 ? " and retries (" + left[0] + ")" : ""), "", "full", left[1], left[2], left[3], String(r[6] || "")]);
      }
      delete sum[id];
      return;
    }
    var m = /tokens: in (\d+), answer (\d+), thinking (\d+)/.exec(det);
    if (!m) return;
    if (/· (\S.*?) · /.test(det) && /^reading (PTCA sheet 1|Sheet 1)/.test(String(r[3]))) names[id] = det.split(" · ")[0];
    var s0 = sum[id] = sum[id] || { n: 0, i: 0, a: 0, k: 0 };
    s0.n++; s0.i += Number(m[1]); s0.a += Number(m[2]); s0.k += Number(m[3]);
    out.push([t, what, id, "", String(r[2] || "").slice(0, 80), "", /half-price/.test(det) ? "half" : "full",
      Number(m[1]), Number(m[2]), Number(m[3]), String(r[6] || "")]);
  });
  out.forEach(function (o) { o[3] = names[o[2]] || ""; });
  if (!out.length) return;
  var sh = sheet(COSTS_TAB, COST_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, out.length, COST_HEAD.length).setValues(out);
  pr.setProperty("COST_SINCE", cathNow_() + " (" + out.length + " page(s) from the Batch log)");
}
/* the tab keeps the newest COST_KEEP requests (housekeeping) */
function costTrim_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COSTS_TAB);
  if (!sh) return 0;
  var n = sh.getLastRow() - 1 - COST_KEEP;
  if (n > 200) { sh.deleteRows(2, n); return n; }
  return 0;
}

/* (not used: 13.50 re-read the photos from 20 Nov with Gemini; left out to spend no Gemini tokens)
   13.50 — once, after 13.50 goes in: the stock photos uploaded from 20 Nov
   2026 (read by 13.49's stent reader, without the boxes' places in the photo
   or the foreground/background split) are read again by the new reader and
   filed in their instrument's processed folder */
function invAutoFix50_(runId) {
  var pr = PropertiesService.getScriptProperties();
  var d = null; try { d = JSON.parse(pr.getProperty("INV_BOXFIX50") || "null"); } catch (e) {}
  var tab = stentUpRows_();
  if (d) {
    if (d.finished) return false;
    var want = {}; (d.ids || []).forEach(function (id) { want[id] = 1; });
    var left = tab.rows.filter(function (r) { return want[r.id] && r.status === "queued"; }).length;
    if (!left) { d.finished = cathNow_(); pr.setProperty("INV_BOXFIX50", JSON.stringify(d)); batchLogRow_(runId, "", "", "stock re-read (13.50)", "finished", (d.ids || []).length + " photo(s)"); }
    return left > 0;
  }
  var list = tab.rows.filter(function (r) { return r.purpose === "stock" && String(r.uploaded || "").slice(0, 10) >= BOX_FROM_SINCE && (r.status === "scanned" || r.status === "failed"); });
  var rec = { at: cathNow_(), ids: list.map(function (r) { return r.id; }), files: list.map(function (r) { return r.file; }) };
  if (list.length) {
    var want2 = {}; list.forEach(function (r) { want2[r.id] = 1; });
    boxDeleteRows_(boxRowsAll_().filter(function (b) { return want2[b.up]; }).map(function (b) { return b.row; }));
    list.forEach(function (r) { r.status = "queued"; r.result = null; r.tries = 0; r.stickers = 0; r.errors = []; r.log = (r.log ? r.log + "\n" : "") + cathNow_() + " 13.50: read again with the new reader (every instrument, foreground only, each box's place)"; stentUpWrite_(r); });
    boxSyncMoves_("13.50 re-read");
    batchLogRow_(runId, "", "", "stock re-read (13.50)", "started", list.length + " photo(s) from " + BOX_FROM_SINCE + " read again");
  } else rec.finished = rec.at;
  pr.setProperty("INV_BOXFIX50", JSON.stringify(rec));
  return list.length > 0;
}
function invAutoFixStatus_() {
  var d = null; try { d = JSON.parse(PropertiesService.getScriptProperties().getProperty("INV_BOXFIX") || "null"); } catch (e) {}
  return d ? { at: d.at, finished: d.finished || "", reread: d.reread || [], moved: d.moved || [], result: d.result || null } : null;
}
/* the technicians' decision on a box: fixed and counted, counted as another
   box (not a repeat), or discarded */
function boxSave_(req) {
  var by = cathStr_(req.by, 60) || "technician";
  var boxes = boxRowsAll_(), b = null;
  for (var i = 0; i < boxes.length; i++) if (boxes[i].id === String(req.id || "")) b = boxes[i];
  if (!b) throw new Error("that box is no longer on the list");
  var f = req.fields && typeof req.fields === "object" ? req.fields : {};
  ["brand", "dia", "len", "ref", "lot", "serial", "expiry", "gtin", "size"].forEach(function (k) { if (f[k] != null) b[k] = k === "dia" || k === "len" ? stentNum_(f[k]) : cathStr_(f[k], 60); });
  if (f.kind) b.kind = invKindOf_(f.kind);
  var to = String(req.status || "");
  if (to === "in stock") {
    var why = boxWhy_(b, null);
    if (why) throw new Error("not added: " + why);
    b.status = "in stock"; b.why = ""; b.same = "";
  } else if (to === "same") {
    // a repeat confirmed as the box already counted; the LOT actually on the
    // box (when given) corrects whichever reading was wrong
    if (b.status !== "repeat") throw new Error("only a repeat can be confirmed as the same box");
    var lot = cathStr_(req.lot, 60), first = null;
    for (var j = 0; j < boxes.length; j++) if (boxes[j].id === b.same) first = boxes[j];
    if (lot) {
      b.lot = lot;
      if (first && invNorm_(first.lot) !== invNorm_(lot)) {
        first.why = "LOT corrected from " + first.lot + " to " + lot + " by " + by + " (checked on the box)"; first.lot = lot; first.checkedBy = by; first.checkedAt = cathNow_();
        boxWrite_(first);
      }
    }
    b.why = "same box as on " + (first ? first.photo || "another photo" : "another photo") + (lot ? ", LOT " + lot : "") + " — confirmed by " + by;
  } else if (to === "back") {
    if (b.status !== "unseen" && b.status !== "used") throw new Error("that box is already in stock");
    b.status = "in stock"; b.why = "back in stock — " + (cathStr_(req.note, 120) || "checked on the shelf");
  } else if (to === "discarded") { b.status = "discarded"; b.why = cathStr_(req.note, 200) || "discarded"; }
  else if (to === "returned") { b.status = "returned"; b.why = cathStr_(req.note, 200) || "returned to the company"; }
  else if (to === "check") { b.status = "check"; b.why = cathStr_(req.note, 200) || "sent back to check"; }
  else throw new Error("unknown change");
  b.checkedBy = by; b.checkedAt = cathNow_();
  boxWrite_(b);
  boxSyncMoves_(by);
  return { said: (b.brand + " " + boxSizeText_(b) + (b.lot ? " LOT " + b.lot : b.serial ? " No. " + b.serial : "")).trim() + ": " + (b.status === "in stock" ? "added to the stock" : b.status === "discarded" ? "discarded" : b.status === "returned" ? "returned to the company, off the stock" : to === "same" ? "confirmed as the same box, not counted again" : "back to check") + "." };
}
/* a used stent with no matching box, accepted as it is (its box came before
   the stock photos, or was never photographed) */
function boxNoMatchOk_(req) {
  var id = cathStr_(req.sticker, 60);
  if (!id) throw new Error("no sticker given");
  var pr = PropertiesService.getScriptProperties(), list = [];
  try { list = JSON.parse(pr.getProperty("BOX_NOMATCH_OK") || "[]") || []; } catch (e) { list = []; }
  if (list.indexOf(id) < 0) list.push(id);
  pr.setProperty("BOX_NOMATCH_OK", JSON.stringify(list.slice(-2000)));
  return { said: "Noted — that used stent is no longer listed." };
}
/* 13.50: a box's photo, for the page to draw the box on it */
function boxPhoto_(req) {
  var id = String(req.id || ""), b = null, list = boxRowsAll_();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) b = list[i];
  if (!b) throw new Error("that box is no longer on the list");
  if (!b.fileId) throw new Error("this photo was sent in the chat and is not in Drive");
  var file;
  try { file = DriveApp.getFileById(b.fileId); if (file.isTrashed()) throw new Error("x"); }
  catch (e) { throw new Error("the photo was deleted (photos are kept a year: six months full size, six months smaller)"); }
  if (file.getSize() > 15 * 1024 * 1024) throw new Error("the photo is larger than 15 MB — open it in Drive");
  var blob = file.getBlob();
  return { id: b.id, area: b.area, place: b.place, photo: b.photo, mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}
/* the stock photos read lately, with what each showed and where it was filed */
function invPhotoList_() {
  return stentUpRows_().rows.filter(function (r) { return r.purpose === "stock" || r.purpose === "weekly"; }).slice(-30).reverse().map(function (r) {
    return { id: r.id, file: r.file, url: stentPhotoUrl_(r.fileId), status: r.status, uploaded: r.uploaded, scannedAt: r.scannedAt,
      folder: r.purpose === "weekly" ? WEEKLY_DEFAULT : r.folder ? INV_KIND_FOLDER[r.folder] || r.folder : "", result: r.result || null, error: (r.errors || [])[0] ? (r.errors[0].reason || String(r.errors[0])) : "" };
  });
}
/* the boxes for the technicians' page; a box in stock that a used stent's
   sticker fits (same LOT and kind) shows that PTCA */
function boxList_() {
  var boxes = boxRowsAll_(), stickers = [];
  try { stickers = stentCounted_(stentRowsAll_()); } catch (e) {}
  var taken = {}, boxBy = {};
  var give = function (b, st, how) { taken[st.id] = 1; boxBy[b.id] = { sticker: st.id, ptcaNo: st.ptcaNo, patient: st.patient, date: invStickerDate_(st), how: how }; };
  // 13.60: the box a sticker took off by itself (its barcode, serial or LOT — stentBoxUse_)
  var stById = {}; stickers.forEach(function (st) { stById[st.id] = st; });
  boxes.forEach(function (b) {
    var m = /^STICKER (.+)$/.exec(String(b.same || "")), st = m ? stById[m[1]] : null;
    if (st && !taken[st.id]) give(b, st, /barcode/.test(String(b.why)) ? "barcode" : /serial/.test(String(b.why)) ? "serial" : "lot");
  });
  var inStock = boxes.filter(function (b) { return b.status === "in stock"; });
  // 1) the very box: the sticker's serial number on a box in stock
  stickers.forEach(function (st) {
    var sn = invNorm_(st.serial); if (!sn) return;
    for (var i = 0; i < inStock.length; i++) if (!boxBy[inStock[i].id] && invNorm_(inStock[i].serial) === sn && boxSizeSame_(inStock[i], st)) { give(inStock[i], st, "serial"); return; }
  });
  // 2) a box of the same LOT and size (as before)
  inStock.forEach(function (b) {
    if (boxBy[b.id]) return;
    for (var i = 0; i < stickers.length; i++) { var st = stickers[i]; if (!taken[st.id] && boxStickerFits_(b, st)) { give(b, st, "lot"); break; } }
  });
  // 3) 13.50: Yukon — any box of the same brand and size, the oldest first:
  //    its boxes are not photographed one by one, so the shelf only needs the
  //    right count per size; the exact stent (for the bill) is the sticker's
  var anyLeft = inStock.filter(function (b) { return !boxBy[b.id] && boxAnySize_(b.brand); }).sort(function (a, b) { return String(a.readAt).localeCompare(String(b.readAt)); });
  stickers.forEach(function (st) {
    if (taken[st.id] || !boxAnySize_(st.brand)) return;
    for (var i = 0; i < anyLeft.length; i++) {
      var b = anyLeft[i];
      if (!boxBy[b.id] && invNorm_(b.brand) === invNorm_(st.brand) && boxSizeSame_(b, st)) { give(b, st, "size"); return; }
    }
  });
  var list = boxes.map(function (b) {
    var o = {};
    BOX_KEYS.forEach(function (k) { o[k] = b[k]; });
    o.url = stentPhotoUrl_(b.fileId);
    if (boxBy[b.id]) o.usedBy = boxBy[b.id];
    return o;
  });
  // a used stent (sticker read since the first stock photo) that fits no box in
  // stock: its LOT may be misread on the sticker or the box, or that box was
  // never photographed; the nearest box (LOT one character apart) is named
  var since = boxes.map(function (b) { return String(b.readAt).slice(0, 10); }).filter(Boolean).sort()[0] || "";
  var okList = [];
  try { okList = JSON.parse(PropertiesService.getScriptProperties().getProperty("BOX_NOMATCH_OK") || "[]") || []; } catch (e) {}
  var noBox = !since ? [] : stickers.filter(function (st) { return !taken[st.id] && okList.indexOf(st.id) < 0 && invStickerDate_(st) >= since; }).map(function (st) {
    var near = boxes.filter(function (b) {
      return b.status === "in stock" && Number(b.dia) === Number(st.dia) && Number(b.len) === Number(st.len) && boxEdit1_(invNorm_(b.lot), invNorm_(st.lot));
    })[0];
    return { sticker: st.id, brand: st.brand, dia: st.dia, len: st.len, lot: st.lot, ptcaNo: st.ptcaNo, patient: st.patient, date: invStickerDate_(st),
      near: near ? { id: near.id, lot: near.lot, photo: near.photo } : null };
  });
  return { boxes: list, noBox: noBox };
}
/* "Read inventory photos now" on the technicians' page */
function invScanNow_() {
  return batchTick({ fromApp: true, only: "inventory" });
}
/* "Scan now" on the technicians' page: the stent photos only */
function stentScanNow_() {
  return batchTick({ fromApp: true, only: "stents" });
}
/* the technicians' page: is this device let in, and how do things stand */
function techStatus_(req) {
  var ok = techAllowed(req.tkey);
  var o = { canTech: ok, techSet: techKeyIsSet_(), canEdit: editAllowed(req.key), v: SCRIPT_VERSION, cath: 1 };
  if (!ok) return o;
  try { o.stents = stentStatus_(); } catch (e) { o.stentsError = String(e && e.message || e); }
  o.invStart = invStart_();
  return o;
}
function techRefused_() {
  return techKeyIsSet_() ? "This device does not have the technicians' key (or it has been changed) \u2014 enter it in Settings."
    : "No technicians' key has been set yet \u2014 an editor sets one in Settings (Technicians' key).";
}
