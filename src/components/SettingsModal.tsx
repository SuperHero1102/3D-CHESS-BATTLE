import React, { useEffect, useState } from 'react';
import { X, Volume2, VolumeX, Upload, RotateCcw, Box, Eye } from 'lucide-react';
import { CombatPace, GameSettings, GraphicsQuality, Language, PieceSymbol } from '../types/chess';
import { t } from '../i18n/translations';
import {
  MODEL_CONFIG,
  clearCustomGlbModel,
  getGlbStatusMap,
  getPieceTooltipCopy,
  registerCustomGlbFile,
} from '../three/modelLoader';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdate: (patch: Partial<GameSettings>) => void;
  onOpenGallery?: () => void;
  onClose: () => void;
}

const PIECE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onOpenGallery, onClose }) => {
  const lang = settings.language;
  const [glbStatus, setGlbStatus] = useState(getGlbStatusMap);

  useEffect(() => {
    const sync = () => setGlbStatus(getGlbStatusMap());
    window.addEventListener('glb-models-updated', sync);
    return () => window.removeEventListener('glb-models-updated', sync);
  }, []);

  const handleGlbFile = async (type: PieceSymbol, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await registerCustomGlbFile(type, file);
    setGlbStatus(getGlbStatusMap());
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#121620] border border-[#D4AF37]/30 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-xl font-bold text-[#F3EFE6]">{t(lang, 'settings')}</h2>
          <div className="flex items-center gap-2">
            {onOpenGallery && (
              <button
                type="button"
                onClick={onOpenGallery}
                className="px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/45 text-xs font-semibold text-[#FFD700] flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Gallery</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#9AA3B2] hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'language')}</label>
          <div className="grid grid-cols-2 gap-2">
            {(['vi', 'en'] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => onUpdate({ language: l })}
                className={`py-2.5 rounded-xl text-xs font-semibold border min-h-[44px] ${
                  settings.language === l
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                    : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
                }`}
              >
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </button>
            ))}
          </div>
        </div>

        {/* Graphics Quality */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'graphicsQuality')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => onUpdate({ graphicsQuality: q })}
                className={`py-2.5 px-2 rounded-xl text-xs font-semibold border min-h-[44px] ${
                  settings.graphicsQuality === q
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                    : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
                }`}
              >
                {t(lang, q === 'low' ? 'qualityLow' : q === 'medium' ? 'qualityMedium' : 'qualityHigh')}
              </button>
            ))}
          </div>
        </div>

        {/* Combat Pace */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'combatPace')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['full', 'fast', 'off'] as CombatPace[]).map((p) => (
              <button
                key={p}
                onClick={() => onUpdate({ combatPace: p })}
                className={`py-2.5 px-2 rounded-xl text-xs font-semibold border min-h-[44px] ${
                  settings.combatPace === p
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                    : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
                }`}
              >
                {t(lang, p === 'full' ? 'paceFull' : p === 'fast' ? 'paceFast' : 'paceOff')}
              </button>
            ))}
          </div>
        </div>

        {/* Audio */}
        <div className="space-y-3 p-4 rounded-xl bg-[#181E2B] border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3EFE6]">{t(lang, 'soundFX')}</span>
            <button
              onClick={() => onUpdate({ soundEnabled: !settings.soundEnabled })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                settings.soundEnabled ? 'bg-emerald-600 text-white' : 'bg-[#121620] text-[#9AA3B2]'
              }`}
            >
              {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{settings.soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9AA3B2] w-16">{t(lang, 'volume')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.soundVolume}
              onChange={(e) => onUpdate({ soundVolume: parseFloat(e.target.value) })}
              className="flex-1 accent-[#D4AF37]"
            />
          </div>
        </div>

        {/* Visual Helpers */}
        <div className="space-y-2">
          <label className="flex items-center justify-between p-3 rounded-xl bg-[#181E2B] border border-white/10 cursor-pointer">
            <span className="text-xs font-semibold text-[#F3EFE6]">{t(lang, 'showCoords')}</span>
            <input
              type="checkbox"
              checked={settings.showCoordinates}
              onChange={(e) => onUpdate({ showCoordinates: e.target.checked })}
              className="w-4 h-4 accent-[#D4AF37]"
            />
          </label>
          <label className="flex items-center justify-between p-3 rounded-xl bg-[#181E2B] border border-white/10 cursor-pointer">
            <span className="text-xs font-semibold text-[#F3EFE6]">{t(lang, 'showHints')}</span>
            <input
              type="checkbox"
              checked={settings.showValidMoves}
              onChange={(e) => onUpdate({ showValidMoves: e.target.checked })}
              className="w-4 h-4 accent-[#D4AF37]"
            />
          </label>
        </div>

        {/* 3D GLB Warrior Models Slot Manager */}
        <div className="space-y-2.5 p-4 rounded-xl bg-[#181E2B] border border-white/10">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-bold text-[#F3EFE6]">{t(lang, 'glbModelsTitle')}</span>
          </div>
          <p className="text-[11px] text-[#9AA3B2] leading-relaxed">{t(lang, 'glbModelsHint')}</p>
          <div className="space-y-1.5">
            {PIECE_ORDER.map((type) => {
              const cfg = MODEL_CONFIG[type];
              const copy = getPieceTooltipCopy(type, lang);
              const state = glbStatus[type];
              const isLoaded = state !== 'fallback';
              return (
                <div
                  key={type}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#121620] border border-white/5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F3EFE6] truncate">{copy.name}</div>
                    <div className="text-[10px] font-mono-tabular text-[#9AA3B2] truncate">
                      {cfg.filename} • {isLoaded ? t(lang, 'glbStatusLoaded') : t(lang, 'glbStatusFallback')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {state === 'upload' && (
                      <button
                        type="button"
                        onClick={() => clearCustomGlbModel(type)}
                        title={t(lang, 'glbClearBtn')}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[#9AA3B2] hover:text-white"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <label className="cursor-pointer px-2.5 py-1.5 rounded-md bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 text-[11px] font-semibold text-[#FFD700] flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      <span>{t(lang, 'glbUploadBtn')}</span>
                      <input
                        type="file"
                        accept=".glb,.gltf"
                        className="hidden"
                        onChange={(e) => void handleGlbFile(type, e)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#0D1017] font-bold text-sm min-h-[46px]"
        >
          {t(lang, 'close')}
        </button>
      </div>
    </div>
  );
};
