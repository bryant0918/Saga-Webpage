var DASHBOARD_CONFIG = window.APP_CONFIG || {};
var TREE_BACKEND_BASE_URL = DASHBOARD_CONFIG.TREE_BACKEND_BASE_URL || "https://family-trees.replit.app";

var SECTION_TO_JSON_TYPE = {
    kids: "kids",
    husb: "husb",
    wife: "wife",
    desc: "desc",
    sibs: "sibs"
};

var dashboardState = {
    accessToken: null,
    currentPerson: null,
    userScopeId: null,
    selectedContextId: null,
    lookupTitle: "User Tree",
    treeData: {
        kids: null,
        husb: null,
        wife: null,
        sibs: null,
        desc: null,
        metadata: null
    },
    expandedPersonId: null,
    editingField: null,
    pendingImageEdit: null,
    loadedAncestorGenerations: 4,
    loadedDescendantGenerations: 3,
    personNames: {}
};

function getPersonLabel(personId) {
    if (!personId) return "-";
    var name = dashboardState.personNames[personId];
    if (name) return name + " (" + personId + ")";
    return personId;
}

function learnPersonName(personId, name) {
    if (personId && name && name !== "Unknown") {
        dashboardState.personNames[personId] = name;
    }
}

function makePersonSlug(name, personId) {
    if (!name || !personId) return personId || "";
    var parts = name.trim().split(/\s+/);
    var last = (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
    var first = (parts[0] || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!last && !first) return personId;
    return last + "_" + first + "_" + personId;
}

function extractPersonIdFromSlug(slug) {
    if (!slug) return "";
    // Slug format: lastname_firstname_XXXX-XXXX or just XXXX-XXXX
    var match = slug.match(/([A-Z0-9]{4}-[A-Z0-9]{2,4})$/);
    if (match) return match[1];
    return slug;
}

window.TreeRendererConfig = {
    getState: function() { return { expandedPersonId: dashboardState.expandedPersonId, editingField: dashboardState.editingField, treeData: dashboardState.treeData }; },
    togglePersonDetail: function(key) { dashboardState.expandedPersonId = dashboardState.expandedPersonId === key ? null : key; dashboardState.editingField = null; renderDataList(); },
    startEdit: function(key) { startEdit(key); },
    cancelEdit: function() { cancelEdit(); },
    saveFieldEdit: function(s, p, f, v) { saveFieldEdit(s, p, f, v); },
    triggerImageUpload: function(s, p) { triggerImageUpload(s, p); },
    triggerCoupleImageUpload: function(p, s) { triggerCoupleImageUpload(p, s); },
    loadPersonImage: function(id, name) { loadPersonImage(id, name); },
    loadCoupleImage: function(id, path) { loadCoupleImage(id, path); },
    getPersonName: function(pid) {
        var sections = ["husb", "wife", "kids", "sibs", "desc"];
        for (var i = 0; i < sections.length; i++) {
            var d = dashboardState.treeData[sections[i]];
            if (d && d[pid] && d[pid].name) return formatName(d[pid].name);
        }
        return dashboardState.personNames[pid] || "";
    },
    addPerson: function(relationship, section, relativeId) {
        window.TreeRenderer.showAddPersonModal(relationship, section, relativeId);
    },
    lookupFsPerson: function(fsId, callback) {
        var apiBase = (DASHBOARD_CONFIG.FS_API_BASE_URL || "https://api.familysearch.org") + "/platform/tree";
        fetch(apiBase + "/persons/" + fsId, {
            headers: { "Accept": "application/x-gedcomx-v1+json", "Authorization": "Bearer " + dashboardState.accessToken }
        }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.persons || !data.persons[0]) { callback(null); return; }
            var p = data.persons[0];
            var d = p.display || {};
            callback({ name: d.name || "Unknown", birth: d.birthDate || "", death: d.deathDate || "", gender: d.gender || "" });
        }).catch(function() { callback(null); });
    },
    submitAddPerson: function() { submitAddPerson(); },
};

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === " ") c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

function logout() {
    deleteCookie("fs_access_token");
    deleteCookie("fs_refresh_token");
    deleteCookie("oauth_state");
    sessionStorage.clear();
    window.location.href = "/login";
}

function setDashboardMessage(message, isError) {
    var el = document.getElementById("dashboardMessage");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "#ffb4b4" : "var(--text-dark-gray)";
}

function setContextStatus() {
    // no-op: status messages now go through setDashboardMessage
}

function setContextMeta(text) {
    var el = document.getElementById("contextMeta");
    if (!el) return;
    el.textContent = text || "";
}

