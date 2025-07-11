import { getStorage } from "firebase-admin/storage";
import * as xlsx from "xlsx";
import { db } from "../firebaseConfig";

let cache: any[] | null = null;
let lastFetched: number | null = null;

export async function getProductoDesdeXLSX(nombre: string): Promise<string | null> {
  const now = Date.now();
  if (cache && lastFetched && now - lastFetched < 5 * 60 * 1000) {
    const match = cache.find((item) =>
      String(item?.producto || "").toLowerCase().includes(nombre.toLowerCase())
    );
    return match ? formatProducto(match) : null;
  }

  const settingsDoc = await db.collection("settings").doc("archivo_entrenamiento").get();
  const data = settingsDoc.data();
  if (!data?.path) return null;

  const bucket = getStorage().bucket();
  const file = bucket.file(data.path);
  const [buffer] = await file.download();

  const workbook = xlsx.read(buffer, { type: "buffer" });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const datos = xlsx.utils.sheet_to_json<any>(hoja, { defval: "" });

  cache = datos;
  lastFetched = now;

  const producto = datos.find((item) =>
    String(item?.producto || "").toLowerCase().includes(nombre.toLowerCase())
  );

  return producto ? formatProducto(producto) : null;
}

function formatProducto(item: any): string {
  return `📦 *${item.producto}*
💲 Precio: ${item.precio || "No disponible"}
📍 Descripción: ${item.descripcion || "Sin detalles"}`;
}


