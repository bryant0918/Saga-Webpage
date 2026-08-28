// fs-oauth.js - Starting the FamilySearch OAuth flow.
//
// Only the sign-in kickoff lives here. The callback is handled on the landing
// page by main.js, because FamilySearch redirects back to the site root.
//
// Note: the access token is still stored in a readable cookie, which
// SecurityPolicy.md flags as a known gap pending server-side sessions. Do not
// move it to localStorage, which is strictly worse.

(function (global) {
  'use strict';

  var CONFIG = global.APP_CONFIG || {};
  var ENVIRONMENT = (CONFIG.FS_ENVIRONMENT || 'production').toLowerCase();

  var FS_CONFIG = {
    APP_KEY: CONFIG.FS_APP_KEY || 'b00KBZ8PWGLG7SJ0A3U1',
    BASE_URL: CONFIG.FS_BASE_URL || 'https://ident.familysearch.org',
    // FamilySearch beta is more permissive about redirect URIs, which is what
    // makes localhost development possible.
    REDIRECT_URI:
      ENVIRONMENT === 'beta'
        ? 'https://bryantmcarthur.com/family-trees'
        : global.location.origin + '/'
  };

  function setCookie(name, value, hours) {
    var expires = new Date(Date.now() + hours * 60 * 60 * 1000).toUTCString();
    document.cookie = name + '=' + value + ';expires=' + expires + ';path=/';
  }

  function generateRandomString(length) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var values = new Uint32Array(length);
    // Cryptographic randomness matters: this value is the CSRF state.
    global.crypto.getRandomValues(values);
    var result = '';
    for (var i = 0; i < length; i++) {
      result += alphabet.charAt(values[i] % alphabet.length);
    }
    return result;
  }

  /** Send the browser to FamilySearch to sign in. */
  function initiateOAuthFlow(forceLogin) {
    var state = generateRandomString(16);
    setCookie('oauth_state', state, 1);

    try {
      sessionStorage.setItem('login_origin', 'true');
    } catch (error) {
      // Private browsing may refuse storage; sign-in still completes.
    }

    var authUrl =
      FS_CONFIG.BASE_URL +
      '/cis-web/oauth2/v3/authorization?response_type=code' +
      '&client_id=' + encodeURIComponent(FS_CONFIG.APP_KEY) +
      '&redirect_uri=' + encodeURIComponent(FS_CONFIG.REDIRECT_URI) +
      '&scope=' + encodeURIComponent('profile email tree') +
      '&state=' + encodeURIComponent(state);

    if (forceLogin) {
      authUrl += '&prompt=login';
    }

    global.location.href = authUrl;
  }

  global.FsOAuth = {
    FS_CONFIG: FS_CONFIG,
    initiateOAuthFlow: initiateOAuthFlow,
    generateRandomString: generateRandomString
  };
})(window);
