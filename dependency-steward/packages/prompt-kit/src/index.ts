import {
  type DependencyCandidate,
  type ManualReviewRecord,
  type PolicyRecord,
  type RepositoryRecord
} from "@dependency-steward/shared";

export interface StructuredGenerationOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface LlmClient {
  generateStructured<T>(options: StructuredGenerationOptions): Promise<T>;
  summarizeText(input: { prompt: string; temperature?: number }): Promise<string>;
  classify(input: { prompt: string; labels: string[]; temperature?: number }): Promise<string>;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function extractJsonCandidate(content: string): string {
  const fenced = content.match(/```json\s*([\s\S]+?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  throw new Error("Model response did not contain a JSON object.");
}

async function callChatCompletion(
  options: ClientOptions,
  messages: ChatMessage[],
  temperature: number
): Promise<string> {
  if (!options.apiKey) {
    throw new Error("OPENAI_API_KEY is required for LLM-backed workflows.");
  }

  const response = await fetch(`${options.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-5.4",
      temperature,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

export function createLlmClient(options: ClientOptions = {}): LlmClient {
  const resolved: ClientOptions = {
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL,
    model: options.model ?? process.env.LLM_MODEL ?? "gpt-5.4"
  };

  return {
    async generateStructured<T>(input: StructuredGenerationOptions): Promise<T> {
      const content = await callChatCompletion(
        resolved,
        [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: `${input.userPrompt}\n\nReturn only valid JSON.` }
        ],
        input.temperature ?? 0.1
      );

      return JSON.parse(extractJsonCandidate(content)) as T;
    },

    async summarizeText(input): Promise<string> {
      return callChatCompletion(
        resolved,
        [{ role: "user", content: input.prompt }],
        input.temperature ?? 0.3
      );
    },

    async classify(input): Promise<string> {
      const result = await callChatCompletion(
        resolved,
        [
          {
            role: "user",
            content: `${input.prompt}\n\nChoose exactly one label from: ${input.labels.join(", ")}. Return only the label.`
          }
        ],
        input.temperature ?? 0
      );

      return result.trim();
    }
  };
}

export function buildTestPlanPrompt(input: {
  repository: RepositoryRecord;
  candidate: DependencyCandidate;
  lowCoverageFiles: string[];
}): string {
  return [
    `Repository: ${input.repository.fullName}`,
    `Dependency candidate: ${input.candidate.packageName} ${input.candidate.currentVersion} -> ${input.candidate.targetVersion}`,
    `Risk tier: ${input.candidate.riskTier}`,
    `Low coverage files: ${input.lowCoverageFiles.join(", ")}`,
    "Produce a deterministic unit-test backfill plan aligned to the repository's existing test conventions.",
    'Return JSON with keys: targetFiles, scenarioList, helperUsage, expectedCoverageAreas.'
  ].join("\n");
}

export function buildPrSummaryPrompt(input: {
  repository: RepositoryRecord;
  policy: PolicyRecord;
  candidate: DependencyCandidate;
  verificationSummary: string;
}): string {
  return [
    `Repository: ${input.repository.fullName}`,
    `Policy min repo coverage: ${input.policy.minRepoCoverage}`,
    `Candidate: ${input.candidate.packageName} ${input.candidate.currentVersion} -> ${input.candidate.targetVersion}`,
    `Risk rationale: ${input.candidate.rationale.join(" ")}`,
    `Verification summary: ${input.verificationSummary}`,
    "Write a concise PR summary with clear reviewer focus and known risks.",
    'Return JSON with keys: title, summary, bulletPoints, reviewerFocus, knownRisks.'
  ].join("\n");
}

export function formatManualReviewNarrative(review: ManualReviewRecord): string {
  return `${review.message} Next action: ${review.nextAction}`;
}