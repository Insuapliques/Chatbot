# 🔗 Frontend-Backend Integration Notes

## Overview

The **EntrenamientoConfig.jsx** frontend component manages chatbot configuration through Firebase Firestore. This document explains the schema mappings and integration points.

---

## ✅ **Schema Compatibility Status**

The backend has been updated to support **both** the frontend's schema and the recommended schema for new deployments.

### **Firestore Document Paths**

| Frontend Component | Firestore Document | Purpose |
|--------------------|-------------------|---------|
| Entrenamiento IA | `settings/prompts` | Base prompt & closing words |
| Mensajes de Bienvenida | `settings/welcome_messages` | All greeting templates |
| Subir Documento Excel | `settings/archivo_entrenamiento` | Price list metadata |

---

## 📊 **Field Mappings**

### **1. Base Prompt Configuration** (`settings/prompts`)

| Frontend Field | Backend Field (Primary) | Backend Field (Fallback) | Type |
|----------------|------------------------|--------------------------|------|
| `entrenamiento_base` | `promptBase` | `prompt_base`, `entrenamiento_base` | `string` |
| `palabra_cierre` | `closingWords` | `palabra_cierre` | `string[]` or `string` |
| *(not in UI)* | `closingMenu` | `cierreMenuFinal` | `string` |
| *(not in UI)* | `params.temperature` | - | `number` |
| *(not in UI)* | `params.max_tokens` | - | `number` |
| *(not in UI)* | `params.top_p` | - | `number` |

**Backend Handling** (`src/services/promptManager.ts`):
- ✅ Supports `entrenamiento_base` → `promptBase` (line 48)
- ✅ Supports `palabra_cierre` (string) → `closingWords` (array) with delimiter splitting (lines 86-92)
- ✅ Supports `cierreMenuFinal` → `closingMenu` (lines 95-100)

**Migration Strategy**:
- **Option A** (No frontend changes): Backend reads both schemas ✅ **IMPLEMENTED**
- **Option B** (Frontend update): Update frontend to use `promptBase`, `closingWords[]`, `closingMenu`

---

### **2. Welcome Messages** (`settings/welcome_messages`)

| Frontend Field | Backend Usage | Special Notes |
|----------------|---------------|---------------|
| `saludoConNombre` | Dynamic template replacement `{{nombre}}` | Used in `welcomeFlow.ts` |
| `saludoSinNombre` | Initial greeting | Used in `welcomeFlow.ts` |
| `pedirNombre` | Name request prompt | Used in `welcomeFlow.ts` |
| `agradecerNombre` | Name confirmation | Used in `welcomeFlow.ts` |
| `atencionHumana` | Human handoff message | Used when `modoHumano: true` |
| `cierreOpcion1` | Closing menu option 1 | "Seguir comprando" |
| `cierreOpcion2` | Closing menu option 2 | "Ver catálogo" |
| `cierreOpcion3` | Closing menu option 3 | "Hablar con asesor" |
| `cierreOpcion4` | Closing menu option 4 | "Finalizar conversación" |
| `cierreDefault` | Invalid option fallback | Error handling |
| `cierreMenuFinal` | **✅ MAPS TO** `closingMenu` | Main closing menu text |

**⚠️ Important**: The frontend has `cierreMenuFinal` which should contain the closing menu (options 1-4). The backend now reads this field as `closingMenu`.

---

### **3. Price List File** (`settings/archivo_entrenamiento`)

| Frontend Field | Backend Field (Expected) | Type | Notes |
|----------------|-------------------------|------|-------|
| `nombre` | `Name` or `nombre` | `string` | Display name |
| `path` | `Path` or `path` | `string` | Storage path (e.g., `Entrenamiento/123_file.xlsx`) |
| `url` | `url` | `string` | **Preferred** - Public download URL |
| `contentType` | `ContentType` | `string` | MIME type |
| `updatedAt` | `UpdatedAt` | `Date` | Last update timestamp |

**Backend Handling** (`src/services/priceListLoader.ts`):
- ✅ Prioritizes `url` over `path` (line 325-352)
- ✅ Supports both capitalized (`Name`, `Path`) and lowercase field names
- ✅ Falls back to Storage path if URL not available

