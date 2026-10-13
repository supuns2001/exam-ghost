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

  if (request.action === 'CAPTURE_VISIBLE_TAB') {
    const windowId = (sender.tab && typeof sender.tab.windowId === 'number') ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.warn('[Background] captureVisibleTab error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true;
  }

  if (request.action === 'SOLVE_IMAGE_QUESTION') {
    handleSolveImageQuestion(request.imageData, request.optionsList)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleSolveSingleQuestion(qData) {
  const storage = await chrome.storage.local.get(['gemini_api_key']);
  const apiKey = storage.gemini_api_key || DEFAULT_API_KEY;

  let prompt = '';

  if (qData.type === 'dropdown' && qData.dropdowns && qData.dropdowns.length > 0) {
    const blanksFormatted = qData.dropdowns.map((d, idx) => {
      const opts = d.options && d.options.length > 0 ? d.options.map(o => `"${o}"`).join(', ') : 'Free choice';
      return `Blank ${idx + 1} options: [ ${opts} ]`;
    }).join('\n');

    prompt = `You are an elite academic test solver.
This is a multiple-dropdown / fill-in-the-blank (cloze) question.
Read the sentence carefully and choose the single best matching option from the provided choices for each blank in exact order.

Sentence with blanks:
"${qData.question}"

Available Options for Each Blank:
${blanksFormatted}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "type": "dropdown",
  "dropdownAnswers": [
    "<exact text of chosen option for Blank 1>",
    "<exact text of chosen option for Blank 2>"
  ],
  "answerText": "<all chosen answers separated by arrow symbols, e.g. Ans 1 ➔ Ans 2>",
  "explanation": "<1-2 short sentences explaining why these choices complete the sentence accurately>"
}`;
  } else {
    const isMultiHint = qData.isMultiHint ? '\nNote: This question allows MULTIPLE answers (Multi-Select). If more than one choice is correct, include ALL correct letters in "correctOptions".' : '';

    prompt = `You are a high-speed academic test solver.
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
  }

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

async function handleSolveImageQuestion(imageData, optionsList = []) {
  const storage = await chrome.storage.local.get(['gemini_api_key']);
  const apiKey = storage.gemini_api_key || DEFAULT_API_KEY;

  if (!imageData) {
    throw new Error('No image data provided for sniping tool.');
  }

  // Extract pure base64 and mime type
  let base64Data = imageData;
  let mimeType = 'image/png';

  if (imageData.includes(';base64,')) {
    const parts = imageData.split(';base64,');
    mimeType = parts[0].replace('data:', '') || 'image/png';
    base64Data = parts[1];
  } else if (imageData.includes(',')) {
    base64Data = imageData.split(',')[1];
  }

  const domOptionsHint = (optionsList && optionsList.length > 0)
    ? `\nOptions detected in the cropped area: ${optionsList.map(o => `${o.label || ''}) ${o.text || o}`).join(', ')}`
    : '';

  const prompt = `You are an elite academic test solver with multimodal vision capabilities.
Analyze the provided cropped screenshot of a test or quiz question.
1. Transcribe the question and all choices clearly.
2. Determine whether it is multiple choice, multi-select, or write-in/short answer.
3. Solve the question with complete accuracy.${domOptionsHint}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "questionText": "<transcribed question text>",
  "isMultiSelect": true | false,
  "correctOption": "A" | "B" | "C" | "D" | null,
  "correctOptions": ["A"],
  "dropdownAnswers": ["<chosen option text for Blank 1>", "<chosen option text for Blank 2>"] | null,
  "answerText": "<exact text of option(s), chosen dropdown answers separated by ➔, or concise write-in answer>",
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
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
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
      console.warn(`[Background Vision] Model ${model} failed, trying fallback:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to solve image question with Gemini API.');
}

