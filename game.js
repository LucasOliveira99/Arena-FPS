import * as THREE from 'three';

// ─── Config ───────────────────────────────────────────────────────────────
const ARENA_SIZE = 40;
const WALL_HEIGHT = 6;
const PLAYER_SPEED = 12;
const ROTATION_SPEED = 2.5;
const BULLET_SPEED = 35;
const BULLET_DAMAGE = 15;
const FIRE_COOLDOWN = 0.35;
const MAX_HEALTH = 100;
const ENEMY_SPEED = 6;
const ENEMY_FIRE_COOLDOWN = 0.8;
const ENEMY_AIM_ERROR = 0.08;

// ─── State ────────────────────────────────────────────────────────────────
let scene, camera, renderer;
let player, enemy;
let bullets = [];
let keys = {};
let clock = new THREE.Clock();
let gameRunning = false;
let playerHealth = MAX_HEALTH;
let enemyHealth = MAX_HEALTH;
let lastPlayerShot = 0;
let lastEnemyShot = 0;
let enemyTarget = new THREE.Vector3();
let colliders = [];

const _bulletRay = new THREE.Ray();
const _bulletHitPoint = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();

// ─── DOM ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const gameOverPanel = document.getElementById('game-over');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const playerHealthBar = document.getElementById('player-health-bar');
const enemyHealthBar = document.getElementById('enemy-health-bar');
const playerHealthText = document.getElementById('player-health-text');
const enemyHealthText = document.getElementById('enemy-health-text');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverText = document.getElementById('game-over-text');
const messageEl = document.getElementById('message');

// ─── Init ─────────────────────────────────────────────────────────────────
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.fog = new THREE.Fog(0x0a0a14, 20, 55);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.7, 15);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  setupLights();
  buildArena();
  createPlayer();
  createEnemy();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  animate();
}

function setupLights() {
  const ambient = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xaaccff, 1.2);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 60;
  dirLight.shadow.camera.left = -25;
  dirLight.shadow.camera.right = 25;
  dirLight.shadow.camera.top = 25;
  dirLight.shadow.camera.bottom = -25;
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0x6688ff, 0.8, 30);
  pointLight.position.set(0, WALL_HEIGHT - 1, 0);
  scene.add(pointLight);
}

function addBoxCollider(pos, size) {
  const center = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const half = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
  colliders.push({
    box3: new THREE.Box3(center.clone().sub(half), center.clone().add(half)),
  });
}

function bulletHitsCollider(from, to, box3) {
  if (box3.containsPoint(to)) return true;

  _bulletDir.subVectors(to, from);
  const dist = _bulletDir.length();
  if (dist < 1e-6) return box3.containsPoint(from);

  _bulletDir.divideScalar(dist);
  _bulletRay.set(from, _bulletDir);
  const t = _bulletRay.intersectBox(box3, _bulletHitPoint);
  return t !== null && t >= 0 && t <= dist;
}

