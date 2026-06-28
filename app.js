// ==========================================
// 1. Initial Starting Vocabulary Datasets
// ==========================================
let STARTER_VOCAB_RAW = [];

// Asynchronously load starter vocabularies from a single unified JSON file
async function loadStarterVocab() {
  try {
    const res = await fetch("vocab/vocab.json");
    if (res.ok) {
      STARTER_VOCAB_RAW = await res.json();
    }
  } catch (e) {
    console.error("Failed to load starter vocab:", e);
  }
}

// Language code mappings to Speech Synthesis/Recognition locales
const LANG_LOCALES = {
  en: "en-US",
  de: "de-DE",
  it: "it-IT",
  es: "es-ES",
  fr: "fr-FR"
};

// ==========================================
// 2. State & Storage Management
// ==========================================
let state = {
  xp: 0,
  streak: 0,
  hearts: 5,
  level: 1,
  selectedLang: "en", 
  customVocab: [], 
  mistakes: [], 
  openaiKey: "",
  grokKey: "",
  geminiKey: "",
  anthropicKey: "",
  audioEngine: "browser", // browser or openai
  allowSynonyms: true, // Allow similar words/synonyms
  history: [], // Completed tests history

  // Current active test state
  currentTest: {
    words: [],
    index: 0,
    wrongAnswers: [],
    isRepeatRound: false,
    correctCount: 0,
    totalOriginalCount: 0,
    selectedMode: "typing" 
  }
};

// Temporal variables for custom recording
let mediaRecorder;
let audioChunks = [];
let currentRecordingBase64 = "";

// Save state to LocalStorage
function saveState() {
  localStorage.setItem("voctrainer_state", JSON.stringify({
    xp: state.xp,
    streak: state.streak,
    hearts: state.hearts,
    level: state.level,
    customVocab: state.customVocab,
    mistakes: state.mistakes,
    openaiKey: state.openaiKey,
    grokKey: state.grokKey,
    geminiKey: state.geminiKey,
    anthropicKey: state.anthropicKey,
    audioEngine: state.audioEngine,
    allowSynonyms: state.allowSynonyms,
    baseLang: state.baseLang,
    selectedLang: state.selectedLang,
    history: state.history
  }));
  updateHeaderUI();
}

// Load state from LocalStorage
function loadState() {
  const data = localStorage.getItem("voctrainer_state");
  if (data) {
    const parsed = JSON.parse(data);
    state.xp = parsed.xp || 0;
    state.streak = parsed.streak || 0;
    state.hearts = parsed.hearts !== undefined ? parsed.hearts : 5;
    state.level = parsed.level || 1;
    state.customVocab = parsed.customVocab || [];
    state.mistakes = parsed.mistakes || [];
    state.openaiKey = parsed.openaiKey || "";
    state.grokKey = parsed.grokKey || "";
    state.geminiKey = parsed.geminiKey || "";
    state.anthropicKey = parsed.anthropicKey || "";
    state.audioEngine = parsed.audioEngine || "browser";
    state.allowSynonyms = parsed.allowSynonyms !== undefined ? parsed.allowSynonyms : true;
    state.baseLang = parsed.baseLang || "en";
    state.selectedLang = parsed.selectedLang || "de";
    state.history = parsed.history || [];

    // Prefill Setup fields
    document.getElementById("setup-openai-key").value = state.openaiKey;
    document.getElementById("setup-grok-key").value = state.grokKey;
    document.getElementById("setup-gemini-key").value = state.geminiKey;
    document.getElementById("setup-anthropic-key").value = state.anthropicKey;
    document.getElementById("select-audio-engine").value = state.audioEngine;
    document.getElementById("setup-allow-synonyms").checked = state.allowSynonyms;

    // Prefill dashboard buttons active state
    document.querySelectorAll(".base-lang-btn").forEach(b => {
      b.classList.remove("active");
      if (b.dataset.lang === state.baseLang) b.classList.add("active");
    });
    document.querySelectorAll(".lang-btn").forEach(b => {
      b.classList.remove("active");
      if (b.dataset.lang === state.selectedLang) b.classList.add("active");
    });
  }
  updateHeaderUI();
  renderImportedList();
  renderMistakesList();
  renderHistoryList();
}

// ==========================================
// 3. UI Navigation & Helpers
// ==========================================
function showView(viewId) {
  document.querySelectorAll(".app-view").forEach(view => {
    view.classList.remove("active");
  });
  const activeView = document.getElementById(viewId);
  if (activeView) activeView.classList.add("active");

  // Update active state in sidebar navigation
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(btn => {
    btn.classList.remove("active");
    if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(viewId)) {
      btn.classList.add("active");
    }
  });
}

function updateHeaderUI() {
  document.getElementById("xp-count").textContent = state.xp;
  document.getElementById("streak-count").textContent = state.streak;
  
  const heartsCount = document.getElementById("hearts-count");
  if (heartsCount) heartsCount.textContent = state.hearts;
  
  // Update level badge on both top header and potentially any other layout element
  const levelBadges = document.querySelectorAll("#level-badge");
  levelBadges.forEach(badge => {
    badge.textContent = `Lvl ${state.level}`;
  });

  const mistakesBadge = document.getElementById("mistakes-badge");
  if (mistakesBadge) mistakesBadge.textContent = state.mistakes.length;

  const sidebarMistakesBadge = document.getElementById("sidebar-mistakes-badge");
  if (sidebarMistakesBadge) sidebarMistakesBadge.textContent = state.mistakes.length;

  const vaultCount = document.getElementById("vault-count");
  if (vaultCount) vaultCount.textContent = state.mistakes.length;
}

