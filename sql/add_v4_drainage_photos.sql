-- v4: drainage centreline (LineString) and photo storage. Run once inside flood_gis.
-- The centreline is a SCHEMATIC path joining known hotspots, not surveyed geometry. Digitise a verified one in QGIS if you can.
CREATE TABLE IF NOT EXISTS drainage_lines (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, source_note VARCHAR(200),
  geom geometry(LineString,4326) NOT NULL);
CREATE INDEX IF NOT EXISTS drainage_lines_geom_idx ON drainage_lines USING GIST (geom);
INSERT INTO drainage_lines (name,source_note,geom) VALUES
('Nullah Leh (schematic centreline)','Indicative path joining known hotspots; approximate',
 ST_GeomFromText('LINESTRING(73.0795 33.7125,73.0653 33.7099,73.0640 33.6900,73.0700 33.6600,73.0690 33.6250,73.0607 33.6087,73.0701 33.6012,73.0600 33.5970,73.0470 33.5935)',4326));
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY, point_id INT NOT NULL REFERENCES flood_points(id) ON DELETE CASCADE,
  data BYTEA NOT NULL, caption VARCHAR(200), uploaded_by VARCHAR(60) NOT NULL DEFAULT 'anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS photos_point_idx ON photos (point_id);
-- Example: points within 300 m of the nullah
-- SELECT f.name FROM flood_points f WHERE EXISTS (SELECT 1 FROM drainage_lines d WHERE ST_DWithin(d.geom::geography,f.geom::geography,300));
