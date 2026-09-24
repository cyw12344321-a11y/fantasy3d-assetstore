import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from './vendor/lights/RectAreaLightUniformsLib.js';
import './vendor/pathfinding.min.js';
import { createNavigation } from './navigation.mjs';

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
  entrance: [12, 15.3], conference: [12, 8], modelTable: [16.2, 8], rack: [20.65, 8],
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
  rig: null, bones: null, ring: null,
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
let navigation = null;
let lastFrame = performance.now();
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
let activeJob = null;
let gatewayWriteToken = '';
let jobWriteQueue = Promise.resolve();
let hasPersistedJob = false;

const agentPalette = {
  manager: 0x244b86,
  researcher: 0x287d8f,
  recommender: 0x6454c9,
  receptionist: 0xd94c72,
  order: 0xc55b2e,
  production: 0x187d78,
  inspector: 0x494486,
};

const agentDesign = {
  manager: { hair: 0x684333, prop: 'tablet' },
  researcher: { hair: 0x303747, glasses: true, prop: 'magnifier' },
  recommender: { hair: 0x263b72, headphones: true, skirt: true, prop: 'tablet' },
  receptionist: { hair: 0x754432, headphones: true, skirt: true, prop: 'tablet' },
  order: { hair: 0x6f4430, cap: true, prop: 'parcel' },
  production: { hair: 0x293b64, cap: true, prop: 'hologram' },
  inspector: { hair: 0x684536, cap: true, glasses: true, prop: 'magnifier' },
};

const artDirection = {
  wall: 0xf3eee6,
  ceiling: 0xfffaf2,
  floor: 0x79533c,
  worktop: 0xe9d8c4,
  wood: 0x8d6045,
  dark: 0x253342,
  screen: 0x245d88,
  foliage: 0x4f8467,
  warmLight: 0xffb36f,
};
const independentSceneAssets = [
  'manager-command-props', 'research-library-props', 'recommendation-analysis-props',
  'reception-welcome-props', 'order-fulfilment-props', 'production-model-props',
  'inspection-quality-props', 'plants', 'showcase-models', 'window-world',
];

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
  if (!item) return;
  item.status = status;
  const destination = target || item.home;
  item.target.set(destination[0] - item.home[0], 0, -(destination[1] - item.home[1]));
  if (navigation) {
    const from = [item.home[0] + item.current.x, -item.home[1] + item.current.z];
    item.route = navigation.route(from, [destination[0], -destination[1]]);
  }
  const color = stateColor(status);
  const ring = item.ring || room?.getObjectByName(`StateRing_${id}`);
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

