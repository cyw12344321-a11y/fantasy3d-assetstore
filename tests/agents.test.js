'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../server.js');

function newDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy3d-autonomous-'));
}

async function json(service, urlPath, options = {}) {
  const response = await fetch(service.url + urlPath, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

test('7 agents are listed with roles and online status', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/agents');
    assert.equal(status, 200);
    assert.equal(data.agents.length, 7);
    const ids = data.agents.map(a => a.id).sort();
    assert.deepEqual(ids, ['inspector', 'listing', 'manager', 'order', 'recommendation', 'researcher', 'support']);
    data.agents.forEach(a => {
      assert.ok(a.name);
      assert.ok(a.avatar);
      assert.ok(a.role);
      assert.ok(Array.isArray(a.capabilities));
    });
  } finally {
    await service.close();
  }
});

test('workshop gateway exposes canonical agent IDs with legacy aliases', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/workshop/state');
    assert.equal(status, 200);
    assert.equal(data.schema, 'fantasy3d.workshop-state.v1');
    assert.deepEqual(data.room.boundsMeters, [24, 16, 2.7]);
    assert.deepEqual(data.aliases, {
      recommendation: 'recommender',
      support: 'receptionist',
      listing: 'production'
    });
    assert.deepEqual(data.agents.map(agent => agent.id).sort(), [
      'inspector', 'manager', 'order', 'production', 'receptionist', 'recommender', 'researcher'
    ]);
    assert.equal(data.capabilities.persistentJobs, true);
    assert.ok(data.session.token);
    assert.deepEqual(data.jobs, []);
  } finally {
    await service.close();
  }
});

test('workshop production and inspection jobs persist across restart', async () => {
  const dataDir = newDataDir();
  const first = await startServer({ dataDir });
  let jobId;
  try {
    const gateway = await json(first, '/api/workshop/state');
    const headers = { 'Content-Type': 'application/json', 'X-Workshop-Token': gateway.data.session.token };
    const created = await json(first, '/api/workshop/jobs', {
      method: 'POST', headers, body: JSON.stringify({ title: '测试模型生产' })
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.job.status, 'NOTICE');
    jobId = created.data.job.id;
    for (const transition of [
      { status: 'WORKING', progress: 68 },
      { status: 'INSPECTION', progress: 100 },
      { status: 'PASS', progress: 100 }
    ]) {
      const result = await json(first, `/api/workshop/jobs/${jobId}/transitions`, {
        method: 'POST', headers, body: JSON.stringify(transition)
      });
      assert.equal(result.status, 200);
    }
  } finally {
    await first.close();
  }
  const second = await startServer({ dataDir });
  try {
    const gateway = await json(second, '/api/workshop/state');
    const persisted = gateway.data.jobs.find(job => job.id === jobId);
    assert.equal(persisted.status, 'PASS');
    assert.equal(persisted.progress, 100);
    assert.equal(persisted.decision, 'PASS');
  } finally {
    await second.close();
  }
});

test('workshop jobs require a session and reject invalid transitions', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const missingSession = await json(service, '/api/workshop/jobs', {
      method: 'POST', body: JSON.stringify({ title: '拒绝未授权写入' })
    });
    assert.equal(missingSession.status, 403);
    const gateway = await json(service, '/api/workshop/state');
    const headers = { 'Content-Type': 'application/json', 'X-Workshop-Token': gateway.data.session.token };
    const created = await json(service, '/api/workshop/jobs', {
      method: 'POST', headers, body: JSON.stringify({ title: '状态迁移测试' })
    });
    const invalid = await json(service, `/api/workshop/jobs/${created.data.job.id}/transitions`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'PASS', progress: 100 })
    });
    assert.equal(invalid.status, 409);
  } finally {
    await service.close();
  }
});

test('workshop runtime includes branded skeletal agents, independent scene assets and persisted-result restore', () => {
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'workshop-runtime', 'workshop.js'), 'utf8');
  assert.match(runtime, /new THREE\.Bone\(\)/);
  assert.match(runtime, /new THREE\.Skeleton\(/);
  assert.match(runtime, /new THREE\.SkinnedMesh\(/);
  assert.match(runtime, /Fantasy3DBrandSign/);
  assert.match(runtime, /addConceptDerivedSceneAssets/);
  assert.match(runtime, /independentSceneAssetCount/);
  assert.match(runtime, /conceptImagesInScene: 0/);
  assert.doesNotMatch(runtime, /GeneratedAgentRoster/);
  assert.match(runtime, /agentDesign/);
  assert.match(runtime, /if \(!hasPersistedJob\) runLoop/);
  const conceptRoot = path.join(__dirname, '..', 'frontend', 'workshop-runtime', 'concept-assets');
  ['workshop-hero.png', 'agent-roster.png', 'workstation-board.png', 'runtime-overview.png', 'manifest.json']
    .forEach(file => assert.ok(fs.existsSync(path.join(conceptRoot, file)), `${file} should be shipped`));
});

