-- Urban Flood Observation & Reporting (Rawalpindi / Islamabad)
-- Run from the project root:  psql -U postgres -f sql/create_and_populate.sql
-- NOTE: coordinates are approximate. Replace sample rows with your own verified field data.

CREATE DATABASE flood_gis;
\c flood_gis
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE flood_points (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  area        VARCHAR(80)  NOT NULL,
  city        VARCHAR(20)  NOT NULL CHECK (city IN ('Rawalpindi','Islamabad')),
  description TEXT,
  source_type VARCHAR(10)  NOT NULL CHECK (source_type IN ('official','student')),
  source_note VARCHAR(200),
  severity    VARCHAR(10)  NOT NULL CHECK (severity IN ('low','medium','high','severe')),
  status      VARCHAR(12)  NOT NULL DEFAULT 'reported'
              CHECK (status IN ('reported','under_review','verified','resolved')),
  reported_by VARCHAR(60)  NOT NULL DEFAULT 'anonymous',
  observed_at DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  geom        geometry(Point,4326) NOT NULL
);
CREATE INDEX flood_points_geom_idx ON flood_points USING GIST (geom);

-- Related table: repeated water-level readings for one location
CREATE TABLE observations (
  id             SERIAL PRIMARY KEY,
  point_id       INT NOT NULL REFERENCES flood_points(id) ON DELETE CASCADE,
  water_depth_cm INT NOT NULL CHECK (water_depth_cm BETWEEN 0 AND 500),
  note           VARCHAR(300),
  observed_by    VARCHAR(60) NOT NULL DEFAULT 'anonymous',
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source_type 'official' = locations widely cited in public flood/drainage reporting (Nullah Leh basin);
-- 'student' = sample field observations. Verify/replace before submission.
INSERT INTO flood_points (name,area,city,description,source_type,source_note,severity,status,reported_by,observed_at,geom)
SELECT v.name,v.area,v.city,v.descr,v.src,v.note,v.sev,v.stat,v.by,v.obs::date,ST_SetSRID(ST_MakePoint(v.lng,v.lat),4326)
FROM (VALUES
('Kattarian Bridge','Kattarian','Rawalpindi','Nullah Leh overflow point under the bridge','official','Reference: Nullah Leh flood-prone sites (public reports); approx. location','severe','verified','Admin','2024-07-14',73.0701,33.6012),
('Gawalmandi Bridge','Gawalmandi','Rawalpindi','Low banks beside the nullah','official','Reference: Nullah Leh flood-prone sites; approx. location','severe','verified','Admin','2024-07-14',73.0607,33.6087),
('Dhoke Hassu','Dhoke Hassu','Rawalpindi','Residential lanes flood when nullah rises','official','Reference: Nullah Leh basin reports; approx. location','high','verified','Admin','2024-07-14',73.0470,33.5935),
('Chaklala Scheme III Underpass','Chaklala','Rawalpindi','Underpass fills during heavy rain','official','Reference: news reports of waterlogging; approx. location','high','verified','Admin','2024-07-14',73.0930,33.6065),
('Aabpara Market','Aabpara','Islamabad','Water collects at market entrance','official','Reference: Nullah Leh upstream, Islamabad; approx. location','medium','verified','Admin','2024-07-14',73.0653,33.7099),
('G-6 Nullah Leh Crossing','G-6','Islamabad','Nullah crossing, fast rise after upstream rain','official','Reference: Nullah Leh upstream; approx. location','high','verified','Admin','2024-07-14',73.0795,33.7125),
('Faizabad Interchange','Faizabad','Rawalpindi','Standing water on service roads','official','Reference: news reports of waterlogging; approx. location','medium','verified','Admin','2024-07-14',73.0780,33.6590),
('Committee Chowk','Murree Road','Rawalpindi','Water on Murree Road after 1 h rain','official','Reference: news reports of waterlogging; approx. location','medium','verified','Admin','2024-07-14',73.0589,33.6038),
('Raja Bazaar Main Road','Raja Bazaar','Rawalpindi','Blocked drains, ankle-deep water','student','Sample field observation','medium','under_review','Student A','2025-08-02',73.0543,33.6030),
('Liaquat Bagh Road','Liaquat Bagh','Rawalpindi','Water pooling at road dip','student','Sample field observation','low','reported','Student A','2025-08-02',73.0560,33.6000),
('Saddar Mall Road','Saddar','Rawalpindi','Drain choked with plastic waste','student','Sample field observation','medium','reported','Student B','2025-08-03',73.0436,33.5959),
('Chandni Chowk','Satellite Town','Rawalpindi','Knee-deep water at junction','student','Sample field observation','high','under_review','Student B','2025-08-03',73.0620,33.6405),
('Pirwadhai Mor','Pirwadhai','Rawalpindi','Slow drainage near bus stand','student','Sample field observation','medium','reported','Student C','2025-08-05',73.0350,33.6500),
('Sadiqabad Peshawar Road','Sadiqabad','Rawalpindi','Water covers one lane','student','Sample field observation','low','reported','Student C','2025-08-05',73.0405,33.6360),
('Khayaban-e-Sir Syed Metro Stn','Sir Syed','Rawalpindi','Puddles under metro track','student','Sample field observation','low','resolved','Student D','2025-08-06',73.0610,33.6330),
('I-8 Markaz','I-8','Islamabad','Parking area waterlogged','student','Sample field observation','medium','verified','Student D','2025-08-07',73.0745,33.6660),
('IJP Road Underpass','IJP Road','Islamabad','Water gathers at lowest point','student','Sample field observation','high','under_review','Student E','2025-08-07',73.0850,33.6450),
('Asghar Mall Road','Murree Road','Rawalpindi','Overflowing gully cover','student','Sample field observation','medium','reported','Student E','2025-08-08',73.0570,33.6090),
('Dhoke Ratta','Dhoke Ratta','Rawalpindi','Narrow street, poor slope','student','Sample field observation','low','reported','Student F','2025-08-09',73.0250,33.5970),
('Adiala Road Khasala','Adiala Road','Rawalpindi','Field edge floods onto road','student','Sample field observation','medium','reported','Student F','2025-08-09',73.0380,33.5470),
('Westridge Main Road','Westridge','Rawalpindi','Water at culvert mouth','student','Sample field observation','low','resolved','Student A','2025-08-10',73.0300,33.6050),
('Kashmir Highway Service Road','Zero Point','Islamabad','Runoff pools beside the service lane','student','Sample field observation','low','reported','Student B','2025-08-11',73.0600,33.6900)
) AS v(name,area,city,descr,src,note,sev,stat,by,obs,lng,lat);

INSERT INTO observations (point_id,water_depth_cm,note,observed_by) VALUES
(1,120,'Water over the bridge approach','Admin'),(1,60,'Receding','Admin'),
(2,90,'Banks overtopped','Admin'),(12,40,'Knee-deep','Student B'),
(17,30,'Underpass partly closed','Student E'),(9,10,'Ankle-deep','Student A');

-- ===== Example queries (retrieve, filter, count, update, spatial) =====
-- SELECT * FROM flood_points WHERE severity='high' AND city='Rawalpindi';
-- SELECT source_type, COUNT(*) FROM flood_points GROUP BY source_type;
-- SELECT severity, COUNT(*) FROM flood_points GROUP BY severity ORDER BY 2 DESC;
-- UPDATE flood_points SET status='verified', updated_at=now() WHERE id=9;
-- Points within 1 km of Kattarian Bridge:
-- SELECT name, ROUND(ST_Distance(geom::geography,(SELECT geom::geography FROM flood_points WHERE id=1))) AS metres
--   FROM flood_points WHERE ST_DWithin(geom::geography,(SELECT geom::geography FROM flood_points WHERE id=1),1000) ORDER BY 2;
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
-- v5 upgrade: feature type (category) + 26 more records (total 48). Safe to run once in pgAdmin on flood_gis.
-- New rows are documented SAMPLE records with approximate locations; replace/verify with field data.
ALTER TABLE flood_points ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'road';
ALTER TABLE flood_points DROP CONSTRAINT IF EXISTS flood_points_category_chk;
ALTER TABLE flood_points ADD CONSTRAINT flood_points_category_chk
  CHECK (category IN ('bridge','underpass','junction','market','road','nullah','residential','transit','drain'));
UPDATE flood_points SET category = CASE
  WHEN name ILIKE '%bridge%' THEN 'bridge' WHEN name ILIKE '%underpass%' THEN 'underpass'
  WHEN name ILIKE '%metro%' THEN 'transit' WHEN name ILIKE '%crossing%' OR name ILIKE '%nullah%' THEN 'nullah'
  WHEN name ILIKE '%chowk%' OR name ILIKE '%interchange%' OR name ILIKE '%mor' THEN 'junction'
  WHEN name ILIKE '%market%' OR name ILIKE '%bazaar%' OR name ILIKE '%mall%' OR name ILIKE '%markaz%' THEN 'market'
  WHEN name ILIKE '%dhoke%' THEN 'residential' ELSE 'road' END
WHERE id <= 22;

INSERT INTO flood_points (name,area,city,category,severity,status,observed_at,description,source_type,source_note,reported_by,geom)
SELECT v.n,v.a,v.c,v.cat,v.sev,v.st,v.d::date,v.ds,'student','Documented sample record, approximate location; verify on site','Student field team',
       ST_SetSRID(ST_MakePoint(v.lng,v.lat),4326)
FROM (VALUES
('Waris Khan Metro Stop','Waris Khan','Rawalpindi','transit','medium','reported','2025-08-14','Ponding beside the station access ramp',73.0595,33.6130),
('Marrir Chowk','Marrir Hassan','Rawalpindi','junction','medium','reported','2025-08-14','Water collects at the junction dip',73.0520,33.5985),
('Rehmanabad Chowk','Rehmanabad','Rawalpindi','junction','high','under_review','2025-09-03','Slow drainage on all four arms',73.0690,33.6450),
('Shamsabad Murree Road','Shamsabad','Rawalpindi','road','medium','reported','2025-09-03','Roadside drain overflows onto the carriageway',73.0170,33.6315),
('Dhoke Kala Khan Road','Dhoke Kala Khan','Rawalpindi','road','low','reported','2025-09-10','Shallow puddling after short rain',73.0455,33.6180),
('Dhoke Khabba Culvert','Dhoke Khabba','Rawalpindi','nullah','severe','under_review','2026-06-20','Culvert mouth chokes with debris',73.0535,33.5905),
('Chaklala Scheme III Drain','Chaklala Scheme III','Rawalpindi','drain','medium','reported','2026-06-20','Open drain spills at the bend',73.0990,33.6000),
('Tench Bhatta Main Road','Tench Bhatta','Rawalpindi','road','medium','verified','2026-06-28','Knee-deep water outside shops',73.0540,33.6260),
('Peshawar Road Underpass','Peshawar Road','Rawalpindi','underpass','high','under_review','2026-07-05','Underpass partly closed during rain',73.0150,33.6510),
('Bank Road Market','Bank Road','Rawalpindi','market','medium','reported','2026-07-05','Blocked gullies near the market entrance',73.0495,33.5990),
('Bohar Bazaar','Bohar Bazaar','Rawalpindi','market','low','reported','2026-07-12','Narrow lane holds water',73.0580,33.6045),
('Satellite Town Block D','Satellite Town','Rawalpindi','residential','low','resolved','2026-07-12','Street flooding cleared after desilting',73.0680,33.6330),
('Gulzar-e-Quaid Colony','Gulzar-e-Quaid','Rawalpindi','residential','medium','reported','2026-07-18','Low-lying lanes near the drain',73.1090,33.5920),
('Lalazar Lane','Lalazar','Rawalpindi','residential','medium','reported','2026-07-18','Water backs up from the nullah',73.0700,33.6050),
('F-6 Supermarket Parking','F-6','Islamabad','market','low','reported','2026-07-22','Parking lot ponds after heavy rain',73.0780,33.7290),
('G-7 Jinnah Super','G-7','Islamabad','market','low','resolved','2026-07-22','Drain cleared by the civic team',73.0540,33.7150),
('G-8 Markaz','G-8','Islamabad','market','medium','reported','2026-07-25','Standing water at the service road',73.0480,33.7080),
('G-9 Nullah Crossing','G-9','Islamabad','nullah','high','under_review','2026-07-25','Fast rise at the crossing',73.0450,33.6990),
('H-8 Hospital Road','H-8','Islamabad','road','medium','reported','2026-08-02','Water on one lane near the hospital',73.0560,33.6840),
('I-9 Industrial Drain','I-9','Islamabad','drain','medium','verified','2026-08-02','Industrial-area drain overflows',73.0600,33.6560),
('I-10 Markaz','I-10','Islamabad','market','low','reported','2026-08-06','Shallow ponding on the market road',73.0310,33.6480),
('Faizabad Metro Station','Faizabad','Islamabad','transit','medium','reported','2026-08-06','Water at the station approach',73.0840,33.6600),
('Zero Point Slip Road','Zero Point','Islamabad','road','low','reported','2026-08-10','Runoff collects on the slip road',73.0690,33.6930),
('Kashmir Chowk','Kashmir Chowk','Islamabad','junction','medium','under_review','2026-08-10','Ponding at the roundabout',73.0730,33.6870),
('Margalla Road Culvert','Margalla Road','Islamabad','nullah','severe','verified','2026-08-14','Hill runoff surges through the culvert',73.0780,33.7380),
('Rawal Dam Link Road','Rawal Dam Link','Islamabad','road','low','reported','2026-08-14','Occasional water on the road edge',73.1100,33.6940)
) AS v(n,a,c,cat,sev,st,d,ds,lng,lat)
WHERE NOT EXISTS (SELECT 1 FROM flood_points f WHERE f.name = v.n);

INSERT INTO observations (point_id,water_depth_cm,note,observed_by)
SELECT f.id,x.depth,x.note,'Student field team'
FROM (VALUES ('Rehmanabad Chowk',35,'Knee-deep at peak'),('Dhoke Khabba Culvert',70,'Culvert overtopped'),
 ('Margalla Road Culvert',85,'Strong flow'),('Peshawar Road Underpass',55,'Closed to small cars'),
 ('Tench Bhatta Main Road',25,'Ankle to shin deep'),('G-9 Nullah Crossing',45,'Rising fast')) AS x(nm,depth,note)
JOIN flood_points f ON f.name = x.nm
WHERE NOT EXISTS (SELECT 1 FROM observations o WHERE o.point_id = f.id AND o.note = x.note);