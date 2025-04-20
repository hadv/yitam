import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { HTMLFormatter } from "../utils/HTMLFormatter";

export class ToolService {
  private tools: Tool[] = [];
  private toolSchemas: Map<string, any> = new Map();

  constructor() {}

  /**
   * Stores tool information for future use
   */
  registerTools(tools: any[]): void {
    this.tools = tools.map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
    
    // Store the tool schemas for reference during tool calls
    for (const tool of tools) {
      try {
        // Handle both string and object schema formats
        let schema: any;
        if (typeof tool.inputSchema === 'string') {
          schema = JSON.parse(tool.inputSchema);
        } else {
          // If it's already an object, use it directly
          schema = tool.inputSchema;
        }
        this.toolSchemas.set(tool.name, schema);
        console.log(`Loaded schema for tool: ${tool.name}`);
      } catch (e) {
        console.error(`Failed to parse schema for tool ${tool.name}:`, e);
      }
    }
  }

  /**
   * Enriches tool arguments with additional context if needed
   */
  enrichToolArguments(toolName: string, toolArgs: any, searchQuery: string): any {
    // Get the tool schema if available
    const toolSchema = this.toolSchemas.get(toolName);
    const enrichedArgs = { ...toolArgs };
    
    // If we have a schema, use it to validate and provide defaults
    if (toolSchema && toolSchema.properties) {
      // Check for search query parameters that might benefit from the extracted search query
      const queryParams = ['query', 'search', 'q', 'searchTerm']; 
      
      for (const paramName of Object.keys(toolSchema.properties)) {
        // If it's a query parameter, ensure it has a value
        if (queryParams.includes(paramName.toLowerCase())) {
          if (!enrichedArgs[paramName] && typeof enrichedArgs[paramName] !== 'boolean') {
            console.log(`Tool ${toolName} is missing ${paramName} parameter, using extracted search query`);
            enrichedArgs[paramName] = searchQuery || "general information";
          } else if (typeof enrichedArgs[paramName] === 'string') {
            // If query exists but might benefit from the extracted version
            const originalQuery = enrichedArgs[paramName] as string;
            if (searchQuery && searchQuery !== originalQuery && originalQuery === toolArgs[paramName]) {
              console.log(`Modified tool query parameter ${paramName}: "${originalQuery}" -> "${searchQuery}"`);
              enrichedArgs[paramName] = searchQuery;
            }
          }
        } 
        
        // If required parameters are missing but have defaults in the schema, add them
        if (toolSchema.required?.includes(paramName) && 
            (enrichedArgs[paramName] === undefined || enrichedArgs[paramName] === null)) {
            
          const paramSchema = toolSchema.properties[paramName];
          if (paramSchema.default !== undefined) {
            console.log(`Adding default value for required parameter ${paramName}: ${paramSchema.default}`);
            enrichedArgs[paramName] = paramSchema.default;
          }
        }
      }
      
      // Add limit parameter based on schema information, not tool name
      if (toolSchema.properties.limit && !enrichedArgs.limit && typeof enrichedArgs.limit !== 'number') {
        // Log what limit was explicitly set by the LLM, if any
        if (toolArgs.limit !== undefined) {
          console.log(`Using LLM-specified limit for ${toolName}: ${toolArgs.limit}`);
        } else {
          console.log(`LLM did not specify limit for ${toolName}, using schema default`);
          enrichedArgs.limit = toolSchema.properties.limit.default || 10;
        }
      }
    }

    return enrichedArgs;
  }

  /**
   * Creates a formatted HTML representation of a tool call
   */
  formatToolCall(
    toolName: string, 
    toolArgs: any, 
    resultContent: string, 
    isError: boolean = false
  ): string {
    // Apply appropriate escaping based on context
    const escapedToolName = HTMLFormatter.safeEscapeHtml(toolName);
    const escapedContent = HTMLFormatter.contentEscapeHtml(resultContent);
    
    // For JSON content, we need to ensure it's valid after escaping
    let escapedArgs;
    try {
      const argsJson = HTMLFormatter.jsonSafeStringify(toolArgs);
      escapedArgs = HTMLFormatter.contentEscapeHtml(argsJson);
    } catch (e) {
      console.error("Error preparing tool arguments for display:", e);
      escapedArgs = HTMLFormatter.contentEscapeHtml(String(toolArgs));
    }
    
    // Format tool call as a collapsible component with properly escaped content
    // Use single quotes for HTML attributes to avoid conflict with content double quotes
    const headerText = isError ? `Error Calling MCP Tool: ${escapedToolName}` : `Called MCP Tool: ${escapedToolName}`;
    
    return `<tool-call data-expanded='${isError ? 'true' : 'false'}' data-tool='${escapedToolName}' ${isError ? "data-error='true'" : ""}>
  <tool-header>${headerText}</tool-header>
  <tool-content>
    <tool-args>${escapedArgs}</tool-args>
    <tool-result>${escapedContent}</tool-result>
  </tool-content>
</tool-call>`;
  }

  /**
   * Returns the list of registered tools
   */
  getTools(): Tool[] {
    return this.tools;
  }
} 