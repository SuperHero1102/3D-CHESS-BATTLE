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
import {
  createWarriorPiece,
  disposeWarriorRig,
  PEDESTAL_HEIGHT,
  setWarriorHighlightState,
  WarriorRig,
} from './warriorFactory';
import { ArenaHandles, buildMedievalArena, squareToWorld } from './arenaBuilder';
import { CombatDirector } from './combatDirector';
import {
  GlbDebugCacheSnapshot,
  GlbLoadProgressSnapshot,
  GlbPieceKey,
  USE_GLB_PIECES,
  getGlbBaseUrl,
  getGlbDebugCacheSnapshot,
  getGlbLoadProgressSnapshot,
  getLoadedGlbTemplate,
  getPieceTooltipCopy,
  preloadGlbTemplates,
  setGlbBaseUrl,
  subscribeGlbProgress,
  toGlbPieceKey,
} from './modelLoader';
import { SETUP_V2, UX_POLISH } from '../config/featureFlags';
import { t } from '../i18n/translations';

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
  onAutoDowngradeCombatPace?: () => void;
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
  onAutoDowngradeCombatPace,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [glbProgress, setGlbProgress] = useState<GlbLoadProgressSnapshot>(getGlbLoadProgressSnapshot);
  const [glbUrlInput, setGlbUrlInput] = useState<string>(() => getGlbBaseUrl());
  const [hideGlbWarning, setHideGlbWarning] = useState(false);
  const [tooltip, setTooltip] = useState<FloatingTooltipState | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const lastTooltipDataRef = useRef<FloatingTooltipState | null>(null);

  const isDebugMode =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [debugReport, setDebugReport] = useState<{
    cache: GlbDebugCacheSnapshot;
    boardPieces: Array<{
      square: string;
      type: PieceSymbol;
      color: PieceColor;
      lookupKey: string;
      isGlb: boolean;
      modelLabel: string;
      reason: string;
    }>;
    syncCallCount: number;
    firstSyncAt: string | null;
    lastSyncAt: string | null;
    onGlbUpdatedCalls: number;
    onGlbUpdatedSynced: number;
    onGlbUpdatedSkippedBusy: number;
    lastOnGlbUpdatedAt: string | null;
  } | null>(null);
  const debugRefreshFnRef = useRef<(() => void) | null>(null);

  const callbacksRef = useRef({ onSquareClick, onCombatStateChange, onAutoDowngradeCombatPace });
  callbacksRef.current = { onSquareClick, onCombatStateChange, onAutoDowngradeCombatPace };

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
    return subscribeGlbProgress((snap) => {
      setGlbProgress(snap);
      if (isDebugMode) {
        debugRefreshFnRef.current?.();
      }
    });
  }, [isDebugMode]);

  useEffect(() => {
    if (!isDebugMode) return;
    const id = window.setInterval(() => {
      debugRefreshFnRef.current?.();
    }, 500);
    return () => window.clearInterval(id);
  }, [isDebugMode]);

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

    const isCoarsePointer =
      typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    const maxDpr = UX_POLISH ? (isCoarsePointer ? 1.5 : 2) : 2;

    if (UX_POLISH) {
      // Ensure GLB preload starts even if WebGL initialization fails (prevents splash deadlock)
      void preloadGlbTemplates();
    }

    const initW = container.clientWidth || window.innerWidth;
    const initH = container.clientHeight || window.innerHeight;

    // Stage 1: Renderer + ACESFilmicToneMapping (exposure ~0.9)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : 'WebGL initialization failed');
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setPixelRatio(isSoftwareGl ? 0.65 : Math.min(window.devicePixelRatio || 1, maxDpr));
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
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
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

    let dbgSyncCallCount = 0;
    let dbgFirstSyncAt: string | null = null;
    let dbgLastSyncAt: string | null = null;
    let dbgOnGlbUpdatedCalls = 0;
    let dbgOnGlbUpdatedSynced = 0;
    let dbgOnGlbUpdatedSkippedBusy = 0;
    let dbgLastOnGlbUpdatedAt: string | null = null;

    const emitDebugSnapshot = () => {
      if (!isDebugMode) return;
      const cache = getGlbDebugCacheSnapshot();
      const entryByKey = new Map(cache.entries.map((e) => [e.key, e]));
      const boardPieces: Array<{
        square: string;
        type: PieceSymbol;
        color: PieceColor;
        lookupKey: string;
        isGlb: boolean;
        modelLabel: string;
        reason: string;
      }> = [];

      for (const [sq, rig] of pieceMap.entries()) {
        const pColor = (rig.root.userData.color as PieceColor) || 'w';
        const pType = (rig.root.userData.type as PieceSymbol) || 'p';
        const lookupKey = toGlbPieceKey(pColor, pType);
        const cacheEntry = entryByKey.get(lookupKey);
        const isGlb = Boolean(rig.isGlb && rig.root.userData.modelVersion === 'glb');
        const glbName = (rig.root.userData.glbFilename as string) || `${lookupKey}.glb`;
        const modelLabel = isGlb ? `MODEL: glb (${glbName})` : 'MODEL: cũ';

        let reason = '';
        if (!isGlb) {
          if (!cache.useGlbPieces) {
            reason = 'cờ tắt (USE_GLB_PIECES=false)';
          } else if (cacheEntry && !cacheEntry.keysMatch) {
            reason = `khóa không khớp (lưu=${cacheEntry.storeKey}, lấy=${cacheEntry.lookupKey})`;
          } else if (cacheEntry?.error && /parse|GLB|glTF|LFS|định dạng/i.test(cacheEntry.error)) {
            reason = `lỗi parse (${cacheEntry.error})`;
          } else if (!cacheEntry || !cacheEntry.hasInCache) {
            reason = `chưa có trong kho (${cacheEntry?.error || cacheEntry?.status || 'missing'})`;
          } else {
            reason = 'chưa gọi lại dựng quân (có trong kho nhưng quân trên bàn chưa dựng lại)';
          }
        }

        boardPieces.push({
          square: sq,
          type: pType,
          color: pColor,
          lookupKey,
          isGlb,
          modelLabel,
          reason,
        });
      }

      boardPieces.sort((a, b) => a.square.localeCompare(b.square));
      setDebugReport({
        cache,
        boardPieces,
        syncCallCount: dbgSyncCallCount,
        firstSyncAt: dbgFirstSyncAt,
        lastSyncAt: dbgLastSyncAt,
        onGlbUpdatedCalls: dbgOnGlbUpdatedCalls,
        onGlbUpdatedSynced: dbgOnGlbUpdatedSynced,
        onGlbUpdatedSkippedBusy: dbgOnGlbUpdatedSkippedBusy,
        lastOnGlbUpdatedAt: dbgLastOnGlbUpdatedAt,
      });
    };
    debugRefreshFnRef.current = emitDebugSnapshot;

    let cachedRigs: WarriorRig[] = [];
    const promoTimers = new Set<number>();

    const refreshCachedRigs = () => {
      cachedRigs = Array.from(pieceMap.values());
    };

    const clearAllPieces = () => {
      for (const rig of pieceMap.values()) {
        disposeWarriorRig(rig);
        pieceGroup.remove(rig.root);
      }
      pieceMap.clear();
      cachedRigs = [];
    };

    const syncBoardFromFen = (targetFen: string) => {
      dbgSyncCallCount += 1;
      const nowStr = new Date().toLocaleTimeString();
      if (!dbgFirstSyncAt) dbgFirstSyncAt = nowStr;
      dbgLastSyncAt = nowStr;
      clearAllPieces();

      const snap = getGlbLoadProgressSnapshot();
      // MỤC 1: Lần nạp đầu tiên giữ bàn cờ trống (chỉ hiển thị nền & lửa), tuyệt đối không hiện quân cũ
      if (USE_GLB_PIECES && snap.isFirstLoadBlocking) {
        emitDebugSnapshot();
        return;
      }

      const chess = new Chess(targetFen);
      const board = chess.board();
      const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = `${String.fromCharCode(97 + f)}${8 - r}` as Square;
          const p = board[r][f];
          if (!p) continue;
          if (USE_GLB_PIECES) {
            const tpl = getLoadedGlbTemplate(p.color, p.type);
            const slotStatus = snap.slotStates[toGlbPieceKey(p.color, p.type)]?.status;
            if (!tpl && snap.loading && slotStatus !== 'missing' && slotStatus !== 'error') {
              continue;
            }
          }
          const rig = createWarriorPiece(palette, p.color, p.type, allowLights);
          squareToWorld(sq, rig.root.position);
          rig.root.userData.square = sq;
          pieceGroup.add(rig.root);
          pieceMap.set(sq, rig);
        }
      }
      refreshCachedRigs();
      emitDebugSnapshot();
    };

    const preloadReq = preloadGlbTemplates();
    syncBoardFromFen(fen);

    let pendingGlbUpgrade = false;

    const upgradeBoardPiecesWithGlb = (targetKey?: GlbPieceKey) => {
      const snap = getGlbLoadProgressSnapshot();
      if (USE_GLB_PIECES && snap.isFirstLoadBlocking) {
        return;
      }

      const chess = new Chess(settingsRef.current.fen);
      const board = chess.board();
      const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
      let upgradedAny = false;

      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = `${String.fromCharCode(97 + f)}${8 - r}` as Square;
          const p = board[r][f];
          if (!p) continue;

          const pColor = p.color;
          const pType = p.type;
          const pieceKey = toGlbPieceKey(pColor, pType);
          const tpl = getLoadedGlbTemplate(pColor, pType);
          const slotStatus = snap.slotStates[pieceKey]?.status;
          const oldRig = pieceMap.get(sq);

          if (!oldRig) {
            if (USE_GLB_PIECES && !tpl && snap.loading && slotStatus !== 'missing' && slotStatus !== 'error') {
              continue;
            }
            const newRig = createWarriorPiece(palette, pColor, pType, allowLights);
            squareToWorld(sq, newRig.root.position);
            newRig.root.userData.square = sq;
            if (tpl) {
              newRig.root.userData.glbSource = tpl.source;
            }
            pieceGroup.add(newRig.root);
            pieceMap.set(sq, newRig);
            upgradedAny = true;
            continue;
          }

          if (targetKey && pieceKey !== targetKey) continue;
          if (!tpl) continue;

          // Skip only if already using this exact loaded template source
          if (
            oldRig.isGlb &&
            oldRig.root.userData.modelVersion === 'glb' &&
            oldRig.root.userData.glbSource === tpl.source &&
            oldRig.root.userData.glbTriangles === tpl.triangleCount
          ) {
            continue;
          }

          const prevHighlight =
            (oldRig.root.userData.highlightState as 'none' | 'hover' | 'select' | undefined) ?? 'none';
          const prevSelectLiftY = (oldRig.root.userData.selectLiftY as number | undefined) ?? 0;
          const prevPos = oldRig.root.position.clone();

          disposeWarriorRig(oldRig);
          pieceGroup.remove(oldRig.root);

          const newRig = createWarriorPiece(palette, pColor, pType, allowLights);
          newRig.root.position.copy(prevPos);
          newRig.root.userData.square = sq;
          newRig.root.userData.selectLiftY = prevSelectLiftY;
          newRig.root.userData.glbSource = tpl.source;
          setWarriorHighlightState(newRig, prevHighlight);

          pieceGroup.add(newRig.root);
          pieceMap.set(sq, newRig);
          upgradedAny = true;
        }
      }

      if (upgradedAny) {
        refreshCachedRigs();
      }
      if (upgradedAny || isDebugMode) {
        emitDebugSnapshot();
      }
    };

    const onGlbUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ key?: GlbPieceKey }>).detail;
      dbgOnGlbUpdatedCalls += 1;
      dbgLastOnGlbUpdatedAt = new Date().toLocaleTimeString();
      if (USE_GLB_PIECES && getGlbLoadProgressSnapshot().isFirstLoadBlocking) {
        emitDebugSnapshot();
        return;
      }
      if (!combatDirector.isBusy()) {
        dbgOnGlbUpdatedSynced += 1;
        upgradeBoardPiecesWithGlb(detail?.key);
      } else {
        dbgOnGlbUpdatedSkippedBusy += 1;
        pendingGlbUpgrade = true;
        emitDebugSnapshot();
      }
    };
    window.addEventListener('glb-models-updated', onGlbUpdated);
    void preloadReq.then(() => {
      if (!combatDirector.isBusy()) {
        upgradeBoardPiecesWithGlb();
      } else {
        pendingGlbUpgrade = true;
      }
    });

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
        refreshCachedRigs();

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
            disposeWarriorRig(defender);
            pieceGroup.remove(defender.root);
            if (move.promotion) {
              disposeWarriorRig(attacker);
              pieceGroup.remove(attacker.root);
              const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
              const promoted = createWarriorPiece(palette, move.color, move.promotion, allowLights);
              squareToWorld(move.to, promoted.root.position);
              promoted.root.userData.square = move.to;
              pieceGroup.add(promoted.root);
              pieceMap.set(move.to, promoted);
              combatDirector.spawnBurst(promoted.root.position, move.color === 'w' ? 0xfbbf24 : 0xa855f7, 44, 3.2);
            }
            refreshCachedRigs();
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
          const tid = window.setTimeout(() => {
            promoTimers.delete(tid);
            if (pieceMap.get(move.to) === attacker) {
              disposeWarriorRig(attacker);
              pieceGroup.remove(attacker.root);
              const allowLights = !isSoftwareGl && settingsRef.current.graphicsQuality !== 'low';
              const promoted = createWarriorPiece(palette, move.color, move.promotion!, allowLights);
              squareToWorld(move.to, promoted.root.position);
              promoted.root.userData.square = move.to;
              pieceGroup.add(promoted.root);
              pieceMap.set(move.to, promoted);
              refreshCachedRigs();
              combatDirector.spawnBurst(promoted.root.position, move.color === 'w' ? 0xfbbf24 : 0xa855f7, 44, 3.2);
            }
          }, 400);
          promoTimers.add(tid);
        }
        refreshCachedRigs();
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
      // Selected lift on warrior pedestal + per-piece cloned emissive highlight
      for (const [sq, rig] of pieceMap.entries()) {
        rig.root.userData.selectLiftY = sq === opts.selectedSquare ? 0.055 : 0;
        const nextHighlight =
          sq === opts.selectedSquare ? 'select' : sq === hoveredSquare ? 'hover' : 'none';
        setWarriorHighlightState(rig, nextHighlight);
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
      renderer.setPixelRatio(
        isSoftwareGl ? 0.65 : Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : maxDpr)
      );
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
    const activePointers = new Set<number>();
    let multiTouchGesture = false;
    let lastPointerType = 'mouse';

    const onPointerDown = (e: PointerEvent) => {
      lastPointerType = e.pointerType || 'mouse';
      if (UX_POLISH) {
        activePointers.add(e.pointerId);
        if (activePointers.size > 1) {
          multiTouchGesture = true;
        }
        if (activePointers.size === 1) {
          downPos = { x: e.clientX, y: e.clientY };
        }
        if (e.pointerType !== 'mouse' && hoveredSquare !== null) {
          hoveredSquare = null;
          hoverRing.visible = false;
        }
      } else {
        downPos = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      lastPointerType = e.pointerType || 'mouse';
      if (UX_POLISH && e.pointerType !== 'mouse') {
        return;
      }
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
      for (const [sq, rig] of pieceMap.entries()) {
        const nextHighlight =
          sq === settingsRef.current.selectedSquare ? 'select' : sq === hoveredSquare ? 'hover' : 'none';
        setWarriorHighlightState(rig, nextHighlight);
      }
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
      for (const [sq, rig] of pieceMap.entries()) {
        setWarriorHighlightState(rig, sq === settingsRef.current.selectedSquare ? 'select' : 'none');
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        multiTouchGesture = false;
      }
      onPointerLeave();
    };

    const onPointerUp = (e: PointerEvent) => {
      lastPointerType = e.pointerType || 'mouse';
      if (UX_POLISH) {
        activePointers.delete(e.pointerId);
        if (multiTouchGesture) {
          if (activePointers.size === 0) {
            multiTouchGesture = false;
          }
          return;
        }
      }
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      const tolerance = UX_POLISH ? (e.pointerType === 'mouse' ? 6 : 10) : 9;
      if (dist > tolerance) return;
      if (combatDirector.isBusy()) {
        combatDirector.skipActiveCombat();
        return;
      }
      if (!settingsRef.current.interactive) return;

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
    canvas.addEventListener('pointercancel', onPointerCancel);

    let resizeTimer = 0;
    const performResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth || window.innerWidth);
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (UX_POLISH) {
        const curMaxDpr = settingsRef.current.graphicsQuality === 'low' ? 1.25 : maxDpr;
        renderer.setPixelRatio(isSoftwareGl ? 0.65 : Math.min(window.devicePixelRatio || 1, curMaxDpr));
      }
      renderer.setSize(w, h);
      if (composer) {
        composer.setSize(w, h);
      }
      if (bloomPass) {
        bloomPass.resolution.set(w, h);
      }
    };

    const scheduleResize = (delayMs: number) => {
      if (!UX_POLISH) {
        performResize();
        return;
      }
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(performResize, delayMs);
    };

    const onResize = () => scheduleResize(120);
    const onOrientationChange = () => scheduleResize(220);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
    visualVp?.addEventListener('resize', onResize);
    let resizeObs: ResizeObserver | null = null;
    if (UX_POLISH && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => scheduleResize(120));
      resizeObs.observe(container);
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let lastTickMs = performance.now();
    let elapsedSec = 0;
    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lowFpsAccum = 0;

    const cancelScheduled = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (timerId) {
        clearTimeout(timerId);
        timerId = 0;
      }
    };

    const scheduleNext = () => {
      if (disposed || document.hidden) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const handleVisibilityChange = () => {
      if (disposed) return;
      if (document.hidden) {
        cancelScheduled();
      } else {
        lastTickMs = performance.now();
        scheduleNext();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        timerId = window.setTimeout(cb, 80);
        return;
      }
      const fenceStart = performance.now();
      const poll = () => {
        rafId = 0;
        if (disposed || document.hidden) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && performance.now() - fenceStart < 5000) {
          rafId = requestAnimationFrame(poll);
        } else {
          gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 40);
        }
      };
      rafId = requestAnimationFrame(poll);
    }

    function tick() {
      if (disposed || document.hidden) return;
      const nowMs = performance.now();
      const rawDelta = Math.max(0, (nowMs - lastTickMs) / 1000);
      lastTickMs = nowMs;
      const delta = Math.min(rawDelta, isSoftwareGl ? 0.65 : 0.08);
      elapsedSec += delta;
      const elapsed = elapsedSec;

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
            callbacksRef.current.onAutoDowngradeCombatPace?.();
          }
        } else {
          lowFpsAccum = Math.max(0, lowFpsAccum - rawDelta * 0.5);
        }
      }

      if (pendingGlbUpgrade && !combatDirector.isBusy()) {
        pendingGlbUpgrade = false;
        upgradeBoardPiecesWithGlb();
      }

      combatDirector.update(delta, elapsed, cachedRigs);

      if (bloomPass) {
        bloomPass.strength = 0.6 + combatDirector.bloomBoost;
      }

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
          const pinFactor = Math.max(0, Math.min(1, (1.19 - by) / 2.38));
          const wave =
            Math.sin(elapsed * 2.8 + b.phase + by * 2.2 + bx * 1.4) * 0.075 +
            Math.cos(elapsed * 4.3 + b.phase + bx * 3.1) * 0.025;
          arr[ix + 2] = base[ix + 2] + wave * pinFactor;
        }
        pos.needsUpdate = true;
      }

      arena.updateFlames(elapsed, delta, autoDowngraded || settingsRef.current.graphicsQuality === 'low');

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

      const camDelta = isSoftwareGl ? Math.min(rawDelta, 1.0) : delta;
      if (combatDirector.combatCameraDesiredPos && combatDirector.combatCameraTarget) {
        const lambda = 4.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, combatDirector.combatCameraDesiredPos.x, lambda, camDelta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, combatDirector.combatCameraDesiredPos.y, lambda, camDelta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, combatDirector.combatCameraDesiredPos.z, lambda, camDelta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, combatDirector.combatCameraTarget.x, lambda, camDelta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, combatDirector.combatCameraTarget.y, lambda, camDelta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, combatDirector.combatCameraTarget.z, lambda, camDelta);
      } else if (desiredCamPos && desiredCamTarget) {
        const lambda = 5.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, lambda, camDelta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, lambda, camDelta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, lambda, camDelta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredCamTarget.x, lambda, camDelta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredCamTarget.y, lambda, camDelta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredCamTarget.z, lambda, camDelta);
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

      // Stage 4: Project hovered/selected warrior head to 2D screen coords for Cinzel Tooltip (mouse-only when UX_POLISH=true)
      const allowTooltip = !UX_POLISH || lastPointerType === 'mouse';
      const inspectSquare = allowTooltip && settingsRef.current.interactive && !combatDirector.isBusy()
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

      scheduleNext();
    }

    tick();

    return () => {
      disposed = true;
      cancelScheduled();
      for (const tid of promoTimers) {
        clearTimeout(tid);
      }
      promoTimers.clear();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeObs?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      visualVp?.removeEventListener('resize', onResize);
      window.removeEventListener('glb-models-updated', onGlbUpdated);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.removeEventListener('start', cancelScriptedCamera);
      controls.dispose();
      combatDirector.dispose();
      clearAllPieces();
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

      {glbProgress.enabled && glbProgress.isFirstLoadBlocking && (
        <div
          id="first-load-overlay"
          className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none bg-[#090d16]/45"
        >
          <div className="w-[min(440px,90vw)] rounded-2xl bg-[#0d121d]/95 border border-[#D4AF37]/60 px-6 py-5 shadow-2xl">
            <div className="font-display text-sm font-bold text-[#FFD700] tracking-wider text-center">
              Đang nạp đồ họa lần đầu…
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#CBD5E1] font-mono-tabular">
              <span>
                {glbProgress.loadedCount}/{glbProgress.totalCount} mô hình .glb
              </span>
              <span>{glbProgress.percent}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#C8962E] to-[#FFD700] transition-all duration-150"
                style={{ width: `${glbProgress.percent}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] font-mono-tabular text-[#9AA3B2] text-center">
              {glbProgress.loadedMB} MB / ~{glbProgress.totalMB} MB (tự động lưu cục bộ cho các lần mở sau)
            </div>
          </div>
        </div>
      )}

      {glbProgress.enabled && !glbProgress.isFirstLoadBlocking && glbProgress.showLoadingBanner && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-30 w-[min(420px,92vw)] rounded-xl bg-[#0d121d]/95 border border-[#D4AF37]/50 px-4 py-3 shadow-2xl">
          <div className="flex items-center justify-between text-xs font-semibold text-[#FFD700]">
            <span>Đang nạp mô hình quân cờ…</span>
            <span className="font-mono-tabular">
              {glbProgress.percent}% ({glbProgress.loadedCount}/{glbProgress.totalCount})
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#C8962E] to-[#FFD700] transition-all duration-150"
              style={{ width: `${glbProgress.percent}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] font-mono-tabular text-[#9AA3B2]">
            {glbProgress.loadedMB} MB / ~{glbProgress.totalMB} MB
          </div>
        </div>
      )}

      {glbProgress.enabled && !glbProgress.loading && glbProgress.missingFiles.length > 0 && !hideGlbWarning && (
        <div className="fixed inset-x-4 top-20 z-30 mx-auto max-w-xl rounded-xl bg-[#2A0E14]/95 border border-red-500/70 px-4 py-3 text-xs text-red-100 shadow-2xl space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-red-200">
                Thiếu mô hình:{' '}
                {glbProgress.missingFiles
                  .slice(0, 3)
                  .map((m) => `${m.filename} (${m.reason})`)
                  .join('; ')}
                {glbProgress.missingFiles.length > 3 ? ` (+${glbProgress.missingFiles.length - 3} file khác)` : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-red-200/85">
                Đã nạp {glbProgress.loadedCount}/{glbProgress.totalCount} file .glb. Các ô thiếu hiển thị cột mốc tạm thời.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHideGlbWarning(true)}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] text-red-100 shrink-0"
            >
              Ẩn
            </button>
          </div>
          <form
            className="flex items-center gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              setGlbBaseUrl(glbUrlInput);
              setHideGlbWarning(false);
              void preloadGlbTemplates(true);
            }}
          >
            <input
              type="url"
              value={glbUrlInput}
              onChange={(e) => setGlbUrlInput(e.target.value)}
              placeholder="Dán URL GitHub hoặc CDN chứa 12 file .glb..."
              className="flex-1 rounded-lg bg-black/40 border border-red-400/40 px-2.5 py-1.5 text-[11px] text-white placeholder:text-red-200/50 focus:outline-none focus:border-[#D4AF37]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017] font-bold text-[11px] shrink-0"
            >
              Tải .glb
            </button>
          </form>
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

      {isDebugMode && debugReport && (
        <div
          id="glb-debug-panel"
          className="fixed top-2 left-2 z-50 w-[min(96vw,880px)] max-h-[90vh] overflow-y-auto rounded-xl bg-[#090d16]/95 border border-[#D4AF37]/80 p-3 text-[11px] font-mono text-[#E2E8F0] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2 mb-2">
            <div className="font-bold text-[#FFD700]">
              [GLB DEBUG PANEL ?debug=1] — Trên bàn: {debugReport.boardPieces.filter((p) => p.isGlb).length}/
              {debugReport.boardPieces.length} MODEL: glb | Kho: {debugReport.cache.loadedCount}/12
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => debugRefreshFnRef.current?.()}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px]"
              >
                Làm mới
              </button>
              <button
                type="button"
                onClick={() => setDebugCollapsed((c) => !c)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px]"
              >
                {debugCollapsed ? 'Mở rộng' : 'Thu gọn'}
              </button>
            </div>
          </div>

          {!debugCollapsed && (
            <div className="space-y-2.5">
              {/* a) Giá trị USE_GLB_PIECES */}
              <div className="rounded bg-white/5 p-2">
                <span className="font-bold text-[#93C5FD]">a) USE_GLB_PIECES:</span>{' '}
                <span className={debugReport.cache.useGlbPieces ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {String(debugReport.cache.useGlbPieces)}
                </span>{' '}
                | <span className="text-[#94A3B8]">baseUrl:</span>{' '}
                <span className="break-all text-[#FDE68A]">{debugReport.cache.baseUrl}</span>
              </div>

              {/* b) Kho mô hình 12 khóa */}
              <div className="rounded bg-white/5 p-2">
                <div className="font-bold text-[#93C5FD] mb-1">
                  b) Kho mô hình (12 khóa) — Lưu: loadedTemplates[key] (modelLoader.ts:850) | Lấy: getLoadedGlbTemplate(color, type) -&gt; toGlbPieceKey() (modelLoader.ts:974-979):
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-white/15 text-[#94A3B8]">
                        <th className="py-0.5 pr-2">Khóa lưu</th>
                        <th className="py-0.5 pr-2">Khóa lấy</th>
                        <th className="py-0.5 pr-2">Khớp?</th>
                        <th className="py-0.5 pr-2">Kho</th>
                        <th className="py-0.5 pr-2">Parse</th>
                        <th className="py-0.5 pr-2">Tam giác</th>
                        <th className="py-0.5 pr-2">Box3 chuẩn hóa (W×H×D)</th>
                        <th className="py-0.5">Trạng thái/Nguồn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugReport.cache.entries.map((e) => (
                        <tr key={e.key} className="border-b border-white/5">
                          <td className="py-0.5 pr-2 text-[#FDE68A]">{e.storeKey}</td>
                          <td className="py-0.5 pr-2 text-[#BAE6FD]">{e.lookupKey}</td>
                          <td className="py-0.5 pr-2">{e.keysMatch ? 'KHỚP' : 'LỆCH'}</td>
                          <td className={`py-0.5 pr-2 font-bold ${e.hasInCache ? 'text-emerald-400' : 'text-red-400'}`}>
                            {e.hasInCache ? 'có' : 'thiếu'}
                          </td>
                          <td className="py-0.5 pr-2">{e.parsed ? 'đã parse' : 'chưa'}</td>
                          <td className="py-0.5 pr-2">{e.triangles.toLocaleString()}</td>
                          <td className="py-0.5 pr-2">
                            {e.normalizedBox3[0]}×{e.normalizedBox3[1]}×{e.normalizedBox3[2]}
                          </td>
                          <td className="py-0.5 text-[#CBD5E1]">
                            {e.status}
                            {e.source ? ` (${e.source})` : ''}
                            {e.error ? ` — ${e.error}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* d) Tên hàm/file/dòng */}
              <div className="rounded bg-white/5 p-2 space-y-0.5">
                <div className="font-bold text-[#93C5FD]">d) Hàm dựng mesh &amp; nơi gọi:</div>
                <div>
                  • Dựng mesh quân: <span className="text-[#FDE68A]">createWarriorPiece()</span> (src/three/warriorFactory.ts:1689) -&gt;{' '}
                  <span className="text-[#FDE68A]">getLoadedGlbTemplate()</span> (src/three/modelLoader.ts) -&gt;{' '}
                  <span className="text-[#FDE68A]">buildGlbPiece()</span> (src/three/warriorFactory.ts:1470) hoặc fallback{' '}
                  <span className="text-[#FDE68A]">buildPiece()</span> (src/three/warriorFactory.ts:1659)
                </div>
                <div>
                  • Gọi lần đầu: <span className="text-[#FDE68A]">syncBoardFromFen(fen)</span> (src/three/ChessArena3D.tsx:559-581), gọi lúc mount ở{' '}
                  <span className="text-[#FDE68A]">ChessArena3D.tsx:583</span> (đã gọi {debugReport.syncCallCount} lần; lần đầu: {debugReport.firstSyncAt || '-'}, cuối: {debugReport.lastSyncAt || '-'})
                </div>
                <div>
                  • Gọi lại sau khi tải xong: <span className="text-[#FDE68A]">onGlbUpdated()</span> -&gt;{' '}
                  <span className="text-[#FDE68A]">upgradeBoardPiecesWithGlb()</span> (src/three/ChessArena3D.tsx) thay thế tại chỗ từng quân trên bàn ngay khi file .glb tương ứng tải xong
                </div>
              </div>

              {/* e) Sự kiện tải xong 12/12 */}
              <div className="rounded bg-white/5 p-2 space-y-0.5">
                <div className="font-bold text-[#93C5FD]">e) Sự kiện &quot;tải xong&quot; hiện kích hoạt gì:</div>
                <div>
                  • <span className="text-[#FDE68A]">preloadGlbTemplates()</span> (src/three/modelLoader.ts) phát{' '}
                  <span className="text-[#FDE68A]">window.dispatchEvent(new CustomEvent(&apos;glb-models-updated&apos;))</span> cho từng model &amp; khi hoàn tất 12/12 -&gt; kích hoạt{' '}
                  <span className="text-[#FDE68A]">onGlbUpdated()</span> -&gt; <span className="text-[#FDE68A]">upgradeBoardPiecesWithGlb()</span> (hoặc hoãn vào{' '}
                  <span className="text-[#FDE68A]">pendingGlbUpgrade</span> nếu đang combat).
                </div>
                <div>
                  • Thực tế lúc chạy: dispatch={debugReport.cache.dispatchCount} lần (cuối: {debugReport.cache.lastDispatchAt || 'chưa phát'}, loaded={debugReport.cache.lastDispatchLoadedCount}/12) | onGlbUpdated chạy={debugReport.onGlbUpdatedCalls} lần (cập nhật={debugReport.onGlbUpdatedSynced}, hoãn vì busy={debugReport.onGlbUpdatedSkippedBusy}, cuối: {debugReport.lastOnGlbUpdatedAt || 'chưa kích hoạt'}).
                </div>
              </div>

              {/* c) Danh sách 32 quân trên bàn */}
              <div className="rounded bg-white/5 p-2">
                <div className="font-bold text-[#93C5FD] mb-1">
                  c) Danh sách quân đang có trên bàn ({debugReport.boardPieces.length} quân):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                  {debugReport.boardPieces.map((bp) => (
                    <div
                      key={bp.square}
                      className={`px-1.5 py-0.5 rounded border ${
                        bp.isGlb ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-red-500/40 bg-red-950/30'
                      }`}
                    >
                      <span className="font-bold text-white uppercase">{bp.square}</span>{' '}
                      <span className="text-[#CBD5E1]">
                        ({bp.color === 'w' ? (SETUP_V2 ? t(lang, 'sideWhite') : 'Sáng') : (SETUP_V2 ? t(lang, 'sideBlack') : 'Tối')} / {bp.type})
                      </span>{' '}
                      —{' '}
                      <span className={bp.isGlb ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>
                        {bp.modelLabel}
                      </span>
                      {bp.reason ? <div className="text-red-200/90">Lý do: {bp.reason}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
