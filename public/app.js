const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lab = (s) => String(s).replace('_', ' ');
const COL = { low: '#4a9a68', medium: '#e1b13a', high: '#e0762c', severe: '#b3261e' }, W = { low: .3, medium: .55, high: .8, severe: 1 }, RANK = { low: 1, medium: 2, high: 3, severe: 4 };
const CAT = {
  bridge: ['Bridge', 'M3 17h18M4 17v-4a8 8 0 0 1 16 0v4M8 17v-5M12 17V9M16 17v-5'],
  underpass: ['Underpass', 'M3 20V11a9 9 0 0 1 18 0v9M8 20v-7a4 4 0 0 1 8 0v7'],
  junction: ['Junction / chowk', 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3'],
  market: ['Market', 'M4 9l1-5h14l1 5M4 9v11h16V9M9 20v-6h6v6'],
  road: ['Road', 'M8 3L5 21M16 3l3 18M12 4v3M12 11v3M12 18v3'],
  nullah: ['Nullah / culvert', 'M2 9c3-3 5 3 10 0s7 3 10 0M2 15c3-3 5 3 10 0s7 3 10 0'],
  residential: ['Residential', 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6'],
  transit: ['Transit', 'M6 3h12v12H6zM6 11h12M8 19l-2 2M16 19l2 2'],
  drain: ['Drain / gully', 'M4 6h16v12H4zM8 6v12M12 6v12M16 6v12']
};
const svg = (c, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${(CAT[c] || CAT.road)[1]}"/></svg>`;
const pinHtml = (p, s = 32) => `<span class="pin ${p.source_type} ${p.severity}${p.status === 'resolved' ? ' resolved' : ''}" style="width:${s}px;height:${s}px">${svg(p.category, Math.round(s * .55))}</span>`;
const CREDIT = { Streets: '© OpenStreetMap contributors, © CARTO', Satellite: 'Imagery © Esri, Maxar, Earthstar Geographics', Terrain: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', Dark: '© OpenStreetMap contributors' };
const popPad = () => [document.body.classList.contains('side-closed') ? 20 : 400, 80];
let allPts = [], apiMs = 0, lastSync = null, zonePts = 0, curBase = 'Streets', stats = null, nZones = 0, drainKm = 0, token = sessionStorage.getItem('tok') || '', role = null, picking = false, data = [], view = [], near = null, mk = {}, sev = new Set();

// ---------- map ----------
const tile = (u, a) => L.tileLayer(u, { maxZoom: 19, attribution: a });
const bases = {
  Streets:tile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }),
  Satellite: tile('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', ''),
  Terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxNativeZoom: 17, maxZoom: 19 }),
  Dark: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'inv' })
};
const map = L.map('map', { layers: [bases.Streets], zoomControl: false, attributionControl: false }).setView([33.625, 73.06], 12);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
const sevOf = (ms) => Object.keys(RANK).find((k) => RANK[k] === Math.max(...ms.map((x) => RANK[x.options.sev])));
const pts = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, iconCreateFunction: (c) => { const ms = c.getAllChildMarkers(); return L.divIcon({ className: '', iconSize: [38, 38], html: `<div class="cl" style="background:${COL[sevOf(ms)]}" title="Colour = worst severity inside">${ms.length}</div>` }); } }).addTo(map), buf = L.layerGroup().addTo(map);
const zl = L.geoJSON(null, {
  style: (f) => ({ color: f.properties.risk_level === 'high' ? '#b3261e' : '#e0762c', weight: 2, dashArray: '5 4', fillOpacity: .14 }),
  onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<div class="pop"><h3>${esc(p.name)}</h3><span class="tag">${p.risk_level} risk zone</span><p>${p.point_count} recorded points (${p.high_count} high or severe) in ${p.area_km2} km²</p><small>${esc(p.source_note || '')}</small></div>`); }
}).addTo(map);
const drain = L.geoJSON(null, { style: { color: '#1b6d86', weight: 4, opacity: .9 }, onEachFeature: (f, l) => l.bindPopup(`<div class="pop"><h3>${esc(f.properties.name)}</h3><p>${f.properties.length_km} km (geodesic length from PostGIS)</p><small>${esc(f.properties.source_note || '')}</small></div>`) }).addTo(map);
async function loadDrain() { try { const fc = await api('/api/drainage'); drain.clearLayers(); drain.addData(fc); drainKm = fc.features.reduce((a, f) => a + f.properties.length_km, 0); renderAbout(); } catch (e) { /* run add_v4 SQL */ } }
async function loadZones() { try { const fc = await api('/api/zones'); zl.clearLayers(); zl.addData(fc); nZones = fc.features.length; zonePts = fc.features.reduce((a, f) => a + f.properties.point_count, 0); renderAbout(); } catch (e) { /* zones table not created yet */ } }
const heat = L.heatLayer([], { radius: 38, blur: 28, maxZoom: 15, gradient: { .3: '#4a9a68', .6: '#e1b13a', .8: '#e0762c', 1: '#b3261e' } });
L.control.layers(null, { 'Flood points': pts, 'Flood zones (polygons)': zl, 'Nullah Leh centreline': drain, 'Severity heatmap': heat }, { position: 'topright' }).addTo(map);
const lg = L.control({ position: 'bottomright' });
lg.onAdd = () => {
  const d = L.DomUtil.create('details', 'legend'); d.open = innerWidth > 900; L.DomEvent.disableClickPropagation(d);
  d.innerHTML = '<summary>Legend</summary><div class="lg">' + Object.entries(CAT).map(([k, v]) => `<span><i class="pin lgp" style="background:#0a2a63">${svg(k, 12)}</i>${v[0]}</span>`).join('') +
    '</div><div class="lg2">' + Object.entries(COL).map(([k, c]) => `<span><i class="dot" style="background:${c}"></i>${k}</span>`).join('') +
    '<span><i class="dot ring stu"></i>Student</span><span><i class="dot ring off"></i>Official</span><span><i class="dot zone"></i>Flood zone</span><span><i class="dot line"></i>Nullah</span></div>';
  return d;
};
lg.addTo(map);

// ---------- helpers ----------
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-token': token }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.errors ? d.errors.join(' ') : d.error || 'Request failed.');
  return d;
}
let tt;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => (t.className = ''), 3500); }
const icon = (p) => L.divIcon({ className: '', iconSize: [36, 36], iconAnchor: [18, 18], html: pinHtml(p, 32) });

// ---------- data + rendering ----------
async function load(fit) {
  try {
    const qs = new URLSearchParams();
    [['category', 'f_category'], ['source_type', 'f_source_type'], ['status', 'f_status'], ['city', 'f_city'], ['nullah', 'f_nullah']].forEach(([k, i]) => { const v = $('#' + i).value.trim(); if (v) qs.set(k, v); });
    const t0 = performance.now(); data = await api('/api/points?' + qs); apiMs = Math.round(performance.now() - t0); lastSync = new Date(); allPts = qs.toString() ? await api('/api/points') : data; setStatus(true); timeline();
    render(fit); loadZones();
    const s = await api('/api/stats'); stats = s; renderAbout();
  } catch (e) { setStatus(false); toast(e.message, true); }
}
function render(fit) {
  view = (near ? near.rows : data).filter((p) => (!sev.size || sev.has(p.severity)) && (!cut || p.observed_at <= cut));
  const s = $('#f_sort').value;
  if (!near) view.sort(s === 'name' ? (a, b) => a.name.localeCompare(b.name) : s === 'newest' ? (a, b) => String(b.observed_at).localeCompare(String(a.observed_at)) : (a, b) => RANK[b.severity] - RANK[a.severity]);
  map.closePopup(); pts.clearLayers(); mk = {};
  $('#listTitle').textContent = near ? `${view.length} within ${near.r} m of the chosen spot` : `${view.length} of ${data.length} locations`;
  const ul = $('#list'); ul.innerHTML = view.length ? '' : '<li class="empty">No records match. Clear a filter to see more.</li>';
  view.forEach((p) => {
    const m = L.marker([p.lat, p.lng], { icon: icon(p), title: p.name, sev: p.severity }).bindTooltip(esc(p.name), { direction: 'top', offset: [0, -8] }).addTo(pts);
    m.bindPopup('<div class="pop">Loading point details…</div>', { minWidth: 300, maxWidth: 320, autoPanPaddingTopLeft: popPad(), autoPanPaddingBottomRight: [20, 50] });
    m.on('popupopen', () => openPoint(p.id, m));
    m.on('popupclose', () => { popupRequestId++; });
    mk[p.id] = m;
    const li = document.createElement('li'); li.tabIndex = 0; li.dataset.id = p.id;
    li.innerHTML = `${pinHtml(p, 28)}<div>${esc(p.name)}<small>${esc(p.area)} · ${lab(p.status)}${p.metres !== undefined ? ' · ' + p.metres + ' m away' : ''}</small></div>`;
    const go = () => { pts.zoomToShowLayer(m, () => m.openPopup()); };
    li.onclick = go; li.onkeydown = (e) => e.key === 'Enter' && go();
    li.onmouseenter = () => { m.setZIndexOffset(1000); m._map && m.openTooltip(); li.classList.add('on'); };
    li.onmouseleave = () => { m.setZIndexOffset(0); m.closeTooltip(); li.classList.remove('on'); };
    ul.appendChild(li);
  });
  heat.setLatLngs(view.map((p) => [p.lat, p.lng, W[p.severity]]));
  insights();
  if (fit && view.length) map.flyToBounds(L.latLngBounds(view.map((p) => [p.lat, p.lng])).pad(.2), { maxZoom: 15, duration: .8, ...padOpts() });
}
function insights() {
  const t = (k) => view.reduce((o, p) => ((o[p[k]] = (o[p[k]] || 0) + 1), o), {}), m = Math.max(1, view.length);
  const b = (h, o, c) => `<h3>${h}</h3>` + Object.entries(o).map(([k, v]) => `<div class="bar"><span>${lab(k)}</span><div><i style="width:${v / m * 100}%;background:${c ? c[k] : 'var(--water)'}"></i></div><b>${v}</b></div>`).join('');
  $('#ins').innerHTML = b('By severity', t('severity'), COL) + b('By status', t('status')) + b('By source', t('source_type')) + b('By type', t('category')) + b('By city', t('city')) +
    `<p class="note">${view.reduce((a, p) => a + p.obs_count, 0)} depth readings recorded across these locations.</p>`;
}
let popupRequestId = 0;
async function openPoint(id, m) {
  const requestId = ++popupRequestId;
  try {
    const p = await api('/api/points/' + id);
    if (requestId !== popupRequestId || !m.isPopupOpen() || mk[id] !== m) return;
    const ph = (p.photos || []).map((x) => `<a href="/api/photos/${x.id}" target="_blank" rel="noopener"><img class="th" src="/api/photos/${x.id}" alt="${esc(x.caption || 'Flood photo')}" loading="lazy"></a>`).join('');
    const nm = p.nullah_m != null ? `<br>${p.nullah_m} m from the Nullah Leh centreline` : '';
    const obs = p.observations.length ? '<table>' + p.observations.slice(0, 5).map((o) => `<tr><td><b>${o.water_depth_cm} cm</b></td><td><div class="dep"><i style="width:${Math.min(100, o.water_depth_cm / 1.5)}%"></i></div></td><td>${esc(o.note || '')}</td></tr>`).join('') + '</table>' : '<p>No depth readings yet.</p>';
    const sc = COL[p.severity], ct = (CAT[p.category] || CAT.road)[0];
    m.getPopup().setContent(`<div class="pc"><div class="ph" style="background:linear-gradient(135deg,${sc},#0a2a63)">${pinHtml(p, 42)}<div><h3>${esc(p.name)}</h3><small>${esc(ct)} · ${esc(p.area)}, ${esc(p.city)}</small></div></div>
      <div class="pb"><div class="tags"><span class="tag ${p.source_type}">${p.source_type === 'official' ? 'Official reference' : 'Student-collected · unverified'}</span><span class="tag" style="background:${sc};color:${p.severity === 'medium' ? '#3a2a00' : '#fff'}">${esc(p.severity)}</span><span class="tag">${lab(p.status)}</span></div>
      <p>${esc(p.description || 'No description recorded.')}</p>
      <div class="meta"><span>Reported by<b>${esc(p.reported_by)}</b></span><span>Observed<b>${String(p.observed_at).slice(0, 10)}</b></span><span>Coordinates<b>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</b></span><span>From nullah<b>${p.nullah_m != null ? p.nullah_m + ' m' : 'n/a'}</b></span></div>
      ${obs}<div class="thumbs">${ph}</div><small class="src">${esc(p.source_note || '')}</small>
      <div class="btns"><button data-act="edit" data-id="${p.id}">Edit</button><button data-act="obs" data-id="${p.id}">Add reading</button><button data-act="near" data-lat="${p.lat}" data-lng="${p.lng}">Nearby</button><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Directions</a></div></div></div>`,
      );
  } catch (e) {
    if (requestId === popupRequestId && m.isPopupOpen())
      m.getPopup().setContent(`<div class="pop">Could not load details: ${esc(e.message)}</div>`);
  }
}

// ---------- nearby, export ----------
async function nearby(lat, lng) {
  const r = +$('#rad').value;
  try {
    const rows = await api(`/api/nearby?lat=${lat}&lng=${lng}&radius=${r}`);
    near = { rows, r }; buf.clearLayers();
    const c = L.circle([lat, lng], { radius: r, color: '#1b6d86', weight: 2, fillOpacity: .08, dashArray: '6' }).addTo(buf);
    L.circleMarker([lat, lng], { radius: 5, color: '#1b6d86', fillOpacity: 1 }).addTo(buf);
    map.flyToBounds(c.getBounds().pad(.2), { duration: .8, ...padOpts() }); $('#btnClr').hidden = false; render(false); tab('places');
  } catch (e) { toast(e.message, true); }
}
function clearNear() { near = null; buf.clearLayers(); $('#btnClr').hidden = true; render(true); }
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
$('#btnGeo').onclick = () => dl('flood_points.geojson', JSON.stringify({ type: 'FeatureCollection', features: view.map(({ lat, lng, ...r }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: r })) }, null, 2), 'application/geo+json');
$('#btnCsv').onclick = () => {
  const k = ['id', 'name', 'area', 'city', 'source_type', 'severity', 'status', 'reported_by', 'observed_at', 'lat', 'lng'];
  dl('flood_points.csv', [k.join(',')].concat(view.map((p) => k.map((c) => `"${String(p[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n'), 'text/csv');
};
$('#btnNear').onclick = () => { const c = map.getCenter(); nearby(c.lat, c.lng); };
$('#btnLoc').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => nearby(p.coords.latitude, p.coords.longitude), () => toast('Location permission was denied.', true)) : toast('Geolocation is not supported here.', true);
$('#btnClr').onclick = clearNear;
$('#rad').oninput = () => ($('#radLbl').textContent = $('#rad').value + ' m');
map.on('contextmenu', (e) => nearby(e.latlng.lat, e.latlng.lng));