// Sound effects helper using Web Audio API synthesis for zero latency and offline reliability, falling back to HTML Audio if needed
function playSound(soundId) {
  const typeMap = {
    "sound-click": "click",
    "sound-popup": "popup",
    "sound-correct": "correct",
    "sound-incorrect": "incorrect",
    "sound-levelup": "levelup"
  };

  const type = typeMap[soundId];
  if (type) {
    playSynthesizedSound(type);
  }

  const audio = document.getElementById(soundId);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log("HTML audio fallback blocked or unavailable: " + soundId));
  }
}

function playSynthesizedSound(type) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  
  try {
    const ctx = new AudioCtx();
    
    if (type === "click") {
      // Short bubble pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === "popup") {
      // Soft sliding chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "correct") {
      // Bright major third double ding (Duolingo style)
      const now = ctx.currentTime;
      [
        { freq: 523.25, time: now }, // C5
        { freq: 659.25, time: now + 0.08 } // E5
      ].forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        osc.frequency.value = note.freq;
        
        gain.gain.setValueAtTime(0.15, note.time);
        gain.gain.exponentialRampToValueAtTime(0.01, note.time + 0.25);
        
        osc.start(note.time);
        osc.stop(note.time + 0.25);
      });
    } else if (type === "incorrect") {
      // Sad downward buzz
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(147, now + 0.3);
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
      
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "levelup") {
      // Ascending major arpeggio
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        osc.frequency.value = freq;
        
        const noteTime = now + (index * 0.1);
        gain.gain.setValueAtTime(0.12, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.35);
        
        osc.start(noteTime);
        osc.stop(noteTime + 0.35);
      });
    }
  } catch (e) {
    console.error("Synthesizer failed:", e);
  }
}

// Speech Synthesis (TTS)
function speakWord(text, langCode, rate = 1.0) {
  if (state.audioEngine === "openai" && state.openaiKey) {
    speakOpenAI(text, rate);
    return;
  }
  
  if ('speechSynthesis' in window) {
    // Cancel ongoing synthesis
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_LOCALES[langCode] || "en-US";
    utterance.rate = rate; // Supports slow reading (0.5)
    window.speechSynthesis.speak(utterance);
  }
}

// Speak using OpenAI API
async function speakOpenAI(text, rate) {
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${state.openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "alloy",
        speed: rate
      })
    });
    if (!response.ok) throw new Error("TTS API Error");
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (e) {
    console.error(e);
    // Fallback to browser TTS if API fails
    state.audioEngine = "browser";
    speakWord(text, state.selectedLang, rate);
  }
}

// Play custom recorded sound
function playCustomAudio(base64Data) {
  if (base64Data) {
    const audio = new Audio(base64Data);
    audio.play().catch(e => console.error("Could not play custom audio", e));
  }
}

// ==========================================
// 4. Scraper & Custom Add Functionality
// ==========================================
async function importFromUrl(url, category) {
  const spinner = document.getElementById("import-spinner");
  spinner.style.display = "block";
  
  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, "text/html");
    
    let importedCount = 0;
    
    // Heuristic 1: Tables
    const tables = doc.querySelectorAll("table");
    tables.forEach(table => {
      const rows = table.querySelectorAll("tr");
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          const w1 = cells[0].textContent.trim();
          const w2 = cells[1].textContent.trim();
          if (w1 && w2 && w1.length < 50 && w2.length < 50 && !w1.includes("Translation") && !w1.includes("Word")) {
            addCustomWord(w1, w2, state.selectedLang, category);
            importedCount++;
          }
        }
      });
    });
    
    // Heuristic 2: Hyphen lists
    if (importedCount === 0) {
      const listItems = doc.querySelectorAll("li, p");
      listItems.forEach(item => {
        const text = item.textContent.trim();
        const match = text.match(/^([a-zA-Z\s¿?¡!]+)[\s\-\–\—\:\=]+([a-zA-Z\s¿?¡!]+)$/);
        if (match) {
          const w1 = match[1].trim();
          const w2 = match[2].trim();
          if (w1 && w2 && w1.split(" ").length < 5 && w2.split(" ").length < 5) {
            addCustomWord(w1, w2, state.selectedLang, category);
            importedCount++;
          }
        }
      });
    }

    spinner.style.display = "none";
    if (importedCount > 0) {
      alert(`Success! Automatically imported ${importedCount} vocabularies.`);
      saveState();
      renderImportedList();
    } else {
      alert("Could not automatically identify vocabularies. Try adding manually.");
    }
  } catch (error) {
    spinner.style.display = "none";
    console.error(error);
    alert("Error fetching or parsing the URL.");
  }
}

function addCustomWord(english, translation, lang, category, imageUrl = "", audioBase64 = "") {
  state.customVocab.push({
    en: english,
    target: translation,
    lang: lang,
    category: category || "imported",
    image: imageUrl || english,
    audio: audioBase64
  });
}

