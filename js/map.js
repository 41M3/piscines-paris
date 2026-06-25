// =============================================================================
//  Carte Leaflet : marqueurs des piscines, couleur ouvert/fermé, synchro liste.
// =============================================================================

import { CONFIG } from './config.js';
import { isOpenNow } from './schedule.js';

let map = null;
let markers = new Map(); // id piscine → marker
let onSelect = null;

function colorFor(pool) {
  if (pool.horaires.aucun) return '#9e9e9e'; // horaires inconnus
  return isOpenNow(pool.horaires) ? '#2e7d32' : '#c62828'; // ouvert / fermé
}

function makeIcon(color) {
  return L.divIcon({
    className: 'pool-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Initialise la carte. selectCb(poolId) est appelé au clic d'un marqueur. */
export function initMap(selectCb) {
  onSelect = selectCb;
  map = L.map('map').setView(CONFIG.map.center, CONFIG.map.zoom);
  L.tileLayer(CONFIG.map.tileUrl, {
    attribution: CONFIG.map.tileAttribution,
    maxZoom: 19,
  }).addTo(map);
}

/** (Re)dessine les marqueurs pour la liste de piscines filtrée. */
export function renderMarkers(pools) {
  markers.forEach((m) => map.removeLayer(m));
  markers.clear();

  const bounds = [];
  for (const p of pools) {
    if (p.lat == null || p.lon == null) continue;
    const marker = L.marker([p.lat, p.lon], { icon: makeIcon(colorFor(p)) }).addTo(map);
    marker.bindPopup(
      `<strong>${escapeHtml(p.nom)}</strong><br>${escapeHtml(p.adresse)}<br>` +
        `<a href="#" data-pool="${escapeAttr(p.id)}" class="popup-link">Voir la fiche →</a>`
    );
    marker.on('popupopen', (e) => {
      const link = e.popup.getElement().querySelector('.popup-link');
      if (link)
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          onSelect && onSelect(p.id);
        });
    });
    markers.set(p.id, marker);
    bounds.push([p.lat, p.lon]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
}

/** Centre la carte sur une piscine et ouvre sa popup. */
export function focusPool(id) {
  const m = markers.get(id);
  if (!m) return;
  map.setView(m.getLatLng(), 15, { animate: true });
  m.openPopup();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
