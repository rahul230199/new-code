/* =========================================================
   NETWORK — RENDER LAYER (LARGE SCALE MARKETPLACE)
   - Sorting
   - Filtering
   - Pagination
   - Detail modal trigger
========================================================= */

const containerId = "pageContainer";

/* =========================================================
   SAFE HELPERS
========================================================= */
function safeNumber(value) {
  return Number(value) || 0;
}

function getReliabilityBadge(score = 0) {
  if (score >= 85)
    return `<span class="tier-badge gold">🟢 Gold</span>`;
  if (score >= 70)
    return `<span class="tier-badge silver">🟡 Silver</span>`;
  if (score >= 55)
    return `<span class="tier-badge bronze">🟠 Bronze</span>`;
  return `<span class="tier-badge risk">🔴 Risk</span>`;
}

function renderCapacityBar(utilization = 0) {

  const percent = Math.min(safeNumber(utilization), 100);

  let color = "var(--green-500)";
  if (percent >= 85) color = "var(--red-500)";
  else if (percent >= 65) color = "var(--yellow-500)";

  return `
    <div class="capacity-bar-wrapper">
      <div class="capacity-bar-bg">
        <div class="capacity-bar-fill"
             style="width:${percent}%; background:${color};">
        </div>
      </div>
      <small>${percent}% Utilized</small>
    </div>
  `;
}

/* =========================================================
   LOADING
========================================================= */
export function renderNetworkLoading() {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML =
    `<div class="dashboard-loading">
        <h2>Loading Network Intelligence...</h2>
     </div>`;
}

/* =========================================================
   EMPTY
========================================================= */
export function renderNetworkEmpty() {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML =
    `<div class="dashboard-empty">
        <h3>No Suppliers Available</h3>
     </div>`;
}

/* =========================================================
   MAIN GRID WITH CONTROLS
========================================================= */
export function renderNetworkSuppliers({
  suppliers = [],
  pagination = {},
  currentFilters = {}
} = {}) {

  const container = document.getElementById(containerId);
  if (!container) return;

  const {
    page = 1,
    limit = 12,
    total = 0
  } = pagination;

  const totalPages = Math.ceil(total / limit) || 1;

  const cards = suppliers.map(supplier => {

    const reliabilityScore =
      safeNumber(supplier.reliability_score);

    return `
      <div class="supplier-card"
           data-id="${supplier.id}">

        <div class="supplier-header">
          <h3>${supplier.company_name}</h3>
          ${getReliabilityBadge(reliabilityScore)}
        </div>

        <div class="supplier-metrics">
          <div class="metric">
            <span>Reliability</span>
            <strong>${reliabilityScore}</strong>
          </div>

          <div class="metric">
            <span>Monthly Capacity</span>
            <strong>${supplier.monthly_capacity || "—"}</strong>
          </div>
        </div>

        ${renderCapacityBar(supplier.utilization_percent)}

        <button class="btn-secondary view-detail-btn"
                data-id="${supplier.id}">
          View Details
        </button>

      </div>
    `;

  }).join("");

  container.innerHTML = `
    <div class="network-header">
      <h2>Supplier Intelligence Marketplace</h2>

      <div class="network-controls">

        <select id="sortSelect">
          <option value="reliability_desc">Reliability (High → Low)</option>
          <option value="reliability_asc">Reliability (Low → High)</option>
          <option value="capacity_desc">Capacity (High → Low)</option>
        </select>

        <label class="filter-checkbox">
          <input type="checkbox" id="goldOnlyToggle">
          Gold Only
        </label>

        <select id="capacityFilter">
          <option value="">Min Available Capacity</option>
          <option value="20">20%</option>
          <option value="40">40%</option>
          <option value="60">60%</option>
        </select>

      </div>
    </div>

    <div class="supplier-grid">
      ${cards || `<p>No suppliers found</p>`}
    </div>

    <div class="pagination">
      <button id="prevPageBtn" ${page <= 1 ? "disabled" : ""}>
        ← Previous
      </button>

      <span>Page ${page} of ${totalPages}</span>

      <button id="nextPageBtn"
        ${page >= totalPages ? "disabled" : ""}>
        Next →
      </button>
    </div>
  `;
}

/* =========================================================
   SUPPLIER DETAIL MODAL
========================================================= */
export function renderSupplierDetailModal(data = {}) {

  const modal = document.createElement("div");
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal">
      <h3>${data.company_name}</h3>

      <p><strong>Reliability:</strong> ${data.reliability_score}</p>
      <p><strong>Monthly Capacity:</strong> ${data.monthly_capacity}</p>
      <p><strong>Utilization:</strong> ${data.utilization_percent}%</p>
      <p><strong>Certifications:</strong>
         ${data.certifications || "—"}</p>

      <button class="btn-secondary closeModalBtn">
        Close
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".closeModalBtn")
    .addEventListener("click", () => modal.remove());

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}