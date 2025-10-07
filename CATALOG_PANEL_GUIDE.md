# 📁 Catalog Products Panel - Integration Guide

## Overview

The **ProductosChatbotPanel.jsx** frontend component manages the deterministic catalog resources that are sent when users request catalogs, product info, or specific keywords.

---

## 🔄 **Schema Compatibility Update**

### **Issue Found**: Single Keyword Limitation

**Current Frontend** (`ProductosChatbotPanel.jsx`):
```javascript
// Stores in productos_chatbot collection:
{
  keyword: "aplique",  // ← Single string (lowercase)
  tipo: "imagen",
  url: "https://...",
  respuesta: "Aquí está el catálogo..."
}
```

**Problem**: Users cannot set multiple trigger words for same resource.

**Example Use Case**:
- User wants catalog to trigger on: "catalogo", "catálogo", "catalog", "modelos", "diseños"
- Frontend only allows **one keyword per document**
- Workaround: Create 5 duplicate documents (inefficient)

---

## ✅ **Solution Implemented**

### **Backend Updated** (`src/services/productos.service.ts`)

✅ **Now supports BOTH formats**:

**Format 1** (Current Frontend - Single String):
```json
{
  "keyword": "aplique"
}
```

**Format 2** (Recommended - Array):
```json
{
  "keyword": ["catalogo", "catálogo", "catalog", "modelos", "diseños"]
}
```

**Backend Processing**:
```typescript
// If keyword is string → converts to array: ["aplique"]
// If keyword is array → uses as-is: ["catalogo", "catálogo", "catalog"]
// Matching: Checks ALL keywords in array
```

---

## 📊 **Current Frontend Flow**

### **1. User Creates Catalog Entry**

**Steps**:
1. Enter keyword (e.g., `"parches"`)
2. Select type (`imagen`, `pdf`, `video`)
3. Write bot response message
4. Upload file (image/PDF/video)
5. Click **"Guardar Documento"**

**Firestore Document Created**:
```json
{
  "keyword": "parches",  // ← Lowercase
  "tipo": "imagen",
  "url": "https://firebasestorage.googleapis.com/.../1234_parches.jpg",
  "respuesta": "Mira nuestros modelos de parches 🏷️"
}
```

---

### **2. User Requests Catalog via WhatsApp**

**Flow**:
```
User sends: "quiero ver parches"
  ↓
Backend: catalogo.service.ts → intentarEnviarCatalogo()
  ↓
Backend: productos.service.ts → findProductoByMessage()
  ↓
Normalize message: "quiero ver parches"
  ↓
Check if includes keyword: "parches" ✅ MATCH
  ↓
Return ProductoCatalogo object
  ↓
Send via Meta API:
  - Type: image
  - URL: https://...
  - Caption: "Mira nuestros modelos de parches 🏷️"
  ↓
Update state: catalogoEnviado = true
```

---

## 🎯 **Recommended Catalog Entries for Insuapliques**

### **Entry 1: General Catalog**

| Field | Value |
|-------|-------|
| **Palabra clave** | `catalogo` (or use array: see workaround below) |
| **Tipo** | `pdf` |
| **Mensaje** | `¡Aquí está nuestro catálogo completo de Insuapliques! 📘` |
| **Archivo** | Upload: `catalogo_insuapliques.pdf` |

**⚠️ Limitation**: Only triggers on exact match "catalogo" (not "catálogo", "catalog", "modelos")

**Workaround** (if no frontend update):
- Create 5 separate entries:
  1. keyword: `catalogo`
  2. keyword: `catálogo`
  3. keyword: `catalog`
  4. keyword: `modelos`
  5. keyword: `diseños`
- All pointing to same PDF URL and message

---

### **Entry 2: Parches Catalog**

| Field | Value |
|-------|-------|
| **Palabra clave** | `parches` |
| **Tipo** | `imagen` |
| **Mensaje** | `Mira nuestros modelos de parches bordados 🏷️` |
| **Archivo** | Upload: `parches_catalogo.jpg` |

**Triggers on**: "parches", "parche", "patches"
- ⚠️ Frontend only allows `parches` as keyword
- Other variants require duplicate entries

