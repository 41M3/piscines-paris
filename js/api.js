// =============================================================================
//  Accès aux données : récupération des APIs publiques (côté navigateur),
//  fusion des deux datasets piscines, et chargement des transports proches.
// =============================================================================

import { CONFIG, TRANSPORT_MODES } from './config.js';
import { buildHoraires } from './schedule.js';

// Tarif municipal standard, utilisé si tarifs.json est absent ou incomplet.
const DEFAUT_TARIF = { plein: 3.5, reduit: 2.0 };

/** Distance haversine en mètres entre deux points {lat, lon}. */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Normalise un nom pour le rapprochement ("Piscine Émile-Anthoine" → "emile anthoine"). */
function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/piscine|espace sportif|centre sportif/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Parse le champ accessibility (JSON string) → { pmr: bool|null, info: string }. */
function parseAccessibility(raw) {
  if (!raw) return { pmr: null, info: '' };
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    let pmr = null;
    for (const h of data.handicaps || []) {
      if (/mobilit/i.test(h.name)) {
        if (h.status === 'accessible') pmr = true;
        else if (h.status === 'non_accessible') pmr = false;
      }
    }
    const info = (data.additional_info || '').replace(/<[^>]+>/g, ' ').trim();
    return { pmr, info };
  } catch {
    return { pmr: null, info: '' };
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' sur ' + url);
  return res.json();
}

/**
 * Récupère et fusionne les deux datasets en une liste unifiée de piscines.
 * Chaque piscine : { id, nom, adresse, arrondissement, cp, lat, lon, phone,
 *   url, photo, pmr, accessInfo, payant, horaires, transports:null }
 */
export async function loadPools() {
  const [poolsData, schedData, tarifs] = await Promise.all([
    fetchJSON(CONFIG.api.pools),
    fetchJSON(CONFIG.api.schedules),
    // tarifs.json est généré par scripts/scrape-tarifs.mjs ; absent au pire → défaut.
    fetchJSON('data/tarifs.json').catch(() => ({ piscines: {} })),
  ]);
  const tarifMap = tarifs.piscines || {};

  /** Tarif d'une piscine : plein/réduit issus de tarifs.json, sinon défaut. */
  function tarifFor(id, payant) {
    if (!payant) return { plein: 0, reduit: 0, source: null };
    const t = tarifMap[id];
    return {
      plein: t && t.plein != null ? t.plein : DEFAUT_TARIF.plein,
      reduit: t && t.reduit != null ? t.reduit : DEFAUT_TARIF.reduit,
      source: t ? t.source : null,
    };
  }

  // Index des horaires par nom normalisé + liste pour fallback géographique.
  const scheds = schedData.results.map((r) => ({
    record: r,
    norm: normName(r.nom),
    lat: r.geo_point_2d ? r.geo_point_2d.lat : null,
    lon: r.geo_point_2d ? r.geo_point_2d.lon : null,
    used: false,
  }));

  function matchSchedule(pool) {
    const n = normName(pool.name);
    // 1) match exact par nom
    let best = scheds.find((s) => !s.used && s.norm === n);
    // 2) sinon, plus proche géographiquement sous le seuil
    if (!best && pool.latitude && pool.longitude) {
      let bestDist = CONFIG.mergeDistanceMeters;
      for (const s of scheds) {
        if (s.used || s.lat == null) continue;
        const d = haversine(pool.latitude, pool.longitude, s.lat, s.lon);
        if (d <= bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }
    if (best) best.used = true;
    return best ? best.record : null;
  }

  const pools = poolsData.results.map((p) => {
    const sched = matchSchedule(p);
    const access = parseAccessibility(p.accessibility);
    const cp = p.address_postcode || (sched ? sched.arrondissement : '') || '';
    const payant = sched ? /oui/i.test(sched.payant || '') : true;
    const tarif = tarifFor(p.id || p.url, payant);
    return {
      id: p.id || p.url,
      nom: p.name,
      adresse: p.address_street || (sched ? sched.adresse : ''),
      cp,
      arrondissement: arrFromCP(cp),
      lat: p.latitude || (sched && sched.geo_point_2d ? sched.geo_point_2d.lat : null),
      lon: p.longitude || (sched && sched.geo_point_2d ? sched.geo_point_2d.lon : null),
      phone: p.phone || '',
      url: p.url || '',
      photo: p.photo_url || '',
      pmr: access.pmr,
      accessInfo: access.info,
      payant,
      prix: tarif.plein,
      prixReduit: tarif.reduit,
      tarifSource: tarif.source,
      horaires: buildHoraires(sched),
      hasSchedule: !!sched,
      transports: null, // chargé plus tard
    };
  });

  // Piscines présentes uniquement dans le dataset horaires (non rapprochées).
  for (const s of scheds) {
    if (s.used || s.lat == null) continue;
    const cp = s.record.arrondissement || '';
    const payantS = /oui/i.test(s.record.payant || '');
    const tarifS = tarifFor('sched-' + s.record.identifiant, payantS);
    pools.push({
      id: 'sched-' + s.record.identifiant,
      nom: s.record.nom,
      adresse: s.record.adresse || '',
      cp,
      arrondissement: arrFromCP(cp),
      lat: s.lat,
      lon: s.lon,
      phone: '',
      url: '',
      photo: '',
      pmr: null,
      accessInfo: '',
      payant: payantS,
      prix: tarifS.plein,
      prixReduit: tarifS.reduit,
      tarifSource: tarifS.source,
      horaires: buildHoraires(s.record),
      hasSchedule: true,
      transports: null,
    });
  }

  return pools;
}

/** "75014" → 14 (numéro d'arrondissement). 0 si inconnu. */
export function arrFromCP(cp) {
  const m = String(cp || '').match(/^750?(\d{1,2})$/);
  return m ? parseInt(m[1], 10) : 0;
}

// --- Transports --------------------------------------------------------------

const CACHE_KEY = 'piscines_transports_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const ageH = (Date.now() - obj.ts) / 3600000;
    if (ageH > CONFIG.transportCacheHours) return null;
    return obj.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota / mode privé : on ignore */
  }
}

