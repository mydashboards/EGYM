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
  const MANAGEMENT_PASSWORD = "EGYM2027";

  const VIEW_STORAGE_KEY = "dashboard_view";
  const HIRES_UNLOCK_KEY = "hires_unlocked";
  const MGMT_UNLOCK_KEY = "mgmt_unlocked";

  const STAGE_ORDER = ["sourced","step1","tech_light","tech_iv","final","offer","hired"];

  /* ---------------- STATE ---------------- */

  const state = {
    view: "contributor",
    overviewRows: [],
    weeklyRows: [],        // long: year, kw, role, stage, count
    inventoryRows: [],     // long: year, kw, role, stage, count
    sourcingRows: [],
    hiredRows: [],
    targetRows: [],
    roleNotesRows: [],

    pipelineWeek: "",
    activityWeek: "",
    sourcingWeek: "",
    mgmtWeek: "",

    mgmtRole: "all",
    mgmtRecruiter: "all",

    charts: { pipelineHealth: null, sourceMix: null }
  };

  /* ---------------- DOM HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);

  const dataErrors = new Map();
  function setDataError(key, msg) {
    if (msg) dataErrors.set(key, msg);
    else dataErrors.delete(key);
    const banner = $("dataErrors");
    if (!banner) return;
    if (dataErrors.size === 0) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }
    banner.classList.remove("hidden");
    banner.innerHTML = Array.from(dataErrors.values()).map(m => `<div>${esc(m)}</div>`).join("");
  }

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function num(v){
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeHeader(v){
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function normalizeStage(v){
    return normalizeHeader(v);
  }

  function formatWeekLabel(key){
    if (key === "all") return "All time";
    const m = String(key).match(/^(\d{4})-KW(\d{2})$/);
    if (!m) return key;
    return `KW ${Number(m[2])}`;
  }

  function weekKeyFrom(year, kw){
    if (!year || !kw) return "";
    return `${year}-KW${String(kw).padStart(2,"0")}`;
  }

  function getWeekKey(row){
    const y = num(row.year);
    const k = num(row.kw);
    return weekKeyFrom(y,k);
  }

  function isRowInWeek(row, selectedKey){
    if (selectedKey === "all") return true;
    return getWeekKey(row) === selectedKey;
  }

  function uniq(arr){
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function sortWeeksDesc(keys){
    return keys
      .filter(k => k && k !== "all")
      .sort((a,b) => a.localeCompare(b))
      .reverse();
  }

  /* ---------------- CSV PARSER ---------------- */

  function parseCSV(text){
    const cleaned = String(text ?? "").replace(/^\uFEFF/, "");
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
      const next = cleaned[i+1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          field += '"';
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

    const mapped = rows.map(line => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (line[idx] ?? "").trim();
      });
      return obj;
    });

    return { headers, rows: mapped, isHtml: false };
  }

  async function loadCSV(key, url){
    const joiner = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${joiner}cb=${Date.now()}`;
    let text = "";
    let status = "unknown";

    try {
      const res = await fetch(fullUrl, { cache: "no-store" });
      status = res.status;
      text = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseCSV(text);
      if (parsed.isHtml || !parsed.headers.length) throw new Error("Empty or invalid CSV");

      setDataError(key, "");
      return parsed.rows;
    } catch (e) {
      setDataError(key, `Data source unavailable: ${DATA_SOURCE_LABELS[key]}`);
      // console debug
      console.log("CSV load failed", { key, url: fullUrl, status, snippet: text.slice(0, 200), error: e });
      throw e;
    }
  }

  /* ---------------- NORMALIZERS ---------------- */

  // pipeline_weekly can be long (stage,count) OR wide (stages as columns)
  function normalizeWeekly(rows){
    if (!rows.length) return [];
    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");
    if (hasStage && hasCount) {
      return rows.map(r => ({
        year: num(r.year),
        kw: num(r.kw),
        role: r.role || "",
        stage: normalizeStage(r.stage),
        count: num(r.count)
      }));
    }

    const core = new Set(["role","kw","year","recruiter","health","week_start"]);
    const out = [];

    rows.forEach(r => {
      const year = num(r.year);
      const kw = num(r.kw);
      const role = r.role || "";
      Object.keys(r).forEach(k => {
        if (core.has(k)) return;
        const stage = normalizeStage(k);
        if (!stage) return;
        out.push({
          year, kw, role,
          stage,
          count: num(r[k])
        });
      });
    });

    return out;
  }

  // pipeline_inventory: YOUR SHEET is WIDE (step1, tech_light, ... columns)
  // also supports LONG (stage,count) just in case
  function normalizeInventory(rows){
    if (!rows.length) return [];

    const hasStage = Object.prototype.hasOwnProperty.call(rows[0], "stage");
    const hasCount = Object.prototype.hasOwnProperty.call(rows[0], "count");
    if (hasStage && hasCount) {
      return rows.map(r => ({
        year: num(r.year),
        kw: num(r.kw),
        role: r.role || "",
        stage: normalizeStage(r.stage),
        count: num(r.count)
      }));
    }

    // wide → long
    const core = new Set(["role","kw","year","recruiter","health","week_start"]);
    const out = [];

    rows.forEach(r => {
      const year = num(r.year);
      const kw = num(r.kw);
      const role = r.role || "";
      Object.keys(r).forEach(k => {
        if (core.has(k)) return;
        const stage = normalizeStage(k);
        if (!stage) return;
        out.push({
          year, kw, role,
          stage,
          count: num(r[k])
        });
      });
    });

    return out;
  }

  function normalizeRoleNotes(rows){
    return rows.map(r => ({
      role: r.role || "",
      kw: num(r.kw),
      year: num(r.year) || 0,
      recruiter: r.recruiter || "",
      challenges: r.challenges || "",
      highlights: r.highlights || "",
      big_wins: r.big_wins || ""
    }));
  }

  /* ---------------- TABS (Contributor) ---------------- */

  function activateTab(tabId){
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll("#contributorView .panel");
    const target = tabId || "overview";

    tabs.forEach(t => {
      const isActive = t.dataset.tab === target;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach(p => p.classList.toggle("active", p.id === target));
  }

  function initTabs(){
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;

        // hires gated
        if (id === "hires" && sessionStorage.getItem(HIRES_UNLOCK_KEY) !== "1") {
          const input = window.prompt("Enter password to access Hires & KPIs:");
          if (input !== HIRES_PASSWORD) return;
          sessionStorage.setItem(HIRES_UNLOCK_KEY, "1");
          $("hiresGate")?.classList.add("hidden");
          $("hiresContent")?.classList.remove("hidden");
        }

        window.location.hash = id;
        activateTab(id);
      });
    });

    window.addEventListener("hashchange", () => {
      const id = window.location.hash.replace("#", "") || "overview";
      activateTab(id);
    });

    const initial = window.location.hash.replace("#", "") || "overview";
    activateTab(initial);

    // restore hires unlocked UI
    if (sessionStorage.getItem(HIRES_UNLOCK_KEY) === "1") {
      $("hiresGate")?.classList.add("hidden");
      $("hiresContent")?.classList.remove("hidden");
    }
  }

  /* ---------------- VIEW SWITCH + MGMT GATE ---------------- */

  function setView(view){
    state.view = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);

    const isContributor = view === "contributor";
    $("contributorView").classList.toggle("hidden", !isContributor);
    $("managementView").classList.toggle("hidden", isContributor);

    $("viewContributor").classList.toggle("active", isContributor);
    $("viewManagement").classList.toggle("active", !isContributor);

    if (!isContributor) {
      ensureMgmtUnlockedOrKickBack();
    }
  }

  function ensureMgmtUnlockedOrKickBack(){
    const unlocked = sessionStorage.getItem(MGMT_UNLOCK_KEY) === "1";
    const gate = $("managementGate");
    const content = $("managementContent");

    if (unlocked) {
      gate?.classList.add("hidden");
      content?.classList.remove("hidden");
      renderManagement();
      return true;
    }

    const input = window.prompt("Enter password to access Management View:");
    if (input !== MANAGEMENT_PASSWORD) {
      gate.textContent = "Access denied.";
      gate.classList.remove("hidden");
      content.classList.add("hidden");
      // revert to contributor
      setView("contributor");
      return false;
    }

    sessionStorage.setItem(MGMT_UNLOCK_KEY, "1");
    gate?.classList.add("hidden");
    content?.classList.remove("hidden");
    renderManagement();
    return true;
  }

  /* ---------------- WEEK SELECTS ---------------- */

  function fillWeekSelect(select, weekKeys, selected){
    if (!select) return;
    select.innerHTML = "";

    // always include All time for Activity + Sourcing
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All time";
    select.appendChild(allOpt);

    weekKeys.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = formatWeekLabel(k);
      select.appendChild(opt);
    });

    select.value = selected && (selected === "all" || weekKeys.includes(selected)) ? selected : (weekKeys[0] || "all");
  }

  function fillWeekSelectNoAll(select, weekKeys, selected){
    if (!select) return;
    select.innerHTML = "";
    weekKeys.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = formatWeekLabel(k);
      select.appendChild(opt);
    });
    select.value = selected && weekKeys.includes(selected) ? selected : (weekKeys[0] || "");
  }

  function getLatestWeek(keys){
    const sorted = sortWeeksDesc(keys);
    return sorted[0] || "";
  }

  /* ---------------- RAG / HEALTH ---------------- */

  // Simple RAG from overview sheet if present; fallback: neutral.
  function ragFromOverviewRow(row){
    // Accept values like "healthy", "at risk", "critical"
    const v = normalizeHeader(row.health || row.rag || "");
    if (v.includes("critical")) return "critical";
    if (v.includes("risk") || v.includes("warning") || v.includes("at_risk")) return "warning";
    if (v.includes("healthy") || v.includes("good")) return "healthy";
    return "new";
  }

  function dotHTML(status){
    if (status === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (status === "warning") return `<span class="status-dot warn" aria-label="At risk"></span>`;
    if (status === "critical") return `<span class="status-dot bad" aria-label="Critical"></span>`;
    return `<span class="status-dot neutral" aria-label="New"></span>`;
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(){
    const rows = state.overviewRows;

    // KPIs
    const openRoles = rows.filter(r => normalizeHeader(r.status) === "open").length;
    const filledRoles = rows.filter(r => normalizeHeader(r.status) === "filled").length;
    const openings = rows.reduce((s,r) => s + num(r.openings), 0);

    let h=0,w=0,c=0;
    rows.forEach(r => {
      const rag = ragFromOverviewRow(r);
      if (rag === "healthy") h += 1;
      if (rag === "warning") w += 1;
      if (rag === "critical") c += 1;
    });

    $("overviewKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Filled Roles</div><div class="value">${filledRoles}</div></div>
      <div class="kpi"><div class="label">Total Openings</div><div class="value">${openings}</div></div>
      <div class="kpi"><div class="label">RAG (🟢/🟡/🔴)</div><div class="value">${h}/${w}/${c}</div></div>
    `;

    $("overviewRagBadges").innerHTML = `
      <div class="badge good"><span class="dot"></span><span class="count">${h} Healthy</span></div>
      <div class="badge warn"><span class="dot"></span><span class="count">${w} At risk</span></div>
      <div class="badge bad"><span class="dot"></span><span class="count">${c} Critical</span></div>
    `;

    // table
    const tb = $("overviewTbody");
    tb.innerHTML = "";
    rows.forEach(r => {
      const owner = r.owner || r.recruiter || r.pplwise_tap || r.pplwise_sourcer || r.tap || "";
      const rag = ragFromOverviewRow(r);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role || "")}</td>
        <td>${esc(r.status || "")}</td>
        <td>${esc(r.location || "")}</td>
        <td class="right">${num(r.openings).toLocaleString()}</td>
        <td>${esc(owner)}</td>
        <td class="right">${dotHTML(rag)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  /* ---------------- RENDER: PIPELINE (inventory) ---------------- */

  function stagesFromInventory(rows, selectedWeek){
    const filtered = rows.filter(r => isRowInWeek(r, selectedWeek));
    const present = uniq(filtered.map(r => r.stage));
    const ordered = [
      ...STAGE_ORDER.filter(s => present.includes(s)),
      ...present.filter(s => !STAGE_ORDER.includes(s)).sort((a,b) => a.localeCompare(b))
    ];
    return ordered;
  }

  function renderPipeline(){
    const week = state.pipelineWeek;
    const rows = state.inventoryRows.filter(r => isRowInWeek(r, week));

    const empty = $("pipelineEmpty");
    const thead = $("pipelineThead");
    const tbody = $("pipelineTbody");

    if (!rows.length) {
      empty.textContent = "No inventory rows for this week. If this stays empty, check that pipeline_inventory CSV points to the correct sheet tab (gid).";
      empty.classList.remove("hidden");
      thead.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }

    empty.classList.add("hidden");

    const stages = stagesFromInventory(state.inventoryRows, week);
    const roles = uniq(rows.map(r => r.role)).sort();

    // aggregate
    const byRole = new Map();
    roles.forEach(role => byRole.set(role, new Map()));
    rows.forEach(r => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map(s => `<th class="right">${esc(s)}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    roles.forEach(role => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map(s => `<td class="right">${(m.get(s) || 0).toLocaleString()}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: ACTIVITY (weekly, ALL TIME support) ---------------- */

  function stagesFromWeekly(rows, selectedWeek){
    const filtered = rows.filter(r => isRowInWeek(r, selectedWeek));
    const present = uniq(filtered.map(r => r.stage));
    const ordered = [
      ...STAGE_ORDER.filter(s => present.includes(s)),
      ...present.filter(s => !STAGE_ORDER.includes(s)).sort((a,b)=>a.localeCompare(b))
    ];
    return ordered;
  }

  function renderActivity(){
    const week = state.activityWeek;
    const rows = state.weeklyRows.filter(r => isRowInWeek(r, week));

    const thead = $("activityThead");
    const tbody = $("activityTbody");

    const stages = stagesFromWeekly(state.weeklyRows, week);
    const roles = uniq(rows.map(r => r.role)).sort();

    thead.innerHTML = `
      <tr>
        <th>Role</th>
        ${stages.map(s => `<th class="right">${esc(s)}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    if (!rows.length || !roles.length) {
      tbody.innerHTML = `<tr><td colspan="${Math.max(1, stages.length + 1)}" class="muted">No activity data for this selection.</td></tr>`;
      return;
    }

    // aggregate
    const byRole = new Map();
    roles.forEach(role => byRole.set(role, new Map()));
    rows.forEach(r => {
      const m = byRole.get(r.role) || new Map();
      m.set(r.stage, (m.get(r.stage) || 0) + num(r.count));
      byRole.set(r.role, m);
    });

    roles.forEach(role => {
      const m = byRole.get(role) || new Map();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        ${stages.map(s => `<td class="right">${(m.get(s) || 0).toLocaleString()}</td>`).join("")}
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING (ALL TIME support) ---------------- */

  function renderSourcing(){
    const week = state.sourcingWeek;
    const rows = state.sourcingRows.filter(r => {
      if (week === "all") return true;
      return getWeekKey(r) === week;
    });

    const byRole = new Map();
    rows.forEach(r => {
      const role = r.role || "";
      if (!role) return;
      if (!byRole.has(role)) byRole.set(role, { contacted: 0, replied: 0, screens: 0 });
      const obj = byRole.get(role);
      obj.contacted += num(r.contacted);
      obj.replied += num(r.replied);
      obj.screens += num(r.recruiter_screen || r.recruiter_screened || r.recruiterScreen);
    });

    const roles = Array.from(byRole.keys()).sort();
    const tb = $("sourcingTbody");
    tb.innerHTML = "";

    let totC=0, totR=0, totS=0;

    roles.forEach(role => {
      const v = byRole.get(role);
      totC += v.contacted;
      totR += v.replied;
      totS += v.screens;

      const conv = v.contacted > 0 ? v.screens / v.contacted : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(role)}</td>
        <td class="right">${v.contacted.toLocaleString()}</td>
        <td class="right">${v.replied.toLocaleString()}</td>
        <td class="right">${v.screens.toLocaleString()}</td>
        <td class="right">${conv === null ? "—" : `${Math.round(conv * 100)}%`}</td>
      `;
      tb.appendChild(tr);
    });

    const overallConv = totC > 0 ? totS / totC : null;

    $("sourcingKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Contacted</div><div class="value">${totC.toLocaleString()}</div><div class="sub">${week === "all" ? "All time" : "Selected week"}</div></div>
      <div class="kpi"><div class="label">Total Replied</div><div class="value">${totR.toLocaleString()}</div><div class="sub">${week === "all" ? "All time" : "Selected week"}</div></div>
      <div class="kpi"><div class="label">Recruiter Screens</div><div class="value">${totS.toLocaleString()}</div><div class="sub">${overallConv === null ? "—" : `${Math.round(overallConv*100)}% conversion`}</div></div>
      <div class="kpi"><div class="label">Scope</div><div class="value">${week === "all" ? "All time" : formatWeekLabel(week)}</div><div class="sub">Week selector</div></div>
    `;
  }

  /* ---------------- RENDER: HIRES ---------------- */

  function parseDate(v){
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(a,b){
    if (!a || !b) return null;
    const ms = b - a;
    return Number.isFinite(ms) ? Math.round(ms / (1000*60*60*24)) : null;
  }

  function avg(arr){
    if (!arr.length) return null;
    return arr.reduce((s,v)=>s+v,0)/arr.length;
  }

  function renderHires(){
    const rows = state.hiredRows;

    // header-only allowed
    const empty = rows.length === 0;

    const tb = $("hiresTbody");
    tb.innerHTML = "";

    const tth = [];
    const ttf = [];
    const dip = [];

    rows.forEach(r => {
      const live = parseDate(r.live_date || r.live);
      const sig = parseDate(r.signature_date || r.signature);
      const start = parseDate(r.start_date || r.start);
      const first = parseDate(r["1st_contact"] || r.first_contact || r.first);

      const vTth = dayDiff(live, sig);
      const vTtf = dayDiff(live, start);
      const vDip = dayDiff(first, sig);

      if (vTth !== null) tth.push(vTth);
      if (vTtf !== null) ttf.push(vTtf);
      if (vDip !== null) dip.push(vDip);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.role || "")}</td>
        <td>${esc(r.first_name || "")}</td>
        <td>${esc(r.last_name || "")}</td>
        <td>${esc(r.source || "")}</td>
        <td>${esc(r.live_date || "")}</td>
        <td>${esc(r["1st_contact"] || r.first_contact || "")}</td>
        <td>${esc(r.signature_date || "")}</td>
        <td>${esc(r.start_date || "")}</td>
        <td class="right">${vTth === null ? "—" : vTth}</td>
        <td class="right">${vTtf === null ? "—" : vTtf}</td>
        <td class="right">${vDip === null ? "—" : vDip}</td>
      `;
      tb.appendChild(tr);
    });

    const k = $("hiresKpis");
    k.innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${rows.length}</div><div class="sub">${empty ? "No hire data yet" : "All time"}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avg(tth) === null ? "—" : avg(tth).toFixed(1)}</div><div class="sub">Days</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avg(ttf) === null ? "—" : avg(ttf).toFixed(1)}</div><div class="sub">Days</div></div>
      <div class="kpi"><div class="label">Avg Days in Process</div><div class="value">${avg(dip) === null ? "—" : avg(dip).toFixed(1)}</div><div class="sub">1st contact → signature</div></div>
    `;
  }

  /* ---------------- MANAGEMENT RENDER ---------------- */

  function splitNotes(v){
    return String(v || "")
      .split(/\r?\n|\|/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function getOwnerMap(){
    const map = {};
    state.overviewRows.forEach(r => {
      if (!r.role) return;
      const owner = r.owner || r.recruiter || r.pplwise_tap || r.pplwise_sourcer || r.tap || "";
      if (owner) map[r.role] = owner;
    });
    return map;
  }

  function filterScope(role, recruiter, ownerMap){
    const roleOk = state.mgmtRole === "all" || role === state.mgmtRole;
    if (!roleOk) return false;
    if (state.mgmtRecruiter === "all") return true;
    const owner = ownerMap[role] || "";
    return owner === state.mgmtRecruiter || recruiter === state.mgmtRecruiter;
  }

  function renderManagement(){
    if (sessionStorage.getItem(MGMT_UNLOCK_KEY) !== "1") return;

    const ownerMap = getOwnerMap();

    const week = state.mgmtWeek;
    const inventory = state.inventoryRows.filter(r => isRowInWeek(r, week)).filter(r => filterScope(r.role, "", ownerMap));
    const weekly = state.weeklyRows.filter(r => isRowInWeek(r, week)).filter(r => filterScope(r.role, "", ownerMap));

    const openRoles = state.overviewRows.filter(r => normalizeHeader(r.status) === "open").filter(r => filterScope(r.role, "", ownerMap)).length;
    const pipelineCandidates = inventory.reduce((s,r)=>s+num(r.count),0);
    const weeklyActivity = weekly.reduce((s,r)=>s+num(r.count),0);
    const hiresAll = state.hiredRows.length;

    $("managementKpis").innerHTML = `
      <div class="kpi"><div class="label">Open Roles</div><div class="value">${openRoles}</div></div>
      <div class="kpi"><div class="label">Pipeline Candidates</div><div class="value">${pipelineCandidates.toLocaleString()}</div><div class="sub">End-of-week inventory</div></div>
      <div class="kpi"><div class="label">Weekly Activity</div><div class="value">${weeklyActivity.toLocaleString()}</div><div class="sub">Selected week</div></div>
      <div class="kpi"><div class="label">Hires (All time)</div><div class="value">${hiresAll.toLocaleString()}</div></div>
    `;

    // Health donut based on overview RAG (scope filtered)
    let H=0,W=0,C=0;
    state.overviewRows.forEach(r => {
      if (!filterScope(r.role, "", ownerMap)) return;
      const rag = ragFromOverviewRow(r);
      if (rag === "healthy") H++;
      if (rag === "warning") W++;
      if (rag === "critical") C++;
    });

    renderDonut("pipelineHealthChart", "pipelineHealthEmpty", "pipelineHealth",
      ["Healthy","At risk","Critical"], [H,W,C]);

    // Source mix donut from sourcing contacted (selected week only)
    const src = state.sourcingRows
      .filter(r => getWeekKey(r) === week)
      .filter(r => filterScope(r.role || "", "", ownerMap));

    const bySource = new Map();
    src.forEach(r => {
      const s = r.source || r.channel || r.sourcing_channel || "";
      if (!s) return;
      bySource.set(s, (bySource.get(s) || 0) + num(r.contacted));
    });

    const sorted = Array.from(bySource.entries()).sort((a,b)=>b[1]-a[1]);
    const top = sorted.slice(0,3);
    const rest = sorted.slice(3).reduce((s, x)=>s+x[1], 0);

    const labels = top.map(x=>x[0]);
    const data = top.map(x=>x[1]);
    if (rest) { labels.push("Other"); data.push(rest); }

    renderDonut("sourceMixChart", "sourceMixEmpty", "sourceMix", labels, data);

    //
