document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline_weekly:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    pipeline_inventory:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1802705167&single=true&output=csv",
    sourcing:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipeline_weekly: "pipeline_weekly",
    pipeline_inventory: "pipeline_inventory",
    sourcing: "sourcing_data",
    hired: "hired_data",
    targets: "role_targets"
  };

  const HEALTH_THRESHOLDS = {
    critical: 0.33,
    warning: 0.66
  };

  const HIRES_PASSWORD = "EGYM2026";

  const state = {
    overviewRows: [],
    weeklyRows: [],
    inventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    targets: [],

    pipelineWeekOptions: [],
    activityWeekOptions: [],
    sourcingWeekOptions: [],

    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: ""
  };

  /* ---------------- DOM HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);
  const dataErrors = new Map();

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    updateDataErrorBanner();
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
    banner.innerHTML = Array.from(dataErrors.values())
      .map((m) => `<div>${m}</div>`)
      .join("");
  }

  function setSectionError(id, msg) {
    const el = $(id);
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("hidden");
    el.textContent = msg;
  }

  /* ---------------- CSV PARSING ---------------- */

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function parseCSV(text) {
    const cleaned = (text || "").replace(/^\uFEFF/, "");
    const trimmed = cleaned.trim();
    if (!trimmed) return { headers: [], rows: [], isHtml: false };

    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("<!doctype") ||
      lower.startsWith("<html") ||
      lower.startsWith("<meta") ||
      lower.startsWith("<head") ||
      lower.startsWith("<body")
    ) {
      return { headers: [], rows: [], isHtml: true };
    }

    // Support "sep=," first line
    const lines = cleaned.split(/\r?\n/);
    let startIndex = 0;
    if (lines[0] && lines[0].toLowerCase().startsWith("sep=")) startIndex = 1;
    const content = lines.slice(startIndex).join("\n");

    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
      const ch = content[i];
      const next = content[i + 1];

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
    const headers = headerRow.map((h) => normalizeHeader(h)).filter(Boolean);

    const mapped = rows.map((line) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (line[idx] || "").trim();
      });
      return obj;
    });

    return { headers, rows: mapped, isHtml: false };
  }

  async function loadCSV(key, url) {
    const cacheBuster = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cacheBuster}`;

    let text = "";
    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      text = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const parsed = parseCSV(text);

      if (parsed.isHtml) throw new Error("Invalid CSV (HTML response)");
      if (!parsed.headers.length) throw new Error("Invalid CSV (no headers)");

      // hired_data can be header-only -> valid empty
      const allowEmpty = key === "hired";
      if (!allowEmpty && parsed.rows.length === 0) throw new Error("Invalid CSV (no rows)");

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key] || key}`);
      throw e;
    }
  }

  /* ---------------- FORMATTING ---------------- */

  const num = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const getField = (row, keys) => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      if (row[nk] !== undefined && String(row[nk]).trim() !== "") return row[nk];
      if (row[k] !== undefined && String(row[k]).trim() !== "") return row[k];
    }
    return "";
  };

  function formatNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "");
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

  function formatPercent(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return `${(x * 100).toFixed(0)}%`;
  }

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning" || health === "at_risk")
      return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  function titleCaseStage(label) {
    const raw = String(label || "").replace(/_/g, " ").trim();
    if (!raw) return "";
    return raw
      .split(/\s+/)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  /* ---------------- WEEK HELPERS ---------------- */

  function weekKey(row) {
    const year = num(getField(row, ["year"]));
    const kw = num(getField(row, ["kw"]));
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function getWeekOptions(rows) {
    const m = new Map();
    (rows || []).forEach((r) => {
      const key = weekKey(r);
      if (!key) return;
      if (!m.has(key)) {
        m.set(key, {
          key,
          year: num(r.year),
          kw: num(r.kw)
        });
      }
    });
    return Array.from(m.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.kw - a.kw;
    });
  }

  function getLatestWeekKey(rows) {
    const opts = getWeekOptions(rows);
    return opts.length ? opts[0].key : "";
  }

  function getISOWeekYear(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  }

  function currentWeekKey() {
    const { year, week } = getISOWeekYear(new Date());
    return `${year}-KW${String(week).padStart(2, "0")}`;
  }

  function setSelectOptions(select, options) {
    if (!select) return;
    const cur = select.value;
    select.innerHTML = "";
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = `KW ${o.kw}`;
      select.appendChild(opt);
    });

    if (cur && options.some((o) => o.key === cur)) select.value = cur;
    else if (options.length) select.value = options[0].key;
  }

  function chooseDefaultWeek(options, rows) {
    const want = currentWeekKey();
    if (options.some((o) => o.key === want)) return want;
    return getLatestWeekKey(rows) || (options[0] ? options[0].key : "");
  }

  /* ---------------- TABS ---------------- */

  function activateTab(tabId) {
    const target = tabId || "overview";
    document.querySelectorAll(".tab").forEach((t) => {
      const active = t.dataset.tab === target;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === target);
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    let hiresUnlocked = false;

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (tab === "hires" && !hiresUnlocked) {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) return;
          hiresUnlocked = true;
        }
        window.location.hash = tab;
        activateTab(tab);
      });
    });

    window.addEventListener("hashchange", () => {
      const tab = window.location.hash.replace("#", "") || "overview";
      activateTab(tab);
    });

    activateTab(window.location.hash.replace("#", "") || "overview");
  }

  /* ---------------- HEALTH LOGIC (flow-based) ---------------- */

  function normalizeTargets(rows) {
    return (rows || []).map((t) => {
      const role = (t.role || "").trim();
      return {
        ...t,
        role,
        lookback_weeks: getField(t, ["lookback_weeks", "lookback weeks"]) || t.lookback_weeks || "",
        min_prev_stage_n: getField(t, ["min_prev_stage_n", "min prev stage n"]) || t.min_prev_stage_n || "",

        step1_from_sourced_exp:
          getField(t, ["step1_from_sourced_exp", "screen_to_step1_exp"]) || t.step1_from_sourced_exp || "",
        techlight_from_step1_exp:
          getField(t, ["techlight_from_step1_exp", "step1_to_tech_exp"]) || t.techlight_from_step1_exp || "",
        techiv_from_techlight_exp:
          getField(t, ["techiv_from_techlight_exp", "tech_light_to_tech_iv_exp"]) ||
          t.techiv_from_techlight_exp ||
          "",
        final_from_techiv_exp:
          getField(t, ["final_from_techiv_exp", "tech_to_final_exp", "tech_to_final_ex"]) ||
          t.final_from_techiv_exp ||
          "",
        offer_from_final_exp: getField(t, ["offer_from_final_exp", "final_to_offer_exp"]) || t.offer_from_final_exp || "",
        hired_from_offer_exp: getField(t, ["hired_from_offer_exp", "offer_to_hired_exp"]) || t.hired_from_offer_exp || ""
      };
    });
  }

  function computeHealth(roleWeeklyRows, target, endWeekKey) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const sorted = (roleWeeklyRows || [])
      .filter((r) => weekKey(r))
      .sort((a, b) => {
        if (num(a.year) !== num(b.year)) return num(a.year) - num(b.year);
        return num(a.kw) - num(b.kw);
      });

    const eligible = endWeekKey ? sorted.filter((r) => weekKey(r) <= endWeekKey) : sorted;
    const recent = eligible.slice(-lookback);

    const sums = {};
    ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"].forEach((k) => {
      sums[k] = recent.reduce((s, r) => s + num(r[k]), 0);
    });

    if (sums.sourced < minN) return { health: "new" };

    const checks = [
      { a: "step1", b: "sourced", exp: target.step1_from_sourced_exp },
      { a: "tech_light", b: "step1", exp: target.techlight_from_step1_exp },
      { a: "tech_iv", b: "tech_light", exp: target.techiv_from_techlight_exp },
      { a: "final", b: "tech_iv", exp: target.final_from_techiv_exp },
      { a: "offer", b: "final", exp: target.offer_from_final_exp },
      { a: "hired", b: "offer", exp: target.hired_from_offer_exp }
    ];

    let worstScore = Infinity;

    for (const c of checks) {
      const prev = sums[c.b];
      const expected = num(c.exp);
      if (prev >= minN && expected > 0) {
        const actual = prev > 0 ? sums[c.a] / prev : 0;
        const score = actual / expected;
        if (score < worstScore) worstScore = score;
      }
    }

    if (worstScore === Infinity) return { health: "new" };
    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical" };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning" };
    return { health: "healthy" };
  }

  function buildWeeklyByRole(weeklyRows) {
    const byRole = {};
    (weeklyRows || []).forEach((r) => {
      const role = (r.role || "").trim();
      if (!role) return;
      (byRole[role] ||= []).push(r);
    });
    return byRole;
  }

  /* ---------------- STAGE COLUMNS (dynamic) ---------------- */

  function getStageColumns(rows) {
    const meta = new Set(["role", "year", "kw", "week_start", "health", "bottleneck"]);
    const cols = new Set();
    (rows || []).forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!meta.has(k)) cols.add(k);
      });
    });

    const preferred = ["sourced", "reviewed", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];
    const all = Array.from(cols);

    const ordered = [];
    preferred.forEach((p) => {
      if (all.includes(p)) ordered.push(p);
    });

    all
      .filter((k) => !ordered.includes(k))
      .sort((a, b) => a.localeCompare(b))
      .forEach((k) => ordered.push(k));

    return ordered;
  }

  function setTableHead(theadTr, stageCols, includeHealth = true) {
    if (!theadTr) return;
    const stageTh = stageCols
      .map((c) => `<th>${titleCaseStage(c).toUpperCase()}</th>`)
      .join("");

    theadTr.innerHTML = `
      <th>Role</th>
      ${stageTh}
      ${includeHealth ? "<th>Health</th>" : ""}
    `;
  }

  /* ---------------- RENDER: PIPELINE (Inventory) ---------------- */

  function renderPipelineInventory(selectedWeekKey) {
    const tbody = $("pipelineTable");
    if (!tbody) return;

    const table = tbody.closest("table");
    const headTr = table ? table.querySelector("thead tr") : null;

    const filtered = state.inventoryRows.filter((r) => weekKey(r) === selectedWeekKey);
    const stageCols = getStageColumns(filtered.length ? filtered : state.inventoryRows);
    setTableHead(headTr, stageCols, true);

    tbody.innerHTML = "";

    const weeklyByRole = buildWeeklyByRole(state.weeklyRows);
    const targetByRole = {};
    state.targets.forEach((t) => (targetByRole[t.role] = t));

    const roles = Array.from(new Set(filtered.map((r) => (r.role || "").trim()).filter(Boolean)));

    roles.forEach((role) => {
      const invRow = filtered.find((r) => (r.role || "").trim() === role) || {};
      const target = targetByRole[role];
      const health = target ? computeHealth(weeklyByRole[role] || [], target, selectedWeekKey).health : "new";

      const tds = stageCols.map((c) => `<td>${formatNumber(num(invRow[c]))}</td>`).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${tds}
        <td>${healthDotHTML(health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: ACTIVITY (Weekly) ---------------- */

  function renderActivitySummary(stageCols, filteredRows) {
    const summary = $("activitySummary");
    if (!summary) return;

    // totals across all roles for the selected week
    const totals = {};
    stageCols.forEach((c) => {
      totals[c] = filteredRows.reduce((s, r) => s + num(r[c]), 0);
    });

    summary.innerHTML = stageCols
      .map((c) => {
        const label = titleCaseStage(c).toUpperCase();
        const value = formatNumber(totals[c] || 0);
        return `
          <div class="kpi">
            <div class="label">${label}</div>
            <div class="value">${value}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderActivityWeekly(selectedWeekKey) {
    const tbody = $("activityTable");
    const thead = $("activityHead");
    if (!tbody || !thead) return;

    const headTr = thead.querySelector("tr");
    const filtered = state.weeklyRows.filter((r) => weekKey(r) === selectedWeekKey);

    const stageCols = getStageColumns(filtered.length ? filtered : state.weeklyRows);

    // Activity: NO health column
    setTableHead(headTr, stageCols, false);

    // Summary cards like Sourcing
    renderActivitySummary(stageCols, filtered);

    tbody.innerHTML = "";

    const roles = Array.from(new Set(filtered.map((r) => (r.role || "").trim()).filter(Boolean)));

    roles.forEach((role) => {
      const row = filtered.find((r) => (r.role || "").trim() === role) || {};
      const tds = stageCols.map((c) => `<td>${formatNumber(num(row[c]))}</td>`).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${tds}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(selectedWeekKeyForHealth) {
    const tbody = $("overviewTable");
    const cards = $("overviewCards");
    const healthSummary = $("overviewHealthSummary");
    if (!tbody || !cards || !healthSummary) return;

    const weeklyByRole = buildWeeklyByRole(state.weeklyRows);
    const targetByRole = {};
    state.targets.forEach((t) => (targetByRole[t.role] = t));

    const healthByRole = {};
    Object.keys(weeklyByRole).forEach((role) => {
      if (!targetByRole[role]) return;
      healthByRole[role] = computeHealth(weeklyByRole[role], targetByRole[role], selectedWeekKeyForHealth).health;
    });

    const openRoles = state.overviewRows.filter((r) => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = state.overviewRows.filter((r) => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = state.overviewRows.reduce((s, r) => s + num(r.openings), 0);

    cards.innerHTML = `
      <div class="kpi">
        <div class="label">Open Roles</div>
        <div class="value">${openRoles}</div>
      </div>
      <div class="kpi">
        <div class="label">Filled Roles</div>
        <div class="value">${filledRoles}</div>
      </div>
      <div class="kpi">
        <div class="label">Total Openings</div>
        <div class="value">${totalOpenings}</div>
      </div>
    `;

    const counts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    state.overviewRows.forEach((r) => {
      const h = healthByRole[r.role] || "new";
      counts[h] = (counts[h] || 0) + 1;
    });

    healthSummary.innerHTML = `
      <div class="health-badge ${counts.healthy ? "" : "zero"}">
        <span class="health-dot good"></span>
        <span>${counts.healthy} Healthy roles</span>
      </div>
      <div class="health-badge ${counts.warning ? "" : "zero"}">
        <span class="health-dot warn"></span>
        <span>${counts.warning} At risk roles</span>
      </div>
      <div class="health-badge ${counts.critical ? "" : "zero"}">
        <span class="health-dot bad"></span>
        <span>${counts.critical} Critical roles</span>
      </div>
    `;

    tbody.innerHTML = "";

    state.overviewRows.forEach((r) => {
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap"]);
      const h = healthByRole[r.role] || "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.location || ""}</td>
        <td>${r.openings || ""}</td>
        <td>${owner}</td>
        <td>${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing(selectedWeekKey) {
    const tbody = $("sourcingTable");
    const summary = $("sourcingSummary");
    if (!tbody || !summary) return;

    const filtered = state.sourcingRows.filter((r) => weekKey(r) === selectedWeekKey);
    tbody.innerHTML = "";

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

    filtered.forEach((row) => {
      const contacted = num(row.contacted);
      const replied = num(row.replied);
      const screen = num(row.recruiter_screen || row.recruiter_screened || row.recruiterscreen);

      totalContacted += contacted;
      totalReplied += replied;
      totalScreen += screen;

      const conv = contacted > 0 ? screen / contacted : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.role || ""}</td>
        <td>${formatNumber(contacted)}</td>
        <td>${formatNumber(replied)}</td>
        <td>${formatNumber(screen)}</td>
        <td>${formatPercent(conv)}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallConv = totalContacted > 0 ? totalScreen / totalContacted : null;

    summary.innerHTML = `
      <div class="kpi">
        <div class="label">Total Contacted</div>
        <div class="value">${formatNumber(totalContacted)}</div>
      </div>
      <div class="kpi">
        <div class="label">Total Replied</div>
        <div class="value">${formatNumber(totalReplied)}</div>
      </div>
      <div class="kpi">
        <div class="label">Total Recruiter Screens</div>
        <div class="value">${formatNumber(totalScreen)}</div>
        <div class="sub">${formatPercent(overallConv)} conversion</div>
      </div>
    `;
  }

  /* ---------------- RENDER: HIRES ---------------- */

  function average(values) {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function renderHires() {
    const tbody = $("hiresTable");
    const kpis = $("hiresKpis");
    if (!tbody || !kpis) return;

    tbody.innerHTML = "";

    if (!state.hiredRows.length) {
      kpis.innerHTML = `
        <div class="kpi"><div class="label">Total Hires</div><div class="value">0</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">—</div><div class="sub">No hires yet</div></div>
      `;
      return;
    }

    const tthValues = [];
    const ttfValues = [];
    const dipValues = [];

    state.hiredRows.forEach((row) => {
      const live = new Date(getField(row, ["live_date", "live date"]));
      const sign = new Date(getField(row, ["signature_date", "signature date"]));
      const start = new Date(getField(row, ["start_date", "start date"]));
      const fc = new Date(getField(row, ["1st_contact", "1st contact", "first_contact", "first contact"]));

      const tth =
        Number.isFinite(live.getTime()) && Number.isFinite(sign.getTime())
          ? Math.round((sign - live) / 86400000)
          : null;

      const ttf =
        Number.isFinite(live.getTime()) && Number.isFinite(start.getTime())
          ? Math.round((start - live) / 86400000)
          : null;

      const dip =
        Number.isFinite(fc.getTime()) && Number.isFinite(sign.getTime())
          ? Math.round((sign - fc) / 86400000)
          : null;

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);
      if (dip !== null) dipValues.push(dip);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${getField(row, ["role"])}</td>
        <td>${getField(row, ["first_name", "first name"])}</td>
        <td>${getField(row, ["last_name", "last name"])}</td>
        <td>${getField(row, ["source"])}</td>
        <td>${getField(row, ["salary"])}</td>
        <td>${getField(row, ["live_date", "live date"])}</td>
        <td>${getField(row, ["1st_contact", "1st contact", "first_contact", "first contact"])}</td>
        <td>${getField(row, ["signature_date", "signature date"])}</td>
        <td>${getField(row, ["start_date", "start date"])}</td>
        <td>${tth !== null ? tth : "—"}</td>
        <td>${ttf !== null ? ttf : "—"}</td>
        <td>${dip !== null ? dip : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthValues);
    const avgTtf = average(ttfValues);

    let offerTotal = 0;
    let hiredTotal = 0;
    state.weeklyRows.forEach((r) => {
      offerTotal += num(r.offer);
      hiredTotal += num(r.hired);
    });
    const offerRate = offerTotal > 0 ? hiredTotal / offerTotal : null;

    kpis.innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(state.hiredRows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">${formatPercent(offerRate)}</div><div class="sub">${offerTotal ? `${formatNumber(hiredTotal)} hires / ${formatNumber(offerTotal)} offers` : "Offer data missing"}</div></div>
    `;
  }

  /* ---------------- SYNC & RENDER ---------------- */

  function syncWeekSelects() {
    state.pipelineWeekOptions = getWeekOptions(state.inventoryRows);
    state.activityWeekOptions = getWeekOptions(state.weeklyRows);
    state.sourcingWeekOptions = getWeekOptions(state.sourcingRows);

    const pipelineSel = $("pipelineWeekSelect");
    const activitySel = $("activityWeekSelect");
    const sourcingSel = $("sourcingWeekSelect");

    setSelectOptions(pipelineSel, state.pipelineWeekOptions);
    setSelectOptions(activitySel, state.activityWeekOptions);
    setSelectOptions(sourcingSel, state.sourcingWeekOptions);

    state.selectedPipelineWeek = chooseDefaultWeek(state.pipelineWeekOptions, state.inventoryRows);
    state.selectedActivityWeek = chooseDefaultWeek(state.activityWeekOptions, state.weeklyRows);
    state.selectedSourcingWeek = chooseDefaultWeek(state.sourcingWeekOptions, state.sourcingRows);

    if (pipelineSel && state.selectedPipelineWeek) pipelineSel.value = state.selectedPipelineWeek;
    if (activitySel && state.selectedActivityWeek) activitySel.value = state.selectedActivityWeek;
    if (sourcingSel && state.selectedSourcingWeek) sourcingSel.value = state.selectedSourcingWeek;
  }

  function renderAll() {
    // Overview health uses pipeline-selected week (same as before)
    renderOverview(state.selectedPipelineWeek || getLatestWeekKey(state.weeklyRows) || "");

    if (state.selectedPipelineWeek) renderPipelineInventory(state.selectedPipelineWeek);
    if (state.selectedActivityWeek) renderActivityWeekly(state.selectedActivityWeek);
    if (state.selectedSourcingWeek) renderSourcing(state.selectedSourcingWeek);

    renderHires();
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setSectionError("overviewError", "");
    setSectionError("pipelineError", "");
    setSectionError("activityError", "");
    setSectionError("sourcingError", "");
    setSectionError("hiresError", "");

    try {
      const [overview, weekly, inventory, sourcing, hired, targets] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipeline_weekly", CSV.pipeline_weekly),
        loadCSV("pipeline_inventory", CSV.pipeline_inventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("targets", CSV.targets)
      ]);

      state.overviewRows = overview;
      state.weeklyRows = weekly;
      state.inventoryRows = inventory;
      state.sourcingRows = sourcing;
      state.hiredRows = hired;
      state.targets = normalizeTargets(targets);

      syncWeekSelects();
      renderAll();

      const lastUpdated = $("lastUpdated");
      if (lastUpdated) lastUpdated.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      const msg = `Error: ${e.message}`;
      setSectionError("overviewError", msg);
      setSectionError("pipelineError", msg);
      setSectionError("activityError", msg);
      setSectionError("sourcingError", msg);
      setSectionError("hiresError", msg);
      console.error(e);
    }
  }

  /* ---------------- EVENT HANDLERS ---------------- */

  function onPipelineWeekChange() {
    const sel = $("pipelineWeekSelect");
    if (!sel) return;
    state.selectedPipelineWeek = sel.value;
    renderOverview(state.selectedPipelineWeek);
    renderPipelineInventory(state.selectedPipelineWeek);
  }

  function onActivityWeekChange() {
    const sel = $("activityWeekSelect");
    if (!sel) return;
    state.selectedActivityWeek = sel.value;
    renderActivityWeekly(state.selectedActivityWeek);
  }

  function onSourcingWeekChange() {
    const sel = $("sourcingWeekSelect");
    if (!sel) return;
    state.selectedSourcingWeek = sel.value;
    renderSourcing(state.selectedSourcingWeek);
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const refreshBtn = $("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

  const pipelineSel = $("pipelineWeekSelect");
  if (pipelineSel) pipelineSel.addEventListener("change", onPipelineWeekChange);

  const activitySel = $("activityWeekSelect");
  if (activitySel) activitySel.addEventListener("change", onActivityWeekChange);

  const sourcingSel = $("sourcingWeekSelect");
  if (sourcingSel) sourcingSel.addEventListener("change", onSourcingWeekChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
