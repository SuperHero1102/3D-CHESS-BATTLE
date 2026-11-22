import * as THREE from 'three';
import { PieceColor, PieceSymbol } from '../types/chess';
import { MaterialPalette } from './materials';

export const KING_PEDESTAL_HEIGHT = 0.088;

export interface KingV2RigHierarchy {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  cloak: THREE.Group;
  cloakSeg1: THREE.Group;
  cloakSeg2: THREE.Group;
  cloakSeg3: THREE.Group;
  scepter: THREE.Group;
  scabbard: THREE.Group;
  // Aliases for unified CombatDirector / WarriorRig compatibility
  torso: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cape: THREE.Group;
  capeSegs: THREE.Group[];
  weapon: THREE.Group;
  selectableMeshes: THREE.Mesh[];
  neutralPose: () => void;
}

function enableShadows(obj: THREE.Object3D, selectable?: THREE.Mesh[]) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (selectable && child.visible) {
        selectable.push(child);
      }
    }
  });
}

// ============================================================================
// SCULPTED ROMAN CAESAR FACE & CRANIUM (NO SMOOTH SPHERE!)
// ============================================================================

function createSculptedCaesarHeadGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.068, 36, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Elongate vertically into heroic oval skull
    let x = v.x * 0.88;
    let y = v.y * 1.18;
    let z = v.z * 1.02;

    const frontMask = THREE.MathUtils.smoothstep(z, 0.01, 0.062);

    // Narrow temples above brow
    if (y > 0.015 && y < 0.06) {
      const temple = THREE.MathUtils.smoothstep(Math.abs(x), 0.032, 0.06);
      x *= 1 - temple * 0.08 * frontMask;
    }

    // Prominent Roman supraorbital brow ridge
    const browBand = Math.exp(-Math.pow((y - 0.024) / 0.013, 2));
    z += browBand * 0.008 * frontMask * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.038, 0.058));

    // Recessed orbital eye sockets (left & right)
    const eyeLX = Math.exp(-Math.pow((x + 0.022) / 0.013, 2));
    const eyeRX = Math.exp(-Math.pow((x - 0.022) / 0.013, 2));
    const eyeY = Math.exp(-Math.pow((y - 0.009) / 0.01, 2));
    z -= (eyeLX + eyeRX) * eyeY * 0.011 * frontMask;

    // Sculpted cheekbones (zygomatic arches)
    const cheekX = Math.exp(-Math.pow((Math.abs(x) - 0.034) / 0.014, 2));
    const cheekY = Math.exp(-Math.pow((y + 0.012) / 0.014, 2));
    z += cheekX * cheekY * 0.008 * frontMask;
    x += Math.sign(x) * cheekX * cheekY * 0.003 * frontMask;

    // Hollowed cheeks below cheekbones
    const hollowY = Math.exp(-Math.pow((y + 0.032) / 0.015, 2));
    const hollowX = Math.exp(-Math.pow((Math.abs(x) - 0.034) / 0.012, 2));
    x -= Math.sign(x) * hollowX * hollowY * 0.004 * frontMask;

    // Strong square Roman jawline & forward chin
    if (y < -0.02) {
      const jawFrac = THREE.MathUtils.clamp((-0.02 - y) / 0.062, 0, 1);
      // Taper lower face toward chin while keeping jaw corners defined
      const cornerKeep = Math.exp(-Math.pow((Math.abs(x) - 0.035) / 0.014, 2));
      x *= THREE.MathUtils.lerp(1.0, 0.56 + cornerKeep * 0.22, jawFrac);
      // Forward chin prominence at center bottom
      const chinCenter = Math.exp(-Math.pow(x / 0.022, 2));
      const chinY = Math.exp(-Math.pow((y + 0.064) / 0.015, 2));
      z += chinCenter * chinY * 0.012 * frontMask;
    }

    // Flattened back neck base
    if (z < -0.02 && y < -0.02) {
      z *= 0.85;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createSculptedNoseGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.026);
  s.lineTo(0.004, 0.024);
  s.quadraticCurveTo(0.013, 0.002, 0.016, -0.016);
  s.quadraticCurveTo(0.012, -0.024, 0.001, -0.024);
  s.lineTo(-0.005, -0.018);
  s.lineTo(-0.005, 0.022);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.0035,
    bevelSegments: 3,
  });
  // Orient so shape X -> +Z (protruding forward), extrusion depth along X centered
  geo.translate(0, 0, -0.006);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createSculptedLipGeo(width: number, height: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-width * 0.5, 0);
  s.quadraticCurveTo(-width * 0.22, height, 0, height * 0.65);
  s.quadraticCurveTo(width * 0.22, height, width * 0.5, 0);
  s.quadraticCurveTo(0, -height * 0.9, -width * 0.5, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.003);
  return geo;
}

function createEarGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.018);
  s.quadraticCurveTo(0.012, 0.018, 0.011, 0.0);
  s.quadraticCurveTo(0.009, -0.018, -0.002, -0.018);
  s.quadraticCurveTo(-0.006, -0.006, -0.004, 0.012);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.005,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.0025);
  return geo;
}

function createCheekGuardGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.022, 0.032);
  s.lineTo(0.018, 0.03);
  s.quadraticCurveTo(0.024, 0.0, 0.012, -0.044);
  s.quadraticCurveTo(-0.002, -0.056, -0.018, -0.046);
  s.quadraticCurveTo(-0.026, -0.012, -0.022, 0.032);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0025,
    bevelSegments: 3,
  });
}

function createSunRaySpikeGeo(length: number, baseHalfW: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-baseHalfW, 0);
  s.lineTo(baseHalfW, 0);
  s.lineTo(baseHalfW * 0.35, length * 0.65);
  s.lineTo(0, length);
  s.lineTo(-baseHalfW * 0.35, length * 0.65);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.0035,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.003);
  return geo;
}

function createImperialCrestPlumeGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.01, 0.055);
  s.quadraticCurveTo(0.03, 0.145, -0.02, 0.155);
  s.quadraticCurveTo(-0.095, 0.135, -0.105, 0.03);
  s.quadraticCurveTo(-0.095, -0.005, -0.072, -0.005);
  s.quadraticCurveTo(-0.068, 0.065, -0.01, 0.055);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.004,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.007);
  // Orient in YZ plane (facing +Z)
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// SCULPTED ANATOMICAL MUSCLE CUIRASS, PAULDRONS & PTERUGES
// ============================================================================

function createSculptedCuirassGeo(): THREE.BufferGeometry {
  const radialSegs = 36;
  const heightSegs = 24;
  const height = 0.285;
  const geo = new THREE.CylinderGeometry(1, 1, height, radialSegs, heightSegs, false);
  geo.translate(0, height * 0.5, 0);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp(v.y / height, 0, 1); // 0 waist -> 1 collar
    const ang = Math.atan2(v.x, v.z); // 0 front, ±PI back
    const front = Math.max(0, Math.cos(ang));
    const back = Math.max(0, -Math.cos(ang));
    const side = Math.abs(Math.sin(ang));

    // V-taper silhouette matching heroic 7.5-head Roman Emperor
    const baseRx = THREE.MathUtils.lerp(0.118, 0.168, Math.pow(t, 0.72)) * (1 - Math.pow(THREE.MathUtils.clamp((t - 0.84) / 0.16, 0, 1), 1.4) * 0.42);
    const baseRz = THREE.MathUtils.lerp(0.088, 0.112, Math.sin(t * Math.PI * 0.78)) * (1 - Math.pow(THREE.MathUtils.clamp((t - 0.84) / 0.16, 0, 1), 1.4) * 0.38);

    // Sculpted pectoral shelf & ribcage
    const pecHeight = Math.exp(-Math.pow((t - 0.68) / 0.15, 2));
    const pecLobes = Math.exp(-Math.pow((Math.abs(Math.sin(ang)) - 0.42) / 0.34, 2));
    const abRidge = Math.exp(-Math.pow((t - 0.32) / 0.22, 2)) * Math.exp(-Math.pow(Math.sin(ang) / 0.45, 2));
    const abRows = Math.max(0, Math.sin((t - 0.12) * Math.PI * 7.5)) * 0.0035;

    // Back spine groove & shoulder blade contour
    const spineGroove = Math.exp(-Math.pow(Math.sin(ang) / 0.16, 2)) * back;
    const trapSwell = Math.exp(-Math.pow((t - 0.74) / 0.18, 2)) * back * side;

    const rScale = Math.hypot(v.x, v.z) || 1;
    const nx = (v.x / rScale) * (baseRx + trapSwell * 0.008);
    let nz = (v.z / rScale) * baseRz;
    nz += front * (pecHeight * pecLobes * 0.018 + abRidge * (0.01 + abRows));
    nz += back * spineGroove * 0.008;

    // Curved imperial lower hem arch at center front (+Z) matching Image 13
    let ny = v.y;
    if (t < 0.18) {
      const archDip = front * Math.exp(-Math.pow(Math.sin(ang) / 0.65, 2)) * 0.022;
      ny -= archDip * (1 - t / 0.18);
    }

    pos.setXYZ(i, nx, ny, nz);
  }

  geo.computeVertexNormals();
  return geo;
}

function createBeveledPectoralPlateGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.006, 0.036);
  s.quadraticCurveTo(0.048, 0.042, 0.072, 0.016);
  s.quadraticCurveTo(0.068, -0.028, 0.028, -0.032);
  s.quadraticCurveTo(0.008, -0.026, 0.006, 0.036);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.004);
  return geo;
}

function createPterugesLappetGeo(w: number, h: number, depth = 0.009): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.5, 0);
  s.lineTo(w * 0.5, 0);
  s.lineTo(w * 0.48, -h * 0.74);
  s.quadraticCurveTo(w * 0.36, -h, 0, -h);
  s.quadraticCurveTo(-w * 0.36, -h, -w * 0.48, -h * 0.74);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0035,
    bevelSize: 0.0025,
    bevelSegments: 3,
  });
}

function createPleatedTunicLatheAndFlutes(radiusTop: number, radiusBot: number, height: number): THREE.BufferGeometry {
  const radialSegs = 48;
  const heightSegs = 12;
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBot, height, radialSegs, heightSegs, true);
  geo.translate(0, height * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(x, z);
    const frac = y / height;
    const pleat = Math.sin(ang * 14) * 0.0085 * (1 - frac * 0.65);
    const r = Math.hypot(x, z);
    const nr = r + pleat;
    pos.setX(i, (x / r) * nr * 1.06);
    pos.setZ(i, (z / r) * nr * 0.84);
  }
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// ANATOMICAL LIMBS, KNEE-COP, EMBOSSED GREAVES, SANDALS & MODELED HANDS
// ============================================================================

function createAnatomicalThighLathe(len: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.044, 0.015),
    new THREE.Vector2(0.049, len * 0.25),
    new THREE.Vector2(0.062, len * 0.65),
    new THREE.Vector2(0.066, len * 0.88),
    new THREE.Vector2(0.056, len),
    new THREE.Vector2(0.0, len),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createAnatomicalGreaveLathe(len: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.036, 0.0),
    new THREE.Vector2(0.04, len * 0.18),
    new THREE.Vector2(0.052, len * 0.56), // gastrocnemius calf curve
    new THREE.Vector2(0.055, len * 0.78),
    new THREE.Vector2(0.049, len * 0.94),
    new THREE.Vector2(0.056, len),
    new THREE.Vector2(0.045, len + 0.01),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createKneeCopGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.032);
  s.quadraticCurveTo(0.036, 0.028, 0.034, -0.004);
  s.quadraticCurveTo(0.026, -0.034, 0, -0.038);
  s.quadraticCurveTo(-0.026, -0.034, -0.034, -0.004);
  s.quadraticCurveTo(-0.036, 0.028, 0, 0.032);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.004,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.006);
  return geo;
}

