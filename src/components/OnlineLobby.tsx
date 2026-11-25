import React, { useState } from 'react';
import { Copy, Check, Share2, X, Shield, Swords, Lock, Clock } from 'lucide-react';
import { Language, OnlineRoomState, PieceColor, TIME_CONTROLS, TimeControl } from '../types/chess';
import { t } from '../i18n/translations';
import { SETUP_V2, UX_POLISH } from '../config/featureFlags';
import { TurnTimerInput, sanitizeTurnMinutes } from './TurnTimerInput';

interface OnlineLobbyProps {
  lang: Language;
  defaultPlayerName: string;
  initialJoinCode?: string;
  roomState: OnlineRoomState | null;
  myColor: PieceColor | null;
  errorMsg: string | null;
  onClose: () => void;
  onCreateRoom: (
    playerName: string,
    timeControl: TimeControl,
    opts?: { sideChoice?: 'w' | 'b' | 'random'; turnMinutes?: number }
  ) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onToggleReady: (ready: boolean) => void;
  onLeaveRoom: () => void;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  lang,
  defaultPlayerName,
  initialJoinCode,
  roomState,
  myColor,
  errorMsg,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onLeaveRoom,
}) => {
  const [playerName, setPlayerName] = useState(defaultPlayerName || t(lang, 'defaultPlayerName'));
  const [joinCode, setJoinCode] = useState(initialJoinCode || '');
  const [sideChoice, setSideChoice] = useState<'w' | 'b' | 'random'>('w');
  const [turnMinutes, setTurnMinutes] = useState<number>(0);
  const [timeId, setTimeId] = useState('rapid10');
  const [copied, setCopied] = useState(false);

  const selectedTime = TIME_CONTROLS.find((tc) => tc.id === timeId) || TIME_CONTROLS[2];

  const handleCopy = async () => {
    if (!roomState) return;
    try {
      await navigator.clipboard.writeText(roomState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleShare = async () => {
    if (!roomState) return;
    const url = `${window.location.origin}?room=${roomState.roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: '3D CHESS BATTLE',
          text: `${t(lang, 'roomCode')}: ${roomState.roomCode}`,
          url,
        });
        return;
      } catch {
        // User canceled or unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignored
    }
  };

  const handleCreate = () => {
    if (SETUP_V2) {
      const sanitized = sanitizeTurnMinutes(turnMinutes).minutes;
      const tc: TimeControl = {
        id: sanitized > 0 ? `turn_${sanitized}m` : 'untimed',
        initialMs: sanitized * 60 * 1000,
        incrementMs: 0,
      };
      onCreateRoom(playerName, tc, { sideChoice, turnMinutes: sanitized });
    } else {
      onCreateRoom(playerName, selectedTime);
    }
  };

  const myPlayer = roomState && myColor ? roomState.players[myColor] : null;
  const oppColor: PieceColor | null = myColor ? (myColor === 'w' ? 'b' : 'w') : null;
  const oppPlayer = roomState && oppColor ? roomState.players[oppColor] : null;

  const roomTurnMinutes =
    roomState?.turnMinutes !== undefined
      ? roomState.turnMinutes
      : roomState
        ? Math.round((roomState.timeControl?.initialMs || 0) / 60000)
        : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div
        className={`w-full max-w-lg rounded-2xl bg-[#121620] border border-[#D4AF37]/30 p-5 sm:p-6 shadow-2xl space-y-5 overflow-y-auto custom-scrollbar ${
          UX_POLISH ? 'max-h-[88dvh] pb-6' : 'max-h-[90vh]'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-xl font-bold text-[#F3EFE6]">{t(lang, 'playOnline')}</h2>
          <button
            type="button"
            onClick={roomState ? onLeaveRoom : onClose}
            aria-label={t(lang, 'close')}
            className="p-2 rounded-lg text-[#9AA3B2] hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {!roomState ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'yourName')}</label>
              <input
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onFocus={(e) => {
                  const el = e.currentTarget;
                  window.setTimeout(() => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 180);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#181E2B] border border-white/12 text-base text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37] min-h-[46px]"
              />
            </div>

            {/* Host: Create Room */}
            <div className="p-4 rounded-xl bg-[#181E2B] border border-white/10 space-y-3.5">
              <div className="text-xs font-semibold text-[#D4AF37]">{t(lang, 'createRoom')}</div>

              {SETUP_V2 ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'chooseSide')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['w', 'b', 'random'] as const).map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => setSideChoice(s)}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-colors min-h-[44px] flex items-center justify-center text-center leading-tight ${
                            sideChoice === s
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                              : 'bg-[#121620] border-white/10 text-[#9AA3B2] hover:text-white'
                          }`}
                        >
                          {s === 'w'
                            ? t(lang, 'sideWhite')
                            : s === 'b'
                              ? t(lang, 'sideBlack')
                              : t(lang, 'sideRandom')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <TurnTimerInput
                    id="turn-timer-online"
                    value={turnMinutes}
                    onChange={setTurnMinutes}
                    lang={lang}
                  />
                </>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      type="button"
                      key={tc.id}
                      onClick={() => setTimeId(tc.id)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors min-h-[40px] ${
                        timeId === tc.id
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                          : 'bg-[#121620] border-white/10 text-[#9AA3B2]'
                      }`}
                    >
                      {t(lang, tc.id as 'untimed' | 'blitz5' | 'rapid10' | 'rapid15')}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleCreate}
                className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017] font-bold text-sm min-h-[46px]"
              >
                {t(lang, 'createRoom')}
              </button>
            </div>

            {/* Join Room (No setup inputs — host owns configuration) */}
            <div className="p-4 rounded-xl bg-[#181E2B] border border-white/10 space-y-3">
              <div className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'joinRoom')}</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder={t(lang, 'enterRoomCode')}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onFocus={(e) => {
                    const el = e.currentTarget;
                    window.setTimeout(() => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 180);
                  }}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#121620] border border-white/12 text-base font-mono-tabular tracking-widest uppercase text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37] min-h-[46px]"
                />
                <button
                  type="button"
                  onClick={() => onJoinRoom(joinCode, playerName)}
                  disabled={joinCode.trim().length < 4}
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#3b82f6] text-white font-bold text-sm disabled:opacity-45 min-h-[46px]"
                >
                  {t(lang, 'joinRoom')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Room Code Display */}
            <div className="p-4 rounded-xl bg-[#181E2B] border border-[#D4AF37]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-[#9AA3B2]">{t(lang, 'roomCode')}</div>
                <div className="font-mono-tabular text-2xl font-bold tracking-[0.25em] text-[#D4AF37]">
                  {roomState.roomCode}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#121620] border border-white/15 text-xs font-semibold text-[#F3EFE6] hover:border-[#D4AF37] min-h-[40px]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t(lang, 'copied') : t(lang, 'copyCode')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#121620] border border-white/15 text-xs font-semibold text-[#F3EFE6] hover:border-[#D4AF37] min-h-[40px]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{t(lang, 'shareInvite')}</span>
                </button>
              </div>
            </div>

            {/* Read-Only Locked Match Configuration Summary (Mục 5 & Mục 6) */}
            {SETUP_V2 && (
              <div
                data-testid="room-readonly-summary"
                className="p-3.5 rounded-xl bg-[#181E2B] border border-white/12 space-y-2.5"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9AA3B2]">
                  <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>{t(lang, 'readOnlyConfigNotice')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="px-3 py-2 rounded-lg bg-[#121620] border border-white/8">
                    <div className="text-[11px] text-[#9AA3B2]">{t(lang, 'yourSide')}</div>
                    <div className="text-xs font-bold text-[#F3EFE6] mt-0.5">
                      {myColor === 'w' ? t(lang, 'sideWhite') : myColor === 'b' ? t(lang, 'sideBlack') : '—'}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-[#121620] border border-white/8">
                    <div className="text-[11px] text-[#9AA3B2] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#D4AF37]" />
                      <span>{t(lang, 'turnTimerLabel')}</span>
                    </div>
                    <div className="text-xs font-bold text-[#D4AF37] font-mono-tabular mt-0.5">
                      {roomTurnMinutes > 0 ? `${roomTurnMinutes} ${t(lang, 'minutesUnit')}` : t(lang, 'untimed')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Players Ready Roster */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#181E2B] border border-white/12 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#9AA3B2]">
                  <span>{t(lang, 'sideWhite')}</span>
                  <Shield className={`w-3.5 h-3.5 ${SETUP_V2 ? 'text-[#EF4444]' : 'text-[#D4AF37]'}`} />
                </div>
                <div className="text-sm font-bold text-[#F3EFE6] truncate">
                  {roomState.players.w?.name || '—'}
                </div>
                <div className={`text-xs font-semibold ${roomState.players.w?.ready ? 'text-emerald-400' : 'text-[#9AA3B2]'}`}>
                  {roomState.players.w ? (roomState.players.w.ready ? t(lang, 'ready') : t(lang, 'notReady')) : t(lang, 'waitingOpponent')}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#181E2B] border border-white/12 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#9AA3B2]">
                  <span>{t(lang, 'sideBlack')}</span>
                  <Shield className="w-3.5 h-3.5 text-[#A855F7]" />
                </div>
                <div className="text-sm font-bold text-[#F3EFE6] truncate">
                  {roomState.players.b?.name || '—'}
                </div>
                <div className={`text-xs font-semibold ${roomState.players.b?.ready ? 'text-emerald-400' : 'text-[#9AA3B2]'}`}>
                  {roomState.players.b ? (roomState.players.b.ready ? t(lang, 'ready') : t(lang, 'notReady')) : t(lang, 'waitingOpponent')}
                </div>
              </div>
            </div>

            <div className="text-xs text-center text-[#9AA3B2]">
              {oppPlayer ? t(lang, 'clickReady') : t(lang, 'waitingOpponent')}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="px-4 py-3 rounded-xl bg-[#181E2B] border border-white/15 text-xs font-semibold text-[#9AA3B2] hover:text-white min-h-[46px]"
              >
                {t(lang, 'cancelRoom')}
              </button>
              <button
                type="button"
                onClick={() => onToggleReady(!myPlayer?.ready)}
                disabled={!myPlayer}
                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 min-h-[46px] transition-colors ${
                  myPlayer?.ready
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017]'
                }`}
              >
                <Swords className="w-4 h-4" />
                <span>{myPlayer?.ready ? t(lang, 'ready') : t(lang, 'clickReady')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
