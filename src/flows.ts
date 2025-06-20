import { createFlow } from "@builderbot/bot";
import { welcomeFlow, registrarNombreFlow, inteligenciaArtificialFlow } from "./flows/welcomeFlow";
// import { nombreFlow } from "./flows/welcomeFlow";
import { asesorHumanoFlow } from "./flows/asesorHumanoFlow";
import { clientesIndecisosFlow } from "./flows/clientesIndecisosFlow";
import { dtfFlow } from "./flows/dtfFlow";
import { enviosFlow } from "./flows/enviosFlow";

export const main = createFlow([ welcomeFlow, registrarNombreFlow, inteligenciaArtificialFlow]);
