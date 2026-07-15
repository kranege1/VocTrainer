// ==========================================
// 1. Initial Starting Vocabulary Datasets
// ==========================================
let STARTER_VOCAB_RAW = [];

// Asynchronously load starter vocabularies from a single unified JSON file
async function loadStarterVocab() {
  try {
    const res = await fetch("vocab/vocab.json");
    if (res.ok) {
      const data = await res.json();
      STARTER_VOCAB_RAW = data.map(item => {
        if (item.languages) {
          const flatItem = { ...item };
          ['en', 'de', 'it', 'es', 'fr'].forEach(lang => {
            flatItem[lang] = item.languages[lang]?.word || "";
          });
          // Build details compatibility object dynamically
          flatItem.details = { articles: {}, sentences: {}, variations: { he: {} }, synonyms: {} };
          ['en', 'de', 'it', 'es', 'fr'].forEach(lang => {
            const lData = item.languages[lang];
            if (lData) {
              if (lData.article) flatItem.details.articles[lang] = lData.article;
              if (lData.sentence) flatItem.details.sentences[lang] = lData.sentence;
              if (lData.meanings) flatItem.details.synonyms[lang] = lData.meanings;
              if (lData.conjugations && lData.conjugations.present) {
                const p = lData.conjugations.present;
                flatItem.details.variations.he[lang] = p.he || p.er || p.il || p.lui || p.él || "";
              }
            }
          });
          return flatItem;
        }
        return item;
      });
      window.STARTER_VOCAB_RAW = STARTER_VOCAB_RAW;
    }
  } catch (e) {
    console.error("Failed to load starter vocab:", e);
  }
}

let FREQUENCY_LISTS = {};

async function loadFrequencyLists() {
  try {
    const res = await fetch("vocab/frequency_lists.json");
    if (res.ok) {
      const data = await res.json();
      FREQUENCY_LISTS = {};
      Object.keys(data).forEach(lang => {
        FREQUENCY_LISTS[lang] = new Set(data[lang].map(w => w.toLowerCase().trim()));
      });
    }
  } catch (e) {
    console.warn("Could not load frequency lists:", e);
  }
}

function isCommonWord(wordText, lang) {
  if (!wordText || !lang) return false;
  const clean = wordText.toLowerCase().trim();
  const item = STARTER_VOCAB_RAW.find(w => {
    if (w.languages && w.languages[lang]) {
      return w.languages[lang].word.toLowerCase().trim() === clean;
    }
    return w[lang] && w[lang].toLowerCase().trim() === clean;
  });
  if (item && item.languages && item.languages[lang]) {
    const rank = item.languages[lang].frequency_rank;
    return typeof rank === "number" && rank <= 500;
  }
  if (!FREQUENCY_LISTS[lang]) return false;
  const cleanStripped = stripArticles(wordText, lang).toLowerCase().trim();
  return FREQUENCY_LISTS[lang].has(cleanStripped);
}

// Central Dictionary caching & GTX translation utilities
async function translateTextGTX(text, fromLang, toLang) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(text)}`);
    if (res.ok) {
      const data = await res.json();
      return data[0].map(item => item[0]).join("");
    }
  } catch (e) {
    console.error("GTX translation failed:", e);
  }
  return text;
}

function getWordDetails(wordObj) {
  if (!wordObj) return { articles: {}, sentences: {}, variations: {}, synonyms: {} };
  const wordKey = wordObj.origEn || wordObj.en || "";
  
  // Try to find default details from STARTER_VOCAB_RAW database
  let starterDetails = { articles: {}, sentences: {}, variations: {}, synonyms: {} };
  if (wordKey && typeof STARTER_VOCAB_RAW !== "undefined") {
    const starter = STARTER_VOCAB_RAW.find(v => {
      return (v.en && v.en.toLowerCase() === wordKey.toLowerCase()) || 
             (v.origEn && v.origEn.toLowerCase() === wordKey.toLowerCase()) ||
             (v.de && v.de.toLowerCase() === wordKey.toLowerCase()) ||
             (v.it && v.it.toLowerCase() === wordKey.toLowerCase()) ||
             (v.es && v.es.toLowerCase() === wordKey.toLowerCase()) ||
             (v.fr && v.fr.toLowerCase() === wordKey.toLowerCase());
    });
    if (starter && starter.details) {
      // Create a copy to prevent mutation issues
      starterDetails = JSON.parse(JSON.stringify(starter.details));
    }
  }

  const localDetails = wordObj.details || starterDetails;
  
  if (wordKey && state.dictionaryCache && state.dictionaryCache[wordKey]) {
    return {
      ...localDetails,
      ...state.dictionaryCache[wordKey]
    };
  }
  return localDetails;
}

async function fetchAndCacheWordDetails(wordObj) {
  const wordKey = wordObj ? (wordObj.origEn || wordObj.en || "") : "";
  if (!wordKey) return;
  if (!state.dictionaryCache) state.dictionaryCache = {};
  if (state.dictionaryCache[wordKey] && state.dictionaryCache[wordKey].definitions) return state.dictionaryCache[wordKey];

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordKey)}`);
    if (!res.ok) throw new Error("Word not found in Free Dictionary API");
    const data = await res.json();
    const entry = data[0];

    const phonetics = entry.phonetics || [];
    const audioUrl = phonetics.find(p => p.audio)?.audio || "";
    const phoneticText = entry.phonetic || (phonetics.find(p => p.text)?.text || "");

    let targetPartOfSpeech = "";
    const category = (wordObj.category || "").toLowerCase();
    if (category === "verbs" || wordKey.toLowerCase().startsWith("to ")) {
      targetPartOfSpeech = "verb";
    } else if (category === "nouns" || category === "technology" || category === "biology") {
      targetPartOfSpeech = "noun";
    } else if (category === "adjectives") {
      targetPartOfSpeech = "adjective";
    }

    const enSyns = [];
    const enDefs = [];
    let enSentence = "";

    if (entry.meanings) {
      entry.meanings.forEach(m => {
        // Filter by Part of Speech if known to prevent noun/verb/adjective cross-contamination
        if (targetPartOfSpeech && m.partOfSpeech && m.partOfSpeech.toLowerCase() !== targetPartOfSpeech) {
          return;
        }
        if (m.synonyms) enSyns.push(...m.synonyms);
        if (m.definitions) {
          m.definitions.forEach(d => {
            if (d.definition) enDefs.push(d.definition);
            if (d.example && !enSentence) {
              enSentence = d.example;
            }
          });
        }
      });
    }

    const cacheEntry = {
      phonetic: phoneticText,
      audio: audioUrl,
      synonyms: { en: [...new Set(enSyns)].slice(0, 10) },
      definitions: { en: enDefs.slice(0, 5) },
      sentences: { en: enSentence },
      articles: {},
      variations: {}
    };

    state.dictionaryCache[wordKey] = cacheEntry;
    saveState();

    // Dynamically translate synonyms & sentences for DE, IT, ES, FR
    const targetLangs = ["de", "it", "es", "fr"];
    for (const lang of targetLangs) {
      if (enSentence) {
        cacheEntry.sentences[lang] = await translateTextGTX(enSentence, "en", lang);
      }
      if (cacheEntry.synonyms.en.length > 0) {
        cacheEntry.synonyms[lang] = await Promise.all(
          cacheEntry.synonyms.en.slice(0, 4).map(s => translateTextGTX(s, "en", lang))
        );
      }
    }

    saveState();

    // If active question is this word, refresh details panel
    if (state.currentTest && state.currentTest.words[state.currentTest.index]?.en === wordKey) {
      showWordDetails();
    }
  } catch (err) {
    console.warn("Free Dictionary API fetch failed:", err);
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

function getFlagHtml(lang) {
  const map = { en: "gb", de: "de", it: "it", es: "es", fr: "fr" };
  const code = map[lang] || "gb";
  return `<img src="https://flagcdn.com/16x12/${code}.png" width="16" height="12" alt="${lang}" data-lang="${lang}" class="flag-icon-tts" style="vertical-align: middle; margin-right: 4px; box-shadow: 0 0 2px rgba(0,0,0,0.5); cursor: pointer;" title="Click to listen">`;
}

function getLangColor(lang) {
  const colors = {
    de: "var(--lang-de, #4cc9f0)",
    it: "var(--lang-it, #ffb703)",
    es: "var(--lang-es, #2ec4b6)",
    fr: "var(--lang-fr, #b5179e)",
    en: "var(--lang-en, #ff0054)"
  };
  return colors[lang] || "var(--accent-color)";
}

// ==========================================
import { state, saveState, loadState, getFolderFullPath, updateCategoryCounts } from './modules/state.js';

// Temporal variables for custom recording
let mediaRecorder;
let audioChunks = [];
let currentRecordingBase64 = "";;

// ==========================================
// 3. UI Navigation & Helpers
// ==========================================
function showView(viewId) {
  if (typeof stopQuickTranslateSpeech === "function") {
    stopQuickTranslateSpeech();
  }

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

  if (viewId === "view-setup") {
    loadOnDeviceVoices();
    renderHistoryList();
    syncICloudFolder();
  } else if (viewId === "view-statistics") {
    renderStatisticsView();
  } else if (viewId === "view-browse") {
    renderBrowseList();
  } else if (viewId === "view-grammar") {
    loadGrammarGuide();
  } else if (viewId === "view-quick-translate") {
    setTimeout(() => {
      const selectEl = document.getElementById("quick-translate-lang");
      if (selectEl) {
        selectEl.value = state.quickTranslateLastLang || state.selectedLang || "en";
      }
      const display = document.getElementById("quick-translate-input-display");
      if (display) display.textContent = "...";
      const grid = document.getElementById("quick-translate-results");
      if (grid) grid.innerHTML = "";
      startQuickTranslateSpeech();
    }, 300);
  } else if (viewId === "view-conjugation-dashboard") {
    renderConjugationDashboard();
  } else if (viewId === "view-import") {
    populateManualCategoryDropdown();
  }
}

function populateManualCategoryDropdown() {
  const selectEl = document.getElementById("manual-category");
  if (!selectEl) return;
  
  const originalValue = selectEl.value;
  selectEl.innerHTML = "";
  
  // Standard categories
  const standardCats = ["verbs", "nouns", "technology", "biology", "phrases"];
  standardCats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1) + " (Standard)";
    selectEl.appendChild(opt);
  });
  
  // Custom folders
  const allFolders = state.customFolders || [];
  allFolders.forEach(folder => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name + " (Custom)";
    selectEl.appendChild(opt);
  });
  
  // Restore value or prefill from browse active folder
  if (originalValue && Array.from(selectEl.options).some(o => o.value === originalValue)) {
    selectEl.value = originalValue;
  } else if (state.selectedBrowseFolderId && Array.from(selectEl.options).some(o => o.value === state.selectedBrowseFolderId)) {
    selectEl.value = state.selectedBrowseFolderId;
  }
}

function mergeCustomVocab(incomingVocab, incomingDeleted) {
  if (!Array.isArray(incomingVocab)) return;
  if (!incomingDeleted) incomingDeleted = [];
  
  // 1. Merge the deleted tracking array
  incomingDeleted.forEach(incDel => {
    const exists = state.deletedCustomVocab.some(locDel => 
      locDel.category === incDel.category && 
      (locDel.en || "").toLowerCase() === (incDel.en || "").toLowerCase()
    );
    if (!exists) {
      state.deletedCustomVocab.push(incDel);
    } else {
      const locDelIndex = state.deletedCustomVocab.findIndex(locDel => 
        locDel.category === incDel.category && 
        (locDel.en || "").toLowerCase() === (incDel.en || "").toLowerCase()
      );
      if (locDelIndex !== -1 && incDel.lastUpdated > state.deletedCustomVocab[locDelIndex].lastUpdated) {
        state.deletedCustomVocab[locDelIndex].lastUpdated = incDel.lastUpdated;
      }
    }
  });

  // 2. Build map of local vocab for quick lookup
  const localMap = {};
  state.customVocab.forEach(item => {
    const key = `${item.category.toLowerCase()}|||${(item.en || "").toLowerCase()}`;
    localMap[key] = item;
  });

  // 3. Process incoming vocab items
  incomingVocab.forEach(incItem => {
    const key = `${incItem.category.toLowerCase()}|||${(incItem.en || "").toLowerCase()}`;
    const localItem = localMap[key];
    
    // Check if it was deleted locally/cloud
    const isDeletedLocally = state.deletedCustomVocab.some(del => 
      del.category === incItem.category && 
      (del.en || "").toLowerCase() === (incItem.en || "").toLowerCase() &&
      del.lastUpdated >= (incItem.lastUpdated || 0)
    );
    
    if (isDeletedLocally) {
      return;
    }
    
    if (localItem) {
      const incTime = incItem.lastUpdated || 0;
      const localTime = localItem.lastUpdated || 0;
      if (incTime > localTime) {
        Object.assign(localItem, incItem);
      }
    } else {
      state.customVocab.push(incItem);
    }
  });

  // 4. Remove local items marked as deleted
  state.customVocab = state.customVocab.filter(item => {
    const wasDeleted = state.deletedCustomVocab.some(del => 
      del.category === item.category && 
      (del.en || "").toLowerCase() === (item.en || "").toLowerCase() &&
      del.lastUpdated >= (item.lastUpdated || 0)
    );
    return !wasDeleted;
  });
}

