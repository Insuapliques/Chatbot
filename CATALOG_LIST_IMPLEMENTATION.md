# Implementación: Sistema de Lista de Catálogos

## Resumen Ejecutivo

Se implementó una nueva funcionalidad que mejora la experiencia del usuario cuando solicita un catálogo de forma **genérica** (sin especificar cuál). Ahora el bot muestra una lista de todos los catálogos disponibles para que el usuario elija.

### Problema Resuelto

**Antes:**
- Cliente configura: `keyword: "catalogo de chompas"`
- Usuario escribe: `"enviame el catalogo"`
- ❌ No coincide (falta "de chompas")
- El bot no responde o la IA intenta responder sin archivos

**Después:**
- Cliente configura: `keyword: "catalogo de chompas"` (sin cambios)
- Usuario escribe: `"enviame el catalogo"`
- ✅ Bot muestra lista de catálogos disponibles
- Usuario elige: `"catalogo de chompas"`
- ✅ Bot envía el archivo correcto

---

## Cambios Técnicos

### 1. Archivos Modificados

#### [`src/services/productos.service.ts`](src/services/productos.service.ts)
- **Eliminado:** Fallback automático que enviaba el primer producto
- **Agregado:** `isGenericCatalogRequest()` - Detecta solicitudes genéricas
- **Agregado:** `buildCatalogListMessage()` - Construye mensaje con lista numerada
- **Agregado:** Logging para debugging

```typescript
// Nueva función
export function isGenericCatalogRequest(message: string): boolean {
  const normalized = normalize(message);
  return CATALOG_REQUEST_REGEX.test(normalized);
}

// Nueva función
export async function buildCatalogListMessage(): Promise<string | null> {
  const productos = await getProductos();
  // Construye lista numerada con todos los catálogos
}
```

#### [`src/services/catalogo.service.ts`](src/services/catalogo.service.ts)
- **Modificado:** Lógica de `intentarEnviarCatalogo()` para:
  1. Intentar match exacto primero
  2. Si no hay match, verificar si es solicitud genérica
  3. Si es genérica, mostrar lista de catálogos
  4. Actualizar estado con `catalogoListaMostrada: true`

```typescript
// Si no hay match exacto pero es solicitud genérica
if (!producto) {
  if (isGenericCatalogRequest(text)) {
    const catalogList = await buildCatalogListMessage();
    if (catalogList) {
      await provider.sendMessage(phone, catalogList);
      // Guarda en liveChat y actualiza estado
      return true;
    }
  }
  return false;
}
```

### 2. Archivos Creados

#### [`CATALOG_LIST_FEATURE.md`](CATALOG_LIST_FEATURE.md)
- Documentación completa de la funcionalidad
- Ejemplos de uso
- Casos de prueba
- FAQs

#### [`scripts/test-catalog-list.ts`](scripts/test-catalog-list.ts)
- Script de prueba para demostrar la funcionalidad
- Simula diferentes mensajes de usuario
- Muestra qué respondería el bot en cada caso

#### [`CATALOG_LIST_IMPLEMENTATION.md`](CATALOG_LIST_IMPLEMENTATION.md) (este archivo)
- Resumen de la implementación

### 3. Archivos Actualizados

#### [`CLAUDE.md`](CLAUDE.md)
- Actualizada sección "Deterministic Catalog System"
- Agregada referencia a la nueva funcionalidad

---

## Cómo Funciona

### Detección de Solicitudes Genéricas

El sistema usa un regex para detectar palabras relacionadas con catálogos:

```regex
/(catalog|catalogo|cata|lista|menu|precio|disen|modelo?s?)/i
```

**Ejemplos que activan la lista:**
- "enviame el catalogo"
- "quiero ver el catálogo"
- "muestrame tu lista de productos"
- "dame el menu"
- "envíame diseños"
- "quiero ver modelos"
- "lista de precios"

### Flujo de Procesamiento

```
┌─────────────────────────────────────┐
│ Usuario: "enviame el catalogo"      │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ ¿Coincide con keyword exacto?       │
│ (ej: "catalogo de chompas")         │
└────────────────┬────────────────────┘
                 │ NO
                 ▼
┌─────────────────────────────────────┐
│ ¿Es solicitud genérica?             │
│ (contiene "catalogo", "lista", etc.)│
└────────────────┬────────────────────┘
                 │ SÍ
                 ▼
┌─────────────────────────────────────┐
│ Cargar productos_chatbot            │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Construir lista numerada:           │
│                                     │
│ Tenemos los siguientes catálogos:  │
│                                     │
│ 1. catalogo de chompas              │
│ 2. catalogo de joggers              │
│ 3. catalogo de camisetas            │
│                                     │
│ ¿Cuál te gustaría revisar?          │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Enviar mensaje al usuario           │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Guardar en liveChat collection      │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Actualizar estado:                  │
│ catalogoListaMostrada = true        │
│ ultimoIntent = "lista_catalogos"    │
└─────────────────────────────────────┘
```

---

## Testing

### Ejecutar el Script de Prueba

```bash
npx tsx scripts/test-catalog-list.ts
```

Este script:
1. Lee los catálogos actuales de Firestore
2. Prueba diferentes mensajes de usuario
3. Muestra qué acción tomaría el bot

### Ejemplo de Salida

