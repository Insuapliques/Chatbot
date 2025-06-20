import { addKeyword } from "@builderbot/bot";

export const clientesIndecisosFlow = addKeyword(["quiero información", "solo estoy mirando", "no sé bien", "aún no decido"])
  .addAnswer("Tenemos diferentes opciones 😄, ¿te gustaría saber sobre *personalización* o *precios*?");