function renderImportedList() {
  const container = document.getElementById("imported-list");
  container.innerHTML = "";
  
  if (state.customVocab.length === 0) {
    container.innerHTML = `<li class="empty-state">No custom words added yet.</li>`;
    return;
  }

  state.customVocab.slice(-10).reverse().forEach(vocab => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="list-word">${vocab.en}</span>
      <span class="list-translation">${vocab.target} (${vocab.lang.toUpperCase()})</span>
    `;
    container.appendChild(li);
  });
}

// ==========================================
// 5. Mistakes Vault Implementation
// ==========================================
function recordMistake(wordObj) {
  if (!state.mistakes.find(m => m.en === wordObj.en && m.target === wordObj.target)) {
    state.mistakes.push(wordObj);
    saveState();
    renderMistakesList();
  }
}

function renderMistakesList() {
  const container = document.getElementById("mistakes-list");
  container.innerHTML = "";

  if (state.mistakes.length === 0) {
    container.innerHTML = `<li class="empty-state">No mistakes recorded! Keep up the good work.</li>`;
    return;
  }

  state.mistakes.forEach((m, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <span class="list-word">${m.en}</span>
        <span class="list-translation"> &rarr; ${m.target}</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="removeMistake(${idx})">✓ Clear</button>
    `;
    container.appendChild(li);
  });
}

window.removeMistake = function(index) {
  state.mistakes.splice(index, 1);
  saveState();
  renderMistakesList();
};

// ==========================================
// 6. Test Runner Engine (Study Session)
// ==========================================
function startTestSession(language, category, count, isMistakesOnly = false) {
  let pool = [];
  
  if (isMistakesOnly) {
    pool = [...state.mistakes];
  } else {
    const base = state.baseLang || "en";
    const starters = STARTER_VOCAB_RAW.map(item => ({
      en: item[base],
      target: item[language],
      category: item.category,
      image: item.image,
      details: item.details
    }));
    
    const customs = state.customVocab.filter(v => v.lang === language);
    pool = [...starters, ...customs];
    
    if (category !== "all") {
      pool = pool.filter(v => v.category === category);
    }
  }

  if (pool.length === 0) {
    alert("No vocabulary words found. Please import some first!");
    return;
  }

  pool = pool.sort(() => 0.5 - Math.random());
  const wordsToTest = pool.slice(0, count);

  state.currentTest = {
    words: wordsToTest,
    index: 0,
    wrongAnswers: [],
    isRepeatRound: false,
    correctCount: 0,
    totalOriginalCount: wordsToTest.length,
    selectedMode: "typing"
  };

  showView("view-test");
  renderQuestion();
}

function renderQuestion() {
  const tState = state.currentTest;
  const currentWord = tState.words[tState.index];
  
  // Set category tag
  document.getElementById("test-category-tag").textContent = currentWord.category || "General";
  
  // Display target/source
  document.getElementById("test-prompt-word").textContent = currentWord.en;
  
  // Image Renderer - Use manual custom image if available, else fetch from LoremFlickr
  const imgEl = document.getElementById("word-image");
  const placeholderEl = document.getElementById("word-image-placeholder");
  
  if (currentWord.image) {
    if (currentWord.image.startsWith("http")) {
      imgEl.src = currentWord.image;
    } else {
      imgEl.src = `https://loremflickr.com/320/240/${encodeURIComponent(currentWord.image)}`;
    }
    imgEl.style.display = "block";
    placeholderEl.style.display = "none";
  } else {
    imgEl.style.display = "none";
    placeholderEl.style.display = "block";
  }

  // Audio Buttons Setup
  document.getElementById("btn-speak-prompt").onclick = () => speakWord(currentWord.en, state.baseLang || "en", 1.0);
  document.getElementById("btn-speak-prompt-slow").onclick = () => speakWord(currentWord.en, state.baseLang || "en", 0.5);

  const customPlayBtn = document.getElementById("btn-play-custom-recording");
  if (currentWord.audio) {
    customPlayBtn.style.display = "inline-flex";
    customPlayBtn.onclick = () => playCustomAudio(currentWord.audio);
  } else {
    customPlayBtn.style.display = "none";
  }

  // Update progress text & status (Apple HIG Requirement)
  const progressPercent = ((tState.index) / tState.words.length) * 100;
  document.getElementById("test-progress-fill").style.width = `${progressPercent}%`;
  document.getElementById("test-progress-text").textContent = `Question ${tState.index + 1}/${tState.words.length}`;

  // Reset inputs & word details panel
  document.getElementById("input-typing-answer").value = "";
  document.getElementById("bubble-selected-zone").innerHTML = "";
  document.getElementById("speech-transcript").textContent = "...";
  
  const detailsContainer = document.getElementById("word-details-container");
  if (detailsContainer) detailsContainer.style.display = "none";
  const showDetailsBtn = document.getElementById("btn-show-details");
  if (showDetailsBtn) showDetailsBtn.textContent = "ℹ️ Show Details";
  const aiDetailsLoading = document.getElementById("ai-details-loading");
  if (aiDetailsLoading) aiDetailsLoading.style.display = "none";
  const aiDetailsResponse = document.getElementById("ai-details-response");
  if (aiDetailsResponse) aiDetailsResponse.style.display = "none";
  
  buildBubbleOptions(currentWord.target);

  if (tState.selectedMode === "typing") {
    setTimeout(() => document.getElementById("input-typing-answer").focus(), 100);
  }
}

