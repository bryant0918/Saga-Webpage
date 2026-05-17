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

// ==================== Rendering ====================

function buildEditableField(label, value, fieldKey, section, personId, fieldName) {
    var isEditing = adminState.editingField === fieldKey;
    var safeKey = fieldKey.replace(/[^a-zA-Z0-9]/g, "_");
    var html = "";
    if (isEditing) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2 mt-1">';
        html += '<input type="text" id="edit-input-' + safeKey + '" class="form-control form-control-sm" value="' + escapeAttr(value || "") + '" style="background-color: var(--light-black); color: var(--text-gray); border-color: var(--gold-primary); max-width: 200px;">';
        html += '<button class="btn btn-sm" onclick="var v=document.getElementById(\'edit-input-' + safeKey + '\').value;saveFieldEdit(\'' + section + '\',\'' + personId + '\',\'' + fieldName + '\',v)" style="color: var(--gold-primary); padding: 2px 8px;"><i class="fas fa-check"></i></button>';
        html += '<button class="btn btn-sm" onclick="cancelEdit()" style="color: var(--text-dark-gray); padding: 2px 8px;"><i class="fas fa-times"></i></button>';
        html += "</div></div>";
    } else {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2"><span style="color: var(--text-gray);">' + escapeAttr(value || "-") + "</span>";
        html += '<button class="btn btn-sm p-0" onclick="event.stopPropagation();startEdit(\'' + fieldKey + '\')" style="color: var(--text-dark-gray); line-height: 1;"><i class="fas fa-pen-to-square" style="font-size: 0.75rem;"></i></button>';
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
    html += '<div id="' + imgId + '_placeholder" style="width: 110px; height: 110px; border-radius: 50%; border: 2px dashed var(--light-black); display: flex; align-items: center; justify-content: center; margin: 0 auto;"><i class="fas fa-camera" style="color: var(--text-dark-gray); font-size: 1.3rem;"></i></div>';
    html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;"><i class="fas fa-pen"></i></div>';
    html += "</div></div>";

    if (imageName) {
        setTimeout(function() {
            loadPersonImage(imgId, imageName);
            var ph = document.getElementById(imgId + "_placeholder");
            var imgEl = document.getElementById(imgId);
            if (imgEl) imgEl.addEventListener("load", function() { if (ph) ph.style.display = "none"; });
        }, 0);
    }

    html += '<div class="row">';
    html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Person ID</small><div style="color: var(--text-gray);">' + escapeAttr(personId) + "</div></div>";

    var firstName = Array.isArray(person.name) ? (person.name[0] || "") : formatName(person.name);
    var lastName = Array.isArray(person.name) ? (person.name[1] || "") : "";
    html += buildEditableField("First Name", firstName, section + "_" + personId + "_first_name", section, personId, "first_name");
    html += buildEditableField("Last Name", lastName, section + "_" + personId + "_last_name", section, personId, "last_name");
    if (person.birth !== undefined) html += buildEditableField("Birth", person.birth || "", section + "_" + personId + "_birth", section, personId, "birth");
    if (person.death !== undefined) html += buildEditableField("Death", person.death || "", section + "_" + personId + "_death", section, personId, "death");

    html += "</div></div>";
    return html;
}

function buildPersonListItem(person, personId, section, sectionLabel) {
    var name = formatName(person.name);
    var expandKey = section + "_" + personId;
    var isExpanded = adminState.expandedPersonId === expandKey;

    var html = '<div class="person-list-item mb-2">';
    html += '<div class="d-flex align-items-center justify-content-between p-3" style="background-color: var(--primary-black); border: 1px solid var(--light-black); border-radius: 8px; cursor: pointer;" onclick="togglePersonDetail(\'' + expandKey + '\')" onmouseover="this.style.borderColor=\'var(--gold-primary)\'" onmouseout="this.style.borderColor=\'var(--light-black)\'">';
    html += '<div class="d-flex align-items-center">';
    html += '<div style="width: 34px; height: 34px; border-radius: 50%; background-color: var(--light-black); display: flex; align-items: center; justify-content: center; margin-right: 10px;"><i class="fas fa-user" style="color: var(--gold-primary); font-size: 0.8rem;"></i></div>';
    html += '<div><div style="color: var(--text-gray); font-weight: 500;">' + escapeAttr(name) + '</div><small style="color: var(--text-dark-gray);">' + escapeAttr(sectionLabel) + "</small></div></div>";
    html += '<i class="fas fa-chevron-' + (isExpanded ? "up" : "down") + '" style="color: var(--text-dark-gray);"></i>';
    html += "</div>";
    if (isExpanded) html += '<div class="mt-1 ms-3">' + buildPersonDetailHTML(person, personId, section) + "</div>";
    html += "</div>";
    return html;
}

