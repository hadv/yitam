import OpenAI from 'openai';
import { 
  ChatCompletionTool as OpenAITool, 
  ChatCompletionMessageParam as OpenAIMessageParam, 
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart
} from 'openai/resources/chat/completions';

// Import interfaces and types from LlmProvider.ts
import {
    LlmProvider,
    GenericMessage,
    GenericAssistantToolCall,
    McpToolSchema,
    ProviderResponse,
    StreamCallback,
    ParsedToolCall,
    ToolExecutionResult
} from "./LlmProvider";

// Assuming TextBlock and ToolUseBlock might be needed for type casting during conversion
// Import them if necessary, or remove if conversion logic avoids direct use.
// For simplicity, let's omit them for now unless errors arise.
// import { TextBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

//----------------------------------------------------
// OpenAI Provider Implementation
//----------------------------------------------------

export class OpenAIProvider implements LlmProvider {
    private openai!: OpenAI; // Definite assignment
    private modelName!: string;
    private maxTokens!: number;

    constructor() { /* Initialization in initialize */ }

    initialize(providerConfig: { apiKey: string, modelName?: string, maxTokens?: number }) {
        if (!providerConfig || !providerConfig.apiKey) {
            throw new Error("OpenAI API key is required for initialization.");
        }
        this.openai = new OpenAI({ apiKey: providerConfig.apiKey });
        this.modelName = providerConfig.modelName || 'gpt-4-turbo-preview';
        this.maxTokens = providerConfig.maxTokens || 4096;
        console.log(`OpenAIProvider initialized. Model: ${this.modelName}, Max Tokens: ${this.maxTokens}`);
    }

     // --- Helper to format MCP Tools for OpenAI --- 
    private _formatToolsForOpenAI(mcpTools: McpToolSchema[]): OpenAITool[] {
        return (mcpTools || []).map(tool => {
             if (!tool || typeof tool.name !== 'string' || typeof tool.inputSchema !== 'object' || tool.inputSchema === null) {
                console.warn("Skipping invalid MCP tool format for OpenAI:", tool);
                return null;
            }
            if (typeof tool.inputSchema.type !== 'string') {
                 console.warn(`Skipping tool ${tool.name}: inputSchema lacks a 'type' property.`);
                 return null;
            }
            return {
                type: "function",
                function: {
                    name: tool.name,
                    description: tool.description || `Execute ${tool.name}`,
                    parameters: tool.inputSchema,
                },
            };
        }).filter(tool => tool !== null) as OpenAITool[];
    }

    // --- Helper to prepare generic messages for OpenAI API --- 
    private _prepareMessagesForOpenAI(messages: GenericMessage[], systemMessage?: string): OpenAIMessageParam[] {
        let apiMessages: OpenAIMessageParam[] = [];
        
        if (systemMessage) {
            apiMessages.push({ role: "system", content: systemMessage });
        }

        messages.forEach(msg => {
            if (msg.role === 'system') return; // Handled above

            // Convert Anthropic formats if present
            if (msg.role === 'assistant' && typeof msg.content === 'object' && msg.content !== null && Array.isArray(msg.content)) {
                // Convert Anthropic block content (array) to OpenAI string/tool_calls
                let textContent = "";
                let toolCalls: GenericAssistantToolCall[] | undefined = undefined;
                // Use 'any' temporarily for block typing if TextBlock/ToolUseBlock imports are avoided
                for (const block of (msg.content as any[])) { 
                    if (block.type === 'text') {
                        textContent += block.text;
                    } else if (block.type === 'tool_use') {
                         if (!toolCalls) toolCalls = [];
                         toolCalls.push({
                             id: block.id,
                             type: 'function', // Ensure type is included
                             function: { name: block.name, arguments: JSON.stringify(block.input || {}) } 
                         });
                    }
                }
                 const openAiMsg: OpenAIMessageParam = { role: 'assistant', content: textContent || null };
                 if (toolCalls) {
                      (openAiMsg as ChatCompletionAssistantMessageParam).tool_calls = toolCalls;
                 }
                 apiMessages.push(openAiMsg);

            } else if (msg.role === 'user' && typeof msg.content === 'object' && msg.content !== null && Array.isArray(msg.content)) {
                 // Convert Anthropic user message with tool_result block
                 let textFromBlocks = "";
                 let convertedToolResult = false;
                  for (const block of (msg.content as any[])) {
                      if (block.type === 'tool_result') {
                         apiMessages.push({ 
                              role: 'tool', 
                              tool_call_id: block.tool_use_id || 'unknown_tool_call_id',
                              content: String(block.content || "") 
                          } as ChatCompletionToolMessageParam);
                          convertedToolResult = true;
                      } else if (block.type === 'text') {
                           textFromBlocks += block.text + " "; 
                      }
                  }
                  if (!convertedToolResult && textFromBlocks.trim()) {
                      apiMessages.push({ role: 'user', content: textFromBlocks.trim() });
                  }
            } else if (msg.role === 'tool') {
                 if (!msg.tool_call_id) {
                     console.warn("Skipping tool message without tool_call_id:", msg);
                     return; 
                 }
                apiMessages.push({ 
                    role: 'tool',
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                    tool_call_id: msg.tool_call_id 
                });
            } else if ((msg.role === 'user' || msg.role === 'assistant') && (typeof msg.content === 'string' || msg.content === null)) {
                  // Pass through standard user/assistant messages
                 const messageToSend = { ...msg } as OpenAIMessageParam;
                 // Ensure tool_calls are correctly formatted if they exist on a generic assistant message
                 if (msg.role === 'assistant' && msg.tool_calls) {
                     (messageToSend as ChatCompletionAssistantMessageParam).tool_calls = msg.tool_calls.map(tc => ({
                         id: tc.id, 
                         type: 'function', // Ensure type: 'function' is present
                         function: tc.function 
                     }));
                 }
                 apiMessages.push(messageToSend);
            } else {
                 console.warn("Skipping message with incompatible format for OpenAI:", msg);
            }
        });
        return apiMessages;
    }

