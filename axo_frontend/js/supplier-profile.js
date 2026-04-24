const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'Supplier';

function displayProfile() {
    document.getElementById('viewMode').innerHTML = `<div class="profile-header"><div class="profile-avatar"><i class="fas fa-building fa-3x"></i></div><div><h2>${user.company_name || 'Precision Parts Ltd'}</h2><p>${user.email || 'supplier@example.com'}</p></div></div>
    <div class="profile-section"><h3>Contact Information</h3><div class="info-grid"><div class="info-item"><span>Phone:</span><span>+1 234 567 8900</span></div><div class="info-item"><span>Website:</span><span>www.precisionparts.com</span></div><div class="info-item"><span>Location:</span><span>Detroit, USA</span></div></div></div>
    <div class="profile-section"><h3>Certifications</h3><div class="cert-badges"><span class="cert-badge">ISO 9001</span><span class="cert-badge">IATF 16949</span></div></div>
    <div class="profile-section"><h3>About</h3><p>Leading manufacturer of precision components with 20+ years of experience.</p></div>`;
}

document.getElementById('editProfileBtn')?.addEventListener('click', () => { alert('Edit profile feature coming soon'); });
document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
document.getElementById('menuToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
displayProfile();
