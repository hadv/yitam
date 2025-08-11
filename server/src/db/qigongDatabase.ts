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


