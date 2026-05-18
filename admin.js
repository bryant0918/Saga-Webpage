var DASHBOARD_CONFIG = window.APP_CONFIG || {};
var TREE_BACKEND_BASE_URL = DASHBOARD_CONFIG.TREE_BACKEND_BASE_URL || "https://family-trees.replit.app";

var SECTION_TO_JSON_TYPE = { kids: "kids", husb: "husb", wife: "wife", desc: "desc", sibs: "sibs" };

var adminState = {
    accessToken: null,
    currentPerson: null,
    selectedUserFolder: null,
    selectedContext: null,
    treeData: { kids: null, husb: null, wife: null, sibs: null, desc: null, metadata: null },
    expandedPersonId: null,
    editingField: null,
    pendingImageEdit: null
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

function escapeAttr(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatName(nameValue) {
    if (!nameValue) return "Unknown";
    if (Array.isArray(nameValue)) return nameValue.filter(Boolean).join(" ") || "Unknown";
    return String(nameValue);
}

function getImageName(imagePath) {
    if (!imagePath) return null;
    var parts = imagePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1];
}

function formatFolderName(slug) {
    var match = slug.match(/^([a-z]+)_([a-z]+)_([A-Z0-9]+-[A-Z0-9]+)$/);
    if (match) {
        var last = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        var first = match[2].charAt(0).toUpperCase() + match[2].slice(1);
        return last + ", " + first + " (" + match[3] + ")";
    }
    return slug;
}

function getLookupPayload() {
    return {
        user_scope_id: adminState.selectedUserFolder,
        context_id: adminState.selectedContext
    };
}

// ==================== FamilySearch API ====================

async function fetchCurrentPerson(accessToken) {
    try {
        var response = await fetch((DASHBOARD_CONFIG.FS_API_BASE_URL || "https://api.familysearch.org") + "/platform/tree/current-person", {
            method: "GET",
            headers: { "Accept": "application/x-gedcomx-v1+json", "Authorization": "Bearer " + accessToken }
        });
        if (!response.ok) throw new Error("Failed");
        var data = await response.json();
        var person = data.persons && data.persons[0];
        return person ? { name: (person.display && person.display.name) || "Unknown", id: person.id || "Unknown" } : null;
    } catch (error) {
        console.error("Error fetching current person:", error);
        return null;
    }
}

// ==================== Search ====================

async function searchTrees(query) {
    var resultsEl = document.getElementById("searchResults");
    if (!query || query.length < 2) {
        resultsEl.innerHTML = '<div class="text-center py-4"><p style="color: var(--text-dark-gray);">Type at least 2 characters to search.</p></div>';
        return;
    }
    resultsEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-warning" role="status"></div> Searching...</div>';
    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query })
        });
        if (!response.ok) throw new Error("Search failed");
        var data = await response.json();
        renderSearchResults(data.results || []);
    } catch (error) {
        resultsEl.innerHTML = '<div class="text-center py-4"><p style="color: #ffb4b4;">Search failed. Make sure the backend is running.</p></div>';
    }
}

function renderSearchResults(results) {
    var resultsEl = document.getElementById("searchResults");
    if (!results.length) {
        resultsEl.innerHTML = '<div class="text-center py-4"><i class="fas fa-search fa-2x mb-3" style="color: var(--light-black);"></i><p style="color: var(--text-dark-gray);">No matching trees found.</p></div>';
        return;
    }
    var html = "";
    results.forEach(function(result) {
        var userLabel = formatFolderName(result.user_folder);
        html += '<div class="tree-folder mb-3" style="border: 1px solid var(--light-black); border-radius: 8px; overflow: hidden;">';
        html += '<div class="p-3" style="background-color: var(--primary-black); border-bottom: 1px solid var(--light-black);">';
        html += '<div class="d-flex align-items-center"><i class="fas fa-user-circle me-2" style="color: var(--gold-primary); font-size: 1.2rem;"></i>';
        html += '<div><div style="color: var(--text-gray); font-weight: 600;">' + escapeAttr(userLabel) + '</div>';
        html += '<small style="color: var(--text-dark-gray);">' + escapeAttr(result.user_folder) + '</small></div></div></div>';
        html += '<div class="p-2" style="background-color: var(--deep-black);">';
        result.contexts.forEach(function(ctx) {
            var ctxLabel = formatFolderName(ctx);
            html += '<div class="d-flex align-items-center p-2 ms-3" style="border-left: 2px solid var(--light-black); cursor: pointer;" ';
            html += 'onclick="selectTreeContext(\'' + escapeAttr(result.user_folder) + '\', \'' + escapeAttr(ctx) + '\')" ';
            html += 'onmouseover="this.style.borderLeftColor=\'var(--gold-primary)\'" onmouseout="this.style.borderLeftColor=\'var(--light-black)\'">';
            html += '<i class="fas fa-folder me-2" style="color: var(--gold-primary); font-size: 0.9rem;"></i>';
            html += '<span style="color: var(--text-gray);">' + escapeAttr(ctxLabel) + '</span></div>';
        });
        html += '</div></div>';
    });
    resultsEl.innerHTML = html;
}

