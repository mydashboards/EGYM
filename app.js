document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipeline: "pipeline_weekly",
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
    pipelineRows: [],
    sourcingRows: [],
    hiredRows: [],
    targets: [],
    pipelineOptions: [],
    sourcingOptions: [],
    selectedPipelineWeek: "",
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
      headers.forEach((header, index) => {
        obj[header] = (line[index] || "").trim();
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
    see if (!value) return null;
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

  function getIsoWeekKey(date = new Date()) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
    const year = target.getUTCFullYear();
    return `${year}-KW${String(weekNumber).padStart(2, "0")}`;
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

  /* ---------------- TABS (always keep clickable) ---------------- */

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

  function computeHealth(roleRows, target, endWeekKey) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const sorted = roleRows
      .filter(r => weekKey(r))
      .sort((a, b) => {
        if (num(a.year) !== num(b.year)) return num(a.year) - num(b.year);
        return num(a.kw) - num(b.kw);
      });

    const eligible = endWeekKey
      ? sorted.filter(r => weekKey(r) <= endWeekKey)
      : sorted;

    const recent = eligible.slice(-lookback);

    const sums = {};
    ["sourced", "step1", "tech_light", "tech_iv", "final", "offer", "hired"].forEach(k => {
      sums[k] = recent.reduce((s, r) => s + num(r[k]), 0);
    });

    if (sums.sourced < minN) {
      return { health: "new", reason: "Not enough data" };
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

    for (const c of checks) {
      const prev = sums[c.b];
      const expected = num(c.exp);
      if (prev >= minN && expected > 0) {
        const actual = prev > 0 ? sums[c.a] / prev : 0;
        const score = actual / expected;
        const gap = expected - actual;

        if (score < worstScore) {
          worstScore = score;
        }
        if (gap > maxGap) {
          maxGap = gap;
          bottleneck = `${c.label} (${formatPercent(actual)} vs ${formatPercent(expected)})`;
        }
      }
    }

    if (worstScore === Infinity) {
      return { health: "new", reason: "Not enough data" };
    }

    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck };
    return { health: "healthy", reason: bottleneck };
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline(pipelineRows, targets, selectedWeekKey) {
    const byRole = {};
    pipelineRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(r);
    });

    const roles = new Set([...Object.keys(byRole), ...targets.map(t => t.role)]);

    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    roles.forEach(role => {
      const roleRows = byRole[role] || [];
      const weekRow = roleRows.find(r => weekKey(r) === selectedWeekKey) || {};
      const target = targets.find(t => t.role === role);
      const result = target ? computeHealth(roleRows, target, selectedWeekKey) : { health: "new", reason: "—" };

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${formatNumber(num(weekRow.sourced))}</td>
        <td>${formatNumber(num(weekRow.reviewed))}</td>
        <td>${formatNumber(num(weekRow.step1))}</td>
        <td>${formatNumber(num(weekRow.tech_light))}</td>
        <td>${formatNumber(num(weekRow.tech_iv))}</td>
        <td>${formatNumber(num(weekRow.final))}</td>
        <td>${formatNumber(num(weekRow.offer))}</td>
        <td>${formatNumber(num(weekRow.hired))}</td>
        <td>${healthDotHTML(result.health)}</td>
        <td>${result.reason || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(overviewRows, pipelineRows, targets, latestWeekKey) {
    const byRolePipeline = {};
    pipelineRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRolePipeline[role]) byRolePipeline[role] = [];
      byRolePipeline[role].push(r);
    });

    const targetByRole = {};
    targets.forEach(t => { targetByRole[t.role] = t; });

    const healthByRole = {};
    Object.keys(byRolePipeline).forEach(role => {
      const t = targetByRole[role];
      if (!t) return;
      healthByRole[role] = computeHealth(byRolePipeline[role], t, latestWeekKey).health;
    });

    const openRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = overviewRows.reduce((s, r) => s + num(r.openings), 0);

    const healthCounts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    overviewRows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      healthCounts[h] = (healthCounts[h] || 0) + 1;
    });

    $("overviewCards").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
    `;

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

  function renderHires(hiredRows, pipelineRows) {
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
    pipelineRows.forEach(row => {
      offerTotal += num(row.offer);
      hiredTotal += num(row.hired);
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

  function syncWeekSelections() {
    state.pipelineOptions = getWeekOptions(state.pipelineRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    const pipelineSelect = $("pipelineWeekSelect");
    const sourcingSelect = $("sourcingWeekSelect");

    setSelectOptions(pipelineSelect, state.pipelineOptions);
    setSelectOptions(sourcingSelect, state.sourcingOptions);

    const currentWeekKey = getIsoWeekKey();
    const latestPipelineWeek = getLatestWeekKey(state.pipelineRows) || (state.pipelineOptions[0] ? state.pipelineOptions[0].key : "");
    const latestSourcingWeek = getLatestWeekKey(state.sourcingRows) || (state.sourcingOptions[0] ? state.sourcingOptions[0].key : "");
    const pipelineDefault = state.pipelineOptions.some(opt => opt.key === currentWeekKey) ? currentWeekKey : latestPipelineWeek;
    const sourcingDefault = state.sourcingOptions.some(opt => opt.key === currentWeekKey) ? currentWeekKey : latestSourcingWeek;

    if (!state.selectedPipelineWeek || !state.pipelineOptions.some(opt => opt.key === state.selectedPipelineWeek)) {
      state.selectedPipelineWeek = pipelineDefault;
    }
    if (!state.selectedSourcingWeek || !state.sourcingOptions.some(opt => opt.key === state.selectedSourcingWeek)) {
      state.selectedSourcingWeek = sourcingDefault;
    }

    if (state.selectedPipelineWeek) pipelineSelect.value = state.selectedPipelineWeek;
    if (state.selectedSourcingWeek) sourcingSelect.value = state.selectedSourcingWeek;
  }

  function renderFromState() {
    renderPipeline(state.pipelineRows, state.targets, state.selectedPipelineWeek);
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
    renderHires(state.hiredRows, state.pipelineRows);
    renderOverview(state.overviewRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
  }

  function normalizeTargets(rows) {
    return rows.map(row => ({
      ...row,
      role: getField(row, ["role"]) || row.role || "",
      lookback_weeks: getField(row, ["lookback_weeks"]) || row.lookback_weeks || "",
      min_prev_stage_n: getField(row, ["min_prev_stage_n"]) || row.min_prev_stage_n || "",
      step1_from_sourced_exp: getField(row, ["step1_from_sourced_exp", "screen_to_step1_exp"]) || row.step1_from_sourced_exp || "",
      techlight_from_step1_exp: getField(row, ["techlight_from_step1_exp", "step1_to_tech_exp"]) || row.techlight_from_step1_exp || "",
      techiv_from_techlight_exp: getField(row, ["techiv_from_techlight_exp", "step1_to_tech_exp"]) || row.techiv_from_techlight_exp || "",
      final_from_techiv_exp: getField(row, ["final_from_techiv_exp", "tech_to_final_exp"]) || row.final_from_techiv_exp || "",
      offer_from_final_exp: getField(row, ["offer_from_final_exp", "final_to_offer_exp"]) || row.offer_from_final_exp || "",
      hired_from_offer_exp: getField(row, ["hired_from_offer_exp", "offer_to_hired_exp"]) || row.hired_from_offer_exp || ""
    }));
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("sourcingError", "");
    setError("hiresError", "");

    try {
      const [overviewRows, pipelineRows, sourcingRows, hiredRows, targets] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipeline", CSV.pipeline),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("targets", CSV.targets)
      ]);

      state.overviewRows = overviewRows;
      state.pipelineRows = pipelineRows;
      state.sourcingRows = sourcingRows;
      state.hiredRows = hiredRows;
      state.targets = normalizeTargets(targets);

      syncWeekSelections();
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
    renderPipeline(state.pipelineRows, state.targets, state.selectedPipelineWeek);
    renderOverview(state.overviewRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
  }

  function handleSourcingWeekChange() {
    state.selectedSourcingWeek = $("sourcingWeekSelect").value;
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  $("refreshBtn").addEventListener("click", refreshAll);
  $("pipelineWeekSelect").addEventListener("change", handlePipelineWeekChange);
  $("sourcingWeekSelect").addEventListener("change", handleSourcingWeekChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
