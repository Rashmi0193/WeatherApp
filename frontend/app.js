/* global CONFIG */

const state = {
  units: "metric",
  lastQuery: null,
  editingId: null,
};

const API_BASE = "https://weatherapp-7l5h.onrender.com";

const elements = {
  locationInput: document.getElementById("locationInput"),
  searchBtn: document.getElementById("searchBtn"),
  geoBtn: document.getElementById("geoBtn"),
  unitToggle: document.getElementById("unitToggle"),
  error: document.getElementById("error"),
  currentSection: document.getElementById("currentSection"),
  forecastSection: document.getElementById("forecastSection"),
  forecastGrid: document.getElementById("forecastGrid"),
  placeName: document.getElementById("placeName"),
  timestamp: document.getElementById("timestamp"),
  currentIcon: document.getElementById("currentIcon"),
  temp: document.getElementById("temp"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  wind: document.getElementById("wind"),
  conditions: document.getElementById("conditions"),
  authorName: document.getElementById("authorName"),
  pmDescription: document.getElementById("pmDescription"),
  rangeLocation: document.getElementById("rangeLocation"),
  rangeStart: document.getElementById("rangeStart"),
  rangeEnd: document.getElementById("rangeEnd"),
  saveRangeBtn: document.getElementById("saveRangeBtn"),
  updateRangeBtn: document.getElementById("updateRangeBtn"),
  cancelUpdateBtn: document.getElementById("cancelUpdateBtn"),
  crudError: document.getElementById("crudError"),
  requestsList: document.getElementById("requestsList"),
  exportCsv: document.getElementById("exportCsv"),
};

function init() {
  if (CONFIG && CONFIG.authorName) {
    elements.authorName.textContent = CONFIG.authorName;
  }

  if (CONFIG && CONFIG.pmDescription) {
    elements.pmDescription.textContent = CONFIG.pmDescription;
  }

  elements.searchBtn.addEventListener("click", handleSearch);
  elements.locationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  });

  elements.geoBtn.addEventListener("click", handleGeoSearch);
  elements.unitToggle.addEventListener("click", toggleUnits);

  elements.saveRangeBtn.addEventListener("click", handleSaveRange);
  elements.updateRangeBtn.addEventListener("click", handleUpdateRange);
  elements.cancelUpdateBtn.addEventListener("click", cancelEdit);
  elements.exportCsv.href = `${API_BASE}/api/export.csv`;

  const { startDate, endDate } = getDefaultDateRange();
  elements.rangeStart.value = startDate;
  elements.rangeEnd.value = endDate;

  loadRequests();
}

function showError(message) {
  elements.error.textContent = message;
}

function clearError() {
  elements.error.textContent = "";
}

function showCrudError(message) {
  elements.crudError.textContent = message;
}

function clearCrudError() {
  elements.crudError.textContent = "";
}

function toggleUnits() {
  state.units = state.units === "metric" ? "imperial" : "metric";
  elements.unitToggle.textContent = state.units === "metric" ? "°F" : "°C";

  if (state.lastQuery) {
    fetchWeather(state.lastQuery);
  }
}

function handleSearch() {
  const input = elements.locationInput.value.trim();
  if (!input) {
    showError("Please enter a location.");
    return;
  }

  clearError();
  resolveLocation(input)
    .then((coords) => {
      state.lastQuery = coords;
      fetchWeather(coords);
      autoSaveSearch(input);
    })
    .catch((err) => {
      showError(err.message || "Unable to find that location.");
    });
}

function handleGeoSearch() {
  clearError();
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        name: "Your Current Location",
      };
      state.lastQuery = coords;
      fetchWeather(coords);
      autoSaveSearch(`${coords.lat}, ${coords.lon}`);
    },
    () => {
      showError("Unable to access your location. Please allow permissions.");
    }
  );
}

