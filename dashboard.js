var TREE_BACKEND_BASE_URL = "https://family-trees.replit.app";

var dashboardState = {
    accessToken: null,
    currentPerson: null,
    treeData: {
        kids: null,
        husb: null,
        wife: null
    },
    expandedPersonId: null,
    lookupTitle: "",
    lookupPersonId: "",
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

async function fetchCurrentPerson(accessToken) {
    try {
        var response = await fetch("https://api.familysearch.org/platform/tree/current-person", {
            method: "GET",
            headers: {
                "Accept": "application/x-gedcomx-v1+json",
                "Authorization": "Bearer " + accessToken
            }
        });
        if (!response.ok) throw new Error("Failed to fetch current person");
        var data = await response.json();
        var person = data.persons && data.persons[0];
        if (person) {
            return {
                name: (person.display && person.display.name) || "Unknown",
                id: person.id || "Unknown"
            };
        }
        return null;
    } catch (error) {
        console.error("Error fetching current person:", error);
        return null;
    }
}

async function fetchTreeData(endpoint, title, familySearchId) {
    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/" + endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: title, family_search_id: familySearchId })
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Request failed with status " + response.status);
        return await response.json();
    } catch (error) {
        console.error("Error fetching " + endpoint + " data:", error);
        throw error;
    }
}

function formatName(nameArr) {
    if (!nameArr || !Array.isArray(nameArr)) return "Unknown";
    return nameArr.filter(Boolean).join(" ");
}

function getImageName(imagePath) {
    if (!imagePath) return null;
    var parts = imagePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1];
}

function loadPersonImage(imgElementId, title, familySearchId, imageName) {
    fetch(TREE_BACKEND_BASE_URL + "/people/tree/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title, family_search_id: familySearchId, image_name: imageName })
    }).then(function(response) {
        if (!response.ok) throw new Error("Image not found");
        return response.blob();
    }).then(function(blob) {
        var img = document.getElementById(imgElementId);
        if (img) {
            img.src = URL.createObjectURL(blob);
            img.style.display = "";
        }
    }).catch(function() {
        var img = document.getElementById(imgElementId);
        if (img) img.style.display = "none";
    });
}

