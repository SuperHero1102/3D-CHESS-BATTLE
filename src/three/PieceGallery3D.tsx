import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCw, Pause, Play, X, Eye, Swords, Footprints, Sparkles } from 'lucide-react';
import { PieceColor, PieceSymbol } from '../types/chess';
import { createMaterialPalette, MaterialPalette } from './materials';
import {
  ArticulatedJointRig,
  createWarriorPiece,
  PEDESTAL_HEIGHT,
  resetPose,
  WarriorRig,
} from './warriorFactory';

type GalleryAnimMode = 'idle' | 'run' | 'attack';
type GalleryAngle = 'front' | 'threeQuarter' | 'back';

interface GalleryDiagnostics {
  pieceName: string;
  factionLabel: string;
  modelVersionLabel: string;
  isV2: boolean;
  meshCount: number;
  joints: string[];
  totalHeight: string;
}

const PIECE_OPTIONS: { type: PieceSymbol; label: string; title: string }[] = [
  { type: 'k', label: 'Vua', title: 'Vua — Hoàng Đế Imperator' },
  { type: 'q', label: 'Hậu', title: 'Hậu — Nữ Thần Bellona' },
  { type: 'b', label: 'Tượng', title: 'Tượng — Tư Tế Augur' },
  { type: 'n', label: 'Mã', title: 'Mã — Kỵ Binh Equites' },
  { type: 'r', label: 'Xe', title: 'Xe — Tháp Công Thành' },
  { type: 'p', label: 'Tốt', title: 'Tốt — Lính Lê Dương' },
];

const CAMERA_ANGLES: Record<GalleryAngle, { pos: [number, number, number]; target: [number, number, number] }> = {
  front: { pos: [0, 0.98, 2.45], target: [0, 0.78, 0] },
  threeQuarter: { pos: [1.75, 1.15, 1.95], target: [0, 0.78, 0] },
  back: { pos: [0, 1.02, -2.45], target: [0, 0.78, 0] },
};

function collectPieceDiagnostics(
  rig: WarriorRig,
  type: PieceSymbol,
  side: PieceColor
): GalleryDiagnostics {
  let meshCount = 0;
  rig.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible && !obj.userData.isPieceHit) {
      meshCount += 1;
    }
  });

  const rigData = rig.root.userData.rig as ArticulatedJointRig | undefined;
  const joints: string[] = [];
  if (rigData) {
    const orderedKeys: (keyof ArticulatedJointRig)[] = [
      'pelvis',
      'spine',
      'chest',
      'torso',
      'neck',
      'head',
      'shoulderL',
      'elbowL',
      'handL',
      'shoulderR',
      'elbowR',
      'handR',
      'hipL',
      'kneeL',
      'hipR',
      'kneeR',
      'cloak',
      'cloakSeg1',
      'cloakSeg2',
      'cloakSeg3',
      'armL',
      'forearmL',
      'armR',
      'forearmR',
      'legL',
      'legR',
      'cape',
      'horseBody',
      'horseNeck',
      'horseLegFL',
      'horseLegFR',
      'horseLegBL',
      'horseLegBR',
    ];
    const seen = new Set<THREE.Object3D>();
    for (const k of orderedKeys) {
      const node = rigData[k];
      if (node instanceof THREE.Group && !seen.has(node)) {
        seen.add(node);
        joints.push(node.name || String(k));
      }
    }
  }

  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  rig.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible && !obj.userData.isPieceHit) {
      box.expandByObject(obj);
    }
  });
  const height = box.isEmpty() ? 0 : box.max.y - box.min.y;

  const ver = rig.root.userData.modelVersion as string | undefined;
  const isV2 = ver === 'v2';
  const modelVersionLabel = isV2
    ? 'MODEL v2'
    : ver === 'glb'
    ? 'MODEL GLB'
    : 'MODEL v1 (cũ)';

  const meta = PIECE_OPTIONS.find((p) => p.type === type)!;
  return {
    pieceName: meta.title,
    factionLabel: side === 'w' ? 'Phe Ánh Sáng' : 'Phe Bóng Tối',
    modelVersionLabel,
    isV2,
    meshCount,
    joints,
    totalHeight: height.toFixed(2),
  };
}

