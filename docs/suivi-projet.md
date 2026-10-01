# Task’in — suivi du projet

Dernière mise à jour : 1er octobre 2026.

## Où en est le code

| Élément | Où | Base de données |
|---|---|---|
| Contrôles de formulaire harmonisés (extension v1.10.6) | **main** (en ligne) | — |
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
| Heatmaps 7h–23h (composant commun) + bouton « Objectifs par pôle » | **main** | — |
| Pilotage 360° : équipe → agents → fiche agent, KPI personnalisables | **main** | — |

Branche de travail : `claude/happy-tesla-dgja39`, mise sur `main` le 1er octobre (tout est en ligne).

## Plan d’action en cours (validé le 1er octobre)

Chaque ligne est cochée dès qu’elle est terminée, testée et poussée.

| # | Chantier | Statut |
|---|---|---|
| G1 | Vues enregistrées du Pilotage 360° (filtres + KPI sous un nom) | ✅ fait (migration 017) |
| G2 | Notes de coaching : sur la grille d’écoute (visible par l’agent) et sur le reporting / fiche 360° (préparation du 1:1) | ✅ fait (migration 018) |
| G3 | Connexions : choix des dates à la main (comparaison au planning après le module Planning, post-prod) | ✅ fait (+ écart au shift, export CSV) |
| G4 | Exports : stats à cocher, période, agents (multi-sélection) → Google Sheet + Google Slides. Superviseur : en bas de Reporting ; admin : en bas de Supervision | ✅ fait (.xlsx 8 onglets + .pptx, modèles enregistrables) |
| G5 | Agent : saisie de ses stats OSC en fin de shift, heure de saisie signalée, capture avec l’heure visible et filtre OSC « Aujourd’hui » | ✅ fait (migration 019, rappel à la déconnexion) |
| G6 | Dispatch client dans le pop-up de l’extension (pas dans le reste de l’extension) | ✅ fait (extension v1.11.0, à réinstaller) |
| G7 | Bilan avant déploiement ; s’il ne reste rien : injection des données fictives pour la vidéo | ✅ bilan fait : il reste des points (ci-dessous), données fictives pas encore injectées |

### Reste avant le déploiement (bilan G7)

| # | Point | Qui |
|---|---|---|
| R1 | Tickets de retour agents : type, références, lien vers l’outil client, description guidée, capture, détection des doublons, fiche soignée côté superviseur | ✅ fait (migration 021) |
| R2 | Panneau « Supervision » encore visible pour un agent après une déconnexion admin / superviseur dans le même onglet | ✅ corrigé (tous les écrans d’encadrement, contenu vidé) |
| R3 | Statut « attente flux » hors shift et courbe d’évolution (reste du sprint « revue globale ») | ✅ fait |
| R4 | Mettre `main` à jour avec G1 → G6 | ✅ fait (main = 2baab9a) |
| R5 | Supabase : activer la protection contre les mots de passe divulgués (Authentication › Policies) ; Vercel : `SUPABASE_URL` sans `/rest/v1`, `GEMINI_API_KEY`, `TASKIN_ALLOWED_ORIGIN` | toi |
| R6 | Agents : réinstaller l’extension v1.11.0 (dispatch dans le pop-up) | toi / agents |
| R7 | Test réel : une déclaration agent, une reprise superviseur, une grille partagée, un export | toi |

Tous les points « code » (R1 → R3) sont faits ; restent les points R5 → R7 de ton côté.

Ensuite seulement : injection des données fictives (5 FO, 3 BO, 3 Reconf) pour la vidéo, puis nettoyage avant ouverture aux agents.

### Lot S (demandé après R1 → R3)

| # | Point | Statut |
|---|---|---|
| S1 | Agent : pas d’onglet « Cette semaine » ; « Mes résultats » sans les chiffres OSC des autres | ✅ fait (migration 022) |
| S2 | Extension : retirer « Cas complexe » (même système que « Remonter un ticket ») | ✅ fait (dans l’extension 1.12.0) |
| S3 | Heatmap : vert très pâle (faible) → rouge intense (fort) | ✅ fait |
| S4 | Graphique « Performance opérationnelle » : in SLA / out SLA au survol (admin, superviseur, agent) | à faire |
| S5 | Classement agents : KPI au choix et tri | à faire |
| S6 | Admin › Paramètres › Comptes : changer le pôle FO / BO / Reconf | à faire |
| S7 | Extension : synchro plus rapide, avis de mise à jour, installation simplifiée | à faire |
| S8 | Visuel métier et organisation des onglets superviseur | à faire |
| S9 | Push sur `main` puis injection des données fictives | à faire |

Après la mise en production : module Planning (puis présence vs planning), Reconf, documentation management.

## Où trouver chaque fonction

- **Admin** : Statistiques → sélecteur en haut « Pilotage 360° | Analyse | Résultats OSC | Appels manqués ».
  Dans Résultats OSC : « Saisie OSC | Objectifs & tendance | Semaine ».
- **Superviseur** : onglets « Pilotage 360° » (vues enregistrées, fiche 360° + notes 1:1), « Résultats » (déclarations
  des agents à reprendre), « Appels manqués », « Cas complexes », « Grille d’écoute » (retour partagé avec l’agent),
  « Coaching 1:1 » (notes à aborder), « Reporting » (préparation des 1:1, **Exports tout en bas**), « Connexions » (dates au choix).
- **Admin** : Supervision → **Exports tout en bas** ; Connexions : dates au choix, écart au shift, export CSV.
- **Agent** : barre « Mon dispatch client » (+ « Signaler une difficulté ») sur l’accueil et dans le pop-up de
  l’extension ; onglet « Mes résultats » : objectif du jour, **déclaration des chiffres OSC de fin de shift**,
  **Mes écoutes** ; onglet « Appels manqués ».

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

- Tous les tests ont été faits dans un navigateur avec des données simulées (9 séries, toutes au vert) ;
  le comportement avec les vrais comptes reste à confirmer en production.
