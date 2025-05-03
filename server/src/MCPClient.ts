import { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Conversation } from './services/Conversation';
import { MCPServer } from './services/MCPServer';
import { Query } from './services/Query';
import { Tool } from './services/Tool';

export class MCPClient {
  private conversation: Conversation;
  private mcpServer: MCPServer;
  private tool: Tool;
  private query: Query;
  
  constructor(apiKey: string) {
    this.conversation = new Conversation();
    this.mcpServer = new MCPServer();
    this.tool = new Tool();
    this.query = new Query(
      apiKey,
      this.conversation,
      this.mcpServer,
      this.tool
    );
  }

  /**
   * Connect to MCP server using HTTP/SSE transport
   */
  async connectToServerViaHttp(serverUrl: string): Promise<boolean> {
    try {
      const { success, tools } = await this.mcpServer.connectToServerViaHttp(serverUrl);
      
      if (success && tools) {
        // Register tools with the tool service
        this.tool.registerTools(tools);
        
        console.log(
          "Connected to HTTP/SSE server with tools:",
          this.tool.getTools().map(({ name }) => name)
        );
        return true;
      }
      
      return false;
    } catch (e) {
      console.log("Failed to connect to HTTP/SSE MCP server: ", e);
      return false;
    }
  }

  /**
   * @deprecated Use connectToServerViaHttp instead
   */
  async connectToServer(serverScriptPath: string): Promise<boolean> {
    try {
      const { success, tools } = await this.mcpServer.connectToServer(serverScriptPath);
      
      if (success && tools) {
        // Register tools with the tool service
        this.tool.registerTools(tools);
        
        console.log(
          "Connected to server with tools:",
          this.tool.getTools().map(({ name }) => name)
        );
        return true;
      }
      
      return false;
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      return false;
    }
  }

  startNewChat(): string {
    return this.conversation.startNewChat();
  }

  addToExistingChat(chatId: string, message: any): boolean {
    return this.conversation.addToExistingChat(chatId, message);
  }

  async processQuery(query: string, chatId?: string): Promise<string> {
    return this.query.processQuery(query, chatId);
  }

  /**
   * Process a query using the MCP with streaming support
   * @param query The user query to process
   * @param streamCallback Callback function called for each text chunk, should return true to continue streaming or false to stop
   */
  public async processQueryWithStreaming(
    query: string, 
    streamCallback: (text: string) => boolean | Promise<boolean> | void
  ): Promise<void> {
    return this.query.processQueryWithStreaming(query, streamCallback);
  }

  getTools(): AnthropicTool[] {
    return this.tool.getTools();
  }

  isConnected(): boolean {
    return this.mcpServer.isConnected();
  }
  
  getCurrentChatId(): string {
    return this.conversation.getCurrentChatId();
  }
  
  getConversationHistory(): any[] {
    return this.conversation.getConversationHistory();
  }
  
  clearConversationHistory(): void {
    this.conversation.clearConversationHistory();
  }
} 