function buildArena() {
  colliders = [];
  const half = ARENA_SIZE / 2;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 20, 20);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.8,
    metalness: 0.2,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid lines on floor
  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 20, 0x334466, 0x222244);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a,
    roughness: 0.6,
    metalness: 0.4,
  });

  const wallGeo = new THREE.BoxGeometry(ARENA_SIZE, WALL_HEIGHT, 0.5);
  const walls = [
    { pos: [0, WALL_HEIGHT / 2, -half], rot: 0 },
    { pos: [0, WALL_HEIGHT / 2, half], rot: 0 },
    { pos: [-half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2 },
    { pos: [half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2 },
  ];

  walls.forEach(({ pos, rot }) => {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(...pos);
    wall.rotation.y = rot;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    if (rot === 0) {
      addBoxCollider(pos, [ARENA_SIZE, WALL_HEIGHT, 0.5]);
    } else {
      addBoxCollider(pos, [0.5, WALL_HEIGHT, ARENA_SIZE]);
    }
  });

  // Corner pillars
  const pillarGeo = new THREE.CylinderGeometry(0.6, 0.6, WALL_HEIGHT, 8);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4455aa, metalness: 0.6, roughness: 0.3 });
  const corners = [[-half + 1, -half + 1], [half - 1, -half + 1], [-half + 1, half - 1], [half - 1, half - 1]];
  corners.forEach(([x, z]) => {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, WALL_HEIGHT / 2, z);
    pillar.castShadow = true;
    scene.add(pillar);
    addBoxCollider([x, WALL_HEIGHT / 2, z], [1.2, WALL_HEIGHT, 1.2]);
  });

  // Cover boxes
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x333355, roughness: 0.7 });
  const covers = [
    { pos: [-8, 1, -5], size: [3, 2, 3] },
    { pos: [8, 1, 5], size: [3, 2, 3] },
    { pos: [0, 0.75, 0], size: [4, 1.5, 4] },
    { pos: [-5, 0.5, 8], size: [2, 1, 5] },
    { pos: [6, 0.5, -8], size: [5, 1, 2] },
  ];
  covers.forEach(({ pos, size }) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...size), coverMat);
    box.position.set(...pos);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
    addBoxCollider(pos, size);
  });
}

function createPlayer() {
  player = {
    position: new THREE.Vector3(0, 1.7, 15),
    rotation: 0,
    radius: 0.5,
  };
}

