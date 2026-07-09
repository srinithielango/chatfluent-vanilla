// Vercel Serverless Function.
// Lives at /api/check-challenge-answer, callable from the browser as
// fetch("/api/check-challenge-answer", { method: "POST", ... }).
//
// This is the ONLY place GROQ_API_KEY is used — it stays in Vercel's
// server-side environment variables and is never sent to the browser.
// (Note: plain GROQ_API_KEY here, NOT NEXT_PUBLIC_GROQ_API_KEY — the
// NEXT_PUBLIC_ prefix is what would have exposed it to the client.)

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tamilSentence, correctAnswer, studentAnswer } = req.body || {};

  if (!tamilSentence || !correctAnswer || !studentAnswer) {
    return res.status(400).json({ error: "Missing tamilSentence, correctAnswer, or studentAnswer" });
  }

  const prompt = `You are grading a Tamil-to-English translation exercise for a beginner student.

Tamil sentence: ${tamilSentence}
Model correct English translation: ${correctAnswer}
Student's typed English answer: ${studentAnswer}

Judge if the student's answer is an ACCEPTABLE translation of the Tamil sentence — it does
not need to match the model answer word-for-word, just be grammatically correct and convey
the same meaning.

Respond with ONLY valid JSON, no markdown fences, no commentary, shaped exactly as:
{
  "correct": true or false,
  "correctSentence": "the best natural English translation",
  "grammarExplanation": "one short sentence explaining any grammar issue, or what the student did well if correct",
  "vocabularyExplanation": "one short sentence highlighting a useful word or phrase from this sentence",
  "marks": a number from 0 to 10 reflecting how close the student's answer was
}`;

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!groqResponse.ok) {
      const text = await groqResponse.text();
      return res.status(502).json({ error: `Groq API error: ${text}` });
    }

    const data = await groqResponse.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "Could not parse AI response", raw });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
}