**Frontend Behavior**:
- Deletes previous file before uploading new one ✅
- Generates unique filename: `Entrenamiento/{timestamp}_{filename}`
- Uploads to Firebase Storage
- Gets public download URL
- Saves metadata to Firestore

---

## 🔧 **Backend Updates Made**

### **File**: `src/services/promptManager.ts`

**Change 1**: Support `palabra_cierre` (string) → `closingWords` (array)
```typescript
// Lines 81-92
if (Array.isArray(data.closingWords)) {
  closingWords = data.closingWords.filter((word) => typeof word === 'string' && word.trim());
} else if (typeof data.palabra_cierre === 'string' && data.palabra_cierre.trim()) {
  // Frontend sends single string - split by delimiters
  closingWords = data.palabra_cierre
    .split(/[,;|\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}
```

**Change 2**: Support `cierreMenuFinal` → `closingMenu`
```typescript
// Lines 94-100
const closingMenu =
  (typeof data.closingMenu === 'string' && data.closingMenu.trim().length > 0
    ? data.closingMenu
    : typeof data.cierreMenuFinal === 'string' && data.cierreMenuFinal.trim().length > 0
    ? data.cierreMenuFinal
    : undefined);
```

**Existing Support** (no changes needed):
- `entrenamiento_base` already supported (line 48)
- `settings/prompts` already default path (line 21)

---

## 📝 **Recommended Frontend Updates** (Optional)

While the backend now supports the current frontend schema, consider these improvements for better UX:

### **Update 1**: Add `closingMenu` / `cierreMenuFinal` to Prompt Config

Currently, `cierreMenuFinal` is in `welcome_messages`. It should logically be in the **prompt config** section.

**Suggested UI Change**:
```jsx
// In "Entrenamiento IA" card, add:
<label className="block text-sm font-medium mb-1 text-white mt-4">
  📋 Menú de cierre
</label>
<textarea
  value={menuCierre}
  onChange={(e) => setMenuCierre(e.target.value)}
  disabled={!modoEdicionIA}
  rows={5}
  className="w-full bg-zinc-700 text-white p-3 rounded-xl..."
  placeholder="¿Qué te gustaría hacer?&#10;1️⃣ Seguir comprando&#10;2️⃣ Ver catálogo..."
/>
```

Then save to `settings/prompts` as `closingMenu` or keep in `welcome_messages` as `cierreMenuFinal` (backend supports both).

---

### **Update 2**: Support Multiple Closing Words

Currently, `palabra_cierre` is a single text input. For better intent detection, it should be an array.

**Suggested UI Change**:
```jsx
// Option A: Tags input (like Tailwind UI Select Multiple)
<div className="flex flex-wrap gap-2 mb-2">
  {palabrasCierre.map((palabra, i) => (
    <span key={i} className="bg-green-600 px-3 py-1 rounded-full text-sm flex items-center gap-2">
      {palabra}
      <button onClick={() => eliminarPalabra(i)}>×</button>
    </span>
  ))}
</div>
<input
  placeholder="Agregar palabra (Enter para añadir)"
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      agregarPalabra(e.target.value);
      e.target.value = '';
    }
  }}
/>
```

**Backend Already Supports**:
- Array: `closingWords: ["gracias", "eso es todo", "chao"]`
- String (with delimiters): `palabra_cierre: "gracias, eso es todo, chao"`

---

### **Update 3**: Add Advanced LLM Parameters

The backend supports these parameters, but the frontend doesn't expose them:

```jsx
// Add in "Entrenamiento IA" card:
<div className="grid grid-cols-2 gap-4 mt-4">
  <div>
    <label>Temperature (0-1)</label>
    <input type="number" step="0.1" min="0" max="1" value={temperature} />
  </div>
  <div>
    <label>Max Tokens</label>
    <input type="number" step="256" min="256" max="4096" value={maxTokens} />
  </div>
</div>
```

Then save to `settings/prompts`:
```javascript
await updateDoc(doc(db, "settings", "prompts"), {
  entrenamiento_base: basePrompt,
  palabra_cierre: palabraCierre,
  closingMenu: menuCierre,
  params: {
    temperature: parseFloat(temperature),
    max_tokens: parseInt(maxTokens),
    top_p: parseFloat(topP)
  }
});
```

---

## 🎯 **Configuration Guide for Insuapliques**

