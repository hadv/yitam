import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose();

// Database file path
const CONTEXT_DB_PATH = path.join(__dirname, '../../data/context_engine.db');

// Ensure data directory exists
const dataDir = path.dirname(CONTEXT_DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database instance
let contextDb: sqlite3.Database | null = null;

// Initialize context database connection
export const initializeContextDatabase = (): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    if (contextDb) {
      resolve(contextDb);
      return;
    }

    contextDb = new sqlite.Database(CONTEXT_DB_PATH, (err) => {
      if (err) {
        console.error('Error opening context database:', err);
        reject(err);
        return;
      }
      
      console.log('Connected to Context Engine SQLite database');
      
      // Create tables if they don't exist
      createContextTables()
        .then(() => resolve(contextDb!))
        .catch(reject);
    });
  });
};

// Create context database tables
const createContextTables = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!contextDb) {
      reject(new Error('Context database not initialized'));
      return;
    }

    const tables = [
      // Conversation segments with summaries
      `CREATE TABLE IF NOT EXISTS conversation_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        start_message_id INTEGER NOT NULL,
        end_message_id INTEGER NOT NULL,
        segment_type TEXT NOT NULL CHECK (segment_type IN ('recent', 'medium', 'long', 'ancient')),
        summary TEXT,
        importance_score REAL DEFAULT 0.0,
        token_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES conversations(chat_id)
      )`,

      // Message importance and metadata
      `CREATE TABLE IF NOT EXISTS message_metadata (
        message_id INTEGER PRIMARY KEY,
        chat_id TEXT NOT NULL,
        importance_score REAL DEFAULT 0.0,
        semantic_hash TEXT,
        entities TEXT, -- JSON string of extracted named entities
        topics TEXT,   -- JSON string of identified topics
        user_marked BOOLEAN DEFAULT FALSE,
        compression_level INTEGER DEFAULT 0 CHECK (compression_level BETWEEN 0 AND 5),
        token_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES conversations(chat_id)
      )`,

      // Context retrieval cache
      `CREATE TABLE IF NOT EXISTS context_cache (
        cache_key TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        context_data TEXT, -- JSON string of context data
        token_count INTEGER DEFAULT 0,
        hit_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES conversations(chat_id)
      )`,

      // Vector embeddings metadata
      `CREATE TABLE IF NOT EXISTS embeddings_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER,
        segment_id INTEGER,
        embedding_type TEXT NOT NULL CHECK (embedding_type IN ('message', 'segment', 'summary')),
        vector_id TEXT NOT NULL, -- reference to vector DB
        dimension INTEGER DEFAULT 1536,
        model_name TEXT DEFAULT 'text-embedding-ada-002',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES message_metadata(message_id),
        FOREIGN KEY (segment_id) REFERENCES conversation_segments(id)
      )`,

      // Conversation metadata for context engine
      `CREATE TABLE IF NOT EXISTS conversations (
        chat_id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        total_messages INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        context_strategy TEXT DEFAULT 'adaptive',
        max_context_tokens INTEGER DEFAULT 8000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Key facts and important information
      `CREATE TABLE IF NOT EXISTS key_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        fact_text TEXT NOT NULL,
        fact_type TEXT DEFAULT 'general', -- 'decision', 'preference', 'fact', 'goal'
        importance_score REAL DEFAULT 1.0,
        source_message_id INTEGER,
        extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP, -- NULL for permanent facts
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES conversations(chat_id),
        FOREIGN KEY (source_message_id) REFERENCES message_metadata(message_id)
      )`,

      // Context engine analytics
      `CREATE TABLE IF NOT EXISTS context_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        operation_type TEXT NOT NULL, -- 'retrieve', 'compress', 'summarize'
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        compression_ratio REAL,
        processing_time_ms INTEGER,
        cache_hit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES conversations(chat_id)
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_segments_chat_id ON conversation_segments(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_segments_type ON conversation_segments(segment_type)',
      'CREATE INDEX IF NOT EXISTS idx_segments_importance ON conversation_segments(importance_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_chat_id ON message_metadata(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_importance ON message_metadata(importance_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_user_marked ON message_metadata(user_marked)',
      'CREATE INDEX IF NOT EXISTS idx_cache_chat_id ON context_cache(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_cache_expires ON context_cache(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_embeddings_message ON embeddings_metadata(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_embeddings_segment ON embeddings_metadata(segment_id)',
      'CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings_metadata(embedding_type)',
      'CREATE INDEX IF NOT EXISTS idx_facts_chat_id ON key_facts(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_facts_importance ON key_facts(importance_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_facts_type ON key_facts(fact_type)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_chat_id ON context_analytics(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_operation ON context_analytics(operation_type)'
    ];

    let completed = 0;
    const total = tables.length + indexes.length;

    const checkComplete = () => {
      completed++;
      if (completed === total) {
        console.log('Context Engine database tables and indexes created successfully');
        resolve();
      }
    };

    // Create tables
    tables.forEach((sql) => {
      contextDb!.run(sql, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
          return;
        }
        checkComplete();
      });
    });

    // Create indexes
    indexes.forEach((sql) => {
      contextDb!.run(sql, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          reject(err);
          return;
        }
        checkComplete();
      });
    });
  });
};

// Get context database instance
export const getContextDatabase = (): sqlite3.Database | null => {
  return contextDb;
};

// Close context database connection
export const closeContextDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!contextDb) {
      resolve();
      return;
    }

    contextDb.close((err) => {
      if (err) {
        console.error('Error closing context database:', err);
        reject(err);
        return;
      }
      
      console.log('Context database connection closed');
      contextDb = null;
      resolve();
    });
  });
};

// Database utility functions
export const runContextQuery = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!contextDb) {
      reject(new Error('Context database not initialized'));
      return;
    }

    contextDb.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

export const getContextQuery = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!contextDb) {
      reject(new Error('Context database not initialized'));
      return;
    }

    contextDb.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
};

export const allContextQuery = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (!contextDb) {
      reject(new Error('Context database not initialized'));
      return;
    }

    contextDb.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
};
