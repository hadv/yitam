import { Anthropic } from "@anthropic-ai/sdk";
import { config } from '../config';
import { SystemPrompts } from '../constants/SystemPrompts';
import { availableDomains } from '../constants/Domains';
import { getPersonaSystemPrompt } from '../constants/Personas';
import { Conversation } from './Conversation';
import { MCPServer } from './MCPServer';
import { Tool } from './Tool';
import { ModerationService } from './ModerationService';

export class Query {
  private anthropic: Anthropic;
  private conversation: Conversation;
  private mcpServer: MCPServer;
  private tool: Tool;
  private moderationService: ModerationService;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 6; // Reduced from 10 to 6 to avoid hitting API rate limits
  private requestTimestamps: number[] = [];
  
  // Static tracking of global API usage to prevent rate limits
  private static globalRequestTimestamps: number[] = [];
  private static readonly GLOBAL_RATE_LIMIT_WINDOW = 60000; // 1 minute
  private static readonly GLOBAL_MAX_REQUESTS = 15; // Maximum requests per minute across all users
  
  constructor(
    apiKey: string,
    conversation: Conversation,
    mcpServer: MCPServer,
    tool: Tool
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.conversation = conversation;
    this.mcpServer = mcpServer;
    this.tool = tool;
    this.moderationService = new ModerationService(apiKey);
  }
  
  /**
   * Check if the query violates content guidelines
   */
  private async _checkContentSafety(content: string): Promise<{ isSafe: boolean; reason?: string }> {
    try {
      // Use the moderation service for content analysis
      const moderationResult = await this.moderationService.moderateContent(content);
      
      if (!moderationResult.isSafe) {
        // Log the specific categories that were flagged
        const flaggedCategories = Object.entries(moderationResult.categories)
          .filter(([_, value]) => value)
          .map(([key]) => key)
          .join(', ');
        
        console.log(`Content moderation flagged categories: ${flaggedCategories}`);
        return { 
          isSafe: false, 
          reason: moderationResult.reason || `Content contains prohibited material (${flaggedCategories})` 
        };
      }
      
      return { isSafe: true };
    } catch (error) {
      console.error("Error in content safety check:", error);
      return { isSafe: false, reason: "Error during safety check" };
    }
  }

