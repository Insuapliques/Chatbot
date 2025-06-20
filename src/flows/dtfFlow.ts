import { addKeyword } from "@builderbot/bot";

export const dtfFlow = addKeyword(["precio estampado", "cuánto vale el estampado", "valor dtf", "precio dtf"])
  .addAnswer("🖨️ Los estampados DTF varían según el tamaño y la cantidad.")
  .addAnswer("¿Podrías decirme qué medidas necesitas o cuántas unidades estás pensando?", { capture: true }, async (ctx, { flowDynamic }) => {
    const detalle = ctx.body;
    const estimado = "Para darte una idea, los precios comienzan desde $2.000 por unidad en tamaño A6, y bajan según la cantidad. ¿Te gustaría pasar al proceso de compra o ver disponibilidad?";
    await flowDynamic(`${detalle} ✅ ¡Gracias por la info! ${estimado}`);
  });
