import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Language, PieceColor, PieceSymbol } from '../types/chess';

// ============================================================================
// 1-LINE TOGGLE: Đặt `false` để quay lại ngay bộ quân 3D cũ (fallback)
// ============================================================================
export const USE_GLB_PIECES = true;

// 1-LINE TOGGLE: Đặt `false` để tắt cơ chế lưu/nạp từ bộ nhớ bền IndexedDB
export const BUNDLED_MODELS = true;

export const GLB_MANIFEST_VERSION = '2026-11-23-v1';

// Đặt URL gốc GitHub/CDN chứa 12 file .glb nếu không nằm trong src/3d-glb/
export const DEFAULT_GLB_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GLB_BASE_URL) ||
  'https://raw.githubusercontent.com/SuperHero1102/3D-CHESS-BATTLE/main/src/3d-glb/';

const STORAGE_KEY_GLB_BASE_URL = 'chess_battle_glb_base_url_v1';
const STORAGE_KEY_GLB_MANIFEST = 'chess_battle_glb_manifest_v1';
const IDB_DB_NAME = 'chess_battle_glb_cache_v1';
const IDB_STORE_NAME = 'models';

export type GlbSideKey = 'light' | 'dark';
export type GlbPieceKey =
  | 'light_pawn'
  | 'light_rook'
  | 'light_knight'
  | 'light_bishop'
  | 'light_queen'
  | 'light_king'
  | 'dark_pawn'
  | 'dark_rook'
  | 'dark_knight'
  | 'dark_bishop'
  | 'dark_queen'
  | 'dark_king';

export interface GlbPieceConfig {
  key: GlbPieceKey;
  color: PieceColor;
  sideKey: GlbSideKey;
  type: PieceSymbol;
  filename: string;
  targetHeight: number;
  maxFootprint: number;
  rotationY: number;
  scale: number;
  offsetY: number;
  hideBase: boolean;
}

export interface GlbModelSpec {
  url: string;
  filename: string;
  scale: number;
  nameVi: string;
  nameEn: string;
  descVi: string;
  descEn: string;
}

export const PIECE_TYPE_META: Record<
  PieceSymbol,
  { nameVi: string; nameEn: string; descVi: string; descEn: string; targetHeight: number }
> = {
  p: {
    nameVi: 'Tốt – Lê Dương',
    nameEn: 'Pawn – Legionary',
    descVi: 'Tiến 1 ô, ăn chéo',
    descEn: 'Advance 1 square, capture diagonally',
    targetHeight: 1.0,
  },
  r: {
    nameVi: 'Xe – Trọng Giáp',
    nameEn: 'Rook – Siege Guard',
    descVi: 'Đi thẳng ngang/dọc không giới hạn',
    descEn: 'Slide horizontally or vertically',
    targetHeight: 1.1,
  },
  n: {
    nameVi: 'Mã – Kỵ Binh',
    nameEn: 'Knight – Cavalry',
    descVi: 'Nhảy hình chữ L, vượt chướng ngại',
    descEn: 'Leap in L-shape over pieces',
    targetHeight: 1.25,
  },
  b: {
    nameVi: 'Tượng – Tư Tế',
    nameEn: 'Bishop – Augur Priest',
    descVi: 'Đi đường chéo không giới hạn',
    descEn: 'Slide along open diagonals',
    targetHeight: 1.4,
  },
  q: {
    nameVi: 'Hậu – Nữ Thần Chiến Tranh',
    nameEn: 'Queen – War Goddess Bellona',
    descVi: 'Tấn công mọi hướng ngang, dọc, chéo',
    descEn: 'Command any rank, file, or diagonal',
    targetHeight: 1.55,
  },
  k: {
    nameVi: 'Vua – Hoàng Đế',
    nameEn: 'King – Emperor',
    descVi: 'Di chuyển 1 ô mọi hướng — Cần bảo vệ',
    descEn: 'Move 1 square any direction — protect him',
    targetHeight: 1.7,
  },
};

export const MODEL_CONFIG: Record<PieceSymbol, GlbModelSpec> = {
  p: { url: '/models/light_pawn.glb', filename: 'light_pawn.glb', scale: 1.0, ...PIECE_TYPE_META.p },
  r: { url: '/models/light_rook.glb', filename: 'light_rook.glb', scale: 1.0, ...PIECE_TYPE_META.r },
  n: { url: '/models/light_knight.glb', filename: 'light_knight.glb', scale: 1.0, ...PIECE_TYPE_META.n },
  b: { url: '/models/light_bishop.glb', filename: 'light_bishop.glb', scale: 1.0, ...PIECE_TYPE_META.b },
  q: { url: '/models/light_queen.glb', filename: 'light_queen.glb', scale: 1.0, ...PIECE_TYPE_META.q },
  k: { url: '/models/light_king.glb', filename: 'light_king.glb', scale: 1.0, ...PIECE_TYPE_META.k },
};

