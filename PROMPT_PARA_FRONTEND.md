# Prompt para el Equipo de Frontend

Copiar y pegar este prompt completo al equipo de frontend:

---

# Implementación de Panel de Control de Chat en Tiempo Real

Hola equipo de Frontend! Necesito que implementen un panel de control para manejar las conversaciones del chatbot de WhatsApp en tiempo real. El backend ya está listo con todos los endpoints necesarios.

## Contexto del Proyecto

Este es un chatbot de WhatsApp para **Mimétisa** (empresa de productos textiles personalizados). El bot responde automáticamente usando IA, pero los operadores humanos deben poder tomar control manual de las conversaciones cuando sea necesario.

## Repositorio y Configuración

- **Backend:** `https://github.com/tuusuario/Chatbot` (este repo)
- **Frontend:** `https://github.com/Insuapliques/Frontend.git`
- **Base URL del API:** `http://localhost:3008` (desarrollo) o configurar en `.env`

### Variables de Entorno Necesarias

Crear archivo `.env` en el frontend:

```env
# Para Vite (si usan Vite)
VITE_API_BASE_URL=http://localhost:3008
VITE_API_KEY=your-api-key-here

# Para Create React App (si usan CRA)
REACT_APP_API_BASE_URL=http://localhost:3008
REACT_APP_API_KEY=your-api-key-here
```

## Requerimientos Funcionales

### Página: Chat en Tiempo Real

Necesito una nueva página o sección en el frontend que permita:

1. **Ver lista de conversaciones activas**
   - Mostrar número de teléfono del cliente
   - Mostrar último mensaje recibido
   - Mostrar timestamp del último contacto
   - Badge visual si hay mensajes sin leer
   - Indicador visual si la conversación está en "modo humano" (bajo control manual)

2. **Tomar/Liberar control de conversaciones**
   - Botón "Tomar Control" que active el modo humano
   - Botón "Liberar Control" que devuelva el control al bot
   - Feedback visual claro del estado actual

3. **Chat en tiempo real**
   - Ver historial completo de mensajes
   - Diferenciar visualmente entre:
     - Mensajes del cliente (alineados a la izquierda, color A)
     - Mensajes del bot (alineados a la derecha, color B)
     - Mensajes del operador humano (alineados a la derecha, color C distinto al bot)
   - Input de texto para responder (solo habilitado si se tiene control)
   - Botón de envío
   - Auto-scroll al último mensaje

4. **Actualización automática**
   - Polling cada 2-5 segundos para nuevos mensajes
   - Actualización de la lista de conversaciones cada 5-10 segundos

## Endpoints del Backend Disponibles

Todos los endpoints requieren el header:
```
X-Api-Key: your-api-key
```

### 1. Listar Conversaciones Activas

```http
GET /panel/conversations?limit=50
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "phone": "51987654321",
        "estadoActual": "DISCOVERY",
        "modoHumano": false,
        "productoActual": "chompas",
        "catalogoEnviado": true,
        "pedidoEnProceso": false,
        "ultimoContacto": "2025-10-17T10:30:00Z",
        "lastMessage": {
          "text": "Hola, quiero información sobre chompas",
          "timestamp": "2025-10-17T10:30:00Z",
          "origen": "cliente"
        },
        "unreadCount": 1
      }
    ],
    "total": 1
  }
}
```

### 2. Tomar Control

```http
POST /panel/takeover/:phone
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Control tomado exitosamente",
  "phone": "51987654321",
  "modoHumano": true
}
```

### 3. Liberar Control

```http
POST /panel/release/:phone
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Control liberado exitosamente",
  "phone": "51987654321",
  "modoHumano": false
}
```

### 4. Enviar Mensaje como Operador

**IMPORTANTE:** Solo funciona si previamente se tomó control con `/panel/takeover/:phone`

