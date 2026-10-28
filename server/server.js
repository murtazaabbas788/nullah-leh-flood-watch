require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});
app.use(express.json({ limit: '700kb' }));
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));

const SEV = ['low', 'medium', 'high', 'severe'];
const STAT = ['reported', 'under_review', 'verified', 'resolved'];
const CITY = ['Rawalpindi', 'Islamabad'];
const SRC = ['official', 'student'];
const CAT = ['bridge', 'underpass', 'junction', 'market', 'road', 'nullah', 'residential', 'transit', 'drain'];

// Auth: editors add/update student data; admins can also verify, edit official data and delete
const role = (req) => {
  const t = req.get('x-token');
  if (!t) return null;
  if (process.env.ADMIN_TOKEN && t === process.env.ADMIN_TOKEN) return 'admin';
  if (process.env.EDITOR_TOKEN && t === process.env.EDITOR_TOKEN) return 'editor';
  return null;
};
const need = (min) => (req, res, next) => {
  const r = role(req);
  if (!r) return res.status(401).json({ error: 'Login required: enter a valid access token.' });
  if (min === 'admin' && r !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  req.role = r;
  next();
};

function validate(b, partial) {
  const e = [], c = {};
  const str = (k, label, min, max, req) => {
    if (b[k] === undefined || b[k] === null || b[k] === '') { if (!partial && req) e.push(`${label} is required.`); return; }
    const v = String(b[k]).trim();
    if (v.length < min || v.length > max) e.push(`${label} must be ${min}-${max} characters.`); else c[k] = v;
  };
  const oneOf = (k, label, list, req) => {
    if (b[k] === undefined || b[k] === '') { if (!partial && req) e.push(`${label} is required.`); return; }
    if (!list.includes(b[k])) e.push(`${label} must be one of: ${list.join(', ')}.`); else c[k] = b[k];
  };
  str('name', 'Name', 3, 120, true); str('area', 'Area', 2, 80, true);
  str('description', 'Description', 0, 500); str('reported_by', 'Reporter', 2, 60);
  oneOf('city', 'City', CITY, true); oneOf('severity', 'Severity', SEV, true); oneOf('category', 'Type', CAT, true);
  oneOf('status', 'Status', STAT); oneOf('source_type', 'Source type', SRC);
  if (b.observed_at) {
    const d = new Date(b.observed_at);
    if (isNaN(d) || d > new Date()) e.push('Observation date must be a valid date, not in the future.'); else c.observed_at = b.observed_at;
  }
  if (b.lat !== undefined || b.lng !== undefined || !partial) {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || lat < 23.5 || lat > 37.5) e.push('Latitude must be a number inside Pakistan (23.5 to 37.5).');
    else if (!Number.isFinite(lng) || lng < 60.5 || lng > 77.5) e.push('Longitude must be a number inside Pakistan (60.5 to 77.5).');
    else { c.lat = lat; c.lng = lng; }
  }
  return { e, c };
}
const idOf = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'Invalid id.' }); return null; }
  return id;
};
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => { console.error(err); res.status(500).json({ error: 'Database error. Please try again.' }); });

const COLS = `id,name,area,city,category,description,source_type,source_note,severity,status,reported_by,to_char(observed_at,'YYYY-MM-DD') AS observed_at,updated_at,
  ST_Y(geom) AS lat, ST_X(geom) AS lng, (SELECT COUNT(*)::int FROM observations o WHERE o.point_id=f.id) AS obs_count`;

app.get('/api/health', wrap(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
app.get('/api/me', (req, res) => res.json({ role: role(req) }));

// List + filter (q, source_type, severity, status, city)
app.get('/api/points', wrap(async (req, res) => {
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace(/\$/g, '$' + p.length)); };
  if (req.query.q) add('(name ILIKE $ OR area ILIKE $ OR description ILIKE $)', `%${String(req.query.q).slice(0, 60)}%`);
  if (SRC.includes(req.query.source_type)) add('source_type=$', req.query.source_type);
  if (SEV.includes(req.query.severity)) add('severity=$', req.query.severity);
  if (STAT.includes(req.query.status)) add('status=$', req.query.status);
  if (CITY.includes(req.query.city)) add('city=$', req.query.city);
  if (CAT.includes(req.query.category)) add('category=$', req.query.category);
  const nm = Number(req.query.nullah);
  if (nm > 0 && nm <= 5000) add('EXISTS (SELECT 1 FROM drainage_lines d WHERE ST_DWithin(d.geom::geography, f.geom::geography, $))', nm);
  const { rows } = await pool.query(`SELECT ${COLS} FROM flood_points f ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id`, p);
  res.json(rows);
}));

