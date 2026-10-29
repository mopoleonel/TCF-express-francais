# Léo — avatar et voix

## Avatar

Image de référence fournie par l’utilisateur dans cette conversation : personnage fictif en 3D, peau brune, cheveux courts crépus, haut jaune et sac à dos rouge.

Outil utilisé : **ImageGen intégré** (pas de CLI). Fichier livré : `public/assets/leo-avatar.png` (1774 × 887, transparence, deux cases carrées côte à côte). La première case est au repos, la deuxième parle. Affichage dans le site : 25 à 48 pixels selon le contexte. Le changement de bouche est une animation indicative de parole, pas une synchronisation labiale phonétique.

Prompt final utilisé :

> Use case: identity-preserve. Asset: transparent PNG horizontal two-frame avatar sprite sheet for a French learning website. Reference image shows the SAME fictional 3D illustrated schoolboy in different views: preserve exactly his dark brown skin, short tightly curled black hair, large warm brown eyes, friendly face, mustard-yellow T shirt and red backpack straps. Create ONLY TWO identical front-facing HEAD-AND-SHOULDERS busts of this boy side by side, on a fully transparent background, no other characters, no props, no text. Canvas width exactly twice height, two equal square cells. Each bust centered in its square, same head position, scale and lighting, enough margin so no hair clipped. LEFT CELL: gentle closed-mouth smile, attentive. RIGHT CELL: exact same pose and face but mouth slightly open as if naturally speaking a vowel, teeth subtle, no exaggerated emotion. High-quality rounded 3D animation character rendering consistent with reference. Faces must be readable as a tiny 48-pixel UI avatar. Image will be used via CSS background-position left/right. No grey background, no circles, no border, no watermark. Upper torso visible, crop below backpack straps.

## Voix

Version actuelle : **timbre synthétique enfantin**. Les 197 fichiers de `public/audio-young/` partent de la voix française Microsoft Julie, avec élévation contrôlée de hauteur (+22 %) et des formants via Rubber Band / FFmpeg, sans accélération du texte. Ce n’est pas la voix enregistrée d’un vrai enfant. Le bouton de lecture et la vitesse lente utilisent ce corpus par défaut. Reconstruction : `./scripts/build-young-voice.ps1` depuis PowerShell 7, avec FFmpeg disponible.

Corpus précédent conservé : 197 exemples français produits localement avec **Microsoft Paul**, voix Windows, via System.Speech, dans `public/audio/`. Aucun service TTS externe, aucune clé API. Une autre voix française du navigateur peut être choisie ; sa disponibilité dépend de l’appareil. La voix de synthèse est un modèle d’écoute, pas celle d’une personne réelle ou du personnage de référence.

Reconstruction sur une machine Windows possédant cette voix :

```powershell
node scripts/build-speech-manifest.mjs
./scripts/build-speech.ps1
```

Les fichiers déjà produits permettent de lire les exemples sur un autre appareil sans installer la voix Windows.
