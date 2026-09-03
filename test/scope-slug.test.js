// The user scope slug contract.
//
// makePersonSlug (here) and make_user_scope_id (backend, family_trees/web/auth.py)
// must produce byte-identical output. The frontend derives this slug when it
// writes a user's tree cache; the backend derives it again to check the caller
// owns the scope they are requesting. Any divergence means the user is refused
// access to their own charts.
//
// The table below is the contract. The backend asserts the SAME table in
// family_trees/web/tests/test_auth.py. Changing either implementation without
// changing the other fails one of the two suites.

const test = require('node:test');
const assert = require('node:assert/strict');

// fs-auth.js is browser code; give it the globals it touches at load time.
global.window = global;
if (typeof global.document === 'undefined') {
  global.document = { cookie: '' };
}
require('../fs-auth.js');

const { makePersonSlug } = global.FsAuth;

const CONTRACT = [
  ['John Smith', 'ABCD-123', 'smith_john_ABCD-123'],
  ["Mary-Jane O'Brien", 'L1-2', 'obrien_maryjane_L1-2'],
  ['John Quincy Adams', 'X1-1', 'adams_john_X1-1'],
  ['Cher', 'X1-1', 'cher_cher_X1-1'],
  ['  Bryant   McArthur  ', 'X1-1', 'mcarthur_bryant_X1-1'],
  // Non-ASCII letters are stripped, not transliterated. str.isalpha() in
  // Python accepts them, so the backend had to be taught to match this.
  ['José García', 'ABCD-123', 'garca_jos_ABCD-123'],
  ['Renée Zoë', 'ABCD-123', 'zo_rene_ABCD-123'],
  ['Ægir Þórsson', 'ABCD-123', 'rsson_gir_ABCD-123'],
  // Nothing usable survives, so fall back to the stable person ID.
  ['Ω Ψ', 'ABCD-123', 'ABCD-123'],
  ['123 456', 'ABCD-123', 'ABCD-123'],
  ['', 'ABCD-123', 'ABCD-123'],
];

CONTRACT.forEach(([name, personId, expected]) => {
  test(`slug for ${JSON.stringify(name)} is ${expected}`, () => {
    assert.equal(makePersonSlug(name, personId), expected);
  });
});

test('a missing person ID yields an empty slug rather than a partial one', () => {
  // A partial slug would silently point at the wrong storage folder.
  assert.equal(makePersonSlug('John Smith', ''), '');
});

test('the slug is stable across repeated calls', () => {
  const first = makePersonSlug('John Smith', 'ABCD-123');
  const second = makePersonSlug('John Smith', 'ABCD-123');
  assert.equal(first, second);
});