// ==========================================
// 3a. Grammar Guide Integration
// ==========================================
let grammarGuideData = null;

function renderMarkdownToHtml(markdown) {
  let html = markdown;
  
  // Escape HTML characters
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Parse Headings
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  
  // Parse Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  
  // Parse Italics (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Parse horizontal rules
  html = html.replace(/^---\s*$/gm, "<hr style='border: none; border-top: 1px solid var(--border-color); margin: 24px 0;' />");

  // Parse paragraphs/lines (treating lines ending with two spaces as line breaks)
  const blocks = html.split("\n\n");
  const processedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return "";
    if (block.startsWith("<h") || block.startsWith("<hr")) {
      return block;
    }
    // Handle double-space line breaks
    const lines = block.split("\n").map(l => {
      if (l.endsWith("  ")) {
        return l.substring(0, l.length - 2) + "<br/>";
      }
      return l;
    }).join(" ");
    return `<p style="margin-bottom: 12px; color: var(--text-secondary);">${lines}</p>`;
  });
  
  return processedBlocks.join("\n");
}

async function loadGrammarGuide() {
  const container = document.getElementById("grammar-content");
  if (!container) return;

  if (grammarGuideData) {
    renderGrammarGuide(grammarGuideData);
    return;
  }

  try {
    const response = await fetch("vocab/Grammatikmerkblaetter.md");
    if (!response.ok) throw new Error("Failed to load grammar guide");
    
    grammarGuideData = await response.text();
    renderGrammarGuide(grammarGuideData);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--error-color); padding: 20px; text-align: center;">Error loading grammar guide: ${err.message}</div>`;
  }
}

function renderGrammarGuide(markdown, filterQuery = "") {
  const container = document.getElementById("grammar-content");
  if (!container) return;

  if (!markdown) {
    container.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 40px;">No grammar content available.</div>`;
    return;
  }

  let contentToRender = markdown;

  if (filterQuery.trim()) {
    const query = filterQuery.toLowerCase().trim();
    // Split by horizontal rules
    const sections = markdown.split(/\n---\n/);
    const matchedSections = sections.filter(sec => sec.toLowerCase().includes(query));
    
    if (matchedSections.length === 0) {
      container.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 40px;">No matching grammar sections found for "${filterQuery}".</div>`;
      return;
    }
    
    contentToRender = matchedSections.join("\n\n---\n\n");
  }

  container.innerHTML = renderMarkdownToHtml(contentToRender);
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

let currentSpeechIndex = 0;
let globalSpeechQueue = [];

function speakWordWithCallback(text, langCode, rate = 1.0, callback) {
  if (state.audioEngine === "openai" && state.openaiKey) {
    speakOpenAI(text, rate).finally(() => {
      if (callback) callback();
    });
    return;
  }
  
  if ('speechSynthesis' in window) {
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
    
    utterance.onend = () => {
      if (callback) callback();
    };
    utterance.onerror = () => {
      if (callback) callback();
    };
    window.speechSynthesis.speak(utterance);
  } else {
    if (callback) callback();
  }
}

let currentQueueId = 0;

function playNextInQueue(queueId) {
  if (queueId !== currentQueueId) return;
  const overlay = document.getElementById("conjugation-speech-overlay");
  
  if (currentSpeechIndex >= globalSpeechQueue.length) {
    globalSpeechQueue = [];
    currentSpeechIndex = 0;
    if (overlay) overlay.style.display = "none";
    return;
  }
  
  const chunk = globalSpeechQueue[currentSpeechIndex];
  currentSpeechIndex++;
  
  if (overlay) {
    if (chunk.showOverlay) {
      overlay.style.display = "flex";
      document.getElementById("cso-spoken").textContent = chunk.text;
      document.getElementById("cso-translation").textContent = chunk.translation || "";
    } else {
      overlay.style.display = "none";
    }
  }
  
  speakWordWithCallback(chunk.text, chunk.lang, 1.0, () => {
    if (queueId === currentQueueId) {
      setTimeout(() => playNextInQueue(queueId), 300);
    }
  });
}

function playSpeechQueue(queue) {
  currentQueueId++;
  const activeQueueId = currentQueueId;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  globalSpeechQueue = queue;
  currentSpeechIndex = 0;
  playNextInQueue(activeQueueId);
}

window.stopSpeechQueue = function() {
  currentQueueId++;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  globalSpeechQueue = [];
  currentSpeechIndex = 0;
  const overlay = document.getElementById("conjugation-speech-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
};

function speakMultilingualText(text, targetLang) {
  const baseLang = state.baseLang || "en";
  const germanStopwords = ["der", "die", "das", "ein", "eine", "einer", "einem", "einen", "und", "ist", "sind", "mit", "vor", "nach", "für", "bei", "oder", "wird", "werden", "von", "zu", "im", "in", "dem", "den", "des", "das", "als", "wie", "an", "zur", "zum", "zur", "formen", "verwendung", "beispiele", "beispiel", "merke", "achtung", "regel", "regeln", "grammatik", "artikel", "nomen", "verb", "verben", "adjektiv", "pronomina", "pronomen", "vorwort", "inhaltsverzeichnis"];
  
  const lines = text.split("\n");
  let speechQueue = [];

  lines.forEach(line => {
    let cleanLine = line.trim();
    if (!cleanLine) return;

    // Split by parentheses, colons, dashes
    const parts = cleanLine.split(/([\(\)\–\-\:])/);
    
    parts.forEach(part => {
      const p = part.trim();
      if (!p || p === "(" || p === ")" || p === "–" || p === "-" || p === ":") return;
      
      const words = p.toLowerCase().split(/[\s,;\.\?!]+/);
      const hasGerman = words.some(w => germanStopwords.includes(w));
      
      let partLang = targetLang;
      if (hasGerman) {
        partLang = baseLang;
      }
      
      if (speechQueue.length > 0 && speechQueue[speechQueue.length - 1].lang === partLang) {
        speechQueue[speechQueue.length - 1].text += " " + p;
      } else {
        speechQueue.push({ text: p, lang: partLang });
      }
    });
  });

  speechQueue = speechQueue.map(q => {
    q.text = q.text.replace(/[“”"'\(\)]/g, "").trim();
    return q;
  }).filter(q => q.text.length > 1);

  if (speechQueue.length > 0) {
    playSpeechQueue(speechQueue);
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
let urlScrapedRows = [];
let fileScrapedRows = [];

// Configure PDF.js global worker path if available
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

async function importFromUrl(url, category) {
  const spinner = document.getElementById("import-spinner");
  const previewArea = document.getElementById("url-preview-area");
  const tableBody = document.getElementById("url-preview-table-body");
  
  if (previewArea) previewArea.style.display = "none";
  if (tableBody) tableBody.innerHTML = "";
  urlScrapedRows = [];

  spinner.style.display = "block";
  spinner.querySelector("p").textContent = "Fetching and scanning web page...";

  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, "text/html");
    
    let candidates = [];
    
    // Heuristic 1: Tables
    const tables = doc.querySelectorAll("table");
    tables.forEach(table => {
      const rows = table.querySelectorAll("tr");
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          const w1 = cells[0].textContent.trim();
          const w2 = cells[1].textContent.trim();
          if (w1 && w2 && w1.length < 50 && w2.length < 50 && 
              !w1.toLowerCase().includes("translation") && !w1.toLowerCase().includes("word") &&
              !w2.toLowerCase().includes("translation") && !w2.toLowerCase().includes("word")) {
            candidates.push({ word: w1, trans: w2 });
          }
        }
      });
    });
    
    // Heuristic 2: Hyphen/List items
    if (candidates.length === 0) {
      const listItems = doc.querySelectorAll("li, p");
      listItems.forEach(item => {
        const text = item.textContent.trim();
        const match = text.match(/^([a-zA-ZÀ-ÿ\s¿?¡!]+)[\s\-\–\—\:\=]+([a-zA-ZÀ-ÿ\s¿?¡!]+)$/);
        if (match) {
          const w1 = match[1].trim();
          const w2 = match[2].trim();
          if (w1 && w2 && w1.split(" ").length < 5 && w2.split(" ").length < 5) {
            candidates.push({ word: w1, trans: w2 });
          }
        }
      });
    }
    
    // Fallback: tokenize words on the page
    if (candidates.length === 0) {
      const rawText = doc.body ? doc.body.textContent : "";
      const words = rawText.match(/[a-zA-ZÀ-ÿ]+/g) || [];
      const uniqueWords = [...new Set(words.map(w => w.trim()))]
        .filter(w => w.length >= 4 && w.length <= 15)
        .slice(0, 50);
      
      candidates = uniqueWords.map(w => ({ word: w, trans: "" }));
    }

    spinner.style.display = "none";
    
    if (candidates.length > 0) {
      urlScrapedRows = candidates.map((c, index) => ({
        id: index,
        word: c.word,
        trans: c.trans,
        active: true
      }));
      
      renderUrlPreview();
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
              urlScrapedRows = parsed.map((item, index) => ({
                id: index,
                word: item.word.trim(),
                trans: item.trans.trim(),
                active: true
              }));
              renderUrlPreview();
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
            urlScrapedRows = parsed.map((item, index) => ({
              id: index,
              word: item.word.trim(),
              trans: item.trans.trim(),
              active: true
            }));
            renderUrlPreview();
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

function renderUrlPreview() {
  const previewArea = document.getElementById("url-preview-area");
  const tableBody = document.getElementById("url-preview-table-body");
  if (!previewArea || !tableBody) return;

  tableBody.innerHTML = "";
  previewArea.style.display = "block";

  urlScrapedRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
    
    tr.innerHTML = `
      <td style="padding: 8px 10px;">
        <input type="text" value="${row.word.replace(/"/g, "&quot;")}" style="width: 100%; min-height: 32px; background: rgba(255,255,255,0.02); color: #fff; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 8px; font-size: 0.8rem;" oninput="window.updateUrlScrapedWord(${row.id}, this.value)">
      </td>
      <td style="padding: 8px 10px;">
        <input type="text" value="${row.trans.replace(/"/g, "&quot;")}" placeholder="Auto-translate if left empty" style="width: 100%; min-height: 32px; background: rgba(255,255,255,0.02); color: #fff; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 8px; font-size: 0.8rem;" oninput="window.updateUrlScrapedTrans(${row.id}, this.value)">
      </td>
      <td style="padding: 8px 10px; text-align: center;">
        <input type="checkbox" ${row.active ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;" onchange="window.toggleUrlScrapedRow(${row.id}, this.checked)">
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.updateUrlScrapedWord = (id, val) => {
  const row = urlScrapedRows.find(r => r.id === id);
  if (row) row.word = val;
};

window.updateUrlScrapedTrans = (id, val) => {
  const row = urlScrapedRows.find(r => r.id === id);
  if (row) row.trans = val;
};

window.toggleUrlScrapedRow = (id, checked) => {
  const row = urlScrapedRows.find(r => r.id === id);
  if (row) row.active = checked;
};

// File Upload Processing Functions
async function handleFileSelect(file) {
  const spinner = document.getElementById("file-spinner");
  const spinnerText = document.getElementById("file-spinner-text");
  const previewArea = document.getElementById("file-preview-area");
  const tableBody = document.getElementById("file-preview-table-body");

  if (previewArea) previewArea.style.display = "none";
  if (tableBody) tableBody.innerHTML = "";
  fileScrapedRows = [];

  if (!file) return;

  spinner.style.display = "block";
  if (spinnerText) spinnerText.textContent = "Reading file content...";

  try {
    let extractedText = "";

    if (file.name.endsWith(".pdf")) {
      if (spinnerText) spinnerText.textContent = "Extracting text from PDF (using PDF.js)...";
      
      const arrayBuffer = await file.arrayBuffer();
      const typedarray = new Uint8Array(arrayBuffer);
      
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      let textContentList = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        if (spinnerText) spinnerText.textContent = `Extracting PDF text (page ${i}/${pdf.numPages})...`;
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        textContentList.push(pageText);
      }
      extractedText = textContentList.join("\n");
    } else {
      extractedText = await file.text();
    }

    if (spinnerText) spinnerText.textContent = "Parsing words and candidates...";
    
    let candidates = [];
    const lines = extractedText.split("\n").map(l => l.trim()).filter(Boolean);
    
    // Parse separated pairs
    lines.forEach(line => {
      const separators = ["\t", ",", ";", " - ", " – ", " — ", ":", "="];
      let found = false;
      for (const sep of separators) {
        if (line.includes(sep)) {
          const parts = line.split(sep);
          if (parts.length >= 2) {
            const w1 = parts[0].trim();
            const w2 = parts[1].trim();
            if (w1 && w2 && w1.length < 50 && w2.length < 50 && w1.split(" ").length < 5 && w2.split(" ").length < 5) {
              candidates.push({ word: w1, trans: w2 });
              found = true;
              break;
            }
          }
        }
      }
    });

    // Fallback: tokenize
    if (candidates.length === 0) {
      const words = extractedText.match(/[a-zA-ZÀ-ÿ]+/g) || [];
      const uniqueWords = [...new Set(words.map(w => w.trim()))]
        .filter(w => w.length >= 4 && w.length <= 15)
        .slice(0, 50);
      
      candidates = uniqueWords.map(w => ({ word: w, trans: "" }));
    }

    spinner.style.display = "none";

    if (candidates.length > 0) {
      fileScrapedRows = candidates.map((c, index) => ({
        id: index,
        word: c.word,
        trans: c.trans,
        active: true
      }));
      renderFilePreview();
    } else {
      alert("No words could be extracted from this document.");
    }
  } catch (err) {
    spinner.style.display = "none";
    console.error("File processing failed:", err);
    alert("File processing failed: " + err.message);
  }
}

function renderFilePreview() {
  const previewArea = document.getElementById("file-preview-area");
  const tableBody = document.getElementById("file-preview-table-body");
  if (!previewArea || !tableBody) return;

  tableBody.innerHTML = "";
  previewArea.style.display = "block";

  fileScrapedRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
    
    tr.innerHTML = `
      <td style="padding: 8px 10px;">
        <input type="text" value="${row.word.replace(/"/g, "&quot;")}" style="width: 100%; min-height: 32px; background: rgba(255,255,255,0.02); color: #fff; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 8px; font-size: 0.8rem;" oninput="window.updateFileScrapedWord(${row.id}, this.value)">
      </td>
      <td style="padding: 8px 10px;">
        <input type="text" value="${row.trans.replace(/"/g, "&quot;")}" placeholder="Auto-translate if left empty" style="width: 100%; min-height: 32px; background: rgba(255,255,255,0.02); color: #fff; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 8px; font-size: 0.8rem;" oninput="window.updateFileScrapedTrans(${row.id}, this.value)">
      </td>
      <td style="padding: 8px 10px; text-align: center;">
        <input type="checkbox" ${row.active ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;" onchange="window.toggleFileScrapedRow(${row.id}, this.checked)">
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.updateFileScrapedWord = (id, val) => {
  const row = fileScrapedRows.find(r => r.id === id);
  if (row) row.word = val;
};

window.updateFileScrapedTrans = (id, val) => {
  const row = fileScrapedRows.find(r => r.id === id);
  if (row) row.trans = val;
};

window.toggleFileScrapedRow = (id, checked) => {
  const row = fileScrapedRows.find(r => r.id === id);
  if (row) row.active = checked;
};

async function executeFileImport() {
  const category = document.getElementById("file-import-category").value.trim() || "document-import";
  const btnConfirm = document.getElementById("btn-file-confirm");
  const btnConfirmTop = document.getElementById("btn-file-confirm-top");
  const originalText = btnConfirm ? btnConfirm.textContent : "Import Selected Words Now!";
  
  const progressContainer = document.getElementById("file-import-progress-container");
  const progressBar = document.getElementById("file-import-progress-bar");
  const progressStatus = document.getElementById("file-import-progress-status");
  const progressPercent = document.getElementById("file-import-progress-percent");

  const activeRows = fileScrapedRows.filter(r => r.active && r.word.trim());
  const total = activeRows.length;
  
  if (total > 0 && progressContainer) {
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressPercent.textContent = "0%";
    progressStatus.textContent = "Starting translation & import...";
  }

  let count = 0;
  
  if (btnConfirm) { btnConfirm.textContent = "⏳ Translating & Importing..."; btnConfirm.disabled = true; }
  if (btnConfirmTop) { btnConfirmTop.textContent = "⏳ Importing..."; btnConfirmTop.disabled = true; }

  try {
    for (const row of fileScrapedRows) {
      if (row.active && row.word.trim()) {
        await addCustomWord(row.word.trim(), row.trans.trim(), state.selectedLang, category);
        count++;
        if (progressContainer) {
          const pct = Math.round((count / total) * 100);
          progressBar.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          progressStatus.textContent = `Translating & importing ${count} of ${total}...`;
        }
      }
    }
    
    if (count > 0) {
      saveState();
      renderImportedList();
      if (state.icloudHandle) {
        saveWordlistToICloud(category);
      }
      alert(`Successfully imported and translated ${count} custom words!`);
      const previewArea = document.getElementById("file-preview-area");
      if (previewArea) previewArea.style.display = "none";
      document.getElementById("file-import-input").value = "";
      fileScrapedRows = [];
    } else {
      alert("No words selected to import.");
    }
  } catch (err) {
    console.error("File import failed:", err);
    alert("File import failed during translation process: " + err.message);
  } finally {
    if (btnConfirm) { btnConfirm.textContent = originalText; btnConfirm.disabled = false; }
    if (btnConfirmTop) { btnConfirmTop.textContent = "🚀 Start Import"; btnConfirmTop.disabled = false; }
    if (progressContainer) progressContainer.style.display = "none";
  }
}

async function detectLanguage(text) {
  if (!text || text.trim().length === 0) return null;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text.trim())}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const lang = data[2];
      if (lang) {
        const cleanLang = lang.toLowerCase().substring(0, 2);
        if (["en", "de", "it", "es", "fr"].includes(cleanLang)) {
          return cleanLang;
        }
      }
    }
  } catch (err) {
    console.error("Google language detection failed for: " + text, err);
  }
  return null;
}