/** Récupère les lignes proches d'une piscine, dédoublonnées et triées par distance. */
async function fetchTransportsFor(pool) {
  if (pool.lat == null || pool.lon == null) return [];
  const where =
    "within_distance(pointgeo, geom'POINT(" +
    pool.lon +
    ' ' +
    pool.lat +
    ")', " +
    CONFIG.transportRadius +
    'm)';
  const url = CONFIG.api.transportBase.replace('{WHERE}', encodeURIComponent(where));
  let data;
  try {
    data = await fetchJSON(url);
  } catch {
    return [];
  }
  const byLine = new Map(); // clé mode|shortname → {mode,line,stop,dist}
  for (const r of data.results) {
    const slat = parseFloat(r.stop_lat);
    const slon = parseFloat(r.stop_lon);
    const dist =
      Number.isFinite(slat) && Number.isFinite(slon)
        ? haversine(pool.lat, pool.lon, slat, slon)
        : CONFIG.transportRadius;
    const key = r.mode + '|' + r.shortname;
    const prev = byLine.get(key);
    if (!prev || dist < prev.dist) {
      byLine.set(key, {
        mode: r.mode,
        modeLabel: (TRANSPORT_MODES[r.mode] || {}).label || r.mode,
        line: r.shortname || r.route_long_name || '?',
        stop: r.stop_name,
        dist,
      });
    }
  }
  return [...byLine.values()].sort((a, b) => a.dist - b.dist);
}

/**
 * Charge les transports pour toutes les piscines (en parallèle, par lots),
 * met à jour `pool.transports` et appelle onProgress(done, total).
 * Utilise le cache localStorage.
 */
export async function loadTransports(pools, onProgress) {
  const cache = readCache();
  if (cache) {
    for (const p of pools) p.transports = cache[p.id] || [];
    onProgress && onProgress(pools.length, pools.length);
    return;
  }

  let done = 0;
  const result = {};
  const BATCH = 6; // limite la charge sur l'API IDFM
  for (let i = 0; i < pools.length; i += BATCH) {
    const batch = pools.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (p) => {
        p.transports = await fetchTransportsFor(p);
        result[p.id] = p.transports;
        done += 1;
        onProgress && onProgress(done, pools.length);
      })
    );
  }
  writeCache(result);
}
