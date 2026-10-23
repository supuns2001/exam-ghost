// Background Service Worker
console.log('[Worksheet Extractor] Background service worker active.');

const DEFAULT_API_KEY = ''; 
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

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
    handleSolveImageQuestion(request.imageData, request.optionsList, request.domContext)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Native Chrome Keyboard Command Listener (Cross-platform: Windows, Mac, Linux)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'trigger_snip') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SNIP_MODE' }).catch(() => {});
        }
      });
    }
  });
}

async function handleSolveSingleQuestion(qData) {
  const storage = await chrome.storage.local.get(['gemini_api_key']);
  const apiKey = storage.gemini_api_key || DEFAULT_API_KEY;

  let prompt = '';

  if (qData.type === 'dropdown' && qData.dropdowns && qData.dropdowns.length > 0) {
    const blanksFormatted = qData.dropdowns.map((d, idx) => {
      const opts = d.options && d.options.length > 0 ? d.options.map(o => `"${o}"`).join(', ') : 'Free choice';
      return `Blank ${idx + 1} options: [ ${opts} ]`;
    }).join('\n');

    prompt = `You are a world-class academic test solver.
This is a multiple-dropdown / fill-in-the-blank (cloze) question.
Your goal is to choose the single grammatically, conceptually, and factually perfect option for each blank.

CRITICAL RULES & REASONING (CoT):
1. Contextual Cohesion: Read the entire sentence with all blanks together to ensure the complete thought is logically and syntactically sound.
2. Option Restraint: Choose solely from the provided options for each specific blank in exact sequential order.

Sentence with blanks:
"${qData.question}"

Available Options for Each Blank:
${blanksFormatted}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "type": "dropdown",
  "analysis": "<Brief evaluation of sentence logic and how each choice completes the meaning>",
  "dropdownAnswers": [
    "<exact text of chosen option for Blank 1>",
    "<exact text of chosen option for Blank 2>"
  ],
  "answerText": "<all chosen answers separated by arrow symbols, e.g. Ans 1 ➔ Ans 2>",
  "explanation": "<1-2 short sentences summarizing why these choices complete the sentence accurately>"
}`;
  } else {
    const isMultiHint = qData.isMultiHint ? '\nNote: This question allows MULTIPLE answers (Multi-Select). If more than one choice is correct, include ALL correct letters in "correctOptions".' : '';

    prompt = `You are a world-class academic test solver with flawless reasoning capabilities.
Your objective is to solve this single question with 100% precision.
${isMultiHint}

CRITICAL RULES & TRAP DETECTION:
1. TRAP WORDS: Scrutinize the question for negative qualifiers like "NOT", "EXCEPT", "LEAST", "FALSE", "INCORRECT", "NEVER". If the question asks which is NOT true, actively eliminate all true statements.
2. ELIMINATION FIRST (Chain-of-Thought): In "analysis", methodically evaluate the choices, disprove distractors, and identify the single undeniably correct answer before concluding.
3. ACADEMIC GROUNDING: Base answers strictly on rigorous scientific/academic facts and definitions.

Question:
"${qData.question}"

Available Choices/Options:
${qData.options && qData.options.length > 0 ? qData.options.map(o => `${o.label}) ${o.text}`).join('\n') : 'None (Short Answer)'}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "analysis": "<Methodical 1-2 sentence elimination of incorrect choices and proof of the correct choice>",
  "isMultiSelect": true | false,
  "correctOption": "A" | "B" | "C" | "D" | null, // primary/first correct letter if MCQ, null if short answer
  "correctOptions": ["A"], // array of all correct option letters (e.g. ["A", "C"] or ["B"]), empty [] if short answer
  "answerText": "<exact text of option(s) or concise write-in answer>",
  "explanation": "<1-2 short sentences summarizing the core factual principle>"
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

async function handleSolveImageQuestion(imageData, optionsList = [], domContext = null) {
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

  // Format any DOM extracted text (Hybrid Mode)
  let domTextSection = '';
  if (domContext && (domContext.question || domContext.options?.length > 0)) {
    const domOpts = domContext.options?.map(o => `${o.label}) ${o.text}`).join('\n') || '';
    domTextSection = `
GROUND-TRUTH DOM TEXT DETECTED IN SELECTION AREA:
${domContext.question ? `Question Text: "${domContext.question}"` : ''}
${domOpts ? `Choices from DOM:\n${domOpts}` : ''}
(Use this clean text to prevent OCR errors or cropped text ambiguities)
`;
  } else if (optionsList && optionsList.length > 0) {
    domTextSection = `\nOptions detected in the cropped area: ${optionsList.map(o => `${o.label || ''}) ${o.text || o}`).join(', ')}`;
  }

  const prompt = `You are an elite academic test solver with multimodal vision capabilities and flawless logical reasoning.
Analyze the provided cropped screenshot of a test or quiz question with 100% precision.

CRITICAL RULES & TRAP PREVENTION:
1. IGNORE PRE-EXISTING SELECTIONS (ZERO BIAS):
   - Completely ignore any radio buttons that are already checked, checkmarks, colored rings, or user highlights visible in the image.
   - Do NOT assume a highlighted or checked option is correct. Solve objectively from fundamental academic principles.
2. TRAP WORDS DETECTION:
   - Scrutinize the question for negative qualifiers like "NOT", "EXCEPT", "LEAST", "FALSE", "INCORRECT", "NEVER".
   - If the question asks which statement is NOT true, eliminate all true statements.
3. HYBRID ACCURACY (Chain-of-Thought Elimination):
   - In "analysis", transcribe key terms, rigorously disprove incorrect choices, and prove the single undeniably correct choice before outputting "correctOption".
${domTextSection}

Return strictly valid JSON with this exact schema (no markdown, no backticks):
{
  "analysis": "<Methodical elimination of incorrect distractors and proof of the correct answer>",
  "questionText": "<clean transcription of question>",
  "isMultiSelect": true | false,
  "correctOption": "A" | "B" | "C" | "D" | null,
  "correctOptions": ["A"],
  "dropdownAnswers": ["<chosen option text for Blank 1>", "<chosen option text for Blank 2>"] | null,
  "answerText": "<exact text of option(s), chosen dropdown answers separated by ➔, or concise write-in answer>",
  "explanation": "<1-2 short sentences summarizing the scientific/academic rationale>"
};`;

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

