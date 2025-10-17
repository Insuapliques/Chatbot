# Guía de Integración - Panel de Control en Tiempo Real

Esta guía documenta cómo integrar el sistema de control manual de conversaciones desde el frontend.

## Resumen

Se han implementado endpoints REST que permiten a los operadores humanos:

1. Ver todas las conversaciones activas
2. Tomar control de cualquier conversación (activa "modo humano")
3. Responder manualmente a los clientes
4. Liberar el control y devolver la conversación al bot

## Arquitectura del Sistema

### Flujo de Funcionamiento

```
Cliente WhatsApp
    ↓
Bot (Automático) → [Operador toma control] → Operador Humano
                                                    ↓
                                         [Operador libera] → Bot (Automático)
```

### Estados de Control

- **Bot Activo** (`modoHumano: false`): El bot responde automáticamente
- **Operador Activo** (`modoHumano: true`): Solo el operador puede responder

## Endpoints Disponibles

### Base URL
```
http://localhost:3008  (desarrollo)
https://tu-dominio.com (producción)
```

### Autenticación
Todos los endpoints requieren header:
```
X-Api-Key: your-api-key
```

### 1. Listar Conversaciones Activas

**GET** `/panel/conversations?limit=50`

Retorna todas las conversaciones de las últimas 24 horas con:
- Último mensaje
- Estado actual
- Si tiene modo humano activo
- Contador de mensajes no leídos

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
          "text": "Hola, quiero información",
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

### 2. Tomar Control de una Conversación

**POST** `/panel/takeover/:phone`

Activa el modo humano. Desde este momento:
- El bot deja de responder automáticamente
- Solo los operadores pueden enviar mensajes
- Los mensajes del cliente siguen guardándose en Firestore

**Respuesta:**
```json
{
  "success": true,
  "message": "Control tomado exitosamente",
  "phone": "51987654321",
  "modoHumano": true
}
```

### 3. Enviar Mensaje como Operador

**POST** `/panel/send`

**Importante:** Solo funciona si previamente se tomó control con `/panel/takeover/:phone`

**Request:**
```json
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

**Respuesta si no hay control:**
```json
{
  "success": false,
  "error": "Debes tomar control de la conversación primero"
}
```
**HTTP Status:** 403 Forbidden

### 4. Liberar Control

**POST** `/panel/release/:phone`

Desactiva el modo humano y devuelve el control al bot.

**Respuesta:**
```json
{
  "success": true,
  "message": "Control liberado exitosamente",
  "phone": "51987654321",
  "modoHumano": false
}
```

### 5. Obtener Mensajes de una Conversación

**GET** `/panel/messages/:phone?limit=50`

Retorna el historial completo de mensajes (ordenados cronológicamente).

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

**Tipos de origen:**
- `cliente`: Mensaje del usuario final
- `bot`: Respuesta automática del bot
- `operador`: Mensaje enviado por un humano

### 6. Verificar Estado de Conversación

**GET** `/panel/status/:phone`

Consulta si una conversación tiene modo humano activo.

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

## Ejemplo de Implementación React

### Componente de Lista de Conversaciones

```tsx
import { useState, useEffect } from 'react';

interface Conversation {
  phone: string;
  modoHumano: boolean;
  lastMessage: {
    text: string;
    origen: string;
    timestamp: string;
  };
  unreadCount: number;
}

