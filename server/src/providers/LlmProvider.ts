// import { ToolDefinition as McpToolSchema } from "@modelcontextprotocol/sdk/client/index.js"; // Causes error

// Use 'any' for now until correct type is confirmed
export type McpToolSchema = any; 

//----------------------------------------------------
// Generic Types for LLM Interaction
//----------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

// Represents tool calls requested by the assistant (OpenAI format)
export interface GenericAssistantToolCall {
  id: string;
  type: 'function'; // Primarily for OpenAI compatibility
  function: {
    name: string;
    arguments: string; // JSON string arguments
  };
}

// Represents a generic message in the conversation history
export interface GenericMessage {
  role: MessageRole;
  content: string | null; // Core text content
  tool_call_id?: string; // For tool role messages
  tool_calls?: GenericAssistantToolCall[]; // For assistant role messages requesting tools
  name?: string; // Optional: For tool/function role in OpenAI
}

// Common format for tool calls parsed from LLM responses
export interface ParsedToolCall {
    id: string;       // Tool call ID from the LLM
    name: string;      // Tool name
    input: any;       // Parsed arguments object
}

// Common format for tool execution results to be stored/processed
export interface ToolExecutionResult {
    toolCallId: string; // The ID from the original tool call request
    toolName: string;   // The name of the tool that was called
    output: string;     // The result content (stringified if object/error)
    isError?: boolean;
}

// Represents the structured response from a non-streaming LLM call
export interface ProviderResponse {
    textResponse: string | null;
    requestedToolCalls: ParsedToolCall[];
    rawResponse?: any; // Optional: include raw provider response for debugging
    stopReason?: string | null; // Allow null from Anthropic
}

// Represents a chunk of data received during streaming
export interface StreamChunk {
    type: 'content' | 'tool_start' | 'tool_stop' | 'stop' | 'error' | 'tool_result';
    data: any; // Text chunk, tool info, error message, etc.
    toolCallId?: string;
    toolName?: string;
}

export type StreamCallback = (chunk: StreamChunk) => void;

//----------------------------------------------------
// LLM Provider Interface
//----------------------------------------------------

export interface LlmProvider {
    // Initialize the provider (e.g., setup SDK client)
    // Pass relevant config section instead of the whole global config
    initialize(providerConfig: { apiKey: string, modelName?: string, maxTokens?: number }): void;

    // Generate a response (non-streaming)
    generateResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], // Using alias type
        systemMessage?: string
    ): Promise<ProviderResponse>;

    // Generate a response (streaming)
    streamResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], // Using alias type
        callback: StreamCallback, 
        systemMessage?: string 
    ): Promise<void>; 
    
    // Add executed tool results back into a generic history 
    // specific format needed for the *next* API call
    addToolResultsToHistory(
        history: GenericMessage[], 
        results: ToolExecutionResult[]
    ): GenericMessage[];
} 