# Publier Français Quest sur Netlify

## Importer le dépôt

1. Dans Netlify, importer le dépôt GitHub `mopoleonel/TCF-express-francais`.
2. Sélectionner la branche `main` et laisser le dossier de base vide.
3. Netlify lit les paramètres de `netlify.toml` :

| Paramètre | Valeur |
|---|---|
| Build command | `npm run build` |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |
| Node.js | `24` |

Si le site était déjà importé, relancer le déploiement après l’arrivée du nouveau commit. Un dépôt relié en déploiement continu se met normalement à jour au prochain push.

Les commandes `npm start` et `npm run preview` servent au serveur local. Elles ne sont pas des commandes de build Netlify.

## Ce qui fonctionne en ligne

- Interface, avatar et 197 modèles audio enfantins préconstruits.
- Création automatique d’un profil de démonstration individuel, sans configuration de clé.
- Exercices, deux essais, indices, corrections, points, bilans et progression continue.
- Sauvegarde persistante côté serveur avec Netlify Blobs, attachée au profil individuel.
- Studio oral, microphone sur autorisation de l’apprenant et réécoute locale.

La voix et l’auto-évaluation orale restent locales au navigateur. Les enregistrements personnels ne sont pas envoyés à l’API.

## Fonctionnement de la sauvegarde

`netlify/functions/api.mjs` reçoit les routes `/v1/*`, `/demo/register` et `/health` via les réécritures Netlify. Le moteur pédagogique local est réutilisé, sans serveur HTTP permanent.

Chaque profil possède un instantané SQLite séparé dans un store Netlify Blobs **site-wide**, donc conservé lors des nouveaux déploiements. Le fichier dans `/tmp` est uniquement une copie de travail, supprimée à la fin de chaque invocation. Il n’est jamais utilisé comme source persistante.

Les lectures utilisent la cohérence forte. Chaque écriture vérifie l’ETag précédent ; en cas de concurrence, la fonction recharge les dernières données et rejoue la validation. Cela préserve les points, la limite de deux essais et l’unicité de la leçon suivante.

Les déploiements de production utilisent `francais-quest-production-v1` ; les previews utilisent `francais-quest-preview-v1`. Le nom ne dépend pas de l’identifiant du déploiement.

Le jeton individuel du navigateur doit être conservé pour retrouver le même profil. Un autre navigateur crée un autre profil de démonstration. Pour retrouver son compte sur plusieurs appareils, connecter plus tard le backend TCF Express à l’API de service. Les données du prototype local ne sont pas téléversées automatiquement.

## Variables facultatives

À définir dans les variables Netlify avec la portée **Functions**, puis redéployer :

| Variable | Usage |
|---|---|
| `API_KEY` | Secret de 24 caractères minimum pour les créations/rotations de jetons depuis le backend TCF Express. Jamais dans le JavaScript public. |
| `DEMO_REGISTRATION=false` | Désactive la création anonyme lorsque l’intégration aux vrais comptes est prête. Par défaut, le mode démonstration reste actif. |
| `ALLOWED_ORIGINS` | Origines supplémentaires séparées par des virgules, par exemple `https://tcf-express.com,https://www.tcf-express.com`. Le domaine Netlify courant fonctionne sans ce réglage. |
| `QUEST_STORE` | Nom de store personnalisé, si un environnement séparé est souhaité. Garder ce nom stable pour conserver les profils. |

Ne pas définir de `NETLIFY_AUTH_TOKEN` pour cette application : le SDK Blobs utilise le contexte de la fonction Netlify. Aucun secret n’est nécessaire pour la démonstration.

## Vérification après déploiement

Ouvrir `/health` sur le domaine Netlify : la réponse attendue contient `status: "ok"` et `storage: "netlify-blobs"`.

Ouvrir le site, répondre à un exercice puis recharger : les points doivent rester présents. Tester un parcours complet et son enchaînement à la leçon suivante. Le microphone nécessite HTTPS et l’autorisation du navigateur.

Le build vérifie les fichiers publics, le corpus audio, l’empaquetage de la fonction et les tests locaux. Une vérification sur le domaine Netlify reste nécessaire après le premier vrai déploiement ; la préparation du dépôt ne confirme pas un déploiement hébergé.

## Références officielles

- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [Configuration des fonctions et Node.js](https://docs.netlify.com/build/functions/configuration/)
- [Netlify Blobs : persistance, cohérence forte et écritures conditionnelles](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
