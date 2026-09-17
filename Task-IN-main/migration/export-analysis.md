# Analyse de l’export Firebase des entrées de temps

L’export local `taskin-firebase-time-entries-261.json` contient 261 entrées, conformément au compteur déclaré. Les identifiants sont uniques.

## Répartition

| Élément | Résultat |
|---|---:|
| Entrées totales | 261 |
| Doublons d’identifiant | 0 |
| Dates `startTime` manquantes | 3 |
| Dates `startTime` invalides | 0 |
| Durées négatives | 1 |

Les sources principales sont `ticket` (95), `inbound` (30), `ringover` (27), `manual` (22), `chat` (22), `crisp` (20), `email` (20), `Non défini` (17) et `outbound` (7). Une entrée utilise `osticket` (1).

## Identifiants d’agents

L’export contient six identifiants d’agents distincts :

| Identifiant | Nombre d’entrées | Type apparent |
|---|---:|---|
| `igkiNb8vtVQEz6IKTcGNNRjHMtB2` | 106 | UID Firebase |
| `hq9vIEH1hpeCAXBTU1vu868zSSy1` | 79 | UID Firebase |
| `P9NBsFJrD6aqEqfldZzO4dDroTH3` | 35 | UID Firebase |
| `johnr` | 31 | Ancien identifiant métier |
| `patrick` | 7 | Ancien identifiant métier |
| `7DwUOkilrUNwroEJjwpxXRsRhfG2` | 3 | UID Firebase |

Le compte Supabase de test actuel possède un UUID différent et ne permet donc pas de rattacher automatiquement les 261 lignes à `profiles`.

## Conséquence technique

Il ne faut pas importer directement ces lignes dans `time_entries.agent_id`, car cette colonne est une clé étrangère UUID obligatoire vers `profiles`. Il faut d’abord récupérer la collection Firebase `accounts` afin de construire une table de correspondance entre les anciens identifiants, les e-mails, les noms et les nouveaux utilisateurs Supabase.

Les trois dates manquantes et la durée négative doivent être placées en quarantaine ou corrigées explicitement avant import. Les lignes valides peuvent ensuite être transformées avec leur identifiant Firebase original conservé dans `raw_id` ou dans `metadata`.

## Décision recommandée

1. Exporter la collection `accounts` Firebase, sans l’ajouter à GitHub.
2. Construire la correspondance anciens identifiants → comptes → profils Supabase.
3. Corriger ou mettre en quarantaine les quatre lignes anormales.
4. Importer d’abord dans une table de staging Supabase.
5. Comparer staging et Firebase avant insertion finale dans `time_entries`.
