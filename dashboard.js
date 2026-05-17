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

function sortByGenerationThenName(data, keys) {
    return keys.sort(function(a, b) {
        var pa = data[a] || {};
        var pb = data[b] || {};
        var ga = Number.isFinite(pa.generation) ? pa.generation : 999;
        var gb = Number.isFinite(pb.generation) ? pb.generation : 999;
        if (ga !== gb) return ga - gb;
        return formatName(pa.name).localeCompare(formatName(pb.name));
    });
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

function getPeopleSectionEntries(sectionKey, data) {
    if (!data) return [];
    var keys = Object.keys(data);

    if (sectionKey === "kids") {
        keys.sort(function(a, b) {
            var ya = data[a] && data[a].birth_year ? data[a].birth_year : 9999;
            var yb = data[b] && data[b].birth_year ? data[b].birth_year : 9999;
            return ya - yb;
        });
    } else {
        sortByGenerationThenName(data, keys);
    }

    return keys.map(function(id) {
        return { id: id, person: data[id] };
    });
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

function buildEditableField(label, value, fieldKey, section, personId, fieldName) {
    var isEditing = dashboardState.editingField === fieldKey;
    var safeKey = fieldKey.replace(/[^a-zA-Z0-9]/g, "_");
    var html = "";

    if (isEditing) {
        html += '<div class="col-sm-6 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2 mt-1">';
        html += '<input type="text" id="edit-input-' + safeKey + '" class="form-control form-control-sm" value="' + escapeAttr(value || "") + '" style="background-color: var(--light-black); color: var(--text-gray); border-color: var(--gold-primary); max-width: 200px;">';
        html += '<button class="btn btn-sm" onclick="var v=document.getElementById(\'edit-input-' + safeKey + '\').value;saveFieldEdit(\'' + section + '\',\'' + personId + '\',\'' + fieldName + '\',v)" style="color: var(--gold-primary); padding: 2px 8px;" title="Save"><i class="fas fa-check"></i></button>';
        html += '<button class="btn btn-sm" onclick="cancelEdit()" style="color: var(--text-dark-gray); padding: 2px 8px;" title="Cancel"><i class="fas fa-times"></i></button>';
        html += "</div></div>";
    } else {
        html += '<div class="col-sm-6 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2">';
        html += '<span style="color: var(--text-gray);">' + escapeAttr(value || "-") + "</span>";
        html += '<button class="btn btn-sm p-0" onclick="event.stopPropagation();startEdit(\'' + fieldKey + '\')" style="color: var(--text-dark-gray); line-height: 1;" title="Edit ' + label + '"><i class="fas fa-pen-to-square" style="font-size: 0.75rem;"></i></button>';
        html += "</div></div>";
    }

    return html;
}

function buildPersonDetailHTML(person, personId, section) {
    var html = '<div class="person-detail-content p-3" style="background-color: var(--deep-black); border-radius: 8px;">';
    var imageName = getImageName(person.image);
    var imgId = "person-img-" + section + "-" + personId.replace(/[^a-zA-Z0-9]/g, "_");

    html += '<div class="text-center mb-3">';
    html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="event.stopPropagation();triggerImageUpload(\'' + section + '\',\'' + personId + '\')">';
    html += '<img id="' + imgId + '" alt="' + escapeAttr(formatName(person.name)) + '" style="display: none; max-width: 110px; max-height: 110px; border-radius: 50%; border: 2px solid var(--gold-primary);">';
    html += '<div id="' + imgId + '_placeholder" style="width: 110px; height: 110px; border-radius: 50%; border: 2px dashed var(--light-black); display: flex; align-items: center; justify-content: center; margin: 0 auto;">';
    html += '<i class="fas fa-camera" style="color: var(--text-dark-gray); font-size: 1.3rem;"></i>';
    html += "</div>";
    html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;"><i class="fas fa-pen"></i></div>';
    html += "</div></div>";

    if (imageName) {
        setTimeout(function() {
            loadPersonImage(imgId, imageName);
            var placeholder = document.getElementById(imgId + "_placeholder");
            var imgEl = document.getElementById(imgId);
            if (imgEl) {
                imgEl.addEventListener("load", function() {
                    if (placeholder) placeholder.style.display = "none";
                });
            }
        }, 0);
    }

    html += '<div class="row">';
    html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Person ID</small><div style="color: var(--text-gray);">' + escapeAttr(personId) + "</div></div>";

    if (person.generation !== undefined) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Generation</small><div style="color: var(--text-gray);">' + escapeAttr(person.generation) + "</div></div>";
    }

    var firstName = Array.isArray(person.name) ? (person.name[0] || "") : formatName(person.name);
    var lastName = Array.isArray(person.name) ? (person.name[1] || "") : "";

    var fKey = section + "_" + personId + "_first_name";
    var lKey = section + "_" + personId + "_last_name";
    html += buildEditableField("First Name", firstName, fKey, section, personId, "first_name");
    html += buildEditableField("Last Name", lastName, lKey, section, personId, "last_name");

    if (person.birth !== undefined) {
        var bKey = section + "_" + personId + "_birth";
        html += buildEditableField("Birth", person.birth || "", bKey, section, personId, "birth");
    }

    if (person.death !== undefined) {
        var dKey = section + "_" + personId + "_death";
        html += buildEditableField("Death", person.death || "", dKey, section, personId, "death");
    }

    if (Array.isArray(person.parents) && person.parents.length) {
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Parents</small><div style="color: var(--text-gray);">' + escapeAttr(person.parents.join(", ")) + "</div></div>";
    }

    if (Array.isArray(person.children) && person.children.length) {
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Children</small><div style="color: var(--text-gray);">' + escapeAttr(person.children.join(", ")) + "</div></div>";
    }

    if (person.spouse_id) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Spouse ID</small><div style="color: var(--text-gray);">' + escapeAttr(person.spouse_id) + "</div></div>";
    }

    if (person.relation) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Relation</small><div style="color: var(--text-gray);">' + escapeAttr(person.relation) + "</div></div>";
    }

    html += "</div></div>";
    return html;
}

