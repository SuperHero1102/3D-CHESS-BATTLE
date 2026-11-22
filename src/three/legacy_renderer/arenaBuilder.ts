import * as THREE from 'three';
import { GraphicsQuality } from '../../types/chess';
import { MaterialPalette } from './materials';

export const SQUARE_SIZE = 1.0;

export function squareToWorld(square: string, out = new THREE.Vector3()): THREE.Vector3 {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  out.set((file - 3.5) * SQUARE_SIZE, 0, (3.5 - rank) * SQUARE_SIZE);
  return out;
}

export function indexToSquare(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

export interface ArenaHandles {
  arenaGroup: THREE.Group;
  squareMeshes: Map<string, THREE.Mesh>;
  coordGroup: THREE.Group;
  banners: THREE.Mesh[];
  flames: THREE.Mesh[];
  torchLights: THREE.PointLight[];
  emberPoints: THREE.Points | null;
  emberVelocities: Float32Array | null;
  emberOrigins: Float32Array | null;
  mistPoints: THREE.Points | null;
  starPoints: THREE.Points | null;
  dispose: () => void;
}

function makeCoordLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#3B3022';
  ctx.font = '700 38px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSwallowtailBannerGeometry(width: number, height: number): THREE.ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const notch = height * 0.18;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh);
  shape.lineTo(hw, hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(0, -hh + notch);
  shape.lineTo(-hw, -hh);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape, 4);
  // Normalize UV coordinates cleanly into [0..1] so the golden Roman Eagle centers neatly
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = (x + hw) / width;
    uvs[i * 2 + 1] = (y + hh) / height;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function createFortressBastionGeometry(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const hw = w / 2;
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, h);
  // Crenellated merlons across the top of the bastion wall
  const merlonSteps = 5;
  const stepW = w / merlonSteps;
  for (let i = merlonSteps - 1; i >= 0; i--) {
    const xRight = -hw + (i + 1) * stepW;
    const xLeft = -hw + i * stepW;
    const isMerlon = i % 2 === 0;
    const yTop = isMerlon ? h + 0.65 : h;
    shape.lineTo(xRight, yTop);
    shape.lineTo(xLeft, yTop);
  }
  shape.closePath();

  // Narrow vertical arrow-slit embrasure
  const slit = new THREE.Path();
  slit.moveTo(-0.14, h * 0.36);
  slit.lineTo(0.14, h * 0.36);
  slit.lineTo(0.14, h * 0.72);
  slit.lineTo(-0.14, h * 0.72);
  slit.closePath();
  shape.holes.push(slit);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export function buildMedievalArena(
  scene: THREE.Scene,
  palette: MaterialPalette,
  quality: GraphicsQuality
): ArenaHandles {
  const arenaGroup = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const squareMeshes = new Map<string, THREE.Mesh>();

  // 1. Deep Midnight Cobalt Starry Sky Dome (matching Total War Roman night battle atmosphere)
  const skyGeo = new THREE.SphereGeometry(85, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x091529) },
      horizonColor: { value: new THREE.Color(0x1d3658) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(normalize(vWorldPos).y * 1.45, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, pow(h, 0.75)), 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  arenaGroup.add(skyDome);
  disposables.push(skyGeo, skyMat);

  // 2. 8x8 Carrara White Marble & Black Obsidian Tiles
  const tileGeo = new THREE.BoxGeometry(SQUARE_SIZE * 0.986, 0.14, SQUARE_SIZE * 0.986);
  disposables.push(tileGeo);

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = indexToSquare(file, rank);
      const isDark = (file + rank) % 2 === 0;
      const tile = new THREE.Mesh(tileGeo, isDark ? palette.darkSquare : palette.lightSquare);
      tile.position.set((file - 3.5) * SQUARE_SIZE, -0.07, (3.5 - rank) * SQUARE_SIZE);
      tile.receiveShadow = true;
      tile.layers.enable(1);
      tile.userData.square = sq;
      arenaGroup.add(tile);
      squareMeshes.set(sq, tile);
    }
  }

  // 3. Weathered Travertine Stone Frame & Mossy Border Crevices
  const outerBaseGeo = new THREE.BoxGeometry(9.28, 0.28, 9.28);
  const outerBase = new THREE.Mesh(outerBaseGeo, palette.boardFrame);
  outerBase.position.y = -0.155;
  outerBase.receiveShadow = true;
  arenaGroup.add(outerBase);

  const daisGeo = new THREE.BoxGeometry(9.85, 0.34, 9.85);
  const dais = new THREE.Mesh(daisGeo, palette.stoneRuins);
  dais.position.y = -0.46;
  dais.receiveShadow = true;
  arenaGroup.add(dais);
  disposables.push(outerBaseGeo, daisGeo);

  // Organic Moss Patches tucked along travertine border corners & weathered cracks
  const mossGeo = new THREE.DodecahedronGeometry(0.16, 1);
  disposables.push(mossGeo);
  const mossSpots: [number, number, number, number][] = [
    [4.28, 0.0, 2.4, 1.3],
    [4.32, 0.0, -1.8, 1.1],
    [2.1, 0.0, 4.35, 1.4],
    [-2.7, 0.0, 4.3, 1.2],
    [-4.34, 0.0, 1.5, 1.15],
    [-4.28, 0.0, -2.9, 1.25],
    [1.6, 0.0, -4.34, 1.2],
    [-1.4, 0.0, -4.32, 1.0],
  ];
  for (const [mx, my, mz, ms] of mossSpots) {
    const moss = new THREE.Mesh(mossGeo, palette.mossAccent);
    moss.position.set(mx, my, mz);
    moss.scale.set(ms * 1.4, 0.24, ms * 0.9);
    moss.rotation.y = mx * 0.7;
    arenaGroup.add(moss);
  }

  // 4. Classical Engraved Coordinate Markers (A-H, 1-8) on Travertine Frame
  const coordGroup = new THREE.Group();
  const labelGeo = new THREE.PlaneGeometry(0.36, 0.36);
  disposables.push(labelGeo);

  for (let i = 0; i < 8; i++) {
    const fileLabel = String.fromCharCode(65 + i);
    const fileTex = makeCoordLabelTexture(fileLabel);
    const fileMat = new THREE.MeshBasicMaterial({ map: fileTex, transparent: true, depthWrite: false });
    disposables.push(fileTex, fileMat);

    const south = new THREE.Mesh(labelGeo, fileMat);
    south.rotation.x = -Math.PI / 2;
    south.position.set((i - 3.5) * SQUARE_SIZE, -0.01, 4.34);
    coordGroup.add(south);

    const north = new THREE.Mesh(labelGeo, fileMat);
    north.rotation.x = -Math.PI / 2;
    north.rotation.z = Math.PI;
    north.position.set((i - 3.5) * SQUARE_SIZE, -0.01, -4.34);
    coordGroup.add(north);

    const rankLabel = String(i + 1);
    const rankTex = makeCoordLabelTexture(rankLabel);
    const rankMat = new THREE.MeshBasicMaterial({ map: rankTex, transparent: true, depthWrite: false });
    disposables.push(rankTex, rankMat);

    const west = new THREE.Mesh(labelGeo, rankMat);
    west.rotation.x = -Math.PI / 2;
    west.position.set(-4.34, -0.01, (3.5 - i) * SQUARE_SIZE);
    coordGroup.add(west);

    const east = new THREE.Mesh(labelGeo, rankMat);
    east.rotation.x = -Math.PI / 2;
    east.rotation.z = Math.PI;
    east.position.set(4.34, -0.01, (3.5 - i) * SQUARE_SIZE);
    coordGroup.add(east);
  }
  arenaGroup.add(coordGroup);

  // 5. Roman Fortress Stone Courtyard Floor
  const floorGeo = new THREE.CylinderGeometry(58, 58, 0.25, 48);
  const floor = new THREE.Mesh(floorGeo, palette.stoneArena);
  floor.position.y = -0.75;
  floor.receiveShadow = true;
  arenaGroup.add(floor);
  disposables.push(floorGeo);

  // 6. Crisp Night Starfield + Luminous Moon
  const starCount = quality === 'low' ? 420 : 1100;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.08 + Math.random() * Math.PI * 0.41;
    const r = 64 + Math.random() * 12;
    starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPositions[i * 3 + 1] = Math.sin(phi) * r + 3;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;

    const tint = Math.random();
    if (tint < 0.4) {
      starColors[i * 3] = 0.78;
      starColors[i * 3 + 1] = 0.9;
      starColors[i * 3 + 2] = 1.0;
    } else if (tint < 0.75) {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 0.97;
      starColors[i * 3 + 2] = 0.9;
    } else {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 0.88;
      starColors[i * 3 + 2] = 0.7;
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.34,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    fog: false,
    depthWrite: false,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  arenaGroup.add(starPoints);

  const moonGeo = new THREE.SphereGeometry(2.2, 20, 16);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xd6e8ff, fog: false });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(-20, 30, -38);
  arenaGroup.add(moon);
  disposables.push(starGeo, starMat, moonGeo, moonMat);

  // 7. Fluted Corinthian Columns, Swallowtail Eagle Banners & Wrought-Iron Tripod Braziers
  const banners: THREE.Mesh[] = [];
  const flames: THREE.Mesh[] = [];
  const torchLights: THREE.PointLight[] = [];
  const fireOrigins: [number, number, number, number][] = []; // x, y, z, scale

  const shaftGeo = new THREE.CylinderGeometry(0.42, 0.5, 6.4, 24);
  const basePlinthGeo = new THREE.BoxGeometry(1.36, 0.4, 1.36);
  const torusBaseGeo = new THREE.TorusGeometry(0.52, 0.085, 8, 22);
  const capitalGeo = new THREE.CylinderGeometry(0.8, 0.44, 0.72, 14);
  const abacusGeo = new THREE.BoxGeometry(1.48, 0.24, 1.48);
  const crossbarGeo = new THREE.CylinderGeometry(0.036, 0.036, 1.12, 8);
  const bannerGeo = createSwallowtailBannerGeometry(0.92, 2.45);

  const legGeo = new THREE.CylinderGeometry(0.024, 0.018, 1.35, 8);
  const ringGeo = new THREE.TorusGeometry(0.24, 0.022, 8, 16);
  const basketGeo = new THREE.CylinderGeometry(0.28, 0.14, 0.2, 12);
  const flameOuterGeo = new THREE.ConeGeometry(0.22, 0.68, 9);
  const flameInnerGeo = new THREE.ConeGeometry(0.13, 0.46, 8);
  const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff7b1c, transparent: true, opacity: 0.9 });
  const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xffe484, transparent: true, opacity: 0.96 });

  disposables.push(
    shaftGeo,
    basePlinthGeo,
    torusBaseGeo,
    capitalGeo,
    abacusGeo,
    crossbarGeo,
    bannerGeo,
    legGeo,
    ringGeo,
    basketGeo,
    flameOuterGeo,
    flameInnerGeo,
    flameOuterMat,
    flameInnerMat
  );

  const addTripodBrazier = (bx: number, bz: number, addLight: boolean) => {
    const tripod = new THREE.Group();
    tripod.position.set(bx, -0.62, bz);

    // 3 splayed wrought-iron legs meeting at fire basket
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(legGeo, palette.brazierIron);
      leg.position.set(Math.cos(a) * 0.14, 0.66, Math.sin(a) * 0.14);
      leg.rotation.z = Math.cos(a) * 0.18;
      leg.rotation.x = -Math.sin(a) * 0.18;
      tripod.add(leg);
    }

    const midRing = new THREE.Mesh(ringGeo, palette.brazierIron);
    midRing.rotation.x = Math.PI / 2;
    midRing.position.y = 0.72;
    midRing.scale.setScalar(0.75);

    const basket = new THREE.Mesh(basketGeo, palette.brazierIron);
    basket.position.y = 1.28;

    const flameOuter = new THREE.Mesh(flameOuterGeo, flameOuterMat);
    flameOuter.position.y = 1.62;
    const flameInner = new THREE.Mesh(flameInnerGeo, flameInnerMat);
    flameInner.position.y = 1.54;
    tripod.add(midRing, basket, flameOuter, flameInner);
    arenaGroup.add(tripod);

    flames.push(flameOuter, flameInner);
    fireOrigins.push([bx, 0.98, bz, 0.45]);

    if (addLight) {
      const torch = new THREE.PointLight(0xff8c36, 7.5, 16, 1.5);
      torch.position.set(bx, 1.25, bz);
      arenaGroup.add(torch);
      torchLights.push(torch);
    }
  };

  const pillarCount = quality === 'low' ? 6 : 8;
  for (let i = 0; i < pillarCount; i++) {
    const angle = (i / pillarCount) * Math.PI * 2 + Math.PI / 8;
    const radius = 10.9;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    const dirX = -Math.cos(angle);
    const dirZ = -Math.sin(angle);

    const colGroup = new THREE.Group();
    colGroup.position.set(px, -0.68, pz);

    const plinth = new THREE.Mesh(basePlinthGeo, palette.boardFrame);
    plinth.position.y = 0.2;
    const torusBase = new THREE.Mesh(torusBaseGeo, palette.boardFrame);
    torusBase.rotation.x = Math.PI / 2;
    torusBase.position.y = 0.46;
    const shaft = new THREE.Mesh(shaftGeo, palette.stoneColumn);
    shaft.position.y = 3.65;
    shaft.castShadow = quality === 'high';
    shaft.receiveShadow = true;
    const capital = new THREE.Mesh(capitalGeo, palette.boardFrame);
    capital.position.y = 7.05;
    const abacus = new THREE.Mesh(abacusGeo, palette.boardFrame);
    abacus.position.y = 7.48;

    colGroup.add(plinth, torusBase, shaft, capital, abacus);
    arenaGroup.add(colGroup);

    // Swallowtail Roman Eagle Vexillum Banner hanging inward from column
    const isBlackSide = pz < 0;
    const bannerMat = isBlackSide ? palette.blackBanner : palette.whiteBanner;
    const crossbar = new THREE.Mesh(crossbarGeo, palette.whiteTrim);
    crossbar.position.set(px + dirX * 0.68, 5.2, pz + dirZ * 0.68);
    crossbar.lookAt(0, 5.2, 0);
    crossbar.rotateZ(Math.PI / 2);
    arenaGroup.add(crossbar);

    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(px + dirX * 0.68, 3.92, pz + dirZ * 0.68);
    banner.lookAt(0, 3.92, 0);
    arenaGroup.add(banner);
    banners.push(banner);

    // Wrought-iron tripod brazier standing inward beside columns
    const bx = px + dirX * 1.95;
    const bz = pz + dirZ * 1.95;
    addTripodBrazier(bx, bz, quality !== 'low' && i % 2 === 0);
  }

  // 8. Courtyard Bonfire Campfire (crossed charred logs + blazing flames matching left courtyard in ref image)
  const campfireGroup = new THREE.Group();
  campfireGroup.position.set(-7.6, -0.62, -6.8);
  const logGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.55, 8);
  disposables.push(logGeo);
  for (let l = 0; l < 6; l++) {
    const a = (l / 6) * Math.PI * 2;
    const log = new THREE.Mesh(logGeo, palette.wood);
    log.position.set(Math.cos(a) * 0.28, 0.16, Math.sin(a) * 0.28);
    log.rotation.z = Math.cos(a) * 1.15;
    log.rotation.x = -Math.sin(a) * 1.15;
    campfireGroup.add(log);
  }
  const bonfireOuter = new THREE.Mesh(flameOuterGeo, flameOuterMat);
  bonfireOuter.scale.set(2.3, 2.2, 2.3);
  bonfireOuter.position.y = 0.68;
  const bonfireInner = new THREE.Mesh(flameInnerGeo, flameInnerMat);
  bonfireInner.scale.set(2.1, 2.0, 2.1);
  bonfireInner.position.y = 0.56;
  campfireGroup.add(bonfireOuter, bonfireInner);
  arenaGroup.add(campfireGroup);
  flames.push(bonfireOuter, bonfireInner);
  fireOrigins.push([-7.6, 0.15, -6.8, 0.9]);

  if (quality !== 'low') {
    const bonfireLight = new THREE.PointLight(0xff822e, 14.0, 22, 1.45);
    bonfireLight.position.set(-7.6, 0.75, -6.8);
    arenaGroup.add(bonfireLight);
    torchLights.push(bonfireLight);
  }

  // 9. Crenellated Ashlar Roman Fortress Bastions, Battlement Torches & Ruins
  const bastionGeo = createFortressBastionGeometry(6.4, 4.4, 1.15);
  const curtainWallGeo = new THREE.BoxGeometry(4.8, 2.6, 0.85);
  const brokenColGeo = new THREE.CylinderGeometry(0.36, 0.42, 2.8, 16);
  const fallenBlockGeo = new THREE.BoxGeometry(1.4, 0.8, 1.0);
  disposables.push(bastionGeo, curtainWallGeo, brokenColGeo, fallenBlockGeo);

  const bastionCount = 8;
  for (let i = 0; i < bastionCount; i++) {
    const angle = (i / bastionCount) * Math.PI * 2;
    const r = 17.8;
    const wx = Math.cos(angle) * r;
    const wz = Math.sin(angle) * r;

    const wall = new THREE.Mesh(bastionGeo, palette.stoneRuins);
    wall.position.set(wx, -0.68, wz);
    wall.lookAt(0, -0.68, 0);
    wall.receiveShadow = true;
    arenaGroup.add(wall);

    // Battlement torch burning atop alternating towers
    if (i % 2 === 1) {
      const torchStick = new THREE.Mesh(legGeo, palette.brazierIron);
      torchStick.scale.set(0.9, 0.75, 0.9);
      torchStick.position.set(wx, 4.15, wz);
      const bFlame = new THREE.Mesh(flameOuterGeo, flameOuterMat);
      bFlame.scale.set(1.1, 1.25, 1.1);
      bFlame.position.set(wx, 4.78, wz);
      arenaGroup.add(torchStick, bFlame);
      flames.push(bFlame);
    }

    // Connecting outer curtain wall & ruined column/rubble
    const midAngle = angle + Math.PI / bastionCount;
    const cw = new THREE.Mesh(curtainWallGeo, palette.stoneRuins);
    cw.position.set(Math.cos(midAngle) * (r + 1.4), 0.55, Math.sin(midAngle) * (r + 1.4));
    cw.lookAt(0, 0.55, 0);
    arenaGroup.add(cw);

    if (i % 2 === 0) {
      const brokenCol = new THREE.Mesh(brokenColGeo, palette.stoneColumn);
      brokenCol.position.set(wx * 0.82, 0.35, wz * 0.82);
      brokenCol.rotation.set(0.32, angle, -0.45);
      arenaGroup.add(brokenCol);

      const rubble = new THREE.Mesh(fallenBlockGeo, palette.stoneRuins);
      rubble.position.set(wx * 0.88, -0.35, wz * 0.88);
      rubble.rotation.set(0.1, angle + 0.5, 0.12);
      arenaGroup.add(rubble);
    }
  }

  // 10. Soft Textured Rising Fire Embers + Low-Lying Courtyard Smoke/Mist
  let emberPoints: THREE.Points | null = null;
  let emberVelocities: Float32Array | null = null;
  let emberOrigins: Float32Array | null = null;
  let mistPoints: THREE.Points | null = null;

  if (quality !== 'low') {
    const embersPerSource = quality === 'high' ? 18 : 10;
    const emberTotal = fireOrigins.length * embersPerSource;
    const ePos = new Float32Array(emberTotal * 3);
    emberVelocities = new Float32Array(emberTotal * 3);
    emberOrigins = new Float32Array(emberTotal * 3);

    for (let b = 0; b < fireOrigins.length; b++) {
      const [bx, by, bz, spread] = fireOrigins[b];
      for (let k = 0; k < embersPerSource; k++) {
        const idx = b * embersPerSource + k;
        emberOrigins[idx * 3] = bx;
        emberOrigins[idx * 3 + 1] = by;
        emberOrigins[idx * 3 + 2] = bz;

        ePos[idx * 3] = bx + (Math.random() - 0.5) * spread;
        ePos[idx * 3 + 1] = by + Math.random() * 2.6;
        ePos[idx * 3 + 2] = bz + (Math.random() - 0.5) * spread;

        emberVelocities[idx * 3] = (Math.random() - 0.5) * 0.32;
        emberVelocities[idx * 3 + 1] = 0.7 + Math.random() * 1.1;
        emberVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 0.32;
      }
    }

    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const eMat = new THREE.PointsMaterial({
      map: palette.emberTex,
      color: 0xffb347,
      size: 0.16,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    emberPoints = new THREE.Points(eGeo, eMat);
    emberPoints.frustumCulled = false;
    arenaGroup.add(emberPoints);
    disposables.push(eGeo, eMat);

    // Soft drifting courtyard ground smoke / battlefield haze
    const mistCount = quality === 'high' ? 120 : 60;
    const mPos = new Float32Array(mistCount * 3);
    for (let i = 0; i < mistCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 5.6 + Math.random() * 11.0;
      mPos[i * 3] = Math.cos(ang) * rad;
      mPos[i * 3 + 1] = -0.2 + Math.random() * 1.5;
      mPos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    const mMat = new THREE.PointsMaterial({
      map: palette.smokeTex,
      color: 0xd6cfc2,
      size: 2.8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    mistPoints = new THREE.Points(mGeo, mMat);
    arenaGroup.add(mistPoints);
    disposables.push(mGeo, mMat);
  }

  scene.add(arenaGroup);

  return {
    arenaGroup,
    squareMeshes,
    coordGroup,
    banners,
    flames,
    torchLights,
    emberPoints,
    emberVelocities,
    emberOrigins,
    mistPoints,
    starPoints,
    dispose: () => {
      scene.remove(arenaGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