// ============================================================================
// BẢNG CẤU HÌNH 12 QUÂN .GLB (Dễ chỉnh từng quân: rotationY, scale, offsetY, hideBase)
// Chiều cao chuẩn: Tốt 1.0 < Xe 1.1 < Mã 1.25 < Tượng 1.4 < Hậu 1.55 < Vua 1.7 (ô cờ)
// ============================================================================
export const PIECE_CONFIG: Record<GlbPieceKey, GlbPieceConfig> = {
  light_pawn: {
    key: 'light_pawn',
    color: 'w',
    sideKey: 'light',
    type: 'p',
    filename: 'light_pawn.glb',
    targetHeight: 1.0,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: 0,
    hideBase: true,
  },
  light_rook: {
    key: 'light_rook',
    color: 'w',
    sideKey: 'light',
    type: 'r',
    filename: 'light_rook.glb',
    targetHeight: 1.1,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  light_knight: {
    key: 'light_knight',
    color: 'w',
    sideKey: 'light',
    type: 'n',
    filename: 'light_knight.glb',
    targetHeight: 1.25,
    maxFootprint: 1.15,
    rotationY: 0,
    scale: 1.0,
    offsetY: 0,
    hideBase: true,
  },
  light_bishop: {
    key: 'light_bishop',
    color: 'w',
    sideKey: 'light',
    type: 'b',
    filename: 'light_bishop.glb',
    targetHeight: 1.4,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: 0,
    hideBase: true,
  },
  light_queen: {
    key: 'light_queen',
    color: 'w',
    sideKey: 'light',
    type: 'q',
    filename: 'light_queen.glb',
    targetHeight: 1.55,
    maxFootprint: 0.92,
    rotationY: 0,
    scale: 1.0,
    offsetY: 0,
    hideBase: true,
  },
  light_king: {
    key: 'light_king',
    color: 'w',
    sideKey: 'light',
    type: 'k',
    filename: 'light_king.glb',
    targetHeight: 1.7,
    maxFootprint: 0.92,
    rotationY: Math.PI / 2,
    scale: 1.0,
    offsetY: 0,
    hideBase: true,
  },
  dark_pawn: {
    key: 'dark_pawn',
    color: 'b',
    sideKey: 'dark',
    type: 'p',
    filename: 'dark_pawn.glb',
    targetHeight: 1.0,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  dark_rook: {
    key: 'dark_rook',
    color: 'b',
    sideKey: 'dark',
    type: 'r',
    filename: 'dark_rook.glb',
    targetHeight: 1.1,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  dark_knight: {
    key: 'dark_knight',
    color: 'b',
    sideKey: 'dark',
    type: 'n',
    filename: 'dark_knight.glb',
    targetHeight: 1.25,
    maxFootprint: 1.15,
    rotationY: 0,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  dark_bishop: {
    key: 'dark_bishop',
    color: 'b',
    sideKey: 'dark',
    type: 'b',
    filename: 'dark_bishop.glb',
    targetHeight: 1.4,
    maxFootprint: 0.84,
    rotationY: 0,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  dark_queen: {
    key: 'dark_queen',
    color: 'b',
    sideKey: 'dark',
    type: 'q',
    filename: 'dark_queen.glb',
    targetHeight: 1.55,
    maxFootprint: 0.92,
    rotationY: Math.PI / 2,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
  dark_king: {
    key: 'dark_king',
    color: 'b',
    sideKey: 'dark',
    type: 'k',
    filename: 'dark_king.glb',
    targetHeight: 1.7,
    maxFootprint: 0.92,
    rotationY: Math.PI / 2,
    scale: 1.0,
    offsetY: -0.05,
    hideBase: true,
  },
};

export const ALL_GLB_KEYS = Object.keys(PIECE_CONFIG) as GlbPieceKey[];

const TYPE_TO_KEY_SUFFIX: Record<PieceSymbol, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

export function toGlbPieceKey(color: PieceColor, type: PieceSymbol): GlbPieceKey {
  const side: GlbSideKey = color === 'w' ? 'light' : 'dark';
  return `${side}_${TYPE_TO_KEY_SUFFIX[type]}` as GlbPieceKey;
}

// Vite bundler glob (tự nhận tất cả file .glb nếu được đặt trong src/3d-glb/)
const bundledGlbModules = import.meta.glob('../3d-glb/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const bundledGlbByFilename: Record<string, string> = {};
for (const [modPath, assetUrl] of Object.entries(bundledGlbModules)) {
  const base = modPath.split('/').pop()?.toLowerCase();
  if (base) bundledGlbByFilename[base] = assetUrl;
}

export function normalizeGlbBaseUrl(rawInput: string): string {
  let trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Chuyển link web GitHub sang raw.githubusercontent.com
  const ghTreeMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/i);
  if (ghTreeMatch) {
    const [, owner, repo, branch, subpath] = ghTreeMatch;
    trimmed = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subpath}`;
  } else {
    const ghRepoMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (ghRepoMatch) {
      const [, owner, repo] = ghRepoMatch;
      trimmed = `https://raw.githubusercontent.com/${owner}/${repo}/main/src/3d-glb/`;
    }
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function getGlbBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get('glbBase');
    if (paramUrl && paramUrl.trim()) {
      const normalized = normalizeGlbBaseUrl(paramUrl);
      try {
        window.localStorage.setItem(STORAGE_KEY_GLB_BASE_URL, normalized);
      } catch {
        // Ignore storage errors in restricted iframes
      }
      return normalized;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_GLB_BASE_URL);
      if (saved && saved.trim()) {
        return normalizeGlbBaseUrl(saved);
      }
    } catch {
      // Ignore storage errors
    }
  }
  return normalizeGlbBaseUrl(DEFAULT_GLB_BASE_URL);
}

export function setGlbBaseUrl(url: string): string {
  const normalized = normalizeGlbBaseUrl(url);
  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        window.localStorage.setItem(STORAGE_KEY_GLB_BASE_URL, normalized);
      } else {
        window.localStorage.removeItem(STORAGE_KEY_GLB_BASE_URL);
      }
    } catch {
      // Ignore storage errors
    }
  }
  return normalized;
}

