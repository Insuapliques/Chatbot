# Funcionalidad: Lista de Catálogos Disponibles

## ¿Qué hace esta funcionalidad?

Cuando un usuario envía un mensaje **genérico** solicitando un catálogo (sin especificar cuál), el bot ahora muestra una **lista de todos los catálogos disponibles** para que el usuario elija el que desea.

### Antes (problema)
- Cliente configura: `keyword: "catalogo de chompas"`
- Usuario escribe: `"enviame el catalogo"`
- ❌ **No coincide** porque falta "de chompas"
- El bot no envía nada o responde con IA (sin archivo)

### Ahora (solución)
- Cliente configura: `keyword: "catalogo de chompas"` ← se mantiene igual
- Usuario escribe: `"enviame el catalogo"`
- ✅ **El bot detecta que es una solicitud genérica**
- ✅ **Muestra lista**:
  ```
  Tenemos los siguientes catálogos disponibles:

  1. catalogo de chompas
  2. catalogo de joggers
  3. catalogo de camisetas

  ¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba.
  ```
- Usuario escribe: `"catalogo de chompas"`
- ✅ **Envía el catálogo correcto**

---

## Cómo funciona técnicamente

### 1. Detección de Solicitudes Genéricas

El sistema usa un regex para detectar mensajes que contienen palabras relacionadas con catálogos:

```regex
/(catalog|catalogo|cata|lista|menu|precio|disen|modelo?s?)/i
```

**Ejemplos de mensajes que activan la lista:**
- "enviame el catalogo"
- "quiero ver el catálogo"
- "muestrame tu lista de productos"
- "dame el menu"
- "envíame diseños"
- "quiero ver modelos"
- "lista de precios"

### 2. Flujo de Procesamiento

```
Usuario: "enviame el catalogo"
           ↓
  ¿Coincide con keyword exacto?
  (ejemplo: "catalogo de chompas")
           ↓ NO
  ¿Es solicitud genérica?
  (contiene "catalogo", "lista", etc.)
           ↓ SÍ
  Cargar productos_chatbot collection
           ↓
  Construir lista numerada
           ↓
  Enviar mensaje al usuario
           ↓
  Guardar en liveChat
           ↓
  Actualizar estado: catalogoListaMostrada = true
```

### 3. Matching de Keywords

El matching sigue siendo **estricto** para respetar la configuración del cliente:

#### `includesAll()` function
- Normaliza texto (sin acentos, minúsculas, sin símbolos)
- Divide el keyword en palabras
- **Requiere que TODAS las palabras estén presentes**

**Ejemplo:**
- Keyword: `"catalogo de chompas"`
- Palabras requeridas: `["catalogo", "de", "chompas"]`
- Mensaje: `"enviame el catalogo"` → ❌ falta "chompas"
- Mensaje: `"catalogo de chompas por favor"` → ✅ todas presentes

---

## Configuración del Cliente

### Panel Web: Productos Chatbot

El cliente puede seguir usando keywords específicos sin cambiar nada:

```json
{
  "keyword": "catalogo de chompas",
  "respuesta": "Aquí está nuestro catálogo de chompas 👕",
  "tipo": "pdf",
  "url": "https://storage.googleapis.com/..."
}
```

### Recomendaciones

#### Opción 1: Keywords Específicos (actual)
**Ventaja:** Máxima precisión, control total
**Desventaja:** Usuario debe escribir el keyword exacto

```
Producto 1:
  keyword: "catalogo de chompas"

Producto 2:
  keyword: "catalogo de joggers"
```

Si el usuario escribe **solo** `"catalogo"` → Muestra la lista

#### Opción 2: Keywords Generales + Específicos
**Ventaja:** Máxima flexibilidad
**Desventaja:** Más trabajo de configuración

```
Producto 1 (general):
  keyword: "catalogo"
  respuesta: "Catálogo general de productos"
  tipo: "pdf"
  url: "..."

Producto 2 (específico):
  keyword: "catalogo de chompas"
  respuesta: "Catálogo de chompas"
  tipo: "pdf"
  url: "..."
```

El sistema probará primero el match específico, luego el general.

---

## Estados de Firestore

### Cuando se muestra la lista

Se actualiza el documento `liveChatStates/{phone}`:

```javascript
{
  catalogoListaMostrada: true,      // Nuevo campo
  estadoActual: 'DISCOVERY',        // Estado actual
  state: 'DISCOVERY',               // Estado (BuilderBot schema)
  ultimoIntent: 'lista_catalogos',  // Intent detectado
  last_intent: 'lista_catalogos',   // Intent (BuilderBot schema)
  ultimoCambio: Timestamp           // Última actualización
}
```

### Cuando se envía un catálogo específico

Se actualiza el documento `liveChatStates/{phone}`:

```javascript
{
  catalogoEnviado: true,             // Catálogo enviado
  has_sent_catalog: true,            // BuilderBot schema
  catalogoRef: "catalogo de chompas", // Qué catálogo se envió
  estadoActual: 'CATALOGO_ENVIADO',
  state: 'CATALOG_SENT',
  ultimoIntent: 'catalogo',
  last_intent: 'catalogo',
  productoActual: "catalogo de chompas",
  ultimoCambio: Timestamp
}
```

---

## Logging

### Log de Lista Mostrada

Se guarda en `liveChat` collection:

```javascript
{
  user: "+57312...",
  text: "Tenemos los siguientes catálogos disponibles:\n\n1. catalogo de chompas\n...",
  fileUrl: null,
  fileType: "text",
  timestamp: Timestamp,
  origen: "bot"
}
```

