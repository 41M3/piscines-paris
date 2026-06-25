# 🏊 Piscines de Paris

Site web **statique** pour trouver la piscine municipale parisienne idéale selon
les **horaires**, le **tarif**, l'**accessibilité** et les **transports** à proximité.

Les données sont récupérées **en direct depuis les APIs publiques** au chargement de
la page (aucun serveur, aucune base de données, aucune étape de build).

## Fonctionnalités

- 🗺️ **Carte interactive** (Leaflet/OpenStreetMap) avec marqueurs colorés
  (ouvert / fermé / horaires inconnus).
- 🔎 **Filtres** :
  - **Ouverture** : « ouvert maintenant » ou sur un **créneau** (jour + plage
    ouverture→fermeture). Une piscine est retenue dès qu'elle est ouverte **à un
    moment** du créneau, même si elle ferme entre midi et deux puis rouvre.
  - **Tarif** : **slider de prix max** (tarif d'entrée plein tarif par piscine).
  - **Arrondissement** (multi-sélection).
  - **Ligne de transport** proche (métro, RER, tram, bus) et **distance de marche max.**
  - **Accessibilité PMR**.
  - Recherche par nom / adresse, et tri (nom, arrondissement, proximité d'un arrêt).
- 📋 **Fiche détaillée** : horaires de la semaine, tarifs, accessibilité, lignes
  proches et lien vers la page officielle paris.fr.

## Sources de données

| Donnée | Source | Dataset |
|---|---|---|
| Piscines, accessibilité, coordonnées, lien officiel | [opendata.paris.fr](https://opendata.paris.fr) | `lieux-municipaux` |
| Horaires par jour, payant | [opendata.paris.fr](https://opendata.paris.fr) | `ilots-de-fraicheur-equipements-activites` |
| Lignes de transport proches | [Île-de-France Mobilités](https://data.iledefrance-mobilites.fr) | `arrets-lignes` |
| Tarifs par piscine (plein / réduit) | pages [paris.fr](https://www.paris.fr) (scraping) | `data/tarifs.json` |

Données sous licence ODbL (Ville de Paris / IDFM). Tarifs **indicatifs**, extraits
des pages paris.fr. Site **non officiel**.

### Pourquoi les tarifs sont dans un fichier généré

Aucun jeu de données ouvert ne fournit le tarif **par piscine**, et `paris.fr`
n'autorise pas la récupération directe depuis un navigateur (pas d'en-tête CORS).
Le script [`scripts/scrape-tarifs.mjs`](scripts/scrape-tarifs.mjs) extrait donc le
plein tarif / tarif réduit « entrée à l'unité » de chaque page paris.fr **côté
serveur** et écrit [`data/tarifs.json`](data/tarifs.json), que le site charge en
statique. C'est le seul élément non récupéré « en direct ».

## Lancer en local

Le site utilise des modules ES (`import`/`export`) ; il faut donc le servir via HTTP
(et non l'ouvrir en `file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Héberger sur GitHub Pages

1. Créez un dépôt GitHub et poussez ces fichiers sur la branche `main`.
2. Dans **Settings → Pages → Build and deployment**, choisissez **GitHub Actions**
   comme source.
3. Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publie
   automatiquement le site à chaque push sur `main` (ou via « Run workflow »).

> Variante sans Actions : *Settings → Pages → Deploy from a branch → `main` / root*.
> Le fichier `.nojekyll` garantit que le dossier `js/` est servi tel quel.

## Mettre à jour les tarifs

```bash
node scripts/scrape-tarifs.mjs   # régénère data/tarifs.json
```

- Les piscines hors grille municipale (ex. **Berlioux**, **Pontoise**) sont gérées
  via la table `EXCEPTIONS` en haut du script.
- Le tarif municipal par défaut (si une page n'expose pas de tarif lisible) est
  `DEFAUT` dans le même script (actuellement **3,50 € / 2,00 €**).
- En ligne, le workflow [`.github/workflows/update-tarifs.yml`](.github/workflows/update-tarifs.yml)
  relance le scraper chaque semaine et commite `data/tarifs.json` s'il a changé.
- Le texte des conditions de tarif réduit est dans l'objet `TARIFS` de
  [`js/config.js`](js/config.js).

## Structure du projet

```
index.html              Page unique
css/style.css           Styles
js/config.js            Endpoints API, TARIFS éditables, constantes
js/schedule.js          Parsing des horaires + « ouvert à »
js/api.js               Fetch + fusion des datasets + transports + cache
js/filters.js           Logique de filtrage / tri
js/map.js               Carte Leaflet
js/app.js               Orchestration, rendu, événements
data/tarifs.json        Tarifs par piscine (généré par le scraper)
scripts/scrape-tarifs.mjs   Scraper des tarifs paris.fr (Node, côté serveur)
.github/workflows/      Déploiement Pages + mise à jour hebdo des tarifs
```

## Limites connues

- Le site dépend de la **disponibilité des APIs publiques** (récupération à la volée).
  Les transports sont mis en cache 24 h dans le navigateur (`localStorage`).
- Les horaires reflètent la **période de validité** publiée par la Ville de Paris
  (affichée dans chaque fiche) ; ils peuvent changer lors des vacances scolaires ou
  fermetures techniques.
- Certaines piscines peuvent n'apparaître que dans un seul dataset : leurs informations
  (horaires ou métadonnées) sont alors partielles.