async function translateAndDetectWithAI(word) {
  const prompt = `Identify the source language (en, de, it, es, or fr) of the phrase "${word}" and translate it into all 5 languages: English (en), German (de), Italian (it), Spanish (es), and French (fr).
  Output your response ONLY as a clean, parseable JSON object with keys "detectedLang" (the 2-letter code), "en", "de", "it", "es", "fr". Do not wrap in markdown code blocks. Do not write extra commentary.
  Example: {"detectedLang": "it", "en": "the book is on the table", "de": "das Buch ist auf dem Tisch", "it": "il libro è sul tavolo", "es": "el libro está en la mesa", "fr": "le livre est sur la table"}`;
  
  try {
    const resText = await callLLM(prompt, "You are a multi-language translation assistant.");
    const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    return parsed;
  } catch (e) {
    console.error("AI translation/detection failed:", e);
    return null;
  }
}

async function addCustomWord(english, translation, lang, category, imageUrl = "", audioBase64 = "") {
  const base = state.baseLang || "en";
  const cleanEnglish = english.trim().toLowerCase();

  // Check if word already exists in the target custom folder/category
  const existsInCustom = (state.customVocab || []).some(v => {
    const vBase = (v[base] || v.en || "").trim().toLowerCase();
    return vBase === cleanEnglish && v.category === (category || "imported");
  });

  if (existsInCustom) {
    console.log(`Word "${english}" already exists in wordlist "${category}". Skipping duplicate registration.`);
    return;
  }
  
  const newWord = {
    category: category || "imported",
    image: imageUrl || english,
    audio: audioBase64,
    lastUpdated: Date.now(),
    details: {
      articles: {},
      sentences: {},
      variations: {},
      synonyms: { en: [], de: [], it: [], es: [], fr: [] }
    }
  };

  const hasKey = state.openaiKey || state.grokKey || state.geminiKey;
  if (hasKey) {
    // Perform AI detection and translations in one single call!
    const aiResult = await translateAndDetectWithAI(english);
    if (aiResult) {
      newWord.en = sanitizeWordTranslation(aiResult.en, "en");
      newWord.de = sanitizeWordTranslation(aiResult.de, "de");
      newWord.it = sanitizeWordTranslation(aiResult.it, "it");
      newWord.es = sanitizeWordTranslation(aiResult.es, "es");
      newWord.fr = sanitizeWordTranslation(aiResult.fr, "fr");
      newWord.lang = aiResult.detectedLang || lang;
      newWord.target = newWord[state.selectedLang] || "";
      
      const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];
      if (category && !staticFolders.includes(category)) {
        const exists = state.customFolders.some(f => f.id === category || f.name === category);
        if (!exists) {
          state.customFolders.push({ id: category, name: category, parentId: null });
        }
      }

      state.customVocab.push(newWord);
      sessionImportedList.push(newWord);
      saveState();
      renderImportedList();
      if (document.getElementById("view-browse").classList.contains("active")) {
        renderBrowseList();
      }
      return;
    }
  }

  // Fallback to MyMemory:
  // Add a small delay to avoid rate limits when doing multiple imports in parallel
  await new Promise(r => setTimeout(r, 600));

  const detectedBase = await detectLanguage(english) || base;
  newWord[detectedBase] = sanitizeWordTranslation(english, detectedBase);
  
  const langs = ["en", "de", "it", "es", "fr"];
  langs.forEach(l => {
    if (l !== detectedBase) {
      newWord[l] = "";
    }
  });

  newWord.en = detectedBase === "en" ? sanitizeWordTranslation(english, "en") : "";
  newWord.target = "";
  newWord.lang = lang;

  await fillMissingTranslations(newWord, detectedBase);
  
  if (!newWord.en) {
    newWord.en = sanitizeWordTranslation(newWord.en || newWord[detectedBase] || english, "en");
  }

  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];
  if (category && !staticFolders.includes(category)) {
    const exists = state.customFolders.some(f => f.id === category || f.name === category);
    if (!exists) {
      state.customFolders.push({
        id: category,
        name: category,
        parentId: null
      });
    }
  }

  state.customVocab.push(newWord);
  sessionImportedList.push(newWord);
  saveState();
  renderImportedList();
  if (state.icloudHandle) {
    saveWordlistToICloud(category || "nouns");
  }
  if (document.getElementById("view-browse").classList.contains("active")) {
    renderBrowseList();
  }
}

function sanitizeWordTranslation(text, lang) {
  if (!text) return "";
  let clean = text.trim();
  
  // Strip any HTML/XML/SVG tags (such as <g x=1 id="5823"/>) that leak from scrapers/PDFs
  clean = clean.replace(/<[^>]*>?/gm, '').trim();
  
  // Remove trailing periods and commas if they are unnecessary (short words/phrases)
  if (clean.length > 1 && (clean.endsWith(".") || clean.endsWith(",")) && !clean.endsWith("...") && !/[?!]/.test(clean)) {
    clean = clean.substring(0, clean.length - 1).trim();
  }
  
  return clean;
}

async function fillMissingTranslations(wordObj, sourceLang) {
  const langs = ["en", "de", "it", "es", "fr"];
  const sourceText = wordObj[sourceLang];
  if (!sourceText) return;

  const promises = langs.map(async (targetLang) => {
    if (wordObj[targetLang]) return; // Already populated
    
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(sourceText)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          wordObj[targetLang] = sanitizeWordTranslation(data[0][0][0], targetLang);
        }
      }
    } catch (err) {
      console.error(`Failed to backfill translation for ${targetLang} via Google`, err);
    }
  });

  await Promise.all(promises);
}

let sessionImportedList = [];

