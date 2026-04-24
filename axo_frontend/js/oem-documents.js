const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

let documents = [];

async function loadDocuments() {
    try {
        const response = await fetch(`${API_URL}/oem/documents`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        documents = data.documents || [];
        renderDocuments();
    } catch (error) {
        console.error('Error loading documents:', error);
        renderDemoDocuments();
    }
}

function renderDemoDocuments() {
    const container = document.getElementById('documentsGrid');
    const demoDocs = [
        { id: 1, name: 'Battery_Specification.pdf', category: 'Technical Specs', size: '2.4 MB', date: '2024-01-15', icon: 'fa-file-pdf' },
        { id: 2, name: 'CAD_Model_Assembly.step', category: 'CAD Models', size: '5.1 MB', date: '2024-01-20', icon: 'fa-cube' },
        { id: 3, name: 'Drawing_PCB_V2.dwg', category: 'Design Files', size: '1.8 MB', date: '2024-01-25', icon: 'fa-file' }
    ];
    
    container.innerHTML = demoDocs.map(doc => `
        <div class="document-card" onclick="viewDocument(${doc.id})">
            <i class="fas ${doc.icon} fa-3x"></i>
            <h4>${doc.name}</h4>
            <p>${doc.category}</p>
            <small>${doc.size} • ${doc.date}</small>
        </div>
    `).join('');
}

function renderDocuments() {
    const container = document.getElementById('documentsGrid');
    if (documents.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No documents yet</p><button class="btn-primary" onclick="openUploadModal()">Upload your first document</button></div>';
        return;
    }
    
    container.innerHTML = documents.map(doc => `
        <div class="document-card" onclick="viewDocument(${doc.id})">
            <i class="fas ${getFileIcon(doc.name)} fa-3x"></i>
            <h4>${doc.name}</h4>
            <p>${doc.category || 'General'}</p>
            <small>${formatFileSize(doc.size)} • ${new Date(doc.uploaded_at).toLocaleDateString()}</small>
        </div>
    `).join('');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = { pdf: 'fa-file-pdf', dwg: 'fa-file', step: 'fa-cube', stp: 'fa-cube', jpg: 'fa-file-image', png: 'fa-file-image', doc: 'fa-file-word', docx: 'fa-file-word' };
    return icons[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

window.viewDocument = (docId) => {
    const doc = documents.find(d => d.id === docId) || { name: 'Sample Document', category: 'General', size: '1 MB', date: new Date().toLocaleDateString() };
    document.getElementById('docDetails').innerHTML = `
        <div class="document-preview"><i class="fas ${getFileIcon(doc.name)} fa-4x"></i></div>
        <div class="info-grid"><div class="info-item"><span class="info-label">Filename:</span><span class="info-value">${doc.name}</span></div>
        <div class="info-item"><span class="info-label">Size:</span><span class="info-value">${doc.size || formatFileSize(doc.file_size)}</span></div>
        <div class="info-item"><span class="info-label">Category:</span><span class="info-value">${doc.category || 'General'}</span></div>
        <div class="info-item"><span class="info-label">Uploaded:</span><span class="info-value">${doc.date || new Date(doc.uploaded_at).toLocaleDateString()}</span></div></div>
        <div class="form-actions"><button class="btn-primary" onclick="downloadDocument(${doc.id})"><i class="fas fa-download"></i> Download</button></div>
    `;
    document.getElementById('docDetailsModal').style.display = 'flex';
};

window.downloadDocument = (docId) => {
    alert('Download feature - would download document ' + docId);
};

window.openUploadModal = () => {
    document.getElementById('uploadForm').reset();
    document.getElementById('selectedDocFile').style.display = 'none';
    document.getElementById('uploadModal').style.display = 'flex';
};

// File upload handling
const uploadArea = document.getElementById('docUploadArea');
const fileInput = document.getElementById('docFileInput');
const browseBtn = document.getElementById('docBrowseBtn');

if (uploadArea) {
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#6366f1'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#e2e8f0'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e2e8f0';
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleDocFileSelect(e.dataTransfer.files[0]);
        }
    });
}

if (browseBtn) {
    browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleDocFileSelect(e.target.files[0]);
});

function handleDocFileSelect(file) {
    const selectedDiv = document.getElementById('selectedDocFile');
    selectedDiv.style.display = 'flex';
    selectedDiv.innerHTML = `
        <i class="fas ${getFileIcon(file.name)}"></i>
        <span>${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
        <i class="fas fa-times" style="margin-left:auto; cursor:pointer;" onclick="this.parentElement.style.display='none'; document.getElementById('docFileInput').value=''"></i>
    `;
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) { alert('Please select a file'); return; }
    
    const formData = new FormData();
    formData.append('document', file);
    formData.append('category', document.getElementById('docCategory').value);
    formData.append('description', document.getElementById('docDescription').value);
    
    try {
        const response = await fetch(`${API_URL}/oem/documents/upload`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
        });
        if (response.ok) {
            alert('Document uploaded successfully!');
            document.getElementById('uploadModal').style.display = 'none';
            loadDocuments();
        } else { alert('Upload failed'); }
    } catch (error) { alert('Error uploading document'); }
});

document.getElementById('uploadDocBtn').addEventListener('click', openUploadModal);
document.getElementById('refreshBtn').addEventListener('click', loadDocuments);

document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', function() { this.closest('.modal').style.display = 'none'; }));
document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

loadDocuments();
