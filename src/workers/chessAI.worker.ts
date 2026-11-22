import { Chess, Move } from 'chess.js';

type Difficulty = 'easy' | 'medium' | 'hard';

interface AIRequest {
  id: string;
  type: 'move' | 'hint';
  fen: string;
  difficulty: Difficulty;
}

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables (from White's perspective, rank 8 -> rank 1)
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];

const QUEEN_PST = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MID_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const PST_MAP: Record<string, number[]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_MID_PST,
};

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 : 99999;
  }
  if (chess.isDraw()) return 0;

  const board = chess.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const baseVal = PIECE_VALUES[piece.type] || 0;
      const pst = PST_MAP[piece.type];
      const idx = piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const posVal = pst ? pst[idx] : 0;
      const total = baseVal + posVal;
      score += piece.color === 'w' ? total : -total;
    }
  }

  // Slight bonus for checking opponent
  if (chess.inCheck()) {
    score += chess.turn() === 'w' ? -35 : 35;
  }

  return score;
}

function scoreMoveOrder(m: Move): number {
  let s = 0;
  if (m.captured) {
    s += 10 * (PIECE_VALUES[m.captured] || 100) - (PIECE_VALUES[m.piece] || 100);
  }
  if (m.promotion) {
    s += PIECE_VALUES[m.promotion] || 800;
  }
  if (m.san.includes('+')) s += 45;
  if (m.flags.includes('k') || m.flags.includes('q')) s += 60;
  return s;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));
}

function quiescence(chess: Chess, alpha: number, beta: number, colorSign: number, depth: number): number {
  const standPat = colorSign * evaluateBoard(chess);
  if (depth <= 0) return standPat;
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const captures = orderMoves(chess.moves({ verbose: true }).filter((m) => Boolean(m.captured)));
  for (const move of captures) {
    chess.move(move);
    const score = -quiescence(chess, -beta, -alpha, -colorSign, depth - 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  colorSign: number,
  useQuiescence: boolean
): number {
  if (chess.isGameOver()) {
    return colorSign * evaluateBoard(chess);
  }
  if (depth <= 0) {
    return useQuiescence
      ? quiescence(chess, alpha, beta, colorSign, 3)
      : colorSign * evaluateBoard(chess);
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  let best = -Infinity;

  for (const move of moves) {
    chess.move(move);
    const val = -negamax(chess, depth - 1, -beta, -alpha, -colorSign, useQuiescence);
    chess.undo();
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return best;
}

function pickBestMove(fen: string, difficulty: Difficulty): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) return null;

  // Opening variety on move 1-4
  const historyLen = chess.moveNumber();
  if (historyLen <= 2 && difficulty !== 'easy') {
    const openings = moves.filter((m) =>
      ['e4', 'd4', 'Nf3', 'c4', 'e5', 'c5', 'd5', 'Nf6', 'Nc6', 'e6'].includes(m.san)
    );
    if (openings.length > 0) {
      const chosen = openings[Math.floor(Math.random() * openings.length)];
      return { from: chosen.from, to: chosen.to, promotion: chosen.promotion };
    }
  }

  const colorSign = chess.turn() === 'w' ? 1 : -1;
  const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const useQuiescence = difficulty !== 'easy';

  const scored: { move: Move; score: number }[] = [];
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    chess.move(move);
    const val = -negamax(chess, depth - 1, -beta, -alpha, -colorSign, useQuiescence);
    chess.undo();
    scored.push({ move, score: val });
    if (difficulty === 'hard' && val > alpha) {
      alpha = val;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy') {
    // Pick among top 3–4 moves with occasional capture priority so beginners have fair tactical play
    const poolSize = Math.min(4, scored.length);
    const idx = Math.random() < 0.55 ? 0 : Math.floor(Math.random() * poolSize);
    const chosen = scored[idx].move;
    return { from: chosen.from, to: chosen.to, promotion: chosen.promotion };
  }

  if (difficulty === 'medium') {
    // Slight variety among near-equal top moves (within 25 centipawns)
    const bestScore = scored[0].score;
    const nearBest = scored.filter((s) => bestScore - s.score <= 25);
    const chosen = nearBest[Math.floor(Math.random() * Math.min(2, nearBest.length))].move;
    return { from: chosen.from, to: chosen.to, promotion: chosen.promotion };
  }

  const chosen = scored[0].move;
  return { from: chosen.from, to: chosen.to, promotion: chosen.promotion };
}

self.onmessage = (e: MessageEvent<AIRequest>) => {
  const { id, type, fen, difficulty } = e.data;
  const effectiveDiff: Difficulty = type === 'hint' ? 'hard' : difficulty;
  const best = pickBestMove(fen, effectiveDiff);
  self.postMessage({ id, type, move: best });
};