function canvasTexture(lines, { width = 1024, height = 256, accent = '#d2a94d' } = {}) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = width;
  labelCanvas.height = height;
  const context = labelCanvas.getContext('2d');
  context.fillStyle = '#10191f';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = accent;
  context.lineWidth = 12;
  context.strokeRect(14, 14, width - 28, height - 28);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f4f7f8';
  context.font = `700 ${Math.round(height * 0.31)}px sans-serif`;
  context.fillText(lines[0], width / 2, height * 0.43);
  if (lines[1]) {
    context.fillStyle = accent;
    context.font = `600 ${Math.round(height * 0.15)}px sans-serif`;
    context.fillText(lines[1], width / 2, height * 0.73);
  }
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function rigidSkinnedMesh(geometry, material, boneIndex, skeleton) {
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    indices[index * 4] = boneIndex;
    weights[index * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.bind(skeleton);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createAgentRig(id, name, home) {
  const group = new THREE.Group();
  group.name = `Rig_${id}`;
  group.position.set(home[0], 0, -home[1]);

  const root = new THREE.Bone();
  root.name = `${id}_root`;
  const spine = new THREE.Bone();
  spine.name = `${id}_spine`;
  spine.position.set(0, 0.72, 0);
  const head = new THREE.Bone();
  head.name = `${id}_head`;
  head.position.set(0, 0.74, 0);
  const leftArm = new THREE.Bone();
  leftArm.name = `${id}_arm_l`;
  leftArm.position.set(-0.34, 0.3, 0);
  const rightArm = new THREE.Bone();
  rightArm.name = `${id}_arm_r`;
  rightArm.position.set(0.34, 0.3, 0);
  const leftLeg = new THREE.Bone();
  leftLeg.name = `${id}_leg_l`;
  leftLeg.position.set(-0.17, 0.62, 0);
  const rightLeg = new THREE.Bone();
  rightLeg.name = `${id}_leg_r`;
  rightLeg.position.set(0.17, 0.62, 0);
  root.add(spine, leftLeg, rightLeg);
  spine.add(head, leftArm, rightArm);
  group.add(root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, spine, head, leftArm, rightArm, leftLeg, rightLeg]);

  const roleColor = agentPalette[id];
  const design = agentDesign[id];
  const accent = new THREE.MeshStandardMaterial({ color: roleColor, roughness: 0.45, metalness: 0.12 });
  const uniform = new THREE.MeshStandardMaterial({ color: 0xf3eee7, roughness: 0.72, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x252a35, roughness: 0.74, metalness: 0.06 });
  const face = new THREE.MeshStandardMaterial({ color: 0xf1c7a9, roughness: 0.76 });
  const hair = new THREE.MeshStandardMaterial({ color: design.hair, roughness: 0.8, metalness: 0.02 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x181b24, roughness: 0.5 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x17354e, emissive: 0x2b9ed6, emissiveIntensity: 0.55, roughness: 0.36 });
  const parcel = new THREE.MeshStandardMaterial({ color: 0xc89057, roughness: 0.84 });
  const bodyGeometry = new THREE.BoxGeometry(0.56, 0.72, 0.34).translate(0, 1.05, 0);
  const headGeometry = new THREE.SphereGeometry(0.31, 16, 12).translate(0, 1.63, 0);
  const leftArmGeometry = new THREE.CylinderGeometry(0.085, 0.1, 0.62, 8).translate(-0.42, 1.0, 0);
  const rightArmGeometry = new THREE.CylinderGeometry(0.085, 0.1, 0.62, 8).translate(0.42, 1.0, 0);
  const leftLegGeometry = new THREE.CylinderGeometry(0.1, 0.11, 0.65, 8).translate(-0.17, 0.34, 0);
  const rightLegGeometry = new THREE.CylinderGeometry(0.1, 0.11, 0.65, 8).translate(0.17, 0.34, 0);
  const skinLayer = [
    rigidSkinnedMesh(bodyGeometry, uniform, 1, skeleton),
    rigidSkinnedMesh(headGeometry, face, 2, skeleton),
    rigidSkinnedMesh(leftArmGeometry, uniform, 3, skeleton),
    rigidSkinnedMesh(rightArmGeometry, uniform, 4, skeleton),
    rigidSkinnedMesh(leftLegGeometry, dark, 5, skeleton),
    rigidSkinnedMesh(rightLegGeometry, dark, 6, skeleton),
  ];
  skinLayer.forEach((mesh) => {
    mesh.visible = false;
    group.add(mesh);
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), uniform);
  body.position.y = 0.33;
  spine.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.08), dark);
  vest.position.set(0, 0.32, -0.18);
  spine.add(vest);
  const roleStripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.025), accent);
  roleStripe.position.set(0, 0.31, -0.232);
  spine.add(roleStripe);
  if (design.skirt) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.28, 8), dark);
    skirt.position.y = -0.05;
    spine.add(skirt);
  }

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), face);
  headMesh.position.y = 0.17;
  head.add(headMesh);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.326, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.y = 0.21;
  head.add(hairCap);
  [-0.14, -0.04, 0.07, 0.16].forEach((x, index) => {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), hair);
    fringe.scale.set(1, 0.72 + index * 0.04, 0.64);
    fringe.position.set(x, 0.31 - Math.abs(x) * 0.42, -0.22);
    head.add(fringe);
  });
  [-0.105, 0.105].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), ink);
    eye.scale.set(0.78, 1.25, 0.48);
    eye.position.set(x, 0.17, -0.286);
    head.add(eye);
  });
  [-0.19, 0.19].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), face);
    ear.scale.set(0.55, 1, 0.72);
    ear.position.set(x, 0.17, -0.02);
    head.add(ear);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe99a98 }));
    cheek.scale.set(1.4, 0.48, 0.32);
    cheek.position.set(x * 0.68, 0.095, -0.294);
    head.add(cheek);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.009, 5, 10, Math.PI), ink);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 0.085, -0.302);
  head.add(mouth);
  const armGeometry = new THREE.CylinderGeometry(0.085, 0.1, 0.62, 8);
  const leftArmMesh = new THREE.Mesh(armGeometry, uniform);
  leftArmMesh.position.set(-0.08, -0.02, 0);
  leftArm.add(leftArmMesh);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), face);
  leftHand.position.set(-0.08, -0.35, 0);
  leftArm.add(leftHand);
  const rightArmMesh = new THREE.Mesh(armGeometry.clone(), uniform);
  rightArmMesh.position.set(0.08, -0.02, 0);
  rightArm.add(rightArmMesh);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), face);
  rightHand.position.set(0.08, -0.35, 0);
  rightArm.add(rightHand);
  const legGeometry = new THREE.CylinderGeometry(0.1, 0.11, 0.65, 8);
  const leftLegMesh = new THREE.Mesh(legGeometry, dark);
  leftLegMesh.position.y = -0.28;
  leftLeg.add(leftLegMesh);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), ink);
  leftShoe.position.set(0, -0.61, -0.08);
  leftLeg.add(leftShoe);
  const rightLegMesh = new THREE.Mesh(legGeometry.clone(), dark);
  rightLegMesh.position.y = -0.28;
  rightLeg.add(rightLegMesh);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), ink);
  rightShoe.position.set(0, -0.61, -0.08);
  rightLeg.add(rightShoe);

  const leftCollar = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 3), uniform);
  leftCollar.rotation.z = Math.PI;
  leftCollar.position.set(-0.1, 0.57, -0.24);
  spine.add(leftCollar);
  const rightCollar = leftCollar.clone();
  rightCollar.position.x = 0.1;
  spine.add(rightCollar);
  const tie = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.23, 4), accent);
  tie.rotation.z = Math.PI;
  tie.position.set(0, 0.43, -0.255);
  spine.add(tie);

  if (id === 'manager') {
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.37), dark);
    jacket.position.y = 0.31;
    spine.add(jacket);
    roleStripe.position.z = -0.202;
    tie.position.z = -0.205;
  }
  if (id === 'recommender') {
    [-0.29, 0.29].forEach((x) => {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), hair);
      bob.scale.set(0.72, 1.35, 0.72);
      bob.position.set(x, 0.08, 0.02);
      head.add(bob);
    });
  }
  if (id === 'receptionist') {
    const ponytail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), hair);
    ponytail.scale.set(0.78, 1.35, 0.8);
    ponytail.position.set(0.24, 0.12, 0.15);
    head.add(ponytail);
  }

  if (design.glasses) {
    [-0.105, 0.105].forEach((x) => {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 6, 16), ink);
      lens.position.set(x, 0.18, -0.307);
      head.add(lens);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.018), ink);
    bridge.position.set(0, 0.18, -0.307);
    head.add(bridge);
  }

  if (design.headphones) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.318, 0.028, 7, 22, Math.PI), accent);
    band.position.set(0, 0.2, -0.01);
    head.add(band);
    [-0.31, 0.31].forEach((x) => {
      const cup = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.11), accent);
      cup.position.set(x, 0.16, -0.02);
      head.add(cup);
    });
  }

  if (design.cap) {
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.342, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    capTop.scale.y = 0.64;
    capTop.position.y = 0.32;
    head.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.18), accent);
    brim.position.set(0.08, 0.27, -0.25);
    head.add(brim);
  }

  if (design.prop === 'tablet') {
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.43, 0.045), screen);
    tablet.rotation.z = -0.08;
    tablet.position.set(0.1, 0.08, -0.31);
    spine.add(tablet);
  }
  if (design.prop === 'parcel') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.3), parcel);
    box.position.set(0, 0.04, -0.39);
    spine.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.31), accent);
    band.position.copy(box.position);
    spine.add(band);
  }
  if (design.prop === 'magnifier') {
    const glass = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.024, 7, 18), accent);
    glass.position.set(0.2, -0.13, -0.2);
    rightArm.add(glass);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 7), dark);
    handle.rotation.z = -0.65;
    handle.position.set(0.1, -0.27, -0.2);
    rightArm.add(handle);
  }
  if (design.prop === 'hologram') {
    const model = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), screen);
    model.position.set(0, 0.06, -0.4);
    model.name = 'ProductionHologram';
    spine.add(model);
  }

  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ map: canvasTexture(['F3'], { width: 256, height: 256, accent: '#ff9b62' }), transparent: true, side: THREE.DoubleSide }),
  );
  badge.position.set(0, 0.38, -0.232);
  spine.add(badge);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.46, 28),
    new THREE.MeshBasicMaterial({ color: stateColor('IDLE'), side: THREE.DoubleSide, transparent: true, opacity: 0.86 }),
  );
  ring.name = `RigStateRing_${id}`;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.018;
  group.add(ring);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture([name], { width: 512, height: 160, accent: `#${roleColor.toString(16).padStart(6, '0')}` }),
    transparent: true,
    depthTest: false,
  }));
  label.position.set(0, 2.05, 0);
  label.scale.set(0.95, 0.3, 1);
  label.renderOrder = 5;
  group.add(label);

  scene.add(group);
  return { group, ring, bones: { root, spine, head, leftArm, rightArm, leftLeg, rightLeg } };
}