// ==================== Tree Data Loading ====================

async function selectTreeContext(userFolder, contextFolder) {
    adminState.selectedUserFolder = userFolder;
    adminState.selectedContext = contextFolder;
    adminState.treeData = { kids: null, husb: null, wife: null, sibs: null, desc: null, metadata: null };
    adminState.expandedPersonId = null;

    var container = document.getElementById("dataListContainer");
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"></div><p style="color: var(--text-gray);">Loading tree data...</p></div>';

    document.getElementById("selectedTreeLabel").textContent = formatFolderName(userFolder) + " / " + formatFolderName(contextFolder);
    document.getElementById("selectedTreePanel").style.display = "";

    try {
        var results = await Promise.allSettled([
            postJson("/people/tree/kids"),
            postJson("/people/tree/husb"),
            postJson("/people/tree/wife"),
            postJson("/people/tree/siblings"),
            postJson("/people/tree/descendants"),
            postJson("/people/tree/metadata")
        ]);
        adminState.treeData.kids = results[0].status === "fulfilled" ? results[0].value : null;
        adminState.treeData.husb = results[1].status === "fulfilled" ? results[1].value : null;
        adminState.treeData.wife = results[2].status === "fulfilled" ? results[2].value : null;
        adminState.treeData.sibs = results[3].status === "fulfilled" ? results[3].value : null;
        adminState.treeData.desc = results[4].status === "fulfilled" ? results[4].value : null;
        adminState.treeData.metadata = results[5].status === "fulfilled" ? results[5].value : null;
        renderDataList();
        loadChartBuilds();
    } catch (error) {
        container.innerHTML = '<div class="text-center py-4"><p style="color: #ffb4b4;">Failed to load tree data.</p></div>';
    }
}

async function loadChartBuilds() {
    var listEl = document.getElementById("chartBuildsList");
    if (!listEl || !adminState.selectedUserFolder) return;

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/chart-builds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_scope_id: adminState.selectedUserFolder })
        });
        if (!response.ok) throw new Error("Failed");
        var data = await response.json();
        var builds = (data.chart_builds || []).filter(function(b) {
            return b.context_id === adminState.selectedContext;
        });
        if (!builds.length) {
            listEl.innerHTML = '<span style="color: var(--text-dark-gray);">No chart builds yet for this context.</span>';
            return;
        }
        var html = '<ul class="list-unstyled mb-0">';
        builds.forEach(function(build) {
            var safePath = escapeAttr(build.storage_path);
            var safeName = escapeAttr(build.filename);
            html += '<li class="mb-2" style="border-bottom: 1px solid var(--light-black); padding-bottom: 6px;">';
            html += '<div class="d-flex align-items-center justify-content-between">';
            html += '<span style="color: var(--text-gray); font-size: 0.9rem;">' + safeName + '</span>';
            html += '<div class="d-flex gap-1">';
            html += '<button class="btn btn-sm btn-outline-secondary" onclick="renamePdf(\'' + safePath + '\', \'' + safeName + '\')" title="Rename"><i class="fas fa-pen"></i></button>';
            html += '<button class="btn btn-sm btn-outline-warning" onclick="downloadPdf(\'' + safePath + '\', \'' + safeName + '\')" title="Download"><i class="fas fa-download"></i></button>';
            html += '</div></div></li>';
        });
        html += '</ul>';
        listEl.innerHTML = html;
    } catch (error) {
        listEl.innerHTML = '<span style="color: #ffb4b4;">Failed to load builds.</span>';
    }
}

