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

  function uniqueOptions(selectIds) {
    const values = [];
    const seen = new Set();

    selectIds.forEach(id => {
      const select = $(id);
      if (!select) return;
      Array.from(select.options || []).forEach(opt => {
        const value = String(opt.value || "").trim();
        const label = String(opt.textContent || value).trim();
        if (!value || value === "all") return;
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        values.push({ value, label });
      });
    });

    return values;
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

  function getRollingStart(endKey, length = 4) {
    const weekSelect = $("globalWeekSelect");
    if (!weekSelect || !endKey) return endKey;
    const values = Array.from(weekSelect.options || []).map(o => o.value).filter(Boolean);
    const endIndex = values.indexOf(endKey);
    if (endIndex < 0) return endKey;
    return values[Math.min(values.length - 1, endIndex + length - 1)] || endKey;
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
      .global-filter-controls .hidden{display:none!important}
      body.global-filters-active #pipeline .panel-head .filters,
      body.global-filters-active #activity .panel-head .filters,
      body.global-filters-active #sourcing .panel-head .filters,
      body.global-filters-active #hiresContent .panel-head .filters,
      body.global-filters-active #managementView .card-head .filters{display:none!important}
      body.global-filters-active #overviewDepartmentSelect{display:none!important}
      body.global-filters-active #overviewDepartmentSelect + *{display:none!important}
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

    const roles = uniqueOptions([
      "activityRoleSelect",
      "sourcingRoleSelect",
      "managementForecastRoleSelect"
    ]);
    replaceOptions($("globalRoleSelect"), roles, "All roles");

    const recruiters = uniqueOptions([
      "pipelineRecruiterSelect",
      "activityRecruiterSelect",
      "sourcingRecruiterSelect",
      "hiresRecruiterSelect",
      "managementForecastRecruiterSelect"
    ]);
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
    const endKey = mode === "range" ? GLOBAL_FILTERS.toWeek : GLOBAL_FILTERS.week;
    const startKey = mode === "rolling" ? getRollingStart(endKey, 4) : GLOBAL_FILTERS.fromWeek;

    // Pipeline inventory is a snapshot: always use the last week in the selected period.
    if (endKey) setLocalSelect("pipelineWeekSelect", endKey);

    if (mode === "week") {
      setLocalSelect("activityWeekModeSelect", "week");
      if (endKey) setLocalSelect("activityWeekSelect", endKey);

      // Sourcing has no dedicated single-week mode in the current app, so use a 1-week range.
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

    setTimeout(() => { syncAvailableOptions(); applyAll(); }, 1000);
    setTimeout(() => { syncAvailableOptions(); applyAll(); }, 2500);
  });

  window.EGYM_GLOBAL_FILTERS = GLOBAL_FILTERS;
})();
