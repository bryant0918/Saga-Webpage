/**
 * Shared tree rendering logic used by both dashboard.js and admin.js.
 *
 * Requires the host page to set window.TreeRendererConfig before use:
 * {
 *   getState: function() { return { expandedPersonId, editingField, treeData }; },
 *   setState: function(key, value) {},
 *   renderDataList: function() {},
 *   loadPersonImage: function(imgId, imageName) {},
 *   loadCoupleImage: function(imgId, path) {},
 *   triggerImageUpload: function(section, personId) {},
 *   triggerCoupleImageUpload: function(personId, spouseId) {},
 *   startEdit: function(fieldKey) {},
 *   cancelEdit: function() {},
 *   saveFieldEdit: function(section, personId, fieldName, newValue) {},
 * }
 */

(function() {
"use strict";

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

function getSpouseIds(person) {
    if (!person) return [];
    if (Array.isArray(person.spouse_ids)) return person.spouse_ids.filter(Boolean).map(String);
    if (Array.isArray(person.spouses)) return person.spouses.filter(Boolean).map(String);
    if (person.spouse_id) return [String(person.spouse_id)];
    return [];
}

function sortByGenerationThenName(data, keys) {
    keys.sort(function(a, b) {
        var genA = data[a] && data[a].generation != null ? data[a].generation : 999;
        var genB = data[b] && data[b].generation != null ? data[b].generation : 999;
        if (genA !== genB) return genA - genB;
        return formatName(data[a] && data[a].name).localeCompare(formatName(data[b] && data[b].name));
    });
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
    return keys.map(function(id) { return { id: id, person: data[id] }; });
}

function buildCoupleRows(entries) {
    var byId = {};
    entries.forEach(function(entry) { byId[entry.id] = entry; });

    var spouseMap = {};
    entries.forEach(function(entry) {
        var sids = getSpouseIds(entry.person);
        sids.forEach(function(sid) {
            if (byId[sid]) { spouseMap[entry.id] = sid; spouseMap[sid] = entry.id; }
        });
    });

    var used = {};
    var rows = [];
    entries.forEach(function(entry) {
        if (used[entry.id]) return;
        var partnerId = spouseMap[entry.id];
        if (partnerId && byId[partnerId] && !used[partnerId]) {
            used[entry.id] = true;
            used[partnerId] = true;
            rows.push([entry, byId[partnerId]]);
        } else {
            used[entry.id] = true;
            rows.push([entry]);
        }
    });
    return rows;
}

function deriveGenerationsFromParentGraph(data) {
    var gen = {};
    if (!data) return gen;
    var ids = Object.keys(data);
    if (!ids.length) return gen;

    // First, use any stored generation values
    ids.forEach(function(id) {
        if (data[id] && Number.isFinite(data[id].generation)) {
            gen[id] = data[id].generation;
        }
    });

    // For people without stored generation, derive from parent graph
    var refs = {};
    ids.forEach(function(id) {
        (Array.isArray(data[id] && data[id].parents) ? data[id].parents : []).forEach(function(p) { refs[p] = true; });
    });
    var roots = ids.filter(function(id) { return !refs[id] && gen[id] === undefined; });
    if (roots.length) {
        var q = roots.map(function(id) { return { id: id, g: 1 }; });
        while (q.length) {
            var cur = q.shift();
            if (!data[cur.id]) continue;
            if (gen[cur.id] !== undefined && gen[cur.id] <= cur.g) continue;
            gen[cur.id] = cur.g;
            (Array.isArray(data[cur.id].parents) ? data[cur.id].parents : []).forEach(function(pid) {
                if (data[pid] && gen[pid] === undefined) q.push({ id: pid, g: cur.g + 1 });
            });
        }
    }

    return gen;
}

function buildEditableField(label, value, fieldKey, section, personId, fieldName) {
    var cfg = window.TreeRendererConfig;
    var state = cfg.getState();
    var isEditing = state.editingField === fieldKey;
    var safeKey = fieldKey.replace(/[^a-zA-Z0-9]/g, "_");
    var html = "";
    if (isEditing) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2 mt-1">';
        html += '<input type="text" id="edit-input-' + safeKey + '" class="form-control form-control-sm" value="' + escapeAttr(value || "") + '" style="background-color: var(--light-black); color: var(--text-gray); border-color: var(--gold-primary); max-width: 200px;">';
        html += '<button class="btn btn-sm" onclick="var v=document.getElementById(\'edit-input-' + safeKey + '\').value;window.TreeRendererConfig.saveFieldEdit(\'' + section + '\',\'' + personId + '\',\'' + fieldName + '\',v)" style="color: var(--gold-primary); padding: 2px 8px;"><i class="fas fa-check"></i></button>';
        html += '<button class="btn btn-sm" onclick="window.TreeRendererConfig.cancelEdit()" style="color: var(--text-dark-gray); padding: 2px 8px;"><i class="fas fa-times"></i></button>';
        html += "</div></div>";
    } else {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">' + label + "</small>";
        html += '<div class="d-flex align-items-center gap-2"><span style="color: var(--text-gray);">' + escapeAttr(value || "-") + "</span>";
        html += '<button class="btn btn-sm p-0" onclick="event.stopPropagation();window.TreeRendererConfig.startEdit(\'' + fieldKey + '\')" style="color: var(--text-dark-gray); line-height: 1;"><i class="fas fa-pen-to-square" style="font-size: 0.75rem;"></i></button>';
        html += "</div></div>";
    }
    return html;
}

function buildPersonDetailHTML(person, personId, section) {
    var cfg = window.TreeRendererConfig;
    var html = '<div class="person-detail-content p-3" style="background-color: var(--deep-black); border-radius: 8px;">';
    var imageName = getImageName(person.image);
    var imgId = "person-img-" + section + "-" + personId.replace(/[^a-zA-Z0-9]/g, "_");

    html += '<div class="text-center mb-3">';
    html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="event.stopPropagation();window.TreeRendererConfig.triggerImageUpload(\'' + section + '\',\'' + personId + '\')">';
    html += '<img id="' + imgId + '" alt="' + escapeAttr(formatName(person.name)) + '" style="display: none; max-width: 110px; max-height: 110px; border-radius: 50%; border: 2px solid var(--gold-primary);">';
    html += '<div id="' + imgId + '_placeholder" style="width: 110px; height: 110px; border-radius: 50%; border: 2px dashed var(--light-black); display: flex; align-items: center; justify-content: center; margin: 0 auto;"><i class="fas fa-camera" style="color: var(--text-dark-gray); font-size: 1.3rem;"></i></div>';
    html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;"><i class="fas fa-pen"></i></div>';
    html += "</div></div>";

    if (imageName) {
        setTimeout(function() {
            cfg.loadPersonImage(imgId, imageName);
            var imgEl = document.getElementById(imgId);
            var placeholder = document.getElementById(imgId + "_placeholder");
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
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Generation</small><div style="color: var(--text-gray);">' + escapeAttr(String(person.generation)) + "</div></div>";
    }

    var firstName = Array.isArray(person.name) ? (person.name[0] || "") : formatName(person.name);
    var lastName = Array.isArray(person.name) ? (person.name[1] || "") : "";
    html += buildEditableField("First Name", firstName, section + "_" + personId + "_first_name", section, personId, "first_name");
    html += buildEditableField("Last Name", lastName, section + "_" + personId + "_last_name", section, personId, "last_name");
    if (person.birth !== undefined) html += buildEditableField("Birth", person.birth || "", section + "_" + personId + "_birth", section, personId, "birth");
    if (person.death !== undefined) html += buildEditableField("Death", person.death || "", section + "_" + personId + "_death", section, personId, "death");

    if (Array.isArray(person.parents) && person.parents.length) {
        var parentLabels = person.parents.map(function(pid) {
            var pName = cfg.getPersonName ? cfg.getPersonName(pid) : "";
            return pName ? pName + " (" + pid + ")" : pid;
        });
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Parents</small>';
        html += '<div style="color: var(--text-gray);">' + escapeAttr(parentLabels.join(", ")) + '</div>';
        if (person.parents.length < 2 && (section === "husb" || section === "wife")) {
            html += '<button class="btn btn-sm btn-outline-warning mt-1" onclick="event.stopPropagation();window.TreeRendererConfig.addPerson(\'parent\', \'' + section + '\', \'' + personId + '\')"><i class="fas fa-plus me-1"></i>Add Parent</button>';
        }
        html += '</div>';
    } else if (section === "husb" || section === "wife") {
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Parents</small>';
        html += '<div style="color: var(--text-dark-gray);">None listed</div>';
        html += '<button class="btn btn-sm btn-outline-warning mt-1" onclick="event.stopPropagation();window.TreeRendererConfig.addPerson(\'parent\', \'' + section + '\', \'' + personId + '\')"><i class="fas fa-plus me-1"></i>Add Parent</button>';
        html += '</div>';
    }

    if (Array.isArray(person.children) && person.children.length) {
        var childLabels = person.children.map(function(cid) {
            var cName = cfg.getPersonName ? cfg.getPersonName(cid) : "";
            return cName ? cName + " (" + cid + ")" : cid;
        });
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Children</small>';
        html += '<div style="color: var(--text-gray);">' + escapeAttr(childLabels.join(", ")) + '</div>';
        if (section === "desc") {
            html += '<button class="btn btn-sm btn-outline-warning mt-1" onclick="event.stopPropagation();window.TreeRendererConfig.addPerson(\'child\', \'' + section + '\', \'' + personId + '\')"><i class="fas fa-plus me-1"></i>Add Child</button>';
        }
        html += '</div>';
    } else if (section === "desc") {
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Children</small>';
        html += '<div style="color: var(--text-dark-gray);">None</div>';
        html += '<button class="btn btn-sm btn-outline-warning mt-1" onclick="event.stopPropagation();window.TreeRendererConfig.addPerson(\'child\', \'' + section + '\', \'' + personId + '\')"><i class="fas fa-plus me-1"></i>Add Child</button>';
        html += '</div>';
    }

    if (person.spouse_id) {
        var spouseName = cfg.getPersonName ? cfg.getPersonName(person.spouse_id) : "";
        var spouseLabel = spouseName ? spouseName + " (" + person.spouse_id + ")" : person.spouse_id;
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Spouse</small><div style="color: var(--text-gray);">' + escapeAttr(spouseLabel) + "</div></div>";
    }

    html += "</div></div>";
    return html;
}

function buildPersonListItem(person, personId, section, sectionLabel) {
    var cfg = window.TreeRendererConfig;
    var state = cfg.getState();
    var name = formatName(person.name);
    var expandKey = section + "_" + personId;
    var isExpanded = state.expandedPersonId === expandKey;

    var html = '<div class="person-list-item mb-2">';
    html += '<div class="d-flex align-items-center justify-content-between p-3" style="background-color: var(--primary-black); border: 1px solid var(--light-black); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;" onclick="window.TreeRendererConfig.togglePersonDetail(\'' + expandKey + '\')" onmouseover="this.style.borderColor=\'var(--gold-primary)\'" onmouseout="this.style.borderColor=\'var(--light-black)\'">';
    html += '<div class="d-flex align-items-center">';
    html += '<div style="width: 34px; height: 34px; border-radius: 50%; background-color: var(--light-black); display: flex; align-items: center; justify-content: center; margin-right: 10px;"><i class="fas fa-user" style="color: var(--gold-primary); font-size: 0.8rem;"></i></div>';
    html += '<div><div style="color: var(--text-gray); font-weight: 500;">' + escapeAttr(name) + '</div><small style="color: var(--text-dark-gray);">' + escapeAttr(sectionLabel) + "</small></div></div>";
    html += '<div class="d-flex align-items-center gap-2">';
    if (cfg.selectAsStartingPerson) {
        html += '<button class="btn btn-outline-warning btn-sm" onclick="event.stopPropagation();window.TreeRendererConfig.selectAsStartingPerson(\'' + escapeAttr(personId) + '\')" title="View this person\'s tree"><i class="fas fa-crosshairs"></i></button>';
    }
    if (cfg.refreshPerson) {
        html += '<button class="btn btn-sm p-1" onclick="event.stopPropagation();window.TreeRendererConfig.refreshPerson(\'' + escapeAttr(section) + '\',\'' + escapeAttr(personId) + '\')" title="Refresh from FamilySearch" style="color: var(--text-dark-gray); line-height: 1;"><i class="fas fa-arrows-rotate" style="font-size: 0.75rem;"></i></button>';
    }
    html += '<i class="fas fa-chevron-' + (isExpanded ? "up" : "down") + '" style="color: var(--text-dark-gray);"></i>';
    html += "</div></div>";
    if (isExpanded) html += '<div class="mt-1 ms-3">' + buildPersonDetailHTML(person, personId, section) + "</div>";
    html += "</div>";
    return html;
}

function renderEntryRows(entries, section, label) {
    var cfg = window.TreeRendererConfig;
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

        if (section === "desc") {
            var personA = rowEntries[0];
            var personB = rowEntries.length === 2 ? rowEntries[1] : null;
            var spouseId = personB ? personB.id : (getSpouseIds(personA.person)[0] || "");
            if (spouseId) {
                var coupleImg = (personA.person && personA.person.couple_image) || (personB && personB.person && personB.person.couple_image);
                var coupleImgId = "couple-img-" + personA.id + "-" + spouseId;
                html += '<div class="text-center mb-2 mt-1">';
                if (coupleImg) {
                    html += '<div style="display: inline-block; position: relative; cursor: pointer;" onclick="window.TreeRendererConfig.triggerCoupleImageUpload(\'' + escapeAttr(personA.id) + '\',\'' + escapeAttr(spouseId) + '\')">';
                    html += '<img id="' + coupleImgId + '" alt="Couple photo" style="display: none; max-width: 140px; max-height: 100px; border-radius: 8px; border: 2px solid var(--gold-primary);">';
                    html += '<div id="' + coupleImgId + '_placeholder" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; border: 1px dashed var(--gold-primary); color: var(--gold-primary); font-size: 0.8rem; cursor: pointer;"><i class="fas fa-image"></i> Loading couple photo...</div>';
                    html += '<div style="position: absolute; bottom: 2px; right: 2px; background: var(--gold-primary); color: var(--deep-black); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem;"><i class="fas fa-pen"></i></div>';
                    html += "</div>";
                    setTimeout(function() { cfg.loadCoupleImage(coupleImgId, coupleImg); }, 0);
                } else {
                    html += '<button class="btn btn-sm" style="border: 1px dashed var(--light-black); color: var(--text-dark-gray); font-size: 0.8rem;" onclick="window.TreeRendererConfig.triggerCoupleImageUpload(\'' + escapeAttr(personA.id) + '\',\'' + escapeAttr(spouseId) + '\')"><i class="fas fa-image me-1"></i>Upload Couple Photo</button>';
                }
                html += "</div>";
            }
        }
    });

    return html;
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

    var primaryRoot = null, spouseRoot = null;
    if (primaryData) {
        var pRefs = {};
        Object.keys(primaryData).forEach(function(id) { (primaryData[id] && Array.isArray(primaryData[id].parents) ? primaryData[id].parents : []).forEach(function(p) { pRefs[p] = true; }); });
        var pRoots = Object.keys(primaryData).filter(function(id) { return !pRefs[id]; });
        if (pRoots.length === 1) primaryRoot = pRoots[0];
    }
    if (spouseData) {
        var sRefs = {};
        Object.keys(spouseData).forEach(function(id) { (spouseData[id] && Array.isArray(spouseData[id].parents) ? spouseData[id].parents : []).forEach(function(p) { sRefs[p] = true; }); });
        var sRoots = Object.keys(spouseData).filter(function(id) { return !sRefs[id]; });
        if (sRoots.length === 1) spouseRoot = sRoots[0];
    }
    if (primaryRoot && spouseRoot && !spouseMap[primaryRoot]) {
        spouseMap[primaryRoot] = spouseRoot;
        spouseMap[spouseRoot] = primaryRoot;
    }

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
    var entries = getPeopleSectionEntries(section, data);
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

function renderAllSections(treeData) {
    var html = "";
    html += renderAncestorSections(treeData.husb, treeData.wife);
    html += renderSection('<i class="fas fa-people-group me-2"></i>Siblings', treeData.sibs, "sibs", "Sibling", false);
    html += renderSection('<i class="fas fa-child me-2"></i>Children', treeData.kids, "kids", "Child", false);
    html += renderSection('<i class="fas fa-people-arrows me-2"></i>Descendants', treeData.desc, "desc", "Descendant", true);
    return html;
}

function _ensureAddPersonModal() {
    if (document.getElementById("addPersonModal")) return;
    var m = document.createElement("div");
    m.innerHTML = ''
        + '<div class="modal fade" id="addPersonModal" tabindex="-1">'
        + '<div class="modal-dialog"><div class="modal-content" style="background-color: var(--primary-black, #1a1a1a); border: 1px solid var(--light-black, #333);">'
        + '<div class="modal-header" style="border-bottom: 1px solid var(--light-black, #333);"><h5 class="modal-title" id="addPersonModalTitle" style="color: var(--gold-primary, #d4af37);"></h5>'
        + '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>'
        + '<div class="modal-body">'
        + '<input type="hidden" id="addPersonRelationship"><input type="hidden" id="addPersonSection"><input type="hidden" id="addPersonRelativeId">'

        // Step 1: Choose mode
        + '<div id="addPersonStep1">'
        + '<p style="color: var(--text-gray);">How would you like to add this person?</p>'
        + '<div class="d-grid gap-2">'
        + '<button class="btn btn-outline-warning" onclick="window._addPersonShowLookup()"><i class="fas fa-search me-2"></i>Look up existing person from FamilySearch</button>'
        + '<button class="btn btn-outline-secondary" onclick="window._addPersonShowNew()"><i class="fas fa-user-plus me-2"></i>Create new person (not in FamilySearch)</button>'
        + '</div></div>'

        // Step 2a: FS Lookup
        + '<div id="addPersonStepLookup" style="display:none;">'
        + '<div class="mb-3"><label class="form-label">FamilySearch Person ID</label><input type="text" class="form-control" id="addPersonFsId" placeholder="e.g. KWQS-BYD"></div>'
        + '<button class="btn btn-outline-warning btn-sm mb-3" onclick="window._addPersonLookupFs()"><i class="fas fa-search me-1"></i>Look Up</button>'
        + '<div id="addPersonLookupResult" style="display:none;" class="p-3 mb-3" style="border:1px solid var(--light-black,#333); border-radius:8px; background:var(--deep-black,#111);"></div>'
        + '</div>'

        // Step 2b: New Person
        + '<div id="addPersonStepNew" style="display:none;">'
        + '<div class="row"><div class="col-6 mb-3"><label class="form-label">First Name <span style="color:#dc3545;">*</span></label><input type="text" class="form-control" id="addPersonFirstName"></div>'
        + '<div class="col-6 mb-3"><label class="form-label">Last Name</label><input type="text" class="form-control" id="addPersonLastName"></div></div>'
        + '<div class="mb-3"><label class="form-label">Gender</label><select class="form-select" id="addPersonGender"><option value="Male" selected>Male</option><option value="Female">Female</option></select></div>'
        + '<div class="mb-3"><label class="form-label">Birth Date</label><input type="text" class="form-control" id="addPersonBirth" placeholder="e.g. 15 March 1985"></div>'
        + '</div>'

        // Spouse confirmation (shown for "child" relationship)
        + '<div id="addPersonSpouseConfirm" style="display:none;" class="mb-3">'
        + '<div class="form-check"><input class="form-check-input" type="checkbox" id="addPersonIncludeSpouse" checked>'
        + '<label class="form-check-label" for="addPersonIncludeSpouse" id="addPersonSpouseLabel" style="color:var(--text-gray);"></label></div>'
        + '</div>'

        + '<input type="hidden" id="addPersonId"><input type="hidden" id="addPersonMode">'
        + '<div id="addPersonError" class="text-danger small mt-2" style="display:none;"></div>'
        + '</div>'
        + '<div class="modal-footer" style="border-top: 1px solid var(--light-black, #333);">'
        + '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>'
        + '<button type="button" class="btn" id="addPersonSubmitBtn" style="display:none; background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%); color: #000; font-weight: 600;" onclick="window.TreeRendererConfig.submitAddPerson()"><i class="fas fa-plus me-1"></i>Add Person</button>'
        + '</div></div></div></div>';
    document.body.appendChild(m.firstChild);

    window._addPersonShowLookup = function() {
        document.getElementById("addPersonStep1").style.display = "none";
        document.getElementById("addPersonStepLookup").style.display = "";
        document.getElementById("addPersonStepNew").style.display = "none";
        document.getElementById("addPersonSubmitBtn").style.display = "none";
        document.getElementById("addPersonMode").value = "lookup";
        document.getElementById("addPersonFsId").value = "";
        document.getElementById("addPersonLookupResult").style.display = "none";
    };

    window._addPersonShowNew = function() {
        document.getElementById("addPersonStep1").style.display = "none";
        document.getElementById("addPersonStepLookup").style.display = "none";
        document.getElementById("addPersonStepNew").style.display = "";
        document.getElementById("addPersonSubmitBtn").style.display = "";
        document.getElementById("addPersonMode").value = "new";
        document.getElementById("addPersonId").value = "";
        document.getElementById("addPersonFirstName").value = "";
        document.getElementById("addPersonLastName").value = "";
        document.getElementById("addPersonBirth").value = "";
        _showSpouseConfirm();
    };

    window._addPersonLookupFs = function() {
        var fsId = (document.getElementById("addPersonFsId").value || "").trim();
        if (!fsId) return;
        var cfg = window.TreeRendererConfig;
        if (cfg.lookupFsPerson) {
            cfg.lookupFsPerson(fsId, function(person) {
                var resultEl = document.getElementById("addPersonLookupResult");
                if (!person) {
                    resultEl.innerHTML = '<span style="color:#ffb4b4;">Person not found. Check the ID and try again.</span>';
                    resultEl.style.display = "";
                    document.getElementById("addPersonSubmitBtn").style.display = "none";
                    return;
                }
                var name = (person.name || "Unknown");
                var birth = (person.birth || "");
                resultEl.innerHTML = '<div style="border:1px solid var(--light-black,#333); border-radius:8px; padding:12px; background:var(--deep-black,#111);">'
                    + '<div style="color:var(--text-gray); font-weight:600;">' + escapeAttr(name) + '</div>'
                    + '<div class="small" style="color:var(--text-dark-gray);">' + escapeAttr(fsId) + (birth ? " &middot; Born: " + escapeAttr(birth) : "") + '</div>'
                    + '</div>';
                resultEl.style.display = "";
                document.getElementById("addPersonId").value = fsId;
                document.getElementById("addPersonSubmitBtn").style.display = "";
                _showSpouseConfirm();
            });
        }
    };

    function _showSpouseConfirm() {
        var rel = document.getElementById("addPersonRelationship").value;
        var section = document.getElementById("addPersonSection").value;
        var relativeId = document.getElementById("addPersonRelativeId").value;
        var spouseDiv = document.getElementById("addPersonSpouseConfirm");
        if (rel !== "child" || section !== "desc") { spouseDiv.style.display = "none"; return; }
        var cfg = window.TreeRendererConfig;
        var state = cfg.getState();
        var treeData = state.treeData || {};
        var descData = treeData.desc || {};
        var relative = descData[relativeId];
        if (!relative) { spouseDiv.style.display = "none"; return; }
        var spouseIds = getSpouseIds(relative);
        if (!spouseIds.length) { spouseDiv.style.display = "none"; return; }
        var spouseName = cfg.getPersonName ? cfg.getPersonName(spouseIds[0]) : spouseIds[0];
        var label = document.getElementById("addPersonSpouseLabel");
        label.textContent = "Also add as child of " + spouseName + " (" + spouseIds[0] + ")?";
        document.getElementById("addPersonIncludeSpouse").checked = true;
        spouseDiv.style.display = "";
    }
}

function showAddPersonModal(relationship, section, relativeId) {
    _ensureAddPersonModal();
    var title = relationship === "parent" ? "Add Parent" : "Add Child";
    document.getElementById("addPersonModalTitle").innerHTML = '<i class="fas fa-user-plus me-2"></i>' + title;
    document.getElementById("addPersonRelationship").value = relationship;
    document.getElementById("addPersonSection").value = section;
    document.getElementById("addPersonRelativeId").value = relativeId;
    document.getElementById("addPersonStep1").style.display = "";
    document.getElementById("addPersonStepLookup").style.display = "none";
    document.getElementById("addPersonStepNew").style.display = "none";
    document.getElementById("addPersonSubmitBtn").style.display = "none";
    document.getElementById("addPersonSpouseConfirm").style.display = "none";
    document.getElementById("addPersonLookupResult").style.display = "none";
    document.getElementById("addPersonError").style.display = "none";
    document.getElementById("addPersonId").value = "";
    document.getElementById("addPersonMode").value = "";
    var modal = new bootstrap.Modal(document.getElementById("addPersonModal"));
    modal.show();
}

// Expose public API
window.TreeRenderer = {
    showAddPersonModal: showAddPersonModal,
    escapeAttr: escapeAttr,
    formatName: formatName,
    getImageName: getImageName,
    getSpouseIds: getSpouseIds,
    buildCoupleRows: buildCoupleRows,
    buildEditableField: buildEditableField,
    buildPersonDetailHTML: buildPersonDetailHTML,
    buildPersonListItem: buildPersonListItem,
    renderEntryRows: renderEntryRows,
    renderAncestorSections: renderAncestorSections,
    renderSection: renderSection,
    renderAllSections: renderAllSections,
    deriveGenerationsFromParentGraph: deriveGenerationsFromParentGraph,
    getPeopleSectionEntries: getPeopleSectionEntries,
};

})();
