import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam as AnthropicMessageParam, 
  Tool as AnthropicTool,
  ToolUseBlock,
  TextBlock,
  MessageStreamEvent,
  ContentBlockDeltaEvent,
  ContentBlockStartEvent,
  ContentBlockStopEvent,
  MessageStartEvent,
  MessageDeltaEvent,
  MessageStopEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// Import interfaces and types from LlmProvider.ts
import {
    LlmProvider,
    GenericMessage,
    McpToolSchema,
    ProviderResponse,
    StreamCallback,
    ParsedToolCall,
    ToolExecutionResult
} from "./LlmProvider";

//----------------------------------------------------
// Anthropic Provider Implementation
//----------------------------------------------------

export class AnthropicProvider implements LlmProvider {
    private anthropic!: Anthropic; // Definite assignment in initialize
    private modelName!: string;
    private maxTokens!: number;

    constructor() { /* Initialization in initialize */ }

    initialize(providerConfig: { apiKey: string, modelName?: string, maxTokens?: number }) {
        if (!providerConfig || !providerConfig.apiKey) {
            throw new Error("Anthropic API key is required for initialization.");
        }
        this.anthropic = new Anthropic({ apiKey: providerConfig.apiKey });
        // Use provided model name and maxTokens or fall back to defaults
        this.modelName = providerConfig.modelName || 'claude-3-opus-20240229'; 
        this.maxTokens = providerConfig.maxTokens || 4096;
        console.log(`AnthropicProvider initialized. Model: ${this.modelName}, Max Tokens: ${this.maxTokens}`);
    }

    // --- Helper to format MCP Tools for Anthropic --- 
    private _formatToolsForAnthropic(mcpTools: McpToolSchema[]): AnthropicTool[] {
        return (mcpTools || []).map(tool => {
            if (!tool || typeof tool.name !== 'string' || typeof tool.inputSchema !== 'object' || tool.inputSchema === null) {
                console.warn("Skipping invalid MCP tool format for Anthropic:", tool);
                return null;
            }
             // Ensure inputSchema has type property
            if (typeof tool.inputSchema.type !== 'string') {
                 console.warn(`Skipping tool ${tool.name}: inputSchema lacks a 'type' property.`);
                 return null;
            }
            return {
                name: tool.name,
                description: tool.description || `Execute ${tool.name}`,
                input_schema: tool.inputSchema, 
            };
        }).filter(tool => tool !== null) as AnthropicTool[]; 
    }

