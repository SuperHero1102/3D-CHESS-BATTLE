import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PieceColor, PieceSymbol } from '../types/chess';
import { MaterialPalette, getKingdomMaterials } from './materials';
import { CachedGlbTemplate, MODEL_CONFIG, getLoadedGlbTemplate } from './modelLoader';
import { buildKingV2 } from './kingBuilderV2';

export const PEDESTAL_HEIGHT = 0.088;

export type PieceNameOrSymbol = PieceSymbol | 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

export function normalizePieceSymbol(input: PieceNameOrSymbol): PieceSymbol {
  switch (input) {
    case 'pawn':
      return 'p';
    case 'rook':
      return 'r';
    case 'knight':
      return 'n';
    case 'bishop':
      return 'b';
    case 'queen':
      return 'q';
    case 'king':
      return 'k';
    default:
      return input;
  }
}

export interface ArticulatedJointRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvis: THREE.Group;
  spine?: THREE.Group;
  chest?: THREE.Group;
  torso: THREE.Group;
  neck?: THREE.Group;
  head: THREE.Group;
  shoulderL?: THREE.Group;
  shoulderR?: THREE.Group;
  elbowL?: THREE.Group;
  elbowR?: THREE.Group;
  handL?: THREE.Group;
  handR?: THREE.Group;
  hipL?: THREE.Group;
  hipR?: THREE.Group;
  kneeL?: THREE.Group;
  kneeR?: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cloak?: THREE.Group;
  cloakSeg1?: THREE.Group;
  cloakSeg2?: THREE.Group;
  cloakSeg3?: THREE.Group;
  cape?: THREE.Group;
  capeSegs: THREE.Group[];
  weapon?: THREE.Group;
  shield?: THREE.Group;
  horseBody?: THREE.Group;
  horseNeck?: THREE.Group;
  horseLegFL?: THREE.Group;
  horseLegFR?: THREE.Group;
  horseLegBL?: THREE.Group;
  horseLegBR?: THREE.Group;
  horseTail?: THREE.Group;
  crystalMesh?: THREE.Mesh;
  staffLight?: THREE.PointLight;
  auraMesh?: THREE.Mesh;
  baseHorsePitch?: number;
  selectableMeshes: THREE.Mesh[];
  neutralPose: () => void;
}

export interface WarriorRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvis: THREE.Group;
  spinePivot?: THREE.Group;
  torso: THREE.Group;
  neckPivot?: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForearmPivot: THREE.Group;
  rightForearmPivot: THREE.Group;
  leftHandPivot?: THREE.Group;
  rightHandPivot?: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftKneePivot?: THREE.Group;
  rightKneePivot?: THREE.Group;
  capePivot?: THREE.Group;
  capeSegs?: THREE.Group[];
  weaponPivot?: THREE.Group;
  shieldPivot?: THREE.Group;
  crystalMesh?: THREE.Mesh;
  auraMesh?: THREE.Mesh;
  staffLight?: THREE.PointLight;
  horseGroup?: THREE.Group;
  horseNeckPivot?: THREE.Group;
  horseLegs?: {
    fl: THREE.Group;
    fr: THREE.Group;
    bl: THREE.Group;
    br: THREE.Group;
  };
  horseTailPivot?: THREE.Group;
  baseHorsePitch?: number;
  headHeight: number;
  selectableMeshes: THREE.Mesh[];
  isGlb?: boolean;
  mixer?: THREE.AnimationMixer;
}

// ============================================================================
// SMOOTH PROCEDURAL GEOMETRY HELPERS (Lathe >= 32 segs, Extrude bevel >= 3)
// ============================================================================

function createSteppedPedestalLathe(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.39, 0.0),
    new THREE.Vector2(0.395, 0.014),
    new THREE.Vector2(0.382, 0.022),
    new THREE.Vector2(0.378, 0.044),
    new THREE.Vector2(0.345, 0.052),
    new THREE.Vector2(0.345, 0.078),
    new THREE.Vector2(0.325, PEDESTAL_HEIGHT),
    new THREE.Vector2(0.0, PEDESTAL_HEIGHT),
  ];
  return new THREE.LatheGeometry(pts, 36);
}

function createCuirassLathe(scaleX: number, height: number, feminine = false): THREE.LatheGeometry {
  const w = 0.135 * scaleX;
  const waist = feminine ? w * 0.72 : w * 0.82;
  const chest = feminine ? w * 1.06 : w * 1.12;
  const pts = [
    new THREE.Vector2(w * 0.88, 0.0),
    new THREE.Vector2(waist, height * 0.25),
    new THREE.Vector2(chest, height * 0.68),
    new THREE.Vector2(w * 0.96, height * 0.9),
    new THREE.Vector2(w * 0.56, height),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createTunicSkirtLathe(radiusTop: number, radiusBot: number, height: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(radiusBot, 0.0),
    new THREE.Vector2(radiusBot * 0.94, height * 0.45),
    new THREE.Vector2(radiusTop * 1.02, height * 0.85),
    new THREE.Vector2(radiusTop, height),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createDomeHelmLathe(r: number, h: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(r * 1.05, 0.0),
    new THREE.Vector2(r * 1.02, h * 0.14),
    new THREE.Vector2(r * 0.99, h * 0.55),
    new THREE.Vector2(r * 0.76, h * 0.86),
    new THREE.Vector2(r * 0.36, h * 0.98),
    new THREE.Vector2(0.0, h),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createGreaveLathe(h: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.036, 0.0),
    new THREE.Vector2(0.044, h * 0.32),
    new THREE.Vector2(0.052, h * 0.68),
    new THREE.Vector2(0.047, h * 0.94),
    new THREE.Vector2(0.054, h),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createBeveledStrapGeo(w: number, h: number, depth = 0.012): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w * 0.44, -h * 0.84);
  s.lineTo(0, -h);
  s.lineTo(-w * 0.44, -h * 0.84);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
}

function createCurvedScutumGeo(w: number, h: number, radius: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, 0.018, 12, 6, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = x / radius;
    const nx = Math.sin(angle) * (radius + z);
    const nz = Math.cos(angle) * (radius + z) - radius;
    pos.setX(i, nx);
    pos.setZ(i, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

function addPedestalWithEmblems(
  root: THREE.Group,
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  selectableMeshes: THREE.Mesh[]
) {
  const km = getKingdomMaterials(palette, color);

  const pedMesh = new THREE.Mesh(createSteppedPedestalLathe(), km.pedestal);
  pedMesh.castShadow = true;
  pedMesh.receiveShadow = true;
  pedMesh.name = 'pedestal_stone';
  root.add(pedMesh);
  selectableMeshes.push(pedMesh);

  const baseRim = new THREE.Mesh(new THREE.TorusGeometry(0.386, 0.012, 10, 36), km.trim);
  baseRim.rotation.x = Math.PI / 2;
  baseRim.position.y = 0.014;
  baseRim.name = 'pedestal_rim';
  root.add(baseRim);
  selectableMeshes.push(baseRim);

  // Stage 4: Embossed Front (+Z) & Back (-Z) Pedestal Medallions using sliced Image 7 icons
  const emblemMat = palette.getEmblemMaterial(color, type);
  const backingMat = color === 'w' ? palette.whiteBronze : palette.blackBronze;
  const medGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.014, 24);
  const faceGeo = new THREE.PlaneGeometry(0.076, 0.076);

  const frontMed = new THREE.Group();
  frontMed.position.set(0, 0.046, 0.368);
  frontMed.rotation.x = -0.16;
  const fDisc = new THREE.Mesh(medGeo, backingMat);
  fDisc.rotation.x = Math.PI / 2;
  const fFace = new THREE.Mesh(faceGeo, emblemMat);
  fFace.position.z = 0.009;
  frontMed.add(fDisc, fFace);
  frontMed.name = 'pedestal_emblem_front';

  const backMed = new THREE.Group();
  backMed.position.set(0, 0.046, -0.368);
  backMed.rotation.y = Math.PI;
  backMed.rotation.x = -0.16;
  const bDisc = new THREE.Mesh(medGeo, backingMat);
  bDisc.rotation.x = Math.PI / 2;
  const bFace = new THREE.Mesh(faceGeo, emblemMat);
  bFace.position.z = 0.009;
  backMed.add(bDisc, bFace);
  backMed.name = 'pedestal_emblem_back';

  root.add(frontMed, backMed);

  // Invisible generous click hitbox cylinder on layer 1 for effortless selection
  const hitGeo = new THREE.CylinderGeometry(0.41, 0.41, 1.25, 12);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = 0.62;
  hitMesh.layers.enable(1);
  hitMesh.userData.isPieceHit = true;
  hitMesh.userData.pieceRoot = root;
  root.add(hitMesh);
}

// ============================================================================
// WEAPONS, SHIELDS, CRESTS, LAUREL WREATHS & MULTI-SEGMENT CAPES
// ============================================================================

function createGladius(bladeMat: THREE.Material, hiltMat: THREE.Material, scale = 1): THREE.Group {
  const sword = new THREE.Group();
  sword.name = 'weapon_gladius';

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * scale, 0.015 * scale, 0.11 * scale, 12), hiltMat);
  grip.position.y = 0.03 * scale;

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.023 * scale, 12, 10), hiltMat);
  pommel.position.y = -0.028 * scale;

  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * scale, 0.038 * scale, 0.024 * scale, 14), hiltMat);
  guard.scale.set(1.65, 1, 0.72);
  guard.position.y = 0.088 * scale;

  const bw = 0.025 * scale;
  const bl = 0.42 * scale;
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-bw, 0);
  bladeShape.lineTo(bw, 0);
  bladeShape.lineTo(bw * 0.85, bl * 0.76);
  bladeShape.lineTo(0, bl);
  bladeShape.lineTo(-bw * 0.85, bl * 0.76);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.008 * scale,
    bevelEnabled: true,
    bevelThickness: 0.004 * scale,
    bevelSize: 0.003 * scale,
    bevelSegments: 3,
  });
  bladeGeo.translate(0, 0, -0.004 * scale);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.098 * scale;
  blade.castShadow = true;

  sword.add(grip, pommel, guard, blade);
  return sword;
}

