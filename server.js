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

// GET: Proxy Google Translate GTX API requests to bypass browser CORS restrictions (especially on iOS Safari)
app.get('/api/gtx', async (req, res) => {
  try {
    const { sl, tl, q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query' });
    const sourceLang = sl || 'auto';
    const targetLang = tl || 'en';
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=at&dt=bd&q=${encodeURIComponent(q)}`;
    const response = await fetch(gtxUrl);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ error: 'GTX upstream error' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
