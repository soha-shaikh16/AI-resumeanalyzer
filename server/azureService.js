// azureService.js — Azure Document Intelligence integration

const axios = require("axios");
const { cleanExtractedText } = require("./utils");

async function extractTextFromPdf(pdfBuffer) {
  const endpoint = process.env.AZURE_ENDPOINT.replace(/\/$/, "");
  const apiKey = process.env.AZURE_KEY;

  if (!endpoint || !apiKey) {
    throw new Error("Azure credentials missing. Check AZURE_ENDPOINT and AZURE_KEY in .env");
  }

  // Try API URL formats in order until one responds with 202
  const candidateUrls = [
    `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
    `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2022-08-31`,
    `${endpoint}/formrecognizer/v2.1/layout/analyze`,
    `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`,
  ];

  let operationUrl = null;
  let lastError = null;

  for (const url of candidateUrls) {
    try {
      console.log(`🔗 Trying: ${url}`);
      const response = await axios.post(url, pdfBuffer, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey, "Content-Type": "application/pdf" },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      operationUrl = response.headers["operation-location"];
      if (operationUrl) { console.log("✅ Azure accepted request."); break; }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      console.log(`❌ Failed (${status}): ${msg}`);
      lastError = err;
      if (status !== 404) throw new Error(`Azure error (${status}): ${msg}`);
    }
  }

  if (!operationUrl) {
    throw new Error(`Could not reach Azure. Verify AZURE_ENDPOINT and AZURE_KEY. Last error: ${lastError?.message}`);
  }

  return await pollForResult(operationUrl, apiKey);
}

async function pollForResult(operationUrl, apiKey, maxRetries = 20, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    await sleep(delay);
    const res = await axios.get(operationUrl, { headers: { "Ocp-Apim-Subscription-Key": apiKey } });
    const { status } = res.data;
    console.log(`⏳ Poll ${i + 1}: ${status}`);
    if (status === "succeeded") return parseAzureResult(res.data);
    if (status === "failed") throw new Error(`Azure failed: ${res.data.error?.message || "unknown"}`);
  }
  throw new Error("Azure timed out. Try a smaller file.");
}

function parseAzureResult(result) {
  if (result.analyzeResult?.pages) {
    const lines = result.analyzeResult.pages.flatMap(p => (p.lines || []).map(l => l.content));
    return cleanExtractedText(lines.join("\n"));
  }
  if (result.analyzeResult?.readResults) {
    const lines = result.analyzeResult.readResults.flatMap(p => (p.lines || []).map(l => l.text));
    return cleanExtractedText(lines.join("\n"));
  }
  throw new Error("Unexpected Azure response format.");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { extractTextFromPdf };
