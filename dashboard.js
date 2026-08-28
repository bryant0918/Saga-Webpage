// dashboard.js - Charts-first dashboard.
//
// The organising object is a *chart order*, not a tree cache. A customer thinks
// "I want a chart of my grandparents", not "I want to sync a tree context and
// then build from it", so the grid lists charts and the tree cache is an
// implementation detail the wizard fills in on their behalf.
//
// Three views swap in place: the charts grid, the new-chart wizard, and the
// per-chart people editor.

var SECTION_TO_JSON_TYPE = {
    kids: 'kids',
    husb: 'husb',
    wife: 'wife',
    desc: 'desc',
    sibs: 'sibs'
};

var POLL_INTERVAL_MS = 4000;
var POLL_TIMEOUT_MS = 10 * 60 * 1000;

var state = {
    person: null,
    orders: [],
    activeOrderId: null,
    pollTimer: null,
    wizard: null,
    // Editor state, consumed by tree-renderer.js
    contextId: null,
    lookupTitle: 'User Tree',
    treeData: { kids: null, husb: null, wife: null, sibs: null, desc: null, metadata: null },
    expandedPersonId: null,
    editingField: null,
    pendingImageEdit: null,
    personNames: {}
};

/* ------------------------------------------------------------------ utils */

function escapeAttr(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatName(nameValue) {
    if (Array.isArray(nameValue)) {
        return nameValue.filter(Boolean).join(' ') || 'Unknown';
    }
    if (typeof nameValue === 'string' && nameValue.trim()) {
        return nameValue.trim();
    }
    return 'Unknown';
}

function getImageName(imagePath) {
    if (!imagePath) return null;
    var parts = String(imagePath).replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || null;
}

function learnPersonName(personId, name) {
    if (personId && name && name !== 'Unknown') {
        state.personNames[personId] = name;
    }
}

function setGlobalMessage(message, kind) {
    var el = document.getElementById('globalMessage');
    if (!el) return;
    if (!message) {
        el.className = 'alert d-none';
        el.textContent = '';
        return;
    }
    var variant = kind === 'error' ? 'alert-danger' : kind === 'success' ? 'alert-success' : 'alert-info';
    el.className = 'alert ' + variant;
    el.textContent = message;
}

function setEditorMessage(message, isError) {
    var el = document.getElementById('editorMessage');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#ffb4b4' : 'var(--text-dark-gray)';
}

function showView(name) {
    ['chartsView', 'wizardView', 'editorView'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = id === name + 'View' ? '' : 'none';
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------- chart grid */

function statusLabel(order) {
    if (order.status === 'failed') return { text: 'Failed', cls: 'status-failed' };
    if (order.status === 'building') return { text: 'Building', cls: 'status-building' };
    if (order.is_unlocked) return { text: 'Purchased', cls: 'status-paid' };
    return { text: 'Proof ready', cls: 'status-proof' };
}

function renderCharts() {
    var grid = document.getElementById('chartsGrid');
    if (!grid) return;

    if (!state.orders.length) {
        grid.innerHTML =
            '<div class="col-12">' +
            '<div class="text-center py-5" style="border: 1px dashed var(--light-black); border-radius: 12px;">' +
            '<i class="fas fa-tree fa-3x mb-3" style="color: var(--gold-primary); opacity: 0.5;"></i>' +
            '<h4 style="color: var(--text-gray);">No charts yet</h4>' +
            '<p style="color: var(--text-dark-gray);">Create your first chart and we will send you a free proof to review.</p>' +
            '<button class="btn btn-warning" onclick="startWizard()"><i class="fas fa-plus me-2"></i>Create a chart</button>' +
            '</div></div>';
        return;
    }

    var html = '';
    state.orders.forEach(function (order) {
        var badge = statusLabel(order);
        var typeLabel = order.tree_type === 'ancestor' ? 'Ancestor' : 'Descendant';
        var themeName = window.Pricing.themeDisplayName(order.theme);
        var price = order.price_usd;

        html += '<div class="col-md-6 col-xl-4">';
        html += '<div class="chart-card">';

        html += '<div class="chart-card-preview">';
        if (order.status === 'building') {
            html += '<div class="text-center"><div class="spinner-border text-warning mb-2" role="status"></div>' +
                '<div class="small" style="color: var(--text-dark-gray);">Building your chart...</div></div>';
        } else if (order.status === 'failed') {
            html += '<i class="fas fa-triangle-exclamation fa-2x" style="color: #fca5a5;"></i>';
        } else {
            html += '<i class="fas fa-file-pdf fa-3x" style="color: var(--gold-primary); opacity: 0.6;"></i>';
        }
        html += '</div>';

        html += '<div class="chart-card-body">';
        html += '<div class="d-flex justify-content-between align-items-start mb-2">';
        html += '<h5 class="mb-0" style="color: var(--gold-primary);">' + escapeAttr(order.title) + '</h5>';
        html += '<span class="status-badge ' + badge.cls + '">' + badge.text + '</span>';
        html += '</div>';
        html += '<div class="small mb-1" style="color: var(--text-gray);">' + typeLabel + ' &middot; ' +
            escapeAttr(order.max_generations) + ' generations</div>';
        html += '<div class="small" style="color: var(--text-dark-gray);">' + escapeAttr(themeName) + '</div>';

        if (order.status === 'failed' && order.error_message) {
            html += '<div class="small mt-2" style="color: #fca5a5;">' + escapeAttr(order.error_message) + '</div>';
        }

        html += '<div class="chart-card-actions">';
        if (order.status === 'ready') {
            html += '<button class="btn btn-sm btn-outline-warning" onclick="downloadChart(\'' +
                escapeAttr(order.order_id) + '\',\'proof\')"><i class="fas fa-eye me-1"></i>View proof</button>';
            html += '<button class="btn btn-sm btn-outline-secondary" onclick="openEditor(\'' +
                escapeAttr(order.order_id) + '\')"><i class="fas fa-pen me-1"></i>Edit</button>';
            if (order.is_unlocked) {
                html += '<button class="btn btn-sm btn-warning" onclick="downloadChart(\'' +
                    escapeAttr(order.order_id) + '\',\'final\')"><i class="fas fa-download me-1"></i>Print file</button>';
            } else {
                html += '<button class="btn btn-sm btn-warning" onclick="buyChart(\'' +
                    escapeAttr(order.order_id) + '\')"><i class="fas fa-lock-open me-1"></i>Buy' +
                    (price ? ' $' + price : '') + '</button>';
            }
        } else if (order.status === 'failed') {
            html += '<button class="btn btn-sm btn-outline-warning" onclick="regenerateChart(\'' +
                escapeAttr(order.order_id) + '\')"><i class="fas fa-rotate me-1"></i>Try again</button>';
        }
        html += '</div>';

        html += '</div></div></div>';
    });

    grid.innerHTML = html;
}

async function loadOrders() {
    // Callers include the poll timer and post-checkout handler, which can fire
    // after a session failure has left state.person unset.
    if (!state.person) return;

    try {
        var result = await window.FsAuth.postJson('/orders/list', {
            user_scope_id: state.person.scopeId
        });
        state.orders = (result && result.orders) || [];
        renderCharts();
        maybeStartPolling();
    } catch (error) {
        console.error('Failed to load charts:', error);
        var grid = document.getElementById('chartsGrid');
        if (grid) {
            grid.innerHTML = '<div class="col-12 text-center py-5">' +
                '<i class="fas fa-triangle-exclamation fa-2x mb-3" style="color: #fca5a5;"></i>' +
                '<p style="color: #fca5a5;">Could not load your charts. ' + escapeAttr(error.message) + '</p></div>';
        }
    }
}

/** Poll while any chart is still building, then stop. */
function maybeStartPolling() {
    var building = state.orders.some(function (order) {
        return order.status === 'building';
    });

    if (!building) {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
        return;
    }

    if (state.pollTimer) return;

    var startedAt = Date.now();
    var tick = async function () {
        state.pollTimer = null;
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setGlobalMessage(
                'A chart is taking longer than expected. Refresh in a few minutes, or email us if it stays stuck.',
                'error'
            );
            return;
        }
        await loadOrders();
        if (
            state.orders.some(function (order) {
                return order.status === 'building';
            })
        ) {
            state.pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
        }
    };
    state.pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

function findOrder(orderId) {
    return state.orders.filter(function (order) {
        return order.order_id === orderId;
    })[0];
}

/* --------------------------------------------------------- chart actions */

async function downloadChart(orderId, variant) {
    var order = findOrder(orderId);
    setGlobalMessage('Preparing your download...', 'info');
    try {
        var blob = await window.FsAuth.postForBlob('/orders/download', {
            user_scope_id: state.person.scopeId,
            order_id: orderId,
            variant: variant
        });
        var suffix = variant === 'proof' ? '_PROOF' : '';
        var title = (order && order.title ? order.title : 'Family').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '_');
        window.FsAuth.saveBlob(blob, title + '_Chart' + suffix + '.pdf');
        setGlobalMessage('', null);
    } catch (error) {
        if (error.status === 402) {
            setGlobalMessage('That chart has not been purchased yet.', 'error');
            return;
        }
        setGlobalMessage('Download failed: ' + error.message, 'error');
    }
}

async function buyChart(orderId) {
    var order = findOrder(orderId);
    if (!order) return;

    setGlobalMessage('Opening secure checkout...', 'info');
    try {
        var response = await fetch('/api/create-payment-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestId: orderId,
                orderId: orderId,
                treeType: order.tree_type,
                generations: order.max_generations,
                familyName: order.title,
                contactEmail: order.contact_email,
                contactName: order.contact_name || (state.person && state.person.name),
                contactPhone: '',
                startingPerson: order.context_id,
                theme: order.theme,
                userId: state.person.scopeId,
                returnPath: '/dashboard'
            })
        });

        if (!response.ok) {
            var errorBody = await response.json().catch(function () {
                return {};
            });
            throw new Error(errorBody.error || 'Could not start checkout');
        }

        var session = await response.json();
        window.location.href = session.sessionUrl;
    } catch (error) {
        setGlobalMessage('Could not open checkout: ' + error.message, 'error');
    }
}

