import React from 'react';
import { ArrowRight, RotateCcw, Home, CheckCircle2 } from 'lucide-react';
import { Language } from '../types/chess';
import { LEARN_LESSONS, LessonSpec, t, TranslationKey } from '../i18n/translations';
import { UX_POLISH } from '../config/featureFlags';

interface LearnChessHUDProps {
  lang: Language;
  lessonIndex: number;
  solved: boolean;
  onSelectLesson: (idx: number) => void;
  onResetLesson: () => void;
  onReturnMenu: () => void;
}

export const LearnChessHUD: React.FC<LearnChessHUDProps> = ({
  lang,
  lessonIndex,
  solved,
  onSelectLesson,
  onResetLesson,
  onReturnMenu,
}) => {
  const lesson: LessonSpec = LEARN_LESSONS[lessonIndex] || LEARN_LESSONS[0];

  return (
    <>
      <div
        className={`fixed left-4 right-4 z-20 pointer-events-none flex justify-center ${
          UX_POLISH ? 'top-[max(0.75rem,env(safe-area-inset-top))]' : 'top-4'
        }`}
      >
        <div className="pointer-events-auto max-w-2xl w-full rounded-2xl bg-[#121620]/95 border border-[#D4AF37]/30 p-4 shadow-2xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#D4AF37]">
              {t(lang, lesson.titleKey as TranslationKey)}
            </h2>
            <button
              onClick={onReturnMenu}
              className="px-3 py-1.5 rounded-lg bg-[#181E2B] text-xs font-semibold text-[#F3EFE6] hover:bg-[#232B3D] flex items-center gap-1.5 min-h-[36px]"
            >
              <Home className="w-3.5 h-3.5" />
              <span>{t(lang, 'returnMenu')}</span>
            </button>
          </div>
          <p className="text-xs sm:text-sm text-[#E5E7EB] leading-relaxed">
            {t(lang, lesson.descKey as TranslationKey)}
          </p>
          {solved && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pt-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>{t(lang, 'lessonSolved')}</span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`fixed left-1/2 -translate-x-1/2 z-20 max-w-[95vw] ${
          UX_POLISH ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]' : 'bottom-4'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#121620]/95 border border-[#D4AF37]/25 shadow-2xl">
          <div className="flex items-center gap-1">
            {LEARN_LESSONS.map((l, idx) => (
              <button
                key={l.id}
                onClick={() => onSelectLesson(idx)}
                className={`w-9 h-9 rounded-lg text-xs font-bold font-mono-tabular transition-colors ${
                  idx === lessonIndex
                    ? 'bg-[#D4AF37] text-[#0D1017]'
                    : 'bg-[#181E2B] text-[#9AA3B2] hover:text-white'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <button
            onClick={onResetLesson}
            className="px-3 py-2 rounded-xl bg-[#181E2B] hover:bg-[#232B3D] text-xs font-semibold text-[#F3EFE6] flex items-center gap-1.5 min-h-[40px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t(lang, 'resetLesson')}</span>
          </button>

          {lessonIndex < LEARN_LESSONS.length - 1 && (
            <button
              onClick={() => onSelectLesson(lessonIndex + 1)}
              className="px-3.5 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#e5c150] text-[#0D1017] text-xs font-bold flex items-center gap-1.5 min-h-[40px]"
            >
              <span>{t(lang, 'nextLesson')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
};