function updateSelectedRootDisplay() {
    // no-op: context is shown via the dropdown itself
}

function getLookupPayload(contextId) {
    var resolvedContextId = contextId || dashboardState.selectedContextId;
    return {
        title: dashboardState.lookupTitle || "User Tree",
        family_search_id: resolvedContextId,
        user_scope_id: dashboardState.userScopeId,
        context_id: resolvedContextId
    };
}

function escapeAttr(str) {
    if (!str && str !== 0) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatName(nameValue) {
    if (Array.isArray(nameValue)) {
        return nameValue.filter(Boolean).join(" ") || "Unknown";
    }
    if (typeof nameValue === "string" && nameValue.trim()) {
        return nameValue.trim();
    }
    return "Unknown";
}

function getImageName(imagePath) {
    if (!imagePath) return null;
    var parts = String(imagePath).replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || null;
}

async function fetchCurrentPerson(accessToken) {
    try {
        var response = await fetch((DASHBOARD_CONFIG.FS_API_BASE_URL || "https://api.familysearch.org") + "/platform/tree/current-person", {
            method: "GET",
            headers: {
                "Accept": "application/x-gedcomx-v1+json",
                "Authorization": "Bearer " + accessToken
            }
        });
        if (!response.ok) throw new Error("Failed to fetch current person");
        var data = await response.json();
        var person = data.persons && data.persons[0];
        if (!person) return null;
        return {
            name: (person.display && person.display.name) || "Unknown",
            id: person.id || "Unknown"
        };
    } catch (error) {
        console.error("Error fetching current person:", error);
        return null;
    }
}

async function postJson(endpoint, payload, treat404AsNull) {
    var response = await fetch(TREE_BACKEND_BASE_URL + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (treat404AsNull && response.status === 404) return null;
    if (!response.ok) {
        var text = "";
        try {
            text = await response.text();
        } catch (_e) {
            text = "";
        }
        throw new Error(text || ("Request failed with status " + response.status));
    }
    return response.json();
}

async function fetchTreeData(endpoint, contextId) {
    return postJson("/people/tree/" + endpoint, getLookupPayload(contextId), true);
}

function ensureContextOption(contextId) {
    if (!contextId) return;
    var select = document.getElementById("contextSelect");
    if (!select) return;
    var existing = Array.prototype.find.call(select.options, function(opt) {
        return opt.value === contextId;
    });
    if (!existing) {
        var option = document.createElement("option");
        option.value = contextId;
        option.textContent = getPersonLabel(contextId);
        select.appendChild(option);
    }
}

function contextOptionExists(contextId) {
    var select = document.getElementById("contextSelect");
    if (!select || !contextId) return false;
    return Array.prototype.some.call(select.options, function(opt) {
        return opt.value === contextId;
    });
}

function hasLoadedContextData(contextId) {
    if (!contextId) return false;
    if (dashboardState.selectedContextId !== contextId) return false;

    var metadata = dashboardState.treeData.metadata;
    if (metadata && metadata.context_id === contextId) {
        return true;
    }

    return (
        dashboardState.treeData.kids !== null ||
        dashboardState.treeData.husb !== null ||
        dashboardState.treeData.wife !== null ||
        dashboardState.treeData.sibs !== null ||
        dashboardState.treeData.desc !== null
    );
}

function renderContexts(contexts, preferredContextId) {
    var select = document.getElementById("contextSelect");
    if (!select) return;

    select.innerHTML = "";

    if (!contexts || contexts.length === 0) {
        var emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "No cached contexts yet";
        emptyOption.selected = true;
        select.appendChild(emptyOption);
        dashboardState.selectedContextId = null;
        updateSelectedRootDisplay();
        return;
    }

    contexts.forEach(function(contextId) {
        var option = document.createElement("option");
        option.value = contextId;
        option.textContent = getPersonLabel(contextId);
        select.appendChild(option);
    });

    var desired = preferredContextId;
    if (!desired || contexts.indexOf(desired) === -1) {
        desired = dashboardState.selectedContextId;
    }
    if (!desired || contexts.indexOf(desired) === -1) {
        desired = dashboardState.currentPerson && contexts.indexOf(dashboardState.currentPerson.id) !== -1
            ? dashboardState.currentPerson.id
            : contexts[0];
    }

    dashboardState.selectedContextId = desired;
    select.value = desired;
    updateSelectedRootDisplay();
}

async function refreshContexts(preferredContextId) {
    try {
        setContextStatus("Refreshing context list...", false);
        var result = await postJson("/people/tree/contexts", { user_scope_id: dashboardState.userScopeId }, false);
        var contexts = (result && result.contexts) || [];
        renderContexts(contexts, preferredContextId);
        setContextStatus(contexts.length ? "Choose a starting person context." : "Initialize your tree cache to create a context.", false);
        return contexts;
    } catch (error) {
        console.error("Failed to refresh contexts:", error);
        setContextStatus("Failed to load contexts.", true);
        return [];
    }
}

async function loadChartBuilds() {
    var listEl = document.getElementById("chartBuildsList");
    if (!listEl) return;
    listEl.textContent = "Loading...";

    try {
        var result = await postJson("/people/tree/chart-builds", { user_scope_id: dashboardState.userScopeId }, false);
        var builds = (result && result.chart_builds) || [];

        if (!builds.length) {
            listEl.innerHTML = '<span style="color: var(--text-dark-gray);">No chart requests yet. Click "Build Tree" to get started.</span>';
            return;
        }

        var html = '<ul class="list-unstyled mb-0">';
        builds.forEach(function(build) {
            html += '<li class="mb-2" style="border-bottom: 1px solid var(--light-black); padding-bottom: 8px;">';
            html += '<div style="color: var(--text-gray); font-weight: 500;">' + escapeAttr(build.filename) + '</div>';
            html += '<div style="color: var(--text-dark-gray); font-size: 0.8rem;">Context: ' + escapeAttr(getPersonLabel(build.context_id)) + '</div>';
            html += '</li>';
        });
        html += '</ul>';
        listEl.innerHTML = html;
    } catch (error) {
        console.error("Failed to load chart builds:", error);
        listEl.innerHTML = '<span style="color: #ffb4b4;">Failed to load chart builds.</span>';
    }
}

async function syncContext(rootPersonId, ancestorGenerations, descendantGenerations) {
    var payload = {
        access_token: dashboardState.accessToken,
        user_scope_id: dashboardState.userScopeId,
        root_person_id: rootPersonId,
        title: dashboardState.lookupTitle,
        ancestor_generations: ancestorGenerations || dashboardState.loadedAncestorGenerations,
        descendant_generations: descendantGenerations || dashboardState.loadedDescendantGenerations,
        include_spouse: true
    };
    var result = await postJson("/people/tree/sync", payload, false);
    if (result && result.context_id) {
        dashboardState.selectedContextId = result.context_id;
    }
    return result;
}

function clearTreeData() {
    dashboardState.treeData = {
        kids: null,
        husb: null,
        wife: null,
        sibs: null,
        desc: null,
        metadata: null
    };
    dashboardState.expandedPersonId = null;
    dashboardState.editingField = null;
}

function renderMetaSummary() {
    var metadata = dashboardState.treeData.metadata;
    if (!metadata) {
        setContextMeta("");
        return;
    }

    var counts = metadata.counts || {};
    var summary =
        "Ancestors: " + (metadata.ancestor_generations || dashboardState.loadedAncestorGenerations) +
        " gens | Descendants: " + (metadata.descendant_generations || dashboardState.loadedDescendantGenerations) +
        " gens | People: " +
        [counts.husb || 0, counts.wife || 0, counts.children || 0, counts.descendants || 0].reduce(function(a, b) { return a + b; }, 0);

    setContextMeta(summary);
}

async function loadTreeData() {
    var contextId = dashboardState.selectedContextId;
    var container = document.getElementById("dataListContainer");

    if (!container) return;
    if (!contextId) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">Select or create a context first.</p></div>';
        return;
    }

    clearTreeData();
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"><span class="visually-hidden">Loading...</span></div><p style="color: var(--text-gray);">Loading cached tree data...</p></div>';
    setDashboardMessage("Loading cached data for " + getPersonLabel(contextId) + "...", false);

    try {
        var results = await Promise.allSettled([
            fetchTreeData("kids", contextId),
            fetchTreeData("husb", contextId),
            fetchTreeData("wife", contextId),
            fetchTreeData("siblings", contextId),
            fetchTreeData("descendants", contextId),
            fetchTreeData("metadata", contextId)
        ]);

        dashboardState.treeData.kids = results[0].status === "fulfilled" ? results[0].value : null;
        dashboardState.treeData.husb = results[1].status === "fulfilled" ? results[1].value : null;
        dashboardState.treeData.wife = results[2].status === "fulfilled" ? results[2].value : null;
        dashboardState.treeData.sibs = results[3].status === "fulfilled" ? results[3].value : null;
        dashboardState.treeData.desc = results[4].status === "fulfilled" ? results[4].value : null;
        dashboardState.treeData.metadata = results[5].status === "fulfilled" ? results[5].value : null;

        var metadata = dashboardState.treeData.metadata;
        if (metadata) {
            dashboardState.loadedAncestorGenerations = metadata.ancestor_generations || dashboardState.loadedAncestorGenerations;
            dashboardState.loadedDescendantGenerations = metadata.descendant_generations || dashboardState.loadedDescendantGenerations;
            if (metadata.title) dashboardState.lookupTitle = metadata.title;
        }

        ["kids", "husb", "wife", "sibs", "desc"].forEach(function(section) {
            var data = dashboardState.treeData[section];
            if (data && typeof data === "object") {
                Object.keys(data).forEach(function(pid) {
                    var p = data[pid];
                    if (p && p.name) learnPersonName(pid, p.name);
                });
            }
        });

        renderDataList();
        renderMetaSummary();

        var hasAnyData = dashboardState.treeData.kids || dashboardState.treeData.husb ||
            dashboardState.treeData.wife || dashboardState.treeData.sibs || dashboardState.treeData.desc;

        if (!hasAnyData) {
            container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"><span class="visually-hidden">Loading...</span></div><p style="color: var(--text-gray);">Fetching tree data from FamilySearch...</p><p class="small" style="color: var(--text-dark-gray);">This may take a minute for a new person.</p></div>';
            setDashboardMessage("Fetching from FamilySearch...", false);
            var personId = extractPersonIdFromSlug(contextId);
            await syncContext(personId, dashboardState.loadedAncestorGenerations, dashboardState.loadedDescendantGenerations);
            await refreshContexts(dashboardState.selectedContextId);
            await loadTreeData();
            return;
        }

        var failures = results.filter(function(r) { return r.status === "rejected"; });
        if (failures.length) {
            setDashboardMessage("Loaded with partial data. Some sections were unavailable.", false);
        } else {
            setDashboardMessage("", false);
        }
    } catch (error) {
        console.error("Error loading tree data:", error);
        container.innerHTML = '<div class="text-center py-5"><i class="fas fa-exclamation-triangle fa-2x mb-3" style="color: #dc3545;"></i><p style="color: #dc3545;">Failed to load tree data.</p></div>';
        setDashboardMessage("Failed to load data.", true);
    }
}

async function initializeCache() {
    if (!dashboardState.currentPerson || !dashboardState.currentPerson.id) return;
    var container = document.getElementById("dataListContainer");

    try {
        if (container) container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"><span class="visually-hidden">Loading...</span></div><p style="color: var(--text-gray);">Setting up your tree data...</p><p class="small" style="color: var(--text-dark-gray);">Fetching from FamilySearch. This may take a minute.</p></div>';
        setDashboardMessage("Initializing...", false);
        await syncContext(dashboardState.currentPerson.id, 4, 3);
        await refreshContexts(dashboardState.selectedContextId);
        await loadTreeData();
        await loadChartBuilds();
        setDashboardMessage("", false);
    } catch (error) {
        console.error("Initialize failed:", error);
        if (container) container.innerHTML = '<div class="text-center py-5"><i class="fas fa-exclamation-triangle fa-2x mb-3" style="color: #dc3545;"></i><p style="color: #dc3545;">Failed to initialize. Please refresh and try again.</p></div>';
        setDashboardMessage("Failed to initialize.", true);
    }
}

async function fetchSelectedContextData() {
    if (!dashboardState.selectedContextId) return;
    var rootPersonId = extractPersonIdFromSlug(dashboardState.selectedContextId);
    try {
        setDashboardMessage("Fetching fresh FamilySearch data for " + getPersonLabel(rootPersonId) + "...", false);
        await syncContext(
            rootPersonId,
            dashboardState.loadedAncestorGenerations,
            dashboardState.loadedDescendantGenerations
        );
        await refreshContexts(dashboardState.selectedContextId);
        await loadTreeData();
        await loadChartBuilds();
        setDashboardMessage("Context refreshed.", false);
    } catch (error) {
        console.error("Fetch selected context failed:", error);
        setDashboardMessage("Failed to fetch data for this context.", true);
    }
}

async function fetchNextAncestorGeneration() {
    if (!dashboardState.selectedContextId) return;
    var rootPersonId = extractPersonIdFromSlug(dashboardState.selectedContextId);
    var nextGen = Math.min(5, (dashboardState.loadedAncestorGenerations || 4) + 1);

    if (nextGen === dashboardState.loadedAncestorGenerations) {
        setDashboardMessage("Already at max ancestor depth (5 generations).", false);
        return;
    }

    try {
        setDashboardMessage("Fetching ancestor generation " + nextGen + "...", false);
        await syncContext(
            rootPersonId,
            nextGen,
            dashboardState.loadedDescendantGenerations
        );
        dashboardState.loadedAncestorGenerations = nextGen;
        await loadTreeData();
        setDashboardMessage("Extended ancestor depth to " + nextGen + " generations.", false);
    } catch (error) {
        console.error("Fetch next generation failed:", error);
        setDashboardMessage("Failed to fetch next ancestor generation.", true);
    }
}

function togglePersonDetail(expandKey) {
    if (dashboardState.expandedPersonId === expandKey) {
        dashboardState.expandedPersonId = null;
    } else {
        dashboardState.expandedPersonId = expandKey;
    }
    dashboardState.editingField = null;
    renderDataList();
}

function startEdit(fieldKey) {
    dashboardState.editingField = fieldKey;
    renderDataList();
    setTimeout(function() {
        var input = document.getElementById("edit-input-" + fieldKey.replace(/[^a-zA-Z0-9]/g, "_"));
        if (input) input.focus();
    }, 50);
}

function cancelEdit() {
    dashboardState.editingField = null;
    renderDataList();
}

async function saveFieldEdit(section, personId, fieldName, newValue) {
    var syncToFs = confirm("Also update this change on FamilySearch?");

    var payload = getLookupPayload();
    payload.json_type = SECTION_TO_JSON_TYPE[section];
    payload.individual_id = personId;
    payload[fieldName] = newValue;

    if (syncToFs && dashboardState.accessToken) {
        payload.sync_to_familysearch = true;
        payload.access_token = dashboardState.accessToken;
    }

    try {
        var response = await postJson("/people/tree/update", payload, false);
        if (response && response.updated && dashboardState.treeData[section] && dashboardState.treeData[section][personId]) {
            var person = dashboardState.treeData[section][personId];
            if (fieldName === "first_name") {
                if (!Array.isArray(person.name)) person.name = ["", ""];
                person.name[0] = newValue;
            } else if (fieldName === "last_name") {
                if (!Array.isArray(person.name)) person.name = ["", ""];
                person.name[1] = newValue;
            } else {
                person[fieldName] = newValue;
            }
        }
        dashboardState.editingField = null;
        renderDataList();

        var msg = "Saved update for " + personId + ".";
        if (response && response.familysearch_sync === "success") {
            msg += " Also updated on FamilySearch.";
        } else if (response && response.familysearch_sync && response.familysearch_sync !== "success") {
            msg += " (FamilySearch sync failed)";
        }
        setDashboardMessage(msg, false);
    } catch (error) {
        console.error("Error saving field:", error);
        alert("Failed to save changes. Please try again.");
    }
}

async function submitAddPerson() {
    var mode = document.getElementById("addPersonMode").value;
    var personId = (document.getElementById("addPersonId").value || "").trim();
    var relationship = document.getElementById("addPersonRelationship").value;
    var section = document.getElementById("addPersonSection").value;
    var relativeId = document.getElementById("addPersonRelativeId").value;
    var errEl = document.getElementById("addPersonError");

    var firstName = "", lastName = "", birth = "", gender = "Male";
    if (mode === "new") {
        firstName = (document.getElementById("addPersonFirstName").value || "").trim();
        lastName = (document.getElementById("addPersonLastName").value || "").trim();
        gender = (document.getElementById("addPersonGender").value || "Male");
        birth = (document.getElementById("addPersonBirth").value || "").trim();
        if (!firstName) {
            if (errEl) { errEl.textContent = "First name is required."; errEl.style.display = ""; }
            return;
        }
    }

    if (!personId && mode !== "new") {
        if (errEl) { errEl.textContent = "No person selected."; errEl.style.display = ""; }
        return;
    }

    var includeSpouse = false;
    var spouseConfirm = document.getElementById("addPersonSpouseConfirm");
    if (spouseConfirm && spouseConfirm.style.display !== "none") {
        includeSpouse = document.getElementById("addPersonIncludeSpouse").checked;
    }

    var createOnFs = false;
    if (mode === "new" && dashboardState.accessToken) {
        createOnFs = confirm("Also create this person on FamilySearch?\n\n(OK = create on FamilySearch with a real ID, Cancel = local only)");
    }

    var payload = getLookupPayload();
    payload.person_id = personId || "";
    payload.first_name = firstName;
    payload.last_name = lastName;
    payload.gender = gender;
    payload.birth = birth;
    payload.relationship = relationship;
    payload.relative_id = relativeId;
    payload.data_type = section;
    payload.mode = mode;
    payload.include_spouse = includeSpouse;
    payload.access_token = dashboardState.accessToken;
    payload.create_on_fs = createOnFs;

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/add-person", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            var err = await response.json();
            throw new Error(err.error || "Failed to add person");
        }
        var modal = bootstrap.Modal.getInstance(document.getElementById("addPersonModal"));
        if (modal) modal.hide();
        var result = await response.json();
        if (result.person_name) learnPersonName(personId, result.person_name);
        await loadTreeData();
    } catch (error) {
        if (errEl) { errEl.textContent = error.message; errEl.style.display = ""; }
    }
}

