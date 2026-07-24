// VocTrainer - Test Runner Module
import { state, saveState } from './state.js';
import { getConjugationsForVerb, PRONOUNS } from './conjugation.js';
import { callLLM } from './modals.js';

export function startTestSession(language, category, count, isMistakesOnly = false, customCategory = "none", direction = "forward") {
  let pool = [];
  const base = state.baseLang || "en";
  
  if (isMistakesOnly) {
    pool = state.mistakes
      .map(item => {
        // Resolve fresh translations if it is a standard starter word
        if (item.origEn && window.STARTER_VOCAB_RAW) {
          const starter = window.STARTER_VOCAB_RAW.find(v => v.en === item.origEn);
          if (starter) {
            return {
              en: starter[base] || item.en,
              target: starter[language] || item.target,
              origEn: item.origEn,
              category: item.category
            };
          }
        }
        // Fallback to what was saved
        return {
          en: item[base] || item.en,
          target: item[language] || item.target,
          origEn: item.origEn || item.en,
          category: item.category
        };
      })
      .filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());
  } else if (customCategory !== "none") {
    pool = state.customVocab
      .filter(v => v.category === customCategory)
      .filter(v => v[base] && v[language] && v[base].toLowerCase().trim() !== v[language].toLowerCase().trim())
      .map(item => ({
        en: item[base],
        target: item[language],
        origEn: item.en || item[base],
        category: item.category
      }));
  } else {
    // Standard folder
    const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
    const starters = starterVocabRaw
      .filter(item => item.category === category)
      .map(item => {
        const stableEn = item.en;
        const origEn = item[base] || item.en;
        const origTarget = item[language] || item.target;
        if (state.deletedStarters.includes(stableEn)) return null;
        
        let finalEn = origEn;
        let finalTarget = origTarget;
        if (state.editedStarters[stableEn]) {
          finalEn = state.editedStarters[stableEn].en || origEn;
          finalTarget = state.editedStarters[stableEn].target || origTarget;
        }
        
        return {
          en: finalEn,
          target: finalTarget,
          origEn: stableEn,
          category: item.category
        };
      })
      .filter(Boolean);

    const customs = state.customVocab
      .filter(item => item.category === category && item[base] && item[language] && item[base].toLowerCase().trim() !== item[language].toLowerCase().trim())
      .map(item => ({
        en: item[base],
        target: item[language],
        origEn: item.en || item[base],
        category: item.category
      }));

    pool = [...starters, ...customs];
  }

  // Filter out any entries where base language word equals target language word
  pool = pool.filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());

  if (pool.length === 0) {
    if (window.showCustomAlert) {
      window.showCustomAlert("⚠️ No vocabulary words found for this selection.");
    } else {
      alert("No vocabulary words found for this selection.");
    }
    return;
  }

  // Shuffle pool
  pool.sort(() => 0.5 - Math.random());

  // Limit count
  const sessionCount = Math.min(count, pool.length);
  const sessionWords = pool.slice(0, sessionCount);

  // Determine modes
  const selectedMode = document.getElementById("select-test-mode") ? document.getElementById("select-test-mode").value : "typing";

  state.currentTest = {
    words: sessionWords,
    index: 0,
    wrongAnswers: [],
    isRepeatRound: false,
    correctCount: 0,
    totalOriginalCount: sessionWords.length,
    selectedMode: selectedMode,
    points: 0
  };

  // Reset timer
  if (window.resetQuestionTimer) window.resetQuestionTimer();

  if (window.showView) window.showView("view-test");
  renderQuestion();
}

export function renderQuestion() {
  const test = state.currentTest;
  if (!test || test.index >= test.words.length) {
    finishTestSession();
    return;
  }
  window.questionStartTime = Date.now();
  // Synchronize the test mode toggles UI buttons to match active mode
  const modeToggles = document.querySelectorAll(".mode-toggle-btn");
  if (modeToggles.length > 0) {
    modeToggles.forEach(btn => {
      if (btn.dataset.mode === test.selectedMode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // Show/Hide toggles container based on conjugation mode
  const togglesContainer = document.querySelector(".test-mode-toggles");
  const currentDirection = state.testDirection || "forward";
  if (togglesContainer) {
    if (currentDirection === "conjugation") {
      togglesContainer.style.display = "none";
    } else {
      togglesContainer.style.display = "flex";
    }
  }

  // Ensure correct class is applied to the active section
  const testSections = document.querySelectorAll(".test-mode-section");
  testSections.forEach(sec => {
    if (sec.id === `test-mode-${test.selectedMode}` || (currentDirection === "conjugation" && sec.id === "test-mode-conjugation")) {
      sec.classList.add("active");
    } else {
      sec.classList.remove("active");
    }
  });
  // Update progress bar
  const progressFill = document.getElementById("test-progress-fill");
  if (progressFill) {
    const pct = (test.index / test.totalOriginalCount) * 100;
    progressFill.style.width = `${pct}%`;
  }

  // Update stats display
  const currentQEl = document.getElementById("test-current-q");
  const totalQEl = document.getElementById("test-total-q");
  const correctCountEl = document.getElementById("test-correct-count");
  const wrongCountEl = document.getElementById("test-wrong-count");
  if (currentQEl) currentQEl.textContent = test.index + 1;
  if (totalQEl) totalQEl.textContent = test.totalOriginalCount;
  if (correctCountEl) correctCountEl.textContent = test.correctCount;
  if (wrongCountEl) wrongCountEl.textContent = test.wrongAnswers.length;

  // Clear previous states
  const feedbackContainer = document.getElementById("test-feedback-container");
  if (feedbackContainer) {
    feedbackContainer.style.display = "none";
    feedbackContainer.className = "test-feedback-card";
  }
  const btnSubmit = document.getElementById("btn-submit-answer");
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.style.display = "block";
  }

  const nextBtn = document.getElementById("btn-next-question");
  if (nextBtn) {
    nextBtn.onclick = nextQuestion;
  }

  // Restore defaults for non-compare mode
  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  if (wordCardWrapper) wordCardWrapper.style.display = "block";
  if (catTag) catTag.style.display = "block";

  if (test.selectedMode === "compare") {
    buildCompareMode();
    return;
  }

  if (test.selectedMode === "conjugation") {
    buildConjugationMode();
    return;
  }

  const questionWord = test.words[test.index];
  const questionTextEl = document.getElementById("test-prompt-word");
  const direction = state.testDirection || "forward";

  // Hide all mode containers
  const containers = {
    multiple: document.getElementById("test-mode-multiple"),
    typing: document.getElementById("test-mode-typing"),
    conjugation: document.getElementById("test-mode-conjugation"),
    bubbles: document.getElementById("test-mode-bubbles"),
    compare: document.getElementById("test-mode-compare"),
    speech: document.getElementById("test-mode-speech"),
    sentenceBlocks: document.getElementById("test-mode-sentence-blocks")
  };
  Object.values(containers).forEach(el => { if (el) el.style.display = "none"; });

  if (direction === "sentence_blocks") {
    if (containers.sentenceBlocks) containers.sentenceBlocks.style.display = "block";
    if (btnSubmit) btnSubmit.style.display = "block";
    buildSentenceBlocksMode(questionWord);
    return;
  }

  if (direction === "conjugation") {
    // Conjugation practice mode
    if (containers.conjugation) containers.conjugation.style.display = "block";
    if (btnSubmit) btnSubmit.style.display = "block"; // Show Check Answer button

    const targetLang = state.selectedLang || "de";
    const base = state.baseLang || "en";
    const cleanWord = questionWord.en;

    if (questionTextEl) {
      questionTextEl.innerHTML = `<span style="font-size: 0.8em; color: var(--text-secondary); text-transform: uppercase;">Conjugate in ${getTargetLangName()}:</span><br>${cleanWord}`;
    }

    // Prefill conjugation prompts
    const conjugationPromptEl = document.getElementById("test-conjugation-prompt");
    if (conjugationPromptEl) {
      conjugationPromptEl.textContent = `Type the conjugated form (3rd person singular / "he/she/it"):`;
    }

    const inputField = document.getElementById("test-conjugation-input");
    if (inputField) {
      inputField.value = "";
      inputField.disabled = false;
      inputField.focus();
    }
  } else {
    // Normal vocabulary modes
    const promptText = direction === "forward" ? questionWord.en : questionWord.target;
    if (questionTextEl) questionTextEl.textContent = promptText;

    if (test.selectedMode === "multiple") {
      if (containers.multiple) containers.multiple.style.display = "grid";
      if (btnSubmit) btnSubmit.style.display = "none"; // Options check immediately on click

      generateMultipleChoiceOptions(questionWord);
    } else if (test.selectedMode === "bubbles") {
      if (containers.bubbles) containers.bubbles.style.display = "block";
      if (btnSubmit) btnSubmit.style.display = "block";

      const correctText = direction === "forward" ? questionWord.target : questionWord.en;
      buildBubbleOptions(correctText);
    } else if (test.selectedMode === "speech") {
      if (containers.speech) containers.speech.style.display = "block";
      if (btnSubmit) btnSubmit.style.display = "block";

      const transcriptEl = document.getElementById("speech-transcript");
      if (transcriptEl) transcriptEl.textContent = "...";
      
      const btnMic = document.getElementById("btn-mic");
      if (btnMic) btnMic.className = "btn-mic-icon";
    } else {
      if (containers.typing) {
        containers.typing.style.display = "block";
        const inputField = document.getElementById("input-typing-answer");
        if (inputField) {
          inputField.value = "";
          inputField.disabled = false;
          inputField.focus();
        }
      }
    }
  }

  // Show or hide the custom audio recording button based on availability
  const btnPlayCustom = document.getElementById("btn-play-custom-recording");
  if (btnPlayCustom) {
    if (questionWord.audio) {
      btnPlayCustom.style.display = "inline-flex";
    } else {
      btnPlayCustom.style.display = "none";
    }
  }

  // Speak target word automatically if in reverse direction (target -> base)
  if (direction === "reverse") {
    speakCurrentTestWord();
  }

  // Update difficulty vote UI for the current word
  const wordKey = questionWord.origEn || questionWord.en;
  const wordStat = state.wordStats?.[wordKey] || { difficulty: "medium" };
  updateDifficultyVoteUI(wordStat.difficulty || "medium");

  // Start/Reset question timer
  if (window.startQuestionTimer) window.startQuestionTimer();
}

function getTargetLangName() {
  const names = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };
  return names[state.selectedLang || "de"] || "Target";
}

function generateMultipleChoiceOptions(correctWord) {
  const optionsGrid = document.getElementById("test-options-grid");
  if (!optionsGrid) return;
  optionsGrid.innerHTML = "";

  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  // Gather distractors from all vocab
  const language = state.selectedLang || "it";
  const base = state.baseLang || "en";
  const starterVocabRaw = window.STARTER_VOCAB_RAW || [];

  const starters = starterVocabRaw.map(item => ({
    en: item[base],
    target: item[language]
  }));
  const customs = (state.customVocab || []).map(item => ({
    en: item[base],
    target: item[language]
  }));
  const allPool = [...starters, ...customs].filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());

  const distractors = allPool
    .map(w => (direction === "forward" ? w.target : w.en))
    .filter(t => t && t.toLowerCase().trim() !== correctText.toLowerCase().trim());

  // Unique distractors
  const uniqueDistractors = [...new Set(distractors)];
  uniqueDistractors.sort(() => 0.5 - Math.random());

  const chosenOptions = [correctText];
  for (let i = 0; i < Math.min(3, uniqueDistractors.length); i++) {
    chosenOptions.push(uniqueDistractors[i]);
  }

  // Shuffle options
  chosenOptions.sort(() => 0.5 - Math.random());

  chosenOptions.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-card";
    btn.textContent = opt;
    btn.onclick = () => selectOption(btn, opt);
    optionsGrid.appendChild(btn);
  });
}

