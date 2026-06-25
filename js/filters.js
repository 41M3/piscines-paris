// =============================================================================
//  Logique de filtrage et de tri des piscines.
// =============================================================================

import { isOpenDuring } from './schedule.js';

/**
 * État de filtre par défaut.
 *  - arrondissements : Set de numéros (vide = tous)
 *  - prixMax : prix d'entrée max en € (null = illimité)
 *  - moment : null | { jour: index 0-6, start, end } (ouvert sur toute la plage)
 *  - ligne : '' (toutes) ou "mode|line"
 *  - distMax : distance de marche max (m) jusqu'à un arrêt, ou null
 *  - pmr : bool (true = uniquement accessibles PMR)
 *  - texte : recherche par nom
 */
export function defaultFilters() {
  return {
    arrondissements: new Set(),
    prixMax: null,
    moment: null,
    ligne: '',
    distMax: null,
    pmr: false,
    texte: '',
    tri: 'nom',
  };
}

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Applique les filtres à la liste de piscines → nouvelle liste filtrée. */
export function applyFilters(pools, f) {
  let out = pools.filter((p) => {
    if (f.arrondissements.size && !f.arrondissements.has(p.arrondissement)) return false;

    if (f.prixMax != null && p.prix > f.prixMax) return false;

    if (f.moment && !isOpenDuring(p.horaires, f.moment.jour, f.moment.start, f.moment.end))
      return false;

    if (f.pmr && p.pmr !== true) return false;

    if (f.texte) {
      const t = norm(f.texte);
      if (!norm(p.nom).includes(t) && !norm(p.adresse).includes(t)) return false;
    }

    // Filtres transport (seulement si les transports sont chargés)
    if (f.ligne && p.transports) {
      const has = p.transports.some((t) => t.mode + '|' + t.line === f.ligne);
      if (!has) return false;
    }
    if (f.distMax != null && p.transports) {
      const nearest = p.transports.length ? p.transports[0].dist : Infinity;
      if (nearest > f.distMax) return false;
    }

    return true;
  });

  out.sort(comparators[f.tri] || comparators.nom);
  return out;
}

const comparators = {
  nom: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
  arrondissement: (a, b) =>
    a.arrondissement - b.arrondissement || a.nom.localeCompare(b.nom, 'fr'),
  transport: (a, b) => {
    const da = a.transports && a.transports.length ? a.transports[0].dist : Infinity;
    const db = b.transports && b.transports.length ? b.transports[0].dist : Infinity;
    return da - db;
  },
};

/** Liste triée et dédoublonnée des lignes présentes (pour le menu déroulant). */
export function availableLines(pools) {
  const map = new Map();
  for (const p of pools) {
    for (const t of p.transports || []) {
      const key = t.mode + '|' + t.line;
      if (!map.has(key)) map.set(key, { key, mode: t.mode, modeLabel: t.modeLabel, line: t.line });
    }
  }
  const order = { Metro: 0, RapidTransit: 1, Tramway: 2, LocalTrain: 3, Bus: 4 };
  return [...map.values()].sort(
    (a, b) =>
      (order[a.mode] ?? 9) - (order[b.mode] ?? 9) ||
      a.line.localeCompare(b.line, 'fr', { numeric: true })
  );
}
