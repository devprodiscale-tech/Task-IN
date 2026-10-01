# Task’in — capacité du système sur plusieurs mois

Dernière mise à jour : 1er octobre 2026 (soir). Mesures faites sur la base réelle (Supabase) après injection
des données fictives : 11 agents de démonstration, 3 semaines d’activité, 5 764 traitements.

## 1. Ce qui ralentissait (constat)

| Cause | Effet mesuré | Correctif (fait) |
|---|---|---|
| Règles d’accès (RLS) : `auth.uid()` et `is_taskin_manager()` recalculés **pour chaque ligne lue** | 89 ms pour une page de 1 000 traitements, et la durée croît avec l’historique | Migration 023 : fonctions évaluées une seule fois par requête → **8 ms** (×11). 49 règles corrigées sur toutes les tables |
| La web app téléchargeait **tout l’historique** des traitements à chaque ouverture / actualisation, page par page, colonne `metadata` comprise | 6 requêtes successives aujourd’hui ; ~100 000 lignes et ~30 Mo au bout d’un an (plafond 50 000 → historique tronqué) | Fenêtre de **62 jours** (jour, semaine, mois, mois précédent), colonnes utiles seulement, pages lues 3 par 3 en parallèle |
| Filtres De / À, Pilotage 360°, exports, heatmap sur une date plus ancienne | — | Le complément est chargé **à la demande** (`taskinEnsureEntriesFrom`), une seule fois |
| Courbe d’évolution 12 mois / « tout l’historique » | Nécessitait tout l’historique dans le navigateur | Lue sur des **agrégats serveur** agent × jour (`taskin_entries_daily`, migration 024) : ~4 000 lignes par an au lieu de ~100 000 |
| Agent : à chaque arrêt de timer depuis l’extension, l’onglet Task’in rechargeait tout son historique | Latence perçue côté extension quand la web app est ouverte | Même fenêtre de 62 jours (≈ 1 300 lignes pour un agent au lieu de tout) |

L’extension elle-même ne lit que des données bornées et indexées (traitements du jour de l’agent,
timer actif, dispatch du jour) : elle profite directement du correctif RLS.

## 2. Projection sur 12 mois (équipe de 15 agents, ~25 traitements / agent / jour, 22 jours / mois)

| Donnée | Par mois | Sur 12 mois | Limite Supabase gratuit | Limite Supabase Pro (25 $/mois) |
|---|---|---|---|---|
| Traitements (`time_entries`, ~370 octets / ligne index compris) | ~8 300 lignes · ~3 Mo | ~100 000 lignes · ~37 Mo | Base 500 Mo | Base 8 Go |
| Autres tables (connexions, chiffres OSC, tickets, écoutes…) | < 1 Mo | ~10 Mo | (même base) | (même base) |
| **Captures d’écran** (déclarations OSC, tickets : JPEG ~250 Ko) | ~2 par agent et par jour → **~165 Mo** | **~2 Go** | **Stockage 1 Go → plein en ~6 mois** | Stockage 100 Go |
| Ouverture de la web app (encadrement) | 62 jours ≈ 16 000 lignes ≈ 4 Mo (estimation : 2 à 3 s) | stable (fenêtre glissante) | — | — |

Conclusion : la base de données tient sans difficulté plusieurs années. **Le premier plafond est le
stockage des captures (environ 6 mois en offre gratuite).** Viennent ensuite les sauvegardes : l’offre gratuite
n’en fait aucune, et le projet est mis en pause après 7 jours sans activité.

## 3. Recommandations

1. **Supabase Pro** (25 $/mois, à valider par le management) avant la mise en production réelle :
   sauvegardes quotidiennes (7 jours), 8 Go de base, 100 Go de stockage, pas de mise en pause, support.
2. **Rétention des captures** : purge automatique des captures de plus de 90 jours une fois les chiffres
   validés (les chiffres restent, seule l’image part) ; l’outil de purge existe déjà (Admin › Purge).
3. **Stockage local en complément** (phase 2, après la mise en production) : cache IndexedDB dans le
   navigateur de l’encadrement pour l’historique des traitements, avec synchronisation différentielle
   (seules les lignes nouvelles depuis la dernière ouverture sont téléchargées). Effet : ouverture quasi
   instantanée, consultation possible hors ligne. Supabase reste la source de vérité ; le cache se vide à
   la déconnexion (poste partagé).
4. **Archivage annuel** : export des traitements de plus de 12 mois vers Google Sheets / Drive (le format
   d’export existe), puis suppression de la base.

## 4. Paragraphe prêt à copier dans le mail au management

> Task’in s’appuie sur Supabase (base de données, comptes, fichiers). Les tests de charge montrent que la
> base tiendra plusieurs années au rythme de l’équipe. Le stockage des captures d’écran (déclarations
> OSC, tickets agents), lui, dépassera la limite gratuite (1 Go) en environ 6 mois. L’offre gratuite
> n’inclut par ailleurs **aucune sauvegarde**. Nous recommandons de passer à **Supabase Pro (25 $/mois)**
> avant l’ouverture à toute l’équipe : sauvegardes quotidiennes, 8 Go de base, 100 Go de stockage, pas de
> mise en pause. En complément, nous prévoyons :
> - une purge des captures de plus de 90 jours ;
> - un cache local dans le navigateur de l’encadrement, pour garder des écrans rapides quand l’historique grandira.
