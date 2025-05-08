import { MessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Persona, getDefaultPersona, getPersonaById } from '../constants/Personas';

export class Conversation {
  private conversationHistory: MessageParam[] = [];
  private chatId: string = '';
  private currentPersona: Persona = getDefaultPersona();
  
  constructor() {}
  
  /**
   * Starts a new conversation and returns the new chat ID
   */
  startNewChat(personaId?: string): string {
    this.conversationHistory = [];
    this.chatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Set persona if provided, otherwise use default
    if (personaId) {
      this.setPersona(personaId);
    } else {
      this.currentPersona = getDefaultPersona();
    }
    
    console.log(`Starting new chat with ID: ${this.chatId} using persona: ${this.currentPersona.displayName}`);
    return this.chatId;
  }
  
  /**
   * Adds a message to an existing conversation
   */
  addToExistingChat(chatId: string, message: MessageParam): boolean {
    if (this.chatId !== chatId) {
      console.error(`Chat ID mismatch: ${chatId} vs ${this.chatId}`);
      return false;
    }
    this.conversationHistory.push(message);
    return true;
  }
  
  /**
   * Returns the current chat ID
   */
  getCurrentChatId(): string {
    return this.chatId;
  }
  
  /**
   * Returns the current persona
   */
  getCurrentPersona(): Persona {
    return this.currentPersona;
  }
  
  /**
   * Sets the current persona by ID
   */
  setPersona(personaId: string): void {
    const newPersona = getPersonaById(personaId);
    this.currentPersona = newPersona;
    console.log(`Set persona to ${newPersona.displayName} for chat ${this.chatId}`);
  }
  
  /**
   * Returns a copy of the current conversation history
   */
  getConversationHistory(): MessageParam[] {
    return [...this.conversationHistory];
  }
  
  /**
   * Clears the current conversation history
   */
  clearConversationHistory(): void {
    this.conversationHistory = [];
    console.log(`Cleared conversation history for chat ${this.chatId}`);
  }
  
  /**
   * Adds a user message to the conversation
   */
  addUserMessage(query: string): void {
    this.conversationHistory.push({
      role: "user",
      content: query,
    });
  }
  
  /**
   * Adds an assistant message to the conversation
   */
  addAssistantMessage(content: string | ContentBlockParam[]): void {
    // If content is a string and not using default persona, replace "Yitam" with persona name
    if (typeof content === 'string' && this.currentPersona.id !== 'yitam') {
      // Replace "Yitam" or "Yitam:" at the beginning of responses
      const modifiedContent = content.replace(
        /^(Yitam:?\s+|Yitam\s+)/g, 
        `${this.currentPersona.displayName}: `
      );
      
      this.conversationHistory.push({
        role: "assistant",
        content: modifiedContent,
      });
    } else {
      this.conversationHistory.push({
        role: "assistant",
        content,
      });
    }
  }
  
  /**
   * Adds a tool use message to the conversation
   */
  addToolUseMessage(toolId: string, toolName: string, toolInput: any): void {
    this.conversationHistory.push({
      role: "assistant",
      content: [{ type: "tool_use", id: toolId, name: toolName, input: toolInput }],
    });
  }
  
  /**
   * Adds a tool result message to the conversation
   */
  addToolResultMessage(toolUseId: string, content: any): void {
    this.conversationHistory.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: typeof content === 'object' 
            ? JSON.stringify(content, null, 2)
            : String(content),
        },
      ],
    });
  }
} 