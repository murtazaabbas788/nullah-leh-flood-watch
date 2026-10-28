-- 1. Retrieve flood points
SELECT id, name, city, severity
FROM flood_points
LIMIT 10;

-- 2. Filter high-severity locations
SELECT id, name, severity
FROM flood_points
WHERE severity = 'high';

-- 3. Count all flood points
SELECT COUNT(*) AS total_points
FROM flood_points;

-- 4. Demonstrate updating a record without saving changes
BEGIN;

UPDATE flood_points
SET severity = 'medium'
WHERE id = 1
RETURNING id, name, severity;

ROLLBACK;