function createCaligaSandalGroup(leatherMat: THREE.Material, skinMat: THREE.Material, goldMat: THREE.Material): THREE.Group {
  const foot = new THREE.Group();
  foot.name = 'caliga_sandal';

  // Anatomical contoured sandal sole sitting flush at local y = 0
  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.028, -0.045);
  soleShape.quadraticCurveTo(-0.036, 0.01, -0.036, 0.065);
  soleShape.quadraticCurveTo(-0.025, 0.095, 0.002, 0.096);
  soleShape.quadraticCurveTo(0.032, 0.092, 0.035, 0.058);
  soleShape.quadraticCurveTo(0.032, 0.0, 0.028, -0.045);
  soleShape.quadraticCurveTo(0, -0.056, -0.028, -0.045);
  soleShape.closePath();

  const soleGeo = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.011,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  soleGeo.rotateX(Math.PI / 2); // now Y goes from 0 down to -0.017; shift up so bottom is at y = 0
  soleGeo.computeBoundingBox();
  const minY = soleGeo.boundingBox!.min.y;
  soleGeo.translate(0, -minY, 0.022);

  const sole = new THREE.Mesh(soleGeo, leatherMat);
  foot.add(sole);

  // Anatomical forefoot + toes resting on top of sole
  const instep = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.062, 8, 16), skinMat);
  instep.rotation.x = Math.PI * 0.44;
  instep.scale.set(1.12, 1.0, 0.68);
  instep.position.set(0, 0.032, 0.034);
  foot.add(instep);

  // Heel cup + ankle/instep leather caligae straps
  const heelCup = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.033, 0.0),
        new THREE.Vector2(0.036, 0.025),
        new THREE.Vector2(0.033, 0.054),
      ],
      24,
      Math.PI * 0.45,
      Math.PI * 1.1
    ),
    leatherMat
  );
  heelCup.position.set(0, 0.014, -0.004);
  foot.add(heelCup);

  const strapHeights = [0.038, 0.062, 0.086];
  for (let i = 0; i < strapHeights.length; i++) {
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.036 - i * 0.002, 0.0045, 8, 22),
      i === 2 ? goldMat : leatherMat
    );
    strap.rotation.x = Math.PI / 2 + 0.14;
    strap.position.set(0, strapHeights[i], 0.006 + (i === 0 ? 0.022 : 0));
    foot.add(strap);
  }

  return foot;
}

function createArmBicepLathe(len: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.029, 0.01),
    new THREE.Vector2(0.034, len * 0.45),
    new THREE.Vector2(0.039, len * 0.72),
    new THREE.Vector2(0.035, len),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createVambraceLathe(len: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.025, 0.0),
    new THREE.Vector2(0.03, len * 0.35),
    new THREE.Vector2(0.036, len * 0.78),
    new THREE.Vector2(0.033, len),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createModeledHand(skinMat: THREE.Material, mirrorX: 1 | -1): THREE.Group {
  const hand = new THREE.Group();
  hand.name = mirrorX < 0 ? 'modeled_hand_L' : 'modeled_hand_R';

  // Beveled palm
  const palmShape = new THREE.Shape();
  palmShape.moveTo(-0.015, 0);
  palmShape.lineTo(0.015, 0);
  palmShape.lineTo(0.017, -0.036);
  palmShape.lineTo(-0.016, -0.036);
  palmShape.closePath();
  const palmGeo = new THREE.ExtrudeGeometry(palmShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
  palmGeo.translate(0, 0, -0.007);
  const palm = new THREE.Mesh(palmGeo, skinMat);
  hand.add(palm);

  // 4 curled fingers
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.022, 6, 8), skinMat);
    finger.position.set((-0.012 + f * 0.0085) * mirrorX, -0.044, 0.009);
    finger.rotation.x = -0.82;
    hand.add(finger);
  }

  // Opposing thumb
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0052, 0.019, 6, 8), skinMat);
  thumb.position.set(-0.017 * mirrorX, -0.02, 0.013);
  thumb.rotation.set(-0.65, 0, mirrorX * 0.55);
  hand.add(thumb);

  return hand;
}

// ============================================================================
// THREE-SEGMENT VOLUMETRIC ROYAL CLOAK WITH WIDE GOLD BORDER (IMAGE 13)
// ============================================================================

function createCloakSegmentGeometry(
  topW: number,
  botW: number,
  segLen: number,
  foldAmp: number,
  curveDepth: number
): { clothGeo: THREE.BufferGeometry; leftTrimGeo: THREE.BufferGeometry; rightTrimGeo: THREE.BufferGeometry } {
  const segX = 28;
  const segY = 10;

  const buildSheet = (uMin: number, uMax: number, zOffset: number, wSegs: number): THREE.BufferGeometry => {
    const geo = new THREE.PlaneGeometry(1, segLen, wSegs, segY);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const rawU = pos.getX(i) + 0.5; // 0..1 across sub-strip
      const u = THREE.MathUtils.lerp(uMin, uMax, rawU) - 0.5; // -0.5..0.5 across full cloak width
      const fracY = 0.5 - pos.getY(i) / segLen; // 0 top -> 1 bottom
      const width = THREE.MathUtils.lerp(topW, botW, fracY);

      const x = u * width;
      // Dramatic vertical Roman drapery folds + gentle backward flare
      const folds =
        Math.sin(u * Math.PI * 7.0) * foldAmp * (0.45 + fracY * 0.55) +
        Math.cos(u * Math.PI * 3.0) * (foldAmp * 0.65);
      const wrapArc = (1 - Math.cos(u * Math.PI * 0.9)) * curveDepth;
      const z = -wrapArc + folds - fracY * 0.032 + zOffset;

      pos.setXYZ(i, x, -fracY * segLen, z);
    }
    geo.computeVertexNormals();
    return geo;
  };

  return {
    clothGeo: buildSheet(0.06, 0.94, 0, segX),
    leftTrimGeo: buildSheet(0.0, 0.075, 0.002, 4),
    rightTrimGeo: buildSheet(0.925, 1.0, 0.002, 4),
  };
}

