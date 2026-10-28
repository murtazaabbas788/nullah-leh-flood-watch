# Nullah Leh Flood Watch
### Urban Flood Observation & Reporting System — Web GIS Assignment 2

**Live Website:** https://floodwatch-nullahleh.vercel.app/

## Project Overview

Nullah Leh Flood Watch is a database-driven Web GIS application that I developed to visualize and manage flood-prone locations in Rawalpindi and Islamabad, Pakistan.

I used PostgreSQL/PostGIS to store spatial records, Node.js and Express to develop the backend API, and Leaflet to display the information on an interactive map.

The application supports flood-point reporting, searching, filtering, editing, spatial analysis, and additional map visualization tools.

## Technologies Used

- **Database:** PostgreSQL and PostGIS
- **Backend:** Node.js, Express.js, `pg`
- **Frontend:** HTML, CSS, JavaScript, Leaflet
- **Cloud Database:** Neon PostgreSQL
- **Hosting:** Vercel
- **Weather Information:** Open-Meteo API

## Main Features

### 1. Spatial Database
- 48 example/reference flood-prone locations
- PostGIS point geometries using EPSG:4326
- GiST spatial indexing
- Related water-depth observations
- Drainage-line and indicative flood-zone polygon layers

### 2. Interactive Web Map
- Severity-based markers and feature-category icons
- Marker clustering and heatmap
- Four basemaps: Streets, Satellite, Terrain, and Dark
- Interactive popups showing location details
- Map legend and layer visibility controls

### 3. Search and Filtering
- Location search
- Filtering by severity, category, city, status, and source
- Nearby location searches
- Distance-based queries using PostGIS

### 4. Flood Reporting and Record Management
- Report flood-related locations through a website form
- Edit existing flood-point information
- Add water-depth readings
- Attach optional photo evidence
- Input validation and permission-controlled operations

### 5. Additional Tools
- Indicative rainfall information from Open-Meteo
- Event timeline
- Data statistics and quality checks
- CSV and GeoJSON exports
- Responsive layout for desktop and mobile devices

## Database Structure

The application uses PostgreSQL with PostGIS for spatial data management.

The main spatial and related tables include:

| Table | Purpose |
|---|---|
| `flood_points` | Stores flood-related location information and point geometries |
| `observations` | Stores water-depth observations |
| `flood_zones` | Stores indicative polygon study areas |
| `drainage_lines` | Stores mapped drainage geometry |
| `photos` | Stores optional photo evidence |

Spatial queries use PostGIS functions including `ST_DWithin` and `ST_Distance`.

## API

The Express backend provides endpoints for:

- Retrieving and searching flood points
- Retrieving individual point details
- Nearby searches
- Database statistics
- Adding and updating records
- Adding observations
- Loading drainage lines and flood-zone polygons
- Health checking

Examples:

```text
GET /api/health
GET /api/points
GET /api/points/:id
GET /api/nearby
GET /api/stats
GET /api/zones
GET /api/drainage
```

The API returns JSON responses that are used by the Leaflet frontend.

## Local Setup

### Requirements

- Node.js
- PostgreSQL
- PostGIS
- npm

### Steps

1. Clone the GitHub repository.
2. Open the project folder.
3. Create a PostgreSQL database named `flood_gis`.
4. Enable PostGIS and initialize the database using the appropriate SQL setup files.
5. Install Node.js dependencies:

```bash
npm install
```

6. Configure the required environment variables in a local `.env` file, using your own database credentials and access tokens.
7. Start the application:

```bash
npm start
```

8. Open the local address shown in the terminal, normally:

```text
http://localhost:3000
```

**Security:** Do not commit `.env` or any real database passwords or authentication tokens to GitHub.

## Deployment

The frontend and Express backend are deployed on **Vercel**, while the PostgreSQL/PostGIS database is hosted on **Neon**.

**Live Application:** https://floodwatch-nullahleh.vercel.app/

## Data Limitations

This application was developed for educational purposes.

- The 48 seeded records include example/reference locations with approximate information.
- Source labels such as `official` or `student` describe dataset categories and should not be treated as independent verification.
- Flood-zone polygons are indicative demonstration areas, not officially validated flood-hazard boundaries.
- The rainfall panel provides general weather context, not an official flood forecast or emergency warning.

The application should not be used as an official flood-warning system.

## Author

**Murtaza Bin Abbas**  
BS Remote Sensing & GIS  
COMSATS University Islamabad  
Course: Web GIS Application — Lab Assignment 2

## Conclusion

Through this project, I developed a functional database-driven Web GIS application integrating PostgreSQL/PostGIS, Express.js, and Leaflet. The application demonstrates spatial data storage, REST API development, interactive mapping, searching, filtering, record management, and cloud deployment.
