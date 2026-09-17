# Task’in — Project Status, Backlog & Roadmap

> **Document opérationnel de référence du nouveau dépôt.**
>
> Dernière mise à jour : **17 septembre 2026**

---

## 1. Statut actuel

### Situation

Le projet est en phase de reprise technique après une migration partielle de Firebase vers Supabase.

La décision actuelle est claire : **Firebase doit être abandonné**. Supabase devient la cible unique pour l’authentification et les données métier.

Le nouveau dépôt sert à repartir sur une base propre et contrôlable, puis à terminer la migration sans recopier les incohérences du projet historique.

### Blocage immédiat

Le problème connu est que les nouveaux comptes créés dans **Supabase Auth** ne sont pas encore correctement reconnus par Task’in.

Le premier parcours à stabiliser est :

```text
Création utilisateur Supabase
        ↓
auth.users
        ↓
profiles
        ↓
role
        ↓
session Task’in
        ↓
permissions
        ↓
accès aux données métier
```

### État de travail

| Domaine | État | Priorité |
|---|---|---:|
| Nouveau repository | À finaliser | P0 |
| Supabase Auth | Partiellement intégré | P0 |
| `auth.users` → `profiles` | À valider | P0 |
| RLS | À valider | P0 |
| Suppression Firebase | En cours | P0 |
| Couche data provider | Présente / à consolider | P0 |
| Timers | Migration partielle à vérifier | P0 |
| Dashboard/KPI | Migration fonctionnelle à vérifier | P0 |
| Documentation | À resynchroniser | P1 |
| Permissions centralisées | À finaliser | P0 |
| Missed Calls | Fonction prévue / intégration à vérifier | P0 |
| Extension Chrome | Migration à finaliser | P0 |
| Pilote OnSpot Travel | À préparer | P0 |

---

## 2. Règle d’architecture cible : Supabase only

### Interdit à terme

```text
Firebase Authentication
Firestore REST
firebase-admin
anciens tokens Firebase
anciennes collections Firebase
```

### Cible

```text
Browser
   ↓
Supabase Auth
   ↓
JWT / session
   ↓
PostgreSQL + RLS
   ↓
Supabase REST / API serveur
   ↓
Task’in
```

### Exceptions

Une référence Firebase peut temporairement rester dans le repository uniquement pour :

- migration ;
- analyse historique ;
- mapping de données ;
- documentation de transition.

Elle ne doit plus participer au fonctionnement nominal de l’application.

---

## 3. Plan immédiat de migration

### Phase S0 — Auth Supabase

- [ ] Créer un utilisateur de test dans Supabase Auth.
- [ ] Vérifier sa présence dans `auth.users`.
- [ ] Vérifier la présence du profil dans `public.profiles`.
- [ ] Vérifier que `profiles.id = auth.users.id`.
- [ ] Vérifier le rôle du profil.
- [ ] Vérifier le trigger de création automatique du profil, s’il est retenu.
- [ ] Vérifier les policies RLS de `profiles`.
- [ ] Vérifier que le frontend récupère bien le profil avec le JWT Supabase.
- [ ] Tester connexion → profil → dashboard.

### Phase S1 — Couche data

- [ ] Identifier chaque module qui appelle encore Firebase.
- [ ] Remplacer les lectures par le provider Supabase.
- [ ] Remplacer les écritures par le provider Supabase.
- [ ] Remplacer les suppressions/modifications par le provider Supabase.
- [ ] Faire passer les opérations privilégiées par les endpoints serveur.
- [ ] Tester les erreurs RLS et les erreurs réseau.

### Phase S2 — Suppression du legacy

- [ ] Supprimer les accès Firebase inutiles du frontend.
- [ ] Supprimer `firebase-admin` si plus aucun endpoint ne l’utilise.
- [ ] Supprimer les constantes Firebase inutiles.
- [ ] Retirer les anciens chemins REST.
- [ ] Migrer l’extension Chrome.
- [ ] Mettre à jour les documents historiques devenus obsolètes.

### Phase S3 — Validation

