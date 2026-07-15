// VocTrainer - Test Runner Module
import { state, saveState } from './state.js';

export function startTestSession(language, category, count, isMistakesOnly = false, customCategory = "none", direction = "forward") {
  let pool = [];
  
  if (isMistakesOnly) {
    pool = [...state.mistakes];
    // Filter out broken entries where question equals answer
    pool = pool.filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());
  } else if (customCategory !== "none") {
    const base = state.baseLang || "en";
    pool = state.customVocab
      .filter(v => v.category === customCategory)
      .filter(v => v[base] && v[language] && v[base].toLowerCase().trim() !== v[language].toLowerCase().trim());
  } else {
    const base = state.baseLang || "en";
    // Standard folder
    const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
    const starters = starterVocabRaw
      .filter(item => item.category === category)
      .map(item => {
        const origEn = item[base];
        const origTarget = item[language];
        if (state.deletedStarters.includes(origEn)) return null;
        
        let finalEn = origEn;
        let finalTarget = origTarget;
        if (state.editedStarters[origEn]) {
          finalEn = state.editedStarters[origEn].en || origEn;
          finalTarget = state.editedStarters[origEn].target || origTarget;
        }
        
        return {
          en: finalEn,
          target: finalTarget,
          category: item.category
        };
      })
      .filter(Boolean);

    const customs = state.customVocab
      .filter(item => item.category === category && item[base] && item[language] && item[base].toLowerCase().trim() !== item[language].toLowerCase().trim())
      .map(item => ({
        en: item[base],
        target: item[language],
        category: item.category
      }));

    pool = [...starters, ...customs];
  }

  // Filter out any entries where en equals target
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
  if (currentQEl) currentQEl.textContent = test.index + 1;
  if (totalQEl) totalQEl.textContent = test.totalOriginalCount;
  if (correctCountEl) correctCountEl.textContent = test.correctCount;

  // Clear previous states
  const feedbackContainer = document.getElementById("test-feedback-container");
  if (feedbackContainer) {
    feedbackContainer.style.display = "none";
    feedbackContainer.className = "test-feedback-card";
  }
  const btnSubmit = document.getElementById("btn-submit-answer");
  if (btnSubmit) {
    btnSubmit.disabled = false;
  }

  const questionWord = test.words[test.index];
  const questionTextEl = document.getElementById("test-question-text");
  const direction = state.testDirection || "forward";

  // Hide all mode containers
  const containers = {
    multiple: document.getElementById("test-mode-multiple"),
    typing: document.getElementById("test-mode-typing"),
    conjugation: document.getElementById("test-mode-conjugation")
  };
  Object.values(containers).forEach(el => { if (el) el.style.display = "none"; });

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

  const isCorrect = checkAnswer(selectedText, correctText, correctWord);

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
    triggerIncorrectAnswerUI(correctText);
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

  const isCorrect = checkAnswer(userAnswer, correctText, correctWord);

  if (isCorrect) {
    inputField.classList.add("correct-input");
    triggerCorrectAnswerUI();
  } else {
    inputField.classList.add("incorrect-input");
    triggerIncorrectAnswerUI(correctText);
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

  const isCorrect = checkAnswer(userAnswer, correctConjugation, questionWord);

  if (isCorrect) {
    inputField.classList.add("correct-input");
    triggerCorrectAnswerUI();
  } else {
    inputField.classList.add("incorrect-input");
    triggerIncorrectAnswerUI(correctConjugation);
  }
}

