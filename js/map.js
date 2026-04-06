/* ═══════════════════════════════════════════════════════════════
   map.js  —  AniMonitor · Map Page
   Initializes the Leaflet map and handles OWM weather tile
   layer switching + legend updates.
═══════════════════════════════════════════════════════════════ */

// ─── API KEY ───────────────────
const OWM_KEY = '9f85576d57ed7beda9e58eed5bc54048';

// ─── LEGEND CONFIGS PER LAYER ────────────────────────────────
const LAYER_META = {
    temp_new: {
        title: 'Temperature',
        barClass: 'bar-temp',
        labels: ['-40°C', '0°C', '+40°C'],
        unit: 'OWM temperature layer · °C'
    },
    precipitation_new: {
        title: 'Precipitation',
        barClass: 'bar-precipitation',
        labels: ['None', 'Moderate', 'Heavy'],
        unit: 'OWM precipitation layer · mm/h'
    },
    clouds_new: {
        title: 'Cloud Cover',
        barClass: 'bar-clouds',
        labels: ['0%', '50%', '100%'],
        unit: 'OWM cloud cover layer · %'
    },
    wind_new: {
        title: 'Wind Speed',
        barClass: 'bar-wind',
        labels: ['0 m/s', '25 m/s', '50 m/s'],
        unit: 'OWM wind speed layer · m/s'
    },
};

// ─── INIT MAP — centered on Philippines ──────────────────────
const map = L.map('map', {
    center: [12.5, 122.0],
    zoom: 6,
    zoomControl: true,
});

// Base tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
}).addTo(map);

// ─── OWM WEATHER TILE LAYER ──────────────────────────────────
let currentLayerKey = 'temp_new';
let weatherLayer = L.tileLayer(
    `https://tile.openweathermap.org/map/${currentLayerKey}/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
    { opacity: 0.7, maxZoom: 19, attribution: '&copy; OpenWeatherMap' }
).addTo(map);

// ─── SWITCH LAYER ────────────────────────────────────────────
function switchLayer(btn) {
    const layerKey = btn.getAttribute('data-layer');
    if (layerKey === currentLayerKey) return;

    // swap tile layer
    map.removeLayer(weatherLayer);
    weatherLayer = L.tileLayer(
        `https://tile.openweathermap.org/map/${layerKey}/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
        { opacity: 0.7, maxZoom: 19, attribution: '&copy; OpenWeatherMap' }
    ).addTo(map);
    currentLayerKey = layerKey;

    // update active button style
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // update legend
    const meta = LAYER_META[layerKey];
    document.getElementById('legend-title').textContent = meta.title;
    const bar = document.getElementById('legend-bar');
    bar.className = 'legend-bar ' + meta.barClass;
    const labels = document.getElementById('legend-labels');
    labels.innerHTML = meta.labels.map(l => `<span>${l}</span>`).join('');
    document.getElementById('legend-unit').textContent = meta.unit;
}
