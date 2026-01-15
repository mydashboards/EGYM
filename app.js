/* =========================
   CONFIG: CSV endpoints
   ========================= */
const CSV = {
  overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
  pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
  sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
  hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
  roleTargets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
};

/* =========================
   State
   ========================= */
const state = {
  data: {
    overview: [],
    pipeline: [],
    sourcing: [],
    hired: [],
    roleTargets: []
  },
  filters: {
    mgmtWeek: "All time",
    mgmtRole: "All roles",
    mgmtRecruiter: "All recruiters",

    plWeek: "All time",
    plRole: "All roles",
    plRecruiter: "All recruiters",

    acWeek: "All time",
    acRole: "All roles",
    acRecruiter: "All recruiters",

    soWeek: "All time",
    soRole: "All roles",
    soRecruiter: "All recruiters",

    ovRole: "All roles",
    ovRecruiter: "All recruiters",

    hiRole: "All roles",
    hiRecruiter: "All recruiters"
  },
  charts: {
    mgmtHealth: null,
    mgmtSource: null
  }
};

/* =========================
   Utilities: DOM
   ========================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showBanner(msg) {
  const el = $("#globalBanner");
  el.textContent = msg;
  el.classList.remove("is-hidden");
}
function hideBanner() {
  const el = $("#globalBanner");
  el.textContent = "";
  el.classList.add("is-hidden");
}

/* =========================
   Robust CSV parser (RFC-ish)
   - handles quotes, commas, newlines
   ========================= */
function parseCSV(text) {
  // Normalize line endings
  const s = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // If empty / header-only tolerated
  if (!s.trim()) return { headers: [], rows: [] };

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  // push last cell
  row.push(cur);
  rows.push(row);

  // Remove trailing completely empty rows
  while (rows.length && rows[rows.length - 1].every(v => String(v || "").trim() === "")) {
    rows.pop();
  }
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map(h => String(h || "").trim());
  const dataRows = rows.slice(1);

  // If header-only (no data rows), return empty rows
  const cleanedRows = dataRows
    .filter(r => r.some(v => String(v || "").trim() !== ""))
    .map(r => {
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c] || `col_${c}`] = (r[c] ?? "").toString().trim();
      }
      return obj;
    });

  return { headers, rows: cleanedRows };
}

/* =========================
   Normalize keys + helpers
   ========================= */
function normKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function normalizeRow(row) {
  const out = {};
  for (const k of Object.keys(row)) out[normKey(k)] = row[k];
  return out;
}

function toNum(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")));
}

function sortWeeksNumeric(weeks) {
  // accepts "KW 3", "3", "w3", "2026-W03", etc.
  const parse = (w) => {
    const s = String(w).toLowerCase();
    const m = s.match(/(\d{1,2})\b/);
    return m ? Number(m[1]) : NaN;
  };
  return [...weeks].sort((a,b) => (parse(a) - parse(b)));
}

function isoWeekNumber(date = new Date()) {
  // ISO week, stable for "current calendar week" default
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return weekNo;
}

/* =========================
   Column picking (tolerant)
   ========================= */
function pickKey(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const c = normKey(cand);
    if (keys.includes(c)) return c;
  }
  // partial contains fallback
  for (const cand of candidates) {
    const c = normKey(cand);
    const hit = keys.find(k => k.includes(c));
    if (hit) return hit;
  }
  return null;
}

function rowGet(row, key, fallback = "") {
  if (!key) return fallback;
  return row[key] ?? fallback;
}

/* =========================
   Fetch CSV with cache busting
   ========================= */
async function fetchCSV(url, { tolerateEmpty = false } = {}) {
  const u = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }
  const text = await res.text();
  const parsed = parseCSV(text);

  // tolerate header-only or empty
  if (tolerateEmpty) {
    const rows = (parsed.rows || []).map(normalizeRow);
    return rows;
  }

  // Non-tolerant: header exists but no rows still ok (just empty dataset)
  const rows = (parsed.rows || []).map(normalizeRow);
  return rows;
}

/* =========================
   Build filter option lists
   ========================= */
function buildOptions(selectEl, items, { includeAll = true, allLabel = "All time" } = {}) {
  const el = selectEl;
  el.innerHTML = "";
  const add = (v, t) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t ?? v;
    el.appendChild(opt);
  };
  if (includeAll) add(allLabel, allLabel);
  items.forEach(v => add(v, v));
}

function setSelectValue(sel, value, fallback) {
  const el = sel;
  const exists = Array.from(el.options).some(o => o.value === value);
  el.value = exists ? value : (fallback ?? el.options[0]?.value ?? "");
}

/* =========================
   Health dot (traffic light)
   ========================= */
function healthToColor(hRaw) {
  const h = String(hRaw || "").toLowerCase();
  if (["green","g","healthy","good","ok"].some(x => h.includes(x))) return "var(--good)";
  if (["amber","yellow","warn","risk","at_risk","atrisk"].some(x => h.includes(x))) return "var(--warn)";
  if (["red","bad","critical","block","blocking"].some(x => h.includes(x))) return "var(--bad)";
  // If data uses 1/2/3 or similar
  if (h === "1") return "var(--good)";
  if (h === "2") return "var(--warn)";
  if (h === "3") return "var(--bad)";
  return "rgba(255,255,255,0.35)";
}

