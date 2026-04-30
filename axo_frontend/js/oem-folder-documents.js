const API_URL = 'https://axonetworks.com/api';

const authToken = localStorage.getItem('adminToken') || localStorage.getItem('token');
if (!authToken) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

const urlParams = new URLSearchParams(window.location.search);
const folderType = urlParams.get('type');
const folderId = urlParams.get('id');
const folderName = urlParams.get('name');

console.log('Folder ID from URL:', folderId);

document.getElementById('folderTitle').textContent = folderType === 'rfq' ? 'RFQ Documents' : 'PO Documents';
document.getElementById('folderNameDisplay').textContent = folderType === 'rfq' ? '📋 ' + folderName : '📦 ' + folderName;

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'fa-file-pdf';
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'fa-file-image';
    if (ext === 'doc' || ext === 'docx') return 'fa-file-word';
    if (ext === 'dwg') return 'fa-file';
    if (ext === 'step' || ext === 'stp') return 'fa-cube';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function loadFolderDocuments() {
    const container = document.getElementById('documentsList');
    container.innerHTML = '<div class="loading">Loading documents...</div>';
    
    if (!folderId) {
        container.innerHTML = '<div class="empty-state">No folder ID provided</div>';
        return;
    }
    
    try {
        // Use direct endpoint without extra /api
        let endpoint = '';
        if (folderType === 'rfq') {
            endpoint = `https://axonetworks.com/api/oem/rfqs/${folderId}/documents`;
        } else {
            endpoint = `https://axonetworks.com/api/oem/orders/${folderId}/documents`;
        }
        
        console.log('Fetching from:', endpoint);
        
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/login.html';
            return;
        }
        
        const data = await response.json();
        const documents = data.documents || [];
        
        console.log('Documents found:', documents.length);
        
        document.getElementById('fileCount').textContent = `${documents.length} document${documents.length !== 1 ? 's' : ''}`;
        
        if (documents.length === 0) {
            container.innerHTML = '<div class="empty-state">No documents found in this folder</div>';
            return;
        }
        
        let html = '';
        documents.forEach(doc => {
            html += `
                <div style="background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div style="width: 60px; height: 60px; background: #f1f5f9; border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas ${getFileIcon(doc.file_name)} fa-2x" style="color: #6366f1;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 6px;">${escapeHtml(doc.file_name)}</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #64748b;">
                                <span><i class="fas fa-tag"></i> ${escapeHtml(doc.category || 'General')}</span>
                                <span><i class="fas fa-database"></i> ${formatFileSize(doc.file_size)}</span>
                                <span><i class="fas fa-calendar"></i> ${new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                        <button class="btn-outline" onclick="viewDocument(${doc.id})">View</button>
                        <button class="btn-outline" onclick="downloadDocument(${doc.id}, '${doc.file_name}')">Download</button>
                        <button onclick="deleteDocument(${doc.id})" style="background: #fee2e2; color: #dc2626; border: none; padding: 8px 16px; border-radius: 8px;">Delete</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading documents:', error);
        container.innerHTML = '<div class="empty-state">Error loading documents</div>';
    }
}

window.viewDocument = async (docId) => {
    try {
        const response = await fetch(`https://axonetworks.com/api/oem/documents/${docId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const doc = await response.json();
        
        document.getElementById('docDetails').innerHTML = `
            <div style="text-align:center; margin-bottom:24px;">
                <i class="fas ${getFileIcon(doc.file_name)} fa-4x" style="color: #6366f1;"></i>
            </div>
            <div style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                    <b>File Name:</b> <span>${escapeHtml(doc.file_name)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                    <b>Size:</b> <span>${formatFileSize(doc.file_size)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                    <b>Category:</b> <span>${escapeHtml(doc.category || 'General')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 12px 0;">
                    <b>Uploaded:</b> <span>${new Date(doc.created_at).toLocaleString()}</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="btn-primary" onclick="downloadDocument(${doc.id}, '${doc.file_name}')">Download</button>
                <button onclick="deleteDocument(${doc.id})" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px;">Delete</button>
            </div>
        `;
        document.getElementById('docDetailsModal').style.display = 'flex';
    } catch (error) {
        alert('Error loading document details');
    }
};

window.downloadDocument = (docId, fileName) => {
    window.open(`https://axonetworks.com/api/oem/documents/${docId}/download?token=${authToken}`, '_blank');
};

window.deleteDocument = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
        const response = await fetch(`https://axonetworks.com/api/oem/documents/${docId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            alert('Document deleted');
            document.getElementById('docDetailsModal').style.display = 'none';
            loadFolderDocuments();
        }
    } catch (error) {
        alert('Error deleting document');
    }
};

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('docDetailsModal').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    const modal = document.getElementById('docDetailsModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

loadFolderDocuments();
