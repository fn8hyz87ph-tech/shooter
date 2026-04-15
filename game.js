
const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('playBtn');
const healthEl = document.getElementById('health');
const playersEl = document.getElementById('players');
const toastEl = document.getElementById('toast');
const shootBtn = document.getElementById('shootBtn');
const crouchBtn = document.getElementById('crouchBtn');

function toast(msg, ms=1200){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=>toastEl.classList.remove('show'), ms);
}

// -------- Multiplayer transport (no Node.js) --------
const channel = new BroadcastChannel('fps-no-node-room');
const myId = Math.random().toString(36).slice(2);

const WORLD_SIZE = 60;
const DEFAULT_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.08;
const PLAYER_RADIUS = 0.42;
const MOVE_SPEED = 7.5;
const CROUCH_SPEED_MULT = 0.58;
const GRAVITY = 22;
const JUMP_VELOCITY = 8.2;
const SEND_RATE = 20;
const SHOOT_COOLDOWN = 160;
const STALE_MS = 2500;

const local = {
  id: myId,
  pos: new THREE.Vector3((Math.random()*2-1)*12, DEFAULT_HEIGHT, (Math.random()*2-1)*12),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  hp: 100,
  grounded: true,
  isCrouching: false,
  eyeHeight: DEFAULT_HEIGHT
};

healthEl.textContent = `HP: ${local.hp}`;

// -------- Three.js scene --------
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);
camera.position.copy(local.pos);
scene.add(camera);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(250, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0x87bfff, side: THREE.BackSide })
);
scene.add(sky);

scene.add(new THREE.AmbientLight(0xffffff, 0.58));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 35, 15);
scene.add(sun);

function createGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3f8f35';
  ctx.fillRect(0, 0, 256, 256);
  for(let i=0;i<5000;i++){
    const x = Math.random()*256;
    const y = Math.random()*256;
    const h = 2 + Math.random()*4;
    ctx.strokeStyle = Math.random() > 0.5 ? '#59b64d' : '#2f7d29';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random()-0.5)*2, y - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE*2, WORLD_SIZE*2),
  new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 1.0 })
);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

const colliders = [];
function addBox(x, y, z, w, h, d, color=0x7a5a44){
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 })
  );
  mesh.position.set(x,y,z);
  scene.add(mesh);
  colliders.push(mesh);
  return mesh;
}
function addWall(x, z, w, d){ addBox(x, 2, z, w, 4, d, 0x808080); }

addWall(0, -WORLD_SIZE, WORLD_SIZE*2, 2);
addWall(0,  WORLD_SIZE, WORLD_SIZE*2, 2);
addWall(-WORLD_SIZE, 0, 2, WORLD_SIZE*2);
addWall( WORLD_SIZE, 0, 2, WORLD_SIZE*2);
for(let i=0;i<12;i++){
  const x = (Math.random()*2-1)*(WORLD_SIZE-10);
  const z = (Math.random()*2-1)*(WORLD_SIZE-10);
  addBox(x, 1.2, z, 3, 2.4, 3, i % 2 ? 0x7a5a44 : 0x6d7d8e);
}

function addTree(x, z){
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4423 })
  );
  trunk.position.set(x, 1.5, z);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2e8b3c })
  );
  leaves.position.set(x, 4.3, z);
  scene.add(trunk, leaves);
}
for(let i=0;i<18;i++){
  const x = (Math.random()*2-1)*(WORLD_SIZE-8);
  const z = (Math.random()*2-1)*(WORLD_SIZE-8);
  if(Math.abs(x) < 10 && Math.abs(z) < 10) continue;
  addTree(x, z);
}

// Gun model
const gun = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.16, 0.7),
  new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.6 })
);
gunBody.position.set(0.18, -0.18, -0.5);
const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 0.45, 10),
  new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 })
);
barrel.rotation.z = Math.PI/2;
barrel.position.set(0.26, -0.16, -0.87);
const stock = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.18, 0.24),
  new THREE.MeshStandardMaterial({ color: 0x5f4632 })
);
stock.position.set(0.07, -0.19, -0.18);
const sight = new THREE.Mesh(
  new THREE.BoxGeometry(0.06, 0.04, 0.08),
  new THREE.MeshStandardMaterial({ color: 0x111111 })
);
sight.position.set(0.18, -0.08, -0.52);
gun.add(gunBody, barrel, stock, sight);
camera.add(gun);

const muzzleFlash = new THREE.PointLight(0xffddaa, 0, 6, 2);
muzzleFlash.position.set(0.38, -0.14, -1.05);
camera.add(muzzleFlash);
let gunKick = 0;
let flashTime = 0;

// Input
const keys = new Set();
let pointerLocked = false;
let canShoot = true;

