export type VoiceRuntimeConfig = {
  model: string;
  voice: string;
  modalities: Array<"text" | "audio">;
  temperature: number;
  turnDetection: {
    type: "server_vad";
    threshold: number;
    prefixPaddingMs: number;
    silenceDurationMs: number;
  };
};

export function getVoiceConfig(): VoiceRuntimeConfig {
  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";
  const voice = process.env.OPENAI_REALTIME_VOICE || "alloy";

  return {
    model,
    voice,
    modalities: ["text", "audio"],
    temperature: 0.7,
    turnDetection: {
      type: "server_vad",
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 500,
    },
  };
}
