export type Language = 'vi' | 'en';
export type GameMode = 'menu' | 'local' | 'ai' | 'online' | 'learn';
export type PieceColor = 'w' | 'b';
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type CombatPace = 'full' | 'fast' | 'off';
export type CameraPreset = 'default' | 'white' | 'black' | 'top' | 'cinematic';

export interface TimeControl {
  id: string;
  initialMs: number; // 0 means untimed
  incrementMs: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'untimed', initialMs: 0, incrementMs: 0 },
  { id: 'blitz5', initialMs: 5 * 60 * 1000, incrementMs: 0 },
  { id: 'rapid10', initialMs: 10 * 60 * 1000, incrementMs: 0 },
  { id: 'rapid15', initialMs: 15 * 60 * 1000, incrementMs: 10 * 1000 },
];

export interface GameSettings {
  language: Language;
  graphicsQuality: GraphicsQuality;
  combatPace: CombatPace;
  soundEnabled: boolean;
  soundVolume: number;
  showCoordinates: boolean;
  showValidMoves: boolean;
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: string;
  fenAfter: string;
}

export interface CombatEvent {
  id: string;
  attackerColor: PieceColor;
  attackerType: PieceSymbol;
  defenderColor: PieceColor;
  defenderType: PieceSymbol;
  from: string;
  to: string;
  isPromotion?: boolean;
  promotedTo?: PieceSymbol;
  isCastle?: boolean;
}

export interface GameOverInfo {
  winner: PieceColor | 'draw';
  reason: 'checkmate' | 'stalemate' | 'threefold' | 'insufficient' | 'fifty_moves' | 'timeout' | 'resign' | 'agreement';
  movesCount: number;
  durationSec: number;
  eloDelta?: number;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  color: PieceColor;
  ready: boolean;
  connected: boolean;
}

export interface SafeChatMessage {
  id: string;
  senderColor: PieceColor;
  senderName: string;
  presetKey: string;
  timestamp: number;
}

export interface OnlineRoomState {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  fen: string;
  turn: PieceColor;
  players: {
    w: OnlinePlayer | null;
    b: OnlinePlayer | null;
  };
  timeControl: TimeControl;
  clocks: {
    w: number;
    b: number;
  };
  history: MoveRecord[];
  lastMove: { from: string; to: string } | null;
  pendingDrawFrom: PieceColor | null;
  rematchRequests: {
    w: boolean;
    b: boolean;
  };
  gameOver: GameOverInfo | null;
  chat: SafeChatMessage[];
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  avatarHue: number;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchRecord {
  matchId: string;
  ownerUid: string;
  mode: 'ai' | 'local' | 'online';
  opponentName: string;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  reason: string;
  movesCount: number;
  eloChange: number;
  durationSec: number;
  pgnSummary: string;
  createdAt?: unknown;
}
