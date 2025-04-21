import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from 'fs';
import * as path from 'path';

export class MCPServer {
  private mcp: Client;
  private transport: StdioClientTransport | null = null;
  
  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }
  
  /**
   * Connects to an MCP server and returns all available tools
   */
  async connectToServer(serverScriptPath: string): Promise<{success: boolean, tools?: any[]}> {
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
      
      return {
        success: true,
        tools: toolsResult.tools
      };
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
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