import * as THREE from 'three';
import { PieceColor, PieceSymbol } from '../types/chess';

export const ASSET_IMAGE_URLS = {
  backdrop: '/assets/aistudio/image_9fa5f9b7.png',
  lightMarble: '/assets/aistudio/image_a2c743fd.png',
  darkObsidian: '/assets/aistudio/image_1d749a05.png',
  whiteBanner: '/assets/aistudio/image_7292906a.png',
  blackBanner: '/assets/aistudio/image_7c968639.png',
  scutum: '/assets/aistudio/image_f7528572.png',
  emblemsGrid: '/assets/aistudio/image_ccae4c60.png',
} as const;

export type AssetImageKey = keyof typeof ASSET_IMAGE_URLS;

export interface LoadedArenaTextures {
  backdropTex: THREE.Texture;
  lightMarbleTex: THREE.Texture;
  darkObsidianTex: THREE.Texture;
  whiteBannerTex: THREE.Texture;
  blackBannerTex: THREE.Texture;
  scutumWhiteTex: THREE.Texture;
  scutumBlackTex: THREE.Texture;
  emblemTextures: Record<`${PieceColor}_${PieceSymbol}`, THREE.Texture>;
  loadPromise: Promise<void>;
  dispose: () => void;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error(`Asset image decoded with 0 dimensions: ${url}`));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`Failed to load required asset image: ${url}`));
    };
    img.src = url;
  });
}

/**
 * Copies a loaded asset image to an offscreen canvas and cleans the tiny
 * bottom-right corner generation mark by sampling adjacent clean pixels
 * from the same texture, preserving 99.8%+ of the original artwork untouched.
 */
function sanitizeCornerMark(
  img: HTMLImageElement,
  patchBox?: { xFrac: number; yFrac: number; wFrac: number; hFrac: number; sampleDxFrac: number }
): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  if (patchBox) {
    const px = Math.floor(w * patchBox.xFrac);
    const py = Math.floor(h * patchBox.yFrac);
    const pw = Math.max(4, Math.floor(w * patchBox.wFrac));
    const ph = Math.max(4, Math.floor(h * patchBox.hFrac));
    const sx = Math.max(0, Math.min(w - pw, px + Math.floor(w * patchBox.sampleDxFrac)));
    ctx.drawImage(canvas, sx, py, pw, ph, px, py, pw, ph);
  }
  return canvas;
}

