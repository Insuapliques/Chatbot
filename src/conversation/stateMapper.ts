/**
 * State schema synchronizer for dual conversation systems
 * Maps between BuilderBot flow state and custom handler state
 */

/**
 * Convert flow state document to handler state format
 */
export function toHandlerState(flowDoc: any): {
  estadoActual?: string;
  catalogoEnviado?: boolean;
  pedidoEnProceso?: boolean;
  flags?: { saludoHecho?: boolean; nombreCapturado?: boolean };
  ultimoIntent?: string | null;
} {
  if (!flowDoc || typeof flowDoc !== 'object') {
    return {};
  }

  const mapped: any = {};

  // Map state names
  if (flowDoc.state) {
    const stateMap: Record<string, string> = {
      GREETING: 'GREETING',
      DISCOVERY: 'DISCOVERY',
      CATALOG_SENT: 'CATALOGO_ENVIADO',
      ASSISTED_SELECTION: 'COTIZACION',
      ORDER_IN_PROGRESS: 'CONFIRMACION',
      POST_ORDER: 'CIERRE',
      CLOSING: 'CIERRE',
    };
    mapped.estadoActual = stateMap[flowDoc.state] ?? flowDoc.state;
  }

  // Map catalog flag
  if (typeof flowDoc.has_sent_catalog === 'boolean') {
    mapped.catalogoEnviado = flowDoc.has_sent_catalog;
  }

  // Map intent
  if (flowDoc.last_intent !== undefined) {
    mapped.ultimoIntent = flowDoc.last_intent;
  }

  // Map order state (infer from state or slots)
  if (flowDoc.state === 'ORDER_IN_PROGRESS' || flowDoc.slots) {
    mapped.pedidoEnProceso = true;
  }

  // Map flags (preserve existing or create new)
  mapped.flags = {
    saludoHecho: flowDoc.flags?.saludoHecho ?? false,
    nombreCapturado: flowDoc.flags?.nombreCapturado ?? false,
  };

  return mapped;
}

/**
 * Convert handler state document to flow state format
 */
export function toFlowState(handlerDoc: any): {
  state?: string;
  has_sent_catalog?: boolean;
  last_intent?: string | null;
  slots?: Record<string, any>;
} {
  if (!handlerDoc || typeof handlerDoc !== 'object') {
    return {};
  }

  const mapped: any = {};

  // Map state names
  if (handlerDoc.estadoActual) {
    const stateMap: Record<string, string> = {
      GREETING: 'GREETING',
      DISCOVERY: 'DISCOVERY',
      CATALOGO_ENVIADO: 'CATALOG_SENT',
      COTIZACION: 'ASSISTED_SELECTION',
      CONFIRMACION: 'ORDER_IN_PROGRESS',
      CIERRE: 'CLOSING',
    };
    mapped.state = stateMap[handlerDoc.estadoActual] ?? handlerDoc.estadoActual;
  }

  // Map catalog flag
  if (typeof handlerDoc.catalogoEnviado === 'boolean') {
    mapped.has_sent_catalog = handlerDoc.catalogoEnviado;
  }

  // Map intent
  if (handlerDoc.ultimoIntent !== undefined) {
    mapped.last_intent = handlerDoc.ultimoIntent;
  }

  // Map slots (preserve existing or create from producto)
  mapped.slots = handlerDoc.slots ?? {};
  if (handlerDoc.productoActual) {
    mapped.slots.referencia = handlerDoc.productoActual;
  }

  return mapped;
}

/**
 * Merge both schemas into a single unified state object
 * Preserves all fields from both systems
 */
export function mergeStatSchemas(doc: any): any {
  if (!doc || typeof doc !== 'object') {
    return {};
  }

  const merged = { ...doc };

  // Sync estadoActual <-> state
  if (doc.estadoActual && !doc.state) {
    merged.state = toFlowState(doc).state;
  } else if (doc.state && !doc.estadoActual) {
    merged.estadoActual = toHandlerState(doc).estadoActual;
  }

  // Sync catalogoEnviado <-> has_sent_catalog
  if (doc.catalogoEnviado !== undefined && doc.has_sent_catalog === undefined) {
    merged.has_sent_catalog = doc.catalogoEnviado;
  } else if (doc.has_sent_catalog !== undefined && doc.catalogoEnviado === undefined) {
    merged.catalogoEnviado = doc.has_sent_catalog;
  }

  // Sync ultimoIntent <-> last_intent
  if (doc.ultimoIntent !== undefined && doc.last_intent === undefined) {
    merged.last_intent = doc.ultimoIntent;
  } else if (doc.last_intent !== undefined && doc.ultimoIntent === undefined) {
    merged.ultimoIntent = doc.last_intent;
  }

  return merged;
}
