import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PieceColor = 'w' | 'b';

interface TimeControl {
  id: string;
  initialMs: number;
  incrementMs: number;
}

interface OnlinePlayerInternal {
  id: string;
  token: string;
  socketId: string | null;
  name: string;
  color: PieceColor;
  ready: boolean;
  connected: boolean;
}

interface MoveRecord {
  san: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: string;
  fenAfter: string;
}

interface GameOverInfo {
  winner: PieceColor | 'draw';
  reason: 'checkmate' | 'stalemate' | 'threefold' | 'insufficient' | 'fifty_moves' | 'timeout' | 'resign' | 'agreement';
  movesCount: number;
  durationSec: number;
}

interface SafeChatMessage {
  id: string;
  senderColor: PieceColor;
  senderName: string;
  presetKey: string;
  timestamp: number;
}

interface RoomInternal {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  chess: Chess;
  players: {
    w: OnlinePlayerInternal | null;
    b: OnlinePlayerInternal | null;
  };
  timeControl: TimeControl;
  turnMinutes?: number;
  turnDeadlineAt: number | null;
  hostColor: PieceColor;
  hostSideChoice?: 'w' | 'b' | 'random';
  clocks: {
    w: number;
    b: number;
  };
  lastTickAt: number;
  startedAt: number;
  history: MoveRecord[];
  lastMove: { from: string; to: string } | null;
  pendingDrawFrom: PieceColor | null;
  rematchRequests: { w: boolean; b: boolean };
  gameOver: GameOverInfo | null;
  chat: SafeChatMessage[];
  updatedAt: number;
}

const ALLOWED_PRESET_CHAT = new Set([
  'glhf',
  'nice_move',
  'well_played',
  'thinking',
  'oops',
  'good_game',
  'sword_salute',
  'shield_respect',
]);

const rooms = new Map<string, RoomInternal>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/[<>]/g, '').slice(0, 24);
  return cleaned.length > 0 ? cleaned : fallback;
}

function serializeRoom(room: RoomInternal) {
  const clocks = { ...room.clocks };
  if (room.status === 'playing' && room.turnMinutes && room.turnMinutes > 0 && room.turnDeadlineAt) {
    const activeTurn = room.chess.turn();
    clocks[activeTurn] = Math.max(0, room.turnDeadlineAt - Date.now());
  }
  return {
    roomCode: room.roomCode,
    status: room.status,
    fen: room.chess.fen(),
    turn: room.chess.turn(),
    players: {
      w: room.players.w
        ? {
            id: room.players.w.id,
            name: room.players.w.name,
            color: 'w' as PieceColor,
            ready: room.players.w.ready,
            connected: room.players.w.connected,
          }
        : null,
      b: room.players.b
        ? {
            id: room.players.b.id,
            name: room.players.b.name,
            color: 'b' as PieceColor,
            ready: room.players.b.ready,
            connected: room.players.b.connected,
          }
        : null,
    },
    timeControl: room.timeControl,
    turnMinutes: room.turnMinutes,
    turnDeadlineAt: room.turnDeadlineAt,
    hostColor: room.hostColor,
    hostSideChoice: room.hostSideChoice,
    clocks,
    history: room.history,
    lastMove: room.lastMove,
    pendingDrawFrom: room.pendingDrawFrom,
    rematchRequests: { ...room.rematchRequests },
    gameOver: room.gameOver,
    chat: room.chat.slice(-30),
  };
}

function evaluateGameEnd(room: RoomInternal): GameOverInfo | null {
  const durationSec = Math.max(1, Math.round((Date.now() - room.startedAt) / 1000));
  const movesCount = room.history.length;

  if (room.chess.isCheckmate()) {
    const winner: PieceColor = room.chess.turn() === 'w' ? 'b' : 'w';
    return { winner, reason: 'checkmate', movesCount, durationSec };
  }
  if (room.chess.isStalemate()) {
    return { winner: 'draw', reason: 'stalemate', movesCount, durationSec };
  }
  if (room.chess.isThreefoldRepetition()) {
    return { winner: 'draw', reason: 'threefold', movesCount, durationSec };
  }
  if (room.chess.isInsufficientMaterial()) {
    return { winner: 'draw', reason: 'insufficient', movesCount, durationSec };
  }
  if (room.chess.isDraw()) {
    return { winner: 'draw', reason: 'fifty_moves', movesCount, durationSec };
  }
  return null;
}

