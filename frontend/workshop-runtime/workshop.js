import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from './vendor/lights/RectAreaLightUniformsLib.js';

const canvas = document.getElementById('workshop');
const overlay = document.getElementById('runtimeOverlay');
const viewLabel = document.getElementById('viewLabel');
const agents = [
  ['manager', '店长', 'manager', [2, 3.07]],
  ['researcher', '调研员', 'researcher', [7, 3.07]],
  ['recommender', '推荐官', 'recommendation', [11, 3.07]],
  ['receptionist', '接待员', 'support', [15, 3.07]],
  ['order', '订单员', 'order', [7, 12.83]],
  ['production', '生产员', 'listing', [11, 12.83]],
  ['inspector', '稽查员', 'inspector', [15, 12.83]],
];
const anchors = {
  entrance: [12, 15.3], conference: [12, 8], modelTable: [18.2, 8], rack: [22.1, 8],
  productionCamera: [18, 13.2], dataWall: [12, 1.1],
};
const cameraPresets = [
  ['Camera 01', [12, 18, -20], [12, 0.6, -8], true],
  ['Camera 02', [12, 2.0, -17.7], [12, 1.0, -8], false],
  ['Camera 03', [4.8, 3.8, -8], [10, 0.9, -8], true],
  ['Camera 04', [21.2, 3.4, -11.5], [18, 0.8, -8], true],
  ['Camera 05', [18.3, 2.1, -8], [22, 0.9, -8], false],
  ['Camera 06', [12, 3.0, -14], [12, 0.6, -8], false],
  ['Production', [18, 1.6, -13.2], [18.2, 0.9, -8], false],
];
const state = Object.fromEntries(agents.map(([id, , , home]) => [id, {
  status: 'IDLE', home, current: new THREE.Vector3(), target: new THREE.Vector3(), parts: [],
}]));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setClearColor(0x091014, 1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x091014);
scene.fog = new THREE.Fog(0x091014, 24, 48);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
const runtimeStartedAt = performance.now();
const orbit = { target: new THREE.Vector3(12, 0.8, -8), yaw: 0, pitch: 1, distance: 12 };
let room = null;
let ceiling = null;
let acceptedAsset = null;
let currentPreset = 6;
let drag = null;
let progress = 0;
let rack = 0;
let loopTimer = null;
let phase = 0;
let demoRunning = false;
let demoLockUntil = 0;
let latestTask = null;

RectAreaLightUniformsLib.init();

function toThreePosition([x, y, z = 0]) {
  return new THREE.Vector3(x, z, -y);
}

function event(text) {
  const el = document.getElementById('eventLog');
  const time = new Date().toLocaleTimeString('zh-CN');
  el.innerHTML = `<div>${time} - ${text}</div>` + el.innerHTML;
}

function normalizeStatus(value) {
  const status = String(value || 'idle').toUpperCase();
  if (status === 'QUEUED' || status === 'PENDING') return 'NOTICE';
  if (status === 'DONE' || status === 'COMPLETED') return 'PASS';
  if (status === 'FAILED' || status === 'BLOCKED') return 'ERROR';
  return ['IDLE', 'NOTICE', 'WORKING', 'PASS', 'RETURN', 'ERROR'].includes(status) ? status : 'IDLE';
}

function stateColor(status) {
  return { IDLE: 0x71808b, NOTICE: 0xf1b44c, WORKING: 0x5aa7ff, PASS: 0x65d184, RETURN: 0xff6b6b, ERROR: 0xff6b6b }[status];
}

function setStatus(id, status, target) {
  const item = state[id];
  item.status = status;
  const destination = target || item.home;
  item.target.set(destination[0] - item.home[0], 0, -(destination[1] - item.home[1]));
  const color = stateColor(status);
  const ring = room?.getObjectByName(`StateRing_${id}`);
  if (ring?.material) {
    ring.material.color.setHex(color);
    if ('emissive' in ring.material) ring.material.emissive.setHex(color).multiplyScalar(0.24);
  }
  syncPanel();
}

