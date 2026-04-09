// app.js
document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG ----------------- */

  function getISOWeekFromDate(date) {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = utcDate.getUTCDay() || 7;
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
  const MANAGEMENT_PASSWORD = "EGYM2026";

  const HIRES_UNLOCK_KEY = "hires_unlocked";
  const MANAGEMENT_UNLOCK_KEY = "management_unlocked";
  const VIEW_STORAGE_KEY = "dashboard_view";
  const DEPARTMENT_STORAGE_KEY = "selected_department";
  const TAB_STORAGE_KEY = "active_tab";

  const state = {
    view: "contributor",
    selectedDepartment: "",
    departmentOptions: [],
    selectedOverviewDepartment: "all",

    allOverviewRows: [],
    overviewRows: [],

    allPipelineWeeklyRows: [],
    pipelineWeeklyRows: [],
    allPipelineInventoryRows: [],
    pipelineInventoryRows: [],

    pipelineWeeklyStageOrder: [],
    pipelineInventoryStageOrder: [],

    allSourcingRows: [],
    sourcingRows: [],

    allHiredRows: [],
    hiredRows: [],

    roleTargets: [],

    allRoleNotesRows: [],
    roleNotesRows: [],

    allWeeklyUpdatesRows: [],
    weeklyUpdatesRows: [],

    roleStatusByRole: {},

    pipelineOptions: [],
    activityOptions: [],
    sourcingOptions: [],

    selectedPipelineWeek: "",
    selectedPipelineRecruiter: "all",

    selectedActivityWeekMode: "week",
    selectedActivityWeek: "",
    selectedActivityFromWeek: "",
    selectedActivityToWeek: "",

    selectedSourcingWeekMode: "rolling",
    selectedSourcingWeek: "",
    selectedSourcingFromWeek: "",
    selectedSourcingToWeek: "",

    selectedActivityRole: "all",
    selectedActivityRecruiter: "all",
    selectedSourcingRole: "all",
    selectedSourcingRecruiter: "all",

    selectedManagementWeek: "",
    selectedManagementQuarter: "",

    selectedForecastRole: "all",
    selectedForecastRecruiter: "all",
    selectedForecastDepartment: "all",

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

  function normalizeDepartmentValue(value) {
    return String(value || "").trim();
  }

  function getDepartmentValue(row) {
    const val = getField(row, [
      "department",
      "dept",
      "team",
      "function",
      "org",
      "department_name",
      "department team",
      "department_team",
      "department/team",
      "department_area",
      "department area"
    ]) || row.department;

    return normalizeDepartmentValue(val);
  }

  function getDepartmentList(rows) {
    const ordered = [];
    const seen = new Set();

    (rows || []).forEach(row => {
      const dept = getDepartmentValue(row);
      if (!dept) return;
      const key = dept.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      ordered.push(dept);
    });

    return ordered;
  }

  function buildDepartmentOptions({
    overviewRows,
    pipelineWeeklyRows,
    pipelineInventoryRows,
    sourcingRows,
    hiredRows,
    roleNotesRows,
    weeklyUpdatesRows
  }) {
    const overviewList = getDepartmentList(overviewRows);
    const options = [...overviewList];
    const seen = new Set(overviewList.map(item => item.toLowerCase()));

    const addRows = (rows) => {
      getDepartmentList(rows).forEach(dept => {
        const key = dept.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push(dept);
      });
    };

    addRows(pipelineWeeklyRows);
    addRows(pipelineInventoryRows);
    addRows(sourcingRows);
    addRows(hiredRows);
    addRows(roleNotesRows);
    addRows(weeklyUpdatesRows);

    return options;
  }

  function isDepartmentMatch(rowDept, selectedDepartment, options) {
    if (!selectedDepartment || String(selectedDepartment).toLowerCase() === "all") return true;

    const normalizedSelected = normalizeDepartmentValue(selectedDepartment).toLowerCase();
    const normalizedRow = normalizeDepartmentValue(rowDept).toLowerCase();

    if (!normalizedRow) {
      if (options.length === 1) {
        return normalizeDepartmentValue(options[0]).toLowerCase() === normalizedSelected;
      }
      return false;
    }

    return normalizedRow === normalizedSelected;
  }

  function filterRowsByDepartment(rows) {
    if (!state.selectedDepartment || String(state.selectedDepartment).toLowerCase() === "all") return rows || [];
    return (rows || []).filter(row =>
      isDepartmentMatch(getDepartmentValue(row), state.selectedDepartment, state.departmentOptions)
    );
  }

  function applyDepartmentSelection() {
    state.overviewRows = filterRowsByDepartment(state.allOverviewRows);
    state.pipelineWeeklyRows = filterRowsByDepartment(state.allPipelineWeeklyRows);
    state.pipelineInventoryRows = filterRowsByDepartment(state.allPipelineInventoryRows);
    state.sourcingRows = filterRowsByDepartment(state.allSourcingRows);

    state.hiredRows = filterRowsByDepartment(state.allHiredRows);

    state.roleNotesRows = filterRowsByDepartment(state.allRoleNotesRows);
    state.weeklyUpdatesRows = filterRowsByDepartment(state.allWeeklyUpdatesRows);
  }

  function getNumberClass(value) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return n === 0 ? "num-zero" : "num-pos";
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

  function getHealthWidgetWeekKey() {
    const prev = getPreviousWeekKey(TODAY_WEEK_KEY);
    return prev || TODAY_WEEK_KEY;
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

  function getQuarterForMonth(monthIndex) {
    return Math.floor(monthIndex / 3) + 1;
  }

  function getQuarterLabel(year, quarter) {
    return `${year}-Q${quarter}`;
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
    return options[0].key;
  }

  function compareWeekKeys(a, b) {
    const pa = getWeekYearFromKey(a);
    const pb = getWeekYearFromKey(b);
    if (!pa || !pb) return 0;
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.kw - pb.kw;
  }

  function isWeekKeyInRange(targetKey, fromKey, toKey) {
    if (!targetKey || !fromKey || !toKey) return false;

    let start = fromKey;
    let end = toKey;

    if (compareWeekKeys(start, end) > 0) {
      start = toKey;
      end = fromKey;
    }

    return compareWeekKeys(targetKey, start) >= 0 && compareWeekKeys(targetKey, end) <= 0;
  }

  function isRowInWeekRange(row, fromKey, toKey) {
    return isWeekKeyInRange(weekKey(row), fromKey, toKey);
  }

  function setModeOptions(select, items, fallbackValue) {
    if (!select) return;

    const current = select.value || fallbackValue || "";
    select.innerHTML = "";

    items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    });

    const allowed = new Set(items.map(item => item.value));
    select.value = allowed.has(current) ? current : fallbackValue;
  }

  function updateActivityWeekModeUI() {
    const mode = state.selectedActivityWeekMode || "week";
    $("activityWeekSingleWrap")?.classList.toggle("hidden", mode !== "week");
    $("activityWeekFromWrap")?.classList.toggle("hidden", mode !== "range");
    $("activityWeekToWrap")?.classList.toggle("hidden", mode !== "range");
  }

  function updateSourcingWeekModeUI() {
    const mode = state.selectedSourcingWeekMode || "rolling";
    $("sourcingWeekSingleWrap")?.classList.toggle("hidden", mode !== "week" && mode !== "rolling");
    $("sourcingWeekFromWrap")?.classList.toggle("hidden", mode !== "range");
    $("sourcingWeekToWrap")?.classList.toggle("hidden", mode !== "range");
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
    setSelectOptions(select, options || [], false);
    select.disabled = false;
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

  function setDepartmentOptions(select, options, preferredValue) {
    if (!select) return;

    const opts = Array.isArray(options) ? options : [];
    const current = preferredValue || select.value || "";

    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All";
    select.appendChild(allOpt);

    opts.forEach(value => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });

    const allowed = new Set(["all", ...opts]);
    if (allowed.has(current)) select.value = current;
    else select.value = "all";

    select.disabled = false;
  }

  function setManagementQuarterOptions(select, year, preferredQuarter) {
    if (!select) return;
    select.innerHTML = "";
    for (let q = 1; q <= 4; q += 1) {
      const opt = document.createElement("option");
      opt.value = getQuarterLabel(year, q);
      opt.textContent = `Q${q} ${year}`;
      select.appendChild(opt);
    }
    const preferredValue = getQuarterLabel(year, preferredQuarter);
    select.value = preferredValue;
  }

  function getOrderedValues(rows, selectedWeekKey, accessor) {
    const ordered = [];
    const seen = new Set();
    rows.forEach(r => {
      if (selectedWeekKey !== "all" && selectedWeekKey && !isWeekMatch(r, selectedWeekKey)) return;
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
  if (normalized === "bad" || normalized.includes("critical")) return "critical";
  if (
    normalized === "warn" ||
    normalized.includes("warning") ||
    normalized.includes("risk") ||
    normalized.includes("at_risk")
  ) return "warning";
  if (
    normalized === "ok" ||
    normalized.includes("healthy") ||
    normalized.includes("good")
  ) return "healthy";
  return "";
}

  function isOnHoldRole(role) {
    const st = normalizeHeader(state.roleStatusByRole?.[role] || "");
    return st === "on_hold" || st === "onhold" || st.includes("hold");
  }

  function shouldShowRoleOutsideOverview(role, hasData) {
    if (!role) return false;
    if (!isOnHoldRole(role)) return true;
    return !!hasData;
  }

  function setOverviewDepartmentOptions(select, departments) {
    if (!select) return;

    const current = state.selectedOverviewDepartment || "all";
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All";
    select.appendChild(allOpt);

    (departments || []).forEach(dep => {
      const opt = document.createElement("option");
      opt.value = dep;
      opt.textContent = dep;
      select.appendChild(opt);
    });

    const allowed = new Set(["all", ...(departments || [])]);
    select.value = allowed.has(current) ? current : "all";
    state.selectedOverviewDepartment = select.value;
  }

  /* ---------------- NORMALIZERS ---------------- */

  function normalizePipelineWeekly(rows, headers = []) {
    if (!rows.length) {
      state.pipelineWeeklyStageOrder = [];
      return [];
    }

    const looksLong = rows.length && ("stage" in rows[0] || "count" in rows[0]);
    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "department"]);
    const long = [];
    const ignoredStages = new Set(["connects", "connect", "connected", "connections", "replied"]);
    const isIgnoredStage = (stageValue) => ignoredStages.has(normalizeStageValue(stageValue));

    if (looksLong) {
      state.pipelineWeeklyStageOrder = [];
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        department: getField(r, ["department"]),
        stage: normalizeStageValue(getField(r, ["stage"])),
        count: num(getField(r, ["count"]))
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
      const recruiter = getField(r, ["recruiter"]);
      const department = getField(r, ["department"]);
      if (!year || !kw || !role) return;

      let pushedAny = false;

      stageOrder.forEach(stageKey => {
        const count = num(r[stageKey]);
        if (!Number.isFinite(count)) return;
        if (count === 0) return;
        if (isIgnoredStage(stageKey)) return;
        pushedAny = true;
        long.push({ year, kw, role, recruiter, department, stage: stageKey, count });
      });

      if (!pushedAny) {
        long.push({ year, kw, role, recruiter, department, stage: "__role__", count: 0 });
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
        department: getField(r, ["department"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"])
      })).filter(r => r.year && r.kw && r.role && r.stage && !isIgnoredStage(r.stage));
    }

    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order", "department"]);
    state.pipelineInventoryStageOrder = getStageOrderFromRows(rows, coreKeys)
      .filter(stage => !isIgnoredStage(stage))
      .filter(stage => stage !== "department");

    const long = [];
    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      const recruiter = getField(r, ["recruiter"]);
      const department = getField(r, ["department"]);
      if (!year || !kw || !role) return;

      Object.keys(r).forEach(k => {
        const nk = normalizeHeader(k);
        if (coreKeys.has(nk) || isIgnoredStage(nk)) return;
        const count = num(r[k]);
        long.push({
          year,
          kw,
          role,
          recruiter,
          department,
          stage: nk,
          count,
          stage_order: null
        });
      });
    });
    return long;
  }

  function normalizeSourcing(rows) {
    return rows.map(r => {
      const sourced = num(getField(r, ["sourced", "contacted"]));
      const legacyScreens = num(getField(r, ["recruiter_screen", "recruiter_screened"]));
      const sourcedScreens = num(getField(r, [
        "sourced_screens", "sourced_screen", "sourced_screened",
        "contacted_screens", "contacted_screen", "contacted_screened"
      ])) || legacyScreens;
      const connect = num(getField(r, ["connect", "connects", "connections", "connected", "replied"]));
      const connectScreens = num(getField(r, [
        "connect_screens", "connect_screen", "connect_screened",
        "recruiter_screen", "recruiter_screened"
      ])) || legacyScreens;

      return {
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        recruiter: getField(r, ["recruiter"]),
        department: getField(r, ["department"]),
        source: getField(r, ["source"]),
        sourced,
        sourced_screens: sourcedScreens,
        connect,
        connect_screens: connectScreens,
        connects: connect,
        replied: num(getField(r, ["replied"])),
        recruiter_screen: legacyScreens
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
      department: getField(r, ["department"]),
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
      department: getField(r, ["department"]),
      update: getField(r, ["update"])
    })).filter(r => r.role && r.year && r.kw && r.update);
  }

  /* ---------------- HEALTH ---------------- */

  function normalizeRoleKey(value) {
    return String(value || "").trim();
  }

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
    if (s1 === 0 && s2 === 0) return "unknown";
    if (s1 < 3) return "critical";
    if (s1 < 6 && s2 < 3) return "critical";
    if (s1 < 10 && s2 < 4) return "warning";
    return "healthy";
  }

  function getHealthByRole(weeklyRows, endWeekKey, filters = {}) {
    const { roleFilter = "all", recruiterFilter = "all" } = filters;
    const windowKeys = new Set(getRollingWeekKeys(endWeekKey, 4));
    const byRole = new Map();

    (weeklyRows || []).forEach(r => {
      const role = normalizeRoleKey(r.role);
      if (!role) return;

      if (roleFilter !== "all" && role !== roleFilter) return;
      if (recruiterFilter !== "all" && (r.recruiter || "Unassigned") !== recruiterFilter) return;

      const wk = weekKey(r);
      if (!wk || !windowKeys.has(wk)) return;

      const stage = normalizeHealthStage(r.stage);
      if (stage !== "step1" && stage !== "step2") return;

      if (!byRole.has(role)) byRole.set(role, { step1: 0, step2: 0 });
      const agg = byRole.get(role);
      if (stage === "step1") agg.step1 += num(r.count);
      if (stage === "step2") agg.step2 += num(r.count);
    });

    const health = {};
    byRole.forEach((agg, role) => {
      health[role] = computeHealthFromCounts(agg.step1, agg.step2);
    });
    return health;
  }

  function getOfferByRoleFromInventory(inventoryRows, selectedWeekKey, filters = {}) {
    const { roleFilter = "all", recruiterFilter = "all" } = filters;
    const offerByRole = new Map();

    const weekKeyToUse = selectedWeekKey === "all" ? TODAY_WEEK_KEY : selectedWeekKey;
    if (!weekKeyToUse) return offerByRole;

    (inventoryRows || []).forEach(r => {
      const role = normalizeRoleKey(getField(r, ["role"]) || r.role);
      if (!role) return;

      if (roleFilter !== "all" && role !== roleFilter) return;

      const recruiter = (getField(r, ["recruiter"]) || r.recruiter || "Unassigned");
      if (recruiterFilter !== "all" && recruiter !== recruiterFilter) return;

      if (weekKey(r) !== weekKeyToUse) return;

      const stageRaw = getField(r, ["stage"]) || r.stage;
      const stageNorm = normalizeStageValue(stageRaw);
      if (!stageNorm.includes("offer")) return;

      const c = num(getField(r, ["count"]) || r.count);
      offerByRole.set(role, (offerByRole.get(role) || 0) + c);
    });

    return offerByRole;
  }

  function getHealthByRoleWithOfferOverride({ weeklyRows, inventoryRows, endWeekKey, inventoryWeekKey, filters = {} }) {
    const base = getHealthByRole(weeklyRows, endWeekKey, filters);
    const offerByRole = getOfferByRoleFromInventory(inventoryRows, inventoryWeekKey, filters);

    offerByRole.forEach((count, role) => {
      if (count > 0) base[role] = "healthy";
    });

    return base;
  }

  function getHealthByRoleFromInventory(inventoryRows, selectedWeekKey, filters = {}) {
    const { roleFilter = "all", recruiterFilter = "all" } = filters;

    const byRole = new Map();
    const offerByRole = new Map();

    const weekKeyToUse = selectedWeekKey === "all" ? TODAY_WEEK_KEY : selectedWeekKey;
    if (!weekKeyToUse) return {};

    (inventoryRows || []).forEach(r => {
      const role = normalizeRoleKey(getField(r, ["role"]) || r.role);
      if (!role) return;

      if (roleFilter !== "all" && role !== roleFilter) return;

      const recruiter = (getField(r, ["recruiter"]) || r.recruiter || "Unassigned");
      if (recruiterFilter !== "all" && recruiter !== recruiterFilter) return;

      if (weekKey(r) !== weekKeyToUse) return;

      const stageRaw = getField(r, ["stage"]) || r.stage;
      const stageNorm = normalizeStageValue(stageRaw);
      const c = num(getField(r, ["count"]) || r.count);

      if (stageNorm.includes("offer")) {
        offerByRole.set(role, (offerByRole.get(role) || 0) + c);
      }

      const stage = normalizeHealthStage(stageRaw);
      if (stage !== "step1" && stage !== "step2") return;

      if (!byRole.has(role)) byRole.set(role, { step1: 0, step2: 0 });
      const agg = byRole.get(role);
      if (stage === "step1") agg.step1 += c;
      if (stage === "step2") agg.step2 += c;
    });

    const health = {};

    byRole.forEach((agg, role) => {
      const base = computeHealthFromCounts(agg.step1, agg.step2);
      const hasOffer = (offerByRole.get(role) || 0) > 0;
      health[role] = hasOffer ? "healthy" : base;
    });

    offerByRole.forEach((count, role) => {
      if (count > 0 && !health[role]) health[role] = "healthy";
    });

    return health;
  }

  /* ---------------- TABS ---------------- */

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll("#contributorView .panel");
    const target = tabId || "overview";

    localStorage.setItem(TAB_STORAGE_KEY, target);

    tabs.forEach(t => {
      const active = t.dataset.tab === target;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });

    panels.forEach(p => {
      p.classList.toggle("active", p.id === target);
    });
  }

  function updateHiresLockUI() {
    const unlocked = localStorage.getItem(HIRES_UNLOCK_KEY) === "1";
    const lock = $("hiresLock");
    const content = $("hiresContent");
    if (!lock || !content) return;

    lock.classList.toggle("hidden", unlocked);
    content.classList.toggle("hidden", !unlocked);
  }

  function unlockHiresWithPassword() {
    const input = $("hiresPasswordInput");
    const error = $("hiresErrorMsg");
    if (!input) return;

    const value = input.value || "";
    if (value === HIRES_PASSWORD) {
      localStorage.setItem(HIRES_UNLOCK_KEY, "1");
      if (error) error.textContent = "";
      updateHiresLockUI();
      renderHires();
    } else {
      if (error) error.textContent = "Incorrect password";
    }
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab || "overview";

        if (id === "hires") {
          const unlocked = localStorage.getItem(HIRES_UNLOCK_KEY) === "1";
          window.location.hash = id;
          activateTab(id);
          if (!unlocked) {
            updateHiresLockUI();
            return;
          }
          renderHires();
          return;
        }

        window.location.hash = id;
        activateTab(id);
      });
    });

    window.addEventListener("hashchange", () => {
      const id = window.location.hash.replace("#", "") || "overview";

      if (id === "hires") {
        const unlocked = localStorage.getItem(HIRES_UNLOCK_KEY) === "1";
        activateTab(id);
        if (!unlocked) {
          updateHiresLockUI();
          return;
        }
        renderHires();
        return;
      }

      activateTab(id);
    });

    const initialId =
      window.location.hash.replace("#", "") ||
      localStorage.getItem(TAB_STORAGE_KEY) ||
      "overview";

    activateTab(initialId);

    if (initialId === "hires") {
      const unlocked = localStorage.getItem(HIRES_UNLOCK_KEY) === "1";
      if (!unlocked) updateHiresLockUI();
      else renderHires();
    }
  }

  /* ---------------- OVERVIEW ---------------- */

  function renderOverview() {
    const hiredRows = state.hiredRows || [];
    let rows = state.allOverviewRows || [];

    const selectedOverviewDept = state.selectedOverviewDepartment || "all";
    if (selectedOverviewDept !== "all") {
      const want = normalizeDepartmentValue(selectedOverviewDept).toLowerCase();
      rows = rows.filter(r => {
        const dept = normalizeDepartmentValue(getField(r, ["department"]) || r.department).toLowerCase();
        return dept === want;
      });
    }

    const healthWeekKey = getHealthWidgetWeekKey();
    const healthByRole = getHealthByRoleFromInventory(state.pipelineInventoryRows, healthWeekKey);

    const hiresByRole = {};
    (hiredRows || []).forEach(r => {
      const role = getField(r, ["role"]);
      const signatureDate = getField(r, ["signature_date", "signature date"]);
      const startDate = getField(r, ["start_date", "start date"]);
      if (!role) return;
      if (!signatureDate && !startDate) return;
      hiresByRole[role] = (hiresByRole[role] || 0) + 1;
    });

    function getRemainingOpenings(row) {
      const role = getField(row, ["role"]);
      const baseOpenings = num(getField(row, ["openings"]));
      return Math.max(0, baseOpenings - (hiresByRole[role] || 0));
    }

    const onHoldRoles = rows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      return status === "on_hold" || status === "onhold" || status.includes("hold");
    }).length;

    const openRoles = rows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      if (status !== "open") return false;
      return getRemainingOpenings(r) > 0;
    }).length;

    const filledPositions = Object.values(hiresByRole).reduce((a, b) => a + b, 0);
    const totalOpenings = rows.reduce((sum, r) => sum + getRemainingOpenings(r), 0);

    const visibleRows = rows.filter(r => getRemainingOpenings(r) > 0);

    const counts = { healthy: 0, warning: 0, critical: 0 };
    visibleRows.forEach(r => {
      const role = getField(r, ["role"]);
      const h = healthByRole[role] || "unknown";
      if (h === "healthy") counts.healthy += 1;
      else if (h === "warning") counts.warning += 1;
      else if (h === "critical") counts.critical += 1;
    });

    state.overviewHealthCounts = counts;

    const cardsEl = $("overviewCards");
    if (cardsEl) {
      cardsEl.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
        <div class="kpi"><div class="label">On hold</div><div class="value">${onHoldRoles}</div></div>
        <div class="kpi"><div class="label">Filled Positions</div><div class="value">${filledPositions}</div></div>
        <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
      `;
    }

    const healthSummaryEl = $("overviewHealthSummary");
    if (healthSummaryEl) {
      healthSummaryEl.innerHTML = `
        <div class="health-badge good"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
        <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.warning} Attention</span></div>
        <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.critical} Action</span></div>
      `;
    }

    const tbody = $("overviewTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    visibleRows.forEach(r => {
      const role = getField(r, ["role"]);
      const status = getField(r, ["status"]);
      const location = getField(r, ["location"]);
      const openings = getRemainingOpenings(r);
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap", "owner", "recruiter"]);
      const h = healthByRole[role] || "unknown";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${status}</td>
        <td>${location}</td>
        <td class="num ${getNumberClass(openings)}">${formatNumber(openings)}</td>
        <td>${owner}</td>
        <td class="center">${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- PIPELINE ---------------- */

  function getStagesForInventory(invRows, selectedWeekKey, stageOrder) {
    const order = Array.isArray(stageOrder) ? stageOrder : [];
    const out = [];

    order.forEach(stageKey => {
      const nk = normalizeHeader(stageKey);
      if (!nk) return;
      if (nk === "department") return;
      out.push(nk);
    });

    if (!out.length && invRows && invRows.length) {
      const core = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order", "department"]);
      Object.keys(invRows[0] || {}).forEach(k => {
        const nk = normalizeHeader(k);
        if (!nk) return;
        if (core.has(nk)) return;
        if (nk === "department") return;
        out.push(nk);
      });
    }

    return out;
  }

  function renderPipeline() {
    const inv = state.pipelineInventoryRows || [];
    const selectedWeekKey = state.selectedPipelineWeek || "";
    const selectedRecruiter = state.selectedPipelineRecruiter || "all";

    const emptyEl = $("pipelineEmpty");
    const thead = document.querySelector("#pipeline table thead");
    const tbody = $("pipelineTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const stages = getStagesForInventory(inv, selectedWeekKey, state.pipelineInventoryStageOrder);
    const countsByRole = new Map();

    inv.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;

      const recruiter = getField(r, ["recruiter"]) || r.recruiter || "Unassigned";
      if (selectedRecruiter !== "all" && recruiter !== selectedRecruiter) return;

      const role = getField(r, ["role"]) || r.role;
      const stageRaw = getField(r, ["stage"]) || r.stage;
      if (!role || !stageRaw) return;

      const stageKey = normalizeHeader(stageRaw);
      if (!stageKey || stageKey === "department") return;

      if (!countsByRole.has(role)) countsByRole.set(role, new Map());
      const sm = countsByRole.get(role);
      const c = num(getField(r, ["count"]) || r.count);
      sm.set(stageKey, (sm.get(stageKey) || 0) + c);
    });

    if (thead) {
      const stageHeaders = stages.map(s => `<th>${formatStageLabel(s)}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
          <th class="center">Health</th>
        </tr>
      `;
    }

    const healthByRole = getHealthByRoleFromInventory(inv, selectedWeekKey || TODAY_WEEK_KEY);

    const roleList = [];
    const seen = new Set();

    inv.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;

      const recruiter = getField(r, ["recruiter"]) || r.recruiter || "Unassigned";
      if (selectedRecruiter !== "all" && recruiter !== selectedRecruiter) return;

      const role = getField(r, ["role"]) || r.role;
      if (!role || seen.has(role)) return;

      const sm = countsByRole.get(role) || new Map();
      let hasData = false;
      stages.forEach(stageKey => {
        if ((sm.get(stageKey) || 0) > 0) hasData = true;
      });

      if (!shouldShowRoleOutsideOverview(role, hasData)) return;

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

      const stageCells = stages.map(stageKey => {
        const value = sm.get(stageKey) || 0;
        return `<td class="num ${getNumberClass(value)}">${formatNumber(value)}</td>`;
      }).join("");

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

  function updatePipelineFilters() {
    const sel = $("pipelineRecruiterSelect");
    if (!sel) return;

    const inv = state.pipelineInventoryRows || [];
    const selectedWeekKey = state.selectedPipelineWeek || "";

    const recruiters = getOrderedValues(
      inv.filter(r => isWeekMatch(r, selectedWeekKey)),
      "all",
      r => (getField(r, ["recruiter"]) || r.recruiter || "Unassigned")
    );

    setFilterOptions(sel, recruiters, "All recruiters");

    const current = state.selectedPipelineRecruiter || "all";
    const allowed = new Set(["all", ...recruiters]);
    sel.value = allowed.has(current) ? current : "all";
    state.selectedPipelineRecruiter = sel.value;
  }

  /* ---------------- ACTIVITY ---------------- */

  function getActivityStages(weeklyRows, stageOrder) {
    const ignoredStages = new Set(["connects", "connect", "connected", "connections", "replied"]);
    if (Array.isArray(stageOrder) && stageOrder.length) {
      return stageOrder.filter(stage => !ignoredStages.has(normalizeStageValue(stage)));
    }
    const stages = [];
    const seen = new Set();
    weeklyRows.forEach(r => {
      if (!r.stage) return;
      if (String(r.stage).startsWith("__")) return;
      if (ignoredStages.has(normalizeStageValue(r.stage))) return;
      if (seen.has(r.stage)) return;
      seen.add(r.stage);
      stages.push(r.stage);
    });
    return stages;
  }

  function updateActivityFilters() {
    const mode = state.selectedActivityWeekMode || "week";
    const weekly = state.pipelineWeeklyRows || [];
    const currentRole = state.selectedActivityRole || "all";
    const currentRecruiter = state.selectedActivityRecruiter || "all";

    let baseRows = weekly;

    if (mode === "week") {
      const selectedWeekKey = state.selectedActivityWeek || "";
      baseRows = weekly.filter(r => isWeekMatch(r, selectedWeekKey));
    } else if (mode === "range") {
      baseRows = weekly.filter(r =>
        isRowInWeekRange(r, state.selectedActivityFromWeek, state.selectedActivityToWeek)
      );
    }

    const rolesForRecruiter = getOrderedValues(
      baseRows.filter(r => {
        if (currentRecruiter !== "all" && r.recruiter !== currentRecruiter) return false;
        return true;
      }),
      "all",
      r => r.role
    );

    setFilterOptions($("activityRoleSelect"), rolesForRecruiter, "All roles");
    if (currentRole !== "all" && !rolesForRecruiter.includes(currentRole)) {
      const el = $("activityRoleSelect");
      if (el) el.value = "all";
    }
    state.selectedActivityRole = $("activityRoleSelect") ? $("activityRoleSelect").value : "all";

    const recruitersForRole = getOrderedValues(
      baseRows.filter(r => {
        if (state.selectedActivityRole !== "all" && r.role !== state.selectedActivityRole) return false;
        return true;
      }),
      "all",
      r => r.recruiter
    );

    setFilterOptions($("activityRecruiterSelect"), recruitersForRole, "All recruiters");
    if (currentRecruiter !== "all" && !recruitersForRole.includes(currentRecruiter)) {
      const el = $("activityRecruiterSelect");
      if (el) el.value = "all";
    }
    state.selectedActivityRecruiter = $("activityRecruiterSelect") ? $("activityRecruiterSelect").value : "all";
  }

  function renderActivity() {
    const weekly = state.pipelineWeeklyRows || [];
    const mode = state.selectedActivityWeekMode || "week";
    const selectedRole = state.selectedActivityRole || "all";
    const selectedRecruiter = state.selectedActivityRecruiter || "all";

    const filtered = weekly.filter(r => {
      if (mode === "week") {
        if (!isWeekMatch(r, state.selectedActivityWeek || "")) return false;
      } else if (mode === "range") {
        if (!isRowInWeekRange(r, state.selectedActivityFromWeek, state.selectedActivityToWeek)) return false;
      }

      if (selectedRole !== "all" && r.role !== selectedRole) return false;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return false;
      return true;
    });

    const stages = getActivityStages(filtered, state.pipelineWeeklyStageOrder);
    const roles = [];
    const seen = new Set();
    const countsByRole = new Map();

    filtered.forEach(r => {
      const role = r.role;
      if (!role) return;

      if (!countsByRole.has(role)) countsByRole.set(role, new Map());

      if (r.stage && !String(r.stage).startsWith("__")) {
        const sm = countsByRole.get(role);
        const current = sm.get(r.stage) || 0;
        sm.set(r.stage, current + num(r.count));
      }
    });

    Array.from(countsByRole.keys()).forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      let hasData = false;
      sm.forEach(v => {
        if (num(v) > 0) hasData = true;
      });

      if (!shouldShowRoleOutsideOverview(role, hasData)) return;

      if (!seen.has(role)) {
        seen.add(role);
        roles.push(role);
      }
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
      const stageCells = stages.map(s => {
        const value = sm.get(s) || 0;
        return `<td class="num ${getNumberClass(value)}">${formatNumber(value)}</td>`;
      }).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageCells}
      `;
      tbody.appendChild(tr);
    });
        const totals = new Map();

    stages.forEach(stage => {
      totals.set(stage, 0);
    });

    roles.forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      stages.forEach(stage => {
        const current = totals.get(stage) || 0;
        totals.set(stage, current + (sm.get(stage) || 0));
      });
    });

    const totalCells = stages.map(stage => {
      const value = totals.get(stage) || 0;
      return `<td class="num ${getNumberClass(value)}"><strong>${formatNumber(value)}</strong></td>`;
    }).join("");

    const totalRow = document.createElement("tr");
    totalRow.innerHTML = `
      <td><strong>Total</strong></td>
      ${totalCells}
    `;

    tbody.appendChild(totalRow);
  }
  
  /* ---------------- SOURCING ---------------- */

  function isSourcingWeekInWindow(row) {
    const wk = weekKey(row);
    if (!wk) return false;

    const mode = state.selectedSourcingWeekMode || "rolling";

    if (mode === "all") return true;
    if (mode === "week") return wk === state.selectedSourcingWeek;
    if (mode === "range") return isWeekKeyInRange(wk, state.selectedSourcingFromWeek, state.selectedSourcingToWeek);

    const endKey = state.selectedSourcingWeek || "";
    const rollingKeys = endKey ? getRollingWeekKeys(endKey, 4) : [];
    return rollingKeys.includes(wk);
  }

  function getSourcingWindowWeekKeys() {
    const mode = state.selectedSourcingWeekMode || "rolling";

    if (mode === "all") return "all";
    if (mode === "week") return state.selectedSourcingWeek ? [state.selectedSourcingWeek] : [];
    if (mode === "range") {
      const options = state.sourcingOptions || [];
      return options.map(o => o.key).filter(key =>
        isWeekKeyInRange(key, state.selectedSourcingFromWeek, state.selectedSourcingToWeek)
      );
    }

    const endKey = state.selectedSourcingWeek || "";
    return endKey ? getRollingWeekKeys(endKey, 4) : [];
  }

  function updateSourcingFilters() {
    const rows = state.sourcingRows || [];
    const currentRole = state.selectedSourcingRole || "all";
    const currentRecruiter = state.selectedSourcingRecruiter || "all";

    const baseRows = rows.filter(r => isSourcingWeekInWindow(r));

    const roles = getOrderedValues(
      baseRows.filter(r => {
        if (currentRecruiter !== "all" && r.recruiter !== currentRecruiter) return false;
        return true;
      }),
      "all",
      r => r.role
    );

    setFilterOptions($("sourcingRoleSelect"), roles, "All roles");
    if (currentRole !== "all" && !roles.includes(currentRole)) {
      const el = $("sourcingRoleSelect");
      if (el) el.value = "all";
    }
    state.selectedSourcingRole = $("sourcingRoleSelect") ? $("sourcingRoleSelect").value : "all";

    const recruiters = getOrderedValues(
      baseRows.filter(r => {
        if (state.selectedSourcingRole !== "all" && r.role !== state.selectedSourcingRole) return false;
        return true;
      }),
      "all",
      r => r.recruiter
    );

    setFilterOptions($("sourcingRecruiterSelect"), recruiters, "All recruiters");
    if (currentRecruiter !== "all" && !recruiters.includes(currentRecruiter)) {
      const el = $("sourcingRecruiterSelect");
      if (el) el.value = "all";
    }
    state.selectedSourcingRecruiter = $("sourcingRecruiterSelect") ? $("sourcingRecruiterSelect").value : "all";
  }

  function renderSourcing() {
    const rows = state.sourcingRows || [];
    const mode = state.selectedSourcingWeekMode || "rolling";
    const selectedRole = state.selectedSourcingRole || "all";
    const selectedRecruiter = state.selectedSourcingRecruiter || "all";

    const filtered = rows.filter(r => {
      if (!isSourcingWeekInWindow(r)) return false;
      if (selectedRole !== "all" && r.role !== selectedRole) return false;
      if (selectedRecruiter !== "all" && r.recruiter !== selectedRecruiter) return false;
      return true;
    });

    const tbody = $("sourcingTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const thead = document.querySelector("#sourcing table thead");
    if (thead) {
      const convLabel = mode === "all" ? "Conv. (all)" : mode === "range" ? "Conv. (range)" : "Conv. (4w)";
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
      const role = r.role;
      if (!role || seen.has(role)) return;

      const hasData =
        num(r.sourced) > 0 ||
        num(r.connect) > 0 ||
        num(r.sourced_screens) > 0 ||
        num(r.connect_screens) > 0;

      if (!shouldShowRoleOutsideOverview(role, hasData)) return;

      seen.add(role);
      roleOrder.push(role);
    });

    roleOrder.forEach(role => {
      const agg = byRole.get(role) || { sourced: 0, sourcedScreens: 0, connect: 0, connectScreens: 0 };
      const sourcedConv = agg.sourced > 0 ? agg.sourcedScreens / agg.sourced : null;
      const connectConv = agg.connect > 0 ? agg.connectScreens / agg.connect : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td class="num ${getNumberClass(agg.sourced)}">${formatNumber(agg.sourced)}</td>
        <td class="num ${getNumberClass(agg.sourcedScreens)}">${formatNumber(agg.sourcedScreens)}</td>
        <td class="num ${getNumberClass(sourcedConv)}">${formatPercent(sourcedConv)}</td>
        <td class="num ${getNumberClass(agg.connect)}">${formatNumber(agg.connect)}</td>
        <td class="num ${getNumberClass(agg.connectScreens)}">${formatNumber(agg.connectScreens)}</td>
        <td class="num ${getNumberClass(connectConv)}">${formatPercent(connectConv)}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallSourcedConv = totalSourced > 0 ? totalSourcedScreens / totalSourced : null;
    const overallConnectConv = totalConnect > 0 ? totalConnectScreens / totalConnect : null;

    let convLabel = "4-week conversion";
    if (mode === "all") convLabel = "All-time conversion";
    if (mode === "range") convLabel = "Range conversion";

    const summary = $("sourcingSummary");
    if (summary) {
      summary.innerHTML = `
        <div class="kpi"><div class="label">Total Sourced</div><div class="value">${formatNumber(totalSourced)}</div></div>
        <div class="kpi"><div class="label">Sourced Screens</div><div class="value">${formatNumber(totalSourcedScreens)}</div><div class="sub">${formatPercent(overallSourcedConv)} ${convLabel}</div></div>
        <div class="kpi"><div class="label">Total Connects</div><div class="value">${formatNumber(totalConnect)}</div></div>
        <div class="kpi"><div class="label">Connect Screens</div><div class="value">${formatNumber(totalConnectScreens)}</div><div class="sub">${formatPercent(overallConnectConv)} ${convLabel}</div></div>
      `;
    }
  }

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
    const kpis = $("hiresKpis");

    if (!tbody || !empty || !kpis) return;

    tbody.innerHTML = "";

    if (!rows.length) empty.classList.remove("hidden");
    else empty.classList.add("hidden");

  const tthValues = [];
const ttfValues = [];
const dipValues = [];

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
if (daysInProcess !== null) dipValues.push(daysInProcess);

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
const avgDip = average(dipValues);

    kpis.innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(rows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg Days in Process</div><div class="value">${avgDip !== null ? avgDip.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Scope</div><div class="value">All time</div></div>
    `;
  }
    /* ---------------- MANAGEMENT ---------------- */

  function renderManagement() {
    const overviewRows = state.allOverviewRows || [];
    const hiredRows = state.hiredRows || [];
    const weeklyRows = state.allPipelineWeeklyRows || [];
    const inventoryRows = state.allPipelineInventoryRows || [];
    const roleNotesRows = state.roleNotesRows || [];
    const weeklyUpdatesRows = state.weeklyUpdatesRows || [];

    const selectedRole = state.selectedActivityRole || "all";
    const selectedRecruiter = state.selectedActivityRecruiter || "all";
    const selectedActivityWeek = state.selectedActivityWeek || "";

   const healthByRole = {};
(overviewRows || []).forEach(r => {
  const role = getField(r, ["role"]);
  if (!role) return;
  healthByRole[role] = normalizeHealthValue(getField(r, ["health"])) || "unknown";
});

    let filledPositions = 0;
    const hiresByRole = {};
    (hiredRows || []).forEach(r => {
      const role = getField(r, ["role"]);
      const signatureDate = getField(r, ["signature_date", "signature date"]);
      const startDate = getField(r, ["start_date", "start date"]);
      if (!role) return;
      if (!signatureDate && !startDate) return;
      hiresByRole[role] = (hiresByRole[role] || 0) + 1;
      filledPositions += 1;
    });

    const remainingOpeningsByRole = {};
    (overviewRows || []).forEach(r => {
      const role = String(getField(r, ["role"]) || "").trim();
      if (!role) return;
      const baseOpenings = num(getField(r, ["openings"]));
      const remaining = Math.max(0, baseOpenings - (hiresByRole[role] || 0));
      remainingOpeningsByRole[role] = remaining;
    });

    const onHoldRoles = overviewRows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      return status === "on_hold" || status === "onhold" || status.includes("hold");
    }).length;

    const openRoles = overviewRows.filter(r => {
      const status = normalizeHeader(getField(r, ["status"]));
      if (status !== "open") return false;
      const role = getField(r, ["role"]);
      const remaining = remainingOpeningsByRole[role] ?? num(getField(r, ["openings"]));
      return remaining > 0;
    }).length;

    const totalOpenings = overviewRows.reduce((sum, r) => {
      const status = normalizeHeader(getField(r, ["status"]));
      if (!(status === "open" || status === "on_hold" || status === "onhold" || status.includes("hold"))) return sum;
      const role = getField(r, ["role"]);
      const remaining = remainingOpeningsByRole[role] ?? num(getField(r, ["openings"]));
      return sum + remaining;
    }, 0);

    const kpisEl = $("managementKpis");
    if (kpisEl) {
      kpisEl.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${formatNumber(openRoles)}</div></div>
        <div class="kpi"><div class="label">On hold</div><div class="value">${formatNumber(onHoldRoles)}</div></div>
        <div class="kpi"><div class="label">Filled Positions</div><div class="value">${formatNumber(filledPositions)}</div><div class="sub">All time${hiredRows.length ? "" : " · No hire data yet."}</div></div>
        <div class="kpi"><div class="label">Total Openings</div><div class="value">${formatNumber(totalOpenings)}</div></div>
      `;
    }

const counts = state.overviewHealthCounts || {
  healthy: 0,
  warning: 0,
  critical: 0
};

    const hsEl = $("managementHealthSummary");
    if (hsEl) {
      hsEl.innerHTML = `
        <div class="health-badge good"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
        <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.warning} Attention</span></div>
        <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.critical} Action</span></div>
      `;
    }

    renderManagementRecruiters({ weeklyRows });
    renderManagementRoleInsights({
      roleNotesRows,
      selectedActivityWeek,
      selectedRole,
      selectedRecruiter,
      healthByRole
    });
    renderManagementWeeklyUpdates({ weeklyUpdatesRows, selectedRole });
    renderManagementForecast({ inventoryRows, overviewRows, hiredRows, weeklyRows });
  }

  function renderManagementRecruiters({ weeklyRows }) {
    const tbody = $("managementRecruiterTable");
    const empty = $("managementRecruiterEmpty");
    if (!tbody || !empty) return;

    const rows = weeklyRows || [];
    const totalsByRecruiter = new Map();
    const weekCountByRecruiter = new Map();

    rows.forEach(r => {
      const recruiter = (r.recruiter || "Unassigned").trim() || "Unassigned";
      const wk = weekKey(r);
      if (!wk) return;

      if (!totalsByRecruiter.has(recruiter)) {
        totalsByRecruiter.set(recruiter, { step1: 0 });
        weekCountByRecruiter.set(recruiter, new Set());
      }

      const stage = normalizeHealthStage(r.stage);
      if (stage !== "step1") return;

      const agg = totalsByRecruiter.get(recruiter);
      agg.step1 += num(r.count);
      weekCountByRecruiter.get(recruiter).add(wk);
    });

    tbody.innerHTML = "";
    const rowsOut = Array.from(totalsByRecruiter.entries());

    if (!rowsOut.length) {
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");

    rowsOut.forEach(([recruiter, data]) => {
      const weeksSet = weekCountByRecruiter.get(recruiter) || new Set();
      const weeksCount = weeksSet.size || 0;
      const avgStep1 = weeksCount > 0 ? data.step1 / weeksCount : null;
      const utilizationBase = avgStep1 || 0;
      const utilization = Math.round((utilizationBase / 15) * 100);
      const barWidth = `${Math.max(0, Math.min(100, utilization))}%`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${recruiter}</td>
        <td class="num ${getNumberClass(data.step1)}">${formatNumber(data.step1)}</td>
        <td class="num ${getNumberClass(avgStep1)}">${avgStep1 === null ? "—" : avgStep1.toFixed(1)}</td>
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
        addNotes(r.highlights || r.big_wins, "highlights");
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
      const healthLabel =
        card.health === "warning" ? "At risk" :
        card.health === "critical" ? "Critical" :
        card.health === "healthy" ? "Healthy" : "Unknown";

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

  function renderManagementForecast({ inventoryRows, overviewRows, hiredRows, weeklyRows }) {
    const container = $("managementForecast");
    const roleSelect = $("managementForecastRoleSelect");
    const recruiterSelect = $("managementForecastRecruiterSelect");
    const departmentSelect = $("managementForecastDepartmentSelect");

    if (!container || !roleSelect || !recruiterSelect || !departmentSelect) return;

    let invWeekKey = "";
    const invWeekSet = new Set();

    (inventoryRows || []).forEach(r => {
      const k = weekKey(r);
      if (k) invWeekSet.add(k);
    });

    const invWeeksSorted = Array.from(invWeekSet).sort().reverse();
    invWeekKey = invWeeksSorted[0] || TODAY_WEEK_KEY;

    const selected = state.selectedPipelineWeek || "";
    if (selected && selected !== "all") {
      invWeekKey = selected;
    } else {
      const berlinNow = getDateInTimeZone("Europe/Berlin");
      const day = berlinNow.getUTCDay();
      const isMonThu = day >= 1 && day <= 4;
      if (isMonThu && invWeeksSorted.length >= 2) {
        invWeekKey = invWeeksSorted[1];
      }
    }

    const selectedForecastRecruiter = state.selectedForecastRecruiter || "all";
    const selectedForecastDepartment = state.selectedForecastDepartment || "all";

    function matchesForecastFilters(row) {
      const recruiter = (getField(row, ["recruiter"]) || row.recruiter || "Unassigned").trim() || "Unassigned";
      const department = normalizeDepartmentValue(getField(row, ["department"]) || row.department);

      if (selectedForecastRecruiter !== "all" && recruiter !== selectedForecastRecruiter) return false;
      if (selectedForecastDepartment !== "all" && department !== selectedForecastDepartment) return false;
      return true;
    }

    const recruiterOptions = [];
    const recruiterSeen = new Set();

    (inventoryRows || []).forEach(r => {
      const recruiter = (getField(r, ["recruiter"]) || r.recruiter || "Unassigned").trim() || "Unassigned";
      if (recruiterSeen.has(recruiter)) return;
      recruiterSeen.add(recruiter);
      recruiterOptions.push(recruiter);
    });

    (weeklyRows || []).forEach(r => {
      const recruiter = (getField(r, ["recruiter"]) || r.recruiter || "Unassigned").trim() || "Unassigned";
      if (recruiterSeen.has(recruiter)) return;
      recruiterSeen.add(recruiter);
      recruiterOptions.push(recruiter);
    });

    const departmentOptions = [];
    const departmentSeen = new Set();
    (overviewRows || []).forEach(r => {
      const department = normalizeDepartmentValue(getField(r, ["department"]) || r.department);
      if (!department || departmentSeen.has(department)) return;
      departmentSeen.add(department);
      departmentOptions.push(department);
    });

    setFilterOptions(recruiterSelect, recruiterOptions, "All recruiters");
    setFilterOptions(departmentSelect, departmentOptions, "All departments");

    if (!["all", ...recruiterOptions].includes(state.selectedForecastRecruiter)) {
      state.selectedForecastRecruiter = "all";
    }
    if (!["all", ...departmentOptions].includes(state.selectedForecastDepartment)) {
      state.selectedForecastDepartment = "all";
    }

    recruiterSelect.value = state.selectedForecastRecruiter;
    departmentSelect.value = state.selectedForecastDepartment;

    const rollingKeys = new Set(getRollingWeekKeys(invWeekKey, 4));
    const step1RollingByRole = new Map();

    (weeklyRows || []).forEach(r => {
      const wk = weekKey(r);
      if (!wk || !rollingKeys.has(wk)) return;
      if (!matchesForecastFilters(r)) return;

      const role = String(getField(r, ["role"]) || r.role || "").trim();
      if (!role) return;

      const stageRaw = getField(r, ["stage"]) || r.stage;
      if (!stageRaw) return;

      const stage = normalizeHealthStage(stageRaw);
      if (stage !== "step1") return;

      const c = num(getField(r, ["count"]) || r.count);
      step1RollingByRole.set(role, (step1RollingByRole.get(role) || 0) + c);
    });

    function stageBucket(stageRaw) {
      const s = normalizeStageValue(stageRaw);
      const collapsed = s.replace(/_/g, "");

      if (s.includes("offer")) return "offer";
      if (s.includes("final")) return "final";
      if (collapsed === "step1" || s.includes("first_interview") || s.includes("1st_interview")) return "step1";

      return "other";
    }

    const hiresByRole = {};
    (hiredRows || []).forEach(r => {
      const role = String(getField(r, ["role"]) || "").trim();
      if (!role) return;

      const signatureDate = getField(r, ["signature_date", "signature date"]);
      const startDate = getField(r, ["start_date", "start date"]);
      if (!signatureDate && !startDate) return;

      hiresByRole[role] = (hiresByRole[role] || 0) + 1;
    });

    const remainingOpeningsByRole = {};
    (overviewRows || []).forEach(r => {
      if (!matchesForecastFilters(r)) return;

      const role = String(getField(r, ["role"]) || "").trim();
      if (!role) return;

      const baseOpenings = num(getField(r, ["openings"]));
      remainingOpeningsByRole[role] = Math.max(0, baseOpenings - (hiresByRole[role] || 0));
    });

    const aggByRole = new Map();

    (inventoryRows || []).forEach(r => {
      if (!isWeekMatch(r, invWeekKey)) return;
      if (!matchesForecastFilters(r)) return;

      const role = String(getField(r, ["role"]) || r.role || "").trim();
      if (!role) return;

      const stageRaw = getField(r, ["stage"]) || r.stage;
      if (!stageRaw) return;

      const bucket = stageBucket(stageRaw);
      const c = num(getField(r, ["count"]) || r.count);

      if (!aggByRole.has(role)) aggByRole.set(role, { step1: 0, final: 0, offer: 0 });
      const a = aggByRole.get(role);

      if (bucket === "step1") a.step1 += c;
      else if (bucket === "final") a.final += c;
      else if (bucket === "offer") a.offer += c;
    });

    const roleList = [];
    const seen = new Set();

    (overviewRows || []).forEach(r => {
      if (!matchesForecastFilters(r)) return;

      const role = String(getField(r, ["role"]) || "").trim();
      if (!role || seen.has(role)) return;

      const a = aggByRole.get(role) || { step1: 0, final: 0, offer: 0 };
      const rollingStep1 = num(step1RollingByRole.get(role) || 0);
      const hasData = rollingStep1 > 0 || a.final > 0 || a.offer > 0;

      if (!shouldShowRoleOutsideOverview(role, hasData)) return;

      seen.add(role);
      roleList.push(role);
    });

    if (!state.selectedForecastRole) state.selectedForecastRole = "all";
    if (state.selectedForecastRole !== "all" && !roleList.includes(state.selectedForecastRole)) {
      state.selectedForecastRole = "all";
    }

    {
      const current = state.selectedForecastRole || "all";
      roleSelect.innerHTML = "";

      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "All roles";
      roleSelect.appendChild(optAll);

      roleList.forEach(role => {
        const opt = document.createElement("option");
        opt.value = role;
        opt.textContent = role;
        roleSelect.appendChild(opt);
      });

      const allowed = new Set(["all", ...roleList]);
      roleSelect.value = allowed.has(current) ? current : "all";
      state.selectedForecastRole = roleSelect.value;
    }

    function pillClass(conf) {
      if (conf >= 0.90) return "good";
      if (conf >= 0.60) return "warn";
      return "bad";
    }

    function labelForConfidence(conf) {
      if (conf >= 0.90) return "High";
      if (conf >= 0.60) return "Medium";
      if (conf > 0.10) return "Low";
      return "Very Low";
    }

    function computeForRole(role) {
      const remaining = remainingOpeningsByRole[role] !== undefined ? remainingOpeningsByRole[role] : 0;
      const a = aggByRole.get(role) || { step1: 0, final: 0, offer: 0 };
      const rollingStep1 = num(step1RollingByRole.get(role) || 0);

      const expectedFromStep1 = rollingStep1 / 25;
      const expectedFromFinals = num(a.final) * 0.75;
      const expectedFromOffers = num(a.offer) * 0.9;
      const expectedRaw = expectedFromStep1 + expectedFromFinals + expectedFromOffers;
      const expected = Math.min(remaining, expectedRaw);

      let conf = 0.07;
      const anyPipeline = rollingStep1 > 0 || a.final > 0 || a.offer > 0;

      if (a.offer >= remaining && remaining > 0) conf = 0.98;
      else if (a.offer > 0) conf = 0.95;
      else if (a.final >= Math.max(2, remaining)) conf = 0.92;
      else if (a.final >= 2) conf = 0.88;
      else if (a.final >= 1) conf = 0.78;
      else if (rollingStep1 >= 25) conf = 0.85;
      else if (rollingStep1 >= 20) conf = 0.78;
      else if (rollingStep1 >= 15) conf = 0.70;
      else if (rollingStep1 >= 10) conf = 0.58;
      else if (rollingStep1 >= 5) conf = 0.42;
      else if (anyPipeline) conf = 0.30;

      return {
        step1: rollingStep1,
        finals: a.final,
        offers: a.offer,
        expected,
        conf
      };
    }

    function computeAll() {
      const out = { step1: 0, finals: 0, offers: 0, expected: 0, conf: null };

      roleList.forEach(role => {
        const r = computeForRole(role);
        out.step1 += r.step1;
        out.finals += r.finals;
        out.offers += r.offers;
        out.expected += r.expected;
      });

      out.conf = null;
      return out;
    }

    const selectedRole = state.selectedForecastRole || "all";
    const result = selectedRole === "all" ? computeAll() : computeForRole(selectedRole);
    if (selectedRole === "all") result.conf = null;

    const scopeParts = [];
    if (selectedForecastDepartment !== "all") scopeParts.push(selectedForecastDepartment);
    if (selectedForecastRecruiter !== "all") scopeParts.push(selectedForecastRecruiter);
    if (selectedRole !== "all") scopeParts.push(selectedRole);
    const scope = scopeParts.length ? scopeParts.join(" · ") : "All roles";

    const confCell = result.conf === null
      ? "—"
      : `<span class="pill ${pillClass(result.conf)}">${labelForConfidence(result.conf)} · ${Math.round(result.conf * 100)}%</span>`;

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scope</th>
              <th class="num">Step1 (4W)</th>
              <th class="num">Finals (KW)</th>
              <th class="num">Offers (KW)</th>
              <th class="num">Expected hires</th>
              <th class="center">Confidence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${scope}</td>
              <td class="num ${getNumberClass(result.step1)}">${formatNumber(result.step1)}</td>
              <td class="num ${getNumberClass(result.finals)}">${formatNumber(result.finals)}</td>
              <td class="num ${getNumberClass(result.offers)}">${formatNumber(result.offers)}</td>
              <td class="num ${getNumberClass(result.expected)}">~${Number(result.expected).toFixed(1)}</td>
              <td class="center">${confCell}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  /* ---------------- VIEW ---------------- */

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
    function getSelectValue(id, fallback = "") {
      const el = $(id);
      return el && typeof el.value !== "undefined" ? el.value : fallback;
    }

    const prev = {
      pipelineWeek: getSelectValue("pipelineWeekSelect", state.selectedPipelineWeek || ""),

      activityWeekMode: getSelectValue("activityWeekModeSelect", state.selectedActivityWeekMode || "week"),
      activityWeek: getSelectValue("activityWeekSelect", state.selectedActivityWeek || ""),
      activityFromWeek: getSelectValue("activityFromWeekSelect", state.selectedActivityFromWeek || ""),
      activityToWeek: getSelectValue("activityToWeekSelect", state.selectedActivityToWeek || ""),

      sourcingWeekMode: getSelectValue("sourcingWeekModeSelect", state.selectedSourcingWeekMode || "rolling"),
      sourcingWeek: getSelectValue("sourcingWeekSelect", state.selectedSourcingWeek || ""),
      sourcingFromWeek: getSelectValue("sourcingFromWeekSelect", state.selectedSourcingFromWeek || ""),
      sourcingToWeek: getSelectValue("sourcingToWeekSelect", state.selectedSourcingToWeek || ""),

      managementWeek: getSelectValue("managementWeekSelect", state.selectedManagementWeek || "all"),
      managementQuarter: getSelectValue("managementQuarterSelect", state.selectedManagementQuarter || ""),
      pipelineRecruiter: getSelectValue("pipelineRecruiterSelect", state.selectedPipelineRecruiter || "all"),
      activityRole: getSelectValue("activityRoleSelect", state.selectedActivityRole || "all"),
      activityRecruiter: getSelectValue("activityRecruiterSelect", state.selectedActivityRecruiter || "all"),
      sourcingRole: getSelectValue("sourcingRoleSelect", state.selectedSourcingRole || "all"),
      sourcingRecruiter: getSelectValue("sourcingRecruiterSelect", state.selectedSourcingRecruiter || "all"),
      forecastRole: getSelectValue("managementForecastRoleSelect", state.selectedForecastRole || "all"),
      forecastRecruiter: getSelectValue("managementForecastRecruiterSelect", state.selectedForecastRecruiter || "all"),
      forecastDepartment: getSelectValue("managementForecastDepartmentSelect", state.selectedForecastDepartment || "all")
    };

    state.selectedForecastRole = prev.forecastRole || state.selectedForecastRole || "all";
    state.selectedForecastRecruiter = prev.forecastRecruiter || state.selectedForecastRecruiter || "all";
    state.selectedForecastDepartment = prev.forecastDepartment || state.selectedForecastDepartment || "all";

    const berlinDate = getDateInTimeZone("Europe/Berlin");
    const currentYear = berlinDate.getUTCFullYear();
    const currentQuarter = getQuarterForMonth(berlinDate.getUTCMonth());

    state.pipelineOptions = getWeekOptions(
      (state.pipelineInventoryRows && state.pipelineInventoryRows.length)
        ? state.pipelineInventoryRows
        : (state.pipelineWeeklyRows || [])
    );

    state.activityOptions = getWeekOptions(state.pipelineWeeklyRows || []);
    state.sourcingOptions = getWeekOptions(state.sourcingRows || []);

    setSelectOptions($("pipelineWeekSelect"), state.pipelineOptions, false);

    setModeOptions($("activityWeekModeSelect"), [
      { value: "week", label: "Single week" },
      { value: "range", label: "Custom range" },
      { value: "all", label: "All time" }
    ], "week");

    setSelectOptions($("activityWeekSelect"), state.activityOptions, false);
    setSelectOptions($("activityFromWeekSelect"), state.activityOptions, false);
    setSelectOptions($("activityToWeekSelect"), state.activityOptions, false);

    setModeOptions($("sourcingWeekModeSelect"), [
      { value: "rolling", label: "Rolling 4 weeks" },
      { value: "range", label: "Custom range" },
      { value: "all", label: "All time" }
    ], "rolling");

    setSourcingWeekOptions($("sourcingWeekSelect"), state.sourcingOptions);
    setSelectOptions($("sourcingFromWeekSelect"), state.sourcingOptions, false);
    setSelectOptions($("sourcingToWeekSelect"), state.sourcingOptions, false);

    const managementOptions = getWeekOptions(state.pipelineWeeklyRows || []);
    setSelectOptions($("managementWeekSelect"), managementOptions, true);

    const pipelineAllowed = (state.pipelineOptions || []).map(o => o.key);
    const activityAllowed = ["all"].concat((state.activityOptions || []).map(o => o.key));
    const sourcingAllowed = ["all"].concat((state.sourcingOptions || []).map(o => o.key));
    const managementAllowed = ["all"].concat((managementOptions || []).map(o => o.key));

    if (prev.pipelineWeek && pipelineAllowed.includes(prev.pipelineWeek)) {
      state.selectedPipelineWeek = prev.pipelineWeek;
    } else {
      state.selectedPipelineWeek =
        pickPreferredWeekKey(state.pipelineOptions, PREFERRED_KW, PREFERRED_YEAR) ||
        ((state.pipelineOptions[0] && state.pipelineOptions[0].key) ? state.pipelineOptions[0].key : "") ||
        "";
    }

    state.selectedActivityWeekMode = ["week", "range", "all"].includes(prev.activityWeekMode)
      ? prev.activityWeekMode
      : "week";

    state.selectedActivityWeek =
      (prev.activityWeek && activityAllowed.includes(prev.activityWeek))
        ? prev.activityWeek
        : (
          pickPreferredWeekKey(state.activityOptions, PREFERRED_KW, PREFERRED_YEAR) ||
          ((state.activityOptions[0] && state.activityOptions[0].key) ? state.activityOptions[0].key : "")
        );

    state.selectedActivityFromWeek =
      (prev.activityFromWeek && activityAllowed.includes(prev.activityFromWeek))
        ? prev.activityFromWeek
        : (state.activityOptions[state.activityOptions.length - 1]?.key || state.selectedActivityWeek || "");

    state.selectedActivityToWeek =
      (prev.activityToWeek && activityAllowed.includes(prev.activityToWeek))
        ? prev.activityToWeek
        : (state.selectedActivityWeek || state.activityOptions[0]?.key || "");

    state.selectedSourcingWeekMode = ["rolling", "range", "all"].includes(prev.sourcingWeekMode)
      ? prev.sourcingWeekMode
      : "rolling";

    state.selectedSourcingWeek =
      (prev.sourcingWeek && sourcingAllowed.includes(prev.sourcingWeek))
        ? prev.sourcingWeek
        : (
          pickPreferredWeekKey(state.sourcingOptions, PREFERRED_KW, PREFERRED_YEAR) ||
          ((state.sourcingOptions[0] && state.sourcingOptions[0].key) ? state.sourcingOptions[0].key : "")
        );

    state.selectedSourcingFromWeek =
      (prev.sourcingFromWeek && sourcingAllowed.includes(prev.sourcingFromWeek))
        ? prev.sourcingFromWeek
        : (state.sourcingOptions[state.sourcingOptions.length - 1]?.key || state.selectedSourcingWeek || "");

    state.selectedSourcingToWeek =
      (prev.sourcingToWeek && sourcingAllowed.includes(prev.sourcingToWeek))
        ? prev.sourcingToWeek
        : (state.selectedSourcingWeek || state.sourcingOptions[0]?.key || "");

    if (prev.managementWeek && managementAllowed.includes(prev.managementWeek)) {
      state.selectedManagementWeek = prev.managementWeek;
    } else {
      state.selectedManagementWeek =
        pickPreferredWeekKey(managementOptions, PREFERRED_KW, PREFERRED_YEAR) ||
        ((managementOptions[0] && managementOptions[0].key) ? managementOptions[0].key : "all") ||
        "all";
    }

    if (prev.managementQuarter) {
      state.selectedManagementQuarter = prev.managementQuarter;
    } else if (
      !state.selectedManagementQuarter ||
      !String(state.selectedManagementQuarter).startsWith(String(currentYear) + "-Q")
    ) {
      state.selectedManagementQuarter = getQuarterLabel(currentYear, currentQuarter);
    }

    setManagementQuarterOptions($("managementQuarterSelect"), currentYear, currentQuarter);

    const mq = $("managementQuarterSelect");
    if (mq) mq.value = state.selectedManagementQuarter;

    setOverviewDepartmentOptions($("overviewDepartmentSelect"), state.departmentOptions);

    updatePipelineFilters();
    updateActivityFilters();
    updateSourcingFilters();

    const awm = $("activityWeekModeSelect");
    if (awm) awm.value = state.selectedActivityWeekMode;

    const aws = $("activityWeekSelect");
    if (aws) aws.value = state.selectedActivityWeek;

    const awf = $("activityFromWeekSelect");
    if (awf) awf.value = state.selectedActivityFromWeek;

    const awt = $("activityToWeekSelect");
    if (awt) awt.value = state.selectedActivityToWeek;

    const swm = $("sourcingWeekModeSelect");
    if (swm) swm.value = state.selectedSourcingWeekMode;

    const sws = $("sourcingWeekSelect");
    if (sws) sws.value = state.selectedSourcingWeek;

    const swf = $("sourcingFromWeekSelect");
    if (swf) swf.value = state.selectedSourcingFromWeek;

    const swt = $("sourcingToWeekSelect");
    if (swt) swt.value = state.selectedSourcingToWeek;

    updateActivityWeekModeUI();
    updateSourcingWeekModeUI();

    const pr = $("pipelineRecruiterSelect");
    if (pr) pr.value = prev.pipelineRecruiter;

    const ar = $("activityRoleSelect");
    if (ar) ar.value = prev.activityRole;

    const acr = $("activityRecruiterSelect");
    if (acr) acr.value = prev.activityRecruiter;

    const sr = $("sourcingRoleSelect");
    if (sr) sr.value = prev.sourcingRole;

    const scr = $("sourcingRecruiterSelect");
    if (scr) scr.value = prev.sourcingRecruiter;

    state.selectedPipelineRecruiter = getSelectValue("pipelineRecruiterSelect", state.selectedPipelineRecruiter || "all");
    state.selectedActivityRole = getSelectValue("activityRoleSelect", state.selectedActivityRole || "all");
    state.selectedActivityRecruiter = getSelectValue("activityRecruiterSelect", state.selectedActivityRecruiter || "all");
    state.selectedSourcingRole = getSelectValue("sourcingRoleSelect", state.selectedSourcingRole || "all");
    state.selectedSourcingRecruiter = getSelectValue("sourcingRecruiterSelect", state.selectedSourcingRecruiter || "all");

    const fr = $("managementForecastRoleSelect");
    if (fr) fr.value = state.selectedForecastRole || "all";

    const frr = $("managementForecastRecruiterSelect");
    if (frr) frr.value = state.selectedForecastRecruiter || "all";

    const fd = $("managementForecastDepartmentSelect");
    if (fd) fd.value = state.selectedForecastDepartment || "all";
  }

  function renderAll() {
    if (!state.selectedDepartment) return;
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires();
    renderManagement();
  }

  /* ---------------- DATA LOAD ---------------- */

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
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

      state.allOverviewRows = overviewRows || [];
      state.roleStatusByRole = {};
      (state.allOverviewRows || []).forEach(r => {
        const role = String(getField(r, ["role"]) || "").trim();
        if (!role) return;
        const status = normalizeHeader(getField(r, ["status"]));
        state.roleStatusByRole[role] = status;
      });

      const pipelineWeeklyRows = pipelineWeeklyRaw?.rows || pipelineWeeklyRaw || [];
      const pipelineWeeklyHeaders = pipelineWeeklyRaw?.headers || [];

      state.allPipelineWeeklyRows = normalizePipelineWeekly(pipelineWeeklyRows, pipelineWeeklyHeaders);
      state.allPipelineInventoryRows = normalizePipelineInventory(pipelineInventoryRaw || []);
      state.allSourcingRows = normalizeSourcing(sourcingRaw || []);
      state.allHiredRows = hiredRaw || [];
      state.roleTargets = normalizeTargets(targetsRaw || []);
      state.allRoleNotesRows = normalizeRoleNotes(roleNotesRaw || []);
      state.allWeeklyUpdatesRows = normalizeWeeklyUpdates(weeklyUpdatesRaw || []);

      state.departmentOptions = buildDepartmentOptions({
        overviewRows: state.allOverviewRows,
        pipelineWeeklyRows: state.allPipelineWeeklyRows,
        pipelineInventoryRows: state.allPipelineInventoryRows,
        sourcingRows: state.allSourcingRows,
        hiredRows: state.allHiredRows,
        roleNotesRows: state.allRoleNotesRows,
        weeklyUpdatesRows: state.allWeeklyUpdatesRows
      });

      const storedDepartment = localStorage.getItem(DEPARTMENT_STORAGE_KEY);
      const storedMatch = state.departmentOptions.find(
        option => option.toLowerCase() === String(storedDepartment || "").toLowerCase()
      );

      const defaultDepartment = storedMatch || "all";

   const departmentSelectTop = $("departmentSelectTop");
const pipelineDepartmentSelect = $("pipelineDepartmentSelect");
const activityDepartmentSelect = $("activityDepartmentSelect");
const sourcingDepartmentSelect = $("sourcingDepartmentSelect");
const hiresDepartmentSelect = $("hiresDepartmentSelect");

if (departmentSelectTop) setDepartmentOptions(departmentSelectTop, state.departmentOptions, defaultDepartment);
if (pipelineDepartmentSelect) setDepartmentOptions(pipelineDepartmentSelect, state.departmentOptions, defaultDepartment);
if (activityDepartmentSelect) setDepartmentOptions(activityDepartmentSelect, state.departmentOptions, defaultDepartment);
if (sourcingDepartmentSelect) setDepartmentOptions(sourcingDepartmentSelect, state.departmentOptions, defaultDepartment);
if (hiresDepartmentSelect) setDepartmentOptions(hiresDepartmentSelect, state.departmentOptions, defaultDepartment);

      state.selectedDepartment = defaultDepartment;
      if (state.selectedDepartment) {
        localStorage.setItem(DEPARTMENT_STORAGE_KEY, state.selectedDepartment);
      }

      applyDepartmentSelection();
      syncWeekSelections();
      renderAll();

      const last = $("lastUpdated");
      if (last) last.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- EVENT HANDLERS ---------------- */

  function handlePipelineWeekChange() {
    state.selectedPipelineWeek = $("pipelineWeekSelect") ? $("pipelineWeekSelect").value : "";
    updatePipelineFilters();
    renderOverview();
    renderPipeline();
    renderManagement();
  }

  function handleActivityRoleChange() {
    state.selectedActivityRole = $("activityRoleSelect") ? $("activityRoleSelect").value : "all";
    updateActivityFilters();
    renderActivity();
    renderManagement();
  }

  function handleActivityRecruiterChange() {
    state.selectedActivityRecruiter = $("activityRecruiterSelect") ? $("activityRecruiterSelect").value : "all";
    updateActivityFilters();
    renderActivity();
    renderManagement();
  }

  function handleSourcingRoleChange() {
    state.selectedSourcingRole = $("sourcingRoleSelect") ? $("sourcingRoleSelect").value : "all";
    renderSourcing();
  }

  function handleSourcingRecruiterChange() {
    state.selectedSourcingRecruiter = $("sourcingRecruiterSelect") ? $("sourcingRecruiterSelect").value : "all";
    renderSourcing();
  }

  function handleManagementWeekChange() {
    state.selectedManagementWeek = $("managementWeekSelect") ? $("managementWeekSelect").value : "all";
    renderManagement();
  }

  function handleManagementQuarterChange() {
    state.selectedManagementQuarter = $("managementQuarterSelect") ? $("managementQuarterSelect").value : state.selectedManagementQuarter;
    renderManagement();
  }

  function handleDepartmentChange(fromId = "departmentSelectTop") {
    const fromEl = $(fromId);
    const selected = fromEl ? fromEl.value : "";
    if (!selected) return;

    state.selectedDepartment = selected;
    localStorage.setItem(DEPARTMENT_STORAGE_KEY, selected);

    const ids = ["departmentSelectTop", "pipelineDepartmentSelect", "activityDepartmentSelect", "sourcingDepartmentSelect", "hiresDepartmentSelect"];
    ids.forEach(id => {
      const el = $(id);
      if (el) el.value = selected;
    });

    applyDepartmentSelection();
    syncWeekSelections();
    renderAll();
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  const managementUnlocked = localStorage.getItem(MANAGEMENT_UNLOCK_KEY) === "1";

  if (storedView === "management" && managementUnlocked) {
    state.view = "management";
  } else {
    state.view = "contributor";
  }
  setView(state.view);

  function on(id, evt, handler) {
    const el = $(id);
    if (!el) {
      console.warn(`[bind] Missing element #${id} for event "${evt}"`);
      return;
    }
    el.addEventListener(evt, handler);
  }

  on("viewContributor", "click", () => setView("contributor"));

  on("viewManagement", "click", () => {
    const unlocked = localStorage.getItem(MANAGEMENT_UNLOCK_KEY) === "1";
    if (!unlocked) {
      const input = window.prompt("Enter password to access Management View:");
      if (input !== MANAGEMENT_PASSWORD) return;
      localStorage.setItem(MANAGEMENT_UNLOCK_KEY, "1");
    }
    setView("management");
  });

  on("refreshBtn", "click", refreshAll);

  on("pipelineWeekSelect", "change", handlePipelineWeekChange);
  on("pipelineRecruiterSelect", "change", () => {
    state.selectedPipelineRecruiter = $("pipelineRecruiterSelect") ? $("pipelineRecruiterSelect").value : "all";
    renderPipeline();
    renderManagement();
  });

  on("activityWeekModeSelect", "change", () => {
    state.selectedActivityWeekMode = $("activityWeekModeSelect") ? $("activityWeekModeSelect").value : "week";
    updateActivityWeekModeUI();
    updateActivityFilters();
    renderActivity();
    renderManagement();
  });

  on("activityWeekSelect", "change", () => {
    state.selectedActivityWeek = $("activityWeekSelect") ? $("activityWeekSelect").value : "";
    updateActivityFilters();
    renderActivity();
    renderManagement();
  });

  on("activityFromWeekSelect", "change", () => {
    state.selectedActivityFromWeek = $("activityFromWeekSelect") ? $("activityFromWeekSelect").value : "";
    updateActivityFilters();
    renderActivity();
    renderManagement();
  });

  on("activityToWeekSelect", "change", () => {
    state.selectedActivityToWeek = $("activityToWeekSelect") ? $("activityToWeekSelect").value : "";
    updateActivityFilters();
    renderActivity();
    renderManagement();
  });

  on("overviewDepartmentSelect", "change", () => {
    state.selectedOverviewDepartment = $("overviewDepartmentSelect") ? $("overviewDepartmentSelect").value : "all";
    renderOverview();
  });

  on("sourcingWeekModeSelect", "change", () => {
    state.selectedSourcingWeekMode = $("sourcingWeekModeSelect") ? $("sourcingWeekModeSelect").value : "rolling";
    updateSourcingWeekModeUI();
    updateSourcingFilters();
    renderSourcing();
  });

  on("sourcingWeekSelect", "change", () => {
    state.selectedSourcingWeek = $("sourcingWeekSelect") ? $("sourcingWeekSelect").value : "";
    updateSourcingFilters();
    renderSourcing();
  });

  on("sourcingFromWeekSelect", "change", () => {
    state.selectedSourcingFromWeek = $("sourcingFromWeekSelect") ? $("sourcingFromWeekSelect").value : "";
    updateSourcingFilters();
    renderSourcing();
  });

  on("sourcingToWeekSelect", "change", () => {
    state.selectedSourcingToWeek = $("sourcingToWeekSelect") ? $("sourcingToWeekSelect").value : "";
    updateSourcingFilters();
    renderSourcing();
  });

  on("activityRoleSelect", "change", handleActivityRoleChange);
  on("activityRecruiterSelect", "change", handleActivityRecruiterChange);
  on("sourcingRoleSelect", "change", handleSourcingRoleChange);
  on("sourcingRecruiterSelect", "change", handleSourcingRecruiterChange);
  on("managementWeekSelect", "change", handleManagementWeekChange);
  on("managementQuarterSelect", "change", handleManagementQuarterChange);

  on("managementForecastRoleSelect", "change", () => {
    state.selectedForecastRole = $("managementForecastRoleSelect") ? $("managementForecastRoleSelect").value : "all";
    renderManagement();
  });

  on("managementForecastRecruiterSelect", "change", () => {
    state.selectedForecastRecruiter = $("managementForecastRecruiterSelect") ? $("managementForecastRecruiterSelect").value : "all";
    renderManagement();
  });

  on("managementForecastDepartmentSelect", "change", () => {
    state.selectedForecastDepartment = $("managementForecastDepartmentSelect") ? $("managementForecastDepartmentSelect").value : "all";
    renderManagement();
  });

 on("departmentSelectTop", "change", () => handleDepartmentChange("departmentSelectTop"));
on("pipelineDepartmentSelect", "change", () => handleDepartmentChange("pipelineDepartmentSelect"));
on("activityDepartmentSelect", "change", () => handleDepartmentChange("activityDepartmentSelect"));
on("sourcingDepartmentSelect", "change", () => handleDepartmentChange("sourcingDepartmentSelect"));
on("hiresDepartmentSelect", "change", () => handleDepartmentChange("hiresDepartmentSelect"));
  
  on("hiresUnlockBtn", "click", unlockHiresWithPassword);
  on("hiresPasswordInput", "keydown", (e) => {
    if (e.key === "Enter") unlockHiresWithPassword();
  });

  refreshAll();
  setInterval(refreshAll, 60000);
});