function createScutumShield(
  scutumMat: THREE.Material,
  trimMat: THREE.Material,
  woodMat: THREE.Material
): THREE.Group {
  const shield = new THREE.Group();
  shield.name = 'shield_scutum';

  const w = 0.34;
  const h = 0.56;
  const curveR = 0.28;

  // Curved front textured panel using REAL Image 6
  const bodyGeo = createCurvedScutumGeo(w, h, curveR);
  const body = new THREE.Mesh(bodyGeo, scutumMat);
  body.castShadow = true;

  // Raised bronze central boss (umbo) + brass rim
  const bossRim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 10, 24), trimMat);
  bossRim.position.z = 0.015;
  const bossDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.056, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    trimMat
  );
  bossDome.rotation.x = Math.PI / 2;
  bossDome.position.z = 0.013;

  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.016, 0.024), trimMat);
  topTrim.position.y = h / 2;
  const botTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.016, 0.024), trimMat);
  botTrim.position.y = -h / 2;

  const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 10), woodMat);
  gripBar.position.z = -0.038;

  shield.add(body, bossRim, bossDome, topTrim, botTrim, gripBar);
  return shield;
}

function createTwoHandedWarhammer(headMat: THREE.Material, trimMat: THREE.Material, woodMat: THREE.Material): THREE.Group {
  const hammer = new THREE.Group();
  hammer.name = 'weapon_warhammer';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 1.02, 14), woodMat);
  shaft.position.y = 0.32;
  shaft.castShadow = true;

  const gripCollar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.06, 12), trimMat);
  gripCollar1.position.y = -0.02;
  const gripCollar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.06, 12), trimMat);
  gripCollar2.position.y = 0.34;
  const pommel = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 10), trimMat);
  pommel.rotation.x = Math.PI;
  pommel.position.y = -0.21;

  // Heavy beveled square block head matching Image 9
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.13, -0.075);
  headShape.lineTo(0.13, -0.075);
  headShape.lineTo(0.13, 0.075);
  headShape.lineTo(-0.13, 0.075);
  headShape.closePath();

  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 3,
  });
  headGeo.center();
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.78;
  head.castShadow = true;

  const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.175, 0.175), trimMat);
  band.position.y = 0.78;

  hammer.add(shaft, gripCollar1, gripCollar2, pommel, head, band);
  return hammer;
}

function createRookBackTower(stoneMat: THREE.Material, bannerMat: THREE.Material, leatherMat: THREE.Material, trimMat: THREE.Material): THREE.Group {
  const tower = new THREE.Group();
  tower.name = 'rook_watchtower';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.17), stoneMat);
  body.castShadow = true;

  // Crenellated top battlements
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.045, 0.2), stoneMat);
  rim.position.y = 0.205;
  tower.add(body, rim);

  for (let x = -1; x <= 1; x += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.06), stoneMat);
      merlon.position.set(x * 0.092, 0.255, z * 0.065);
      tower.add(merlon);
    }
  }
  const midFront = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.055), stoneMat);
  midFront.position.set(0, 0.255, -0.065);
  tower.add(midFront);

  // Dark recessed arrow slit & arched back gate
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.018), leatherMat);
  slit.position.set(0, 0.06, -0.088);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 12, 1, false, 0, Math.PI), leatherMat);
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.set(0, -0.1, -0.085);

  // Mini faction banner hanging down back of watchtower matching Image 9
  const miniBar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.15, 8), trimMat);
  miniBar.rotation.z = Math.PI / 2;
  miniBar.position.set(0, 0.17, -0.105);
  const miniBanner = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.24), bannerMat);
  miniBanner.position.set(0, 0.04, -0.106);

  tower.add(slit, arch, miniBar, miniBanner);
  return tower;
}