// ---------- filters, tabs ----------
let deb; const reload = () => { clearTimeout(deb); deb = setTimeout(() => load(true), 250); };
['f_category', 'f_source_type', 'f_status', 'f_city', 'f_nullah'].forEach((i) => $('#' + i).addEventListener(i === 'f_q' ? 'input' : 'change', reload));
$('#f_sort').onchange = () => render(false);
$('#chips').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); on ? sev.add(b.dataset.sev) : sev.delete(b.dataset.sev); render(true); };
$('#btnReset').onclick = () => resetFilters();
function tab(t) { document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + t)); }
document.querySelectorAll('.tabs [data-tab]').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

// ---------- auth + forms ----------
function setAuthUI() { $('#btnLogin').textContent = role ? `Log out · ${role}` : 'Log in'; }
function askToken() {
  return new Promise((res) => {
    const d = $('#dlgLogin'); $('#loginErr').textContent = ''; $('#tokIn').value = ''; d.showModal(); setTimeout(() => $('#tokIn').focus(), 50);
    $('#frmLogin').onsubmit = async (e) => {
      e.preventDefault(); token = $('#tokIn').value.trim();
      try { role = (await api('/api/me')).role; if (!role) { token = ''; $('#loginErr').textContent = 'Token not recognised. Check your .env file.'; return; } sessionStorage.setItem('tok', token); setAuthUI(); d.close(); toast(`Logged in as ${role}.`); res(true); }
      catch (err) { $('#loginErr').textContent = err.message; }
    };
    $('#loginCancel').onclick = () => { d.close(); res(false); };
    d.oncancel = () => res(false);
  });
}
const ensureLogin = async () => (role ? true : askToken());
function askConfirm(msg) { return new Promise((r) => { const d = $('#dlgConfirm'); $('#cfMsg').textContent = msg; d.returnValue = 'no'; d.onclose = () => r(d.returnValue === 'yes'); d.showModal(); }); }
function logout() { token = ''; role = null; sessionStorage.removeItem('tok'); setAuthUI(); toast('Logged out.'); }
function openForm(p) {
  $('#frm').reset(); $('#formErr').textContent = '';
  $('#dlgTitle').textContent = p.id ? 'Edit flood point' : 'Report a flood point';
  ['id', 'name', 'category', 'city', 'area', 'severity', 'status', 'source_type', 'description', 'lat', 'lng', 'reported_by'].forEach((k) => { if (p[k] !== undefined && p[k] !== null) $('#' + k).value = p[k]; });
  const today = new Date().toISOString().slice(0, 10);
  $('#observed_at').value = p.observed_at ? String(p.observed_at).slice(0, 10) : today; $('#observed_at').max = today;
  $('#srcWrap').hidden = role !== 'admin'; $('#btnDel').hidden = !(role === 'admin' && p.id);
  $('#status').querySelector('[value=verified]').disabled = role !== 'admin';
  $('#dlg').showModal();
}
$('#frm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = {}; ['name', 'category', 'city', 'area', 'severity', 'status', 'description', 'reported_by', 'observed_at'].forEach((k) => (b[k] = $('#' + k).value.trim()));
  b.lat = $('#lat').value; b.lng = $('#lng').value; if (role === 'admin') b.source_type = $('#source_type').value;
  const id = $('#id').value;
  try { await api(id ? '/api/points/' + id : '/api/points', id ? 'PUT' : 'POST', b); $('#dlg').close(); map.closePopup(); toast(id ? 'Point updated in PostgreSQL.' : 'Point saved to PostgreSQL.'); load(false); }
  catch (err) { $('#formErr').textContent = err.message; }
});
$('#frmObs').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api(`/api/points/${$('#o_id').value}/observations`, 'POST', { water_depth_cm: $('#o_depth').value, note: $('#o_note').value, observed_by: $('#o_by').value });
    const f = $('#o_photo').files[0];
    if (f) await api(`/api/points/${$('#o_id').value}/photos`, 'POST', { image: await shrink(f), caption: $('#o_note').value, uploaded_by: $('#o_by').value });
    $('#dlgObs').close(); map.closePopup(); toast('Reading saved.'); load(false); }
  catch (err) { $('#obsErr').textContent = err.message; }
});
$('#btnCancel').onclick = () => $('#dlg').close();
$('#obsCancel').onclick = () => $('#dlgObs').close();
$('#btnDel').onclick = async () => { if (!(await askConfirm('Delete this record permanently? This cannot be undone.'))) return; try { await api('/api/points/' + $('#id').value, 'DELETE'); $('#dlg').close(); map.closePopup(); toast('Record deleted.'); load(false); } catch (err) { $('#formErr').textContent = err.message; } };
$('#btnLogin').onclick = () => (role ? logout() : ensureLogin());
$('#btnAdd').onclick = async () => { if (!(await ensureLogin())) return; picking = true; map.getContainer().style.cursor = 'crosshair'; toast('Click the map where the flooding is.'); };
map.on('click', (e) => { if (!picking) return; picking = false; map.getContainer().style.cursor = ''; openForm({ lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }); });
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'near') return nearby(+b.dataset.lat, +b.dataset.lng);
  if (!(await ensureLogin())) return;
  if (b.dataset.act === 'edit') openForm(await api('/api/points/' + b.dataset.id));
  else { $('#obsErr').textContent = ''; $('#frmObs').reset(); $('#o_id').value = b.dataset.id; $('#dlgObs').showModal(); }
});
(async () => { if (token) { try { role = (await api('/api/me')).role; } catch {} if (role) setAuthUI(); else token = ''; } await load(true); $('#splash').classList.add('off'); })();

