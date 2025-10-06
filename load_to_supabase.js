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
const datasetPath = path.join(__dirname, "data/training_dataset_clean.jsonl");

if (!fs.existsSync(datasetPath)) {
  console.error(`❌ File not found: ${datasetPath}`);
  process.exit(1);
}

// Load JSONL file
const lines = fs.readFileSync(datasetPath, "utf-8")
  .split("\n")
  .filter(Boolean);

console.log(`📘 Inserting ${lines.length} questions via REST API...`);

for (const line of lines) {
  try {
    const data = JSON.parse(line);
    
    // Extract topic from input field
    const topicMatch = data.input.match(/Topic: ([^\n]+)/);
    const topic = topicMatch ? topicMatch[1] : 'Unknown';
    
    // Extract question from input field
    const questionMatch = data.input.match(/Question: (.+)/s);
    const question = questionMatch ? questionMatch[1].trim() : 'No question found';
    
    // Parse the output JSON
    const output = JSON.parse(data.output);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        topic: topic,
        question: question,
        options: JSON.stringify(output.options || []),
        correct_index: output.correct_index || 0
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    console.log(`✅ Inserted: ${topic} - ${question.substring(0, 50)}...`);
  } catch (err) {
    console.error("⚠️ Failed to insert line:", err.message);
  }
}

console.log("✅ Done inserting all questions!");