async function renamePdf(storagePath, currentName) {
    var newName = prompt("Rename chart build:", currentName.replace(/\.pdf$/, ""));
    if (!newName || newName.trim() === currentName.replace(/\.pdf$/, "")) return;
    newName = newName.trim();

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/rename-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage_path: storagePath, new_name: newName })
        });
        if (!response.ok) throw new Error(await response.text());
        loadChartBuilds();
    } catch (error) {
        alert("Failed to rename: " + error.message);
    }
}

async function downloadPdf(storagePath, filename) {
    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/download-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage_path: storagePath })
        });
        if (!response.ok) throw new Error("Download failed");
        var blob = await response.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename || "tree.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert("Failed to download PDF.");
    }
}

async function postJson(endpoint) {
    var response = await fetch(TREE_BACKEND_BASE_URL + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getLookupPayload())
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Request failed: " + response.status);
    return response.json();
}

// ==================== Image Loading ====================

function loadPersonImage(imgElementId, imageName) {
    var payload = getLookupPayload();
    payload.image_name = imageName;
    fetch(TREE_BACKEND_BASE_URL + "/people/tree/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(function(r) { if (!r.ok) throw new Error(); return r.blob(); })
    .then(function(blob) {
        var img = document.getElementById(imgElementId);
        if (img) { img.src = URL.createObjectURL(blob); img.style.display = ""; }
    }).catch(function() {
        var img = document.getElementById(imgElementId);
        if (img) img.style.display = "none";
    });
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
    }).then(function(r) { if (!r.ok) throw new Error(); return r.blob(); })
    .then(function(blob) {
        var img = document.getElementById(imgElementId);
        if (img) { img.src = URL.createObjectURL(blob); img.style.display = ""; }
        var ph = document.getElementById(imgElementId + "_placeholder");
        if (ph) ph.style.display = "none";
    }).catch(function() {});
}

// ==================== Editing ====================

function startEdit(fieldKey) {
    adminState.editingField = fieldKey;
    renderDataList();
    setTimeout(function() {
        var input = document.getElementById("edit-input-" + fieldKey.replace(/[^a-zA-Z0-9]/g, "_"));
        if (input) input.focus();
    }, 50);
}

function cancelEdit() {
    adminState.editingField = null;
    renderDataList();
}

async function saveFieldEdit(section, personId, fieldName, newValue) {
    var payload = getLookupPayload();
    payload.json_type = SECTION_TO_JSON_TYPE[section] || section;
    payload.individual_id = personId;
    payload[fieldName] = newValue;

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await response.text());
        var result = await response.json();
        if (result.updated && adminState.treeData[section] && adminState.treeData[section][personId]) {
            var person = adminState.treeData[section][personId];
            if (fieldName === "first_name" && Array.isArray(person.name)) person.name[0] = newValue;
            else if (fieldName === "last_name" && Array.isArray(person.name)) person.name[1] = newValue;
            else if (fieldName === "birth") person.birth = newValue;
            else if (fieldName === "death") person.death = newValue;
        }
        adminState.editingField = null;
        renderDataList();
    } catch (error) {
        alert("Failed to save: " + error.message);
    }
}

// ==================== Add Person ====================

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

    if (mode === "new" && !personId) {
        personId = "LOCAL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    if (!personId) {
        if (errEl) { errEl.textContent = "No person selected."; errEl.style.display = ""; }
        return;
    }

    var includeSpouse = false;
    var spouseConfirm = document.getElementById("addPersonSpouseConfirm");
    if (spouseConfirm && spouseConfirm.style.display !== "none") {
        includeSpouse = document.getElementById("addPersonIncludeSpouse").checked;
    }

    var payload = getLookupPayload();
    payload.person_id = personId;
    payload.first_name = firstName;
    payload.last_name = lastName;
    payload.gender = gender;
    payload.birth = birth;
    payload.relationship = relationship;
    payload.relative_id = relativeId;
    payload.data_type = section;
    payload.mode = mode;
    payload.include_spouse = includeSpouse;

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
        selectTreeContext(adminState.selectedUserFolder, adminState.selectedContext);
    } catch (error) {
        if (errEl) { errEl.textContent = error.message; errEl.style.display = ""; }
    }
}

