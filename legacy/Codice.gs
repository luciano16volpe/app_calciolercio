// CalcioLercio backend — incolla in Apps Script del tuo foglio Google
const SHEET_MATCHES = 'partite';
const SHEET_RATINGS = 'pagelle';
const SHEET_ALBO = 'albo_oro';
const SHEET_GAZ = 'gazzette';     // 📰 one row per Gazzetta (image saved in Google Drive)
const GAZ_HEADERS = ['matchId','data','fileId','url','nome','caricata'];
const GAZ_FOLDER = 'CalcioLercio – Gazzette';   // albo d'oro: premi e imprese di ogni stagione
const ALBO_HEADERS = ['stagione','chiave','dal','al','stato','premio','titolo','giocatore','valore','aggiornato'];

function doGet(e) {
  const action = e.parameter.action || 'ping';
  try {
    if (action === 'ping') return out({ok:true, matchCount:getMatches().length});
    if (action === 'matches') return out({ok:true, matches:getMatches(), ratings:getRatings(), albo:getAlbo(), gazzette:getGazzette()});
    if (action === 'gazFile') return out(Object.assign({ok:true}, getGazFile(e.parameter.id)));
    return out({ok:false, error:'unknown action'});
  } catch(err) {
    return out({ok:false, error:String(err)});
  }
}

function doPost(e) {
  const action = e.parameter.action;
  const body = JSON.parse(e.postData.contents);
  try {
    if (action === 'addMatch')    return out({ok:true, id:addMatch(body)});
    if (action === 'deleteMatch') return out({ok:true, deleted:deleteMatch(body.id)});
    if (action === 'saveRatings') return out({ok:true, saved:saveRatings(body)});
    if (action === 'updateScore') return out({ok:true, updated:updateScore(body)});
    if (action === 'saveAlbo')    return out({ok:true, saved:saveAlbo(body)});
    if (action === 'uploadGazzetta') return out(Object.assign({ok:true}, uploadGazzetta(body)));
    if (action === 'deleteGazzetta') return out({ok:true, deleted:deleteGazzetta(body)});
    return out({ok:false, error:'unknown action'});
  } catch(err) {
    return out({ok:false, error:String(err)});
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaders(sh, headers) {
  headers.forEach((h, i) => {
    const current = sh.getRange(1, i + 1).getValue();
    if (current !== h) {
      sh.getRange(1, i + 1).setValue(h);
    }
  });
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  } else {
    ensureHeaders(sh, headers);
  }
  return sh;
}

function getMatches() {
  const sh = getSheet(SHEET_MATCHES, ['id','date','notes','teamA','teamB','scoreA','scoreB','pred','predRank']);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(r => ({
    id: r[0], date: r[1], notes: r[2] || '',
    teamA: r[3] ? JSON.parse(r[3]) : [],
    teamB: r[4] ? JSON.parse(r[4]) : [],
    scoreA: r[5], scoreB: r[6],
    pred: (r[7] === '' || r[7] == null) ? null : Number(r[7]),
    predRank: (r[8] === '' || r[8] == null) ? null : Number(r[8])
  })).filter(m => m.id);
}

function getAlbo() {
  const sh = getSheet(SHEET_ALBO, ALBO_HEADERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).filter(r => r[1]).map(r => {
    const o = {}; ALBO_HEADERS.forEach((h, i) => { o[h] = (r[i] instanceof Date) ? Utilities.formatDate(r[i], 'Europe/Rome', 'yyyy-MM-dd') : r[i]; });
    return o;
  });
}

// replaces all the rows of one season (payload.chiave) with payload.rows
function saveAlbo(payload) {
  const sh = getSheet(SHEET_ALBO, ALBO_HEADERS);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === payload.chiave) sh.deleteRow(i + 1);
  }
  const now = new Date().toISOString();
  (payload.rows || []).forEach(r => {
    sh.appendRow(ALBO_HEADERS.map(h => h === 'aggiornato' ? now : (r[h] === undefined ? '' : r[h])));
  });
  return (payload.rows || []).length;
}

function getRatings() {
  const sh = getSheet(SHEET_RATINGS, ['matchId','player','rating','notes','playerId','goals','autogol','meta','assist','rigori_sbagliati','titolo']);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(r => ({
    matchId: r[0], player: r[1], rating: parseFloat(r[2]) || 0, notes: r[3] || '', playerId: r[4] || '', goals: parseInt(r[5]) || 0, autogol: parseInt(r[6]) || 0, meta: parseInt(r[7]) || 0, assist: parseInt(r[8]) || 0, rigoriSbagliati: parseInt(r[9]) || 0, titolo: r[10] || ''
  })).filter(r => r.matchId && (r.player || r.playerId));
}

