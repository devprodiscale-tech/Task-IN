# Audit initial de migration Task’in vers Supabase

Date de l’audit : 1 septembre 2026.

## Périmètre observé

L’application web actuelle est une application HTML/CSS/JavaScript vanilla. Elle utilise Firebase Authentication via l’API REST Identity Toolkit et Firestore via l’API REST Firestore. Deux fonctions serveur Vercel utilisent `firebase-admin` pour les opérations privilégiées sur les comptes.

L’extension Chrome est en Manifest V3. Elle utilise directement Firebase Authentication et Firestore dans `popup.js` et `documentation.js`. Elle utilise également `chrome.storage.local` pour l’état local de session, le timer actif, le panneau intégré et le bouton flottant.

## Configuration actuelle

- Projet Firebase : `trackingcallro`
- Authentification cliente : `https://identitytoolkit.googleapis.com/v1`
- Firestore REST : `https://firestore.googleapis.com/v1/projects/trackingcallro/databases/(default)/documents`
- Authentification web : jeton Firebase conservé côté navigateur sous `onspot_idToken` et identifiant sous `onspot_uid`
- Extension : permissions `storage`, `tabs`, `scripting`; accès hôte global, Ringover, Firestore et Identity Toolkit
- Version de l’extension auditée : `1.9.3`

## Collections et domaines fonctionnels repérés

| Domaine | Collection ou ressource repérée | Utilisation |
|---|---|---|
| Identité | `accounts` | Profil, nom, e-mail, couleur, initiales, rôle, photo |
| Activité | `time_entries` | Entrées de temps, source, description, agent, heure, durée |
| Temps réel | `active_timers` | Timer actif par utilisateur et supervision en direct |
| Référentiel | `settings/treatments` | Types de traitement configurables |
| Documentation | `procedures` | Procédures accessibles dans l’application et l’extension |
| Supervision | `complexCases` | Cas complexes et escalades |
| Pilotage | `goals` et ressources KPI associées | Objectifs, indicateurs et vues de pilotage |
| Formation | Modules de formation, quiz et compétences à confirmer dans l’inventaire complet | Parcours pédagogiques et validation |
| Fichiers | URLs ou champs de fichiers à inventorier précisément | Documents et pièces jointes |

La liste Formation, fichiers et ressources KPI doit être confirmée par un inventaire détaillé des écritures et lectures de chaque module avant de créer le schéma SQL définitif.

## Opérations critiques

Le timer actif est écrit dans Firestore et dans `localStorage`. À l’arrêt, une entrée est créée dans `time_entries`, le timer actif est supprimé et les vues de supervision sont rafraîchies. La supervision relit les timers actifs toutes les 15 secondes côté application.

L’extension lit et écrit au minimum les comptes, les timers actifs, les entrées de temps, les traitements et les procédures. Elle partage donc les mêmes données métier que l’application web et doit être migrée après la définition des tables et des règles d’accès.

Les opérations d’administration actuelles utilisent une fonction serveur avec `firebase-admin`. Elle vérifie le jeton Firebase, relit le rôle dans `accounts`, puis autorise le changement de mot de passe ou la suppression d’un autre compte. Ce flux devra devenir une fonction serveur Supabase protégée, sans exposer de clé privilégiée au navigateur ou à l’extension.

## Risques identifiés

1. Les appels REST Firebase sont dispersés dans plusieurs modules et dans l’extension ; une couche d’accès aux données devra être introduite avant le remplacement complet.
2. Les rôles sont stockés dans `accounts` et contrôlés côté interface. Les règles RLS Supabase devront devenir la protection réelle côté base.
3. Le timer actif existe à la fois dans le stockage local et dans Firestore ; il faudra définir la source de vérité et le comportement en cas de conflit entre fenêtres.
4. La clé Firebase cliente est présente dans le code, ce qui est courant pour Firebase mais impose de ne jamais reproduire cette exposition avec une clé Supabase service-role.
5. Les fonctions d’archivage ne doivent être créées qu’après stabilisation du schéma et des relations, afin que les exports soient restaurables.

## Recommandation pour la prochaine tranche

Créer le projet Supabase et un schéma initial de lecture seule ou de test, sans basculer les utilisateurs. Préparer une couche d’accès abstraite capable de sélectionner Firebase ou Supabase par configuration. Commencer par les tables `profiles/accounts`, `time_entries`, `active_timers`, `procedures` et `complex_cases`, puis ajouter les domaines Formation, KPI et fichiers après inventaire confirmé.

## État de sécurité

Aucune modification de production n’a été effectuée pendant cet audit. Le dépôt existant et l’extension restent sur leur fonctionnement Firebase actuel.
