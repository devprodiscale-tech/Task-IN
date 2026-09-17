Task’in

Task’in est un outil interne de pilotage opérationnel conçu initialement pour OnSpot Travel. Il centralise le suivi de production, le temps d’activité, les procédures, la formation, la supervision, les indicateurs et certains outils d’administration.

Le projet doit ensuite pouvoir servir de premier module d’une future plateforme interne modulaire pour IScale.

Statut au 17 septembre 2026 : le projet est en reprise technique dans un nouveau dépôt afin de terminer la migration Firebase → Supabase. L’objectif est désormais une architecture 100 % Supabase pour l’authentification et les données métier. Firebase est considéré comme une dépendance legacy à retirer, pas comme une cible.

1. Où en sommes-nous ?

État actuel

Prototype fonctionnel Task’in existant.

Architecture frontend HTML/CSS/JavaScript vanilla conservée.

Fonctions serverless sous api/.

Préparation d’une couche d’accès aux données Supabase.

Schéma SQL et scripts de migration Supabase préparés.

Connexion Supabase totalement validée avec les nouveaux comptes.

Mapping fiable auth.users → profiles.

Validation complète des RLS.

Suppression de toutes les dépendances Firebase restantes.

Validation fonctionnelle de tous les parcours après migration.

Refonte finale des permissions autour d’un objet PERMISSIONS central.

Stabilisation avant le pilote OnSpot Travel.

Blocage actuel connu

Le nouveau dépôt doit corriger le problème rencontré pendant la migration : les nouveaux comptes créés dans Supabase Auth ne sont pas encore correctement reconnus par l’application Task’in.

La priorité est donc de valider le flux suivant avant de modifier massivement les modules :

Supabase Auth
    ↓
auth.users.id
    ↓
public.profiles.id
    ↓
profil + rôle
    ↓
session Task’in
    ↓
permissions
    ↓
données métier

Une fois ce flux stabilisé, la migration des modules peut continuer sur une base cohérente.

2. Architecture cible

Cible fonctionnelle

                    TASK’IN
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Production      Knowledge      Supervision
   & Timers        & Formation     & Quality
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                 Shared Services
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Auth/Rôles    Permissions   Audit/Logs
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Supabase
            Auth + PostgreSQL + RLS
                       │
                       ▼
                    Vercel
             Frontend + Serverless API

Principes

Supabase est la cible unique.

Firebase ne doit plus être utilisé en production.

Les clés privilégiées restent exclusivement côté serveur.

Les permissions d’interface doivent être renforcées par les règles de sécurité côté base/API.

Les données doivent être traçables : automatique, manuel, importé ou corrigé.

Les modules doivent rester séparés par responsabilité.

Une fonctionnalité n’est considérée comme prête que lorsqu’elle est compréhensible, testable, documentée et vérifiée.

Le nouveau dépôt sert à repartir sur une base technique propre sans recopier aveuglément les choix legacy.

3. Fonctionnalités principales

Production & temps

Timers : démarrage, arrêt, reprise, état persistant.

Entrées de temps par type et source.

Appels entrants/sortants.

Activités Crisp, tickets et saisies manuelles.

Timers actifs et supervision.

Détection de timers incohérents.

Correction de données avec traçabilité à terme.

Dashboard & KPI

Dashboard d’activité quotidienne.

Filtres par période, agent et source.

DMT.

FRT.

SLA.

Objectifs.

Classement.

Heatmap.

Taux d’occupation.

Graphiques et analyses avancées.

Documentation & connaissance métier

Liste et recherche de procédures.

Catégories et filtres.

Procédures structurées.

Versions et résumé des changements.

Import texte/Markdown.

Extraction de PDF textuels.

Lecture assistée par IA des documents complexes.

Workflow futur brouillon → validation → publication → archivage.

Formation

Modules de formation.

Quiz.

Progression.

Compétences.

Mises à jour et accusés de lecture.

Génération assistée de parcours.

Parcours d’intégration.

Certification interne à terme.

Recommandations selon les KPI à terme.

Supervision & Quality

Cas complexes.

Grilles d’écoute.

Scores qualité.

Coaching individuel.

Retour du coaching à l’agent.

Modèles de coaching.

Évaluation automatique des appels à terme.

Lien vers des enregistrements externes.

Plans d’amélioration.

Appels manqués

Module indépendant des timers et des time_entries :

déclaration d’un appel manqué ;

historique personnel agent ;

dashboard agrégé superviseur/admin ;

filtres jour/semaine/mois/année ;

analyse par cause, shift et agent ;

rappel prévu/réel ;

mesure du taux de rappel ;

mesure des rappels en moins de 5 minutes.

Administration

Gestion des comptes.

Gestion des rôles.

Types de traitement.

Objectifs.

Seuils DMT.

Permissions.

Journal d’audit à finaliser.

Extension Chrome

Téléchargement depuis le portail.

Popup/panneau.

Déclaration rapide d’activité.

Accès aux procédures.

Extension des fonctionnalités de supervision à terme.

Intégrations envisagées

Ringover.

Crisp.

Dropbox.

Google Workspace.

Notion.

HubSpot.

Odoo.

Les intégrations externes ne doivent pas devenir bloquantes lorsqu’un mode manuel temporairement acceptable existe.

4. Rôles et permissions

Le modèle fonctionnel retenu repose sur une seule arborescence et deux attributs déclaratifs par nœud :

roles : qui voit la fonctionnalité ;

scope : équipe ou soi.

Ajouter ou retirer un accès doit se faire par configuration plutôt que par duplication de vues.

Fonction

Admin

Superviseur

Formateur

Agent