export interface CachedGlbTemplate {
  key: GlbPieceKey;
  filename: string;
  gltf: GLTF;
  rawSize: THREE.Vector3;
  rawCenter: THREE.Vector3;
  rawMinY: number;
  triangleCount: number;
  meshCount: number;
  hasTextures: boolean;
  hasBuiltInBase: boolean;
  hiddenBaseMeshNames: string[];
  source: 'bundled' | 'url' | 'disk' | 'upload';
  byteSize: number;
}

export interface GlbSlotState {
  key: GlbPieceKey;
  filename: string;
  status: 'pending' | 'loading' | 'loaded' | 'missing' | 'error' | 'disabled';
  triangles: number;
  meshCount: number;
  hasTextures: boolean;
  hasBuiltInBase: boolean;
  rawSize: [number, number, number];
  normalizedSize: [number, number, number];
  source?: 'bundled' | 'url' | 'disk' | 'upload';
  error?: string;
}

export interface GlbLoadProgressSnapshot {
  enabled: boolean;
  bundledModels: boolean;
  loading: boolean;
  isFirstLoadBlocking: boolean;
  showLoadingBanner: boolean;
  cacheHitCount: number;
  percent: number;
  loadedCount: number;
  totalCount: number;
  loadedMB: number;
  totalMB: number;
  missingFiles: { key: GlbPieceKey; filename: string; reason: string }[];
  slotStates: Record<GlbPieceKey, GlbSlotState>;
}

const loadedTemplates: Partial<Record<GlbPieceKey, CachedGlbTemplate | null>> = {};
const slotStates: Record<GlbPieceKey, GlbSlotState> = {} as Record<GlbPieceKey, GlbSlotState>;
const slotBytesProgress: Record<GlbPieceKey, { loaded: number; total: number; done: boolean }> = {} as Record<
  GlbPieceKey,
  { loaded: number; total: number; done: boolean }
>;

const ESTIMATED_FILE_BYTES = 13 * 1024 * 1024;

function getCurrentManifestSignature(baseUrl: string): string {
  return `${GLB_MANIFEST_VERSION}|${baseUrl}`;
}

function hasWarmManifestHint(): boolean {
  if (!BUNDLED_MODELS || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_GLB_MANIFEST) === getCurrentManifestSignature(getGlbBaseUrl());
  } catch {
    return false;
  }
}

function setWarmManifestHint(baseUrl: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (baseUrl && BUNDLED_MODELS) {
      window.localStorage.setItem(STORAGE_KEY_GLB_MANIFEST, getCurrentManifestSignature(baseUrl));
    } else {
      window.localStorage.removeItem(STORAGE_KEY_GLB_MANIFEST);
    }
  } catch {
    // Ignore storage errors
  }
}

interface StoredIdbGlbRecord {
  cacheKey: string;
  key: GlbPieceKey;
  baseUrl: string;
  version: string;
  byteSize: number;
  buffer: ArrayBuffer;
  savedAt: number;
}

