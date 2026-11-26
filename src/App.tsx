import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import { User } from 'firebase/auth';
import {
  AIDifficulty,
  CameraPreset,
  GameMode,
  GameOverInfo,
  GameSettings,
  LeaderboardEntry,
  MoveRecord,
  OnlineRoomState,
  PieceColor,
  PieceSymbol,
  TIME_CONTROLS,
  TimeControl,
} from './types/chess';
import { LEARN_LESSONS, PresetChatKey, t } from './i18n/translations';
import { soundEngine } from './audio/soundEngine';
import { SETUP_V2, UX_POLISH } from './config/featureFlags';
import { ChessArena3D } from './three/ChessArena3D';
import { getGlbLoadProgressSnapshot, subscribeGlbProgress } from './three/modelLoader';
import { PieceGallery3D } from './three/PieceGallery3D';
import { MainMenu } from './components/MainMenu';
import { MatchSetupModal } from './components/MatchSetupModal';
import { OnlineLobby } from './components/OnlineLobby';
import { SettingsModal } from './components/SettingsModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { GameHUD } from './components/GameHUD';
import { LearnChessHUD } from './components/LearnChessHUD';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  ensureUserProfile,
  recordMatchResult,
  saveOnlineRoomConfig,
  signInWithGoogle,
  signOutUser,
  submitSafetyReport,
  subscribeAuth,
  testFirestoreConnection,
  updateOnlineRoomStatus,
} from './firebase/firebaseClient';

const SETTINGS_KEY = 'chess_battle_settings_v1';
const ONLINE_SESSION_KEY = 'chess_battle_online_session_v1';

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
    // ignore storage errors in restricted iframes / Incognito
  }
}

function safeSessionRemove(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors in restricted iframes / Incognito
  }
}

function getDefaultSettings(): GameSettings {
  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
    if (saved) {
      return JSON.parse(saved) as GameSettings;
    }
  } catch {
    // ignore corrupt or denied storage in Incognito iframes
  }
  return {
    language: 'vi',
    graphicsQuality: isTouch ? 'medium' : 'high',
    combatPace: 'full',
    soundEnabled: true,
    soundVolume: 0.65,
    showCoordinates: true,
    showValidMoves: true,
  };
}

function findKingSquare(chess: Chess, color: PieceColor): string | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) {
        return `${String.fromCharCode(97 + f)}${8 - r}`;
      }
    }
  }
  return null;
}

