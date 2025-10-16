import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { CoreClass } from '@builderbot/bot';
import { db } from '../firebaseConfig.js';
import { FieldValue } from 'firebase-admin/firestore';
import { findProductoByMessage } from './productos.service.js';
import { loadPriceListForAI } from './priceListLoader.js';

// Global bot instance reference for catalog sending
let agentBotInstance: CoreClass | null = null;

export function setAgentBot(bot: CoreClass): void {
  agentBotInstance = bot;
}

// ============================================================================
// TYPES
// ============================================================================

export interface AgentContext {
  phone: string;
  userMessage: string;
  conversationHistory?: ChatCompletionMessageParam[];
}

export interface AgentResponse {
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'gpt-4o';
const DEFAULT_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS ?? 60_000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);
const FIRESTORE_PROMPT_PATH = process.env.FIRESTORE_PROMPT_DOC_PATH ?? 'settings/prompts';
const CONVERSATION_HISTORY_LIMIT = Number(process.env.CONVERSATION_HISTORY_LIMIT ?? 10);

let openAiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurada.');
  }
  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey });
  }
  return openAiClient;
}

// ============================================================================
// PROMPT LOADING FROM FIRESTORE
// ============================================================================

async function loadAgentInstructions(): Promise<string> {
  try {
    const docSnap = await db.doc(FIRESTORE_PROMPT_PATH).get();

    if (!docSnap.exists) {
      console.warn(`[agentService] Documento ${FIRESTORE_PROMPT_PATH} no encontrado. Usando prompt por defecto.`);
      return getDefaultInstructions();
    }

    const data = docSnap.data();
    const instructions = data?.entrenamiento_base;

    if (typeof instructions === 'string' && instructions.trim().length > 0) {
      console.log('[agentService] ✅ Instrucciones cargadas desde Firestore:', {
        path: FIRESTORE_PROMPT_PATH,
        length: instructions.length,
        preview: instructions.substring(0, 150) + '...',
      });
      return instructions;
    }

    console.warn('[agentService] Campo entrenamiento_base vacío. Usando prompt por defecto.');
    return getDefaultInstructions();
  } catch (error) {
    console.error('[agentService] Error al cargar instrucciones desde Firestore:', error);
    return getDefaultInstructions();
  }
}

