export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  model: string;
  system?: string;
  messages: LlmMessage[];
  tools?: ToolDef[];
  max_tokens: number;
}

export interface LlmResponse {
  content: ContentBlock[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  /** Cost of the original live call (replayed responses carry the recorded cost). */
  costUsd: number;
  latencyMs: number;
}

export type Purpose = 'intent_labels' | 'tiebreak' | 'scratch_agent';

/** What a live call returns; the client adds cost and bookkeeping. */
export type Transport = (req: LlmRequest) => Promise<{ content: ContentBlock[]; stopReason: string; inputTokens: number; outputTokens: number }>;

export function textOf(res: LlmResponse): string {
  return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}