function createAugurSpiralStaff(
  trimMat: THREE.Material,
  crystalMat: THREE.Material,
  enablePointLight: boolean,
  accentHex: number
): { group: THREE.Group; crystal: THREE.Mesh; light?: THREE.PointLight } {
  const staff = new THREE.Group();
  staff.name = 'weapon_augur_staff';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.017, 1.18, 16), trimMat);
  shaft.position.y = 0.42;
  shaft.castShadow = true;

  // Spiral golden head curving around glowing crystal orb matching Image 11
  const spiralPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const ang = t * Math.PI * 1.95 - Math.PI * 0.5;
    const rad = 0.095 - t * 0.022;
    spiralPts.push(new THREE.Vector3(Math.cos(ang) * rad, 1.11 + Math.sin(ang) * rad, Math.sin(t * Math.PI) * 0.01));
  }
  const spiralGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 28, 0.013, 10, false);
  const spiralMesh = new THREE.Mesh(spiralGeo, trimMat);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.009, 8, 16), trimMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.0;

  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.052, 2), crystalMat);
  crystal.position.y = 1.11;
  crystal.name = 'augur_crystal_orb';

  staff.add(shaft, collar, spiralMesh, crystal);

  let light: THREE.PointLight | undefined;
  if (enablePointLight) {
    light = new THREE.PointLight(accentHex, 2.2, 2.8, 1.7);
    light.position.set(0, 1.11, 0.04);
    staff.add(light);
  }

  return { group: staff, crystal, light };
}

function createParchmentScroll(parchmentMat: THREE.Material, woodMat: THREE.Material): THREE.Group {
  const scroll = new THREE.Group();
  scroll.name = 'prop_scroll';

  const rollTop = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 12), parchmentMat);
  rollTop.rotation.z = Math.PI / 2;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.24, 10), woodMat);
  rod.rotation.z = Math.PI / 2;

  const sheetGeo = new THREE.PlaneGeometry(0.17, 0.21, 4, 8);
  const pos = sheetGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, Math.sin((y / 0.21) * Math.PI) * 0.018);
  }
  sheetGeo.computeVertexNormals();
  const sheet = new THREE.Mesh(sheetGeo, parchmentMat);
  sheet.position.set(0, -0.105, 0.012);

  scroll.add(rollTop, rod, sheet);
  return scroll;
}

function createBellonaSpear(woodMat: THREE.Material, trimMat: THREE.Material, spearTipMat: THREE.Material): THREE.Group {
  const spear = new THREE.Group();
  spear.name = 'weapon_bellona_spear';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 1.06, 14), woodMat);
  shaft.position.y = 0.44;
  shaft.castShadow = true;

  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 10), trimMat);
  butt.rotation.x = Math.PI;
  butt.position.y = -0.11;

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.017, 0.07, 12), trimMat);
  collar.position.y = 0.98;

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.quadraticCurveTo(0.036, 0.08, 0, 0.24);
  bladeShape.quadraticCurveTo(-0.036, 0.08, 0, 0);
  const tipGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
  tipGeo.translate(0, 0, -0.004);
  const tip = new THREE.Mesh(tipGeo, spearTipMat);
  tip.position.y = 1.01;

  spear.add(shaft, butt, collar, tip);
  return spear;
}

function createAquilaScepter(trimMat: THREE.Material, armorMat: THREE.Material): THREE.Group {
  const scepter = new THREE.Group();
  scepter.name = 'weapon_aquila_scepter';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 1.02, 16), trimMat);
  shaft.position.y = 0.44;
  shaft.castShadow = true;

  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 14), armorMat);
  globe.position.y = 0.98;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 8, 12), trimMat);
  body.position.y = 1.07;

  const eagleHead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), trimMat);
  eagleHead.position.set(0, 1.125, 0.012);

  // Sweeping extruded Aquila Eagle wings matching Image 13
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.09, 0.09, 0.16, 0.11);
  wingShape.quadraticCurveTo(0.11, 0.01, 0.04, -0.02);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  const rightWing = new THREE.Mesh(wingGeo, trimMat);
  rightWing.position.set(0.014, 1.08, -0.005);
  const leftWing = new THREE.Mesh(wingGeo, trimMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.014, 1.08, -0.005);

  scepter.add(shaft, globe, body, eagleHead, rightWing, leftWing);
  return scepter;
}

function createMultiSegmentCape(
  clothMat: THREE.Material,
  trimMat: THREE.Material | null,
  topW: number,
  botW: number,
  totalLen: number
): { pivot: THREE.Group; segs: THREE.Group[] } {
  const pivot = new THREE.Group();
  pivot.name = 'cape_root';

  const segCount = 3;
  const segLen = totalLen / segCount;
  const segs: THREE.Group[] = [];
  let parent: THREE.Group = pivot;

  for (let i = 0; i < segCount; i++) {
    const segGroup = new THREE.Group();
    segGroup.name = `cape_seg_${i + 1}`;
    if (i > 0) {
      segGroup.position.set(0, -segLen * 0.94, 0.004);
    }

    const w0 = THREE.MathUtils.lerp(topW, botW, i / segCount);
    const w1 = THREE.MathUtils.lerp(topW, botW, (i + 1) / segCount);
    const geo = new THREE.PlaneGeometry(1, segLen, 8, 4);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const u = pos.getX(k);
      const y = pos.getY(k);
      const frac = 0.5 - y / segLen; // 0 top -> 1 bottom
      const w = THREE.MathUtils.lerp(w0, w1, frac);
      pos.setX(k, u * w);
      pos.setZ(k, -Math.cos(u * Math.PI) * 0.042 + Math.sin(u * Math.PI * 3) * 0.012);
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, clothMat);
    mesh.position.y = -segLen * 0.5;
    mesh.castShadow = true;
    segGroup.add(mesh);

    if (trimMat && i === segCount - 1) {
      const hemTrim = new THREE.Mesh(new THREE.BoxGeometry(w1 * 0.96, 0.022, 0.012), trimMat);
      hemTrim.position.set(0, -segLen + 0.012, -0.02);
      segGroup.add(hemTrim);
    }

    parent.add(segGroup);
    segs.push(segGroup);
    parent = segGroup;
  }

  return { pivot, segs };
}

function createLaurelWreathInstanced(trimMat: THREE.Material, radius = 0.088): THREE.InstancedMesh {
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.018, 0.024, 0, 0.056);
  leafShape.quadraticCurveTo(-0.018, 0.024, 0, 0);
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 3,
  });

  const count = 20;
  const inst = new THREE.InstancedMesh(leafGeo, trimMat, count);
  inst.name = 'crown_laurel_instanced';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const side = i < 10 ? -1 : 1;
    const idx = i % 10;
    const frac = idx / 9;
    const ang = side * (0.14 + frac * 2.55);
    dummy.position.set(
      Math.sin(ang) * radius,
      0.012 + Math.cos(ang * 0.6) * 0.022,
      Math.cos(ang) * radius
    );
    dummy.rotation.set(0.38, ang, side * -0.45);
    dummy.scale.setScalar(0.88 + (1 - frac) * 0.22);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

// ============================================================================
// HUMAN 7.5-HEAD ARTICULATED WARRIOR BUILDER (p, r, b, q, k)
// ============================================================================

