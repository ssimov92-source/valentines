/* ===============================
   CONFIG — EDIT THESE
================================ */

const ROOMS = {
  "The Great Hall of Indulgence": {
    actions: [
      { id:"gh_a1", title:"Action — Inventory of Desire", text:"Find the items hidden in this chamber. Choose the one that calls to you most, and tell me why." },
      { id:"gh_a2", title:"Action — Offering", text:"Select one item and place it somewhere visible. Leave it there." },
      { id:"gh_a3", title:"Action — Confession", text:"Tell me one thing you enjoy but don’t often admit." }
    ],
    rewards: {
      small:{ title:"Room Cleared", text:"The hall hums softly. You may proceed." },
      big:{ title:"Critical Success", text:"The hall approves. A stronger desire awakens." },
      nat20:{ title:"NAT 20 — Favor of Indulgence", text:"Reality bends. The ritual deepens." }
    },
    paidHint: "Look where items are usually kept nearby. Don’t overthink it."
  },

  "The Passage of Submission": {
    actions: [
      { id:"ps_a1", title:"Action — Oath", text:"Speak a single sentence committing yourself to this night." },
      { id:"ps_a2", title:"Action — Stillness", text:"Hold still for ten slow breaths. No fidgeting." },
      { id:"ps_a3", title:"Action — Token", text:"Bring an object from another room and place it here." }
    ],
    rewards: {
      small:{ title:"Room Cleared", text:"The passage opens further." },
      big:{ title:"Critical Success", text:"The walls whisper approval." },
      nat20:{ title:"NAT 20 — Chosen Path", text:"A secret route reveals itself where none existed." }
    },
    paidHint: "Stand at the entrance and scan left-to-right; the clue is meant to be noticed fast."
  },

  "The Royal Chamber": {
    actions: [
      { id:"rc_a1", title:"Action — Claim", text:"Stand or sit where you feel most powerful. Hold it." },
      { id:"rc_a2", title:"Action — Command", text:"Say one clear instruction for what you want later." },
      { id:"rc_a3", title:"Action — Confession", text:"Tell me what makes you feel most desired." }
    ],
    rewards: {
      small:{ title:"Room Cleared", text:"The chamber yields." },
      big:{ title:"Critical Success", text:"The chamber offers more." },
      nat20:{ title:"NAT 20 — Crowned", text:"The throne recognizes you." }
    },
    paidHint: "Focus on the place you naturally reach for first in that room."
  },

  "The Secret Chamber": {
    actions: [
      { id:"sc_a1", title:"Action — Discovery", text:"Find something hidden in this room and bring it out." },
      { id:"sc_a2", title:"Action — Choice", text:"Choose one item you will use later and set it aside." },
      { id:"sc_a3", title:"Action — Whisper", text:"Tell me what excites you about secrets." }
    ],
    rewards: {
      small:{ title:"Room Cleared", text:"The secret is acknowledged." },
      big:{ title:"Critical Success", text:"A deeper secret stirs." },
      nat20:{ title:"NAT 20 — Beyond the Veil", text:"The hidden reveals itself willingly." }
    },
    paidHint: "Check the most ‘private’ storage spot in that room."
  },

  "The Sanctum of Purification": {
    actions: [
      { id:"sp_a1", title:"Action — Preparation", text:"Wash your hands slowly and deliberately." },
      { id:"sp_a2", title:"Action — Ritual", text:"Dry your hands. Breathe once, fully." },
      { id:"sp_a3", title:"Action — Mark", text:"Look at yourself briefly and acknowledge what you see." }
    ],
    rewards: {
      small:{ title:"Room Cleared", text:"You are prepared." },
      big:{ title:"Critical Success", text:"You are more than prepared." },
      nat20:{ title:"NAT 20 — Transcendence", text:"The rite exceeds its limit." }
    },
    paidHint: "The clue is near where you start your routine."
  }
};

const ROUTE = [
  "The Great Hall of Indulgence",
  "The Passage of Submission",
  "The Royal Chamber",
  "The Sanctum of Purification",
  "The Secret Chamber"
];

function directionText(roomName, tier) {
  if (tier === "low")  return "The air turns thick with omen. Seek the chamber by instinct.";
  if (tier === "mid")  return `Go to ${roomName}. Watch what your eyes skip.`;
  return `${roomName}. Go there now — without hesitation.`;
}

const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 900;

const STORAGE_KEY = "dark_valentine_v3_three";

const STARTING_OBOLS = 3;
const HINT_COST = 1;

/* ===============================
   ENGINE STATE / HELPERS
================================ */

const ui = document.getElementById("ui");

/* --- Sound --- */
const clackEl = document.getElementById("clack");
let audioUnlocked = false;

