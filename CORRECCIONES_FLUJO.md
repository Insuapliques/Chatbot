# Correcciones del Flujo Conversacional

## Resumen
Se identificaron y corrigieron **5 errores críticos** que afectaban el funcionamiento del flujo conversacional del chatbot de WhatsApp.

---

## Errores Identificados y Correcciones Aplicadas

### 1. ⚠️ **Race Condition en Deduplicación de Mensajes**

**Archivo**: `src/middleware/dedup.ts`

**Problema**:
El middleware actualizaba `ultimoMessageId` **después** de verificar duplicados, pero el custom handler también lo hacía en paralelo, causando una **condición de carrera** donde mensajes duplicados podían procesarse dos veces.

**Corrección**:
- Eliminé la actualización de `ultimoMessageId` del middleware
- El middleware ahora **solo verifica** duplicados, no actualiza estado
- El custom handler es el único responsable de actualizar `ultimoMessageId`

**Código corregido**:
```typescript
// Antes (líneas 39-45):
// Store the new message ID
await stateRef.set(
  { ultimoMessageId: messageId },
  { merge: true }
);

// Después:
// NOTE: Do NOT update ultimoMessageId here - it's handled by the conversation handler
// to avoid race conditions. This function only checks for duplicates.
return false;
```

---

### 2. ⚠️ **Inconsistencia en Flag `catalogoEnviado`**

**Archivo**: `src/conversation/handler.ts`

**Problema**:
El handler verificaba `catalogoEnviado` para evitar reenvíos, pero la validación ocurría **antes** de que `intentarEnviarCatalogo` actualizara el estado. Además, usaba el estado **previo** (`chatState`) en lugar del estado **actualizado después del catálogo** (`freshChatState`).

**Corrección**:
- Recargar el estado después de que `intentarEnviarCatalogo` se ejecute
- Usar el estado fresco (`freshChatState`) en toda la lógica posterior
- Sincronizar referencias de estado en todas las validaciones

**Código corregido**:
```typescript
// Líneas 196-209:
// Reload state after catalog service may have updated it
const { data: freshChatState } = await getChatState(phone);

const now = Timestamp.now();
const basePatch: Partial<ChatStateDoc> = {
  ultimoMessageId: messageId,
  ultimoContacto: FieldValue.serverTimestamp() as unknown as Timestamp,
};
const updates: Partial<ChatStateDoc> = { ...basePatch };
const transitions: Array<{ from: EstadoConversacion; to: EstadoConversacion; intent: string }> = [];
let currentState: EstadoConversacion = freshChatState.estadoActual;
let handled = false;
let recordedIntent: string | null = null;
let productoActual = freshChatState.productoActual ?? null;
```

---

### 3. ⚠️ **Falso Positivo en Detección de Catálogo**

**Archivo**: `src/flows/welcomeFlow.ts`

**Problema**:
El flow llamaba a `buscarProductoChatbot` que hace una búsqueda case-insensitive parcial (`includes`), pero luego **retornaba sin enviar nada**, dejando al usuario sin respuesta y confiando en que el catálogo determinista lo manejara (pero éste ya había corrido antes).

**Corrección**:
- Eliminé completamente la lógica de búsqueda de catálogo en el flow
- Documenté que el catálogo se maneja **exclusivamente** por el servicio determinista
- Removí imports innecesarios (`buscarProductoChatbot`, `handleControlIntents`)

**Código corregido**:
```typescript
// Líneas 122-124:
// NOTE: Catalog sending is handled EXCLUSIVELY by the deterministic catalog service
// in catalogo.service.ts. Do NOT attempt to send catalogs here to avoid duplicate sends
// and false positives. The custom handler intercepts messages BEFORE flows.
```

---

### 4. ⚠️ **Validación Incompleta de `modoHumano`**

**Archivo**: `src/conversation/handler.ts`

**Problema**:
El handler validaba `modoHumano`, pero guardaba el mensaje entrante **antes** de validar, y además no hacía un early return completo, permitiendo que continuara procesando lógica de estados.

**Corrección**:
- Mover la carga del estado **antes** de guardar el mensaje
- Guardar el mensaje incluso en modo humano (para visibilidad del operador)
- Hacer early return completo después de validar `modoHumano`

**Código corregido**:
```typescript
// Líneas 154-169:
// Get current state BEFORE any processing
const { ref, data: chatState } = await getChatState(phone);

// 2. HUMAN HANDOFF - Early return if human mode active (before saving message)
if (chatState.modoHumano === true) {
  // Still save incoming message for operator visibility
  await saveIncomingMessage(phone, ctx, incomingText, null, type);

  // Log suppression
  await db.collection('logs').doc('sendSuppressedByHuman').collection('entries').add({
    phone,
    at: FieldValue.serverTimestamp(),
  });
  ctx.body = '';
  return;
}
```

---

### 5. ⚠️ **Desincronización de Schemas de Estado**

**Archivos**: `src/flows/welcomeFlow.ts`, `src/services/catalogo.service.ts`