function buildPersonListItem(person, personId, section, sectionLabel) {
    var name = formatName(person.name);
    var expandKey = section + "_" + personId;
    var isExpanded = dashboardState.expandedPersonId === expandKey;

    var html = '<div class="person-list-item mb-2">';
    html += '<div class="d-flex align-items-center justify-content-between p-3" style="background-color: var(--primary-black); border: 1px solid var(--light-black); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;" onclick="togglePersonDetail(\'' + expandKey + '\')" onmouseover="this.style.borderColor=\'var(--gold-primary)\'" onmouseout="this.style.borderColor=\'var(--light-black)\'">';

    html += '<div class="d-flex align-items-center">';
    html += '<div style="width: 34px; height: 34px; border-radius: 50%; background-color: var(--light-black); display: flex; align-items: center; justify-content: center; margin-right: 10px;"><i class="fas fa-user" style="color: var(--gold-primary); font-size: 0.8rem;"></i></div>';
    html += "<div>";
    html += '<div style="color: var(--text-gray); font-weight: 500;">' + escapeAttr(name) + "</div>";
    html += '<small style="color: var(--text-dark-gray);">' + escapeAttr(sectionLabel) + "</small>";
    html += "</div></div>";

    html += '<div class="actions d-flex align-items-center gap-2">';
    html += '<button class="btn btn-outline-warning btn-sm" onclick="event.stopPropagation();selectAsStartingPerson(\'' + personId + '\')" title="Set as starting person"><i class="fas fa-crosshairs"></i></button>';
    html += '<i class="fas fa-chevron-' + (isExpanded ? "up" : "down") + '" style="color: var(--text-dark-gray);"></i>';
    html += "</div></div>";

    if (isExpanded) {
        html += '<div class="mt-1 ms-3">' + buildPersonDetailHTML(person, personId, section) + "</div>";
    }

    html += "</div>";
    return html;
}

