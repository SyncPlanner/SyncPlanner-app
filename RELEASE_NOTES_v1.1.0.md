# SYNC.PLANNER v1.1.0

## Nouveautés

- **Historique des relances** : chaque envoi d'email de relance (album ou track) est désormais compté et affiché ("Relance 1", "Relance 2"...) avec la date exacte.
- **Filtre par année** dans Projets/Albums (basé sur la deadline).
- **Masquer les albums sans revenu** dans Rentabilité par album (case à cocher, activée par défaut) — les albums encore en production n'encombrent plus la vue.
- **Raccourci Cmd+S** pour forcer une sauvegarde immédiate.

## Corrections

- **Sauvegarde à la fermeture** : l'appli force désormais une écriture immédiate juste avant la fermeture de la fenêtre, pour ne plus jamais perdre les toutes dernières modifications.
- **Historique Cmd+Z** : les synchronisations automatiques Logic Pro (tick 30s, rafraîchissement BPM/clé) ne polluent plus l'historique d'annulation — seules les vraies actions de l'utilisateur y figurent.
- **Alerte de relance** : suppression du double compteur "en retard" (album vs track) qui pouvait afficher deux chiffres contradictoires pour le même album — seules les tracks individuelles déclenchent désormais une alerte, ce qui est plus précis. Le bouton d'envoi groupé "Relance album" reste disponible.

## Autres

- Ajout de la stat "Shows différents" (nombre de diffusions distinctes) dans la Vue d'ensemble SACEM.
- Optimisation de la recherche globale (debounce) pour rester fluide avec un catalogue volumineux.
