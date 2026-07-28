// utils.js — helper functions for Resume Analyzer

/**
 * Cleans raw text extracted from Azure Document Intelligence.
 * Removes noise, collapses whitespace, normalises line endings.
 */
function cleanExtractedText(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  return rawText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/ {2,}/g, " ")
    .split("\n").map(l => l.trim()).join("\n")
    .trim();
}

/**
 * Truncates text to a max character count at a sentence boundary.
 * Resumes rarely exceed 2 pages so 6000 chars is a safe ceiling.
 */
function truncateText(text, maxChars = 6000) {
  if (!text || text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastPeriod = cut.lastIndexOf(".");
  return lastPeriod > maxChars * 0.8 ? cut.slice(0, lastPeriod + 1) : cut;
}

/**
 * Validates that the uploaded file is a PDF and within size limits.
 */
function validatePdfFile(file) {
  if (!file) return { valid: false, error: "No file provided." };
  const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { valid: false, error: "Only PDF files are supported." };
  if (file.size > 5 * 1024 * 1024) return { valid: false, error: "File too large. Maximum size is 5 MB." };
  return { valid: true };
}

module.exports = { cleanExtractedText, truncateText, validatePdfFile };