function buildBubbleOptions(targetPhrase) {
  const selectedZone = document.getElementById("bubble-selected-zone");
  const optionsZone = document.getElementById("bubble-options-zone");
  optionsZone.innerHTML = "";
  selectedZone.innerHTML = "";

  let pieces = targetPhrase.split(/\s+/);
  if (pieces.length === 1) {
    const word = pieces[0];
    const mid = Math.ceil(word.length / 2);
    pieces = [word.substring(0, mid), word.substring(mid)];
  }

  const shuffled = [...pieces].sort(() => 0.5 - Math.random());

  shuffled.forEach(piece => {
    const bubble = document.createElement("button");
    bubble.className = "word-bubble";
    bubble.textContent = piece;
    bubble.onclick = () => {
      if (bubble.parentElement === optionsZone) {
        selectedZone.appendChild(bubble);
      } else {
        optionsZone.appendChild(bubble);
      }
    };
    optionsZone.appendChild(bubble);
  });
}

// Speech recognition setup (STT)
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechGen();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("speech-transcript").textContent = transcript;
    document.getElementById("btn-mic").classList.remove("listening");
  };

  recognition.onerror = () => {
    document.getElementById("speech-transcript").textContent = "[Retry speaking]";
    document.getElementById("btn-mic").classList.remove("listening");
  };
}

function toggleListening() {
  if (!recognition) {
    alert("Speech recognition is not supported on this browser.");
    return;
  }
  const btnMic = document.getElementById("btn-mic");
  if (btnMic.classList.contains("listening")) {
    recognition.stop();
    btnMic.classList.remove("listening");
  } else {
    recognition.lang = LANG_LOCALES[state.selectedLang] || "de-DE";
    recognition.start();
    btnMic.classList.add("listening");
  }
}

// Levenshtein Distance to calculate typo matches
function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Strip leading articles (e.g. "the book" -> "book")
function stripArticles(text, lang) {
  const articles = {
    en: ["the ", "a ", "an "],
    de: ["der ", "die ", "das ", "ein ", "eine "],
    es: ["el ", "la ", "los ", "las ", "un ", "una ", "unos ", "unas "],
    it: ["il ", "lo ", "la ", "i ", "gli ", "le ", "un ", "uno ", "una ", "un' "],
    fr: ["le ", "la ", "les ", "un ", "une ", "des ", "l' "]
  };
  
  let cleanText = text.trim().toLowerCase();
  const list = articles[lang] || [];
  
  for (const article of list) {
    if (cleanText.startsWith(article)) {
      return cleanText.substring(article.length).trim();
    }
  }
  return cleanText;
}

// Check the student's answer
function submitAnswer() {
  const tState = state.currentTest;
  const currentWord = tState.words[tState.index];
  let studentAnswer = "";

  const activeMode = document.querySelector(".mode-toggle-btn.active")?.dataset.mode || "typing";

  if (activeMode === "typing") {
    studentAnswer = document.getElementById("input-typing-answer").value.trim();
  } else if (activeMode === "bubbles") {
    const selectedBubbles = document.getElementById("bubble-selected-zone").querySelectorAll(".word-bubble");
    const arr = Array.from(selectedBubbles).map(b => b.textContent);
    studentAnswer = currentWord.target.split(/\s+/).length === 1 ? arr.join("") : arr.join(" ");
  } else if (activeMode === "speech") {
    studentAnswer = document.getElementById("speech-transcript").textContent.trim();
  }

  const cleanAns = studentAnswer.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
  const cleanTarget = currentWord.target.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();

  // Strip articles
  const cleanAnsNoArticle = stripArticles(cleanAns, state.selectedLang);
  const cleanTargetNoArticle = stripArticles(cleanTarget, state.selectedLang);

  const isExactMatch = cleanAns === cleanTarget;
  const isCloseMatch = cleanAnsNoArticle === cleanTargetNoArticle;
  
  // Calculate Levenshtein distance for typos
  const dist = getLevenshteinDistance(cleanAnsNoArticle, cleanTargetNoArticle);
  const isTypo = dist > 0 && dist <= 2; 

  // Synonym verification
  const syns = (currentWord.details && currentWord.details.synonyms && currentWord.details.synonyms[state.selectedLang]) ? currentWord.details.synonyms[state.selectedLang] : [];
  const cleanSyns = syns.map(s => {
    const sLower = s.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    return stripArticles(sLower, state.selectedLang);
  });
  const isSynonymMatch = state.allowSynonyms && cleanSyns.includes(cleanAnsNoArticle);

  const isCorrect = isExactMatch || isCloseMatch || isTypo || isSynonymMatch;
  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");

  if (isCorrect) {
    playSound("sound-correct");
    overlay.className = "feedback-overlay active correct-ans";
    fTitle.textContent = "Correct!";
    fIcon.textContent = "🎉";
    
    if (isExactMatch) {
      fDesc.textContent = `Excellent job! "${currentWord.en}" is indeed "${currentWord.target}".`;
    } else if (isSynonymMatch) {
      fDesc.textContent = `Correct! "${studentAnswer}" is a similar word/synonym of "${currentWord.target}".`;
    } else if (isCloseMatch) {
      fDesc.textContent = `Correct! (Ignored leading article). "${currentWord.en}" is "${currentWord.target}".`;
    } else if (isTypo) {
      fDesc.textContent = `Correct (with minor typo)! You entered: "${studentAnswer}". Correct word: "${currentWord.target}".`;
    }

    tState.correctCount++;
    state.xp += 10;
    checkLevelUp();
  } else {
    playSound("sound-incorrect");
    overlay.className = "feedback-overlay active incorrect-ans";
    fTitle.textContent = "Incorrect";
    fIcon.textContent = "😢";
    fDesc.textContent = `Correct translation is: "${currentWord.target}". You entered: "${studentAnswer || '[empty]'}".`;
    
    if (!tState.wrongAnswers.find(w => w.en === currentWord.en)) {
      tState.wrongAnswers.push(currentWord);
    }
    
    recordMistake(currentWord);
  }

  setupWordDetails(currentWord);
  saveState();
}

