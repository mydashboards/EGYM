document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const HEALTH_THRESHOLDS = {
    critical: 1 / 6,
    warning: 2 / 6,
    healthy: 4 / 6
  };

  const HIRES_PASSWORD = "EGYM2026";

  /* ---------------- HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);

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

  function parseCSV(text) {
    // Simple CSV parser (works for your sheets: no embedded commas)
    const lines = text.trim().split("\n");
    const headers = lines.shift().split(",").map(h => h.trim());
    return lines.map(line => {
      const cells = line.split(",");
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cells[i] || "").trim());
      return obj;
    });
  }

  async function loadCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load CSV (${res.status})`);
    const text = await res.text();
    return parseCSV(text);
  }

  const num = v => Number(String(v).replace(",", ".")) || 0;

  const getField = (row, keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }
    return "";
  };

  function parseWeekStart(value) {
    if (!value) return null;
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
    if (value === null || value === undefined || value === "") return "—";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return numeric.toLocaleString();
  }

  function badgeHTML(health) {
    if (health === "healthy") return `<span class="badge"><span class="dot good"></span>Healthy</span>`;
    if (health === "warning") return `<span class="badge"><span class="dot warn"></span>Warning</span>`;
    if (health === "critical") return `<span class="badge"><span class="dot bad"></span>Critical</span>`;
    return `<span class="badge"><span class="dot neutral"></span>New</span>`;
  }

  function healthDotHTML(health) {
    if (health === "healthy") return `<span class="status-dot good" aria-label="Healthy"></span>`;
    if (health === "warning") return `<span class="status-dot warn" aria-label="At risk"></span>`;
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

  function getWeekOptions(rows) {
    const weeks = new Set();
    rows.forEach(row => {
      if (row.week_start) weeks.add(row.week_start);
    });
    return [...weeks].sort((a, b) => {
      const ad = parseWeekStart(a);
      const bd = parseWeekStart(b);
      if (ad && bd) return bd - ad;
      return b.localeCompare(a);
    });
  }

  function setSelectOptions(select, options) {
    const current = select.value;
    select.innerHTML = "";
    options.forEach(optionValue => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = formatWeekLabel(optionValue);
      select.appendChild(option);
    });
    if (current && options.includes(current)) {
      select.value = current;
    } else if (options.length) {
      select.value = options[0];
    }
  }

  /* ---------------- TABS (always keep clickable) ---------------- */

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
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

        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const id = btn.dataset.tab;
        document.getElementById(id).classList.add("active");
      });
    });
  }

  /* ---------------- HEALTH LOGIC ---------------- */

  function computeHealth(roleRows, target, endWeek) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const endDate = parseWeekStart(endWeek);
    const sorted = roleRows
      .filter(r => parseWeekStart(r.week_start))
      .sort((a, b) => parseWeekStart(a.week_start) - parseWeekStart(b.week_start));

    const eligible = endDate
      ? sorted.filter(r => parseWeekStart(r.week_start) <= endDate)
      : sorted;

    const recent = eligible.slice(-lookback);

    const sums = {};
    ["sourced","step1","tech_light","tech_iv","final","offer","hired"].forEach(k => {
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

    for (const c of checks) {
      const prev = sums[c.b];
      const expected = num(c.exp);

      // only evaluate if enough volume in previous step AND expected > 0
      if (prev >= minN && expected > 0) {
        const actual = sums[c.a] / prev;
        const score = actual / expected;

        if (score < worstScore) {
          worstScore = score;
          bottleneck = `${c.label} (${(actual * 100).toFixed(0)}% vs ${(expected * 100).toFixed(0)}%)`;
        }
      }
    }

    if (worstScore === Infinity) {
      return { health: "new", reason: "Not enough data" };
    }

    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck };
    if (worstScore >= HEALTH_THRESHOLDS.healthy) return { health: "healthy", reason: bottleneck };

    return { health: "new", reason: bottleneck };
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline(pipelineRows, targets, selectedWeek) {
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
      const weekRow = roleRows.find(r => r.week_start === selectedWeek) || {};
      const target = targets.find(t => t.role === role);
      const result = target ? computeHealth(roleRows, target, selectedWeek) : { health: "new", reason: "—" };

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${role}</td>
        <td>${formatNumber(num(weekRow.sourced))}</td>
        <td>${formatNumber(num(weekRow.reviewed || weekRow.review))}</td>
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

  function renderOverview(overviewRows, pipelineRows, targets, latestWeek) {
    const byRolePipeline = {};
    pipelineRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRolePipeline[role]) byRolePipeline[role] = [];
      byRolePipeline[role].push(r);
    });

    const targetByRole = {};
    targets.forEach(t => { targetByRole[t.role] = t; });

    // Compute health per role (for the overview table)
    const healthByRole = {};
    Object.keys(byRolePipeline).forEach(role => {
      const t = targetByRole[role];
      if (!t) return;
      healthByRole[role] = computeHealth(byRolePipeline[role], t, latestWeek).health;
    });

    // KPI cards
    const openRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "open").length;
    const filledRoles = overviewRows.filter(r => (r.status || "").toLowerCase() === "filled").length;
    const totalOpenings = overviewRows.reduce((s, r) => s + num(r.openings), 0);

    const healthCounts = { healthy:0, warning:0, critical:0, new:0 };
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

    // Overview table
    const tbody = $("overviewTable");
    tbody.innerHTML = "";

    overviewRows.forEach(r => {
      const h = healthByRole[r.role] || "new";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.role || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.location || ""}</td>
        <td>${r.openings || ""}</td>
        <td>${r.pplwise_sourcer || ""}</td>
        <td>${badgeHTML(h)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: SOURCING ---------------- */

  function renderSourcing(sourcingRows, selectedWeek) {
    const filtered = sourcingRows.filter(r => r.week_start === selectedWeek);
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

  function renderHires(hiredRows) {
    const tbody = $("hiresTable");
    tbody.innerHTML = "";

    const tthValues = [];
    const ttfValues = [];

    let offerTotal = 0;
    let hiredTotal = 0;
    let hasOfferData = false;

    hiredRows.forEach(row => {
      const tth = num(getField(row, ["TTH", "tth"]));
      const ttf = num(getField(row, ["TTF", "ttf"]));
      if (tth) tthValues.push(tth);
      if (ttf) ttfValues.push(ttf);

      const offers = num(getField(row, ["offer", "offers", "offered"]));
      const hired = num(getField(row, ["hired", "hires"]));

      if (offers || hired) {
        hasOfferData = true;
        offerTotal += offers;
        hiredTotal += hired;
      }

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
        <td>${getField(row, ["TTH", "tth"])}</td>
        <td>${getField(row, ["TTF", "ttf"])}</td>
        <td>${getField(row, ["days_in_process", "Days in Process", "days in process"])}</td>
      `;
      tbody.appendChild(tr);
    });

    const avgTth = average(tthValues);
    const medianTth = median(tthValues);
    const avgTtf = average(ttfValues);
    const medianTtf = median(ttfValues);
    const offerRate = hasOfferData && offerTotal > 0 ? hiredTotal / offerTotal : null;

    $("hiresKpis").innerHTML = `
      <div class="kpi"><div class="label">Total Hires</div><div class="value">${formatNumber(hiredRows.length)}</div></div>
      <div class="kpi"><div class="label">Avg TTH</div><div class="value">${avgTth ? avgTth.toFixed(1) : "—"}</div><div class="sub">Median ${medianTth ? medianTth.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Avg TTF</div><div class="value">${avgTtf ? avgTtf.toFixed(1) : "—"}</div><div class="sub">Median ${medianTtf ? medianTtf.toFixed(1) : "—"}</div></div>
      <div class="kpi"><div class="label">Offer Acceptance</div><div class="value">${formatPercent(offerRate)}</div><div class="sub">${hasOfferData ? `${formatNumber(hiredTotal)} hires / ${formatNumber(offerTotal)} offers` : "Offer data missing"}</div></div>
    `;
  }

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");
    setError("sourcingError", "");
    setError("hiresError", "");

    try {
      const [overviewRows, pipelineRows, sourcingRows, hiredRows, targets] = await Promise.all([
        loadCSV(CSV.overview),
        loadCSV(CSV.pipeline),
        loadCSV(CSV.sourcing),
        loadCSV(CSV.hired),
        loadCSV(CSV.targets)
      ]);

      const pipelineWeeks = getWeekOptions(pipelineRows);
      const sourcingWeeks = getWeekOptions(sourcingRows);

      setSelectOptions($("pipelineWeekSelect"), pipelineWeeks);
      setSelectOptions($("sourcingWeekSelect"), sourcingWeeks);

      const selectedPipelineWeek = $("pipelineWeekSelect").value;
      const selectedSourcingWeek = $("sourcingWeekSelect").value;

      renderPipeline(pipelineRows, targets, selectedPipelineWeek);
      renderSourcing(sourcingRows, selectedSourcingWeek);
      renderHires(hiredRows);

      const latestWeek = pipelineWeeks.length ? pipelineWeeks[0] : null;
      renderOverview(overviewRows, pipelineRows, targets, latestWeek);

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      setError("pipelineError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      setError("sourcingError", `Error: ${e.message}`);
      setError("hiresError", `Error: ${e.message}`);
      console.error(e);
    }
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  $("refreshBtn").addEventListener("click", refreshAll);
  $("pipelineWeekSelect").addEventListener("change", refreshAll);
  $("sourcingWeekSelect").addEventListener("change", refreshAll);

  refreshAll();
  setInterval(refreshAll, 60000);
});