- [ ] Tests avec compte Agent.
- [ ] Tests avec compte Superviseur.
- [ ] Tests avec compte Formateur.
- [ ] Tests avec compte Admin.
- [ ] Tests de séparation des données.
- [ ] Tests de déconnexion.
- [ ] Tests de refresh/session.
- [ ] Tests des opérations administratives.
- [ ] Tests des erreurs RLS.

---

## 4. Permissions fonctionnelles

### Principe

Une seule arborescence fonctionnelle. Chaque fonctionnalité porte :

```js
{
  roles: [...],
  scope: 'équipe' | 'soi'
}
```

Ajouter un rôle ou modifier un accès doit être un changement de configuration, pas une duplication de code.

### Matrice

| Fonction | Admin | Superviseur | Formateur | Agent | Scope |
|---|---:|---:|---:|---:|---|
| Dashboard | ✅ | — | — | — | équipe |
| Workflow-KPI jour J | ✅ | ✅ | — | ✅ | équipe / soi |
| Logs traitement | ✅ | ✅ jour J | — | ❌ | selon rôle |
| KPI live | ✅ | ✅ | — | — | équipe |
| Classement | ✅ | ✅ | — | ❌ | équipe |
| SLA | ✅ | ✅ | — | — | équipe |
| Missed calls | ✅ | ✅ | ❌ | ✅ | agrégé / soi |
| Stat | ✅ | ✅ | — | ✅ | équipe / soi |
| Quality | ✅ | ✅ | ✅ | ✅ restreint | soi pour agent |
| Formation | ✅ | ✅ | ✅ | ✅ | équipe / soi |
| Settings | ✅ | ❌ | ❌ | ❌ | admin |
| Team’s shift | ✅ | ✅ | — | ✅ | équipe / soi |
| Switch compte | ✅ | ❌ | ❌ | ❌ | admin |
| Extension missed call | ✅ | ✅ | — | ✅ | création / agrégé |

### Éléments supprimés

- [ ] « Cette semaine »
- [ ] « Formation > Évolutions »
- [ ] « Équipe » pour Agent
- [ ] Sync Ringover automatique tant qu’elle n’est pas validée

---

## 5. Backlog prioritaire

### P0 — bloquant pour la base du pilote

| ID | Sujet | État | Prochaine action |
|---|---|---|---|
| MIG-01 | Supabase Auth | 🔴 Bloqué | Valider `auth.users` → `profiles` |
| MIG-02 | RLS Supabase | 🔴 À faire | Tester chaque rôle |
| MIG-03 | Suppression Firebase | 🟠 En cours | Inventorier et remplacer les appels restants |
| FIN-01 | Missed Calls | 🟠 Partiel | Finaliser intégration + tests |
| FIN-02 | Navigation uniforme | 🔴 À faire | Centraliser les permissions |
| FIN-03 | Stats unifiées | 🔴 À faire | Réunir KPI, filtres et graphs |
| FIN-04 | Formation | 🟠 Partiel | Finaliser le parcours et les rôles |
| FIN-06 | Sécurité backend | 🔴 À faire | Vérifier endpoints, secrets et rôles |
| FIN-07 | Timers/données | 🟠 Partiel | Tester refresh, doublons et incohérences |
| FIN-08 | KPI vérifiables | 🔴 À faire | Documenter formules et sources |
| FIN-09 | Recette par rôle | 🔴 À faire | Préparer les scénarios Agent/Sup/Formateur/Admin |
| FIN-12 | Graphiques | 🔴 À faire | Comparer données sources et affichage |
| DATA-04 | Sauvegarde | 🔴 À faire | Définir puis tester une restauration |
| SEC-01 | Séparer dev/preview/prod | 🟠 Partiel | Mettre en place le cloisonnement |
| SEC-02 | Secrets | 🟠 Partiel | Vérifier toutes les variables serveur |

### P1 — important après stabilisation du P0

- Quality entièrement défini.
- Classement validé.
- Heatmap finalisée.
- Export Google Workspace.
- Qualité des données.
- Alertes et monitoring.
- Animation de connexion.
- Extension Chrome : procédures et flux supplémentaires.

