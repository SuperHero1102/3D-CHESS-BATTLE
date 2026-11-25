import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Language } from '../types/chess';
import { t } from '../i18n/translations';

export const MAX_TURN_MINUTES = 180;

export function sanitizeTurnMinutes(raw: string | number): {
  minutes: number;
  clamped: boolean;
  displayValue: string;
} {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { minutes: 0, clamped: false, displayValue: '0' };
    }
    const whole = Math.floor(raw);
    if (whole > MAX_TURN_MINUTES) {
      return {
        minutes: MAX_TURN_MINUTES,
        clamped: true,
        displayValue: String(MAX_TURN_MINUTES),
      };
    }
    return { minutes: whole, clamped: false, displayValue: String(whole) };
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.startsWith('-')) {
    return { minutes: 0, clamped: false, displayValue: '' };
  }

  // Non-numeric text or weird pasted text -> treat as 0 (Unlimited)
  if (!/^\d+$/.test(trimmed)) {
    return { minutes: 0, clamped: false, displayValue: '' };
  }

  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { minutes: 0, clamped: false, displayValue: '0' };
  }

  if (parsed > MAX_TURN_MINUTES) {
    return {
      minutes: MAX_TURN_MINUTES,
      clamped: true,
      displayValue: String(MAX_TURN_MINUTES),
    };
  }

  return { minutes: parsed, clamped: false, displayValue: String(parsed) };
}

interface TurnTimerInputProps {
  value: number;
  onChange: (minutes: number) => void;
  lang: Language;
  id?: string;
}

export const TurnTimerInput: React.FC<TurnTimerInputProps> = ({
  value,
  onChange,
  lang,
  id = 'turn-timer-input',
}) => {
  const [text, setText] = useState<string>(value > 0 ? String(value) : '0');
  const [clampedNotice, setClampedNotice] = useState(false);

  useEffect(() => {
    const normalized = sanitizeTurnMinutes(value);
    setText((prev) => {
      if (prev === '' && normalized.minutes === 0) return prev;
      if (Number(prev) === normalized.minutes && /^\d+$/.test(prev)) return prev;
      return normalized.displayValue;
    });
  }, [value]);

  const applyRaw = (raw: string) => {
    const res = sanitizeTurnMinutes(raw);
    setText(res.displayValue);
    setClampedNotice(res.clamped);
    onChange(res.minutes);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex items-center justify-between gap-2 text-xs font-semibold text-[#9AA3B2]"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{t(lang, 'turnTimerLabel')}</span>
        </span>
        <span className="text-[11px] font-mono-tabular text-[#D4AF37]">
          {value > 0 ? `${value} ${t(lang, 'minutesUnit')}` : t(lang, 'untimed')}
        </span>
      </label>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        placeholder="0"
        onFocus={(e) => {
          if (text === '0') setText('');
          const el = e.currentTarget;
          window.setTimeout(() => {
            el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          }, 180);
        }}
        onBlur={() => {
          const res = sanitizeTurnMinutes(text);
          setText(String(res.minutes));
          setClampedNotice(res.clamped);
          onChange(res.minutes);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData('text');
          applyRaw(pasted);
        }}
        onChange={(e) => {
          applyRaw(e.target.value);
        }}
        className="w-full px-3.5 py-2.5 rounded-xl bg-[#121620] border border-white/15 text-base font-mono-tabular text-[#F3EFE6] placeholder:text-[#9AA3B2]/50 focus:outline-none focus:border-[#D4AF37] min-h-[46px]"
      />

      <p className="text-[11px] text-[#9AA3B2] leading-snug">{t(lang, 'turnTimerHelper')}</p>

      {clampedNotice && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{t(lang, 'turnTimerClamped')}</span>
        </div>
      )}
    </div>
  );
};
