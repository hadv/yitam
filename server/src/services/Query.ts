import { Anthropic } from "@anthropic-ai/sdk";
import { config } from '../config';
import { SystemPrompts } from '../constants/SystemPrompts';
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
  private readonly MAX_REQUESTS_PER_WINDOW = 10;
  private requestTimestamps: number[] = [];
  
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
   * Check rate limiting
   */
  private _checkRateLimit(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW
    );

    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      return { allowed: false, reason: "Rate limit exceeded" };
    }

    this.requestTimestamps.push(now);
    return { allowed: true };
  }
  
  /**
   * Determines the search query to use for search-focused tools
   */
  private async _determineSearchQuery(query: string): Promise<string> {
    const extractionResponse = await this.anthropic.messages.create({
      model: config.model.name,
      max_tokens: 150,
      system: SystemPrompts.SEARCH_EXTRACTION,
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
  
  /**
   * Handles tool use and returns the result and formatted HTML
   */
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
    
    // Validate tool name
    const validTools = this.tool.getTools().map(t => t.name);
    if (!validTools.includes(toolName)) {
      throw new Error(`Invalid tool name: ${toolName}`);
    }
    
    // Enrich the tool arguments with additional context
    const enrichedArgs = this.tool.enrichToolArguments(
      toolName,
      toolArgs,
      searchQuery
    );

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
  async processQuery(query: string, chatId?: string): Promise<string> {
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
    } else {
      // Start a new chat with this query
      this.conversation.startNewChat();
      console.log(`Starting new chat with query: ${query.substring(0, 50)}...`);
      this.conversation.addUserMessage(query);
    }
    
    // Use the complete conversation history for context
    const messages = this.conversation.getConversationHistory();
    console.log(`Using conversation history with ${messages.length} messages`);

    try {
      const searchQuery = await this._determineSearchQuery(query);
      const tools = this.tool.getTools();

      const response = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: config.model.maxTokens,
        system: SystemPrompts.INITIAL,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      const finalText: string[] = [];
      const toolResults: any[] = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
          // Add assistant's response to conversation history
          this.conversation.addAssistantMessage(content.text);
        } else if (content.type === "tool_use") {
          const { toolResult, formattedToolCall } = await this._handleToolUse(content, searchQuery);
          toolResults.push(toolResult);
          finalText.push(formattedToolCall);

          // Add tool interactions to conversation history
          this.conversation.addToolUseMessage(content.id, content.name, content.input);
          this.conversation.addToolResultMessage(content.id, toolResult.content);

          const followUpResponse = await this.anthropic.messages.create({
            model: config.model.name,
            max_tokens: config.model.maxTokens,
            system: SystemPrompts.FOLLOW_UP,
            messages: this.conversation.getConversationHistory(),
          });

          if (followUpResponse.content && followUpResponse.content.length > 0) {
            if (followUpResponse.content[0].type === "text") {
              finalText.push(followUpResponse.content[0].text);
              // Add follow-up response to conversation history
              this.conversation.addAssistantMessage(followUpResponse.content[0].text);
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
    callback: (chunk: string) => void, 
    chatId?: string
  ): Promise<void> {
    // Helper function to send escaped chunks to the client
    const sendChunk = (chunk: string) => {
      callback(chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    };
    
    // Check if this is part of an existing chat or a new one
    if (chatId && chatId === this.conversation.getCurrentChatId()) {
      console.log(`Adding to existing chat (streaming): ${chatId}`);
      this.conversation.addUserMessage(query);
    } else {
      // Start a new chat with this query
      this.conversation.startNewChat();
      console.log(`Starting new chat with query (streaming): ${query.substring(0, 50)}...`);
      this.conversation.addUserMessage(query);
    }
    
    // Use the complete conversation history for context
    const messages = this.conversation.getConversationHistory();
    console.log(`Using conversation history with ${messages.length} messages (streaming)`);

    try {
      const searchQuery = await this._determineSearchQuery(query);
      const tools = this.tool.getTools();

      let stream: AsyncIterable<any>;
      try {
        stream = await this.anthropic.messages.stream({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          system: SystemPrompts.INITIAL,
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
            sendChunk(chunk.delta.text);
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
              this.conversation.addAssistantMessage(assistantResponse);
              console.log(`Added assistant text response to history (${assistantResponse.length} chars)`);
            }
            
            // Process all collected tool calls
            for (const toolUseId in toolCalls) {
              try {
                const toolUse = toolCalls[toolUseId];
                const { toolResult, formattedToolCall } = await this._handleToolUse(toolUse, searchQuery);
                
                // Send the formatted tool call to the client
                callback(formattedToolCall);
                
                // Add tool interactions to conversation history
                this.conversation.addToolUseMessage(toolUse.id, toolUse.name, toolUse.input);
                this.conversation.addToolResultMessage(toolUse.id, toolResult.content);
                
                console.log(`Added tool call and result to history for ${toolUse.name}`);
              } catch (toolError) {
                console.error(`Error handling tool call ${toolUseId}:`, toolError);
                callback(`\n\nError executing tool: ${String(toolError instanceof Error ? toolError.message : String(toolError)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n\n`);
              }
            }
            
            // If we had tool calls, generate a follow-up response
            if (Object.keys(toolCalls).length > 0) {
              try {
                // Try up to 3 times to get a complete follow-up response
                let retryCount = 0;
                const maxRetries = 2;
                let successfulCompletion = false;
                
                // Keep track of the best response across retries
                let bestResponseBuffer = "";
                let currentResponseBuffer = "";
                
                while (retryCount <= maxRetries && !successfulCompletion) {
                  if (retryCount > 0) {
                    console.log(`Retrying follow-up response (attempt ${retryCount} of ${maxRetries})`);
                    // Reset current buffer for this attempt
                    currentResponseBuffer = "";
                  }
                  
                  try {
                    const followUpStream = await this.anthropic.messages.stream({
                      model: config.model.name,
                      max_tokens: config.model.maxTokens,
                      system: SystemPrompts.FOLLOW_UP,
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
                            sendChunk(displayBuffer);
                            displayBuffer = "";
                          }
                        } else if (followUpChunk.type === 'content_block_start' && followUpChunk.content_block.type === 'text') {
                          hasReceivedContent = true;
                        } else if (followUpChunk.type === 'message_stop') {
                          // Message completion - send any remaining display content
                          if (displayBuffer.length > 0) {
                            sendChunk(displayBuffer);
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
                      sendChunk("\n\n[Continuing with complete information]\n" + completedPortion);
                    }
                  }
                }
                
              } catch (followUpError) {
                console.error("Error in follow-up response:", followUpError);
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
      sendChunk("Kính thưa quý khách, hệ thống đang gặp trục trặc kỹ thuật khi xử lý yêu cầu. Xin quý khách vui lòng thử lại sau. Chúng tôi chân thành xin lỗi vì sự bất tiện này.");
    }
  }
} 