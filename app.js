document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG ---------------- */

  // ISO week helper (current calendar week). Uses local time.
  function getCurrentISOWeek() {
    const d = new Date();
    // Thursday in current week decides the year.
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), kw: weekNo };
  }

  const CURRENT_ISO = getCurrentISOWeek();
  // Default selection should start with the current calendar week if present in data.
  const PREFERRED_KW = CURRENT_ISO.kw;
  const PREFERRED_YEAR = CURRENT_ISO.year;

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
  const VIEW_STORAGE_KEY = "dashboard_view";

  const state = {
    view: "contributor",

    overviewRows: [],
    pipelineWeeklyRows: [],   // long-form normalized: {year,kw,role,stage,count}
    pipelineInventoryRows: [],// normalized: {year,kw,role,stage,count,stage_order?}
    pipelineWeeklyStageOrder: [],
    pipelineInventoryStageOrder: [],
    sourcingRows: [],
    hiredRows: [],
    roleTargets: [],
    roleNotesRows: [],

    pipelineOptions: [],
    activityOptions: [],
    sourcingOptions: [],

    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: "",
    selectedActivityRole: "all",
    selectedActivityRecruiter: "all",
    selectedSourcingRole: "all",
    selectedSourcingRecruiter: "all",
    managementCharts: {}
  };

  /* ---------------- HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);
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
    banner.innerHTML = Array.from(dataErrors.values()).map(m => `<div>${m}</div>`).join("");
  }

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    updateDataErrorBanner();
  }

  function normalizeHeader(value) {
    return String(value || "")
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

  function getField(row, keys) {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      if (row[nk] !== undefined && row[nk] !== null && String(row[nk]).trim() !== "") return row[nk];
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
    }
    return "";
  }

  function parseCSV(text) {
    const cleaned = String(text || "").replace(/^\uFEFF/, "");
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

      if (ch === "\"") {
        if (inQuotes && next === "\"") {
          field += "\"";
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
        if (current.some(v => v !== "")) rows.push(current);
        current = [];
        field = "";
        continue;
      }

      field += ch;
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
        obj[h] = (line[idx] || "").trim();
      });
      return obj;
    });

    return { headers, rows: mappedRows, isHtml: false };
  }

  function logLoadFailure({ key, url, status, text, error }) {
    console.log("Data source failed", {
      key,
      url,
      status,
      snippet: (text || "").slice(0, 240),
      error
    });
  }

  async function loadCSV(key, url) {
    const cacheBuster = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cacheBuster}`;

    let status = "unknown";
    let text = "";

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      status = res.status;
      text = await res.text();

      if (!res.ok) {
        logLoadFailure({ key, url: fullUrl, status, text, error: new Error(`HTTP ${res.status}`) });
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = parseCSV(text);
      if (parsed.isHtml) {
        logLoadFailure({ key, url: fullUrl, status, text, error: new Error("HTML returned (not CSV)") });
        throw new Error("Invalid CSV (HTML returned)");
      }

      // hired_data may be header-only (valid empty)
      if (key === "hired") {
        setDataError(key, "");
        return parsed.rows || [];
      }

      if (!parsed.headers.length) {
        logLoadFailure({ key, url: fullUrl, status, text, error: new Error("Empty or invalid CSV") });
        throw new Error("Empty or invalid CSV");
      }

      setDataError(key, "");
      if (key === "pipelineWeekly") {
        return { rows: parsed.rows || [], headers: parsed.headers || [] };
      }
      return parsed.rows;
    } catch (error) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      if (!text || status === "unknown") logLoadFailure({ key, url: fullUrl, status, text, error });
      throw error;
    }
  }

  function weekKey(row) {
    const y = num(getField(row, ["year"]));
    const k = num(getField(row, ["kw"]));
    if (!y || !k) return "";
    return `${y}-KW${String(k).padStart(2, "0")}`;
  }

  function getISOWeeksInYear(year) {
    const date = new Date(Date.UTC(year, 11, 28));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function getPreviousWeekKey(key) {
    const match = String(key || "").match(/^(\d{4})-KW(\d{2})$/i);
    if (!match) return "";
    const year = num(match[1]);
    const week = num(match[2]);
    if (!year || !week) return "";
    if (week > 1) return `${year}-KW${String(week - 1).padStart(2, "0")}`;
    const prevYear = year - 1;
    const weeksInPrevYear = getISOWeeksInYear(prevYear);
    return `${prevYear}-KW${String(weeksInPrevYear).padStart(2, "0")}`;
  }

  function getWeekNumberFromKey(value) {
    if (!value) return null;
    const m = String(value).match(/KW(\d+)/i);
    return m ? num(m[1]) : null;
  }

  function getWeekYearFromKey(value) {
    const match = String(value || "").match(/^(\d{4})-KW(\d{2})$/i);
    if (!match) return null;
    return { year: num(match[1]), kw: num(match[2]) };
  }

  function isWeekMatch(row, selectedWeekKey) {
    if (selectedWeekKey === "all") return true;
    const selectedKw = getWeekNumberFromKey(selectedWeekKey);
    if (!selectedKw) return false;
    const rowYear = num(getField(row, ["year"]));
    const rowKw = num(getField(row, ["kw"]));
    if (rowYear && rowKw) return weekKey(row) === selectedWeekKey;
    return rowKw === selectedKw;
  }

  function getWeekOptions(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = weekKey(r);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { key, year: num(getField(r, ["year"])), kw: num(getField(r, ["kw"])) });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.kw - a.kw;
    });
  }

  function pickPreferredWeekKey(options, preferredKw, preferredYear) {
    if (!options.length) return "";
    const exact = options.filter(o => o.kw === preferredKw && o.year === preferredYear);
    if (exact.length) return exact[0].key;

    const byKw = options.filter(o => o.kw === preferredKw);
    if (byKw.length) {
      byKw.sort((a, b) => b.year - a.year);
      return byKw[0].key;
    }
    return options[0].key; // fallback latest
  }

  function setSelectOptions(select, options, includeAllTime = false) {
    const current = select.value;
    select.innerHTML = "";

    if (includeAllTime) {
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = "All time";
      select.appendChild(opt);
    }

    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = `KW ${String(o.kw).padStart(2, "0")}`;
      select.appendChild(opt);
    });

    const allowed = new Set([...(includeAllTime ? ["all"] : []), ...options.map(o => o.key)]);
    if (current && allowed.has(current)) select.value = current;
    else if (includeAllTime) select.value = "all";
    else if (options.length) select.value = options[0].key;
  }

  function setFilterOptions(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = allLabel;
    select.appendChild(allOpt);

    values.forEach(value => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });

    const allowed = new Set(["all", ...values]);
    if (current && allowed.has(current)) select.value = current;
    else select.value = "all";
  }

  function getOrderedValues(rows, selectedWeekKey, accessor) {
    const ordered = [];
    const seen = new Set();
    rows.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      const value = accessor(r);
      if (!value || seen.has(value)) return;
      seen.add(value);
      ordered.push(value);
    });
    return ordered;
  }

  function formatNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "");
    return n.toLocaleString();
  }

  function formatPercent(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return `${(v * 100).toFixed(0)}%`;
  }

  function normalizeStageValue(value) {
    return normalizeHeader(String(value || ""));
  }

  function getStageOrderFromRows(rows, coreKeys) {
    if (!rows.length) return [];
    const order = [];
    const seen = new Set();
    Object.keys(rows[0] || {}).forEach(k => {
      const nk = normalizeHeader(k);
      if (!nk || coreKeys.has(nk) || seen.has(nk)) return;
      seen.add(nk);
      order.push(nk);
    });
    return order;
  }

  function formatStageLabel(stage) {
    const original = String(stage || "").trim();
    if (!original) return "";
    if (/[A-Z]/.test(original)) return original;
    return original
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  function healthDotHTML(health) {
    if (health === "green") return `<span class="status-dot good" title="Healthy"></span>`;
    if (health === "yellow") return `<span class="status-dot warn" title="At risk"></span>`;
    if (health === "red") return `<span class="status-dot bad" title="Critical"></span>`;
    return `<span class="status-dot neutral" title="New"></span>`;
  }

  function normalizeHealthValue(value) {
    const normalized = normalizeHeader(String(value || ""));
    if (normalized.includes("critical")) return "critical";
    if (normalized.includes("warning") || normalized.includes("risk") || normalized.includes("at_risk")) return "warning";
    if (normalized.includes("healthy") || normalized.includes("good")) return "healthy";
    return "";
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizePipelineWeekly(rows, headers = []) {
    if (!rows.length) {
      state.pipelineWeeklyStageOrder = [];
      return [];
    }
    const looksLong = rows.length && ("stage" in rows[0] || "count" in rows[0]);
    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order"]);
    const long = [];

    if (looksLong) {
      state.pipelineWeeklyStageOrder = [];
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        stage: normalizeStageValue(getField(r, ["stage"])),
        count: num(getField(r, ["count"])),
        stage_order_index: Number.isFinite(num(getField(r, ["stage_order", "stage_order_index"]))) ? num(getField(r, ["stage_order", "stage_order_index"])) : null
      })).filter(r => r.year && r.kw && r.role && r.stage);
    }

    const stageOrder = [];
    const seen = new Set();
    (headers.length ? headers : Object.keys(rows[0] || {})).forEach(k => {
      const nk = normalizeHeader(k);
      if (!nk || coreKeys.has(nk) || seen.has(nk)) return;
      seen.add(nk);
      stageOrder.push(nk);
    });
    state.pipelineWeeklyStageOrder = stageOrder;

    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      const recruiter = getField(r, ["recruiter"]);
      if (!year || !kw || !role) return;

      let pushedAny = false;

      stageOrder.forEach((stageKey, index) => {
        const count = num(r[stageKey]);
        if (!Number.isFinite(count)) return;
        if (count === 0) return;
        pushedAny = true;
        long.push({ year, kw, role, recruiter, stage: stageKey, count, stage_order_index: index });
      });

      // IMPORTANT: keep the role visible for that week even if all counts are 0/blank
      // (so Activity/Pipeline can list all roles that exist in the KW).
      if (!pushedAny) {
        long.push({ year, kw, role, recruiter, stage: "__role__", count: 0, stage_order_index: null });
      }
    });

    return long;
  }

  function normalizePipelineInventory(rows) {
    if (!rows.length) {
      state.pipelineInventoryStageOrder = [];
      return [];
    }

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      state.pipelineInventoryStageOrder = [];
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"])
      })).filter(r => r.year && r.kw && r.role && r.stage);
    }

    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order"]);
    state.pipelineInventoryStageOrder = getStageOrderFromRows(rows, coreKeys);
    const long = [];
    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      const recruiter = getField(r, ["recruiter"]);
      if (!year || !kw || !role) return;

      Object.keys(r).forEach(k => {
        const nk = normalizeHeader(k);
        if (coreKeys.has(nk)) return;
        const count = num(r[k]); // keep zeros so roles/stages remain visible
        long.push({
          year,
          kw,
          role,
          recruiter,
          stage: nk,
          count,
          stage_order: null
        });
      });
    });
    return long;
  }

  function normalizeSourcing(rows) {
    return rows.map(r => ({
      year: num(getField(r, ["year"])),
      kw: num(getField(r, ["kw"])),
      role: getField(r, ["role"]),
      recruiter: getField(r, ["recruiter"]),
      source: getField(r, ["source"]),
      contacted: num(getField(r, ["contacted"])),
      replied: num(getField(r, ["replied"])),
      recruiter_screen: num(getField(r, ["recruiter_screen", "recruiter_screened"]))
    })).filter(r => r.year && r.kw && r.role);
  }

  function normalizeTargets(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      lookback_weeks: num(getField(r, ["lookback_weeks"])),
      min_prev_stage_n: num(getField(r, ["min_prev_stage_n"])),
      step1_from_sourced: num(getField(r, ["step1_from_sourced"])),
      step2_from_step1: num(getField(r, ["step2_from_step1"])),
      step3_from_step2: num(getField(r, ["step3_from_step2"])),
      final_from_step3: num(getField(r, ["final_from_step3"])),
      offer_from_final: num(getField(r, ["offer_from_final"])),
      hired_from_offer: num(getField(r, ["hired_from_offer"]))
    })).filter(r => r.role);
  }

  function normalizeRoleNotes(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      kw: num(getField(r, ["kw"])),
      year: num(getField(r, ["year"])),
      recruiter: getField(r, ["recruiter"]),
      challenges: getField(r, ["challenges"]),
      highlights: getField(r, ["highlights"]),
      big_wins: getField(r, ["big_wins"])
    })).filter(r => r.role && r.kw);
  }

  /* ---------------- HEALTH (RAG) ---------------- */
  // HEALTH MODEL v3 (Step 1 / Step 2 only)

  const HEALTH_TOOLTIP_TEXT = "Health reflects whether we have enough qualified & booked interviews (Step 1) and progression into Step 2. It is not an outcome metric (Final/Offer).";

  function getRollingWeeks(rows, endWeekKey, lookbackWeeks) {
    const weeks = Array.from(new Set(rows.map(r => weekKey(r)).filter(Boolean))).sort();
    const targetKey = endWeekKey && endWeekKey !== "all" ? endWeekKey : weeks[weeks.length - 1];
    const eligible = targetKey ? weeks.filter(w => w <= targetKey) : weeks;
    const lookback = Math.max(1, num(lookbackWeeks) || 2);
    return eligible.slice(-lookback);
  }

  function evaluateHealthStatus(step1Count, step2Count) {
    const step1 = num(step1Count);
    const step2 = num(step2Count);
    if (step1 < 5 || (step1 >= 5 && step2 === 0)) return "red";
    if (step1 >= 10 || (step1 >= 6 && step2 >= 3) || step2 >= 5) return "green";
    return "yellow";
  }

  function computeRoleHealthStep12({ rows, role, endWeekKey, recruiterFilter }) {
    const roleRows = rows.filter(r => r.role === role && !String(r.stage).startsWith("__"));
    const filteredRows = recruiterFilter && recruiterFilter !== "all"
      ? roleRows.filter(r => r.recruiter === recruiterFilter)
      : roleRows;

    const windowWeeks = getRollingWeeks(filteredRows, endWeekKey, 2);
    const stageOrder = state.pipelineWeeklyStageOrder || [];
    const step1Stage = stageOrder[1];
    const step2Stage = stageOrder[2];
    let step1 = 0;
    let step2 = 0;

    filteredRows.forEach(r => {
      const wk = weekKey(r);
      if (!wk || !windowWeeks.includes(wk)) return;
      if (step1Stage && r.stage === step1Stage) step1 += num(r.count);
      if (step2Stage && r.stage === step2Stage) step2 += num(r.count);
    });

    return evaluateHealthStatus(step1, step2);
  }

  function getHealthByRole(weeklyRows, endWeekKey, recruiterFilter = "all") {
    const roles = new Set();
    weeklyRows.forEach(r => {
      if (!r.role) return;
      roles.add(r.role);
    });

    const health = {};
    roles.forEach(role => {
      health[role] = computeRoleHealthStep12({
        rows: weeklyRows,
        role,
        endWeekKey,
        recruiterFilter
      });
    });
    return health;
  }

  function runHealthTests() {
    const cases = [
      { step1: 6, step2: 0, expected: "red" },
      { step1: 5, step2: 0, expected: "red" },
      { step1: 10, step2: 5, expected: "green" },
      { step1: 5, step2: 5, expected: "green" },
      { step1: 6, step2: 3, expected: "green" },
      { step1: 7, step2: 1, expected: "yellow" },
      { step1: 9, step2: 0, expected: "red" },
      { step1: 4, step2: 10, expected: "red" }
    ];
    cases.forEach(({ step1, step2, expected }) => {
      const actual = evaluateHealthStatus(step1, step2);
      console.assert(actual === expected, `Health test failed for (${step1}, ${step2}) => ${actual}, expected ${expected}`);
    });
  }

  /* ---------------- TABS ---------------- */

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
    let hiresUnlocked = false;

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;
        if (id === "hires" && !hiresUnlocked) {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) return;
          hiresUnlocked = true;
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

  runHealthTests();

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const rows = state.overviewRows || [];
    const hiredRows = state.hiredRows || [];
    const overviewCards = $("overviewCards");
    const overviewHealthSummary = $("overviewHealthSummary");
    const tbody = $("overviewTable");
    if (!overviewCards || !overviewHealthSummary || !tbody) return;

    const healthByRole = getHealthByRole(
      state.pipelineWeeklyRows,
      state.selectedPipelineWeek === "all" ? "" : state.selectedPipelineWeek,
      "all"
    );

    const hiresByRole = {};
    if (hiredRows.length) {
      hiredRows.forEach(r => {
        const role = getField(r, ["role"]);
        const signatureDate = getField(r, ["signature_date", "signature date"]);
        const startDate = getField(r, ["start_date", "start date"]);
        if (!role) return;
        if (!signatureDate && !startDate) return;
        hiresByRole[role] = (hiresByRole[role] || 0) + 1;
      });
    }

    const openRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "open").length;
    const filledRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "filled").length;
    const totalOpenings = rows.reduce((s, r) => {
      const role = getField(r, ["role"]);
      const base = num(getField(r, ["openings"]));
      if (!hiredRows.length) return s + base;
      const adjusted = Math.max(0, base - (hiresByRole[role] || 0));
      return s + adjusted;
    }, 0);

    const counts = { green: 0, yellow: 0, red: 0 };
    rows.forEach(r => {
      const role = getField(r, ["role"]);
      const h = healthByRole[role] || "new";
      if (h === "green") counts.green += 1;
      else if (h === "yellow") counts.yellow += 1;
      else if (h === "red") counts.red += 1;
    });

    overviewCards.innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
    `;

    overviewHealthSummary.innerHTML = `
      <div class="health-badge good"><span class="health-dot good"></span><span>${counts.green} Healthy</span></div>
      <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.yellow} At risk</span></div>
      <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.red} Critical</span></div>
    `;
    overviewHealthSummary.setAttribute("title", HEALTH_TOOLTIP_TEXT);
    tbody.innerHTML = "";

    rows.forEach(r => {
      const role = getField(r, ["role"]);
      const status = getField(r, ["status"]);
      const location = getField(r, ["location"]);
      const baseOpenings = num(getField(r, ["openings"]));
      const openings = hiredRows.length
        ? Math.max(0, baseOpenings - (hiresByRole[role] || 0))
        : baseOpenings;
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap", "owner", "recruiter"]);
      const h = healthByRole[role] || "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${status}</td>
        <td>${location}</td>
        <td class="num">${formatNumber(openings)}</td>
        <td>${owner}</td>
        <td class="center">${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline() {
    const rows = state.pipelineInventoryRows || [];
    const stageOrder = state.pipelineInventoryStageOrder || [];
    const roles = getOrderedValues(rows, state.selectedPipelineWeek, r => r.role);
    const healthByRole = getHealthByRole(
      state.pipelineWeeklyRows,
      state.selectedPipelineWeek === "all" ? "" : state.selectedPipelineWeek,
      "all"
    );

    const table = $("pipelineTable");
    const empty = $("pipelineEmpty");
    const headerRow = $("pipelineHeader");
    const tbody = $("pipelineBody");

    if (!table || !headerRow || !tbody || !empty) return;

    headerRow.innerHTML = `
      <th>Role</th>
      <th class="center">Health</th>
      ${stageOrder.map(stage => `<th class="num">${formatStageLabel(stage)}</th>`).join("")}
    `;

    tbody.innerHTML = "";

    if (!roles.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    roles.forEach(role => {
      const row = document.createElement("tr");
      const h = healthByRole[role] || "new";

      const stageCounts = stageOrder.map(stage => {
        const matching = rows.filter(r => r.role === role && r.stage === stage && isWeekMatch(r, state.selectedPipelineWeek));
        return matching.reduce((sum, r) => sum + num(r.count), 0);
      });

      row.innerHTML = `
        <td>${role}</td>
        <td class="center">${healthDotHTML(h)}</td>
        ${stageCounts.map(count => `<td class="num">${formatNumber(count)}</td>`).join("")}
      `;
      tbody.appendChild(row);
    });
  }

  /* ---------------- RENDER: ACTIVITY ---------------- */

  function renderActivity() {
    const rows = state.pipelineWeeklyRows || [];
    const stageOrder = state.pipelineWeeklyStageOrder || [];
    const roles = getOrderedValues(rows, state.selectedActivityWeek, r => r.role);
    const recruiters = getOrderedValues(rows, state.selectedActivityWeek, r => r.recruiter);
    const healthByRole = getHealthByRole(
      rows,
      state.selectedActivityWeek === "all" ? "" : state.selectedActivityWeek,
      state.selectedActivityRecruiter
    );

    const table = $("activityTable");
    const empty = $("activityEmpty");
    const headerRow = $("activityHeader");
    const tbody = $("activityBody");

    if (!table || !headerRow || !tbody || !empty) return;

    headerRow.innerHTML = `
      <th>Role</th>
      <th class="center">Health</th>
      ${stageOrder.map(stage => `<th class="num">${formatStageLabel(stage)}</th>`).join("")}
    `;

    tbody.innerHTML = "";

    const filteredRoles = roles.filter(role => {
      if (state.selectedActivityRole === "all") return true;
      return role === state.selectedActivityRole;
    });

    if (!filteredRoles.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    filteredRoles.forEach(role => {
      const row = document.createElement("tr");
      const h = healthByRole[role] || "new";

      const stageCounts = stageOrder.map(stage => {
        return rows
          .filter(r => r.role === role && r.stage === stage && isWeekMatch(r, state.selectedActivityWeek))
          .filter(r => state.selectedActivityRecruiter === "all" ? true : r.recruiter === state.selectedActivityRecruiter)
          .reduce((sum, r) => sum + num(r.count), 0);
      });

      row.innerHTML = `
        <td>${role}</td>
        <td class="center">${healthDotHTML(h)}</td>
        ${stageCounts.map(count => `<td class="num">${formatNumber(count)}</td>`).join("")}
      `;
      tbody.appendChild(row);
    });

    updateActivityFilters(roles, recruiters);
  }

  function updateActivityFilters(roles = [], recruiters = []) {
    if (!roles.length || !recruiters.length) {
      const rows = state.pipelineWeeklyRows || [];
      roles = getOrderedValues(rows, state.selectedActivityWeek, r => r.role);
      recruiters = getOrderedValues(rows, state.selectedActivityWeek, r => r.recruiter);
    }
    setFilterOptions($("activityRoleSelect"), roles, "All roles");
    setFilterOptions($("activityRecruiterSelect"), recruiters, "All recruiters");
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing() {
    const rows = state.sourcingRows || [];
    const roles = getOrderedValues(rows, state.selectedSourcingWeek, r => r.role);
    const recruiters = getOrderedValues(rows, state.selectedSourcingWeek, r => r.recruiter);
    const tbody = $("sourcingTable");
    const empty = $("sourcingEmpty");
    if (!tbody || !empty) return;

    tbody.innerHTML = "";

    const filtered = rows.filter(r => {
      if (!isWeekMatch(r, state.selectedSourcingWeek)) return false;
      if (state.selectedSourcingRole !== "all" && r.role !== state.selectedSourcingRole) return false;
      if (state.selectedSourcingRecruiter !== "all" && r.recruiter !== state.selectedSourcingRecruiter) return false;
      return true;
    });

    if (!filtered.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    filtered.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role}</td>
        <td>${r.recruiter}</td>
        <td>${r.source}</td>
        <td class="num">${formatNumber(r.contacted)}</td>
        <td class="num">${formatNumber(r.replied)}</td>
        <td class="num">${formatNumber(r.recruiter_screen)}</td>
      `;
      tbody.appendChild(tr);
    });

    updateSourcingFilters(roles, recruiters);
  }

  function updateSourcingFilters(roles = [], recruiters = []) {
    if (!roles.length || !recruiters.length) {
      const rows = state.sourcingRows || [];
      roles = getOrderedValues(rows, state.selectedSourcingWeek, r => r.role);
      recruiters = getOrderedValues(rows, state.selectedSourcingWeek, r => r.recruiter);
    }
    setFilterOptions($("sourcingRoleSelect"), roles, "All roles");
    setFilterOptions($("sourcingRecruiterSelect"), recruiters, "All recruiters");
  }

  /* ---------------- RENDER: MANAGEMENT ---------------- */

  function renderManagement() {
    const overviewRows = state.overviewRows || [];
    const pipelineWeeklyRows = state.pipelineWeeklyRows || [];
    const sourcingRows = state.sourcingRows || [];
    const roleNotesRows = state.roleNotesRows || [];

    const selectedActivityWeek = state.selectedActivityWeek;
    const selectedRole = state.selectedActivityRole;
    const selectedRecruiter = state.selectedActivityRecruiter;
    const selectedSourcingWeek = state.selectedSourcingWeek;
    const selectedSourcingRole = state.selectedSourcingRole;
    const selectedSourcingRecruiter = state.selectedSourcingRecruiter;

    const overviewFiltered = overviewRows.filter(r => isWeekMatch(r, state.selectedPipelineWeek));

    const healthByRole = getHealthByRole(
      pipelineWeeklyRows,
      selectedActivityWeek === "all" ? "" : selectedActivityWeek,
      selectedRecruiter
    );

    const counts = { green: 0, yellow: 0, red: 0 };
    overviewFiltered.forEach(r => {
      const role = getField(r, ["role"]);
      const value = healthByRole[role] || "";
      if (value === "green") counts.green += 1;
      else if (value === "yellow") counts.yellow += 1;
      else if (value === "red") counts.red += 1;
    });

    $("managementHealthSummary").innerHTML = `
      <div class="health-badge good"><span class="health-dot good"></span><span>${counts.green} Healthy</span></div>
      <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.yellow} At risk</span></div>
      <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.red} Critical</span></div>
    `;
    $("managementHealthSummary").setAttribute("title", HEALTH_TOOLTIP_TEXT);

    renderManagementCharts({
      counts,
      sourcingRows,
      selectedSourcingWeek,
      selectedSourcingRole,
      selectedSourcingRecruiter
    });

    renderManagementRecruiters({
      sourcingRows,
      selectedSourcingWeek,
      selectedSourcingRole,
      selectedSourcingRecruiter
    });

    renderManagementRoleInsights({
      roleNotesRows,
      selectedActivityWeek,
      selectedRole,
      selectedRecruiter,
      healthByRole,
      overviewRows: overviewFiltered
    });
  }

  function renderManagementCharts({ counts, sourcingRows, selectedSourcingWeek, selectedSourcingRole, selectedSourcingRecruiter }) {
    const chartsEmpty = $("managementChartsEmpty");
    const pipelineCanvas = $("managementPipelineHealthChart");
    const sourceCanvas = $("managementSourceMixChart");
    if (!pipelineCanvas || !sourceCanvas) return;

    const totalHealth = counts.green + counts.yellow + counts.red;
    const hasHealth = totalHealth > 0;

    const sourceMap = new Map();
    sourcingRows.forEach(r => {
      if (!isWeekMatch(r, selectedSourcingWeek)) return;
      if (selectedSourcingRole !== "all" && r.role !== selectedSourcingRole) return;
      if (selectedSourcingRecruiter !== "all" && r.recruiter !== selectedSourcingRecruiter) return;
      if (!r.source) return;
      sourceMap.set(r.source, (sourceMap.get(r.source) || 0) + num(r.contacted));
    });

    const sortedSources = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);
    const topSources = sortedSources.slice(0, 3);
    const otherTotal = sortedSources.slice(3).reduce((sum, [, value]) => sum + value, 0);

    const sourceLabels = topSources.map(([label]) => label);
    const sourceValues = topSources.map(([, value]) => value);
    if (otherTotal > 0) {
      sourceLabels.push("Other");
      sourceValues.push(otherTotal);
    }

    const hasSource = sourceValues.some(value => value > 0);

    if (!window.Chart || (!hasHealth && !hasSource)) {
      chartsEmpty.classList.remove("hidden");
      pipelineCanvas.style.display = "none";
      sourceCanvas.style.display = "none";
      return;
    }

    chartsEmpty.classList.add("hidden");
    pipelineCanvas.style.display = hasHealth ? "block" : "none";
    sourceCanvas.style.display = hasSource ? "block" : "none";

    if (state.managementCharts.pipeline) {
      state.managementCharts.pipeline.destroy();
    }
    if (state.managementCharts.sourceMix) {
      state.managementCharts.sourceMix.destroy();
    }

    if (hasHealth) {
      state.managementCharts.pipeline = new Chart(pipelineCanvas, {
        type: "doughnut",
        data: {
          labels: ["Healthy", "At risk", "Critical"],
          datasets: [{
            data: [counts.green, counts.yellow, counts.red],
            backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"]
          }]
        },
        options: {
          plugins: { legend: { position: "bottom" } }
        }
      });
    }

    if (hasSource) {
      state.managementCharts.sourceMix = new Chart(sourceCanvas, {
        type: "doughnut",
        data: {
          labels: sourceLabels,
          datasets: [{
            data: sourceValues,
            backgroundColor: ["#38bdf8", "#f97316", "#a78bfa", "#64748b"]
          }]
        },
        options: {
          plugins: { legend: { position: "bottom" } }
        }
      });
    }
  }

  function renderManagementRecruiters({ sourcingRows, selectedSourcingWeek, selectedSourcingRole, selectedSourcingRecruiter }) {
    const tbody = $("managementRecruiterTable");
    const empty = $("managementRecruiterEmpty");
    if (!tbody || !empty) return;

    const useRolling = selectedSourcingWeek !== "all";
    const previousWeekKey = useRolling ? getPreviousWeekKey(selectedSourcingWeek) : "";

    const totalsByRecruiter = new Map();
    sourcingRows.forEach(r => {
      if (useRolling) {
        const inSelected = isWeekMatch(r, selectedSourcingWeek);
        const inPrevious = previousWeekKey ? isWeekMatch(r, previousWeekKey) : false;
        if (!inSelected && !inPrevious) return;
      }
      if (selectedSourcingRole !== "all" && r.role !== selectedSourcingRole) return;
      if (selectedSourcingRecruiter !== "all" && r.recruiter !== selectedSourcingRecruiter) return;
      if (!r.recruiter) return;

      if (!totalsByRecruiter.has(r.recruiter)) {
        totalsByRecruiter.set(r.recruiter, { screens: 0, contacted: 0 });
      }
      const agg = totalsByRecruiter.get(r.recruiter);
      agg.screens += num(r.recruiter_screen);
      agg.contacted += num(r.contacted);
    });

    tbody.innerHTML = "";
    const rows = Array.from(totalsByRecruiter.entries());
    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const utilizationHeader = tbody.closest("table")?.querySelector("thead th:last-child");
    if (utilizationHeader) utilizationHeader.textContent = "Utilization (approx)";

    const target = 50;
    rows.forEach(([recruiter, data]) => {
      const total = data.screens + data.contacted;
      const utilization = Math.min(100, Math.round((total / target) * 100));
      const barWidth = `${Math.max(0, Math.min(100, utilization))}%`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${recruiter}</td>
        <td class="num">${formatNumber(data.screens)}</td>
        <td class="num">${formatNumber(data.contacted)}</td>
        <td class="num">
          <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
            <div style="flex:1;min-width:80px;height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;">
              <div style="height:100%;width:${barWidth};background:rgba(249,115,22,.6);"></div>
            </div>
            <span>${utilization}%</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderManagementRoleInsights({ roleNotesRows, selectedActivityWeek, selectedRole, selectedRecruiter, healthByRole, overviewRows }) {
    const container = $("managementRoleInsights");
    if (!container) return;

    const selectedWeek = getWeekYearFromKey(selectedActivityWeek);
    const hasWeekFilter = selectedActivityWeek !== "all" && selectedWeek;

    const overviewHealth = new Map();
    overviewRows.forEach(r => {
      const role = getField(r, ["role"]);
      if (!role) return;
      const value = healthByRole[role] || "";
      if (value) overviewHealth.set(role, value);
    });

    const grouped = new Map();
    roleNotesRows.forEach(row => {
      if (hasWeekFilter) {
        if (row.year !== selectedWeek.year || row.kw !== selectedWeek.kw) return;
      }
      if (selectedRole !== "all" && row.role !== selectedRole) return;
      if (selectedRecruiter !== "all" && row.recruiter !== selectedRecruiter) return;

      if (!grouped.has(row.role)) grouped.set(row.role, []);
      grouped.get(row.role).push(row);
    });

    const cards = [];
    grouped.forEach((rows, role) => {
      const notes = { challenges: [], highlights: [], big_wins: [] };

      rows.forEach(r => {
        const addNotes = (value, key) => {
          if (!value) return;
          String(value)
            .split(/[\n\r|]+/)
            .map(item => item.trim())
            .filter(Boolean)
            .forEach(item => notes[key].push(item));
        };
        addNotes(r.challenges, "challenges");
        addNotes(r.highlights, "highlights");
        addNotes(r.big_wins, "big_wins");
      });

      if (!notes.challenges.length && !notes.highlights.length && !notes.big_wins.length) return;

      const health = overviewHealth.get(role) || "unknown";
      cards.push({ role, health, notes });
    });

    const order = { red: 0, yellow: 1, green: 2, unknown: 3 };
    cards.sort((a, b) => order[a.health] - order[b.health]);

    if (!cards.length) {
      container.innerHTML = `<div class="placeholder">No role insights for this week.</div>`;
      return;
    }

    container.innerHTML = cards.map(card => {
      const openAttr = card.health === "red" || card.health === "yellow" ? " open" : "";
      const healthLabel = card.health === "yellow" ? "At risk" : (card.health === "red" ? "Critical" : (card.health === "green" ? "Healthy" : "Unknown"));

      const sectionHtml = (title, items) => {
        if (!items.length) return "";
        const list = items.map(item => `<li>${item}</li>`).join("");
        return `<div class="muted2 small" style="margin-top:8px;">${title}</div><ul>${list}</ul>`;
      };

      return `
        <details class="card"${openAttr}>
          <summary class="card-head">
            <h3>${card.role}</h3>
            <p class="muted small">${healthLabel}</p>
          </summary>
          <div style="padding:0 18px 18px;">
            ${sectionHtml("Challenges", card.notes.challenges)}
            ${sectionHtml("Highlights", card.notes.highlights)}
            ${sectionHtml("Big Wins", card.notes.big_wins)}
          </div>
        </details>
      `;
    }).join("");
  }

  /* ---------------- RENDER: HIRES ---------------- */

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(start, end) {
    if (!start || !end) return null;
    const ms = end - start;
    return Number.isFinite(ms) ? Math.round(ms / (1000 * 60 * 60 * 24)) : null;
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function renderHires() {
    const rows = state.hiredRows || [];
    const tbody = $("hiresTable");
    const empty = $("hiresEmpty");

    tbody.innerHTML = "";

    if (!rows.length) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
    }

    const tthValues = [];
    const ttfValues = [];

    rows.forEach(r => {
      const liveDate = parseDate(getField(r, ["live_date", "live date"]));
      const signatureDate = parseDate(getField(r, ["signature_date", "signature date"]));
      const startDate = parseDate(getField(r, ["start_date", "start date"]));
      const firstContact = parseDate(getField(r, ["1st_contact", "first_contact", "1st contact", "first contact"]));

      const tth = dayDiff(liveDate, signatureDate);
      const ttf = dayDiff(liveDate, startDate);
      const daysInProcess = dayDiff(firstContact, signatureDate);

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${getField(r, ["role"])}</td>
        <td>${getField(r, ["first_name", "first name"])}</td>
        <td>${getField(r, ["last_name", "last name"])}</td>
        <td>${getField(r, ["source"])}</td>
        <td>${getField(r, ["salary"])}</td>
        <td>${getField(r, ["live_date", "live date"])}</td>
        <td>${getField(r, ["1st_contact", "first_contact", "1st contact", "first contact"])}</td>
        <td>${getField(r, ["signature_date", "signature date"])}</td>
        <td>${getField(r, ["start_date", "start date"])}</td>
        <td class="num">${tth !== null ? tth : "—"}</td>
        <td class="num">${ttf !== null ? ttf : "—"}</td>
        <td class="num">${daysInProcess !== null ? daysInProcess : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthValues);
    const avgTtf = average(ttfValues);

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(rows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Scope</div><div class="value">All time</div></div>
    `;
  }

  /* ---------------- VIEW SWITCH ---------------- */

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const contributorBtn = $("viewContributor");
    const managementBtn = $("viewManagement");
    const contributorView = $("contributorView");
    const managementView = $("managementView");

    const isContributor = view === "contributor";
    contributorBtn.classList.toggle("active", isContributor);
    managementBtn.classList.toggle("active", !isContributor);
    contributorView.classList.toggle("hidden", !isContributor);
    managementView.classList.toggle("hidden", isContributor);
  }

  /* ---------------- WEEK SELECTIONS ---------------- */

  function syncWeekSelections() {
    state.pipelineOptions = getWeekOptions(state.pipelineInventoryRows.length ? state.pipelineInventoryRows : state.pipelineWeeklyRows);
    state.activityOptions = getWeekOptions(state.pipelineWeeklyRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    setSelectOptions($("pipelineWeekSelect"), state.pipelineOptions, true);
    setSelectOptions($("activityWeekSelect"), state.activityOptions, true);
    setSelectOptions($("sourcingWeekSelect"), state.sourcingOptions, true);

    const pipelineAllowed = ["all", ...state.pipelineOptions.map(o => o.key)];
    const activityAllowed = ["all", ...state.activityOptions.map(o => o.key)];
    const sourcingAllowed = ["all", ...state.sourcingOptions.map(o => o.key)];

    // PIPELINE: default to current ISO week (if present), else latest, else all
    if (!state.selectedPipelineWeek || !pipelineAllowed.includes(state.selectedPipelineWeek)) {
      state.selectedPipelineWeek = pickPreferredWeekKey(state.pipelineOptions, PREFERRED_KW, PREFERRED_YEAR) || (state.pipelineOptions[0]?.key || "all");
    }

    // ACTIVITY: default to current ISO week (if present), else latest, else all
    if (!state.selectedActivityWeek || !activityAllowed.includes(state.selectedActivityWeek)) {
      state.selectedActivityWeek = pickPreferredWeekKey(state.activityOptions, PREFERRED_KW, PREFERRED_YEAR) || (state.activityOptions[0]?.key || "all");
    }

    // SOURCING: default to current ISO week (if present), else latest, else all
    if (!state.selectedSourcingWeek || !sourcingAllowed.includes(state.selectedSourcingWeek)) {
      state.selectedSourcingWeek = pickPreferredWeekKey(state.sourcingOptions, PREFERRED_KW, PREFERRED_YEAR) || (state.sourcingOptions[0]?.key || "all");
    }

    $("pipelineWeekSelect").value = state.selectedPipelineWeek;
    $("activityWeekSelect").value = state.selectedActivityWeek;
    $("sourcingWeekSelect").value = state.selectedSourcingWeek;

    updateActivityFilters();
    updateSourcingFilters();
  }

  function renderAll() {
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires();
    renderManagement();
  }

  /* ---------------- MAIN LOAD ---------------- */

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  async function refreshAll() {
    try {
      const [
        overviewRows,
        pipelineWeeklyRaw,
        pipelineInventoryRaw,
        sourcingRaw,
        hiredRaw,
        targetsRaw,
        roleNotesRaw
      ] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipelineWeekly", CSV.pipelineWeekly),
        loadCSV("pipelineInventory", CSV.pipelineInventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("roleTargets", CSV.roleTargets),
        loadCSV("roleNotes", CSV.roleNotes)
      ]);

      state.overviewRows = overviewRows || [];
      const pipelineWeeklyRows = pipelineWeeklyRaw?.rows || pipelineWeeklyRaw || [];
      const pipelineWeeklyHeaders = pipelineWeeklyRaw?.headers || [];
      state.pipelineWeeklyRows = normalizePipelineWeekly(pipelineWeeklyRows, pipelineWeeklyHeaders);
      state.pipelineInventoryRows = normalizePipelineInventory(pipelineInventoryRaw || []);
      state.sourcingRows = normalizeSourcing(sourcingRaw || []);
      state.hiredRows = hiredRaw || [];
      state.roleTargets = normalizeTargets(targetsRaw || []);
      state.roleNotesRows = normalizeRoleNotes(roleNotesRaw || []);

      syncWeekSelections();
      renderAll();

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- EVENT HANDLERS ---------------- */

  function handlePipelineWeekChange() {
    state.selectedPipelineWeek = $("pipelineWeekSelect").value;
    renderOverview();
    renderPipeline();
  }

  function handleActivityWeekChange() {
    state.selectedActivityWeek = $("activityWeekSelect").value;
    updateActivityFilters();
    renderActivity();
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    updateSourcingFilters();
    renderSourcing();
  }

  function handleActivityRoleChange() {
    state.selectedActivityRole = $("activityRoleSelect").value;
    renderActivity();
  }

  function handleActivityRecruiterChange() {
    state.selectedActivityRecruiter = $("activityRecruiterSelect").value;
    renderActivity();
  }

  function handleSourcingRoleChange() {
    state.selectedSourcingRole = $("sourcingRoleSelect").value;
    renderSourcing();
  }

  function handleSourcingRecruiterChange() {
    state.selectedSourcingRecruiter = $("sourcingRecruiterSelect").value;
    renderSourcing();
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (storedView === "management") state.view = "management";
  setView(state.view);

  $("viewContributor").addEventListener("click", () => setView("contributor"));
  $("viewManagement").addEventListener("click", () => setView("management"));

  $("refreshBtn").addEventListener("click", refreshAll);

  $("pipelineWeekSelect").addEventListener("change", handlePipelineWeekChange);
  $("activityWeekSelect").addEventListener("change", handleActivityWeekChange);
  $("sourcingWeekSelect").addEventListener("change", handleSourcingWeekChange);
  $("activityRoleSelect").addEventListener("change", handleActivityRoleChange);
  $("activityRecruiterSelect").addEventListener("change", handleActivityRecruiterChange);
  $("sourcingRoleSelect").addEventListener("change", handleSourcingRoleChange);
  $("sourcingRecruiterSelect").addEventListener("change", handleSourcingRecruiterChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
