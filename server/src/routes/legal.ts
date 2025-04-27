import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

// Helper function to read legal documents
async function readLegalDocument(filename: string, documentType: string) {
  try {
    const filePath = path.join(__dirname, '../data/legal', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, data: { content }, documentType };
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return { success: false, error: 'Failed to load document', documentType };
  }
}

// Socket.IO event handler for legal documents
export const handleLegalDocumentRequest = async (socket: any, documentType: string) => {
  const filename = documentType === 'terms' ? 'terms-and-conditions.md' : 'privacy-policy.md';
  const result = await readLegalDocument(filename, documentType);
  socket.emit('legal-document', result);
};

// REST API endpoints
router.get('/terms', async (req, res) => {
  const result = await readLegalDocument('terms-and-conditions.md', 'terms');
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

router.get('/privacy', async (req, res) => {
  const result = await readLegalDocument('privacy-policy.md', 'privacy');
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

export default router; 