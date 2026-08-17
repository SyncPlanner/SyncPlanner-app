# 🎵 SYNC.PLANNER — Guide d'installation

Transforme le fichier HTML en vraie application bureau (.app Mac + .exe PC).

---

## ÉTAPE 1 — Installer Node.js (5 min)

1. Va sur **https://nodejs.org**
2. Clique sur le bouton vert **"LTS"** (version recommandée)
3. Télécharge et installe normalement (suivre les étapes, tout accepter)
4. Vérifie que c'est installé : ouvre le **Terminal** (Mac) ou **PowerShell** (Windows) et tape :
   ```
   node --version
   ```
   Tu dois voir quelque chose comme `v20.x.x` ✅

---

## ÉTAPE 2 — Préparer le dossier

1. Place ce dossier **SyncPlanner-App** où tu veux sur ton Mac/PC (ex: Bureau ou Documents)
2. Le dossier doit contenir :
   ```
   SyncPlanner-App/
   ├── main.js
   ├── package.json
   ├── src/
   │   └── index.html   ← ton application
   └── assets/
       ├── icon.icns    ← icône Mac (optionnel)
       └── icon.ico     ← icône Windows (optionnel)
   ```

> **Note icônes :** Si tu n'as pas d'icône, l'app fonctionnera quand même avec l'icône Electron par défaut. Tu peux en créer une sur https://icon.kitchen

---

## ÉTAPE 3 — Installer les dépendances

Ouvre le **Terminal** (Mac) ou **PowerShell** (Windows).

Navigue vers le dossier :
```bash
cd ~/Bureau/SyncPlanner-App
```
*(adapte le chemin selon où tu as mis le dossier)*

Installe les dépendances :
```bash
npm install
```
⏳ Attends 1-2 minutes le temps du téléchargement.

---

## ÉTAPE 4 — Tester l'app

Lance l'app pour voir si tout fonctionne :
```bash
npm start
```
✅ Une fenêtre SYNC.PLANNER doit s'ouvrir !

---

## ÉTAPE 5 — Compiler l'application

### Sur Mac → crée un fichier .dmg (installeur)
```bash
npm run build:mac
```

### Sur Windows → crée un fichier .exe (installeur)
```bash
npm run build:win
```

### Les deux en même temps (depuis Mac avec Wine ou CI)
```bash
npm run build:all
```

⏳ La compilation prend 3-5 minutes.

Le fichier final se trouve dans le dossier **`dist/`** :
- Mac : `dist/SYNC.PLANNER-1.0.0.dmg`
- Windows : `dist/SYNC.PLANNER Setup 1.0.0.exe`

---

## ÉTAPE 6 — Installer l'app

### Mac
1. Double-clique sur le `.dmg`
2. Fais glisser SYNC.PLANNER dans Applications
3. **Premier lancement :** Clic droit → Ouvrir (nécessaire une seule fois car l'app n'est pas signée Apple)

### Windows
1. Double-clique sur le `.exe`
2. Si Windows Defender bloque : clique "Informations complémentaires" → "Exécuter quand même"
3. Suis les étapes d'installation

---

## ❓ Problèmes courants

**"npm : command not found"** → Node.js n'est pas bien installé, recommence l'étape 1.

**Erreur pendant `npm install`** → Vérifie ta connexion internet.

**L'app ne s'ouvre pas (Mac)** → Va dans Préférences Système → Sécurité → Autoriser quand même.

**Icône manquante** → Normal si tu n'as pas mis de fichier `assets/icon.icns`. Crée un dossier `assets/` vide pour éviter les warnings.

---

## 📁 Mettre à jour l'app

Si tu reçois une nouvelle version du fichier `index.html` :
1. Remplace `src/index.html` par le nouveau fichier
2. Relance `npm run build:mac` ou `npm run build:win`
3. Réinstalle depuis le nouveau `.dmg` ou `.exe`

---

## 💾 Sauvegarde des données

Tes données sont sauvegardées dans le **localStorage** du navigateur intégré à Electron.
Elles persistent entre les lancements de l'app.

Pour sauvegarder / transférer tes données : utilise le bouton **💾 Sauvegarder** dans l'app (génère un fichier `.json`).
