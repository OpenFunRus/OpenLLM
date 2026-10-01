// player.js — первый человек: физика, коллизии, управление, взаимодействие с блоками
import * as THREE from "three";

const GRAVITY = 28;
const MOVE_SPEED = 6.0;
const FLY_SPEED = 10.0;
const JUMP_SPEED = 9.0;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.62;
const REACH = 6;

export class Player {
  constructor(camera, world, spawn) {
    this.camera = camera;
    this.world = world;

    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.flying = false;
    this.onGround = false;

    this.keys = {};
    this.selectedBlock = 0;

    camera.position.copy(this.position).add(new THREE.Vector3(0, EYE_HEIGHT, 0));
  }

  // коллизия: проверяем, твёрдый ли блок в клетке
  collides(px, py, pz) {
    const minX = Math.floor(px - PLAYER_RADIUS);
    const maxX = Math.floor(px + PLAYER_RADIUS);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_HEIGHT);
    const minZ = Math.floor(pz - PLAYER_RADIUS);
    const maxZ = Math.floor(pz + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);

    // направление движения по yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    if (this.keys["KeyW"]) move.add(forward);
    if (this.keys["KeyS"]) move.sub(forward);
    if (this.keys["KeyD"]) move.add(right);
    if (this.keys["KeyA"]) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();

    if (this.flying) {
      this.velocity.x = move.x * FLY_SPEED;
      this.velocity.z = move.z * FLY_SPEED;
      if (this.keys["Space"]) this.velocity.y = FLY_SPEED;
      else if (this.keys["ShiftLeft"] || this.keys["ShiftRight"])
        this.velocity.y = -FLY_SPEED;
      else this.velocity.y = 0;
    } else {
      this.velocity.x = move.x * MOVE_SPEED;
      this.velocity.z = move.z * MOVE_SPEED;
      this.velocity.y -= GRAVITY * dt;
      if (this.keys["Space"] && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    this.moveWithCollision(dt);

    // камера
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // защита: упал в пустоту
    if (this.position.y < -20) {
      this.position.set(
        this.world.spawn.x,
        this.world.spawn.y,
        this.world.spawn.z
      );
      this.velocity.set(0, 0, 0);
    }
  }

  moveWithCollision(dt) {
    // по осям, с откатом
    // X
    let nx = this.position.x + this.velocity.x * dt;
    if (!this.collides(nx, this.position.y, this.position.z)) {
      this.position.x = nx;
    } else {
      this.velocity.x = 0;
    }
    // Z
    let nz = this.position.z + this.velocity.z * dt;
    if (!this.collides(this.position.x, this.position.y, nz)) {
      this.position.z = nz;
    } else {
      this.velocity.z = 0;
    }
    // Y
    let ny = this.position.y + this.velocity.y * dt;
    if (!this.collides(this.position.x, ny, this.position.z)) {
      this.position.y = ny;
      this.onGround = false;
    } else {
      if (this.velocity.y < 0) {
        // приземление: прижимаем ноги к верхней грани блока
        const floorY = Math.floor(ny);
        this.position.y = floorY + 1;
        this.onGround = true;
      } else {
        // удар головой
        const ceilY = Math.floor(ny + PLAYER_HEIGHT);
        this.position.y = ceilY - PLAYER_HEIGHT;
      }
      this.velocity.y = 0;
    }
  }

  onLookMove(dx, dy) {
    const sens = 0.0022;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  // Raycast в сторону взгляда (алгоритм voxel DDA)
  raycast() {
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));

    let tMaxX =
      dir.x > 0
        ? (x + 1 - origin.x) * tDeltaX
        : (origin.x - x) * tDeltaX;
    let tMaxY =
      dir.y > 0
        ? (y + 1 - origin.y) * tDeltaY
        : (origin.y - y) * tDeltaY;
    let tMaxZ =
      dir.z > 0
        ? (z + 1 - origin.z) * tDeltaZ
        : (origin.z - z) * tDeltaZ;

    let face = [0, 0, 0];
    let t = 0;

    for (let i = 0; i < 100; i++) {
      if (t > REACH) break;
      const b = this.world.getBlock(x, y, z);
      // игнорируем воду (id 6) — проходим сквозь
      if (b >= 0 && b !== 6) {
        return { hit: { x, y, z, blockId: b }, place: face };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        face = [0, -stepY, 0];
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        face = [0, 0, -stepZ];
      }
    }
    return null;
  }

  // сломать блок перед взглядом
  breakBlock() {
    const hit = this.raycast();
    if (hit) {
      this.world.setBlock(hit.hit.x, hit.hit.y, hit.hit.z, -1);
    }
  }

  // поставить блок
  placeBlock(blockId) {
    const hit = this.raycast();
    if (!hit) return;
    const px = hit.hit.x + hit.place[0];
    const py = hit.hit.y + hit.place[1];
    const pz = hit.hit.z + hit.place[2];
    // не ставим блок внутрь себя
    const pMinX = Math.floor(this.position.x - PLAYER_RADIUS);
    const pMaxX = Math.floor(this.position.x + PLAYER_RADIUS);
    const pMinY = Math.floor(this.position.y);
    const pMaxY = Math.floor(this.position.y + PLAYER_HEIGHT);
    const pMinZ = Math.floor(this.position.z - PLAYER_RADIUS);
    const pMaxZ = Math.floor(this.position.z + PLAYER_RADIUS);
    if (
      px >= pMinX && px <= pMaxX &&
      py >= pMinY && py <= pMaxY &&
      pz >= pMinZ && pz <= pMaxZ
    ) {
      return;
    }
    this.world.setBlock(px, py, pz, blockId);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.velocity.y = 0;
  }
}
