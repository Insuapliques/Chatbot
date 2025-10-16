/**
 * Price List Loader for AI Context - Insuapliques Edition
 * Loads XLSX price list from Firebase Storage and formats it for AI
 * Supports: unit prices, combos, variants (size/color)
 */

import { getStorage } from 'firebase-admin/storage';
import * as xlsx from 'xlsx';
import { db } from '../firebaseConfig.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let priceListCache: string | null = null;
let lastFetched: number | null = null;

interface PriceListRow {
  producto?: string;
  tipo?: string;
  categoria?: string;
  precio?: string | number;
  precio_base?: string | number;
  talla?: string;
  color?: string;
  cantidad_min?: string | number;
  cantidad_max?: string | number;
  descripcion?: string;
  combo?: string;
  incluye?: string;
  [key: string]: any;
}

interface NormalizedProduct {
  name: string;
  type: 'unit' | 'combo';
  category?: string;
  basePrice?: number;
  variants: Array<{
    size?: string;
    color?: string;
    minQty?: number;
    maxQty?: number;
    price: number;
  }>;
  description?: string;
  includes?: string; // For combos
}

/**
 * Normalize a row into structured product data
 */
function normalizeRow(row: PriceListRow): NormalizedProduct | null {
  const name = (
    row.producto ||
    row.Producto ||
    row.PRODUCTO ||
    row.nombre ||
    row.Nombre ||
    row.NOMBRE
  )?.toString().trim();

  if (!name) {
    return null;
  }

  const isCombo = Boolean(
    row.combo ||
    row.Combo ||
    row.COMBO ||
    name.toLowerCase().includes('combo') ||
    name.toLowerCase().includes('paquete')
  );

  const basePrice = parsePrice(
    row.precio_base ||
    row.PrecioBase ||
    row.PRECIO_BASE ||
    row.precio ||
    row.Precio ||
    row.PRECIO
  );

  const variantPrice = parsePrice(
    row.precio ||
    row.Precio ||
    row.PRECIO
  );

  const category = (
    row.categoria ||
    row.Categoria ||
    row.CATEGORIA ||
    row.tipo ||
    row.Tipo ||
    row.TIPO
  )?.toString().trim();

  const description = (
    row.descripcion ||
    row.Descripcion ||
    row.DESCRIPCION ||
    row.detalle ||
    row.Detalle
  )?.toString().trim();

  const includes = (
    row.incluye ||
    row.Incluye ||
    row.INCLUYE ||
    row.contenido ||
    row.Contenido
  )?.toString().trim();

  return {
    name,
    type: isCombo ? 'combo' : 'unit',
    category,
    basePrice: basePrice ?? variantPrice,
    variants: [
      {
        size: row.talla?.toString().trim() || row.Talla?.toString().trim(),
        color: row.color?.toString().trim() || row.Color?.toString().trim(),
        minQty: parseQty(row.cantidad_min || row.CantidadMin),
        maxQty: parseQty(row.cantidad_max || row.CantidadMax),
        price: variantPrice ?? basePrice ?? 0,
      },
    ].filter((v) => v.price > 0),
    description,
    includes,
  };
}

