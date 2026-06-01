/* =============================================================
   AXO NETWORKS — OEM DOCUMENTS (WORKING DOWNLOAD)
   ============================================================= */

import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import { sanitizeHTML, formatDate, formatFileSize } from "../../core/utils.js";

let documents = [];
let selectedFile = null;

const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };
const showEl = (id) => { const n = el(id); if (n) n.style.display = "flex"; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };

const getFileIcon = (filename = "") => {
    const ext = filename.split(".").pop().toLowerCase();
    const icons = {
        pdf: "fa-file-pdf", dwg: "fa-file", step: "fa-cube", stp: "fa-cube",
        jpg: "fa-file-image", png: "fa-file-image", doc: "fa-file-word", docx: "fa-file-word",
        txt: "fa-file-alt", xls: "fa-file-excel", xlsx: "fa-file-excel"
    };
    return icons[ext] || "fa-file";
};

function getToken() {
    return localStorage.getItem('axo_access_token') || Auth.getToken();
}

async function loadDocuments() {
    const grid = el("documentsGrid");
    if (grid) grid.innerHTML = '<div class="loading">Loading documents...</div>';
    
    try {
        const token = getToken();
        if (!token) {
            Auth.logout();
            return;
        }
        
        const response = await fetch("/api/oem/documents", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 401) {
            Auth.logout();
            return;
        }

        const data = await response.json();
        documents = data.documents || [];
        renderDocuments();

    } catch (error) {
        console.error("Error loading documents:", error);
        if (grid) grid.innerHTML = '<div class="empty-state">Error loading documents</div>';
    }
}

function renderDocuments() {
    const grid = el("documentsGrid");
    const countSpan = el("docCount");

    if (!grid) return;

    if (countSpan) {
        countSpan.textContent = `${documents.length} document${documents.length !== 1 ? "s" : ""}`;
    }

    if (documents.length === 0) {
        grid.innerHTML = `<div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <p>No documents found</p>
            <button class="btn btn--primary" id="uploadFromEmptyBtn">Upload your first document</button>
        </div>`;
        const uploadBtn = document.getElementById("uploadFromEmptyBtn");
        if (uploadBtn) uploadBtn.addEventListener("click", openUploadModal);
        return;
    }

    // Group documents by RFQ number
    const rfqMap = new Map();
    documents.forEach(doc => {
        if (doc.rfq_number) {
            if (!rfqMap.has(doc.rfq_number)) {
                rfqMap.set(doc.rfq_number, { name: doc.rfq_number, docs: [] });
            }
            rfqMap.get(doc.rfq_number).docs.push(doc);
        }
    });

    let html = '<div class="folder-section">';
    
    if (rfqMap.size > 0) {
        html += '<h3 class="section-title"><i class="fas fa-file-alt"></i> RFQ Documents</h3>';
        html += '<div class="folder-grid">';
        
        for (const [key, group] of rfqMap) {
            html += `
                <div class="folder-card" data-rfq="${key.replace(/'/g, "\\'")}">
                    <div class="folder-icon"><i class="fas fa-folder-open"></i></div>
                    <div class="folder-info">
                        <div class="folder-name">📋 ${sanitizeHTML(key)}</div>
                        <div class="folder-stats">${group.docs.length} document(s)</div>
                    </div>
                    <div class="folder-arrow"><i class="fas fa-chevron-right"></i></div>
                </div>
            `;
        }
        html += '</div>';
    }
    html += '</div>';
    
    grid.innerHTML = html;

    // Add click event listeners to folders
    document.querySelectorAll('.folder-card').forEach(folder => {
        folder.addEventListener('click', (e) => {
            e.stopPropagation();
            const rfqName = folder.getAttribute('data-rfq');
            if (rfqName) {
                window.location.href = `/view-folder.html?rfq=${encodeURIComponent(rfqName)}`;
            }
        });
    });
}

async function downloadDocument(docId, fileName) {
    const token = getToken();
    if (!token) {
        Toast.error("Session expired. Please login again.");
        Auth.logout();
        return;
    }
    
    try {
        Toast.info("Downloading...");
        
        // Use window.open with token in URL for direct download
        const downloadUrl = `/api/oem/documents/${docId}/download?token=${encodeURIComponent(token)}`;
        window.open(downloadUrl, '_blank');
        
        Toast.success("Download started!");
    } catch (error) {
        console.error("Download error:", error);
        Toast.error("Failed to download file");
    }
}

