# TCF-express-francais — L’Atelier de français (avec ton ami Léo)

## Fiabilité (novembre 2026)

- **Réponses** : variantes correctes acceptées (`alternatives` dans `src/content.js`), consignes précisées quand plusieurs réponses étaient possibles.
- **Réseau** : messages en français ; une réponse envoyée sans réseau part automatiquement au retour de la connexion ; bandeau « Hors connexion ».
- **Appli installable** : `manifest.webmanifest` et `sw.js`. L'interface s'ouvre sans réseau, les voix écoutées restent disponibles hors ligne. Changer `VERSION` dans `public/sw.js` à chaque mise en ligne.
- **Démarrage** : affichage immédiat depuis la dernière visite, appels au serveur en parallèle.
- **Navigation** : le bouton retour du téléphone change d'écran ; en leçon, il demande confirmation. Une leçon interrompue reprend après un rechargement (`GET /v1/sessions/:id`).
- **État de jeu sur le serveur** : cœurs, objectif, coffre et XP de l'oral (`GET/POST /v1/me/state`) suivent le code de sauvegarde. Les journées sont comptées à l'heure de Douala (`QUEST_TZ_OFFSET_MINUTES`, 60 par défaut).
- **Inscriptions** : 40 nouveaux profils par heure et par réseau au maximum (`REGISTRATION_LIMIT`).
- **Lisibilité** : textes de 12,5 px minimum, contrastes corrigés, mise en page adaptée au téléphone couché, mini-jeux et choix mélangés à chaque partie.

## Habillage « Voyage vers le Canada » (novembre 2026)

Le parcours est mis en scène comme un voyage Douala → Paris → Québec → Montréal (`public/voyage.css`, police Baloo 2 hébergée dans `public/fonts`) :

- **Accueil** : carte d’embarquement « Prochaine escale » et flamme de série animée.
- **Carte** : chemin sinueux dans le ciel, étapes en pièces dorées, escales par ville ; l’avion vole jusqu’à l’étape atteinte au retour d’une leçon.
- **Leçon** : Léo commente chaque réponse (saut de joie, grimace), cœur qui se brise, réponses qui apparaissent une à une.
- **Fin de leçon** : 1 à 3 étoiles, compteurs d’XP et de précision qui défilent, retour à la carte pour voir l’avion avancer.
- **Profil** : les badges deviennent des tampons de passeport.

Toutes les animations décoratives s’arrêtent si l’appareil demande de réduire les mouvements.

## Version jeu (novembre 2026)

L’apprentissage fonctionne maintenant comme une appli de langue :

- **En-tête de jeu** : série de jours 🔥, XP ⚡ et cœurs ❤️ visibles en permanence.
- **Questions** : barre de verdict en bas d’écran. Bonne réponse : « Excellent ! », son, +10 XP et série de bonnes réponses. Après la 2e erreur, la bonne réponse et l’explication s’affichent tout de suite.
- **Erreurs** : le choix faux reste marqué en rouge ; dans les jeux, les mots bien placés et les duos justes sont conservés (`feedback` renvoyé par l’API, sans révéler la solution). Une erreur d’accent seule déclenche un avertissement qui ne consomme pas d’essai.
- **Cœurs** : 5 par jour (stockés dans le navigateur). Une erreur en coûte un ; chaque bonne réponse en entraînement (`kind: "refill"`) en rend un.
- **Fin de leçon** : écran de victoire (XP, précision, temps), série qui grandit, nouveaux badges, coffre de l’objectif du jour. Plus d’enchaînement automatique.
- **Carte** : les leçons s’ouvrent une par une ; une leçon verrouillée peut être jouée comme test.
- **Fin du parcours** : écran trophée et certificat téléchargeable ou partageable sur WhatsApp.
- **Profil** : 17 badges à paliers, objectif du jour au choix (5, 10 ou 20), code de sauvegarde pour changer d’appareil, rappel quotidien (fichier agenda .ics).
- **Oral** : +5 XP par phrase marquée « à l’aise », défi oral du jour (+10 XP).
- **XP** : 10 par défi réussi, +20 par leçon terminée, +5 par leçon sans faute.
- **Poids** : avatar en WebP (13 Ko au lieu de 1,4 Mo), voix en MP3 (3 Mo au lieu de 16 Mo), police Inter hébergée avec le site. Après une nouvelle génération des voix en WAV, lancer `node scripts/compress-audio.mjs`.