function checkLevelUp() {
  const newLevel = Math.floor(state.xp / 100) + 1;
  if (newLevel > state.level) {
    state.level = newLevel;
    playSound("sound-levelup");
    alert(`🎉 Level Up! You reached Level ${state.level}!`);
  }
}

function nextQuestion() {
  document.getElementById("feedback-overlay").classList.remove("active");
  const tState = state.currentTest;
  tState.index++;

  if (tState.index < tState.words.length) {
    renderQuestion();
  } else {
    finishTestRound();
  }
}

function finishTestRound() {
  const tState = state.currentTest;
  showView("view-report");
  
  if (tState.correctCount > 0) {
    state.streak = Math.max(1, state.streak); 
  }
  
  const accuracy = Math.round((tState.correctCount / tState.totalOriginalCount) * 100);
  
  // Record history
  state.history.push({
    date: new Date().toLocaleDateString(),
    lang: state.selectedLang.toUpperCase(),
    category: document.getElementById("select-category").value,
    total: tState.totalOriginalCount,
    correct: tState.correctCount,
    accuracy: accuracy,
    xp: tState.correctCount * 10
  });

  saveState();
  renderHistoryList();

  document.getElementById("report-xp").textContent = `+${tState.correctCount * 10}`;
  document.getElementById("report-accuracy").textContent = `${accuracy}%`;
  document.getElementById("report-wrong-count").textContent = tState.wrongAnswers.length;

  const repeatNotice = document.getElementById("repeat-notice");
  if (tState.wrongAnswers.length > 0) {
    repeatNotice.style.display = "block";
  } else {
    repeatNotice.style.display = "none";
  }
}

function startRepeatingMistakes() {
  const tState = state.currentTest;
  const wrongWords = [...tState.wrongAnswers];

  state.currentTest = {
    words: wrongWords,
    index: 0,
    wrongAnswers: [],
    isRepeatRound: true,
    correctCount: 0,
    totalOriginalCount: wrongWords.length,
    selectedMode: "typing"
  };

  showView("view-test");
  renderQuestion();
}

// ==========================================
// 7. Custom Audio Recorder Logic
// ==========================================
async function startAudioRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const reader = new FileReader();
      reader.onloadend = () => {
        currentRecordingBase64 = reader.result;
        document.getElementById("record-status-text").textContent = "Audio Recorded successfully!";
        document.getElementById("btn-record-play").disabled = false;
      };
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorder.start();
    document.getElementById("btn-record-word").textContent = "🛑 Stop Recording";
    document.getElementById("record-status-text").textContent = "Recording...";
  } catch (err) {
    console.error("Audio recording permission denied or unsupported", err);
    alert("Microphone access is required to record pronunciations.");
  }
}

function stopAudioRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    document.getElementById("btn-record-word").textContent = "🎙️ Record Pronunciation";
  }
}

