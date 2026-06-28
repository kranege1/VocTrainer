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
  baseLang: "en",
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
  deletedStarters: [], // Deleted starter vocab terms
  editedStarters: {}, // Edited starter vocab terms overrides
  customFolders: [], // Custom folder names
  wordStats: {}, // Spaced Repetition / Leitner stats: { wordEn: { attempts, errors, box, lastReview } }
  testDirection: "forward", // forward (base -> target) or reverse (target -> base)
  customVoices: {}, // Selected free local system voices for each language key: { en: "Voice Name", ... }

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
    history: state.history,
    deletedStarters: state.deletedStarters,
    editedStarters: state.editedStarters,
    customFolders: state.customFolders,
    wordStats: state.wordStats,
    testDirection: state.testDirection,
    customVoices: state.customVoices
  }));
  updateHeaderUI();
  populateCustomCategoryDropdown();
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
    state.deletedStarters = parsed.deletedStarters || [];
    state.editedStarters = parsed.editedStarters || {};
    state.customFolders = parsed.customFolders || [];
    state.wordStats = parsed.wordStats || {};
    state.testDirection = parsed.testDirection || "forward";
    state.customVoices = parsed.customVoices || {};

    // Prefill Setup fields
    document.getElementById("setup-openai-key").value = state.openaiKey;
    document.getElementById("setup-grok-key").value = state.grokKey;
    document.getElementById("setup-gemini-key").value = state.geminiKey;
    document.getElementById("setup-anthropic-key").value = state.anthropicKey;
    document.getElementById("select-audio-engine").value = state.audioEngine;
    document.getElementById("setup-allow-synonyms").checked = state.allowSynonyms;
    document.getElementById("setup-base-lang").value = state.baseLang;

    if (state.openaiKey) testApiKey("openai", state.openaiKey, "setup-openai-status");
    if (state.grokKey) testApiKey("grok", state.grokKey, "setup-grok-status");
    if (state.geminiKey) testApiKey("gemini", state.geminiKey, "setup-gemini-status");
    if (state.anthropicKey) testApiKey("anthropic", state.anthropicKey, "setup-anthropic-status");

    // Prefill dashboard buttons active state
    document.querySelectorAll(".lang-btn").forEach(b => {
      b.classList.remove("active");
      if (b.dataset.lang === state.selectedLang) b.classList.add("active");
    });

    document.querySelectorAll("#test-direction-selector .seg-btn").forEach(btn => {
      btn.classList.remove("active");
      if (btn.dataset.direction === state.testDirection) btn.classList.add("active");
    });
    updateDirectionButtonsUI();
    loadOnDeviceVoices();
  }
  updateHeaderUI();
  renderImportedList();
  renderMistakesList();
  renderHistoryList();
  populateCustomCategoryDropdown();
}

function populateCustomCategoryDropdown() {
  const dropdown = document.getElementById("select-custom-category");
  const browseDropdown = document.getElementById("select-browse-custom-category");
  
  const vocabCategories = state.customVocab.map(v => v.category).filter(Boolean);
  const combined = [...new Set([...vocabCategories, ...state.customFolders])];
  
  if (dropdown) {
    dropdown.innerHTML = '<option value="none">✨ -- Select Custom Set --</option>';
    combined.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = `👤 ${cat}`;
      dropdown.appendChild(opt);
    });
  }

  if (browseDropdown) {
    browseDropdown.innerHTML = '<option value="none">✨ -- Select Custom Set --</option>';
    combined.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = `👤 ${cat}`;
      browseDropdown.appendChild(opt);
    });
  }
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
    if (btn.dataset.view === viewId) {
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

// Speech Synthesis (TTS) with Enhanced voice picker for iOS/Browsers
function getBestVoice(langCode) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const targetLocale = (LANG_LOCALES[langCode] || "en-US").toLowerCase().replace('_', '-');
  
  const matchingVoices = voices.filter(v => {
    const vLang = v.lang.toLowerCase().replace('_', '-');
    return vLang === targetLocale || vLang.startsWith(targetLocale.split('-')[0]);
  });

  if (matchingVoices.length === 0) return null;

  // Prioritize premium Siri, Enhanced, Premium, and Google high-fidelity voices
  const enhanced = matchingVoices.find(v => 
    v.name.includes("Siri") || 
    v.name.includes("Enhanced") || 
    v.name.includes("Premium") || 
    v.name.includes("Google") || 
    v.name.includes("Samantha")
  );
  return enhanced || matchingVoices[0];
}

function speakWord(text, langCode, rate = 1.0) {
  if (state.audioEngine === "openai" && state.openaiKey) {
    speakOpenAI(text, rate);
    return;
  }
  
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_LOCALES[langCode] || "en-US";
    utterance.rate = rate; 
    
    let selectedVoice = null;
    const customVoiceName = state.customVoices?.[langCode];
    if (customVoiceName && customVoiceName !== "default") {
      const voices = window.speechSynthesis.getVoices();
      selectedVoice = voices.find(v => v.name === customVoiceName);
    }
    
    const finalVoice = selectedVoice || getBestVoice(langCode);
    if (finalVoice) {
      utterance.voice = finalVoice;
    }
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
      const hasKey = state.openaiKey || state.grokKey || state.geminiKey;
      if (hasKey) {
        const useAI = await showCustomConfirm("Could not identify words in the URL structure. Would you like AI to generate a training set of 12 vocabulary words based on the TOPIC of this URL?");
        if (useAI) {
          spinner.style.display = "block";
          spinner.querySelector("p").textContent = "AI is generating vocabulary list...";
          try {
            const prompt = `Based on the URL topic/context: "${url}", generate a list of 12 relevant vocabulary words in English and their translations in target language key "${state.selectedLang}".
            Output your response ONLY as a clean JSON array of objects, with keys "word" (English text) and "trans" (translation text). Do not wrap in markdown code blocks.
            Example: [{"word": "ticket", "trans": "Fahrkarte"}, ...]`;
            
            const resText = await callLLM(prompt);
            let parsed = [];
            try {
              const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
              parsed = JSON.parse(cleanJson);
            } catch (e) {
              throw new Error("AI returned malformed JSON response. Please try again.");
            }

            if (parsed.length > 0) {
              for (const item of parsed) {
                await addCustomWord(item.word.trim(), item.trans.trim(), state.selectedLang, category);
              }
              alert(`Successfully generated and imported ${parsed.length} vocabulary words with AI based on the URL context!`);
            } else {
              alert("AI could not generate words.");
            }
          } catch (err) {
            alert("AI Generation failed: " + err.message);
          } finally {
            spinner.style.display = "none";
            spinner.querySelector("p").textContent = "Scanning web page for words...";
          }
        }
      } else {
        alert("Could not automatically identify vocabularies. Try adding manually.");
      }
    }
  } catch (error) {
    spinner.style.display = "none";
    console.error(error);
    const hasKey = state.openaiKey || state.grokKey || state.geminiKey;
    if (hasKey) {
      const useAI = await showCustomConfirm("Error fetching URL (CORS limits). Since you have an API key configured, would you like AI to generate a training set of 12 vocabulary words based on the TOPIC of this URL?");
      if (useAI) {
        spinner.style.display = "block";
        spinner.querySelector("p").textContent = "AI is generating vocabulary list...";
        try {
          const prompt = `Based on the URL topic/context: "${url}", generate a list of 12 relevant vocabulary words in English and their translations in target language key "${state.selectedLang}".
          Output your response ONLY as a clean JSON array of objects, with keys "word" (English text) and "trans" (translation text). Do not wrap in markdown code blocks.
          Example: [{"word": "ticket", "trans": "Fahrkarte"}, ...]`;
          
          const resText = await callLLM(prompt);
          let parsed = [];
          try {
            const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
            parsed = JSON.parse(cleanJson);
          } catch (e) {
            throw new Error("AI returned malformed JSON response. Please try again.");
          }

          if (parsed.length > 0) {
            for (const item of parsed) {
              await addCustomWord(item.word.trim(), item.trans.trim(), state.selectedLang, category);
            }
            alert(`Successfully generated and imported ${parsed.length} vocabulary words with AI based on the URL context!`);
          } else {
            alert("AI could not generate words.");
          }
        } catch (err) {
          alert("AI Generation failed: " + err.message);
        } finally {
          spinner.style.display = "none";
          spinner.querySelector("p").textContent = "Scanning web page for words...";
        }
      }
    } else {
      alert("Error fetching or parsing the URL (CORS block). Try adding manually or configure an API key to enable AI topic generation.");
    }
  }
}

