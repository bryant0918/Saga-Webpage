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
    var refs = {};
    ids.forEach(function(id) {
        (Array.isArray(data[id] && data[id].parents) ? data[id].parents : []).forEach(function(p) { refs[p] = true; });
    });
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
        setTimeout(function() { cfg.loadPersonImage(imgId, imageName); }, 0);
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
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Parents</small><div style="color: var(--text-gray);">' + escapeAttr(person.parents.join(", ")) + "</div></div>";
    }
    if (Array.isArray(person.children) && person.children.length) {
        html += '<div class="col-12 mb-2"><small style="color: var(--text-dark-gray);">Children</small><div style="color: var(--text-gray);">' + escapeAttr(person.children.join(", ")) + "</div></div>";
    }
    if (person.spouse_id) {
        html += '<div class="col-sm-6 mb-2"><small style="color: var(--text-dark-gray);">Spouse ID</small><div style="color: var(--text-gray);">' + escapeAttr(person.spouse_id) + "</div></div>";
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
    html += '<i class="fas fa-chevron-' + (isExpanded ? "up" : "down") + '" style="color: var(--text-dark-gray);"></i>';
    html += "</div>";
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

// Expose public API
window.TreeRenderer = {
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