async function regenerateChart(orderId) {
    var order = findOrder(orderId);
    if (!order) return;

    setGlobalMessage('Rebuilding your chart...', 'info');
    try {
        await window.FsAuth.postJson('/build_chart', {
            user_scope_id: state.person.scopeId,
            context_id: order.context_id,
            tree_type: order.tree_type,
            theme: order.theme,
            title: order.title,
            max_generations: order.max_generations,
            contact_email: order.contact_email,
            contact_name: order.contact_name
        });
        setGlobalMessage('Rebuilding. Your updated proof will be emailed when it is ready.', 'success');
        showView('charts');
        await loadOrders();
    } catch (error) {
        setGlobalMessage('Could not rebuild: ' + error.message, 'error');
    }
}

/* ------------------------------------------------------------- the wizard */

function defaultWizard() {
    return {
        step: 1,
        source: 'familysearch',
        startingPersonId: state.person ? state.person.id : '',
        gedcomFile: null,
        rootPointer: '',
        treeType: 'ancestor',
        generations: 5,
        theme: 'royal-heritage',
        familyName: '',
        contactName: state.person ? state.person.name : '',
        contactEmail: ''
    };
}

function startWizard() {
    state.wizard = defaultWizard();

    var lastName = (state.person.name || '').trim().split(/\s+/).pop() || '';
    state.wizard.familyName = lastName;

    var nameInput = document.getElementById('wizardContactName');
    if (nameInput) nameInput.value = state.wizard.contactName;
    var familyInput = document.getElementById('wizardFamilyName');
    if (familyInput) familyInput.value = lastName;

    syncGenerationOptions();
    goToStep(1);
    showView('wizard');
    populateStartingPeople();
}