### **Step 1**: Set Base Prompt via Frontend

1. Go to **Configuración de Entrenamiento** panel
2. Click **Editar** in "🤖 Entrenamiento IA"
3. Paste content from `INSUAPLIQUES_BASE_PROMPT.md` into **"Prompt base"**
4. In **"Palabra de cierre"**, enter: `gracias, eso es todo, ya está, nada más, perfecto, listo, chao, adiós, bye`
5. Click **Guardar Configuración**

### **Step 2**: Set Welcome Messages

1. Click **Editar** in "💬 Mensajes de Bienvenida"
2. Update these fields:

```
saludoSinNombre: ¡Hola! Bienvenido/a a Insuapliques 👋
Somos especialistas en parches, estampados DTF y camisetas personalizadas.

saludoConNombre: ¡Hola de nuevo, {{nombre}}! 😊
¿En qué puedo ayudarte hoy?

pedirNombre: Para ofrecerte un mejor servicio, ¿cómo te llamas?

agradecerNombre: ¡Encantado de conocerte, {{nombre}}! 🙌
¿Te interesa conocer nuestros productos?

atencionHumana: Te conecto con un asesor humano de inmediato. Por favor espera un momento 👤.

cierreOpcion1: ¡Perfecto! Sigo aquí para lo que necesites. ¿Qué más te gustaría saber?

cierreOpcion2: Te envío el catálogo completo 📘

cierreOpcion3: Un asesor humano se comunicará contigo pronto. ¡Gracias por tu paciencia! 👤

cierreOpcion4: ¡Fue un placer ayudarte! Vuelve pronto a Insuapliques 😊
Recuerda que estamos en Instagram: @insuapliques

cierreDefault: Por favor elige una opción válida (1, 2, 3 o 4).

cierreMenuFinal: ¡Perfecto! ¿Qué te gustaría hacer?

1️⃣ Seguir comprando
2️⃣ Ver catálogo completo
3️⃣ Hablar con un asesor
4️⃣ Finalizar conversación

Responde con el número.
```

3. Click **Guardar**

### **Step 3**: Upload Price List

1. Prepare XLSX file (see `INSUAPLIQUES_IMPLEMENTATION_GUIDE.md` for format)
2. Click **Subir Documento** (or **Reemplazar Archivo** if one exists)
3. Select XLSX file
4. Wait for upload confirmation ✅

**Validation**:
- Check `settings/archivo_entrenamiento` document has `url` field
- Test URL in browser (should download XLSX)

---

## 🧪 **Testing Integration**

### **Test 1**: Verify Prompt Loading

**Backend logs should show**:
```
[promptManager] 📚 Loading prompt from Firestore: settings/prompts
[promptManager] ✅ Prompt loaded successfully: {
  path: 'settings/prompts',
  promptBaseLength: 2847,
  closingWordsCount: 9,
  hasClosingMenu: true
}
```

**If `closingWordsCount: 0`**:
- Check `settings/prompts` → `palabra_cierre` has value
- Should be comma-separated: `"gracias, eso es todo, chao"`

**If `hasClosingMenu: false`**:
- Check `settings/welcome_messages` → `cierreMenuFinal` has value
- Should contain full menu with options 1-4

---

### **Test 2**: Verify Price List Loading

**Backend logs should show**:
```
[priceListLoader] 📄 Document data: {
  Name: 'LISTA DE PRECIOS.xlsx',
  Path: 'Entrenamiento/1234567890_LISTA DE PRECIOS.xlsx',
  hasUrl: true
}
[priceListLoader] 📥 Downloading from URL: https://...
[priceListLoader] 📊 Loaded 150 rows from XLSX
[priceListLoader] ✅ Processed into 45 unique products (5 combos, 40 units)
```

**If download fails**:
- Verify Storage file permissions (public read)
- Test `url` field in browser
- Check `Path` matches actual file in Storage

---

### **Test 3**: Verify Welcome Messages

Send test message: `Hola`

**Expected**:
```
Bot: ¡Hola! Bienvenido/a a Insuapliques 👋
Somos especialistas en parches, estampados DTF y camisetas personalizadas.
```

**If wrong message appears**:
- Check `settings/welcome_messages` → `saludoSinNombre`
- Verify `welcomeFlow.ts` is calling `getMensaje('saludoSinNombre')`

