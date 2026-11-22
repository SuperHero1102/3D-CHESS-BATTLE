import React, { useEffect, useState } from 'react';
import { X, Trophy, History, LogIn } from 'lucide-react';
import { User } from 'firebase/auth';
import { Language, LeaderboardEntry, MatchRecord } from '../types/chess';
import { t } from '../i18n/translations';
import { fetchLeaderboard, fetchUserMatches } from '../firebase/firebaseClient';

interface LeaderboardModalProps {
  lang: Language;
  user: User | null;
  onSignIn: () => void;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  lang,
  user,
  onSignIn,
  onClose,
}) => {
  const [tab, setTab] = useState<'global' | 'history'>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        if (tab === 'global') {
          const data = await fetchLeaderboard(50);
          if (active) setEntries(data);
        } else if (user) {
          const data = await fetchUserMatches(user.uid, 25);
          if (active) setMatches(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tab, user]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#121620] border border-[#D4AF37]/30 p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-bold text-[#F3EFE6]">{t(lang, 'leaderboard')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#9AA3B2] hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#181E2B]">
          <button
            onClick={() => setTab('global')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 min-h-[40px] ${
              tab === 'global' ? 'bg-[#D4AF37] text-[#0D1017]' : 'text-[#9AA3B2] hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>{t(lang, 'leaderboardGlobal')}</span>
          </button>
          <button
            onClick={() => setTab('history')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 min-h-[40px] ${
              tab === 'history' ? 'bg-[#D4AF37] text-[#0D1017]' : 'text-[#9AA3B2] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t(lang, 'matchHistory')}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[260px]">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#9AA3B2]">{t(lang, 'loadingData')}</div>
          ) : tab === 'global' ? (
            entries.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#9AA3B2]">{t(lang, 'noMatchesYet')}</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-[#9AA3B2]">
                    <th className="py-2.5 px-2">{t(lang, 'rank')}</th>
                    <th className="py-2.5 px-2">{t(lang, 'player')}</th>
                    <th className="py-2.5 px-2 text-right">{t(lang, 'eloLabel')}</th>
                    <th className="py-2.5 px-2 text-right">{t(lang, 'winLossDraw')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {entries.map((entry, idx) => {
                    const isMe = user?.uid === entry.uid;
                    return (
                      <tr key={entry.uid} className={isMe ? 'bg-[#D4AF37]/10' : ''}>
                        <td className="py-2.5 px-2 font-mono-tabular font-bold text-[#D4AF37]">#{idx + 1}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: `hsl(${entry.avatarHue}, 55%, 38%)` }}
                            >
                              {entry.displayName.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="font-semibold text-[#F3EFE6] truncate max-w-[180px]">
                              {entry.displayName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-tabular font-bold text-[#F3EFE6]">
                          {entry.elo}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-tabular text-xs text-[#9AA3B2]">
                          {entry.wins} / {entry.losses} / {entry.draws}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : !user ? (
            <div className="py-10 text-center space-y-4">
              <p className="text-xs text-[#9AA3B2] max-w-sm mx-auto">{t(lang, 'signInToSave')}</p>
              <button
                onClick={onSignIn}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#0D1017] text-xs font-bold"
              >
                <LogIn className="w-4 h-4" />
                <span>{t(lang, 'signInGoogle')}</span>
              </button>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#9AA3B2]">{t(lang, 'noMatchesYet')}</div>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <div
                  key={m.matchId}
                  className="p-3 rounded-xl bg-[#181E2B] border border-white/10 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#F3EFE6]">
                      vs {m.opponentName}
                      <span className="ml-2 text-xs text-[#9AA3B2] uppercase">({m.mode})</span>
                    </div>
                    <div className="text-xs text-[#9AA3B2]">
                      {m.movesCount} {t(lang, 'movesCount')} · {m.durationSec}s · {m.reason}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <div
                      className={`text-xs font-bold uppercase ${
                        m.result === 'win'
                          ? 'text-emerald-400'
                          : m.result === 'loss'
                            ? 'text-rose-400'
                            : 'text-[#D4AF37]'
                      }`}
                    >
                      {m.result}
                    </div>
                    {m.eloChange !== 0 && (
                      <div className="text-xs text-[#9AA3B2]">
                        {m.eloChange > 0 ? `+${m.eloChange}` : m.eloChange} ELO
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
