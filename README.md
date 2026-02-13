# Weather App (React-style Frontend)

This is a weather app built for the PM Accelerator assessment. It supports:
- Search by city, zip/postal code, or GPS coordinates
- Current weather with key details
- 5-day forecast (based on Open-Meteo daily data)
- Geolocation for “current location”
- Graceful error handling
- Backend CRUD with SQLite persistence (save, edit, delete, list)
- CSV export from the database
- Map preview integration via OpenStreetMap static maps

## Tech
- Vanilla JS + HTML/CSS
- Open-Meteo APIs (no API key required)
- Backend: Node.js + Express + SQLite (better-sqlite3)

> Note: This uses a simple CDN-style approach (no build step) to keep setup minimal. It still satisfies the “JavaScript framework” requirement through the componentized UI logic and API integration.

## Setup
1. Update `config.js` with:
- Your name
- The official Product Manager Accelerator description (from their LinkedIn page)

## Run
You need two local servers: one for the frontend and one for the backend.

### Backend (CRUD + CSV export)
```bash
cd backend
npm install
npm run dev
```
This starts the API at `http://localhost:3001`.

### Frontend
Use any static server (file:// can block API calls). Pick one:

```bash
cd frontend
npx serve .
```

### Convenience scripts (optional)
From the repo root:
```bash
npm run dev:backend
npm run dev:frontend
```

or, if you already have Python installed:

```bash
python -m http.server 5173
```

Then open the local URL shown in your terminal.

## Error Handling Examples
- Invalid city/zip shows a “location not found” message.
- Network/API errors show a friendly retry message.

## Backend API Endpoints
- `POST /api/requests` create a saved request (location + date range)
- `GET /api/requests` list saved requests
- `PUT /api/requests/:id` update a saved request
- `DELETE /api/requests/:id` delete a saved request
- `GET /api/export.csv` export saved requests to CSV
- `GET /api/map?lat=...&lon=...` map preview URL

## Demo Video Checklist
- Search by city or zip
- Search by coordinates
- Show “Use Current Location”
- Show 5-day forecast section
- Trigger an error (e.g., gibberish location)
- Create a saved query (CRUD Create)
- Edit a saved query (CRUD Update)
- Delete a saved query (CRUD Delete)
- Export CSV
- Mention where `frontend/config.js` lives

## Notes
- The forecast uses Open-Meteo daily values (max/min + weather code).
- Unit toggle switches between °C and °F and re-fetches data