// ---------- dark theme ----------
function theme(t) {
  document.documentElement.dataset.theme = t; $('#btnTheme').textContent = t === 'dark' ? 'Light' : 'Dark'; $('#btnTheme').title = 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' mode';
  try { localStorage.setItem('theme', t); } catch {}
  if (t === 'dark' && curBase === 'Streets') setBase('Dark');
  if (t === 'light' && curBase === 'Dark') setBase('Streets');
}
$('#btnTheme').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
let saved = null; try { saved = localStorage.getItem('theme'); } catch {}
theme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// ---------- live rainfall (Open-Meteo, no key) ----------
async function rain() {
  const el = $('#rain');
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.6&longitude=73.06&hourly=precipitation&past_days=1&forecast_days=2&timezone=Asia%2FKarachi');
    const h = (await r.json()).hourly.precipitation, i = 24 + new Date().getHours();
    const sum = (a, b) => h.slice(a, b).reduce((x, y) => x + (y || 0), 0), past = sum(i - 24, i), next = sum(i, i + 24);
    const lvl = next >= 50 ? 'heavy' : next >= 20 ? 'moderate' : 'low';
    const msg = { low: 'Low flood concern.', moderate: 'Watch the high-risk points.', heavy: 'Expect waterlogging at high and severe points.' }[lvl];
    el.className = 'rain ' + lvl;
    el.innerHTML = `<span class="lvl">${{ low: 'LOW', moderate: 'WATCH', heavy: 'ALERT' }[lvl]}</span><div><b>${past.toFixed(1)} mm</b> last 24 h · <b>${next.toFixed(1)} mm</b> next 24 h<br><small>${msg} Rawalpindi, Open-Meteo (indicative)</small></div>`;
  } catch { el.className = 'rain'; el.textContent = 'Rainfall data is unavailable right now.'; }
}
rain(); setInterval(rain, 9e5);

