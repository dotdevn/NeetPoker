import openai from "./assets/brands/openai.jpg";
import anthropic from "./assets/brands/anthropic.png";
import google from "./assets/brands/google.jpeg";
import mistral from "./assets/brands/mistral.png";
import deepseek from "./assets/brands/deepseek.png";
import xai from "./assets/brands/xai.png";

/** Maps PokerTable agent id → brand image key */
export const agentToBrand: Record<string, string> = {
  grok: "xai",
  "gpt": "openai",
  gemini: "google",
  claude: "anthropic",
  mistral: "mistral",
  deepseek: "deepseek",
};

const byBrand: Record<string, string> = {
  openai,
  anthropic,
  google,
  mistral,
  deepseek,
  xai,
};

export function brandImageForAgent(agentId: string): string {
  const k = agentToBrand[agentId] ?? "openai";
  return byBrand[k] ?? openai;
}