```http
POST /panel/send
Content-Type: application/json

{
  "phone": "51987654321",
  "text": "Hola, soy María del equipo de Mimétisa"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Mensaje enviado exitosamente"
}
```

**Respuesta si no hay control (HTTP 403):**
```json
{
  "success": false,
  "error": "Debes tomar control de la conversación primero"
}
```

### 5. Obtener Mensajes de una Conversación

```http
GET /panel/messages/:phone?limit=50
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "phone": "51987654321",
    "messages": [
      {
        "id": "msg123",
        "text": "Hola",
        "fileUrl": null,
        "fileType": "text",
        "origen": "cliente",
        "timestamp": "2025-10-17T10:30:00Z"
      },
      {
        "id": "msg124",
        "text": "¿En qué puedo ayudarte?",
        "fileUrl": null,
        "fileType": "text",
        "origen": "bot",
        "timestamp": "2025-10-17T10:30:05Z"
      }
    ],
    "count": 2
  }
}
```

Los mensajes vienen con 3 tipos de `origen`:
- `"cliente"` = Mensaje del usuario final
- `"bot"` = Respuesta automática del bot
- `"operador"` = Mensaje enviado por un humano

### 6. Verificar Estado de Conversación

```http
GET /panel/status/:phone
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "phone": "51987654321",
    "exists": true,
    "modoHumano": true,
    "estadoActual": "DISCOVERY",
    "productoActual": "chompas",
    "catalogoEnviado": true,
    "pedidoEnProceso": false,
    "ultimoContacto": "2025-10-17T10:30:00Z"
  }
}
```

## Código de Ejemplo TypeScript/React

### Tipos TypeScript

```typescript
// types/panel.ts
export interface Message {
  id: string;
  text: string;
  fileUrl: string | null;
  fileType: string;
  origen: 'cliente' | 'bot' | 'operador';
  timestamp: string;
}

export interface Conversation {
  phone: string;
  estadoActual: string;
  modoHumano: boolean;
  productoActual: string | null;
  catalogoEnviado: boolean;
  pedidoEnProceso: boolean;
  ultimoContacto: string;
  lastMessage: {
    text: string;
    timestamp: string;
    origen: 'cliente' | 'bot' | 'operador';
  } | null;
  unreadCount: number;
}
```

### Servicio API

```typescript
// services/panelApi.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3008';
const API_KEY = import.meta.env.VITE_API_KEY;

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY || '',
};

export const panelApi = {
  async getConversations(limit = 50) {
    const response = await fetch(`${API_BASE_URL}/panel/conversations?limit=${limit}`, {
      headers: { 'X-Api-Key': API_KEY || '' },
    });
    return response.json();
  },

  async takeover(phone: string) {
    const response = await fetch(`${API_BASE_URL}/panel/takeover/${phone}`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY || '' },
    });
    return response.json();
  },

  async release(phone: string) {
    const response = await fetch(`${API_BASE_URL}/panel/release/${phone}`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY || '' },
    });
    return response.json();
  },

  async sendMessage(phone: string, text: string) {
    const response = await fetch(`${API_BASE_URL}/panel/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, text }),
    });
    return response.json();
  },

  async getMessages(phone: string, limit = 50) {
    const response = await fetch(`${API_BASE_URL}/panel/messages/${phone}?limit=${limit}`, {
      headers: { 'X-Api-Key': API_KEY || '' },
    });
    return response.json();
  },

  async getStatus(phone: string) {
    const response = await fetch(`${API_BASE_URL}/panel/status/${phone}`, {
      headers: { 'X-Api-Key': API_KEY || '' },
    });
    return response.json();
  },
};
```

### Componente: Lista de Conversaciones

```tsx
// components/ConversationsList.tsx
import { useState, useEffect } from 'react';
import { panelApi } from '../services/panelApi';
import type { Conversation } from '../types/panel';

interface Props {
  onSelectConversation: (phone: string) => void;
}

