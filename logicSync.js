/**
 * logicSync.js — Détection automatique du projet Logic Pro ouvert
 * et lecture de ses métadonnées (BPM, tonalité, mesure) sans aucune
 * action du compositeur.
 *
 * À utiliser dans le process principal Electron (accès Node complet).
 * Mac uniquement (repose sur AppleScript + plutil, tous deux natifs macOS).
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Nom du process Logic Pro à cibler. Sur les versions récentes (>=10.7),
// le process peut s'appeler "Logic Pro" au lieu de "Logic Pro X" —
// on essaie les deux, dans cet ordre.
const LOGIC_PROCESS_NAMES = ['Logic Pro X', 'Logic Pro'];

/**
 * Interroge System Events pour récupérer le titre de la fenêtre
 * et le chemin du document (.logicx) ouvert dans Logic Pro.
 * Retourne null si Logic n'est pas lancé ou n'a pas de projet ouvert.
 */
async function getOpenLogicWindow() {
  for (const processName of LOGIC_PROCESS_NAMES) {
    const script = `
      tell application "System Events"
        if not (exists process "${processName}") then return "NO_PROCESS"
        tell process "${processName}"
          if (count of windows) is 0 then return "NO_WINDOW"
          set winTitle to name of window 1
          try
            set docPath to value of attribute "AXDocument" of window 1
            if docPath is missing value then set docPath to "NO_DOCUMENT"
          on error
            set docPath to "NO_DOCUMENT"
          end try
          return winTitle & "|||" & docPath
        end tell
      end tell
    `;
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script]);
      const result = stdout.trim();
      if (result === 'NO_PROCESS') continue; // essaie le nom de process suivant
      if (result === 'NO_WINDOW') return null;

      const [windowTitle, docPathRaw] = result.split('|||');
      let projectPath = null;
      // Garde-fou supplémentaire : si jamais "missing value" (le vide
      // AppleScript) passe à travers malgré le filtre côté script, on ne
      // veut jamais l'utiliser comme nom/chemin de projet.
      if (docPathRaw && docPathRaw !== 'NO_DOCUMENT' && docPathRaw !== 'missing value') {
        // docPathRaw ressemble à: file:///Users/.../Sans%20Nom%206.logicx/
        try {
          projectPath = decodeURIComponent(docPathRaw.replace(/^file:\/\//, ''));
          if (projectPath.endsWith('/')) projectPath = projectPath.slice(0, -1);
        } catch (e) {
          projectPath = null;
        }
      }

      return { windowTitle, projectPath };
    } catch (e) {
      continue; // process absent ou erreur AppleScript, on essaie le nom suivant
    }
  }
  return null;
}

/**
 * Trouve le MetaData.plist le plus pertinent dans le bundle .logicx.
 * Un projet peut avoir plusieurs "Alternatives" (000, 001, ...) —
 * on prend celle dont MetaData.plist a été modifié le plus récemment.
 */
function findLatestMetaDataPlist(logicxPath) {
  const alternativesDir = path.join(logicxPath, 'Alternatives');
  if (!fs.existsSync(alternativesDir)) return null;

  const candidates = fs.readdirSync(alternativesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(alternativesDir, d.name, 'MetaData.plist'))
    .filter(p => fs.existsSync(p))
    .map(p => ({ path: p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return candidates.length > 0 ? candidates[0].path : null;
}

/**
 * Convertit un plist (binaire ou XML) en objet JS via plutil (natif macOS).
 */
async function readPlistAsJson(plistPath) {
  const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', plistPath]);
  return JSON.parse(stdout);
}

/**
 * Formate la tonalité Logic (SongKey + SongGenderKey) en libellé lisible.
 * ex: SongKey="C", SongGenderKey="major" → "C major"
 * TODO: à valider avec un projet contenant des dièses/bémols (F#, Bb...)
 * pour confirmer le format exact retourné par Logic dans ce cas.
 */
function formatKey(songKey, songGenderKey) {
  if (!songKey) return null;
  const mode = songGenderKey === 'minor' ? 'min' : 'maj';
  return `${songKey}${mode}`;
}

/**
 * Lit les métadonnées d'un projet .logicx à partir de son chemin, sans se
 * soucier de savoir si Logic l'a actuellement ouvert. Utilisé pour ré-lier
 * une track dont le fichier a été déplacé/renommé (le compositeur pointe
 * vers le nouvel emplacement via un sélecteur de fichier natif).
 * Retourne null si le chemin n'existe pas / n'est pas un .logicx valide.
 */
async function getProjectMetadataForPath(logicxPath) {
  if (!logicxPath || !fs.existsSync(logicxPath)) return null;

  const projectName = path.basename(logicxPath, '.logicx');
  const metaDataPath = findLatestMetaDataPlist(logicxPath);
  if (!metaDataPath) {
    return { projectName, projectPath: logicxPath, bpm: null, key: null, timeSignature: null, sampleRate: null };
  }

  const meta = await readPlistAsJson(metaDataPath);
  return {
    projectName,
    projectPath: logicxPath,
    bpm: meta.BeatsPerMinute ?? null,
    key: formatKey(meta.SongKey, meta.SongGenderKey),
    timeSignature: (meta.SongSignatureNumerator && meta.SongSignatureDenominator)
      ? `${meta.SongSignatureNumerator}/${meta.SongSignatureDenominator}`
      : null,
    sampleRate: meta.SampleRate ?? null,
    trackCount: meta.NumberOfTracks ?? null,
  };
}

/**
 * Fonction principale : détecte le projet Logic ouvert et retourne
 * ses métadonnées prêtes à injecter dans une track SyncPlanner.
 * Retourne null si Logic n'est pas ouvert / pas de projet actif.
 */
async function getActiveLogicProjectMetadata() {
  const win = await getOpenLogicWindow();
  if (!win || !win.projectPath) return null;

  const meta = await getProjectMetadataForPath(win.projectPath);
  if (!meta) {
    return {
      projectName: path.basename(win.projectPath, '.logicx'),
      windowTitle: win.windowTitle,
      projectPath: win.projectPath,
      bpm: null, key: null, timeSignature: null, sampleRate: null,
    };
  }
  return Object.assign({ windowTitle: win.windowTitle }, meta);
}

module.exports = {
  getOpenLogicWindow,
  findLatestMetaDataPlist,
  readPlistAsJson,
  getActiveLogicProjectMetadata,
  getProjectMetadataForPath,
};

// Permet de tester directement en ligne de commande :
//   node logicSync.js
// (avec Logic Pro ouvert sur un projet, sans rien faire d'autre)
if (require.main === module) {
  getActiveLogicProjectMetadata()
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Erreur:', err.message);
      process.exit(1);
    });
}
