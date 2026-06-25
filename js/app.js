// =============================================================================
//  Orchestration : chargement des données, rendu de la liste/des fiches,
//  câblage des filtres et de la carte.
// =============================================================================

import { TARIFS, JOURS, JS_DAY_TO_INDEX, TRANSPORT_MODES } from './config.js';
import { loadPools, loadTransports, arrFromCP } from './api.js';
import { applyFilters, defaultFilters, availableLines } from './filters.js';
import { isOpenNow, formatJour, formatMinutes } from './schedule.js';
import { initMap, renderMarkers, focusPool } from './map.js';

let pools = [];
let filters = defaultFilters();

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

// --- Utilitaires d'affichage -------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function lineBadge(t) {
  const c = (TRANSPORT_MODES[t.mode] || {}).color || '#555';
  return `<span class="line-badge" style="background:${c}" title="${escapeHtml(
    t.modeLabel
  )} – arrêt ${escapeHtml(t.stop)} (${t.dist} m)">${escapeHtml(t.modeLabel)} ${escapeHtml(
    t.line
  )}</span>`;
}

function statusBadge(pool) {
  if (pool.horaires.aucun)
    return '<span class="status status-unknown">Horaires non renseignés</span>';
  return isOpenNow(pool.horaires)
    ? '<span class="status status-open">Ouvert maintenant</span>'
    : '<span class="status status-closed">Fermé maintenant</span>';
}

// --- Rendu de la liste -------------------------------------------------------

function render() {
  const filtered = applyFilters(pools, filters);
  el('count').textContent =
    filtered.length + ' piscine' + (filtered.length > 1 ? 's' : '');

  const list = el('list');
  list.innerHTML = '';
  for (const p of filtered) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = p.id;
    const transports =
      p.transports == null
        ? '<span class="muted">chargement transports…</span>'
        : p.transports.length
        ? p.transports.slice(0, 5).map(lineBadge).join(' ')
        : '<span class="muted">aucune ligne à proximité</span>';
    card.innerHTML = `
      <div class="card-head">
        <h3>${escapeHtml(p.nom)}</h3>
        ${statusBadge(p)}
      </div>
      <p class="addr">${escapeHtml(p.adresse)} · ${escapeHtml(p.cp)}</p>
      <div class="badges">
        <span class="tag ${p.payant ? 'tag-pay' : 'tag-free'}">${
      p.payant ? p.prix.toFixed(2).replace('.', ',') + ' €' : 'Gratuit'
    }</span>
        ${
          p.pmr === true
            ? '<span class="tag tag-pmr">♿ Accessible PMR</span>'
            : p.pmr === false
            ? '<span class="tag tag-nopmr">Non accessible PMR</span>'
            : ''
        }
      </div>
      <div class="transports">${transports}</div>
    `;
    card.addEventListener('click', () => openDetail(p.id));
    list.appendChild(card);
  }

  renderMarkers(filtered);
}

// --- Fiche détaillée ---------------------------------------------------------

