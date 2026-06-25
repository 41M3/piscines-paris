// =============================================================================
//  Parsing et interrogation des horaires d'ouverture.
//  Les horaires viennent du dataset opendata sous forme de chaînes par jour :
//    "07h00 - 08h30 / 11h30 - 13h30 / 16h30 - 18h00"   (plusieurs créneaux)
//    "-", "Fermé", "Non renseigné"                      (fermé / inconnu)
// =============================================================================

import { JOURS, JS_DAY_TO_INDEX } from './config.js';

/** Convertit "07h30" → 450 (minutes depuis minuit). Renvoie null si invalide. */
function parseHeure(str) {
  const m = str.trim().match(/^(\d{1,2})\s*h\s*(\d{0,2})$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/**
 * Parse une chaîne d'horaires d'un jour en liste de créneaux {start, end}
 * (minutes). Renvoie [] pour les jours fermés ou non renseignés.
 */
export function parseJour(raw) {
  if (!raw) return [];
  const s = raw.trim();
  if (s === '' || s === '-' || /ferm/i.test(s) || /non renseign/i.test(s)) return [];

  const creneaux = [];
  for (const part of s.split('/')) {
    const m = part.split('-');
    if (m.length !== 2) continue;
    const start = parseHeure(m[0]);
    const end = parseHeure(m[1]);
    if (start !== null && end !== null && end > start) {
      creneaux.push({ start, end });
    }
  }
  return creneaux;
}

/**
 * Construit l'objet horaires structuré d'une piscine à partir du record ilots.
 * Renvoie { lundi: [...], ..., dimanche: [...], aucun: bool, periode: string }.
 */
export function buildHoraires(record) {
  const horaires = {};
  let total = 0;
  for (const jour of JOURS) {
    const creneaux = parseJour(record ? record['horaires_' + jour] : null);
    horaires[jour] = creneaux;
    total += creneaux.length;
  }
  horaires.aucun = total === 0;
  horaires.periode = record ? record.horaires_periode || null : null;
  return horaires;
}

/** La piscine est-elle ouverte le jour `jourIndex` (0=lundi) à `minutes` ? */
export function isOpenAt(horaires, jourIndex, minutes) {
  if (!horaires) return false;
  const creneaux = horaires[JOURS[jourIndex]] || [];
  return creneaux.some((c) => minutes >= c.start && minutes < c.end);
}

/**
 * La piscine est-elle ouverte le jour `jourIndex` **à un moment** de la plage
 * [start, end] (minutes) ? Vrai dès qu'un créneau chevauche l'intervalle —
 * ainsi une piscine qui ferme à midi puis rouvre est trouvée si l'un de ses
 * créneaux recoupe le créneau demandé. Si end <= start, on teste l'instant.
 */
export function isOpenDuring(horaires, jourIndex, start, end) {
  if (!horaires) return false;
  if (end <= start) return isOpenAt(horaires, jourIndex, start);
  const creneaux = horaires[JOURS[jourIndex]] || [];
  return creneaux.some((c) => c.start < end && c.end > start);
}

/** Ouverte « maintenant » ? (utilise la date/heure locale du navigateur) */
export function isOpenNow(horaires, now = new Date()) {
  const jourIndex = JS_DAY_TO_INDEX[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return isOpenAt(horaires, jourIndex, minutes);
}

/** "450" → "07h30" pour l'affichage. */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, '0') + 'h' + String(m).padStart(2, '0');
}

/** Représentation texte des créneaux d'un jour : "07h00–13h45 · 16h30–19h00". */
export function formatJour(creneaux) {
  if (!creneaux || creneaux.length === 0) return 'Fermé';
  return creneaux
    .map((c) => formatMinutes(c.start) + '–' + formatMinutes(c.end))
    .join(' · ');
}
