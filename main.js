// Main JavaScript for Heritage Family Trees

// Cookie utility functions (from familysearch.js)
function setCookie(name, value, hours) {
    const date = new Date();
    date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

// Source selection function
function selectSource(source) {
    if (source === 'familysearch') {
        // Check if user already has a valid access token
        const accessToken = getCookie('fs_access_token');
        if (accessToken) {
            // User is already authenticated, go directly to config
            window.location.href = 'familysearch-config.html';
        } else {
            // User needs to authenticate first
            window.location.href = 'familysearch.html';
        }
    } else if (source === 'gedcom') {
        window.location.href = 'gedcom.html';
    }
}

// Make selectSource available globally
window.selectSource = selectSource;

document.addEventListener('DOMContentLoaded', function() {
    // Check if we're returning from OAuth callback first
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        alert('Authentication failed: ' + error);
        return;
    }

    if (code) {
        // We're returning from OAuth, exchange code for token and redirect
        exchangeCodeForTokenAndRedirect(code);
        return;
    }
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Form validation and enhancement
    const form = document.querySelector('form[action*="submit-inquiry"]');
    if (form) {
        // Add real-time validation feedback
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                validateField(this);
            });
            
            input.addEventListener('input', function() {
                if (this.classList.contains('is-invalid')) {
                    validateField(this);
                }
            });
        });

        // Form submission handling
        form.addEventListener('submit', function(e) {
            let isValid = true;
            inputs.forEach(input => {
                if (!validateField(input)) {
                    isValid = false;
                }
            });

            if (!isValid) {
                e.preventDefault();
                const firstInvalid = form.querySelector('.is-invalid');
                if (firstInvalid) {
                    firstInvalid.focus();
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                // Show loading state
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    const originalText = submitBtn.innerHTML;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';
                    submitBtn.disabled = true;
                    
                    // Re-enable button after a timeout in case of network issues
                    setTimeout(() => {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                    }, 10000);
                }
            }
        });
    }

    // Add animation to cards on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe cards for animation
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });

    // Auto-dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 5000);
    });

    // Example image click handlers
    const exampleCards = document.querySelectorAll('.example-card');
    exampleCards.forEach(card => {
        card.addEventListener('click', function() {
            const img = this.querySelector('.example-image');
            if (img) {
                // Open image in new window/tab
                window.open(img.src, '_blank');
            }
        });
    });
});

// Field validation function
function validateField(field) {
    const value = field.value.trim();
    let isValid = true;
    let errorMessage = '';

    // Remove existing validation classes
    field.classList.remove('is-valid', 'is-invalid');
    
    // Remove existing feedback
    const existingFeedback = field.parentNode.querySelector('.invalid-feedback');
    if (existingFeedback) {
        existingFeedback.remove();
    }

    // Required field validation
    if (field.hasAttribute('required') || field.name === 'name' || field.name === 'email' || field.name === 'generations' || field.name === 'chart_style') {
        if (!value) {
            isValid = false;
            errorMessage = 'This field is required.';
        }
    }

    // Email validation
    if (field.type === 'email' || field.name === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address.';
        }
    }

    // Phone validation (optional but if provided, should be valid)
    if (field.name === 'phone' && value) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
            isValid = false;
            errorMessage = 'Please enter a valid phone number.';
        }
    }

    // Generations validation
    if (field.name === 'generations') {
        const generations = parseInt(value);
        if (value && (isNaN(generations) || generations < 2 || generations > 10)) {
            isValid = false;
            errorMessage = 'Please select between 2 and 10 generations.';
        }
    }

    // Text length validation
    if (field.name === 'family_info' && value.length > 1000) {
        isValid = false;
        errorMessage = 'Family information must be less than 1000 characters.';
    }

    if (field.name === 'message' && value.length > 500) {
        isValid = false;
        errorMessage = 'Message must be less than 500 characters.';
    }

    // Apply validation classes and feedback
    if (isValid) {
        if (value) {
            field.classList.add('is-valid');
        }
    } else {
        field.classList.add('is-invalid');
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        feedback.textContent = errorMessage;
        field.parentNode.appendChild(feedback);
    }

    return isValid;
}

// Utility function to format phone numbers as user types
document.addEventListener('input', function(e) {
    if (e.target && e.target.name === 'phone') {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 6) {
            value = value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
        } else if (value.length >= 3) {
            value = value.replace(/(\d{3})(\d{0,3})/, '($1) $2');
        }
        e.target.value = value;
    }
});

// OAuth token exchange function (from source-selection.html)
async function exchangeCodeForTokenAndRedirect(code) {
    const storedState = getCookie('oauth_state');
    const returnedState = new URLSearchParams(window.location.search).get('state');
    
    if (storedState !== returnedState) {
        alert('Invalid state parameter. Authentication failed.');
        return;
    }

    // Show loading message
    const contactSection = document.querySelector('#contact .container');
    if (contactSection) {
        contactSection.innerHTML = `
            <div class="text-center py-5">
                <div style="width: 50px; height: 50px; border: 4px solid #f3f4f6; border-top: 4px solid var(--gold-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <h3 style="color: var(--gold-primary); margin-bottom: 15px;">Completing Authentication...</h3>
                <p style="color: var(--text-gray); font-size: 1.1rem;">Please wait while we finalize your FamilySearch connection.</p>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </div>
        `;
    }

    try {
        // Exchange authorization code for access token
        const tokenData = {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://bryantmcarthur.com/family-trees',
            client_id: 'b00KBZ8PWGLG7SJ0A3U1'
        };

        const response = await fetch('https://identbeta.familysearch.org/cis-web/oauth2/v3/token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(tokenData)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Token exchange failed:', errorData);
            throw new Error(`Token exchange failed: ${response.status}`);
        }

        const tokenResponse = await response.json();
        const accessToken = tokenResponse.access_token;

        if (accessToken) {
            // Store token in cookie (expires in 24 hours)
            setCookie('fs_access_token', accessToken, 24);
            
            // Clean up URL and redirect to config page
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.href = 'familysearch-config.html';
        } else {
            throw new Error('No access token received');
        }
        
    } catch (error) {
        console.error('Token exchange failed:', error);
        alert('Failed to complete authentication. Please try again.');
        // Reload the page to show the normal interface
        window.location.href = window.location.pathname;
    }
}