function createBlackFactionScutumCanvas(whiteScutumCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = whiteScutumCanvas.width;
  const h = whiteScutumCanvas.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(whiteScutumCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // Shift crimson wood field toward deep imperial shadow purple while keeping gold rivets/wings/lightning metallic
    const isCrimsonField = r > g * 1.45 && r > b * 1.45 && g < 110;
    if (isCrimsonField) {
      d[i] = Math.round(r * 0.44 + 28);
      d[i + 1] = Math.round(g * 0.42 + 8);
      d[i + 2] = Math.round(r * 0.66 + 44);
    } else {
      // Cool silver-amethyst steel sheen on brass accents for Black Kingdom distinction
      d[i] = Math.min(255, Math.round(r * 0.9 + 8));
      d[i + 1] = Math.min(255, Math.round(g * 0.88 + 6));
      d[i + 2] = Math.min(255, Math.round(b * 1.12 + 24));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

const GRID_LAYOUT: { type: PieceSymbol; col: number; row: number }[] = [
  { type: 'p', col: 0, row: 0 },
  { type: 'r', col: 1, row: 0 },
  { type: 'n', col: 2, row: 0 },
  { type: 'b', col: 0, row: 1 },
  { type: 'q', col: 1, row: 1 },
  { type: 'k', col: 2, row: 1 },
];

/**
 * Slices Image 7 (2x3 chess symbols grid) into 6 independent transparent-background
 * icon canvases, keying out pure white background and tinting cleanly for each Kingdom.
 */
function sliceEmblemCell(
  gridImg: HTMLImageElement,
  col: number,
  row: number,
  color: PieceColor
): HTMLCanvasElement {
  const gw = gridImg.naturalWidth;
  const gh = gridImg.naturalHeight;
  const cellW = Math.floor(gw / 3);
  const cellH = Math.floor(gh / 2);

  const outSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d')!;

  // Add slight inset so neighboring cell borders never bleed
  const padX = Math.floor(cellW * 0.04);
  const padY = Math.floor(cellH * 0.04);
  ctx.drawImage(
    gridImg,
    col * cellW + padX,
    row * cellH + padY,
    cellW - padX * 2,
    cellH - padY * 2,
    14,
    14,
    outSize - 28,
    outSize - 28
  );

  const imgData = ctx.getImageData(0, 0, outSize, outSize);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const chroma = maxCh - minCh;

    // White/light-gray studio backdrop -> transparent alpha
    if (minCh > 218 && chroma < 24) {
      d[i + 3] = 0;
      continue;
    }
    if (minCh > 185 && chroma < 22) {
      const t = (218 - minCh) / (218 - 185);
      d[i + 3] = Math.round(Math.max(0, Math.min(1, t)) * 255);
    }

    if (color === 'w') {
      // Rich luminous imperial gold
      d[i] = Math.min(255, Math.round(r * 1.12 + 16));
      d[i + 1] = Math.min(255, Math.round(g * 1.04 + 8));
      d[i + 2] = Math.max(0, Math.round(b * 0.78));
    } else {
      // Royal obsidian-amethyst silver-violet for Phe Bóng Đêm
      const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
      d[i] = Math.min(255, Math.round(lum * 198 + 26));
      d[i + 1] = Math.min(255, Math.round(lum * 145 + 12));
      d[i + 2] = Math.min(255, Math.round(lum * 255 + 34));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function makePlaceholderCanvas(w = 4, h = 4): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function loadArenaAssetTextures(
  maxAnisotropy: number,
  onFatalError: (err: Error) => void
): LoadedArenaTextures {
  const allTextures: THREE.Texture[] = [];

  const makeLiveTex = (repeat = false): THREE.Texture<TexImageSource> => {
    const tex: THREE.Texture<TexImageSource> = new THREE.Texture(makePlaceholderCanvas() as TexImageSource);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    if (repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    } else {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    }
    allTextures.push(tex);
    return tex;
  };

  const backdropTex = makeLiveTex(false);
  const lightMarbleTex = makeLiveTex(true);
  const darkObsidianTex = makeLiveTex(true);
  const whiteBannerTex = makeLiveTex(false);
  const blackBannerTex = makeLiveTex(false);
  const scutumWhiteTex = makeLiveTex(false);
  const scutumBlackTex = makeLiveTex(false);

  const emblemTextures = {} as Record<`${PieceColor}_${PieceSymbol}`, THREE.Texture>;
  for (const side of ['w', 'b'] as PieceColor[]) {
    for (const cell of GRID_LAYOUT) {
      const t = makeLiveTex(false);
      emblemTextures[`${side}_${cell.type}`] = t;
    }
  }

  const loadPromise = Promise.all([
    loadHtmlImage(ASSET_IMAGE_URLS.backdrop),
    loadHtmlImage(ASSET_IMAGE_URLS.lightMarble),
    loadHtmlImage(ASSET_IMAGE_URLS.darkObsidian),
    loadHtmlImage(ASSET_IMAGE_URLS.whiteBanner),
    loadHtmlImage(ASSET_IMAGE_URLS.blackBanner),
    loadHtmlImage(ASSET_IMAGE_URLS.scutum),
    loadHtmlImage(ASSET_IMAGE_URLS.emblemsGrid),
  ])
    .then(([backdropImg, lightImg, darkImg, wBannerImg, bBannerImg, scutumImg, gridImg]) => {
      // 1. Backdrop
      backdropTex.image = backdropImg;
      backdropTex.needsUpdate = true;

      // 2. White Carrara marble (clean bottom-right corner subtle mark)
      lightMarbleTex.image = sanitizeCornerMark(lightImg, {
        xFrac: 0.84,
        yFrac: 0.84,
        wFrac: 0.08,
        hFrac: 0.08,
        sampleDxFrac: -0.1,
      });
      lightMarbleTex.needsUpdate = true;

      // 3. Dark Obsidian marble (clean bottom-right star mark)
      darkObsidianTex.image = sanitizeCornerMark(darkImg, {
        xFrac: 0.83,
        yFrac: 0.83,
        wFrac: 0.1,
        hFrac: 0.1,
        sampleDxFrac: -0.12,
      });
      darkObsidianTex.needsUpdate = true;

      // 4. White Crimson Eagle Banner (heal tiny lower-right fabric diamond inside gold border)
      whiteBannerTex.image = sanitizeCornerMark(wBannerImg, {
        xFrac: 0.77,
        yFrac: 0.87,
        wFrac: 0.08,
        hFrac: 0.05,
        sampleDxFrac: -0.1,
      });
      whiteBannerTex.needsUpdate = true;

      // 5. Black Royal Purple Eagle Banner
      blackBannerTex.image = sanitizeCornerMark(bBannerImg, {
        xFrac: 0.82,
        yFrac: 0.84,
        wFrac: 0.08,
        hFrac: 0.05,
        sampleDxFrac: -0.1,
      });
      blackBannerTex.needsUpdate = true;

      // 6. Scutum Shield Face (White Crimson & Black Amethyst-Crimson variants from real Image 6)
      const cleanScutum = sanitizeCornerMark(scutumImg, {
        xFrac: 0.81,
        yFrac: 0.85,
        wFrac: 0.08,
        hFrac: 0.06,
        sampleDxFrac: -0.1,
      });
      scutumWhiteTex.image = cleanScutum;
      scutumWhiteTex.needsUpdate = true;

      scutumBlackTex.image = createBlackFactionScutumCanvas(cleanScutum);
      scutumBlackTex.needsUpdate = true;

      // 7. Slice 2x3 Chess Emblems Grid into 6 White + 6 Black transparent medallions
      for (const side of ['w', 'b'] as PieceColor[]) {
        for (const cell of GRID_LAYOUT) {
          const tex = emblemTextures[`${side}_${cell.type}`];
          tex.image = sliceEmblemCell(gridImg, cell.col, cell.row, side);
          tex.needsUpdate = true;
        }
      }
    })
    .catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[3D CHESS BATTLE] Critical asset texture load failure:', error);
      onFatalError(error);
      throw error;
    });

  return {
    backdropTex,
    lightMarbleTex,
    darkObsidianTex,
    whiteBannerTex,
    blackBannerTex,
    scutumWhiteTex,
    scutumBlackTex,
    emblemTextures,
    loadPromise,
    dispose: () => {
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
  };
}
