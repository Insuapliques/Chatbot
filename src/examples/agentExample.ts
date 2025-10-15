/**
 * EJEMPLO DE USO DEL AGENTE DE OPENAI
 *
 * Este archivo muestra diferentes formas de usar el agente con herramientas.
 * Puedes ejecutarlo con: tsx src/examples/agentExample.ts
 */

import { executeAgent, simpleAgentCall } from '../services/agentService.js';

// ============================================================================
// EJEMPLO 1: Llamada simple (sin historial de conversación)
// ============================================================================

async function ejemplo1_llamadaSimple() {
  console.log('\n=== EJEMPLO 1: Llamada Simple ===\n');

  const phone = '51987654321';
  const userMessage = '¿Tienen chompas disponibles?';

  try {
    const respuesta = await simpleAgentCall(phone, userMessage);
    console.log('Usuario:', userMessage);
    console.log('Bot:', respuesta);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EJEMPLO 2: Llamada con contexto completo (incluye herramientas ejecutadas)
// ============================================================================

async function ejemplo2_llamadaCompleta() {
  console.log('\n=== EJEMPLO 2: Llamada Completa con Información de Herramientas ===\n');

  const phone = '51987654321';
  const userMessage = 'Quiero ver el catálogo de chompas';

  try {
    const response = await executeAgent({
      phone,
      userMessage,
    });

    console.log('Usuario:', userMessage);
    console.log('Bot:', response.text);
    console.log('\n--- Detalles de ejecución ---');
    console.log('Tiempo de respuesta:', response.latencyMs, 'ms');
    console.log('Herramientas usadas:', response.toolCalls.length);

    response.toolCalls.forEach((toolCall, index) => {
      console.log(`\nHerramienta ${index + 1}:`, toolCall.toolName);
      console.log('Argumentos:', toolCall.arguments);
      console.log('Resultado:', toolCall.result);
      console.log('Exitoso:', toolCall.success ? '✅' : '❌');
    });

    if (response.usedFallback) {
      console.log('\n⚠️ Se usó fallback debido a error:', response.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EJEMPLO 3: Llamada con historial de conversación (contexto multi-turno)
// ============================================================================

async function ejemplo3_conHistorial() {
  console.log('\n=== EJEMPLO 3: Conversación con Historial ===\n');

  const phone = '51987654321';

  // Primer turno
  const mensaje1 = '¿Cuánto cuesta hacer 50 polos?';
  console.log('Usuario:', mensaje1);

  const respuesta1 = await executeAgent({
    phone,
    userMessage: mensaje1,
  });

  console.log('Bot:', respuesta1.text);

  // Segundo turno (con historial)
  const mensaje2 = 'Y si son 100 unidades?';
  console.log('\nUsuario:', mensaje2);

  const respuesta2 = await executeAgent({
    phone,
    userMessage: mensaje2,
    conversationHistory: [
      { role: 'user', content: mensaje1 },
      { role: 'assistant', content: respuesta1.text },
    ],
  });

  console.log('Bot:', respuesta2.text);
}

// ============================================================================
// EJEMPLO 4: Solicitud de transferencia a humano
// ============================================================================

async function ejemplo4_transferirHumano() {
  console.log('\n=== EJEMPLO 4: Transferir a Asesor Humano ===\n');

  const phone = '51987654321';
  const userMessage = 'Necesito hablar con un asesor, tengo una consulta especial';

  try {
    const response = await executeAgent({
      phone,
      userMessage,
    });

    console.log('Usuario:', userMessage);
    console.log('Bot:', response.text);

    // Verificar si se ejecutó la herramienta de transferencia
    const transferTool = response.toolCalls.find(
      (call) => call.toolName === 'transferirAAsesor'
    );

    if (transferTool) {
      console.log('\n✅ Usuario transferido a asesor humano');
      console.log('Motivo:', (transferTool.arguments as any).motivo);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EJEMPLO 5: Buscar producto específico
// ============================================================================

async function ejemplo5_buscarProducto() {
  console.log('\n=== EJEMPLO 5: Buscar Producto ===\n');

  const phone = '51987654321';
  const userMessage = '¿Tienen joggers deportivos?';

  try {
    const response = await executeAgent({
      phone,
      userMessage,
    });

    console.log('Usuario:', userMessage);
    console.log('Bot:', response.text);

    // Ver si se buscó el producto
    const searchTool = response.toolCalls.find(
      (call) => call.toolName === 'buscarProductoFirestore'
    );

    if (searchTool) {
      console.log('\n🔍 Búsqueda de producto ejecutada');
      console.log('Keyword:', (searchTool.arguments as any).keyword);
      console.log('Resultado:', searchTool.result);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EJEMPLO 6: Cotización de precio
// ============================================================================

async function ejemplo6_calcularPrecio() {
  console.log('\n=== EJEMPLO 6: Calcular Precio ===\n');

  const phone = '51987654321';
  const userMessage = '¿Cuánto me costarían 75 chompas personalizadas?';

  try {
    const response = await executeAgent({
      phone,
      userMessage,
    });

    console.log('Usuario:', userMessage);
    console.log('Bot:', response.text);

    // Ver detalles de la cotización
    const priceTool = response.toolCalls.find(
      (call) => call.toolName === 'calcularPrecio'
    );

    if (priceTool) {
      console.log('\n💰 Cotización generada:');
      console.log(JSON.stringify(priceTool.result, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EJECUTAR TODOS LOS EJEMPLOS
// ============================================================================

async function ejecutarTodosLosEjemplos() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  EJEMPLOS DE USO DEL AGENTE DE OPENAI CON HERRAMIENTAS  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await ejemplo1_llamadaSimple();
  await ejemplo2_llamadaCompleta();
  await ejemplo3_conHistorial();
  await ejemplo4_transferirHumano();
  await ejemplo5_buscarProducto();
  await ejemplo6_calcularPrecio();

  console.log('\n✅ Todos los ejemplos completados');
}

// Ejecutar si se corre directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarTodosLosEjemplos().catch(console.error);
}

export {
  ejemplo1_llamadaSimple,
  ejemplo2_llamadaCompleta,
  ejemplo3_conHistorial,
  ejemplo4_transferirHumano,
  ejemplo5_buscarProducto,
  ejemplo6_calcularPrecio,
};
