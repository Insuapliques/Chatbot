# API Documentation - Frontend Integration

Documentación completa de endpoints para integrar el agente de OpenAI con tu frontend.

**Base URL:** `http://localhost:3008` (desarrollo) o tu URL de producción

**Autenticación:** Todos los endpoints requieren uno de los siguientes headers:
- `X-Api-Key: your-api-key`
- `X-Service-Token: your-service-token`

---

## 📋 Tabla de Contenidos

1. [Chat Endpoints](#chat-endpoints)
2. [Prompt Management](#prompt-management)
3. [Tools & Capabilities](#tools--capabilities)
4. [Conversation State](#conversation-state)
5. [Health Check](#health-check)
6. [Ejemplos de Uso](#ejemplos-de-uso)

---

## Chat Endpoints

### 1. Chat Simple (Recomendado)

Endpoint básico para enviar un mensaje y obtener una respuesta del agente.

**POST** `/api/agent/chat`

#### Request Body

```json
{
  "phone": "51987654321",
  "message": "¿Cuánto cuestan 50 chompas?"
}
```

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "response": "Para 50 chompas personalizadas, el precio sería S/ 21.25 por unidad con un 15% de descuento, totalizando S/ 1,062.50",
    "latency": 2341,
    "phone": "51987654321"
  }
}
```

#### Response Error (400/500)

```json
{
  "error": "Cuerpo de la petición inválido",
  "details": [
    {
      "path": "message",
      "message": "El mensaje es obligatorio"
    }
  ]
}
```

#### Ejemplo cURL

```bash
curl -X POST http://localhost:3008/api/agent/chat \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key" \
  -d '{
    "phone": "51987654321",
    "message": "Envíame el catálogo de chompas"
  }'
```

#### Ejemplo JavaScript/TypeScript

```typescript
const response = await fetch('http://localhost:3008/api/agent/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': 'your-api-key',
  },
  body: JSON.stringify({
    phone: '51987654321',
    message: '¿Cuánto cuestan 50 chompas?',
  }),
});

const data = await response.json();
console.log(data.data.response); // Respuesta del agente
```

---

### 2. Chat Avanzado (Con historial y detalles)

Endpoint avanzado que incluye historial de conversación y detalles sobre herramientas ejecutadas.

**POST** `/api/agent/chat-advanced`

#### Request Body

```json
{
  "phone": "51987654321",
  "message": "Y si son 100 unidades?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "¿Cuánto cuestan 50 chompas?"
    },
    {
      "role": "assistant",
      "content": "Para 50 chompas el precio es S/ 21.25 c/u"
    }
  ]
}
```

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "text": "Para 100 chompas, el precio baja a S/ 20.00 por unidad con 20% de descuento, totalizando S/ 2,000.00",
    "toolCalls": [
      {
        "toolName": "calcularPrecio",
        "arguments": {
          "cantidad": 100,
          "tipo": "chompa"
        },
        "result": {
          "success": true,
          "cotizacion": {
            "tipo": "chompa",
            "cantidad": 100,
            "precioUnitario": 25,
            "descuento": "20%",
            "precioConDescuento": "20.00",
            "total": "2000.00",
            "moneda": "PEN"
          }
        },
        "success": true
      }
    ],
    "latencyMs": 3421,
    "usedFallback": false,
    "error": null,
    "phone": "51987654321"
  }
}
```

#### Ejemplo JavaScript (Conversación multi-turno)

```typescript
// Estado del componente
const [history, setHistory] = useState([]);

// Función para enviar mensaje
async function sendMessage(userMessage: string) {
  const response = await fetch('http://localhost:3008/api/agent/chat-advanced', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': 'your-api-key',
    },
    body: JSON.stringify({
      phone: '51987654321',
      message: userMessage,
      conversationHistory: history,
    }),
  });

  const data = await response.json();

  // Actualizar historial
  setHistory([
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: data.data.text },
  ]);

  return data.data.text;
}
```

---

## Prompt Management

### 3. Obtener Prompt Actual

**GET** `/api/agent/prompt`

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "entrenamiento_base": "Eres un asistente virtual experto de Mimétisa...",
    "temperatura": 0.7,
    "max_tokens": 2048,
    "palabra_cierre": "gracias, adios, hasta luego",
    "path": "settings/prompts"
  }
}
```

#### Response Not Found (404)

```json
{
  "error": "Documento de prompt no encontrado",
  "path": "settings/prompts"
}
```

#### Ejemplo React Component

```tsx
import { useState, useEffect } from 'react';