app.get('/api/points/:id', wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const { rows } = await pool.query(`SELECT ${COLS} FROM flood_points f WHERE id=$1`, [id]);
  if (!rows.length) return res.status(404).json({ error: 'Location not found.' });
  const obs = await pool.query('SELECT id,water_depth_cm,note,observed_by,observed_at FROM observations WHERE point_id=$1 ORDER BY observed_at DESC', [id]);
  const photos = await pool.query('SELECT id,caption,uploaded_by FROM photos WHERE point_id=$1 ORDER BY id DESC LIMIT 6', [id]).catch(() => ({ rows: [] }));
  const nl = await pool.query('SELECT ROUND(MIN(ST_Distance(d.geom::geography, f.geom::geography)))::int AS m FROM drainage_lines d, flood_points f WHERE f.id=$1', [id]).catch(() => ({ rows: [{}] }));
  res.json({ ...rows[0], observations: obs.rows, photos: photos.rows, nullah_m: nl.rows[0].m ?? null });
}));

app.post('/api/points', need('editor'), wrap(async (req, res) => {
  const { e, c } = validate(req.body, false);
  if (e.length) return res.status(400).json({ errors: e });
  if (req.role !== 'admin') { c.source_type = 'student'; c.status = 'reported'; }
  const src = c.source_type || 'student';
  const { rows } = await pool.query(
    `INSERT INTO flood_points (name,area,city,description,source_type,source_note,severity,status,reported_by,observed_at,geom,category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::date,CURRENT_DATE),ST_SetSRID(ST_MakePoint($12,$11),4326),$13) RETURNING id`,
    [c.name, c.area, c.city, c.description || null, src,
     src === 'official' ? 'Entered by admin' : 'Student-collected observation (unverified)',
     c.severity, c.status || 'reported', c.reported_by || 'anonymous', c.observed_at || null, c.lat, c.lng, c.category]);
  res.status(201).json({ id: rows[0].id });
}));

app.put('/api/points/:id', need('editor'), wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const cur = await pool.query('SELECT source_type FROM flood_points WHERE id=$1', [id]);
  if (!cur.rows.length) return res.status(404).json({ error: 'Location not found.' });
  if (cur.rows[0].source_type === 'official' && req.role !== 'admin') return res.status(403).json({ error: 'Only admins can edit official records.' });
  const { e, c } = validate(req.body, true);
  if (e.length) return res.status(400).json({ errors: e });
  if (req.role !== 'admin') {
    delete c.source_type;
    if (c.status === 'verified') return res.status(403).json({ error: 'Only admins can mark records as verified.' });
  }
  const sets = [], p = [];
  ['name', 'area', 'city', 'category', 'description', 'severity', 'status', 'source_type', 'reported_by', 'observed_at'].forEach((k) => {
    if (c[k] !== undefined) { p.push(c[k]); sets.push(`${k}=$${p.length}`); }
  });
  if (c.lat !== undefined) { p.push(c.lng, c.lat); sets.push(`geom=ST_SetSRID(ST_MakePoint($${p.length - 1},$${p.length}),4326)`); }
  if (!sets.length) return res.status(400).json({ errors: ['Nothing to update.'] });
  p.push(id);
  await pool.query(`UPDATE flood_points SET ${sets.join(',')}, updated_at=now() WHERE id=$${p.length}`, p);
  res.json({ id });
}));

app.delete('/api/points/:id', need('admin'), wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const r = await pool.query('DELETE FROM flood_points WHERE id=$1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Location not found.' });
  res.json({ deleted: id });
}));

app.post('/api/points/:id/observations', need('editor'), wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const d = Number(req.body.water_depth_cm), note = String(req.body.note || '').trim(), by = String(req.body.observed_by || 'anonymous').trim();
  const errs = [];
  if (!Number.isInteger(d) || d < 0 || d > 500) errs.push('Water depth must be a whole number from 0 to 500 cm.');
  if (note.length > 300) errs.push('Note must be 300 characters or fewer.');
  if (by.length < 2 || by.length > 60) errs.push('Observer name must be 2-60 characters.');
  if (errs.length) return res.status(400).json({ errors: errs });
  const ex = await pool.query('SELECT 1 FROM flood_points WHERE id=$1', [id]);
  if (!ex.rows.length) return res.status(404).json({ error: 'Location not found.' });
  await pool.query('INSERT INTO observations (point_id,water_depth_cm,note,observed_by) VALUES ($1,$2,$3,$4)', [id, d, note || null, by]);
  res.status(201).json({ ok: true });
}));

