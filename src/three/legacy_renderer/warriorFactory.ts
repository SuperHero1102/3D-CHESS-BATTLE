import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PieceColor, PieceSymbol } from '../../types/chess';
import { MaterialPalette, getKingdomMaterials } from './materials';
import { CachedGlbTemplate, MODEL_CONFIG, getLoadedGlbTemplate } from './modelLoader';

export const PEDESTAL_HEIGHT = 0.088;

export interface WarriorRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  capePivot?: THREE.Group;
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
  isGlb?: boolean;
  mixer?: THREE.AnimationMixer;
}

function createGladius(
  bladeMat: THREE.Material,
  hiltMat: THREE.Material,
  scale = 1,
  lengthMul = 1
): THREE.Group {
  const sword = new THREE.Group();
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014 * scale, 0.016 * scale, 0.12 * scale, 10),
    hiltMat
  );
  grip.position.y = 0.04 * scale;

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.025 * scale, 10, 8), hiltMat);
  pommel.position.y = -0.025 * scale;

  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036 * scale, 0.04 * scale, 0.026 * scale, 12),
    hiltMat
  );
  guard.scale.set(1.65, 1, 0.72);
  guard.position.y = 0.1 * scale;

  const bw = 0.026 * scale;
  const bl = 0.46 * scale * lengthMul;
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-bw, 0);
  bladeShape.lineTo(bw, 0);
  bladeShape.lineTo(bw * 0.85, bl * 0.74);
  bladeShape.lineTo(0, bl);
  bladeShape.lineTo(-bw * 0.85, bl * 0.74);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.01 * scale,
    bevelEnabled: true,
    bevelThickness: 0.004 * scale,
    bevelSize: 0.003 * scale,
    bevelSegments: 2,
  });
  bladeGeo.center();
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.11 * scale + bl * 0.5;
  blade.castShadow = true;

  sword.add(grip, pommel, guard, blade);
  return sword;
}

function createScutumShield(
  scutumMat: THREE.Material,
  trimMat: THREE.Material,
  armorMat: THREE.Material
): THREE.Group {
  const shield = new THREE.Group();
  const arcAngle = Math.PI * 0.35;
  const radius = 0.36;
  const height = 0.58;

  const curvedGeo = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    18,
    1,
    true,
    -arcAngle / 2,
    arcAngle
  );
  curvedGeo.translate(0, 0, -radius + 0.04);
  const face = new THREE.Mesh(curvedGeo, scutumMat);
  face.castShadow = true;

  const rimGeo = new THREE.CylinderGeometry(
    radius + 0.006,
    radius + 0.006,
    0.022,
    18,
    1,
    true,
    -arcAngle / 2 - 0.015,
    arcAngle + 0.03
  );
  rimGeo.translate(0, 0, -radius + 0.04);
  const topRim = new THREE.Mesh(rimGeo, trimMat);
  topRim.position.y = height / 2;
  const botRim = new THREE.Mesh(rimGeo, trimMat);
  botRim.position.y = -height / 2;

  const umboBase = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.018, 16), armorMat);
  umboBase.rotation.x = Math.PI / 2;
  umboBase.position.z = 0.042;
  const umboDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    trimMat
  );
  umboDome.rotation.x = Math.PI / 2;
  umboDome.position.z = 0.048;

  shield.add(face, topRim, botRim, umboBase, umboDome);
  return shield;
}

function createTowerBattlement(armorMat: THREE.Material, trimMat: THREE.Material, scale = 1): THREE.Group {
  const tower = new THREE.Group();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.25 * scale, 0.13 * scale), armorMat);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.036 * scale, 0.16 * scale), trimMat);
  collar.position.y = 0.13 * scale;
  tower.add(keep, collar);

  const merlonGeo = new THREE.BoxGeometry(0.05 * scale, 0.07 * scale, 0.05 * scale);
  const offsets: [number, number][] = [
    [-0.08 * scale, -0.048 * scale],
    [0.08 * scale, -0.048 * scale],
    [-0.08 * scale, 0.048 * scale],
    [0.08 * scale, 0.048 * scale],
  ];
  for (const [mx, mz] of offsets) {
    const m = new THREE.Mesh(merlonGeo, trimMat);
    m.position.set(mx, 0.18 * scale, mz);
    tower.add(m);
  }
  return tower;
}

function createRookTowerShield(
  armorMat: THREE.Material,
  trimMat: THREE.Material,
  clothMat: THREE.Material
): THREE.Group {
  const shield = new THREE.Group();
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.17, -0.32);
  plateShape.lineTo(0.17, -0.32);
  plateShape.lineTo(0.19, 0.24);
  plateShape.lineTo(0.115, 0.24);
  plateShape.lineTo(0.115, 0.175);
  plateShape.lineTo(0.038, 0.175);
  plateShape.lineTo(0.038, 0.24);
  plateShape.lineTo(-0.038, 0.24);
  plateShape.lineTo(-0.038, 0.175);
  plateShape.lineTo(-0.115, 0.175);
  plateShape.lineTo(-0.115, 0.24);
  plateShape.lineTo(-0.19, 0.24);
  plateShape.closePath();

  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelSegments: 2,
  });
  plateGeo.center();
  const plate = new THREE.Mesh(plateGeo, armorMat);
  const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.046, 0.05), trimMat);
  trimStrip.position.y = 0.02;
  const clothPanel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.038), clothMat);
  clothPanel.position.y = -0.02;
  shield.add(plate, clothPanel, trimStrip);
  shield.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return shield;
}