export function selectOption(buttonEl, selectedText) {
  const test = state.currentTest;
  if (!test) return;

  // Stop Timer
  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const correctWord = test.words[test.index];
  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  // Disable all option cards
  const optionsGrid = document.getElementById("test-options-grid");
  if (optionsGrid) {
    Array.from(optionsGrid.children).forEach(btn => {
      btn.disabled = true;
    });
  }

  window.lastUserAnswer = selectedText;
  const isCorrect = checkAnswer(selectedText, correctText, correctWord);
  calculateAndSaveDifficulty(isCorrect ? correctText : "", correctText);

  if (isCorrect) {
    buttonEl.classList.add("correct");
    triggerCorrectAnswerUI();
  } else {
    buttonEl.classList.add("incorrect");
    // Find correct button and highlight it
    if (optionsGrid) {
      Array.from(optionsGrid.children).forEach(btn => {
        if (btn.textContent.toLowerCase().trim() === correctText.toLowerCase().trim()) {
          btn.classList.add("correct");
        }
      });
    }
    triggerIncorrectAnswerUI(correctText, selectedText);
  }
}

export function submitTypingAnswer() {
  const test = state.currentTest;
  if (!test) return;

  // Stop Timer
  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const inputField = document.getElementById("input-typing-answer");
  if (!inputField) return;
  const userAnswer = inputField.value.trim();
  inputField.disabled = true;

  const btnSubmit = document.getElementById("btn-submit-answer");
  if (btnSubmit) btnSubmit.disabled = true;

  const correctWord = test.words[test.index];
  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  window.lastUserAnswer = userAnswer;
  const isCorrect = checkAnswer(userAnswer, correctText, correctWord);
  calculateAndSaveDifficulty(userAnswer, correctText);

  if (isCorrect) {
    inputField.classList.add("correct-input");
    triggerCorrectAnswerUI();
  } else {
    inputField.classList.add("incorrect-input");
    triggerIncorrectAnswerUI(correctText, userAnswer);
  }
}

export function submitConjugationAnswer() {
  const test = state.currentTest;
  if (!test) return;

  // Stop Timer
  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const inputField = document.getElementById("test-conjugation-input");
  if (!inputField) return;
  const userAnswer = inputField.value.trim();
  inputField.disabled = true;

  const btnSubmit = document.getElementById("btn-test-submit");
  if (btnSubmit) btnSubmit.disabled = true;

  const questionWord = test.words[test.index];
  const targetLang = state.selectedLang || "de";
  const base = state.baseLang || "en";

  // Look up correct conjugation (3rd person singular / "he/she/it" / "er/sie/es")
  let correctConjugation = "";
  
  // Find in STARTER_VOCAB_RAW details variations if exists
  const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
  const starterMatch = starterVocabRaw.find(w => w[base] === questionWord.en);
  
  if (starterMatch && starterMatch.details && starterMatch.details.variations && starterMatch.details.variations.he && starterMatch.details.variations.he[targetLang]) {
    correctConjugation = starterMatch.details.variations.he[targetLang];
  } else if (questionWord.details && questionWord.details.variations && questionWord.details.variations.he && questionWord.details.variations.he[targetLang]) {
    correctConjugation = questionWord.details.variations.he[targetLang];
  }

  // Fallback to target translation word if no conjugation defined
  if (!correctConjugation) {
    correctConjugation = questionWord.target;
  }

  window.lastUserAnswer = userAnswer;
  const isCorrect = checkAnswer(userAnswer, correctConjugation, questionWord);
  calculateAndSaveDifficulty(userAnswer, correctConjugation);

  if (isCorrect) {
    inputField.classList.add("correct-input");
    triggerCorrectAnswerUI();
  } else {
    inputField.classList.add("incorrect-input");
    triggerIncorrectAnswerUI(correctConjugation, userAnswer);
  }
}

export function submitAnswer() {
  const test = state.currentTest;
  const direction = state.testDirection || "forward";
  if (direction === "sentence_blocks") {
    submitSentenceBlocksAnswer();
  } else if (direction === "conjugation") {
    submitConjugationAnswer();
  } else if (test && test.selectedMode === "bubbles") {
    submitBubblesAnswer();
  } else if (test && test.selectedMode === "speech") {
    submitSpeechTranscriptAnswer();
  } else {
    submitTypingAnswer();
  }
}

