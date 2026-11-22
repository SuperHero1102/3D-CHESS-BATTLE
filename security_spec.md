# Firestore Security Specification (3D CHESS BATTLE)

## 1. Data Invariants
1. **PII Isolation**: User emails reside exclusively in `/users/{userId}` and are readable/writable only by `request.auth.uid == userId` (`allow list: if false`). Public `/leaderboard/{userId}` contains zero PII.
2. **Leaderboard Integrity**: On creation, a player MUST start at `elo == 1200`, `wins == 0`, `losses == 0`, `draws == 0`, `gamesPlayed == 0`. Updates can either change `displayName`/`avatarHue` without touching stats, or increment `gamesPlayed` by exactly 1 with `elo` delta bounded to `[-64, +64]`.
3. **Immutable Match History**: `/matches/{matchId}` records can only be created by the authenticated `ownerUid` with server timestamp `request.time`, and cannot be updated or deleted.
4. **Write-Only Moderation Reports**: `/reports/{reportId}` can only be created by an authenticated reporter with their own `reporterUid`, and cannot be read or modified via client SDKs.

## 2. Dirty Dozen Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated write to `/leaderboard/u1`.
2. Creating `/leaderboard/u1` with `elo: 3000` (stat inflation on signup).
3. Updating another user's `/leaderboard/u2` while signed in as `u1`.
4. Updating `/leaderboard/u1` with a ghost field `{ isAdmin: true }` (Shadow Update).
5. Updating `/leaderboard/u1` with `elo` jump of `+500` in a single update.
6. Reading `/users/u2` email while signed in as `u1` (PII leak).
7. Listing `/users` collection (PII scraping).
8. Creating `/matches/m1` with `ownerUid: "u2"` while signed in as `u1` (Identity Spoofing).
9. Updating or deleting an existing `/matches/m1` record.
10. Creating `/matches/m1` with a backdated `createdAt` not equal to `request.time`.
11. Creating `/leaderboard/invalid$id!` with poisoned path ID characters or oversized strings.
12. Reading `/reports` collection as a regular authenticated user.
