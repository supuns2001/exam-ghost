import { useState, useEffect } from 'react';
import {
  Play,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Settings,
  AlertCircle,
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  HelpCircle,
  MousePointerClick,
  Crop,
  Sun,
  Moon,
  EyeOff,
  ShieldAlert,
  BookOpen,
  Key
} from 'lucide-react';
import './App.css';

const DEFAULT_API_KEY = '';
const MODELS_TO_TRY = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

export default function App() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'
  
  // 3 Modes: 'invisible' | 'stealth' | 'explain'
  const [solverMode, setSolverMode] = useState('stealth');

  // Mode 1: Invisible Toggles
  const [invisibleAutoFill, setInvisibleAutoFill] = useState(true);
  const [invisibleClipboardCopy, setInvisibleClipboardCopy] = useState(true);
  const [invisibleDoubleClick, setInvisibleDoubleClick] = useState(true);

  // Mode 2: Stealth Toggles
  const [stealthHighlightOnly, setStealthHighlightOnly] = useState(false);
  const [stealthAutoFill, setStealthAutoFill] = useState(true);
  const [stealthDoubleClick, setStealthDoubleClick] = useState(true);

  // Mode 3: Explain Toggles
  const [explainAutoFill, setExplainAutoFill] = useState(true);
  const [explainSideBanner, setExplainSideBanner] = useState(true);
  const [explainDetailed, setExplainDetailed] = useState(true);

  // Snip Tool Option
  const [snipAutoFill, setSnipAutoFill] = useState(true);

  // Full Scan Processing States
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(''); // 'scrolling' | 'ai_processing' | 'autofilling' | ''
  const [questionsData, setQuestionsData] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedExplanation, setExpandedExplanation] = useState({});
  const [autoFillCount, setAutoFillCount] = useState(null);

  // Message Quota & License
  const [usedMessages, setUsedMessages] = useState(32);
  const [totalMessages, setTotalMessages] = useState(50);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseSuccess, setLicenseSuccess] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          'gemini_api_key',
          'theme_mode',
          'solver_mode',
          'invisible_autofill',
          'invisible_clipboard',
          'invisible_double_click',
          'stealth_highlight_only',
          'stealth_autofill',
          'stealth_double_click',
          'explain_autofill',
          'explain_side_banner',
          'explain_detailed',
          'snip_auto_fill',
          'used_messages_count'
        ],
        (res) => {
          if (res) {
            if (res.gemini_api_key) setApiKey(res.gemini_api_key);
            if (res.theme_mode) setTheme(res.theme_mode);
            
            // Map legacy solver_mode to new 3 modes
            if (res.solver_mode === 'full_scan') setSolverMode('explain');
            else if (res.solver_mode === 'dom_interactive') setSolverMode('stealth');
            else if (res.solver_mode) setSolverMode(res.solver_mode);

            if (typeof res.invisible_autofill !== 'undefined') setInvisibleAutoFill(res.invisible_autofill);
            if (typeof res.invisible_clipboard !== 'undefined') setInvisibleClipboardCopy(res.invisible_clipboard);
            if (typeof res.invisible_double_click !== 'undefined') setInvisibleDoubleClick(res.invisible_double_click);

            const autoFillVal = typeof res.stealth_autofill !== 'undefined' ? res.stealth_autofill : true;
            setStealthAutoFill(autoFillVal);
            if (autoFillVal) {
              setStealthHighlightOnly(false);
              chrome.storage.local.set({ stealth_highlight_only: false });
            } else {
              setStealthHighlightOnly(typeof res.stealth_highlight_only !== 'undefined' ? res.stealth_highlight_only : true);
            }
            if (typeof res.stealth_double_click !== 'undefined') setStealthDoubleClick(res.stealth_double_click);

            if (typeof res.explain_autofill !== 'undefined') setExplainAutoFill(res.explain_autofill);
            if (typeof res.explain_side_banner !== 'undefined') setExplainSideBanner(res.explain_side_banner);
            if (typeof res.explain_detailed !== 'undefined') setExplainDetailed(res.explain_detailed);

            if (typeof res.snip_auto_fill !== 'undefined') setSnipAutoFill(res.snip_auto_fill);
            if (typeof res.used_messages_count === 'number') setUsedMessages(res.used_messages_count);
          }
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

    const handleStorageChange = (changes) => {
      if (changes.solver_mode && changes.solver_mode.newValue) {
        setSolverMode(changes.solver_mode.newValue);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  const saveStorage = (key, value) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: value });
    }
  };

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveStorage('theme_mode', nextTheme);
  };

  const handleSetSolverMode = (mode) => {
    setSolverMode(mode);
    saveStorage('solver_mode', mode);
  };

  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    saveStorage('gemini_api_key', newKey);
    setShowSettings(false);
  };

  const handleTriggerSnip = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: 'TRIGGER_SNIP_MODE' });
      window.close(); // Cleanly close popup so user can immediately snip on page
    }
  };

  const handleActivateLicense = () => {
    if (licenseKey.trim().length > 5) {
      setTotalMessages(999);
      setUsedMessages(0);
      setLicenseSuccess(true);
      saveStorage('used_messages_count', 0);
      setTimeout(() => setShowLicenseModal(false), 1200);
    }
  };

  const toggleExplanation = (id) => {
    setExpandedExplanation((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Full-Page Scan Logic
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
      const pageData = await getTabContent(activeTab.id);

      if (!pageData.fullText || pageData.fullText.length < 10) {
        throw new Error('No readable text found on this page. Make sure the worksheet content is visible.');
      }

      setScanStep('ai_processing');
      const solved = await extractAndSolveWithGemini(pageData.fullText, apiKey);
      setQuestionsData(solved);

      // Increment usage count
      setUsedMessages((prev) => {
        const next = Math.min(totalMessages, prev + (solved.questions?.length || 1));
        saveStorage('used_messages_count', next);
        return next;
      });

      // Auto-Fill Check
      const shouldAutoFill = (solverMode === 'invisible' && invisibleAutoFill) ||
                             (solverMode === 'explain' && explainAutoFill) ||
                             (solverMode === 'stealth' && !stealthHighlightOnly);

      if (shouldAutoFill && solved.questions && solved.questions.length > 0) {
        setScanStep('autofilling');
        try {
          const fillRes = await sendAutoFillMessage(activeTab.id, solved.questions);
          if (fillRes && fillRes.success) {
            setAutoFillCount(fillRes.filledCount);
          }
        } catch {
          // Ignore non-fatal auto fill error
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred during worksheet solving.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const getTabContent = (tabId) => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_QUESTIONS_WITH_SCROLL' }, (res) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func: () => ({
                fullText: document.body.innerText,
                title: document.title,
                url: window.location.href,
              }),
            },
            (results) => {
              if (chrome.runtime.lastError || !results || !results[0]) {
                return reject(new Error('Cannot access page. Please reload the tab.'));
              }
              resolve(results[0].result);
            }
          );
        } else {
          resolve(res);
        }
      });
    });
  };

  const sendAutoFillMessage = (tabId, questions) => {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'AUTO_FILL_ANSWERS', questions }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false });
        } else {
          resolve(res || { success: true });
        }
      });
    });
  };

  const extractAndSolveWithGemini = async (rawText, key) => {
    const prompt = `You are an elite academic test solving engine.
Analyze the following test/quiz page text. Detect all questions, choices, and solve them with complete accuracy.

Return strictly valid JSON:
{
  "worksheetTitle": "<Title or Subject>",
  "questions": [
    {
      "id": 1,
      "number": "1",
      "subject": "General",
      "type": "mcq", // "mcq" | "multi" | "short"
      "question": "<Exact question text>",
      "options": [
        { "label": "A", "text": "<Option A text>" },
        { "label": "B", "text": "<Option B text>" }
      ],
      "correctOption": "A", // null if short answer
      "correctOptions": ["A"],
      "answerText": "<Exact correct answer text>",
      "explanation": "<Clear 1-2 sentence rationale>"
    }
  ]
}

Page Content:
${rawText.substring(0, 35000)}`;

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
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API HTTP ${response.status}`);
        }

        const data = await response.json();
        const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponse) throw new Error('No content returned from AI model.');

        const cleanedJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);
      } catch (err) {
        console.warn(`Model ${model} failed:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to solve worksheet with Gemini API.');
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
    <div className={`extractor-app ${theme === 'light' ? 'light-theme' : ''}`}>
      {/* Top Header */}
      <header className="header">
        <div className="header-brand">
          <div className="brand-icon">
            <Sparkles size={19} />
          </div>
          <div>
            <h1 className="brand-title">Study Assistant</h1>
            <span className="brand-subtitle">Gemini 3.5 Flash-Lite</span>
          </div>
        </div>

        <div className="header-controls">
          <button
            className="icon-btn"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            onClick={handleToggleTheme}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="icon-btn"
            title="Settings & API Key"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Sliders size={16} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Configuration</h3>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setShowSettings(false)}>✕</button>
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

      {/* License Modal */}
      {showLicenseModal && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Activate License</h3>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setShowLicenseModal(false)}>✕</button>
          </div>
          <div className="settings-body">
            <label>License Key</label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
            <div className="settings-actions">
              <button
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={handleActivateLicense}
              >
                {licenseSuccess ? '✓ License Activated!' : 'Activate License'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode Segmented Tabs: Invisible | Stealth | Explain */}
      <div className="mode-segmented-control">
        <button
          className={`mode-tab ${solverMode === 'invisible' ? 'active' : ''}`}
          onClick={() => handleSetSolverMode('invisible')}
          title="Switch to Invisible Mode (Shortcut: Alt + 1)"
        >
          <EyeOff size={14} />
          <span>Invisible</span>
          <span className="kbd-badge" style={{ fontSize: '9px', padding: '1px 4px', opacity: 0.85 }}>Alt+1</span>
        </button>
        <button
          className={`mode-tab ${solverMode === 'stealth' ? 'active' : ''}`}
          onClick={() => handleSetSolverMode('stealth')}
          title="Switch to Stealth Mode (Shortcut: Alt + 2)"
        >
          <ShieldAlert size={14} />
          <span>Stealth</span>
          <span className="kbd-badge" style={{ fontSize: '9px', padding: '1px 4px', opacity: 0.85 }}>Alt+2</span>
        </button>
        <button
          className={`mode-tab ${solverMode === 'explain' ? 'active' : ''}`}
          onClick={() => handleSetSolverMode('explain')}
          title="Switch to Explain Mode (Shortcut: Alt + 3)"
        >
          <BookOpen size={14} />
          <span>Explain</span>
          <span className="kbd-badge" style={{ fontSize: '9px', padding: '1px 4px', opacity: 0.85 }}>Alt+3</span>
        </button>
      </div>

      {/* Target Page Preview Card */}
      <div className="tab-card">
        <span className="tab-label">Target Page</span>
        <div className="tab-title" title={activeTab?.title || 'No active tab'}>
          {activeTab?.title || 'Detecting Active Tab...'}
        </div>
        <div className="tab-url">{activeTab?.url || ''}</div>
      </div>

      {/* ==================== MODE 1: INVISIBLE ==================== */}
      {solverMode === 'invisible' && (
        <>
          <div className="status-badge" style={{ color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.08)' }}>
            <span className="status-dot pulsating" style={{ backgroundColor: '#818cf8' }}></span>
            <span>Invisible Ghost Mode Ready (Zero Screen Traces)</span>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Silent Auto-Fill on Webpage</span>
              <span className="toggle-desc">No floating banner or toasts; silently checks choices directly</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={invisibleAutoFill}
                onChange={(e) => {
                  setInvisibleAutoFill(e.target.checked);
                  saveStorage('invisible_autofill', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Auto-Copy Answer to Clipboard</span>
              <span className="toggle-desc">Silently copies the exact answer text to clipboard on solve</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={invisibleClipboardCopy}
                onChange={(e) => {
                  setInvisibleClipboardCopy(e.target.checked);
                  saveStorage('invisible_clipboard', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Silent Double-Click Solver</span>
              <span className="toggle-desc">Double-click on any question card silently ticks the answer</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={invisibleDoubleClick}
                onChange={(e) => {
                  setInvisibleDoubleClick(e.target.checked);
                  saveStorage('invisible_double_click', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <button
            className={`start-btn ${isScanning ? 'scanning' : ''}`}
            onClick={handleStartExtraction}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <div className="spinner"></div>
                <span>Silent Scanning Page...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Scan page & silent answer</span>
              </>
            )}
          </button>

          {/* Snip Hero Card */}
          <div className="snip-card">
            <div className="snip-card-header">
              <div className="snip-card-icon">
                <Crop size={18} />
              </div>
              <div className="snip-card-details">
                <h4>Snip a region</h4>
                <p>Drag a box over a diagram, an image or text you can't select.</p>
              </div>
            </div>
            <button
              className="snip-action-btn"
              onClick={handleTriggerSnip}
            >
              <span>Launch snip tool</span>
              <span className="kbd-badge">Alt</span>
              <span className="kbd-badge">S</span>
            </button>
          </div>

          <div className="interactive-instructions-card">
            <h4>How Invisible Mode Works:</h4>
            <div className="instruction-step">
              <div className="step-num">1</div>
              <p>100% undetectable — no side HUD, no popups, and no visible overlays.</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">2</div>
              <p>Double-click any question card to silently tick the correct option.</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">3</div>
              <p>Answer text is copied straight to your clipboard ready to paste.</p>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODE 2: STEALTH ==================== */}
      {solverMode === 'stealth' && (
        <>
          <div className="status-badge">
            <span className="status-dot pulsating"></span>
            <span>Stealth Solver is Ready</span>
          </div>

          <div className={`feature-toggle-card ${stealthAutoFill ? 'toggle-card-disabled' : ''}`}>
            <div className="toggle-info">
              <span className="toggle-title">Highlight correct option only</span>
              <span className="toggle-desc">
                {stealthAutoFill
                  ? 'Disabled while Auto-fill is active (hints not needed)'
                  : 'Marks the right option subtly so you can choose it yourself'}
              </span>
            </div>
            <label className={`switch-wrapper ${stealthAutoFill ? 'switch-disabled' : ''}`}>
              <input
                type="checkbox"
                className="switch-input"
                checked={!stealthAutoFill && stealthHighlightOnly}
                disabled={stealthAutoFill}
                onChange={(e) => {
                  if (!stealthAutoFill) {
                    setStealthHighlightOnly(e.target.checked);
                    saveStorage('stealth_highlight_only', e.target.checked);
                  }
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Auto-fill answers & text fields</span>
              <span className="toggle-desc">Automatically selects answers and fills inputs without banners</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={stealthAutoFill}
                onChange={(e) => {
                  const val = e.target.checked;
                  setStealthAutoFill(val);
                  saveStorage('stealth_autofill', val);
                  if (val) {
                    setStealthHighlightOnly(false);
                    saveStorage('stealth_highlight_only', false);
                  } else {
                    // When auto-fill is turned OFF, turn ON hints only
                    setStealthHighlightOnly(true);
                    saveStorage('stealth_highlight_only', true);
                  }
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Double-click a question</span>
              <span className="toggle-desc">Double-click any question card on your page to get its answer</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={stealthDoubleClick}
                onChange={(e) => {
                  setStealthDoubleClick(e.target.checked);
                  saveStorage('stealth_double_click', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          {/* Snip Hero Card */}
          <div className="snip-card">
            <div className="snip-card-header">
              <div className="snip-card-icon">
                <Crop size={18} />
              </div>
              <div className="snip-card-details">
                <h4>Snip a region</h4>
                <p>Drag a box over a diagram, an image or text you can't select.</p>
              </div>
            </div>
            <button
              className="snip-action-btn"
              onClick={handleTriggerSnip}
            >
              <span>Launch snip tool</span>
              <span className="kbd-badge">Alt</span>
              <span className="kbd-badge">S</span>
            </button>
          </div>

          <div className="interactive-instructions-card">
            <h4>HOW IT WORKS:</h4>
            <div className="instruction-step">
              <div className="step-num">1</div>
              <p>Open your page and double-click a question card.</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">2</div>
              <p>MCQ choices are marked subtly with a green check (✓).</p>
            </div>
            <div className="instruction-step">
              <div className="step-num">3</div>
              <p>Text fields and textareas are automatically typed in without any banners!</p>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODE 3: EXPLAIN ==================== */}
      {solverMode === 'explain' && (
        <>
          <div className="status-badge" style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.25)', background: 'rgba(56, 189, 248, 0.08)' }}>
            <span className="status-dot pulsating" style={{ backgroundColor: '#38bdf8' }}></span>
            <span>Study Explainer HUD Active</span>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Show answers on the page</span>
              <span className="toggle-desc">Highlights and auto-fills the right option beside each question</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={explainAutoFill}
                onChange={(e) => {
                  setExplainAutoFill(e.target.checked);
                  saveStorage('explain_autofill', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Floating answer card (Side Banner)</span>
              <span className="toggle-desc">A small card slides in on the right with the answer and reason</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={explainSideBanner}
                onChange={(e) => {
                  setExplainSideBanner(e.target.checked);
                  saveStorage('explain_side_banner', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div className="feature-toggle-card">
            <div className="toggle-info">
              <span className="toggle-title">Add detailed explanation</span>
              <span className="toggle-desc">Two or three sentences on why the answer is right</span>
            </div>
            <label className="switch-wrapper">
              <input
                type="checkbox"
                className="switch-input"
                checked={explainDetailed}
                onChange={(e) => {
                  setExplainDetailed(e.target.checked);
                  saveStorage('explain_detailed', e.target.checked);
                }}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          {/* Snip Hero Card */}
          <div className="snip-card">
            <div className="snip-card-header">
              <div className="snip-card-icon">
                <Crop size={18} />
              </div>
              <div className="snip-card-details">
                <h4>Snip a region</h4>
                <p>Drag a box over a diagram, an image or text you can't select.</p>
              </div>
            </div>
            <button
              className="snip-action-btn"
              onClick={handleTriggerSnip}
            >
              <span>Launch snip tool</span>
              <span className="kbd-badge">Alt</span>
              <span className="kbd-badge">S</span>
            </button>
          </div>

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
                <Play size={16} fill="currentColor" />
                <span>Scan page & answer</span>
              </>
            )}
          </button>
        </>
      )}

      {/* Auto-Fill Count Alert */}
      {typeof autoFillCount === 'number' && (
        <div className={autoFillCount > 0 ? 'success-banner' : 'warning-banner'}>
          {autoFillCount > 0 ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>
            {autoFillCount > 0
              ? `✓ ${autoFillCount} answers auto-filled on webpage!`
              : 'Could not auto-fill. Click "Scan page & answer" to retry.'}
          </span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Solver Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Questions Results List (Full-Page Scan) */}
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
                className="action-pill-btn"
                onClick={copyAllQuestionsAndAnswers}
                title="Copy all questions"
              >
                {copiedAll ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
              </button>

              <button
                className="action-pill-btn"
                onClick={exportAsJson}
                title="Export JSON"
              >
                <Download size={13} />
                <span>JSON</span>
              </button>
            </div>
          </div>

          <div className="questions-list">
            {questionsData.questions?.map((q, idx) => (
              <div key={q.id || idx} className="question-card">
                <div className="question-card-header">
                  <div className="badges-group">
                    <span className="badge badge-number">Q#{q.number || idx + 1}</span>
                    {q.subject && (
                      <span className={`badge badge-subject ${q.subject.toLowerCase()}`}>
                        {q.subject}
                      </span>
                    )}
                    <span className="badge badge-type">{q.type.toUpperCase()}</span>
                  </div>

                  <button
                    className="copy-card-btn"
                    onClick={() => copyToClipboard(q.answerText, q.id || idx)}
                    title="Copy Answer"
                  >
                    {copiedId === (q.id || idx) ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                </div>

                <div className="question-text">{q.question}</div>

                {q.type === 'mcq' && q.options && q.options.length > 0 && (
                  <div className="options-grid">
                    {q.options.map((opt) => {
                      const isCorrect = (q.correctOptions && q.correctOptions.includes(opt.label)) ||
                                        (q.correctOption && q.correctOption === opt.label);
                      return (
                        <div
                          key={opt.label}
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

      {/* Footer Quota Card (as seen in mockup) */}
      <div className="footer-quota-card">
        <div className="quota-header">
          <span className="quota-title">Free messages</span>
          <span className="quota-count">{usedMessages} / {totalMessages}</span>
        </div>
        <div className="quota-progress-track">
          <div
            className="quota-progress-fill"
            style={{ width: `${Math.min(100, (usedMessages / totalMessages) * 100)}%` }}
          ></div>
        </div>
        <div className="quota-footer">
          <span className="quota-left">{Math.max(0, totalMessages - usedMessages)} left</span>
          <a
            className="quota-link"
            onClick={() => setShowLicenseModal(true)}
          >
            Have a license key?
          </a>
        </div>
      </div>
    </div>
  );
}