// ==========================================
// 8. Event Listeners & Initialization
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadStarterVocab();
  loadState();

  // Navigation Links
  document.getElementById("btn-go-import").onclick = () => showView("view-import");
  document.getElementById("btn-go-mistakes").onclick = () => showView("view-mistakes");
  document.getElementById("btn-go-setup").onclick = () => showView("view-setup");
  
  document.getElementById("btn-import-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-mistakes-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-setup-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-report-home").onclick = () => showView("view-dashboard");
  
  document.getElementById("btn-quit-test").onclick = async () => {
    const quitConfirmed = await showCustomConfirm("Are you sure you want to quit this training session?");
    if (quitConfirmed) {
      showView("view-dashboard");
    }
  };

  // Language selectors (Target)
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedLang = btn.dataset.lang;
    };
  });

  // Base Language selectors (Source)
  document.querySelectorAll(".base-lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".base-lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.baseLang = btn.dataset.lang;
    };
  });

  // Segmented control selectors
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  // Start learning session button
  document.getElementById("btn-start-session").onclick = () => {
    if (state.baseLang === state.selectedLang) {
      alert("Please select a target language to learn that is different from your base language.");
      return;
    }
    const activeSeg = document.querySelector(".seg-btn.active");
    const count = activeSeg ? parseInt(activeSeg.dataset.count) : 10;
    const category = document.getElementById("select-category").value;
    startTestSession(state.selectedLang, category, count);
  };

  // Test mode switcher toggles
  document.querySelectorAll(".mode-toggle-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".mode-toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTest.selectedMode = btn.dataset.mode;
      
      document.querySelectorAll(".test-mode-section").forEach(s => s.classList.remove("active"));
      document.getElementById(`test-mode-${btn.dataset.mode}`).classList.add("active");
      
      if (btn.dataset.mode === "typing") {
        setTimeout(() => document.getElementById("input-typing-answer").focus(), 100);
      }
    };
  });

  // Audio Recording Toggle
  const recordBtn = document.getElementById("btn-record-word");
  recordBtn.onclick = () => {
    if (recordBtn.textContent.includes("Record")) {
      startAudioRecording();
    } else {
      stopAudioRecording();
    }
  };

  // Play current temporal recording
  document.getElementById("btn-record-play").onclick = () => {
    if (currentRecordingBase64) {
      playCustomAudio(currentRecordingBase64);
    }
  };

  // Setup Actions
  document.getElementById("btn-save-setup").onclick = () => {
    state.openaiKey = document.getElementById("setup-openai-key").value.trim();
    state.grokKey = document.getElementById("setup-grok-key").value.trim();
    state.geminiKey = document.getElementById("setup-gemini-key").value.trim();
    state.anthropicKey = document.getElementById("setup-anthropic-key").value.trim();
    state.audioEngine = document.getElementById("select-audio-engine").value;
    state.allowSynonyms = document.getElementById("setup-allow-synonyms").checked;
    saveState();
    alert("Configuration parameters updated!");
    showView("view-dashboard");
  };

  // Export Backups
  document.getElementById("btn-export-data").onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "voctrainer_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import Backup from File
  document.getElementById("import-backup-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedState = JSON.parse(event.target.result);
        state = { ...state, ...importedState };
        saveState();
        loadState();
        alert("Backup imported successfully!");
      } catch (err) {
        alert("Failed to parse the backup JSON file.");
      }
    };
    reader.readAsText(file);
  };

  // Submit Answer Action
  document.getElementById("btn-submit-answer").onclick = submitAnswer;

  // Continue to next question
  document.getElementById("btn-next-question").onclick = nextQuestion;

  // Typing Input Key Listener (Enter key to submit answer)
  document.getElementById("input-typing-answer").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const feedback = document.getElementById("feedback-overlay");
      const customModal = document.getElementById("custom-modal-overlay");
      
      // If modal or feedback overlay are NOT active, submit the answer
      if ((!feedback || !feedback.classList.contains("active")) && (!customModal || !customModal.classList.contains("active"))) {
        submitAnswer();
      }
    }
  });

  // Global Key Listener (Enter key to proceed or dismiss dialogs)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const feedback = document.getElementById("feedback-overlay");
      const customModal = document.getElementById("custom-modal-overlay");
      
      // 1. If custom modal is active, dismiss it (simulate clicking the primary action button, e.g., OK or Confirm)
      if (customModal && customModal.classList.contains("active")) {
        e.preventDefault();
        const primaryBtn = customModal.querySelector(".modal-actions .btn-primary");
        if (primaryBtn) {
          primaryBtn.click();
        }
        return;
      }
      
      // 2. If feedback overlay is active, proceed to the next question
      if (feedback && feedback.classList.contains("active")) {
        e.preventDefault();
        nextQuestion();
      }
    }
  });

  // Repeat wrong answers trigger
  document.getElementById("btn-start-repeat").onclick = startRepeatingMistakes;

  // Cleanse Mistakes trigger
  document.getElementById("btn-cleanse-mistakes").onclick = () => {
    startTestSession(state.selectedLang, "all", 10, true);
  };

  // Mic Speaking Action
  document.getElementById("btn-mic").onclick = toggleListening;

  // Import tabs toggle
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    };
  });

  // Manual import submit action
  document.getElementById("btn-manual-submit").onclick = () => {
    const eng = document.getElementById("manual-english").value.trim();
    const trans = document.getElementById("manual-translation").value.trim();
    const lang = document.getElementById("manual-lang").value;
    const cat = document.getElementById("manual-category").value.trim() || "nouns";
    const imgUrl = document.getElementById("manual-image-url").value.trim();

    if (eng && trans) {
      addCustomWord(eng, trans, lang, cat, imgUrl, currentRecordingBase64);
      saveState();
      renderImportedList();
      alert("Word added successfully!");
      
      // Reset input fields & recording data
      document.getElementById("manual-english").value = "";
      document.getElementById("manual-translation").value = "";
      document.getElementById("manual-image-url").value = "";
      currentRecordingBase64 = "";
      document.getElementById("btn-record-play").disabled = true;
      document.getElementById("record-status-text").textContent = "No audio recorded";
    } else {
      alert("Please fill in both word and translation.");
    }
  };

  // URL import scraper submit action
  document.getElementById("btn-import-url-submit").onclick = () => {
    const url = document.getElementById("import-url").value.trim();
    const category = document.getElementById("import-url-category").value.trim() || "imported";
    if (url) {
      importFromUrl(url, category);
    } else {
      alert("Please enter a valid URL.");
    }
  };

  // Browse & History Navigation & Listeners
  document.getElementById("btn-go-browse").onclick = () => {
    showView("view-browse");
    renderBrowseList();
  };

  document.getElementById("btn-go-history").onclick = () => {
    showView("view-history");
    renderHistoryList();
  };

  document.getElementById("btn-browse-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-history-back").onclick = () => showView("view-dashboard");

  // Browse selection change filters
  document.querySelectorAll("#browse-lang-selector .lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#browse-lang-selector .lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderBrowseList();
    };
  });

  document.getElementById("select-browse-category").onchange = () => {
    renderBrowseList();
  };
});