// ============================================================================
// IMPERIAL AQUILA SCEPTER (IMAGE 13) & SHEATHED GLADIUS
// ============================================================================

function createImperialAquilaScepter(goldMat: THREE.Material, bronzeMat: THREE.Material): THREE.Group {
  const scepter = new THREE.Group();
  scepter.name = 'aquila_scepter';

  // Fluted staff LatheGeometry (0 = bottom ferrule near pedestal, 1.38 = eagle crown)
  const shaftPts = [
    new THREE.Vector2(0.006, 0.0),
    new THREE.Vector2(0.015, 0.05),
    new THREE.Vector2(0.013, 0.55),
    new THREE.Vector2(0.018, 0.58), // hand grip swell
    new THREE.Vector2(0.013, 0.62),
    new THREE.Vector2(0.014, 1.12),
    new THREE.Vector2(0.026, 1.15), // capital collar
    new THREE.Vector2(0.016, 1.17),
    new THREE.Vector2(0.0, 1.18),
  ];
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(shaftPts, 32), bronzeMat);
  scepter.add(shaft);

  // Imperial Orb / Globe
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 18), bronzeMat);
  orb.position.y = 1.215;
  const orbBand = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.006, 10, 28), goldMat);
  orbBand.rotation.x = Math.PI / 2;
  orbBand.position.y = 1.215;
  scepter.add(orb, orbBand);

  // Sculpted Aquila Eagle perched atop globe
  const eagleGroup = new THREE.Group();
  eagleGroup.position.y = 1.26;
  eagleGroup.name = 'aquila_eagle';

  const bodyPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.022, 0.02),
    new THREE.Vector2(0.028, 0.06),
    new THREE.Vector2(0.022, 0.1),
    new THREE.Vector2(0.012, 0.125),
    new THREE.Vector2(0.0, 0.135),
  ];
  const eagleBody = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 32), goldMat);
  eagleBody.scale.set(0.9, 1, 1.15);
  eagleGroup.add(eagleBody);

  // Sculpted Eagle Head & Hooked Beak (ExtrudeGeometry)
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.012, 0);
  headShape.quadraticCurveTo(-0.015, 0.032, 0.008, 0.034);
  headShape.quadraticCurveTo(0.026, 0.032, 0.034, 0.016); // beak top
  headShape.quadraticCurveTo(0.032, 0.006, 0.024, 0.012); // hooked tip
  headShape.lineTo(0.012, 0.014);
  headShape.lineTo(0.01, -0.006);
  headShape.closePath();
  const eagleHeadGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
  eagleHeadGeo.translate(0, 0, -0.007);
  const eagleHead = new THREE.Mesh(eagleHeadGeo, goldMat);
  eagleHead.position.set(0, 0.118, 0.004);
  eagleHead.rotation.y = -0.35; // proud Roman Aquila profile turn
  eagleGroup.add(eagleHead);

  // Dramatic Feathered Wings (ExtrudeGeometry with scalloped primary/secondary feather silhouette)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.01);
  wingShape.quadraticCurveTo(0.075, 0.085, 0.175, 0.132);
  wingShape.lineTo(0.156, 0.1);
  wingShape.lineTo(0.168, 0.095);
  wingShape.lineTo(0.138, 0.068);
  wingShape.lineTo(0.148, 0.062);
  wingShape.lineTo(0.115, 0.036);
  wingShape.lineTo(0.12, 0.028);
  wingShape.quadraticCurveTo(0.065, -0.008, 0.015, -0.014);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.0035,
    bevelSize: 0.0025,
    bevelSegments: 3,
  });
  wingGeo.translate(0, 0, -0.004);

  const rightWing = new THREE.Mesh(wingGeo, goldMat);
  rightWing.position.set(0.014, 0.068, -0.006);
  rightWing.rotation.y = -0.14;

  const leftWing = new THREE.Mesh(wingGeo, goldMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.014, 0.068, -0.006);
  leftWing.rotation.y = 0.14;

  // Tail feathers fan
  const tailShape = new THREE.Shape();
  tailShape.moveTo(-0.012, 0);
  tailShape.lineTo(0.012, 0);
  tailShape.lineTo(0.028, -0.055);
  tailShape.lineTo(0, -0.062);
  tailShape.lineTo(-0.028, -0.055);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  const tail = new THREE.Mesh(tailGeo, goldMat);
  tail.position.set(0, 0.018, -0.014);
  tail.rotation.x = 0.35;

  eagleGroup.add(rightWing, leftWing, tail);
  scepter.add(eagleGroup);
  return scepter;
}