function goToStep(step) {
    state.wizard.step = step;
    document.querySelectorAll('.wizard-panel').forEach(function (panel) {
        panel.style.display = Number(panel.getAttribute('data-step')) === step ? '' : 'none';
    });
    document.querySelectorAll('.wizard-step').forEach(function (el) {
        var index = Number(el.getAttribute('data-step-label'));
        el.classList.toggle('active', index === step);
        el.classList.toggle('done', index < step);
    });
    if (step === 3) renderWizardSummary();
}

function syncGenerationOptions() {
    var select = document.getElementById('wizardGenerations');
    if (!select) return;
    var options = window.Pricing.GENERATION_OPTIONS[state.wizard.treeType] || [];
    select.innerHTML = '';
    options.forEach(function (count) {
        var option = document.createElement('option');
        option.value = String(count);
        option.textContent = count + ' generations';
        select.appendChild(option);
    });
    state.wizard.generations = options[0];
    select.value = String(options[0]);
}

async function populateStartingPeople() {
    var select = document.getElementById('wizardStartingPerson');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Loading your family...</option>';

    var people = [{ id: state.person.id, name: state.person.name + ' (you)' }];

    try {
        var result = await window.FsAuth.postJson('/people/family', {
            root_person_id: state.person.id
        });
        (result && result.people ? result.people : []).forEach(function (person) {
            if (!person.id || person.id === state.person.id) return;
            var relation = person.relation ? ' - ' + person.relation : '';
            people.push({ id: person.id, name: person.name + relation });
            learnPersonName(person.id, person.name);
        });
    } catch (error) {
        // A failed lookup is not fatal: the manual ID entry still works.
        console.warn('Could not load family list:', error);
    }

    select.innerHTML = '';
    people.forEach(function (person) {
        var option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name + ' (' + person.id + ')';
        select.appendChild(option);
    });
    var manual = document.createElement('option');
    manual.value = '__other__';
    manual.textContent = 'Someone else (enter a FamilySearch ID)';
    select.appendChild(manual);

    select.value = state.wizard.startingPersonId || state.person.id;
}

