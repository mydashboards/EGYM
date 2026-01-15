document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     CONFIG
  ========================= */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipelineWeekly: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    pipelineInventory: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1802705167&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    roleTargets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv",
    roleNotes: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1004956410&single=true&output=csv"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipelineWeekly: "pipeline_weekly",
    pipelineInventory: "pipeline_inventory",
    sourcing: "sourcing_data",
    hired: "hired_data",
    roleTargets: "role_targets",
    roleNotes: "role_notes"
  };

  const HIRES_PASSWORD = "EGYM2026";
  const MANAGEMENT_PASSWORD = "EGYM2027";

  const VIEW_STORAGE_KEY = "dashboard_view";
  const HIRES_UNLOCK_KEY = "hires_unlocked";
  const MGMT_UNLOCK_KEY = "mgmt_unlocked";

  const STAGE_ORDER = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];

  /* =========================
     STATE
  ========================= */

  const state = {
    view: "contributor",

    overviewRows: [],
    weeklyRows: [],       // long format: {year, kw, role, stage, count}
    inventoryRows: [],    // long format: {year, kw, role, stage, count}
    sourcingRows: [],
    hiredRows: [],
    targetRows: [],
    roleNotesRows: [],

    pipelineWeek: "",
    activityWeek: "all",
    sourcingWeek: "all",

    mgmtWeek: "",
    mgmtRole: "all",
    mgmtRecruiter: "all",

    charts: {
      pipelineHealth: null,
      sourceMix: null
    }
  };

  /* =========================
     DOM HELPERS
  ========================= */

  const $ = (id) => document.getElementById(id);

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeHeader(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function normalizeStage(v) {
    return normalizeHeader(v);
  }

  function weekKeyFrom(year, kw) {
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function getWeekKey(row) {
    const y = num(row.year);
    const k = num(row.kw);
    return weekKeyFrom(y, k);
  }

  function isRowInWeek(row, selectedKey) {
    if (selectedKey === "all") return true;
    return getWeekKey(row) === selectedKey;
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function sortWeeksDesc(keys) {
    return keys
      .filter((k) => k && k !== "all")
      .sort((a, b) => a.localeCompare(b))
      .reverse();
  }

  function formatWeekLabel(key) {
    if (key === "all") return "All time";
    const m = String(key).match(/^(\d{4})-KW(\d{2})$/);
    if (!m) return key;
    return `KW ${Number(m[2])}`;
  }

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  /* =========================
     ERROR BANNER
  ========================= */

  const dataErrors = new Map();

  function setDataError(key, msg) {
    if (msg) dataErrors.set(key, msg);
    else dataErrors.delete(key);

    const banner = $("dataErrors");
    if (!banner) return;

    if (dataErrors.size === 0) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }

    banner.classList.remove("hidden");
    banner.innerHTML = Array.from(dataErrors.values())
      .map((m) => `<div>${esc(m)}</div>`)
      .join("");
  }

  /* =========================
     CSV PARSER (robust)
  ========================= */

  function parseCSV(text) {
    const cleaned = String(text ?? "").replace(/^\uFEFF/, "");
    const trimmed = cleaned.trim();
    if (!trimmed) return { headers: [], rows: [], isHtml: false };

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("<!doctype") || lower.startsWith("<html")) {
      return { headers: [], rows: [], isHtml: true };
    }

    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      const next = cleaned[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        current.push(field);
        field = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i += 1;
        current.push(field);
        if (current.some((v) => v !== "")) rows.push(current);
        current = [];
        field = "";
        continue;
      }

      field += ch;
    }

    if (field.length || current.length) {
      current.push(field);
      if (current.some((v) => v !== "")) rows.push(current);
    }

    const headerRow = rows.shift() || [];
    const headers = headerRow.map((h) => normalizeHeader(h));

    const mapped = rows.map((line) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (line[idx] ?? "").trim();
      });
      return obj;
    });

    return { headers, rows: mapped, isHtml: false };
  }

  async function loadCSV(key, url) {
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}cb=${Date.now()}`;
    let text = "";
    let status = "unknown";

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      status = res.status;
      text = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const parsed = parseCSV(text);
      if (parsed.isHtml || !parsed.headers.length) throw new Error("Empty or invalid CSV");

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      console.log("CSV load failed", {
        key,
        url: fullUrl,
        status,
        snippet: text.slice(0, 200),
        error: e
      });
      throw e;
    }
  }

  /* =========================
     NORMALIZERS
  ========================= */

  // pipeline_weekly can be long (stage,count) OR wide (stages as columns)
  function normalizeWeekly(rows) {
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map((r) => ({
        year: num(r.year),
        kw: num(r.kw),
        role: r.role || "",
        stage: normalizeStage(r.stage),
        count: num(r.count)
      }));
    }

    const core = new Set(["role", "kw", "year", "recruiter", "health", "week_start"]);
    const out = [];

    rows.forEach((r) => {
      const year = num(r.year);
      const kw = num(r.kw);
      const role = r.role || "";
      Object.keys(r).forEach((k) => {
        if (core.has(k)) return;
        const stage = normalizeStage(k);
        if (!stage) return;
        out.push({ year, kw, role, stage, count: num(r[k]) });
      });
    });

    return out;
  }

  // pipeline_inventory can be long or wide (YOUR sheet is wide)
  function normalizeInventory(rows) {
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map((r) => ({
        year: num(r.year),
        kw: num(r.kw),
        role: r.role || "",
        stage: normalizeStage(r.stage),
        count: num(r.count)
      }));
    }

    const core = new Set(["role", "kw", "year", "recruiter", "health", "week_start"]);
    const out = [];

    rows.forEach((r) => {
      const year = num(r.year);
      const kw = num(r.kw);
      const role = r.role || "";
      Object.keys(r).forEach((k) => {
        if (core.has(k)) return;
        const stage = normalizeStage(k);
        if (!stage) return;
        out.push({ year, kw, role, stage, count: num(r[k]) });
      });
    });

    return out;
  }

  function normalizeRoleNotes(rows) {
    return rows.map((r) => ({
      role: r.role || "",
      kw: num(r.kw),
      year: num(r.year),
      recruiter: r.recruiter || "",
      challenges: r.challenges || "",
      highlights: r.highlights || "",
      big_wins: r.big_wins || ""
    }));
  }

  /* =========================
     TABS (Contributor)
  ========================= */

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll("#contributorView .panel");
    const target = tabId || "overview";

    tabs.forEach((t) => {
      const isActive = t.dataset.tab === target;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((p) => p.classList.toggle("active", p.id === target));
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;

        if (id === "hires" && sessionStorage.getItem(HIRES_UNLOCK_KEY) !== "1") {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) return;
          sessionStorage.setItem(HIRES_UNLOCK_KEY, "1");
          const gate = $("hiresGate");
          const content = $("hiresContent");
          if (gate) gate.classList.add("hidden");
          if (content) content.classList.remove("hidden");
        }

        window.location.hash = id;
        activateTab(id);
      });
    });

    window.addEventListener("hashchange", () => {
      const id = window.location.hash.replace("#", "") || "overview";
      activateTab(id);
    });

    const initial = window.location.hash.replace("#", "") || "overview";
    activateTab(initial);

    // restore hires gate
    if (sessionStorage.getItem(HIRES_UNLOCK_KEY) === "1") {
      $("hiresGate")?.classList.add("hidden");
      $("hiresContent")?.classList.remove("hidden");
    }
  }

  /* =========================
     VIEW SWITCH + MGMT GATE
  ========================= */

  function ensureMgmtUnlockedOrKickBack() {
    const unlocked = sessionStorage.getItem(MGMT_UNLOCK_KEY) === "1";
    const gate = $("managementGate");
    const content = $("managementContent");

    if (unlocked) {
      gate?.classList.add("hidden");
      content?.classList.remove("hidden");
      renderManagement();
      return true;
    }

    const input = window.prompt("Enter password to access Management View:");
    if (input !== MANAGEMENT_PASSWORD) {
      if (gate) {
        gate.textContent = "Access denied.";
        gate.classList.remove("hidden");
      }
      if (content) content.classList.add("hidden");
      setView("contributor");
      return false;
    }

    sessionStorage.setItem(MGMT_UNLOCK_KEY, "1");
    gate?.classList.add("hidden");
    content?.classList.remove("hidden");
    renderManagement();
    return true;
  }

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const isContributor = view === "contributor";

    $("contributorView")?.classList.toggle("hidden", !isContributor);
    $("managementView")?.classList.toggle("hidden", isContributor);

    $("viewContributor")?.classList.toggle("active", isContributor);
    $("viewManagement")?.classList.toggle("active", !isContributor);

    if (!isContributor) ensureMgmtUnlockedOrKickBack();
  }

  /* =========================
     SELECT HELPERS
  ========================= */

  function fillWeekSelectNoAll(select, weekKeys, selected) {
    if (!select) return;
    select.innerHTML = "";

    weekKeys.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = formatWeekLabel(k);
      select.appendChild(opt);
    });

    select.value = selected && weekKeys.includes(selected) ? selected : (weekKeys[0] || "");
  }

  function fillWeekSelectWithAll(select, weekKeys, selected) {
    if (!select) return;
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All time";
    select.appendChild(allOpt);

    weekKeys.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = formatWeekLabel(k);
      select.appendChild(opt);
    });

    if (selected === "all") select.value = "all";
    else select.value = selected && weekKeys.includes(selected) ? selected : (weekKeys[0] || "all");
  }

  /* =========================
     DOTS / RAG
  ========================= */

  function ragFromOverviewRow(row) {
    const v = normalizeHeader(row.health || row.rag || "");
    if (v.includes("critical")) return "critical";
    if (v.includes("risk") || v.includes("warning") || v.includes("at_risk")) return "warning";
    if (v.includes("healthy") || v.includes("good")) return "healthy";
    return "new";
  }

  function dotHTML(status) {
    if (status === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (status === "warning") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (status === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  /* =========================
     RENDER: OVERVIEW
  ========================= */

  function renderOverview() {
    const rows = state.overviewRows;

    const openRoles = rows.filter((r) => normalizeHeader(r.status) === "open").length;
    const filledRoles = rows.filter((r) => normalizeHeader(r.status) === "filled").length;
    const openings = rows.reduce((s, r) => s + num(r.openings), 0);

    let H = 0, W = 0, C = 0;
    rows.forEach((r) => {
      const rag = ragFromOverviewRow(r);
      if (rag === "healthy") H += 1;
      if (rag === "warning") W += 1;
      if (rag === "critical") C += 1;
    });

    $("overviewKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${openings}</div></div>
      <div class="kpi"><div class="label">RAG (🟢/🟡/🔴)</div><div class="value">${H}/${W}/${C}</div></div>
    `;

    $("overviewRagBadges").innerHTML = `
      <div class="badge good"><span class="dot"></span><span class="count">${H} Healthy</span></div>
      <div class="badge warn"><span class="dot"></span><span class="count">${W} At risk</span></div>
      <div class="badge bad"><span class="dot"></span><span class="count">${C} Critical</span></div>
    `;

    const tb = $("overviewTbody");
    tb.innerHTML = "";

    rows.forEach((r) => {
      const owner = r.owner || r.recruiter || r.pplwise_tap || r.pplwise_sourcer || r.tap || "";
      const rag = ragFromOverviewRow(r);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role || "")}</td>
        <td>${esc(r.status || "")}</td>
        <td>${esc(r.location || "")}</td>
        <td class="right">${num(r.openings).toLocaleString()}</td>
        <td>${esc(owner)}</td>
        <td class="right">${dotHTML(rag)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  /* =========================
     RENDER: PIPELINE (inventory)
  ========================= */

  function stagesFrom(rows, weekKey) {
    const filtered = rows.filter((r) => isRowInWeek(r, weekKey));
    const present = uniq(filtered.map((r) => r.stage));
    return [
      ...STAGE_ORDER.filter((s) => present.includes(s)),
      ...present.filter((s) => !STAGE_ORDER.includes(s)).sort((a, b) => a.localeCompare(b))
    ];
  }

  function renderPipeline() {
    const week = state.pipelineWeek;
    const rows = state.inventoryRows.filter((r) => isRowInWeek(r, week));

    const empty = $("pipelineEmpty");
    const thead = $("pipelineThead");
    const tbody = $("pipelineTbody");

    if (!rows.length) {
      empty.textContent =
        "No inventory rows for this week. If this stays empty, check pipeline_inventory gid and that the sheet is published as CSV.";
      empty.classList.remove("hidden");
      thead.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }

    empty.classList.add("hidden");

    const stages = stagesFrom(state.inventoryRows, week);
    const roles = uniq(rows.map((r) => r.role)).sort();

    const byRole = new Map();
    roles.forEach((role) => byRole.set(role, new Map()));

    rows.forEach((r) => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map((s) => `<th class="right">${esc(s)}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    roles.forEach((role) => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map((s) => `<td class="right">${(m.get(s) || 0).toLocaleString()}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* =========================
     RENDER: ACTIVITY (weekly, with All time)
  ========================= */

  function renderActivity() {
    const week = state.activityWeek;
    const rows = state.weeklyRows.filter((r) => isRowInWeek(r, week));

    const thead = $("activityThead");
    const tbody = $("activityTbody");

    const stages = stagesFrom(state.weeklyRows, week);
    const roles = uniq(rows.map((r) => r.role)).sort();

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map((s) => `<th class="right">${esc(s)}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    if (!rows.length || !roles.length) {
      tbody.innerHTML = `<tr><td colspan="${Math.max(1, stages.length + 1)}" class="muted">No activity data for this selection.</td></tr>`;
      return;
    }

    const byRole = new Map();
    roles.forEach((role) => byRole.set(role, new Map()));

    rows.forEach((r) => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    roles.forEach((role) => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map((s) => `<td class="right">${(m.get(s) || 0).toLocaleString()}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* =========================
     RENDER: SOURCING (with All time)
  ========================= */

  function renderSourcing() {
    const week = state.sourcingWeek;

    const rows = state.sourcingRows.filter((r) => {
      if (week === "all") return true;
      return getWeekKey(r) === week;
    });

    const byRole = new Map();
    rows.forEach((r) => {
      const role = r.role || "";
      if (!role) return;
      if (!byRole.has(role)) byRole.set(role, { contacted: 0, replied: 0, screens: 0 });

      const obj = byRole.get(role);
      obj.contacted += num(r.contacted);
      obj.replied += num(r.replied);
      obj.screens += num(r.recruiter_screen || r.recruiter_screened || r.recruiterScreen);
    });

    const roles = Array.from(byRole.keys()).sort();
    const tb = $("sourcingTbody");
    tb.innerHTML = "";

    let totC = 0, totR = 0, totS = 0;

    roles.forEach((role) => {
      const v = byRole.get(role);
      totC += v.contacted;
      totR += v.replied;
      totS += v.screens;
      const conv = v.contacted > 0 ? v.screens / v.contacted : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        <td class="right">${v.contacted.toLocaleString()}</td>
        <td class="right">${v.replied.toLocaleString()}</td>
        <td class="right">${v.screens.toLocaleString()}</td>
        <td class="right">${conv === null ? "—" : `${Math.round(conv * 100)}%`}</td>
      `;
      tb.appendChild(tr);
    });

    const overallConv = totC > 0 ? totS / totC : null;

    $("sourcingKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${totC.toLocaleString()}</div><div class="sub">${week === "all" ? "All time" : "Selected week"}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${totR.toLocaleString()}</div><div class="sub">${week === "all" ? "All time" : "Selected week"}</div></div>
      <div class="kpi"><div class="label">Recruiter Screens</div><div class="value">${totS.toLocaleString()}</div><div class="sub">${overallConv === null ? "—" : `${Math.round(overallConv * 100)}% conversion`}</div></div>
      <div class="kpi"><div class="label">Scope</div><div class="value">${week === "all" ? "All time" : formatWeekLabel(week)}</div><div class="sub">Week selector</div></div>
    `;
  }

  /* =========================
     RENDER: HIRES (safe if empty)
  ========================= */

  function parseDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(a, b) {
    if (!a || !b) return null;
    const ms = b - a;
    return Number.isFinite(ms) ? Math.round(ms / (1000 * 60 * 60 * 24)) : null;
  }

  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function renderHires() {
    const rows = state.hiredRows;

    const tb = $("hiresTbody");
    tb.innerHTML = "";

    const tth = [];
    const ttf = [];
    const dip = [];

    rows.forEach((r) => {
      const live = parseDate(r.live_date || r.live);
      const sig = parseDate(r.signature_date || r.signature);
      const start = parseDate(r.start_date || r.start);
      const first = parseDate(r["1st_contact"] || r.first_contact || r.first);

      const vTth = dayDiff(live, sig);
      const vTtf = dayDiff(live, start);
      const vDip = dayDiff(first, sig);

      if (vTth !== null) tth.push(vTth);
      if (vTtf !== null) ttf.push(vTtf);
      if (vDip !== null) dip.push(vDip);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role || "")}</td>
        <td>${esc(r.first_name || "")}</td>
        <td>${esc(r.last_name || "")}</td>
        <td>${esc(r.source || "")}</td>
        <td>${esc(r.live_date || "")}</td>
        <td>${esc(r["1st_contact"] || r.first_contact || "")}</td>
        <td>${esc(r.signature_date || "")}</td>
        <td>${esc(r.start_date || "")}</td>
        <td class="right">${vTth === null ? "—" : vTth}</td>
        <td class="right">${vTtf === null ? "—" : vTtf}</td>
        <td class="right">${vDip === null ? "—" : vDip}</td>
      `;
      tb.appendChild(tr);
    });

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${rows.length}</div><div class="sub">${rows.length === 0 ? "No hire data yet" : "All time"}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avg(tth) === null ? "—" : avg(tth).toFixed(1)}</div><div class="sub">Days</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avg(ttf) === null ? "—" : avg(ttf).toFixed(1)}</div><div class="sub">Days</div></div>
      <div class="kpi"><div class="label">Avg Days in Process</div><div class="value">${avg(dip) === null ? "—" : avg(dip).toFixed(1)}</div><div class="sub">1st contact → signature</div></div>
    `;
  }

  /* =========================
     MANAGEMENT (minimal + gated)
  ========================= */

  function getOwnerMap() {
    const map = {};
    state.overviewRows.forEach((r) => {
      if (!r.role) return;
      const owner = r.owner || r.recruiter || r.pplwise_tap || r.pplwise_sourcer || r.tap || "";
      if (owner) map[r.role] = owner;
    });
    return map;
  }

  function fillManagementFilters() {
    const ownerMap = getOwnerMap();

    const roles = uniq(state.overviewRows.map((r) => r.role)).sort();
    const recruiters = uniq(Object.values(ownerMap)).sort();

    const roleSel = $("managementRoleSelect");
    const recSel = $("managementRecruiterSelect");

    if (roleSel) {
      roleSel.innerHTML = `<option value="all">All Roles</option>` + roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
      roleSel.value = state.mgmtRole;
    }

    if (recSel) {
      recSel.innerHTML = `<option value="all">All Recruiters</option>` + recruiters.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
      recSel.value = state.mgmtRecruiter;
    }
  }

  function renderDonut(canvasId, emptyId, chartKey, labels, data) {
    const canvas = $(canvasId);
    const empty = $(emptyId);

    const total = data.reduce((s, v) => s + v, 0);
    if (!total) {
      if (state.charts[chartKey]) {
        state.charts[chartKey].destroy();
        state.charts[chartKey] = null;
      }
      if (empty) empty.classList.remove("hidden");
      if (canvas) canvas.classList.add("hidden");
      return;
    }

    if (empty) empty.classList.add("hidden");
    if (canvas) canvas.classList.remove("hidden");

    const colors = ["#22c55e", "#f59e0b", "#ef4444", "#64748b", "#38bdf8", "#f97316"];

    if (state.charts[chartKey]) {
      state.charts[chartKey].data.labels = labels;
      state.charts[chartKey].data.datasets[0].data = data;
      state.charts[chartKey].update();
      return;
    }

    state.charts[chartKey] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: "#e5e7eb" } }
        }
      }
    });
  }

  function renderManagement() {
    if (sessionStorage.getItem(MGMT_UNLOCK_KEY) !== "1") return;

    const ownerMap = getOwnerMap();
    const week = state.mgmtWeek;

    const openRoles = state.overviewRows
      .filter((r) => normalizeHeader(r.status) === "open")
      .filter((r) => state.mgmtRole === "all" || r.role === state.mgmtRole)
      .filter((r) => state.mgmtRecruiter === "all" || (ownerMap[r.role] || "") === state.mgmtRecruiter)
      .length;

    const inventory = state.inventoryRows
      .filter((r) => isRowInWeek(r, week))
      .filter((r) => state.mgmtRole === "all" || r.role === state.mgmtRole)
      .filter((r) => state.mgmtRecruiter === "all" || (ownerMap[r.role] || "") === state.mgmtRecruiter);

    const weekly = state.weeklyRows
      .filter((r) => isRowInWeek(r, week))
      .filter((r) => state.mgmtRole === "all" || r.role === state.mgmtRole)
      .filter((r) => state.mgmtRecruiter === "all" || (ownerMap[r.role] || "") === state.mgmtRecruiter);

    const pipelineCandidates = inventory.reduce((s, r) => s + num(r.count), 0);
    const weeklyActivity = weekly.reduce((s, r) => s + num(r.count), 0);
    const hiresAll = state.hiredRows.length;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${pipelineCandidates.toLocaleString()}</div><div class="sub">End-of-week inventory</div></div>
      <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${weeklyActivity.toLocaleString()}</div><div class="sub">Selected week</div></div>
      <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${hiresAll.toLocaleString()}</div></div>
    `;

    // health donut from overview rag
    let H = 0, W = 0, C = 0;
    state.overviewRows.forEach((r) => {
      if (state.mgmtRole !== "all" && r.role !== state.mgmtRole) return;
      if (state.mgmtRecruiter !== "all" && (ownerMap[r.role] || "") !== state.mgmtRecruiter) return;
      const rag = ragFromOverviewRow(r);
      if (rag === "healthy") H += 1;
      if (rag === "warning") W += 1;
      if (rag === "critical") C += 1;
    });
    renderDonut("pipelineHealthChart", "pipelineHealthEmpty", "pipelineHealth", ["Healthy", "At risk", "Critical"], [H, W, C]);

    // source mix donut
    const src = state.sourcingRows
      .filter((r) => getWeekKey(r) === week)
      .filter((r) => state.mgmtRole === "all" || r.role === state.mgmtRole)
      .filter((r) => state.mgmtRecruiter === "all" || (ownerMap[r.role] || "") === state.mgmtRecruiter);

    const bySource = new Map();
    src.forEach((r) => {
      const s = r.source || r.channel || r.sourcing_channel || "";
      if (!s) return;
      bySource.set(s, (bySource.get(s) || 0) + num(r.contacted));
    });

    const sorted = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    renderDonut(
      "sourceMixChart",
      "sourceMixEmpty",
      "sourceMix",
      top.map((x) => x[0]),
      top.map((x) => x[1])
    );

    // utilization table (simple)
    const utilBody = $("managementUtilizationTbody");
    utilBody.innerHTML = "";

    const recruiters = state.mgmtRecruiter === "all" ? uniq(Object.values(ownerMap)) : [state.mgmtRecruiter];
    if (!recruiters.length) {
      utilBody.innerHTML = `<tr><td colspan="4" class="muted">No utilization data.</td></tr>`;
    } else {
      recruiters.sort().forEach((rec) => {
        const relRoles = Object.keys(ownerMap).filter((role) => ownerMap[role] === rec);
        const scopedRoles = state.mgmtRole === "all" ? relRoles : relRoles.filter((r) => r === state.mgmtRole);

        const weekRows = state.sourcingRows
          .filter((r) => getWeekKey(r) === week)
          .filter((r) => scopedRoles.includes(r.role || ""));

        const contacted = weekRows.reduce((s, r) => s + num(r.contacted), 0);
        const screens = weekRows.reduce((s, r) => s + num(r.recruiter_screen || r.recruiter_screened || r.recruiterScreen), 0);

        const approxTarget = 50; // fallback
        const utilization = Math.min(100, Math.round(((contacted + screens) / approxTarget) * 100));

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(rec)}</td>
          <td class="right">${screens.toLocaleString()}</td>
          <td class="right">${contacted.toLocaleString()}</td>
          <td>
            <div class="util-meta">
              <div class="util-bar"><span style="width:${utilization}%"></span></div>
              <span>${utilization}% (approx)</span>
            </div>
          </td>
        `;
        utilBody.appendChild(tr);
      });
    }

    // role notes
    const insights = $("roleInsights");
    insights.innerHTML = "";

    const notes = state.roleNotesRows.filter((n) => {
      const wk = weekKeyFrom(num(n.year), num(n.kw));
      if (wk !== week) return false;
      if (state.mgmtRole !== "all" && n.role !== state.mgmtRole) return false;
      if (state.mgmtRecruiter !== "all" && n.recruiter !== state.mgmtRecruiter) return false;
      return (n.challenges || n.highlights || n.big_wins);
    });

    if (!notes.length) {
      insights.innerHTML = `<div class="placeholder">No role insights shared for this week.</div>`;
    } else {
      notes.forEach((n) => {
        const card = document.createElement("details");
        card.className = "insight-card";
        card.open = true;

        const challenges = (n.challenges || "").split(/\r?\n|\|/).map((x) => x.trim()).filter(Boolean);
        const highlights = (n.highlights || "").split(/\r?\n|\|/).map((x) => x.trim()).filter(Boolean);
        const wins = (n.big_wins || "").split(/\r?\n|\|/).map((x) => x.trim()).filter(Boolean);

        card.innerHTML = `
          <summary>
            <div class="insight-meta">
              <strong>${esc(n.role || "Role")}</strong>
            </div>
            <span class="muted">${esc(n.recruiter || "")}</span>
          </summary>

          ${challenges.length ? `
            <div class="insight-section">
              <h4>Challenges</h4>
              <ul>${challenges.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            </div>` : ""}

          ${highlights.length ? `
            <div class="insight-section">
              <h4>Highlights</h4>
              <ul>${highlights.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            </div>` : ""}

          ${wins.length ? `
            <div class="insight-section">
              <h4>Big Wins</h4>
              <ul>${wins.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            </div>` : ""}
        `;
        insights.appendChild(card);
      });
    }
  }

  /* =========================
     REFRESH + WIRING
  ========================= */

  function syncSelectors() {
    // pipeline weeks from inventory (preferred) else weekly
    const invWeekKeys = uniq(state.inventoryRows.map(getWeekKey));
    const weeklyWeekKeys = uniq(state.weeklyRows.map(getWeekKey));
    const srcWeekKeys = uniq(state.sourcingRows.map(getWeekKey));

    const pipelineWeeks = sortWeeksDesc(invWeekKeys.length ? invWeekKeys : weeklyWeekKeys);
    const activityWeeks = sortWeeksDesc(weeklyWeekKeys);
    const sourcingWeeks = sortWeeksDesc(srcWeekKeys);

    // set defaults
    if (!state.pipelineWeek || !pipelineWeeks.includes(state.pipelineWeek)) state.pipelineWeek = pipelineWeeks[0] || "";
    if (state.activityWeek !== "all" && !activityWeeks.includes(state.activityWeek)) state.activityWeek = "all";
    if (state.sourcingWeek !== "all" && !sourcingWeeks.includes(state.sourcingWeek)) state.sourcingWeek = "all";

    // management week defaults to latest weekly or pipeline
    const mgmtWeeks = activityWeeks.length ? activityWeeks : pipelineWeeks;
    if (!state.mgmtWeek || !mgmtWeeks.includes(state.mgmtWeek)) state.mgmtWeek = mgmtWeeks[0] || "";

    fillWeekSelectNoAll($("pipelineWeekSelect"), pipelineWeeks, state.pipelineWeek);
    fillWeekSelectWithAll($("activityWeekSelect"), activityWeeks, state.activityWeek);
    fillWeekSelectWithAll($("sourcingWeekSelect"), sourcingWeeks, state.sourcingWeek);
    fillWeekSelectNoAll($("managementWeekSelect"), mgmtWeeks, state.mgmtWeek);
  }

  function renderAll() {
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires();
    fillManagementFilters();
    renderManagement();
  }

  async function refreshAll() {
    try {
      const [
        overviewRows,
        pipelineWeeklyRaw,
        pipelineInventoryRaw,
        sourcingRows,
        hiredRows,
        targetRows,
        roleNotesRows
      ] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipelineWeekly", CSV.pipelineWeekly),
        loadCSV("pipelineInventory", CSV.pipelineInventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("roleTargets", CSV.roleTargets),
        loadCSV("roleNotes", CSV.roleNotes)
      ]);

      state.overviewRows = overviewRows;
      state.weeklyRows = normalizeWeekly(pipelineWeeklyRaw);
      state.inventoryRows = normalizeInventory(pipelineInventoryRaw);
      state.sourcingRows = sourcingRows;
      state.hiredRows = hiredRows; // can be empty safely
      state.targetRows = targetRows;
      state.roleNotesRows = normalizeRoleNotes(roleNotesRows);

      syncSelectors();
      renderAll();

      const last = $("lastUpdated");
      if (last) last.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      console.error(e);
    }
  }

  /* =========================
     INIT EVENT LISTENERS
  ========================= */

  initTabs();

  // restore view
  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (storedView === "management") state.view = "management";

  setView(state.view);

  $("viewContributor")?.addEventListener("click", () => setView("contributor"));
  $("viewManagement")?.addEventListener("click", () => setView("management"));

  $("refreshBtn")?.addEventListener("click", refreshAll);

  $("pipelineWeekSelect")?.addEventListener("change", (e) => {
    state.pipelineWeek = e.target.value;
    renderPipeline();
  });

  $("activityWeekSelect")?.addEventListener("change", (e) => {
    state.activityWeek = e.target.value;
    renderActivity();
  });

  $("sourcingWeekSelect")?.addEventListener("change", (e) => {
    state.sourcingWeek = e.target.value;
    renderSourcing();
  });

  $("managementWeekSelect")?.addEventListener("change", (e) => {
    state.mgmtWeek = e.target.value;
    renderManagement();
  });

  $("managementRoleSelect")?.addEventListener("change", (e) => {
    state.mgmtRole = e.target.value;
    renderManagement();
  });

  $("managementRecruiterSelect")?.addEventListener("change", (e) => {
    state.mgmtRecruiter = e.target.value;
    renderManagement();
  });

  // initial load
  refreshAll();
  setInterval(refreshAll, 60000);
});
