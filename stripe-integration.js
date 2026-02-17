// stripe-integration.js - Frontend Stripe Payment Integration
// Handles payment session creation, polling, and UI updates

// Global state for payment tracking
const CHECKOUT_FORM_STORAGE_KEY = 'familySagaCheckoutFormDataV1';

window.stripePayment = {
  requestId: null,
  pollingInterval: null,
  maxPollingAttempts: 150, // 150 attempts * 2 seconds = 5 minutes max
  currentAttempt: 0,
  isSubmittingOrder: false,
};

function persistCheckoutFormData(formData) {
  try {
    sessionStorage.setItem(CHECKOUT_FORM_STORAGE_KEY, JSON.stringify(formData));
  } catch (error) {
    console.warn('Unable to persist checkout form data:', error);
  }
}

function getPersistedCheckoutFormData() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_FORM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Unable to read persisted checkout form data:', error);
    return null;
  }
}

function clearPersistedCheckoutFormData() {
  try {
    sessionStorage.removeItem(CHECKOUT_FORM_STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear persisted checkout form data:', error);
  }
}

function restoreCheckoutFormDataToInputs() {
  const formData = getPersistedCheckoutFormData();
  if (!formData) {
    return;
  }

  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
      element.value = value;
    }
  };

  setValue('contactName', formData.contact_name);
  setValue('contactEmail', formData.contact_email);
  setValue('contactPhone', formData.contact_phone);
  setValue('startingPerson', formData.starting_person);
  setValue('familyName', formData.title);
  setValue('treeType', formData.tree_type);

  const treeTypeEl = document.getElementById('treeType');
  if (treeTypeEl) {
    treeTypeEl.dispatchEvent(new Event('change'));
  }

  setValue('generations', formData.generations);
  setValue('selectedTheme', formData.theme);

  window.stripePayment.formData = formData;
}

// Generate a unique request ID using UUID v4 format
function generateRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Create a Stripe payment session
async function createPaymentSession(formData) {
  try {
    // Generate request ID if not already generated
    if (!window.stripePayment.requestId) {
      window.stripePayment.requestId = generateRequestId();
    }

    const requestId = window.stripePayment.requestId;

    // Prepare payment session data
    const paymentData = {
      requestId: requestId,
      treeType: formData.tree_type,
      generations: formData.generations,
      familyName: formData.title,
      contactEmail: formData.contact_email,
      contactName: formData.contact_name,
      contactPhone: formData.contact_phone,
      startingPerson: formData.starting_person,
      theme: formData.theme,
      userId: formData.user_id || 'unknown',
    };

    console.log('Creating payment session with data:', paymentData);

    // Call API to create Stripe Checkout session
    const response = await fetch('/api/create-payment-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Payment session created:', data);

    return data;
  } catch (error) {
    console.error('Error creating payment session:', error);
    throw error;
  }
}

