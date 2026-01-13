document.addEventListener("DOMContentLoaded", () => {

  /* -------------------- CONFIG -------------------- */

  const CSV = {
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    targets: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const HEALTH_THRESHOLDS = {
    critical: 1 / 6,
    warning: 2 / 6,
    healthy: 4 / 6
  };

  /* -------------------- HELPERS -------------------- */

  function parseCSV(text) {
    const rows = text.trim().split("\n").map(r => r.split(","));
    const headers = rows.shift();
    return rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (r[i] || "").trim());
      return obj;
    });
  }

  const num = v => Number(v) || 0;

  const badge = health => {
    const map = {
      healthy: "🟢 Healthy",
      warning: "🟡 Warning",
      critical: "🔴 Critical",
      new: "⚪ New"
    };
    return map[health] || "⚪ New";
  };

  /* -------------------- LOAD DATA -------------------- */

  async function loadCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    return parseCSV(text);
  }

  /* -------------------- HEALTH LOGIC -------------------- */

  function computeHealth(roleRows, target) {
    const lookback = num(target.lookback_weeks);

    const recent = roleRows.slice(-lookback);

    const sums = {};
    [
      "sourced",
      "step1",
      "tech_light",
      "tech_iv",
      "final",
      "offer",
      "hired"
    ].forEach(k => {
      sums[k] = recent.reduce((s, r) => s + num(r[k]), 0);
    });

    if (sums.sourced < num(target.min_prev_stage_n)) {
      return { health: "new", reason: "Not enough data" };
    }

    const checks = [
      { a: "step1", b: "sourced", exp: target.step1_from_sourced_exp },
      { a: "tech_light", b: "step1", exp: target.techlight_from_step1_exp },
      { a: "tech_iv", b: "tech_light", exp: target.techiv_from_techlight_exp },
      { a: "final", b: "tech_iv", exp: target.final_from_techiv_exp },
      { a: "offer", b: "final", exp: target.offer_from_final_exp },
      { a: "hired", b: "offer", exp: target.hired_from_offer_exp }
    ];

    let worstScore = Infinity;
    let bottleneck = "";

    checks.forEach(c => {
      if (sums[c.b] >= num(target.min_prev_stage_n)) {
        const actual = sums[c.a] / sums[c.b];
        const expected = num(c.exp);
        const score = actual / expected;
        if (score < worstScore) {
          worstScore = score;
          bottleneck = `${c.b} → ${c.a}`;
        }
      }
    });

    if (worstScore < HEALTH_THRESHOLDS.critical) {
      return { health: "critical", reason: bottleneck };
    }
    if (worstScore < HEALTH_THRESHOLDS.warning) {
      return { health: "warning", reason: bottleneck };
    }
    if (worstScore >= HEALTH_THRESHOLDS.healthy) {
      return { health: "healthy", reason: bottleneck };
    }

    return { health: "new", reason: bottleneck };
  }

  /* -------------------- RENDER -------------------- */

  async function renderPipeline() {
    const pipeline = await loadCSV(CSV.pipeline);
    const targets = await loadCSV(CSV.targets);

    const byRole = {};
    pipeline.forEach(r => {
      if (!byRole[r.role]) byRole[r.role] = [];
      byRole[r.role].push(r);
    });

    let html = `
      <h2>Pipeline Health</h2>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Health</th>
            <th>Bottleneck</th>
          </tr>
        </thead>
        <tbody>
    `;

    targets.forEach(t => {
      const roleRows = byRole[t.role] || [];
      const result = computeHealth(roleRows, t);
      html += `
        <tr>
          <td>${t.role}</td>
          <td>${badge(result.health)}</td>
          <td>${result.reason || "-"}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    document.getElementById("pipeline").innerHTML = html;
    document.getElementById("overview").innerHTML = html;
  }

  /* -------------------- INIT -------------------- */

  renderPipeline();
  setInterval(renderPipeline, 60000);
});