function syncPanel() {
  document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
  document.getElementById('progressFill').style.width = `${progress}%`;
  document.getElementById('rackCount').textContent = rack;
  document.getElementById('agentRows').innerHTML = agents.map(([id, name]) => {
    const status = state[id].status;
    const width = status === 'WORKING' ? progress : status === 'PASS' ? 100 : 20;
    return `<div class="agent-row"><b>${name}</b><span class="state ${status}">${status}</span><div class="bar"><div class="fill" style="width:${width}%"></div></div></div>`;
  }).join('');
}

function setCameraPreset(index) {
  currentPreset = index;
  const [name, position, target, hideCeiling] = cameraPresets[index];
  camera.position.fromArray(position);
  orbit.target.fromArray(target);
  const offset = camera.position.clone().sub(orbit.target);
  orbit.distance = offset.length();
  orbit.pitch = Math.acos(THREE.MathUtils.clamp(offset.y / orbit.distance, -1, 1));
  orbit.yaw = Math.atan2(offset.x, offset.z);
  camera.lookAt(orbit.target);
  if (ceiling) ceiling.visible = !hideCeiling;
  viewLabel.textContent = name;
  [...document.getElementById('cameraButtons').children].forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index));
  event(`切换到 ${name}`);
}

function updateOrbitCamera() {
  const sinPitch = Math.sin(orbit.pitch);
  camera.position.set(
    orbit.target.x + orbit.distance * sinPitch * Math.sin(orbit.yaw),
    orbit.target.y + orbit.distance * Math.cos(orbit.pitch),
    orbit.target.z + orbit.distance * sinPitch * Math.cos(orbit.yaw),
  );
  camera.lookAt(orbit.target);
}

function setupCameraControls() {
  canvas.addEventListener('pointerdown', (pointerEvent) => {
    drag = { id: pointerEvent.pointerId, x: pointerEvent.clientX, y: pointerEvent.clientY };
    canvas.setPointerCapture(pointerEvent.pointerId);
  });
  canvas.addEventListener('pointermove', (pointerEvent) => {
    if (!drag || pointerEvent.pointerId !== drag.id) return;
    orbit.yaw -= (pointerEvent.clientX - drag.x) * 0.006;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (pointerEvent.clientY - drag.y) * 0.005, 0.22, 1.48);
    drag.x = pointerEvent.clientX;
    drag.y = pointerEvent.clientY;
    updateOrbitCamera();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (wheelEvent) => {
    wheelEvent.preventDefault();
    orbit.distance = THREE.MathUtils.clamp(orbit.distance * Math.exp(wheelEvent.deltaY * 0.001), 3, 34);
    updateOrbitCamera();
  }, { passive: false });
}

function addRuntimeLights(fixtures) {
  const baseline = fixtures.baseline;
  scene.add(new THREE.HemisphereLight(baseline.sky, baseline.ground, baseline.intensity));
  const sun = new THREE.DirectionalLight(0xfff4d7, 2.1);
  sun.position.set(10, 12, -4);
  scene.add(sun);
  fixtures.fixtures.forEach((fixture) => {
    const position = toThreePosition(fixture.position);
    const light = new THREE.RectAreaLight(fixture.color, fixture.energy / 115, fixture.width, fixture.height);
    light.name = fixture.id;
    light.position.copy(position);
    light.lookAt(position.x, 0, position.z);
    scene.add(light);
  });
}

function indexAgentParts() {
  agents.forEach(([id]) => {
    const item = state[id];
    item.parts = [`AgentBody_${id}`, `AgentHead_${id}`, `StateRing_${id}`]
      .map((name) => room.getObjectByName(name)).filter(Boolean);
    item.parts.forEach((part) => { part.userData.basePosition = part.position.clone(); });
    setStatus(id, 'IDLE');
  });
}

