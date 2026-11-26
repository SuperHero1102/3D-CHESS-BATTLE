import React, { useState } from 'react';
import {
  Bot,
  Users,
  Globe,
  BookOpen,
  Trophy,
  Settings,
  Download,
  LogIn,
  LogOut,
  Shield,
  Crown,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { GameSettings, LeaderboardEntry } from '../types/chess';
import { t } from '../i18n/translations';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface MainMenuProps {
  settings: GameSettings;
  user: User | null;
  profile: LeaderboardEntry | null;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSelectMode: (mode: 'ai' | 'local' | 'online' | 'learn') => void;
  onOpenLeaderboard: () => void;
  onOpenSettings: () => void;
  onToggleLanguage: () => void;
}

import { UX_POLISH } from '../config/featureFlags';

export const MainMenu: React.FC<MainMenuProps> = ({
  settings,
  user,
  profile,
  authBusy,
  onSignIn,
  onSignOut,
  onSelectMode,
  onOpenLeaderboard,
  onOpenSettings,
  onToggleLanguage,
}) => {
  const lang = settings.language;
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [logoError, setLogoError] = useState(false);

  return (
    <div
      className={`fixed inset-0 z-20 flex flex-col justify-between pointer-events-none p-4 sm:p-6 md:p-8 ${
        UX_POLISH
          ? 'pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto'
          : ''
      }`}
    >
      {/* Top Bar: Account + Language + Quick Actions */}
      <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3 bg-[#121620]/92 border border-[#D4AF37]/25 rounded-xl px-3.5 py-2 shadow-lg">
          {user ? (
            <>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: `hsl(${profile?.avatarHue ?? 215}, 55%, 38%)` }}
              >
                {(profile?.displayName || user.displayName || 'C').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#F3EFE6] truncate max-w-[150px] sm:max-w-[200px]">
                  {profile?.displayName || user.displayName}
                </div>
                <div className="text-xs text-[#9AA3B2] font-mono-tabular">
                  {t(lang, 'eloLabel')}: <span className="text-[#D4AF37] font-semibold">{profile?.elo ?? 1200}</span>
                  <span className="mx-1.5">·</span>
                  <span>{profile?.wins ?? 0}W / {profile?.losses ?? 0}L</span>
                </div>
              </div>
              <button
                onClick={onSignOut}
                title={t(lang, 'signOut')}
                className="ml-1 p-2 rounded-lg text-[#9AA3B2] hover:text-white hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-lg bg-[#1C2333] border border-white/10 flex items-center justify-center text-[#9AA3B2] shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-xs text-[#9AA3B2] pr-1 hidden sm:block">{t(lang, 'guestMode')}</div>
              <button
                onClick={onSignIn}
                disabled={authBusy}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#D4AF37] text-[#0D1017] text-xs font-bold hover:bg-[#e5c150] transition-colors whitespace-nowrap shrink-0 min-h-[40px] disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t(lang, 'signInGoogle')}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && (isInstallable || isIOS) && (
            <button
              onClick={() => (isInstallable ? install() : setShowIOSGuide(true))}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161B26]/92 border border-[#D4AF37]/30 text-xs font-semibold text-[#F3EFE6] hover:border-[#D4AF37] transition-colors min-h-[44px] whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-[#D4AF37]" />
              <span className="hidden sm:inline">{t(lang, 'installApp')}</span>
            </button>
          )}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161B26]/92 border border-white/12 text-xs font-semibold text-[#F3EFE6] hover:border-[#D4AF37]/50 transition-colors min-h-[44px] whitespace-nowrap"
          >
            <Trophy className="w-4 h-4 text-[#D4AF37]" />
            <span>{t(lang, 'leaderboard')}</span>
          </button>
          <button
            onClick={onToggleLanguage}
            className="px-3 py-2 rounded-xl bg-[#161B26]/92 border border-white/12 text-xs font-bold text-[#F3EFE6] hover:border-[#D4AF37]/50 transition-colors min-h-[44px] min-w-[44px]"
          >
            {lang === 'vi' ? 'VI' : 'EN'}
          </button>
          <button
            onClick={onOpenSettings}
            aria-label={t(lang, 'settings')}
            className="p-2.5 rounded-xl bg-[#161B26]/92 border border-white/12 text-[#F3EFE6] hover:border-[#D4AF37]/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Center Hero Title + Kingdom Faceoff Spacer */}
      <div className="flex flex-col items-center text-center my-auto py-4">
        <div className="pointer-events-auto inline-flex flex-col items-center px-6 py-4 rounded-2xl bg-[#0D1017]/82 border border-[#D4AF37]/25 shadow-2xl">
          <div className="mb-2.5">
            {!logoError ? (
              <div className="w-16 h-16 sm:w-20 sm:h-20 p-0.5 bg-[#D4AF37]/40 [clip-path:polygon(19%_0%,81%_0%,100%_19%,100%_81%,81%_100%,19%_100%,0%_81%,0%_19%)] shadow-xl">
                <img
                  src="/assets/aistudio/avtGame_ff508b5a.jpg"
                  alt={t(lang, 'appName')}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-cover [clip-path:polygon(19%_0%,81%_0%,100%_19%,100%_81%,81%_100%,19%_100%,0%_81%,0%_19%)]"
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#161B26] border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37]">
                <Crown className="w-8 h-8" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-[#D4AF37] mb-1">
            <Crown className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs font-semibold tracking-[0.22em] text-[#9AA3B2]">
              {t(lang, 'whiteKingdom')} · {t(lang, 'blackKingdom')}
            </span>
            <Crown className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold tracking-wider text-[#F3EFE6]">
            {t(lang, 'appName')}
          </h1>
          <p className="mt-2 text-xs sm:text-sm font-medium tracking-[0.16em] text-[#D4AF37]">
            {t(lang, 'tagline')}
          </p>
        </div>
      </div>

      {/* Bottom Mode Selection Grid */}
      <div className="pointer-events-auto max-w-5xl w-full mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => onSelectMode('ai')}
            className="group text-left p-4 rounded-xl bg-[#121620]/94 border border-[#D4AF37]/35 hover:border-[#D4AF37] hover:bg-[#192030] transition-all shadow-lg min-h-[88px] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-[#F3EFE6] group-hover:text-[#D4AF37] transition-colors">
                {t(lang, 'playAI')}
              </span>
              <Bot className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <p className="text-xs text-[#9AA3B2] mt-1.5">{t(lang, 'playAIDesc')}</p>
          </button>

          <button
            onClick={() => onSelectMode('local')}
            className="group text-left p-4 rounded-xl bg-[#121620]/94 border border-white/15 hover:border-[#D4AF37] hover:bg-[#192030] transition-all shadow-lg min-h-[88px] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-[#F3EFE6] group-hover:text-[#D4AF37] transition-colors">
                {t(lang, 'playLocal')}
              </span>
              <Users className="w-5 h-5 text-[#60A5FA]" />
            </div>
            <p className="text-xs text-[#9AA3B2] mt-1.5">{t(lang, 'playLocalDesc')}</p>
          </button>

          <button
            onClick={() => onSelectMode('online')}
            className="group text-left p-4 rounded-xl bg-[#121620]/94 border border-white/15 hover:border-[#D4AF37] hover:bg-[#192030] transition-all shadow-lg min-h-[88px] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-[#F3EFE6] group-hover:text-[#D4AF37] transition-colors">
                {t(lang, 'playOnline')}
              </span>
              <Globe className="w-5 h-5 text-[#A855F7]" />
            </div>
            <p className="text-xs text-[#9AA3B2] mt-1.5">{t(lang, 'playOnlineDesc')}</p>
          </button>

          <button
            onClick={() => onSelectMode('learn')}
            className="group text-left p-4 rounded-xl bg-[#121620]/94 border border-white/15 hover:border-[#D4AF37] hover:bg-[#192030] transition-all shadow-lg min-h-[88px] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-[#F3EFE6] group-hover:text-[#D4AF37] transition-colors">
                {t(lang, 'learnChess')}
              </span>
              <BookOpen className="w-5 h-5 text-[#34D399]" />
            </div>
            <p className="text-xs text-[#9AA3B2] mt-1.5">{t(lang, 'learnChessDesc')}</p>
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-sm w-full rounded-xl bg-[#161B26] border border-[#D4AF37]/30 p-6 space-y-4">
            <h3 className="font-display text-lg text-[#D4AF37]">{t(lang, 'installApp')}</h3>
            <p className="text-sm text-[#F3EFE6]">{t(lang, 'installIOSHint')}</p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-[#0D1017] font-bold text-sm"
            >
              {t(lang, 'close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
