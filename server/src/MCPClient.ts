import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { ConversationService } from './services/ConversationService';
import { MCPServerService } from './services/MCPServerService';
import { QueryService } from './services/QueryService';
import { ToolService } from './services/ToolService';

export class MCPClient {
  private conversationService: ConversationService;
  private mcpService: MCPServerService;
  private toolService: ToolService;
  private queryService: QueryService;
  
  constructor(apiKey: string) {
    this.conversationService = new ConversationService();
    this.mcpService = new MCPServerService();
    this.toolService = new ToolService();
    this.queryService = new QueryService(
      apiKey,
      this.conversationService,
      this.mcpService,
      this.toolService
    );
  }

  async connectToServer(serverScriptPath: string): Promise<boolean> {
    try {
      const { success, tools } = await this.mcpService.connectToServer(serverScriptPath);
      
      if (success && tools) {
        // Register tools with the tool service
        this.toolService.registerTools(tools);
        
        console.log(
          "Connected to server with tools:",
          this.toolService.getTools().map(({ name }) => name)
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
    return this.conversationService.startNewChat();
  }

  addToExistingChat(chatId: string, message: any): boolean {
    return this.conversationService.addToExistingChat(chatId, message);
  }

  async processQuery(query: string, chatId?: string): Promise<string> {
    return this.queryService.processQuery(query, chatId);
  }

  async processQueryWithStreaming(query: string, callback: (chunk: string) => void, chatId?: string): Promise<void> {
    return this.queryService.processQueryWithStreaming(query, callback, chatId);
  }

  getTools(): Tool[] {
    return this.toolService.getTools();
  }

  isConnected(): boolean {
    return this.mcpService.isConnected();
  }
  
  getCurrentChatId(): string {
    return this.conversationService.getCurrentChatId();
  }
  
  getConversationHistory(): any[] {
    return this.conversationService.getConversationHistory();
  }
  
  clearConversationHistory(): void {
    this.conversationService.clearConversationHistory();
  }
} 