function createEnemy() {
  const group = new THREE.Group();

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c2e,
    metalness: 0.85,
    roughness: 0.35,
  });
  const armorRedMat = new THREE.MeshStandardMaterial({
    color: 0x661122,
    metalness: 0.7,
    roughness: 0.4,
    emissive: 0x220008,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e18,
    metalness: 0.6,
    roughness: 0.5,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xff1133,
    emissive: 0xff0022,
    emissiveIntensity: 2.5,
    metalness: 0.2,
    roughness: 0.3,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a48,
    metalness: 0.9,
    roughness: 0.25,
  });

  const bodyMeshes = [];

  function part(geo, mat, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    m.castShadow = true;
    m.userData.baseEmissive = mat.emissive ? mat.emissive.getHex() : 0;
    m.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 1;
    group.add(m);
    bodyMeshes.push(m);
    return m;
  }

  // Pernas
  const legGeo = new THREE.BoxGeometry(0.28, 0.85, 0.32);
  const leftLeg = part(legGeo, darkMat, [-0.22, 0.42, 0]);
  const rightLeg = part(legGeo, darkMat, [0.22, 0.42, 0]);
  part(new THREE.BoxGeometry(0.32, 0.22, 0.38), armorMat, [-0.22, 0.88, 0.02]);
  part(new THREE.BoxGeometry(0.32, 0.22, 0.38), armorMat, [0.22, 0.88, 0.02]);

  // Torso e peitoral
  const torso = part(new THREE.BoxGeometry(0.85, 0.95, 0.55), armorMat, [0, 1.35, 0]);
  part(new THREE.BoxGeometry(0.55, 0.5, 0.12), armorRedMat, [0, 1.45, 0.3]);
  // Insígnia de perigo (X)
  part(new THREE.BoxGeometry(0.35, 0.06, 0.06), glowMat, [0, 1.5, 0.34]);
  part(new THREE.BoxGeometry(0.06, 0.35, 0.06), glowMat, [0, 1.5, 0.34]);

  // Ombros blindados
  part(new THREE.BoxGeometry(0.38, 0.28, 0.42), armorRedMat, [-0.58, 1.62, 0], [0, 0, 0.25]);
  part(new THREE.BoxGeometry(0.38, 0.28, 0.42), armorRedMat, [0.58, 1.62, 0], [0, 0, -0.25]);
  // Espinhos nos ombros
  part(new THREE.ConeGeometry(0.08, 0.35, 4), armorRedMat, [-0.62, 1.85, 0], [0, 0, 0.4]);
  part(new THREE.ConeGeometry(0.08, 0.35, 4), armorRedMat, [0.62, 1.85, 0], [0, 0, -0.4]);

  // Cabeça / capacete
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.05, 0);
  group.add(headGroup);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.62), armorMat);
  helmet.castShadow = true;
  helmet.userData.baseEmissive = 0;
  helmet.userData.baseEmissiveIntensity = 1;
  headGroup.add(helmet);
  bodyMeshes.push(helmet);

  part(new THREE.BoxGeometry(0.66, 0.18, 0.66), armorRedMat, [0, 2.28, 0]);
  // Visor com olhos vermelhos brilhantes
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x110008, metalness: 0.9, roughness: 0.2 })
  );
  visor.position.set(0, 2.02, 0.32);
  group.add(visor);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glowMat.clone());
  leftEye.position.set(-0.14, 2.02, 0.36);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glowMat.clone());
  rightEye.position.set(0.14, 2.02, 0.36);
  group.add(rightEye);

  // Antena de ameaça
  part(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), darkMat, [0.18, 2.55, -0.1]);
  part(new THREE.SphereGeometry(0.07, 8, 8), glowMat, [0.18, 2.8, -0.1]);

  // Reator nas costas
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8), glowMat.clone());
  core.position.set(0, 1.4, -0.38);
  core.rotation.x = Math.PI / 2;
  core.castShadow = true;
  core.userData.baseEmissive = 0xff0022;
  core.userData.baseEmissiveIntensity = 2.5;
  group.add(core);
  bodyMeshes.push(core);

  part(new THREE.BoxGeometry(0.5, 0.6, 0.25), darkMat, [0, 1.35, -0.42]);

  // Braços
  const leftArm = part(new THREE.BoxGeometry(0.22, 0.65, 0.22), darkMat, [-0.58, 1.15, 0.1]);
  const rightArm = part(new THREE.BoxGeometry(0.22, 0.65, 0.22), darkMat, [0.58, 1.05, 0.15]);

  // Rifle detalhado
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0.62, 1.05, 0.45);
  group.add(gunGroup);

  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), gunMat);
  gunBody.castShadow = true;
  gunGroup.add(gunBody);

  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), gunMat);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0.02, 0.42);
  gunGroup.add(gunBarrel);

  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.22), darkMat);
  gunStock.position.set(0, -0.02, -0.32);
  gunGroup.add(gunStock);

  const gunScope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8), armorRedMat);
  gunScope.rotation.x = Math.PI / 2;
  gunScope.position.set(0, 0.12, 0.05);
  gunGroup.add(gunScope);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.62);
  gunGroup.add(muzzle);

  // Luz de ameaça no reator
  const threatLight = new THREE.PointLight(0xff1133, 0.6, 4);
  threatLight.position.set(0, 1.4, -0.5);
  group.add(threatLight);

  group.position.set(0, 0, -15);
  scene.add(group);

  enemy = {
    mesh: group,
    position: group.position,
    rotation: 0,
    radius: 0.65,
    state: 'patrol',
    patrolTarget: new THREE.Vector3(5, 0, -5),
    stateTimer: 0,
    animPhase: 0,
    hitFlash: 0,
    gunRecoil: 0,
    parts: {
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      gunGroup,
      muzzle,
      leftEye,
      rightEye,
      core,
      headGroup,
      bodyMeshes,
      threatLight,
    },
  };
}

