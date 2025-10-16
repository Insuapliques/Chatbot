import express from 'express';
import { z } from 'zod';
import { executeAgent, simpleAgentCall } from '../src/services/agentService.js';
import { db } from '../src/firebaseConfig.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const router = express.Router();

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

const simpleAgentCallSchema = z.object({
  phone: z.string().min(1, 'El teléfono es obligatorio'),
  message: z.string().min(1, 'El mensaje es obligatorio'),
});

const agentCallWithHistorySchema = z.object({
  phone: z.string().min(1, 'El teléfono es obligatorio'),
  message: z.string().min(1, 'El mensaje es obligatorio'),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string(),
    })
  ).optional(),
});

const updatePromptSchema = z.object({
  entrenamiento_base: z.string().min(10, 'El prompt debe tener al menos 10 caracteres'),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatZodErrors = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /api/agent/chat
 * Endpoint simple para chat con el agente (sin historial)
 */
router.post('/chat', async (req, res) => {
  try {
    const validation = simpleAgentCallSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Cuerpo de la petición inválido',
        details: formatZodErrors(validation.error),
      });
      return;
    }

    const { phone, message } = validation.data;

    // Log de inicio
    console.log(`[agentRoutes] POST /api/agent/chat - Phone: ${phone}, Message: "${message.substring(0, 50)}..."`);

    const startTime = Date.now();
    const response = await simpleAgentCall(phone, message);
    const latency = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        response,
        latency,
        phone,
      },
    });

    console.log(`[agentRoutes] Response sent in ${latency}ms`);
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/chat:', error);
    res.status(500).json({
      error: 'Error al procesar la solicitud del agente',
      details: error?.message || String(error),
    });
  }
});

/**
 * POST /api/agent/chat-advanced
 * Endpoint avanzado con historial de conversación y detalles de herramientas
 */
router.post('/chat-advanced', async (req, res) => {
  try {
    const validation = agentCallWithHistorySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Cuerpo de la petición inválido',
        details: formatZodErrors(validation.error),
      });
      return;
    }

    const { phone, message, conversationHistory } = validation.data;

    console.log(`[agentRoutes] POST /api/agent/chat-advanced - Phone: ${phone}, History: ${conversationHistory?.length || 0} messages`);

    const response = await executeAgent({
      phone,
      userMessage: message,
      conversationHistory: conversationHistory as ChatCompletionMessageParam[] | undefined,
    });

    res.json({
      success: true,
      data: {
        text: response.text,
        toolCalls: response.toolCalls,
        latencyMs: response.latencyMs,
        usedFallback: response.usedFallback,
        error: response.error,
        phone,
      },
    });

    console.log(`[agentRoutes] Advanced response sent. Tools used: ${response.toolCalls.length}, Latency: ${response.latencyMs}ms`);
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/chat-advanced:', error);
    res.status(500).json({
      error: 'Error al procesar la solicitud del agente',
      details: error?.message || String(error),
    });
  }
});

/**
 * GET /api/agent/prompt
 * Obtiene el prompt actual desde Firestore
 */