function createCavalryShield(
  armorMat: THREE.Material,
  trimMat: THREE.Material,
  clothMat: THREE.Material
): THREE.Group {
  const shield = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.022, 22), trimMat);
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.028, 22), clothMat);
  face.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), armorMat);
  boss.position.z = 0.012;
  shield.add(rim, face, boss);
  shield.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return shield;
}

function createWarhammer(
  woodMat: THREE.Material,
  armorMat: THREE.Material,
  trimMat: THREE.Material
): THREE.Group {
  const hammer = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.96, 12), woodMat);
  shaft.position.y = 0.44;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.145, 0.155), armorMat);
  head.position.y = 0.89;

  const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.055, 8), trimMat);
  capL.rotation.z = Math.PI / 2;
  capL.position.set(-0.155, 0.89, 0);
  const capR = capL.clone();
  capR.position.set(0.155, 0.89, 0);

  const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), trimMat);
  topSpike.position.y = 1.02;
  hammer.add(shaft, head, capL, capR, topSpike);
  hammer.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return hammer;
}

function createAugurStaff(
  woodMat: THREE.Material,
  trimMat: THREE.Material,
  crystalMat: THREE.Material,
  accentHex: number,
  enablePointLight: boolean
): {
  staff: THREE.Group;
  crystal: THREE.Mesh;
  light?: THREE.PointLight;
} {
  const staff = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 1.18, 12), woodMat);
  pole.position.y = 0.48;
  pole.castShadow = true;
  staff.add(pole);

  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.013, 10, 24, Math.PI * 1.45), trimMat);
  cradle.position.y = 1.15;
  cradle.rotation.z = -Math.PI * 0.22;
  staff.add(cradle);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.024, 0.09, 12), trimMat);
  collar.position.y = 1.05;
  staff.add(collar);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 1), crystalMat);
  crystal.position.y = 1.16;
  crystal.scale.set(0.86, 1.25, 0.86);
  staff.add(crystal);

  let light: THREE.PointLight | undefined;
  if (enablePointLight) {
    light = new THREE.PointLight(accentHex, 2.2, 3.2, 1.8);
    light.position.set(0, 1.16, 0.05);
    staff.add(light);
  }

  return { staff, crystal, light };
}

function createBellonaSpear(
  woodMat: THREE.Material,
  bladeMat: THREE.Material,
  trimMat: THREE.Material,
  crystalMat: THREE.Material
): { spear: THREE.Group; aura: THREE.Mesh } {
  const spear = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 1.44, 12), woodMat);
  shaft.position.y = 0.56;
  shaft.castShadow = true;

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.075, 10), trimMat);
  collar.position.y = 1.29;

  const tipGeo = new THREE.ConeGeometry(0.042, 0.26, 4);
  const tip = new THREE.Mesh(tipGeo, bladeMat);
  tip.position.y = 1.45;
  tip.scale.set(0.82, 1, 0.42);
  tip.castShadow = true;

  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 24), crystalMat);
  aura.position.y = 1.33;
  aura.rotation.x = Math.PI / 4;

  spear.add(shaft, collar, tip, aura);
  return { spear, aura };
}

function createAquilaScepter(trimMat: THREE.Material, armorMat: THREE.Material): THREE.Group {
  const scepter = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 1.2, 12), trimMat);
  pole.position.y = 0.5;
  pole.castShadow = true;

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), armorMat);
  orb.position.y = 1.12;

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 8), trimMat);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), trimMat);
  head.position.set(0, 1.255, 0.012);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.11, 0.08, 0.16, 0.03);
  wingShape.quadraticCurveTo(0.1, -0.03, 0, -0.04);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
  });
  const wingR = new THREE.Mesh(wingGeo, trimMat);
  wingR.position.set(0.016, 1.21, -0.005);
  const wingL = wingR.clone();
  wingL.scale.x = -1;
  wingL.position.x = -0.016;

  scepter.add(pole, orb, body, head, wingL, wingR);
  return scepter;
}