function animateEnemyVisuals(dt, isMoving) {
  const t = clock.getElapsedTime();
  enemy.animPhase += dt * (isMoving ? 9 : 3);
  const walk = isMoving ? Math.sin(enemy.animPhase) : Math.sin(t * 2) * 0.15;

  enemy.parts.leftLeg.rotation.x = walk * 0.55;
  enemy.parts.rightLeg.rotation.x = -walk * 0.55;
  enemy.parts.leftArm.rotation.x = -walk * 0.35;
  enemy.parts.rightArm.rotation.x = walk * 0.2;

  const bob = isMoving ? Math.abs(Math.sin(enemy.animPhase)) * 0.06 : Math.sin(t * 2.5) * 0.025;
  enemy.mesh.position.y = bob;

  const eyePulse = 1.8 + Math.sin(t * 6) * 0.7;
  enemy.parts.leftEye.material.emissiveIntensity = eyePulse;
  enemy.parts.rightEye.material.emissiveIntensity = eyePulse;
  enemy.parts.core.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.5;
  enemy.parts.threatLight.intensity = 0.5 + Math.sin(t * 4) * 0.25;

  if (enemy.state === 'combat') {
    enemy.parts.gunGroup.rotation.x = -0.12 + Math.sin(t * 3) * 0.03;
    enemy.parts.headGroup.rotation.y = Math.sin(t * 1.5) * 0.08;
  } else {
    enemy.parts.gunGroup.rotation.x = THREE.MathUtils.lerp(enemy.parts.gunGroup.rotation.x, 0, dt * 4);
    enemy.parts.headGroup.rotation.y = THREE.MathUtils.lerp(enemy.parts.headGroup.rotation.y, 0, dt * 4);
  }

  if (enemy.gunRecoil > 0) {
    enemy.gunRecoil = Math.max(0, enemy.gunRecoil - dt * 8);
    enemy.parts.gunGroup.position.z = 0.45 - enemy.gunRecoil * 0.15;
  } else {
    enemy.parts.gunGroup.position.z = THREE.MathUtils.lerp(enemy.parts.gunGroup.position.z, 0.45, dt * 10);
  }

  if (enemy.hitFlash > 0) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    const flash = enemy.hitFlash * 3;
    enemy.parts.bodyMeshes.forEach((m) => {
      m.material.emissive.setRGB(flash * 0.8, 0, 0);
      m.material.emissiveIntensity = 1 + flash;
    });
  } else if (enemy.wasHit) {
    enemy.parts.bodyMeshes.forEach((m) => {
      m.material.emissive.setHex(m.userData.baseEmissive ?? 0);
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity ?? 1;
    });
    enemy.wasHit = false;
  }
}

function flashEnemyHit() {
  enemy.hitFlash = 0.35;
  enemy.wasHit = true;
}

// ─── Game flow ────────────────────────────────────────────────────────────
function startGame() {
  menu.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  hud.classList.remove('hidden');
  messageEl.classList.add('hidden');

  playerHealth = MAX_HEALTH;
  enemyHealth = MAX_HEALTH;
  bullets.forEach(b => scene.remove(b.mesh));
  bullets = [];

  player.position.set(0, 1.7, 15);
  player.rotation = 0;
  enemy.position.set(0, 0, -15);
  enemy.rotation = Math.PI;
  enemy.mesh.rotation.y = Math.PI;
  enemy.mesh.position.y = 0;
  enemy.state = 'patrol';
  enemy.patrolTarget.set(8, 0, -8);
  enemy.stateTimer = 0;
  enemy.animPhase = 0;
  enemy.hitFlash = 0;
  enemy.gunRecoil = 0;
  enemy.wasHit = false;

  lastPlayerShot = 0;
  lastEnemyShot = 0;
  gameRunning = true;
  updateHUD();
}

function endGame(won) {
  gameRunning = false;
  hud.classList.add('hidden');
  gameOverPanel.classList.remove('hidden');
  gameOverTitle.textContent = won ? 'VITÓRIA!' : 'DERROTA';
  gameOverTitle.className = won ? 'win' : 'lose';
  gameOverText.textContent = won
    ? 'Você eliminou o oponente!'
    : 'O inimigo te derrotou. Tente novamente!';
}

function updateHUD() {
  const pPct = (playerHealth / MAX_HEALTH) * 100;
  const ePct = (enemyHealth / MAX_HEALTH) * 100;
  playerHealthBar.style.width = `${pPct}%`;
  enemyHealthBar.style.width = `${ePct}%`;
  playerHealthText.textContent = Math.max(0, playerHealth);
  enemyHealthText.textContent = Math.max(0, enemyHealth);
}

