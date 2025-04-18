import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Import Provider classes and the interface/types
import { 
    LlmProvider, 
    GenericMessage, 
    McpToolSchema, 
    StreamCallback, 
    ParsedToolCall, 
    ToolExecutionResult 
} from "./providers/LlmProvider";
import { AnthropicProvider } from "./providers/AnthropicProvider";
import { OpenAIProvider } from "./providers/OpenAIProvider";


//----------------------------------------------------
// MCPClient Class (Refactored - Core Logic)
//----------------------------------------------------

export class MCPClient {
  private mcp: Client;
  private activeProvider!: LlmProvider; // Instance of the active provider (definite assignment in constructor)
  private transport: StdioClientTransport | null = null;
  private toolSchemas: Map<string, McpToolSchema> = new Map(); // Store raw MCP tool schemas (using alias)
  private conversationHistory: GenericMessage[] = []; // Use GenericMessage format
  private chatId: string = '';

  // --- HTML escape functions --- (Keep as is)
  private safeEscapeHtml(str: string): string {
    if (!str) return '';
    const htmlEscaped = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    return htmlEscaped;
  }
  private contentEscapeHtml(str: string): string {
    if (!str) return '';
     return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  private jsonSafeStringify(obj: any, indent: number = 2): string {
    try {
      return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'bigint') return value.toString();
             // Add basic circular reference check
             if (typeof value === 'object' && value !== null) {
                 try {
                     JSON.stringify(value); 
                 } catch (e: any) {
                     if (e.message.includes('circular structure')) return '[Circular Reference]';
                     throw e; // Rethrow other errors
                 }
        }
        return value;
      }, indent);
    } catch (e) {
      console.error("Error stringifying object:", e);
        try { return String(obj); } catch (fallbackError) { return "[Unstringifiable Object]"; }
    }
  }
  // --- End HTML escape functions ---

  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    this._initializeProvider();
  }

  private _initializeProvider() {
        const llmConfig = { 
            apiKey: '', 
            modelName: '', 
            maxTokens: config.model.maxTokens // Use shared maxTokens
        };

        if (config.llmProvider === 'anthropic') {
            if (!config.anthropic.apiKey) throw new Error("Anthropic provider selected but ANTHROPIC_API_KEY is missing.");
            llmConfig.apiKey = config.anthropic.apiKey;
            llmConfig.modelName = config.anthropic.modelName;
            this.activeProvider = new AnthropicProvider();
        } else if (config.llmProvider === 'openai') {
            if (!config.openai.apiKey) throw new Error("OpenAI provider selected but OPENAI_API_KEY is missing.");
            llmConfig.apiKey = config.openai.apiKey;
            llmConfig.modelName = config.openai.modelName;
            this.activeProvider = new OpenAIProvider();
        } else {
            // Defaulting logic
            if (config.openai.apiKey) {
                console.warn(`LLM_PROVIDER ('${config.llmProvider}') is invalid/not set. Defaulting to OpenAI.`);
                config.llmProvider = 'openai';
                llmConfig.apiKey = config.openai.apiKey;
                llmConfig.modelName = config.openai.modelName;
                this.activeProvider = new OpenAIProvider();
            } else if (config.anthropic.apiKey) {
                console.warn(`LLM_PROVIDER ('${config.llmProvider}') is invalid/not set. Defaulting to Anthropic.`);
                config.llmProvider = 'anthropic';
                llmConfig.apiKey = config.anthropic.apiKey;
                llmConfig.modelName = config.anthropic.modelName;
                this.activeProvider = new AnthropicProvider();
            } else {
                throw new Error("No supported LLM provider specified or API key found.");
            }
        }
        this.activeProvider.initialize(llmConfig); // Initialize with collected config
        console.log(`MCPClient initialized with Provider: ${config.llmProvider}`);
    }

  async connectToServer(serverScriptPath?: string) {
    try {
       const mcpScriptPath = serverScriptPath || config.server.mcpServerPath;
       if (!mcpScriptPath) throw new Error("MCP server script path not provided.");
       console.log(`Attempting to connect to MCP server script: ${mcpScriptPath}`);
        
      // --- Logic for finding root dir, loading env, creating transport --- 
      const mcpServerDir = path.dirname(mcpScriptPath);
      // Improved root directory detection
      const mcpRootDir = mcpScriptPath.includes('/dist/') ? mcpScriptPath.substring(0, mcpScriptPath.indexOf('/dist/')) : mcpScriptPath.includes('/src/') ? mcpScriptPath.substring(0, mcpScriptPath.indexOf('/src/')) : path.dirname(mcpServerDir);
      console.log(`Detected MCP Root Directory: ${mcpRootDir}`);
      
      const envPath = path.join(mcpRootDir, '.env');
      const env: Record<string, string> = { ...process.env } as Record<string, string>; // Start with process.env

      if (fs.existsSync(envPath)) {
        console.log('Found MCP .env file, loading variables...');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envLines = envContent.split('\n');
        for (const line of envLines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;
          const match = trimmedLine.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
                    // Only add if not already present in process.env
                    if (!(key in process.env)) { 
                        const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
                        env[key] = value; 
                    }
                }
            }
      } else { console.log('MCP .env file not found, using process env only.'); }

      let command: string; let scriptArgs: string[];
      const isJs = mcpScriptPath.endsWith(".js"), isPy = mcpScriptPath.endsWith(".py"), isSh = mcpScriptPath.endsWith(".sh");
      if (!isJs && !isPy && !isSh) throw new Error("Server script must be .js, .py, or .sh");

      if (isSh) {
          if (process.platform === "win32") throw new Error("Shell scripts not supported on Windows");
        command = process.env.SHELL || "/bin/bash";
          scriptArgs = [mcpScriptPath]; 
      } else if (isPy) {
        command = process.platform === "win32" ? "python" : "python3";
          scriptArgs = [mcpScriptPath]; 
      } else { // JS
          command = process.execPath; // node executable
          scriptArgs = [mcpScriptPath]; 
          console.log(`Executing Node script: ${command} ${scriptArgs.join(' ')} in ${mcpRootDir}`);
      }
       
      this.transport = new StdioClientTransport({ command, args: scriptArgs, env, cwd: mcpRootDir });
        this.mcp.connect(this.transport);
      // --- End Transport Creation ---
      
      const toolsResult = await this.mcp.listTools();

      // --- Load MCP Tool Schemas --- 
      this.toolSchemas.clear();
      const mcpToolsList = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
      mcpToolsList.forEach((tool: McpToolSchema) => {
          try {
              // Perform basic validation on the tool definition received from MCP
              if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') {
                  console.warn(`Skipping tool due to invalid structure or missing name:`, tool);
                  return;
              }
              if (typeof tool.inputSchema !== 'object' || tool.inputSchema === null) {
                   console.warn(`Skipping tool ${tool.name}: inputSchema is missing or not an object.`);
                   return;
              }
              // Further schema validation (e.g., JSON Schema validation) could be added here
              this.toolSchemas.set(tool.name, tool); // Store the whole definition (as McpToolSchema/any)
          } catch (e) {
              console.error(`Failed to process tool schema for ${tool?.name}:`, e);
          }
      });
      console.log(`Loaded ${this.toolSchemas.size} MCP tool schemas.`);
      // --- End Tool Loading ---

      console.log(
        `Connected to MCP server. Using ${config.llmProvider}. Available tools: ${Array.from(this.toolSchemas.keys()).join(', ') || 'None'}`
      );
      return true;

    } catch (e) {
      console.error("Failed to connect to MCP server: ", e);
      await this.disconnectTransport(); // Use helper for cleanup
      return false;
    }
  }

  startNewChat(): string {
    this.conversationHistory = []; // Use generic history
    this.chatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`Starting new chat with ID: ${this.chatId}`);
    return this.chatId;
  }

  // Add messages to history (internal helper)
  private _addHistory(message: GenericMessage) {
      // Optional: Add validation or limit history size
    this.conversationHistory.push(message);
  }

  // --- Refactored Central Query Processing --- 
  async processQuery(query: string, chatId?: string): Promise<string> {
      if (!this.activeProvider) throw new Error("LLM Provider not initialized.");
      if (!this.mcp) throw new Error("MCP Client not initialized.");

    if (chatId && chatId === this.chatId) {
          console.log(`Continuing chat: ${chatId}`);
    } else {
      this.startNewChat();
      }

      // Add user message to generic history
      this._addHistory({ role: "user", content: query });

      try {
          let maxToolRounds = 5; 
          let currentRound = 0;
          let lastTextResponse: string | null = null;

          while (currentRound < maxToolRounds) {
              currentRound++;
              console.log(`MCPClient: LLM Call Round ${currentRound}`);

              // Prepare data for the active provider
              const systemMessage = this._buildSystemMessage(); 
              const mcpToolsArray = Array.from(this.toolSchemas.values()); 
              
              // Generate response using the active provider
              const providerResponse = await this.activeProvider.generateResponse(
                  [...this.conversationHistory], // Pass a copy of history
                  mcpToolsArray,
                  systemMessage
              );
              
              // --- History Update ---
              // 1. Add Assistant's text part (if any)
              if (providerResponse.textResponse !== null) {
                 lastTextResponse = providerResponse.textResponse;
                 this._addHistory({ role: "assistant", content: lastTextResponse });
              }

              // 2. Check for tool calls
              if (providerResponse.requestedToolCalls.length > 0) {
                   console.log(`MCPClient: Tool call(s) requested:`, providerResponse.requestedToolCalls.map(tc => tc.name));
                   
                   // 2a. Add Assistant message requesting the tools
                   this._addHistory({ 
            role: "assistant",
                        content: null, // May be null when requesting tools
                        tool_calls: providerResponse.requestedToolCalls.map(tc => ({ 
                            id: tc.id, 
                            type: 'function', // Use OpenAI's standard format here
                            function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) }
                        })) 
                    });

                  // 2b. Execute tools using MCP
                  const toolResults = await this._executeTools(providerResponse.requestedToolCalls);

                  // 2c. Add results back to generic history using the provider's method
                  // Pass a copy of history *before* adding results, let provider append
                  this.conversationHistory = this.activeProvider.addToolResultsToHistory(
                      [...this.conversationHistory], // Pass current history
                      toolResults
                  );
                  // Loop back for the next LLM call

          } else {
                   // No tool calls requested, this is the final response
                   console.log("MCPClient: No tool calls requested, final response.");
                   return lastTextResponse ?? "(No response content received)";
              }
          } // End while loop

          console.warn("MCPClient: Maximum tool execution rounds reached.");
          return lastTextResponse ?? "(Maximum tool rounds reached, no final content)";

      } catch (error: any) {
          console.error(`MCPClient: Error processing query:`, error);
          const errorDetails = error.message ? `: ${error.message}` : '';
          return `Sorry, an error occurred processing your request${errorDetails}.`;
      }
  }

   // --- Refactored Streaming Query Processing --- 
  async processQueryWithStreaming(
      query: string, 
      callback: StreamCallback, 
      chatId?: string
  ): Promise<void> {
       if (!this.activeProvider) { callback({ type: 'error', data: "LLM Provider not initialized." }); return; }
       if (!this.mcp) { callback({ type: 'error', data: "MCP Client not initialized." }); return; }
       // Check if the *active* provider supports streaming
       if (typeof this.activeProvider.streamResponse !== 'function') { 
           callback({ type: 'error', data: "Streaming not supported by the active provider."}); 
           return; 
       }

    if (chatId && chatId === this.chatId) {
          console.log(`Continuing chat (streaming): ${chatId}`);
    } else {
      this.startNewChat();
      }

      // Add initial user message
      this._addHistory({ role: "user", content: query });

      try {
          let maxToolRounds = 5;
          let currentRound = 0;
          
          while (currentRound < maxToolRounds) {
              currentRound++;
              console.log(`MCPClient: LLM Streaming Call Round ${currentRound}`);

              const systemMessage = this._buildSystemMessage();
              const mcpToolsArray = Array.from(this.toolSchemas.values());
              let requestedToolCalls: ParsedToolCall[] = [];
              let currentRoundText = "";
              let streamClosed = false;
              let finalAssistantMessage: GenericMessage | null = null; // To store the complete msg after stream

              // Promise to manage the stream lifecycle for this round
              const streamPromise = new Promise<void>((resolve, reject) => {
                  let toolCallBuffer: ParsedToolCall[] = []; 
                  
                  this.activeProvider.streamResponse!( // Non-null assertion OK due to check above
                      [...this.conversationHistory], // Pass copy of history
                      mcpToolsArray,
                      (chunk) => { // StreamCallback implementation
                          try {
                              // Pass chunks directly to the original callback
                              callback(chunk);

                             // Accumulate text
                             if (chunk.type === 'content') {
                                 currentRoundText += chunk.data;
                             } 
                             // Buffer tool start info
                             else if (chunk.type === 'tool_start' && chunk.toolCallId) {
                                 const existingCall = toolCallBuffer.find(tc => tc.id === chunk.toolCallId);
                                 if (!existingCall) {
                                      toolCallBuffer.push({ 
                                          id: chunk.toolCallId, 
                                          name: chunk.toolName || 'unknown', 
                                          input: chunk.data?.input || {} 
                                      });
                                 } else if (chunk.toolName && !existingCall.name) {
                                     existingCall.name = chunk.toolName; 
                                 }
                             } 
                             // Stop signal from provider
                             else if (chunk.type === 'stop') {
                                 console.log("MCPClient: Stream stopped by provider.");
                                 requestedToolCalls = toolCallBuffer; // Final tool calls for this round
                                 streamClosed = true;
                                 resolve(); 
                             } 
                             // Error signal from provider
                             else if (chunk.type === 'error') {
                                  console.error("MCPClient: Error chunk from provider:", chunk.data);
                                  streamClosed = true;
                                  reject(new Error(chunk.data || "Provider stream error"));
                             }
                          } catch (cbError) {
                               console.error("MCPClient: Error in stream callback handler:", cbError);
                               streamClosed = true;
                               reject(cbError); 
                          }
                      },
                      systemMessage
                  ).catch(err => { 
                        if (!streamClosed) { 
                            streamClosed = true;
                            reject(err);
                        } 
                  });
              });

              try {
                 await streamPromise; // Wait for stream round to complete or error
              } catch (streamError) {
                  console.error("MCPClient: Stream processing failed for round.", streamError);
                  // Error already sent via callback, break the outer loop
                          break;
              }
              
              // --- Add Assistant Message to History *After* Stream Round --- 
              finalAssistantMessage = { role: "assistant", content: currentRoundText || null };
              if (requestedToolCalls.length > 0) {
                   finalAssistantMessage.tool_calls = requestedToolCalls.map(tc => ({ 
                        id: tc.id, 
                        type: 'function',
                        function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) }
                    }));
              }
              if (finalAssistantMessage.content || finalAssistantMessage.tool_calls?.length) {
                 this._addHistory(finalAssistantMessage);
                      } else {
                   console.warn("MCPClient: Stream round completed without text or tool calls.");
              }


              // --- Tool Execution (if requested) ---
              if (requestedToolCalls.length > 0) {
                  console.log(`MCPClient: Tool call(s) requested (streaming):`, requestedToolCalls.map(tc => tc.name));
                  
                  const toolResults = await this._executeTools(requestedToolCalls);

                  // Add results back to history and notify client
                  // Pass copy of history *before* adding results
                  this.conversationHistory = this.activeProvider.addToolResultsToHistory(
                      [...this.conversationHistory], 
                      toolResults
                  );
                  toolResults.forEach(result => {
                      callback({ type: 'tool_result', data: result, toolCallId: result.toolCallId, toolName: result.toolName });
                  });
                  // Loop back for next LLM call
              } else {
                  // No tool calls, streaming finished (stop chunk already sent)
                  console.log("MCPClient: Streaming finished, no tool calls requested.");
                  break; // Exit the loop
              }
          } // End while loop

           if (currentRound >= maxToolRounds) {
              console.warn("MCPClient: Maximum tool execution rounds reached during streaming.");
              callback({ type: 'error', data: "Maximum tool rounds reached." });
           }

      } catch (error: any) {
          console.error(`MCPClient: Unhandled error in processQueryWithStreaming:`, error);
          callback({ type: 'error', data: `Unexpected streaming error: ${error.message}` });
      }
  }

  // --- Tool Execution (Remains in MCPClient) ---
  private async _executeTools(parsedToolCalls: ParsedToolCall[]): Promise<ToolExecutionResult[]> {
        const results: ToolExecutionResult[] = [];
        console.log(`MCPClient: Executing ${parsedToolCalls.length} tool(s)...`);
        
        for (const toolCall of parsedToolCalls) {
             const { id: toolCallId, name: toolName, input: toolInput } = toolCall;
             let toolResultContent: string;
             let isError = false;

             if (!this.toolSchemas.has(toolName)) {
                 console.error(`Unknown tool requested: ${toolName}`);
                 toolResultContent = `Error: Tool "${toolName}" not found or not available.`;
                 isError = true;
             } else {
                 const toolSchema = this.toolSchemas.get(toolName); // Get schema for potential validation
                 try {
                     console.log(`Calling MCP tool: ${toolName} with input:`, this.jsonSafeStringify(toolInput));
                     // Basic input validation
                      if (typeof toolInput !== 'object' || toolInput === null) {
                          throw new Error(`Tool input must be an object, received ${typeof toolInput}`);
                      }
                     // Optional: Validate toolInput against toolSchema.inputSchema here 

                     const result = await this.mcp.callTool({ name: toolName, arguments: toolInput });
                     console.log(`MCP tool ${toolName} returned result of type: ${typeof result.result}`);
                     
                     // Handle potential non-string results safely
                     if (typeof result.result === 'object' && result.result !== null) {
                        toolResultContent = this.jsonSafeStringify(result.result);
                     } else if (result.result === null || result.result === undefined) {
                         toolResultContent = "(No result returned)";
                     } else {
                        toolResultContent = String(result.result);
                     }

                 } catch (error: any) {
                     console.error(`Error executing tool ${toolName}:`, error);
                     toolResultContent = `Error executing tool ${toolName}: ${error.message || String(error)}`;
                     isError = true;
                 } 
             }
             // Ensure the output sent back is always a string
             results.push({ toolCallId, toolName, output: String(toolResultContent), isError });
        }
        console.log(`MCPClient: Finished executing tools. Results count: ${results.length}`);
        return results;
  }


  // --- Helper to build system message --- 
  private _buildSystemMessage(): string {
     let message = `You are a helpful assistant using the Model Context Protocol (MCP). Current date: ${new Date().toISOString()}.`;
      const toolNames = Array.from(this.toolSchemas.keys());

      if (toolNames.length > 0) {
          message += `\n\nYou have access to the following tools: ${toolNames.join(', ')}.`;
          message += "\nUse the tools provided to answer the user\'s query effectively. Follow the schema for each tool.";
           // Add provider-specific instructions for how to call tools
           if (config.llmProvider === 'openai') {
              message += "\nTo use a tool, respond with a `tool_calls` array containing objects with `id`, `type: \'function\'`, and a `function` object specifying `name` and JSON string `arguments`.";
           } else { // Anthropic (Add others if needed)
              message += "\nTo use a tool, respond with a `content` block of type `tool_use`, specifying the `id`, `name`, and `input` object.";
           }
      } else {
          message += "\nNo external tools are currently available.";
      }
      // Add any other standard instructions here.
      message += "\nRespond in Vietnamese unless otherwise specified by the user or context."; // Example instruction
      return message;
  }


  // --- Other Helper Methods --- 
  isConnected(): boolean { 
      // Connection depends on successful transport setup and tool loading
      return !!this.transport && this.toolSchemas.size > 0; 
  }
  getCurrentChatId(): string { return this.chatId; }
  getConversationHistory(): GenericMessage[] { return [...this.conversationHistory]; } // Return copy
  clearConversationHistory(): void { this.conversationHistory = []; console.log("Conversation history cleared."); }
  
  // Helper to disconnect transport safely
  private async disconnectTransport() {
      if (this.transport) {
            console.log("Disconnecting MCP transport...");
            try { await this.transport.close(); } 
            catch (e) { console.error("Error closing MCP transport:", e); }
             finally { this.transport = null; }
        }
  }

  async disconnect() {
        await this.disconnectTransport();
        // No provider-specific disconnect needed as SDK clients are self-contained
        console.log("MCPClient disconnected.");
  }
} 