export interface PieceGallery3DProps {
  onClose: () => void;
}

export const PieceGallery3D: React.FC<PieceGallery3DProps> = ({ onClose }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [pieceType, setPieceType] = useState<PieceSymbol>('k');
  const [side, setSide] = useState<PieceColor>('w');
  const [animMode, setAnimMode] = useState<GalleryAnimMode>('idle');
  const [turntable, setTurntable] = useState<boolean>(true);
  const [anglePreset, setAnglePreset] = useState<GalleryAngle>('front');
  const [angleTrigger, setAngleTrigger] = useState<number>(0);
  const [diagnostics, setDiagnostics] = useState<GalleryDiagnostics | null>(null);

  const stateRef = useRef({ animMode, turntable });
  stateRef.current = { animMode, turntable };

  const galleryApiRef = useRef<{
    loadPiece: (type: PieceSymbol, color: PieceColor) => void;
    setCameraAngle: (angle: GalleryAngle) => void;
    triggerAttackPulse: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(w, h);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.045);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.92;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 60);
    camera.position.set(...CAMERA_ANGLES.front.pos);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.target.set(...CAMERA_ANGLES.front.target);
    controls.minDistance = 1.15;
    controls.maxDistance = 4.6;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.52;

    // 3-Point Studio Lighting Rig
    const hemi = new THREE.HemisphereLight(0x8fa8d6, 0x241911, 0.55);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
    keyLight.position.set(2.4, 4.2, 3.1);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -1.6;
    keyLight.shadow.camera.right = 1.6;
    keyLight.shadow.camera.top = 2.0;
    keyLight.shadow.camera.bottom = -1.0;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.018;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ab8ff, 0.95);
    fillLight.position.set(-3.0, 2.2, 2.0);
    scene.add(fillLight);

    const rimBackLeft = new THREE.DirectionalLight(0xc2d6ff, 1.5);
    rimBackLeft.position.set(-2.2, 2.8, -3.2);
    scene.add(rimBackLeft);

    const rimBackRight = new THREE.DirectionalLight(0xffcf88, 1.15);
    rimBackRight.position.set(2.4, 2.4, -3.0);
    scene.add(rimBackRight);

    // Studio Plinth & Shadow-Catcher Floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e131d,
      roughness: 0.88,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.11;
    floor.receiveShadow = true;
    scene.add(floor);

    const studioPlinthMat = new THREE.MeshStandardMaterial({
      color: 0x1a202e,
      roughness: 0.52,
      metalness: 0.28,
    });
    const studioPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.66, 0.11, 48),
      studioPlinthMat
    );
    studioPlinth.position.y = -0.055;
    studioPlinth.receiveShadow = true;
    scene.add(studioPlinth);

    const studioRingMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.25,
    });
    const studioRing = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.01, 10, 48), studioRingMat);
    studioRing.rotation.x = Math.PI / 2;
    studioRing.position.y = -0.002;
    scene.add(studioRing);

    const palette: MaterialPalette = createMaterialPalette(
      renderer.capabilities.getMaxAnisotropy(),
      isSoftwareGl,
      () => {}
    );

    const turntableGroup = new THREE.Group();
    scene.add(turntableGroup);

    // Optional studio attack flash light for King's Ra đòn preview
    const attackLight = new THREE.PointLight(0xffd266, 0, 5, 1.5);
    attackLight.position.set(0.45, 1.45, 0.5);
    scene.add(attackLight);

    let currentRig: WarriorRig | null = null;
    let currentType: PieceSymbol = pieceType;
    let currentSide: PieceColor = side;
    let desiredCamPos: THREE.Vector3 | null = null;
    let desiredTarget: THREE.Vector3 | null = null;
    let attackElapsed = 0;

    const cancelCamAnim = () => {
      desiredCamPos = null;
      desiredTarget = null;
    };
    controls.addEventListener('start', cancelCamAnim);

    const loadPiece = (type: PieceSymbol, color: PieceColor) => {
      if (currentRig) {
        turntableGroup.remove(currentRig.root);
      }
      currentType = type;
      currentSide = color;
      const rig = createWarriorPiece(palette, color, type, !isSoftwareGl);
      // Normalize so at turntable angle = 0, piece ALWAYS faces +Z (front camera)
      rig.root.rotation.y = color === 'w' ? Math.PI : 0;
      turntableGroup.add(rig.root);
      currentRig = rig;
      attackElapsed = 0;
      setDiagnostics(collectPieceDiagnostics(rig, type, color));
    };

    loadPiece(pieceType, side);

    galleryApiRef.current = {
      loadPiece,
      setCameraAngle: (angle: GalleryAngle) => {
        const cfg = CAMERA_ANGLES[angle];
        desiredCamPos = new THREE.Vector3(...cfg.pos);
        desiredTarget = new THREE.Vector3(...cfg.target);
        if (angle === 'front') {
          turntableGroup.rotation.y = 0;
        }
      },
      triggerAttackPulse: () => {
        attackElapsed = 0;
      },
    };

    const onResize = () => {
      if (!container) return;
      const nw = container.clientWidth || window.innerWidth;
      const nh = container.clientHeight || window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) return;
        const st = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      if (stateRef.current.turntable && !desiredCamPos) {
        turntableGroup.rotation.y += dt * 0.42;
      }

      if (currentRig) {
        if (currentRig.mixer) {
          currentRig.mixer.update(dt);
        }

        const mode = stateRef.current.animMode;
        if (mode === 'idle') {
          attackLight.intensity = 0;
          resetPose(currentRig.root);
          const breathe = Math.sin(elapsed * 2.1);
          currentRig.bodyGroup.position.y = PEDESTAL_HEIGHT + breathe * 0.006;
          if (currentRig.spinePivot) {
            currentRig.spinePivot.rotation.x = breathe * 0.015;
          } else {
            currentRig.torso.rotation.x = breathe * 0.018;
          }
          if (currentRig.neckPivot) {
            currentRig.neckPivot.rotation.x = breathe * 0.012;
          }
          currentRig.headPivot.rotation.y = Math.sin(elapsed * 0.9) * 0.06;
          if (currentRig.capeSegs) {
            currentRig.capeSegs.forEach((seg, idx) => {
              seg.rotation.x = 0.04 + Math.sin(elapsed * 2.4 - idx * 0.7) * (0.03 + idx * 0.02);
            });
          }
          if (currentRig.horseGroup && currentRig.horseLegs) {
            currentRig.horseGroup.rotation.x = (currentRig.baseHorsePitch ?? -0.44) + breathe * 0.025;
            currentRig.horseLegs.fl.rotation.x = -0.84 + Math.sin(elapsed * 2.3) * 0.08;
            currentRig.horseLegs.fr.rotation.x = -0.58 + Math.cos(elapsed * 2.1) * 0.07;
          }
        } else if (mode === 'run') {
          attackLight.intensity = 0;
          resetPose(currentRig.root);
          const stride = Math.sin(elapsed * 7.2) * 0.52;
          if (currentType === 'n' && currentRig.horseLegs && currentRig.horseGroup) {
            currentRig.bodyGroup.position.y = PEDESTAL_HEIGHT + Math.abs(Math.sin(elapsed * 7.2)) * 0.06;
            currentRig.horseGroup.rotation.x = -0.22 + Math.cos(elapsed * 7.2) * 0.16;
            currentRig.horseLegs.fl.rotation.x = -0.4 + stride;
            currentRig.horseLegs.fr.rotation.x = -0.35 + stride * 0.85;
            currentRig.horseLegs.bl.rotation.x = 0.25 - stride;
            currentRig.horseLegs.br.rotation.x = 0.25 - stride * 0.85;
          } else {
            currentRig.leftLegPivot.rotation.x = stride;
            currentRig.rightLegPivot.rotation.x = -stride;
            if (currentRig.leftKneePivot && currentRig.rightKneePivot) {
              currentRig.leftKneePivot.rotation.x = Math.max(0, -stride) * 0.92;
              currentRig.rightKneePivot.rotation.x = Math.max(0, stride) * 0.92;
            }
            if (currentRig.spinePivot) {
              currentRig.spinePivot.rotation.y = -stride * 0.24;
              currentRig.spinePivot.rotation.x = 0.08;
            }
            currentRig.rightArmPivot.rotation.x = -0.35 - stride * 0.4;
            currentRig.leftArmPivot.rotation.x = -0.35 + stride * 0.35;
            currentRig.bodyGroup.position.y = PEDESTAL_HEIGHT + Math.abs(Math.sin(elapsed * 7.2)) * 0.032;
          }
          if (currentRig.capeSegs) {
            currentRig.capeSegs.forEach((seg, idx) => {
              seg.rotation.x = 0.24 + idx * 0.1 + Math.sin(elapsed * 7.2 - idx) * 0.06;
            });
          }
        } else if (mode === 'attack') {
          attackElapsed = (attackElapsed + dt) % 1.45;
          const u = attackElapsed / 1.45;
          resetPose(currentRig.root);
          const windup = Math.sin(Math.min(1, u * 1.4) * Math.PI);
          const strike = u > 0.45 ? Math.sin(((u - 0.45) / 0.55) * Math.PI) : 0;

          if (currentType === 'k') {
            currentRig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.26, -2.25, windup);
            currentRig.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(-0.68, -0.12, windup);
            if (currentRig.rightHandPivot) {
              currentRig.rightHandPivot.rotation.x = -0.2 * windup;
            }
            if (currentRig.spinePivot) {
              currentRig.spinePivot.rotation.x = -0.12 * windup + 0.15 * strike;
            }
            attackLight.color.setHex(currentSide === 'w' ? 0xffd166 : 0xb26bff);
            attackLight.intensity = strike * 9.5;
          } else if (currentType === 'r') {
            currentRig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.42, -2.4, windup) + strike * 2.1;
            currentRig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.56, -2.2, windup) + strike * 1.9;
            currentRig.torso.rotation.x = strike * 0.35;
            attackLight.intensity = strike * 4;
          } else if (currentType === 'q') {
            currentRig.torso.rotation.y = u * Math.PI * 2;
            currentRig.rightArmPivot.rotation.x = -1.25 * windup;
            attackLight.intensity = strike * 5;
          } else {
            currentRig.rightArmPivot.rotation.x = -1.65 * windup + strike * 1.1;
            currentRig.leftArmPivot.rotation.x = -1.05 * windup;
            attackLight.intensity = strike * 3.5;
          }
          if (currentRig.capeSegs) {
            currentRig.capeSegs.forEach((seg, idx) => {
              seg.rotation.x = 0.18 + windup * 0.22 + idx * 0.08;
            });
          }
        }
      }

      if (desiredCamPos && desiredTarget) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 7, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, 7, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, 7, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, 7, dt);
        if (camera.position.distanceTo(desiredCamPos) < 0.025) {
          desiredCamPos = null;
          desiredTarget = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', cancelCamAnim);
      controls.dispose();
      palette.dispose();
      envTex.dispose();
      floorMat.dispose();
      studioPlinthMat.dispose();
      studioRingMat.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  useEffect(() => {
    galleryApiRef.current?.loadPiece(pieceType, side);
  }, [pieceType, side]);

  useEffect(() => {
    if (angleTrigger > 0) {
      galleryApiRef.current?.setCameraAngle(anglePreset);
    }
  }, [anglePreset, angleTrigger]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0f17] text-[#F3EFE6] overflow-hidden select-none">
      {/* Dedicated WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Permanent Top-Left Diagnostic Badge */}
      {diagnostics && (
        <div className="fixed top-4 left-4 z-20 max-w-xs rounded-xl bg-[#111622]/92 border border-[#D4AF37]/45 px-4 py-3 shadow-2xl space-y-2 pointer-events-auto">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm font-bold text-[#FFD700] tracking-wide">
              {diagnostics.pieceName}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular font-bold shrink-0 border ${
                diagnostics.isV2
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
              }`}
            >
              {diagnostics.modelVersionLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#CBD5E1] font-mono-tabular">
            <span>{diagnostics.factionLabel}</span>
            <span>•</span>
            <span>Số mesh: {diagnostics.meshCount}</span>
            <span>•</span>
            <span>Cao: {diagnostics.totalHeight}</span>
          </div>

          <div className="pt-1 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-[#9AA3B2] mb-1">
              Danh sách khớp ({diagnostics.joints.length})
            </div>
            <div className="text-[11px] font-mono-tabular text-[#E2E8F0] leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
              {diagnostics.joints.join(' → ')}
            </div>
          </div>
        </div>
      )}

      {/* Top-Right Close Gallery Button */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 z-20 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141A28] hover:bg-[#1E2638] border border-white/15 text-xs font-semibold text-[#F3EFE6] shadow-xl"
      >
        <X className="w-4 h-4 text-[#D4AF37]" />
        <span>Đóng Gallery</span>
      </button>

      {/* Compact Bottom Control Dock (Zero Center Occlusion) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(920px,95vw)] rounded-2xl bg-[#111622]/92 border border-[#D4AF37]/35 px-4 py-3 shadow-2xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 6 Piece Selector */}
          <div className="flex flex-wrap items-center gap-1">
            {PIECE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setPieceType(opt.type)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  pieceType === opt.type
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#FFD700]'
                    : 'bg-[#181E2B] border-white/10 text-[#9AA3B2] hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Faction Toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSide('w')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                side === 'w'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              Phe Sáng
            </button>
            <button
              type="button"
              onClick={() => setSide('b')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                side === 'b'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              Phe Tối
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          {/* Animation Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#9AA3B2] mr-1">Hoạt ảnh:</span>
            <button
              type="button"
              onClick={() => setAnimMode('idle')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                animMode === 'idle'
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#FFD700]'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Idle</span>
            </button>
            <button
              type="button"
              onClick={() => setAnimMode('run')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                animMode === 'run'
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#FFD700]'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              <span>Chạy</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAnimMode('attack');
                galleryApiRef.current?.triggerAttackPulse();
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                animMode === 'attack'
                  ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Ra đòn</span>
            </button>
          </div>

          {/* Camera Angles & Turntable */}
          <div className="flex items-center gap-1.5">
            {(
              [
                ['front', 'Trước'],
                ['threeQuarter', 'Góc 3/4'],
                ['back', 'Sau'],
              ] as [GalleryAngle, string][]
            ).map(([ang, lbl]) => (
              <button
                key={ang}
                type="button"
                onClick={() => {
                  setAnglePreset(ang);
                  setAngleTrigger((c) => c + 1);
                  if (ang === 'front' || ang === 'back') {
                    setTurntable(false);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#181E2B] hover:bg-white/10 border border-white/10 text-[#CBD5E1]"
              >
                <Eye className="w-3 h-3" />
                <span>{lbl}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setTurntable((t) => !t)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                turntable
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
              }`}
            >
              {turntable ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <RotateCw className="w-3 h-3" />
              <span>Xoay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