test('canonical agent IDs remain compatible with historical chat storage', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const chat = await json(service, '/api/agents/receptionist/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '如何下载文件' })
    });
    assert.equal(chat.status, 201);
    assert.equal(chat.data.agent.id, 'support');
    const history = await json(service, '/api/agents/receptionist/history');
    assert.equal(history.status, 200);
    assert.ok(history.data.messages.length >= 2);
  } finally {
    await service.close();
  }
});

test('store consciousness exposes team, stats and mantra', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/store/consciousness');
    assert.equal(status, 200);
    assert.ok(data.consciousness.name);
    assert.ok(data.consciousness.mantra);
    assert.equal(data.consciousness.iteration, 0);
    assert.equal(data.team.length, 7);
    assert.ok(data.stats.products >= 0);
    assert.ok(typeof data.stats.revenue === 'number');
  } finally {
    await service.close();
  }
});

test('self-iteration increments counter and logs actions', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const before = await json(service, '/api/store/consciousness');
    assert.equal(before.data.consciousness.iteration, 0);
    const { status, data } = await json(service, '/api/store/iterate', { method: 'POST' });
    assert.equal(status, 201);
    assert.equal(data.iteration.iteration, 1);
    assert.ok(data.iteration.actions.length >= 1);
    const after = await json(service, '/api/store/consciousness');
    assert.equal(after.data.consciousness.iteration, 1);
  } finally {
    await service.close();
  }
});

test('team meeting produces opinions, decision and action items', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/store/meeting', {
      method: 'POST',
      body: JSON.stringify({ topic: '测试会议' })
    });
    assert.equal(status, 201);
    assert.equal(data.meeting.topic, '测试会议');
    assert.equal(data.meeting.opinions.length, 6);
    assert.ok(data.meeting.decision);
    assert.ok(data.meeting.actionItems.length >= 3);
  } finally {
    await service.close();
  }
});

test('local production scan creates only license-review drafts', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const before = await json(service, '/api/store/consciousness');
    const beforeCount = before.data.stats.products;
    const { status, data } = await json(service, '/api/store/produce', { method: 'POST' });
    assert.equal(status, 201);
    assert.ok(data.message);
    assert.match(data.message, /待审核/);
    const after = await json(service, '/api/store/consciousness');
    assert.ok(after.data.stats.products <= beforeCount);
  } finally {
    await service.close();
  }
});

test('manager agent can trigger iteration via chat', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/agents/manager/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '自我迭代' })
    });
    assert.equal(status, 201);
    assert.ok(data.reply.content.includes('迭代'));
    const consciousness = await json(service, '/api/store/consciousness');
    assert.equal(consciousness.data.consciousness.iteration, 1);
  } finally {
    await service.close();
  }
});

test('researcher agent provides market analysis', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/agents/researcher/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '市场趋势' })
    });
    assert.equal(status, 201);
    assert.ok(data.reply.content.includes('市场') || data.reply.content.includes('调研'));
  } finally {
    await service.close();
  }
});

test('multi-language: English input gets English reply', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/agents/manager/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello, show me status' })
    });
    assert.equal(status, 201);
    assert.equal(data.detectedLanguage, 'en');
    assert.ok(/hello|I am|store/i.test(data.reply.content));
  } finally {
    await service.close();
  }
});

test('Japanese input detected and gets English fallback reply', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/agents/support/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'こんにちは' })
    });
    assert.equal(status, 201);
    assert.equal(data.detectedLanguage, 'ja');
  } finally {
    await service.close();
  }
});

test('supported languages endpoint returns 8 languages', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    const { status, data } = await json(service, '/api/store/languages');
    assert.equal(status, 200);
    assert.equal(data.total, 8);
    assert.equal(data.languages.length, 8);
  } finally {
    await service.close();
  }
});

test('conversation history persists across restart', async () => {
  const dataDir = newDataDir();
  const s1 = await startServer({ dataDir });
  try {
    await json(s1, '/api/agents/support/chat', { method: 'POST', body: JSON.stringify({ message: '测试持久化' }) });
  } finally { await s1.close(); }
  const s2 = await startServer({ dataDir });
  try {
    const { status, data } = await json(s2, '/api/agents/support/history');
    assert.equal(status, 200);
    assert.ok(data.messages.length >= 2);
  } finally { await s2.close(); }
});

test('iteration history is retrievable', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    await json(service, '/api/store/iterate', { method: 'POST' });
    const { status, data } = await json(service, '/api/store/iterations');
    assert.equal(status, 200);
    assert.equal(data.iterations.length, 1);
    assert.equal(data.iterations[0].iteration, 1);
  } finally {
    await service.close();
  }
});

test('knowledge base grows from interactions', async () => {
  const service = await startServer({ dataDir: newDataDir() });
  try {
    await json(service, '/api/agents/support/chat', { method: 'POST', body: JSON.stringify({ message: '如何下载文件' }) });
    const { status, data } = await json(service, '/api/store/knowledge');
    assert.equal(status, 200);
    assert.ok(data.totalLearned >= 1);
  } finally {
    await service.close();
  }
});