function resolveLocation(input) {
  const latLonMatch = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (latLonMatch) {
    return Promise.resolve({
      lat: parseFloat(latLonMatch[1]),
      lon: parseFloat(latLonMatch[2]),
      name: `Coordinates (${latLonMatch[1]}, ${latLonMatch[2]})`,
    });
  }

  return fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      input
    )}&count=1&language=en&format=json`
  ).then((data) => {
    if (!data || !data.results || data.results.length === 0) {
      throw new Error("Location not found. Try a city, zip, or coordinates.");
    }
    const result = data.results[0];
    return {
      lat: result.latitude,
      lon: result.longitude,
      name: `${result.name}${result.admin1 ? ", " + result.admin1 : ""}${
        result.country ? ", " + result.country : ""
      }`,
    };
  });
}

function fetchWeather(coords) {
  const tempUnit = state.units === "metric" ? "celsius" : "fahrenheit";
  const windUnit = state.units === "metric" ? "ms" : "mph";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&hourly=relativehumidity_2m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto`;

  fetchJson(url)
    .then((data) => {
      renderCurrent(data, coords.name);
      renderForecast(data);
      elements.currentSection.hidden = false;
      elements.forecastSection.hidden = false;
    })
    .catch((err) => {
      showError(err.message || "Failed to load weather data.");
    });
}

function renderCurrent(data, fallbackName) {
  const current = data.current_weather;
  const weather = weatherCodeInfo(current?.weathercode);
  const description = weather.label || "—";
  const unitsLabel = state.units === "metric" ? "°C" : "°F";
  const windLabel = state.units === "metric" ? "m/s" : "mph";
  const humidity = findCurrentHourlyValue(
    data.hourly?.time,
    data.hourly?.relativehumidity_2m,
    current?.time
  );
  const feelsLike = findCurrentHourlyValue(
    data.hourly?.time,
    data.hourly?.apparent_temperature,
    current?.time
  );

  elements.placeName.textContent = fallbackName || "Unknown";
  elements.timestamp.textContent = formatTimeIso(current?.time);
  elements.currentIcon.src = weather.icon;
  elements.currentIcon.alt = description;
  elements.temp.textContent = `${Math.round(current?.temperature ?? 0)}${unitsLabel}`;
  elements.feelsLike.textContent =
    feelsLike !== null ? `${Math.round(feelsLike)}${unitsLabel}` : "—";
  elements.humidity.textContent =
    humidity !== null ? `${Math.round(humidity)}%` : "—";
  elements.wind.textContent =
    current?.windspeed !== undefined
      ? `${Math.round(current.windspeed)} ${windLabel}`
      : "—";
  elements.conditions.textContent = capitalize(description);
}

function renderForecast(data) {
  const daily = buildDailyForecast(data.daily);
  const unitsLabel = state.units === "metric" ? "°C" : "°F";

  elements.forecastGrid.innerHTML = "";

  daily.forEach((day) => {
    const card = document.createElement("div");
    card.className = "forecast-card";

    card.innerHTML = `
      <strong>${day.label}</strong>
      <img src="${day.icon}" alt="${day.description}" />
      <span>${capitalize(day.description)}</span>
      <span>High: ${Math.round(day.tempMax)}${unitsLabel}</span>
      <span>Low: ${Math.round(day.tempMin)}${unitsLabel}</span>
    `;

    elements.forecastGrid.appendChild(card);
  });
}

function buildDailyForecast(daily) {
  if (!daily || !daily.time) return [];

  const results = daily.time.map((date, index) => {
    const weather = weatherCodeInfo(daily.weathercode?.[index]);
    return {
      date,
      label: formatDayIso(date),
      icon: weather.icon,
      description: weather.label,
      tempMax: daily.temperature_2m_max?.[index],
      tempMin: daily.temperature_2m_min?.[index],
    };
  });

  return results.slice(0, 5);
}

function formatTimeIso(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayIso(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function capitalize(text) {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fetchJson(url) {
  return fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error("Weather service error. Please try again later.");
    }
    return res.json();
  });
}