function triggerImageUpload(section, personId) {
    dashboardState.pendingImageEdit = { section: section, personId: personId };
    var fileInput = document.getElementById("imageUploadInput");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

async function uploadNewImage(section, personId, file) {
    var syncChoice = promptFsSyncForImage();

    var formData = new FormData();
    var payload = getLookupPayload();
    formData.append("title", payload.title);
    formData.append("family_search_id", payload.family_search_id);
    formData.append("user_scope_id", payload.user_scope_id);
    formData.append("context_id", payload.context_id);
    formData.append("json_type", SECTION_TO_JSON_TYPE[section]);
    formData.append("individual_id", personId);
    formData.append("image", file);

    if (syncChoice && dashboardState.accessToken) {
        formData.append("access_token", dashboardState.accessToken);
        if (syncChoice === "portrait") {
            formData.append("sync_to_familysearch", "true");
            formData.append("set_as_portrait", "true");
        } else if (syncChoice === "upload") {
            formData.append("sync_to_familysearch", "true");
        }
    }

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update-image", {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            var errText = await response.text();
            throw new Error(errText || "Image upload failed");
        }
        var result = await response.json();
        if (result.updated_image_path && dashboardState.treeData[section] && dashboardState.treeData[section][personId]) {
            dashboardState.treeData[section][personId].image = result.updated_image_path;
        }
        renderDataList();

        var msg = "Updated image for " + personId + ".";
        if (result.familysearch_sync === "portrait_set") {
            msg += " Set as profile picture on FamilySearch.";
        } else if (result.familysearch_sync === "uploaded") {
            msg += " Uploaded to FamilySearch.";
        } else if (result.familysearch_sync && result.familysearch_sync.indexOf("failed") === 0) {
            msg += " (FamilySearch sync failed)";
        }
        setDashboardMessage(msg, false);
    } catch (error) {
        console.error("Error uploading image:", error);
        alert("Failed to upload image. Please try again.");
    }
}

