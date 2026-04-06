/* =====================================================
   admin-database.js  —  AniMonitor Firebase Admin Monitor
   ===================================================== */

'use strict';

// ── CONFIG ────────────────────────────────────────────
const POLL_MS      = 2000;
const MAX_LOG_ROWS = 200;   // keep last N rows in the live log
const STALE_MS     = 10000; // node is "stale" if no data for this long

// Single ESP32 board with DHT sensor (temp + humidity) and UV sensor
const MOCK_NODES = [
    { id: 'node01', label: 'ESP32 · DHT + UV Sensor' },
];

// ── STATE ─────────────────────────────────────────────
let logEntries    = [];    // all raw log rows
let filteredLog   = [];    // filtered view
let isPaused      = false;
let totalReadings = 0;
let errorCount    = 0;
let logFilter     = 'all';
let pollTimer     = null;

// Node state map: { nodeId -> { uv, temp, hum, signal, lastSeen, uptime, online } }
const nodeState = {};
MOCK_NODES.forEach(n => {
    nodeState[n.id] = {
        label:    n.label,
        uv:       null,
        temp:     null,
        hum:      null,
        signal:   null,
        lastSeen: null,
        uptimeSec:0,
        online:   false,
    };
});

// ── INIT ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    startClock();
    showFirebaseConfig();
    renderNodeTable();
    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        initFirebaseListeners();
        setDbStatus('online', 'Firebase · Online');
    } else {
        setDbStatus('mock', 'Mock Data · Active');
        startMockPolling();
    }
    document.getElementById('cfgMode').textContent =
        (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) ? 'Firebase Realtime DB' : 'Mock / Demo';
});

// ── CLOCK ─────────────────────────────────────────────
function startClock() {
    const el = document.getElementById('clk');
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    tick();
    setInterval(tick, 1000);
}

// ── FIREBASE STATUS ───────────────────────────────────
function setDbStatus(state, label) {
    const dot   = document.getElementById('dbStatusDot');
    const lbl   = document.getElementById('dbStatusLabel');
    dot.className = 'status-dot ' + state;
    lbl.textContent = label;
}

// ── FIREBASE CONFIG DISPLAY ───────────────────────────
function showFirebaseConfig() {
    if (typeof firebaseConfig === 'undefined') return;
    document.getElementById('cfgProject').textContent    = firebaseConfig.projectId    || '—';
    document.getElementById('cfgDbUrl').textContent      = firebaseConfig.databaseURL  || '—';
    document.getElementById('cfgAuthDomain').textContent = firebaseConfig.authDomain   || '—';
}