let idbPromise: Promise<IDBDatabase | null> | null = null;
function openGlbIdb(): Promise<IDBDatabase | null> {
  if (!BUNDLED_MODELS) {
    return Promise.resolve(null);
  }
  try {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
  } catch {
    return Promise.resolve(null);
  }
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME, { keyPath: 'cacheKey' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return idbPromise;
}

function makeIdbCacheKey(key: GlbPieceKey, baseUrl: string): string {
  return `${key}::${GLB_MANIFEST_VERSION}::${baseUrl}`;
}

async function readGlbFromIdb(key: GlbPieceKey, baseUrl: string): Promise<StoredIdbGlbRecord | null> {
  const db = await openGlbIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(makeIdbCacheKey(key, baseUrl));
      req.onsuccess = () => resolve((req.result as StoredIdbGlbRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeGlbToIdb(key: GlbPieceKey, baseUrl: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openGlbIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      const record: StoredIdbGlbRecord = {
        cacheKey: makeIdbCacheKey(key, baseUrl),
        key,
        baseUrl,
        version: GLB_MANIFEST_VERSION,
        byteSize: buffer.byteLength,
        buffer: buffer.slice(0),
        savedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function resetInitialSlotStates() {
  for (const key of ALL_GLB_KEYS) {
    const cfg = PIECE_CONFIG[key];
    if (!slotStates[key]) {
      slotStates[key] = {
        key,
        filename: cfg.filename,
        status: USE_GLB_PIECES ? 'pending' : 'disabled',
        triangles: 0,
        meshCount: 0,
        hasTextures: false,
        hasBuiltInBase: false,
        rawSize: [0, 0, 0],
        normalizedSize: [0, 0, 0],
      };
    }
    if (!slotBytesProgress[key]) {
      slotBytesProgress[key] = { loaded: 0, total: ESTIMATED_FILE_BYTES, done: false };
    }
  }
}
resetInitialSlotStates();

let isPreloading = false;
let hasFinishedInitialPreload = false;
let isNetworkDownloading = false;
let preloadPromise: Promise<number> | null = null;
const progressListeners = new Set<(snapshot: GlbLoadProgressSnapshot) => void>();

// Read-only runtime diagnostics for ?debug=1 panel
const debugStoreKeyByKey: Partial<Record<GlbPieceKey, string>> = {};
const debugLookupKeyByKey: Partial<Record<GlbPieceKey, string>> = {};
let debugUpdateEventCount = 0;
let debugLastUpdateEventAt: string | null = null;
let debugLastUpdateEventCount = 0;

export function computeNormalizedBoxSize(
  rawSize: THREE.Vector3,
  cfg: GlbPieceConfig
): THREE.Vector3 {
  const safeY = Math.max(rawSize.y, 0.001);
  const safeX = Math.max(rawSize.x, 0.001);
  const safeZ = Math.max(rawSize.z, 0.001);
  const heightScale = cfg.targetHeight / safeY;
  const maxHoriz = Math.max(safeX, safeZ);
  const footprintScale = cfg.maxFootprint / maxHoriz;
  const finalScale = Math.min(heightScale, footprintScale) * cfg.scale;
  return new THREE.Vector3(rawSize.x * finalScale, rawSize.y * finalScale, rawSize.z * finalScale);
}

export function getGlbLoadProgressSnapshot(): GlbLoadProgressSnapshot {
  let totalLoadedBytes = 0;
  let totalEstimatedBytes = 0;
  let loadedCount = 0;
  let cacheHitCount = 0;
  const missingFiles: { key: GlbPieceKey; filename: string; reason: string }[] = [];

  for (const key of ALL_GLB_KEYS) {
    const prog = slotBytesProgress[key];
    const st = slotStates[key];
    totalLoadedBytes += prog.done ? Math.max(prog.loaded, prog.total) : prog.loaded;
    totalEstimatedBytes += Math.max(prog.total, ESTIMATED_FILE_BYTES);
    if (st.status === 'loaded') {
      loadedCount++;
      if (st.source === 'bundled') cacheHitCount++;
    } else if (st.status === 'missing' || st.status === 'error') {
      missingFiles.push({
        key,
        filename: st.filename,
        reason: st.error || `Thiếu mô hình: ${st.filename}`,
      });
    }
  }

  const rawPct = totalEstimatedBytes > 0 ? Math.round((totalLoadedBytes / totalEstimatedBytes) * 100) : 0;
  const percent = isPreloading ? Math.min(99, Math.max(0, rawPct)) : 100;
  const warmHint = hasWarmManifestHint();
  const isFirstLoadBlocking =
    USE_GLB_PIECES &&
    !hasFinishedInitialPreload &&
    !warmHint &&
    loadedCount < ALL_GLB_KEYS.length;
  const showLoadingBanner =
    USE_GLB_PIECES && isPreloading && isNetworkDownloading && !warmHint;

  return {
    enabled: USE_GLB_PIECES,
    bundledModels: BUNDLED_MODELS,
    loading: isPreloading,
    isFirstLoadBlocking,
    showLoadingBanner,
    cacheHitCount,
    percent,
    loadedCount,
    totalCount: ALL_GLB_KEYS.length,
    loadedMB: +(totalLoadedBytes / (1024 * 1024)).toFixed(1),
    totalMB: +(totalEstimatedBytes / (1024 * 1024)).toFixed(1),
    missingFiles,
    slotStates: { ...slotStates },
  };
}

export function subscribeGlbProgress(listener: (snapshot: GlbLoadProgressSnapshot) => void): () => void {
  progressListeners.add(listener);
  listener(getGlbLoadProgressSnapshot());
  return () => {
    progressListeners.delete(listener);
  };
}

let lastProgressEmitAt = 0;
function emitProgress(force = false) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && now - lastProgressEmitAt < 80) return;
  lastProgressEmitAt = now;
  const snap = getGlbLoadProgressSnapshot();
  for (const cb of progressListeners) {
    cb(snap);
  }
}

let sharedLoaderPromise: Promise<GLTFLoader> | null = null;
async function getSharedLoader(): Promise<GLTFLoader> {
  if (!sharedLoaderPromise) {
    sharedLoaderPromise = (async () => {
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/draco/gltf/');
      loader.setDRACOLoader(dracoLoader);
      try {
        await MeshoptDecoder.ready;
        loader.setMeshoptDecoder(MeshoptDecoder);
      } catch (err) {
        console.warn('[GLB] MeshoptDecoder init warning:', err);
      }
      return loader;
    })();
  }
  return sharedLoaderPromise;
}

function configureMaterialTextures(mat: THREE.Material): boolean {
  let hasTex = false;
  mat.userData.isSharedGlbBaseMat = true;
  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
    mat.envMapIntensity = 0.6;
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.needsUpdate = true;
      hasTex = true;
    }
    if (mat.emissiveMap) {
      mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      mat.emissiveMap.needsUpdate = true;
      hasTex = true;
    }
    if (mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.aoMap) {
      hasTex = true;
    }
    mat.needsUpdate = true;
  }
  return hasTex;
}

const BASE_NAME_REGEX = /(^|[_\-. ])(base|pedestal|plinth|stand|socle|podium|disc|disk|plate)([_\-. 0-9]|$)/i;

function hasBaseAncestorName(obj: THREE.Object3D): boolean {
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (curr.name && BASE_NAME_REGEX.test(curr.name)) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function inspectAndPrepareGltf(
  key: GlbPieceKey,
  gltf: GLTF,
  source: 'bundled' | 'url' | 'disk' | 'upload',
  byteSize: number
): CachedGlbTemplate {
  const cfg = PIECE_CONFIG[key];
  gltf.scene.updateMatrixWorld(true);

  const fullBox = new THREE.Box3().setFromObject(gltf.scene);
  const fullSize = new THREE.Vector3();
  const fullCenter = new THREE.Vector3();
  fullBox.getSize(fullSize);
  fullBox.getCenter(fullCenter);

  let triangleCount = 0;
  let meshCount = 0;
  let hasTextures = false;
  const candidateBaseMeshes: THREE.Mesh[] = [];
  const allMeshes: THREE.Mesh[] = [];

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    allMeshes.push(obj);
    meshCount += 1;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const geo = obj.geometry as THREE.BufferGeometry | undefined;
    if (geo) {
      if (geo.index) {
        triangleCount += Math.round(geo.index.count / 3);
      } else if (geo.attributes.position) {
        triangleCount += Math.round(geo.attributes.position.count / 3);
      }
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m && configureMaterialTextures(m)) {
        hasTextures = true;
      }
    }

    // Kiểm tra mesh đế tròn tích hợp trong file .glb
    const mBox = new THREE.Box3().setFromObject(obj);
    const mSize = new THREE.Vector3();
    const mCenter = new THREE.Vector3();
    mBox.getSize(mSize);
    mBox.getCenter(mCenter);

    const namedBase = hasBaseAncestorName(obj);
    const aspect = mSize.z > 0.0001 ? mSize.x / mSize.z : 1;
    const isBottomDisc =
      fullSize.y > 0.001 &&
      mBox.min.y <= fullBox.min.y + fullSize.y * 0.08 &&
      mSize.y <= fullSize.y * 0.14 &&
      mSize.x >= fullSize.x * 0.62 &&
      mSize.z >= fullSize.z * 0.62 &&
      aspect >= 0.8 &&
      aspect <= 1.25 &&
      Math.hypot(mCenter.x - fullCenter.x, mCenter.z - fullCenter.z) <= Math.max(fullSize.x, fullSize.z) * 0.2;

    if (namedBase || isBottomDisc) {
      candidateBaseMeshes.push(obj);
    }
  });

  // Tránh ẩn nhầm nếu toàn bộ model bị gộp thành duy nhất 1 mesh (khi đó dùng offsetY trong PIECE_CONFIG)
  const separableBaseMeshes =
    candidateBaseMeshes.length > 0 && candidateBaseMeshes.length < allMeshes.length
      ? candidateBaseMeshes
      : [];

  const hiddenBaseMeshNames: string[] = [];
  if (cfg.hideBase && separableBaseMeshes.length > 0) {
    for (const m of separableBaseMeshes) {
      m.visible = false;
      m.userData.isHiddenGlbBase = true;
      hiddenBaseMeshNames.push(m.name || 'unnamed_base_mesh');
    }
  }

  gltf.scene.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3();
  gltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible) {
      bodyBox.expandByObject(obj);
    }
  });
  if (bodyBox.isEmpty()) {
    bodyBox.copy(fullBox);
  }

  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  bodyBox.getSize(rawSize);
  bodyBox.getCenter(rawCenter);

  return {
    key,
    filename: cfg.filename,
    gltf,
    rawSize,
    rawCenter,
    rawMinY: Number.isFinite(bodyBox.min.y) ? bodyBox.min.y : 0,
    triangleCount,
    meshCount,
    hasTextures,
    hasBuiltInBase: candidateBaseMeshes.length > 0,
    hiddenBaseMeshNames,
    source,
    byteSize,
  };
}

