# JAURESMARKET

Site de la boutique JAURESMARKET en Côte d’Ivoire : catalogue, recherche, filtres, panier et commande sur WhatsApp. Un espace d’administration permet d’ajouter, modifier, masquer et supprimer les articles avec photo, prix, stock, tailles, couleurs et description.

## Stack

Node.js 24 ou supérieur, SQLite intégré à Node.js, HTML, CSS et JavaScript. Aucune dépendance externe.

## Installation

Vérifier que Node.js 24 ou supérieur est installé, puis lancer depuis le dépôt :

```sh
npm start
```

Le site est disponible sur le port 3000. L’administration se trouve à `/admin`. Au premier démarrage, un mot de passe aléatoire est enregistré dans `.data/admin-password` (fichier privé, non suivi par Git). Il est également possible de fournir son propre mot de passe avec la variable `ADMIN_PASSWORD` avant le démarrage. Ne pas publier ce fichier ni transmettre le mot de passe dans le dépôt.

Variables facultatives : `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (dossier `.data` du dépôt), `COOKIE_SECURE=true` derrière HTTPS. Un redémarrage déconnecte les sessions administrateur.

## Utilisation

Se connecter à `/admin` et ajouter les vrais articles. Les photos acceptées sont JPG, PNG et WebP, jusqu’à 6 Mo. Les tailles et couleurs sont séparées par des virgules. Le stock est commun à toutes les variantes d’un article. Un article masqué disparaît du catalogue ; un article épuisé reste visible.

Le panier est conservé dans le navigateur. La commande ouvre un message WhatsApp contenant les articles, les variantes, les quantités et le total. Le client doit envoyer ce message ; aucun paiement, réservation ou suivi de commande n’est effectué sur le site. La disponibilité et la livraison sont confirmées par échange avec la boutique.

Le lien de discussion utilise le numéro complet de l’ancienne affiche (`+225 05 74 76 38 73`). Le lien catalogue fourni (`https://wa.me/c/22574763873`) est conservé tel quel. Vérifier ces destinations avant ouverture publique. Le lien TikTok est `https://www.tiktok.com/@jaures_market`.

Les images de campagne sont illustratives. Aucun produit ni prix de démonstration n’est ajouté. Les données et photos sont enregistrées dans `.data/shop.sqlite` : conserver ce dossier sur un disque persistant et le sauvegarder. Ne pas copier le fichier SQLite à chaud sans mécanisme de sauvegarde SQLite.

Pour une mise en ligne : utiliser HTTPS, activer `COOKIE_SECURE=true`, configurer un mot de passe solide et prévoir la sauvegarde de la base. Les pages légales et les conditions de vente propres à la boutique restent à renseigner avant ouverture publique.

## Tests

```sh
npm test
```

Les tests utilisent une base temporaire et vérifient la protection de l’administration ainsi que le cycle de gestion des articles.
