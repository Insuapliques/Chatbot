# Deployment Guide - Catalog Pipeline Refactor

## 🚀 Deployed to Production

**Commit**: `ced05db` - refactor: implement deterministic catalog pipeline with dedup and state sync
**Date**: 2025-10-06
**Branch**: `master`

---

## ✅ What Was Deployed

### New Architecture
The message processing pipeline now follows this strict order:

```
Incoming Message
    ↓
1. Deduplication Check (messageId)
    ↓ (if duplicate) → Return 200, log to logs/dedupSkipped
    ↓
2. Human Handoff Check (modoHumano)
    ↓ (if true) → Return 200, log to logs/sendSuppressedByHuman
    ↓
3. Deterministic Catalog Matching
    ↓ (if match) → Send catalog, update state, return 200
    ↓
4. BuilderBot Flows / Custom Handler
    ↓
5. AI Service (fallback)
```

### Key Features

#### 1. **Deterministic Catalog Delivery**
- Checks `catalogoEnviado` flag before sending
- No resend unless explicit request: `/reenvia|otra vez|de nuevo|again|resend/i`
- Updates both state schemas: `catalogoEnviado`/`has_sent_catalog`
- Supports PDF, image, video, URL, text media types
- Auto-fallback to text on media errors

#### 2. **Message Deduplication**
- Tracks `ultimoMessageId` in Firestore state
- Prevents duplicate processing of same WhatsApp message
- Logs skipped duplicates to `logs/dedupSkipped/entries`

#### 3. **Human Handoff Gate**
- When `modoHumano: true`, ALL bot responses are suppressed
- Messages still logged for operator visibility
- Logs suppression to `logs/sendSuppressedByHuman/entries`

#### 4. **State Schema Synchronization**
- Unified state between BuilderBot flows and custom handler
- Automatic mapping: `estadoActual` ↔ `state`, `catalogoEnviado` ↔ `has_sent_catalog`
- See `src/conversation/stateMapper.ts`

#### 5. **Structured Logging**
All operations log to Firestore `logs/{logType}/entries`:
- `stateTransitions` - State changes with phone, from, to, intent, timestamp
- `dedupSkipped` - Duplicate message IDs
- `catalogSent` - Successful catalog sends with catalogRef
- `sendFailures` - Media send errors with payload and error message
- `sendSuppressedByHuman` - Messages blocked by human mode

---

## 📦 New Files Added

```
CLAUDE.md                        # Codebase documentation
src/conversation/stateMapper.ts  # State schema synchronizer
src/middleware/dedup.ts          # Message deduplication
tests/catalogo.service.test.ts   # Catalog tests (5 tests)
tests/dedup.test.ts              # Dedup tests (4 tests)
tests/modoHumano.test.ts         # Human mode tests (3 tests)
```

## 🔧 Modified Files

```
src/conversation/handler.ts      # Added early returns (dedup, human, catalog)
src/services/catalogo.service.ts # State-aware deterministic catalog
src/flows/welcomeFlow.ts         # Skip catalog (handled deterministically)
```

---

## 🔍 Verification Steps

### 1. Check Deployment Status
```bash
git log --oneline -1
# Should show: ced05db refactor: implement deterministic catalog pipeline...
```

### 2. Verify Tests Pass
```bash
pnpm test
# Expected: ✓ 14 tests passed (4 test files)
```

### 3. Verify Build
```bash
pnpm build
# Expected: created dist/app.js in ~3-5s
```

### 4. Monitor Logs in Production
Check Firestore collections for new log entries:
- `logs/catalogSent/entries` - Catalog sends
- `logs/dedupSkipped/entries` - Duplicate messages
- `logs/sendSuppressedByHuman/entries` - Human mode suppressions
- `logs/stateTransitions/entries` - State changes

---

## 🧪 Testing in Production

### Test Case 1: Catalog Idempotency
```
User: "quiero ver el catálogo de chompas"
→ Should send catalog once
→ Check: liveChatStates/{phone}.catalogoEnviado === true

User: "quiero ver el catálogo de chompas" (again)
→ Should NOT send (already sent)
→ Check: logs/catalogSent only has 1 entry

User: "reenvía el catálogo"
→ Should send again (explicit resend)
→ Check: logs/catalogSent has 2 entries
```

### Test Case 2: Deduplication
```
Simulate duplicate webhook (same message_id twice)
→ First: Process normally
→ Second: Skip processing
→ Check: logs/dedupSkipped has entry with messageId
```

### Test Case 3: Human Handoff
```
Set: liveChatStates/{phone}.modoHumano = true

User: "hola" or "quiero catálogo"
→ Should send NOTHING (bot suppressed)
→ Check: logs/sendSuppressedByHuman has entry
```

### Test Case 4: Media Fallback
```
Trigger catalog with invalid media URL
→ Should fallback to text with URL
→ Check: logs/sendFailures has error entry
→ Check: liveChat shows text message sent
```

---

## 🛡️ Rollback Plan

If issues occur, rollback to previous commit:

```bash
git revert ced05db
git push origin master
```

Or deploy previous stable version:
```bash
git checkout 86f3f18  # Previous commit
pnpm build
pnpm start
```

---

## 📊 Expected Behavior Changes

### Before Deployment
- ❌ Catalog could be sent multiple times (flows + handler)
- ❌ Duplicate messages processed
- ❌ Bot responds even in human mode
- ❌ State schemas inconsistent between systems

### After Deployment
- ✅ Catalog sent exactly once (deterministic)
- ✅ Duplicate messages skipped
- ✅ Bot fully suppressed in human mode
- ✅ State schemas synchronized
- ✅ Comprehensive logging for debugging

---

## 🔗 Related Documentation

- [CLAUDE.md](CLAUDE.md) - Full codebase architecture
- [README.md](README.md) - BuilderBot framework overview
- [.env.example](.env.example) - Environment configuration

---

## 📞 Support

For issues or questions:
1. Check Firestore logs collections
2. Review test files for expected behavior
3. Consult CLAUDE.md for architecture details
4. Check git history: `git log --oneline`

---

**Deployment Status**: ✅ **SUCCESSFUL**
**Verification**: All tests pass, build successful, pushed to master