function promptFsSyncForImage() {
    if (!confirm("Also update this photo on FamilySearch?")) {
        return null;
    }
    if (confirm("Set as profile picture on FamilySearch?\n\n(OK = set as profile picture, Cancel = upload only)")) {
        return "portrait";
    }
    return "upload";
}

function handleImageFileSelected(input) {
    if (!input.files || !input.files[0] || !dashboardState.pendingImageEdit) return;
    var file = input.files[0];
    var info = dashboardState.pendingImageEdit;
    dashboardState.pendingImageEdit = null;

    showCropModal(file).then(function(croppedBlob) {
        if (!croppedBlob) return;
        var croppedFile = new File([croppedBlob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        if (info.coupleUpload) {
            uploadCoupleImage(info.personId, info.spouseId, croppedFile);
        } else {
            uploadNewImage(info.section, info.personId, croppedFile);
        }
    });
}

function triggerCoupleImageUpload(personId, spouseId) {
    dashboardState.pendingImageEdit = { coupleUpload: true, personId: personId, spouseId: spouseId };
    var fileInput = document.getElementById("imageUploadInput");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

async function uploadCoupleImage(personId, spouseId, file) {
    var formData = new FormData();
    var payload = getLookupPayload();
    formData.append("title", payload.title);
    formData.append("family_search_id", payload.family_search_id);
    formData.append("user_scope_id", payload.user_scope_id);
    formData.append("context_id", payload.context_id);
    formData.append("person_id", personId);
    formData.append("spouse_id", spouseId);
    formData.append("image", file);

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update-couple-image", {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            var errText = await response.text();
            throw new Error(errText || "Couple image upload failed");
        }
        var result = await response.json();
        if (result.updated_couple_image_path) {
            var descData = dashboardState.treeData.desc;
            if (descData) {
                if (descData[personId]) descData[personId].couple_image = result.updated_couple_image_path;
                if (descData[spouseId]) descData[spouseId].couple_image = result.updated_couple_image_path;
            }
        }
        renderDataList();
        setDashboardMessage("Updated couple photo.", false);
    } catch (error) {
        console.error("Error uploading couple image:", error);
        alert("Failed to upload couple photo. Please try again.");
    }
}

function loadCoupleImage(imgElementId, coupleImagePath) {
    if (!coupleImagePath) return;
    var imageName = coupleImagePath.split("/").pop();
    if (!imageName) return;
    var payload = getLookupPayload();
    payload.image_name = imageName;

    fetch(TREE_BACKEND_BASE_URL + "/people/tree/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(function(response) {
            if (!response.ok) throw new Error("Couple image not found");
            return response.blob();
        })
        .then(function(blob) {
            var img = document.getElementById(imgElementId);
            var placeholder = document.getElementById(imgElementId + "_placeholder");
            if (img) {
                img.src = URL.createObjectURL(blob);
                img.style.display = "";
                if (placeholder) placeholder.style.display = "none";
            }
        })
        .catch(function() {
            var placeholder = document.getElementById(imgElementId + "_placeholder");
            if (placeholder) {
                placeholder.innerHTML = '<i class="fas fa-image"></i> Upload Couple Photo';
                placeholder.style.borderColor = "var(--light-black)";
                placeholder.style.color = "var(--text-dark-gray)";
            }
        });
}

