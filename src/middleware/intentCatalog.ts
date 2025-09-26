import { buscarProductoChatbot } from '../services/aiService.js';
import { getState, updateState } from '../services/stateManager.js';

const CATALOG_TRIGGERS = [
  'catálogo', 'catalogo', 'combo', 'combos', 'productos', 'lista', 'muestr', 'ver catálogo', 'ver catalogo',
  'quiero', 'me interesa', 'interesad', 'cotización', 'cotizacion', 'precio', 'precios'
];

const POST_ORDER_TRIGGERS = [
  'ya hice pedido', 'ya realicé pedido', 'ya realice pedido', 'ya compré', 'ya compre',
  'ya envié el pedido', 'ya envie el pedido'
];

function containsAny(text: string, words: string[]): boolean {
  const low = text.toLowerCase();
  return words.some(w => low.includes(w.toLowerCase()));
}

export async function handleControlIntents(ctx: any, flowDynamic: any): Promise<boolean> {
  const chatId = ctx.from;
  const message = String(ctx.body || '');

  const state = await getState(chatId);
  if (state.modoHumano) {
    // No hacer nada si está en modo humano
    return true;
  }

  // 1) Post-order detection
  if (containsAny(message, POST_ORDER_TRIGGERS)) {
    await updateState(chatId, { state: 'POST_ORDER' });
    await flowDynamic('¡Perfecto! Tu pedido está en proceso. ¿Deseas **confirmar**, **ver estado** o **soporte**?');
    return true; // handled
  }

  // 2) Catalog trigger with idempotency
  if (containsAny(message, CATALOG_TRIGGERS)) {
    // Buscar un producto/asset del catálogo
    const prod = await buscarProductoChatbot(message);
    if (prod?.url) {
      await flowDynamic([{ body: prod.respuesta || 'Te comparto este recurso:', media: prod.url }]);
      await updateState(chatId, { has_sent_catalog: true, state: 'CATALOG_SENT', last_intent: 'catalog' });
    } else {
      // Recurso genérico si no match
      await flowDynamic('Te comparto nuestro catálogo general. ¿Quieres filtrar por **talla** o **color**?');
      await updateState(chatId, { has_sent_catalog: true, state: 'CATALOG_SENT', last_intent: 'catalog' });
    }
    return true;
  }

  return false; // not handled
}