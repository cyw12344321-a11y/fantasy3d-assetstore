const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PF = require('../frontend/workshop-runtime/vendor/pathfinding.min.js');
test('both room tiers route all agents around furniture and stop outside model table', async () => {
  const THREE = await import('../frontend/workshop-runtime/vendor/three.module.js');
  const { GLTFLoader } = await import('../frontend/workshop-runtime/vendor/loaders/GLTFLoader.js');
  const { createNavigation } = await import('../frontend/workshop-runtime/navigation.mjs');
  for (const tier of ['high', 'vlow']) {
    const bytes = fs.readFileSync(path.join(__dirname, '../frontend/workshop-runtime/fantasy3d-workshop-' + tier + '.glb'));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    const boxes = [];
    for (const [name, position, collision] of [
      ['research-bookshelf', [3.8, 0, -5.4], true], ['lounge-sofa', [3.7, 0, -10.1], true],
      ['analysis-console', [2, .78, -2.1], false], ['inspection-lamp', [18.6, .93, -8.8], false]
    ]) {
      const data = fs.readFileSync(path.join(__dirname, '../frontend/workshop-runtime/props-batch-01/' + name + '.glb'));
      const asset = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
      asset.scene.position.set(...position);
      asset.scene.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(asset.scene);
      assert.ok(!b.isEmpty(), 'model has geometry: ' + name);
      if (collision) boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
    }
    gltf.scene.traverse(o => {
      if (!o.isMesh || !/^(Desk_|ConferenceTable|MeetingStool_|ModelTableTop|RackShelf|Wall_|Planter)/.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.max.y < 0.15 || b.min.y > 1.8) return;
      boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
    });
    assert.ok(boxes.length >= 17, 'collision geometry present');
    const nav = createNavigation(boxes, PF);
    assert.equal(nav.free([18.2, -8]), false, 'table center is blocked');
    for (const home of [[2,-3.07],[7,-3.07],[11,-3.07],[15,-3.07],[7,-12.83],[11,-12.83],[15,-12.83]]) {
      for (const destination of [[18.2,-8],[22.1,-8],[12,-8],[18,-13.2],home]) {
        let current = nav.free(home) ? home : nav.nearest(home);
        const route = nav.route(current, destination);
        assert.ok(route.length, 'reachable ' + tier + ' ' + home + ' -> ' + destination);
        let frames = 0;
        while (route.length && frames++ < 4000) {
          current = nav.advance(current, route, 0.09);
          assert.ok(nav.free(current), 'no penetration');
        }
        assert.ok(frames < 4000, 'route completes');
      }
    }
    assert.deepEqual(nav.route([0,0], [18.2,-8]), [], 'invalid spawn fails closed');
  }
});
