import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Get Supabase API credentials from .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file");
  process.exit(1);
}

// Resolve JSONL path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetPath = path.join(__dirname, "data/emath_dataset.jsonl");

if (!fs.existsSync(datasetPath)) {
  console.error(`❌ File not found: ${datasetPath}`);
  process.exit(1);
}

// Load JSONL file (strip BOM if present)
const rawContent = fs.readFileSync(datasetPath, "utf-8")
  .replace(/^\uFEFF/, ''); // Remove UTF-8 BOM if present

const lines = rawContent
  .split("\n")
  .map(line => line.trim()) // Remove trailing \r and whitespace
  .filter(Boolean);

console.log(`📘 Inserting ${lines.length} questions via REST API...`);

for (const line of lines) {
  try {
    const data = JSON.parse(line);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        topic: data.topic || 'Unknown',
        question: data.question || 'No question found',
        options: data.options || [],
        correct_index: data.correct_index || 0,
        level: data.level || null,
        subject: data.subject || null
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    console.log(`✅ Inserted: ${data.topic} - ${data.question.substring(0, 50)}...`);
  } catch (err) {
    console.error("⚠️ Failed to insert line:", err.message);
  }
}

console.log("✅ Done inserting all questions!");