function cleanArticlesAndSpaces(text, lang) {
  if (!text) return "";
  let s = text.toLowerCase().trim();
  
  // Strip common articles in German/Italian/Spanish/French
  if (lang === "de") {
    s = s.replace(/^(der|die|das)\s+/i, "");
  } else if (lang === "it") {
    s = s.replace(/^(il|lo|la|i|gli|le|un|uno|una|un')\s+/i, "");
  } else if (lang === "es") {
    s = s.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, "");
  } else if (lang === "fr") {
    s = s.replace(/^(le|la|les|un|une|des|l')\s+/i, "");
  } else if (lang === "en") {
    s = s.replace(/^(the|a|an)\s+/i, "");
  }
  return s.trim();
}

function checkAnswer(userAnswer, correctAnswer, wordObj) {
  if (!userAnswer || !correctAnswer) return false;
  
  const lang = state.testDirection === "forward" ? state.selectedLang : state.baseLang;
  
  const cleanUser = cleanArticlesAndSpaces(userAnswer, lang);
  const cleanCorrect = cleanArticlesAndSpaces(correctAnswer, lang);

  if (cleanUser === cleanCorrect) return true;

  // Check synonym matching if allowed
  if (state.allowSynonyms) {
    const targetWordEn = wordObj.en;
    const cacheEntry = state.dictionaryCache && state.dictionaryCache[targetWordEn];
    const targetLang = state.selectedLang || "de";
    
    if (cacheEntry && cacheEntry.synonyms && cacheEntry.synonyms[targetLang]) {
      const synList = cacheEntry.synonyms[targetLang];
      if (Array.isArray(synList)) {
        for (let syn of synList) {
          if (cleanArticlesAndSpaces(syn, lang) === cleanUser) {
            console.log(`Synonym match found: "${userAnswer}" matches synonym "${syn}" for "${correctAnswer}"`);
            return true;
          }
        }
      }
    }
  }

  // Typo toleration threshold check
  const threshold = state.typoThreshold !== undefined ? state.typoThreshold : 15;
  if (threshold > 0) {
    const editDist = getLevenshteinDistance(cleanUser, cleanCorrect);
    const maxLen = Math.max(cleanUser.length, cleanCorrect.length);
    const distancePercent = maxLen > 0 ? (editDist / maxLen) * 100 : 100;
    if (distancePercent <= threshold) {
      console.log(`Typo match accepted: "${userAnswer}" is within ${Math.round(distancePercent)}% difference of "${correctAnswer}" (Threshold: ${threshold}%)`);
      return true;
    }
  }

  return false;
}

function triggerCorrectAnswerUI() {
  // Play correct sound
  if (window.playFeedbackSound) window.playFeedbackSound("correct");

  // Add points
  state.currentTest.points = (state.currentTest.points || 0) + 10;
  state.currentTest.correctCount++;

  // Update spaced repetition statistics for word
  const test = state.currentTest;
  const wordObj = test.words[test.index];
  updateWordStats(wordObj.en, true);

  // Show correct feedback in the right pane overlay
  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");

  if (overlay) {
    overlay.className = "test-right-pane active correct-ans";
  }
  if (fTitle) {
    fTitle.textContent = "Correct!";
  }
  if (fIcon) {
    fIcon.textContent = "🎉";
  }
  if (fDesc) {
    const lang = state.testDirection === "forward" ? state.selectedLang : state.baseLang;
    const testDir = state.testDirection || "forward";
    if (testDir === "sentence_blocks") {
      const pair = state.currentTest.currentSentencePair || {};
      fDesc.innerHTML = `Great job! Correct sentence:<br><strong style="color: var(--accent-color); font-size: 1.1rem;">${pair.targetSentence || wordObj.target}</strong>`;
    } else {
      const progressHtml = getDistanceProgressBarHtml(window.lastUserAnswer || "", testDir === "forward" ? wordObj.target : wordObj.en, lang);
      fDesc.innerHTML = `Awesome job! "${wordObj.en}" is indeed "${wordObj.target}".${progressHtml}`;
    }
  }

  // Populate word details in the sidebar
  if (window.setupWordDetails) {
    window.setupWordDetails(wordObj);
  }

  // Update difficulty vote buttons UI
  const wordKey = wordObj.origEn || wordObj.en;
  const vStats = state.wordStats[wordKey] || { difficulty: "medium" };
  updateDifficultyVoteUI(vStats.difficulty || "medium");

  // Speak word automatically on success
  speakCurrentTestWord();
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function diffStrings(typed, correct) {
  const cleanTyped = (typed || "").trim();
  const cleanCorrect = (correct || "").trim();
  
  if (!cleanTyped) {
    return `<span style="color: var(--error-color, #ff0054); font-style: italic;">(nothing)</span>`;
  }
  
  const m = cleanTyped.length;
  const n = cleanCorrect.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (cleanTyped[i - 1].toLowerCase() === cleanCorrect[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion (wrong character typed)
          dp[i][j - 1] + 1,    // insertion (missing character in typed)
          dp[i - 1][j - 1] + 1 // substitution (wrong character typed)
        );
      }
    }
  }
  
  let i = m, j = n;
  let html = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cleanTyped[i - 1].toLowerCase() === cleanCorrect[j - 1].toLowerCase()) {
      html.push(escapeHtml(cleanTyped[i - 1]));
      i--;
      j--;
    } else {
      let costDelete = i > 0 ? dp[i - 1][j] : Infinity;
      let costInsert = j > 0 ? dp[i][j - 1] : Infinity;
      let costSub = (i > 0 && j > 0) ? dp[i - 1][j - 1] : Infinity;
      
      let minCost = Math.min(costDelete, costInsert, costSub);
      
      if (minCost === costSub) {
        html.push(`<u style="text-decoration: underline; text-decoration-color: var(--error-color, #ff0054); text-decoration-thickness: 2px; color: var(--error-color, #ff0054); font-weight: 700;">${escapeHtml(cleanTyped[i - 1])}</u>`);
        i--;
        j--;
      } else if (minCost === costDelete) {
        html.push(`<u style="text-decoration: underline; text-decoration-color: var(--error-color, #ff0054); text-decoration-thickness: 2px; color: var(--error-color, #ff0054); font-weight: 700;">${escapeHtml(cleanTyped[i - 1])}</u>`);
        i--;
      } else {
        html.push(`<u style="text-decoration: underline; text-decoration-color: var(--error-color, #ff0054); text-decoration-thickness: 2px; opacity: 0.6; color: var(--error-color, #ff0054); font-style: italic;">${escapeHtml(cleanCorrect[j - 1])}</u>`);
        j--;
      }
    }
  }
  
  return html.reverse().join("");
}

function triggerIncorrectAnswerUI(correctText, studentAnswer = "") {
  // Play incorrect sound
  if (window.playFeedbackSound) window.playFeedbackSound("incorrect");

  const test = state.currentTest;
  const wordObj = test.words[test.index];

  // Update spaced repetition statistics for word
  updateWordStats(wordObj.en, false);

  // Add to wrongAnswers list
  test.wrongAnswers.push(wordObj);

  // Show incorrect feedback in the right pane overlay
  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");

  if (overlay) {
    overlay.className = "test-right-pane active incorrect-ans";
  }
  if (fTitle) {
    fTitle.textContent = "Incorrect";
  }
  if (fIcon) {
    fIcon.textContent = "😢";
  }
  if (fDesc) {
    const testDir = state.testDirection || "forward";
    if (testDir === "sentence_blocks") {
      const pair = state.currentTest.currentSentencePair || {};
      fDesc.innerHTML = `You assembled:<br><strong style="color: #fff; font-size: 1rem;">${escapeHtml(studentAnswer || "(nothing)")}</strong><br><br>Correct sentence:<br><strong style="color: var(--accent-color); font-size: 1.05rem;">${escapeHtml(pair.targetSentence || correctText)}</strong>`;
    } else {
      const highlighted = diffStrings(studentAnswer, correctText);
      const lang = state.testDirection === "forward" ? state.selectedLang : state.baseLang;
      const progressHtml = getDistanceProgressBarHtml(studentAnswer, correctText, lang);
      fDesc.innerHTML = `You typed: <strong style="color: #fff; font-size: 1.15rem; letter-spacing: 0.5px;">${highlighted}</strong>${progressHtml}`;
    }
  }

  // Populate word details in the sidebar
  if (window.setupWordDetails) {
    window.setupWordDetails(wordObj);
  }

  // Update difficulty vote buttons UI
  const wordKey = wordObj.origEn || wordObj.en;
  const vStats = state.wordStats[wordKey] || { difficulty: "medium" };
  updateDifficultyVoteUI(vStats.difficulty || "medium");

  // Speak word automatically on failure
  speakCurrentTestWord();
}

function updateWordStats(wordEn, isCorrect) {
  if (!state.wordStats) state.wordStats = {};
  if (!state.wordStats[wordEn]) {
    state.wordStats[wordEn] = { attempts: 0, errors: 0, box: 1, lastReview: Date.now() };
  }

  const stats = state.wordStats[wordEn];
  stats.attempts++;
  stats.lastReview = Date.now();

  if (isCorrect) {
    // Level up in Leitner box system
    if (stats.box < 5) stats.box++;
  } else {
    stats.errors++;
    // Drop back to Box 1 on error
    stats.box = 1;

  }
  saveState();
}

export function nextQuestion() {
  const test = state.currentTest;
  if (!test) return;

  const overlay = document.getElementById("feedback-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }

  test.index++;
  renderQuestion();
}

export function finishTestSession() {
  // Stop Timer
  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const test = state.currentTest;
  if (!test) return;

  // Add test session to history
  const pointsEarned = test.points || 0;
  const accuracy = test.totalOriginalCount > 0 ? Math.round((test.correctCount / test.totalOriginalCount) * 100) : 100;

  if (pointsEarned > 0) {
    state.xp += pointsEarned;
    // Check level up (every 100 XP is a level)
    const newLevel = Math.floor(state.xp / 100) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      if (window.playFeedbackSound) window.playFeedbackSound("levelup");
    }
    // Update Streak (simulate 1 day active)
    state.streak++;
    saveState();
  }

  // Save session details in history
  state.history.push({
    date: Date.now(),
    points: pointsEarned,
    accuracy: accuracy,
    mistakesCount: test.wrongAnswers.length,
    direction: state.testDirection || "forward",
    language: state.selectedLang || "de"
  });
  saveState();

  // Populate report statistics view
  const reportPoints = document.getElementById("report-points");
  const reportAccuracy = document.getElementById("report-accuracy");
  const reportWrongCount = document.getElementById("report-wrong-count");
  if (reportPoints) reportPoints.textContent = pointsEarned;
  if (reportAccuracy) reportAccuracy.textContent = `${accuracy}%`;
  if (reportWrongCount) reportWrongCount.textContent = test.wrongAnswers.length;

  const repeatNotice = document.getElementById("repeat-notice");
  if (repeatNotice) {
    if (test.wrongAnswers.length > 0) {
      repeatNotice.style.display = "block";
    } else {
      repeatNotice.style.display = "none";
    }
  }

  if (window.showView) window.showView("view-report");
}