### Log de Catálogo Enviado

Se guarda en `logs/catalogSent/entries` subcollection:

```javascript
{
  phone: "+57312...",
  catalogRef: "catalogo de chompas",
  at: Timestamp
}
```

### Log de Transición de Estado

Se guarda en `logs/stateTransitions/entries` subcollection:

```javascript
{
  phone: "+57312...",
  from: "GREETING",
  to: "CATALOGO_ENVIADO",
  intent: "catalogo",
  at: Timestamp
}
```

---

## Testing

### Escenario 1: Solicitud Genérica
```
Usuario: "enviame el catalogo"
Bot: "Tenemos los siguientes catálogos disponibles:

1. catalogo de chompas
2. catalogo de joggers

¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba."

Usuario: "catalogo de chompas"
Bot: [Envía PDF] "Aquí está nuestro catálogo de chompas 👕"
```

### Escenario 2: Keyword Exacto (sigue funcionando igual)
```
Usuario: "catalogo de chompas"
Bot: [Envía PDF] "Aquí está nuestro catálogo de chompas 👕"
```

### Escenario 3: Sin Coincidencias
```
Usuario: "quiero comprar algo"
Bot: [Pasa a IA para generar respuesta contextual]
```

### Escenario 4: Reenvío
```
Usuario: "reenvia el catalogo"
Bot: [Envía nuevamente el último catálogo enviado]
```

---

## Archivos Modificados

### `src/services/productos.service.ts`
- ✅ Eliminado fallback automático (ya no envía el primer producto)
- ✅ Agregado `isGenericCatalogRequest()` para detectar solicitudes genéricas
- ✅ Agregado `buildCatalogListMessage()` para construir la lista
- ✅ Agregado logging para debugging

### `src/services/catalogo.service.ts`
- ✅ Importa nuevas funciones de `productos.service.ts`
- ✅ Lógica: si no hay match exacto pero es solicitud genérica → muestra lista
- ✅ Guarda mensaje de lista en `liveChat`
- ✅ Actualiza estado con `catalogoListaMostrada: true`

---

## Ventajas de esta Implementación

1. **Respeta la configuración del cliente**: Los keywords específicos siguen funcionando exactamente igual
2. **No requiere cambios en el panel web**: El cliente no necesita modificar nada
3. **Mejora la experiencia del usuario**: Si no sabe el keyword exacto, ve las opciones
4. **Mantiene la precisión**: Solo muestra la lista cuando detecta palabras relacionadas con catálogos
5. **Totalmente configurable**: El cliente puede cambiar keywords sin tocar código

---

## Próximos Pasos (Opcional)

### Mejora 1: Sinónimos por Producto
Permitir al cliente configurar múltiples keywords para el mismo producto:

```json
{
  "keyword": ["catalogo de chompas", "chompas", "catalogo chompa", "hoodies"],
  "respuesta": "...",
  "tipo": "pdf",
  "url": "..."
}
```

**Estado:** ✅ Ya implementado en el backend (soporta arrays)
**Falta:** Actualizar el panel web para permitir entrada de múltiples keywords

### Mejora 2: Búsqueda Fuzzy
Usar similitud de texto (Levenshtein distance) para encontrar keywords cercanos:

```
Usuario: "catalogo de chonpas" (typo)
Bot: "¿Quisiste decir 'catalogo de chompas'?"
```

### Mejora 3: Categorización de Catálogos
Agrupar catálogos por categoría:

```
Tenemos los siguientes catálogos disponibles:

📁 Ropa:
1. catalogo de chompas
2. catalogo de camisetas

📁 Accesorios:
3. catalogo de parches
4. catalogo DTF
```

---

## Preguntas Frecuentes

### ¿Por qué no simplemente hacer los keywords más cortos?
**Respuesta:** Los keywords específicos permiten al cliente controlar exactamente qué catálogo se envía. "catalogo de chompas" vs "catalogo de joggers" son diferentes productos. Si el usuario escribe solo "catalogo", no sabemos cuál quiere, por eso mostramos la lista.

### ¿Se puede desactivar esta funcionalidad?
**Respuesta:** Sí, simplemente elimina la línea `CATALOG_REQUEST_REGEX` en `productos.service.ts` o modifícala para que nunca haga match (ejemplo: `/(^$)/` nunca matchea nada).

### ¿Qué pasa si solo hay 1 catálogo configurado?
**Respuesta:** Si el usuario escribe un keyword genérico y solo hay 1 catálogo, la lista mostrará:
```
Tenemos los siguientes catálogos disponibles:

1. catalogo de chompas

¿Cuál te gustaría revisar? Escríbelo tal como aparece arriba.
```

**Mejora futura:** Detectar si solo hay 1 catálogo y enviarlo automáticamente.

### ¿Cómo sé si la lista fue mostrada o el catálogo fue enviado?
**Respuesta:** Verifica el estado en Firestore:
- `catalogoListaMostrada: true` → Se mostró la lista
- `catalogoEnviado: true` → Se envió un catálogo específico
- `catalogoRef: "..."` → Qué catálogo se envió

### ¿El sistema sigue usando IA después de mostrar la lista?
**Respuesta:** No. Si se muestra la lista, el handler retorna `ctx.body = ''` para que los flows y la IA no se ejecuten. El usuario debe escribir un keyword válido para continuar.

---

## Soporte

Para más información, consulta:
- `CATALOG_PANEL_GUIDE.md` - Guía del panel de productos
- `FRONTEND_INTEGRATION_NOTES.md` - Integración frontend/backend
- `CLAUDE.md` - Arquitectura completa del proyecto
