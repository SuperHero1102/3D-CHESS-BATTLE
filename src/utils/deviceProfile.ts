const FG_ACTIVE_KEY = 'chess_battle_fg_active_v1';
const CRASH_COUNT_KEY = 'chess_battle_crash_count_v1';
const SAFE_MODE_KEY = 'chess_battle_safe_mode_v1';

let cachedSafeMode: boolean | null = null;
let bootGuardInitialized = false;

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ desktop mode reports Macintosh / MacIntel with touch points
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) {
    return true;
  }
  return false;
}

export function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

export function isConstrainedDevice(): boolean {
  return isIOSDevice() || isCoarsePointerDevice();
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function safeSessionGet(key: string): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage restriction errors (e.g. strict Safari Private Mode / iframe)
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Ignore storage restriction errors
  }
}

/**
 * Initializes the iOS WebKit crash-loop guard once per page load.
 * If the previous foreground session terminated abruptly without `pagehide`
 * (typical of iOS JetSam / GPU process termination), activates Safe Mode for
 * this session so WebGL immediately boots in minimal-VRAM configuration.
 */
export function initBootCrashGuard(): boolean {
  if (cachedSafeMode !== null && bootGuardInitialized) {
    return cachedSafeMode;
  }
  bootGuardInitialized = true;

  if (typeof window === 'undefined') {
    cachedSafeMode = false;
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('safe') === '1') {
    cachedSafeMode = true;
    safeSessionSet(SAFE_MODE_KEY, '1');
    return true;
  }
  if (params.get('safe') === '0') {
    cachedSafeMode = false;
    safeSessionSet(SAFE_MODE_KEY, '0');
    safeSessionSet(CRASH_COUNT_KEY, '0');
    safeLocalSet(SAFE_MODE_KEY, '0');
    return false;
  }

  const wasSessionSafe = safeSessionGet(SAFE_MODE_KEY) === '1';
  const wasPersistedSafe = safeLocalGet(SAFE_MODE_KEY) === '1';
  const prevFgActive = safeSessionGet(FG_ACTIVE_KEY) === '1';
  let crashCount = parseInt(safeSessionGet(CRASH_COUNT_KEY) || '0', 10);
  if (!Number.isFinite(crashCount) || crashCount < 0) crashCount = 0;

  if (prevFgActive) {
    crashCount += 1;
    safeSessionSet(CRASH_COUNT_KEY, String(crashCount));
  }

  const threshold = isIOSDevice() ? 1 : 2;
  const shouldUseSafeMode =
    wasSessionSafe || wasPersistedSafe || (prevFgActive && crashCount >= threshold);

  if (shouldUseSafeMode) {
    safeSessionSet(SAFE_MODE_KEY, '1');
  }

  cachedSafeMode = shouldUseSafeMode;
  return shouldUseSafeMode;
}

export function getBootSafeMode(): boolean {
  if (cachedSafeMode === null) {
    return initBootCrashGuard();
  }
  return cachedSafeMode;
}

export function markSessionActive(): void {
  safeSessionSet(FG_ACTIVE_KEY, '1');
}

export function markSessionInactive(): void {
  safeSessionSet(FG_ACTIVE_KEY, '0');
}

export function markBootStable(): void {
  safeSessionSet(CRASH_COUNT_KEY, '0');
  if (!getBootSafeMode()) {
    safeLocalSet(SAFE_MODE_KEY, '0');
  }
}

export function enableSafeModeAndReload(): void {
  safeSessionSet(SAFE_MODE_KEY, '1');
  safeSessionSet(FG_ACTIVE_KEY, '0');
  safeLocalSet(SAFE_MODE_KEY, '1');
  cachedSafeMode = true;
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export function clearSafeModePreference(): void {
  safeSessionSet(SAFE_MODE_KEY, '0');
  safeSessionSet(CRASH_COUNT_KEY, '0');
  safeLocalSet(SAFE_MODE_KEY, '0');
  cachedSafeMode = false;
}