export function quitTestSession() {
  // Stop Timer
  if (window.stopQuestionTimer) window.stopQuestionTimer();

  if (window.showCustomConfirm) {
    window.showCustomConfirm("⚠️ Are you sure you want to quit this practice session? Your progress so far will not be saved.", (quit) => {
      if (quit) {
        if (window.showView) window.showView("view-dashboard");
      }
    });
  } else {
    if (confirm("Are you sure you want to quit this practice session?")) {
      if (window.showView) window.showView("view-dashboard");
    }
  }
}

export function speakCurrentTestWord(rate = 1.0) {
  const test = state.currentTest;
  if (!test) return;
  const wordObj = test.words[test.index];
  if (!wordObj) return;

  const direction = state.testDirection || "forward";

  // In Forward mode (Base -> Target), we read the target word.
  // In Reverse mode (Target -> Base), we read the target word (which was the question).
  // In Conjugate mode, we read the target conjugation.
  if (direction === "conjugation") {
    const targetLang = state.selectedLang || "de";
    const base = state.baseLang || "en";
    let correctConjugation = "";
    
    const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
    const starterMatch = starterVocabRaw.find(w => w[base] === wordObj.en);
    if (starterMatch && starterMatch.details && starterMatch.details.variations && starterMatch.details.variations.he && starterMatch.details.variations.he[targetLang]) {
      correctConjugation = starterMatch.details.variations.he[targetLang];
    } else if (wordObj.details && wordObj.details.variations && wordObj.details.variations.he && wordObj.details.variations.he[targetLang]) {
      correctConjugation = wordObj.details.variations.he[targetLang];
    } else {
      correctConjugation = wordObj.target;
    }
    if (window.speakWord) window.speakWord(correctConjugation, targetLang, rate);
  } else {
    const text = wordObj.target;
    const targetLang = state.selectedLang || "de";
    if (window.speakWord) window.speakWord(text, targetLang, rate);
  }
}

export function repeatMistakes() {
  const test = state.currentTest;
  if (!test || test.wrongAnswers.length === 0) return;

  const wrongWords = [...test.wrongAnswers];
  wrongWords.sort(() => 0.5 - Math.random());

  state.currentTest = {
    words: wrongWords,
    index: 0,
    wrongAnswers: [],
    isRepeatRound: true,
    correctCount: 0,
    totalOriginalCount: wrongWords.length,
    selectedMode: "typing",
    points: 0
  };

  if (window.showView) window.showView("view-test");
  renderQuestion();
}

export function getLevenshteinDistance(s1, s2) {
  const clean1 = (s1 || "").trim().toLowerCase();
  const clean2 = (s2 || "").trim().toLowerCase();
  if (clean1 === clean2) return 0;
  const m = clean1.length;
  const n = clean2.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (clean1[i - 1] === clean2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }
  return dp[m][n];
}

export function getDistanceProgressBarHtml(userAnswer, correctAnswer, lang) {
  if (!userAnswer || !correctAnswer) return "";
  const cleanUser = cleanArticlesAndSpaces ? cleanArticlesAndSpaces(userAnswer, lang) : userAnswer.trim();
  const cleanCorrect = cleanArticlesAndSpaces ? cleanArticlesAndSpaces(correctAnswer, lang) : correctAnswer.trim();
  
  const editDist = getLevenshteinDistance(cleanUser, cleanCorrect);
  const maxLen = Math.max(cleanUser.length, cleanCorrect.length);
  const distancePercent = Math.round(maxLen > 0 ? (editDist / maxLen) * 100 : 100);
  const similarity = 100 - distancePercent;

  let barColor = "#2ecc71"; // Green (0-15% distance)
  if (distancePercent > 50) {
    barColor = "#ff4b4b"; // Red
  } else if (distancePercent > 15) {
    barColor = "#ff9f43"; // Orange/Yellow
  }

  return `
    <div style="margin-top: 12px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); font-size: 0.8rem; text-align: left;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: 600;">
        <span style="color: var(--text-secondary);">Spelling Accuracy:</span>
        <span style="color: ${barColor};">${similarity}%</span>
      </div>
      <div style="height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden;">
        <div style="width: ${similarity}%; height: 100%; background: ${barColor}; transition: width 0.3s ease;"></div>
      </div>
    </div>
  `;
}

