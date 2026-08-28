// fs-auth.js - Shared FamilySearch session helpers and backend API client.
//
// Every authenticated page (dashboard, admin) needs the same four things: read
// the access token, resolve who it belongs to, derive the storage scope slug,
// and call the Python backend with that token attached. Keeping them here stops
// the scope-slug rule in particular from drifting between pages, since the
// backend derives the same slug and the two must agree exactly.

(function (global) {
  'use strict';

  var CONFIG = global.APP_CONFIG || {};
  var TREE_BACKEND_BASE_URL =
    CONFIG.TREE_BACKEND_BASE_URL || 'https://family-trees.replit.app';
  var FS_API_BASE_URL = CONFIG.FS_API_BASE_URL || 'https://api.familysearch.org';

  function getCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      while (part.charAt(0) === ' ') {
        part = part.substring(1);
      }
      if (part.indexOf(prefix) === 0) {
        return part.substring(prefix.length);
      }
    }
    return null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  }

  function getAccessToken() {
    return getCookie('fs_access_token');
  }

  function logout() {
    deleteCookie('fs_access_token');
    deleteCookie('fs_refresh_token');
    deleteCookie('oauth_state');
    try {
      sessionStorage.clear();
    } catch (error) {
      // Private browsing can refuse storage access; signing out still works.
    }
    global.location.href = '/login';
  }

  /**
   * Build the storage scope slug for a person.
   *
   * Must stay identical to make_user_scope_id() in the backend's web/auth.py.
   * If these diverge, a user's charts and their tree cache land in different
   * folders and the dashboard silently shows nothing.
   */
  function makePersonSlug(name, personId) {
    if (!name || !personId) {
      return personId || '';
    }
    var parts = String(name).trim().split(/\s+/).filter(Boolean);
    var last = (parts[parts.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
    var first = (parts[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!last && !first) {
      return personId;
    }
    return last + '_' + first + '_' + personId;
  }

  /** Extract a bare FamilySearch person ID out of a scope or context slug. */
  function extractPersonId(slug) {
    if (!slug) {
      return '';
    }
    var match = String(slug).match(/([A-Z0-9]{4}-[A-Z0-9]{2,4})$/);
    return match ? match[1] : String(slug);
  }

  /**
   * Resolve the signed-in FamilySearch user.
   *
   * Returns `{person}` on success, or `{person: null, expired}` on failure.
   * The caller needs to tell a rejected token from a rate limit or a network
   * blip: only the former should delete the cookie and sign the user out.
   * Treating every failure as "expired" throws away a working session over a
   * transient 429.
   */
  async function resolveCurrentPerson(accessToken) {
    var response;
    try {
      response = await fetch(FS_API_BASE_URL + '/platform/tree/current-person', {
        method: 'GET',
        headers: {
          Accept: 'application/x-gedcomx-v1+json',
          Authorization: 'Bearer ' + accessToken
        }
      });
    } catch (error) {
      console.error('Network error resolving FamilySearch person:', error);
      return { person: null, expired: false, reason: 'network' };
    }

    if (response.status === 401 || response.status === 403) {
      return { person: null, expired: true, reason: 'rejected' };
    }
    if (!response.ok) {
      console.warn('FamilySearch returned ' + response.status + ' resolving the current person');
      return { person: null, expired: false, reason: 'unavailable' };
    }

    var data;
    try {
      data = await response.json();
    } catch (error) {
      return { person: null, expired: false, reason: 'unreadable' };
    }

    var person = data.persons && data.persons[0];
    if (!person || !person.id) {
      // A 200 with no person is a token that resolves to nobody.
      return { person: null, expired: true, reason: 'no-person' };
    }

    var name = (person.display && person.display.name) || 'Unknown';
    return {
      person: { id: person.id, name: name, scopeId: makePersonSlug(name, person.id) },
      expired: false,
      reason: 'ok'
    };
  }

  /** Convenience wrapper returning just the person, or null. */
  async function fetchCurrentPerson(accessToken) {
    var result = await resolveCurrentPerson(accessToken);
    return result.person;
  }

  /**
   * POST JSON to the backend with the access token attached.
   *
   * Throws an Error carrying `status` and `body` so callers can branch on a
   * 402 (payment required) without re-parsing the message.
   */
  async function postJson(endpoint, payload, options) {
    var settings = options || {};
    var body = Object.assign({}, payload);
    if (settings.withAuth !== false) {
      body.access_token = getAccessToken();
    }

    var response = await fetch(TREE_BACKEND_BASE_URL + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (settings.treat404AsNull && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      var parsed = null;
      var text = '';
      try {
        text = await response.text();
        parsed = JSON.parse(text);
      } catch (error) {
        parsed = null;
      }
      var message = (parsed && parsed.error) || text || 'Request failed (' + response.status + ')';
      var failure = new Error(message);
      failure.status = response.status;
      failure.body = parsed;
      throw failure;
    }

    return response.json();
  }

  /** POST JSON and return the response as a Blob (for PDF downloads). */
  async function postForBlob(endpoint, payload) {
    var body = Object.assign({}, payload, { access_token: getAccessToken() });
    var response = await fetch(TREE_BACKEND_BASE_URL + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      // Mirror postJson: the backend can return a plain-text error (or an
      // HTML error page from a proxy), and "Download failed" hides it.
      var parsed = null;
      var text = '';
      try {
        text = await response.text();
        parsed = JSON.parse(text);
      } catch (error) {
        parsed = null;
      }
      var failure = new Error(
        (parsed && parsed.error) || text || 'Download failed (' + response.status + ')'
      );
      failure.status = response.status;
      failure.body = parsed;
      throw failure;
    }

    return response.blob();
  }

  /** POST multipart form data to the backend, with the token appended. */
  async function postFormData(endpoint, formData) {
    formData.append('access_token', getAccessToken());
    var response = await fetch(TREE_BACKEND_BASE_URL + endpoint, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      var text = await response.text().catch(function () {
        return '';
      });
      var failure = new Error(text || 'Upload failed');
      failure.status = response.status;
      throw failure;
    }
    return response.json();
  }

  /** Hand the viewer a Blob as a downloaded file. */
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke on the next tick so the download has started.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  global.FsAuth = {
    TREE_BACKEND_BASE_URL: TREE_BACKEND_BASE_URL,
    FS_API_BASE_URL: FS_API_BASE_URL,
    getCookie: getCookie,
    deleteCookie: deleteCookie,
    getAccessToken: getAccessToken,
    logout: logout,
    makePersonSlug: makePersonSlug,
    extractPersonId: extractPersonId,
    resolveCurrentPerson: resolveCurrentPerson,
    fetchCurrentPerson: fetchCurrentPerson,
    postJson: postJson,
    postForBlob: postForBlob,
    postFormData: postFormData,
    saveBlob: saveBlob
  };

  // Pages still call a bare logout() from inline onclick handlers.
  global.logout = logout;
})(window);