function toGitHubMediaLfsUrl(rawUrl: string): string | null {
  const m = rawUrl.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (!m) return null;
  const [, owner, repo, branch, filepath] = m;
  return `https://media.githubusercontent.com/media/${owner}/${repo}/${branch}/${filepath}`;
}

function resolveCandidateUrls(cfg: GlbPieceConfig): { url: string; source: 'bundled' | 'url' | 'disk' }[] {
  const candidates: { url: string; source: 'bundled' | 'url' | 'disk' }[] = [];
  const bundled = bundledGlbByFilename[cfg.filename.toLowerCase()];
  if (bundled) {
    candidates.push({ url: bundled, source: 'bundled' });
  }
  const baseUrl = getGlbBaseUrl();
  if (baseUrl) {
    const rawCandidate = `${baseUrl}${cfg.filename}`;
    candidates.push({ url: rawCandidate, source: 'url' });
    const lfsCandidate = toGitHubMediaLfsUrl(rawCandidate);
    if (lfsCandidate) {
      candidates.push({ url: lfsCandidate, source: 'url' });
    }
  }
  candidates.push({ url: `/models/${cfg.filename}`, source: 'disk' });
  return candidates;
}

function verifyGlbBuffer(buffer: ArrayBuffer, filename: string): string | null {
  if (buffer.byteLength < 12) {
    return `File rỗng hoặc quá nhỏ (${buffer.byteLength} bytes)`;
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  // 0x46546C67 = "glTF" little-endian
  if (magic === 0x46546c67) {
    return null;
  }
  const headText = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(256, buffer.byteLength)));
  if (headText.includes('https://git-lfs.github.com/spec/v1')) {
    return `File ${filename} chỉ là con trỏ Git LFS (${buffer.byteLength} bytes), chưa có nội dung 3D thật`;
  }
  if (headText.trimStart().startsWith('{')) {
    return null; // JSON .gltf
  }
  return `File ${filename} không đúng định dạng nhị phân GLB/glTF`;
}