function deriveGenerationsFromParentGraph(data) {
    var generationById = {};
    if (!data) return generationById;

    var ids = Object.keys(data);
    if (!ids.length) return generationById;

    var referencedParents = {};
    ids.forEach(function(id) {
        var person = data[id] || {};
        var parents = Array.isArray(person.parents) ? person.parents : [];
        parents.forEach(function(parentId) {
            referencedParents[parentId] = true;
        });
    });

    var roots = ids.filter(function(id) {
        return !referencedParents[id];
    });
    if (!roots.length) roots = [ids[0]];

    var queue = roots.map(function(id) {
        return { id: id, generation: 1 };
    });

    while (queue.length) {
        var current = queue.shift();
        var id = current.id;
        var generation = current.generation;
        if (!data[id]) continue;

        if (generationById[id] !== undefined && generationById[id] <= generation) {
            continue;
        }
        generationById[id] = generation;

        var person = data[id] || {};
        var parents = Array.isArray(person.parents) ? person.parents : [];
        parents.forEach(function(parentId) {
            if (data[parentId]) {
                queue.push({ id: parentId, generation: generation + 1 });
            }
        });
    }

    return generationById;
}

function getSpouseIds(person) {
    if (!person) return [];
    if (Array.isArray(person.spouse_ids)) {
        return person.spouse_ids.filter(Boolean).map(String);
    }
    if (Array.isArray(person.spouses)) {
        return person.spouses.filter(Boolean).map(String);
    }
    if (person.spouse_id) return [String(person.spouse_id)];
    return [];
}

function buildCoupleRows(entries) {
    var byId = {};
    entries.forEach(function(entry) {
        byId[entry.id] = entry;
    });

    var used = {};
    var rows = [];

    entries.forEach(function(entry) {
        if (used[entry.id]) return;

        var spouseIds = getSpouseIds(entry.person);
        var matchedSpouse = null;

        for (var i = 0; i < spouseIds.length; i++) {
            var spouseId = spouseIds[i];
            if (!byId[spouseId] || used[spouseId]) continue;
            matchedSpouse = byId[spouseId];
            break;
        }

        if (matchedSpouse) {
            used[entry.id] = true;
            used[matchedSpouse.id] = true;
            rows.push([entry, matchedSpouse]);
            return;
        }

        used[entry.id] = true;
        rows.push([entry]);
    });

    return rows;
}

function renderEntryRows(entries, section, label) {
    var rows = buildCoupleRows(entries);
    var html = "";

    rows.forEach(function(rowEntries) {
        html += '<div class="row g-2 mb-1">';
        rowEntries.forEach(function(entry) {
            html += '<div class="col-12 col-lg-6">';
            html += buildPersonListItem(
                entry.person,
                entry.id,
                entry.section || section,
                entry.label || label
            );
            html += "</div>";
        });
        if (rowEntries.length === 1) {
            html += '<div class="col-12 col-lg-6"></div>';
        }
        html += "</div>";

        if (rowEntries.length === 2 && section === "desc") {
            var personA = rowEntries[0];
            var personB = rowEntries[1];
            var coupleImg = (personA.person && personA.person.couple_image) || (personB.person && personB.person.couple_image);
            var coupleImgId = "couple-img-" + personA.id + "-" + personB.id;
            html += '<div class="text-center mb-2 mt-1">';
            if (coupleImg) {
                html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="triggerCoupleImageUpload(\'' + escapeAttr(personA.id) + '\',\'' + escapeAttr(personB.id) + '\')">';
                html += '<img id="' + coupleImgId + '" alt="Couple photo" style="display: none; max-width: 140px; max-height: 100px; border-radius: 8px; border: 2px solid var(--gold-primary);">';
                html += '<div id="' + coupleImgId + '_placeholder" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; border: 1px dashed var(--gold-primary); color: var(--gold-primary); font-size: 0.8rem; cursor: pointer;">';
                html += '<i class="fas fa-image"></i> Loading couple photo...</div>';
                html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem;"><i class="fas fa-pen"></i></div>';
                html += '</div>';
                setTimeout(function() { loadCoupleImage(coupleImgId, coupleImg); }, 0);
            } else {
                html += '<button class="btn btn-sm" style="border: 1px dashed var(--light-black); color: var(--text-dark-gray); font-size: 0.8rem;" onclick="triggerCoupleImageUpload(\'' + escapeAttr(personA.id) + '\',\'' + escapeAttr(personB.id) + '\')">';
                html += '<i class="fas fa-image me-1"></i>Upload Couple Photo</button>';
            }
            html += '</div>';
        }
    });

    return html;
}

