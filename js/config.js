// =============================================================================
//  Configuration de l'application « Piscines Paris »
//  Toutes les constantes ajustables sont regroupées ici.
// =============================================================================

export const CONFIG = {
  // --- APIs publiques (Opendatasoft Explore API v2.1, CORS activé) ----------
  api: {
    // 1) Piscines : métadonnées, accessibilité, coordonnées, lien paris.fr
    pools:
      'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/lieux-municipaux/records' +
      '?where=' + encodeURIComponent('search("piscine")') + '&limit=100',

    // 2) Horaires par jour + payant
    schedules:
      'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/' +
      'ilots-de-fraicheur-equipements-activites/records' +
      '?where=' + encodeURIComponent('type="Piscine"') + '&limit=100',

    // 3) Lignes de transport proches (requête géo par piscine).
    //    La clause `where` (avec les coordonnées) est construite et encodée
    //    dans api.js → fetchTransportsFor().
    transportBase:
      'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/' +
      'arrets-lignes/records?where={WHERE}&limit=100',
  },

  // Rayon de recherche des arrêts de transport autour d'une piscine (mètres)
  transportRadius: 500,

  // Durée de mise en cache des données transport dans localStorage (heures)
  transportCacheHours: 24,

  // Distance max (m) en dessous de laquelle deux enregistrements sont
  // considérés comme la même piscine lors de la fusion des deux datasets.
  mergeDistanceMeters: 200,

  // Carte
  map: {
    center: [48.8566, 2.3522],
    zoom: 12,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

// =============================================================================
//  TARIFS — Tarifs des piscines municipales de Paris.
//  ⚠️  À METTRE À JOUR ICI si la Ville de Paris modifie sa grille tarifaire.
//      Les tarifs sont uniformes pour l'ensemble des piscines municipales.
//      Source : https://www.paris.fr/ (rubrique Piscines)
// =============================================================================

// Les tarifs PAR PISCINE (plein / réduit) sont extraits des pages paris.fr par
// scripts/scrape-tarifs.mjs → data/tarifs.json, puis affichés dans chaque fiche.
// Cet objet ne contient plus que les métadonnées d'affichage et les conditions.
export const TARIFS = {
  miseAJour: '2026',
  devise: '€',
  // Conditions de gratuité / tarif réduit (affiché dans la fiche)
  conditions:
    'Tarif réduit (*) : moins de 26 ans, plus de 60 ans, demandeurs d\'emploi, ' +
    'bénéficiaires de minima sociaux, familles nombreuses, personnes en situation ' +
    'de handicap. Gratuité pour les moins de 4 ans et via le Paris Pass Familles. ' +
    'Tarifs indicatifs — vérifiez sur la page de la piscine.',
};

// Libellés et couleurs des modes de transport IDFM
export const TRANSPORT_MODES = {
  Metro: { label: 'Métro', color: '#0064b0' },
  RapidTransit: { label: 'RER', color: '#e2231a' },
  Tramway: { label: 'Tram', color: '#cf009e' },
  LocalTrain: { label: 'Train', color: '#5e5e5e' },
  RegionalRail: { label: 'Train', color: '#5e5e5e' },
  Bus: { label: 'Bus', color: '#4caf50' },
};

export const JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

// JS getDay() : 0 = dimanche … 6 = samedi → index dans JOURS (0 = lundi)
export const JS_DAY_TO_INDEX = [6, 0, 1, 2, 3, 4, 5];
