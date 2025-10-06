/**
 * Price List Loader for AI Context
 * Loads XLSX price list from Firebase Storage and formats it for AI
 */

import { getStorage } from 'firebase-admin/storage';
import * as xlsx from 'xlsx';
import { db } from '../firebaseConfig.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let priceListCache: string | null = null;
let lastFetched: number | null = null;

interface PriceListItem {
  producto?: string;
  precio?: string | number;
  descripcion?: string;
  [key: string]: any;
}

/**
 * Load price list from Firebase and format for AI context
 * Returns formatted string suitable for injection into AI prompt
 */
export async function loadPriceListForAI(): Promise<string | null> {
  const now = Date.now();

  // Return cached version if still valid
  if (priceListCache && lastFetched && now - lastFetched < CACHE_TTL_MS) {
    return priceListCache;
  }

  try {
    // Load training_file document from settings collection
    const settingsDoc = await db.collection('settings').doc('training_file').get();
    const data = settingsDoc.data();

    if (!data?.path) {
      console.warn('[priceListLoader] No price list path found in settings/training_file');
      return null;
    }

    console.log('[priceListLoader] 📊 Loading price list from:', data.path);

    // Download XLSX from Firebase Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(data.path);
    const [buffer] = await file.download();

    // Parse XLSX
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const items = xlsx.utils.sheet_to_json<PriceListItem>(sheet, { defval: '' });

    console.log(`[priceListLoader] ✅ Loaded ${items.length} products from price list`);

    // Format for AI context
    const formatted = formatPriceListForAI(items);

    // Cache the result
    priceListCache = formatted;
    lastFetched = now;

    return formatted;
  } catch (error) {
    console.error('[priceListLoader] Error loading price list:', error);
    return null;
  }
}

/**
 * Format price list items into a compact, AI-friendly string
 */
function formatPriceListForAI(items: PriceListItem[]): string {
  if (items.length === 0) {
    return '';
  }

  const lines: string[] = [
    '📋 LISTA DE PRECIOS ACTUALIZADA:',
    '',
  ];

  items.forEach((item, index) => {
    const producto = item.producto || item.Producto || item.PRODUCTO || 'Producto sin nombre';
    const precio = item.precio || item.Precio || item.PRECIO || 'No disponible';
    const descripcion = item.descripcion || item.Descripcion || item.DESCRIPCION || '';

    // Compact format: Product | Price | Description
    const line = `${index + 1}. ${producto} - $${precio}${descripcion ? ` (${descripcion})` : ''}`;
    lines.push(line);
  });

  lines.push('');
  lines.push('IMPORTANTE: Usa estos precios exactos cuando el usuario pregunte por costos o cotizaciones.');

  return lines.join('\n');
}

/**
 * Clear the price list cache (useful for testing or manual refresh)
 */
export function clearPriceListCache(): void {
  priceListCache = null;
  lastFetched = null;
  console.log('[priceListLoader] Cache cleared');
}