function buildArticulatedHumanoid(
  palette: MaterialPalette,
  color: PieceColor,
  type: Exclude<PieceSymbol, 'n'>,
  enablePointLights: boolean
): ArticulatedJointRig {
  const km = getKingdomMaterials(palette, color);
  const root = new THREE.Group();
  root.userData.color = color;
  root.userData.type = type;
  root.userData.modelVersion = 'v1';

  const selectableMeshes: THREE.Mesh[] = [];
  addPedestalWithEmblems(root, palette, color, type, selectableMeshes);

  // Strict 7.5-head scaling & height ladder: p < r < b < q < k
  const spec = {
    p: { scale: 0.9, broad: 1.0, feminine: false, heavyArmor: false, capeLen: 0.44, goldTrim: false },
    r: { scale: 0.98, broad: 1.24, feminine: false, heavyArmor: true, capeLen: 0, goldTrim: false },
    b: { scale: 1.13, broad: 0.94, feminine: false, heavyArmor: false, capeLen: 0.56, goldTrim: true },
    q: { scale: 1.2, broad: 0.88, feminine: true, heavyArmor: false, capeLen: 0.58, goldTrim: true },
    k: { scale: 1.28, broad: 1.08, feminine: false, heavyArmor: false, capeLen: 0.59, goldTrim: true },
  }[type];

  const S = spec.scale;
  const legLen = 0.36 * S;
  const torsoH = 0.27 * S;
  const shoulderW = 0.148 * S * spec.broad;

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  bodyGroup.rotation.y = color === 'w' ? Math.PI : 0;
  bodyGroup.name = 'bodyGroup';
  root.add(bodyGroup);

  const pelvis = new THREE.Group();
  pelvis.position.y = legLen;
  pelvis.name = 'pelvis';
  bodyGroup.add(pelvis);

  // --- LEGS (legL / legR) ---
  const buildLeg = (side: -1 | 1): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.068 * S, legLen, 0);
    legPivot.name = side < 0 ? 'legL' : 'legR';

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.039 * S, 0.12 * S, 6, 12), km.skin);
    thigh.position.y = -0.095 * S;
    thigh.castShadow = true;

    const greaveMat = type === 'p' ? km.skin : type === 'k' ? km.trim : km.armor;
    const greave = new THREE.Mesh(createGreaveLathe(0.18 * S), greaveMat);
    greave.scale.setScalar(S);
    greave.position.y = -0.315 * S;
    greave.castShadow = true;

    const kneePad = new THREE.Mesh(
      new THREE.SphereGeometry(0.041 * S, 12, 10),
      type === 'p' ? km.leather : km.trim
    );
    kneePad.position.set(0, -0.17 * S, 0.022 * S);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.072 * S, 0.044 * S, 0.125 * S),
      type === 'r' ? km.armor : km.leather
    );
    boot.position.set(0, -0.338 * S, 0.024 * S);
    boot.castShadow = true;

    legPivot.add(thigh, greave, kneePad, boot);
    selectableMeshes.push(thigh, greave, boot);
    return legPivot;
  };

  const legL = buildLeg(-1);
  const legR = buildLeg(1);
  bodyGroup.add(legL, legR);

  // --- TUNIC / ROBE / PTERUGES ON PELVIS ---
  if (type === 'b') {
    // Bishop: Floor-length priestly crimson/purple robe (Image 11)
    const robe = new THREE.Mesh(
      createTunicSkirtLathe(0.118 * S, 0.185 * S, 0.36 * S),
      km.cloth
    );
    robe.position.y = -0.345 * S;
    robe.castShadow = true;
    const goldHem = new THREE.Mesh(new THREE.TorusGeometry(0.184 * S, 0.011 * S, 8, 32), km.trim);
    goldHem.rotation.x = Math.PI / 2;
    goldHem.position.y = -0.342 * S;
    pelvis.add(robe, goldHem);
    selectableMeshes.push(robe, goldHem);
  } else {
    const skirt = new THREE.Mesh(
      createTunicSkirtLathe(0.112 * S * spec.broad, 0.148 * S * spec.broad, 0.19 * S),
      km.cloth
    );
    skirt.position.y = -0.175 * S;
    skirt.castShadow = true;
    pelvis.add(skirt);
    selectableMeshes.push(skirt);

    // Beveled Pteruges leather/armored strips around waist
    const strapGeo = createBeveledStrapGeo(0.036 * S, 0.155 * S, 0.01 * S);
    const strapMat = type === 'r' ? km.armor : km.leather;
    const stripCount = 10;
    for (let i = 0; i < stripCount; i++) {
      const ang = (i / stripCount) * Math.PI * 2;
      const strip = new THREE.Mesh(strapGeo, strapMat);
      strip.position.set(Math.sin(ang) * 0.115 * S * spec.broad, -0.005 * S, Math.cos(ang) * 0.095 * S);
      strip.rotation.y = ang;
      strip.rotation.x = -0.12;
      pelvis.add(strip);
    }
  }

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.115 * S * spec.broad, 0.016 * S, 10, 28),
    type === 'k' || type === 'q' ? km.trim : km.leather
  );
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.85, 1);
  belt.position.y = 0.008 * S;
  pelvis.add(belt);

  // --- TORSO ---
  const torso = new THREE.Group();
  torso.position.y = 0.02 * S;
  torso.name = 'torso';
  pelvis.add(torso);

  const armorMat =
    type === 'k'
      ? km.trim
      : type === 'b'
      ? km.cloth
      : km.armor;

  const cuirass = new THREE.Mesh(
    createCuirassLathe(spec.broad * S, torsoH, spec.feminine),
    armorMat
  );
  cuirass.scale.set(1, 1, 0.78);
  cuirass.castShadow = true;
  torso.add(cuirass);
  selectableMeshes.push(cuirass);

  // Sculpted pectoral chest plates / priest stoles
  if (type === 'b') {
    for (const side of [-1, 1]) {
      const stole = new THREE.Mesh(new THREE.BoxGeometry(0.036 * S, 0.44 * S, 0.016 * S), km.trim);
      stole.position.set(side * 0.055 * S, -0.06 * S, 0.096 * S);
      torso.add(stole);
    }
    const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * S, 0.028 * S, 0.016 * S, 16), km.trim);
    medallion.rotation.x = Math.PI / 2;
    medallion.position.set(0, 0.14 * S, 0.11 * S);
    torso.add(medallion);
  } else {
    for (const side of [-1, 1]) {
      const pec = new THREE.Mesh(
        new THREE.SphereGeometry(0.056 * S * spec.broad, 16, 12),
        type === 'k' ? km.trim : type === 'q' ? km.armor : km.bronze
      );
      pec.scale.set(1.05, 0.88, 0.56);
      pec.position.set(side * 0.056 * S * spec.broad, 0.165 * S, 0.072 * S);
      torso.add(pec);
    }
    // Pawn cross-chest leather strap (Image 8)
    if (type === 'p') {
      const baldric = new THREE.Mesh(new THREE.BoxGeometry(0.026 * S, 0.28 * S, 0.175 * S), km.leather);
      baldric.position.set(0, 0.13 * S, 0);
      baldric.rotation.z = -0.62;
      torso.add(baldric);
    }
    // King chest gemstone accents (Image 13)
    if (type === 'k') {
      for (let g = -1; g <= 1; g++) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.014 * S, 0), km.crystal);
        gem.position.set(g * 0.042 * S, 0.02 * S, 0.105 * S);
        torso.add(gem);
      }
    }
  }

  // Pauldrons (heavy multi-plate on Rook, segmented lorica on Pawn, sculpted trim on others)
  for (const side of [-1, 1]) {
    const tiers = type === 'r' ? 3 : type === 'p' ? 2 : 1;
    for (let t = 0; t < tiers; t++) {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry((0.064 + t * 0.008) * S * (type === 'r' ? 1.2 : 1), 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
        type === 'q' || type === 'k' || type === 'b' ? km.trim : km.armor
      );
      pauldron.position.set(side * (shoulderW + 0.015 * S), (0.23 - t * 0.032) * S, 0);
      pauldron.rotation.z = -side * (0.35 + t * 0.12);
      pauldron.castShadow = true;
      torso.add(pauldron);
    }
  }

  // Rook back miniature stone watchtower (Image 9)
  if (type === 'r') {
    const tower = createRookBackTower(palette.stoneRuins, km.banner, km.leather, km.trim);
    tower.scale.setScalar(S * 0.8);
    tower.position.set(0, 0.14 * S, -0.155 * S);
    torso.add(tower);
  }

  // King left-hip sheathed sword (Image 13)
  if (type === 'k') {
    const scabbard = createGladius(km.leather, km.trim, 0.58 * S);
    scabbard.position.set(-0.125 * S, 0.03 * S, 0.02 * S);
    scabbard.rotation.set(Math.PI * 0.68, 0, 0.22);
    pelvis.add(scabbard);
  }

  // Multi-segment billowing Cape
  let cape: THREE.Group | undefined;
  let capeSegs: THREE.Group[] = [];
  if (spec.capeLen > 0) {
    const cp = createMultiSegmentCape(
      km.cloth,
      spec.goldTrim ? km.trim : null,
      0.21 * S,
      0.34 * S,
      spec.capeLen * S
    );
    cp.pivot.position.set(0, 0.235 * S, -0.095 * S);
    torso.add(cp.pivot);
    cape = cp.pivot;
    capeSegs = cp.segs;
  }

  // --- HEAD & HELMET / CROWN ---
  const head = new THREE.Group();
  head.position.y = torsoH + 0.015 * S;
  head.name = 'head';
  torso.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * S, 0.044 * S, 0.06 * S, 16), km.skin);
  neck.position.y = 0.025 * S;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.072 * S, 24, 18), km.skin);
  face.scale.set(0.92, 1.14, 0.98);
  face.position.y = 0.095 * S;
  face.castShadow = true;
  head.add(neck, face);
  selectableMeshes.push(face);

  if (type === 'p') {
    // Smooth bronze crestless Galea helmet with cheek guards (Image 8)
    const helm = new THREE.Mesh(createDomeHelmLathe(0.076 * S, 0.095 * S), km.bronze);
    helm.position.y = 0.1 * S;
    helm.castShadow = true;
    const neckGuard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088 * S, 0.098 * S, 0.024 * S, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7),
      km.bronze
    );
    neckGuard.position.y = 0.092 * S;
    head.add(helm, neckGuard);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.014 * S, 0.065 * S, 0.048 * S), km.bronze);
      cheek.position.set(side * 0.064 * S, 0.075 * S, 0.02 * S);
      head.add(cheek);
    }
  } else if (type === 'r') {
    // Heavy closed visored steel helm with crest (Image 9)
    const helm = new THREE.Mesh(createDomeHelmLathe(0.084 * S, 0.11 * S), km.armor);
    helm.position.y = 0.096 * S;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.078 * S, 0.07 * S, 0.082 * S, 20, 1, false, -0.9, 1.8), km.armor);
    visor.position.y = 0.088 * S;
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.082 * S, 0.016 * S, 8, 20, Math.PI * 0.85), km.cloth);
    crest.rotation.y = Math.PI / 2;
    crest.position.set(0, 0.16 * S, -0.01 * S);
    head.add(helm, visor, crest);
  } else if (type === 'b') {
    // Bearded Elder under Hood + Golden Laurel Crown (Image 11)
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.052 * S, 0.095 * S, 12), palette.stoneColumn);
    beard.rotation.x = Math.PI;
    beard.position.set(0, 0.042 * S, 0.046 * S);
    const hood = new THREE.Mesh(createDomeHelmLathe(0.086 * S, 0.115 * S), km.cloth);
    hood.position.y = 0.09 * S;
    const laurel = createLaurelWreathInstanced(km.trim, 0.086 * S);
    laurel.position.y = 0.145 * S;
    head.add(beard, hood, laurel);
  } else if (type === 'q') {
    // Bellona: Braided Hair + InstancedMesh Golden Laurel Wreath Crown (Image 12)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.075 * S, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.66),
      palette.wood
    );
    hair.position.set(0, 0.11 * S, -0.008 * S);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.036 * S, 12, 10), palette.wood);
    bun.position.set(0, 0.09 * S, -0.072 * S);
    const laurel = createLaurelWreathInstanced(km.trim, 0.082 * S);
    laurel.position.y = 0.14 * S;
    head.add(hair, bun, laurel);
  } else if (type === 'k') {
    // Emperor: Golden Spiked Radiate Crown + Imperial Crest (Image 13)
    const helm = new THREE.Mesh(createDomeHelmLathe(0.078 * S, 0.1 * S), km.trim);
    helm.position.y = 0.1 * S;
    const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.082 * S, 0.078 * S, 0.034 * S, 24), km.trim);
    crownBand.position.y = 0.155 * S;
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.078 * S, 0.015 * S, 8, 20, Math.PI * 0.78), km.cloth);
    crest.rotation.y = Math.PI / 2;
    crest.position.set(0, 0.165 * S, -0.012 * S);
    head.add(helm, crownBand, crest);

    const spikeGeo = new THREE.ConeGeometry(0.011 * S, 0.095 * S, 8);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeo, km.trim);
      spike.position.set(Math.sin(ang) * 0.074 * S, 0.205 * S, Math.cos(ang) * 0.074 * S);
      spike.rotation.z = -Math.sin(ang) * 0.25;
      spike.rotation.x = Math.cos(ang) * 0.25;
      head.add(spike);
    }
  }

  // --- ARMS & FOREARMS (armL -> forearmL, armR -> forearmR) ---
  const buildArm = (side: -1 | 1): { arm: THREE.Group; forearm: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set(side * (shoulderW + 0.025 * S), 0.22 * S, 0);
    arm.name = side < 0 ? 'armL' : 'armR';

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * S, 0.036 * S, 0.09 * S, 12), km.cloth);
    sleeve.position.y = -0.045 * S;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.029 * S, 0.11 * S, 6, 12), km.skin);
    upperArm.position.y = -0.105 * S;
    upperArm.castShadow = true;

    const forearm = new THREE.Group();
    forearm.position.y = -0.19 * S;
    forearm.name = side < 0 ? 'forearmL' : 'forearmR';

    const bracerMat = type === 'p' ? km.skin : type === 'k' ? km.trim : km.armor;
    const lowerArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.025 * S, 0.11 * S, 6, 12), bracerMat);
    lowerArm.position.y = -0.075 * S;
    lowerArm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.026 * S, 10, 8), km.skin);
    hand.position.y = -0.155 * S;

    forearm.add(lowerArm, hand);
    arm.add(sleeve, upperArm, forearm);
    torso.add(arm);
    selectableMeshes.push(upperArm, lowerArm);
    return { arm, forearm };
  };

  const left = buildArm(-1);
  const right = buildArm(1);

  // --- WEAPONS & SHIELDS ---
  let weapon = new THREE.Group();
  let shield: THREE.Group | undefined;
  let crystalMesh: THREE.Mesh | undefined;
  let staffLight: THREE.PointLight | undefined;
  let auraMesh: THREE.Mesh | undefined;

  if (type === 'p') {
    weapon = createGladius(km.blade, km.trim, 0.92 * S);
    weapon.position.set(0, -0.15 * S, 0.01 * S);
    weapon.rotation.x = Math.PI * 0.45;
    right.forearm.add(weapon);

    shield = createScutumShield(km.scutum, km.trim, palette.wood);
    shield.scale.setScalar(S);
    shield.position.set(-0.045 * S, -0.08 * S, 0.045 * S);
    shield.rotation.y = -Math.PI * 0.42;
    left.forearm.add(shield);
  } else if (type === 'r') {
    weapon = createTwoHandedWarhammer(km.armor, km.trim, palette.wood);
    weapon.scale.setScalar(S * 0.88);
    weapon.position.set(-0.02 * S, -0.16 * S, 0.04 * S);
    weapon.rotation.set(0.32, 0.18, 1.05);
    right.forearm.add(weapon);
  } else if (type === 'b') {
    const staffObj = createAugurSpiralStaff(km.trim, km.crystal, enablePointLights, km.accentHex);
    weapon = staffObj.group;
    weapon.scale.setScalar(S * 0.68);
    weapon.position.set(0.01 * S, -0.15 * S, 0.025 * S);
    weapon.rotation.x = 0.92;
    right.forearm.add(weapon);
    crystalMesh = staffObj.crystal;
    staffLight = staffObj.light;

    shield = createParchmentScroll(palette.parchment, palette.wood);
    shield.scale.setScalar(S);
    shield.position.set(0.01 * S, -0.14 * S, 0.03 * S);
    shield.rotation.set(0.3, 0.25, 0.15);
    left.forearm.add(shield);
  } else if (type === 'q') {
    weapon = createBellonaSpear(palette.wood, km.trim, palette.goldSpearGlow);
    weapon.scale.setScalar(S * 0.68);
    weapon.position.set(0.01 * S, -0.15 * S, 0.02 * S);
    weapon.rotation.x = 0.96;
    right.forearm.add(weapon);

    const auraGeo = new THREE.RingGeometry(0.06, 0.085, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: km.accentHex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.set(0, 1.09, 0.01);
    weapon.add(auraMesh);
  } else if (type === 'k') {
    weapon = createAquilaScepter(km.trim, km.armor);
    weapon.scale.setScalar(S * 0.72);
    weapon.position.set(0.01 * S, -0.15 * S, 0.02 * S);
    weapon.rotation.x = 0.94;
    right.forearm.add(weapon);
  }

  const neutralPose = () => {
    bodyGroup.position.set(0, PEDESTAL_HEIGHT, 0);
    bodyGroup.rotation.set(0, color === 'w' ? Math.PI : 0, 0);
    pelvis.position.set(0, legLen, 0);
    pelvis.rotation.set(0, 0, 0);
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);

    if (type === 'p') {
      right.arm.rotation.set(-0.22, 0, -0.14);
      right.forearm.rotation.set(-0.35, 0, 0);
      left.arm.rotation.set(-0.32, 0.18, 0.16);
      left.forearm.rotation.set(-0.62, 0.15, 0);
    } else if (type === 'r') {
      right.arm.rotation.set(-0.42, 0.15, -0.18);
      right.forearm.rotation.set(-0.68, 0.12, 0.25);
      left.arm.rotation.set(-0.56, -0.25, 0.22);
      left.forearm.rotation.set(-0.78, -0.32, -0.28);
    } else if (type === 'b') {
      right.arm.rotation.set(-0.28, 0, -0.12);
      right.forearm.rotation.set(-0.72, 0, 0);
      left.arm.rotation.set(-0.34, 0.12, 0.14);
      left.forearm.rotation.set(-0.65, 0.18, 0);
    } else if (type === 'q') {
      right.arm.rotation.set(-0.26, 0, -0.16);
      right.forearm.rotation.set(-0.78, 0, 0);
      left.arm.rotation.set(0.06, 0, 0.24);
      left.forearm.rotation.set(-0.18, 0, 0);
    } else {
      // King (Image 13): right holds Aquila upright, left rests on hip sword hilt
      right.arm.rotation.set(-0.24, 0, -0.14);
      right.forearm.rotation.set(-0.78, 0, 0);
      left.arm.rotation.set(0.08, 0.12, 0.22);
      left.forearm.rotation.set(-0.68, -0.3, -0.18);
    }

    for (const seg of capeSegs) {
      seg.rotation.set(0.06, 0, 0);
    }
  };

  neutralPose();

  const rigData: ArticulatedJointRig = {
    root,
    bodyGroup,
    pelvis,
    torso,
    head,
    armL: left.arm,
    armR: right.arm,
    forearmL: left.forearm,
    forearmR: right.forearm,
    legL,
    legR,
    cape,
    capeSegs,
    weapon,
    shield,
    crystalMesh,
    staffLight,
    auraMesh,
    selectableMeshes,
    neutralPose,
  };
  root.userData.rig = rigData;
  return rigData;
}