Les fichiers concernés : `public/app.js`, `public/game.js`, `public/quest.css`, `src/app.js`, `src/content.js`.

## Déploiement Netlify prêt

Importer ce dépôt sur Netlify avec la branche `main`. La configuration est déjà dans `netlify.toml` : **build `npm run build`**, **publication `public`**, **Node 24**. L’API fonctionne via Netlify Functions et la progression est sauvegardée dans Netlify Blobs, séparément pour chaque apprenant. Le mode démonstration fonctionne sans clé à renseigner.

Le [guide NETLIFY.md](NETLIFY.md) détaille le déploiement, la persistance, les variables facultatives et les vérifications après publication. L’interface et les fichiers audio sont déjà construits ; Windows et FFmpeg ne sont pas requis sur Netlify.

## Interface locale interactive

### Progression continue

Les étapes suivent l’ordre des 12 leçons (A1 → A2 → B1 → B2). À la fin de chaque leçon, un écran de victoire résume les XP, la précision et la série ; l’apprenant choisit de continuer ou de consulter ses corrections.

Le repère grammatical et les bilans précédents de la séance restent accessibles depuis les exercices. Aucun changement de leçon n’envoie automatiquement à l’accueil ou au catalogue. Après la dernière leçon disponible, le bilan reste affiché avec des actions volontaires pour recommencer ou travailler l’oral.

`POST /v1/sessions/:id/next` crée la prochaine session guidée une fois la session terminée. Cette opération réutilise la même session suivante en cas de double appel. L’API renvoie les métadonnées de la leçon et son ordre. Les entraînements practice/daily sans leçon explicite commencent par la première leçon contenant encore des activités non terminées. Une session libre couvrant plusieurs leçons continue après la plus avancée qu’elle a abordée.

Dans le studio oral, « Je suis à l’aise » passe automatiquement à la situation suivante. « Je veux la retravailler » conserve la situation courante. Ce choix reste une auto-évaluation.

### Parcours à deux essais et bilan

Chaque réponse affiche un verdict en bas de l’écran (bouton Continuer ou touche Entrée). Après une première erreur, la même question reste ouverte pour un dernier essai et un indice propre à la question. Après la deuxième erreur, la bonne réponse et son explication s’affichent immédiatement.

Le bilan présente chaque question, les deux réponses éventuelles, l’utilisation d’un indice, la réponse attendue et son explication FR/EN. Il distingue les réussites au premier essai, les réussites au second et les questions à reprendre. « Recommencer » crée une nouvelle session avec exactement les mêmes exercices dans le même ordre ; une activité déjà réussie ne redonne pas de XP.

API : `GET /v1/sessions/:id/report` pour le bilan complet ; `POST /v1/sessions/:id/restart` pour rejouer. Le bilan ne révèle les solutions qu’après finalisation de toutes les questions. Les essais individuels sont stockés dans `submissions`, les résultats finaux dans `attempts`. Le champ facultatif `hintUsed` des réponses trace l’usage d’un indice.

Le thème central `public/theme.css` applique partout la même palette de marque : bleu nuit #081b3e, bleu #002395, rouge #ED2939, fond clair et cartes blanches. La voix par défaut est une voix neuronale gratuite (Kokoro, Apache 2.0) rajeunie en timbre d’enfant, produite dans `public/audio-young/` (voir ASSETS.md) ; ce n’est pas l’enregistrement d’un vrai enfant.

### Écrire et parler avec Léo

L’interface reprend le bleu #002395, le blanc et les accents rouges de TCF Express. Un petit avatar issu de la référence utilisateur remplace le renard et reste discret en bas de l’écran. Il s’anime uniquement pendant la lecture effective.

Le **studio oral** est accessible sur http://127.0.0.1:8081/#oral : 12 situations guidées avec mots cliquables, lecture normale/lente, répétition par groupes, conseils de prononciation FR/EN, enregistrement jusqu’à 60 secondes, réécoute et mini-dialogues. Les exemples disposent de 197 fichiers audio français locaux ; la synthèse du navigateur sert de solution complémentaire. Le bouton des sons ludiques reste indépendant de l’écoute volontaire des exemples.