function PromptEditor() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3008/api/agent/prompt', {
      headers: { 'X-Api-Key': 'your-api-key' },
    })
      .then(res => res.json())
      .then(data => {
        setPrompt(data.data.entrenamiento_base);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      {loading ? 'Cargando...' : (
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      )}
    </div>
  );
}
```

---

### 4. Actualizar Prompt

**PUT** `/api/agent/prompt`

#### Request Body

```json
{
  "entrenamiento_base": "Eres un asistente virtual experto de Mimétisa, empresa especializada en textiles y productos personalizados.\n\nResponde de forma breve, clara y empática."
}
```

#### Response Success (200)

```json
{
  "success": true,
  "message": "Prompt actualizado exitosamente",
  "path": "settings/prompts"
}
```

#### Response Error (400)

```json
{
  "error": "Cuerpo de la petición inválido",
  "details": [
    {
      "path": "entrenamiento_base",
      "message": "El prompt debe tener al menos 10 caracteres"
    }
  ]
}
```

#### Ejemplo React (Guardar prompt)

```tsx
async function savePrompt(newPrompt: string) {
  const response = await fetch('http://localhost:3008/api/agent/prompt', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': 'your-api-key',
    },
    body: JSON.stringify({
      entrenamiento_base: newPrompt,
    }),
  });

  const data = await response.json();

  if (data.success) {
    alert('Prompt actualizado exitosamente');
  }
}
```

---

## Tools & Capabilities

### 5. Listar Herramientas Disponibles

**GET** `/api/agent/tools`

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "buscarProductoFirestore",
        "description": "Busca productos en la base de datos de Firestore",
        "parameters": {
          "keyword": "string - Palabra clave del producto"
        },
        "example": {
          "keyword": "chompas"
        }
      },
      {
        "name": "enviarCatalogo",
        "description": "Envía un catálogo PDF, imagen o video al usuario",
        "parameters": {
          "tipo": "string - Tipo de producto del catálogo"
        },
        "example": {
          "tipo": "polos"
        }
      },
      {
        "name": "transferirAAsesor",
        "description": "Transfiere la conversación a un asesor humano",
        "parameters": {
          "motivo": "string - Motivo de la transferencia"
        },
        "example": {
          "motivo": "consulta compleja"
        }
      },
      {
        "name": "calcularPrecio",
        "description": "Calcula precios estimados según cantidad y tipo",
        "parameters": {
          "cantidad": "number - Cantidad de unidades",
          "tipo": "string - Tipo de prenda"
        },
        "example": {
          "cantidad": 50,
          "tipo": "chompa"
        }
      }
    ],
    "totalTools": 4
  }
}
```

#### Ejemplo React (Mostrar herramientas)

```tsx
function ToolsList() {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    fetch('http://localhost:3008/api/agent/tools', {
      headers: { 'X-Api-Key': 'your-api-key' },
    })
      .then(res => res.json())
      .then(data => setTools(data.data.tools));
  }, []);

  return (
    <ul>
      {tools.map((tool) => (
        <li key={tool.name}>
          <strong>{tool.name}</strong>: {tool.description}
        </li>
      ))}
    </ul>
  );
}
```

---

## Conversation State

### 6. Obtener Historial de Conversación

**GET** `/api/agent/history/:phone?limit=20`