function addRomanPedestal(
  root: THREE.Group,
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  radius = 0.34
) {
  const km = getKingdomMaterials(palette, color);

  // Turned weathered travertine / dark bronze-stone classical pedestal
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 1.08, 0),
    new THREE.Vector2(radius * 1.06, 0.026),
    new THREE.Vector2(radius * 0.94, 0.042),
    new THREE.Vector2(radius * 0.97, 0.068),
    new THREE.Vector2(radius * 0.88, PEDESTAL_HEIGHT),
    new THREE.Vector2(0, PEDESTAL_HEIGHT),
  ];
  const baseGeo = new THREE.LatheGeometry(points, 32);
  const base = new THREE.Mesh(baseGeo, km.pedestal);
  base.castShadow = true;
  base.receiveShadow = true;

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.9, 0.012, 8, 32), km.trim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = PEDESTAL_HEIGHT - 0.004;
  root.add(base, rim);

  // Glowing embossed chess emblem medallions on BOTH front (+Z / -Z)
  const emblemMat = palette.getEmblemMaterial(color, type);
  const medallionGeo = new THREE.CircleGeometry(0.11, 24);
  const bezelGeo = new THREE.TorusGeometry(0.113, 0.013, 8, 24);

  for (const dir of [1, -1]) {
    const plaque = new THREE.Group();
    plaque.position.set(0, 0.068, dir * radius * 0.98);
    plaque.rotation.y = dir === 1 ? 0 : Math.PI;
    plaque.rotation.x = -0.48;

    const disc = new THREE.Mesh(medallionGeo, emblemMat);
    const bezel = new THREE.Mesh(bezelGeo, km.trim);
    bezel.position.z = 0.002;
    plaque.add(disc, bezel);
    root.add(plaque);
  }
}

function createDrapedRomanCape(
  clothMat: THREE.Material,
  trimMat: THREE.Material,
  widthScale: number,
  goldTrim: boolean
): THREE.Group {
  const capePivot = new THREE.Group();
  capePivot.position.set(0, 1.06, -0.075);

  // Curved draped cloak shell wrapping around upper shoulders & flaring slightly at bottom
  const arc = Math.PI * 0.72;
  const capeGeo = new THREE.CylinderGeometry(
    0.15 * widthScale,
    0.26 * widthScale,
    0.9,
    18,
    4,
    true,
    Math.PI - arc / 2,
    arc
  );
  capeGeo.translate(0, -0.45, 0.04);
  const capeMesh = new THREE.Mesh(capeGeo, clothMat);
  capeMesh.scale.set(1.05, 1, 0.65);
  capeMesh.rotation.x = 0.11;
  capeMesh.castShadow = true;
  capePivot.add(capeMesh);

  // Shoulder fibula clasps
  const claspGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.014, 12);
  for (const side of [-1, 1]) {
    const clasp = new THREE.Mesh(claspGeo, trimMat);
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(side * 0.125 * widthScale, -0.01, 0.12);
    capePivot.add(clasp);
  }

  if (goldTrim) {
    const hemGeo = new THREE.CylinderGeometry(
      0.256 * widthScale,
      0.262 * widthScale,
      0.028,
      18,
      1,
      true,
      Math.PI - arc / 2,
      arc
    );
    hemGeo.translate(0, -0.89, 0.04);
    const hem = new THREE.Mesh(hemGeo, trimMat);
    hem.scale.set(1.05, 1, 0.65);
    hem.rotation.x = 0.11;
    capePivot.add(hem);
  }

  return capePivot;
}

