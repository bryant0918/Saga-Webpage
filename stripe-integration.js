// stripe-integration.js - Shared Stripe payment flow
// Reused by FamilySearch and GEDCOM pages via window.paymentFlowConfig hooks.

const CHECKOUT_FORM_STORAGE_KEY_BASE = 'familySagaCheckoutFormDataV1';

window.stripePayment = {
  requestId: null,
  pollingInterval: null,
  maxPollingAttempts: 150, // 150 attempts * 2 seconds = 5 minutes max
  currentAttempt: 0,
  isSubmittingOrder: false,
};

function getPaymentFlowConfig() {
  return window.paymentFlowConfig || {};
}

function getStorageScope() {
  const config = getPaymentFlowConfig();
  return config.storageScope || window.location.pathname;
}

function getCheckoutFormStorageKey() {
  return `${CHECKOUT_FORM_STORAGE_KEY_BASE}:${getStorageScope()}`;
}

function getPaymentForm() {
  const config = getPaymentFlowConfig();
  if (config.formId) {
    return document.getElementById(config.formId);
  }

  return document.getElementById('familySearchForm') || document.getElementById('treeForm');
}

function defaultCollectCheckoutFormData() {
  const getValue = (id) => {
    const element = document.getElementById(id);
    if (!element) return '';
    return typeof element.value === 'string' ? element.value.trim() : element.value;
  };

  const startingPersonInput = document.getElementById('startingPerson');
  const rootPointerInput = document.getElementById('rootPointer');

  return {
    contact_name: getValue('contactName'),
    contact_email: getValue('contactEmail'),
    contact_phone: getValue('contactPhone'),
    starting_person: startingPersonInput
      ? getValue('startingPerson')
      : (rootPointerInput ? getValue('rootPointer') : ''),
    title: getValue('familyName'),
    generations: getValue('generations'),
    tree_type: getValue('treeType'),
    theme: getValue('selectedTheme') || 'royal-heritage',
    user_id: window.accessToken ? 'authenticated' : 'guest',
  };
}

function defaultRestoreCheckoutFormData(formData) {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
      element.value = value;
    }
  };

  setValue('contactName', formData.contact_name);
  setValue('contactEmail', formData.contact_email);
  setValue('contactPhone', formData.contact_phone);

  if (document.getElementById('startingPerson')) {
    setValue('startingPerson', formData.starting_person);
  }

  if (document.getElementById('rootPointer')) {
    setValue('rootPointer', formData.starting_person);
  }

  setValue('familyName', formData.title);
  setValue('treeType', formData.tree_type);

  const treeTypeEl = document.getElementById('treeType');
  if (treeTypeEl) {
    treeTypeEl.dispatchEvent(new Event('change'));
  }

  setValue('generations', formData.generations);
  setValue('selectedTheme', formData.theme);
}

function persistCheckoutFormData(formData) {
  try {
    sessionStorage.setItem(getCheckoutFormStorageKey(), JSON.stringify(formData));
  } catch (error) {
    console.warn('Unable to persist checkout form data:', error);
  }
}

