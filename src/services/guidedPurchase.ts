/**
 * Guided Purchase Helper for Insuapliques
 * Manages step-by-step purchase flow with data collection
 */

import { db } from '../firebaseConfig.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
  extractQuantity,
  extractSize,
  extractColor,
  extractCity
} from './intentDetector.js';

export interface PurchaseData {
  producto?: string;
  categoria?: string; // 'parche', 'dtf', 'camiseta', 'combo'
  cantidad?: number;
  talla?: string;
  color?: string;
  ciudad?: string;
  precioUnitario?: number;
  precioTotal?: number;
  costoEnvio?: number;
  diseñoPersonalizado?: boolean;
  archivoDiseno?: string; // URL if user uploaded design file
  step: PurchaseStep;
  missingFields: string[];
}

export type PurchaseStep =
  | 'PRODUCTO' // Waiting for product selection
  | 'CANTIDAD' // Waiting for quantity
  | 'TALLA' // Waiting for size (if applicable)
  | 'COLOR' // Waiting for color (if applicable)
  | 'CIUDAD' // Waiting for city for shipping
  | 'DISEÑO' // Waiting for design file (if customization)
  | 'CONFIRMACION' // Ready to confirm
  | 'COMPLETADO'; // Purchase confirmed

const PURCHASE_STATE_COLLECTION = 'purchaseStates';

/**
 * Get current purchase state for user
 */
export async function getPurchaseState(phone: string): Promise<PurchaseData | null> {
  try {
    const doc = await db.collection(PURCHASE_STATE_COLLECTION).doc(phone).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as PurchaseData;
  } catch (error) {
    console.error('[guidedPurchase] Error getting purchase state:', error);
    return null;
  }
}

/**
 * Update purchase state
 */
