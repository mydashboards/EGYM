document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipelineWeekly: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    // IMPORTANT: this MUST point to the pipeline_inventory tab (end-of-week inventory). If your inventory tab gid is not 0, update it.
    pipelineInventory: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=DEINE_GID_HIER&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    roleTargets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv",
    // Your link was pubhtml; for parsing we need CSV output:
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

  const state = {
    view: localStorage.getItem(VIEW_STORAGE_KEY) || "contributor",
    hiresUnlocked: false,

    overview: [],
    weekly: [],
    inventory: [],
    sourcing: [],
    hired: [],
    targets: [],
    notes: [],

    pipelineWeek: "",
    activityWeek: "",
    sourcingWeek: "",
    managementWeek: "",
    managementRole: "all",
    managementRecruiter: "all",

    charts: {
      pipelineHealth: null,
      sourceMix: null
    }
  };

  /* ---------------- HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  function normalizeHeader(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  const num = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    return n.toLocaleString();
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
    if (health === "warning" || health === "at_risk") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  function normalizeHealthValue(value) {
    const n = normalizeHeader(value);
    if (!n) return "";
    if (n.includes("critical")) return "critical";
    if (n.includes("warning") || n.includes("risk") || n.includes("at_risk")) return "warning";
    if (n.includes("healthy") || n.includes("good") || n.includes("ok")) return "healthy";
    if (n.includes("new")) return "new";
    return "";
  }

  const dataErrors = new Map();

  function updateDataErrorBanner() {
    const banner = $("dataErrors");
    if (!banner) return;
    if (dataErrors.size === 0) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }
    banner.classList.remove("hidden");
    banner.innerHTML = Array.from(dataErrors.values())
      .map((message) => `<div>${esc(message)}</div>`)
      .join("");
  }

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    updateDataErrorBanner();
  }

  function getField(row, keys) {
    for (const key of keys) {
      const nk = normalizeHeader(key);
      if (row[nk] !== undefined && row[nk] !== null && String(row[nk]).trim() !== "") return row[nk];
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  }

  /* ---------------- CSV PARSER (robust) ---------------- */

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
        field = "";
        if (current.some((v) => v !== "")) rows.push(current);
        current = [];
        continue;
      }

      field += char;
    }

    if (field.length || current.length) {
      current.push(field);
      if (current.some((v) => v !== "")) rows.push(current);
    }

    if (!rows.length) return { headers: [], rows: [], isHtml: false };

    const headerRow = rows.shift() || [];
    const headers = headerRow.map((h) => normalizeHeader(h));
    const mappedRows = rows.map((line) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(line[i] ?? "").trim();
      });
      return obj;
    });

    return { headers, rows: mappedRows, isHtml: false };
  }

  async function loadCSV(key, url, { allowEmpty = false } = {}) {
    const cb = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cb}`;

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      const text = await res.text();

      if (!res.ok) {
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (HTTP ${res.status})`);
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = parseCSV(text);
      if (parsed.isHtml) {
        // HTML returned usually means the wrong publish format (pubhtml). role_notes earlier was pubhtml.
        if (allowEmpty) return [];
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (HTML returned)`);
        throw new Error("HTML returned");
      }

      if (!parsed.headers.length) {
        if (allowEmpty) return [];
        setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]} (invalid CSV)`);
        throw new Error("Invalid CSV");
      }

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      if (allowEmpty) {
        setDataError(key, "");
        return [];
      }
      if (!dataErrors.has(key)) setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      throw e;
    }
  }

  /* ---------------- WEEK HELPERS ---------------- */

  function weekKeyFromRow(row) {
    const year = num(getField(row, ["year"]));
    const kw = num(getField(row, ["kw"]));
    if (year && kw) return `${year}-KW${String(kw).padStart(2, "0")}`;
    if (kw) return `KW${String(kw).padStart(2, "0")}`;
    return "";
  }

  function parseWeekKey(value) {
    const match = String(value || "").match(/^(?:(\d{4})-)?KW(\d{1,2})$/i);
    if (!match) return { year: 0, kw: 0 };
    return { year: num(match[1] || 0), kw: num(match[2] || 0) };
  }

  function getWeekOptions(rows) {
    const set = new Set(rows.map(weekKeyFromRow).filter(Boolean));
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const A = parseWeekKey(a);
      const B = parseWeekKey(b);
      if (A.year !== B.year) return B.year - A.year;
      return B.kw - A.kw;
    });
    return arr;
  }

  function setWeekSelect(selectId, options, currentValue) {
    const select = $(selectId);
    if (!select) return "";
    const current = currentValue || select.value || "";
    select.innerHTML = "";

    options.forEach((key) => {
      const { kw } = parseWeekKey(key);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `KW ${String(kw).padStart(2, "0")}`;
      select.appendChild(opt);
    });

    const finalValue = current && options.includes(current) ? current : (options[0] || "");
    select.value = finalValue;
    return finalValue;
  }

  function setSelectWithAll(selectId, values, allLabel, currentValue) {
    const select = $(selectId);
    if (!select) return "all";
    const current = currentValue || select.value || "all";
    select.innerHTML = "";

    const all = document.createElement("option");
    all.value = "all";
    all.textContent = allLabel;
    select.appendChild(all);

    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

    const finalValue = current === "all" || values.includes(current) ? current : "all";
    select.value = finalValue;
    return finalValue;
  }

  function isWeekMatchRow(row, selectedWeekKey) {
    const rowKey = weekKeyFromRow(row);
    if (rowKey) return rowKey === selectedWeekKey;
    const sel = parseWeekKey(selectedWeekKey);
    const rowKw = num(getField(row, ["kw"]));
    return sel.kw && rowKw && sel.kw === rowKw;
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizeOverview(rows) {
    return rows.map((r) => ({
      role: getField(r, ["role"]),
      status: getField(r, ["status"]),
      location: getField(r, ["location"]),
      openings: getField(r, ["openings"]),
      recruiter: getField(r, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"]),
      health: normalizeHealthValue(getField(r, ["health"]))
    }));
  }

  function normalizePipelineWeekly(rows) {
    if (!rows.length) return [];
    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map((r) => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        stage: normalizeHeader(getField(r, ["stage"])),
        count: num(getField(r, ["count"]))
      }));
    }

    const core = new Set(["year", "kw", "role", "week_start", "health"]);
    const out = [];
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (core.has(k)) return;
        out.push({
          year: num(getField(r, ["year"])),
          kw: num(getField(r, ["kw"])),
          role: getField(r, ["role"]),
          stage: normalizeHeader(k),
          count: num(r[k])
        });
      });
    });
    return out;
  }

  function normalizePipelineInventory(rows) {
    if (!rows.length) return [];
    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map((r) => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"]) !== "" ? num(getField(r, ["stage_order"])) : null
      }));
    }

    const core = new Set(["year", "kw", "role", "week_start", "health"]);
    const out = [];
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (core.has(k)) return;
        out.push({
          year: num(getField(r, ["year"])),
          kw: num(getField(r, ["kw"])),
          role: getField(r, ["role"]),
          stage: k,
          count: num(r[k]),
          stage_order: null
        });
      });
    });
    return out;
  }

  function normalizeSourcing(rows) {
    return rows.map((r) => ({
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

  function normalizeTargets(rows) {
    return rows.map((r) => ({
      role: getField(r, ["role"]),
      target: num(getField(r, ["target", "weekly_target", "weekly_goal", "goal"]))
    }));
  }

  function normalizeRoleNotes(rows) {
    return rows.map((r) => ({
      role: getField(r, ["role"]),
      kw: num(getField(r, ["kw"])),
      recruiter: getField(r, ["recruiter"]),
      challenges: getField(r, ["challenges"]),
      highlights: getField(r, ["highlights"]),
      big_wins: getField(r, ["big_wins"])
    }));
  }

  /* ---------------- VIEW + TABS ---------------- */

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const isContributor = view === "contributor";

    $("viewContributor").classList.toggle("active", isContributor);
    $("viewManagement").classList.toggle("active", !isContributor);

    $("contributorView").classList.toggle("hidden", !isContributor);
    $("managementView").classList.toggle("hidden", isContributor);
  }

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
    const id = tabId || "overview";

    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });

    panels.forEach((p) => {
      p.classList.toggle("active", p.id === id);
    });

    // If user navigates to hires tab while locked, keep panel visible but show lock card.
    if (id === "hires") updateHiresLockUI();
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;
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

  /* ---------------- CONTRIBUTOR RENDER ---------------- */

  function renderOverview() {
    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    const counts = { healthy: 0, warning: 0, critical: 0 };
    let open = 0;
    let filled = 0;
    let openings = 0;

    state.overview.forEach((r) => {
      const st = (r.status || "").toLowerCase();
      if (st === "open") open += 1;
      if (st === "filled") filled += 1;
      openings += num(r.openings);

      if (r.health === "healthy") counts.healthy += 1;
      if (r.health === "warning") counts.warning += 1;
      if (r.health === "critical") counts.critical += 1;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role)}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.location)}</td>
        <td>${esc(r.openings)}</td>
        <td>${esc(r.recruiter)}</td>
        <td>${healthDotHTML(r.health)}</td>
      `;
      tbody.appendChild(tr);
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${open}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filled}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${formatNumber(openings)}</div></div>
      <div class="kpi"><div class="label">Roles with health</div><div class="value">${counts.healthy + counts.warning + counts.critical}</div></div>
    `;

    $("overviewHealthSummary").innerHTML = `
      <div class="health-badge ${counts.healthy ? "" : "zero"}"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
      <div class="health-badge ${counts.warning ? "" : "zero"}"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
      <div class="health-badge ${counts.critical ? "" : "zero"}"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
    `;
  }

  function getStagesForInventory(rows, selectedWeek) {
    const map = new Map();
    rows.forEach((r) => {
      if (!isWeekMatchRow(r, selectedWeek)) return;
      const label = r.stage || "";
      if (!label) return;
      if (!map.has(label)) map.set(label, { label, order: r.stage_order });
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
    const thead = $("pipelineThead");
    const tbody = $("pipelineTbody");
    const note = $("pipelineNote");
    tbody.innerHTML = "";
    thead.innerHTML = "";

    const week = state.pipelineWeek;
    const weekRows = state.inventory.filter((r) => isWeekMatchRow(r, week));

    if (!weekRows.length) {
      note.textContent = "No inventory rows for this week. If this stays empty, check that pipeline_inventory CSV points to the correct sheet tab (gid).";
      tbody.innerHTML = `<tr><td class="muted" colspan="12">No inventory data available for the selected week.</td></tr>`;
      return;
    }
    note.textContent = "";

    const stages = getStagesForInventory(state.inventory, week);
    const roles = Array.from(new Set(weekRows.map((r) => r.role).filter(Boolean))).sort();

    // counts per role/stage
    const byRole = new Map();
    roles.forEach((role) => byRole.set(role, new Map()));
    weekRows.forEach((r) => {
      if (!r.role) return;
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map((s) => `<th>${esc(s.label)}</th>`).join("")}
        <th>Health</th>
      </tr>
    `;

    roles.forEach((role) => {
      const m = byRole.get(role) || new Map();
      const overviewRow = state.overview.find((o) => o.role === role);
      const health = overviewRow ? overviewRow.health : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map((s) => `<td>${formatNumber(m.get(s.label) || 0)}</td>`).join("")}
        <td>${healthDotHTML(health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderActivity() {
    const thead = $("activityThead");
    const tbody = $("activityTbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    const week = state.activityWeek;
    const weekRows = state.weekly.filter((r) => isWeekMatchRow(r, week));

    const stageSet = new Set(weekRows.map((r) => r.stage).filter(Boolean));
    const preferred = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];
    const stages = [
      ...preferred.filter((s) => stageSet.has(s)),
      ...Array.from(stageSet).filter((s) => !preferred.includes(s)).sort((a, b) => a.localeCompare(b))
    ];

    const roles = Array.from(new Set(weekRows.map((r) => r.role).filter(Boolean))).sort();
    const byRole = new Map();
    roles.forEach((role) => byRole.set(role, new Map()));

    weekRows.forEach((r) => {
      if (!r.role) return;
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map((s) => `<th>${esc(s.replace(/_/g, " "))}</th>`).join("")}
      </tr>
    `;

    if (!roles.length) {
      tbody.innerHTML = `<tr><td class="muted" colspan="${Math.max(1, stages.length + 1)}">No activity data for the selected week.</td></tr>`;
      return;
    }

    roles.forEach((role) => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map((s) => `<td>${formatNumber(m.get(s) || 0)}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  function renderSourcing() {
    const tbody = $("sourcingTbody");
    tbody.innerHTML = "";

    const week = state.sourcingWeek;
    const rows = state.sourcing.filter((r) => isWeekMatchRow(r, week));

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreens = 0;

    rows.forEach((r) => {
      totalContacted += num(r.contacted);
      totalReplied += num(r.replied);
      totalScreens += num(r.recruiter_screen);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role)}</td>
        <td>${esc(r.recruiter)}</td>
        <td>${esc(r.source)}</td>
        <td>${formatNumber(r.contacted)}</td>
        <td>${formatNumber(r.replied)}</td>
        <td>${formatNumber(r.recruiter_screen)}</td>
      `;
      tbody.appendChild(tr);
    });

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total contacted</div><div class="value">${formatNumber(totalContacted)}</div></div>
      <div class="kpi"><div class="label">Total replied</div><div class="value">${formatNumber(totalReplied)}</div></div>
      <div class="kpi"><div class="label">Recruiter screens</div><div class="value">${formatNumber(totalScreens)}</div></div>
      <div class="kpi"><div class="label">Conversion (screens/contacted)</div><div class="value">${totalContacted ? `${Math.round((totalScreens / totalContacted) * 100)}%` : "—"}</div></div>
    `;
  }

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

  function updateHiresLockUI() {
    const locked = $("hiresLocked");
    const unlocked = $("hiresUnlocked");
    if (!locked || !unlocked) return;

    locked.classList.toggle("hidden", state.hiresUnlocked);
    unlocked.classList.toggle("hidden", !state.hiresUnlocked);
  }

  function unlockHiresFlow() {
    const input = window.prompt("Enter password to access Hires & KPIs:");
    if (input !== HIRES_PASSWORD) return;
    state.hiresUnlocked = true;
    updateHiresLockUI();
    renderHires();
  }

  function renderHires() {
    if (!state.hiresUnlocked) return;

    const tbody = $("hiresTbody");
    const note = $("hiresEmptyNote");
    tbody.innerHTML = "";

    const rows = state.hired;

    if (!rows.length) {
      note.textContent = "No hired_data yet (empty source is valid).";
      $("hiresKpis").innerHTML = `
        <div class="kpi"><div class="label">Total hires</div><div class="value">0</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Offer acceptance</div><div class="value">—</div></div>
      `;
      return;
    }

    note.textContent = "";

    const tthValues = [];
    const ttfValues = [];

    rows.forEach((r) => {
      const role = getField(r, ["role"]);
      const firstName = getField(r, ["first_name", "firstname", "first name"]);
      const lastName = getField(r, ["last_name", "lastname", "last name"]);
      const source = getField(r, ["source"]);

      const liveDate = parseDate(getField(r, ["live_date", "live date"]));
      const firstContact = parseDate(getField(r, ["1st_contact", "first_contact", "first contact"]));
      const signatureDate = parseDate(getField(r, ["signature_date", "signature date"]));
      const startDate = parseDate(getField(r, ["start_date", "start date"]));

      const tth = dayDiff(liveDate, signatureDate);
      const ttf = dayDiff(liveDate, startDate);

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        <td>${esc(firstName)}</td>
        <td>${esc(lastName)}</td>
        <td>${esc(source)}</td>
        <td>${esc(getField(r, ["live_date", "live date"]))}</td>
        <td>${esc(getField(r, ["1st_contact", "first_contact", "first contact"]))}</td>
        <td>${esc(getField(r, ["signature_date", "signature date"]))}</td>
        <td>${esc(getField(r, ["start_date", "start date"]))}</td>
        <td>${tth !== null ? formatNumber(tth) : "—"}</td>
        <td>${ttf !== null ? formatNumber(ttf) : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
    const avgTth = avg(tthValues);
    const avgTtf = avg(ttfValues);

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total hires</div><div class="value">${formatNumber(rows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH (days)</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF (days)</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Offer acceptance</div><div class="value">—</div></div>
    `;
  }

  /* ---------------- MANAGEMENT VIEW ---------------- */

  function getRoleOwnerMap() {
    const map = {};
    state.overview.forEach((r) => {
      if (!r.role) return;
      if (r.recruiter) map[r.role] = r.recruiter;
    });
    return map;
  }

  function getRecruiterForRole(role, roleOwnerMap) {
    return roleOwnerMap[role] || "";
  }

  function filterRoleRecruiter(roleOwnerMap, role, recruiter) {
    const roleOk = state.managementRole === "all" || role === state.managementRole;
    if (!roleOk) return false;
    if (state.managementRecruiter === "all") return true;
    return getRecruiterForRole(role, roleOwnerMap) === state.managementRecruiter;
  }

  function splitNotes(value) {
    return String(value || "")
      .split(/\r?\n|\|/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function renderManagementView() {
    const roleOwnerMap = getRoleOwnerMap();

    // Filtered roles from overview based on mgmt filters
    const overviewFiltered = state.overview.filter((r) => filterRoleRecruiter(roleOwnerMap, r.role, r.recruiter));

    const invFiltered = state.inventory
      .filter((r) => isWeekMatchRow(r, state.managementWeek))
      .filter((r) => filterRoleRecruiter(roleOwnerMap, r.role, getRecruiterForRole(r.role, roleOwnerMap)));

    const actFiltered = state.weekly
      .filter((r) => isWeekMatchRow(r, state.managementWeek))
      .filter((r) => filterRoleRecruiter(roleOwnerMap, r.role, getRecruiterForRole(r.role, roleOwnerMap)));

    const sourceFiltered = state.sourcing
      .filter((r) => isWeekMatchRow(r, state.managementWeek))
      .filter((r) => filterRoleRecruiter(roleOwnerMap, r.role, r.recruiter));

    const openRoles = overviewFiltered.filter((r) => (r.status || "").toLowerCase() === "open").length;
    const pipelineCandidates = invFiltered.reduce((s, r) => s + num(r.count), 0);
    const weeklyActivity = actFiltered.reduce((s, r) => s + num(r.count), 0);

    // hires all-time; filter optionally by role + recruiter mapping (approx)
    const hiresAll = state.hired;
    const hiresFiltered = hiresAll.filter((r) => {
      const role = getField(r, ["role"]);
      const roleOk = state.managementRole === "all" || role === state.managementRole;
      if (!roleOk) return false;
      if (state.managementRecruiter === "all") return true;
      return getRecruiterForRole(role, roleOwnerMap) === state.managementRecruiter;
    });

    const hiresCount = hiresFiltered.length;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${formatNumber(openRoles)}</div></div>
      <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${formatNumber(pipelineCandidates)}</div><div class="sub">End-of-week inventory</div></div>
      <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${formatNumber(weeklyActivity)}</div><div class="sub">Selected week</div></div>
      <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${formatNumber(hiresCount)}</div><div class="sub">${state.hired.length ? "All time" : "No hire data yet"}</div></div>
    `;

    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    overviewFiltered.forEach((r) => {
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
    renderSourceMixChart(sourceFiltered);
    renderRecruiterUtilization(roleOwnerMap, sourceFiltered);
    renderRoleInsights(roleOwnerMap);
  }

  function renderPipelineHealthChart(healthCounts) {
    const canvas = $("pipelineHealthChart");
    const empty = $("pipelineHealthEmpty");
    const total = healthCounts.healthy + healthCounts.warning + healthCounts.critical;

    if (!total) {
      if (state.charts.pipelineHealth) {
        state.charts.pipelineHealth.destroy();
        state.charts.pipelineHealth = null;
      }
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const labels = ["Healthy", "At risk", "Critical"];
    const data = [healthCounts.healthy, healthCounts.warning, healthCounts.critical];

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

  function renderSourceMixChart(filteredRows) {
    const canvas = $("sourceMixChart");
    const empty = $("sourceMixEmpty");

    const map = new Map();
    filteredRows.forEach((r) => {
      const src = r.source || "";
      if (!src) return;
      map.set(src, (map.get(src) || 0) + num(r.contacted));
    });

    if (!map.size) {
      if (state.charts.sourceMix) {
        state.charts.sourceMix.destroy();
        state.charts.sourceMix = null;
      }
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3);
    const otherTotal = sorted.slice(3).reduce((s, x) => s + x[1], 0);

    const labels = top.map((x) => x[0]);
    const data = top.map((x) => x[1]);
    if (otherTotal) {
      labels.push("Other");
      data.push(otherTotal);
    }

    const palette = ["#f97316", "#38bdf8", "#22c55e", "#64748b"];

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
          backgroundColor: palette.slice(0, labels.length),
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

  function getRoleTargetsMap() {
    const m = {};
    state.targets.forEach((t) => {
      if (!t.role) return;
      if (t.target) m[t.role] = t.target;
    });
    return m;
  }

  function renderRecruiterUtilization(roleOwnerMap, filteredSourcingRows) {
    const tbody = $("managementUtilizationTable");
    tbody.innerHTML = "";

    const roleTargets = getRoleTargetsMap();

    const agg = {};
    filteredSourcingRows.forEach((r) => {
      const recruiter = r.recruiter || getRecruiterForRole(r.role, roleOwnerMap) || "Unassigned";
      if (!agg[recruiter]) agg[recruiter] = { screens: 0, contacted: 0 };
      agg[recruiter].screens += num(r.recruiter_screen);
      agg[recruiter].contacted += num(r.contacted);
    });

    const recruiters = Object.keys(agg).sort();
    if (!recruiters.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No utilization data for this week.</td></tr>`;
      return;
    }

    recruiters.forEach((recruiter) => {
      // approximate target by summing role targets for roles owned by recruiter (if available)
      let target = 0;
      let approx = false;

      Object.keys(roleOwnerMap).forEach((role) => {
        if (roleOwnerMap[role] !== recruiter) return;
        if (state.managementRole !== "all" && role !== state.managementRole) return;
        if (roleTargets[role]) target += roleTargets[role];
      });

      if (!target) {
        target = 50; // fallback baseline
        approx = true;
      }

      const total = agg[recruiter].screens + agg[recruiter].contacted;
      const util = target ? Math.min(100, Math.round((total / target) * 100)) : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(recruiter)}</td>
        <td>${formatNumber(agg[recruiter].screens)}</td>
        <td>${formatNumber(agg[recruiter].contacted)}</td>
        <td>
          <div class="util-meta">
            <div class="util-bar"><span style="width:${util !== null ? util : 0}%"></span></div>
            <span>${util !== null ? `${util}%` : "—"}${approx ? " (approx)" : ""}</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderRoleInsights(roleOwnerMap) {
    const container = $("roleInsights");
    container.innerHTML = "";

    // role_notes is kw numeric; we match selected week’s KW
    const sel = parseWeekKey(state.managementWeek);
    const selKw = sel.kw;

    const notes = state.notes
      .filter((n) => selKw && n.kw === selKw)
      .filter((n) => {
        const roleOk = state.managementRole === "all" || n.role === state.managementRole;
        if (!roleOk) return false;
        if (state.managementRecruiter === "all") return true;
        const owner = roleOwnerMap[n.role] || n.recruiter || "";
        return owner === state.managementRecruiter;
      })
      .filter((n) => n.challenges || n.highlights || n.big_wins);

    if (!notes.length) {
      container.innerHTML = `<div class="placeholder">No role insights shared for this week.</div>`;
      return;
    }

    const severityOrder = { critical: 0, warning: 1, healthy: 2, new: 3, "": 4 };
    notes.sort((a, b) => {
      const aHealth = normalizeHealthValue((state.overview.find((o) => o.role === a.role) || {}).health) || "";
      const bHealth = normalizeHealthValue((state.overview.find((o) => o.role === b.role) || {}).health) || "";
      return (severityOrder[aHealth] ?? 4) - (severityOrder[bHealth] ?? 4);
    });

    notes.forEach((n) => {
      const overviewRow = state.overview.find((o) => o.role === n.role);
      const health = overviewRow ? overviewRow.health : "";
      const open = health === "critical" || health === "warning";

      const challenges = splitNotes(n.challenges);
      const highlights = splitNotes(n.highlights);
      const wins = splitNotes(n.big_wins);

      const details = document.createElement("details");
      details.className = "insight-card";
      if (open) details.open = true;

      details.innerHTML = `
        <summary>
          <div class="insight-meta">
            <strong>${esc(n.role || "Role")}</strong>
            ${health ? healthDotHTML(health) : ""}
          </div>
          <span class="muted">${esc(n.recruiter || roleOwnerMap[n.role] || "")}</span>
        </summary>
        <div class="insight-body">
          ${challenges.length ? `
            <h4>Challenges</h4>
            <ul>${challenges.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ` : ""}
          ${highlights.length ? `
            <h4>Highlights</h4>
            <ul>${highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ` : ""}
          ${wins.length ? `
            <h4>Big Wins</h4>
            <ul>${wins.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ` : ""}
        </div>
      `;
      container.appendChild(details);
    });
  }

  /* ---------------- SYNC FILTERS ---------------- */

  function syncFilters() {
    // week options
    const pipelineWeeks = getWeekOptions(state.inventory.length ? state.inventory : state.weekly);
    const activityWeeks = getWeekOptions(state.weekly);
    const sourcingWeeks = getWeekOptions(state.sourcing);
    const mgmtWeeks = activityWeeks.length ? activityWeeks : pipelineWeeks;

    state.pipelineWeek = setWeekSelect("pipelineWeekSelect", pipelineWeeks, state.pipelineWeek);
    state.activityWeek = setWeekSelect("activityWeekSelect", activityWeeks, state.activityWeek);
    state.sourcingWeek = setWeekSelect("sourcingWeekSelect", sourcingWeeks, state.sourcingWeek);
    state.managementWeek = setWeekSelect("managementWeekSelect", mgmtWeeks, state.managementWeek);

    // role + recruiter options for mgmt
    const roleOptions = Array.from(new Set([
      ...state.overview.map((r) => r.role),
      ...state.notes.map((n) => n.role)
    ].filter(Boolean))).sort();

    const recruiterOptions = Array.from(new Set([
      ...state.overview.map((r) => r.recruiter),
      ...state.notes.map((n) => n.recruiter)
    ].filter(Boolean))).sort();

    state.managementRole = setSelectWithAll("managementRoleSelect", roleOptions, "All Roles", state.managementRole);
    state.managementRecruiter = setSelectWithAll("managementRecruiterSelect", recruiterOptions, "All Recruiters", state.managementRecruiter);
  }

  function renderAll() {
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires(); // no-op if locked
    renderManagementView();
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    try {
      const roleNotesPromise = CSV.roleNotes ? loadCSV("roleNotes", CSV.roleNotes, { allowEmpty: true }) : Promise.resolve([]);

      const [
        overviewRaw,
        weeklyRaw,
        inventoryRaw,
        sourcingRaw,
        hiredRaw,
        targetsRaw,
        roleNotesRaw
      ] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipelineWeekly", CSV.pipelineWeekly),
        loadCSV("pipelineInventory", CSV.pipelineInventory, { allowEmpty: true }),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired, { allowEmpty: true }), // hired_data can be empty/header-only
        loadCSV("roleTargets", CSV.roleTargets),
        roleNotesPromise
      ]);

      state.overview = normalizeOverview(overviewRaw);
      state.weekly = normalizePipelineWeekly(weeklyRaw);
      state.inventory = normalizePipelineInventory(inventoryRaw);
      state.sourcing = normalizeSourcing(sourcingRaw);
      state.hired = hiredRaw; // keep raw; fields vary
      state.targets = normalizeTargets(targetsRaw);
      state.notes = normalizeRoleNotes(roleNotesRaw);

      syncFilters();
      renderAll();

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      // Data errors are already displayed per source; keep console for debugging
      console.error(e);
    }
  }

  /* ---------------- INIT ---------------- */

  initTabs();
  setView(state.view);

  $("viewContributor").addEventListener("click", () => setView("contributor"));
  $("viewManagement").addEventListener("click", () => setView("management"));

  $("refreshBtn").addEventListener("click", refreshAll);

  $("pipelineWeekSelect").addEventListener("change", () => {
    state.pipelineWeek = $("pipelineWeekSelect").value;
    renderPipeline();
  });
  $("activityWeekSelect").addEventListener("change", () => {
    state.activityWeek = $("activityWeekSelect").value;
    renderActivity();
  });
  $("sourcingWeekSelect").addEventListener("change", () => {
    state.sourcingWeek = $("sourcingWeekSelect").value;
    renderSourcing();
  });

  $("managementWeekSelect").addEventListener("change", () => {
    state.managementWeek = $("managementWeekSelect").value;
    renderManagementView();
  });
  $("managementRoleSelect").addEventListener("change", () => {
    state.managementRole = $("managementRoleSelect").value;
    renderManagementView();
  });
  $("managementRecruiterSelect").addEventListener("change", () => {
    state.managementRecruiter = $("managementRecruiterSelect").value;
    renderManagementView();
  });

  $("unlockHiresBtn").addEventListener("click", unlockHiresFlow);
  $("hiresPromptBtn").addEventListener("click", unlockHiresFlow);

  // keep UI consistent on load
  updateHiresLockUI();

  refreshAll();
});