function unlockAudioOnce(){
  if (audioUnlocked) return;
  if (!clackEl) { audioUnlocked = true; return; }

  clackEl.volume = 0.85;
  clackEl.currentTime = 0;

  const p = clackEl.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      clackEl.pause();
      clackEl.currentTime = 0;
      audioUnlocked = true;
    }).catch(() => { audioUnlocked = false; });
  } else {
    audioUnlocked = true;
  }
}

function playClack(){
  if (!clackEl) return;
  try {
    clackEl.currentTime = 0;
    clackEl.play().catch(()=>{});
  } catch {}
}

let state = safeLoad() ?? {
  stepIndex: 0,
  lastRoll: null,
  armed: false,
  completed: [],
  obols: STARTING_OBOLS,
  paidHintUsedAtStep: {}
};

function safeLoad(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function clarityTier(r){ if (r <= 7) return "low"; if (r <= 14) return "mid"; return "high"; }
function rewardTierFromRoll(r){ if (r === 20) return "nat20"; return r >= 15 ? "big" : "small"; }
function nextRoomName(){ return ROUTE[state.stepIndex % ROUTE.length]; }

function pickNextAction(roomName){
  const room = ROOMS[roomName];
  if (!room) return null;
  return room.actions.find(a => !state.completed.includes(a.id)) ?? null;
}
function roomCleared(roomName){
  const room = ROOMS[roomName];
  if (!room) return false;
  return room.actions.every(a => state.completed.includes(a.id));
}

function rollD20(){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 20) + 1;
}

async function requestMotionPermission(){
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    return DeviceMotionEvent.requestPermission();
  }
  return "granted";
}

async function tryFullscreen(){
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  try { if (fn) await fn.call(el); } catch {}
}

/* ----- Shake listener ----- */
let shakeListenerInstalled = false;
let lastShakeAt = 0;

function installShakeListener(onShake){
  if (shakeListenerInstalled) return;
  shakeListenerInstalled = true;

  window.addEventListener("devicemotion", (e) => {
    const now = Date.now();
    if (now - lastShakeAt < SHAKE_COOLDOWN_MS) return;

    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
    const magnitude = Math.sqrt(x*x + y*y + z*z);

    if (magnitude > SHAKE_THRESHOLD) {
      lastShakeAt = now;
      onShake();
    }
  }, { passive: true });
}

/* ===============================
   3D DICE (Three.js)
   - A real 3D d20 mesh
   - It tumbles + moves across the screen
   - Then “lands” and reveals the correct number as an overlay
================================ */

let three = null;