export function ConversationsList({ onSelectConversation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();

    // Actualizar cada 5 segundos
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadConversations() {
    try {
      const data = await panelApi.getConversations();
      if (data.success) {
        setConversations(data.data.conversations);
      }
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="conversations-list">
      <h2>Conversaciones Activas ({conversations.length})</h2>
      {conversations.map((conv) => (
        <div
          key={conv.phone}
          className="conversation-item"
          onClick={() => onSelectConversation(conv.phone)}
        >
          <div className="phone">{conv.phone}</div>
          <div className="last-message">
            {conv.lastMessage?.text || 'Sin mensajes'}
          </div>
          <div className="metadata">
            {conv.modoHumano && <span className="badge badge-human">En Control</span>}
            {conv.unreadCount > 0 && (
              <span className="badge badge-unread">{conv.unreadCount}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Componente: Chat en Tiempo Real

```tsx
// components/LiveChatPanel.tsx
import { useState, useEffect, useRef } from 'react';
import { panelApi } from '../services/panelApi';
import type { Message } from '../types/panel';

interface Props {
  phone: string;
}

export function LiveChatPanel({ phone }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [hasControl, setHasControl] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    checkControlStatus();

    // Polling cada 2 segundos
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [phone]);

  useEffect(() => {
    // Auto-scroll al último mensaje
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    try {
      const data = await panelApi.getMessages(phone);
      if (data.success) {
        setMessages(data.data.messages);
      }
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  }

  async function checkControlStatus() {
    try {
      const data = await panelApi.getStatus(phone);
      if (data.success) {
        setHasControl(data.data.modoHumano);
      }
    } catch (error) {
      console.error('Error verificando estado:', error);
    }
  }

  async function takeover() {
    setLoading(true);
    try {
      const data = await panelApi.takeover(phone);
      if (data.success) {
        setHasControl(true);
        alert('Control tomado exitosamente');
      }
    } catch (error) {
      console.error('Error tomando control:', error);
      alert('Error al tomar control');
    } finally {
      setLoading(false);
    }
  }

  async function release() {
    setLoading(true);
    try {
      const data = await panelApi.release(phone);
      if (data.success) {
        setHasControl(false);
        alert('Control liberado. El bot responderá automáticamente.');
      }
    } catch (error) {
      console.error('Error liberando control:', error);
      alert('Error al liberar control');
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const messageText = input.trim();
    setInput('');
    setLoading(true);

    try {
      const data = await panelApi.sendMessage(phone, messageText);

      if (data.success) {
        await loadMessages();
      } else {
        alert(data.error || 'Error al enviar mensaje');
        setInput(messageText); // Restaurar el mensaje
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error al enviar mensaje');
      setInput(messageText); // Restaurar el mensaje
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="live-chat-panel">
      <div className="chat-header">
        <h3>Chat con {phone}</h3>
        {hasControl ? (
          <button onClick={release} disabled={loading} className="btn-release">
            Liberar Control
          </button>
        ) : (
          <button onClick={takeover} disabled={loading} className="btn-takeover">
            Tomar Control
          </button>
        )}
      </div>

      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.origen}`}>
            <div className="message-text">{msg.text}</div>
            <div className="message-meta">
              <span className="origen">
                {msg.origen === 'cliente' ? 'Cliente' :
                 msg.origen === 'bot' ? 'Bot' : 'Operador'}
              </span>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {hasControl ? (
        <div className="message-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !loading && sendMessage()}
            placeholder="Escribe tu mensaje..."
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Enviar
          </button>
        </div>
      ) : (
        <div className="control-message">
          Debes tomar control para responder manualmente
        </div>
      )}
    </div>
  );
}
```

### CSS Sugerido

```css
/* styles/panel.css */
.conversations-list {
  padding: 20px;
}

.conversation-item {
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.conversation-item:hover {
  background-color: #f5f5f5;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: 10px;
}

.badge-human {
  background-color: #ff9800;
  color: white;
}

.badge-unread {
  background-color: #f44336;
  color: white;
}

.live-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #ddd;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f9f9f9;
}

.message {
  margin-bottom: 15px;
  padding: 10px 15px;
  border-radius: 8px;
  max-width: 70%;
}

.message-cliente {
  background-color: #e3f2fd;
  align-self: flex-start;
  margin-right: auto;
}

.message-bot {
  background-color: #f3e5f5;
  align-self: flex-end;
  margin-left: auto;
}

.message-operador {
  background-color: #c8e6c9;
  align-self: flex-end;
  margin-left: auto;
}

.message-meta {
  font-size: 11px;
  color: #666;
  margin-top: 5px;
}

.message-input {
  display: flex;
  padding: 15px;
  border-top: 1px solid #ddd;
  background-color: white;
}

.message-input input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-right: 10px;
}

.message-input button {
  padding: 10px 20px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.message-input button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.control-message {
  padding: 15px;
  text-align: center;
  background-color: #fff3cd;
  color: #856404;
  border-top: 1px solid #ddd;
}
```

## Casos de Uso Importantes

### 1. Flujo Normal de Uso

1. Operador entra a la página de chat
2. Ve lista de conversaciones activas
3. Hace clic en una conversación
4. Ve el historial de mensajes
5. Hace clic en "Tomar Control"
6. Ahora puede escribir y enviar mensajes
7. Cuando termina, hace clic en "Liberar Control"
8. El bot vuelve a responder automáticamente

### 2. Manejo de Errores

- Si intenta enviar mensaje sin tomar control → mostrar error "Debes tomar control primero"
- Si falla la API → mostrar mensaje de error y reintentar
- Si pierde conexión → mostrar indicador de "Sin conexión"

### 3. Notificaciones (Opcional pero Recomendado)

Cuando llegue un nuevo mensaje no leído, mostrar:
- Notificación del navegador (si el usuario dio permiso)
- Badge en el ícono de la página
- Sonido de notificación (opcional)

## Testing

Para probar el backend localmente:

1. **Levantar el backend:**
   ```bash
   cd Chatbot
   pnpm dev
   ```

2. **Probar endpoint manualmente:**
   ```bash
   curl -H "X-Api-Key: your-key" http://localhost:3008/panel/conversations
   ```

3. **Verificar que devuelve datos** (aunque esté vacío está OK si no hay conversaciones)

## Preguntas Frecuentes

**Q: ¿Qué pasa si dos operadores toman control simultáneamente?**
A: El último en llamar `/panel/takeover` se queda con el control. El backend no tiene bloqueo de concurrencia por ahora.

**Q: ¿Los mensajes se pierden si no hay control?**
A: No, todos los mensajes del cliente se guardan siempre en Firestore, independientemente del modo.

**Q: ¿Cuál es el mejor intervalo de polling?**
A: Recomendamos 2 segundos para mensajes y 5 segundos para la lista de conversaciones.

**Q: ¿Hay límite de mensajes?**
A: Por defecto se retornan los últimos 50 mensajes, pero puedes cambiar el parámetro `?limit=100`.

## Entregables Esperados

1. Página/ruta nueva en el frontend (ej: `/chat` o `/panel`)
2. Componente de lista de conversaciones
3. Componente de chat individual con control manual
4. Servicio API configurado con axios/fetch
5. Tipos TypeScript (si aplica)
6. Estilos CSS básicos que sigan el design system del proyecto

## Documentación Adicional

Si necesitan más detalles técnicos, consulten:
- `API_FRONTEND.md` - Documentación completa de API
- `PANEL_INTEGRATION_GUIDE.md` - Guía técnica detallada
- `CLAUDE.md` - Arquitectura general del proyecto

---

**Cualquier duda, pregunten! El backend está 100% funcional y listo para integrarse.**