function createAcceptedAsset() {
  const geometry = new THREE.IcosahedronGeometry(0.24, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xd2a94d, metalness: 0.72, roughness: 0.28, emissive: 0x332000 });
  acceptedAsset = new THREE.Mesh(geometry, material);
  acceptedAsset.name = 'RuntimeAcceptedAsset';
  acceptedAsset.position.set(21.74, 1.28, -8.5);
  acceptedAsset.visible = false;
  scene.add(acceptedAsset);
}

function chooseTier(manifest) {
  const reduced = matchMedia('(max-width: 720px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  return reduced ? manifest.geometryTiers.vlow.path : manifest.geometryTiers.high.path;
}

async function loadRuntime() {
  try {
    overlay.dataset.state = 'loading';
    const [manifestResponse, fixturesResponse] = await Promise.all([
      fetch('/workshop-runtime/runtime-manifest.json'),
      fetch('/workshop-runtime/fixture-manifest.json'),
    ]);
    if (!manifestResponse.ok || !fixturesResponse.ok) throw new Error('Runtime manifest unavailable');
    const manifest = await manifestResponse.json();
    const fixtures = await fixturesResponse.json();
    addRuntimeLights(fixtures);
    const tier = chooseTier(manifest);
    const gltf = await new GLTFLoader().loadAsync(`/workshop-runtime/${tier}`, (loadEvent) => {
      if (loadEvent.total) overlay.querySelector('b').textContent = `加载 3D 场景 ${Math.round(loadEvent.loaded / loadEvent.total * 100)}%`;
    });
    room = gltf.scene;
    room.name = 'Fantasy3DWorkshopRoom';
    scene.add(room);
    ceiling = room.getObjectByName('Ceiling_Substrate');
    room.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = true;
      if (object.material) object.material.needsUpdate = true;
    });
    indexAgentParts();
    createAcceptedAsset();
    setCameraPreset(6);
    overlay.dataset.state = 'ready';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.dataset.ready = 'true';
    window.__FANTASY3D_RUNTIME__ = {
      ready: true, tier, manifest, agentCount: agents.length, errors: [], renderer: 'three-webgl',
    };
    window.dispatchEvent(new CustomEvent('fantasy3d-ready', { detail: window.__FANTASY3D_RUNTIME__ }));
    event(`3D Runtime 就绪 · ${tier.includes('vlow') ? 'VLow' : 'High'} · ${manifest.geometryTiers[tier.includes('vlow') ? 'vlow' : 'high'].triangles.toLocaleString()} triangles`);
  } catch (error) {
    overlay.dataset.state = 'error';
    overlay.querySelector('b').textContent = '3D 场景加载失败';
    overlay.querySelector('span').textContent = error.message;
    window.__FANTASY3D_RUNTIME__ = { ready: false, errors: [error.message] };
    document.getElementById('gatewayStatus').textContent = `ERROR · ${error.message}`;
  }
}