export default function App() {
  const [settings, setSettings] = useState<GameSettings>(getDefaultSettings);
  const [mode, setMode] = useState<GameMode>('menu');
  const [setupModal, setSetupModal] = useState<'none' | 'ai' | 'local' | 'online'>('none');
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showGallery, setShowGallery] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('gallery') === '1';
  });
  const [firstLoadBlocking, setFirstLoadBlocking] = useState<boolean>(
    () => getGlbLoadProgressSnapshot().isFirstLoadBlocking
  );

  // Firebase Auth & Profile
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<LeaderboardEntry | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Chess Game State (Local / AI / Learn)
  const chessRef = useRef<Chess>(new Chess());
  const [fen, setFen] = useState<string>(chessRef.current.fen());
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [hintMove, setHintMove] = useState<{ from: string; to: string } | null>(null);
  const [latestMoveEvent, setLatestMoveEvent] = useState<{ seq: number; move: MoveRecord } | null>(null);
  const moveSeqRef = useRef(0);

  // Match Config & Clocks
  const [playerSide, setPlayerSide] = useState<PieceColor>('w');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [aiThinking, setAiThinking] = useState(false);
  const [whiteName, setWhiteName] = useState(() => t(getDefaultSettings().language, 'whiteKingdom'));
  const [blackName, setBlackName] = useState(() => t(getDefaultSettings().language, 'blackKingdom'));
  const [timeControl, setTimeControl] = useState<TimeControl>(TIME_CONTROLS[2]);
  const [turnMinutes, setTurnMinutes] = useState<number>(0);
  const [turnSeconds, setTurnSeconds] = useState<number>(0);
  const [whiteClockMs, setWhiteClockMs] = useState(10 * 60 * 1000);
  const [blackClockMs, setBlackClockMs] = useState(10 * 60 * 1000);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const matchStartRef = useRef<number>(Date.now());
  const savedResultRef = useRef<boolean>(false);
  const turnDeadlineAtRef = useRef<number | null>(null);
  const pausedRemainingMsRef = useRef<number | null>(null);
  const legacyTurnRemainingRef = useRef<{ w: number; b: number }>({ w: 10 * 60 * 1000, b: 10 * 60 * 1000 });

  // Promotion pending state
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  // Camera & Combat Controls
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('default');
  const [cameraResetTrigger, setCameraResetTrigger] = useState(0);
  const [combatActive, setCombatActive] = useState(false);
  const [skipCombatTrigger, setSkipCombatTrigger] = useState(0);

  // Learn Mode State
  const [lessonIndex, setLessonIndex] = useState(0);
  const [lessonSolved, setLessonSolved] = useState(false);

  // Online Multiplayer State
  const socketRef = useRef<Socket | null>(null);
  const modeRef = useRef<GameMode>(mode);
  modeRef.current = mode;
  const onlinePublicIdRef = useRef<string | null>(null);
  const onlineColorRef = useRef<PieceColor | null>(null);
  const userRef = useRef<User | null>(user);
  userRef.current = user;
  const lastSyncedRoomStatusRef = useRef<string>('');
  const playedEndSoundRef = useRef<boolean>(false);
  const [initialRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('room') || '').trim().toUpperCase().slice(0, 6);
  });
  const [roomState, setRoomState] = useState<OnlineRoomState | null>(null);
  const [onlineColor, setOnlineColor] = useState<PieceColor | null>(null);
  onlineColorRef.current = onlineColor;
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [socketReconnecting, setSocketReconnecting] = useState(false);
  const [mutedOpponent, setMutedOpponent] = useState(false);

  // AI Web Worker
  const workerRef = useRef<Worker | null>(null);
  const aiReqIdRef = useRef(0);

  // Sync audio & persist settings
  useEffect(() => {
    soundEngine.configure(settings.soundEnabled, settings.soundVolume);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  useEffect(() => {
    if (!UX_POLISH) return;
    return soundEngine.installAudioUnlock();
  }, []);

  useEffect(() => {
    return subscribeGlbProgress((snap) => {
      setFirstLoadBlocking(snap.isFirstLoadBlocking);
    });
  }, []);

  // Firebase Auth subscription & startup test
  useEffect(() => {
    testFirestoreConnection().catch(() => {});
    const unsub = subscribeAuth(async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await ensureUserProfile(u);
          setProfile(p);
        } catch (err) {
          console.error(err);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Initialize AI Web Worker
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./workers/chessAI.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Initialize Socket.IO client
  useEffect(() => {
    const socket = io({ autoConnect: true, reconnection: true });
    socketRef.current = socket;

    const syncFirestoreRoomStatus = (state: OnlineRoomState, resolvedColor: PieceColor | null) => {
      if (!SETUP_V2 || !userRef.current?.emailVerified) return;
      if (state.status !== 'playing' && state.status !== 'finished') return;
      if (!state.hostColor || state.hostColor !== resolvedColor) return;
      const syncKey = `${state.roomCode}:${state.status}`;
      if (lastSyncedRoomStatusRef.current === syncKey) return;
      lastSyncedRoomStatusRef.current = syncKey;
      updateOnlineRoomStatus(userRef.current, state.roomCode, state.status).catch(() => {});
    };

    socket.on('connect', () => {
      setSocketReconnecting(false);
      const saved = safeSessionGet(ONLINE_SESSION_KEY);
      if (saved) {
        try {
          const { roomCode, token } = JSON.parse(saved) as { roomCode: string; token: string };
          socket.emit(
            'room:rejoin',
            { roomCode, token },
            (res: { ok: boolean; playerId?: string; color?: PieceColor; state?: OnlineRoomState }) => {
              if (res?.ok && res.state && res.color) {
                if (res.playerId) onlinePublicIdRef.current = res.playerId;
                setOnlineColor(res.color);
                setRoomState(res.state);
                chessRef.current = new Chess(res.state.fen);
                setFen(res.state.fen);
                setHistory(res.state.history);
                setLastMove(res.state.lastMove);
                setWhiteClockMs(res.state.clocks.w);
                setBlackClockMs(res.state.clocks.b);
                setGameOver(res.state.gameOver);
                if (res.state.status !== 'waiting') {
                  setMode('online');
                  setSetupModal('none');
                }
              } else {
                safeSessionRemove(ONLINE_SESSION_KEY);
              }
            }
          );
        } catch {
          safeSessionRemove(ONLINE_SESSION_KEY);
        }
      }
    });

    socket.on('disconnect', () => {
      setSocketReconnecting(true);
    });

    socket.on('connect_error', () => {
      setSocketReconnecting(true);
    });

    socket.io.on('reconnect_attempt', () => {
      setSocketReconnecting(true);
    });

    socket.io.on('reconnect', () => {
      setSocketReconnecting(false);
    });

    socket.on('room:state', (state: OnlineRoomState) => {
      setRoomState(state);
      setWhiteClockMs(state.clocks.w);
      setBlackClockMs(state.clocks.b);
      setGameOver(state.gameOver);

      let resolvedColor = onlineColorRef.current;
      if (onlinePublicIdRef.current) {
        if (state.players.w?.id === onlinePublicIdRef.current) {
          resolvedColor = 'w';
          setOnlineColor('w');
        } else if (state.players.b?.id === onlinePublicIdRef.current) {
          resolvedColor = 'b';
          setOnlineColor('b');
        }
      }

      syncFirestoreRoomStatus(state, resolvedColor);

      if (state.status === 'playing' && modeRef.current !== 'online') {
        chessRef.current = new Chess(state.fen);
        setFen(state.fen);
        setHistory(state.history);
        setLastMove(state.lastMove);
        setLatestMoveEvent(null);
        savedResultRef.current = false;
        playedEndSoundRef.current = false;
        setMode('online');
        setSetupModal('none');
      } else if (state.status === 'playing' && state.history.length === 0 && chessRef.current.history().length > 0) {
        // Fresh rematch started after previous match ended
        chessRef.current = new Chess(state.fen);
        setFen(state.fen);
        setHistory([]);
        setLastMove(null);
        setLatestMoveEvent(null);
        setSelectedSquare(null);
        setHintMove(null);
        savedResultRef.current = false;
        playedEndSoundRef.current = false;
      }
    });

    socket.on('room:move_applied', (payload: { move: MoveRecord; state: OnlineRoomState }) => {
      const { move, state } = payload;
      setRoomState(state);
      chessRef.current = new Chess(state.fen);
      setFen(state.fen);
      setHistory(state.history);
      setLastMove(state.lastMove);
      setSelectedSquare(null);
      setHintMove(null);
      setWhiteClockMs(state.clocks.w);
      setBlackClockMs(state.clocks.b);
      setGameOver(state.gameOver);
      syncFirestoreRoomStatus(state, onlineColorRef.current);

      moveSeqRef.current += 1;
      setLatestMoveEvent({ seq: moveSeqRef.current, move });

      if (move.captured) {
        soundEngine.playCapture(move.piece);
      } else {
        soundEngine.playMove();
      }
      if (chessRef.current.inCheck()) {
        soundEngine.playCheck();
      }
    });

    socket.on('room:chat_message', (msg) => {
      setRoomState((prev) => (prev ? { ...prev, chat: [...prev.chat.slice(-29), msg] } : prev));
    });

    // Check URL ?room=XXXXXX invite
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('room');
    if (inviteCode && inviteCode.length >= 4) {
      setSetupModal('online');
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Play victory/defeat sound for all players (including Guests) and save cloud result for signed-in users
  useEffect(() => {
    if (!gameOver) return;
    if (mode !== 'ai' && mode !== 'online' && mode !== 'local') return;

    const myCol: PieceColor = mode === 'online' ? onlineColor || 'w' : mode === 'ai' ? playerSide : 'w';
    const result: 'win' | 'loss' | 'draw' =
      gameOver.winner === 'draw' ? 'draw' : gameOver.winner === myCol ? 'win' : 'loss';

    if (!playedEndSoundRef.current) {
      playedEndSoundRef.current = true;
      soundEngine.playVictory(result === 'win');
    }

    if (!user || savedResultRef.current) return;
    savedResultRef.current = true;

    const opponentName =
      mode === 'ai'
        ? `AI (${aiDifficulty.toUpperCase()})`
        : mode === 'online'
          ? (myCol === 'w' ? roomState?.players.b?.name : roomState?.players.w?.name) || t(settings.language, 'player')
          : blackName;

    const oppElo = mode === 'ai' ? (aiDifficulty === 'easy' ? 1050 : aiDifficulty === 'medium' ? 1250 : 1480) : 1200;

    recordMatchResult({
      user,
      mode,
      opponentName,
      opponentElo: oppElo,
      playerColor: myCol,
      result,
      reason: gameOver.reason,
      movesCount: gameOver.movesCount,
      durationSec: gameOver.durationSec,
      pgnSummary: history
        .slice(-30)
        .map((m) => m.san)
        .join(' '),
    })
      .then(({ eloDelta, updatedProfile }) => {
        if (updatedProfile) setProfile(updatedProfile);
        setGameOver((prev) => (prev ? { ...prev, eloDelta } : prev));
      })
      .catch((err) => console.error(err));
  }, [gameOver, user, mode, onlineColor, playerSide, aiDifficulty, roomState, blackName, history, settings.language]);

  // Freeze/resume timestamp clock during Pause or 3D Combat (UX_POLISH)
  useEffect(() => {
    if (!UX_POLISH) return;
    if (mode !== 'local' && mode !== 'ai') return;
    if (gameOver) {
      turnDeadlineAtRef.current = null;
      pausedRemainingMsRef.current = null;
      return;
    }
    if (paused || combatActive) {
      if (turnDeadlineAtRef.current !== null) {
        pausedRemainingMsRef.current = Math.max(0, turnDeadlineAtRef.current - Date.now());
        turnDeadlineAtRef.current = null;
      }
    } else if (pausedRemainingMsRef.current !== null) {
      turnDeadlineAtRef.current = Date.now() + pausedRemainingMsRef.current;
      pausedRemainingMsRef.current = null;
    }
  }, [paused, combatActive, mode, gameOver]);

  // Active Clock Ticker (Timestamp-driven under UX_POLISH, legacy 250ms under rollback)
  useEffect(() => {
    if (mode !== 'local' && mode !== 'ai' && mode !== 'online') return;
    const effectiveTurnMs = turnSeconds > 0 ? turnSeconds * 1000 : turnMinutes * 60 * 1000;
    const isUntimedLocal = SETUP_V2 ? effectiveTurnMs <= 0 : timeControl.initialMs <= 0;
    if (isUntimedLocal && mode !== 'online') return;
    if (mode === 'online' && (!roomState || roomState.timeControl.initialMs <= 0 || roomState.status !== 'playing')) return;
    if (paused || gameOver || combatActive) return;

    const turn = chessRef.current.turn();

    if (UX_POLISH) {
      const onlineBaseNow = Date.now();
      const onlineStartMs = roomState ? roomState.clocks[roomState.turn] : 0;

      const syncClock = () => {
        const now = Date.now();
        if (mode === 'online') {
          if (!roomState || roomState.status !== 'playing') return;
          if (SETUP_V2 && roomState.turnDeadlineAt) {
            const rem = Math.max(0, roomState.turnDeadlineAt - now);
            if (roomState.turn === 'w') setWhiteClockMs(rem);
            else setBlackClockMs(rem);
          } else {
            const rem = Math.max(0, onlineStartMs - (now - onlineBaseNow));
            if (roomState.turn === 'w') setWhiteClockMs(rem);
            else setBlackClockMs(rem);
          }
          return;
        }

        if (turnDeadlineAtRef.current === null) return;
        const rem = Math.max(0, turnDeadlineAtRef.current - now);
        if (turn === 'w') {
          setWhiteClockMs(rem);
        } else {
          setBlackClockMs(rem);
        }
        if (rem === 0) {
          turnDeadlineAtRef.current = null;
          setGameOver({
            winner: turn === 'w' ? 'b' : 'w',
            reason: 'timeout',
            movesCount: history.length,
            durationSec: Math.max(1, Math.round((now - matchStartRef.current) / 1000)),
          });
        }
      };

      syncClock();
      const interval = window.setInterval(syncClock, 100);
      const onVis = () => {
        if (!document.hidden) syncClock();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    const interval = setInterval(() => {
      if (turn === 'w') {
        setWhiteClockMs((prev) => {
          const next = Math.max(0, prev - 250);
          if (next === 0 && mode !== 'online') {
            setGameOver({
              winner: 'b',
              reason: 'timeout',
              movesCount: history.length,
              durationSec: Math.max(1, Math.round((Date.now() - matchStartRef.current) / 1000)),
            });
          }
          return next;
        });
      } else {
        setBlackClockMs((prev) => {
          const next = Math.max(0, prev - 250);
          if (next === 0 && mode !== 'online') {
            setGameOver({
              winner: 'w',
              reason: 'timeout',
              movesCount: history.length,
              durationSec: Math.max(1, Math.round((Date.now() - matchStartRef.current) / 1000)),
            });
          }
          return next;
        });
      }
    }, 250);

    return () => clearInterval(interval);
  }, [mode, fen, paused, gameOver, combatActive, timeControl.initialMs, turnMinutes, turnSeconds, roomState, history.length]);

  const checkLocalGameEnd = useCallback(
    (chess: Chess, movesCount: number): GameOverInfo | null => {
      const durationSec = Math.max(1, Math.round((Date.now() - matchStartRef.current) / 1000));
      if (chess.isCheckmate()) {
        return {
          winner: chess.turn() === 'w' ? 'b' : 'w',
          reason: 'checkmate',
          movesCount,
          durationSec,
        };
      }
      if (chess.isStalemate()) return { winner: 'draw', reason: 'stalemate', movesCount, durationSec };
      if (chess.isThreefoldRepetition()) return { winner: 'draw', reason: 'threefold', movesCount, durationSec };
      if (chess.isInsufficientMaterial()) return { winner: 'draw', reason: 'insufficient', movesCount, durationSec };
      if (chess.isDraw()) return { winner: 'draw', reason: 'fifty_moves', movesCount, durationSec };
      return null;
    },
    []
  );

  const commitLocalMove = useCallback(
    (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const chess = chessRef.current;
      try {
        const result: Move | null = chess.move({ from, to, promotion });
        if (!result) return false;

        const record: MoveRecord = {
          san: result.san,
          from: result.from,
          to: result.to,
          color: result.color,
          piece: result.piece,
          captured: result.captured,
          promotion: result.promotion,
          flags: result.flags,
          fenAfter: chess.fen(),
        };

        const nextHistory = [...history, record];
        setHistory(nextHistory);
        setFen(chess.fen());
        setLastMove({ from: result.from, to: result.to });
        setSelectedSquare(null);
        setHintMove(null);

        moveSeqRef.current += 1;
        setLatestMoveEvent({ seq: moveSeqRef.current, move: record });

        if (result.captured) {
          soundEngine.playCapture(result.piece);
        } else {
          soundEngine.playMove();
        }
        if (chess.inCheck()) {
          soundEngine.playCheck();
        }

        if (mode === 'learn') {
          const lesson = LEARN_LESSONS[lessonIndex];
          if (
            !lesson.solutionMove ||
            (lesson.solutionMove.from === result.from && lesson.solutionMove.to === result.to)
          ) {
            setLessonSolved(true);
            soundEngine.playVictory(true);
          }
          return true;
        }

        const ended = checkLocalGameEnd(chess, nextHistory.length);
        if (ended) {
          turnDeadlineAtRef.current = null;
          pausedRemainingMsRef.current = null;
          setGameOver(ended);
        } else if (SETUP_V2) {
          const turnMs = turnSeconds > 0 ? turnSeconds * 1000 : turnMinutes * 60 * 1000;
          if (turnMs > 0) {
            setWhiteClockMs(turnMs);
            setBlackClockMs(turnMs);
            if (result.captured && UX_POLISH) {
              // Combat starts right after capture; hold fresh per-turn allowance until combat ends
              turnDeadlineAtRef.current = null;
              pausedRemainingMsRef.current = turnMs;
            } else {
              turnDeadlineAtRef.current = Date.now() + turnMs;
              pausedRemainingMsRef.current = null;
            }
          } else {
            turnDeadlineAtRef.current = null;
            pausedRemainingMsRef.current = null;
          }
        } else if (timeControl.initialMs > 0) {
          const mover = result.color;
          const nextTurn = chess.turn();
          const prevMoverRem =
            turnDeadlineAtRef.current !== null
              ? Math.max(0, turnDeadlineAtRef.current - Date.now())
              : legacyTurnRemainingRef.current[mover];
          legacyTurnRemainingRef.current[mover] = prevMoverRem + timeControl.incrementMs;
          if (mover === 'w') setWhiteClockMs(legacyTurnRemainingRef.current.w);
          else setBlackClockMs(legacyTurnRemainingRef.current.b);
          const nextRem = legacyTurnRemainingRef.current[nextTurn];
          if (result.captured && UX_POLISH) {
            turnDeadlineAtRef.current = null;
            pausedRemainingMsRef.current = nextRem;
          } else {
            turnDeadlineAtRef.current = Date.now() + nextRem;
            pausedRemainingMsRef.current = null;
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [checkLocalGameEnd, history, lessonIndex, mode, timeControl, turnMinutes, turnSeconds]
  );

  // Trigger AI move when it's AI's turn
  useEffect(() => {
    if (mode !== 'ai' || gameOver || paused || combatActive) return;
    if (chessRef.current.turn() === playerSide) return;
    const worker = workerRef.current;
    if (!worker) return;

    setAiThinking(true);
    const reqId = `ai_${++aiReqIdRef.current}`;
    const currentFen = chessRef.current.fen();

    const handleMsg = (e: MessageEvent<{ id: string; type: string; move: { from: string; to: string; promotion?: string } | null }>) => {
      if (e.data.id !== reqId) return;
      worker.removeEventListener('message', handleMsg);
      setAiThinking(false);
      if (e.data.move) {
        commitLocalMove(
          e.data.move.from,
          e.data.move.to,
          e.data.move.promotion as 'q' | 'r' | 'b' | 'n' | undefined
        );
      }
    };

    worker.addEventListener('message', handleMsg);
    const timer = setTimeout(() => {
      worker.postMessage({ id: reqId, type: 'move', fen: currentFen, difficulty: aiDifficulty });
    }, 320);

    return () => {
      clearTimeout(timer);
      worker.removeEventListener('message', handleMsg);
    };
  }, [mode, fen, playerSide, aiDifficulty, gameOver, paused, combatActive, commitLocalMove]);

  const handleRequestHint = () => {
    if (!workerRef.current || gameOver || aiThinking) return;
    const reqId = `hint_${++aiReqIdRef.current}`;
    const currentFen = chessRef.current.fen();
    const handleMsg = (e: MessageEvent<{ id: string; type: string; move: { from: string; to: string } | null }>) => {
      if (e.data.id !== reqId) return;
      workerRef.current?.removeEventListener('message', handleMsg);
      if (e.data.move) {
        setHintMove({ from: e.data.move.from, to: e.data.move.to });
        soundEngine.playSelect();
      }
    };
    workerRef.current.addEventListener('message', handleMsg);
    workerRef.current.postMessage({ id: reqId, type: 'hint', fen: currentFen, difficulty: 'hard' });
  };

  // Compute legal targets for selected square
  const { legalTargets, captureTargets } = useMemo(() => {
    if (!selectedSquare) return { legalTargets: [], captureTargets: [] };
    const moves = chessRef.current.moves({ square: selectedSquare as Square, verbose: true });
    const quiet: string[] = [];
    const caps: string[] = [];
    for (const m of moves) {
      if (m.captured) caps.push(m.to);
      else quiet.push(m.to);
    }
    return { legalTargets: quiet, captureTargets: caps };
  }, [selectedSquare, fen]);

  const checkSquare = useMemo(() => {
    if (!chessRef.current.inCheck()) return null;
    return findKingSquare(chessRef.current, chessRef.current.turn());
  }, [fen]);

  const { capturedByWhite, capturedByBlack } = useMemo(() => {
    const byW: PieceSymbol[] = [];
    const byB: PieceSymbol[] = [];
    for (const m of history) {
      if (m.captured) {
        if (m.color === 'w') byW.push(m.captured);
        else byB.push(m.captured);
      }
    }
    return { capturedByWhite: byW, capturedByBlack: byB };
  }, [history]);

  const handleSquareClick = useCallback(
    (square: string) => {
      if (mode === 'menu' || gameOver || paused || combatActive || aiThinking) return;

      const chess = chessRef.current;
      const turn = chess.turn();

      if (mode === 'ai' && turn !== playerSide) return;
      if (mode === 'online' && (!onlineColor || turn !== onlineColor)) return;

      // Attempt move if a square is already selected and clicked square is a legal target
      if (selectedSquare && (legalTargets.includes(square) || captureTargets.includes(square))) {
        const piece = chess.get(selectedSquare as Square);
        const isPromotion =
          piece?.type === 'p' &&
          ((piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1'));

        if (isPromotion) {
          setPendingPromotion({ from: selectedSquare, to: square });
          return;
        }

        if (mode === 'online') {
          socketRef.current?.emit('room:move', {
            roomCode: roomState?.roomCode,
            from: selectedSquare,
            to: square,
          });
          setSelectedSquare(null);
          return;
        }

        commitLocalMove(selectedSquare, square);
        return;
      }

      // Select piece of active turn color
      const clickedPiece = chess.get(square as Square);
      if (clickedPiece && clickedPiece.color === turn) {
        if (mode === 'online' && clickedPiece.color !== onlineColor) return;
        if (mode === 'ai' && clickedPiece.color !== playerSide) return;
        setSelectedSquare(square);
        soundEngine.playSelect();
      } else {
        setSelectedSquare(null);
      }
    },
    [
      mode,
      gameOver,
      paused,
      combatActive,
      aiThinking,
      playerSide,
      onlineColor,
      selectedSquare,
      legalTargets,
      captureTargets,
      roomState?.roomCode,
      commitLocalMove,
    ]
  );

  const handlePromote = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);

    if (mode === 'online') {
      socketRef.current?.emit('room:move', {
        roomCode: roomState?.roomCode,
        from,
        to,
        promotion: piece,
      });
      setSelectedSquare(null);
    } else {
      commitLocalMove(from, to, piece);
    }
  };

  const startNewLocalOrAI = (opts: {
    targetMode: 'ai' | 'local';
    side: PieceColor;
    difficulty?: AIDifficulty;
    wName: string;
    bName: string;
    tc: TimeControl;
    turnMinutes?: number;
    turnSeconds?: number;
  }) => {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setHistory([]);
    setSelectedSquare(null);
    setLastMove(null);
    setHintMove(null);
    setLatestMoveEvent(null);
    setGameOver(null);
    setPaused(false);
    savedResultRef.current = false;
    playedEndSoundRef.current = false;
    matchStartRef.current = Date.now();

    const nextTurnMinutes = opts.turnMinutes ?? 0;
    const nextTurnSeconds = opts.turnSeconds ?? nextTurnMinutes * 60;
    setPlayerSide(opts.side);
    if (opts.difficulty) setAiDifficulty(opts.difficulty);
    setWhiteName(opts.wName);
    setBlackName(opts.bName);
    setTimeControl(opts.tc);
    setTurnMinutes(nextTurnMinutes);
    setTurnSeconds(nextTurnSeconds);

    if (SETUP_V2) {
      const turnMs = nextTurnSeconds * 1000;
      setWhiteClockMs(turnMs);
      setBlackClockMs(turnMs);
      turnDeadlineAtRef.current = turnMs > 0 ? Date.now() + turnMs : null;
      pausedRemainingMsRef.current = null;
    } else {
      setWhiteClockMs(opts.tc.initialMs);
      setBlackClockMs(opts.tc.initialMs);
      legacyTurnRemainingRef.current = { w: opts.tc.initialMs, b: opts.tc.initialMs };
      turnDeadlineAtRef.current = opts.tc.initialMs > 0 ? Date.now() + opts.tc.initialMs : null;
      pausedRemainingMsRef.current = null;
    }

    setCameraPreset('default');
    setCameraResetTrigger((c) => c + 1);
    setMode(opts.targetMode);
    setSetupModal('none');
  };

  const startLesson = (idx: number) => {
    const lesson = LEARN_LESSONS[idx] || LEARN_LESSONS[0];
    chessRef.current = new Chess(lesson.fen);
    setLessonIndex(idx);
    setLessonSolved(false);
    setFen(lesson.fen);
    setHistory([]);
    setSelectedSquare(lesson.pieceSquare);
    setLastMove(null);
    setHintMove(null);
    setLatestMoveEvent(null);
    setGameOver(null);
    setPlayerSide('w');
    setCameraPreset('default');
    setCameraResetTrigger((c) => c + 1);
    setMode('learn');
  };

  const handleUndo = () => {
    if (mode === 'online' || gameOver || history.length === 0) return;
    const steps = mode === 'ai' && chessRef.current.turn() === playerSide && history.length >= 2 ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      chessRef.current.undo();
    }
    const nextHistory = history.slice(0, history.length - steps);
    setHistory(nextHistory);
    setFen(chessRef.current.fen());
    setSelectedSquare(null);
    setHintMove(null);
    const prevLast = nextHistory[nextHistory.length - 1];
    setLastMove(prevLast ? { from: prevLast.from, to: prevLast.to } : null);
    setLatestMoveEvent(null);
    const turnMs = turnSeconds > 0 ? turnSeconds * 1000 : turnMinutes * 60 * 1000;
    if (SETUP_V2 && turnMs > 0) {
      setWhiteClockMs(turnMs);
      setBlackClockMs(turnMs);
      turnDeadlineAtRef.current = Date.now() + turnMs;
      pausedRemainingMsRef.current = null;
    }
  };

  // Online Actions
  const handleCreateRoom = (
    name: string,
    tc: TimeControl,
    opts?: { sideChoice?: 'w' | 'b' | 'random'; turnMinutes?: number }
  ) => {
    setOnlineError(null);
    lastSyncedRoomStatusRef.current = '';
    const payload = SETUP_V2
      ? {
          playerName: name,
          timeControl: tc,
          sideChoice: opts?.sideChoice ?? 'w',
          turnMinutes: opts?.turnMinutes ?? 0,
        }
      : { playerName: name, timeControl: tc };

    socketRef.current?.emit(
      'room:create',
      payload,
      (res: { ok: boolean; token?: string; playerId?: string; color?: PieceColor; state?: OnlineRoomState }) => {
        if (res?.ok && res.token && res.color && res.state) {
          if (res.playerId) onlinePublicIdRef.current = res.playerId;
          safeSessionSet(ONLINE_SESSION_KEY, JSON.stringify({ roomCode: res.state.roomCode, token: res.token }));
          setOnlineColor(res.color);
          setRoomState(res.state);
          if (SETUP_V2 && userRef.current?.emailVerified) {
            saveOnlineRoomConfig({
              user: userRef.current,
              roomCode: res.state.roomCode,
              hostSideChoice: opts?.sideChoice ?? 'w',
              hostColor: res.color,
              turnMinutes: res.state.turnMinutes ?? opts?.turnMinutes ?? 0,
            }).catch(() => {});
          }
        } else {
          setOnlineError(t(settings.language, 'connectionError'));
        }
      }
    );
  };

  const handleJoinRoom = (code: string, name: string) => {
    setOnlineError(null);
    lastSyncedRoomStatusRef.current = '';
    socketRef.current?.emit(
      'room:join',
      { roomCode: code.trim().toUpperCase(), playerName: name },
      (res: { ok: boolean; error?: string; token?: string; playerId?: string; color?: PieceColor; state?: OnlineRoomState }) => {
        if (res?.ok && res.token && res.color && res.state) {
          if (res.playerId) onlinePublicIdRef.current = res.playerId;
          safeSessionSet(ONLINE_SESSION_KEY, JSON.stringify({ roomCode: res.state.roomCode, token: res.token }));
          setOnlineColor(res.color);
          setRoomState(res.state);
        } else if (res?.error === 'room_full') {
          setOnlineError(t(settings.language, 'roomErrorFull'));
        } else {
          setOnlineError(t(settings.language, 'roomErrorNotFound'));
        }
      }
    );
  };

  const handleLeaveOnlineRoom = () => {
    if (roomState) {
      socketRef.current?.emit('room:leave', { roomCode: roomState.roomCode });
    }
    safeSessionRemove(ONLINE_SESSION_KEY);
    onlinePublicIdRef.current = null;
    playedEndSoundRef.current = false;
    setRoomState(null);
    setOnlineColor(null);
    setOnlineError(null);
    setSetupModal('none');
    setMode('menu');
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setLatestMoveEvent(null);
  };

  const handleReturnToMenu = () => {
    if (mode === 'online') {
      handleLeaveOnlineRoom();
      return;
    }
    setMode('menu');
    setGameOver(null);
    setPaused(false);
    setSelectedSquare(null);
    setHintMove(null);
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setHistory([]);
    setLatestMoveEvent(null);
    setCameraPreset('default');
    setCameraResetTrigger((c) => c + 1);
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
    } finally {
      setAuthBusy(false);
    }
  };

  const orientation: PieceColor =
    mode === 'online' ? onlineColor || 'w' : mode === 'ai' ? playerSide : 'w';

  const displayWhiteName =
    mode === 'online'
      ? roomState?.players.w?.name || t(settings.language, 'whiteKingdom')
      : mode === 'local' && SETUP_V2
        ? t(settings.language, 'sideWhite')
        : whiteName;
  const displayBlackName =
    mode === 'online'
      ? roomState?.players.b?.name || t(settings.language, 'blackKingdom')
      : mode === 'local' && SETUP_V2
        ? t(settings.language, 'sideBlack')
        : blackName;

  const handleAutoDowngradeCombatPace = useCallback(() => {
    setSettings((s) => (s.combatPace === 'full' ? { ...s, combatPace: 'fast' } : s));
  }, []);

  return (
    <ErrorBoundary>
      <div
        className={`relative overflow-hidden bg-[#0D1017] select-none ${
          UX_POLISH ? 'w-full h-[100dvh] overscroll-none' : 'w-screen h-screen'
        }`}
      >
        {/* Full-Viewport 3D Medieval Chess Battlefield */}
        <ChessArena3D
          lang={settings.language}
          fen={fen}
          orientation={orientation}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          captureTargets={captureTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hintMove={hintMove}
          graphicsQuality={settings.graphicsQuality}
          combatPace={settings.combatPace}
          showCoordinates={settings.showCoordinates}
          showValidMoves={settings.showValidMoves}
          cameraPreset={cameraPreset}
          cameraResetTrigger={cameraResetTrigger}
          latestMoveEvent={latestMoveEvent}
          skipCombatTrigger={skipCombatTrigger}
          interactive={mode !== 'menu'}
          onSquareClick={handleSquareClick}
          onCombatStateChange={setCombatActive}
          onAutoDowngradeCombatPace={handleAutoDowngradeCombatPace}
        />

        {/* Home Menu Overlay */}
        {mode === 'menu' && !firstLoadBlocking && (
          <MainMenu
            settings={settings}
            user={user}
            profile={profile}
            authBusy={authBusy}
            onSignIn={handleGoogleSignIn}
            onSignOut={() => signOutUser()}
            onSelectMode={(m) => {
              if (m === 'learn') startLesson(0);
              else setSetupModal(m);
            }}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onOpenSettings={() => setShowSettings(true)}
            onToggleLanguage={() =>
              setSettings((s) => ({ ...s, language: s.language === 'vi' ? 'en' : 'vi' }))
            }
          />
        )}

        {/* Active Battle HUD */}
        {(mode === 'ai' || mode === 'local' || mode === 'online') && (
          <GameHUD
            mode={mode}
            settings={settings}
            turn={chessRef.current.turn()}
            inCheck={chessRef.current.inCheck()}
            aiThinking={aiThinking}
            combatActive={combatActive}
            whiteName={displayWhiteName}
            blackName={displayBlackName}
            whiteClockMs={whiteClockMs}
            blackClockMs={blackClockMs}
            untimed={
              mode === 'online'
                ? (roomState?.timeControl.initialMs ?? 0) === 0
                : SETUP_V2
                  ? (turnSeconds > 0 ? turnSeconds * 1000 : turnMinutes * 60 * 1000) === 0
                  : timeControl.initialMs === 0
            }
            history={history}
            capturedByWhite={capturedByWhite}
            capturedByBlack={capturedByBlack}
            gameOver={gameOver}
            paused={paused}
            promotionPending={Boolean(pendingPromotion)}
            serverReconnecting={socketReconnecting}
            onlineStatus={
              mode === 'online' && roomState && onlineColor
                ? {
                    roomCode: roomState.roomCode,
                    myColor: onlineColor,
                    opponentConnected: Boolean(
                      onlineColor === 'w' ? roomState.players.b?.connected : roomState.players.w?.connected
                    ),
                    pendingDrawFrom: roomState.pendingDrawFrom,
                    rematchMine: roomState.rematchRequests[onlineColor],
                    rematchOpp: roomState.rematchRequests[onlineColor === 'w' ? 'b' : 'w'],
                    chat: roomState.chat,
                    muted: mutedOpponent,
                  }
                : undefined
            }
            onCameraPreset={(p) => {
              setCameraPreset(p);
              setCameraResetTrigger((c) => c + 1);
            }}
            onResetCamera={() => {
              setCameraPreset('default');
              setCameraResetTrigger((c) => c + 1);
            }}
            onToggleCombatPace={() =>
              setSettings((s) => ({
                ...s,
                combatPace: s.combatPace === 'full' ? 'fast' : 'full',
              }))
            }
            onSkipCombat={() => setSkipCombatTrigger((c) => c + 1)}
            onToggleSound={() => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
            onRequestHint={mode === 'ai' ? handleRequestHint : undefined}
            onUndo={mode !== 'online' ? handleUndo : undefined}
            onPauseToggle={() => setPaused((p) => !p)}
            onOfferDraw={
              mode === 'online'
                ? () => socketRef.current?.emit('room:draw_offer', { roomCode: roomState?.roomCode })
                : undefined
            }
            onRespondDraw={
              mode === 'online'
                ? (accept) => socketRef.current?.emit('room:draw_response', { roomCode: roomState?.roomCode, accept })
                : undefined
            }
            onResign={() => {
              if (mode === 'online') {
                socketRef.current?.emit('room:resign', { roomCode: roomState?.roomCode });
              } else {
                const winner: PieceColor = mode === 'ai' ? (playerSide === 'w' ? 'b' : 'w') : chessRef.current.turn() === 'w' ? 'b' : 'w';
                setGameOver({
                  winner,
                  reason: 'resign',
                  movesCount: history.length,
                  durationSec: Math.max(1, Math.round((Date.now() - matchStartRef.current) / 1000)),
                });
              }
            }}
            onRematch={() => {
              if (mode === 'online') {
                socketRef.current?.emit('room:rematch_request', { roomCode: roomState?.roomCode });
              } else {
                startNewLocalOrAI({
                  targetMode: mode,
                  side: playerSide,
                  difficulty: aiDifficulty,
                  wName: whiteName,
                  bName: blackName,
                  tc: timeControl,
                  turnMinutes,
                  turnSeconds,
                });
              }
            }}
            onReturnMenu={handleReturnToMenu}
            onOpenSettings={() => setShowSettings(true)}
            onPromote={handlePromote}
            onSendQuickChat={(key: PresetChatKey) => {
              socketRef.current?.emit('room:quick_chat', { roomCode: roomState?.roomCode, presetKey: key });
            }}
            onToggleMute={() => setMutedOpponent((m) => !m)}
            onReportOpponent={() => {
              if (roomState) {
                submitSafetyReport(roomState.roomCode, 'Student safety report during online match').catch(() => {});
              }
            }}
          />
        )}

        {/* Learn Chess Interactive HUD */}
        {mode === 'learn' && (
          <LearnChessHUD
            lang={settings.language}
            lessonIndex={lessonIndex}
            solved={lessonSolved}
            onSelectLesson={startLesson}
            onResetLesson={() => startLesson(lessonIndex)}
            onReturnMenu={handleReturnToMenu}
          />
        )}

        {/* Setup Modals */}
        {(setupModal === 'ai' || setupModal === 'local') && (
          <MatchSetupModal
            mode={setupModal}
            lang={settings.language}
            defaultPlayerName={profile?.displayName || user?.displayName || ''}
            onClose={() => setSetupModal('none')}
            onStartAI={({ side, difficulty, timeControl: tc, turnMinutes: tm, turnSeconds: ts }) => {
              const factionLabel = side === 'w' ? t(settings.language, 'sideWhite') : t(settings.language, 'sideBlack');
              const humanName =
                profile?.displayName ||
                user?.displayName ||
                (SETUP_V2 ? factionLabel : t(settings.language, 'whiteKingdom'));
              const botName = `AI (${t(settings.language, difficulty)})`;
              startNewLocalOrAI({
                targetMode: 'ai',
                side,
                difficulty,
                wName: side === 'w' ? humanName : botName,
                bName: side === 'b' ? humanName : botName,
                tc,
                turnMinutes: tm,
                turnSeconds: ts,
              });
            }}
            onStartLocal={({ whiteName: wN, blackName: bN, timeControl: tc, turnMinutes: tm, turnSeconds: ts }) => {
              startNewLocalOrAI({
                targetMode: 'local',
                side: 'w',
                wName: wN,
                bName: bN,
                tc,
                turnMinutes: tm,
                turnSeconds: ts,
              });
            }}
          />
        )}

        {setupModal === 'online' && (
          <OnlineLobby
            lang={settings.language}
            defaultPlayerName={profile?.displayName || user?.displayName || t(settings.language, 'defaultPlayerName')}
            initialJoinCode={initialRoomCode}
            roomState={roomState}
            myColor={onlineColor}
            errorMsg={onlineError}
            onClose={() => {
              setOnlineError(null);
              setSetupModal('none');
            }}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onToggleReady={(ready) =>
              socketRef.current?.emit('room:ready', { roomCode: roomState?.roomCode, ready })
            }
            onLeaveRoom={handleLeaveOnlineRoom}
          />
        )}

        {showSettings && (
          <SettingsModal
            settings={settings}
            onUpdate={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onOpenGallery={() => {
              setShowSettings(false);
              setShowGallery(true);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {showGallery && (
          <PieceGallery3D
            lang={settings.language}
            onClose={() => {
              setShowGallery(false);
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                if (url.searchParams.has('gallery')) {
                  url.searchParams.delete('gallery');
                  window.history.replaceState({}, '', url.toString());
                }
              }
            }}
          />
        )}

        {showLeaderboard && (
          <LeaderboardModal
            lang={settings.language}
            user={user}
            onSignIn={handleGoogleSignIn}
            onClose={() => setShowLeaderboard(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
