// price-calculator.js - Chart pricing.
//
// Single source of truth on the client. Must stay in sync with:
//   - api/create-payment-session.js  PRICE_AMOUNT_MAP
//   - api/stripe-pricing.js          PRICE_MAP (the Stripe price IDs)
//   - family_trees/orders.py         PRODUCT_PRICES_USD (backend)
//
// Stripe charges from the price ID, not from anything here, so a mismatch shows
// the customer one number and bills another. Change all four together.

(function (global) {
  'use strict';

  var PRICES_USD = {
    ancestor_4: 149,
    ancestor_5: 198,
    descendant_3: 169,
    descendant_4: 218
  };

  var THEME_SLUG_TO_BACKEND = {
    'royal-heritage': 'black',
    'rustic-roots': 'rustic',
    'vintage-botanical': 'green',
    'ancestral-stone': 'stone'
  };

  var THEME_DISPLAY_NAMES = {
    black: 'Royal Heritage',
    rustic: 'Rustic Roots',
    green: 'Vintage Botanical',
    stone: 'Ancestral Stone',
    snowflake: 'Snowflake'
  };

  /** Generation options offered for each chart type, best first. */
  var GENERATION_OPTIONS = {
    ancestor: [5, 4],
    descendant: [4, 3]
  };

  function productKey(treeType, generations) {
    return treeType + '_' + parseInt(generations, 10);
  }

  /** Price in whole dollars, or null for an unsupported combination. */
  function calculateTreePrice(treeType, generations) {
    var price = PRICES_USD[productKey(treeType, generations)];
    return typeof price === 'number' ? price : null;
  }

  /** Stripe product key ('ancestry_5'), which uses a different prefix. */
  function stripeProductKey(treeType, generations) {
    var prefix = treeType === 'ancestor' ? 'ancestry' : treeType;
    return prefix + '_' + parseInt(generations, 10);
  }

  function mapThemeToBackend(slug) {
    return THEME_SLUG_TO_BACKEND[slug] || 'black';
  }

  function themeDisplayName(backendTheme) {
    return THEME_DISPLAY_NAMES[backendTheme] || backendTheme || 'Royal Heritage';
  }

  function formatPrice(value) {
    return typeof value === 'number' ? '$' + value : '';
  }

  global.Pricing = {
    PRICES_USD: PRICES_USD,
    THEME_SLUG_TO_BACKEND: THEME_SLUG_TO_BACKEND,
    THEME_DISPLAY_NAMES: THEME_DISPLAY_NAMES,
    GENERATION_OPTIONS: GENERATION_OPTIONS,
    calculateTreePrice: calculateTreePrice,
    stripeProductKey: stripeProductKey,
    mapThemeToBackend: mapThemeToBackend,
    themeDisplayName: themeDisplayName,
    formatPrice: formatPrice
  };

  // Node test runner support; harmless in the browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.Pricing;
  }
})(typeof window !== 'undefined' ? window : globalThis);