async function fetchWithProgress(
  url: string,
  key: GlbPieceKey,
  filename: string
): Promise<{ buffer: ArrayBuffer }> {
  const res = await fetch(url, { cache: 'default' });
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok || ctype.includes('text/html')) {
    throw new Error(`HTTP ${res.status} — Không tìm thấy ${filename}`);
  }

  const contentLength = Number(res.headers.get('content-length') || '0');
  if (contentLength > 0) {
    slotBytesProgress[key].total = contentLength;
  }

  if (!res.body) {
    const buf = await res.arrayBuffer();
    slotBytesProgress[key].loaded = buf.byteLength;
    slotBytesProgress[key].total = Math.max(slotBytesProgress[key].total, buf.byteLength);
    emitProgress();
    return { buffer: buf };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      slotBytesProgress[key].loaded = received;
      if (received > slotBytesProgress[key].total) {
        slotBytesProgress[key].total = received;
      }
      emitProgress();
    }
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { buffer: combined.buffer };
}

export async function preloadGlbTemplates(force = false): Promise<number> {
  if (!USE_GLB_PIECES) {
    isPreloading = false;
    hasFinishedInitialPreload = true;
    isNetworkDownloading = false;
    for (const key of ALL_GLB_KEYS) {
      slotStates[key].status = 'disabled';
      slotBytesProgress[key].done = true;
    }
    emitProgress(true);
    return 0;
  }

  if (preloadPromise && !force) return preloadPromise;

  const baseUrl = getGlbBaseUrl();
  if (force) {
    setWarmManifestHint(null);
  }
  isPreloading = true;
  isNetworkDownloading = false;

  for (const key of ALL_GLB_KEYS) {
    if (loadedTemplates[key]?.source === 'upload' && !force) continue;
    slotStates[key] = {
      key,
      filename: PIECE_CONFIG[key].filename,
      status: 'loading',
      triangles: 0,
      meshCount: 0,
      hasTextures: false,
      hasBuiltInBase: false,
      rawSize: [0, 0, 0],
      normalizedSize: [0, 0, 0],
    };
    slotBytesProgress[key] = { loaded: 0, total: ESTIMATED_FILE_BYTES, done: false };
  }
  emitProgress(true);

  preloadPromise = (async () => {
    const loader = await getSharedLoader();
    let loadedCount = 0;

    const processSlot = async (key: GlbPieceKey) => {
      const cfg = PIECE_CONFIG[key];
      if (loadedTemplates[key]?.source === 'upload' && !force) {
        slotBytesProgress[key].done = true;
        loadedCount++;
        return;
      }

      // Launch 2+ Cache-First Hydration from persistent IndexedDB (0 network calls)
      if (BUNDLED_MODELS && !force) {
        const cachedRec = await readGlbFromIdb(key, baseUrl);
        if (cachedRec && cachedRec.buffer) {
          const checkErr = verifyGlbBuffer(cachedRec.buffer, cfg.filename);
          if (!checkErr) {
            try {
              const gltf = await loader.parseAsync(cachedRec.buffer, '');
              const tpl = inspectAndPrepareGltf(key, gltf, 'bundled', cachedRec.byteSize);
              loadedTemplates[key] = tpl;
              debugStoreKeyByKey[key] = key;

              const normSize = computeNormalizedBoxSize(tpl.rawSize, cfg);
              slotStates[key] = {
                key,
                filename: cfg.filename,
                status: 'loaded',
                triangles: tpl.triangleCount,
                meshCount: tpl.meshCount,
                hasTextures: tpl.hasTextures,
                hasBuiltInBase: tpl.hasBuiltInBase,
                rawSize: [+tpl.rawSize.x.toFixed(3), +tpl.rawSize.y.toFixed(3), +tpl.rawSize.z.toFixed(3)],
                normalizedSize: [+normSize.x.toFixed(3), +normSize.y.toFixed(3), +normSize.z.toFixed(3)],
                source: 'bundled',
              };
              slotBytesProgress[key] = { loaded: cachedRec.byteSize, total: cachedRec.byteSize, done: true };
              loadedCount++;
              emitProgress();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { key, count: loadedCount } }));
              }
              return;
            } catch {
              // Corrupt cache entry -> fall through to network fetch
            }
          }
        }
      }

      if (!isNetworkDownloading) {
        isNetworkDownloading = true;
        emitProgress(true);
      }

      const candidates = resolveCandidateUrls(cfg);
      let lastErr = `Thiếu mô hình: ${cfg.filename}`;

      for (const cand of candidates) {
        try {
          const { buffer } = await fetchWithProgress(cand.url, key, cfg.filename);
          const validationErr = verifyGlbBuffer(buffer, cfg.filename);
          if (validationErr) {
            lastErr = validationErr;
            continue;
          }
          const resourceDir = cand.url.substring(0, cand.url.lastIndexOf('/') + 1);
          const gltf = await loader.parseAsync(buffer.slice(0), resourceDir);
          const storedSource = BUNDLED_MODELS ? 'bundled' : cand.source;
          const tpl = inspectAndPrepareGltf(key, gltf, storedSource, buffer.byteLength);
          loadedTemplates[key] = tpl;
          debugStoreKeyByKey[key] = key;

          if (BUNDLED_MODELS) {
            await writeGlbToIdb(key, baseUrl, buffer);
          }

          const normSize = computeNormalizedBoxSize(tpl.rawSize, cfg);
          slotStates[key] = {
            key,
            filename: cfg.filename,
            status: 'loaded',
            triangles: tpl.triangleCount,
            meshCount: tpl.meshCount,
            hasTextures: tpl.hasTextures,
            hasBuiltInBase: tpl.hasBuiltInBase,
            rawSize: [+tpl.rawSize.x.toFixed(3), +tpl.rawSize.y.toFixed(3), +tpl.rawSize.z.toFixed(3)],
            normalizedSize: [+normSize.x.toFixed(3), +normSize.y.toFixed(3), +normSize.z.toFixed(3)],
            source: storedSource,
          };
          slotBytesProgress[key].done = true;
          loadedCount++;
          emitProgress();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { key, count: loadedCount } }));
          }
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : `Lỗi nạp ${cfg.filename}`;
        }
      }

      loadedTemplates[key] = null;
      slotBytesProgress[key].done = true;
      slotBytesProgress[key].loaded = slotBytesProgress[key].total;
      slotStates[key] = {
        key,
        filename: cfg.filename,
        status: 'missing',
        triangles: 0,
        meshCount: 0,
        hasTextures: false,
        hasBuiltInBase: false,
        rawSize: [0, 0, 0],
        normalizedSize: [0, 0, 0],
        error: lastErr,
      };
      console.warn(`[GLB] Thiếu mô hình: ${cfg.filename} (${lastErr})`);
      emitProgress();
    };

    // 3-worker queue keeps network & WASM parsing responsive without saturating the thread
    const queue = [...ALL_GLB_KEYS];
    const workerCount = Math.min(3, queue.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const nextKey = queue.shift();
          if (nextKey) {
            await processSlot(nextKey);
          }
        }
      })
    );

    isPreloading = false;
    isNetworkDownloading = false;
    hasFinishedInitialPreload = true;
    if (loadedCount === ALL_GLB_KEYS.length && BUNDLED_MODELS) {
      setWarmManifestHint(baseUrl);
    } else {
      setWarmManifestHint(null);
      if (loadedCount === 0) {
        preloadPromise = null;
      }
    }
    emitProgress(true);

    if (typeof window !== 'undefined') {
      debugUpdateEventCount += 1;
      debugLastUpdateEventAt = new Date().toLocaleTimeString();
      debugLastUpdateEventCount = loadedCount;
      window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { count: loadedCount } }));
    }
    return loadedCount;
  })();

  return preloadPromise;
}