function renderImportedList() {
  const container = document.getElementById("imported-list");
  container.innerHTML = "";
  
  if (sessionImportedList.length === 0) {
    container.innerHTML = `<li class="empty-state">No words imported in this session yet.</li>`;
    return;
  }

  sessionImportedList.slice().reverse().forEach(vocab => {
    const li = document.createElement("li");
    // Show EN/base word and first non-empty translation slot (DE, IT, ES, FR)
    const baseWord = vocab.en || vocab.origEn || Object.values(vocab).find(v => typeof v === 'string' && v.length > 0) || "Word";
    const targetLangs = ["de", "it", "es", "fr", "en"];
    const targetTrans = targetLangs.map(l => vocab[l]).filter(Boolean)[0] || "";
    li.innerHTML = `
      <span class="list-word">${baseWord}</span>
      <span class="list-translation">${targetTrans}</span>
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

import { startTestSession, renderQuestion, selectOption, submitTypingAnswer, submitConjugationAnswer, nextQuestion, finishTestSession, quitTestSession, speakCurrentTestWord, repeatMistakes } from './modules/test-runner.js';

window.startTestSession = startTestSession;
window.renderQuestion = renderQuestion;
window.selectOption = selectOption;
window.submitTypingAnswer = submitTypingAnswer;
window.submitConjugationAnswer = submitConjugationAnswer;
window.nextQuestion = nextQuestion;
window.finishTestSession = finishTestSession;
window.quitTestSession = quitTestSession;
window.speakCurrentTestWord = speakCurrentTestWord;
window.repeatMistakes = repeatMistakes;

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

import './modules/init.js';

// ==========================================
// 9. Word Details & AI/Web Lookups
// ==========================================
function setupWordDetails(currentWord) {
  const container = document.getElementById("word-details-container");
  const aiBtn = document.getElementById("btn-get-ai-details");
  const aiLoading = document.getElementById("ai-details-loading");
  const aiResponse = document.getElementById("ai-details-response");

  // Reset display states
  if (container) container.style.display = "block";
  if (aiResponse) aiResponse.style.display = "none";
  if (aiLoading) aiLoading.style.display = "none";

  const details = getWordDetails(currentWord);
  fetchAndCacheWordDetails(currentWord);
  const qLang = currentWord.questionLang || state.baseLang || "en";
  const aLang = currentWord.answerLang || state.selectedLang;

  // Language display helpers
  const flags = { en: getFlagHtml("en"), de: getFlagHtml("de"), it: getFlagHtml("it"), es: getFlagHtml("es"), fr: getFlagHtml("fr") };
  const langNames = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };

  // Set dynamic labels (e.g. "🇩🇪 DE" instead of "Base Word")
  const baseLabelEl = document.getElementById("detail-base-label");
  const targetLabelEl = document.getElementById("detail-target-label");
  if (baseLabelEl) {
    baseLabelEl.innerHTML = `${flags[qLang] || "🌐"} ${qLang.toUpperCase()}`;
    baseLabelEl.style.color = getLangColor(qLang);
  }
  if (targetLabelEl) {
    targetLabelEl.innerHTML = `${flags[aLang] || "🌐"} ${aLang.toUpperCase()}`;
    targetLabelEl.style.color = getLangColor(aLang);
  }

  // Populate base and target text (include articles!)
  const baseWordEl = document.getElementById("detail-base-word");
  const targetWordEl = document.getElementById("detail-target-word");
  
  let qArt = "";
  let qNoun = currentWord.en;
  if (details && details.articles && details.articles[qLang]) {
    qArt = details.articles[qLang];
  } else {
    const parsed = getArticleAndNoun(currentWord.en, qLang, currentWord);
    qArt = parsed.article;
    qNoun = parsed.noun;
  }

  let aArt = "";
  let aNoun = currentWord.target;
  if (details && details.articles && details.articles[aLang]) {
    aArt = details.articles[aLang];
  } else {
    const parsed = getArticleAndNoun(currentWord.target, aLang, currentWord);
    aArt = parsed.article;
    aNoun = parsed.noun;
  }

  const baseTextWithArt = qArt ? `${qArt} ${qNoun}` : qNoun;
  const targetTextWithArt = aArt ? `${aArt} ${aNoun}` : aNoun;

  if (baseWordEl) {
    baseWordEl.style.color = getLangColor(qLang);
    baseWordEl.innerHTML = qArt ? `<span style="font-size:0.85em; color:var(--success-color);">${qArt}</span> ${qNoun}` : qNoun;
  }
  if (targetWordEl) {
    targetWordEl.style.color = getLangColor(aLang);
    targetWordEl.innerHTML = aArt ? `<span style="font-size:0.85em; color:var(--success-color);">${aArt}</span> ${aNoun}` : aNoun;
  }

  // Speak Base & Target handlers — clicking flag/label plays voice
  const speakBaseArea = document.getElementById("clickable-speak-base");
  const speakTargetArea = document.getElementById("clickable-speak-target");
  if (speakBaseArea) {
    speakBaseArea.onclick = () => speakWord(baseTextWithArt, qLang, 1.0);
  }
  if (speakTargetArea) {
    speakTargetArea.onclick = () => speakWord(targetTextWithArt, aLang, 1.0);
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


    // 2. Sentences — show question language sentence + answer language translation
    const qSentence = details.sentences && details.sentences[qLang] ? details.sentences[qLang] : "";
    const aSentence = details.sentences && details.sentences[aLang] ? details.sentences[aLang] : "";
    if ((qSentence || aSentence) && sectionSentence) {
      sectionSentence.style.display = "block";
      if (qSentence) {
        sentenceEl.innerHTML = `${flags[qLang] || ""} "${qSentence}"`;
      } else {
        sentenceEl.textContent = "";
      }
      if (aSentence) {
        sentenceTransEl.innerHTML = `${flags[aLang] || ""} "${aSentence}"`;
      } else {
        sentenceTransEl.textContent = "";
      }
    } else if (sectionSentence) {
      sectionSentence.style.display = "none";
    }

    // 3. Variations (plural, conjugation, gender forms)
    let variationsHtml = "";
    if (details.variations) {
      if (details.variations.plural && (details.variations.plural[qLang] || details.variations.plural[aLang])) {
        let qPlural = details.variations.plural[qLang] || "";
        let aPlural = details.variations.plural[aLang] || "";
        const guessPluralArticle = (lang, singArt, word) => {
          if (!singArt) return "";
          const s = singArt.toLowerCase().trim();
          if (lang === "de") return "die";
          if (lang === "es") return s === "el" ? "los" : (s === "la" ? "las" : "");
          if (lang === "fr") return "les";
          if (lang === "it") {
            if (s === "il") return "i";
            if (s === "la") return "le";
            if (s === "lo") return "gli";
            if (s === "l'") return word.endsWith("i") ? "gli" : "le";
          }
          return "";
        };

        const prependArticle = (plur, lang, singArt) => {
          if (!plur || !singArt) return plur;
          const art = guessPluralArticle(lang, singArt, plur);
          if (art && !plur.toLowerCase().startsWith(art + " ") && !plur.toLowerCase().startsWith(art + "'")) {
            return art + (art.endsWith("'") ? "" : " ") + plur;
          }
          return plur;
        };

        qPlural = prependArticle(qPlural, qLang, qArt);
        aPlural = prependArticle(aPlural, aLang, aArt);
        variationsHtml += `Plural: `;
        if (qPlural) variationsHtml += `${flags[qLang] || ""} <strong style="color:${getLangColor(qLang)};">${qPlural}</strong> `;
        if (qPlural && aPlural) variationsHtml += `&rarr; `;
        if (aPlural) variationsHtml += `${flags[aLang] || ""} <strong style="color:${getLangColor(aLang)};">${aPlural}</strong>`;
        variationsHtml += `<br>`;
      }
      if (details.variations.he && (details.variations.he[qLang] || details.variations.he[aLang])) {
        const qHe = details.variations.he[qLang] || "";
        const aHe = details.variations.he[aLang] || "";
        variationsHtml += `Conjugation (He/She): `;
        if (qHe) variationsHtml += `${flags[qLang] || ""} <strong style="color:${getLangColor(qLang)};">${qHe}</strong> `;
        if (qHe && aHe) variationsHtml += `&rarr; `;
        if (aHe) variationsHtml += `${flags[aLang] || ""} <strong style="color:${getLangColor(aLang)};">${aHe}</strong>`;
        variationsHtml += `<br>`;
      }
    }
    if (details.genderForms && (details.genderForms.de || details.genderForms.it)) {
      if (details.genderForms.de && (details.genderForms.de.m || details.genderForms.de.f)) {
        variationsHtml += `${flags.de} <strong>Genders (DE)</strong>: ♂️ ${details.genderForms.de.m || "-"} / ♀️ ${details.genderForms.de.f || "-"}<br>`;
      }
      if (details.genderForms.it && (details.genderForms.it.m || details.genderForms.it.f)) {
        variationsHtml += `${flags.it} <strong>Genders (IT)</strong>: ♂️ ${details.genderForms.it.m || "-"} / ♀️ ${details.genderForms.it.f || "-"}<br>`;
      }
    }
    if (variationsHtml && sectionVariations) {
      sectionVariations.style.display = "block";
      variationsEl.innerHTML = variationsHtml;
    } else if (sectionVariations) {
      sectionVariations.style.display = "none";
    }

    // 4. Synonyms — show answer language synonyms with question language equivalents (Always visible!)
    const aSyns = (details.synonyms && details.synonyms[aLang]) ? details.synonyms[aLang] : [];
    const qSyns = (details.synonyms && details.synonyms[qLang]) ? details.synonyms[qLang] : [];
    if (sectionSynonyms) {
      sectionSynonyms.style.display = "flex";
      if (aSyns && aSyns.length > 0) {
        synonymsEl.innerHTML = aSyns.map((syn, idx) => {
          const qTrans = qSyns[idx] ? ` (${qSyns[idx]})` : "";
          return `<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${syn}${qTrans}</code>`;
        }).join(", ");
      } else {
        synonymsEl.innerHTML = `<span style="color: var(--text-secondary); font-style: italic; font-size: 0.8rem;">None registered</span>`;
      }
    }
  } else {
    if (sectionArticles) sectionArticles.style.display = "none";
    if (sectionSentence) sectionSentence.style.display = "none";
    if (sectionVariations) sectionVariations.style.display = "none";
    if (sectionSynonyms) {
      sectionSynonyms.style.display = "flex";
      synonymsEl.innerHTML = `<span style="color: var(--text-secondary); font-style: italic; font-size: 0.8rem;">None registered</span>`;
    }
  }

  // Combined Word Insights & Grammar Rules trigger
  const insightsBtn = document.getElementById("btn-show-word-insights");
  if (insightsBtn) {
    insightsBtn.onclick = async () => {
      const modal = document.getElementById("word-insights-modal");
      const modalTitle = document.getElementById("insights-modal-title");
      const aiContent = document.getElementById("insights-ai-content");
      const grammarContent = document.getElementById("insights-grammar-content");
      const closeBtn = document.getElementById("btn-close-insights");
      
      if (!modal || !aiContent || !grammarContent) return;
      
      const studyWord = currentWord[state.selectedLang || aLang] || currentWord.target;
      modalTitle.textContent = `Insights & Grammar: ${studyWord}`;
      
      // Show loading spinners in both columns
      const spinnerHtml = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
          <span class="spinner" style="display: inline-block; width: 24px; height: 24px; border: 2px solid var(--accent-color); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px;"></span>
          <p>Loading...</p>
        </div>
      `;
      aiContent.innerHTML = spinnerHtml;
      grammarContent.innerHTML = spinnerHtml;
      
      modal.classList.add("active");
      
      if (closeBtn) {
        closeBtn.onclick = () => {
          modal.classList.remove("active");
          if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
        };
      }

      // Bind paragraph / element click reading logic on this modal
      modal.onclick = (e) => {
        const target = e.target.closest("p, li, h1, h2, h3, h4, strong, blockquote, code");
        if (target) {
          if (target.tagName === "BUTTON" || target.closest("button") || target.closest(".modal-header")) {
            return;
          }
          const text = target.textContent.trim();
          if (text) {
            const studyLang = state.selectedLang || "it";
            speakMultilingualText(text, studyLang);
          }
        }
      };

      // 1. Fetch AI details in parallel/async
      const baseLang = state.baseLang || "en";
      const baseLangName = langNames[baseLang] || baseLang;
      const baseWord = currentWord[baseLang] || currentWord.en;
      const studyLang = state.selectedLang || aLang;
      const studyLangName = langNames[studyLang] || studyLang;

      // Trigger AI query
      (async () => {
        try {
          const promptText = `Explain the usage of the vocabulary word "${studyWord}" (${studyLangName}) and its translation "${baseWord}" (${baseLangName}). Provide articles (such as der/die/das in German, il/la/lo in Italian), prepositions, example sentences, and grammatical variations where applicable. You MUST write all explanations, commentaries, descriptions, and translations in ${baseLangName}.`;

          let responseText = "";
          if (state.geminiKey || state.openaiKey || state.grokKey) {
            responseText = await callLLM(promptText, `You are a helpful language teacher. Explain all vocabulary details in ${baseLangName}.`);
          } else {
            const fallbackText = await fetchWebDetailsFallback(currentWord.en, aLang);
            responseText = `⚠️ [No API Key configured. Showing web dictionary fallback details instead of AI explanation]\n\n${fallbackText}`;
          }
          aiContent.innerHTML = parseMarkdownToHTML(responseText);
        } catch (err) {
          aiContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Could not fetch AI details: ${err.message}</div>`;
        }
      })();

      // 2. Fetch/Load grammar reference sheets in parallel/async
      (async () => {
        try {
          if (!grammarGuideData) {
            const response = await fetch("vocab/Grammatikmerkblaetter.md");
            if (response.ok) {
              grammarGuideData = await response.text();
            }
          }

          let relevantSections = "";
          if (grammarGuideData) {
            const sections = grammarGuideData.split(/\n---\n/);
            const cat = (currentWord.category || "").toLowerCase();
            let matchedSections = [];
            
            if (cat.includes("noun") || (details && details.articles)) {
              matchedSections = sections.filter(sec => sec.includes("Der Artikel") || sec.includes("l'articolo"));
            } else if (cat.includes("verb") || (details && details.variations && details.variations.he)) {
              matchedSections = sections.filter(sec => sec.includes("Perfekt") || sec.includes("passato prossimo") || sec.includes("Passato remoto") || sec.includes("Futur"));
            } else if (cat.includes("adj")) {
              matchedSections = sections.filter(sec => sec.includes("Adjektiv") || sec.includes("l'aggettivo"));
            }
            
            if (matchedSections.length === 0) {
              matchedSections = sections.slice(0, 3);
            }
            relevantSections = matchedSections.join("\n\n---\n\n");
          }

          const categoryName = currentWord.category || "General";
          let explanationText = "";
          
          if (state.geminiKey || state.openaiKey || state.grokKey) {
            const promptText = `
Given the following sections of the reference grammar guide:
"""
${relevantSections.substring(0, 3000)}
"""

Act as an expert language teacher. Formulate a personalized grammar hint (in German) explaining 1 or 2 relevant grammar rules for the word "${studyWord}" (${studyLangName}), which is translated as "${baseWord}" (Category: "${categoryName}"). 

CRITICAL WARNING ON GENDER AGREEMENT: 
Grammatical genders often differ between languages. For instance, "la neve" is feminine in Italian, but the German translation "Schnee" is masculine ("der Schnee"). You MUST use correct German articles for German translations (e.g. "der Schnee", NOT "die Schnee"). Explicitly point out to the student if the grammatical genders differ between the target language word and its German translation (e.g., "Achtung: Im Italienischen weiblich (la neve), im Deutschen aber männlich (der Schnee)").

Adjust the rule strictly to this specific case. For example:
- If it is a noun, explain which article (like il, lo, la, l', i, gli, le) it uses and why (pointing to the starting letters/sounds).
- If it is a verb, explain its auxiliary verb (essere vs avere) or tense conjugation rule.
- If it is an adjective, explain how its ending changes.

You MUST write the explanation in German. Keep it concise, clear, and format it nicely with bold labels. Do NOT include introduction or meta-comments.
            `;
            
            explanationText = await callLLM(promptText, "You are a helpful language teacher. Write all grammar tips and explanations in German.");
          } else {
            explanationText = `### 📖 Lokaler Grammatik-Hinweis: **${studyWord}** (${studyLangName})\n\n`;
            if (relevantSections) {
              explanationText += `*Hier sind relevante Abschnitte aus den Grammatikmerkblättern, die zu der Kategorie **${categoryName}** passen:*\n\n---\n\n`;
              explanationText += relevantSections;
            } else {
              explanationText += `*Keine passenden Grammatikregeln im Guide gefunden.*`;
            }
          }
          
          grammarContent.innerHTML = parseMarkdownToHTML(explanationText);
        } catch (err) {
          grammarContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Could not fetch grammar rules: ${err.message}</div>`;
        }
      })();
    };
  }
}

function parseMarkdownToHTML(md) {
  if (!md) return "";
  
  let html = md;

  // Escape HTML tags to prevent arbitrary code execution
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse Tables
  const lines = html.split("\n");
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let resultLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // A line is part of a table if it contains at least one pipe separator
    const isTableRow = line.includes("|");

    if (isTableRow) {
      let cells = line.split("|").map(c => c.trim());
      // Shift/Pop empty outer elements if the line started or ended with a pipe
      if (line.startsWith("|")) cells.shift();
      if (line.endsWith("|")) cells.pop();
      
      const isSeparator = cells.every(c => /^:-*|-*:-*|-*:$/.test(c) || c === "");
      
      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        let tableHtml = `<div style="overflow-x:auto; margin: 12px 0;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem; background:rgba(255,255,255,0.01); border-radius:8px; border:1px solid rgba(255,255,255,0.08); overflow:hidden;">`;
        if (tableHeaders.length > 0) {
          tableHtml += `<thead style="background:rgba(255,255,255,0.03); border-bottom:1px solid rgba(255,255,255,0.08);"><tr>`;
          tableHeaders.forEach(h => {
            tableHtml += `<th style="padding: 8px 10px; font-weight:600; text-align:left; color:var(--accent-color);">${h}</th>`;
          });
          tableHtml += `</tr></thead>`;
        }
        tableHtml += `<tbody>`;
        tableRows.forEach(row => {
          tableHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">`;
          row.forEach(cell => {
            tableHtml += `<td style="padding: 8px 10px; color:var(--text-primary);">${cell}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        resultLines.push(tableHtml);
        
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
      resultLines.push(lines[i]);
    }
  }
  
  if (inTable) {
    let tableHtml = `<div style="overflow-x:auto; margin: 12px 0;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem; background:rgba(255,255,255,0.01); border-radius:8px; border:1px solid rgba(255,255,255,0.08); overflow:hidden;">`;
    if (tableHeaders.length > 0) {
      tableHtml += `<thead style="background:rgba(255,255,255,0.03); border-bottom:1px solid rgba(255,255,255,0.08);"><tr>`;
      tableHeaders.forEach(h => {
        tableHtml += `<th style="padding: 8px 10px; font-weight:600; text-align:left; color:var(--accent-color);">${h}</th>`;
      });
      tableHtml += `</tr></thead>`;
    }
    tableHtml += `<tbody>`;
    tableRows.forEach(row => {
      tableHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">`;
      row.forEach(cell => {
        tableHtml += `<td style="padding: 8px 10px; color:var(--text-primary);">${cell}</td>`;
      });
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    resultLines.push(tableHtml);
  }

  html = resultLines.join("\n");

  // Parse Headers
  html = html.replace(/^#### (.*?)$/gm, '<h4 style="color:var(--accent-color); font-weight:700; margin-top:16px; margin-bottom:8px; font-size:1rem;">$1</h4>');
  html = html.replace(/^### (.*?)$/gm, '<h3 style="color:var(--accent-color); font-weight:700; margin-top:18px; margin-bottom:8px; font-size:1.1rem;">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="color:var(--accent-color); font-weight:700; margin-top:20px; margin-bottom:10px; font-size:1.2rem;">$1</h2>');

  // Parse Bold Text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Parse Bullet Lists
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li style="margin-left: 16px; margin-bottom: 4px; color: var(--text-primary); list-style-type: disc;">$1</li>');

  // Parse remaining linebreaks nicely
  html = html.split("\n").map(l => {
    const trimmed = l.trim();
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) return l;
    return l + "<br>";
  }).join("\n");

  return html;
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
  const sourceLang = state.baseLang || "en";
  const langNames = {
    en: "english",
    de: "german",
    it: "italian",
    es: "spanish",
    fr: "french"
  };
  const sourceName = langNames[sourceLang] || "english";
  const targetName = langNames[targetLang] || "german";
  const reversoUrl = `https://context.reverso.net/translation/${sourceName}-${targetName}/${encodeURIComponent(word)}`;

  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(reversoUrl)}`);
    if (res.ok) {
      const json = await res.json();
      const html = json.contents;
      
      // Extract Translations
      const transRegex = /<a[^>]*class="[^"]*translation[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
      const translations = [];
      let match;
      while ((match = transRegex.exec(html)) !== null && translations.length < 5) {
        const cleanTrans = match[1].trim();
        if (cleanTrans && !translations.includes(cleanTrans) && !cleanTrans.includes("<") && !cleanTrans.includes(">")) {
          translations.push(cleanTrans);
        }
      }

      // Extract Examples
      function stripTags(str) {
        return str.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      }

      const examples = [];
      const exampleRegex = /<div class="example"[\s\S]*?<div class="src[^"]*">([\s\S]*?)<\/div>[\s\S]*?<div class="trg[^"]*">([\s\S]*?)<\/div>/gi;
      while ((match = exampleRegex.exec(html)) !== null && examples.length < 3) {
        const srcText = stripTags(match[1]);
        const trgText = stripTags(match[2]);
        if (srcText && trgText) {
          examples.push({ src: srcText, trg: trgText });
        }
      }

      if (translations.length > 0 || examples.length > 0) {
        let output = `📖 [Reverso Context Web Lookup]\nWord: "${word}"\n\nKey Translations in Context:\n➔ ${translations.join(", ")}\n\nSentence Examples:\n`;
        examples.forEach((ex, i) => {
          output += `${i + 1}. "${ex.src}"\n   ➔ "${ex.trg}"\n\n`;
        });
        return output.trim();
      }
    }
  } catch (err) {
    console.warn("Reverso Context fetch failed, falling back to standard dictionary:", err);
  }

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
Could not find Reverso Context or dictionary details for "${word}".
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

window.triggerEditWord = function(key, isCustom) {
  let currentWord = null;
  if (isCustom) {
    currentWord = state.customVocab.find(v => v.en === key || v.origEn === key);
  } else {
    const base = state.baseLang || "en";
    const item = STARTER_VOCAB_RAW.find(v => v[base] === key);
    if (item) {
      const override = state.editedStarters[key] || {};
      currentWord = {
        en: override.en || item.en || item[base] || "",
        de: override.de || item.de || "",
        it: override.it || item.it || "",
        es: override.es || item.es || "",
        fr: override.fr || item.fr || "",
        category: override.category || item.category || "",
        image: override.image || item.image || "",
        details: override.details || item.details || {}
      };
    }
  }

  if (currentWord) {
    state.editingWordKey = key;
    state.isEditingCustom = isCustom;
    
    // Switch to import view
    showView("view-import");
    
    // Activate manual tab
    const tabBtn = document.querySelector('[data-tab="tab-manual"]');
    if (tabBtn) tabBtn.click();
    
    // Pre-fill fields
    document.getElementById("manual-lang-en").value = currentWord.en || "";
    document.getElementById("manual-lang-de").value = currentWord.de || "";
    document.getElementById("manual-lang-it").value = currentWord.it || "";
    document.getElementById("manual-lang-es").value = currentWord.es || "";
    document.getElementById("manual-lang-fr").value = currentWord.fr || "";
    document.getElementById("manual-category").value = currentWord.category || "";
    document.getElementById("manual-image-url").value = currentWord.image || "";
    
    // Pre-fill Advanced Grammar fields
    const det = currentWord.details || {};
    const arts = det.articles || {};
    const genders = det.genderForms || {};
    
    document.getElementById("manual-art-de").value = arts.de || "";
    document.getElementById("manual-art-it").value = arts.it || "";
    document.getElementById("manual-art-es").value = arts.es || "";
    document.getElementById("manual-art-fr").value = arts.fr || "";
    
    document.getElementById("manual-gen-de-m").value = genders.de?.m || "";
    document.getElementById("manual-gen-de-f").value = genders.de?.f || "";
    document.getElementById("manual-gen-it-m").value = genders.it?.m || "";
    document.getElementById("manual-gen-it-f").value = genders.it?.f || "";

    const sents = det.sentences || {};
    document.getElementById("manual-sentence-en").value = sents.en || "";
    document.getElementById("manual-sentence-de").value = sents.de || "";
    document.getElementById("manual-sentence-it").value = sents.it || "";
    document.getElementById("manual-sentence-es").value = sents.es || "";
    document.getElementById("manual-sentence-fr").value = sents.fr || "";

    // Change button text and title
    document.getElementById("btn-manual-submit").textContent = "💾 Save Changes";
    const header = document.querySelector("#tab-manual h3");
    if (header) header.textContent = "✏️ Edit Word";
  }
};

window.triggerDeleteWord = async function(originalBaseKey, originalTargetKey, isCustom) {
  if (originalBaseKey instanceof HTMLElement || (originalBaseKey && typeof originalBaseKey === 'object' && originalBaseKey.dataset)) {
    const buttonEl = originalBaseKey;
    originalBaseKey = buttonEl.dataset.originalBase;
    originalTargetKey = buttonEl.dataset.originalTarget;
    isCustom = buttonEl.dataset.custom === "true";
  }
  const displayLabel = originalBaseKey || originalTargetKey || "this word";
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete "${displayLabel}"?`);
  if (!confirmDel) return;

  const base = state.baseLang || "en";
  const target = state.browseTargetLang || "de";
  const folderId = state.selectedBrowseFolderId;

  if (isCustom) {
    const matched = state.customVocab.find(v => 
      v.category === folderId &&
      (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
      (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase()
    );
    if (matched) {
      state.deletedCustomVocab.push({
        category: folderId,
        en: matched.origEn || matched.en,
        lastUpdated: Date.now()
      });
    }
    state.customVocab = state.customVocab.filter(v => 
      !(v.category === folderId &&
        (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
        (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase())
    );
    
    // Auto-save to iCloud if enabled
    if (state.icloudHandle) {
      saveWordlistToICloud(folderId);
    }
  } else {
    // For standard, originalBaseKey is the lookup key
    if (!state.deletedStarters.includes(originalBaseKey)) {
      state.deletedStarters.push(originalBaseKey);
    }
  }
  saveState();
  renderBrowseList();
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

// Folders Management - Hierarchical Tree Render
function renderFoldersList() {
  renderDirectoryTree();
}

function buildTreeHTML(nodes, parentId, depth = 0) {
  const children = nodes.filter(n => n.parentId === parentId);
  if (children.length === 0) return "";
  
  let html = "";
  children.forEach(node => {
    const folderWordCount = getFolderWordCountRecursive(node.id, nodes);
    const isExpanded = state.expandedFolders[node.id] !== false; 
    const isSelected = state.selectedBrowseFolderId === node.id;
    const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(node.id);
    
    const dragAttr = !isStandard ? `draggable="true" ondragstart="window.onTreeDragStart(event, '${node.id}')"` : "";
    const dropAttr = `ondragover="window.onTreeDragOver(event)" ondragleave="window.onTreeDragLeave(event)" ondrop="window.onTreeDrop(event, '${node.id}')"`;
    
    const subChildren = nodes.filter(n => n.parentId === node.id);
    const hasSub = subChildren.length > 0;
    const arrowClass = isExpanded ? "" : "collapsed";

    html += `
      <div class="tree-node ${isSelected ? 'selected' : ''}" 
           data-id="${node.id}" 
           style="padding-left: ${depth * 20 + 12}px;"
           ${dragAttr}
           ${dropAttr}
           onclick="window.onTreeFolderClick(event, '${node.id}')">
        
        ${hasSub ? `<span class="tree-toggle-arrow ${arrowClass}" onclick="window.onTreeToggleExpand(event, '${node.id}')">▼</span>` : `<span style="width: 18px; display: inline-block;"></span>`}
        
        <span class="tree-icon">${isStandard ? '📚' : '📁'}</span>
        <span class="tree-name">${node.name}</span>
        <span class="tree-count">${folderWordCount}</span>
        
        ${!isStandard ? `
          <div class="tree-actions">
            <button class="tree-action-btn" title="Rename" onclick="window.onTreeRenameFolder(event, '${node.id}')">✏️</button>
            <button class="tree-action-btn" title="Delete" style="color: var(--error-color);" onclick="window.onTreeDeleteFolder(event, '${node.id}')">❌</button>
          </div>
        ` : ""}
      </div>
    `;
    
    if (isExpanded && hasSub) {
      html += buildTreeHTML(nodes, node.id, depth + 1);
    }
  });
  return html;
}

function getFolderWordCountRecursive(folderId, allFolders) {
  let count = state.customVocab.filter(v => v.category === folderId).length;
  const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(folderId);
  if (isStandard) {
    const base = state.baseLang || "en";
    count += STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).length;
  }
  
  const children = allFolders.filter(f => f.parentId === folderId);
  children.forEach(child => {
    count += getFolderWordCountRecursive(child.id, allFolders);
  });
  
  return count;
}

function getFolderWordsRecursive(folderId) {
  const base = state.baseLang || "en";
  const selectedLang = state.selectedLang || "de";
  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];
  
  let words = [];
  if (staticFolders.includes(folderId)) {
    words = STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).map(item => {
      let finalEn = item[base];
      let finalTarget = item[selectedLang];
      if (state.editedStarters[item[base]]) {
        finalEn = state.editedStarters[item[base]].en || item[base];
        finalTarget = state.editedStarters[item[base]].target || item[selectedLang];
      }
      return { en: finalEn, target: finalTarget, category: item.category };
    });
  } else {
    words = state.customVocab.filter(v => v.category === folderId).map(item => ({
      en: item[base] || item.en || item.target,
      target: item[selectedLang] || item.target || item.en,
      category: item.category
    }));
    
    const childFolders = state.customFolders.filter(f => f.parentId === folderId);
    childFolders.forEach(child => {
      words = [...words, ...getFolderWordsRecursive(child.id)];
    });
  }
  return words;
}

function getAllWordsCombined() {
  const base = state.baseLang || "en";
  const selectedLang = state.selectedLang || "de";
  
  const starters = STARTER_VOCAB_RAW.filter(v => !state.deletedStarters.includes(v[base])).map(item => {
    let finalEn = item[base];
    let finalTarget = item[selectedLang];
    if (state.editedStarters[item[base]]) {
      finalEn = state.editedStarters[item[base]].en || item[base];
      finalTarget = state.editedStarters[item[base]].target || item[selectedLang];
    }
    return { en: finalEn, target: finalTarget, category: item.category };
  });
  
  const customs = state.customVocab.map(item => ({
    en: item[base] || item.en || item.target,
    target: item[selectedLang] || item.target || item.en,
    category: item.category
  }));
  
  return [...starters, ...customs];
}

// Drag & Drop Tree handlers
window.onTreeDragOver = function(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
};

window.onTreeDragLeave = function(e) {
  e.currentTarget.classList.remove("drag-over");
};

window.onTreeDragStart = function(e, folderId) {
  e.dataTransfer.setData("text/plain", folderId);
};

window.onTreeDrop = function(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  
  const draggedFolderId = e.dataTransfer.getData("text/plain");
  const wordKey = e.dataTransfer.getData("text/word-key");
  
  if (draggedFolderId) {
    if (draggedFolderId === targetId) return;
    if (isDescendantFolder(draggedFolderId, targetId)) {
      alert("Cannot drag a folder into its own subfolder.");
      return;
    }
    
    const folder = state.customFolders.find(f => f.id === draggedFolderId);
    if (folder) {
      folder.parentId = targetId === "root" ? null : targetId;
      saveState();
      renderBrowseList();
    }
  } else if (wordKey) {
    const word = state.customVocab.find(v => v.en === wordKey || v.origEn === wordKey);
    if (word) {
      word.category = targetId;
      saveState();
      renderBrowseList();
    } else {
      const base = state.baseLang || "en";
      const starter = STARTER_VOCAB_RAW.find(v => v[base] === wordKey);
      if (starter) {
        const newWord = JSON.parse(JSON.stringify(starter));
        newWord.category = targetId;
        newWord.isStarter = false;
        state.customVocab.push(newWord);
        state.deletedStarters.push(starter[base]);
        saveState();
        renderBrowseList();
      }
    }
  }
};

window.onTreeToggleExpand = function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  if (state.expandedFolders[folderId] === undefined) {
    state.expandedFolders[folderId] = false;
  } else {
    state.expandedFolders[folderId] = !state.expandedFolders[folderId];
  }
  saveState();
  renderDirectoryTree();
};

window.onTreeFolderClick = function(e, folderId) {
  state.selectedBrowseFolderId = folderId;
  saveState();
  renderBrowseList();
};

window.onTreeRenameFolder = function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  
  const folder = state.customFolders.find(f => f.id === folderId);
  if (!folder) return;
  
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
      <input type="text" id="rename-folder-input" value="${folder.name.replace(/"/g, '&quot;')}" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
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
    folder.name = newName;
    saveState();
    renderBrowseList();
    overlay.classList.remove("active");
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  overlay.classList.add("active");
};

window.onTreeDeleteFolder = async function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  
  const folder = state.customFolders.find(f => f.id === folderId);
  if (!folder) return;
  
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete the folder "${folder.name}"? All subfolders and words inside it will also be deleted!`);
  if (!confirmDel) return;

  const filename = `${folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "")}.json`;
  state.activeICloudLists[filename] = false;

  if (state.icloudHandle) {
    try {
      await state.icloudHandle.removeEntry(filename);
    } catch (err) {
      console.warn(`Could not delete file ${filename} from folder:`, err);
    }
  }

  deleteFolderRecursive(folderId);
  
  if (state.selectedBrowseFolderId === folderId) {
    state.selectedBrowseFolderId = null;
    const wordsCard = document.getElementById("browse-words-card");
    if (wordsCard) wordsCard.style.display = "none";
  }

  saveState();
  renderBrowseList();
};

function deleteFolderRecursive(folderId) {
  state.customVocab = state.customVocab.filter(v => v.category !== folderId);
  const children = state.customFolders.filter(f => f.parentId === folderId);
  children.forEach(child => {
    deleteFolderRecursive(child.id);
  });
  state.customFolders = state.customFolders.filter(f => f.id !== folderId);
}

function isDescendantFolder(parentFolderId, potentialChildFolderId) {
  let current = state.customFolders.find(f => f.id === potentialChildFolderId);
  while (current && current.parentId) {
    if (current.parentId === parentFolderId) return true;
    current = state.customFolders.find(f => f.id === current.parentId);
  }
  return false;
}

// Statistics View Controller
function renderStatisticsView() {
  // 1. Render Global Stats
  document.getElementById("stats-total-sessions").textContent = state.history.length;
  
  let globalAccuracy = 0;
  if (state.history.length > 0) {
    const totalScore = state.history.reduce((sum, h) => sum + (h.score || 0), 0);
    const totalTested = state.history.reduce((sum, h) => sum + (h.total || 0), 0);
    if (totalTested > 0) {
      globalAccuracy = Math.round((totalScore / totalTested) * 100);
    }
  }
  document.getElementById("stats-avg-accuracy").textContent = `${globalAccuracy}%`;
  document.getElementById("stats-streak-count").textContent = state.streak;
  document.getElementById("stats-xp-points").textContent = state.xp;

  // 2. Populate folder selection dropdown
  const select = document.getElementById("stats-select-folder");
  if (select) {
    select.innerHTML = '<option value="all">📚 All Words Combined</option>';
    
    // Add standard categories
    const staticFolders = [
      { id: "verbs", name: "🏃 Verbs" },
      { id: "nouns", name: "🍎 Nouns" },
      { id: "technology", name: "💻 Technology" },
      { id: "biology", name: "🌿 Biology" },
      { id: "phrases", name: "💬 Phrases" }
    ];
    staticFolders.forEach(sf => {
      const opt = document.createElement("option");
      opt.value = sf.id;
      opt.textContent = sf.name;
      select.appendChild(opt);
    });

    // Add custom folders sorted by path
    const sorted = (state.customFolders || []).map(f => ({
      id: f.id,
      path: getFolderFullPath(f.id)
    })).sort((a, b) => a.path.localeCompare(b.path));

    sorted.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = `📁 ${folder.path}`;
      select.appendChild(opt);
    });
    
    // Bind selection change
    select.onchange = () => {
      renderFolderStatistics();
    };
  }

  // Calculate default selected folder stats
  renderFolderStatistics();
}

function renderFolderStatistics() {
  const select = document.getElementById("stats-select-folder");
  if (!select) return;
  
  const val = select.value;
  let pool = [];
  if (val === "all") {
    pool = getAllWordsCombined();
  } else {
    pool = getFolderWordsRecursive(val);
  }
  
  const accuracyEl = document.getElementById("stats-folder-accuracy");
  const masteryEl = document.getElementById("stats-folder-mastery");
  const bar = document.getElementById("stats-leitner-bar");
  const hardestList = document.getElementById("stats-hardest-words-list");
  
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
    const top5 = hardest.slice(0, 5);
    top5.forEach(w => {
      const li = document.createElement("li");
      li.style.marginBottom = "4px";
      li.innerHTML = `<strong>${w.en}</strong> (${w.target}) &mdash; <span style="color:var(--error-color); font-weight:600;">${w.errors} errors</span>`;
      hardestList.appendChild(li);
    });
  } else {
    hardestList.innerHTML = `<li style="list-style:none; margin-left:-18px; color:var(--text-secondary);">No errors recorded yet! Keep it up.</li>`;
  }

  // 3. Render Word-by-Word Statistics Table
  const wordsTbody = document.getElementById("stats-words-table-body");
  if (wordsTbody) {
    wordsTbody.innerHTML = "";
    if (pool.length === 0) {
      wordsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-secondary);">No words in this category.</td></tr>`;
    } else {
      pool.forEach(word => {
        const stats = state.wordStats[word.origEn || word.en] || { attempts: 0, errors: 0 };
        const corrects = (stats.attempts || 0) - (stats.errors || 0);
        const falses = stats.errors || 0;
        
        let ratioText = "N/A";
        let ratioColor = "var(--text-secondary)";
        if (stats.attempts > 0) {
          const ratio = Math.round((corrects / stats.attempts) * 100);
          ratioText = `${ratio}%`;
          ratioColor = ratio >= 80 ? "#2ecc71" : ratio >= 50 ? "#ff9f43" : "#ff4b4b";
        }
        
        const difficulty = stats.difficulty || "medium";
        const diffLabels = {
          easy: '<span class="badge" style="background: rgba(46, 204, 113, 0.1); color: #2ecc71; font-size: 0.7rem; border-radius: 6px; padding: 2px 6px;">🟢 Easy</span>',
          medium: '<span class="badge" style="background: rgba(241, 196, 15, 0.1); color: #f1c40f; font-size: 0.7rem; border-radius: 6px; padding: 2px 6px;">🟡 Medium</span>',
          hard: '<span class="badge" style="background: rgba(231, 76, 60, 0.1); color: #e74c3c; font-size: 0.7rem; border-radius: 6px; padding: 2px 6px;">🔴 Hard</span>'
        };
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        tr.innerHTML = `
          <td style="padding: 10px; font-weight: 600; color: #fff;">${word.en}</td>
          <td style="padding: 10px; color: var(--text-secondary);">${word.target || word[state.selectedLang] || ""}</td>
          <td style="padding: 10px; text-align: center;">${diffLabels[difficulty]}</td>
          <td style="padding: 10px; text-align: center; color: #2ecc71; font-weight: 600;">${corrects}</td>
          <td style="padding: 10px; text-align: center; color: #ff4b4b; font-weight: 600;">${falses}</td>
          <td style="padding: 10px; text-align: center; color: ${ratioColor}; font-weight: 700;">${ratioText}</td>
        `;
        wordsTbody.appendChild(tr);
      });
    }
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
  const btnConjugation = document.getElementById("btn-direction-conjugation");
  if (!btnForward || !btnReverse) return;

  const baseLang = state.baseLang || "en";
  const targetLang = state.selectedLang || "de";

  const flags = {
    en: getFlagHtml("en"),
    de: getFlagHtml("de"),
    it: getFlagHtml("it"),
    es: getFlagHtml("es"),
    fr: getFlagHtml("fr")
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
  if (btnConjugation) {
    if (targetLang === "en") {
      btnConjugation.style.display = "none";
      if (state.testDirection === "conjugation") {
        state.testDirection = "forward";
        btnForward.classList.add("active");
        btnReverse.classList.remove("active");
        btnConjugation.classList.remove("active");
        saveState();
      }
    } else {
      btnConjugation.style.display = "";
      btnConjugation.innerHTML = `🎯 Conjugate (${targetFlag} ${targetName})`;
    }
  }
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

// Bind speech voices updated events and handle async voice loading in desktop browsers
if ('speechSynthesis' in window) {
  // Pre-trigger to initialize voice retrieval in Chrome/Edge
  window.speechSynthesis.getVoices();
  
  window.speechSynthesis.onvoiceschanged = () => {
    loadOnDeviceVoices();
  };

  // Multiple safety timers to handle lazy loaded voices
  setTimeout(loadOnDeviceVoices, 100);
  setTimeout(loadOnDeviceVoices, 500);
  setTimeout(loadOnDeviceVoices, 1000);
  setTimeout(loadOnDeviceVoices, 2500);
}

import {
  initBackupFile,
  onBackupFileAccessGranted,
  initICloudSync,
  selectICloudFolder,
  onICloudFolderAccessGranted,
  syncICloudFolder,
  saveWordlistToICloud,
  getSyncApiUrl,
  updateCloudSyncUI,
  getSanitizedSyncPayload,
  pushToCloud,
  pullFromCloud,
  generateCloudSyncCode,
  linkCloudSyncDevice,
  unlinkCloudSyncDevice,
  connectGitHubGist,
  pushToGitHubGist,
  pullFromGitHubGist,
  loadCloudWordSets,
  uploadActiveVocabToCloud
} from './modules/sync.js';

window.initBackupFile = initBackupFile;
window.onBackupFileAccessGranted = onBackupFileAccessGranted;
window.initICloudSync = initICloudSync;
window.selectICloudFolder = selectICloudFolder;
window.onICloudFolderAccessGranted = onICloudFolderAccessGranted;
window.syncICloudFolder = syncICloudFolder;
window.saveWordlistToICloud = saveWordlistToICloud;
window.updateCloudSyncUI = updateCloudSyncUI;
window.pushToCloud = pushToCloud;
window.pullFromCloud = pullFromCloud;
window.generateCloudSyncCode = generateCloudSyncCode;
window.linkCloudSyncDevice = linkCloudSyncDevice;
window.unlinkCloudSyncDevice = unlinkCloudSyncDevice;
window.connectGitHubGist = connectGitHubGist;
window.pushToGitHubGist = pushToGitHubGist;
window.pullFromGitHubGist = pullFromGitHubGist;

// ==========================================
// 19. Quick Translate Engine & Controllers
// ==========================================
let quickTranslateRecognition;
let isQuickTranslateListening = false;

function initQuickTranslateSpeech() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    return;
  }
  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  quickTranslateRecognition = new SpeechGen();
  quickTranslateRecognition.continuous = false;
  quickTranslateRecognition.interimResults = true;

  quickTranslateRecognition.onstart = () => {
    isQuickTranslateListening = true;
    const micBtn = document.getElementById("btn-quick-translate-mic");
    const status = document.getElementById("quick-translate-status");
    const pulse = document.getElementById("quick-translate-pulse");
    if (micBtn) micBtn.classList.add("listening");
    if (status) status.textContent = "Listening... Speak now!";
    if (pulse) pulse.classList.add("listening");
  };

  quickTranslateRecognition.onresult = async (event) => {
    let transcriptText = "";
    for (let i = 0; i < event.results.length; ++i) {
      transcriptText += event.results[i][0].transcript;
    }
    transcriptText = transcriptText.trim();
    
    const display = document.getElementById("quick-translate-input-display");
    if (display) {
      const folderId = document.getElementById("quick-translate-save-folder")?.value || "nouns";
      const speakLang = document.getElementById("quick-translate-lang")?.value || "en";
      display.textContent = normalizeWordCasing(transcriptText, speakLang, folderId) || "...";
    }

    // If it is final, trigger the translation query!
    const isFinal = event.results[event.results.length - 1].isFinal;
    if (isFinal && transcriptText) {
      runQuickTranslate(transcriptText);
    }
  };

  quickTranslateRecognition.onerror = (e) => {
    console.error("Quick translate speech error:", e);
    const status = document.getElementById("quick-translate-status");
    if (status) status.textContent = "Error: Try speaking again.";
    stopQuickTranslateSpeech();
  };

  quickTranslateRecognition.onend = () => {
    stopQuickTranslateSpeech();
  };
}

