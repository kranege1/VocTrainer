// ==========================================
// 1. Initial Starting Vocabulary Datasets
// ==========================================
const STARTER_VOCAB = {
  en: [ // English
    { en: "rennen", target: "to run", category: "verbs", image: "run,exercise" },
    { en: "sprechen", target: "to speak", category: "verbs", image: "speak,talking" },
    { en: "lernen", target: "to learn", category: "verbs", image: "book,studying" },
    { en: "Apfel", target: "apple", category: "nouns", image: "apple,fruit" },
    { en: "Brot", target: "bread", category: "nouns", image: "bread,food" },
    { en: "Computer", target: "computer", category: "technology", image: "computer,laptop" },
    { en: "Datenbank", target: "database", category: "technology", image: "database,server" },
    { en: "Zelle", target: "cell", category: "biology", image: "cell,biology" },
    { en: "Organismus", target: "organism", category: "biology", image: "nature,biology" },
    { en: "Wie geht es dir?", target: "how are you?", category: "phrases", image: "hello,friends" }
  ],
  de: [ // German
    { en: "to run", target: "rennen", category: "verbs", image: "run,exercise" },
    { en: "to speak", target: "sprechen", category: "verbs", image: "speak,talking" },
    { en: "to learn", target: "lernen", category: "verbs", image: "book,studying" },
    { en: "apple", target: "Apfel", category: "nouns", image: "apple,fruit" },
    { en: "bread", target: "Brot", category: "nouns", image: "bread,food" },
    { en: "computer", target: "Computer", category: "technology", image: "computer,laptop" },
    { en: "database", target: "Datenbank", category: "technology", image: "database,server" },
    { en: "cell", target: "Zelle", category: "biology", image: "cell,biology" },
    { en: "organism", target: "Organismus", category: "biology", image: "nature,biology" },
    { en: "How are you?", target: "Wie geht es dir?", category: "phrases", image: "hello,friends" }
  ],
  it: [ // Italiano
    { en: "to run", target: "correre", category: "verbs", image: "run,exercise" },
    { en: "to speak", target: "parlare", category: "verbs", image: "speak,talking" },
    { en: "to learn", target: "imparare", category: "verbs", image: "book,studying" },
    { en: "apple", target: "mela", category: "nouns", image: "apple,fruit" },
    { en: "bread", target: "pane", category: "nouns", image: "bread,food" },
    { en: "computer", target: "computer", category: "technology", image: "computer,laptop" },
    { en: "database", target: "database", category: "technology", image: "database,server" },
    { en: "cell", target: "cellula", category: "biology", image: "cell,biology" },
    { en: "organism", target: "organismo", category: "biology", image: "nature,biology" },
    { en: "How are you?", target: "Come stai?", category: "phrases", image: "hello,friends" }
  ],
  es: [ // Spanish
    { en: "to run", target: "correr", category: "verbs", image: "run,exercise" },
    { en: "to speak", target: "hablar", category: "verbs", image: "speak,talking" },
    { en: "to learn", target: "aprender", category: "verbs", image: "book,studying" },
    { en: "apple", target: "manzana", category: "nouns", image: "apple,fruit" },
    { en: "bread", target: "pan", category: "nouns", image: "bread,food" },
    { en: "computer", target: "computadora", category: "technology", image: "computer,laptop" },
    { en: "database", target: "base de datos", category: "technology", image: "database,server" },
    { en: "cell", target: "célula", category: "biology", image: "cell,biology" },
    { en: "organism", target: "organismo", category: "biology", image: "nature,biology" },
    { en: "How are you?", target: "¿Cómo estás?", category: "phrases", image: "hello,friends" }
  ],
  fr: [ // French
    { en: "to run", target: "courir", category: "verbs", image: "run,exercise" },
    { en: "to speak", target: "parler", category: "verbs", image: "speak,talking" },
    { en: "to learn", target: "apprendre", category: "verbs", image: "book,studying" },
    { en: "apple", target: "pomme", category: "nouns", image: "apple,fruit" },
    { en: "bread", target: "pain", category: "nouns", image: "bread,food" },
    { en: "computer", target: "ordinateur", category: "technology", image: "computer,laptop" },
    { en: "database", target: "base de données", category: "technology", image: "database,server" },
    { en: "cell", target: "cellule", category: "biology", image: "cell,biology" },
    { en: "organism", target: "organisme", category: "biology", image: "nature,biology" },
    { en: "How are you?", target: "Comment ça va?", category: "phrases", image: "hello,friends" }
  ]
};

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
    audioEngine: state.audioEngine
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

    // Prefill Setup fields
    document.getElementById("setup-openai-key").value = state.openaiKey;
    document.getElementById("setup-grok-key").value = state.grokKey;
    document.getElementById("setup-gemini-key").value = state.geminiKey;
    document.getElementById("setup-anthropic-key").value = state.anthropicKey;
    document.getElementById("select-audio-engine").value = state.audioEngine;
  }
  updateHeaderUI();
  renderImportedList();
  renderMistakesList();
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
}

function updateHeaderUI() {
  document.getElementById("xp-count").textContent = state.xp;
  document.getElementById("streak-count").textContent = state.streak;
  document.getElementById("hearts-count").textContent = state.hearts;
  document.getElementById("level-badge").textContent = `Lvl ${state.level}`;
  document.getElementById("mistakes-badge").textContent = state.mistakes.length;
  document.getElementById("vault-count").textContent = state.mistakes.length;
}

// Sound effects helpers
function playSound(soundId) {
  const audio = document.getElementById(soundId);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log("Sound autoplay blocked by browser policy"));
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
    const starters = STARTER_VOCAB[language] || [];
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
  document.getElementById("btn-speak-prompt").onclick = () => speakWord(currentWord.en, "en", 1.0);
  document.getElementById("btn-speak-prompt-slow").onclick = () => speakWord(currentWord.en, "en", 0.5);

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

  // Reset inputs
  document.getElementById("input-typing-answer").value = "";
  document.getElementById("bubble-selected-zone").innerHTML = "";
  document.getElementById("speech-transcript").textContent = "...";
  
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

  const cleanAns = studentAnswer.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
  const cleanTarget = currentWord.target.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

  const isCorrect = cleanAns === cleanTarget;
  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");

  if (isCorrect) {
    playSound("sound-correct");
    overlay.className = "feedback-overlay active correct-ans";
    fTitle.textContent = "Correct!";
    fIcon.textContent = "🎉";
    fDesc.textContent = `Excellent job! "${currentWord.en}" is indeed "${currentWord.target}".`;
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
    
    state.hearts = Math.max(0, state.hearts - 1);
    if (state.hearts === 0) {
      alert("No hearts left! Session ended.");
      state.hearts = 5; 
      showView("view-dashboard");
      return;
    }
  }

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
  saveState();

  const accuracy = Math.round((tState.correctCount / tState.totalOriginalCount) * 100);
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
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Navigation Links
  document.getElementById("btn-go-import").onclick = () => showView("view-import");
  document.getElementById("btn-go-mistakes").onclick = () => showView("view-mistakes");
  document.getElementById("btn-go-setup").onclick = () => showView("view-setup");
  
  document.getElementById("btn-import-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-mistakes-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-setup-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-report-home").onclick = () => showView("view-dashboard");
  
  document.getElementById("btn-quit-test").onclick = () => {
    if (confirm("Are you sure you want to quit this training session?")) {
      showView("view-dashboard");
    }
  };

  // Language selectors
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedLang = btn.dataset.lang;
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
});
