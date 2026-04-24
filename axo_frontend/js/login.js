const API_URL = 'https://axonetworks.com/api';

// Clear any stale data on page load
localStorage.removeItem('adminToken');
localStorage.removeItem('adminUser');
localStorage.removeItem('token');
localStorage.removeItem('user');

// Get DOM elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorDiv = document.getElementById('errorMessage');
const togglePassword = document.getElementById('togglePassword');

// Toggle password visibility
if (togglePassword) {
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye-slash');
    });
}

// Handle form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Validate
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }

    // Disable button and show loading
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    errorDiv.classList.remove('show');

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store token and user data
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUser', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        console.log('Login successful:', data);

        // Check if password change is required (for temp password)
        if (data.forcePasswordChange === true) {
            showSuccess('Please change your password to continue...');
            setTimeout(() => {
                window.location.href = '/change-password.html';
            }, 1500);
            return;
        }

        // Show success message
        showSuccess('Login successful! Redirecting...');

        // Redirect based on role
        setTimeout(() => {
            // Use redirect URL from backend if provided
            if (data.redirectUrl) {
                window.location.href = data.redirectUrl;
            } else {
                // Fallback role-based redirect
                const userRole = data.user.role;
                if (userRole === 'admin') {
                    window.location.href = '/admin-dashboard.html';
                } else if (userRole === 'oem') {
                    window.location.href = '/oem-dashboard.html';
                } else if (userRole === 'supplier') {
                    window.location.href = '/supplier-dashboard.html';
                } else {
                    window.location.href = '/dashboard.html';
                }
            }
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please try again.');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
});

// Show error message
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    errorDiv.style.background = '#fee2e2';
    errorDiv.style.color = '#991b1b';
    errorDiv.style.borderLeftColor = '#ef4444';
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

// Show success message
function showSuccess(message) {
    errorDiv.style.background = '#d1fae5';
    errorDiv.style.color = '#065f46';
    errorDiv.style.borderLeftColor = '#10b981';
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

// Enter key press
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginForm.dispatchEvent(new Event('submit'));
    }
});
