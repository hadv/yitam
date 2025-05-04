import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class MCPServer {
  private mcp: Client;
  private transport: SSEClientTransport | null = null;
  
  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }
  
  /**
   * Connects to an MCP server via HTTP/SSE
   */
  async connectToServerViaHttp(serverUrl: string): Promise<{success: boolean, tools?: any[]}> {
    try {
      console.log(`Connecting to MCP server via HTTP/SSE at: ${serverUrl}`);
      
      // Create SSE transport with URL object
      this.transport = new SSEClientTransport(new URL(serverUrl));
      
      if (this.transport) {
        this.mcp.connect(this.transport);
      } else {
        throw new Error("Failed to create transport connection");
      }
      
      const toolsResult = await this.mcp.listTools();
      
      return {
        success: true,
        tools: toolsResult.tools
      };
    } catch (e) {
      console.log("Failed to connect to MCP server via HTTP/SSE: ", e);
      return { success: false };
    }
  }
  
  /**
   * Calls a tool on the MCP server
   */
  async callTool(name: string, args: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error("Not connected to an MCP server");
    }
    
    return await this.mcp.callTool({
      name,
      arguments: args,
    });
  }
  
  /**
   * Checks if the client is connected to an MCP server
   */
  isConnected(): boolean {
    return this.transport !== null;
  }
} 