Le microphone nécessite l’autorisation du navigateur au clic de l’apprenant. Il est coupé à l’arrêt, au changement d’atelier et à la sortie de l’écran. Aucun audio personnel n’est téléversé. Les enregistrements restent en mémoire de la page et sont libérés en quittant l’atelier. L’auto-évaluation orale est sauvegardée uniquement dans ce navigateur et séparée du score écrit de l’API ; elle n’attribue ni score de prononciation ni XP automatiques.

Voir [ASSETS.md](ASSETS.md) pour l’avatar, le prompt ImageGen et la construction des fichiers de voix.

`npm run preview` lance http://127.0.0.1:8081/ : tableau de bord, catalogue filtrable, leçons FR/EN, exercices corrigés, révisions et suivi. Cet aperçu utilise réellement l’API et un fichier distinct `data/preview.sqlite`. Un compte de démonstration est créé automatiquement ; son jeton individuel est conservé dans le navigateur. La route de création automatique appartient uniquement au serveur local `preview.js`, pas au serveur API de production. Garder cet aperçu sur la boucle locale. L’interface est inspirée de la marque TCF Express, sans modifier le site existant.

Prototype fonctionnel destiné à une future intégration à TCF Express. Aucune modification du site TCF Express en production. Node.js 24+, SQLite intégré ; adaptateur Netlify avec le SDK officiel Blobs et vérification du bundle avec esbuild. Contenu original : 12 leçons, 52 activités dont 16 défis de jeu, explications FR/EN.

### Version ludique avec Léo

Carte de quatre mondes et douze étapes, guide miniature inspiré de la référence utilisateur, mini-jeux de phrases à assembler, erreurs à réparer, paires à relier et écoute. Les quatre mini-jeux contiennent chacun quatre défis. Sons de réussite facultatifs, confettis compatibles avec la préférence de réduction des animations, indices bilingues, séries de réponses réussies et objectif quotidien de cinq activités différentes réussies (journée UTC).

Les réponses des jeux sont validées par la même API que les exercices classiques. Le bilan détaille tous les essais et permet de recommencer le même parcours dans une nouvelle session enregistrée par l’API. La lecture utilise les fichiers français locaux, avec la synthèse vocale du navigateur en complément ; une transcription accessible permet de continuer sans audio.

Pour lancer un mini-jeu : `POST /v1/sessions` avec `{ "kind": "game", "gameType": "order" }`. Autres types : `repair`, `pairs`, `listen`. Les métadonnées publiques décrivent les blocs, mots, choix ou colonnes ; les solutions restent côté serveur, sauf les transcriptions volontairement disponibles pour l’accès sans audio. La progression expose aussi les compteurs par leçon et le nombre d’activités différentes réussies aujourd’hui.

## Démarrage

Depuis ce dossier, dans PowerShell :

```powershell
$env:API_KEY = 'remplacer-par-un-secret-aleatoire-de-32-caracteres-minimum'
npm start
```

API locale : http://127.0.0.1:8080. `npm test` lance les tests. Variables facultatives : `PORT`, `HOST`, `DB_PATH`, `ALLOWED_ORIGINS` (origines séparées par des virgules). Les données sont dans `data/quest.sqlite`. Sauvegarder SQLite avec son API de sauvegarde ou à l’arrêt du serveur, pas par copie à chaud du seul fichier principal.

## Intégration et sécurité

Le backend de TCF Express authentifie son utilisateur et crée son profil avec `X-API-Key`. La clé de service reste exclusivement côté serveur. Le jeton individuel retourné donne accès à un seul apprenant. Ne pas placer la clé de service dans JavaScript public. Les jetons sont stockés sous forme de hash. Rotation possible par le backend de confiance. `externalId` correspond à l’identifiant interne du site, jamais à une adresse email obligatoire.

Avant déploiement public : HTTPS via reverse proxy, limitation des requêtes au proxy, gestion des secrets, sauvegardes, contrôle des droits par abonnement dans le backend TCF Express, supervision et revue de sécurité. Le processus écoute seulement en local par défaut. CORS ne remplace pas l’authentification. Les jetons individuels n’expirent pas automatiquement dans ce prototype : rotation ou suppression les invalide.