function startQuickTranslateSpeech() {
  if (!quickTranslateRecognition) {
    initQuickTranslateSpeech();
  }
  if (!quickTranslateRecognition) return;
  
  try {
    const speakLang = document.getElementById("quick-translate-lang").value;
    quickTranslateRecognition.lang = speakLang;
    quickTranslateRecognition.start();
  } catch (e) {
    console.error("Failed to start speech:", e);
  }
}

function stopQuickTranslateSpeech() {
  isQuickTranslateListening = false;
  const micBtn = document.getElementById("btn-quick-translate-mic");
  const status = document.getElementById("quick-translate-status");
  const pulse = document.getElementById("quick-translate-pulse");
  if (micBtn) micBtn.classList.remove("listening");
  if (status && status.textContent === "Listening... Speak now!") {
    status.textContent = "Processing...";
  } else if (status && status.textContent.startsWith("Error")) {
    // leave error
  } else if (status) {
    status.textContent = "Tap microphone to start speaking";
  }
  if (pulse) pulse.classList.remove("listening");
  
  if (quickTranslateRecognition) {
    try {
      quickTranslateRecognition.stop();
    } catch(e) {}
  }
}

function toggleQuickTranslateSpeech() {
  if (isQuickTranslateListening) {
    stopQuickTranslateSpeech();
  } else {
    startQuickTranslateSpeech();
  }
}

