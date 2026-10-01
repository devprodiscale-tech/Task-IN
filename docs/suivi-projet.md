# Task’in — suivi du projet

Dernière mise à jour : 1er octobre 2026 (session du 30 septembre – 1er octobre).

## Où en est le code

| Élément | Où | Base de données |
|---|---|---|
| Contrôles de formulaire harmonisés, extension v1.10.6 | **main** (en ligne) | — |
| A · Résultats OSC (saisie quotidienne, captures, import CSV) | **main** | migration 011 appliquée |
| B · Objectifs du jour (J-1 + progression) et « Mes résultats » agent | **main** | migration 012 appliquée |
| C · Dispatch déclaré par l’agent | **main** | migration 012 appliquée |
| D · Cas complexes : type de difficulté, synthèse, signalement agent, correctif des doublons | branche, **pas poussé** | migration 013 appliquée |
| E · Reporting hebdomadaire (bilan, points d’attention, message équipe, CSV, impression) | branche, **pas poussé** | — |
| F · Appels manqués (journal partagé, « Je rappelle », statistiques, message client, CSV) | branche, **pas poussé** | migration 014 appliquée |

Branche de travail : `claude/happy-tesla-dgja39`. D, E et F sont 3 commits locaux, en avance sur GitHub.
GitHub refusait l’écriture depuis la session (erreur 403) : rien n’est perdu, il faut pousser dès que
l’accès GitHub est reconnecté, puis mettre sur `main` quand c’est validé.

Les migrations 013 et 014 sont déjà en base : elles ajoutent une règle d’accès et une table, sans rien
casser pour la version en ligne actuelle.

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

## À faire ensuite

1. Reconnecter GitHub, pousser la branche, puis « push » sur `main` après validation.
2. Donner la **liste des dispatchs Reconf** (liste provisoire : Ringover, Email, Pre-reconfirmation, Break coverage).
3. Tester en réel : saisir deux jours de résultats OSC, un appel manqué, un signalement de difficulté.
4. Option : importer l’historique du Google Sheet des appels manqués (juin → septembre) dans Task’in.
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