function val(v) { return (v === 0 || (v !== undefined && v !== null && v !== '')) ? v : ''; }

function addMatch(m) {
  const sh = getSheet(SHEET_MATCHES, ['id','date','notes','teamA','teamB','scoreA','scoreB','pred','predRank']);
  const id = m.id || ('m_' + Date.now());
  sh.appendRow([id, m.date, m.notes || '',
    JSON.stringify(m.teamA || []),
    JSON.stringify(m.teamB || []),
    val(m.scoreA), val(m.scoreB),     // keep a real 0 (e.g. 5-0), only missing values become ''
    val(m.pred), val(m.predRank)]);   // balance prediction saved at creation (pred>0 = Blu favoriti)
  return id;
}

function deleteMatch(id) {
  const sh = getSheet(SHEET_MATCHES, ['id','date','notes','teamA','teamB','scoreA','scoreB','pred','predRank']);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) sh.deleteRow(i + 1);
  }
  // delete ratings too
  const rs = getSheet(SHEET_RATINGS, ['matchId','player','rating','notes','playerId','goals','autogol','meta','assist','rigori_sbagliati','titolo']);
  const rd = rs.getDataRange().getValues();
  for (let i = rd.length - 1; i >= 1; i--) {
    if (rd[i][0] === id) rs.deleteRow(i + 1);
  }
  deleteGazzetta({matchId: id});   // its Gazzetta goes to the Drive bin too
  return true;
}

// ── 📰 Gazzette: images in the Drive folder GAZ_FOLDER, references in the sheet "gazzette" ──
function getGazFolder() {
  const it = DriveApp.getFoldersByName(GAZ_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(GAZ_FOLDER);
}
function getGazzette() {
  const sh = getSheet(SHEET_GAZ, GAZ_HEADERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).filter(r => r[0] && r[2]).map(r => ({
    matchId: r[0],
    data: (r[1] instanceof Date) ? Utilities.formatDate(r[1], 'Europe/Rome', 'yyyy-MM-dd') : String(r[1] || ''),
    fileId: r[2], url: r[3], nome: r[4],
    caricata: (r[5] instanceof Date) ? r[5].toISOString() : String(r[5] || '')
  }));
}
// one Gazzetta per match: a new upload replaces the previous one (the old file goes to the Drive bin)
function uploadGazzetta(p) {
  if (!p.matchId || !p.data) throw new Error('dati mancanti');
  deleteGazzetta({matchId: p.matchId});
  const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', p.name || ('gazzetta_' + p.matchId + '.jpg'));
  const file = getGazFolder().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  getSheet(SHEET_GAZ, GAZ_HEADERS).appendRow([p.matchId, p.date || '', file.getId(), file.getUrl(), file.getName(), new Date()]);
  return {fileId: file.getId(), url: file.getUrl(), nome: file.getName()};
}
function deleteGazzetta(p) {
  const sh = getSheet(SHEET_GAZ, GAZ_HEADERS);
  const data = sh.getDataRange().getValues();
  let n = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === p.matchId) {
      try { DriveApp.getFileById(data[i][2]).setTrashed(true); } catch (e) {}
      sh.deleteRow(i + 1); n++;
    }
  }
  return n;
}
// the image itself (base64), so the app can share or save it as a file
function getGazFile(id) {
  const f = DriveApp.getFileById(id), b = f.getBlob();
  return {mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()), nome: f.getName()};
}

function saveRatings(payload) {
  const sh = getSheet(SHEET_RATINGS, ['matchId','player','rating','notes','playerId','goals','autogol','meta','assist','rigori_sbagliati','titolo']);
  const data = sh.getDataRange().getValues();
  // remove old ratings for this match
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === payload.matchId) sh.deleteRow(i + 1);
  }
  // append new ones
  (payload.ratings || []).forEach(r => {
    sh.appendRow([payload.matchId, r.player, r.rating, r.notes || '', r.playerId || '', r.goals || 0, r.autogol || 0, r.meta || 0, r.assist || 0, r.rigoriSbagliati || 0, r.titolo || '']);
  });
  return (payload.ratings || []).length;
}

function updateScore(payload) {
  const sh = getSheet(SHEET_MATCHES, ['id','date','notes','teamA','teamB','scoreA','scoreB','pred','predRank']);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.id) {
      sh.getRange(i + 1, 6).setValue(payload.scoreA);
      sh.getRange(i + 1, 7).setValue(payload.scoreB);
      if (payload.notes !== undefined) sh.getRange(i + 1, 3).setValue(payload.notes);
      return true;
    }
  }
  return false;
}
