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
    return options[0].key; // fallback: latest available
  }

  function getOrderedValues(rows, includeAllValue, getValue) {
    const seen = new Set();
    const values = [];
    if (includeAllValue) {
      values.push(includeAllValue);
      seen.add(includeAllValue);
    }
    rows.forEach(r => {
      const val = getValue(r);
      if (!val || seen.has(val)) return;
      seen.add(val);
      values.push(val);
    });
    return values;
  }

  function setSelectOptions(select, options, includeAll) {
    if (!select) return;
    select.innerHTML = "";
    if (includeAll) {
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = "All time";
      select.appendChild(opt);
    }
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.key;
      const label = `KW ${String(opt.kw).padStart(2, "0")} · ${opt.year}`;
      o.textContent = label;
      select.appendChild(o);
    });
  }

  function setFilterOptions(select, options, allLabel) {
    if (!select) return;
    select.innerHTML = "";
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt === "all" ? allLabel : opt;
      select.appendChild(o);
    });
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(1)}%`;
  }

  function normalizeStageValue(value) {
    return normalizeHeader(String(value || ""));
  }

  function getStageOrderFromRows(rows, coreKeys) {
    if (!rows.length) return [];
    const first = rows[0] || {};
    const keys = Object.keys(first);
    const stages = [];
    keys.forEach(k => {
      const nk = normalizeHeader(k);
      if (coreKeys.has(nk)) return;
      stages.push(nk);
    });
    return stages;
  }

  function sumStageCounts(rows, stageKey, selectedWeekKey, role, recruiter) {
    return rows.reduce((sum, r) => {
      if (!isWeekMatch(r, selectedWeekKey)) return sum;
      if (role && r.role !== role) return sum;
      if (recruiter && r.recruiter !== recruiter) return sum;
      if (!r.stage || String(r.stage).startsWith("__")) return sum;
      const normalizedStage = normalizeStageValue(r.stage);
      if (normalizedStage !== stageKey) return sum;
      return sum + num(r.count);
    }, 0);
  }

  /* ---------------- TABS ---------------- */

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const targetId = tab.dataset.tab;
        document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add("active");
      });
    });
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizePipelineWeekly(rows, headers) {
    if (!rows.length) return [];

    const hasStage = headers.includes("stage");
    const hasCount = headers.includes("count");

    const ignoredStages = new Set(["sourced", "contacted", "connect", "connects", "replied"]);
    const isIgnoredStage = (stageValue) => ignoredStages.has(normalizeStageValue(stageValue));

    if (hasStage && hasCount) {
      const long = rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"])
      }));
      return long.filter(r => r.year && r.kw && r.role && r.stage && !isIgnoredStage(r.stage));
    }

    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order"]);
    const stages = getStageOrderFromRows(rows, coreKeys).filter(stage => !isIgnoredStage(stage));
    state.pipelineWeeklyStageOrder = stages;

    const long = [];
    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      const recruiter = getField(r, ["recruiter"]);
      if (!year || !kw || !role) return;

      let pushedAny = false;
      stages.forEach(stageKey => {
        const count = num(r[stageKey]); // keep zeros so roles/stages remain visible
        if (count > 0 || String(r[stageKey]).trim() !== "") pushedAny = true;
        long.push({ year, kw, role, recruiter, stage: stageKey, count });
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
      const recruiter = getField(r, ["recruiter"]);
      if (!year || !kw || !role) return;

      Object.keys(r).forEach(k => {
        const nk = normalizeHeader(k);
        if (coreKeys.has(nk) || isIgnoredStage(nk)) return;
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
    if (!rows.length) return [];
    const hasSourcedCol = rows.some(r => Object.prototype.hasOwnProperty.call(r, "sourced"));
    const hasContactedCol = rows.some(r => Object.prototype.hasOwnProperty.call(r, "contacted"));
    const connectKeys = ["connect", "connects", "connections", "connected"];
    const hasConnectCol = rows.some(r => connectKeys.some(k => Object.prototype.hasOwnProperty.call(r, k)));
    const hasSourcedScreensCol = rows.some(r => Object.prototype.hasOwnProperty.call(r, "sourced_screens"));
    const hasContactedScreensCol = rows.some(r => Object.prototype.hasOwnProperty.call(r, "contacted_screens"));
    const hasConnectScreensCol = rows.some(r => Object.prototype.hasOwnProperty.call(r, "connect_screens"));
    const hasRecruiterScreenCol = rows.some(r =>
      Object.prototype.hasOwnProperty.call(r, "recruiter_screen")
      || Object.prototype.hasOwnProperty.call(r, "recruiter_screened")
    );
    const useContactedForSourced = !hasSourcedCol && hasContactedCol && !hasConnectCol;
    const useContactedScreensForSourced = !hasSourcedScreensCol && hasContactedScreensCol && !hasConnectScreensCol;

    return rows.map(r => {
      const sourced = hasSourcedCol ? num(r.sourced) : (useContactedForSourced ? num(r.contacted) : 0);
      const legacyReplied = num(getField(r, ["replied"]));
      const connect = hasConnectCol ? num(getField(r, connectKeys)) : 0;
      const sourcedScreens = hasSourcedScreensCol
        ? num(r.sourced_screens)
        : (useContactedScreensForSourced
          ? num(r.contacted_screens)
          : (hasRecruiterScreenCol ? num(getField(r, ["recruiter_screen", "recruiter_screened"])) : 0));
      const connectScreens = hasConnectScreensCol
        ? num(r.connect_screens)
        : (hasRecruiterScreenCol ? num(getField(r, ["recruiter_screen", "recruiter_screened"])) : 0);

      return {
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        source: getField(r, ["source"]),
        sourced,
        sourced_screens: sourcedScreens,
        connect,
        connect_screens: connectScreens,
        connects: connect,
        replied: legacyReplied
      };
    }).filter(r => r.year && r.kw && r.role);
  }

  function normalizeTargets(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      lookback_weeks: num(getField(r, ["lookback_weeks", "lookback"])),
      min_prev_stage_n: num(getField(r, ["min_prev_stage_n", "min_n"])),
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

  function normalizeWeeklyUpdates(rows) {
    return rows.map(r => ({
      role: String(getField(r, ["role"])).trim(),
      year: num(getField(r, ["year"])),
      kw: num(getField(r, ["kw"])),
      update: getField(r, ["update"])
    })).filter(r => r.role && r.year && r.kw && r.update);
  }

  /* ---------------- HEALTH (RAG) ---------------- */

  function normalizeHealthStage(value) {
    const normalized = normalizeStageValue(value);
    const collapsed = normalized.replace(/_/g, "");
    if (collapsed === "step1") return "step1";
    if (collapsed === "step2") return "step2";
    return normalized;
  }

  function computeHealthFromCounts(step1Count, step2Count) {
    const s1 = num(step1Count);
    const s2 = num(step2Count);
    if (s1 >= 10 && s2 >= 5) return "healthy";
    if (s1 < 5 || s2 < 2) return "critical";
    return "warning";
  }

  function getHealthByRoleFromInventory(inventoryRows, selectedWeekKey) {
    const roles = new Map();

    inventoryRows.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      if (!r.role || !r.stage) return;
      const normalizedStage = normalizeHealthStage(r.stage);
      if (!roles.has(r.role)) roles.set(r.role, { step1: 0, step2: 0 });
      const counts = roles.get(r.role);
      if (normalizedStage === "step1") counts.step1 += num(r.count);
      if (normalizedStage === "step2") counts.step2 += num(r.count);
    });

    return roles;
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const rows = state.overviewRows || [];
    const selectedWeek = state.selectedPipelineWeek || "all";
    const inventoryRows = state.pipelineInventoryRows || [];

    const openRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "open").length;
    const filledRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "filled").length;

    const healthByRole = getHealthByRoleFromInventory(inventoryRows, selectedWeek);
    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    healthByRole.forEach((counts) => {
      const health = computeHealthFromCounts(counts.step1, counts.step2);
      healthCounts[health] += 1;
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open roles</div><div class="value">${formatNumber(openRoles)}</div></div>
      <div class="kpi"><div class="label">Filled roles</div><div class="value">${formatNumber(filledRoles)}</div></div>
      <div class="kpi"><div class="label">Healthy</div><div class="value">${formatNumber(healthCounts.healthy)}</div></div>
      <div class="kpi"><div class="label">At risk</div><div class="value">${formatNumber(healthCounts.warning)}</div></div>
      <div class="kpi"><div class="label">Critical</div><div class="value">${formatNumber(healthCounts.critical)}</div></div>
    `;

    const summary = $("overviewHealthSummary");
    summary.innerHTML = Object.entries(healthCounts).map(([key, count]) => `
      <div class="health-chip ${key}">
        <span>${key}</span>
        <strong>${count}</strong>
      </div>
    `).join("");

    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    rows.forEach(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      const role = getField(r, ["role"]);
      const location = getField(r, ["location"]);
      const openings = num(getField(r, ["openings"]));
      const owner = getField(r, ["owner"]);
      const health = (() => {
        const counts = healthByRole.get(role);
        if (!counts) return "—";
        return computeHealthFromCounts(counts.step1, counts.step2);
      })();

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${status ? status.replace("_", " ") : ""}</td>
        <td>${location}</td>
        <td class="num">${openings || ""}</td>
        <td>${owner}</td>
        <td class="center">
          ${health === "—" ? "—" : `<span class="status ${health}">${health}</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline() {
    const rows = state.pipelineInventoryRows.length ? state.pipelineInventoryRows : state.pipelineWeeklyRows;
    const selectedWeek = state.selectedPipelineWeek || "all";
    const tbody = $("pipelineTable");
    const empty = $("pipelineEmpty");

    tbody.innerHTML = "";

    const filtered = rows.filter(r => isWeekMatch(r, selectedWeek));
    if (!filtered.length) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
    }

    const stages = (state.pipelineInventoryRows.length ? state.pipelineInventoryStageOrder : state.pipelineWeeklyStageOrder) || [];
    const roleOrder = [];
    const seen = new Set();

    filtered.forEach(r => {
      if (!r.role || seen.has(r.role)) return;
      seen.add(r.role);
      roleOrder.push(r.role);
    });

    const countsByRole = new Map();
    filtered.forEach(r => {
      if (!r.role || !r.stage || String(r.stage).startsWith("__")) return;
      const stageKey = normalizeStageValue(r.stage);
      if (!countsByRole.has(r.role)) countsByRole.set(r.role, new Map());
      const sm = countsByRole.get(r.role);
      sm.set(stageKey, (sm.get(stageKey) || 0) + num(r.count));
    });

    const thead = document.querySelector("#pipeline table thead");
    if (thead) {
      const stageHeaders = stages.map(s => `<th>${formatStageLabel(s)}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
        </tr>
      `;
    }

    roleOrder.forEach(role => {
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

  function formatStageLabel(stage) {
    if (!stage) return "";
    const cleaned = String(stage).replace(/_/g, " ");
    return cleaned.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  /* ---------------- RENDER: ACTIVITY ---------------- */

  function updateActivityFilters() {
    const selectedWeek = state.selectedActivityWeek || "all";
    const rows = state.pipelineWeeklyRows || [];
    const filtered = rows.filter(r => isWeekMatch(r, selectedWeek));
    const roles = getOrderedValues(filtered, "all", r => r.role);
    const recruiters = getOrderedValues(filtered, "all", r => r.recruiter);

    setFilterOptions($("activityRoleSelect"), roles, "All roles");
    setFilterOptions($("activityRecruiterSelect"), recruiters, "All recruiters");

    state.selectedActivityRole = $("activityRoleSelect").value;
    state.selectedActivityRecruiter = $("activityRecruiterSelect").value;
  }

  function renderActivity() {
    const rows = state.pipelineWeeklyRows || [];
    const selectedWeek = state.selectedActivityWeek || "all";
    const selectedRole = state.selectedActivityRole || "all";
    const selectedRecruiter = state.selectedActivityRecruiter || "all";

    const filtered = rows.filter(r => {
      if (!isWeekMatch(r, selectedWeek)) return false;
      if (selectedRole !== "all" && r.role !== selectedRole) return false;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return false;
      return true;
    });

    const stages = state.pipelineWeeklyStageOrder || [];
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

    setFilterOptions($("sourcingRoleSelect"), roles, "All roles");
    setFilterOptions($("sourcingRecruiterSelect"), recruiters, "All recruiters");

    state.selectedSourcingRole = $("sourcingRoleSelect").value;
    state.selectedSourcingRecruiter = $("sourcingRecruiterSelect").value;
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
      agg.sourced += num(r.sourced);
      agg.sourcedScreens += num(r.sourced_screens);
      agg.connect += num(r.connect);
      agg.connectScreens += num(r.connect_screens);

      totalSourced += num(r.sourced);
      totalSourcedScreens += num(r.sourced_screens);
      totalConnect += num(r.connect);
      totalConnectScreens += num(r.connect_screens);
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

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total Sourced</div><div class="value">${formatNumber(totalSourced)}</div></div>
      <div class="kpi"><div class="label">Sourced Screens</div><div class="value">${formatNumber(totalSourcedScreens)}</div><div class="sub">${formatPercent(overallSourcedConv)} ${convLabel}</div></div>
      <div class="kpi"><div class="label">Total Connects</div><div class="value">${formatNumber(totalConnect)}</div></div>
      <div class="kpi"><div class="label">Connect Screens</div><div class="value">${formatNumber(totalConnectScreens)}</div><div class="sub">${formatPercent(overallConnectConv)} ${convLabel}</div></div>
    `;
  }

  /* ---------------- RENDER: MANAGEMENT ---------------- */

  function renderManagement() {
    const overviewRows = state.overviewRows || [];
    const hiredRows = state.hiredRows || [];
    const weeklyRows = state.pipelineWeeklyRows || [];
    const inventoryRows = state.pipelineInventoryRows || [];
    const roleNotesRows = state.roleNotesRows || [];
    const weeklyUpdatesRows = state.weeklyUpdatesRows || [];

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
      const key = weekKeyFromParts(r.year, r.kw);
      if (!rollingWeekKeys.has(key)) return sum;
      if (selectedRole !== "all" && r.role !== selectedRole) return sum;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return sum;
      if (normalizeStageValue(r.stage) !== "step1") return sum;
      return sum + num(r.count);
    }, 0);

    const step2ScreensRolling = weeklyRows.reduce((sum, r) => {
      const key = weekKeyFromParts(r.year, r.kw);
      if (!rollingWeekKeys.has(key)) return sum;
      if (selectedRole !== "all" && r.role !== selectedRole) return sum;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return sum;
      if (normalizeStageValue(r.stage) !== "step2") return sum;
      return sum + num(r.count);
    }, 0);

    const step1ToStep2Conv = step1ScreensRolling > 0 ? step2ScreensRolling / step1ScreensRolling : null;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open roles</div><div class="value">${formatNumber(openRoles)}</div></div>
      <div class="kpi"><div class="label">On hold</div><div class="value">${formatNumber(onHoldRoles)}</div></div>
      <div class="kpi"><div class="label">Weekly activity</div><div class="value">${formatNumber(weeklyActivity)}</div></div>
      <div class="kpi"><div class="label">Step 1 Screens (4w)</div><div class="value">${formatNumber(step1ScreensRolling)}</div></div>
      <div class="kpi"><div class="label">Step 2 Screens (4w)</div><div class="value">${formatNumber(step2ScreensRolling)}</div></div>
      <div class="kpi"><div class="label">Step1 → Step2</div><div class="value">${formatPercent(step1ToStep2Conv)}</div></div>
    `;

    renderManagementHealthOverview(healthByRole);

    renderManagementRoles(overviewRows, healthByRole);

    renderRoleNotes(roleNotesRows);

    renderWeeklyUpdates(weeklyUpdatesRows);
  }

  function renderManagementHealthOverview(healthByRole) {
    const summary = $("managementHealthSummary");
    const counts = { healthy: 0, warning: 0, critical: 0 };
    healthByRole.forEach((countsByStage) => {
      const health = computeHealthFromCounts(countsByStage.step1, countsByStage.step2);
      counts[health] += 1;
    });

    summary.innerHTML = Object.entries(counts).map(([key, count]) => `
      <div class="health-chip ${key}">
        <span>${key}</span>
        <strong>${count}</strong>
      </div>
    `).join("");
  }

  function renderManagementRoles(overviewRows, healthByRole) {
    const tbody = $("managementRolesTable");
    tbody.innerHTML = "";

    overviewRows.forEach(r => {
      const role = getField(r, ["role"]);
      const status = normalizeHeader(getField(r, ["status"]));
      const location = getField(r, ["location"]);
      const openings = num(getField(r, ["openings"]));
      const owner = getField(r, ["owner"]);
      const healthCounts = healthByRole.get(role);
      const health = healthCounts ? computeHealthFromCounts(healthCounts.step1, healthCounts.step2) : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${status ? status.replace("_", " ") : ""}</td>
        <td>${location}</td>
        <td class="num">${openings || ""}</td>
        <td>${owner}</td>
        <td class="center">
          ${health === "—" ? "—" : `<span class="status ${health}">${health}</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderRoleNotes(roleNotesRows) {
    const container = $("roleNotes");
    const empty = $("roleNotesEmpty");
    if (!roleNotesRows.length) {
      empty.classList.remove("hidden");
      container.innerHTML = "";
      return;
    }
    empty.classList.add("hidden");
    container.innerHTML = roleNotesRows.map(r => `
      <div class="note-card">
        <div class="note-head">
          <h4>${r.role}</h4>
          <span class="muted">KW ${String(r.kw).padStart(2, "0")} · ${r.year}</span>
        </div>
        <div class="note-section">
          <h5>Challenges</h5>
          <p>${r.challenges || "—"}</p>
        </div>
        <div class="note-section">
          <h5>Highlights</h5>
          <p>${r.highlights || "—"}</p>
        </div>
        <div class="note-section">
          <h5>Big wins</h5>
          <p>${r.big_wins || "—"}</p>
        </div>
      </div>
    `).join("");
  }

  function renderWeeklyUpdates(weeklyUpdatesRows) {
    const container = $("weeklyUpdates");
    const empty = $("weeklyUpdatesEmpty");

    const selectedRole = state.selectedActivityRole || "all";
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
    const latestSourcingKey = state.sourcingOptions.some(o => o.key === TODAY_WEEK_KEY)
      ? TODAY_WEEK_KEY
      : (state.sourcingOptions[0]?.key || "");
    state.selectedSourcingWeek = latestSourcingKey;
    const sourcingSelect = $("sourcingWeekSelect");
    if (sourcingSelect) {
      sourcingSelect.innerHTML = "";
      if (latestSourcingKey) {
        const kw = getWeekNumberFromKey(latestSourcingKey);
        const opt = document.createElement("option");
        opt.value = latestSourcingKey;
        opt.textContent = `Rolling 4w · ending KW ${kw ? String(kw).padStart(2, "0") : ""}`;
        sourcingSelect.appendChild(opt);
        sourcingSelect.value = latestSourcingKey;
      }
    }

    const pipelineAllowed = ["all", ...state.pipelineOptions.map(o => o.key)];
    const activityAllowed = ["all", ...state.activityOptions.map(o => o.key)];
    const sourcingAllowed = latestSourcingKey ? [latestSourcingKey] : [];

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
      state.selectedSourcingWeek = latestSourcingKey;
    }

    $("pipelineWeekSelect").value = state.selectedPipelineWeek;
    $("activityWeekSelect").value = state.selectedActivityWeek;
    if (sourcingSelect && latestSourcingKey) sourcingSelect.value = latestSourcingKey;

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
    renderManagement();
  }

  function handleActivityWeekChange() {
    state.selectedActivityWeek = $("activityWeekSelect").value;
    updateActivityFilters();
    renderActivity();
    renderManagement();
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    updateSourcingFilters();
    renderSourcing();
  }

  function handleActivityRoleChange() {
    state.selectedActivityRole = $("activityRoleSelect").value;
    renderActivity();
    renderManagement();
  }

  function handleActivityRecruiterChange() {
    state.selectedActivityRecruiter = $("activityRecruiterSelect").value;
    renderActivity();
    renderManagement();
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
