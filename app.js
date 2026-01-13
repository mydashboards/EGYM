document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const HEALTH_THRESHOLDS = {
    critical: 1 / 6,
    warning: 2 / 6,
    healthy: 4 / 6
  };

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

  function badgeHTML(health) {
    if (health === "healthy") return `<span class="badge"><span class="dot good"></span>Healthy</span>`;
    if (health === "warning") return `<span class="badge"><span class="dot warn"></span>Warning</span>`;
    if (health === "critical") return `<span class="badge"><span class="dot bad"></span>Critical</span>`;
    return `<span class="badge"><span class="dot neutral"></span>New</span>`;
  }

  function fmtDate(d = new Date()) {
    return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  /* ---------------- TABS (always keep clickable) ---------------- */

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const id = btn.dataset.tab;
        document.getElementById(id).classList.add("active");
      });
    });
  }

  /* ---------------- HEALTH LOGIC ---------------- */

  function computeHealth(roleRows, target) {
    const lookback = Math.max(1, num(target.lookback_weeks));
    const minN = Math.max(1, num(target.min_prev_stage_n));

    const recent = roleRows.slice(-lookback);

    const sums = {};
    ["sourced","step1","tech_light","tech_iv","final","offer","hired"].forEach(k => {
      sums[k] = recent.reduce((s, r) => s + num(r[k]), 0);
    });

    if (sums.sourced < minN) {
      return { health: "new", reason: "Not enough data", lookback };
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
          bottleneck = `${c.label} (${(actual*100).toFixed(0)}% vs ${(expected*100).toFixed(0)}%)`;
        }
      }
    }

    if (worstScore === Infinity) {
      return { health: "new", reason: "Not enough data", lookback };
    }

    if (worstScore < HEALTH_THRESHOLDS.critical) return { health: "critical", reason: bottleneck, lookback };
    if (worstScore < HEALTH_THRESHOLDS.warning) return { health: "warning", reason: bottleneck, lookback };
    if (worstScore >= HEALTH_THRESHOLDS.healthy) return { health: "healthy", reason: bottleneck, lookback };

    return { health: "new", reason: bottleneck, lookback };
  }

  /* ---------------- RENDER: PIPELINE ---------------- */

  function renderPipeline(pipelineRows, targets) {
    const byRole = {};
    pipelineRows.forEach(r => {
      const role = r.role;
      if (!role) return;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(r);
    });

    const tbody = $("pipelineTable");
    tbody.innerHTML = "";

    targets.forEach(t => {
      const roleRows = byRole[t.role] || [];
      const result = computeHealth(roleRows, t);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.role}</td>
        <td>${badgeHTML(result.health)}</td>
        <td>${result.reason || "—"}</td>
        <td>${result.lookback}w</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- RENDER: OVERVIEW ---------------- */

  function renderOverview(overviewRows, pipelineRows, targets) {
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
      healthByRole[role] = computeHealth(byRolePipeline[role], t).health;
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
      <div class="kpi"><div class="label">Health (🟢/🟡/🔴)</div><div class="value">${healthCounts.healthy}/${healthCounts.warning}/${healthCounts.critical}</div></div>
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

  /* ---------------- MAIN LOAD ---------------- */

  async function refreshAll() {
    setError("overviewError", "");
    setError("pipelineError", "");

    try {
      const [overviewRows, pipelineRows, targets] = await Promise.all([
        loadCSV(CSV.overview),
        loadCSV(CSV.pipeline),
        loadCSV(CSV.targets)
      ]);

      renderPipeline(pipelineRows, targets);
      renderOverview(overviewRows, pipelineRows, targets);

      $("lastUpdated").textContent = `Last updated: ${fmtDate()}`;
    } catch (e) {
      setError("pipelineError", `Error: ${e.message}`);
      setError("overviewError", `Error: ${e.message}`);
      console.error(e);
    }
  }

  /* ---------------- INIT ---------------- */

  initTabs();

  $("refreshBtn").addEventListener("click", refreshAll);

  refreshAll();
  setInterval(refreshAll, 60000);
});
