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
