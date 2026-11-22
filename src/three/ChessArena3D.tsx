import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { Chess, Square } from 'chess.js';
import {
  CameraPreset,
  CombatEvent,
  CombatPace,
  GraphicsQuality,
  Language,
  MoveRecord,
  PieceColor,
  PieceSymbol,
} from '../types/chess';
import { ChessArena3D as LegacyChessArena3D } from './legacy_renderer/ChessArena3D';
import { createMaterialPalette, MaterialPalette } from './materials';
import { createWarriorPiece, PEDESTAL_HEIGHT, WarriorRig } from './warriorFactory';
import { ArenaHandles, buildMedievalArena, squareToWorld } from './arenaBuilder';
import { CombatDirector } from './combatDirector';
import { getPieceTooltipCopy, preloadGlbTemplates } from './modelLoader';

// 1-LINE ROLLBACK TOGGLE: Set to `true` to immediately restore the legacy renderer
export const USE_LEGACY_RENDERER = false;

export interface ChessArenaProps {
  lang: Language;
  fen: string;
  orientation: PieceColor;
  selectedSquare: string | null;
  legalTargets: string[];
  captureTargets: string[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  hintMove: { from: string; to: string } | null;
  graphicsQuality: GraphicsQuality;
  combatPace: CombatPace;
  showCoordinates: boolean;
  showValidMoves: boolean;
  cameraPreset: CameraPreset;
  cameraResetTrigger: number;
  latestMoveEvent: { seq: number; move: MoveRecord } | null;
  skipCombatTrigger: number;
  interactive: boolean;
  onSquareClick: (square: string) => void;
  onCombatStateChange?: (active: boolean) => void;
}

interface FloatingTooltipState {
  x: number;
  y: number;
  color: PieceColor;
  type: PieceSymbol;
  square: string;
}

const CAMERA_VIEWS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  default: { pos: [0, 7.2, 8.6], target: [0, 0.25, 0] },
  white: { pos: [0, 6.6, 8.4], target: [0, 0.25, 0] },
  black: { pos: [0, 6.6, -8.4], target: [0, 0.25, 0] },
  top: { pos: [0.01, 11.4, 0.4], target: [0, 0, 0] },
  cinematic: { pos: [5.8, 4.6, 6.8], target: [0, 0.45, 0] },
};

const _projVec = new THREE.Vector3();

