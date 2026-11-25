import * as THREE from 'three';
import { GraphicsQuality } from '../types/chess';
import { MaterialPalette } from './materials';

// 1-LINE TOGGLE: Đặt `false` để quay lại lửa sprite 2D cũ
export const FLAME_V2 = true;

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

export interface FireFlameHandle {
  sprite: THREE.Sprite;
  coreSprite: THREE.Sprite;
  basePos: THREE.Vector3;
  baseScale: THREE.Vector2;
  phase: number;
}

export interface ClothBannerHandle {
  mesh: THREE.Mesh;
  basePos: Float32Array;
  phase: number;
}

export interface ArenaHandles {
  arenaGroup: THREE.Group;
  squareMeshes: Map<string, THREE.Mesh>;
  coordGroup: THREE.Group;
  banners: ClothBannerHandle[];
  flames: FireFlameHandle[];
  torchLights: THREE.PointLight[];
  flameShadowLight: THREE.SpotLight | null;
  emberPoints: THREE.Points | null;
  emberVelocities: Float32Array | null;
  emberOrigins: Float32Array | null;
  mistPoints: THREE.Points | null;
  starPoints: THREE.Points | null;
  updateFlames: (elapsed: number, dt: number, lowPerf?: boolean) => void;
  dispose: () => void;
}

function makeEngravedBronzeCoordTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 96, 96);

  // Subtle carved shadow recess beneath embossed bronze letter
  ctx.font = '700 52px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(20, 14, 8, 0.72)';
  ctx.fillText(label, 49, 51);

  const grad = ctx.createLinearGradient(0, 20, 0, 76);
  grad.addColorStop(0, '#F6DA86');
  grad.addColorStop(0.5, '#C9983A');
  grad.addColorStop(1, '#7D581B');
  ctx.fillStyle = grad;
  ctx.fillText(label, 48, 49);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates 16 shared BoxGeometry variants with rotated & offset UVs across the top face
 * so neighboring marble/obsidian tiles show unique natural mineral veins without repeating identically.
 */
function createTileGeoVariant(variantIndex: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(SQUARE_SIZE * 0.988, 0.14, SQUARE_SIZE * 0.988);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const rotStep = variantIndex % 4;
  const subX = (Math.floor(variantIndex / 4) % 2) * 0.34;
  const subY = (Math.floor(variantIndex / 8) % 2) * 0.34;
  const span = 0.66;

  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let v = uv.getY(i);
    for (let r = 0; r < rotStep; r++) {
      const nu = v;
      const nv = 1 - u;
      u = nu;
      v = nv;
    }
    uv.setXY(i, subX + u * span, subY + v * span);
  }
  uv.needsUpdate = true;
  return geo;
}

function createSubdividedClothBannerGeo(width: number, height: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 10, 22);
  // Subtle swallowtail taper on bottom edge via vertex positions (retaining clean [0..1] UVs)
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const hw = width / 2;
  const hh = height / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (y < -hh + height * 0.14) {
      const distCenter = 1 - Math.abs(x) / hw;
      const frac = (-hh + height * 0.14 - y) / (height * 0.14);
      pos.setY(i, y + distCenter * frac * height * 0.08);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function createCorinthianBaseGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.64, 0.0),
    new THREE.Vector2(0.64, 0.12),
    new THREE.Vector2(0.56, 0.16),
    new THREE.Vector2(0.60, 0.25),
    new THREE.Vector2(0.49, 0.32),
    new THREE.Vector2(0.53, 0.39),
    new THREE.Vector2(0.47, 0.44),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createCorinthianCapitalBellGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.44, 0.0),
    new THREE.Vector2(0.49, 0.08),
    new THREE.Vector2(0.45, 0.16),
    new THREE.Vector2(0.58, 0.36),
    new THREE.Vector2(0.53, 0.44),
    new THREE.Vector2(0.76, 0.68),
    new THREE.Vector2(0.84, 0.78),
    new THREE.Vector2(0.0, 0.78),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createFortressBastionGeometry(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const hw = w / 2;
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, h);
  const merlonSteps = 5;
  const stepW = w / merlonSteps;
  for (let i = merlonSteps - 1; i >= 0; i--) {
    const xRight = -hw + (i + 1) * stepW;
    const xLeft = -hw + i * stepW;
    const isMerlon = i % 2 === 0;
    const yTop = isMerlon ? h + 0.68 : h;
    shape.lineTo(xRight, yTop);
    shape.lineTo(xLeft, yTop);
  }
  shape.closePath();

  const slit = new THREE.Path();
  slit.moveTo(-0.14, h * 0.36);
  slit.lineTo(0.14, h * 0.36);
  slit.lineTo(0.14, h * 0.74);
  slit.lineTo(-0.14, h * 0.74);
  slit.closePath();
  shape.holes.push(slit);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/**
 * Crossed 3-plane flame geometry (60° spacing) pivoted at bottom y=0..1 so base hugs coal bed.
 */