async function addCustomWord(english, translation, lang, category, imageUrl = "", audioBase64 = "") {
  const base = state.baseLang || "en";
  
  const newWord = {
    category: category || "imported",
    image: imageUrl || english,
    audio: audioBase64,
    details: {
      articles: {},
      sentences: {},
      variations: {},
      synonyms: { en: [], de: [], it: [], es: [], fr: [] }
    }
  };
  
  // Assign known values
  newWord[base] = english;
  newWord[lang] = translation;
  
  // Legacy fields fallback
  newWord.en = newWord.en || english;
  newWord.target = newWord.target || translation;
  newWord.lang = lang;

  state.customVocab.push(newWord);
  saveState();
  renderImportedList();

  // Backfill other languages asynchronously
  await fillMissingTranslations(newWord, base);
  
  // Re-save and refresh once complete
  saveState();
  renderImportedList();
  if (document.getElementById("view-browse").classList.contains("active")) {
    renderBrowseList();
  }
}

async function fillMissingTranslations(wordObj, sourceLang) {
  const langs = ["en", "de", "it", "es", "fr"];
  const sourceText = wordObj[sourceLang];
  if (!sourceText) return;

  const promises = langs.map(async (targetLang) => {
    if (wordObj[targetLang]) return; // Already populated
    
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=${sourceLang}|${targetLang}`);
      if (res.ok) {
        const data = await res.json();
        if (data.responseData && data.responseData.translatedText) {
          wordObj[targetLang] = data.responseData.translatedText.trim();
        }
      }
    } catch (err) {
      console.error(`Failed to backfill translation for ${targetLang}`, err);
    }
  });

  await Promise.all(promises);
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
function startTestSession(language, category, count, isMistakesOnly = false, customCategory = "none", direction = "forward") {
  let pool = [];
  
  if (isMistakesOnly) {
    pool = [...state.mistakes];
    // Filter out broken entries where question equals answer
    pool = pool.filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());
  } else if (customCategory !== "none") {
    const base = state.baseLang || "en";
    pool = state.customVocab
      .filter(v => v.category === customCategory)
      .filter(item => {
        // Skip words missing a proper translation in either base or target language
        return item[base] && item[language] && item[base].toLowerCase().trim() !== item[language].toLowerCase().trim();
      })
      .map(item => {
        const qText = item[base];
        const aText = item[language];
        return {
          en: direction === "reverse" ? aText : qText,
          target: direction === "reverse" ? qText : aText,
          category: item.category,
          image: item.image,
          details: item.details || {},
          answerLang: direction === "reverse" ? base : language,
          questionLang: direction === "reverse" ? language : base
        };
      });
  } else {
    const base = state.baseLang || "en";
    const starters = STARTER_VOCAB_RAW.map(item => {
      const origEn = item[base];
      const origTarget = item[language];
      
      if (state.deletedStarters.includes(origEn)) {
        return null;
      }
      
      let finalEn = origEn;
      let finalTarget = origTarget;
      if (state.editedStarters[origEn]) {
        finalEn = state.editedStarters[origEn].en || origEn;
        finalTarget = state.editedStarters[origEn].target || origTarget;
      }
      
      return {
        en: direction === "reverse" ? finalTarget : finalEn,
        target: direction === "reverse" ? finalEn : finalTarget,
        category: item.category,
        image: item.image,
        details: item.details,
        isStarter: true,
        origEn: origEn,
        answerLang: direction === "reverse" ? base : language,
        questionLang: direction === "reverse" ? language : base
      };
    }).filter(Boolean);
    
    const customs = state.customVocab
      .filter(item => item[base] && item[language] && item[base].toLowerCase().trim() !== item[language].toLowerCase().trim())
      .map(item => {
        const qText = item[base];
        const aText = item[language];
        return {
          en: direction === "reverse" ? aText : qText,
          target: direction === "reverse" ? qText : aText,
          category: item.category,
          image: item.image,
          details: item.details || {},
          answerLang: direction === "reverse" ? base : language,
          questionLang: direction === "reverse" ? language : base
        };
      });
    pool = [...starters, ...customs];
    
    // Filter out words where question and answer are identical (broken translations)
    pool = pool.filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());
    
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
  document.getElementById("btn-speak-prompt").onclick = () => speakWord(currentWord.en, currentWord.questionLang || state.baseLang || "en", 1.0);
  document.getElementById("btn-speak-prompt-slow").onclick = () => speakWord(currentWord.en, currentWord.questionLang || state.baseLang || "en", 0.5);

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

  shuffled.forEach((piece, index) => {
    const bubble = document.createElement("button");
    bubble.className = "word-bubble";
    bubble.textContent = piece;
    bubble.dataset.idx = index;
    
    bubble.onclick = () => {
      // Keep option button in the DOM layout, make invisible
      bubble.style.visibility = "hidden";
      bubble.style.pointerEvents = "none";

      // Create matching select block
      const selBubble = document.createElement("button");
      selBubble.className = "word-bubble";
      selBubble.textContent = piece;
      selBubble.onclick = () => {
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
    const tState = state.currentTest;
    const currentWord = tState.words[tState.index];
    const answerLang = currentWord?.answerLang || state.selectedLang;
    
    recognition.lang = LANG_LOCALES[answerLang] || "de-DE";
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

  // Use the actual answer language stored on the word (handles reverse direction correctly)
  const ansLang = currentWord.answerLang || state.selectedLang;

  // Strip articles
  const cleanAnsNoArticle = stripArticles(cleanAns, ansLang);
  const cleanTargetNoArticle = stripArticles(cleanTarget, ansLang);

  const isExactMatch = cleanAns === cleanTarget;
  const isCloseMatch = cleanAnsNoArticle === cleanTargetNoArticle;
  
  // Calculate Levenshtein distance for typos
  const dist = getLevenshteinDistance(cleanAnsNoArticle, cleanTargetNoArticle);
  const isTypo = dist > 0 && dist <= 2; 

  // Synonym verification - use the answer language for synonym lookup
  const syns = (currentWord.details && currentWord.details.synonyms && currentWord.details.synonyms[ansLang]) ? currentWord.details.synonyms[ansLang] : [];
  const cleanSyns = syns.map(s => {
    const sLower = s.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    return stripArticles(sLower, ansLang);
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

    // Spaced Repetition Stats: correct progression
    if (!state.wordStats[currentWord.en]) {
      state.wordStats[currentWord.en] = { attempts: 0, errors: 0, box: 1, lastReview: null };
    }
    const stats = state.wordStats[currentWord.en];
    stats.attempts = (stats.attempts || 0) + 1;
    stats.lastReview = Date.now();
    if (!stats.box) stats.box = 1;
    if (stats.box < 5) stats.box++;
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

    // Spaced Repetition Stats: incorrect penalty
    if (!state.wordStats[currentWord.en]) {
      state.wordStats[currentWord.en] = { attempts: 0, errors: 0, box: 1, lastReview: null };
    }
    const stats = state.wordStats[currentWord.en];
    stats.attempts = (stats.attempts || 0) + 1;
    stats.errors = (stats.errors || 0) + 1;
    stats.lastReview = Date.now();
    stats.box = 1; // Leitner penalty reset
  }

  setupWordDetails(currentWord);
  saveState();

  // Ensure Continue button is visible by scrolling overlay to bottom
  requestAnimationFrame(() => {
    const overlay = document.getElementById("feedback-overlay");
    if (overlay) {
      const nextBtn = document.getElementById("btn-next-question");
      if (nextBtn) nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
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
  document.getElementById("btn-go-api").onclick = () => showView("view-api");
  
  document.getElementById("btn-import-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-mistakes-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-setup-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-api-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-report-home").onclick = () => showView("view-dashboard");

  // Sidebar Nav Tab Event Listeners (Prompt to quit test session if active)
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const targetView = btn.dataset.view;
      
      const testView = document.getElementById("view-test");
      if (testView && testView.classList.contains("active")) {
        const quitConfirmed = await showCustomConfirm("Are you sure you want to quit this training session?");
        if (!quitConfirmed) {
          return;
        }
      }
      
      showView(targetView);
      
      if (targetView === "view-browse") {
        renderBrowseList();
      } else if (targetView === "view-mistakes") {
        renderMistakesList();
      } else if (targetView === "view-history") {
        renderHistoryList();
      } else if (targetView === "view-import") {
        renderImportedList();
      }
    };
  });
  
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
      updateDirectionButtonsUI();
    };
  });

  // Test direction selector binding
  document.querySelectorAll("#test-direction-selector .seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#test-direction-selector .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.testDirection = btn.dataset.direction;
      saveState();
    };
  });

  // Segmented control selectors (Word count)
  document.querySelectorAll(".segmented-control:not(#test-direction-selector) .seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".segmented-control:not(#test-direction-selector) .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  // Start learning session button
  document.getElementById("btn-start-session").onclick = () => {
    if (state.baseLang === state.selectedLang) {
      alert("Please select a target language to learn that is different from your base language.");
      return;
    }
    const activeSeg = document.querySelector(".segmented-control:not(#test-direction-selector) .seg-btn.active");
    const count = activeSeg ? parseInt(activeSeg.dataset.count) : 10;
    const category = document.getElementById("select-category").value;
    const customCategory = document.getElementById("select-custom-category").value;
    startTestSession(state.selectedLang, category, count, false, customCategory, state.testDirection);
  };

  // Sync category dropdowns: choosing custom clears standard, choosing standard clears custom
  const selectCategory = document.getElementById("select-category");
  const selectCustomCategory = document.getElementById("select-custom-category");
  if (selectCategory && selectCustomCategory) {
    selectCategory.onchange = () => {
      selectCustomCategory.value = "none";
    };
    selectCustomCategory.onchange = () => {
      if (selectCustomCategory.value !== "none") {
        selectCategory.value = "all";
      }
    };
  }

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

  // Setup Actions (App Preferences)
  document.getElementById("btn-save-setup").onclick = () => {
    state.audioEngine = document.getElementById("select-audio-engine").value;
    state.allowSynonyms = document.getElementById("setup-allow-synonyms").checked;
    state.baseLang = document.getElementById("setup-base-lang").value;
    
    // Save chosen custom free voices
    state.customVoices = {
      en: document.getElementById("voice-select-en").value,
      de: document.getElementById("voice-select-de").value,
      it: document.getElementById("voice-select-it").value,
      es: document.getElementById("voice-select-es").value,
      fr: document.getElementById("voice-select-fr").value
    };

    saveState();
    updateDirectionButtonsUI();
    alert("Application preferences saved!");
    showView("view-dashboard");
  };

  // API Key Actions
  document.getElementById("btn-save-api-keys").onclick = async () => {
    state.openaiKey = document.getElementById("setup-openai-key").value.trim();
    state.grokKey = document.getElementById("setup-grok-key").value.trim();
    state.geminiKey = document.getElementById("setup-gemini-key").value.trim();
    state.anthropicKey = document.getElementById("setup-anthropic-key").value.trim();
    
    saveState();

    // Run verification directly
    await Promise.all([
      testApiKey("openai", state.openaiKey, "setup-openai-status"),
      testApiKey("grok", state.grokKey, "setup-grok-status"),
      testApiKey("gemini", state.geminiKey, "setup-gemini-status"),
      testApiKey("anthropic", state.anthropicKey, "setup-anthropic-status")
    ]);

    alert("API configurations updated!");
    showView("view-dashboard");
  };

  // Live key input verification triggers
  const setupOpenAiInput = document.getElementById("setup-openai-key");
  const setupGrokInput = document.getElementById("setup-grok-key");
  const setupGeminiInput = document.getElementById("setup-gemini-key");
  const setupAnthropicInput = document.getElementById("setup-anthropic-key");

  if (setupOpenAiInput) {
    setupOpenAiInput.onchange = () => testApiKey("openai", setupOpenAiInput.value.trim(), "setup-openai-status");
  }
  if (setupGrokInput) {
    setupGrokInput.onchange = () => testApiKey("grok", setupGrokInput.value.trim(), "setup-grok-status");
  }
  if (setupGeminiInput) {
    setupGeminiInput.onchange = () => testApiKey("gemini", setupGeminiInput.value.trim(), "setup-gemini-status");
  }
  if (setupAnthropicInput) {
    setupAnthropicInput.onchange = () => testApiKey("anthropic", setupAnthropicInput.value.trim(), "setup-anthropic-status");
  }

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

  // Helper to load synonym data into editor inputs
  window.loadSynonymIntoEditor = function(en, de, it, es, fr, category) {
    document.getElementById("manual-lang-en").value = en;
    document.getElementById("manual-lang-de").value = de;
    document.getElementById("manual-lang-it").value = it;
    document.getElementById("manual-lang-es").value = es;
    document.getElementById("manual-lang-fr").value = fr;
    document.getElementById("manual-category").value = category;
    document.getElementById("manual-image-url").value = en;
    playSound("sound-click");
  };

  // Helper to save synonym directly
  window.addSynonymDirectly = function(en, de, it, es, fr, category) {
    const newWord = {
      en, de, it, es, fr,
      category: category || "imported",
      image: en,
      audio: "",
      details: {
        articles: {},
        sentences: {},
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      }
    };
    
    newWord.lang = state.selectedLang;
    newWord.target = newWord[state.selectedLang];

    state.customVocab.push(newWord);
    saveState();
    renderImportedList();
    alert(`Word "${en}" added directly to your custom set!`);
  };

  // AI translate, classify & suggest synonyms
  document.getElementById("btn-manual-ai-process").onclick = async () => {
    const word = document.getElementById("manual-input-word").value.trim();
    const lang = document.getElementById("manual-input-lang").value;
    const btn = document.getElementById("btn-manual-ai-process");

    if (!word) {
      alert("Please enter a word or phrase.");
      return;
    }

    const origText = btn.textContent;
    btn.textContent = "⏳ Analyzing & Translating with AI...";
    btn.disabled = true;

    try {
      const prompt = `Classify and translate the vocabulary word/phrase "${word}" written in input language key "${lang}".
      Output your response ONLY as a clean, parseable JSON object with the exact keys described below. Do not wrap in markdown code blocks. Do not write extra commentary.
      
      JSON schema:
      {
        "translations": {
          "en": "English translation",
          "de": "German translation",
          "it": "Italian translation",
          "es": "Spanish translation",
          "fr": "French translation"
        },
        "category": "nouns, verbs, adjectives, or phrases",
        "synonyms": [
          {
            "word": "Synonym word 1 in English",
            "category": "nouns, verbs, etc.",
            "translations": {
              "en": "English",
              "de": "German",
              "it": "Italian",
              "es": "Spanish",
              "fr": "French"
            }
          },
          {
            "word": "Synonym word 2 in English",
            "category": "nouns, verbs, etc.",
            "translations": {
              "en": "English",
              "de": "German",
              "it": "Italian",
              "es": "Spanish",
              "fr": "French"
            }
          }
        ]
      }`;

      const resText = await callLLM(prompt);
      let parsed;
      try {
        const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error("AI returned a non-JSON response. Please try again.");
      }

      if (parsed.translations) {
        document.getElementById("manual-lang-en").value = parsed.translations.en || "";
        document.getElementById("manual-lang-de").value = parsed.translations.de || "";
        document.getElementById("manual-lang-it").value = parsed.translations.it || "";
        document.getElementById("manual-lang-es").value = parsed.translations.es || "";
        document.getElementById("manual-lang-fr").value = parsed.translations.fr || "";
      }
      
      document.getElementById("manual-category").value = parsed.category || "nouns";
      document.getElementById("manual-image-url").value = parsed.translations?.en || word;

      const synContainer = document.getElementById("manual-synonyms-container");
      synContainer.innerHTML = "";

      if (parsed.synonyms && parsed.synonyms.length > 0) {
        parsed.synonyms.forEach(syn => {
          const t = syn.translations || {};
          const li = document.createElement("li");
          li.style.display = "flex";
          li.style.justifyContent = "space-between";
          li.style.alignItems = "center";
          li.style.padding = "10px 12px";
          li.style.background = "rgba(255,255,255,0.02)";
          li.style.border = "1px solid var(--border-color)";
          li.style.borderRadius = "10px";

          li.innerHTML = `
            <div style="text-align: left; flex: 1; padding-right: 8px;">
              <strong style="color: #fff;">${syn.word}</strong>
              <span class="category-tag" style="margin-left: 6px; font-size: 0.65rem; padding: 1px 4px;">${syn.category}</span>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                🇩🇪 ${t.de || '-'} | 🇮🇹 ${t.it || '-'} | 🇪🇸 ${t.es || '-'}
              </div>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem; width: auto; min-height: 28px;" onclick="window.loadSynonymIntoEditor('${(t.en || syn.word).replace(/'/g, "\\'")}', '${(t.de || '').replace(/'/g, "\\'")}', '${(t.it || '').replace(/'/g, "\\'")}', '${(t.es || '').replace(/'/g, "\\'")}', '${(t.fr || '').replace(/'/g, "\\'")}', '${(syn.category || 'nouns').replace(/'/g, "\\'")}')">📥 Load</button>
              <button class="btn btn-primary btn-sm" style="padding: 4px 8px; font-size: 0.75rem; width: auto; min-height: 28px;" onclick="window.addSynonymDirectly('${(t.en || syn.word).replace(/'/g, "\\'")}', '${(t.de || '').replace(/'/g, "\\'")}', '${(t.it || '').replace(/'/g, "\\'")}', '${(t.es || '').replace(/'/g, "\\'")}', '${(t.fr || '').replace(/'/g, "\\'")}', '${(syn.category || 'nouns').replace(/'/g, "\\'")}')">➕ Add</button>
            </div>
          `;
          synContainer.appendChild(li);
        });
      } else {
        synContainer.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">No synonyms returned by AI.</li>`;
      }
    } catch (err) {
      alert("Error processing word: " + err.message);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  };

  // Manual import submit action
  document.getElementById("btn-manual-submit").onclick = () => {
    const en = document.getElementById("manual-lang-en").value.trim();
    const de = document.getElementById("manual-lang-de").value.trim();
    const it = document.getElementById("manual-lang-it").value.trim();
    const es = document.getElementById("manual-lang-es").value.trim();
    const fr = document.getElementById("manual-lang-fr").value.trim();
    const category = document.getElementById("manual-category").value.trim() || "nouns";
    const imageUrl = document.getElementById("manual-image-url").value.trim();

    if (!en || !de || !it || !es || !fr) {
      alert("Please ensure all translation fields are filled before saving.");
      return;
    }

    const newWord = {
      en, de, it, es, fr,
      category,
      image: imageUrl || en,
      audio: currentRecordingBase64,
      details: {
        articles: {},
        sentences: {},
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      }
    };

    newWord.lang = state.selectedLang;
    newWord.target = newWord[state.selectedLang];

    state.customVocab.push(newWord);
    saveState();
    renderImportedList();

    // Reset inputs
    document.getElementById("manual-input-word").value = "";
    document.getElementById("manual-lang-en").value = "";
    document.getElementById("manual-lang-de").value = "";
    document.getElementById("manual-lang-it").value = "";
    document.getElementById("manual-lang-es").value = "";
    document.getElementById("manual-lang-fr").value = "";
    document.getElementById("manual-category").value = "";
    document.getElementById("manual-image-url").value = "";
    document.getElementById("manual-synonyms-container").innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">Enter a word above and run AI Translate to suggest synonyms.</li>`;
    currentRecordingBase64 = "";
    document.getElementById("btn-record-play").disabled = true;
    document.getElementById("record-status-text").textContent = "No audio recorded";

    alert("Word added successfully!");
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

  // Bulk Import Logic
  let parsedRows = [];

  const btnBulkPreview = document.getElementById("btn-bulk-preview");
  const btnBulkSwap = document.getElementById("btn-bulk-swap");
  const btnBulkConfirm = document.getElementById("btn-bulk-confirm");
  const bulkPreviewArea = document.getElementById("bulk-preview-area");
  const bulkTableBody = document.getElementById("bulk-preview-table-body");

  function parseBulkInput() {
    const text = document.getElementById("bulk-import-text").value;
    const sep = document.getElementById("bulk-separator").value;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    parsedRows = lines.map(line => {
      let word = line;
      let trans = "";
      
      let actualSep = null;
      if (sep === "auto") {
        const candidates = [",", ";", "\t", " - ", " – ", " — ", ":", "="];
        for (const c of candidates) {
          if (line.includes(c)) {
            actualSep = c;
            break;
          }
        }
      } else if (sep === "comma") actualSep = ",";
      else if (sep === "semicolon") actualSep = ";";
      else if (sep === "tab") actualSep = "\t";
      else if (sep === "hyphen") {
        if (line.includes(" - ")) actualSep = " - ";
        else if (line.includes(" – ")) actualSep = " – ";
        else if (line.includes(" — ")) actualSep = " — ";
        else if (line.includes("-")) actualSep = "-";
      }
      else if (sep === "colon") actualSep = ":";
      else if (sep === "equal") actualSep = "=";
      
      if (actualSep && sep !== "none") {
        const parts = line.split(actualSep);
        word = parts[0].trim();
        trans = parts.slice(1).join(actualSep).trim();
      }
      
      return { word, trans, active: true };
    });
    
    renderPreviewTable();
  }

  function renderPreviewTable() {
    bulkTableBody.innerHTML = "";
    
    if (parsedRows.length === 0) {
      bulkPreviewArea.style.display = "none";
      btnBulkSwap.style.display = "none";
      return;
    }
    
    bulkPreviewArea.style.display = "block";
    btnBulkSwap.style.display = "inline-flex";
    
    parsedRows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-color)";
      
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      
      tr.innerHTML = `
        <td style="padding: 8px;">
          <input type="text" value="${esc(row.word)}" class="custom-select" style="min-height:36px; padding:6px; font-size:0.85rem;" data-idx="${idx}" data-field="word">
        </td>
        <td style="padding: 8px;">
          <input type="text" value="${esc(row.trans)}" class="custom-select" placeholder="Type translation..." style="min-height:36px; padding:6px; font-size:0.85rem;" data-idx="${idx}" data-field="trans">
        </td>
        <td style="padding: 8px; text-align: center;">
          <input type="checkbox" ${row.active ? "checked" : ""} class="preview-chk" data-idx="${idx}" style="width:18px; height:18px; cursor:pointer;">
        </td>
      `;
      bulkTableBody.appendChild(tr);
    });

    bulkTableBody.querySelectorAll("input[type='text']").forEach(inp => {
      inp.oninput = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const field = e.target.dataset.field;
        if (parsedRows[idx]) {
          parsedRows[idx][field] = e.target.value;
        }
      };
    });

    bulkTableBody.querySelectorAll(".preview-chk").forEach(chk => {
      chk.onchange = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (parsedRows[idx]) {
          parsedRows[idx].active = e.target.checked;
        }
      };
    });
  }

  if (btnBulkPreview) {
    btnBulkPreview.onclick = parseBulkInput;
  }

  if (btnBulkSwap) {
    btnBulkSwap.onclick = () => {
      parsedRows = parsedRows.map(r => ({
        word: r.trans,
        trans: r.word,
        active: r.active
      }));
      renderPreviewTable();
    };
  }

  function executeBulkImport() {
    const lang = document.getElementById("bulk-lang").value;
    const cat = document.getElementById("bulk-category").value.trim() || "imported";
    let count = 0;
    
    parsedRows.forEach(row => {
      if (row.active && row.word.trim()) {
        addCustomWord(row.word.trim(), row.trans.trim(), lang, cat);
        count++;
      }
    });
    
    if (count > 0) {
      saveState();
      renderImportedList();
      alert(`Successfully imported ${count} custom words!`);
      document.getElementById("bulk-import-text").value = "";
      bulkPreviewArea.style.display = "none";
      btnBulkSwap.style.display = "none";
      parsedRows = [];
    } else {
      alert("No words selected to import.");
    }
  }

  if (btnBulkConfirm) {
    btnBulkConfirm.onclick = executeBulkImport;
  }
  const btnBulkConfirmTop = document.getElementById("btn-bulk-confirm-top");
  if (btnBulkConfirmTop) {
    btnBulkConfirmTop.onclick = executeBulkImport;
  }

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

  const selectBrowseCategory = document.getElementById("select-browse-category");
  const selectBrowseCustomCategory = document.getElementById("select-browse-custom-category");

  if (selectBrowseCategory && selectBrowseCustomCategory) {
    selectBrowseCategory.onchange = () => {
      selectBrowseCustomCategory.value = "none";
      renderBrowseList();
    };
    selectBrowseCustomCategory.onchange = () => {
      if (selectBrowseCustomCategory.value !== "none") {
        selectBrowseCategory.value = "all";
      }
      renderBrowseList();
    };
  }

  // Create folder listener
  const btnCreateFolder = document.getElementById("btn-create-folder");
  if (btnCreateFolder) {
    btnCreateFolder.onclick = () => {
      const overlay = document.getElementById("custom-modal-overlay");
      const icon = document.getElementById("modal-icon");
      const title = document.getElementById("modal-title");
      const msgEl = document.getElementById("modal-message");
      const actions = document.getElementById("modal-actions");

      playSound("sound-popup");

      icon.textContent = "📁";
      title.textContent = "Create New Folder";
      msgEl.innerHTML = `
        <div class="form-group" style="text-align: left; margin-top: 10px; width: 100%;">
          <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">Folder Name</label>
          <input type="text" id="create-folder-input" placeholder="e.g. Travel Words" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
        </div>
      `;

      actions.innerHTML = "";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => overlay.classList.remove("active");

      const createBtn = document.createElement("button");
      createBtn.className = "btn btn-primary";
      createBtn.textContent = "Create";
      createBtn.onclick = () => {
        const name = document.getElementById("create-folder-input").value.trim();
        if (!name) {
          alert("Folder name cannot be empty.");
          return;
        }
        
        if (!state.customFolders.includes(name)) {
          state.customFolders.push(name);
          saveState();
          renderBrowseList();
        } else {
          alert("A folder with this name already exists.");
        }
        overlay.classList.remove("active");
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(createBtn);
      overlay.classList.add("active");
    };
  }
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
  const selectedCustomCategory = document.getElementById("select-browse-custom-category") ? document.getElementById("select-browse-custom-category").value : "none";

  // Gather pool
  const base = state.baseLang || "en";
  let pool = [];

  if (selectedCustomCategory !== "none") {
    pool = state.customVocab
      .filter(v => v.category === selectedCustomCategory)
      .map(item => ({
        en: item[base] || item.en || item.target,
        target: item[selectedLang] || item.target,
        category: item.category,
        image: item.image,
        details: item.details || {}
      }));
  } else {
    const starters = STARTER_VOCAB_RAW.map(item => {
      const origEn = item[base];
      const origTarget = item[selectedLang];
      
      if (state.deletedStarters.includes(origEn)) {
        return null;
      }
      
      let finalEn = origEn;
      let finalTarget = origTarget;
      if (state.editedStarters[origEn]) {
        finalEn = state.editedStarters[origEn].en || origEn;
        finalTarget = state.editedStarters[origEn].target || origTarget;
      }
      
      return {
        en: finalEn,
        target: finalTarget,
        category: item.category,
        image: item.image,
        details: item.details,
        isStarter: true,
        origEn: origEn
      };
    }).filter(Boolean);
    
    const customs = state.customVocab.map(item => ({
      en: item[base] || item.en || item.target,
      target: item[selectedLang] || item.target || item.en,
      category: item.category,
      image: item.image,
      details: item.details || {}
    }));
    pool = [...starters, ...customs];

    if (selectedCategory !== "all") {
      pool = pool.filter(v => v.category === selectedCategory);
    }
  }

  // Render Spaced Repetition stats and folder lists
  renderFoldersList();
  renderBrowseStats(pool);

  document.getElementById("browse-list-title").textContent = `Vocabulary List (${pool.length} words)`;

  if (pool.length === 0) {
    container.innerHTML = `<li class="empty-state">No words available in this language and category pocket.</li>`;
    return;
  }

  pool.forEach(vocab => {
    const isCustom = !vocab.isStarter;
    const key = isCustom ? vocab.en : vocab.origEn;
    
    // Fetch Leitner / Spaced Repetition stats
    const stats = state.wordStats[vocab.en] || { attempts: 0, errors: 0, box: 1 };
    const box = stats.box || 1;
    const errors = stats.errors || 0;
    
    const boxLabels = {
      1: "🆕 Box 1",
      2: "📚 Box 2",
      3: "📈 Box 3",
      4: "⭐ Box 4",
      5: "🏆 Box 5"
    };
    
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.padding = "12px 16px";
    li.style.marginBottom = "8px";
    
    li.innerHTML = `
      <div style="flex: 1; text-align: left; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span class="list-word" style="font-weight: 700;">${vocab.en}</span>
        <span class="list-translation" style="color: var(--accent-color); font-weight: 500;">&rarr; ${vocab.target}</span>
        <span class="category-tag" style="margin: 0; font-size:0.7rem; padding: 2px 6px;">${vocab.category}</span>
        
        <!-- Leitner Spaced Repetition Level Badge -->
        <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); font-size:0.7rem; border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px;">${boxLabels[box]}</span>
        
        ${errors > 0 ? `<span style="font-size:0.7rem; color: var(--error-color); font-weight:600;">⚠️ ${errors} errors</span>` : ""}
      </div>
      <div style="display: flex; gap: 8px; flex-shrink: 0;">
        <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; min-height: 28px; border-radius: 8px; font-size: 0.8rem;" onclick="window.triggerEditWord('${key}', ${isCustom})">✏️ Edit</button>
        <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; min-height: 28px; border-radius: 8px; font-size: 0.8rem; color: var(--error-color); border-color: rgba(239, 71, 111, 0.2);" onclick="window.triggerDeleteWord('${key}', ${isCustom})">❌ Delete</button>
      </div>
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
  const qLang = currentWord.questionLang || state.baseLang || "en";
  const aLang = currentWord.answerLang || state.selectedLang;

  // Populate base and target text
  const baseWordEl = document.getElementById("detail-base-word");
  const targetWordEl = document.getElementById("detail-target-word");
  if (baseWordEl) baseWordEl.textContent = currentWord.en;
  if (targetWordEl) targetWordEl.textContent = currentWord.target;

  // Speak Base & Target handlers
  const speakBaseBtn = document.getElementById("btn-speak-detail-base");
  const speakTargetBtn = document.getElementById("btn-speak-detail-target");
  if (speakBaseBtn) {
    speakBaseBtn.onclick = () => speakWord(currentWord.en, qLang, 1.0);
  }
  if (speakTargetBtn) {
    speakTargetBtn.onclick = () => speakWord(currentWord.target, aLang, 1.0);
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

// Custom Modal Edit Dialog
function showCustomEditModal(key, currentWord, isCustom, selectedLang) {
  const overlay = document.getElementById("custom-modal-overlay");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");

  playSound("sound-popup");

  icon.textContent = "✏️";
  title.textContent = "Edit Word & Translation";
  
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  msgEl.innerHTML = `
    <div class="form-group" style="text-align: left; margin-top: 10px; width: 100%;">
      <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">Word (Base Language)</label>
      <input type="text" id="edit-modal-word" value="${esc(currentWord.en)}" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
    </div>
    <div class="form-group" style="text-align: left; margin-top: 12px; width: 100%;">
      <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">Translation (${selectedLang.toUpperCase()})</label>
      <input type="text" id="edit-modal-translation" value="${esc(currentWord.target)}" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
    </div>
  `;

  actions.innerHTML = "";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => {
    overlay.classList.remove("active");
  };

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Save Changes";
  saveBtn.onclick = () => {
    const newWord = document.getElementById("edit-modal-word").value.trim();
    const newTrans = document.getElementById("edit-modal-translation").value.trim();
    
    if (!newWord || !newTrans) {
      alert("Fields cannot be empty.");
      return;
    }

    if (isCustom) {
      state.customVocab = state.customVocab.map(v => {
        if (v.en === key) {
          return { ...v, en: newWord, target: newTrans };
        }
        return v;
      });
    } else {
      state.editedStarters[key] = { en: newWord, target: newTrans };
    }

    saveState();
    renderBrowseList();
    overlay.classList.remove("active");
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  overlay.classList.add("active");
}

window.triggerDeleteWord = async function(key, isCustom) {
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete "${key}"?`);
  if (!confirmDel) return;

  if (isCustom) {
    state.customVocab = state.customVocab.filter(v => v.en !== key);
  } else {
    if (!state.deletedStarters.includes(key)) {
      state.deletedStarters.push(key);
    }
  }
  saveState();
  renderBrowseList();
};

window.triggerEditWord = function(key, isCustom) {
  let currentWord = null;
  const activeLangBtn = document.querySelector("#browse-lang-selector .lang-btn.active");
  const selectedLang = activeLangBtn ? activeLangBtn.dataset.lang : "de";

  if (isCustom) {
    currentWord = state.customVocab.find(v => v.en === key);
  } else {
    const base = state.baseLang || "en";
    const item = STARTER_VOCAB_RAW.find(v => v[base] === key);
    if (item) {
      let finalEn = key;
      let finalTarget = item[selectedLang];
      if (state.editedStarters[key]) {
        finalEn = state.editedStarters[key].en || key;
        finalTarget = state.editedStarters[key].target || finalTarget;
      }
      currentWord = { en: finalEn, target: finalTarget };
    }
  }

  if (currentWord) {
    showCustomEditModal(key, currentWord, isCustom, selectedLang);
  }
};

// API Key Validation Helper
async function testApiKey(engine, key, statusElId) {
  const statusEl = document.getElementById(statusElId);
  if (!statusEl) return;

  if (!key) {
    statusEl.innerHTML = "";
    return;
  }

  statusEl.innerHTML = `<span style="color: var(--text-secondary);">⏳ Verifying API key...</span>`;

  try {
    let url = "";
    let headers = {};

    if (engine === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { "Authorization": `Bearer ${key}` };
    } else if (engine === "grok") {
      url = "https://api.x.ai/v1/models";
      headers = { "Authorization": `Bearer ${key}` };
    } else if (engine === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    } else if (engine === "anthropic") {
      if (!key.startsWith("sk-ant-")) {
        statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Invalid format (must start with sk-ant-)</span>`;
        return;
      }
      statusEl.innerHTML = `<span style="color: #4cc9f0;">⚠️ Cannot verify directly in browser (CORS). Format looks valid!</span>`;
      return;
    }

    const res = await fetch(url, { headers });
    if (res.ok) {
      statusEl.innerHTML = `<span style="color: #4CAF50;">✅ Key is working & valid!</span>`;
    } else {
      let errMsg = "Invalid credentials";
      try {
        const errData = await res.json();
        errMsg = errData.error?.message || errData.error || errMsg;
      } catch (e) {}
      statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Failed: ${errMsg}</span>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Network error: ${err.message}</span>`;
  }
}

// Folders Management Render list
function renderFoldersList() {
  const container = document.getElementById("browse-folders-list");
  if (!container) return;
  
  container.innerHTML = "";
  
  const vocabCategories = state.customVocab.map(v => v.category).filter(Boolean);
  const combined = [...new Set([...vocabCategories, ...state.customFolders])];
  
  if (combined.length === 0) {
    container.innerHTML = `<li class="empty-state">No custom folders created yet.</li>`;
    return;
  }
  
  combined.forEach(folder => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.padding = "10px 14px";
    li.style.marginBottom = "6px";
    li.style.background = "rgba(255,255,255,0.02)";
    li.style.borderRadius = "10px";
    li.style.border = "1px solid var(--border-color)";
    
    const count = state.customVocab.filter(v => v.category === folder).length;
    
    li.innerHTML = `
      <div style="flex: 1; text-align: left;">
        <span style="font-weight: 700; color: #fff;">📁 ${folder}</span>
        <span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 8px;">(${count} words)</span>
      </div>
      <div style="display: flex; gap: 8px; flex-shrink: 0;">
        <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; min-height: 28px; border-radius: 8px; font-size: 0.75rem; width: auto;" onclick="window.triggerRenameFolder('${folder.replace(/'/g, "\\'")}')">✏️ Rename</button>
        <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; min-height: 28px; border-radius: 8px; font-size: 0.75rem; color: var(--error-color); border-color: rgba(239, 71, 111, 0.2); width: auto;" onclick="window.triggerDeleteFolder('${folder.replace(/'/g, "\\'")}')">❌ Delete</button>
      </div>
    `;
    
    container.appendChild(li);
  });
}

// Global Folder Actions
window.triggerRenameFolder = async function(oldName) {
  const overlay = document.getElementById("custom-modal-overlay");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");

  playSound("sound-popup");

  icon.textContent = "✏️";
  title.textContent = "Rename Folder";
  msgEl.innerHTML = `
    <div class="form-group" style="text-align: left; margin-top: 10px; width: 100%;">
      <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">New Folder Name</label>
      <input type="text" id="rename-folder-input" value="${oldName.replace(/"/g, '&quot;')}" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
    </div>
  `;

  actions.innerHTML = "";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => overlay.classList.remove("active");

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Rename";
  saveBtn.onclick = () => {
    const newName = document.getElementById("rename-folder-input").value.trim();
    if (!newName) {
      alert("Folder name cannot be empty.");
      return;
    }
    
    state.customFolders = state.customFolders.map(f => f === oldName ? newName : f);
    if (!state.customFolders.includes(newName)) {
      state.customFolders.push(newName);
    }
    state.customFolders = state.customFolders.filter(f => f !== oldName);

    state.customVocab = state.customVocab.map(v => {
      if (v.category === oldName) {
        return { ...v, category: newName };
      }
      return v;
    });

    saveState();
    renderBrowseList();
    overlay.classList.remove("active");
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  overlay.classList.add("active");
};

window.triggerDeleteFolder = async function(folderName) {
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete the folder "${folderName}"? All words inside this folder will also be deleted!`);
  if (!confirmDel) return;

  state.customFolders = state.customFolders.filter(f => f !== folderName);
  state.customVocab = state.customVocab.filter(v => v.category !== folderName);

  saveState();
  renderBrowseList();
};

// Spaced Repetition stats computation
function renderBrowseStats(pool) {
  const accuracyEl = document.getElementById("browse-stats-accuracy");
  const masteryEl = document.getElementById("browse-stats-mastery");
  const bar = document.getElementById("leitner-bar");
  const hardestList = document.getElementById("browse-hardest-words-list");
  
  if (!accuracyEl || !masteryEl || !bar || !hardestList) return;

  let totalAttempts = 0;
  let totalErrors = 0;
  let boxCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let hardest = [];

  pool.forEach(word => {
    const stats = state.wordStats[word.en] || { attempts: 0, errors: 0, box: 1 };
    totalAttempts += stats.attempts || 0;
    totalErrors += stats.errors || 0;
    
    const box = stats.box || 1;
    boxCounts[box] = (boxCounts[box] || 0) + 1;

    if (stats.errors && stats.errors > 0) {
      hardest.push({ en: word.en, target: word.target, errors: stats.errors });
    }
  });

  if (totalAttempts > 0) {
    const accuracy = Math.round(((totalAttempts - totalErrors) / totalAttempts) * 100);
    accuracyEl.textContent = `${accuracy}%`;
    accuracyEl.style.color = accuracy >= 80 ? "#2ecc71" : accuracy >= 50 ? "#ff9f43" : "#ff4b4b";
  } else {
    accuracyEl.textContent = "N/A";
    accuracyEl.style.color = "var(--text-secondary)";
  }

  const totalWords = pool.length;
  if (totalWords > 0) {
    const masteredCount = (boxCounts[4] || 0) + (boxCounts[5] || 0);
    const masteryPct = Math.round((masteredCount / totalWords) * 100);
    masteryEl.textContent = `${masteryPct}%`;
  } else {
    masteryEl.textContent = "N/A";
  }

  bar.innerHTML = "";
  if (totalWords > 0) {
    const p1 = (boxCounts[1] / totalWords) * 100;
    const p2 = (boxCounts[2] / totalWords) * 100;
    const p3 = (boxCounts[3] / totalWords) * 100;
    const p4 = (boxCounts[4] / totalWords) * 100;
    const p5 = (boxCounts[5] / totalWords) * 100;

    bar.innerHTML = `
      <div style="width: ${p1}%; background: #ff4b4b; height: 100%; transition: width 0.3s;" title="Box 1: ${boxCounts[1]} words"></div>
      <div style="width: ${p2}%; background: #ff9f43; height: 100%; transition: width 0.3s;" title="Box 2: ${boxCounts[2]} words"></div>
      <div style="width: ${p3}%; background: #f1c40f; height: 100%; transition: width 0.3s;" title="Box 3: ${boxCounts[3]} words"></div>
      <div style="width: ${p4}%; background: #2ecc71; height: 100%; transition: width 0.3s;" title="Box 4: ${boxCounts[4]} words"></div>
      <div style="width: ${p5}%; background: #00b894; height: 100%; transition: width 0.3s;" title="Box 5: ${boxCounts[5]} words"></div>
    `;
  }

  hardestList.innerHTML = "";
  if (hardest.length > 0) {
    hardest.sort((a, b) => b.errors - a.errors);
    const top3 = hardest.slice(0, 3);
    top3.forEach(w => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${w.en}</strong> (${w.target}) &mdash; <span style="color:var(--error-color); font-weight:600;">${w.errors} errors</span>`;
      hardestList.appendChild(li);
    });
  } else {
    hardestList.innerHTML = `<li style="list-style:none; margin-left:-18px; color:var(--text-secondary);">No errors recorded yet! Keep it up.</li>`;
  }
}