// ─── Shooting ─────────────────────────────────────────────────────────────
function shoot(fromPos, direction, isPlayer) {
  const geo = new THREE.SphereGeometry(0.12, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0x44aaff : 0xff4444,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(fromPos);

  // Muzzle flash light
  const flash = new THREE.PointLight(isPlayer ? 0x44aaff : 0xff4444, 2, 3);
  mesh.add(flash);

  scene.add(mesh);

  const dir = direction.clone().normalize();
  if (!isPlayer) {
    dir.x += (Math.random() - 0.5) * ENEMY_AIM_ERROR;
    dir.y += (Math.random() - 0.5) * ENEMY_AIM_ERROR * 0.5;
    dir.z += (Math.random() - 0.5) * ENEMY_AIM_ERROR;
    dir.normalize();
  }

  bullets.push({
    mesh,
    velocity: dir.multiplyScalar(BULLET_SPEED),
    isPlayer,
    life: 3,
  });
}

// ─── Player update ────────────────────────────────────────────────────────
function getCameraForward() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() > 0) forward.normalize();
  else forward.set(0, 0, -1);
  return forward;
}

function resolveCharacterCollisions(position, radius) {
  // Iterative solve keeps movement smooth when touching multiple colliders.
  for (let iter = 0; iter < 3; iter++) {
    let resolved = false;

    for (const { box3 } of colliders) {
      const minX = box3.min.x - radius;
      const maxX = box3.max.x + radius;
      const minZ = box3.min.z - radius;
      const maxZ = box3.max.z + radius;

      if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) {
        continue;
      }

      const pushLeft = position.x - minX;
      const pushRight = maxX - position.x;
      const pushBack = position.z - minZ;
      const pushFront = maxZ - position.z;

      const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (minPush === pushLeft) position.x = minX;
      else if (minPush === pushRight) position.x = maxX;
      else if (minPush === pushBack) position.z = minZ;
      else position.z = maxZ;

      resolved = true;
    }

    if (!resolved) break;
  }
}

function updatePlayer(dt) {
  if (keys['ArrowLeft']) player.rotation += ROTATION_SPEED * dt;
  if (keys['ArrowRight']) player.rotation -= ROTATION_SPEED * dt;

  camera.position.copy(player.position);
  camera.rotation.x = 0;
  camera.rotation.y = player.rotation;
  camera.rotation.z = 0;
  camera.updateMatrixWorld();

  const forward = getCameraForward();

  const moveDir = new THREE.Vector3();
  if (keys['ArrowUp']) moveDir.add(forward);
  if (keys['ArrowDown']) moveDir.sub(forward);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize().multiplyScalar(PLAYER_SPEED * dt);
    const nextPos = player.position.clone().add(moveDir);
    resolveCharacterCollisions(nextPos, player.radius);
    player.position.copy(nextPos);
    camera.position.copy(player.position);
    camera.updateMatrixWorld();
  }

  // Clamp to arena
  const limit = ARENA_SIZE / 2 - 1;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -limit, limit);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -limit, limit);
  camera.position.copy(player.position);

  const now = clock.getElapsedTime();
  if (keys['Space'] && now - lastPlayerShot >= FIRE_COOLDOWN) {
    lastPlayerShot = now;
    camera.updateMatrixWorld();
    const shootDir = getCameraForward();
    const muzzlePos = player.position.clone().add(shootDir.clone().multiplyScalar(0.8));
    shoot(muzzlePos, shootDir, true);
  }
}

