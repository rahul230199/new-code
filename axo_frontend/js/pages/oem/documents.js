/* =============================================================
   AXO NETWORKS — OEM DOCUMENTS
   pages/oem/documents.js

   Features:
   - List all documents uploaded by this OEM
   - Upload new document (multipart/form-data) with drag-and-drop
   - View document metadata in modal
   - Download document (OEM only — enforced by backend)
   - Delete document

   Backend endpoints used:
     GET    /api/documents          → { documents }
     POST   /api/documents/upload   → { success, document }
     GET    /api/documents/:id      → { document }
     GET    /api/documents/:id/download  → file stream
     DELETE /api/documents/:id      → { success }

   Note: Document routes are under /api/documents (not /api/oem/documents)
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import {
  sanitizeHTML,
  formatDate,
  formatFileSize,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  documents:       [],
  selectedFile:    null,    // File object from input / drop
  activeDocId:     null,    // ID of doc open in view modal
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };
const showEl  = (id)       => { const n = el(id); if (n) n.style.display = ""; };
const hideEl  = (id)       => { const n = el(id); if (n) n.style.display = "none"; };

// =================================================================
// FILE TYPE HELPERS
// =================================================================
const FILE_ICONS = Object.freeze({
  pdf:  "📄",
  dwg:  "📐",
  dxf:  "📐",
  step: "🧊",
  stp:  "🧊",
  iges: "🧊",
  jpg:  "🖼️",
  jpeg: "🖼️",
  png:  "🖼️",
  doc:  "📝",
  docx: "📝",
  xls:  "📊",
  xlsx: "📊",
  zip:  "🗜️",
  rar:  "🗜️",
});

const getFileIcon = (filename = "") => {
  const ext = filename.split(".").pop().toLowerCase();
  return FILE_ICONS[ext] || "📁";
};

// =================================================================
// RENDER — DOCUMENT GRID
// =================================================================
const renderDocumentCard = (doc) => `
  <div class="doc-card js-view-doc" data-id="${doc.id}" role="button" tabindex="0" aria-label="View ${sanitizeHTML(doc.file_name)}">
    <div class="doc-card__icon" aria-hidden="true">${getFileIcon(doc.file_name)}</div>
    <div class="doc-card__body">
      <div class="doc-card__name" title="${sanitizeHTML(doc.file_name)}">
        ${sanitizeHTML(doc.file_name)}
      </div>
      <div class="doc-card__meta">
        <span class="doc-card__category">${sanitizeHTML(doc.category || "General")}</span>
        <span class="doc-card__size">${formatFileSize(doc.file_size)}</span>
      </div>
      <div class="doc-card__date">${formatDate(doc.created_at)}</div>
    </div>
    <div class="doc-card__actions">
      <button
        class="btn btn--icon btn--ghost js-download-doc"
        data-id="${doc.id}"
        data-name="${sanitizeHTML(doc.file_name)}"
        title="Download"
        aria-label="Download ${sanitizeHTML(doc.file_name)}"
      >⬇</button>
      <button
        class="btn btn--icon btn--ghost btn--danger js-delete-doc"
        data-id="${doc.id}"
        data-name="${sanitizeHTML(doc.file_name)}"
        title="Delete"
        aria-label="Delete ${sanitizeHTML(doc.file_name)}"
      >🗑</button>
    </div>
  </div>`;

const renderDocuments = () => {
  const grid = el("documentsGrid");
  if (!grid) return;

  setText("docCount", `${State.documents.length} document${State.documents.length !== 1 ? "s" : ""}`);

  if (!State.documents.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">📂</span>
        <p class="empty-state__msg">No documents uploaded yet.</p>
        <button class="btn btn--primary js-open-upload">Upload your first document</button>
      </div>`;
    return;
  }

  grid.innerHTML = State.documents.map(renderDocumentCard).join("");
};

// =================================================================
// LOAD DOCUMENTS
// =================================================================
const loadDocuments = async () => {
  const grid = el("documentsGrid");
  if (grid) grid.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;

  try {
    const { documents } = await API.get("/documents");
    State.documents = documents || [];
    renderDocuments();
  } catch (err) {
    Toast.error(err.message || "Failed to load documents.");
    if (grid) grid.innerHTML = `<p class="text-error">Failed to load documents. Please refresh.</p>`;
  }
};

// =================================================================
// VIEW DOCUMENT MODAL
// =================================================================
const openViewModal = async (docId) => {
  State.activeDocId = docId;

  const doc = State.documents.find((d) => d.id == docId);
  if (!doc) return;

  setHTML("docDetails", `
    <div class="doc-preview__icon" aria-hidden="true">${getFileIcon(doc.file_name)}</div>
    <dl class="doc-preview__info">
      <dt>File name</dt>
      <dd>${sanitizeHTML(doc.file_name)}</dd>
      <dt>Category</dt>
      <dd>${sanitizeHTML(doc.category || "General")}</dd>
      <dt>Size</dt>
      <dd>${formatFileSize(doc.file_size)}</dd>
      <dt>Type</dt>
      <dd>${sanitizeHTML(doc.file_type || "—")}</dd>
      <dt>Uploaded</dt>
      <dd>${formatDate(doc.created_at)}</dd>
      ${doc.description
        ? `<dt>Description</dt><dd>${sanitizeHTML(doc.description)}</dd>`
        : ""}
    </dl>
    <div class="doc-preview__actions">
      <button class="btn btn--primary js-download-active" data-id="${doc.id}" data-name="${sanitizeHTML(doc.file_name)}">
        Download
      </button>
      <button class="btn btn--danger js-delete-active" data-id="${doc.id}" data-name="${sanitizeHTML(doc.file_name)}">
        Delete
      </button>
    </div>`);

  showEl("docDetailsModal");
};

// =================================================================
// DOWNLOAD DOCUMENT
// =================================================================
const downloadDocument = async (docId, fileName) => {
  Toast.info("Preparing download…");

  try {
    const response = await API.download(`/documents/${docId}/download`);

    if (!response.ok) {
      throw new Error("Download failed. Please try again.");
    }

    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);

    // Trigger browser download
    const anchor      = document.createElement("a");
    anchor.href        = url;
    anchor.download    = fileName || "document";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();

    // Cleanup
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 1000);

  } catch (err) {
    Toast.error(err.message || "Failed to download document.");
  }
};

// =================================================================
// DELETE DOCUMENT
// =================================================================
const deleteDocument = async (docId, fileName) => {
  // Use inline confirm replacement — no browser confirm()
  const confirmed = await showInlineConfirm(
    `Delete "${sanitizeHTML(fileName)}"? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await API.del(`/documents/${docId}`);

    Toast.success("Document deleted.");
    State.documents = State.documents.filter((d) => d.id != docId);
    renderDocuments();

    // Close modal if the deleted doc is currently open
    if (State.activeDocId == docId) hideEl("docDetailsModal");

  } catch (err) {
    Toast.error(err.message || "Failed to delete document.");
  }
};

// =================================================================
// INLINE CONFIRM (replaces browser confirm())
// Returns a Promise<boolean>
// =================================================================
const showInlineConfirm = (message) =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <p class="confirm-dialog__msg">${message}</p>
        <div class="confirm-dialog__actions">
          <button class="btn btn--danger  js-confirm-yes">Delete</button>
          <button class="btn btn--outline js-confirm-no">Cancel</button>
        </div>
      </div>`;

    overlay.querySelector(".js-confirm-yes").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector(".js-confirm-no").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });

    document.body.appendChild(overlay);
    overlay.querySelector(".js-confirm-yes").focus();
  });

// =================================================================
// UPLOAD MODAL
// =================================================================
const openUploadModal = () => {
  el("uploadForm")?.reset();
  State.selectedFile = null;
  _updateFilePreview(null);
  showEl("uploadModal");
};

const closeUploadModal = () => hideEl("uploadModal");

// -----------------------------------------------------------------
// File selection — shared by click-browse and drag-drop
// -----------------------------------------------------------------
const _updateFilePreview = (file) => {
  const preview = el("selectedDocFile");
  if (!preview) return;

  if (!file) {
    preview.style.display = "none";
    preview.innerHTML     = "";
    return;
  }

  preview.style.display = "flex";
  preview.innerHTML = `
    <span class="file-preview__icon">${getFileIcon(file.name)}</span>
    <span class="file-preview__name">${sanitizeHTML(file.name)}</span>
    <span class="file-preview__size">${formatFileSize(file.size)}</span>
    <button class="btn btn--icon btn--ghost js-clear-file" aria-label="Remove selected file">✕</button>`;
};

const _handleFileSelect = (file) => {
  if (!file) return;

  // 10 MB limit — matches backend multer config
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    Toast.error("File is too large. Maximum size is 10 MB.");
    return;
  }

  State.selectedFile = file;
  _updateFilePreview(file);
};

// -----------------------------------------------------------------
// Form submit — upload
// -----------------------------------------------------------------
const handleUploadSubmit = async (e) => {
  e.preventDefault();

  if (!State.selectedFile) {
    Toast.warning("Please select a file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("document",    State.selectedFile);
  formData.append("category",    el("docCategory")?.value    || "RFQ Documents");
  formData.append("description", el("docDescription")?.value || "");

  const submitBtn = el("uploadSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Uploading…"; }

  try {
    await API.upload("/documents/upload", formData);

    Toast.success("Document uploaded successfully.");
    closeUploadModal();
    await loadDocuments();

  } catch (err) {
    Toast.error(err.message || "Upload failed. Please try again.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Upload"; }
  }
};

// =================================================================
// DRAG AND DROP
// =================================================================
const bindDragDrop = () => {
  const area = el("docUploadArea");
  if (!area) return;

  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("drag-over");
  });

  area.addEventListener("dragleave", () => {
    area.classList.remove("drag-over");
  });

  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("drag-over");
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Sync to the file input so form submit can access it
      _handleFileSelect(file);
    }
  });
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Document grid — view + download + delete ──────────────────
  el("documentsGrid")?.addEventListener("click", (e) => {
    // Download button (stops propagation — don't open modal)
    const dlBtn = e.target.closest(".js-download-doc");
    if (dlBtn) {
      e.stopPropagation();
      downloadDocument(dlBtn.dataset.id, dlBtn.dataset.name);
      return;
    }

    // Delete button
    const delBtn = e.target.closest(".js-delete-doc");
    if (delBtn) {
      e.stopPropagation();
      deleteDocument(delBtn.dataset.id, delBtn.dataset.name);
      return;
    }

    // Open create button (from empty state)
    const createBtn = e.target.closest(".js-open-upload");
    if (createBtn) { openUploadModal(); return; }

    // Card click → view modal
    const card = e.target.closest(".js-view-doc");
    if (card) openViewModal(card.dataset.id);
  });

  // ── Keyboard on doc cards ─────────────────────────────────────
  el("documentsGrid")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const card = e.target.closest(".js-view-doc");
    if (card) openViewModal(card.dataset.id);
  });

  // ── View modal — download + delete active doc ─────────────────
  el("docDetails")?.addEventListener("click", (e) => {
    const dlBtn  = e.target.closest(".js-download-active");
    const delBtn = e.target.closest(".js-delete-active");

    if (dlBtn)  downloadDocument(dlBtn.dataset.id,  dlBtn.dataset.name);
    if (delBtn) deleteDocument(delBtn.dataset.id, delBtn.dataset.name);
  });

  // ── Upload button ─────────────────────────────────────────────
  el("uploadDocBtn")?.addEventListener("click",  openUploadModal);
  el("refreshBtn")?.addEventListener("click",    loadDocuments);

  // ── File input ────────────────────────────────────────────────
  el("docFileInput")?.addEventListener("change", (e) => {
    _handleFileSelect(e.target.files?.[0]);
  });

  // ── Browse button inside upload area ─────────────────────────
  el("docBrowseBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    el("docFileInput")?.click();
  });

  // ── Upload area click → open file picker ─────────────────────
  el("docUploadArea")?.addEventListener("click", () => {
    el("docFileInput")?.click();
  });

  // ── Clear selected file ───────────────────────────────────────
  el("selectedDocFile")?.addEventListener("click", (e) => {
    if (e.target.closest(".js-clear-file")) {
      State.selectedFile = null;
      const fileInput = el("docFileInput");
      if (fileInput) fileInput.value = "";
      _updateFilePreview(null);
    }
  });

  // ── Upload form submit ────────────────────────────────────────
  el("uploadForm")?.addEventListener("submit", handleUploadSubmit);

  // ── Close modals ──────────────────────────────────────────────
  document.querySelectorAll(".js-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      hideEl("docDetailsModal");
      closeUploadModal();
    });
  });

  el("docDetailsModal")?.addEventListener("click", (e) => {
    if (e.target === el("docDetailsModal")) hideEl("docDetailsModal");
  });

  el("uploadModal")?.addEventListener("click", (e) => {
    if (e.target === el("uploadModal")) closeUploadModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideEl("docDetailsModal");
      closeUploadModal();
    }
  });

  // ── Sidebar / auth ────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click",  () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });

  // ── Drag and drop ─────────────────────────────────────────────
  bindDragDrop();
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");

  bindEvents();
  loadDocuments();
};

document.addEventListener("DOMContentLoaded", init);