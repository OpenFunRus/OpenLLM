// world.js — генерация ландшафта и построение чанк-геометрии (видимые грани, шейдинг гранями)
import * as THREE from "three";
import { BLOCKS, BLOCK_BY_ID } from "./blocks.js";

export const CHUNK = 16;
export const WORLD_CHUNKS = 6; // 6x6 чанков
export const HEIGHT = 48;
export const WATER_LEVEL = 10;

// ===== Шумовое поле (value noise, детерминированное) =====
function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  const u = smooth(xf);
  const v = smooth(zf);
  return (
    a * (1 - u) * (1 - v) +
    b * u * (1 - v) +
    c * (1 - u) * v +
    d * u * v
  );
}

function heightAt(x, z) {
  const n =
    valueNoise(x * 0.05, z * 0.05) * 0.65 +
    valueNoise(x * 0.015 + 100, z * 0.015 + 100) * 0.5;
  const hills = valueNoise(x * 0.008 + 300, z * 0.008 + 300) * 10;
  return Math.max(2, Math.floor(6 + n * 18 + hills));
}

// ===== Описание граней =====
// Для каждого направления: 4 вершины [x,y,z] + normal + shading coefficient
const FACES = [
  { // +x (right)
    dir: [1, 0, 0],
    shade: 0.8,
    verts: [[1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 0, 1]],
  },
  { // -x (left)
    dir: [-1, 0, 0],
    shade: 0.8,
    verts: [[0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0]],
  },
  { // +y (top)
    dir: [0, 1, 0],
    shade: 1.0,
    verts: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]],
  },
  { // -y (bottom)
    dir: [0, -1, 0],
    shade: 0.5,
    verts: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  },
  { // +z (front)
    dir: [0, 0, 1],
    shade: 0.9,
    verts: [[0, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 1]],
  },
  { // -z (back)
    dir: [0, 0, -1],
    shade: 0.6,
    verts: [[1, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0]],
  },
];