async function runQuickTranslate(text) {
  try {
    const targetGrid = document.getElementById("quick-translate-results");
    if (!targetGrid) return;
    
    targetGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary); font-size: 1.1rem; font-weight: 600;">
        <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 8px;">🔄</span> Auto-detecting language & translating...
      </div>
    `;
    
    // Auto detect source language
    const { detectedLang, translation: enTranslation } = await detectLanguageAndTranslateToEn(text);
    
    const supportedLangs = ["de", "en", "it", "es", "fr"];
    const sourceLang = supportedLangs.includes(detectedLang) ? detectedLang : (document.getElementById("quick-translate-lang")?.value || "en");
    
    // Update dropdown in UI to show detected language
    const quickLangSelect = document.getElementById("quick-translate-lang");
    if (quickLangSelect) {
      quickLangSelect.value = sourceLang;
      state.quickTranslateLastLang = sourceLang;
      saveState();
    }
    
    const langs = [
      { code: "de", name: "German", flag: "de" },
      { code: "en", name: "English", flag: "gb" },
      { code: "it", name: "Italian", flag: "it" },
      { code: "es", name: "Spanish", flag: "es" },
      { code: "fr", name: "French", flag: "fr" }
    ];
    
    // Include all languages (including source)
    const targets = langs;
    
    // Is it a single word?
    const isSingleWord = !text.trim().includes(" ");
    let englishBaseWord = enTranslation;
    let englishSynonyms = [];
    let isVerbFromDict = false;
    
    if (isSingleWord) {
      
      // Look up in dictionary API for English synonyms and verify verb status
      if (englishBaseWord) {
        try {
          const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(englishBaseWord)}`);
          if (dictRes.ok) {
            const dictData = await dictRes.json();
            const entry = dictData[0];
            if (entry && entry.meanings) {
              entry.meanings.forEach(m => {
                if (m.synonyms) englishSynonyms.push(...m.synonyms);
                if (m.partOfSpeech === "verb") isVerbFromDict = true;
              });
            }
          }
        } catch (e) {
          console.warn("Dictionary look up failed for synonyms:", e);
        }
      }
      englishSynonyms = [...new Set(englishSynonyms)].slice(0, 5);
    }
    
    // Check if input word or its English translation is a verb
    const isInputVerb = isVerbCheck(text, sourceLang) || (englishBaseWord && isVerbCheck(englishBaseWord, "en")) || (isSingleWord && isVerbFromDict);
    let translationSource = text;
    let translationSourceLang = sourceLang;
    
    const isValidEnglishVerb = englishBaseWord && (
      sourceLang === "en" || 
      englishBaseWord.toLowerCase().trim() !== text.toLowerCase().trim()
    );
    
    if (isInputVerb && isValidEnglishVerb) {
      if (!englishBaseWord.toLowerCase().startsWith("to ")) {
        englishBaseWord = "to " + englishBaseWord;
      }
      translationSource = englishBaseWord;
      translationSourceLang = "en";
    }

    // Translate to all other languages in parallel
    const folderId = document.getElementById("quick-translate-save-folder")?.value || "nouns";
    const resultsHtml = await Promise.all(targets.map(async (target) => {
      try {
        // 1. Core translation
        let translation = "";
        if (target.code === sourceLang) {
          translation = text;
        } else {
          translation = await translateTextGTX(translationSource, translationSourceLang, target.code);
        }
        translation = normalizeWordCasing(translation, target.code, folderId);
        
        // 2. Synonyms translation/fetching
        let synonymsHtml = "";
        let synonyms = [];
        try {
          synonyms = await fetchSynonymsForTarget(translation, target.code, sourceLang);
        } catch (e) {
          console.warn("Failed to get synonyms for", target.code, e);
        }
        
        // Fallback to English dictionary synonyms if target is English and we didn't get any
        if (synonyms.length === 0 && target.code === "en" && englishSynonyms.length > 0) {
          synonyms = englishSynonyms;
        }

        if (synonyms.length > 0) {
          const uniqueSyns = [...new Set(synonyms)].filter(s => s.toLowerCase() !== translation.toLowerCase());
          if (uniqueSyns.length > 0) {
            synonymsHtml = `
              <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
                <strong style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Synonyms:</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${uniqueSyns.map(s => `<span class="badge" style="background: rgba(255,255,255,0.04); color: var(--text-secondary); font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color); font-weight: 500; cursor: pointer;" onclick="speakWord('${s.replace(/'/g, "\\'")}', '${target.code}')" title="Click to hear pronunciation">${s}</span>`).join("")}
                </div>
              </div>
            `;
          }
        }

        // 3. Conjugations check
        let conjugationsHtml = "";
        try {
          // Only show conjugation if the translated word is actually a verb in the target language
          const isTargetVerb = isVerbCheck(translation, target.code) || 
                               (target.code === "en" && (translation.startsWith("to ") || isVerbAnyLanguage(translationSource)));
          if (isTargetVerb) {
            const fakeWordObj = { target: translation, en: englishBaseWord || text, category: "verbs" };
            const conjugations = getConjugationsForVerb(fakeWordObj, target.code);
            const pronouns = PRONOUNS[target.code] || PRONOUNS.en;
            if (conjugations && conjugations.length > 0) {
              conjugationsHtml = `
                <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
                  <strong style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Conjugations:</strong>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 0.85rem; color: var(--text-primary); text-align: left;">
                    ${pronouns.slice(0, 6).map((pronoun, i) => `
                      <div style="display: flex; gap: 4px; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 2px;">
                        <span style="color: var(--text-secondary); font-weight: 500;">${pronoun}</span>
                        <span style="font-weight: 600; color: ${getLangColor(target.code)};">${conjugations[i] || ""}</span>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `;
            }
          }
        } catch (e) {
          console.warn("Conjugations failed for", target.code, e);
        }
        
        const flagUrl = target.code === "en" ? "https://flagcdn.com/16x12/gb.png" : `https://flagcdn.com/16x12/${target.code}.png`;
        const flagStyle = `vertical-align: middle; margin-right: 8px; border-radius: 2px; box-shadow: 0 0 2px rgba(0,0,0,0.5);`;
        const langColor = getLangColor(target.code);
        
        return `
          <div class="card" style="margin: 0; padding: 22px; display: flex; flex-direction: column; justify-content: space-between; border-left: 5px solid ${langColor}; background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); border-radius: 12px; border-top: 1px solid rgba(255,255,255,0.04); border-right: 1px solid rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.04); box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
            <div>
              <div style="display: flex; align-items: center; margin-bottom: 14px;">
                <img src="${flagUrl}" width="16" height="12" style="${flagStyle}">
                <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">${target.name}</strong>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: ${langColor}; word-wrap: break-word; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;" onclick="speakWord('${translation.replace(/'/g, "\\'")}', '${target.code}')" title="Click to hear pronunciation">
                <span>${translation}</span>
                <span style="font-size: 1.1rem; opacity: 0.5; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5;">🔊</span>
              </div>
            </div>
            ${synonymsHtml}
            ${conjugationsHtml}
          </div>
        `;
      } catch (err) {
        console.error("Card render failed for", target.code, err);
        return `<div class="card" style="margin:0; padding:22px; color:var(--error-color);">Error loading ${target.name}</div>`;
      }
    }));
    
    targetGrid.innerHTML = resultsHtml.join("");
    
    // Set status
    const status = document.getElementById("quick-translate-status");
    if (status) status.textContent = "Translation Complete!";

    // Show and populate save-to-list section!
    populateQuickTranslateFolders();
    const saveBox = document.getElementById("quick-translate-save-box");
    if (saveBox) saveBox.style.display = "flex";
  } catch (err) {
    console.error("runQuickTranslate crash:", err);
    alert("Error: " + err.message + "\nStack: " + err.stack);
  }
}