### P2/P3 — après le pilote

- Dashboards configurables.
- Certification interne.
- Recommandations de formation par KPI.
- Cas complexes depuis l’extension.
- Compatibilité étendue de l’extension.
- Mise à jour contrôlée de l’extension.
- Paramétrage multi-projets.
- Comparaisons multi-projets / multi-équipes.
- Synchronisation Crisp.
- Connecteurs Notion / HubSpot.
- Évolutions ERP IScale.

---

## 6. Catalogue fonctionnel condensé

### Accès / identité

| ID | Fonction | Statut historique |
|---|---|---|
| ACC-01 | Connexion | Existante / à valider en Supabase |
| ACC-02 | Déconnexion/session | Existante |
| ACC-03 | Rôles | Existante / migration en cours |
| ACC-04 | Contrôles backend | Partielle |
| ACC-05 | Permissions fines | À étudier / à structurer |
| ACC-06 | SSO IScale | À étudier |

### Production

| ID | Fonction | Statut historique |
|---|---|---|
| PROD-01 | Timer | Existante / migration à vérifier |
| PROD-02 | Entrées de temps | Existante / migration à vérifier |
| PROD-03 | Appels entrants/sortants | Existante |
| PROD-04 | Crisp/tickets/manuel | Existante |
| PROD-05 | Heure d’arrivée | Partielle |
| PROD-06 | Modifier/supprimer entrée | Existante |
| PROD-07 | Timers actifs | Existante |
| PROD-08 | Timers incohérents | Partielle |
| PROD-09 | Sync Ringover | Annoncée, non prioritaire tant que non validée |
| PROD-10 | Corrections historisées | À étudier |
| PROD-11 | Projet/équipe | À étudier |

### Missed Calls

| ID | Fonction | Statut |
|---|---|---|
| CALL-01 | Déclarer un appel | Partielle |
| CALL-02 | Historique et suivi | Partielle |
| CALL-03 | Reporting qualité | Partielle |
| CALL-04 | Formules qualité | Partielle |

### KPI

| ID | Fonction | Statut |
|---|---|---|
| KPI-01 | Dashboard quotidien | Existante |
| KPI-02 | Filtres | Existante |
| KPI-03 | DMT | Existante |
| KPI-04 | FRT | Existante |
| KPI-05 | SLA | Existante |
| KPI-06 | Objectifs | Existante |
| KPI-07 | Classement | Existante |
| KPI-08 | Heatmap | Partielle |
| KPI-09 | Occupation | Partielle |
| KPI-10 | Dashboard configurable | Annoncée |
| KPI-11 | Multi-projets | À étudier |
| KPI-12 | Alertes | À étudier |

### Documentation

| ID | Fonction | Statut |
|---|---|---|
| DOC-01 à DOC-09 | Recherche, lecture, édition, blocs, versions, import texte/Markdown, PDF textuel | Existantes |
| DOC-10 | PDF/image + IA | Partielle |
| DOC-11 | Notion/HubSpot | Annoncée |
| DOC-12 | Workflow publication complet | À étudier |
| DOC-13 | Propriété des contenus | À étudier |

### Formation

| ID | Fonction | Statut |
|---|---|---|
| FORM-01 à FORM-05 | Modules, quiz, progression, compétences, accusés | Existantes |
| FORM-06 | Génération par IA | Partielle |
| FORM-07 | Parcours 3 jours | Partielle |
| FORM-08 | Certification | Annoncée |
| FORM-09 | Recommandation par KPI | Annoncée |
| FORM-10 | Catalogue multi-projets | À étudier |

### Quality / Supervision

| ID | Fonction | Statut |
|---|---|---|
| SUP-01 | Cas complexes | Existante |
| SUP-02 | Grille d’écoute | Existante |
| SUP-03 | Coaching | Existante |
| SUP-04 | Retour à l’agent | Partielle |
| SUP-05 | Templates coaching | Partielle |
| SUP-06 | Evaluation automatique | Annoncée |
| SUP-07 | Audio en base | À étudier |
| SUP-08 | Lien Dropbox | Partielle |
| SUP-09 | Reporting configurable | Annoncée |
| SUP-10 | Plans d’amélioration | À étudier |

