# JAURESMARKET

Site de la boutique JAURESMARKET en Côte d’Ivoire : catalogue, recherche, filtres, panier et commande sur WhatsApp. L’administration permet de gérer les articles, photos, prix, stock, tailles, couleurs et descriptions.

## Stack

Node.js 24, HTML, CSS et JavaScript, sans dépendance externe. SQLite pour le développement local ; Supabase (Postgres et Storage) pour Vercel.

## Installation locale

Depuis le dépôt, avec Node.js 24 :

```sh
npm start
```

Le site utilise le port 3000 et l’administration se trouve à `/admin`. Sans configuration Supabase, les données sont conservées dans `.data/shop.sqlite`. Le mot de passe administrateur initial est généré dans `.data/admin-password`, fichier privé ignoré par Git. Ne pas publier ce fichier.

Variables locales facultatives : `PORT`, `HOST`, `DATA_DIR`, `ADMIN_PASSWORD`, `COOKIE_SECURE=true` derrière HTTPS. `npm start` charge le fichier `.env` s’il existe. Les sessions durent 8 heures et sont conservées après redémarrage ; la déconnexion les révoque. Changer le mot de passe invalide les anciennes sessions.

## Mise en ligne sur Vercel avec Supabase

1. Créer un projet Supabase. Dans son éditeur SQL, exécuter le contenu de [`supabase/schema.sql`](supabase/schema.sql). Il crée les tables, la fonction de limitation des connexions et le bucket public `product-images`. Le script peut être rejoué.
2. Importer le dépôt `kJean-Jaures/JauresMarket` dans Vercel. Choisir le preset **Other**, garder la racine du dépôt, utiliser Node.js **24.x** et laisser les commandes de `vercel.json` s’appliquer. Le dossier statique est `public`, les routes API utilisent `api/index.js`.
   Dans **Settings → Build and Deployment**, le **Root Directory** doit être la racine du dépôt (champ vide ou `.`), jamais `public`. **Output Directory** doit être `public`. Ne pas définir `app.js` comme point d’entrée serveur : `public/app.js` est exécuté uniquement par le navigateur. `vercel.json` impose le preset Other avec `framework: null`.

3. Dans les variables d’environnement du projet Vercel, renseigner :

| Variable | Valeur à renseigner |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS du projet Supabase, par exemple `https://PROJECT_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur `service_role` du projet Supabase |
| `ADMIN_PASSWORD` | Mot de passe administrateur personnel, d’au moins 16 caractères |

4. Déployer la branche `main`. Ouvrir la boutique et `/admin`, se connecter, puis ajouter un vrai article avec une photo. Vérifier sa présence dans le catalogue et le panier, puis l’ouverture du message WhatsApp. Après redéploiement, vérifier que l’article est toujours présent. Tester aussi la déconnexion.

Ces variables sont réservées au serveur. Ne jamais placer la clé `service_role` dans `public/`, le code, un commit ou une conversation. Les cookies sont automatiquement sécurisés en mode Supabase/Vercel. Le navigateur accède à l’administration par l’API du site ; les tables ne sont pas accessibles aux rôles Supabase anonymes ou authentifiés. Aucune inscription publique Supabase Auth n’est nécessaire.

Sans configuration complète, l’API Vercel répond 503 au lieu d’écrire dans un stockage temporaire. Pour tester Supabase en local, copier `.env.example` vers `.env` et y renseigner les valeurs privées. Ne pas utiliser un projet de production pour les tests de développement. Le catalogue local SQLite n’est pas transféré automatiquement vers Supabase.

Les comptes, les offres et leurs limites restent à vérifier auprès des hébergeurs. Configurer les sauvegardes de la base et des photos. Les anciennes photos restent dans le bucket après modification ou suppression d’un article : elles peuvent être nettoyées dans Supabase après vérification qu’aucun article ne les utilise. Le bucket est public : y charger uniquement des photos destinées à être visibles, y compris si l’article est ensuite masqué.

## Utilisation

Ajouter les vrais articles dans `/admin`. Photos JPG, PNG ou WebP jusqu’à **2 Mo**. Les tailles et couleurs sont séparées par des virgules. Le stock est commun aux variantes d’un article. Un article masqué disparaît du catalogue ; un article épuisé reste visible.

Le panier est conservé dans le navigateur. La commande ouvre un message WhatsApp avec les articles, variantes, quantités et total. Le client doit envoyer le message. Aucun paiement, réservation ou suivi de commande n’est effectué sur le site : disponibilité, paiement et livraison sont confirmés avec la boutique.

Le numéro de discussion provient de l’ancienne affiche : `+225 05 74 76 38 73`. Le lien catalogue fourni est conservé tel quel : `https://wa.me/c/22574763873`. TikTok : `https://www.tiktok.com/@jaures_market`. Vérifier les destinations avant ouverture publique.

Les visuels de campagne sont illustratifs. Aucun faux produit ou prix n’est ajouté. Les informations légales et conditions de vente propres à la boutique restent à compléter avant ouverture publique.

## Tests

```sh
npm test
```

Les tests vérifient le cycle des articles, les permissions, la persistance et la révocation des sessions, la limitation des connexions et le point d’entrée Vercel. L’adaptateur Supabase est testé avec des réponses HTTP simulées ; ces tests ne valident pas un projet Supabase distant ni un déploiement Vercel réel.

## Dépannage Vercel

Si les logs affichent `ReferenceError: document is not defined` dans `/var/task/app.js`, Vercel exécute le script du navigateur comme une fonction serveur. Vérifier le dépôt et la branche `main`, choisir **Other** comme Framework Preset, remettre **Root Directory** à la racine du dépôt et **Output Directory** à `public`, puis redéployer le dernier commit sans réutiliser le cache de build. Le seul point d’entrée des fonctions est `api/index.js`.

Après redéploiement, `/` doit renvoyer la page HTML, `/app.js` du JavaScript statique et `/api/products` une réponse JSON. Si les variables Supabase manquent, l’API renvoie 503 avec un message de configuration ; cela ne doit pas empêcher l’affichage de la page d’accueil.