export async function registerCustomGlbFile(
  target: GlbPieceKey | PieceSymbol,
  file: File
): Promise<boolean> {
  const keysToRegister: GlbPieceKey[] =
    target.length === 1
      ? [toGlbPieceKey('w', target as PieceSymbol), toGlbPieceKey('b', target as PieceSymbol)]
      : [target as GlbPieceKey];

  try {
    const loader = await getSharedLoader();
    const buffer = await file.arrayBuffer();
    const validationErr = verifyGlbBuffer(buffer, file.name);
    if (validationErr) {
      throw new Error(validationErr);
    }

    for (const key of keysToRegister) {
      const cfg = PIECE_CONFIG[key];
      const gltf = await loader.parseAsync(buffer.slice(0), '');
      const tpl = inspectAndPrepareGltf(key, gltf, 'upload', buffer.byteLength);
      loadedTemplates[key] = tpl;
      const normSize = computeNormalizedBoxSize(tpl.rawSize, cfg);
      slotStates[key] = {
        key,
        filename: cfg.filename,
        status: 'loaded',
        triangles: tpl.triangleCount,
        meshCount: tpl.meshCount,
        hasTextures: tpl.hasTextures,
        hasBuiltInBase: tpl.hasBuiltInBase,
        rawSize: [+tpl.rawSize.x.toFixed(3), +tpl.rawSize.y.toFixed(3), +tpl.rawSize.z.toFixed(3)],
        normalizedSize: [+normSize.x.toFixed(3), +normSize.y.toFixed(3), +normSize.z.toFixed(3)],
        source: 'upload',
      };
      slotBytesProgress[key] = { loaded: buffer.byteLength, total: buffer.byteLength, done: true };
    }

    emitProgress(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { target, count: getLoadedGlbCount() } }));
    }
    return true;
  } catch (err) {
    console.error('[GLB] Upload parse error:', err);
    return false;
  }
}