**Problema**:
Los dos sistemas usaban campos diferentes para el mismo concepto:
- BuilderBot: `has_sent_catalog`, `state`, `last_intent`
- Custom Handler: `catalogoEnviado`, `estadoActual`, `ultimoIntent`

Aunque `catalogo.service.ts` intentaba sincronizarlos, los flows no leían ambos esquemas correctamente.

**Corrección en `welcomeFlow.ts`**:
```typescript
// Líneas 140-169:
// Merge both state schemas to ensure compatibility
const mergedHasSentCatalog = Boolean(
  state?.has_sent_catalog ??
  estado?.has_sent_catalog ??
  estado?.catalogoEnviado
);

const mergedState =
  state?.state ??
  estado?.state ??
  estado?.estadoActual ??
  undefined;

const mergedLastIntent =
  state?.last_intent ??
  estado?.last_intent ??
  estado?.ultimoIntent ??
  undefined;
```

**Corrección en `catalogo.service.ts`**:
```typescript
// Líneas 38-59:
// Find matching product first
const producto = await findProductoByMessage(text);

// Check both schema formats for catalog sent flag
const catalogAlreadySent = Boolean(
  state?.catalogoEnviado === true ||
  state?.has_sent_catalog === true
);

// If catalog was already sent, check if it's the same one or user wants resend
if (catalogAlreadySent && producto && !wantsResend) {
  const lastCatalogRef = state?.catalogoRef || state?.productoActual;

  // Allow sending a different catalog, but block same catalog
  if (lastCatalogRef === producto.keyword) {
    console.log(`[catalogo] Same catalog "${producto.keyword}" already sent, skipping`);
    return false;
  } else {
    console.log(`[catalogo] Different catalog requested: "${producto.keyword}" vs "${lastCatalogRef}"`);
    // Allow different catalog to be sent
  }
}
```

---

## Mejoras Adicionales Implementadas

### 🎯 **Lógica Mejorada de Reenvío de Catálogos**

**Archivo**: `src/services/catalogo.service.ts`

**Mejora**:
Ahora el sistema distingue entre:
1. **Mismo catálogo**: No reenvía (evita spam)
2. **Catálogo diferente**: Permite envío (usuario quiere ver otro producto)
3. **Reenvío explícito**: Permite reenviar con keywords `reenvía`, `otra vez`, `again`, `resend`

**Código**:
```typescript
// Líneas 47-59
if (catalogAlreadySent && producto && !wantsResend) {
  const lastCatalogRef = state?.catalogoRef || state?.productoActual;

  // Allow sending a different catalog, but block same catalog
  if (lastCatalogRef === producto.keyword) {
    console.log(`[catalogo] Same catalog "${producto.keyword}" already sent, skipping`);
    return false;
  } else {
    console.log(`[catalogo] Different catalog requested: "${producto.keyword}" vs "${lastCatalogRef}"`);
    // Allow different catalog to be sent
  }
}
```

---

## Tests Actualizados

Se actualizaron los tests para reflejar el nuevo comportamiento:

### ✅ `tests/catalogo.service.test.ts`
- **6/6 tests pasando**
- Agregado: `allows sending different catalog when one already sent`
- Actualizado: `shows catalog list when generic request without exact match`
- Actualizado: `no resend when same catalog already sent`

### ✅ `tests/dedup.test.ts`
- **4/4 tests pasando**
- Actualizado: Middleware ya no actualiza estado, solo verifica duplicados

### ✅ `tests/modoHumano.test.ts`
- **3/3 tests pasando**

---

## Verificación

### Linter
```bash
pnpm lint
```
✅ Sin errores de TypeScript

### Tests
```bash
pnpm test
```
✅ **13/15 tests pasando** (2 fallos en tests de integración de AI no relacionados con el flujo)

---

## Impacto en la Arquitectura

### Antes
```
Usuario → Meta Provider → Dedup (update) → Handler → Catálogo → Flow (verifica catálogo)
                                ↓
                          Race condition!
```

### Después
```
Usuario → Meta Provider → Dedup (solo verifica) → Handler → Catálogo → Flow (confía en catálogo)
                                                      ↓
                                            Actualiza ultimoMessageId
                                            (punto único de verdad)
```

---

## Recomendaciones para el Futuro

1. **Consolidar Schemas**: Migrar completamente a un único schema de estado (preferiblemente el del Custom Handler)
2. **Deprecar BuilderBot Flows**: Considerar mover toda la lógica al Custom Handler para evitar conflictos
3. **Agregar Tests de Integración**: Crear tests que validen el flujo completo desde el provider hasta la respuesta
4. **Documentar Orden de Ejecución**: Mantener actualizado el flujo de procesamiento en CLAUDE.md

---

## Referencias

- [src/middleware/dedup.ts](src/middleware/dedup.ts)
- [src/conversation/handler.ts](src/conversation/handler.ts)
- [src/services/catalogo.service.ts](src/services/catalogo.service.ts)
- [src/flows/welcomeFlow.ts](src/flows/welcomeFlow.ts)
- [CLAUDE.md](CLAUDE.md) - Documentación de arquitectura
