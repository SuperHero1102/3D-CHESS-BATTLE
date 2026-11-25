import React, { useState } from 'react';
import {
  Camera,
  RotateCcw,
  Volume2,
  VolumeX,
  Lightbulb,
  History,
  MessageSquare,
  Pause,
  Flag,
  Handshake,
  Settings,
  ChevronDown,
  ChevronUp,
  FastForward,
  Undo2,
  Crown,
  ShieldAlert,
  Ban,
  Home,
  X,
  WifiOff,
} from 'lucide-react';
import {
  CameraPreset,
  GameMode,
  GameOverInfo,
  GameSettings,
  MoveRecord,
  PieceColor,
  PieceSymbol,
  SafeChatMessage,
} from '../types/chess';
import { PRESET_CHAT_KEYS, PresetChatKey, t } from '../i18n/translations';
import { SETUP_V2, UX_POLISH } from '../config/featureFlags';

interface GameHUDProps {
  mode: Exclude<GameMode, 'menu' | 'learn'>;
  settings: GameSettings;
  turn: PieceColor;
  inCheck: boolean;
  aiThinking: boolean;
  combatActive: boolean;
  whiteName: string;
  blackName: string;
  whiteClockMs: number;
  blackClockMs: number;
  untimed: boolean;
  history: MoveRecord[];
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  gameOver: GameOverInfo | null;
  paused: boolean;
  promotionPending: boolean;
  serverReconnecting?: boolean;
  onlineStatus?: {
    roomCode: string;
    myColor: PieceColor;
    opponentConnected: boolean;
    pendingDrawFrom: PieceColor | null;
    rematchMine: boolean;
    rematchOpp: boolean;
    chat: SafeChatMessage[];
    muted: boolean;
  };
  onCameraPreset: (preset: CameraPreset) => void;
  onResetCamera: () => void;
  onToggleCombatPace: () => void;
  onSkipCombat: () => void;
  onToggleSound: () => void;
  onRequestHint?: () => void;
  onUndo?: () => void;
  onPauseToggle: () => void;
  onOfferDraw?: () => void;
  onRespondDraw?: (accept: boolean) => void;
  onResign: () => void;
  onRematch: () => void;
  onReturnMenu: () => void;
  onOpenSettings: () => void;
  onPromote: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onSendQuickChat?: (presetKey: PresetChatKey) => void;
  onToggleMute?: () => void;
  onReportOpponent?: () => void;
}

