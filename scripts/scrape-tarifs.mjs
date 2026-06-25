#!/usr/bin/env node
// =============================================================================
//  scrape-tarifs.mjs
//  Récupère le plein tarif (et le tarif réduit) « Entrée à l'unité » de chaque
//  piscine municipale en analysant sa page paris.fr, puis écrit data/tarifs.json.
//
//  paris.fr n'autorise pas le fetch côté navigateur (pas de CORS) : ce script
//  s'exécute donc côté serveur (Node / GitHub Action), pas dans le site.
//
//  Usage :  node scripts/scrape-tarifs.mjs
// =============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'tarifs.json');

const POOLS_URL =
  'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/lieux-municipaux/records' +
  '?where=' + encodeURIComponent('search("piscine")') + '&limit=100';

// Tarif municipal standard (utilisé si la page n'expose pas de tarif exploitable).
// La grande majorité des piscines municipales sont à 3,50 € / 2,00 €.
const DEFAUT = { plein: 3.5, reduit: 2.0 };

// Exceptions (piscines gérées hors grille municipale, page externe, etc.).
// Clé = fragment du nom normalisé (sans accents, minuscules).
const EXCEPTIONS = {
  berlioux: { plein: 5.0, reduit: 4.4, source: 'https://piscine-berlioux.fr/tarifs.html' },
  'les halles': { plein: 5.0, reduit: 4.4, source: 'https://piscine-berlioux.fr/tarifs.html' },
  pontoise: { plein: 5.2, reduit: 3.1, source: 'https://www.paris.fr/lieux/espace-sportif-pontoise-2918' },
};

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const toNumber = (s) => parseFloat(String(s).replace(',', '.'));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (tarifs-bot)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

/** Extrait { plein, reduit } d'une page paris.fr. Renvoie {} si introuvable. */
function parseTarifs(htmlRaw) {
  // Retire les <script>/<style>, puis transforme en texte brut.
  let t = htmlRaw.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&');
  t = t.replace(/\s+/g, ' ');

  const out = {};
  // Ancres pour l'entrée unitaire : « Entrée à l'unité » (municipal) ou
  // « Entrée adulte unitaire » (espaces aquatiques en délégation).
  const anchorRe = /Entr[ée]e\s+(?:à\s+l['’]unit[ée]|adulte\s+unitaire)/gi;
  let m;
  while ((m = anchorRe.exec(t))) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 45);
    const pm = after.match(/([0-9]+,[0-9]{2})\s*€/);
    if (!pm) continue;
    const prix = toNumber(pm[1]);
    if (prix < 1 || prix > 12) continue; // garde-fou : on vise un prix d'entrée
    const gap = after.slice(0, pm.index); // texte entre l'ancre et le prix
    if (/r[ée]duit/i.test(gap)) {
      if (out.reduit == null || prix < out.reduit) out.reduit = prix;
    } else if (out.plein == null || prix < out.plein) {
      out.plein = prix;
    }
  }
  return out;
}

async function run() {
  console.log('→ Récupération de la liste des piscines…');
  const data = await (await fetch(POOLS_URL)).json();
  const pools = data.results.map((p) => ({
    id: p.id || p.url,
    nom: p.name,
    url: p.url,
  }));
  console.log(`  ${pools.length} piscines.`);

  const piscines = {};
  let okScrape = 0;
  let okException = 0;
  let fallback = 0;

  const BATCH = 5;
  for (let i = 0; i < pools.length; i += BATCH) {
    const batch = pools.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (p) => {
        const n = norm(p.nom);
        const exKey = Object.keys(EXCEPTIONS).find((k) => n.includes(k));
        if (exKey) {
          const ex = EXCEPTIONS[exKey];
          piscines[p.id] = {
            nom: p.nom,
            plein: ex.plein,
            reduit: ex.reduit,
            url: p.url,
            source: ex.source || p.url,
            methode: 'exception',
          };
          okException += 1;
          return;
        }
        try {
          const html = await fetchText(p.url);
          const tarifs = parseTarifs(html);
          if (tarifs.plein != null) {
            piscines[p.id] = {
              nom: p.nom,
              plein: tarifs.plein,
              reduit: tarifs.reduit ?? null,
              url: p.url,
              source: p.url,
              methode: 'scrape',
            };
            okScrape += 1;
          } else {
            throw new Error('tarif non trouvé');
          }
        } catch (e) {
          piscines[p.id] = {
            nom: p.nom,
            plein: DEFAUT.plein,
            reduit: DEFAUT.reduit,
            url: p.url,
            source: p.url,
            methode: 'defaut',
            note: String(e.message || e),
          };
          fallback += 1;
        }
      })
    );
    process.stdout.write(`  ${Math.min(i + BATCH, pools.length)}/${pools.length}\r`);
  }

  const result = {
    // Date passée par l'environnement pour rester déterministe en CI ; sinon ISO courant.
    generatedAt: process.env.SCRAPE_DATE || new Date().toISOString(),
    devise: '€',
    defaut: DEFAUT,
    piscines,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf-8');

  console.log(`\n✓ ${OUT}`);
  console.log(`  scrape: ${okScrape} · exception: ${okException} · défaut: ${fallback}`);
}

run().catch((e) => {
  console.error('Échec :', e);
  process.exit(1);
});