function healthDotHTML(h) {
  const color = healthToColor(h);
  return `<span class="dot" style="background:${color}"></span>`;
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return "–";
  return `${Math.round(n * 100)}%`;
}

/* =========================
   Data extractors per dataset
   ========================= */
function getWeeksFromRows(rows) {
  // Find a likely "week" key
  const sample = rows[0] || {};
  const wkKey = pickKey(sample, ["week", "kw", "calendar_week", "cw", "woche"]);
  if (!wkKey) return [];
  return uniq(rows.map(r => rowGet(r, wkKey, "")).filter(Boolean));
}

function getRolesFromRows(rows) {
  const sample = rows[0] || {};
  const roleKey = pickKey(sample, ["role", "job", "position", "req", "requisition", "title"]);
  if (!roleKey) return [];
  return uniq(rows.map(r => rowGet(r, roleKey, "")));
}

function getRecruitersFromRows(rows) {
  const sample = rows[0] || {};
  const recKey = pickKey(sample, ["recruiter", "owner", "tap", "pplwise_tap", "pplwise_sourcer"]);
  if (!recKey) return [];
  return uniq(rows.map(r => rowGet(r, recKey, "")));
}

/* =========================
   Filter application
   ========================= */
function applyCommonFilters(rows, { week, role, recruiter }, { weekKeyCandidates, roleKeyCandidates, recruiterKeyCandidates }) {
  if (!rows || !rows.length) return [];

  const sample = rows[0] || {};
  const weekKey = pickKey(sample, weekKeyCandidates);
  const roleKey = pickKey(sample, roleKeyCandidates);
  const recruiterKey = pickKey(sample, recruiterKeyCandidates);

  return rows.filter(r => {
    const wOk = !week || week === "All time" ? true : (weekKey ? String(rowGet(r, weekKey, "")) === String(week) : true);
    const roleOk = !role || role === "All roles" ? true : (roleKey ? String(rowGet(r, roleKey, "")) === String(role) : true);
    const recOk = !recruiter || recruiter === "All recruiters" ? true : (recruiterKey ? String(rowGet(r, recruiterKey, "")) === String(recruiter) : true);
    return wOk && roleOk && recOk;
  });
}

/* =========================
   Rendering helpers
   ========================= */
function renderTable(tbodyEl, rows, renderRowFn, emptyEl) {
  tbodyEl.innerHTML = "";
  if (!rows.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  const frag = document.createDocumentFragment();
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = renderRowFn(r);
    frag.appendChild(tr);
  });
  tbodyEl.appendChild(frag);
}

function sumBy(rows, key) {
  return rows.reduce((acc, r) => acc + toNum(r[key]), 0);
}

function upsertLegend(el, items) {
  el.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(it => {
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `<span class="dot" style="background:${it.color}"></span><span>${it.label}: <b>${it.value}</b></span>`;
    frag.appendChild(d);
  });
  el.appendChild(frag);
}

/* =========================
   Charts (stable recreation)
   ========================= */
