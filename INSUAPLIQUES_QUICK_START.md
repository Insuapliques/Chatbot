# ⚡ Insuapliques Chatbot - Quick Start Guide

**Goal**: Get your chatbot running with Insuapliques branding in under 1 hour.

---

## 📋 PRE-FLIGHT CHECKLIST

Before you start, ensure you have:

- [ ] Firebase Admin access (Firestore + Storage)
- [ ] Price list XLSX file ready (see format below)
- [ ] Catalog PDF/images ready for upload
- [ ] Code deployment access (Git + server)

---

## 🚀 5-STEP DEPLOYMENT

### STEP 1: Upload Files to Firebase Storage (10 min)

**Upload these files**:

1. **Price List XLSX**
   - Path: `Entrenamiento/LISTA DE PRECIOS.xlsx`
   - Get public URL after upload

2. **Catalog PDF**
   - Path: `catalogo_insuapliques.pdf`
   - Get public URL

3. **Product Images** (optional)
   - `parches_catalogo.jpg`
   - `dtf_samples.jpg`
   - `camisetas_catalogo.jpg`

**Quick command** (if using Firebase CLI):
```bash
firebase storage:upload LISTA_DE_PRECIOS.xlsx gs://YOUR_BUCKET/Entrenamiento/
firebase storage:upload catalogo_insuapliques.pdf gs://YOUR_BUCKET/
```

---

### STEP 2: Configure Firestore (15 min)

**Document 1**: `settings/EntrenamientoConfig`

```json
{
  "promptBase": "[COPY ENTIRE CONTENT FROM INSUAPLIQUES_BASE_PROMPT.md]",
  "closingWords": ["gracias", "eso es todo", "ya está", "nada más", "perfecto", "listo", "chao", "adiós", "bye"],
  "closingMenu": "¡Perfecto! ¿Qué te gustaría hacer?\n\n1️⃣ Seguir comprando\n2️⃣ Ver catálogo completo\n3️⃣ Hablar con un asesor\n4️⃣ Finalizar conversación\n\nResponde con el número.",
  "params": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "top_p": 1
  }
}
```

**Document 2**: `settings/archivo_entrenamiento`

```json
{
  "Name": "LISTA DE PRECIOS.xlsx",
  "Path": "Entrenamiento/LISTA DE PRECIOS.xlsx",
  "url": "https://firebasestorage.googleapis.com/.../LISTA%20DE%20PRECIOS.xlsx?alt=media"
}
```

**Document 3**: `settings/welcome_messages`

```json
{
  "saludoSinNombre": "¡Hola! Bienvenido/a a Insuapliques 👋\n\nSomos especialistas en parches, estampados DTF y camisetas personalizadas.",
  "pedirNombre": "Para ofrecerte un mejor servicio, ¿cómo te llamas?",
  "saludoConNombre": "¡Hola de nuevo, {{nombre}}! 😊\n\n¿En qué puedo ayudarte hoy?",
  "agradecerNombre": "¡Encantado de conocerte, {{nombre}}! 🙌\n\n¿Te interesa conocer nuestros productos?",
  "atencionHumana": "Te conecto con un asesor humano de inmediato. Por favor espera un momento 👤.",
  "cierreOpcion4": "¡Fue un placer ayudarte! Vuelve pronto a Insuapliques 😊"
}
```

**Collection**: `productos_chatbot`

Create document `catalogo_general`:
```json
{
  "keyword": ["catalogo", "catálogo", "modelos", "diseños"],
  "respuesta": "¡Aquí está nuestro catálogo completo! 📘",
  "tipo": "pdf",
  "url": "https://firebasestorage.googleapis.com/.../catalogo_insuapliques.pdf?alt=media"
}
```

---

### STEP 3: Update Code (15 min)

**A. Replace files**:

1. Copy entire content of new `priceListLoader.ts` → `src/services/priceListLoader.ts`

2. Create new file `src/services/intentDetector.ts` (provided in deliverables)

3. Create new file `src/services/guidedPurchase.ts` (provided in deliverables)

**B. Update existing files**:

**File**: `src/conversation/handler.ts` (line 235)
```typescript
// Change this line:
await sendTextIfNeeded('¡Hola! Soy tu asistente de Insuapliques. ¿En qué puedo ayudarte hoy? 👋', 'SALUDO');
```

**File**: `src/flows/dtfFlow.ts` (replace entire file)
```typescript
import { addKeyword } from "@builderbot/bot";

export const dtfFlow = addKeyword([
  "precio estampado",
  "cuánto vale el estampado",
  "valor dtf",
  "precio dtf"
]).addAnswer("🖨️ Los estampados DTF varían según el tamaño y la cantidad.")
  .addAnswer("¿Podrías decirme qué medidas necesitas (A6, A5, A4, A3) y cuántas unidades?",
    { capture: true },
    async (ctx, { flowDynamic }) => {
      await flowDynamic("Déjame consultar los precios exactos. Un momento...");
      // AI will handle with price list context
    }
  );
```

---

### STEP 4: Build & Deploy (10 min)

```bash
# Build
pnpm build

# Test locally first (optional)
pnpm dev

# Deploy to production
# (Your deployment command here, e.g., pm2 restart, docker deploy, etc.)
```

---

### STEP 5: Test (10 min)

**Quick smoke test** - Send these WhatsApp messages:

1. `Hola` → Should greet as Insuapliques
2. `Quiero ver el catálogo` → Should send PDF/image
3. `Cuánto cuesta un parche bordado?` → Should quote from price list
4. `Gracias` → Should show closing menu

