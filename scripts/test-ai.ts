import 'dotenv/config';
import { answerWithPromptBase } from '../src/services/aiService';
import { ensurePromptConfig } from '../src/services/promptManager';

async function main(): Promise<void> {
  try {
    await ensurePromptConfig();
    const result = await answerWithPromptBase({
      conversationId: 'smoke-test',
      userMessage: 'Hola, ¿qué productos ofrecen?',
      contextMetadata: {
        origin: 'smoke-test',
      },
    });
    console.log('✅ Respuesta IA:', {
      text: result.text,
      closingTriggered: result.closingTriggered,
      latencyMs: result.latencyMs,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    console.error('❌ Error ejecutando smoke-test IA:', error);
    process.exitCode = 1;
  }
}

void main();
