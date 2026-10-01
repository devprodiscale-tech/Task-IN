# Publier l’extension sur le Chrome Web Store (installation en un clic)

Aujourd’hui, l’extension s’installe à la main : télécharger le .zip, le décompresser, puis
« Charger l’extension non empaquetée » en mode développeur. Chrome n’autorise aucun autre moyen
pour une extension distribuée en fichier : **seule une publication sur le Chrome Web Store** (ou un
déploiement par la console Google Workspace si les postes sont gérés) permet :

- l’installation en **un clic** depuis un lien, sans fichier ni mode développeur ;
- les **mises à jour automatiques** (Chrome les installe seul, sous quelques heures).

Une publication **« non répertoriée »** suffit : l’extension n’apparaît pas dans les recherches,
seules les personnes qui ont le lien peuvent l’installer.

## Ce qu’il faut (une seule fois)

1. Un compte Google de l’entreprise (ex. compte iScale) pour être « développeur ».
2. Inscription sur la console développeur Chrome Web Store : frais uniques de 5 $.
3. Valider l’adresse e-mail de contact du développeur.

## Publier

1. Console : <https://chrome.google.com/webstore/devconsole> › **Nouvel élément**.
2. Importer le fichier `downloads/taskin-extension-vX.Y.Z.zip` (le même que sur la web app).
3. Fiche :
   - Nom : *Task’in — Time Tracker OnSpot*
   - Description courte : *Chronométrage des traitements, dispatch client et documentation pour l’équipe OnSpot.*
   - Catégorie : *Productivité* · Langue : *Français*
   - Captures : 1280×800 (le timer flottant, le pop-up avec « Mon dispatch client »).
4. **Confidentialité** (onglet dédié) :
   - Objectif unique : *suivre le temps de traitement des demandes clients de l’équipe OnSpot.*
   - Justification des autorisations : `storage` (session et préférences), `tabs` / `scripting`
     (afficher le timer flottant dans l’onglet de travail), accès aux sites (timer sur les outils
     de travail : OSC, Crisp, Ringover…).
   - Données : identifiants de compte Task’in, temps de traitement ; aucune vente ni partage.
   - Lien de politique de confidentialité : une page simple sur la web app (à créer).
5. **Visibilité : Non répertorié**, puis **Envoyer pour examen** (en général 1 à 3 jours).

## Après publication

- Le lien de la fiche remplace le bouton « Installer l’extension » de la web app (une ligne à
  changer dans `index.html` et dans la fenêtre d’installation guidée, `js/19-extension-bridge.js`).
- Les agents déjà équipés en mode développeur suppriment l’ancienne version puis installent
  celle du Store (une seule fois) ; ensuite tout est automatique.
- Pour chaque nouvelle version : monter `version` dans `manifest.json`, importer le nouveau .zip
  dans la console, envoyer pour examen.

## En attendant le Store

La web app propose déjà une **installation guidée** (bouton « Installer l’extension » et bandeau
pour les agents sans extension) qui détecte toute seule la fin de l’installation, et un **avis de
mise à jour** : badge « MAJ » sur l’icône, bandeau dans le pop-up et dans la web app dès qu’une
nouvelle version est publiée (`downloads/extension-latest.json`).
