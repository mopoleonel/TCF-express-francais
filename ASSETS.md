# Léo — avatar et voix

## Avatar

Image de référence fournie par l’utilisateur dans cette conversation : personnage fictif en 3D, peau brune, cheveux courts crépus, haut jaune et sac à dos rouge.

Outil utilisé : **ImageGen intégré** (pas de CLI). Fichier livré : `public/assets/leo-avatar.png` (1774 × 887, transparence, deux cases carrées côte à côte). La première case est au repos, la deuxième parle. Affichage dans le site : 25 à 48 pixels selon le contexte. Animation de parole : `public/audio-young/lipsync.json` donne le volume de chaque voix 25 fois par seconde (`node scripts/build-lipsync.mjs`, à relancer après tout changement de voix). La bouche s'ouvre à chaque syllabe, la tête et le halo suivent le volume. Avec la voix du navigateur, un rythme de syllabes est relancé à chaque mot.

Prompt final utilisé :

> Use case: identity-preserve. Asset: transparent PNG horizontal two-frame avatar sprite sheet for a French learning website. Reference image shows the SAME fictional 3D illustrated schoolboy in different views: preserve exactly his dark brown skin, short tightly curled black hair, large warm brown eyes, friendly face, mustard-yellow T shirt and red backpack straps. Create ONLY TWO identical front-facing HEAD-AND-SHOULDERS busts of this boy side by side, on a fully transparent background, no other characters, no props, no text. Canvas width exactly twice height, two equal square cells. Each bust centered in its square, same head position, scale and lighting, enough margin so no hair clipped. LEFT CELL: gentle closed-mouth smile, attentive. RIGHT CELL: exact same pose and face but mouth slightly open as if naturally speaking a vowel, teeth subtle, no exaggerated emotion. High-quality rounded 3D animation character rendering consistent with reference. Faces must be readable as a tiny 48-pixel UI avatar. Image will be used via CSS background-position left/right. No grey background, no circles, no border, no watermark. Upper torso visible, crop below backpack straps.

## Voix

Version actuelle : **voix neuronale gratuite, rajeunie**. Les 197 fichiers de `public/audio-young/` sont produits par **Kokoro-82M** (licence Apache 2.0, usage commercial autorisé) avec la voix française `ff_siwis`, puis rajeunis : hauteur ×1,18 et formants ×1,10 (pyworld), vitesse 0,95. Ce n'est pas la voix d'un vrai enfant ni d'une personne réelle. Choix validé à l'écoute le 5 novembre 2026 (variante « enfant léger »).

Reconstruction (voir l'en-tête de `scripts/build-leo-voice.py`) :

```bash
pip install kokoro-onnx pyworld soundfile
npm pack kokoro-q8-shards kokoro-js
cat package/kokoro-q8.part{0,1,2,3,4,5}.bin > model_quantized.onnx
python3 scripts/build-leo-voice.py model_quantized.onnx package/voices/ff_siwis.bin
node scripts/build-lipsync.mjs
```

Ancienne voix (Microsoft Julie montée de 22 %) : scripts `build-young-voice.ps1` et `build-speech.ps1`, conservés pour mémoire.

Les fichiers déjà produits permettent de lire les exemples sur un autre appareil sans installer la voix Windows.