// ---------- event timeline ----------
let cut = null, dates = [], tlT = null;
function timeline() {
  dates = [...new Set(data.map((p) => p.observed_at))].sort();
  const s = $('#tl'); s.max = Math.max(0, dates.length - 1); s.disabled = dates.length < 2;
  $('#tlLbl').textContent = cut ? 'Up to ' + cut : dates.length ? `All (${dates[0]} to ${dates[dates.length - 1]})` : 'No dates';
}
function stopPlay() { clearInterval(tlT); tlT = null; $('#tlPlay').textContent = 'Play'; }
$('#tl').oninput = () => { stopPlay(); cut = dates[+$('#tl').value]; timeline(); render(false); };
$('#tlAll').onclick = () => { stopPlay(); cut = null; timeline(); render(true); };
$('#tlPlay').onclick = () => {
  if (tlT) return stopPlay();
  let i = 0; $('#tlPlay').textContent = 'Pause';
  tlT = setInterval(() => { if (i >= dates.length) return stopPlay(); $('#tl').value = i; cut = dates[i++]; timeline(); render(false); }, 1000);
};

// ---------- photo resize (JPEG, max 900 px) ----------
function shrink(file) {
  return new Promise((ok, no) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .8)); };
    img.onerror = () => no(new Error('That file is not a readable image.'));
    img.src = u;
  });
}
loadDrain();

