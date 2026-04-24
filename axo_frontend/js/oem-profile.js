const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

let profileData = {
    company_name: user.company_name || '',
    email: user.email || '',
    phone: '',
    website: '',
    city: '',
    state: '',
    country: '',
    description: ''
};

// Load profile
async function loadProfile() {
    try {
        console.log('Loading profile...');
        const response = await fetch(`${API_URL}/oem/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.profile) {
                profileData = { ...profileData, ...data.profile };
            }
        }
        displayProfile();
    } catch (error) {
        console.error('Error loading profile:', error);
        displayProfile();
    }
}

// Display profile in view mode
function displayProfile() {
    const container = document.getElementById('viewMode');
    container.innerHTML = `
        <div class="profile-header" style="display: flex; align-items: center; gap: 24px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid var(--border-light);">
            <div class="profile-avatar" style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--primary), var(--primary-light)); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-building" style="font-size: 36px; color: white;"></i>
            </div>
            <div>
                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(profileData.company_name || user.company_name || 'Not set')}</h2>
                <p style="color: var(--text-tertiary);">${escapeHtml(profileData.industry || 'Manufacturing')} • Member since ${new Date().getFullYear()}</p>
            </div>
        </div>
        
        <div class="profile-section" style="margin-bottom: 28px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-info-circle" style="color: var(--primary);"></i> Company Information
            </h3>
            <div class="info-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">Company Name:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.company_name || user.company_name || 'Not set')}</span>
                </div>
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">Email:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(user.email || 'Not set')}</span>
                </div>
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">Phone:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.phone || 'Not provided')}</span>
                </div>
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">Website:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.website || 'Not provided')}</span>
                </div>
            </div>
        </div>
        
        <div class="profile-section" style="margin-bottom: 28px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-map-marker-alt" style="color: var(--primary);"></i> Address
            </h3>
            <div class="info-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">City:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.city || 'Not provided')}</span>
                </div>
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">State:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.state || 'Not provided')}</span>
                </div>
                <div class="info-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                    <span class="info-label" style="color: var(--text-tertiary); font-size: 12px;">Country:</span>
                    <span class="info-value" style="font-weight: 500;">${escapeHtml(profileData.country || 'Not provided')}</span>
                </div>
            </div>
        </div>
        
        <div class="profile-section">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-align-left" style="color: var(--primary);"></i> About Us
            </h3>
            <p style="color: var(--text-secondary); line-height: 1.6;">${escapeHtml(profileData.description || 'No description provided')}</p>
        </div>
    `;
}

// Populate edit form
function populateEditForm() {
    document.getElementById('editCompanyName').value = profileData.company_name || user.company_name || '';
    document.getElementById('editPhone').value = profileData.phone || '';
    document.getElementById('editWebsite').value = profileData.website || '';
    document.getElementById('editCity').value = profileData.city || '';
    document.getElementById('editState').value = profileData.state || '';
    document.getElementById('editCountry').value = profileData.country || '';
    document.getElementById('editDescription').value = profileData.description || '';
}

// Update profile
async function updateProfile() {
    const formData = {
        company_name: document.getElementById('editCompanyName').value,
        phone: document.getElementById('editPhone').value,
        website: document.getElementById('editWebsite').value,
        city: document.getElementById('editCity').value,
        state: document.getElementById('editState').value,
        country: document.getElementById('editCountry').value,
        description: document.getElementById('editDescription').value
    };
    
    try {
        const response = await fetch(`${API_URL}/oem/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const data = await response.json();
            profileData = { ...profileData, ...formData };
            displayProfile();
            document.getElementById('viewMode').style.display = 'block';
            document.getElementById('editMode').style.display = 'none';
            alert('Profile updated successfully!');
        } else {
            alert('Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Error updating profile');
    }
}

// Edit mode HTML
const editModeHtml = `
    <form id="profileForm">
        <div class="form-section">
            <h4><i class="fas fa-building"></i> Basic Information</h4>
            <div class="form-group"><label>Company Name</label><input type="text" id="editCompanyName" class="form-control"></div>
            <div class="form-row"><div class="form-group"><label>Phone</label><input type="tel" id="editPhone" class="form-control"></div>
            <div class="form-group"><label>Website</label><input type="url" id="editWebsite" class="form-control"></div></div>
        </div>
        <div class="form-section">
            <h4><i class="fas fa-map-marker-alt"></i> Address</h4>
            <div class="form-row"><div class="form-group"><label>City</label><input type="text" id="editCity" class="form-control"></div>
            <div class="form-group"><label>State</label><input type="text" id="editState" class="form-control"></div></div>
            <div class="form-group"><label>Country</label><input type="text" id="editCountry" class="form-control"></div>
        </div>
        <div class="form-section">
            <h4><i class="fas fa-align-left"></i> Company Description</h4>
            <div class="form-group"><textarea id="editDescription" rows="4" class="form-control" placeholder="Describe your company..."></textarea></div>
        </div>
        <div class="form-actions">
            <button type="button" class="btn-secondary" id="cancelEditBtn">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
        </div>
    </form>
`;

// Set edit mode HTML
document.getElementById('editMode').innerHTML = editModeHtml;

// Event listeners
document.getElementById('editProfileBtn').addEventListener('click', () => {
    populateEditForm();
    document.getElementById('viewMode').style.display = 'none';
    document.getElementById('editMode').style.display = 'block';
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('viewMode').style.display = 'block';
    document.getElementById('editMode').style.display = 'none';
});

document.getElementById('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    updateProfile();
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// Load profile
loadProfile();