async function deleteDocument(docId) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    
    const token = getToken();
    if (!token) {
        Auth.logout();
        return;
    }
    
    try {
        const response = await fetch(`/api/oem/documents/${docId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.ok) {
            Toast.success("Document deleted");
            loadDocuments();
        } else {
            Toast.error("Failed to delete document");
        }
    } catch (error) {
        console.error("Delete error:", error);
        Toast.error("Failed to delete document");
    }
}

function openUploadModal() {
    selectedFile = null;
    const previewDiv = el("selectedDocFile");
    if (previewDiv) previewDiv.style.display = "none";
    if (el("uploadForm")) el("uploadForm").reset();
    showEl("uploadModal");
}

function closeUploadModal() { 
    hideEl("uploadModal"); 
    selectedFile = null; 
}

function updateFilePreview(file) {
    const previewDiv = el("selectedDocFile");
    if (!previewDiv) return;
    if (!file) { 
        previewDiv.style.display = "none"; 
        previewDiv.innerHTML = ""; 
        return; 
    }
    previewDiv.style.display = "flex";
    previewDiv.innerHTML = `
        <i class="fas ${getFileIcon(file.name)}"></i>
        <span style="flex:1; margin-left:10px;">${file.name}</span>
        <span>${(file.size / 1024).toFixed(2)} KB</span>
        <button class="js-clear-file" onclick="this.closest('#selectedDocFile').style.display='none'; document.getElementById('docFileInput').value=''; selectedFile=null;">&times;</button>
    `;
    selectedFile = file;
}

async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!selectedFile) { 
        Toast.warning("Please select a file"); 
        return; 
    }

    const formData = new FormData();
    formData.append("document", selectedFile);
    formData.append("category", el("docCategory")?.value || "General");
    formData.append("description", el("docDescription")?.value || "");

    const submitBtn = el("uploadSubmitBtn");
    if (submitBtn) { 
        submitBtn.disabled = true; 
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; 
    }

    try {
        const token = getToken();
        if (!token) {
            throw new Error("No authentication token found");
        }
        
        const response = await fetch("/api/oem/documents/upload", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Upload failed");
        }
        
        Toast.success("Document uploaded successfully!");
        closeUploadModal();
        loadDocuments();
    } catch (error) { 
        console.error("Upload error:", error);
        Toast.error(error.message || "Upload failed"); 
    } finally { 
        if (submitBtn) { 
            submitBtn.disabled = false; 
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload'; 
        } 
    }
}

function bindEvents() {
    el("uploadDocBtn")?.addEventListener("click", openUploadModal);
    el("refreshBtn")?.addEventListener("click", loadDocuments);
    
    document.querySelectorAll(".js-close-modal, .close-modal").forEach(btn => {
        btn.addEventListener("click", () => { closeUploadModal(); hideEl("docDetailsModal"); });
    });

    const uploadArea = el("docUploadArea");
    const fileInput = el("docFileInput");
    const browseBtn = el("docBrowseBtn");

    if (uploadArea) {
        uploadArea.addEventListener("click", (e) => {
            if (e.target === browseBtn || browseBtn?.contains(e.target)) return;
            fileInput?.click();
        });
        uploadArea.addEventListener("dragover", (e) => { 
            e.preventDefault(); 
            uploadArea.classList.add("drag-over"); 
        });
        uploadArea.addEventListener("dragleave", () => { 
            uploadArea.classList.remove("drag-over"); 
        });
        uploadArea.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("drag-over");
            if (e.dataTransfer.files.length) {
                selectedFile = e.dataTransfer.files[0];
                updateFilePreview(selectedFile);
                if (fileInput) fileInput.files = e.dataTransfer.files;
            }
        });
    }

    if (browseBtn) { 
        browseBtn.addEventListener("click", (e) => { 
            e.stopPropagation(); 
            fileInput?.click(); 
        }); 
    }
    
    if (fileInput) { 
        fileInput.addEventListener("change", (e) => { 
            if (e.target.files.length) { 
                selectedFile = e.target.files[0]; 
                updateFilePreview(selectedFile); 
            } 
        }); 
    }

    el("uploadForm")?.addEventListener("submit", handleUploadSubmit);
    el("logoutBtn")?.addEventListener("click", () => Auth.logout());
    el("menuToggle")?.addEventListener("click", () => { el("sidebar")?.classList.toggle("open"); });
}

function init() {
    const user = Auth.getCurrentUser();
    setText("companyName", user?.company_name || "OEM");
    bindEvents();
    loadDocuments();
}

// Make functions available globally
window.downloadDocument = downloadDocument;
window.deleteDocument = deleteDocument;

document.addEventListener("DOMContentLoaded", init);
