import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { LeaderboardEntry, MatchRecord, PieceColor } from '../types/chess';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore client is offline. Check Firebase configuration.');
      return false;
    }
    return true;
  }
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(result.user);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeDisplayName(name: string | null | undefined): string {
  const clean = (name || 'Commander').trim().replace(/[<>]/g, '').slice(0, 32);
  return clean.length > 0 ? clean : 'Commander';
}

function hashHue(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) % 360;
  }
  return Math.abs(h);
}

export async function ensureUserProfile(user: User): Promise<LeaderboardEntry | null> {
  if (!user.emailVerified) return null;
  const uid = user.uid;
  const displayName = sanitizeDisplayName(user.displayName);

  const privatePath = `users/${uid}`;
  try {
    const privateRef = doc(db, 'users', uid);
    const privateSnap = await getDoc(privateRef);
    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        uid,
        displayName,
        email: (user.email || '').slice(0, 128),
        preferredSide: 'w',
        preferredLang: 'vi',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  const lbPath = `leaderboard/${uid}`;
  try {
    const lbRef = doc(db, 'leaderboard', uid);
    const lbSnap = await getDoc(lbRef);
    if (!lbSnap.exists()) {
      const initialEntry: LeaderboardEntry = {
        uid,
        displayName,
        avatarHue: hashHue(uid),
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
      };
      await setDoc(lbRef, {
        ...initialEntry,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return initialEntry;
    }
    return lbSnap.data() as LeaderboardEntry;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, lbPath);
  }
}

export async function fetchLeaderboard(maxCount = 50): Promise<LeaderboardEntry[]> {
  const path = 'leaderboard';
  try {
    const q = query(collection(db, 'leaderboard'), orderBy('elo', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LeaderboardEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchUserMatches(uid: string, maxCount = 25): Promise<MatchRecord[]> {
  const path = 'matches';
  try {
    const q = query(
      collection(db, 'matches'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MatchRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function calculateEloDelta(currentElo: number, opponentElo: number, result: 'win' | 'loss' | 'draw'): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - currentElo) / 400));
  const actual = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.max(-64, Math.min(64, Math.round(32 * (actual - expected))));
}

export async function recordMatchResult(params: {
  user: User;
  mode: 'ai' | 'local' | 'online';
  opponentName: string;
  opponentElo?: number;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  reason: string;
  movesCount: number;
  durationSec: number;
  pgnSummary: string;
}): Promise<{ eloDelta: number; updatedProfile: LeaderboardEntry | null }> {
  const { user } = params;
  if (!user.emailVerified) return { eloDelta: 0, updatedProfile: null };

  const currentProfile = await ensureUserProfile(user);
  if (!currentProfile) return { eloDelta: 0, updatedProfile: null };

  const oppElo = params.opponentElo ?? 1200;
  const eloDelta = params.mode === 'local' ? 0 : calculateEloDelta(currentProfile.elo, oppElo, params.result);
  const newElo = Math.max(100, Math.min(4000, currentProfile.elo + eloDelta));

  const nextWins = currentProfile.wins + (params.result === 'win' ? 1 : 0);
  const nextLosses = currentProfile.losses + (params.result === 'loss' ? 1 : 0);
  const nextDraws = currentProfile.draws + (params.result === 'draw' ? 1 : 0);
  const nextGames = currentProfile.gamesPlayed + 1;

  const lbPath = `leaderboard/${user.uid}`;
  try {
    await updateDoc(doc(db, 'leaderboard', user.uid), {
      elo: newElo,
      wins: nextWins,
      losses: nextLosses,
      draws: nextDraws,
      gamesPlayed: nextGames,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, lbPath);
  }

  const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const matchPath = `matches/${matchId}`;
  try {
    await setDoc(doc(db, 'matches', matchId), {
      matchId,
      ownerUid: user.uid,
      mode: params.mode,
      opponentName: params.opponentName.trim().slice(0, 48) || 'Opponent',
      playerColor: params.playerColor,
      result: params.result,
      reason: params.reason.slice(0, 40),
      movesCount: Math.max(0, Math.min(1000, params.movesCount)),
      eloChange: eloDelta,
      durationSec: Math.max(0, Math.min(86400, params.durationSec)),
      pgnSummary: params.pgnSummary.slice(0, 2000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, matchPath);
  }

  return {
    eloDelta,
    updatedProfile: {
      ...currentProfile,
      elo: newElo,
      wins: nextWins,
      losses: nextLosses,
      draws: nextDraws,
      gamesPlayed: nextGames,
    },
  };
}

export async function submitSafetyReport(roomCode: string, reason: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const reportId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `reports/${reportId}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reportId,
      reporterUid: user.uid,
      roomCode: roomCode.slice(0, 12),
      reason: reason.slice(0, 120),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function saveOnlineRoomConfig(params: {
  user: User;
  roomCode: string;
  hostSideChoice: 'w' | 'b' | 'random';
  hostColor: PieceColor;
  turnMinutes: number;
}): Promise<void> {
  if (!params.user.emailVerified) return;
  const code = params.roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return;
  const guestColor: PieceColor = params.hostColor === 'w' ? 'b' : 'w';
  const clampedTurn = Math.max(0, Math.min(180, Math.floor(params.turnMinutes)));
  const path = `rooms/${code}`;
  try {
    await setDoc(doc(db, 'rooms', code), {
      roomCode: code,
      hostUid: params.user.uid,
      hostSideChoice: params.hostSideChoice,
      hostColor: params.hostColor,
      guestColor,
      turnMinutes: clampedTurn,
      status: 'waiting',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateOnlineRoomStatus(
  user: User | null,
  roomCode: string,
  status: 'playing' | 'finished'
): Promise<void> {
  if (!user || !user.emailVerified) return;
  const code = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return;
  const path = `rooms/${code}`;
  try {
    await updateDoc(doc(db, 'rooms', code), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}
