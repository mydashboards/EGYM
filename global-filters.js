(() => {
  const F = {
    periodMode: "week",
    week: "",
    fromWeek: "",
    toWeek: "",
    department: "all",
    role: "all",
    recruiter: "all"
  };

  const $ = id => document.getElementById(id);
  let applying = false;
  let postTimer = null;

  const clean = v => String(v || "").trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

  function optionValues(ids) {
    const out = [];
    const seen = new Set();
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      Array.from(el.options || []).forEach(o => {
        const value = clean(o.value);
        if (!value || value === "all" || seen.has(value.toLowerCase())) return;
        seen.add(value.toLowerCase());
        out.push({ value, label: clean(o.textContent || value) });
      });
    });
    return out;
  }

  function addTableValues(items, selector, cellIndex) {
    const seen = new Set(items.map(x => x.value.toLowerCase()));
    document.querySelectorAll(selector).forEach(row => {
      const value = clean(row.querySelectorAll("td")[cellIndex]?.textContent);
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      items.push({ value, label: value });
    });
    return items;
  }

  function fillSelect(el, items, allLabel) {
    if (!el) return;
    const previous = el.value;
    el.innerHTML = "";
    if (allLabel) {
      const o = document.createElement("option");
      o.value = "all";
      o.textContent = allLabel;
      el.appendChild(o);
    }
    items.forEach(item => {
      const o = document.createElement("option");
      o.value = item.value;
      o.textContent = item.label;
      el.appendChild(o);
    });
    const allowed = new Set(Array.from(el.options).map(o => o.value));
    el.value = allowed.has(previous) ? previous : (allLabel ? "all" : (el.options[0]?.value || ""));
  }

  function setLocal(id, value) {
    const el = $(id);
    if (!el || !value) return;
    const allowed = new Set(Array.from(el.options || []).map(o => o.value));
    if (!allowed.has(value) || el.value === value) return;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function parseWeek(key) {
    const m = clean(key).match(/^(\d{4})-KW(\d{1,2})$/i);
    return m ? { year: Number(m[1]), week: Number(m[2]) } : null;
  }

  function cmpWeek(a, b) {
    const x = parseWeek(a), y = parseWeek(b);
    if (!x || !y) return 0;
    return x.year !== y.year ? x.year - y.year : x.week - y.week;
  }

  function rollingStart(end, n = 4) {
    const values = Array.from($("globalWeekSelect")?.options || []).map(o => o.value).filter(Boolean);
    const i = values.indexOf(end);
    return i < 0 ? end : (values[Math.min(values.length - 1, i + n - 1)] || end);
  }

  function parseDate(value) {
    const raw = clean(value);
    if (!raw || raw === "—") return null;
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateWeekKey(date) {
    if (!date) return "";
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - start) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-KW${String(week).padStart(2, "0")}`;
  }

  function weekInScope(key) {
    if (F.periodMode === "all") return true;
    if (!key) return false;
    if (F.periodMode === "week") return key === F.week;
    let from = F.periodMode === "rolling" ? rollingStart(F.week, 4) : F.fromWeek;
    let to = F.periodMode === "rolling" ? F.week : F.toWeek;
    if (!from || !to) return false;
    if (cmpWeek(from, to) > 0) [from, to] = [to, from];
    return cmpWeek(key, from) >= 0 && cmpWeek(key, to) <= 0;
  }

  function endWeek() {
    return F.periodMode === "range" ? (F.toWeek || F.fromWeek) : F.week;
  }

  function inject() {
    if (!$("globalFilterBar")) {
      const bar = document.createElement("section");
      bar.id = "globalFilterBar";
      bar.className = "global-filter-bar";
      bar.innerHTML = `
        <div class="global-filter-controls">
          <label><span>Period</span><select id="globalPeriodModeSelect">
            <option value="week">Single week</option><option value="rolling">Rolling 4 weeks</option>
            <option value="range">Custom range</option><option value="all">All time</option>
          </select></label>
          <label id="globalWeekWrap"><span>KW</span><select id="globalWeekSelect"></select></label>
          <label id="globalFromWeekWrap" class="hidden"><span>From KW</span><select id="globalFromWeekSelect"></select></label>
          <label id="globalToWeekWrap" class="hidden"><span>To KW</span><select id="globalToWeekSelect"></select></label>
          <label><span>Department</span><select id="globalDepartmentSelect"></select></label>
          <label><span>Role</span><select id="globalRoleSelect"></select></label>
          <label><span>Recruiter</span><select id="globalRecruiterSelect"></select></label>
        </div>`;

      const tabs = document.querySelector("#contributorView .tabs");
      if (tabs) tabs.insertAdjacentElement("afterend", bar);
      else document.querySelector("main")?.insertAdjacentElement("afterbegin", bar);
    }

    if (!$("globalFilterStyles")) {
      const style = document.createElement("style");
      style.id = "globalFilterStyles";
      style.textContent = `
        .global-filter-bar{
          margin:12px 0 18px;
          padding:12px 14px;
          border:1px solid var(--line);
          border-radius:18px;
          background:rgba(255,255,255,.03);
          box-shadow:0 8px 24px rgba(0,0,0,.18);
        }
        .global-filter-controls{
          display:grid;
          grid-template-columns:minmax(145px,.85fr) minmax(130px,.7fr) minmax(190px,1.05fr) minmax(220px,1.25fr) minmax(170px,.95fr);
          gap:10px;
          align-items:end;
          width:100%;
        }
        .global-filter-controls label{min-width:0}
        .global-filter-controls label span{color:var(--muted2);font-size:11px;font-weight:700}
        .global-filter-controls select{
          width:100%;
          min-width:0;
          min-height:40px;
          background:rgba(255,255,255,.04);
          border:1px solid var(--line);
          color:var(--text);
          padding:10px 12px;
          border-radius:14px;
          box-shadow:0 4px 14px rgba(0,0,0,.12);
        }
        .global-filter-controls select:focus{border-color:rgba(249,115,22,.42)}
        .global-filter-controls .hidden,.global-local-filter-hidden,tr.global-filter-hidden{display:none!important}
        body.global-filters-active #pipeline .panel-head .filters,
        body.global-filters-active #activity .panel-head .filters,
        body.global-filters-active #sourcing .panel-head .filters,
        body.global-filters-active #hiresContent .panel-head .filters,
        body.global-filters-active #managementView .card-head .filters{display:none!important}
        @media(max-width:1050px){.global-filter-controls{grid-template-columns:repeat(3,minmax(150px,1fr))}}
        @media(max-width:700px){.global-filter-controls{grid-template-columns:1fr 1fr}}
      `;
      document.head.appendChild(style);
    }
  }

  function syncOptions() {
    const weeks = optionValues(["pipelineWeekSelect", "activityWeekSelect", "sourcingWeekSelect", "managementWeekSelect"]);
    fillSelect($("globalWeekSelect"), weeks);
    fillSelect($("globalFromWeekSelect"), weeks);
    fillSelect($("globalToWeekSelect"), weeks);

    fillSelect($("globalDepartmentSelect"), optionValues(["overviewDepartmentSelect", "pipelineDepartmentSelect", "activityDepartmentSelect", "sourcingDepartmentSelect", "hiresDepartmentSelect", "managementForecastDepartmentSelect"]), "All departments");

    let roles = optionValues(["activityRoleSelect", "sourcingRoleSelect", "managementForecastRoleSelect"]);
    roles = addTableValues(roles, "#overviewTable tr", 0);
    fillSelect($("globalRoleSelect"), roles, "All roles");

    let recruiters = optionValues(["pipelineRecruiterSelect", "activityRecruiterSelect", "sourcingRecruiterSelect", "hiresRecruiterSelect", "managementForecastRecruiterSelect"]);
    recruiters = addTableValues(recruiters, "#overviewTable tr", 4);
    fillSelect($("globalRecruiterSelect"), recruiters, "All recruiters");

    if (!F.week && $("globalWeekSelect")?.options.length) {
      F.week = $("globalWeekSelect").value;
      F.toWeek = F.week;
      F.fromWeek = rollingStart(F.week, 4);
    }

    if ($("globalWeekSelect") && F.week) $("globalWeekSelect").value = F.week;
    if ($("globalFromWeekSelect") && F.fromWeek) $("globalFromWeekSelect").value = F.fromWeek;
    if ($("globalToWeekSelect") && F.toWeek) $("globalToWeekSelect").value = F.toWeek;
    if ($("globalDepartmentSelect")) $("globalDepartmentSelect").value = F.department;
    if ($("globalRoleSelect")) $("globalRoleSelect").value = F.role;
    if ($("globalRecruiterSelect")) $("globalRecruiterSelect").value = F.recruiter;

    $("overviewDepartmentSelect")?.closest("label")?.classList.add("global-local-filter-hidden");
    document.body.classList.add("global-filters-active");
  }

  function updateModeUI() {
    $("globalWeekWrap")?.classList.toggle("hidden", F.periodMode === "range" || F.periodMode === "all");
    $("globalFromWeekWrap")?.classList.toggle("hidden", F.periodMode !== "range");
    $("globalToWeekWrap")?.classList.toggle("hidden", F.periodMode !== "range");
  }

  function applyPeriod() {
    const end = endWeek();
    const start = F.periodMode === "rolling" ? rollingStart(end, 4) : F.fromWeek;

    if (end) setLocal("pipelineWeekSelect", end);

    if (F.periodMode === "week") {
      setLocal("activityWeekModeSelect", "week");
      if (end) setLocal("activityWeekSelect", end);
      setLocal("sourcingWeekModeSelect", "range");
      if (end) { setLocal("sourcingFromWeekSelect", end); setLocal("sourcingToWeekSelect", end); }
    } else if (F.periodMode === "rolling") {
      setLocal("activityWeekModeSelect", "range");
      if (start) setLocal("activityFromWeekSelect", start);
      if (end) setLocal("activityToWeekSelect", end);
      setLocal("sourcingWeekModeSelect", "rolling");
      if (end) setLocal("sourcingWeekSelect", end);
    } else if (F.periodMode === "range") {
      setLocal("activityWeekModeSelect", "range");
      if (F.fromWeek) setLocal("activityFromWeekSelect", F.fromWeek);
      if (F.toWeek) setLocal("activityToWeekSelect", F.toWeek);
      setLocal("sourcingWeekModeSelect", "range");
      if (F.fromWeek) setLocal("sourcingFromWeekSelect", F.fromWeek);
      if (F.toWeek) setLocal("sourcingToWeekSelect", F.toWeek);
    } else {
      setLocal("activityWeekModeSelect", "all");
      setLocal("sourcingWeekModeSelect", "all");
    }
  }

  function applyDimensions() {
    ["overviewDepartmentSelect", "pipelineDepartmentSelect", "activityDepartmentSelect", "sourcingDepartmentSelect", "hiresDepartmentSelect", "managementForecastDepartmentSelect"].forEach(id => setLocal(id, F.department));
    ["activityRoleSelect", "sourcingRoleSelect", "managementForecastRoleSelect"].forEach(id => setLocal(id, F.role));
    ["pipelineRecruiterSelect", "activityRecruiterSelect", "sourcingRecruiterSelect", "hiresRecruiterSelect", "managementForecastRecruiterSelect"].forEach(id => setLocal(id, F.recruiter));
  }

  function pipelineHealth() {
    const map = new Map();
    document.querySelectorAll("#pipelineTable tr").forEach(row => {
      const cells = row.querySelectorAll("td");
      const role = clean(cells[0]?.textContent);
      const dot = cells[cells.length - 1]?.querySelector(".status-dot");
      if (!role || !dot) return;
      const health = dot.classList.contains("good") ? "healthy" : dot.classList.contains("warn") ? "warning" : dot.classList.contains("bad") ? "critical" : "unknown";
      map.set(role.toLowerCase(), health);
    });
    return map;
  }

  function setDot(cell, health) {
    const cls = health === "healthy" ? "good" : health === "warning" ? "warn" : health === "critical" ? "bad" : "neutral";
    const title = health === "healthy" ? "Healthy" : health === "warning" ? "At risk" : health === "critical" ? "Critical" : "New/Unknown";
    const old = cell?.querySelector(".status-dot");
    if (old && old.classList.contains(cls)) return;
    if (cell) cell.innerHTML = `<span class="status-dot ${cls}" title="${title}"></span>`;
  }

  function filterHires() {
    let total = 0;
    const tth = [], dip = [];
    document.querySelectorAll("#hiresTable tr").forEach(row => {
      const c = row.querySelectorAll("td");
      const roleOk = F.role === "all" || same(c[0]?.textContent, F.role);
      const wk = dateWeekKey(parseDate(c[7]?.textContent));
      const timeOk = F.periodMode === "all" || weekInScope(wk);
      const visible = roleOk && timeOk;
      row.classList.toggle("global-filter-hidden", !visible);
      if (!visible) return;
      total++;
      const a = Number(clean(c[9]?.textContent)), b = Number(clean(c[11]?.textContent));
      if (Number.isFinite(a)) tth.push(a);
      if (Number.isFinite(b)) dip.push(b);
    });
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    document.querySelectorAll("#hiresKpis .kpi").forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const value = card.querySelector(".value");
      if (!value) return;
      if (label === "total hires") value.textContent = String(total);
      else if (label === "avg tth") value.textContent = avg(tth) === null ? "—" : avg(tth).toFixed(1);
      else if (label.includes("avg days in process")) value.textContent = avg(dip) === null ? "—" : avg(dip).toFixed(1);
      else if (label === "scope") value.textContent = F.periodMode === "all" ? "All time" : F.periodMode === "week" ? clean(F.week).replace("-", " · ") : F.periodMode === "rolling" ? "Rolling 4 weeks" : "Custom range";
    });
    return total;
  }

  function filterOverview(hireCount) {
    const healthMap = pipelineHealth();
    const hc = { healthy: 0, warning: 0, critical: 0 };
    let open = 0, hold = 0, openings = 0;

    document.querySelectorAll("#overviewTable tr").forEach(row => {
      const c = row.querySelectorAll("td");
      const role = clean(c[0]?.textContent), owner = clean(c[4]?.textContent), status = clean(c[1]?.textContent).toLowerCase();
      const visible = (F.role === "all" || same(role, F.role)) && (F.recruiter === "all" || same(owner, F.recruiter));
      row.classList.toggle("global-filter-hidden", !visible);
      if (!visible) return;

      const h = healthMap.get(role.toLowerCase());
      if (h) setDot(c[c.length - 1], h);
      if (status === "open") open++;
      if (status.includes("hold")) hold++;
      const n = Number(clean(c[3]?.textContent).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) openings += n;
      const dot = c[c.length - 1]?.querySelector(".status-dot");
      if (dot?.classList.contains("good")) hc.healthy++;
      else if (dot?.classList.contains("warn")) hc.warning++;
      else if (dot?.classList.contains("bad")) hc.critical++;
    });

    document.querySelectorAll("#overviewCards .kpi").forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const value = card.querySelector(".value");
      if (!value) return;
      const next = label === "open roles" ? open : label === "on hold" ? hold : label === "filled positions" ? hireCount : label === "total openings" ? openings : null;
      if (next !== null && value.textContent !== String(next)) value.textContent = String(next);
    });

    const html = `<div class="health-badge good"><span class="health-dot good"></span><span>${hc.healthy} Healthy</span></div><div class="health-badge warn"><span class="health-dot warn"></span><span>${hc.warning} Attention</span></div><div class="health-badge bad"><span class="health-dot bad"></span><span>${hc.critical} Action</span></div>`;
    if ($("overviewHealthSummary")?.innerHTML !== html) $("overviewHealthSummary").innerHTML = html;
  }

  function filterManagement() {
    const sourceCards = Array.from(document.querySelectorAll("#overviewCards .kpi"));
    document.querySelectorAll("#managementKpis .kpi").forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const source = sourceCards.find(x => clean(x.querySelector(".label")?.textContent).toLowerCase() === label);
      const a = card.querySelector(".value"), b = source?.querySelector(".value");
      if (a && b && a.textContent !== b.textContent) a.textContent = b.textContent;
    });
    if ($("managementHealthSummary") && $("overviewHealthSummary") && $("managementHealthSummary").innerHTML !== $("overviewHealthSummary").innerHTML) {
      $("managementHealthSummary").innerHTML = $("overviewHealthSummary").innerHTML;
    }
    document.querySelectorAll("#managementRecruiterTable tr").forEach(row => {
      const recruiter = clean(row.querySelector("td")?.textContent);
      row.classList.toggle("global-filter-hidden", F.recruiter !== "all" && !same(recruiter, F.recruiter));
    });
  }

  function postProcess() {
    const hires = filterHires();
    filterOverview(hires);
    filterManagement();
  }

  function schedulePost(delay = 80) {
    clearTimeout(postTimer);
    postTimer = setTimeout(postProcess, delay);
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try { applyPeriod(); applyDimensions(); }
    finally { applying = false; }
    schedulePost();
  }

  function change() {
    applyAll();
    window.dispatchEvent(new CustomEvent("egym:global-filters-change", { detail: { ...F } }));
  }

  function bind() {
    $("globalPeriodModeSelect")?.addEventListener("change", e => { F.periodMode = e.target.value; if (F.periodMode === "rolling") { F.fromWeek = rollingStart(F.week, 4); F.toWeek = F.week; } updateModeUI(); change(); });
    $("globalWeekSelect")?.addEventListener("change", e => { F.week = e.target.value; F.toWeek = F.week; if (F.periodMode === "rolling") F.fromWeek = rollingStart(F.week, 4); change(); });
    $("globalFromWeekSelect")?.addEventListener("change", e => { F.fromWeek = e.target.value; change(); });
    $("globalToWeekSelect")?.addEventListener("change", e => { F.toWeek = e.target.value; change(); });
    $("globalDepartmentSelect")?.addEventListener("change", e => { F.department = e.target.value; change(); });
    $("globalRoleSelect")?.addEventListener("change", e => { F.role = e.target.value; change(); });
    $("globalRecruiterSelect")?.addEventListener("change", e => { F.recruiter = e.target.value; change(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    inject(); bind(); updateModeUI();
    const last = $("lastUpdated");
    if (last) new MutationObserver(() => { syncOptions(); applyAll(); }).observe(last, { childList: true, characterData: true, subtree: true });
    setTimeout(() => { syncOptions(); applyAll(); }, 1000);
    setTimeout(() => { syncOptions(); applyAll(); }, 2500);
  });

  window.EGYM_GLOBAL_FILTERS = F;
})();