function buildRomanBody(
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  scale: number,
  options: {
    broadChest?: number;
    hasCape?: boolean;
    goldCapeTrim?: boolean;
    robe?: boolean;
    helmet: 'pawn' | 'king' | 'queen' | 'bishop' | 'rook' | 'knight';
    pedestalRadius?: number;
  }
): WarriorRig {
  const km = getKingdomMaterials(palette, color);
  const root = new THREE.Group();
  addRomanPedestal(root, palette, color, type, options.pedestalRadius ?? 0.34 * Math.min(scale, 1.08));

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  bodyGroup.scale.setScalar(scale);
  root.add(bodyGroup);

  const chestW = options.broadChest ?? 1.0;

  // True 1:7.5 Heroic Human Proportions (total unscaled height ~1.36 units)
  // Legs: Hip at y=0.62 -> Ankle/Boot at y=0
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.072 * Math.min(chestW, 1.15), 0.62, 0);
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.072 * Math.min(chestW, 1.15), 0.62, 0);

  const thighGeo = new THREE.CylinderGeometry(0.056, 0.044, 0.3, 12);
  const greavePoints = [
    new THREE.Vector2(0.031, -0.25),
    new THREE.Vector2(0.042, -0.14),
    new THREE.Vector2(0.045, -0.05),
    new THREE.Vector2(0.042, 0.02),
  ];
  const greaveGeo = new THREE.LatheGeometry(greavePoints, 12);

  const makeLeg = () => {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(thighGeo, km.skin);
    thigh.position.y = -0.15;

    const greave = new THREE.Mesh(greaveGeo, km.armor);
    greave.position.y = -0.32;

    const kneeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.055, 0.036), km.trim);
    kneeGuard.position.set(0, -0.295, 0.026);

    // Sculpted Roman Caligae Sandal / Boot
    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.08, 10), palette.leather);
    bootShaft.position.set(0, -0.56, 0);
    const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.046, 0.145), palette.leather);
    bootFoot.position.set(0, -0.597, 0.034);

    leg.add(thigh, greave, kneeGuard, bootShaft, bootFoot);
    return leg;
  };
  leftLegPivot.add(makeLeg());
  rightLegPivot.add(makeLeg());
  bodyGroup.add(leftLegPivot, rightLegPivot);

  // Robe / Pteruges War Skirt
  if (options.robe) {
    const robePoints = [
      new THREE.Vector2(0.21, 0.02),
      new THREE.Vector2(0.175, 0.28),
      new THREE.Vector2(0.13, 0.56),
      new THREE.Vector2(0.115, 0.68),
    ];
    const robeMesh = new THREE.Mesh(new THREE.LatheGeometry(robePoints, 20), km.cloth);
    robeMesh.scale.set(1.02, 1, 0.85);
    const frontStole = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.58, 0.022), km.trim);
    frontStole.position.set(0, 0.34, 0.13);
    frontStole.rotation.x = -0.14;
    bodyGroup.add(robeMesh, frontStole);
  } else {
    // Pleated Roman tunic skirt + leather pteruges strips
    const tunic = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128 * chestW, 0.175 * chestW, 0.25, 16, 1, true),
      km.cloth
    );
    tunic.position.y = 0.49;
    tunic.scale.set(1.06, 1, 0.78);

    const pterugesGroup = new THREE.Group();
    const stripGeo = new THREE.BoxGeometry(0.032, 0.17, 0.012);
    for (let s = 0; s < 10; s++) {
      const a = (s / 10) * Math.PI * 2;
      const strip = new THREE.Mesh(stripGeo, palette.leather);
      strip.position.set(Math.sin(a) * 0.138 * chestW, 0.54, Math.cos(a) * 0.105);
      strip.rotation.y = a;
      strip.rotation.x = -0.12;
      pterugesGroup.add(strip);
    }
    bodyGroup.add(tunic, pterugesGroup);
  }

  // Heroic Sculpted Torso Cuirass (Lorica Musculata / Segmentata) via LatheGeometry
  const cuirassPoints = [
    new THREE.Vector2(0.108 * chestW, 0.62),
    new THREE.Vector2(0.116 * chestW, 0.74),
    new THREE.Vector2(0.162 * chestW, 0.94),
    new THREE.Vector2(0.152 * chestW, 1.05),
    new THREE.Vector2(0.072 * chestW, 1.09),
  ];
  const cuirassGeo = new THREE.LatheGeometry(cuirassPoints, 18);
  const torso = new THREE.Mesh(cuirassGeo, options.helmet === 'bishop' ? km.cloth : km.armor);
  torso.scale.set(1.08, 1, 0.68);
  bodyGroup.add(torso);

  if (options.helmet === 'pawn' || options.helmet === 'rook') {
    for (let b = 0; b < 3; b++) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry((0.125 + b * 0.013) * chestW, (0.116 + b * 0.013) * chestW, 0.038, 16),
        b % 2 === 0 ? km.trim : km.armor
      );
      band.position.y = 0.73 + b * 0.088;
      band.scale.set(1.1, 1, 0.7);
      bodyGroup.add(band);
    }
  } else {
    // Pectoral ridge & imperial crest medallion
    const chestMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.018, 12), km.trim);
    chestMedallion.rotation.x = Math.PI / 2;
    chestMedallion.position.set(0, 0.94, 0.11);
    bodyGroup.add(chestMedallion);
  }

  // Cingulum Militare (Roman Leather Belt & Brass Buckle)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.124 * chestW, 0.124 * chestW, 0.048, 16), palette.leather);
  belt.position.y = 0.64;
  belt.scale.set(1.1, 1, 0.7);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.052, 0.028), km.trim);
  buckle.position.set(0, 0.64, 0.095);
  bodyGroup.add(belt, buckle);

  // Draped Roman Cape
  let capePivot: THREE.Group | undefined;
  if (options.hasCape) {
    capePivot = createDrapedRomanCape(km.cloth, km.trim, chestW, Boolean(options.goldCapeTrim));
    bodyGroup.add(capePivot);
  }

  // Realistic Sculpted Head (1:7.5 ratio -> head height ~0.165 vs 1.28 body)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.09, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.05, 0.082, 12), km.skin);
  neck.position.y = 0.035;

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.073, 18, 14), km.skin);
  cranium.position.y = 0.125;
  cranium.scale.set(0.86, 1.08, 0.94);

  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.036, 0.068, 12), km.skin);
  jaw.position.set(0, 0.092, 0.012);
  jaw.scale.set(0.88, 1, 0.92);
  headPivot.add(neck, cranium, jaw);

  if (options.helmet === 'pawn') {
    // Smooth Roman Legionary Galea Helmet WITHOUT Crest + Cheek Guards + Neck Guard
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      km.armor
    );
    dome.position.y = 0.135;
    dome.scale.set(0.92, 1.02, 1.0);
    const browVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.094, 0.098, 0.018, 16, 1, false, -0.85, 1.7),
      km.trim
    );
    browVisor.position.set(0, 0.15, 0.015);
    const neckFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.084, 0.112, 0.048, 14, 1, true, Math.PI * 0.65, Math.PI * 0.7),
      km.armor
    );
    neckFlange.position.set(0, 0.1, -0.012);
    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.068, 0.044), km.armor);
    cheekL.position.set(-0.068, 0.096, 0.025);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.068;
    headPivot.add(dome, browVisor, neckFlange, cheekL, cheekR);
  } else if (options.helmet === 'king') {
    // Imperator Golden Radiate Crown (Corona Radiata)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.078, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      km.trim
    );
    hair.position.set(0, 0.132, -0.008);
    const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.078, 0.044, 16), km.trim);
    crownBand.position.y = 0.195;
    headPivot.add(hair, crownBand);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.072, 5), km.trim);
      spike.position.set(Math.cos(ang) * 0.08, 0.245, Math.sin(ang) * 0.08);
      spike.rotation.z = -Math.cos(ang) * 0.18;
      spike.rotation.x = Math.sin(ang) * 0.18;
      headPivot.add(spike);
    }
  } else if (options.helmet === 'queen') {
    // Bellona Golden Laurel Wreath Crown
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.077, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.64),
      km.cloth
    );
    hair.position.set(0, 0.132, -0.008);
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.01, 8, 22), km.trim);
    wreath.rotation.x = Math.PI / 2 - 0.14;
    wreath.position.y = 0.182;
    headPivot.add(hair, wreath);
    const leafGeo = new THREE.ConeGeometry(0.015, 0.052, 4);
    for (let i = -3; i <= 3; i++) {
      const ang = i * 0.42;
      const leaf = new THREE.Mesh(leafGeo, km.trim);
      leaf.position.set(Math.sin(ang) * 0.085, 0.198, Math.cos(ang) * 0.085);
      leaf.rotation.z = -ang * 0.5;
      leaf.rotation.x = 0.3;
      headPivot.add(leaf);
    }
  } else if (options.helmet === 'bishop') {
    // Augur Ceremonial Hood & Gold Brow Circlet
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.21, 16), km.cloth);
    hood.position.set(0, 0.185, -0.016);
    const browRing = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.01, 8, 20), km.trim);
    browRing.rotation.x = Math.PI / 2;
    browRing.position.y = 0.165;
    headPivot.add(hood, browRing);
  } else if (options.helmet === 'rook') {
    // Heavy Siege Great Helm with Visor Slit & Crenellated Crest
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.096, 0.185, 16), km.armor);
    helm.position.y = 0.135;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.128, 0.026, 0.044), km.trim);
    visor.position.set(0, 0.145, 0.082);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.042, 0.12), km.trim);
    crest.position.y = 0.24;
    headPivot.add(helm, visor, crest);
  } else if (options.helmet === 'knight') {
    // Roman Equites Cavalry Galea with Horsehair Plume
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.084, 16, 12), km.armor);
    helm.position.y = 0.135;
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.082, 0.06, 12, 1, false, -0.75, 1.5),
      km.trim
    );
    visor.position.set(0, 0.13, 0.012);
    const crestArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.02, 8, 16, Math.PI * 1.08),
      km.cloth
    );
    crestArc.rotation.y = Math.PI / 2;
    crestArc.position.set(0, 0.175, -0.008);
    headPivot.add(helm, visor, crestArc);
  }
  bodyGroup.add(headPivot);

  // Articulated Arms with Sculpted Shoulder Pauldrons & Gauntlets (No Sphere Hands!)
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.185 * chestW, 1.02, 0);
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.185 * chestW, 1.02, 0);

  const makeArm = () => {
    const arm = new THREE.Group();
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.072 * Math.min(chestW, 1.25), 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      km.armor
    );
    pauldron.position.y = 0.015;
    pauldron.scale.set(1.05, 0.9, 1.05);

    const pauldronTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.068 * Math.min(chestW, 1.25), 0.009, 6, 16),
      km.trim
    );
    pauldronTrim.rotation.x = Math.PI / 2;
    pauldronTrim.position.y = -0.01;

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.21, 10), km.skin);
    upper.position.y = -0.11;

    const vambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.031, 0.21, 10), km.armor);
    vambrace.position.y = -0.31;

    // Sculpted armored fist/gauntlet (tapered box/cylinder, NOT a round ball)
    const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.056), km.trim);
    gauntlet.position.y = -0.435;
    arm.add(pauldron, pauldronTrim, upper, vambrace, gauntlet);
    return arm;
  };
  leftArmPivot.add(makeArm());
  rightArmPivot.add(makeArm());
  bodyGroup.add(leftArmPivot, rightArmPivot);

  bodyGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return {
    root,
    bodyGroup,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    capePivot,
    headHeight: PEDESTAL_HEIGHT + 1.32 * scale,
  };
}