function getDefaultInstructions(): string {
  return `Eres un asistente virtual experto de Mimétisa, empresa especializada en textiles y productos personalizados.

Tu objetivo es ayudar a los clientes a:
- Encontrar productos en el catálogo
- Recibir información sobre precios y cantidades (consulta la lista de precios que se te proporciona)
- Solicitar asesoría personalizada
- Conectarse con un asesor humano cuando sea necesario

Responde de forma breve, clara, empática y profesional.

Tienes acceso a las siguientes herramientas:
1. buscarProductoFirestore - para buscar productos en la base de datos
2. enviarCatalogo - para enviar catálogos PDF/imágenes de productos
3. transferirAAsesor - para transferir la conversación a un humano

IMPORTANTE: Para consultar precios, usa directamente la LISTA DE PRECIOS que se te proporciona en el contexto.
NO inventes precios. Si un producto no está en la lista, informa al cliente y ofrece conectarlo con un asesor.

Usa estas herramientas de forma inteligente según la intención del usuario.`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscarProductoFirestore',
      description: 'Busca productos en la base de datos de Firestore usando palabras clave del mensaje del usuario. Útil cuando el usuario pregunta por un producto específico.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Palabra clave o frase del producto a buscar (ej: "chompas", "joggers", "polos")',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enviarCatalogo',
      description: 'Envía un catálogo PDF, imagen o video del tipo de producto solicitado al usuario. Usa esta herramienta cuando el usuario pide ver catálogos, listas de productos o quiere ver opciones visuales.',
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            description: 'Tipo de producto del catálogo (ej: "chompas", "joggers", "polos", "gorras", "casacas")',
          },
        },
        required: ['tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferirAAsesor',
      description: 'Activa el modo humano para transferir la conversación a un asesor real. Usa esta herramienta cuando el usuario solicita hablar con una persona, tiene una consulta compleja, o el bot no puede ayudar adecuadamente.',
      parameters: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo de la transferencia (ej: "solicitud del cliente", "consulta compleja", "problema no resuelto")',
          },
        },
        required: ['motivo'],
      },
    },
  },
];

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function buscarProductoFirestore(keyword: string): Promise<object> {
  try {
    console.log(`[agentService] 🔍 Buscando producto con keyword: "${keyword}"`);

    const producto = await findProductoByMessage(keyword);

    if (!producto) {
      return {
        success: false,
        message: `No se encontró ningún producto relacionado con "${keyword}"`,
      };
    }

    return {
      success: true,
      producto: {
        keyword: producto.keyword,
        tipo: producto.tipo,
        respuesta: producto.respuesta,
        url: producto.url,
      },
      message: `Producto encontrado: ${producto.keyword}`,
    };
  } catch (error) {
    console.error('[agentService] Error en buscarProductoFirestore:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

async function enviarCatalogo(tipo: string, phone: string): Promise<object> {
  try {
    console.log(`[agentService] 📄 Enviando catálogo de tipo: "${tipo}" a ${phone}`);

    if (!agentBotInstance || !agentBotInstance.provider) {
      console.error('[agentService] Bot instance or provider not available');
      return {
        success: false,
        error: 'Provider not initialized',
      };
    }

    const provider = agentBotInstance.provider;

    // Search for product by keyword
    const producto = await findProductoByMessage(`catalogo ${tipo}`);

    if (!producto) {
      return {
        success: false,
        message: `No se encontró un catálogo para "${tipo}". Tipos disponibles: chompas, joggers, polos, gorras, casacas.`,
      };
    }

    // Prepare caption and fallback
    const caption = producto.respuesta?.trim()?.length ? producto.respuesta : `Aquí tienes el catálogo de ${tipo}.`;
    let fallbackText = caption;
    if (producto.url) {
      fallbackText = `${caption}\n${producto.url}`.trim();
    }

    let fileUrl: string | null = null;
    let fileType: string = 'text';
    let loggedText = caption;

    // Send via appropriate method based on product type
    try {
      if (producto.tipo === 'pdf' && producto.url) {
        await provider.sendMessageMeta({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'document',
          document: {
            link: producto.url,
            caption,
          },
        });
        fileUrl = producto.url;
        fileType = 'document';
        loggedText = caption;
      } else if (producto.tipo === 'image' && producto.url) {
        await provider.sendMessageMeta({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'image',
          image: {
            link: producto.url,
            caption,
          },
        });
        fileUrl = producto.url;
        fileType = 'image';
        loggedText = caption;
      } else if (producto.tipo === 'video' && producto.url) {
        await provider.sendMessageMeta({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'video',
          video: {
            link: producto.url,
            caption,
          },
        });
        fileUrl = producto.url;
        fileType = 'video';
        loggedText = caption;
      } else if (producto.tipo === 'url' && producto.url) {
        const outbound = `${caption}\n${producto.url}`.trim();
        await provider.sendMessage(phone, outbound, {});
        fileUrl = producto.url;
        fileType = 'text';
        loggedText = outbound;
      } else {
        await provider.sendMessage(phone, fallbackText, {});
        fileType = 'text';
        fileUrl = producto.url ?? null;
        loggedText = fallbackText;
      }
    } catch (sendError) {
      console.error('[agentService] Media send failed, falling back to text:', sendError);

      // Fallback to text
      await provider.sendMessage(phone, fallbackText, {});
      fileType = 'text';
      fileUrl = producto.url ?? null;
      loggedText = fallbackText;
    }

    // Log to liveChat
    await db.collection('liveChat').add({
      user: phone,
      text: loggedText,
      fileUrl,
      fileType,
      timestamp: FieldValue.serverTimestamp(),
      origen: 'bot',
    });

    // Update state
    const stateRef = db.collection('liveChatStates').doc(phone);
    await stateRef.set({
      catalogoEnviado: true,
      has_sent_catalog: true,
      catalogoRef: producto.keyword,
      catalogoTimestamp: FieldValue.serverTimestamp(),
      catalogoIntentos: 0,
      estadoActual: 'CATALOGO_ENVIADO',
      state: 'CATALOG_SENT',
      ultimoIntent: 'catalogo',
      last_intent: 'catalogo',
      productoActual: producto.keyword,
      ultimoCambio: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Log catalog sent
    await db.collection('logs').doc('catalogSent').collection('entries').add({
      phone,
      catalogRef: producto.keyword,
      source: 'agentService',
      at: FieldValue.serverTimestamp(),
    });

    console.log(`[agentService] ✅ Catálogo "${producto.keyword}" enviado exitosamente`);

    return {
      success: true,
      message: `Catálogo de ${tipo} enviado exitosamente`,
      catalogRef: producto.keyword,
    };
  } catch (error) {
    console.error('[agentService] Error en enviarCatalogo:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

async function transferirAAsesor(phone: string, motivo: string): Promise<object> {
  try {
    console.log(`[agentService] 👤 Transfiriendo a asesor. Motivo: "${motivo}"`);

    const stateRef = db.collection('liveChatStates').doc(phone);

    // Activar modo humano
    await stateRef.set({
      modoHumano: true,
      estadoActual: 'TRANSFERIDO',
      state: 'HUMAN_HANDOFF',
      motivoTransferencia: motivo,
      timestampTransferencia: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Registrar en liveChat
    await db.collection('liveChat').add({
      user: phone,
      text: `🤖➡️👤 Conversación transferida a asesor humano. Motivo: ${motivo}`,
      fileUrl: null,
      fileType: 'text',
      timestamp: FieldValue.serverTimestamp(),
      origen: 'bot',
      metadata: { transferencia: true, motivo },
    });

    console.log(`[agentService] ✅ Usuario ${phone} transferido exitosamente`);

    return {
      success: true,
      message: 'Transferencia a asesor humano completada',
      motivo,
    };
  } catch (error) {
    console.error('[agentService] Error en transferirAAsesor:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}


// ============================================================================
// TOOL EXECUTION DISPATCHER
// ============================================================================

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  phone: string,
): Promise<unknown> {
  switch (toolName) {
    case 'buscarProductoFirestore':
      return buscarProductoFirestore(args.keyword as string);

    case 'enviarCatalogo':
      return enviarCatalogo(args.tipo as string, phone);

    case 'transferirAAsesor':
      return transferirAAsesor(phone, args.motivo as string);

    default:
      throw new Error(`Herramienta desconocida: ${toolName}`);
  }
}

// ============================================================================
// CONVERSATION HISTORY LOADING
// ============================================================================

async function loadConversationHistory(phone: string, limit: number): Promise<ChatCompletionMessageParam[]> {
  try {
    const snapshot = await db
      .collection('liveChat')
      .where('user', '==', phone)
      .orderBy('timestamp', 'desc')
      .limit(Math.max(1, limit))
      .get();

    if (!snapshot || snapshot.empty) {
      return [];
    }

    // Convert to OpenAI format and reverse for chronological order
    const messages: ChatCompletionMessageParam[] = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const text = data.text || '';
        const origen = data.origen || 'cliente';

        if (!text.trim()) {
          return null;
        }

        // Map origen to OpenAI roles
        const role: 'user' | 'assistant' = origen === 'cliente' ? 'user' : 'assistant';

        return {
          role,
          content: text,
        } as ChatCompletionMessageParam;
      })
      .filter((msg): msg is ChatCompletionMessageParam => msg !== null)
      .reverse(); // Chronological order (oldest first)

    console.log('[agentService] 💬 Historial conversacional cargado:', {
      phone,
      messageCount: messages.length,
      preview: messages.slice(-3).map((m) => `${m.role}: ${m.content?.toString().substring(0, 50)}...`),
    });

    return messages;
  } catch (error) {
    console.warn(`[agentService] No fue posible cargar historial de conversación para ${phone}:`, error);
    return [];
  }
}

// ============================================================================
// MAIN AGENT EXECUTION
// ============================================================================

export async function executeAgent(context: AgentContext): Promise<AgentResponse> {
  const start = Date.now();
  const toolCallResults: ToolCallResult[] = [];
  let usedFallback = false;
  let finalText = '';
  let lastError: Error | undefined;

  try {
    // Load agent instructions from Firestore
    const instructions = await loadAgentInstructions();

    // Load price list from Excel file in Firebase Storage
    const priceListContext = await loadPriceListForAI();

    // Load conversation history automatically if not provided
    let conversationHistory = context.conversationHistory;
    if (!conversationHistory || conversationHistory.length === 0) {
      conversationHistory = await loadConversationHistory(context.phone, CONVERSATION_HISTORY_LIMIT);
    }

    // Build conversation messages with price list context
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: instructions,
      },
    ];

    // Add price list context as a separate system message
    if (priceListContext) {
      messages.push({
        role: 'system',
        content: priceListContext,
      });
      console.log('[agentService] 💰 Lista de precios cargada y agregada al contexto');
    }

    // Add conversation history and current message
    messages.push(...conversationHistory);
    messages.push({
      role: 'user',
      content: context.userMessage,
    });

    const client = getOpenAI();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      // First API call with tool definitions
      let response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages,
        tools,
        tool_choice: 'auto', // Let model decide when to use tools
      }, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let responseMessage = response.choices[0]?.message;

      // Handle tool calls if present
      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`[agentService] 🛠️ Model requested ${responseMessage.tool_calls.length} tool call(s)`);

        // Add assistant message with tool calls to conversation
        messages.push(responseMessage);

        // Execute each tool call
        for (const toolCall of responseMessage.tool_calls) {
          // Type guard: only process function tool calls
          if (toolCall.type !== 'function') {
            continue;
          }

          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`[agentService] Executing tool: ${toolName}`, toolArgs);

          let toolResult: unknown;
          let success = true;

          try {
            toolResult = await executeTool(toolName, toolArgs, context.phone);
          } catch (toolError) {
            console.error(`[agentService] Tool execution failed: ${toolName}`, toolError);
            toolResult = {
              success: false,
              error: toolError instanceof Error ? toolError.message : 'Error desconocido',
            };
            success = false;
          }

          toolCallResults.push({
            toolName,
            arguments: toolArgs,
            result: toolResult,
            success,
          });

          // Add tool response to conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // Second API call to get final response after tool execution
        const finalResponse = await client.chat.completions.create({
          model: DEFAULT_MODEL,
          messages,
        });

        finalText = finalResponse.choices[0]?.message?.content?.trim() ?? '';
      } else {
        // No tools needed, use direct response
        finalText = responseMessage?.content?.trim() ?? '';
      }

      console.log('[agentService] ✅ Agent execution completed:', {
        toolCallsExecuted: toolCallResults.length,
        responseLength: finalText.length,
        latencyMs: Date.now() - start,
      });

      return {
        text: finalText,
        toolCalls: toolCallResults,
        latencyMs: Date.now() - start,
        usedFallback: false,
      };

    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

  } catch (error) {
    lastError = error instanceof Error ? error : new Error('Error desconocido');
    console.error('[agentService] ❌ Agent execution failed:', lastError);

    // FALLBACK: Return friendly error message
    const fallbackMessage =
      'Lo siento, hubo un problema al procesar tu solicitud. ¿Te gustaría que te conecte con un asesor humano?';

    return {
      text: fallbackMessage,
      toolCalls: toolCallResults,
      latencyMs: Date.now() - start,
      usedFallback: true,
      error: lastError.message,
    };
  }
}

// ============================================================================
// UTILITY: Simple text-based agent call (without history)
// ============================================================================

export async function simpleAgentCall(phone: string, userMessage: string): Promise<string> {
  const response = await executeAgent({
    phone,
    userMessage,
  });

  return response.text;
}
