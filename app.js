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
  const ALL_TIME_KEY = "__all__";

  // Expected stage keys (stable internal keys)
  const STAGES = ["sourced", "reviewed", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];

  const state = {
    overviewRows: [],
    weeklyRows: [],     // pipeline_weekly
    inventoryRows: [],  // pipeline_inventory
    sourcingRows: [],
    hiredRows: [],
    targets: [],
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
    banner.innerHTML = Array.from(dataErrors.values())
      .map(message => `<div>${message}</div>`)
      .join("");
  }

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
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
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function parseCSV(text) {
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
      snippet: (text || "").slice(0, 200),
      error
    });
  }

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
      if (!text || status === "unknown") logLoadFailure({ key, url: fullUrl, status, text, error });
      throw error;
    }
  }

  const num = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const numeric = Number(String(v).replace(",", "."));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const getField = (row, keys) => {
    for (const key of keys) {
      const nk = normalizeHeader(String(key));
      if (row[nk] !== undefined && row[nk] !== null && String(row[nk]).trim() !== "") return row[nk];
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  };

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "0";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
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

  function weekKey(row) {
    const year = num(row.year);
    const kw = num(row.kw);
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function getWeekOptions(rows) {
    const options = new Map();
    rows.forEach(row => {
      const key = weekKey(row);
      if (!key) return;
      if (!options.has(key)) {
        options.set(key, { key, year: num(row.year), kw: num(row.kw) });
      }
    });
    return Array.from(options.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.kw - a.kw;
    });
  }

  // ISO week/year
  function getISOWeekYear(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  }

  function currentWeekKey() {
    const { year, week } = getISOWeekYear(new Date());
    return `${year}-KW${String(week).padStart(2, "0")}`;
  }

  function pickDefaultWeekKey(options) {
    const cw = currentWeekKey();
    if (options.some(o => o.key === cw)) return cw;
    return options[0] ? options[0].key : "";
  }

  function setSelectOptions(select, options, currentValue) {
    select.innerHTML = "";

    const all = document.createElement("option");
    all.value = ALL_TIME_KEY;
    all.textContent = "All time";
    select.appendChild(all);

    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = `KW ${o.kw}`;
      select.appendChild(opt);
    });

    if (currentValue && [...select.options].some(x => x.value === currentValue)) {
      select.value = currentValue;
      return;
    }

    // default: current week if exists, else latest from data (options[0])
    const def = pickDefaultWeekKey(options);
    select.value = def || ALL_TIME_KEY;
  }

  function filterRowsBySelection(rows, selectedKey) {
    if (selectedKey === ALL_TIME_KEY) return rows;
    return rows.filter(r => weekKey(r) === selectedKey);
  }

  function groupByRole(rows) {
    const by = {};
    rows.forEach(r => {
      const role = r.role || "";
      if (!role) return;
      if (!by[role]) by[role] = [];
      by[role].push(r);
    });
    return by;
  }

  function sumStageCounts(rows, stageKeys) {
    const sums = {};
    stageKeys.forEach(k => (sums[k] = 0));
    rows.forEach(r => {
      stageKeys.forEach(k => {
        sums[k] += num(r[k]);
      });
    });
    return sums;
  }

  /* ---------------- TABS ---------------- */

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
        if (btn.dataset.tab === "hires" && !hiresUnlocked) {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) return;
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

  /* ---------------- HEALTH (Inventory snapshot heuristic) ----------------
     We calculate "coverage" to reach 1 hire based on expected conversion chain.
     Coverage = actual_stage_count / required_stage_count_for_1_hire
     Worst coverage decides health.
  ----------------------------------------------------------------------- */

  function computeInventoryHealth(inventoryRow, target) {
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const r = inventoryRow || {};
    const actual = {
      sourced: num(r.sourced),
      step1: num(r.step1),
      tech_light: num(r.tech_light),
      tech_iv: num(r.tech_iv),
      final: num(r.final),
      offer: num(r.offer),
      hired: num(r.hired)
    };

    // If almost no data, treat as new
    if (actual.sourced < minN) return "new";

    const step1Exp = num(getField(target, ["step1_from_sourced_exp", "screen_to_step1_exp"]));
    const techLightExp = num(getField(target, ["techlight_from_step1_exp", "step1_to_tech_exp", "step1_to_techlight_exp"]));
    const techIvExp = num(getField(target, ["techiv_from_techlight_exp", "tech_to_final_exp", "techlight_to_techiv_exp"]));
    const finalExp = num(getField(target, ["final_from_techiv_exp", "tech_to_final_exp", "techiv_to_final_exp"]));
    const offerExp = num(getField(target, ["offer_from_final_exp", "final_to_offer_exp"]));
    const hiredExp = num(getField(target, ["hired_from_offer_exp", "offer_to_hired_exp"]));

    // Need valid expectations
    const exps = [step1Exp, techLightExp, techIvExp, finalExp, offerExp, hiredExp];
    if (exps.some(x => !x || x <= 0)) return "new";

    // Required counts for 1 hire
    const req = {};
    req.hired = 1;
    req.offer = req.hired / hiredExp;
    req.final = req.offer / offerExp;
    req.tech_iv = req.final / finalExp;
    req.tech_light = req.tech_iv / techIvExp;
    req.step1 = req.tech_light / techLightExp;
    req.sourced = req.step1 / step1Exp;

    // Compute coverage ratios (cap huge values)
    const coverages = [
      actual.sourced / req.sourced,
      actual.step1 / req.step1,
      actual.tech_light / req.tech_light,
      actual.tech_iv / req.tech_iv,
      actual.final / req.final,
      actual.offer / req.offer
    ].filter(v => Number.isFinite(v));

    if (!coverages.length) return "new";

    const worst = Math.min(...coverages);

    if (worst < HEALTH_THRESHOLDS.critical) return "critical";
    if (worst < HEALTH_THRESHOLDS.warning) return "warning";
    return "healthy";
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(overviewRows, inventoryRows, targets, selectedPipelineWeekKey) {
    const byRoleInventory = groupByRole(inventoryRows);
    const targetByRole = {};
    targets.forEach(t => {
      if (t.role) targetByRole[t.role] = t;
    });

    // health by role (based on selected week inventory snapshot)
    const healthByRole = {};
    Object.keys(byRoleInventory).forEach(role => {
      const rows = byRoleInventory[role] || [];
      let snap = {};
      if (selectedPipelineWeekKey === ALL_TIME_KEY) {
        // all-time = sum across all inventory snapshots
        const sums = sumStageCounts(rows, STAGES);
        snap = { ...sums, role };
      } else {
        snap = rows.find(r => weekKey(r) === selectedPipelineWeekKey) || {};
      }
      const target = targetByRole[role];
      healthByRole[role] = target ? computeInventoryHealth(snap, target) : "new";
    });

    const openRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = overviewRows.reduce((s, r) => s + num(r.openings), 0);

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
    `;

    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    overviewRows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      if (h === "healthy") healthCounts.healthy += 1;
      else if (h === "warning") healthCounts.warning += 1;
      else if (h === "critical") healthCounts.critical += 1;
    });

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
      const owner = getField(r, ["pplwise_tap", "pplwise_sourcer", "tap"]);
      const h = healthByRole[r.role] || "new";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.location || ""}</td>
        <td>${r.openings || ""}</td>
        <td>${owner || ""}</td>
        <td>${healthDotHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE (Inventory snapshot) ---------------- */

  function renderPipelineInventory(inventoryRows, targets, selectedWeekKey) {
    const byRole = groupByRole(inventoryRows);
    const targetByRole = {};
    targets.forEach(t => {
      if (t.role) targetByRole[t.role] = t;
    });

    const roles = new Set([...Object.keys(byRole), ...targets.map(t => t.role).filter(Boolean)]);
    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    roles.forEach(role => {
      const roleRows = byRole[role] || [];
      let row = {};

      if (selectedWeekKey === ALL_TIME_KEY) {
        const sums = sumStageCounts(roleRows, STAGES);
        row = { ...sums, role };
      } else {
        row = roleRows.find(r => weekKey(r) === selectedWeekKey) || {};
      }

      const target = targetByRole[role];
      const health = target ? computeInventoryHealth(row, target) : "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${formatNumber(num(row.sourced))}</td>
        <td>${formatNumber(num(row.reviewed))}</td>
        <td>${formatNumber(num(row.step1))}</td>
        <td>${formatNumber(num(row.tech_light))}</td>
        <td>${formatNumber(num(row.tech_iv))}</td>
        <td>${formatNumber(num(row.final))}</td>
        <td>${formatNumber(num(row.offer))}</td>
        <td>${formatNumber(num(row.hired))}</td>
        <td>${healthDotHTML(health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: ACTIVITY (Weekly stage activity) ---------------- */

  function ensureActivitySummaryContainer() {
    const panel = $("activity");
    if (!panel) return null;
    let el = $("activitySummary");
    if (el) return el;

    // Insert cards container between header and tablewrap
    const card = panel.querySelector(".card");
    const tablewrap = panel.querySelector(".tablewrap");
    if (!card || !tablewrap) return null;

    el = document.createElement("div");
    el.id = "activitySummary";
    el.className = "cards";

    card.insertBefore(el, tablewrap);
    return el;
  }

  function renderActivityWeekly(weeklyRows, selectedWeekKey) {
    const filtered = filterRowsBySelection(weeklyRows, selectedWeekKey);
    const byRole = groupByRole(filtered);

    // Summary totals across all roles
    const summaryEl = ensureActivitySummaryContainer();
    const totals = sumStageCounts(filtered, STAGES);

    if (summaryEl) {
      summaryEl.innerHTML = STAGES.map(stage => {
        return `<div class="kpi"><div class="label">${stage.replace("_", " ").toUpperCase()}</div><div class="value">${formatNumber(totals[stage])}</div></div>`;
      }).join("");
    }

    // Table header dynamic: Role + stages
    const thead = $("activityHead");
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Role</th>
          ${STAGES.map(s => `<th>${s.replace("_", " ").toUpperCase()}</th>`).join("")}
        </tr>
      `;
    }

    const tbody = $("activityTable");
    tbody.innerHTML = "";

    const roles = Object.keys(byRole).sort((a, b) => a.localeCompare(b));
    roles.forEach(role => {
      const rows = byRole[role] || [];
      const sums = sumStageCounts(rows, STAGES);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${STAGES.map(s => `<td>${formatNumber(sums[s])}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing(sourcingRows, selectedWeekKey) {
    const filtered = filterRowsBySelection(sourcingRows, selectedWeekKey);

    const tbody = $("sourcingTable");
    tbody.innerHTML = "";

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

    // per role sums
    const byRole = groupByRole(filtered);
    Object.keys(byRole).sort((a, b) => a.localeCompare(b)).forEach(role => {
      const rows = byRole[role] || [];
      let contacted = 0, replied = 0, screen = 0;

      rows.forEach(row => {
        contacted += num(row.contacted);
        replied += num(row.replied);
        screen += num(row.recruiter_screen || row.recruiter_screened || row.recruiterScreen);
      });

      totalContacted += contacted;
      totalReplied += replied;
      totalScreen += screen;

      const conv = contacted > 0 ? screen / contacted : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${formatNumber(contacted)}</td>
        <td>${formatNumber(replied)}</td>
        <td>${formatNumber(screen)}</td>
        <td>${conv === null ? "—" : `${(conv * 100).toFixed(0)}%`}</td>
      `;
      tbody.appendChild(tr);
    });

    const overallConv = totalContacted > 0 ? totalScreen / totalContacted : null;

    $("sourcingSummary").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${formatNumber(totalContacted)}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${formatNumber(totalReplied)}</div></div>
      <div class="kpi">
        <div class="label">Total Recruiter Screens</div>
        <div class="value">${formatNumber(totalScreen)}</div>
        <div class="sub">${overallConv === null ? "— conversion" : `${(overallConv * 100).toFixed(0)}% conversion`}</div>
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

  function renderHires(hiredRows) {
    const tbody = $("hiresTable");
    tbody.innerHTML = "";

    // Header-only / empty is valid
    if (!hiredRows || hiredRows.length === 0) {
      $("hiresKpis").innerHTML = `
        <div class="kpi"><div class="label">Total Hires</div><div class="value">0</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">—</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">—</div></div>
      `;
      return;
    }

    const tthValues = [];
    const ttfValues = [];
    const processValues = [];

    hiredRows.forEach(row => {
      const liveDate = parseDate(getField(row, ["live_date", "live date"]));
      const signatureDate = parseDate(getField(row, ["signature_date", "signature date"]));
      const startDate = parseDate(getField(row, ["start_date", "start date"]));
      const firstContact = parseDate(getField(row, ["1st_contact", "first_contact", "1st contact", "first contact"]));

      const tth = dayDiff(liveDate, signatureDate);
      const ttf = dayDiff(liveDate, startDate);
      const daysInProcess = dayDiff(firstContact, signatureDate);

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);
      if (daysInProcess !== null) processValues.push(daysInProcess);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${getField(row, ["role"])}</td>
        <td>${getField(row, ["first_name", "first name"])}</td>
        <td>${getField(row, ["last_name", "last name"])}</td>
        <td>${getField(row, ["source"])}</td>
        <td>${getField(row, ["salary"])}</td>
        <td>${getField(row, ["live_date", "live date"])}</td>
        <td>${getField(row, ["1st_contact", "first_contact", "1st contact", "first contact"])}</td>
        <td>${getField(row, ["signature_date", "signature date"])}</td>
        <td>${getField(row, ["start_date", "start date"])}</td>
        <td>${tth !== null ? tth : "—"}</td>
        <td>${ttf !== null ? ttf : "—"}</td>
        <td>${daysInProcess !== null ? daysInProcess : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthValues);
    const avgTtf = average(ttfValues);

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(hiredRows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(1) : "—"}</div></div>
    `;
  }

  /* ---------------- WEEK SELECTION SYNC ---------------- */

  function syncWeekSelections() {
    state.pipelineOptions = getWeekOptions(state.inventoryRows);
    state.activityOptions = getWeekOptions(state.weeklyRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    const pipelineSelect = $("pipelineWeekSelect");
    const activitySelect = $("activityWeekSelect");
    const sourcingSelect = $("sourcingWeekSelect");

    // keep existing selections if possible
    setSelectOptions(pipelineSelect, state.pipelineOptions, state.selectedPipelineWeek);
    setSelectOptions(activitySelect, state.activityOptions, state.selectedActivityWeek);
    setSelectOptions(sourcingSelect, state.sourcingOptions, state.selectedSourcingWeek);

    state.selectedPipelineWeek = pipelineSelect.value;
    state.selectedActivityWeek = activitySelect.value;
    state.selectedSourcingWeek = sourcingSelect.value;
  }

  /* ---------------- MAIN RENDER ---------------- */

  function renderFromState() {
    renderPipelineInventory(state.inventoryRows, state.targets, state.selectedPipelineWeek);
    renderActivityWeekly(state.weeklyRows, state.selectedActivityWeek);
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
    renderHires(state.hiredRows);
    renderOverview(state.overviewRows, state.inventoryRows, state.targets, state.selectedPipelineWeek);
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("sourcingError", "");
    setError("hiresError", "");

    try {
      const [overviewRows, weeklyRows, inventoryRows, sourcingRows, hiredRows, targets] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipeline_weekly", CSV.pipeline_weekly),
        loadCSV("pipeline_inventory", CSV.pipeline_inventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("targets", CSV.targets)
      ]);

      state.overviewRows = overviewRows;
      state.weeklyRows = weeklyRows;
      state.inventoryRows = inventoryRows;
      state.sourcingRows = sourcingRows;

      // hired: tolerate header-only or totally empty
      state.hiredRows = Array.isArray(hiredRows) ? hiredRows : [];

      state.targets = targets;

      syncWeekSelections();
      renderFromState();

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      // show general error, but keep tabs clickable
      setError("pipelineError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      setError("sourcingError", `Error: ${e.message}`);
      setError("hiresError", `Error: ${e.message}`);
      console.error(e);
    }
  }

  /* ---------------- EVENTS ---------------- */

  function handlePipelineWeekChange() {
    state.selectedPipelineWeek = $("pipelineWeekSelect").value;
    renderPipelineInventory(state.inventoryRows, state.targets, state.selectedPipelineWeek);
    renderOverview(state.overviewRows, state.inventoryRows, state.targets, state.selectedPipelineWeek);
  }

  function handleActivityWeekChange() {
    state.selectedActivityWeek = $("activityWeekSelect").value;
    renderActivityWeekly(state.weeklyRows, state.selectedActivityWeek);
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  $("refreshBtn").addEventListener("click", refreshAll);
  $("pipelineWeekSelect").addEventListener("change", handlePipelineWeekChange);
  $("activityWeekSelect").addEventListener("change", handleActivityWeekChange);
  $("sourcingWeekSelect").addEventListener("change", handleSourcingWeekChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
