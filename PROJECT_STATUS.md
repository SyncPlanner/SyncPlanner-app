# SYNC.PLANNER — Statut du projet

Dernière mise à jour : 8 septembre 2026

Ce fichier sert de point de repère pour reprendre le développement sans dépendre de tout l'historique de conversation. À relire en priorité au démarrage d'une nouvelle session de travail sur le projet.

## Vue d'ensemble

SYNC.PLANNER est une app desktop Electron (single-file `SyncPlanner.html`, mirroré vers `src/index.html`) pour un compositeur (J) qui gère albums/tracks/deadlines/éditeurs, avec analytics de revenus SACEM et suivi du temps passé sur Logic Pro. L'app est en lancement public : site web, facturation Stripe, distribution via GitHub Releases.

## Emplacements clés

- Fichier source principal : `~/Desktop/SyncPlanner-App/SyncPlanner.html` (mirroré vers `src/index.html` — toujours garder les deux identiques, vérifier avec `md5sum`)
- App installée (Electron, `asar: false`) : `/Applications/SYNC.PLANNER.app/Contents/Resources/app/src/index.html` — un patch HTML/JS/CSS direct de ce fichier prend effet au relancement de l'app, sans rebuild. Seul un changement d'Info.plist ou de permission native nécessite `npm run build:mac`.
- Site web : `~/Desktop/syncplanner-website/index.html` → repo GitHub `syncplanner-website`, servi par le projet Vercel `website` sur `syncplanner.app`
- Backend API : `~/Desktop/syncplanner-api/api/index.js` → projet Vercel `backend`, servi sur `syncplanner-backend.vercel.app` (c'est le domaine utilisé par l'app, cf. constante `LICENCE_API` dans `src/index.html`)
- Repos GitHub (org `SyncPlanner`) : `SyncPlanner-app` (app Electron, **public**) et `syncplanner-website` (site)

## Pipeline de déploiement standard (patch de code, sans rebuild)

1. Extraire le plus long bloc `<script>` (regex Python), `node --check` pour valider la syntaxe
2. `cp SyncPlanner.html src/index.html`
3. `md5sum` les deux pour confirmer qu'ils sont identiques
4. Envoyer le fichier à l'utilisateur
5. Committer sur le device vers les 3 emplacements : `~/Desktop/SyncPlanner-App/SyncPlanner.html`, `~/Desktop/SyncPlanner-App/src/index.html`, `/Applications/SYNC.PLANNER.app/Contents/Resources/app/src/index.html`

## Pipeline de release complète (nouvelle version distribuée)

1. Bump version dans `package.json`
2. `git add -A && git commit && git push` (repo `SyncPlanner-App`)
3. `npm run build:mac` → génère les DMG x64 + arm64 dans `dist/`
4. Créer une Release GitHub manuellement avec les deux DMG
5. Mettre à jour le lien de téléchargement sur le site (normalement automatique désormais, voir plus bas)

## Pièges techniques à connaître

- **TDZ JavaScript** : un `const` top-level référencé par une fonction appelée AVANT sa ligne de déclaration lève une `ReferenceError`, et si cette erreur n'est pas catchée au niveau top-level du `<script>`, **elle interrompt l'exécution de tout le reste du script** — y compris des déclarations sans rapport plus loin. Toujours déclarer les dépendances avant leur premier point d'appel, idéalement tout en haut du bloc `<script>`.
- **Permissions macOS TCC pour app non signée** : Automation (`tell application "System Events"`) et Accessibility sont DEUX permissions séparées, toutes deux nécessaires pour que la détection Logic Pro fonctionne depuis l'app packagée (fonctionne nativement depuis un script `node` lancé au Terminal). Un rebuild avec signature ad-hoc peut invalider silencieusement les permissions déjà accordées. Fix : `tccutil reset AppleEvents com.syncplanner.app`, et décocher/recocher la case Accessibility dans Réglages Système.
- **`draggable=true` capture le clic-glisse** : tout champ texte à l'intérieur d'un élément `draggable=true` (carte album/Kanban) voit son clic-glisse de sélection de texte détourné par le drag natif, sauf si on ajoute `-webkit-user-drag:none` sur `input,textarea`. Déjà corrigé globalement.
- **Règle des traductions** : toujours ajouter une entrée FR **et** EN pour chaque nouvelle chaîne — ne jamais compter sur `t('clé')||'fallback'` car `t()` retourne toujours une valeur truthy.
- **Stripe** : les boutons de pricing du site utilisent des liens statiques "Payment Link" (`buy.stripe.com/...`), PAS le endpoint dynamique `/create-checkout`. Si le mode test réapparaît sur le site, vérifier ces liens en premier, pas les variables d'environnement Vercel.

## État actuel des fonctionnalités

- **App** : v1.1.1, distribuée via GitHub Releases (repo public), Logic Pro sync fonctionnel (permissions macOS documentées ci-dessus)
- **Site + paiement** : Stripe en mode live, 3 plans (Mensuel, Annuel, Lifetime) avec liens Payment Link corrects, lien de téléchargement Mac auto-résolu vers la dernière release GitHub (script JS en fin de `index.html` du site)
- **Licences testeurs** : ajoutées manuellement via une clé Redis Upstash (`licence:<email>`) dans le dashboard Vercel du projet `backend` — pas encore d'endpoint admin dédié (proposé mais pas construit)
- **Signature Developer ID / notarization** : décidé d'attendre les retours des testeurs avant de payer les 99$/an Apple — à ne pas relancer sans que l'utilisateur en parle
- **Mac App Store officiel** : écarté — la sandbox App Store rejetterait probablement l'usage d'Apple Events pour piloter Logic Pro, et Guideline 3.1.1 imposerait l'In-App Purchase d'Apple à la place de Stripe

## Dernière fonctionnalité livrée (8 septembre 2026)

Amélioration du champ "Genre" d'album (jusque-là collecté mais jamais affiché ni exploité) :
- Nouvelle carte "Rentabilité par genre" dans l'onglet Rentabilité de la page SACEM (clone du modèle "Rentabilité par éditeur" — un genre = une valeur par album, donc échantillon fiable, contrairement au mood qui est multi-tag par track)
- Genre affiché directement sur la tuile album (pastille dorée après le titre)
- Genre désormais éditable après création (pas seulement à la création) via un champ dans la carte dépliée
- Autocomplétion des genres déjà utilisés (`<datalist>`) sur les deux champs de saisie
- Le système de Mood (recherche + comparaison de tendances IA) est conservé tel quel — jugé utile indépendamment des stats de rentabilité
- Suite à un retour : agrandi l'affichage du % de collaborateurs sur les tracks (police trop petite, décimales illisibles)

## Tâches en attente / différées

- Section troubleshooting Logic Pro dans `INSTALLATION.md` — différé par l'utilisateur ("on verra plus tard")
- Nettoyage des emojis dans l'affichage des contacts de l'accordéon éditeurs
- Perf du rebuild complet du Kanban (à creuser un jour)
- Fonctionnalité de veille BMG / Cezame Musique — bloquée sur un accès navigateur, en pause
- Endpoint admin `/admin/create-licence` pour créer des licences testeurs sans passer par Redis manuellement — proposé, jamais demandé