// ============================================================================
// ARTICULATED REARING EQUITES CAVALRY (n — Image 10)
// ============================================================================

function buildArticulatedKnight(
  palette: MaterialPalette,
  color: PieceColor
): ArticulatedJointRig {
  const km = getKingdomMaterials(palette, color);
  const root = new THREE.Group();
  root.userData.color = color;
  root.userData.type = 'n';
  root.userData.modelVersion = 'v1';

  const selectableMeshes: THREE.Mesh[] = [];
  addPedestalWithEmblems(root, palette, color, 'n', selectableMeshes);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  bodyGroup.rotation.y = color === 'w' ? Math.PI : 0;
  bodyGroup.name = 'bodyGroup';
  root.add(bodyGroup);

  const BASE_PITCH = -0.44; // ~25 deg heroic rearing pose (Image 10)
  const horseBody = new THREE.Group();
  horseBody.position.set(0, 0.42, -0.06);
  horseBody.rotation.x = BASE_PITCH;
  horseBody.name = 'horseBody';
  bodyGroup.add(horseBody);

  // Muscular anatomical horse barrel & haunches
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.112, 0.34, 8, 18), km.horse);
  barrel.rotation.x = Math.PI / 2;
  barrel.scale.set(0.95, 1.05, 1.0);
  barrel.castShadow = true;

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.122, 18, 14), km.horse);
  chest.position.set(0, 0.02, 0.16);
  chest.scale.set(0.92, 1.08, 1.08);
  chest.castShadow = true;

  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), km.horse);
  haunch.position.set(0, 0.01, -0.17);
  haunch.scale.set(0.95, 1.05, 1.06);
  haunch.castShadow = true;

  // Segmented metal pectoral chest barding (Image 10)
  for (let b = 0; b < 3; b++) {
    const plate = new THREE.Mesh(
      new THREE.TorusGeometry(0.118 - b * 0.01, 0.013, 8, 20, Math.PI * 1.1),
      km.armor
    );
    plate.rotation.y = Math.PI;
    plate.rotation.x = 0.65;
    plate.position.set(0, 0.02 - b * 0.028, 0.185 - b * 0.006);
    horseBody.add(plate);
  }

  // Crimson/Purple saddle & caparison blanket
  const saddleCloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.25), km.cloth);
  saddleCloth.position.set(0, 0.065, -0.02);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.2), km.leather);
  saddle.position.set(0, 0.125, -0.02);

  horseBody.add(barrel, chest, haunch, saddleCloth, saddle);
  selectableMeshes.push(barrel, chest, haunch);

  // Articulated Horse Neck & Head
  const horseNeck = new THREE.Group();
  horseNeck.position.set(0, 0.08, 0.22);
  horseNeck.name = 'horseNeck';
  horseBody.add(horseNeck);

  const neckCyl = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.19, 8, 14), km.horse);
  neckCyl.position.set(0, 0.12, 0.04);
  neckCyl.rotation.x = 0.42;
  neckCyl.castShadow = true;

  const horseHead = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.15, 8, 14), km.horse);
  horseHead.position.set(0, 0.22, 0.13);
  horseHead.rotation.x = 1.98;
  horseHead.castShadow = true;

  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.22, 0.045), palette.brazierIron);
  mane.position.set(0, 0.15, -0.02);
  mane.rotation.x = 0.45;

  const earGeo = new THREE.ConeGeometry(0.014, 0.052, 6);
  const earL = new THREE.Mesh(earGeo, km.horse);
  earL.position.set(-0.026, 0.295, 0.08);
  const earR = new THREE.Mesh(earGeo, km.horse);
  earR.position.set(0.026, 0.295, 0.08);

  const bridle = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 16), km.leather);
  bridle.position.set(0, 0.185, 0.185);
  bridle.rotation.x = 0.4;

  horseNeck.add(neckCyl, horseHead, mane, earL, earR, bridle);

  // Articulated Horse Tail
  const horseTail = new THREE.Group();
  horseTail.position.set(0, 0.06, -0.27);
  horseTail.name = 'horseTail';
  const tailHair = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.34, 10), palette.brazierIron);
  tailHair.position.set(0, -0.15, -0.05);
  tailHair.rotation.x = 0.32;
  horseTail.add(tailHair);
  horseBody.add(horseTail);

  // 4 Articulated Horse Legs
  const buildHorseLeg = (x: number, y: number, z: number, name: string): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(x, y, z);
    leg.name = name;

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.15, 6, 10), km.horse);
    upper.position.y = -0.085;
    upper.castShadow = true;

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.15, 6, 10), km.horse);
    lower.position.set(0, -0.24, 0.02);
    lower.rotation.x = 0.28;
    lower.castShadow = true;

    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.031, 0.036, 12), palette.brazierIron);
    hoof.position.set(0, -0.33, 0.045);

    leg.add(upper, lower, hoof);
    horseBody.add(leg);
    return leg;
  };

  const horseLegFL = buildHorseLeg(-0.078, -0.04, 0.18, 'horseLegFL');
  const horseLegFR = buildHorseLeg(0.078, -0.04, 0.18, 'horseLegFR');
  const horseLegBL = buildHorseLeg(-0.082, -0.04, -0.18, 'horseLegBL');
  const horseLegBR = buildHorseLeg(0.082, -0.04, -0.18, 'horseLegBR');

  // --- MOUNTED ROMAN EQUITES RIDER ---
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.135, -0.015);
  pelvis.rotation.x = -BASE_PITCH * 0.72; // rider sits upright counter-balancing rearing horse
  pelvis.name = 'pelvis';
  horseBody.add(pelvis);

  const tunicSkirt = new THREE.Mesh(createTunicSkirtLathe(0.095, 0.125, 0.13), km.cloth);
  tunicSkirt.position.y = -0.1;
  pelvis.add(tunicSkirt);

  const legL = new THREE.Group();
  legL.position.set(-0.085, 0.01, 0.02);
  legL.name = 'legL';
  const rThighL = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, 0.11, 6, 10), km.skin);
  rThighL.position.y = -0.07;
  const rGreaveL = new THREE.Mesh(createGreaveLathe(0.15), km.trim);
  rGreaveL.position.y = -0.22;
  legL.add(rThighL, rGreaveL);

  const legR = new THREE.Group();
  legR.position.set(0.085, 0.01, 0.02);
  legR.name = 'legR';
  const rThighR = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, 0.11, 6, 10), km.skin);
  rThighR.position.y = -0.07;
  const rGreaveR = new THREE.Mesh(createGreaveLathe(0.15), km.trim);
  rGreaveR.position.y = -0.22;
  legR.add(rThighR, rGreaveR);
  pelvis.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 0.02;
  torso.name = 'torso';
  pelvis.add(torso);

  const cuirass = new THREE.Mesh(createCuirassLathe(0.86, 0.24, false), km.bronze);
  cuirass.scale.set(1, 1, 0.78);
  cuirass.castShadow = true;
  torso.add(cuirass);
  selectableMeshes.push(cuirass);

  for (const side of [-1, 1]) {
    const pld = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), km.armor);
    pld.position.set(side * 0.115, 0.21, 0);
    pld.rotation.z = -side * 0.35;
    torso.add(pld);
  }

  const cp = createMultiSegmentCape(km.cloth, null, 0.18, 0.3, 0.44);
  cp.pivot.position.set(0, 0.21, -0.085);
  torso.add(cp.pivot);

  const head = new THREE.Group();
  head.position.y = 0.25;
  head.name = 'head';
  torso.add(head);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 14), km.skin);
  face.scale.set(0.92, 1.14, 0.98);
  face.position.y = 0.078;
  const helm = new THREE.Mesh(createDomeHelmLathe(0.066, 0.084), km.armor);
  helm.position.y = 0.082;
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.015, 8, 20, Math.PI * 0.85), km.cloth);
  crest.rotation.y = Math.PI / 2;
  crest.position.set(0, 0.135, -0.008);
  head.add(face, helm, crest);

  // Rider Arms
  const buildRiderArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.125, 0.2, 0);
    arm.name = side < 0 ? 'armL' : 'armR';
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.095, 6, 10), km.skin);
    upper.position.y = -0.075;
    const forearm = new THREE.Group();
    forearm.position.y = -0.15;
    forearm.name = side < 0 ? 'forearmL' : 'forearmR';
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.09, 6, 10), km.trim);
    lower.position.y = -0.06;
    forearm.add(lower);
    arm.add(upper, forearm);
    torso.add(arm);
    return { arm, forearm };
  };

  const left = buildRiderArm(-1);
  const right = buildRiderArm(1);

  const spear = createBellonaSpear(palette.wood, km.trim, km.blade);
  spear.scale.setScalar(0.84);
  spear.position.set(0.01, -0.22, 0.03);
  right.forearm.add(spear);

  const neutralPose = () => {
    bodyGroup.position.set(0, PEDESTAL_HEIGHT, 0);
    bodyGroup.rotation.set(0, color === 'w' ? Math.PI : 0, 0);
    horseBody.rotation.set(BASE_PITCH, 0, 0);
    horseNeck.rotation.set(0, 0, 0);
    horseTail.rotation.set(0, 0, 0);
    horseLegFL.rotation.set(-0.84, 0, 0);
    horseLegFR.rotation.set(-0.58, 0, 0);
    horseLegBL.rotation.set(0.36, 0, 0);
    horseLegBR.rotation.set(0.38, 0, 0);

    pelvis.rotation.set(-BASE_PITCH * 0.72, 0, 0);
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    legL.rotation.set(-0.34, 0, -0.32);
    legR.rotation.set(-0.34, 0, 0.32);

    right.arm.rotation.set(-0.62, 0, -0.2);
    right.forearm.rotation.set(-0.52, 0, 0);
    left.arm.rotation.set(-0.56, 0.25, 0.16);
    left.forearm.rotation.set(-0.55, 0, 0);

    for (const seg of cp.segs) {
      seg.rotation.set(0.28, 0, 0);
    }
  };

  neutralPose();

  const rigData: ArticulatedJointRig = {
    root,
    bodyGroup,
    pelvis,
    torso,
    head,
    armL: left.arm,
    armR: right.arm,
    forearmL: left.forearm,
    forearmR: right.forearm,
    legL,
    legR,
    cape: cp.pivot,
    capeSegs: cp.segs,
    weapon: spear,
    horseBody,
    horseNeck,
    horseLegFL,
    horseLegFR,
    horseLegBL,
    horseLegBR,
    horseTail,
    baseHorsePitch: BASE_PITCH,
    selectableMeshes,
    neutralPose,
  };
  root.userData.rig = rigData;
  return rigData;
}

