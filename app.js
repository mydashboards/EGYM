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
  const ALL_FILTER_KEY = "__all__";

  // reviewed removed everywhere
  const PIPELINE_STAGES = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];
  const ACTIVITY_STAGES = ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"];

  const state = {
    overviewRows: [],
    weeklyRows: [],
    inventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    targets: [],

    pipelineOptions: [],
    activityOptions: [],
    sourcingOptions: [],

    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: "",

    selectedPipelineRole: ALL_FILTER_KEY,
    selectedPipelineRecruiter: ALL_FILTER_KEY,

    selectedActivityRole: ALL_FILTER_KEY,
    selectedActivityRecruiter: ALL_FILTER_KEY
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

  async function loadCSV(key, url) {
    const cacheBuster = `cb=${Date.now()}`;
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}${cacheBuster}`;

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const parsed = parseCSV(text);
      if (parsed.isHtml || !parsed.headers.length) throw new Error("Empty or invalid CSV");

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      throw e;
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

  function getRecruiter(row) {
    const v = getField(row, ["recruiter", "Recruiter"]);
    return String(v || "").trim();
  }

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

  function setWeekSelectOptions(select, options, currentValue) {
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

    const def = pickDefaultWeekKey(options);
    select.value = def || ALL_TIME_KEY;
  }

  function setFilterSelectOptions(select, values, currentValue, allLabel) {
    select.innerHTML = "";

    const all = document.createElement("option");
    all.value = ALL_FILTER_KEY;
    all.textContent = allLabel;
    select.appendChild(all);

    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

    if (currentValue && [...select.options].some(x => x.value === currentValue)) {
      select.value = currentValue;
    } else {
      select.value = ALL_FILTER_KEY;
    }
  }

  function filterRowsByWeek(rows, selectedWeekKey) {
    if (selectedWeekKey === ALL_TIME_KEY) return rows;
    return rows.filter(r => weekKey(r) === selectedWeekKey);
  }

  function filterRowsByRoleRecruiter(rows, roleValue, recruiterValue) {
    return rows.filter(r => {
      const roleOk = roleValue === ALL_FILTER_KEY || String(r.role || "").trim() === roleValue;
      const rec = getRecruiter(r);
      const recruiterOk = recruiterValue === ALL_FILTER_KEY || rec === recruiterValue;
      return roleOk && recruiterOk;
    });
  }

  function groupByRole(rows) {
    const by = {};
    rows.forEach(r => {
      const role = String(r.role || "").trim();
      if (!role) return;
      (by[role] ||= []).push(r);
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

  /* ---------------- HEALTH (inventory snapshot) ---------------- */

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

    if (actual.sourced < minN) return "new";

    const step1Exp = num(getField(target, ["step1_from_sourced_exp"]));
    const techLightExp = num(getField(target, ["techlight_from_step1_exp"]));
    const techIvExp = num(getField(target, ["techiv_from_techlight_exp"]));
    const finalExp = num(getField(target, ["final_from_techiv_exp"]));
    const offerExp = num(getField(target, ["offer_from_final_exp"]));
    const hiredExp = num(getField(target, ["hired_from_offer_exp"]));

    const exps = [step1Exp, techLightExp, techIvExp, finalExp, offerExp, hiredExp];
    if (exps.some(x => !x || x <= 0)) return "new";

    const req = {};
    req.hired = 1;
    req.offer = req.hired / hiredExp;
    req.final = req.offer / offerExp;
    req.tech_iv = req.final / finalExp;
    req.tech_light = req.tech_iv / techIvExp;
    req.step1 = req.tech_light / techLightExp;
    req.sourced = req.step1 / step1Exp;

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

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipelineInventory(inventoryRows, targets, weekKeySelected, roleFilter, recruiterFilter) {
    const weekFiltered = filterRowsByWeek(inventoryRows, weekKeySelected);
    const filtered = filterRowsByRoleRecruiter(weekFiltered, roleFilter, recruiterFilter);

    const byRole = groupByRole(filtered);
    const targetByRole = {};
    targets.forEach(t => { if (t.role) targetByRole[t.role] = t; });

    const roles = Object.keys(byRole).sort((a, b) => a.localeCompare(b));
    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    roles.forEach(role => {
      const rows = byRole[role] || [];
      const sums = sumStageCounts(rows, PIPELINE_STAGES);

      const target = targetByRole[role];
      const health = target ? computeInventoryHealth(sums, target) : "new";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${formatNumber(sums.sourced)}</td>
        <td>${formatNumber(sums.step1)}</td>
        <td>${formatNumber(sums.tech_light)}</td>
        <td>${formatNumber(sums.tech_iv)}</td>
        <td>${formatNumber(sums.final)}</td>
        <td>${formatNumber(sums.offer)}</td>
        <td>${formatNumber(sums.hired)}</td>
        <td>${healthDotHTML(health)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: ACTIVITY ---------------- */

  function renderActivityWeekly(weeklyRows, weekKeySelected, roleFilter, recruiterFilter) {
    const weekFiltered = filterRowsByWeek(weeklyRows, weekKeySelected);
    const filtered = filterRowsByRoleRecruiter(weekFiltered, roleFilter, recruiterFilter);

    const totals = sumStageCounts(filtered, ACTIVITY_STAGES);

    const summary = $("activitySummary");
    summary.innerHTML = ACTIVITY_STAGES.map(s => {
      const label = s.replace("_", " ").toUpperCase();
      return `<div class="kpi"><div class="label">${label}</div><div class="value">${formatNumber(totals[s])}</div></div>`;
    }).join("");

    const byRole = groupByRole(filtered);
    const roles = Object.keys(byRole).sort((a, b) => a.localeCompare(b));

    const thead = $("activityHead");
    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${ACTIVITY_STAGES.map(s => `<th>${s.replace("_", " ").toUpperCase()}</th>`).join("")}
      </tr>
    `;

    const tbody = $("activityTable");
    tbody.innerHTML = "";

    roles.forEach(role => {
      const sums = sumStageCounts(byRole[role] || [], ACTIVITY_STAGES);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${ACTIVITY_STAGES.map(s => `<td>${formatNumber(sums[s])}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing(sourcingRows, selectedWeekKey) {
    const filtered = filterRowsByWeek(sourcingRows, selectedWeekKey);

    const tbody = $("sourcingTable");
    tbody.innerHTML = "";

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

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

    hiredRows.forEach(row => {
      const liveDate = parseDate(getField(row, ["live_date", "live date"]));
      const signatureDate = parseDate(getField(row, ["signature_date", "signature date"]));
      const startDate = parseDate(getField(row, ["start_date", "start date"]));

      const tth = dayDiff(liveDate, signatureDate);
      const ttf = dayDiff(liveDate, startDate);

      if (tth !== null) tthValues.push(tth);
      if (ttf !== null) ttfValues.push(ttf);

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
        <td>—</td>
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

  /* ---------------- OVERVIEW ---------------- */

  function renderOverview(overviewRows) {
    const openRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = overviewRows.reduce((s, r) => s + num(r.openings), 0);

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
    `;

    const healthSummary = $("overviewHealthSummary");
    healthSummary.innerHTML = `
      <div class="health-badge"><span class="health-dot good"></span><span>Healthy roles</span></div>
      <div class="health-badge"><span class="health-dot warn"></span><span>At risk roles</span></div>
      <div class="health-badge"><span class="health-dot bad"></span><span>Critical roles</span></div>
    `;

    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    overviewRows.forEach(r => {
      const recruiter = getRecruiter(r); // <-- now recruiter, not owner
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.location || ""}</td>
        <td>${r.openings || ""}</td>
        <td>${recruiter || ""}</td>
        <td><span class="status-dot neutral"></span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- FILTER OPTIONS BUILD ---------------- */

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(v => String(v).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function buildRoleRecruiterOptions(inventoryRows, weeklyRows) {
    const roles = uniqueSorted([...inventoryRows, ...weeklyRows].map(r => r.role));
    const recruiters = uniqueSorted([...inventoryRows, ...weeklyRows].map(r => getRecruiter(r)));

    setFilterSelectOptions($("pipelineRoleSelect"), roles, state.selectedPipelineRole, "All roles");
    setFilterSelectOptions($("activityRoleSelect"), roles, state.selectedActivityRole, "All roles");

    setFilterSelectOptions($("pipelineRecruiterSelect"), recruiters, state.selectedPipelineRecruiter, "All recruiters");
    setFilterSelectOptions($("activityRecruiterSelect"), recruiters, state.selectedActivityRecruiter, "All recruiters");

    state.selectedPipelineRole = $("pipelineRoleSelect").value;
    state.selectedActivityRole = $("activityRoleSelect").value;
    state.selectedPipelineRecruiter = $("pipelineRecruiterSelect").value;
    state.selectedActivityRecruiter = $("activityRecruiterSelect").value;
  }

  /* ---------------- WEEK SELECTION SYNC ---------------- */

  function syncWeekSelections() {
    state.pipelineOptions = getWeekOptions(state.inventoryRows);
    state.activityOptions = getWeekOptions(state.weeklyRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    setWeekSelectOptions($("pipelineWeekSelect"), state.pipelineOptions, state.selectedPipelineWeek);
    setWeekSelectOptions($("activityWeekSelect"), state.activityOptions, state.selectedActivityWeek);
    setWeekSelectOptions($("sourcingWeekSelect"), state.sourcingOptions, state.selectedSourcingWeek);

    state.selectedPipelineWeek = $("pipelineWeekSelect").value;
    state.selectedActivityWeek = $("activityWeekSelect").value;
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
  }

  /* ---------------- MAIN RENDER ---------------- */

  function renderFromState() {
    renderOverview(state.overviewRows);

    renderPipelineInventory(
      state.inventoryRows,
      state.targets,
      state.selectedPipelineWeek,
      state.selectedPipelineRole,
      state.selectedPipelineRecruiter
    );

    renderActivityWeekly(
      state.weeklyRows,
      state.selectedActivityWeek,
      state.selectedActivityRole,
      state.selectedActivityRecruiter
    );

    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
    renderHires(state.hiredRows);
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("activityError", "");
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
      state.hiredRows = Array.isArray(hiredRows) ? hiredRows : [];
      state.targets = targets;

      syncWeekSelections();
      buildRoleRecruiterOptions(state.inventoryRows, state.weeklyRows);
      renderFromState();

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      setError("pipelineError", `Error: ${e.message}`);
      setError("activityError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      setError("sourcingError", `Error: ${e.message}`);
      setError("hiresError", `Error: ${e.message}`);
      console.error(e);
    }
  }

  /* ---------------- EVENTS ---------------- */

  function onPipelineFiltersChange() {
    state.selectedPipelineWeek = $("pipelineWeekSelect").value;
    state.selectedPipelineRole = $("pipelineRoleSelect").value;
    state.selectedPipelineRecruiter = $("pipelineRecruiterSelect").value;

    renderPipelineInventory(
      state.inventoryRows,
      state.targets,
      state.selectedPipelineWeek,
      state.selectedPipelineRole,
      state.selectedPipelineRecruiter
    );
  }

  function onActivityFiltersChange() {
    state.selectedActivityWeek = $("activityWeekSelect").value;
    state.selectedActivityRole = $("activityRoleSelect").value;
    state.selectedActivityRecruiter = $("activityRecruiterSelect").value;

    renderActivityWeekly(
      state.weeklyRows,
      state.selectedActivityWeek,
      state.selectedActivityRole,
      state.selectedActivityRecruiter
    );
  }

  function onSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  $("refreshBtn").addEventListener("click", refreshAll);

  $("pipelineWeekSelect").addEventListener("change", onPipelineFiltersChange);
  $("pipelineRoleSelect").addEventListener("change", onPipelineFiltersChange);
  $("pipelineRecruiterSelect").addEventListener("change", onPipelineFiltersChange);

  $("activityWeekSelect").addEventListener("change", onActivityFiltersChange);
  $("activityRoleSelect").addEventListener("change", onActivityFiltersChange);
  $("activityRecruiterSelect").addEventListener("change", onActivityFiltersChange);

  $("sourcingWeekSelect").addEventListener("change", onSourcingWeekChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
