/* =========================================================
   NETWORK — PAGE CONTROLLER (LARGE SCALE MARKETPLACE)
   - Server-driven pagination
   - Sorting
   - Filtering
   - Detail modal
========================================================= */

import { RouteGuard } from "../../guards/routeGuard.js";
import NetworkAPI from "./network.api.js";
import {
  renderNetworkLoading,
  renderNetworkSuppliers,
  renderNetworkEmpty,
  renderSupplierDetailModal
} from "./network.render.js";
import Toast from "../../core/toast.js";

/* =========================================================
   INTERNAL STATE
========================================================= */
let state = {
  page: 1,
  limit: 12,
  sort: "reliability_desc",
  gold_only: false,
  min_available_capacity: ""
};

/* =========================================================
   SAFE ERROR HANDLER
========================================================= */
function showError(error, fallbackMessage) {

  const message =
    error?.message && error.message.length < 150
      ? error.message
      : fallbackMessage;

  Toast.error(message || "Something went wrong");
}

/* =========================================================
   LOAD SUPPLIERS (WITH STATE)
========================================================= */
async function loadNetwork() {

  try {

    renderNetworkLoading();

    const { suppliers, pagination } =
      await NetworkAPI.getSuppliers(state);

    if (!suppliers || !suppliers.length) {
      renderNetworkEmpty();
      return;
    }

    renderNetworkSuppliers({
      suppliers,
      pagination,
      currentFilters: state
    });

    attachEventHandlers();

  } catch (error) {

    showError(
      error,
      "Unable to load supplier intelligence"
    );

    renderNetworkEmpty();
  }
}

/* =========================================================
   EVENT BINDING
========================================================= */
function attachEventHandlers() {

  /* =============================
     SORT
  ============================= */
  document.getElementById("sortSelect")
    ?.addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.page = 1;
      loadNetwork();
    });

  /* =============================
     GOLD FILTER
  ============================= */
  document.getElementById("goldOnlyToggle")
    ?.addEventListener("change", (e) => {
      state.gold_only = e.target.checked;
      state.page = 1;
      loadNetwork();
    });

  /* =============================
     CAPACITY FILTER
  ============================= */
  document.getElementById("capacityFilter")
    ?.addEventListener("change", (e) => {
      state.min_available_capacity = e.target.value;
      state.page = 1;
      loadNetwork();
    });

  /* =============================
     PAGINATION
  ============================= */
  document.getElementById("prevPageBtn")
    ?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;
        loadNetwork();
      }
    });

  document.getElementById("nextPageBtn")
    ?.addEventListener("click", () => {
      state.page++;
      loadNetwork();
    });

  /* =============================
     SUPPLIER DETAIL
  ============================= */
  document.querySelectorAll(".view-detail-btn")
    .forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;

        try {
          const detail =
            await NetworkAPI.getSupplierById(id);

          renderSupplierDetailModal(detail);

        } catch (error) {
          showError(error, "Unable to load supplier detail");
        }
      });
    });

}

/* =========================================================
   INIT
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {

  const allowed = RouteGuard.protect({
    requireAuth: true,
    role: ["buyer"]
  });

  if (allowed === false) return;

  await loadNetwork();

});