function escapeAttr(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function saveFieldEdit(section, personId, fieldName, newValue) {
    var payload = {
        title: dashboardState.lookupTitle,
        family_search_id: dashboardState.lookupPersonId,
        json_type: section,
        individual_id: personId
    };
    payload[fieldName] = newValue;

    try {
        var response = await fetch(TREE_BACKEND_BASE_URL + "/people/tree/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            var errText = await response.text();
            throw new Error(errText || "Update failed");
        }
        var result = await response.json();
        if (result.updated && dashboardState.treeData[section] && dashboardState.treeData[section][personId]) {
            var person = dashboardState.treeData[section][personId];
            if (fieldName === "first_name" && person.name) {
                person.name[0] = newValue;
            } else if (fieldName === "last_name" && person.name) {
                person.name[1] = newValue;
            } else if (fieldName === "birth") {
                person.birth = newValue;
            } else if (fieldName === "death") {
                person.death = newValue;
            }
        }
        dashboardState.editingField = null;
        renderDataList();
    } catch (error) {
        console.error("Error saving field:", error);
        alert("Failed to save changes. Please try again.");
    }
}

async function uploadNewImage(section, personId, file) {
    var formData = new FormData();
    formData.append("title", dashboardState.lookupTitle);
    formData.append("family_search_id", dashboardState.lookupPersonId);
    formData.append("json_type", section);
    formData.append("individual_id", personId);
    formData.append("image", file);

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
    } catch (error) {
        console.error("Error uploading image:", error);
        alert("Failed to upload image. Please try again.");
    }
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

function triggerImageUpload(section, personId) {
    dashboardState.pendingImageEdit = { section: section, personId: personId };
    var fileInput = document.getElementById("imageUploadInput");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

function handleImageFileSelected(input) {
    if (!input.files || !input.files[0] || !dashboardState.pendingImageEdit) return;
    var file = input.files[0];
    var info = dashboardState.pendingImageEdit;
    dashboardState.pendingImageEdit = null;
    uploadNewImage(info.section, info.personId, file);
}

function buildEditableField(label, value, fieldKey, section, personId, fieldName) {
    var isEditing = dashboardState.editingField === fieldKey;
    var safeKey = fieldKey.replace(/[^a-zA-Z0-9]/g, "_");
    var html = '';

    if (isEditing) {
        html += '<div class="col-sm-6 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">' + label + '</small>';
        html += '<div class="d-flex align-items-center gap-2 mt-1">';
        html += '<input type="text" id="edit-input-' + safeKey + '" class="form-control form-control-sm" value="' + escapeAttr(value) + '" style="background-color: var(--light-black); color: var(--text-gray); border-color: var(--gold-primary); max-width: 180px;">';
        html += '<button class="btn btn-sm" onclick="var v=document.getElementById(\'edit-input-' + safeKey + '\').value;saveFieldEdit(\'' + section + '\',\'' + personId + '\',\'' + fieldName + '\',v)" style="color: var(--gold-primary); padding: 2px 8px;" title="Save"><i class="fas fa-check"></i></button>';
        html += '<button class="btn btn-sm" onclick="cancelEdit()" style="color: var(--text-dark-gray); padding: 2px 8px;" title="Cancel"><i class="fas fa-times"></i></button>';
        html += '</div></div>';
    } else {
        html += '<div class="col-sm-6 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">' + label + '</small>';
        html += '<div class="d-flex align-items-center gap-2">';
        html += '<span style="color: var(--text-gray);">' + (value || "—") + '</span>';
        html += '<button class="btn btn-sm p-0" onclick="event.stopPropagation();startEdit(\'' + fieldKey + '\')" style="color: var(--text-dark-gray); line-height: 1;" title="Edit ' + label + '"><i class="fas fa-pen-to-square" style="font-size: 0.75rem;"></i></button>';
        html += '</div></div>';
    }
    return html;
}

function buildPersonDetailHTML(person, personId, section) {
    var html = '<div class="person-detail-content p-3" style="background-color: var(--deep-black); border-radius: 8px;">';
    var imageName = getImageName(person.image);
    var imgId = "person-img-" + section + "-" + personId.replace(/[^a-zA-Z0-9]/g, "_");

    html += '<div class="text-center mb-3">';
    html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="event.stopPropagation();triggerImageUpload(\'' + section + '\',\'' + personId + '\')">';
    html += '<img id="' + imgId + '" alt="' + formatName(person.name) + '" style="display: none; max-width: 120px; max-height: 120px; border-radius: 50%; border: 2px solid var(--gold-primary);">';
    html += '<div id="' + imgId + '_placeholder" style="width: 120px; height: 120px; border-radius: 50%; border: 2px dashed var(--light-black); display: flex; align-items: center; justify-content: center; margin: 0 auto;">';
    html += '<i class="fas fa-camera" style="color: var(--text-dark-gray); font-size: 1.5rem;"></i>';
    html += '</div>';
    html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">';
    html += '<i class="fas fa-pen"></i>';
    html += '</div>';
    html += '</div>';
    html += '<div style="margin-top: 4px;"><small style="color: var(--text-dark-gray);">Click to change image</small></div>';
    html += '</div>';

    if (imageName) {
        setTimeout(function() {
            loadPersonImage(imgId, dashboardState.lookupTitle, dashboardState.lookupPersonId, imageName);
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

    html += '<div class="col-sm-6 mb-2">';
    html += '<small style="color: var(--text-dark-gray);">Person ID</small>';
    html += '<div style="color: var(--text-gray);">' + personId + '</div>';
    html += '</div>';

    var firstName = (person.name && person.name[0]) || "";
    var lastName = (person.name && person.name[1]) || "";
    var fKey = section + "_" + personId + "_first_name";
    var lKey = section + "_" + personId + "_last_name";
    html += buildEditableField("First Name", firstName, fKey, section, personId, "first_name");
    html += buildEditableField("Last Name", lastName, lKey, section, personId, "last_name");

    if (person.birth !== undefined) {
        var bKey = section + "_" + personId + "_birth";
        html += buildEditableField("Birth", person.birth || "", bKey, section, personId, "birth");
    }

    if (section !== "kids" && person.death !== undefined) {
        var dKey = section + "_" + personId + "_death";
        html += buildEditableField("Death", person.death || "", dKey, section, personId, "death");
    }

    if (section === "kids" && person.birth_year) {
        html += '<div class="col-sm-6 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">Birth Year</small>';
        html += '<div style="color: var(--text-gray);">' + person.birth_year + '</div>';
        html += '</div>';
    }

    if (person.parents && Array.isArray(person.parents)) {
        html += '<div class="col-12 mb-2">';
        html += '<small style="color: var(--text-dark-gray);">Parents</small>';
        html += '<div style="color: var(--text-gray);">' + person.parents.join(", ") + '</div>';
        html += '</div>';
    }

    html += '</div></div>';
    return html;
}

function buildPersonListItem(person, personId, section, sectionLabel) {
    var name = formatName(person.name);
    var isExpanded = dashboardState.expandedPersonId === (section + "_" + personId);
    var expandKey = section + "_" + personId;

    var html = '<div class="person-list-item mb-2">';
    html += '<div class="d-flex align-items-center justify-content-between p-3" style="background-color: var(--primary-black); border: 1px solid var(--light-black); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;" ';
    html += 'onclick="togglePersonDetail(\'' + expandKey + '\')" ';
    html += 'onmouseover="this.style.borderColor=\'var(--gold-primary)\'" onmouseout="this.style.borderColor=\'var(--light-black)\'">';

    html += '<div class="d-flex align-items-center">';
    html += '<div style="width: 36px; height: 36px; border-radius: 50%; background-color: var(--light-black); display: flex; align-items: center; justify-content: center; margin-right: 12px;">';
    if (section === "kids") {
        html += '<i class="fas fa-child" style="color: var(--gold-primary); font-size: 0.85rem;"></i>';
    } else {
        html += '<i class="fas fa-user" style="color: var(--gold-primary); font-size: 0.85rem;"></i>';
    }
    html += '</div>';
    html += '<div>';
    html += '<div style="color: var(--text-gray); font-weight: 500;">' + name + '</div>';
    html += '<small style="color: var(--text-dark-gray);">' + sectionLabel + '</small>';
    html += '</div>';
    html += '</div>';

    html += '<i class="fas fa-chevron-' + (isExpanded ? 'up' : 'down') + '" style="color: var(--text-dark-gray);"></i>';
    html += '</div>';

    if (isExpanded) {
        html += '<div class="mt-1 ms-4">' + buildPersonDetailHTML(person, personId, section) + '</div>';
    }

    html += '</div>';
    return html;
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

function renderDataList() {
    var container = document.getElementById("dataListContainer");
    if (!container) return;

    var data = dashboardState.treeData;
    if (!data.kids && !data.husb && !data.wife) {
        container.innerHTML = '<div class="text-center py-5"><p style="color: var(--text-dark-gray);">No data found for this title and person ID. Data may not have been processed yet.</p></div>';
        return;
    }

    var html = '';
    var totalCount = 0;

    if (data.kids && Object.keys(data.kids).length > 0) {
        var kidsKeys = Object.keys(data.kids);
        kidsKeys.sort(function(a, b) {
            var yearA = data.kids[a].birth_year || 9999;
            var yearB = data.kids[b].birth_year || 9999;
            return yearA - yearB;
        });
        html += '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);"><i class="fas fa-child me-2"></i>Children (' + kidsKeys.length + ')</h5>';
        kidsKeys.forEach(function(id) {
            html += buildPersonListItem(data.kids[id], id, "kids", "Child");
            totalCount++;
        });
    }

    if (data.husb && Object.keys(data.husb).length > 0) {
        var husbKeys = Object.keys(data.husb);
        html += '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);"><i class="fas fa-user me-2"></i>Husband\'s Ancestors (' + husbKeys.length + ')</h5>';
        husbKeys.forEach(function(id) {
            html += buildPersonListItem(data.husb[id], id, "husb", "Husband\'s Line");
            totalCount++;
        });
    }

    if (data.wife && Object.keys(data.wife).length > 0) {
        var wifeKeys = Object.keys(data.wife);
        html += '<h5 class="mb-3 mt-4" style="color: var(--gold-primary);"><i class="fas fa-user me-2"></i>Wife\'s Ancestors (' + wifeKeys.length + ')</h5>';
        wifeKeys.forEach(function(id) {
            html += buildPersonListItem(data.wife[id], id, "wife", "Wife\'s Line");
            totalCount++;
        });
    }

    if (totalCount > 0) {
        html = '<p class="mb-3" style="color: var(--text-dark-gray);">' + totalCount + ' people found</p>' + html;
    }

    container.innerHTML = html;
}

async function loadTreeData() {
    var titleInput = document.getElementById("dataTitle");
    var personIdInput = document.getElementById("dataPersonId");
    var container = document.getElementById("dataListContainer");

    var title = titleInput.value.trim();
    var personId = personIdInput.value.trim();

    if (!title || !personId) {
        container.innerHTML = '<div class="text-center py-4"><p style="color: #dc3545;">Please enter both a title and a FamilySearch person ID.</p></div>';
        return;
    }

    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning mb-3" role="status"><span class="visually-hidden">Loading...</span></div><p style="color: var(--text-gray);">Loading tree data...</p></div>';

    dashboardState.expandedPersonId = null;
    dashboardState.editingField = null;
    dashboardState.treeData = { kids: null, husb: null, wife: null };
    dashboardState.lookupTitle = title;
    dashboardState.lookupPersonId = personId;

    try {
        var results = await Promise.allSettled([
            fetchTreeData("kids", title, personId),
            fetchTreeData("husb", title, personId),
            fetchTreeData("wife", title, personId)
        ]);

        dashboardState.treeData.kids = results[0].status === "fulfilled" ? results[0].value : null;
        dashboardState.treeData.husb = results[1].status === "fulfilled" ? results[1].value : null;
        dashboardState.treeData.wife = results[2].status === "fulfilled" ? results[2].value : null;

        var anyErrors = results.filter(function(r) { return r.status === "rejected"; });
        if (anyErrors.length === 3) {
            container.innerHTML = '<div class="text-center py-5"><i class="fas fa-exclamation-triangle fa-2x mb-3" style="color: #dc3545;"></i><p style="color: #dc3545;">Failed to load tree data. Please check the title and person ID and try again.</p></div>';
            return;
        }

        renderDataList();
    } catch (error) {
        console.error("Error loading tree data:", error);
        container.innerHTML = '<div class="text-center py-5"><i class="fas fa-exclamation-triangle fa-2x mb-3" style="color: #dc3545;"></i><p style="color: #dc3545;">An unexpected error occurred. Please try again.</p></div>';
    }
}

function logout() {
    deleteCookie("fs_access_token");
    deleteCookie("fs_refresh_token");
    deleteCookie("oauth_state");
    sessionStorage.clear();
    window.location.href = "/login";
}

document.addEventListener("DOMContentLoaded", async function() {
    var accessToken = getCookie("fs_access_token");
    if (!accessToken) {
        window.location.href = "/login";
        return;
    }

    dashboardState.accessToken = accessToken;

    var userNameEl = document.getElementById("userDisplayName");
    var userIdEl = document.getElementById("userDisplayId");

    var person = await fetchCurrentPerson(accessToken);
    if (person) {
        dashboardState.currentPerson = person;
        if (userNameEl) userNameEl.textContent = person.name;
        if (userIdEl) userIdEl.textContent = person.id;
    } else {
        if (userNameEl) userNameEl.textContent = "Authenticated User";
        if (userIdEl) userIdEl.textContent = "";
    }

    var loadDataBtn = document.getElementById("loadDataBtn");
    if (loadDataBtn) {
        loadDataBtn.addEventListener("click", loadTreeData);
    }

    var dataPersonIdInput = document.getElementById("dataPersonId");
    var dataTitleInput = document.getElementById("dataTitle");
    [dataPersonIdInput, dataTitleInput].forEach(function(input) {
        if (input) {
            input.addEventListener("keypress", function(e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    loadTreeData();
                }
            });
        }
    });
});
