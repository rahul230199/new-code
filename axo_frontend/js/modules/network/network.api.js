/* =========================================================
   NETWORK — API LAYER (LARGE SCALE READY)
   - Server-side pagination
   - Sorting
   - Filtering
   - Detail endpoint
========================================================= */

import { ApiClient } from "../../core/apiClient.js";

/* =========================================================
   RESPONSE NORMALIZER
========================================================= */
function handleResponse(response, fallbackMessage) {

  if (!response || response.success !== true) {
    throw new Error(
      response?.message || fallbackMessage || "Request failed"
    );
  }

  return response;
}

export const NetworkAPI = {

  /* =====================================================
     GET NETWORK SUPPLIERS (WITH QUERY SUPPORT)
  ====================================================== */
  async getSuppliers({
    page = 1,
    limit = 12,
    sort = "reliability_desc",
    gold_only = false,
    min_available_capacity = ""
  } = {}) {

    let query =
      `/network/suppliers?page=${page}&limit=${limit}&sort=${sort}`;

    if (gold_only)
      query += `&gold_only=true`;

    if (min_available_capacity)
      query += `&min_available_capacity=${min_available_capacity}`;

    const response = await ApiClient.get(query);

    const normalized = handleResponse(
      response,
      "Unable to load supplier intelligence"
    );

    return {
      suppliers: normalized.data || [],
      pagination: normalized.pagination || {}
    };
  },

  /* =====================================================
     GET SINGLE SUPPLIER DETAIL
  ====================================================== */
  async getSupplierById(id) {

    const response =
      await ApiClient.get(`/network/suppliers/${id}`);

    const normalized =
      handleResponse(response, "Unable to load supplier detail");

    return normalized.data;
  }

};

export default NetworkAPI;