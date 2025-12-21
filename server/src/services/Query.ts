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

    // Remove hardcoded limit - allow Agent to set it, or default to 6 if not set in original args and not set by enrichment
    if (typeof enrichedArgs.limit === 'undefined') {
      enrichedArgs.limit = 6;
    }

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
      const currentPersona = this.conversation.getCurrentPersona();
      const personaSystemPrompt = getPersonaSystemPrompt(SystemPrompts.INITIAL, currentPersona);

      console.log(`Using persona: ${currentPersona.displayName} for response`);

      let currentStep = 0;
      const MAX_STEPS = 5;
      const finalText: string[] = [];

      while (currentStep < MAX_STEPS) {
        currentStep++;
        const messages = this.conversation.getConversationHistory();
        console.log(`Step ${currentStep}/${MAX_STEPS} - Messages count: ${messages.length}`);

        const response = await this.anthropic.messages.create({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          system: personaSystemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Add assistant's raw response (text + tool_use blocks) to conversation history
        const assistantContent = response.content;
        this.conversation.addAssistantMessageContent(assistantContent);

        let hasToolUse = false;
        const toolResults: any[] = [];

        for (const content of assistantContent) {
          if (content.type === "text") {
            let textContent = content.text;
            // For non-default personas, ensure responses are properly formatted
            if (currentPersona.id !== 'yitam' && !textContent.startsWith(currentPersona.displayName)) {
              textContent = `${currentPersona.displayName}: ${textContent}`;
            }
            finalText.push(textContent);
          } else if (content.type === "tool_use") {
            hasToolUse = true;
            const { toolResult, formattedToolCall } = await this._handleToolUse(content, { searchQuery, domains });
            toolResults.push(toolResult);
            finalText.push(formattedToolCall);

            // Add tool interactions to conversation history
            this.conversation.addToolResultMessage(content.id, toolResult.content);
          }
        }

        if (!hasToolUse) {
          // If no tools were used, this is the final answer
          break;
        }

        // Delay to avoid rate limits between steps
        await new Promise(resolve => setTimeout(resolve, 1000));
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
      const currentPersona = this.conversation.getCurrentPersona();
      let modifiedChunk = chunk;
      if (currentPersona.id !== 'yitam') {
        modifiedChunk = chunk.replace(
          /^(Yitam:?\s+|Yitam\s+)/g,
          `${currentPersona.displayName}: `
        );
      }
      const escapedChunk = modifiedChunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const result = await callback(escapedChunk);
      return result !== false;
    };

    if (chatId && chatId === this.conversation.getCurrentChatId()) {
      console.log(`Adding to existing chat (streaming): ${chatId}`);
      this.conversation.addUserMessage(query);
      if (personaId) this.conversation.setPersona(personaId);
    } else {
      this.conversation.startNewChat(personaId);
      console.log(`Starting new chat with query (streaming): ${query.substring(0, 50)}...`);
      this.conversation.addUserMessage(query);
    }

    // Use optimized context messages if provided, otherwise fall back to conversation history
    const rawMessages = contextMessages || this.conversation.getConversationHistory();
    const messages = rawMessages.filter(msg => {
      if (!msg.content || (typeof msg.content === 'string' && !msg.content.trim())) {
        return false;
      }
      return true;
    });

    if (messages.length === 0) {
      console.error('No valid messages for streaming query');
      await callback('Xin lỗi, không có tin nhắn hợp lệ để xử lý.');
      return;
    }

    try {
      const { searchQuery, domains } = await this._determineSearchQuery(query);
      const tools = this.tool.getTools();
      const currentPersona = this.conversation.getCurrentPersona();
      const personaSystemPrompt = getPersonaSystemPrompt(SystemPrompts.INITIAL, currentPersona);

      console.log(`Using persona: ${currentPersona.displayName} for streaming response`);

      let currentStep = 0;
      const MAX_STEPS = 5;

      while (currentStep < MAX_STEPS) {
        currentStep++;
        const currentMessages = contextMessages ? messages : this.conversation.getConversationHistory();
        console.log(`Streaming Step ${currentStep}/${MAX_STEPS}`);

        let stream;
        try {
          stream = this.anthropic.messages.stream({
            model: config.model.name,
            max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
            system: personaSystemPrompt,
            messages: currentMessages,
            tools: tools.length > 0 ? tools : undefined,
          });
        } catch (streamError: any) {
          console.error("Error creating stream:", streamError);
          throw streamError;
        }

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const shouldContinue = await sendChunk(chunk.delta.text);
            if (!shouldContinue) {
              stream.controller.abort();
              return;
            }
          }
        }

        // Get the full final message to add to history
        const finalMessage = await stream.finalMessage();
        this.conversation.addAssistantMessageContent(finalMessage.content);

        // Check for tool use
        const toolUseBlocks = finalMessage.content.filter(block => block.type === 'tool_use');

        if (toolUseBlocks.length === 0) {
          // No tools used, we are done
          break;
        }

        // Handle tool uses
        for (const toolUse of toolUseBlocks) {
          if (toolUse.type !== 'tool_use') continue; // Just for TS narrowing

          try {
            const { toolResult, formattedToolCall } = await this._handleToolUse(
              { name: toolUse.name, input: toolUse.input, id: toolUse.id },
              { searchQuery, domains }
            );

            // Optionally send the tool call UI to the client if the callback supports it (assuming text-based HTML for now)
            // The current callback expects a string, so we send the HTML string
            await callback(formattedToolCall);

            this.conversation.addToolResultMessage(toolUse.id, toolResult.content);
          } catch (toolError) {
            console.error(`Error handling tool call ${toolUse.id}:`, toolError);
            const errorMessage = `\n\nError executing tool: ${String(toolError instanceof Error ? toolError.message : String(toolError)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n\n`;
            await callback(errorMessage);
          }
        }

        // Loop continues to next step...
      }

    } catch (error: any) {
      console.error("Error processing query:", error);

      // Error handling logic
      let errorMessage = "Kính thưa quý khách, hệ thống đang gặp trục trặc kỹ thuật.";

      if (error?.message?.includes('rate limit') || error?.type === 'rate_limit_error') {
        errorMessage = 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi một lát rồi thử lại.';
      } else if (error?.error?.error?.message?.toLowerCase().includes('credit balance')) {
        errorMessage = 'Số dư tín dụng API Anthropic của bạn quá thấp.';
      }

      await callback(errorMessage);
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
        model: "claude-haiku-4-5-20251001",  // Use a smaller, faster model
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