function createSheathedImperialGladius(leatherMat: THREE.Material, goldMat: THREE.Material): THREE.Group {
  const sword = new THREE.Group();
  sword.name = 'sheathed_gladius';

  // Tapered beveled scabbard (origin at top hilt/pommel junction so handL grips cleanly)
  const scabbardShape = new THREE.Shape();
  scabbardShape.moveTo(-0.022, 0);
  scabbardShape.lineTo(0.022, 0);
  scabbardShape.lineTo(0.017, -0.31);
  scabbardShape.lineTo(0, -0.37);
  scabbardShape.lineTo(-0.017, -0.31);
  scabbardShape.closePath();

  const scabbardGeo = new THREE.ExtrudeGeometry(scabbardShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
  scabbardGeo.translate(0, 0, -0.007);
  const scabbardBody = new THREE.Mesh(scabbardGeo, leatherMat);
  sword.add(scabbardBody);

  // Ornate gold locket, mid band & chape tip
  for (const y of [-0.018, -0.14, -0.31]) {
    const band = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.023, -0.01),
          new THREE.Vector2(0.026, 0),
          new THREE.Vector2(0.023, 0.01),
        ],
        24
      ),
      goldMat
    );
    band.scale.set(1.05, 1, 0.65);
    band.position.y = y;
    sword.add(band);
  }

  // Hilt: crossguard, ribbed grip & spherical pommel
  const guard = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.018, 0),
        new THREE.Vector2(0.036, 0.012),
        new THREE.Vector2(0.022, 0.024),
      ],
      24
    ),
    goldMat
  );
  guard.scale.set(1.25, 1, 0.72);
  guard.position.y = 0.005;

  const grip = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.014, 0),
        new THREE.Vector2(0.017, 0.025),
        new THREE.Vector2(0.013, 0.05),
        new THREE.Vector2(0.017, 0.075),
        new THREE.Vector2(0.014, 0.095),
      ],
      24
    ),
    goldMat
  );
  grip.position.y = 0.025;

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 16), goldMat);
  pommel.position.y = 0.132;

  sword.add(guard, grip, pommel);
  return sword;
}

// ============================================================================
// MAIN KING V2 BUILDER (IMAGE 13 GROUND TRUTH)
// ============================================================================

