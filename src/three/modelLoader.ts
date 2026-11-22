import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Language, PieceSymbol } from '../types/chess';

export interface GlbModelSpec {
  url: string;
  filename: string;
  scale: number;
  nameVi: string;
  nameEn: string;
  descVi: string;
  descEn: string;
}

// ============================================================================
// CẤU HÌNH 6 MÔ HÌNH .GLB (Đặt file vào thư mục /models/ cạnh index.html)
// Chỉnh lại `scale` nếu mô hình tải về hơi to hoặc hơi nhỏ.
// ============================================================================
export const MODEL_CONFIG: Record<PieceSymbol, GlbModelSpec> = {
  p: {
    url: '/models/roman_legionary.glb',
    filename: 'roman_legionary.glb',
    scale: 0.75,
    nameVi: 'Tốt – Lê Dương',
    nameEn: 'Pawn – Legionary',
    descVi: 'Tiến 1 ô, ăn chéo',
    descEn: 'Advance 1 square, capture diagonally',
  },
  r: {
    url: '/models/roman_tower.glb',
    filename: 'roman_tower.glb',
    scale: 0.85,
    nameVi: 'Xe – Trọng Giáp',
    nameEn: 'Rook – Siege Guard',
    descVi: 'Đi thẳng ngang/dọc không giới hạn',
    descEn: 'Slide horizontally or vertically',
  },
  n: {
    url: '/models/roman_cavalry.glb',
    filename: 'roman_cavalry.glb',
    scale: 0.85,
    nameVi: 'Mã – Kỵ Binh',
    nameEn: 'Knight – Cavalry',
    descVi: 'Nhảy hình chữ L, vượt chướng ngại',
    descEn: 'Leap in L-shape over pieces',
  },
  b: {
    url: '/models/roman_priest.glb',
    filename: 'roman_priest.glb',
    scale: 0.85,
    nameVi: 'Tượng – Tư Tế',
    nameEn: 'Bishop – Augur Priest',
    descVi: 'Đi đường chéo không giới hạn',
    descEn: 'Slide along open diagonals',
  },
  q: {
    url: '/models/roman_queen.glb',
    filename: 'roman_queen.glb',
    scale: 0.92,
    nameVi: 'Hậu – Nữ Thần Chiến Tranh',
    nameEn: 'Queen – War Goddess Bellona',
    descVi: 'Tấn công mọi hướng ngang, dọc, chéo',
    descEn: 'Command any rank, file, or diagonal',
  },
  k: {
    url: '/models/roman_emperor.glb',
    filename: 'roman_emperor.glb',
    scale: 0.98,
    nameVi: 'Vua – Hoàng Đế',
    nameEn: 'King – Emperor',
    descVi: 'Di chuyển 1 ô mọi hướng — Cần bảo vệ',
    descEn: 'Move 1 square any direction — protect him',
  },
};

export interface CachedGlbTemplate {
  gltf: GLTF;
  rawSize: THREE.Vector3;
  rawCenter: THREE.Vector3;
  rawMinY: number;
  source: 'disk' | 'upload';
}

const loadedTemplates: Partial<Record<PieceSymbol, CachedGlbTemplate | null>> = {};
let preloadPromise: Promise<number> | null = null;

function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/gltf/');
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

const sharedLoader = createGltfLoader();

function measureGltf(gltf: GLTF, source: 'disk' | 'upload'): CachedGlbTemplate {
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  box.getSize(rawSize);
  box.getCenter(rawCenter);
  return {
    gltf,
    rawSize,
    rawCenter,
    rawMinY: Number.isFinite(box.min.y) ? box.min.y : 0,
    source,
  };
}

export async function preloadGlbTemplates(force = false): Promise<number> {
  if (preloadPromise && !force) return preloadPromise;

  preloadPromise = (async () => {
    let count = 0;
    const entries = Object.entries(MODEL_CONFIG) as [PieceSymbol, GlbModelSpec][];

    await Promise.all(
      entries.map(async ([type, cfg]) => {
        // Keep user-uploaded overrides unless explicitly cleared
        if (loadedTemplates[type]?.source === 'upload') {
          count++;
          return;
        }
        try {
          const res = await fetch(cfg.url, { cache: 'no-store' });
          const ctype = res.headers.get('content-type') || '';
          if (!res.ok || ctype.includes('text/html')) {
            loadedTemplates[type] = null;
            return;
          }
          const buffer = await res.arrayBuffer();
          // Verify GLB magic bytes ("glTF" = 0x46546C67) or valid JSON glTF
          if (buffer.byteLength < 12) {
            loadedTemplates[type] = null;
            return;
          }
          const gltf = await sharedLoader.parseAsync(buffer, '/models/');
          loadedTemplates[type] = measureGltf(gltf, 'disk');
          count++;
        } catch {
          loadedTemplates[type] = null;
        }
      })
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { count } }));
    }
    return count;
  })();

  return preloadPromise;
}

export async function registerCustomGlbFile(type: PieceSymbol, file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer();
    const gltf = await sharedLoader.parseAsync(buffer, '');
    loadedTemplates[type] = measureGltf(gltf, 'upload');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('glb-models-updated', { detail: { type, count: getLoadedGlbCount() } }));
    }
    return true;
  } catch {
    return false;
  }
}

export function clearCustomGlbModel(type: PieceSymbol) {
  if (loadedTemplates[type]?.source === 'upload') {
    loadedTemplates[type] = null;
    preloadGlbTemplates(true);
  }
}

export function getLoadedGlbTemplate(type: PieceSymbol): CachedGlbTemplate | null {
  return loadedTemplates[type] ?? null;
}

export function getLoadedGlbCount(): number {
  return (Object.keys(MODEL_CONFIG) as PieceSymbol[]).filter((k) => Boolean(loadedTemplates[k])).length;
}

export function getGlbStatusMap(): Record<PieceSymbol, 'disk' | 'upload' | 'fallback'> {
  return {
    p: loadedTemplates.p ? loadedTemplates.p.source : 'fallback',
    r: loadedTemplates.r ? loadedTemplates.r.source : 'fallback',
    n: loadedTemplates.n ? loadedTemplates.n.source : 'fallback',
    b: loadedTemplates.b ? loadedTemplates.b.source : 'fallback',
    q: loadedTemplates.q ? loadedTemplates.q.source : 'fallback',
    k: loadedTemplates.k ? loadedTemplates.k.source : 'fallback',
  };
}

export function getPieceTooltipCopy(type: PieceSymbol, lang: Language): { name: string; desc: string } {
  const cfg = MODEL_CONFIG[type];
  return lang === 'en'
    ? { name: cfg.nameEn, desc: cfg.descEn }
    : { name: cfg.nameVi, desc: cfg.descVi };
}
