// Parse every shipped script.
//
// There is no bundler and no linter here, so a syntax error in a browser-only
// file (dashboard.js, admin.js) would reach production unnoticed: no test
// imports them and the server never parses them. `node --check` catches that
// without executing anything, so `window` references are fine.
//
// Also asserts that every <script src> a page loads actually exists, which is
// the other way this repo breaks: deleting a script and missing a reference.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'test', 'attached_assets', 'assets']);

function listFiles(extension) {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name);
}

function listApiFiles() {
  const apiDir = path.join(ROOT, 'api');
  if (!fs.existsSync(apiDir)) return [];
  return fs
    .readdirSync(apiDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join('api', name));
}

test('every JavaScript file parses', () => {
  const files = [...listFiles('.js'), ...listApiFiles()];
  assert.ok(files.length > 0, 'expected to find JavaScript files');

  files.forEach((file) => {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
    } catch (error) {
      const detail = error.stderr ? error.stderr.toString() : error.message;
      assert.fail(`${file} has a syntax error:\n${detail}`);
    }
  });
});

test('every local script referenced by an HTML page exists', () => {
  const htmlFiles = listFiles('.html');
  assert.ok(htmlFiles.length > 0, 'expected to find HTML pages');

  const missing = [];

  htmlFiles.forEach((htmlFile) => {
    const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
    const pattern = /<script[^>]+src="([^"]+)"/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const src = match[1];
      // Skip CDN URLs and server-generated endpoints.
      if (/^https?:\/\//.test(src) || src.startsWith('/api/')) continue;
      const resolved = path.join(ROOT, src.replace(/^\//, ''));
      if (!fs.existsSync(resolved)) {
        missing.push(`${htmlFile} references missing script ${src}`);
      }
    }
  });

  assert.deepEqual(missing, [], missing.join('\n'));
});

test('every local stylesheet referenced by an HTML page exists', () => {
  const missing = [];

  listFiles('.html').forEach((htmlFile) => {
    const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
    const pattern = /<link[^>]+href="([^"]+)"[^>]*>/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const href = match[1];
      if (/^https?:\/\//.test(href) || href.startsWith('/api/')) continue;
      if (!href.endsWith('.css')) continue;
      const resolved = path.join(ROOT, href.replace(/^\//, ''));
      if (!fs.existsSync(resolved)) {
        missing.push(`${htmlFile} references missing stylesheet ${href}`);
      }
    }
  });

  assert.deepEqual(missing, [], missing.join('\n'));
});

test('wizard example charts exist for every type, generation, and theme', () => {
  const types = { ancestor: [4, 5], descendant: [3, 4] };
  const themes = ['black', 'rustic', 'green', 'stone'];
  const missing = [];

  Object.entries(types).forEach(([treeType, generations]) => {
    generations.forEach((count) => {
      themes.forEach((theme) => {
        const rel = `assets/examples/eichelberger-${treeType}-${count}-${theme}.jpg`;
        if (!fs.existsSync(path.join(ROOT, rel))) missing.push(rel);
      });
    });
  });

  assert.deepEqual(missing, [], missing.join('\n'));
});

test('the retired ordering pages are gone', () => {
  // The standalone form let people order without an account, which is the
  // whole reason corrections had to happen over email. If one comes back,
  // there are two ordering paths again.
  ['source-selection.html', 'familysearch-config.html', 'gedcom.html', 'familysearch.html'].forEach(
    (name) => {
      assert.equal(
        fs.existsSync(path.join(ROOT, name)),
        false,
        `${name} should have been retired in favour of the dashboard wizard`
      );
    }
  );
});

test('every wizard element dashboard.js reads exists in dashboard.html', () => {
  // The wizard's markup is all static, so a rename on either side is a silent
  // break: getElementById returns null, the guards swallow it, and the step
  // just does nothing. The GEDCOM person picker is the reason this matters --
  // if its select goes missing the wizard accepts an upload with no chosen
  // root, which is the bug that shipped a customer the wrong family's chart.
  //
  // Scoped to `wizard*` deliberately. Other panels (the add-person modal in
  // tree-renderer.js) inject their markup at runtime, so their IDs are
  // correctly absent from the page.
  const js = fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

  const referenced = new Set();
  for (const match of js.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)) {
    if (/^wizard/i.test(match[1])) referenced.add(match[1]);
  }

  const declared = new Set();
  for (const match of html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)) declared.add(match[1]);

  assert.ok(referenced.size > 0, 'expected dashboard.js to read wizard elements');

  const missing = [...referenced].filter((id) => !declared.has(id)).sort();
  assert.deepEqual(missing, [], `missing from dashboard.html: ${missing.join(', ')}`);
});

test('the GEDCOM wizard asks for a person, not a raw pointer', () => {
  // The field used to be a text input for a GEDCOM pointer like "@I1@", which
  // no customer knows for their own export. Left blank, the backend fell back
  // to the first record in the file: one upload charted a man with 2
  // descendants when the grandmother wanted had 205, and nothing said so.
  const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8');

  assert.ok(
    html.includes('id="wizardGedcomPerson"'),
    'the GEDCOM panel should offer a person picker'
  );
  assert.ok(
    html.includes('id="wizardGedcomSearch"'),
    'the picker needs a search box -- real files run to thousands of people'
  );
  assert.equal(
    html.includes('id="wizardRootPointer"'),
    false,
    'the raw pointer input should be gone'
  );
  assert.ok(
    js.includes('/people/tree/gedcom-people'),
    'the picker should be populated from the backend'
  );
});