function addWorkshopBranding() {
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.15),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(['FANTASY3D', 'AI WORKSHOP'], { width: 1200, height: 300 }),
      transparent: false,
    }),
  );
  sign.name = 'Fantasy3DBrandSign';
  sign.position.set(12, 2.0, -1.23);
  sign.rotation.y = Math.PI;
  scene.add(sign);
}

function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.04, ...options });
}

function box(name, size, position, material, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function cylinder(name, radius, height, position, material, parent = scene, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function sphere(name, radius, position, material, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function applyConceptArtDirection() {
  room.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const name = object.name.toLowerCase();
    let color = null;
    if (name.includes('floor_substrate') || name.includes('exteriorapron')) color = artDirection.floor;
    else if (name.includes('wall_substrate')) color = artDirection.wall;
    else if (name.includes('ceiling_substrate')) color = artDirection.ceiling;
    else if (name.includes('desk_') || name.includes('modeltabletop')) color = artDirection.worktop;
    else if (name.includes('deskleg') || name.includes('rack') || name.includes('ceilingrail')) color = artDirection.dark;
    else if (name.includes('screen_') || name.includes('windowbacking')) color = artDirection.screen;
    else if (name.includes('zone_')) color = 0xd8c8b8;
    else if (name.includes('rout')) color = 0xb67b52;
    if (color === null) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material.color) return;
      material.color.setHex(color);
      material.roughness = name.includes('screen_') ? 0.3 : 0.7;
      material.metalness = name.includes('rack') ? 0.22 : 0.03;
      if (name.includes('screen_') || name.includes('windowbacking')) {
        material.emissive?.setHex(color);
        material.emissiveIntensity = 0.2;
      }
      material.needsUpdate = true;
    });
  });
}