```
═══════════════════════════════════════════════════════
🧪 CATALOG LIST FEATURE - TEST SCRIPT
═══════════════════════════════════════════════════════

📊 CURRENT CATALOG PRODUCTS IN FIRESTORE:

1. doc123
   Keyword: catalogo de chompas
   Type: pdf
   URL: Yes

2. doc456
   Keyword: catalogo de joggers
   Type: pdf
   URL: Yes

═══════════════════════════════════════════════════════

🔍 TESTING USER MESSAGES:

📝 Message: "enviame el catalogo"
   (Generic request - should show list)

   Is Generic Request: ✅ YES
   Exact Match Found: ❌ NO
   Action: 📋 SHOW CATALOG LIST

   Bot Response:
   ┌─────────────────────────────────────────
   │ Tenemos los siguientes catálogos disponibles:
   │
   │ 1. catalogo de chompas
   │ 2. catalogo de joggers
   │
   │ ¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba.
   └─────────────────────────────────────────

---

📝 Message: "catalogo de chompas"
   (Specific keyword - should match exact product)

   Is Generic Request: ✅ YES
   Exact Match Found: ✅ YES
   Product ID: doc123
   Keyword: catalogo de chompas
   Type: pdf
   Action: 📤 SEND CATALOG FILE

---
```

### Testing Manual en WhatsApp

1. **Solicitud Genérica**
   ```
   Usuario: enviame el catalogo
   Bot: Tenemos los siguientes catálogos disponibles:

        1. catalogo de chompas
        2. catalogo de joggers

        ¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba.

   Usuario: catalogo de chompas
   Bot: [Envía PDF] Aquí está nuestro catálogo de chompas 👕
   ```

2. **Keyword Exacto (sigue funcionando igual)**
   ```
   Usuario: catalogo de chompas
   Bot: [Envía PDF] Aquí está nuestro catálogo de chompas 👕
   ```

3. **Sin Coincidencias**
   ```
   Usuario: quiero comprar algo
   Bot: [La IA genera una respuesta contextual]
   ```

---

## Estado de Firestore

### Campo Nuevo: `catalogoListaMostrada`

Cuando se muestra la lista, se actualiza `liveChatStates/{phone}`:

```javascript
{
  catalogoListaMostrada: true,      // ← NUEVO
  estadoActual: 'DISCOVERY',
  state: 'DISCOVERY',
  ultimoIntent: 'lista_catalogos',
  last_intent: 'lista_catalogos',
  ultimoCambio: Timestamp
}
```

### Campo Existente: `catalogoEnviado`

Cuando se envía un catálogo específico (no cambia):

```javascript
{
  catalogoEnviado: true,
  has_sent_catalog: true,
  catalogoRef: "catalogo de chompas",
  estadoActual: 'CATALOGO_ENVIADO',
  state: 'CATALOG_SENT',
  ultimoIntent: 'catalogo',
  last_intent: 'catalogo',
  productoActual: "catalogo de chompas",
  ultimoCambio: Timestamp
}
```

---

## Ventajas

1. ✅ **No requiere cambios en el panel web** - Cliente sigue usando keywords específicos
2. ✅ **Mejora UX** - Usuario puede descubrir catálogos disponibles sin adivinar keywords
3. ✅ **Mantiene precisión** - Solo muestra lista cuando detecta palabras relacionadas
4. ✅ **Configurable** - Cliente puede cambiar keywords sin tocar código
5. ✅ **Backward compatible** - Keywords exactos siguen funcionando igual
6. ✅ **Logging completo** - Todo se guarda en Firestore para análisis

---

## Configuración del Cliente

### Opción 1: Keywords Específicos (recomendado actual)

```json
// productos_chatbot collection
{
  "keyword": "catalogo de chompas",
  "respuesta": "Aquí está nuestro catálogo de chompas 👕",
  "tipo": "pdf",
  "url": "https://storage.googleapis.com/..."
}
```

**Ventaja:** Máxima precisión, control total
**Desventaja:** Usuario debe escribir keyword exacto o ver la lista

### Opción 2: Múltiples Keywords por Producto (futuro)

El backend ya soporta arrays de keywords:

```json
{
  "keyword": ["catalogo de chompas", "chompas", "hoodies", "busos"],
  "respuesta": "Aquí está nuestro catálogo de chompas 👕",
  "tipo": "pdf",
  "url": "https://storage.googleapis.com/..."
}
```

**Falta:** Panel web debe actualizarse para permitir entrada de múltiples keywords

---

## Mejoras Futuras

### 1. Auto-envío si Solo Hay 1 Catálogo

Si solo hay 1 catálogo configurado y el usuario pide "el catalogo", enviarlo directamente en lugar de mostrar lista con 1 item.

### 2. Categorización de Catálogos

Agrupar por categoría:

```
Tenemos los siguientes catálogos:

📁 Ropa:
  1. catalogo de chompas
  2. catalogo de camisetas

📁 Accesorios:
  3. catalogo de parches
  4. catalogo DTF
```

### 3. Búsqueda Fuzzy

Usar similitud de texto para typos:

```
Usuario: "catalogo de chonpas" (typo)
Bot: "¿Quisiste decir 'catalogo de chompas'?"
```

### 4. Soporte Multi-keyword en Panel Web

Actualizar `ProductosChatbotPanel.jsx` para permitir entrada de múltiples keywords separados por comas.

---

## Checklist de Deployment

- [x] Código implementado en `productos.service.ts`
- [x] Código implementado en `catalogo.service.ts`
- [x] Tests manuales realizados
- [x] Documentación creada
- [x] `CLAUDE.md` actualizado
- [x] Script de prueba creado
- [x] Build exitoso (`pnpm build`)
- [ ] Pruebas en entorno de staging
- [ ] Pruebas en WhatsApp real
- [ ] Validación con cliente
- [ ] Deploy a producción

---

## Contacto y Soporte

Para más información:
- Ver [`CATALOG_LIST_FEATURE.md`](CATALOG_LIST_FEATURE.md) - Guía completa
- Ver [`CATALOG_PANEL_GUIDE.md`](CATALOG_PANEL_GUIDE.md) - Guía del panel
- Ver [`CLAUDE.md`](CLAUDE.md) - Arquitectura completa