### Administration

| ID | Fonction | Statut |
|---|---|---|
| ADM-01 | Comptes | Existante / à migrer complètement |
| ADM-02 | Endpoint admin | Existante / à convertir Supabase |
| ADM-03 | Types de traitement | Existante |
| ADM-04 | Objectifs | Existante |
| ADM-05 | Seuils DMT | Existante |
| ADM-06 | Permissions | Partielle |
| ADM-07 | Secrets | Partielle |
| ADM-08 | Audit admin | Annoncée |
| ADM-09 | Multi-projets | À étudier |
| ADM-10 | Import/export référentiels | À étudier |

### Extension Chrome

| ID | Fonction | Statut |
|---|---|---|
| EXT-01 | Téléchargement | Existante |
| EXT-02 | Popup/panneau | Existante |
| EXT-03 | Timer depuis extension | Partielle |
| EXT-04 | Procédure depuis extension | Partielle |
| EXT-05 | Cas complexe | Annoncée |
| EXT-06 | Compatibilité IScale | À étudier |
| EXT-07 | Mise à jour contrôlée | À étudier |

### Données / continuité

| ID | Fonction | Statut |
|---|---|---|
| DATA-01 | Données structurées | Existante historique / migration Supabase à finaliser |
| DATA-02 | Export Sheets/Drive | Partielle |
| DATA-03 | Export rapports | Partielle |
| DATA-04 | Sauvegarde indépendante | Annoncée |
| DATA-05 | Fichiers externes | Partielle |
| DATA-06 | Ringover | Annoncée |
| DATA-07 | Crisp | À étudier |
| DATA-08 | Notion/HubSpot | À étudier |
| DATA-09 | Odoo | À étudier |
| DATA-10 | Détection anomalies | À étudier |

---

## 7. Architecture et fichiers critiques

### Frontend

```text
index.html
css/*
js/00-core-init.js
js/00-supabase-config.js
js/00-data-provider.js
js/01-core-auth-network.js
js/02-time-data.js
js/03-dashboard-render.js
js/04-admin.js
js/05-training.js
js/06-ui-modals.js
js/07-analytics.js
js/08-analytics-advanced.js
js/09-documentation.js
js/10-supervision.js
js/99-init.js
```

### Backend

```text
api/
├── admin-manage-supabase-account.js
└── ai-structure.js
```

### Migration

```text
migration/
├── 001_taskin_initial_schema.sql
├── 002_time_entries_staging.sql
├── 003_migration_registry.sql
├── 004_seed_migration_accounts.sql
├── README.md
├── accounts-entries-mapping.md
├── analyze_export.py
├── export-analysis.md
├── match_accounts_entries.py
└── taskin-migration-audit.md
```

---

## 8. Données historiques et migration

Le dossier migration documente notamment un mapping historique de comptes Firebase et d’entrées de temps.

Points à conserver comme contraintes de migration :

- certains identifiants historiques sont des UID Firebase ;
- certains autres sont des identifiants métier hétérogènes ;
- les données historiques doivent être rattachées à de vrais utilisateurs Supabase avant de devenir des données métier normales ;
- les données ambiguës doivent rester en staging/quarantaine ;
- aucune migration destructive ne doit être faite sans validation et sauvegarde.

### Règle d’or

```text
SOURCE
Firebase historique
        ↓
STAGING
Données nettoyées / contrôlées
        ↓
VALIDATION
Comptes + rôles + dates + relations
        ↓
DESTINATION
Supabase PostgreSQL
```

---

## 9. Sécurité et continuité

### P0

- [ ] Séparer développement, preview et production.
- [ ] Ne jamais exposer la clé `service_role`.
- [ ] Vérifier toutes les variables serveur.
- [ ] Tester les RLS avec tous les rôles.
- [ ] Sécuriser les endpoints admin.
- [ ] Journaliser les opérations sensibles.
- [ ] Définir une sauvegarde indépendante.
- [ ] Tester une restauration réelle.
- [ ] Définir une politique de conservation et suppression.