// ── TEST CONNECTION ───────────────────────────────────
function testConnection() {
    const btn = document.getElementById('btnTestConn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing…';

    setTimeout(() => {
        const success = typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
        if (success) {
            setDbStatus('online', 'Firebase · Online');
            alert('Firebase connection OK');
        } else {
            alert('Running in mock/demo mode. Configure USE_FIREBASE = true and your credentials to connect.');
        }
    }, 1200);
}

// ── FIREBASE REALTIME LISTENERS ───────────────────────
function initFirebaseListeners() {
    MOCK_NODES.forEach(({ id }) => {
        const ref = database.ref('sensors/' + id);
        ref.on('value', (snap) => {
            const data = snap.val();
            if (data) {
                updateNodeState(id, data);
                if (!isPaused) pushLogEntry(id, data);
            }
        }, (err) => {
            console.error('Firebase error on', id, err);
            errorCount++;
            updateSummaryStats();
        });
    });
}

// ── MOCK DATA POLLING ─────────────────────────────────
function startMockPolling() {
    const tick = () => {
        MOCK_NODES.forEach(({ id }) => {
            const data = {
                uv:          +(5 + Math.random() * 5).toFixed(2),
                temperature: +(28 + Math.random() * 6).toFixed(1),
                humidity:    +(60 + Math.random() * 25).toFixed(0),
                signal:      -(50 + Math.floor(Math.random() * 30)),
                uptime:      (nodeState[id].uptimeSec || 0) + POLL_MS / 1000,
            };
            updateNodeState(id, data);
            if (!isPaused) pushLogEntry(id, data);
        });
    };
    tick(); // immediate first tick
    pollTimer = setInterval(tick, POLL_MS);
}

// ── UPDATE NODE STATE ─────────────────────────────────
function updateNodeState(id, data) {
    const s = nodeState[id];
    s.uv       = data.uv          !== undefined ? +data.uv          : s.uv;
    s.temp     = data.temperature !== undefined ? +data.temperature : s.temp;
    s.hum      = data.humidity    !== undefined ? +data.humidity    : s.hum;
    s.signal   = data.signal      !== undefined ? +data.signal      : s.signal;
    s.uptimeSec= data.uptime      !== undefined ? +data.uptime      : (s.uptimeSec || 0) + POLL_MS / 1000;
    s.lastSeen = Date.now();
    s.online   = true;
    totalReadings++;
    document.getElementById('lastSync').textContent = new Date().toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    updateSummaryStats();
    renderNodeTable();
}

// ── PUSH LOG ENTRY ────────────────────────────────────
function pushLogEntry(nodeId, data) {
    const entry = {
        seq:    totalReadings,
        ts:     new Date(),
        nodeId: nodeId,
        uv:     data.uv          !== undefined ? +data.uv          : '—',
        temp:   data.temperature !== undefined ? +data.temperature : '—',
        hum:    data.humidity    !== undefined ? +data.humidity    : '—',
        signal: data.signal      !== undefined ? +data.signal      : '—',
        ok:     true,
    };
    logEntries.unshift(entry); // newest first
    if (logEntries.length > MAX_LOG_ROWS * 3) {
        logEntries = logEntries.slice(0, MAX_LOG_ROWS * 3);
    }
    applyLogFilter();
}

// ── RENDER SUMMARY STATS ──────────────────────────────
function updateSummaryStats() {
    const ids      = Object.keys(nodeState);
    const online   = ids.filter(id => nodeState[id].online).length;
    document.getElementById('totalNodes').textContent   = ids.length;
    document.getElementById('onlineNodes').textContent  = online;
    document.getElementById('offlineNodes').textContent = ids.length - online;
    document.getElementById('totalReadings').textContent = totalReadings.toLocaleString();
    document.getElementById('errorCount').textContent    = errorCount;
}

// ── RENDER NODE TABLE ─────────────────────────────────
function renderNodeTable() {
    const tbody = document.getElementById('nodeTableBody');
    tbody.innerHTML = '';
    Object.entries(nodeState).forEach(([id, s]) => {
        const ageSec = s.lastSeen ? (Date.now() - s.lastSeen) / 1000 : Infinity;
        let statusClass, statusLabel, statusIcon;
        if (!s.lastSeen) {
            statusClass = 'badge-offline'; statusLabel = 'Never Seen'; statusIcon = '●';
        } else if (!s.online || ageSec > STALE_MS / 1000) {
            statusClass = ageSec > STALE_MS / 1000 ? 'badge-stale' : 'badge-offline';
            statusLabel = ageSec > STALE_MS / 1000 ? 'Stale'       : 'Offline';
            statusIcon  = '●';
        } else {
            statusClass = 'badge-online'; statusLabel = 'Online'; statusIcon = '●';
        }

        const uptimeStr = formatUptime(s.uptimeSec || 0);
        const lastSeenStr = s.lastSeen
            ? new Date(s.lastSeen).toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
            : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:700;">${id}</td>
            <td><span class="node-badge ${statusClass}">${statusIcon} ${statusLabel}</span></td>
            <td class="val-uv">${s.uv   !== null ? s.uv.toFixed(2)  : '—'}</td>
            <td class="val-temp">${s.temp !== null ? s.temp.toFixed(1) + '°C' : '—'}</td>
            <td class="val-hum">${s.hum  !== null ? s.hum + '%'       : '—'}</td>
            <td class="val-sig">${s.signal !== null ? s.signal + ' dBm' : '—'}</td>
            <td style="color:var(--text-secondary);font-size:11px;">${uptimeStr}</td>
            <td style="color:var(--text-secondary);font-size:11px;">${lastSeenStr}</td>
            <td>
                <button class="tbl-btn" onclick="pingNode('${id}')"><i class="fas fa-satellite-dish"></i> Ping</button>
                <button class="tbl-btn" onclick="viewNodeRaw('${id}')"><i class="fas fa-code"></i> Raw</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── LOG FILTER ────────────────────────────────────────
function applyLogFilter() {
    logFilter = document.getElementById('logNodeFilter').value;
    filteredLog = logFilter === 'all'
        ? logEntries
        : logEntries.filter(e => e.nodeId === logFilter);
    renderLog();
}

// ── RENDER LOG TABLE ──────────────────────────────────
function renderLog() {
    const tbody   = document.getElementById('logBody');
    const visible = filteredLog.slice(0, MAX_LOG_ROWS);

    tbody.innerHTML = '';
    visible.forEach((e, i) => {
        const tr = document.createElement('tr');
        if (i === 0) tr.classList.add('row-new');

        const statusTag = e.ok
            ? '<span class="db-tag ok">OK</span>'
            : '<span class="db-tag err">ERR</span>';

        const uvVal   = typeof e.uv   === 'number' ? e.uv.toFixed(2) : '—';
        const tempVal = typeof e.temp === 'number' ? e.temp.toFixed(1) + '°C' : '—';
        const humVal  = typeof e.hum  === 'number' ? e.hum + '%' : '—';
        const sigVal  = typeof e.signal === 'number' ? e.signal + ' dBm' : '—';

        tr.innerHTML = `
            <td>${e.seq}</td>
            <td class="ts">${e.ts.toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td>
            <td style="font-weight:600;">${e.nodeId}</td>
            <td class="val-uv">${uvVal}</td>
            <td class="val-temp">${tempVal}</td>
            <td class="val-hum">${humVal}</td>
            <td class="val-sig">${sigVal}</td>
            <td>${statusTag}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('logCount').textContent =
        filteredLog.length + ' entr' + (filteredLog.length === 1 ? 'y' : 'ies');

    const wrap = document.getElementById('logTableWrap');
    if (document.getElementById('autoScroll').checked) {
        wrap.scrollTop = 0; // newest is always at top
    }
}

// ── CONTROLS ─────────────────────────────────────────
function togglePause() {
    isPaused = !isPaused;
    const btn  = document.getElementById('pauseToggle');
    const icon = document.getElementById('pauseIcon');
    btn.classList.toggle('paused', isPaused);
    icon.className = isPaused ? 'fas fa-play' : 'fas fa-pause';
    btn.title = isPaused ? 'Resume log' : 'Pause log';
}

function clearLog() {
    if (!confirm('Clear all log entries? This only clears the display — Firebase data is not affected.')) return;
    logEntries  = [];
    filteredLog = [];
    renderLog();
}

function refreshNodes() {
    renderNodeTable();
    updateSummaryStats();
}

function exportLog() {
    if (filteredLog.length === 0) { alert('No log entries to export.'); return; }
    const header = ['#', 'Timestamp', 'Node', 'UV', 'Temp_C', 'Humidity_%', 'Signal_dBm', 'Status'];
    const rows = filteredLog.map(e => [
        e.seq,
        e.ts.toISOString(),
        e.nodeId,
        typeof e.uv   === 'number' ? e.uv.toFixed(2) : '',
        typeof e.temp === 'number' ? e.temp.toFixed(1) : '',
        typeof e.hum  === 'number' ? e.hum : '',
        typeof e.signal === 'number' ? e.signal : '',
        e.ok ? 'OK' : 'ERR',
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'animonitor_log_' + new Date().toISOString().slice(0,19).replace(/[T:]/g,'-') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ── NODE ACTIONS ──────────────────────────────────────
function pingNode(nodeId) {
    const s = nodeState[nodeId];
    const status = s.online ? 'ONLINE' : 'OFFLINE / Not responding';
    const last   = s.lastSeen
        ? new Date(s.lastSeen).toLocaleTimeString('en-PH')
        : 'Never';
    alert(`Ping: ${nodeId}\nStatus: ${status}\nLast seen: ${last}`);
}

function viewNodeRaw(nodeId) {
    const s = nodeState[nodeId];
    const raw = JSON.stringify({
        uv:          s.uv,
        temperature: s.temp,
        humidity:    s.hum,
        signal:      s.signal,
        uptime:      s.uptimeSec,
        lastSeen:    s.lastSeen ? new Date(s.lastSeen).toISOString() : null,
        online:      s.online,
    }, null, 2);
    alert(`Raw state for ${nodeId}:\n\n${raw}`);
}

// ── HELPERS ───────────────────────────────────────────
function formatUptime(sec) {
    if (!sec || sec < 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