## Contrat HTTP v1

Toutes les réponses sont JSON. Les POST acceptent `Content-Type: application/json`, taille maximale 16 Ko. Erreurs : `{ "error": "message" }`. Statuts : 400 validation, 401 authentification, 403 origine refusée, 404 ressource absente ou appartenant à un autre utilisateur, 409 doublon, 413 taille, 415 type de contenu.

| Méthode | Route | Authentification | Entrée / résultat |
|---|---|---|---|
| GET | `/health` | publique | état du processus |
| POST | `/v1/learners` | X-API-Key | `{externalId, locale: "en" ou "fr", track: "foundation" ou "refresher"}` → id, token ; 201 |
| POST | `/v1/learners/:id/token` | X-API-Key | `{}` → nouveau token ; ancien invalidé |
| GET | `/v1/catalog` | Bearer individuel | leçons, règles bilingues, niveaux indicatifs |
| GET | `/v1/lessons/:id` | Bearer individuel | règle et exercices sans solutions |
| POST | `/v1/sessions` | Bearer individuel | `{kind, lessonId?}` → id, exercices sans solutions ; 201 |
| POST | `/v1/sessions/:id/answers` | Bearer individuel | `{exerciseId, answer}` → correction, explication, XP, révision, progression |
| GET | `/v1/me/progress` | Bearer individuel | XP, compétences, badges, jours consécutifs |
| DELETE | `/v1/me` | Bearer individuel | supprime définitivement profil, sessions et réponses |

Exemple côté backend (fetch disponible dans Node 24) :

```js
const response = await fetch('http://127.0.0.1:8080/v1/learners', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-API-Key': process.env.QUEST_SERVICE_KEY},
  body: JSON.stringify({externalId: 'site-user-123', locale: 'en', track: 'foundation'})
});
if (!response.ok) throw new Error(`Quest: ${response.status}`);
const learner = await response.json(); // conserver le jeton de manière sécurisée
const sessionResponse = await fetch('http://127.0.0.1:8080/v1/sessions', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Authorization: `Bearer ${learner.token}`},
  body: JSON.stringify({kind: 'practice', lessonId: 'etre-avoir'})
});
const session = await sessionResponse.json();
```

## Pédagogie et règles du prototype

Deux profils enregistrent l’intention : `foundation` pour apprendre les bases, `refresher` pour les consolider. Le choix de parcours est laissé au site : ce champ ne change pas encore automatiquement la difficulté.

- `practice` : jusqu’à 5 exercices, priorité aux exercices jamais rencontrés ; `lessonId` limite à une leçon.
- `diagnostic` : un exercice par leçon (12 sans filtre), bilan par compétence dans la progression. Aucun classement CECRL automatique.
- `daily` : courte séance selon la même sélection que practice ; pas encore de défi unique verrouillé par date.
- `review` : exercices déjà rencontrés et arrivés à échéance. Erreur : révision à J+1 ; réussite : J+3. Il s’agit d’un calendrier simple, pas encore d’un algorithme adaptatif complet.
- 10 XP à la première réussite d’un exercice ; les répétitions n’ajoutent pas de points. Deux essais maximum, avec arrêt dès une réussite. Les jours consécutifs sont calculés en UTC. Badges : première réussite, dix exercices réussis, trois jours consécutifs.
- La correction ignore casse, espaces multiples, apostrophes courbes et ponctuation finale simple. Elle conserve les accents : `a` et `à` restent différents. Réponses courtes attendues ; pas de correction de texte libre ou par IA.

## Limites et suite proposée

Version de démonstration avec un petit corpus et une interface ludique locale. Pas encore d’évaluation de prononciation, de classement public, de corpus audio enregistré ou d’IA générative. Les niveaux A1–B2 indiquent la difficulté visée des exercices ; ils ne constituent ni une couverture complète du CECRL ni un score officiel TCF. Faire relire et élargir les contenus par un enseignant avant commercialisation.

Le plan détaillé et les prochaines étapes se trouvent dans [PEDAGOGIE.md](PEDAGOGIE.md).
