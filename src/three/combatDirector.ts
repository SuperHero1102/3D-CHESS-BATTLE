import * as THREE from 'three';
import { CombatEvent, CombatPace, PieceColor, PieceSymbol } from '../types/chess';
import { squareToWorld } from './arenaBuilder';
import { PEDESTAL_HEIGHT, WarriorRig, resetPose } from './warriorFactory';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

interface ParticleBurst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
  maxAge: number;
  gravity: number;
  initialOpacity: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
}

interface ActiveMoveAnim {
  rig: WarriorRig;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  progress: number;
  duration: number;
  isKnight: boolean;
  dustTimer: number;
}

interface DissolveUniform {
  value: number;
}

interface ActiveCombatAnim {
  event: CombatEvent;
  attacker: WarriorRig;
  defender: WarriorRig;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  elapsed: number;
  duration: number;
  hitStopRemaining: number;
  shieldBashFired: boolean;
  impactFired: boolean;
  dissolveStarted: boolean;
  dissolveProgress: DissolveUniform;
  clonedVictimMats: THREE.Material[];
  magicRing?: THREE.Mesh;
  magicBeam?: THREE.Mesh;
  lightningBolt?: THREE.Mesh;
  flashLight?: THREE.PointLight;
  onComplete: () => void;
}

function createZigZagLightningGeo(targetWorld: THREE.Vector3): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const y = THREE.MathUtils.lerp(4.6, 0.35, frac);
    const jitter = i === 0 || i === steps ? 0 : 0.24;
    pts.push(
      new THREE.Vector3(
        targetWorld.x + (Math.random() - 0.5) * jitter,
        y,
        targetWorld.z + (Math.random() - 0.5) * jitter
      )
    );
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.045, 6, false);
}

export class CombatDirector {
  private scene: THREE.Scene;
  private smokeTex?: THREE.Texture;
  private emberTex?: THREE.Texture;
  private particles: ParticleBurst[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private moveAnims: ActiveMoveAnim[] = [];
  private activeCombat: ActiveCombatAnim | null = null;
  public cameraShake = 0;
  public lowPerfMode = false;
  public combatCameraTarget: THREE.Vector3 | null = null;
  public combatCameraDesiredPos: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, textures?: { smokeTex?: THREE.Texture; emberTex?: THREE.Texture }) {
    this.scene = scene;
    this.smokeTex = textures?.smokeTex;
    this.emberTex = textures?.emberTex;
  }

  public isBusy(): boolean {
    return this.activeCombat !== null;
  }

