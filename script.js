// script.js - GEDCOM submission flow with shared Stripe payment integration

const GETFORM_ENDPOINT = 'https://getform.io/f/bdrgewgb';
const TREE_BACKEND_BASE_URL = 'https://family-trees.replit.app';
const GEDCOM_FILE_DB_NAME = 'familySagaGedcomPaymentCache';
const GEDCOM_FILE_STORE = 'pendingGedcomFiles';

const AMOUNT_BY_PRODUCT_KEY = {
  ancestry_4: 149,
  ancestry_5: 198,
  descendant_3: 169,
  descendant_4: 218,
};

window.paymentFlowConfig = {
  formId: 'treeForm',
  storageScope: 'gedcom',
  collectCheckoutFormData,
  restoreCheckoutFormData,
  beforeCreatePaymentSession: prepareGedcomFileForCheckout,
  onPaymentConfirmed: submitGedcomAfterPayment,
  afterRestoreCheckoutFormData: hydrateGedcomFileDisplayFromCache,
};

// Shared payment script calls this by default on payment return.
window.submitFamilyTreeAfterPayment = submitGedcomAfterPayment;

function getElementValue(id) {
  const element = document.getElementById(id);
  if (!element) return '';
  return typeof element.value === 'string' ? element.value.trim() : element.value;
}

function resolveThemeSlug(...candidates) {
  if (window.themeUtils && typeof window.themeUtils.resolveThemeSlug === 'function') {
    return window.themeUtils.resolveThemeSlug(...candidates);
  }

  const knownThemes = ['royal-heritage', 'rustic-roots', 'vintage-botanical', 'ancestral-stone'];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (knownThemes.includes(normalized)) {
        return normalized;
      }
    }
  }

  return 'royal-heritage';
}

function mapThemeToBackend(theme) {
  if (window.themeUtils && typeof window.themeUtils.mapThemeToBackend === 'function') {
    return window.themeUtils.mapThemeToBackend(theme);
  }

  const themeMapping = {
    'royal-heritage': 'black',
    'rustic-roots': 'rustic',
    'vintage-botanical': 'green',
    'ancestral-stone': 'stone',
  };
  return themeMapping[theme] || 'black';
}

function collectCheckoutFormData() {
  return {
    contact_name: getElementValue('contactName'),
    contact_email: getElementValue('contactEmail'),
    contact_phone: getElementValue('contactPhone'),
    starting_person: getElementValue('rootPointer'),
    title: getElementValue('familyName'),
    generations: getElementValue('generations'),
    tree_type: getElementValue('treeType'),
    theme: resolveThemeSlug(getElementValue('selectedTheme')),
    user_id: 'guest',
  };
}

function restoreCheckoutFormData(formData) {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
      element.value = value;
    }
  };

  setValue('contactName', formData.contact_name);
  setValue('contactEmail', formData.contact_email);
  setValue('contactPhone', formData.contact_phone);
  setValue('rootPointer', formData.starting_person);
  setValue('familyName', formData.title);
  setValue('treeType', formData.tree_type);

  const treeTypeSelect = document.getElementById('treeType');
  if (treeTypeSelect) {
    treeTypeSelect.dispatchEvent(new Event('change'));
  }

  setValue('generations', formData.generations);
  setValue('selectedTheme', resolveThemeSlug(formData.theme));
}

function openGedcomCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GEDCOM_FILE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GEDCOM_FILE_STORE)) {
        db.createObjectStore(GEDCOM_FILE_STORE, { keyPath: 'requestId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheGedcomFile(requestId, file) {
  const db = await openGedcomCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GEDCOM_FILE_STORE, 'readwrite');
    const store = transaction.objectStore(GEDCOM_FILE_STORE);

    store.put({
      requestId,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      savedAt: Date.now(),
    });

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getCachedGedcomRecord(requestId) {
  if (!requestId) return null;

  const db = await openGedcomCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GEDCOM_FILE_STORE, 'readonly');
    const store = transaction.objectStore(GEDCOM_FILE_STORE);
    const request = store.get(requestId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getCachedGedcomFile(requestId) {
  const record = await getCachedGedcomRecord(requestId);
  if (!record || !record.file) {
    return null;
  }
  return record.file;
}

async function clearCachedGedcomFile(requestId) {
  if (!requestId) return;

  const db = await openGedcomCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GEDCOM_FILE_STORE, 'readwrite');
    const store = transaction.objectStore(GEDCOM_FILE_STORE);
    store.delete(requestId);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function updateGedcomFileDisplay(name, size, fromCache) {
  const fileText = document.querySelector('.file-text');
  const fileDisplay = document.querySelector('.file-input-display');

  if (!fileText || !fileDisplay) {
    return;
  }

  const sizeLabel = size != null ? `${(size / 1024).toFixed(2)} KB` : '';
  const sourceLabel = fromCache
    ? '<small style="color: var(--text-gray);">Restored from secure checkout cache</small>'
    : `<small style="color: var(--text-gray);">Size: ${sizeLabel}</small>`;

  fileText.innerHTML = `
    <strong style="color: var(--gold-primary);">${name}</strong><br>
    ${sourceLabel}
  `;

  fileDisplay.style.borderColor = 'var(--gold-primary)';
  fileDisplay.style.backgroundColor = 'var(--light-black)';
  fileDisplay.classList.add('has-file');
}

async function prepareGedcomFileForCheckout({ requestId }) {
  const fileInput = document.getElementById('gedcomFile');
  const gedcomFile = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!gedcomFile) {
    throw new Error('Please select a GEDCOM file before proceeding to payment.');
  }

  await cacheGedcomFile(requestId, gedcomFile);
}

async function hydrateGedcomFileDisplayFromCache() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('request_id') || (window.stripePayment && window.stripePayment.requestId);
    if (!requestId) return;

    const fileInput = document.getElementById('gedcomFile');
    const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (selectedFile) return;

    const cachedRecord = await getCachedGedcomRecord(requestId);
    if (cachedRecord && cachedRecord.name) {
      updateGedcomFileDisplay(cachedRecord.name, cachedRecord.size, true);
    }
  } catch (error) {
    console.warn('Unable to restore GEDCOM file display from cache:', error);
  }
}

function showLoading() {
  const form = document.getElementById('treeForm');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');

  if (loadingIndicator) loadingIndicator.classList.remove('d-none');
  if (errorMessage) errorMessage.classList.add('d-none');
  if (successMessage) successMessage.classList.add('d-none');

  if (form) {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
  }
}

function hideLoading() {
  const form = document.getElementById('treeForm');
  const loadingIndicator = document.getElementById('loadingIndicator');

  if (loadingIndicator) loadingIndicator.classList.add('d-none');

  if (form) {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = false;
  }
}

function showError(message) {
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');

  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('d-none');
  }
  if (successMessage) {
    successMessage.classList.add('d-none');
  }
}

function showRequestSubmitted() {
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');

  if (successMessage) {
    successMessage.classList.remove('d-none');
  }
  if (errorMessage) {
    errorMessage.classList.add('d-none');
  }
}

function redirectToOrderConfirmation(orderDetails) {
  const params = new URLSearchParams();
  Object.entries(orderDetails).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });
  window.location.href = `order-confirmation.html?${params.toString()}`;
}