// ─── Enemy AI ───────────────────────────────────────────────────────────────
function updateEnemy(dt) {
  const toPlayer = player.position.clone().sub(enemy.position);
  toPlayer.y = 0;
  const dist = toPlayer.length();

  enemy.stateTimer -= dt;

  if (dist < 25) {
    enemy.state = 'combat';
  } else if (enemy.stateTimer <= 0) {
    enemy.state = 'patrol';
    const half = ARENA_SIZE / 2 - 3;
    enemy.patrolTarget.set(
      (Math.random() - 0.5) * half * 2,
      0,
      (Math.random() - 0.5) * half * 2
    );
    enemy.stateTimer = 3 + Math.random() * 4;
  }

  let moveDir = new THREE.Vector3();

  if (enemy.state === 'combat') {
    const angleToPlayer = Math.atan2(toPlayer.x, toPlayer.z);
    enemy.rotation = angleToPlayer;
    enemy.mesh.rotation.y = angleToPlayer;

    if (dist > 8) {
      moveDir.copy(toPlayer.normalize());
    } else if (dist < 5) {
      moveDir.copy(toPlayer.normalize().negate());
    } else {
      // Strafe
      moveDir.set(-toPlayer.z, 0, toPlayer.x).normalize();
      if (Math.sin(clock.getElapsedTime() * 2) < 0) moveDir.negate();
    }

    const now = clock.getElapsedTime();
    if (now - lastEnemyShot >= ENEMY_FIRE_COOLDOWN && dist < 30) {
      lastEnemyShot = now;
      enemy.gunRecoil = 1;
      const shootDir = toPlayer.clone().normalize();
      const muzzlePos = new THREE.Vector3();
      enemy.parts.muzzle.getWorldPosition(muzzlePos);
      shoot(muzzlePos, shootDir, false);
    }
  } else {
    const toTarget = enemy.patrolTarget.clone().sub(enemy.position);
    toTarget.y = 0;
    if (toTarget.length() > 1) {
      moveDir.copy(toTarget.normalize());
      enemy.rotation = Math.atan2(toTarget.x, toTarget.z);
      enemy.mesh.rotation.y = enemy.rotation;
    }
  }

  const isMoving = moveDir.lengthSq() > 0;
  if (isMoving) {
    const nextPos = enemy.position.clone().add(moveDir.multiplyScalar(ENEMY_SPEED * dt));
    resolveCharacterCollisions(nextPos, enemy.radius);
    enemy.position.copy(nextPos);
  }

  const limit = ARENA_SIZE / 2 - 1.5;
  enemy.position.x = THREE.MathUtils.clamp(enemy.position.x, -limit, limit);
  enemy.position.z = THREE.MathUtils.clamp(enemy.position.z, -limit, limit);
  enemy.mesh.position.x = enemy.position.x;
  enemy.mesh.position.z = enemy.position.z;

  animateEnemyVisuals(dt, isMoving);
}

// ─── Bullets ────────────────────────────────────────────────────────────────
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevPos = b.mesh.position.clone();
    b.mesh.position.add(b.velocity.clone().multiplyScalar(dt));
    b.life -= dt;

    let hit = false;

    for (const col of colliders) {
      if (bulletHitsCollider(prevPos, b.mesh.position, col.box3)) {
        hit = true;
        break;
      }
    }

    if (!hit && b.isPlayer) {
      const enemyCenter = enemy.position.clone().add(new THREE.Vector3(0, 1.3, 0));
      const dist = b.mesh.position.distanceTo(enemyCenter);
      if (dist < enemy.radius + 0.3) {
        enemyHealth -= BULLET_DAMAGE;
        hit = true;
        flashEnemyHit();
        updateHUD();
        if (enemyHealth <= 0) endGame(true);
      }
    } else if (!hit) {
      const dist = b.mesh.position.distanceTo(player.position);
      if (dist < player.radius + 0.3) {
        playerHealth -= BULLET_DAMAGE;
        hit = true;
        updateHUD();
        if (playerHealth <= 0) endGame(false);
      }
    }

    // Wall collision
    const half = ARENA_SIZE / 2;
    const p = b.mesh.position;
    if (Math.abs(p.x) > half || Math.abs(p.z) > half || p.y < 0 || p.y > WALL_HEIGHT) {
      hit = true;
    }

    if (hit || b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

// ─── Loop ───────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameRunning) {
    updatePlayer(dt);
    updateEnemy(dt);
    updateBullets(dt);
  }

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