function initThreeDice(){
  if (three) return;

  const layer = document.getElementById("dice3dLayer");
  if (!layer || !window.THREE) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearAlpha(0);
  layer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0.6, 6);

  // Lights (neon purple)
  const key = new THREE.DirectionalLight(0xf2e6ff, 1.15);
  key.position.set(3.5, 4.2, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb047ff, 0.65);
  fill.position.set(-4.5, 1.8, 3.6);
  scene.add(fill);

  const rim = new THREE.PointLight(0x7b2cff, 1.4, 30);
  rim.position.set(0, -2.6, 2.2);
  scene.add(rim);

  // D20 geometry (icosahedron)
  const geometry = new THREE.IcosahedronGeometry(1.25, 0);

  // Neon purple + black dice
  const material = new THREE.MeshStandardMaterial({
    color: 0x120814,
    metalness: 0.85,
    roughness: 0.18,
    emissive: 0x5b1cff,
    emissiveIntensity: 1.1
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xb455ff, linewidth: 1 })
  );
  mesh.add(edges);

  // Liquid core
  const liquidGeo = new THREE.IcosahedronGeometry(1.02, 1);
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: 0x7b2cff,
    metalness: 0.1,
    roughness: 0.25,
    transmission: 0.6,
    thickness: 0.8,
    emissive: 0x3a0b7a,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.55
  });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.position.set(0, -0.08, 0);
  mesh.add(liquid);

  // Number plane that sits on the upper face
  const numberCanvas = document.createElement("canvas");
  numberCanvas.width = 256;
  numberCanvas.height = 256;
  const numberCtx = numberCanvas.getContext("2d");
  const numberTexture = new THREE.CanvasTexture(numberCanvas);
  numberTexture.colorSpace = THREE.SRGBColorSpace;
  const numberMat = new THREE.MeshBasicMaterial({
    map: numberTexture,
    transparent: true,
    opacity: 0
  });
  const numberPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), numberMat);
  numberPlane.position.set(0, 1.28, 0);
  numberPlane.rotation.x = -Math.PI / 2;
  mesh.add(numberPlane);

  // A subtle aura plane behind it
  const auraGeo = new THREE.PlaneGeometry(6, 6);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0x7a3cff,
    transparent: true,
    opacity: 0.08
  });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.position.set(0, 0, -3);
  scene.add(aura);

  let anim = {
    rolling: false,
    start: 0,
    duration: 1150,
    fromPos: new THREE.Vector3(0, 0, 0),
    toPos: new THREE.Vector3(0, -0.15, 0),
    fromRot: new THREE.Euler(0, 0, 0),
    toRot: new THREE.Euler(0, 0, 0)
  };
  let numberOpacityTarget = 0;

  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  function loop(ts){
    requestAnimationFrame(loop);

    // idle drift
    if (!anim.rolling) {
      mesh.rotation.y += 0.003;
      mesh.rotation.x += 0.0015;
      aura.rotation.z += 0.0008;
      liquid.rotation.x += 0.0022;
      liquid.rotation.y += 0.0015;
      liquid.position.y = -0.08 + Math.sin(ts * 0.002) * 0.05;
    } else {
      const t = Math.min(1, (ts - anim.start) / anim.duration);
      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;

      // position lerp (fly then settle)
      mesh.position.lerpVectors(anim.fromPos, anim.toPos, ease);

      // rotation blend: spin fast then slow down
      mesh.rotation.set(
        anim.fromRot.x + (anim.toRot.x - anim.fromRot.x) * ease,
        anim.fromRot.y + (anim.toRot.y - anim.fromRot.y) * ease,
        anim.fromRot.z + (anim.toRot.z - anim.fromRot.z) * ease
      );

      if (t >= 1) anim.rolling = false;
    }

    numberMat.opacity += (numberOpacityTarget - numberMat.opacity) * 0.12;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  function drawNumber(n){
    if (!numberCtx) return;
    numberCtx.clearRect(0, 0, numberCanvas.width, numberCanvas.height);
    numberCtx.fillStyle = "rgba(0,0,0,0.0)";
    numberCtx.fillRect(0, 0, numberCanvas.width, numberCanvas.height);
    numberCtx.fillStyle = "#f6f0ff";
    numberCtx.textAlign = "center";
    numberCtx.textBaseline = "middle";
    numberCtx.font = "900 140px 'Times New Roman', serif";
    numberCtx.shadowColor = "rgba(120,45,255,0.85)";
    numberCtx.shadowBlur = 24;
    numberCtx.fillText(String(n), numberCanvas.width / 2, numberCanvas.height / 2 + 6);
    numberTexture.needsUpdate = true;
  }

  function rollAnimation(result){
    // move across screen: start off to the side, end center-ish
    anim.rolling = true;
    anim.start = performance.now();
    anim.duration = 1250;

    // random start side for variety
    const side = (Math.random() < 0.5) ? -1 : 1;
    anim.fromPos = new THREE.Vector3(3.2 * side, 0.9, 0.4);
    anim.toPos   = new THREE.Vector3(0, 0.35, 0);

    anim.fromRot = new THREE.Euler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    // we “land” with a stable orientation (not true face mapping, but looks like it settles)
    anim.toRot = new THREE.Euler(
      (result % 5) * 0.35,
      (result % 7) * 0.42,
      (result % 3) * 0.25
    );

    numberOpacityTarget = 0;
    drawNumber(result);

    // clacks timed with the tumble
    playClack();
    setTimeout(playClack, 180);
    setTimeout(playClack, 380);
    setTimeout(playClack, 650);
    setTimeout(() => { playClack(); numberOpacityTarget = 1; }, 1100);
  }

  three = { rollAnimation };
}

function rollDiceWith3D(result){
  initThreeDice();
  if (three?.rollAnimation) three.rollAnimation(result);
}

/* ===============================
   UI SCREENS
================================ */