export function calculateAndSaveDifficulty(userAnswer, correctText, isSpoken = false) {
  const test = state.currentTest;
  if (!test) return;
  const currentWord = test.words[test.index];
  if (!currentWord) return;

  const elapsedTime = (Date.now() - (window.questionStartTime || Date.now())) / 1000;
  const timeRatio = Math.min(elapsedTime, 30) / 30;
  const timeScore = timeRatio * 100;

  let errorScore = 0;
  if (userAnswer && correctText) {
    const editDist = getLevenshteinDistance(userAnswer, correctText);
    const maxLen = Math.max(userAnswer.length, correctText.length);
    const errorRate = maxLen > 0 ? (editDist / maxLen) : 0;
    errorScore = errorRate * 100;
  } else {
    errorScore = 100;
  }

  // Combine scores: 70% error, 30% time
  let finalScore = Math.round(0.7 * errorScore + 0.3 * timeScore);
  
  if (elapsedTime > 10) {
    const extraSeconds = Math.max(0, elapsedTime - 10);
    const penalty = extraSeconds * 3;
    finalScore += penalty;
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  const wordKey = currentWord.origEn || currentWord.en;
  if (!state.wordStats) state.wordStats = {};
  if (!state.wordStats[wordKey]) {
    state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
  }
  
  state.wordStats[wordKey].difficulty = finalScore;
  saveState();
}

export function adjustDifficulty(delta) {
  const test = state.currentTest;
  if (!test) return;
  const currentWord = test.words[test.index];
  if (!currentWord) return;
  
  const wordKey = currentWord.origEn || currentWord.en;
  if (!state.wordStats) state.wordStats = {};
  if (!state.wordStats[wordKey]) {
    state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
  }
  
  let currentScore = state.wordStats[wordKey].difficulty;
  if (currentScore === undefined || typeof currentScore === "string") {
    if (currentScore === "easy") currentScore = 20;
    else if (currentScore === "medium") currentScore = 50;
    else if (currentScore === "hard") currentScore = 80;
    else currentScore = 50;
  }
  
  let newScore = currentScore + delta;
  newScore = Math.max(0, Math.min(100, newScore));
  
  state.wordStats[wordKey].difficulty = newScore;
  saveState();
  updateDifficultyVoteUI(newScore);
}

window.adjustDifficulty = adjustDifficulty;

export function updateDifficultyVoteUI(levelOrScore) {
  let score = 50;
  if (typeof levelOrScore === "number") {
    score = levelOrScore;
  } else if (typeof levelOrScore === "string") {
    if (levelOrScore === "easy") score = 20;
    else if (levelOrScore === "medium") score = 50;
    else if (levelOrScore === "hard") score = 80;
  } else {
    const test = state.currentTest;
    if (test) {
      const currentWord = test.words[test.index];
      if (currentWord) {
        const wordKey = currentWord.origEn || currentWord.en;
        const stats = state.wordStats?.[wordKey];
        if (stats && stats.difficulty !== undefined) {
          score = stats.difficulty;
        }
      }
    }
  }

  if (typeof score === "string") {
    if (score === "easy") score = 20;
    else if (score === "medium") score = 50;
    else if (score === "hard") score = 80;
    else score = 50;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const labelEl = document.getElementById("difficulty-percent-label");
  if (labelEl) labelEl.textContent = `${score}%`;

  const fillEl = document.getElementById("difficulty-progress-fill");
  if (fillEl) fillEl.style.width = `${score}%`;
}

export function submitSpeechAnswer(userAnswer) {
  if (window.stopListeningPronunciation) window.stopListeningPronunciation();
  const btnMic = document.getElementById("btn-mic");
  if (btnMic) btnMic.classList.remove("listening");

  const test = state.currentTest;
  if (!test) return;

  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const correctWord = test.words[test.index];
  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  window.lastUserAnswer = userAnswer;
  const isCorrect = checkAnswer(userAnswer, correctText, correctWord);
  calculateAndSaveDifficulty(userAnswer, correctText, true);

  if (isCorrect) {
    triggerCorrectAnswerUI();
  } else {
    triggerIncorrectAnswerUI(correctText, userAnswer);
  }
}

function isAnswerCovered(spoken, correct, wordObj) {
  if (!spoken || !correct) return false;
  
  const lang = state.testDirection === "forward" ? state.selectedLang : state.baseLang;
  const cleanSpoken = cleanArticlesAndSpaces(spoken, lang);
  const cleanCorrect = cleanArticlesAndSpaces(correct, lang);
  
  if (!cleanSpoken || !cleanCorrect) return false;
  
  // 1. Direct or synonym match
  if (checkAnswer(spoken, correct, wordObj)) return true;
  
  // 2. Substring check after removing punctuation and lowercasing
  const puncRegex = /[.,\/#!$%\^&\*;:{}=\-_`~()?¿¡]/g;
  const sSpoken = cleanSpoken.replace(puncRegex, "").replace(/\s+/g, " ").trim();
  const sCorrect = cleanCorrect.replace(puncRegex, "").replace(/\s+/g, " ").trim();
  
  if (sSpoken.includes(sCorrect)) {
    const spokenWords = sSpoken.split(/\s+/);
    const correctWords = sCorrect.split(/\s+/);
    
    for (let i = 0; i <= spokenWords.length - correctWords.length; i++) {
      let match = true;
      for (let j = 0; j < correctWords.length; j++) {
        if (spokenWords[i + j] !== correctWords[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }
  
  // 3. Synonym substring check (always allowed for voice alternative meanings)
  if (wordObj) {
    const targetWordEn = wordObj.en;
    const cacheEntry = state.dictionaryCache && state.dictionaryCache[targetWordEn];
    const targetLang = state.selectedLang || "de";
    if (cacheEntry && cacheEntry.synonyms && cacheEntry.synonyms[targetLang]) {
      const synList = cacheEntry.synonyms[targetLang];
      if (Array.isArray(synList)) {
        for (let syn of synList) {
          if (checkAnswer(spoken, syn, wordObj)) return true;

          const cleanSyn = cleanArticlesAndSpaces(syn, lang);
          const sSyn = cleanSyn.replace(puncRegex, "").replace(/\s+/g, " ").trim();
          if (sSpoken.includes(sSyn)) {
            const spokenWords = sSpoken.split(/\s+/);
            const synWords = sSyn.split(/\s+/);
            for (let i = 0; i <= spokenWords.length - synWords.length; i++) {
              let match = true;
              for (let j = 0; j < synWords.length; j++) {
                if (spokenWords[i + j] !== synWords[j]) {
                  match = false;
                  break;
                }
              }
              if (match) return true;
            }
          }
        }
      }
    }
  }
  
  return false;
}

export function toggleListening() {
  const btnMic = document.getElementById("btn-mic");
  if (!btnMic) return;

  if (btnMic.classList.contains("listening")) {
    if (window.stopListeningPronunciation) window.stopListeningPronunciation();
    btnMic.classList.remove("listening");

    // Submit whatever was spoken so far on manual toggle-stop
    const transcriptEl = document.getElementById("speech-transcript");
    const spokenText = transcriptEl ? transcriptEl.textContent.trim() : "";
    if (spokenText && spokenText !== "Listening..." && spokenText !== "[Error: Try again]") {
      submitSpeechAnswer(spokenText);
    }
  } else {
    const test = state.currentTest;
    if (!test) return;
    const currentWord = test.words[test.index];
    const direction = state.testDirection || "forward";
    const answerLang = direction === "forward" ? (state.selectedLang || "de") : (state.baseLang || "en");
    
    let hasSubmitted = false;

    if (window.initSpeechRecognition) {
      const initialized = window.initSpeechRecognition(
        answerLang,
        () => {
          btnMic.classList.add("listening");
          const transcript = document.getElementById("speech-transcript");
          if (transcript) transcript.textContent = "Listening...";
        },
        (result, isFinal) => {
          const transcript = document.getElementById("speech-transcript");
          if (transcript) transcript.textContent = result;
          
          const testObj = state.currentTest;
          if (testObj && !hasSubmitted) {
            const correctWord = testObj.words[testObj.index];
            const correctText = direction === "forward" ? correctWord.target : correctWord.en;
            if (isAnswerCovered(result, correctText, correctWord)) {
              hasSubmitted = true;
              submitSpeechAnswer(result);
              return;
            }
          }
          // Do not auto-submit on isFinal when incorrect/incomplete to allow continuous speaking/attempts
        },
        (error) => {
          btnMic.classList.remove("listening");
          const transcript = document.getElementById("speech-transcript");
          if (transcript) transcript.textContent = "[Error: Try again]";
        },
        () => {
          btnMic.classList.remove("listening");
        }
      );

      if (initialized && window.startListeningPronunciation) {
        window.startListeningPronunciation();
      } else {
        alert("Speech recognition is not supported or failed to initialize on this browser.");
      }
    } else {
      alert("Speech recognition module is not loaded.");
    }
  }
}

function buildBubbleOptions(targetPhrase) {
  const selectedZone = document.getElementById("bubble-selected-zone");
  const optionsZone = document.getElementById("bubble-options-zone");
  if (!selectedZone || !optionsZone) return;
  optionsZone.innerHTML = "";
  selectedZone.innerHTML = "";

  let pieces = targetPhrase.split(/\s+/);
  
  if (pieces.length === 1) {
    const word = pieces[0];
    const len = word.length;
    
    if (len >= 3) {
      // Split word into 3 parts
      const p1 = Math.floor(len / 3);
      const p2 = Math.floor(2 * len / 3);
      pieces = [
        word.substring(0, p1),
        word.substring(p1, p2),
        word.substring(p2)
      ];
    } else {
      // Very short word (1-2 chars): split into letters and add distractor parts
      pieces = word.split("");
      const distractors = ["en", "er", "te", "la", "de", "un", "es", "on"];
      while (pieces.length < 3) {
        const rand = distractors[Math.floor(Math.random() * distractors.length)];
        if (!pieces.includes(rand)) {
          pieces.push(rand);
        }
      }
    }
  } else {
    // Phrases: use one block per word. Add distractor words if less than 3 words.
    if (pieces.length < 3) {
      const distractors = ["the", "and", "with", "house", "time", "day", "please", "today", "tomorrow"];
      const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
      const vocabWords = starterVocabRaw.map(v => v.en).filter(Boolean);
      const sourcePool = vocabWords.length > 0 ? vocabWords : distractors;
      
      while (pieces.length < 3) {
        const randWord = sourcePool[Math.floor(Math.random() * sourcePool.length)].toLowerCase();
        if (!pieces.map(p => p.toLowerCase()).includes(randWord)) {
          pieces.push(randWord);
        }
      }
    }
  }

  const shuffled = [...pieces].sort(() => 0.5 - Math.random());

  // Enable desktop drag-over reordering on the selected zone container
  selectedZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingEl = selectedZone.querySelector(".dragging");
    if (!draggingEl) return;
    const siblings = Array.from(selectedZone.querySelectorAll(".word-bubble:not(.dragging)"));
    const nextSibling = siblings.find(sibling => {
      const box = sibling.getBoundingClientRect();
      return e.clientX < box.left + box.width / 2;
    });
    selectedZone.insertBefore(draggingEl, nextSibling);
  });

  shuffled.forEach((piece, index) => {
    const bubble = document.createElement("button");
    bubble.className = "word-bubble";
    bubble.textContent = piece;
    bubble.dataset.idx = index;
    
    bubble.onclick = () => {
      if (window.playFeedbackSound) window.playFeedbackSound("click");
      // Keep option button in the DOM layout, make invisible
      bubble.style.visibility = "hidden";
      bubble.style.pointerEvents = "none";

      // Create matching select block
      const selBubble = document.createElement("button");
      selBubble.className = "word-bubble";
      selBubble.textContent = piece;
      
      // Make it reorderable
      selBubble.draggable = true;
      selBubble.style.cursor = "move";

      // HTML5 Drag and Drop events (Desktop)
      selBubble.addEventListener("dragstart", (e) => {
        selBubble.classList.add("dragging");
      });
      selBubble.addEventListener("dragend", () => {
        selBubble.classList.remove("dragging");
      });

      // Touch Events (Mobile - iOS/iPad)
      let touchActiveElement = null;
      selBubble.addEventListener("touchstart", (e) => {
        touchActiveElement = selBubble;
        selBubble.classList.add("dragging");
      });
      selBubble.addEventListener("touchmove", (e) => {
        if (!touchActiveElement) return;
        const touch = e.touches[0];
        const siblings = Array.from(selectedZone.querySelectorAll(".word-bubble:not(.dragging)"));
        const nextSibling = siblings.find(sibling => {
          const box = sibling.getBoundingClientRect();
          return touch.clientX < box.left + box.width / 2;
        });
        selectedZone.insertBefore(touchActiveElement, nextSibling);
      });
      selBubble.addEventListener("touchend", () => {
        if (touchActiveElement) {
          touchActiveElement.classList.remove("dragging");
          touchActiveElement = null;
        }
      });

      // Clicking returns the bubble to options
      selBubble.onclick = () => {
        if (window.playFeedbackSound) window.playFeedbackSound("click");
        // Restore option button visibility
        bubble.style.visibility = "visible";
        bubble.style.pointerEvents = "auto";
        selBubble.remove();
      };
      
      selectedZone.appendChild(selBubble);
    };
    optionsZone.appendChild(bubble);
  });
}

export function submitBubblesAnswer() {
  const test = state.currentTest;
  if (!test) return;

  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const selectedZone = document.getElementById("bubble-selected-zone");
  if (!selectedZone) return;
  
  const selectedBubbles = selectedZone.querySelectorAll(".word-bubble");
  const arr = Array.from(selectedBubbles).map(b => b.textContent);
  
  const correctWord = test.words[test.index];
  const targetText = correctWord.target;
  // If target has multiple words, join with space, else join with nothing (empty string)
  const userAnswer = targetText.split(/\s+/).length === 1 ? arr.join("") : arr.join(" ");

  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  window.lastUserAnswer = userAnswer;
  const isCorrect = checkAnswer(userAnswer, correctText, correctWord);
  calculateAndSaveDifficulty(userAnswer, correctText);

  if (isCorrect) {
    triggerCorrectAnswerUI();
  } else {
    triggerIncorrectAnswerUI(correctText, userAnswer);
  }
}

export function submitSpeechTranscriptAnswer() {
  const test = state.currentTest;
  if (!test) return;

  const transcriptEl = document.getElementById("speech-transcript");
  const userAnswer = transcriptEl ? transcriptEl.textContent.trim() : "";
  submitSpeechAnswer(userAnswer);
}

// -------------------------------------------------------------
// Sentence Blocks Generator & Interactive Handler
// -------------------------------------------------------------

async function generateSentencePairForWord(wordObj) {
  const baseLang = state.baseLang || "en";
  const targetLang = state.selectedLang || "de";
  const targetWord = wordObj.target;
  const baseWord = wordObj.en;

  // 1. Check if wordObj details already contains a high quality example sentence
  if (wordObj.details && wordObj.details.sentences && wordObj.details.sentences[targetLang] && wordObj.details.sentences[baseLang]) {
    return {
      targetSentence: wordObj.details.sentences[targetLang],
      baseSentence: wordObj.details.sentences[baseLang]
    };
  }

  // 2. If LLM generation is enabled by user and key is available, use LLM
  if (state.useLLMForSentences && (state.geminiKey || state.openaiKey || state.grokKey)) {
    try {
      const prompt = `Create one natural, simple 4-7 word example sentence in ${targetLang} containing the vocabulary word "${targetWord}". Provide its translation in ${baseLang}. Return ONLY valid JSON in format: {"targetSentence": "...", "baseSentence": "..."}`;
      const raw = await callLLM(prompt, "You are a helpful language tutor. Output valid raw JSON only.");
      const cleanJson = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.targetSentence && parsed.baseSentence) {
        return parsed;
      }
    } catch (e) {
      console.warn("LLM sentence generation failed, using translation engine:", e);
    }
  }

  // 3. Fallback: Generate simple natural sentences tailored to word type or use Google Translate
  let baseSentence = `I learn the word ${baseWord}.`;
  let targetSentence = `Ich lerne das Wort ${targetWord}.`;

  if (targetLang === "de") {
    targetSentence = `Ich verwende das Wort ${targetWord} jeden Tag.`;
    baseSentence = `I use the word ${baseWord} every day.`;
  } else if (targetLang === "it") {
    targetSentence = `Uso la parola ${targetWord} ogni giorno.`;
    baseSentence = `I use the word ${baseWord} every day.`;
  } else if (targetLang === "es") {
    targetSentence = `Uso la palabra ${targetWord} todos los días.`;
    baseSentence = `I use the word ${baseWord} every day.`;
  } else if (targetLang === "fr") {
    targetSentence = `J'utilise le mot ${targetWord} tous les jours.`;
    baseSentence = `I use the word ${baseWord} every day.`;
  } else if (targetLang === "en") {
    targetSentence = `I use the word ${targetWord} every day.`;
    baseSentence = `Ich verwende das Wort ${baseWord} jeden Tag.`;
  }

  if (window.translateTextGTX) {
    try {
      const translatedTarget = await window.translateTextGTX(`I practice the word ${baseWord} in a sentence.`, baseLang, targetLang);
      const translatedBase = await window.translateTextGTX(translatedTarget, targetLang, baseLang);
      if (translatedTarget && translatedTarget.includes(targetWord)) {
        targetSentence = translatedTarget;
        baseSentence = translatedBase;
      }
    } catch (e) {}
  }

  return { targetSentence, baseSentence };
}

export async function buildSentenceBlocksMode(wordObj) {
  const promptTextEl = document.getElementById("test-prompt-word");
  const selectedZone = document.getElementById("sentence-blocks-selected-zone");
  const optionsZone = document.getElementById("sentence-blocks-options-zone");

  if (!selectedZone || !optionsZone) return;

  selectedZone.innerHTML = "";
  optionsZone.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-secondary);">⏳ Generating sentence...</div>`;

  if (promptTextEl) {
    promptTextEl.innerHTML = `<span style="font-size: 0.8em; color: var(--text-secondary); text-transform: uppercase;">Assemble Sentence for:</span><br>${wordObj.target} (${wordObj.en})`;
  }

  const { targetSentence, baseSentence } = await generateSentencePairForWord(wordObj);
  state.currentTest.currentSentencePair = { targetSentence, baseSentence };

  if (promptTextEl) {
    promptTextEl.innerHTML = `<span style="font-size: 0.75em; color: var(--text-secondary); display: block; margin-bottom: 4px;">Translate to ${getTargetLangName()}:</span><span style="font-size: 1.1em; font-weight: bold; color: var(--accent-color);">${baseSentence}</span>`;
  }

  optionsZone.innerHTML = "";

  // Split target sentence into 1-word blocks (keeping punctuation separated or attached)
  const tokens = targetSentence.trim().split(/\s+/);
  
  // Mix in 2 extra distractor words from current test word list
  const distractors = [];
  const testWords = state.currentTest.words || [];
  testWords.forEach(w => {
    if (w.target && w.target !== wordObj.target && !tokens.includes(w.target) && distractors.length < 2) {
      distractors.push(w.target);
    }
  });

  const allBlocks = [...tokens, ...distractors];
  const shuffledBlocks = allBlocks.sort(() => 0.5 - Math.random());

  // Enable dragover reordering in selected zone
  selectedZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingEl = selectedZone.querySelector(".dragging");
    if (!draggingEl) return;
    const siblings = Array.from(selectedZone.querySelectorAll(".word-bubble:not(.dragging)"));
    const nextSibling = siblings.find(sibling => {
      const box = sibling.getBoundingClientRect();
      return e.clientX < box.left + box.width / 2;
    });
    selectedZone.insertBefore(draggingEl, nextSibling);
  });

  shuffledBlocks.forEach((token, index) => {
    const bubble = document.createElement("button");
    bubble.className = "word-bubble";
    bubble.textContent = token;
    bubble.dataset.idx = index;

    bubble.onclick = () => {
      if (window.playFeedbackSound) window.playFeedbackSound("click");
      bubble.style.visibility = "hidden";
      bubble.style.pointerEvents = "none";

      const selBubble = document.createElement("button");
      selBubble.className = "word-bubble";
      selBubble.textContent = token;
      selBubble.draggable = true;
      selBubble.style.cursor = "move";

      selBubble.addEventListener("dragstart", () => selBubble.classList.add("dragging"));
      selBubble.addEventListener("dragend", () => selBubble.classList.remove("dragging"));

      let touchActiveElement = null;
      selBubble.addEventListener("touchstart", (e) => {
        touchActiveElement = selBubble;
        selBubble.classList.add("dragging");
      });
      selBubble.addEventListener("touchmove", (e) => {
        if (!touchActiveElement) return;
        const touch = e.touches[0];
        const siblings = Array.from(selectedZone.querySelectorAll(".word-bubble:not(.dragging)"));
        const nextSibling = siblings.find(sibling => {
          const box = sibling.getBoundingClientRect();
          return touch.clientX < box.left + box.width / 2;
        });
        selectedZone.insertBefore(touchActiveElement, nextSibling);
      });
      selBubble.addEventListener("touchend", () => {
        if (touchActiveElement) {
          touchActiveElement.classList.remove("dragging");
          touchActiveElement = null;
        }
      });

      selBubble.onclick = () => {
        if (window.playFeedbackSound) window.playFeedbackSound("click");
        bubble.style.visibility = "visible";
        bubble.style.pointerEvents = "auto";
        selBubble.remove();
      };

      selectedZone.appendChild(selBubble);
    };

    optionsZone.appendChild(bubble);
  });
}

export function submitSentenceBlocksAnswer() {
  const test = state.currentTest;
  if (!test) return;

  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const selectedZone = document.getElementById("sentence-blocks-selected-zone");
  if (!selectedZone) return;

  const selectedBubbles = selectedZone.querySelectorAll(".word-bubble");
  const userAnswer = Array.from(selectedBubbles).map(b => b.textContent.trim()).join(" ");

  const pair = test.currentSentencePair || {};
  const correctText = pair.targetSentence || "";
  const questionWord = test.words[test.index];

  window.lastUserAnswer = userAnswer;

  // Clean strings for accurate sentence order matching (ignore casing and minor trailing punctuation differences)
  const normUser = userAnswer.toLowerCase().replace(/[.,!?]/g, "").trim();
  const normCorrect = correctText.toLowerCase().replace(/[.,!?]/g, "").trim();

  const isCorrect = normUser === normCorrect;
  calculateAndSaveDifficulty(userAnswer, correctText);

  if (isCorrect) {
    triggerCorrectAnswerUI();
  } else {
    triggerIncorrectAnswerUI(correctText, userAnswer);
  }
}

export function buildCompareMode() {
  const test = state.currentTest;
  if (!test) return;
  
  // Hide prompt card and category tag
  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  if (wordCardWrapper) wordCardWrapper.style.display = "none";
  if (catTag) catTag.style.display = "none";
  
  // Hide check answer button since game is interactive
  const btnSubmit = document.getElementById("btn-submit-answer");
  if (btnSubmit) btnSubmit.style.display = "none";

  const containers = {
    multiple: document.getElementById("test-mode-multiple"),
    typing: document.getElementById("test-mode-typing"),
    conjugation: document.getElementById("test-mode-conjugation"),
    bubbles: document.getElementById("test-mode-bubbles"),
    compare: document.getElementById("test-mode-compare"),
    speech: document.getElementById("test-mode-speech")
  };
  Object.values(containers).forEach(el => { if (el) el.style.display = "none"; });
  if (containers.compare) containers.compare.style.display = "block";

  // Pick up to 5 words starting from current index
  const batch = test.words.slice(test.index, test.index + 5);
  if (batch.length === 0) {
    finishTestSession();
    return;
  }

  // Update progress text
  const progressText = document.getElementById("test-progress-text");
  if (progressText) {
    progressText.textContent = `Matching Batch (${test.index + 1} - ${test.index + batch.length}/${test.words.length})`;
  }
  const progressFill = document.getElementById("test-progress-fill");
  if (progressFill) {
    const pct = (test.index / test.words.length) * 100;
    progressFill.style.width = `${pct}%`;
  }

  const leftCol = document.getElementById("compare-col-left");
  const rightCol = document.getElementById("compare-col-right");
  if (!leftCol || !rightCol) return;

  leftCol.innerHTML = "";
  rightCol.innerHTML = "";

  window.compareLeftSelected = null;
  window.compareRightSelected = null;
  window.compareMatchedCount = 0;

  // Clear timer interval
  if (window.stopQuestionTimer) window.stopQuestionTimer();
  const timerBadge = document.getElementById("test-countdown-badge");
  if (timerBadge) timerBadge.style.display = "none";

  // Shuffle left words and right translations independently
  const leftWords = [...batch].sort(() => 0.5 - Math.random());
  const rightWords = [...batch].sort(() => 0.5 - Math.random());

  leftWords.forEach(word => {
    const btn = document.createElement("button");
    btn.className = "compare-card-btn";
    btn.textContent = word.en;
    btn.dataset.wordId = word.origEn || word.en;
    btn.onclick = () => selectCompareWord("left", btn, word);
    leftCol.appendChild(btn);
  });

  rightWords.forEach(word => {
    const btn = document.createElement("button");
    btn.className = "compare-card-btn";
    btn.textContent = word.target;
    btn.dataset.wordId = word.origEn || word.en;
    btn.onclick = () => selectCompareWord("right", btn, word);
    rightCol.appendChild(btn);
  });
}

function selectCompareWord(side, btn, word) {
  if (btn.classList.contains("matched")) return;
  
  if (window.playFeedbackSound) window.playFeedbackSound("click");

  if (side === "left") {
    const prev = document.querySelector("#compare-col-left .compare-card-btn.selected");
    if (prev) prev.classList.remove("selected");
    
    btn.classList.add("selected");
    window.compareLeftSelected = { btn, word };
  } else {
    const prev = document.querySelector("#compare-col-right .compare-card-btn.selected");
    if (prev) prev.classList.remove("selected");
    
    btn.classList.add("selected");
    window.compareRightSelected = { btn, word };
  }

  if (window.compareLeftSelected && window.compareRightSelected) {
    const left = window.compareLeftSelected;
    const right = window.compareRightSelected;
    
    const leftId = left.word.origEn || left.word.en;
    const rightId = right.word.origEn || right.word.en;
    
    if (leftId === rightId) {
      if (window.playFeedbackSound) window.playFeedbackSound("correct");
      
      left.btn.classList.remove("selected");
      left.btn.classList.add("matched");
      right.btn.classList.remove("selected");
      right.btn.classList.add("matched");
      
      window.compareLeftSelected = null;
      window.compareRightSelected = null;
      window.compareMatchedCount++;
      
      // Update statistics: Correct
      const wordKey = left.word.origEn || left.word.en;
      updateWordStats(wordKey, true);
      
      state.currentTest.correctCount++;
      const correctCountEl = document.getElementById("test-correct-count");
      if (correctCountEl) correctCountEl.textContent = state.currentTest.correctCount;
      
      const batch = state.currentTest.words.slice(state.currentTest.index, state.currentTest.index + 5);
      if (window.compareMatchedCount === batch.length) {
        setTimeout(() => {
          showCompareFeedback(batch);
        }, 300);
      }
    } else {
      if (window.playFeedbackSound) window.playFeedbackSound("incorrect");
      
      left.btn.style.borderColor = "var(--error-color)";
      right.btn.style.borderColor = "var(--error-color)";
      
      setTimeout(() => {
        left.btn.style.borderColor = "";
        right.btn.style.borderColor = "";
        left.btn.classList.remove("selected");
        right.btn.classList.remove("selected");
      }, 500);

      const wordKey = left.word.origEn || left.word.en;
      updateWordStats(wordKey, false);

      if (!state.currentTest.wrongAnswers.find(w => w.en === left.word.en)) {
        state.currentTest.wrongAnswers.push(left.word);
      }
      
      const wrongCountEl = document.getElementById("test-wrong-count");
      if (wrongCountEl) wrongCountEl.textContent = state.currentTest.wrongAnswers.length;
      
      window.compareLeftSelected = null;
      window.compareRightSelected = null;
    }
  }
}

function showCompareFeedback(batch) {
  const test = state.currentTest;
  if (!test) return;

  saveState();

  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");
  
  if (overlay) {
    overlay.className = "test-right-pane active correct-ans";
    if (fTitle) fTitle.textContent = "Compare Set Complete!";
    if (fIcon) fIcon.textContent = "🏆";
    if (fDesc) fDesc.textContent = `Great matching! You successfully completed this comparison set.`;
    
    // Hide details container
    const detailsContainer = document.getElementById("word-details-container");
    if (detailsContainer) detailsContainer.style.display = "none";

    const nextBtn = document.getElementById("btn-next-question");
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = "Continue";
      nextBtn.onclick = () => {
        overlay.classList.remove("active");
        test.index += batch.length; // Advance by the size of the matched batch (5)
        if (test.index < test.words.length) {
          buildCompareMode();
        } else {
          finishTestSession();
        }
      };
    }
  }
}

