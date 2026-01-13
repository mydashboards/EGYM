document.addEventListener("DOMContentLoaded", () => {
  // 1) TAB NAV
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });

  // 2) CSV SOURCES (your published links)
  const CSV = {
    overview: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    sourcing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hires: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
  };

  // 3) HELPERS
  const setSectionHTML = (sectionId, html) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.innerHTML = html;
  };

  function parseCSV(text) {
    // Simple CSV parser that supports quoted commas
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        row.push(current);
        current = "";
        continue;
      }
      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i++;
        row.push(current);
        current = "";
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
        row = [];
        continue;
      }
      current += ch;
    }
    row.push(current);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);

    if (rows.length === 0) return [];
    const headers = rows[0].map(h => (h || "").trim());
    const data = rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
      return obj;
    });
    return data;
  }

  function toNumber(v) {
    if (v == null) return 0;
    const s = String(v).replace(",", ".").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function percent(num, den) {
    if (!den || den === 0) return "0%";
    return Math.round((num / den) * 100) + "%";
  }

  function tableHTML(rows, columns) {
    if (!rows || rows.length === 0) {
      return `<div class="card"><b>No data</b><div class="muted">Sheet is empty or not published.</div></div>`;
    }
    const thead = `<thead><tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>
      ${rows.map(r => `<tr>${columns.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}
    </tbody>`;
    return `<div class="card"><table>${thead}${tbody}</table></div>`;
  }

  // 4) RENDERERS
  async function loadAndRenderOverview() {
    const res = await fetch(CSV.overview, { cache: "no-store" });
    if (!res.ok) throw new Error("overview_data fetch failed");
    const text = await res.text();
    const rows = parseCSV(text);

    // show key columns first if present
    const preferred = ["role", "level", "realm", "team", "status", "location", "tap", "pplwise_tap", "pplwise_sourcer", "openings", "health", "comment"];
    const columns = preferred.filter(c => rows[0]?.hasOwnProperty(c));
    const fallbackCols = rows[0] ? Object.keys(rows[0]) : [];
    const cols = columns.length ? columns : fallbackCols;

    const html =
      `<h2>Overview</h2>
       <p>Current role status and pipeline snapshot.</p>
       ${tableHTML(rows, cols)}`;

    setSectionHTML("overview", html);
  }

  async function loadAndRenderPipeline() {
    const res = await fetch(CSV.pipeline, { cache: "no-store" });
    if (!res.ok) throw new Error("pipeline_weekly fetch failed");
    const text = await res.text();
    const rows = parseCSV(text);

    const preferred = ["year", "kw", "week_start", "role", "sourced", "reviewed", "step1", "tech_light", "tech_iv", "final", "offer", "hired", "health"];
    const columns = preferred.filter(c => rows[0]?.hasOwnProperty(c));
    const fallbackCols = rows[0] ? Object.keys(rows[0]) : [];
    const cols = columns.length ? columns : fallbackCols;

    const html =
      `<h2>Pipeline</h2>
       <p>Weekly pipeline health by role.</p>
       ${tableHTML(rows, cols)}`;

    setSectionHTML("pipeline", html);
  }

  async function loadAndRenderSourcing() {
    const res = await fetch(CSV.sourcing, { cache: "no-store" });
    if (!res.ok) throw new Error("sourcing_data fetch failed");
    const text = await res.text();
    const rows = parseCSV(text);

    // compute conversion = recruiter_screen / contacted (aggregated per row)
    const enriched = rows.map(r => {
      const contacted = toNumber(r.contacted);
      const screen = toNumber(r.recruiter_screen);
      return { ...r, conversion_rate: percent(screen, contacted) };
    });

    const preferred = ["year", "kw", "week_start", "role", "role_status", "contacted", "replied", "recruiter_screen", "conversion_rate"];
    const columns = preferred.filter(c => enriched[0]?.hasOwnProperty(c));
    const fallbackCols = enriched[0] ? Object.keys(enriched[0]) : [];
    const cols = columns.length ? columns : fallbackCols;

    const html =
      `<h2>Sourcing</h2>
       <p>Weekly sourcing KPIs (incl. Outreach → Recruiter Screen conversion).</p>
       ${tableHTML(enriched, cols)}`;

    setSectionHTML("sourcing", html);
  }

  async function loadAndRenderHires() {
    const res = await fetch(CSV.hires, { cache: "no-store" });
    if (!res.ok) throw new Error("hired_data fetch failed");
    const text = await res.text();
    const rows = parseCSV(text);

    const preferred = ["role", "first_name", "last_name", "source", "salary", "live_date", "1st_contact", "signature_date", "start_date", "TTH", "TTF", "days_in_process"];
    const columns = preferred.filter(c => rows[0]?.hasOwnProperty(c));
    const fallbackCols = rows[0] ? Object.keys(rows[0]) : [];
    const cols = columns.length ? columns : fallbackCols;

    const html =
      `<h2>Hires & KPIs</h2>
       <p>Time-to-hire (live → signature), time-to-fill (live → start), days-in-process (1st contact → signature).</p>
       ${tableHTML(rows, cols)}`;

    setSectionHTML("hires", html);
  }

  async function refreshAll() {
    // show placeholders while loading
    setSectionHTML("overview", `<h2>Overview</h2><div class="card">Loading…</div>`);
    setSectionHTML("pipeline", `<h2>Pipeline</h2><div class="card">Loading…</div>`);
    setSectionHTML("sourcing", `<h2>Sourcing</h2><div class="card">Loading…</div>`);
    setSectionHTML("hires", `<h2>Hires & KPIs</h2><div class="card">Loading…</div>`);

    try { await loadAndRenderOverview(); } catch (e) { setSectionHTML("overview", `<h2>Overview</h2><div class="card">Data source unavailable.</div>`); }
    try { await loadAndRenderPipeline(); } catch (e) { setSectionHTML("pipeline", `<h2>Pipeline</h2><div class="card">Data source unavailable.</div>`); }
    try { await loadAndRenderSourcing(); } catch (e) { setSectionHTML("sourcing", `<h2>Sourcing</h2><div class="card">Data source unavailable.</div>`); }
    try { await loadAndRenderHires(); } catch (e) { setSectionHTML("hires", `<h2>Hires & KPIs</h2><div class="card">Data source unavailable.</div>`); }
  }

  // 5) INITIAL LOAD + AUTO REFRESH
  refreshAll();
  setInterval(refreshAll, 60000); // every 60 seconds
});
