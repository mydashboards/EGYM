document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG ---------------- */

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

  const HEALTH_THRESHOLDS = {
    critical: 0.33,
    warning: 0.66
  };

  const HIRES_PASSWORD = "EGYM2026";
  const MANAGEMENT_PASSWORD = "EGYM2027";

  const VIEW_STORAGE_KEY = "dashboard_view";
  const MGMT_UNLOCK_KEY = "mgmt_unlocked";
  const HIRES_UNLOCK_KEY = "hires_unlocked";

  const ALL_TIME_VALUE = "__all__";

  const state = {
    view: "contributor",

    overviewRows: [],
    pipelineWeeklyRows: [],
    pipelineInventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    roleTargetsRows: [],
    roleNotesRows: [],

    pipelineWeekKey: "",
    activityWeekKey: "",
    sourcingWeekKey: "",

    managementWeekKey: "",
    managementRole: "all",
    managementRecruiter: "all",

    charts: {
      pipelineHealth: null,
      sourceMix: null
    }
  };

  const dataErrors = new Map();

  /* ---------------- DOM HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function show(el, on) {
    if (!el) return;
    el.classList.toggle("hidden", !on);
  }

  function updateDataErrorBanner() {
    const banner = $("dataErrors");
    if (!banner) return;

    if (dataErrors.size === 0) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }

    banner.classList.remove("hidden");
    banner.innerHTML = Array.from(dataErrors.values()).map(m => `<div>${esc(m)}</div>`).join("");
  }

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    updateDataErrorBanner();
  }

  /* ---------------- PARSING ---------------- */

  function normalizeHeader(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function parseCSV(text) {
    const cleaned = String(text ?? "").replace(/^\uFEFF/, ""); // BOM
    const trimmed = cleaned.trim();
    if (!trimmed) return { headers: [], rows: [], isHtml: false, isEmpty: true };

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("<!doctype") || lower.startsWith("<html")) {
      return { headers: [], rows: [], isHtml: true, isEmpty: false };
    }

    // Robust CSV parser (quotes, commas, newlines in quotes)
    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      const next = cleaned[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        current.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        current.push(field);
        if (current.some(v => v !== "")) rows.push(current);
        current = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length || current.length) {
      current.push(field);
      if (current.some(v => v !== "")) rows.push(current);
    }

    const headerRow = rows.shift() || [];
    const headers = headerRow.map(h => normalizeHeader(h));

    const mappedRows = rows.map(line => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (line[idx] ?? "").trim();
      });
      return obj;
    });

    return { headers, rows: mappedRows, isHtml: false, isEmpty: mappedRows.length === 0 };
  }

  async function loadCSV(key, url, { tolerateEmpty = false } = {}) {
    const cb = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cb}`;

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      const text = await res.text();

      if (!res.ok) {
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (HTTP ${res.status})`);
        throw new Error(`HTTP ${res.status} for ${key}`);
      }

      const parsed = parseCSV(text);

      if (parsed.isHtml) {
        setDataError(key, `Invalid data (HTML): ${DATA_SOURCE_LABELS[key]}`);
        throw new Error(`HTML response for ${key}`);
      }

      if (parsed.isEmpty && !tolerateEmpty) {
        setDataError(key, `Empty CSV: ${DATA_SOURCE_LABELS[key]}`);
        throw new Error(`Empty CSV for ${key}`);
      }

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      // If we're tolerating empty, never show as error if it simply has no rows.
      if (tolerateEmpty) setDataError(key, "");
      throw e;
    }
  }

  /* ---------------- NUM / DATE HELPERS ---------------- */

  const num = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  function weekKeyFromRow(row) {
    const year = num(row.year);
    const kw = num(row.kw);
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function parseWeekKey(value) {
    const m = String(value ?? "").match(/^(\d{4})-KW(\d{2})$/i);
    if (!m) return null;
    return { year: Number(m[1]), kw: Number(m[2]) };
  }

  function formatWeekLabelFromKey(key) {
    const p = parseWeekKey(key);
    if (!p) return "—";
    return `KW ${String(p.kw).padStart(2, "0")}`;
  }

  function getUniqueWeekKeys(rows) {
    const set = new Set();
    rows.forEach(r => {
      const k = weekKeyFromRow(r);
      if (k) set.add(k);
    });
    const keys = Array.from(set).sort((a, b) => {
      const pa = parseWeekKey(a);
      const pb = parseWeekKey(b);
      if (!pa || !pb) return b.localeCompare(a);
      if (pa.year !== pb.year) return pb.year - pa.year;
      return pb.kw - pa.kw;
    });
    return keys;
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

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  function normalizeStage(value) {
    return normalizeHeader(value);
  }

  function normalizeHealth(value) {
    const n = normalizeHeader(value);
    if (n.includes("critical")) return "critical";
    if (n.includes("warning") || n.includes("risk") || n.includes("at_risk")) return "warning";
    if (n.includes("healthy") || n.includes("good") || n.includes("ok")) return "healthy";
    return "";
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizePipelineWeekly(rows) {
    // Expect long format: year, kw, role, stage, count
    return rows.map(r => ({
      year: num(r.year),
      kw: num(r.kw),
      role: r.role || "",
      stage: normalizeStage(r.stage || ""),
      count: num(r.count),
      week_start: r.week_start || ""
    })).filter(r => r.year && r.kw && r.role && r.stage);
  }

  function normalizePipelineInventory(rows) {
    return rows.map(r => ({
      year: num(r.year),
      kw: num(r.kw),
      role: r.role || "",
      stage: r.stage || "",
      count: num(r.count),
      stage_order: r.stage_order !== undefined && r.stage_order !== "" ? num(r.stage_order) : null
    })).filter(r => r.year && r.kw && r.role && r.stage);
  }

  function normalizeSourcing(rows) {
    return rows.map(r => ({
      year: num(r.year),
      kw: num(r.kw),
      role: r.role || "",
      source: r.source || r.Source || "",
      recruiter: r.recruiter || r.owner || r.pplwise_tap || r.pplwise_sourcer || r.tap || "",
      contacted: num(r.contacted),
      replied: num(r.replied),
      recruiter_screen: num(r.recruiter_screen || r.recruiter_screened || r.recruiterScreen)
    })).filter(r => r.year && r.kw && r.role);
  }

  function normalizeOverview(rows) {
    return rows.map(r => ({
      role: r.role || "",
      status: r.status || "",
      location: r.location || "",
      openings: r.openings || "",
      owner: r.owner || r.recruiter || r.pplwise_tap || r.pplwise_sourcer || r.tap || "",
      health: normalizeHealth(r.health || "")
    })).filter(r => r.role);
  }

  function normalizeRoleTargets(rows) {
    // Expected long transitions:
    // role, from_stage, to_stage, expected_rate, lookback_weeks, min_prev_stage_n
    return rows.map(r => ({
      role: r.role || "",
      from_stage: normalizeStage(r.from_stage || ""),
      to_stage: normalizeStage(r.to_stage || ""),
      expected_rate: num(r.expected_rate),
      lookback_weeks: Math.max(1, num(r.lookback_weeks) || 1),
      min_prev_stage_n: Math.max(1, num(r.min_prev_stage_n) || 1)
    })).filter(r => r.role && r.from_stage && r.to_stage && r.expected_rate > 0);
  }

  function normalizeRoleNotes(rows) {
    return rows.map(r => ({
      role: r.role || "",
      kw: num(r.kw),
      year: num(r.year) || null, // optional
      recruiter: r.recruiter || "",
      challenges: r.challenges || "",
      highlights: r.highlights || "",
      big_wins: r.big_wins || ""
    })).filter(r => r.role && r.kw);
  }

  /* ---------------- HEALTH COMPUTATION ---------------- */

  function computeHealthForRole(role, weeklyRows, transitions, endWeekKey) {
    const roleRows = weeklyRows.filter(r => r.role === role);
    if (!roleRows.length) return { health: "new", reason: "No data" };

    const weeks = Array.from(new Set(roleRows.map(weekKeyFromRow))).filter(Boolean).sort();
    const eligibleWeeks = endWeekKey ? weeks.filter(w => w <= endWeekKey) : weeks;
    if (!eligibleWeeks.length) return { health: "new", reason: "No data" };

    const roleTransitions = transitions.filter(t => t.role === role);
    if (!roleTransitions.length) return { health: "new", reason: "No targets" };

    // group rows by week
    const byWeek = new Map();
    roleRows.forEach(r => {
      const wk = weekKeyFromRow(r);
      if (!wk) return;
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk).push(r);
    });

    let evaluated = 0;
    let worstScore = Infinity;
    let bottleneck = "—";

    for (const t of roleTransitions) {
      const lookbackWeeks = eligibleWeeks.slice(-t.lookback_weeks);
      let fromCount = 0;
      let toCount = 0;

      lookbackWeeks.forEach(wk => {
        const rows = byWeek.get(wk) || [];
        rows.forEach(rr => {
          if (rr.stage === t.from_stage) fromCount += rr.count;
          if (rr.stage === t.to_stage) toCount += rr.count;
        });
      });

      if (fromCount < t.min_prev_stage_n) continue;

      const actual = fromCount > 0 ? (toCount / fromCount) : 0;
      const score = actual / t.expected_rate;
      evaluated += 1;

      if (score < worstScore) {
        worstScore = score;
        bottleneck = `${t.from_stage}→${t.to_stage} (${Math.round(actual * 100)}% vs ${Math.round(t.expected_rate * 100)}%)`;
      }
    }

    if (!evaluated) return { health: "new", reason: "Not enough data" };

    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck };
    return { health: "healthy", reason: bottleneck };
  }

  /* ---------------- SELECT HELPERS ---------------- */

  function fillWeekSelect(select, weekKeys, selectedKey, { includeAllTime = false } = {}) {
    if (!select) return;
    select.innerHTML = "";

    if (includeAllTime) {
      const opt = document.createElement("option");
      opt.value = ALL_TIME_VALUE;
      opt.textContent = "All time";
      select.appendChild(opt);
    }

    weekKeys.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = formatWeekLabelFromKey(k);
      select.appendChild(opt);
    });

    if (selectedKey && Array.from(select.options).some(o => o.value === selectedKey)) {
      select.value = selectedKey;
      return;
    }

    // default: latest week if present; else all time
    if (weekKeys.length) select.value = weekKeys[0];
    else if (includeAllTime) select.value = ALL_TIME_VALUE;
  }

  function fillSelectWithAll(select, values, allLabel) {
    if (!select) return;
    const current = select.value || "all";
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = allLabel;
    select.appendChild(allOpt);

    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

    select.value = (current === "all" || values.includes(current)) ? current : "all";
  }

  /* ---------------- TAB + VIEW ---------------- */

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll("#contributorView .panel");
    const target = tabId || "overview";

    tabs.forEach(t => {
      const active = t.dataset.tab === target;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });

    panels.forEach(p => p.classList.toggle("active", p.id === target));
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;
        if (id === "hires") {
          const unlocked = sessionStorage.getItem(HIRES_UNLOCK_KEY) === "1";
          if (!unlocked) {
            const input = window.prompt("Enter password to access Hires & KPIs:");
            if (input !== HIRES_PASSWORD) return;
            sessionStorage.setItem(HIRES_UNLOCK_KEY, "1");
            show($("hiresGate"), false);
            show($("hiresContent"), true);
          }
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
  }

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const contributorBtn = $("viewContributor");
    const managementBtn = $("viewManagement");

    contributorBtn?.classList.toggle("active", view === "contributor");
    managementBtn?.classList.toggle("active", view === "management");

    show($("contributorView"), view === "contributor");
    show($("managementView"), view === "management");

    // If management is selected, enforce gate
    if (view === "management") {
      enforceManagementGate();
      renderManagement(); // render with whatever current state is
    }
  }

  function enforceManagementGate() {
    const unlocked = sessionStorage.getItem(MGMT_UNLOCK_KEY) === "1";
    show($("managementGate"), !unlocked);
    show($("managementContent"), unlocked);
  }

  function unlockManagement() {
    const input = window.prompt("Enter management password:");
    if (input !== MANAGEMENT_PASSWORD) return false;
    sessionStorage.setItem(MGMT_UNLOCK_KEY, "1");
    enforceManagementGate();
    return true;
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const rows = state.overviewRows;
    const weekly = state.pipelineWeeklyRows;
    const transitions = state.roleTargetsRows;

    // Determine “latest” week from weekly
    const weekKeys = getUniqueWeekKeys(weekly);
    const latestWeek = weekKeys[0] || "";

    // Health by role: from overview.health if present, else computed
    const healthByRole = {};
    rows.forEach(r => {
      if (r.health) healthByRole[r.role] = r.health;
    });

    rows.forEach(r => {
      if (healthByRole[r.role]) return;
      if (!latestWeek) {
        healthByRole[r.role] = "new";
        return;
      }
      healthByRole[r.role] = computeHealthForRole(r.role, weekly, transitions, latestWeek).health;
    });

    // KPI cards
    const openRoles = rows.filter(r => String(r.status || "").toLowerCase() === "open").length;
    const filledRoles = rows.filter(r => String(r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = rows.reduce((s, r) => s + num(r.openings), 0);

    const counts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    rows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      counts[h] = (counts[h] || 0) + 1;
    });

    const cards = $("overviewCards");
    if (cards) {
      cards.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
        <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
        <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
        <div class="kpi"><div class="label">RAG (🟢/🟡/🔴)</div><div class="value">${counts.healthy}/${counts.warning}/${counts.critical}</div></div>
      `;
    }

    const rag = $("overviewRagSummary");
    if (rag) {
      rag.innerHTML = `
        <div class="health-badge ${counts.healthy ? "" : "zero"}"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
        <div class="health-badge ${counts.warning ? "" : "zero"}"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
        <div class="health-badge ${counts.critical ? "" : "zero"}"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
      `;
    }

    const tbody = $("overviewTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    rows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role)}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.location)}</td>
        <td>${esc(r.openings)}</td>
        <td>${esc(r.owner)}</td>
        <td>${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE (INVENTORY) ---------------- */

  function getStagesForInventory(rows, weekKey) {
    const map = new Map();
    rows.forEach(r => {
      if (weekKeyFromRow(r) !== weekKey) return;
      if (!map.has(r.stage)) map.set(r.stage, { label: r.stage, order: r.stage_order });
    });
    return Array.from(map.values()).sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : null;
      const bo = Number.isFinite(b.order) ? b.order : null;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  function renderPipeline() {
    const week = state.pipelineWeekKey;
    const inv = state.pipelineInventoryRows;

    const empty = $("pipelineEmpty");
    const thead = $("pipelineThead");
    const tbody = $("pipelineTbody");

    if (!thead || !tbody || !empty) return;

    const rows = inv.filter(r => weekKeyFromRow(r) === week);
    const stages = getStagesForInventory(inv, week);

    if (!rows.length) {
      show(empty, true);
      empty.textContent = "No inventory rows for this week. If this stays empty, check that pipeline_inventory CSV points to the correct sheet tab (gid).";
    } else {
      show(empty, false);
      empty.textContent = "";
    }

    const roles = Array.from(new Set(rows.map(r => r.role))).sort();
    const byRole = new Map();
    roles.forEach(role => byRole.set(role, new Map()));

    rows.forEach(r => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + r.count);
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map(s => `<th>${esc(s.label)}</th>`).join("")}
        <th>RAG</th>
      </tr>
    `;

    tbody.innerHTML = "";

    // Health computed for selected week
    const weekly = state.pipelineWeeklyRows;
    const transitions = state.roleTargetsRows;

    roles.forEach(role => {
      const m = byRole.get(role) || new Map();
      const h = computeHealthForRole(role, weekly, transitions, week).health;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map(s => `<td>${(m.get(s.label) || 0).toLocaleString()}</td>`).join("")}
        <td>${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });

    if (!roles.length) {
      tbody.innerHTML = `<tr><td colspan="${Math.max(1, stages.length + 2)}" class="muted">No inventory data available for the selected week.</td></tr>`;
    }
  }

  /* ---------------- RENDER: ACTIVITY ---------------- */

  function renderActivity() {
    const thead = $("activityThead");
    const tbody = $("activityTbody");
    const empty = $("activityEmpty");
    if (!thead || !tbody || !empty) return;

    const week = state.activityWeekKey;
    const rows = (week === ALL_TIME_VALUE)
      ? state.pipelineWeeklyRows
      : state.pipelineWeeklyRows.filter(r => weekKeyFromRow(r) === week);

    if (!rows.length) {
      show(empty, true);
      empty.textContent = "No activity data available for this selection.";
      thead.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }

    show(empty, false);

    const stageSet = new Set(rows.map(r => r.stage).filter(Boolean));
    const preferred = ["sourced","step1","tech_light","tech_iv","final","offer","hired"];
    const stages = [
      ...preferred.filter(s => stageSet.has(s)),
      ...Array.from(stageSet).filter(s => !preferred.includes(s)).sort((a,b) => a.localeCompare(b))
    ];

    const roles = Array.from(new Set(rows.map(r => r.role))).filter(Boolean).sort();
    const byRole = new Map();
    roles.forEach(role => byRole.set(role, new Map()));
    rows.forEach(r => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + r.count);
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map(s => `<th>${esc(s.replaceAll("_", " ").toUpperCase())}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    roles.forEach(role => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map(s => `<td>${(m.get(s) || 0).toLocaleString()}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing() {
    const tbody = $("sourcingTbody");
    const summary = $("sourcingSummary");
    const empty = $("sourcingEmpty");
    if (!tbody || !summary || !empty) return;

    const week = state.sourcingWeekKey;
    const rows = (week === ALL_TIME_VALUE)
      ? state.sourcingRows
      : state.sourcingRows.filter(r => weekKeyFromRow(r) === week);

    if (!rows.length) {
      show(empty, true);
      empty.textContent = "No sourcing data available for this selection.";
      tbody.innerHTML = "";
      summary.innerHTML = "";
      return;
    }

    show(empty, false);

    // aggregate by role
    const byRole = new Map();
    rows.forEach(r => {
      const key = r.role || "—";
      if (!byRole.has(key)) byRole.set(key, { contacted: 0, replied: 0, screens: 0 });
      const agg = byRole.get(key);
      agg.contacted += r.contacted;
      agg.replied += r.replied;
      agg.screens += r.recruiter_screen;
      byRole.set(key, agg);
    });

    const roles = Array.from(byRole.keys()).sort((a,b) => a.localeCompare(b));

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreens = 0;

    tbody.innerHTML = "";
    roles.forEach(role => {
      const agg = byRole.get(role);
      totalContacted += agg.contacted;
      totalReplied += agg.replied;
      totalScreens += agg.screens;

      const conv = agg.contacted > 0 ? (agg.screens / agg.contacted) : null;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        <td>${agg.contacted.toLocaleString()}</td>
        <td>${agg.replied.toLocaleString()}</td>
        <td>${agg.screens.toLocaleString()}</td>
        <td>${conv === null ? "—" : `${Math.round(conv * 100)}%`}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallConv = totalContacted > 0 ? totalScreens / totalContacted : null;
    summary.innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${totalContacted.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${totalReplied.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Total Recruiter Screens</div><div class="value">${totalScreens.toLocaleString()}</div><div class="sub">${overallConv === null ? "—" : `${Math.round(overallConv * 100)}%`} conversion</div></div>
      <div class="kpi"><div class="label">${week === ALL_TIME_VALUE ? "All time" : "Selected week"}</div><div class="value">${week === ALL_TIME_VALUE ? "∞" : formatWeekLabelFromKey(week)}</div></div>
    `;
  }

  /* ---------------- RENDER: HIRES ---------------- */

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(a, b) {
    if (!a || !b) return null;
    const ms = b - a;
    return Number.isFinite(ms) ? Math.round(ms / (1000 * 60 * 60 * 24)) : null;
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function renderHires() {
    const unlocked = sessionStorage.getItem(HIRES_UNLOCK_KEY) === "1";
    show($("hiresGate"), !unlocked);
    show($("hiresContent"), unlocked);
    if (!unlocked) return;

    const tbody = $("hiresTbody");
    const kpis = $("hiresKpis");
    const empty = $("hiresEmpty");
    if (!tbody || !kpis || !empty) return;

    const rows = state.hiredRows;

    if (!rows.length) {
      show(empty, true);
      empty.textContent = "No hire data yet.";
      tbody.innerHTML = "";
      kpis.innerHTML = `
        <div class="kpi"><div class="label">Total Hires</div><div class="value">0</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">—</div><div class="sub">No data</div></div>
      `;
      return;
    }

    show(empty, false);

    const tthVals = [];
    const ttfVals = [];
    const procVals = [];

    tbody.innerHTML = "";
    rows.forEach(r => {
      const live = parseDate(r.live_date || r.liveDate);
      const sig = parseDate(r.signature_date || r.signatureDate);
      const start = parseDate(r.start_date || r.startDate);
      const first = parseDate(r["1st_contact"] || r.first_contact || r.firstContact);

      const tth = dayDiff(live, sig);
      const ttf = dayDiff(live, start);
      const proc = dayDiff(first, sig);

      if (tth !== null) tthVals.push(tth);
      if (ttf !== null) ttfVals.push(ttf);
      if (proc !== null) procVals.push(proc);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role || "")}</td>
        <td>${esc(r.first_name || r.first || "")}</td>
        <td>${esc(r.last_name || r.last || "")}</td>
        <td>${esc(r.source || "")}</td>
        <td>${esc(r.salary || "")}</td>
        <td>${esc(r.live_date || "")}</td>
        <td>${esc(r["1st_contact"] || r.first_contact || "")}</td>
        <td>${esc(r.signature_date || "")}</td>
        <td>${esc(r.start_date || "")}</td>
        <td>${tth === null ? "—" : tth}</td>
        <td>${ttf === null ? "—" : ttf}</td>
        <td>${proc === null ? "—" : proc}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthVals);
    const avgTtf = average(ttfVals);

    kpis.innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${rows.length.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth === null ? "—" : avgTth.toFixed(1)}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf === null ? "—" : avgTtf.toFixed(1)}</div></div>
      <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">—</div><div class="sub">Depends on offer data</div></div>
    `;
  }

  /* ---------------- MANAGEMENT VIEW ---------------- */

  function getOwnerMap() {
    const map = {};
    state.overviewRows.forEach(r => {
      if (r.role && r.owner) map[r.role] = r.owner;
    });
    return map;
  }

  function getRecruiterForRole(role, ownerMap) {
    return ownerMap[role] || "";
  }

  function roleMatchesFilters(role, ownerMap) {
    if (state.managementRole !== "all" && role !== state.managementRole) return false;
    if (state.managementRecruiter === "all") return true;
    return getRecruiterForRole(role, ownerMap) === state.managementRecruiter;
  }

  function renderManagement() {
    const unlocked = sessionStorage.getItem(MGMT_UNLOCK_KEY) === "1";
    show($("managementGate"), !unlocked);
    show($("managementContent"), unlocked);
    if (!unlocked) return;

    const ownerMap = getOwnerMap();

    // Filter roles from overview
    const roles = state.overviewRows.map(r => r.role).filter(Boolean);
    const filteredRoles = roles.filter(role => roleMatchesFilters(role, ownerMap));

    const openRoles = state.overviewRows
      .filter(r => filteredRoles.includes(r.role))
      .filter(r => String(r.status || "").toLowerCase() === "open").length;

    const inv = state.pipelineInventoryRows.filter(r => weekKeyFromRow(r) === state.managementWeekKey)
      .filter(r => roleMatchesFilters(r.role, ownerMap));
    const pipelineCandidates = inv.reduce((s, r) => s + r.count, 0);

    const weekly = state.pipelineWeeklyRows.filter(r => weekKeyFromRow(r) === state.managementWeekKey)
      .filter(r => roleMatchesFilters(r.role, ownerMap));
    const weeklyActivity = weekly.reduce((s, r) => s + r.count, 0);

    const hiresCount = state.hiredRows.length;

    const kpis = $("managementKpis");
    if (kpis) {
      kpis.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
        <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${pipelineCandidates.toLocaleString()}</div><div class="sub">End-of-week inventory</div></div>
        <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${weeklyActivity.toLocaleString()}</div><div class="sub">Selected week</div></div>
        <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${hiresCount.toLocaleString()}</div><div class="sub">${hiresCount ? "All time" : "No hire data yet"}</div></div>
      `;
    }

    // health counts based on computed health
    const transitions = state.roleTargetsRows;
    const ragCounts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    const healthByRole = {};

    filteredRoles.forEach(role => {
      const computed = computeHealthForRole(role, state.pipelineWeeklyRows, transitions, state.managementWeekKey);
      healthByRole[role] = computed.health;
      ragCounts[computed.health] = (ragCounts[computed.health] || 0) + 1;
    });

    const rag = $("managementRagSummary");
    if (rag) {
      rag.innerHTML = `
        <div class="health-badge ${ragCounts.healthy ? "" : "zero"}"><span class="health-dot good"></span><span>${ragCounts.healthy} Healthy</span></div>
        <div class="health-badge ${ragCounts.warning ? "" : "zero"}"><span class="health-dot warn"></span><span>${ragCounts.warning} At risk</span></div>
        <div class="health-badge ${ragCounts.critical ? "" : "zero"}"><span class="health-dot bad"></span><span>${ragCounts.critical} Critical</span></div>
      `;
    }

    renderPipelineHealthChart(ragCounts);
    renderSourceMixChart(ownerMap);
    renderRecruiterUtilization(ownerMap);
    renderRoleInsights(ownerMap, healthByRole);
  }

  function renderPipelineHealthChart(counts) {
    const canvas = $("pipelineHealthChart");
    const empty = $("pipelineHealthEmpty");
    if (!canvas || !empty) return;

    const total = (counts.healthy || 0) + (counts.warning || 0) + (counts.critical || 0);
    if (!total) {
      if (state.charts.pipelineHealth) {
        state.charts.pipelineHealth.destroy();
        state.charts.pipelineHealth = null;
      }
      show(empty, true);
      show(canvas, false);
      return;
    }

    show(empty, false);
    show(canvas, true);

    const data = [counts.healthy || 0, counts.warning || 0, counts.critical || 0];
    const labels = ["Healthy", "At risk", "Critical"];

    if (state.charts.pipelineHealth) {
      state.charts.pipelineHealth.data.labels = labels;
      state.charts.pipelineHealth.data.datasets[0].data = data;
      state.charts.pipelineHealth.update();
      return;
    }

    state.charts.pipelineHealth = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"],
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

  function renderSourceMixChart(ownerMap) {
    const canvas = $("sourceMixChart");
    const empty = $("sourceMixEmpty");
    if (!canvas || !empty) return;

    const week = state.managementWeekKey;
    const filtered = state.sourcingRows
      .filter(r => weekKeyFromRow(r) === week)
      .filter(r => roleMatchesFilters(r.role, ownerMap));

    const map = new Map();
    filtered.forEach(r => {
      const s = (r.source || "").trim();
      if (!s) return;
      map.set(s, (map.get(s) || 0) + r.contacted);
    });

    if (!map.size) {
      if (state.charts.sourceMix) {
        state.charts.sourceMix.destroy();
        state.charts.sourceMix = null;
      }
      show(empty, true);
      show(canvas, false);
      return;
    }

    show(empty, false);
    show(canvas, true);

    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const other = rest.reduce((s, x) => s + x[1], 0);

    const labels = top.map(x => x[0]);
    const data = top.map(x => x[1]);
    if (other) {
      labels.push("Other");
      data.push(other);
    }

    if (state.charts.sourceMix) {
      state.charts.sourceMix.data.labels = labels;
      state.charts.sourceMix.data.datasets[0].data = data;
      state.charts.sourceMix.update();
      return;
    }

    state.charts.sourceMix = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ["#f97316", "#38bdf8", "#22c55e", "#64748b"].slice(0, labels.length),
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

  function renderRecruiterUtilization(ownerMap) {
    const tbody = $("managementUtilizationTbody");
    const empty = $("managementUtilEmpty");
    if (!tbody || !empty) return;

    const week = state.managementWeekKey;
    const rows = state.sourcingRows
      .filter(r => weekKeyFromRow(r) === week)
      .filter(r => roleMatchesFilters(r.role, ownerMap));

    // Targets per role: sum all role transitions? (fallback to 50 if not present)
    // We use a pragmatic utilization target: contacted + screens vs 50 unless you later add a role_target numeric.
    const byRecruiter = new Map();

    rows.forEach(r => {
      const recruiter = getRecruiterForRole(r.role, ownerMap) || "Unassigned";
      if (!byRecruiter.has(recruiter)) byRecruiter.set(recruiter, { contacted: 0, screens: 0, roles: new Set() });
      const agg = byRecruiter.get(recruiter);
      agg.contacted += r.contacted;
      agg.screens += r.recruiter_screen;
      agg.roles.add(r.role);
      byRecruiter.set(recruiter, agg);
    });

    const recruiters = Array.from(byRecruiter.keys()).sort();
    if (!recruiters.length) {
      show(empty, true);
      empty.textContent = "No recruiter utilization data for current filters.";
      tbody.innerHTML = "";
      return;
    }

    show(empty, false);
    tbody.innerHTML = "";

    recruiters.forEach(rec => {
      const agg = byRecruiter.get(rec);
      const total = agg.contacted + agg.screens;

      const target = 50; // fallback / approx
      const utilization = target ? Math.min(100, Math.round((total / target) * 100)) : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(rec)}</td>
        <td>${agg.screens.toLocaleString()}</td>
        <td>${agg.contacted.toLocaleString()}</td>
        <td>
          <div class="util-meta">
            <div class="util-bar"><span style="width:${utilization}%"></span></div>
            <span>${utilization}% (approx)</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function splitNotes(value) {
    return String(value || "")
      .split(/\r?\n|\|/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function renderRoleInsights(ownerMap, healthByRole) {
    const container = $("roleInsights");
    if (!container) return;

    const week = state.managementWeekKey;
    const notes = state.roleNotesRows
      .filter(n => {
        const k = n.year ? `${n.year}-KW${String(n.kw).padStart(2, "0")}` : null;
        // If role_notes doesn't have year, match by KW only
        if (k) return k === week;
        const wk = parseWeekKey(week);
        return wk ? n.kw === wk.kw : false;
      })
      .filter(n => roleMatchesFilters(n.role, ownerMap))
      .filter(n => n.challenges || n.highlights || n.big_wins);

    if (!notes.length) {
      container.innerHTML = `<div class="placeholder">No role insights shared for this week.</div>`;
      return;
    }

    const severityOrder = { critical: 0, warning: 1, healthy: 2, new: 3, "": 4 };

    notes.sort((a, b) => {
      const ah = healthByRole[a.role] || "new";
      const bh = healthByRole[b.role] || "new";
      return (severityOrder[ah] || 4) - (severityOrder[bh] || 4);
    });

    container.innerHTML = "";
    notes.forEach(n => {
      const health = healthByRole[n.role] || "new";
      const open = health === "critical" || health === "warning";
      const challenges = splitNotes(n.challenges);
      const highlights = splitNotes(n.highlights);
      const wins = splitNotes(n.big_wins);

      const card = document.createElement("details");
      card.className = "insight-card";
      if (open) card.open = true;

      card.innerHTML = `
        <summary>
          <div class="insight-meta">
            <strong>${esc(n.role)}</strong>
            ${healthDotHTML(health)}
          </div>
          <span class="muted">${esc(getRecruiterForRole(n.role, ownerMap) || n.recruiter || "")}</span>
        </summary>
        ${challenges.length ? `<div class="insight-section"><h4>Challenges</h4><ul>${challenges.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${highlights.length ? `<div class="insight-section"><h4>Highlights</h4><ul>${highlights.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${wins.length ? `<div class="insight-section"><h4>Big wins</h4><ul>${wins.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      `;

      container.appendChild(card);
    });
  }

  /* ---------------- WIRING ---------------- */

  function syncSelectors() {
    const pipelineWeeks = getUniqueWeekKeys(state.pipelineInventoryRows);
    const activityWeeks = getUniqueWeekKeys(state.pipelineWeeklyRows);
    const sourcingWeeks = getUniqueWeekKeys(state.sourcingRows);

    // Defaults (latest week)
    if (!state.pipelineWeekKey || !pipelineWeeks.includes(state.pipelineWeekKey)) state.pipelineWeekKey = pipelineWeeks[0] || "";
    if (!state.activityWeekKey || (!activityWeeks.includes(state.activityWeekKey) && state.activityWeekKey !== ALL_TIME_VALUE)) state.activityWeekKey = activityWeeks[0] || ALL_TIME_VALUE;
    if (!state.sourcingWeekKey || (!sourcingWeeks.includes(state.sourcingWeekKey) && state.sourcingWeekKey !== ALL_TIME_VALUE)) state.sourcingWeekKey = sourcingWeeks[0] || ALL_TIME_VALUE;

    if (!state.managementWeekKey || !activityWeeks.includes(state.managementWeekKey)) state.managementWeekKey = activityWeeks[0] || pipelineWeeks[0] || "";

    fillWeekSelect($("pipelineWeekSelect"), pipelineWeeks, state.pipelineWeekKey, { includeAllTime: false });
    fillWeekSelect($("activityWeekSelect"), activityWeeks, state.activityWeekKey, { includeAllTime: true });
    fillWeekSelect($("sourcingWeekSelect"), sourcingWeeks, state.sourcingWeekKey, { includeAllTime: true });
    fillWeekSelect($("managementWeekSelect"), activityWeeks.length ? activityWeeks : pipelineWeeks, state.managementWeekKey, { includeAllTime: false });

    // Management filters
    const roles = Array.from(new Set(state.overviewRows.map(r => r.role))).filter(Boolean).sort();
    const ownerMap = getOwnerMap();
    const recruiters = Array.from(new Set(Object.values(ownerMap))).filter(Boolean).sort();

    fillSelectWithAll($("managementRoleSelect"), roles, "All Roles");
    fillSelectWithAll($("managementRecruiterSelect"), recruiters, "All Recruiters");

    // Re-apply selected values if still valid
    if (state.managementRole && $("managementRoleSelect")) $("managementRoleSelect").value = state.managementRole;
    if (state.managementRecruiter && $("managementRecruiterSelect")) $("managementRecruiterSelect").value = state.managementRecruiter;
    if (state.managementWeekKey && $("managementWeekSelect")) $("managementWeekSelect").value = state.managementWeekKey;
  }

  function renderAll() {
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires();
    renderManagement();
  }

  async function refreshAll() {
    try {
      const [overviewRaw, weeklyRaw, invRaw, sourcingRaw, hiredRaw, targetsRaw, notesRaw] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipelineWeekly", CSV.pipelineWeekly),
        loadCSV("pipelineInventory", CSV.pipelineInventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired, { tolerateEmpty: true }),
        loadCSV("roleTargets", CSV.roleTargets),
        loadCSV("roleNotes", CSV.roleNotes, { tolerateEmpty: true })
      ]);

      state.overviewRows = normalizeOverview(overviewRaw);
      state.pipelineWeeklyRows = normalizePipelineWeekly(weeklyRaw);
      state.pipelineInventoryRows = normalizePipelineInventory(invRaw);
      state.sourcingRows = normalizeSourcing(sourcingRaw);

      // Hires: keep as-is; allow empty
      state.hiredRows = hiredRaw;

      state.roleTargetsRows = normalizeRoleTargets(targetsRaw);
      state.roleNotesRows = normalizeRoleNotes(notesRaw);

      syncSelectors();
      renderAll();

      const last = $("lastUpdated");
      if (last) last.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      console.error(e);
      // Banner is already updated per-source. We keep UI responsive.
    }
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (storedView === "management") state.view = "management";

  setView(state.view);

  $("viewContributor")?.addEventListener("click", () => setView("contributor"));
  $("viewManagement")?.addEventListener("click", () => {
    // switching to management: enforce gate; if locked, stay in management view but show gate
    setView("management");
  });

  $("unlockManagementBtn")?.addEventListener("click", () => {
    if (unlockManagement()) {
      renderManagement();
    }
  });

  $("refreshBtn")?.addEventListener("click", refreshAll);

  $("pipelineWeekSelect")?.addEventListener("change", () => {
    state.pipelineWeekKey = $("pipelineWeekSelect").value;
    renderPipeline();
  });

  $("activityWeekSelect")?.addEventListener("change", () => {
    state.activityWeekKey = $("activityWeekSelect").value;
    renderActivity();
  });

  $("sourcingWeekSelect")?.addEventListener("change", () => {
    state.sourcingWeekKey = $("sourcingWeekSelect").value;
    renderSourcing();
  });

  $("managementWeekSelect")?.addEventListener("change", () => {
    state.managementWeekKey = $("managementWeekSelect").value;
    renderManagement();
  });

  $("managementRoleSelect")?.addEventListener("change", () => {
    state.managementRole = $("managementRoleSelect").value;
    renderManagement();
  });

  $("managementRecruiterSelect")?.addEventListener("change", () => {
    state.managementRecruiter = $("managementRecruiterSelect").value;
    renderManagement();
  });

  // Respect hires gate if already unlocked
  const hiresUnlocked = sessionStorage.getItem(HIRES_UNLOCK_KEY) === "1";
  show($("hiresGate"), !hiresUnlocked);
  show($("hiresContent"), hiresUnlocked);

  // Respect mgmt gate if already unlocked
  enforceManagementGate();

  refreshAll();
  setInterval(refreshAll, 60000);
});
