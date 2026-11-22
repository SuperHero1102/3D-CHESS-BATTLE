import * as THREE from 'three';
import { CombatEvent, CombatPace, PieceColor, PieceSymbol } from '../../types/chess';
import { squareToWorld } from './arenaBuilder';
import { PEDESTAL_HEIGHT, WarriorRig } from './warriorFactory';

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

interface ActiveCombatAnim {
  event: CombatEvent;
  attacker: WarriorRig;
  defender: WarriorRig;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  elapsed: number;
  duration: number;
  impactFired: boolean;
  dissolveStarted: boolean;
  magicBolt?: THREE.Mesh;
  magicRing?: THREE.Mesh;
  onComplete: () => void;
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
    count = 42,
    upward = 2.4,
    options?: { size?: number; gravity?: number; maxAge?: number; additive?: boolean; spread?: number }
  ) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const spread = options?.spread ?? 0.22;
    for (let i = 0; i < count; i++) {
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
      size: (options?.size ?? 0.1) * 1.4,
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
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.34;
      positions[i * 3 + 1] = 0.05 + Math.random() * 0.12;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.34;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.25 + Math.random() * 0.65;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 0.35 + Math.random() * 0.45;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.smokeTex,
      color: 0xd4cab8,
      size: 0.42,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({
      points,
      velocities,
      age: 0,
      maxAge: 0.52,
      gravity: 0.35,
      initialOpacity: 0.48,
    });
  }

  public spawnAshDissolve(origin: THREE.Vector3) {
    // Rising dark ash & glowing orange cinders as defeated warrior dissolves
    const count = 64;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.46;
      positions[i * 3 + 1] = 0.12 + Math.random() * 1.15;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.46;

      const angle = Math.random() * Math.PI * 2;
      const drift = 0.18 + Math.random() * 0.65;
      velocities[i * 3] = Math.cos(angle) * drift;
      velocities[i * 3 + 1] = 0.75 + Math.random() * 1.45;
      velocities[i * 3 + 2] = Math.sin(angle) * drift;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.smokeTex,
      color: 0x9ca3af,
      size: 0.28,
      transparent: true,
      opacity: 0.85,
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
      gravity: -0.35, // floats upward like ash!
      initialOpacity: 0.9,
    });

    // Warm cinder sparks alongside ash
    this.spawnBurst(origin, 0xff8c2b, 26, 2.0, {
      size: 0.08,
      gravity: 0.6,
      maxAge: 0.9,
      additive: true,
      spread: 0.38,
    });
  }

  public spawnShockwave(origin: THREE.Vector3, colorHex: number) {
    const geo = new THREE.RingGeometry(0.18, 0.3, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(origin.x, 0.04, origin.z);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.65 });
  }

  public queueSimpleMove(rig: WarriorRig, fromSq: string, toSq: string, type: PieceSymbol) {
    const startPos = squareToWorld(fromSq, new THREE.Vector3());
    const endPos = squareToWorld(toSq, new THREE.Vector3());
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      rig.bodyGroup.rotation.y = Math.atan2(dx, dz);
    }
    this.spawnDustPuff(startPos, 9);
    this.moveAnims.push({
      rig,
      startPos,
      endPos,
      progress: 0,
      duration: type === 'n' ? 0.56 : 0.4,
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
      this.spawnBurst(targetPos, 0xffd166, 26);
      this.spawnAshDissolve(targetPos);
      onComplete();
      return;
    }

    const duration = pace === 'fast' ? 0.85 : 2.0;

    // Orient attacker toward defender, defender toward attacker
    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    const attackAngle = Math.atan2(dx, dz);
    attacker.bodyGroup.rotation.y = attackAngle;
    defender.bodyGroup.rotation.y = attackAngle + Math.PI;

    // Cinematic combat camera framing
    const mid = new THREE.Vector3().lerpVectors(startPos, targetPos, 0.65);
    const perp = new THREE.Vector3(-dz, 0, dx).normalize();
    if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
    this.combatCameraTarget = new THREE.Vector3(mid.x, 0.78, mid.z);
    this.combatCameraDesiredPos = new THREE.Vector3(
      mid.x + perp.x * 3.1 - (dx === 0 && dz === 0 ? 0 : Math.sign(dx) * 0.7),
      2.3,
      mid.z + perp.z * 3.1 + 1.7
    );

    let magicRing: THREE.Mesh | undefined;
    let magicBolt: THREE.Mesh | undefined;

    if (event.attackerType === 'b' || event.attackerType === 'q') {
      const hex = event.attackerColor === 'w' ? 0xffb703 : 0xa855f7;
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      magicRing = new THREE.Mesh(ringGeo, ringMat);
      magicRing.rotation.x = -Math.PI / 2;
      magicRing.position.set(startPos.x, 0.04, startPos.z);
      this.scene.add(magicRing);

      if (event.attackerType === 'b') {
        const boltGeo = new THREE.OctahedronGeometry(0.15, 0);
        const boltMat = new THREE.MeshBasicMaterial({ color: hex });
        magicBolt = new THREE.Mesh(boltGeo, boltMat);
        magicBolt.position.set(startPos.x, 1.15, startPos.z);
        magicBolt.visible = false;
        this.scene.add(magicBolt);
      }
    }

    this.activeCombat = {
      event,
      attacker,
      defender,
      startPos,
      targetPos,
      elapsed: 0,
      duration,
      impactFired: false,
      dissolveStarted: false,
      magicBolt,
      magicRing,
      onComplete,
    };
  }

  public skipActiveCombat() {
    if (!this.activeCombat) return;
    this.finishCombat(this.activeCombat);
  }

  private finishCombat(combat: ActiveCombatAnim) {
    if (combat.magicBolt) {
      this.scene.remove(combat.magicBolt);
      combat.magicBolt.geometry.dispose();
      (combat.magicBolt.material as THREE.Material).dispose();
    }
    if (combat.magicRing) {
      this.scene.remove(combat.magicRing);
      combat.magicRing.geometry.dispose();
      (combat.magicRing.material as THREE.Material).dispose();
    }
    combat.attacker.root.position.copy(combat.targetPos);
    combat.attacker.root.scale.setScalar(1);
    this.resetRigPose(combat.attacker, combat.event.attackerColor);
    this.combatCameraTarget = null;
    this.combatCameraDesiredPos = null;
    this.activeCombat = null;
    combat.onComplete();
  }

  public resetRigPose(rig: WarriorRig, color: PieceColor) {
    rig.bodyGroup.rotation.set(0, color === 'w' ? Math.PI : 0, 0);
    rig.bodyGroup.position.y = PEDESTAL_HEIGHT;
    rig.leftLegPivot.rotation.set(0, 0, 0);
    rig.rightLegPivot.rotation.set(0, 0, 0);
    rig.rightArmPivot.rotation.set(-0.34, 0, -0.15);
    rig.leftArmPivot.rotation.set(-0.32, 0.16, 0.14);
    if (rig.horseGroup && rig.horseLegs) {
      rig.horseGroup.rotation.set(rig.baseHorsePitch ?? -0.34, 0, 0);
      rig.horseLegs.fl.rotation.set(-0.82, 0, 0);
      rig.horseLegs.fr.rotation.set(-0.6, 0, 0);
      rig.horseLegs.bl.rotation.set(0.34, 0, 0);
      rig.horseLegs.br.rotation.set(0.35, 0, 0);
      rig.leftLegPivot.rotation.set(-0.36, 0, -0.34);
      rig.rightLegPivot.rotation.set(-0.36, 0, 0.34);
      rig.rightArmPivot.rotation.set(-0.98, 0, -0.22);
    }
  }

  public update(delta: number, elapsedTime: number, allRigs: WarriorRig[]) {
    const dt = Math.min(delta, 0.05);

    // 1. Idle Breathing & Living Roman Battlefield Motion
    for (let i = 0; i < allRigs.length; i++) {
      const rig = allRigs[i];
      if (rig.mixer) {
        rig.mixer.update(dt);
      }
      if (this.activeCombat && (rig === this.activeCombat.attacker || rig === this.activeCombat.defender)) {
        continue;
      }
      const phase = i * 0.73;
      const breathe = Math.sin(elapsedTime * 1.9 + phase);
      rig.bodyGroup.position.y = PEDESTAL_HEIGHT + breathe * 0.008;
      if (!rig.isGlb) {
        rig.headPivot.rotation.x = breathe * 0.025;
      }

      if (rig.capePivot) {
        rig.capePivot.rotation.x = 0.06 + Math.sin(elapsedTime * 2.4 + phase) * 0.05;
      }
      if (rig.crystalMesh) {
        rig.crystalMesh.rotation.y += dt * 1.8;
        rig.crystalMesh.position.y = 1.16 + Math.sin(elapsedTime * 2.8 + phase) * 0.025;
      }
      if (rig.staffLight) {
        rig.staffLight.intensity = 2.0 + Math.sin(elapsedTime * 3.6 + phase) * 0.45;
      }
      if (rig.auraMesh) {
        rig.auraMesh.rotation.z += dt * 2.1;
        rig.auraMesh.scale.setScalar(1 + Math.sin(elapsedTime * 3.0 + phase) * 0.08);
      }
      if (rig.horseGroup && rig.horseLegs) {
        // Subtle rearing sway & front hoof pawing in idle
        rig.horseGroup.rotation.x = (rig.baseHorsePitch ?? -0.34) + breathe * 0.025;
        rig.horseLegs.fl.rotation.x = -0.82 + Math.sin(elapsedTime * 2.5 + phase) * 0.08;
        rig.horseLegs.fr.rotation.x = -0.6 + Math.cos(elapsedTime * 2.3 + phase) * 0.07;
      }
      if (rig.horseNeckPivot) {
        rig.horseNeckPivot.rotation.x = Math.sin(elapsedTime * 1.7 + phase) * 0.045;
      }
      if (rig.horseTailPivot) {
        rig.horseTailPivot.rotation.z = Math.sin(elapsedTime * 2.5 + phase) * 0.09;
      }
    }

    // 2. Smooth Movement (Run / Gallop) with Ground Dust Puffs
    for (let i = this.moveAnims.length - 1; i >= 0; i--) {
      const anim = this.moveAnims[i];
      anim.progress += dt / anim.duration;
      const t = Math.min(1, anim.progress);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      anim.rig.root.position.lerpVectors(anim.startPos, anim.endPos, ease);
      anim.dustTimer += dt;
      if (anim.dustTimer > 0.09 && t < 0.92) {
        anim.dustTimer = 0;
        this.spawnDustPuff(anim.rig.root.position, anim.isKnight ? 6 : 4);
      }

      if (anim.rig.isGlb) {
        anim.rig.root.position.y = Math.sin(t * Math.PI) * (anim.isKnight ? 0.65 : 0.35);
        anim.rig.bodyGroup.rotation.x = Math.sin(t * Math.PI) * 0.14;
      } else if (anim.isKnight && anim.rig.horseLegs && anim.rig.horseGroup) {
        anim.rig.root.position.y = Math.sin(t * Math.PI) * 0.72;
        anim.rig.horseGroup.rotation.x = -0.14 + Math.cos(t * Math.PI) * 0.22;
        const gallop = Math.sin(t * Math.PI * 4.5) * 0.62;
        anim.rig.horseLegs.fl.rotation.x = -0.35 + gallop;
        anim.rig.horseLegs.fr.rotation.x = -0.35 + gallop * 0.85;
        anim.rig.horseLegs.bl.rotation.x = 0.2 - gallop;
        anim.rig.horseLegs.br.rotation.x = 0.2 - gallop * 0.85;
      } else {
        const stride = Math.sin(t * Math.PI * 5.5) * 0.46;
        anim.rig.leftLegPivot.rotation.x = stride;
        anim.rig.rightLegPivot.rotation.x = -stride;
        anim.rig.rightArmPivot.rotation.x = -0.35 - stride * 0.45;
      }

      if (t >= 1) {
        anim.rig.root.position.copy(anim.endPos);
        this.spawnDustPuff(anim.endPos, 8);
        const color = anim.rig.root.userData.color as PieceColor;
        this.resetRigPose(anim.rig, color);
        this.moveAnims.splice(i, 1);
      }
    }

    // 3. Active 3D Capture Combat Sequence
    if (this.activeCombat) {
      const c = this.activeCombat;
      c.elapsed += dt;
      const u = Math.min(1, c.elapsed / c.duration);
      const aType = c.event.attackerType;
      const accentHex = c.event.attackerColor === 'w' ? 0xffc857 : 0xa855f7;

      _v1.subVectors(c.targetPos, c.startPos);
      const dist = _v1.length();
      if (dist > 0.01) _v1.normalize();
      const standOffDist = aType === 'b' ? Math.min(dist * 0.65, 2.2) : 0.76;
      _v2.copy(c.targetPos).addScaledVector(_v1, -standOffDist);

      if (u < 0.42) {
        const p = u / 0.42;
        if (aType === 'b') {
          c.attacker.root.position.lerpVectors(c.startPos, _v2, p * 0.5);
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.28, -1.55, p);
          if (c.magicRing) {
            c.magicRing.position.set(c.attacker.root.position.x, 0.04, c.attacker.root.position.z);
            c.magicRing.rotation.z += dt * 4.5;
            c.magicRing.scale.setScalar(0.6 + p * 0.85);
          }
        } else {
          c.attacker.root.position.lerpVectors(c.startPos, _v2, p);
          if (aType === 'n' && c.attacker.horseLegs && c.attacker.horseGroup) {
            const g = Math.sin(p * Math.PI * 5) * 0.65;
            c.attacker.horseGroup.rotation.x = -0.18 + Math.sin(p * Math.PI) * -0.2;
            c.attacker.horseLegs.fl.rotation.x = -0.4 + g;
            c.attacker.horseLegs.fr.rotation.x = -0.4 + g * 0.9;
            c.attacker.horseLegs.bl.rotation.x = 0.2 - g;
            c.attacker.horseLegs.br.rotation.x = 0.2 - g * 0.9;
            c.attacker.root.position.y = Math.abs(Math.sin(p * Math.PI * 2.5)) * 0.24;
            c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.95, -2.15, p);
          } else {
            const stride = Math.sin(p * Math.PI * 4.5) * 0.54;
            c.attacker.leftLegPivot.rotation.x = stride;
            c.attacker.rightLegPivot.rotation.x = -stride;
            c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.34, -2.25, p);
          }
          if (aType === 'q') {
            c.attacker.bodyGroup.rotation.y += dt * 8.5;
          }
        }
        c.defender.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.32, -0.95, p);
      } else if (u < 0.68) {
        const p = (u - 0.42) / 0.26;
        if (aType === 'b' && c.magicBolt) {
          c.magicBolt.visible = true;
          _v3.set(c.attacker.root.position.x, 1.18, c.attacker.root.position.z);
          c.magicBolt.position.lerpVectors(_v3, _v1.set(c.targetPos.x, 0.78, c.targetPos.z), p);
          c.magicBolt.rotation.y += dt * 12;
        } else {
          c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-2.25, 0.28, p);
          if (aType === 'r') {
            c.attacker.bodyGroup.rotation.x = Math.sin(p * Math.PI) * 0.24;
          }
        }

        if (p > 0.42 && !c.impactFired) {
          c.impactFired = true;
          if (c.magicBolt) c.magicBolt.visible = false;
          // Bright metallic hit sparks + faction energy burst + shockwave!
          this.spawnBurst(c.targetPos, 0xfff3b0, 38, 3.0, { size: 0.11, maxAge: 0.65 });
          this.spawnBurst(c.targetPos, accentHex, 32, 2.5, { size: 0.1, maxAge: 0.8 });
          this.spawnShockwave(c.targetPos, accentHex);
          this.cameraShake = aType === 'r' ? 0.16 : aType === 'q' || aType === 'n' ? 0.09 : 0.055;
        }
        if (c.attacker.isGlb) {
          c.attacker.bodyGroup.rotation.x = Math.sin(p * Math.PI) * 0.34;
        }
      } else {
        const p = (u - 0.68) / 0.32;
        if (!c.dissolveStarted) {
          c.dissolveStarted = true;
          this.spawnAshDissolve(c.targetPos);
        }
        c.defender.root.position.y = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.36;
        c.defender.bodyGroup.rotation.x = -p * 1.1;
        c.defender.root.scale.setScalar(Math.max(0.01, 1 - p));

        c.attacker.root.position.lerpVectors(_v2, c.targetPos, p);
        c.attacker.rightArmPivot.rotation.x = THREE.MathUtils.lerp(0.28, -0.34, p);
      }

      if (u >= 1) {
        this.finishCombat(c);
      }
    }

    // 4. Particle Bursts, Dust Puffs & Ash Dissolve
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
      sw.mesh.scale.setScalar(1 + t * 4.5);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
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