---

### **Entry 3: DTF Prints Catalog**

| Field | Value |
|-------|-------|
| **Palabra clave** | `dtf` |
| **Tipo** | `imagen` |
| **Mensaje** | `Conoce nuestros estampados DTF full color 🎨` |
| **Archivo** | Upload: `dtf_samples.jpg` |

**Triggers on**: "dtf"
- User may also say: "estampados", "prints", "transfer"
- Requires duplicate entries or array support

---

### **Entry 4: T-Shirts Catalog**

| Field | Value |
|-------|-------|
| **Palabra clave** | `camisetas` |
| **Tipo** | `imagen` |
| **Mensaje** | `Nuestras camisetas personalizadas 👕` |
| **Archivo** | Upload: `camisetas_catalogo.jpg` |

---

### **Entry 5: Video Tutorial (Optional)**

| Field | Value |
|-------|-------|
| **Palabra clave** | `tutorial` |
| **Tipo** | `video` |
| **Mensaje** | `Mira cómo aplicamos los parches 🎥` |
| **Archivo** | Upload: `tutorial_aplicacion.mp4` |

**⚠️ Important**: Video files must be valid video MIME type (checked by frontend)

---

## 🔧 **Backend Behavior**

### **Matching Logic** (`productos.service.ts`)

```typescript
// Example: User says "quiero ver el catalogo de parches"

// Step 1: Normalize message
normalized = "quiero ver el catalogo de parches"

// Step 2: Load all productos_chatbot entries
productos = [
  { keyword: "catalogo", keywords: ["catalogo"], ... },
  { keyword: "parches", keywords: ["parches"], ... },
  { keyword: "dtf", keywords: ["dtf"], ... }
]

// Step 3: Check each product's keywords
for (producto of productos) {
  for (keyword of producto.keywords) {
    if (normalized.includes(keyword)) {
      return producto; // ✅ Returns "parches" (first match)
    }
  }
}

// Step 4: Fallback (if no match)
if (/catalog|catalogo|diseño|modelo/.test(normalized)) {
  return productos[0]; // First entry (usually general catalog)
}

return null; // No catalog found
```

**Matching Rules**:
1. **Exact substring match**: `normalized.includes(keyword)`
2. **Case-insensitive**: All lowercase
3. **First match wins**: Returns immediately on first keyword match
4. **Fallback**: Common catalog keywords → returns first entry

---

## 📝 **Manual Array Keyword Entry** (Firestore Console)

Until frontend is updated, you can manually add array keywords via Firestore console:

### **Steps**:

1. Go to Firebase Console → Firestore Database
2. Navigate to `productos_chatbot` collection
3. Click on document (e.g., `catalogo_general`)
4. Click **Edit Field** on `keyword`
5. Change type from `string` to `array`
6. Add multiple values:
   ```
   [0]: "catalogo"
   [1]: "catálogo"
   [2]: "catalog"
   [3]: "modelos"
   [4]: "diseños"
   ```
7. Click **Update**

**Result**: This single document now triggers on ANY of those 5 keywords.

---

## 🚀 **Recommended Frontend Enhancements** (Optional)

### **Enhancement 1**: Multi-Keyword Input

**Current UI**:
```jsx
<input
  type="text"
  placeholder="Palabra clave (ej: aplique)"
  value={keyword}
  onChange={(e) => setKeyword(e.target.value)}
/>
```

**Suggested Improvement**:
```jsx
// Add state for keyword array
const [keywords, setKeywords] = useState([]);
const [keywordInput, setKeywordInput] = useState("");

// Tags UI
<div className="mb-2">
  <label className="block text-sm font-medium text-gray-300 mb-2">
    Palabras clave (presiona Enter para agregar)
  </label>
  <div className="flex flex-wrap gap-2 mb-2">
    {keywords.map((kw, i) => (
      <span key={i} className="bg-green-600 px-3 py-1 rounded-full text-sm flex items-center gap-2">
        {kw}
        <button
          onClick={() => setKeywords(keywords.filter((_, idx) => idx !== i))}
          className="text-white hover:text-red-300"
        >
          ×
        </button>
      </span>
    ))}
  </div>
  <input
    type="text"
    placeholder="Escribe y presiona Enter (ej: catalogo, catálogo, catalog)"
    value={keywordInput}
    onChange={(e) => setKeywordInput(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && keywordInput.trim()) {
        e.preventDefault();
        if (!keywords.includes(keywordInput.trim().toLowerCase())) {
          setKeywords([...keywords, keywordInput.trim().toLowerCase()]);
        }
        setKeywordInput("");
      }
    }}
    className="w-full p-3 rounded-md bg-gray-700 text-white border border-gray-600"
  />
</div>
```

