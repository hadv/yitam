import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose();

// Database file path - separate by environment
const getDbPath = () => {
  const env = process.env.NODE_ENV || 'development';
  const dbName = env === 'production' ? 'shared_conversations.db' : `shared_conversations_${env}.db`;
  return path.join(__dirname, '../../data', dbName);
};

const DB_PATH = getDbPath();

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database instance
let db: sqlite3.Database | null = null;

// Initialize database connection
export const initializeDatabase = (): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new sqlite.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database');
      
      // Create tables if they don't exist
      createTables()
        .then(() => resolve(db!))
        .catch(reject);
    });
  });
};

// Create database tables
const createTables = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const createSharedConversationsTable = `
      CREATE TABLE IF NOT EXISTS shared_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        messages TEXT NOT NULL,
        persona_id TEXT,
        user_email TEXT,
        owner_id TEXT,
        access_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        view_count INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT 1,
        is_active BOOLEAN DEFAULT 1
      )
    `;

    db.run(createSharedConversationsTable, (err) => {
      if (err) {
        console.error('Error creating shared_conversations table:', err);
        reject(err);
        return;
      }

      // Add missing columns if they don't exist (migration)
      if (db) {
        const migrations = [
          'ALTER TABLE shared_conversations ADD COLUMN owner_id TEXT',
          'ALTER TABLE shared_conversations ADD COLUMN access_code TEXT',
          'ALTER TABLE shared_conversations ADD COLUMN is_active INTEGER DEFAULT 1',
          'ALTER TABLE shared_conversations ADD COLUMN is_public INTEGER DEFAULT 1',
          'ALTER TABLE shared_conversations ADD COLUMN view_count INTEGER DEFAULT 0'
        ];

        migrations.forEach((migration, index) => {
          if (db) {
            db.run(migration, (err) => {
              if (err && !err.message.includes('duplicate column name')) {
                console.error(`Error running migration ${index + 1}:`, err);
              } else if (!err) {
                console.log(`Migration ${index + 1} completed successfully`);
              }
            });
          }
        });
      }

      console.log('Database tables created successfully');
      resolve();
    });
  });
};

// Get database instance
export const getDatabase = (): sqlite3.Database => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

// Close database connection
export const closeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        reject(err);
        return;
      }
      
      console.log('Database connection closed');
      db = null;
      resolve();
    });
  });
};

// Database interfaces
export interface SharedConversation {
  id: string;
  title: string;
  messages: string; // JSON string
  persona_id?: string;
  user_email?: string;
  owner_id?: string;
  access_code?: string;
  created_at: string;
  expires_at?: string;
  view_count: number;
  is_public: boolean;
  is_active: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  persona_id?: string;
}

export interface ShareConversationRequest {
  title: string;
  messages: ConversationMessage[];
  persona_id?: string;
  user_email?: string;
  owner_id?: string;
  access_code?: string;
  expires_in_days?: number; // Optional expiration
}
