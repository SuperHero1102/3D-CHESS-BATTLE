import * as THREE from 'three';
import { PieceColor, PieceSymbol } from '../../types/chess';

export interface MaterialPalette {
  lightSquare: THREE.MeshStandardMaterial;
  darkSquare: THREE.MeshStandardMaterial;
  boardFrame: THREE.MeshStandardMaterial;
  mossAccent: THREE.MeshStandardMaterial;
  stoneArena: THREE.MeshStandardMaterial;
  stoneColumn: THREE.MeshStandardMaterial;
  stoneRuins: THREE.MeshStandardMaterial;
  pedestalWhite: THREE.MeshStandardMaterial;
  pedestalBlack: THREE.MeshStandardMaterial;
  whiteArmor: THREE.MeshPhysicalMaterial;
  whiteTrim: THREE.MeshPhysicalMaterial;
  whiteCloth: THREE.MeshStandardMaterial;
  whiteCrystal: THREE.MeshStandardMaterial;
  whiteSkin: THREE.MeshStandardMaterial;
  whiteHorse: THREE.MeshStandardMaterial;
  whiteScutum: THREE.MeshStandardMaterial;
  whiteBanner: THREE.MeshStandardMaterial;
  blackArmor: THREE.MeshPhysicalMaterial;
  blackTrim: THREE.MeshPhysicalMaterial;
  blackCloth: THREE.MeshStandardMaterial;
  blackCrystal: THREE.MeshStandardMaterial;
  blackSkin: THREE.MeshStandardMaterial;
  blackHorse: THREE.MeshStandardMaterial;
  blackScutum: THREE.MeshStandardMaterial;
  blackBanner: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  bladeSteel: THREE.MeshPhysicalMaterial;
  bladeDark: THREE.MeshPhysicalMaterial;
  brazierIron: THREE.MeshStandardMaterial;
  smokeTex: THREE.CanvasTexture;
  emberTex: THREE.CanvasTexture;
  getEmblemMaterial: (color: PieceColor, type: PieceSymbol) => THREE.MeshStandardMaterial;
  dispose: () => void;
}