  /**
   * Check rate limiting for both user and global levels
   */
  private _checkRateLimit(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    
    // Check user-level rate limit
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW
    );

    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      return { allowed: false, reason: "User rate limit exceeded" };
    }

    // Check global rate limit
    Query.globalRequestTimestamps = Query.globalRequestTimestamps.filter(
      timestamp => now - timestamp < Query.GLOBAL_RATE_LIMIT_WINDOW
    );

    if (Query.globalRequestTimestamps.length >= Query.GLOBAL_MAX_REQUESTS) {
      return { allowed: false, reason: "Global rate limit exceeded, please try again in a moment" };
    }

    // Update both rate limit counters
    this.requestTimestamps.push(now);
    Query.globalRequestTimestamps.push(now);
    
    return { allowed: true };
  }
  
  /**
   * Determines the search query and domains to use for search-focused tools
   */
  private async _determineSearchQuery(query: string): Promise<{ searchQuery: string; domains: string[] }> {
    try {
      console.time('search-query-extraction');
      
      // Get the current persona and its associated domains
      const currentPersona = this.conversation.getCurrentPersona();
      
      // If using a persona other than default, we'll use its fixed domains
      // Only run domain detection for the default Yitam persona
      const isDefaultPersona = currentPersona.id === 'yitam';
      
      // Extract search query in all cases
      const extractionResponse = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: 150,  // Small token limit is sufficient for extraction
        system: SystemPrompts.SEARCH_EXTRACTION,
        messages: [{
          role: "user",
          content: query
        }]
      });
      
      console.timeEnd('search-query-extraction');

      let extractedText = query;
      if (extractionResponse.content[0]?.type === "text") {
        const text = extractionResponse.content[0].text.trim();
        if (text && text.length > 0) {
          console.log(`Original query: "${query.substring(0, 50)}..."`);
          console.log(`Extracted search query: "${text}"`);
          extractedText = text;
        }
      }
      
      let domains: string[];
      
      // For non-default personas, always use their fixed domains
      // For default persona (Yitam), run domain detection
      if (!isDefaultPersona) {
        domains = currentPersona.domains;
        console.log(`Using fixed domains for ${currentPersona.displayName}: ${domains.join(', ')}`);
      } else {
        // Only run domain detection for Yitam persona
        const detectedDomains = await this._detectQueryDomains(query);
        domains = detectedDomains;
        console.log(`Using detected domains for Yitam: ${domains.join(', ')}`);
      }
      
      return { searchQuery: extractedText, domains };
    } catch (error) {
      console.warn('Error extracting search query, using original:', error);
      
      // On error, fallback to current persona domains
      const currentPersona = this.conversation.getCurrentPersona();
      return { 
        searchQuery: query, 
        domains: currentPersona.domains
      };
    }
  }
  
  /**
   * Handles tool use and returns the result and formatted HTML
   */
  private async _handleToolUse(
    content: { name: string; input: any; id: string },
    searchInfo: { searchQuery: string; domains: string[] }
  ): Promise<{ toolResult: any; formattedToolCall: string }> {
    const toolName = content.name;
    const toolArgs = content.input as { [x: string]: unknown } | undefined;

    // Ensure we have valid arguments
    if (!toolArgs) {
      throw new Error(`No arguments provided for tool: ${toolName}`);
    }
    
    // Validate tool name
    const validTools = this.tool.getTools().map(t => t.name);
    if (!validTools.includes(toolName)) {
      throw new Error(`Invalid tool name: ${toolName}`);
    }
    
    // Enrich the tool arguments with additional context
    const enrichedArgs = this.tool.enrichToolArguments(
      toolName,
      toolArgs,
      searchInfo
    );

    // Add limit to the tool arguments
    enrichedArgs.limit = 6;
    
    // Set maximum result size limits
    const maxResultLength = 1000000; // 1MB max for tool results
    
    // Log the tool call for debugging
    console.log(`Calling tool: ${toolName} with args:`, JSON.stringify(enrichedArgs, null, 2));

    try {
      const toolResult = await this.mcpServer.callTool(toolName, enrichedArgs);
      
      // Validate tool result structure
      if (!toolResult || typeof toolResult !== 'object') {
        throw new Error(`Invalid tool result structure from ${toolName}`);
      }

      if (!('content' in toolResult)) {
        throw new Error(`Tool result missing required 'content' field`);
      }
      
      // Convert result content to string
      let resultContent = typeof toolResult.content === 'object' 
        ? JSON.stringify(toolResult.content, null, 2)
        : String(toolResult.content);
      
      // Check if the result is very large
      const isLargeResult = resultContent.length > maxResultLength;
      if (isLargeResult) {
        console.warn(`Large tool result (${resultContent.length} chars) will be truncated`);
        resultContent = resultContent.substring(0, maxResultLength) + 
          "\n\n[Note: The complete result was too large to display in full. This is a truncated version.]";
      }

      // Check content safety of tool result
      const safetyCheck = await this._checkContentSafety(resultContent);
      if (!safetyCheck.isSafe) {
        resultContent = `[Content safety check failed: ${safetyCheck.reason}]`;
      }
      
      // Format the tool call as HTML
      const formattedToolCall = this.tool.formatToolCall(
        toolName,
        enrichedArgs,
        resultContent,
        false
      );

      return { toolResult, formattedToolCall };
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      
      // Create a formatted error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const formattedToolCall = this.tool.formatToolCall(
        toolName,
        enrichedArgs,
        `Error: ${errorMessage}`,
        true
      );
      
      // Return an error result that can still be displayed to the user
      return { 
        toolResult: { content: `Error: ${errorMessage}` }, 
        formattedToolCall 
      };
    }
  }
  
  /**
   * Process a query without streaming
   */
  async processQuery(query: string, chatId?: string, personaId?: string): Promise<string> {
    // Check rate limiting
    const rateLimitCheck = this._checkRateLimit();
    if (!rateLimitCheck.allowed) {
      return "Rate limit exceeded. Please try again later.";
    }

    // Check content safety
    const safetyCheck = await this._checkContentSafety(query);
    if (!safetyCheck.isSafe) {
      return `I apologize, but I cannot process this request. ${safetyCheck.reason}`;
    }

    // Check if this is part of an existing chat or a new one
    if (chatId && chatId === this.conversation.getCurrentChatId()) {
      console.log(`Adding to existing chat: ${chatId}`);
      this.conversation.addUserMessage(query);
      
      // If a persona ID is provided, update the persona for this chat
      if (personaId) {
        this.conversation.setPersona(personaId);
      }
    } else {
      // Start a new chat with this query and optional persona
      this.conversation.startNewChat(personaId);
      console.log(`Starting new chat with query: ${query.substring(0, 50)}...`);
      this.conversation.addUserMessage(query);
    }
    
    // Use the complete conversation history for context
    const messages = this.conversation.getConversationHistory();
    console.log(`Using conversation history with ${messages.length} messages`);

    try {
      const { searchQuery, domains } = await this._determineSearchQuery(query);
      const tools = this.tool.getTools();
      
      // Get the current persona for system prompt customization
      const currentPersona = this.conversation.getCurrentPersona();
      
      // Customize system prompt based on persona
      const personaSystemPrompt = getPersonaSystemPrompt(SystemPrompts.INITIAL, currentPersona);
      
      console.log(`Using persona: ${currentPersona.displayName} for response`);

      const response = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: config.model.maxTokens,
        system: personaSystemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      const finalText: string[] = [];
      const toolResults: any[] = [];

      for (const content of response.content) {
        if (content.type === "text") {
          // Customize the response if needed based on persona
          let textContent = content.text;
          
          // For non-default personas, ensure responses are properly formatted
          if (currentPersona.id !== 'yitam' && !textContent.startsWith(currentPersona.displayName)) {
            textContent = `${currentPersona.displayName}: ${textContent}`;
          }
          
          finalText.push(textContent);
          // Add assistant's response to conversation history
          this.conversation.addAssistantMessage(textContent);
        } else if (content.type === "tool_use") {
          const { toolResult, formattedToolCall } = await this._handleToolUse(content, { searchQuery, domains });
          toolResults.push(toolResult);
          finalText.push(formattedToolCall);

          // Add tool interactions to conversation history
          this.conversation.addToolUseMessage(content.id, content.name, content.input);
          this.conversation.addToolResultMessage(content.id, toolResult.content);

          // Add delay before follow-up to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

          // Update system prompt for follow-up based on persona
          const personaFollowUpPrompt = getPersonaSystemPrompt(SystemPrompts.FOLLOW_UP, currentPersona);
          
          const followUpResponse = await this.anthropic.messages.create({
            model: config.model.name,
            // Reduce token limits for follow-up to avoid rate limits
            max_tokens: Math.min(2000, config.model.maxTokens),
            system: personaFollowUpPrompt,
            messages: this.conversation.getConversationHistory(),
          });

          if (followUpResponse.content && followUpResponse.content.length > 0) {
            if (followUpResponse.content[0].type === "text") {
              let followUpText = followUpResponse.content[0].text;
              
              // For non-default personas, ensure follow-up responses are properly formatted
              if (currentPersona.id !== 'yitam' && !followUpText.startsWith(currentPersona.displayName)) {
                followUpText = `${currentPersona.displayName}: ${followUpText}`;
              }
              
              finalText.push(followUpText);
              // Add follow-up response to conversation history
              this.conversation.addAssistantMessage(followUpText);
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
  
  /**
   * Process a query with streaming responses
   */
  async processQueryWithStreaming(
    query: string,
    callback: (chunk: string) => boolean | Promise<boolean> | void,
    chatId?: string,
    personaId?: string,
    contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void> {
    // Helper function to send escaped chunks to the client
    const sendChunk = async (chunk: string): Promise<boolean> => {
      // Get current persona for potential text customization
      const currentPersona = this.conversation.getCurrentPersona();
      
      // For non-default personas, check if chunk starts with response indicator
      let modifiedChunk = chunk;
      if (currentPersona.id !== 'yitam') {
        // Replace "Yitam:" prefix at the beginning of chunks with persona name
        modifiedChunk = chunk.replace(
          /^(Yitam:?\s+|Yitam\s+)/g, 
          `${currentPersona.displayName}: `
        );
      }
      
      const escapedChunk = modifiedChunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const result = await callback(escapedChunk);
      // If callback explicitly returns false, signal to stop streaming
      return result !== false;
    };
    
    // Check if this is part of an existing chat or a new one
    if (chatId && chatId === this.conversation.getCurrentChatId()) {
      console.log(`Adding to existing chat (streaming): ${chatId}`);
      this.conversation.addUserMessage(query);
      
      // If a persona ID is provided, update the persona for this chat
      if (personaId) {
        this.conversation.setPersona(personaId);
      }
    } else {
      // Start a new chat with this query
      this.conversation.startNewChat(personaId);
      console.log(`Starting new chat with query (streaming): ${query.substring(0, 50)}...`);
      this.conversation.addUserMessage(query);
    }
    
    // Use optimized context messages if provided, otherwise fall back to conversation history
    const messages = contextMessages || this.conversation.getConversationHistory();
    if (contextMessages) {
      console.log(`Using optimized context with ${messages.length} messages (streaming)`);
    } else {
      console.log(`Using conversation history with ${messages.length} messages (streaming)`);
    }

    try {
      const { searchQuery, domains } = await this._determineSearchQuery(query);
      const tools = this.tool.getTools();
      
      // Get the current persona for system prompt customization
      const currentPersona = this.conversation.getCurrentPersona();
      
      // Customize system prompt based on persona
      const personaSystemPrompt = getPersonaSystemPrompt(SystemPrompts.INITIAL, currentPersona);
      
      console.log(`Using persona: ${currentPersona.displayName} for streaming response`);

      let stream: AsyncIterable<any>;
      try {
        stream = await this.anthropic.messages.stream({
          model: config.model.name,
          max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
          system: personaSystemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
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
            const shouldContinue = await sendChunk(chunk.delta.text);
            if (!shouldContinue) {
              console.log('Streaming stopped by callback returning false');
              break; // Exit the streaming loop
            }
            
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
              // For non-default personas, check if response needs persona prefix
              if (currentPersona.id !== 'yitam' && !assistantResponse.startsWith(currentPersona.displayName)) {
                assistantResponse = `${currentPersona.displayName}: ${assistantResponse}`;
              }
              
              this.conversation.addAssistantMessage(assistantResponse);
              console.log(`Added assistant text response to history (${assistantResponse.length} chars)`);
            }
            
            // Process all collected tool calls
            for (const toolUseId in toolCalls) {
              try {
                const toolUse = toolCalls[toolUseId];
                const { toolResult, formattedToolCall } = await this._handleToolUse(toolUse, { searchQuery, domains });
                
                // Send the formatted tool call to the client
                const shouldContinue = await callback(formattedToolCall);
                if (!shouldContinue) {
                  console.log('Streaming stopped during tool call results');
                  return; // Exit the function entirely
                }
                
                // Add tool interactions to conversation history
                this.conversation.addToolUseMessage(toolUse.id, toolUse.name, toolUse.input);
                this.conversation.addToolResultMessage(toolUse.id, toolResult.content);
                
                console.log(`Added tool call and result to history for ${toolUse.name}`);
              } catch (toolError) {
                console.error(`Error handling tool call ${toolUseId}:`, toolError);
                const errorMessage = `\n\nError executing tool: ${String(toolError instanceof Error ? toolError.message : String(toolError)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n\n`;
                const shouldContinue = await callback(errorMessage);
                if (!shouldContinue) return;
              }
            }
            
            // If we had tool calls, generate a follow-up response
            if (Object.keys(toolCalls).length > 0) {
              try {
                // Always generate follow-up responses, regardless of tool type
                console.time('follow-up-response');
                
                // Add delay before follow-up to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                
                // Try up to 3 times to get a complete follow-up response
                let retryCount = 0;
                const maxRetries = 2;
                let successfulCompletion = false;
                
                // Keep track of the best response across retries
                let bestResponseBuffer = "";
                let currentResponseBuffer = "";
                
                // Update system prompt for follow-up based on persona
                const personaFollowUpPrompt = getPersonaSystemPrompt(SystemPrompts.FOLLOW_UP, currentPersona);
                
                while (retryCount <= maxRetries && !successfulCompletion) {
                  if (retryCount > 0) {
                    console.log(`Retrying follow-up response (attempt ${retryCount} of ${maxRetries})`);
                    // Reset current buffer for this attempt
                    currentResponseBuffer = "";
                  }
                  
                  try {
                    const followUpStream = await this.anthropic.messages.stream({
                      model: config.model.name,
                      // Reduce token limits for follow-up to avoid rate limits
                      max_tokens: Math.min(2000, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 2000),
                      system: personaFollowUpPrompt,
                      messages: this.conversation.getConversationHistory(),
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
                            const shouldContinue = await sendChunk(displayBuffer);
                            if (!shouldContinue) {
                              console.log('Streaming stopped during follow-up response');
                              return;
                            }
                            displayBuffer = "";
                          }
                        } else if (followUpChunk.type === 'content_block_start' && followUpChunk.content_block.type === 'text') {
                          hasReceivedContent = true;
                        } else if (followUpChunk.type === 'message_stop') {
                          // Message completion - send any remaining display content
                          if (displayBuffer.length > 0) {
                            const shouldContinue = await sendChunk(displayBuffer);
                            if (!shouldContinue) {
                              console.log('Streaming stopped during follow-up response');
                              return;
                            }
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
                      
                      // Check if it's a rate limit error and propagate it
                      if (streamError instanceof Error && 
                          (streamError.message.includes('rate limit') || 
                           (streamError as any)?.type === 'rate_limit_error' ||
                           streamError.message.includes('429'))) {
                        // Rethrow rate limit errors to be handled at a higher level
                        throw streamError;
                      }
                      
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
                  // For non-default personas, add persona prefix if needed
                  if (currentPersona.id !== 'yitam' && !bestResponseBuffer.startsWith(currentPersona.displayName)) {
                    bestResponseBuffer = `${currentPersona.displayName}: ${bestResponseBuffer}`;
                  }
                  
                  // Log the response content for debugging
                  console.log(`Follow-up response content (${bestResponseBuffer.length} chars): "${bestResponseBuffer.substring(0, 100)}${bestResponseBuffer.length > 100 ? '...' : ''}"`);
                  
                  // Check if the response is empty or too short
                  if (bestResponseBuffer.trim().length < 20) {
                    console.warn("Follow-up response is too short or empty, forcing a new response");
                    // Force a new response with a more specific prompt
                    try {
                      const forcedPersonaPrompt = getPersonaSystemPrompt(
                        SystemPrompts.FOLLOW_UP + "\n\nYOU MUST GENERATE A DETAILED RESPONSE. EMPTY OR SHORT RESPONSES ARE UNACCEPTABLE.", 
                        currentPersona
                      );
                      
                      const forceResponse = await this.anthropic.messages.create({
                        model: config.model.name,
                        max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
                        system: forcedPersonaPrompt,
                        messages: this.conversation.getConversationHistory(),
                        temperature: 1.0, // Increase temperature to encourage different response
                      });
                      
                      if (forceResponse.content[0]?.type === "text") {
                        let forcedText = forceResponse.content[0].text.trim();
                        
                        // For non-default personas, add persona prefix if needed
                        if (currentPersona.id !== 'yitam' && !forcedText.startsWith(currentPersona.displayName)) {
                          forcedText = `${currentPersona.displayName}: ${forcedText}`;
                        }
                        
                        if (forcedText.length > bestResponseBuffer.trim().length) {
                          console.log(`Using forced follow-up response (${forcedText.length} chars): "${forcedText.substring(0, 100)}${forcedText.length > 100 ? '...' : ''}"`);
                          bestResponseBuffer = forcedText;
                        }
                      }
                    } catch (error) {
                      console.error("Error forcing new follow-up response:", error);
                    }
                  }
                  
                  this.conversation.addAssistantMessage(bestResponseBuffer);
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
                      const shouldContinue = await sendChunk("\n\n[Continuing with complete information]\n" + completedPortion);
                      if (!shouldContinue) {
                        console.log('Streaming stopped during follow-up response');
                        return;
                      }
                    }
                  }
                }
                
                console.timeEnd('follow-up-response');
              } catch (followUpError) {
                console.error("Error in follow-up response:", followUpError);
                console.timeEnd('follow-up-response');
              }
            }
          }
        }
      } catch (streamProcessingError: any) {
        // Handle errors during stream processing
        console.error("Error processing stream:", streamProcessingError);
        
        // Check for credit balance error
        if (streamProcessingError?.error?.error?.message?.toLowerCase().includes('credit balance') ||
            streamProcessingError?.message?.toLowerCase().includes('credit balance')) {
          const errorMessage = {
            type: 'credit_balance',
            message: 'Số dư tín dụng API Anthropic của bạn quá thấp. Vui lòng truy cập Kế hoạch & Thanh toán để nâng cấp hoặc mua thêm tín dụng.'
          };
          const shouldContinue = await callback(JSON.stringify(errorMessage));
          if (!shouldContinue) return;
        } 
        // Check for rate limit error
        else if (streamProcessingError?.message?.includes('rate limit') || 
                 streamProcessingError?.type === 'rate_limit_error' ||
                 streamProcessingError?.message?.includes('429')) {
          const errorMessage = {
            type: 'rate_limit',
            message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi một lát rồi thử lại.'
          };
          const shouldContinue = await callback(JSON.stringify(errorMessage));
          if (!shouldContinue) return;
        }
        // Check for overloaded error
        else if (streamProcessingError?.error?.error?.type === 'overloaded_error' ||
                 streamProcessingError?.message?.includes('Overloaded')) {
          const errorMessage = {
            type: 'overloaded',
            message: 'Dịch vụ AI hiện đang quá tải. Đây có thể là vấn đề từ nhà cung cấp dịch vụ LLM API. Vui lòng thử lại sau ít phút.'
          };
          const shouldContinue = await callback(JSON.stringify(errorMessage));
          if (!shouldContinue) return;
        }
        // Default error message
        else {
          const errorMessage = {
            type: 'other',
            message: 'Xin lỗi, đã xảy ra lỗi khi xử lý phản hồi. Vui lòng thử lại.'
          };
          const shouldContinue = await callback(JSON.stringify(errorMessage));
          if (!shouldContinue) return;
        }
      }
    } catch (error: any) {
      console.error("Error processing query with streaming:", error);
      const errorMessage = {
        type: 'other',
        message: "Kính thưa quý khách, hệ thống đang gặp trục trặc kỹ thuật khi xử lý yêu cầu. Xin quý khách vui lòng thử lại sau. Chúng tôi chân thành xin lỗi vì sự bất tiện này."
      };
      const shouldContinue = await callback(JSON.stringify(errorMessage));
      if (!shouldContinue) return;
    }
  }

  /**
   * Uses the LLM to determine domains relevant to the query
   * More sophisticated than keyword matching
   */
  private async _detectQueryDomains(query: string): Promise<string[]> {
    console.time('domain-detection');
    
    try {
      // Create the domain list for the system prompt
      const domainOptions = availableDomains.map(domain => `- ${domain}`).join('\n');
      
      const domainResponse = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",  // Use a smaller, faster model
        max_tokens: 50,  // Small token limit for domain extraction
        system: `You are a domain classification expert specialized in traditional Eastern medicine, philosophy, and spiritual practices. Your task is to identify the relevant knowledge domains that a query belongs to.
Respond ONLY with a comma-separated list of domains (no explanation). Choose from these domains:
${domainOptions}

Only include domains that are directly relevant to the query. Return between 1-3 domains maximum. If the query doesn't match any domain, respond with the most general applicable domains.
Example responses:
"đông y, nội kinh"
"lão tử, dịch lý"
"đạo phật, thích nhất hạnh"`,
        messages: [{
          role: "user",
          content: `What domains does this query belong to? "${query}"`
        }]
      });
      
      console.timeEnd('domain-detection');

      if (domainResponse.content[0]?.type === "text") {
        const domainsText = domainResponse.content[0].text.trim();
        if (domainsText && domainsText.length > 0) {
          // Split on commas and clean up any extra spacing
          const domains = domainsText.split(',').map(d => d.trim()).filter(Boolean);
          
          // Validate that all returned domains are in our available domains list
          const validDomains = domains.filter(domain => availableDomains.includes(domain));
          
          console.log(`Detected domains for query: ${validDomains.join(', ')}`);
          return validDomains;
        }
      }
      return [];
    } catch (error) {
      console.warn('Error detecting domains for query:', error);
      return [];
    }
  }
} 