function togglePersonDetail(expandKey) {
    adminState.expandedPersonId = adminState.expandedPersonId === expandKey ? null : expandKey;
    adminState.editingField = null;
    renderDataList();
}

// ==================== Couple/Generation Rendering ====================

function getSpouseIds(person) {
    if (!person) return [];
    if (Array.isArray(person.spouse_ids)) return person.spouse_ids.filter(Boolean).map(String);
    if (Array.isArray(person.spouses)) return person.spouses.filter(Boolean).map(String);
    if (person.spouse_id) return [String(person.spouse_id)];
    return [];
}

function buildCoupleRows(entries) {
    var byId = {};
    entries.forEach(function(e) { byId[e.id] = e; });
    var used = {};
    var rows = [];
    entries.forEach(function(entry) {
        if (used[entry.id]) return;
        var spouseIds = getSpouseIds(entry.person);
        var matched = null;
        for (var i = 0; i < spouseIds.length; i++) {
            if (byId[spouseIds[i]] && !used[spouseIds[i]]) { matched = byId[spouseIds[i]]; break; }
        }
        if (matched) { used[entry.id] = true; used[matched.id] = true; rows.push([entry, matched]); }
        else { used[entry.id] = true; rows.push([entry]); }
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
            html += buildPersonListItem(entry.person, entry.id, entry.section || section, entry.label || label);
            html += "</div>";
        });
        if (rowEntries.length === 1) html += '<div class="col-12 col-lg-6"></div>';
        html += "</div>";

        if (rowEntries.length === 2 && section === "desc") {
            var a = rowEntries[0], b = rowEntries[1];
            var coupleImg = (a.person && a.person.couple_image) || (b.person && b.person.couple_image);
            var cId = "couple-img-" + a.id + "-" + b.id;
            html += '<div class="text-center mb-2 mt-1">';
            if (coupleImg) {
                html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="triggerCoupleImageUpload(\'' + escapeAttr(a.id) + '\',\'' + escapeAttr(b.id) + '\')">';
                html += '<img id="' + cId + '" style="display: none; max-width: 140px; max-height: 100px; border-radius: 8px; border: 2px solid var(--gold-primary);">';
                html += '<div id="' + cId + '_placeholder" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; border: 1px dashed var(--gold-primary); color: var(--gold-primary); font-size: 0.8rem;"><i class="fas fa-image"></i> Loading...</div>';
                html += "</div>";
                setTimeout(function() { loadCoupleImage(cId, coupleImg); }, 0);
            } else {
                html += '<button class="btn btn-sm" style="border: 1px dashed var(--light-black); color: var(--text-dark-gray); font-size: 0.8rem;" onclick="triggerCoupleImageUpload(\'' + escapeAttr(a.id) + '\',\'' + escapeAttr(b.id) + '\')"><i class="fas fa-image me-1"></i>Upload Couple Photo</button>';
            }
            html += "</div>";
        }
    });
    return html;
}

function deriveGenerationsFromParentGraph(data) {
    var gen = {};
    if (!data) return gen;
    var ids = Object.keys(data);
    if (!ids.length) return gen;
    var refs = {};
    ids.forEach(function(id) { (Array.isArray(data[id] && data[id].parents) ? data[id].parents : []).forEach(function(p) { refs[p] = true; }); });
    var roots = ids.filter(function(id) { return !refs[id]; });
    if (!roots.length) roots = [ids[0]];
    var q = roots.map(function(id) { return { id: id, g: 1 }; });
    while (q.length) {
        var cur = q.shift();
        if (!data[cur.id]) continue;
        if (gen[cur.id] !== undefined && gen[cur.id] <= cur.g) continue;
        gen[cur.id] = cur.g;
        (Array.isArray(data[cur.id].parents) ? data[cur.id].parents : []).forEach(function(pid) {
            if (data[pid]) q.push({ id: pid, g: cur.g + 1 });
        });
    }
    return gen;
}

