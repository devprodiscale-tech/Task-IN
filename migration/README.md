# Préparation Supabase de Task’in

Ce dossier contient la préparation hors production de la migration Firebase vers Supabase.

## Fichiers

- `taskin-migration-audit.md` : inventaire initial de l’application, de l’extension et des risques.
- `001_taskin_initial_schema.sql` : schéma PostgreSQL cible, index, fonctions, déclencheurs et politiques RLS.

## État actuel

Aucun projet Supabase n’est encore connecté et aucune donnée Firebase n’a été modifiée. Le SQL est une base de travail réutilisable ; il devra être exécuté d’abord dans un projet Supabase de test.

## Exécution prévue

1. Créer un projet Supabase de test.
2. Ouvrir l’éditeur SQL Supabase ou utiliser les migrations Supabase CLI.
3. Exécuter `001_taskin_initial_schema.sql`.
4. Créer un utilisateur de test dans Supabase Auth.
5. Vérifier la création automatique de son profil.
6. Attribuer le rôle de test depuis un environnement administrateur sécurisé.
7. Tester les politiques RLS avec un compte Agent, Superviseur et Admin.
8. Seulement après validation, préparer le script d’import Firebase.

## Règles de sécurité importantes

La clé `service_role` Supabase ne doit jamais être placée dans `index.html`, dans l’extension Chrome, dans GitHub ou dans le navigateur. Elle devra rester côté serveur et être stockée comme variable secrète de déploiement.

Le client web et l’extension utiliseront uniquement la clé publique `anon` et les sessions Supabase Auth. Les opérations administratives et les archives devront passer par des fonctions serveur protégées.

## Choix de compatibilité

Les champs souples propres aux documents Firebase sont conservés dans des colonnes `jsonb` lorsqu’ils ne sont pas encore suffisamment stabilisés. Les domaines critiques — profils, entrées de temps, timers actifs, rôles et archives — utilisent des colonnes typées et des contraintes relationnelles.

La migration applicative devra introduire une couche d’accès aux données afin de pouvoir comparer Firebase et Supabase pendant la période de transition. Firebase reste la source de production jusqu’à la validation de cette comparaison.