function getPersistedCheckoutFormData() {
  try {
    const raw = sessionStorage.getItem(getCheckoutFormStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Unable to read persisted checkout form data:', error);
    return null;
  }
}

function clearPersistedCheckoutFormData() {
  try {
    sessionStorage.removeItem(getCheckoutFormStorageKey());
  } catch (error) {
    console.warn('Unable to clear persisted checkout form data:', error);
  }
}

function restoreCheckoutFormDataToInputs() {
  const formData = getPersistedCheckoutFormData();
  if (!formData) {
    return;
  }

  const config = getPaymentFlowConfig();
  if (typeof config.restoreCheckoutFormData === 'function') {
    config.restoreCheckoutFormData(formData);
  } else {
    defaultRestoreCheckoutFormData(formData);
  }

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
    const config = getPaymentFlowConfig();
    if (!window.stripePayment.requestId) {
      window.stripePayment.requestId = generateRequestId();
    }

    const requestId = window.stripePayment.requestId;

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
      returnPath:
        typeof config.returnPath === 'string' && config.returnPath.trim()
          ? config.returnPath.trim()
          : window.location.pathname,
    };

    console.log('Creating payment session with data:', paymentData);

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

async function pollPaymentStatus(requestId) {
  try {
    const response = await fetch(`/api/payment-status?requestId=${requestId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error polling payment status:', error);
    return { paid: false, error: error.message };
  }
}

function startPaymentPolling(requestId, onPaymentComplete) {
  console.log('Starting payment polling for request:', requestId);

  window.stripePayment.currentAttempt = 0;

  if (window.stripePayment.pollingInterval) {
    clearInterval(window.stripePayment.pollingInterval);
  }

  showPaymentPollingUI();

  window.stripePayment.pollingInterval = setInterval(async () => {
    window.stripePayment.currentAttempt++;

    console.log(`Polling attempt ${window.stripePayment.currentAttempt}/${window.stripePayment.maxPollingAttempts}`);

    const status = await pollPaymentStatus(requestId);

    if (status.paid) {
      console.log('Payment confirmed:', status);
      stopPaymentPolling();
      onPaymentComplete(status);
    } else if (window.stripePayment.currentAttempt >= window.stripePayment.maxPollingAttempts) {
      console.warn('Polling timeout reached');
      stopPaymentPolling();
      showPaymentTimeoutError();
    }
  }, 2000);
}

function stopPaymentPolling() {
  if (window.stripePayment.pollingInterval) {
    clearInterval(window.stripePayment.pollingInterval);
    window.stripePayment.pollingInterval = null;
  }
}

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
  const form = getPaymentForm();
  const submitButton = form ? form.querySelector('button[type="submit"]') : document.querySelector('button[type="submit"]');

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

async function handleProceedToPayment(event) {
  event.preventDefault();

  try {
    const config = getPaymentFlowConfig();
    const form = getPaymentForm();

    if (!form || !form.checkValidity()) {
      if (form) {
        form.reportValidity();
      }
      return;
    }

    const formData = typeof config.collectCheckoutFormData === 'function'
      ? config.collectCheckoutFormData()
      : defaultCollectCheckoutFormData();

    if (!window.stripePayment.requestId) {
      window.stripePayment.requestId = generateRequestId();
    }

    const requestId = window.stripePayment.requestId;

    if (typeof config.beforeCreatePaymentSession === 'function') {
      await config.beforeCreatePaymentSession({ requestId, formData });
    }

    window.stripePayment.formData = formData;
    persistCheckoutFormData(formData);

    const paymentButton = document.getElementById('proceedToPaymentBtn');
    if (paymentButton) {
      paymentButton.disabled = true;
      paymentButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating payment session...';
    }

    const sessionData = await createPaymentSession(formData);

    console.log('Redirecting to Stripe Checkout:', sessionData.sessionUrl);
    window.location.href = sessionData.sessionUrl;
  } catch (error) {
    console.error('Error proceeding to payment:', error);

    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
      errorMessage.textContent = `Failed to create payment session: ${error.message}`;
      errorMessage.classList.remove('d-none');
    }

    const paymentButton = document.getElementById('proceedToPaymentBtn');
    if (paymentButton) {
      paymentButton.disabled = false;
      paymentButton.innerHTML = '<i class="fas fa-credit-card me-2"></i>Proceed to Payment';
    }
  }
}

async function runPostPaymentSubmission(paymentStatus) {
  const config = getPaymentFlowConfig();
  const callback =
    (typeof config.onPaymentConfirmed === 'function' && config.onPaymentConfirmed) ||
    window.submitFamilyTreeAfterPayment;

  if (typeof callback !== 'function') {
    throw new Error('Submission handler not initialized. Please refresh and try again.');
  }

  await callback(paymentStatus);
}

function checkPaymentReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const requestId = urlParams.get('request_id');

  if (paymentStatus === 'success' && requestId) {
    console.log('Payment return detected, request ID:', requestId);
    window.stripePayment.requestId = requestId;

    startPaymentPolling(requestId, async (status) => {
      showPaymentCompleteUI();
      console.log('Payment flow complete, starting auto-submit:', status);

      if (window.stripePayment.isSubmittingOrder) {
        return;
      }

      window.stripePayment.isSubmittingOrder = true;

      try {
        await runPostPaymentSubmission(status);
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

    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (paymentStatus === 'cancelled') {
    console.log('Payment cancelled by user');
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
      errorMessage.textContent = 'Payment was cancelled. You can try again when ready.';
      errorMessage.classList.remove('d-none');
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  restoreCheckoutFormDataToInputs();

  const config = getPaymentFlowConfig();
  if (typeof config.afterRestoreCheckoutFormData === 'function') {
    config.afterRestoreCheckoutFormData(getPersistedCheckoutFormData());
  }

  checkPaymentReturn();

  if (!window.stripePayment.requestId) {
    window.stripePayment.requestId = generateRequestId();
    console.log('Generated new request ID:', window.stripePayment.requestId);
  }
});

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
  getPaymentFlowConfig,
};

// Keep onclick handler compatibility.
window.handleProceedToPayment = handleProceedToPayment;