function renderWizardSummary() {
    var wizard = state.wizard;
    var container = document.getElementById('wizardSummary');
    if (!container) return;

    var backendTheme = window.Pricing.mapThemeToBackend(wizard.theme);
    var price = window.Pricing.calculateTreePrice(wizard.treeType, wizard.generations);
    var subject =
        wizard.source === 'gedcom'
            ? wizard.gedcomFile
                ? wizard.gedcomFile.name
                : 'GEDCOM upload'
            : state.personNames[wizard.startingPersonId] || wizard.startingPersonId;

    var rows = [
        ['Centered on', subject],
        ['Chart type', wizard.treeType === 'ancestor' ? 'Ancestor chart' : 'Descendant chart'],
        ['Generations', String(wizard.generations)],
        ['Design', window.Pricing.themeDisplayName(backendTheme)],
        ['Family name', wizard.familyName || '(none)'],
        ['Print files', price ? '$' + price + ' when you are ready' : 'Quoted after generation']
    ];

    var html = '<table class="table table-sm" style="color: var(--text-gray);"><tbody>';
    rows.forEach(function (row) {
        html += '<tr><td style="color: var(--text-dark-gray); width: 40%;">' + escapeAttr(row[0]) +
            '</td><td>' + escapeAttr(row[1]) + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function setWizardError(message) {
    var el = document.getElementById('wizardError');
    if (!el) return;
    if (!message) {
        el.classList.add('d-none');
        el.textContent = '';
        return;
    }
    el.textContent = message;
    el.classList.remove('d-none');
}

function validateStep(step) {
    var wizard = state.wizard;
    if (step === 1) {
        if (wizard.source === 'gedcom') {
            if (!wizard.gedcomFile) return 'Choose a GEDCOM file to upload.';
            return null;
        }
        if (!wizard.startingPersonId) return 'Choose who the chart is about.';
        return null;
    }
    if (step === 2) {
        if (!wizard.familyName.trim()) return 'Enter the family name to print on the chart.';
        return null;
    }
    return null;
}

async function submitWizard() {
    var wizard = state.wizard;

    wizard.contactName = (document.getElementById('wizardContactName') || {}).value || '';
    wizard.contactEmail = ((document.getElementById('wizardContactEmail') || {}).value || '').trim();

    if (!wizard.contactEmail) {
        setWizardError('Enter an email address so we can send you the proof.');
        return;
    }

    var button = document.getElementById('wizardGenerateBtn');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Preparing your data...';
    }
    setWizardError('');

    try {
        var contextId;

        if (wizard.source === 'gedcom') {
            var formData = new FormData();
            formData.append('gedcom_file', wizard.gedcomFile);
            formData.append('user_scope_id', state.person.scopeId);
            formData.append('title', wizard.familyName);
            formData.append('root_pointer', wizard.rootPointer || '');
            formData.append('ancestor_generations', String(wizard.treeType === 'ancestor' ? wizard.generations : 4));
            formData.append('descendant_generations', String(wizard.treeType === 'descendant' ? wizard.generations : 3));

            var imported = await window.FsAuth.postFormData('/people/tree/import-gedcom', formData);
            contextId = imported.context_id;
        } else {
            if (button) button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Reading your FamilySearch tree...';
            var synced = await window.FsAuth.postJson('/people/tree/sync', {
                user_scope_id: state.person.scopeId,
                root_person_id: wizard.startingPersonId,
                title: wizard.familyName,
                ancestor_generations: wizard.treeType === 'ancestor' ? wizard.generations : 4,
                descendant_generations: wizard.treeType === 'descendant' ? wizard.generations : 3,
                include_spouse: true
            });
            contextId = synced.context_id;
        }

        if (button) button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Building your chart...';

        await window.FsAuth.postJson('/build_chart', {
            user_scope_id: state.person.scopeId,
            context_id: contextId,
            tree_type: wizard.treeType,
            theme: window.Pricing.mapThemeToBackend(wizard.theme),
            title: wizard.familyName,
            max_generations: wizard.generations,
            contact_email: wizard.contactEmail,
            contact_name: wizard.contactName
        });

        showView('charts');
        setGlobalMessage(
            'Building your chart now. We will email your proof to ' + wizard.contactEmail +
                ' as soon as it is ready, usually within a couple of minutes.',
            'success'
        );
        await loadOrders();
    } catch (error) {
        setWizardError(error.message || 'Something went wrong. Please try again.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-wand-magic-sparkles me-2"></i>Generate my proof';
        }
    }
}

/* ------------------------------------------------------------ the editor */

function getLookupPayload() {
    return {
        title: state.lookupTitle || 'User Tree',
        family_search_id: state.contextId,
        user_scope_id: state.person.scopeId,
        context_id: state.contextId
    };
}

async function openEditor(orderId) {
    var order = findOrder(orderId);
    if (!order) return;

    state.activeOrderId = orderId;
    state.contextId = order.context_id;
    state.lookupTitle = order.title;

    document.getElementById('editorTitle').textContent = order.title;
    document.getElementById('editorMeta').textContent =
        (order.tree_type === 'ancestor' ? 'Ancestor chart' : 'Descendant chart') +
        ' · ' + order.max_generations + ' generations · ' +
        window.Pricing.themeDisplayName(order.theme);

    var actions = document.getElementById('editorActions');
    actions.innerHTML =
        '<button class="btn btn-outline-warning btn-sm" onclick="downloadChart(\'' + escapeAttr(orderId) +
        '\',\'proof\')"><i class="fas fa-eye me-1"></i>View proof</button>' +
        '<button class="btn btn-warning btn-sm" onclick="regenerateChart(\'' + escapeAttr(orderId) +
        '\')"><i class="fas fa-rotate me-1"></i>Regenerate chart</button>';

    showView('editor');
    await loadTreeData();
}

async function fetchTreeSection(endpoint) {
    return window.FsAuth.postJson('/people/tree/' + endpoint, getLookupPayload(), {
        treat404AsNull: true
    });
}

async function loadTreeData() {
    var container = document.getElementById('dataListContainer');
    if (!container) return;

    container.innerHTML =
        '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"></div>' +
        '<p style="color: var(--text-gray);">Loading the people on this chart...</p></div>';

    try {
        var results = await Promise.allSettled([
            fetchTreeSection('kids'),
            fetchTreeSection('husb'),
            fetchTreeSection('wife'),
            fetchTreeSection('siblings'),
            fetchTreeSection('descendants'),
            fetchTreeSection('metadata')
        ]);

        var keys = ['kids', 'husb', 'wife', 'sibs', 'desc', 'metadata'];
        keys.forEach(function (key, index) {
            state.treeData[key] = results[index].status === 'fulfilled' ? results[index].value : null;
        });

        ['kids', 'husb', 'wife', 'sibs', 'desc'].forEach(function (section) {
            var data = state.treeData[section];
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(function (personId) {
                    if (data[personId] && data[personId].name) {
                        learnPersonName(personId, formatName(data[personId].name));
                    }
                });
            }
        });

        renderDataList();
        setEditorMessage('');
    } catch (error) {
        container.innerHTML =
            '<div class="text-center py-5"><i class="fas fa-triangle-exclamation fa-2x mb-3" style="color: #fca5a5;"></i>' +
            '<p style="color: #fca5a5;">Could not load this chart\'s people.</p></div>';
        setEditorMessage(error.message, true);
    }
}

function renderDataList() {
    var container = document.getElementById('dataListContainer');
    if (!container) return;

    var data = state.treeData;
    if (!data.kids && !data.husb && !data.wife && !data.sibs && !data.desc) {
        container.innerHTML =
            '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No people cached for this chart yet.</p></div>';
        return;
    }

    container.innerHTML =
        window.TreeRenderer.renderAllSections(data) ||
        '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No visible people.</p></div>';
}

function startEdit(fieldKey) {
    state.editingField = fieldKey;
    renderDataList();
    setTimeout(function () {
        var input = document.getElementById('edit-input-' + fieldKey.replace(/[^a-zA-Z0-9]/g, '_'));
        if (input) input.focus();
    }, 50);
}

function cancelEdit() {
    state.editingField = null;
    renderDataList();
}

async function saveFieldEdit(section, personId, fieldName, newValue) {
    var syncToFs = confirm('Also update this change on FamilySearch?');

    var payload = getLookupPayload();
    payload.json_type = SECTION_TO_JSON_TYPE[section];
    payload.individual_id = personId;
    payload[fieldName] = newValue;
    if (syncToFs) {
        payload.sync_to_familysearch = true;
    }

    try {
        var response = await window.FsAuth.postJson('/people/tree/update', payload);
        var person = state.treeData[section] && state.treeData[section][personId];
        if (response && response.updated && person) {
            if (fieldName === 'first_name' || fieldName === 'last_name') {
                if (!Array.isArray(person.name)) person.name = ['', ''];
                person.name[fieldName === 'first_name' ? 0 : 1] = newValue;
            } else {
                person[fieldName] = newValue;
            }
        }
        state.editingField = null;
        renderDataList();

        var message = 'Saved.';
        if (response && response.familysearch_sync === 'success') {
            message += ' Also updated on FamilySearch.';
        } else if (response && response.familysearch_sync) {
            message += ' (FamilySearch sync failed)';
        }
        setEditorMessage(message);
    } catch (error) {
        setEditorMessage('Could not save: ' + error.message, true);
    }
}

function triggerImageUpload(section, personId) {
    state.pendingImageEdit = { section: section, personId: personId };
    var input = document.getElementById('imageUploadInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function triggerCoupleImageUpload(personId, spouseId) {
    state.pendingImageEdit = { coupleUpload: true, personId: personId, spouseId: spouseId };
    var input = document.getElementById('imageUploadInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function handleImageFileSelected(input) {
    if (!input.files || !input.files[0] || !state.pendingImageEdit) return;
    var file = input.files[0];
    var info = state.pendingImageEdit;
    state.pendingImageEdit = null;

    var cropOptions = info.coupleUpload ? { aspectRatio: 4 / 3 } : {};
    showCropModal(file, cropOptions).then(function (croppedBlob) {
        if (!croppedBlob) return;
        var croppedFile = new File([croppedBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg'
        });
        if (info.coupleUpload) {
            uploadCoupleImage(info.personId, info.spouseId, croppedFile);
        } else {
            uploadPersonImage(info.section, info.personId, croppedFile);
        }
    });
}

function buildLookupFormData() {
    var payload = getLookupPayload();
    var formData = new FormData();
    formData.append('title', payload.title);
    formData.append('family_search_id', payload.family_search_id);
    formData.append('user_scope_id', payload.user_scope_id);
    formData.append('context_id', payload.context_id);
    return formData;
}

async function uploadPersonImage(section, personId, file) {
    var syncChoice = promptFsSyncForImage();
    var formData = buildLookupFormData();
    formData.append('json_type', SECTION_TO_JSON_TYPE[section]);
    formData.append('individual_id', personId);
    formData.append('image', file);

    if (syncChoice) {
        formData.append('sync_to_familysearch', 'true');
        if (syncChoice === 'portrait') formData.append('set_as_portrait', 'true');
    }

    try {
        var result = await window.FsAuth.postFormData('/people/tree/update-image', formData);
        var person = state.treeData[section] && state.treeData[section][personId];
        if (result.updated_image_path && person) {
            person.image = result.updated_image_path;
        }
        renderDataList();
        setEditorMessage('Photo updated. Regenerate the chart to see it on the proof.');
    } catch (error) {
        setEditorMessage('Photo upload failed: ' + error.message, true);
    }
}

async function uploadCoupleImage(personId, spouseId, file) {
    var formData = buildLookupFormData();
    formData.append('person_id', personId);
    formData.append('spouse_id', spouseId);
    formData.append('image', file);

    try {
        var result = await window.FsAuth.postFormData('/people/tree/update-couple-image', formData);
        var desc = state.treeData.desc;
        if (result.updated_couple_image_path && desc) {
            if (desc[personId]) desc[personId].couple_image = result.updated_couple_image_path;
            if (desc[spouseId]) desc[spouseId].couple_image = result.updated_couple_image_path;
        }
        renderDataList();
        setEditorMessage('Couple photo updated. Regenerate the chart to see it on the proof.');
    } catch (error) {
        setEditorMessage('Couple photo upload failed: ' + error.message, true);
    }
}

function promptFsSyncForImage() {
    if (!confirm('Also add this photo to FamilySearch?')) return null;
    return confirm('Set it as their FamilySearch profile picture?\n\nOK = profile picture, Cancel = upload only')
        ? 'portrait'
        : 'upload';
}

function loadPersonImage(imgElementId, imageName) {
    if (!imageName) return;
    var payload = getLookupPayload();
    payload.image_name = imageName;

    window.FsAuth.postForBlob('/people/tree/image', payload)
        .then(function (blob) {
            var img = document.getElementById(imgElementId);
            if (img) {
                img.src = URL.createObjectURL(blob);
                img.style.display = '';
            }
        })
        .catch(function () {
            var img = document.getElementById(imgElementId);
            if (img) img.style.display = 'none';
        });
}

function loadCoupleImage(imgElementId, coupleImagePath) {
    var imageName = getImageName(coupleImagePath);
    if (!imageName) return;
    var payload = getLookupPayload();
    payload.image_name = imageName;

    window.FsAuth.postForBlob('/people/tree/image', payload)
        .then(function (blob) {
            var img = document.getElementById(imgElementId);
            var placeholder = document.getElementById(imgElementId + '_placeholder');
            if (img) {
                img.src = URL.createObjectURL(blob);
                img.style.display = '';
                if (placeholder) placeholder.style.display = 'none';
            }
        })
        .catch(function () {
            var placeholder = document.getElementById(imgElementId + '_placeholder');
            if (placeholder) {
                placeholder.innerHTML = '<i class="fas fa-image"></i> Upload Couple Photo';
            }
        });
}

async function refreshPerson(section, personId) {
    if (!confirm("Re-fetch this person from FamilySearch? Unsynced local edits will be overwritten.")) return;

    var payload = getLookupPayload();
    payload.json_type = SECTION_TO_JSON_TYPE[section] || section;
    payload.individual_id = personId;

    try {
        var response = await window.FsAuth.postJson('/people/tree/refresh-person', payload);
        if (response && response.updated) {
            if (!state.treeData[section]) state.treeData[section] = {};
            state.treeData[section][personId] = response.updated;
            if (response.updated.name) learnPersonName(personId, formatName(response.updated.name));
        }
        renderDataList();
        setEditorMessage('Refreshed from FamilySearch.');
    } catch (error) {
        setEditorMessage('Refresh failed: ' + error.message, true);
    }
}

async function submitAddPerson() {
    var getValue = function (id) {
        var el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    };

    var mode = getValue('addPersonMode');
    var personId = getValue('addPersonId');
    var errorEl = document.getElementById('addPersonError');

    var firstName = '';
    var lastName = '';
    var birth = '';
    var gender = 'Male';

    if (mode === 'new') {
        firstName = getValue('addPersonFirstName');
        lastName = getValue('addPersonLastName');
        gender = getValue('addPersonGender') || 'Male';
        birth = getValue('addPersonBirth');
        if (!firstName) {
            if (errorEl) {
                errorEl.textContent = 'First name is required.';
                errorEl.style.display = '';
            }
            return;
        }
    } else if (!personId) {
        if (errorEl) {
            errorEl.textContent = 'No person selected.';
            errorEl.style.display = '';
        }
        return;
    }

    var includeSpouse = false;
    var spouseConfirm = document.getElementById('addPersonSpouseConfirm');
    if (spouseConfirm && spouseConfirm.style.display !== 'none') {
        var checkbox = document.getElementById('addPersonIncludeSpouse');
        includeSpouse = Boolean(checkbox && checkbox.checked);
    }

    var createOnFs = mode === 'new' && confirm('Also create this person on FamilySearch?\n\nOK = create on FamilySearch, Cancel = add to this chart only');

    var payload = getLookupPayload();
    payload.person_id = personId;
    payload.first_name = firstName;
    payload.last_name = lastName;
    payload.gender = gender;
    payload.birth = birth;
    payload.relationship = getValue('addPersonRelationship');
    payload.relative_id = getValue('addPersonRelativeId');
    payload.data_type = getValue('addPersonSection');
    payload.mode = mode;
    payload.include_spouse = includeSpouse;
    payload.create_on_fs = createOnFs;

    try {
        var result = await window.FsAuth.postJson('/people/tree/add-person', payload);
        var modalEl = document.getElementById('addPersonModal');
        var modal = modalEl && bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        if (result.person_name) learnPersonName(result.person_id, result.person_name);
        await loadTreeData();
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = error.message;
            errorEl.style.display = '';
        }
    }
}

// Contract consumed by tree-renderer.js.
window.TreeRendererConfig = {
    getState: function () {
        return {
            expandedPersonId: state.expandedPersonId,
            editingField: state.editingField,
            treeData: state.treeData
        };
    },
    togglePersonDetail: function (key) {
        state.expandedPersonId = state.expandedPersonId === key ? null : key;
        state.editingField = null;
        renderDataList();
    },
    startEdit: startEdit,
    cancelEdit: cancelEdit,
    saveFieldEdit: saveFieldEdit,
    triggerImageUpload: triggerImageUpload,
    triggerCoupleImageUpload: triggerCoupleImageUpload,
    loadPersonImage: loadPersonImage,
    loadCoupleImage: loadCoupleImage,
    getPersonName: function (personId) {
        var sections = ['husb', 'wife', 'kids', 'sibs', 'desc'];
        for (var i = 0; i < sections.length; i++) {
            var data = state.treeData[sections[i]];
            if (data && data[personId] && data[personId].name) {
                return formatName(data[personId].name);
            }
        }
        return state.personNames[personId] || '';
    },
    // Re-centering the chart is now a new-chart decision, not an in-place one,
    // so this points the customer at the wizard instead of silently swapping
    // the tree under an existing order.
    selectAsStartingPerson: function (personId) {
        if (!confirm('Start a new chart centered on this person?')) return;
        startWizard();
        state.wizard.startingPersonId = personId;
        var select = document.getElementById('wizardStartingPerson');
        if (select) select.value = personId;
    },
    addPerson: function (relationship, section, relativeId) {
        window.TreeRenderer.showAddPersonModal(relationship, section, relativeId);
    },
    lookupFsPerson: function (fsId, callback) {
        var apiBase = window.FsAuth.FS_API_BASE_URL + '/platform/tree';
        fetch(apiBase + '/persons/' + fsId, {
            headers: {
                Accept: 'application/x-gedcomx-v1+json',
                Authorization: 'Bearer ' + window.FsAuth.getAccessToken()
            }
        })
            .then(function (response) {
                return response.ok ? response.json() : null;
            })
            .then(function (data) {
                var person = data && data.persons && data.persons[0];
                if (!person) {
                    callback(null);
                    return;
                }
                var display = person.display || {};
                callback({
                    name: display.name || 'Unknown',
                    birth: display.birthDate || '',
                    death: display.deathDate || '',
                    gender: display.gender || ''
                });
            })
            .catch(function () {
                callback(null);
            });
    },
    submitAddPerson: submitAddPerson,
    refreshPerson: refreshPerson
};

/* ------------------------------------------------------------------ wiring */

function wireWizardControls() {
    document.querySelectorAll('[data-nav="charts"]').forEach(function (button) {
        button.addEventListener('click', function () {
            showView('charts');
        });
    });

    var newChartBtn = document.getElementById('newChartBtn');
    if (newChartBtn) newChartBtn.addEventListener('click', startWizard);

    document.querySelectorAll('[data-wizard-next]').forEach(function (button) {
        button.addEventListener('click', function () {
            var next = Number(button.getAttribute('data-wizard-next'));
            var problem = validateStep(next - 1);
            if (problem) {
                setGlobalMessage(problem, 'error');
                return;
            }
            setGlobalMessage('');
            goToStep(next);
        });
    });

    document.querySelectorAll('[data-wizard-back]').forEach(function (button) {
        button.addEventListener('click', function () {
            goToStep(Number(button.getAttribute('data-wizard-back')));
        });
    });

    document.querySelectorAll('[data-source]').forEach(function (tile) {
        tile.addEventListener('click', function () {
            var source = tile.getAttribute('data-source');
            state.wizard.source = source;
            document.querySelectorAll('[data-source]').forEach(function (other) {
                other.classList.toggle('selected', other === tile);
            });
            var fsPanel = document.getElementById('familysearchSourcePanel');
            var gedcomPanel = document.getElementById('gedcomSourcePanel');
            if (fsPanel) fsPanel.style.display = source === 'familysearch' ? '' : 'none';
            if (gedcomPanel) gedcomPanel.style.display = source === 'gedcom' ? '' : 'none';
        });
    });

    document.querySelectorAll('[data-tree-type]').forEach(function (tile) {
        tile.addEventListener('click', function () {
            state.wizard.treeType = tile.getAttribute('data-tree-type');
            document.querySelectorAll('[data-tree-type]').forEach(function (other) {
                other.classList.toggle('selected', other === tile);
            });
            syncGenerationOptions();
        });
    });

    document.querySelectorAll('#wizardThemeSelection .theme-selector').forEach(function (tile) {
        tile.addEventListener('click', function () {
            state.wizard.theme = tile.getAttribute('data-theme');
            document.querySelectorAll('#wizardThemeSelection .theme-selector').forEach(function (other) {
                other.classList.toggle('selected', other === tile);
            });
        });
    });

    var startingSelect = document.getElementById('wizardStartingPerson');
    if (startingSelect) {
        startingSelect.addEventListener('change', function () {
            var wrapper = document.getElementById('wizardManualIdWrapper');
            if (this.value === '__other__') {
                if (wrapper) wrapper.style.display = '';
                state.wizard.startingPersonId = '';
            } else {
                if (wrapper) wrapper.style.display = 'none';
                state.wizard.startingPersonId = this.value;
            }
        });
    }

    var manualId = document.getElementById('wizardManualId');
    if (manualId) {
        manualId.addEventListener('input', function () {
            state.wizard.startingPersonId = this.value.trim().toUpperCase();
        });
    }

    var generationsSelect = document.getElementById('wizardGenerations');
    if (generationsSelect) {
        generationsSelect.addEventListener('change', function () {
            state.wizard.generations = parseInt(this.value, 10);
        });
    }

    var familyName = document.getElementById('wizardFamilyName');
    if (familyName) {
        familyName.addEventListener('input', function () {
            state.wizard.familyName = this.value;
        });
    }

    var gedcomFile = document.getElementById('wizardGedcomFile');
    if (gedcomFile) {
        gedcomFile.addEventListener('change', function () {
            state.wizard.gedcomFile = this.files && this.files[0] ? this.files[0] : null;
        });
    }

    var rootPointer = document.getElementById('wizardRootPointer');
    if (rootPointer) {
        rootPointer.addEventListener('input', function () {
            state.wizard.rootPointer = this.value.trim();
        });
    }

    var generateBtn = document.getElementById('wizardGenerateBtn');
    if (generateBtn) generateBtn.addEventListener('click', submitWizard);
}

/**
 * Handle a return from Stripe, and deep links out of proof emails.
 *
 * The webhook is what actually unlocks the chart, so on a successful return we
 * reload orders rather than trusting the redirect.
 */
async function handleUrlIntent() {
    var params = new URLSearchParams(window.location.search);
    var payment = params.get('payment');
    var orderId = params.get('order');
    var action = params.get('action');

    if (payment === 'success') {
        setGlobalMessage('Payment received. Unlocking your print files...', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
        // The webhook may land a moment after the browser redirect.
        for (var attempt = 0; attempt < 5; attempt++) {
            await loadOrders();
            var unlocked = state.orders.some(function (order) {
                return order.is_unlocked;
            });
            if (unlocked) break;
            await new Promise(function (resolve) {
                setTimeout(resolve, 2000);
            });
        }
        setGlobalMessage('Payment complete. Your print-ready file is available below.', 'success');
        return;
    }

    if (payment === 'cancelled') {
        setGlobalMessage('Checkout cancelled. Your proof is still here whenever you are ready.', 'info');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (orderId) {
        window.history.replaceState({}, document.title, window.location.pathname);
        var order = findOrder(orderId);
        if (!order) return;
        if (action === 'buy' && !order.is_unlocked) {
            buyChart(orderId);
        } else {
            openEditor(orderId);
        }
    }
}

async function bootstrapDashboard() {
    var accessToken = window.FsAuth.getAccessToken();
    if (!accessToken) {
        window.location.href = '/login';
        return;
    }

    var person = await window.FsAuth.fetchCurrentPerson(accessToken);
    if (!person) {
        // Clear the dead token before bouncing to /login. The login page only
        // checks that a token cookie EXISTS, so leaving an expired one in place
        // sends the browser straight back here and loops forever.
        window.FsAuth.deleteCookie('fs_access_token');
        setGlobalMessage('Your FamilySearch session has expired. Please sign in again.', 'error');
        setTimeout(function () {
            window.location.href = '/login';
        }, 2500);
        return;
    }

    state.person = person;
    learnPersonName(person.id, person.name);

    document.getElementById('userDisplayName').textContent = person.name;
    document.getElementById('userDisplayId').textContent = person.id;

    var avatar = document.getElementById('userAvatar');
    if (avatar) {
        avatar.textContent =
            person.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map(function (part) {
                    return part[0] ? part[0].toUpperCase() : '';
                })
                .join('') || 'U';
    }

    wireWizardControls();
    showView('charts');

    await loadOrders();
    await handleUrlIntent();

    // The admin link is a convenience only; /admin is guarded server-side.
    try {
        await window.FsAuth.postJson('/orders/admin/list', {});
        var adminLink = document.getElementById('adminLink');
        if (adminLink) adminLink.style.display = '';
    } catch (error) {
        // Not an admin, which is the normal case.
    }
}

document.addEventListener('DOMContentLoaded', bootstrapDashboard);
