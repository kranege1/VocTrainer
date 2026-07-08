const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// Increase payload limit to handle potential custom vocab configurations
app.use(express.json({ limit: '50mb' }));

// CORS headers for cross-origin requests (e.g. from GitHub Pages)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files from root directory with caching disabled for HTML, JS, CSS
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Directory to store temporary sync data
const SYNC_DIR = path.join(__dirname, 'sync_data');
if (!fs.existsSync(SYNC_DIR)) {
  fs.mkdirSync(SYNC_DIR);
}

// POST: Create a new sync bin
app.post('/api/vocabdata', (req, res) => {
  try {
    const id = crypto.randomBytes(4).toString('hex'); // 8-character code
    const filePath = path.join(SYNC_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save sync data' });
  }
});

// PUT: Update an existing sync bin
app.put('/api/vocabdata/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(SYNC_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update sync data' });
  }
});

// GET: Retrieve sync data
app.get('/api/vocabdata/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(SYNC_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Sync code not found' });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read sync data' });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