export function buildConjugationMode() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang || "it";

  // Hide progress / details wrapper
  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  if (wordCardWrapper) wordCardWrapper.style.display = "none";
  if (catTag) catTag.style.display = "none";

  const btnSubmit = document.getElementById("btn-submit-answer");
  if (btnSubmit) {
    btnSubmit.style.display = "block";
    btnSubmit.textContent = "Check Answer";
    btnSubmit.onclick = checkConjugationAnswer;
  }

  if (window.questionTimerInterval) {
    clearInterval(window.questionTimerInterval);
    window.questionTimerInterval = null;
  }
  const timerBadge = document.getElementById("test-countdown-badge");
  if (timerBadge) timerBadge.style.display = "none";

  const correctConjugations = getConjugationsForVerb(currentWord, aLang);
  window.conjugationCorrectList = correctConjugations;
  window.conjugationUserMatches = [null, null, null, null, null, null];
  window.conjugationSelectedCard = null;

  const pronouns = PRONOUNS[aLang] || PRONOUNS.en;

  const rowsContainer = document.getElementById("conjugation-rows-container");
  if (rowsContainer) {
    rowsContainer.innerHTML = "";
    pronouns.forEach((pronoun, index) => {
      const row = document.createElement("div");
      row.className = "conjugation-row";
      row.innerHTML = `
        <span class="conjugation-pronoun">${pronoun}</span>
        <button class="conjugation-slot" id="conjugation-slot-${index}">[ Tap to Place ]</button>
      `;
      
      const slotEl = row.querySelector(".conjugation-slot");
      slotEl.onclick = () => window.clickConjugationSlot(index);
      slotEl.ondragover = (e) => {
        e.preventDefault();
      };
      slotEl.ondrop = (e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          window.placeCardInSlot(data.text, data.cardIndex, index, data.fromSlot);
        } catch (err) {}
      };

      rowsContainer.appendChild(row);
    });
  }

  const poolContainer = document.getElementById("conjugation-pool");
  if (poolContainer) {
    poolContainer.innerHTML = "";
    
    poolContainer.ondragover = (e) => {
      e.preventDefault();
    };
    poolContainer.ondrop = (e) => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
        if (data.fromSlot !== undefined) {
          window.returnCardToPool(data.fromSlot);
        }
      } catch (err) {}
    };

    const shuffledConjugations = [...correctConjugations]
      .map((text, index) => ({ text, index }))
      .sort(() => 0.5 - Math.random());

    shuffledConjugations.forEach((item, idx) => {
      const card = document.createElement("button");
      card.className = "conjugation-card";
      card.textContent = item.text;
      card.dataset.index = idx;
      
      card.draggable = true;
      card.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ text: item.text, cardIndex: idx }));
      };

      card.onclick = () => window.clickConjugationCard(card, item.text);
      poolContainer.appendChild(card);
    });
  }
}

