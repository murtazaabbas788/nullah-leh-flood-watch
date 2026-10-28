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