**Validation checklist**:
- [ ] Bot says "Insuapliques" (not "Mimétisa")
- [ ] Catalog file sent successfully
- [ ] Price quoted from XLSX (check log: `[priceListLoader] ✅ Loaded X products`)
- [ ] Closing menu appears

---

## 📊 PRICE LIST XLSX FORMAT

**Minimum required columns**:

| producto | precio |
|----------|--------|
| Parche bordado 8x8 cm | 15000 |
| Estampado DTF A5 | 8000 |
| Combo Deportivo | 180000 |

**Recommended columns**:

| producto | tipo | precio | talla | color | cantidad_min | combo | incluye |
|----------|------|--------|-------|-------|--------------|-------|---------|
| Parche bordado 8x8 cm | parche | 15000 | | | | | |
| Parche bordado 8x8 cm | parche | 12000 | | | 50 | | |
| Estampado DTF A5 | dtf | 8000 | | | | | |
| Camiseta básica | camiseta | 25000 | M | Negro | | | |
| Camiseta básica | camiseta | 25000 | L | Negro | | | |
| Combo Deportivo | combo | 180000 | | | | SI | 10 parches + 10 camisetas |

**Notes**:
- Column names are case-insensitive
- Multiple rows with same `producto` = variants
- `cantidad_min` creates quantity tiers
- `combo` = "SI", "1", or "true" marks combos

---

## 🧪 ADVANCED TESTING (Optional)

### Test 1: Check Price List Loaded

**In server logs, look for**:
```
[priceListLoader] ✅ Processed into 25 unique products (3 combos, 22 units)
```

If you see:
```
⚠️ LISTA DE PRECIOS NO DISPONIBLE
```

**Fix**: Check Firestore `settings/archivo_entrenamiento` has valid `url` or `Path`.

---

### Test 2: Verify Intent Detection

**Send**: `Cuánto cuesta el combo deportivo`

**Check logs for**:
```
[welcomeFlow] Detected intent: PRICES_COMBOS (confidence: 0.85)
```

---

### Test 3: Guided Purchase

**Conversation**:
1. User: `Quiero comprar parches`
2. Bot: `¿Cuántas unidades...?`
3. User: `50`
4. Bot: `¿De qué color...?`
5. User: `Negro`
6. Bot: `¿A qué ciudad...?`
7. User: `Bogotá`
8. Bot: `Resumen... Total: $XXX ¿Confirmas?`

**Check Firestore**:
```
purchaseStates/{phone} → should have all fields
```

---

## ⚠️ TROUBLESHOOTING

### Issue 1: Price list not loading

**Symptoms**: Bot says "no tengo acceso a la lista de precios"

**Fix**:
1. Check `settings/archivo_entrenamiento` exists
2. Verify `url` or `Path` field is correct
3. Test URL in browser (should download XLSX)
4. Check Storage permissions (public read access)

---

### Issue 2: Catalog not sending

**Symptoms**: User asks for catalog, nothing happens

**Fix**:
1. Check `productos_chatbot/catalogo_general` exists
2. Verify `url` field has valid Storage URL
3. Check `tipo` is "pdf" or "image"
4. Test URL in browser (should display file)

---

### Issue 3: Bot still says "Mimétisa"

**Symptoms**: Greeting says wrong brand

**Fix**:
1. Check `handler.ts` line 235 was updated
2. Rebuild: `pnpm build`
3. Restart server: `pm2 restart all` (or equivalent)
4. Clear any code caches

---

### Issue 4: AI invents prices

**Symptoms**: Bot quotes price not in XLSX

**Fix**:
1. Verify base prompt includes "NUNCA inventes" instruction
2. Check `[priceListLoader]` logs show products loaded
3. Ensure `aiService.ts` injects price list context (line 775)
4. Review AI response in logs for price list context

---

## 📞 GET HELP

**Documentation**:
1. `INSUAPLIQUES_IMPLEMENTATION_GUIDE.md` - Detailed setup
2. `INSUAPLIQUES_AUDIT_SUMMARY.md` - Technical overview
3. `INSUAPLIQUES_BASE_PROMPT.md` - AI training content

**Logs to check**:
```bash
# Price list loading
grep -i "priceListLoader" logs/*.log

# Intent detection
grep -i "Detected intent" logs/*.log

# Catalog sending
grep -i "catalogo" logs/*.log
```

**Firestore collections to inspect**:
- `liveChatStates/{phone}` - Current conversation state
- `liveChat` - Message history
- `logs/catalogSent/entries` - Catalog send events
- `logs/sendFailures/entries` - Errors sending media

---

## ✅ SUCCESS CRITERIA

After deployment, validate:

✅ Bot greets users as "Insuapliques"
✅ Catalog sends successfully (PDF/image)
✅ Price quotes come from XLSX (never invented)
✅ Combos detected and quoted accurately
✅ Guided purchase collects all required info
✅ Closing menu appears when user says "gracias"
✅ Human handoff works (`modoHumano: true`)
✅ No hardcoded prices in responses

---

## 🎉 NEXT STEPS

Once basic deployment works:

1. **Add more products** to XLSX
2. **Upload more catalog images** (parches, DTF samples)
3. **Configure shipping costs** per city (create Firestore collection)
4. **Monitor conversations** for common questions
5. **Refine base prompt** based on user feedback

---

**Version**: 1.0
**Deployment Time**: ~1 hour
**Difficulty**: ⭐⭐☆☆☆ (Intermediate)

**Good luck! 🚀**