// Unified LLM Requester Helper (Gemini, OpenAI, Grok)
async function callLLM(prompt, systemInstruction = "You are a helpful language translation assistant.") {
  let key = "";
  let url = "";
  let headers = {};
  let body = {};
  
  if (state.geminiKey) {
    key = state.geminiKey;
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    headers = { "Content-Type": "application/json" };
    body = {
      contents: [{ parts: [{ text: `${systemInstruction}\n\nUser request:\n${prompt}` }] }]
    };
  } else if (state.openaiKey) {
    key = state.openaiKey;
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    };
  } else if (state.grokKey) {
    key = state.grokKey;
    url = "https://api.x.ai/v1/chat/completions";
    headers = {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    body = {
      model: await getGrokModel(key),
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    };
  } else if (state.anthropicKey) {
    // Fallback or warning if they only have Anthropic (blocked by CORS client-side)
    throw new Error("Anthropic API calls cannot be performed directly from browser client-side due to CORS limitations. Please configure Gemini or OpenAI key.");
  } else {
    throw new Error("No API Key configured. Please go to Setup & API to configure one.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.error || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  if (state.geminiKey) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    return data.choices?.[0]?.message?.content || "";
  }
}

// Update direction button labels dynamically based on selected base and target languages
function updateDirectionButtonsUI() {
  const btnForward = document.getElementById("btn-direction-forward");
  const btnReverse = document.getElementById("btn-direction-reverse");
  if (!btnForward || !btnReverse) return;

  const baseLang = state.baseLang || "en";
  const targetLang = state.selectedLang || "de";

  const flags = {
    en: "🇬🇧",
    de: "🇩🇪",
    it: "🇮🇹",
    es: "🇪🇸",
    fr: "🇫🇷"
  };

  const names = {
    en: "English",
    de: "German",
    it: "Italian",
    es: "Spanish",
    fr: "French"
  };

  const baseFlag = flags[baseLang] || "🌐";
  const baseName = names[baseLang] || baseLang.toUpperCase();
  const targetFlag = flags[targetLang] || "🌐";
  const targetName = names[targetLang] || targetLang.toUpperCase();

  btnForward.innerHTML = `➡️ ${baseFlag} ${baseName} &rarr; ${targetFlag} ${targetName}`;
  btnReverse.innerHTML = `⬅️ ${targetFlag} ${targetName} &rarr; ${baseFlag} ${baseName}`;
}

// Dynamically fetch available models from xAI to prevent model not found errors
async function getGrokModel(key) {
  try {
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        // Find the first model that contains "grok" (preferring chat/text models)
        const found = data.data.find(m => m.id.toLowerCase().includes("grok") && !m.id.toLowerCase().includes("vision") && !m.id.toLowerCase().includes("imagine"));
        if (found) return found.id;
      }
    }
  } catch (e) {
    console.error("Failed to dynamically resolve grok models:", e);
  }
  return "grok-beta"; // Fallback to grok-beta if listing models fails
}

