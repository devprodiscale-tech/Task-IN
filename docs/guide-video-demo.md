# Vidéo de présentation de Task’in — guide pas à pas

Objectif : une vidéo de **6 à 7 minutes** qui montre au management ce que Task’in apporte, avec des
données de démonstration réalistes, supprimées avant le déploiement auprès des agents.

## 1. Outils (gratuits, sous Windows)

| Besoin | Outil conseillé | Pourquoi |
|---|---|---|
| Enregistrer l’écran + la voix | **OBS Studio** (ou **Clipchamp**, déjà installé sur Windows 11) | Qualité 1080p, aucun filigrane |
| Montage | **Clipchamp** | Couper, zoomer, ajouter titres et musique en quelques clics |
| Micro | Casque-micro du poste | Plus net que le micro de l’ordinateur portable |
| Alternative rapide | Loom (version gratuite, 5 min max par vidéo) | Si une démo courte suffit |

Réglages OBS : 1920×1080, 30 i/s, format MP4. Une seule source « Capture de fenêtre » sur le navigateur.

## 2. Préparer la démo (la veille)

1. **Données de démonstration** (déjà injectées) : 12 comptes fictifs et 3 semaines d’activité,
   scripts dans `migration/demo/` :
   - `demo_v2_1_accounts.sql` : les comptes ;
   - `demo_v2_2_data.sql` : l’activité (traitements, connexions, chiffres OSC, objectifs, dispatch,
     appels manqués, tickets agents, écoutes partagées, fiches 1:1, notes de coaching). **À relancer le
     matin du tournage** (4 étapes, éditeur SQL Supabase) pour que « Aujourd’hui » soit rempli ;
   - `demo_v2_cleanup.sql` : efface tout (comptes + données), sans toucher aux vrais comptes.
2. **Comptes** (mot de passe commun `TaskinDemo#2026`), un par profil Chrome :
   | Rôle | E-mail | Pôle · shift |
   |---|---|---|
   | Superviseur | `sarah.sup@demo-taskin.invalid` | — |
   | Agent | `mialy.r@demo-taskin.invalid` (meilleure FO) | FO · 7 h – 16 h |
   | Agent | `toky.a@` · `fanja.h@` | FO · 7 h – 16 h |
   | Agent | `hasina.m@` (pas connectée aujourd’hui) · `lova.t@` | FO · 13 h – 22 h |
   | Agent | `nirina.s@` · `tiana.v@` · `rado.f@` | BO · 8 h – 17 h |
   | Agent | `voahirana.k@` · `sitraka.b@` · `ony.l@` | Reconf · 9 h – 18 h |

   L’admin reste votre compte habituel.
3. **Navigateur propre** : zoom à 100 %, onglets inutiles fermés, barre de favoris masquée
   (Ctrl+Maj+B), notifications Windows coupées (mode « Ne pas déranger »).
4. **Thème** : clair (plus lisible en vidéo).
5. **Répétition** : lire le script une fois à voix haute avec l’app ouverte, chronomètre en main.

## 3. Script (voix off + écran)

| # | Durée | À l’écran | Voix off |
|---|---|---|---|
| 1 | 0:00–0:20 | Page d’accueil Task’in | « Task’in est l’outil de pilotage de l’équipe Madagascar : il mesure l’activité réelle de chaque agent, fixe des objectifs quotidiens et prépare les rapports pour le client, en un seul endroit. » |
| 2 | 0:20–1:10 | **Agent FO** : timer, raccourcis canaux, barre « Mon dispatch client » | « Côté agent, chaque traitement est chronométré en un clic, depuis l’application ou l’extension Chrome. En début de shift, l’agent déclare son dispatch client — Wati, email, Ringover — pour que ses résultats soient lus dans le bon contexte. » |
| 3 | 1:10–1:50 | **Agent** : onglet « Mes résultats » (carte objectif + consigne) | « Chaque matin, l’agent voit son objectif du jour : son dernier résultat plus une progression, avec la consigne de son superviseur. Il voit aussi où en est l’équipe. » |
| 4 | 1:50–2:40 | **Agent** : onglet « Appels manqués » → « Je rappelle » → « Marquer rappelé » | « Les appels manqués sont saisis en temps réel dans un journal partagé. Avant de rappeler, l’agent réserve l’appel : ses collègues le voient, personne ne rappelle deux fois le même client. » |
| 5 | 2:40–3:00 | **Agent** : « Signaler une difficulté » | « En cas de blocage — process, fournisseur, collaboration ou escalade sans réponse — l’agent le signale directement à son superviseur et suit son traitement. » |
| 6 | 3:00–3:50 | **Superviseur** : Résultats › Saisie OSC (tableau, capture collée) | « Le superviseur recopie chaque soir les chiffres OSC, Ringover et Crisp, capture à l’appui, ou importe un export CSV. Les agents n’ont pas la main sur leurs propres chiffres. » |
| 7 | 3:50–4:40 | **Superviseur** : Objectifs & tendance (statuts, flux équipe, « Ajuster ») | « La cliente ne fixe pas d’objectif : Task’in calcule celui de chaque agent à partir de la veille, et compare au flux réel de l’équipe. Un agent qui décroche de la tendance est signalé ; le superviseur peut ajuster l’objectif et laisser une consigne. » |
| 8 | 4:40–5:20 | **Superviseur** : Cas complexes (synthèse par type, filtres) | « Les difficultés sont classées par type et par agent : on voit immédiatement où l’équipe bloque. » |
| 9 | 5:20–6:20 | **Admin** : Résultats › Semaine → « Générer les slides » → ouverture du PowerPoint ; Appels manqués › Statistiques | « En fin de semaine, le bilan est prêt : points d’attention, message à l’équipe, et en un clic un PowerPoint pour le management. Même chose pour les appels manqués : taux de rappel, causes, actions correctives et message client. » |
| 10 | 6:20–6:45 | Retour à la page d’accueil | « Task’in remplace les tableaux dispersés par un suivi fiable, quotidien et partagé. Prochaines étapes : déploiement auprès des agents puis le pôle Reconfirmation. » |

Conseil : enregistrer **scène par scène** (un fichier par ligne du tableau) plutôt que d’une traite ; c’est
beaucoup plus simple à reprendre en cas d’erreur.

## 4. Montage (Clipchamp)

1. Importer les clips dans l’ordre, couper les temps morts (chargements, hésitations).
2. Ajouter un **titre** de 3 secondes au début (« Task’in — pilotage de l’équipe Madagascar »).
3. **Zoomer** (effet « zoom » ou recadrage) sur les éléments importants : objectif du jour, bouton
   « Je rappelle », PowerPoint généré.
4. Musique d’ambiance très basse (bibliothèque Clipchamp), voix toujours prioritaire.
5. Exporter en **1080p MP4**.

## 5. Après la vidéo : nettoyage avant le déploiement

1. Lancer `migration/demo/demo_v2_cleanup.sql` dans l’éditeur SQL Supabase : il supprime les 12 comptes
   `@demo-taskin.invalid` et toutes leurs données, et retire leurs shifts des réglages.
2. Ancien jeu (C4, rattaché aux comptes de test) : `migration/demo_cleanup.sql`.
3. Vérifier dans Task’in que les tableaux sont vides de données fictives avant d’ouvrir l’accès aux agents.
