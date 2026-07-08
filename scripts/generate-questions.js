/**
 * One-time content generation script.
 *
 * Uses Groq (llama-3.3-70b-versatile) to draft question banks for each
 * category, then inserts them into Supabase via the service role key.
 *
 * This script is NEVER run during gameplay. Gameplay only reads
 * pre-stored rows from the `questions` table.
 *
 * Usage:
 *   GROQ_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *   node scripts/generate-questions.js
 *
 * or, with a .env file present:
 *   npm run seed
 */
const { createClient } = require("@supabase/supabase-js");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GROQ_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Required: GROQ_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Category id -> { display name, how many levels, questions per level }
const CATEGORIES = {
  greetings: { name: "Greetings", levels: 12, questionsPerLevel: 12 },
  shopping: { name: "Shopping", levels: 12, questionsPerLevel: 12 },
  travel: { name: "Travel", levels: 12, questionsPerLevel: 12 },
  "daily-conversation": { name: "Daily Conversation", levels: 12, questionsPerLevel: 12 },
};

function difficultyBandFor(levelNumber) {
  if (levelNumber <= 3) {
    return "CEFR A1 (absolute beginner). Very short, common everyday sentences. Simple present tense mostly.";
  }
  if (levelNumber <= 6) {
    return "CEFR A2 (elementary). Slightly longer sentences, some past tense, common phrasal verbs.";
  }
  if (levelNumber <= 9) {
    return "CEFR B1 (intermediate). Natural conversational sentences, idioms, polite requests, some nuance between the wrong options (make the incorrect ones more plausible, not obviously silly).";
  }
  return "CEFR B1+/B2 (upper intermediate). Longer, more natural exchanges, indirect phrasing, subtle tone (e.g. sarcasm, hedging, small talk), and wrong options that are believable but subtly off in tone or context.";
}

async function generateQuestionsForLevel(categoryName, levelNumber, count) {
  const band = difficultyBandFor(levelNumber);
  const prompt = `Generate ${count} English conversation Q&A items for the category "${categoryName}", level ${levelNumber} of 12.
Difficulty for this level: ${band}
Return ONLY a valid JSON array, no markdown fences, no commentary. Each item shaped exactly as:
{"questionText": "...", "options": ["natural correct reply", "plausible-sounding but wrong reply", "silly/unrelated wrong reply"], "correctAnswer": "the exact string of the correct option"}
Rules:
- Exactly one of the 3 options must be the natural, correct reply and must match "correctAnswer" exactly.
- Match the difficulty band above — later levels should clearly feel harder than earlier ones in the same category, not just re-worded.
- questionText should be a single chat message an English speaker might send (e.g. "How are you?", "Can I try this on?").
- Vary sentence structure across items, don't repeat the same question twice.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.8,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "[]";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse Groq response as JSON:\n", raw);
    throw err;
  }

  return parsed;
}

async function upsertCategoryAndLevels(categoryId, categoryName, levelCount) {
  await supabase
    .from("categories")
    .upsert({ id: categoryId, name: categoryName }, { onConflict: "id" });

  const levelRows = Array.from({ length: levelCount }, (_, i) => ({
    id: `${categoryId}-${i + 1}`,
    category_id: categoryId,
    level_number: i + 1,
    title: `${categoryName} - Level ${i + 1}`,
  }));

  const { error } = await supabase.from("levels").upsert(levelRows, { onConflict: "id" });
  if (error) throw error;

  return levelRows;
}

async function insertQuestions(levelId, items) {
  const rows = items.map((item, index) => ({
    level_id: levelId,
    question_text: item.questionText,
    options: item.options,
    correct_answer: item.correctAnswer,
    sort_order: index,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) throw error;
}

async function main() {
  for (const [categoryId, config] of Object.entries(CATEGORIES)) {
    console.log(`\n=== ${config.name} ===`);
    const levels = await upsertCategoryAndLevels(categoryId, config.name, config.levels);

    for (const level of levels) {
      // Skip levels that already have questions so re-runs are cheap.
      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("level_id", level.id);

      if (count && count > 0) {
        console.log(`  ${level.id}: already has ${count} questions, skipping`);
        continue;
      }

      console.log(`  ${level.id}: generating ${config.questionsPerLevel} questions...`);
      const items = await generateQuestionsForLevel(
        config.name,
        level.level_number,
        config.questionsPerLevel
      );
      await insertQuestions(level.id, items);
      console.log(`  ${level.id}: inserted ${items.length} questions`);
    }
  }

  console.log("\nDone seeding question banks.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});