import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose();

// Database file path
const DB_PATH = path.join(__dirname, '../../data/shared_conversations.db');

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

    const createVesselsTable = `
      CREATE TABLE IF NOT EXISTS vessels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createAcupointsTable = `
      CREATE TABLE IF NOT EXISTS acupoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        vessel_id INTEGER NOT NULL,
        chinese_characters TEXT,
        pinyin TEXT,
        vietnamese_name TEXT NOT NULL,
        description TEXT,
        usage TEXT,
        notes TEXT,
        image_url TEXT,
        x_coordinate REAL,
        y_coordinate REAL,
        bounding_box TEXT, -- JSON string for bounding box coordinates
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vessel_id) REFERENCES vessels (id)
      )
    `;

    db.run(createSharedConversationsTable, (err) => {
      if (err) {
        console.error('Error creating shared_conversations table:', err);
        reject(err);
        return;
      }

      // Create vessels table first (referenced by acupoints)
      if (db) {
        db.run(createVesselsTable, (err) => {
          if (err) {
            console.error('Error creating vessels table:', err);
            reject(err);
            return;
          }

          // Create acupoints table
          if (db) {
            db.run(createAcupointsTable, (err) => {
              if (err) {
                console.error('Error creating acupoints table:', err);
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
                  'ALTER TABLE shared_conversations ADD COLUMN view_count INTEGER DEFAULT 0',
                  'ALTER TABLE vessels ADD COLUMN image_url TEXT',
                  'ALTER TABLE acupoints ADD COLUMN vessel_id INTEGER REFERENCES vessels(id)',
                  'ALTER TABLE acupoints ADD COLUMN image_url TEXT',
                  'ALTER TABLE acupoints ADD COLUMN x_coordinate REAL',
                  'ALTER TABLE acupoints ADD COLUMN y_coordinate REAL'
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

              // No default data seeding - let admin add data themselves

              console.log('Database tables created successfully');
              resolve();
            });
          } else {
            reject(new Error('Database not initialized'));
          }
        });
      } else {
        reject(new Error('Database not initialized'));
      }
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

export interface Vessel {
  id?: number;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Acupoints {
  id?: number;
  symbol: string;
  vessel_id: number;
  chinese_characters?: string;
  pinyin?: string;
  vietnamese_name: string;
  description?: string;
  usage?: string;
  notes?: string;
  image_url?: string;
  // Coordinates for highlighting on vessel image (percentage-based)
  x_coordinate?: number; // X position as percentage (0-100)
  y_coordinate?: number; // Y position as percentage (0-100)
  created_at?: string;
  updated_at?: string;
}

export interface CreateVesselRequest {
  name: string;
  description?: string;
  image_url?: string;
}

export interface UpdateVesselRequest {
  name?: string;
  description?: string;
  image_url?: string;
}

export interface CreateAcupointsRequest {
  symbol: string;
  vessel_id: number;
  chinese_characters?: string;
  pinyin?: string;
  vietnamese_name: string;
  description?: string;
  usage?: string;
  notes?: string;
  image_url?: string;
  x_coordinate?: number;
  y_coordinate?: number;
  bounding_box?: any; // JSON object for bounding box coordinates
}

export interface UpdateAcupointsRequest {
  symbol?: string;
  vessel_id?: number;
  chinese_characters?: string | null;
  pinyin?: string | null;
  vietnamese_name?: string;
  description?: string | null;
  usage?: string | null;
  notes?: string | null;
  image_url?: string | null;
  x_coordinate?: number | null;
  y_coordinate?: number | null;
}

// Vessel CRUD operations
export const getAllVessels = (): Promise<Vessel[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = 'SELECT * FROM vessels ORDER BY name ASC';
    db.all(query, [], (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching vessels:', err);
        reject(err);
        return;
      }
      resolve(rows as Vessel[]);
    });
  });
};

export const getVesselById = (id: number): Promise<Vessel | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = 'SELECT * FROM vessels WHERE id = ?';
    db.get(query, [id], (err, row: any) => {
      if (err) {
        console.error('Error fetching vessel by ID:', err);
        reject(err);
        return;
      }
      resolve(row as Vessel || null);
    });
  });
};

export const createVessel = (data: CreateVesselRequest): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = `
      INSERT INTO vessels (name, description, image_url, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      data.name,
      data.description || null,
      data.image_url || null
    ];

    db.run(query, params, function(err) {
      if (err) {
        console.error('Error creating vessel:', err);
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
};

export const updateVessel = (id: number, data: UpdateVesselRequest): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.image_url !== undefined) {
      updates.push('image_url = ?');
      params.push(data.image_url);
    }

    if (updates.length === 0) {
      resolve(false);
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE vessels SET ${updates.join(', ')} WHERE id = ?`;

    db.run(query, params, function(err) {
      if (err) {
        console.error('Error updating vessel:', err);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
};

export const deleteVessel = (id: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    // First check if any herbal medicine items reference this category
    const checkQuery = 'SELECT COUNT(*) as count FROM acupoints WHERE vessel_id = ?';
    db.get(checkQuery, [id], (err, row: any) => {
      if (err) {
        console.error('Error checking vessel references:', err);
        reject(err);
        return;
      }

      if (row.count > 0) {
        reject(new Error('Cannot delete category: it is referenced by herbal medicine items'));
        return;
      }

      // Safe to delete
      const deleteQuery = 'DELETE FROM vessels WHERE id = ?';
      if (db) {
        db.run(deleteQuery, [id], function(err) {
          if (err) {
            console.error('Error deleting vessel:', err);
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        });
      } else {
        reject(new Error('Database not initialized'));
      }
    });
  });
};

// Acupoints CRUD operations
export const getAllAcupoints = (vesselId?: number): Promise<Acupoints[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    let query = 'SELECT * FROM acupoints';
    const params: any[] = [];

    if (vesselId) {
      query += ' WHERE vessel_id = ?';
      params.push(vesselId);
    }

    query += ' ORDER BY vessel_id ASC, symbol ASC';

    db.all(query, params, (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching herbal medicine data:', err);
        reject(err);
        return;
      }
      resolve(rows as Acupoints[]);
    });
  });
};

export const getAcupointById = (id: number): Promise<Acupoints | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = 'SELECT * FROM acupoints WHERE id = ?';
    db.get(query, [id], (err, row: any) => {
      if (err) {
        console.error('Error fetching herbal medicine by ID:', err);
        reject(err);
        return;
      }
      resolve(row as Acupoints || null);
    });
  });
};

export const createAcupoint = (data: CreateAcupointsRequest): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = `
      INSERT INTO acupoints (
        symbol, vessel_id, chinese_characters, pinyin, vietnamese_name,
        description, usage, notes, image_url, x_coordinate, y_coordinate, bounding_box, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      data.symbol,
      data.vessel_id,
      data.chinese_characters || null,
      data.pinyin || null,
      data.vietnamese_name,
      data.description || null,
      data.usage || null,
      data.notes || null,
      data.image_url || null,
      data.x_coordinate || null,
      data.y_coordinate || null,
      data.bounding_box ? JSON.stringify(data.bounding_box) : null
    ];

    db.run(query, params, function(err) {
      if (err) {
        console.error('Error creating herbal medicine:', err);
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
};

export const updateAcupoint = (id: number, data: UpdateAcupointsRequest): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.symbol !== undefined) {
      updates.push('symbol = ?');
      params.push(data.symbol);
    }
    if (data.vessel_id !== undefined) {
      updates.push('vessel_id = ?');
      params.push(data.vessel_id);
    }
    if (data.chinese_characters !== undefined) {
      updates.push('chinese_characters = ?');
      params.push(data.chinese_characters);
    }
    if (data.pinyin !== undefined) {
      updates.push('pinyin = ?');
      params.push(data.pinyin);
    }
    if (data.vietnamese_name !== undefined) {
      updates.push('vietnamese_name = ?');
      params.push(data.vietnamese_name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.usage !== undefined) {
      updates.push('usage = ?');
      params.push(data.usage);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    if (data.image_url !== undefined) {
      updates.push('image_url = ?');
      params.push(data.image_url);
    }
    if (data.x_coordinate !== undefined) {
      updates.push('x_coordinate = ?');
      params.push(data.x_coordinate);
    }
    if (data.y_coordinate !== undefined) {
      updates.push('y_coordinate = ?');
      params.push(data.y_coordinate);
    }

    if (updates.length === 0) {
      resolve(false);
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE acupoints SET ${updates.join(', ')} WHERE id = ?`;

    db.run(query, params, function(err) {
      if (err) {
        console.error('Error updating herbal medicine:', err);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
};

export const deleteAcupoint = (id: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const query = 'DELETE FROM acupoints WHERE id = ?';
    db.run(query, [id], function(err) {
      if (err) {
        console.error('Error deleting herbal medicine:', err);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
};




