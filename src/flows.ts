import { createFlow } from "@builderbot/bot";
import { welcomeFlow, registrarNombreFlow, inteligenciaArtificialFlow } from "./flows/welcomeFlow.js";
import { asesorHumanoFlow } from "./flows/asesorHumanoFlow.js";
import { clientesIndecisosFlow } from "./flows/clientesIndecisosFlow.js";
import { dtfFlow } from "./flows/dtfFlow.js";
import { enviosFlow } from "./flows/enviosFlow.js";

export const main = createFlow([
  welcomeFlow,
  registrarNombreFlow,
  inteligenciaArtificialFlow,
  asesorHumanoFlow,
  clientesIndecisosFlow,
  dtfFlow,
  enviosFlow
]);