function buildMountedEquites(palette: MaterialPalette, color: PieceColor): WarriorRig {
  const km = getKingdomMaterials(palette, color);
  const root = new THREE.Group();
  addRomanPedestal(root, palette, color, 'n', 0.36);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  root.add(bodyGroup);

  // Dynamic Heroic Rearing Warhorse
  const baseHorsePitch = -0.34;
  const horseGroup = new THREE.Group();
  horseGroup.position.set(0, 0.04, -0.04);
  horseGroup.rotation.x = baseHorsePitch;
  bodyGroup.add(horseGroup);

  // Sculpted Anatomical Barrel & Ribcage
  const barrelPoints = [
    new THREE.Vector2(0.01, -0.3),
    new THREE.Vector2(0.125, -0.22),
    new THREE.Vector2(0.145, -0.04),
    new THREE.Vector2(0.138, 0.14),
    new THREE.Vector2(0.152, 0.24),
    new THREE.Vector2(0.01, 0.31),
  ];
  const barrelGeo = new THREE.LatheGeometry(barrelPoints, 18);
  barrelGeo.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeo, km.horse);
  barrel.position.set(0, 0.56, 0);
  barrel.scale.set(0.86, 1.04, 1);
  horseGroup.add(barrel);

  // Muscular Chest & Haunches
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), km.horse);
  chest.position.set(0, 0.57, 0.21);
  chest.scale.set(0.86, 1.05, 0.95);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 12), km.horse);
  rump.position.set(0, 0.57, -0.2);
  rump.scale.set(0.86, 1.02, 1.02);
  horseGroup.add(chest, rump);

  // Roman Caparison Saddle Cloth + Leather Saddle
  const caparison = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.172, 0.34, 16, 1, true),
    km.cloth
  );
  caparison.rotation.x = Math.PI / 2;
  caparison.position.set(0, 0.54, -0.02);
  caparison.scale.set(0.92, 1, 1.05);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.068, 0.24), palette.leather);
  saddle.position.set(0, 0.71, -0.03);
  horseGroup.add(caparison, saddle);

  // S-Curved Arched Neck + Sculpted Equine Skull + Chamfron Armor
  const horseNeckPivot = new THREE.Group();
  horseNeckPivot.position.set(0, 0.62, 0.23);

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.14, 0.07),
    new THREE.Vector3(0, 0.27, 0.095),
  ]);
  const neckMesh = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 12, 0.076, 12, false), km.horse);
  neckMesh.scale.set(0.82, 1, 1.12);

  // Sculpted Horse Crest Mane
  const maneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.03, -0.045),
    new THREE.Vector3(0, 0.17, 0.02),
    new THREE.Vector3(0, 0.31, 0.055),
  ]);
  const mane = new THREE.Mesh(new THREE.TubeGeometry(maneCurve, 10, 0.026, 8, false), km.trim);
  mane.scale.set(0.55, 1, 1.3);

  // Tapered Sculpted Equine Skull (Extrude side profile for unmistakable horse head!)
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.07, 0.06);
  headShape.lineTo(0.03, 0.085); // crown
  headShape.lineTo(0.18, 0.015); // nose bridge
  headShape.lineTo(0.19, -0.03); // nostrils
  headShape.lineTo(0.12, -0.055); // chin
  headShape.lineTo(-0.02, -0.045); // jaw jowl
  headShape.lineTo(-0.07, -0.01);
  headShape.closePath();

  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.074,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  headGeo.center();
  headGeo.rotateY(-Math.PI / 2); // face along +Z
  headGeo.rotateX(0.55); // angle snout downward proudly
  const skull = new THREE.Mesh(headGeo, km.horse);
  skull.position.set(0, 0.29, 0.18);

  const chamfron = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.032, 0.19), km.trim);
  chamfron.position.set(0, 0.325, 0.195);
  chamfron.rotation.x = 0.56;

  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.062, 6), km.horse);
  earL.position.set(-0.034, 0.385, 0.11);
  const earR = earL.clone();
  earR.position.x = 0.034;

  horseNeckPivot.add(neckMesh, mane, skull, chamfron, earL, earR);
  horseGroup.add(horseNeckPivot);

  // Flowing Curved Tail
  const horseTailPivot = new THREE.Group();
  horseTailPivot.position.set(0, 0.59, -0.29);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.1, -0.09),
    new THREE.Vector3(0, -0.28, -0.13),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.03, 8, false), km.trim);
  horseTailPivot.add(tail);
  horseGroup.add(horseTailPivot);

  // Jointed Muscular Horse Legs
  const makeHorseLeg = (x: number, z: number, kneeBend: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(x, 0.48, z);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.031, 0.24, 10), km.horse);
    upper.position.y = -0.12;
    const shinGroup = new THREE.Group();
    shinGroup.position.y = -0.23;
    shinGroup.rotation.x = kneeBend;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.023, 0.22, 10), km.horse);
    lower.position.y = -0.11;
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.044, 10), km.armor);
    hoof.position.y = -0.22;
    shinGroup.add(lower, hoof);
    legPivot.add(upper, shinGroup);
    horseGroup.add(legPivot);
    return legPivot;
  };

  const horseLegs = {
    fl: makeHorseLeg(-0.092, 0.21, 0.98),
    fr: makeHorseLeg(0.092, 0.21, 0.74),
    bl: makeHorseLeg(-0.092, -0.22, 0.06),
    br: makeHorseLeg(0.092, -0.22, 0.06),
  };
  horseLegs.fl.rotation.x = -0.82;
  horseLegs.fr.rotation.x = -0.6;
  horseLegs.bl.rotation.x = 0.34;
  horseLegs.br.rotation.x = 0.35;

  // Armored Equites Rider
  const rider = buildRomanBody(palette, color, 'n', 0.72, {
    broadChest: 1.02,
    hasCape: true,
    helmet: 'knight',
  });
  rider.root.clear();
  rider.bodyGroup.position.set(0, 0.4, -0.04);
  rider.bodyGroup.rotation.x = -baseHorsePitch * 0.78;
  rider.leftLegPivot.rotation.set(-0.36, 0, -0.34);
  rider.rightLegPivot.rotation.set(-0.36, 0, 0.34);
  horseGroup.add(rider.bodyGroup);

  const sword = createGladius(km.blade, km.trim, 0.92, 1.15);
  sword.position.set(0, -0.43, 0.035);
  sword.rotation.x = Math.PI * 0.38;
  rider.rightArmPivot.add(sword);
  rider.rightArmPivot.rotation.set(-0.98, 0, -0.22);

  const shield = createCavalryShield(km.armor, km.trim, km.cloth);
  shield.position.set(-0.075, -0.28, 0.065);
  shield.rotation.y = -Math.PI / 2.2;
  rider.leftArmPivot.add(shield);
  rider.leftArmPivot.rotation.set(-0.42, 0.2, 0.16);

  horseGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    bodyGroup,
    headPivot: rider.headPivot,
    leftArmPivot: rider.leftArmPivot,
    rightArmPivot: rider.rightArmPivot,
    leftLegPivot: rider.leftLegPivot,
    rightLegPivot: rider.rightLegPivot,
    capePivot: rider.capePivot,
    weaponPivot: sword,
    shieldPivot: shield,
    horseGroup,
    horseNeckPivot,
    horseLegs,
    horseTailPivot,
    baseHorsePitch,
    headHeight: 1.56,
  };
}

