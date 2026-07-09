/**
 * One-time content seed for the Tamil → English Challenge.
 * These sentences are hand-written (not AI-generated) so the Tamil
 * is accurate. Run once from your terminal:
 *
 *   npm run seed:challenge
 *
 * Safe to re-run — it skips any level that already has questions.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// 5 levels x 5 questions, difficulty increasing.
const LEVELS = [
  {
    number: 1,
    title: "Everyday Basics",
    questions: [
      { ta: "உங்களுக்கு எப்படி இருக்கிறது?", en: "How are you?" },
      { ta: "என் பெயர் ராஜ்.", en: "My name is Raj." },
      { ta: "நீங்கள் எங்கிருந்து வருகிறீர்கள்?", en: "Where are you from?" },
      { ta: "இது எவ்வளவு?", en: "How much is this?" },
      { ta: "நன்றி.", en: "Thank you." },
    ],
  },
  {
    number: 2,
    title: "Daily Life",
    questions: [
      { ta: "நான் இன்று வேலைக்கு போகவில்லை.", en: "I did not go to work today." },
      { ta: "உங்கள் வீடு எங்கே இருக்கிறது?", en: "Where is your house?" },
      { ta: "எனக்கு தண்ணீர் வேண்டும்.", en: "I need water." },
      { ta: "அவன் பள்ளிக்கு சென்றான்.", en: "He went to school." },
      { ta: "நாளை மழை பெய்யும்.", en: "It will rain tomorrow." },
    ],
  },
  {
    number: 3,
    title: "Simple Conversations",
    questions: [
      { ta: "நான் நேற்று உன்னை பார்க்கவில்லை.", en: "I did not see you yesterday." },
      { ta: "இந்த புத்தகம் யாருடையது?", en: "Whose book is this?" },
      { ta: "அவள் ஒரு நல்ல மாணவி.", en: "She is a good student." },
      { ta: "நான் காலையில் நடைபயிற்சி செய்கிறேன்.", en: "I walk in the morning." },
      { ta: "உங்களுக்கு காபி பிடிக்குமா?", en: "Do you like coffee?" },
    ],
  },
  {
    number: 4,
    title: "Getting Detailed",
    questions: [
      { ta: "நான் அந்த வேலையை முடித்துவிட்டேன்.", en: "I have finished that work." },
      { ta: "அவர் இன்னும் வரவில்லை.", en: "He has not come yet." },
      { ta: "இந்த சாலை மிகவும் நெரிசலாக இருக்கிறது.", en: "This road is very crowded." },
      { ta: "நான் அடுத்த வாரம் சென்னைக்கு போகிறேன்.", en: "I am going to Chennai next week." },
      { ta: "நீங்கள் என்னை ஏன் அழைத்தீர்கள்?", en: "Why did you call me?" },
    ],
  },
  {
    number: 5,
    title: "Real Conversations",
    questions: [
      { ta: "நான் இதற்கு முன் இந்த இடத்திற்கு வந்ததில்லை.", en: "I have never been to this place before." },
      { ta: "அவன் கடினமாக உழைத்தால் வெற்றி பெறுவான்.", en: "If he works hard, he will succeed." },
      { ta: "மழை பெய்தால் நான் வெளியே போக மாட்டேன்.", en: "If it rains, I will not go out." },
      { ta: "இந்த திட்டத்தை நாளைக்குள் முடிக்க வேண்டும்.", en: "This project must be completed by tomorrow." },
      { ta: "உங்கள் கருத்தை பகிர்ந்து கொள்ள முடியுமா?", en: "Could you share your opinion?" },
    ],
  },
];

async function main() {
  for (const level of LEVELS) {
    const levelId = `challenge-${level.number}`;

    await supabase
      .from("challenge_levels")
      .upsert({ id: levelId, level_number: level.number, title: level.title }, { onConflict: "id" });

    const { count } = await supabase
      .from("challenge_questions")
      .select("id", { count: "exact", head: true })
      .eq("challenge_level_id", levelId);

    if (count && count > 0) {
      console.log(`${levelId}: already has ${count} questions, skipping`);
      continue;
    }

    const rows = level.questions.map((q, i) => ({
      challenge_level_id: levelId,
      tamil_sentence: q.ta,
      correct_answer_en: q.en,
      sort_order: i,
    }));

    const { error } = await supabase.from("challenge_questions").insert(rows);
    if (error) throw error;

    console.log(`${levelId}: inserted ${rows.length} questions`);
  }

  console.log("\nDone seeding Tamil challenge questions.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});