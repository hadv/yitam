import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from './config';

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

      let command: string;
      let scriptArgs: string[] = [serverScriptPath];

      if (isSh) {
        if (process.platform === "win32") {
          throw new Error("Shell scripts are not supported on Windows");
        }
        command = process.env.SHELL || "/bin/bash";
      } else if (isPy) {
        command = process.platform === "win32" ? "python" : "python3";
      } else {
        command = process.execPath;
      }
      
      this.transport = new StdioClientTransport({
        command,
        args: scriptArgs,
      });
      this.mcp.connect(this.transport);
      
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

          const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });
          toolResults.push(result);
          finalText.push(
            `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
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
                content: result.content as string,
              },
            ],
          });

          const followUpResponse = await this.anthropic.messages.create({
            model: config.model.name,
            max_tokens: config.model.maxTokens,
            messages,
          });

          if (followUpResponse.content[0].type === "text") {
            finalText.push(followUpResponse.content[0].text);
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