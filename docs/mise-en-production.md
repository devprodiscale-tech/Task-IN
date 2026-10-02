# Task’in — check-list de mise en production

Dernière mise à jour : 2 octobre 2026 (Lot V). Adresse de production : https://task-in-rho.vercel.app/

Légende : ✅ fait dans le code · 🔧 réglage à faire par toi dans un tableau de bord · 🟡 décision à prendre.

## 1. Mot de passe oublié (indispensable avant d’ouvrir aux agents)

| | Réglage | Où |
|---|---|---|
| ✅ | Lien « Mot de passe oublié ? » sur l’accueil, formulaire « Nouveau mot de passe » au retour du lien, bouton « Lien de réinitialisation » par compte dans Admin › Paramètres › Comptes | code |
| 🔧 | **SMTP personnalisé** : le service d’e-mail intégré de Supabase n’envoie qu’aux adresses des membres de l’équipe Supabase, et seulement quelques e-mails par heure. Sans SMTP, les agents ne reçoivent pas le lien. Renseigner un expéditeur (ex. `no-reply@…`) avec Brevo, Resend, Google Workspace ou l’outil mail d’iScale. | Supabase › Authentication › Emails › SMTP Settings |
| 🔧 | **URL du site** : `https://task-in-rho.vercel.app` ; **Redirect URLs** : ajouter `https://task-in-rho.vercel.app/**` (sinon le lien renvoie vers localhost ou est refusé). | Supabase › Authentication › URL Configuration |
| 🔧 | **Modèle d’e-mail en français** (« Reset password ») : objet « Task’in · Réinitialiser ton mot de passe », texte court + bouton `{{ .ConfirmationURL }}`, mention « Lien valable 1 heure ». | Supabase › Authentication › Emails › Templates |
| 🔧 | Protection contre les mots de passe divulgués (signalée par l’audit Supabase, offre Pro). | Supabase › Authentication › Policies |

Comportement : le message après la demande est neutre (« Si un compte existe… ») pour ne pas révéler les adresses
existantes. Un lien expiré ou déjà utilisé rouvre directement le formulaire « Mot de passe oublié » avec un message.

## 2. Vercel

| | Réglage |
|---|---|
| ✅ | `vercel.json` : fichiers JS / CSS versionnés (`?v=`) mis en cache 1 an (une nouvelle version change le `?v=`), images 7 jours, API jamais en cache ; en-têtes de sécurité (nosniff, referrer, anti-intégration par un autre site, caméra / micro / géolocalisation coupés). |
| 🔧 | Variables : `SUPABASE_URL` (sans `/rest/v1`), `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (secours IA), `TASKIN_ALLOWED_ORIGIN=https://task-in-rho.vercel.app`. |
| 🟡 | Domaine personnalisé (ex. `taskin.iscale…`) : si tu en ajoutes un, l’ajouter aussi aux Redirect URLs Supabase et à `TASKIN_ALLOWED_ORIGIN`. |

## 3. Supabase

| | Point |
|---|---|
| ✅ | Audit sécurité : pas de table exposée sans règle d’accès ; les 2 tables IA sont fermées au navigateur (lecture serveur uniquement) ; les fonctions « SECURITY DEFINER » font leurs propres contrôles de rôle. |
| ✅ | Performance : règles d’accès optimisées (migration 023), agrégats serveur (024). Restent des remarques mineures (index sur des clés rarement filtrées) sans effet à notre volume. |
| 🟡 | **Supabase Pro (25 $/mois)** : sauvegardes quotidiennes, pas de mise en pause, stockage des captures (voir `docs/capacite-volumetrie.md`). |
| 🟡 | **Données de démonstration** : 12 comptes `@demo-taskin.invalid` + ancien jeu C4 encore en base. Suppression par `migration/demo/` sur ton feu vert uniquement. |

## 4. Agents et extension

| | Point |
|---|---|
| 🔧 | Installer l’extension 1.12.1 (installation guidée dans la web app). |
| 🔧 | Test réel : une connexion, un mot de passe oublié (avec le SMTP branché), une déclaration agent, une grille partagée, un export. |
| 🟡 | Paramètres › API IA : brancher une 1re API (sinon `GEMINI_API_KEY` reste utilisée). |

## 5. Latence (ce qui a été fait)

- Historique limité à 62 jours + chargement à la demande pour les dates plus anciennes ; pages lues en parallèle.
- Courbes longues lues sur des agrégats serveur.
- Lot V : cache navigateur longue durée des fichiers de l’app (2e ouverture : plus aucun aller-retour pour
  la quarantaine de fichiers JS / CSS) et connexion à Supabase ouverte dès le chargement de la page (preconnect).
