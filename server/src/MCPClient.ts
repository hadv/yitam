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

  async processQuery(query: string): Promise<string> {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    try {
      const searchQuery = await this._determineSearchQuery(query);

      const response = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: config.model.maxTokens,
        messages,
        tools: this.tools.length > 0 ? this.tools : undefined,
      });

      const finalText: string[] = [];
      const toolResults: any[] = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          const { toolResult, formattedToolCall } = await this._handleToolUse(content, searchQuery);
          toolResults.push(toolResult);
          finalText.push(formattedToolCall);

          messages.push({
            role: "assistant",
            content: [{ type: "tool_use", id: content.id, name: content.name, input: content.input }],
          });

          messages.push({
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
            messages,
          });

          if (followUpResponse.content && followUpResponse.content.length > 0) {
            if (followUpResponse.content[0].type === "text") {
              finalText.push(followUpResponse.content[0].text);
            }
          } else {
            console.log("Follow-up response has no content");
          }
        }
      }

      return finalText.join("\n");
    } catch (error: any) {
      console.error("Error processing query:", error);
      
      // Check for specific error types
      if (error?.status === 529 || (error?.error?.type === "overloaded_error")) {
        return "Claude API is currently experiencing high traffic. Please try again in a few moments.";
      } else if (error?.status === 400) {
        return "Sorry, there was an error processing your request. The input may be too long or contain unsupported content.";
      } else if (error?.status === 401) {
        return "Authentication error. Please check your API key configuration.";
      } else if (error?.status === 429) {
        return "Rate limit exceeded. Please try again later.";
      } else {
        // Default error message
        return "Sorry, I encountered an error processing your request. Please try again later.";
      }
    }
  }

  async processQueryWithStreaming(query: string, callback: (chunk: string) => void): Promise<void> {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    try {
      const searchQuery = await this._determineSearchQuery(query);

      let stream: AsyncIterable<any>;
      try {
        stream = await this.anthropic.messages.stream({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          messages,
          tools: this.tools.length > 0 ? this.tools : undefined,
        });
      } catch (streamError: any) {
        // Handle stream creation errors separately 
        console.error("Error creating stream:", streamError);
        throw streamError; // Re-throw to be handled by the outer catch
      }

      const toolCalls: Record<string, any> = {};
      
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            // Send text chunks directly to the client
            callback(chunk.delta.text);
          } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
            // Handle tool use
            const toolUse = chunk.content_block;
            toolCalls[toolUse.id] = {
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input
            };
          } else if (chunk.type === 'message_stop') {
            // Process all collected tool calls
            for (const toolUseId in toolCalls) {
              try {
                const toolUse = toolCalls[toolUseId];
                const { toolResult, formattedToolCall } = await this._handleToolUse(toolUse, searchQuery);
                
                // Send the formatted tool call to the client
                callback(formattedToolCall);
                
                // Prepare follow-up messages for the model
                messages.push({
                  role: "assistant",
                  content: [{ type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input }],
                });

                messages.push({
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
              } catch (toolError) {
                console.error(`Error handling tool call ${toolUseId}:`, toolError);
                callback(`\n\nError executing tool: ${toolError instanceof Error ? toolError.message : String(toolError)}\n\n`);
              }
            }
            
            // If we had tool calls, generate a follow-up response
            if (Object.keys(toolCalls).length > 0) {
              try {
                const followUpStream = await this.anthropic.messages.stream({
                  model: config.model.name,
                  max_tokens: config.model.maxTokens,
                  messages,
                });
                
                for await (const followUpChunk of followUpStream) {
                  if (followUpChunk.type === 'content_block_delta' && followUpChunk.delta.type === 'text_delta') {
                    callback(followUpChunk.delta.text);
                  }
                }
              } catch (followUpError) {
                console.error("Error in follow-up response:", followUpError);
                callback("\n\nError generating follow-up response. Please try again.\n\n");
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
      
      // Check for specific error types
      if (error?.status === 529 || (error?.error?.type === "overloaded_error")) {
        callback("Claude API is currently experiencing high traffic. Please try again in a few moments.");
      } else if (error?.status === 400) {
        callback("Sorry, there was an error processing your request. The input may be too long or contain unsupported content.");
      } else if (error?.status === 401) {
        callback("Authentication error. Please check your API key configuration.");
      } else if (error?.status === 429) {
        callback("Rate limit exceeded. Please try again later.");
      } else {
        // Default error message
        callback("Sorry, I encountered an error processing your request. Please try again later.");
      }
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

    // Make sure the query parameter exists and is not empty for tools that might need it
    if (toolName.toLowerCase().includes('query') || 
        toolName.toLowerCase().includes('search') || 
        toolName.toLowerCase().includes('knowledge')) {
      
      // If query parameter is missing or empty, set it to a valid value
      if (!toolArgs.query) {
        console.log(`Tool ${toolName} is missing query parameter, using original user query`);
        toolArgs.query = searchQuery || "general information";
      } else if (typeof toolArgs.query === 'string') {
        // If query exists but might benefit from the extracted version
        const originalQuery = toolArgs.query;
        toolArgs.query = searchQuery || originalQuery;
        
        if (searchQuery && searchQuery !== originalQuery) {
          console.log(`Modified tool query: "${originalQuery}" -> "${searchQuery}"`);
        }
      }
    }

    // Log the tool call for debugging
    console.log(`Calling tool: ${toolName} with args:`, JSON.stringify(toolArgs, null, 2));

    try {
      const toolResult = await this.mcp.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      
      // Convert result content to string
      const resultContent = typeof toolResult.content === 'object' 
        ? JSON.stringify(toolResult.content, null, 2)
        : String(toolResult.content);
      
      // Format tool call as a collapsible component
      const formattedToolCall = `<tool-call data-expanded="false" data-tool="${toolName}">
  <tool-header>Called MCP Tool: ${toolName}</tool-header>
  <tool-content>
    <tool-args>${JSON.stringify(toolArgs, null, 2)}</tool-args>
    <tool-result>${resultContent}</tool-result>
  </tool-content>
</tool-call>`;

      return { toolResult, formattedToolCall };
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      
      // Create a formatted error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      const formattedToolCall = `<tool-call data-expanded="true" data-tool="${toolName}" data-error="true">
  <tool-header>Error Calling MCP Tool: ${toolName}</tool-header>
  <tool-content>
    <tool-args>${JSON.stringify(toolArgs, null, 2)}</tool-args>
    <tool-result>Error: ${errorMessage}</tool-result>
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
} 