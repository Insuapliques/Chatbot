/**
 * Script de prueba para endpoints del agente
 *
 * Ejecutar con: tsx scripts/test-agent-endpoints.ts
 *
 * NOTA: Asegúrate de que el servidor esté corriendo (pnpm dev)
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3008';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

interface TestResult {
  name: string;
  endpoint: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  duration: number;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

async function runTest(
  name: string,
  endpoint: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now();

  try {
    await testFn();
    results.push({
      name,
      endpoint,
      status: 'PASSED',
      duration: Date.now() - start,
    });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({
      name,
      endpoint,
      status: 'FAILED',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

function printSummary(): void {
  console.log('\n' + '='.repeat(70));
  console.log('RESUMEN DE PRUEBAS');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const total = results.length;

  console.log(`\nTotal: ${total}`);
  console.log(`✅ Pasadas: ${passed}`);
  console.log(`❌ Fallidas: ${failed}`);
  console.log(`⏭️  Omitidas: ${skipped}`);

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n⏱️  Tiempo total: ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('ERRORES DETALLADOS');
    console.log('='.repeat(70));

    results
      .filter(r => r.status === 'FAILED')
      .forEach((result, idx) => {
        console.log(`\n${idx + 1}. ${result.name}`);
        console.log(`   Endpoint: ${result.endpoint}`);
        console.log(`   Error: ${result.error}`);
      });
  }

  console.log('\n' + '='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// TESTS
// ============================================================================

async function testHealthCheck(): Promise<void> {
  await runTest(
    'Health Check',
    '/api/agent/health',
    async () => {
      const response = await makeRequest('/api/agent/health');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'healthy') {
        throw new Error(`Expected status "healthy", got "${data.status}"`);
      }

      if (!data.checks?.openai?.configured) {
        throw new Error('OpenAI no está configurado');
      }

      if (!data.checks?.firestore?.connected) {
        throw new Error('Firestore no está conectado');
      }
    }
  );
}

async function testGetTools(): Promise<void> {
  await runTest(
    'Obtener herramientas disponibles',
    '/api/agent/tools',
    async () => {
      const response = await makeRequest('/api/agent/tools');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (!Array.isArray(data.data.tools)) {
        throw new Error('tools no es un array');
      }

      if (data.data.totalTools !== 4) {
        throw new Error(`Expected 4 tools, got ${data.data.totalTools}`);
      }

      const expectedTools = [
        'buscarProductoFirestore',
        'enviarCatalogo',
        'transferirAAsesor',
        'calcularPrecio',
      ];

      const toolNames = data.data.tools.map((t: any) => t.name);

      for (const expectedTool of expectedTools) {
        if (!toolNames.includes(expectedTool)) {
          throw new Error(`Falta herramienta: ${expectedTool}`);
        }
      }
    }
  );
}

async function testGetPrompt(): Promise<void> {
  await runTest(
    'Obtener prompt actual',
    '/api/agent/prompt',
    async () => {
      const response = await makeRequest('/api/agent/prompt');

      // Puede retornar 404 si no existe el documento
      if (response.status === 404) {
        console.log('   ℹ️  Documento de prompt no existe (esto es normal en primera ejecución)');
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (typeof data.data.entrenamiento_base !== 'string') {
        throw new Error('entrenamiento_base no es string');
      }
    }
  );
}

async function testChatSimple(): Promise<void> {
  await runTest(
    'Chat simple',
    '/api/agent/chat',
    async () => {
      const response = await makeRequest('/api/agent/chat', 'POST', {
        phone: '51987654321',
        message: 'Hola, ¿cómo estás?',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (typeof data.data.response !== 'string') {
        throw new Error('response no es string');
      }

      if (data.data.response.length === 0) {
        throw new Error('response está vacía');
      }

      console.log(`   📝 Respuesta: "${data.data.response.substring(0, 60)}..."`);
    }
  );
}

async function testChatAdvanced(): Promise<void> {
  await runTest(
    'Chat avanzado con historial',
    '/api/agent/chat-advanced',
    async () => {
      const response = await makeRequest('/api/agent/chat-advanced', 'POST', {
        phone: '51987654321',
        message: '¿Cuánto cuestan 50 chompas?',
        conversationHistory: [
          {
            role: 'user',
            content: 'Hola',
          },
          {
            role: 'assistant',
            content: 'Hola, ¿en qué puedo ayudarte?',
          },
        ],
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (typeof data.data.text !== 'string') {
        throw new Error('text no es string');
      }

      if (!Array.isArray(data.data.toolCalls)) {
        throw new Error('toolCalls no es array');
      }

      console.log(`   📝 Respuesta: "${data.data.text.substring(0, 60)}..."`);
      console.log(`   🛠️  Herramientas usadas: ${data.data.toolCalls.length}`);

      if (data.data.toolCalls.length > 0) {
        const toolNames = data.data.toolCalls.map((tc: any) => tc.toolName).join(', ');
        console.log(`   🔧 Herramientas: ${toolNames}`);
      }
    }
  );
}

async function testGetState(): Promise<void> {
  await runTest(
    'Obtener estado de conversación',
    '/api/agent/state/:phone',
    async () => {
      const response = await makeRequest('/api/agent/state/51987654321');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (typeof data.data.phone !== 'string') {
        throw new Error('phone no es string');
      }

      if (typeof data.data.exists !== 'boolean') {
        throw new Error('exists no es boolean');
      }

      console.log(`   📊 Estado existe: ${data.data.exists}`);
    }
  );
}

async function testGetHistory(): Promise<void> {
  await runTest(
    'Obtener historial de conversación',
    '/api/agent/history/:phone',
    async () => {
      const response = await makeRequest('/api/agent/history/51987654321?limit=10');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('success !== true');
      }

      if (!Array.isArray(data.data.messages)) {
        throw new Error('messages no es array');
      }

      console.log(`   💬 Mensajes: ${data.data.count}`);
    }
  );
}

async function testInvalidRequest(): Promise<void> {
  await runTest(
    'Validación de request inválido',
    '/api/agent/chat',
    async () => {
      const response = await makeRequest('/api/agent/chat', 'POST', {
        // Falta phone y message
      });

      if (response.status !== 400) {
        throw new Error(`Expected HTTP 400, got ${response.status}`);
      }

      const data = await response.json();

      if (!data.error) {
        throw new Error('Error message no presente');
      }

      if (!Array.isArray(data.details)) {
        throw new Error('details no es array');
      }
    }
  );
}

async function testUnauthorized(): Promise<void> {
  await runTest(
    'Autenticación requerida',
    '/api/agent/health',
    async () => {
      const response = await fetch(`${BASE_URL}/api/agent/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // No incluir X-Api-Key
        },
      });

      if (response.status !== 401 && response.status !== 403) {
        throw new Error(`Expected HTTP 401/403, got ${response.status}`);
      }
    }
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     PRUEBAS DE ENDPOINTS DEL AGENTE OPENAI               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log('');
  console.log('Ejecutando pruebas...\n');

  // Ejecutar pruebas en orden
  await testHealthCheck();
  await testGetTools();
  await testGetPrompt();
  await testUnauthorized();
  await testInvalidRequest();
  await testChatSimple();
  await testChatAdvanced();
  await testGetState();
  await testGetHistory();

  // Imprimir resumen
  printSummary();
}

// Ejecutar si se corre directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { main };