export function submitAnswer() {
  const direction = state.testDirection || "forward";
  if (direction === "conjugation") {
    submitConjugationAnswer();
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
    fDesc.textContent = `Awesome job! "${wordObj.en}" is indeed "${wordObj.target}".`;
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

function triggerIncorrectAnswerUI(correctText) {
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
    fDesc.innerHTML = `Correct translation is: <strong style="color: #fff;">${correctText}</strong>`;
  }

  // Populate word details in the sidebar
  if (window.setupWordDetails) {
    window.setupWordDetails(wordObj);
  }

  // Update difficulty vote buttons UI
  const wordKey = wordObj.origEn || wordObj.en;
  const vStats = state.wordStats[wordKey] || { difficulty: "medium" };
  updateDifficultyVoteUI(vStats.difficulty || "medium");
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

    // Save to mistakes vault if not already there
    const base = state.baseLang || "en";
    const target = state.selectedLang || "de";
    const test = state.currentTest;
    const wordObj = test.words[test.index];

    const exists = state.mistakes.some(m => m[base] === wordObj[base] && m[target] === wordObj[target]);
    if (!exists) {
      state.mistakes.push({
        ...wordObj,
        lastUpdated: Date.now()
      });
    }
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

export function speakCurrentTestWord() {
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
    if (window.speakWord) window.speakWord(correctConjugation, targetLang);
  } else {
    const text = wordObj.target;
    const targetLang = state.selectedLang || "de";
    if (window.speakWord) window.speakWord(text, targetLang);
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

export function voteDifficulty(level) {
  const test = state.currentTest;
  if (!test) return;
  const currentWord = test.words[test.index];
  if (!currentWord) return;
  
  const wordKey = currentWord.origEn || currentWord.en;
  if (!state.wordStats) state.wordStats = {};
  if (!state.wordStats[wordKey]) {
    state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
  }
  
  state.wordStats[wordKey].difficulty = level;
  saveState();
  updateDifficultyVoteUI(level);
}

export function updateDifficultyVoteUI(level) {
  const btnEasy = document.getElementById("btn-vote-easy");
  const btnMedium = document.getElementById("btn-vote-medium");
  const btnHard = document.getElementById("btn-vote-hard");
  if (!btnEasy || !btnMedium || !btnHard) return;
  
  btnEasy.style.background = "";
  btnEasy.style.borderColor = "";
  btnEasy.style.color = "";
  btnMedium.style.background = "";
  btnMedium.style.borderColor = "";
  btnMedium.style.color = "";
  btnHard.style.background = "";
  btnHard.style.borderColor = "";
  btnHard.style.color = "";
  
  if (level === "easy") {
    btnEasy.style.background = "rgba(46, 204, 113, 0.2)";
    btnEasy.style.borderColor = "#2ecc71";
    btnEasy.style.color = "#2ecc71";
  } else if (level === "medium") {
    btnMedium.style.background = "rgba(241, 196, 15, 0.2)";
    btnMedium.style.borderColor = "#f1c40f";
    btnMedium.style.color = "#f1c40f";
  } else if (level === "hard") {
    btnHard.style.background = "rgba(231, 76, 60, 0.2)";
    btnHard.style.borderColor = "#e74c3c";
    btnHard.style.color = "#e74c3c";
  }
}

export function submitSpeechAnswer(userAnswer) {
  const test = state.currentTest;
  if (!test) return;

  if (window.stopQuestionTimer) window.stopQuestionTimer();

  const correctWord = test.words[test.index];
  const direction = state.testDirection || "forward";
  const correctText = direction === "forward" ? correctWord.target : correctWord.en;

  const isCorrect = checkAnswer(userAnswer, correctText, correctWord);

  if (isCorrect) {
    triggerCorrectAnswerUI();
  } else {
    triggerIncorrectAnswerUI(correctText);
  }
}

export function toggleListening() {
  const btnMic = document.getElementById("btn-mic");
  if (!btnMic) return;

  if (btnMic.classList.contains("listening")) {
    if (window.stopListeningPronunciation) window.stopListeningPronunciation();
    btnMic.classList.remove("listening");
  } else {
    const test = state.currentTest;
    if (!test) return;
    const currentWord = test.words[test.index];
    const direction = state.testDirection || "forward";
    const answerLang = direction === "forward" ? (state.selectedLang || "de") : (state.baseLang || "en");

    if (window.initSpeechRecognition) {
      const initialized = window.initSpeechRecognition(
        answerLang,
        () => {
          btnMic.classList.add("listening");
          const transcript = document.getElementById("speech-transcript");
          if (transcript) transcript.textContent = "Listening...";
        },
        (result) => {
          const transcript = document.getElementById("speech-transcript");
          if (transcript) transcript.textContent = result;
          submitSpeechAnswer(result);
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
