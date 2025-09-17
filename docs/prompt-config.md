# Prompt y parámetros IA en Firestore

El servicio `promptManager` lee la configuración dinámica desde el documento definido en `FIRESTORE_PROMPT_DOC_PATH` (por defecto `settings/EntrenamientoConfig`).

## Estructura sugerida del documento

```json
{
  "promptBase": "Eres un asistente virtual experto en productos textiles y personalización...",
  "closingWords": ["Lead en Proceso", "Cierre automático"],
  "closingMenu": "1. Volver al inicio\n2. Hablar con un asesor",
  "temperature": 0.7,
  "max_tokens": 600,
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "stream": false,
  "timeoutMs": 20000
}
```

> Si el documento no existe, la aplicación creará uno de ejemplo en el primer arranque.

## Actualizaciones sin redeploy

El módulo mantiene una caché con `onSnapshot`, por lo que cualquier cambio en Firestore se propaga inmediatamente a las respuestas del modelo sin reiniciar el servidor.

## Uso en el backend

- `ensurePromptConfig()` inicializa la caché y suscripción.
- `getPromptConfig()` devuelve el último estado normalizado.
- `shouldAppendClosing(respuesta)` permite detectar palabras/expresiones de cierre y activar el menú de despedida.

## Timeout y reintentos

- `timeoutMs` define el tiempo máximo (ms) antes de abortar la llamada al modelo principal.
- `LLM_MAX_RETRIES` controla reintentos exponenciales (máximo 2 por defecto).
- Si falla el modelo principal y existe `LLM_FALLBACK`, se invoca el fallback con un circuito de corte configurable (`LLM_FALLBACK_FAILURE_THRESHOLD`, `LLM_FALLBACK_COOLDOWN_MS`).
