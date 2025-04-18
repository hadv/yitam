import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

export class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private toolSchemas: Map<string, any> = new Map();
  private conversationHistory: MessageParam[] = [];
  private chatId: string = '';

  // HTML escape functions for consistent use throughout the class
  private safeEscapeHtml(str: string): string {
    if (!str) return '';
    
    // First encode for HTML display
    const htmlEscaped = String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
      
    return htmlEscaped;
  }
  
  private contentEscapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  private jsonSafeStringify(obj: any, indent: number = 2): string {
    try {
      return JSON.stringify(obj, (key, value) => {
        // Handle special cases for JSON stringification
        if (typeof value === 'string') {
          // Ensure strings are properly escaped but still valid JSON
          return value;
        }
        return value;
      }, indent);
    } catch (e) {
      console.error("Error stringifying object:", e);
      return String(obj);
    }
  }

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      const isSh = serverScriptPath.endsWith(".sh");
      if (!isJs && !isPy && !isSh) {
        throw new Error("Server script must be a .js, .py, or .sh file");
      }

      // Get the MCP server directory
      const mcpServerDir = path.dirname(serverScriptPath);
      const mcpRootDir = serverScriptPath.includes('/dist/') 
        ? serverScriptPath.substring(0, serverScriptPath.indexOf('/dist/'))
        : path.dirname(mcpServerDir);
      
      // Try to load MCP server's .env file
      const envPath = path.join(mcpRootDir, '.env');
      console.log(`Looking for MCP .env file at: ${envPath}`);
      
      // Get the environment variables from the parent process
      const env: Record<string, string> = {};
      
      // Convert any undefined values to empty strings
      Object.entries(process.env).forEach(([key, value]) => {
        env[key] = value || '';
      });
      
      // Add MCP .env file variables if available
      if (fs.existsSync(envPath)) {
        console.log('Found MCP .env file, loading variables...');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
          const trimmedLine = line.trim();
          // Skip comments and empty lines
          if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;
          
          const match = trimmedLine.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^['"](.*)['"]$/, '$1');
            env[key] = cleanValue;
            console.log(`Loaded env var: ${key}`);
          }
        }
      } else {
        console.log('MCP .env file not found');
      }

      let command: string;
      let scriptArgs: string[] = [];

      if (isSh) {
        if (process.platform === "win32") {
          throw new Error("Shell scripts are not supported on Windows");
        }
        command = process.env.SHELL || "/bin/bash";
        scriptArgs = [serverScriptPath];
      } else if (isPy) {
        command = process.platform === "win32" ? "python" : "python3";
        scriptArgs = [serverScriptPath];
      } else {
        command = process.execPath;
        scriptArgs = ["-r", "dotenv/config", serverScriptPath];
      }
      
      // Create the transport with environment variables included
      this.transport = new StdioClientTransport({
        command,
        args: scriptArgs,
        env,
        cwd: mcpRootDir // Set working directory to MCP root
      });
      
      if (this.transport) {
        this.mcp.connect(this.transport);
      } else {
        throw new Error("Failed to create transport connection");
      }
      
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
      // Store the tool schemas for reference during tool calls
      for (const tool of toolsResult.tools) {
        try {
          // Handle both string and object schema formats
          let schema: any;
          if (typeof tool.inputSchema === 'string') {
            schema = JSON.parse(tool.inputSchema);
          } else {
            // If it's already an object, use it directly
            schema = tool.inputSchema;
          }
          this.toolSchemas.set(tool.name, schema);
          console.log(`Loaded schema for tool: ${tool.name}`);
        } catch (e) {
          console.error(`Failed to parse schema for tool ${tool.name}:`, e);
        }
      }

      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );
      return true;
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      return false;
    }
  }

  startNewChat(): string {
    this.conversationHistory = [];
    this.chatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`Starting new chat with ID: ${this.chatId}`);
    return this.chatId;
  }

  addToExistingChat(chatId: string, message: MessageParam): boolean {
    if (this.chatId !== chatId) {
      console.error(`Chat ID mismatch: ${chatId} vs ${this.chatId}`);
      return false;
    }
    this.conversationHistory.push(message);
    return true;
  }

  async processQuery(query: string, chatId?: string): Promise<string> {
    // Check if this is part of an existing chat or a new one
    if (chatId && chatId === this.chatId) {
      console.log(`Adding to existing chat: ${chatId}`);
      this.conversationHistory.push({
        role: "user",
        content: query, // Store original query without escaping for API calls
      });
    } else {
      // Start a new chat with this query
      this.startNewChat();
      console.log(`Starting new chat with query: ${query.substring(0, 50)}...`);
      this.conversationHistory.push({
        role: "user",
        content: query, // Store original query without escaping for API calls
      });
    }
    
    // Use the complete conversation history for context
    const messages = [...this.conversationHistory];
    console.log(`Using conversation history with ${messages.length} messages`);

    try {
      const searchQuery = await this._determineSearchQuery(query);

      // Build a system message that includes available domain information
      const systemMessage = this.buildSystemMessage();

      const response = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: config.model.maxTokens,
        system: systemMessage,
        messages,
        tools: this.tools.length > 0 ? this.tools : undefined,
      });

      const finalText: string[] = [];
      const toolResults: any[] = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
          // Add assistant's response to conversation history
          this.conversationHistory.push({
            role: "assistant",
            content: content.text,
          });
        } else if (content.type === "tool_use") {
          const { toolResult, formattedToolCall } = await this._handleToolUse(content, searchQuery);
          toolResults.push(toolResult);
          finalText.push(formattedToolCall);

          // Add tool use to conversation history
          this.conversationHistory.push({
            role: "assistant",
            content: [{ type: "tool_use", id: content.id, name: content.name, input: content.input }],
          });

          // Add tool result to conversation history
          this.conversationHistory.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: typeof toolResult.content === 'object' 
                  ? JSON.stringify(toolResult.content, null, 2)
                  : String(toolResult.content),
              },
            ],
          });

          const followUpResponse = await this.anthropic.messages.create({
            model: config.model.name,
            max_tokens: config.model.maxTokens,
            system: "You must explicitly reference and incorporate the information from the tool results in your response. Summarize key findings and provide a coherent answer based on the tool outputs. Don't just acknowledge that tools were used - actually use the information they provided. If tool results are large, focus on the most relevant and important information.",
            messages: [...this.conversationHistory], // Use complete history for follow-up
          });

          if (followUpResponse.content && followUpResponse.content.length > 0) {
            if (followUpResponse.content[0].type === "text") {
              finalText.push(followUpResponse.content[0].text);
              // Add follow-up response to conversation history
              this.conversationHistory.push({
                role: "assistant",
                content: followUpResponse.content[0].text,
              });
            }
          } else {
            console.log("Follow-up response has no content");
          }
        }
      }

      return finalText.join("\n");
    } catch (error: any) {
      console.error("Error processing query:", error);
      return "Kính thưa quý khách, hệ thống đang gặp trục trặc kỹ thuật khi xử lý yêu cầu. Xin quý khách vui lòng thử lại sau. Chúng tôi chân thành xin lỗi vì sự bất tiện này.";
    }
  }

  async processQueryWithStreaming(query: string, callback: (chunk: string) => void, chatId?: string): Promise<void> {
    // Escape the query for display purposes only if needed
    const displayChunk = (chunk: string) => {
      // Only escape HTML when sending directly to UI
      callback(this.contentEscapeHtml(chunk));
    };
    
    // Check if this is part of an existing chat or a new one
    if (chatId && chatId === this.chatId) {
      console.log(`Adding to existing chat (streaming): ${chatId}`);
      this.conversationHistory.push({
        role: "user",
        content: query, // Store original query without escaping for API calls
      });
    } else {
      // Start a new chat with this query
      this.startNewChat();
      console.log(`Starting new chat with query (streaming): ${query.substring(0, 50)}...`);
      this.conversationHistory.push({
        role: "user",
        content: query, // Store original query without escaping for API calls
      });
    }
    
    // Use the complete conversation history for context
    const messages = [...this.conversationHistory];
    console.log(`Using conversation history with ${messages.length} messages (streaming)`);

    try {
      const searchQuery = await this._determineSearchQuery(query);

      // Build a system message that includes available domain information
      const systemMessage = this.buildSystemMessage();

      let stream: AsyncIterable<any>;
      try {
        stream = await this.anthropic.messages.stream({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          system: systemMessage,
          messages,
          tools: this.tools.length > 0 ? this.tools : undefined,
        });
      } catch (streamError: any) {
        // Handle stream creation errors separately 
        console.error("Error creating stream:", streamError);
        throw streamError; // Re-throw to be handled by the outer catch
      }

      const toolCalls: Record<string, any> = {};
      let assistantResponse = ""; // Collect the assistant's response for history
      
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            // Send text chunks directly to the client with proper escaping
            displayChunk(chunk.delta.text);
            // Collect the unescaped response for history
            assistantResponse += chunk.delta.text;
          } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
            // Handle tool use
            const toolUse = chunk.content_block;
            toolCalls[toolUse.id] = {
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input
            };
          } else if (chunk.type === 'message_stop') {
            // If we have collected text from the assistant, add it to history
            if (assistantResponse) {
              this.conversationHistory.push({
                role: "assistant",
                content: assistantResponse,
              });
              console.log(`Added assistant text response to history (${assistantResponse.length} chars)`);
            }
            
            // Process all collected tool calls
            for (const toolUseId in toolCalls) {
              try {
                const toolUse = toolCalls[toolUseId];
                const { toolResult, formattedToolCall } = await this._handleToolUse(toolUse, searchQuery);
                
                // Send the formatted tool call to the client
                callback(formattedToolCall);
                
                // Add tool use to conversation history
                this.conversationHistory.push({
                  role: "assistant",
                  content: [{ type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input }],
                });

                // Add tool result to conversation history
                this.conversationHistory.push({
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolUse.id,
                      content: typeof toolResult.content === 'object' 
                        ? JSON.stringify(toolResult.content, null, 2)
                        : String(toolResult.content),
                    },
                  ],
                });
                
                console.log(`Added tool call and result to history for ${toolUse.name}`);
              } catch (toolError) {
                console.error(`Error handling tool call ${toolUseId}:`, toolError);
                callback(`\n\nError executing tool: ${this.contentEscapeHtml(toolError instanceof Error ? toolError.message : String(toolError))}\n\n`);
              }
            }
            
            // If we had tool calls, generate a follow-up response
            if (Object.keys(toolCalls).length > 0) {
              try {
                // Try up to 3 times to get a complete follow-up response
                let retryCount = 0;
                const maxRetries = 2;
                let successfulCompletion = false;
                
                // Keep track of the best response across retries
                let bestResponseBuffer = "";
                let currentResponseBuffer = "";
                
                while (retryCount <= maxRetries && !successfulCompletion) {
                  if (retryCount > 0) {
                    console.log(`Retrying follow-up response (attempt ${retryCount} of ${maxRetries})`);
                    // Reset current buffer for this attempt
                    currentResponseBuffer = "";
                  }
                  
                  try {
                    const followUpStream = await this.anthropic.messages.stream({
                      model: config.model.name,
                      max_tokens: config.model.maxTokens,
                      system: "You must explicitly reference and incorporate the information from the tool results in your response. Summarize key findings and provide a coherent answer based on the tool outputs. Don't just acknowledge that tools were used - actually use the information they provided. Ensure your response is complete - never stop mid-sentence. If tool results are large, focus on the most relevant and important information.",
                      messages: [...this.conversationHistory], // Use the complete history
                    });
                    
                    let hasReceivedContent = false;
                    let isStreamActive = true;
                    let displayBuffer = ""; // For immediate display
                    let lastActivityTime = Date.now();
                    
                    // Set up stream timeout detection with longer duration
                    const streamTimeout = setInterval(() => {
                      const inactivityDuration = Date.now() - lastActivityTime;
                      if (isStreamActive && inactivityDuration > 10000) { // 10 second inactivity check
                        console.warn(`Follow-up stream inactivity detected (${inactivityDuration}ms)`);
                        
                        if (inactivityDuration > 30000) { // 30 second hard timeout
                          console.error("Follow-up stream timed out completely");
                          isStreamActive = false;
                          clearInterval(streamTimeout);
                        }
                      }
                    }, 5000); // Check every 5 seconds
                    
                    try {
                      for await (const followUpChunk of followUpStream) {
                        lastActivityTime = Date.now(); // Update activity timestamp
                        
                        if (followUpChunk.type === 'content_block_delta' && followUpChunk.delta.type === 'text_delta') {
                          hasReceivedContent = true;
                          
                          // Add to both the display buffer and full response buffer
                          const chunkText = followUpChunk.delta.text;
                          displayBuffer += chunkText;
                          currentResponseBuffer += chunkText;
                          
                          // Send content in reasonable chunks to avoid UI lag
                          if (displayBuffer.length > 50 || displayBuffer.includes("\n")) {
                            displayChunk(displayBuffer);
                            displayBuffer = "";
                          }
                        } else if (followUpChunk.type === 'content_block_start' && followUpChunk.content_block.type === 'text') {
                          hasReceivedContent = true;
                        } else if (followUpChunk.type === 'message_stop') {
                          // Message completion - send any remaining display content
                          if (displayBuffer.length > 0) {
                            displayChunk(displayBuffer);
                            displayBuffer = "";
                          }
                          console.log('Follow-up message completed successfully');
                          successfulCompletion = true;
                          
                          // Store this as our best response
                          bestResponseBuffer = currentResponseBuffer;
                          break;
                        }
                      }
                      
                      // If we got here without errors and received content
                      if (hasReceivedContent) {
                        // Check if this response is better than previous attempts
                        if (currentResponseBuffer.length > bestResponseBuffer.length) {
                          bestResponseBuffer = currentResponseBuffer;
                        }
                        
                        // Check if the response appears complete (ends with sentence-ending punctuation)
                        const endsWithPunctuation = /[.!?。？！][\s"']*$/.test(currentResponseBuffer.trim());
                        const hasReasonableLength = currentResponseBuffer.length > 10;
                        
                        if (endsWithPunctuation && hasReasonableLength) {
                          successfulCompletion = true;
                        }
                      }
                      
                    } catch (streamError) {
                      console.error("Follow-up stream processing error:", streamError);
                      // Store this partial response if it's the best we have so far
                      if (currentResponseBuffer.length > bestResponseBuffer.length) {
                        bestResponseBuffer = currentResponseBuffer;
                      }
                    } finally {
                      isStreamActive = false;
                      clearInterval(streamTimeout);
                      
                      // If we didn't receive any content or didn't complete successfully, retry
                      if (!hasReceivedContent || !successfulCompletion) {
                        retryCount++;
                      } else {
                        break; // Success, exit retry loop
                      }
                    }
                  } catch (innerError) {
                    console.error("Error creating follow-up stream:", innerError);
                    retryCount++;
                  }
                }
                
                // If we have a successful response, add it to conversation history
                if (bestResponseBuffer) {
                  this.conversationHistory.push({
                    role: "assistant",
                    content: bestResponseBuffer
                  });
                  console.log(`Added follow-up response to history (${bestResponseBuffer.length} chars)`);
                }
                
                // If we have partial content but no successful completion, check if we can use the best response
                if (!successfulCompletion && bestResponseBuffer.length > 0) {
                  console.log("Using best partial response after all retries");
                  
                  // Apply a simple sentence completion heuristic if it was cut off mid-sentence
                  const lastSentenceBreak = bestResponseBuffer.search(/[.!?。？！][^.!?。？！]*$/);
                  
                  if (lastSentenceBreak !== -1) {
                    // Get the completed portion up to the last sentence end
                    const completedPortion = bestResponseBuffer.substring(0, lastSentenceBreak + 1);
                    
                    // If we have a significant completed portion
                    if (completedPortion.length > bestResponseBuffer.length * 0.7) {
                      // Send a clean, complete response with just the full sentences
                      displayChunk("\n\n[Continuing with complete information]\n" + completedPortion);
                    }
                  }
                }
                
              } catch (followUpError) {
                console.error("Error in follow-up response:", followUpError);
              }
            }
          }
        }
      } catch (streamProcessingError) {
        // Handle errors during stream processing
        console.error("Error processing stream:", streamProcessingError);
        callback("\n\nError while processing the response stream. The connection may have been interrupted.\n\n");
      }
    } catch (error: any) {
      console.error("Error processing query with streaming:", error);
      displayChunk("Kính thưa quý khách, hệ thống đang gặp trục trặc kỹ thuật khi xử lý yêu cầu. Xin quý khách vui lòng thử lại sau. Chúng tôi chân thành xin lỗi vì sự bất tiện này.");
    }
  }

  getTools(): Tool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.transport !== null && this.tools.length > 0;
  }

  private async _handleToolUse(
    content: { name: string; input: any; id: string },
    searchQuery: string
  ): Promise<{ toolResult: any; formattedToolCall: string }> {
    const toolName = content.name;
    const toolArgs = content.input as { [x: string]: unknown } | undefined;

    // Ensure we have valid arguments
    if (!toolArgs) {
      throw new Error(`No arguments provided for tool: ${toolName}`);
    }

    // Get the tool schema if available
    const toolSchema = this.toolSchemas.get(toolName);
    
    // If we have a schema, use it to validate and provide defaults
    if (toolSchema && toolSchema.properties) {
      // Check for search query parameters that might benefit from the extracted search query
      const queryParams = ['query', 'search', 'q', 'searchTerm']; 
      
      for (const paramName of Object.keys(toolSchema.properties)) {
        // If it's a query parameter, ensure it has a value
        if (queryParams.includes(paramName.toLowerCase())) {
          if (!toolArgs[paramName] && typeof toolArgs[paramName] !== 'boolean') {
            console.log(`Tool ${toolName} is missing ${paramName} parameter, using extracted search query`);
            toolArgs[paramName] = searchQuery || "general information";
          } else if (typeof toolArgs[paramName] === 'string') {
            // If query exists but might benefit from the extracted version
            const originalQuery = toolArgs[paramName] as string;
            if (searchQuery && searchQuery !== originalQuery && originalQuery === content.input[paramName]) {
              console.log(`Modified tool query parameter ${paramName}: "${originalQuery}" -> "${searchQuery}"`);
              toolArgs[paramName] = searchQuery;
            }
          }
        } 
        
        // If required parameters are missing but have defaults in the schema, add them
        if (toolSchema.required?.includes(paramName) && 
            (toolArgs[paramName] === undefined || toolArgs[paramName] === null)) {
            
          const paramSchema = toolSchema.properties[paramName];
          if (paramSchema.default !== undefined) {
            console.log(`Adding default value for required parameter ${paramName}: ${paramSchema.default}`);
            toolArgs[paramName] = paramSchema.default;
          }
        }
      }
      
      // Add limit parameter based on schema information, not tool name
      if (toolSchema.properties.limit && !toolArgs.limit && typeof toolArgs.limit !== 'number') {
        // Log what limit was explicitly set by the LLM, if any
        if (content.input.limit !== undefined) {
          console.log(`Using LLM-specified limit for ${toolName}: ${content.input.limit}`);
        } else {
          console.log(`LLM did not specify limit for ${toolName}, using schema default`);
          toolArgs.limit = toolSchema.properties.limit.default || 10;
        }
      }
    }

    // Set maximum result size limits - increased for larger tool outputs
    const maxResultLength = 1000000; // 1MB max for tool results
    
    // Log the tool call for debugging
    console.log(`Calling tool: ${toolName} with args:`, JSON.stringify(toolArgs, null, 2));

    try {
      const toolResult = await this.mcp.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      
      // Convert result content to string and escape HTML
      let resultContent = typeof toolResult.content === 'object' 
        ? this.jsonSafeStringify(toolResult.content)
        : String(toolResult.content);
      
      // Check if the result is very large
      const isLargeResult = resultContent.length > maxResultLength;
      if (isLargeResult) {
        console.warn(`Large tool result (${resultContent.length} chars) will be truncated`);
        resultContent = resultContent.substring(0, maxResultLength) + 
          "\n\n[Note: The complete result was too large to display in full. This is a truncated version.]";
      }
      
      // Apply appropriate escaping based on context
      const escapedToolName = this.safeEscapeHtml(toolName);
      const escapedContent = this.contentEscapeHtml(resultContent);
      
      // For JSON content, we need to ensure it's valid after escaping
      let escapedArgs;
      try {
        const argsJson = this.jsonSafeStringify(toolArgs);
        escapedArgs = this.contentEscapeHtml(argsJson);
      } catch (e) {
        console.error("Error preparing tool arguments for display:", e);
        escapedArgs = this.contentEscapeHtml(String(toolArgs));
      }
      
      // Format tool call as a collapsible component with properly escaped content
      // Use single quotes for HTML attributes to avoid conflict with content double quotes
      const formattedToolCall = `<tool-call data-expanded='false' data-tool='${escapedToolName}'>
  <tool-header>Called MCP Tool: ${escapedToolName}</tool-header>
  <tool-content>
    <tool-args>${escapedArgs}</tool-args>
    <tool-result>${escapedContent}</tool-result>
  </tool-content>
</tool-call>`;

      return { toolResult, formattedToolCall };
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      
      // Create a formatted error response with properly escaped content
      const errorMessage = error instanceof Error ? error.message : String(error);
      const escapedToolName = this.safeEscapeHtml(toolName);
      const escapedErrorMsg = this.contentEscapeHtml(errorMessage);
      
      // For JSON content, ensure it's valid after escaping
      let escapedArgs;
      try {
        const argsJson = this.jsonSafeStringify(toolArgs);
        escapedArgs = this.contentEscapeHtml(argsJson);
      } catch (e) {
        console.error("Error preparing error arguments for display:", e);
        escapedArgs = this.contentEscapeHtml(String(toolArgs));
      }
      
      const formattedToolCall = `<tool-call data-expanded='true' data-tool='${escapedToolName}' data-error='true'>
  <tool-header>Error Calling MCP Tool: ${escapedToolName}</tool-header>
  <tool-content>
    <tool-args>${escapedArgs}</tool-args>
    <tool-result>Error: ${escapedErrorMsg}</tool-result>
  </tool-content>
</tool-call>`;
      
      // Return an error result that can still be displayed to the user
      return { 
        toolResult: { content: `Error: ${errorMessage}` }, 
        formattedToolCall 
      };
    }
  }

  private async _determineSearchQuery(query: string): Promise<string> {
    const extractionResponse = await this.anthropic.messages.create({
      model: config.model.name,
      max_tokens: 150,
      system: "Extract the core search intent from the user's message. Return only the essential keywords or a concise search query that would be effective for vector search, without any commentary or explanation. Focus on domain-specific terminology or key concepts.",
      messages: [{
        role: "user",
        content: query
      }]
    });

    if (extractionResponse.content[0]?.type === "text") {
      const extractedText = extractionResponse.content[0].text.trim();
      if (extractedText && extractedText.length > 0 && extractedText.length < query.length) {
        console.log(`Original query: "${query}"`);
        console.log(`Extracted search query: "${extractedText}"`);
        return extractedText;
      }
    }
    return query;
  }

  // Helper method to build appropriate system message
  private buildSystemMessage(): string {
    return "You have access to various tools through the Model Context Protocol. Follow each tool's schema and provide all required parameters. For search-related tools, use reasonable limits where appropriate.";
  }

  // Get the current chat ID
  getCurrentChatId(): string {
    return this.chatId;
  }
  
  // Get the conversation history for the current chat
  getConversationHistory(): MessageParam[] {
    return [...this.conversationHistory];
  }
  
  // Clear the current conversation history
  clearConversationHistory(): void {
    this.conversationHistory = [];
    console.log(`Cleared conversation history for chat ${this.chatId}`);
  }
} 