function buildGlbPiece(
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  cached: CachedGlbTemplate
): WarriorRig {
  const root = new THREE.Group();
  const cfg = MODEL_CONFIG[type];
  const pedestalRadius = type === 'n' ? 0.36 : type === 'r' ? 0.37 : 0.34;
  addRomanPedestal(root, palette, color, type, pedestalRadius);

  // Subtle glowing faction aura ring on pedestal top to distinguish armies clearly
  const factionRing = new THREE.Mesh(
    new THREE.TorusGeometry(pedestalRadius * 0.87, 0.014, 8, 32),
    new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0xff4d3b : 0x9b51e0,
      emissive: color === 'w' ? 0x991b1b : 0x581c87,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    })
  );
  factionRing.rotation.x = Math.PI / 2;
  factionRing.position.y = PEDESTAL_HEIGHT + 0.004;
  root.add(factionRing);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = PEDESTAL_HEIGHT;
  root.add(bodyGroup);

  const model = SkeletonUtils.clone(cached.gltf.scene);

  // Normalize arbitrary Sketchfab GLB units to ~1.52 board height multiplied by MODEL_CONFIG[type].scale
  const rawHeight = Math.max(0.001, cached.rawSize.y);
  const normScale = (1.52 / rawHeight) * cfg.scale;
  model.scale.setScalar(normScale);

  // Center X/Z over pedestal and place feet cleanly at y = 0 inside bodyGroup
  model.position.set(
    -cached.rawCenter.x * normScale,
    -cached.rawMinY * normScale,
    -cached.rawCenter.z * normScale
  );

  // Faction material cloning & dark iron / imperial purple tinting for Black Kingdom
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const tintMaterial = (m: THREE.Material): THREE.Material => {
        const cloned = m.clone() as THREE.MeshStandardMaterial;
        if (color === 'b' && cloned.color) {
          cloned.color.multiplyScalar(0.52);
          if (cloned.emissive) {
            cloned.emissive.lerp(new THREE.Color(0x2a124c), 0.25);
          }
        }
        return cloned;
      };
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(tintMaterial);
      } else if (mesh.material) {
        mesh.material = tintMaterial(mesh.material);
      }
    }
  });

  bodyGroup.add(model);

  let mixer: THREE.AnimationMixer | undefined;
  if (cached.gltf.animations && cached.gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(cached.gltf.animations[0]);
    action.play();
  }

  const headPivot = new THREE.Group();
  const leftArmPivot = new THREE.Group();
  const rightArmPivot = new THREE.Group();
  const leftLegPivot = new THREE.Group();
  const rightLegPivot = new THREE.Group();
  bodyGroup.add(headPivot, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);

  const normalizedHeight = rawHeight * normScale;

  return {
    root,
    bodyGroup,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    headHeight: PEDESTAL_HEIGHT + normalizedHeight,
    isGlb: true,
    mixer,
  };
}