// ============================================================================
// OPTIONAL USER-UPLOADED GLB WRAPPER (PRESERVED COMPATIBILITY)
// ============================================================================

function buildGlbPiece(
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  template: CachedGlbTemplate
): WarriorRig {
  const cfg = MODEL_CONFIG[type];
  const root = new THREE.Group();
  root.userData.color = color;
  root.userData.type = type;
  root.userData.modelVersion = 'glb';

  const selectableMeshes: THREE.Mesh[] = [];
  addPedestalWithEmblems(root, palette, color, type, selectableMeshes);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  bodyGroup.rotation.y = color === 'w' ? Math.PI : 0;
  root.add(bodyGroup);

  const modelClone = SkeletonUtils.clone(template.gltf.scene);
  const rawMax = Math.max(template.rawSize.x, template.rawSize.y, template.rawSize.z, 0.001);
  const normScale = (1.0 / rawMax) * cfg.scale;
  modelClone.scale.setScalar(normScale);
  modelClone.position.set(
    -template.rawCenter.x * normScale,
    -template.rawMinY * normScale,
    -template.rawCenter.z * normScale
  );

  modelClone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      selectableMeshes.push(obj);
    }
  });
  bodyGroup.add(modelClone);

  let mixer: THREE.AnimationMixer | undefined;
  if (template.gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(modelClone);
    const clip = template.gltf.animations[0];
    mixer.clipAction(clip).play();
  }

  const dummyGroup = new THREE.Group();
  bodyGroup.add(dummyGroup);
  const neutralPose = () => {
    bodyGroup.position.set(0, PEDESTAL_HEIGHT, 0);
    bodyGroup.rotation.set(0, color === 'w' ? Math.PI : 0, 0);
  };
  root.userData.rig = {
    root,
    bodyGroup,
    pelvis: dummyGroup,
    torso: dummyGroup,
    head: dummyGroup,
    armL: dummyGroup,
    armR: dummyGroup,
    forearmL: dummyGroup,
    forearmR: dummyGroup,
    legL: dummyGroup,
    legR: dummyGroup,
    capeSegs: [],
    selectableMeshes,
    neutralPose,
  } satisfies ArticulatedJointRig;

  return {
    root,
    bodyGroup,
    pelvis: dummyGroup,
    torso: dummyGroup,
    headPivot: dummyGroup,
    leftArmPivot: dummyGroup,
    rightArmPivot: dummyGroup,
    leftForearmPivot: dummyGroup,
    rightForearmPivot: dummyGroup,
    leftLegPivot: dummyGroup,
    rightLegPivot: dummyGroup,
    headHeight: PEDESTAL_HEIGHT + template.rawSize.y * normScale,
    selectableMeshes,
    isGlb: true,
    mixer,
  };
}