function buildDonut(canvas, labels, data, colors) {
  if (!canvas) return null;
  return new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed}`
          }
        }
      },
      cutout: "70%"
    }
  });
}

function destroyChart(ch) {
  try { ch?.destroy(); } catch(_) {}
}

/* =========================
   Tabs
   ========================= */
function setupTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      $$(".tab").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      $$(".panel").forEach(p => p.classList.remove("is-active"));
      $("#tab-" + tab).classList.add("is-active");

      // Re-render the active view to avoid stale UI
      renderAll();
    });
  });
}

/* =========================
   Initialize filters & defaults
   ========================= */
function initFilterControls() {
  // Management
  $("#mgmtWeek").addEventListener("change", (e) => { state.filters.mgmtWeek = e.target.value; renderAll(); });
  $("#mgmtRole").addEventListener("change", (e) => { state.filters.mgmtRole = e.target.value; renderAll(); });
  $("#mgmtRecruiter").addEventListener("change", (e) => { state.filters.mgmtRecruiter = e.target.value; renderAll(); });

  // Overview
  $("#ovRole").addEventListener("change", (e) => { state.filters.ovRole = e.target.value; renderAll(); });
  $("#ovRecruiter").addEventListener("change", (e) => { state.filters.ovRecruiter = e.target.value; renderAll(); });

  // Pipeline
  $("#plWeek").addEventListener("change", (e) => { state.filters.plWeek = e.target.value; renderAll(); });
  $("#plRole").addEventListener("change", (e) => { state.filters.plRole = e.target.value; renderAll(); });
  $("#plRecruiter").addEventListener("change", (e) => { state.filters.plRecruiter = e.target.value; renderAll(); });

  // Activity
  $("#acWeek").addEventListener("change", (e) => { state.filters.acWeek = e.target.value; renderAll(); });
  $("#acRole").addEventListener("change", (e) => { state.filters.acRole = e.target.value; renderAll(); });
  $("#acRecruiter").addEventListener("change", (e) => { state.filters.acRecruiter = e.target.value; renderAll(); });

  // Sourcing
  $("#soWeek").addEventListener("change", (e) => { state.filters.soWeek = e.target.value; renderAll(); });
  $("#soRole").addEventListener("change", (e) => { state.filters.soRole = e.target.value; renderAll(); });
  $("#soRecruiter").addEventListener("change", (e) => { state.filters.soRecruiter = e.target.value; renderAll(); });

  // Hires
  $("#hiRole").addEventListener("change", (e) => { state.filters.hiRole = e.target.value; renderAll(); });
  $("#hiRecruiter").addEventListener("change", (e) => { state.filters.hiRecruiter = e.target.value; renderAll(); });
}

/* =========================
   Populate dropdowns (from loaded data)
   ========================= */
function populateDropdowns() {
  const ov = state.data.overview;
  const pl = state.data.pipeline;
  const ac = state.data.pipeline;   // activity uses same sheet: pipeline_weekly (weekly stage activity)
  const so = state.data.sourcing;
  const hi = state.data.hired;

  const weeksPipeline = sortWeeksNumeric(getWeeksFromRows(pl));
  const weeksSourcing = sortWeeksNumeric(getWeeksFromRows(so));
  const weeksActivity = sortWeeksNumeric(getWeeksFromRows(ac));

  const rolesAll = uniq([
    ...getRolesFromRows(ov),
    ...getRolesFromRows(pl),
    ...getRolesFromRows(so),
    ...getRolesFromRows(hi)
  ]).sort((a,b) => String(a).localeCompare(String(b)));

  const recruitersAll = uniq([
    ...getRecruitersFromRows(ov),
    ...getRecruitersFromRows(pl),
    ...getRecruitersFromRows(so),
    ...getRecruitersFromRows(hi)
  ]).sort((a,b) => String(a).localeCompare(String(b)));

  // Weeks
  buildOptions($("#plWeek"), weeksPipeline, { includeAll: true, allLabel: "All time" });
  buildOptions($("#mgmtWeek"), weeksPipeline, { includeAll: true, allLabel: "All time" });

  buildOptions($("#acWeek"), weeksActivity, { includeAll: true, allLabel: "All time" });
  buildOptions($("#soWeek"), weeksSourcing, { includeAll: true, allLabel: "All time" });

  // Roles
  buildOptions($("#plRole"), rolesAll, { includeAll: true, allLabel: "All roles" });
  buildOptions($("#acRole"), rolesAll, { includeAll: true, allLabel: "All roles" });
  buildOptions($("#soRole"), rolesAll, { includeAll: true, allLabel: "All roles" });
  buildOptions($("#mgmtRole"), rolesAll, { includeAll: true, allLabel: "All roles" });
  buildOptions($("#ovRole"), rolesAll, { includeAll: true, allLabel: "All roles" });
  buildOptions($("#hiRole"), rolesAll, { includeAll: true, allLabel: "All roles" });

  // Recruiters
  buildOptions($("#plRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });
  buildOptions($("#acRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });
  buildOptions($("#soRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });
  buildOptions($("#mgmtRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });
  buildOptions($("#ovRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });
  buildOptions($("#hiRecruiter"), recruitersAll, { includeAll: true, allLabel: "All recruiters" });

  // Defaults:
  // Pipeline + Management: latest week from data (if present)
  const latestPipelineWeek = weeksPipeline.length ? weeksPipeline[weeksPipeline.length - 1] : "All time";

  // Activity + Sourcing: current calendar week (KW) if present; else latest from data
  const currentWeek = isoWeekNumber(new Date());
  const currentWeekStr = String(currentWeek);
  const pickWeek = (weeks) => {
    if (!weeks.length) return "All time";
    const exact = weeks.find(w => String(w).match(/\d{1,2}/)?.[0] === currentWeekStr) || weeks.find(w => String(w) === currentWeekStr);
    return exact || weeks[weeks.length - 1];
  };

  const activityDefault = pickWeek(weeksActivity);
  const sourcingDefault = pickWeek(weeksSourcing);

  state.filters.plWeek = latestPipelineWeek;
  state.filters.mgmtWeek = latestPipelineWeek;

  state.filters.acWeek = activityDefault;
  state.filters.soWeek = sourcingDefault;

  // Apply to selects (if option exists)
  setSelectValue($("#plWeek"), state.filters.plWeek, "All time");
  setSelectValue($("#mgmtWeek"), state.filters.mgmtWeek, "All time");
  setSelectValue($("#acWeek"), state.filters.acWeek, "All time");
  setSelectValue($("#soWeek"), state.filters.soWeek, "All time");

  // Keep current selections for role/recruiter if still exist
  setSelectValue($("#plRole"), state.filters.plRole, "All roles");
  setSelectValue($("#plRecruiter"), state.filters.plRecruiter, "All recruiters");

  setSelectValue($("#acRole"), state.filters.acRole, "All roles");
  setSelectValue($("#acRecruiter"), state.filters.acRecruiter, "All recruiters");

  setSelectValue($("#soRole"), state.filters.soRole, "All roles");
  setSelectValue($("#soRecruiter"), state.filters.soRecruiter, "All recruiters");

  setSelectValue($("#mgmtRole"), state.filters.mgmtRole, "All roles");
  setSelectValue($("#mgmtRecruiter"), state.filters.mgmtRecruiter, "All recruiters");

  setSelectValue($("#ovRole"), state.filters.ovRole, "All roles");
  setSelectValue($("#ovRecruiter"), state.filters.ovRecruiter, "All recruiters");

  setSelectValue($("#hiRole"), state.filters.hiRole, "All roles");
  setSelectValue($("#hiRecruiter"), state.filters.hiRecruiter, "All recruiters");
}

/* =========================
   OVERVIEW render
   ========================= */
function renderOverview() {
  const rows = state.data.overview || [];
  const hires = state.data.hired || [];

  const filtered = applyCommonFilters(
    rows,
    { week: null, role: state.filters.ovRole, recruiter: state.filters.ovRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","pplwise_tap","pplwise_sourcer","tap","owner"]
    }
  );

  // keys
  const sample = filtered[0] || rows[0] || {};
  const roleKey = pickKey(sample, ["role","job","position","title"]);
  const openingsKey = pickKey(sample, ["openings","open_roles","open_positions","headcount","hc","#openings"]);
  const healthKey = pickKey(sample, ["health","rag","status"]);
  const ownerKey = pickKey(sample, ["pplwise_tap","pplwise_sourcer","tap","owner","hiring_manager"]);
  const recruiterKey = pickKey(sample, ["recruiter","pplwise_tap","pplwise_sourcer","tap","owner"]);

  // Open roles = unique roles count (or sum openings if available)
  const openRoles = uniq(filtered.map(r => rowGet(r, roleKey, ""))).length;
  $("#ovOpenRoles").textContent = openRoles ? String(openRoles) : "0";
  $("#ovOpenRolesMeta").textContent = (state.filters.ovRole !== "All roles" || state.filters.ovRecruiter !== "All recruiters")
    ? "Filtered"
    : "All roles";

  // Health badges
  const healthCounts = { green:0, amber:0, red:0 };
  filtered.forEach(r => {
    const h = String(rowGet(r, healthKey, "")).toLowerCase();
    if (healthToColor(h) === "var(--good)") healthCounts.green++;
    else if (healthToColor(h) === "var(--warn)") healthCounts.amber++;
    else if (healthToColor(h) === "var(--bad)") healthCounts.red++;
  });

  const badges = $("#ovHealthBadges");
  badges.innerHTML = "";
  const makeBadge = (label, count, colorVar) => {
    const div = document.createElement("div");
    div.className = "badge";
    div.innerHTML = `<span class="dot" style="background:${colorVar}"></span><span>${label}: <b>${count}</b></span>`;
    badges.appendChild(div);
  };
  makeBadge("Healthy", healthCounts.green, "var(--good)");
  makeBadge("At risk", healthCounts.amber, "var(--warn)");
  makeBadge("Critical", healthCounts.red, "var(--bad)");

  // Avg TTH (if available in overview)
  const tthKey = pickKey(sample, ["time_to_hire","tth","days_to_hire","avg_time_to_hire"]);
  const tthVals = tthKey ? filtered.map(r => toNum(rowGet(r, tthKey, ""))).filter(n => n > 0) : [];
  const tthAvg = tthVals.length ? (tthVals.reduce((a,b)=>a+b,0)/tthVals.length) : null;
  $("#ovTTH").textContent = tthAvg ? `${Math.round(tthAvg)}d` : "–";

  // Hires all-time count (rows)
  $("#ovHires").textContent = String(hires.length || 0);
  $("#ovHiresMeta").textContent = hires.length ? "From hired_data" : "No hires rows (empty source is ok)";

  // Roles table
  const tbody = $("#ovRolesTable tbody");
  const grouped = new Map();

  filtered.forEach(r => {
    const role = rowGet(r, roleKey, "—");
    const owner = rowGet(r, ownerKey, "");
    const recruiter = rowGet(r, recruiterKey, "");
    const health = rowGet(r, healthKey, "");
    const openings = openingsKey ? toNum(rowGet(r, openingsKey, "0")) : 0;

    const key = `${role}||${recruiter}`;
    if (!grouped.has(key)) grouped.set(key, { role, owner, recruiter, health, openings });
    else {
      const g = grouped.get(key);
      g.openings += openings;
      if (!g.health && health) g.health = health;
      if (!g.owner && owner) g.owner = owner;
    }
  });

  const rowsOut = Array.from(grouped.values()).sort((a,b) => String(a.role).localeCompare(String(b.role)));

  renderTable(
    tbody,
    rowsOut,
    (r) => `
      <td>${r.role}</td>
      <td>${r.owner || "—"}</td>
      <td>${r.recruiter || "—"}</td>
      <td>${healthDotHTML(r.health)} <span style="opacity:.0">.</span></td>
      <td class="right">${r.openings ? r.openings : "—"}</td>
    `,
    $("#ovRolesEmpty")
  );
}

/* =========================
   PIPELINE render (Inventory)
   ========================= */
function renderPipeline() {
  const rows = state.data.pipeline || [];

  const filtered = applyCommonFilters(
    rows,
    { week: state.filters.plWeek, role: state.filters.plRole, recruiter: state.filters.plRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  const sample = filtered[0] || rows[0] || {};
  const roleKey = pickKey(sample, ["role","job","position","title"]);
  const recruiterKey = pickKey(sample, ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]);
  const stageKey = pickKey(sample, ["stage","pipeline_stage","step","status"]);
  const countKey = pickKey(sample, ["count","candidates","n","#","volume"]);

  // Inventory table: role+recruiter+stage => sum(count)
  const map = new Map();
  filtered.forEach(r => {
    const role = rowGet(r, roleKey, "—");
    const recruiter = rowGet(r, recruiterKey, "—");
    const stage = rowGet(r, stageKey, "—");
    const cnt = countKey ? toNum(rowGet(r, countKey, "0")) : 0;

    const k = `${role}||${recruiter}||${stage}`;
    map.set(k, (map.get(k) || 0) + cnt);
  });

  const out = Array.from(map.entries())
    .map(([k,v]) => {
      const [role,recruiter,stage] = k.split("||");
      return { role, recruiter, stage, count: v };
    })
    .sort((a,b) => (a.role.localeCompare(b.role) || a.stage.localeCompare(b.stage)));

  renderTable(
    $("#plTable tbody"),
    out,
    (r) => `
      <td>${r.role}</td>
      <td>${r.recruiter}</td>
      <td>${r.stage}</td>
      <td class="right">${r.count}</td>
    `,
    $("#plEmpty")
  );
}

/* =========================
   ACTIVITY render (Weekly stage activity)
   ========================= */
function renderActivity() {
  // Using pipeline_weekly source as "activity" table
  const rows = state.data.pipeline || [];

  const filtered = applyCommonFilters(
    rows,
    { week: state.filters.acWeek, role: state.filters.acRole, recruiter: state.filters.acRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  const sample = filtered[0] || rows[0] || {};
  const roleKey = pickKey(sample, ["role","job","position","title"]);
  const recruiterKey = pickKey(sample, ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]);
  const stageKey = pickKey(sample, ["stage","pipeline_stage","step","status"]);
  const countKey = pickKey(sample, ["count","moved","activity","delta","n","#","volume"]);

  // Same grouping as pipeline (role+recruiter+stage => sum count)
  const map = new Map();
  filtered.forEach(r => {
    const role = rowGet(r, roleKey, "—");
    const recruiter = rowGet(r, recruiterKey, "—");
    const stage = rowGet(r, stageKey, "—");
    const cnt = countKey ? toNum(rowGet(r, countKey, "0")) : 0;

    const k = `${role}||${recruiter}||${stage}`;
    map.set(k, (map.get(k) || 0) + cnt);
  });

  const out = Array.from(map.entries())
    .map(([k,v]) => {
      const [role,recruiter,stage] = k.split("||");
      return { role, recruiter, stage, count: v };
    })
    .sort((a,b) => (a.role.localeCompare(b.role) || a.stage.localeCompare(b.stage)));

  renderTable(
    $("#acTable tbody"),
    out,
    (r) => `
      <td>${r.role}</td>
      <td>${r.recruiter}</td>
      <td>${r.stage}</td>
      <td class="right">${r.count}</td>
    `,
    $("#acEmpty")
  );
}

/* =========================
   SOURCING render
   ========================= */
function renderSourcing() {
  const rows = state.data.sourcing || [];

  const filtered = applyCommonFilters(
    rows,
    { week: state.filters.soWeek, role: state.filters.soRole, recruiter: state.filters.soRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  const sample = filtered[0] || rows[0] || {};
  const roleKey = pickKey(sample, ["role","job","position","title"]);
  const recruiterKey = pickKey(sample, ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]);
  const sourceKey = pickKey(sample, ["source","channel","origin"]);
  const countKey = pickKey(sample, ["count","candidates","n","#","volume","touches"]);

  // KPI fields if present
  const screenedKey = pickKey(sample, ["recruiter_screen","screened","screens"]);
  const contactedKey = pickKey(sample, ["contacted","outreach","messages"]);
  const repliesKey = pickKey(sample, ["replies","reply","responses","inmail_replies"]);

  // Totals (prefer explicit columns, fallback sum(count))
  const totalCount = countKey ? filtered.reduce((a,r)=>a+toNum(rowGet(r,countKey,"0")),0) : 0;
  const totalScreened = screenedKey ? filtered.reduce((a,r)=>a+toNum(rowGet(r,screenedKey,"0")),0) : null;
  const totalContacted = contactedKey ? filtered.reduce((a,r)=>a+toNum(rowGet(r,contactedKey,"0")),0) : null;
  const totalReplies = repliesKey ? filtered.reduce((a,r)=>a+toNum(rowGet(r,repliesKey,"0")),0) : null;

  $("#soScreened").textContent = totalScreened !== null ? String(totalScreened) : String(totalCount);
  $("#soContacted").textContent = totalContacted !== null ? String(totalContacted) : "–";
  $("#soReplies").textContent = totalReplies !== null ? String(totalReplies) : "–";

  // Source top 3
  const sourceMap = new Map();
  filtered.forEach(r => {
    const src = rowGet(r, sourceKey, "Unknown");
    const cnt = countKey ? toNum(rowGet(r, countKey, "0")) : 0;
    sourceMap.set(src, (sourceMap.get(src) || 0) + cnt);
  });
  const topSources = Array.from(sourceMap.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .map(([s,c]) => `${s} (${c})`);
  $("#soMainSources").textContent = topSources.length ? topSources.join(" · ") : "–";

  // Table
  const map = new Map();
  filtered.forEach(r => {
    const role = rowGet(r, roleKey, "—");
    const recruiter = rowGet(r, recruiterKey, "—");
    const src = rowGet(r, sourceKey, "—");
    const cnt = countKey ? toNum(rowGet(r, countKey, "0")) : 0;

    const k = `${role}||${recruiter}||${src}`;
    map.set(k, (map.get(k) || 0) + cnt);
  });

  const out = Array.from(map.entries())
    .map(([k,v]) => {
      const [role,recruiter,source] = k.split("||");
      return { role, recruiter, source, count: v };
    })
    .sort((a,b) => (a.role.localeCompare(b.role) || a.source.localeCompare(b.source)));

  renderTable(
    $("#soTable tbody"),
    out,
    (r) => `
      <td>${r.role}</td>
      <td>${r.recruiter}</td>
      <td>${r.source}</td>
      <td class="right">${r.count}</td>
    `,
    $("#soEmpty")
  );
}

/* =========================
   HIRES render (tolerant empty source)
   ========================= */
function renderHires() {
  const rows = state.data.hired || [];

  // If empty, show KPIs as 0 and keep empty state visible
  $("#hiTotal").textContent = String(rows.length || 0);

  const sample = rows[0] || {};
  const roleKey = pickKey(sample, ["role","job","position","title"]);
  const recruiterKey = pickKey(sample, ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]);
  const nameKey = pickKey(sample, ["candidate","name","candidate_name","full_name"]);
  const startKey = pickKey(sample, ["start_date","start","hire_date","date"]);

  const filtered = applyCommonFilters(
    rows,
    { week: null, role: state.filters.hiRole, recruiter: state.filters.hiRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  // Optional KPIs if exist
  const tthKey = pickKey(sample, ["time_to_hire","tth","days_to_hire"]);
  const oarKey = pickKey(sample, ["offer_accept_rate","oar","accept_rate"]);

  const tthVals = tthKey ? filtered.map(r => toNum(rowGet(r,tthKey,""))).filter(n => n>0) : [];
  const tthAvg = tthVals.length ? (tthVals.reduce((a,b)=>a+b,0)/tthVals.length) : null;
  $("#hiTTH").textContent = tthAvg ? `${Math.round(tthAvg)}d` : "–";

  const oarVals = oarKey ? filtered.map(r => toNum(rowGet(r,oarKey,""))).filter(n => n>0) : [];
  const oarAvg = oarVals.length ? (oarVals.reduce((a,b)=>a+b,0)/oarVals.length) : null;
  $("#hiOAR").textContent = oarAvg ? fmtPct(Math.min(1, oarAvg)) : "–";

  renderTable(
    $("#hiTable tbody"),
    filtered,
    (r) => `
      <td>${rowGet(r, nameKey, "—")}</td>
      <td>${rowGet(r, roleKey, "—")}</td>
      <td>${rowGet(r, recruiterKey, "—")}</td>
      <td>${rowGet(r, startKey, "—")}</td>
    `,
    $("#hiEmpty")
  );
}

/* =========================
   MANAGEMENT overview render (functional)
   ========================= */
function renderManagement() {
  const overview = state.data.overview || [];
  const pipeline = state.data.pipeline || [];
  const sourcing = state.data.sourcing || [];

  // Filter base (mgmt) uses pipeline week (inventory week) + optional role/recruiter
  const plFiltered = applyCommonFilters(
    pipeline,
    { week: state.filters.mgmtWeek, role: state.filters.mgmtRole, recruiter: state.filters.mgmtRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  // Open roles from overview (role-level rows)
  const ovFiltered = applyCommonFilters(
    overview,
    { week: null, role: state.filters.mgmtRole, recruiter: state.filters.mgmtRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","pplwise_tap","pplwise_sourcer","tap","owner"]
    }
  );

  // Activity: use pipeline_weekly too, but *current calendar week* in Activity tab already.
  // For management we use selected mgmtWeek as "weekly activity reference".
  const acFiltered = applyCommonFilters(
    pipeline,
    { week: state.filters.mgmtWeek, role: state.filters.mgmtRole, recruiter: state.filters.mgmtRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  // Sourcing: use same mgmtWeek (if present there). If not, will just filter by week anyway.
  const soFiltered = applyCommonFilters(
    sourcing,
    { week: state.filters.mgmtWeek, role: state.filters.mgmtRole, recruiter: state.filters.mgmtRecruiter },
    {
      weekKeyCandidates: ["week","kw","calendar_week","cw","woche"],
      roleKeyCandidates: ["role","job","position","title"],
      recruiterKeyCandidates: ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]
    }
  );

  // Keys
  const plSample = plFiltered[0] || pipeline[0] || {};
  const plRoleKey = pickKey(plSample, ["role","job","position","title"]);
  const plRecruiterKey = pickKey(plSample, ["recruiter","owner","tap","pplwise_tap","pplwise_sourcer"]);
  const plStageKey = pickKey(plSample, ["stage","pipeline_stage","step","status"]);
  const plCountKey = pickKey(plSample, ["count","candidates","n","#","volume"]);

  const ovSample = ovFiltered[0] || overview[0] || {};
  const ovRoleKey = pickKey(ovSample, ["role","job","position","title"]);
  const ovOwnerKey = pickKey(ovSample, ["pplwise_tap","pplwise_sourcer","tap","owner","hiring_manager"]);
  const ovRecruiterKey = pickKey(ovSample, ["recruiter","pplwise_tap","pplwise_sourcer","tap","owner"]);
  const ovHealthKey = pickKey(ovSample, ["health","rag","status"]);

  const soSample = soFiltered[0] || sourcing[0] || {};
  const soSourceKey = pickKey(soSample, ["source","channel","origin"]);
  const soCountKey = pickKey(soSample, ["count","candidates","n","#","volume","touches"]);
  const soContactedKey = pickKey(soSample, ["contacted","outreach","messages"]);
  const soScreenedKey = pickKey(soSample, ["recruiter_screen","screened","screens"]);

  // KPIs
  const openRoles = uniq(ovFiltered.map(r => rowGet(r, ovRoleKey, ""))).length;
  $("#mgmtOpenRoles").textContent = String(openRoles || 0);
  $("#mgmtOpenRolesMeta").textContent = state.filters.mgmtWeek !== "All time"
    ? `Week: ${state.filters.mgmtWeek}`
    : "All time";

  const totalPipeline = plFiltered.reduce((a,r)=>a + (plCountKey ? toNum(rowGet(r,plCountKey,"0")) : 0), 0);
  $("#mgmtTotalPipeline").textContent = String(totalPipeline || 0);
  $("#mgmtTotalPipelineMeta").textContent = state.filters.mgmtWeek !== "All time"
    ? `Inventory for ${state.filters.mgmtWeek}`
    : "All time";

  const weeklyActivity = acFiltered.reduce((a,r)=>a + (plCountKey ? toNum(rowGet(r,plCountKey,"0")) : 0), 0);
  $("#mgmtWeeklyActivity").textContent = String(weeklyActivity || 0);
  $("#mgmtWeeklyActivityMeta").textContent = state.filters.mgmtWeek !== "All time"
    ? `Moves in ${state.filters.mgmtWeek}`
    : "All time";

  const sourcingTouches =
    (soScreenedKey ? soFiltered.reduce((a,r)=>a+toNum(rowGet(r,soScreenedKey,"0")),0) : 0) +
    (soContactedKey ? soFiltered.reduce((a,r)=>a+toNum(rowGet(r,soContactedKey,"0")),0) : 0) ||
    (soCountKey ? soFiltered.reduce((a,r)=>a+toNum(rowGet(r,soCountKey,"0")),0) : 0);

  $("#mgmtSourcingTouches").textContent = String(sourcingTouches || 0);
  $("#mgmtSourcingTouchesMeta").textContent = state.filters.mgmtWeek !== "All time"
    ? `Week: ${state.filters.mgmtWeek}`
    : "All time";

  // Donut: health counts from overview
  const hc = { healthy:0, risk:0, critical:0 };
  ovFiltered.forEach(r => {
    const h = rowGet(r, ovHealthKey, "");
    const c = healthToColor(h);
    if (c === "var(--good)") hc.healthy++;
    else if (c === "var(--warn)") hc.risk++;
    else if (c === "var(--bad)") hc.critical++;
  });

  const healthLabels = ["Healthy", "At risk", "Critical"];
  const healthData = [hc.healthy, hc.risk, hc.critical];
  const healthColors = ["#1fc16b", "#f5b301", "#ff3b30"];

  destroyChart(state.charts.mgmtHealth);
  state.charts.mgmtHealth = buildDonut($("#mgmtHealthDonut"), healthLabels, healthData, healthColors);

  upsertLegend($("#mgmtHealthLegend"), [
    { label: "Healthy", value: hc.healthy, color: "var(--good)" },
    { label: "At risk", value: hc.risk, color: "var(--warn)" },
    { label: "Critical", value: hc.critical, color: "var(--bad)" }
  ]);

  // Donut: source mix from sourcing
  const srcMap = new Map();
  soFiltered.forEach(r => {
    const src = rowGet(r, soSourceKey, "Unknown");
    const cnt = soCountKey ? toNum(rowGet(r, soCountKey, "0")) : 0;
    srcMap.set(src, (srcMap.get(src) || 0) + cnt);
  });

  const srcEntries = Array.from(srcMap.entries()).sort((a,b)=>b[1]-a[1]);
  const topN = 6;
  const top = srcEntries.slice(0, topN);
  const rest = srcEntries.slice(topN);
  const restSum = rest.reduce((a, [,v]) => a + v, 0);

  const srcLabels = top.map(([s]) => s).concat(restSum ? ["Other"] : []);
  const srcData = top.map(([,v]) => v).concat(restSum ? [restSum] : []);
  const srcColors = srcLabels.map((_,i) => `hsl(${(i*55)%360} 80% 55%)`);

  destroyChart(state.charts.mgmtSource);
  state.charts.mgmtSource = buildDonut($("#mgmtSourceDonut"), srcLabels, srcData, srcColors);

  upsertLegend($("#mgmtSourceLegend"), srcLabels.slice(0,6).map((l,i)=>({
    label: l,
    value: srcData[i] ?? 0,
    color: srcColors[i] ?? "rgba(255,255,255,0.35)"
  })));

  // Recruiter utilization: activity share (from pipeline_weekly counts)
  const utilMap = new Map();
  acFiltered.forEach(r => {
    const rec = rowGet(r, plRecruiterKey, "—");
    const cnt = plCountKey ? toNum(rowGet(r, plCountKey, "0")) : 0;
    utilMap.set(rec, (utilMap.get(rec) || 0) + cnt);
  });

  const utilEntries = Array.from(utilMap.entries()).sort((a,b)=>b[1]-a[1]);
  const utilTotal = utilEntries.reduce((a, [,v]) => a + v, 0);

  const utilBody = $("#mgmtUtilTable tbody");
  utilBody.innerHTML = "";
  utilEntries.forEach(([rec, v]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rec}</td>
      <td class="right">${v}</td>
      <td class="right">${utilTotal ? fmtPct(v / utilTotal) : "–"}</td>
    `;
    utilBody.appendChild(tr);
  });

  // Top risks: critical roles (from overview health) with pipeline total
  const rolePipelineMap = new Map();
  plFiltered.forEach(r => {
    const role = rowGet(r, plRoleKey, "—");
    const cnt = plCountKey ? toNum(rowGet(r, plCountKey, "0")) : 0;
    rolePipelineMap.set(role, (rolePipelineMap.get(role) || 0) + cnt);
  });

  const risks = ovFiltered
    .map(r => ({
      role: rowGet(r, ovRoleKey, "—"),
      owner: rowGet(r, ovOwnerKey, ""),
      recruiter: rowGet(r, ovRecruiterKey, ""),
      health: rowGet(r, ovHealthKey, "")
    }))
    .filter(r => healthToColor(r.health) === "var(--bad)")
    .map(r => ({ ...r, pipeline: rolePipelineMap.get(r.role) || 0 }))
    .sort((a,b)=>b.pipeline - a.pipeline);

  renderTable(
    $("#mgmtRisksTable tbody"),
    risks,
    (r) => `
      <td>${r.role}</td>
      <td>${r.owner || "—"}</td>
      <td>${r.recruiter || "—"}</td>
      <td>${healthDotHTML(r.health)} <span style="opacity:.0">.</span></td>
      <td class="right">${r.pipeline}</td>
    `,
    $("#mgmtRisksEmpty")
  );
}

