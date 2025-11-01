export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model",
    name: "GPT-5 Mini",
    description: "Fast, balanced performance for general chat and tool calling (80% performance, 20% cost)",
  },
  {
    id: "chat-model-reasoning",
    name: "GPT-5",
    description:
      "Maximum capability for complex reasoning tasks and advanced problem-solving",
  },
];
