import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  ANSWER_SYSTEM_PROMPT,
  buildAnswerPrompt,
  buildClassifyPrompt,
  buildMatchPrompt,
  buildSummaryPrompt,
  CLAIMS_SYSTEM_PROMPT,
  CLASSIFY_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
} from "./prompt";
import {
  AiError,
  type AiProvider,
  type AnswerDraft,
  type AnswerRequest,
  type ClaimsDraft,
  type ClaimsRequest,
  type ClassifyDraft,
  type ClassifyRequest,
  type MatchDraft,
  type MatchRequest,
  type SummaryDraft,
  type SummaryRequest,
} from "./types";

/** Claude API sağlayıcısı (bulut). İçerik Anthropic'e gönderilir. */

const summarySchema = z.object({
  summary: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      mentionNumbers: z.array(z.number()),
    }),
  ),
});

const classifySchema = z.object({
  results: z.array(
    z.object({
      number: z.number(),
      sentiment: z.enum(["positive", "negative", "neutral"]),
      topicNumbers: z.array(z.number()),
    }),
  ),
});

const claimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string(),
      mentionNumbers: z.array(z.number()),
      searchQueries: z.array(z.string()),
    }),
  ),
});

const answerSchema = z.object({
  answer: z.string(),
  mentionNumbers: z.array(z.number()),
});

const matchSchema = z.object({
  matches: z.array(
    z.object({
      claimNumber: z.number(),
      candidateNumbers: z.array(z.number()),
    }),
  ),
});

function describeError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError("API anahtarı geçersiz. .env.local dosyasındaki ANTHROPIC_API_KEY değerini denetleyin.", { cause: error });
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("Bu anahtarın seçili modeli kullanma izni yok.", { cause: error });
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError("Seçili model bulunamadı. YANKI_AI_MODEL değerini denetleyin.", { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("İstek sınırına takıldı. Biraz sonra yeniden deneyin.", { cause: error });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError("İstek reddedildi. API bakiyesi bitmiş ya da istek geçersiz olabilir.", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("Yapay zekâ hizmetine ulaşılamadı. Ağ bağlantısını denetleyin.", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`Yapay zekâ hizmeti hata döndürdü (${error.status ?? "bilinmiyor"}).`, { cause: error });
  }
  return new AiError("Yapay zekâ isteği sırasında beklenmeyen bir hata oluştu.", { cause: error });
}

export function createAnthropicProvider(apiKey: string, model: string, classifyModel: string): AiProvider {
  const client = new Anthropic({ apiKey });

  return {
    id: "anthropic",
    label: "Claude API",
    model,
    classifyModel,
    location: "cloud",
    async summarize(request: SummaryRequest): Promise<SummaryDraft> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildSummaryPrompt(request) }],
          output_config: { format: zodOutputFormat(summarySchema) },
        });
        if (response.stop_reason === "refusal") throw new AiError("Model bu içerik için özet üretmeyi reddetti.");
        if (response.stop_reason === "max_tokens") throw new AiError("Yanıt uzunluk sınırına takıldı; özet tamamlanamadı.");
        const parsed = response.parsed_output;
        if (!parsed) throw new AiError("Modelin yanıtı beklenen biçimde değildi.");
        return {
          summary: parsed.summary,
          themes: parsed.themes,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        throw describeError(error);
      }
    },
    async classify(request: ClassifyRequest): Promise<ClassifyDraft> {
      try {
        const response = await client.messages.parse({
          model: classifyModel,
          max_tokens: 16000,
          system: CLASSIFY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildClassifyPrompt(request) }],
          output_config: { format: zodOutputFormat(classifySchema) },
        });
        if (response.stop_reason === "refusal") throw new AiError("Model bu içerikleri sınıflandırmayı reddetti.");
        if (response.stop_reason === "max_tokens") throw new AiError("Yanıt uzunluk sınırına takıldı; sınıflandırma tamamlanamadı.");
        const parsed = response.parsed_output;
        if (!parsed) throw new AiError("Modelin yanıtı beklenen biçimde değildi.");
        return { results: parsed.results, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      } catch (error) {
        throw describeError(error);
      }
    },
    async extractClaims(request: ClaimsRequest): Promise<ClaimsDraft> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: CLAIMS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildSummaryPrompt(request) }],
          output_config: { format: zodOutputFormat(claimsSchema) },
        });
        if (response.stop_reason === "refusal") throw new AiError("Model bu içeriklerden iddia çıkarmayı reddetti.");
        if (response.stop_reason === "max_tokens") throw new AiError("Yanıt uzunluk sınırına takıldı; iddia taraması tamamlanamadı.");
        const parsed = response.parsed_output;
        if (!parsed) throw new AiError("Modelin yanıtı beklenen biçimde değildi.");
        return { claims: parsed.claims, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      } catch (error) {
        throw describeError(error);
      }
    },
    async matchFactChecks(request: MatchRequest): Promise<MatchDraft> {
      try {
        const response = await client.messages.parse({
          model: classifyModel,
          max_tokens: 16000,
          system: MATCH_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildMatchPrompt(request) }],
          output_config: { format: zodOutputFormat(matchSchema) },
        });
        if (response.stop_reason === "refusal") throw new AiError("Model doğrulama eşleştirmesini reddetti.");
        if (response.stop_reason === "max_tokens") throw new AiError("Yanıt uzunluk sınırına takıldı; eşleştirme tamamlanamadı.");
        const parsed = response.parsed_output;
        if (!parsed) throw new AiError("Modelin yanıtı beklenen biçimde değildi.");
        return { matches: parsed.matches, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      } catch (error) {
        throw describeError(error);
      }
    },
    async answer(request: AnswerRequest): Promise<AnswerDraft> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: ANSWER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildAnswerPrompt(request) }],
          output_config: { format: zodOutputFormat(answerSchema) },
        });
        if (response.stop_reason === "refusal") throw new AiError("Model bu soruyu yanıtlamayı reddetti.");
        if (response.stop_reason === "max_tokens") throw new AiError("Yanıt uzunluk sınırına takıldı.");
        const parsed = response.parsed_output;
        if (!parsed) throw new AiError("Modelin yanıtı beklenen biçimde değildi.");
        return { answer: parsed.answer, mentionNumbers: parsed.mentionNumbers, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      } catch (error) {
        throw describeError(error);
      }
    },
  };
}
