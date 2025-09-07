import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ContextEngine } from '../services/ContextEngine.js';
import { VectorStoreManager, VectorStoreConfig } from '../services/VectorStore.js';

/**
 * MCP Server for Yitam Context Engine
 * Provides tools for LLM to manage its own memory and context
 */
export class ContextMCPServer {
  private server: Server;
  private contextEngine: ContextEngine;
  private vectorStore: VectorStoreManager;

  constructor() {
    this.server = new Server(
      {
        name: 'yitam-context-engine',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize context engine with default config
    this.contextEngine = new ContextEngine({
      maxRecentMessages: 10,
      maxContextTokens: 8000,
      summarizationThreshold: 20,
      importanceThreshold: 0.3,
      vectorSearchLimit: 5,
      cacheExpiration: 30
    });

    // Initialize vector store with in-memory provider for development
    const vectorConfig: VectorStoreConfig = {
      provider: 'chromadb',
      collectionName: 'yitam_context',
      dimension: 1536,
      embeddingModel: 'text-embedding-ada-002',
      endpoint: process.env.CHROMADB_ENDPOINT || 'http://localhost:8000'
    };
    
    this.vectorStore = new VectorStoreManager(vectorConfig);

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'store_memory',
            description: 'Store important information or facts from the conversation',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                },
                factText: {
                  type: 'string',
                  description: 'The important fact or information to store'
                },
                factType: {
                  type: 'string',
                  enum: ['decision', 'preference', 'fact', 'goal'],
                  description: 'Type of fact being stored'
                },
                importance: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Importance score (0-1, default 0.8)'
                },
                sourceMessageId: {
                  type: 'number',
                  description: 'ID of the source message (optional)'
                }
              },
              required: ['chatId', 'factText']
            }
          },
          {
            name: 'retrieve_context',
            description: 'Retrieve relevant context for the current conversation',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                },
                query: {
                  type: 'string',
                  description: 'Current query or topic to find relevant context for'
                },
                maxTokens: {
                  type: 'number',
                  description: 'Maximum tokens for the context window (default 8000)'
                }
              },
              required: ['chatId']
            }
          },
          {
            name: 'mark_important',
            description: 'Mark a specific message as important for future reference',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: {
                  type: 'number',
                  description: 'ID of the message to mark as important'
                },
                important: {
                  type: 'boolean',
                  description: 'Whether to mark as important (true) or unmark (false)'
                }
              },
              required: ['messageId']
            }
          },
          {
            name: 'summarize_conversation',
            description: 'Create a summary of a conversation segment',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                },
                startMessageId: {
                  type: 'number',
                  description: 'Starting message ID for summarization'
                },
                endMessageId: {
                  type: 'number',
                  description: 'Ending message ID for summarization'
                },
                summaryType: {
                  type: 'string',
                  enum: ['brief', 'detailed', 'key_points'],
                  description: 'Type of summary to generate'
                }
              },
              required: ['chatId', 'startMessageId', 'endMessageId']
            }
          },
          {
            name: 'search_memory',
            description: 'Search for relevant information in conversation memory',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                },
                query: {
                  type: 'string',
                  description: 'Search query for finding relevant memories'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default 5)'
                },
                threshold: {
                  type: 'number',
                  description: 'Minimum similarity threshold (0-1, default 0.7)'
                }
              },
              required: ['chatId', 'query']
            }
          },
          {
            name: 'get_conversation_stats',
            description: 'Get statistics about the conversation and context usage',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                }
              },
              required: ['chatId']
            }
          },
          {
            name: 'forget_context',
            description: 'Remove or reduce importance of old context that is no longer relevant',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'The chat/conversation ID'
                },
                olderThanDays: {
                  type: 'number',
                  description: 'Remove context older than this many days'
                },
                importanceThreshold: {
                  type: 'number',
                  description: 'Only remove context below this importance threshold'
                }
              },
              required: ['chatId']
            }
          }
        ] as Tool[]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'store_memory':
            return await this.handleStoreMemory(args);
          
          case 'retrieve_context':
            return await this.handleRetrieveContext(args);
          
          case 'mark_important':
            return await this.handleMarkImportant(args);
          
          case 'summarize_conversation':
            return await this.handleSummarizeConversation(args);
          
          case 'search_memory':
            return await this.handleSearchMemory(args);
          
          case 'get_conversation_stats':
            return await this.handleGetConversationStats(args);
          
          case 'forget_context':
            return await this.handleForgetContext(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private async handleStoreMemory(args: any) {
    const { chatId, factText, factType = 'fact', importance = 0.8, sourceMessageId } = args;
    
    await this.contextEngine.addKeyFact(chatId, factText, factType, sourceMessageId, importance);
    
    return {
      content: [
        {
          type: 'text',
          text: `Successfully stored ${factType}: "${factText}" with importance ${importance}`
        }
      ]
    };
  }

  private async handleRetrieveContext(args: any) {
    const { chatId, query, maxTokens = 8000 } = args;
    
    // Update context engine config if maxTokens provided
    if (maxTokens !== 8000) {
      this.contextEngine = new ContextEngine({ maxContextTokens: maxTokens });
    }
    
    const context = await this.contextEngine.getOptimizedContext(chatId, query);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalTokens: context.totalTokens,
            compressionRatio: context.compressionRatio,
            recentMessageCount: context.recentMessages.length,
            relevantHistoryCount: context.relevantHistory.length,
            summaryCount: context.summaries.length,
            keyFactCount: context.keyFacts.length,
            context: context
          }, null, 2)
        }
      ]
    };
  }

  private async handleMarkImportant(args: any) {
    const { messageId, important = true } = args;
    
    await this.contextEngine.markMessageImportant(messageId, important);
    
    return {
      content: [
        {
          type: 'text',
          text: `Message ${messageId} ${important ? 'marked as important' : 'unmarked as important'}`
        }
      ]
    };
  }

  private async handleSummarizeConversation(args: any) {
    const { chatId, startMessageId, endMessageId, summaryType = 'brief' } = args;
    
    // This would implement actual summarization logic
    // For now, return a placeholder
    return {
      content: [
        {
          type: 'text',
          text: `Generated ${summaryType} summary for messages ${startMessageId}-${endMessageId} in chat ${chatId}`
        }
      ]
    };
  }

  private async handleSearchMemory(args: any) {
    const { chatId, query, limit = 5, threshold = 0.7 } = args;
    
    const results = await this.vectorStore.findRelevantMessages(query, limit);
    const filteredResults = results.filter(r => r.similarity >= threshold);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query,
            resultCount: filteredResults.length,
            results: filteredResults.map(r => ({
              messageId: r.messageId,
              similarity: r.similarity,
              content: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
              metadata: r.metadata
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetConversationStats(args: any) {
    const { chatId } = args;
    
    const stats = await this.contextEngine.getConversationStats(chatId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  }

  private async handleForgetContext(args: any) {
    const { chatId, olderThanDays, importanceThreshold } = args;
    
    // This would implement context cleanup logic
    return {
      content: [
        {
          type: 'text',
          text: `Context cleanup initiated for chat ${chatId} (older than ${olderThanDays} days, importance < ${importanceThreshold})`
        }
      ]
    };
  }

  async start(): Promise<void> {
    // Initialize services
    await this.contextEngine.initialize();
    await this.vectorStore.initialize();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('Yitam Context Engine MCP Server started');
  }

  async stop(): Promise<void> {
    await this.vectorStore.close();
    console.log('Yitam Context Engine MCP Server stopped');
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new ContextMCPServer();

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  server.start().catch(console.error);
}
