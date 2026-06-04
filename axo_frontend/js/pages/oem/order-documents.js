/* =============================================================
   AXO NETWORKS — ORDER DOCUMENT REPOSITORY
   pages/oem/order-documents.js

   PRD Alignment: Page 5 (Document Repository)
   
   Features:
   - Organized folder structure by document category
   - Version history for each document
   - Upload new documents with category selection
   - Replace document versions
   - Preview and download documents
   - Document metadata (uploaded by, date, size, version)
   
   Backend endpoints:
     GET  /api/oem/orders/:orderId/documents        → Get all documents
     GET  /api/oem/documents/:id/versions           → Get version history
     POST /api/oem/orders/:orderId/documents/upload → Upload document
     PUT  /api/oem/documents/:id/replace            → Replace document version
     DELETE /api/oem/documents/:id                  → Delete document
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
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// PRD Document Categories (Page 5)
// =================================================================
const DOCUMENT_CATEGORIES = [
  { value: "purchase_orders", label: "Purchase Orders", icon: "fa-file-invoice", color: "primary" },
  { value: "quotations", label: "Quotations", icon: "fa-file-signature", color: "info" },
  { value: "technical_drawings", label: "Technical Drawings", icon: "fa-drafting-compass", color: "warning" },
  { value: "design_files", label: "Design Files", icon: "fa-cube", color: "info" },
  { value: "quality_documents", label: "Quality Documents", icon: "fa-clipboard-check", color: "success" },
  { value: "certifications", label: "Certifications", icon: "fa-certificate", color: "primary" },
  { value: "inspection_reports", label: "Inspection Reports", icon: "fa-chart-line", color: "warning" },
  { value: "production_updates", label: "Production Updates", icon: "fa-industry", color: "info" },
  { value: "shipping_documents", label: "Shipping Documents", icon: "fa-truck", color: "success" },
  { value: "invoices", label: "Invoices", icon: "fa-file-invoice-dollar", color: "success" },
  { value: "communication_history", label: "Communication History", icon: "fa-comments", color: "secondary" },
  { value: "other", label: "Other", icon: "fa-folder", color: "neutral" }
];

// File type icons
const FILE_ICONS = {
  pdf: "fa-file-pdf",
  doc: "fa-file-word",
  docx: "fa-file-word",
  xls: "fa-file-excel",
  xlsx: "fa-file-excel",
  ppt: "fa-file-powerpoint",
  pptx: "fa-file-powerpoint",
  jpg: "fa-file-image",
  jpeg: "fa-file-image",
  png: "fa-file-image",
  gif: "fa-file-image",
  dwg: "fa-drafting-compass",
  dxf: "fa-drafting-compass",
  step: "fa-cube",
  stp: "fa-cube",
  zip: "fa-file-archive",
  rar: "fa-file-archive",
  txt: "fa-file-alt",
  default: "fa-file"
};

// =================================================================
// STATE
// =================================================================
const State = {
  orderId: null,
  orderData: null,
  documents: [],
  selectedDocument: null,
  selectedCategory: "all",
  searchQuery: "",
  expandedCategories: new Set(),
  currentPage: 1,
  itemsPerPage: 10,
  totalItems: 0,
  isUploading: false,
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

const formatVersion = (version) => {
  return `v${version || 1}`;
};

// =================================================================
// GROUP DOCUMENTS BY CATEGORY
// =================================================================
const groupDocumentsByCategory = (documents) => {
  const grouped = {};
  
  DOCUMENT_CATEGORIES.forEach(cat => {
    grouped[cat.value] = {
      ...cat,
      documents: []
    };
  });
  
  documents.forEach(doc => {
    const category = doc.category || "other";
    if (grouped[category]) {
      grouped[category].documents.push(doc);
    } else {
      grouped["other"].documents.push(doc);
    }
  });
  
  // Sort documents within each category by date (newest first)
  Object.keys(grouped).forEach(key => {
    grouped[key].documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  });
  
  return grouped;
};

// =================================================================
// RENDER DOCUMENT CARD
// =================================================================
const renderDocumentCard = (doc, isExpanded = false) => {
  const fileIcon = getFileIcon(doc.file_name);
  const version = formatVersion(doc.version_number);
  const isExpandedState = State.expandedCategories.has(doc.id);
  
  return `
    <div class="doc-card" data-doc-id="${doc.id}" data-category="${doc.category}">
      <div class="doc-card__preview">
        <div class="doc-card__icon">
          <i class="fas ${fileIcon}"></i>
        </div>
        <div class="doc-card__info">
          <div class="doc-card__name" title="${sanitizeHTML(doc.file_name)}">
            ${sanitizeHTML(doc.file_name)}
          </div>
          <div class="doc-card__meta">
            <span class="doc-meta">
              <i class="fas fa-tag"></i>
              ${getCategoryConfig(doc.category).label}
            </span>
            <span class="doc-meta">
              <i class="fas fa-code-branch"></i>
              ${version}
            </span>
            <span class="doc-meta">
              <i class="fas fa-database"></i>
              ${formatFileSize(doc.file_size)}
            </span>
            <span class="doc-meta">
              <i class="fas fa-user"></i>
              ${sanitizeHTML(doc.uploaded_by || "OEM User")}
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
        <button class="doc-action-btn js-replace-doc" data-doc-id="${doc.id}" data-file-name="${doc.file_name}" title="Replace Version">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button class="doc-action-btn js-delete-doc" data-doc-id="${doc.id}" data-file-name="${doc.file_name}" title="Delete">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
      ${doc.version_number > 1 ? `
        <div class="doc-card__versions">
          <button class="versions-toggle js-toggle-versions" data-doc-id="${doc.id}">
            <i class="fas fa-history"></i>
            <span>Version History (${doc.version_number} versions)</span>
            <i class="fas fa-chevron-down ${isExpandedState ? 'rotated' : ''}"></i>
          </button>
          <div class="versions-list ${isExpandedState ? 'expanded' : ''}" id="versions-${doc.id}">
            <div class="versions-loading">Loading versions...</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
};

// =================================================================
// RENDER CATEGORY SECTION
// =================================================================
const renderCategorySection = (category, isExpanded = true) => {
  const docCount = category.documents.length;
  
  if (docCount === 0) return '';
  
  return `
    <div class="category-section" data-category="${category.value}">
      <div class="category-header">
        <div class="category-header__left">
          <div class="category-icon category-icon--${category.color}">
            <i class="fas ${category.icon}"></i>
          </div>
          <div class="category-info">
            <h3 class="category-title">${category.label}</h3>
            <span class="category-count">${docCount} document${docCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button class="category-toggle ${isExpanded ? 'expanded' : ''}" data-category="${category.value}">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
      <div class="category-documents ${isExpanded ? 'expanded' : ''}" id="category-${category.value}">
        ${category.documents.map(doc => renderDocumentCard(doc)).join('')}
      </div>
    </div>
  `;
};

// =================================================================
// RENDER ALL DOCUMENTS
// =================================================================
const renderDocuments = () => {
  const container = el("documentsList");
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
  
  if (filteredDocs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <p>No documents found</p>
        <span>Upload documents to get started</span>
        <button class="btn btn--primary" id="emptyUploadBtn">
          <i class="fas fa-upload"></i> Upload Document
        </button>
      </div>
    `;
    const emptyBtn = document.getElementById("emptyUploadBtn");
    if (emptyBtn) emptyBtn.addEventListener("click", openUploadModal);
    return;
  }
  
  const grouped = groupDocumentsByCategory(filteredDocs);
  
  let html = '<div class="documents-repository">';
  
  for (const category of DOCUMENT_CATEGORIES) {
    const categoryData = grouped[category.value];
    if (categoryData && categoryData.documents.length > 0) {
      const isExpanded = State.expandedCategories.has(category.value);
      html += renderCategorySection(categoryData, isExpanded);
    }
  }
  
  html += '</div>';
  container.innerHTML = html;
  
  // Bind events
  bindDocumentEvents();
};

// =================================================================
// BIND DOCUMENT EVENTS
// =================================================================
const bindDocumentEvents = () => {
  // Category toggle
  document.querySelectorAll('.category-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      const documentsDiv = document.getElementById(`category-${category}`);
      if (documentsDiv) {
        documentsDiv.classList.toggle('expanded');
        btn.classList.toggle('expanded');
        if (documentsDiv.classList.contains('expanded')) {
          State.expandedCategories.add(category);
        } else {
          State.expandedCategories.delete(category);
        }
      }
    });
  });
  
  // Version toggle
  document.querySelectorAll('.js-toggle-versions').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      const versionsDiv = document.getElementById(`versions-${docId}`);
      if (versionsDiv) {
        const isExpanded = versionsDiv.classList.toggle('expanded');
        btn.classList.toggle('expanded');
        if (isExpanded && versionsDiv.innerHTML.includes('Loading')) {
          await loadVersionHistory(docId);
        }
      }
    });
  });
  
  // View document
  document.querySelectorAll('.js-view-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      openDocumentModal(docId);
    });
  });
  
  // Download document
  document.querySelectorAll('.js-download-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      const fileName = btn.dataset.fileName;
      downloadDocument(docId, fileName);
    });
  });
  
  // Replace document
  document.querySelectorAll('.js-replace-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.docId;
      const fileName = btn.dataset.fileName;
      openReplaceModal(docId, fileName);
    });
  });
  
  // Delete document
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
// LOAD VERSION HISTORY
// =================================================================
const loadVersionHistory = async (docId) => {
  const versionsDiv = document.getElementById(`versions-${docId}`);
  if (!versionsDiv) return;
  
  try {
    const response = await API.get(`/oem/documents/${docId}/versions`);
    const versions = response.versions || [];
    
    if (versions.length === 0) {
      versionsDiv.innerHTML = '<div class="no-versions">No version history available</div>';
      return;
    }
    
    versionsDiv.innerHTML = `
      <div class="versions-table">
        ${versions.map((v, index) => `
          <div class="version-row ${index === 0 ? 'current' : ''}">
            <span class="version-number">${formatVersion(v.version_number)}</span>
            <span class="version-date">${formatDate(v.created_at)}</span>
            <span class="version-user">${sanitizeHTML(v.uploaded_by || 'System')}</span>
            <span class="version-size">${formatFileSize(v.file_size)}</span>
            <button class="version-download" data-version-id="${v.id}" data-file-name="${v.file_name}">
              <i class="fas fa-download"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;
    
    // Bind version download events
    versionsDiv.querySelectorAll('.version-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const versionId = btn.dataset.versionId;
        const fileName = btn.dataset.fileName;
        downloadDocumentVersion(versionId, fileName);
      });
    });
    
  } catch (error) {
    console.error('Load version history error:', error);
    versionsDiv.innerHTML = '<div class="error-message">Failed to load version history</div>';
  }
};

// =================================================================
// OPEN DOCUMENT MODAL
// =================================================================
const openDocumentModal = async (docId) => {
  try {
    const response = await API.get(`/oem/documents/${docId}`);
    const doc = response.document;
    State.selectedDocument = doc;
    
    setText("docModalFileName", doc.file_name);
    setText("docModalCategory", getCategoryConfig(doc.category).label);
    setText("docModalVersion", formatVersion(doc.version_number));
    setText("docModalSize", formatFileSize(doc.file_size));
    setText("docModalUploadedBy", doc.uploaded_by || "OEM User");
    setText("docModalUploadedAt", formatDate(doc.created_at));
    setHTML("docModalDescription", doc.description || "No description provided");
    
    // Show preview if image
    const isImage = doc.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const previewContainer = el("docModalPreview");
    if (previewContainer) {
      if (isImage) {
        previewContainer.innerHTML = `<img src="/api/oem/documents/${docId}/download?token=${Auth.getToken()}" alt="Preview" class="doc-preview-image">`;
        previewContainer.style.display = "block";
      } else {
        previewContainer.innerHTML = `<div class="doc-preview-placeholder"><i class="fas ${getFileIcon(doc.file_name)} fa-4x"></i></div>`;
        previewContainer.style.display = "block";
      }
    }
    
    showEl("documentModal");
    
  } catch (error) {
    console.error("Open document error:", error);
    Toast.error("Failed to load document details");
  }
};

// =================================================================
// DOWNLOAD DOCUMENT
// =================================================================
const downloadDocument = (docId, fileName) => {
  const token = Auth.getToken();
  const downloadUrl = `/api/oem/documents/${docId}/download?token=${encodeURIComponent(token)}`;
  window.open(downloadUrl, '_blank');
  Toast.success(`Downloading: ${fileName}`);
};

const downloadDocumentVersion = (versionId, fileName) => {
  const token = Auth.getToken();
  const downloadUrl = `/api/oem/documents/version/${versionId}/download?token=${encodeURIComponent(token)}`;
  window.open(downloadUrl, '_blank');
  Toast.success(`Downloading version: ${fileName}`);
};

// =================================================================
// OPEN UPLOAD MODAL
// =================================================================
const openUploadModal = () => {
  el("uploadForm")?.reset();
  setVal("uploadCategory", "purchase_orders");
  setVal("uploadDescription", "");
  State.selectedDocument = null;
  
  // Render category options
  const categorySelect = el("uploadCategory");
  if (categorySelect) {
    categorySelect.innerHTML = DOCUMENT_CATEGORIES.map(cat => 
      `<option value="${cat.value}">${cat.label}</option>`
    ).join('');
  }
  
  showEl("uploadModal");
};

const closeUploadModal = () => {
  hideEl("uploadModal");
};

// =================================================================
// HANDLE FILE UPLOAD
// =================================================================
let selectedFile = null;

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
      el("uploadFile")!.value = "";
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
    const response = await API.upload(`/oem/orders/${State.orderId}/documents/upload`, formData);
    
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
// OPEN REPLACE MODAL
// =================================================================
let replaceDocId = null;
let replaceFileName = null;

const openReplaceModal = (docId, fileName) => {
  replaceDocId = docId;
  replaceFileName = fileName;
  
  setText("replaceFileName", fileName);
  showEl("replaceModal");
  el("replaceFile")?.focus();
};

const closeReplaceModal = () => {
  hideEl("replaceModal");
  replaceDocId = null;
  replaceFileName = null;
};

let replaceFile = null;

const handleReplaceFileSelect = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  if (file.size > 20 * 1024 * 1024) {
    Toast.error("File too large. Maximum size is 20 MB");
    e.target.value = "";
    return;
  }
  
  replaceFile = file;
  
  const preview = el("replaceFilePreview");
  if (preview) {
    preview.style.display = "flex";
    preview.innerHTML = `
      <i class="fas ${getFileIcon(file.name)}"></i>
      <span class="file-name">${sanitizeHTML(file.name)}</span>
      <span class="file-size">${formatFileSize(file.size)}</span>
    `;
  }
};

const submitReplace = async () => {
  if (!replaceFile) {
    Toast.warning("Please select a file to replace with");
    return;
  }
  
  const formData = new FormData();
  formData.append("document", replaceFile);
  formData.append("notes", el("replaceNotes")?.value || "");
  
  const submitBtn = el("replaceSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Replacing...';
  }
  
  try {
    const response = await API.upload(`/oem/documents/${replaceDocId}/replace`, formData);
    
    if (response.success) {
      Toast.success("Document version replaced successfully");
      closeReplaceModal();
      replaceFile = null;
      await loadDocuments();
    } else {
      Toast.error(response.error || "Replace failed");
    }
    
  } catch (error) {
    console.error("Replace error:", error);
    Toast.error(error.message || "Failed to replace document");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Replace Document';
    }
  }
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
    const response = await API.del(`/oem/documents/${docId}`);
    
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
// LOAD DOCUMENTS
// =================================================================
const loadDocuments = async () => {
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/documents`);
    
    State.documents = response.documents || [];
    renderDocuments();
    
    // Update stats
    setText("totalDocuments", State.documents.length);
    
    // Category counts
    const categoryCounts = {};
    State.documents.forEach(doc => {
      categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
    });
    
    // Update category filter dropdown
    const filterSelect = el("categoryFilter");
    if (filterSelect) {
      const options = ['<option value="all">All Categories</option>'];
      DOCUMENT_CATEGORIES.forEach(cat => {
        const count = categoryCounts[cat.value] || 0;
        options.push(`<option value="${cat.value}">${cat.label} (${count})</option>`);
      });
      filterSelect.innerHTML = options.join('');
      filterSelect.value = State.selectedCategory;
    }
    
  } catch (error) {
    console.error("Load documents error:", error);
    Toast.error("Failed to load documents");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// LOAD ORDER INFO
// =================================================================
const loadOrderInfo = async () => {
  try {
    const response = await API.get(`/oem/orders/${State.orderId}`);
    State.orderData = response.order;
    
    setText("orderNumber", State.orderData.po_number || `PO-${State.orderId}`);
    setText("orderStatus", State.orderData.status || "—");
    setText("supplierName", State.orderData.supplier_name || "—");
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
  
  // Replace
  el("closeReplaceModal")?.addEventListener("click", closeReplaceModal);
  el("cancelReplaceBtn")?.addEventListener("click", closeReplaceModal);
  el("replaceForm")?.addEventListener("submit", (e) => { e.preventDefault(); submitReplace(); });
  el("replaceFile")?.addEventListener("change", handleReplaceFileSelect);
  
  // Document modal
  el("closeDocumentModal")?.addEventListener("click", () => hideEl("documentModal"));
  el("documentModal")?.addEventListener("click", (e) => {
    if (e.target === el("documentModal")) hideEl("documentModal");
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
  
  // Refresh
  el("refreshBtn")?.addEventListener("click", loadDocuments);
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${State.orderId}`;
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
      closeReplaceModal();
      hideEl("documentModal");
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
      window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    }, 2000);
    return;
  }
  
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");
  
  // Expand all categories by default
  DOCUMENT_CATEGORIES.forEach(cat => {
    State.expandedCategories.add(cat.value);
  });
  
  bindEvents();
  await loadOrderInfo();
  await loadDocuments();
};

document.addEventListener("DOMContentLoaded", init);