import sqlite3 from 'sqlite3';
import * as path from 'path';

// Separate database for Qigong management in /server/data
const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'qigong.db');

// Ensure data directory exists
import * as fs from 'fs';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const qigongDb = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening Qigong database:', err.message);
  } else {
    console.log('Connected to Qigong SQLite database');
  }
});

// Initialize Qigong database schema
export async function initializeQigongDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    qigongDb.serialize(() => {
      // Vessels table
      qigongDb.run(`
        CREATE TABLE IF NOT EXISTS vessels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          chinese_name TEXT,
          description TEXT,
          image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Acupoints table
      qigongDb.run(`
        CREATE TABLE IF NOT EXISTS acupoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          vessel_id INTEGER NOT NULL,
          chinese_characters TEXT,
          pinyin TEXT,
          vietnamese_name TEXT NOT NULL,
          description TEXT,
          usage TEXT,
          notes TEXT,
          image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vessel_id) REFERENCES vessels (id) ON DELETE CASCADE,
          UNIQUE(symbol, vessel_id)
        )
      `);



      console.log('Qigong database schema initialized');
      resolve();
    });
  });
}

// Interfaces for Qigong data
export interface QigongVessel {
  id?: number;
  name: string;
  chinese_name?: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QigongAcupoint {
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
  created_at?: string;
  updated_at?: string;
}



// Vessel operations
export function createQigongVessel(vessel: Omit<QigongVessel, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO vessels (name, chinese_name, description, image_url, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    qigongDb.run(query, [vessel.name, vessel.chinese_name, vessel.description, vessel.image_url], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

export function getQigongVessels(): Promise<QigongVessel[]> {
  return new Promise((resolve, reject) => {
    qigongDb.all('SELECT * FROM vessels ORDER BY created_at DESC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as QigongVessel[]);
      }
    });
  });
}

// Acupoint operations
export function createQigongAcupoint(acupoint: Omit<QigongAcupoint, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO acupoints (
        symbol, vessel_id, chinese_characters, pinyin, vietnamese_name,
        description, usage, notes, image_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      acupoint.symbol,
      acupoint.vessel_id,
      acupoint.chinese_characters || null,
      acupoint.pinyin || null,
      acupoint.vietnamese_name,
      acupoint.description || null,
      acupoint.usage || null,
      acupoint.notes || null,
      acupoint.image_url || null
    ];
    
    qigongDb.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

export function getQigongAcupoints(vesselId?: number): Promise<QigongAcupoint[]> {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM acupoints';
    let params: any[] = [];
    
    if (vesselId) {
      query += ' WHERE vessel_id = ?';
      params.push(vesselId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    qigongDb.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as QigongAcupoint[]);
      }
    });
  });
}

// Update vessel
export function updateQigongVessel(id: number, vessel: Partial<Omit<QigongVessel, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const fields = [];
    const params = [];

    if (vessel.name !== undefined) {
      fields.push('name = ?');
      params.push(vessel.name);
    }
    if (vessel.chinese_name !== undefined) {
      fields.push('chinese_name = ?');
      params.push(vessel.chinese_name);
    }
    if (vessel.description !== undefined) {
      fields.push('description = ?');
      params.push(vessel.description);
    }
    if (vessel.image_url !== undefined) {
      fields.push('image_url = ?');
      params.push(vessel.image_url);
    }

    if (fields.length === 0) {
      resolve(true);
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE vessels SET ${fields.join(', ')} WHERE id = ?`;

    qigongDb.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Delete vessel
export function deleteQigongVessel(id: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    qigongDb.run('DELETE FROM vessels WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Update acupoint
export function updateQigongAcupoint(id: number, acupoint: Partial<Omit<QigongAcupoint, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const fields = [];
    const params = [];

    if (acupoint.symbol !== undefined) {
      fields.push('symbol = ?');
      params.push(acupoint.symbol);
    }
    if (acupoint.vessel_id !== undefined) {
      fields.push('vessel_id = ?');
      params.push(acupoint.vessel_id);
    }
    if (acupoint.chinese_characters !== undefined) {
      fields.push('chinese_characters = ?');
      params.push(acupoint.chinese_characters);
    }
    if (acupoint.pinyin !== undefined) {
      fields.push('pinyin = ?');
      params.push(acupoint.pinyin);
    }
    if (acupoint.vietnamese_name !== undefined) {
      fields.push('vietnamese_name = ?');
      params.push(acupoint.vietnamese_name);
    }
    if (acupoint.description !== undefined) {
      fields.push('description = ?');
      params.push(acupoint.description);
    }
    if (acupoint.usage !== undefined) {
      fields.push('usage = ?');
      params.push(acupoint.usage);
    }
    if (acupoint.notes !== undefined) {
      fields.push('notes = ?');
      params.push(acupoint.notes);
    }
    if (acupoint.image_url !== undefined) {
      fields.push('image_url = ?');
      params.push(acupoint.image_url);
    }

    if (fields.length === 0) {
      resolve(true);
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE acupoints SET ${fields.join(', ')} WHERE id = ?`;

    qigongDb.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Delete acupoint
export function deleteQigongAcupoint(id: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    qigongDb.run('DELETE FROM acupoints WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}


