// main.js — сцена, рендер, освещение, управление (pointer lock), UI, игровой цикл
import * as THREE from "three";
import { World } from "./world.js";
import { Player } from "./player.js";
import { HOTBAR } from "./blocks.js";

// ===== Сцена =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ecfef);
scene.fog = new THREE.Fog(0x9ecfef, 20, 90);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ===== Свет =====
const hemi = new THREE.HemisphereLight(0xbfdfff, 0x4a6b2a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
sun.position.set(30, 60, 20);
scene.add(sun);

const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

// ===== Мир =====
const world = new World(scene);
const loading = document.getElementById("loading");

// генерация мира (синхронно, чтобы точка спавна была готова)
world.generate();
loading.classList.add("hidden");

// ===== Игрок =====
const player = new Player(camera, world, world.spawn);

// ===== UI: хотбар =====
const hotbarEl = document.getElementById("hotbar");
const previewEl = document.getElementById("block-preview");
const slots = [];

function buildHotbar() {
  HOTBAR.forEach((block, i) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (i === 0 ? " selected" : "");
    slot.innerHTML =
      `<div class="key">${i + 1}</div>` +
      `<div class="swatch" style="background:${block.swatch}"></div>` +
      `<div class="name">${block.name}</div>`;
    slot.addEventListener("click", () => selectSlot(i));
    hotbarEl.appendChild(slot);
    slots.push(slot);
  });
  updatePreview();
}

function selectSlot(i) {
  player.selectedBlock = HOTBAR[i].id;
  slots.forEach((s, j) => s.classList.toggle("selected", j === i));
  updatePreview();
}

function updatePreview() {
  const block = HOTBAR.find((b) => b.id === player.selectedBlock) || HOTBAR[0];
  previewEl.innerHTML = `<div class="swatch" style="background:${block.swatch}"></div>`;
}
buildHotbar();

// ===== Pointer lock + ввод =====
const overlay = document.getElementById("overlay");
let locked = false;

overlay.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle("hidden", locked);
  overlay.querySelector("p").textContent = locked
    ? ""
    : "Кликни, чтобы играть";
});

// клавиши
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyF") {
    player.toggleFly();
    return;
  }
  // выбор блока 1-9
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    selectSlot(num - 1);
  }
  if (e.code === "Space") e.preventDefault();
  player.keys[e.code] = true;
});
document.addEventListener("keyup", (e) => {
  player.keys[e.code] = false;
});

// мышь — обзор
document.addEventListener("mousemove", (e) => {
  if (!locked) return;
  player.onLookMove(e.movementX, e.movementY);
});

// мышь — блоки
document.addEventListener("mousedown", (e) => {
  if (!locked) return;
  if (e.button === 0) player.breakBlock();
  else if (e.button === 2) player.placeBlock(player.selectedBlock);
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

// колесо — переключение блока
document.addEventListener("wheel", (e) => {
  if (!locked) return;
  let i = HOTBAR.findIndex((b) => b.id === player.selectedBlock);
  i = (i + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
  selectSlot(i);
});

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== FPS =====
const fpsEl = document.getElementById("fps");
let frames = 0;
let fpsTime = 0;

// ===== Игровой цикл =====
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  if (locked) {
    player.update(dt);
  }

  world.rebuildDirty();

  renderer.render(scene, camera);

  // FPS
  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = "FPS: " + Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
}
animate();