window.evaluateSlot = function(index) {
  const slotEl = document.getElementById(`conjugation-slot-${index}`);
  if (!slotEl) return;
  const match = window.conjugationUserMatches[index];
  const correctList = window.conjugationCorrectList;

  if (!match) {
    slotEl.className = "conjugation-slot";
    slotEl.textContent = "[ Tap to Place ]";
    slotEl.removeAttribute("draggable");
    slotEl.style.borderColor = "";
    return;
  }

  const isCorrect = match.text === correctList[index];
  if (isCorrect) {
    slotEl.className = "conjugation-slot filled correct";
    playLocalSound("sound-correct");
  } else {
    slotEl.className = "conjugation-slot filled incorrect";
    playLocalSound("sound-incorrect");
  }
};

window.placeCardInSlot = function(text, cardIndex, slotIndex, fromSlotIndex) {
  const targetExisting = window.conjugationUserMatches[slotIndex];

  if (fromSlotIndex !== undefined && fromSlotIndex !== null) {
    window.conjugationUserMatches[fromSlotIndex] = null;
    const fromSlotEl = document.getElementById(`conjugation-slot-${fromSlotIndex}`);
    if (fromSlotEl) {
      fromSlotEl.className = "conjugation-slot";
      fromSlotEl.textContent = "[ Tap to Place ]";
      fromSlotEl.removeAttribute("draggable");
    }
  }

  if (targetExisting) {
    const targetCardEl = document.querySelector(`#conjugation-pool .conjugation-card[data-index="${targetExisting.cardIndex}"]`);
    if (targetCardEl) {
      targetCardEl.style.visibility = "visible";
    }
  }

  const cardEl = document.querySelector(`#conjugation-pool .conjugation-card[data-index="${cardIndex}"]`);
  if (cardEl) {
    cardEl.style.visibility = "hidden";
  }

  window.conjugationUserMatches[slotIndex] = { text, cardIndex };
  const slotEl = document.getElementById(`conjugation-slot-${slotIndex}`);
  if (slotEl) {
    slotEl.textContent = text;
    slotEl.classList.add("filled");
    slotEl.draggable = true;
    slotEl.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ text, cardIndex, fromSlot: slotIndex }));
    };
  }

  window.evaluateSlot(slotIndex);

  if (fromSlotIndex !== undefined && fromSlotIndex !== null) {
    window.evaluateSlot(fromSlotIndex);
  }

  window.checkAllSlotsAuto();
};