// Poll for payment status
async function pollPaymentStatus(requestId) {
  try {
    const response = await fetch(`/api/payment-status?requestId=${requestId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error polling payment status:', error);
    return { paid: false, error: error.message };
  }
}

// Start polling for payment completion
function startPaymentPolling(requestId, onPaymentComplete) {
  console.log('Starting payment polling for request:', requestId);
  
  // Reset polling state
  window.stripePayment.currentAttempt = 0;
  
  // Clear any existing polling interval
  if (window.stripePayment.pollingInterval) {
    clearInterval(window.stripePayment.pollingInterval);
  }

  // Update UI to show waiting state
  showPaymentPollingUI();

  // Poll every 2 seconds
  window.stripePayment.pollingInterval = setInterval(async () => {
    window.stripePayment.currentAttempt++;

    console.log(`Polling attempt ${window.stripePayment.currentAttempt}/${window.stripePayment.maxPollingAttempts}`);

    const status = await pollPaymentStatus(requestId);

    if (status.paid) {
      // Payment confirmed!
      console.log('Payment confirmed:', status);
      stopPaymentPolling();
      onPaymentComplete(status);
    } else if (window.stripePayment.currentAttempt >= window.stripePayment.maxPollingAttempts) {
      // Polling timeout
      console.warn('Polling timeout reached');
      stopPaymentPolling();
      showPaymentTimeoutError();
    }
  }, 2000); // Poll every 2 seconds
}

// Stop polling
function stopPaymentPolling() {
  if (window.stripePayment.pollingInterval) {
    clearInterval(window.stripePayment.pollingInterval);
    window.stripePayment.pollingInterval = null;
  }
}

// UI Update Functions
function showPaymentPollingUI() {
  const pollingMessage = document.getElementById('paymentPollingMessage');
  if (pollingMessage) {
    pollingMessage.classList.remove('d-none');
  }
}

function hidePaymentPollingUI() {
  const pollingMessage = document.getElementById('paymentPollingMessage');
  if (pollingMessage) {
    pollingMessage.classList.add('d-none');
  }
}

function showPaymentCompleteUI() {
  hidePaymentPollingUI();
  
  const paymentComplete = document.getElementById('paymentCompleteMessage');
  const paymentButton = document.getElementById('proceedToPaymentBtn');
  const submitButton = document.querySelector('button[type="submit"]');

  if (paymentComplete) {
    paymentComplete.innerHTML = `
      <i class="fas fa-check-circle fa-2x mb-2" style="color: var(--gold-primary);"></i><br>
      <strong>Payment Confirmed!</strong><br>
      <small>Submitting your request automatically...</small>
    `;
    paymentComplete.classList.remove('d-none');
  }

  if (paymentButton) {
    paymentButton.style.display = 'none';
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.classList.add('d-none');
    submitButton.style.display = 'none';
  }
}

function showPaymentTimeoutError() {
  hidePaymentPollingUI();
  
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    errorMessage.textContent = 'Payment confirmation timeout. If you completed payment, please wait a moment and refresh the page. Your payment is safe.';
    errorMessage.classList.remove('d-none');
  }
}

// Handle payment button click
async function handleProceedToPayment(event) {
  event.preventDefault();

  try {
    // Validate form
    const form = document.getElementById('familySearchForm');
    if (!form || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Collect form data
    const formData = {
      contact_name: document.getElementById('contactName').value.trim(),
      contact_email: document.getElementById('contactEmail').value.trim(),
      contact_phone: document.getElementById('contactPhone').value.trim(),
      starting_person: document.getElementById('startingPerson').value.trim(),
      title: document.getElementById('familyName').value.trim(),
      generations: document.getElementById('generations').value,
      tree_type: document.getElementById('treeType').value,
      theme: document.getElementById('selectedTheme').value,
      user_id: window.accessToken ? 'authenticated' : 'guest',
    };

    // Store form data for later submission
    window.stripePayment.formData = formData;
    persistCheckoutFormData(formData);

    // Disable payment button
    const paymentButton = document.getElementById('proceedToPaymentBtn');
    if (paymentButton) {
      paymentButton.disabled = true;
      paymentButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating payment session...';
    }

    // Create payment session
    const sessionData = await createPaymentSession(formData);

    // Redirect to Stripe Checkout
    console.log('Redirecting to Stripe Checkout:', sessionData.sessionUrl);
    window.location.href = sessionData.sessionUrl;

  } catch (error) {
    console.error('Error proceeding to payment:', error);
    
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
      errorMessage.textContent = `Failed to create payment session: ${error.message}`;
      errorMessage.classList.remove('d-none');
    }

    // Re-enable payment button
    const paymentButton = document.getElementById('proceedToPaymentBtn');
    if (paymentButton) {
      paymentButton.disabled = false;
      paymentButton.innerHTML = '<i class="fas fa-credit-card me-2"></i>Proceed to Payment';
    }
  }
}

// Check URL for payment return
function checkPaymentReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const requestId = urlParams.get('request_id');

  if (paymentStatus === 'success' && requestId) {
    console.log('Payment return detected, request ID:', requestId);
    window.stripePayment.requestId = requestId;
    
    // Start polling for payment confirmation
    startPaymentPolling(requestId, async (status) => {
      showPaymentCompleteUI();
      console.log('Payment flow complete, starting auto-submit:', status);

      if (window.stripePayment.isSubmittingOrder) {
        return;
      }

      window.stripePayment.isSubmittingOrder = true;

      try {
        if (typeof window.submitFamilyTreeAfterPayment !== 'function') {
          throw new Error('Submission handler not initialized. Please refresh and try again.');
        }
        await window.submitFamilyTreeAfterPayment(status);
      } catch (error) {
        console.error('Auto-submission failed after payment:', error);
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
          errorMessage.textContent = `Payment confirmed, but request submission failed: ${error.message}`;
          errorMessage.classList.remove('d-none');
        }
      } finally {
        window.stripePayment.isSubmittingOrder = false;
      }
    });

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (paymentStatus === 'cancelled') {
    console.log('Payment cancelled by user');
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
      errorMessage.textContent = 'Payment was cancelled. You can try again when ready.';
      errorMessage.classList.remove('d-none');
    }
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize payment integration on page load
document.addEventListener('DOMContentLoaded', function() {
  // Restore form values from pre-checkout state before payment-return handling.
  restoreCheckoutFormDataToInputs();

  // Check if returning from payment
  checkPaymentReturn();

  // Initialize request ID
  if (!window.stripePayment.requestId) {
    window.stripePayment.requestId = generateRequestId();
    console.log('Generated new request ID:', window.stripePayment.requestId);
  }
});

// Export functions for use in other scripts
window.stripePaymentFunctions = {
  generateRequestId,
  createPaymentSession,
  pollPaymentStatus,
  startPaymentPolling,
  stopPaymentPolling,
  handleProceedToPayment,
  checkPaymentReturn,
  showPaymentCompleteUI,
  getPersistedCheckoutFormData,
  clearPersistedCheckoutFormData,
};
