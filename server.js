const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure the shared_vocab directory exists
const sharedDir = path.join(__dirname, "shared_vocab");
if (!fs.existsSync(sharedDir)) {
  fs.mkdirSync(sharedDir);
}

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sharedDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and append .json
    let name = file.originalname.replace(/[^a-zA-Z0-9_\-\s]/g, "");
    if (!name.endsWith(".json")) {
      name += ".json";
    }
    cb(null, name);
  }
});
const upload = multer({ storage: storage });

// API Endpoints

// 1. Upload vocabulary set
app.post("/api/upload", upload.single("vocabFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({ success: true, filename: req.file.filename });
});

// 2. List shared vocabulary sets
app.get("/api/list", (req, res) => {
  try {
    const files = fs.readdirSync(sharedDir);
    const result = [];

    files.forEach(file => {
      if (file.endsWith(".json")) {
        const filePath = path.join(sharedDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          
          // Custom sets usually contain { vocab: [...], folders: [...] }
          let wordCount = 0;
          if (parsed && Array.isArray(parsed)) {
            wordCount = parsed.length;
          } else if (parsed && Array.isArray(parsed.vocab)) {
            wordCount = parsed.vocab.length;
          }

          const stats = fs.statSync(filePath);

          result.push({
            filename: file,
            name: file.replace(".json", ""),
            wordCount: wordCount,
            size: stats.size,
            updatedAt: stats.mtime
          });
        } catch (e) {
          // Skip unparsable files
        }
      }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Download shared vocabulary set
app.get("/api/download/:filename", (req, res) => {
  const filePath = path.join(sharedDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// 4. Delete shared vocabulary set
app.delete("/api/delete/:filename", (req, res) => {
  const filePath = path.join(sharedDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Serve static assets of VocTrainer app
app.use(express.static(__dirname));

// Fallback to index.html for single page routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`VocTrainer full-stack server running on port ${PORT}`);
});
