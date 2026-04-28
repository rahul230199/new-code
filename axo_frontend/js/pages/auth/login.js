/* ================================================================
   AXO NETWORKS — LOGIN.JS  (Production Ready)
   /js/pages/auth/login.js

   Flow:
   1. RouteGuard redirects already-authenticated users away
   2. Validate email + password client-side
   3. POST /api/auth/login
   4. On success → Auth.saveSession → Auth.redirectAfterLogin
   5. On error  → show field-level or banner error
================================================================ */

import API        from "../../core/api.js";
import Auth       from "../../core/auth.js";
import RouteGuard from "../../guards/routeGuard.js";

(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────────
       GUARD — Redirect already-logged-in users to their dashboard
    ─────────────────────────────────────────────────────────────── */
    if (!RouteGuard.guardLoginPage()) return;

    /* ───────────────────────────────────────────────────────────────
       DOM REFS
    ─────────────────────────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);

    const el = {
        form:          $('loginForm'),
        email:         $('email'),
        password:      $('password'),
        submitBtn:     $('loginBtn'),
        btnText:       $('loginBtnText'),
        btnSpinner:    $('btnSpinner'),
        btnArrow:      document.querySelector('.btn-arrow'),
        togglePwd:     $('togglePassword'),
        eyeShow:       document.querySelector('.icon-eye-show'),
        eyeHide:       document.querySelector('.icon-eye-hide'),
        alertBanner:   $('alertBanner'),
        alertText:     $('alertText'),
        alertClose:    $('alertClose'),
        fieldEmail:    $('fieldEmail'),
        fieldPassword: $('fieldPassword'),
        emailError:    $('emailError'),
        passwordError: $('passwordError'),
    };

    /* ───────────────────────────────────────────────────────────────
       ALERT BANNER
    ─────────────────────────────────────────────────────────────── */
    /**
     * Show the top-of-form banner.
     * @param {string}            message
     * @param {'error'|'success'} type
     */
    const showAlert = (message, type = 'error') => {
        if (!el.alertBanner || !el.alertText) return;
        el.alertText.textContent = message;
        el.alertBanner.classList.toggle('is-success', type === 'success');
        el.alertBanner.hidden = false;
        // Scroll banner into view on small screens
        el.alertBanner.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const hideAlert = () => {
        if (el.alertBanner) el.alertBanner.hidden = true;
    };

    /* ───────────────────────────────────────────────────────────────
       FIELD ERRORS
    ─────────────────────────────────────────────────────────────── */
    /**
     * Set or clear an inline field error.
     * @param {HTMLElement} groupEl   - .field-group wrapper
     * @param {HTMLElement} errorEl   - .field-error span
     * @param {HTMLInputElement} inputEl - the input
     * @param {string|null}  message  - null = clear
     */
    const setFieldError = (groupEl, errorEl, inputEl, message) => {
        if (!groupEl || !errorEl) return;
        if (message) {
            groupEl.classList.add('has-error');
            errorEl.textContent = message;
            if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
        } else {
            groupEl.classList.remove('has-error');
            errorEl.textContent = '';
            if (inputEl) inputEl.setAttribute('aria-invalid', 'false');
        }
    };

    const clearAllErrors = () => {
        setFieldError(el.fieldEmail,    el.emailError,    el.email,    null);
        setFieldError(el.fieldPassword, el.passwordError, el.password, null);
        hideAlert();
    };

    /* ───────────────────────────────────────────────────────────────
       CLIENT-SIDE VALIDATION
    ─────────────────────────────────────────────────────────────── */
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const validate = (email, password) => {
        let valid = true;

        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            setFieldError(el.fieldEmail, el.emailError, el.email, 'Email address is required.');
            valid = false;
        } else if (!EMAIL_RE.test(trimmedEmail)) {
            setFieldError(el.fieldEmail, el.emailError, el.email, 'Enter a valid email address.');
            valid = false;
        }

        if (!password) {
            setFieldError(el.fieldPassword, el.passwordError, el.password, 'Password is required.');
            valid = false;
        }

        // Focus first errored field
        if (!valid) {
            const firstError = el.fieldEmail.classList.contains('has-error')
                ? el.email
                : el.password;
            firstError?.focus();
        }

        return valid;
    };

    /* ───────────────────────────────────────────────────────────────
       LOADING STATE
    ─────────────────────────────────────────────────────────────── */
    const setLoading = (loading) => {
        el.submitBtn.disabled = loading;
        el.submitBtn.classList.toggle('is-loading', loading);

        if (el.btnText) {
            el.btnText.textContent = loading ? 'Signing in…' : 'Sign In';
        }

        if (el.btnSpinner) el.btnSpinner.hidden  = !loading;
        if (el.btnArrow)   el.btnArrow.hidden = loading;

        // Disable inputs during submission
        if (el.email)    el.email.disabled    = loading;
        if (el.password) el.password.disabled = loading;
    };

    /* ───────────────────────────────────────────────────────────────
       SUBMIT HANDLER
    ─────────────────────────────────────────────────────────────── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearAllErrors();

        const email    = el.email?.value    ?? '';
        const password = el.password?.value ?? '';

        if (!validate(email, password)) return;

        setLoading(true);

        try {
            const data = await API.post('/auth/login', {
                email:    email.trim().toLowerCase(),
                password,
            });

            /* ── Validate server response shape ── */
            if (!data?.token || !data?.user) {
                throw { message: 'Unexpected server response. Please try again.' };
            }

            const { token, user, forcePasswordChange = false } = data;

            // Guard: missing role would cause the router to loop back to /login.html
            if (!user.role) {
                throw { message: 'Account has no role assigned. Contact your administrator.' };
            }

            /* ── Persist session ── */
            Auth.saveSession(token, {
                id:                  user.id,
                email:               user.email,
                company_name:        user.company_name ?? '',
                role:                user.role,
                forcePasswordChange: !!forcePasswordChange,
            });

            /* ── Redirect (handles forcePasswordChange + role routing) ── */
            Auth.redirectAfterLogin(!!forcePasswordChange, user.role);

        } catch (err) {
            console.error('[Login] Error:', err);

            setLoading(false);

            const status = err?.status ?? 0;

            switch (status) {
                case 401:
                    setFieldError(
                        el.fieldPassword, el.passwordError, el.password,
                        'Incorrect email or password.'
                    );
                    showAlert('Invalid email or password. Please try again.');
                    el.password?.select();
                    break;

                case 403:
                    showAlert('Your account is inactive. Please contact the administrator.');
                    break;

                case 0:
                    showAlert('Unable to connect. Check your internet connection and try again.');
                    break;

                default:
                    showAlert(err?.message || 'Sign in failed. Please try again later.');
            }
        }
    };

    /* ───────────────────────────────────────────────────────────────
       PASSWORD VISIBILITY TOGGLE
    ─────────────────────────────────────────────────────────────── */
    const handleTogglePassword = () => {
        if (!el.password || !el.togglePwd) return;

        const isHidden = el.password.type === 'password';

        el.password.type = isHidden ? 'text' : 'password';
        el.togglePwd.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

        if (el.eyeShow) el.eyeShow.hidden = isHidden;
        if (el.eyeHide) el.eyeHide.hidden = !isHidden;
    };

    /* ───────────────────────────────────────────────────────────────
       CLEAR ERRORS ON INPUT
    ─────────────────────────────────────────────────────────────── */
    const bindClearOnInput = () => {
        el.email?.addEventListener('input', () => {
            setFieldError(el.fieldEmail, el.emailError, el.email, null);
            hideAlert();
        });

        el.password?.addEventListener('input', () => {
            setFieldError(el.fieldPassword, el.passwordError, el.password, null);
            hideAlert();
        });
    };

    /* ───────────────────────────────────────────────────────────────
       ALERT CLOSE
    ─────────────────────────────────────────────────────────────── */
    const bindAlertClose = () => {
        el.alertClose?.addEventListener('click', hideAlert);
    };

    /* ───────────────────────────────────────────────────────────────
       KEYBOARD: Submit on Enter anywhere in form
    ─────────────────────────────────────────────────────────────── */
    const bindKeyboard = () => {
        el.form?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
                el.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    };

    /* ───────────────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────────────── */
    const init = () => {
        if (!el.form) {
            console.error('[Login] #loginForm not found in DOM.');
            return;
        }

        el.form.addEventListener('submit', handleSubmit);
        el.togglePwd?.addEventListener('click', handleTogglePassword);

        bindClearOnInput();
        bindAlertClose();
        bindKeyboard();

        // Auto-focus email on page load
        requestAnimationFrame(() => el.email?.focus());
    };

    /* ── Bootstrap after DOM is ready ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();