// ==================== Image Upload ====================

function triggerImageUpload(section, personId) {
    adminState.pendingImageEdit = { section: section, personId: personId };
    var fileInput = document.getElementById("imageUploadInput");
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
}

function triggerCoupleImageUpload(personId, spouseId) {
    adminState.pendingImageEdit = { coupleUpload: true, personId: personId, spouseId: spouseId };
    var fileInput = document.getElementById("imageUploadInput");
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
}

function handleImageFileSelected(input) {
    if (!input.files || !input.files[0] || !adminState.pendingImageEdit) return;
    var file = input.files[0];
    var info = adminState.pendingImageEdit;
    adminState.pendingImageEdit = null;

    var cropOpts = info.coupleUpload ? { aspectRatio: 4 / 3 } : {};
    showCropModal(file, cropOpts).then(function(croppedBlob) {
        if (!croppedBlob) return;
        var croppedFile = new File([croppedBlob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        if (info.coupleUpload) {
            uploadCoupleImage(info.personId, info.spouseId, croppedFile);
        } else {
            uploadNewImage(info.section, info.personId, croppedFile);
        }
    });
}

async function uploadNewImage(section, personId, file) {
    var formData = new FormData();
    formData.append("user_scope_id", adminState.selectedUserFolder);
    formData.append("context_id", adminState.selectedContext);
    formData.append("json_type", SECTION_TO_JSON_TYPE[section] || section);
    formData.append("individual_id", personId);
    formData.append("image", file);
    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update-image", { method: "POST", body: formData });
        if (!response.ok) throw new Error(await response.text());
        var result = await response.json();
        if (result.updated_image_path && adminState.treeData[section] && adminState.treeData[section][personId]) {
            adminState.treeData[section][personId].image = result.updated_image_path;
        }
        renderDataList();
    } catch (error) {
        alert("Failed to upload image.");
    }
}

async function uploadCoupleImage(personId, spouseId, file) {
    var formData = new FormData();
    formData.append("user_scope_id", adminState.selectedUserFolder);
    formData.append("context_id", adminState.selectedContext);
    formData.append("person_id", personId);
    formData.append("spouse_id", spouseId);
    formData.append("image", file);
    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update-couple-image", { method: "POST", body: formData });
        if (!response.ok) throw new Error(await response.text());
        var result = await response.json();
        if (result.updated_couple_image_path && adminState.treeData.desc) {
            if (adminState.treeData.desc[personId]) adminState.treeData.desc[personId].couple_image = result.updated_couple_image_path;
            if (adminState.treeData.desc[spouseId]) adminState.treeData.desc[spouseId].couple_image = result.updated_couple_image_path;
        }
        renderDataList();
    } catch (error) {
        alert("Failed to upload couple photo.");
    }
}

// ==================== Rendering (shared via tree-renderer.js) ====================

