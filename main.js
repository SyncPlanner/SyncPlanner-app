const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const { getActiveLogicProjectMetadata, getOpenLogicWindow, getProjectMetadataForPath } = require('./logicSync');

// Intervalle de polling Logic Pro (ms) — 5s = bon compromis réactivité/charge
const LOGIC_POLL_INTERVAL = 5000;
let logicPollTimer = null;
let lastLogicSnapshot = null;

function startLogicPolling(win) {
  if (logicPollTimer) clearInterval(logicPollTimer);

  logicPollTimer = setInterval(async () => {
    try {
      const data = await getActiveLogicProjectMetadata();
      const snapshot = JSON.stringify(data);

      // On ne pousse au renderer que si quelque chose a changé
      // (évite de spammer l'UI toutes les 5s pour rien)
      if (snapshot !== lastLogicSnapshot) {
        lastLogicSnapshot = snapshot;
        if (!win.isDestroyed()) {
          win.webContents.send('logic-project-update', data);
        }
      }
    } catch (e) {
      // Logic pas ouvert / permission pas encore accordée / etc.
      // On ne fait rien — le prochain tick réessaiera.
    }
  }, LOGIC_POLL_INTERVAL);
}

// ── Suivi du temps de travail par track (avec pause auto sur inactivité) ──

// Seuil d'inactivité au-delà duquel on arrête de décompter du temps.
const IDLE_THRESHOLD_SECONDS = 600; // 10 minutes
// Fréquence de vérification / incrément du temps.
const TIME_TRACK_INTERVAL = 30000; // 30 secondes

let timeTrackTimer = null;

// Temps depuis la dernière activité clavier/souris SYSTÈME (pas juste Logic).
// Astuce standard macOS, ne nécessite aucune permission particulière.
function getIdleSeconds() {
  return new Promise((resolve) => {
    exec("ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'", (err, stdout) => {
      if (err) return resolve(0); // en cas d'erreur, on considère "actif" par défaut
      const val = parseFloat(String(stdout).trim());
      resolve(isNaN(val) ? 0 : val);
    });
  });
}

// Vérifie que Logic Pro est bien l'application au premier plan
// (sinon le temps ne doit pas compter, même si Logic tourne en fond).
function isLogicFrontmost() {
  const script = 'tell application "System Events" to name of first application process whose frontmost is true';
  return new Promise((resolve) => {
    exec("osascript -e '" + script + "'", (err, stdout) => {
      if (err) return resolve(false);
      const name = String(stdout).trim();
      resolve(name === 'Logic Pro X' || name === 'Logic Pro');
    });
  });
}

