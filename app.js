document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    sourcing:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv",
    // NEW: pipeline_inventory (end-of-week snapshot)
    inventory:
      "PASTE_PIPELINE_INVENTORY_CSV_URL_HERE"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipeline: "pipeline_weekly",
    inventory: "pipeline_inventory",
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
    pipelineRows: [], // weekly flow
    inventoryRows: [], // end-of-week snapshot (wide stages)
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
      .map((message) => `<div>${message}</div>`)
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
    const cleaned = (text || "").replace(/^\uFEFF/, "");
    const trimmed = cleaned.trim();
    if (!trimmed) return { headers: [], rows: [], isHtml: false };

    const lower = trimmed.toLowerCase();
    // detect html-ish responses (google sometimes returns <meta ...>)
    if (
      lower.startsWith("<!doctype") ||
      lower.startsWith("<html") ||
      lower.startsWith("<meta") ||
      lower.startsWith("<head") ||
      lower.startsWith("<body")
    ) {
      return { headers: [], rows: [], isHtml: true };
    }

    // support "sep=," style first line
    const lines = cleaned.split(/\r?\n/);
    let startIndex = 0;
    if (lines[0] && lines[0].toLowerCase().startsWith("sep=")) {
      startIndex = 1;
    }
    const content = lines.slice(startIndex).join("\n");

    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      const next = content[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
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
        if (current.some((value) => value !== "")) rows.push(current);
        current = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length || current.length) {
      current.push(field);
      if (current.some((value) => value !== "")) rows.push(current);
    }

    const headerRow = rows.shift() || [];
    const headers = headerRow.map((h) => normalizeHeader(h)).filter(Boolean);

    const mappedRows = rows.map((line) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = (line[index] || "").trim();
      });
      return obj;
    });

    return { headers, rows: mappedRows, isHtml: false };
  }

  function logLoadFailure({ key, url, status, text, error }) {
    // eslint-disable-next-line no-console
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
        logLoadFailure({
          key,
          url: fullUrl,
          status,
          text,
          error: new Error(`HTTP ${res.status}`)
        });
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = parseCSV(text);

      // eslint-disable-next-line no-console
      console.log(`[${key}] status=${status} headers=${parsed.headers.length} rows=${parsed.rows.length}`);

      if (parsed.isHtml) {
        logLoadFailure({
          key,
          url: fullUrl,
          status,
          text,
          error: new Error("HTML response instead of CSV")
        });
        throw new Error("Invalid CSV response");
      }

      // hired can be empty (header-only) => accept as valid empty
      const allowEmpty = key === "hired";

      if (!parsed.headers.length || (!allowEmpty && !parsed.rows.length)) {
        logLoadFailure({
          key,
          url: fullUrl,
          status,
          text,
          error: new Error("Empty or invalid CSV")
        });
        throw new Error("Empty or invalid CSV");
      }

      setDataError(key, "");
      return parsed.rows;
    } catch (error) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key] || key}`);
      if (!text || status === "unknown") {
        logLoadFailure({ key, url: fullUrl, status, text, error });
      }
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
      const normalizedKey = normalizeHeader(String(key));
      if (
        row[normalizedKey] !== undefined &&
        row[normalizedKey] !== null &&
        String(row[normalizedKey]).trim() !== ""
      ) {
        return row[normalizedKey];
      }
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }
    return "";
  };

  function formatPercent(value) {
    if (value === null || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(0)}%`;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "0";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return numeric.toLocaleString();
  }

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning" || health === "at_risk")
      return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (health === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
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

  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
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

  function weekKey(row) {
    const year = num(getField(row, ["year"]));
    const kw = num(getField(row, ["kw"]));
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2, "0")}`;
  }

  function getLatestWeekKey(rows) {
    const years = rows.map((r) => num(r.year)).filter(Boolean);
    if (!years.length) return "";
    const latestYear = Math.max(...years);
    const weeksInYear = rows
      .filter((r) => num(r.year) === latestYear)
      .map((r) => num(r.kw))
      .filter(Boolean);
    const latestKW = weeksInYear.length ? Math.max(...weeksInYear) : 0;
    return latestKW ? `${latestYear}-KW${String(latestKW).padStart(2, "0")}` : "";
  }

  function getWeekOptions(rows) {
    const options = new Map();
    rows.forEach((row) => {
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

  // ISO week helper for default selection
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
    const current = select.value;
    select.innerHTML = "";
    options.forEach((o) => {
      const option = document.createElement("option");
      option.value = o.key;
      option.textContent = `KW ${o.kw}`; // ONLY KW label
      select.appendChild(option);
    });
    if (current && options.some((opt) => opt.key === current)) {
      select.value = current;
    } else if (options.length) {
      select.value = options[0].key;
    }
  }

  /* ---------------- TARGET NORMALIZATION ---------------- */

  function normalizeTargets(rows) {
    return (rows || []).map((t) => {
      const role = (t.role || "").trim();
      return {
        ...t,
        role,
        // keep existing fields if already present, else map from alt headers
        lookback_weeks: t.lookback_weeks ?? "",
        min_prev_stage_n: t.min_prev_stage_n ?? "",
        // expected conversions (support both naming styles)
        step1_from_sourced_exp: t.step1_from_sourced_exp ?? t.screen_to_step1_exp ?? "",
        techlight_from_step1_exp: t.techlight_from_step1_exp ?? t.step1_to_tech_exp ?? "",
        techiv_from_techlight_exp: t.techiv_from_techlight_exp ?? t.tech_light_to_tech_iv_exp ?? "",
        final_from_techiv_exp: t.final_from_techiv_exp ?? t.tech_to_final_exp ?? t.tech_to_final_ex ?? "",
        offer_from_final_exp: t.offer_from_final_exp ?? t.final_to_offer_exp ?? "",
        hired_from_offer_exp: t.hired_from_offer_exp ?? t.offer_to_hired_exp ?? ""
      };
    });
  }

  /* ---------------- TABS ---------------- */

  function activateTab(tabId) {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
    const targetId = tabId || "overview";

    tabs.forEach((t) => {
      const isActive = t.dataset.tab === targetId;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((p) => {
      p.classList.toggle("active", p.id === targetId);
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    let hiresUnlocked = false;

    tabs.forEach((btn) => {
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

  /* ---------------- HEALTH LOGIC (from weekly flow) ---------------- */

  function computeHealth(roleRows, target, endWeekKey) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const sorted = (roleRows || [])
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

    if (sums.sourced < minN) return { health: "new", reason: "Not enough data" };

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

        if (score < worstScore) worstScore = score;
        if (gap > maxGap) {
          maxGap = gap;
          bottleneck = `${c.label} (${formatPercent(actual)} vs ${formatPercent(expected)})`;
        }
      }
    }

    if (worstScore === Infinity) return { health: "new", reason: "Not enough data" };
    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck };
    return { health: "healthy", reason: bottleneck };
  }

  /* ---------------- PIPELINE (inventory snapshot) ---------------- */

  function getInventoryStageColumns(rows) {
    const meta = new Set(["role", "year", "kw", "week_start"]);
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

  function ensurePipelineHeader(stageCols) {
    const tbody = $("pipelineTable");
    if (!tbody) return;

    const table = tbody.closest("table");
    if (!table) return;

    const theadRow = table.querySelector("thead tr");
    if (!theadRow) return;

    const stageThs = stageCols
      .map((c) => `<th>${String(c).replace(/_/g, " ").toUpperCase()}</th>`)
      .join("");

    theadRow.innerHTML = `
      <th>ROLE</th>
      ${stageThs}
      <th>HEALTH</th>
      <th>BOTTLENECK</th>
    `;
  }

  function renderPipeline(inventoryRows, weeklyRows, targets, selectedWeekKey) {
    const tbody = $("pipelineTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const invFiltered = (inventoryRows || []).filter((r) => weekKey(r) === selectedWeekKey);

    // stage columns derived from inventory (selected week if possible, else all)
    const stageCols = getInventoryStageColumns(invFiltered.length ? invFiltered : inventoryRows);
    ensurePipelineHeader(stageCols);

    if (!selectedWeekKey || !invFiltered.length) {
      return; // show empty table body
    }

    // weekly grouped by role (for health)
    const weeklyByRole = {};
    (weeklyRows || []).forEach((r) => {
      const role = r.role;
      if (!role) return;
      (weeklyByRole[role] ||= []).push(r);
    });

    // roles from inventory snapshot week
    const roles = Array.from(new Set(invFiltered.map((r) => r.role).filter(Boolean)));

    roles.forEach((role) => {
      const invRow = invFiltered.find((r) => r.role === role) || {};
      const target = (targets || []).find((t) => t.role === role);
      const res = target ? computeHealth(weeklyByRole[role] || [], target, selectedWeekKey) : { health: "new", reason: "—" };

      const stageTds = stageCols
        .map((c) => `<td>${formatNumber(num(invRow[c]))}</td>`)
        .join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        ${stageTds}
        <td>${healthDotHTML(res.health)}</td>
        <td>${res.reason || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- OVERVIEW ---------------- */

  function renderOverview(overviewRows, weeklyRows, targets, latestWeekKey) {
    const byRoleWeekly = {};
    (weeklyRows || []).forEach((r) => {
      const role = r.role;
      if (!role) return;
      (byRoleWeekly[role] ||= []).push(r);
    });

    const targetByRole = {};
    (targets || []).forEach((t) => {
      targetByRole[t.role] = t;
    });

    const healthByRole = {};
    Object.keys(byRoleWeekly).forEach((role) => {
      const t = targetByRole[role];
      if (!t) return;
      healthByRole[role] = computeHealth(byRoleWeekly[role], t, latestWeekKey).health;
    });

    const openRoles = (overviewRows || []).filter((r) => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = (overviewRows || []).filter((r) => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = (overviewRows || []).reduce((s, r) => s + num(r.openings), 0);

    const healthCounts = { healthy: 0, warning: 0, critical: 0, new: 0 };
    (overviewRows || []).forEach((r) => {
      const h = healthByRole[r.role] || "new";
      healthCounts[h] = (healthCounts[h] || 0) + 1;
    });

    const cards = $("overviewCards");
    if (cards) {
      cards.innerHTML = `
        <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
        <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
        <div class="kpi"><div class="label">Total Openings</div><div class="value">${totalOpenings}</div></div>
      `;
    }

    const healthSummary = $("overviewHealthSummary");
    if (healthSummary) {
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
    }

    const tbody = $("overviewTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    (overviewRows || []).forEach((r) => {
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

  /* ---------------- SOURCING ---------------- */

  function renderSourcing(sourcingRows, selectedWeekKey) {
    const tbody = $("sourcingTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const filtered = (sourcingRows || []).filter((r) => weekKey(r) === selectedWeekKey);

    let totalContacted = 0;
    let totalReplied = 0;
    let totalScreen = 0;

    filtered.forEach((row) => {
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

    const summary = $("sourcingSummary");
    if (summary) {
      summary.innerHTML = `
        <div class="kpi"><div class="label">Total Contacted</div><div class="value">${formatNumber(
          totalContacted
        )}</div></div>
        <div class="kpi"><div class="label">Total Replied</div><div class="value">${formatNumber(
          totalReplied
        )}</div></div>
        <div class="kpi"><div class="label">Total Recruiter Screens</div><div class="value">${formatNumber(
          totalScreen
        )}</div><div class="sub">${formatPercent(overallConv)} conversion</div></div>
      `;
    }
  }

  /* ---------------- HIRES ---------------- */

  function renderHires(hiredRows, weeklyRows) {
    const tbody = $("hiresTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    const tthValues = [];
    const ttfValues = [];
    const processValues = [];

    (hiredRows || []).forEach((row) => {
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
    (weeklyRows || []).forEach((row) => {
      offerTotal += num(row.offer);
      hiredTotal += num(row.hired);
    });

    const offerRate = offerTotal > 0 ? hiredTotal / offerTotal : null;

    const kpis = $("hiresKpis");
    if (kpis) {
      kpis.innerHTML = `
        <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(
          (hiredRows || []).length
        )}</div></div>
        <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth !== null ? avgTth.toFixed(
          1
        ) : "—"}</div></div>
        <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf !== null ? avgTtf.toFixed(
          1
        ) : "—"}</div></div>
        <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">${formatPercent(
          offerRate
        )}</div><div class="sub">${offerTotal ? `${formatNumber(hiredTotal)} hires / ${formatNumber(
          offerTotal
        )} offers` : "Offer data missing"}</div></div>
      `;
    }
  }

  /* ---------------- WEEK SELECTION SYNC ---------------- */

  function syncWeekSelections() {
    // Pipeline week must come from INVENTORY snapshot weeks
    state.pipelineOptions = getWeekOptions(state.inventoryRows);
    state.sourcingOptions = getWeekOptions(state.sourcingRows);

    const pipelineSelect = $("pipelineWeekSelect");
    const sourcingSelect = $("sourcingWeekSelect");

    setSelectOptions(pipelineSelect, state.pipelineOptions);
    setSelectOptions(sourcingSelect, state.sourcingOptions);

    const want = currentWeekKey();

    const latestPipeline = getLatestWeekKey(state.inventoryRows) || (state.pipelineOptions[0]?.key || "");
    const latestSourcing = getLatestWeekKey(state.sourcingRows) || (state.sourcingOptions[0]?.key || "");

    state.selectedPipelineWeek = state.pipelineOptions.some((o) => o.key === want) ? want : latestPipeline;
    state.selectedSourcingWeek = state.sourcingOptions.some((o) => o.key === want) ? want : latestSourcing;

    if (pipelineSelect && state.selectedPipelineWeek) pipelineSelect.value = state.selectedPipelineWeek;
    if (sourcingSelect && state.selectedSourcingWeek) sourcingSelect.value = state.selectedSourcingWeek;
  }

  function renderFromState() {
    renderPipeline(state.inventoryRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
    renderHires(state.hiredRows, state.pipelineRows);
    // Overview health uses the same week key (flow-based health)
    renderOverview(state.overviewRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("sourcingError", "");
    setError("hiresError", "");

    try {
      const [overviewRows, pipelineRows, inventoryRows, sourcingRows, hiredRows, targets] = await Promise.all([
        loadCSV("overview", CSV.overview),
        loadCSV("pipeline", CSV.pipeline),
        loadCSV("inventory", CSV.inventory),
        loadCSV("sourcing", CSV.sourcing),
        loadCSV("hired", CSV.hired),
        loadCSV("targets", CSV.targets)
      ]);

      state.overviewRows = overviewRows;
      state.pipelineRows = pipelineRows;
      state.inventoryRows = inventoryRows;
      state.sourcingRows = sourcingRows;
      state.hiredRows = hiredRows;
      state.targets = normalizeTargets(targets);

      syncWeekSelections();
      renderFromState();

      const lastUpdated = $("lastUpdated");
      if (lastUpdated) lastUpdated.textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      setError("pipelineError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      setError("sourcingError", `Error: ${e.message}`);
      setError("hiresError", `Error: ${e.message}`);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  function handlePipelineWeekChange() {
    const sel = $("pipelineWeekSelect");
    if (!sel) return;
    state.selectedPipelineWeek = sel.value;
    renderPipeline(state.inventoryRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
    renderOverview(state.overviewRows, state.pipelineRows, state.targets, state.selectedPipelineWeek);
  }

  function handleSourcingWeekChange() {
    const sel = $("sourcingWeekSelect");
    if (!sel) return;
    state.selectedSourcingWeek = sel.value;
    renderSourcing(state.sourcingRows, state.selectedSourcingWeek);
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  const refreshBtn = $("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

  const pipelineWeekSelect = $("pipelineWeekSelect");
  if (pipelineWeekSelect) pipelineWeekSelect.addEventListener("change", handlePipelineWeekChange);

  const sourcingWeekSelect = $("sourcingWeekSelect");
  if (sourcingWeekSelect) sourcingWeekSelect.addEventListener("change", handleSourcingWeekChange);

  refreshAll();
  setInterval(refreshAll, 60000);
});
