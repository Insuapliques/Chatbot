import { getStorage } from 'firebase-admin/storage';
import xlsx from 'xlsx';

let cache: any[] | null = null;
let lastUpdated: number | null = null;

// 🔄 Descargar y convertir el archivo .xlsx desde Firebase Storage
async function cargarProductosDesdeExcel(): Promise<any[]> {
  if (cache && lastUpdated && Date.now() - lastUpdated < 5 * 60 * 1000) {
    return cache;
  }

  const bucket = getStorage().bucket();
  const file = bucket.file("productos.xlsx"); // Asegúrate que esté en la raíz del bucket
  const [buffer] = await file.download();

  const workbook = xlsx.read(buffer, { type: "buffer" });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(hoja, { defval: "" });

  cache = data;
  lastUpdated = Date.now();
  return data;
}

// 🔍 Buscar producto por nombre o referencia
export async function getProductoDesdeXLSX(texto: string): Promise<string | null> {
  const productos = await cargarProductosDesdeExcel();
  const textoLower = texto.toLowerCase();

  for (const row of productos) {
    const ref = String(row["REF"] || "").toLowerCase();
    const desc = String(row["DESCRIPCION"] || "").toLowerCase();

    if (textoLower.includes(ref) || textoLower.includes(desc)) {
      const porMayor = row["PRECIO POR MAYOR"] || "N/A";
      const unidad = row["PRECIO POR UNIDAD"] || "N/A";
      const tela = row["TELA"] || "N/A";
      const tallas = row["TALLAS"] || "N/A";
      const nota = row["NOTA"] || "";
      const colores = [
        row["COLOR 1"], row["COLOR 2"], row["COLOR 3"],
        row["COLOR 4"], row["COLOR 5"]
      ].filter(Boolean).join(", ");

      return (
        `📌 *${row["DESCRIPCION"]}*\n` +
        `🧵 Tela: ${tela}\n` +
        `📏 Tallas: ${tallas}\n` +
        `🎨 Colores: ${colores || "No especificados"}\n` +
        `💰 Por mayor: $${porMayor} | Unidad: $${unidad}\n` +
        `${nota ? "📝 " + nota : ""}`
      );
    }
  }

  return null;
}

