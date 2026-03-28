export type AIPlatform =
  | "chatgpt"
  | "claude"
  | "grok"
  | "gemini"
  | "perplexity"
  | "cursor"
  | "copilot"
  | "custom";

type PlatformConfig = {
  label: string;
  prefersStructuredJSON?: boolean;
};

export const PLATFORM_CONFIG: Record<AIPlatform, PlatformConfig> = {
  chatgpt: { label: "ChatGPT", prefersStructuredJSON: true },
  claude: { label: "Claude", prefersStructuredJSON: true },
  grok: { label: "Grok" },
  gemini: { label: "Gemini" },
  perplexity: { label: "Perplexity" },
  cursor: { label: "Cursor (IDE)" },
  copilot: { label: "GitHub Copilot" },
  custom: { label: "Custom / Other" },
};
