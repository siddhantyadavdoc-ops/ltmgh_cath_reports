/**
 * Training mirror — copies the cath scanner's training data into THIS
 * account's own Google Drive, so it uses this account's storage.
 *
 * Runs as the account that owns it (e.g. lilsiddhu@gmail.com), NOT as the
 * department account. Setup, once, on a computer:
 *   1. Signed in as this account, open https://script.google.com → New project.
 *   2. Replace the code with this file, name the project "Training mirror", save.
 *   3. Pick the function "setup" at the top and press Run; allow the access it asks for.
 *      It copies what is waiting now and then repeats every hour by itself.
 *
 * Where from: the "Scan training data" folder the department script
 * (ltmghcardio@gmail.com) shares with this account once the email is entered
 * on the app's Scan accuracy page. Where to: DEST_ID below.
 * Each case folder is copied file by file (copies made by this account count
 * against its storage); labels.json is re-copied when it changes. When a case
 * is done, mirrored.txt is left in the source folder; the department script
 * then removes its own copy a day later.
 */
var DEST_ID = "1A-cVURDRHMlO7rBElmd9H6t_u16KVdhb";   // "Cath Scan Training Data" in this account's Drive
var SOURCE_NAME = "Scan training data";

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "mirror") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("mirror").timeBased().everyHours(1).create();
  var r = mirror();
  Logger.log("Set up. First run: " + JSON.stringify(r));
}

function sourceFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty("SOURCE_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.searchFolders("title = '" + SOURCE_NAME + "' and sharedWithMe = true and trashed = false");
  if (!it.hasNext()) return null;
  var f = it.next();
  PropertiesService.getScriptProperties().setProperty("SOURCE_ID", f.getId());
  return f;
}

function mirror() {
  var t0 = Date.now(), src = sourceFolder_();
  if (!src) return { ok: false, why: "no folder called '" + SOURCE_NAME + "' is shared with this account yet" };
  var dest = DriveApp.getFolderById(DEST_ID), cases = src.getFolders(), done = 0, copied = 0;
  while (cases.hasNext()) {
    if (Date.now() - t0 > 4.5 * 60 * 1000) break;              // stay inside the 6-minute limit; the next run carries on
    var c = cases.next(), name = c.getName();
    var dit = dest.getFoldersByName(name), d = dit.hasNext() ? dit.next() : dest.createFolder(name);
    var files = c.getFiles(), stampFile = null, ok = true, copiedHere = 0;
    while (files.hasNext()) {
      var f = files.next(), fn = f.getName();
      if (fn === "mirrored.txt") { stampFile = f; continue; }
      try {
        var have = d.getFilesByName(fn), h = have.hasNext() ? have.next() : null;
        if (!h) { f.makeCopy(fn, d); copied++; copiedHere++; }
        else if (fn === "labels.json" && f.getLastUpdated().getTime() > h.getLastUpdated().getTime()) { h.setContent(f.getBlob().getDataAsString()); copied++; copiedHere++; }
      } catch (e) { ok = false; }
    }
    // the stamp is when this case was last copied: written only when something
    // was copied (or never stamped), so the department script can tell a case
    // that has sat unchanged for a day
    if (ok && (copiedHere || !stampFile)) {
      var now = String(Date.now());
      if (stampFile) stampFile.setContent(now); else c.createFile("mirrored.txt", now, "text/plain");
      done++;
    }
  }
  return { ok: true, cases: done, filesCopied: copied };
}