function fetchApi(url, options) {
  return fetch(url, options).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Server error. Please try again.");
    }
    return data;
  });
}

function findCurrentHourlyValue(times, values, currentTime) {
  if (!times || !values || !currentTime) return null;
  const target = new Date(currentTime).getTime();
  if (Number.isNaN(target)) return null;

  let bestIndex = -1;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i += 1) {
    const time = new Date(times[i]).getTime();
    if (Number.isNaN(time)) continue;
    const diff = Math.abs(time - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;
  return values[bestIndex];
}

function weatherCodeInfo(code) {
  const numeric = Number(code);
  const mapping = {
    0: { label: "Clear sky", emoji: "☀️" },
    1: { label: "Mainly clear", emoji: "🌤️" },
    2: { label: "Partly cloudy", emoji: "⛅" },
    3: { label: "Overcast", emoji: "☁️" },
    45: { label: "Fog", emoji: "🌫️" },
    48: { label: "Rime fog", emoji: "🌫️" },
    51: { label: "Light drizzle", emoji: "🌦️" },
    53: { label: "Drizzle", emoji: "🌦️" },
    55: { label: "Heavy drizzle", emoji: "🌧️" },
    61: { label: "Light rain", emoji: "🌧️" },
    63: { label: "Rain", emoji: "🌧️" },
    65: { label: "Heavy rain", emoji: "🌧️" },
    66: { label: "Freezing rain", emoji: "🌧️" },
    67: { label: "Heavy freezing rain", emoji: "🌧️" },
    71: { label: "Light snow", emoji: "🌨️" },
    73: { label: "Snow", emoji: "🌨️" },
    75: { label: "Heavy snow", emoji: "❄️" },
    77: { label: "Snow grains", emoji: "❄️" },
    80: { label: "Rain showers", emoji: "🌦️" },
    81: { label: "Rain showers", emoji: "🌧️" },
    82: { label: "Heavy showers", emoji: "🌧️" },
    85: { label: "Snow showers", emoji: "🌨️" },
    86: { label: "Heavy snow showers", emoji: "❄️" },
    95: { label: "Thunderstorm", emoji: "⛈️" },
    96: { label: "Thunderstorm hail", emoji: "⛈️" },
    99: { label: "Heavy thunderstorm", emoji: "⛈️" },
  };

  const info = mapping[numeric] || { label: "Unknown", emoji: "🌡️" };
  return {
    label: info.label,
    icon: emojiToDataUri(info.emoji),
  };
}

function emojiToDataUri(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><text x="50%" y="58%" text-anchor="middle" font-size="48">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function handleSaveRange() {
  const location = elements.rangeLocation.value.trim();
  const startDate = elements.rangeStart.value;
  const endDate = elements.rangeEnd.value;

  if (!location || !startDate || !endDate) {
    showCrudError("Please enter a location and date range.");
    return;
  }

  clearCrudError();
  fetchApi(`${API_BASE}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location,
      startDate,
      endDate,
      units: state.units,
    }),
  })
    .then(() => {
      elements.rangeLocation.value = "";
      elements.rangeStart.value = "";
      elements.rangeEnd.value = "";
      loadRequests();
    })
    .catch((err) => showCrudError(err.message));
}

function getDefaultDateRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 4);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

function autoSaveSearch(location) {
  if (!location) return;
  const { startDate, endDate } = getDefaultDateRange();
  elements.rangeLocation.value = location;
  elements.rangeStart.value = startDate;
  elements.rangeEnd.value = endDate;

  fetchApi(`${API_BASE}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location,
      startDate,
      endDate,
      units: state.units,
    }),
  })
    .then(() => {
      loadRequests();
    })
    .catch((err) => showCrudError(err.message));
}