function populateQuickTranslateFolders() {
  const selectEl = document.getElementById("quick-translate-save-folder");
  if (!selectEl) return;
  
  // Save current selection if any
  const currentSelection = selectEl.value || state.quickTranslateLastFolder;
  
  selectEl.innerHTML = "";
  
  // Custom folders
  if (state.customFolders && state.customFolders.length > 0) {
    state.customFolders.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = folder.name;
      selectEl.appendChild(opt);
    });
  } else {
    // Fallback static folders
    const staticFolders = [
      { id: "nouns", name: "Nouns" },
      { id: "verbs", name: "Verbs" },
      { id: "technology", name: "Technology" },
      { id: "biology", name: "Biology" },
      { id: "phrases", name: "Phrases" }
    ];
    staticFolders.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = folder.name;
      selectEl.appendChild(opt);
    });
  }
  
  // Restore selection if it exists in the newly built list
  if (currentSelection) {
    selectEl.value = currentSelection;
  }
}

async function saveQuickTranslateWord() {
  const spokenText = document.getElementById("quick-translate-input-display").textContent.trim();
  const folderId = document.getElementById("quick-translate-save-folder").value;
  
  if (!spokenText || spokenText === "...") {
    showCustomAlert("Please speak a word or phrase first!");
    return;
  }

  // Show temporary loading indicator on save button
  const saveBtn = document.getElementById("btn-quick-translate-save");
  const originalHtml = saveBtn ? saveBtn.innerHTML : "";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `🔄 Saving...`;
  }
  
  try {
    // Auto detect source language
    const { detectedLang, translation: enTranslation } = await detectLanguageAndTranslateToEn(spokenText);
    
    const supportedLangs = ["de", "en", "it", "es", "fr"];
    const sourceLang = supportedLangs.includes(detectedLang) ? detectedLang : (document.getElementById("quick-translate-lang")?.value || "en");
    
    let englishBaseWord = enTranslation;

    // Check if input word or its English translation is a verb
    const isInputVerb = isVerbAnyLanguage(spokenText) || (englishBaseWord && isVerbAnyLanguage(englishBaseWord));

    let translationSource = spokenText;
    let translationSourceLang = sourceLang;
    
    const isValidEnglishVerb = englishBaseWord && (
      sourceLang === "en" || 
      englishBaseWord.toLowerCase().trim() !== spokenText.toLowerCase().trim()
    );
    
    if (isInputVerb && isValidEnglishVerb) {
      if (!englishBaseWord.toLowerCase().startsWith("to ")) {
        englishBaseWord = "to " + englishBaseWord;
      }
      translationSource = englishBaseWord;
      translationSourceLang = "en";
    }

    // Translate to all 5 languages to store complete details
    const langs = ["de", "en", "it", "es", "fr"];
    const wordData = {};
    
    for (const lang of langs) {
      const trans = await translateTextGTX(translationSource, translationSourceLang, lang);
      wordData[lang] = normalizeWordCasing(trans, lang, folderId);
    }
    
    // Create new custom vocabulary item
    const newWord = {
      id: Date.now().toString(),
      en: wordData.en,
      de: wordData.de,
      it: wordData.it,
      es: wordData.es,
      fr: wordData.fr,
      category: folderId,
      details: {
        articles: {},
        sentences: {},
        variations: {},
        synonyms: {}
      }
    };
    
    // Deduplicate: check if already exists in customVocab
    const base = state.baseLang || "en";
    const duplicate = state.customVocab.find(v => (v[base] || "").toLowerCase() === (newWord[base] || "").toLowerCase());
    if (duplicate) {
      showCustomAlert("This word is already in your custom list!");
      return;
    }
    
    state.customVocab.push(newWord);
    state.quickTranslateLastFolder = folderId;
    saveState();
    
    // Sync to iCloud folder if selected
    if (state.icloudHandle) {
      await saveWordlistToICloud(folderId);
    }
    
    showCustomAlert(`🎉 Word successfully saved to list!`);
    
    // Hide save box after saving
    const saveBox = document.getElementById("quick-translate-save-box");
    if (saveBox) saveBox.style.display = "none";
  } catch (err) {
    console.error("Failed to save word:", err);
    showCustomAlert("Failed to save word to list.");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

function normalizeWordCasing(text, lang, category = "") {
  if (!text) return "";
  let clean = text.trim();
  
  // Rule: Only German nouns should have a capital first letter!
  // All other languages (en, it, es, fr) should generally be lowercase.
  // Also, German verbs/adjectives should be lowercase!
  const isGerman = (lang === "de");
  const isNoun = (category.toLowerCase() === "nouns" || category.toLowerCase() === "technology" || category.toLowerCase() === "biology");
  
  if (isGerman && isNoun) {
    // Capitalize first letter
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  } else {
    // Lowercase first letter if it is uppercase
    if (clean.length > 0) {
      return clean.charAt(0).toLowerCase() + clean.slice(1);
    }
  }
  return clean;
}

function isVerbCheck(text, lang) {
  if (!text) return false;
  const clean = text.toLowerCase().trim();
  if (lang === "en") {
    return clean.startsWith("to ");
  }
  if (lang === "de") {
    return clean.startsWith("zu ") || clean.endsWith("en");
  }
  if (lang === "it") {
    return clean.endsWith("are") || clean.endsWith("ere") || clean.endsWith("ire") || clean.endsWith("arsi") || clean.endsWith("ersi") || clean.endsWith("irsi");
  }
  if (lang === "es") {
    return clean.endsWith("ar") || clean.endsWith("er") || clean.endsWith("ir") || clean.endsWith("arse") || clean.endsWith("erse") || clean.endsWith("irse");
  }
  if (lang === "fr") {
    return clean.endsWith("er") || clean.endsWith("ir") || clean.endsWith("re") || clean.endsWith("oir") || clean.startsWith("se ") || clean.startsWith("s'");
  }
  return false;
}

function isVerbAnyLanguage(text) {
  if (!text) return false;
  const langs = ["de", "en", "it", "es", "fr"];
  for (const lang of langs) {
    if (isVerbCheck(text, lang)) return true;
  }
  return false;
}

async function detectLanguageAndTranslateToEn(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const detectedLang = data[2] || "en";
      const translation = data[0].map(item => item[0]).join("");
      return { detectedLang, translation };
    }
  } catch (e) {
    console.warn("Language detection failed:", e);
  }
  return { detectedLang: "en", translation: text };
}

