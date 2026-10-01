# Task’in — suivi du projet

Dernière mise à jour : 1er octobre 2026 (fin de journée).

## Où en est le code

| Élément | Où | Base de données |
|---|---|---|
| Contrôles de formulaire harmonisés, extension v1.10.6 | **main** (en ligne) | — |
| A · Résultats OSC (saisie quotidienne, captures, import CSV) | **main** | migration 011 appliquée |
| B · Objectifs du jour (J-1 + progression) et « Mes résultats » agent | **main** | migration 012 appliquée |
| C · Dispatch déclaré par l’agent | **main** | migration 012 appliquée |
| D · Cas complexes : type de difficulté, synthèse, signalement agent, correctif des doublons | **main** | migration 013 appliquée |
| E · Reporting hebdomadaire (bilan, points d’attention, message équipe, CSV, impression) | **main** | — |
| F · Appels manqués (journal partagé, « Je rappelle », statistiques, message client, CSV) | **main** | migration 014 appliquée |
| Appels manqués : l’agent ne modifie que ses lignes (rappel d’un collègue via fonction serveur) | **main** | migration 015 appliquée |
| Objectifs fixes par pôle modifiables par le superviseur | **main** | — |
| Import de l’historique du Google Sheet (262 appels, juin–septembre) | **main** | migration 016 + données importées |
| Slides de reporting automatiques (.pptx / Google Slides) | **main** | — |

Branche de travail : `claude/happy-tesla-dgja39`, mise sur `main` le 1er octobre (tout est en ligne).

## Où trouver chaque fonction

- **Admin** : Statistiques → sélecteur en haut « Analyse | Résultats OSC | Appels manqués ».
  Dans Résultats OSC : « Saisie OSC | Objectifs & tendance | Semaine ».
- **Superviseur** : onglets « Résultats », « Appels manqués », « Cas complexes ».
- **Agent** : barre « Mon dispatch client » (+ « Signaler une difficulté ») sur l’accueil,
  onglets « Mes résultats » et « Appels manqués ».

## Règles métier retenues

- **Objectif du jour** = dernier résultat OSC de l’agent (7 jours max) + progression réglée par l’admin
  (+5 % par défaut). L’admin ou le superviseur peut l’ajuster et laisser une consigne visible par l’agent.
- **Sous la tendance** = l’agent baisse de plus de 10 points de plus que l’équipe (à périmètre constant).
- **Bilan hebdo** : évolution calculée sur la moyenne par jour saisi (une absence ne pénalise pas).
- **Crisp** : le ratio messages / conversation (< 2 signalé) repère les réponses bâclées.
- **Appels manqués** : objectifs client repris du Sheet : ≤ 3 manqués, ≥ 90 % rappelés, 0 appel perdu.
- **Dispatch** : la priorité reste les appels, même dispatché partout.

## Décisions prises le 1er octobre

- **Reconf** : traité en tout dernier, après la mise en production (pas de dispatch : un volume de
  prestations à reconfirmer, 60/jour en basse saison et 80/jour en haute saison selon Nicolas ; tâches :
  appel sortant, appel entrant, suivi email presta, suivi email hôtel, traitement ticket).
- Le superviseur peut modifier les objectifs fixes par pôle.
- Appels manqués : un agent ne modifie que ses propres lignes.
- Reporting : slides générées automatiquement, en complément des Google Sheets envoyés au management.
- Après le MVP : documentation des fonctionnalités pour le management, puis vidéo de démo
  (voir `docs/guide-video-demo.md`) avec données fictives supprimées avant le déploiement.

## À faire ensuite

1. Tester en réel les fonctions mises en ligne le 1er octobre (voir point 3).
2. Reconf : à la fin, après la mise en production (voir décisions).
3. Tester en réel : saisir deux jours de résultats OSC, un appel manqué, un signalement de difficulté.
4. Relier les lignes importées du Sheet aux comptes de Crystella, Gaëlle, Patrick, Yannis et Tina dès leur création (requête dans `migration/016_missed_calls_sheet_import.sql`).
5. Sprint suivant (revue globale) : heatmap 7h–23h par heure, filtres complets dans Stat et Reporting
   (période libre, pôle, agent, canal), courbe d’évolution, statut « attente flux » hors shift.
6. Avant la production : nettoyer les données de démonstration (`migration/demo_cleanup.sql`) ;
   côté Vercel, `SUPABASE_URL` sans `/rest/v1`, `GEMINI_API_KEY`, `TASKIN_ALLOWED_ORIGIN` ;
   côté Supabase, activer la protection contre les mots de passe divulgués.
7. Chantiers à part : rôle Formation ; démo élargie (5 agents FO, 3 BO, 3 Reconf), vidéo et document de présentation.

## Points en suspens

- Panneau « Supervision » encore visible pour un agent après une déconnexion admin / superviseur dans le
  même onglet : mis en pause à ta demande.
- Tous les tests ont été faits dans un navigateur avec des données simulées (9 séries, toutes au vert) ;
  le comportement avec les vrais comptes reste à confirmer en production.