function addPlant(name, x, z, scale = 1) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);
  const pot = standardMaterial(0xc87d54, { roughness: 0.78 });
  const stem = standardMaterial(0x4d6547, { roughness: 0.82 });
  const leaf = standardMaterial(artDirection.foliage, { roughness: 0.76 });
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.2 * scale, 0.42 * scale, 12), pot);
  planter.position.y = 0.21 * scale;
  group.add(planter);
  cylinder(`${name}_Stem`, 0.035 * scale, 0.7 * scale, [0, 0.72 * scale, 0], stem, group, 8);
  [[-0.18, 0.82, 0], [0.18, 1.0, 0.02], [-0.12, 1.18, 0.05], [0.12, 1.35, 0]].forEach((point, index) => {
    const crown = sphere(`${name}_Leaf_${index + 1}`, 0.24 * scale, point.map((value) => value * scale), leaf, group);
    crown.scale.set(1.25, 0.68, 0.7);
  });
  scene.add(group);
}

function addScreen(name, position, width, height, accent) {
  const frame = box(`${name}_Frame`, [width + 0.08, height + 0.08, 0.06], position, standardMaterial(artDirection.dark, { metalness: 0.24 }));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: canvasTexture([name.replaceAll('_', ' '), 'LIVE'], { width: 640, height: 320, accent }), side: THREE.DoubleSide }),
  );
  screen.name = name;
  screen.position.copy(frame.position);
  screen.position.z -= 0.035;
  screen.rotation.y = Math.PI;
  scene.add(screen);
}