  public spawnBurst(
    origin: THREE.Vector3,
    colorHex: number,
    count = 40,
    upward = 2.4,
    options?: { size?: number; gravity?: number; maxAge?: number; additive?: boolean; spread?: number }
  ) {
    const cappedCount = this.lowPerfMode ? Math.max(8, Math.floor(count * 0.4)) : count;
    if (this.particles.length > (this.lowPerfMode ? 8 : 22)) return;

    const positions = new Float32Array(cappedCount * 3);
    const velocities = new Float32Array(cappedCount * 3);
    const spread = options?.spread ?? 0.22;
    for (let i = 0; i < cappedCount; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = origin.y + 0.35 + Math.random() * 0.55;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.7 + Math.random() * 2.4;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 0.5 + Math.random() * upward;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.emberTex,
      color: colorHex,
      size: (options?.size ?? 0.1) * 1.45,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: options?.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({
      points,
      velocities,
      age: 0,
      maxAge: options?.maxAge ?? 0.9,
      gravity: options?.gravity ?? 4.2,
      initialOpacity: 1,
    });
  }

  public spawnDustPuff(origin: THREE.Vector3, count = 8) {
    const cappedCount = this.lowPerfMode ? Math.max(3, Math.floor(count * 0.4)) : count;
    if (this.particles.length > (this.lowPerfMode ? 8 : 22)) return;

    const positions = new Float32Array(cappedCount * 3);
    const velocities = new Float32Array(cappedCount * 3);
    for (let i = 0; i < cappedCount; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.34;
      positions[i * 3 + 1] = 0.05 + Math.random() * 0.1;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.34;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.25 + Math.random() * 0.65;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 0.32 + Math.random() * 0.42;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.smokeTex,
      color: 0xd4cab8,
      size: 0.4,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({
      points,
      velocities,
      age: 0,
      maxAge: 0.5,
      gravity: 0.35,
      initialOpacity: 0.44,
    });
  }

  public spawnAshDissolve(origin: THREE.Vector3) {
    const count = this.lowPerfMode ? 24 : 62;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.46;
      positions[i * 3 + 1] = 0.14 + Math.random() * 1.1;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.46;

      const angle = Math.random() * Math.PI * 2;
      const drift = 0.18 + Math.random() * 0.65;
      velocities[i * 3] = Math.cos(angle) * drift;
      velocities[i * 3 + 1] = 0.8 + Math.random() * 1.45;
      velocities[i * 3 + 2] = Math.sin(angle) * drift;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.smokeTex,
      color: 0xa1a8b5,
      size: 0.28,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({
      points,
      velocities,
      age: 0,
      maxAge: 1.05,
      gravity: -0.4,
      initialOpacity: 0.88,
    });

    this.spawnBurst(origin, 0xff8c2b, 28, 2.1, {
      size: 0.085,
      gravity: 0.4,
      maxAge: 0.9,
      additive: true,
      spread: 0.38,
    });
  }

  public spawnShockwave(origin: THREE.Vector3, colorHex: number) {
    const geo = new THREE.RingGeometry(0.18, 0.32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(origin.x, 0.04, origin.z);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.68 });
  }

  public queueSimpleMove(rig: WarriorRig, fromSq: string, toSq: string, type: PieceSymbol) {
    const startPos = squareToWorld(fromSq, new THREE.Vector3());
    const endPos = squareToWorld(toSq, new THREE.Vector3());
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      rig.bodyGroup.rotation.y = Math.atan2(dx, dz);
    }
    this.spawnDustPuff(startPos, 8);
    this.moveAnims.push({
      rig,
      startPos,
      endPos,
      progress: 0,
      duration: type === 'n' ? 0.56 : 0.42,
      isKnight: type === 'n',
      dustTimer: 0,
    });
  }

  public startCaptureCombat(
    event: CombatEvent,
    attacker: WarriorRig,
    defender: WarriorRig,
    pace: CombatPace,
    onComplete: () => void
  ) {
    const startPos = squareToWorld(event.from, new THREE.Vector3());
    const targetPos = squareToWorld(event.to, new THREE.Vector3());

    if (pace === 'off') {
      attacker.root.position.copy(targetPos);
      resetPose(attacker.root);
      this.spawnBurst(targetPos, 0xffd166, 26);
      this.spawnAshDissolve(targetPos);
      onComplete();
      return;
    }

    const duration = pace === 'fast' ? 0.85 : 2.05;

    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    const attackAngle = Math.atan2(dx, dz);
    attacker.bodyGroup.rotation.y = attackAngle;
    defender.bodyGroup.rotation.y = attackAngle + Math.PI;

    const mid = new THREE.Vector3().lerpVectors(startPos, targetPos, 0.65);
    const perp = new THREE.Vector3(-dz, 0, dx).normalize();
    if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
    this.combatCameraTarget = new THREE.Vector3(mid.x, 0.78, mid.z);
    this.combatCameraDesiredPos = new THREE.Vector3(
      mid.x + perp.x * 3.1 - (dx === 0 && dz === 0 ? 0 : Math.sign(dx) * 0.65),
      2.35,
      mid.z + perp.z * 3.1 + 1.65
    );

    const accentHex = event.attackerColor === 'w' ? 0xffc646 : 0xb26bff;
    let magicRing: THREE.Mesh | undefined;
    let magicBeam: THREE.Mesh | undefined;
    let lightningBolt: THREE.Mesh | undefined;
    let flashLight: THREE.PointLight | undefined;

    if (event.attackerType === 'b' || event.attackerType === 'q' || event.attackerType === 'k') {
      const ringGeo = new THREE.RingGeometry(0.4, 0.56, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      magicRing = new THREE.Mesh(ringGeo, ringMat);
      magicRing.rotation.x = -Math.PI / 2;
      magicRing.position.set(startPos.x, 0.04, startPos.z);
      this.scene.add(magicRing);
    }

    if (event.attackerType === 'b') {
      const beamGeo = new THREE.CylinderGeometry(0.055, 0.11, 1.0, 12);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentHex).multiplyScalar(1.8),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      magicBeam = new THREE.Mesh(beamGeo, beamMat);
      magicBeam.visible = false;
      this.scene.add(magicBeam);

      flashLight = new THREE.PointLight(accentHex, 0, 7, 1.5);
      flashLight.position.set(startPos.x, 1.35, startPos.z);
      this.scene.add(flashLight);
    } else if (event.attackerType === 'k') {
      const boltGeo = createZigZagLightningGeo(targetPos);
      const boltMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.4, 1.9, 0.7),
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      lightningBolt = new THREE.Mesh(boltGeo, boltMat);
      lightningBolt.visible = false;
      this.scene.add(lightningBolt);

      flashLight = new THREE.PointLight(0xffe07a, 0, 9, 1.4);
      flashLight.position.set(targetPos.x, 1.8, targetPos.z);
      this.scene.add(flashLight);
    }

