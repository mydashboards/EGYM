document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv",
    pipelineInventory: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=0&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv",
    roleNotes: "PASTE_ROLE_NOTES_CSV_URL_HERE"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipeline: "pipeline_weekly",
    pipelineInventory: "pipeline_inventory",
    sourcing: "sourcing_data",
    hired: "hired_data",
    targets: "role_targets",
    roleNotes: "role_notes"
  };

  const HEALTH_THRESHOLDS = {
    critical: 1 / 6,
    warning: 2 / 6,
    healthy: 4 / 6,
    critical: 0.33,
    warning: 0.66
  };

  const HIRES_PASSWORD = "EGYM2026";
  const VIEW_STORAGE_KEY = "dashboard_view";

  const state = {
    view: "contributor",
    overviewRows: [],
    pipelineWeeklyRows: [],
    pipelineInventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    targets: [],
    roleNotesRows: [],
    pipelineOptions: [],
    activityOptions: [],
    sourcingOptions: [],
    managementWeekOptions: [],
    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: "",
    selectedManagementWeek: "",
    selectedManagementRole: "all",
    selectedManagementRecruiter: "all"
  };

  const charts = {
    pipelineHealth: null,
    sourceMix: null
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
    banner.innerHTML = Array.from(dataErrors.values())
      .map(message => `<div>${message}</div>`)
      .join("");
  }

  function setDataError(key, message) {
    if (message) {
      dataErrors.set(key, message);
    } else {
      dataErrors.delete(key);
    }
    updateDataErrorBanner();
  }

  function setError(id, msg) {
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

  function normalizeHeader(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function parseCSV(text) {
    // Simple CSV parser (works for your sheets: no embedded commas)
    const lines = text.trim().split("\n");
    const headers = lines.shift().split(",").map(h => h.trim());
    return lines.map(line => {
      const cells = line.split(",");
    const cleaned = text.replace(/^\uFEFF/, "");
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

      if (char === "\"") {
        if (inQuotes && next === "\"") {
          field += "\"";
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
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        current.push(field);
        if (current.some(value => value !== "")) {
          rows.push(current);
        }
        current = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length || current.length) {
      current.push(field);
      if (current.some(value => value !== "")) {
        rows.push(current);
      }
    }

    const headerRow = rows.shift() || [];
    const headers = headerRow.map(header => normalizeHeader(header));
    const mappedRows = rows.map(line => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cells[i] || "").trim());
      headers.forEach((header, index) => {
        obj[header] = (line[index] || "").trim();
      });
      return obj;
    });

    return { headers, rows: mappedRows, isHtml: false };
  }

  async function loadCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load CSV (${res.status})`);
    const text = await res.text();
    return parseCSV(text);
  function logLoadFailure({ key, url, status, text, error }) {
    console.log("Data source failed", {
      key,
      url,
      status,
      snippet: (text || "").slice(0, 200),
      error
    });
  }

  const num = v => Number(String(v).replace(",", ".")) || 0;
  async function loadCSV(key, url) {
    const cacheBuster = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cacheBuster}`;
    let text = "";
    let status = "unknown";

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      status = res.status;
      text = await res.text();

      if (!res.ok) {
        logLoadFailure({ key, url: fullUrl, status, text, error: new Error(`HTTP ${res.status}`) });
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = parseCSV(text);
      if (parsed.isHtml || !parsed.headers.length) {
        logLoadFailure({ key, url: fullUrl, status, text, error: new Error("Empty or invalid CSV") });
        throw new Error("Empty or invalid CSV");
      }

      setDataError(key, "");
      return parsed.rows;
    } catch (error) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      if (!text || status === "unknown") {
        logLoadFailure({ key, url: fullUrl, status, text, error });
      }
      throw error;
    }
  }

  const num = v => {
    if (v === null || v === undefined || v === "") return 0;
    const numeric = Number(String(v).replace(",", "."));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const getField = (row, keys) => {
    for (const key of keys) {
      const normalizedKey = normalizeHeader(String(key));
      if (row[normalizedKey] !== undefined && row[normalizedKey] !== null && String(row[normalizedKey]).trim() !== "") {
        return row[normalizedKey];
      }
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }
    return "";
  };

  function parseWeekStart(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatWeekLabel(value) {
    return value ? `w/c ${value}` : "Unknown week";
  }

  function formatPercent(value) {
    if (value === null || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(0)}%`;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "0";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return numeric.toLocaleString();
  }

  function badgeHTML(health) {
    if (health === "healthy") return `<span class="badge"><span class="dot good"></span>Healthy</span>`;
    if (health === "warning") return `<span class="badge"><span class="dot warn"></span>Warning</span>`;
    if (health === "warning" || health === "at_risk") return `<span class="badge"><span class="dot warn"></span>At risk</span>`;
    if (health === "critical") return `<span class="badge"><span class="dot bad"></span>Critical</span>`;
    return `<span class="badge"><span class="dot neutral"></span>New</span>`;
  }

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning" || health === "at_risk") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  function formatStageLabel(stage) {
    const original = String(stage || "").trim();
    if (!original) return "";
    if (/[A-Z]/.test(original)) return original;
    const normalized = normalizeStageValue(original);
    const overrides = {
      sourced: "Sourced",
      step1: "Step 1",
      step_1: "Step 1",
      tech_light: "Tech Light",
      tech_iv: "Tech IV",
      final: "Final",
      offer: "Offer",
      hired: "Hired",
      recruiter_screen: "Recruiter Screen",
      recruiter_screened: "Recruiter Screen"
    };
    if (overrides[normalized]) return overrides[normalized];
    return original
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function weekKey(row) {
    const year = num(row.year);
    const kw = num(row.kw);
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function getWeekNumberFromKey(value) {
    if (!value) return null;
    const match = String(value).match(/KW(\\d+)/i);
    if (!match) return null;
    return num(match[1]);
  }

  function isWeekMatch(row, selectedWeekKey) {
    const selectedKw = getWeekNumberFromKey(selectedWeekKey);
    if (!selectedKw) return false;
    if (row.year && row.kw) return weekKey(row) === selectedWeekKey;
    return num(row.kw) === selectedKw;
  }

  function normalizeStageValue(value) {
    return normalizeHeader(String(value || ""));
  }

  function getLatestWeekKey(rows) {
    const years = rows.map(r => num(r.year)).filter(Boolean);
    if (!years.length) return "";
    const latestYear = Math.max(...years);
    const weeksInYear = rows.filter(r => num(r.year) === latestYear).map(r => num(r.kw)).filter(Boolean);
    const latestKW = weeksInYear.length ? Math.max(...weeksInYear) : 0;
    return latestKW ? `${latestYear}-KW${String(latestKW).padStart(2, "0")}` : "";
  }

  function getWeekOptions(rows) {
    const options = new Map();
    rows.forEach(row => {
      const key = weekKey(row);
      if (!key) return;
      if (!options.has(key)) {
        options.set(key, { key, year: num(row.year), kw: num(row.kw), week_start: row.week_start || "" });
      }
    });
    return Array.from(options.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.kw - a.kw;
    });
  }

  function normalizePipelineWeekly(rows) {
    if (!rows.length) return [];
    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");
    if (hasStage && hasCount) {
      return rows.map(row => ({
        year: num(row.year),
        kw: num(row.kw),
        week_start: row.week_start || "",
        role: row.role || "",
        stage: row.stage || "",
        count: num(row.count)
      }));
    }

    const coreKeys = new Set(["year", "kw", "week_start", "role", "health"]);
    const longRows = [];
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        if (coreKeys.has(key)) return;
        longRows.push({
          year: num(row.year),
          kw: num(row.kw),
          week_start: row.week_start || "",
          role: row.role || "",
          stage: key,
          count: num(row[key])
        });
      });
    });
    return longRows;
  }

  function normalizePipelineInventory(rows) {
    return rows.map(row => ({
      year: num(row.year),
      kw: num(row.kw),
      week_start: row.week_start || "",
      role: row.role || "",
      stage: row.stage || "",
      count: num(row.count),
      stage_order: row.stage_order !== undefined && row.stage_order !== "" ? num(row.stage_order) : null
    }));
  }

  function normalizeRoleNotes(rows) {
    return rows.map(row => ({
      role: getField(row, ["role"]) || row.role || "",
      kw: num(getField(row, ["kw"]) || row.kw),
      recruiter: getField(row, ["recruiter"]) || row.recruiter || "",
      challenges: getField(row, ["challenges"]) || row.challenges || "",
      highlights: getField(row, ["highlights"]) || row.highlights || "",
      big_wins: getField(row, ["big_wins"]) || row.big_wins || ""
    }));
  }

  function getStagesForInventory(rows, weekKeyValue) {
    const stageMap = new Map();
    rows.forEach(row => {
      if (weekKey(row) !== weekKeyValue) return;
      const label = row.stage || "";
      if (!label) return;
      if (!stageMap.has(label)) {
        stageMap.set(label, { label, order: row.stage_order });
      }
    });

    return Array.from(stageMap.values()).sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : null;
      const bOrder = Number.isFinite(b.order) ? b.order : null;
      if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder !== null && bOrder === null) return -1;
      if (aOrder === null && bOrder !== null) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  function setSelectOptions(select, options) {
    const current = select.value;
    select.innerHTML = "";
    options.forEach(optionValue => {
      const option = document.createElement("option");
      option.value = optionValue.key;
      option.textContent = `KW ${optionValue.kw}`;
      select.appendChild(option);
    });
    if (current && options.some(opt => opt.key === current)) {
      select.value = current;
    } else if (options.length) {
      select.value = options[0].key;
    }
  }

  function setSelectOptionsWithAll(select, options, allLabel) {
    const current = select.value;
    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = allLabel;
    select.appendChild(allOption);
    options.forEach(optionValue => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      select.appendChild(option);
    });
    if (current && (current === "all" || options.includes(current))) {
      select.value = current;
    } else {
      select.value = "all";
    }
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dayDiff(start, end) {
    if (!start || !end) return null;
    const ms = end - start;
    return Number.isFinite(ms) ? Math.round(ms / (1000 * 60 * 60 * 24)) : null;
  }

  function normalizeHealthValue(value) {
    const normalized = normalizeHeader(String(value || ""));
    if (normalized.includes("critical")) return "critical";
    if (normalized.includes("warning") || normalized.includes("at_risk") || normalized.includes("risk")) return "warning";
    if (normalized.includes("healthy") || normalized.includes("good")) return "healthy";
    return "";
  }

  function getRoleOwnerMap(overviewRows) {
    const map = {};
    overviewRows.forEach(row => {
      if (!row.role) return;
      const owner = getField(row, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"]);
      if (owner) map[row.role] = owner;
    });
    return map;
  }

  function getRecruiterFromRow(row, roleOwnerMap) {
    return getField(row, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"]) || roleOwnerMap[row.role] || "";
  }

  function filterByRoleRecruiter(row, roleOwnerMap) {
    const roleMatch = state.selectedManagementRole === "all" || row.role === state.selectedManagementRole;
    if (!roleMatch) return false;
    if (state.selectedManagementRecruiter === "all") return true;
    const recruiter = getRecruiterFromRow(row, roleOwnerMap);
    return recruiter === state.selectedManagementRecruiter;
  }

  function splitNotes(value) {
    return String(value || "")
      .split(/\r?\n|\|/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function getHealthByRole(weeklyRows, targets, latestWeekKey) {
    const byRoleWeekly = {};
    weeklyRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRoleWeekly[role]) byRoleWeekly[role] = [];
      byRoleWeekly[role].push(r);
    });

    const targetsByRole = {};
    targets.forEach(t => {
      if (!t.role) return;
      if (!targetsByRole[t.role]) targetsByRole[t.role] = [];
      targetsByRole[t.role].push(t);
    });

    const healthByRole = {};
    Object.keys(byRoleWeekly).forEach(role => {
      const roleTargets = targetsByRole[role] || [];
      healthByRole[role] = computeHealth(byRoleWeekly[role], roleTargets, latestWeekKey).health;
    });
    return healthByRole;
  }

  /* ---------------- TABS (always keep clickable) ---------------- */

  function initTabs() {
  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
    const targetId = tabId || "overview";

    tabs.forEach(t => {
      const isActive = t.dataset.tab === targetId;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach(p => {
      p.classList.toggle("active", p.id === targetId);
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    let hiresUnlocked = false;

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const id = btn.dataset.tab;
        document.getElementById(id).classList.add("active");
        if (btn.dataset.tab === "hires" && !hiresUnlocked) {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) {
            return;
          }
          hiresUnlocked = true;
        }
        const tabId = btn.dataset.tab;
        window.location.hash = tabId;
        activateTab(tabId);
      });
    });

    window.addEventListener("hashchange", () => {
      const tabId = window.location.hash.replace("#", "");
      activateTab(tabId || "overview");
    });

    const initialTab = window.location.hash.replace("#", "") || "overview";
    activateTab(initialTab);
  }

  /* ---------------- HEALTH LOGIC ---------------- */

  function computeHealth(roleRows, target) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const recent = roleRows.slice(-lookback);
  function computeHealth(roleRows, transitions, endWeekKey) {
    if (!transitions.length) return { health: "new", reason: "Not enough data" };
    const sortedWeeks = Array.from(new Set(roleRows.map(row => weekKey(row)).filter(Boolean))).sort();
    const eligibleWeeks = endWeekKey ? sortedWeeks.filter(key => key <= endWeekKey) : sortedWeeks;
    if (!eligibleWeeks.length) return { health: "new", reason: "Not enough data" };

    const sums = {};
    ["sourced","step1","tech_light","tech_iv","final","offer","hired"].forEach(k => {
      sums[k] = recent.reduce((s, r) => s + num(r[k]), 0);
    const rowsByWeek = new Map();
    roleRows.forEach(row => {
      const key = weekKey(row);
      if (!key) return;
      if (!rowsByWeek.has(key)) rowsByWeek.set(key, []);
      rowsByWeek.get(key).push(row);
    });

    if (sums.sourced < minN) {
      return { health: "new", reason: "Not enough data", lookback };
    }

    const checks = [
      { a: "step1", b: "sourced", exp: target.step1_from_sourced_exp, label: "sourced → step1" },
      { a: "tech_light", b: "step1", exp: target.techlight_from_step1_exp, label: "step1 → tech_light" },
      { a: "tech_iv", b: "tech_light", exp: target.techiv_from_techlight_exp, label: "tech_light → tech_iv" },
      { a: "final", b: "tech_iv", exp: target.final_from_techiv_exp, label: "tech_iv → final" },
      { a: "offer", b: "final", exp: target.offer_from_final_exp, label: "final → offer" },
      { a: "hired", b: "offer", exp: target.hired_from_offer_exp, label: "offer → hired" }
    ];

    let worstScore = Infinity;
    let bottleneck = "—";
    let maxGap = -Infinity;
    let evaluated = 0;

    for (const c of checks) {
      const prev = sums[c.b];
      const expected = num(c.exp);
    transitions.forEach(transition => {
      const lookback = Math.max(1, num(transition.lookback_weeks));
      const minN = Math.max(1, num(transition.min_prev_stage_n));
      const expected = num(transition.expected_rate);
      const fromStage = normalizeStageValue(transition.from_stage);
      const toStage = normalizeStageValue(transition.to_stage);
      const recentWeeks = eligibleWeeks.slice(-lookback);
      let fromCount = 0;
      let toCount = 0;

      // only evaluate if enough volume in previous step AND expected > 0
      if (prev >= minN && expected > 0) {
        const actual = sums[c.a] / prev;
      recentWeeks.forEach(week => {
        const weekRows = rowsByWeek.get(week) || [];
        weekRows.forEach(row => {
          const stageKey = normalizeStageValue(row.stage);
          if (stageKey === fromStage) {
            fromCount += num(row.count);
          }
          if (stageKey === toStage) {
            toCount += num(row.count);
          }
        });
      });

      if (fromCount >= minN && expected > 0) {
        const actual = fromCount > 0 ? toCount / fromCount : 0;
        const score = actual / expected;
        const gap = expected - actual;
        evaluated += 1;

        if (score < worstScore) {
          worstScore = score;
          bottleneck = `${c.label} (${(actual*100).toFixed(0)}% vs ${(expected*100).toFixed(0)}%)`;
        }
        if (gap > maxGap) {
          maxGap = gap;
          bottleneck = `${transition.from_stage} → ${transition.to_stage} (${formatPercent(actual)} vs ${formatPercent(expected)})`;
        }
      }
    }
    });

    if (worstScore === Infinity) {
      return { health: "new", reason: "Not enough data", lookback };
    if (!evaluated) {
      return { health: "new", reason: "Not enough data" };
    }

    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck, lookback };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck, lookback };
    if (worstScore >= HEALTH_THRESHOLDS.healthy) return { health: "healthy", reason: bottleneck, lookback };

    return { health: "new", reason: bottleneck, lookback };
    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck };
    return { health: "healthy", reason: bottleneck };
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline(pipelineRows, targets) {
    const byRole = {};
    pipelineRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(r);
  function renderPipeline(inventoryRows, weeklyRows, targets, selectedWeekKey) {
    const stages = getStagesForInventory(inventoryRows, selectedWeekKey);
    const roles = new Set();
    const countsByRole = new Map();

    inventoryRows.forEach(row => {
      if (weekKey(row) !== selectedWeekKey) return;
      if (!row.role) return;
      roles.add(row.role);
      if (!countsByRole.has(row.role)) countsByRole.set(row.role, new Map());
      const stageMap = countsByRole.get(row.role);
      stageMap.set(row.stage, (stageMap.get(row.stage) || 0) + num(row.count));
    });

    const thead = document.querySelector("#pipeline table thead");
    if (thead) {
      const stageHeaders = stages.map(stage => `<th>${stage.label}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
          <th>Health</th>
        </tr>
      `;
    }

    const rowsByRoleWeekly = {};
    weeklyRows.forEach(row => {
      if (!row.role) return;
      if (!rowsByRoleWeekly[row.role]) rowsByRoleWeekly[row.role] = [];
      rowsByRoleWeekly[row.role].push(row);
    });

    const targetsByRole = {};
    targets.forEach(target => {
      if (!target.role) return;
      if (!targetsByRole[target.role]) targetsByRole[target.role] = [];
      targetsByRole[target.role].push(target);
    });

    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    targets.forEach(t => {
      const roleRows = byRole[t.role] || [];
      const result = computeHealth(roleRows, t);
    Array.from(roles).sort().forEach(role => {
      const stageMap = countsByRole.get(role) || new Map();
      const weeklyRoleRows = rowsByRoleWeekly[role] || [];
      const roleTargets = targetsByRole[role] || [];
      const result = computeHealth(weeklyRoleRows, roleTargets, selectedWeekKey);
      const stageCells = stages.map(stage => `<td>${formatNumber(stageMap.get(stage.label) || 0)}</td>`).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.role}</td>
        <td>${badgeHTML(result.health)}</td>
        <td>${result.reason || "—"}</td>
        <td>${result.lookback}w</td>
        <td>${role}</td>
        ${stageCells}
        <td>${healthDotHTML(result.health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function getActivityStages(rows, weekKeyValue) {
    const stageSet = new Set();
    rows.forEach(row => {
      if (weekKey(row) !== weekKeyValue) return;
      if (!row.stage) return;
      stageSet.add(row.stage);
    });

    const preferred = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];
    const presentPreferred = preferred.filter(stage => stageSet.has(stage));
    const remaining = Array.from(stageSet).filter(stage => !preferred.includes(stage)).sort((a, b) => a.localeCompare(b));
    return [...presentPreferred, ...remaining];
  }

  function renderActivity(weeklyRows, targets, selectedWeekKey) {
    const stages = getActivityStages(weeklyRows, selectedWeekKey);
    const countsByRole = new Map();
    const roles = new Set();

    weeklyRows.forEach(row => {
      if (weekKey(row) !== selectedWeekKey) return;
      if (!row.role) return;
      roles.add(row.role);
      if (!countsByRole.has(row.role)) countsByRole.set(row.role, new Map());
      const stageMap = countsByRole.get(row.role);
      stageMap.set(row.stage, (stageMap.get(row.stage) || 0) + num(row.count));
    });

    const thead = document.querySelector("#activity table thead");
    if (thead) {
      const stageHeaders = stages.map(stage => `<th>${formatStageLabel(stage)}</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${stageHeaders}
          <th>Health</th>
        </tr>
      `;
    }

    const targetsByRole = {};
    targets.forEach(target => {
      if (!target.role) return;
      if (!targetsByRole[target.role]) targetsByRole[target.role] = [];
      targetsByRole[target.role].push(target);
    });

    const rowsByRole = {};
    weeklyRows.forEach(row => {
      if (!row.role) return;
      if (!rowsByRole[row.role]) rowsByRole[row.role] = [];
      rowsByRole[row.role].push(row);
    });

    const tbody = $("activityTable");
    tbody.innerHTML = "";

    Array.from(roles).sort().forEach(role => {
      const stageMap = countsByRole.get(role) || new Map();
      const roleTargets = targetsByRole[role] || [];
      const result = computeHealth(rowsByRole[role] || [], roleTargets, selectedWeekKey);
      const stageCells = stages.map(stage => `<td>${formatNumber(stageMap.get(stage) || 0)}</td>`).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageCells}
        <td>${healthDotHTML(result.health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(overviewRows, pipelineRows, targets) {
    const byRolePipeline = {};
    pipelineRows.forEach(r => {
  function renderOverview(overviewRows, weeklyRows, targets, latestWeekKey) {
    const byRoleWeekly = {};
    weeklyRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRolePipeline[role]) byRolePipeline[role] = [];
      byRolePipeline[role].push(r);
      if (!byRoleWeekly[role]) byRoleWeekly[role] = [];
      byRoleWeekly[role].push(r);
    });

    const targetByRole = {};
    targets.forEach(t => { targetByRole[t.role] = t; });
    const targetsByRole = {};
    targets.forEach(t => {
      if (!t.role) return;
      if (!targetsByRole[t.role]) targetsByRole[t.role] = [];
      targetsByRole[t.role].push(t);
    });

    // Compute health per role (for the overview table)
    const healthByRole = {};
    Object.keys(byRolePipeline).forEach(role => {
      const t = targetByRole[role];
      if (!t) return;
      healthByRole[role] = computeHealth(byRolePipeline[role], t).health;
    Object.keys(byRoleWeekly).forEach(role => {
      const roleTargets = targetsByRole[role] || [];
      healthByRole[role] = computeHealth(byRoleWeekly[role], roleTargets, latestWeekKey).health;
    });

    // KPI cards
    const openRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = overviewRows.reduce((s, r) => s + num(r.openings), 0);

    const healthCounts = { healthy:0, warning:0, critical:0, new:0 };
    const healthCounts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    overviewRows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      healthCounts[h] = (healthCounts[h] || 0) + 1;
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
      <div class="kpi"><div class="label">Health (🟢/🟡/🔴)</div><div class="value">${healthCounts.healthy}/${healthCounts.warning}/${healthCounts.critical}</div></div>
    `;

    // Overview table
    const healthSummary = $("overviewHealthSummary");
    healthSummary.innerHTML = `
      <div class="health-badge ${healthCounts.healthy ? "" : "zero"}">
        <span class="health-dot good"></span>
        <span>${healthCounts.healthy} Healthy roles</span>
      </div>
      <div class="health-badge ${healthCounts.warning ? "" : "zero"}">
        <span class="health-dot warn"></span>
        <span>${healthCounts.warning} At risk roles</span>
      </div>
      <div class="health-badge ${healthCounts.critical ? "" : "zero"}">
        <span class="health-dot bad"></span>
        <span>${healthCounts.critical} Critical roles</span>
      </div>
    `;

    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    overviewRows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap"]);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.location || ""}</td>
        <td>${r.openings || ""}</td>
        <td>${r.pplwise_sourcer || ""}</td>
        <td>${badgeHTML(h)}</td>
        <td>${owner}</td>
        <td>${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing(sourcingRows, selectedWeekKey) {
    const filtered = sourcingRows.filter(r => weekKey(r) === selectedWeekKey);
    const tbody = $("sourcingTable");
    tbody.innerHTML = "";

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

    filtered.forEach(row => {
      const contacted = num(row.contacted);
      const replied = num(row.replied);
      const screen = num(row.recruiter_screen || row.recruiter_screened || row.recruiterScreen);
      const conv = contacted > 0 ? screen / contacted : null;

      totalContacted += contacted;
      totalReplied += replied;
      totalScreen += screen;

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

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${formatNumber(totalContacted)}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${formatNumber(totalReplied)}</div></div>
      <div class="kpi"><div class="label">Total Recruiter Screens</div><div class="value">${formatNumber(totalScreen)}</div><div class="sub">${formatPercent(overallConv)} conversion</div></div>
    `;
  }

  /* ---------------- RENDER: HIRES ---------------- */

  function renderHires(hiredRows, weeklyRows) {
    const tbody = $("hiresTable");
    tbody.innerHTML = "";

    const tthValues = [];
    const ttfValues = [];
    const processValues = [];

    hiredRows.forEach(row => {
      const liveDate = parseDate(getField(row, ["live_date", "Live Date", "live date"]));
      const signatureDate = parseDate(getField(row, ["signature_date", "Signature Date", "signature date"]));
      const startDate = parseDate(getField(row, ["start_date", "Start Date", "start date"]));
      const firstContact = parseDate(getField(row, ["1st_contact", "1st Contact", "first_contact", "first contact"]));

      const tth = dayDiff(liveDate, signatureDate);
      const ttf = dayDiff(liveDate, startDate);
      const daysInProcess = dayDiff(firstContact, signatureDate);

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);
      if (daysInProcess !== null) processValues.push(daysInProcess);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${getField(row, ["role", "Role"])}</td>
        <td>${getField(row, ["first_name", "First Name", "first name"])}</td>
        <td>${getField(row, ["last_name", "Last Name", "last name"])}</td>
        <td>${getField(row, ["source", "Source"])}</td>
        <td>${getField(row, ["salary", "Salary"])}</td>
        <td>${getField(row, ["live_date", "Live Date", "live date"])}</td>
        <td>${getField(row, ["1st_contact", "1st Contact", "first_contact", "first contact"])}</td>
        <td>${getField(row, ["signature_date", "Signature Date", "signature date"])}</td>
        <td>${getField(row, ["start_date", "Start Date", "start date"])}</td>
        <td>${tth !== null ? tth : "—"}</td>
        <td>${ttf !== null ? ttf : "—"}</td>
        <td>${daysInProcess !== null ? daysInProcess : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthValues);
    const avgTtf = average(ttfValues);

    let offerTotal = 0;
    let hiredTotal = 0;
    weeklyRows.forEach(row => {
      const stageKey = normalizeStageValue(row.stage);
      if (stageKey === "offer") offerTotal += num(row.count);
      if (stageKey === "hired") hiredTotal += num(row.count);
    });

    if (!offerTotal) {
      offerTotal = num(getField(hiredRows[0] || {}, ["offer", "offers", "offered"]));
      hiredTotal = num(getField(hiredRows[0] || {}, ["hired", "hires"]));
    }

    const offerRate = offerTotal > 0 ? hiredTotal / offerTotal : null;

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(hiredRows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">${formatPercent(offerRate)}</div><div class="sub">${offerTotal ? `${formatNumber(hiredTotal)} hires / ${formatNumber(offerTotal)} offers` : "Offer data missing"}</div></div>
    `;
  }

  /* ---------------- RENDER: MANAGEMENT ---------------- */

  function renderManagementView() {
    const roleOwnerMap = getRoleOwnerMap(state.overviewRows);
    const healthByRole = getHealthByRole(state.pipelineWeeklyRows, state.targets, state.selectedManagementWeek);

    const overviewFiltered = state.overviewRows.filter(row => filterByRoleRecruiter(row, roleOwnerMap));
    const inventoryFiltered = state.pipelineInventoryRows.filter(row => weekKey(row) === state.selectedManagementWeek)
      .filter(row => filterByRoleRecruiter(row, roleOwnerMap));
    const activityFiltered = state.pipelineWeeklyRows.filter(row => weekKey(row) === state.selectedManagementWeek)
      .filter(row => filterByRoleRecruiter(row, roleOwnerMap));

    const openRoles = overviewFiltered.filter(row => (row.status || "").toLowerCase() === "open").length;
    const pipelineCandidates = inventoryFiltered.reduce((sum, row) => sum + num(row.count), 0);
    const weeklyActivity = activityFiltered.reduce((sum, row) => sum + num(row.count), 0);

    const hiresFiltered = state.hiredRows.filter(row => {
      if (state.selectedManagementRole !== "all" && getField(row, ["role", "Role"]) !== state.selectedManagementRole) return false;
      if (state.selectedManagementRecruiter === "all") return true;
      const recruiter = getRecruiterFromRow(row, roleOwnerMap);
      return recruiter === state.selectedManagementRecruiter;
    });

    const hiresEmpty = state.hiredRows.length === 0;
    const hiresCount = hiresFiltered.length;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${formatNumber(pipelineCandidates)}</div><div class="sub">End-of-week inventory</div></div>
      <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${formatNumber(weeklyActivity)}</div><div class="sub">Selected week</div></div>
      <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${formatNumber(hiresCount)}</div><div class="sub">${hiresEmpty ? "No hire data yet" : "All time"}</div></div>
    `;

    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    overviewFiltered.forEach(row => {
      const fromRow = normalizeHealthValue(row.health);
      const health = fromRow || healthByRole[row.role] || "";
      if (!health || health === "new") return;
      if (health === "healthy") healthCounts.healthy += 1;
      if (health === "warning") healthCounts.warning += 1;
      if (health === "critical") healthCounts.critical += 1;
    });

    $("managementHealthSummary").innerHTML = `
      <div class="health-badge ${healthCounts.healthy ? "" : "zero"}">
        <span class="health-dot good"></span>
        <span>${healthCounts.healthy} Healthy</span>
      </div>
      <div class="health-badge ${healthCounts.warning ? "" : "zero"}">
        <span class="health-dot warn"></span>
        <span>${healthCounts.warning} At risk</span>
      </div>
      <div class="health-badge ${healthCounts.critical ? "" : "zero"}">
        <span class="health-dot bad"></span>
        <span>${healthCounts.critical} Critical</span>
      </div>
    `;

    renderPipelineHealthChart(healthCounts);
    renderSourceMixChart(roleOwnerMap);
    renderRecruiterUtilization(roleOwnerMap);
    renderRoleInsights(roleOwnerMap, healthByRole);
  }

  function renderPipelineHealthChart(healthCounts) {
    const canvas = $("pipelineHealthChart");
    const empty = $("pipelineHealthEmpty");
    const total = healthCounts.healthy + healthCounts.warning + healthCounts.critical;

    if (!total) {
      if (charts.pipelineHealth) {
        charts.pipelineHealth.destroy();
        charts.pipelineHealth = null;
      }
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const data = [healthCounts.healthy, healthCounts.warning, healthCounts.critical];
    const labels = ["Healthy", "At risk", "Critical"];
    const colors = ["#22c55e", "#f59e0b", "#ef4444"];

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
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "#e5e7eb" }
          }
        }
      }
    });
  }

  function renderSourceMixChart(roleOwnerMap) {
    const canvas = $("sourceMixChart");
    const empty = $("sourceMixEmpty");

    const filtered = state.sourcingRows.filter(row => weekKey(row) === state.selectedManagementWeek)
      .filter(row => filterByRoleRecruiter(row, roleOwnerMap));

    const sourceMap = new Map();
    filtered.forEach(row => {
      const source = getField(row, ["source", "Source"]);
      if (!source) return;
      const contacted = num(row.contacted);
      sourceMap.set(source, (sourceMap.get(source) || 0) + contacted);
    });

    if (!sourceMap.size) {
      if (charts.sourceMix) {
        charts.sourceMix.destroy();
        charts.sourceMix = null;
      }
      empty.classList.remove("hidden");
      canvas.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    canvas.classList.remove("hidden");

    const sorted = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3);
    const remaining = sorted.slice(3);
    const otherTotal = remaining.reduce((sum, entry) => sum + entry[1], 0);

    const labels = top.map(entry => entry[0]);
    const data = top.map(entry => entry[1]);
    if (otherTotal) {
      labels.push("Other");
      data.push(otherTotal);
    }

    const palette = ["#f97316", "#38bdf8", "#22c55e", "#64748b"];

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
          backgroundColor: palette.slice(0, labels.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "#e5e7eb" }
          }
        }
      }
    });
  }

  function getRoleTargets(targets) {
    const targetMap = {};
    targets.forEach(row => {
      const role = row.role || getField(row, ["role"]);
      if (!role) return;
      const targetValue = num(getField(row, ["target", "weekly_target", "weekly_goal", "goal"]));
      if (targetValue) targetMap[role] = targetValue;
    });
    return targetMap;
  }

  function renderRecruiterUtilization(roleOwnerMap) {
    const tbody = $("managementUtilizationTable");
    tbody.innerHTML = "";

    const roleTargets = getRoleTargets(state.targets);
    const recruiterRows = {};
    const filtered = state.sourcingRows.filter(row => weekKey(row) === state.selectedManagementWeek)
      .filter(row => filterByRoleRecruiter(row, roleOwnerMap));

    filtered.forEach(row => {
      const recruiter = getRecruiterFromRow(row, roleOwnerMap) || "Unassigned";
      if (!recruiterRows[recruiter]) {
        recruiterRows[recruiter] = { contacted: 0, screens: 0 };
      }
      recruiterRows[recruiter].contacted += num(row.contacted);
      recruiterRows[recruiter].screens += num(row.recruiter_screen || row.recruiter_screened || row.recruiterScreen);
    });

    const recruiters = Object.keys(recruiterRows).sort();
    if (!recruiters.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">No recruiter utilization data for this week.</td>`;
      tbody.appendChild(tr);
      return;
    }

    recruiters.forEach(recruiter => {
      const row = recruiterRows[recruiter];
      let target = 0;
      let approx = false;
      Object.keys(roleOwnerMap).forEach(role => {
        if (roleOwnerMap[role] !== recruiter) return;
        if (state.selectedManagementRole !== "all" && role !== state.selectedManagementRole) return;
        if (roleTargets[role]) target += roleTargets[role];
      });

      if (!target) {
        target = 50;
        approx = true;
      }

      const total = row.contacted + row.screens;
      const utilization = target ? Math.min(100, Math.round((total / target) * 100)) : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${recruiter}</td>
        <td>${formatNumber(row.screens)}</td>
        <td>${formatNumber(row.contacted)}</td>
        <td>
          <div class="util-meta">
            <div class="util-bar"><span style="width:${utilization !== null ? utilization : 0}%"></span></div>
            <span>${utilization !== null ? `${utilization}%` : "—"}${approx ? " (approx)" : ""}</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderRoleInsights(roleOwnerMap, healthByRole) {
    const container = $("roleInsights");
    container.innerHTML = "";

    const notes = state.roleNotesRows.filter(row => isWeekMatch(row, state.selectedManagementWeek))
      .filter(row => filterByRoleRecruiter(row, roleOwnerMap))
      .filter(row => row.challenges || row.highlights || row.big_wins);

    if (!notes.length) {
      container.innerHTML = `<div class="placeholder">No role insights shared for this week.</div>`;
      return;
    }

    const severityOrder = { critical: 0, warning: 1, healthy: 2, new: 3, "": 4 };

    notes.sort((a, b) => {
      const aHealth = normalizeHealthValue(a.health) || healthByRole[a.role] || "";
      const bHealth = normalizeHealthValue(b.health) || healthByRole[b.role] || "";
      return (severityOrder[aHealth] || 4) - (severityOrder[bHealth] || 4);
    });

    notes.forEach(note => {
      const health = normalizeHealthValue(note.health) || healthByRole[note.role] || "";
      const open = health === "critical" || health === "warning";
      const challenges = splitNotes(note.challenges);
      const highlights = splitNotes(note.highlights);
      const wins = splitNotes(note.big_wins);

      const card = document.createElement("details");
      card.className = "insight-card";
      if (open) card.open = true;

      card.innerHTML = `
        <summary>
          <div class="insight-meta">
            <strong>${note.role || "Role"}</strong>
            ${health ? healthDotHTML(health) : ""}
          </div>
          <span class="muted">${note.recruiter || getRecruiterFromRow(note, roleOwnerMap) || ""}</span>
        </summary>
        ${challenges.length ? `
          <div class="insight-section">
            <h4>Challenges</h4>
            <ul>${challenges.map(item => `<li>${item}</li>`).join("")}</ul>
          </div>
        ` : ""}
        ${highlights.length ? `
          <div class="insight-section">
            <h4>Highlights</h4>
            <ul>${highlights.map(item => `<li>${item}</li>`).join("")}</ul>
          </div>
        ` : ""}
        ${wins.length ? `
          <div class="insight-section">
            <h4>Big Wins</h4>
            <ul>${wins.map(item => `<li>${item}</li>`).join("")}</ul>
          </div>
        ` : ""}
      `;

      container.appendChild(card);
    });
  }

  function syncWeekSelections() {
    const pipelineWeekSource = state.pipelineInventoryRows.length ? state.pipelineInventoryRows : state.pipelineWeeklyRows;
    state.pipelineOptions = getWeekOptions(pipelineWeekSource);
    state.activityOptions = getWeekOptions(state.pipelineWeeklyRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);
    state.managementWeekOptions = getWeekOptions(state.pipelineWeeklyRows.length ? state.pipelineWeeklyRows : pipelineWeekSource);

    const pipelineSelect = $("pipelineWeekSelect");
    const activitySelect = $("activityWeekSelect");
    const sourcingSelect = $("sourcingWeekSelect");
    const managementWeekSelect = $("managementWeekSelect");

    setSelectOptions(pipelineSelect, state.pipelineOptions);
    setSelectOptions(activitySelect, state.activityOptions);
    setSelectOptions(sourcingSelect, state.sourcingOptions);
    setSelectOptions(managementWeekSelect, state.managementWeekOptions);

    const latestPipelineWeek = getLatestWeekKey(pipelineWeekSource) || (state.pipelineOptions[0] ? state.pipelineOptions[0].key : "");
    const latestActivityWeek = getLatestWeekKey(state.pipelineWeeklyRows) || (state.activityOptions[0] ? state.activityOptions[0].key : "");
    const latestSourcingWeek = getLatestWeekKey(state.sourcingRows) || (state.sourcingOptions[0] ? state.sourcingOptions[0].key : "");
    const latestManagementWeek = getLatestWeekKey(state.pipelineWeeklyRows) || latestPipelineWeek;

    if (!state.selectedPipelineWeek || !state.pipelineOptions.some(opt => opt.key === state.selectedPipelineWeek)) {
      state.selectedPipelineWeek = latestPipelineWeek;
    }
    if (!state.selectedActivityWeek || !state.activityOptions.some(opt => opt.key === state.selectedActivityWeek)) {
      state.selectedActivityWeek = latestActivityWeek;
    }
    if (!state.selectedSourcingWeek || !state.sourcingOptions.some(opt => opt.key === state.selectedSourcingWeek)) {
      state.selectedSourcingWeek = latestSourcingWeek;
    }
    if (!state.selectedManagementWeek || !state.managementWeekOptions.some(opt => opt.key === state.selectedManagementWeek)) {
      state.selectedManagementWeek = latestManagementWeek;
    }

    if (state.selectedPipelineWeek) pipelineSelect.value = state.selectedPipelineWeek;
    if (state.selectedActivityWeek) activitySelect.value = state.selectedActivityWeek;
    if (state.selectedSourcingWeek) sourcingSelect.value = state.selectedSourcingWeek;
    if (state.selectedManagementWeek) managementWeekSelect.value = state.selectedManagementWeek;
  }

  function syncManagementFilters() {
    const roleOptions = Array.from(new Set([
      ...state.overviewRows.map(row => row.role),
      ...state.roleNotesRows.map(row => row.role)
    ].filter(Boolean))).sort();
    const recruiterOptions = Array.from(new Set([
      ...state.overviewRows.map(row => getField(row, ["recruiter", "owner", "pplwise_tap", "pplwise_sourcer", "tap"])),
      ...state.roleNotesRows.map(row => row.recruiter)
    ].filter(Boolean))).sort();

    setSelectOptionsWithAll($("managementRoleSelect"), roleOptions, "All Roles");
    setSelectOptionsWithAll($("managementRecruiterSelect"), recruiterOptions, "All Recruiters");

    $("managementRoleSelect").value = state.selectedManagementRole;
    $("managementRecruiterSelect").value = state.selectedManagementRecruiter;
  }

  function renderFromState() {
    renderPipeline(state.pipelineInventoryRows, state.pipelineWeeklyRows, state.targets, state.selectedPipelineWeek);
    renderActivity(state.pipelineWeeklyRows, state.targets, state.selectedActivityWeek);
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
    renderHires(state.hiredRows, state.pipelineWeeklyRows);
    renderOverview(state.overviewRows, state.pipelineWeeklyRows, state.targets, state.selectedPipelineWeek);
    renderManagementView();
  }

  function normalizeTargets(rows) {
    return rows.map(row => ({
      ...row,
      role: getField(row, ["role"]) || row.role || "",
      lookback_weeks: getField(row, ["lookback_weeks"]) || row.lookback_weeks || "",
      min_prev_stage_n: getField(row, ["min_prev_stage_n"]) || row.min_prev_stage_n || "",
      from_stage: getField(row, ["from_stage"]) || row.from_stage || "",
      to_stage: getField(row, ["to_stage"]) || row.to_stage || "",
      expected_rate: getField(row, ["expected_rate"]) || row.expected_rate || ""
    }));
  }

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

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("sourcingError", "");
    setError("hiresError", "");

    try {
      const [overviewRows, pipelineRows, targets] = await Promise.all([
        loadCSV(CSV.overview),
        loadCSV(CSV.pipeline),
        loadCSV(CSV.targets)
      const roleNotesPromise = CSV.roleNotes.includes("PASTE") ? Promise.resolve([]) : loadCSV("roleNotes", CSV.roleNotes);
      const [overviewRows, pipelineWeeklyRaw, pipelineInventoryRaw, sourcingRows, hiredRows, targets, roleNotesRows] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipeline", CSV.pipeline),
        loadCSV("pipelineInventory", CSV.pipelineInventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("targets", CSV.targets),
        roleNotesPromise
      ]);

      renderPipeline(pipelineRows, targets);
      renderOverview(overviewRows, pipelineRows, targets);
      state.overviewRows = overviewRows;
      state.pipelineWeeklyRows = normalizePipelineWeekly(pipelineWeeklyRaw);
      state.pipelineInventoryRows = normalizePipelineInventory(pipelineInventoryRaw);
      state.sourcingRows = sourcingRows;
      state.hiredRows = hiredRows;
      state.targets = normalizeTargets(targets);
      state.roleNotesRows = normalizeRoleNotes(roleNotesRows);

      syncWeekSelections();
      syncManagementFilters();
      renderFromState();

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      setError("pipelineError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      setError("sourcingError", `Error: ${e.message}`);
      setError("hiresError", `Error: ${e.message}`);
      console.error(e);
    }
  }

  function handlePipelineWeekChange() {
    state.selectedPipelineWeek = $("pipelineWeekSelect").value;
    renderPipeline(state.pipelineInventoryRows, state.pipelineWeeklyRows, state.targets, state.selectedPipelineWeek);
    renderOverview(state.overviewRows, state.pipelineWeeklyRows, state.targets, state.selectedPipelineWeek);
  }

  function handleActivityWeekChange() {
    state.selectedActivityWeek = $("activityWeekSelect").value;
    renderActivity(state.pipelineWeeklyRows, state.targets, state.selectedActivityWeek);
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
  }

  function handleManagementWeekChange() {
    state.selectedManagementWeek = $("managementWeekSelect").value;
    renderManagementView();
  }

  function handleManagementRoleChange() {
    state.selectedManagementRole = $("managementRoleSelect").value;
    renderManagementView();
  }

  function handleManagementRecruiterChange() {
    state.selectedManagementRecruiter = $("managementRecruiterSelect").value;
    renderManagementView();
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (storedView === "management") {
    state.view = "management";
  }

  setView(state.view);

  $("viewContributor").addEventListener("click", () => setView("contributor"));
  $("viewManagement").addEventListener("click", () => setView("management"));

  $("refreshBtn").addEventListener("click", refreshAll);
  $("pipelineWeekSelect").addEventListener("change", handlePipelineWeekChange);
  $("activityWeekSelect").addEventListener("change", handleActivityWeekChange);
  $("sourcingWeekSelect").addEventListener("change", handleSourcingWeekChange);
  $("managementWeekSelect").addEventListener("change", handleManagementWeekChange);
  $("managementRoleSelect").addEventListener("change", handleManagementRoleChange);
  $("managementRecruiterSelect").addEventListener("change", handleManagementRecruiterChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