/* =========================
   Render all (safe)
   ========================= */
function renderAll() {
  // sync UI selects -> state (in case options were rebuilt)
  const sync = (id, key) => {
    const el = $(id);
    if (el) state.filters[key] = el.value;
  };

  sync("#mgmtWeek", "mgmtWeek");
  sync("#mgmtRole", "mgmtRole");
  sync("#mgmtRecruiter", "mgmtRecruiter");

  sync("#ovRole", "ovRole");
  sync("#ovRecruiter", "ovRecruiter");

  sync("#plWeek", "plWeek");
  sync("#plRole", "plRole");
  sync("#plRecruiter", "plRecruiter");

  sync("#acWeek", "acWeek");
  sync("#acRole", "acRole");
  sync("#acRecruiter", "acRecruiter");

  sync("#soWeek", "soWeek");
  sync("#soRole", "soRole");
  sync("#soRecruiter", "soRecruiter");

  sync("#hiRole", "hiRole");
  sync("#hiRecruiter", "hiRecruiter");

  // Render each view (cheap enough)
  renderManagement();
  renderOverview();
  renderPipeline();
  renderActivity();
  renderSourcing();
  renderHires();
}

/* =========================
   Boot
   ========================= */
async function boot() {
  hideBanner();

  setupTabs();
  initFilterControls();

  try {
    const [overview, pipeline, sourcing, hired, roleTargets] = await Promise.all([
      fetchCSV(CSV.overview),
      fetchCSV(CSV.pipeline),
      fetchCSV(CSV.sourcing),
      fetchCSV(CSV.hired, { tolerateEmpty: true }),      // IMPORTANT: empty is valid
      fetchCSV(CSV.roleTargets, { tolerateEmpty: true }) // also tolerate empty
    ]);

    state.data.overview = overview;
    state.data.pipeline = pipeline;
    state.data.sourcing = sourcing;
    state.data.hired = hired;
    state.data.roleTargets = roleTargets;

    populateDropdowns();
    renderAll();
  } catch (err) {
    // Only show banner on *real* failures
    showBanner(`Data load error: ${err?.message || err}`);
    // Still try to render with whatever is loaded (if any)
    try { populateDropdowns(); } catch (_) {}
    try { renderAll(); } catch (_) {}
  }
}

document.addEventListener("DOMContentLoaded", boot);