Dashboard complet

✅

—

—

—

Workflow-KPI jour J

✅

✅

—

✅

Classement

✅

✅

—

❌

Stat

✅

✅

—

✅

Quality

✅

✅

✅

✅ restreint

Formation

✅

✅

✅

✅

Settings

✅

❌

❌

❌

Team’s shift

✅ équipe

✅ équipe

—

✅ soi

Missed calls

✅ agrégé

✅ agrégé

❌

✅ saisie + historique

Switch de compte

✅

❌

❌

❌

Éléments validés à retirer :

« Cette semaine » ;

« Formation > Évolutions » ;

accès « Équipe » pour Agent ;

synchronisation Ringover automatique tant qu’elle n’est pas réellement validée.

5. Migration Firebase → Supabase

Objectif

AVANT
Firebase Auth + Firestore + firebase-admin

                ↓ migration

CIBLE
Supabase Auth + PostgreSQL + RLS + API serveur

Ce qui doit disparaître

Firebase Authentication.

Firestore REST.

firebase-admin.

anciennes variables et constantes Firebase.

anciens tokens/session Firebase.

accès Firebase directs depuis l’extension.

logique métier dépendante des anciennes collections Firebase.

Ce qui doit rester

données métier utiles à migrer ;

mapping des comptes historiques ;

logique métier validée ;

historique utile ;

fichiers et contenus nécessaires au pilote.

Règle importante

Ne pas supprimer le legacy Firebase simplement parce qu’une recherche textuelle le trouve. Chaque référence doit être classée :

encore utilisée ;

migration partielle ;

legacy inutile ;

documentation obsolète.

6. Structure du dépôt

Task-IN/
├── api/
├── assets/
├── css/
├── docs/
│   ├── PROJECT_STATUS.md
│   └── autres documents utiles
├── downloads/
├── js/
├── migration/
├── index.html
├── package.json
├── package-lock.json
├── presentation.html
└── README.md

La structure exacte doit évoluer avec le code réel. Le README ne doit pas annoncer un fichier qui n’existe pas.

7. Développement dans Codespaces

Le projet est prévu pour être travaillé en ligne dans GitHub Codespaces.

Cycle de travail

Besoin / issue
   ↓
Compréhension
   ↓
Décision ou hypothèse documentée
   ↓
Branche de travail
   ↓
Modification limitée
   ↓
Test
   ↓
Commit
   ↓
Push GitHub
   ↓
Preview Vercel si nécessaire
   ↓
Revue
   ↓
Documentation
   ↓
Fusion éventuelle

Règles de collaboration

Expliquer l’objectif avant une modification non triviale.

Un fichier doit avoir une responsabilité claire.

Éviter les gros changements en une seule fois.

Toujours préciser le contexte d’exécution d’une commande.

Après chaque modification significative : test puis constat.

Une erreur est documentée et comprise avant correction.

Ne pas mélanger plusieurs chantiers sans nécessité.

Vérifications minimales

npm install
node --check js/00-data-provider.js
node --check js/01-core-auth-network.js
git diff --check
git status

Les modules supplémentaires doivent être testés lorsqu’ils sont modifiés.

8. Sécurité

Ne jamais committer :

.env et secrets ;

clé service_role Supabase ;

mots de passe ;

tokens privés ;

artefacts temporaires inutiles ;

node_modules/.

La clé publique utilisée par le navigateur doit rester distinguée des secrets serveur. Toutes les opérations privilégiées passent par le backend sécurisé.

9. Documents de référence

Le document principal pour l’état du projet est :

docs/PROJECT_STATUS.md

Il regroupe :

état actuel ;

migration Supabase ;

backlog ;

features ;

permissions ;

roadmap ;

risques ;

décisions ;

critères de sortie ;

protocole de travail.

Les anciens documents peuvent être conservés comme historique pendant la transition, mais PROJECT_STATUS.md est le document opérationnel de référence pour le nouveau dépôt.

10. Roadmap globale

Phase

Période

Objectif

Reprise technique

Septembre 2026

Stabiliser Supabase et repartir sur une base propre

Finalisation

Avant octobre 2026

Version cohérente et testable pour OnSpot Travel

Pilote

Octobre 2026

Tester en conditions réelles à faible affluence

Stabilisation

Novembre 2026

Corriger bugs et clarifier les procédures

Test de robustesse

Décembre 2026

Observer limites, volume, erreurs et restauration

Bilan

Janvier 2027

Décider de la trajectoire ERP IScale

Extension ERP

Après validation

Étudier HR, Planning, Congés, Ticketing et Échange interne

11. Vision à long terme

Task’in est conçu comme un premier module d’une éventuelle plateforme interne IScale partageant des fondations communes :

identité ;

utilisateurs ;

rôles ;

permissions ;

notifications ;

fichiers ;

audit ;

reporting ;

administration.

Les futurs domaines envisagés sont :

HR ;

Planning ;

Congés ;

Ticketing ;

Échange interne.

Cette extension reste conditionnée par les résultats du pilote et par une décision d’architecture ultérieure.

12. Sources historiques fusionnées

Ce README consolide le cadrage historique suivant :

PROJECT_CHARTER.md

FEATURE_CATALOG.md

ROADMAP_DECISIONS_RISKS.md

permissions-matrix-taskin.md

plan-action-sprints-septembre.md

INTEGRATION_MISSED_CALLS_HTML.md

README historique du projet

Certains de ces documents décrivent encore Firebase ou une branche d’architecture antérieure. Ils doivent être traités comme des références historiques tant que leur contenu n’a pas été resynchronisé avec la nouvelle architecture Supabase.