function addHouseModel(name, position, scale = 1) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  group.scale.setScalar(scale);
  box(`${name}_Body`, [0.55, 0.42, 0.48], [0, 0.21, 0], standardMaterial(0xf4d7b8), group);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.34, 4), standardMaterial(0xc85d46, { roughness: 0.76 }));
  roof.name = `${name}_Roof`;
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.58;
  group.add(roof);
  box(`${name}_Door`, [0.13, 0.22, 0.02], [0, 0.13, -0.251], standardMaterial(0x6c4a36), group);
  scene.add(group);
  return group;
}

function addConceptDerivedSceneAssets() {
  const wood = standardMaterial(artDirection.wood, { roughness: 0.72 });
  const paper = standardMaterial(0xf6eadc, { roughness: 0.86 });
  const blue = standardMaterial(0x3f78a8, { emissive: 0x173a56, emissiveIntensity: 0.3, roughness: 0.34 });
  const orange = standardMaterial(0xdf7950, { roughness: 0.65 });
  const green = standardMaterial(artDirection.foliage, { roughness: 0.78 });

  addScreen('MANAGER_COMMAND', [2, 1.56, -1.05], 1.75, 0.72, '#ff9b62');
  addScreen('RECOMMENDATION_DATA', [11, 1.56, -1.05], 1.75, 0.72, '#7b76de');
  addScreen('ORDER_FLOW', [7, 1.52, -14.92], 1.45, 0.64, '#e88754');
  addScreen('QUALITY_PASS', [15, 1.52, -14.92], 1.55, 0.68, '#6f75d8');

  [6.35, 6.65, 6.95, 7.25].forEach((x, index) => {
    box(`ResearchBook_${index + 1}`, [0.22, 0.2 + index * 0.04, 0.44], [x, 1.02, -2.62], standardMaterial([0x4f8c93, 0xd4975f, 0x6178a0, 0xb85e5f][index]));
  });
  cylinder('ResearchGlobe', 0.22, 0.32, [7.72, 1.12, -2.64], blue, scene, 20);

  [-0.55, 0, 0.55].forEach((offset, index) => {
    const tablet = box(`RecommendationPanel_${index + 1}`, [0.46, 0.05, 0.34], [11 + offset, 1.04, -2.7], blue);
    tablet.rotation.x = -0.3;
  });

  box('ReceptionWelcome', [1.55, 0.11, 0.44], [15, 0.96, -2.66], paper);
  cylinder('ReceptionLamp', 0.08, 0.48, [15.72, 1.16, -2.68], orange, scene, 12);
  sphere('ReceptionLampShade', 0.18, [15.72, 1.4, -2.68], orange);

  [[6.55, -13.0], [7.05, -12.95], [7.5, -13.08]].forEach((position, index) => {
    const parcel = box(`OrderParcel_${index + 1}`, [0.38, 0.3, 0.34], [position[0], 1.03 + index * 0.05, position[1]], standardMaterial(0xc38a55));
    box(`OrderBand_${index + 1}`, [0.08, 0.31, 0.35], [parcel.position.x, parcel.position.y, parcel.position.z], orange);
  });

  cylinder('ProductionHologramBase', 0.48, 0.1, [11, 1.01, -13.0], standardMaterial(0x29475e, { metalness: 0.35 }), scene, 28);
  const productionHouse = addHouseModel('ProductionHouse', [11, 1.08, -13.0], 0.72);
  productionHouse.traverse((object) => {
    if (object.isMesh) object.material = blue;
  });

  const inspectionBoard = box('InspectionChecklist', [0.66, 0.05, 0.82], [15.25, 1.14, -13.0], paper);
  inspectionBoard.rotation.x = -0.34;
  [-0.2, 0, 0.2].forEach((offset, index) => {
    box(`InspectionMark_${index + 1}`, [0.28, 0.025, 0.035], [15.25, 1.18 + offset, -13.4], green);
  });

  addPlant('Plant_NorthWest', 4.5, -1.05, 0.9);
  addPlant('Plant_NorthEast', 19.4, -1.05, 0.9);
  addPlant('Plant_EntryWest', 3.1, -14.55, 0.78);
  addPlant('Plant_EntryEast', 20.5, -14.55, 0.78);

  addHouseModel('ShowcaseHouse_A', [21.75, 0.64, -6.5], 0.52);
  addHouseModel('ShowcaseHouse_B', [21.75, 1.14, -9.5], 0.42);
  cylinder('ShowcaseTreeTrunk', 0.06, 0.38, [21.75, 1.28, -7.5], wood, scene, 8);
  sphere('ShowcaseTreeCrown', 0.24, [21.75, 1.58, -7.5], green);

  const sky = box('WindowWorldBackdrop', [6.95, 1.02, 0.04], [12, 1.52, 0.16], standardMaterial(0x8fc9dc, { emissive: 0x5a8da1, emissiveIntensity: 0.35 }));
  sky.rotation.y = Math.PI;
  [[10.2, 1.55], [12.1, 1.36], [14.0, 1.7]].forEach(([x, y], index) => {
    const island = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.56, 7), standardMaterial(0x69806a));
    island.name = `WindowFloatingIsland_${index + 1}`;
    island.rotation.z = Math.PI;
    island.position.set(x, y, 0.1);
    scene.add(island);
  });
}