    // --- Helper to prepare generic messages for Anthropic API --- 
    private _prepareMessagesForAnthropic(messages: GenericMessage[]): AnthropicMessageParam[] {
         return messages.map(msg => {
             if (msg.role === 'tool') {
                  // Convert OpenAI tool result to Anthropic user/tool_result message
                   let toolResultContent: any = {}; 
                   try {
                        // Attempt to parse the stringified content from GenericMessage
                       if(typeof msg.content === 'string') {
                           toolResultContent = JSON.parse(msg.content);
                       } else {
                           toolResultContent = msg.content; // Use as is if not string (should be unlikely)
                       }
                   } catch (e) {
                        console.warn("Could not parse tool result content for Anthropic, using raw string:", msg.content);
                        toolResultContent = [{ type: 'text', text: msg.content || "" }]; // Fallback to text block
                   }
                   // Ensure content is an array for Anthropic
                   const finalContentArray = Array.isArray(toolResultContent) ? toolResultContent : [toolResultContent];
                   
                  return { 
                       role: 'user', 
                       content: finalContentArray
                   } as AnthropicMessageParam;
             } else if (msg.role === 'assistant' && msg.tool_calls) {
                 // Convert OpenAI assistant tool_calls request to Anthropic tool_use block
                 const blocks: (TextBlock | ToolUseBlock)[] = [];
                 if (msg.content) blocks.push({ type: 'text', text: msg.content, citations: null });
                 msg.tool_calls.forEach(tc => {
                     try {
                         blocks.push({ 
                             type: 'tool_use', 
                             id: tc.id, 
                             name: tc.function.name, 
                             input: JSON.parse(tc.function.arguments || '{}') 
                         });
                     } catch (e) { /* ... error handling ... */ }
                 });
                 return blocks.length > 0 ? { role: 'assistant', content: blocks } : null;
             } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
                 return { ...msg, content: [{ type: 'text', text: msg.content, citations: null }] };
             } else if (msg.role === 'user' && typeof msg.content === 'string') {
                 return { ...msg, content: [{ type: 'text', text: msg.content }] };
             } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                 // Assume it's already Anthropic block format
                 // Validate block structure? For now, cast.
                 return msg as AnthropicMessageParam; 
             } else if (msg.role === 'user' && Array.isArray(msg.content)) {
                  // Assume it's already Anthropic block format (e.g. tool_result)
                  return msg as AnthropicMessageParam;
             }
             return null; // Ignore system messages and others
         }).filter(msg => msg !== null && msg.content !== undefined) as AnthropicMessageParam[];
    }

    async generateResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], 
        systemMessage?: string
    ): Promise<ProviderResponse> {
        if (!this.anthropic) throw new Error("AnthropicProvider not initialized.");

        const apiMessages = this._prepareMessagesForAnthropic(messages.filter(m => m.role !== 'system')); 
        const apiTools = this._formatToolsForAnthropic(mcpTools);
        
        console.log(`Anthropic Request: ${apiMessages.length} messages, ${apiTools.length} tools. System: ${!!systemMessage}`);

        const response = await this.anthropic.messages.create({
            model: this.modelName, // Use initialized model name
            max_tokens: this.maxTokens, // Use initialized max tokens
            system: systemMessage,
            messages: apiMessages,
            tools: apiTools.length > 0 ? apiTools : undefined,
        });

        console.log("Anthropic Raw Response Stop Reason:", response.stop_reason);

        let responseText: string | null = null;
        let requestedToolCalls: ParsedToolCall[] = [];

        if (response.content) {
            for (const contentBlock of response.content) {
                if (contentBlock.type === 'text') {
                    responseText = (responseText || "") + contentBlock.text;
                } else if (contentBlock.type === 'tool_use') {
                    requestedToolCalls.push({
                        id: contentBlock.id,
                        name: contentBlock.name,
                        input: contentBlock.input,
                    });
                }
            }
        }

        return {
            textResponse: responseText,
            requestedToolCalls,
            stopReason: response.stop_reason,
            rawResponse: response, 
        };
    }

    async streamResponse(
        messages: GenericMessage[], 
        mcpTools: McpToolSchema[], 
        callback: StreamCallback,
        systemMessage?: string
    ): Promise<void> {
        if (!this.anthropic) throw new Error("AnthropicProvider not initialized for streaming.");

        const apiMessages = this._prepareMessagesForAnthropic(messages.filter(m => m.role !== 'system'));
        const apiTools = this._formatToolsForAnthropic(mcpTools);
        let stream;

        try {
             console.log(`Anthropic Streaming Request: ${apiMessages.length} messages, ${apiTools.length} tools. System: ${!!systemMessage}`);
             stream = await this.anthropic.messages.stream({
                model: this.modelName,
                max_tokens: this.maxTokens,
                system: systemMessage,
                messages: apiMessages,
                tools: apiTools.length > 0 ? apiTools : undefined,
            });
        } catch (initError: any) {
             console.error("Error initiating Anthropic stream:", initError);
             callback({ type: 'error', data: `Stream initiation failed: ${initError.message}` });
             return;
        }

        try {
            for await (const event of stream) {
                 if (this.isContentBlockDeltaEvent(event) && event.delta.type === 'text_delta') {
                    callback({ type: 'content', data: event.delta.text });
                } else if (this.isContentBlockStartEvent(event) && event.content_block.type === 'tool_use') {
                    const toolUse = event.content_block;
                    callback({ 
                        type: 'tool_start', 
                        toolCallId: toolUse.id,
                        toolName: toolUse.name,
                        data: { name: toolUse.name, input: toolUse.input }
                    });
                } else if (this.isContentBlockStopEvent(event)) {
                     // Optional
                } else if (this.isMessageStopEvent(event)) {
                    console.log(`Anthropic stream finished.`);
                    callback({ type: 'stop', data: { reason: 'unknown' } }); 
                }
            }
        } catch (streamError: any) {
             console.error("Error during Anthropic stream iteration:", streamError);
             callback({ type: 'error', data: streamError.message || "Error processing stream events" });
        }
    }
    
    // --- Type guards for Anthropic stream events ---
    private isContentBlockDeltaEvent(event: MessageStreamEvent): event is ContentBlockDeltaEvent { return event.type === 'content_block_delta'; }
    private isContentBlockStartEvent(event: MessageStreamEvent): event is ContentBlockStartEvent { return event.type === 'content_block_start'; }
    private isContentBlockStopEvent(event: MessageStreamEvent): event is ContentBlockStopEvent { return event.type === 'content_block_stop'; }
    private isMessageStopEvent(event: MessageStreamEvent): event is MessageStopEvent { return event.type === 'message_stop'; }

    addToolResultsToHistory(history: GenericMessage[], results: ToolExecutionResult[]): GenericMessage[] {
        const newHistory = [...history]; 
        results.forEach(result => {
            // Construct the Anthropic tool_result content block
            const toolResultBlock = {
                type: 'tool_result',
                tool_use_id: result.toolCallId,
                content: result.output, // The output string
                is_error: result.isError ?? false 
            };
            newHistory.push({ 
                role: 'user', 
                // Content needs to be an array containing the block
                content: JSON.stringify([toolResultBlock]) // Store as stringified JSON array for GenericMessage compatibility
            });
        });
        return newHistory;
    }
} 