window.returnCardToPool = function(slotIndex) {
  const match = window.conjugationUserMatches[slotIndex];
  if (match) {
    const cardEl = document.querySelector(`#conjugation-pool .conjugation-card[data-index="${match.cardIndex}"]`);
    if (cardEl) {
      cardEl.style.visibility = "visible";
      cardEl.classList.remove("selected");
    }

    window.conjugationUserMatches[slotIndex] = null;
    const slotEl = document.getElementById(`conjugation-slot-${slotIndex}`);
    if (slotEl) {
      slotEl.className = "conjugation-slot";
      slotEl.textContent = "[ Tap to Place ]";
      slotEl.removeAttribute("draggable");
    }

    playLocalSound("sound-bubble");
  }
};

window.checkAllSlotsAuto = function() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang || "it";
  const correctList = window.conjugationCorrectList;
  const userMatches = window.conjugationUserMatches;

  const allFilled = userMatches.every(m => m !== null);
  if (!allFilled) return;

  const allCorrect = userMatches.every((m, i) => m.text === correctList[i]);
  if (allCorrect) {
    setTimeout(() => {
      checkConjugationAnswer();
    }, 400);
  }
};

window.clickConjugationCard = function(cardEl, text) {
  playLocalSound("sound-bubble");
  
  if (cardEl.classList.contains("selected")) {
    cardEl.classList.remove("selected");
    window.conjugationSelectedCard = null;
    return;
  }

  document.querySelectorAll(".conjugation-card").forEach(c => c.classList.remove("selected"));
  cardEl.classList.add("selected");
  window.conjugationSelectedCard = { el: cardEl, text: text, index: cardEl.dataset.index };
};

window.clickConjugationSlot = function(index) {
  const existingMatch = window.conjugationUserMatches[index];

  if (existingMatch) {
    window.returnCardToPool(index);
    return;
  }

  if (window.conjugationSelectedCard) {
    const text = window.conjugationSelectedCard.text;
    const cardIndex = window.conjugationSelectedCard.index;
    window.conjugationSelectedCard = null;
    window.placeCardInSlot(text, cardIndex, index);
  }
};

function playLocalSound(name) {
  if (window.playSound) window.playSound(name);
}

function checkConjugationAnswer() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang || "it";
  const correctList = window.conjugationCorrectList;
  const userMatches = window.conjugationUserMatches;
  const pronouns = PRONOUNS[aLang] || PRONOUNS.en;

  let allCorrect = true;

  pronouns.forEach((pronoun, i) => {
    const slotEl = document.getElementById(`conjugation-slot-${i}`);
    if (slotEl) {
      const userMatchText = userMatches[i] ? userMatches[i].text : null;
      if (userMatchText === correctList[i]) {
        slotEl.className = "conjugation-slot filled correct";
      } else {
        slotEl.className = "conjugation-slot filled incorrect";
        slotEl.innerHTML = `${userMatchText || "Empty"} <span style="font-size:0.8em; opacity:0.8; text-decoration:line-through; margin:0 4px;">&rarr;</span> <span style="color:var(--success-color); font-weight:700;">${correctList[i]}</span>`;
        allCorrect = false;
      }
    }
  });

  if (allCorrect) {
    playLocalSound("sound-correct");
  } else {
    playLocalSound("sound-incorrect");
  }

  const wordKey = currentWord.origEn || currentWord.en;
  if (!state.wordStats[wordKey]) {
    state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
  }
  const stats = state.wordStats[wordKey];
  stats.attempts = (stats.attempts || 0) + 1;
  stats.lastReview = Date.now();

  if (allCorrect) {
    if (!stats.box) stats.box = 1;
    if (stats.box < 5) stats.box++;
    
    let qPoints = 100;
    if (state.questionTimer > 0) {
      const limit = state.questionTimer;
      let timerLimitMult = 1.0;
      if (limit === 5) timerLimitMult = 3.0;
      else if (limit === 10) timerLimitMult = 2.0;
      else if (limit === 15) timerLimitMult = 1.5;
      qPoints = qPoints * timerLimitMult;
    }
    tState.points = (tState.points || 0) + Math.round(qPoints);
    tState.correctCount++;
    tState.lastAnswerCorrect = true;
  } else {
    stats.errors = (stats.errors || 0) + 1;
    stats.box = 1;
    
    if (window.recordMistake) {
      window.recordMistake(currentWord);
    }

    if (!tState.wrongAnswers.find(w => w.en === currentWord.en)) {
      tState.wrongAnswers.push(currentWord);
    }
    tState.lastAnswerCorrect = false;
  }

  // Update stats mini
  const correctCountEl = document.getElementById("test-correct-count");
  const wrongCountEl = document.getElementById("test-wrong-count");
  if (correctCountEl) correctCountEl.textContent = tState.correctCount;
  if (wrongCountEl) wrongCountEl.textContent = tState.wrongAnswers.length;

  saveState();

  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");
  
  if (overlay) {
    overlay.className = allCorrect ? "test-right-pane active correct-ans" : "test-right-pane active incorrect-ans";
    if (fTitle) fTitle.textContent = allCorrect ? "Correct Conjugation!" : "Conjugation Mistakes!";
    if (fIcon) fIcon.textContent = allCorrect ? "🎉" : "😢";
    if (fDesc) fDesc.textContent = allCorrect 
      ? `Perfect! You conjugated "${currentWord.target}" correctly across all pronouns.` 
      : `Some conjugation matching mistakes were made. Review the corrections on the left.`;
  }

  const detailsContainer = document.getElementById("word-details-container");
  if (detailsContainer) detailsContainer.style.display = "none";

  const diffVoting = document.querySelector(".difficulty-voting-container");
  if (diffVoting) {
    diffVoting.style.display = "block";
    updateDifficultyVoteUI(currentWord);
  }

  const nextBtn = document.getElementById("btn-next-question");
  if (nextBtn) {
    nextBtn.style.display = "block";
    nextBtn.textContent = "Continue";
    nextBtn.onclick = () => {
      if (overlay) overlay.classList.remove("active");
      tState.index++;
      if (tState.index < tState.words.length) {
        renderQuestion();
      } else {
        finishTestSession();
      }
    };
  }
}

window.buildConjugationMode = buildConjugationMode;