// порядок индексов для двух треугольников из 4 вершин: 0,1,2 / 2,1,3
const FACE_INDEX = [0, 1, 2, 2, 1, 3];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // "cx,cz" -> chunk
    this.materials = this.buildMaterials();
    this.spawn = new THREE.Vector3(
      (WORLD_CHUNKS * CHUNK) / 2,
      20,
      (WORLD_CHUNKS * CHUNK) / 2
    );
    // декорации (деревья) — храним отдельно как блоки в чанках
  }

  // Два материала: непрозрачный (без alpha) и прозрачный (вода)
  buildMaterials() {
    return {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      transparent: new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
  }

  key(cx, cz) {
    return cx + "," + cz;
  }

  generate() {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
        this.createChunk(cx, cz);
      }
    }
    // деревья на границе чанков — генерируем после всех чанков
    this.generateTrees();
    // перестроить все
    this.rebuildDirty();

    this.findSpawn();
  }

  // Ищем точку спавна на суше (не в воде)
  findSpawn() {
    const cx = Math.floor((WORLD_CHUNKS * CHUNK) / 2);
    const cz = Math.floor((WORLD_CHUNKS * CHUNK) / 2);
    for (let r = 0; r < CHUNK * 2; r += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          const x = cx + dx;
          const z = cz + dz;
          const h = heightAt(x, z);
          if (h > WATER_LEVEL + 1) {
            this.spawn.x = x + 0.5;
            this.spawn.z = z + 0.5;
            this.spawn.y = h + 2;
            return;
          }
        }
      }
    }
    // fallback: центр
    this.spawn.y = this.getSpawnHeight() + 3;
  }

  generateTrees() {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
        const x0 = cx * CHUNK;
        const z0 = cz * CHUNK;
        for (let lx = 2; lx < CHUNK - 2; lx++) {
          for (let lz = 2; lz < CHUNK - 2; lz++) {
            const wx = x0 + lx;
            const wz = z0 + lz;
            const h = heightAt(wx, wz);
            // только на траве, не в воде
            if (h < WATER_LEVEL + 2) continue;
            const r = hash2(wx * 7 + 11, wz * 13 + 23);
            if (r < 0.045) {
              this.addTree(wx, h, wz);
            }
          }
        }
      }
    }
  }

  addTree(x, groundY, z) {
    const trunkH = 4 + Math.floor(hash2(x, z) * 2);
    for (let y = 1; y <= trunkH; y++) {
      this.setBlockRaw(x, groundY + y, z, BLOCKS.wood.id);
    }
    // крона
    const cy = groundY + trunkH;
    for (let dy = 0; dy <= 2; dy++) {
      const radius = dy === 2 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy < 2) continue;
          // округлая крона
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy !== 0) continue;
          this.setBlockRaw(x + dx, cy + dy, z + dz, BLOCKS.leaves.id);
        }
      }
    }
    this.setBlockRaw(x, cy + 2, z, BLOCKS.leaves.id);
  }

  createChunk(cx, cz) {
    const k = this.key(cx, cz);
    const blocks = new Map();

    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = heightAt(wx, wz);
        const isWater = h < WATER_LEVEL;
        const topBlock = isWater
          ? BLOCKS.sand.id
          : h < WATER_LEVEL + 2
            ? BLOCKS.sand.id
            : BLOCKS.grass.id;

        for (let y = 0; y <= h; y++) {
          let block;
          if (y === 0) block = BLOCKS.stone.id;
          else if (y === h) block = topBlock;
          else if (y < h - 3) block = BLOCKS.stone.id;
          else block = BLOCKS.dirt.id;
          blocks.set(wx + "," + y + "," + wz, block);
        }
        // вода над дном
        if (isWater) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            blocks.set(wx + "," + y + "," + wz, BLOCKS.water.id);
          }
        }
      }
    }

    const chunk = {
      cx,
      cz,
      blocks,
      dirty: true,
      opaqueMesh: null,
      transparentMesh: null,
    };
    this.chunks.set(k, chunk);
    return chunk;
  }

  // Установка блока без маркеров dirty (для генерации)
  setBlockRaw(x, y, z, blockId) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return;
    const key = x + "," + y + "," + z;
    if (blockId < 0) chunk.blocks.delete(key);
    else chunk.blocks.set(key, blockId);
    chunk.dirty = true;
  }

  getBlock(x, y, z) {
    if (y < 0) return BLOCKS.stone.id; // невидимая стена снизу
    if (y >= HEIGHT) return -2; // воздух
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return -2;
    const v = chunk.blocks.get(x + "," + y + "," + z);
    return v == null ? -2 : v;
  }

  // Твердый для физики (вода не твёрдая)
  isSolid(x, y, z) {
    const b = this.getBlock(x, y, z);
    if (b < 0) return b === BLOCKS.stone.id;
    return b !== BLOCKS.water.id;
  }

  isOpaque(x, y, z) {
    const b = this.getBlock(x, y, z);
    if (b < 0) return b === BLOCKS.stone.id;
    const blk = BLOCK_BY_ID[b];
    return blk && !blk.transparent;
  }

  // Установка/удаление блока (из игрока)
  setBlock(x, y, z, blockId) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return;
    const key = x + "," + y + "," + z;
    if (blockId < 0) chunk.blocks.delete(key);
    else chunk.blocks.set(key, blockId);

    chunk.dirty = true;
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  rebuildDirty() {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.buildChunkMesh(chunk);
        chunk.dirty = false;
      }
    }
  }

  buildChunkMesh(chunk) {
    // убираем старые меши
    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (chunk.transparentMesh) {
      this.scene.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
      chunk.transparentMesh = null;
    }

    const opaque = this.createGeoData();
    const transparent = this.createGeoData();

    const addFace = (data, bx, by, bz, face, color) => {
      const base = data.positions.length / 3;
      for (let i = 0; i < 4; i++) {
        const v = face.verts[i];
        data.positions.push(bx + v[0], by + v[1], bz + v[2]);
        data.normals.push(face.dir[0], face.dir[1], face.dir[2]);
        const s = face.shade;
        data.colors.push(color[0] * s, color[1] * s, color[2] * s);
      }
      for (const idx of FACE_INDEX) data.indices.push(base + idx);
    };

    for (const key of chunk.blocks.keys()) {
      const [x, y, z] = key.split(",").map(Number);
      const blockId = chunk.blocks.get(key);
      const blk = BLOCK_BY_ID[blockId];
      if (!blk) continue;
      const color = blk.color;
      const isWater = blk.transparent;
      const data = isWater ? transparent : opaque;

      for (const face of FACES) {
        const nx = x + face.dir[0];
        const ny = y + face.dir[1];
        const nz = z + face.dir[2];
        const nb = this.getBlock(nx, ny, nz);

        // непрозрачный блок: грань рисуем, если сосед не непрозрачный
        // вода: грань рисуем, если сосед не вода и не непрозрачный
        if (!isWater) {
          if (this.isOpaque(nx, ny, nz)) continue;
        } else {
          // между двумя водами не рисуем
          if (nb === BLOCKS.water.id) continue;
          // над непрозрачным не рисуем
          if (this.isOpaque(nx, ny, nz)) continue;
        }
        addFace(data, x, y, z, face, color);
      }
    }

    if (opaque.indices.length > 0) {
      chunk.opaqueMesh = this.makeMesh(opaque, this.materials.opaque);
      this.scene.add(chunk.opaqueMesh);
    }
    if (transparent.indices.length > 0) {
      chunk.transparentMesh = this.makeMesh(
        transparent,
        this.materials.transparent
      );
      this.scene.add(chunk.transparentMesh);
    }
  }

  createGeoData() {
    return { positions: [], normals: [], colors: [], indices: [] };
  }

  makeMesh(data, material) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.positions, 3)
    );
    geom.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(data.normals, 3)
    );
    geom.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
    geom.setIndex(data.indices);
    return new THREE.Mesh(geom, material);
  }

  getSpawnHeight() {
    const x = Math.floor(this.spawn.x);
    const z = Math.floor(this.spawn.z);
    return heightAt(x, z);
  }
}