#### URL Parameters
- `phone` (required): Número de teléfono del usuario
- `limit` (optional, query): Número de mensajes a obtener (default: 20)

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "phone": "51987654321",
    "messages": [
      {
        "id": "abc123",
        "text": "Hola, quiero información",
        "origen": "cliente",
        "timestamp": "2025-10-15T10:30:00Z",
        "fileUrl": null,
        "fileType": null
      },
      {
        "id": "def456",
        "text": "¡Hola! ¿En qué puedo ayudarte?",
        "origen": "bot",
        "timestamp": "2025-10-15T10:30:05Z",
        "fileUrl": null,
        "fileType": null
      }
    ],
    "count": 2
  }
}
```

#### Ejemplo React (Chat History)

```tsx
function ChatHistory({ phone }: { phone: string }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:3008/api/agent/history/${phone}?limit=50`, {
      headers: { 'X-Api-Key': 'your-api-key' },
    })
      .then(res => res.json())
      .then(data => setMessages(data.data.messages));
  }, [phone]);

  return (
    <div className="chat-history">
      {messages.map((msg) => (
        <div key={msg.id} className={`message ${msg.origen}`}>
          <p>{msg.text}</p>
          <small>{new Date(msg.timestamp).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
```

---

### 7. Obtener Estado de Conversación

**GET** `/api/agent/state/:phone`

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "phone": "51987654321",
    "exists": true,
    "state": {
      "estadoActual": "CATALOGO_ENVIADO",
      "catalogoEnviado": true,
      "productoActual": "chompas",
      "modoHumano": false,
      "ultimoCambio": "2025-10-15T10:30:00Z"
    }
  }
}
```

#### Response (No existe estado)

```json
{
  "success": true,
  "data": {
    "phone": "51987654321",
    "exists": false,
    "state": null
  }
}
```

---

### 8. Reiniciar Estado de Conversación

**DELETE** `/api/agent/state/:phone`

#### Response Success (200)

```json
{
  "success": true,
  "message": "Estado de conversación reiniciado",
  "phone": "51987654321"
}
```

#### Ejemplo React (Reset Button)

```tsx
async function resetConversation(phone: string) {
  const response = await fetch(`http://localhost:3008/api/agent/state/${phone}`, {
    method: 'DELETE',
    headers: { 'X-Api-Key': 'your-api-key' },
  });

  const data = await response.json();

  if (data.success) {
    alert('Conversación reiniciada');
  }
}
```

---

## Health Check

### 9. Verificar Estado del Agente

**GET** `/api/agent/health`

#### Response Success (200)

```json
{
  "status": "healthy",
  "timestamp": "2025-10-15T10:30:00Z",
  "checks": {
    "openai": {
      "configured": true,
      "model": "gpt-4o"
    },
    "firestore": {
      "connected": true,
      "promptDocExists": true,
      "promptPath": "settings/prompts"
    },
    "tools": {
      "available": 4,
      "names": [
        "buscarProductoFirestore",
        "enviarCatalogo",
        "transferirAAsesor",
        "calcularPrecio"
      ]
    }
  }
}
```

#### Response Unhealthy (503)

```json
{
  "status": "unhealthy",
  "error": "OpenAI API key not configured"
}
```

---

## Ejemplos de Uso

### Componente React Completo

```tsx
import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function AgentChat() {
  const [phone] = useState('51987654321');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Agregar mensaje del usuario
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch('http://localhost:3008/api/agent/chat-advanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'your-api-key',
        },
        body: JSON.stringify({
          phone,
          message: userMessage,
          conversationHistory: messages,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Agregar respuesta del agente
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.data.text },
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al enviar mensaje');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="agent-chat">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Escribe tu mensaje..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
```

### Vue.js Example

```vue
<template>
  <div class="agent-chat">
    <div class="messages">
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="['message', msg.role]"
      >
        {{ msg.content }}
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="input"
        @keyup.enter="sendMessage"
        placeholder="Escribe tu mensaje..."
        :disabled="loading"
      />
      <button @click="sendMessage" :disabled="loading">
        {{ loading ? 'Enviando...' : 'Enviar' }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      phone: '51987654321',
      input: '',
      messages: [],
      loading: false,
    };
  },
  methods: {
    async sendMessage() {
      if (!this.input.trim()) return;

      const userMessage = this.input.trim();
      this.input = '';
      this.loading = true;

      this.messages.push({ role: 'user', content: userMessage });

      try {
        const response = await fetch('http://localhost:3008/api/agent/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'your-api-key',
          },
          body: JSON.stringify({
            phone: this.phone,
            message: userMessage,
          }),
        });

        const data = await response.json();

        if (data.success) {
          this.messages.push({
            role: 'assistant',
            content: data.data.response,
          });
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
```

---

## Variables de Entorno Requeridas

```bash
# Backend .env
OPENAI_API_KEY=sk-proj-...
LLM_MODEL=gpt-4o
FIRESTORE_PROMPT_DOC_PATH=settings/prompts
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Frontend .env
VITE_API_BASE_URL=http://localhost:3008
VITE_API_KEY=your-api-key
```

---

## Códigos de Estado HTTP

| Código | Significado | Cuándo ocurre |
|--------|-------------|---------------|
| 200 | OK | Solicitud exitosa |
| 201 | Created | Recurso creado exitosamente |
| 400 | Bad Request | Datos de entrada inválidos |
| 401 | Unauthorized | API key faltante o inválida |
| 404 | Not Found | Recurso no encontrado |
| 423 | Locked | Usuario en modo humano (no se puede enviar mensajes del bot) |
| 500 | Internal Server Error | Error del servidor |
| 503 | Service Unavailable | Servicio no disponible (health check failed) |

---

## Rate Limiting & Best Practices

1. **Debouncing**: Espera 500ms después de que el usuario termine de escribir antes de enviar
2. **Loading States**: Siempre muestra indicadores de carga
3. **Error Handling**: Maneja errores de red y respuestas inválidas
4. **Retry Logic**: Implementa reintentos automáticos con backoff exponencial
5. **Token Management**: Guarda el API key de forma segura (variables de entorno)

---

## Soporte

Para más información, consulta:
- [AGENT_README.md](AGENT_README.md) - Documentación técnica del agente
- [CLAUDE.md](CLAUDE.md) - Guía del proyecto completo
