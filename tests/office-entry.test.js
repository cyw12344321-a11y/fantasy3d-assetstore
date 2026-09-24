'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('office entry loads the interactive 3D workshop and keeps its runtime assets', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'office.html'), 'utf8');
  assert.match(html, /<canvas\b/);
  assert.match(html, /type="module" src="\/workshop-runtime\/workshop\.js/);
  for (const name of ['workshop.js', 'fantasy3d-workshop-high.glb', 'fantasy3d-workshop-vlow.glb']) {
    assert.ok(fs.statSync(path.join(root, 'frontend', 'workshop-runtime', name)).size > 0);
  }
});
