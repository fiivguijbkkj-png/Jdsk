export type ReasoningMode = "fast" | "balanced" | "deep";

export type PersonaId =
  | "general"
  | "coder"
  | "writer"
  | "tutor"
  | "strategist";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 without data-url prefix
  previewUrl?: string; // object or data url for images
  size: number;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  status?: string;
  attachments?: Attachment[];
  sources?: GroundingSource[];
  createdAt: number;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  personaId: PersonaId;
  mode: ReasoningMode;
  webSearch: boolean;
  pinned?: boolean;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  shortDesc: string;
  systemInstruction: string;
  starters: {
    title: string;
    prompt: string;
  }[];
}
