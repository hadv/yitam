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
      // First, extract a concise search query from the user's message
      const extractionResponse = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: 150,
        system: "Extract the core search intent from the user's message. Return only the essential keywords or a concise search query that would be effective for vector search, without any commentary or explanation. Focus on domain-specific terminology or key concepts.",
        messages: [{
          role: "user",
          content: query
        }]
      });

      let searchQuery = query;
      if (extractionResponse.content[0]?.type === "text") {
        const extractedText = extractionResponse.content[0].text.trim();
        if (extractedText && extractedText.length > 0 && extractedText.length < query.length) {
          searchQuery = extractedText;
          console.log(`Original query: "${query}"`);
          console.log(`Extracted search query: "${searchQuery}"`);
        }
      }

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
          const toolName = content.name;
          const toolArgs = content.input as { [x: string]: unknown } | undefined;
          const toolId = content.id;

          // Replace the query in tool arguments with the extracted search query
          if (toolArgs && typeof toolArgs.query === 'string') {
            toolArgs.query = searchQuery;
          }

          const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });
          toolResults.push(result);
          
          // Convert result content to string
          const resultContent = typeof result.content === 'object' 
            ? JSON.stringify(result.content, null, 2)
            : String(result.content);
          
          // Format tool call as a collapsible component
          finalText.push(
            `<tool-call data-expanded="false" data-tool="${toolName}">
  <tool-header>Called MCP Tool: ${toolName}</tool-header>
  <tool-content>
    <tool-args>${JSON.stringify(toolArgs, null, 2)}</tool-args>
    <tool-result>${resultContent}</tool-result>
  </tool-content>
</tool-call>`
          );

          messages.push({
            role: "assistant",
            content: [{ type: "tool_use", id: toolId, name: toolName, input: toolArgs }],
          });

          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: resultContent,
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
    } catch (error) {
      console.error("Error processing query:", error);
      return "Sorry, I encountered an error processing your request.";
    }
  }

  getTools(): Tool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.transport !== null && this.tools.length > 0;
  }
} 