function setCrouch(on){
  local.isCrouching = !!on;
  crouchBtn.classList.toggle('active', local.isCrouching);
}

window.addEventListener('keydown', e => {
  keys.add(e.code);
  if(e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') setCrouch(true);
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  if(e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') setCrouch(false);
});
playBtn.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = pointerLocked ? 'none' : 'grid';
});
window.addEventListener('mousemove', e => {
  if(!pointerLocked) return;
  const sens = 0.0022;
  local.yaw -= e.movementX * sens;
  local.pitch -= e.movementY * sens;
  local.pitch = Math.max(-1.45, Math.min(1.45, local.pitch));
});
window.addEventListener('mousedown', e => {
  if(pointerLocked && e.button === 0) shoot();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

shootBtn.addEventListener('click', (e) => {
  e.preventDefault();
  shoot();
});
shootBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  shoot();
}, { passive: false });

crouchBtn.addEventListener('click', (e) => {
  e.preventDefault();
  setCrouch(!local.isCrouching);
});
crouchBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  setCrouch(!local.isCrouching);
}, { passive: false });

// Remote players
const remotePlayers = new Map();
function colorFromId(id){
  let h = 0;
  for(let i=0;i<id.length;i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color(`hsl(${h % 360} 70% 60%)`);
}
function makeRemotePlayer(id){
  const color = colorFromId(id);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 1.2, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  body.position.y = 0.95;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2d3b3 })
  );
  head.position.y = 1.72;
  group.add(body, head);
  scene.add(group);
  return { id, group, targetPos: new THREE.Vector3(), targetYaw: 0, hp: 100, lastSeen: performance.now() };
}
function upsertRemote(state){
  if(state.id === myId) return;
  if(!remotePlayers.has(state.id)) remotePlayers.set(state.id, makeRemotePlayer(state.id));
  const rp = remotePlayers.get(state.id);
  rp.targetPos.set(state.pos[0], 0, state.pos[2]);
  rp.targetYaw = state.yaw || 0;
  rp.hp = state.hp ?? 100;
  rp.lastSeen = performance.now();
}

function broadcast(type, payload={}){
  channel.postMessage({ type, from: myId, ...payload });
}

channel.onmessage = (event) => {
  const msg = event.data || {};
  if(!msg || msg.from === myId) return;

  if(msg.type === 'hello') broadcast('state', { state: currentState() });
  if(msg.type === 'state' && msg.state) upsertRemote(msg.state);
  if(msg.type === 'shoot' && msg.targetId === myId){
    if(local.hp <= 0) return;
    local.hp = Math.max(0, local.hp - 25);
    healthEl.textContent = `HP: ${local.hp}`;
    toast(local.hp > 0 ? `You were hit! HP: ${local.hp}` : 'Eliminated!', 900);
    if(local.hp <= 0) setTimeout(respawn, 1000);
    broadcast('state', { state: currentState() });
  }
};

function currentState(){
  return {
    id: myId,
    pos: [local.pos.x, local.pos.y, local.pos.z],
    yaw: local.yaw,
    pitch: local.pitch,
    hp: local.hp
  };
}

broadcast('hello');
setInterval(()=>broadcast('state', { state: currentState() }), 1000 / SEND_RATE);
setInterval(()=>{
  const now = performance.now();
  for(const [id, rp] of remotePlayers){
    if(now - rp.lastSeen > STALE_MS){
      scene.remove(rp.group);
      remotePlayers.delete(id);
    }
  }
  playersEl.textContent = `Players: ${remotePlayers.size + 1}`;
}, 300);
window.addEventListener('beforeunload', ()=> channel.close());

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function sphereBoxResolve(pos, radius, boxMesh){
  const box = new THREE.Box3().setFromObject(boxMesh);
  const closest = new THREE.Vector3(
    clamp(pos.x, box.min.x, box.max.x),
    clamp(pos.y, box.min.y, box.max.y),
    clamp(pos.z, box.min.z, box.max.z)
  );
  const delta = pos.clone().sub(closest);
  const distSq = delta.lengthSq();
  if(distSq < radius * radius){
    const dist = Math.sqrt(distSq) || 0.0001;
    pos.add(delta.multiplyScalar((radius - dist) / dist));
    return true;
  }
  return false;
}

const raycaster = new THREE.Raycaster();
function makeTracer(start, end){
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color: 0xfff4aa });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  setTimeout(()=>{ scene.remove(line); geometry.dispose(); material.dispose(); }, 60);
}