async function indexAgentParts() {
  agents.forEach(([id, name, , home]) => {
    const item = state[id];
    item.parts = [`AgentBody_${id}`, `AgentHead_${id}`, `StateRing_${id}`]
      .map((name) => room.getObjectByName(name)).filter(Boolean);
    item.parts.forEach((part) => { part.visible = false; });
    const rig = createAgentRig(id, name, home);
    item.rig = rig.group;
    item.ring = rig.ring;
    item.bones = rig.bones;
    setStatus(id, 'IDLE');
  });
  addWorkshopBranding();
  applyConceptArtDirection();
  addConceptDerivedSceneAssets();
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
    await indexAgentParts();
    const batch = [
      ['research-bookshelf', [3.8, 0, -5.4], true],
      ['lounge-sofa', [3.7, 0, -10.1], true],
      ['analysis-console', [2, 0.78, -2.1], false],
      ['inspection-lamp', [18.6, 0.93, -8.8], false],
    ];
    await Promise.all(batch.map(async ([name, position, collision]) => {
      const asset = await new GLTFLoader().loadAsync(`/workshop-runtime/props-batch-01/${name}.glb`);
      asset.scene.name = `Batch01_${name}`;
      asset.scene.position.set(...position);
      asset.scene.userData.floorObstacle = collision;
      scene.add(asset.scene);
    }));
    // Derive floor obstacles from the loaded geometry, not decorative route markers.
    scene.updateMatrixWorld(true);
    const obstacles = [];
    scene.traverse(object => {
      if (!object.userData.floorObstacle && (!object.isMesh || !/^(Desk_|ConferenceTable|MeetingStool_|ModelTableTop|RackShelf|Wall_|Planter)/.test(object.name))) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.max.y < 0.15 || bounds.min.y > 1.8) return;
      obstacles.push({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z });
    });
    navigation = createNavigation(obstacles, globalThis.PF);
    for (const [id, item] of Object.entries(state)) {
      const home = [item.home[0], -item.home[1]];
      const spawn = navigation.free(home) ? home : navigation.nearest(home);
      if (!spawn) throw new Error('No walkable spawn for ' + id);
      item.current.set(spawn[0] - item.home[0], 0, spawn[1] + item.home[1]);
      setStatus(id, item.status);
    }
    createAcceptedAsset();
    setCameraPreset(6);
    overlay.dataset.state = 'ready';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.dataset.ready = 'true';
    canvas.dataset.riggedAgents = String(agents.length);
    canvas.dataset.brand = 'Fantasy3D AI Workshop';
    canvas.dataset.conceptImagesInScene = '0';
    canvas.dataset.independentSceneAssets = String(independentSceneAssets.length);
    window.__FANTASY3D_RUNTIME__ = {
      ready: true, tier, manifest, agentCount: agents.length, riggedAgentCount: agents.length,
      brand: 'Fantasy3D AI Workshop', conceptImagesInScene: 0,
      independentSceneAssetCount: independentSceneAssets.length,
      errors: [], renderer: 'three-webgl',
      collision: { obstacleCount: navigation.obstacleCount, radius: navigation.radius, pathfinding: 'astar' },
      modelBatch: '01', modelBatchCount: batch.length,
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
    const persistedJob = (payload.jobs || [])[0] || null;
    hasPersistedJob = Boolean(persistedJob);
    gatewayWriteToken = payload.session?.token || '';
    const persistent = payload.capabilities?.persistentJobs ? ' · Persisted Jobs' : '';
    document.getElementById('gatewayStatus').textContent = `LIVE · ${payload.schema} · ${(payload.agents || []).length} Agent · Three.js Runtime${persistent}`;
    document.getElementById('activeTasks').textContent = payload.workflow ? payload.workflow.activeTasks : 0;
    if (!demoRunning && Date.now() >= demoLockUntil) {
      (payload.agents || []).forEach((agent) => setStatus(agent.id, normalizeStatus(agent.status)));
      if (persistedJob) {
        document.getElementById('taskId').textContent = persistedJob.id;
        document.getElementById('taskText').textContent = persistedJob.title;
        document.getElementById('taskState').textContent = persistedJob.status;
        progress = persistedJob.progress || 0;
        rack = persistedJob.status === 'PASS' ? 1 : 0;
        if (acceptedAsset) acceptedAsset.visible = persistedJob.status === 'PASS';
        syncPanel();
      } else if (latestTask) {
        document.getElementById('taskId').textContent = latestTask.id || latestTask.taskId || 'STORE-TASK';
        document.getElementById('taskText').textContent = latestTask.title || latestTask.description || '已读取商店任务。';
      }
    }
  } catch (_error) {
    document.getElementById('gatewayStatus').textContent = 'SIMULATED · 真实接口不可用，3D 闭环仍可本地运行';
  }
}

