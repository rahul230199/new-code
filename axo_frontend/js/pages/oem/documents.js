/* =============================================================
   AXO NETWORKS — OEM DOCUMENTS (NO ROUTER VERSION)
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
        jpg: "fa-file-image", png: "fa-file-image", doc: "fa-file-word", docx: "fa-file-word"
    };
    return icons[ext] || "fa-file";
};

async function loadDocuments() {
    const grid = el("documentsGrid");
    if (grid) grid.innerHTML = '<div class="loading">Loading documents...</div>';
    
    try {
        const token = Auth.getToken();
        const response = await fetch("/api/oem/documents", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        
        const data = await response.json();
        documents = data.documents || [];
        console.log('Documents loaded:', documents.length);
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
    
    let html = '';
    
    if (rfqMap.size > 0) {
        html += `<div style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 16px; color: #6366f1;"><i class="fas fa-file-alt"></i> RFQ Documents</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">`;
        
        for (const [key, group] of rfqMap) {
            const encodedName = encodeURIComponent(key);
            html += `
                <div class="rfq-folder" data-rfq="${key}" style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-folder-open" style="font-size: 40px; color: #6366f1;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">📋 ${key}</div>
                            <div style="font-size: 13px; color: #64748b;">${group.docs.length} document(s)</div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: #94a3b8;"></i>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    
    grid.innerHTML = html;
    
    // Add click event listeners
    document.querySelectorAll('.rfq-folder').forEach(folder => {
        folder.addEventListener('click', (e) => {
            e.stopPropagation();
            const rfqName = folder.getAttribute('data-rfq');
            console.log('Opening folder:', rfqName);
            // Direct navigation to folder view
            window.location.href = `/view-rfq-folder.html?rfq=${encodeURIComponent(rfqName)}`;
        });
    });
}

function openUploadModal() {
    selectedFile = null;
    const previewDiv = el("selectedDocFile");
    if (previewDiv) previewDiv.style.display = "none";
    showEl("uploadModal");
}

function closeUploadModal() { hideEl("uploadModal"); selectedFile = null; }

function updateFilePreview(file) {
    const previewDiv = el("selectedDocFile");
    if (!previewDiv) return;
    if (!file) { previewDiv.style.display = "none"; previewDiv.innerHTML = ""; return; }
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
    if (!selectedFile) { Toast.warning("Please select a file"); return; }
    
    const formData = new FormData();
    formData.append("document", selectedFile);
    formData.append("category", el("docCategory")?.value || "General");
    formData.append("description", el("docDescription")?.value || "");
    
    const submitBtn = el("uploadSubmitBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; }
    
    try {
        const token = Auth.getToken();
        const response = await fetch("/api/oem/documents/upload", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: formData
        });
        if (!response.ok) throw new Error("Upload failed");
        Toast.success("Uploaded!");
        closeUploadModal();
        loadDocuments();
    } catch (error) { Toast.error("Upload failed"); }
    finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload'; } }
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
        uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
        uploadArea.addEventListener("dragleave", () => { uploadArea.classList.remove("drag-over"); });
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
    
    if (browseBtn) { browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput?.click(); }); }
    if (fileInput) { fileInput.addEventListener("change", (e) => { if (e.target.files.length) { selectedFile = e.target.files[0]; updateFilePreview(selectedFile); } }); }
    
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

document.addEventListener("DOMContentLoaded", init);
