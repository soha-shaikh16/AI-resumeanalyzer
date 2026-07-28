// server.js — Resume Analyzer Express backend

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");

const { extractTextFromPdf } = require("./azureService");
const { analyzeResume } = require("./aiService");
const { validatePdfFile } = require("./utils");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── Multer: store uploads in memory ───────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new Error("Only PDF files are allowed."));
  },
});

// ── POST /analyze ──────────────────────────────────────────────────────────────
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    const validation = validatePdfFile(req.file);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    console.log(`\n📄 Resume: ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB)`);

    // Step 1: Extract text
    console.log("🔍 Extracting text via Azure...");
    const extractedText = await extractTextFromPdf(req.file.buffer);

    if (!extractedText || extractedText.length < 80) {
      return res.status(422).json({ error: "Could not extract text from this PDF. Please use a text-based PDF." });
    }
    console.log(`✅ Extracted ${extractedText.length} characters.`);

    // Step 2: AI analysis
    console.log("🤖 Analyzing with Gemini...");
    const analysis = await analyzeResume(extractedText);

    console.log(`✅ Analysis complete. Overall score: ${analysis.overallScore}/100`);
    return res.json({ success: true, fileName: req.file.originalname, ...analysis });

  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: error.message || "Unexpected error. Please try again." });
  }
});

// ── Fallback ───────────────────────────────────────────────────────────────────
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

// ── Multer error handler ───────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large. Max 5 MB." });
  return res.status(400).json({ error: err.message || "Upload error." });
});

app.listen(PORT, () => console.log(`\n🚀 Resume Analyzer running at http://localhost:${PORT}\n`));
