import React, { useEffect, useRef, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Language } from '../types/chess';
import { t } from '../i18n/translations';

export const MAX_TURN_SECONDS = 3600;

export function sanitizeTurnSeconds(raw: string | number): {
  seconds: number;
  clamped: boolean;
  displayValue: string;
} {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { seconds: 0, clamped: false, displayValue: '0' };
    }
    const whole = Math.floor(raw);
    if (whole > MAX_TURN_SECONDS) {
      return {
        seconds: MAX_TURN_SECONDS,
        clamped: true,
        displayValue: String(MAX_TURN_SECONDS),
      };
    }
    return { seconds: whole, clamped: false, displayValue: String(whole) };
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.startsWith('-')) {
    return { seconds: 0, clamped: false, displayValue: '' };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { seconds: 0, clamped: false, displayValue: '' };
  }

  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { seconds: 0, clamped: false, displayValue: '0' };
  }

  if (parsed > MAX_TURN_SECONDS) {
    return {
      seconds: MAX_TURN_SECONDS,
      clamped: true,
      displayValue: String(MAX_TURN_SECONDS),
    };
  }

  return { seconds: parsed, clamped: false, displayValue: String(parsed) };
}

type PresetMode = 'unlimited' | '10s' | '20s' | 'custom';

interface TurnTimerSecondsInputProps {
  value: number;
  onChange: (seconds: number) => void;
  lang: Language;
  id?: string;
}

export const TurnTimerSecondsInput: React.FC<TurnTimerSecondsInputProps> = ({
  value,
  onChange,
  lang,
  id = 'turn-timer-seconds-input',
}) => {
  const [preset, setPreset] = useState<PresetMode>(() => {
    if (value === 10) return '10s';
    if (value === 20) return '20s';
    if (value > 0) return 'custom';
    return 'unlimited';
  });
  const [text, setText] = useState<string>(value > 0 ? String(value) : '30');
  const [clampedNotice, setClampedNotice] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prevValueRef = useRef<number>(value);

  useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    setPreset((curr) => {
      if (curr === 'custom') return curr;
      if (value === 0) return 'unlimited';
      if (value === 10) return '10s';
      if (value === 20) return '20s';
      return 'custom';
    });
  }, [value]);

  const selectPreset = (next: PresetMode) => {
    setClampedNotice(false);
    setPreset(next);
    if (next === 'unlimited') {
      onChange(0);
    } else if (next === '10s') {
      onChange(10);
    } else if (next === '20s') {
      onChange(20);
    } else {
      const sanitized = sanitizeTurnSeconds(text === '' || text === '0' ? '30' : text);
      const nextSec = sanitized.seconds > 0 ? sanitized.seconds : 30;
      setText(String(nextSec));
      onChange(nextSec);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }, 60);
    }
  };

  const applyRaw = (raw: string) => {
    const res = sanitizeTurnSeconds(raw);
    setText(res.displayValue);
    setClampedNotice(res.clamped);
    onChange(res.seconds);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#9AA3B2]">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{t(lang, 'turnTimerSecondsTitle')}</span>
        </span>
        <span className="text-[11px] font-mono-tabular text-[#D4AF37]">
          {value > 0 ? `${value} ${t(lang, 'secondsUnit')}` : t(lang, 'untimed')}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { key: 'unlimited', label: t(lang, 'untimed') },
            { key: '10s', label: t(lang, 'turnPreset10s') },
            { key: '20s', label: t(lang, 'turnPreset20s') },
            { key: 'custom', label: t(lang, 'turnPresetCustom') },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => selectPreset(item.key)}
            className={`py-2.5 px-2.5 rounded-xl text-xs font-semibold border transition-colors min-h-[44px] whitespace-nowrap shrink-0 flex items-center justify-center ${
              preset === item.key
                ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                : 'bg-[#121620] border-white/10 text-[#9AA3B2] hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="space-y-2 pt-1">
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              value={text}
              placeholder={t(lang, 'turnTimerCustomPlaceholder')}
              onFocus={(e) => {
                if (text === '0') setText('');
                const el = e.currentTarget;
                window.setTimeout(() => {
                  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
                }, 180);
              }}
              onBlur={() => {
                const res = sanitizeTurnSeconds(text);
                setText(String(res.seconds));
                setClampedNotice(res.clamped);
                onChange(res.seconds);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text');
                applyRaw(pasted);
              }}
              onChange={(e) => {
                applyRaw(e.target.value);
              }}
              className="w-full pl-3.5 pr-16 py-2.5 rounded-xl bg-[#121620] border border-white/15 text-base font-mono-tabular text-[#F3EFE6] placeholder:text-[#9AA3B2]/50 focus:outline-none focus:border-[#D4AF37] min-h-[46px]"
            />
            <span className="pointer-events-none absolute right-3.5 text-xs font-semibold text-[#9AA3B2]">
              {t(lang, 'secondsUnit')}
            </span>
          </div>
          <p className="text-[11px] text-[#9AA3B2] leading-snug">{t(lang, 'turnTimerSecondsHelper')}</p>
        </div>
      )}

      {clampedNotice && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{t(lang, 'turnTimerSecondsClamped')}</span>
        </div>
      )}
    </div>
  );
};
