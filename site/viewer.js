import { Map, Popup, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl 6 needs the worker URL set explicitly under a bundler; `?worker&url`
// routes it through Vite's worker pipeline so its shared chunk is bundled too.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

// Usage: viewer.html?kcaim-geo=examples/tsukisamu-park.md
const STYLE = 'https://stars.optgeo.org/style/bvmap-starlight';
const src = new URLSearchParams(location.search).get('kcaim-geo');
const list = document.getElementById('list');

// Parse `# /path` sections (outside code fences); take `- status:` and the
// first json block following a `### geometry` heading.
function parse(text) {
  const sections = [];
  let cur = null, fence = null, inGeom = false, buf = null;
  for (const line of text.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})(\w*)/);
    if (f) {
      if (!fence) { fence = f[1]; if (inGeom && f[2] === 'json') buf = []; }
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) {
        fence = null;
        if (buf && cur) {
          try { cur.geometry = JSON.parse(buf.join('\n')); } catch (e) { cur.error = e.message; }
          buf = null; inGeom = false;
        }
      }
      continue;
    }
    if (fence) { if (buf) buf.push(line); continue; }
    let m;
    if ((m = line.match(/^# (\/\S*)\s*$/))) { cur = { path: m[1], status: '?' }; sections.push(cur); inGeom = false; }
    else if (cur && (m = line.match(/^- status:\s*(\w+)/))) cur.status = m[1];
    else if (cur && /^### geometry\s*$/.test(line)) inGeom = true;
  }
  return sections;
}

function extend(b, c) { typeof c[0] === 'number' ? b.extend(c) : c.forEach(x => extend(b, x)); }

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const map = new Map({ container: 'map', style: STYLE, center: [141.35, 43.06], zoom: 11 });
map.on('error', e => console.error('maplibre:', e.error?.message ?? e));

if (!src) {
  list.textContent = '?kcaim-geo=<URL of a kcaim-geo .md file> を指定してください。';
} else {
  list.textContent = 'loading…';
  Promise.all([
    fetch(src).then(r => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.text(); }),
    new Promise(r => map.on('load', r))
  ]).then(([text]) => {
    const secs = parse(text);
    const features = secs.filter(s => s.geometry).map(s =>
      ({ type: 'Feature', properties: { path: s.path, status: s.status }, geometry: s.geometry }));
    map.addSource('kcaim', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({ id: 'kcaim-area', type: 'fill', source: 'kcaim', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#0969da', 'fill-opacity': 0.25 } });
    map.addLayer({ id: 'kcaim-line', type: 'line', source: 'kcaim', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#bc4c00', 'line-width': 3 } });
    map.addLayer({ id: 'kcaim-pt', type: 'circle', source: 'kcaim', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#0969da', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.on('click', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['kcaim-area', 'kcaim-line', 'kcaim-pt'] })[0];
      if (f) new Popup().setLngLat(e.lngLat).setText(`${f.properties.path} [${f.properties.status}]`).addTo(map);
    });
    const b = new LngLatBounds();
    features.forEach(f => extend(b, f.geometry.coordinates));
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 16 });
    list.innerHTML = secs.map(s =>
      `<div><code>${esc(s.path)}</code> <b class="s-${esc(s.status)}">${esc(s.status)}</b>${s.geometry ? ' ◎' : ''}${s.error ? ' ⚠ ' + esc(s.error) : ''}</div>`).join('');
  }).catch(e => { list.textContent = String(e); });
}