// Render the completed sessions in history list
function renderHistoryList() {
  const container = document.getElementById("history-sessions-list");
  container.innerHTML = "";
  
  if (!state.history || state.history.length === 0) {
    container.innerHTML = `<li class="empty-state">No completed tests yet. Start learning to record history!</li>`;
    return;
  }

  state.history.slice().reverse().forEach(session => {
    const li = document.createElement("li");
    li.style.flexDirection = "column";
    li.style.alignItems = "stretch";
    li.style.gap = "4px";
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-weight:700;">
        <span>📅 ${session.date} (${session.lang})</span>
        <span style="color:var(--accent-color);">+${session.xp} XP</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-secondary);">
        <span>Pocket: ${session.category}</span>
        <span>Accuracy: ${session.accuracy}% (${session.correct}/${session.total})</span>
      </div>
    `;
    container.appendChild(li);
  });
}

// Render the vocabulary list browser
function renderBrowseList() {
  const container = document.getElementById("browse-words-list");
  container.innerHTML = "";

  const activeLangBtn = document.querySelector("#browse-lang-selector .lang-btn.active");
  const selectedLang = activeLangBtn ? activeLangBtn.dataset.lang : "en";
  const selectedCategory = document.getElementById("select-browse-category").value;

  // Gather pool
  const base = state.baseLang || "en";
  const starters = STARTER_VOCAB_RAW.map(item => ({
    en: item[base],
    target: item[selectedLang],
    category: item.category,
    image: item.image,
    details: item.details
  }));
  
  const customs = state.customVocab.filter(v => v.lang === selectedLang);
  let pool = [...starters, ...customs];

  if (selectedCategory !== "all") {
    pool = pool.filter(v => v.category === selectedCategory);
  }

  document.getElementById("browse-list-title").textContent = `Vocabulary List (${pool.length} words)`;

  if (pool.length === 0) {
    container.innerHTML = `<li class="empty-state">No words available in this language and category pocket.</li>`;
    return;
  }

  pool.forEach(vocab => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <span class="list-word">${vocab.en}</span>
        <span class="list-translation"> &rarr; ${vocab.target}</span>
      </div>
      <span class="category-tag" style="margin: 0; font-size:0.75rem; padding: 2px 8px;">${vocab.category}</span>
    `;
    container.appendChild(li);
  });
}

// ==========================================
// 9. Word Details & AI/Web Lookups
// ==========================================
function setupWordDetails(currentWord) {
  const container = document.getElementById("word-details-container");
  const showBtn = document.getElementById("btn-show-details");
  const aiBtn = document.getElementById("btn-get-ai-details");
  const aiLoading = document.getElementById("ai-details-loading");
  const aiResponse = document.getElementById("ai-details-response");

  // Reset display states
  container.style.display = "none";
  showBtn.textContent = "ℹ️ Show Details";
  aiResponse.style.display = "none";
  aiLoading.style.display = "none";

  // Show Details Toggle
  showBtn.onclick = () => {
    if (container.style.display === "none") {
      container.style.display = "block";
      showBtn.textContent = "🙈 Hide Details";
    } else {
      container.style.display = "none";
      showBtn.textContent = "ℹ️ Show Details";
    }
  };

  const details = currentWord.details;
  const base = state.baseLang || "en";
  const lang = state.selectedLang;

  // Populate base and target text
  const baseWordEl = document.getElementById("detail-base-word");
  const targetWordEl = document.getElementById("detail-target-word");
  if (baseWordEl) baseWordEl.textContent = currentWord.en;
  if (targetWordEl) targetWordEl.textContent = currentWord.target;

  // Speak Base & Target handlers
  const speakBaseBtn = document.getElementById("btn-speak-detail-base");
  const speakTargetBtn = document.getElementById("btn-speak-detail-target");
  if (speakBaseBtn) {
    speakBaseBtn.onclick = () => speakWord(currentWord.en, base, 1.0);
  }
  if (speakTargetBtn) {
    speakTargetBtn.onclick = () => speakWord(currentWord.target, lang, 1.0);
  }

  const articlesEl = document.getElementById("detail-articles");
  const sentenceEl = document.getElementById("detail-sentence");
  const sentenceTransEl = document.getElementById("detail-sentence-translation");
  const variationsEl = document.getElementById("detail-variations");
  const synonymsEl = document.getElementById("detail-synonyms");

  const sectionArticles = articlesEl ? articlesEl.parentElement : null;
  const sectionSentence = sentenceEl ? sentenceEl.parentElement : null;
  const sectionVariations = variationsEl ? variationsEl.parentElement : null;
  const sectionSynonyms = synonymsEl ? synonymsEl.parentElement : null;

  if (details) {
    // 1. Articles
    const art = details.articles && details.articles[lang] ? details.articles[lang] : "";
    if (art && sectionArticles) {
      sectionArticles.style.display = "block";
      articlesEl.innerHTML = `Article in <strong>${lang.toUpperCase()}</strong>: <span class="badge" style="background:var(--accent-color); padding: 4px 8px; border-radius: 6px; font-weight: bold; color: #0b0c10;">${art}</span>`;
    } else if (sectionArticles) {
      sectionArticles.style.display = "none";
    }

    // 2. Sentences
    const baseSentence = details.sentences && details.sentences[base] ? details.sentences[base] : "";
    const targetSentence = details.sentences && details.sentences[lang] ? details.sentences[lang] : "";
    if (baseSentence && sectionSentence) {
      sectionSentence.style.display = "block";
      sentenceEl.textContent = `"${baseSentence}"`;
      sentenceTransEl.textContent = targetSentence ? `→ "${targetSentence}"` : "";
    } else if (sectionSentence) {
      sectionSentence.style.display = "none";
    }

    // 3. Variations
    let variationsHtml = "";
    if (details.variations) {
      if (details.variations.plural && details.variations.plural[lang]) {
        const basePlural = details.variations.plural[base] || details.variations.plural.en || "";
        variationsHtml += `Plural: <strong>${basePlural}</strong> &rarr; <strong>${details.variations.plural[lang]}</strong><br>`;
      }
      if (details.variations.he && details.variations.he[lang]) {
        const baseHe = details.variations.he[base] || details.variations.he.en || "";
        variationsHtml += `Conjugation (He/She): <strong>${baseHe}</strong> &rarr; <strong>${details.variations.he[lang]}</strong>`;
      }
    }
    if (variationsHtml && sectionVariations) {
      sectionVariations.style.display = "block";
      variationsEl.innerHTML = variationsHtml;
    } else if (sectionVariations) {
      sectionVariations.style.display = "none";
    }

    // 4. Synonyms
    const targetSyns = (details.synonyms && details.synonyms[lang]) ? details.synonyms[lang] : [];
    const baseSyns = (details.synonyms && details.synonyms[base]) ? details.synonyms[base] : [];
    if (targetSyns && targetSyns.length > 0 && sectionSynonyms) {
      sectionSynonyms.style.display = "block";
      synonymsEl.innerHTML = targetSyns.map((syn, idx) => {
        const baseTrans = baseSyns[idx] ? ` (${baseSyns[idx]})` : "";
        return `<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${syn}${baseTrans}</code>`;
      }).join(", ");
    } else if (sectionSynonyms) {
      sectionSynonyms.style.display = "none";
    }
  } else {
    if (sectionArticles) sectionArticles.style.display = "none";
    if (sectionSentence) sectionSentence.style.display = "none";
    if (sectionVariations) sectionVariations.style.display = "none";
    if (sectionSynonyms) sectionSynonyms.style.display = "none";
  }

  // Ask AI / Web button action
  aiBtn.onclick = async () => {
    aiLoading.style.display = "block";
    aiResponse.style.display = "none";
    aiBtn.disabled = true;

    try {
      const promptText = `Explain the usage of the word "${currentWord.en}" and its translation "${currentWord.target}" in the language "${lang}". Provide articles, prepositions, example sentences, and cases (like plural, gender, etc.) if applicable. Keep it concise, helpful, and formatted clearly.`;

      let responseText = "";

      // Check keys
      if (state.geminiKey) {
        responseText = await callGeminiAPI(state.geminiKey, promptText);
      } else if (state.openaiKey) {
        responseText = await callOpenAIAPI(state.openaiKey, promptText);
      } else if (state.anthropicKey) {
        responseText = await callAnthropicAPI(state.anthropicKey, promptText);
      } else {
        responseText = await fetchWebDetailsFallback(currentWord.en, lang);
      }

      aiResponse.textContent = responseText;
      aiResponse.style.display = "block";
    } catch (err) {
      aiResponse.textContent = `Could not fetch more details: ${err.message}`;
      aiResponse.style.display = "block";
    } finally {
      aiLoading.style.display = "none";
      aiBtn.disabled = false;
    }
  };
}