function deriveAncestorSpouses(primaryData, spouseData) {
    var allDatasets = [primaryData, spouseData];
    var spouseMap = {};
    allDatasets.forEach(function(data) {
        if (!data) return;
        Object.keys(data).forEach(function(id) {
            var parents = data[id] && Array.isArray(data[id].parents) ? data[id].parents : [];
            if (parents.length === 2) {
                var a = String(parents[0]);
                var b = String(parents[1]);
                if (!spouseMap[a]) spouseMap[a] = b;
                if (!spouseMap[b]) spouseMap[b] = a;
            }
        });
    });

    var primaryRoot = null;
    var spouseRoot = null;
    if (primaryData) {
        var primaryReferenced = {};
        Object.keys(primaryData).forEach(function(id) {
            var parents = primaryData[id] && Array.isArray(primaryData[id].parents) ? primaryData[id].parents : [];
            parents.forEach(function(pid) { primaryReferenced[pid] = true; });
        });
        var primaryRoots = Object.keys(primaryData).filter(function(id) { return !primaryReferenced[id]; });
        if (primaryRoots.length === 1) primaryRoot = primaryRoots[0];
    }
    if (spouseData) {
        var spouseReferenced = {};
        Object.keys(spouseData).forEach(function(id) {
            var parents = spouseData[id] && Array.isArray(spouseData[id].parents) ? spouseData[id].parents : [];
            parents.forEach(function(pid) { spouseReferenced[pid] = true; });
        });
        var spouseRoots = Object.keys(spouseData).filter(function(id) { return !spouseReferenced[id]; });
        if (spouseRoots.length === 1) spouseRoot = spouseRoots[0];
    }
    if (primaryRoot && spouseRoot && !spouseMap[primaryRoot]) {
        spouseMap[primaryRoot] = spouseRoot;
        spouseMap[spouseRoot] = primaryRoot;
    }

    allDatasets.forEach(function(data) {
        if (!data) return;
        Object.keys(data).forEach(function(id) {
            if (spouseMap[id] && !data[id].spouse_id) {
                data[id].spouse_id = spouseMap[id];
            }
        });
    });
}

