import { useState, useEffect } from 'react';
import {
  Play,
  Copy,
  Check,
  Sparkles,
  Settings,
  AlertCircle,
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  HelpCircle,
  MousePointerClick
} from 'lucide-react';
import './App.css';

const DEFAULT_API_KEY = '';
const MODELS_TO_TRY = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

export default function App() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [solverMode, setSolverMode] = useState('full_scan'); // 'full_scan' | 'dom_interactive'
  const [enableDoubleClick, setEnableDoubleClick] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(''); // 'scrolling' | 'ai_processing' | 'autofilling' | ''
  const [questionsData, setQuestionsData] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedExplanation, setExpandedExplanation] = useState({});
  const [autoFillCount, setAutoFillCount] = useState(null);
  const [enableAutoFill, setEnableAutoFill] = useState(true);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        ['gemini_api_key', 'enable_autofill', 'solver_mode', 'enable_double_click'],
        (res) => {
          if (res && res.gemini_api_key) setApiKey(res.gemini_api_key);
          if (res && typeof res.enable_autofill !== 'undefined') setEnableAutoFill(res.enable_autofill);
          if (res && res.solver_mode) setSolverMode(res.solver_mode);
          if (res && typeof res.enable_double_click !== 'undefined') setEnableDoubleClick(res.enable_double_click);
        }
      );
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          setActiveTab(tabs[0]);
        }
      });
    }
  }, []);

  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ gemini_api_key: newKey });
    }
    setShowSettings(false);
  };

  const handleSetSolverMode = (mode) => {
    setSolverMode(mode);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ solver_mode: mode });
    }
  };

  const handleToggleDoubleClick = (val) => {
    setEnableDoubleClick(val);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ enable_double_click: val });
    }
  };

  const handleToggleAutoFill = (val) => {
    setEnableAutoFill(val);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ enable_autofill: val });
    }
  };

  const toggleExplanation = (id) => {
    setExpandedExplanation((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleStartExtraction = async () => {
    if (!activeTab || !activeTab.id) {
      setError('No active tab detected. Please open a webpage and try again.');
      return;
    }

    if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('chrome-extension://')) {
      setError('Extensions cannot scan internal chrome:// pages. Please open your worksheet page.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setQuestionsData(null);
    setAutoFillCount(null);
    setScanStep('scrolling');

    try {
      // 1. Auto-scroll & extract text
      const pageData = await getTabContent(activeTab.id);

      if (!pageData.fullText || pageData.fullText.length < 10) {
        throw new Error('No readable text found on this page. Make sure the worksheet content is visible.');
      }

      // 2. Solve questions & generate explanations via Gemini
      setScanStep('ai_processing');
      const solved = await extractAndSolveWithGemini(pageData.fullText, apiKey);
      setQuestionsData(solved);

      // 3. Auto-fill answers on page if enabled
      if (enableAutoFill && solved.questions && solved.questions.length > 0) {
        setScanStep('autofilling');
        const count = await autoFillTab(activeTab.id, solved.questions);
        setAutoFillCount(count);
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      setError(err.message || 'Something went wrong during extraction.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleManualAutoFill = async () => {
    if (!activeTab || !activeTab.id || !questionsData?.questions) return;
    const count = await autoFillTab(activeTab.id, questionsData.questions);
    setAutoFillCount(count);
  };

  const autoFillTab = async (tabId, questions) => {
    try {
      const res = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { action: 'AUTO_FILL_ANSWERS', questions },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      });

      if (res && res.success && typeof res.filledCount === 'number') {
        return res.filledCount;
      }
    } catch (e) {
      console.warn('Message send failed, using script injection:', e);
    }

    // Direct injection fallback
    if (chrome.scripting && chrome.scripting.executeScript) {
      const injection = await chrome.scripting.executeScript({
        target: { tabId },
        args: [questions],
        func: (qs) => {
          let count = 0;
          const cards = Array.from(document.querySelectorAll(
            '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
          ));

          qs.forEach((q, idx) => {
            const qClean = (q.question || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const qNumClean = (q.number || `Q#${idx + 1}`).replace(/[^0-9]/g, '');

            let targetCard = cards.find(card => {
              const textElem = card.querySelector('.question-text, h3, h4, p');
              const cardText = (textElem ? textElem.innerText : card.innerText || '')
                .trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              return cardText && (qClean.includes(cardText) || cardText.includes(qClean));
            });

            if (!targetCard && qNumClean) {
              targetCard = cards.find(card => {
                const badge = card.querySelector('.question-number-badge, [class*="number"]');
                return badge && badge.innerText.replace(/[^0-9]/g, '') === qNumClean;
              });
            }

            if (!targetCard && cards[idx]) {
              targetCard = cards[idx];
            }

            if (!targetCard) return;

            const targetOptions = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
              ? q.correctOptions
              : (q.correctOption ? [q.correctOption] : []);
            const isMulti = q.isMultiSelect || targetOptions.length > 1 || !!targetCard.querySelector('.multi-option-input');

            if (isMulti && targetOptions.length > 0) {
              const checkboxes = Array.from(targetCard.querySelectorAll('.multi-option-input, .option-checkbox, input[type="checkbox"]'));
              if (checkboxes.length > 0) {
                checkboxes.forEach((cb, cbIdx) => {
                  const letter = String.fromCharCode(65 + cbIdx);
                  const label = cb.closest('.option-label, label') || cb.parentElement;
                  const optLetter = (label?.querySelector('.option-letter, [class*="letter"]')?.innerText || '')
                    .replace(/[^A-Za-z]/g, '').toUpperCase() || letter;
                  const optText = (label?.querySelector('.option-text')?.innerText || cb.value || label?.innerText || '')
                    .replace(/^[A-Za-z][.)]\s*/, '').trim().toLowerCase();
                  const cbVal = (cb.value || '').trim().toLowerCase();

                  const isMatch = targetOptions.some(opt => {
                    const o = opt.trim().toUpperCase();
                    const oLow = opt.trim().toLowerCase();
                    return o === optLetter ||
                           o === letter ||
                           (optText && oLow === optText) ||
                           (cbVal && oLow === cbVal) ||
                           (q.answerText && optText && q.answerText.toLowerCase().includes(optText));
                  });

                  cb.checked = isMatch;
                  if (label) {
                    if (isMatch) {
                      label.classList.add('is-selected');
                    } else {
                      label.classList.remove('is-selected');
                    }
                  }
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
              } else {
                const labels = Array.from(targetCard.querySelectorAll('.option-label, label, button[class*="option"]'));
                labels.forEach((label, lIdx) => {
                  const letter = String.fromCharCode(65 + lIdx);
                  const optLetter = (label.querySelector('.option-letter, [class*="letter"]')?.innerText || '')
                    .replace(/[^A-Za-z]/g, '').toUpperCase() || letter;
                  const optText = (label.querySelector('.option-text')?.innerText || label.innerText || '')
                    .replace(/^[A-Za-z][.)]\s*/, '').trim().toLowerCase();

                  const isMatch = targetOptions.some(opt => {
                    const o = opt.trim().toUpperCase();
                    const oLow = opt.trim().toLowerCase();
                    return o === optLetter || o === letter || (optText && oLow === optText);
                  });

                  if (isMatch) {
                    label.classList.add('is-selected');
                    label.click();
                  } else {
                    label.classList.remove('is-selected');
                  }
                });
              }
              targetCard.classList.add('answered');
              count++;
            } else if (q.type === 'mcq' || targetOptions.length > 0) {
              const labels = Array.from(targetCard.querySelectorAll(
                '.option-label, label, button[class*="option"]'
              ));

              let matchedLabel = null;
              const singleOption = targetOptions[0] || q.correctOption;
              if (singleOption) {
                matchedLabel = labels.find(label => {
                  const letter = (label.querySelector('.option-letter, [class*="letter"]')?.innerText || label.innerText || '').toUpperCase();
                  return letter.startsWith(singleOption) || letter.includes(`${singleOption})`) || letter.includes(`${singleOption}.`);
                });
              }

              if (!matchedLabel && q.answerText) {
                const cleanAns = q.answerText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                matchedLabel = labels.find(label => {
                  const optText = (label.querySelector('.option-text')?.innerText || label.innerText || '')
                    .trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                  return optText && (optText.includes(cleanAns) || cleanAns.includes(optText));
                });
              }

              if (matchedLabel) {
                const checkbox = matchedLabel.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]');
                if (checkbox) {
                  targetCard.querySelectorAll('.option-checkbox, input[type="checkbox"]').forEach(cb => {
                    if (cb !== checkbox) {
                      cb.checked = false;
                      cb.closest('.option-label')?.classList.remove('is-selected');
                    }
                  });

                  checkbox.checked = true;
                  matchedLabel.classList.add('is-selected');
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  matchedLabel.classList.add('is-selected');
                  matchedLabel.click();
                }
                targetCard.classList.add('answered');
                count++;
              }
            } else {
              const input = targetCard.querySelector('.text-input-field, input[type="text"], input:not([type]), textarea');
              if (input && q.answerText) {
                const valueSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
                const prototype = Object.getPrototypeOf(input);
                const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                  prototypeValueSetter.call(input, q.answerText);
                } else if (valueSetter) {
                  valueSetter.call(input, q.answerText);
                } else {
                  input.value = q.answerText;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                targetCard.classList.add('answered');
                count++;
              }
            }
          });

          // Update worksheet progress
          const answeredElem = document.getElementById('answeredCount');
          const totalElem = document.getElementById('totalQuestionsCount');
          const progBar = document.getElementById('progressBar');
          const progPct = document.getElementById('progressPercentage');
          if (answeredElem && totalElem) {
            const answered = document.querySelectorAll('.question-card.answered').length;
            answeredElem.textContent = answered;
            const total = parseInt(totalElem.textContent) || cards.length;
            const pct = Math.round((answered / total) * 100);
            if (progBar) progBar.style.width = pct + '%';
            if (progPct) progPct.textContent = pct + '%';
          }

          return count;
        }
      });

      if (injection && typeof injection[0]?.result === 'number') {
        return injection[0].result;
      }
    }

    return 0;
  };

  const getTabContent = async (tabId) => {
    try {
      const res = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_QUESTIONS_WITH_SCROLL' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (res && res.success) return res;
    } catch (e) {
      console.warn('Message send failed, falling back to scripting API:', e);
    }

    if (chrome.scripting && chrome.scripting.executeScript) {
      const injection = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const initialY = window.scrollY;
          const totalH = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight
          );
          let y = 0;
          const step = Math.min(window.innerHeight * 0.75, 500);

          while (y < totalH) {
            y += step;
            window.scrollTo({ top: y, behavior: 'smooth' });
            await new Promise((r) => setTimeout(r, 120));
          }

          await new Promise((r) => setTimeout(r, 400));
          window.scrollTo({ top: initialY, behavior: 'smooth' });

          const clone = document.body.cloneNode(true);
          ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe'].forEach((tag) => {
            clone.querySelectorAll(tag).forEach((el) => el.remove());
          });

          const fullText = (clone.innerText || clone.textContent || '')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join('\n');

          return {
            title: document.title,
            url: window.location.href,
            fullText,
          };
        },
      });

      if (injection && injection[0]?.result) {
        return injection[0].result;
      }
    }

    throw new Error('Could not access page contents. If this is a local file (file:///), ensure "Allow access to file URLs" is enabled in chrome://extensions.');
  };

  const extractAndSolveWithGemini = async (text, key) => {
    const prompt = `You are a world-class academic tutor and test solver.
Analyze the following text extracted from a quiz or worksheet webpage.
Your job is to:
1. Extract ALL questions and their available choices.
2. Accurately solve each question and predict the correct answer.
3. Provide a clear, concise step-by-step explanation for each question.

Output strictly valid JSON with this exact schema (no markdown blocks, no text outside JSON):
{
  "total": <number of questions found>,
  "worksheetTitle": "<worksheet title or subject>",
  "questions": [
    {
      "id": 1,
      "number": "Q#1",
      "type": "mcq" | "multi" | "short_answer" | "true_false",
      "subject": "MATH" | "SCIENCE" | "ENGLISH" | "GENERAL",
      "part": "PART 1" | "PART 2" | null,
      "isMultiSelect": false, // Set to true if question allows or has multiple correct answers
      "question": "<full question text without options>",
      "options": [
        { "label": "A", "text": "1/4" },
        { "label": "B", "text": "4/5" },
        { "label": "C", "text": "3/4" },
        { "label": "D", "text": "1/2" }
      ],
      "correctOption": "C", // Primary or first correct option letter if MCQ, null if short answer
      "correctOptions": ["C"], // Array of ALL correct option letters (e.g. ["A", "C"] if multi-select, or ["C"] if single), empty [] if short answer
      "answerText": "3/4",
      "explanation": "3 divided by 4 equals 0.75, which matches 75/100."
    }
  ]
}

Important Instructions:
- For Short Answer: Calculate the exact numeric or textual answer for "answerText" (e.g. "$10" or "10" for change, "Gravity" or "Gravitational force" for force). "correctOption" should be null and "correctOptions" should be [].
- For Single-Choice MCQ: Set "correctOption" to the correct letter (e.g. "C"), and "correctOptions" to ["C"].
- For Multi-Select (questions asking to "select all that apply" or having multiple answers): Set "isMultiSelect": true, set "correctOptions" to all correct letters (e.g. ["A", "C", "D"]), and "correctOption" to the first letter.
- In "explanation", provide a helpful 1-2 sentence breakdown explaining why this answer is correct.
- Return pure JSON only.

Webpage content:
${text.slice(0, 25000)}`;

    let lastError = null;

    for (const model of MODELS_TO_TRY) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
          const errData = await response.json();
          throw new Error(errData.error?.message || `API error ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('No content returned from AI model.');

        const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);
      } catch (err) {
        console.warn(`Model ${model} failed, trying next fallback:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to analyze worksheet with Gemini API.');
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllQuestionsAndAnswers = () => {
    if (!questionsData?.questions) return;
    const formatted = questionsData.questions
      .map((q) => {
        let str = `${q.number || `Q#${q.id}`}: ${q.question}`;
        if (q.options && q.options.length > 0) {
          str += '\n' + q.options.map((opt) => `  ${opt.label}) ${opt.text}`).join('\n');
        }
        str += `\nCorrect Answer: ${q.correctOption ? `${q.correctOption}) ` : ''}${q.answerText}`;
        if (q.explanation) {
          str += `\nExplanation: ${q.explanation}`;
        }
        return str;
      })
      .join('\n\n');

    navigator.clipboard.writeText(formatted);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const exportAsJson = () => {
    if (!questionsData) return;
    const blob = new Blob([JSON.stringify(questionsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worksheet_solved_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="extractor-app">
      {/* Top Header */}
      <header className="header">
        <div className="header-brand">
          <div className="brand-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="brand-title">Worksheet AI Solver</h1>
            <span className="brand-subtitle">Gemini 3.1 Flash-Lite</span>
          </div>
        </div>

        <button
          className="icon-btn"
          title="API Settings"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Configuration</h3>
          </div>
          <div className="settings-body">
            <label>Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API Key..."
            />
            <div className="settings-actions">
              <button
                className="btn-secondary"
                onClick={() => setApiKey(DEFAULT_API_KEY)}
              >
                Reset Default
              </button>
              <button
                className="btn-primary"
                onClick={() => handleSaveApiKey(apiKey)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="mode-segmented-control">
        <button
          className={`mode-tab ${solverMode === 'full_scan' ? 'active' : ''}`}
          onClick={() => handleSetSolverMode('full_scan')}
        >
          <Sparkles size={14} />
          <span>Full-Page Scan</span>
        </button>
        <button
          className={`mode-tab ${solverMode === 'dom_interactive' ? 'active' : ''}`}
          onClick={() => handleSetSolverMode('dom_interactive')}
        >
          <MousePointerClick size={14} />
          <span>Double-Click DOM</span>
        </button>
      </div>

      {/* Active Tab Preview */}
      <div className="tab-card">
        <div className="tab-info">
          <span className="tab-label">Target Page</span>
          <div className="tab-title" title={activeTab?.title || 'No active tab'}>
            {activeTab?.title || 'Detecting Active Tab...'}
          </div>
          <div className="tab-url">{activeTab?.url || ''}</div>
        </div>
      </div>

      {/* Mode 1: Full-Page Scan Mode */}
      {solverMode === 'full_scan' && (
        <>
          <div className="feature-toggle-card">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={enableAutoFill}
                onChange={(e) => handleToggleAutoFill(e.target.checked)}
              />
              <div className="toggle-text">
                <span className="toggle-title">
                  <Zap size={14} className="zap-icon" /> Auto-Fill Answers on Webpage
                </span>
                <span className="toggle-desc">
                  Auto-selects checkboxes & types short answers on the live tab
                </span>
              </div>
            </label>
          </div>

          <div className="action-section">
            <button
              className={`start-btn ${isScanning ? 'scanning' : ''}`}
              onClick={handleStartExtraction}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <div className="spinner"></div>
                  <span>
                    {scanStep === 'scrolling' && 'Auto-Scrolling Page...'}
                    {scanStep === 'ai_processing' && 'Solving Questions & Explanations...'}
                    {scanStep === 'autofilling' && 'Auto-Filling Live Page...'}
                  </span>
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  <span>Detect & Solve Worksheet</span>
                </>
              )}
            </button>
          </div>

          {typeof autoFillCount === 'number' && (
            <div className={autoFillCount > 0 ? 'success-banner' : 'warning-banner'}>
              {autoFillCount > 0 ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>
                {autoFillCount > 0
                  ? `✓ ${autoFillCount} of ${questionsData?.questions?.length || autoFillCount} answers auto-filled on webpage!`
                  : 'Could not auto-fill. Click "Auto-Fill Webpage" below to retry.'}
              </span>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <div className="error-text">
                <strong>Extraction Error</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {questionsData && (
            <div className="results-container">
              <div className="results-header">
                <div className="results-meta">
                  <span className="results-count">
                    {questionsData.questions?.length || 0} Questions Solved
                  </span>
                  {questionsData.worksheetTitle && (
                    <span className="worksheet-name">{questionsData.worksheetTitle}</span>
                  )}
                </div>

                <div className="results-actions">
                  <button
                    className="action-pill-btn highlight-pill"
                    onClick={handleManualAutoFill}
                    title="Trigger auto-fill on current tab"
                  >
                    <MousePointerClick size={14} />
                    <span>Auto-Fill Page</span>
                  </button>
                  <button
                    className="action-pill-btn"
                    onClick={copyAllQuestionsAndAnswers}
                    title="Copy all questions, answers & explanations"
                  >
                    {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
                  </button>
                  <button
                    className="action-pill-btn"
                    onClick={exportAsJson}
                    title="Export as JSON"
                  >
                    <Download size={14} />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              <div className="questions-list">
                {questionsData.questions?.map((q, idx) => (
                  <div key={q.id || idx} className="question-card">
                    <div className="question-card-header">
                      <div className="badges-group">
                        <span className="badge badge-number">{q.number || `Q#${idx + 1}`}</span>
                        {q.part && <span className="badge badge-part">{q.part}</span>}
                        {q.subject && (
                          <span className={`badge badge-subject ${q.subject.toLowerCase()}`}>
                            {q.subject}
                          </span>
                        )}
                        <span className="badge badge-type">
                          {q.isMultiSelect || (q.correctOptions && q.correctOptions.length > 1) || q.type === 'multi'
                            ? 'Multi-Select'
                            : (q.type === 'mcq' ? 'MCQ' : 'Short Answer')}
                        </span>
                      </div>

                      <button
                        className="copy-card-btn"
                        title="Copy this question & answer"
                        onClick={() => {
                          let text = `${q.number || `Q#${idx + 1}`}: ${q.question}`;
                          if (q.options?.length > 0) {
                            text += '\n' + q.options.map((o) => `${o.label}) ${o.text}`).join('\n');
                          }
                          const ansStr = Array.isArray(q.correctOptions) && q.correctOptions.length > 1
                            ? q.correctOptions.join(', ')
                            : (q.correctOption ? `${q.correctOption}) ` : '') + q.answerText;
                          text += `\nAnswer: ${ansStr}`;
                          if (q.explanation) text += `\nExplanation: ${q.explanation}`;
                          copyToClipboard(text, q.id || idx);
                        }}
                      >
                        {copiedId === (q.id || idx) ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>

                    <div className="question-text">{q.question}</div>

                    {q.options && q.options.length > 0 && (
                      <div className="options-grid">
                        {q.options.map((opt, optIdx) => {
                          const isCorrect = (Array.isArray(q.correctOptions) && q.correctOptions.includes(opt.label)) || q.correctOption === opt.label;
                          return (
                            <div
                              key={optIdx}
                              className={`option-item ${isCorrect ? 'option-correct' : ''}`}
                            >
                              <span className={`option-label ${isCorrect ? 'label-correct' : ''}`}>
                                {opt.label}
                              </span>
                              <span className="option-text">{opt.text}</span>
                              {isCorrect && <Check size={13} className="correct-check-icon" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {q.type !== 'mcq' && q.answerText && (
                      <div className="short-answer-box">
                        <span className="answer-label">Correct Answer:</span>
                        <span className="answer-value">{q.answerText}</span>
                      </div>
                    )}

                    {q.explanation && (
                      <div className="explanation-wrapper">
                        <button
                          className="explanation-toggle-btn"
                          onClick={() => toggleExplanation(q.id || idx)}
                        >
                          <div className="explanation-toggle-left">
                            <HelpCircle size={13} />
                            <span>Explanation</span>
                          </div>
                          {expandedExplanation[q.id || idx] ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>

                        {expandedExplanation[q.id || idx] && (
                          <div className="explanation-content">
                            <p>{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Mode 2: Interactive Double-Click DOM Solver */}
      {solverMode === 'dom_interactive' && (
        <div className="interactive-mode-container">
          <div className="interactive-status-badge">
            <span className="status-dot pulsating"></span>
            <span>Interactive DOM Solver Ready</span>
          </div>

          <div className="feature-toggle-card">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={enableDoubleClick}
                onChange={(e) => handleToggleDoubleClick(e.target.checked)}
              />
              <div className="toggle-text">
                <span className="toggle-title">
                  <MousePointerClick size={14} className="zap-icon" /> Double-Click Solver Enabled
                </span>
                <span className="toggle-desc">
                  Double-click directly on any question card on your worksheet tab
                </span>
              </div>
            </label>
          </div>

          <div className="interactive-instructions-card">
            <h4>💡 How to use Double-Click Solver:</h4>
            <div className="instruction-step">
              <div className="step-num">1</div>
              <p>Go to your open worksheet tab.</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">2</div>
              <p><strong>Double-click</strong> on any question card you want to solve.</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">3</div>
              <p>The card will pulse blue (⚡ Solving), then turn green with the answer auto-checked or typed in!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
