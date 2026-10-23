import { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  Sliders,
  AlertCircle,
  Download,
  Crop,
  Sun,
  Moon,
  EyeOff,
  Shield,
  BookOpen,
  Lock,
  MessageCircle,
  Mail,
  ChevronLeft,
  CheckCircle2,
  HelpCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import './App.css';

const DEFAULT_API_KEY = '';
const MODELS_TO_TRY = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const DISCORD_URL = 'https://discord.gg/studyassistant';
const SUPPORT_EMAIL = 'support@studyassistant.ai';

export default function App() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'

  // 3 Modes: 'invisible' | 'stealth' | 'explain'
  const [solverMode, setSolverMode] = useState('stealth');
  const tabRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ transform: 'translateX(0px)', width: '0px', opacity: 0 });

  // Mode 1: Invisible Toggles
  const [invisibleAutoFill, setInvisibleAutoFill] = useState(true);
  const [invisibleClipboardCopy, setInvisibleClipboardCopy] = useState(true);
  const [_invisibleDoubleClick, setInvisibleDoubleClick] = useState(true);

  // Mode 2: Stealth Toggles
  const [stealthHighlightOnly, setStealthHighlightOnly] = useState(false);
  const [stealthAutoFill, setStealthAutoFill] = useState(true);
  const [_stealthDoubleClick, setStealthDoubleClick] = useState(true);

  // Master Power Switch (Global ON / OFF)
  const [extensionActive, setExtensionActive] = useState(true);

  // Global Preferences (Fallback in Settings)
  const [enableDoubleClick, setEnableDoubleClick] = useState(true);

  // Mode 3: Explain Toggles
  const [explainAutoFill, setExplainAutoFill] = useState(true);
  const [explainSideBanner, setExplainSideBanner] = useState(true);
  const [explainDetailed, setExplainDetailed] = useState(true);

  // Snip Tool Option
  const [_snipAutoFill, setSnipAutoFill] = useState(true);

  // Full Scan Processing States
  const [_isScanning, setIsScanning] = useState(false);
  const [_scanStep, setScanStep] = useState(''); // 'scrolling' | 'ai_processing' | 'autofilling' | ''
  const [questionsData, setQuestionsData] = useState(null);
  const [error, setError] = useState(null);
  const [_copiedId, _setCopiedId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedExplanation, setExpandedExplanation] = useState({});
  const [autoFillCount, setAutoFillCount] = useState(null);

  // View Navigation ('main' | 'settings')
  const [currentView, setCurrentView] = useState('main');

  // Message Quota & License
  const [usedMessages, setUsedMessages] = useState(50);
  const [totalMessages, setTotalMessages] = useState(50);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseSuccess, setLicenseSuccess] = useState(false);

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

  const handleToggleDoubleClick = (val) => {
    setEnableDoubleClick(val);
    setInvisibleDoubleClick(val);
    setStealthDoubleClick(val);
    saveStorage('enable_double_click', val);
    saveStorage('invisible_double_click', val);
    saveStorage('stealth_double_click', val);
  };

  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    saveStorage('gemini_api_key', newKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
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
      saveStorage('has_active_license', true);
      setTimeout(() => {
        setLicenseSuccess(false);
        setCurrentView('main');
      }, 1400);
    }
  };

  const handleToggleMasterPower = () => {
    const nextState = !extensionActive;
    setExtensionActive(nextState);
    saveStorage('extension_active', nextState);
  };

  const toggleExplanation = (id) => {
    setExpandedExplanation((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = tabRefs.current[solverMode];
      if (activeEl) {
        setIndicatorStyle({
          transform: `translateX(${activeEl.offsetLeft}px)`,
          width: `${activeEl.offsetWidth}px`,
          opacity: 1
        });
      }
    };
    const timer = setTimeout(updateIndicator, 10);
    window.addEventListener('resize', updateIndicator);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [solverMode]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          'gemini_api_key',
          'theme_mode',
          'solver_mode',
          'enable_double_click',
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
          'used_messages_count',
          'extension_active'
        ],
        (res) => {
          if (res) {
            if (res.gemini_api_key) setApiKey(res.gemini_api_key);
            if (res.theme_mode) setTheme(res.theme_mode);
            if (typeof res.extension_active !== 'undefined') setExtensionActive(res.extension_active);

            // Map legacy solver_mode to new 3 modes
            if (res.solver_mode === 'full_scan') setSolverMode('explain');
            else if (res.solver_mode === 'dom_interactive') setSolverMode('stealth');
            else if (res.solver_mode) setSolverMode(res.solver_mode);

            if (typeof res.enable_double_click !== 'undefined') setEnableDoubleClick(res.enable_double_click);
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!extensionActive) return;
      if (e.altKey) {
        if (e.code === 'Digit1' || e.key === '1' || e.key === '¡') {
          e.preventDefault();
          handleSetSolverMode('invisible');
        } else if (e.code === 'Digit2' || e.key === '2' || e.key === '™') {
          e.preventDefault();
          handleSetSolverMode('stealth');
        } else if (e.code === 'Digit3' || e.key === '3' || e.key === '£') {
          e.preventDefault();
          handleSetSolverMode('explain');
        } else if (e.code === 'KeyS' || (e.key && e.key.toLowerCase() === 's') || e.key === 'ß') {
          e.preventDefault();
          handleTriggerSnip();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, extensionActive]);

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
    const prompt = `You are a world-class academic test solving engine with flawless reasoning capabilities.
Analyze the following test/quiz page text. Detect all questions, choices, and solve every question with 100% precision.

CRITICAL RULES & TRAP DETECTION:
1. TRAP WORDS: Scrutinize every question for negative qualifiers like "NOT", "EXCEPT", "LEAST", "FALSE", "INCORRECT", "NEVER". If seeking what is NOT true, actively eliminate all true statements.
2. ELIMINATION FIRST (Chain-of-Thought): In "analysis", briefly evaluate choices and eliminate distractor options before choosing the correct option letter.
3. MULTI-SELECT: If a question states "select all that apply" or allows multiple answers, mark "isMultiSelect": true and list ALL correct letters in "correctOptions".
4. DROPDOWN QUESTIONS: If the question has blanks or dropdowns, set "type": "dropdown", provide sequential choices in "dropdownAnswers", and join them with "➔" in "answerText".

Return strictly valid JSON:
{
  "worksheetTitle": "<Title or Subject>",
  "questions": [
    {
      "id": 1,
      "number": "1",
      "subject": "General",
      "type": "mcq", // "mcq" | "multi" | "short" | "dropdown"
      "analysis": "<Methodical elimination of incorrect choices and proof of correct choice>",
      "question": "<Exact question text>",
      "options": [
        { "label": "A", "text": "<Option A text>" },
        { "label": "B", "text": "<Option B text>" }
      ],
      "correctOption": "A", // null if short answer or dropdown
      "correctOptions": ["A"],
      "dropdownAnswers": ["Choice 1", "Choice 2"], // only if dropdown
      "answerText": "<Exact correct answer text or Choice 1 ➔ Choice 2>",
      "explanation": "<Clear 1-2 sentence core factual rationale>"
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
            <img src="/icons/icon48.png" alt="Ghost Solver Logo" className="brand-logo-avatar" />
          </div>
          <div>
            <h1 className="brand-title">Study Assistant</h1>
            <div className="header-target-page" title={activeTab?.url || activeTab?.title || 'No active tab'}>
              <span className="header-status-dot"></span>
              <span className="header-page-title">
                {activeTab?.title ? (activeTab.title.length > 28 ? activeTab.title.slice(0, 28) + '...' : activeTab.title) : 'Detecting Page...'}
              </span>
            </div>
          </div>
        </div>

        <div className="header-controls">
          {currentView === 'settings' ? (
            <button
              className="btn-back-header"
              onClick={() => setCurrentView('main')}
              title="Back to solver view"
            >
              <ChevronLeft size={16} />
              <span>Back</span>
            </button>
          ) : (
            <>
              <button
                className={`master-power-toggle ${extensionActive ? 'is-on' : 'is-off'}`}
                onClick={handleToggleMasterPower}
                title={extensionActive ? 'Extension is ON (Click to turn OFF)' : 'Extension is OFF (Click to turn ON)'}
                aria-label="Toggle Extension Master Power"
              >
                <span className="power-status-dot"></span>
                <span className="power-status-text">{extensionActive ? 'ON' : 'OFF'}</span>
              </button>

              <button
                className="icon-btn"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                onClick={handleToggleTheme}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                className="icon-btn"
                title="Settings & License"
                onClick={() => setCurrentView('settings')}
              >
                <Sliders size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      {currentView === 'settings' ? (
        <div className="settings-view-container">
          {/* Hero Lock Status Card */}
          <div className="settings-hero-card">
            <div className="settings-lock-icon-wrapper">
              <Lock size={20} className="settings-lock-icon" />
            </div>
            <h3 className="settings-hero-title">
              {usedMessages >= totalMessages
                ? `You've used your ${totalMessages} free messages`
                : `${totalMessages - usedMessages} free messages remaining`}
            </h3>
            <p className="settings-hero-subtitle">
              Enter a license key to keep solving. Your history and settings stay as they are.
            </p>
          </div>

          {/* License Key Input Form */}
          <div className="settings-license-form">
            <label className="settings-field-label">LICENSE KEY</label>
            <div className="settings-input-row">
              <input
                type="text"
                className="settings-license-input"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                spellCheck={false}
              />
            </div>
            <button
              className={`btn-activate-license ${licenseSuccess ? 'activated' : ''}`}
              onClick={handleActivateLicense}
              disabled={!licenseKey.trim()}
            >
              <Check size={16} strokeWidth={2.5} />
              <span>{licenseSuccess ? 'License Activated!' : 'Activate license'}</span>
            </button>
            {licenseSuccess && (
              <div className="settings-license-badge-success">
                Unlimited solving unlocked! Returning to solver...
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="settings-divider">
            <span className="settings-divider-line"></span>
            <span className="settings-divider-text">Don't have a key?</span>
            <span className="settings-divider-line"></span>
          </div>

          {/* Contact Support Card */}
          <div className="settings-contact-card">
            <h4 className="settings-contact-title">Get a license key</h4>
            <p className="settings-contact-desc">
              Message us and we'll send you a key. We usually reply in under an hour.
            </p>

            <div className="settings-contact-buttons">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-contact-pill btn-discord"
              >
                <MessageCircle size={15} />
                <span>Discord</span>
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Requesting%20License%20Key`}
                className="btn-contact-pill btn-email"
              >
                <Mail size={15} />
                <span>Email</span>
              </a>
            </div>

            <div className="settings-contact-footer">
              Or email us directly at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </div>
          </div>

          {/* Advanced Settings (Custom Gemini Key & Double-Click toggle) */}
          <div className="settings-advanced-card">
            <div className="settings-advanced-header">ADVANCED CONFIGURATION</div>
            <div className="settings-advanced-body">
              <label className="settings-field-label">CUSTOM GEMINI API KEY</label>
              <input
                type="password"
                className="settings-license-input settings-api-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter custom Gemini API key..."
              />
              <div className="settings-api-actions">
                <button
                  type="button"
                  className="btn-api-reset"
                  onClick={() => {
                    setApiKey(DEFAULT_API_KEY);
                    saveStorage('gemini_api_key', DEFAULT_API_KEY);
                  }}
                >
                  Reset Default
                </button>
                <button
                  type="button"
                  className="btn-api-save"
                  onClick={() => handleSaveApiKey(apiKey)}
                >
                  {apiKeySaved ? 'Saved!' : 'Save Key'}
                </button>
              </div>

              <div className="settings-pref-row" style={{ marginTop: '12px' }}>
                <label className="switch-wrapper">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={enableDoubleClick}
                    onChange={(e) => handleToggleDoubleClick(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </label>
                <div className="settings-pref-text">
                  <span className="settings-pref-title">Enable Double-Click Question Solver</span>
                  <span className="settings-pref-desc">Double-clicking on questions solves them immediately</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Quota Card in Settings View */}
          <div className="footer-quota-card" style={{ marginTop: 'auto' }}>
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
              <span className="quota-status-label">{usedMessages >= totalMessages ? 'Quota reached' : 'Active trial'}</span>
            </div>
          </div>
        </div>
      ) : (
        /* MAIN SOLVER VIEW */
        <>

      {/* Mode Segmented Tab Pane */}
      <div className="modes" role="tablist" aria-label="Mode" data-active-mode={solverMode}>
        <span
          className="indicator"
          style={{
            transform: indicatorStyle.transform,
            width: indicatorStyle.width,
            opacity: indicatorStyle.opacity
          }}
        ></span>
        <button
          ref={(el) => (tabRefs.current['invisible'] = el)}
          className={`tab ${solverMode === 'invisible' ? 'active' : ''}`}
          role="tab"
          aria-selected={solverMode === 'invisible'}
          onClick={() => handleSetSolverMode('invisible')}
          title="Switch to Invisible Mode (Shortcut: Alt + 1)"
        >
          <EyeOff size={14} />
          <span className="dot"></span>
          <span>Invisible</span>
          <kbd>Alt+1</kbd>
        </button>
        <button
          ref={(el) => (tabRefs.current['stealth'] = el)}
          className={`tab ${solverMode === 'stealth' ? 'active' : ''}`}
          role="tab"
          aria-selected={solverMode === 'stealth'}
          onClick={() => handleSetSolverMode('stealth')}
          title="Switch to Stealth Mode (Shortcut: Alt + 2)"
        >
          <Shield size={14} />
          <span className="dot"></span>
          <span>Stealth</span>
          <kbd>Alt+2</kbd>
        </button>
        <button
          ref={(el) => (tabRefs.current['explain'] = el)}
          className={`tab ${solverMode === 'explain' ? 'active' : ''}`}
          role="tab"
          aria-selected={solverMode === 'explain'}
          onClick={() => handleSetSolverMode('explain')}
          title="Switch to Explain Mode (Shortcut: Alt + 3)"
        >
          <BookOpen size={14} />
          <span className="dot"></span>
          <span>Explain</span>
          <kbd>Alt+3</kbd>
        </button>
      </div>

      {/* Snip Region Hero Card (Exact User Design) */}
      <div className="snip-hero-card">
        <div className="snip-hero-header">
          <div className="snip-hero-icon-box">
            <Crop size={20} color="#3DDC97" strokeWidth={2.2} />
          </div>
          <div className="snip-hero-text">
            <h4>Snip a region</h4>
            <p>Drag a box over a diagram, an image or text you can't select.</p>
          </div>
        </div>

        <button
          className="btn-launch-snip"
          onClick={handleTriggerSnip}
          title="Drag and snip any question, formula or diagram (Alt + S)"
        >
          <span>Launch snip tool</span>
          <div className="snip-kbd-group">
            <kbd className="snip-kbd">Alt</kbd>
            <kbd className="snip-kbd">S</kbd>
          </div>
        </button>
      </div>

      {/* ==================== MODE 1: INVISIBLE ==================== */}
      {solverMode === 'invisible' && (
        <>
          <div className="status-badge" style={{ color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.08)' }}>
            <span className="status-dot pulsating" style={{ backgroundColor: '#818cf8' }}></span>
            <span>Invisible Ghost Mode Active (Zero Screen Traces)</span>
          </div>

          <div className="compact-pref-card">
            <div className="compact-pref-header">PREFERENCES</div>

            <div className="compact-toggle-row">
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
              <span className="compact-toggle-label">Silent Auto-Fill Answers</span>
              <span className="info-icon" title="No floating banner or toasts; silently checks choices directly">ⓘ</span>
            </div>

            <div className="compact-toggle-row">
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
              <span className="compact-toggle-label">Copy Answer to Clipboard</span>
              <span className="info-icon" title="Silently copies the exact answer text to clipboard on solve">ⓘ</span>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODE 2: STEALTH ==================== */}
      {solverMode === 'stealth' && (
        <>
          <div className="status-badge">
            <span className="status-dot pulsating"></span>
            <span>Stealth Solver Active</span>
          </div>

          <div className="compact-pref-card">
            <div className="compact-pref-header">PREFERENCES</div>

            <div className="compact-toggle-row">
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
                      setStealthHighlightOnly(true);
                      saveStorage('stealth_highlight_only', true);
                    }
                  }}
                />
                <span className="switch-slider"></span>
              </label>
              <span className="compact-toggle-label">Auto-Fill Answers & Inputs</span>
              <span className="info-icon" title="Automatically selects answers and fills inputs without banners">ⓘ</span>
            </div>

            <div className="compact-toggle-row">
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
              <span className={`compact-toggle-label ${stealthAutoFill ? 'label-disabled' : ''}`}>
                Highlight Hint Only (No Fill)
              </span>
              <span className="info-icon" title="Subtly marks the right option with a tick (✓) so you can choose it yourself">ⓘ</span>
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

          <div className="compact-pref-card">
            <div className="compact-pref-header">PREFERENCES</div>

            <div className="compact-toggle-row">
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
              <span className="compact-toggle-label">Auto-Fill Answers on Page</span>
              <span className="info-icon" title="Highlights and auto-fills the right option beside each question">ⓘ</span>
            </div>

            <div className="compact-toggle-row">
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
              <span className="compact-toggle-label">Right-Side Answer Banner</span>
              <span className="info-icon" title="A small card slides in on the right with the answer and reason">ⓘ</span>
            </div>

            <div className="compact-toggle-row">
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
              <span className="compact-toggle-label">Detailed Explanations</span>
              <span className="info-icon" title="Two or three sentences on why the answer is right">ⓘ</span>
            </div>
          </div>
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
                    {copiedId === (q.id || idx) ? <Check size={13} color="#3DDC97" /> : <Copy size={13} />}
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
              <button
                type="button"
                className="quota-link-btn"
                onClick={() => setCurrentView('settings')}
              >
                Have a license key?
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
