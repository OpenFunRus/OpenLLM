// blocks.js — определения блоков
import * as THREE from "three";

export const BLOCKS = {
  grass: { id: 0, name: "Grass", color: hexToRGB(0x6bbf3a), transparent: false, swatch: "linear-gradient(#6bbf3a 45%, #8a6b43)" },
  dirt: { id: 1, name: "Dirt", color: hexToRGB(0x8a6b43), transparent: false, swatch: "#8a6b43" },
  stone: { id: 2, name: "Stone", color: hexToRGB(0x8c8c8c), transparent: false, swatch: "#8c8c8c" },
  wood: { id: 3, name: "Wood", color: hexToRGB(0x6b4f2a), transparent: false, swatch: "linear-gradient(90deg,#7a5a2e,#5a4020)" },
  leaves: { id: 4, name: "Leaves", color: hexToRGB(0x3e8f2e), transparent: false, swatch: "#3e8f2e" },
  sand: { id: 5, name: "Sand", color: hexToRGB(0xdbd097), transparent: false, swatch: "#dbd097" },
  water: { id: 6, name: "Water", color: hexToRGB(0x2f6fd8), transparent: true, swatch: "rgba(47,111,216,0.6)" },
  brick: { id: 7, name: "Brick", color: hexToRGB(0x9c4a3a), transparent: false, swatch: "#9c4a3a" },
  plank: { id: 8, name: "Plank", color: hexToRGB(0xb8955f), transparent: false, swatch: "linear-gradient(#c8a570,#a88450)" },
};

// индекс по id
export const BLOCK_BY_ID = {};
for (const k in BLOCKS) BLOCK_BY_ID[BLOCKS[k].id] = BLOCKS[k];

// порядок в хотбаре
export const HOTBAR = [
  BLOCKS.grass,
  BLOCKS.dirt,
  BLOCKS.stone,
  BLOCKS.wood,
  BLOCKS.leaves,
  BLOCKS.sand,
  BLOCKS.water,
  BLOCKS.brick,
  BLOCKS.plank,
];

function hexToRGB(hex) {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}
