# Agente OpenAI con Herramientas (Function Calling)

## 📋 Descripción

Sistema de agente inteligente que utiliza la API de OpenAI con **Function Calling** para ejecutar herramientas de forma automática según la intención del usuario.

El agente:
- ✅ Carga su prompt base desde **Firestore** (`settings/prompts.entrenamiento_base`)
- ✅ Detecta automáticamente cuándo usar cada herramienta
- ✅ Ejecuta múltiples herramientas en una sola conversación
- ✅ Maneja errores con **fallback automático**
- ✅ Soporta historial de conversación multi-turno
- ✅ Se integra con tu sistema existente de Firebase y WhatsApp

---

## 🛠️ Herramientas Disponibles

### 1. `buscarProductoFirestore(keyword: string)`
**Propósito:** Busca productos en la colección `productos_chatbot` de Firestore.

**Cuándo se activa:**
- Usuario pregunta por un producto específico
- Ejemplos: "¿Tienen chompas?", "Quiero ver joggers"

**Retorna:**
```typescript
{
  success: boolean,
  producto?: {
    keyword: string,
    tipo: string,
    respuesta: string,
    url: string
  },
  message: string
}
```

---

### 2. `enviarCatalogo(tipo: string)`
**Propósito:** Envía catálogos PDF, imágenes o videos al usuario vía WhatsApp.

**Cuándo se activa:**
- Usuario solicita ver catálogos
- Ejemplos: "Envíame el catálogo de chompas", "Quiero ver opciones de polos"

**Integración:**
- Usa el servicio `intentarEnviarCatalogo()` existente
- Sincroniza con `liveChatStates` y `liveChat`

**Retorna:**
```typescript
{
  success: boolean,
  message: string
}
```

---

### 3. `transferirAAsesor(motivo: string)`
**Propósito:** Activa el modo humano y transfiere la conversación a un asesor real.

**Cuándo se activa:**
- Usuario pide hablar con una persona
- Consultas complejas que el bot no puede resolver
- Ejemplos: "Quiero hablar con un asesor", "Necesito ayuda personalizada"

**Qué hace:**
- Actualiza `liveChatStates.modoHumano = true`
- Cambia estado a `TRANSFERIDO`
- Registra en `liveChat` con metadata de transferencia

**Retorna:**
```typescript
{
  success: boolean,
  message: string,
  motivo: string
}
```

---

### 4. `calcularPrecio(cantidad: number, tipo: string)`
**Propósito:** Calcula precios estimados según cantidad y tipo de producto.

**Cuándo se activa:**
- Usuario pregunta por precios
- Ejemplos: "¿Cuánto cuestan 50 polos?", "Precio para 100 chompas"

**Sistema de descuentos:**
- 20+ unidades: 10% descuento
- 50+ unidades: 15% descuento
- 100+ unidades: 20% descuento

**Retorna:**
```typescript
{
  success: boolean,
  cotizacion: {
    tipo: string,
    cantidad: number,
    precioUnitario: number,
    descuento: string,
    precioConDescuento: string,
    total: string,
    moneda: string
  },
  message: string
}
```

> **Nota:** Los precios base están hardcodeados en el servicio. Modifica la función `calcularPrecio()` para integrar con tu sistema de precios real.

---

## 📝 Configuración del Prompt en Firestore

### Estructura del documento

**Path:** `settings/prompts`

```json
{
  "entrenamiento_base": "Eres un asistente virtual experto de Mimétisa...",
  "temperatura": 0.7,
  "max_tokens": 2048,
  "palabra_cierre": "gracias, adios, hasta luego"
}
```

### Campos soportados:
- `entrenamiento_base` (string) - **Instrucciones del agente** ⭐ REQUERIDO
- `temperatura` (number) - Control de creatividad (0-2)
- `max_tokens` (number) - Máximo de tokens en respuesta
- `palabra_cierre` (string) - Palabras de cierre separadas por comas

---

## 🚀 Uso Básico

### Opción 1: Llamada Simple (sin historial)

```typescript
import { simpleAgentCall } from './services/agentService.js';

const phone = '51987654321';
const userMessage = '¿Cuánto cuestan 50 chompas?';

const respuesta = await simpleAgentCall(phone, userMessage);
console.log(respuesta);
// "Para 50 chompas personalizadas, el precio sería S/ 21.25 por unidad..."
```

