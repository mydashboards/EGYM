/* -----------------------------
   TAB NAVIGATION
------------------------------ */
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

/* -----------------------------
   GOOGLE SHEETS (CSV EXPORTS)
   Replace later with real URLs
------------------------------ */
const SHEETS = {
  overview: null,
  pipeline: null,
  sourcing: null,
  hires: null
};

/* -----------------------------
   HELPERS
------------------------------ */
function renderTable(containerId, columns, rows) {
  if (!rows || rows.length === 0) {
    document.getElementById(containerId).innerHTML =
      `<div class="card">No data available.</div>`;
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      tr.innerHTML += `<td>${row[col] ?? ""}</td>`;
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement("div");
  wrapper.className = "card";
  wrapper.appendChild(table);

  const container = document.getElementById(containerId);
  container.innerHTML = "";
  container.appendChild(wrapper);
}

/* -----------------------------
   PLACEHOLDER DATA
   (until CSVs are wired)
------------------------------ */
renderTable("overview-table",
  ["role", "status", "openings", "health"],
  [
    { role: "AppSec", status: "Open", openings: 2, health: "new" },
    { role: "C++", status: "Open", openings: 7, health: "new" }
  ]
);

renderTable("pipeline-table",
  ["week", "role", "sourced", "screen", "final"],
  [
    { week: "CW 3", role: "AppSec", sourced: 5, screen: 2, final: 0 }
  ]
);

renderTable("sourcing-table",
  ["role", "contacted", "replied", "recruiter_screen", "conversion_%"],
  [
    { role: "AppSec", contacted: 50, replied: 15, recruiter_screen: 5, conversion_%: "10%" }
  ]
);

renderTable("hires-table",
  ["role", "hire", "TTH", "TTF"],
  [
    { role: "FS Senior", hire: "Yes", TTH: "42d", TTF: "65d" }
  ]
);