    async generateResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], 
        systemMessage?: string
    ): Promise<ProviderResponse> {
        if (!this.openai) throw new Error("OpenAIProvider not initialized.");

        const apiMessages = this._prepareMessagesForOpenAI(messages, systemMessage);
        const apiTools = this._formatToolsForOpenAI(mcpTools);
        
        console.log(`OpenAI Request: ${apiMessages.length} messages, ${apiTools.length} tools.`);

        const response = await this.openai.chat.completions.create({
            model: this.modelName,
            max_tokens: this.maxTokens,
            messages: apiMessages,
            tools: apiTools.length > 0 ? apiTools : undefined,
            tool_choice: apiTools.length > 0 ? "auto" : undefined,
        });

        let responseText: string | null = null;
        let requestedToolCalls: ParsedToolCall[] = [];

        const message = response.choices[0]?.message;
        responseText = message?.content ?? null;
        if (message?.tool_calls) {
            requestedToolCalls = message.tool_calls.map((tc: any) => {
                try {
                     if (!tc.id || !tc.function?.name) return null; 
                    return {
                        id: tc.id,
                        name: tc.function.name,
                        input: JSON.parse(tc.function.arguments || '{}') 
                    };
                } catch (e) { /* ... error handling ... */ return null; }
            }).filter(tc => tc !== null) as ParsedToolCall[];
        }

        return {
            textResponse: responseText,
            requestedToolCalls,
            stopReason: response.choices[0]?.finish_reason,
            rawResponse: response, 
        };
    }

    async streamResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], 
        callback: StreamCallback,
        systemMessage?: string
    ): Promise<void> {
       if (!this.openai) throw new Error("OpenAIProvider not initialized for streaming.");

        const apiMessages = this._prepareMessagesForOpenAI(messages, systemMessage);
        const apiTools = this._formatToolsForOpenAI(mcpTools);
        let stream;

       try {
            console.log(`OpenAI Streaming Request: ${apiMessages.length} messages, ${apiTools.length} tools.`);
            stream = await this.openai.chat.completions.create({
                model: this.modelName,
                max_tokens: this.maxTokens,
                messages: apiMessages,
                tools: apiTools.length > 0 ? apiTools : undefined,
                tool_choice: apiTools.length > 0 ? "auto" : undefined,
                stream: true,
            });
        } catch (initError: any) {
             console.error("Error initiating OpenAI stream:", initError);
             callback({ type: 'error', data: `Stream initiation failed: ${initError.message}` });
             return;
        }

        try {
            let currentToolCallDeltas: Record<number, { id?: string; name?: string; arguments?: string }> = {};

            for await (const chunk of stream) {
                const choice = chunk.choices[0];
                const delta = choice?.delta;
                const finishReason = choice?.finish_reason;

                if (delta?.content) {
                    callback({ type: 'content', data: delta.content });
                }
                
                if (delta?.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                        const index = toolCallDelta.index ?? 0; 
                        if (currentToolCallDeltas[index] === undefined) {
                             currentToolCallDeltas[index] = {};
                        }
                        const currentDeltaAccumulator = currentToolCallDeltas[index];
                        let started = false;
                        if (toolCallDelta.id) {
                            if (!currentDeltaAccumulator.id) started = true; 
                            currentDeltaAccumulator.id = toolCallDelta.id;
                        }
                        if (toolCallDelta.function?.name) {
                            if(!currentDeltaAccumulator.name && currentDeltaAccumulator.id) started = true; 
                            currentDeltaAccumulator.name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function?.arguments) {
                            currentDeltaAccumulator.arguments = (currentDeltaAccumulator.arguments || "") + toolCallDelta.function.arguments;
                        }
                        if (started && currentDeltaAccumulator.id) {
                            callback({ 
                                type: 'tool_start', 
                                toolCallId: currentDeltaAccumulator.id, 
                                toolName: currentDeltaAccumulator.name,
                                data: { id: currentDeltaAccumulator.id, name: currentDeltaAccumulator.name }
                            });
                        }
                    }
                }

                if (finishReason) {
                    console.log(`OpenAI stream finished. Reason: ${finishReason}`);
                    if (finishReason === 'tool_calls') {
                        Object.values(currentToolCallDeltas).forEach(tc => {
                            if (tc.id) { 
                                callback({ type: 'tool_stop', toolCallId: tc.id, data: {} }); 
                            }
                        });
                    }
                    callback({ type: 'stop', data: { reason: finishReason } });
                    break; 
                }
            }
        } catch (streamError: any) {
             console.error("Error during OpenAI stream iteration:", streamError);
             callback({ type: 'error', data: streamError.message || "Error processing stream events" });
        }
    }

    addToolResultsToHistory(history: GenericMessage[], results: ToolExecutionResult[]): GenericMessage[] {
        const newHistory = [...history];
        results.forEach(result => {
             newHistory.push({ 
                role: 'tool',
                tool_call_id: result.toolCallId, 
                content: result.output, 
            });
        });
        return newHistory;
    }
} 