const UpgradedChessArena3D: React.FC<ChessArenaProps> = ({
  lang,
  fen,
  orientation,
  selectedSquare,
  legalTargets,
  captureTargets,
  lastMove,
  checkSquare,
  hintMove,
  graphicsQuality,
  combatPace,
  showCoordinates,
  showValidMoves,
  cameraPreset,
  cameraResetTrigger,
  latestMoveEvent,
  skipCombatTrigger,
  interactive,
  onSquareClick,
  onCombatStateChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<FloatingTooltipState | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const lastTooltipDataRef = useRef<FloatingTooltipState | null>(null);

  const callbacksRef = useRef({ onSquareClick, onCombatStateChange });
  callbacksRef.current = { onSquareClick, onCombatStateChange };

  const settingsRef = useRef({ combatPace, interactive, showValidMoves, graphicsQuality, selectedSquare, fen });
  settingsRef.current = { combatPace, interactive, showValidMoves, graphicsQuality, selectedSquare, fen };

  const sceneApiRef = useRef<{
    syncBoardFromFen: (targetFen: string) => void;
    applyMoveVisual: (move: MoveRecord) => void;
    updateHighlights: (opts: {
      selectedSquare: string | null;
      legalTargets: string[];
      captureTargets: string[];
      lastMove: { from: string; to: string } | null;
      checkSquare: string | null;
      hintMove: { from: string; to: string } | null;
      showValidMoves: boolean;
    }) => void;
    setCameraPreset: (preset: CameraPreset, side: PieceColor) => void;
    setCoordinatesVisible: (visible: boolean) => void;
    skipCombat: () => void;
    rebuildQuality: (quality: GraphicsQuality) => void;
  } | null>(null);

  const lastSeqRef = useRef<number>(0);

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

    const initW = container.clientWidth || window.innerWidth;
    const initH = container.clientHeight || window.innerHeight;

    // Stage 1: Renderer + ACESFilmicToneMapping (exposure ~0.9)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl && graphicsQuality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(initW, initH);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // Stage 1: Night Blue FogExp2 + PMREM RoomEnvironment (intensity ~0.6)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c182c);
    scene.fog = new THREE.FogExp2(0x0c182c, 0.0155);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();

    // Stage 1: Camera FOV 42° (within 40-45°)
    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.1, 145);
    const initPos = orientation === 'b' ? CAMERA_VIEWS.black.pos : CAMERA_VIEWS.default.pos;
    camera.position.set(initPos[0], initPos[1], initPos[2]);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.4;
    controls.maxDistance = 17.5;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = Math.PI * 0.44;
    controls.enablePan = false;
    controls.target.set(0, 0.25, 0);

    // Stage 1 Lighting Rig:
    // 1. Weak HemisphereLight preserving deep dramatic shadows
    const hemi = new THREE.HemisphereLight(0x6e8ec4, 0x24160e, 0.35);
    scene.add(hemi);

    // 2. Cool Moonlight DirectionalLight (#8fa8ff) casting soft shadows
    const keyLight = new THREE.DirectionalLight(0x8fa8ff, 2.05);
    keyLight.position.set(-7.5, 14.5, -7.5);
    keyLight.castShadow = !isSoftwareGl && graphicsQuality !== 'low';
    const shadowSize = graphicsQuality === 'high' ? 2048 : 1024;
    keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    keyLight.shadow.camera.left = -6.8;
    keyLight.shadow.camera.right = 6.8;
    keyLight.shadow.camera.top = 6.8;
    keyLight.shadow.camera.bottom = -6.8;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // 3. Pale-blue Rim Light separating armor silhouettes from night background
    const rimBack = new THREE.DirectionalLight(0xaec8ff, 1.65);
    rimBack.position.set(2.5, 5.0, -11.5);
    scene.add(rimBack);

    const rimFront = new THREE.DirectionalLight(0xffbe80, 0.58);
    rimFront.position.set(-2.5, 4.4, 11.2);
    scene.add(rimFront);

    // Stage 1 Post-Processing: RenderPass -> UnrealBloomPass(0.6, 0.5, 0.85) -> SMAAPass -> Vignette -> OutputPass
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let smaaPass: SMAAPass | null = null;
    let vignettePass: ShaderPass | null = null;
    let composerRT: THREE.WebGLRenderTarget | null = null;
    let autoDowngraded = false;

    if (!isSoftwareGl) {
      composerRT = new THREE.WebGLRenderTarget(initW, initH, {
        type: THREE.HalfFloatType,
        samples: 2,
      });
      composer = new EffectComposer(renderer, composerRT);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(initW, initH);
      composer.addPass(new RenderPass(scene, camera));

      bloomPass = new UnrealBloomPass(new THREE.Vector2(initW, initH), 0.6, 0.5, 0.85);
      bloomPass.enabled = graphicsQuality !== 'low';
      composer.addPass(bloomPass);

      smaaPass = new SMAAPass();
      smaaPass.enabled = graphicsQuality !== 'low';
      composer.addPass(smaaPass);

      vignettePass = new ShaderPass(VignetteShader);
      vignettePass.uniforms['offset'].value = 0.86;
      vignettePass.uniforms['darkness'].value = 0.92;
      composer.addPass(vignettePass);

      composer.addPass(new OutputPass());
    }

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const palette: MaterialPalette = createMaterialPalette(maxAniso, isSoftwareGl, (err) => {
      setAssetError(err.message);
    });
    let arena: ArenaHandles = buildMedievalArena(scene, palette, graphicsQuality);
    arena.coordGroup.visible = showCoordinates;

    const combatDirector = new CombatDirector(scene, {
      smokeTex: palette.smokeTex,
      emberTex: palette.emberTex,
    });
    const pieceMap = new Map<string, WarriorRig>();
    const pieceGroup = new THREE.Group();
    scene.add(pieceGroup);

    // Stage 4: Highlights (Selected Glow Ring + Hover Pedestal Halo + Pale-Gold Legal Squares + Red Capture Rings)
    const highlightGroup = new THREE.Group();
    scene.add(highlightGroup);

    const selectRingMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 36), selectRingMat);
    selectRing.rotation.x = -Math.PI / 2;
    selectRing.position.y = 0.016;
    selectRing.visible = false;
    highlightGroup.add(selectRing);

    const selectAuraMat = new THREE.MeshBasicMaterial({
      color: 0xf6d365,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const selectAura = new THREE.Mesh(new THREE.CircleGeometry(0.47, 32), selectAuraMat);
    selectAura.rotation.x = -Math.PI / 2;
    selectAura.position.y = 0.013;
    selectAura.visible = false;
    highlightGroup.add(selectAura);

    const hoverRingMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.39, 0.47, 32), hoverRingMat);
    hoverRing.rotation.x = -Math.PI / 2;
    hoverRing.position.y = 0.014;
    hoverRing.visible = false;
    highlightGroup.add(hoverRing);

    const checkRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    });
    const checkRing = new THREE.Mesh(new THREE.RingGeometry(0.39, 0.49, 32), checkRingMat);
    checkRing.rotation.x = -Math.PI / 2;
    checkRing.position.y = 0.017;
    checkRing.visible = false;
    highlightGroup.add(checkRing);

    const lastMoveFromMat = new THREE.MeshBasicMaterial({
      color: 0xe5b94c,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const lastMoveFrom = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), lastMoveFromMat);
    lastMoveFrom.rotation.x = -Math.PI / 2;
    lastMoveFrom.position.y = 0.01;
    lastMoveFrom.visible = false;
    const lastMoveTo = lastMoveFrom.clone();
    highlightGroup.add(lastMoveFrom, lastMoveTo);

    const hintMarkers: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const hm = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.44, 24),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
      );
      hm.rotation.x = -Math.PI / 2;
      hm.position.y = 0.018;
      hm.visible = false;
      highlightGroup.add(hm);
      hintMarkers.push(hm);
    }

    // Pale-gold slowly pulsing legal empty squares (Stage 4)
    const legalPads: THREE.Group[] = [];
    const padPlaneGeo = new THREE.PlaneGeometry(0.86, 0.86);
    const padPlaneMat = new THREE.MeshBasicMaterial({
      color: 0xf3d27a,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const padDotGeo = new THREE.CircleGeometry(0.13, 22);
    const padDotMat = new THREE.MeshBasicMaterial({
      color: 0xffe49e,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 32; i++) {
      const grp = new THREE.Group();
      const quad = new THREE.Mesh(padPlaneGeo, padPlaneMat);
      quad.rotation.x = -Math.PI / 2;
      const dot = new THREE.Mesh(padDotGeo, padDotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = 0.002;
      grp.add(quad, dot);
      grp.position.y = 0.014;
      grp.visible = false;
      highlightGroup.add(grp);
      legalPads.push(grp);
    }

    // Vivid crimson target rings for capturable enemy squares (Stage 4)
    const captureRings: THREE.Mesh[] = [];
    const capGeo = new THREE.RingGeometry(0.35, 0.47, 32);
    const capMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(capGeo, capMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.015;
      m.visible = false;
      highlightGroup.add(m);
      captureRings.push(m);
    }

    let desiredCamPos: THREE.Vector3 | null = null;
    let desiredCamTarget: THREE.Vector3 | null = null;
    const cancelScriptedCamera = () => {
      desiredCamPos = null;
      desiredCamTarget = null;
    };
    controls.addEventListener('start', cancelScriptedCamera);

    const clearAllPieces = () => {
      for (const rig of pieceMap.values()) {
        pieceGroup.remove(rig.root);
      }
      pieceMap.clear();
    };

    const syncBoardFromFen = (targetFen: string) => {
      clearAllPieces();
      const chess = new Chess(targetFen);
      const board = chess.board();
      const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = `${String.fromCharCode(97 + f)}${8 - r}` as Square;
          const p = board[r][f];
          if (!p) continue;
          const rig = createWarriorPiece(palette, p.color, p.type, allowLights);
          squareToWorld(sq, rig.root.position);
          rig.root.userData.square = sq;
          pieceGroup.add(rig.root);
          pieceMap.set(sq, rig);
        }
      }
    };

    syncBoardFromFen(fen);

    const onGlbUpdated = () => {
      if (!combatDirector.isBusy()) {
        syncBoardFromFen(settingsRef.current.fen);
      }
    };
    window.addEventListener('glb-models-updated', onGlbUpdated);
    void preloadGlbTemplates();

    const applyMoveVisual = (move: MoveRecord) => {
      const attacker = pieceMap.get(move.from);
      if (!attacker) {
        syncBoardFromFen(move.fenAfter);
        return;
      }

      let capturedSq = move.to;
      if (move.flags.includes('e')) {
        const file = move.to[0];
        const rank = move.color === 'w' ? parseInt(move.to[1], 10) - 1 : parseInt(move.to[1], 10) + 1;
        capturedSq = `${file}${rank}`;
      }
      const defender = move.captured ? pieceMap.get(capturedSq) : undefined;

      if (defender && move.captured) {
        pieceMap.delete(move.from);
        pieceMap.delete(capturedSq);
        pieceMap.set(move.to, attacker);
        attacker.root.userData.square = move.to;

        const combatEvt: CombatEvent = {
          id: `${move.from}-${move.to}-${Date.now()}`,
          attackerColor: move.color,
          attackerType: move.piece,
          defenderColor: move.color === 'w' ? 'b' : 'w',
          defenderType: move.captured,
          from: move.from,
          to: move.to,
          isPromotion: Boolean(move.promotion),
          promotedTo: move.promotion,
        };

        callbacksRef.current.onCombatStateChange?.(true);
        combatDirector.startCaptureCombat(
          combatEvt,
          attacker,
          defender,
          settingsRef.current.combatPace,
          () => {
            pieceGroup.remove(defender.root);
            if (move.promotion) {
              pieceGroup.remove(attacker.root);
              const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
              const promoted = createWarriorPiece(palette, move.color, move.promotion, allowLights);
              squareToWorld(move.to, promoted.root.position);
              promoted.root.userData.square = move.to;
              pieceGroup.add(promoted.root);
              pieceMap.set(move.to, promoted);
              combatDirector.spawnBurst(promoted.root.position, move.color === 'w' ? 0xfbbf24 : 0xa855f7, 44, 3.2);
            }
            callbacksRef.current.onCombatStateChange?.(false);
          }
        );
      } else {
        pieceMap.delete(move.from);
        pieceMap.set(move.to, attacker);
        attacker.root.userData.square = move.to;
        combatDirector.queueSimpleMove(attacker, move.from, move.to, move.piece);

        if (move.flags.includes('k') || move.flags.includes('q')) {
          const rank = move.color === 'w' ? '1' : '8';
          const rookFrom = move.flags.includes('k') ? `h${rank}` : `a${rank}`;
          const rookTo = move.flags.includes('k') ? `f${rank}` : `d${rank}`;
          const rook = pieceMap.get(rookFrom);
          if (rook) {
            pieceMap.delete(rookFrom);
            pieceMap.set(rookTo, rook);
            rook.root.userData.square = rookTo;
            combatDirector.queueSimpleMove(rook, rookFrom, rookTo, 'r');
          }
        }

        if (move.promotion) {
          setTimeout(() => {
            if (pieceMap.get(move.to) === attacker) {
              pieceGroup.remove(attacker.root);
              const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
              const promoted = createWarriorPiece(palette, move.color, move.promotion!, allowLights);
              squareToWorld(move.to, promoted.root.position);
              promoted.root.userData.square = move.to;
              pieceGroup.add(promoted.root);
              pieceMap.set(move.to, promoted);
              combatDirector.spawnBurst(promoted.root.position, move.color === 'w' ? 0xfbbf24 : 0xa855f7, 44, 3.2);
            }
          }, 400);
        }
      }
    };

    const updateHighlights = (opts: {
      selectedSquare: string | null;
      legalTargets: string[];
      captureTargets: string[];
      lastMove: { from: string; to: string } | null;
      checkSquare: string | null;
      hintMove: { from: string; to: string } | null;
      showValidMoves: boolean;
    }) => {
      // Selected lift on warrior pedestal
      for (const [sq, rig] of pieceMap.entries()) {
        rig.root.userData.selectLiftY = sq === opts.selectedSquare ? 0.055 : 0;
      }

      if (opts.selectedSquare) {
        squareToWorld(opts.selectedSquare, selectRing.position);
        selectRing.position.y = 0.016;
        selectRing.visible = true;
        selectAura.position.set(selectRing.position.x, 0.013, selectRing.position.z);
        selectAura.visible = true;
      } else {
        selectRing.visible = false;
        selectAura.visible = false;
      }

      if (opts.checkSquare) {
        squareToWorld(opts.checkSquare, checkRing.position);
        checkRing.position.y = 0.017;
        checkRing.visible = true;
      } else {
        checkRing.visible = false;
      }

      if (opts.lastMove) {
        squareToWorld(opts.lastMove.from, lastMoveFrom.position);
        lastMoveFrom.position.y = 0.01;
        lastMoveFrom.visible = true;
        squareToWorld(opts.lastMove.to, lastMoveTo.position);
        lastMoveTo.position.y = 0.01;
        lastMoveTo.visible = true;
      } else {
        lastMoveFrom.visible = false;
        lastMoveTo.visible = false;
      }

      if (opts.hintMove) {
        squareToWorld(opts.hintMove.from, hintMarkers[0].position);
        hintMarkers[0].position.y = 0.018;
        hintMarkers[0].visible = true;
        squareToWorld(opts.hintMove.to, hintMarkers[1].position);
        hintMarkers[1].position.y = 0.018;
        hintMarkers[1].visible = true;
      } else {
        hintMarkers[0].visible = false;
        hintMarkers[1].visible = false;
      }

      legalPads.forEach((grp, idx) => {
        if (opts.showValidMoves && idx < opts.legalTargets.length) {
          squareToWorld(opts.legalTargets[idx], grp.position);
          grp.position.y = 0.014;
          grp.visible = true;
        } else {
          grp.visible = false;
        }
      });

      captureRings.forEach((m, idx) => {
        if (opts.showValidMoves && idx < opts.captureTargets.length) {
          squareToWorld(opts.captureTargets[idx], m.position);
          m.position.y = 0.015;
          m.visible = true;
        } else {
          m.visible = false;
        }
      });
    };

    const setCameraPreset = (preset: CameraPreset, side: PieceColor) => {
      const effectivePreset = preset === 'default' && side === 'b' ? 'black' : preset;
      const v = CAMERA_VIEWS[effectivePreset];
      desiredCamPos = new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]);
      desiredCamTarget = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
    };

    const rebuildQuality = (quality: GraphicsQuality) => {
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, quality === 'low' ? 1.25 : 2));
      renderer.shadowMap.enabled = !isSoftwareGl && quality !== 'low';
      keyLight.castShadow = !isSoftwareGl && quality !== 'low';
      if (bloomPass) {
        bloomPass.enabled = quality !== 'low' && !autoDowngraded;
      }
      if (smaaPass) {
        smaaPass.enabled = quality !== 'low' && !autoDowngraded;
      }
      arena.dispose();
      arena = buildMedievalArena(scene, palette, quality);
      arena.coordGroup.visible = showCoordinates;
    };

    sceneApiRef.current = {
      syncBoardFromFen,
      applyMoveVisual,
      updateHighlights,
      setCameraPreset,
      setCoordinatesVisible: (visible: boolean) => {
        arena.coordGroup.visible = visible;
      },
      skipCombat: () => combatDirector.skipActiveCombat(),
      rebuildQuality,
    };

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };
    let hoveredSquare: string | null = null;
    let lastHoverTime = 0;
    let lastTooltipKey = '';

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!settingsRef.current.interactive || combatDirector.isBusy()) {
        if (hoveredSquare !== null) {
          hoveredSquare = null;
          hoverRing.visible = false;
        }
        return;
      }
      const now = performance.now();
      if (now - lastHoverTime < 40) return;
      lastHoverTime = now;

      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      let foundPieceSquare: string | null = null;
      for (const hit of hits) {
        const obj = hit.object;
        if (obj.userData.isPieceHit && obj.userData.pieceRoot) {
          foundPieceSquare = (obj.userData.pieceRoot.userData.square as string) || null;
          break;
        }
        if (typeof obj.userData.square === 'string' && pieceMap.has(obj.userData.square)) {
          foundPieceSquare = obj.userData.square;
          break;
        }
      }

      hoveredSquare = foundPieceSquare;
      if (hoveredSquare) {
        squareToWorld(hoveredSquare, hoverRing.position);
        hoverRing.position.y = 0.014;
        hoverRing.visible = true;
        canvas.style.cursor = 'pointer';
      } else {
        hoverRing.visible = false;
        canvas.style.cursor = 'grab';
      }
    };

    const onPointerLeave = () => {
      hoveredSquare = null;
      hoverRing.visible = false;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!settingsRef.current.interactive || combatDirector.isBusy()) return;
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 9) return;

      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const obj = hit.object;
        if (obj.userData.isPieceHit && obj.userData.pieceRoot) {
          const sq = obj.userData.pieceRoot.userData.square as string | undefined;
          if (sq) {
            callbacksRef.current.onSquareClick(sq);
            return;
          }
        }
        if (typeof obj.userData.square === 'string') {
          callbacksRef.current.onSquareClick(obj.userData.square);
          return;
        }
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) {
        composer.setSize(w, h);
      }
      if (bloomPass) {
        bloomPass.resolution.set(w, h);
      }
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lowFpsAccum = 0;

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
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
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
      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.08);
      const elapsed = clock.getElapsedTime();

      // Stage 1: Automatic FPS < 30 for 3s hardware downgrade guard (real WebGL GPU)
      if (!isSoftwareGl && !autoDowngraded && rawDelta > 0 && rawDelta < 0.5) {
        const instFps = 1 / rawDelta;
        if (instFps < 30) {
          lowFpsAccum += rawDelta;
          if (lowFpsAccum >= 3.0) {
            autoDowngraded = true;
            if (bloomPass) bloomPass.enabled = false;
            if (smaaPass) smaaPass.enabled = false;
            combatDirector.lowPerfMode = true;
          }
        } else {
          lowFpsAccum = Math.max(0, lowFpsAccum - rawDelta * 0.5);
        }
      }

      const rigs = Array.from(pieceMap.values());
      combatDirector.update(delta, elapsed, rigs);

      // Stage 2: Sinusoidal vertex wave displacement on cloth Eagle banners (anchored at top)
      for (let i = 0; i < arena.banners.length; i++) {
        const b = arena.banners[i];
        const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const base = b.basePos;
        for (let k = 0; k < pos.count; k++) {
          const ix = k * 3;
          const bx = base[ix];
          const by = base[ix + 1];
          // Top edge ~ +1.19 -> zero displacement; bottom edge ~ -1.19 -> full billowing wave
          const pinFactor = Math.max(0, Math.min(1, (1.19 - by) / 2.38));
          const wave =
            Math.sin(elapsed * 2.8 + b.phase + by * 2.2 + bx * 1.4) * 0.075 +
            Math.cos(elapsed * 4.3 + b.phase + bx * 3.1) * 0.025;
          arr[ix + 2] = base[ix + 2] + wave * pinFactor;
        }
        pos.needsUpdate = true;
      }

      // Stage 2: Soft Additive Fire Sprite wobble & scale flicker
      for (let i = 0; i < arena.flames.length; i++) {
        const f = arena.flames[i];
        const n1 = Math.sin(elapsed * 11.5 + f.phase);
        const n2 = Math.cos(elapsed * 17.3 + f.phase * 1.4);
        const sx = 0.94 + n2 * 0.08;
        const sy = 0.96 + n1 * 0.14;
        f.sprite.scale.set(f.baseScale.x * sx, f.baseScale.y * sy, 1);
        f.sprite.position.x = f.basePos.x + n2 * 0.025;
        f.coreSprite.scale.set(f.baseScale.x * 0.56 * sx, f.baseScale.y * 0.65 * (0.95 + n1 * 0.1), 1);
      }

      // Stage 1: Organic layered-noise fire PointLight flicker
      for (let i = 0; i < arena.torchLights.length; i++) {
        const tl = arena.torchLights[i];
        if (tl.userData.baseIntensity === undefined) {
          tl.userData.baseIntensity = tl.intensity;
        }
        const noise =
          Math.sin(elapsed * 7.1 + i * 2.3) * 0.5 +
          Math.sin(elapsed * 13.7 + i * 1.4) * 0.3 +
          Math.sin(elapsed * 21.3 + i * 0.8) * 0.2;
        tl.intensity = (tl.userData.baseIntensity as number) + noise * 1.45;
      }

      if (arena.emberPoints && arena.emberVelocities && arena.emberOrigins) {
        const posAttr = arena.emberPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const dtClamped = Math.min(delta, 0.05);
        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          arr[ix] += (arena.emberVelocities[ix] + Math.sin(elapsed * 2.5 + i) * 0.18) * dtClamped;
          arr[ix + 1] += arena.emberVelocities[ix + 1] * dtClamped;
          arr[ix + 2] += (arena.emberVelocities[ix + 2] + Math.cos(elapsed * 2.2 + i) * 0.18) * dtClamped;

          if (arr[ix + 1] > arena.emberOrigins[ix + 1] + 2.8) {
            arr[ix] = arena.emberOrigins[ix] + (Math.random() - 0.5) * 0.3;
            arr[ix + 1] = arena.emberOrigins[ix + 1];
            arr[ix + 2] = arena.emberOrigins[ix + 2] + (Math.random() - 0.5) * 0.3;
          }
        }
        posAttr.needsUpdate = true;
      }
      if (arena.mistPoints) {
        arena.mistPoints.rotation.y += delta * 0.014;
      }

      // Stage 4: Subtle pulsing animations on legal move pads, select ring, hover & check rings
      padPlaneMat.opacity = 0.2 + Math.sin(elapsed * 2.4) * 0.11;
      padDotMat.opacity = 0.78 + Math.sin(elapsed * 2.4) * 0.18;
      if (selectRing.visible) {
        selectRing.scale.setScalar(1 + Math.sin(elapsed * 3.5) * 0.035);
        selectAuraMat.opacity = 0.28 + Math.sin(elapsed * 3.5) * 0.1;
      }
      if (hoverRing.visible) {
        hoverRing.scale.setScalar(1 + Math.sin(elapsed * 5.2) * 0.04);
      }
      if (checkRing.visible) {
        checkRing.scale.setScalar(1 + Math.sin(elapsed * 6.0) * 0.08);
      }

      if (combatDirector.combatCameraDesiredPos && combatDirector.combatCameraTarget) {
        const lambda = 4.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, combatDirector.combatCameraDesiredPos.x, lambda, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, combatDirector.combatCameraDesiredPos.y, lambda, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, combatDirector.combatCameraDesiredPos.z, lambda, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, combatDirector.combatCameraTarget.x, lambda, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, combatDirector.combatCameraTarget.y, lambda, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, combatDirector.combatCameraTarget.z, lambda, delta);
      } else if (desiredCamPos && desiredCamTarget) {
        const lambda = 5.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, lambda, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, lambda, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, lambda, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredCamTarget.x, lambda, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredCamTarget.y, lambda, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredCamTarget.z, lambda, delta);
        if (camera.position.distanceTo(desiredCamPos) < 0.04) {
          desiredCamPos = null;
          desiredCamTarget = null;
        }
      }

      if (combatDirector.cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * combatDirector.cameraShake;
        camera.position.y += (Math.random() - 0.5) * combatDirector.cameraShake;
      }

      controls.update();

      // Stage 4: Project hovered/selected warrior head to 2D screen coords for Cinzel Tooltip (with 150ms fade)
      const inspectSquare = settingsRef.current.interactive && !combatDirector.isBusy()
        ? hoveredSquare || settingsRef.current.selectedSquare
        : null;
      const inspectRig = inspectSquare ? pieceMap.get(inspectSquare) : undefined;
      if (inspectSquare && inspectRig) {
        _projVec.set(
          inspectRig.root.position.x,
          inspectRig.root.position.y + inspectRig.headHeight + 0.24,
          inspectRig.root.position.z
        );
        _projVec.project(camera);
        const w = container?.clientWidth || window.innerWidth;
        const h = container?.clientHeight || window.innerHeight;
        const sx = Math.round((_projVec.x * 0.5 + 0.5) * w);
        const sy = Math.round((-_projVec.y * 0.5 + 0.5) * h);
        const pColor = inspectRig.root.userData.color as PieceColor;
        const pType = inspectRig.root.userData.type as PieceSymbol;
        const key = `${inspectSquare}_${pColor}_${pType}_${Math.round(sx / 3)}_${Math.round(sy / 3)}`;
        if (key !== lastTooltipKey) {
          lastTooltipKey = key;
          const nextTip = { x: sx, y: sy, color: pColor, type: pType, square: inspectSquare };
          lastTooltipDataRef.current = nextTip;
          setTooltip(nextTip);
          setTooltipVisible(true);
        }
      } else if (lastTooltipKey !== '') {
        lastTooltipKey = '';
        setTooltipVisible(false);
      }

      if (composer && !isSoftwareGl) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

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
      window.removeEventListener('glb-models-updated', onGlbUpdated);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.removeEventListener('start', cancelScriptedCamera);
      controls.dispose();
      arena.dispose();
      palette.dispose();
      envTex.dispose();
      composer?.dispose();
      composerRT?.dispose();
      selectRingMat.dispose();
      selectAuraMat.dispose();
      hoverRingMat.dispose();
      checkRingMat.dispose();
      lastMoveFromMat.dispose();
      padPlaneGeo.dispose();
      padPlaneMat.dispose();
      padDotGeo.dispose();
      padDotMat.dispose();
      capGeo.dispose();
      capMat.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  useEffect(() => {
    if (!sceneApiRef.current) return;
    if (latestMoveEvent && latestMoveEvent.seq !== lastSeqRef.current) {
      lastSeqRef.current = latestMoveEvent.seq;
      sceneApiRef.current.applyMoveVisual(latestMoveEvent.move);
    } else if (!latestMoveEvent) {
      lastSeqRef.current = 0;
      sceneApiRef.current.syncBoardFromFen(fen);
    }
  }, [fen, latestMoveEvent]);

  useEffect(() => {
    sceneApiRef.current?.updateHighlights({
      selectedSquare,
      legalTargets,
      captureTargets,
      lastMove,
      checkSquare,
      hintMove,
      showValidMoves,
    });
  }, [selectedSquare, legalTargets, captureTargets, lastMove, checkSquare, hintMove, showValidMoves]);

  useEffect(() => {
    sceneApiRef.current?.setCameraPreset(cameraPreset, orientation);
  }, [cameraPreset, cameraResetTrigger, orientation]);

  useEffect(() => {
    sceneApiRef.current?.setCoordinatesVisible(showCoordinates);
  }, [showCoordinates]);

  const mountedQualityRef = useRef<GraphicsQuality>(graphicsQuality);
  useEffect(() => {
    if (mountedQualityRef.current === graphicsQuality) return;
    mountedQualityRef.current = graphicsQuality;
    sceneApiRef.current?.rebuildQuality(graphicsQuality);
  }, [graphicsQuality]);

  useEffect(() => {
    if (skipCombatTrigger > 0) {
      sceneApiRef.current?.skipCombat();
    }
  }, [skipCombatTrigger]);

  const shownTip = tooltip ?? lastTooltipDataRef.current;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0c182c]">
      <div ref={mountRef} className="w-full h-full" />

      {/* Stage 4: Cinzel Floating Roman Piece Role Tooltip with 150ms fade-in/out */}
      {shownTip && (
        <div
          className={`pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-full px-3.5 py-2 rounded-lg bg-[#0d121d]/95 border border-[#D4AF37]/60 shadow-2xl whitespace-nowrap transition-opacity duration-150 ${
            tooltipVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: `${Math.max(115, Math.min(window.innerWidth - 115, shownTip.x))}px`,
            top: `${Math.max(76, shownTip.y)}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full border ${
                shownTip.color === 'w'
                  ? 'bg-[#D9A840] border-[#FFE49E]'
                  : 'bg-[#7C3AED] border-[#D8B4FE]'
              }`}
            />
            <span className="font-display text-xs font-bold text-[#FFD700] tracking-wider">
              {getPieceTooltipCopy(shownTip.type, lang).name}
            </span>
            <span className="text-[11px] font-mono-tabular font-bold text-[#D4AF37] uppercase">
              {shownTip.square}
            </span>
          </div>
          <div className="text-[11px] text-[#CBD5E1] pl-4.5 mt-0.5">
            {getPieceTooltipCopy(shownTip.type, lang).desc}
          </div>
        </div>
      )}

      {assetError && (
        <div className="absolute inset-x-4 top-20 z-30 mx-auto max-w-lg rounded-xl bg-[#2A0E14]/95 border border-red-500/60 px-4 py-3 text-xs text-red-100 shadow-2xl">
          <p className="font-semibold">Lỗi nạp tài nguyên ảnh đồ họa 3D</p>
          <p className="mt-1 opacity-90">{assetError}</p>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1017]/95 text-[#F3EFE6] p-6 text-center">
          <p className="text-sm">WebGL context interrupted — restoring 3D battlefield...</p>
        </div>
      )}
    </div>
  );
};

export const ChessArena3D: React.FC<ChessArenaProps> = (props) => {
  if (USE_LEGACY_RENDERER) {
    return <LegacyChessArena3D {...props} />;
  }
  return <UpgradedChessArena3D {...props} />;
};