export function createWarriorPiece(
  palette: MaterialPalette,
  color: PieceColor,
  type: PieceSymbol,
  enablePointLights = true
): WarriorRig {
  const km = getKingdomMaterials(palette, color);
  const glbTemplate = getLoadedGlbTemplate(type);
  let rig: WarriorRig;

  if (glbTemplate) {
    rig = buildGlbPiece(palette, color, type, glbTemplate);
  } else if (type === 'n') {
    rig = buildMountedEquites(palette, color);
  } else if (type === 'k') {
    // King - Hoàng Đế Imperator (Tallest, Golden Spiked Crown, Gold-Trimmed Cape, Aquila Scepter)
    rig = buildRomanBody(palette, color, 'k', 1.16, {
      broadChest: 1.1,
      hasCape: true,
      goldCapeTrim: true,
      helmet: 'king',
    });
    const aquila = createAquilaScepter(km.trim, km.armor);
    aquila.position.set(0, -0.43, 0.055);
    aquila.rotation.x = 0.14;
    rig.rightArmPivot.add(aquila);
    rig.rightArmPivot.rotation.set(-0.32, 0, -0.14);
    rig.leftArmPivot.rotation.set(-0.22, 0.1, 0.14);
    rig.weaponPivot = aquila;

    const sideSword = createGladius(km.blade, km.trim, 0.8, 0.9);
    sideSword.position.set(-0.15, 0.56, 0.02);
    sideSword.rotation.set(Math.PI * 0.65, 0, 0.18);
    rig.bodyGroup.add(sideSword);
  } else if (type === 'q') {
    // Queen - Nữ Thần Chiến Tranh Bellona (Laurel Wreath Crown, Glowing War Spear, Gold-Trimmed Cape)
    rig = buildRomanBody(palette, color, 'q', 1.08, {
      broadChest: 0.9,
      hasCape: true,
      goldCapeTrim: true,
      robe: true,
      helmet: 'queen',
    });
    const { spear, aura } = createBellonaSpear(palette.wood, km.blade, km.trim, km.crystal);
    spear.position.set(0, -0.43, 0.055);
    spear.rotation.x = 0.12;
    rig.rightArmPivot.add(spear);
    rig.rightArmPivot.rotation.set(-0.34, 0, -0.15);
    rig.leftArmPivot.rotation.set(-0.3, -0.12, 0.18);
    rig.weaponPivot = spear;
    rig.auraMesh = aura;
  } else if (type === 'b') {
    // Bishop - Tư Tế Augur (Tall Slender Robed Priest + Hood + Glowing Crystal Staff)
    rig = buildRomanBody(palette, color, 'b', 1.02, {
      broadChest: 0.88,
      hasCape: true,
      robe: true,
      helmet: 'bishop',
    });
    const { staff, crystal, light } = createAugurStaff(
      palette.wood,
      km.trim,
      km.crystal,
      km.accentHex,
      enablePointLights
    );
    staff.position.set(0, -0.43, 0.055);
    staff.rotation.x = 0.14;
    rig.rightArmPivot.add(staff);
    rig.rightArmPivot.rotation.set(-0.28, 0, -0.1);
    rig.leftArmPivot.rotation.set(-0.36, 0.25, 0.12);
    rig.weaponPivot = staff;
    rig.crystalMesh = crystal;
    rig.staffLight = light;
  } else if (type === 'r') {
    // Rook - Tháp Công Thành / Trọng Giáp (Widest Heavy Plate, Back Watchtower, Tower Shield, Warhammer)
    rig = buildRomanBody(palette, color, 'r', 0.98, {
      broadChest: 1.32,
      hasCape: false,
      helmet: 'rook',
      pedestalRadius: 0.37,
    });
    const backTower = createTowerBattlement(km.armor, km.trim, 0.9);
    backTower.position.set(0, 1.02, -0.16);
    rig.bodyGroup.add(backTower);

    const hammer = createWarhammer(palette.wood, km.armor, km.trim);
    hammer.position.set(0, -0.43, 0.048);
    hammer.rotation.x = Math.PI * 0.34;
    rig.rightArmPivot.add(hammer);
    rig.rightArmPivot.rotation.set(-0.35, 0, -0.16);

    const shield = createRookTowerShield(km.armor, km.trim, km.cloth);
    shield.position.set(-0.075, -0.24, 0.095);
    shield.rotation.y = -Math.PI / 2.35;
    rig.leftArmPivot.add(shield);
    rig.leftArmPivot.rotation.set(-0.4, 0.2, 0.12);
    rig.weaponPivot = hammer;
    rig.shieldPivot = shield;
  } else {
    // Pawn - Lính Lê Dương (Shortest, Smooth Crestless Galea Helmet, Scutum, Gladius)
    rig = buildRomanBody(palette, color, 'p', 0.82, {
      broadChest: 0.96,
      hasCape: false,
      helmet: 'pawn',
    });
    const gladius = createGladius(km.blade, km.trim, 0.82, 0.92);
    gladius.position.set(0, -0.43, 0.04);
    gladius.rotation.x = Math.PI * 0.42;
    rig.rightArmPivot.add(gladius);
    rig.rightArmPivot.rotation.set(-0.38, 0, -0.15);

    const scutum = createScutumShield(km.scutum, km.trim, km.armor);
    scutum.position.set(-0.075, -0.27, 0.075);
    scutum.rotation.y = -Math.PI / 2.3;
    rig.leftArmPivot.add(scutum);
    rig.leftArmPivot.rotation.set(-0.44, 0.22, 0.14);
    rig.weaponPivot = gladius;
    rig.shieldPivot = scutum;
  }

  rig.bodyGroup.rotation.y = color === 'w' ? Math.PI : 0;

  // Raycast hit cylinder on layer 1 for snappy hover tooltip & piece picking
  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.41, 1.55, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.y = 0.76;
  hitMesh.layers.set(1);
  hitMesh.userData.isPieceHit = true;
  hitMesh.userData.pieceRoot = rig.root;
  rig.root.add(hitMesh);

  rig.root.userData.rig = rig;
  rig.root.userData.color = color;
  rig.root.userData.type = type;

  return rig;
}
