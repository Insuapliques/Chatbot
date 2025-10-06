# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WhatsApp chatbot for Mimétisa (textile/personalization products) built on the BuilderBot framework, using Meta's WhatsApp Business API as the provider. The backend is Firebase/Firestore, with OpenAI GPT-5 for conversational AI and a deterministic catalog system that runs before AI for product queries.

**Package manager**: `pnpm` (version 9.12.2)

## Development Commands

```bash
# Development
pnpm dev              # Run dev server with hot reload (tsx watch)
pnpm build            # Build production bundle (rollup)
pnpm start            # Run production build

# Testing
pnpm test             # Run all tests (vitest)
pnpm test:ai          # Run AI service integration test script

# Code Quality
pnpm lint             # Run ESLint (includes builderbot plugin)
```

### Testing Notes
- Tests are in `tests/` directory with `.test.ts` extension
- Vitest config uses Node environment
- Path alias `~` maps to `src/`

## Architecture Overview

### Hybrid Conversation System

This codebase has **two parallel conversation handling systems** that must be coordinated:

1. **BuilderBot Flows** ([src/flows/](src/flows/)) - Traditional keyword-triggered flows using `addKeyword()` patterns
2. **Custom Conversation Handler** ([src/conversation/handler.ts](src/conversation/handler.ts)) - State machine-based handler that intercepts Meta provider messages directly

**Critical**: The custom handler runs on `adapterProvider.on('message')` and can short-circuit flows by setting `ctx.body = ''`. Both systems write to the same `liveChatStates` collection but use different state schemas:
- BuilderBot flows use: `state`, `has_sent_catalog`, `last_intent`, `slots`, `modoHumano`
- Custom handler uses: `estadoActual`, `productoActual`, `catalogoEnviado`, `pedidoEnProceso`, `flags`

When modifying conversation logic, ensure both state schemas remain synchronized.

### Deterministic Catalog System

Before any AI call, the system attempts **deterministic catalog matching** via [src/services/catalogo.service.ts](src/services/catalogo.service.ts):

1. `intentarEnviarCatalogo()` checks user message for product keywords
2. If match found in `productos_chatbot` Firestore collection, sends media (PDF/image/video) via Meta provider's native methods
3. Sets `ctx.body = ''` to prevent downstream processing
4. Only if no match does the message proceed to AI