function parsePrice(value: any): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function parseQty(value: any): number | undefined {
  if (typeof value === 'number' && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

/**
 * Merge rows with same product name into single entry with multiple variants
 */
function mergeProducts(products: NormalizedProduct[]): NormalizedProduct[] {
  const map = new Map<string, NormalizedProduct>();

  for (const product of products) {
    const key = product.name.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      // Merge variants
      existing.variants.push(...product.variants);
      // Update base price if current is higher (or first defined)
      if (product.basePrice && (!existing.basePrice || product.basePrice < existing.basePrice)) {
        existing.basePrice = product.basePrice;
      }
      // Merge description if new one is longer
      if (product.description && (!existing.description || product.description.length > existing.description.length)) {
        existing.description = product.description;
      }
      // Merge includes for combos
      if (product.includes) {
        existing.includes = product.includes;
      }
    } else {
      map.set(key, { ...product });
    }
  }

  return Array.from(map.values());
}

/**
 * Format products for AI context
 */
function formatProductsForAI(products: NormalizedProduct[]): string {
  if (products.length === 0) {
    return '⚠️ LISTA DE PRECIOS NO DISPONIBLE. Si el usuario pregunta por precios, informa que no tienes acceso a la lista actualizada y ofrece contactar con atención al cliente.';
  }

  const lines: string[] = [
    '📋 LISTA DE PRECIOS INSUAPLIQUES - ACTUALIZADA',
    '',
    'IMPORTANTE: Usa EXACTAMENTE estos precios. NUNCA inventes valores.',
    '',
  ];

  const combos = products.filter((p) => p.type === 'combo');
  const units = products.filter((p) => p.type === 'unit');

  // Combos first
  if (combos.length > 0) {
    lines.push('═══ COMBOS Y PAQUETES ═══');
    combos.forEach((combo) => {
      lines.push(`• ${combo.name}`);
      if (combo.includes) {
        lines.push(`  Incluye: ${combo.includes}`);
      }
      if (combo.basePrice) {
        lines.push(`  Precio: $${formatMoney(combo.basePrice)}`);
      }
      combo.variants.forEach((v) => {
        if (v.price && v.price !== combo.basePrice) {
          const parts = [];
          if (v.minQty) parts.push(`${v.minQty}+ unidades`);
          if (v.size) parts.push(`talla ${v.size}`);
          if (v.color) parts.push(v.color);
          const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          lines.push(`  → $${formatMoney(v.price)}${suffix}`);
        }
      });
      if (combo.description) {
        lines.push(`  Detalles: ${combo.description}`);
      }
      lines.push('');
    });
  }

  // Units
  if (units.length > 0) {
    lines.push('═══ PRODUCTOS INDIVIDUALES ═══');

    // Group by category if available
    const categorized = new Map<string, NormalizedProduct[]>();
    units.forEach((product) => {
      const cat = product.category || 'Otros';
      if (!categorized.has(cat)) {
        categorized.set(cat, []);
      }
      categorized.get(cat)!.push(product);
    });

    categorized.forEach((prods, category) => {
      if (categorized.size > 1) {
        lines.push(`\n▸ ${category.toUpperCase()}`);
      }
      prods.forEach((product) => {
        lines.push(`• ${product.name}`);
        if (product.basePrice) {
          lines.push(`  Precio base: $${formatMoney(product.basePrice)}`);
        }
        if (product.variants.length > 1 || (product.variants.length === 1 && product.variants[0].price !== product.basePrice)) {
          product.variants.forEach((v) => {
            const parts = [];
            if (v.size) parts.push(`talla ${v.size}`);
            if (v.color) parts.push(v.color);
            if (v.minQty && v.maxQty) {
              parts.push(`${v.minQty}-${v.maxQty} unidades`);
            } else if (v.minQty) {
              parts.push(`${v.minQty}+ unidades`);
            }
            const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
            lines.push(`  → $${formatMoney(v.price)}${suffix}`);
          });
        }
        if (product.description) {
          lines.push(`  ${product.description}`);
        }
        lines.push('');
      });
    });
  }

  lines.push('═══ INSTRUCCIONES ═══');
  lines.push('1. Si el producto NO está en esta lista, di "No tengo ese producto en la lista actual"');
  lines.push('2. Si el combo NO existe, NO lo inventes. Sugiere productos individuales.');
  lines.push('3. Para cotizaciones, pregunta: cantidad, talla (si aplica), color (si aplica)');
  lines.push('4. Los envíos se calculan aparte según ciudad del cliente');
  lines.push('5. Para personalización DTF, pregunta por el archivo de diseño');

  return lines.join('\n');
}

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Load price list from Firebase and format for AI context
 * Returns formatted string suitable for injection into AI prompt
 */
export async function loadPriceListForAI(): Promise<string | null> {
  const now = Date.now();

  // Return cached version if still valid
  if (priceListCache && lastFetched && now - lastFetched < CACHE_TTL_MS) {
    console.log('[priceListLoader] 💾 Using cached price list');
    return priceListCache;
  }

  try {
    // Load archivo_entrenamiento document from settings collection
    const settingsDoc = await db.collection('settings').doc('archivo_entrenamiento').get();
    const data = settingsDoc.data();

    if (!data) {
      console.warn('[priceListLoader] ⚠️ Document settings/archivo_entrenamiento not found');
      return formatProductsForAI([]); // Return warning message
    }

    console.log('[priceListLoader] 📄 Document data:', {
      Name: data.Name,
      Path: data.Path,
      ContentType: data.ContentType,
      UpdatedAt: data.UpdatedAt,
      hasUrl: !!data.url,
    });

    // Try to use URL if available, otherwise fall back to Path (capitalized field names)
    let buffer: Buffer;
    const url = data.url;
    const path = data.Path || data.path;

    if (url) {
      console.log('[priceListLoader] 📥 Downloading from URL:', url);
      const response = await fetch(url);
      if (!response.ok) {
        console.error('[priceListLoader] ❌ Failed to download from URL:', response.status, response.statusText);
        return formatProductsForAI([]); // Return warning message
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (path) {
      console.log('[priceListLoader] 📊 Loading from Storage path:', path);
      const bucket = getStorage().bucket();
      const file = bucket.file(path);

      const [exists] = await file.exists();
      if (!exists) {
        console.error('[priceListLoader] ❌ File does not exist at path:', path);
        return formatProductsForAI([]); // Return warning message
      }

      [buffer] = await file.download();
    } else {
      console.warn('[priceListLoader] ⚠️ No Path or url found in settings/archivo_entrenamiento');
      return formatProductsForAI([]); // Return warning message
    }

    // Parse XLSX
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<PriceListRow>(sheet, { defval: '' });

    console.log(`[priceListLoader] 📊 Loaded ${rows.length} rows from XLSX`);

    // DEBUG: Log first 3 raw rows to see structure
    if (rows.length > 0) {
      console.log('[priceListLoader] 🔍 First raw row sample:', JSON.stringify(rows[0], null, 2));
      console.log('[priceListLoader] 🔍 Available columns:', Object.keys(rows[0]));
    }

    // Normalize and merge products
    const normalized = rows.map(normalizeRow).filter((p): p is NormalizedProduct => p !== null);

    // DEBUG: Log first normalized product
    if (normalized.length > 0) {
      console.log('[priceListLoader] 🔍 First normalized product:', JSON.stringify(normalized[0], null, 2));
    } else {
      console.warn('[priceListLoader] ⚠️ No products were normalized! All rows returned null.');
    }

    const merged = mergeProducts(normalized);

    console.log(`[priceListLoader] ✅ Processed into ${merged.length} unique products (${merged.filter((p) => p.type === 'combo').length} combos, ${merged.filter((p) => p.type === 'unit').length} units)`);

    // Format for AI context
    const formatted = formatProductsForAI(merged);

    // Cache the result
    priceListCache = formatted;
    lastFetched = now;

    return formatted;
  } catch (error) {
    console.error('[priceListLoader] ❌ Error loading price list:', error);
    return formatProductsForAI([]); // Return warning message
  }
}

/**
 * Clear the price list cache (useful for testing or manual refresh)
 */
export function clearPriceListCache(): void {
  priceListCache = null;
  lastFetched = null;
  console.log('[priceListLoader] 🗑️ Cache cleared');
}