function handleUpdateRange() {
  if (!state.editingId) return;
  const location = elements.rangeLocation.value.trim();
  const startDate = elements.rangeStart.value;
  const endDate = elements.rangeEnd.value;

  if (!location || !startDate || !endDate) {
    showCrudError("Please enter a location and date range.");
    return;
  }

  clearCrudError();
  fetchApi(`${API_BASE}/api/requests/${state.editingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location,
      startDate,
      endDate,
      units: state.units,
    }),
  })
    .then(() => {
      cancelEdit();
      loadRequests();
    })
    .catch((err) => showCrudError(err.message));
}

function cancelEdit() {
  state.editingId = null;
  elements.updateRangeBtn.disabled = true;
  elements.cancelUpdateBtn.disabled = true;
  elements.saveRangeBtn.disabled = false;
  elements.rangeLocation.value = "";
  elements.rangeStart.value = "";
  elements.rangeEnd.value = "";
  clearCrudError();
}

function startEdit(record) {
  state.editingId = record.id;
  elements.rangeLocation.value = record.location_query;
  elements.rangeStart.value = record.start_date;
  elements.rangeEnd.value = record.end_date;
  elements.updateRangeBtn.disabled = false;
  elements.cancelUpdateBtn.disabled = false;
  elements.saveRangeBtn.disabled = true;
}

function handleDelete(id) {
  fetchApi(`${API_BASE}/api/requests/${id}`, { method: "DELETE" })
    .then(() => loadRequests())
    .catch((err) => showCrudError(err.message));
}

function loadRequests() {
  fetchApi(`${API_BASE}/api/requests`)
    .then((data) => renderRequests(data))
    .catch((err) => showCrudError(err.message));
}

function renderRequests(records) {
  elements.requestsList.innerHTML = "";
  if (!records.length) {
    elements.requestsList.innerHTML = "<div class=\"hint\">No saved requests yet.</div>";
    return;
  }

  records.forEach((record) => {
    const card = document.createElement("div");
    card.className = "request-card";

    const dailyPreview = (record.daily || [])
      .slice(0, 3)
      .map(
        (day) =>
          `${day.date}: ${Math.round(day.tempMax)} / ${Math.round(day.tempMin)}`
      )
      .join(" | ");

    card.innerHTML = `
      <strong>${record.location_name}</strong>
      <div class="request-meta">
        <span>Range: ${record.start_date} → ${record.end_date}</span>
        <span>Units: ${record.units}</span>
        <span>Sample temps: ${dailyPreview || "—"}</span>
      </div>
      <div class="request-actions">
        <button class="button secondary" data-edit="${record.id}">Edit</button>
        <button class="button secondary" data-delete="${record.id}">Delete</button>
        <button class="button secondary" data-map="${record.id}">Map</button>
      </div>
      <div class="map-fallback" id="map-fallback-${record.id}" hidden>
        Map preview unavailable.
      </div>
      <iframe
        class="map-preview"
        id="map-${record.id}"
        title="Map preview"
        loading="lazy"
        referrerpolicy="no-referrer"
        hidden
      ></iframe>
    `;

    elements.requestsList.appendChild(card);

    card.querySelector(`[data-edit="${record.id}"]`).addEventListener("click", () =>
      startEdit(record)
    );
    card.querySelector(`[data-delete="${record.id}"]`).addEventListener("click", () =>
      handleDelete(record.id)
    );
    card.querySelector(`[data-map="${record.id}"]`).addEventListener("click", () =>
      loadMap(record)
    );
  });
}

function loadMap(record) {
  fetchApi(`${API_BASE}/api/map?lat=${record.latitude}&lon=${record.longitude}`)
    .then((data) => {
      const frame = document.getElementById(`map-${record.id}`);
      const fallback = document.getElementById(`map-fallback-${record.id}`);
      if (!frame) return;
      if (fallback) fallback.hidden = false;
      frame.onload = () => {
        if (fallback) fallback.hidden = true;
      };
      frame.src = data.mapEmbedUrl;
      frame.hidden = false;
    })
    .catch((err) => showCrudError(err.message));
}

init();
