# TCF-express-francais — Français Quest

## Interface locale interactive

### Progression continue

Les étapes s’enchaînent désormais automatiquement, dans l’ordre des 12 leçons (A1 → A2 → B1 → B2), après une transition de six secondes. L’apprenant peut continuer immédiatement, mettre en pause ou consulter son bilan. Consulter le bilan de l’étape met cette transition en pause ; le bouton Continuer mène directement à la prochaine leçon.

Le repère grammatical et les bilans précédents de la séance restent accessibles depuis les exercices. Aucun changement de leçon n’envoie automatiquement à l’accueil ou au catalogue. Après la dernière leçon disponible, le bilan reste affiché avec des actions volontaires pour recommencer ou travailler l’oral.

`POST /v1/sessions/:id/next` crée la prochaine session guidée une fois la session terminée. Cette opération réutilise la même session suivante en cas de double appel. L’API renvoie les métadonnées de la leçon et son ordre. Les entraînements practice/daily sans leçon explicite commencent par la première leçon contenant encore des activités non terminées. Une session libre couvrant plusieurs leçons continue après la plus avancée qu’elle a abordée.

Dans le studio oral, « Je suis à l’aise » passe automatiquement à la situation suivante. « Je veux la retravailler » conserve la situation courante. Ce choix reste une auto-évaluation.

### Parcours à deux essais et bilan

Une bonne réponse déclenche la question suivante après un bref retour visuel (400 ms). Après une première erreur, la même question reste ouverte pour un dernier essai et un indice facultatif. La solution n’est pas renvoyée par l’API à ce stade. Après la deuxième erreur, passage automatique (650 ms) et correction conservée pour le bilan.

Le bilan présente chaque question, les deux réponses éventuelles, l’utilisation d’un indice, la réponse attendue et son explication FR/EN. Il distingue les réussites au premier essai, les réussites au second et les questions à reprendre. « Recommencer » crée une nouvelle session avec exactement les mêmes exercices dans le même ordre ; une activité déjà réussie ne redonne pas de XP.

API : `GET /v1/sessions/:id/report` pour le bilan complet ; `POST /v1/sessions/:id/restart` pour rejouer. Le bilan ne révèle les solutions qu’après finalisation de toutes les questions. Les essais individuels sont stockés dans `submissions`, les résultats finaux dans `attempts`. Le champ facultatif `hintUsed` des réponses trace l’usage d’un indice.

Le thème central `public/theme.css` applique partout la même palette de marque : bleu nuit #081b3e, bleu #002395, rouge #ED2939, fond clair et cartes blanches. La voix par défaut est désormais un timbre synthétique enfantin produit dans `public/audio-young/` ; elle n’est pas l’enregistrement d’un vrai enfant.

### Écrire et parler avec Léo

L’interface reprend le bleu #002395, le blanc et les accents rouges de TCF Express. Un petit avatar issu de la référence utilisateur remplace le renard et reste discret en bas de l’écran. Il s’anime uniquement pendant la lecture effective.

Le **studio oral** est accessible sur http://127.0.0.1:8081/#oral : 12 situations guidées avec mots cliquables, lecture normale/lente, répétition par groupes, conseils de prononciation FR/EN, enregistrement jusqu’à 60 secondes, réécoute et mini-dialogues. Les exemples disposent de 197 fichiers audio français locaux ; la synthèse du navigateur sert de solution complémentaire. Le bouton des sons ludiques reste indépendant de l’écoute volontaire des exemples.

Le microphone nécessite l’autorisation du navigateur au clic de l’apprenant. Il est coupé à l’arrêt, au changement d’atelier et à la sortie de l’écran. Aucun audio personnel n’est téléversé. Les enregistrements restent en mémoire de la page et sont libérés en quittant l’atelier. L’auto-évaluation orale est sauvegardée uniquement dans ce navigateur et séparée du score écrit de l’API ; elle n’attribue ni score de prononciation ni XP automatiques.

Voir [ASSETS.md](ASSETS.md) pour l’avatar, le prompt ImageGen et la construction des fichiers de voix.

`npm run preview` lance http://127.0.0.1:8081/ : tableau de bord, catalogue filtrable, leçons FR/EN, exercices corrigés, révisions et suivi. Cet aperçu utilise réellement l’API et un fichier distinct `data/preview.sqlite`. Un compte de démonstration est créé automatiquement ; son jeton individuel est conservé dans le navigateur. La route de création automatique appartient uniquement au serveur local `preview.js`, pas au serveur API de production. Garder cet aperçu sur la boucle locale. L’interface est inspirée de la marque TCF Express, sans modifier le site existant.

Prototype fonctionnel destiné à une future intégration à TCF Express. Aucune modification du site en production. Node.js 24+, SQLite intégré, aucune dépendance npm. Contenu original : 12 leçons, 52 activités dont 16 défis de jeu, explications FR/EN.

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