export function clearCustomGlbModel(target: GlbPieceKey | PieceSymbol) {
  const keysToClear: GlbPieceKey[] =
    target.length === 1
      ? [toGlbPieceKey('w', target as PieceSymbol), toGlbPieceKey('b', target as PieceSymbol)]
      : [target as GlbPieceKey];

  let cleared = false;
  for (const key of keysToClear) {
    if (loadedTemplates[key]?.source === 'upload') {
      loadedTemplates[key] = null;
      cleared = true;
    }
  }
  if (cleared) {
    void preloadGlbTemplates(true);
  }
}

export function getLoadedGlbTemplate(color: PieceColor, type: PieceSymbol): CachedGlbTemplate | null {
  const key = toGlbPieceKey(color, type);
  debugLookupKeyByKey[key] = key;
  if (!USE_GLB_PIECES) return null;
  return loadedTemplates[key] ?? null;
}

export function getLoadedGlbTemplateByKey(key: GlbPieceKey): CachedGlbTemplate | null {
  if (!USE_GLB_PIECES) return null;
  return loadedTemplates[key] ?? null;
}

export function getLoadedGlbCount(): number {
  if (!USE_GLB_PIECES) return 0;
  return ALL_GLB_KEYS.filter((k) => Boolean(loadedTemplates[k])).length;
}

export function getGlbStatusMap(): Record<PieceSymbol, 'disk' | 'upload' | 'fallback'> {
  const mapSource = (type: PieceSymbol): 'disk' | 'upload' | 'fallback' => {
    const wTpl = loadedTemplates[toGlbPieceKey('w', type)];
    const bTpl = loadedTemplates[toGlbPieceKey('b', type)];
    if (wTpl?.source === 'upload' || bTpl?.source === 'upload') return 'upload';
    if (wTpl && bTpl) return 'disk';
    return 'fallback';
  };
  return {
    p: mapSource('p'),
    r: mapSource('r'),
    n: mapSource('n'),
    b: mapSource('b'),
    q: mapSource('q'),
    k: mapSource('k'),
  };
}

export function getAllGlbSlotStates(): Record<GlbPieceKey, GlbSlotState> {
  return { ...slotStates };
}

export function getPieceTooltipCopy(type: PieceSymbol, lang: Language): { name: string; desc: string } {
  const meta = PIECE_TYPE_META[type];
  return lang === 'en'
    ? { name: meta.nameEn, desc: meta.descEn }
    : { name: meta.nameVi, desc: meta.descVi };
}

export interface GlbDebugCacheEntry {
  key: GlbPieceKey;
  storeKey: string;
  lookupKey: string;
  keysMatch: boolean;
  hasInCache: boolean;
  parsed: boolean;
  status: GlbSlotState['status'];
  triangles: number;
  normalizedBox3: [number, number, number];
  source?: string;
  error?: string;
}

export interface GlbDebugCacheSnapshot {
  useGlbPieces: boolean;
  baseUrl: string;
  isPreloading: boolean;
  loadedCount: number;
  dispatchCount: number;
  lastDispatchAt: string | null;
  lastDispatchLoadedCount: number;
  entries: GlbDebugCacheEntry[];
}

export function getGlbDebugCacheSnapshot(): GlbDebugCacheSnapshot {
  let loadedCount = 0;
  const entries: GlbDebugCacheEntry[] = ALL_GLB_KEYS.map((key) => {
    const cfg = PIECE_CONFIG[key];
    const tpl = loadedTemplates[key] ?? null;
    const st = slotStates[key];
    const storeKey = debugStoreKeyByKey[key] ?? key;
    const lookupKey = debugLookupKeyByKey[key] ?? toGlbPieceKey(cfg.color, cfg.type);
    const hasInCache = Boolean(tpl);
    const parsed = Boolean(tpl && tpl.gltf && tpl.gltf.scene);
    if (hasInCache) loadedCount++;
    const normalizedBox3: [number, number, number] = tpl
      ? (() => {
          const n = computeNormalizedBoxSize(tpl.rawSize, cfg);
          return [+n.x.toFixed(3), +n.y.toFixed(3), +n.z.toFixed(3)];
        })()
      : st.normalizedSize;
    return {
      key,
      storeKey,
      lookupKey,
      keysMatch: storeKey === lookupKey,
      hasInCache,
      parsed,
      status: st.status,
      triangles: tpl ? tpl.triangleCount : st.triangles,
      normalizedBox3,
      source: tpl?.source ?? st.source,
      error: st.error,
    };
  });

  return {
    useGlbPieces: USE_GLB_PIECES,
    baseUrl: getGlbBaseUrl(),
    isPreloading,
    loadedCount,
    dispatchCount: debugUpdateEventCount,
    lastDispatchAt: debugLastUpdateEventAt,
    lastDispatchLoadedCount: debugLastUpdateEventCount,
    entries,
  };
}