---

## 📊 **Data Flow Diagram**

```
┌─────────────────────────────────────────────┐
│         Frontend (EntrenamientoConfig.jsx)  │
├─────────────────────────────────────────────┤
│                                             │
│  [User edits prompt] ──────────────┐        │
│  [User uploads XLSX] ──────┐       │        │
│  [User sets messages] ──┐  │       │        │
│                         │  │       │        │
└─────────────────────────┼──┼───────┼────────┘
                          │  │       │
                          ▼  ▼       ▼
                    ┌─────────────────────┐
                    │   Firebase Firestore │
                    ├─────────────────────┤
                    │ settings/prompts    │ ◄── entrenamiento_base, palabra_cierre
                    │ settings/welcome_   │ ◄── saludoConNombre, cierreMenuFinal, etc.
                    │   messages          │
                    │ settings/archivo_   │ ◄── path, url, nombre
                    │   entrenamiento     │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Firebase Storage     │ ◄── XLSX file uploaded
                    └─────────────────────┘
                              │
                    ┌─────────┴─────────────────────┐
                    │                               │
                    ▼                               ▼
        ┌─────────────────────┐      ┌──────────────────────┐
        │ promptManager.ts    │      │ priceListLoader.ts   │
        ├─────────────────────┤      ├──────────────────────┤
        │ - extractPromptBase │      │ - Downloads XLSX     │
        │ - normalize fields  │      │ - Parses combos      │
        │ - onSnapshot listen │      │ - Formats for AI     │
        └─────────────────────┘      └──────────────────────┘
                    │                               │
                    └───────────┬───────────────────┘
                                ▼
                    ┌─────────────────────┐
                    │   aiService.ts      │
                    ├─────────────────────┤
                    │ - Loads config      │
                    │ - Injects price list│
                    │ - Calls OpenAI GPT-5│
                    └─────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  User receives reply │
                    │  via WhatsApp        │
                    └─────────────────────┘
```

---

## ✅ **Compatibility Matrix**

| Feature | Frontend Sends | Backend Reads | Status |
|---------|----------------|---------------|--------|
| Base prompt | `entrenamiento_base` | `promptBase`, `prompt_base`, `entrenamiento_base` | ✅ Compatible |
| Closing words | `palabra_cierre` (string) | `closingWords` (array), `palabra_cierre` (string) | ✅ Compatible |
| Closing menu | `cierreMenuFinal` (in welcome_messages) | `closingMenu`, `cierreMenuFinal` | ✅ Compatible |
| Price list path | `path` | `Path`, `path` | ✅ Compatible |
| Price list URL | `url` | `url` (preferred) | ✅ Compatible |
| Welcome messages | All fields | Direct match | ✅ Compatible |
| LLM params | *(not exposed)* | `params.*` (uses defaults) | ⚠️ Partial |

---

## 🚀 **Deployment Checklist**

Before deploying with frontend integration:

- [x] Backend updated to support `palabra_cierre` → `closingWords[]`
- [x] Backend supports `cierreMenuFinal` → `closingMenu`
- [x] Backend already supports `entrenamiento_base`
- [x] Price list loader supports both `url` and `Path`
- [ ] **User Action**: Configure base prompt via frontend
- [ ] **User Action**: Set welcome messages via frontend
- [ ] **User Action**: Upload price list XLSX via frontend
- [ ] **User Action**: Test all changes via WhatsApp

---

## 📞 **Support Notes**

**If frontend changes fail to reflect in bot**:
1. Check Firestore documents match expected schema
2. Check backend logs for `[promptManager]` entries
3. Verify `onSnapshot` listener is active (hot reload)
4. Restart backend server if needed

**If price list doesn't load**:
1. Verify `url` field in `settings/archivo_entrenamiento`
2. Test URL in browser (should download file)
3. Check Storage permissions (public read)
4. Check XLSX format matches spec

**Frontend doesn't show current values**:
1. Check React useEffect dependencies
2. Verify Firestore reads (check console logs)
3. Check document paths match exactly

---

**Version**: 1.1
**Last Updated**: January 2025 (Post-Frontend Integration)
**Status**: ✅ **BACKEND UPDATED - FULLY COMPATIBLE**