async function fetchSynonymsForTarget(word, targetLang, sourceLang = "de") {
  if (!word || word === "...") return [];
  
  // Clean translation if it contains articles
  const cleanWord = stripArticles(word, targetLang).trim();
  
  // Try using AI if key is configured
  const hasKey = state.openaiKey || state.grokKey || state.geminiKey || state.anthropicKey;
  if (hasKey) {
    try {
      const prompt = `Give me exactly 5 synonyms (single words or very short phrases) for the word "${cleanWord}" in language "${targetLang}". 
      Return ONLY a JSON array of strings, for example: ["syn1", "syn2", "syn3", "syn4", "syn5"]. 
      Do not include formatting or explanations.`;
      const resText = await callLLM(prompt, "You are a helpful dictionary assistant.");
      const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(s => s.trim()).slice(0, 5);
      }
    } catch (e) {
      console.warn("AI Synonyms fetch failed:", e);
    }
  }

  // Fallback to Google Translate alternative translations
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=at&q=${encodeURIComponent(cleanWord)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data[5] && data[5][0] && data[5][0][2]) {
        const alts = data[5][0][2].map(item => item[0]);
        const uniqueAlts = alts.filter(a => a.toLowerCase() !== cleanWord.toLowerCase() && a.toLowerCase() !== word.toLowerCase());
        if (uniqueAlts.length > 0) {
          return uniqueAlts.slice(0, 5);
        }
      }
    }
  } catch (e) {
    console.warn("Google Translate synonyms fetch failed:", e);
  }

  return [];
}

// Expose functions globally to window for modules/state.js and inline html event handlers
window.updateHeaderUI = updateHeaderUI;
window.testApiKey = testApiKey;
window.updateDirectionButtonsUI = updateDirectionButtonsUI;
window.loadOnDeviceVoices = loadOnDeviceVoices;
window.renderImportedList = renderImportedList;
window.renderMistakesList = renderMistakesList;
window.renderHistoryList = renderHistoryList;
window.updateCloudSyncUI = updateCloudSyncUI;
window.voteDifficulty = voteDifficulty;
window.showView = showView;
window.exportBackupData = exportBackupData;
window.handleBackupFileButtonClick = handleBackupFileButtonClick;
window.changeBackupFile = changeBackupFile;
window.stopSpeechQueue = stopSpeechQueue;
window.speakWord = speakWord;
window.speakQuickTranslation = speakQuickTranslation;

// Expose internal functions for modules/init.js and on-device features
window.loadStarterVocab = loadStarterVocab;
window.loadFrequencyLists = loadFrequencyLists;
window.initICloudSync = initICloudSync;
window.initBackupFile = initBackupFile;
window.initQuickTranslateSpeech = initQuickTranslateSpeech;
window.toggleQuickTranslateSpeech = toggleQuickTranslateSpeech;
window.stopQuickTranslateSpeech = stopQuickTranslateSpeech;
window.runQuickTranslate = runQuickTranslate;
window.populateQuickTranslateFolders = populateQuickTranslateFolders;
window.saveQuickTranslateWord = saveQuickTranslateWord;
window.normalizeWordCasing = normalizeWordCasing;
window.isVerbCheck = isVerbCheck;
window.detectLanguageAndTranslateToEn = detectLanguageAndTranslateToEn;
window.fetchSynonymsForTarget = fetchSynonymsForTarget;
window.FREQUENCY_LISTS = FREQUENCY_LISTS;