async function callGeminiAPI(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) throw new Error("Gemini API request failed.");
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAIAPI(apiKey, prompt) {
  const url = "https://api.openai.com/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error("OpenAI API request failed.");
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropicAPI(apiKey, prompt) {
  const url = "https://api.anthropic.com/v1/messages";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error("Anthropic API request failed.");
  const data = await response.json();
  return data.content[0].text;
}

async function fetchWebDetailsFallback(word, targetLang) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error("Word not found in dictionary");
    const data = await res.json();
    
    const entry = data[0];
    const definition = entry.meanings[0].definitions[0].definition;
    const example = entry.meanings[0].definitions[0].example || "No example sentence available on web dictionary.";
    const partOfSpeech = entry.meanings[0].partOfSpeech;

    let defTranslation = "";
    try {
      const transRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(definition)}`);
      const transData = await transRes.json();
      defTranslation = ` (${transData[0][0][0]})`;
    } catch(e) {}

    return `[Web Dictionary Fallback]
Word: ${word} (${partOfSpeech})
Definition: ${definition}${defTranslation}
Example Usage: "${example}"`;

  } catch (err) {
    return `[Web Lookups]
Could not find dictionary details for "${word}".
You can read more directly on Wiktionary: https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  }
}

// ==========================================
// 10. Custom Modal Overlays (Alert & Confirm) & Global Click Sound
// ==========================================

// Global Sound Click Listener
document.addEventListener("click", (e) => {
  const target = e.target.closest("button, .btn, .lang-btn, .seg-btn, .nav-item, .word-bubble, input[type='file'], select");
  if (target) {
    playSound("sound-click");
  }
});

// Override window.alert globally
window.alert = function(message) {
  showCustomAlert(message);
};

function showCustomAlert(message) {
  const overlay = document.getElementById("custom-modal-overlay");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");

  // Play popup sound
  playSound("sound-popup");

  icon.textContent = "ℹ️";
  title.textContent = "Notice";
  msgEl.textContent = message;
  
  // Create OK button
  actions.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.className = "btn btn-primary";
  okBtn.textContent = "OK";
  okBtn.onclick = () => {
    overlay.classList.remove("active");
  };
  actions.appendChild(okBtn);

  overlay.classList.add("active");
}

function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("custom-modal-overlay");
    const icon = document.getElementById("modal-icon");
    const title = document.getElementById("modal-title");
    const msgEl = document.getElementById("modal-message");
    const actions = document.getElementById("modal-actions");

    // Play popup sound
    playSound("sound-popup");

    icon.textContent = "❓";
    title.textContent = "Confirm Action";
    msgEl.textContent = message;

    actions.innerHTML = "";

    // Cancel Button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => {
      overlay.classList.remove("active");
      resolve(false);
    };

    // Confirm Button
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = "Confirm";
    confirmBtn.onclick = () => {
      overlay.classList.remove("active");
      resolve(true);
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    overlay.classList.add("active");
  });
}