function makeMarbleTileMaps(
  baseHex: string,
  veinHex: string,
  crackHex: string,
  speckleHex: string,
  size = 512
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const ctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, size, size);

  // Subtle marble clouding
  for (let i = 0; i < 18; i++) {
    const gx = (i * 113) % size;
    const gy = (i * 179) % size;
    const grad = ctx.createRadialGradient(gx, gy, 10, gx, gy, 140);
    grad.addColorStop(0, veinHex);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // Organic mineral veins
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = 0.14 + (i % 3) * 0.06;
    ctx.lineWidth = 1.2 + (i % 4);
    ctx.beginPath();
    let x = (i * 61) % size;
    let y = 0;
    ctx.moveTo(x, y);
    for (let step = 1; step <= 8; step++) {
      x += Math.sin(i * 1.9 + step * 1.25) * 36;
      y = (step / 8) * size;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Natural jagged cracks
  for (let c = 0; c < 6; c++) {
    const startX = ((c * 97 + 40) % (size - 60)) + 30;
    const startY = ((c * 131 + 30) % (size - 60)) + 30;
    ctx.strokeStyle = crackHex;
    ctx.globalAlpha = 0.36;
    ctx.lineWidth = 1.3;

    bCtx.strokeStyle = '#252525';
    bCtx.globalAlpha = 0.85;
    bCtx.lineWidth = 2.0;

    ctx.beginPath();
    bCtx.beginPath();
    let cx = startX;
    let cy = startY;
    ctx.moveTo(cx, cy);
    bCtx.moveTo(cx, cy);
    for (let seg = 0; seg < 7; seg++) {
      cx += Math.cos(c * 2.1 + seg * 1.4) * 26 + ((seg % 2 === 0 ? 1 : -1) * 9);
      cy += Math.sin(c * 1.3 + seg * 1.7) * 24 + 10;
      ctx.lineTo(cx, cy);
      bCtx.lineTo(cx, cy);
    }
    ctx.stroke();
    bCtx.stroke();
  }

  ctx.fillStyle = speckleHex;
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.05;
    ctx.fillRect((i * 89) % size, (i * 157) % size, 2, 2);
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;

  // Chiseled tile bevel
  ctx.strokeStyle = crackHex;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = 10;
  bCtx.strokeRect(4, 4, size - 8, size - 8);
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
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

  ctx.fillStyle = '#C9BBA4';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);

  // Pitted travertine stone grain & horizontal strata
  for (let i = 0; i < 1600; i++) {
    const x = (i * 137) % size;
    const y = (i * 73) % size;
    const w = 3 + (i % 10);
    const h = 1 + (i % 3);
    ctx.fillStyle = i % 3 === 0 ? '#9D8E78' : '#E2D6C1';
    ctx.globalAlpha = 0.28;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = i % 3 === 0 ? '#505050' : '#B5B5B5';
    bCtx.globalAlpha = 0.4;
    bCtx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;

  // Weathered cracks
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = '#6E604C';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = 3;
    ctx.beginPath();
    bCtx.beginPath();
    let x = (i * 71) % size;
    let y = 0;
    ctx.moveTo(x, y);
    bCtx.moveTo(x, y);
    for (let s = 1; s <= 5; s++) {
      x += Math.sin(i * 2 + s) * 18;
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

  ctx.fillStyle = '#4B443B';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#2A2A2A';
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
      const tone = 112 + ((r * 19 + col * 37) % 34);
      ctx.fillStyle = `rgb(${tone + 14}, ${tone + 6}, ${tone - 8})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);

      // Subtle weathered highlight/grime on stone block
      ctx.fillStyle = 'rgba(255,245,225,0.08)';
      ctx.fillRect(x + 4, y + 4, bw - 8, 6);
      ctx.fillStyle = 'rgba(20,18,15,0.22)';
      ctx.fillRect(x + 4, y + bh - 12, bw - 8, 8);

      bCtx.fillStyle = '#A8A8A8';
      bCtx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
    }
  }

  // Grit speckle
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,245,230,0.08)';
    ctx.fillRect((i * 101) % size, (i * 193) % size, 3, 2);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1.5);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 1.5);
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

  const flutes = 20;
  const fw = size / flutes;
  for (let i = 0; i < flutes; i++) {
    const x = i * fw;
    const grad = ctx.createLinearGradient(x, 0, x + fw, 0);
    grad.addColorStop(0, '#B9AD99');
    grad.addColorStop(0.25, '#8A7E6D');
    grad.addColorStop(0.5, '#776B5C');
    grad.addColorStop(0.75, '#8E8271');
    grad.addColorStop(1, '#CFC3AE');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, fw + 1, size);

    const bGrad = bCtx.createLinearGradient(x, 0, x + fw, 0);
    bGrad.addColorStop(0, '#E0E0E0');
    bGrad.addColorStop(0.5, '#353535');
    bGrad.addColorStop(1, '#E0E0E0');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(x, 0, fw + 1, size);
  }

  // Horizontal stone drum joints & grime
  ctx.fillStyle = 'rgba(40,34,28,0.22)';
  for (let y = 128; y < size; y += 128) {
    ctx.fillRect(0, y - 2, size, 4);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, y - 2, size, 4);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
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

  ctx.fillStyle = '#534A40';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#7A7A7A';
  bCtx.fillRect(0, 0, size, size);

  const step = 64;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const off = (y / step) % 2 === 0 ? 0 : step / 2;
      const sx = (x + off) % size;
      const v = 68 + ((x * 7 + y * 13) % 22);
      ctx.fillStyle = `rgb(${v + 16}, ${v + 8}, ${v - 2})`;
      ctx.fillRect(sx + 2, y + 2, step - 4, step - 4);
      bCtx.fillStyle = '#A0A0A0';
      bCtx.fillRect(sx + 3, y + 3, step - 6, step - 6);
    }
  }

  // Earthy dust & pebble grit
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(30,25,20,0.22)' : 'rgba(180,162,135,0.12)';
    ctx.fillRect((i * 83) % size, (i * 149) % size, 3, 3);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(14, 14);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(14, 14);
  return { map, bumpMap };
}

function makeClothFoldsBump(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  for (let i = 0; i <= 12; i++) {
    grad.addColorStop(i / 12, i % 2 === 0 ? '#C8C8C8' : '#585858');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWarriorFaceTexture(skinHex: string): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle brow shadow, eye sockets, nose bridge & beard/jaw stubble (faces front +Z at u=0.5)
  const cx = size * 0.5;
  ctx.fillStyle = 'rgba(70,40,25,0.32)';
  ctx.fillRect(cx - 24, 46, 48, 8); // brow ridge shadow

  // Eyes under brow
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.ellipse(cx - 11, 56, 4.2, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 11, 56, 4.2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose bridge shading
  ctx.fillStyle = 'rgba(255,228,204,0.28)';
  ctx.fillRect(cx - 3, 52, 6, 18);

  // Jaw stubble / determined mouth line
  ctx.fillStyle = 'rgba(55,35,25,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, 92, 22, 18, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(85,45,32,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 78);
  ctx.lineTo(cx + 7, 78);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeScutumTexture(isLight: boolean): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isLight ? '#8A151B' : '#3C165E';
  ctx.fillRect(0, 0, size, size);

  // Leather/brass weathered rim
  ctx.strokeStyle = isLight ? '#DFB048' : '#9AA5BA';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  // Detailed Roman Lightning & Eagle Wings (Fulmen)
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = isLight ? '#F5CE67' : '#D5DCE8';
  ctx.fillStyle = isLight ? '#F5CE67' : '#D5DCE8';
  ctx.lineWidth = 6;

  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, dir * 34);
    ctx.lineTo(10, dir * 58);
    ctx.lineTo(-5, dir * 92);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 16, -12);
    ctx.quadraticCurveTo(side * 60, -46, side * 94, -26);
    ctx.quadraticCurveTo(side * 76, 0, side * 90, 22);
    ctx.quadraticCurveTo(side * 54, 28, side * 16, 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeEagleBannerTexture(isLight: boolean): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = isLight ? '#88141A' : '#371454';
  ctx.fillRect(0, 0, w, h);

  // Subtle fabric weave vertical lines
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < w; x += 12) {
    ctx.fillRect(x, 0, 3, h);
  }

  // Gold edge trim
  ctx.strokeStyle = isLight ? '#D9A73E' : '#9E85C4';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Golden Roman Eagle Emblem in Center
  ctx.save();
  ctx.translate(w / 2, h * 0.44);
  ctx.fillStyle = isLight ? '#E6B94D' : '#C8B088';
  // Eagle wings
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 8, -10);
    ctx.quadraticCurveTo(s * 68, -68, s * 96, -34);
    ctx.quadraticCurveTo(s * 74, 8, s * 52, 18);
    ctx.quadraticCurveTo(s * 26, 20, s * 8, 12);
    ctx.closePath();
    ctx.fill();
  }
  // Eagle body & tail
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -32, 13, 0, Math.PI * 2);
  ctx.fill();
  // Wreath ring below talons
  ctx.strokeStyle = isLight ? '#E6B94D' : '#C8B088';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 62, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSoftParticleTexture(colorCenter: string, colorEdge: string): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, colorCenter);
  grad.addColorStop(0.5, colorEdge);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PIECE_GLYPHS: Record<PieceSymbol, string> = {
  k: '♔',
  q: '♕',
  r: '♖',
  b: '♗',
  n: '♘',
  p: '♙',
};

function makePedestalEmblemTexture(color: PieceColor, type: PieceSymbol): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color === 'w' ? '#2A2218' : '#141620';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color === 'w' ? '#E5B94C' : '#B784F7';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color === 'w' ? '#FFE49E' : '#E0C4FF';
  ctx.font = 'bold 68px "Segoe UI Symbol", "Apple Symbols", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PIECE_GLYPHS[type], 64, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialPalette(maxAnisotropy: number, isSoftwareGl: boolean): MaterialPalette {
  const lightStone = makeMarbleTileMaps('#E8E2D7', '#B2AAA0', '#635B52', '#FFFFFF');
  const darkStone = makeMarbleTileMaps('#181C24', '#384050', '#CBD5E1', '#64748B');
  const travertine = makeTravertineBorderMaps();
  const masonry = makeAshlarMasonryMaps();
  const fluted = makeFlutedColumnMaps();
  const courtyard = makeRomanCourtyardMaps();
  const clothBump = makeClothFoldsBump();
  const whiteFaceTex = makeWarriorFaceTexture('#D9B08E');
  const blackFaceTex = makeWarriorFaceTexture('#C49A78');
  const scutumWhiteTex = makeScutumTexture(true);
  const scutumBlackTex = makeScutumTexture(false);
  const bannerWhiteTex = makeEagleBannerTexture(true);
  const bannerBlackTex = makeEagleBannerTexture(false);
  const smokeTex = makeSoftParticleTexture('rgba(220,210,195,0.55)', 'rgba(180,170,155,0.18)');
  const emberTex = makeSoftParticleTexture('rgba(255,235,170,1)', 'rgba(255,120,20,0.5)');

  [
    lightStone.map,
    lightStone.bumpMap,
    darkStone.map,
    darkStone.bumpMap,
    travertine.map,
    travertine.bumpMap,
    masonry.map,
    masonry.bumpMap,
    fluted.map,
    fluted.bumpMap,
    courtyard.map,
    courtyard.bumpMap,
    scutumWhiteTex,
    scutumBlackTex,
    bannerWhiteTex,
    bannerBlackTex,
  ].forEach((t) => {
    t.anisotropy = maxAnisotropy;
  });

  const textures: THREE.Texture[] = [
    lightStone.map,
    lightStone.bumpMap,
    darkStone.map,
    darkStone.bumpMap,
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
    scutumWhiteTex,
    scutumBlackTex,
    bannerWhiteTex,
    bannerBlackTex,
    smokeTex,
    emberTex,
  ];

  const lightSquare = new THREE.MeshStandardMaterial({
    map: lightStone.map,
    bumpMap: lightStone.bumpMap,
    bumpScale: 0.015,
    roughness: 0.28,
    metalness: 0.06,
  });

  const darkSquare = new THREE.MeshStandardMaterial({
    map: darkStone.map,
    bumpMap: darkStone.bumpMap,
    bumpScale: 0.018,
    roughness: 0.22,
    metalness: 0.24,
  });

  const boardFrame = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.032,
    roughness: 0.72,
    metalness: 0.05,
  });

  const mossAccent = new THREE.MeshStandardMaterial({
    color: 0x3b4d2b,
    roughness: 0.92,
    metalness: 0.02,
  });

  const stoneArena = new THREE.MeshStandardMaterial({
    map: courtyard.map,
    bumpMap: courtyard.bumpMap,
    bumpScale: 0.04,
    roughness: 0.88,
    metalness: 0.05,
  });

  const stoneColumn = new THREE.MeshStandardMaterial({
    map: fluted.map,
    bumpMap: fluted.bumpMap,
    bumpScale: 0.045,
    roughness: 0.74,
    metalness: 0.05,
  });

  const stoneRuins = new THREE.MeshStandardMaterial({
    map: masonry.map,
    bumpMap: masonry.bumpMap,
    bumpScale: 0.05,
    roughness: 0.86,
    metalness: 0.04,
  });

  const pedestalWhite = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.02,
    color: 0xe6dac5,
    roughness: 0.56,
    metalness: 0.1,
  });

  const pedestalBlack = new THREE.MeshStandardMaterial({
    map: travertine.map,
    bumpMap: travertine.bumpMap,
    bumpScale: 0.02,
    color: 0x4b4640,
    roughness: 0.52,
    metalness: 0.22,
  });

  // Phe Ánh Sáng: Silver & Gold-Bronze PBR + Deep Crimson Roman Cloaks
  const whiteArmor = new THREE.MeshPhysicalMaterial({
    color: 0xd8dfe8,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.4,
    clearcoatRoughness: 0.18,
  });

  const whiteTrim = new THREE.MeshPhysicalMaterial({
    color: 0xdba93c,
    metalness: 0.94,
    roughness: 0.15,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
  });

  const whiteCloth = new THREE.MeshStandardMaterial({
    color: 0x8f181f,
    bumpMap: clothBump,
    bumpScale: 0.022,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const whiteCrystal = new THREE.MeshStandardMaterial({
    color: 0xffe49e,
    emissive: 0xffb703,
    emissiveIntensity: isSoftwareGl ? 1.25 : 2.35,
    roughness: 0.12,
    metalness: 0.1,
  });

  const whiteSkin = new THREE.MeshStandardMaterial({
    map: whiteFaceTex,
    roughness: 0.64,
    metalness: 0.02,
  });

  const whiteHorse = new THREE.MeshStandardMaterial({
    color: 0xddd7cc,
    roughness: 0.46,
    metalness: 0.08,
  });

  const whiteScutum = new THREE.MeshStandardMaterial({
    map: scutumWhiteTex,
    roughness: 0.4,
    metalness: 0.26,
    side: THREE.DoubleSide,
  });

  const whiteBanner = new THREE.MeshStandardMaterial({
    map: bannerWhiteTex,
    bumpMap: clothBump,
    bumpScale: 0.015,
    roughness: 0.75,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  // Phe Bóng Tối: Black Iron / Titanium PBR + Royal Imperial Purple Cloaks
  const blackArmor = new THREE.MeshPhysicalMaterial({
    color: 0x262d3a,
    metalness: 0.9,
    roughness: 0.18,
    clearcoat: 0.35,
    clearcoatRoughness: 0.18,
  });

  const blackTrim = new THREE.MeshPhysicalMaterial({
    color: 0x828ea6,
    metalness: 0.92,
    roughness: 0.2,
    clearcoat: 0.3,
  });

  const blackCloth = new THREE.MeshStandardMaterial({
    color: 0x451a6d,
    bumpMap: clothBump,
    bumpScale: 0.022,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const blackCrystal = new THREE.MeshStandardMaterial({
    color: 0xd8b4fe,
    emissive: 0xa855f7,
    emissiveIntensity: isSoftwareGl ? 1.3 : 2.5,
    roughness: 0.12,
    metalness: 0.12,
  });

  const blackSkin = new THREE.MeshStandardMaterial({
    map: blackFaceTex,
    roughness: 0.64,
    metalness: 0.02,
  });

  const blackHorse = new THREE.MeshStandardMaterial({
    color: 0x1a1e28,
    roughness: 0.42,
    metalness: 0.15,
  });

  const blackScutum = new THREE.MeshStandardMaterial({
    map: scutumBlackTex,
    roughness: 0.4,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });

  const blackBanner = new THREE.MeshStandardMaterial({
    map: bannerBlackTex,
    bumpMap: clothBump,
    bumpScale: 0.015,
    roughness: 0.75,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const leather = new THREE.MeshStandardMaterial({
    color: 0x472c1c,
    roughness: 0.7,
    metalness: 0.06,
  });

  const wood = new THREE.MeshStandardMaterial({
    color: 0x4c3220,
    roughness: 0.74,
    metalness: 0.04,
  });

  const bladeSteel = new THREE.MeshPhysicalMaterial({
    color: 0xf1f5f9,
    metalness: 0.96,
    roughness: 0.12,
    anisotropy: 0.8,
  });

  const bladeDark = new THREE.MeshPhysicalMaterial({
    color: 0x6b748a,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.28,
    metalness: 0.95,
    roughness: 0.15,
    anisotropy: 0.8,
  });

  const brazierIron = new THREE.MeshStandardMaterial({
    color: 0x2e2a26,
    metalness: 0.82,
    roughness: 0.38,
  });

  const emblemCache = new Map<string, THREE.MeshStandardMaterial>();
  const getEmblemMaterial = (color: PieceColor, type: PieceSymbol) => {
    const key = `${color}_${type}`;
    const existing = emblemCache.get(key);
    if (existing) return existing;
    const tex = makePedestalEmblemTexture(color, type);
    tex.anisotropy = maxAnisotropy;
    textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(color === 'w' ? 0xf6c453 : 0xa855f7),
      emissiveIntensity: 0.95,
      roughness: 0.35,
      metalness: 0.4,
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
    pedestalWhite,
    pedestalBlack,
    whiteArmor,
    whiteTrim,
    whiteCloth,
    whiteCrystal,
    whiteSkin,
    whiteHorse,
    whiteScutum,
    whiteBanner,
    blackArmor,
    blackTrim,
    blackCloth,
    blackCrystal,
    blackSkin,
    blackHorse,
    blackScutum,
    blackBanner,
    leather,
    wood,
    bladeSteel,
    bladeDark,
    brazierIron,
  ];

  return {
    lightSquare,
    darkSquare,
    boardFrame,
    mossAccent,
    stoneArena,
    stoneColumn,
    stoneRuins,
    pedestalWhite,
    pedestalBlack,
    whiteArmor,
    whiteTrim,
    whiteCloth,
    whiteCrystal,
    whiteSkin,
    whiteHorse,
    whiteScutum,
    whiteBanner,
    blackArmor,
    blackTrim,
    blackCloth,
    blackCrystal,
    blackSkin,
    blackHorse,
    blackScutum,
    blackBanner,
    leather,
    wood,
    bladeSteel,
    bladeDark,
    brazierIron,
    smokeTex,
    emberTex,
    getEmblemMaterial,
    dispose: () => {
      textures.forEach((t) => t.dispose());
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
        trim: palette.whiteTrim,
        cloth: palette.whiteCloth,
        crystal: palette.whiteCrystal,
        skin: palette.whiteSkin,
        horse: palette.whiteHorse,
        scutum: palette.whiteScutum,
        blade: palette.bladeSteel,
        accentHex: 0xffb703,
      }
    : {
        pedestal: palette.pedestalBlack,
        armor: palette.blackArmor,
        trim: palette.blackTrim,
        cloth: palette.blackCloth,
        crystal: palette.blackCrystal,
        skin: palette.blackSkin,
        horse: palette.blackHorse,
        scutum: palette.blackScutum,
        blade: palette.bladeDark,
        accentHex: 0xa855f7,
      };
}
