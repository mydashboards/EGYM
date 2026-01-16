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

  const HIRES_PASSWORD = "EGYM2026";
  const VIEW_STORAGE_KEY = "dashboard_view";

  const state = {
    view: "contributor",

    overviewRows: [],
    pipelineWeeklyRows: [],   // long-form normalized: {year,kw,role,stage,count,week_start?}
    pipelineInventoryRows: [],// normalized: {year,kw,role,stage,count,stage_order?}
    sourcingRows: [],
    hiredRows: [],
    roleTargets: [],
    roleNotesRows: [],

    pipelineOptions: [],
    activityOptions: [],
    sourcingOptions: [],

    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: ""
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

  function getWeekNumberFromKey(value) {
    if (!value) return null;
    const m = String(value).match(/KW(\d+)/i);
    return m ? num(m[1]) : null;
  }
function currentISOWeek() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function pickDefaultWeekKey(options) {
  if (!options.length) return "";
  const cw = currentISOWeek();
  const cy = new Date().getFullYear();

  // Prefer current year + current week if present
  const exact = options.find(o => o.year === cy && o.kw === cw);
  if (exact) return exact.key;

  // Else prefer current week (any year) if present (use latest year)
  const sameWeek = options.filter(o => o.kw === cw).sort((a,b) => b.year - a.year);
  if (sameWeek.length) return sameWeek[0].key;

  // Else fallback to latest in data (options already sorted desc)
  return options[0].key;
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

  function pickPreferredWeekKey(options, preferredKw) {
    if (!options.length) return "";
    const candidates = options.filter(o => o.kw === preferredKw);
    if (candidates.length) {
      // choose the highest year that has preferred KW
      candidates.sort((a, b) => b.year - a.year);
      return candidates[0].key;
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

    // preserve if possible
    const allowed = new Set([...(includeAllTime ? ["all"] : []), ...options.map(o => o.key)]);
    if (current && allowed.has(current)) select.value = current;
    else if (includeAllTime) select.value = "all";
    else if (options.length) select.value = options[0].key;
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

  function normalizePipelineWeekly(rows) {
    if (!rows.length) return [];
    // “wide” form sample you showed: role, kw, year, recruiter, step1, tech_light, tech_iv, final, offer, hired
    // We convert to long-form {year,kw,role,stage,count}
    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health"]);
    const long = [];

    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      if (!year || !kw || !role) return;

      Object.keys(r).forEach(k => {
        const nk = normalizeHeader(k);
        if (coreKeys.has(nk)) return;
        const count = num(r[k]);
        if (!Number.isFinite(count)) return;
        // keep even 0? we can skip 0 to reduce noise:
        if (count === 0) return;
        long.push({
          year,
          kw,
          role,
          stage: nk,
          count
        });
      });
    });

    // If the sheet is already long-form (has stage/count), keep it:
    const looksLong = rows.length && ("stage" in rows[0] || "count" in rows[0]);
    if (looksLong) {
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        stage: normalizeStageValue(getField(r, ["stage"])),
        count: num(getField(r, ["count"]))
      })).filter(r => r.year && r.kw && r.role && r.stage);
    }

    return long;
  }

  function normalizePipelineInventory(rows) {
    // expected long-form: year,kw,role,stage,count,(optional stage_order)
    // if wide-form, we’ll also support by converting similar to weekly.
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");

    if (hasStage && hasCount) {
      return rows.map(r => ({
        year: num(getField(r, ["year"])),
        kw: num(getField(r, ["kw"])),
        role: getField(r, ["role"]),
        stage: getField(r, ["stage"]),
        count: num(getField(r, ["count"])),
        stage_order: getField(r, ["stage_order"])
      })).filter(r => r.year && r.kw && r.role && r.stage);
    }

    // wide -> long
    const coreKeys = new Set(["role", "kw", "year", "week_start", "recruiter", "health", "stage_order"]);
    const long = [];
    rows.forEach(r => {
      const year = num(getField(r, ["year"]));
      const kw = num(getField(r, ["kw"]));
      const role = getField(r, ["role"]);
      if (!year || !kw || !role) return;

      Object.keys(r).forEach(k => {
        const nk = normalizeHeader(k);
        if (coreKeys.has(nk)) return;
        const count = num(r[k]);
        if (count === 0) return;
        long.push({
          year,
          kw,
          role,
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
      contacted: num(getField(r, ["contacted"])),
      replied: num(getField(r, ["replied"])),
      recruiter_screen: num(getField(r, ["recruiter_screen", "recruiter_screened"]))
    })).filter(r => r.year && r.kw && r.role);
  }

  function normalizeTargets(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      lookback_weeks: num(getField(r, ["lookback_weeks", "lookback"])),
      min_prev_stage_n: num(getField(r, ["min_prev_stage_n", "min_n"])),
      from_stage: normalizeStageValue(getField(r, ["from_stage"])),
      to_stage: normalizeStageValue(getField(r, ["to_stage"])),
      expected_rate: num(getField(r, ["expected_rate"]))
    })).filter(r => r.role && r.from_stage && r.to_stage);
  }

  function normalizeRoleNotes(rows) {
    return rows.map(r => ({
      role: getField(r, ["role"]),
      kw: num(getField(r, ["kw"])),
      year: num(getField(r, ["year"])), // optional
      recruiter: getField(r, ["recruiter"]),
      challenges: getField(r, ["challenges"]),
      highlights: getField(r, ["highlights"]),
      big_wins: getField(r, ["big_wins"])
    })).filter(r => r.role && r.kw);
  }

  /* ---------------- HEALTH (RAG) ---------------- */

  function computeHealth(weeklyLongRowsForRole, transitions, endWeekKey) {
    if (!transitions.length) return { health: "new", reason: "Not enough data" };

    const weeks = Array.from(new Set(weeklyLongRowsForRole.map(r => weekKey(r)).filter(Boolean))).sort();
    const eligible = endWeekKey && endWeekKey !== "all" ? weeks.filter(w => w <= endWeekKey) : weeks;
    if (!eligible.length) return { health: "new", reason: "Not enough data" };

    const rowsByWeek = new Map();
    weeklyLongRowsForRole.forEach(r => {
      const wk = weekKey(r);
      if (!wk) return;
      if (!rowsByWeek.has(wk)) rowsByWeek.set(wk, []);
      rowsByWeek.get(wk).push(r);
    });

    let evaluated = 0;
    let worstScore = Infinity;
    let bottleneck = "—";

    transitions.forEach(t => {
      const lookback = Math.max(1, num(t.lookback_weeks));
      const minN = Math.max(1, num(t.min_prev_stage_n));
      const expected = num(t.expected_rate);
      const fromStage = normalizeStageValue(t.from_stage);
      const toStage = normalizeStageValue(t.to_stage);

      const recentWeeks = eligible.slice(-lookback);
      let fromCount = 0;
      let toCount = 0;

      recentWeeks.forEach(w => {
        (rowsByWeek.get(w) || []).forEach(r => {
          const sk = normalizeStageValue(r.stage);
          if (sk === fromStage) fromCount += num(r.count);
          if (sk === toStage) toCount += num(r.count);
        });
      });

      if (fromCount >= minN && expected > 0) {
        const actual = fromCount > 0 ? toCount / fromCount : 0;
        const score = actual / expected;
        evaluated += 1;

        if (score < worstScore) {
          worstScore = score;
          bottleneck = `${t.from_stage} → ${t.to_stage} (${formatPercent(actual)} vs ${formatPercent(expected)})`;
        }
      }
    });

    if (!evaluated) return { health: "new", reason: "Not enough data" };

    // Thresholds (simple, stable)
    if (worstScore < 0.33) return { health: "critical", reason: bottleneck };
    if (worstScore < 0.66) return { health: "warning", reason: bottleneck };
    return { health: "healthy", reason: bottleneck };
  }

  function getHealthByRole(weeklyRows, targets, endWeekKey) {
    const byRole = {};
    weeklyRows.forEach(r => {
      if (!r.role) return;
      if (!byRole[r.role]) byRole[r.role] = [];
      byRole[r.role].push(r);
    });

    const targetsByRole = {};
    targets.forEach(t => {
      if (!t.role) return;
      if (!targetsByRole[t.role]) targetsByRole[t.role] = [];
      targetsByRole[t.role].push(t);
    });

    const health = {};
    Object.keys(byRole).forEach(role => {
      const trs = targetsByRole[role] || [];
      health[role] = computeHealth(byRole[role], trs, endWeekKey).health;
    });
    return health;
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

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview() {
    const rows = state.overviewRows || [];
    const healthByRole = getHealthByRole(
      state.pipelineWeeklyRows,
      state.roleTargets,
      state.selectedPipelineWeek === "all" ? "" : state.selectedPipelineWeek
    );

    const openRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "open").length;
    const filledRoles = rows.filter(r => normalizeHeader(getField(r, ["status"])) === "filled").length;
    const totalOpenings = rows.reduce((s, r) => s + num(getField(r, ["openings"])), 0);

    const counts = { healthy: 0, warning: 0, critical: 0 };
    rows.forEach(r => {
      const role = getField(r, ["role"]);
      const h = normalizeHealthValue(getField(r, ["health"])) || healthByRole[role] || "new";
      if (h === "healthy") counts.healthy += 1;
      else if (h === "warning") counts.warning += 1;
      else if (h === "critical") counts.critical += 1;
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
      <div class="kpi"><div class="label">RAG (🟢/🟡/🔴)</div><div class="value">${counts.healthy}/${counts.warning}/${counts.critical}</div></div>
    `;

    $("overviewHealthSummary").innerHTML = `
      <div class="health-badge good"><span class="health-dot good"></span><span>${counts.healthy} Healthy</span></div>
      <div class="health-badge warn"><span class="health-dot warn"></span><span>${counts.warning} At risk</span></div>
      <div class="health-badge bad"><span class="health-dot bad"></span><span>${counts.critical} Critical</span></div>
    `;

    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    rows.forEach(r => {
      const role = getField(r, ["role"]);
      const status = getField(r, ["status"]);
      const location = getField(r, ["location"]);
      const openings = getField(r, ["openings"]);
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap", "owner", "recruiter"]);
      const h = normalizeHealthValue(getField(r, ["health"])) || healthByRole[role] || "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${status}</td>
        <td>${location}</td>
        <td class="num">${openings}</td>
        <td>${owner}</td>
        <td class="center">${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function getStagesForInventory(rows, selectedWeekKey) {
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
    const weekly = state.pipelineWeeklyRows || [];
    const targets = state.roleTargets || [];
    const selectedWeekKey = state.selectedPipelineWeek || "";

    const emptyEl = $("pipelineEmpty");
    const thead = document.querySelector("#pipeline table thead");
    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    const stages = getStagesForInventory(inv, selectedWeekKey);

    // Aggregate inventory counts for the selected week (or all time)
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
    
    // Fallback/Union: also include roles present in weekly data for the same week
weekly.forEach(r => {
  if (!isWeekMatch(r, selectedWeekKey)) return;
  if (!r.role) return;
  roles.add(r.role);
  if (!countsByRole.has(r.role)) countsByRole.set(r.role, new Map());
});

    // Header
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

    // Health per role (based on weekly, endWeekKey = selected week unless all time then latest)
    const healthByRole = getHealthByRole(
      weekly,
      targets,
      selectedWeekKey === "all" ? "" : selectedWeekKey
    );

    const roleList = Array.from(roles).sort();
    if (!roleList.length) {
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    roleList.forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      const stageCells = stages.map(s => `<td class="num">${formatNumber(sm.get(s.label) || 0)}</td>`).join("");
      const h = healthByRole[role] || "new";

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

  function getActivityStages(weeklyRows, selectedWeekKey) {
    const set = new Set();
    weeklyRows.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
      if (!r.stage) return;
      set.add(r.stage);
    });

    const preferred = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];
    const presentPreferred = preferred.filter(s => set.has(s));
    const remaining = Array.from(set).filter(s => !preferred.includes(s)).sort();
    return [...presentPreferred, ...remaining];
  }

  function renderActivity() {
    const weekly = state.pipelineWeeklyRows || [];
    const targets = state.roleTargets || [];
    const selectedWeekKey = state.selectedActivityWeek || "";

    const stages = getActivityStages(weekly, selectedWeekKey);
    const roles = new Set();
    const countsByRole = new Map();

    weekly.forEach(r => {
      if (!isWeekMatch(r, selectedWeekKey)) return;
    const role = String(r.role || "").trim();
const stage = String(r.stage || "").trim();
if (!role || !stage) return;

roles.add(role);
if (!countsByRole.has(role)) countsByRole.set(role, new Map());
const sm = countsByRole.get(role);
sm.set(stage, (sm.get(stage) || 0) + num(r.count));
    });

    const thead = document.querySelector("#activity table thead");
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

    const healthByRole = getHealthByRole(weekly, targets, selectedWeekKey === "all" ? "" : selectedWeekKey);

    const tbody = $("activityTable");
    tbody.innerHTML = "";

    Array.from(roles).sort().forEach(role => {
      const sm = countsByRole.get(role) || new Map();
      const stageCells = stages.map(s => `<td class="num">${formatNumber(sm.get(s) || 0)}</td>`).join("");
      const h = healthByRole[role] || "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageCells}
        <td class="center">${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing() {
    const rows = state.sourcingRows || [];
    const selectedWeekKey = state.selectedSourcingWeek || "";

    const filtered = rows.filter(r => isWeekMatch(r, selectedWeekKey));

    const tbody = $("sourcingTable");
    tbody.innerHTML = "";

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

    // aggregate by role for all time (or still by role for week)
    const byRole = new Map();
    filtered.forEach(r => {
      if (!byRole.has(r.role)) byRole.set(r.role, { contacted: 0, replied: 0, screen: 0 });
      const agg = byRole.get(r.role);
      agg.contacted += num(r.contacted);
      agg.replied += num(r.replied);
      agg.screen += num(r.recruiter_screen);

      totalContacted += num(r.contacted);
      totalReplied += num(r.replied);
      totalScreen += num(r.recruiter_screen);
    });

    Array.from(byRole.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([role, agg]) => {
      const conv = agg.contacted > 0 ? agg.screen / agg.contacted : null;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td class="num">${formatNumber(agg.contacted)}</td>
        <td class="num">${formatNumber(agg.replied)}</td>
        <td class="num">${formatNumber(agg.screen)}</td>
        <td class="num">${formatPercent(conv)}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallConv = totalContacted > 0 ? totalScreen / totalContacted : null;

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${formatNumber(totalContacted)}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${formatNumber(totalReplied)}</div></div>
      <div class="kpi"><div class="label">Total Recruiter Screens</div><div class="value">${formatNumber(totalScreen)}</div><div class="sub">${formatPercent(overallConv)} conversion</div></div>
      <div class="kpi"><div class="label">Scope</div><div class="value">${selectedWeekKey === "all" ? "All time" : selectedWeekKey.replace("-", " ")}</div></div>
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
    const processValues = [];

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
      if (daysInProcess !== null) processValues.push(daysInProcess);

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

    // pipeline includes All time option
    setSelectOptions($("pipelineWeekSelect"), state.pipelineOptions, true);
    // activity includes All time option
    setSelectOptions($("activityWeekSelect"), state.activityOptions, true);
    // sourcing includes All time option
    setSelectOptions($("sourcingWeekSelect"), state.sourcingOptions, true);

    // Defaults:
// Pipeline: prefer current calendar week if present, else latest week in data
if (!state.selectedPipelineWeek || (!["all", ...state.pipelineOptions.map(o => o.key)].includes(state.selectedPipelineWeek))) {
  state.selectedPipelineWeek = pickDefaultWeekKey(state.pipelineOptions) || "all";
}

// Activity: prefer current calendar week if present, else latest week in data (or "all" if no data)
if (!state.selectedActivityWeek || (!["all", ...state.activityOptions.map(o => o.key)].includes(state.selectedActivityWeek))) {
  state.selectedActivityWeek = pickDefaultWeekKey(state.activityOptions) || "all";
}

// Sourcing: prefer current calendar week if present, else latest week in data (or "all" if no data)
if (!state.selectedSourcingWeek || (!["all", ...state.sourcingOptions.map(o => o.key)].includes(state.selectedSourcingWeek))) {
  state.selectedSourcingWeek = pickDefaultWeekKey(state.sourcingOptions) || "all";
}


    $("pipelineWeekSelect").value = state.selectedPipelineWeek;
    $("activityWeekSelect").value = state.selectedActivityWeek;
    $("sourcingWeekSelect").value = state.selectedSourcingWeek;
  }

  function renderAll() {
    renderOverview();
    renderPipeline();
    renderActivity();
    renderSourcing();
    renderHires();
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
      state.pipelineWeeklyRows = normalizePipelineWeekly(pipelineWeeklyRaw || []);
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
      // errors are shown via data error banner; keep UI responsive
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
    renderActivity();
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
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

  refreshAll();
  setInterval(refreshAll, 60000);
});
