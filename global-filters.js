(() => {
  const GLOBAL_FILTERS = {
    periodMode: "week",
    week: "",
    fromWeek: "",
    toWeek: "",
    department: "all",
    role: "all",
    recruiter: "all"
  };

  const $ = id => document.getElementById(id);
  let isApplying = false;
  let postProcessTimer = null;

  function clean(value) {
    return String(value || "").trim();
  }

  function same(a, b) {
    return clean(a).toLowerCase() === clean(b).toLowerCase();
  }

  function uniqueOptions(selectIds) {
    const values = [];
    const seen = new Set();

    selectIds.forEach(id => {
      const select = $(id);
      if (!select) return;
      Array.from(select.options || []).forEach(opt => {
        const value = clean(opt.value);
        const label = clean(opt.textContent || value);
        if (!value || value === "all") return;
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        values.push({ value, label });
      });
    });

    return values;
  }

  function addDomValues(items, selector, cellIndex) {
    const seen = new Set(items.map(item => item.value.toLowerCase()));
    document.querySelectorAll(selector).forEach(row => {
      const cells = row.querySelectorAll("td");
      const value = clean(cells[cellIndex]?.textContent);
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      items.push({ value, label: value });
    });
    return items;
  }

  function replaceOptions(select, items, allLabel = null) {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = "";

    if (allLabel) {
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = allLabel;
      select.appendChild(opt);
    }

    items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    });

    const allowed = new Set(Array.from(select.options).map(o => o.value));
    if (allowed.has(previous)) select.value = previous;
    else if (allLabel) select.value = "all";
  }

  function setLocalSelect(id, value, dispatch = true) {
    const select = $(id);
    if (!select || value === undefined || value === null || value === "") return false;
    const allowed = new Set(Array.from(select.options || []).map(o => o.value));
    if (!allowed.has(value)) return false;
    if (select.value === value) return true;
    select.value = value;
    if (dispatch) select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function parseWeekKey(key) {
    const m = clean(key).match(/^(\d{4})-KW(\d{1,2})$/i);
    if (!m) return null;
    return { year: Number(m[1]), week: Number(m[2]) };
  }

  function compareWeekKeys(a, b) {
    const pa = parseWeekKey(a);
    const pb = parseWeekKey(b);
    if (!pa || !pb) return 0;
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.week - pb.week;
  }

  function getRollingStart(endKey, length = 4) {
    const weekSelect = $("globalWeekSelect");
    if (!weekSelect || !endKey) return endKey;
    const values = Array.from(weekSelect.options || []).map(o => o.value).filter(Boolean);
    const endIndex = values.indexOf(endKey);
    if (endIndex < 0) return endKey;
    return values[Math.min(values.length - 1, endIndex + length - 1)] || endKey;
  }

  function parseDateFlexible(value) {
    const raw = clean(value);
    if (!raw || raw === "—") return null;

    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

    m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateToISOWeekKey(date) {
    if (!date) return "";
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-KW${String(week).padStart(2, "0")}`;
  }

  function weekMatchesPeriod(weekKey) {
    const mode = GLOBAL_FILTERS.periodMode;
    if (mode === "all") return true;
    if (!weekKey) return false;

    if (mode === "week") return weekKey === GLOBAL_FILTERS.week;

    if (mode === "rolling") {
      const end = GLOBAL_FILTERS.week;
      const start = getRollingStart(end, 4);
      if (!start || !end) return false;
      return compareWeekKeys(weekKey, start) >= 0 && compareWeekKeys(weekKey, end) <= 0;
    }

    if (mode === "range") {
      const from = GLOBAL_FILTERS.fromWeek;
      const to = GLOBAL_FILTERS.toWeek;
      if (!from || !to) return false;
      const start = compareWeekKeys(from, to) <= 0 ? from : to;
      const end = compareWeekKeys(from, to) <= 0 ? to : from;
      return compareWeekKeys(weekKey, start) >= 0 && compareWeekKeys(weekKey, end) <= 0;
    }

    return true;
  }

  function periodEndWeek() {
    if (GLOBAL_FILTERS.periodMode === "range") return GLOBAL_FILTERS.toWeek || GLOBAL_FILTERS.fromWeek;
    return GLOBAL_FILTERS.week;
  }

  function injectBar() {
    if ($("globalFilterBar")) return;

    const banner = $("dataErrors");
    const bar = document.createElement("section");
    bar.id = "globalFilterBar";
    bar.className = "global-filter-bar";
    bar.innerHTML = `
      <div class="global-filter-title">Global Filters</div>
      <div class="global-filter-controls">
        <label><span>Period</span><select id="globalPeriodModeSelect">
          <option value="week">Single week</option>
          <option value="rolling">Rolling 4 weeks</option>
          <option value="range">Custom range</option>
          <option value="all">All time</option>
        </select></label>
        <label id="globalWeekWrap"><span>KW</span><select id="globalWeekSelect"></select></label>
        <label id="globalFromWeekWrap" class="hidden"><span>From KW</span><select id="globalFromWeekSelect"></select></label>
        <label id="globalToWeekWrap" class="hidden"><span>To KW</span><select id="globalToWeekSelect"></select></label>
        <label><span>Department</span><select id="globalDepartmentSelect"></select></label>
        <label><span>Role</span><select id="globalRoleSelect"></select></label>
        <label><span>Recruiter</span><select id="globalRecruiterSelect"></select></label>
      </div>
    `;

    if (banner && banner.parentNode) banner.insertAdjacentElement("afterend", bar);
    else document.querySelector("main")?.insertAdjacentElement("beforebegin", bar);
  }

  function injectStyles() {
    if ($("globalFilterStyles")) return;
    const style = document.createElement("style");
    style.id = "globalFilterStyles";
    style.textContent = `
      .global-filter-bar{margin:16px 0 18px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;box-shadow:0 1px 2px rgba(0,0,0,.03)}
      .global-filter-title{font-weight:700;font-size:14px;padding-bottom:10px;white-space:nowrap}
      .global-filter-controls{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;flex:1}
      .global-filter-controls label{display:flex;flex-direction:column;gap:5px;min-width:130px}
      .global-filter-controls label span{font-size:11px;color:#6b7280;font-weight:600}
      .global-filter-controls select{min-height:36px}
      .global-filter-controls .hidden,.global-local-filter-hidden{display:none!important}
      body.global-filters-active #pipeline .panel-head .filters,
      body.global-filters-active #activity .panel-head .filters,
      body.global-filters-active #sourcing .panel-head .filters,
      body.global-filters-active #hiresContent .panel-head .filters,
      body.global-filters-active #managementView .card-head .filters{display:none!important}
      tr.global-filter-hidden{display:none!important}
      @media (max-width:900px){.global-filter-bar{align-items:stretch}.global-filter-title{width:100%;padding-bottom:0}.global-filter-controls label{min-width:150px;flex:1}}
    `;
    document.head.appendChild(style);
  }

  function syncAvailableOptions() {
    const weekItems = uniqueOptions([
      "pipelineWeekSelect",
      "activityWeekSelect",
      "sourcingWeekSelect",
      "managementWeekSelect"
    ]);

    replaceOptions($("globalWeekSelect"), weekItems);
    replaceOptions($("globalFromWeekSelect"), weekItems);
    replaceOptions($("globalToWeekSelect"), weekItems);

    const departments = uniqueOptions([
      "overviewDepartmentSelect",
      "pipelineDepartmentSelect",
      "activityDepartmentSelect",
      "sourcingDepartmentSelect",
      "hiresDepartmentSelect",
      "managementForecastDepartmentSelect"
    ]);
    replaceOptions($("globalDepartmentSelect"), departments, "All departments");

    let roles = uniqueOptions([
      "activityRoleSelect",
      "sourcingRoleSelect",
      "managementForecastRoleSelect"
    ]);
    roles = addDomValues(roles, "#overviewTable tr", 0);
    replaceOptions($("globalRoleSelect"), roles, "All roles");

    let recruiters = uniqueOptions([
      "pipelineRecruiterSelect",
      "activityRecruiterSelect",
      "sourcingRecruiterSelect",
      "hiresRecruiterSelect",
      "managementForecastRecruiterSelect"
    ]);
    recruiters = addDomValues(recruiters, "#overviewTable tr", 4);
    replaceOptions($("globalRecruiterSelect"), recruiters, "All recruiters");

    if (!GLOBAL_FILTERS.week && $("globalWeekSelect")?.options.length) {
      GLOBAL_FILTERS.week = $("globalWeekSelect").value;
      GLOBAL_FILTERS.toWeek = GLOBAL_FILTERS.week;
      GLOBAL_FILTERS.fromWeek = getRollingStart(GLOBAL_FILTERS.week, 4);
    }

    if ($("globalDepartmentSelect")) $("globalDepartmentSelect").value = GLOBAL_FILTERS.department;
    if ($("globalRoleSelect")) $("globalRoleSelect").value = GLOBAL_FILTERS.role;
    if ($("globalRecruiterSelect")) $("globalRecruiterSelect").value = GLOBAL_FILTERS.recruiter;
    if ($("globalWeekSelect") && GLOBAL_FILTERS.week) $("globalWeekSelect").value = GLOBAL_FILTERS.week;
    if ($("globalFromWeekSelect") && GLOBAL_FILTERS.fromWeek) $("globalFromWeekSelect").value = GLOBAL_FILTERS.fromWeek;
    if ($("globalToWeekSelect") && GLOBAL_FILTERS.toWeek) $("globalToWeekSelect").value = GLOBAL_FILTERS.toWeek;

    $("overviewDepartmentSelect")?.closest("label")?.classList.add("global-local-filter-hidden");
    document.body.classList.add("global-filters-active");
  }

  function updateModeUI() {
    const mode = GLOBAL_FILTERS.periodMode;
    $("globalWeekWrap")?.classList.toggle("hidden", mode === "range" || mode === "all");
    $("globalFromWeekWrap")?.classList.toggle("hidden", mode !== "range");
    $("globalToWeekWrap")?.classList.toggle("hidden", mode !== "range");
  }

  function applyDepartment() {
    [
      "overviewDepartmentSelect",
      "pipelineDepartmentSelect",
      "activityDepartmentSelect",
      "sourcingDepartmentSelect",
      "hiresDepartmentSelect",
      "managementForecastDepartmentSelect"
    ].forEach(id => setLocalSelect(id, GLOBAL_FILTERS.department));
  }

  function applyRole() {
    [
      "activityRoleSelect",
      "sourcingRoleSelect",
      "managementForecastRoleSelect"
    ].forEach(id => setLocalSelect(id, GLOBAL_FILTERS.role));
  }

  function applyRecruiter() {
    [
      "pipelineRecruiterSelect",
      "activityRecruiterSelect",
      "sourcingRecruiterSelect",
      "hiresRecruiterSelect",
      "managementForecastRecruiterSelect"
    ].forEach(id => setLocalSelect(id, GLOBAL_FILTERS.recruiter));
  }

  function applyPeriod() {
    const mode = GLOBAL_FILTERS.periodMode;
    const endKey = periodEndWeek();
    const startKey = mode === "rolling" ? getRollingStart(endKey, 4) : GLOBAL_FILTERS.fromWeek;

    // Inventory is a snapshot, so Pipeline always displays the period's final week.
    if (endKey) setLocalSelect("pipelineWeekSelect", endKey);

    if (mode === "week") {
      setLocalSelect("activityWeekModeSelect", "week");
      if (endKey) setLocalSelect("activityWeekSelect", endKey);

      // Current Sourcing implementation has no single-week mode: represent it as a one-week range.
      setLocalSelect("sourcingWeekModeSelect", "range");
      if (endKey) {
        setLocalSelect("sourcingFromWeekSelect", endKey);
        setLocalSelect("sourcingToWeekSelect", endKey);
      }
    } else if (mode === "rolling") {
      setLocalSelect("activityWeekModeSelect", "range");
      if (startKey) setLocalSelect("activityFromWeekSelect", startKey);
      if (endKey) setLocalSelect("activityToWeekSelect", endKey);

      setLocalSelect("sourcingWeekModeSelect", "rolling");
      if (endKey) setLocalSelect("sourcingWeekSelect", endKey);
    } else if (mode === "range") {
      setLocalSelect("activityWeekModeSelect", "range");
      if (GLOBAL_FILTERS.fromWeek) setLocalSelect("activityFromWeekSelect", GLOBAL_FILTERS.fromWeek);
      if (GLOBAL_FILTERS.toWeek) setLocalSelect("activityToWeekSelect", GLOBAL_FILTERS.toWeek);

      setLocalSelect("sourcingWeekModeSelect", "range");
      if (GLOBAL_FILTERS.fromWeek) setLocalSelect("sourcingFromWeekSelect", GLOBAL_FILTERS.fromWeek);
      if (GLOBAL_FILTERS.toWeek) setLocalSelect("sourcingToWeekSelect", GLOBAL_FILTERS.toWeek);
    } else if (mode === "all") {
      setLocalSelect("activityWeekModeSelect", "all");
      setLocalSelect("sourcingWeekModeSelect", "all");
    }
  }

  function getPipelineHealthByRole() {
    const map = new Map();
    document.querySelectorAll("#pipelineTable tr").forEach(row => {
      if (row.classList.contains("global-filter-hidden")) return;
      const cells = row.querySelectorAll("td");
      const role = clean(cells[0]?.textContent);
      const dot = cells[cells.length - 1]?.querySelector(".status-dot");
      if (!role || !dot) return;
      let health = "unknown";
      if (dot.classList.contains("good")) health = "healthy";
      else if (dot.classList.contains("warn")) health = "warning";
      else if (dot.classList.contains("bad")) health = "critical";
      map.set(role.toLowerCase(), health);
    });
    return map;
  }

  function setHealthDot(cell, health) {
    if (!cell) return;
    const cls = health === "healthy" ? "good" : health === "warning" ? "warn" : health === "critical" ? "bad" : "neutral";
    const title = health === "healthy" ? "Healthy" : health === "warning" ? "At risk" : health === "critical" ? "Critical" : "New/Unknown";
    cell.innerHTML = `<span class="status-dot ${cls}" title="${title}"></span>`;
  }

  function filterHiresDOM() {
    const rows = Array.from(document.querySelectorAll("#hiresTable tr"));
    let total = 0;
    const tth = [];
    const dip = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      const role = clean(cells[0]?.textContent);
      const signatureDate = parseDateFlexible(cells[7]?.textContent);
      const hireWeek = dateToISOWeekKey(signatureDate);

      const roleMatch = GLOBAL_FILTERS.role === "all" || same(role, GLOBAL_FILTERS.role);
      const timeMatch = GLOBAL_FILTERS.periodMode === "all" || weekMatchesPeriod(hireWeek);
      const visible = roleMatch && timeMatch;

      row.classList.toggle("global-filter-hidden", !visible);
      if (!visible) return;

      total += 1;
      const tthVal = Number(clean(cells[9]?.textContent));
      const dipVal = Number(clean(cells[11]?.textContent));
      if (Number.isFinite(tthVal)) tth.push(tthVal);
      if (Number.isFinite(dipVal)) dip.push(dipVal);
    });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const avgTth = avg(tth);
    const avgDip = avg(dip);

    document.querySelectorAll("#hiresKpis .kpi").forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const value = card.querySelector(".value");
      if (!value) return;
      if (label === "total hires") value.textContent = String(total);
      else if (label === "avg tth") value.textContent = avgTth === null ? "—" : avgTth.toFixed(1);
      else if (label.includes("avg days in process")) value.textContent = avgDip === null ? "—" : avgDip.toFixed(1);
      else if (label === "scope") {
        if (GLOBAL_FILTERS.periodMode === "all") value.textContent = "All time";
        else if (GLOBAL_FILTERS.periodMode === "week") value.textContent = clean(GLOBAL_FILTERS.week).replace("-", " · ");
        else if (GLOBAL_FILTERS.periodMode === "rolling") value.textContent = "Rolling 4 weeks";
        else value.textContent = "Custom range";
      }
    });

    return total;
  }

  function filterOverviewDOM(filteredHireCount) {
    const pipelineHealth = getPipelineHealthByRole();
    const rows = Array.from(document.querySelectorAll("#overviewTable tr"));
    const healthCounts = { healthy: 0, warning: 0, critical: 0 };
    let openRoles = 0;
    let onHold = 0;
    let totalOpenings = 0;

    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      const role = clean(cells[0]?.textContent);
      const status = clean(cells[1]?.textContent).toLowerCase();
      const owner = clean(cells[4]?.textContent);

      const roleMatch = GLOBAL_FILTERS.role === "all" || same(role, GLOBAL_FILTERS.role);
      const recruiterMatch = GLOBAL_FILTERS.recruiter === "all" || same(owner, GLOBAL_FILTERS.recruiter);
      const visible = roleMatch && recruiterMatch;
      row.classList.toggle("global-filter-hidden", !visible);
      if (!visible) return;

      const pipelineStatus = pipelineHealth.get(role.toLowerCase());
      if (pipelineStatus) setHealthDot(cells[cells.length - 1], pipelineStatus);

      if (status === "open") openRoles += 1;
      if (status.includes("hold")) onHold += 1;
      const openings = Number(clean(cells[3]?.textContent).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(openings)) totalOpenings += openings;

      const dot = cells[cells.length - 1]?.querySelector(".status-dot");
      if (dot?.classList.contains("good")) healthCounts.healthy += 1;
      else if (dot?.classList.contains("warn")) healthCounts.warning += 1;
      else if (dot?.classList.contains("bad")) healthCounts.critical += 1;
    });

    document.querySelectorAll("#overviewCards .kpi").forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const value = card.querySelector(".value");
      if (!value) return;
      if (label === "open roles") value.textContent = String(openRoles);
      else if (label === "on hold") value.textContent = String(onHold);
      else if (label === "filled positions") value.textContent = String(filteredHireCount);
      else if (label === "total openings") value.textContent = String(totalOpenings);
    });

    const summary = $("overviewHealthSummary");
    if (summary) {
      summary.innerHTML = `
        <div class="health-badge good"><span class="health-dot good"></span><span>${healthCounts.healthy} Healthy</span></div>
        <div class="health-badge warn"><span class="health-dot warn"></span><span>${healthCounts.warning} Attention</span></div>
        <div class="health-badge bad"><span class="health-dot bad"></span><span>${healthCounts.critical} Action</span></div>
      `;
    }

    return healthCounts;
  }

  function filterManagementDOM() {
    // Management portfolio KPIs and health intentionally mirror the globally filtered Overview.
    const overviewKpis = Array.from(document.querySelectorAll("#overviewCards .kpi"));
    const managementKpis = Array.from(document.querySelectorAll("#managementKpis .kpi"));

    managementKpis.forEach(card => {
      const label = clean(card.querySelector(".label")?.textContent).toLowerCase();
      const source = overviewKpis.find(k => clean(k.querySelector(".label")?.textContent).toLowerCase() === label);
      if (!source) return;
      const targetValue = card.querySelector(".value");
      const sourceValue = source.querySelector(".value");
      if (targetValue && sourceValue) targetValue.textContent = sourceValue.textContent;
    });

    if ($("managementHealthSummary") && $("overviewHealthSummary")) {
      $("managementHealthSummary").innerHTML = $("overviewHealthSummary").innerHTML;
    }

    // Recruiter filter is meaningful for utilization because rows are recruiter-level.
    document.querySelectorAll("#managementRecruiterTable tr").forEach(row => {
      const recruiter = clean(row.querySelector("td")?.textContent);
      const visible = GLOBAL_FILTERS.recruiter === "all" || same(recruiter, GLOBAL_FILTERS.recruiter);
      row.classList.toggle("global-filter-hidden", !visible);
    });

    // Role Insights are already driven by the hidden Activity role/recruiter filters.
    // Weekly Updates are also driven by selectedActivityRole and department-filtered app state.
  }

  function postProcess() {
    const filteredHireCount = filterHiresDOM();
    filterOverviewDOM(filteredHireCount);
    filterManagementDOM();
  }

  function schedulePostProcess(delay = 60) {
    clearTimeout(postProcessTimer);
    postProcessTimer = setTimeout(postProcess, delay);
  }

  function applyAll() {
    if (isApplying) return;
    isApplying = true;
    try {
      applyPeriod();
      applyDepartment();
      applyRole();
      applyRecruiter();
    } finally {
      isApplying = false;
    }
    schedulePostProcess(100);
  }

  function emitAndApply() {
    applyAll();
    window.dispatchEvent(new CustomEvent("egym:global-filters-change", {
      detail: { ...GLOBAL_FILTERS }
    }));
  }

  function bind() {
    $("globalPeriodModeSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.periodMode = e.target.value;
      if (GLOBAL_FILTERS.periodMode === "rolling") {
        GLOBAL_FILTERS.fromWeek = getRollingStart(GLOBAL_FILTERS.week, 4);
        GLOBAL_FILTERS.toWeek = GLOBAL_FILTERS.week;
      }
      updateModeUI();
      emitAndApply();
    });

    $("globalWeekSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.week = e.target.value;
      GLOBAL_FILTERS.toWeek = e.target.value;
      if (GLOBAL_FILTERS.periodMode === "rolling") {
        GLOBAL_FILTERS.fromWeek = getRollingStart(GLOBAL_FILTERS.week, 4);
      }
      emitAndApply();
    });

    $("globalFromWeekSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.fromWeek = e.target.value;
      emitAndApply();
    });

    $("globalToWeekSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.toWeek = e.target.value;
      emitAndApply();
    });

    $("globalDepartmentSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.department = e.target.value;
      emitAndApply();
    });

    $("globalRoleSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.role = e.target.value;
      emitAndApply();
    });

    $("globalRecruiterSelect")?.addEventListener("change", e => {
      GLOBAL_FILTERS.recruiter = e.target.value;
      emitAndApply();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    injectBar();
    bind();
    updateModeUI();

    const lastUpdated = $("lastUpdated");
    if (lastUpdated) {
      new MutationObserver(() => {
        syncAvailableOptions();
        applyAll();
      }).observe(lastUpdated, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    // Re-run DOM-level scoping after app.js re-renders tables/cards.
    const main = document.querySelector("main");
    if (main) {
      new MutationObserver(() => schedulePostProcess(80)).observe(main, {
        childList: true,
        subtree: true
      });
    }

    setTimeout(() => { syncAvailableOptions(); applyAll(); }, 1000);
    setTimeout(() => { syncAvailableOptions(); applyAll(); }, 2500);
  });

  window.EGYM_GLOBAL_FILTERS = GLOBAL_FILTERS;
})();
