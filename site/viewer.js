import { Map, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl 6 needs the worker URL set explicitly under a bundler; `?worker&url`
// routes it through Vite's worker pipeline so its shared chunk is bundled too.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

setWorkerUrl(workerUrl);

// Usage: viewer.html?kcaim-geo=examples/tsukisamu-park.md
const STYLE = 'https://stars.optgeo.org/style/bvmap-starlight';
const COLOR = { verified: '#2f7d4f', derived: '#3b6ea8', normative: '#7a5aa6', open: '#b5651d', volatile: '#b53a3a' };
const src = new URLSearchParams(location.search).get('kcaim-geo');
const textEl = document.getElementById('text');

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Split markdown into chapters (`# /path`, one 踏み跡 each), each with an intro and
// `##` sections. The `## geometry` section is lifted out of the prose and becomes the
// geometry of the whole chapter; its status is the chapter's `- status:`.
function parse(text) {
  const chapters = [];
  let ch = null, sec = null, fence = null, geom = null; // geom: null | 'wait' | string[]
  let metaOpen = false, inGeomSection = false;
  const push = line => { (sec || ch).body.push(line); };
  for (const line of text.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})(\w*)/);
    if (f) {
      if (!fence) {
        fence = f[1];
        if (geom === 'wait' && f[2] === 'json') { geom = []; continue; }
      } else if (f[1][0] === fence[0] && f[1].length >= fence.length) {
        fence = null;
        if (Array.isArray(geom)) {
          try { ch.geometry = JSON.parse(geom.join('\n')); } catch (e) { ch.error = e.message; }
          geom = null; continue;
        }
      }
      if (ch && !inGeomSection) { metaOpen = false; push(line); }
      continue;
    }
    if (Array.isArray(geom)) { geom.push(line); continue; }
    if (fence) { if (ch && !inGeomSection) push(line); continue; }
    let m;
    if ((m = line.match(/^# (\/\S*)\s*$/))) {
      ch = { path: m[1], status: '?', meta: {}, body: [], sections: [] }; sec = null; metaOpen = true; inGeomSection = false;
      chapters.push(ch);
    } else if (!ch) { /* text before the first chapter is ignored */ }
    else if ((m = line.match(/^## (.+?)\s*$/))) {
      metaOpen = false;
      if (m[1].toLowerCase() === 'geometry') { inGeomSection = true; geom = 'wait'; sec = null; }
      else { inGeomSection = false; sec = { title: m[1], body: [] }; ch.sections.push(sec); }
    } else if (inGeomSection) { /* prose around the geometry block is not rendered */ }
    else if (metaOpen && !sec && (m = line.match(/^- ([\w-]+):\s*(.*)$/))) {
      if (m[1] === 'status') ch.status = m[2].trim(); else ch.meta[m[1]] = m[2].trim();
    } else { if (line.trim()) metaOpen = false; push(line); }
  }
  return chapters;
}

const md = s => DOMPurify.sanitize(marked.parse(s, { async: false }));

// Each chapter is one unit: its article carries the status, and the geometry (if any).
function render(chapters) {
  const features = [];
  textEl.innerHTML = chapters.map((ch, i) => {
    const id = `c${i}`;
    const st = Object.hasOwn(COLOR, ch.status) ? ch.status : 'unknown';
    const slash = ch.path.lastIndexOf('/') + 1;
    if (ch.geometry) features.push({ type: 'Feature', id: features.length, properties: { key: id, path: ch.path, status: ch.status }, geometry: ch.geometry });
    const meta = Object.entries(ch.meta).map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('');
    const intro = ch.body.join('\n').trim();
    return `<article id="${id}" class="sec chapter st-${st}${ch.geometry ? ' geo' : ''}">
      <h1><span class="dir">${esc(ch.path.slice(0, slash))}</span><span class="leaf">${esc(ch.path.slice(slash))}</span></h1>
      <div class="meta"><span class="badge" style="--c:${COLOR[ch.status] || '#77777f'}">${esc(ch.status)}</span>${meta}</div>
      ${intro ? md(intro) : ''}
      ${ch.sections.map(s => `<h2>${esc(s.title)}</h2>${md(s.body.join('\n'))}`).join('')}
      ${ch.error ? `<p class="pin">⚠ geometry: ${esc(ch.error)}</p>` : ''}
    </article>`;
  }).join('');
  return features;
}

function extend(b, c) { typeof c[0] === 'number' ? b.extend(c) : c.forEach(x => extend(b, x)); }

let map;
// Paint the text first, then start the map; no artificial delay.
function startMap() {
  const status = document.getElementById('map-status');
  performance.mark('kcaim-map-create');
  map = new Map({ container: 'map', style: STYLE, center: [141.35, 43.06], zoom: 11 });
  map.on('error', e => console.error('maplibre:', e.error?.message ?? e));
  return new Promise(r => map.on('load', () => { performance.mark('kcaim-map-load'); status.remove(); r(); }));
}

if (!src) {
  textEl.innerHTML = '<p class="note">?kcaim-geo=&lt;URL of a kcaim-geo .md file&gt; を指定してください。</p>';
  document.getElementById('map-status').remove();
} else {
  fetch(src)
    .then(r => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.text(); })
    .then(async text => {
      const features = render(parse(text));
      performance.mark('kcaim-text-rendered');
      document.title = `${textEl.querySelector('h1')?.textContent ?? 'kcaim-geo'} — kcaim-geo`;
      await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
      await startMap();
      setupMap(features);
    })
    .catch(e => { textEl.innerHTML = `<p class="note">${esc(String(e))}</p>`; });
}

// A slender pin whose tip is the exact coordinate: the body sits above the point so
// the place itself stays visible. open = hollow with a dashed outline.
const PIN = { w: 22, h: 32, pad: 3 }; // logical px; the tip is `pad` above the bottom edge
function pinImage(color, open) {
  const r = 2, W = PIN.w * r, H = PIN.h * r, cx = W / 2, tip = H - PIN.pad * r;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const path = () => {
    g.beginPath(); g.moveTo(cx, tip);
    g.lineTo(cx - 8 * r, tip - 17 * r);
    g.arc(cx, tip - 17 * r - 0, 8 * r, Math.PI - 0.0, 0, false);
    g.closePath();
  };
  g.lineJoin = 'round';
  path(); g.lineWidth = 6 * r; g.strokeStyle = '#fff'; g.stroke();         // halo
  path(); g.fillStyle = open ? '#fff' : color; g.fill();
  g.lineWidth = 2.5 * r; g.strokeStyle = open ? color : '#fff';
  if (open) g.setLineDash([4 * r, 3 * r]);
  g.stroke();
  return { image: g.getImageData(0, 0, W, H), pixelRatio: r };
}

function setupMap(features) {
  const byKey = Object.fromEntries(features.map(f => [f.properties.key, f]));
  const LAYERS = ['k-area', 'k-line-solid', 'k-line-open', 'k-pin', 'k-pin-hot'];
  // One blue family: only the figure being hovered or read is dark. Status is
  // carried by shape (open = dashed / hollow) and by the text, not by hue.
  const LIGHT = '#9fc0e8', DARK = '#1b4fa0';
  const hot = ['boolean', ['feature-state', 'hot'], false];
  const col = ['case', hot, DARK, LIGHT];
  const isOpen = ['==', ['get', 'status'], 'open'];
  map.addSource('kcaim', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'k-area', type: 'fill', source: 'kcaim', filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': col, 'fill-opacity': ['case', hot, 0.35, 0.12] } });
  map.addLayer({ id: 'k-line-solid', type: 'line', source: 'kcaim', filter: ['all', ['!=', '$type', 'Point'], ['!', isOpen]],
    paint: { 'line-color': col, 'line-width': ['case', hot, 5, 2.5] } });
  map.addLayer({ id: 'k-line-open', type: 'line', source: 'kcaim', filter: ['all', ['!=', '$type', 'Point'], isOpen],
    paint: { 'line-color': col, 'line-width': ['case', hot, 5, 2.5], 'line-dasharray': [2, 2] } });
  for (const [name, color, open] of [['pin', LIGHT, false], ['pin-hot', DARK, false], ['pin-open', LIGHT, true], ['pin-open-hot', DARK, true]]) {
    const { image, pixelRatio } = pinImage(color, open);
    map.addImage(name, image, { pixelRatio });
  }
  const isPoint = ['==', ['geometry-type'], 'Point'];
  const pinLayer = (id, suffix) => ({ id, type: 'symbol', source: 'kcaim', filter: isPoint,
    layout: { 'icon-image': ['case', isOpen, 'pin-open' + suffix, 'pin' + suffix], 'icon-anchor': 'bottom',
              'icon-offset': [0, PIN.pad], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addLayer(pinLayer('k-pin', ''));
  map.addLayer(pinLayer('k-pin-hot', '-hot'));
  const setHotPin = id => {
    map.setFilter('k-pin', ['all', isPoint, ['!=', ['id'], id]]);
    map.setFilter('k-pin-hot', ['all', isPoint, ['==', ['id'], id]]);
  };
  setHotPin(-1);

  const all = new LngLatBounds();
  features.forEach(f => extend(all, f.geometry.coordinates));
  if (!all.isEmpty()) map.fitBounds(all, { padding: 60, maxZoom: 15, duration: 0 });

  // The darkened figure is the hovered one if any, else the one being read.
  let reading = null, hover = null, lit = null;
  const paint = () => {
    const key = hover ?? reading;
    if (key === lit) return;
    if (lit && byKey[lit]) map.setFeatureState({ source: 'kcaim', id: byKey[lit].id }, { hot: false });
    lit = key;
    if (lit && byKey[lit]) map.setFeatureState({ source: 'kcaim', id: byKey[lit].id }, { hot: true });
    setHotPin(lit && byKey[lit] ? byKey[lit].id : -1);
  };
  const read = key => {
    if (key === reading) return;
    document.querySelectorAll('.sec.active').forEach(e => e.classList.remove('active'));
    reading = key;
    document.getElementById(key)?.classList.add('active');
    paint();
    const f = byKey[key];
    if (!f) return;
    const b = new LngLatBounds();
    extend(b, f.geometry.coordinates);
    if (f.geometry.type === 'Point') map.flyTo({ center: f.geometry.coordinates, zoom: 15.5 });
    else map.fitBounds(b, { padding: 70, maxZoom: 16 });
  };
  const setHover = key => {
    document.querySelectorAll('.sec.hover').forEach(e => e.classList.remove('hover'));
    hover = key;
    if (key) document.getElementById(key)?.classList.add('hover');
    paint();
  };

  // The last geometry-bearing section whose top has passed the upper third of the
  // viewport is the one being read; sections without geometry leave the map as is.
  const geoSecs = [...document.querySelectorAll('.sec.geo')];
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const line = innerHeight * 0.35;
      const cur = geoSecs.filter(s => s.getBoundingClientRect().top <= line).pop() || geoSecs[0];
      if (cur) read(cur.id);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  geoSecs.forEach(s => {
    s.addEventListener('click', () => { reading = null; read(s.id); });
    s.addEventListener('mouseenter', () => setHover(s.id));
    s.addEventListener('mouseleave', () => setHover(null));
  });
  map.on('click', e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: LAYERS })[0];
    const el = hit && document.getElementById(hit.properties.key);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); read(el.id); }
  });
  for (const l of LAYERS) {
    map.on('mousemove', l, e => { map.getCanvas().style.cursor = 'pointer'; setHover(e.features[0].properties.key); });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; setHover(null); });
  }
}
