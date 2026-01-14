document.addEventListener("DOMContentLoaded", () => {
  /* ---------------- CONFIG (your CSV links) ---------------- */

  const CSV = {
    overview:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=780337575&single=true&output=csv",
    pipeline_weekly:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=565686110&single=true&output=csv",
    pipeline_inventory:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1802705167&single=true&output=csv",
    sourcing:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1825170360&single=true&output=csv",
    hired:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=756634566&single=true&output=csv",
    targets:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDgJVM1NTZyJW9bWpf5GrcS3WbJP7Et0AViTEkCs5OhaBmbvOGZuUSwnhNLJCg7yDfiCCz-TAHCC0p/pub?gid=1524950504&single=true&output=csv"
  };

  const DATA_SOURCE_LABELS = {
    overview: "overview_data",
    pipeline_weekly: "pipeline_weekly",
    pipeline_inventory: "pipeline_inventory",
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
    weeklyRows: [],
    inventoryRows: [],
    sourcingRows: [],
    hiredRows: [],
    targets: [],

    pipelineWeekOptions: [],
    activityWeekOptions: [],
    sourcingWeekOptions: [],

    selectedPipelineWeek: "",
    selectedActivityWeek: "",
    selectedSourcingWeek: ""
  };

  /* ---------------- DOM HELPERS ---------------- */

  const $ = (id) => document.getElementById(id);
  const dataErrors = new Map();

  function setDataError(key, message) {
    if (message) dataErrors.set(key, message);
    else dataErrors.delete(key);
    updateDataErrorBanner();
  }

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
      .map((m) => `<div>${m}</div>`)
      .join("");
  }

  function setSectionError(id, msg) {
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

  /* ---------------- CSV PARSING ---------------- */

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
    if (
      lower.startsWith("<!doctype") ||
      lower.startsWith("<html") ||
      lower.startsWith("<meta") ||
      lower.startsWith("<head") ||
      lower.startsWith("<body")
    ) {
      return { headers: [], rows: [], isHtml: true };
    }

    // Support "sep=," first line
    const lines = cleaned.split(/\r?\n/);
    let startIndex = 0;
    if (lines[0] && lines[0].toLowerCase().startsWith("sep=")) startIndex = 1;
    const content = lines.slice(startIndex).join("\n");

    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
      const ch = content[i];
      const next = content[i +]()