export function buildKingV2(
  palette: MaterialPalette,
  color: PieceColor,
  addPedestalWithEmblemsFn: (
    root: THREE.Group,
    palette: MaterialPalette,
    color: PieceColor,
    type: PieceSymbol,
    selectableMeshes: THREE.Mesh[]
  ) => void
): KingV2RigHierarchy {
  const isWhite = color === 'w';
  const armorMat = isWhite ? palette.kingWhiteGold : palette.kingBlackArmor;
  const trimMat = isWhite ? palette.kingWhiteGold : palette.kingBlackTrim;
  const bronzeMat = isWhite ? palette.kingWhiteBronze : palette.kingBlackTrim;
  const clothMat = isWhite ? palette.kingWhiteCloth : palette.kingBlackCloth;
  const skinMat = isWhite ? palette.kingWhiteSkin : palette.kingBlackSkin;
  const gemMat = isWhite ? palette.kingWhiteGem : palette.kingBlackGem;
  const leatherMat = palette.kingLeather;

  const root = new THREE.Group();
  root.name = 'king_v2_root';
  root.userData.color = color;
  root.userData.type = 'k';
  root.userData.modelVersion = 'v2';

  const selectableMeshes: THREE.Mesh[] = [];
  addPedestalWithEmblemsFn(root, palette, color, 'k', selectableMeshes);

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'bodyGroup';
  bodyGroup.position.y = KING_PEDESTAL_HEIGHT;
  bodyGroup.rotation.y = isWhite ? Math.PI : 0;
  root.add(bodyGroup);

  // ==========================================================================
  // 1. PELVIS -> HIPS -> KNEES -> GREAVES -> ROMAN SANDALS (Legs ~ 1/2 height)
  // ==========================================================================
  const PELVIS_Y = 0.64;
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, PELVIS_Y, 0);
  bodyGroup.add(pelvis);

  // Pleated Crimson/Purple Imperial Tunic Skirt + Gold Border
  const tunic = new THREE.Mesh(createPleatedTunicLatheAndFlutes(0.118, 0.168, 0.285), clothMat);
  tunic.position.y = -0.265;
  pelvis.add(tunic);

  const tunicGoldHem = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.165, 0),
        new THREE.Vector2(0.172, 0.012),
        new THREE.Vector2(0.169, 0.026),
        new THREE.Vector2(0.163, 0.028),
      ],
      36
    ),
    trimMat
  );
  tunicGoldHem.scale.set(1.06, 1, 0.84);
  tunicGoldHem.position.y = -0.265;
  pelvis.add(tunicGoldHem);

  // Imperial Cingulum Belt + Studded Double-Tier Pteruges Lappets
  const waistBelt = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.124, 0.0),
        new THREE.Vector2(0.132, 0.018),
        new THREE.Vector2(0.128, 0.036),
      ],
      32
    ),
    trimMat
  );
  waistBelt.scale.set(1.06, 1, 0.82);
  waistBelt.position.y = -0.008;
  pelvis.add(waistBelt);

  const lappetLongGeo = createPterugesLappetGeo(0.042, 0.21, 0.01);
  const lappetShortGeo = createPterugesLappetGeo(0.044, 0.115, 0.012);
  const studGeo = new THREE.SphereGeometry(0.0055, 8, 6);

  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const strap = new THREE.Mesh(lappetLongGeo, leatherMat);
    strap.position.set(Math.sin(ang) * 0.13, -0.012, Math.cos(ang) * 0.104);
    strap.rotation.y = ang;
    strap.rotation.x = -0.1;
    pelvis.add(strap);

    const tipStud = new THREE.Mesh(studGeo, trimMat);
    tipStud.position.set(Math.sin(ang) * 0.144, -0.185, Math.cos(ang) * 0.118);
    pelvis.add(tipStud);
  }

  for (let i = 0; i < 10; i++) {
    const ang = ((i + 0.5) / 10) * Math.PI * 2;
    const strap = new THREE.Mesh(lappetShortGeo, armorMat);
    strap.position.set(Math.sin(ang) * 0.135, -0.004, Math.cos(ang) * 0.108);
    strap.rotation.y = ang;
    strap.rotation.x = -0.14;
    pelvis.add(strap);
  }

  // Sheathed Gladius at Left Hip (pelvis)
  const scabbard = createSheathedImperialGladius(leatherMat, trimMat);
  scabbard.position.set(-0.15, -0.055, 0.035);
  scabbard.rotation.set(0.58, 0.1, 0.14);
  pelvis.add(scabbard);

  // Articulated Legs: pelvis -> hipL / hipR -> kneeL / kneeR
  const thighLen = 0.295;
  const shinLen = 0.31;
  const buildLegChain = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.name = side < 0 ? 'hipL' : 'hipR';
    hip.position.set(side * 0.088, -0.015, 0.0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(createAnatomicalThighLathe(thighLen), skinMat);
    thigh.position.y = -thighLen;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.name = side < 0 ? 'kneeL' : 'kneeR';
    knee.position.set(0, -thighLen, 0.008);
    hip.add(knee);

    const kneeCop = new THREE.Mesh(createKneeCopGeo(), armorMat);
    kneeCop.position.set(0, 0.006, 0.044);
    knee.add(kneeCop);

    const greave = new THREE.Mesh(createAnatomicalGreaveLathe(shinLen), armorMat);
    greave.position.y = -shinLen + 0.015;
    knee.add(greave);

    const shinRidge = new THREE.Mesh(
      createPterugesLappetGeo(0.018, shinLen * 0.82, 0.008),
      trimMat
    );
    shinRidge.position.set(0, -0.01, 0.048);
    knee.add(shinRidge);

    const sandal = createCaligaSandalGroup(leatherMat, skinMat, trimMat);
    // Pelvis (0.64) + hip (-0.015) + knee (-0.295) = 0.330 above pedestal -> sandal sole at -0.330 sits flush at y = 0!
    sandal.position.set(0, -0.33, 0.012);
    knee.add(sandal);

    return { hip, knee };
  };

  const legL = buildLegChain(-1);
  const legR = buildLegChain(1);

  // ==========================================================================
  // 2. SPINE -> CHEST -> CUIRASS, PAULDRONS, NECK & SCULPTED HEAD
  // ==========================================================================
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.025, 0);
  pelvis.add(spine);

  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.115, 0);
  spine.add(chest);

  // Anatomical Muscle Cuirass (shifted slightly below chest pivot so spine/waist overlaps seamlessly)
  const cuirass = new THREE.Mesh(createSculptedCuirassGeo(), armorMat);
  cuirass.position.y = -0.105;
  chest.add(cuirass);

  // Raised Beveled Pectoral Plates & Center Sternum Medallion
  const pecGeo = createBeveledPectoralPlateGeo();
  const pecR = new THREE.Mesh(pecGeo, armorMat);
  pecR.position.set(0.012, 0.085, 0.095);
  pecR.rotation.y = 0.24;
  const pecL = new THREE.Mesh(pecGeo, armorMat);
  pecL.scale.x = -1;
  pecL.position.set(-0.012, 0.085, 0.095);
  pecL.rotation.y = -0.24;
  chest.add(pecR, pecL);

  const chestSun = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.024, 0.002),
        new THREE.Vector2(0.02, 0.009),
        new THREE.Vector2(0.0, 0.012),
      ],
      24
    ),
    trimMat
  );
  chestSun.rotation.x = Math.PI / 2;
  chestSun.position.set(0, 0.055, 0.104);
  chest.add(chestSun);

  // 3 Imperial Gems along Lower Cuirass Waist Arch (Image 13)
  for (let g = -1; g <= 1; g++) {
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 16), trimMat);
    bezel.position.set(g * 0.044, -0.092 + Math.abs(g) * 0.008, 0.094 - Math.abs(g) * 0.01);
    bezel.rotation.y = g * 0.36;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.0095, 1), gemMat);
    gem.position.copy(bezel.position);
    gem.position.z += 0.003;
    chest.add(bezel, gem);
  }

  // Draped Crimson Shoulder Cowl + Golden Fibula Brooch (Image 13 Front & Side)
  const cowlCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.145, 0.165, -0.045),
    new THREE.Vector3(-0.115, 0.145, 0.068),
    new THREE.Vector3(0.0, 0.118, 0.108),
    new THREE.Vector3(0.115, 0.145, 0.072),
    new THREE.Vector3(0.148, 0.165, -0.045),
  ]);
  const cowlMesh = new THREE.Mesh(new THREE.TubeGeometry(cowlCurve, 28, 0.024, 12, false), clothMat);
  cowlMesh.scale.set(1, 0.85, 1.05);
  chest.add(cowlMesh);

  const brooch = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.02, 0.002),
        new THREE.Vector2(0.018, 0.009),
        new THREE.Vector2(0, 0.013),
      ],
      24
    ),
    trimMat
  );
  brooch.rotation.x = Math.PI / 2;
  brooch.position.set(0.102, 0.148, 0.088);
  brooch.rotation.z = -0.35;
  chest.add(brooch);

  // ==========================================================================
  // 3. NECK -> SCULPTED HEAD, FACE, RADIATE SUN-RAY CROWN & CREST
  // ==========================================================================
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.185, 0.004);
  chest.add(neck);

  const neckMesh = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.056, 0.0),
        new THREE.Vector2(0.047, 0.032),
        new THREE.Vector2(0.044, 0.068),
        new THREE.Vector2(0.048, 0.085),
      ],
      32
    ),
    skinMat
  );
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.078, 0.006);
  neck.add(head);

  // Sculpted Anatomical Face & Cranium
  const cranium = new THREE.Mesh(createSculptedCaesarHeadGeo(), skinMat);
  cranium.position.y = 0.064;
  head.add(cranium);

  const nose = new THREE.Mesh(createSculptedNoseGeo(), skinMat);
  nose.position.set(0, 0.062, 0.056);
  head.add(nose);

  const upperLip = new THREE.Mesh(createSculptedLipGeo(0.026, 0.0055), skinMat);
  upperLip.position.set(0, 0.03, 0.059);
  const lowerLip = new THREE.Mesh(createSculptedLipGeo(0.022, 0.005), skinMat);
  lowerLip.position.set(0, 0.023, 0.057);
  head.add(upperLip, lowerLip);

  // 3D Modeled Eyes + Furrowed Brows + Ears
  const scleraMat = palette.parchment;
  const irisMat = palette.brazierIron;
  const earGeo = createEarGeo();

  for (const side of [-1, 1] as const) {
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 14, 12), scleraMat);
    eyeball.position.set(side * 0.02, 0.072, 0.051);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), irisMat);
    iris.position.set(side * 0.02, 0.072, 0.0555);
    const eyelid = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032, 0.012, 4, 8), skinMat);
    eyelid.rotation.z = Math.PI / 2 - side * 0.08;
    eyelid.position.set(side * 0.02, 0.078, 0.054);

    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.054, 0.064, -0.002);
    ear.rotation.y = side * 0.35;
    head.add(eyeball, iris, eyelid, ear);
  }

  // Sculpted Roman Imperial Helmet Bowl + Neck Guard + Cheek Guards (Image 13)
  const helmBowl = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.068, 0.0),
        new THREE.Vector2(0.069, 0.022),
        new THREE.Vector2(0.065, 0.055),
        new THREE.Vector2(0.048, 0.078),
        new THREE.Vector2(0.0, 0.086),
      ],
      36
    ),
    armorMat
  );
  helmBowl.position.set(0, 0.084, -0.003);
  head.add(helmBowl);

  // Rear Galea Neck Guard
  const neckGuard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.086, 0.024, 28, 1, true, Math.PI * 0.62, Math.PI * 0.76),
    armorMat
  );
  neckGuard.position.set(0, 0.072, -0.006);
  head.add(neckGuard);

  // Articulated Cheek Guards hugging the jaw
  const cheekGuardGeo = createCheekGuardGeo();
  for (const side of [-1, 1] as const) {
    const cg = new THREE.Mesh(cheekGuardGeo, armorMat);
    cg.position.set(side * 0.056, 0.054, 0.014);
    cg.rotation.y = side * 1.18;
    head.add(cg);
  }

  // Ornate Embossed Crown Band + Forehead Ruby
  const crownBand = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.067, 0.0),
        new THREE.Vector2(0.073, 0.008),
        new THREE.Vector2(0.071, 0.022),
        new THREE.Vector2(0.074, 0.03),
        new THREE.Vector2(0.067, 0.034),
      ],
      36
    ),
    trimMat
  );
  crownBand.position.set(0, 0.09, -0.003);
  head.add(crownBand);

  const foreheadGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 1), gemMat);
  foreheadGem.position.set(0, 0.108, 0.069);
  head.add(foreheadGem);

  // 9 Tapered Beveled Radiate Crown Sun-Rays (Image 13)
  const rayGeo = createSunRaySpikeGeo(0.108, 0.014);
  for (let i = 0; i < 9; i++) {
    const frac = (i / 8) * 2 - 1; // -1 .. +1 fan across front & sides
    const ang = frac * Math.PI * 0.68;
    const ray = new THREE.Mesh(rayGeo, trimMat);
    ray.position.set(Math.sin(ang) * 0.066, 0.118, Math.cos(ang) * 0.064 - 0.002);
    ray.rotation.y = ang;
    ray.rotation.x = -0.22; // flare gracefully outward
    head.add(ray);
  }

  // Imperial Crimson Crest Plume rising behind crown rays
  const crest = new THREE.Mesh(createImperialCrestPlumeGeo(), clothMat);
  crest.position.set(0, 0.125, 0.015);
  head.add(crest);

  // ==========================================================================
  // 4. ARMS: CHEST -> SHOULDER L/R -> ELBOW L/R -> HAND L/R + AQUILA SCEPTER
  // ==========================================================================
  const pldPterugesGeo = createPterugesLappetGeo(0.034, 0.088, 0.007);

  const buildArmChain = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'shoulderL' : 'shoulderR';
    shoulder.position.set(side * 0.186, 0.155, 0.0);
    chest.add(shoulder);

    // Sculpted Shoulder Pauldron Dome + Hanging Shoulder Pteruges Lappets
    const pauldronCap = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.0, 0.038),
          new THREE.Vector2(0.032, 0.035),
          new THREE.Vector2(0.056, 0.018),
          new THREE.Vector2(0.062, -0.012),
        ],
        32
      ),
      armorMat
    );
    pauldronCap.position.set(side * 0.008, 0.006, 0);
    pauldronCap.rotation.z = -side * 0.42;
    shoulder.add(pauldronCap);

    for (let k = -1; k <= 1; k++) {
      const strip = new THREE.Mesh(pldPterugesGeo, leatherMat);
      strip.position.set(side * 0.044, -0.005, k * 0.032);
      strip.rotation.y = side * Math.PI * 0.5 + k * 0.28;
      strip.rotation.x = -0.18;
      shoulder.add(strip);
    }

    // Tunic Sleeve + Muscular Bicep
    const sleeve = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.044, -0.085),
          new THREE.Vector2(0.048, -0.04),
          new THREE.Vector2(0.045, 0.0),
        ],
        32
      ),
      clothMat
    );
    const bicep = new THREE.Mesh(createArmBicepLathe(0.215), skinMat);
    bicep.position.y = -0.22;
    shoulder.add(sleeve, bicep);

    const elbow = new THREE.Group();
    elbow.name = side < 0 ? 'elbowL' : 'elbowR';
    elbow.position.set(0, -0.215, 0);
    shoulder.add(elbow);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 12), skinMat);
    const vambrace = new THREE.Mesh(createVambraceLathe(0.175), armorMat);
    vambrace.position.y = -0.18;
    const wristRim = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0045, 8, 20), trimMat);
    wristRim.rotation.x = Math.PI / 2;
    wristRim.position.y = -0.175;
    elbow.add(elbowJoint, vambrace, wristRim);

    const hand = new THREE.Group();
    hand.name = side < 0 ? 'handL' : 'handR';
    hand.position.set(0, -0.182, 0);
    hand.add(createModeledHand(skinMat, side));
    elbow.add(hand);

    return { shoulder, elbow, hand };
  };

  const armL = buildArmChain(-1);
  const armR = buildArmChain(1);

  // Aquila Scepter attached directly inside handR!
  const scepter = createImperialAquilaScepter(trimMat, bronzeMat);
  // Hand grip sits near y = -0.024 local to handR; shaft held dead vertical beside right foot
  scepter.position.set(0.0, -0.024, 0.024);
  scepter.rotation.set(0.94, 0, 0);
  // Offset scepter along its own Y so shaft grip sits inside handR palm and bottom ferrule touches pedestal top
  scepter.children.forEach((ch) => {
    ch.position.y -= 0.625;
  });
  armR.hand.add(scepter);

  // ==========================================================================
  // 5. IMPERIAL 3-SEGMENT CLOAK WITH WIDE GOLD BORDER: CHEST -> CLOAK -> SEG1..3
  // ==========================================================================
  const cloak = new THREE.Group();
  cloak.name = 'cloak';
  cloak.position.set(0, 0.16, -0.088);
  chest.add(cloak);

  const segLens = [0.29, 0.31, 0.34];
  const segWidths: [number, number][] = [
    [0.34, 0.43],
    [0.43, 0.54],
    [0.54, 0.68],
  ];

  const cloakSeg1 = new THREE.Group();
  cloakSeg1.name = 'cloakSeg1';
  cloak.add(cloakSeg1);

  const cloakSeg2 = new THREE.Group();
  cloakSeg2.name = 'cloakSeg2';
  cloakSeg2.position.set(0, -segLens[0] * 0.96, -0.028);
  cloakSeg1.add(cloakSeg2);

  const cloakSeg3 = new THREE.Group();
  cloakSeg3.name = 'cloakSeg3';
  cloakSeg3.position.set(0, -segLens[1] * 0.96, -0.028);
  cloakSeg2.add(cloakSeg3);

  const segGroups = [cloakSeg1, cloakSeg2, cloakSeg3];
  for (let i = 0; i < 3; i++) {
    const geos = createCloakSegmentGeometry(
      segWidths[i][0],
      segWidths[i][1],
      segLens[i],
      0.018 + i * 0.005,
      0.05 + i * 0.012
    );
    const clothMesh = new THREE.Mesh(geos.clothGeo, clothMat);
    const borderL = new THREE.Mesh(geos.leftTrimGeo, trimMat);
    const borderR = new THREE.Mesh(geos.rightTrimGeo, trimMat);
    segGroups[i].add(clothMesh, borderL, borderR);

    if (i === 2) {
      // Wide Gold Bottom Hem Border across cloakSeg3 (Image 13 Back View)
      const botHemGeo = createCloakSegmentGeometry(segWidths[2][1] * 0.94, segWidths[2][1], 0.055, 0.022, 0.072).clothGeo;
      const botHem = new THREE.Mesh(botHemGeo, trimMat);
      botHem.position.set(0, -segLens[2] + 0.055, -0.03);
      cloakSeg3.add(botHem);
    }
  }

  // Enable shadow casting & receiving across all visual meshes (excluding invisible hitbox)
  enableShadows(bodyGroup, selectableMeshes);

  // ==========================================================================
  // 6. NEUTRAL POSE MATCHING IMAGE 13 (7.5-HEAD IMPERIAL CAESAR STANCE)
  // ==========================================================================
  const neutralPose = () => {
    bodyGroup.position.set(0, KING_PEDESTAL_HEIGHT, 0);
    bodyGroup.rotation.set(0, isWhite ? Math.PI : 0, 0);

    pelvis.position.set(0, PELVIS_Y, 0);
    pelvis.rotation.set(0, 0, 0);
    spine.rotation.set(0, 0, 0);
    chest.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);

    // Firm heroic slightly wide stance with soles flush on pedestal
    legL.hip.rotation.set(0, -0.09, 0);
    legL.knee.rotation.set(0, 0, 0);
    legR.hip.rotation.set(0, 0.09, 0);
    legR.knee.rotation.set(0, 0, 0);

    // Right arm holding tall Aquila Scepter dead vertical beside right foot
    armR.shoulder.rotation.set(-0.26, 0.0, -0.12);
    armR.elbow.rotation.set(-0.68, 0.0, 0.12);
    armR.hand.rotation.set(0, 0, 0);

    // Left arm resting cleanly on sheathed sword pommel at left hip
    armL.shoulder.rotation.set(0.08, 0.12, 0.16);
    armL.elbow.rotation.set(-0.66, -0.25, -0.16);
    armL.hand.rotation.set(0, 0, 0);

    cloak.rotation.set(0.04, 0, 0);
    cloakSeg1.rotation.set(0.04, 0, 0);
    cloakSeg2.rotation.set(0.03, 0, 0);
    cloakSeg3.rotation.set(0.02, 0, 0);
  };

  neutralPose();

  const rigData: KingV2RigHierarchy = {
    root,
    bodyGroup,
    pelvis,
    spine,
    chest,
    neck,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    handL: armL.hand,
    handR: armR.hand,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    cloak,
    cloakSeg1,
    cloakSeg2,
    cloakSeg3,
    scepter,
    scabbard,
    // Compatibility aliases
    torso: chest,
    armL: armL.shoulder,
    armR: armR.shoulder,
    forearmL: armL.elbow,
    forearmR: armR.elbow,
    legL: legL.hip,
    legR: legR.hip,
    cape: cloak,
    capeSegs: [cloakSeg1, cloakSeg2, cloakSeg3],
    weapon: scepter,
    selectableMeshes,
    neutralPose,
  };

  root.userData.rig = rigData;
  return rigData;
}