### Opción 2: Llamada Completa (con detalles de herramientas)

```typescript
import { executeAgent } from './services/agentService.js';

const response = await executeAgent({
  phone: '51987654321',
  userMessage: 'Envíame el catálogo de chompas',
});

console.log(response.text); // Respuesta del agente
console.log(response.toolCalls); // Array de herramientas ejecutadas
console.log(response.latencyMs); // Tiempo de respuesta
console.log(response.usedFallback); // Si hubo error y se usó fallback
```

### Opción 3: Conversación con Historial (multi-turno)

```typescript
import { executeAgent } from './services/agentService.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const history: ChatCompletionMessageParam[] = [];

// Turno 1
const msg1 = 'Cuánto cuestan 50 polos?';
const res1 = await executeAgent({
  phone: '51987654321',
  userMessage: msg1,
  conversationHistory: history,
});

history.push({ role: 'user', content: msg1 });
history.push({ role: 'assistant', content: res1.text });

// Turno 2 (el agente recuerda el contexto)
const msg2 = 'Y si son 100 unidades?';
const res2 = await executeAgent({
  phone: '51987654321',
  userMessage: msg2,
  conversationHistory: history,
});

console.log(res2.text); // El agente entiende que se refiere a polos
```

---

## 🔌 Integración con BuilderBot

### Ejemplo: Usar en un flow

```typescript
import { addKeyword } from '@builderbot/bot';
import { simpleAgentCall } from '~/services/agentService.js';

const flowAgente = addKeyword(['agente', 'pregunta', 'consulta'])
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;
    const userMessage = ctx.body;

    try {
      const respuesta = await simpleAgentCall(phone, userMessage);
      await flowDynamic(respuesta);
    } catch (error) {
      console.error('[flowAgente] Error:', error);
      await flowDynamic(
        'Disculpa, hubo un problema. ¿Te gustaría hablar con un asesor?'
      );
    }
  });

export default flowAgente;
```

### Ejemplo: Usar en el conversation handler

```typescript
// En src/conversation/handler.ts
import { executeAgent } from '~/services/agentService.js';

async function manejarMensaje(phone: string, mensaje: string) {
  const response = await executeAgent({
    phone,
    userMessage: mensaje,
  });

  // Si se transfirió a humano, detener procesamiento del bot
  const wasTransferred = response.toolCalls.some(
    (call) => call.toolName === 'transferirAAsesor' && call.success
  );

  if (wasTransferred) {
    console.log(`[handler] Usuario ${phone} transferido a humano`);
    return; // No enviar más mensajes automáticos
  }

  // Enviar respuesta del agente
  await provider.sendMessage(phone, response.text);
}
```

---

## ⚙️ Variables de Entorno

```bash
# Configuración OpenAI
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o  # Modelo a usar (gpt-4o, gpt-4-turbo, etc.)
LLM_TIMEOUT_MS=60000  # Timeout en milisegundos
LLM_MAX_RETRIES=2  # Reintentos en caso de error

# Configuración Firestore
FIRESTORE_PROMPT_DOC_PATH=settings/prompts  # Path al documento de configuración
```

---

## 🧪 Testing

### Ejecutar ejemplos de prueba

```bash
# Ejecutar todos los ejemplos
tsx src/examples/agentExample.ts

# O importar ejemplos individuales
tsx -e "import { ejemplo1_llamadaSimple } from './src/examples/agentExample.js'; ejemplo1_llamadaSimple()"
```

### Casos de prueba incluidos:
1. ✅ Llamada simple sin historial
2. ✅ Llamada con detalles de herramientas
3. ✅ Conversación multi-turno con historial
4. ✅ Transferencia a asesor humano
5. ✅ Búsqueda de producto
6. ✅ Cotización de precio

---

## 🔧 Personalización

### Agregar una nueva herramienta

**Paso 1:** Define la herramienta en el array `tools`:

```typescript
{
  type: 'function',
  function: {
    name: 'consultarStock',
    description: 'Consulta el stock disponible de un producto',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'ID del producto a consultar',
        },
      },
      required: ['productId'],
    },
  },
}
```

