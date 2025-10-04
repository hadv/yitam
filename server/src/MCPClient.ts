import { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Conversation } from './services/Conversation';
import { MCPServer } from './services/MCPServer';
import { Query } from './services/Query';
import { Tool } from './services/Tool';
import { Persona, availablePersonas, getPersonaById } from './constants/Personas';

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

  /**
   * Start new chat with optional persona
   */
  startNewChat(personaId?: string): string {
    return this.conversation.startNewChat(personaId);
  }

  addToExistingChat(chatId: string, message: any): boolean {
    return this.conversation.addToExistingChat(chatId, message);
  }
  
  /**
   * Set the persona for the current conversation
   */
  setPersona(personaId: string): void {
    this.conversation.setPersona(personaId);
  }
  
  /**
   * Get the current persona
   */
  getCurrentPersona(): Persona {
    return this.conversation.getCurrentPersona();
  }
  
  /**
   * Get the list of available personas
   */
  getAvailablePersonas(): Persona[] {
    return availablePersonas;
  }
  
  /**
   * Find a persona by ID
   */
  getPersonaById(id: string): Persona {
    return getPersonaById(id);
  }

  /**
   * Process a query with optional chatId and personaId
   */
  async processQuery(query: string, chatId?: string, personaId?: string): Promise<string> {
    return this.query.processQuery(query, chatId, personaId);
  }

  /**
   * Process a query using the MCP with streaming support
   * @param query The user query to process
   * @param streamCallback Callback function called for each text chunk, should return true to continue streaming or false to stop
   * @param chatId Optional chat ID for continuing an existing conversation
   * @param personaId Optional persona ID to use for this query
   * @param contextMessages Optional optimized context messages from the main server's context engine
   */
  public async processQueryWithStreaming(
    query: string,
    streamCallback: (text: string) => boolean | Promise<boolean> | void,
    chatId?: string,
    personaId?: string,
    contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void> {
    return this.query.processQueryWithStreaming(query, streamCallback, chatId, personaId, contextMessages);
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