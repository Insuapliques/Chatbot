import { addKeyword } from "@builderbot/bot";

export const enviosFlow = addKeyword([ "hacen envíos", "cómo son los envíos", "envíos disponibles", "me puedes decir si envían", "realizan envíos"
])
  .addAnswer("🚚 ¡Claro que sí! Realizamos envíos a todo el país.")
  .addAnswer("¿En qué ciudad te encuentras para darte un estimado del costo y tiempo de entrega?", { capture: true }, async (ctx, { flowDynamic }) => {
    const ciudad = ctx.body.trim();
    const respuesta = `En ${ciudad} el envío normalmente tarda de 2 a 3 días hábiles y cuesta alrededor de $10.000. ¿Deseas que te ayudemos a realizar tu pedido?`;
    await flowDynamic(respuesta);
  });
