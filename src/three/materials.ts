import * as THREE from 'three';
import { PieceColor, PieceSymbol } from '../types/chess';
import { LoadedArenaTextures, loadArenaAssetTextures } from './assetTextures';

export interface MaterialPalette {
  lightSquare: THREE.MeshPhysicalMaterial;
  darkSquare: THREE.MeshPhysicalMaterial;
  boardFrame: THREE.MeshStandardMaterial;
  mossAccent: THREE.MeshStandardMaterial;
  stoneArena: THREE.MeshStandardMaterial;
  stoneColumn: THREE.MeshStandardMaterial;
  stoneRuins: THREE.MeshStandardMaterial;
  backdropMat: THREE.MeshBasicMaterial;
  pedestalWhite: THREE.MeshStandardMaterial;
  pedestalBlack: THREE.MeshStandardMaterial;
  whiteArmor: THREE.MeshPhysicalMaterial;
  whiteBronze: THREE.MeshPhysicalMaterial;
  whiteTrim: THREE.MeshPhysicalMaterial;
  whiteCloth: THREE.MeshStandardMaterial;
  whiteCrystal: THREE.MeshStandardMaterial;
  whiteSkin: THREE.MeshStandardMaterial;
  whiteHorse: THREE.MeshPhysicalMaterial;
  whiteScutum: THREE.MeshStandardMaterial;
  whiteBanner: THREE.MeshStandardMaterial;
  blackArmor: THREE.MeshPhysicalMaterial;
  blackBronze: THREE.MeshPhysicalMaterial;
  blackTrim: THREE.MeshPhysicalMaterial;
  blackCloth: THREE.MeshStandardMaterial;
  blackCrystal: THREE.MeshStandardMaterial;
  blackSkin: THREE.MeshStandardMaterial;
  blackHorse: THREE.MeshPhysicalMaterial;
  blackScutum: THREE.MeshStandardMaterial;
  blackBanner: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  parchment: THREE.MeshStandardMaterial;
  bladeSteel: THREE.MeshPhysicalMaterial;
  bladeDark: THREE.MeshPhysicalMaterial;
  goldSpearGlow: THREE.MeshStandardMaterial;
  brazierIron: THREE.MeshStandardMaterial;
  kingWhiteGold: THREE.MeshPhysicalMaterial;
  kingWhiteBronze: THREE.MeshPhysicalMaterial;
  kingWhiteCloth: THREE.MeshStandardMaterial;
  kingWhiteSkin: THREE.MeshStandardMaterial;
  kingWhiteGem: THREE.MeshStandardMaterial;
  kingBlackArmor: THREE.MeshPhysicalMaterial;
  kingBlackTrim: THREE.MeshPhysicalMaterial;
  kingBlackCloth: THREE.MeshStandardMaterial;
  kingBlackSkin: THREE.MeshStandardMaterial;
  kingBlackGem: THREE.MeshStandardMaterial;
  kingLeather: THREE.MeshStandardMaterial;
  smokeTex: THREE.CanvasTexture;
  emberTex: THREE.CanvasTexture;
  fireSpriteTex: THREE.CanvasTexture;
  assetTextures: LoadedArenaTextures;
  getEmblemMaterial: (color: PieceColor, type: PieceSymbol) => THREE.MeshStandardMaterial;
  dispose: () => void;
}

function makeMicroNoiseBump(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;
  let seed = 1337;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 24) & 0xff) * 0.35 + 108;
    d[i] = n;
    d[i + 1] = n;
    d[i + 2] = n;
    d[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeTravertineBorderMaps(size = 512): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bCtx = b.getContext('2d')!;

  ctx.fillStyle = '#B8AA93';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#8A8A8A';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const x = (i * 137) % size;
    const y = (i * 73) % size;
    const w = 3 + (i % 12);
    const h = 1 + (i % 3);
    ctx.fillStyle = i % 3 === 0 ? '#8B7D68' : '#D5C7B0';
    ctx.globalAlpha = 0.26;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = i % 3 === 0 ? '#4A4A4A' : '#B8B8B8';
    bCtx.globalAlpha = 0.42;
    bCtx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;

  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = '#5F5342';
    ctx.globalAlpha = 0.44;
    ctx.lineWidth = 2;
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = 3;
    ctx.beginPath();
    bCtx.beginPath();
    let x = (i * 67) % size;
    let y = 0;
    ctx.moveTo(x, y);
    bCtx.moveTo(x, y);
    for (let s = 1; s <= 5; s++) {
      x += Math.sin(i * 2.1 + s) * 18;
      y = (s / 5) * size;
      ctx.lineTo(x, y);
      bCtx.lineTo(x, y);
    }
    ctx.stroke();
    bCtx.stroke();
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 1);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 1);
  return { map, bumpMap };
}