router.get('/prompt', async (_req, res) => {
  try {
    const promptPath = process.env.FIRESTORE_PROMPT_DOC_PATH ?? 'settings/prompts';
    const docSnap = await db.doc(promptPath).get();

    if (!docSnap.exists) {
      res.status(404).json({
        error: 'Documento de prompt no encontrado',
        path: promptPath,
      });
      return;
    }

    const data = docSnap.data();

    res.json({
      success: true,
      data: {
        entrenamiento_base: data?.entrenamiento_base || '',
        temperatura: data?.temperatura || data?.temperature || 0.7,
        max_tokens: data?.max_tokens || 2048,
        palabra_cierre: data?.palabra_cierre || data?.closingWords?.join(', ') || '',
        path: promptPath,
      },
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/prompt:', error);
    res.status(500).json({
      error: 'Error al obtener el prompt',
      details: error?.message || String(error),
    });
  }
});

/**
 * PUT /api/agent/prompt
 * Actualiza el prompt del agente en Firestore
 */
router.put('/prompt', async (req, res) => {
  try {
    const validation = updatePromptSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Cuerpo de la petición inválido',
        details: formatZodErrors(validation.error),
      });
      return;
    }

    const { entrenamiento_base } = validation.data;
    const promptPath = process.env.FIRESTORE_PROMPT_DOC_PATH ?? 'settings/prompts';

    await db.doc(promptPath).set(
      {
        entrenamiento_base,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log(`[agentRoutes] Prompt actualizado en ${promptPath}`);

    res.json({
      success: true,
      message: 'Prompt actualizado exitosamente',
      path: promptPath,
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/prompt (PUT):', error);
    res.status(500).json({
      error: 'Error al actualizar el prompt',
      details: error?.message || String(error),
    });
  }
});

/**
 * GET /api/agent/tools
 * Lista todas las herramientas disponibles del agente
 */
router.get('/tools', async (_req, res) => {
  try {
    const tools = [
      {
        name: 'buscarProductoFirestore',
        description: 'Busca productos en la base de datos de Firestore',
        parameters: {
          keyword: 'string - Palabra clave del producto',
        },
        example: {
          keyword: 'chompas',
        },
      },
      {
        name: 'enviarCatalogo',
        description: 'Envía un catálogo PDF, imagen o video al usuario',
        parameters: {
          tipo: 'string - Tipo de producto del catálogo',
        },
        example: {
          tipo: 'polos',
        },
      },
      {
        name: 'transferirAAsesor',
        description: 'Transfiere la conversación a un asesor humano',
        parameters: {
          motivo: 'string - Motivo de la transferencia',
        },
        example: {
          motivo: 'consulta compleja',
        },
      },
    ];

    res.json({
      success: true,
      data: {
        tools,
        totalTools: tools.length,
        note: 'El agente consulta precios directamente desde la lista de precios en Excel (archivo_entrenamiento). No necesita herramienta calcularPrecio.',
      },
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/tools:', error);
    res.status(500).json({
      error: 'Error al obtener herramientas',
      details: error?.message || String(error),
    });
  }
});

/**
 * GET /api/agent/history/:phone
 * Obtiene el historial de conversación de un usuario desde liveChat
 */
router.get('/history/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = Number(req.query.limit) || 20;

    if (!phone) {
      res.status(400).json({ error: 'Teléfono es obligatorio' });
      return;
    }

    const snapshot = await db
      .collection('liveChat')
      .where('user', '==', phone)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const messages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text,
        origen: data.origen,
        timestamp: data.timestamp,
        fileUrl: data.fileUrl || null,
        fileType: data.fileType || null,
      };
    });

    // Reverse para tener orden cronológico ascendente
    messages.reverse();

    res.json({
      success: true,
      data: {
        phone,
        messages,
        count: messages.length,
      },
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/history:', error);
    res.status(500).json({
      error: 'Error al obtener historial',
      details: error?.message || String(error),
    });
  }
});

/**
 * GET /api/agent/state/:phone
 * Obtiene el estado actual de la conversación de un usuario
 */
router.get('/state/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({ error: 'Teléfono es obligatorio' });
      return;
    }

    const stateSnap = await db.collection('liveChatStates').doc(phone).get();

    if (!stateSnap.exists) {
      res.json({
        success: true,
        data: {
          phone,
          exists: false,
          state: null,
        },
      });
      return;
    }

    const stateData = stateSnap.data();

    res.json({
      success: true,
      data: {
        phone,
        exists: true,
        state: stateData,
      },
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/state:', error);
    res.status(500).json({
      error: 'Error al obtener estado',
      details: error?.message || String(error),
    });
  }
});

/**
 * DELETE /api/agent/state/:phone
 * Reinicia el estado de conversación de un usuario
 */
router.delete('/state/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({ error: 'Teléfono es obligatorio' });
      return;
    }

    await db.collection('liveChatStates').doc(phone).delete();

    console.log(`[agentRoutes] Estado eliminado para ${phone}`);

    res.json({
      success: true,
      message: 'Estado de conversación reiniciado',
      phone,
    });
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/state (DELETE):', error);
    res.status(500).json({
      error: 'Error al reiniciar estado',
      details: error?.message || String(error),
    });
  }
});

/**
 * GET /api/agent/health
 * Verifica el estado del agente y sus dependencias
 */
router.get('/health', async (_req, res) => {
  try {
    const promptPath = process.env.FIRESTORE_PROMPT_DOC_PATH ?? 'settings/prompts';
    const promptDoc = await db.doc(promptPath).get();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        openai: {
          configured: !!process.env.OPENAI_API_KEY,
          model: process.env.LLM_MODEL || 'gpt-4o',
        },
        firestore: {
          connected: true,
          promptDocExists: promptDoc.exists,
          promptPath,
        },
        tools: {
          available: 3,
          names: ['buscarProductoFirestore', 'enviarCatalogo', 'transferirAAsesor'],
        },
        priceList: {
          enabled: true,
          source: 'settings/archivo_entrenamiento (Excel)',
        },
      },
    };

    res.json(health);
  } catch (error: any) {
    console.error('[agentRoutes] Error en /api/agent/health:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error?.message || String(error),
    });
  }
});

export default router;
