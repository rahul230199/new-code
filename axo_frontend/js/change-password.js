// CHANGE PASSWORD - WORKING VERSION
(function() {
    'use strict';
    
    const API_URL = 'https://axonetworks.com/api';
    
    console.log('Change password script loaded');
    
    // Get email from URL - multiple ways
    let email = null;
    
    // Method 1: URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    email = urlParams.get('email');
    console.log('Email from URL params:', email);
    
    // Method 2: If not found, try to get from hash
    if (!email && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        email = hashParams.get('email');
        console.log('Email from hash:', email);
    }
    
    // Method 3: If still not found, try to get from localStorage
    if (!email) {
        const user = localStorage.getItem('adminUser');
        if (user) {
            try {
                const userObj = JSON.parse(user);
                email = userObj.email;
                console.log('Email from localStorage:', email);
            } catch(e) {}
        }
    }
    
    // Display email
    const userEmailSpan = document.getElementById('userEmail');
    if (userEmailSpan && email) {
        userEmailSpan.textContent = email;
    } else if (userEmailSpan) {
        userEmailSpan.textContent = 'User';
        console.warn('No email found in URL');
    }
    
    // Get form elements
    const tempPasswordInput = document.getElementById('tempPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('changePasswordBtn');
    const errorDiv = document.getElementById('errorMessage');
    
    if (!submitBtn) {
        console.error('Submit button not found!');
        return;
    }
    
    // Password visibility toggles
    const toggleButtons = document.querySelectorAll('.toggle-password');
    toggleButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                }
            }
        });
    });
    
    // Password match check
    function checkMatch() {
        const matchDiv = document.getElementById('passwordMatch');
        if (!matchDiv) return;
        
        const newPass = newPasswordInput ? newPasswordInput.value : '';
        const confirmPass = confirmPasswordInput ? confirmPasswordInput.value : '';
        
        if (confirmPass === '') {
            matchDiv.innerHTML = '';
        } else if (newPass === confirmPass) {
            matchDiv.innerHTML = '<i class="fas fa-check-circle"></i> Passwords match';
            matchDiv.style.color = '#10b981';
        } else {
            matchDiv.innerHTML = '<i class="fas fa-times-circle"></i> Passwords do not match';
            matchDiv.style.color = '#ef4444';
        }
    }
    
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', checkMatch);
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', checkMatch);
    }
    
    // Password strength
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const password = this.value;
            const strengthBars = document.querySelectorAll('.strength-bar');
            const strengthText = document.querySelector('.strength-text');
            
            let strength = 0;
            if (password.length >= 6) strength++;
            if (password.length >= 10) strength++;
            if (/[0-9]/.test(password)) strength++;
            if (/[!@#$%^&*]/.test(password)) strength++;
            if (/[A-Z]/.test(password)) strength++;
            
            strengthBars.forEach(function(bar, index) {
                bar.className = 'strength-bar';
                if (index < strength) {
                    if (strength <= 2) bar.classList.add('weak');
                    else if (strength <= 3) bar.classList.add('medium');
                    else bar.classList.add('strong');
                }
            });
            
            if (strengthText) {
                if (password.length === 0) {
                    strengthText.textContent = 'Enter password';
                } else if (strength <= 2) {
                    strengthText.textContent = 'Weak';
                } else if (strength <= 3) {
                    strengthText.textContent = 'Medium';
                } else {
                    strengthText.textContent = 'Strong';
                }
            }
        });
    }
    
    // Submit handler
    submitBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        console.log('Submit button clicked');
        
        // Get email again (in case it was updated)
        let currentEmail = email;
        if (!currentEmail) {
            const urlEmail = new URLSearchParams(window.location.search).get('email');
            if (urlEmail) {
                currentEmail = urlEmail;
                console.log('Email re-fetched from URL:', currentEmail);
            }
        }
        
        if (!currentEmail) {
            if (errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Email not found. Please go back and try again.';
                errorDiv.style.display = 'block';
                setTimeout(function() { errorDiv.style.display = 'none'; }, 5000);
            }
            return;
        }
        
        const tempPassword = tempPasswordInput ? tempPasswordInput.value : '';
        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
        
        console.log('Email:', currentEmail);
        console.log('Temp password entered:', tempPassword ? 'Yes' : 'No');
        console.log('New password entered:', newPassword ? 'Yes' : 'No');
        
        // Validation
        if (!tempPassword || !newPassword || !confirmPassword) {
            if (errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please fill in all fields';
                errorDiv.style.display = 'block';
                setTimeout(function() { errorDiv.style.display = 'none'; }, 3000);
            }
            return;
        }
        
        if (newPassword !== confirmPassword) {
            if (errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> New passwords do not match';
                errorDiv.style.display = 'block';
                setTimeout(function() { errorDiv.style.display = 'none'; }, 3000);
            }
            return;
        }
        
        if (newPassword.length < 6) {
            if (errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Password must be at least 6 characters';
                errorDiv.style.display = 'block';
                setTimeout(function() { errorDiv.style.display = 'none'; }, 3000);
            }
            return;
        }
        
        // Disable button
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        
        try {
            // Step 1: Login with temp password
            console.log('Logging in with:', currentEmail);
            const loginResponse = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, password: tempPassword })
            });
            
            const loginData = await loginResponse.json();
            
            if (!loginResponse.ok) {
                throw new Error(loginData.error || 'Invalid temporary password');
            }
            
            console.log('Login successful');
            
            // Step 2: Change password
            const changeResponse = await fetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + loginData.token
                },
                body: JSON.stringify({
                    currentPassword: tempPassword,
                    newPassword: newPassword
                })
            });
            
            const changeData = await changeResponse.json();
            
            if (!changeResponse.ok) {
                throw new Error(changeData.error || 'Failed to change password');
            }
            
            console.log('Password changed successfully');
            
            // Show success
            if (errorDiv) {
                errorDiv.style.background = '#d1fae5';
                errorDiv.style.color = '#065f46';
                errorDiv.style.borderLeftColor = '#10b981';
                errorDiv.innerHTML = '<i class="fas fa-check-circle"></i> Password changed successfully! Redirecting to login...';
                errorDiv.style.display = 'block';
            }
            
            // Clear storage and redirect
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            
            setTimeout(function() {
                window.location.href = '/login.html';
            }, 2000);
            
        } catch (error) {
            console.error('Error:', error);
            if (errorDiv) {
                errorDiv.style.background = '#fee2e2';
                errorDiv.style.color = '#dc2626';
                errorDiv.style.borderLeftColor = '#ef4444';
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + error.message;
                errorDiv.style.display = 'block';
                setTimeout(function() { errorDiv.style.display = 'none'; }, 5000);
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Password';
        }
    });
    
    console.log('Change password page ready. Email:', email);
})();
