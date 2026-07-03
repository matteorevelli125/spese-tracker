/* Backup su Google Drive — client-only, nessun backend.
 * Autenticazione via Google Identity Services (token client), scope drive.file:
 * l'app vede e gestisce SOLO i file che ha creato lei stessa.
 */
'use strict';

const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const cfg = window.DRIVE_CONFIG || {};
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;      // timestamp ms
  let pendingResolve = null; // resolver della richiesta token in corso

  const isConfigured = () =>
    !!cfg.clientId && !cfg.clientId.startsWith('INCOLLA');

  // Inizializza il token client GIS al primo uso.
  function initClient() {
    if (tokenClient || !isConfigured()) return;
    if (!(window.google && google.accounts && google.accounts.oauth2)) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: SCOPE,
      callback: resp => {
        const done = pendingResolve; pendingResolve = null;
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600e3) - 60e3;
          done && done(true);
        } else {
          done && done(false);
        }
      },
      error_callback: () => { const done = pendingResolve; pendingResolve = null; done && done(false); },
    });
  }

  const tokenValid = () => accessToken && Date.now() < tokenExpiry;

  // Ottiene un token valido. interactive=false → refresh silenzioso (nessun
  // popup se la sessione Google è attiva e l'accesso è già stato concesso).
  function ensureToken(interactive) {
    if (tokenValid()) return Promise.resolve(true);
    initClient();
    if (!tokenClient) return Promise.resolve(false);
    return new Promise(resolve => {
      pendingResolve = resolve;
      try {
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) { pendingResolve = null; resolve(false); }
    });
  }

  async function api(path, opts = {}) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  // Trova (o crea) la cartella di backup; ne memorizza l'id in meta.
  async function getFolderId() {
    let id = await DB.getMeta('driveFolderId');
    if (id) {
      // verifica che esista ancora (non cestinata)
      try { const f = await api(`files/${id}?fields=id,trashed`); if (f && !f.trashed) return id; } catch (e) { /* ricrea */ }
    }
    const q = encodeURIComponent(`name='${cfg.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await api(`files?q=${q}&fields=files(id,name)&spaces=drive`);
    if (found.files && found.files.length) { id = found.files[0].id; }
    else {
      const created = await api('files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cfg.folderName, mimeType: 'application/vnd.google-apps.folder' }),
      });
      id = created.id;
    }
    await DB.setMeta('driveFolderId', id);
    return id;
  }

  async function buildDump() {
    const [expenses, budgets, recurring] = await Promise.all([
      DB.allExpenses(), DB.allBudgets(), DB.allRecurring(),
    ]);
    return { version: 1, exported: new Date().toISOString(), source: 'spese-tracker', expenses, budgets, recurring };
  }

  async function uploadBackup(folderId, filename, jsonString) {
    const boundary = '----spese' + Date.now();
    const metadata = { name: filename, parents: [folderId], mimeType: 'application/json' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonString}\r\n--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Upload ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // Mantiene solo i keepBackups file più recenti nella cartella.
  async function prune(folderId) {
    const keep = cfg.keepBackups || 3;
    const q = encodeURIComponent(`'${folderId}' in parents and name contains 'spese-backup-' and trashed=false`);
    const list = await api(`files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc`);
    const extra = (list.files || []).slice(keep);
    for (const f of extra) { try { await api(`files/${f.id}`, { method: 'DELETE' }); } catch (e) { /* ignora */ } }
  }

  // Esegue il backup completo. Ritorna { ok, filename } o { ok:false, reason }.
  async function backupNow(interactive) {
    if (!isConfigured()) return { ok: false, reason: 'not-configured' };
    const got = await ensureToken(interactive);
    if (!got) return { ok: false, reason: 'no-auth' };
    const folderId = await getFolderId();
    const dump = await buildDump();
    const now = new Date();
    const filename = `spese-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.json`;
    await uploadBackup(folderId, filename, JSON.stringify(dump, null, 2));
    await prune(folderId);
    await DB.setMeta('lastBackupAt', now.toISOString());
    await DB.setMeta('driveGranted', true);
    return { ok: true, filename };
  }

  async function connect() {
    const ok = await ensureToken(true);
    if (ok) await DB.setMeta('driveGranted', true);
    return ok;
  }

  async function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) { /* ignora */ }
    }
    accessToken = null; tokenExpiry = 0;
    await DB.setMeta('driveGranted', false);
  }

  const isGranted = () => DB.getMeta('driveGranted').then(v => !!v);

  // Backup automatico "all'apertura": una volta per mese di calendario.
  async function maybeAutoBackup() {
    if (!isConfigured()) return;
    const enabled = await DB.getMeta('autoBackup');
    if (enabled === false) return; // default: attivo
    const granted = await isGranted();
    if (!granted) return; // mai collegato: niente popup a sorpresa all'avvio
    const last = await DB.getMeta('lastBackupAt');
    const now = new Date();
    if (last) {
      const d = new Date(last);
      const sameMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (sameMonth) return; // già fatto questo mese
    }
    try {
      const r = await backupNow(false); // silenzioso
      if (r.ok && typeof toast === 'function') toast('Backup mensile su Drive completato');
      else if (!r.ok && r.reason === 'no-auth' && typeof toast === 'function') toast('Backup mensile: apri Altro per confermare');
    } catch (e) { /* rete o quota: riprova al prossimo avvio */ }
  }

  return { isConfigured, isGranted, connect, disconnect, backupNow, maybeAutoBackup };
})();