const PIECE_UNICODE: Record<PieceSymbol, string> = {
  k: '♔',
  q: '♕',
  r: '♖',
  b: '♗',
  n: '♘',
  p: '♙',
};

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  mode,
  settings,
  turn,
  inCheck,
  aiThinking,
  combatActive,
  whiteName,
  blackName,
  whiteClockMs,
  blackClockMs,
  untimed,
  history,
  capturedByWhite,
  capturedByBlack,
  gameOver,
  paused,
  promotionPending,
  serverReconnecting,
  onlineStatus,
  onCameraPreset,
  onResetCamera,
  onToggleCombatPace,
  onSkipCombat,
  onToggleSound,
  onRequestHint,
  onUndo,
  onPauseToggle,
  onOfferDraw,
  onRespondDraw,
  onResign,
  onRematch,
  onReturnMenu,
  onOpenSettings,
  onPromote,
  onSendQuickChat,
  onToggleMute,
  onReportOpponent,
}) => {
  const lang = settings.language;
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [drawer, setDrawer] = useState<'none' | 'history' | 'chat'>('none');
  const [confirmResign, setConfirmResign] = useState(false);
  const [reported, setReported] = useState(false);

  const visibleChat = onlineStatus?.muted ? [] : onlineStatus?.chat || [];

  const topInsetClass = UX_POLISH
    ? 'top-[max(0.5rem,env(safe-area-inset-top))] left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] sm:top-3 sm:left-3 sm:right-3'
    : 'top-3 left-3 right-3';

  const bottomInsetClass = UX_POLISH
    ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]'
    : 'bottom-4';

  const renderClockPill = (ms: number, isActiveTurn: boolean, isDark: boolean) => {
    if (untimed) {
      if (!SETUP_V2) return null;
      return (
        <div
          title={t(lang, 'untimed')}
          className={`text-[10px] sm:text-xs font-semibold px-2 py-1 rounded-lg shrink-0 whitespace-nowrap border ${
            isActiveTurn && !gameOver
              ? isDark
                ? 'bg-[#7C3AED]/25 border-[#A855F7]/60 text-[#E9D5FF]'
                : 'bg-[#D4AF37]/20 border-[#D4AF37]/70 text-[#FDE68A]'
              : 'bg-[#181E2B] border-white/10 text-[#9AA3B2]'
          }`}
        >
          <span className="hidden xs:inline sm:inline">{t(lang, 'untimed')}</span>
          <span className="sm:hidden">{t(lang, 'untimed')}</span>
        </div>
      );
    }

    return (
      <div
        className={`font-mono-tabular text-xs sm:text-base font-bold px-2 sm:px-2.5 py-1 rounded-lg shrink-0 ${
          isActiveTurn
            ? isDark
              ? 'bg-[#7C3AED] text-white'
              : 'bg-[#D4AF37] text-[#0D1017]'
            : 'bg-[#181E2B] text-[#9AA3B2]'
        }`}
      >
        {formatClock(ms)}
      </div>
    );
  };

  return (
    <>
      {/* Top Player Strips (Compact, non-occluding, safe-area aware) */}
      <div className={`fixed ${topInsetClass} z-20 pointer-events-none flex flex-col items-center gap-2`}>
        <div className="pointer-events-auto w-full max-w-5xl flex items-stretch justify-between gap-1.5 sm:gap-4">
          {/* Light / Red Army Card */}
          <div
            className={`flex-1 min-w-0 rounded-xl px-2.5 sm:px-3 py-2 border transition-colors bg-[#121620]/92 flex items-center justify-between gap-1.5 sm:gap-2 ${
              turn === 'w' && !gameOver
                ? SETUP_V2
                  ? 'border-[#EF4444]'
                  : 'border-[#D4AF37]'
                : 'border-white/12'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                    SETUP_V2 ? 'bg-[#EF4444] ring-1 ring-[#FDE68A]/70' : 'bg-[#E5E7EB]'
                  }`}
                />
                <span
                  className={`text-[11px] sm:text-sm font-bold text-[#F3EFE6] leading-tight ${
                    UX_POLISH ? 'line-clamp-2 break-words' : 'truncate'
                  }`}
                >
                  {whiteName}
                </span>
              </div>
              {capturedByWhite.length > 0 && (
                <div className="text-[11px] text-[#9AA3B2] truncate h-4 mt-0.5">
                  {capturedByWhite.map((p, idx) => (
                    <span key={`${p}-${idx}`} className="mr-0.5 text-[#D4AF37]">
                      {PIECE_UNICODE[p]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {renderClockPill(whiteClockMs, turn === 'w', false)}
          </div>

          {/* Center Turn / Room Status */}
          <div className="hidden md:flex flex-col items-center justify-center px-4 py-1.5 rounded-xl bg-[#121620]/92 border border-white/12 shrink-0 min-w-[180px]">
            <span className="text-xs font-semibold text-[#F3EFE6]">
              {turn === 'w' ? t(lang, 'turnWhite') : t(lang, 'turnBlack')}
            </span>
            {onlineStatus && (
              <span className="text-[11px] font-mono-tabular text-[#D4AF37]">
                {t(lang, 'roomCode')}: {onlineStatus.roomCode}
              </span>
            )}
          </div>

          {/* Night / Purple Army Card */}
          <div
            className={`flex-1 min-w-0 rounded-xl px-2.5 sm:px-3 py-2 border transition-colors bg-[#121620]/92 flex items-center justify-between gap-1.5 sm:gap-2 ${
              turn === 'b' && !gameOver ? 'border-[#A855F7]' : 'border-white/12'
            }`}
          >
            {renderClockPill(blackClockMs, turn === 'b', true)}
            <div className="min-w-0 flex-1 text-right ml-auto">
              <div className="flex items-center justify-end gap-1.5 min-w-0">
                <span
                  className={`text-[11px] sm:text-sm font-bold text-[#F3EFE6] leading-tight ${
                    UX_POLISH ? 'line-clamp-2 break-words' : 'truncate'
                  }`}
                >
                  {blackName}
                </span>
                <span className="w-2.5 h-2.5 rounded-sm bg-[#7C3AED] ring-1 ring-[#D8B4FE]/60 shrink-0" />
              </div>
              {capturedByBlack.length > 0 && (
                <div className="text-[11px] text-[#9AA3B2] truncate h-4 mt-0.5">
                  {capturedByBlack.map((p, idx) => (
                    <span key={`${p}-${idx}`} className="ml-0.5 text-[#E5E7EB]">
                      {PIECE_UNICODE[p]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Banners (Check, AI Thinking, Combat Skip, Online Draw/Disconnect/Reconnect) */}
        <div className="flex flex-wrap items-center justify-center gap-2 pointer-events-auto">
          {UX_POLISH && serverReconnecting && mode === 'online' && !gameOver && (
            <div className="px-3.5 py-1.5 rounded-lg bg-amber-950/95 border border-amber-400/50 text-xs font-semibold text-amber-100 flex items-center gap-1.5 shadow-lg">
              <WifiOff className="w-3.5 h-3.5 text-amber-300" />
              <span>{t(lang, 'reconnecting')}</span>
            </div>
          )}
          {inCheck && !gameOver && (
            <div className="px-4 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-bold tracking-wider shadow-lg">
              {t(lang, 'inCheck')}
            </div>
          )}
          {aiThinking && !gameOver && (
            <div className="px-4 py-1.5 rounded-lg bg-[#181E2B]/95 border border-[#60A5FA]/40 text-xs font-semibold text-[#93C5FD]">
              {t(lang, 'aiThinking')}
            </div>
          )}
          {combatActive && (
            <button
              type="button"
              onClick={onSkipCombat}
              className="px-4 py-1.5 rounded-lg bg-[#D4AF37] text-[#0D1017] text-xs font-bold flex items-center gap-1.5 shadow-lg"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>
                {t(lang, 'combatInProgress')} · {t(lang, 'skipCombat')}
              </span>
            </button>
          )}
          {onlineStatus && !onlineStatus.opponentConnected && !gameOver && (
            <div className="px-4 py-1.5 rounded-lg bg-amber-900/95 border border-amber-500/40 text-xs font-semibold text-amber-100">
              {t(lang, 'opponentDisconnected')}
            </div>
          )}
          {onlineStatus?.pendingDrawFrom && onlineStatus.pendingDrawFrom !== onlineStatus.myColor && !gameOver && (
            <div className="px-4 py-2 rounded-xl bg-[#161B26] border border-[#D4AF37]/50 flex items-center gap-3 shadow-xl">
              <span className="text-xs font-semibold text-[#F3EFE6]">{t(lang, 'opponentOfferedDraw')}</span>
              <button
                type="button"
                onClick={() => onRespondDraw?.(true)}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
              >
                {t(lang, 'acceptDraw')}
              </button>
              <button
                type="button"
                onClick={() => onRespondDraw?.(false)}
                className="px-3 py-1 rounded-lg bg-[#252D3D] text-[#F3EFE6] text-xs font-semibold"
              >
                {t(lang, 'declineDraw')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Side/Bottom Drawer for Move History or Safe Preset Chat */}
      {drawer !== 'none' && (
        <div
          className={`fixed right-3 sm:right-4 z-30 w-80 max-w-[92vw] rounded-2xl bg-[#121620]/96 border border-[#D4AF37]/30 shadow-2xl flex flex-col overflow-hidden ${
            UX_POLISH ? 'bottom-24 max-h-[50dvh]' : 'bottom-24 max-h-[52vh]'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs font-bold text-[#D4AF37]">
              {drawer === 'history' ? t(lang, 'history') : t(lang, 'chat')}
            </span>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              className="p-1.5 rounded-lg text-[#9AA3B2] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {drawer === 'history' ? (
            <div className="p-3 overflow-y-auto custom-scrollbar flex-1">
              {history.length === 0 ? (
                <div className="text-xs text-[#9AA3B2] text-center py-6">—</div>
              ) : (
                <div className="grid grid-cols-[40px_1fr_1fr] gap-y-1 text-xs font-mono-tabular">
                  {Array.from({ length: Math.ceil(history.length / 2) }).map((_, idx) => {
                    const wMove = history[idx * 2];
                    const bMove = history[idx * 2 + 1];
                    return (
                      <React.Fragment key={idx}>
                        <span className="text-[#9AA3B2] py-1">{idx + 1}.</span>
                        <span className="text-[#F3EFE6] py-1 font-semibold">{wMove?.san}</span>
                        <span className="text-[#CBD5E1] py-1">{bMove?.san || ''}</span>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-3 py-1.5 bg-[#181E2B] text-[11px] text-[#9AA3B2] flex items-center justify-between border-b border-white/10">
                <span>{t(lang, 'safeChatNotice')}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    title={onlineStatus?.muted ? t(lang, 'unmuteOpponent') : t(lang, 'muteOpponent')}
                    className="p-1.5 rounded hover:bg-white/10 text-[#9AA3B2] hover:text-white"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onReportOpponent?.();
                      setReported(true);
                      setTimeout(() => setReported(false), 3000);
                    }}
                    title={t(lang, 'reportOpponent')}
                    className="p-1.5 rounded hover:bg-white/10 text-rose-400"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {reported && (
                <div className="px-3 py-1.5 bg-emerald-900/60 text-[11px] text-emerald-200">
                  {t(lang, 'reportedToast')}
                </div>
              )}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-[120px]">
                {visibleChat.map((msg) => (
                  <div key={msg.id} className="text-xs">
                    <span className={msg.senderColor === 'w' ? 'text-[#EF4444] font-bold' : 'text-[#A855F7] font-bold'}>
                      {msg.senderName}:{' '}
                    </span>
                    <span className="text-[#F3EFE6]">{t(lang, msg.presetKey as PresetChatKey)}</span>
                  </div>
                ))}
              </div>
              <div className="p-2 border-t border-white/10 grid grid-cols-2 gap-1.5 bg-[#161B26]">
                {PRESET_CHAT_KEYS.map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => onSendQuickChat?.(key)}
                    className="px-2 py-1.5 rounded-lg bg-[#1F2737] hover:bg-[#2A3449] text-[11px] text-[#F3EFE6] truncate text-left"
                  >
                    {t(lang, key)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`fixed ${bottomInsetClass} left-1/2 -translate-x-1/2 z-20 transition-transform duration-200 max-w-[96vw] ${
          dockCollapsed ? 'translate-y-[calc(100%-26px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex justify-center mb-1">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="px-3 py-1 rounded-t-lg bg-[#121620]/95 border border-b-0 border-[#D4AF37]/30 text-[11px] font-semibold text-[#D4AF37] flex items-center gap-1"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{dockCollapsed ? t(lang, 'showHUD') : t(lang, 'hideHUD')}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-2xl bg-[#121620]/95 border border-[#D4AF37]/25 shadow-2xl">
          <button
            type="button"
            onClick={onResetCamera}
            title={t(lang, 'resetCamera')}
            className="px-2.5 py-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-xs font-semibold text-[#F3EFE6] flex items-center gap-1.5 min-h-[40px]"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden sm:inline">{t(lang, 'camDefault')}</span>
          </button>

          <button
            type="button"
            onClick={() => onCameraPreset('top')}
            title={t(lang, 'camTop')}
            className="px-2.5 py-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-xs font-semibold text-[#F3EFE6] flex items-center gap-1.5 min-h-[40px]"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t(lang, 'camTop')}</span>
          </button>

          <button
            type="button"
            onClick={onToggleCombatPace}
            className={`px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 min-h-[40px] ${
              settings.combatPace === 'fast'
                ? 'bg-[#D4AF37] text-[#0D1017]'
                : 'bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6]'
            }`}
          >
            <FastForward className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {settings.combatPace === 'fast' ? t(lang, 'quickMode') : t(lang, 'fullCombat')}
            </span>
          </button>

          {onRequestHint && (
            <button
              type="button"
              onClick={onRequestHint}
              disabled={aiThinking || Boolean(gameOver)}
              className="px-2.5 py-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-xs font-semibold text-[#38BDF8] flex items-center gap-1.5 min-h-[40px] disabled:opacity-45"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'hint')}</span>
            </button>
          )}

          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={history.length === 0 || Boolean(gameOver)}
              className="px-2.5 py-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-xs font-semibold text-[#F3EFE6] flex items-center gap-1.5 min-h-[40px] disabled:opacity-45"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'undo')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDrawer((d) => (d === 'history' ? 'none' : 'history'))}
            className={`px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 min-h-[40px] ${
              drawer === 'history' ? 'bg-[#D4AF37] text-[#0D1017]' : 'bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, 'history')}</span>
          </button>

          {mode === 'online' && (
            <button
              type="button"
              onClick={() => setDrawer((d) => (d === 'chat' ? 'none' : 'chat'))}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 min-h-[40px] ${
                drawer === 'chat' ? 'bg-[#D4AF37] text-[#0D1017]' : 'bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'chat')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={t(lang, 'soundFX')}
            className="p-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6] min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#9AA3B2]" />}
          </button>

          {mode !== 'online' ? (
            <button
              type="button"
              onClick={onPauseToggle}
              aria-label={t(lang, 'pause')}
              className="p-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6] min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            onOfferDraw && (
              <button
                type="button"
                onClick={onOfferDraw}
                title={t(lang, 'offerDraw')}
                className="p-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6] min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <Handshake className="w-4 h-4" />
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setConfirmResign(true)}
            title={t(lang, 'resign')}
            className="p-2 rounded-xl bg-[#181E2B] hover:bg-rose-900/60 text-rose-300 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <Flag className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t(lang, 'settings')}
            className="p-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-[#F3EFE6] min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onReturnMenu}
            aria-label={t(lang, 'returnMenu')}
            className="p-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-[#9AA3B2] hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pawn Promotion Modal */}
      {promotionPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#121620] border border-[#D4AF37]/40 p-6 text-center space-y-4">
            <h3 className="font-display text-lg font-bold text-[#D4AF37]">{t(lang, 'promoteTitle')}</h3>
            <p className="text-xs text-[#9AA3B2]">{t(lang, 'promoteDesc')}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(['q', 'r', 'b', 'n'] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => onPromote(p)}
                  className="py-3 px-4 rounded-xl bg-[#181E2B] hover:bg-[#D4AF37] hover:text-[#0D1017] border border-white/15 text-sm font-bold text-[#F3EFE6] transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <span className="text-lg">{PIECE_UNICODE[p]}</span>
                  <span>{t(lang, `piece_${p}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resign Confirmation */}
      {confirmResign && !gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#121620] border border-white/15 p-6 text-center space-y-4">
            <p className="text-sm font-semibold text-[#F3EFE6]">{t(lang, 'confirmResign')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmResign(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181E2B] text-xs font-semibold text-[#F3EFE6] min-h-[44px]"
              >
                {t(lang, 'close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmResign(false);
                  onResign();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white min-h-[44px]"
              >
                {t(lang, 'resign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Overlay */}
      {paused && !gameOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#121620] border border-[#D4AF37]/30 p-6 text-center space-y-4">
            <h3 className="font-display text-xl font-bold text-[#D4AF37]">{t(lang, 'pausedTitle')}</h3>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onPauseToggle}
                className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#0D1017] font-bold text-sm min-h-[46px]"
              >
                {t(lang, 'resume')}
              </button>
              <button
                type="button"
                onClick={onReturnMenu}
                className="w-full py-3 rounded-xl bg-[#181E2B] border border-white/12 text-[#F3EFE6] font-semibold text-sm min-h-[46px]"
              >
                {t(lang, 'returnMenu')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Victory / Summary Screen */}
      {gameOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#121620] border border-[#D4AF37]/40 p-6 shadow-2xl text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center">
              <Crown className="w-8 h-8 text-[#D4AF37]" />
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F3EFE6]">
                {gameOver.winner === 'w'
                  ? t(lang, 'victoryWhite')
                  : gameOver.winner === 'b'
                    ? t(lang, 'victoryBlack')
                    : t(lang, 'drawResult')}
              </h2>
              <p className="text-xs font-semibold text-[#D4AF37]">{t(lang, `reason_${gameOver.reason}`)}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#181E2B] border border-white/10">
              <div>
                <div className="text-[11px] text-[#9AA3B2]">{t(lang, 'movesCount')}</div>
                <div className="font-mono-tabular text-base font-bold text-[#F3EFE6]">{gameOver.movesCount}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9AA3B2]">{t(lang, 'duration')}</div>
                <div className="font-mono-tabular text-base font-bold text-[#F3EFE6]">{gameOver.durationSec}s</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9AA3B2]">{t(lang, 'eloChange')}</div>
                <div className="font-mono-tabular text-base font-bold text-[#D4AF37]">
                  {gameOver.eloDelta !== undefined
                    ? gameOver.eloDelta > 0
                      ? `+${gameOver.eloDelta}`
                      : gameOver.eloDelta
                    : '—'}
                </div>
              </div>
            </div>

            {onlineStatus?.rematchOpp && !onlineStatus.rematchMine && (
              <div className="p-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/40 text-xs text-emerald-200">
                {t(lang, 'opponentWantsRematch')}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onReturnMenu}
                className="flex-1 py-3 rounded-xl bg-[#181E2B] border border-white/15 text-xs font-semibold text-[#F3EFE6] min-h-[46px]"
              >
                {t(lang, 'returnMenu')}
              </button>
              <button
                type="button"
                onClick={onRematch}
                disabled={onlineStatus?.rematchMine}
                className="flex-1 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017] text-xs font-bold min-h-[46px] disabled:opacity-60"
              >
                {onlineStatus?.rematchMine
                  ? t(lang, 'rematchRequested')
                  : onlineStatus?.rematchOpp
                    ? t(lang, 'acceptRematch')
                    : t(lang, 'rematch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