// Load and populate on-device free voices
function loadOnDeviceVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const langs = ["en", "de", "it", "es", "fr"];

  langs.forEach(lang => {
    const select = document.getElementById(`voice-select-${lang}`);
    if (!select) return;

    const previousValue = select.value || state.customVoices?.[lang] || "default";
    select.innerHTML = "";

    // Default option
    const defOpt = document.createElement("option");
    defOpt.value = "default";
    defOpt.textContent = "Automatic / Best Match";
    select.appendChild(defOpt);

    const targetLocale = (LANG_LOCALES[lang] || "en-US").toLowerCase().replace('_', '-');
    
    const matching = voices.filter(v => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang === targetLocale || vLang.startsWith(targetLocale.split('-')[0]);
    });

    matching.forEach(voice => {
      const opt = document.createElement("option");
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      select.appendChild(opt);
    });

    // Re-select active choice
    select.value = previousValue;
  });
}

// Test speech synthesizer voice selection
window.testSelectedVoice = function(lang) {
  if (!('speechSynthesis' in window)) {
    alert("Speech synthesis is not supported on this browser.");
    return;
  }

  const select = document.getElementById(`voice-select-${lang}`);
  if (!select) return;

  const testPhrases = {
    en: "Hello! This is a test of your selected English voice.",
    de: "Hallo! Dies ist ein Test Ihrer ausgewählten deutschen Stimme.",
    it: "Ciao! Questo è un test della tua voce italiana selezionata.",
    es: "¡Hola! Esta es una prueba de tu voz en español seleccionada.",
    fr: "Bonjour! Ceci est un test de votre voix française sélectionnée."
  };

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(testPhrases[lang] || "Test");
  utterance.lang = LANG_LOCALES[lang] || "en-US";

  const selectedVoiceName = select.value;
  if (selectedVoiceName && selectedVoiceName !== "default") {
    const voices = window.speechSynthesis.getVoices();
    const found = voices.find(v => v.name === selectedVoiceName);
    if (found) utterance.voice = found;
  } else {
    const best = getBestVoice(lang);
    if (best) utterance.voice = best;
  }

  window.speechSynthesis.speak(utterance);
};

// Bind speech voices updated events
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    loadOnDeviceVoices();
  };
}

