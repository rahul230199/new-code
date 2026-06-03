/* =============================================================
   AXO NETWORKS — SUPPLIER DOCUMENT UPLOAD
   pages/supplier/document-upload.js

   PRD Alignment: Page 5 (Document Repository - Supplier side)
   
   Features:
   - Upload quality documents, certificates, inspection reports
   - Upload production updates and shipping documents
   - View uploaded documents with version history
   - Delete own documents (within allowed categories)
   - Download documents
   - Document categorization matching PRD structure
   
   Backend endpoints:
     GET  /api/supplier/orders/:orderId/documents     → Get documents
     POST /api/supplier/orders/:orderId/documents     → Upload document
     DELETE /api/supplier/documents/:id               → Delete document
     GET  /api/supplier/documents/:id/download        → Download document
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatFileSize,
  getQueryParam,
  debounce,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — Supplier + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// DOCUMENT CATEGORIES (PRD Page 5 - Supplier can upload)
// =================================================================
const DOCUMENT_CATEGORIES = [
  { value: "quality_documents", label: "Quality Documents", icon: "fa-clipboard-check", color: "success", allowedForSupplier: true },
  { value: "certifications", label: "Certifications", icon: "fa-certificate", color: "primary", allowedForSupplier: true },
  { value: "inspection_reports", label: "Inspection Reports", icon: "fa-chart-line", color: "warning", allowedForSupplier: true },
  { value: "production_updates", label: "Production Updates", icon: "fa-industry", color: "info", allowedForSupplier: true },
  { value: "shipping_documents", label: "Shipping Documents", icon: "fa-truck", color: "primary", allowedForSupplier: true },
  { value: "invoices", label: "Invoices", icon: "fa-file-invoice-dollar", color: "success", allowedForSupplier: true },
  { value: "other", label: "Other", icon: "fa-folder", color: "neutral", allowedForSupplier: true }
];

// File type icons
const FILE_ICONS = {
  pdf: "fa-file-pdf",
  doc: "fa-file-word",
  docx: "fa-file-word",
  xls: "fa-file-excel",
  xlsx: "fa-file-excel",
  jpg: "fa-file-image",
  jpeg: "fa-file-image",
  png: "fa-file-image",
  zip: "fa-file-archive",
  default: "fa-file"
};

// =================================================================
// STATE
// =================================================================
const State = {
  orderId: null,
  orderData: null,
  documents: [],
  selectedCategory: "all",
  searchQuery: "",
  currentPage: 1,
  itemsPerPage: 10,
  totalItems: 0,
  isUploading: false,
  selectedDocument: null,
};

// =================================================================
// DOM ELEMENTS
// =================================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };
const showEl = (id) => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };
const setVal = (id, val) => { const n = el(id); if (n) n.value = val ?? ""; };

// =================================================================
// LOADING STATES
// =================================================================
const setLoading = (isLoading) => {
  const container = el("documentsContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// HELPER FUNCTIONS
// =================================================================
const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase() || 'default';
  return FILE_ICONS[ext] || FILE_ICONS.default;
};

const getCategoryConfig = (categoryValue) => {
  return DOCUMENT_CATEGORIES.find(c => c.value === categoryValue) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];
};

// =================================================================
// RENDER DOCUMENT CARD
// =================================================================
const renderDocumentCard = (doc) => {
  const fileIcon = getFileIcon(doc.file_name);
  const category = getCategoryConfig(doc.category);
  
  return `
    <div class="doc-card" data-doc-id="${doc.id}">
      <div class="doc-card__preview">
        <div class="doc-card__icon" style="background: ${category.color === 'success' ? 'var(--success-bg)' : category.color === 'primary' ? 'var(--primary-xlight)' : category.color === 'warning' ? 'var(--warning-bg)' : 'var(--gray-100)'}">
          <i class="fas ${fileIcon}" style="color: ${category.color === 'success' ? 'var(--success)' : category.color === 'primary' ? 'var(--primary)' : category.color === 'warning' ? 'var(--warning)' : 'var(--gray-500)'}"></i>
        </div>
        <div class="doc-card__info">
          <div class="doc-card__name" title="${sanitizeHTML(doc.file_name)}">
            ${sanitizeHTML(doc.file_name)}
          </div>
          <div class="doc-card__meta">
            <span class="doc-meta">
              <i class="fas ${category.icon}"></i>
              ${category.label}
            </span>
            <span class="doc-meta">
              <i class="fas fa-database"></i>
              ${formatFileSize(doc.file_size)}
            </span>
            <span class="doc-meta">
              <i class="fas fa-calendar"></i>
              ${formatDate(doc.created_at)}
            </span>
          </div>
          ${doc.description ? `<div class="doc-card__description">${sanitizeHTML(doc.description)}</div>` : ''}
        </div>
      </div>
      <div class="doc-card__actions">
        <button class="doc-action-btn js-view-doc" data-doc-id="${doc.id}" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="doc-action-btn js-download-doc" data-doc-id="${doc.id}" data-file-name="${doc.file_name}" title="Download">
          <i class="fas fa-download"></i>
        </button>
        <button class="doc-action-btn doc-action-btn--danger js-delete-doc" data-doc-id="${doc.id}" data-file-name="${doc.file_name}" title="Delete">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    </div>
  `;
};

// =================================================================
// RENDER DOCUMENTS GRID
// =================================================================
const renderDocuments = () => {
  const container = el("documentsGrid");
  if (!container) return;
  
  let filteredDocs = [...State.documents];
  
  // Filter by category
  if (State.selectedCategory !== "all") {
    filteredDocs = filteredDocs.filter(d => d.category === State.selectedCategory);
  }
  
  // Filter by search query
  if (State.searchQuery.trim()) {
    const query = State.searchQuery.toLowerCase();
    filteredDocs = filteredDocs.filter(d => 
      d.file_name.toLowerCase().includes(query) ||
      (d.description && d.description.toLowerCase().includes(query))
    );
  }
  
  State.totalItems = filteredDocs.length;
  
  // Pagination
  const startIdx = (State.currentPage - 1) * State.itemsPerPage;
  const endIdx = startIdx + State.itemsPerPage;
  const paginatedDocs = filteredDocs.slice(startIdx, endIdx);
  
  if (filteredDocs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <p>No documents found</p>
        <span>Upload quality documents, certificates, or shipping documents</span>
        <button class="btn btn--primary" id="emptyUploadBtn">
          <i class="fas fa-upload"></i> Upload Document
        </button>
      </div>
    `;
    const emptyBtn = document.getElementById("emptyUploadBtn");
    if (emptyBtn) emptyBtn.addEventListener("click", openUploadModal);
    renderPagination();
    updateStats();
    return;
  }
  
  let html = '<div class="documents-grid">';
  paginatedDocs.forEach(doc => {
    html += renderDocumentCard(doc);
  });
  html += '</div>';
  
  container.innerHTML = html;
  renderPagination();
  updateStats();
  
  // Bind events
  bindDocumentEvents();
};

// =================================================================
// BIND DOCUMENT EVENTS
// =================================================================
const bindDocumentEvents = () => {
  document.querySelectorAll('.js-view-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      openDocumentModal(docId);
    });
  });
  
  document.querySelectorAll('.js-download-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      const fileName = btn.dataset.fileName;
      downloadDocument(docId, fileName);
    });
  });
  
  document.querySelectorAll('.js-delete-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      const fileName = btn.dataset.fileName;
      confirmDeleteDocument(docId, fileName);
    });
  });
};

// =================================================================
// RENDER PAGINATION
// =================================================================
const renderPagination = () => {
  const container = el("pagination");
  if (!container) return;
  
  const totalPages = Math.ceil(State.totalItems / State.itemsPerPage);
  
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }
  
  let html = '<div class="pagination">';
  
  html += `<button class="pagination-btn" ${State.currentPage === 1 ? "disabled" : ""} data-page="prev">
    <i class="fas fa-chevron-left"></i>
  </button>`;
  
  const maxVisible = 5;
  let startPage = Math.max(1, State.currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  
  if (startPage > 1) {
    html += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="pagination-dots">...</span>`;
  }
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === State.currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="pagination-dots">...</span>`;
    html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }
  
  html += `<button class="pagination-btn" ${State.currentPage === totalPages ? "disabled" : ""} data-page="next">
    <i class="fas fa-chevron-right"></i>
  </button>`;
  
  html += '</div>';
  container.innerHTML = html;
  
  container.querySelectorAll(".pagination-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const page = btn.dataset.page;
      if (page === "prev") {
        State.currentPage--;
      } else if (page === "next") {
        State.currentPage++;
      } else {
        State.currentPage = parseInt(page);
      }
      renderDocuments();
      el("documentsGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
};

// =================================================================
// UPDATE STATS
// =================================================================
const updateStats = () => {
  setText("totalDocuments", State.documents.length);
  
  // Update category counts in filter dropdown
  const categoryCounts = {};
  State.documents.forEach(doc => {
    categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
  });
  
  const filterSelect = el("categoryFilter");
  if (filterSelect) {
    const options = ['<option value="all">All Categories</option>'];
    DOCUMENT_CATEGORIES.forEach(cat => {
      if (cat.allowedForSupplier) {
        const count = categoryCounts[cat.value] || 0;
        options.push(`<option value="${cat.value}">${cat.label} (${count})</option>`);
      }
    });
    filterSelect.innerHTML = options.join('');
    filterSelect.value = State.selectedCategory;
  }
};

// =================================================================
// OPEN DOCUMENT MODAL
// =================================================================
const openDocumentModal = async (docId) => {
  try {
    const response = await API.get(`/supplier/documents/${docId}`);
    const doc = response.document;
    State.selectedDocument = doc;
    
    setText("docModalFileName", doc.file_name);
    setText("docModalCategory", getCategoryConfig(doc.category).label);
    setText("docModalSize", formatFileSize(doc.file_size));
    setText("docModalUploadedAt", formatDate(doc.created_at));
    setHTML("docModalDescription", doc.description || "No description provided");
    
    showEl("documentModal");
    
  } catch (error) {
    console.error("Open document error:", error);
    Toast.error("Failed to load document details");
  }
};

const closeDocumentModal = () => {
  hideEl("documentModal");
  State.selectedDocument = null;
};

// =================================================================
// DOWNLOAD DOCUMENT
// =================================================================
const downloadDocument = (docId, fileName) => {
  const token = Auth.getToken();
  const downloadUrl = `/api/supplier/documents/${docId}/download?token=${encodeURIComponent(token)}`;
  window.open(downloadUrl, '_blank');
  Toast.success(`Downloading: ${fileName}`);
};

// =================================================================
// DELETE DOCUMENT
// =================================================================
const confirmDeleteDocument = (docId, fileName) => {
  if (confirm(`Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone.`)) {
    deleteDocument(docId, fileName);
  }
};

const deleteDocument = async (docId, fileName) => {
  try {
    const response = await API.del(`/supplier/documents/${docId}`);
    
    if (response.success) {
      Toast.success(`Deleted: ${fileName}`);
      await loadDocuments();
    } else {
      Toast.error(response.error || "Delete failed");
    }
    
  } catch (error) {
    console.error("Delete error:", error);
    Toast.error(error.message || "Failed to delete document");
  }
};

// =================================================================
// OPEN UPLOAD MODAL
// =================================================================
let selectedFile = null;

const openUploadModal = () => {
  el("uploadForm")?.reset();
  setVal("uploadCategory", "quality_documents");
  setVal("uploadDescription", "");
  selectedFile = null;
  
  // Render category options
  const categorySelect = el("uploadCategory");
  if (categorySelect) {
    categorySelect.innerHTML = DOCUMENT_CATEGORIES
      .filter(cat => cat.allowedForSupplier)
      .map(cat => `<option value="${cat.value}">${cat.label}</option>`)
      .join('');
  }
  
  // Reset file preview
  const preview = el("uploadFilePreview");
  if (preview) {
    preview.style.display = "none";
    preview.innerHTML = "";
  }
  
  showEl("uploadModal");
};

const closeUploadModal = () => {
  hideEl("uploadModal");
  selectedFile = null;
};

const handleFileSelect = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  if (file.size > 20 * 1024 * 1024) {
    Toast.error("File too large. Maximum size is 20 MB");
    e.target.value = "";
    return;
  }
  
  selectedFile = file;
  
  const preview = el("uploadFilePreview");
  if (preview) {
    preview.style.display = "flex";
    preview.innerHTML = `
      <i class="fas ${getFileIcon(file.name)}"></i>
      <span class="file-name">${sanitizeHTML(file.name)}</span>
      <span class="file-size">${formatFileSize(file.size)}</span>
      <button type="button" class="clear-file" id="clearFileBtn">&times;</button>
    `;
    
    document.getElementById("clearFileBtn")?.addEventListener("click", () => {
      selectedFile = null;
      preview.style.display = "none";
      el("uploadFile").value = "";
    });
  }
};

const submitUpload = async (e) => {
  e.preventDefault();
  
  if (!selectedFile) {
    Toast.warning("Please select a file to upload");
    return;
  }
  
  const formData = new FormData();
  formData.append("document", selectedFile);
  formData.append("category", el("uploadCategory")?.value || "other");
  formData.append("description", el("uploadDescription")?.value || "");
  
  State.isUploading = true;
  const submitBtn = el("uploadSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  }
  
  try {
    const response = await API.upload(`/supplier/orders/${State.orderId}/documents`, formData);
    
    if (response.success) {
      Toast.success("Document uploaded successfully");
      closeUploadModal();
      selectedFile = null;
      await loadDocuments();
    } else {
      Toast.error(response.error || "Upload failed");
    }
    
  } catch (error) {
    console.error("Upload error:", error);
    Toast.error(error.message || "Failed to upload document");
  } finally {
    State.isUploading = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Document';
    }
  }
};

// =================================================================
// LOAD DOCUMENTS
// =================================================================
const loadDocuments = async () => {
  setLoading(true);
  
  try {
    const response = await API.get(`/supplier/orders/${State.orderId}/documents`);
    
    State.documents = response.documents || [];
    renderDocuments();
    
  } catch (error) {
    console.error("Load documents error:", error);
    Toast.error("Failed to load documents");
    
    const container = el("documentsGrid");
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load documents</p>
          <button class="btn btn--primary" id="retryBtn">Retry</button>
        </div>
      `;
      document.getElementById("retryBtn")?.addEventListener("click", loadDocuments);
    }
  } finally {
    setLoading(false);
  }
};

// =================================================================
// LOAD ORDER INFO
// =================================================================
const loadOrderInfo = async () => {
  try {
    const response = await API.get(`/supplier/orders/${State.orderId}`);
    State.orderData = response.order;
    
    setText("orderNumber", State.orderData.po_number || `PO-${State.orderId}`);
    setText("orderStatus", State.orderData.status || "—");
    setText("oemName", State.orderData.oem_name || "—");
    setText("partName", State.orderData.part_name || "—");
    
  } catch (error) {
    console.error("Load order info error:", error);
  }
};

// =================================================================
// FILTER HANDLERS
// =================================================================
const handleCategoryFilter = (e) => {
  State.selectedCategory = e.target.value;
  State.currentPage = 1;
  renderDocuments();
};

const handleSearch = debounce((e) => {
  State.searchQuery = e.target.value;
  State.currentPage = 1;
  renderDocuments();
}, 300);

const clearSearch = () => {
  const searchInput = el("searchInput");
  if (searchInput) searchInput.value = "";
  State.searchQuery = "";
  State.currentPage = 1;
  renderDocuments();
};

const handleItemsPerPage = (e) => {
  State.itemsPerPage = parseInt(e.target.value);
  State.currentPage = 1;
  renderDocuments();
};

// =================================================================
// BIND EVENTS
// =================================================================
const bindEvents = () => {
  // Upload
  el("uploadDocBtn")?.addEventListener("click", openUploadModal);
  el("closeUploadModal")?.addEventListener("click", closeUploadModal);
  el("cancelUploadBtn")?.addEventListener("click", closeUploadModal);
  el("uploadForm")?.addEventListener("submit", submitUpload);
  el("uploadFile")?.addEventListener("change", handleFileSelect);
  
  // Document modal
  el("closeDocumentModal")?.addEventListener("click", closeDocumentModal);
  el("documentModal")?.addEventListener("click", (e) => {
    if (e.target === el("documentModal")) closeDocumentModal();
  });
  el("downloadFromModal")?.addEventListener("click", () => {
    if (State.selectedDocument) {
      downloadDocument(State.selectedDocument.id, State.selectedDocument.file_name);
    }
  });
  
  // Filters
  el("categoryFilter")?.addEventListener("change", handleCategoryFilter);
  el("searchInput")?.addEventListener("input", handleSearch);
  el("clearSearchBtn")?.addEventListener("click", clearSearch);
  el("itemsPerPage")?.addEventListener("change", handleItemsPerPage);
  
  // Refresh
  el("refreshBtn")?.addEventListener("click", loadDocuments);
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.SUPPLIER_ORDER_DETAILS}?id=${State.orderId}`;
  });
  
  // Sidebar / auth
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
  
  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeUploadModal();
      closeDocumentModal();
    }
  });
};

// =================================================================
// INITIALIZE
// =================================================================
const init = async () => {
  State.orderId = getQueryParam("id");
  
  if (!State.orderId) {
    Toast.error("No order ID provided");
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
    }, 2000);
    return;
  }
  
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");
  
  bindEvents();
  await loadOrderInfo();
  await loadDocuments();
};

document.addEventListener("DOMContentLoaded", init);