function loadPersonImage(imgElementId, imageName) {
    if (!imageName) return;
    var payload = getLookupPayload();
    payload.image_name = imageName;

    fetch(TREE_BACKEND_BASE_URL + "/people/tree/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(function(response) {
            if (!response.ok) throw new Error("Image not found");
            return response.blob();
        })
        .then(function(blob) {
            var img = document.getElementById(imgElementId);
            if (img) {
                img.src = URL.createObjectURL(blob);
                img.style.display = "";
            }
        })
        .catch(function() {
            var img = document.getElementById(imgElementId);
            if (img) img.style.display = "none";
        });
}

async function selectAsStartingPerson(personId) {
    if (!personId) return;
    var alreadyListed = contextOptionExists(personId);
    var isCurrent = dashboardState.selectedContextId === personId;

    var select = document.getElementById("contextSelect");
    ensureContextOption(personId);
    if (select) {
        select.value = personId;
    }

    dashboardState.selectedContextId = personId;
    updateSelectedRootDisplay();

    if (isCurrent && hasLoadedContextData(personId)) {
        setDashboardMessage("Already using this starting person. Loaded cached data.", false);
        return;
    }

    if (alreadyListed) {
        setDashboardMessage("Loaded cached data for selected starting person.", false);
        await loadTreeData();
        return;
    }

    await fetchSelectedContextData();
}