export async function updatePurchaseState(phone: string, data: Partial<PurchaseData>): Promise<void> {
  try {
    await db.collection(PURCHASE_STATE_COLLECTION).doc(phone).set(
      {
        ...data,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[guidedPurchase] Error updating purchase state:', error);
  }
}

/**
 * Clear purchase state (after completion or cancellation)
 */
export async function clearPurchaseState(phone: string): Promise<void> {
  try {
    await db.collection(PURCHASE_STATE_COLLECTION).doc(phone).delete();
  } catch (error) {
    console.error('[guidedPurchase] Error clearing purchase state:', error);
  }
}

/**
 * Initialize new purchase flow
 */
export async function initializePurchase(
  phone: string,
  producto?: string,
  categoria?: string
): Promise<PurchaseData> {
  const initial: PurchaseData = {
    producto,
    categoria,
    step: producto ? 'CANTIDAD' : 'PRODUCTO',
    missingFields: getMissingFields({
      producto,
      categoria,
      step: 'PRODUCTO',
      missingFields: []
    })
  };

  await updatePurchaseState(phone, initial);
  return initial;
}

/**
 * Process user message and update purchase state
 */
export async function processPurchaseMessage(
  phone: string,
  message: string
): Promise<{
  updated: PurchaseData;
  nextPrompt: string;
  isComplete: boolean;
}> {
  let state = await getPurchaseState(phone);

  if (!state) {
    state = await initializePurchase(phone);
  }

  // Extract data from message
  const extracted = {
    cantidad: extractQuantity(message),
    talla: extractSize(message),
    color: extractColor(message),
    ciudad: extractCity(message)
  };

  // Update state based on current step
  const updates: Partial<PurchaseData> = {};

  switch (state.step) {
    case 'PRODUCTO':
      // Product should be detected by AI or product detection service
      break;

    case 'CANTIDAD':
      if (extracted.cantidad) {
        updates.cantidad = extracted.cantidad;
        updates.step = needsSize(state.categoria) ? 'TALLA' : needsColor(state.categoria) ? 'COLOR' : 'CIUDAD';
      }
      break;

    case 'TALLA':
      if (extracted.talla) {
        updates.talla = extracted.talla;
        updates.step = needsColor(state.categoria) ? 'COLOR' : 'CIUDAD';
      }
      break;

    case 'COLOR':
      if (extracted.color) {
        updates.color = extracted.color;
        updates.step = 'CIUDAD';
      }
      break;

    case 'CIUDAD':
      if (extracted.ciudad) {
        updates.ciudad = extracted.ciudad;
        updates.step = state.diseñoPersonalizado ? 'DISEÑO' : 'CONFIRMACION';
      }
      break;

    case 'DISEÑO':
      // Design file should be handled separately by media handler
      updates.step = 'CONFIRMACION';
      break;

    case 'CONFIRMACION':
      // Confirmation should be handled by confirmation regex
      break;

    case 'COMPLETADO':
      // Already complete
      break;
  }

  // Merge updates
  const updatedState = { ...state, ...updates };
  updatedState.missingFields = getMissingFields(updatedState);

  await updatePurchaseState(phone, updates);

  // Generate next prompt
  const nextPrompt = generateNextPrompt(updatedState);
  const isComplete = updatedState.step === 'CONFIRMACION' && updatedState.missingFields.length === 0;

  return {
    updated: updatedState,
    nextPrompt,
    isComplete
  };
}

/**
 * Determine which fields are missing
 */
function getMissingFields(state: PurchaseData): string[] {
  const missing: string[] = [];

  if (!state.producto) missing.push('producto');
  if (!state.cantidad) missing.push('cantidad');

  if (needsSize(state.categoria) && !state.talla) {
    missing.push('talla');
  }

  if (needsColor(state.categoria) && !state.color) {
    missing.push('color');
  }

  if (!state.ciudad) missing.push('ciudad');

  if (state.diseñoPersonalizado && !state.archivoDiseno) {
    missing.push('diseño');
  }

  return missing;
}

/**
 * Check if product category needs size
 */
function needsSize(categoria?: string): boolean {
  if (!categoria) return false;
  return ['camiseta', 'playera', 't-shirt'].some(cat => categoria.toLowerCase().includes(cat));
}

/**
 * Check if product category needs color
 */
function needsColor(categoria?: string): boolean {
  // Most products can have color options
  return true;
}

/**
 * Generate next prompt based on current state
 */
function generateNextPrompt(state: PurchaseData): string {
  switch (state.step) {
    case 'PRODUCTO':
      return '¿Qué producto te interesa? (parches, estampados DTF, camisetas, combos)';

    case 'CANTIDAD':
      return `¿Cuántas unidades de ${state.producto || 'este producto'} necesitas?`;

    case 'TALLA':
      return '¿Qué talla necesitas? (XS, S, M, L, XL, XXL...)';

    case 'COLOR':
      return '¿De qué color lo prefieres?';

    case 'CIUDAD':
      return '¿A qué ciudad lo enviamos?';

    case 'DISEÑO':
      return 'Por favor envía tu archivo de diseño (PNG o PDF, preferiblemente con fondo transparente) 📎.';

    case 'CONFIRMACION':
      return buildConfirmationSummary(state);

    case 'COMPLETADO':
      return '¡Pedido registrado! Te contactaremos pronto para confirmar los detalles de pago y entrega 📦.';

    default:
      return '¿En qué más puedo ayudarte?';
  }
}

/**
 * Build confirmation summary
 */
function buildConfirmationSummary(state: PurchaseData): string {
  const lines: string[] = ['Resumen de tu pedido 🧾:'];

  if (state.producto) {
    lines.push(`• Producto: ${state.producto}`);
  }

  if (state.cantidad) {
    lines.push(`• Cantidad: ${state.cantidad} unidades`);
  }

  if (state.talla) {
    lines.push(`• Talla: ${state.talla}`);
  }

  if (state.color) {
    lines.push(`• Color: ${state.color}`);
  }

  if (state.precioUnitario && state.cantidad) {
    const subtotal = state.precioUnitario * state.cantidad;
    lines.push(`• Subtotal: $${formatMoney(subtotal)}`);
  }

  if (state.ciudad) {
    lines.push(`• Envío a: ${state.ciudad}`);
    if (state.costoEnvio) {
      lines.push(`• Costo de envío: $${formatMoney(state.costoEnvio)}`);
    }
  }

  if (state.precioTotal) {
    lines.push(`\n💰 **Total: $${formatMoney(state.precioTotal)}**`);
  }

  lines.push('\n¿Confirmas tu pedido? (Responde Sí/No)');

  return lines.join('\n');
}

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Calculate shipping cost based on city (basic implementation)
 * TODO: Replace with actual shipping table from Firestore
 */
export function calculateShipping(city?: string): number {
  if (!city) return 0;

  const normalized = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Basic shipping costs (should come from Firestore collection)
  if (normalized.includes('bogota')) return 8000;
  if (normalized.includes('medellin')) return 12000;
  if (normalized.includes('cali')) return 14000;
  if (normalized.includes('barranquilla')) return 15000;
  if (normalized.includes('cartagena')) return 16000;

  // Default for other cities
  return 15000;
}
