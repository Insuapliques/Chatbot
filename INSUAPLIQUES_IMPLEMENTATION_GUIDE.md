# 🔧 Insuapliques Chatbot - Implementation Guide

This guide provides ready-to-paste code fixes and configuration for adapting the chatbot to Insuapliques business context.

---

## 📋 TABLE OF CONTENTS

1. [Critical Fixes Summary](#critical-fixes-summary)
2. [Firestore Configuration](#firestore-configuration)
3. [Code Updates](#code-updates)
4. [Price List Format](#price-list-format)
5. [Integration Testing](#integration-testing)
6. [QA Test Scripts](#qa-test-scripts)

---

## 🔴 CRITICAL FIXES SUMMARY

### Issues Found

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Wrong brand name ("Mimétisa") | `handler.ts:235` | Brand confusion |
| 2 | Generic product list (chompas, joggers) | `extraerProductoDelMensaje.ts`, `handler.ts:16` | Cannot detect Insuapliques products |
| 3 | No combo/variant support | `priceListLoader.ts` | Cannot quote combos accurately |
| 4 | Hardcoded prices | `dtfFlow.ts:7` | Violates "no invention" rule |
| 5 | Weak intent detection | Multiple flows | Misses user intents |
| 6 | No guided purchase flow | Missing | Poor UX for quotes |

### Solutions Provided

✅ **New `priceListLoader.ts`** - Supports combos, variants (size/color), quantity tiers
✅ **New `intentDetector.ts`** - Insuapliques-specific intent patterns
✅ **New `guidedPurchase.ts`** - Step-by-step purchase flow manager
✅ **Base prompt** - Complete Insuapliques training prompt
✅ **Closing menu** - Firestore-driven conversation end flow

---

## ⚙️ FIRESTORE CONFIGURATION

### 1. Update Base Prompt

**Document**: `settings/EntrenamientoConfig`

Copy the entire content from [`INSUAPLIQUES_BASE_PROMPT.md`](./INSUAPLIQUES_BASE_PROMPT.md) into the `promptBase` field.

**Also set these fields in the same document**:

```json
{
  "promptBase": "[PASTE FULL PROMPT FROM INSUAPLIQUES_BASE_PROMPT.md]",

  "closingWords": [
    "gracias",
    "eso es todo",
    "ya está",
    "nada más",
    "perfecto",
    "listo",
    "chao",
    "adiós",
    "bye"
  ],

  "closingMenu": "¡Perfecto! ¿Qué te gustaría hacer?\n\n1️⃣ Seguir comprando\n2️⃣ Ver catálogo completo\n3️⃣ Hablar con un asesor\n4️⃣ Finalizar conversación\n\nResponde con el número.",

  "params": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "top_p": 1,
    "presence_penalty": 0,
    "frequency_penalty": 0
  },

  "stream": false,
  "timeoutMs": 20000
}
```

---

### 2. Configure Price List Document

**Document**: `settings/archivo_entrenamiento`

```json
{
  "Name": "LISTA DE PRECIOS.xlsx",
  "Path": "Entrenamiento/LISTA DE PRECIOS.xlsx",
  "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "url": "https://firebasestorage.googleapis.com/v0/b/YOUR_BUCKET/o/Entrenamiento%2FLISTA%20DE%20PRECIOS.xlsx?alt=media",
  "UpdatedAt": "2025-01-15T00:00:00Z"
}
```

**Important**:
- Either `url` or `Path` must be valid
- `url` is preferred for faster loading
- See [Price List Format](#price-list-format) for XLSX structure

---

### 3. Configure Catalog Resources

**Collection**: `productos_chatbot`

Create documents for each catalog type:

**Document: `catalogo_general`**
```json
{
  "keyword": ["catalogo", "catálogo", "modelos", "diseños", "productos"],
  "respuesta": "¡Aquí está nuestro catálogo completo de Insuapliques! 📘",
  "tipo": "pdf",
  "url": "https://firebasestorage.googleapis.com/v0/b/YOUR_BUCKET/o/catalogo_insuapliques.pdf?alt=media"
}
```

**Document: `parches`**
```json
{
  "keyword": ["parches", "patches", "bordados"],
  "respuesta": "Mira nuestros modelos de parches 🏷️",
  "tipo": "image",
  "url": "https://firebasestorage.googleapis.com/v0/b/YOUR_BUCKET/o/parches_catalogo.jpg?alt=media"
}
```

**Document: `dtf`**
```json
{
  "keyword": ["dtf", "estampados", "prints", "transfer"],
  "respuesta": "Conoce nuestros estampados DTF 🎨",
  "tipo": "image",
  "url": "https://firebasestorage.googleapis.com/v0/b/YOUR_BUCKET/o/dtf_samples.jpg?alt=media"
}
```

---

### 4. Update Welcome Messages

**Document**: `settings/welcome_messages`

```json
{
  "saludoSinNombre": "¡Hola! Bienvenido/a a Insuapliques 👋\n\nSomos especialistas en parches, estampados DTF y camisetas personalizadas.",

  "pedirNombre": "Para ofrecerte un mejor servicio, ¿cómo te llamas?",

  "saludoConNombre": "¡Hola de nuevo, {{nombre}}! 😊\n\n¿En qué puedo ayudarte hoy?",

  "agradecerNombre": "¡Encantado de conocerte, {{nombre}}! 🙌\n\n¿Te interesa conocer nuestros productos?",

  "atencionHumana": "Te conecto con un asesor humano de inmediato. Por favor espera un momento 👤.",

  "cierreOpcion1": "¡Perfecto! Sigo aquí para lo que necesites. ¿Qué más te gustaría saber?",

  "cierreOpcion2": "Te envío el catálogo completo 📘 [El sistema enviará el catálogo automáticamente]",

  "cierreOpcion3": "Un asesor humano se comunicará contigo pronto. ¡Gracias por tu paciencia! 👤",

  "cierreOpcion4": "¡Fue un placer ayudarte! Vuelve pronto a Insuapliques 😊\n\nRecuerda que estamos en Instagram: @insuapliques",

  "cierreDefault": "Por favor elige una opción válida (1, 2, 3 o 4)."
}
```

---

## 💻 CODE UPDATES

### Update 1: Fix Brand Name in Handler

**File**: `src/conversation/handler.ts`

**Line 235** - Replace:
```typescript
await sendTextIfNeeded('¡Hola! Soy tu asistente de Mimétisa. ¿En qué puedo ayudarte hoy?', 'SALUDO');
```

**With**:
```typescript
await sendTextIfNeeded('¡Hola! Soy tu asistente de Insuapliques. ¿En qué puedo ayudarte hoy? 👋', 'SALUDO');
```

---

### Update 2: Remove Hardcoded Prices from DTF Flow

**File**: `src/flows/dtfFlow.ts`

**Replace entire file with**:

```typescript
import { addKeyword } from "@builderbot/bot";

export const dtfFlow = addKeyword([
  "precio estampado",
  "cuánto vale el estampado",
  "valor dtf",
  "precio dtf",
  "dtf personalizado"
])
  .addAnswer("🖨️ Los estampados DTF varían según el tamaño y la cantidad.")
  .addAnswer(
    "¿Podrías decirme qué medidas necesitas (A6, A5, A4, A3) y cuántas unidades estás pensando?",
    { capture: true },
    async (ctx, { flowDynamic }) => {
      const detalle = ctx.body;

      // Don't quote prices here - let AI handle it with price list context
      const response = "Déjame consultar los precios exactos según tus especificaciones. Un momento...";

      await flowDynamic(response);

      // AI flow will take over with price list context
    }
  );
```

---

### Update 3: Add Intent Detection to Welcome Flow

**File**: `src/flows/welcomeFlow.ts`

**Add import at top**:
```typescript
import { detectIntent, containsProductMention } from '../services/intentDetector.js';
```

**After line 143** (before calling AI), **add**:

```typescript
// Detect intent before calling AI
const intentResult = detectIntent(ctx.body);
console.log(`[welcomeFlow] Detected intent: ${intentResult.intent} (confidence: ${intentResult.confidence})`);

// Add intent to context metadata
const contextWithIntent = {
  flow: 'inteligenciaArtificialFlow',
  state: state?.state ?? estado?.state ?? undefined,
  has_sent_catalog: Boolean(state?.has_sent_catalog ?? estado?.has_sent_catalog),
  last_intent: intentResult.intent,
  userId: ctx.from,
  detected_intent: intentResult.intent,
  intent_confidence: intentResult.confidence
};
```

**Then replace** the `answerWithPromptBase` call's `contextMetadata` parameter:

```typescript
const respuestaIA = await answerWithPromptBase({
  conversationId: ctx.from,
  userMessage: ctx.body,
  contextMetadata: contextWithIntent, // Use the enhanced context
});
```

---

### Update 4: Integrate Guided Purchase (Optional but Recommended)

**File**: `src/flows/purchaseFlow.ts` (CREATE NEW FILE)

```typescript
import { addKeyword } from "@builderbot/bot";
import {
  processPurchaseMessage,
  clearPurchaseState,
  calculateShipping
} from "../services/guidedPurchase.js";
import { guardarConversacionEnHistorial } from "../services/chatLogger.js";

export const purchaseFlow = addKeyword([
  "quiero comprar",
  "hacer pedido",
  "necesito cotización",
  "cotización",
  "cotizar"
]).addAction(async (ctx, { flowDynamic }) => {
  try {
    const result = await processPurchaseMessage(ctx.from, ctx.body);

    await guardarConversacionEnHistorial(ctx, result.nextPrompt, "bot");
    await flowDynamic(result.nextPrompt);

    if (result.isComplete) {
      // Trigger confirmation flow
      await flowDynamic(
        "Si confirmas, registraremos tu pedido y te contactaremos para coordinar el pago y la entrega."
      );
    }
  } catch (error) {
    console.error("[purchaseFlow] Error:", error);
    await flowDynamic(
      "Hubo un error procesando tu pedido. ¿Quieres que te conecte con un asesor humano?"
    );
  }
});
```

**Then add to** `src/flows.ts`:

```typescript
import { purchaseFlow } from "./flows/purchaseFlow.js";

export const main = createFlow([
  welcomeFlow,
  registrarNombreFlow,
  inteligenciaArtificialFlow,
  asesorHumanoFlow,
  clientesIndecisosFlow,
  dtfFlow,
  enviosFlow,
  purchaseFlow  // ADD THIS LINE
]);
```

---

## 📊 PRICE LIST FORMAT

### XLSX Column Structure

The price list loader (`priceListLoader.ts`) expects these columns (case-insensitive):

| Column Name | Required | Description | Example |
|-------------|----------|-------------|---------|
| `producto` / `Producto` | ✅ | Product name | "Parche bordado 8x8 cm" |
| `precio` / `Precio` | ✅ | Unit price | 15000 or "15.000" |
| `tipo` / `Tipo` | ⭕ | Category | "parche", "dtf", "camiseta" |
| `categoria` / `Categoria` | ⭕ | Sub-category | "Bordado", "Full Color" |
| `talla` / `Talla` | ⭕ | Size variant | "M", "L", "XL" |
| `color` / `Color` | ⭕ | Color variant | "Negro", "Blanco" |
| `cantidad_min` / `CantidadMin` | ⭕ | Min qty for price tier | 50 |
| `cantidad_max` / `CantidadMax` | ⭕ | Max qty for price tier | 100 |
| `descripcion` / `Descripcion` | ⭕ | Product description | "Alta durabilidad" |
| `combo` / `Combo` | ⭕ | Mark as combo | "SI", "1", "true" |
| `incluye` / `Incluye` | ⭕ | Combo contents | "10 parches + 5 camisetas" |
| `precio_base` / `PrecioBase` | ⭕ | Base price (for variants) | 12000 |

---

### Example XLSX Data

```
| producto                | tipo    | precio | talla | color  | cantidad_min | combo | incluye                    |
|------------------------|---------|--------|-------|--------|--------------|-------|---------------------------|
| Parche bordado 8x8 cm  | parche  | 15000  |       |        |              |       |                           |
| Parche bordado 8x8 cm  | parche  | 12000  |       |        | 50           |       |                           |
| Parche bordado 8x8 cm  | parche  | 10000  |       |        | 100          |       |                           |
| Estampado DTF A5       | dtf     | 8000   |       |        |              |       |                           |
| Estampado DTF A4       | dtf     | 12000  |       |        |              |       |                           |
| Camiseta básica        | camiseta| 25000  | S     | Negro  |              |       |                           |
| Camiseta básica        | camiseta| 25000  | M     | Negro  |              |       |                           |
| Camiseta básica        | camiseta| 25000  | L     | Negro  |              |       |                           |
| Camiseta básica        | camiseta| 25000  | S     | Blanco |              |       |                           |
| Combo Deportivo        | combo   | 180000 |       |        |              | SI    | 10 parches + 10 camisetas |
| Combo Corporativo      | combo   | 350000 |       |        |              | SI    | 20 parches + 15 camisetas |
```

**The loader will**:
- Group rows with same `producto` into single entry with multiple variants
- Detect combos by `combo` column or "combo"/"paquete" in product name
- Format quantity tiers as "50+ unidades: $12.000"
- Format size/color variants as "(talla M, negro)"

---

## 🧪 INTEGRATION TESTING

### Step 1: Test Price List Loading

Run this in Node.js console or create test script:

```typescript
import { loadPriceListForAI } from './src/services/priceListLoader.js';

const priceList = await loadPriceListForAI();
console.log(priceList);
```

**Expected output**:
```
📋 LISTA DE PRECIOS INSUAPLIQUES - ACTUALIZADA

IMPORTANTE: Usa EXACTAMENTE estos precios. NUNCA inventes valores.

═══ COMBOS Y PAQUETES ═══
• Combo Deportivo
  Incluye: 10 parches + 10 camisetas
  Precio: $180.000

...
```

If you see `⚠️ LISTA DE PRECIOS NO DISPONIBLE`, check:
1. `settings/archivo_entrenamiento` document exists
2. `Path` or `url` field is correct
3. XLSX file is accessible

---

### Step 2: Test Intent Detection

```typescript
import { detectIntent } from './src/services/intentDetector.js';

console.log(detectIntent("Cuánto cuesta el combo deportivo"));
// Expected: { intent: 'PRICES_COMBOS', confidence: ..., matchedKeywords: ['cuanto', 'cuesta', 'combo'] }

console.log(detectIntent("Quiero ver el catálogo"));
// Expected: { intent: 'CATALOG', confidence: ..., matchedKeywords: ['catalogo'] }

console.log(detectIntent("Gracias, eso es todo"));
// Expected: { intent: 'CLOSING', confidence: ..., matchedKeywords: ['gracias', 'eso es todo'] }
```

---

### Step 3: Test Guided Purchase

```typescript
import { initializePurchase, processPurchaseMessage } from './src/services/guidedPurchase.js';

const phone = "573001234567";

// Initialize
await initializePurchase(phone, "Parche bordado", "parche");

// Simulate user messages
let result = await processPurchaseMessage(phone, "Necesito 50 unidades");
console.log(result.nextPrompt); // Should ask for city

result = await processPurchaseMessage(phone, "Envío a Bogotá");
console.log(result.nextPrompt); // Should show confirmation summary

result = await processPurchaseMessage(phone, "Sí, confirmo");
console.log(result.isComplete); // Should be true
```

---

## ✅ QA TEST SCRIPTS

### Test 1: Catalog Request

**User**: `Hola, quiero ver el catálogo`

**Expected Bot Behavior**:
1. Deterministic catalog service sends PDF/image from `productos_chatbot` collection
2. Bot responds: "¡Claro! Te envío nuestro catálogo actualizado 📘. ¿Hay algo específico que te interese?"
3. State updated: `catalogoEnviado: true`, `estadoActual: 'CATALOGO_ENVIADO'`

**Validation**:
```bash
# Check Firestore
liveChatStates/{phone} → catalogoEnviado === true
liveChat → check last message has fileType === 'document' or 'image'
logs/catalogSent/entries → check recent entry for this phone
```

---

### Test 2: Combo Price Query (Found in List)

**User**: `Cuánto cuesta el combo deportivo?`

**Expected Bot Behavior**:
1. Intent detected: `PRICES_COMBOS`
2. Price list loaded into AI context
3. Bot responds with exact price from list:
   - Example: "El Combo Deportivo cuesta $180.000. Incluye 10 parches bordados + 10 camisetas básicas. ¿Cuántas unidades necesitas?"
4. **Must cite** price from list, never invent

**Validation**:
```bash
# Check AI response includes price AND doesn't invent
grep "Combo Deportivo" liveChat/{latest_bot_message}
# Should match price from XLSX exactly
```

---

### Test 3: Combo Price Query (NOT Found in List)

**User**: `Cuánto cuesta el combo escolar?`

**Expected Bot Behavior**:
1. AI searches price list context for "combo escolar"
2. Not found
3. Bot responds: "No tengo ese combo específico en mi lista actual. Puedo ofrecerte [alternative products] o conectarte con un asesor humano. ¿Qué prefieres?"
4. **Must NOT invent** a price

**Validation**:
```bash
# Verify bot does NOT say a price for "combo escolar"
# Should offer alternatives or human handoff
```

---

### Test 4: Guided Purchase Flow

**Conversation**:
1. **User**: `Quiero comprar parches bordados`
2. **Bot**: `¿Cuántas unidades de parches bordados necesitas?`
3. **User**: `50 unidades de 8x8 cm`
4. **Bot**: `¿De qué color lo prefieres?`
5. **User**: `Negro`
6. **Bot**: `¿A qué ciudad lo enviamos?`
7. **User**: `Bogotá`
8. **Bot**:
   ```
   Resumen de tu pedido 🧾:
   • Producto: Parches bordados 8x8 cm
   • Cantidad: 50 unidades
   • Color: Negro
   • Subtotal: $[price from list]
   • Envío a Bogotá: $8.000
   • Total: $[subtotal + shipping]

   ¿Confirmas tu pedido? (Responde Sí/No)
   ```

**Validation**:
```bash
# Check purchaseStates/{phone} has all fields:
{
  "producto": "Parches bordados 8x8 cm",
  "cantidad": 50,
  "color": "Negro",
  "ciudad": "Bogotá",
  "step": "CONFIRMACION"
}
```

---

### Test 5: DTF Customization Flow

**User**: `Necesito estampados DTF con mi logo`

**Expected Bot Behavior**:
1. Intent detected: `CUSTOMIZATION`
2. Bot asks: "¡Genial! ¿Qué tamaño aproximado necesitas? (A6, A5, A4, A3...)"
3. **User**: `A5`
4. Bot: "Perfecto, tamaño A5. Por favor envía tu archivo de diseño en PNG o PDF (preferible fondo transparente) 📎."
5. **User**: `No tengo diseño`
6. Bot: "Sin problema, podemos crearlo por ti. Descríbeme tu logo o idea, y te cotizamos el servicio de diseño 🎨."

**Validation**:
- Bot must ask for design file
- If user doesn't have, must offer design service

---

### Test 6: Human Handoff

**User**: `Quiero hablar con alguien`

**Expected Bot Behavior**:
1. Intent detected: `HUMAN_HANDOVER`
2. Bot responds: "Entendido, te conecto con un asesor humano. Un momento por favor 👤."
3. State updated: `modoHumano: true`
4. All subsequent messages are suppressed (bot doesn't auto-reply)

**Validation**:
```bash
liveChatStates/{phone} → modoHumano === true
# Send another message, bot should NOT respond
# Check logs/sendSuppressedByHuman/entries for recent entry
```

---

### Test 7: Closing Menu

**User**: `Gracias, eso es todo`

**Expected Bot Behavior**:
1. Intent detected: `CLOSING`
2. Bot responds with closing menu:
   ```
   ¡Perfecto! ¿Qué te gustaría hacer?

   1️⃣ Seguir comprando
   2️⃣ Ver catálogo completo
   3️⃣ Hablar con un asesor
   4️⃣ Finalizar conversación

   Responde con el número.
   ```
3. State updated: `estado: 'cierre'`
4. **User**: `3`
5. Bot: "Un asesor humano se comunicará contigo pronto. ¡Gracias por tu paciencia! 👤"
6. State updated: `modoHumano: true`

**Validation**:
```bash
# After "gracias", check:
liveChatStates/{phone} → estado === 'cierre'

# After "3", check:
liveChatStates/{phone} → modoHumano === true
```

---

### Test 8: Coherence & Tone

Run multiple conversations and verify:

✅ Bot always uses "Insuapliques" (never "Mimétisa")
✅ Moderate emoji use (1-2 per message, not excessive)
✅ Same tone throughout (friendly, professional, helpful)
✅ No contradictions (if says "Envío gratis", doesn't charge later)
✅ No topic jumping (doesn't suddenly talk about unrelated products)

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] Base prompt updated in Firestore `settings/EntrenamientoConfig`
- [ ] Closing words and menu configured
- [ ] Price list XLSX uploaded to Firebase Storage
- [ ] `settings/archivo_entrenamiento` document configured with correct Path/URL
- [ ] Catalog resources uploaded to Storage and configured in `productos_chatbot`
- [ ] Welcome messages updated in `settings/welcome_messages`
- [ ] Brand name fixed in `handler.ts`
- [ ] Hardcoded prices removed from `dtfFlow.ts`
- [ ] Intent detection integrated in `welcomeFlow.ts`
- [ ] All 8 QA tests passed
- [ ] Tested with real WhatsApp number

---

## 📞 SUPPORT

If you encounter issues:

1. Check Firestore console for correct document structure
2. Check Firebase Storage permissions (files must be publicly readable)
3. Check server logs for errors: `grep -i "error\|warn" logs/*.log`
4. Verify XLSX columns match expected format
5. Test price list loader in isolation first

---

**Version**: 1.0
**Last Updated**: January 2025
**Compatible with**: BuilderBot + MetaProvider + Firestore