function deriveAncestorSpouses(primaryData, spouseData) {
    var spouseMap = {};
    [primaryData, spouseData].forEach(function(d) {
        if (!d) return;
        Object.keys(d).forEach(function(id) {
            var parents = d[id] && Array.isArray(d[id].parents) ? d[id].parents : [];
            if (parents.length === 2) { spouseMap[parents[0]] = parents[1]; spouseMap[parents[1]] = parents[0]; }
        });
    });
    [primaryData, spouseData].forEach(function(d) {
        if (!d) return;
        Object.keys(d).forEach(function(id) { if (spouseMap[id] && !d[id].spouse_id) d[id].spouse_id = spouseMap[id]; });
    });
}

function renderAncestorSections(primaryData, spouseData) {
    if ((!primaryData || !Object.keys(primaryData).length) && (!spouseData || !Object.keys(spouseData).length)) return "";
    deriveAncestorSpouses(primaryData, spouseData);
    var primaryGen = deriveGenerationsFromParentGraph(primaryData || {});
    var spouseGen = deriveGenerationsFromParentGraph(spouseData || {});
    var groups = {}, order = [];

    function add(id, person, section, label, generation) {
        var g = Number.isFinite(person && person.generation) ? person.generation : (Number.isFinite(generation) ? generation : 999);
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push({ id: id, person: person, section: section, label: label });
    }
    if (primaryData) Object.keys(primaryData).forEach(function(id) { add(id, primaryData[id], "husb", "Primary Ancestor", primaryGen[id]); });
    if (spouseData) Object.keys(spouseData).forEach(function(id) { add(id, spouseData[id], "wife", "Spouse Ancestor", spouseGen[id]); });
    order.sort(function(a, b) { return a - b; });

    var total = (primaryData ? Object.keys(primaryData).length : 0) + (spouseData ? Object.keys(spouseData).length : 0);
    var html = '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);"><i class="fas fa-sitemap me-2"></i>Ancestors (' + total + ")</h5>";
    order.forEach(function(g) {
        html += '<h6 class="mt-3 mb-2" style="color: var(--text-dark-gray); border-bottom: 1px solid var(--light-black); padding-bottom: 6px;">' + (g === 999 ? "Generation Unknown" : "Generation " + g) + "</h6>";
        groups[g].sort(function(a, b) { return formatName(a.person && a.person.name).localeCompare(formatName(b.person && b.person.name)); });
        html += renderEntryRows(groups[g], "husb", "Ancestor");
    });
    return html;
}

function renderSection(titleHtml, data, section, label, groupByGen) {
    if (!data || !Object.keys(data).length) return "";
    var keys = Object.keys(data);
    var entries = keys.map(function(id) { return { id: id, person: data[id] }; });
    var html = '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);">' + titleHtml + " (" + entries.length + ")</h5>";
    if (groupByGen) {
        var genMap = deriveGenerationsFromParentGraph(data);
        var groups = {}, order = [];
        entries.forEach(function(e) {
            var g = Number.isFinite(e.person && e.person.generation) ? e.person.generation : (genMap[e.id] || 999);
            if (!groups[g]) { groups[g] = []; order.push(g); }
            groups[g].push(e);
        });
        order.sort(function(a, b) { return a - b; });
        order.forEach(function(g) {
            html += '<h6 class="mt-3 mb-2" style="color: var(--text-dark-gray); border-bottom: 1px solid var(--light-black); padding-bottom: 6px;">' + (g === 999 ? "Generation Unknown" : "Generation " + g) + "</h6>";
            html += renderEntryRows(groups[g], section, label);
        });
    } else {
        html += renderEntryRows(entries, section, label);
    }
    return html;
}

function renderDataList() {
    var container = document.getElementById("dataListContainer");
    if (!container) return;
    var data = adminState.treeData;
    if (!data.kids && !data.husb && !data.wife && !data.sibs && !data.desc) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No data in this context.</p></div>';
        return;
    }
    var html = "";
    html += renderAncestorSections(data.husb, data.wife);
    html += renderSection('<i class="fas fa-people-group me-2"></i>Siblings', data.sibs, "sibs", "Sibling", false);
    html += renderSection('<i class="fas fa-child me-2"></i>Children', data.kids, "kids", "Child", false);
    html += renderSection('<i class="fas fa-people-arrows me-2"></i>Descendants', data.desc, "desc", "Descendant", true);
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
