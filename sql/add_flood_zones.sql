-- Flood-prone zones (polygon layer). Run inside the flood_gis database (pgAdmin Query Tool or psql).
-- Polygons are INDICATIVE student-drawn study areas around known Nullah Leh hotspots, not an official hazard map.
-- Replace with polygons digitised from verified sources (e.g. in QGIS) before final submission.
CREATE TABLE IF NOT EXISTS flood_zones (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  risk_level  VARCHAR(10)  NOT NULL CHECK (risk_level IN ('medium','high')),
  source_note VARCHAR(200),
  geom        geometry(Polygon,4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS flood_zones_geom_idx ON flood_zones USING GIST (geom);
INSERT INTO flood_zones (name,risk_level,source_note,geom) VALUES
('Nullah Leh central Rawalpindi corridor','high','Indicative study area, approximate',
  ST_GeomFromText('POLYGON((73.045 33.595,73.080 33.595,73.080 33.615,73.045 33.615,73.045 33.595))',4326)),
('Nullah Leh upstream, Aabpara to G-6','medium','Indicative study area, approximate',
  ST_GeomFromText('POLYGON((73.055 33.705,73.095 33.705,73.095 33.720,73.055 33.720,73.055 33.705))',4326)),
('Chaklala low-lying belt','medium','Indicative study area, approximate',
  ST_GeomFromText('POLYGON((73.080 33.600,73.100 33.600,73.100 33.612,73.080 33.612,73.080 33.600))',4326));
-- Spatial join example: points per zone
-- SELECT z.name, COUNT(f.id) FROM flood_zones z LEFT JOIN flood_points f ON ST_Within(f.geom,z.geom) GROUP BY z.name;