function renderAncestorSections(primaryData, spouseData) {
    var hasPrimary = primaryData && Object.keys(primaryData).length;
    var hasSpouse = spouseData && Object.keys(spouseData).length;
    if (!hasPrimary && !hasSpouse) return "";

    deriveAncestorSpouses(primaryData, spouseData);

    var primaryGen = deriveGenerationsFromParentGraph(primaryData || {});
    var spouseGen = deriveGenerationsFromParentGraph(spouseData || {});
    var generationGroups = {};
    var generationOrder = [];

    function addEntry(id, person, section, label, generation) {
        var gen = Number.isFinite(person && person.generation)
            ? person.generation
            : (Number.isFinite(generation) ? generation : 999);
        if (!generationGroups[gen]) {
            generationGroups[gen] = [];
            generationOrder.push(gen);
        }
        generationGroups[gen].push({
            id: id,
            person: person,
            section: section,
            label: label
        });
    }

    if (hasPrimary) {
        Object.keys(primaryData).forEach(function(id) {
            addEntry(id, primaryData[id], "husb", "Primary Ancestor", primaryGen[id]);
        });
    }
    if (hasSpouse) {
        Object.keys(spouseData).forEach(function(id) {
            addEntry(id, spouseData[id], "wife", "Spouse Ancestor", spouseGen[id]);
        });
    }

    generationOrder.sort(function(a, b) { return a - b; });

    var totalCount = (hasPrimary ? Object.keys(primaryData).length : 0) + (hasSpouse ? Object.keys(spouseData).length : 0);
    var html = '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);"><i class="fas fa-sitemap me-2"></i>Ancestors (' + totalCount + ")</h5>";

    generationOrder.forEach(function(gen) {
        var heading = gen === 999 ? "Generation Unknown" : ("Generation " + gen);
        html += '<h6 class="mt-3 mb-2" style="color: var(--text-dark-gray); border-bottom: 1px solid var(--light-black); padding-bottom: 6px;">' + heading + "</h6>";
        var entries = generationGroups[gen];
        entries.sort(function(a, b) {
            return formatName(a.person && a.person.name).localeCompare(formatName(b.person && b.person.name));
        });
        html += renderEntryRows(entries, "husb", "Ancestor");
    });

    return html;
}

function renderSection(titleHtml, data, section, label, groupByGeneration) {
    if (!data || !Object.keys(data).length) return "";

    var entries = getPeopleSectionEntries(section, data);
    var html = '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);">' + titleHtml + " (" + entries.length + ")</h5>";

    if (groupByGeneration) {
        var derivedGenerationById = deriveGenerationsFromParentGraph(data);
        var groups = {};
        var generationOrder = [];

        entries.forEach(function(entry) {
            var rawGen = entry.person && entry.person.generation;
            var derivedGen = derivedGenerationById[entry.id];
            var gen = Number.isFinite(rawGen) ? rawGen : (Number.isFinite(derivedGen) ? derivedGen : 999);
            if (!groups[gen]) {
                groups[gen] = [];
                generationOrder.push(gen);
            }
            groups[gen].push(entry);
        });

        generationOrder.sort(function(a, b) { return a - b; });

        generationOrder.forEach(function(gen) {
            var heading = gen === 999 ? "Generation Unknown" : ("Generation " + gen);
            html += '<h6 class="mt-3 mb-2" style="color: var(--text-dark-gray); border-bottom: 1px solid var(--light-black); padding-bottom: 6px;">' + heading + "</h6>";
            html += renderEntryRows(groups[gen], section, label);
        });
    } else {
        html += renderEntryRows(entries, section, label);
    }

    return html;
}

function renderDataList() {
    var container = document.getElementById("dataListContainer");
    if (!container) return;

    var data = dashboardState.treeData;
    if (!data.kids && !data.husb && !data.wife && !data.sibs && !data.desc) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No cached data found for this context yet.</p></div>';
        return;
    }

    var html = "";
    html += renderAncestorSections(data.husb, data.wife);
    html += renderSection('<i class="fas fa-people-group me-2"></i>Siblings', data.sibs, "sibs", "Sibling", false);
    html += renderSection('<i class="fas fa-child me-2"></i>Children', data.kids, "kids", "Child", false);
    html += renderSection('<i class="fas fa-people-arrows me-2"></i>Descendants', data.desc, "desc", "Descendant", true);

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

    if (contactName && dashboardState.currentPerson) contactName.value = dashboardState.currentPerson.name;
    if (familyName) {
        var parts = (dashboardState.currentPerson.name || "").split(" ");
        familyName.value = parts[parts.length - 1] || "";
    }
    if (startingPerson && dashboardState.currentPerson) startingPerson.value = dashboardState.currentPerson.id;

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

        startingPersonSelect.value = (dashboardState.currentPerson || {}).id || "";
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