// ============================================================================
// PUBLIC BUILDER API: buildPiece(type, side) + resetPose(group) + createWarriorPiece(...)
// ============================================================================

const PIECE_HEAD_HEIGHTS: Record<PieceSymbol, number> = {
  p: 0.94,
  r: 1.06,
  n: 1.16,
  b: 1.24,
  q: 1.38,
  k: 1.48,
};

export function buildPiece(
  typeInput: PieceNameOrSymbol,
  side: PieceColor,
  palette: MaterialPalette,
  enablePointLights = true
): THREE.Group {
  const type = normalizePieceSymbol(typeInput);
  if (type === 'k') {
    const kingRig = buildKingV2(palette, side, addPedestalWithEmblems);
    return kingRig.root;
  }
  const rigData =
    type === 'n'
      ? buildArticulatedKnight(palette, side)
      : buildArticulatedHumanoid(palette, side, type, enablePointLights);
  return rigData.root;
}

export function resetPose(group: THREE.Group) {
  const rigData = group.userData.rig as ArticulatedJointRig | undefined;
  if (rigData?.neutralPose) {
    rigData.neutralPose();
  }
  group.scale.setScalar(1);
}

export function createWarriorPiece(
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  enablePointLights = true
): WarriorRig {
  const glbTemplate = getLoadedGlbTemplate(type);
  if (glbTemplate) {
    return buildGlbPiece(palette, color, type, glbTemplate);
  }

  const group = buildPiece(type, color, palette, enablePointLights);
  const rig = group.userData.rig as ArticulatedJointRig;

  return {
    root: rig.root,
    bodyGroup: rig.bodyGroup,
    pelvis: rig.pelvis,
    spinePivot: rig.spine,
    torso: rig.torso,
    neckPivot: rig.neck,
    headPivot: rig.head,
    leftArmPivot: rig.armL,
    rightArmPivot: rig.armR,
    leftForearmPivot: rig.forearmL,
    rightForearmPivot: rig.forearmR,
    leftHandPivot: rig.handL,
    rightHandPivot: rig.handR,
    leftLegPivot: rig.legL,
    rightLegPivot: rig.legR,
    leftKneePivot: rig.kneeL,
    rightKneePivot: rig.kneeR,
    capePivot: rig.cape,
    capeSegs: rig.capeSegs,
    weaponPivot: rig.weapon,
    shieldPivot: rig.shield,
    crystalMesh: rig.crystalMesh,
    auraMesh: rig.auraMesh,
    staffLight: rig.staffLight,
    horseGroup: rig.horseBody,
    horseNeckPivot: rig.horseNeck,
    horseLegs:
      rig.horseLegFL && rig.horseLegFR && rig.horseLegBL && rig.horseLegBR
        ? {
            fl: rig.horseLegFL,
            fr: rig.horseLegFR,
            bl: rig.horseLegBL,
            br: rig.horseLegBR,
          }
        : undefined,
    horseTailPivot: rig.horseTail,
    baseHorsePitch: rig.baseHorsePitch,
    headHeight: PIECE_HEAD_HEIGHTS[type],
    selectableMeshes: rig.selectableMeshes,
  };
}