**Important**: When adding product types, update both:
- `productos_chatbot` Firestore collection (with `keyword`, `respuesta`, `tipo`, `url` fields)
- `PRODUCTOS` array in [src/conversation/handler.ts](src/conversation/handler.ts#L16) for product detection

### AI Service with Catalog Citation

[src/services/aiService.ts](src/services/aiService.ts) handles OpenAI integration with advanced features:

- **Catalog Indexing**: Queries `catalog_index` collection for keyword/intent matches and injects references into the prompt
- **Version Citation**: Automatically appends `(Catálogo vYYYY-MM)` citation to AI responses when catalog context is used
- **User Memory**: Extracts and stores user preferences (via [memoryExtractor.ts](src/services/memoryExtractor.ts)) in `user_memories` collection, loads top K most recent memories as context
- **Fallback LLM**: Supports Ollama or custom HTTP endpoints when OpenAI fails (configured via `LLM_FALLBACK` env var with circuit breaker pattern)
- **Sampling Parameters**: Note that `temperature` and `top_p` are automatically skipped for GPT-5 models as they don't support these parameters

**Citation Format**: When modifying AI responses that use catalog data, ensure the citation format `(Catálogo v2024-11)` is preserved.

### State Management

Two state management systems coexist:

1. **[src/services/stateManager.ts](src/services/stateManager.ts)** - Used by BuilderBot flows
   - States: `GREETING`, `DISCOVERY`, `CATALOG_SENT`, `ASSISTED_SELECTION`, `ORDER_IN_PROGRESS`, `POST_ORDER`, `CLOSING`
   - Includes cooldown tracking for repeated questions (`asked_recently`)

2. **[src/conversation/state.ts](src/conversation/state.ts)** - Used by custom handler
   - States: `GREETING`, `DISCOVERY`, `CATALOGO_ENVIADO`, `COTIZACION`, `CONFIRMACION`, `CIERRE`
   - Includes intent throttling to prevent duplicate responses within 90s
   - Message deduplication via `ultimoMessageId`

Both write to `liveChatStates` collection but with different field names. When querying state, check both schemas.

### Firebase Collections

Key Firestore collections:

- `liveChatStates/{phone}` - Current conversation state (both schemas)
- `liveChat` - Message history with `origen` field (cliente/bot/operador)
- `productos_chatbot` - Deterministic catalog entries (keyword-based)
- `catalog_index` - AI-enhanced catalog with keywords, intents, versions for semantic matching
- `user_memories` - Extracted user preferences/facts for personalization
- `settings/EntrenamientoConfig` - Live AI prompt configuration (supports hot reload via Firestore listener)
- `settings/welcome_messages` - Dynamic message templates with `{{nombre}}` placeholder support
- `logs/{logType}/entries` - Structured logging (stateTransitions, dedupSkipped, catalogSent, sendFailures)

### Authentication & Security

[src/middleware/security.ts](src/middleware/security.ts) provides:
- `authenticateRequest` - API key validation via `X-Api-Key` or `X-Service-Token` headers
- `auditAccess` - Request logging with correlation IDs

All API routes (`/api/*`, `/panel/*`, `/v1/*`) are protected. Webhook routes (`/webhook`) are excluded from middleware.

### Prompt Management

[src/services/promptManager.ts](src/services/promptManager.ts) manages dynamic AI configuration:

- Loads from Firestore document at path `FIRESTORE_PROMPT_DOC_PATH` (default: `settings/EntrenamientoConfig`)
- Establishes real-time listener (`onSnapshot`) for hot configuration updates without restart
- Supports `closingWords` array for detecting conversation end triggers
- All LLM parameters (temperature, max_tokens, top_p, etc.) are stored in Firestore and cached in memory

When modifying AI behavior, prefer updating Firestore over code changes.

## Module System & Build

**Critical**: This project is **ESM-only** (`"type": "module"` in package.json):

- All imports must include `.js` extensions, even for `.ts` source files:
  ```typescript
  import { foo } from './bar.js'  // Correct - even though source is bar.ts
  ```
- TypeScript uses `NodeNext` module resolution
- Rollup bundles to `dist/app.js` as ESM format
- `firebase-admin` is marked as external in rollup config
- Path alias `~/` maps to `src/` (configured in tsconfig.json and vitest.config.ts)

### Build Pipeline

1. **Development**: `tsx watch` for TypeScript execution with hot reload
2. **Production**: Rollup bundles with `rollup-plugin-typescript2`
   - Input: `src/app.ts`
   - Output: `dist/app.js` (ESM format, no sourcemaps)
   - TypeScript override: Uses `Bundler` moduleResolution for rollup

## Key Implementation Patterns

### Conversation Flow Priority

Messages are processed in this order:

1. Message deduplication check (`ultimoMessageId`)
2. Deterministic catalog matching (`intentarEnviarCatalogo`)
3. `modoHumano` gate (if active, all bot processing stops)
4. BuilderBot flow keyword matching
5. Custom handler state machine transitions
6. AI service fallback

### Human Handoff

When `modoHumano: true` is set in `liveChatStates/{phone}`:
- All bot responses are suppressed
- Messages still logged to `liveChat` for operator visibility
- Panel endpoint `/panel/send` returns 423 status if handoff is active
- To exit: Delete the state document or set `modoHumano: false`

### Media Handling

[src/utils/media.ts](src/utils/media.ts) handles WhatsApp media:
- Downloads from Meta API using message file ID
- Uploads to Firebase Storage bucket
- Returns public URL for storage in `liveChat` collection
- Supports image, audio, video, document types

### Order Confirmation Flow

The custom handler ([handler.ts](src/conversation/handler.ts)) implements a mini order flow:

1. Detects order details (quantity, size, color, price mentions) via regex
2. Builds summary and asks for confirmation
3. Transitions to `CONFIRMACION` state
4. Waits for positive/negative confirmation regex
5. Either proceeds to `CIERRE` or allows modifications

This runs independently of BuilderBot flows and may conflict if flows also handle orders.

## Environment Configuration

See [.env.example](.env.example) for all required variables. Key settings:

- `OPENAI_API_KEY`, `LLM_MODEL` - AI service config
- `LLM_FALLBACK` - Fallback provider (format: `ollama:model-name` or `https://...`)
- `FIRESTORE_PROMPT_DOC_PATH` - Path to prompt config in Firestore
- `MEMORY_TOP_K` - Number of user memories to load as context (default: 6)
- `LLM_CATALOG_MAX_MATCHES` - Max catalog entries to inject into AI prompt (default: 3)
- Meta credentials: `META_TOKEN`, `META_WABA_ID`, `META_PHONE_ID`, `WEBHOOK_VERIFY_TOKEN`
- Firebase: `FIREBASE_SERVICE_ACCOUNT` (inline JSON)

## Deployment Notes

- Uses Firebase Admin SDK with inline service account JSON (not file path)
- Server listens on `PORT` env var (default: 3008)
- BuilderBot's HTTP server handles both webhook and Express routes via middleware delegation
- Webhook routes start with `/webhook`, API routes with `/api`, `/panel`, `/v1`
- CORS configuration uses `ALLOWED_ORIGINS` comma-separated list