// ---------- layout helpers ----------
function padOpts() { const o = !document.body.classList.contains('side-closed'), w = innerWidth > 700; return { paddingTopLeft: [w && o ? 400 : 20, 80], paddingBottomRight: [20, !w && o ? innerHeight * .52 : 50] }; }
$('#btnFit').onclick = () => render(true);

// ---------- clock, near me, data check ----------
function tick() { const d = new Date(), z = { timeZone: 'Asia/Karachi' }; $('#clk').textContent = d.toLocaleTimeString('en-GB', z); $('#dt').textContent = d.toLocaleDateString('en-GB', { ...z, weekday: 'short', day: 'numeric', month: 'short' }) + ' PKT'; }
tick(); setInterval(tick, 1000);
setTimeout(() => $('#splash').classList.add('off'), 6000);
const me = L.layerGroup().addTo(map);
function locate() {
  if (!navigator.geolocation) return toast('Geolocation is not supported in this browser.', true);
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition((p) => {
    const { latitude: la, longitude: ln, accuracy } = p.coords; me.clearLayers();
    L.circle([la, ln], { radius: accuracy, color: '#1769ff', weight: 1, fillOpacity: .08 }).addTo(me);
    L.marker([la, ln], { icon: L.divIcon({ className: '', iconSize: [16, 16], html: '<span class="me"></span>' }), interactive: false }).addTo(me);
    nearby(la, ln);
  }, () => toast('Location was blocked or unavailable. Allow location access and try again.', true), { enableHighAccuracy: true, timeout: 10000 });
}
$('#btnMe').onclick = locate; $('#btnLoc').onclick = locate;
function renderAbout() {
  if (!stats) return;
  const n = allPts.length, c = (f) => allPts.filter(f).length, pc = (v) => `${v} (${n ? Math.round(v / n * 100) : 0}%)`;
  let dup = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (L.latLng(allPts[i].lat, allPts[i].lng).distanceTo([allPts[j].lat, allPts[j].lng]) < 30) dup++;
  const t = (lastSync || new Date()).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi' });
  const rows = [['Data source', 'Live API · PostgreSQL / PostGIS'], ['API response', apiMs + ' ms'], ['Last refreshed', t + ' PKT'], ['Features loaded', n],
    ['Official references', pc(c((p) => p.source_type === 'official'))], ['Student observations', pc(c((p) => p.source_type === 'student'))],
    ['With description', pc(c((p) => p.description))], ['With depth readings', pc(c((p) => p.obs_count > 0))], ['Photos stored', stats.photos ?? 0],
    ['Verified records', pc(c((p) => p.status === 'verified'))], ['Awaiting review', stats.open], ['Inside flood zones', zonePts],
    ['Zones / nullah length', `${nZones} / ${drainKm.toFixed(2)} km`], ['Possible duplicate pairs (<30 m)', dup]];
  $('#aboutStats').innerHTML = '<table class="dt"><tbody>' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</tbody></table>';
  if (n) { const la = allPts.map((p) => p.lat), ln = allPts.map((p) => p.lng); $('#bbox').textContent = `${Math.min(...la).toFixed(3)}–${Math.max(...la).toFixed(3)}°N, ${Math.min(...ln).toFixed(3)}–${Math.max(...ln).toFixed(3)}°E`; }
  $('#syncTxt').textContent = lastSync ? '· ' + lastSync.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '';
}
$('#btnCopySql').onclick = () => navigator.clipboard.writeText($('#sqlbox').textContent).then(() => toast('SQL copied.'), () => toast('Copy failed.', true));
$('#btnAllGeo').onclick = async () => {
  try { const rows = await api('/api/points'); dl('flood_points_all.geojson', JSON.stringify({ type: 'FeatureCollection', features: rows.map(({ lat, lng, ...r }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: r })) }, null, 2), 'application/geo+json'); }
  catch (e) { toast(e.message, true); }
};

