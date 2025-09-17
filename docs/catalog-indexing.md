# Indexador de catálogos

El módulo `src/services/catalogIndexer.ts` permite extraer texto de los archivos
almacenados en Cloud Storage y mantener sincronizada la colección de Firestore
`catalog_index`. El servicio soporta archivos PDF (mediante extracción del
texto incrustado) e imágenes comunes (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`,
`.tiff`, `.webp`, `.heic`) usando OCR con Google Cloud Vision. Para cualquier
otro tipo de archivo se realiza un volcado directo del contenido textual.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `STORAGE_CATALOGOS_PATH` | Prefijo dentro del bucket donde se ubican los catálogos a indexar. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Credenciales del servicio utilizadas por Firebase Admin y por el cliente de Vision para realizar OCR. |

> **Nota:** `FIREBASE_PRIVATE_KEY` debe respetar los saltos de línea reales
> (reemplaza los literales `\n` por saltos reales en tu gestor de secretos o
> en la configuración de la función de Cloud).

## Disparador automático por subida de archivos

Para procesar automáticamente cada archivo nuevo colocado en el prefijo
configurado, define una Cloud Function de almacenamiento que invoque al helper
`handleCatalogObjectFinalize` exportado por el servicio:

```ts
import * as functions from 'firebase-functions';
import { handleCatalogObjectFinalize } from './dist/services/catalogIndexer';

export const catalogObjectFinalize = functions.storage
  .bucket()
  .object()
  .onFinalize(async (object) => {
    const fileRef = object.name ?? '';
    const prefix = process.env.STORAGE_CATALOGOS_PATH ?? '';

    if (prefix && !fileRef.startsWith(prefix)) {
      console.log(`Se ignora ${fileRef} porque no pertenece al prefijo configurado (${prefix}).`);
      return;
    }

    await handleCatalogObjectFinalize(fileRef);
  });
```

1. Despliega la función dentro del mismo proyecto donde corre el bot (`firebase
   deploy --only functions`).
2. Configura `STORAGE_CATALOGOS_PATH` como variable de entorno de la función:

   ```bash
   firebase functions:config:set catalog.storage_path="catalogos/"
   ```

   o bien, usando Google Cloud Console → *Cloud Functions* → pestaña *Variables
   de entorno*.

## Reindexado programado o manual

- **Vía endpoint HTTP:** `POST /v1/catalog/reindex` ejecuta `reindexAll()` sobre
  todos los archivos dentro del prefijo configurado. Puedes llamarlo desde Cloud
  Scheduler o manualmente con `curl` añadiendo las cabeceras de autenticación
  habituales del proyecto.

- **Vía cron/Cloud Scheduler:** crea un job HTTP que apunte al endpoint
  anterior (por ejemplo, diario a las 02:00). Recuerda incluir el token o API
  key esperada por el middleware `authenticateRequest`.

## Resultado en Firestore

Cada archivo indexado actualiza/crea un documento en `catalog_index` cuya clave
es el nombre del archivo codificado en Base64 URL. El documento almacena:

- `fileRef`: referencia completa del objeto en el bucket.
- `bucket`: nombre del bucket.
- `status`: `indexed`, `empty` o `error`.
- `content`: texto extraído listo para búsquedas.
- `metadata`: tamaño, `contentType` y fecha de actualización reportados por
  Storage.
- `updatedAt`: `FieldValue.serverTimestamp()` con la fecha del último proceso.
- `errorMessage` (opcional) si la extracción falló.

Utiliza estos datos para búsquedas de texto o para depurar problemas de
indexación.
