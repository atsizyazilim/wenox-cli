import type { ToolArgs, ToolResult } from "./tools.js";
import type { TranscriptMeta } from "./session.js";

// Ajanın arayüze konuştuğu sözleşme. Her olay opsiyonel: hem düz terminal
// sink'i (ui.ts) hem TUI sink'i (tui/app.tsx) bunu uygular, ikisi de
// ilgilenmediği olayı atlar.

export interface AskPermissionRequest {
  tool: string;
  path: unknown;
  resolved: string;
  grant: string;
  pattern: string;
}

export type PermissionDecision = "once" | "always" | "reject";

export interface AskUserOption {
  label?: string;
  description?: string;
}

export interface AskUserRequest {
  question: string;
  options: AskUserOption[];
}

export interface AskUserAnswer {
  answer: string;
  cancelled?: boolean;
}

export interface Sink {
  thinking?(label: string): void;
  assistantUpdate?(content: string): void;
  assistantEnd?(content: string, meta?: TranscriptMeta): void;
  assistantClear?(): void;
  toolCall?(name: string, args: ToolArgs): void;
  toolResult?(name: string, result: ToolResult): void;
  info?(text: string): void;
  error?(text: string): void;
  askPermission?(request: AskPermissionRequest): Promise<PermissionDecision>;
  askUser?(request: AskUserRequest): Promise<AskUserAnswer>;
  askApproval?(command: string): Promise<boolean>;
}