window.TreeRendererConfig = {
    getState: function() { return { expandedPersonId: adminState.expandedPersonId, editingField: adminState.editingField, treeData: adminState.treeData }; },
    togglePersonDetail: function(key) { adminState.expandedPersonId = adminState.expandedPersonId === key ? null : key; adminState.editingField = null; renderDataList(); },
    startEdit: function(key) { adminState.editingField = key; renderDataList(); setTimeout(function() { var el = document.getElementById("edit-input-" + key.replace(/[^a-zA-Z0-9]/g, "_")); if (el) el.focus(); }, 50); },
    cancelEdit: function() { adminState.editingField = null; renderDataList(); },
    saveFieldEdit: function(s, p, f, v) { saveFieldEdit(s, p, f, v); },
    triggerImageUpload: function(s, p) { triggerImageUpload(s, p); },
    triggerCoupleImageUpload: function(p, s) { triggerCoupleImageUpload(p, s); },
    loadPersonImage: function(id, name) { loadPersonImage(id, name); },
    loadCoupleImage: function(id, path) { loadCoupleImage(id, path); },
    getPersonName: function(pid) {
        var sections = ["husb", "wife", "kids", "sibs", "desc"];
        for (var i = 0; i < sections.length; i++) {
            var d = adminState.treeData[sections[i]];
            if (d && d[pid] && d[pid].name) return formatName(d[pid].name);
        }
        return "";
    },
    addPerson: function(relationship, section, relativeId) {
        window.TreeRenderer.showAddPersonModal(relationship, section, relativeId);
    },
    lookupFsPerson: function(fsId, callback) {
        var apiBase = (DASHBOARD_CONFIG.FS_API_BASE_URL || "https://api.familysearch.org") + "/platform/tree";
        var token = adminState.accessToken;
        if (!token) { callback(null); return; }
        fetch(apiBase + "/persons/" + fsId, {
            headers: { "Accept": "application/x-gedcomx-v1+json", "Authorization": "Bearer " + token }
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


function renderDataList() {
    var container = document.getElementById("dataListContainer");
    if (!container) return;
    var data = adminState.treeData;
    if (!data.kids && !data.husb && !data.wife && !data.sibs && !data.desc) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No data in this context.</p></div>';
        return;
    }
    var html = window.TreeRenderer.renderAllSections(data);
    container.innerHTML = html || '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No visible people.</p></div>';
}

// ==================== Build Chart ====================

function openBuildChartModal() {
    if (!adminState.selectedContext) { alert("Select a tree context first."); return; }
    document.getElementById("buildChartContextLabel").textContent = formatFolderName(adminState.selectedContext);
    document.getElementById("buildChartStatus").textContent = "";
    document.getElementById("submitBuildChartBtn").disabled = false;
    var modal = new bootstrap.Modal(document.getElementById("buildChartModal"));
    modal.show();
}

async function submitBuildChart() {
    var treeType = document.getElementById("buildChartType").value;
    var theme = document.getElementById("buildChartTheme").value;
    var maxGen = document.getElementById("buildChartGenerations").value;
    var statusEl = document.getElementById("buildChartStatus");
    document.getElementById("submitBuildChartBtn").disabled = true;
    statusEl.textContent = "Building chart... this may take a minute.";
    statusEl.style.color = "var(--text-gray)";

    var payload = getLookupPayload();
    payload.tree_type = treeType;
    payload.theme = theme;
    payload.max_generations = parseInt(maxGen, 10);
    payload.title = adminState.selectedContext;

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/build_chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await response.text());
        statusEl.textContent = "Chart build started! PDF will appear in builds when ready.";
        statusEl.style.color = "var(--gold-primary)";
        setTimeout(function() { loadChartBuilds(); }, 10000);
        setTimeout(function() { loadChartBuilds(); }, 30000);
        setTimeout(function() { loadChartBuilds(); }, 60000);
    } catch (error) {
        statusEl.textContent = "Build failed: " + error.message;
        statusEl.style.color = "#ffb4b4";
        document.getElementById("submitBuildChartBtn").disabled = false;
    }
}

// ==================== Init ====================

function logout() {
    deleteCookie("fs_access_token");
    deleteCookie("fs_refresh_token");
    sessionStorage.clear();
    window.location.href = "/login";
}

document.addEventListener("DOMContentLoaded", async function() {
    var accessToken = getCookie("fs_access_token");
    if (!accessToken) { window.location.href = "/login"; return; }
    adminState.accessToken = accessToken;

    var person = await fetchCurrentPerson(accessToken);
    if (person) {
        adminState.currentPerson = person;
        var el = document.getElementById("userDisplayName");
        if (el) el.textContent = person.name;
        var idEl = document.getElementById("userDisplayId");
        if (idEl) idEl.textContent = person.id;
    }

    var searchInput = document.getElementById("treeSearchInput");
    var debounceTimer = null;
    if (searchInput) {
        searchInput.addEventListener("input", function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() { searchTrees(searchInput.value.trim()); }, 400);
        });
        searchInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") { e.preventDefault(); clearTimeout(debounceTimer); searchTrees(searchInput.value.trim()); }
        });
    }
    var searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.addEventListener("click", function() { searchTrees(searchInput.value.trim()); });

    var buildChartType = document.getElementById("buildChartType");
    if (buildChartType) {
        buildChartType.addEventListener("change", function() {
            var genSelect = document.getElementById("buildChartGenerations");
            if (this.value === "descendant") {
                genSelect.innerHTML = '<option value="4">4</option><option value="3">3</option><option value="2">2</option>';
            } else {
                genSelect.innerHTML = '<option value="5">5</option><option value="4">4</option>';
            }
        });
    }
});
