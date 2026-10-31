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

// Split markdown into chapters (`# /path`), each with an intro and `##` sections.
// `### geometry` + its json block is lifted out of the prose and attached to the
// enclosing section (or chapter intro). Statuses are inherited from the chapter.
function parse(text) {
  const chapters = [];
  let ch = null, sec = null, fence = null, geom = null; // geom: null | 'wait' | string[]
  let metaOpen = false;
  const target = () => sec || ch;
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
          try { target().geometry = JSON.parse(geom.join('\n')); } catch (e) { target().error = e.message; }
          geom = null; continue;
        }
      }
      if (ch && !Array.isArray(geom)) { metaOpen = false; push(line); }
      continue;
    }
    if (Array.isArray(geom)) { geom.push(line); continue; }
    if (fence) { if (ch) push(line); continue; }
    let m;
    if ((m = line.match(/^# (\/\S*)\s*$/))) {
      ch = { path: m[1], status: '?', meta: {}, body: [], sections: [] }; sec = null; metaOpen = true;
      chapters.push(ch);
    } else if (!ch) { /* text before the first chapter is ignored */ }
    else if ((m = line.match(/^## (.+?)\s*$/))) {
      sec = { title: m[1], body: [] }; ch.sections.push(sec); metaOpen = false;
    } else if (/^### geometry\s*$/.test(line)) { geom = 'wait'; }
    else if (metaOpen && !sec && (m = line.match(/^- ([\w-]+):\s*(.*)$/))) {
      if (m[1] === 'status') ch.status = m[2].trim(); else ch.meta[m[1]] = m[2].trim();
    } else { if (line.trim()) metaOpen = false; push(line); }
  }
  return chapters;
}

const md = s => DOMPurify.sanitize(marked.parse(s, { async: false }));

function render(chapters) {
  const features = [];
  const add = (geometry, id, ch) => {
    if (geometry) features.push({ type: 'Feature', id: features.length, properties: { key: id, path: ch.path, status: ch.status }, geometry });
  };
  textEl.innerHTML = chapters.map((ch, i) => {
    const cid = `c${i}`;
    const st = Object.hasOwn(COLOR, ch.status) ? ch.status : 'unknown';
    const slash = ch.path.lastIndexOf('/') + 1;
    add(ch.geometry, cid, ch);
    const meta = Object.entries(ch.meta).map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('');
    const block = (id, geometry, err, html, cls = '') =>
      `<section id="${id}" class="sec ${cls} st-${st}${geometry ? ' geo' : ''}">${html}${err ? `<p class="pin">⚠ geometry: ${esc(err)}</p>` : ''}</section>`;
    const intro = ch.body.join('\n').trim();
    return `<article class="chapter st-${st}">
      <h1><span class="dir">${esc(ch.path.slice(0, slash))}</span><span class="leaf">${esc(ch.path.slice(slash))}</span></h1>
      <div class="meta"><span class="badge" style="--c:${COLOR[ch.status] || '#77777f'}">${esc(ch.status)}</span>${meta}</div>
      ${(intro || ch.geometry) ? block(cid, ch.geometry, ch.error, md(intro)) : ''}
      ${ch.sections.map((s, j) => {
        const sid = `${cid}s${j}`;
        add(s.geometry, sid, ch);
        return block(sid, s.geometry, s.error, `<h2>${esc(s.title)}</h2>${md(s.body.join('\n'))}`);
      }).join('')}
    </article>`;
  }).join('');
  return features;
}

function extend(b, c) { typeof c[0] === 'number' ? b.extend(c) : c.forEach(x => extend(b, x)); }

const map = new Map({ container: 'map', style: STYLE, center: [141.35, 43.06], zoom: 11 });
map.on('error', e => console.error('maplibre:', e.error?.message ?? e));

if (!src) {
  textEl.innerHTML = '<p class="note">?kcaim-geo=&lt;URL of a kcaim-geo .md file&gt; を指定してください。</p>';
} else {
  const mapReady = new Promise(r => map.on('load', r));
  fetch(src)
    .then(r => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.text(); })
    .then(async text => {
      const features = render(parse(text));
      document.title = `${textEl.querySelector('h1')?.textContent ?? 'kcaim-geo'} — kcaim-geo`;
      await mapReady; // the text is readable before the map has finished loading
      setupMap(features);
    })
    .catch(e => { textEl.innerHTML = `<p class="note">${esc(String(e))}</p>`; });
}

function setupMap(features) {
  const byKey = Object.fromEntries(features.map(f => [f.properties.key, f]));
  const col = ['match', ['get', 'status'], ...Object.entries(COLOR).flat(), '#77777f'];
  const hot = ['boolean', ['feature-state', 'active'], false];
  const isOpen = ['==', ['get', 'status'], 'open'];
  map.addSource('kcaim', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'k-area', type: 'fill', source: 'kcaim', filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': col, 'fill-opacity': ['case', hot, 0.38, ['case', isOpen, 0.12, 0.2]] } });
  map.addLayer({ id: 'k-line-solid', type: 'line', source: 'kcaim', filter: ['all', ['!=', '$type', 'Point'], ['!', isOpen]],
    paint: { 'line-color': col, 'line-width': ['case', hot, 5, 3] } });
  map.addLayer({ id: 'k-line-open', type: 'line', source: 'kcaim', filter: ['all', ['!=', '$type', 'Point'], isOpen],
    paint: { 'line-color': col, 'line-width': ['case', hot, 5, 3], 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'k-pt', type: 'circle', source: 'kcaim', filter: ['==', '$type', 'Point'],
    paint: { 'circle-radius': ['case', hot, 10, 7], 'circle-color': ['case', isOpen, '#ffffff', col],
             'circle-stroke-color': ['case', isOpen, col, '#ffffff'], 'circle-stroke-width': 2.5 } });

  const all = new LngLatBounds();
  features.forEach(f => extend(all, f.geometry.coordinates));
  const fitAll = () => { if (!all.isEmpty()) map.fitBounds(all, { padding: 60, maxZoom: 15, duration: 0 }); };
  fitAll();

  let current = null;
  const activate = key => {
    if (key === current) return;
    if (current && byKey[current]) map.setFeatureState({ source: 'kcaim', id: byKey[current].id }, { active: false });
    document.querySelectorAll('.sec.active').forEach(e => e.classList.remove('active'));
    current = key;
    document.getElementById(key)?.classList.add('active');
    const f = byKey[key];
    if (!f) return;
    map.setFeatureState({ source: 'kcaim', id: f.id }, { active: true });
    const b = new LngLatBounds();
    extend(b, f.geometry.coordinates);
    if (f.geometry.type === 'Point') map.flyTo({ center: f.geometry.coordinates, zoom: 15.5 });
    else map.fitBounds(b, { padding: 70, maxZoom: 16 });
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
      const reading = geoSecs.filter(s => s.getBoundingClientRect().top <= line).pop() || geoSecs[0];
      if (reading) activate(reading.id);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.querySelectorAll('.sec.geo').forEach(s => s.addEventListener('click', () => { current = null; activate(s.id); }));
  map.on('click', e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['k-area', 'k-line-solid', 'k-line-open', 'k-pt'] })[0];
    const el = hit && document.getElementById(hit.properties.key);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); activate(el.id); }
  });
  for (const l of ['k-area', 'k-line-solid', 'k-line-open', 'k-pt']) {
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
  }
}