function renderDataList() {
    var container = document.getElementById("dataListContainer");
    if (!container) return;

    var data = dashboardState.treeData;
    if (!data.kids && !data.husb && !data.wife && !data.sibs && !data.desc) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No cached data found for this context yet.</p></div>';
        return;
    }

    var html = window.TreeRenderer.renderAllSections(data);
    container.innerHTML = html || '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No visible people in this context.</p></div>';
}

function wireControls() {
    var contextSelect = document.getElementById("contextSelect");
    if (contextSelect) {
        contextSelect.addEventListener("change", function(e) {
            dashboardState.selectedContextId = e.target.value || null;
            updateSelectedRootDisplay();
            loadTreeData();
            loadChartBuilds();
        });
    }

    var refreshContextsBtn = document.getElementById("refreshContextsBtn");
    if (refreshContextsBtn) {
        refreshContextsBtn.addEventListener("click", function() {
            refreshContexts(dashboardState.selectedContextId);
        });
    }
}

async function bootstrapDashboard() {
    var accessToken = getCookie("fs_access_token");
    if (!accessToken) {
        window.location.href = "/login";
        return;
    }

    dashboardState.accessToken = accessToken;

    var person = await fetchCurrentPerson(accessToken);
    if (!person) {
        setDashboardMessage("Failed to load your FamilySearch profile.", true);
        return;
    }

    dashboardState.currentPerson = person;
    dashboardState.userScopeId = makePersonSlug(person.name, person.id);
    learnPersonName(person.id, person.name);

    var ADMIN_IDS = ["KWN5-J7M", "KWXJ-J3Z"];
    var adminLink = document.getElementById("adminLink");
    if (adminLink && ADMIN_IDS.indexOf(person.id) !== -1) {
        adminLink.style.display = "";
    }

    var lastName = person.name.split(" ");
    dashboardState.lookupTitle = (lastName[lastName.length - 1] || "User") + " Family";

    var userNameEl = document.getElementById("userDisplayName");
    var userIdEl = document.getElementById("userDisplayId");
    if (userNameEl) userNameEl.textContent = person.name;
    if (userIdEl) userIdEl.textContent = person.id;

    var avatarEl = document.getElementById("userAvatar");
    if (avatarEl) {
        var initials = person.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(function(part) { return part[0] ? part[0].toUpperCase() : ""; })
            .join("");
        avatarEl.textContent = initials || "U";
    }

    wireControls();

    var contexts = await refreshContexts(person.id);
    if (!contexts.length) {
        await initializeCache();
    } else {
        await loadTreeData();
        setDashboardMessage("Loaded your existing contexts.", false);
    }

    await loadChartBuilds();
}