### P1

- [ ] Monitoring technique.
- [ ] Alertes.
- [ ] Mesure des erreurs réseau.
- [ ] Contrôle des doublons.

---

## 10. Roadmap de pilotage

| Phase | Période | Sortie attendue |
|---|---|---|
| R0 | Fin août 2026 | Cadrage et documentation initiale |
| R1 | Avant octobre 2026 | Task’in cohérent et testable pour OnSpot Travel |
| R2 | Octobre 2026 | Pilote faible affluence |
| R3 | Novembre 2026 | Stabilisation |
| R4 | Décembre 2026 | Test de robustesse |
| R5 | Janvier 2027 | Bilan |
| R6 | Après R5 | Architecture ERP IScale |
| R7 | Après R6 | Extensions fonctionnelles |

---

## 11. Checklist avant pilote

- [ ] Auth Supabase opérationnelle.
- [ ] Profil Supabase créé et reconnu.
- [ ] RLS validée.
- [ ] Les quatre rôles sont testés.
- [ ] Aucun accès Firebase nécessaire au parcours nominal.
- [ ] Timer fiable après refresh.
- [ ] KPI vérifiés avec données représentatives.
- [ ] Documentation accessible selon rôle.
- [ ] Formation fonctionnelle.
- [ ] Quality fonctionnelle selon rôle.
- [ ] Missed Calls fonctionnel.
- [ ] Extension testée sur les parcours autorisés.
- [ ] Sauvegarde minimale documentée.
- [ ] Export testé.
- [ ] Vercel Preview validé.
- [ ] Scénarios de recette associés aux P0.
- [ ] Documentation resynchronisée.

---

## 12. Pilote d’octobre

Pendant le pilote, chaque retour doit être enregistré avec :

```text
Date
Rôle
Parcours
Problème
Catégorie
Niveau de blocage
Étapes pour reproduire
Capture éventuelle
Correction
Version / commit
```

Catégories minimales :

- bug ;
- ergonomie ;
- donnée ;
- procédure ;
- formation ;
- intégration ;
- nouveau besoin.

Mesures à observer :

- temps de saisie ;
- taux d’utilisation ;
- corrections manuelles ;
- cohérence des KPI ;
- contournements ;
- erreurs ;
- satisfaction et compréhension du parcours.

---

## 13. Test de décembre

Le test de décembre ajoute un volume supérieur au test d’octobre.

- [ ] définir un scénario de charge ;
- [ ] mesurer les temps de réponse ;
- [ ] mesurer les erreurs ;
- [ ] rechercher doublons et pertes ;
- [ ] tester dashboards et exports ;
- [ ] vérifier les limites de stockage ;
- [ ] tester une restauration ;
- [ ] documenter les limites ;
- [ ] préparer le bilan de janvier.

---

## 14. Décisions

### Décisions validées héritées

| ID | Décision |
|---|---|
| DEC-001 | GitHub sert de source de vérité technique et documentaire. |
| DEC-002 | `main` reste stable ; une branche de travail est utilisée pour les évolutions. |
| DEC-003 | Task’in / OnSpot Travel est prioritaire avant la réplication ERP. |
| DEC-004 | Markdown versionné dans Git pour la mémoire opérationnelle. |

### Décisions à reprendre dans le nouveau contexte

| ID | Question |
|---|---|
| DEC-005 | Odoo : complément, coexistence ou remplacement ? |
| DEC-006 | Évolution progressive de Task’in ou nouvelle web app après le pilote ? |
| DEC-007 | Stratégie de stockage et sauvegarde finale ? |
| DEC-008 | Intégrations à prioriser : Ringover, Crisp, Notion, Dropbox, Google Workspace, HubSpot, Odoo ? |
| DEC-009 | Politique de mise à jour documentaire ? |
| MIG-001 | Date de fin opérationnelle de Firebase ? |
| MIG-002 | Stratégie exacte de migration des comptes historiques ? |
| MIG-003 | Politique de compatibilité pendant la transition ? |