// ---------- header, sidebar, basemaps, search, footer ----------
function setStatus(ok) { $('#apiChip').className = 'chip ' + (ok ? 'ok' : 'bad'); $('#apiTxt').textContent = ok ? `Live · ${apiMs} ms` : 'API offline'; }
function setBase(n) {
  Object.values(bases).forEach((b) => map.hasLayer(b) && map.removeLayer(b)); bases[n].addTo(map); bases[n].bringToBack(); curBase = n;
  document.querySelectorAll('.bm button').forEach((b) => b.classList.toggle('on', b.dataset.b === n)); $('#credit').textContent = CREDIT[n];
}
const bp = L.control({ position: 'topright' });
bp.onAdd = () => { const d = L.DomUtil.create('div', 'bm'); L.DomEvent.disableClickPropagation(d); d.innerHTML = Object.keys(bases).map((k) => `<button data-b="${k}">${k}</button>`).join(''); d.onclick = (e) => { const b = e.target.closest('button'); if (b) setBase(b.dataset.b); }; return d; };
bp.addTo(map); setBase(curBase);
if (innerWidth <= 700) document.body.classList.add('side-closed');
$('#btnSide').onclick = () => { const c = document.body.classList.toggle('side-closed'); $('#btnSide').setAttribute('aria-expanded', !c); };
$('#btnRefresh').onclick = async () => { const b = $('#btnRefresh'); b.classList.add('spin'); await load(false); b.classList.remove('spin'); toast('Refreshed from PostgreSQL at ' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi' }) + ' PKT'); };
function resetFilters(fit = true) {
  ['f_category', 'f_source_type', 'f_status', 'f_city', 'f_nullah'].forEach((i) => ($('#' + i).value = ''));
  cut = null; stopPlay(); sev.clear(); document.querySelectorAll('#chips button').forEach((b) => b.setAttribute('aria-pressed', false));
  near = null; buf.clearLayers(); $('#btnClr').hidden = true; return load(fit);
}
map.on('mousemove', (e) => { const { lat, lng } = e.latlng; $('#coord').textContent = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? 'E' : 'W'}`; });
map.on('zoomend', () => ($('#zoomLv').textContent = map.getZoom())); $('#zoomLv').textContent = map.getZoom();

const sIn = $('#q'), sBox = $('#sres'); let sList = [], sIdx = -1;
const mark = (t, q) => { const i = t.toLowerCase().indexOf(q); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); };
function runSearch() {
  const q = sIn.value.trim().toLowerCase(); sIdx = -1;
  if (!q) { sBox.hidden = true; return; }
  const rank = (p) => { const n = p.name.toLowerCase(); return n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2; };
  sList = allPts.filter((p) => `${p.name} ${p.area} ${p.city} ${(CAT[p.category] || [''])[0]} ${p.description || ''}`.toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  sBox.innerHTML = sList.length ? sList.map((p, i) => `<li data-i="${i}" role="option">${pinHtml(p, 28)}<div><span>${mark(p.name, q)}</span><small>${esc(p.area)} · ${esc((CAT[p.category] || CAT.road)[0])} · ${esc(p.severity)}</small></div></li>`).join('') : `<li class="none">No place matches “${esc(sIn.value)}”</li>`;
  sBox.hidden = false;
}
async function goTo(p) {
  sBox.hidden = true; sIn.value = p.name; sIn.blur();
  if (document.body.classList.contains('side-closed') === false && innerWidth <= 700) $('#btnSide').click();
  if (!mk[p.id]) await resetFilters(false);
  const m = mk[p.id]; if (!m) return; map.closePopup();
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: .7 });
  map.once('moveend', () => pts.zoomToShowLayer(m, () => m.openPopup()));
}
sIn.oninput = runSearch; sIn.onfocus = runSearch;
sIn.onkeydown = (e) => {
  const items = [...sBox.querySelectorAll('li[data-i]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((li, i) => li.classList.toggle('on', i === sIdx)); items[sIdx].scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') { e.preventDefault(); const p = sList[sIdx >= 0 ? sIdx : 0]; if (p) goTo(p); }
  else if (e.key === 'Escape') { sBox.hidden = true; sIn.blur(); }
};
sBox.onmousedown = (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); goTo(sList[+li.dataset.i]); } };
document.addEventListener('click', (e) => { if (!e.target.closest('.searchbox')) sBox.hidden = true; });