import { config } from "../config";
import { createAnthropicProvider } from "./anthropic";
import type { AiProvider } from "./types";

/**
 * Etkin yapay zekâ sağlayıcısı. Anahtar girilmemişse `null` döner ve
 * yapay zekâ özellikleri kapalı kalır; hiçbir içerik dışarı gönderilmez.
 * Yerel model eklendiğinde seçim burada yapılır.
 */
let cached: AiProvider | null | undefined;

export function getAiProvider(): AiProvider | null {
  if (cached === undefined) {
    cached = config.anthropicApiKey ? createAnthropicProvider(config.anthropicApiKey, config.aiModel, config.aiClassifyModel) : null;
  }
  return cached;
}
