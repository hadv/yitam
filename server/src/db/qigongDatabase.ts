import sqlite3 from 'sqlite3';
import * as path from 'path';

// Separate database for Qigong management
const dbPath = path.join(process.cwd(), 'qigong.db');

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
          x_coordinate REAL,
          y_coordinate REAL,
          bounding_box TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vessel_id) REFERENCES vessels (id) ON DELETE CASCADE,
          UNIQUE(symbol, vessel_id)
        )
      `);

      // Acupoint position mappings (for auto-detect)
      qigongDb.run(`
        CREATE TABLE IF NOT EXISTS acupoint_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
          standard_x_coordinate REAL NOT NULL,
          standard_y_coordinate REAL NOT NULL,
          body_region TEXT,
          meridian TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  x_coordinate?: number;
  y_coordinate?: number;
  bounding_box?: any;
  created_at?: string;
  updated_at?: string;
}

export interface AcupointPosition {
  id?: number;
  symbol: string;
  standard_x_coordinate: number;
  standard_y_coordinate: number;
  body_region?: string;
  meridian?: string;
  description?: string;
  created_at?: string;
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
        description, usage, notes, image_url, x_coordinate, y_coordinate, 
        bounding_box, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      acupoint.image_url || null,
      acupoint.x_coordinate || null,
      acupoint.y_coordinate || null,
      acupoint.bounding_box ? JSON.stringify(acupoint.bounding_box) : null
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
        const acupoints = (rows as QigongAcupoint[]).map(row => ({
          ...row,
          bounding_box: row.bounding_box ? JSON.parse(row.bounding_box) : null
        }));
        resolve(acupoints);
      }
    });
  });
}

// Acupoint position mappings
export function createAcupointPosition(position: Omit<AcupointPosition, 'id' | 'created_at'>): Promise<number> {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO acupoint_positions (symbol, standard_x_coordinate, standard_y_coordinate, body_region, meridian, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    qigongDb.run(query, [
      position.symbol,
      position.standard_x_coordinate,
      position.standard_y_coordinate,
      position.body_region,
      position.meridian,
      position.description
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

export function getAcupointPosition(symbol: string): Promise<AcupointPosition | null> {
  return new Promise((resolve, reject) => {
    qigongDb.get('SELECT * FROM acupoint_positions WHERE symbol = ?', [symbol], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row as AcupointPosition || null);
      }
    });
  });
}

// Initialize standard acupoint positions
export async function seedAcupointPositions(): Promise<void> {
  const standardPositions: Omit<AcupointPosition, 'id' | 'created_at'>[] = [
    // Large Intestine Meridian
    { symbol: 'LI-4', standard_x_coordinate: 25.5, standard_y_coordinate: 45.2, body_region: 'hand', meridian: 'Large Intestine', description: 'Hợp Cốc - between thumb and index finger' },
    { symbol: 'LI-20', standard_x_coordinate: 48.2, standard_y_coordinate: 15.8, body_region: 'face', meridian: 'Large Intestine', description: 'Nghênh Hương - beside nostril' },
    
    // Stomach Meridian
    { symbol: 'ST-36', standard_x_coordinate: 52.1, standard_y_coordinate: 72.5, body_region: 'leg', meridian: 'Stomach', description: 'Túc Tam Lý - below knee' },
    { symbol: 'ST-6', standard_x_coordinate: 46.8, standard_y_coordinate: 18.3, body_region: 'face', meridian: 'Stomach', description: 'Giáp Xa - jaw muscle' },
    
    // Spleen Meridian
    { symbol: 'SP-6', standard_x_coordinate: 48.7, standard_y_coordinate: 78.9, body_region: 'leg', meridian: 'Spleen', description: 'Tam Âm Giao - inner ankle' },
    { symbol: 'SP-3', standard_x_coordinate: 45.3, standard_y_coordinate: 85.2, body_region: 'foot', meridian: 'Spleen', description: 'Thái Bạch - inner foot' },
    
    // Heart Meridian
    { symbol: 'HT-7', standard_x_coordinate: 22.8, standard_y_coordinate: 52.1, body_region: 'wrist', meridian: 'Heart', description: 'Thần Môn - wrist crease' },
    
    // Triple Energizer Meridian
    { symbol: 'TE-5', standard_x_coordinate: 78.2, standard_y_coordinate: 48.6, body_region: 'forearm', meridian: 'Triple Energizer', description: 'Ngoại Quan - outer forearm' },
    
    // Gallbladder Meridian
    { symbol: 'GB-34', standard_x_coordinate: 55.4, standard_y_coordinate: 71.8, body_region: 'leg', meridian: 'Gallbladder', description: 'Dương Lăng Tuyền - outer knee' },
    { symbol: 'GB-20', standard_x_coordinate: 47.5, standard_y_coordinate: 8.2, body_region: 'neck', meridian: 'Gallbladder', description: 'Phong Trì - base of skull' },
    { symbol: 'GB-41', standard_x_coordinate: 58.9, standard_y_coordinate: 88.7, body_region: 'foot', meridian: 'Gallbladder', description: 'Túc Lâm Khấp - outer foot' },
    
    // Liver Meridian
    { symbol: 'LV-3', standard_x_coordinate: 46.1, standard_y_coordinate: 87.3, body_region: 'foot', meridian: 'Liver', description: 'Thái Xung - top of foot' },
    
    // Governing Vessel
    { symbol: 'GV-20', standard_x_coordinate: 50.0, standard_y_coordinate: 5.5, body_region: 'head', meridian: 'Governing Vessel', description: 'Bách Hội - top of head' },
    
    // Conception Vessel
    { symbol: 'CV-17', standard_x_coordinate: 50.0, standard_y_coordinate: 35.8, body_region: 'chest', meridian: 'Conception Vessel', description: 'Đàn Trung - center chest' }
  ];

  for (const position of standardPositions) {
    try {
      await createAcupointPosition(position);
      console.log(`Seeded position for ${position.symbol}`);
    } catch (error) {
      // Position might already exist, continue
      console.log(`Position ${position.symbol} already exists or error:`, error);
    }
  }
}