function createCrossedFlameGeo(): THREE.BufferGeometry {
  const planeCount = 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < planeCount; p++) {
    const angle = (p / planeCount) * Math.PI;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const baseVertex = p * 4;
    const xHalf = 0.5;
    // Bottom-left, bottom-right, top-right, top-left (y from 0 to 1)
    const verts: [number, number, number, number][] = [
      [-xHalf, 0, 0, 0],
      [xHalf, 0, 1, 0],
      [xHalf, 1, 1, 1],
      [-xHalf, 1, 0, 1],
    ];
    for (const [lx, ly, u, v] of verts) {
      positions.push(lx * c, ly, lx * s);
      uvs.push(u, v);
    }
    indices.push(baseVertex, baseVertex + 1, baseVertex + 2, baseVertex, baseVertex + 2, baseVertex + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createVolumetricFlameShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float aPhase;
      attribute vec2 aFlameScale;
      attribute float aHeat;
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      varying float vHeat;

      void main() {
        vUv = uv;
        vPhase = aPhase;
        vHeat = aHeat;
        vec3 pos = position;
        float h = uv.y;
        float sway = sin(uTime * 5.2 + aPhase + h * 4.5) * 0.14 * h * h;
        float swayZ = cos(uTime * 4.1 + aPhase * 1.3 + h * 3.8) * 0.11 * h * h;
        pos.x = pos.x * aFlameScale.x + sway;
        pos.y = pos.y * aFlameScale.y;
        pos.z = pos.z * aFlameScale.x + swayZ;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      varying float vHeat;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float val = 0.0;
        float amp = 0.52;
        for (int i = 0; i < 4; i++) {
          val += amp * noise(p);
          p = p * 2.04 + vec2(3.1, -5.7);
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        float y = vUv.y;
        float x = (vUv.x - 0.5) * 2.0;

        // Tapered teardrop width + subtle turbulence
        float n = fbm(vec2(x * 2.4 + vPhase, y * 3.6 - uTime * 3.2 + vPhase * 0.7));
        float warpX = x + (n - 0.5) * 0.42 * y;
        float widthMask = mix(0.88, 0.14, pow(y, 0.78));
        float radial = 1.0 - smoothstep(widthMask * 0.25, widthMask, abs(warpX));

        float lick = smoothstep(0.22, 0.88, n + (1.0 - y) * 0.55);
        float verticalFade = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55, 1.0, y));
        float intensity = clamp(radial * lick * verticalFade * 1.45, 0.0, 1.0);
        if (intensity < 0.025) discard;

        vec3 coreColor = vec3(2.8, 2.35, 1.35);
        vec3 midColor = vec3(2.15, 0.88, 0.2);
        vec3 tipColor = vec3(1.15, 0.2, 0.04);

        float coreFactor = smoothstep(0.55, 0.95, intensity * (1.0 - y * 0.55));
        vec3 col = mix(tipColor, midColor, smoothstep(0.08, 0.65, intensity));
        col = mix(col, coreColor, coreFactor) * mix(0.85, 1.15, vHeat);

        gl_FragColor = vec4(col * intensity, intensity * 0.92);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function createCoalBedShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;
      void main() {
        vNormalDir = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }

      float voronoiCracks(vec2 p) {
        vec2 g = floor(p);
        vec2 f = fract(p);
        float minD = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 r = o + hash2(g + o) - f;
            minD = min(minD, dot(r, r));
          }
        }
        return clamp(minD, 0.0, 1.0);
      }

      void main() {
        float c = voronoiCracks(vWorldPos.xz * 12.5);
        float pulse = 0.72 + 0.28 * sin(uTime * 3.1 + vWorldPos.x * 2.5 + vWorldPos.z * 2.1);
        float crackGlow = smoothstep(0.16, 0.62, c) * pulse;
        vec3 ashChar = vec3(0.08, 0.05, 0.04);
        vec3 emberHot = vec3(2.2, 0.62, 0.1) * crackGlow;
        vec3 col = mix(ashChar, emberHot, clamp(crackGlow * 1.15, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function buildMedievalArena(
  scene: THREE.Scene,
  palette: MaterialPalette,
  quality: GraphicsQuality
): ArenaHandles {
  const arenaGroup = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const squareMeshes = new Map<string, THREE.Mesh>();

  // 1. 360° Deep Night Cobalt Sky Dome + Starfield Overhead
  const skyGeo = new THREE.SphereGeometry(95, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x060d1c) },
      horizonColor: { value: new THREE.Color(0x162947) },
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
        float h = clamp(normalize(vWorldPos).y * 1.35, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, pow(h, 0.78)), 1.0);
      }
    `,
  });
  arenaGroup.add(new THREE.Mesh(skyGeo, skyMat));
  disposables.push(skyGeo, skyMat);

  // Curved Panoramic Arena Backdrop displaying REAL Image 1 proportionally without distortion
  // Aspect ratio of image_9fa5f9b7.png ~ 2.33:1 -> arc length ~ 64u, height ~ 27.5u
  const backdropArcRadius = 38;
  const backdropArcAngle = Math.PI * 0.94;
  const backdropHeight = (backdropArcRadius * backdropArcAngle) / 2.33;
  const backdropGeo = new THREE.CylinderGeometry(
    backdropArcRadius,
    backdropArcRadius,
    backdropHeight,
    48,
    1,
    true,
    Math.PI - backdropArcAngle / 2,
    backdropArcAngle
  );
  // Flip UV horizontally on interior cylinder face so left/right match Image 1 naturally
  const bdUv = backdropGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < bdUv.count; i++) {
    bdUv.setX(i, 1 - bdUv.getX(i));
  }
  const backdropMesh = new THREE.Mesh(backdropGeo, palette.backdropMat);
  backdropMesh.position.y = backdropHeight * 0.42 - 1.2;
  arenaGroup.add(backdropMesh);
  disposables.push(backdropGeo);

  // 2. 8x8 Carrara White Marble & Black Obsidian Tiles (16 UV variants)
  const tileVariants: THREE.BoxGeometry[] = [];
  for (let v = 0; v < 16; v++) {
    const tg = createTileGeoVariant(v);
    tileVariants.push(tg);
    disposables.push(tg);
  }

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = indexToSquare(file, rank);
      const isDark = (file + rank) % 2 === 0;
      const variantIdx = (file * 7 + rank * 11) % 16;
      const tile = new THREE.Mesh(
        tileVariants[variantIdx],
        isDark ? palette.darkSquare : palette.lightSquare
      );
      tile.position.set((file - 3.5) * SQUARE_SIZE, -0.07, (3.5 - rank) * SQUARE_SIZE);
      tile.receiveShadow = true;
      tile.layers.enable(1);
      tile.userData.square = sq;
      arenaGroup.add(tile);
      squareMeshes.set(sq, tile);
    }
  }

  // 3. Beveled Weathered Travertine Stone Frame, Moss & Embossed Coordinates (A-H, 1-8)
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-4.68, -4.68);
  frameShape.lineTo(4.68, -4.68);
  frameShape.lineTo(4.68, 4.68);
  frameShape.lineTo(-4.68, 4.68);
  frameShape.closePath();
  const innerHole = new THREE.Path();
  innerHole.moveTo(-4.01, -4.01);
  innerHole.lineTo(4.01, -4.01);
  innerHole.lineTo(4.01, 4.01);
  innerHole.lineTo(-4.01, 4.01);
  innerHole.closePath();
  frameShape.holes.push(innerHole);

  const outerFrameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.045,
    bevelSegments: 3,
  });
  outerFrameGeo.rotateX(Math.PI / 2);
  const outerFrame = new THREE.Mesh(outerFrameGeo, palette.boardFrame);
  outerFrame.position.y = -0.015;
  outerFrame.receiveShadow = true;
  outerFrame.castShadow = true;
  arenaGroup.add(outerFrame);

  const subSlabGeo = new THREE.BoxGeometry(8.95, 0.26, 8.95);
  const subSlab = new THREE.Mesh(subSlabGeo, palette.boardFrame);
  subSlab.position.y = -0.22;
  subSlab.receiveShadow = true;
  arenaGroup.add(subSlab);

  const daisGeo = new THREE.BoxGeometry(9.92, 0.36, 9.92);
  const dais = new THREE.Mesh(daisGeo, palette.stoneRuins);
  dais.position.y = -0.5;
  dais.receiveShadow = true;
  arenaGroup.add(dais);
  disposables.push(outerFrameGeo, subSlabGeo, daisGeo);

  // Moss clumps nestled into weathered travertine border joints
  const mossGeo = new THREE.DodecahedronGeometry(0.15, 1);
  disposables.push(mossGeo);
  const mossSpots: [number, number, number, number][] = [
    [4.38, -0.01, 2.5, 1.3],
    [4.36, -0.01, -1.9, 1.1],
    [2.15, -0.01, 4.38, 1.35],
    [-2.75, -0.01, 4.36, 1.2],
    [-4.38, -0.01, 1.55, 1.15],
    [-4.36, -0.01, -2.9, 1.25],
    [1.65, -0.01, -4.38, 1.2],
    [-1.45, -0.01, -4.36, 1.05],
    [4.55, -0.32, 4.55, 1.7],
    [-4.55, -0.32, 4.55, 1.5],
  ];
  for (const [mx, my, mz, ms] of mossSpots) {
    const moss = new THREE.Mesh(mossGeo, palette.mossAccent);
    moss.position.set(mx, my, mz);
    moss.scale.set(ms * 1.4, 0.24, ms * 0.9);
    moss.rotation.y = mx * 0.7;
    arenaGroup.add(moss);
  }

  // Engraved Bronze Letters (A-H) & Numbers (1-8)
  const coordGroup = new THREE.Group();
  const labelGeo = new THREE.PlaneGeometry(0.36, 0.36);
  disposables.push(labelGeo);

  for (let i = 0; i < 8; i++) {
    const fileLabel = String.fromCharCode(65 + i);
    const fileTex = makeEngravedBronzeCoordTexture(fileLabel);
    const fileMat = new THREE.MeshBasicMaterial({ map: fileTex, transparent: true, depthWrite: false });
    disposables.push(fileTex, fileMat);

    const south = new THREE.Mesh(labelGeo, fileMat);
    south.rotation.x = -Math.PI / 2;
    south.position.set((i - 3.5) * SQUARE_SIZE, 0.035, 4.36);
    coordGroup.add(south);

    const north = new THREE.Mesh(labelGeo, fileMat);
    north.rotation.x = -Math.PI / 2;
    north.rotation.z = Math.PI;
    north.position.set((i - 3.5) * SQUARE_SIZE, 0.035, -4.36);
    coordGroup.add(north);

    const rankLabel = String(i + 1);
    const rankTex = makeEngravedBronzeCoordTexture(rankLabel);
    const rankMat = new THREE.MeshBasicMaterial({ map: rankTex, transparent: true, depthWrite: false });
    disposables.push(rankTex, rankMat);

    const west = new THREE.Mesh(labelGeo, rankMat);
    west.rotation.x = -Math.PI / 2;
    west.position.set(-4.36, 0.035, (3.5 - i) * SQUARE_SIZE);
    coordGroup.add(west);

    const east = new THREE.Mesh(labelGeo, rankMat);
    east.rotation.x = -Math.PI / 2;
    east.rotation.z = Math.PI;
    east.position.set(4.36, 0.035, (3.5 - i) * SQUARE_SIZE);
    coordGroup.add(east);
  }
  arenaGroup.add(coordGroup);

  // 4. Roman Fortress Courtyard Stone Floor
  const floorGeo = new THREE.CylinderGeometry(58, 58, 0.25, 48);
  const floor = new THREE.Mesh(floorGeo, palette.stoneArena);
  floor.position.y = -0.8;
  floor.receiveShadow = true;
  arenaGroup.add(floor);
  disposables.push(floorGeo);

  // 5. Starfield Overhead
  const starCount = quality === 'low' ? 380 : 1000;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.14 + Math.random() * Math.PI * 0.36;
    const r = 74 + Math.random() * 12;
    starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPositions[i * 3 + 1] = Math.sin(phi) * r + 2;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;

    const tint = Math.random();
    if (tint < 0.45) {
      starColors[i * 3] = 0.78;
      starColors[i * 3 + 1] = 0.89;
      starColors[i * 3 + 2] = 1.0;
    } else {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 0.96;
      starColors[i * 3 + 2] = 0.86;
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.32,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    fog: false,
    depthWrite: false,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  arenaGroup.add(starPoints);
  disposables.push(starGeo, starMat);

  // 6. Fluted Corinthian Columns (LatheGeometry base & capital), Waving Cloth Eagle Banners, & Braziers
  const banners: ClothBannerHandle[] = [];
  const flames: FireFlameHandle[] = [];
  const torchLights: THREE.PointLight[] = [];
  const fireOrigins: [number, number, number, number][] = [];

  const plinthGeo = new THREE.BoxGeometry(1.38, 0.38, 1.38);
  const colBaseLatheGeo = createCorinthianBaseGeo();
  const shaftGeo = new THREE.CylinderGeometry(0.42, 0.49, 6.2, 24);
  const capitalBellGeo = createCorinthianCapitalBellGeo();
  const acanthusGeo = new THREE.ConeGeometry(0.14, 0.36, 6);
  const voluteGeo = new THREE.TorusGeometry(0.11, 0.045, 8, 14);
  const abacusGeo = new THREE.BoxGeometry(1.52, 0.22, 1.52);
  const crossbarGeo = new THREE.CylinderGeometry(0.036, 0.036, 1.08, 10);

  const legGeo = new THREE.CylinderGeometry(0.025, 0.018, 1.36, 8);
  const ringGeo = new THREE.TorusGeometry(0.24, 0.022, 8, 16);
  const basketGeo = new THREE.CylinderGeometry(0.28, 0.14, 0.2, 12);

  const flameSpecs: { x: number; y: number; z: number; scaleW: number; scaleH: number; phase: number; heat: number }[] = [];
  const coalBedSpecs: { x: number; y: number; z: number; radiusX: number; radiusY: number; radiusZ: number }[] = [];

  // Legacy 2D sprite materials kept strictly for FLAME_V2=false rollback
  const flameOuterSpriteMat = new THREE.SpriteMaterial({
    map: palette.fireSpriteTex,
    color: new THREE.Color(2.2, 1.05, 0.32),
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameCoreSpriteMat = new THREE.SpriteMaterial({
    map: palette.fireSpriteTex,
    color: new THREE.Color(2.8, 2.2, 1.25),
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  disposables.push(
    plinthGeo,
    colBaseLatheGeo,
    shaftGeo,
    capitalBellGeo,
    acanthusGeo,
    voluteGeo,
    abacusGeo,
    crossbarGeo,
    legGeo,
    ringGeo,
    basketGeo,
    flameOuterSpriteMat,
    flameCoreSpriteMat
  );

  const addFireBillboard = (
    x: number,
    y: number,
    z: number,
    scaleW: number,
    scaleH: number,
    phase: number,
    heat = 1.0
  ) => {
    if (FLAME_V2) {
      flameSpecs.push({ x, y, z, scaleW, scaleH, phase, heat });
      return;
    }

    const outer = new THREE.Sprite(flameOuterSpriteMat);
    outer.position.set(x, y + scaleH * 0.42, z);
    outer.scale.set(scaleW, scaleH, 1);

    const core = new THREE.Sprite(flameCoreSpriteMat);
    core.position.set(x, y + scaleH * 0.32, z);
    core.scale.set(scaleW * 0.56, scaleH * 0.65, 1);

    arenaGroup.add(outer, core);
    flames.push({
      sprite: outer,
      coreSprite: core,
      basePos: new THREE.Vector3(x, y + scaleH * 0.42, z),
      baseScale: new THREE.Vector2(scaleW, scaleH),
      phase,
    });
  };

  const addTripodBrazier = (bx: number, bz: number, addLight: boolean, phase: number) => {
    const tripod = new THREE.Group();
    tripod.position.set(bx, -0.66, bz);

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
    tripod.add(midRing, basket);
    arenaGroup.add(tripod);

    addFireBillboard(bx, 0.64, bz, 0.72, 1.08, phase, 1.0);
    if (FLAME_V2) {
      coalBedSpecs.push({ x: bx, y: 0.65, z: bz, radiusX: 0.21, radiusY: 0.08, radiusZ: 0.21 });
    }
    fireOrigins.push([bx, 0.82, bz, 0.38]);

    if (addLight) {
      const torch = new THREE.PointLight(0xff8a3d, 8.5, 17, 1.45);
      torch.position.set(bx, 1.15, bz);
      arenaGroup.add(torch);
      torchLights.push(torch);
    }
  };

  // Symmetric colonnade matching Image 1: 3 White Crimson left columns + 3 Black Purple right columns + rear pair
  const columnPlacements: { x: number; z: number; side: 'w' | 'b'; hasLight: boolean }[] = [
    // Left flank (White Crimson banners)
    { x: -10.8, z: 4.5, side: 'w', hasLight: true },
    { x: -10.4, z: -2.2, side: 'w', hasLight: false },
    { x: -8.6, z: -8.6, side: 'w', hasLight: false },
    // Right flank (Black Royal Purple banners)
    { x: 10.8, z: 4.5, side: 'b', hasLight: true },
    { x: 10.4, z: -2.2, side: 'b', hasLight: false },
    { x: 8.6, z: -8.6, side: 'b', hasLight: false },
    // Rear flank framing backdrop (disabled on low quality to keep 6 pillars)
    ...(quality === 'low'
      ? []
      : [
          { x: -3.8, z: -12.2, side: 'w' as const, hasLight: false },
          { x: 3.8, z: -12.2, side: 'b' as const, hasLight: false },
        ]),
  ];

  columnPlacements.forEach((cp, idx) => {
    const colGroup = new THREE.Group();
    colGroup.position.set(cp.x, -0.7, cp.z);

    const plinth = new THREE.Mesh(plinthGeo, palette.boardFrame);
    plinth.position.y = 0.19;
    const baseMold = new THREE.Mesh(colBaseLatheGeo, palette.boardFrame);
    baseMold.position.y = 0.38;
    const shaft = new THREE.Mesh(shaftGeo, palette.stoneColumn);
    shaft.position.y = 3.9;
    shaft.castShadow = quality === 'high';
    shaft.receiveShadow = true;

    const capBell = new THREE.Mesh(capitalBellGeo, palette.boardFrame);
    capBell.position.y = 6.98;
    colGroup.add(plinth, baseMold, shaft, capBell);

    // Sculpted acanthus leaves & corner volutes on Corinthian capital
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const leaf = new THREE.Mesh(acanthusGeo, palette.boardFrame);
      leaf.position.set(Math.cos(ang) * 0.56, 7.26, Math.sin(ang) * 0.56);
      leaf.rotation.z = -Math.cos(ang) * 0.35;
      leaf.rotation.x = Math.sin(ang) * 0.35;
      colGroup.add(leaf);
    }
    for (let c = 0; c < 4; c++) {
      const ang = (c / 4) * Math.PI * 2 + Math.PI / 4;
      const vol = new THREE.Mesh(voluteGeo, palette.boardFrame);
      vol.position.set(Math.cos(ang) * 0.72, 7.64, Math.sin(ang) * 0.72);
      vol.rotation.y = ang;
      colGroup.add(vol);
    }

    const abacus = new THREE.Mesh(abacusGeo, palette.boardFrame);
    abacus.position.y = 7.82;
    colGroup.add(abacus);
    arenaGroup.add(colGroup);

    // Direction pointing inward toward board center
    const len = Math.hypot(cp.x, cp.z) || 1;
    const dirX = -cp.x / len;
    const dirZ = -cp.z / len;

    const bannerMat = cp.side === 'w' ? palette.whiteBanner : palette.blackBanner;
    const trimMat = cp.side === 'w' ? palette.whiteTrim : palette.blackTrim;

    const crossbar = new THREE.Mesh(crossbarGeo, trimMat);
    crossbar.position.set(cp.x + dirX * 0.66, 5.18, cp.z + dirZ * 0.66);
    crossbar.lookAt(0, 5.18, 0);
    crossbar.rotateZ(Math.PI / 2);
    arenaGroup.add(crossbar);

    // Unique cloth geometry per banner so sinusoidal wave vertex deformation runs independently
    const bGeo = createSubdividedClothBannerGeo(0.92, 2.38);
    disposables.push(bGeo);
    const banner = new THREE.Mesh(bGeo, bannerMat);
    banner.position.set(cp.x + dirX * 0.66, 3.96, cp.z + dirZ * 0.66);
    banner.lookAt(0, 3.96, 0);
    arenaGroup.add(banner);
    banners.push({
      mesh: banner,
      basePos: new Float32Array((bGeo.attributes.position as THREE.BufferAttribute).array),
      phase: idx * 0.85,
    });

    // Tripod brazier beside column
    if (idx < 6) {
      const bx = cp.x + dirX * 1.95;
      const bz = cp.z + dirZ * 1.95;
      addTripodBrazier(bx, bz, quality !== 'low' && cp.hasLight, idx * 1.3);
    }
  });

  // 7. Three Courtyard Campfires (matching Image 1 left, back-center, and right courtyard fires)
  const logGeo = new THREE.CylinderGeometry(0.085, 0.11, 1.5, 8);
  disposables.push(logGeo);
  const campfirePositions: [number, number, boolean][] = [
    [-7.9, -6.2, true],
    [0.4, -10.8, quality !== 'low'],
    [7.9, -6.2, false],
  ];
  campfirePositions.forEach(([cx, cz, hasLight], cIdx) => {
    const cg = new THREE.Group();
    cg.position.set(cx, -0.68, cz);
    for (let l = 0; l < 6; l++) {
      const a = (l / 6) * Math.PI * 2;
      const log = new THREE.Mesh(logGeo, palette.wood);
      log.position.set(Math.cos(a) * 0.28, 0.16, Math.sin(a) * 0.28);
      log.rotation.z = Math.cos(a) * 1.15;
      log.rotation.x = -Math.sin(a) * 1.15;
      cg.add(log);
    }
    arenaGroup.add(cg);

    addFireBillboard(cx, -0.58, cz, 1.55, 2.15, 2.2 + cIdx * 1.9, 1.15);
    if (FLAME_V2) {
      coalBedSpecs.push({ x: cx, y: -0.6, z: cz, radiusX: 0.48, radiusY: 0.14, radiusZ: 0.48 });
    }
    fireOrigins.push([cx, -0.1, cz, 0.78]);

    if (hasLight && quality !== 'low') {
      const fireLight = new THREE.PointLight(0xff8a3d, 13.5, 22, 1.4);
      fireLight.position.set(cx, 0.85, cz);
      arenaGroup.add(fireLight);
      torchLights.push(fireLight);
    }
  });

  // 8. Crenellated Ashlar Roman Fortress Bastions, Curtain Walls & Ruined Stones
  const bastionGeo = createFortressBastionGeometry(6.4, 4.5, 1.15);
  const curtainWallGeo = new THREE.BoxGeometry(4.8, 2.6, 0.85);
  const brokenColGeo = new THREE.CylinderGeometry(0.36, 0.42, 2.6, 16);
  const fallenBlockGeo = new THREE.BoxGeometry(1.35, 0.76, 0.96);
  disposables.push(bastionGeo, curtainWallGeo, brokenColGeo, fallenBlockGeo);

  const bastionCount = 8;
  for (let i = 0; i < bastionCount; i++) {
    const angle = (i / bastionCount) * Math.PI * 2;
    const r = 17.6;
    const wx = Math.cos(angle) * r;
    const wz = Math.sin(angle) * r;

    const wall = new THREE.Mesh(bastionGeo, palette.stoneRuins);
    wall.position.set(wx, -0.72, wz);
    wall.lookAt(0, -0.72, 0);
    wall.receiveShadow = true;
    arenaGroup.add(wall);

    if (i % 2 === 1) {
      const torchStick = new THREE.Mesh(legGeo, palette.brazierIron);
      torchStick.scale.set(0.9, 0.75, 0.9);
      torchStick.position.set(wx, 4.18, wz);
      arenaGroup.add(torchStick);
      addFireBillboard(wx, 4.45, wz, 0.65, 0.92, i * 1.1);
    }

    const midAngle = angle + Math.PI / bastionCount;
    const cw = new THREE.Mesh(curtainWallGeo, palette.stoneRuins);
    cw.position.set(Math.cos(midAngle) * (r + 1.35), 0.52, Math.sin(midAngle) * (r + 1.35));
    cw.lookAt(0, 0.52, 0);
    arenaGroup.add(cw);

    if (i % 2 === 0) {
      const brokenCol = new THREE.Mesh(brokenColGeo, palette.stoneColumn);
      brokenCol.position.set(wx * 0.76, 0.12, wz * 0.76);
      brokenCol.rotation.set(0.38, angle, -0.52);
      arenaGroup.add(brokenCol);

      const rubble = new THREE.Mesh(fallenBlockGeo, palette.stoneRuins);
      rubble.position.set(wx * 0.83, -0.44, wz * 0.83);
      rubble.rotation.set(0.12, angle + 0.5, 0.14);
      arenaGroup.add(rubble);
    }
  }

  // Foreground corner mossy ruins framing camera corners
  const cornerRuins: [number, number, number][] = [
    [-7.2, -0.45, 7.1],
    [7.4, -0.42, 6.9],
  ];
  cornerRuins.forEach(([rx, ry, rz], idx) => {
    const block = new THREE.Mesh(fallenBlockGeo, palette.stoneRuins);
    block.position.set(rx, ry, rz);
    block.rotation.set(0.08, idx === 0 ? 0.5 : -0.45, 0.06);
    arenaGroup.add(block);

    const moss = new THREE.Mesh(mossGeo, palette.mossAccent);
    moss.position.set(rx + 0.2, ry + 0.35, rz - 0.1);
    moss.scale.set(2.1, 0.35, 1.5);
    arenaGroup.add(moss);
  });

  // 9. Flame V2 Instanced Volumetric Flames + Glowing Coal Beds + GPU Embers + Subtle Smoke + Optional SpotLight
  let flameMat: THREE.ShaderMaterial | null = null;
  let coalMat: THREE.ShaderMaterial | null = null;
  let emberShaderMat: THREE.ShaderMaterial | null = null;
  let flameShadowLight: THREE.SpotLight | null = null;

  if (FLAME_V2 && flameSpecs.length > 0) {
    const flameGeo = createCrossedFlameGeo();
    flameMat = createVolumetricFlameShaderMaterial();
    const flameInst = new THREE.InstancedMesh(flameGeo, flameMat, flameSpecs.length);
    flameInst.frustumCulled = false;

    const phases = new Float32Array(flameSpecs.length);
    const scales = new Float32Array(flameSpecs.length * 2);
    const heats = new Float32Array(flameSpecs.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < flameSpecs.length; i++) {
      const fs = flameSpecs[i];
      dummy.position.set(fs.x, fs.y, fs.z);
      dummy.rotation.set(0, (i * 0.73) % (Math.PI * 2), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      flameInst.setMatrixAt(i, dummy.matrix);
      phases[i] = fs.phase;
      scales[i * 2] = fs.scaleW * 1.15;
      scales[i * 2 + 1] = fs.scaleH * 1.12;
      heats[i] = fs.heat;
    }
    flameInst.instanceMatrix.needsUpdate = true;
    flameGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    flameGeo.setAttribute('aFlameScale', new THREE.InstancedBufferAttribute(scales, 2));
    flameGeo.setAttribute('aHeat', new THREE.InstancedBufferAttribute(heats, 1));

    arenaGroup.add(flameInst);
    disposables.push(flameGeo, flameMat);

    if (coalBedSpecs.length > 0) {
      const coalGeo = new THREE.SphereGeometry(1, 14, 10);
      coalMat = createCoalBedShaderMaterial();
      const coalInst = new THREE.InstancedMesh(coalGeo, coalMat, coalBedSpecs.length);
      coalInst.frustumCulled = false;

      for (let i = 0; i < coalBedSpecs.length; i++) {
        const cs = coalBedSpecs[i];
        dummy.position.set(cs.x, cs.y, cs.z);
        dummy.rotation.set(0, i * 0.9, 0);
        dummy.scale.set(cs.radiusX, cs.radiusY, cs.radiusZ);
        dummy.updateMatrix();
        coalInst.setMatrixAt(i, dummy.matrix);
      }
      coalInst.instanceMatrix.needsUpdate = true;
      arenaGroup.add(coalInst);
      disposables.push(coalGeo, coalMat);
    }

    if (quality === 'high') {
      flameShadowLight = new THREE.SpotLight(0xff9244, 5.5, 20, Math.PI * 0.42, 0.75, 1.3);
      flameShadowLight.position.set(-7.9, 1.4, -6.2);
      flameShadowLight.target.position.set(-1.5, 0, -1.0);
      arenaGroup.add(flameShadowLight, flameShadowLight.target);
    }
  }

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
    const emberSeeds = new Float32Array(emberTotal);

    for (let b = 0; b < fireOrigins.length; b++) {
      const [bx, by, bz, spread] = fireOrigins[b];
      for (let k = 0; k < embersPerSource; k++) {
        const idx = b * embersPerSource + k;
        emberOrigins[idx * 3] = bx;
        emberOrigins[idx * 3 + 1] = by;
        emberOrigins[idx * 3 + 2] = bz;

        ePos[idx * 3] = bx + (Math.random() - 0.5) * spread;
        ePos[idx * 3 + 1] = by + Math.random() * 2.4;
        ePos[idx * 3 + 2] = bz + (Math.random() - 0.5) * spread;

        emberVelocities[idx * 3] = (Math.random() - 0.5) * 0.34;
        emberVelocities[idx * 3 + 1] = 0.72 + Math.random() * 1.15;
        emberVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 0.34;
        emberSeeds[idx] = Math.random() * 6.283;
      }
    }

    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    if (FLAME_V2) {
      eGeo.setAttribute('aOrigin', new THREE.BufferAttribute(emberOrigins, 3));
      eGeo.setAttribute('aVelocity', new THREE.BufferAttribute(emberVelocities, 3));
      eGeo.setAttribute('aSeed', new THREE.BufferAttribute(emberSeeds, 1));
      emberShaderMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEmberTex: { value: palette.emberTex },
        },
        vertexShader: `
          attribute vec3 aOrigin;
          attribute vec3 aVelocity;
          attribute float aSeed;
          uniform float uTime;
          varying float vLife;
          void main() {
            float period = 2.6 + fract(aSeed * 0.37) * 1.2;
            float t = mod(uTime + aSeed, period);
            float life = t / period;
            vLife = life;
            vec3 p = aOrigin;
            p.y += t * aVelocity.y;
            p.x += sin(uTime * 2.4 + aSeed * 3.1) * 0.24 * life + aVelocity.x * t;
            p.z += cos(uTime * 2.1 + aSeed * 2.7) * 0.24 * life + aVelocity.z * t;
            vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp(24.0 * (1.0 - life * 0.45) / max(1.0, -mvPos.z), 2.5, 11.0);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform sampler2D uEmberTex;
          varying float vLife;
          void main() {
            vec4 tex = texture2D(uEmberTex, gl_PointCoord);
            float alpha = tex.a * smoothstep(0.0, 0.14, vLife) * (1.0 - smoothstep(0.65, 1.0, vLife));
            if (alpha < 0.02) discard;
            vec3 col = mix(vec3(2.4, 1.35, 0.35), vec3(1.5, 0.35, 0.08), vLife);
            gl_FragColor = vec4(col * alpha, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      emberPoints = new THREE.Points(eGeo, emberShaderMat);
      emberPoints.frustumCulled = false;
      arenaGroup.add(emberPoints);
      disposables.push(eGeo, emberShaderMat);
    } else {
      const eMat = new THREE.PointsMaterial({
        map: palette.emberTex,
        color: 0xffb347,
        size: 0.18,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      emberPoints = new THREE.Points(eGeo, eMat);
      emberPoints.frustumCulled = false;
      arenaGroup.add(emberPoints);
      disposables.push(eGeo, eMat);
    }

    const mistCount = quality === 'high' ? 84 : 44;
    const mPos = new Float32Array(mistCount * 3);
    for (let i = 0; i < mistCount; i++) {
      if (FLAME_V2 && i < fireOrigins.length * 2) {
        const [bx, by, bz, sp] = fireOrigins[i % fireOrigins.length];
        mPos[i * 3] = bx + (Math.random() - 0.5) * sp;
        mPos[i * 3 + 1] = by + 1.2 + Math.random() * 2.1;
        mPos[i * 3 + 2] = bz + (Math.random() - 0.5) * sp;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const rad = 5.5 + Math.random() * 11.2;
        mPos[i * 3] = Math.cos(ang) * rad;
        mPos[i * 3 + 1] = -0.22 + Math.random() * 1.4;
        mPos[i * 3 + 2] = Math.sin(ang) * rad;
      }
    }
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    const mMat = new THREE.PointsMaterial({
      map: palette.smokeTex,
      color: 0xb8c2d6,
      size: FLAME_V2 ? 2.4 : 3.1,
      transparent: true,
      opacity: FLAME_V2 ? 0.08 : 0.16,
      depthWrite: false,
    });
    mistPoints = new THREE.Points(mGeo, mMat);
    arenaGroup.add(mistPoints);
    disposables.push(mGeo, mMat);
  }

  scene.add(arenaGroup);

  const updateFlames = (elapsed: number, dt: number, lowPerf = false) => {
    if (FLAME_V2) {
      if (flameMat) flameMat.uniforms.uTime.value = elapsed;
      if (coalMat) coalMat.uniforms.uTime.value = elapsed;
      if (emberShaderMat) emberShaderMat.uniforms.uTime.value = elapsed;
      if (flameShadowLight) {
        flameShadowLight.visible = !lowPerf;
        if (!lowPerf) {
          flameShadowLight.intensity = 5.2 + Math.sin(elapsed * 8.4) * 1.1 + Math.cos(elapsed * 14.1) * 0.5;
        }
      }
    } else {
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const n1 = Math.sin(elapsed * 11.5 + f.phase);
        const n2 = Math.cos(elapsed * 17.3 + f.phase * 1.4);
        const sx = 0.94 + n2 * 0.08;
        const sy = 0.96 + n1 * 0.14;
        f.sprite.scale.set(f.baseScale.x * sx, f.baseScale.y * sy, 1);
        f.sprite.position.x = f.basePos.x + n2 * 0.025;
        f.coreSprite.scale.set(f.baseScale.x * 0.56 * sx, f.baseScale.y * 0.65 * (0.95 + n1 * 0.1), 1);
      }

      if (emberPoints && emberVelocities && emberOrigins) {
        const posAttr = emberPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const dtClamped = Math.min(dt, 0.05);
        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          arr[ix] += (emberVelocities[ix] + Math.sin(elapsed * 2.5 + i) * 0.18) * dtClamped;
          arr[ix + 1] += emberVelocities[ix + 1] * dtClamped;
          arr[ix + 2] += (emberVelocities[ix + 2] + Math.cos(elapsed * 2.2 + i) * 0.18) * dtClamped;

          if (arr[ix + 1] > emberOrigins[ix + 1] + 2.8) {
            arr[ix] = emberOrigins[ix] + (Math.random() - 0.5) * 0.3;
            arr[ix + 1] = emberOrigins[ix + 1];
            arr[ix + 2] = emberOrigins[ix + 2] + (Math.random() - 0.5) * 0.3;
          }
        }
        posAttr.needsUpdate = true;
      }
    }

    // Organic layered-noise warm PointLight flicker + subtle temperature shift
    for (let i = 0; i < torchLights.length; i++) {
      const tl = torchLights[i];
      if (tl.userData.baseIntensity === undefined) {
        tl.userData.baseIntensity = tl.intensity;
      }
      const noise =
        Math.sin(elapsed * 7.1 + i * 2.3) * 0.5 +
        Math.sin(elapsed * 13.7 + i * 1.4) * 0.3 +
        Math.sin(elapsed * 21.3 + i * 0.8) * 0.2;
      tl.intensity = (tl.userData.baseIntensity as number) + noise * 1.45;
      if (FLAME_V2) {
        const temp = 0.5 + noise * 0.5;
        tl.color.setRGB(1.0, 0.48 + temp * 0.14, 0.15 + temp * 0.14);
      }
    }

    if (mistPoints) {
      mistPoints.rotation.y += dt * 0.014;
    }
  };

  return {
    arenaGroup,
    squareMeshes,
    coordGroup,
    banners,
    flames,
    torchLights,
    flameShadowLight,
    emberPoints,
    emberVelocities,
    emberOrigins,
    mistPoints,
    starPoints,
    updateFlames,
    dispose: () => {
      scene.remove(arenaGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