function startLogicTimeTracking(win) {
  if (timeTrackTimer) clearInterval(timeTrackTimer);

  timeTrackTimer = setInterval(async () => {
    try {
      const winInfo = await getOpenLogicWindow();
      if (!winInfo || !winInfo.projectPath) return; // Logic pas ouvert / pas de projet

      const idle = await getIdleSeconds();
      if (idle >= IDLE_THRESHOLD_SECONDS) return; // pause : inactivité système

      const frontmost = await isLogicFrontmost();
      if (!frontmost) return; // pause : Logic pas au premier plan

      if (!win.isDestroyed()) {
        win.webContents.send('logic-time-tick', {
          projectPath: winInfo.projectPath,
          seconds: TIME_TRACK_INTERVAL / 1000
        });
      }
    } catch (e) {
      // on ignore, le prochain tick réessaiera
    }
  }, TIME_TRACK_INTERVAL);
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 Mo — largement suffisant pour un logo

// Télécharge une image distante et la renvoie sous forme de data URI
// ({ok:true, dataUrl}) ou d'erreur lisible ({ok:false, error}). Suit les
// redirections (redirectsLeft) jusqu'à épuisement, refuse les contenus non-
// image et coupe au-delà de MAX_LOGO_BYTES pour éviter de tout charger en
// mémoire sur un lien pointant vers un fichier énorme.
function fetchImageAsDataUrl(url, redirectsLeft) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      resolve({ ok: false, error: 'url-invalide' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, error: 'protocole-non-supporte' });
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SyncPlanner/1.0',
        'Accept': 'image/*'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(fetchImageAsDataUrl(nextUrl, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve({ ok: false, error: 'http-' + res.statusCode });
        return;
      }
      const contentType = (res.headers['content-type'] || '').split(';')[0].trim();
      if (contentType && !contentType.startsWith('image/')) {
        res.resume();
        resolve({ ok: false, error: 'pas-une-image' });
        return;
      }
      const chunks = [];
      let total = 0;
      let aborted = false;
      res.on('data', (chunk) => {
        if (aborted) return;
        total += chunk.length;
        if (total > MAX_LOGO_BYTES) {
          aborted = true;
          req.destroy();
          resolve({ ok: false, error: 'image-trop-lourde' });
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (aborted) return;
        const buf = Buffer.concat(chunks);
        const mime = contentType || 'image/png';
        resolve({ ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
      });
      res.on('error', () => {
        if (!aborted) resolve({ ok: false, error: 'erreur-reseau' });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', () => resolve({ ok: false, error: 'erreur-reseau' }));
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'SYNC.PLANNER — Composer Manager',
    backgroundColor: '#0F0E1A',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    vibrancy: process.platform === 'darwin' ? 'dark' : undefined,
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if(url.startsWith('mailto:') && process.platform === 'darwin') {
      exec(`open -a Mail "${url.replace(/"/g,'\\"')}"`, (err) => {
        if(err) shell.openExternal(url);
      });
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // IPC mailto — pour les liens créés via JS dans l'app
  ipcMain.handle('open-mailto', async (event, url) => {
    if(process.platform === 'darwin') {
      exec(`open -a Mail "${url.replace(/"/g,'\\"')}"`, (err) => {
        if(err) shell.openExternal(url);
      });
    } else {
      shell.openExternal(url);
    }
  });

  // IPC pour ouvrir un dossier via dialog natif
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Sélectionner un dossier album'
    });
    if(result.canceled) return null;
    const albums = {};
    for(const folderPath of result.filePaths) {
      const albumName = path.basename(folderPath);
      albums[albumName] = [];
      try {
        const entries = fs.readdirSync(folderPath);
        entries.forEach(entry => {
          const entryPath = path.join(folderPath, entry);
          const stat = fs.statSync(entryPath);
          albums[albumName].push({ name: entry, isFolder: stat.isDirectory() });
        });
      } catch(e) {}
    }
    return albums;
  });

  // IPC — le renderer peut demander l'état Logic à la demande
  // (ex: bouton "Sync Logic" manuel, ou au chargement de la modal track)
  ipcMain.handle('get-logic-project', async () => {
    try {
      return await getActiveLogicProjectMetadata();
    } catch (e) {
      return null;
    }
  });

  // IPC — identifiant matériel stable du Mac (UUID plateforme), utilisé pour
  // limiter une licence à 2 appareils max. Ne change pas entre réinstalls
  // de l'app, seulement si le disque/la machine change.
  ipcMain.handle('get-device-id', async () => {
    return new Promise((resolve) => {
      exec('ioreg -rd1 -c IOPlatformExpertDevice', (err, stdout) => {
        if (err) return resolve(null);
        const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(String(stdout));
        resolve(match ? match[1] : null);
      });
    });
  });

  // IPC — nom lisible de la machine (celui réglé dans Réglages Système >
  // Général > Partage, ex. "MacBook Pro de Joeffrey"), pour identifier
  // clairement chaque appareil dans la liste "Appareils activés".
  // Fallback sur le hostname si scutil échoue (rare).
  ipcMain.handle('get-device-name', async () => {
    return new Promise((resolve) => {
      exec('scutil --get ComputerName', (err, stdout) => {
        const name = String(stdout || '').trim();
        if (!err && name) return resolve(name);
        resolve(require('os').hostname().replace(/\.local$/, ''));
      });
    });
  });

  // IPC — sélecteur natif pour ré-lier une track à son .logicx (renommé/déplacé)
  ipcMain.handle('pick-logicx-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Sélectionner le projet Logic Pro (.logicx)'
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // IPC — lit les métadonnées d'un .logicx à un chemin donné (pas forcément ouvert dans Logic)
  ipcMain.handle('get-logic-project-for-path', async (event, logicxPath) => {
    try {
      return await getProjectMetadataForPath(logicxPath);
    } catch (e) {
      return null;
    }
  });

  // IPC — télécharge une image distante (logo d'éditeur collé par URL) et la
  // renvoie en data URI. On passe par le process principal (Node) plutôt que
  // par une balise <img> côté renderer car beaucoup de sites bloquent le
  // hotlinking (référent vide/refusé) — une requête HTTP "normale" faite ici
  // n'a pas ce problème. Le logo est ensuite stocké embarqué (data URI),
  // donc plus jamais dépendant du lien distant restant valide.
  ipcMain.handle('fetch-image-as-data-url', async (event, url) => {
    return fetchImageAsDataUrl(url, 5);
  });

  // ── Import des relevés SACEM (CSV) ──

  // IPC — sélecteur natif de dossier contenant les exports SACEM (.csv),
  // permet d'importer plusieurs relevés d'un coup (Export 1, 2, 3...).
  ipcMain.handle('pick-sacem-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Sélectionner le dossier des relevés SACEM'
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = result.filePaths[0];
    try {
      const files = fs.readdirSync(folder)
        .filter(f => f.toLowerCase().endsWith('.csv'))
        .map(f => {
          const full = path.join(folder, f);
          const stat = fs.statSync(full);
          return { path: full, name: f, mtime: stat.mtimeMs };
        });
      return { folder, files };
    } catch (e) {
      return { folder, files: [] };
    }
  });

  // IPC — lit un CSV en détectant intelligemment l'encodage : les exports
  // SACEM depuis Excel/Windows sont très souvent en Windows-1252 et pas en
  // UTF-8, ce qui casse tous les accents si on lit brut en utf8. On tente
  // l'UTF-8 d'abord, et si le résultat contient trop de caractères de
  // remplacement (signe d'un mauvais décodage), on retente en windows-1252.
  ipcMain.handle('read-csv-smart', async (event, filePath) => {
    try {
      const buf = fs.readFileSync(filePath);
      // BOM UTF-8 explicite → on fait confiance, décodage UTF-8 direct
      if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(buf.slice(3));
      }
      const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      const replacementCount = (utf8Text.match(/�/g) || []).length;
      if (replacementCount > 0) {
        try {
          return new TextDecoder('windows-1252').decode(buf);
        } catch (e2) {
          return utf8Text;
        }
      }
      return utf8Text;
    } catch (e) {
      return null;
    }
  });

  startLogicPolling(win);
  startLogicTimeTracking(win);

  win.on('closed', () => {
    if (logicPollTimer) clearInterval(logicPollTimer);
    if (timeTrackTimer) clearInterval(timeTrackTimer);
  });

  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