function openDetail(id) {
  const p = pools.find((x) => x.id === id);
  if (!p) return;
  focusPool(id);

  const horaires = JOURS.map((j) => {
    const today = JOURS[JS_DAY_TO_INDEX[new Date().getDay()]] === j;
    return `<tr class="${today ? 'today' : ''}"><th>${j[0].toUpperCase() + j.slice(1)}</th>
      <td>${escapeHtml(formatJour(p.horaires[j]))}</td></tr>`;
  }).join('');

  const transports =
    p.transports && p.transports.length
      ? p.transports.map((t) => `${lineBadge(t)} <span class="muted">(${t.dist} m)</span>`).join(' ')
      : p.transports == null
      ? 'Chargement…'
      : 'Aucune ligne à proximité.';

  const euro = (v) =>
    v === 0 || v == null ? 'Gratuit' : v.toFixed(2).replace('.', ',') + ' €';
  const tarifs =
    `<tr><td>Entrée à l'unité — plein tarif</td><td>${euro(p.prix)}</td></tr>` +
    (p.prixReduit != null
      ? `<tr><td>Entrée à l'unité — tarif réduit *</td><td>${euro(p.prixReduit)}</td></tr>`
      : '');

  el('detail-content').innerHTML = `
    <button id="detail-close" aria-label="Fermer">×</button>
    ${p.photo ? `<img class="detail-photo" src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.nom)}">` : ''}
    <h2>${escapeHtml(p.nom)}</h2>
    <p class="addr">${escapeHtml(p.adresse)} · ${escapeHtml(p.cp)} Paris${
    p.phone ? ' · ☎ ' + escapeHtml(formatPhone(p.phone)) : ''
  }</p>
    <p>${statusBadge(p)} <span class="tag ${p.payant ? 'tag-pay' : 'tag-free'}">${
    p.payant ? 'Payant' : 'Gratuit'
  }</span></p>

    <h3>Horaires de la semaine</h3>
    ${p.horaires.periode ? `<p class="muted">Période : ${escapeHtml(p.horaires.periode)}</p>` : ''}
    <table class="sched">${horaires}</table>

    <h3>Transports à proximité</h3>
    <p class="transports">${transports}</p>

    <h3>Tarifs ${escapeHtml(TARIFS.miseAJour)}</h3>
    <table class="tarifs">${tarifs}</table>
    <p class="muted small">${escapeHtml(TARIFS.conditions)}</p>
    ${
      p.tarifSource
        ? `<p class="small"><a href="${escapeHtml(p.tarifSource)}" target="_blank" rel="noopener">Voir tous les tarifs →</a></p>`
        : ''
    }

    <h3>Accessibilité</h3>
    <p>${
      p.pmr === true
        ? '♿ Accessible aux personnes à mobilité réduite.'
        : p.pmr === false
        ? 'Non accessible aux personnes à mobilité réduite.'
        : 'Information non renseignée.'
    }</p>
    ${p.accessInfo ? `<p class="muted small">${escapeHtml(p.accessInfo)}</p>` : ''}

    ${
      p.url
        ? `<p><a class="btn-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Page officielle paris.fr →</a></p>`
        : ''
    }
  `;
  el('detail').classList.add('open');
  el('detail-close').addEventListener('click', closeDetail);
}

function closeDetail() {
  el('detail').classList.remove('open');
}

function formatPhone(p) {
  return String(p).replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

// --- Construction des contrôles de filtre dynamiques -------------------------

// Adapte le slider de prix au tarif max réellement présent dans les données.
function buildPriceSlider() {
  const maxPrix = pools.reduce((m, p) => Math.max(m, p.prix || 0), 0);
  const sliderMax = Math.max(5, Math.ceil(maxPrix)); // borne haute = « illimité »
  const slider = el('f-prix');
  slider.max = sliderMax;
  slider.value = sliderMax;
  el('f-prix-label').textContent = 'illimité';
}

function buildArrondissements() {
  const arrs = [...new Set(pools.map((p) => p.arrondissement).filter(Boolean))].sort(
    (a, b) => a - b
  );
  const box = el('f-arr');
  box.innerHTML = arrs
    .map(
      (a) =>
        `<label class="chip"><input type="checkbox" value="${a}"> ${a}<sup>e</sup></label>`
    )
    .join('');
  box.querySelectorAll('input').forEach((cb) =>
    cb.addEventListener('change', () => {
      filters.arrondissements = new Set(
        [...box.querySelectorAll('input:checked')].map((i) => parseInt(i.value, 10))
      );
      render();
    })
  );
}

function buildLines() {
  const lines = availableLines(pools);
  const sel = el('f-ligne');
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Toutes les lignes</option>' +
    lines
      .map((l) => `<option value="${l.key}">${escapeHtml(l.modeLabel)} ${escapeHtml(l.line)}</option>`)
      .join('');
  sel.value = current;
}

// --- Câblage des filtres -----------------------------------------------------

function wireFilters() {
  el('f-texte').addEventListener('input', (e) => {
    filters.texte = e.target.value;
    render();
  });

  const prix = el('f-prix');
  prix.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    const max = parseFloat(e.target.max);
    filters.prixMax = v >= max ? null : v;
    el('f-prix-label').textContent =
      v >= max ? 'illimité' : v === 0 ? 'Gratuit' : v.toFixed(2).replace('.', ',') + ' €';
    render();
  });

  el('f-pmr').addEventListener('change', (e) => {
    filters.pmr = e.target.checked;
    render();
  });

  el('f-tri').addEventListener('change', (e) => {
    filters.tri = e.target.value;
    render();
  });

  el('f-ligne').addEventListener('change', (e) => {
    filters.ligne = e.target.value;
    render();
  });

  const dist = el('f-dist');
  dist.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    filters.distMax = v >= 1000 ? null : v;
    el('f-dist-label').textContent = v >= 1000 ? 'illimité' : v + ' m';
    render();
  });

  // Filtre « Quand ? » (ouvert sur toute la plage ouverture → fermeture)
  const when = el('f-when');
  const momentBox = el('moment-controls');
  const jour = el('f-jour');
  const debut = el('f-debut');
  const fin = el('f-fin');

  jour.innerHTML = JOURS.map(
    (j, i) => `<option value="${i}">${j[0].toUpperCase() + j.slice(1)}</option>`
  ).join('');

  // Empêche la fermeture d'être avant l'ouverture.
  function syncBounds(changed) {
    let d = parseInt(debut.value, 10);
    let f = parseInt(fin.value, 10);
    if (f <= d) {
      if (changed === 'debut') fin.value = d + 30;
      else debut.value = f - 30;
    }
    el('f-debut-label').textContent = formatMinutes(parseInt(debut.value, 10));
    el('f-fin-label').textContent = formatMinutes(parseInt(fin.value, 10));
  }

  function updateMoment() {
    if (when.value === 'maintenant') {
      const now = new Date();
      const m = now.getHours() * 60 + now.getMinutes();
      filters.moment = { jour: JS_DAY_TO_INDEX[now.getDay()], start: m, end: m };
      momentBox.classList.remove('visible');
    } else if (when.value === 'creneau') {
      filters.moment = {
        jour: parseInt(jour.value, 10),
        start: parseInt(debut.value, 10),
        end: parseInt(fin.value, 10),
      };
      momentBox.classList.add('visible');
    } else {
      filters.moment = null;
      momentBox.classList.remove('visible');
    }
    render();
  }

  when.addEventListener('change', updateMoment);
  jour.addEventListener('change', updateMoment);
  debut.addEventListener('input', () => {
    syncBounds('debut');
    if (when.value === 'creneau') updateMoment();
  });
  fin.addEventListener('input', () => {
    syncBounds('fin');
    if (when.value === 'creneau') updateMoment();
  });

  el('f-reset').addEventListener('click', () => {
    filters = defaultFilters();
    el('f-texte').value = '';
    el('f-ligne').value = '';
    el('f-tri').value = 'nom';
    el('f-pmr').checked = false;
    document
      .querySelectorAll('#f-arr input:checked')
      .forEach((c) => (c.checked = false));
    el('f-dist').value = 1000;
    el('f-dist-label').textContent = 'illimité';
    el('f-prix').value = el('f-prix').max;
    el('f-prix-label').textContent = 'illimité';
    el('f-debut').value = 540;
    el('f-debut-label').textContent = '09h00';
    el('f-fin').value = 1200;
    el('f-fin-label').textContent = '20h00';
    el('f-when').value = '';
    momentBox.classList.remove('visible');
    render();
  });
}

// --- Démarrage ---------------------------------------------------------------

async function start() {
  initMap(openDetail);
  wireFilters();

  const status = el('loading');
  try {
    pools = await loadPools();
  } catch (e) {
    status.innerHTML =
      '⚠️ Impossible de charger les données des piscines.<br><span class="small">' +
      escapeHtml(e.message) +
      '</span>';
    return;
  }

  buildArrondissements();
  buildPriceSlider();
  render();
  status.style.display = 'none';

  // Transports en arrière-plan
  el('transport-status').textContent = 'Chargement des transports…';
  await loadTransports(pools, (done, total) => {
    el('transport-status').textContent =
      done < total ? `Transports : ${done}/${total}…` : '';
  });
  buildLines();
  render();
}

start();