function makeAshlarMasonryMaps(size = 512): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bCtx = b.getContext('2d')!;

  ctx.fillStyle = '#3C3630';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#242424';
  bCtx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const bh = size / rows;
  const bw = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + offset;
      const y = r * bh;
      const tone = 92 + ((r * 19 + col * 37) % 34);
      ctx.fillStyle = `rgb(${tone + 12}, ${tone + 5}, ${tone - 8})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);

      bCtx.fillStyle = `rgb(${tone + 55}, ${tone + 55}, ${tone + 55})`;
      bCtx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
    }
  }

  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#24201B' : '#968B7A';
    ctx.globalAlpha = 0.14;
    ctx.fillRect((i * 173) % size, (i * 97) % size, 3, 2);
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  return { map, bumpMap };
}

function makeFlutedColumnMaps(size = 512): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bCtx = b.getContext('2d')!;

  const flutes = 24;
  for (let x = 0; x < size; x++) {
    const u = (x / size) * flutes * Math.PI * 2;
    const groove = Math.cos(u);
    const shade = Math.round(166 + groove * 28);
    ctx.fillStyle = `rgb(${shade + 6}, ${shade}, ${shade - 10})`;
    ctx.fillRect(x, 0, 1, size);

    const bump = Math.round(135 + groove * 92);
    bCtx.fillStyle = `rgb(${bump}, ${bump}, ${bump})`;
    bCtx.fillRect(x, 0, 1, size);
  }

  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#5E5346' : '#E2D6C1';
    ctx.globalAlpha = 0.1;
    ctx.fillRect((i * 127) % size, (i * 89) % size, 2, 4);
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 2);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1, 2);
  return { map, bumpMap };
}

function makeRomanCourtyardMaps(size = 512): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bCtx = b.getContext('2d')!;

  ctx.fillStyle = '#332C25';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#6A6A6A';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3200; i++) {
    const x = (i * 151) % size;
    const y = (i * 97) % size;
    const r = 1 + (i % 5);
    ctx.fillStyle = i % 3 === 0 ? '#241F1A' : i % 3 === 1 ? '#4B4137' : '#5E5245';
    ctx.globalAlpha = 0.24;
    ctx.fillRect(x, y, r, r);

    bCtx.fillStyle = i % 2 === 0 ? '#444444' : '#969696';
    bCtx.globalAlpha = 0.34;
    bCtx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 16);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(16, 16);
  return { map, bumpMap };
}

function makeClothFoldsBump(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  for (let i = 0; i <= 12; i++) {
    const lum = i % 2 === 0 ? 185 : 85;
    grad.addColorStop(i / 12, `rgb(${lum},${lum},${lum})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < size; y += 3) {
    ctx.fillRect(0, y, size, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWarriorFaceTexture(skinHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle cheekbone and brow shading for realistic Roman portraits
  const cheekGrad = ctx.createRadialGradient(128, 128, 22, 128, 128, 130);
  cheekGrad.addColorStop(0, 'rgba(255, 225, 198, 0.22)');
  cheekGrad.addColorStop(1, 'rgba(42, 24, 16, 0.26)');
  ctx.fillStyle = cheekGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Brow shadows & eyes
  ctx.fillStyle = '#3B2518';
  ctx.fillRect(72, 102, 36, 7);
  ctx.fillRect(148, 102, 36, 7);

  ctx.fillStyle = '#F2EFE9';
  ctx.beginPath();
  ctx.ellipse(90, 118, 12, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(166, 118, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2A1D17';
  ctx.beginPath();
  ctx.arc(90, 118, 5, 0, Math.PI * 2);
  ctx.arc(166, 118, 5, 0, Math.PI * 2);
  ctx.fill();

  // Nose bridge highlight & shadow
  ctx.fillStyle = 'rgba(255, 232, 208, 0.25)';
  ctx.fillRect(124, 106, 8, 42);

  // Firm mouth
  ctx.strokeStyle = '#6B3D30';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(106, 174);
  ctx.quadraticCurveTo(128, 170, 150, 174);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSculptedSkinTexture(skinHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle subsurface warmth and skin grain (no painted 2D eyes, since King V2 uses 3D sculpted eyes & brows)
  const warmGrad = ctx.createRadialGradient(128, 120, 18, 128, 128, 136);
  warmGrad.addColorStop(0, 'rgba(255, 218, 190, 0.18)');
  warmGrad.addColorStop(0.65, 'rgba(180, 118, 86, 0.08)');
  warmGrad.addColorStop(1, 'rgba(58, 32, 22, 0.24)');
  ctx.fillStyle = warmGrad;
  ctx.fillRect(0, 0, 256, 256);

  let seed = 4242;
  for (let i = 0; i < 1200; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 256;
    const y = (seed >>> 8) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,225,205,0.06)' : 'rgba(65,36,24,0.06)';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSoftParticleTexture(colorCenter: string, colorEdge: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, colorCenter);
  grad.addColorStop(0.45, colorEdge);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFireSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 192);

  // Outer warm orange flame aura
  const outer = ctx.createRadialGradient(64, 134, 8, 64, 108, 78);
  outer.addColorStop(0, 'rgba(255, 235, 160, 0.95)');
  outer.addColorStop(0.32, 'rgba(255, 145, 36, 0.85)');
  outer.addColorStop(0.68, 'rgba(235, 62, 10, 0.36)');
  outer.addColorStop(1, 'rgba(180, 20, 0, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(64, 10);
  ctx.bezierCurveTo(108, 72, 118, 152, 64, 182);
  ctx.bezierCurveTo(10, 152, 20, 72, 64, 10);
  ctx.fill();

  // Bright core tongue
  const core = ctx.createRadialGradient(64, 144, 4, 64, 128, 42);
  core.addColorStop(0, 'rgba(255, 255, 235, 1)');
  core.addColorStop(0.55, 'rgba(255, 205, 80, 0.85)');
  core.addColorStop(1, 'rgba(255, 120, 20, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(64, 132, 24, 48, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialPalette(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  onFatalAssetError: (err: Error) => void
): MaterialPalette {
  const assetTextures = loadArenaAssetTextures(maxAnisotropy, onFatalAssetError);

  const microNoiseBump = makeMicroNoiseBump();
  const travertine = makeTravertineBorderMaps();
  const masonry = makeAshlarMasonryMaps();
  const fluted = makeFlutedColumnMaps();
  const courtyard = makeRomanCourtyardMaps();
  const clothBump = makeClothFoldsBump();
  const whiteFaceTex = makeWarriorFaceTexture('#DFB48E');
  const blackFaceTex = makeWarriorFaceTexture('#C79B78');
  const kingWhiteSkinTex = makeSculptedSkinTexture('#DDA984');
  const kingBlackSkinTex = makeSculptedSkinTexture('#C79572');
  const smokeTex = makeSoftParticleTexture('rgba(205, 212, 224, 0.45)', 'rgba(145, 155, 175, 0.14)');
  const emberTex = makeSoftParticleTexture('rgba(255, 244, 190, 1)', 'rgba(255, 125, 25, 0.55)');
  const fireSpriteTex = makeFireSpriteTexture();

  [
    microNoiseBump,
    travertine.map,
    travertine.bumpMap,
    masonry.map,
    masonry.bumpMap,
    fluted.map,
    fluted.bumpMap,
    courtyard.map,
    courtyard.bumpMap,
  ].forEach((t) => {
    t.anisotropy = maxAnisotropy;
  });

  const extraTextures: THREE.Texture[] = [
    microNoiseBump,
    travertine.map,
    travertine.bumpMap,
    masonry.map,
    masonry.bumpMap,
    fluted.map,
    fluted.bumpMap,
    courtyard.map,
    courtyard.bumpMap,
    clothBump,
    whiteFaceTex,
    blackFaceTex,
    kingWhiteSkinTex,
    kingBlackSkinTex,
    smokeTex,
    emberTex,
    fireSpriteTex,
  ];

  // Stage 2 Board Tiles using REAL Image 2 (light Carrara marble) & Image 3 (dark obsidian)
  const lightSquare = new THREE.MeshPhysicalMaterial({
    map: assetTextures.lightMarbleTex,
    bumpMap: microNoiseBump,
    bumpScale: 0.008,
    roughness: 0.25,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.24,
  });

  const darkSquare = new THREE.MeshPhysicalMaterial({
    map: assetTextures.darkObsidianTex,
    bumpMap: microNoiseBump,
    bumpScale: 0.007,
    roughness: 0.08,
    metalness: 0.12,
    clearcoat: 0.6,
    clearcoatRoughness: 0.09,
  });

  const boardFrame = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.036,
    roughness: 0.74,
    metalness: 0.06,
  });

  const mossAccent = new THREE.MeshStandardMaterial({
    color: 0x3b5229,
    roughness: 0.94,
    metalness: 0.02,
  });

  const stoneArena = new THREE.MeshStandardMaterial({
    map: courtyard.map,
    bumpMap: courtyard.bumpMap,
    bumpScale: 0.045,
    roughness: 0.88,
    metalness: 0.05,
  });

  const stoneColumn = new THREE.MeshStandardMaterial({
    map: fluted.map,
    bumpMap: fluted.bumpMap,
    bumpScale: 0.048,
    roughness: 0.72,
    metalness: 0.06,
  });

  const stoneRuins = new THREE.MeshStandardMaterial({
    map: masonry.map,
    bumpMap: masonry.bumpMap,
    bumpScale: 0.055,
    roughness: 0.86,
    metalness: 0.04,
  });

  const backdropMat = new THREE.MeshBasicMaterial({
    map: assetTextures.backdropTex,
    side: THREE.DoubleSide,
    fog: false,
  });

  const pedestalWhite = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.022,
    color: 0xdfd3be,
    roughness: 0.56,
    metalness: 0.12,
  });

  const pedestalBlack = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.022,
    color: 0x45413e,
    roughness: 0.5,
    metalness: 0.24,
  });

  // Phe Ánh Sáng: Polished Roman steel/silver + warm imperial bronze-gold + crimson cloth
  const whiteArmor = new THREE.MeshPhysicalMaterial({
    color: 0xd5dce6,
    metalness: 0.92,
    roughness: 0.18,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  });

  const whiteBronze = new THREE.MeshPhysicalMaterial({
    color: 0xc29848,
    metalness: 0.9,
    roughness: 0.24,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });

  const whiteTrim = new THREE.MeshPhysicalMaterial({
    color: 0xe3b84c,
    metalness: 0.94,
    roughness: 0.16,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
  });

  const whiteCloth = new THREE.MeshStandardMaterial({
    color: 0x8d151c,
    bumpMap: clothBump,
    bumpScale: 0.024,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const whiteCrystal = new THREE.MeshStandardMaterial({
    color: 0xfff3c4,
    emissive: 0xffc646,
    emissiveIntensity: isSoftwareGl ? 1.5 : 2.9,
    roughness: 0.1,
    metalness: 0.1,
  });

  const whiteSkin = new THREE.MeshStandardMaterial({
    map: whiteFaceTex,
    roughness: 0.64,
    metalness: 0.02,
  });

  const whiteHorse = new THREE.MeshPhysicalMaterial({
    color: 0x5c3e2c, // Rich dark bay warhorse matching Image 10!
    roughness: 0.46,
    metalness: 0.08,
    clearcoat: 0.15,
    clearcoatRoughness: 0.45,
  });

  const whiteScutum = new THREE.MeshStandardMaterial({
    map: assetTextures.scutumWhiteTex,
    roughness: 0.38,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });

  const whiteBanner = new THREE.MeshStandardMaterial({
    map: assetTextures.whiteBannerTex,
    bumpMap: clothBump,
    bumpScale: 0.016,
    roughness: 0.75,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  // Phe Bóng Đêm: Gunmetal obsidian steel + brushed pewter/violet accents + royal purple cloth
  const blackArmor = new THREE.MeshPhysicalMaterial({
    color: 0x2a3140,
    metalness: 0.9,
    roughness: 0.2,
    clearcoat: 0.35,
    clearcoatRoughness: 0.18,
  });

  const blackBronze = new THREE.MeshPhysicalMaterial({
    color: 0x626b82,
    metalness: 0.9,
    roughness: 0.24,
    clearcoat: 0.3,
  });

  const blackTrim = new THREE.MeshPhysicalMaterial({
    color: 0xa288d9,
    metalness: 0.92,
    roughness: 0.18,
    clearcoat: 0.4,
  });

  const blackCloth = new THREE.MeshStandardMaterial({
    color: 0x461c6e,
    bumpMap: clothBump,
    bumpScale: 0.024,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const blackCrystal = new THREE.MeshStandardMaterial({
    color: 0xebd4ff,
    emissive: 0xb26bff,
    emissiveIntensity: isSoftwareGl ? 1.55 : 3.0,
    roughness: 0.1,
    metalness: 0.12,
  });

  const blackSkin = new THREE.MeshStandardMaterial({
    map: blackFaceTex,
    roughness: 0.64,
    metalness: 0.02,
  });

  const blackHorse = new THREE.MeshPhysicalMaterial({
    color: 0x1b1e28,
    roughness: 0.42,
    metalness: 0.14,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
  });

  const blackScutum = new THREE.MeshStandardMaterial({
    map: assetTextures.scutumBlackTex,
    roughness: 0.38,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });

  const blackBanner = new THREE.MeshStandardMaterial({
    map: assetTextures.blackBannerTex,
    bumpMap: clothBump,
    bumpScale: 0.016,
    roughness: 0.75,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const leather = new THREE.MeshStandardMaterial({
    color: 0x4d2f1e,
    roughness: 0.7,
    metalness: 0.06,
  });

  const wood = new THREE.MeshStandardMaterial({
    color: 0x4c3220,
    roughness: 0.74,
    metalness: 0.04,
  });

  const parchment = new THREE.MeshStandardMaterial({
    color: 0xdccbb0,
    roughness: 0.86,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const bladeSteel = new THREE.MeshPhysicalMaterial({
    color: 0xeef3f8,
    metalness: 0.96,
    roughness: 0.12,
    anisotropy: 0.75,
  });

  const bladeDark = new THREE.MeshPhysicalMaterial({
    color: 0x7b839c,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.25,
    metalness: 0.95,
    roughness: 0.15,
    anisotropy: 0.75,
  });

  const goldSpearGlow = new THREE.MeshStandardMaterial({
    color: 0xffe492,
    emissive: 0xf7b933,
    emissiveIntensity: isSoftwareGl ? 0.85 : 1.55,
    metalness: 0.75,
    roughness: 0.18,
  });

  const brazierIron = new THREE.MeshStandardMaterial({
    color: 0x282420,
    metalness: 0.84,
    roughness: 0.38,
  });

  // King V2 Dedicated PBR Materials (Imperial Gold Bronze & Dark Titanium)
  const kingWhiteGold = new THREE.MeshPhysicalMaterial({
    color: 0xd9ab44,
    metalness: 1.0,
    roughness: 0.28,
    bumpMap: microNoiseBump,
    bumpScale: 0.004,
    clearcoat: 0.22,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.25,
  });

  const kingWhiteBronze = new THREE.MeshPhysicalMaterial({
    color: 0x9e7730,
    metalness: 0.94,
    roughness: 0.34,
    bumpMap: microNoiseBump,
    bumpScale: 0.005,
    envMapIntensity: 1.15,
  });

  const kingWhiteCloth = new THREE.MeshStandardMaterial({
    color: 0x7d1016,
    bumpMap: clothBump,
    bumpScale: 0.028,
    roughness: 0.85,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });

  const kingWhiteSkin = new THREE.MeshStandardMaterial({
    map: kingWhiteSkinTex,
    roughness: 0.56,
    metalness: 0.02,
  });

  const kingWhiteGem = new THREE.MeshPhysicalMaterial({
    color: 0xa61224,
    emissive: 0x45060f,
    emissiveIntensity: 0.5,
    roughness: 0.14,
    metalness: 0.15,
    clearcoat: 0.9,
  });

  const kingBlackArmor = new THREE.MeshPhysicalMaterial({
    color: 0x1b1b22,
    metalness: 0.96,
    roughness: 0.3,
    bumpMap: microNoiseBump,
    bumpScale: 0.004,
    clearcoat: 0.28,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.35,
  });

  const kingBlackTrim = new THREE.MeshPhysicalMaterial({
    color: 0x6f698a,
    metalness: 0.94,
    roughness: 0.26,
    clearcoat: 0.3,
    envMapIntensity: 1.25,
  });

  const kingBlackCloth = new THREE.MeshStandardMaterial({
    color: 0x3b1470,
    bumpMap: clothBump,
    bumpScale: 0.028,
    roughness: 0.85,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const kingBlackSkin = new THREE.MeshStandardMaterial({
    map: kingBlackSkinTex,
    roughness: 0.58,
    metalness: 0.02,
  });

  const kingBlackGem = new THREE.MeshPhysicalMaterial({
    color: 0x8b5cf6,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.7,
    roughness: 0.14,
    metalness: 0.15,
    clearcoat: 0.9,
  });

  const kingLeather = new THREE.MeshStandardMaterial({
    color: 0x4a2918,
    bumpMap: microNoiseBump,
    bumpScale: 0.008,
    roughness: 0.72,
    metalness: 0.05,
  });

  const emblemCache = new Map<string, THREE.MeshStandardMaterial>();
  const getEmblemMaterial = (color: PieceColor, type: PieceSymbol) => {
    const key = `${color}_${type}` as `${PieceColor}_${PieceSymbol}`;
    const existing = emblemCache.get(key);
    if (existing) return existing;
    const tex = assetTextures.emblemTextures[key];
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(color === 'w' ? 0xd4a438 : 0x9b6dff),
      emissiveIntensity: 0.65,
      transparent: true,
      alphaTest: 0.14,
      roughness: 0.3,
      metalness: 0.55,
      side: THREE.DoubleSide,
    });
    emblemCache.set(key, mat);
    return mat;
  };

  const materials: THREE.Material[] = [
    lightSquare,
    darkSquare,
    boardFrame,
    mossAccent,
    stoneArena,
    stoneColumn,
    stoneRuins,
    backdropMat,
    pedestalWhite,
    pedestalBlack,
    whiteArmor,
    whiteBronze,
    whiteTrim,
    whiteCloth,
    whiteCrystal,
    whiteSkin,
    whiteHorse,
    whiteScutum,
    whiteBanner,
    blackArmor,
    blackBronze,
    blackTrim,
    blackCloth,
    blackCrystal,
    blackSkin,
    blackHorse,
    blackScutum,
    blackBanner,
    leather,
    wood,
    parchment,
    bladeSteel,
    bladeDark,
    goldSpearGlow,
    brazierIron,
    kingWhiteGold,
    kingWhiteBronze,
    kingWhiteCloth,
    kingWhiteSkin,
    kingWhiteGem,
    kingBlackArmor,
    kingBlackTrim,
    kingBlackCloth,
    kingBlackSkin,
    kingBlackGem,
    kingLeather,
  ];

  return {
    lightSquare,
    darkSquare,
    boardFrame,
    mossAccent,
    stoneArena,
    stoneColumn,
    stoneRuins,
    backdropMat,
    pedestalWhite,
    pedestalBlack,
    whiteArmor,
    whiteBronze,
    whiteTrim,
    whiteCloth,
    whiteCrystal,
    whiteSkin,
    whiteHorse,
    whiteScutum,
    whiteBanner,
    blackArmor,
    blackBronze,
    blackTrim,
    blackCloth,
    blackCrystal,
    blackSkin,
    blackHorse,
    blackScutum,
    blackBanner,
    leather,
    wood,
    parchment,
    bladeSteel,
    bladeDark,
    goldSpearGlow,
    brazierIron,
    kingWhiteGold,
    kingWhiteBronze,
    kingWhiteCloth,
    kingWhiteSkin,
    kingWhiteGem,
    kingBlackArmor,
    kingBlackTrim,
    kingBlackCloth,
    kingBlackSkin,
    kingBlackGem,
    kingLeather,
    smokeTex,
    emberTex,
    fireSpriteTex,
    assetTextures,
    getEmblemMaterial,
    dispose: () => {
      assetTextures.dispose();
      extraTextures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      emblemCache.forEach((m) => m.dispose());
      emblemCache.clear();
    },
  };
}

export function getKingdomMaterials(palette: MaterialPalette, color: PieceColor) {
  return color === 'w'
    ? {
        pedestal: palette.pedestalWhite,
        armor: palette.whiteArmor,
        bronze: palette.whiteBronze,
        trim: palette.whiteTrim,
        cloth: palette.whiteCloth,
        crystal: palette.whiteCrystal,
        skin: palette.whiteSkin,
        horse: palette.whiteHorse,
        scutum: palette.whiteScutum,
        banner: palette.whiteBanner,
        blade: palette.bladeSteel,
        leather: palette.leather,
        accentHex: 0xffc646,
      }
    : {
        pedestal: palette.pedestalBlack,
        armor: palette.blackArmor,
        bronze: palette.blackBronze,
        trim: palette.blackTrim,
        cloth: palette.blackCloth,
        crystal: palette.blackCrystal,
        skin: palette.blackSkin,
        horse: palette.blackHorse,
        scutum: palette.blackScutum,
        banner: palette.blackBanner,
        blade: palette.bladeDark,
        leather: palette.leather,
        accentHex: 0xb26bff,
      };
}