async function syncGateway() {
  try {
    const response = await fetch('/api/workshop/state', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    latestTask = (payload.tasks || [])[0] || null;
    document.getElementById('gatewayStatus').textContent = `LIVE · ${payload.schema} · ${(payload.agents || []).length} Agent · Three.js Runtime`;
    document.getElementById('activeTasks').textContent = payload.workflow ? payload.workflow.activeTasks : 0;
    if (!demoRunning && Date.now() >= demoLockUntil) {
      (payload.agents || []).forEach((agent) => setStatus(agent.id, normalizeStatus(agent.status)));
      if (latestTask) {
        document.getElementById('taskId').textContent = latestTask.id || latestTask.taskId || 'STORE-TASK';
        document.getElementById('taskText').textContent = latestTask.title || latestTask.description || '已读取商店任务。';
      }
    }
  } catch (_error) {
    document.getElementById('gatewayStatus').textContent = 'SIMULATED · 真实接口不可用，3D 闭环仍可本地运行';
  }
}

function runLoop() {
  clearInterval(loopTimer);
  demoRunning = true;
  progress = 0;
  rack = 0;
  phase = 0;
  if (acceptedAsset) acceptedAsset.visible = false;
  agents.forEach(([id]) => setStatus(id, 'IDLE'));
  const decision = document.getElementById('inspectionMode').value;
  if (latestTask) {
    document.getElementById('taskId').textContent = latestTask.id || latestTask.taskId || 'STORE-TASK';
    document.getElementById('taskText').textContent = latestTask.title || 'Production 收到真实任务快照。';
  }
  event(`Gateway 接收${latestTask ? '真实任务快照' : '模拟任务'}，Production 流程启动。`);
  loopTimer = setInterval(() => {
    phase += 1;
    if (phase === 1) {
      document.getElementById('taskState').textContent = 'NOTICE';
      setStatus('production', 'NOTICE', anchors.productionCamera);
      event('Production NOTICE：任务进入生产队列。');
    }
    if (phase === 3) {
      document.getElementById('taskState').textContent = 'WORKING';
      setStatus('production', 'WORKING', anchors.modelTable);
      setCameraPreset(6);
      event('Production 走到模型台，开始 WORKING。');
    }
    if (phase > 3 && phase < 12) {
      progress = Math.min(68, progress + 8.5);
      document.getElementById('taskText').textContent = `3D 资产生产中，实时进度 ${Math.round(progress)}%。`;
      syncPanel();
    }
    if (phase === 12) {
      progress = 100;
      setStatus('production', 'PASS', anchors.modelTable);
      setStatus('inspector', 'NOTICE', [19.2, 8]);
      event('Production 完成，交给 Inspector。');
    }
    if (phase === 14) {
      setStatus('inspector', 'WORKING', anchors.modelTable);
      event('Inspector 检查碰撞、动线和展示架入口。');
    }
    if (phase === 17) {
      setStatus('inspector', decision, decision === 'PASS' ? anchors.rack : anchors.modelTable);
      document.getElementById('taskState').textContent = decision;
      if (decision === 'PASS') {
        rack = 1;
        if (acceptedAsset) acceptedAsset.visible = true;
        document.getElementById('taskText').textContent = 'Inspector PASS，作品已进入模型展示架。';
        setCameraPreset(4);
        event('Inspector PASS：作品进入展示架。');
      } else {
        setStatus('production', 'NOTICE', anchors.modelTable);
        document.getElementById('taskText').textContent = 'Inspector RETURN，作品留在模型台等待返工。';
        event('Inspector RETURN：作品未进入展示架。');
      }
      demoRunning = false;
      demoLockUntil = Date.now() + 30000;
      syncPanel();
      clearInterval(loopTimer);
    }
  }, 900);
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  resize();
  const elapsed = (performance.now() - runtimeStartedAt) / 1000;
  Object.values(state).forEach((item) => {
    item.current.lerp(item.target, 0.055);
    const bob = item.status === 'WORKING' ? Math.sin(elapsed * 7) * 0.045 : 0;
    item.parts.forEach((part) => {
      part.position.copy(part.userData.basePosition).add(item.current);
      if (!part.name.startsWith('StateRing_')) part.position.y += bob;
    });
  });
  if (acceptedAsset?.visible) acceptedAsset.rotation.y += 0.012;
  renderer.render(scene, camera);
}

document.getElementById('runBtn').addEventListener('click', runLoop);
const cameraButtons = document.getElementById('cameraButtons');
cameraPresets.forEach(([name], index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.title = `切换到 ${name}`;
  button.addEventListener('click', () => setCameraPreset(index));
  cameraButtons.appendChild(button);
});

setupCameraControls();
syncPanel();
animate();
loadRuntime().then(() => syncGateway().finally(runLoop));
setInterval(syncGateway, 10000);