function openBuildTreeDrawer() {
    if (!dashboardState.currentPerson) {
        alert("Please log in first.");
        return;
    }

    // Auto-populate form fields
    var contactName = document.getElementById("contactName");
    var contactEmail = document.getElementById("contactEmail");
    var familyName = document.getElementById("familyName");
    var startingPerson = document.getElementById("startingPerson");
    var startingPersonSelect = document.getElementById("startingPersonSelect");

    var rootPersonId = extractPersonIdFromSlug(dashboardState.selectedContextId || "") || (dashboardState.currentPerson && dashboardState.currentPerson.id) || "";
    var rootPersonName = dashboardState.personNames[rootPersonId] || (dashboardState.currentPerson && dashboardState.currentPerson.name) || "";

    if (contactName && dashboardState.currentPerson) contactName.value = dashboardState.currentPerson.name;
    if (familyName) {
        var parts = rootPersonName.split(" ");
        familyName.value = parts[parts.length - 1] || "";
    }
    if (startingPerson) startingPerson.value = rootPersonId;

    // Populate starting person dropdown from known people
    if (startingPersonSelect) {
        startingPersonSelect.innerHTML = "";
        var people = [];
        if (dashboardState.currentPerson) {
            people.push({ id: dashboardState.currentPerson.id, name: dashboardState.currentPerson.name });
        }
        Object.keys(dashboardState.personNames).forEach(function(pid) {
            if (pid !== dashboardState.currentPerson.id) {
                people.push({ id: pid, name: dashboardState.personNames[pid] });
            }
        });
        people.forEach(function(p) {
            var opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name + " (" + p.id + ")";
            startingPersonSelect.appendChild(opt);
        });
        var otherOpt = document.createElement("option");
        otherOpt.value = "__other__";
        otherOpt.textContent = "Other (enter ID manually)";
        startingPersonSelect.appendChild(otherOpt);

        startingPersonSelect.value = rootPersonId || (dashboardState.currentPerson || {}).id || "";
        startingPersonSelect.onchange = function() {
            var manualWrapper = document.getElementById("manualIdWrapper");
            var manualInput = document.getElementById("startingPersonManual");
            if (this.value === "__other__") {
                if (manualWrapper) manualWrapper.style.display = "";
                if (manualInput) manualInput.focus();
            } else {
                if (manualWrapper) manualWrapper.style.display = "none";
                if (startingPerson) startingPerson.value = this.value;
            }
        };
    }

    // Tree type change -> update generations
    var treeType = document.getElementById("treeType");
    var generations = document.getElementById("generations");
    if (treeType && generations) {
        treeType.onchange = function() {
            if (this.value === "descendant") {
                generations.innerHTML = '<option value="4" selected>4 Generations</option><option value="3">3 Generations</option>';
            } else {
                generations.innerHTML = '<option value="5" selected>5 Generations</option><option value="4">4 Generations</option>';
            }
            if (typeof updatePriceDisplay === "function") setTimeout(updatePriceDisplay, 50);
        };
    }

    // Set access token for stripe-integration form submission
    window.accessToken = dashboardState.accessToken;

    // Open the drawer
    var drawer = new bootstrap.Offcanvas(document.getElementById("buildTreeDrawer"));
    drawer.show();

    if (typeof updatePriceDisplay === "function") setTimeout(updatePriceDisplay, 100);
}

document.addEventListener("DOMContentLoaded", bootstrapDashboard);
