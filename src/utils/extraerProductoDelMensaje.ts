// utils/extraerProductoDelMensaje.ts

/**
 * Detecta productos específicos mencionados en el mensaje, usando una lista conocida.
 */

const productos = [
  "chompa unisex",
  "chompa ombliguera dama",
  "joger",
  "pantaloneta",
  "blusa manga bombacha tela fria",
  "bluson largo manga doblada",
  "bluson corto manga doblada",
  "licra fria hombre",
  "camiseta basica dama",
  "camiseta basica hombre",
  "bluson manga doblada licra alg",
  "camiseta basica corta",
  "camiseta basica niña",
  "camiseta basica niño",
  "bluson corto manga doblada",
  "oversize hombre burda",
  "camiseta niño burda",
  "camiseta bolsillo",
  "camiseta niño tela fria",
  "pantaloneta oversize burda",
  "camisilla rib",
  "camiseta corta m/rangla combi"
];

export function extraerProductoDelMensaje(mensaje: string): string | null {
  const texto = mensaje.toLowerCase();

  for (const producto of productos) {
    if (texto.includes(producto)) {
      return producto;
    }
  }

  return null;
}
