# Mapping des comptes Firebase vers les entrées de temps

## Résultat

Le rapprochement local porte sur 28 comptes Firebase et 261 entrées de temps. Les six identifiants utilisés dans les entrées sont tous présents comme identifiants de comptes Firebase. Il n’y a donc aucune entrée orpheline au niveau du mapping Firebase.

| Identifiant d’agent dans `time_entries` | Entrées | Compte Firebase | Rôle |
|---|---:|---|---|
| `igkiNb8vtVQEz6IKTcGNNRjHMtB2` | 106 | Agent 13 — `agent6@onspot.travel` | agent |
| `hq9vIEH1hpeCAXBTU1vu868zSSy1` | 79 | Patrick Kama — `agent1@onspot.travel` | agent |
| `P9NBsFJrD6aqEqfldZzO4dDroTH3` | 35 | Superviseur 1 — `agent2@onspot.travel` | supervisor |
| `johnr` | 31 | John R. — e-mail absent | agent |
| `patrick` | 7 | Patrick — e-mail absent | agent |
| `7DwUOkilrUNwroEJjwpxXRsRhfG2` | 3 | Admin — `agent3@onspot.travel` | admin |

## Points à traiter avant l’import

Les comptes historiques contiennent des identifiants Firebase hétérogènes : certains sont des UID Firebase, d’autres sont des identifiants métier comme `johnr` et `patrick`. Le mapping doit donc conserver l’identifiant original dans `raw_id` ou `metadata` et rattacher l’utilisateur à un profil Supabase lorsque ce profil est créé.

Le projet Supabase ne contient actuellement que le compte de test `fandry.joh`. Il faut créer ou inviter les comptes historiques dans Supabase Auth, puis créer les profils correspondants, avant de remplir la clé étrangère `time_entries.agent_id`. Les trois dates `startTime` manquantes et la durée négative identifiées dans l’analyse précédente doivent rester en quarantaine jusqu’à décision explicite.

La stratégie sûre est de charger les 261 lignes dans une table de staging ou dans un fichier de préparation, puis d’insérer dans `time_entries` uniquement les lignes dont l’agent et la date sont validés. Firebase reste inchangé comme source de référence.