function ConversationsList() {
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
      const response = await fetch('http://localhost:3008/panel/conversations', {
        headers: { 'X-Api-Key': process.env.REACT_APP_API_KEY || '' },
      });
      const data = await response.json();
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
      <h2>Conversaciones Activas</h2>
      {conversations.map((conv) => (
        <div key={conv.phone} className="conversation-item">
          <div className="phone">{conv.phone}</div>
          <div className="last-message">{conv.lastMessage?.text}</div>
          {conv.modoHumano && <span className="badge">En Control</span>}
          {conv.unreadCount > 0 && (
            <span className="unread-badge">{conv.unreadCount}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Componente de Chat en Tiempo Real

```tsx
import { useState, useEffect } from 'react';

interface Message {
  id: string;
  text: string;
  origen: 'cliente' | 'bot' | 'operador';
  timestamp: string;
}

function LiveChatPanel({ phone }: { phone: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [hasControl, setHasControl] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMessages();
    checkControlStatus();

    // Polling cada 2 segundos para nuevos mensajes
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [phone]);

  async function loadMessages() {
    try {
      const response = await fetch(
        `http://localhost:3008/panel/messages/${phone}?limit=50`,
        {
          headers: { 'X-Api-Key': process.env.REACT_APP_API_KEY || '' },
        }
      );
      const data = await response.json();
      if (data.success) {
        setMessages(data.data.messages);
      }
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  }

  async function checkControlStatus() {
    try {
      const response = await fetch(
        `http://localhost:3008/panel/status/${phone}`,
        {
          headers: { 'X-Api-Key': process.env.REACT_APP_API_KEY || '' },
        }
      );
      const data = await response.json();
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
      const response = await fetch(
        `http://localhost:3008/panel/takeover/${phone}`,
        {
          method: 'POST',
          headers: { 'X-Api-Key': process.env.REACT_APP_API_KEY || '' },
        }
      );
      const data = await response.json();
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
      const response = await fetch(
        `http://localhost:3008/panel/release/${phone}`,
        {
          method: 'POST',
          headers: { 'X-Api-Key': process.env.REACT_APP_API_KEY || '' },
        }
      );
      const data = await response.json();
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
      const response = await fetch('http://localhost:3008/panel/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.REACT_APP_API_KEY || '',
        },
        body: JSON.stringify({ phone, text: messageText }),
      });

      const data = await response.json();

      if (data.success) {
        // Recargar mensajes
        await loadMessages();
      } else {
        alert(data.error || 'Error al enviar mensaje');
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error al enviar mensaje');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="live-chat-panel">
      <div className="chat-header">
        <h3>Chat con {phone}</h3>
        {hasControl ? (
          <button onClick={release} disabled={loading}>
            Liberar Control
          </button>
        ) : (
          <button onClick={takeover} disabled={loading}>
            Tomar Control
          </button>
        )}
      </div>

      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.origen}`}>
            <div className="message-text">{msg.text}</div>
            <div className="message-meta">
              <span className="origen">{msg.origen}</span>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {hasControl && (
        <div className="message-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe tu mensaje..."
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Enviar
          </button>
        </div>
      )}

      {!hasControl && (
        <div className="control-message">
          Debes tomar control para responder manualmente
        </div>
      )}
    </div>
  );
}

export default LiveChatPanel;
```

## Flujo de Trabajo Recomendado

### 1. Vista Principal (Dashboard)

```tsx
function Dashboard() {
  return (
    <div>
      <ConversationsList onSelectConversation={(phone) => {
        // Navegar a la vista de chat
        navigate(`/chat/${phone}`);
      }} />
    </div>
  );
}
```

### 2. Vista de Chat Individual

```tsx
function ChatPage() {
  const { phone } = useParams();

  return (
    <LiveChatPanel phone={phone} />
  );
}
```

## Consideraciones Importantes

### 1. Polling vs WebSockets

Por ahora se recomienda usar **polling** (solicitudes periódicas):
```tsx
useEffect(() => {
  const interval = setInterval(loadMessages, 2000);
  return () => clearInterval(interval);
}, []);
```

Para una solución más eficiente en el futuro, considerar implementar WebSockets.

### 2. Manejo de Errores

Siempre verificar el código de estado HTTP:
- **200**: Éxito
- **400**: Datos inválidos
- **401**: API key incorrecta
- **403**: Operación no permitida (intentar enviar mensaje sin control)
- **500**: Error del servidor

### 3. Notificaciones en Tiempo Real

Sugerencia: Usar notificaciones del navegador cuando lleguen mensajes nuevos:

```tsx
function useNotifications(conversations: Conversation[]) {
  useEffect(() => {
    const hasUnread = conversations.some(c => c.unreadCount > 0);

    if (hasUnread && Notification.permission === 'granted') {
      new Notification('Nuevos mensajes en el chat');
    }
  }, [conversations]);
}
```

### 4. Sincronización de Estado

Si múltiples operadores están conectados, implementar lógica para:
- Mostrar quién tiene el control actualmente
- Prevenir que dos operadores tomen control simultáneamente
- Notificar cuando otro operador toma/libera control

### 5. Persistencia del Estado

Guardar en localStorage qué conversaciones está monitoreando el operador:

```tsx
localStorage.setItem('activeConversations', JSON.stringify([phone1, phone2]));
```

## Variables de Entorno Frontend

```env
# .env
REACT_APP_API_BASE_URL=http://localhost:3008
REACT_APP_API_KEY=your-api-key-here
```

O para Vite:

```env
# .env
VITE_API_BASE_URL=http://localhost:3008
VITE_API_KEY=your-api-key-here
```

## Testing

### Prueba Manual del Flujo Completo

1. **Listar conversaciones:**
   ```bash
   curl -H "X-Api-Key: your-key" http://localhost:3008/panel/conversations
   ```

2. **Tomar control:**
   ```bash
   curl -X POST -H "X-Api-Key: your-key" \
     http://localhost:3008/panel/takeover/51987654321
   ```

3. **Enviar mensaje:**
   ```bash
   curl -X POST -H "Content-Type: application/json" -H "X-Api-Key: your-key" \
     -d '{"phone":"51987654321","text":"Hola desde el panel"}' \
     http://localhost:3008/panel/send
   ```

4. **Liberar control:**
   ```bash
   curl -X POST -H "X-Api-Key: your-key" \
     http://localhost:3008/panel/release/51987654321
   ```

## Documentación Completa

Para más detalles, consulta:
- [API_FRONTEND.md](API_FRONTEND.md) - Documentación completa de todos los endpoints
- [CLAUDE.md](CLAUDE.md) - Arquitectura general del proyecto

## Soporte

Para preguntas o problemas, contacta al equipo de backend o revisa los logs en Firestore:
- Colección `logs/humanTakeover/entries` - Registro de tomas/liberaciones de control
- Colección `liveChat` - Historial completo de mensajes
- Colección `liveChatStates` - Estado actual de cada conversación
