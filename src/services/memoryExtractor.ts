// Heurística simple para detectar "recuerdos" valiosos en mensajes de usuario.
export function extractMemoryCandidates(msg: string): string[] {
  if (!msg) return [];
  const rx = [
    /(?:^|\s)mi nombre es\s+([^.,\n]{2,50})/i,
    /(?:^|\s)prefiero\s+([^.,\n]{2,80})/i,
    /(?:^|\s)trabajo en\s+([^.,\n]{2,80})/i,
    /(?:^|\s)me gusta\s+([^.,\n]{2,80})/i,
    /(?:^|\s)no me gusta\s+([^.,\n]{2,80})/i,
  ];
  const hits: string[] = [];
  for (const r of rx) {
    const m = msg.match(r);
    if (m?.[0]) hits.push(m[0].trim());
  }
  return hits.slice(0, 4);
}

export function shouldRemember(msg: string) {
  // Filtro para determinar si el mensaje debe considerarse para almacenamiento
  return (
    typeof msg === "string" &&
    msg.length > 0 &&
    msg.length <= 500 &&
    /mi nombre es|prefiero|trabajo en|me gusta|no me gusta/i.test(msg)
  );
}