// Spatial query: records within a radius (metres) of a point
app.get('/api/nearby', wrap(async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng), r = Number(req.query.radius || 1000);
  if (![lat, lng, r].every(Number.isFinite) || r <= 0 || r > 20000) return res.status(400).json({ error: 'Provide lat, lng and a radius between 1 and 20000 m.' });
  const { rows } = await pool.query(
    `SELECT ${COLS}, ROUND(ST_Distance(geom::geography, q.pt))::int AS metres
     FROM flood_points f, (SELECT ST_SetSRID(ST_MakePoint($2,$1),4326)::geography AS pt) q
     WHERE ST_DWithin(geom::geography, q.pt, $3) ORDER BY metres`, [lat, lng, r]);
  res.json(rows);
}));

// Polygon layer with spatial-join statistics (ST_Within)
app.get('/api/zones', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT z.id, z.name, z.risk_level, z.source_note, ST_AsGeoJSON(z.geom)::json AS geometry,
    (SELECT COUNT(*)::int FROM flood_points f WHERE ST_Within(f.geom, z.geom)) AS point_count,
    (SELECT COUNT(*)::int FROM flood_points f WHERE ST_Within(f.geom, z.geom) AND f.severity IN ('high','severe')) AS high_count,
    ROUND((ST_Area(z.geom::geography)/1e6)::numeric, 2)::float AS area_km2 FROM flood_zones z ORDER BY z.id`);
  res.json({ type: 'FeatureCollection', features: rows.map(({ geometry, ...properties }) => ({ type: 'Feature', geometry, properties })) });
}));

// Drainage centreline (LineString) with geodesic length
app.get('/api/drainage', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT id, name, source_note, ROUND((ST_Length(geom::geography)/1000)::numeric, 2)::float AS length_km,
    ST_AsGeoJSON(geom)::json AS geometry FROM drainage_lines ORDER BY id`);
  res.json({ type: 'FeatureCollection', features: rows.map(({ geometry, ...properties }) => ({ type: 'Feature', geometry, properties })) });
}));

// Photo evidence: client sends a resized JPEG as a data URL; stored in PostgreSQL (BYTEA)
app.post('/api/points/:id/photos', need('editor'), wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
  if (!m || m[1].length > 540000) return res.status(400).json({ errors: ['Photo must be a JPEG under about 400 KB.'] });
  const buf = Buffer.from(m[1], 'base64');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ errors: ['File is not a valid JPEG.'] });
  const ex = await pool.query('SELECT 1 FROM flood_points WHERE id=$1', [id]);
  if (!ex.rows.length) return res.status(404).json({ error: 'Location not found.' });
  const cap = String(req.body.caption || '').trim().slice(0, 200), by = String(req.body.uploaded_by || '').trim().slice(0, 60) || 'anonymous';
  await pool.query('INSERT INTO photos (point_id,data,caption,uploaded_by) VALUES ($1,$2,$3,$4)', [id, buf, cap || null, by]);
  res.status(201).json({ ok: true });
}));
app.get('/api/photos/:id', wrap(async (req, res) => {
  const id = idOf(req, res); if (!id) return;
  const { rows } = await pool.query('SELECT data FROM photos WHERE id=$1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Photo not found.' });
  res.set({ 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' });
  res.send(rows[0].data);
}));

app.get('/api/stats', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER (WHERE source_type='official')::int official, COUNT(*) FILTER (WHERE source_type='student')::int student,
    COUNT(*) FILTER (WHERE severity='severe')::int severe, COUNT(*) FILTER (WHERE status IN ('reported','under_review'))::int open FROM flood_points`);
  const ex = await pool.query('SELECT (SELECT COUNT(*) FROM photos)::int AS photos, (SELECT COUNT(*) FROM observations)::int AS readings').catch(() => ({ rows: [{ photos: 0, readings: 0 }] }));
  res.json({ ...rows[0], ...ex.rows[0] });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Flood GIS running at http://localhost:${port}`);
  console.log('Serving front end from:', path.resolve(publicDir));
  try {
    const h = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    console.log(h.includes('id="btnTheme"') ? 'Front end check: NEW design files found.' : 'Front end check: OLD design files found. Replace public/index.html, style.css and app.js.');
  } catch { console.log('Front end check: public/index.html NOT FOUND in the folder above.'); }
});