async function submitGedcomTreeRequest(options = {}) {
  const {
    skipPaymentVerification = false,
    paymentStatusData = null,
    redirectOnSuccess = true,
    throwOnError = false,
  } = options;

  const contactName = getElementValue('contactName');
  const contactEmail = getElementValue('contactEmail');
  const contactPhone = getElementValue('contactPhone');
  const familyName = getElementValue('familyName');
  const rootPointer = getElementValue('rootPointer');
  const generations = getElementValue('generations');
  const treeType = getElementValue('treeType');
  const selectedTheme = getElementValue('selectedTheme');

  if (!contactName || !contactEmail || !contactPhone) {
    const error = new Error('Please fill in your contact information.');
    showError(error.message);
    if (throwOnError) throw error;
    return null;
  }

  if (!familyName) {
    const error = new Error('Please enter a family name.');
    showError(error.message);
    if (throwOnError) throw error;
    return null;
  }

  const requestId = window.stripePayment && window.stripePayment.requestId;
  if (!requestId) {
    const error = new Error('Payment verification failed: No request ID found. Please refresh and try again.');
    showError(error.message);
    if (throwOnError) throw error;
    return null;
  }

  let paymentStatus = paymentStatusData;

  if (!skipPaymentVerification) {
    try {
      paymentStatus = await window.stripePaymentFunctions.pollPaymentStatus(requestId);
      if (!paymentStatus.paid) {
        const error = new Error('Payment not confirmed. Please complete payment before submitting.');
        showError(error.message);
        if (throwOnError) throw error;
        return null;
      }
    } catch (error) {
      showError('Payment verification failed. Please try again or contact support.');
      if (throwOnError) throw error;
      return null;
    }
  }

  let gedcomFile = null;
  const fileInput = document.getElementById('gedcomFile');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    gedcomFile = fileInput.files[0];
  }

  if (!gedcomFile) {
    gedcomFile = await getCachedGedcomFile(requestId);
  }

  if (!gedcomFile) {
    const error = new Error('GEDCOM file was not found after payment return. Please reselect the file and try again.');
    showError(error.message);
    if (throwOnError) throw error;
    return null;
  }

  let persistedTheme = null;
  try {
    const persistedData = window.stripePaymentFunctions?.getPersistedCheckoutFormData?.();
    if (persistedData && persistedData.theme) {
      persistedTheme = persistedData.theme;
    }
  } catch (error) {
    console.warn('Could not retrieve persisted theme:', error);
  }

  const resolvedThemeSlug = resolveThemeSlug(
    paymentStatus && paymentStatus.theme,
    selectedTheme,
    persistedTheme,
  );

  showLoading();

  try {
    const theme = mapThemeToBackend(resolvedThemeSlug);
    const fileSizeInMB = gedcomFile.size / (1024 * 1024);
    const isSmallFile = fileSizeInMB < 5;

    const formData = new FormData();
    formData.append('contact_name', contactName);
    formData.append('contact_email', contactEmail);
    formData.append('contact_phone', contactPhone || 'Not provided');
    formData.append('title', familyName);
    formData.append('generations', generations);
    formData.append('tree_type', treeType);
    formData.append('root_pointer', rootPointer || 'Auto');
    formData.append('request_type', 'GEDCOM Family Tree Request');
    formData.append('file_size', `${(gedcomFile.size / 1024).toFixed(2)} KB`);
    formData.append('tree_type_display', treeType === 'ancestor' ? 'Ancestor Tree' : 'Descendant Tree');
    formData.append('submission_time', new Date().toLocaleString());
    formData.append('theme', theme);
    formData.append('request_id', requestId);
    formData.append('payment_verified', 'true');
    formData.append(
      'amount_subtotal',
      paymentStatus && paymentStatus.amountSubtotal != null ? String(paymentStatus.amountSubtotal) : '',
    );
    formData.append(
      'coupons_used',
      paymentStatus && Array.isArray(paymentStatus.couponsUsed)
        ? JSON.stringify(paymentStatus.couponsUsed)
        : '[]',
    );
    formData.append(
      'amount_discount',
      paymentStatus && paymentStatus.amountDiscount != null ? String(paymentStatus.amountDiscount) : '',
    );
    formData.append(
      'amount_paid',
      paymentStatus && paymentStatus.amountPaid != null ? String(paymentStatus.amountPaid) : '',
    );
    formData.append(
      'amount_due',
      paymentStatus && paymentStatus.amountDue != null ? String(paymentStatus.amountDue) : '',
    );

    if (isSmallFile) {
      formData.append('gedcom_file', gedcomFile);
    }

    try {
      const getformResponse = await fetch(GETFORM_ENDPOINT, {
        method: 'POST',
        body: formData,
      });
      if (!getformResponse.ok) {
        console.warn(`GetForm submission failed with status ${getformResponse.status}`);
      }
    } catch (getformError) {
      console.warn('GetForm submission skipped due to network error:', getformError);
    }

    if (!isSmallFile) {
      formData.append('gedcom_file', gedcomFile);
    }

    const endpoint = treeType === 'ancestor' ? '/build_tree' : '/build_descendant_tree';
    const response = await fetch(`${TREE_BACKEND_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (parseError) {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }

    const orderDetails = {
      requestId,
      amount:
        paymentStatus && paymentStatus.amount != null
          ? paymentStatus.amount
          : (paymentStatus && paymentStatus.productKey && AMOUNT_BY_PRODUCT_KEY[paymentStatus.productKey]) || '',
      amountSubtotal: paymentStatus && paymentStatus.amountSubtotal != null ? paymentStatus.amountSubtotal : '',
      amountDiscount: paymentStatus && paymentStatus.amountDiscount != null ? paymentStatus.amountDiscount : '',
      amountTotal: paymentStatus && paymentStatus.amountTotal != null ? paymentStatus.amountTotal : '',
      amountPaid: paymentStatus && paymentStatus.amountPaid != null ? paymentStatus.amountPaid : '',
      amountDue: paymentStatus && paymentStatus.amountDue != null ? paymentStatus.amountDue : '',
      couponsUsed:
        paymentStatus && Array.isArray(paymentStatus.couponsUsed)
          ? JSON.stringify(paymentStatus.couponsUsed)
          : '[]',
      currency: paymentStatus && paymentStatus.currency ? paymentStatus.currency : '',
      priceId: paymentStatus && paymentStatus.priceId ? paymentStatus.priceId : '',
      productKey: paymentStatus && paymentStatus.productKey ? paymentStatus.productKey : '',
      customerEmail:
        paymentStatus && paymentStatus.customerEmail ? paymentStatus.customerEmail : contactEmail,
      contactName,
      familyName,
      treeType,
      generations,
      theme: resolvedThemeSlug,
    };

    await clearCachedGedcomFile(requestId);

    if (
      window.stripePaymentFunctions &&
      typeof window.stripePaymentFunctions.clearPersistedCheckoutFormData === 'function'
    ) {
      window.stripePaymentFunctions.clearPersistedCheckoutFormData();
    }

    if (redirectOnSuccess) {
      redirectToOrderConfirmation(orderDetails);
    } else {
      showRequestSubmitted();
    }

    return orderDetails;
  } catch (error) {
    console.error('Error submitting GEDCOM family tree request:', error);
    if (error && error.message === 'Failed to fetch') {
      showError(
        'Failed to reach the tree-processing server. This is usually caused by an extension/ad blocker, VPN/proxy, firewall, or DNS/network filtering on this device. Please allow access to family-trees.replit.app and try again.',
      );
    } else {
      showError(`Failed to submit request: ${error.message}`);
    }

    if (throwOnError) throw error;
    return null;
  } finally {
    hideLoading();
  }
}

async function submitGedcomAfterPayment(paymentStatusData) {
  return submitGedcomTreeRequest({
    skipPaymentVerification: true,
    paymentStatusData,
    redirectOnSuccess: true,
    throwOnError: true,
  });
}

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('treeForm');
  const fileInput = document.getElementById('gedcomFile');
  const fileDisplay = document.querySelector('.file-input-display');
  const fileText = document.querySelector('.file-text');

  if (fileInput && fileDisplay && fileText) {
    fileInput.addEventListener('change', function (event) {
      const file = event.target.files[0];
      if (!file) {
        return;
      }
      updateGedcomFileDisplay(file.name, file.size, false);
    });
  }

  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      await submitGedcomTreeRequest({
        skipPaymentVerification: false,
        redirectOnSuccess: true,
        throwOnError: false,
      });
    });
  }

  hydrateGedcomFileDisplayFromCache();
});