**Save Logic Update**:
```javascript
// When saving/updating
await addDoc(collection(db, "productos_chatbot"), {
  keyword: keywords, // ← Array instead of single string
  tipo,
  url,
  respuesta,
});
```

**Display Update**:
```jsx
// In product list
<div className="mb-2">
  <span className="font-bold text-green-300">
    {Array.isArray(item.keyword) ? item.keyword.join(', ') : item.keyword}
  </span> – {item.tipo}
</div>
```

---

### **Enhancement 2**: URL Input (Alternative to Upload)

**Use Case**: Link to existing Storage file without re-uploading

**Suggested Addition**:
```jsx
<div className="flex items-center gap-4 my-4">
  <span className="text-gray-400">ó</span>
</div>

<input
  type="text"
  placeholder="URL directa (ej: https://storage.googleapis.com/...)"
  value={urlDirecta}
  onChange={(e) => setUrlDirecta(e.target.value)}
  className="w-full p-3 rounded-md bg-gray-700 text-white border border-gray-600"
/>
```

**Save Logic**:
```javascript
let url = urlDirecta.trim();

// Only upload if file provided and no URL entered
if (!url && file) {
  const storageRef = ref(storage, `productos_chatbot/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  url = await getDownloadURL(storageRef);
}

await addDoc(collection(db, "productos_chatbot"), {
  keyword: keywords,
  tipo,
  url, // From direct input or upload
  respuesta,
});
```

---

### **Enhancement 3**: Preview Before Save

**Suggested Addition**:
```jsx
{file && (
  <div className="p-4 bg-gray-700 rounded-md mb-4">
    <p className="text-sm text-gray-300 mb-2">Vista previa:</p>
    {tipo === "imagen" && (
      <img src={URL.createObjectURL(file)} alt="Preview" className="max-w-xs rounded-md" />
    )}
    {tipo === "video" && (
      <video src={URL.createObjectURL(file)} controls className="max-w-xs rounded-md" />
    )}
    {tipo === "pdf" && (
      <p className="text-green-400">📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
    )}
  </div>
)}
```

---

## 🧪 **Testing Catalog Entries**

### **Test 1**: Single Keyword Match

**Setup**:
- Create entry: keyword = `"parches"`, type = `imagen`

**Test**:
- Send via WhatsApp: `"Quiero ver parches"`
- **Expected**: Bot sends image with caption
- **Check**: `liveChatStates/{phone}` → `catalogoEnviado: true`

---

### **Test 2**: Array Keywords (Manual Firestore Entry)

**Setup**:
- Edit document via Firestore console
- Change `keyword` to array: `["catalogo", "catálogo", "catalog"]`

**Test**:
- Send: `"Quiero ver el catálogo"`
- Send: `"Show me the catalog"` (English)
- **Expected**: Both trigger same PDF
- **Check**: `logs/catalogSent/entries` has 2 entries

---

### **Test 3**: Fallback Behavior

**Setup**:
- Create general catalog: keyword = `"catalogo"`

**Test**:
- Send: `"Necesito información de productos"` (doesn't contain "catalogo")
- **Expected**: Fallback regex matches → sends first catalog entry
- **Check**: Backend logs show `[catalogo] Fallback match`

---

### **Test 4**: No Match

**Setup**:
- No entries with keyword = `"custom"`

**Test**:
- Send: `"Custom patches"`
- **Expected**: No catalog sent, AI handles message normally
- **Check**: `catalogoEnviado` remains `false`

---

## 📊 **Data Flow Diagram**

```
┌─────────────────────────────────────┐
│  Frontend: ProductosChatbotPanel   │
├─────────────────────────────────────┤
│ User enters:                        │
│ - keyword: "parches"                │
│ - tipo: "imagen"                    │
│ - respuesta: "Mira nuestros..."    │
│ - file: parches.jpg                 │
│                                     │
│ Clicks "Guardar Documento"          │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│      Firebase Storage Upload        │
├─────────────────────────────────────┤
│ Uploads to:                         │
│ productos_chatbot/1234_parches.jpg  │
│ Returns URL: https://...            │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│      Firestore Document Created     │
├─────────────────────────────────────┤
│ Collection: productos_chatbot       │
│ {                                   │
│   keyword: "parches",               │
│   tipo: "imagen",                   │
│   url: "https://...",               │
│   respuesta: "Mira nuestros..."     │
│ }                                   │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│    User sends WhatsApp message      │
├─────────────────────────────────────┤
│ "Quiero ver parches bordados"       │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Backend: conversation/handler.ts   │
├─────────────────────────────────────┤
│ Calls intentarEnviarCatalogo()      │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Backend: productos.service.ts      │
├─────────────────────────────────────┤
│ findProductoByMessage()             │
│ - Normalizes: "quiero ver parches..." │
│ - Matches keyword: "parches" ✅     │
│ - Returns ProductoCatalogo object   │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Backend: catalogo.service.ts       │
├─────────────────────────────────────┤
│ Sends via Meta API:                 │
│ - type: "image"                     │
│ - image.link: "https://..."         │
│ - image.caption: "Mira nuestros..." │
│                                     │
│ Logs to liveChat collection         │
│ Updates catalogoEnviado = true      │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│     User receives on WhatsApp       │
├─────────────────────────────────────┤
│ [Image of parches catalog]          │
│ Caption: "Mira nuestros modelos..." │
└─────────────────────────────────────┘
```

---

## ✅ **Configuration Checklist**

Before going live:

- [ ] Upload catalog PDF to Firebase Storage
- [ ] Create entry in panel: keyword = "catalogo" (or array via Firestore)
- [ ] Upload product category images (parches, DTF, camisetas)
- [ ] Create entries for each category
- [ ] Test each keyword via WhatsApp
- [ ] Verify files send successfully (check `logs/sendFailures` for errors)
- [ ] Verify `catalogoEnviado` state updates
- [ ] Test fallback behavior (generic "catalog" request)

---

## 🔍 **Troubleshooting**

### **Issue 1**: Catalog Not Sending

**Symptoms**: User requests catalog, nothing happens

**Checks**:
1. ✅ Document exists in `productos_chatbot` collection
2. ✅ `keyword` field matches user message (case-insensitive)
3. ✅ `url` field has valid Storage URL
4. ✅ Storage file permissions allow public read
5. ✅ `tipo` field is valid: "imagen", "pdf", or "video"

**Logs to check**:
```bash
grep -i "catalogo" logs/*.log
grep -i "findProductoByMessage" logs/*.log
```

---

### **Issue 2**: Wrong File Type Sent

**Symptoms**: PDF sent as image, or image sent as PDF

**Fix**:
- Edit document in panel
- Change `tipo` to correct value
- Re-test

---

### **Issue 3**: Multiple Keywords Not Working

**Current Limitation**: Frontend only supports single keyword

**Workarounds**:
1. **Option A**: Create duplicate entries for each keyword variant
2. **Option B**: Manually edit Firestore document (change `keyword` string → array)
3. **Option C**: Update frontend to support array input (see Enhancement 1 above)

---

## 📞 **Support**

**Frontend Issues**:
- File upload fails → Check Storage permissions
- Document not saving → Check Firestore rules
- Keywords not matching → Check for typos, case sensitivity

**Backend Issues**:
- Catalog not detected → Check `productos.service.ts` logs
- File not sending → Check `catalogo.service.ts` and `logs/sendFailures`
- State not updating → Check `liveChatStates` collection writes

---

**Version**: 1.0
**Last Updated**: January 2025
**Component**: ProductosChatbotPanel.jsx
**Backend Compatibility**: ✅ **UPDATED** - Supports both string and array keywords
