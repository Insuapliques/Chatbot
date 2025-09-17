import { findByKeywords, sendCatalog, type SendCatalogPayload } from '../services/catalogService';

interface KeywordMediaHookParams {
  ctx: any;
  flowDynamic: (message: unknown) => Promise<void>;
  getFallbackMessage?: () => Promise<string | undefined> | string | undefined;
  onDelivered?: (payload: SendCatalogPayload) => Promise<void> | void;
}

export async function keywordMediaHook({
  ctx,
  flowDynamic,
  getFallbackMessage,
  onDelivered,
}: KeywordMediaHookParams): Promise<boolean> {
  try {
    const match = await findByKeywords(ctx.body);
    if (!match) {
      return false;
    }

    const catalogPromise = sendCatalog({
      ctx,
      flowDynamic,
      match,
      fallbackProvider: getFallbackMessage,
      onDelivered,
    })
      .then(() => {
        console.info('[keywordMediaHook] Catálogo procesado', {
          from: ctx.from,
          catalogId: match.id,
          tipo: match.tipo,
        });
      })
      .catch((error) => {
        console.error('[keywordMediaHook] Error enviando catálogo', {
          from: ctx.from,
          catalogId: match.id,
          error,
        });
      });

    void catalogPromise;

    return true;
  } catch (error) {
    console.error('[keywordMediaHook] Error evaluando catálogo', {
      from: ctx?.from,
      error,
    });
    return false;
  }
}
