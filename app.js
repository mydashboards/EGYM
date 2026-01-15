document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipelineWeekly: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    pipelineInventory: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=0&single=true&output=csv",
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
  const VIEW_STORAGE_KEY = "dashboard_view";

  /* ---------------- STATE ---------------- */

  const state = {
    view: "contributor",

    overviewRows: [],
    pipelineWeeklyRows: [],
    pipelineInventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    roleTargetsRows: [],
    roleNotesRows: [],

    pipelineWeekId: "",
    sourcingWeekId: "",
    managementWeekId: "",

    managementRole: "all",
    managementRecruiter: "all",

    hiresUnlocked: false
  };

  const charts = {
    pipelineHealth: null,
    sourceMix: null
  };

  /* ---------------- HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);

  const dataErrors = new Map();
  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    renderDataErrors();
  }
  function renderDataErrors() {
    const el = $("dataErrors");
    if (!el) return;
    if (dataErrors.size === 0) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML = Array.from(dataErrors.values()).map(m => `<div>${escapeHtml(m)}</div>`).join("");
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeHeader(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "0");
    return n.toLocaleString(undefined);
  }

  function formatPercent(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return `${(v * 100).toFixed(0)}%`;
  }

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning" || health === "at_risk") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  function normalizeHealthValue(value) {
    const h = normalizeHeader(value);
    if (!h) return "";
    if (h.includes("critical")) return "critical";
    if (h.includes("warning") || h.includes("atrisk") || h.includes("risk")) return "warning";
    if (h.includes("healthy") || h.includes("good") || h.includes("ok")) return "healthy";
    if (h.includes("new")) return "new";
    return "";
  }

  function getField(row, keys) {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      if (row[nk] !== undefined && row[nk] !== null && String(row[nk]).trim() !== "") return row[nk];
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
    }
    return "";
  }

  /* ---------------- ROBUST CSV PARSER ---------------- */
  // RFC4180-ish parser: supports quoted commas + quoted newlines + escaped quotes ("")
  function parseCSV(text) {
    const cleaned = String(text ?? "").replace(/^\uFEFF/, "");
    const trimmed = cleaned.trim();
    if (!trimmed) return { headers: [], rows: [], isHtml: false };

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("<!doctype") || lower.startsWith("<html")) {
      return { headers: [], rows: [], isHtml: true };
    }

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < cleaned.length; i += 1) {
      const c = cleaned[i];
      const n = cleaned[i + 1];

      if (c === "\"") {
        if (inQuotes && n === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (c === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && n === "\n") i += 1;
        row.push(field);
        field = "";
        if (row.some(v => v !== "")) rows.push(row);
        row = [];
        continue;
      }

      field += c;
    }

    // flush last field/row
    if (field.length || row.length) {
      row.push(field);
      if (row.some(v => v !== "")) rows.push(row);
    }

    if (!rows.length) return { headers: [], rows: [], isHtml: false };

    const headerRow = rows.shift() || [];
    const headers = headerRow.map(h => normalizeHeader(h));

    const mapped = rows.map(line => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (line[idx] ?? "").toString().trim();
      });
      return obj;
    });

    return { headers, rows: mapped, isHtml: false };
  }

  async function loadCSV(key, url, { allowEmpty = false } = {}) {
    const cb = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cb}`;

    let status = 0;
    let text = "";

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      status = res.status;
      text = await res.text();

      if (!res.ok) {
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (HTTP ${status})`);
        throw new Error(`HTTP ${status}`);
      }

      const parsed = parseCSV(text);

      // header-only is valid empty
      if (!parsed.headers.length) {
        if (allowEmpty) {
          setDataError(key, "");
          return [];
        }
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (invalid CSV)`);
        throw new Error("Invalid CSV (no headers)");
      }

      if (parsed.isHtml) {
        if (allowEmpty) {
          setDataError(key, "");
          return [];
        }
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (HTML returned)`);
        throw new Error("HTML returned");
      }

      // valid empty dataset
      if (parsed.rows.length === 0 && allowEmpty) {
        setDataError(key, "");
        return [];
      }

      setDataError(key, "");
      return parsed.rows;
    } catch (err) {
      // For allowEmpty sources, only show error if it's a real network/http failure
      if (allowEmpty && status === 200) {
        setDataError(key, "");
        return [];
      }
      if (!dataErrors.has(key)) {
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      }
      throw err;
    }
  }

  /* ---------------- WEEK HELPERS ---------------- */

  // Supports either {year, kw} or kw only.
  function weekIdFromRow(row) {
    const year = num(getField(row, ["year"]));
    const kw = num(getField(row, ["kw"]));
    if (year && kw) return `${year}-KW${String(kw).padStart(2, "0")}`;
    if (kw) return `KW${String(kw).padStart(2, "0")}`;
    return "";
  }

  function parseWeekId(weekId) {
    const s = String(weekId || "");
    const m = s.match(/^(?:(\d{4})-)?KW(\d{1,2})$/i);
    if (!m) return { year: 0, kw: 0 };
    return { year: num(m[1] || 0), kw: num(m[2] || 0) };
  }

  function latestWeekId(rows) {
    const ids = rows.map(weekIdFromRow).filter(Boolean);
    if (!ids.length) return "";
    ids.sort((a, b) => {
      const A = parseWeekId(a);
      const B = parseWeekId(b);
      if (A.year !== B.year) return B.year - A.year;
      return B.kw - A.kw;
    });
    return ids[0];
  }

  function uniqueWeekIds(rows) {
    const set = new Map();
    rows.forEach(r => {
      const id = weekIdFromRow(r);
      if (!id) return;
      if (!set.has(id)) {
        const p = parseWeekId(id);
        set.set(id, { id, year: p.year, kw: p.kw });
      }
    });
    const arr = Array.from(set.values());
    arr.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.kw - a.kw;
    });
    return arr.map(x => x.id);
  }

  function isRowInWeek(row, weekId) {
    if (!weekId) return false;
    // For role_notes rows: kw only
    const rowId = weekIdFromRow(row);
    if (rowId) return rowId === weekId;

    // If row has only kw but weekId has year, match by kw
    const target = parseWeekId(weekId);
    const rowKw = num(getField(row, ["kw"]));
    return rowKw && rowKw === target.kw;
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizePipelineWeekly(rows) {
    // Expect long format: year, kw, week_start (optional), role, stage, count
    // If wide: treat non-core columns as stages.
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        week_start: getField(r, ["week_start"]),
        role: getField(r, ["role"]),
        stage: normalizeHeader(getField(r, ["stage"])),
        count: num(getField(r, ["count"]))
      }));
    }

    const core = new Set(["year", "kw", "week_start", "role", "recruiter", "health"]);
    const out = [];
    rows.forEach(r => {
      Object.keys(r).forEach(k => {
        if (core.has(k)) return;
        out.push({
          year: num(getField(r, ["year"])),
          kw: num(getField(r, ["kw"])),
          week_start: getField(r, ["week_start"]),
          role: getField(r, ["role"]),
          stage: normalizeHeader(k),
          count: num(r[k])
        });
      });
    });
    return out;
  }

  function normalizePipelineInventory(rows) {
    // Expect long format: year, kw, role, stage, count, stage_order(optional)
    // If wide: use non-core columns as stages (no stage_order)
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        week_start: getField(r, ["week_start"]),
        role: getField(r, ["role"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"]) !== "" ? num(getField(r, ["stage_order"])) : null
      }));
    }

    const core = new Set(["year", "kw", "week_start", "role", "recruiter", "health"]);
    const out = [];
    rows.forEach(r => {
      Object.keys(r).forEach(k => {
        if (core.has(k)) return;
        out.push({
          year: num(getField(r, ["year"])),
          kw: num(getField(r, ["kw"])),
          week_start: getField(r, ["week_start"]),
          role: getField(r, ["role"]),
          stage: k,
          count: num(r[k]),
          stage_order: null
        });
      });
    });
    return out;
  }

  function normalizeOverview(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      status: getField(r, ["status"]),
      location: getField(r, ["location"]),
      openings: getField(r, ["openings"]),
      recruiter: getField(r, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"]),
      health: normalizeHealthValue(getField(r, ["health"]))
    }));
  }

  function normalizeSourcing(rows) {
    return rows.map(r => ({
      year: num(getField(r, ["year"])),
      kw: num(getField(r, ["kw"])),
      role: getField(r, ["role"]),
      recruiter: getField(r, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"]),
      source: getField(r, ["source"]),
      contacted: num(getField(r, ["contacted"])),
      replied: num(getField(r, ["replied"])),
      recruiter_screen: num(getField(r, ["recruiter_screen", "recruiter_screened"]))
    }));
  }

  function normalizeRoleTargets(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      target: num(getField(r, ["target", "weekly_target", "weekly_goal", "weekly_target_total", "goal"]))
    }));
  }

  function normalizeRoleNotes(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      kw: num(getField(r, ["kw"])),
      recruiter: getField(r, ["recruiter"]),
      challenges: getField(r, ["challenges"]),
      highlights: getField(r, ["highlights"]),
      big_wins: getField(r, ["big_wins", "bigwins", "big_wins_"])
    }));
  }

  /* ---------------- UI: TABS + VIEW ---------------- */

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
    const targetId = tabId || "overview";

    tabs.forEach(t => {
      const isActive = t.dataset.tab === targetId;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach(p => p.classList.toggle("active", p.id === targetId));
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;
        if (id === "hires" && !state.hiresUnlocked) {
          // open locked panel (still show lock card)
          activateTab("hires");
          return;
        }
        window.location.hash = id;
        activateTab(id);
      });
    });

    window.addEventListener("hashchange", () => {
      const id = window.location.hash.replace("#", "") || "overview";
      activateTab(id);
    });

    activateTab(window.location.hash.replace("#", "") || "overview");
  }

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const cBtn = $("viewContributor");
    const mBtn = $("viewManagement");
    const cView = $("contributorView");
    const mView = $("managementView");

    const isContributor = view === "contributor";

    cBtn.classList.toggle("active", isContributor);
    mBtn.classList.toggle("active", !isContributor);
    cBtn.setAttribute("aria-selected", String(isContributor));
    mBtn.setAttribute("aria-selected", String(!isContributor));

    cView.classList.toggle("hidden", !isContributor);
    mView.classList.toggle("hidden", isContributor);
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    const counts = { healthy: 0, warning: 0, critical: 0 };
    let openRoles = 0;
    let filledRoles = 0;
    let totalOpenings = 0;

    state.overviewRows.forEach(r => {
      const status = (r.status || "").toLowerCase();
      if (status === "open") openRoles += 1;
      if (status === "filled") filledRoles += 1;
      totalOpenings += num(r.openings);

      const h = r.health || "";
      if (h === "healthy") counts.healthy += 1;
      if (h === "warning") counts.warning += 1;
      if (h === "critical") counts.critical += 1;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.role)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.location)}</td>
        <td>${escapeHtml(r.openings)}</td>
        <td>${escapeHtml(r.recruiter)}</td>
        <td>
          <div class="health-cell">
            ${healthDotHTML(r.health)}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${formatNumber(openRoles)}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${formatNumber(filledRoles)}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${formatNumber(totalOpenings)}</div></div>
      <div class="kpi"><div class="label">Roles with health</div><div class="value">${formatNumber(counts.healthy + counts.warning + counts.critical)}</div></div>
    `;

    $("overviewHealthSummary").innerHTML = `
      <div class="health-badge ${counts.healthy ? "" : "zero"}"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
      <div class="health-badge ${counts.warning ? "" : "zero"}"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
      <div class="health-badge ${counts.critical ? "" : "zero"}"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
    `;
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function getStagesForWeek(inventoryRows, weekId) {
    const map = new Map();
    inventoryRows.forEach(r => {
      if (!isRowInWeek(r, weekId)) return;
      const stage = String(r.stage || "").trim();
      if (!stage) return;
      if (!map.has(stage)) {
        map.set(stage, { label: stage, order: Number.isFinite(r.stage_order) ? r.stage_order : null });
      }
    });

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const ao = a.order;
      const bo = b.order;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return a.label.localeCompare(b.label);
    });
    return arr.map(x => x.label);
  }

  function renderPipeline() {
    const weekId = state.pipelineWeekId;
    const thead = $("pipelineThead");
    const tbody = $("pipelineTbody");

    const stages = getStagesForWeek(state.pipelineInventoryRows, weekId);

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map(s => `<th>${escapeHtml(s)}</th>`).join("")}
        <th>Health</th>
      </tr>
    `;

    // aggregate counts
    const roles = new Set();
    const byRole = new Map();
    state.pipelineInventoryRows.forEach(r => {
      if (!isRowInWeek(r, weekId)) return;
      const role = r.role || "";
      if (!role) return;
      roles.add(role);

      if (!byRole.has(role)) byRole.set(role, new Map());
      const stageMap = byRole.get(role);
      stageMap.set(r.stage, (stageMap.get(r.stage) || 0) + num(r.count));
    });

    const sortedRoles = Array.from(roles).sort((a, b) => a.localeCompare(b));
    tbody.innerHTML = "";

    sortedRoles.forEach(role => {
      const stageMap = byRole.get(role) || new Map();
      const health = (state.overviewRows.find(o => o.role === role)?.health) || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(role)}</td>
        ${stages.map(s => `<td>${formatNumber(stageMap.get(s) || 0)}</td>`).join("")}
        <td><div class="health-cell">${healthDotHTML(health)}</div></td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing() {
    const weekId = state.sourcingWeekId;
    const tbody = $("sourcingTbody");
    tbody.innerHTML = "";

    const filtered = state.sourcingRows.filter(r => isRowInWeek(r, weekId));

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreens = 0;

    filtered.forEach(r => {
      totalContacted += num(r.contacted);
      totalReplied += num(r.replied);
      totalScreens += num(r.recruiter_screen);

      const conv = r.contacted > 0 ? (r.recruiter_screen / r.contacted) : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.role)}</td>
        <td>${escapeHtml(r.recruiter)}</td>
        <td>${formatNumber(r.contacted)}</td>
        <td>${formatNumber(r.replied)}</td>
        <td>${formatNumber(r.recruiter_screen)}</td>
        <td>${formatPercent(conv)}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallConv = totalContacted > 0 ? (totalScreens / totalContacted) : null;

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${formatNumber(totalContacted)}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${formatNumber(totalReplied)}</div></div>
      <div class="kpi"><div class="label">Recruiter Screens</div><div class="value">${formatNumber(totalScreens)}</div><div class="sub">${formatPercent(overallConv)} conversion</div></div>
      <div class="kpi"><div class="label">Week</div><div class="value">${escapeHtml(weekId)}</div></div>
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
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }
  function average(values) {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function renderHires() {
    const tbody = $("hiresTbody");
    const emptyState = $("hiresEmptyState");
    tbody.innerHTML = "";

    if (!state.hiresUnlocked) {
      emptyState.classList.add("hidden");
      return;
    }

    if (!state.hiredRows.length) {
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
    }

    const tthVals = [];
    const ttfVals = [];
    const procVals = [];

    state.hiredRows.forEach(r => {
      const role = getField(r, ["role"]);
      const first = getField(r, ["first_name", "firstname", "first"]);
      const last = getField(r, ["last_name", "lastname", "last"]);
      const source = getField(r, ["source"]);

      const live = parseDate(getField(r, ["live_date", "livedate", "live"]));
      const firstContact = parseDate(getField(r, ["1st_contact", "first_contact", "firstcontact"]));
      const signature = parseDate(getField(r, ["signature_date", "signaturedate", "signature"]));
      const start = parseDate(getField(r, ["start_date", "startdate", "start"]));

      const tth = dayDiff(live, signature);
      const ttf = dayDiff(live, start);
      const proc = dayDiff(firstContact, signature);

      if (tth !== null) tthVals.push(tth);
      if (ttf !== null) ttfVals.push(ttf);
      if (proc !== null) procVals.push(proc);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(role)}</td>
        <td>${escapeHtml(first)}</td>
        <td>${escapeHtml(last)}</td>
        <td>${escapeHtml(source)}</td>
        <td>${escapeHtml(getField(r, ["live_date"]))}</td>
        <td>${escapeHtml(getField(r, ["1st_contact", "first_contact"]))}</td>
        <td>${escapeHtml(getField(r, ["signature_date"]))}</td>
        <td>${escapeHtml(getField(r, ["start_date"]))}</td>
        <td>${tth !== null ? formatNumber(tth) : "—"}</td>
        <td>${ttf !== null ? formatNumber(ttf) : "—"}</td>
        <td>${proc !== null ? formatNumber(proc) : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthVals);
    const avgTtf = average(ttfVals);

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(state.hiredRows.length)}</div><div class="sub">All time</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Data status</div><div class="value">${state.hiredRows.length ? "Loaded" : "Empty"}</div></div>
    `;
  }

  function setHiresUnlocked(unlocked) {
    state.hiresUnlocked = unlocked;
    $("hiresLocked").classList.toggle("hidden", unlocked);
    $("hiresContent").classList.toggle("hidden", !unlocked);
    renderHires();
  }

  /* ---------------- MANAGEMENT VIEW ---------------- */

  function renderManagement() {
    const weekId = state.managementWeekId;

    // Build filter options from overview + role_notes
    const roles = Array.from(new Set([
      ...state.overviewRows.map(r => r.role),
      ...state.roleNotesRows.map(r => r.role)
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const recruiters = Array.from(new Set([
      ...state.overviewRows.map(r => r.recruiter),
      ...state.roleNotesRows.map(r => r.recruiter)
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

    fillSelectWithAll($("managementRoleSelect"), roles, "All Roles", state.managementRole);
    fillSelectWithAll($("managementRecruiterSelect"), recruiters, "All Recruiters", state.managementRecruiter);

    // Filtered roles set
    const roleFilter = state.managementRole;
    const recruiterFilter = state.managementRecruiter;

    const overviewFiltered = state.overviewRows.filter(r => {
      const okRole = roleFilter === "all" || r.role === roleFilter;
      const okRec = recruiterFilter === "all" || r.recruiter === recruiterFilter;
      return okRole && okRec;
    });

    const invFiltered = state.pipelineInventoryRows.filter(r => isRowInWeek(r, weekId)).filter(r => {
      const okRole = roleFilter === "all" || r.role === roleFilter;
      // inventory rows may not carry recruiter; fallback via overview map
      const rec = state.overviewRows.find(o => o.role === r.role)?.recruiter || "";
      const okRec = recruiterFilter === "all" || rec === recruiterFilter;
      return okRole && okRec;
    });

    const weeklyFiltered = state.pipelineWeeklyRows.filter(r => isRowInWeek(r, weekId)).filter(r => {
      const okRole = roleFilter === "all" || r.role === roleFilter;
      const rec = state.overviewRows.find(o => o.role === r.role)?.recruiter || "";
      const okRec = recruiterFilter === "all" || rec === recruiterFilter;
      return okRole && okRec;
    });

    const sourcingFiltered = state.sourcingRows.filter(r => isRowInWeek(r, weekId)).filter(r => {
      const okRole = roleFilter === "all" || r.role === roleFilter;
      const okRec = recruiterFilter === "all" || r.recruiter === recruiterFilter;
      return okRole && okRec;
    });

    // KPIs
    const openRoles = overviewFiltered.filter(r => (r.status || "").toLowerCase() === "open").length;
    const pipelineCandidates = invFiltered.reduce((s, r) => s + num(r.count), 0);
    const weeklyActivity = weeklyFiltered.reduce((s, r) => s + num(r.count), 0);
    const hiresCount = state.hiredRows.filter(r => {
      const role = getField(r, ["role"]);
      const okRole = roleFilter === "all" || role === roleFilter;
      return okRole;
    }).length;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${formatNumber(openRoles)}</div></div>
      <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${formatNumber(pipelineCandidates)}</div><div class="sub">End-of-week inventory</div></div>
      <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${formatNumber(weeklyActivity)}</div><div class="sub">Selected week</div></div>
      <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${formatNumber(hiresCount)}</div><div class="sub">${state.hiredRows.length ? "All time" : "No hire data yet"}</div></div>
    `;

    // Health summary
    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    overviewFiltered.forEach(r => {
      if (r.health === "healthy") healthCounts.healthy += 1;
      if (r.health === "warning") healthCounts.warning += 1;
      if (r.health === "critical") healthCounts.critical += 1;
    });

    $("managementHealthSummary").innerHTML = `
      <div class="health-badge ${healthCounts.healthy ? "" : "zero"}"><span class="health-dot good"></span><span>${healthCounts.healthy} Healthy</span></div>
      <div class="health-badge ${healthCounts.warning ? "" : "zero"}"><span class="health-dot warn"></span><span>${healthCounts.warning} At risk</span></div>
      <div class="health-badge ${healthCounts.critical ? "" : "zero"}"><span class="health-dot bad"></span><span>${healthCounts.critical} Critical</span></div>
    `;

    renderPipelineHealthChart(healthCounts);
    renderSourceMixChart(sourcingFiltered);
    renderRecruiterUtilization(sourcingFiltered);
    renderRoleInsights(weekId, roleFilter, recruiterFilter);
  }

  function renderPipelineHealthChart(healthCounts) {
    const canvas = $("pipelineHealthChart");
    const empty = $("pipelineHealthEmpty");
    const total = healthCounts.healthy + healthCounts.warning + healthCounts.critical;

    if (!total) {
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      if (charts.pipelineHealth) {
        charts.pipelineHealth.destroy();
        charts.pipelineHealth = null;
      }
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const data = [healthCounts.healthy, healthCounts.warning, healthCounts.critical];
    const labels = ["Healthy", "At risk", "Critical"];

    if (charts.pipelineHealth) {
      charts.pipelineHealth.data.labels = labels;
      charts.pipelineHealth.data.datasets[0].data = data;
      charts.pipelineHealth.update();
      return;
    }

    charts.pipelineHealth = new Chart(canvas, {
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
          legend: { labels: { color: "#e9eef7" } }
        }
      }
    });
  }

  function renderSourceMixChart(sourcingFiltered) {
    const canvas = $("sourceMixChart");
    const empty = $("sourceMixEmpty");

    const map = new Map();
    sourcingFiltered.forEach(r => {
      const src = String(r.source || "").trim();
      if (!src) return;
      map.set(src, (map.get(src) || 0) + num(r.contacted));
    });

    if (!map.size) {
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      if (charts.sourceMix) {
        charts.sourceMix.destroy();
        charts.sourceMix = null;
      }
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const other = rest.reduce((s, [, v]) => s + v, 0);

    const labels = top.map(([k]) => k);
    const data = top.map(([, v]) => v);
    if (other) { labels.push("Other"); data.push(other); }

    if (charts.sourceMix) {
      charts.sourceMix.data.labels = labels;
      charts.sourceMix.data.datasets[0].data = data;
      charts.sourceMix.update();
      return;
    }

    charts.sourceMix = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ["#f97316", "#38bdf8", "#22c55e", "#64748b"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: "#e9eef7" } }
        }
      }
    });
  }

  function renderRecruiterUtilization(sourcingFiltered) {
    const tbody = $("managementUtilizationTbody");
    tbody.innerHTML = "";

    const targetByRole = {};
    state.roleTargetsRows.forEach(r => {
      if (r.role && r.target) targetByRole[r.role] = r.target;
    });

    const byRecruiter = new Map();
    sourcingFiltered.forEach(r => {
      const recruiter = r.recruiter || "Unassigned";
      if (!byRecruiter.has(recruiter)) byRecruiter.set(recruiter, { screens: 0, contacted: 0, roles: new Set() });
      const obj = byRecruiter.get(recruiter);
      obj.screens += num(r.recruiter_screen);
      obj.contacted += num(r.contacted);
      if (r.role) obj.roles.add(r.role);
    });

    const recruiters = Array.from(byRecruiter.keys()).sort((a, b) => a.localeCompare(b));
    if (!recruiters.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">No recruiter utilization data for this week.</td>`;
      tbody.appendChild(tr);
      return;
    }

    recruiters.forEach(recruiter => {
      const r = byRecruiter.get(recruiter);
      const total = r.screens + r.contacted;

      // Sum targets for roles this recruiter touched this week; if none, fallback baseline
      let target = 0;
      r.roles.forEach(role => { target += (targetByRole[role] || 0); });

      let approx = false;
      if (!target) { target = 50; approx = true; }

      const util = target ? Math.min(100, Math.round((total / target) * 100)) : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(recruiter)}</td>
        <td>${formatNumber(r.screens)}</td>
        <td>${formatNumber(r.contacted)}</td>
        <td>
          <div class="util-meta">
            <div class="util-bar"><span style="width:${util ?? 0}%"></span></div>
            <span>${util !== null ? `${util}%` : "—"}${approx ? " (approx)" : ""}</span>
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

  function renderRoleInsights(weekId, roleFilter, recruiterFilter) {
    const container = $("roleInsights");
    container.innerHTML = "";

    const notes = state.roleNotesRows
      .filter(r => {
        // role_notes rows are kw-only; match by kw
        const target = parseWeekId(weekId);
        return r.kw && target.kw && r.kw === target.kw;
      })
      .filter(r => (roleFilter === "all" || r.role === roleFilter))
      .filter(r => (recruiterFilter === "all" || r.recruiter === recruiterFilter))
      .filter(r => r.challenges || r.highlights || r.big_wins);

    if (!notes.length) {
      container.innerHTML = `<div class="placeholder">No role insights shared for this week.</div>`;
      return;
    }

    const severityOrder = { critical: 0, warning: 1, healthy: 2, new: 3, "": 4 };

    // Map role -> health from overview
    const healthByRole = {};
    state.overviewRows.forEach
