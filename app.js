 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
new file mode 100644
index 0000000000000000000000000000000000000000..06afdc76aa0bf1002c49178dcb835323ef86175e
--- /dev/null
+++ b/app.js
@@ -0,0 +1,640 @@
+const SHEET = {
+  sheetId: "1VzCwOC7QmbESTbM725mPyrnCqY36ycezlQegHerXNjE",
+  tabs: {
+    overview_data: { gid: "780337575" },
+    pipeline_weekly: { gid: "565686110" },
+    sourcing_data: { gid: "1825170360" },
+    hired_data: { gid: "756634566" }
+  }
+};
+
+const STAGES = [
+  "sourced",
+  "reviewed",
+  "step1",
+  "tech_light",
+  "tech_iv",
+  "final",
+  "offer",
+  "hired"
+];
+
+const state = {
+  data: {
+    overview_data: [],
+    pipeline_weekly: [],
+    sourcing_data: [],
+    hired_data: []
+  },
+  roleFilter: "All",
+  pipelineRange: 8,
+  sourcingRange: 8,
+  charts: {}
+};
+
+const banner = document.getElementById("banner");
+
+const selectors = {
+  navLinks: document.querySelectorAll(".nav-link"),
+  pages: document.querySelectorAll(".page"),
+  roleSelects: {
+    overview: document.getElementById("overview-role"),
+    pipeline: document.getElementById("pipeline-role"),
+    sourcing: document.getElementById("sourcing-role")
+  },
+  pipelineRange: document.getElementById("pipeline-range"),
+  sourcingRange: document.getElementById("sourcing-range")
+};
+
+const formatNumber = (value) => {
+  if (value === null || value === undefined || Number.isNaN(value)) {
+    return "—";
+  }
+  return value.toLocaleString("en-US");
+};
+
+const formatPercent = (value) => {
+  if (!Number.isFinite(value)) {
+    return "—";
+  }
+  return `${Math.round(value * 100)}%`;
+};
+
+const formatDate = (value) => {
+  if (!value) return "—";
+  const date = new Date(value);
+  if (Number.isNaN(date.getTime())) return value;
+  return date.toLocaleDateString("en-GB", {
+    day: "2-digit",
+    month: "short",
+    year: "numeric"
+  });
+};
+
+const formatWeekLabel = (value) => {
+  if (!value) return "—";
+  const date = new Date(value);
+  if (Number.isNaN(date.getTime())) return value;
+  const label = date.toLocaleDateString("en-GB", {
+    day: "2-digit",
+    month: "short"
+  });
+  return `w/c ${label}`;
+};
+
+const normalizeKey = (key) =>
+  key
+    .trim()
+    .toLowerCase()
+    .replace(/\s+/g, "_")
+    .replace(/[()]/g, "")
+    .replace(/[^a-z0-9_]/g, "_");
+
+const shouldParseDate = (key) =>
+  key.includes("date") ||
+  key.includes("week_start") ||
+  key.includes("start") ||
+  key.includes("contact") ||
+  key.includes("signature");
+
+const parseValue = (key, value) => {
+  if (value === undefined || value === null) return null;
+  const trimmed = String(value).trim();
+  if (!trimmed) return null;
+
+  if (/^[-+]?\d*\.?\d+$/.test(trimmed)) {
+    const parsed = Number(trimmed);
+    return Number.isNaN(parsed) ? trimmed : parsed;
+  }
+
+  if (shouldParseDate(key)) {
+    const parsedDate = new Date(trimmed);
+    if (!Number.isNaN(parsedDate.getTime())) {
+      return parsedDate.toISOString();
+    }
+  }
+
+  return trimmed;
+};
+
+const fetchCsv = async (tabName) => {
+  const tab = SHEET.tabs[tabName];
+  const url = `https://docs.google.com/spreadsheets/d/${SHEET.sheetId}/gviz/tq?tqx=out:csv&gid=${tab.gid}&t=${Date.now()}`;
+  const response = await fetch(url, { cache: "no-store" });
+  if (!response.ok) {
+    throw new Error(`Failed to load ${tabName}`);
+  }
+  return response.text();
+};
+
+const parseCsv = (text) => {
+  const result = Papa.parse(text, {
+    header: true,
+    skipEmptyLines: true
+  });
+
+  if (result.errors?.length) {
+    console.warn("CSV parse errors", result.errors);
+    throw new Error("Parsing error");
+  }
+
+  return result.data.map((row) => {
+    const normalized = {};
+    Object.entries(row).forEach(([key, value]) => {
+      const normalizedKey = normalizeKey(key);
+      normalized[normalizedKey] = parseValue(normalizedKey, value);
+    });
+    return normalized;
+  });
+};
+
+const showBanner = (message) => {
+  if (!message) {
+    banner.classList.add("hidden");
+    banner.textContent = "";
+    return;
+  }
+  banner.textContent = message;
+  banner.classList.remove("hidden");
+};
+
+const setLastRefresh = () => {
+  const element = document.getElementById("last-refresh");
+  const now = new Date();
+  element.textContent = now.toLocaleTimeString("en-GB", {
+    hour: "2-digit",
+    minute: "2-digit"
+  });
+};
+
+const initNav = () => {
+  selectors.navLinks.forEach((link) => {
+    link.addEventListener("click", (event) => {
+      event.preventDefault();
+      const pageId = link.dataset.page;
+      selectors.navLinks.forEach((nav) => nav.classList.remove("active"));
+      selectors.pages.forEach((page) => page.classList.remove("active"));
+      link.classList.add("active");
+      document.getElementById(pageId).classList.add("active");
+    });
+  });
+};
+
+const buildRoleOptions = () => {
+  const roles = new Set();
+  [
+    ...state.data.overview_data,
+    ...state.data.pipeline_weekly,
+    ...state.data.sourcing_data,
+    ...state.data.hired_data
+  ].forEach((row) => {
+    if (row.role) roles.add(row.role);
+  });
+
+  const options = ["All", ...Array.from(roles).sort()];
+  Object.values(selectors.roleSelects).forEach((select) => {
+    select.innerHTML = options
+      .map((role) => `<option value="${role}">${role}</option>`)
+      .join("");
+    select.value = state.roleFilter;
+    select.addEventListener("change", (event) => {
+      state.roleFilter = event.target.value;
+      syncRoleFilters();
+      renderAll();
+    });
+  });
+};
+
+const syncRoleFilters = () => {
+  Object.values(selectors.roleSelects).forEach((select) => {
+    if (select.value !== state.roleFilter) {
+      select.value = state.roleFilter;
+    }
+  });
+};
+
+const filterByRole = (rows) => {
+  if (state.roleFilter === "All") return rows;
+  return rows.filter((row) => row.role === state.roleFilter);
+};
+
+const getCurrentStage = (row) => {
+  const stageOrder = [...STAGES];
+  const found = stageOrder
+    .reverse()
+    .find((stage) => Number(row[stage] || 0) > 0);
+  return found ? found.replace("_", " ") : "—";
+};
+
+const healthBadge = (health) => {
+  const lower = (health || "").toString().toLowerCase().replace(/_/g, " ");
+  if (lower === "new") {
+    return `<span class="badge health-new"><span class="dot"></span>New</span>`;
+  }
+  if (lower === "in progress") {
+    return `<span class="badge health-progress">In progress</span>`;
+  }
+  if (lower === "critical") {
+    return `<span class="badge health-critical">Critical</span>`;
+  }
+  if (lower === "on hold") {
+    return `<span class="badge health-hold">On hold</span>`;
+  }
+  if (lower === "filled") {
+    return `<span class="badge health-filled">⚑ Filled</span>`;
+  }
+  return `<span class="badge health-progress">—</span>`;
+};
+
+const statusBadge = (status) => {
+  const lower = (status || "").toString().toLowerCase();
+  if (lower === "open") {
+    return `<span class="badge status-open">Open</span>`;
+  }
+  if (lower === "on hold") {
+    return `<span class="badge status-on-hold">On hold</span>`;
+  }
+  if (lower === "filled") {
+    return `<span class="badge status-filled">Filled</span>`;
+  }
+  return `<span class="badge status-on-hold">—</span>`;
+};
+
+const renderOverview = () => {
+  const overviewRows = filterByRole(state.data.overview_data);
+  const hiredRows = filterByRole(state.data.hired_data);
+  const openRoles = overviewRows.filter((row) =>
+    (row.status || "").toString().toLowerCase().includes("open")
+  ).length;
+  const filledRoles = overviewRows.filter((row) =>
+    (row.status || "").toString().toLowerCase().includes("filled")
+  ).length;
+  const totalRoles = overviewRows.length || 0;
+  const hiringProgress = totalRoles ? filledRoles / totalRoles : null;
+
+  const totalOpenings = overviewRows.reduce((sum, row) => {
+    return sum + (Number.isFinite(row.openings) ? row.openings : 0);
+  }, 0);
+  const filledOpenings = overviewRows
+    .filter((row) => (row.status || "").toString().toLowerCase() === "filled")
+    .reduce((sum, row) => {
+      return sum + (Number.isFinite(row.openings) ? row.openings : 0);
+    }, 0);
+
+  const tthValues = hiredRows
+    .map((row) => row.tth)
+    .filter((value) => Number.isFinite(value));
+  const avgTth = tthValues.length
+    ? tthValues.reduce((sum, val) => sum + val, 0) / tthValues.length
+    : null;
+
+  document.getElementById("kpi-open").textContent = formatNumber(openRoles);
+  document.getElementById("kpi-filled").textContent = formatNumber(filledRoles);
+  document.getElementById("kpi-progress").textContent =
+    hiringProgress !== null ? formatPercent(hiringProgress) : "—";
+  const progressSub = document.getElementById("kpi-progress-sub");
+  if (totalOpenings > 0) {
+    progressSub.textContent = `${filledOpenings} / ${totalOpenings} openings`;
+  } else {
+    progressSub.textContent = "";
+  }
+  document.getElementById("kpi-tth").textContent =
+    avgTth !== null ? `${avgTth.toFixed(1)} days` : "—";
+
+  const table = document.getElementById("roles-table");
+  table.innerHTML = overviewRows
+    .map((row) => {
+      return `
+        <tr>
+          <td>${row.role || "—"}</td>
+          <td>${statusBadge(row.status)}</td>
+          <td>${healthBadge(row.health)}</td>
+          <td>${formatNumber(row.openings)}</td>
+          <td>${getCurrentStage(row)}</td>
+          <td>${row.comment || ""}</td>
+        </tr>
+      `;
+    })
+    .join("");
+};
+
+const getRangeRows = (rows, range) => {
+  const sorted = [...rows].sort((a, b) => {
+    const dateA = new Date(a.week_start || 0).getTime();
+    const dateB = new Date(b.week_start || 0).getTime();
+    return dateA - dateB;
+  });
+  return sorted.slice(-range);
+};
+
+const buildPipelineChart = (labels, datasets) => {
+  if (state.charts.pipeline) {
+    state.charts.pipeline.destroy();
+  }
+  const ctx = document.getElementById("pipeline-chart");
+  state.charts.pipeline = new Chart(ctx, {
+    type: "bar",
+    data: {
+      labels,
+      datasets
+    },
+    options: {
+      responsive: true,
+      maintainAspectRatio: false,
+      scales: {
+        x: { stacked: true },
+        y: { stacked: true, beginAtZero: true }
+      },
+      plugins: {
+        legend: { position: "bottom" }
+      }
+    }
+  });
+};
+
+const renderPipeline = () => {
+  const roleRows = filterByRole(state.data.pipeline_weekly);
+  const rangeRows = getRangeRows(roleRows, state.pipelineRange);
+  const labels = rangeRows.map((row) => formatWeekLabel(row.week_start));
+
+  const datasets = STAGES.map((stage) => ({
+    label: stage.replace("_", " "),
+    data: rangeRows.map((row) => row[stage] || 0),
+    backgroundColor: `rgba(199, 83, 0, ${0.15 + STAGES.indexOf(stage) * 0.08})`,
+    borderWidth: 0
+  }));
+
+  buildPipelineChart(labels, datasets);
+
+  const table = document.getElementById("pipeline-table");
+  table.innerHTML = rangeRows
+    .map((row) => {
+      return `
+      <tr>
+        <td>${formatWeekLabel(row.week_start)}</td>
+        <td>${formatNumber(row.sourced)}</td>
+        <td>${formatNumber(row.reviewed)}</td>
+        <td>${formatNumber(row.step1)}</td>
+        <td>${formatNumber(row.tech_light)}</td>
+        <td>${formatNumber(row.tech_iv)}</td>
+        <td>${formatNumber(row.final)}</td>
+        <td>${formatNumber(row.offer)}</td>
+        <td>${formatNumber(row.hired)}</td>
+        <td>${healthBadge(row.health)}</td>
+      </tr>
+      `;
+    })
+    .join("");
+};
+
+const buildSourcingCharts = (labels, contacted, replied, screens) => {
+  if (state.charts.sourcingLine) {
+    state.charts.sourcingLine.destroy();
+  }
+  if (state.charts.sourcingBar) {
+    state.charts.sourcingBar.destroy();
+  }
+
+  const lineCtx = document.getElementById("sourcing-line");
+  state.charts.sourcingLine = new Chart(lineCtx, {
+    type: "line",
+    data: {
+      labels,
+      datasets: [
+        {
+          label: "Contacted",
+          data: contacted,
+          borderColor: "rgba(199, 83, 0, 0.9)",
+          backgroundColor: "rgba(199, 83, 0, 0.2)",
+          tension: 0.3
+        },
+        {
+          label: "Replied",
+          data: replied,
+          borderColor: "rgba(29, 29, 31, 0.7)",
+          backgroundColor: "rgba(29, 29, 31, 0.1)",
+          tension: 0.3
+        }
+      ]
+    },
+    options: {
+      responsive: true,
+      maintainAspectRatio: false,
+      plugins: {
+        legend: { position: "bottom" }
+      },
+      scales: {
+        y: { beginAtZero: true }
+      }
+    }
+  });
+
+  const barCtx = document.getElementById("sourcing-bar");
+  state.charts.sourcingBar = new Chart(barCtx, {
+    type: "bar",
+    data: {
+      labels,
+      datasets: [
+        {
+          label: "Recruiter screens",
+          data: screens,
+          backgroundColor: "rgba(199, 83, 0, 0.4)",
+          borderRadius: 8
+        }
+      ]
+    },
+    options: {
+      responsive: true,
+      maintainAspectRatio: false,
+      scales: {
+        y: { beginAtZero: true }
+      },
+      plugins: {
+        legend: { display: false }
+      }
+    }
+  });
+};
+
+const renderSourcing = () => {
+  const roleRows = filterByRole(state.data.sourcing_data);
+  const rangeRows = getRangeRows(roleRows, state.sourcingRange);
+  const contacted = rangeRows.map((row) => row.contacted || 0);
+  const replied = rangeRows.map((row) => row.replied || 0);
+  const screens = rangeRows.map((row) => row.recruiter_screen || 0);
+
+  const sum = (values) => values.reduce((acc, val) => acc + val, 0);
+  const totalContacted = sum(contacted);
+  const totalReplied = sum(replied);
+  const totalScreens = sum(screens);
+  const replyRate = totalContacted ? totalReplied / totalContacted : null;
+
+  document.getElementById("kpi-contacted").textContent =
+    formatNumber(totalContacted);
+  document.getElementById("kpi-replied").textContent =
+    formatNumber(totalReplied);
+  document.getElementById("kpi-reply-rate").textContent =
+    replyRate !== null ? formatPercent(replyRate) : "—";
+  document.getElementById("kpi-screens").textContent =
+    formatNumber(totalScreens);
+
+  const labels = rangeRows.map((row) => formatWeekLabel(row.week_start));
+  buildSourcingCharts(labels, contacted, replied, screens);
+};
+
+const buildHiresChart = (labels, counts) => {
+  if (state.charts.hiresBar) {
+    state.charts.hiresBar.destroy();
+  }
+  const ctx = document.getElementById("hires-bar");
+  state.charts.hiresBar = new Chart(ctx, {
+    type: "bar",
+    data: {
+      labels,
+      datasets: [
+        {
+          label: "Hires",
+          data: counts,
+          backgroundColor: "rgba(199, 83, 0, 0.4)",
+          borderRadius: 8
+        }
+      ]
+    },
+    options: {
+      responsive: true,
+      maintainAspectRatio: false,
+      plugins: {
+        legend: { display: false }
+      },
+      scales: {
+        y: { beginAtZero: true }
+      }
+    }
+  });
+};
+
+const renderHires = () => {
+  const hiredRows = filterByRole(state.data.hired_data);
+  const tthValues = hiredRows
+    .map((row) => row.tth)
+    .filter((value) => Number.isFinite(value));
+  const ttfValues = hiredRows
+    .map((row) => row.ttf)
+    .filter((value) => Number.isFinite(value));
+  const dipValues = hiredRows
+    .map((row) => row.days_in_process)
+    .filter((value) => Number.isFinite(value));
+
+  const avg = (values) =>
+    values.length
+      ? values.reduce((sum, val) => sum + val, 0) / values.length
+      : null;
+
+  document.getElementById("kpi-total-hires").textContent =
+    formatNumber(hiredRows.length);
+  document.getElementById("kpi-avg-tth").textContent =
+    avg(tthValues) !== null ? `${avg(tthValues).toFixed(1)} days` : "—";
+  document.getElementById("kpi-avg-ttf").textContent =
+    avg(ttfValues) !== null ? `${avg(ttfValues).toFixed(1)} days` : "—";
+  document.getElementById("kpi-avg-dip").textContent =
+    avg(dipValues) !== null ? `${avg(dipValues).toFixed(1)} days` : "—";
+
+  const table = document.getElementById("hires-table");
+  table.innerHTML = hiredRows
+    .map((row) => {
+      return `
+        <tr>
+          <td>${row.role || "—"}</td>
+          <td>${row.first_name || "—"}</td>
+          <td>${row.last_name || "—"}</td>
+          <td>${row.source || "—"}</td>
+          <td>${formatNumber(row.salary)}</td>
+          <td>${formatDate(row.live_date)}</td>
+          <td>${formatDate(row.first_contact)}</td>
+          <td>${formatDate(row.signature_date)}</td>
+          <td>${formatDate(row.start_date)}</td>
+          <td>${formatNumber(row.tth)}</td>
+          <td>${formatNumber(row.ttf)}</td>
+          <td>${formatNumber(row.days_in_process)}</td>
+        </tr>
+      `;
+    })
+    .join("");
+
+  const roleCounts = hiredRows.reduce((acc, row) => {
+    const role = row.role || "Unknown";
+    acc[role] = (acc[role] || 0) + 1;
+    return acc;
+  }, {});
+
+  const labels = Object.keys(roleCounts);
+  const counts = labels.map((label) => roleCounts[label]);
+  buildHiresChart(labels, counts);
+};
+
+const renderAll = () => {
+  renderOverview();
+  renderPipeline();
+  renderSourcing();
+  renderHires();
+};
+
+const initFilters = () => {
+  selectors.pipelineRange.addEventListener("change", (event) => {
+    state.pipelineRange = Number(event.target.value);
+    renderPipeline();
+  });
+
+  selectors.sourcingRange.addEventListener("change", (event) => {
+    state.sourcingRange = Number(event.target.value);
+    renderSourcing();
+  });
+};
+
+const loadData = async () => {
+  const tabs = Object.keys(SHEET.tabs);
+  const results = await Promise.allSettled(
+    tabs.map(async (tab) => {
+      const text = await fetchCsv(tab);
+      return parseCsv(text);
+    })
+  );
+
+  let hasError = false;
+  let hasParseError = false;
+  results.forEach((result, index) => {
+    const tab = tabs[index];
+    if (result.status === "fulfilled") {
+      state.data[tab] = result.value;
+    } else {
+      console.warn(`Failed to load ${tab}`, result.reason);
+      hasError = true;
+      if (result.reason?.message === "Parsing error") {
+        hasParseError = true;
+      }
+    }
+  });
+
+  if (hasParseError) {
+    showBanner("Data parsing error. See console for details.");
+    return;
+  }
+  if (hasError) {
+    showBanner("Data source unavailable. Showing last available data.");
+    return;
+  }
+  showBanner("");
+};
+
+const init = async () => {
+  initNav();
+  initFilters();
+
+  await loadData();
+
+  buildRoleOptions();
+  renderAll();
+  setLastRefresh();
+};
+
+init();
 
EOF
)
