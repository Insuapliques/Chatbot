/**
 * Intent Detection Service for Insuapliques
 * Detects user intents based on message analysis
 */

export type Intent =
  | 'CATALOG'
  | 'PRICES_COMBOS'
  | 'PURCHASE'
  | 'CUSTOMIZATION'
  | 'HUMAN_HANDOVER'
  | 'CLOSING'
  | 'SHIPPING'
  | 'UNKNOWN';

export interface IntentResult {
  intent: Intent;
  confidence: number;
  matchedKeywords: string[];
}

// Intent keyword patterns
const INTENT_PATTERNS: Record<Intent, string[]> = {
  CATALOG: [
    'catalogo', 'catálogo', 'catalog',
    'modelos', 'diseños', 'diseños',
    'qué tienen', 'que tienen', 'qué ofrecen', 'que ofrecen',
    'muestra', 'muestrame', 'ver opciones', 'ver productos'
  ],

  PRICES_COMBOS: [
    'precio', 'precios', 'vale', 'cuesta', 'cuanto', 'cuánto', 'cuánto cuesta',
    'cotización', 'cotizacion', 'cotizar',
    'combo', 'combos', 'paquete', 'paquetes', 'oferta', 'ofertas',
    'valor', 'costo', 'tarifa'
  ],

  PURCHASE: [
    'quiero comprar', 'comprar', 'hacer pedido', 'pedido',
    'necesito', 'requiero', 'solicitar',
    'cuántas unidades', 'cuantas unidades',
    'talla', 'tallas', 'color', 'colores',
    'cantidad', 'cuántos', 'cuantos'
  ],

  CUSTOMIZATION: [
    'personalizado', 'personalizados', 'personalizar', 'personalización',
    'mi diseño', 'mi logo', 'con mi logo',
    'subir diseño', 'enviar diseño', 'mandar diseño',
    'dtf personalizado', 'parche personalizado',
    'diseño propio', 'arte personalizado'
  ],

  HUMAN_HANDOVER: [
    'hablar con alguien', 'hablar con una persona',
    'asesor humano', 'asesor', 'atención personalizada',
    'atención al cliente', 'servicio al cliente',
    'quiero hablar', 'necesito hablar',
    'operador', 'agente', 'representante'
  ],

  CLOSING: [
    'gracias', 'muchas gracias', 'ok gracias',
    'eso es todo', 'es todo', 'nada más', 'nada mas',
    'ya está', 'ya esta', 'listo',
    'perfecto', 'excelente', 'genial',
    'chao', 'adiós', 'adios', 'bye', 'hasta luego', 'nos vemos'
  ],

  SHIPPING: [
    'envío', 'envio', 'envíos', 'envios',
    'entrega', 'entregas', 'delivery',
    'domicilio', 'domicilios',
    'ciudad', 'dónde envían', 'donde envian',
    'tiempo de entrega', 'cuánto tarda', 'cuanto demora'
  ],

  UNKNOWN: []
};

/**
 * Normalize text for comparison (lowercase, remove accents, trim)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .trim();
}

/**
 * Detect intent from user message
 */
export function detectIntent(message: string): IntentResult {
  const normalized = normalizeText(message);
  const results: Array<{ intent: Intent; score: number; matched: string[] }> = [];

  // Check each intent pattern
  for (const [intentKey, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intentKey === 'UNKNOWN') continue;

    const intent = intentKey as Intent;
    const matched: string[] = [];
    let score = 0;

    for (const pattern of patterns) {
      const normalizedPattern = normalizeText(pattern);
      if (normalized.includes(normalizedPattern)) {
        matched.push(pattern);
        // Longer patterns get more weight
        score += normalizedPattern.length;
      }
    }

    if (matched.length > 0) {
      results.push({ intent, score, matched });
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    return {
      intent: 'UNKNOWN',
      confidence: 0,
      matchedKeywords: []
    };
  }

  const best = results[0];
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const confidence = totalScore > 0 ? best.score / totalScore : 0;

  return {
    intent: best.intent,
    confidence,
    matchedKeywords: best.matched
  };
}

/**
 * Check if message contains product-related keywords
 * This is a generic check - specific products should come from price list
 */
export function containsProductMention(message: string): boolean {
  const normalized = normalizeText(message);
  const productKeywords = [
    'parche', 'parches', 'patch', 'patches',
    'dtf', 'estampado', 'estampados', 'print', 'prints', 'transfer',
    'camiseta', 'camisetas', 'playera', 'playeras', 't-shirt', 't-shirts',
    'combo', 'combos', 'paquete', 'paquetes',
    'bordado', 'bordados', 'embroidered',
    'tejido', 'tejidos', 'woven',
    'termoadhesivo', 'iron-on', 'heat transfer',
    'velcro'
  ];

  return productKeywords.some(keyword => normalized.includes(keyword));
}

/**
 * Extract quantity from message
 */
export function extractQuantity(message: string): number | null {
  const patterns = [
    /(\d+)\s*(?:unidades?|uds?|piezas?|pz|pz\.)/i,
    /(?:necesito|quiero|requiero)\s*(\d+)/i,
    /(\d+)\s*(?:de|del)/i,
    /\b(\d{1,4})\b/
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const qty = Number.parseInt(match[1], 10);
      if (qty > 0 && qty < 100000) {
        return qty;
      }
    }
  }

  return null;
}

/**
 * Extract size from message
 */
export function extractSize(message: string): string | null {
  const sizePattern = /\b(talla|size|medida)\s*([a-z0-9]{1,4})\b/i;
  const match = message.match(sizePattern);
  if (match && match[2]) {
    return match[2].toUpperCase();
  }

  // Check for standalone sizes
  const standalonePattern = /\b(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i;
  const standaloneMatch = message.match(standalonePattern);
  if (standaloneMatch) {
    return standaloneMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Extract color from message
 */
export function extractColor(message: string): string | null {
  const colorPattern = /\b(color|colour)\s*(?:es|:)?\s*([a-záéíóúñ]+)\b/i;
  const match = message.match(colorPattern);
  if (match && match[2]) {
    return capitalize(match[2]);
  }

  // Common colors
  const colors = [
    'negro', 'blanco', 'rojo', 'azul', 'verde', 'amarillo',
    'naranja', 'morado', 'rosa', 'gris', 'café', 'beige',
    'black', 'white', 'red', 'blue', 'green', 'yellow',
    'orange', 'purple', 'pink', 'gray', 'brown', 'beige'
  ];

  const normalized = normalizeText(message);
  for (const color of colors) {
    if (normalized.includes(color)) {
      return capitalize(color);
    }
  }

  return null;
}

/**
 * Extract city from message
 */
export function extractCity(message: string): string | null {
  const cityPattern = /\b(en|a|para|ciudad|city)\s+([a-záéíóúñ\s]{3,30})\b/i;
  const match = message.match(cityPattern);
  if (match && match[2]) {
    return capitalize(match[2].trim());
  }

  // Common Colombian cities
  const cities = [
    'bogotá', 'bogota', 'medellín', 'medellin', 'cali', 'barranquilla',
    'cartagena', 'cúcuta', 'cucuta', 'bucaramanga', 'pereira', 'santa marta',
    'ibagué', 'ibague', 'pasto', 'manizales', 'neiva', 'villavicencio'
  ];

  const normalized = normalizeText(message);
  for (const city of cities) {
    if (normalized.includes(city)) {
      return capitalize(city.replace(/bogota/i, 'Bogotá').replace(/medellin/i, 'Medellín'));
    }
  }

  return null;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