function renderHome(){
  const room = nextRoomName();

  ui.innerHTML = `
    <h2>Dark Valentine Quest</h2>
    <p class="muted">Next destination:</p>
    <p class="room">${escapeHtml(room)}</p>

    <div class="row">
      <span class="badge mono">Obols: ${state.obols}</span>
      <span class="badge mono">Hint price: ${HINT_COST}</span>
      ${audioUnlocked ? `<span class="badge mono">Audio: ON</span>` : `<span class="badge mono">Audio: tap to enable</span>`}
    </div>

    <div class="spacer"></div>

    <div class="row">
      <button id="shakeBtn">Roll (shake)</button>
      <button id="tapBtn" class="secondary">Roll (tap)</button>
      <button id="fsBtn" class="secondary">Fullscreen</button>
      <button id="resetBtn" class="danger">Reset</button>
    </div>

    <div class="spacer"></div>
    <p class="muted">Tip: the 3D die rolls across the screen and “lands” on the result.</p>
  `;

  document.getElementById("fsBtn").onclick = () => {
    unlockAudioOnce();
    tryFullscreen();
  };

  document.getElementById("shakeBtn").onclick = async () => {
    unlockAudioOnce();
    initThreeDice();

    const perm = await requestMotionPermission();
    if (perm !== "granted") {
      ui.insertAdjacentHTML("beforeend", `<div class="hr"></div><p style="color: rgba(255,130,130,0.92);">Motion permission denied. Use “Roll (tap)”.</p>`);
      return;
    }

    state.armed = true;
    save();

    installShakeListener(() => {
      if (!state.armed) return;
      const r = rollD20();
      state.lastRoll = r;
      state.armed = false;
      save();

      rollDiceWith3D(r);
      setTimeout(renderDirection, 1050);
    });

    ui.insertAdjacentHTML("beforeend", `<div class="hr"></div><p class="mono">Armed. Shake to roll…</p>`);
  };

  document.getElementById("tapBtn").onclick = () => {
    unlockAudioOnce();
    initThreeDice();
    const r = rollD20();
    state.lastRoll = r;
    save();

    rollDiceWith3D(r);
    setTimeout(renderDirection, 1050);
  };

  document.getElementById("resetBtn").onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };
}

function renderDirection(){
  const room = nextRoomName();
  const roll = state.lastRoll ?? 1;
  const tier = clarityTier(roll);

  const text = directionText(room, tier);
  const paidUsed = !!state.paidHintUsedAtStep[state.stepIndex];
  const canBuyHint = !paidUsed && state.obols >= HINT_COST;
  const paidHintText = ROOMS[room]?.paidHint ?? "The dungeon offers nothing more.";

  ui.innerHTML = `
    <h3>Direction</h3>
    <p class="clarity-${tier}">${escapeHtml(text)}</p>

    <div class="row">
      <span class="badge mono">d20: ${roll}</span>
      <span class="badge mono">clarity: ${tier.toUpperCase()}</span>
      <span class="badge mono">Obols: ${state.obols}</span>
    </div>

    <div class="spacer"></div>

    <div class="row">
      <button id="thereBtn">I’m there</button>
      <button id="rerollBtn" class="secondary">Re-roll</button>
      <button id="hintBtn" class="secondary" ${canBuyHint ? "" : "disabled"}>
        Pay the price (-${HINT_COST})
      </button>
    </div>

    ${paidUsed ? `
      <div class="hr"></div>
      <p class="muted"><span class="mono">Price paid.</span> ${escapeHtml(paidHintText)}</p>
    ` : ""}
  `;

  document.getElementById("thereBtn").onclick = () => renderAction();

  document.getElementById("rerollBtn").onclick = () => {
    state.lastRoll = null;
    save();
    renderHome();
  };

  document.getElementById("hintBtn").onclick = () => {
    if (!canBuyHint) return;
    unlockAudioOnce();
    playClack();
    state.obols -= HINT_COST;
    state.paidHintUsedAtStep[state.stepIndex] = true;
    save();
    renderDirection();
  };
}

function renderAction(){
  const room = nextRoomName();
  const action = pickNextAction(room);

  if (!action) return renderReward(room);

  ui.innerHTML = `
    <h3>${escapeHtml(action.title)}</h3>
    <p class="muted">Chamber:</p>
    <p class="room">${escapeHtml(room)}</p>
    <p>${escapeHtml(action.text)}</p>

    <div class="row">
      <button id="doneBtn">Done</button>
      <button id="backBtn" class="secondary">Back</button>
    </div>
  `;

  document.getElementById("doneBtn").onclick = () => {
    unlockAudioOnce();
    playClack();
    if (!state.completed.includes(action.id)) state.completed.push(action.id);
    save();

    if (roomCleared(room)) renderReward(room);
    else advance();
  };

  document.getElementById("backBtn").onclick = () => renderDirection();
}

function renderReward(room){
  const roll = state.lastRoll ?? 1;
  const tier = rewardTierFromRoll(roll);
  const reward = ROOMS[room]?.rewards?.[tier] ?? { title: "Reward", text: "A reward is granted." };

  ui.innerHTML = `
    <h2>${escapeHtml(reward.title)}</h2>
    <p class="muted">Room cleared:</p>
    <p class="room">${escapeHtml(room)}</p>
    <p>${escapeHtml(reward.text)}</p>
    <div class="row">
      <button id="contBtn">Continue</button>
    </div>
  `;

  document.getElementById("contBtn").onclick = () => {
    unlockAudioOnce();
    playClack();
    advance();
  };
}

function advance(){
  state.stepIndex += 1;
  state.lastRoll = null;
  save();
  renderHome();
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* Boot */
renderHome();
