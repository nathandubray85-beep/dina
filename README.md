# Dina — version en ligne

Cette version est préparée pour être déployée comme application web Express sur Render avec PostgreSQL.

## Ce que cette version fait
- création de comptes et connexion
- sessions persistantes côté serveur
- fil d’actualité
- publications texte + photo
- likes
- commentaires
- profil
- interface responsive téléphone / tablette / PC
- PostgreSQL pour les comptes, posts, likes et commentaires
- `render.yaml` pour faciliter le déploiement

## Déploiement Render
1. Mets ce dossier dans un dépôt GitHub.
2. Sur Render : New > Blueprint et choisis le dépôt.
3. Render détecte `render.yaml`, crée le service web et la base PostgreSQL.
4. Attends la fin du déploiement puis ouvre l’URL `https://...onrender.com`.

Important : le plan gratuit de Render est adapté pour tester. Les services gratuits peuvent s’arrêter après une période d’inactivité et la base PostgreSQL gratuite a actuellement une durée limitée. Pour conserver Dina durablement, passe à un stockage/base de données payant avant l’expiration de l’offre gratuite.

## Lancer sur ton PC
Installe Node.js puis, dans ce dossier :
`npm install`
`npm start`

Pour le local, il faut aussi fournir `DATABASE_URL` vers une base PostgreSQL.