function shoot(){
  if(!canShoot || local.hp <= 0) return;
  canShoot = false;
  shootBtn.classList.add('active');
  setTimeout(() => {
    canShoot = true;
    shootBtn.classList.remove('active');
  }, SHOOT_COOLDOWN);

  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  gunKick = 1;
  flashTime = 0.05;
  muzzleFlash.intensity = 3.2;

  raycaster.set(origin, dir);
  raycaster.far = 120;
  const wallHits = raycaster.intersectObjects(colliders, false);
  let wallDistance = Infinity;
  let endPoint = origin.clone().add(dir.clone().multiplyScalar(100));
  if(wallHits.length){
    wallDistance = wallHits[0].distance;
    endPoint = wallHits[0].point.clone();
  }

  let bestTargetId = null;
  let bestDist = Infinity;
  for(const [id, rp] of remotePlayers){
    if(rp.hp <= 0) continue;
    const chest = rp.group.position.clone();
    chest.y = 1.2;
    const toTarget = chest.clone().sub(origin);
    const t = toTarget.dot(dir);
    if(t < 0 || t > wallDistance) continue;
    const closest = origin.clone().add(dir.clone().multiplyScalar(t));
    const distToLine = closest.distanceTo(chest);
    if(distToLine <= 0.75 && t < bestDist){
      bestDist = t;
      bestTargetId = id;
      endPoint = chest.clone();
    }
  }

  makeTracer(origin, endPoint);
  if(bestTargetId){
    broadcast('shoot', { targetId: bestTargetId });
    toast('Hit!', 450);
  }
}

function respawn(){
  local.hp = 100;
  local.pos.set((Math.random()*2-1)*18, local.eyeHeight, (Math.random()*2-1)*18);
  local.vel.set(0,0,0);
  healthEl.textContent = `HP: ${local.hp}`;
  toast('Respawned', 800);
  broadcast('state', { state: currentState() });
}

const clock = new THREE.Clock();
function step(dt){
  const forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafeInput  = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if(camForward.lengthSq() === 0) camForward.set(0, 0, -1);
  camForward.normalize();

  // Right vector from camera-forward cross world-up.
  // This guarantees A = left and D = right relative to where you face.
  const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).negate().normalize();

  const move = new THREE.Vector3();
  move.addScaledVector(camForward, forwardInput);
  move.addScaledVector(camRight, strafeInput);

  const speed = MOVE_SPEED * (local.isCrouching ? CROUCH_SPEED_MULT : 1);
  if(move.lengthSq() > 0){
    move.normalize().multiplyScalar(speed);
    local.vel.x = move.x;
    local.vel.z = move.z;
  } else {
    local.vel.x *= 0.76;
    local.vel.z *= 0.76;
  }

  if(local.grounded && keys.has('Space') && local.hp > 0 && !local.isCrouching){
    local.vel.y = JUMP_VELOCITY;
    local.grounded = false;
  }

  local.vel.y -= GRAVITY * dt;
  local.pos.addScaledVector(local.vel, dt);

  const targetEyeHeight = local.isCrouching ? CROUCH_HEIGHT : DEFAULT_HEIGHT;
  local.eyeHeight += (targetEyeHeight - local.eyeHeight) * Math.min(1, dt * 12);

  if(local.pos.y <= local.eyeHeight){
    local.pos.y = local.eyeHeight;
    local.vel.y = 0;
    local.grounded = true;
  }

  local.pos.x = clamp(local.pos.x, -WORLD_SIZE + 2, WORLD_SIZE - 2);
  local.pos.z = clamp(local.pos.z, -WORLD_SIZE + 2, WORLD_SIZE - 2);

  const spherePos = new THREE.Vector3(local.pos.x, Math.max(1.0, local.eyeHeight * 0.6), local.pos.z);
  for(const mesh of colliders){
    if(sphereBoxResolve(spherePos, PLAYER_RADIUS, mesh)){
      local.pos.x = spherePos.x;
      local.pos.z = spherePos.z;
      local.vel.x *= 0.18;
      local.vel.z *= 0.18;
    }
  }

  camera.position.set(local.pos.x, local.pos.y, local.pos.z);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), local.yaw);
  const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), local.pitch);
  camera.quaternion.copy(yawQ).multiply(pitchQ);

  if(flashTime > 0){
    flashTime -= dt;
    if(flashTime <= 0) muzzleFlash.intensity = 0;
  }
  if(gunKick > 0) gunKick = Math.max(0, gunKick - dt * 10);

  gun.position.y = local.isCrouching ? -0.08 : 0;
  gun.rotation.set(-0.05 - gunKick * 0.12, 0.02, 0);

  for(const [, rp] of remotePlayers){
    rp.group.position.lerp(rp.targetPos, 0.18);
    rp.group.rotation.y += (rp.targetYaw - rp.group.rotation.y) * 0.18;
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1/30);
  step(dt);
  renderer.render(scene, camera);
}
animate();
