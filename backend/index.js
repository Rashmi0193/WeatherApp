import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "weatherapp.sqlite");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_query TEXT NOT NULL,
    location_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    units TEXT NOT NULL,
    daily_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const insertRequest = db.prepare(`
  INSERT INTO requests (
    location_query,
    location_name,
    latitude,
    longitude,
    start_date,
    end_date,
    units,
    daily_json,
    created_at,
    updated_at
  ) VALUES (
    @location_query,
    @location_name,
    @latitude,
    @longitude,
    @start_date,
    @end_date,
    @units,
    @daily_json,
    @created_at,
    @updated_at
  );
`);

const updateRequest = db.prepare(`
  UPDATE requests
  SET
    location_query = @location_query,
    location_name = @location_name,
    latitude = @latitude,
    longitude = @longitude,
    start_date = @start_date,
    end_date = @end_date,
    units = @units,
    daily_json = @daily_json,
    updated_at = @updated_at
  WHERE id = @id;
`);

const selectAll = db.prepare("SELECT * FROM requests ORDER BY created_at DESC;");
const selectOne = db.prepare("SELECT * FROM requests WHERE id = ?;");
const deleteOne = db.prepare("DELETE FROM requests WHERE id = ?;");

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime());
}

function compareDate(a, b) {
  return new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z");
}

function dateToISO(date) {
  return date.toISOString().split("T")[0];
}

function validateDateRange(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return "Dates must be in YYYY-MM-DD format.";
  }
  if (compareDate(startDate, endDate) > 0) {
    return "Start date must be before end date.";
  }
  const maxDays = 31;
  const days = Math.round(
    (new Date(endDate + "T00:00:00Z") - new Date(startDate + "T00:00:00Z")) /
      (1000 * 60 * 60 * 24)
  );
  if (days > maxDays) {
    return `Date range must be ${maxDays} days or fewer.`;
  }
  return null;
}

function parseCoordinates(input) {
  const match = String(input)
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return {
    lat: parseFloat(match[1]),
    lon: parseFloat(match[2]),
    name: `Coordinates (${match[1]}, ${match[2]})`,
  };
}

async function geocodeLocation(query) {
  const coords = parseCoordinates(query);
  if (coords) return coords;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=1&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Geocoding service error. Please try again.");
  }
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("Location not found. Try another search.");
  }
  const result = data.results[0];
  return {
    lat: result.latitude,
    lon: result.longitude,
    name: `${result.name}${result.admin1 ? ", " + result.admin1 : ""}${
      result.country ? ", " + result.country : ""
    }`,
  };
}

async function fetchDailyWeather({ lat, lon, startDate, endDate, units }) {
  const tempUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const today = dateToISO(new Date());

  const ranges = [];
  if (compareDate(endDate, today) < 0) {
    ranges.push({
      type: "archive",
      start: startDate,
      end: endDate,
    });
  } else if (compareDate(startDate, today) > 0) {
    ranges.push({
      type: "forecast",
      start: startDate,
      end: endDate,
    });
  } else {
    const yesterday = dateToISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (compareDate(startDate, yesterday) <= 0) {
      ranges.push({
        type: "archive",
        start: startDate,
        end: yesterday,
      });
    }
    ranges.push({
      type: "forecast",
      start: today,
      end: endDate,
    });
  }

  const results = new Map();

  for (const range of ranges) {
    const baseUrl =
      range.type === "archive"
        ? "https://archive-api.open-meteo.com/v1/archive"
        : "https://api.open-meteo.com/v1/forecast";

    const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${range.start}&end_date=${range.end}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=${tempUnit}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Weather service error. Please try again later.");
    }
    const data = await res.json();
    const daily = data.daily;
    if (!daily || !daily.time) continue;

    daily.time.forEach((date, index) => {
      results.set(date, {
        date,
        tempMax: daily.temperature_2m_max?.[index],
        tempMin: daily.temperature_2m_min?.[index],
        weathercode: daily.weathercode?.[index],
      });
    });
  }

  return Array.from(results.values()).sort((a, b) => compareDate(a.date, b.date));
}

function toCsv(rows) {
  const headers = [
    "id",
    "location_query",
    "location_name",
    "latitude",
    "longitude",
    "start_date",
    "end_date",
    "units",
    "daily_json",
    "created_at",
    "updated_at",
  ];

  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = headers.map((key) => escape(row[key])).join(",");
    lines.push(line);
  });
  return lines.join("\n");
}

app.get("/api/requests", (req, res) => {
  const rows = selectAll.all().map((row) => ({
    ...row,
    daily: JSON.parse(row.daily_json),
  }));
  res.json(rows);
});

app.get("/api/requests/:id", (req, res) => {
  const row = selectOne.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Record not found." });
  res.json({ ...row, daily: JSON.parse(row.daily_json) });
});

app.post("/api/requests", async (req, res) => {
  try {
    const { location, startDate, endDate, units = "metric" } = req.body || {};
    if (!location || typeof location !== "string") {
      return res.status(400).json({ error: "Location is required." });
    }

    const dateError = validateDateRange(startDate, endDate);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const geo = await geocodeLocation(location);
    const daily = await fetchDailyWeather({
      lat: geo.lat,
      lon: geo.lon,
      startDate,
      endDate,
      units,
    });

    const now = new Date().toISOString();
    const payload = {
      location_query: location,
      location_name: geo.name,
      latitude: geo.lat,
      longitude: geo.lon,
      start_date: startDate,
      end_date: endDate,
      units,
      daily_json: JSON.stringify(daily),
      created_at: now,
      updated_at: now,
    };

    const info = insertRequest.run(payload);
    const row = selectOne.get(info.lastInsertRowid);
    res.status(201).json({ ...row, daily });
  } catch (error) {
    res.status(500).json({ error: error.message || "Server error." });
  }
});

app.put("/api/requests/:id", async (req, res) => {
  try {
    const existing = selectOne.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Record not found." });

    const { location, startDate, endDate, units = existing.units } = req.body || {};
    if (!location || typeof location !== "string") {
      return res.status(400).json({ error: "Location is required." });
    }

    const dateError = validateDateRange(startDate, endDate);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const geo = await geocodeLocation(location);
    const daily = await fetchDailyWeather({
      lat: geo.lat,
      lon: geo.lon,
      startDate,
      endDate,
      units,
    });

    const now = new Date().toISOString();

    updateRequest.run({
      id: existing.id,
      location_query: location,
      location_name: geo.name,
      latitude: geo.lat,
      longitude: geo.lon,
      start_date: startDate,
      end_date: endDate,
      units,
      daily_json: JSON.stringify(daily),
      updated_at: now,
    });

    const row = selectOne.get(existing.id);
    res.json({ ...row, daily });
  } catch (error) {
    res.status(500).json({ error: error.message || "Server error." });
  }
});

app.delete("/api/requests/:id", (req, res) => {
  const existing = selectOne.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Record not found." });
  deleteOne.run(req.params.id);
  res.json({ success: true });
});

app.get("/api/export.csv", (req, res) => {
  const rows = selectAll.all();
  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=weather-requests.csv");
  res.send(csv);
});

app.get("/api/map", (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon are required." });
  }
  const latitude = Number(lat);
  const longitude = Number(lon);
  const delta = 0.05;
  const left = (longitude - delta).toFixed(5);
  const right = (longitude + delta).toFixed(5);
  const top = (latitude + delta).toFixed(5);
  const bottom = (latitude - delta).toFixed(5);
  const bbox = `${left},${bottom},${right},${top}`;
  const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=11/${latitude}/${longitude}`;
  res.json({ mapEmbedUrl, mapLink });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