**Paso 2:** Implementa la función:

```typescript
async function consultarStock(productId: string): Promise<object> {
  const stockDoc = await db.collection('stock').doc(productId).get();

  if (!stockDoc.exists) {
    return { success: false, message: 'Producto no encontrado' };
  }

  const data = stockDoc.data();
  return {
    success: true,
    stock: data?.cantidad ?? 0,
    disponible: (data?.cantidad ?? 0) > 0,
  };
}
```

**Paso 3:** Agregar al dispatcher:

```typescript
async function executeTool(toolName: string, args: Record<string, unknown>, phone: string) {
  switch (toolName) {
    case 'consultarStock':
      return consultarStock(args.productId as string);

    // ... otros casos
  }
}
```

---

## 🛡️ Manejo de Errores

El agente implementa **fallback automático** en estos casos:

1. **Timeout** - Si la API tarda más de `LLM_TIMEOUT_MS`
2. **Request aborted** - Si la conexión se interrumpe
3. **OpenAI API error** - Errores 500, 429, etc.
4. **Tool execution error** - Si alguna herramienta falla

**Mensaje de fallback:**
```
"Lo siento, hubo un problema al procesar tu solicitud. ¿Te gustaría que te conecte con un asesor humano?"
```

### Ejemplo de respuesta con error:

```typescript
const response = await executeAgent({
  phone: '51987654321',
  userMessage: 'Test',
});

if (response.usedFallback) {
  console.error('Error:', response.error);
  // "Request timed out after 60000ms"
}
```

---

## 📊 Logs y Monitoreo

El agente genera logs estructurados:

```typescript
// Logs de inicio
[agentService] ✅ Instrucciones cargadas desde Firestore: {
  path: 'settings/prompts',
  length: 1234,
  preview: 'Eres un asistente virtual...'
}

// Logs de herramientas
[agentService] 🛠️ Model requested 2 tool call(s)
[agentService] Executing tool: enviarCatalogo { tipo: 'chompas' }
[agentService] 📄 Enviando catálogo de tipo: "chompas" a 51987654321

// Logs de éxito
[agentService] ✅ Agent execution completed: {
  toolCallsExecuted: 2,
  responseLength: 156,
  latencyMs: 3421
}

// Logs de error
[agentService] ❌ Agent execution failed: Error message...
```

---

## 📚 Recursos Adicionales

### Tipos TypeScript

```typescript
interface AgentContext {
  phone: string;
  userMessage: string;
  conversationHistory?: ChatCompletionMessageParam[];
}

interface AgentResponse {
  text: string;
  toolCalls: ToolCallResult[];
  latencyMs: number;
  usedFallback: boolean;
  error?: string;
}

interface ToolCallResult {
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  success: boolean;
}
```

### Referencias OpenAI
- [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Best Practices](https://platform.openai.com/docs/guides/function-calling/best-practices)

---

## 🐛 Troubleshooting

### El agente no usa las herramientas

**Problema:** El agente responde sin ejecutar herramientas aunque debería.

**Solución:**
- Mejora las descripciones de las herramientas en el array `tools`
- Asegúrate de que el prompt incluya referencias a las herramientas
- Usa un modelo más reciente (gpt-4o es más confiable que gpt-3.5-turbo)

---

### Error: "OPENAI_API_KEY no configurada"

**Solución:**
```bash
# En tu .env
OPENAI_API_KEY=sk-proj-...
```

---

### Error: "Campo entrenamiento_base vacío"

**Solución:**
1. Ve a Firebase Console
2. Firestore Database
3. Navega a `settings/prompts`
4. Agrega el campo `entrenamiento_base` con tu prompt

---

### Las herramientas se ejecutan pero la respuesta es vacía

**Problema:** `response.text === ''`

**Solución:**
- El modelo necesita que le digas explícitamente en el prompt que debe responder después de usar herramientas
- Agrega al prompt: "Después de usar herramientas, genera una respuesta amigable para el usuario"

---

## 📄 Licencia

Parte del proyecto Chatbot Mimétisa. Uso interno.

---

## 🤝 Soporte

Para preguntas o problemas, contacta al equipo de desarrollo.
