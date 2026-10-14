import * as THREE from 'three';
import {
  concreteTexture,
  woodTexture,
  cardboardTexture,
  stripesTexture,
  sacksTexture,
  bricksTexture,
  drinksTexture,
  tilesTexture,
  crateTexture,
  steelTexture,
  asphaltTexture,
} from './textures.ts';

/** Materiales compartidos (se crean una sola vez). */
let mats: ReturnType<typeof create> | null = null;

function std(color: number | string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function create() {
  return {
    concrete: (() => {
      const m = std(0xffffff, 0.92, 0, { map: concreteTexture() });
      return m;
    })(),
    asphalt: std(0xffffff, 0.95, 0, { map: asphaltTexture() }),
    wood: std(0xffffff, 0.85, 0, { map: woodTexture() }),
    woodDark: std(0x9a7449, 0.9),
    cardboard: std(0xffffff, 0.85, 0, { map: cardboardTexture() }),
    stripes: std(0xffffff, 0.6, 0, { map: stripesTexture() }),
    sacks: std(0xffffff, 0.95, 0, { map: sacksTexture() }),
    bricks: std(0xffffff, 0.9, 0, { map: bricksTexture() }),
    drinks: std(0xffffff, 0.5, 0, { map: drinksTexture() }),
    tiles: std(0xffffff, 0.8, 0, { map: tilesTexture() }),
    crate: std(0xffffff, 0.85, 0, { map: crateTexture() }),
    steel: std(0xffffff, 0.35, 0.8, { map: steelTexture() }),
    wrap: new THREE.MeshStandardMaterial({ color: 0xe8f0f6, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }),
    rubber: std(0x1a1a1a, 0.9),
    rubberWhite: std(0xd8d8d0, 0.85),
    darkMetal: std(0x2b2d30, 0.55, 0.6),
    mastMetal: std(0x34373b, 0.5, 0.55),
    chrome: std(0xd9dde2, 0.18, 1.0),
    black: std(0x101010, 0.7),
    seat: std(0x1e1e1e, 0.85),
    glassRed: std(0xff2a1a, 0.3, 0, { emissive: 0x550000 }),
    glassOrange: std(0xff9a1a, 0.3, 0, { emissive: 0x552a00 }),
    glassWhite: std(0xfffbe8, 0.2, 0, { emissive: 0x333322 }),
    rackOrange: std(0xe0601a, 0.55, 0.25),
    rackBlue: std(0x1f4f9a, 0.55, 0.3),
    rackDeck: std(0x9aa0a6, 0.5, 0.6),
    wall: std(0xd5d8d2, 0.95),
    wallLower: std(0x5f6b73, 0.9),
    roof: std(0x8b9196, 0.9, 0.2, { side: THREE.FrontSide }),
    lineYellow: std(0xf2c200, 0.7),
    lineWhite: std(0xf2f2f2, 0.7),
    lineGreen: std(0x2e9b4e, 0.7),
    lineRed: std(0xd62a2a, 0.7),
    lineBlue: std(0x2b6cd6, 0.7),
    cone: std(0xff5a12, 0.6),
    truckCab: std(0xe8eef3, 0.45, 0.2),
    truckBlue: std(0x1d4f8f, 0.45, 0.25),
    truckRed: std(0xb3261e, 0.45, 0.25),
    truckBed: std(0x6b5440, 0.9),
    chassisDark: std(0x2a2a2a, 0.6, 0.4),
    hiVis: std(0xd7ff2a, 0.6, 0, { emissive: 0x1a2200 }),
    skin: std(0xc9956b, 0.8),
    jeans: std(0x2c3e66, 0.9),
    helmet: std(0xf6d10a, 0.4),
    grass: std(0x4d7a35, 1),
    highlight: new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.35, depthTest: false }),
  };
}

export function materials() {
  if (!mats) mats = create();
  return mats;
}

export function paint(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.15 });
}
