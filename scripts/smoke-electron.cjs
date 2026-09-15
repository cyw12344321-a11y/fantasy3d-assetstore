'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require(process.env.FANTASY_PLAYWRIGHT || 'playwright');
const project = path.resolve(__dirname, '..');
const packagedExe = process.argv[2];
const executablePath = packagedExe ? path.resolve(packagedExe) : require('electron');
const qaRoot = path.join(project, 'qa');
fs.mkdirSync(qaRoot, { recursive: true });
const qaDir = fs.mkdtempSync(path.join(qaRoot, packagedExe ? 'packaged-' : 'development-'));
const profile = path.join(qaDir, 'profile');
const downloads = path.join(qaDir, 'downloads');
for (const dir of [profile, downloads]) fs.mkdirSync(dir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let electron;
const problems = [];
const record = { executablePath, qaDir, checks: [] };
const check = name => { record.checks.push(name); console.log('PASS ' + name); };
async function launch() {
  const args = [`--user-data-dir=${profile}`, `--demo-download-dir=${downloads}`];
  if (!packagedExe) args.push(project);
  electron = await _electron.launch({ executablePath, args, env, cwd: project, timeout: 30000 });
  const page = await electron.firstWindow({ timeout: 30000 });
  page.on('pageerror', error => problems.push(error.message));
  await page.locator('#serviceStatus').filter({ hasText: '数据保存在本机' }).waitFor();
  const state = await electron.evaluate(({ app, BrowserWindow }) => ({
    userData: app.getPath('userData'), downloads: app.getPath('downloads'),
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
  }));
  assert.equal(state.userData, profile);
  assert.equal(state.downloads, downloads);
  assert.equal(state.preferences.nodeIntegration, false);
  assert.equal(state.preferences.sandbox, true);
  return { page, base: new URL(page.url()).origin };
}
async function closeAndCheck(base) {
  await electron.close();
  electron = null;
  await assert.rejects(fetch(base + '/api/app-info', { signal: AbortSignal.timeout(2000), headers: { Connection: 'close' } }));
  check('closing app also stops its backend');
}

(async () => {
  let { page, base } = await launch();
  check('standalone window starts its embedded server and renders homepage');
  await page.screenshot({ path: path.join(qaDir, 'home.png') });
  await page.goto(base + '/store.html');
  await page.locator('.product-card').nth(1).waitFor();
  assert.equal(await page.locator('.product-card').count(), 2);
  await page.screenshot({ path: path.join(qaDir, 'store.png') });
  await page.goto(base + '/admin.html');
  const character = page.locator('tr').filter({ hasText: 'char-001' });
  await character.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.locator('#adminMessage').filter({ hasText: '已保存到本机' }).waitFor();
  await page.goto(base + '/store.html');
  await page.locator('.product-card').nth(2).waitFor();
  assert.equal(await page.locator('.product-card').count(), 3);
  check('admin publication changes the visible catalog');
  await page.locator('[data-filter="characters"]').click();
  assert.equal(await page.locator('.product-card').count(), 1);
  await page.locator('.product-card').first().click();
  await page.locator('#buyBtn').click();
  await page.locator('#submitOrder:not([disabled])').waitFor();
  await page.locator('#buyerEmail').fill('bad-email');
  await page.locator('#submitOrder').click();
  await page.locator('#checkoutMessage').filter({ hasText: '有效邮箱' }).waitFor();
  await page.locator('#buyerEmail').fill('smoke@example.com');
  await page.locator('#submitOrder').click();
  await page.locator('#successMsg').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#submitOrder').isDisabled(), true);
  check('checkout validates email and creates one clearly simulated order');
  await page.goto(base + '/orders.html');
  await page.locator('.order-card').waitFor();
  assert.match(await page.locator('.order-card').innerText(), /simulated/);
  await page.locator('.download-btn').first().click();
  await page.locator('#downloadStatus').filter({ hasText: '已保存' }).waitFor({ timeout: 15000 });
  const firstDownloads = fs.readdirSync(downloads).filter(f => f.endsWith('.txt'));
  assert.equal(firstDownloads.length, 1);
  assert.match(fs.readFileSync(path.join(downloads, firstDownloads[0]), 'utf8'), /contains no 3D model/);
  await page.locator('.download-btn').first().click();
  await page.waitForFunction(() => document.getElementById('downloadStatus').textContent.includes('(1)'));
  assert.equal(fs.readdirSync(downloads).filter(f => f.endsWith('.txt')).length, 2);
  check('native sample download saves successfully and preserves existing files');
  await page.screenshot({ path: path.join(qaDir, 'orders.png') });
  await closeAndCheck(base);
  ({ page, base } = await launch());
  await page.goto(base + '/orders.html');
  await page.locator('#queryEmail').fill('smoke@example.com');
  await page.locator('#loadOrders').click();
  await page.locator('.order-card').waitFor();
  assert.equal(await page.locator('.order-card').count(), 1);
  await page.goto(base + '/store.html');
  await page.locator('.product-card').nth(2).waitFor();
  check('orders and publication state survive a full app restart');
  await page.goto(base + '/checkout.html?pid=missing');
  await page.locator('#checkoutMessage.error').waitFor();
  assert.equal(await page.locator('#submitOrder').isDisabled(), true);
  check('missing products show an error and cannot be ordered');
  assert.deepEqual(problems, []);
  await closeAndCheck(base);
  record.result = 'passed';
  fs.writeFileSync(path.join(qaDir, 'result.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
})().catch(async error => {
  record.result = 'failed'; record.error = error.stack;
  if (electron) {
    try { const page = await electron.firstWindow(); await page.screenshot({ path: path.join(qaDir, 'failure.png') }); } catch {}
    try { await electron.close(); } catch {}
  }
  fs.writeFileSync(path.join(qaDir, 'result.json'), JSON.stringify(record, null, 2));
  console.error(error.stack); process.exitCode = 1;
});
