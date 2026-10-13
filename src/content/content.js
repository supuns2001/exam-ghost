// Content script injected into web pages
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  console.log('[Worksheet Extractor] Content script loaded.');

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_QUESTIONS_WITH_SCROLL') {
      handleAutoScrollAndExtract()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
    }

    if (request.action === 'AUTO_FILL_ANSWERS') {
      try {
        const count = executeAutoFillOnDom(request.questions);
        sendResponse({ success: true, filledCount: count });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'TRIGGER_SNIP_MODE') {
      activateSnipMode();
      sendResponse({ success: true });
      return true;
    }
  });

  /**
   * Auto-scrolls page to load lazy content, then extracts full textual content
   */
  async function handleAutoScrollAndExtract() {
    const initialScrollY = window.scrollY;

    // 1. Scroll through page smoothly to trigger dynamic loading
    await autoScrollPage();

    // 2. Allow pause for any lazy elements to finish rendering
    await new Promise(r => setTimeout(r, 400));

    // 3. Extract text content
    const pageData = extractPageData();

    // 4. Return to top/initial scroll position
    window.scrollTo({ top: initialScrollY, behavior: 'smooth' });

    return {
      success: true,
      ...pageData
    };
  }

  /**
   * Progressively scrolls to the bottom of the page
   */
  function autoScrollPage() {
    return new Promise((resolve) => {
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight
      );
      const viewportHeight = window.innerHeight || 800;
      let currentScroll = 0;
      const scrollStep = Math.min(viewportHeight * 0.75, 500);

      const timer = setInterval(() => {
        currentScroll += scrollStep;
        window.scrollTo({ top: currentScroll, behavior: 'smooth' });

        if (currentScroll >= totalHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 120);

      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 6000);
    });
  }

  /**
   * Extracts visible structured text from the web page
   */
  function extractPageData() {
    const title = document.title || 'Untitled Document';
    const url = window.location.href;

    const clone = document.body.cloneNode(true);
    const tagsToRemove = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe'];
    tagsToRemove.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    const fullText = (clone.innerText || clone.textContent || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    return {
      title,
      url,
      fullText
    };
  }

  /**
   * Main DOM Auto-filler for worksheet questions (QuestMaster & Universal fallback)
   */
  function executeAutoFillOnDom(questions) {
    if (!questions || !Array.isArray(questions)) return 0;
    let filledCount = 0;

    const cards = Array.from(document.querySelectorAll(
      '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
    ));

    questions.forEach((q, idx) => {
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
          if (badge) {
            return badge.innerText.replace(/[^0-9]/g, '') === qNumClean;
          }
          return card.id && card.id.endsWith(qNumClean);
        });
      }

      if (!targetCard && cards[idx]) {
        targetCard = cards[idx];
      }

      if (!targetCard) return;

      // Dropdown support inside executeAutoFillOnDom
      const selectElements = Array.from(targetCard.querySelectorAll('select'));
      const dropdownAnswers = Array.isArray(q.dropdownAnswers) && q.dropdownAnswers.length > 0
        ? q.dropdownAnswers
        : (typeof q.answerText === 'string' && q.answerText.includes('➔')
            ? q.answerText.split('➔').map(s => s.trim())
            : null);

      if (selectElements.length > 0 && Array.isArray(dropdownAnswers) && dropdownAnswers.length > 0) {
        dropdownAnswers.forEach((ans, aIdx) => {
          const select = selectElements[aIdx];
          if (!select || !ans) return;
          const cleanAns = ans.trim().toLowerCase().replace(/^["']|["']$/g, '');
          const normAns = cleanAns.replace(/[^a-z0-9]/g, '');
          const opt = Array.from(select.options).find(o => {
            const t = (o.text || o.innerText || '').trim().toLowerCase();
            const val = (o.value || '').trim().toLowerCase();
            const normT = t.replace(/[^a-z0-9]/g, '');
            return t === cleanAns || val === cleanAns || normT === normAns || t.includes(cleanAns) || cleanAns.includes(t);
          });
          if (opt) {
            setNativeInputValue(select, opt.value);
            select.selectedIndex = opt.index;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        targetCard.classList.add('answered');
        filledCount++;
        return;
      }

      const targetOptions = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
        ? q.correctOptions
        : (q.correctOption ? [q.correctOption] : []);
      const isMulti = q.isMultiSelect || targetOptions.length > 1 || !!targetCard.querySelector('.multi-option-input');

      if (isMulti && targetOptions.length > 0) {
        // Multi-select branch
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
        filledCount++;
      } else if (q.type === 'mcq' || targetOptions.length > 0) {
        // Single choice branch (100% backward compatible)
        const labels = Array.from(targetCard.querySelectorAll(
          '.option-label, label, button[class*="option"], div.option, li[class*="option"], div[class*="choice"]'
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
          const parentOpt = matchedLabel.closest('.option, .option-label, label, div[class*="choice"]') || matchedLabel;
          const checkbox = matchedLabel.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]') ||
            parentOpt.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]') ||
            (matchedLabel.getAttribute('for') ? targetCard.querySelector('#' + CSS.escape(matchedLabel.getAttribute('for'))) : null);

          if (checkbox) {
            targetCard.querySelectorAll('.option-checkbox, input[type="checkbox"], input[type="radio"]').forEach(cb => {
              if (cb !== checkbox) {
                cb.checked = false;
                cb.closest('.option-label, label, div.option, div[class*="choice"]')?.classList.remove('is-selected');
              }
            });

            checkbox.checked = true;
            matchedLabel.classList.add('is-selected');
            parentOpt.classList.add('is-selected');

            try { checkbox.click(); } catch (_) {}
            try { matchedLabel.click(); } catch (_) {}

            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            matchedLabel.classList.add('is-selected');
            parentOpt.classList.add('is-selected');
            try { matchedLabel.click(); } catch (_) {}
          }
          targetCard.classList.add('answered');
          filledCount++;
        }
      } else {
        const input = targetCard.querySelector('.text-input-field, input[type="text"], input:not([type]), textarea');
        if (input && q.answerText) {
          setNativeInputValue(input, q.answerText);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          targetCard.classList.add('answered');
          filledCount++;
        }
      }
    });

    try {
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
    } catch {
      // Ignore UI progress calculation errors
    }

    return filledCount;
  }

  function setNativeInputValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function injectInteractiveStyles() {
    if (document.getElementById('agy-interactive-styles')) return;

    const style = document.createElement('style');
    style.id = 'agy-interactive-styles';
    style.textContent = `
      @keyframes agyPulseGlow {
        0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); }
        70% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
        100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
      }
      @keyframes agySuccessGlow {
        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .agy-card-solving {
        outline: 2px solid #6366f1 !important;
        animation: agyPulseGlow 1.5s infinite !important;
        position: relative !important;
        transition: all 0.3s ease !important;
      }
      .agy-card-success {
        outline: 2px solid #10b981 !important;
        animation: agySuccessGlow 1.2s ease-out !important;
      }
      .agy-floating-toast {
        position: absolute;
        top: -38px;
        right: 12px;
        background: #111827;
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.4);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 6px;
        pointer-events: none;
        animation: agyFadeIn 0.25s ease;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .agy-floating-toast.solving {
        color: #a5b4fc;
        border-color: rgba(99, 102, 241, 0.4);
      }
      @keyframes agyFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Modern Glassmorphic Side Banner */
      .agy-side-banner {
        position: fixed !important;
        top: 28px !important;
        right: 24px !important;
        width: 330px !important;
        max-width: calc(100vw - 32px) !important;
        background: rgba(15, 23, 42, 0.94) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-radius: 14px !important;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.2) !important;
        color: #f1f5f9 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        z-index: 2147483647 !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        animation: agyBannerSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .agy-side-banner.hidden {
        transform: translateX(115%) !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      @keyframes agyBannerSlideIn {
        from { transform: translateX(115%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .agy-banner-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 10px 14px !important;
        background: rgba(30, 41, 59, 0.6) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      }
      .agy-banner-badge {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: #818cf8 !important;
      }
      .agy-banner-badge.solved {
        color: #34d399 !important;
      }
      .agy-banner-actions {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }
      .agy-banner-btn {
        background: rgba(255, 255, 255, 0.08) !important;
        border: none !important;
        color: #94a3b8 !important;
        cursor: pointer !important;
        width: 24px !important;
        height: 24px !important;
        border-radius: 6px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 12px !important;
        transition: all 0.2s ease !important;
        padding: 0 !important;
      }
      .agy-banner-btn:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        color: #fff !important;
      }
      .agy-banner-btn.pinned {
        background: #6366f1 !important;
        color: #fff !important;
      }
      .agy-banner-body {
        padding: 12px 14px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
      }
      .agy-banner-qtitle {
        font-size: 11.5px !important;
        color: #94a3b8 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .agy-banner-answer-card {
        background: rgba(16, 185, 129, 0.12) !important;
        border: 1px solid rgba(16, 185, 129, 0.3) !important;
        border-radius: 8px !important;
        padding: 9px 12px !important;
      }
      .agy-banner-answer-val {
        color: #34d399 !important;
        font-size: 13.5px !important;
        font-weight: 700 !important;
        word-break: break-word !important;
      }
      .agy-banner-explanation {
        font-size: 11.5px !important;
        color: #cbd5e1 !important;
        line-height: 1.5 !important;
        background: rgba(255, 255, 255, 0.04) !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        border-left: 2px solid #6366f1 !important;
      }
      .agy-banner-progress {
        height: 3px !important;
        background: rgba(255, 255, 255, 0.08) !important;
        width: 100% !important;
      }
      .agy-banner-progress-fill {
        height: 100% !important;
        background: #10b981 !important;
        width: 100% !important;
        transition: width 0.1s linear !important;
      }

      /* Sniping Selection Tool */
      #agy-snip-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483646 !important;
        cursor: crosshair !important;
        user-select: none !important;
        background: rgba(0, 0, 0, 0.35) !important;
        backdrop-filter: blur(1.5px) !important;
        -webkit-backdrop-filter: blur(1.5px) !important;
      }
      #agy-snip-instructions {
        position: fixed !important;
        top: 24px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: rgba(15, 23, 42, 0.95) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        color: #e2e8f0 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        padding: 9px 20px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        pointer-events: none !important;
      }
      #agy-snip-selection {
        position: fixed !important;
        border: 2px dashed #10b981 !important;
        background: rgba(16, 185, 129, 0.14) !important;
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.4), inset 0 0 15px rgba(16, 185, 129, 0.12) !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        border-radius: 5px !important;
      }
      /* Stealth Mode Styles */
      .agy-stealth-mark {
        border-bottom: 2.5px solid #10b981 !important;
        position: relative !important;
        transition: all 0.2s ease !important;
      }
      .agy-stealth-mark::after {
        content: " ✓" !important;
        color: #10b981 !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        margin-left: 5px !important;
      }
      .agy-stealth-hud {
        position: fixed !important;
        top: 24px !important;
        right: 24px !important;
        background: rgba(10, 14, 20, 0.94) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
        color: #10b981 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12.5px !important;
        font-weight: 700 !important;
        padding: 7px 16px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(16, 185, 129, 0.4) !important;
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5) !important;
        z-index: 2147483647 !important;
        animation: agyFadeIn 0.25s ease !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function getStorageData(keys, defaults = {}) {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const res = await chrome.storage.local.get(keys);
        return { ...defaults, ...res };
      }
    } catch {
      // Storage unavailable or context invalidated
    }
    return defaults;
  }

  function safeSendMessage(message) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
          return resolve({ success: false, error: 'Extension updated. Please refresh this page (F5).' });
        }
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime?.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      } catch (err) {
        resolve({ success: false, error: 'Extension context disconnected. Please refresh this page (F5).' });
      }
    });
  }

  function applyStealthHighlight(card, result) {
    // Dropdown / Cloze support
    const selectElements = Array.from(card.querySelectorAll('select'));
    if (selectElements.length > 0) {
      selectElements.forEach(sel => sel.classList.add('agy-stealth-mark'));
      const hintText = Array.isArray(result.dropdownAnswers) && result.dropdownAnswers.length > 0
        ? result.dropdownAnswers.join(' ➔ ')
        : (result.answerText || 'Solved');
      showStealthMicroHud(hintText);
      card.classList.add('answered');
      return;
    }

    const targetOptions = Array.isArray(result.correctOptions) && result.correctOptions.length > 0
      ? result.correctOptions
      : (result.correctOption ? [result.correctOption] : []);

    const labels = Array.from(card.querySelectorAll(
      '.option-label, label, button[class*="option"], div.option, li[class*="option"], div[class*="choice"]'
    ));

    // 1. Multiple Choice / Radio / Checkbox Questions
    if (labels.length > 0) {
      labels.forEach((label, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const optLetter = (label.querySelector('.option-letter, [class*="letter"]')?.innerText || '')
          .replace(/[^A-Za-z]/g, '').toUpperCase() || letter;
        const optText = (label.querySelector('.option-text')?.innerText || label.innerText || '')
          .replace(/^[A-Za-z][.)]\s*/, '').trim().toLowerCase();

        const isMatch = targetOptions.some(opt => {
          const o = opt.trim().toUpperCase();
          const oLow = opt.trim().toLowerCase();
          return o === optLetter || o === letter || (optText && oLow === optText) || (result.answerText && optText && result.answerText.toLowerCase().includes(optText));
        });

        if (isMatch) {
          label.classList.add('agy-stealth-mark');
        } else {
          label.classList.remove('agy-stealth-mark');
        }
      });
    }

    // 2. Short Answer / Textarea / Type-in Input Fields (Auto-Type in Stealth Mode)
    const textInput = card.querySelector('.text-input-field, textarea, input[type="text"], input:not([type])');
    if (textInput && result.answerText) {
      const valueSetter = Object.getOwnPropertyDescriptor(textInput, 'value')?.set;
      const prototype = Object.getPrototypeOf(textInput);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(textInput, result.answerText);
      } else if (valueSetter) {
        valueSetter.call(textInput, result.answerText);
      } else {
        textInput.value = result.answerText;
      }

      textInput.dispatchEvent(new Event('input', { bubbles: true }));
      textInput.dispatchEvent(new Event('change', { bubbles: true }));

      // Subtle indicator and silent clipboard copy
      textInput.classList.add('agy-stealth-mark');
      navigator.clipboard.writeText(result.answerText).catch(() => {});
    }

    card.classList.add('answered');
  }

  function showStealthMicroHud(text) {
    let hud = document.getElementById('agy-stealth-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'agy-stealth-hud';
      hud.className = 'agy-stealth-hud';
      document.body.appendChild(hud);
    }
    hud.innerText = `● Hint: [${text || 'Solved'}]`;
    hud.style.display = 'block';
    setTimeout(() => {
      if (hud) hud.style.display = 'none';
    }, 2500);
  }

  document.addEventListener('dblclick', async (e) => {
    try {
      const storage = await getStorageData([
        'solver_mode',
        'enable_double_click',
        'invisible_autofill',
        'invisible_clipboard',
        'invisible_double_click',
        'stealth_highlight_only',
        'stealth_autofill',
        'stealth_hints_only',
        'stealth_double_click',
        'explain_autofill',
        'explain_side_banner',
        'show_side_banner'
      ], {
        solver_mode: 'stealth',
        invisible_autofill: true,
        invisible_clipboard: true,
        invisible_double_click: true,
        stealth_highlight_only: false,
        stealth_autofill: true,
        stealth_hints_only: false,
        stealth_double_click: true,
        explain_autofill: true,
        explain_side_banner: true,
        show_side_banner: true
      });

      const mode = storage.solver_mode || 'stealth';

      // Check if double click is enabled for this mode
      if (mode === 'invisible' && storage.invisible_double_click === false) return;
      if (mode === 'stealth' && storage.stealth_double_click === false) return;
      if (mode === 'explain' && storage.enable_double_click === false && storage.explain_autofill === false) return;

      const card = e.target.closest(
        '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
      );
      if (!card) return;

      window.getSelection()?.removeAllRanges();

      if (card.dataset.agySolving === 'true') return;
      card.dataset.agySolving = 'true';

      injectInteractiveStyles();

      const questionData = extractSingleCardData(card);
      if (!questionData || !questionData.question) {
        card.dataset.agySolving = 'false';
        return;
      }

      // Visual solving feedback only if NOT invisible
      if (mode !== 'invisible') {
        card.classList.add('agy-card-solving');
        if (mode === 'explain') {
          showCardToast(card, '⚡ Solving with AI...', true);
          if (storage.explain_side_banner !== false) {
            showSideAnswerBanner(questionData, null, true);
          }
        }
      }

      const response = await safeSendMessage({
        action: 'SOLVE_SINGLE_QUESTION',
        questionData
      });

      if (mode !== 'invisible') {
        card.classList.remove('agy-card-solving');
      }

      if (response && response.success && response.result) {
        if (mode === 'invisible') {
          // Mode 1: Invisible
          if (storage.invisible_autofill !== false) {
            applySingleAnswer(card, response.result, true);
          }
          if (storage.invisible_clipboard !== false) {
            const copyText = response.result.answerText || response.result.correctOption || '';
            navigator.clipboard.writeText(copyText).catch(() => {});
          }
        } else if (mode === 'stealth') {
          // Mode 2: Stealth (No banners; full autofill when enabled, or subtle hint highlights when autofill is disabled)
          if (storage.stealth_autofill !== false) {
            applySingleAnswer(card, response.result, true);
          } else if (storage.stealth_highlight_only !== false) {
            applyStealthHighlight(card, response.result);
          } else if (storage.stealth_hints_only) {
            const hintText = Array.isArray(response.result.dropdownAnswers) && response.result.dropdownAnswers.length > 0
              ? response.result.dropdownAnswers.join(' ➔ ')
              : (response.result.correctOption || response.result.answerText);
            showStealthMicroHud(hintText);
          }
        } else {
          // Mode 3: Explain
          if (storage.explain_autofill !== false) {
            applySingleAnswer(card, response.result, false);
            card.classList.add('agy-card-success');
            setTimeout(() => card.classList.remove('agy-card-success'), 2000);
          }
          if (storage.explain_side_banner !== false) {
            showSideAnswerBanner(questionData, response.result, false);
          }
          const ansDisplay = Array.isArray(response.result.dropdownAnswers) && response.result.dropdownAnswers.length > 0
            ? response.result.dropdownAnswers.join(' ➔ ')
            : (response.result.correctOption 
                ? `${response.result.correctOption}) ${response.result.answerText}`
                : response.result.answerText);
          showCardToast(card, `✓ Solved: ${ansDisplay}`, false);
        }
      } else {
        const errText = (response && response.error) ? response.error : 'Failed to solve question';
        if (mode === 'explain') {
          showCardToast(card, '⚠️ ' + errText, false);
          if (storage.explain_side_banner !== false) {
            showSideAnswerBanner(questionData, { isError: true, error: errText }, false);
          }
        }
      }
    } catch (err) {
      console.warn('[Interactive Solver Error]:', err);
    } finally {
      const card = e.target.closest('.question-card, article[id^="card_"]');
      if (card) card.dataset.agySolving = 'false';
    }
  });

  function extractSingleCardData(card) {
    const selectElements = Array.from(card.querySelectorAll('select'));

    // Branch 1: Multiple Dropdowns / Cloze Fill-in-the-blanks
    if (selectElements.length > 0) {
      const dropdowns = selectElements.map((sel, idx) => {
        const selOptions = Array.from(sel.options)
          .map(opt => (opt.text || opt.innerText || '').trim())
          .filter(txt => txt && !txt.toLowerCase().includes('select') && !txt.startsWith('--'));

        return {
          index: idx,
          name: sel.name || `dropdown_${idx}`,
          options: selOptions
        };
      });

      // Clone question text container or card to create clean sentence with [Blank 1], [Blank 2]...
      const textElem = card.querySelector('.question-text, .question_text, h3, h4, p') || card;
      const clone = textElem.cloneNode(true);
      const cloneSelects = Array.from(clone.querySelectorAll('select'));
      cloneSelects.forEach((sel, idx) => {
        const placeholder = document.createTextNode(` [Blank ${idx + 1}] `);
        sel.parentNode?.replaceChild(placeholder, sel);
      });
      const question = (clone.innerText || clone.textContent || '').trim();

      return {
        question,
        type: 'dropdown',
        dropdowns,
        options: dropdowns.map((d, i) => ({
          label: `Blank ${i + 1}`,
          text: d.options.join(' | ')
        }))
      };
    }

    const textElem = card.querySelector('.question-text, h3, h4, p');
    const question = (textElem ? textElem.innerText : card.innerText || '').trim();

    let labels = Array.from(card.querySelectorAll(
      '.option-label, label, button[class*="option"]'
    ));
    if (labels.length === 0) {
      labels = Array.from(card.querySelectorAll('div.option, li[class*="option"], div[class*="choice"]'));
    }

    const options = labels.map((l, i) => {
      const letter = (l.querySelector('.option-letter, [class*="letter"]')?.innerText || '').replace(/[^A-Za-z]/g, '') || String.fromCharCode(65 + i);
      const text = (l.querySelector('.option-text')?.innerText || l.innerText || '').replace(/^[A-Za-z][.)]\s*/, '').trim();
      return { label: letter, text };
    });

    const hasTextInput = !!card.querySelector('.text-input-field, input[type="text"], input:not([type]), textarea');
    const cardFullText = (card.innerText || '').toLowerCase();
    const isMultiHint = !!card.querySelector('.multi-option-input') || 
      cardFullText.includes('select all') || 
      cardFullText.includes('multiple choices') ||
      cardFullText.includes('more than one');

    return {
      question,
      options,
      type: hasTextInput ? 'short' : (isMultiHint ? 'multi' : 'mcq'),
      isMultiHint
    };
  }

  function applySingleAnswer(card, result) {
    // 0. Dropdown / Cloze Questions Support (Step 3)
    const selectElements = Array.from(card.querySelectorAll('select'));
    const dropdownAnswers = Array.isArray(result.dropdownAnswers) && result.dropdownAnswers.length > 0
      ? result.dropdownAnswers
      : (typeof result.answerText === 'string' && result.answerText.includes('➔')
          ? result.answerText.split('➔').map(s => s.trim())
          : null);

    if (selectElements.length > 0 && Array.isArray(dropdownAnswers) && dropdownAnswers.length > 0) {
      dropdownAnswers.forEach((ans, idx) => {
        const select = selectElements[idx];
        if (!select || !ans) return;

        const cleanAns = ans.trim().toLowerCase().replace(/^["']|["']$/g, '');
        const normAns = cleanAns.replace(/[^a-z0-9]/g, '');

        let matchedOption = Array.from(select.options).find(opt => {
          const optText = (opt.text || opt.innerText || '').trim().toLowerCase();
          const optVal = (opt.value || '').trim().toLowerCase();
          const normOpt = optText.replace(/[^a-z0-9]/g, '');
          return optText === cleanAns ||
                 optVal === cleanAns ||
                 normOpt === normAns ||
                 (optText && cleanAns && (optText.includes(cleanAns) || cleanAns.includes(optText)));
        });

        if (matchedOption) {
          setNativeInputValue(select, matchedOption.value);
          select.selectedIndex = matchedOption.index;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      card.classList.add('answered');
      return;
    }

    const targetOptions = Array.isArray(result.correctOptions) && result.correctOptions.length > 0
      ? result.correctOptions
      : (result.correctOption ? [result.correctOption] : []);
    const isMulti = result.isMultiSelect || targetOptions.length > 1 || !!card.querySelector('.multi-option-input');

    if (isMulti && targetOptions.length > 0) {
      // Multi-select branch
      const checkboxes = Array.from(card.querySelectorAll('.multi-option-input, .option-checkbox, input[type="checkbox"]'));
      if (checkboxes.length > 0) {
        checkboxes.forEach((cb, idx) => {
          const letter = String.fromCharCode(65 + idx);
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
                   (result.answerText && optText && result.answerText.toLowerCase().includes(optText));
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
        const labels = Array.from(card.querySelectorAll('.option-label, label, button[class*="option"]'));
        labels.forEach((label, idx) => {
          const letter = String.fromCharCode(65 + idx);
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
    } else if (targetOptions.length > 0) {
      // Single choice branch (100% backward compatible)
      const labels = Array.from(card.querySelectorAll(
        '.option-label, label, button[class*="option"], div.option, li[class*="option"], div[class*="choice"]'
      ));

      const singleOption = targetOptions[0];
      const cleanSingle = (singleOption || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      let targetLabel = labels.find((l, idx) => {
        const letter = (l.querySelector('.option-letter, [class*="letter"]')?.innerText || '')
          .replace(/[^A-Za-z0-9]/g, '').toUpperCase() || String.fromCharCode(65 + idx);
        return letter === cleanSingle || letter.startsWith(cleanSingle) || cleanSingle.startsWith(letter);
      });

      if (!targetLabel && result.answerText) {
        const cleanAns = result.answerText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        targetLabel = labels.find(l => {
          const text = (l.querySelector('.option-text')?.innerText || l.innerText || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          return text && (text.includes(cleanAns) || cleanAns.includes(text));
        });
      }

      if (targetLabel) {
        const parentOpt = targetLabel.closest('.option, .option-label, label, div[class*="choice"]') || targetLabel;
        const checkbox = targetLabel.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]') ||
          parentOpt.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]') ||
          (targetLabel.getAttribute('for') ? card.querySelector('#' + CSS.escape(targetLabel.getAttribute('for'))) : null);

        if (checkbox) {
          card.querySelectorAll('.option-checkbox, input[type="checkbox"], input[type="radio"]').forEach(cb => {
            if (cb !== checkbox) {
              cb.checked = false;
              cb.closest('.option-label, label, div.option, div[class*="choice"]')?.classList.remove('is-selected');
            }
          });

          checkbox.checked = true;
          targetLabel.classList.add('is-selected');
          parentOpt.classList.add('is-selected');

          try {
            checkbox.click();
          } catch (_) {}
          try {
            targetLabel.click();
          } catch (_) {}

          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          targetLabel.classList.add('is-selected');
          parentOpt.classList.add('is-selected');
          try { targetLabel.click(); } catch (_) {}
        }
      }
    } else if (result.answerText) {
      const input = card.querySelector('.text-input-field, input[type="text"], input:not([type]), textarea');
      if (input) {
        setNativeInputValue(input, result.answerText);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    card.classList.add('answered');

    try {
      const answeredElem = document.getElementById('answeredCount');
      const totalElem = document.getElementById('totalQuestionsCount');
      const progBar = document.getElementById('progressBar');
      const progPct = document.getElementById('progressPercentage');
      if (answeredElem && totalElem) {
        const answered = document.querySelectorAll('.question-card.answered').length;
        answeredElem.textContent = answered;
        const total = parseInt(totalElem.textContent) || 14;
        const pct = Math.round((answered / total) * 100);
        if (progBar) progBar.style.width = pct + '%';
        if (progPct) progPct.textContent = pct + '%';
      }
    } catch {
      // Ignore progress calculation errors
    }
  }

  function showCardToast(card, text, isSolving) {
    removeCardToast(card);
    const toast = document.createElement('div');
    toast.className = `agy-floating-toast ${isSolving ? 'solving' : ''}`;
    toast.innerText = text;
    card.style.position = 'relative';
    card.appendChild(toast);

    if (!isSolving) {
      setTimeout(() => removeCardToast(card), 3200);
    }
  }

  function removeCardToast(card) {
    const existing = card.querySelector('.agy-floating-toast');
    if (existing) existing.remove();
  }

  /* Smart Right-Side Answer Banner */
  let sideBannerTimer = null;
  let sideBannerProgressInterval = null;
  let isSideBannerPinned = false;

  function showSideAnswerBanner(questionData, result, isSolving) {
    injectInteractiveStyles();
    let banner = document.getElementById('agy-side-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'agy-side-banner';
      banner.className = 'agy-side-banner';
      document.body.appendChild(banner);
    }

    clearInterval(sideBannerProgressInterval);
    clearTimeout(sideBannerTimer);

    banner.classList.remove('hidden');

    const qText = (questionData?.question || 'Question').trim();
    const shortQ = qText.length > 55 ? qText.substring(0, 52) + '...' : qText;

    if (isSolving) {
      banner.innerHTML = `
        <div class="agy-banner-header">
          <div class="agy-banner-badge">
            <span>⚡</span>
            <span>Solving with AI...</span>
          </div>
          <div class="agy-banner-actions">
            <button class="agy-banner-btn" id="agy-banner-close" title="Close">✕</button>
          </div>
        </div>
        <div class="agy-banner-body">
          <div class="agy-banner-qtitle" title="${escapeHtml(qText)}">${escapeHtml(shortQ)}</div>
          <div class="agy-banner-answer-card">
            <span class="agy-banner-answer-val" style="color: #a5b4fc; font-size: 12.5px;">Analyzing question & options...</span>
          </div>
        </div>
      `;
      document.getElementById('agy-banner-close')?.addEventListener('click', () => {
        banner.classList.add('hidden');
      });
      return;
    }

    if (result?.isError) {
      banner.innerHTML = `
        <div class="agy-banner-header">
          <div class="agy-banner-badge" style="color: #f87171;">
            <span>⚠️</span>
            <span>Solver Error</span>
          </div>
          <div class="agy-banner-actions">
            <button class="agy-banner-btn" id="agy-banner-close" title="Close">✕</button>
          </div>
        </div>
        <div class="agy-banner-body">
          <div class="agy-banner-qtitle" title="${escapeHtml(qText)}">${escapeHtml(shortQ)}</div>
          <div class="agy-banner-answer-card" style="background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.35);">
            <div>
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #f87171; font-weight: 700; margin-bottom: 2px;">Error Notice</div>
              <span class="agy-banner-answer-val" style="color: #fca5a5; font-size: 12px;">${escapeHtml(result.error || 'Failed to communicate with AI model.')}</span>
            </div>
          </div>
          <div style="font-size: 11px; color: #94a3b8;">Check your Gemini API Key in Extension Settings.</div>
        </div>
      `;
      document.getElementById('agy-banner-close')?.addEventListener('click', () => {
        banner.classList.add('hidden');
      });
      return;
    }

    // Solved state
    let answerCardContent = '';
    let fullAnswerText = '';

    const dropdownAnswers = Array.isArray(result?.dropdownAnswers) && result.dropdownAnswers.length > 0
      ? result.dropdownAnswers
      : (typeof result?.answerText === 'string' && result.answerText.includes('➔')
          ? result.answerText.split('➔').map(s => s.trim())
          : null);

    if (Array.isArray(dropdownAnswers) && dropdownAnswers.length > 0) {
      const dropdownRows = dropdownAnswers.map((ans, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.08); font-size: 12px;">
          <span style="color: #94a3b8; font-weight: 600;">Blank ${i + 1}:</span>
          <span style="color: #34d399; font-weight: 700;">${escapeHtml(ans)}</span>
        </div>
      `).join('');

      answerCardContent = `
        <div>
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #34d399; font-weight: 700; margin-bottom: 4px;">Predicted Dropdown Selections</div>
          ${dropdownRows}
        </div>
      `;
      fullAnswerText = dropdownAnswers.map((a, i) => `[Blank ${i + 1}]: ${a}`).join('\n');
    } else {
      const targetOpts = Array.isArray(result?.correctOptions) && result.correctOptions.length > 0
        ? result.correctOptions
        : (result?.correctOption ? [result.correctOption] : []);

      let optDisplay = '';
      if (result?.isMultiSelect || targetOpts.length > 1) {
        optDisplay = `[${targetOpts.join(', ')}] `;
      } else if (result?.correctOption) {
        optDisplay = `${result.correctOption}) `;
      }

      fullAnswerText = `${optDisplay}${result?.answerText || ''}`.trim() || 'Answer Detected';
      answerCardContent = `
        <div>
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #34d399; font-weight: 700; margin-bottom: 2px;">Predicted Answer</div>
          <span class="agy-banner-answer-val">${escapeHtml(fullAnswerText)}</span>
        </div>
      `;
    }

    const explanationText = result?.explanation ? result.explanation.trim() : '';

    banner.innerHTML = `
      <div class="agy-banner-header">
        <div class="agy-banner-badge solved">
          <span>✓</span>
          <span>Answer Solved</span>
        </div>
        <div class="agy-banner-actions">
          <button class="agy-banner-btn ${isSideBannerPinned ? 'pinned' : ''}" id="agy-banner-pin" title="${isSideBannerPinned ? 'Unpin' : 'Pin'}">📌</button>
          <button class="agy-banner-btn" id="agy-banner-copy" title="Copy Answer">📋</button>
          <button class="agy-banner-btn" id="agy-banner-close" title="Close">✕</button>
        </div>
      </div>
      <div class="agy-banner-body">
        <div class="agy-banner-qtitle" title="${escapeHtml(qText)}">${escapeHtml(shortQ)}</div>
        <div class="agy-banner-answer-card solved">
          ${answerCardContent}
        </div>
        ${explanationText ? `<div class="agy-banner-explanation"><strong>Rationale:</strong> ${escapeHtml(explanationText)}</div>` : ''}
      </div>
      <div class="agy-banner-progress">
        <div class="agy-banner-progress-fill" id="agy-banner-pfill"></div>
      </div>
    `;

    // Event handlers
    const closeBtn = document.getElementById('agy-banner-close');
    const pinBtn = document.getElementById('agy-banner-pin');
    const copyBtn = document.getElementById('agy-banner-copy');
    const pFill = document.getElementById('agy-banner-pfill');

    closeBtn?.addEventListener('click', () => {
      clearInterval(sideBannerProgressInterval);
      clearTimeout(sideBannerTimer);
      banner.classList.add('hidden');
    });

    pinBtn?.addEventListener('click', () => {
      isSideBannerPinned = !isSideBannerPinned;
      pinBtn.classList.toggle('pinned', isSideBannerPinned);
      if (isSideBannerPinned) {
        clearInterval(sideBannerProgressInterval);
        clearTimeout(sideBannerTimer);
        if (pFill) pFill.style.width = '100%';
      } else {
        startDismissTimer(pFill, banner);
      }
    });

    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(fullAnswerText);
      copyBtn.innerText = '✓';
      setTimeout(() => { copyBtn.innerText = '📋'; }, 1500);
    });

    if (!isSideBannerPinned) {
      startDismissTimer(pFill, banner);
    }

    banner.onmouseenter = () => {
      if (!isSideBannerPinned) {
        clearInterval(sideBannerProgressInterval);
        clearTimeout(sideBannerTimer);
      }
    };

    banner.onmouseleave = () => {
      if (!isSideBannerPinned) {
        startDismissTimer(pFill, banner);
      }
    };
  }

  function startDismissTimer(pFill, banner) {
    clearInterval(sideBannerProgressInterval);
    clearTimeout(sideBannerTimer);

    const totalMs = 6000;
    const intervalMs = 100;
    let remainingMs = totalMs;

    if (pFill) pFill.style.width = '100%';

    sideBannerProgressInterval = setInterval(() => {
      remainingMs -= intervalMs;
      if (pFill) {
        pFill.style.width = `${Math.max(0, (remainingMs / totalMs) * 100)}%`;
      }
      if (remainingMs <= 0) {
        clearInterval(sideBannerProgressInterval);
      }
    }, intervalMs);

    sideBannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, totalMs);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* Sniping Tool Mode Logic */
  let isSnipModeActive = false;

  function activateSnipMode() {
    if (isSnipModeActive) return;
    isSnipModeActive = true;
    injectInteractiveStyles();

    const overlay = document.createElement('div');
    overlay.id = 'agy-snip-overlay';

    const instructions = document.createElement('div');
    instructions.id = 'agy-snip-instructions';
    instructions.innerHTML = `
      <span>✂️ <strong>Snip Tool</strong>: Drag around question & options</span>
      <span style="opacity: 0.4;">|</span>
      <span style="font-size: 11.5px; color: #94a3b8;">Press <strong>Esc</strong> to cancel</span>
    `;

    const selectionBox = document.createElement('div');
    selectionBox.id = 'agy-snip-selection';
    selectionBox.style.display = 'none';

    overlay.appendChild(instructions);
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const cleanup = () => {
      isSnipModeActive = false;
      overlay.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // Left click only
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
      selectionBox.style.display = 'block';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    const onMouseUp = async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const finalRect = selectionBox.getBoundingClientRect();
      const cropX = finalRect.left;
      const cropY = finalRect.top;
      const cropWidth = finalRect.width;
      const cropHeight = finalRect.height;

      cleanup();

      // Ignore trivial clicks
      if (cropWidth < 30 || cropHeight < 30) {
        return;
      }

      await handleCropAndSolve(cropX, cropY, cropWidth, cropHeight, finalRect);
    };

    overlay.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }

  function cropImage(dataUrl, x, y, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(
          img,
          Math.round(x * dpr),
          Math.round(y * dpr),
          Math.round(width * dpr),
          Math.round(height * dpr),
          0,
          0,
          Math.round(width * dpr),
          Math.round(height * dpr)
        );

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function handleCropAndSolve(cropX, cropY, cropWidth, cropHeight, cropBox) {
    const storage = await getStorageData([
      'solver_mode',
      'invisible_autofill',
      'invisible_clipboard',
      'stealth_highlight_only',
      'stealth_autofill',
      'stealth_hints_only',
      'explain_autofill',
      'explain_side_banner',
      'snip_auto_fill',
      'show_side_banner'
    ], {
      solver_mode: 'stealth',
      invisible_autofill: true,
      invisible_clipboard: true,
      stealth_highlight_only: false,
      stealth_autofill: true,
      stealth_hints_only: false,
      explain_autofill: true,
      explain_side_banner: true,
      snip_auto_fill: true,
      show_side_banner: true
    });

    const mode = storage.solver_mode || 'stealth';

    if (mode === 'explain') {
      showSideAnswerBanner({ question: 'Analyzing Snip Selection...' }, null, true);
    }

    // Find any question card container overlapping the selection
    const targetCard = document.elementFromPoint(cropX + cropWidth / 2, cropY + cropHeight / 2)?.closest(
      '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
    ) || document.elementFromPoint(cropX + 20, cropY + 20)?.closest(
      '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
    );

    if (targetCard && mode !== 'invisible') {
      targetCard.classList.add('agy-card-solving');
      if (mode === 'explain') {
        showCardToast(targetCard, '⚡ Solving Snip...', true);
      }
    }

    try {
      // 1. Capture screen via background worker
      const captureRes = await safeSendMessage({ action: 'CAPTURE_VISIBLE_TAB' });
      if (!captureRes || !captureRes.success || !captureRes.dataUrl) {
        throw new Error(captureRes?.error || 'Failed to capture screen.');
      }

      // 2. Crop accurately using devicePixelRatio
      const croppedImage = await cropImage(captureRes.dataUrl, cropX, cropY, cropWidth, cropHeight);

      // Collect any DOM options labels inside crop box to assist model accuracy
      const optionsList = extractOptionsInsideBox(cropBox);

      // 3. Request Gemini Multimodal Vision solver
      const solveRes = await safeSendMessage({
        action: 'SOLVE_IMAGE_QUESTION',
        imageData: croppedImage,
        optionsList
      });

      if (targetCard && mode !== 'invisible') {
        targetCard.classList.remove('agy-card-solving');
      }

      if (solveRes && solveRes.success && solveRes.result) {
        const questionTitle = solveRes.result.questionText || 'Snip Question';

        if (mode === 'invisible') {
          // Invisible Mode
          if (storage.invisible_autofill !== false) {
            if (targetCard) applySingleAnswer(targetCard, solveRes.result, true);
            else autoFillInsideBoundingBox(cropBox, solveRes.result);
          }
          if (storage.invisible_clipboard !== false) {
            const copyText = solveRes.result.answerText || solveRes.result.correctOption || '';
            navigator.clipboard.writeText(copyText).catch(() => {});
          }
        } else if (mode === 'stealth') {
          // Stealth Mode (Zero side banners)
          if (storage.stealth_autofill !== false) {
            if (targetCard) applySingleAnswer(targetCard, solveRes.result, true);
            else autoFillInsideBoundingBox(cropBox, solveRes.result);
          } else if (storage.stealth_highlight_only !== false) {
            if (targetCard) applyStealthHighlight(targetCard, solveRes.result);
            else if (storage.stealth_hints_only) {
              const hintText = Array.isArray(solveRes.result.dropdownAnswers) && solveRes.result.dropdownAnswers.length > 0
                ? solveRes.result.dropdownAnswers.join(' ➔ ')
                : (solveRes.result.correctOption || solveRes.result.answerText);
              showStealthMicroHud(hintText);
            }
          }
        } else {
          // Explain Mode
          if (storage.explain_autofill !== false && storage.snip_auto_fill !== false) {
            if (targetCard) {
              applySingleAnswer(targetCard, solveRes.result, false);
              targetCard.classList.add('agy-card-success');
              setTimeout(() => targetCard.classList.remove('agy-card-success'), 2000);
              showCardToast(targetCard, '✓ Solved & Auto-filled', false);
            } else {
              autoFillInsideBoundingBox(cropBox, solveRes.result);
            }
          }
          if (storage.explain_side_banner !== false) {
            showSideAnswerBanner({ question: questionTitle }, solveRes.result, false);
          }
        }
      } else {
        throw new Error(solveRes?.error || 'Failed to solve cropped question.');
      }
    } catch (err) {
      if (targetCard && mode !== 'invisible') {
        targetCard.classList.remove('agy-card-solving');
        showCardToast(targetCard, '⚠️ ' + err.message, false);
      }
      if (mode === 'explain' && storage.explain_side_banner !== false) {
        showSideAnswerBanner({ question: 'Snip Solver' }, { isError: true, error: err.message }, false);
      }
      throw err;
    }
  }

  function extractOptionsInsideBox(cropBox) {
    try {
      const candidates = Array.from(document.querySelectorAll('label, .option, .option-label, [class*="option"], li'));
      const inside = candidates.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 &&
          r.left >= cropBox.x - 15 &&
          r.right <= cropBox.x + cropBox.width + 15 &&
          r.top >= cropBox.y - 15 &&
          r.bottom <= cropBox.y + cropBox.height + 15;
      });
      return inside.map(el => el.innerText.trim()).filter(Boolean).slice(0, 10);
    } catch {
      return [];
    }
  }

  function autoFillInsideBoundingBox(cropBox, result) {
    try {
      const inputs = Array.from(document.querySelectorAll('input, textarea, select, [role="radio"], [role="checkbox"]'));
      const insideInputs = inputs.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 &&
          r.left >= cropBox.x - 20 &&
          r.right <= cropBox.x + cropBox.width + 20 &&
          r.top >= cropBox.y - 20 &&
          r.bottom <= cropBox.y + cropBox.height + 20;
      });

      if (insideInputs.length === 0) return false;

      // Dropdown support inside crop
      const selects = insideInputs.filter(i => i.tagName === 'SELECT');
      const dropdownAnswers = Array.isArray(result.dropdownAnswers) && result.dropdownAnswers.length > 0
        ? result.dropdownAnswers
        : (typeof result.answerText === 'string' && result.answerText.includes('➔')
            ? result.answerText.split('➔').map(s => s.trim())
            : null);

      if (selects.length > 0 && Array.isArray(dropdownAnswers) && dropdownAnswers.length > 0) {
        selects.forEach((sel, idx) => {
          const ans = dropdownAnswers[idx];
          if (!ans) return;
          const cleanAns = ans.trim().toLowerCase().replace(/^["']|["']$/g, '');
          const normAns = cleanAns.replace(/[^a-z0-9]/g, '');
          const opt = Array.from(sel.options).find(o => {
            const t = (o.text || o.innerText || '').trim().toLowerCase();
            const val = (o.value || '').trim().toLowerCase();
            const normT = t.replace(/[^a-z0-9]/g, '');
            return t === cleanAns || val === cleanAns || normT === normAns || t.includes(cleanAns) || cleanAns.includes(t);
          });
          if (opt) {
            setNativeInputValue(sel, opt.value);
            sel.selectedIndex = opt.index;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        return true;
      }

      const targetOpts = Array.isArray(result.correctOptions) && result.correctOptions.length > 0
        ? result.correctOptions
        : (result.correctOption ? [result.correctOption] : []);

      const radiosAndChecks = insideInputs.filter(i => i.type === 'radio' || i.type === 'checkbox' || i.getAttribute('role') === 'radio' || i.getAttribute('role') === 'checkbox');
      const textInputs = insideInputs.filter(i => (i.type === 'text' || !i.type || i.tagName === 'TEXTAREA') && i.type !== 'radio' && i.type !== 'checkbox');

      let didFill = false;

      if (radiosAndChecks.length > 0) {
        radiosAndChecks.forEach((input, idx) => {
          const letter = String.fromCharCode(65 + idx);
          const label = input.closest('label') || input.parentElement;
          const labelText = (label?.innerText || input.value || '').trim().toLowerCase();
          const isMatch = targetOpts.some(opt => {
            const o = opt.trim().toUpperCase();
            const oLow = opt.trim().toLowerCase();
            return o === letter ||
                   labelText.includes(oLow) ||
                   (result.answerText && labelText.includes(result.answerText.toLowerCase()));
          });

          if (isMatch) {
            input.click();
            if (input.type === 'checkbox' || input.type === 'radio') {
              input.checked = true;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            didFill = true;
          }
        });
      } else if (textInputs.length > 0 && result.answerText) {
        textInputs.forEach(ti => {
          ti.value = result.answerText;
          ti.dispatchEvent(new Event('input', { bubbles: true }));
          ti.dispatchEvent(new Event('change', { bubbles: true }));
          didFill = true;
        });
      }

      return didFill;
    } catch (e) {
      console.warn('[Snip Bounding AutoFill Error]:', e);
      return false;
    }
  }

  // Mode Notification Pill
  function showModeSwitchNotification(mode) {
    if (mode === 'invisible') {
      // Invisible mode: completely silent for proctored/screen sharing safety
      return;
    }
    injectInteractiveStyles();
    let pill = document.getElementById('agy-mode-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'agy-mode-pill';
      pill.className = 'agy-stealth-hud';
      document.body.appendChild(pill);
    }
    if (mode === 'stealth') {
      pill.innerHTML = `<span>🥷 <strong>Stealth Mode</strong> Active (Alt+2)</span>`;
      pill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      pill.style.color = '#10b981';
    } else if (mode === 'explain') {
      pill.innerHTML = `<span>📚 <strong>Explain Mode</strong> Active (Alt+3)</span>`;
      pill.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      pill.style.color = '#38bdf8';
    }
    pill.style.display = 'block';
    clearTimeout(pill._timer);
    pill._timer = setTimeout(() => {
      if (pill) pill.style.display = 'none';
    }, 1300);
  }

  // Keyboard shortcut listeners:
  // Alt + 1 -> Invisible Mode
  // Alt + 2 -> Stealth Mode
  // Alt + 3 -> Explain Mode
  // Alt + S -> Snip Tool
  window.addEventListener('keydown', (e) => {
    if (e.altKey) {
      if (e.key === '1') {
        e.preventDefault();
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.set({ solver_mode: 'invisible' });
        }
        showModeSwitchNotification('invisible');
      } else if (e.key === '2') {
        e.preventDefault();
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.set({ solver_mode: 'stealth' });
        }
        showModeSwitchNotification('stealth');
      } else if (e.key === '3') {
        e.preventDefault();
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.set({ solver_mode: 'explain' });
        }
        showModeSwitchNotification('explain');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        activateSnipMode();
      }
    }
  });
}
