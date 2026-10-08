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

  /* Interactive DOM Double-Click Solver */
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
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('dblclick', async (e) => {
    try {
      const storage = await chrome.storage.local.get(['solver_mode', 'enable_double_click']);
      if (storage.solver_mode !== 'dom_interactive' && storage.enable_double_click !== true) {
        return;
      }

      const card = e.target.closest(
        '.question-card, article[id^="card_"], div[class*="question-card"], div[class*="question"]'
      );
      if (!card) return;

      window.getSelection()?.removeAllRanges();

      if (card.dataset.agySolving === 'true') return;
      card.dataset.agySolving = 'true';

      injectInteractiveStyles();

      card.classList.add('agy-card-solving');
      showCardToast(card, '⚡ Solving with AI...', true);

      const questionData = extractSingleCardData(card);
      if (!questionData || !questionData.question) {
        card.classList.remove('agy-card-solving');
        card.dataset.agySolving = 'false';
        removeCardToast(card);
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'SOLVE_SINGLE_QUESTION',
        questionData
      });

      card.classList.remove('agy-card-solving');

      if (response && response.success && response.result) {
        applySingleAnswer(card, response.result);
        card.classList.add('agy-card-success');
        setTimeout(() => card.classList.remove('agy-card-success'), 2000);

        const ansDisplay = response.result.correctOption 
          ? `${response.result.correctOption}) ${response.result.answerText}`
          : response.result.answerText;
        showCardToast(card, `✓ Solved: ${ansDisplay}`, false);
      } else {
        showCardToast(card, '⚠️ Failed to solve', false);
      }
    } catch (err) {
      console.warn('[Interactive Solver Error]:', err);
    } finally {
      const card = e.target.closest('.question-card, article[id^="card_"]');
      if (card) card.dataset.agySolving = 'false';
    }
  });

  function extractSingleCardData(card) {
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
        '.option-label, label, button[class*="option"]'
      ));

      const singleOption = targetOptions[0];
      let targetLabel = labels.find((l, idx) => {
        const letter = (l.querySelector('.option-letter, [class*="letter"]')?.innerText || '')
          .replace(/[^A-Za-z]/g, '').toUpperCase() || String.fromCharCode(65 + idx);
        return letter === singleOption.toUpperCase();
      });

      if (!targetLabel && result.answerText) {
        const cleanAns = result.answerText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        targetLabel = labels.find(l => {
          const text = (l.querySelector('.option-text')?.innerText || l.innerText || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          return text && (text.includes(cleanAns) || cleanAns.includes(text));
        });
      }

      if (targetLabel) {
        const checkbox = targetLabel.querySelector('.option-checkbox, input[type="checkbox"], input[type="radio"]');
        if (checkbox) {
          card.querySelectorAll('.option-checkbox, input[type="checkbox"]').forEach(cb => {
            if (cb !== checkbox) {
              cb.checked = false;
              cb.closest('.option-label')?.classList.remove('is-selected');
            }
          });

          checkbox.checked = true;
          targetLabel.classList.add('is-selected');
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          targetLabel.classList.add('is-selected');
          targetLabel.click();
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
}