async function createPersistedJob() {
  if (!gatewayWriteToken) throw new Error('write session unavailable');
  const response = await fetch('/api/workshop/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workshop-Token': gatewayWriteToken },
    body: JSON.stringify({
      sourceTaskId: latestTask?.id || latestTask?.taskId || null,
      title: latestTask?.title || 'Workshop 3D 资产生产任务',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.job) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.job;
}

function queueJobTransition(status, nextProgress) {
  if (!activeJob || !gatewayWriteToken) return;
  jobWriteQueue = jobWriteQueue.then(async () => {
    if (!activeJob) return;
    const response = await fetch(`/api/workshop/jobs/${encodeURIComponent(activeJob.id)}/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workshop-Token': gatewayWriteToken },
      body: JSON.stringify({ status, progress: nextProgress }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.job) throw new Error(payload.error || `HTTP ${response.status}`);
    activeJob = payload.job;
  }).catch((error) => {
    event(`后端工单写入失败，继续本地闭环：${error.message}`);
    activeJob = null;
  });
}

async function runLoop({ persist = false } = {}) {
  clearInterval(loopTimer);
  demoRunning = true;
  progress = 0;
  rack = 0;
  phase = 0;
  if (acceptedAsset) acceptedAsset.visible = false;
  agents.forEach(([id]) => setStatus(id, 'IDLE'));
  const decision = document.getElementById('inspectionMode').value;
  activeJob = null;
  jobWriteQueue = Promise.resolve();
  if (persist) {
    try {
      activeJob = await createPersistedJob();
      document.getElementById('taskId').textContent = activeJob.id;
      event('Gateway 已创建后端持久化生产工单。');
    } catch (error) {
      event(`持久化不可用，改用本地闭环：${error.message}`);
    }
  }
  if (activeJob) {
    document.getElementById('taskId').textContent = activeJob.id;
    document.getElementById('taskText').textContent = activeJob.title;
  } else if (latestTask) {
    document.getElementById('taskId').textContent = latestTask.id || latestTask.taskId || 'STORE-TASK';
    document.getElementById('taskText').textContent = latestTask.title || 'Production 收到真实任务快照。';
  }
  event(`Gateway 接收${latestTask ? '真实任务快照' : '模拟任务'}，Production 流程启动。`);
  loopTimer = setInterval(() => {
    if ((phase === 3 && state.production.route?.length) || (phase === 14 && state.inspector.route?.length)) return;
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
      queueJobTransition('WORKING', 0);
    }
    if (phase > 3 && phase < 12) {
      progress = Math.min(68, progress + 8.5);
      document.getElementById('taskText').textContent = `3D 资产生产中，实时进度 ${Math.round(progress)}%。`;
      syncPanel();
      queueJobTransition('WORKING', progress);
    }
    if (phase === 12) {
      progress = 100;
      setStatus('production', 'PASS', anchors.modelTable);
      setStatus('inspector', 'NOTICE', [20.2, 8]);
      event('Production 完成，交给 Inspector。');
      queueJobTransition('INSPECTION', 100);
    }
    if (phase === 14) {
      setStatus('inspector', 'WORKING', [20.2, 8]);
      event('Inspector 检查碰撞、动线和展示架入口。');
    }
    if (phase === 17) {
      setStatus('inspector', decision, decision === 'PASS' ? anchors.rack : [20.2, 8]);
      document.getElementById('taskState').textContent = decision;
      queueJobTransition(decision, 100);
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
  const now = performance.now();
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  Object.values(state).forEach((item) => {
    const before = [item.home[0] + item.current.x, -item.home[1] + item.current.z];
    if (navigation && item.route?.length) {
      const next = navigation.advance(before, item.route, delta * 1.8);
      item.current.set(next[0] - item.home[0], 0, next[1] + item.home[1]);
    }
    if (!item.rig || !item.bones) return;
    const moving = Boolean(item.route?.length);
    const stride = Math.sin(elapsed * 8);
    const workBeat = Math.sin(elapsed * 7);
    const idleBreath = Math.sin(elapsed * 2.2) * 0.018;
    item.rig.position.set(item.home[0] + item.current.x, idleBreath, -item.home[1] + item.current.z);
    const dx = item.rig.position.x - before[0], dz = item.rig.position.z - before[1];
    if (Math.hypot(dx, dz) > 0.001) item.rig.rotation.y = Math.atan2(-dx, -dz);
    item.bones.root.rotation.z = moving ? stride * 0.035 : 0;
    item.bones.spine.rotation.x = item.status === 'WORKING' ? 0.12 + workBeat * 0.04 : 0;
    item.bones.head.rotation.y = item.status === 'NOTICE' ? Math.sin(elapsed * 4) * 0.22 : Math.sin(elapsed * 1.5) * 0.045;
    item.bones.leftLeg.rotation.x = moving ? stride * 0.55 : 0;
    item.bones.rightLeg.rotation.x = moving ? -stride * 0.55 : 0;
    item.bones.leftArm.rotation.x = moving ? -stride * 0.5 : item.status === 'WORKING' ? -0.72 + workBeat * 0.24 : 0;
    item.bones.rightArm.rotation.x = moving ? stride * 0.5 : item.status === 'WORKING' ? -0.72 - workBeat * 0.24 : 0;
    item.bones.rightArm.rotation.z = item.status === 'PASS' ? -0.7 + Math.sin(elapsed * 3) * 0.08 : 0;
    item.bones.head.rotation.z = item.status === 'RETURN' || item.status === 'ERROR' ? -0.18 : 0;
  });
  if (acceptedAsset?.visible) acceptedAsset.rotation.y += 0.012;
  renderer.render(scene, camera);
}

document.getElementById('runBtn').addEventListener('click', () => runLoop({ persist: true }));
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
loadRuntime().then(async () => {
  await syncGateway();
  if (!hasPersistedJob) runLoop({ persist: false });
});
setInterval(syncGateway, 10000);
