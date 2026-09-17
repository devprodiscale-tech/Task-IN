# OnSpot Time Tracker — bouton permanent et panneau intégré

## Fonctionnement final

L’extension affiche le bouton rond Task’in directement dans les pages web compatibles, sans créer de fenêtre Chrome native. Le bouton utilise l’icône Task’in d’origine et reste permanent dans la page où il est actuellement transféré.

Un clic sur le bouton ouvre le petit panneau de suivi directement dans la page. Le panneau contient le mini-client Task’in existant avec la connexion Firebase, le chronomètre, l’assistant de démarrage, l’historique et les données de suivi. Un clic en dehors du panneau ou sur le bouton de fermeture ferme uniquement le panneau ; le bouton rond reste affiché.

## Utilisation avec plusieurs fenêtres et écrans

Chaque fenêtre Chrome possède son propre contexte de page. Pour reproduire le comportement d’un bouton unique déplaçable entre écrans, l’extension mémorise une seule page propriétaire. Dans la fenêtre cible, ouvre le menu de l’extension puis clique sur **Transférer le bouton ici**. Le bouton est alors affiché dans l’onglet actif de cette fenêtre et masqué dans les autres pages.

Le bouton peut ensuite être déplacé par glisser-déposer dans la page propriétaire. Sa position est mémorisée. Le panneau ouvert dans cette page se ferme lorsqu’on clique ailleurs, mais le bouton reste visible. Pour changer d’écran, répète l’action **Transférer le bouton ici** depuis la fenêtre cible.

## Activation sans rafraîchissement

Lorsque le widget est activé depuis le menu de l’extension, le service d’arrière-plan injecte immédiatement le script et les styles dans les onglets déjà ouverts lorsque Chrome l’autorise. Il n’est donc pas nécessaire de recharger la page. Les pages système comme `chrome://`, le Chrome Web Store et certains lecteurs PDF restent soumis aux restrictions de Chrome.

## Fichiers principaux

- `manifest.json` — déclaration de l’extension, des permissions d’injection et des ressources du panneau.
- `background.js` — injection immédiate, activation/désactivation du widget, transfert manuel vers l’onglet actif et ouverture du panneau.
- `content.js` / `content.css` — bouton rond permanent, déplacement, panneau intégré avec logo Task’in et fermeture au clic extérieur.
- `menu.html` / `menu.js` — menu de l’icône Chrome, transfert vers la fenêtre active et activation du widget.
- `popup.html` / `popup.js` — mini-client de suivi de tâche chargé dans le panneau.
- `documentation.html` / `documentation.js` — documentation et cas complexes.

## Mise à jour

1. Ouvrir `chrome://extensions`.
2. Supprimer complètement les anciennes versions de Task’in afin de retirer les éventuelles fenêtres natives et anciens widgets.
3. Décompresser l’archive v1.9.3.
4. Cliquer sur **Charger l’extension non empaquetée**.
5. Sélectionner le dossier contenant `manifest.json`.
6. Recharger les pages web si l’ancienne version y avait déjà injecté un widget.
7. Ouvrir le menu de l’extension et activer **Widget flottant**.

## Limites

Le bouton et le panneau sont intégrés aux pages compatibles et ne créent aucune fenêtre native pour le suivi. Chrome interdit l’injection sur certaines pages protégées. Sur ces pages, le widget ne peut pas être affiché ni devenir une page propriétaire, mais cela ne concerne pas les pages web ordinaires comme les outils de support et de relation client.
