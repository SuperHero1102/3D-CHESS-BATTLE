import React, { useState } from 'react';
import { X, Swords, Shield } from 'lucide-react';
import { AIDifficulty, Language, PieceColor, TIME_CONTROLS, TimeControl } from '../types/chess';
import { t } from '../i18n/translations';
import { SETUP_V2, UX_POLISH } from '../config/featureFlags';
import { TurnTimerInput, sanitizeTurnMinutes } from './TurnTimerInput';

interface MatchSetupModalProps {
  mode: 'ai' | 'local';
  lang: Language;
  defaultPlayerName: string;
  onClose: () => void;
  onStartAI: (opts: {
    side: PieceColor;
    difficulty: AIDifficulty;
    timeControl: TimeControl;
    turnMinutes?: number;
  }) => void;
  onStartLocal: (opts: {
    whiteName: string;
    blackName: string;
    timeControl: TimeControl;
    turnMinutes?: number;
  }) => void;
}

export const MatchSetupModal: React.FC<MatchSetupModalProps> = ({
  mode,
  lang,
  defaultPlayerName,
  onClose,
  onStartAI,
  onStartLocal,
}) => {
  const [sideChoice, setSideChoice] = useState<'w' | 'b' | 'random'>('w');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [timeId, setTimeId] = useState<string>('rapid10');
  const [turnMinutes, setTurnMinutes] = useState<number>(0);
  const [whiteName, setWhiteName] = useState<string>(defaultPlayerName || t(lang, 'player1Name'));
  const [blackName, setBlackName] = useState<string>(t(lang, 'player2Name'));

  const selectedTime = TIME_CONTROLS.find((tc) => tc.id === timeId) || TIME_CONTROLS[2];

  const handleStart = () => {
    if (SETUP_V2) {
      const sanitized = sanitizeTurnMinutes(turnMinutes).minutes;
      const perTurnTc: TimeControl = {
        id: sanitized > 0 ? `turn_${sanitized}m` : 'untimed',
        initialMs: sanitized * 60 * 1000,
        incrementMs: 0,
      };
      if (mode === 'ai') {
        const resolvedSide: PieceColor =
          sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;
        onStartAI({
          side: resolvedSide,
          difficulty,
          timeControl: perTurnTc,
          turnMinutes: sanitized,
        });
      } else {
        onStartLocal({
          whiteName: t(lang, 'sideWhite'),
          blackName: t(lang, 'sideBlack'),
          timeControl: perTurnTc,
          turnMinutes: sanitized,
        });
      }
      return;
    }

    if (mode === 'ai') {
      const resolvedSide: PieceColor =
        sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;
      onStartAI({ side: resolvedSide, difficulty, timeControl: selectedTime });
    } else {
      let wName = whiteName.trim() || t(lang, 'player1Name');
      let bName = blackName.trim() || t(lang, 'player2Name');
      if (sideChoice === 'b') {
        [wName, bName] = [bName, wName];
      } else if (sideChoice === 'random' && Math.random() < 0.5) {
        [wName, bName] = [bName, wName];
      }
      onStartLocal({ whiteName: wName, blackName: bName, timeControl: selectedTime });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div
        className={`w-full max-w-lg rounded-2xl bg-[#121620] border border-[#D4AF37]/30 p-5 sm:p-6 shadow-2xl space-y-5 overflow-y-auto custom-scrollbar ${
          UX_POLISH ? 'max-h-[88dvh] pb-6' : 'max-h-[90vh]'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-xl font-bold text-[#F3EFE6]">
            {mode === 'ai' ? t(lang, 'playAI') : t(lang, 'playLocal')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'close')}
            className="p-2 rounded-lg text-[#9AA3B2] hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Choose Side: shown in AI mode always, or in Local mode only when SETUP_V2 is false */}
        {(mode === 'ai' || !SETUP_V2) && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'chooseSide')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['w', 'b', 'random'] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSideChoice(s)}
                  className={`py-2.5 px-2.5 rounded-xl text-xs font-semibold border transition-colors min-h-[46px] flex items-center justify-center text-center leading-tight ${
                    sideChoice === s
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                      : 'bg-[#181E2B] border-white/10 text-[#9AA3B2] hover:text-white'
                  }`}
                >
                  {s === 'w' ? t(lang, 'sideWhite') : s === 'b' ? t(lang, 'sideBlack') : t(lang, 'sideRandom')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Difficulty or Local Fixed Factions / Legacy Names */}
        {mode === 'ai' ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'difficulty')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors min-h-[44px] ${
                    difficulty === d
                      ? 'bg-[#2563EB]/20 border-[#60A5FA] text-white'
                      : 'bg-[#181E2B] border-white/10 text-[#9AA3B2] hover:text-white'
                  }`}
                >
                  {t(lang, d)}
                </button>
              ))}
            </div>
          </div>
        ) : SETUP_V2 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#181E2B] border border-[#EF4444]/35 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#FCA5A5] uppercase tracking-wider">
                  {t(lang, 'firstMoverBadge')}
                </div>
                <div className="text-sm font-bold text-[#F3EFE6] mt-0.5">{t(lang, 'sideWhite')}</div>
              </div>
              <Shield className="w-5 h-5 text-[#EF4444] shrink-0" />
            </div>
            <div className="p-3.5 rounded-xl bg-[#181E2B] border border-[#A855F7]/35 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#D8B4FE] uppercase tracking-wider">
                  {t(lang, 'secondMoverBadge')}
                </div>
                <div className="text-sm font-bold text-[#F3EFE6] mt-0.5">{t(lang, 'sideBlack')}</div>
              </div>
              <Shield className="w-5 h-5 text-[#A855F7] shrink-0" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'player1Name')}</label>
              <input
                type="text"
                maxLength={24}
                value={whiteName}
                onChange={(e) => setWhiteName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#181E2B] border border-white/12 text-base text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'player2Name')}</label>
              <input
                type="text"
                maxLength={24}
                value={blackName}
                onChange={(e) => setBlackName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#181E2B] border border-white/12 text-base text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        )}

        {/* Shared Turn Timer (SETUP_V2) or Legacy Preset Time Control */}
        {SETUP_V2 ? (
          <div className="p-4 rounded-xl bg-[#181E2B] border border-white/10">
            <TurnTimerInput
              id={`turn-timer-${mode}`}
              value={turnMinutes}
              onChange={setTurnMinutes}
              lang={lang}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#9AA3B2]">{t(lang, 'timeControl')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  type="button"
                  key={tc.id}
                  onClick={() => setTimeId(tc.id)}
                  className={`py-2.5 px-2.5 rounded-xl text-xs font-semibold border transition-colors min-h-[44px] ${
                    timeId === tc.id
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                      : 'bg-[#181E2B] border-white/10 text-[#9AA3B2] hover:text-white'
                  }`}
                >
                  {t(lang, tc.id as 'untimed' | 'blitz5' | 'rapid10' | 'rapid15')}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017] font-bold text-sm flex items-center justify-center gap-2 transition-colors min-h-[48px]"
        >
          <Swords className="w-4 h-4" />
          <span>{t(lang, 'startBattle')}</span>
        </button>
      </div>
    </div>
  );
};