    this.activeCombat = {
      event,
      attacker,
      defender,
      startPos,
      targetPos,
      elapsed: 0,
      duration,
      hitStopRemaining: 0,
      shieldBashFired: false,
      impactFired: false,
      dissolveStarted: false,
      dissolveProgress: { value: 0 },
      clonedVictimMats: [],
      magicRing,
      magicBeam,
      lightningBolt,
      flashLight,
      onComplete,
    };
  }

  private applyVictimAshDissolveShader(combat: ActiveCombatAnim) {
    const progressUniform = combat.dissolveProgress;
    combat.defender.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
      const orig = obj.material;
      if (Array.isArray(orig)) return;
      const cloned = orig.clone();
      cloned.transparent = true;
      cloned.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.uniforms.uDissolve = progressUniform;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vDissolveY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDissolveY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uDissolve;\nvarying float vDissolveY;')
          .replace(
            '#include <dithering_fragment>',
            `
            float cutoff = mix(-0.1, 1.65, uDissolve);
            if (vDissolveY < cutoff) discard;
            float edge = smoothstep(cutoff + 0.14, cutoff, vDissolveY);
            gl_FragColor.rgb += vec3(1.4, 0.55, 0.12) * edge * step(0.01, uDissolve);
            gl_FragColor.a *= (1.0 - uDissolve * 0.45);
            #include <dithering_fragment>
            `
          );
      };
      obj.material = cloned;
      combat.clonedVictimMats.push(cloned);
    });
  }

  public skipActiveCombat() {
    if (!this.activeCombat) return;
    this.finishCombat(this.activeCombat);
  }

  private finishCombat(combat: ActiveCombatAnim) {
    if (combat.magicRing) {
      this.scene.remove(combat.magicRing);
      combat.magicRing.geometry.dispose();
      (combat.magicRing.material as THREE.Material).dispose();
    }
    if (combat.magicBeam) {
      this.scene.remove(combat.magicBeam);
      combat.magicBeam.geometry.dispose();
      (combat.magicBeam.material as THREE.Material).dispose();
    }
    if (combat.lightningBolt) {
      this.scene.remove(combat.lightningBolt);
      combat.lightningBolt.geometry.dispose();
      (combat.lightningBolt.material as THREE.Material).dispose();
    }
    if (combat.flashLight) {
      this.scene.remove(combat.flashLight);
    }
    for (const m of combat.clonedVictimMats) {
      m.dispose();
    }

    combat.attacker.root.position.copy(combat.targetPos);
    resetPose(combat.attacker.root);
    combat.attacker.bodyGroup.rotation.y = combat.event.attackerColor === 'w' ? Math.PI : 0;

    this.combatCameraTarget = null;
    this.combatCameraDesiredPos = null;
    this.activeCombat = null;
    combat.onComplete();
  }

  public resetRigPose(rig: WarriorRig, color: PieceColor) {
    resetPose(rig.root);
    rig.bodyGroup.rotation.y = color === 'w' ? Math.PI : 0;
  }

  public update(delta: number, elapsedTime: number, allRigs: WarriorRig[]) {
    const dt = Math.min(delta, 0.05);

    // 1. Living Roman Battlefield Idle Breathing (unique random phase per warrior)
    for (let i = 0; i < allRigs.length; i++) {
      const rig = allRigs[i];
      if (rig.root.userData.idlePhase === undefined) {
        rig.root.userData.idlePhase = Math.random() * Math.PI * 2;
      }
      if (rig.mixer) {
        rig.mixer.update(dt);
      }
      if (this.activeCombat && (rig === this.activeCombat.attacker || rig === this.activeCombat.defender)) {
        continue;
      }

      const phase = rig.root.userData.idlePhase as number;
      const breathe = Math.sin(elapsedTime * 1.9 + phase);
      const liftY = (rig.root.userData.selectLiftY as number) || 0;
      rig.bodyGroup.position.y = PEDESTAL_HEIGHT + liftY + breathe * 0.007;

      if (!rig.isGlb) {
        if (rig.spinePivot) {
          rig.spinePivot.rotation.x = breathe * 0.015;
          rig.torso.rotation.x = breathe * 0.012;
        } else {
          rig.torso.rotation.x = breathe * 0.018;
        }
        if (rig.neckPivot) {
          rig.neckPivot.rotation.x = breathe * 0.014;
        }
        rig.headPivot.rotation.x = breathe * 0.022;
        rig.headPivot.rotation.y = Math.sin(elapsedTime * 0.85 + phase) * 0.045;
      }

      if (rig.capeSegs && rig.capeSegs.length > 0) {
        for (let s = 0; s < rig.capeSegs.length; s++) {
          const baseTilt = rig.horseGroup ? 0.24 : 0.06;
          rig.capeSegs[s].rotation.x = baseTilt + Math.sin(elapsedTime * 2.5 + phase - s * 0.75) * (0.045 + s * 0.025);
        }
      }

      if (rig.crystalMesh) {
        rig.crystalMesh.rotation.y += dt * 1.9;
        rig.crystalMesh.position.y = 1.11 + Math.sin(elapsedTime * 2.8 + phase) * 0.018;
      }
      if (rig.staffLight) {
        rig.staffLight.intensity = 2.2 + Math.sin(elapsedTime * 3.8 + phase) * 0.55;
      }
      if (rig.auraMesh) {
        rig.auraMesh.rotation.z += dt * 2.2;
        rig.auraMesh.scale.setScalar(1 + Math.sin(elapsedTime * 3.1 + phase) * 0.09);
      }
      if (rig.horseGroup && rig.horseLegs) {
        rig.horseGroup.rotation.x = (rig.baseHorsePitch ?? -0.44) + breathe * 0.026;
        rig.horseLegs.fl.rotation.x = -0.84 + Math.sin(elapsedTime * 2.4 + phase) * 0.08;
        rig.horseLegs.fr.rotation.x = -0.58 + Math.cos(elapsedTime * 2.2 + phase) * 0.07;
      }
      if (rig.horseNeckPivot) {
        rig.horseNeckPivot.rotation.x = Math.sin(elapsedTime * 1.7 + phase) * 0.045;
      }
      if (rig.horseTailPivot) {
        rig.horseTailPivot.rotation.z = Math.sin(elapsedTime * 2.6 + phase) * 0.09;
      }
    }

    // 2. Smooth Move / Gallop + Footstep Dust Pool
    for (let i = this.moveAnims.length - 1; i >= 0; i--) {
      const anim = this.moveAnims[i];
      anim.progress += dt / anim.duration;
      const t = Math.min(1, anim.progress);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      anim.rig.root.position.lerpVectors(anim.startPos, anim.endPos, ease);
      anim.dustTimer += dt;
      if (anim.dustTimer > 0.095 && t < 0.92) {
        anim.dustTimer = 0;
        this.spawnDustPuff(anim.rig.root.position, anim.isKnight ? 6 : 4);
      }

      if (anim.rig.isGlb) {
        anim.rig.root.position.y = Math.sin(t * Math.PI) * (anim.isKnight ? 0.65 : 0.35);
      } else if (anim.isKnight && anim.rig.horseLegs && anim.rig.horseGroup) {
        anim.rig.root.position.y = Math.sin(t * Math.PI) * 0.72;
        anim.rig.horseGroup.rotation.x = -0.18 + Math.cos(t * Math.PI) * 0.25;
        const gallop = Math.sin(t * Math.PI * 4.5) * 0.62;
        anim.rig.horseLegs.fl.rotation.x = -0.35 + gallop;
        anim.rig.horseLegs.fr.rotation.x = -0.35 + gallop * 0.85;
        anim.rig.horseLegs.bl.rotation.x = 0.2 - gallop;
        anim.rig.horseLegs.br.rotation.x = 0.2 - gallop * 0.85;
        if (anim.rig.capeSegs) {
          anim.rig.capeSegs.forEach((s, idx) => (s.rotation.x = 0.45 + idx * 0.14));
        }
      } else {
        const stride = Math.sin(t * Math.PI * 5.5) * 0.48;
        anim.rig.leftLegPivot.rotation.x = stride;
        anim.rig.rightLegPivot.rotation.x = -stride;
        if (anim.rig.leftKneePivot && anim.rig.rightKneePivot) {
          anim.rig.leftKneePivot.rotation.x = Math.max(0, -stride) * 0.9;
          anim.rig.rightKneePivot.rotation.x = Math.max(0, stride) * 0.9;
        }
        if (anim.rig.spinePivot) {
          anim.rig.spinePivot.rotation.y = -stride * 0.22;
          anim.rig.spinePivot.rotation.x = 0.09;
        }
        anim.rig.rightArmPivot.rotation.x = -0.35 - stride * 0.4;
        anim.rig.leftArmPivot.rotation.x = -0.35 + stride * 0.35;
        anim.rig.bodyGroup.position.y = PEDESTAL_HEIGHT + Math.abs(Math.sin(t * Math.PI * 5.5)) * 0.035;
        if (anim.rig.capeSegs) {
          anim.rig.capeSegs.forEach((s, idx) => (s.rotation.x = 0.28 + idx * 0.1));
        }
      }

      if (t >= 1) {
        anim.rig.root.position.copy(anim.endPos);
        this.spawnDustPuff(anim.endPos, 8);
        const color = anim.rig.root.userData.color as PieceColor;
        this.resetRigPose(anim.rig, color);
        this.moveAnims.splice(i, 1);
      }
    }

    // 3. Stage 5: 6 Unique 3-Phase Capture Finishers + Hit-Stop Slow-Mo + Victim Dissolve
    if (this.activeCombat) {
      const c = this.activeCombat;
      let combatDt = dt;
      if (c.hitStopRemaining > 0) {
        c.hitStopRemaining = Math.max(0, c.hitStopRemaining - dt);
        combatDt = dt * 0.22; // ~0.15s brief cinematic hit-stop slow-mo!
      }
      c.elapsed += combatDt;
      const u = Math.min(1, c.elapsed / c.duration);
      const aType = c.event.attackerType;
      const accentHex = c.event.attackerColor === 'w' ? 0xffc646 : 0xb26bff;

      _v1.subVectors(c.targetPos, c.startPos);
      const dist = _v1.length();
      if (dist > 0.01) _v1.normalize();
      const standOffDist = aType === 'b' || aType === 'k' ? Math.min(dist * 0.6, 2.0) : 0.78;
      _v2.copy(c.targetPos).addScaledVector(_v1, -standOffDist);

      if (u < 0.38) {
        // PHASE 1: APPROACH / MARCH / GALLOP / CAST STANCE
        const p = u / 0.38;
        if (aType === 'b') {
          c.attacker.root.position.lerpVectors(c.startPos, _v2, p * 0.45);
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.28, -1.55, p);
          c.attacker.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(-0.72, -0.2, p);
          if (c.magicRing) {
            c.magicRing.position.set(c.attacker.root.position.x, 0.04, c.attacker.root.position.z);
            c.magicRing.rotation.z += dt * 4.5;
            c.magicRing.scale.setScalar(0.65 + p * 0.85);
          }
          if (c.flashLight) {
            c.flashLight.position.set(c.attacker.root.position.x, 1.35, c.attacker.root.position.z);
            c.flashLight.intensity = p * 5.0;
          }
        } else if (aType === 'k') {
          c.attacker.root.position.lerpVectors(c.startPos, _v2, p * 0.65);
          const stride = Math.sin(p * Math.PI * 3.5) * 0.4;
          c.attacker.leftLegPivot.rotation.x = stride;
          c.attacker.rightLegPivot.rotation.x = -stride;
          if (c.attacker.leftKneePivot && c.attacker.rightKneePivot) {
            c.attacker.leftKneePivot.rotation.x = Math.max(0, -stride) * 0.85;
            c.attacker.rightKneePivot.rotation.x = Math.max(0, stride) * 0.85;
          }
          if (c.attacker.spinePivot) {
            c.attacker.spinePivot.rotation.x = THREE.MathUtils.lerp(0, -0.14, p);
          }
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.26, -2.35, p);
          c.attacker.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(-0.68, -0.15, p);
          if (c.attacker.rightHandPivot) {
            c.attacker.rightHandPivot.rotation.x = THREE.MathUtils.lerp(0, -0.25, p);
          }
          if (c.magicRing) {
            c.magicRing.position.set(c.targetPos.x, 0.04, c.targetPos.z);
            c.magicRing.rotation.z -= dt * 5;
            c.magicRing.scale.setScalar(0.5 + p * 0.95);
          }
        } else {
          c.attacker.root.position.lerpVectors(c.startPos, _v2, p);
          if (aType === 'n' && c.attacker.horseLegs && c.attacker.horseGroup) {
            const g = Math.sin(p * Math.PI * 5) * 0.62;
            c.attacker.horseGroup.rotation.x = -0.22 - Math.sin(p * Math.PI) * 0.35;
            c.attacker.horseLegs.fl.rotation.x = -0.5 + g;
            c.attacker.horseLegs.fr.rotation.x = -0.45 + g * 0.9;
            c.attacker.horseLegs.bl.rotation.x = 0.25 - g;
            c.attacker.horseLegs.br.rotation.x = 0.25 - g * 0.9;
            c.attacker.root.position.y = Math.abs(Math.sin(p * Math.PI * 2.2)) * 0.22;
            c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.62, -1.9, p);
          } else {
            const stride = Math.sin(p * Math.PI * 4.5) * 0.54;
            c.attacker.leftLegPivot.rotation.x = stride;
            c.attacker.rightLegPivot.rotation.x = -stride;
            if (aType === 'r') {
              // Rook winds two-handed hammer overhead
              c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.42, -2.55, p);
              c.attacker.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.56, -2.4, p);
            } else if (aType === 'p') {
              // Pawn raises Scutum shield in front for shield bash
              c.attacker.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.32, -1.25, p);
              c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.22, -1.1, p);
            } else if (aType === 'q') {
              // Queen begins agile dash + spin
              c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.26, -1.65, p);
            }
          }
        }
        c.defender.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.32, -1.05, p);
      } else if (u < 0.68) {
        // PHASE 2: UNIQUE FINISHER STRIKE
        const p = (u - 0.38) / 0.3;

        if (aType === 'p') {
          // Pawn: 1) Shield bash slam + spark, 2) Rapid Gladius lunge thrust!
          if (p < 0.45) {
            const sp = p / 0.45;
            c.attacker.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-1.25, -0.35, sp);
            c.attacker.torso.rotation.y = THREE.MathUtils.lerp(0, -0.45, sp);
            if (sp > 0.7 && !c.shieldBashFired) {
              c.shieldBashFired = true;
              this.spawnBurst(c.targetPos, 0xffd27d, 18, 1.5, { size: 0.08, maxAge: 0.45 });
            }
          } else {
            const tp = (p - 0.45) / 0.55;
            c.attacker.torso.rotation.y = THREE.MathUtils.lerp(-0.45, 0.35, tp);
            c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-1.1, -1.65, tp);
            c.attacker.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(-0.35, 0.25, tp);
          }
        } else if (aType === 'r') {
          // Rook: Crushing overhead two-handed Warhammer smash!
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-2.55, 0.22, p);
          c.attacker.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-2.4, 0.15, p);
          c.attacker.torso.rotation.x = Math.sin(p * Math.PI) * 0.35;
        } else if (aType === 'n') {
          // Knight: Horse rears dramatically, then downward spear thrust as hooves slam!
          if (c.attacker.horseGroup && c.attacker.horseLegs) {
            const rearCurve = p < 0.45 ? -0.78 : THREE.MathUtils.lerp(-0.78, -0.25, (p - 0.45) / 0.55);
            c.attacker.horseGroup.rotation.x = rearCurve;
            c.attacker.horseLegs.fl.rotation.x = p < 0.45 ? -1.35 : -0.35;
            c.attacker.horseLegs.fr.rotation.x = p < 0.45 ? -1.2 : -0.3;
          }
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-1.9, 0.15, p);
        } else if (aType === 'b') {
          // Bishop: Crystal staff burst + luminous energy beam shooting into victim!
          if (c.magicBeam) {
            c.magicBeam.visible = true;
            _v3.set(c.attacker.root.position.x, 1.18, c.attacker.root.position.z);
            const targetPt = new THREE.Vector3(c.targetPos.x, 0.72, c.targetPos.z);
            c.magicBeam.position.lerpVectors(_v3, targetPt, 0.5);
            c.magicBeam.scale.set(1, 1, _v3.distanceTo(targetPt) * Math.min(1, p * 2.2));
            c.magicBeam.lookAt(targetPt);
          }
          if (c.flashLight) {
            c.flashLight.intensity = 9.0 * (1 - p * 0.4);
          }
        } else if (aType === 'q') {
          // Queen: 360° martial spin with golden spear sweep + forward lunge!
          c.attacker.torso.rotation.y = p * Math.PI * 2;
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-1.65, -0.35, p);
          if (!this.lowPerfMode && Math.random() < 0.55) {
            this.spawnBurst(c.attacker.root.position, accentHex, 5, 1.2, { size: 0.08, maxAge: 0.4 });
          }
        } else if (aType === 'k') {
          // King: Raises Aquila & summons golden lightning bolt from sky!
          if (c.lightningBolt) {
            c.lightningBolt.visible = p > 0.25;
            c.lightningBolt.rotation.y += dt * 16;
          }
          if (c.flashLight) {
            c.flashLight.intensity = p > 0.25 ? 14.0 * Math.sin(p * Math.PI) : 2.0;
          }
        }

        if (p > 0.52 && !c.impactFired) {
          c.impactFired = true;
          c.hitStopRemaining = 0.15; // Brief dramatic hit-stop slow-mo (~0.15s)
          this.spawnBurst(c.targetPos, 0xfff3b0, 40, 3.1, { size: 0.11, maxAge: 0.68 });
          this.spawnBurst(c.targetPos, accentHex, 34, 2.6, { size: 0.1, maxAge: 0.85 });
          this.spawnShockwave(c.targetPos, accentHex);
          this.cameraShake = aType === 'r' || aType === 'k' ? 0.18 : aType === 'q' || aType === 'n' ? 0.1 : 0.065;
        }
      } else {
        // PHASE 3: VICTIM RECOIL + ASH DISSOLVE + ATTACKER CLAIMS SQUARE
        const p = (u - 0.68) / 0.32;
        if (c.magicBeam) c.magicBeam.visible = false;
        if (c.lightningBolt) c.lightningBolt.visible = false;
        if (c.flashLight) c.flashLight.intensity = Math.max(0, c.flashLight.intensity * (1 - p));

        if (!c.dissolveStarted) {
          c.dissolveStarted = true;
          this.applyVictimAshDissolveShader(c);
          this.spawnAshDissolve(c.targetPos);
        }
        c.dissolveProgress.value = p;

        // Victim recoil stagger backward while dissolving
        c.defender.root.position.y = Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.22;
        c.defender.bodyGroup.rotation.x = -p * 0.85;

        c.attacker.root.position.lerpVectors(_v2, c.targetPos, p);
        c.attacker.torso.rotation.y = THREE.MathUtils.lerp(c.attacker.torso.rotation.y, 0, p);
        c.attacker.torso.rotation.x = THREE.MathUtils.lerp(c.attacker.torso.rotation.x, 0, p);
      }

      if (u >= 1) {
        this.finishCombat(c);
      }
    }

    // 4. Pooled Particle Bursts, Dust & Ash
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const b = this.particles[i];
      b.age += dt;
      const posAttr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let j = 0; j < posAttr.count; j++) {
        arr[j * 3] += b.velocities[j * 3] * dt;
        arr[j * 3 + 1] += b.velocities[j * 3 + 1] * dt;
        arr[j * 3 + 2] += b.velocities[j * 3 + 2] * dt;
        b.velocities[j * 3 + 1] -= b.gravity * dt;
      }
      posAttr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity =
        Math.max(0, 1 - b.age / b.maxAge) * b.initialOpacity;

      if (b.age >= b.maxAge) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }

    // 5. Shockwave Rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.maxAge);
      sw.mesh.scale.setScalar(1 + t * 4.8);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.88;
      if (sw.age >= sw.maxAge) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 0.45);
    }
  }
}