---

## 15. Risques

| ID | Risque | Impact | Mitigation |
|---|---|---|---|
| RSK-001 | Données manuelles incomplètes | KPI peu fiables | Documenter les sources et corrections |
| RSK-002 | Permissions insuffisantes | Accès indu | Tester RLS + backend + rôles |
| RSK-003 | Sauvegarde non démontrée | Perte de données | Backup + restauration testée |
| RSK-004 | Capacité/coûts | Dégradation ou coût inattendu | Mesurer volume et quotas |
| RSK-005 | Intégrations externes | Double saisie | Évaluer chaque API |
| RSK-006 | Faible adoption | Contournement | Simplifier + observer les usages |
| RSK-007 | ERP trop large | Retards | Valider Task’in avant extension |
| RSK-008 | Documents et code divergents | Mauvaises décisions | Mise à jour documentaire à chaque changement réel |
| RSK-009 | Mauvaise conservation des données sensibles | Risque de conformité | Politique de conservation |
| RSK-010 | Dépendance fournisseur | Migration difficile | Exports et plan de sortie |
| MIG-001 | Migration Firebase/Supabase incomplète | Application instable | Supabase-only par étapes contrôlées |
| MIG-002 | Profils Supabase mal créés | Comptes impossibles à utiliser | Tester `auth.users` / `profiles` / RLS |
| MIG-003 | Legacy Firebase caché dans les modules | Régression | Inventaire module par module |

---

## 16. Règles de documentation

### Une évolution doit mettre à jour

| Événement | Document |
|---|---|
| Action, commit, test | `PROJECT_STATUS.md` / journal |
| Fonction ajoutée/retirée | `PROJECT_STATUS.md` |
| Vision ou objectif changé | `PROJECT_STATUS.md` |
| Décision d’architecture | `PROJECT_STATUS.md` |
| Nouveau risque | `PROJECT_STATUS.md` |
| Installation ou contribution | `README.md` |

### Règle

Les informations ne doivent pas être dupliquées inutilement dans plusieurs documents. Le dépôt doit progressivement converger vers :

```text
README.md
    ↓
présentation + installation + règles de contribution

PROJECT_STATUS.md
    ↓
statut + backlog + features + permissions + roadmap + risques

Code / migrations / issues
    ↓
détails techniques d’exécution
```

---

## 17. Critère global de sortie

Le pilote ne doit pas être considéré comme prêt tant que :

- chaque P0 n’a pas de propriétaire ;
- chaque P0 n’a pas de scénario de test ;
- les rôles ne sont pas validés ;
- les données critiques ne sont pas conservées correctement ;
- les KPI principaux ne sont pas vérifiables ;
- les permissions ne sont pas testées côté interface et côté backend/base ;
- les opérations sensibles ne sont pas sécurisées ;
- le chemin nominal ne dépend plus de Firebase ;
- les sauvegardes/restaurations minimales ne sont pas documentées.

---

## 18. Prochaines étapes de travail

### Étape actuelle

**Réparer et valider Supabase Auth + `profiles` + RLS.**

### Ensuite

1. Finir la couche data Supabase.
2. Migrer module par module.
3. Éliminer Firebase du chemin nominal.
4. Centraliser les permissions.
5. Tester les quatre rôles.
6. Finaliser P0.
7. Preview Vercel.
8. Recette réelle.
9. Pilote OnSpot Travel.
10. Stabilisation puis décision ERP IScale.

---

## 19. Historique de fusion documentaire

Ce document consolide les informations des documents historiques suivants :

- `PROJECT_CHARTER.md`
- `FEATURE_CATALOG.md`
- `ROADMAP_DECISIONS_RISKS.md`
- `permissions-matrix-taskin.md`
- `plan-action-sprints-septembre.md`
- `INTEGRATION_MISSED_CALLS_HTML.md`
- README historique

Les documents historiques doivent être conservés tant qu’ils servent à retrouver les décisions précédentes, mais leur contenu doit être considéré comme potentiellement obsolète dès qu’il contredit l’architecture Supabase cible ou le code réellement présent.
