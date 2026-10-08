// Background Service Worker
console.log('[Worksheet Extractor] Background service worker active.');

const DEFAULT_API_KEY = '';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SOLVE_SINGLE_QUESTION') {
    handleSolveSingleQuestion(request.questionData)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function handleSolveSingleQuestion(qData) {
  const storage = await chrome.storage.local.get(['gemini_api_key']);
  const apiKey = storage.gemini_api_key || DEFAULT_API_KEY;

  const isMultiHint = qData.isMultiHint ? '\nNote: This question allows MULTIPLE answers (Multi-Select). If more than one choice is correct, include ALL correct letters in "correctOptions".' : '';

  const prompt = `You are a high-speed academic test solver.
Solve this single question accurately and identify the correct choice(s) or write-in answer.
${isMultiHint}

Question:
"${qData.question}"

Available Choices/Options:
${qData.options && qData.options.length > 0 ? qData.options.map(o => `${o.label}) ${o.text}`).join('\n') : 'None (Short Answer)'}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "isMultiSelect": true | false,
  "correctOption": "A" | "B" | "C" | "D" | null, // primary/first correct letter if MCQ, null if short answer
  "correctOptions": ["A", "C"], // array of all correct option letters (if multi-select or single choice, e.g. ["A", "C"] or ["B"]), empty [] if short answer
  "answerText": "<exact text of option(s) or concise write-in answer>",
  "explanation": "<1-2 short sentences explaining why this answer is correct>"
}`;

  let lastError = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('No response from AI model');

      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return { success: true, result: parsed };
    } catch (err) {
      console.warn(`[Background] Model ${model} failed, trying fallback:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to solve question with Gemini API.');
}
