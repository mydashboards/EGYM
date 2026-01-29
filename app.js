// app.js
document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG ---------------- */

  // ISO week helper (current calendar week). Uses Europe/Berlin time.
  function getISOWeekFromDate(date) {
    // Thursday in current week decides the year.
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = utcDate.getUTCDay() || 7; // Mon=1..Sun=7
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return { year: utcDate.getUTCFullYear(), kw: weekNo };
  }

  function getDateInTimeZone(timeZone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function getCurrentISOWeek(timeZone) {
    const date = timeZone ? getDateInTimeZone(timeZone) : new Date();
    return getISOWeekFromDate(date);
  }

  const CURRENT_ISO = getCurrentISOWeek("Europe/Berlin");
  const TODAY_WEEK_KEY = `${CURRENT_ISO.year}-KW${String(CURRENT_ISO.kw).padStart(2, "0")}`;
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
    roleNotes: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1004956410&single=true&output=csv",
    weeklyUpdates: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1004956410&single=true&output=csv"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipelineWeekly: "pipeline_weekly",
    pipelineInventory: "pipeline_inventory",
    sourcing: "sourcing_data",
    hired: "hired_data",
    roleTargets: "role_targets",
    roleNotes: "role_notes",
    weeklyUpdates: "weekly_updates"
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
    weeklyUpdatesRows: [],

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

  function weekKeyFromParts(year, kw) {
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
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

  function getRollingWeekKeys(endWeekKey, weeks = 4) {
    const keys = [];
    let key = endWeekKey;
    for (let i = 0; i < weeks; i += 1) {
      if (!key) break;
      keys.push(key);
      key = getPreviousWeekKey(key);
    }
    return keys;
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
    if (!select) return;
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

  function setSourcingWeekOptions(select, options) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";

    const endKey = getSourcingWindowWeekKeys("all")[0];
    const endKw = getWeekNumberFromKey(endKey);
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = endKw ? `Rolling 4w · ending KW ${String(endKw).padStart(2, "0")}` : "Rolling 4w · ending";
    select.appendChild(allOpt);

    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = `Rolling 4w · ending KW ${String(o.kw).padStart(2, "0")}`;
      select.appendChild(opt);
    });

    const allowed = new Set(["all", ...options.map(o => o.key)]);
    if (current && allowed.has(current)) select.value = current;
    else select.value = "all";
  }

  function setFilterOptions(select, values, allLabel) {
    if (!select) return;
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
    if (health === "healthy") return `<span class="status-dot good" title="Healthy"></span>`;
    if (health === "warning") return `<span class="status-dot warn" title="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" title="Critical"></span>`;
    return `<span class="status-dot neutral" title="New/Unknown"></span>`;
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
    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health"]);
    const long = [];
    const ignoredStages = new Set(["connects", "connect", "connected", "connections"]);
    const isIgnoredStage = (stageValue) => ignoredStages.has(normalizeStageValue(stageValue));

    if (looksLong) {
      state.pipelineWeeklyStageOrder = [];
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        stage: normalizeStageValue(getField(r, ["stage"])),
        count: num(getField(r, ["count"])),
      })).filter(r => r.year && r.kw && r.role && r.stage && !isIgnoredStage(r.stage));
    }

    const stageOrder = [];
    const seen = new Set();
    (headers.length ? headers : Object.keys(rows[0] || {})).forEach(k => {
      const nk = normalizeHeader(k);
      if (!nk || coreKeys.has(nk) || seen.has(nk) || isIgnoredStage(nk)) return;
      seen.add(nk);
      stageOrder.push(nk);
    });
    state.pipelineWeeklyStageOrder = stageOrder;

    rows.forEach(r => {
  const year = num(getField(r, ["year"]));
  const kw = num(getField(r, ["kw"]));
  const role = getField(r, ["role"]);
  if (!year || !kw || !role) return;

  let pushedAny = false;

  state.pipelineInventoryStageOrder.forEach(stageKey => {
    const count = num(r[stageKey]);
    if (!Number.isFinite(count)) return;
    if (count === 0) return;
    if (isIgnoredStage(stageKey)) return;
    pushedAny = true;
    long.push({ year, kw, role, stage: stageKey, count });
  });

  // keep role visible even if all stage values are 0/blank
  if (!pushedAny) {
    long.push({ year, kw, role, stage: "__role__", count: 0 });
  }
});


      // IMPORTANT: keep the role visible for that week even if all counts are 0/blank
      // (so Activity/Pipeline can list all roles that exist in the KW).
      if (!pushedAny) {
        long.push({ year, kw, role, recruiter, stage: "__role__", count: 0 });
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
    const ignoredStages = new Set(["sourced", "contacted", "connect", "connects", "replied"]);
    const isIgnoredStage = (stageValue) => ignoredStages.has(normalizeStageValue(stageValue));

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
      })).filter(r => r.year && r.kw && r.role && r.stage && !isIgnoredStage(r.stage));
    }

    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order"]);
    state.pipelineInventoryStageOrder = getStageOrderFromRows(rows, coreKeys).filter(stage => !isIgnoredStage(stage));
    const long = [];
    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      if (!year || !kw || !role) return;

      state.pipelineInventoryStageOrder.forEach(stageKey => {
        const count = num(r[stageKey]);
        if (!Number.isFinite(count)) return;
        if (count === 0) return;
        if (isIgnoredStage(stageKey)) return;
        long.push({ year, kw, role, stage: stageKey, count });
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
      sourced: num(getField(r, ["sourced"])),
      sourced_screens: num(getField(r, ["sourced_screens"])),
      connect: num(getField(r, ["connect"])),
      connect_screens: num(getField(r, ["connect_screens"]))
    })).filter(r => r.year && r.kw && r.role);
  }

  function normalizeTargets(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      target_tth: num(getField(r, ["target_tth"])),
      target_ttf: num(getField(r, ["target_ttf"]))
    })).filter(r => r.role);
  }

  function normalizeRoleNotes(rows) {
    return rows.map(r => ({
      year: num(getField(r, ["year"])),
      kw: num(getField(r, ["kw"])),
      role: getField(r, ["role"]),
      recruiter: getField(r, ["recruiter"]),
      challenges: getField(r, ["challenges"]),
      highlights: getField(r, ["highlights"])
    })).filter(r => r.role);
  }

  function normalizeWeeklyUpdates(rows) {
    return rows.map(r => ({
      year: num(getField(r, ["year"])),
      kw: num(getField(r, ["kw"])),
      role: getField(r, ["role"]),
      update: getField(r, ["update"])
    })).filter(r => r.year && r.kw && r.role);
  }

  function normalizeHealthStage(value) {
    const normalized = normalizeStageValue(value);
    if (normalized.includes("step1")) return "step1";
    if (normalized.includes("screen")) return "step1";
    return normalized;
  }

  function getHealthByRoleFromInventory(invRows, selectedWeekKey) {
    const map = {};
    invRows.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      const role = getField(r, ["role"]) || r.role;
      if (!role) return;
      const health = normalizeHealthValue(getField(r, ["health"]) || r.health);
      if (health) map[role] = health;
    });
    return map;
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

  function activateTab(id) {
    const panels = document.querySelectorAll("#contributorView .panel");
    panels.forEach(panel => {
      if (panel.id === id) panel.classList.add("active");
      else panel.classList.remove("active");
    });
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(tab => {
      const target = tab.dataset.tab;
      tab.classList.toggle("active", target === id);
    });
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const rows = state.overviewRows || [];
    const hiredRows = state.hiredRows || [];
    const overviewCards = $("overviewCards");
    const overviewHealthSummary = $("overviewHealthSummary");
    const tbody = $("overviewTable");
    const healthByRole = getHealthByRoleFromInventory(
      state.pipelineInventoryRows,
      state.selectedPipelineWeek || TODAY_WEEK_KEY
    );
    const onHoldRoles = rows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      if (!status) return false;
      return status === "on_hold" || status === "onhold" || status.includes("hold");
    }).length;

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

    const counts = { healthy: 0, warning: 0, critical: 0 };
    rows.forEach(r => {
      const role = getField(r, ["role"]);
      const h = healthByRole[role] || "unknown";
      if (h === "healthy") counts.healthy += 1;
      else if (h === "warning") counts.warning += 1;
      else if (h === "critical") counts.critical += 1;
    });

    if (overviewCards) {
      overviewCards.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
        <div class="kpi"><div class="label">On hold</div><div class="value">${onHoldRoles}</div></div>
        <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
        <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
      `;
    }

    if (overviewHealthSummary) {
      overviewHealthSummary.innerHTML = `
        <div class="health-badge good"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
        <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
        <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
      `;
    }

    if (!tbody) return;
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
      const h = healthByRole[role] || "unknown";

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

  function getStagesForInventory(rows, selectedWeekKey, stageOrder) {
    const stageMap = new Map();
    rows.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      const label = String(getField(r, ["stage"]) || r.stage || "").trim();
      if (!label) return;
      if (!stageMap.has(label)) {
        const so = getField(r, ["stage_order"]);
        stageMap.set(label, { label, order: so === "" ? null : num(so) });
      }
    });

    if (Array.isArray(stageOrder) && stageOrder.length) {
      return stageOrder
        .filter(label => stageMap.has(label))
        .map(label => stageMap.get(label));
    }

    return Array.from(stageMap.values()).sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : null;
      const bo = Number.isFinite(b.order) ? b.order : null;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  function renderPipeline() {
    const inv = state.pipelineInventoryRows || [];
    const selectedWeekKey = state.selectedPipelineWeek || "";

    const emptyEl = $("pipelineEmpty");
    const thead = document.querySelector("#pipeline table thead");
    const tbody = $("pipelineTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const stages = getStagesForInventory(inv, selectedWeekKey, state.pipelineInventoryStageOrder);

    const roles = new Set();
    const countsByRole = new Map();

    inv.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      const role = getField(r, ["role"]) || r.role;
      const stage = getField(r, ["stage"]) || r.stage;
      if (!role || !stage) return;
      roles.add(role);

      if (!countsByRole.has(role)) countsByRole.set(role, new Map());
      const sm = countsByRole.get(role);
      sm.set(stage, (sm.get(stage) || 0) + num(getField(r, ["count"]) || r.count));
    });

    if (thead) {
      const stageHeaders = stages.map(s => `<th>${formatStageLabel(s.label)}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
          <th class="center">Health</th>
        </tr>
      `;
    }

    const healthByRole = getHealthByRoleFromInventory(
      inv,
      state.selectedPipelineWeek || TODAY_WEEK_KEY
    );

    const roleList = [];
    const seen = new Set();
    inv.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      const role = getField(r, ["role"]) || r.role;
      if (!role || seen.has(role)) return;
      seen.add(role);
      roleList.push(role);
    });

    if (!roleList.length) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    roleList.forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      const stageCells = stages.map(s => `<td class="num">${formatNumber(sm.get(s.label) || 0)}</td>`).join("");
      const h = healthByRole[role] || "unknown";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageCells}
        <td class="center">${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: ACTIVITY ---------------- */

  function getActivityStages(weeklyRows, stageOrder) {
    if (Array.isArray(stageOrder) && stageOrder.length) return stageOrder;
    const stages = [];
    const seen = new Set();
    weeklyRows.forEach(r => {
      if (!r.stage) return;
      if (String(r.stage).startsWith("__")) return; // ignore placeholder stage
      if (seen.has(r.stage)) return;
      seen.add(r.stage);
      stages.push(r.stage);
    });
    return stages;
  }

  function updateActivityFilters() {
    const selectedWeekKey = state.selectedActivityWeek || "";
    const weekly = state.pipelineWeeklyRows || [];
    const roles = getOrderedValues(weekly, selectedWeekKey, r => r.role);
    const recruiters = getOrderedValues(weekly, selectedWeekKey, r => r.recruiter);

    const roleSelect = $("activityRoleSelect");
    const recruiterSelect = $("activityRecruiterSelect");
    setFilterOptions(roleSelect, roles, "All roles");
    setFilterOptions(recruiterSelect, recruiters, "All recruiters");

    if (roleSelect) state.selectedActivityRole = roleSelect.value;
    if (recruiterSelect) state.selectedActivityRecruiter = recruiterSelect.value;
  }

  function renderActivity() {
    const weekly = state.pipelineWeeklyRows || [];
    const selectedWeekKey = state.selectedActivityWeek || "";
    const selectedRole = state.selectedActivityRole || "all";
    const selectedRecruiter = state.selectedActivityRecruiter || "all";

    const filtered = weekly.filter(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return false;
      if (selectedRole !== "all" && r.role !== selectedRole) return false;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return false;
      return true;
    });

    const stages = getActivityStages(filtered, state.pipelineWeeklyStageOrder);
    const roles = [];
    const seen = new Set();
    const countsByRole = new Map();

    filtered.forEach(r => {
      if (!r.role) return;
      if (!seen.has(r.role)) {
        seen.add(r.role);
        roles.push(r.role);
      }

      if (!r.stage || String(r.stage).startsWith("__")) return;
      if (!countsByRole.has(r.role)) countsByRole.set(r.role, new Map());
      const sm = countsByRole.get(r.role);
      sm.set(r.stage, (sm.get(r.stage) || 0) + num(r.count));
    });

    const thead = document.querySelector("#activity table thead");
    if (thead) {
      const stageHeaders = stages.map(s => `<th>${formatStageLabel(s)}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
        </tr>
      `;
    }

    const tbody = $("activityTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    roles.forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      const stageCells = stages.map(s => `<td class="num">${formatNumber(sm.get(s) || 0)}</td>`).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageCells}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function getSourcingWindowWeekKeys(selectedWeekKey) {
    if (!selectedWeekKey || selectedWeekKey === "all") {
      const options = state.sourcingOptions || [];
      const hasToday = options.some(o => o.key === TODAY_WEEK_KEY);
      const endKey = hasToday ? TODAY_WEEK_KEY : (options[0]?.key || "");
      return endKey ? getRollingWeekKeys(endKey, 4) : [];
    }
    return getRollingWeekKeys(selectedWeekKey, 4);
  }

  function isSourcingWeekInWindow(row, selectedWeekKey) {
    const keys = getSourcingWindowWeekKeys(selectedWeekKey);
    if (!keys.length) return false;
    return keys.includes(weekKey(row));
  }

  function updateSourcingFilters() {
    const selectedWeekKey = state.selectedSourcingWeek || "";
    const rows = state.sourcingRows || [];
    const windowedRows = rows.filter(r => isSourcingWeekInWindow(r, selectedWeekKey));
    const roles = getOrderedValues(windowedRows, "all", r => r.role);
    const recruiters = getOrderedValues(windowedRows, "all", r => r.recruiter);

    const roleSelect = $("sourcingRoleSelect");
    const recruiterSelect = $("sourcingRecruiterSelect");
    setFilterOptions(roleSelect, roles, "All roles");
    setFilterOptions(recruiterSelect, recruiters, "All recruiters");

    if (roleSelect) state.selectedSourcingRole = roleSelect.value;
    if (recruiterSelect) state.selectedSourcingRecruiter = recruiterSelect.value;
  }

  function renderSourcing() {
    const rows = state.sourcingRows || [];
    const selectedWeekKey = state.selectedSourcingWeek || "";
    const selectedRole = state.selectedSourcingRole || "all";
    const selectedRecruiter = state.selectedSourcingRecruiter || "all";
    const windowKeys = getSourcingWindowWeekKeys(selectedWeekKey);
    const endWeekKey = windowKeys[0] || selectedWeekKey;
    const endWeekNumber = getWeekNumberFromKey(endWeekKey);

    const filtered = rows.filter(r => {
      if (!isSourcingWeekInWindow(r, selectedWeekKey)) return false;
      if (selectedRole !== "all" && r.role !== selectedRole) return false;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return false;
      return true;
    });

    const tbody = $("sourcingTable");
    const summary = $("sourcingSummary");
    if (!tbody) return;
    tbody.innerHTML = "";

    const thead = document.querySelector("#sourcing table thead");
    if (thead) {
      const convLabel = "Conv. (4w)";
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          <th class="num">Sourced</th>
          <th class="num">Sourced Screens</th>
          <th class="num">${convLabel}</th>
          <th class="num">Connects</th>
          <th class="num">Connect Screens</th>
          <th class="num">${convLabel}</th>
        </tr>
      `;
    }

    let totalSourced = 0;
    let totalSourcedScreens = 0;
    let totalConnect = 0;
    let totalConnectScreens = 0;

    const byRole = new Map();
    filtered.forEach(r => {
      if (!byRole.has(r.role)) {
        byRole.set(r.role, {
          sourced: 0,
          sourcedScreens: 0,
          connect: 0,
          connectScreens: 0
        });
      }
      const agg = byRole.get(r.role);
      const sourced = num(r.sourced);
      const sourcedScreens = num(r.sourced_screens);
      const connect = num(r.connect);
      const connectScreens = num(r.connect_screens);

      agg.sourced += sourced;
      agg.sourcedScreens += sourcedScreens;
      agg.connect += connect;
      agg.connectScreens += connectScreens;

      totalSourced += sourced;
      totalSourcedScreens += sourcedScreens;
      totalConnect += connect;
      totalConnectScreens += connectScreens;
    });

    const roleOrder = [];
    const seen = new Set();

    filtered.forEach(r => {
      if (!r.role || seen.has(r.role)) return;
      seen.add(r.role);
      roleOrder.push(r.role);
    });

    roleOrder.forEach(role => {
      const agg = byRole.get(role);
      const sourcedConv = agg && agg.sourced > 0 ? agg.sourcedScreens / agg.sourced : null;
      const connectConv = agg && agg.connect > 0 ? agg.connectScreens / agg.connect : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td class="num">${formatNumber(agg?.sourced || 0)}</td>
        <td class="num">${formatNumber(agg?.sourcedScreens || 0)}</td>
        <td class="num">${formatPercent(sourcedConv)}</td>
        <td class="num">${formatNumber(agg?.connect || 0)}</td>
        <td class="num">${formatNumber(agg?.connectScreens || 0)}</td>
        <td class="num">${formatPercent(connectConv)}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallSourcedConv = totalSourced > 0 ? totalSourcedScreens / totalSourced : null;
    const overallConnectConv = totalConnect > 0 ? totalConnectScreens / totalConnect : null;
    const convLabel = "4-week conversion";

    if (summary) {
      summary.innerHTML = `
        <div class="kpi"><div class="label">Total Sourced</div><div class="value">${formatNumber(totalSourced)}</div></div>
        <div class="kpi"><div class="label">Sourced Screens</div><div class="value">${formatNumber(totalSourcedScreens)}</div><div class="sub">${formatPercent(overallSourcedConv)} ${convLabel}</div></div>
        <div class="kpi"><div class="label">Total Connects</div><div class="value">${formatNumber(totalConnect)}</div></div>
        <div class="kpi"><div class="label">Connect Screens</div><div class="value">${formatNumber(totalConnectScreens)}</div><div class="sub">${formatPercent(overallConnectConv)} ${convLabel}</div></div>
        <div class="kpi"><div class="label">Scope</div><div class="value">Rolling 4 weeks · ending KW ${endWeekNumber ? String(endWeekNumber).padStart(2, "0") : ""}</div></div>
      `;
    }
  }

  /* ---------------- RENDER: MANAGEMENT ---------------- */

  function renderManagement() {
    const overviewRows = state.overviewRows || [];
    const hiredRows = state.hiredRows || [];
    const weeklyRows = state.pipelineWeeklyRows || [];
    const inventoryRows = state.pipelineInventoryRows || [];
    const roleNotesRows = state.roleNotesRows || [];
    const weeklyUpdatesRows = state.weeklyUpdatesRows || [];
    const managementKpis = $("managementKpis");
    const managementHealthSummary = $("managementHealthSummary");

    const selectedActivityWeek = state.selectedActivityWeek || "";
    const selectedRole = state.selectedActivityRole || "all";
    const selectedRecruiter = state.selectedActivityRecruiter || "all";

    const healthByRole = getHealthByRoleFromInventory(
      inventoryRows,
      state.selectedPipelineWeek || TODAY_WEEK_KEY
    );

    const openRoles = overviewRows.filter(r => normalizeHeader(getField(r, ["status"])) === "open").length;
    const onHoldRoles = overviewRows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      if (!status) return false;
      return status === "on_hold" || status === "onhold" || status.includes("hold");
    }).length;

    const weeklyActivity = weeklyRows.reduce((sum, r) => {
      if (!isWeekMatch(r, selectedActivityWeek)) return sum;
      if (selectedRole !== "all" && r.role !== selectedRole) return sum;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return sum;
      if (!r.stage || String(r.stage).startsWith("__")) return sum;
      return sum + num(r.count);
    }, 0);

    const rollingWeekKeys = new Set(getRollingWeekKeys(TODAY_WEEK_KEY, 4));
    const step1ScreensRolling = weeklyRows.reduce((sum, r) => {
      if (!rollingWeekKeys.has(weekKey(r))) return sum;
      const stage = normalizeHealthStage(r.stage);
      if (stage !== "step1") return sum;
      return sum + num(r.count);
    }, 0);

    const totalHires = hiredRows.reduce((sum, r) => {
      const role = getField(r, ["role"]);
      const signatureDate = getField(r, ["signature_date", "signature date"]);
      const startDate = getField(r, ["start_date", "start date"]);
      if (!role || (!signatureDate && !startDate)) return sum;
      return sum + 1;
    }, 0);

    if (managementKpis) {
      managementKpis.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${formatNumber(openRoles)}</div></div>
        <div class="kpi"><div class="label">On hold</div><div class="value">${formatNumber(onHoldRoles)}</div></div>
        <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${formatNumber(weeklyActivity)}</div></div>
        <div class="kpi"><div class="label">Step1 Screens</div><div class="value">${formatNumber(step1ScreensRolling)}</div><div class="sub">Rolling 4 weeks</div></div>
        <div class="kpi"><div class="label">Hires</div><div class="value">${formatNumber(totalHires)}</div><div class="sub">All time${hiredRows.length ? "" : " · No hire data yet."}</div></div>
      `;
    }

    const counts = { healthy: 0, warning: 0, critical: 0 };
    overviewRows.forEach(r => {
      const role = getField(r, ["role"]);
      const value = healthByRole[role] || "";
      if (value === "healthy") counts.healthy += 1;
      else if (value === "warning") counts.warning += 1;
      else if (value === "critical") counts.critical += 1;
    });

    if (managementHealthSummary) {
      managementHealthSummary.innerHTML = `
        <div class="health-badge good"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
        <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
        <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
      `;
    }

    renderManagementRecruiters({
      weeklyRows
    });

    renderManagementWeeklyUpdates({
      weeklyUpdatesRows,
      selectedRole
    });
  }

  function renderManagementRecruiters({ weeklyRows }) {
    const tbody = $("managementRecruiterTable");
    const empty = $("managementRecruiterEmpty");
    if (!tbody || !empty) return;

    const windowKeys = new Set(getRollingWeekKeys(TODAY_WEEK_KEY, 4));
    const totalsByRecruiter = new Map();
    const allowedRecruiters = new Set(["Alex", "Sven"]);

    weeklyRows.forEach(r => {
      if (!windowKeys.has(weekKey(r))) return;
      const recruiter = r.recruiter || "Unassigned";
      if (!allowedRecruiters.has(recruiter)) return;
      const stage = normalizeHealthStage(r.stage);
      if (stage !== "step1") return;

      if (!totalsByRecruiter.has(recruiter)) {
        totalsByRecruiter.set(recruiter, { screens: 0 });
      }
      const agg = totalsByRecruiter.get(recruiter);
      agg.screens += num(r.count);
    });

    tbody.innerHTML = "";
    const rows = Array.from(totalsByRecruiter.entries());
    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const utilizationHeader = tbody.closest("table")?.querySelector("thead th:last-child");
    if (utilizationHeader) utilizationHeader.textContent = "Utilization";

    rows.forEach(([recruiter, data]) => {
      const avgScreens = data.screens / 4;
      const utilization = Math.round(Math.max(0, Math.min(100, (avgScreens / 20) * 100)));
      const barWidth = `${Math.max(0, Math.min(100, utilization))}%`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${recruiter}</td>
        <td class="num">${formatNumber(data.screens)}</td>
        <td class="num">
          <div class="utilization">
            <div class="utilization-bar"><span style="width:${barWidth};"></span></div>
            <span>${utilization}%</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderManagementRoleInsights({ roleNotesRows, selectedActivityWeek, selectedRole, selectedRecruiter, healthByRole }) {
    const container = $("managementRoleInsights");
    if (!container) return;

    const selectedWeek = getWeekYearFromKey(selectedActivityWeek);
    const hasWeekFilter = selectedActivityWeek !== "all" && selectedWeek;
    const hasRecruiter = roleNotesRows.some(r => r.recruiter);

    const grouped = new Map();
    roleNotesRows.forEach(row => {
      if (hasWeekFilter) {
        if (row.year !== selectedWeek.year || row.kw !== selectedWeek.kw) return;
      }
      if (selectedRole !== "all" && row.role !== selectedRole) return;
      if (hasRecruiter && selectedRecruiter !== "all" && row.recruiter !== selectedRecruiter) return;

      if (!grouped.has(row.role)) grouped.set(row.role, []);
      grouped.get(row.role).push(row);
    });

    const cards = [];
    grouped.forEach((rows, role) => {
      const notes = { challenges: [], highlights: [] };

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
      });

      if (!notes.challenges.length && !notes.highlights.length) return;

      const health = healthByRole[role] || "unknown";
      cards.push({ role, health, notes });
    });

    const order = { critical: 0, warning: 1, healthy: 2, unknown: 3 };
    cards.sort((a, b) => order[a.health] - order[b.health]);

    if (!cards.length) {
      container.innerHTML = `<div class="placeholder">No role insights for this week.</div>`;
      return;
    }

    container.innerHTML = cards.map(card => {
      const openAttr = card.health === "critical" || card.health === "warning" ? " open" : "";
      const healthLabel = card.health === "warning" ? "At risk" : (card.health === "critical" ? "Critical" : (card.health === "healthy" ? "Healthy" : "Unknown"));

      const sectionHtml = (title, items) => {
        if (!items.length) return "";
        const list = items.map(item => `<li>${item}</li>`).join("");
        return `<div class="muted2 small" style="margin-top:8px;">${title}</div><ul>${list}</ul>`;
      };

      return `
        <details class="card management-details"${openAttr}>
          <summary class="card-head">
            <div>
              <h3>${card.role}</h3>
              <p class="muted small">${healthLabel}</p>
            </div>
          </summary>
          <div style="padding:0 18px 18px;">
            ${sectionHtml("Challenges", card.notes.challenges)}
            ${sectionHtml("Highlights", card.notes.highlights)}
          </div>
        </details>
      `;
    }).join("");
  }

  function renderManagementWeeklyUpdates({ weeklyUpdatesRows, selectedRole }) {
    const container = $("managementWeeklyUpdates");
    const empty = $("managementUpdatesEmpty");
    if (!container || !empty) return;

    const rollingKeys = getRollingWeekKeys(TODAY_WEEK_KEY, 4);
    const keyOrder = new Map(rollingKeys.map((key, idx) => [key, idx]));

    const updatesByRole = new Map();
    weeklyUpdatesRows.forEach(row => {
      if (selectedRole !== "all" && row.role !== selectedRole) return;
      const key = weekKeyFromParts(row.year, row.kw);
      if (!keyOrder.has(key)) return;
      const current = updatesByRole.get(row.role);
      if (!current || keyOrder.get(key) < keyOrder.get(current.key)) {
        updatesByRole.set(row.role, { key, update: row.update, year: row.year, kw: row.kw });
      }
    });

    if (!updatesByRole.size) {
      empty.classList.remove("hidden");
      container.innerHTML = "";
      return;
    }
    empty.classList.add("hidden");

    const rows = Array.from(updatesByRole.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Update</th>
              <th class="num">Week</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(([role, info]) => `
              <tr>
                <td>${role}</td>
                <td>${String(info.update || "").replace(/\r?\n/g, "<br>")}</td>
                <td class="num">KW ${String(info.kw).padStart(2, "0")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
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
    const hiresKpis = $("hiresKpis");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (empty) {
      if (!rows.length) {
        empty.classList.remove("hidden");
      } else {
        empty.classList.add("hidden");
      }
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

    if (hiresKpis) {
      hiresKpis.innerHTML = `
        <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(rows.length)}</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
        <div class="kpi"><div class="label">Scope</div><div class="value">All time</div></div>
      `;
    }
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
    if (contributorBtn) contributorBtn.classList.toggle("active", isContributor);
    if (managementBtn) managementBtn.classList.toggle("active", !isContributor);
    if (contributorView) contributorView.classList.toggle("hidden", !isContributor);
    if (managementView) managementView.classList.toggle("hidden", isContributor);
  }

  /* ---------------- WEEK SELECTIONS ---------------- */

  function syncWeekSelections() {
    state.pipelineOptions = getWeekOptions(state.pipelineInventoryRows.length ? state.pipelineInventoryRows : state.pipelineWeeklyRows);
    state.activityOptions = getWeekOptions(state.pipelineWeeklyRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    const pipelineSelect = $("pipelineWeekSelect");
    const activitySelect = $("activityWeekSelect");
    const sourcingSelect = $("sourcingWeekSelect");
    setSelectOptions(pipelineSelect, state.pipelineOptions, true);
    setSelectOptions(activitySelect, state.activityOptions, true);
    setSourcingWeekOptions(sourcingSelect, state.sourcingOptions);

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

    if (pipelineSelect) pipelineSelect.value = state.selectedPipelineWeek;
    if (activitySelect) activitySelect.value = state.selectedActivityWeek;
    if (sourcingSelect) sourcingSelect.value = state.selectedSourcingWeek;

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

      let weeklyUpdatesRaw = [];
      try {
        weeklyUpdatesRaw = await loadCSV("weeklyUpdates", CSV.weeklyUpdates);
      } catch (error) {
        weeklyUpdatesRaw = [];
      }

      state.overviewRows = overviewRows || [];
      const pipelineWeeklyRows = pipelineWeeklyRaw?.rows || pipelineWeeklyRaw || [];
      const pipelineWeeklyHeaders = pipelineWeeklyRaw?.headers || [];
      state.pipelineWeeklyRows = normalizePipelineWeekly(pipelineWeeklyRows, pipelineWeeklyHeaders);
      state.pipelineInventoryRows = normalizePipelineInventory(pipelineInventoryRaw || []);
      state.sourcingRows = normalizeSourcing(sourcingRaw || []);
      state.hiredRows = hiredRaw || [];
      state.roleTargets = normalizeTargets(targetsRaw || []);
      state.roleNotesRows = normalizeRoleNotes(roleNotesRaw || []);
      state.weeklyUpdatesRows = normalizeWeeklyUpdates(weeklyUpdatesRaw || []);

      syncWeekSelections();
      renderAll();

      const lastUpdated = $("lastUpdated");
      if (lastUpdated) lastUpdated.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- EVENT HANDLERS ---------------- */

  function handlePipelineWeekChange() {
    const pipelineSelect = $("pipelineWeekSelect");
    if (!pipelineSelect) return;
    state.selectedPipelineWeek = pipelineSelect.value;
    renderOverview();
    renderPipeline();
    renderManagement();
  }

  function handleActivityWeekChange() {
    const activitySelect = $("activityWeekSelect");
    if (!activitySelect) return;
    state.selectedActivityWeek = activitySelect.value;
    updateActivityFilters();
    renderActivity();
    renderManagement();
  }

  function handleSourcingWeekChange() {
    const sourcingSelect = $("sourcingWeekSelect");
    if (!sourcingSelect) return;
    state.selectedSourcingWeek = sourcingSelect.value;
    updateSourcingFilters();
    renderSourcing();
  }

  function handleActivityRoleChange() {
    const activityRoleSelect = $("activityRoleSelect");
    if (!activityRoleSelect) return;
    state.selectedActivityRole = activityRoleSelect.value;
    renderActivity();
    renderManagement();
  }

  function handleActivityRecruiterChange() {
    const activityRecruiterSelect = $("activityRecruiterSelect");
    if (!activityRecruiterSelect) return;
    state.selectedActivityRecruiter = activityRecruiterSelect.value;
    renderActivity();
    renderManagement();
  }

  function handleSourcingRoleChange() {
    const sourcingRoleSelect = $("sourcingRoleSelect");
    if (!sourcingRoleSelect) return;
    state.selectedSourcingRole = sourcingRoleSelect.value;
    renderSourcing();
  }

  function handleSourcingRecruiterChange() {
    const sourcingRecruiterSelect = $("sourcingRecruiterSelect");
    if (!sourcingRecruiterSelect) return;
    state.selectedSourcingRecruiter = sourcingRecruiterSelect.value;
    renderSourcing();
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (storedView === "management") state.view = "management";
  setView(state.view);

  const viewContributorBtn = $("viewContributor");
  const viewManagementBtn = $("viewManagement");
  if (viewContributorBtn) viewContributorBtn.addEventListener("click", () => setView("contributor"));
  if (viewManagementBtn) viewManagementBtn.addEventListener("click", () => setView("management"));

  const refreshBtn = $("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

  const pipelineWeekSelect = $("pipelineWeekSelect");
  const activityWeekSelect = $("activityWeekSelect");
  const sourcingWeekSelect = $("sourcingWeekSelect");
  const activityRoleSelect = $("activityRoleSelect");
  const activityRecruiterSelect = $("activityRecruiterSelect");
  const sourcingRoleSelect = $("sourcingRoleSelect");
  const sourcingRecruiterSelect = $("sourcingRecruiterSelect");

  if (pipelineWeekSelect) pipelineWeekSelect.addEventListener("change", handlePipelineWeekChange);
  if (activityWeekSelect) activityWeekSelect.addEventListener("change", handleActivityWeekChange);
  if (sourcingWeekSelect) sourcingWeekSelect.addEventListener("change", handleSourcingWeekChange);
  if (activityRoleSelect) activityRoleSelect.addEventListener("change", handleActivityRoleChange);
  if (activityRecruiterSelect) activityRecruiterSelect.addEventListener("change", handleActivityRecruiterChange);
  if (sourcingRoleSelect) sourcingRoleSelect.addEventListener("change", handleSourcingRoleChange);
  if (sourcingRecruiterSelect) sourcingRecruiterSelect.addEventListener("change", handleSourcingRecruiterChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