function findPlayerBySocket(room: RoomInternal, socketId: string): OnlinePlayerInternal | null {
  if (room.players.w?.socketId === socketId) return room.players.w;
  if (room.players.b?.socketId === socketId) return room.players.b;
  return null;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  // Serve user-provided .glb models from /models (next to index.html) and /public/models
  // Return strict 404 for missing .glb files so Vite SPA fallback never serves index.html
  app.use('/models', express.static(path.resolve(__dirname, 'models')));
  app.use('/models', express.static(path.resolve(__dirname, 'public/models')));
  app.use('/models', (_req, res) => {
    res.status(404).json({ error: 'model_not_found' });
  });

  // Serve local Three.js DRACO WASM decoders for compressed Sketchfab .glb models
  app.use('/draco', express.static(path.resolve(__dirname, 'node_modules/three/examples/jsm/libs/draco')));

  io.on('connection', (socket) => {
    socket.on(
      'room:create',
      (
        payload: {
          playerName?: string;
          timeControl?: TimeControl;
          sideChoice?: 'w' | 'b' | 'random';
          turnMinutes?: number;
        },
        ack
      ) => {
        const roomCode = generateRoomCode();
        const token = crypto.randomUUID();
        const publicId = crypto.randomUUID();
        const isSetupV2 =
          payload?.sideChoice !== undefined || typeof payload?.turnMinutes === 'number';

        let tc: TimeControl;
        let turnMinutes: number | undefined;
        let hostColor: PieceColor = 'w';
        let hostSideChoice: 'w' | 'b' | 'random' | undefined;

        if (isSetupV2) {
          const rawMin =
            typeof payload?.turnMinutes === 'number' && Number.isFinite(payload.turnMinutes)
              ? Math.floor(payload.turnMinutes)
              : 0;
          turnMinutes = Math.max(0, Math.min(180, rawMin));
          const turnMs = turnMinutes * 60 * 1000;
          tc = {
            id: turnMinutes > 0 ? `turn_${turnMinutes}m` : 'untimed',
            initialMs: turnMs,
            incrementMs: 0,
          };
          hostSideChoice =
            payload?.sideChoice === 'b' || payload?.sideChoice === 'random' ? payload.sideChoice : 'w';
          hostColor = hostSideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : hostSideChoice;
        } else {
          tc =
            payload?.timeControl && typeof payload.timeControl.initialMs === 'number'
              ? {
                  id: String(payload.timeControl.id || 'rapid10').slice(0, 16),
                  initialMs: Math.max(0, Math.min(3600000, payload.timeControl.initialMs)),
                  incrementMs: Math.max(0, Math.min(60000, payload.timeControl.incrementMs || 0)),
                }
              : { id: 'rapid10', initialMs: 10 * 60 * 1000, incrementMs: 0 };
        }

        const defaultHostName = isSetupV2
          ? hostColor === 'w'
            ? 'Ánh Sáng (Quân Đỏ)'
            : 'Bóng Đêm (Quân Tím)'
          : 'White Commander';

        const hostPlayer: OnlinePlayerInternal = {
          id: publicId,
          token,
          socketId: socket.id,
          name: sanitizeName(payload?.playerName, defaultHostName),
          color: hostColor,
          ready: false,
          connected: true,
        };

        const room: RoomInternal = {
          roomCode,
          status: 'waiting',
          chess: new Chess(),
          players: {
            w: hostColor === 'w' ? hostPlayer : null,
            b: hostColor === 'b' ? hostPlayer : null,
          },
          timeControl: tc,
          turnMinutes,
          turnDeadlineAt: null,
          hostColor,
          hostSideChoice,
          clocks: { w: tc.initialMs, b: tc.initialMs },
          lastTickAt: Date.now(),
          startedAt: Date.now(),
          history: [],
          lastMove: null,
          pendingDrawFrom: null,
          rematchRequests: { w: false, b: false },
          gameOver: null,
          chat: [],
          updatedAt: Date.now(),
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        if (typeof ack === 'function') {
          ack({ ok: true, token, playerId: publicId, color: hostColor, state: serializeRoom(room) });
        }
        io.to(roomCode).emit('room:state', serializeRoom(room));
      }
    );

    socket.on('room:update_config', (_payload: unknown, ack) => {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'setup_locked' });
      }
    });

    socket.on('room:join', (payload: { roomCode?: string; playerName?: string; token?: string }, ack) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false, error: 'not_found' });
        return;
      }

      // Check reconnect via token
      if (payload?.token) {
        const existing =
          room.players.w?.token === payload.token
            ? room.players.w
            : room.players.b?.token === payload.token
              ? room.players.b
              : null;
        if (existing) {
          existing.socketId = socket.id;
          existing.connected = true;
          room.updatedAt = Date.now();
          socket.join(code);
          if (typeof ack === 'function') {
            ack({ ok: true, token: existing.token, playerId: existing.id, color: existing.color, state: serializeRoom(room) });
          }
          io.to(code).emit('room:state', serializeRoom(room));
          return;
        }
      }

      if (room.players.w && room.players.b) {
        if (typeof ack === 'function') ack({ ok: false, error: 'room_full' });
        return;
      }

      const assignedColor: PieceColor = room.players.w ? 'b' : 'w';
      const token = crypto.randomUUID();
      const publicId = crypto.randomUUID();
      const fallbackName =
        room.turnMinutes !== undefined
          ? assignedColor === 'w'
            ? 'Ánh Sáng (Quân Đỏ)'
            : 'Bóng Đêm (Quân Tím)'
          : assignedColor === 'w'
            ? 'White Commander'
            : 'Black Commander';
      room.players[assignedColor] = {
        id: publicId,
        token,
        socketId: socket.id,
        name: sanitizeName(payload?.playerName, fallbackName),
        color: assignedColor,
        ready: false,
        connected: true,
      };
      room.updatedAt = Date.now();
      socket.join(code);
      if (typeof ack === 'function') {
        ack({ ok: true, token, playerId: publicId, color: assignedColor, state: serializeRoom(room) });
      }
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:rejoin', (payload: { roomCode?: string; token?: string }, ack) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || !payload?.token) {
        if (typeof ack === 'function') ack({ ok: false, error: 'not_found' });
        return;
      }
      const existing =
        room.players.w?.token === payload.token
          ? room.players.w
          : room.players.b?.token === payload.token
            ? room.players.b
            : null;
      if (!existing) {
        if (typeof ack === 'function') ack({ ok: false, error: 'not_found' });
        return;
      }
      existing.socketId = socket.id;
      existing.connected = true;
      room.updatedAt = Date.now();
      socket.join(code);
      if (typeof ack === 'function') {
        ack({ ok: true, token: existing.token, playerId: existing.id, color: existing.color, state: serializeRoom(room) });
      }
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:ready', (payload: { roomCode?: string; ready?: boolean }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'waiting') return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;

      player.ready = Boolean(payload?.ready);
      room.updatedAt = Date.now();

      if (room.players.w?.ready && room.players.b?.ready) {
        const now = Date.now();
        room.status = 'playing';
        room.startedAt = now;
        room.lastTickAt = now;
        if (room.turnMinutes !== undefined) {
          const turnMs = room.turnMinutes * 60 * 1000;
          room.clocks = { w: turnMs, b: turnMs };
          room.turnDeadlineAt = turnMs > 0 ? now + turnMs : null;
        }
      }
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on(
      'room:move',
      (payload: { roomCode?: string; from?: string; to?: string; promotion?: string }, ack) => {
        const code = String(payload?.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room || room.status !== 'playing') {
          if (typeof ack === 'function') ack({ ok: false, error: 'invalid_state' });
          return;
        }
        const player = findPlayerBySocket(room, socket.id);
        if (!player) {
          if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' });
          return;
        }
        if (room.chess.turn() !== player.color) {
          if (typeof ack === 'function') ack({ ok: false, error: 'not_your_turn' });
          return;
        }

        // Update clock for active side before validating move
        const now = Date.now();
        if (room.turnMinutes !== undefined) {
          if (room.turnMinutes > 0) {
            const remaining = room.turnDeadlineAt ? Math.max(0, room.turnDeadlineAt - now) : room.clocks[player.color];
            if (remaining <= 0) {
              room.clocks[player.color] = 0;
              room.turnDeadlineAt = null;
              room.status = 'finished';
              room.gameOver = {
                winner: player.color === 'w' ? 'b' : 'w',
                reason: 'timeout',
                movesCount: room.history.length,
                durationSec: Math.max(1, Math.round((now - room.startedAt) / 1000)),
              };
              io.to(code).emit('room:state', serializeRoom(room));
              if (typeof ack === 'function') ack({ ok: false, error: 'timeout' });
              return;
            }
          }
        } else if (room.timeControl.initialMs > 0) {
          const elapsed = Math.max(0, now - room.lastTickAt);
          room.clocks[player.color] = Math.max(0, room.clocks[player.color] - elapsed);
          if (room.clocks[player.color] <= 0) {
            room.status = 'finished';
            room.gameOver = {
              winner: player.color === 'w' ? 'b' : 'w',
              reason: 'timeout',
              movesCount: room.history.length,
              durationSec: Math.max(1, Math.round((now - room.startedAt) / 1000)),
            };
            io.to(code).emit('room:state', serializeRoom(room));
            if (typeof ack === 'function') ack({ ok: false, error: 'timeout' });
            return;
          }
        }

        try {
          const result = room.chess.move({
            from: String(payload?.from || ''),
            to: String(payload?.to || ''),
            promotion: payload?.promotion ? String(payload.promotion) : undefined,
          });
          if (!result) {
            if (typeof ack === 'function') ack({ ok: false, error: 'illegal_move' });
            return;
          }

          room.lastTickAt = now;
          room.pendingDrawFrom = null;
          room.lastMove = { from: result.from, to: result.to };

          const record: MoveRecord = {
            san: result.san,
            from: result.from,
            to: result.to,
            color: result.color,
            piece: result.piece,
            captured: result.captured,
            promotion: result.promotion,
            flags: result.flags,
            fenAfter: room.chess.fen(),
          };
          room.history.push(record);
          room.updatedAt = now;

          const ended = evaluateGameEnd(room);
          if (ended) {
            room.status = 'finished';
            room.gameOver = ended;
            room.turnDeadlineAt = null;
          } else if (room.turnMinutes !== undefined) {
            const turnMs = room.turnMinutes * 60 * 1000;
            room.clocks = { w: turnMs, b: turnMs };
            room.turnDeadlineAt = turnMs > 0 ? now + turnMs : null;
          } else if (room.timeControl.initialMs > 0) {
            room.clocks[player.color] += room.timeControl.incrementMs;
          }

          io.to(code).emit('room:move_applied', {
            move: record,
            state: serializeRoom(room),
          });
          if (typeof ack === 'function') ack({ ok: true });
        } catch {
          if (typeof ack === 'function') ack({ ok: false, error: 'illegal_move' });
        }
      }
    );

    socket.on('room:quick_chat', (payload: { roomCode?: string; presetKey?: string }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      const key = String(payload?.presetKey || '');
      if (!ALLOWED_PRESET_CHAT.has(key)) return;

      const msg: SafeChatMessage = {
        id: crypto.randomUUID(),
        senderColor: player.color,
        senderName: player.name,
        presetKey: key,
        timestamp: Date.now(),
      };
      room.chat.push(msg);
      if (room.chat.length > 40) room.chat.shift();
      room.updatedAt = Date.now();
      io.to(code).emit('room:chat_message', msg);
    });

    socket.on('room:draw_offer', (payload: { roomCode?: string }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      room.pendingDrawFrom = player.color;
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:draw_response', (payload: { roomCode?: string; accept?: boolean }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'playing' || !room.pendingDrawFrom) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player || player.color === room.pendingDrawFrom) return;

      if (payload?.accept) {
        room.status = 'finished';
        room.gameOver = {
          winner: 'draw',
          reason: 'agreement',
          movesCount: room.history.length,
          durationSec: Math.max(1, Math.round((Date.now() - room.startedAt) / 1000)),
        };
      }
      room.pendingDrawFrom = null;
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:resign', (payload: { roomCode?: string }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      room.status = 'finished';
      room.gameOver = {
        winner: player.color === 'w' ? 'b' : 'w',
        reason: 'resign',
        movesCount: room.history.length,
        durationSec: Math.max(1, Math.round((Date.now() - room.startedAt) / 1000)),
      };
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:rematch_request', (payload: { roomCode?: string }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'finished') return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      room.rematchRequests[player.color] = true;

      if (room.rematchRequests.w && room.rematchRequests.b) {
        // Swap sides on rematch for fairness
        const oldW = room.players.w;
        const oldB = room.players.b;
        if (oldW && oldB) {
          oldW.color = 'b';
          oldB.color = 'w';
          room.players.w = oldB;
          room.players.b = oldW;
        }
        const now = Date.now();
        room.chess = new Chess();
        room.status = 'playing';
        if (room.turnMinutes !== undefined) {
          const turnMs = room.turnMinutes * 60 * 1000;
          room.clocks = { w: turnMs, b: turnMs };
          room.turnDeadlineAt = turnMs > 0 ? now + turnMs : null;
        } else {
          room.clocks = { w: room.timeControl.initialMs, b: room.timeControl.initialMs };
        }
        room.lastTickAt = now;
        room.startedAt = now;
        room.history = [];
        room.lastMove = null;
        room.pendingDrawFrom = null;
        room.rematchRequests = { w: false, b: false };
        room.gameOver = null;
      }
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('room:leave', (payload: { roomCode?: string }) => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;

      socket.leave(code);
      if (room.status === 'waiting') {
        room.players[player.color] = null;
        if (!room.players.w && !room.players.b) {
          rooms.delete(code);
          return;
        }
      } else {
        player.connected = false;
        player.socketId = null;
      }
      io.to(code).emit('room:state', serializeRoom(room));
    });

    socket.on('disconnect', () => {
      for (const [code, room] of rooms.entries()) {
        const player = findPlayerBySocket(room, socket.id);
        if (player) {
          player.connected = false;
          player.socketId = null;
          room.updatedAt = Date.now();
          io.to(code).emit('room:state', serializeRoom(room));
        }
      }
    });
  });

  // Authoritative clock timeout & room GC interval (500ms precision)
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (room.status === 'playing') {
        const activeColor = room.chess.turn();
        if (room.turnMinutes !== undefined) {
          if (room.turnMinutes > 0 && room.turnDeadlineAt && now >= room.turnDeadlineAt) {
            room.clocks[activeColor] = 0;
            room.turnDeadlineAt = null;
            room.status = 'finished';
            room.gameOver = {
              winner: activeColor === 'w' ? 'b' : 'w',
              reason: 'timeout',
              movesCount: room.history.length,
              durationSec: Math.max(1, Math.round((now - room.startedAt) / 1000)),
            };
            io.to(code).emit('room:state', serializeRoom(room));
          }
        } else if (room.timeControl.initialMs > 0) {
          const elapsed = now - room.lastTickAt;
          if (room.clocks[activeColor] - elapsed <= 0) {
            room.clocks[activeColor] = 0;
            room.status = 'finished';
            room.gameOver = {
              winner: activeColor === 'w' ? 'b' : 'w',
              reason: 'timeout',
              movesCount: room.history.length,
              durationSec: Math.max(1, Math.round((now - room.startedAt) / 1000)),
            };
            io.to(code).emit('room:state', serializeRoom(room));
          }
        }
      }
      // Clean up idle rooms older than 60 minutes
      if (now - room.updatedAt > 60 * 60 * 1000) {
        rooms.delete(code);
      }
    }
  }, 500);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Provide a lightweight no-WebSocket @vite/client shim when HMR is disabled
    // so CSS style injection & import.meta.hot work without failing port 24678 WebSockets.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay { constructor() {} }
`);
    });
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`3D CHESS BATTLE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
