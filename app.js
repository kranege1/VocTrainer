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
          origEn: item.en || qText,
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
          origEn: item.en || qText,
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

  // Sort pool based on the requested priority:
  // 1. Untested words (attempts === 0)
  // 2. Wrong words (attempts > 0 && errors > 0)
  // 3. Correct words (attempts > 0 && errors === 0) with "easy" rating at the very end
  pool.sort((a, b) => {
    const statsA = state.wordStats[a.origEn || a.en] || { attempts: 0, errors: 0, difficulty: "medium" };
    const statsB = state.wordStats[b.origEn || b.en] || { attempts: 0, errors: 0, difficulty: "medium" };

    // Get Tier of A
    let tierA = 3; // default: Correct
    if ((statsA.attempts || 0) === 0) {
      tierA = 1; // Untested
    } else if ((statsA.errors || 0) > 0) {
      tierA = 2; // Wrong
    }

    // Get Tier of B
    let tierB = 3;
    if ((statsB.attempts || 0) === 0) {
      tierB = 1;
    } else if ((statsB.errors || 0) > 0) {
      tierB = 2;
    }

    if (tierA !== tierB) {
      return tierA - tierB; // Sort by tier ascending (1 first, then 2, then 3)
    }

    // Within Tier 3 (Correct words), put "easy" words at the very end
    if (tierA === 3) {
      const isEasyA = (statsA.difficulty === "easy") ? 1 : 0;
      const isEasyB = (statsB.difficulty === "easy") ? 1 : 0;
      if (isEasyA !== isEasyB) {
        return isEasyA - isEasyB; // 0 (non-easy) comes before 1 (easy)
      }
    }

    // Secondary sort: randomize within the same tier
    return Math.random() - 0.5;
  });

  const wordsToTest = pool.slice(0, count);

  const activeMode = document.querySelector(".mode-toggle-btn.active")?.dataset.mode || "typing";
  
  // Ensure the correct mode section is displayed in the DOM
  document.querySelectorAll(".test-mode-section").forEach(s => s.classList.remove("active"));
  const activeSection = document.getElementById(`test-mode-${activeMode}`);
  if (activeSection) {
    activeSection.classList.add("active");
  }

  state.currentTest = {
    words: wordsToTest,
    index: 0,
    wrongAnswers: [],
    isRepeatRound: false,
    correctCount: 0,
    totalOriginalCount: wordsToTest.length,
    selectedMode: activeMode,
    points: 0
  };

  showView("view-test");
  renderQuestion();
}

function submitTimeUpAnswer() {
  if (document.getElementById("feedback-overlay").classList.contains("active")) return;
  
  const mode = state.currentTest.selectedMode;
  if (mode === "typing") {
    document.getElementById("input-typing-answer").value = "";
  } else if (mode === "bubbles") {
    document.getElementById("bubble-selected-zone").innerHTML = "";
  } else if (mode === "speech") {
    document.getElementById("speech-transcript").textContent = "";
  }
  submitAnswer();
}

function updateTestStatsMini() {
  const tState = state.currentTest;
  if (!tState) return;
  const correctEl = document.getElementById("test-correct-count");
  const wrongEl = document.getElementById("test-wrong-count");
  const pointsEl = document.getElementById("test-points-count");
  if (correctEl) correctEl.textContent = tState.correctCount;
  if (wrongEl) wrongEl.textContent = tState.wrongAnswers.length;
  if (pointsEl) pointsEl.textContent = tState.points || 0;
}

window.voteDifficulty = function(level) {
  const tState = state.currentTest;
  if (!tState) return;
  const currentWord = tState.words[tState.index];
  if (!currentWord) return;
  
  const wordKey = currentWord.origEn || currentWord.en;
  if (!state.wordStats[wordKey]) {
    state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
  }
  
  state.wordStats[wordKey].difficulty = level;
  saveState();
  updateDifficultyVoteUI(level);
};

function updateDifficultyVoteUI(level) {
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

function buildCompareMode() {
  const tState = state.currentTest;
  if (!tState) return;
  
  // Hide prompt card and category tag
  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  if (wordCardWrapper) wordCardWrapper.style.display = "none";
  if (catTag) catTag.style.display = "none";
  
  // Hide check answer button since game is interactive
  const submitBtn = document.getElementById("btn-submit-answer");
  if (submitBtn) submitBtn.style.display = "none";

  // Pick up to 5 words starting from current index
  const batch = tState.words.slice(tState.index, tState.index + 5);
  if (batch.length === 0) {
    finishTestRound();
    return;
  }

  // Update progress text
  document.getElementById("test-progress-text").textContent = `Matching Batch (${tState.index + 1} - ${tState.index + batch.length}/${tState.words.length})`;
  const progressPercent = (tState.index / tState.words.length) * 100;
  document.getElementById("test-progress-fill").style.width = `${progressPercent}%`;

  const leftCol = document.getElementById("compare-col-left");
  const rightCol = document.getElementById("compare-col-right");
  if (!leftCol || !rightCol) return;

  leftCol.innerHTML = "";
  rightCol.innerHTML = "";

  window.compareLeftSelected = null;
  window.compareRightSelected = null;
  window.compareMatchedCount = 0;

  // Clear timer interval
  if (window.questionTimerInterval) {
    clearInterval(window.questionTimerInterval);
    window.questionTimerInterval = null;
  }
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
  
  playSound("sound-bubble"); // gentle click sound

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
      playSound("sound-correct");
      
      left.btn.classList.remove("selected");
      left.btn.classList.add("matched");
      right.btn.classList.remove("selected");
      right.btn.classList.add("matched");
      
      window.compareLeftSelected = null;
      window.compareRightSelected = null;
      window.compareMatchedCount++;
      
      // Update statistics: Correct
      const wordKey = left.word.origEn || left.word.en;
      if (!state.wordStats[wordKey]) {
        state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
      }
      const stats = state.wordStats[wordKey];
      stats.attempts = (stats.attempts || 0) + 1;
      stats.lastReview = Date.now();
      if (!stats.box) stats.box = 1;
      if (stats.box < 5) stats.box++;
      
      // Points addition: Compare mode uses x0.5 multiplier
      let qPoints = 100 * 0.5;
      
      if (state.questionTimer > 0) {
        const limit = state.questionTimer;
        let timerLimitMult = 1.0;
        if (limit === 5) timerLimitMult = 3.0;
        else if (limit === 10) timerLimitMult = 2.0;
        else if (limit === 15) timerLimitMult = 1.5;
        qPoints = qPoints * timerLimitMult;
      }
      
      state.currentTest.points = (state.currentTest.points || 0) + Math.round(qPoints);
      state.currentTest.correctCount++;
      updateTestStatsMini();
      
      const batch = state.currentTest.words.slice(state.currentTest.index, state.currentTest.index + 5);
      if (window.compareMatchedCount === batch.length) {
        setTimeout(() => {
          showCompareFeedback(batch);
        }, 300);
      }
    } else {
      playSound("sound-incorrect");
      
      left.btn.style.borderColor = "var(--error-color)";
      right.btn.style.borderColor = "var(--error-color)";
      
      setTimeout(() => {
        left.btn.style.borderColor = "";
        right.btn.style.borderColor = "";
        left.btn.classList.remove("selected");
        right.btn.classList.remove("selected");
      }, 500);

      const wordKey = left.word.origEn || left.word.en;
      if (!state.wordStats[wordKey]) {
        state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
      }
      const stats = state.wordStats[wordKey];
      stats.attempts = (stats.attempts || 0) + 1;
      stats.errors = (stats.errors || 0) + 1;
      stats.lastReview = Date.now();
      stats.box = 1;

      recordMistake(left.word);

      if (!state.currentTest.wrongAnswers.find(w => w.en === left.word.en)) {
        state.currentTest.wrongAnswers.push(left.word);
      }
      
      updateTestStatsMini();
      
      window.compareLeftSelected = null;
      window.compareRightSelected = null;
    }
  }
}

function showCompareFeedback(batch) {
  const tState = state.currentTest;
  if (!tState) return;

  saveState();

  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");
  
  if (overlay) {
    overlay.className = "test-right-pane active correct-ans";
    fTitle.textContent = "Compare Set Complete!";
    fIcon.textContent = "🏆";
    fDesc.textContent = `Great matching! You successfully completed this comparison set.`;
    
    // Hide details container and difficulty voting
    const detailsContainer = document.getElementById("word-details-container");
    if (detailsContainer) detailsContainer.style.display = "none";
    
    const diffVoting = document.querySelector(".difficulty-voting-container");
    if (diffVoting) diffVoting.style.display = "none";

    const nextBtn = document.getElementById("btn-next-question");
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = "Continue";
      nextBtn.onclick = () => {
        overlay.classList.remove("active");
        tState.index += batch.length; // Advance by the size of the matched batch (5)
        if (tState.index < tState.words.length) {
          buildCompareMode();
        } else {
          finishTestRound();
        }
      };
    }
  }
}

const IMPORTANT_VERBS = {
  de: [
    { target: "sein", translations: { de: "sein", en: "to be", it: "essere", es: "ser/estar", fr: "être" } },
    { target: "haben", translations: { de: "haben", en: "to have", it: "avere", es: "haber/tener", fr: "avoir" } },
    { target: "werden", translations: { de: "werden", en: "to become", it: "diventare", es: "convertirse", fr: "devenir" } },
    { target: "können", translations: { de: "können", en: "to be able to", it: "potere", es: "poder", fr: "pouvoir" } },
    { target: "müssen", translations: { de: "müssen", en: "to must / to have to", it: "dovere", es: "deber", fr: "devoir" } },
    { target: "wollen", translations: { de: "wollen", en: "to want", it: "volere", es: "querer", fr: "vouloir" } },
    { target: "sollen", translations: { de: "sollen", en: "to should", it: "dovere (sollen)", es: "deber", fr: "devoir" } },
    { target: "dürfen", translations: { de: "dürfen", en: "to be allowed to", it: "potere (dürfen)", es: "poder (dürfen)", fr: "pouvoir (autorisé)" } },
    { target: "wissen", translations: { de: "wissen", en: "to know", it: "sapere", es: "saber", fr: "savoir" } },
    { target: "geben", translations: { de: "geben", en: "to give", it: "dare", es: "dar", fr: "donner" } },
    { target: "tun", translations: { de: "tun", en: "to do", it: "fare", es: "hacer", fr: "faire" } },
    { target: "sagen", translations: { de: "sagen", en: "to say", it: "dire", es: "decir", fr: "dire" } },
    { target: "gehen", translations: { de: "gehen", en: "to go", it: "andare", es: "ir", fr: "aller" } },
    { target: "sehen", translations: { de: "sehen", en: "to see", it: "vedere", es: "ver", fr: "voir" } },
    { target: "kommen", translations: { de: "kommen", en: "to come", it: "venire", es: "venir", fr: "venir" } },
    { target: "denken", translations: { de: "denken", en: "to think", it: "pensare", es: "pensar", fr: "penser" } },
    { target: "machen", translations: { de: "machen", en: "to make / to do", it: "fare", es: "hacer", fr: "faire" } },
    { target: "stehen", translations: { de: "stehen", en: "to stand", it: "stare in piedi", es: "estar de pie", fr: "être debout" } },
    { target: "finden", translations: { de: "finden", en: "to find", it: "trovare", es: "encontrar", fr: "trouver" } },
    { target: "bleiben", translations: { de: "bleiben", en: "to stay", it: "rimanere", es: "quedarse", fr: "rester" } },
    { target: "nehmen", translations: { de: "nehmen", en: "to take", it: "prendere", es: "tomar", fr: "prendre" } },
    { target: "lassen", translations: { de: "lassen", en: "to let / to leave", it: "lasciare", es: "dejar", fr: "laisser" } },
    { target: "zeigen", translations: { de: "zeigen", en: "to show", it: "mostrare", es: "mostrar", fr: "montrer" } },
    { target: "bringen", translations: { de: "bringen", en: "to bring", it: "portare", es: "traer", fr: "apporter" } },
    { target: "leben", translations: { de: "leben", en: "to live", it: "vivere", es: "vivir", fr: "vivre" } },
    { target: "fahren", translations: { de: "fahren", en: "to drive / to ride", it: "guidare / andare", es: "conducir / ir", fr: "conduire / aller" } },
    { target: "sprechen", translations: { de: "sprechen", en: "to speak", it: "parlare", es: "hablar", fr: "parler" } },
    { target: "schreiben", translations: { de: "schreiben", en: "to write", it: "scrivere", es: "escribir", fr: "écrire" } },
    { target: "lesen", translations: { de: "lesen", en: "to read", it: "leggere", es: "leer", fr: "lire" } },
    { target: "arbeiten", translations: { de: "arbeiten", en: "to work", it: "lavorare", es: "trabajar", fr: "travailler" } }
  ],
  it: [
    { target: "essere", translations: { de: "sein", en: "to be", it: "essere", es: "ser/estar", fr: "être" } },
    { target: "avere", translations: { de: "haben", en: "to have", it: "avere", es: "haber/tener", fr: "avoir" } },
    { target: "fare", translations: { de: "tun/machen", en: "to do / to make", it: "fare", es: "hacer", fr: "faire" } },
    { target: "dire", translations: { de: "sagen/erzählen", en: "to say / to tell", it: "dire", es: "decir", fr: "dire" } },
    { target: "potere", translations: { de: "können", en: "to be able to", it: "potere", es: "poder", fr: "pouvoir" } },
    { target: "volere", translations: { de: "wollen", en: "to want", it: "volere", es: "querer", fr: "vouloir" } },
    { target: "dovere", translations: { de: "müssen", en: "to must / to have to", it: "dovere", es: "deber", fr: "devoir" } },
    { target: "andare", translations: { de: "gehen", en: "to go", it: "andare", es: "ir", fr: "aller" } },
    { target: "sapere", translations: { de: "wissen", en: "to know", it: "sapere", es: "saber", fr: "savoir" } },
    { target: "venire", translations: { de: "kommen", en: "to come", it: "venire", es: "venir", fr: "venir" } },
    { target: "stare", translations: { de: "bleiben/sein", en: "to stay / to be", it: "stare", es: "estar/quedarse", fr: "rester/être" } },
    { target: "prendere", translations: { de: "nehmen", en: "to take", it: "prendere", es: "tomar", fr: "prendre" } },
    { target: "parlare", translations: { de: "sprechen", en: "to speak", it: "parlare", es: "hablar", fr: "parler" } },
    { target: "trovare", translations: { de: "finden", en: "to find", it: "trovare", es: "encontrar", fr: "trover" } },
    { target: "sentire", translations: { de: "fühlen/hören", en: "to feel / to hear", it: "sentire", es: "sentir/oír", fr: "sentir/entendre" } },
    { target: "lasciare", translations: { de: "lassen/verlassen", en: "to leave", it: "lasciare", es: "dejar", fr: "laisser" } },
    { target: "vedere", translations: { de: "sehen", en: "to see", it: "vedere", es: "ver", fr: "voir" } },
    { target: "mettere", translations: { de: "legen/stellen", en: "to put", it: "mettere", es: "poner", fr: "mettre" } },
    { target: "pensare", translations: { de: "denken", en: "to think", it: "pensare", es: "pensar", fr: "penser" } },
    { target: "capire", translations: { de: "verstehen", en: "to understand", it: "capire", es: "entender", fr: "comprendre" } },
    { target: "finire", translations: { de: "beenden/enden", en: "to finish", it: "finire", es: "terminar", fr: "finir" } },
    { target: "aprire", translations: { de: "öffnen", en: "to open", it: "aprire", es: "abrir", fr: "ouvrir" } },
    { target: "chiudere", translations: { de: "schließen", en: "to close", it: "chiudere", es: "cerrar", fr: "fermer" } },
    { target: "leggere", translations: { de: "lesen", en: "to read", it: "leggere", es: "leer", fr: "lire" } },
    { target: "scrivere", translations: { de: "schreiben", en: "to write", it: "scrivere", es: "escribir", fr: "écrire" } },
    { target: "ascoltare", translations: { de: "zuhören", en: "to listen", it: "ascoltare", es: "escuchar", fr: "écouter" } },
    { target: "mangiare", translations: { de: "essen", en: "to eat", it: "mangiare", es: "comer", fr: "manger" } },
    { target: "bere", translations: { de: "trinken", en: "to drink", it: "bere", es: "beber", fr: "boire" } },
    { target: "uscire", translations: { de: "hinausgehen", en: "to go out", it: "uscire", es: "salir", fr: "sortir" } },
    { target: "dare", translations: { de: "geben", en: "to give", it: "dare", es: "dar", fr: "donner" } }
  ],
  es: [
    { target: "ser", translations: { de: "sein (dauerhaft)", en: "to be (permanent)", it: "essere", es: "ser", fr: "être" } },
    { target: "estar", translations: { de: "sein (vorübergehend)", en: "to be (temporary)", it: "stare/essere", es: "estar", fr: "être" } },
    { target: "haber", translations: { de: "haben (Hilfsverb)", en: "to have (auxiliary)", it: "avere (ausiliare)", es: "haber", fr: "avoir" } },
    { target: "tener", translations: { de: "haben/besitzen", en: "to have", it: "avere", es: "tener", fr: "avoir" } },
    { target: "hacer", translations: { de: "tun/machen", en: "to do / to make", it: "fare", es: "hacer", fr: "faire" } },
    { target: "poder", translations: { de: "können", en: "to be able to", it: "potere", es: "poder", fr: "pouvoir" } },
    { target: "decir", translations: { de: "sagen", en: "to say / to tell", it: "dire", es: "decir", fr: "dire" } },
    { target: "ir", translations: { de: "gehen", en: "to go", it: "andare", es: "ir", fr: "aller" } },
    { target: "ver", translations: { de: "sehen", en: "to see", it: "vedere", es: "ver", fr: "voir" } },
    { target: "dar", translations: { de: "geben", en: "to give", it: "dare", es: "dar", fr: "donner" } },
    { target: "saber", translations: { de: "wissen (Information)", en: "to know (information)", it: "sapere", es: "saber", fr: "savoir" } },
    { target: "querer", translations: { de: "wollen/lieben", en: "to want / to love", it: "volere/amare", es: "querer", fr: "vouloir/aimer" } },
    { target: "llegar", translations: { de: "ankommen", en: "to arrive", it: "arrivare", es: "llegar", fr: "arriver" } },
    { target: "pasar", translations: { de: "verbringen/geschehen", en: "to pass / to happen", it: "passare/accadere", es: "pasar", fr: "passer/se passer" } },
    { target: "deber", translations: { de: "müssen/schulden", en: "to must / to owe", it: "dovere/dovere soldi", es: "deber", fr: "devoir" } },
    { target: "poner", translations: { de: "setzen/legen/stellen", en: "to put", it: "mettere", es: "poner", fr: "mettre" } },
    { target: "parecer", translations: { de: "scheinen", en: "to seem", it: "sembrare", es: "parecer", fr: "sembler" } },
    { target: "hablar", translations: { de: "sprechen", en: "to speak", it: "parlare", es: "hablar", fr: "parler" } },
    { target: "quedar", translations: { de: "bleiben", en: "to stay / to remain", it: "rimanere", es: "quedar", fr: "rester" } },
    { target: "creer", translations: { de: "glauben", en: "to believe", it: "credere", es: "creer", fr: "croire" } },
    { target: "llevar", translations: { de: "tragen/bringen", en: "to carry / to wear", it: "portare/indossare", es: "llevar", fr: "porter/apporter" } },
    { target: "tomar", translations: { de: "nehmen/trinken", en: "to take / to drink", it: "prendere/bere", es: "tomar", fr: "prendre/boire" } },
    { target: "encontrar", translations: { de: "finden", en: "to find", it: "trovare", es: "encontrar", fr: "trouver" } },
    { target: "entender", translations: { de: "verstehen", en: "to understand", it: "capire", es: "entender", fr: "comprendre" } },
    { target: "sentir", translations: { de: "fühlen/bedauern", en: "to feel / to regret", it: "sentire", es: "sentir", fr: "sentir/regretter" } },
    { target: "pensar", translations: { de: "denken", en: "to think", it: "pensare", es: "pensar", fr: "penser" } },
    { target: "escribir", translations: { de: "schreiben", en: "to write", it: "scrivere", es: "escribir", fr: "escribir" } },
    { target: "leer", translations: { de: "lesen", en: "to read", it: "leggere", es: "leer", fr: "leer" } },
    { target: "comer", translations: { de: "essen", en: "to eat", it: "mangiare", es: "comer", fr: "comer" } },
    { target: "vivir", translations: { de: "leben", en: "to live", it: "vivere", es: "vivir", fr: "vivir" } }
  ],
  fr: [
    { target: "être", translations: { de: "sein", en: "to be", it: "essere", es: "ser/estar", fr: "être" } },
    { target: "avoir", translations: { de: "haben", en: "to have", it: "avere", es: "haber/tener", fr: "avoir" } },
    { target: "faire", translations: { de: "tun/machen", en: "to do / to make", it: "faire", es: "hacer", fr: "faire" } },
    { target: "dire", translations: { de: "sagen", en: "to say / to tell", it: "dire", es: "decir", fr: "dire" } },
    { target: "aller", translations: { de: "gehen", en: "to go", it: "aller", es: "ir", fr: "aller" } },
    { target: "voir", translations: { de: "sehen", en: "to see", it: "vedere", es: "ver", fr: "voir" } },
    { target: "savoir", translations: { de: "wissen", en: "to know", it: "sapere", es: "saber", fr: "savoir" } },
    { target: "pouvoir", translations: { de: "können", en: "to be able to", it: "potere", es: "poder", fr: "pouvoir" } },
    { target: "vouloir", translations: { de: "wollen", en: "to want", it: "volere", es: "querer", fr: "vouloir" } },
    { target: "devoir", translations: { de: "müssen/schulden", en: "to must / to owe", it: "dovere", es: "deber", fr: "devoir" } },
    { target: "prendre", translations: { de: "nehmen", en: "to take", it: "prendere", es: "tomar", fr: "prendre" } },
    { target: "venir", translations: { de: "kommen", en: "to come", it: "venire", es: "venir", fr: "venir" } },
    { target: "mettre", translations: { de: "setzen/legen/stellen", en: "to put", it: "mettere", es: "poner", fr: "mettre" } },
    { target: "parler", translations: { de: "sprechen", en: "to speak", it: "parlare", es: "hablar", fr: "parler" } },
    { target: "trouver", translations: { de: "finden", en: "to find", it: "trovare", es: "encontrar", fr: "trouver" } },
    { target: "donner", translations: { de: "geben", en: "to give", it: "dare", es: "dar", fr: "donner" } },
    { target: "falloir", translations: { de: "nötig sein", en: "to be necessary", it: "volerci / essere necessario", es: "ser necesario", fr: "falloir" } },
    { target: "passer", translations: { de: "verbringen/vorbeigehen", en: "to pass / to spend", it: "passare", es: "pasar", fr: "passer" } },
    { target: "comprendre", translations: { de: "verstehen", en: "to understand", it: "capire", es: "entender", fr: "comprendre" } },
    { target: "aimer", translations: { de: "lieben/mögen", en: "to love / to like", it: "amare/piacere", es: "amar/querer", fr: "aimer" } },
    { target: "croire", translations: { de: "glauben", en: "to believe", it: "credere", es: "creer", fr: "croire" } },
    { target: "demander", translations: { de: "fragen/bitten", en: "to ask", it: "chiedere", es: "preguntar/pedir", fr: "demander" } },
    { target: "penser", translations: { de: "denken", en: "to think", it: "pensare", es: "pensar", fr: "penser" } },
    { target: "écrire", translations: { de: "schreiben", en: "to write", it: "scrivere", es: "escribir", fr: "écrire" } },
    { target: "lire", translations: { de: "lesen", en: "to read", it: "leggere", es: "leer", fr: "lire" } },
    { target: "finir", translations: { de: "beenden", en: "to finish", it: "finire", es: "terminar", fr: "finir" } },
    { target: "partir", translations: { de: "abfahren/weggehen", en: "to leave", it: "partire", es: "irse/partir", fr: "partir" } },
    { target: "sortir", translations: { de: "hinausgehen", en: "to go out", it: "uscire", es: "salir", fr: "sortir" } },
    { target: "manger", translations: { de: "essen", en: "to eat", it: "mangiare", es: "comer", fr: "manger" } },
    { target: "boire", translations: { de: "trinken", en: "to drink", it: "bere", es: "beber", fr: "boire" } }
  ]
};

function renderConjugationDashboard() {
  const lang = state.selectedLang || "it";
  const verbs = IMPORTANT_VERBS[lang] || IMPORTANT_VERBS.it;
  const baseLang = state.baseLang || "en";
  
  const searchInput = document.getElementById("conjugation-search-input");
  if (searchInput) {
    searchInput.value = "";
  }
  
  const langNames = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };
  const targetName = langNames[lang] || lang.toUpperCase();
  document.getElementById("conjugation-dash-title").textContent = `Conjugations (${targetName})`;

  const container = document.getElementById("conjugation-dashboard-verbs-list");
  container.innerHTML = "";
  
  verbs.forEach((verb, idx) => {
    const translation = (verb.translations && verb.translations[baseLang]) || verb.en || (verb.translations && verb.translations.en) || "";
    const fakeWordObj = { target: verb.target, en: translation, category: "verbs" };
    const conjugations = getConjugationsForVerb(fakeWordObj, lang);
    const pronouns = PRONOUNS[lang] || PRONOUNS.en;

    // Get translations for the conjugations
    let transConjs = null;
    let basePronouns = PRONOUNS[baseLang] || PRONOUNS.en;
    try {
      const fakeBaseObj = { target: translation, origEn: verb.en || translation, category: "verbs" };
      transConjs = getConjugationsForVerb(fakeBaseObj, baseLang);
    } catch(err) {
      console.warn("Failed to get base language conjugations for dashboard:", err);
    }

    const baseLangName = langNames[baseLang] || baseLang.toUpperCase();

    const card = document.createElement("div");
    card.className = "verb-dash-card";
    card.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s ease; cursor: default;";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; color: var(--accent-color); font-weight: 700;">${verb.target}</h3>
          <span style="font-size: 0.85rem; color: var(--text-secondary);">${translation}</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;" onclick="event.stopPropagation();">
          <button class="btn btn-secondary btn-sm" style="margin: 0; padding: 6px 12px; min-height: 32px; font-size: 0.72rem; display: flex; align-items: center; gap: 4px;" id="btn-melody-pronoun-${idx}">🔊 + Pronoun</button>
          <button class="btn btn-secondary btn-sm" style="margin: 0; padding: 6px 12px; min-height: 32px; font-size: 0.72rem; display: flex; align-items: center; gap: 4px;" id="btn-melody-verb-${idx}">🔊 Verb Only</button>
          <button class="btn btn-primary btn-sm" style="margin: 0; padding: 6px 12px; min-height: 32px; font-size: 0.72rem; display: flex; align-items: center; gap: 4px;" id="btn-practice-${idx}">🎯 Match</button>
        </div>
      </div>
      
      <div class="verb-details-panel" id="verb-details-${idx}" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.85rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; font-weight: bold; padding: 4px 8px; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.04); margin-bottom: 4px;">
          <span>With Pronoun</span>
          <span>Meaning (${baseLangName})</span>
        </div>
        ${pronouns.map((pr, i) => {
          let transText = translation;
          if (transConjs && transConjs[i]) {
            transText = `${basePronouns[i]} ${transConjs[i]}`;
          }
          return `
            <div style="display: grid; grid-template-columns: 1fr 1fr; padding: 6px 8px; background: rgba(255,255,255,0.01); border-radius: 6px; border-bottom: 1px solid rgba(255,255,255,0.02);">
              <div style="color: #fff;"><span style="color: var(--text-secondary); font-weight: 500; margin-right: 6px;">${pr}</span> <strong>${conjugations[i]}</strong></div>
              <div style="color: var(--accent-color); font-weight: 600;">${transText}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    card.querySelector(`#btn-melody-pronoun-${idx}`).onclick = (e) => {
      e.stopPropagation();
      let transConjs = null;
      let basePronouns = PRONOUNS.en;
      if (baseLang !== "en") {
        try {
          const fakeBaseObj = { target: translation, origEn: verb.en || translation, category: "verbs" };
          transConjs = getConjugationsForVerb(fakeBaseObj, baseLang);
          basePronouns = PRONOUNS[baseLang] || PRONOUNS.en;
        } catch(err) {}
      }
      
      const speechQueue = pronouns.map((pr, i) => {
        let transText = translation;
        if (transConjs && transConjs[i]) {
          transText = `${basePronouns[i]} ${transConjs[i]}`;
        }
        return {
          text: `${pr} ${conjugations[i]}`,
          lang: lang,
          showOverlay: true,
          translation: transText
        };
      });
      playSpeechQueue(speechQueue);
    };

    card.querySelector(`#btn-melody-verb-${idx}`).onclick = (e) => {
      e.stopPropagation();
      let transConjs = null;
      if (baseLang !== "en") {
        try {
          const fakeBaseObj = { target: translation, origEn: verb.en || translation, category: "verbs" };
          transConjs = getConjugationsForVerb(fakeBaseObj, baseLang);
        } catch(err) {}
      }

      const speechQueue = conjugations.map((conj, i) => {
        let transText = translation;
        if (transConjs && transConjs[i]) {
          transText = transConjs[i];
        }
        return {
          text: conj,
          lang: lang,
          showOverlay: true,
          translation: transText
        };
      });
      playSpeechQueue(speechQueue);
    };

    card.querySelector(`#btn-practice-${idx}`).onclick = (e) => {
      e.stopPropagation();
      startSingleVerbConjugationTest(verb.target, translation);
    };

    container.appendChild(card);
  });
}

function startSingleVerbConjugationTest(verbTarget, verbEn) {
  const word = {
    target: verbTarget,
    en: verbEn,
    category: "verbs",
    lang: state.selectedLang,
    questionLang: state.baseLang || "en",
    answerLang: state.selectedLang
  };
  
  state.currentTest = {
    words: [word],
    index: 0,
    points: 0,
    correctCount: 0,
    totalOriginalCount: 1,
    wrongAnswers: [],
    selectedMode: "conjugation",
    lastAnswerCorrect: null
  };

  showView("view-test");
  renderQuestion();
}

function startAllVerbsConjugationTest() {
  const lang = state.selectedLang || "it";
  const verbs = IMPORTANT_VERBS[lang] || IMPORTANT_VERBS.it;
  
  const words = verbs.map(v => {
    const translation = (v.translations && v.translations[state.baseLang || "en"]) || v.en || "";
    return {
      target: v.target,
      en: translation,
      category: "verbs",
      lang: lang,
      questionLang: state.baseLang || "en",
      answerLang: lang
    };
  }).sort(() => 0.5 - Math.random());

  state.currentTest = {
    words: words,
    index: 0,
    points: 0,
    correctCount: 0,
    totalOriginalCount: words.length,
    wrongAnswers: [],
    selectedMode: "conjugation",
    lastAnswerCorrect: null
  };

  showView("view-test");
  renderQuestion();
}

const PRONOUNS = {
  de: ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"],
  it: ["io", "tu", "lui/lei", "noi", "voi", "loro"],
  es: ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"],
  fr: ["je", "tu", "il/elle", "nous", "vous", "ils/elles"],
  en: ["I", "you", "he/she/it", "we", "you (plur.)", "they"]
};

const IRREGULAR_VERBS = {
  de: {
    "sein": ["bin", "bist", "ist", "sind", "seid", "sind"],
    "haben": ["habe", "hast", "hat", "haben", "habt", "haben"],
    "werden": ["werde", "wirst", "wird", "werden", "werdet", "werden"],
    "können": ["kann", "kannst", "kann", "können", "könnt", "können"],
    "müssen": ["muss", "musst", "muss", "müssen", "müsst", "müssen"],
    "wollen": ["will", "willst", "will", "wollen", "wollt", "wollen"],
    "sollen": ["soll", "sollst", "soll", "sollen", "sollt", "sollen"],
    "dürfen": ["darf", "darfst", "darf", "dürfen", "dürft", "dürfen"],
    "wissen": ["weiß", "weißt", "weiß", "wissen", "wisst", "wissen"]
  },
  it: {
    "essere": ["sono", "sei", "è", "siamo", "siete", "sono"],
    "avere": ["ho", "hai", "ha", "abbiamo", "avete", "hanno"],
    "fare": ["faccio", "fai", "fa", "facciamo", "fate", "fanno"],
    "andare": ["vado", "vai", "va", "andiamo", "andate", "vanno"],
    "potere": ["posso", "puoi", "può", "possiamo", "potete", "possono"],
    "dovere": ["devo", "devi", "deve", "dobbiamo", "dovete", "devono"],
    "volere": ["voglio", "vuoi", "vuole", "vogliamo", "volete", "vogliono"],
    "sapere": ["so", "sai", "sa", "sappiamo", "sapete", "sanno"],
    "venire": ["vengo", "vieni", "viene", "veniamo", "venite", "vengono"],
    "dire": ["dico", "dici", "dice", "diciamo", "dite", "dicono"],
    "uscire": ["esco", "esci", "esce", "usciamo", "uscite", "escono"],
    "sedere": ["siedo", "siedi", "siede", "sediamo", "sedete", "siedono"]
  },
  es: {
    "ser": ["soy", "eres", "es", "somos", "sois", "son"],
    "estar": ["estoy", "estás", "está", "estamos", "estáis", "están"],
    "haber": ["he", "has", "ha", "hemos", "habéis", "han"],
    "tener": ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
    "ir": ["voy", "vas", "va", "vamos", "vais", "van"],
    "hacer": ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
    "poder": ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
    "querer": ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
    "decir": ["digo", "dices", "dice", "decimos", "decís", "dicen"],
    "venir": ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
    "saber": ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"]
  },
  fr: {
    "être": ["suis", "es", "est", "sommes", "êtes", "sont"],
    "avoir": ["ai", "as", "a", "avons", "avez", "ont"],
    "aller": ["vais", "vas", "va", "allons", "allez", "vont"],
    "faire": ["fais", "fais", "fait", "faisons", "faites", "font"],
    "pouvoir": ["peux", "peux", "peut", "pouvons", "pouvez", "pouvent"],
    "vouloir": ["veux", "veux", "veut", "voulons", "voulez", "veulent"],
    "devoir": ["dois", "dois", "doit", "devons", "devez", "doivent"],
    "savoir": ["sais", "sais", "sait", "savons", "savez", "savent"],
    "venir": ["viens", "viens", "vient", "venons", "venez", "viennent"],
    "prendre": ["prends", "prends", "prend", "prenons", "prenez", "prennent"]
  }
};

function getRegularConjugation(infinitive, lang) {
  const clean = infinitive.toLowerCase().trim();
  if (lang === "de") {
    if (clean.endsWith("en")) {
      const base = clean.slice(0, -2);
      const e = (base.endsWith("t") || base.endsWith("d") || (base.endsWith("n") && !base.endsWith("rn") && !base.endsWith("ln"))) ? "e" : "";
      return [
        base + "e",
        base + e + "st",
        base + e + "t",
        base + "en",
        base + e + "t",
        base + "en"
      ];
    }
  }
  if (lang === "it") {
    if (clean.endsWith("are")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "a", base + "iamo", base + "ate", base + "ano"];
    }
    if (clean.endsWith("ere")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "e", base + "iamo", base + "ete", base + "ono"];
    }
    if (clean.endsWith("ire")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "e", base + "iamo", base + "ite", base + "ono"];
    }
  }
  if (lang === "es") {
    if (clean.endsWith("ar")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "as", base + "a", base + "amos", base + "áis", base + "an"];
    }
    if (clean.endsWith("er")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "es", base + "e", base + "emos", base + "éis", base + "en"];
    }
    if (clean.endsWith("ir")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "es", base + "e", base + "imos", base + "ís", base + "en"];
    }
  }
  if (lang === "fr") {
    if (clean.endsWith("er")) {
      const base = clean.slice(0, -2);
      return [base + "e", base + "es", base + "e", base + "ons", base + "ez", base + "ent"];
    }
    if (clean.endsWith("ir")) {
      const base = clean.slice(0, -2);
      return [base + "is", base + "is", base + "it", base + "issons", base + "issez", base + "issent"];
    }
    if (clean.endsWith("re")) {
      const base = clean.slice(0, -2);
      return [base + "s", base + "s", base + "", base + "ons", base + "ez", base + "ent"];
    }
  }
  return [clean, clean, clean, clean, clean, clean];
}

async function fetchConjugationsWithAI(verb, lang, wordKey) {
  const langNames = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };
  const targetName = langNames[lang] || "German";
  
  const prompt = `Conjugate the verb "${verb}" in present tense for the language "${targetName}".
  Return ONLY a clean parseable JSON array of exactly 6 strings in order:
  [1st person singular, 2nd person singular, 3rd person singular, 1st person plural, 2nd person plural, 3rd person plural].
  Do not wrap in markdown code blocks. Do not write extra commentary.
  Example for German "haben": ["habe", "hast", "hat", "haben", "habt", "haben"]`;

  try {
    const resText = await callLLM(prompt, "You are a precise grammar assistant.");
    const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
    const arr = JSON.parse(cleanJson);
    if (Array.isArray(arr) && arr.length === 6) {
      if (!state.dictionaryCache) state.dictionaryCache = {};
      if (!state.dictionaryCache[wordKey]) state.dictionaryCache[wordKey] = {};
      if (!state.dictionaryCache[wordKey].conjugations) state.dictionaryCache[wordKey].conjugations = {};
      state.dictionaryCache[wordKey].conjugations[lang] = arr;

      const idx = state.customVocab.findIndex(v => v.en === wordKey || v.origEn === wordKey);
      if (idx !== -1) {
        if (!state.customVocab[idx].details) state.customVocab[idx].details = {};
        if (!state.customVocab[idx].details.conjugations) state.customVocab[idx].details.conjugations = {};
        state.customVocab[idx].details.conjugations[lang] = arr;
      } else {
        if (!state.editedStarters[wordKey]) {
          state.editedStarters[wordKey] = { details: { conjugations: {} } };
        }
        if (!state.editedStarters[wordKey].details) state.editedStarters[wordKey].details = {};
        if (!state.editedStarters[wordKey].details.conjugations) state.editedStarters[wordKey].details.conjugations = {};
        state.editedStarters[wordKey].details.conjugations[lang] = arr;
      }
      saveState();
      return arr;
    }
  } catch (e) {
    console.error("AI conjugation fetch failed:", e);
  }
  return null;
}

function getConjugationsForVerb(wordObj, lang) {
  const wordKey = wordObj.origEn || wordObj.en;
  let cleanInfinitive = stripArticles(wordObj.target, lang).toLowerCase().trim();

  if (state.dictionaryCache && state.dictionaryCache[wordKey] && state.dictionaryCache[wordKey].conjugations && state.dictionaryCache[wordKey].conjugations[lang]) {
    return state.dictionaryCache[wordKey].conjugations[lang];
  }
  if (wordObj.details && wordObj.details.conjugations && wordObj.details.conjugations[lang]) {
    return wordObj.details.conjugations[lang];
  }

  let isReflexive = false;
  let baseInfinitive = cleanInfinitive;
  let refPronouns = [];

  if (lang === "it") {
    if (cleanInfinitive.endsWith("arsi")) {
      baseInfinitive = cleanInfinitive.slice(0, -4) + "are";
      isReflexive = true;
      refPronouns = ["mi", "ti", "si", "ci", "vi", "si"];
    } else if (cleanInfinitive.endsWith("ersi")) {
      baseInfinitive = cleanInfinitive.slice(0, -4) + "ere";
      isReflexive = true;
      refPronouns = ["mi", "ti", "si", "ci", "vi", "si"];
    } else if (cleanInfinitive.endsWith("irsi")) {
      baseInfinitive = cleanInfinitive.slice(0, -4) + "ire";
      isReflexive = true;
      refPronouns = ["mi", "ti", "si", "ci", "vi", "si"];
    }
  } else if (lang === "es") {
    if (cleanInfinitive.endsWith("arse")) {
      baseInfinitive = cleanInfinitive.slice(0, -2);
      isReflexive = true;
      refPronouns = ["me", "te", "se", "nos", "os", "se"];
    } else if (cleanInfinitive.endsWith("erse")) {
      baseInfinitive = cleanInfinitive.slice(0, -2);
      isReflexive = true;
      refPronouns = ["me", "te", "se", "nos", "os", "se"];
    } else if (cleanInfinitive.endsWith("irse")) {
      baseInfinitive = cleanInfinitive.slice(0, -2);
      isReflexive = true;
      refPronouns = ["me", "te", "se", "nos", "os", "se"];
    }
  } else if (lang === "fr") {
    if (cleanInfinitive.startsWith("se ")) {
      baseInfinitive = cleanInfinitive.substring(3).trim();
      isReflexive = true;
    } else if (cleanInfinitive.startsWith("s'")) {
      baseInfinitive = cleanInfinitive.substring(2).trim();
      isReflexive = true;
    }
  }

  let baseConjugations = null;
  const irrs = IRREGULAR_VERBS[lang] || {};
  if (irrs[baseInfinitive]) {
    baseConjugations = irrs[baseInfinitive];
  } else {
    baseConjugations = getRegularConjugation(baseInfinitive, lang);
  }

  let result = baseConjugations;
  if (isReflexive) {
    if (lang === "fr") {
      result = baseConjugations.map((val, idx) => {
        const isVowel = /^[aeiouyàâéèêëîïôûùüh]/i.test(val);
        if (idx === 0) return isVowel ? `m'${val}` : `me ${val}`;
        if (idx === 1) return isVowel ? `t'${val}` : `te ${val}`;
        if (idx === 2) return isVowel ? `s'${val}` : `se ${val}`;
        if (idx === 3) return `nous ${val}`;
        if (idx === 4) return `vous ${val}`;
        return isVowel ? `s'${val}` : `se ${val}`;
      });
    } else {
      result = baseConjugations.map((val, idx) => `${refPronouns[idx]} ${val}`);
    }
  }

  const hasKey = state.openaiKey || state.grokKey || state.geminiKey || state.anthropicKey;
  if (hasKey) {
    fetchConjugationsWithAI(cleanInfinitive, lang, wordKey).then(aiArr => {
      if (aiArr && state.currentTest && state.currentTest.selectedMode === "conjugation") {
        const currentWord = state.currentTest.words[state.currentTest.index];
        if ((currentWord.origEn || currentWord.en) === wordKey) {
          const isDifferent = JSON.stringify(aiArr) !== JSON.stringify(window.conjugationCorrectList);
          const hasInteracted = window.conjugationUserMatches && window.conjugationUserMatches.some(m => m !== null);
          if (isDifferent && !hasInteracted) {
            buildConjugationMode();
          }
        }
      }
    });
  }

  return result;
}

function buildConjugationMode() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang;

  // Update progress context
  document.getElementById("test-progress-text").textContent = `Question ${tState.index + 1}/${tState.words.length}`;
  const progressPercent = (tState.index / tState.words.length) * 100;
  document.getElementById("test-progress-fill").style.width = `${progressPercent}%`;

  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  if (wordCardWrapper) wordCardWrapper.style.display = "none";
  if (catTag) catTag.style.display = "none";

  const submitBtn = document.getElementById("btn-submit-answer");
  if (submitBtn) {
    submitBtn.style.display = "block";
    submitBtn.textContent = "Check Answer";
    submitBtn.onclick = checkConjugationAnswer;
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
  rowsContainer.innerHTML = "";
  pronouns.forEach((pronoun, index) => {
    const row = document.createElement("div");
    row.className = "conjugation-row";
    row.innerHTML = `
      <span class="conjugation-pronoun">${pronoun}</span>
      <button class="conjugation-slot" id="conjugation-slot-${index}" onclick="window.clickConjugationSlot(${index})">[ Tap to Place ]</button>
    `;
    
    const slotEl = row.querySelector(".conjugation-slot");
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

  const poolContainer = document.getElementById("conjugation-pool");
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

window.evaluateSlot = function(index) {
  const slotEl = document.getElementById(`conjugation-slot-${index}`);
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
    playSound("sound-correct");
  } else {
    slotEl.className = "conjugation-slot filled incorrect";
    playSound("sound-incorrect");
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

    playSound("sound-bubble");
  }
};

window.checkAllSlotsAuto = function() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang;
  const correctList = window.conjugationCorrectList;
  const userMatches = window.conjugationUserMatches;
  const pronouns = PRONOUNS[aLang] || PRONOUNS.en;

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
  playSound("sound-bubble");
  
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

function checkConjugationAnswer() {
  const tState = state.currentTest;
  if (!tState) return;

  const currentWord = tState.words[tState.index];
  const aLang = currentWord.answerLang || state.selectedLang;
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
    playSound("sound-correct");
  } else {
    playSound("sound-incorrect");
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
    
    recordMistake(currentWord);

    if (!tState.wrongAnswers.find(w => w.en === currentWord.en)) {
      tState.wrongAnswers.push(currentWord);
    }
    tState.lastAnswerCorrect = false;
  }

  updateTestStatsMini();
  saveState();

  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");
  
  overlay.className = allCorrect ? "test-right-pane active correct-ans" : "test-right-pane active incorrect-ans";
  fTitle.textContent = allCorrect ? "Correct Conjugation!" : "Conjugation Mistakes!";
  fIcon.textContent = allCorrect ? "✅" : "❌";
  fDesc.textContent = allCorrect 
    ? `Perfect! You conjugated "${currentWord.target}" correctly across all pronouns.` 
    : `Some conjugation matching mistakes were made. Review the corrections on the left.`;

  const detailsContainer = document.getElementById("word-details-container");
  if (detailsContainer) detailsContainer.style.display = "none";

  const diffVoting = document.querySelector(".difficulty-voting-container");
  if (diffVoting) {
    diffVoting.style.display = "block";
    updateDifficultyVoteUI(currentWord);
  }

  const nextBtn = document.getElementById("btn-next-question");
  if (nextBtn) {
    nextBtn.textContent = "Continue";
    nextBtn.onclick = () => {
      overlay.classList.remove("active");
      tState.index++;
      if (tState.index < tState.words.length) {
        renderQuestion();
      } else {
        finishTestRound();
      }
    };
  }
}

function renderQuestion() {
  const tState = state.currentTest;
  const currentWord = tState.words[tState.index];
  
  // Set category tag
  document.getElementById("test-category-tag").textContent = currentWord.category || "General";

  // Restore default displays for non-compare modes
  const wordCardWrapper = document.querySelector(".word-card-wrapper");
  const catTag = document.getElementById("test-category-tag");
  const submitBtn = document.getElementById("btn-submit-answer");
  const nextBtn = document.getElementById("btn-next-question");

  const btnAddMeaning = document.getElementById("btn-add-alternative-meaning");
  const wrapMeaningInput = document.getElementById("add-meaning-input-wrap");
  if (btnAddMeaning) btnAddMeaning.style.display = "inline-flex";
  if (wrapMeaningInput) wrapMeaningInput.style.display = "none";
  if (wordCardWrapper) wordCardWrapper.style.display = "block";
  if (catTag) catTag.style.display = "block";
  if (submitBtn) submitBtn.style.display = "block";
  if (nextBtn) {
    nextBtn.textContent = "Continue";
    nextBtn.onclick = nextQuestion;
  }

  const diffVoting = document.querySelector(".difficulty-voting-container");
  if (diffVoting) diffVoting.style.display = "block";



  if (tState.selectedMode === "compare") {
    buildCompareMode();
    return;
  }
  
  if (tState.selectedMode === "conjugation") {
    buildConjugationMode();
    return;
  }
  
  // Display target/source
  const promptWordEl = document.getElementById("test-prompt-word");
  const qLang = currentWord.questionLang || state.baseLang || "en";
  
  let qArt = "";
  let qNoun = currentWord.en;
  if (currentWord.details && currentWord.details.articles && currentWord.details.articles[qLang]) {
    qArt = currentWord.details.articles[qLang];
  } else {
    const parsed = getArticleAndNoun(currentWord.en, qLang, currentWord);
    qArt = parsed.article;
    qNoun = parsed.noun;
  }
  
  const promptTextWithArt = qArt ? `${qArt} ${qNoun}` : qNoun;
  
  promptWordEl.style.color = getLangColor(qLang);
  if (qArt) {
    promptWordEl.innerHTML = `<span style="font-size:0.85em; color:var(--success-color);">${qArt}</span> ${qNoun}`;
  } else {
    promptWordEl.textContent = qNoun;
  }

  const badgesRow = document.getElementById("word-badges-row");
  if (badgesRow) {
    badgesRow.innerHTML = "";
    const isQCommon = isCommonWord(qNoun, qLang);
    const isACommon = isCommonWord(currentWord.target, state.selectedLang);
    if (isQCommon || isACommon) {
      badgesRow.innerHTML = `<span class="badge-common" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 3px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-flex; align-items: center; gap: 4px;">⭐ Common Word</span>`;
    }
  }
  
  // Image Renderer - Use manual custom image if available, else fetch from LoremFlickr
  const imgEl = document.getElementById("word-image");
  const placeholderEl = document.getElementById("word-image-placeholder");
  
  if (imgEl && placeholderEl) {
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
  }

  // Audio Buttons Setup
  document.getElementById("btn-speak-prompt").onclick = () => speakWord(promptTextWithArt, qLang, 1.0);
  document.getElementById("btn-speak-prompt-slow").onclick = () => speakWord(promptTextWithArt, qLang, 0.5);

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
  updateTestStatsMini();

  // Set up timer
  if (window.questionTimerInterval) {
    clearInterval(window.questionTimerInterval);
    window.questionTimerInterval = null;
  }
  
  const timerBadge = document.getElementById("test-countdown-badge");
  const timerSec = document.getElementById("test-countdown-sec");
  
  if (state.questionTimer > 0) {
    timerBadge.style.display = "inline-flex";
    timerSec.textContent = state.questionTimer;
    tState.startTime = Date.now();
    
    let secRemaining = state.questionTimer;
    window.questionTimerInterval = setInterval(() => {
      secRemaining--;
      if (secRemaining <= 0) {
        clearInterval(window.questionTimerInterval);
        window.questionTimerInterval = null;
        timerSec.textContent = "0";
        submitTimeUpAnswer();
      } else {
        timerSec.textContent = secRemaining;
      }
    }, 1000);
  } else {
    timerBadge.style.display = "none";
    tState.startTime = Date.now();
  }

  // Reset inputs & word details panel
  const ansLang = currentWord.answerLang || state.selectedLang || "de";
  const langNames = {
    en: "English",
    de: "German",
    it: "Italian",
    es: "Spanish",
    fr: "French"
  };
  const expectedLangName = langNames[ansLang] || "German";
  const typingInput = document.getElementById("input-typing-answer");
  if (typingInput) {
    typingInput.value = "";
    typingInput.placeholder = `Type here in "${expectedLangName}"`;
  }
  document.getElementById("bubble-selected-zone").innerHTML = "";
  document.getElementById("speech-transcript").textContent = "...";
  const pronFeedback = document.getElementById("pronunciation-feedback");
  if (pronFeedback) pronFeedback.style.display = "none";
  const wordAccList = document.getElementById("word-accuracy-list");
  if (wordAccList) wordAccList.innerHTML = "";
  
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
      const vocabWords = typeof STARTER_VOCAB_RAW !== "undefined" ? STARTER_VOCAB_RAW.map(v => v.en).filter(Boolean) : [];
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
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcriptText = "";
    for (let i = 0; i < event.results.length; ++i) {
      transcriptText += event.results[i][0].transcript;
    }
    transcriptText = transcriptText.trim();
    document.getElementById("speech-transcript").textContent = transcriptText || "...";

    // Pronunciation accuracy matching
    const tState = state.currentTest;
    const currentWord = tState?.words[tState.index];
    if (currentWord && transcriptText) {
      const targetPhrase = currentWord.target;
      const analysis = window.analyzePronunciation(targetPhrase, transcriptText);
      
      // Update overall score
      document.getElementById("overall-accuracy-pct").textContent = `${analysis.overallScore}%`;
      
      // Update word badges
      const listEl = document.getElementById("word-accuracy-list");
      listEl.innerHTML = "";
      analysis.wordBreakdown.forEach(item => {
        const badge = document.createElement("span");
        badge.className = "word-badge";
        if (item.score >= 90) {
          badge.classList.add("correct");
        } else if (item.score >= 50) {
          badge.classList.add("close");
        } else {
          badge.classList.add("missed");
        }
        badge.innerHTML = `${item.originalWord} <span class="pct">${item.score}%</span>`;
        listEl.appendChild(badge);
      });
      
      document.getElementById("pronunciation-feedback").style.display = "block";
    }
  };

  recognition.onerror = () => {
    document.getElementById("speech-transcript").textContent = "[Retry speaking]";
    document.getElementById("btn-mic").classList.remove("listening");
    const feedback = document.getElementById("pronunciation-feedback");
    if (feedback) feedback.style.display = "none";
  };

  recognition.onend = () => {
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

// Extract leading article and clean noun dynamically if details are missing
function getArticleAndNoun(text, lang, currentWord) {
  const articles = {
    en: ["the ", "a ", "an "],
    de: ["der ", "die ", "das ", "ein ", "eine "],
    es: ["el ", "la ", "los ", "las ", "un ", "una ", "unos ", "unas "],
    it: ["il ", "lo ", "la ", "i ", "gli ", "le ", "un ", "uno ", "una ", "un' "],
    fr: ["le ", "la ", "les ", "un ", "une ", "des ", "l' "]
  };
  const list = articles[lang] || [];
  const clean = text.trim();
  
  // 1. First, check if the text string itself starts with an article
  for (const article of list) {
    if (clean.toLowerCase().startsWith(article.toLowerCase())) {
      const art = clean.substring(0, article.length).trim();
      const noun = clean.substring(article.length).trim();
      return { article: art, noun: noun };
    }
  }
  
  // 2. Second, fallback: check if we can resolve the article from the STARTER_VOCAB_RAW database
  if (currentWord) {
    const baseKey = currentWord.origEn || currentWord.en;
    if (baseKey && typeof STARTER_VOCAB_RAW !== "undefined") {
      const starter = STARTER_VOCAB_RAW.find(v => {
        return (v.en && v.en.toLowerCase() === baseKey.toLowerCase()) || 
               (v.de && v.de.toLowerCase() === baseKey.toLowerCase()) ||
               (v.it && v.it.toLowerCase() === baseKey.toLowerCase()) ||
               (v.es && v.es.toLowerCase() === baseKey.toLowerCase()) ||
               (v.fr && v.fr.toLowerCase() === baseKey.toLowerCase());
      });
      if (starter && starter.details && starter.details.articles && starter.details.articles[lang]) {
        return { article: starter.details.articles[lang], noun: clean };
      }
    }
  }
  
  return { article: "", noun: clean };
}

// Check the student's answer
function submitAnswer() {
  if (window.questionTimerInterval) {
    clearInterval(window.questionTimerInterval);
    window.questionTimerInterval = null;
  }

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
  let isSpeechPronunciationCorrect = false;
  let speechScore = 0;
  if (activeMode === "speech") {
    const analysis = window.analyzePronunciation(currentWord.target, studentAnswer);
    speechScore = analysis.overallScore;
    if (speechScore >= 80) {
      isSpeechPronunciationCorrect = true;
    }
  }

  const cleanAns = studentAnswer.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
  const cleanTarget = currentWord.target.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();

  // Use the actual answer language stored on the word (handles reverse direction correctly)
  const ansLang = currentWord.answerLang || state.selectedLang;

  const details = getWordDetails(currentWord);
  const ansArt = (details && details.articles && details.articles[ansLang]) ? details.articles[ansLang].toLowerCase() : "";

  // Parse student answer
  const parsedAns = getArticleAndNoun(cleanAns, ansLang, currentWord);
  const studentArt = parsedAns.article.trim().toLowerCase();
  const studentNoun = parsedAns.noun.trim().toLowerCase();

  // Parse target answer
  const parsedTarget = getArticleAndNoun(cleanTarget, ansLang, currentWord);
  const correctArt = (parsedTarget.article || ansArt).trim().toLowerCase();
  const targetNounOnly = parsedTarget.noun.trim().toLowerCase();

  // Verify article if provided
  let articleIsCorrect = true;
  if (correctArt && studentArt) {
    if (studentArt !== correctArt) {
      articleIsCorrect = false;
    }
  }

  // Exact Match allows either:
  // 1. studentNoun matches targetNounOnly AND studentArt matches correctArt (or studentArt is empty)
  // 2. Or the raw cleanAns matches cleanTarget (as a fallback)
  const isExactNounMatch = studentNoun === targetNounOnly;
  const isExactMatch = (isExactNounMatch && articleIsCorrect && (studentArt === correctArt || !studentArt)) || cleanAns === cleanTarget;
  const isCloseMatch = (!isExactMatch && isExactNounMatch && articleIsCorrect);

  // Calculate Levenshtein distance for typos
  const dist = getLevenshteinDistance(studentNoun, targetNounOnly);
  const isTypo = dist > 0 && dist <= 2; 

  // Synonym verification - use the answer language for synonym lookup
  const syns = (details && details.synonyms && details.synonyms[ansLang]) ? details.synonyms[ansLang] : [];
  const cleanSyns = syns.map(s => {
    const sLower = s.toLowerCase().replace(/[¿?¡!.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    return getArticleAndNoun(sLower, ansLang).noun;
  });
  const isSynonymMatch = state.allowSynonyms && cleanSyns.includes(studentNoun);

  const isCorrect = (articleIsCorrect && (isExactMatch || isCloseMatch || isTypo || isSynonymMatch)) || isSpeechPronunciationCorrect;
  const overlay = document.getElementById("feedback-overlay");
  const fTitle = document.getElementById("feedback-title");
  const fDesc = document.getElementById("feedback-desc");
  const fIcon = document.getElementById("feedback-icon");

  if (isCorrect) {
    playSound("sound-correct");
    overlay.className = "test-right-pane active correct-ans";
    fTitle.textContent = "Correct!";
    fIcon.textContent = "🎉";
    
    if (isSpeechPronunciationCorrect) {
      fDesc.textContent = `Correct pronunciation! You scored ${speechScore}% accuracy. Target: "${currentWord.target}".`;
    } else if (isExactMatch) {
      fDesc.textContent = `Excellent job! "${currentWord.en}" is indeed "${currentWord.target}".`;
    } else if (isSynonymMatch) {
      fDesc.textContent = `Correct! "${studentAnswer}" is a similar word/synonym of "${currentWord.target}".`;
    } else if (isCloseMatch) {
      fDesc.textContent = `Correct! (Ignored leading article). "${currentWord.en}" is "${currentWord.target}".`;
    } else if (isTypo) {
      fDesc.textContent = `Correct (with minor typo)! You entered: "${studentAnswer}". Correct word: "${currentWord.target}".`;
    }

    tState.lastAnswerCorrect = true;
    tState.correctCount++;
    state.xp += 10;
    checkLevelUp();
    
    // Points calculation:
    let basePoints = 100;
    let modeMult = 1.0;
    if (activeMode === "bubbles") modeMult = 0.5;
    else if (activeMode === "typing") modeMult = 1.0;
    else if (activeMode === "speech") modeMult = 1.0;
    
    let qPoints = basePoints * modeMult;
    
    if (state.questionTimer > 0) {
      const limit = state.questionTimer;
      const elapsed = (Date.now() - tState.startTime) / 1000;
      const secondsRemaining = Math.max(0, limit - elapsed);
      
      // add 20% of points for each second earlier (seconds remaining)
      const timeBonus = 0.20 * secondsRemaining;
      qPoints = qPoints * (1 + timeBonus);
      
      // Timer limit multiplier
      let timerLimitMult = 1.0;
      if (limit === 5) timerLimitMult = 3.0;
      else if (limit === 10) timerLimitMult = 2.0;
      else if (limit === 15) timerLimitMult = 1.5;
      
      qPoints = qPoints * timerLimitMult;
    }
    
    qPoints = Math.round(qPoints);
    tState.points = (tState.points || 0) + qPoints;
    
    updateTestStatsMini();

    // Spaced Repetition Stats: correct progression
    const wordKey = currentWord.origEn || currentWord.en;
    if (!state.wordStats[wordKey]) {
      state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
    }
    const stats = state.wordStats[wordKey];
    stats.attempts = (stats.attempts || 0) + 1;
    stats.lastReview = Date.now();
    if (!stats.box) stats.box = 1;
    if (stats.box < 5) stats.box++;
  } else {
    playSound("sound-incorrect");
    overlay.className = "test-right-pane active incorrect-ans";
    fTitle.textContent = "Incorrect";
    fIcon.textContent = "😢";
    
    if (!articleIsCorrect && isExactNounMatch) {
      fDesc.textContent = `Wrong article! You entered: "${studentAnswer}". The correct article for "${targetNounOnly}" is "${correctArt}".`;
    } else {
      fDesc.textContent = `Correct translation is: "${currentWord.target}". You entered: "${studentAnswer || '[empty]'}".`;
    }
    
    tState.lastAnswerCorrect = false;
    if (!tState.wrongAnswers.find(w => w.en === currentWord.en)) {
      tState.wrongAnswers.push(currentWord);
    }
    
    recordMistake(currentWord);
    updateTestStatsMini();

    // Spaced Repetition Stats: incorrect penalty
    const wordKey = currentWord.origEn || currentWord.en;
    if (!state.wordStats[wordKey]) {
      state.wordStats[wordKey] = { attempts: 0, errors: 0, box: 1, lastReview: null };
    }
    const stats = state.wordStats[wordKey];
    stats.attempts = (stats.attempts || 0) + 1;
    stats.errors = (stats.errors || 0) + 1;
    stats.lastReview = Date.now();
    stats.box = 1; // Leitner penalty reset
  }

  setupWordDetails(currentWord);
  
  const vStats = state.wordStats[currentWord.origEn || currentWord.en] || { difficulty: "medium" };
  updateDifficultyVoteUI(vStats.difficulty || "medium");

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
  
  const totalCount = tState.totalOriginalCount || (tState.words ? tState.words.length : 0) || 1;
  const accuracy = Math.round((tState.correctCount / totalCount) * 100);
  
  // Record history
  state.history.push({
    date: new Date().toLocaleDateString(),
    lang: state.selectedLang.toUpperCase(),
    category: document.getElementById("select-category").value,
    total: totalCount,
    correct: tState.correctCount,
    accuracy: accuracy,
    points: tState.points || 0
  });

  saveState();
  renderHistoryList();

  document.getElementById("report-points").textContent = `${tState.points || 0}`;
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
    selectedMode: "typing",
    points: 0
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
  // Add iOS class to body if running on iPhone/iPad/iPod
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    document.body.classList.add('device-ios');
  }

  await loadStarterVocab();
  await loadFrequencyLists();
  loadState();
  await initICloudSync();
  await initBackupFile();

  // Close speech overlay when clicking the background
  const speechOverlay = document.getElementById("conjugation-speech-overlay");
  if (speechOverlay) {
    speechOverlay.onclick = (e) => {
      if (e.target === speechOverlay) {
        window.stopSpeechQueue();
      }
    };
  }

  // Quick Translate Button Click Handlers
  const quickMicBtn = document.getElementById("btn-quick-translate-mic");
  if (quickMicBtn) {
    quickMicBtn.onclick = toggleQuickTranslateSpeech;
  }
  const quickBackBtn = document.getElementById("btn-quick-translate-back");
  if (quickBackBtn) {
    quickBackBtn.onclick = () => showView("view-dashboard");
  }
  const quickLangSelect = document.getElementById("quick-translate-lang");
  if (quickLangSelect) {
    quickLangSelect.onchange = () => {
      stopQuickTranslateSpeech();
      
      // Save last selected language
      state.quickTranslateLastLang = quickLangSelect.value;
      saveState();
      
      const display = document.getElementById("quick-translate-input-display");
      if (display) display.textContent = "...";
      const grid = document.getElementById("quick-translate-results");
      if (grid) grid.innerHTML = "";
      // Restart speech engine with new language after brief delay
      setTimeout(startQuickTranslateSpeech, 300);
    };
  }
  
  const quickSaveBtn = document.getElementById("btn-quick-translate-save");
  if (quickSaveBtn) {
    quickSaveBtn.onclick = saveQuickTranslateWord;
  }
  
  const quickSaveFolderSelect = document.getElementById("quick-translate-save-folder");
  if (quickSaveFolderSelect) {
    quickSaveFolderSelect.onchange = () => {
      state.quickTranslateLastFolder = quickSaveFolderSelect.value;
      saveState();
    };
  }

  const handleManualTranslate = () => {
    const inputEl = document.getElementById("quick-translate-text-input");
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (!val) return;
    
    stopQuickTranslateSpeech();
    
    const display = document.getElementById("quick-translate-input-display");
    if (display) {
      const folderId = document.getElementById("quick-translate-save-folder")?.value || "nouns";
      const speakLang = document.getElementById("quick-translate-lang")?.value || "en";
      display.textContent = normalizeWordCasing(val, speakLang, folderId) || "...";
    }
    
    runQuickTranslate(val);
    inputEl.value = "";
  };

  const quickSubmitBtn = document.getElementById("btn-quick-translate-submit");
  if (quickSubmitBtn) {
    quickSubmitBtn.onclick = handleManualTranslate;
  }
  const quickTextInput = document.getElementById("quick-translate-text-input");
  if (quickTextInput) {
    quickTextInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        handleManualTranslate();
      }
    };
  }

  const quickCopyBtn = document.getElementById("btn-quick-translate-copy");
  if (quickCopyBtn) {
    quickCopyBtn.onclick = () => {
      const display = document.getElementById("quick-translate-input-display");
      if (display) {
        const text = display.textContent.trim();
        if (text && text !== "...") {
          navigator.clipboard.writeText(text).then(() => {
            showCustomAlert("📋 Copied to clipboard!");
          }).catch(err => {
            console.error("Failed to copy text:", err);
          });
        }
      }
    };
  }

  // Navigation Links
  const goQuickBtn = document.getElementById("btn-go-quick-translate");
  if (goQuickBtn) {
    goQuickBtn.onclick = () => showView("view-quick-translate");
  }
  document.getElementById("btn-go-import").onclick = () => showView("view-import");
  document.getElementById("btn-go-mistakes").onclick = () => showView("view-mistakes");
  document.getElementById("btn-go-setup").onclick = () => showView("view-setup");
  document.getElementById("btn-go-api").onclick = () => showView("view-api");
  document.getElementById("btn-go-statistics").onclick = () => showView("view-statistics");
  if (document.getElementById("btn-go-grammar")) {
    document.getElementById("btn-go-grammar").onclick = () => showView("view-grammar");
  }
  
  document.getElementById("btn-import-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-mistakes-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-setup-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-api-back").onclick = () => showView("view-setup");
  document.getElementById("btn-statistics-back").onclick = () => showView("view-dashboard");
  if (document.getElementById("btn-grammar-back")) {
    document.getElementById("btn-grammar-back").onclick = () => showView("view-setup");
  }
  document.getElementById("btn-report-home").onclick = () => showView("view-dashboard");

  // Grammar Search listeners
  const searchInput = document.getElementById("grammar-search");
  const clearBtn = document.getElementById("btn-clear-grammar-search");
  if (searchInput) {
    searchInput.oninput = (e) => {
      if (grammarGuideData) {
        renderGrammarGuide(grammarGuideData, e.target.value);
      }
    };
  }
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = "";
        if (grammarGuideData) {
          renderGrammarGuide(grammarGuideData);
        }
      }
    };
  }

  // Global Flag Icon Click -> Speak TTS
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.tagName === "IMG" && target.src && target.src.includes("flagcdn.com")) {
      const lang = target.dataset.lang || target.getAttribute("alt");
      if (!lang) return;

      let text = "";

      // 1. Check if there's a strong/span/em/text next sibling
      let sibling = target.nextElementSibling || target.nextSibling;
      if (sibling) {
        const sibText = sibling.textContent.trim();
        if (sibText) {
          text = sibText;
        }
      }

      // 2. If sibling text is empty, check parent text content (and clean it)
      if (!text) {
        const parent = target.parentElement;
        if (parent) {
          if (parent.classList.contains("sidebar-brand") || parent.classList.contains("user-badge")) {
            return;
          }
          const clone = parent.cloneNode(true);
          // Remove images, badges, icons, buttons, voice helpers
          clone.querySelectorAll("img, .badge, .icon, button, .btn-close, .voice-btn-inline").forEach(el => el.remove());
          text = clone.textContent.trim();
        }
      }

      if (text) {
        // Clean up formatting
        text = text.replace(/^[→\s\-\u2192]+/, ""); // Remove arrow indicators
        text = text.split("(")[0].split("[")[0].split("/")[0].trim(); // Remove translations/alternatives
        text = text.replace(/[“”"']/g, "").trim(); // Remove quotes

        const skipWords = ["en", "de", "it", "es", "fr", "gb", "english", "german", "italiano", "italian", "spanish", "french"];
        if (skipWords.includes(text.toLowerCase())) {
          return;
        }

        if (text) {
          speakWord(text, lang, 1.0);
        }
      }
    }
  });

  function quitAndSaveTestSession() {
    if (window.questionTimerInterval) {
      clearInterval(window.questionTimerInterval);
      window.questionTimerInterval = null;
    }
    const tState = state.currentTest;
    if (tState && tState.index > 0 && !tState.isRepeatRound) {
      const completedCount = tState.index;
      const accuracy = Math.round((tState.correctCount / completedCount) * 100);
      const selCatEl = document.getElementById("select-category");
      const category = selCatEl ? selCatEl.value : "custom";
      
      state.history.push({
        date: new Date().toLocaleDateString(),
        lang: state.selectedLang.toUpperCase(),
        category: category,
        total: completedCount,
        correct: tState.correctCount,
        accuracy: accuracy,
        points: tState.points || 0,
        isPartial: true
      });
      
      saveState();
      renderHistoryList();
    }
  }

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
        quitAndSaveTestSession();
      }
      
      showView(targetView);
      
      if (targetView === "view-browse") {
        renderBrowseList();
      } else if (targetView === "view-mistakes") {
        renderMistakesList();
      } else if (targetView === "view-import") {
        renderImportedList();
      }
    };
  });
  
  document.getElementById("btn-quit-test").onclick = async () => {
    const quitConfirmed = await showCustomConfirm("Are you sure you want to quit this training session?");
    if (quitConfirmed) {
      quitAndSaveTestSession();
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
      updateCategoryCounts();
      saveState();
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

    if (state.testDirection === "conjugation") {
      showView("view-conjugation-dashboard");
      return;
    }

    const activeSeg = document.querySelector(".segmented-control:not(#test-direction-selector) .seg-btn.active");
    const count = activeSeg ? parseInt(activeSeg.dataset.count) : 10;
    const category = document.getElementById("select-category").value;
    const customCategory = document.getElementById("select-custom-category").value;
    
    if (category === "none" && customCategory === "none") {
      alert("Please select either a Category (Pocket) or a User-Specific Word Set to start testing.");
      return;
    }
    
    startTestSession(state.selectedLang, category, count, false, customCategory, state.testDirection);
  };

  // Conjugation Dashboard actions
  const btnQuitConjugationDash = document.getElementById("btn-quit-conjugation-dash");
  if (btnQuitConjugationDash) {
    btnQuitConjugationDash.onclick = () => {
      showView("view-dashboard");
    };
  }

  const btnPlayAllConjugations = document.getElementById("btn-play-all-conjugations");
  if (btnPlayAllConjugations) {
    btnPlayAllConjugations.onclick = () => {
      startAllVerbsConjugationTest();
    };
  }

  const conjSearchInput = document.getElementById("conjugation-search-input");
  if (conjSearchInput) {
    conjSearchInput.oninput = () => {
      const val = conjSearchInput.value.toLowerCase().trim();
      const cards = document.querySelectorAll(".verb-dash-card");
      cards.forEach(card => {
        const targetText = card.querySelector("h3")?.textContent.toLowerCase() || "";
        const transText = card.querySelector("span")?.textContent.toLowerCase() || "";
        if (targetText.includes(val) || transText.includes(val)) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    };
  }

  const btnClearConjSearch = document.getElementById("btn-clear-conjugation-search");
  if (btnClearConjSearch) {
    btnClearConjSearch.onclick = () => {
      if (conjSearchInput) {
        conjSearchInput.value = "";
        conjSearchInput.dispatchEvent(new Event("input"));
        conjSearchInput.focus();
      }
    };
  }

  // Sync category dropdowns: choosing custom clears standard, choosing standard clears custom
  const selectCategory = document.getElementById("select-category");
  const selectCustomCategory = document.getElementById("select-custom-category");
  if (selectCategory && selectCustomCategory) {
    selectCategory.onchange = () => {
      if (selectCategory.value !== "none") {
        selectCustomCategory.value = "none";
      }
    };
    selectCustomCategory.onchange = () => {
      if (selectCustomCategory.value !== "none") {
        selectCategory.value = "none";
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
      
      renderQuestion();
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
    state.questionTimer = parseInt(document.getElementById("setup-question-timer").value) || 0;
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

  const btnGenCode = document.getElementById("btn-cloud-generate-code");
  if (btnGenCode) btnGenCode.onclick = generateCloudSyncCode;

  const btnUpload = document.getElementById("btn-cloud-upload");
  if (btnUpload) btnUpload.onclick = pushToCloud;

  const btnDownload = document.getElementById("btn-cloud-download");
  if (btnDownload) btnDownload.onclick = pullFromCloud;

  const btnUnlink = document.getElementById("btn-cloud-unlink");
  if (btnUnlink) btnUnlink.onclick = unlinkCloudSyncDevice;

  const btnLink = document.getElementById("btn-cloud-link-code");
  if (btnLink) {
    btnLink.onclick = () => {
      const codeInput = document.getElementById("input-cloud-sync-code");
      const code = codeInput ? codeInput.value.trim() : "";
      linkCloudSyncDevice(code);
    };
  }

  // Provider tabs switcher
  const btnModeEasy = document.getElementById("btn-sync-mode-easy");
  const btnModeGithub = document.getElementById("btn-sync-mode-github");
  const setupZoneEasy = document.getElementById("cloud-sync-setup-zone-easy");
  const setupZoneGithub = document.getElementById("cloud-sync-setup-zone-github");

  if (btnModeEasy && btnModeGithub && setupZoneEasy && setupZoneGithub) {
    btnModeEasy.onclick = () => {
      btnModeEasy.classList.add("active");
      btnModeGithub.classList.remove("active");
      setupZoneEasy.style.display = "flex";
      setupZoneGithub.style.display = "none";
    };
    btnModeGithub.onclick = () => {
      btnModeGithub.classList.add("active");
      btnModeEasy.classList.remove("active");
      setupZoneEasy.style.display = "none";
      setupZoneGithub.style.display = "flex";
    };
  }

  // GitHub Gist Sync connect button
  const btnGithubConnect = document.getElementById("btn-github-connect");
  if (btnGithubConnect) {
    btnGithubConnect.onclick = connectGitHubGist;
  }

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
  window.exportBackupData = async () => {
    // If a persistent backup file is set, attempt to write directly to it
    if (state.backupFileHandle) {
      try {
        const perm = await state.backupFileHandle.queryPermission({ mode: "readwrite" });
        let granted = perm === "granted";
        if (!granted) {
          const req = await state.backupFileHandle.requestPermission({ mode: "readwrite" });
          granted = req === "granted";
        }
        if (granted) {
          const writable = await state.backupFileHandle.createWritable();
          await writable.write(JSON.stringify(state));
          await writable.close();
          onBackupFileAccessGranted();
          showCustomAlert("🎉 Backup successfully exported and updated in your fixed file!");
          return;
        }
      } catch (err) {
        console.error("Failed to write to persistent backup file, falling back to download:", err);
      }
    }

    // Fallback: standard browser download anchor using safe Blob URL
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", "voctrainer_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const btnSelectICloud = document.getElementById("btn-select-icloud-folder");
  if (btnSelectICloud) {
    btnSelectICloud.onclick = selectICloudFolder;
  }

  const btnSyncFolder = document.getElementById("btn-sync-folder-now");
  if (btnSyncFolder) {
    btnSyncFolder.onclick = async () => {
      await syncICloudFolder();
      alert("🔄 Synchronization complete! Wordlists updated from your sync folder.");
    };
  }

  // Import Backup from File
  document.getElementById("import-backup-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let content = event.target.result.trim();
        if (content.startsWith("%7B") || content.startsWith("%7b")) {
          content = decodeURIComponent(content);
        }
        const importedState = JSON.parse(content);
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

  // Add Alternative Meaning Event Handlers
  const btnAltMeaning = document.getElementById("btn-add-alternative-meaning");
  const wrapAltMeaning = document.getElementById("add-meaning-input-wrap");
  const inputNewMeaningVal = document.getElementById("input-new-meaning");
  const btnSaveMeaningVal = document.getElementById("btn-save-new-meaning");
  const btnCancelMeaningVal = document.getElementById("btn-cancel-new-meaning");

  if (btnAltMeaning && wrapAltMeaning && inputNewMeaningVal && btnSaveMeaningVal && btnCancelMeaningVal) {
    btnAltMeaning.onclick = () => {
      btnAltMeaning.style.display = "none";
      wrapAltMeaning.style.display = "flex";
      
      // Look up existing synonyms in database or cache for prefilling
      let prefill = "";
      const tState = state.currentTest;
      const currentWord = tState ? tState.words[tState.index] : null;
      if (currentWord) {
        const ansLang = currentWord.answerLang || state.selectedLang;
        const details = getWordDetails(currentWord);
        const syns = (details && details.synonyms && details.synonyms[ansLang]) ? details.synonyms[ansLang] : [];
        if (syns.length > 0) {
          prefill = syns.join(", ");
        }
      }
      
      inputNewMeaningVal.value = prefill;
      inputNewMeaningVal.focus();
    };

    btnCancelMeaningVal.onclick = () => {
      wrapAltMeaning.style.display = "none";
      btnAltMeaning.style.display = "inline-flex";
    };

    btnSaveMeaningVal.onclick = () => {
      const val = inputNewMeaningVal.value.trim();
      if (!val) return;

      const newMeanings = val.split(',').map(s => s.trim()).filter(Boolean);
      if (newMeanings.length === 0) return;

      const tState = state.currentTest;
      if (!tState) return;
      const currentWord = tState.words[tState.index];
      const wordKey = currentWord.origEn || currentWord.en;
      const ansLang = currentWord.answerLang || state.selectedLang;

      const addSynsToCache = (key) => {
        if (!state.dictionaryCache) state.dictionaryCache = {};
        if (!state.dictionaryCache[key]) state.dictionaryCache[key] = {};
        if (!state.dictionaryCache[key].synonyms) state.dictionaryCache[key].synonyms = {};
        if (!state.dictionaryCache[key].synonyms[ansLang]) state.dictionaryCache[key].synonyms[ansLang] = [];
        newMeanings.forEach(m => {
          if (!state.dictionaryCache[key].synonyms[ansLang].includes(m)) {
            state.dictionaryCache[key].synonyms[ansLang].push(m);
          }
        });
      };

      const addSynsToWord = (word) => {
        if (!word.details) word.details = {};
        if (!word.details.synonyms) word.details.synonyms = {};
        if (!word.details.synonyms[ansLang]) word.details.synonyms[ansLang] = [];
        newMeanings.forEach(m => {
          if (!word.details.synonyms[ansLang].includes(m)) {
            word.details.synonyms[ansLang].push(m);
          }
        });
      };

      const idx = state.customVocab.findIndex(v => v.en === wordKey || v.origEn === wordKey);
      if (idx !== -1) {
        addSynsToWord(state.customVocab[idx]);
      } else {
        if (!state.editedStarters[wordKey]) {
          state.editedStarters[wordKey] = { details: { synonyms: {} } };
        }
        addSynsToWord(state.editedStarters[wordKey]);
      }

      addSynsToCache(wordKey);
      addSynsToWord(currentWord);
      saveState();

      const detailSyns = document.getElementById("detail-synonyms");
      if (detailSyns) {
        const detailsObj = getWordDetails(currentWord);
        const currentSyns = (detailsObj && detailsObj.synonyms && detailsObj.synonyms[ansLang])
          ? detailsObj.synonyms[ansLang]
          : [];
        const qLang = currentWord.questionLang || state.baseLang || "en";
        const qSyns = (detailsObj && detailsObj.synonyms && detailsObj.synonyms[qLang])
          ? detailsObj.synonyms[qLang]
          : [];
        if (currentSyns.length > 0) {
          detailSyns.innerHTML = currentSyns.map((syn, idx) => {
            const qTrans = qSyns[idx] ? ` (${qSyns[idx]})` : "";
            return `<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${syn}${qTrans}</code>`;
          }).join(", ");
        } else {
          detailSyns.innerHTML = `<span style="color: var(--text-secondary); font-style: italic; font-size: 0.8rem;">None registered</span>`;
        }
      }

      wrapAltMeaning.style.display = "none";
      btnAltMeaning.style.display = "inline-flex";

      showCustomAlert(`Alternative meaning "${val}" added successfully!`);
    };
  }

  // Typing Input Key Listener (Enter key to submit answer)
  document.getElementById("input-typing-answer").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const feedback = document.getElementById("feedback-overlay");
      const customModal = document.getElementById("custom-modal-overlay");
      
      // If modal or feedback overlay are NOT active, submit the answer
      if ((!feedback || !feedback.classList.contains("active")) && (!customModal || !customModal.classList.contains("active"))) {
        e.preventDefault();
        e.stopPropagation();
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
        
        // If last answer was incorrect, block the Enter key from proceeding
        // so that the user is forced to see the right answer and click 'Next' manually.
        if (state.currentTest && state.currentTest.lastAnswerCorrect === false) {
          return;
        }
        
        const nextBtn = document.getElementById("btn-next-question");
        if (nextBtn) {
          nextBtn.click();
        } else {
          nextQuestion();
        }
      } else if (state.currentTest && state.currentTest.selectedMode === "conjugation" && (!customModal || !customModal.classList.contains("active"))) {
        e.preventDefault();
        checkConjugationAnswer();
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
      const targetTab = btn.dataset.tab;
      document.getElementById(targetTab).classList.add("active");
      
      if (targetTab === "tab-cloud") {
        loadCloudWordSets();
      }
    };
  });

  // Cloud Share Event Listeners
  const uploadCloudBtn = document.getElementById("btn-cloud-upload");
  if (uploadCloudBtn) {
    uploadCloudBtn.onclick = uploadActiveVocabToCloud;
  }
  const refreshCloudBtn = document.getElementById("btn-refresh-cloud");
  if (refreshCloudBtn) {
    refreshCloudBtn.onclick = loadCloudWordSets;
  }

  // Auto-fill filename when selecting a custom folder to upload
  const selectCloudUploadCategory = document.getElementById("select-cloud-upload-category");
  const cloudUploadName = document.getElementById("cloud-upload-name");
  if (selectCloudUploadCategory && cloudUploadName) {
    selectCloudUploadCategory.onchange = () => {
      const val = selectCloudUploadCategory.value;
      if (val === "all") {
        cloudUploadName.value = "";
      } else {
        const folder = state.customFolders.find(f => f.id === val);
        if (folder) {
          cloudUploadName.value = folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "");
        }
      }
    };
  }

  const btnCsvImportSubmit = document.getElementById("btn-csv-import-submit");
  if (btnCsvImportSubmit) {
    btnCsvImportSubmit.onclick = executeCSVImport;
  }

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
    const base = state.baseLang || "en";
    const cleanWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).trim().toLowerCase();

    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    const existsInStarter = STARTER_VOCAB_RAW.some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    if (existsInCustom || existsInStarter) {
      alert(`Word is already present in your wordlist.`);
      return;
    }

    const cleanEn = sanitizeWordTranslation(en, "en");
    const cleanDe = sanitizeWordTranslation(de, "de");
    const cleanIt = sanitizeWordTranslation(it, "it");
    const cleanEs = sanitizeWordTranslation(es, "es");
    const cleanFr = sanitizeWordTranslation(fr, "fr");

    const newWord = {
      en: cleanEn,
      de: cleanDe,
      it: cleanIt,
      es: cleanEs,
      fr: cleanFr,
      category: category || "imported",
      image: cleanEn,
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
    sessionImportedList.push(newWord);
    saveState();
    renderImportedList();
    alert(`Word "${en}" added directly to your custom set!`);
  };

  // AI translate, classify & suggest synonyms
  document.getElementById("btn-manual-ai-process").onclick = async () => {
    const word = document.getElementById("manual-input-word").value.trim();
    const btn = document.getElementById("btn-manual-ai-process");

    if (!word) {
      alert("Please enter a word or phrase.");
      return;
    }

    const origText = btn.textContent;
    btn.textContent = "⏳ Analyzing & Translating with AI...";
    btn.disabled = true;

    try {
      const detectedBase = await detectLanguage(word) || "en";
      const prompt = `Classify and translate the vocabulary word/phrase "${word}" written in source language key "${detectedBase}".
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
        "articles": {
          "de": "der, die, or das if applicable",
          "it": "il, la, lo, etc. if applicable",
          "es": "el or la if applicable",
          "fr": "le or la if applicable"
        },
        "genderForms": {
          "de": { "m": "masculine form if applicable", "f": "feminine form if applicable" },
          "it": { "m": "masculine form if applicable", "f": "feminine form if applicable" }
        },
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

      // Populate Advanced Grammar fields from AI
      if (parsed.articles) {
        document.getElementById("manual-art-de").value = parsed.articles.de || "";
        document.getElementById("manual-art-it").value = parsed.articles.it || "";
        document.getElementById("manual-art-es").value = parsed.articles.es || "";
        document.getElementById("manual-art-fr").value = parsed.articles.fr || "";
      }
      if (parsed.genderForms) {
        document.getElementById("manual-gen-de-m").value = parsed.genderForms.de?.m || "";
        document.getElementById("manual-gen-de-f").value = parsed.genderForms.de?.f || "";
        document.getElementById("manual-gen-it-m").value = parsed.genderForms.it?.m || "";
        document.getElementById("manual-gen-it-f").value = parsed.genderForms.it?.f || "";
      }

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

  // Advanced Grammar Details Accordion Toggle
  const btnToggleGrammar = document.getElementById("btn-toggle-grammar-details");
  const grammarPanel = document.getElementById("grammar-details-panel");
  const grammarIcon = document.getElementById("grammar-toggle-icon");
  if (btnToggleGrammar && grammarPanel) {
    btnToggleGrammar.onclick = () => {
      if (grammarPanel.style.display === "none") {
        grammarPanel.style.display = "block";
        grammarIcon.textContent = "▲";
      } else {
        grammarPanel.style.display = "none";
        grammarIcon.textContent = "▼";
      }
    };
  }

  const resetGrammarFields = () => {
    document.getElementById("manual-art-de").value = "";
    document.getElementById("manual-art-it").value = "";
    document.getElementById("manual-art-es").value = "";
    document.getElementById("manual-art-fr").value = "";
    document.getElementById("manual-gen-de-m").value = "";
    document.getElementById("manual-gen-de-f").value = "";
    document.getElementById("manual-gen-it-m").value = "";
    document.getElementById("manual-gen-it-f").value = "";
    document.getElementById("manual-sentence-en").value = "";
    document.getElementById("manual-sentence-de").value = "";
    document.getElementById("manual-sentence-it").value = "";
    document.getElementById("manual-sentence-es").value = "";
    document.getElementById("manual-sentence-fr").value = "";
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

    // Advanced Grammar details
    const artDe = document.getElementById("manual-art-de").value.trim();
    const artIt = document.getElementById("manual-art-it").value.trim();
    const artEs = document.getElementById("manual-art-es").value.trim();
    const artFr = document.getElementById("manual-art-fr").value.trim();
    const genDeM = document.getElementById("manual-gen-de-m").value.trim();
    const genDeF = document.getElementById("manual-gen-de-f").value.trim();
    const genItM = document.getElementById("manual-gen-it-m").value.trim();
    const genItF = document.getElementById("manual-gen-it-f").value.trim();
    const sentEn = document.getElementById("manual-sentence-en").value.trim();
    const sentDe = document.getElementById("manual-sentence-de").value.trim();
    const sentIt = document.getElementById("manual-sentence-it").value.trim();
    const sentEs = document.getElementById("manual-sentence-es").value.trim();
    const sentFr = document.getElementById("manual-sentence-fr").value.trim();

    if (!en || !de || !it || !es || !fr) {
      alert("Please ensure all translation fields are filled before saving.");
      return;
    }

    const isEditMode = !!state.editingWordKey;
    if (isEditMode) {
      const originalKey = state.editingWordKey;
      const isCustom = state.isEditingCustom;
      
      const cleanEn = sanitizeWordTranslation(en, "en");
      const cleanDe = sanitizeWordTranslation(de, "de");
      const cleanIt = sanitizeWordTranslation(it, "it");
      const cleanEs = sanitizeWordTranslation(es, "es");
      const cleanFr = sanitizeWordTranslation(fr, "fr");
      
      if (isCustom) {
        const idx = state.customVocab.findIndex(v => v.en === originalKey || v.origEn === originalKey);
        if (idx !== -1) {
          state.customVocab[idx].en = cleanEn;
          state.customVocab[idx].de = cleanDe;
          state.customVocab[idx].it = cleanIt;
          state.customVocab[idx].es = cleanEs;
          state.customVocab[idx].fr = cleanFr;
          state.customVocab[idx].category = category;
          state.customVocab[idx].image = imageUrl || cleanEn;
          state.customVocab[idx].lastUpdated = Date.now();
          state.customVocab[idx].details = {
            ...state.customVocab[idx].details,
            articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
            genderForms: {
              de: { m: genDeM, f: genDeF },
              it: { m: genItM, f: genItF }
            },
            sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr }
          };
        }
      } else {
        const override = state.editedStarters[originalKey] || {};
        state.editedStarters[originalKey] = {
          en: cleanEn,
          de: cleanDe,
          it: cleanIt,
          es: cleanEs,
          fr: cleanFr,
          category,
          image: imageUrl || cleanEn,
          details: {
            ...override.details,
            articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
            genderForms: {
              de: { m: genDeM, f: genDeF },
              it: { m: genItM, f: genItF }
            },
            sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr }
          }
        };
      }
      
      saveState();
      
      state.editingWordKey = null;
      state.isEditingCustom = null;
      document.getElementById("btn-manual-submit").textContent = "🚀 Save Word";
      const header = document.querySelector("#tab-manual h3");
      if (header) header.textContent = "✏️ Add Custom (Manual)";
      
      // Reset input fields
      document.getElementById("manual-lang-en").value = "";
      document.getElementById("manual-lang-de").value = "";
      document.getElementById("manual-lang-it").value = "";
      document.getElementById("manual-lang-es").value = "";
      document.getElementById("manual-lang-fr").value = "";
      document.getElementById("manual-image-url").value = "";
      resetGrammarFields();
      
      alert("Word updated successfully!");
      showView("view-browse");
      if (state.selectedBrowseFolderId) {
        renderBrowseWordsList(state.selectedBrowseFolderId);
      }
      return;
    }

    const base = state.baseLang || "en";
    const cleanWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).trim().toLowerCase();

    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    const existsInStarter = STARTER_VOCAB_RAW.some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    if (existsInCustom || existsInStarter) {
      (async () => {
        const overwrite = await showCustomConfirm(`"${cleanWord}" already exists. Do you want to overwrite it with these new translations?`);
        if (overwrite) {
          const cleanEn = sanitizeWordTranslation(en, "en");
          const cleanDe = sanitizeWordTranslation(de, "de");
          const cleanIt = sanitizeWordTranslation(it, "it");
          const cleanEs = sanitizeWordTranslation(es, "es");
          const cleanFr = sanitizeWordTranslation(fr, "fr");

          if (existsInCustom) {
            const idx = state.customVocab.findIndex(v => (v[base] || v.en || "").trim().toLowerCase() === cleanWord);
            if (idx !== -1) {
              state.customVocab[idx].en = cleanEn;
              state.customVocab[idx].de = cleanDe;
              state.customVocab[idx].it = cleanIt;
              state.customVocab[idx].es = cleanEs;
              state.customVocab[idx].fr = cleanFr;
              state.customVocab[idx].category = category;
              state.customVocab[idx].image = imageUrl || cleanEn;
              state.customVocab[idx].lastUpdated = Date.now();
              state.customVocab[idx].details = {
                ...state.customVocab[idx].details,
                articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
                genderForms: {
                  de: { m: genDeM, f: genDeF },
                  it: { m: genItM, f: genItF }
                }
              };
            }
          } else {
            const starter = STARTER_VOCAB_RAW.find(v => (v[base] || v.en || "").trim().toLowerCase() === cleanWord);
            const starterKey = starter ? (starter[base] || starter.en) : cleanWord;
            const override = state.editedStarters[starterKey] || {};
            state.editedStarters[starterKey] = {
              en: cleanEn,
              de: cleanDe,
              it: cleanIt,
              es: cleanEs,
              fr: cleanFr,
              category,
              image: imageUrl || cleanEn,
              details: {
                ...override.details,
                articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
                genderForms: {
                  de: { m: genDeM, f: genDeF },
                  it: { m: genItM, f: genItF }
                }
              }
            };
          }
          
          saveState();
          
          // Reset fields
          document.getElementById("manual-input-word").value = "";
          document.getElementById("manual-lang-en").value = "";
          document.getElementById("manual-lang-de").value = "";
          document.getElementById("manual-lang-it").value = "";
          document.getElementById("manual-lang-es").value = "";
          document.getElementById("manual-lang-fr").value = "";
          document.getElementById("manual-image-url").value = "";
          resetGrammarFields();
          
          alert("Word overwritten successfully!");
        }
      })();
      return;
    }

    const cleanEn = sanitizeWordTranslation(en, "en");
    const cleanDe = sanitizeWordTranslation(de, "de");
    const cleanIt = sanitizeWordTranslation(it, "it");
    const cleanEs = sanitizeWordTranslation(es, "es");
    const cleanFr = sanitizeWordTranslation(fr, "fr");

    const newWord = {
      en: cleanEn,
      de: cleanDe,
      it: cleanIt,
      es: cleanEs,
      fr: cleanFr,
      category,
      image: imageUrl || cleanEn,
      audio: currentRecordingBase64,
      details: {
        articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
        genderForms: {
          de: { m: genDeM, f: genDeF },
          it: { m: genItM, f: genItF }
        },
        sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr },
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      },
      lastUpdated: Date.now()
    };

    newWord.lang = state.selectedLang;
    newWord.target = newWord[state.selectedLang];

    state.customVocab.push(newWord);
    sessionImportedList.push(newWord);
    saveState();
    renderImportedList();

    // Reset inputs
    document.getElementById("manual-input-word").value = "";
    document.getElementById("manual-lang-en").value = "";
    document.getElementById("manual-lang-de").value = "";
    document.getElementById("manual-lang-it").value = "";
    document.getElementById("manual-lang-es").value = "";
    document.getElementById("manual-lang-fr").value = "";
    populateManualCategoryDropdown();
    document.getElementById("manual-image-url").value = "";
    document.getElementById("manual-synonyms-container").innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">Enter a word above and run AI Translate to suggest synonyms.</li>`;
    currentRecordingBase64 = "";
    document.getElementById("btn-record-play").disabled = true;
    document.getElementById("record-status-text").textContent = "No audio recorded";

    alert("Word added successfully!");
  };

  // URL import logic removed

  // File Upload Drag & Drop & Upload controls
  const fileDropZone = document.getElementById("file-drop-zone");
  const fileInput = document.getElementById("file-import-input");
  const btnFileConfirm = document.getElementById("btn-file-confirm");
  const btnFileConfirmTop = document.getElementById("btn-file-confirm-top");

  if (fileDropZone && fileInput) {
    fileDropZone.ondragover = (e) => {
      e.preventDefault();
      fileDropZone.classList.add("dragover");
    };

    fileDropZone.ondragleave = () => {
      fileDropZone.classList.remove("dragover");
    };

    fileDropZone.ondrop = (e) => {
      e.preventDefault();
      fileDropZone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    };

    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileSelect(fileInput.files[0]);
      }
    };
  }

  if (btnFileConfirm) btnFileConfirm.onclick = executeFileImport;
  if (btnFileConfirmTop) btnFileConfirmTop.onclick = executeFileImport;

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
    const lang = state.selectedLang || "en";
    const cat = document.getElementById("bulk-category").value.trim() || "imported";
    let count = 0;
    
    const btnConfirm = document.getElementById("btn-bulk-confirm");
    const btnConfirmTop = document.getElementById("btn-bulk-confirm-top");
    const originalText = btnConfirm ? btnConfirm.textContent : "Confirm Import";
    
    const progressContainer = document.getElementById("bulk-import-progress-container");
    const progressBar = document.getElementById("bulk-import-progress-bar");
    const progressStatus = document.getElementById("bulk-import-progress-status");
    const progressPercent = document.getElementById("bulk-import-progress-percent");

    const activeRows = parsedRows.filter(r => r.active && r.word.trim());
    const total = activeRows.length;
    
    if (total > 0 && progressContainer) {
      progressContainer.style.display = "block";
      progressBar.style.width = "0%";
      progressPercent.textContent = "0%";
      progressStatus.textContent = "Starting translation & import...";
    }

    if (btnConfirm) { btnConfirm.textContent = "⏳ Translating & Importing..."; btnConfirm.disabled = true; }
    if (btnConfirmTop) { btnConfirmTop.textContent = "⏳ Importing..."; btnConfirmTop.disabled = true; }

    (async () => {
      try {
        for (const row of parsedRows) {
          if (row.active && row.word.trim()) {
            await addCustomWord(row.word.trim(), row.trans.trim(), lang, cat);
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
            saveWordlistToICloud(cat);
          }
          alert(`Successfully imported and fully translated ${count} custom words!`);
          document.getElementById("bulk-import-text").value = "";
          bulkPreviewArea.style.display = "none";
          btnBulkSwap.style.display = "none";
          parsedRows = [];
        } else {
          alert("No words selected to import.");
        }
      } catch (err) {
        console.error("Bulk import failed:", err);
        alert("Bulk import failed during translation process: " + err.message);
      } finally {
        if (btnConfirm) { btnConfirm.textContent = originalText; btnConfirm.disabled = false; }
        if (btnConfirmTop) { btnConfirmTop.textContent = "Confirm Import"; btnConfirmTop.disabled = false; }
        if (progressContainer) progressContainer.style.display = "none";
      }
    })();
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

  document.getElementById("btn-browse-back").onclick = () => showView("view-dashboard");

  const btnExpandTree = document.getElementById("btn-expand-folders-tree");
  if (btnExpandTree) {
    btnExpandTree.onclick = () => {
      state.selectedBrowseFolderId = null;
      saveState();
      renderBrowseList();
    };
  }

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
        
        const folderId = "folder_" + Date.now();
        const parentId = state.selectedBrowseFolderId && !["verbs", "nouns", "technology", "biology", "phrases"].includes(state.selectedBrowseFolderId) 
          ? state.selectedBrowseFolderId 
          : null;
        
        state.customFolders.push({ id: folderId, name: name, parentId: parentId });
        saveState();
        renderBrowseList();
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
        <span style="color:var(--accent-color);">+${session.points || session.xp || 0} pts</span>
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
  const fullHeader = document.getElementById("folders-header-full");
  const compactHeader = document.getElementById("folders-header-compact");
  const treeContainer = document.getElementById("browse-directory-tree");
  const activeFolderName = document.getElementById("browse-active-folder-name");
  const wordsCard = document.getElementById("browse-words-card");

  // Render Directory Tree
  renderDirectoryTree();
  
  if (state.selectedBrowseFolderId) {
    if (fullHeader) fullHeader.style.display = "none";
    if (treeContainer) treeContainer.style.display = "none";
    if (compactHeader) compactHeader.style.display = "flex";
    
    const allFolders = [
      { id: "verbs", name: "Verbs" },
      { id: "nouns", name: "Nouns" },
      { id: "technology", name: "Technology" },
      { id: "biology", name: "Biology" },
      { id: "phrases", name: "Phrases" },
      ...state.customFolders
    ];
    const folder = allFolders.find(f => f.id === state.selectedBrowseFolderId);
    if (activeFolderName) activeFolderName.textContent = folder ? folder.name : state.selectedBrowseFolderId;

    if (wordsCard) wordsCard.style.display = "block";
    renderBrowseWordsList(state.selectedBrowseFolderId);
  } else {
    if (fullHeader) fullHeader.style.display = "flex";
    if (treeContainer) treeContainer.style.display = "block";
    if (compactHeader) compactHeader.style.display = "none";
    if (wordsCard) wordsCard.style.display = "none";
  }
}

function renderDirectoryTree() {
  const treeContainer = document.getElementById("browse-directory-tree");
  if (!treeContainer) return;
  
  treeContainer.innerHTML = "";
  
  // Add Drop target for root level
  const rootDrop = document.createElement("div");
  rootDrop.className = "tree-node";
  rootDrop.style.border = "1.5px dashed rgba(76, 201, 240, 0.3)";
  rootDrop.style.background = "rgba(76, 201, 240, 0.03)";
  rootDrop.style.justifyContent = "center";
  rootDrop.style.fontStyle = "italic";
  rootDrop.style.fontSize = "0.85rem";
  rootDrop.style.color = "var(--accent-color)";
  rootDrop.style.marginBottom = "8px";
  rootDrop.innerHTML = "📂 Drop folder here to move to Root";
  rootDrop.setAttribute("ondragover", "window.onTreeDragOver(event)");
  rootDrop.setAttribute("ondragleave", "window.onTreeDragLeave(event)");
  rootDrop.setAttribute("ondrop", "window.onTreeDrop(event, 'root')");
  treeContainer.appendChild(rootDrop);

  const allFolders = state.customFolders || [];
  
  const html = buildTreeHTML(allFolders, null, 0);
  
  const treeWrapper = document.createElement("div");
  treeWrapper.innerHTML = html || `<p class="empty-state" style="padding: 16px; margin: 0;">No custom folders created yet. Click "New Folder" to start!</p>`;
  treeContainer.appendChild(treeWrapper);
  
  // Setup standard list button action inside directory tree context if needed
  const btnAddWord = document.getElementById("btn-add-word-to-folder");
  if (btnAddWord) {
    btnAddWord.onclick = () => {
      showView("view-import");
      const importTabBtn = document.querySelector('[data-tab="tab-manual"]');
      if (importTabBtn) importTabBtn.click();
      
      const manualCatInput = document.getElementById("manual-category");
      if (manualCatInput && state.selectedBrowseFolderId) {
        manualCatInput.value = state.selectedBrowseFolderId;
      }
    };
  }
}

function renderBrowseWordsList(folderId) {
  const wordsCard = document.getElementById("browse-words-card");
  const wordsTableBody = document.getElementById("browse-words-table-body");
  const titleEl = document.getElementById("browse-list-title");
  if (!wordsCard || !wordsTableBody) return;
  
  wordsCard.style.display = "block";
  wordsTableBody.innerHTML = "";
  
  const allFolders = [
    { id: "verbs", name: "Verbs" },
    { id: "nouns", name: "Nouns" },
    { id: "technology", name: "Technology" },
    { id: "biology", name: "Biology" },
    { id: "phrases", name: "Phrases" },
    ...state.customFolders
  ];
  const folder = allFolders.find(f => f.id === folderId);
  const folderName = folder ? folder.name : folderId;
  
  const base = state.baseLang || "en";
  
  // Set default browse study language if not set or matches base language
  const languages = ["en", "de", "it", "es", "fr"];
  if (!state.browseTargetLang) {
    state.browseTargetLang = state.selectedLang || "de";
  }
  if (state.browseTargetLang === base) {
    state.browseTargetLang = languages.find(l => l !== base) || "de";
  }

  // Populate dynamic flag picker
  const flagRow = document.getElementById("browse-lang-selectors-row");
  if (flagRow) {
    flagRow.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Study Language:</span>`;
    languages.forEach(lang => {
      if (lang === base) return; // skip base language flag
      const btn = document.createElement("button");
      btn.className = `lang-btn ${state.browseTargetLang === lang ? 'active' : ''}`;
      btn.style.padding = "6px 12px";
      btn.style.fontSize = "0.8rem";
      btn.style.minHeight = "32px";
      btn.style.borderRadius = "8px";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "4px";
      btn.style.margin = "0";
      btn.style.width = "auto";
      btn.style.flexDirection = "row";
      
      const labelNames = { en: "English", de: "German", it: "Italiano", es: "Spanish", fr: "French" };
      btn.innerHTML = `${getFlagHtml(lang)} ${labelNames[lang] || lang}`;
      
      btn.onclick = () => {
        state.browseTargetLang = lang;
        saveState();
        renderBrowseWordsList(folderId);
      };
      flagRow.appendChild(btn);
    });
  }

  // Populate table headers with flags and names
  const hdrBase = document.getElementById("browse-hdr-base");
  const hdrTarget = document.getElementById("browse-hdr-target");
  const langNames = { en: "English", de: "German", it: "Italiano", es: "Spanish", fr: "French" };
  if (hdrBase) {
    hdrBase.innerHTML = `${getFlagHtml(base)} ${langNames[base] || base.toUpperCase()}`;
    hdrBase.style.color = getLangColor(base);
  }
  if (hdrTarget) {
    const target = state.browseTargetLang;
    hdrTarget.innerHTML = `${getFlagHtml(target)} ${langNames[target] || target.toUpperCase()}`;
    hdrTarget.style.color = getLangColor(target);
  }

  let pool = [];
  const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(folderId);
  
  if (isStandard) {
    pool = STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).map(item => {
      const override = state.editedStarters[item[base]] || {};
      return {
        en: override.en || item.en || item[base] || "",
        de: override.de || item.de || "",
        it: override.it || item.it || "",
        es: override.es || item.es || "",
        fr: override.fr || item.fr || "",
        category: item.category,
        image: item.image,
        details: item.details || {},
        isStarter: true,
        origEn: item[base]
      };
    });
  } else {
    pool = state.customVocab.filter(v => v.category === folderId).map(item => ({
      en: item.en || "",
      de: item.de || "",
      it: item.it || "",
      es: item.es || "",
      fr: item.fr || "",
      category: item.category,
      image: item.image,
      details: item.details || {},
      isStarter: false
    }));
  }
  
  titleEl.textContent = `Words in Folder: ${folderName} (${pool.length})`;
  
  if (pool.length === 0) {
    wordsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding: 16px; text-align: center; color: var(--text-secondary);">No words in this folder yet. Drag and drop words here or manually add.</td></tr>`;
    return;
  }

  // Select All Checkbox logic
  const chkAll = document.getElementById("chk-select-all-browse");
  if (chkAll) {
    chkAll.checked = false;
    chkAll.onclick = (e) => {
      document.querySelectorAll(".chk-select-browse").forEach(chk => {
        chk.checked = e.target.checked;
      });
    };
  }

  // Fix Selected Translations action
  const btnFixTrans = document.getElementById("btn-fix-selected-translations");
  if (btnFixTrans) {
    btnFixTrans.onclick = async () => {
      const selected = document.querySelectorAll(".chk-select-browse:checked");
      if (selected.length === 0) {
        alert("Please select at least one word to translate/fix.");
        return;
      }

      const origText = btnFixTrans.textContent;
      btnFixTrans.disabled = true;
      btnFixTrans.textContent = `⏳ Fixing 0/${selected.length}...`;

      let count = 0;
      for (const chk of selected) {
        const baseKey = chk.dataset.baseKey;
        const targetKey = chk.dataset.targetKey;
        const isCustom = chk.dataset.custom === "true";
        
        let item = null;
        if (isCustom) {
          item = state.customVocab.find(v => 
            v.category === folderId &&
            (v[base] || "").toLowerCase() === baseKey.toLowerCase() &&
            (v[target] || "").toLowerCase() === targetKey.toLowerCase()
          );
        } else {
          const override = state.editedStarters[baseKey] || {};
          const starter = STARTER_VOCAB_RAW.find(v => 
            v.category === folderId &&
            (v[base] || "").toLowerCase() === baseKey.toLowerCase()
          );
          if (starter) {
            item = {
              en: override.en || starter.en || baseKey,
              de: override.de || starter.de || "",
              it: override.it || starter.it || "",
              es: override.es || starter.es || "",
              fr: override.fr || starter.fr || "",
              category: starter.category,
              image: starter.image,
              details: override.details || starter.details || {},
              isStarter: true,
              origEn: baseKey
            };
          }
        }

        if (item) {
          const baseLang = item.en ? "en" : item.de ? "de" : item.it ? "it" : item.es ? "es" : "fr";
          const baseText = item[baseLang];

          const hasKey = state.openaiKey || state.grokKey || state.geminiKey;
          if (hasKey) {
            const aiResult = await translateAndDetectWithAI(baseText);
            if (aiResult) {
              item.en = sanitizeWordTranslation(aiResult.en, "en");
              item.de = sanitizeWordTranslation(aiResult.de, "de");
              item.it = sanitizeWordTranslation(aiResult.it, "it");
              item.es = sanitizeWordTranslation(aiResult.es, "es");
              item.fr = sanitizeWordTranslation(aiResult.fr, "fr");
            }
          } else {
            await fillMissingTranslations(item, baseLang);
          }

          if (isCustom) {
            const idx = state.customVocab.findIndex(v => 
              v.category === folderId &&
              (v[base] || "").toLowerCase() === baseKey.toLowerCase() &&
              (v[target] || "").toLowerCase() === targetKey.toLowerCase()
            );
            if (idx !== -1) {
              state.customVocab[idx] = { ...state.customVocab[idx], ...item };
            }
          } else {
            state.editedStarters[baseKey] = {
              en: item.en,
              de: item.de,
              it: item.it,
              es: item.es,
              fr: item.fr
            };
          }
        }

        count++;
        btnFixTrans.textContent = `⏳ Fixing ${count}/${selected.length}...`;
      }

      saveState();
      renderBrowseWordsList(folderId);
      btnFixTrans.disabled = false;
      btnFixTrans.textContent = origText;
      alert(`Successfully updated translations for ${selected.length} items!`);
    };
  }
  
  const esc = (s) => (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  pool.forEach(vocab => {
    const isCustom = !vocab.isStarter;
    const key = isCustom ? vocab.en : vocab.origEn;
    
    const stats = state.wordStats[vocab.en] || { attempts: 0, errors: 0, box: 1 };
    const box = stats.box || 1;
    const errors = stats.errors || 0;
    
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
    
    tr.setAttribute("draggable", "true");
    tr.ondragstart = (e) => {
      e.dataTransfer.setData("text/word-key", key);
      tr.style.opacity = "0.4";
    };
    tr.ondragend = () => {
      tr.style.opacity = "1";
    };

    const star = (txt, l) => isCommonWord(txt, l) ? '⭐' : '';
    
    const inputHtml = (lang, val, isBold = false) => {
      const color = getLangColor(lang);
      const boldStyle = isBold ? "font-weight: 700;" : "";
      const displayVal = val || "";
      const commonStar = star(val, lang);
      return `
        <div style="display: flex; align-items: center; width: 100%; position: relative;">
          <input type="text" class="browse-edit-input" style="${boldStyle} color: ${color}; padding-right: 20px;" 
                 value="${esc(displayVal)}" placeholder="(empty)"
                 autocomplete="off" spellcheck="false"
                 onkeydown="if(event.key === 'Enter') this.blur()">
          ${commonStar ? `<span title="High Frequency / Common Word" style="position: absolute; right: 4px; color: #f59e0b; pointer-events: none; font-size: 0.8rem;">⭐</span>` : ''}
        </div>
      `;
    };

    tr.innerHTML = `
      <td style="padding: 10px 12px; text-align: center;">
        <input type="checkbox" class="chk-select-browse" data-base-key="${esc(vocab[base])}" data-target-key="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td style="padding: 10px 12px;">${inputHtml(base, vocab[base], true)}</td>
      <td style="padding: 10px 12px;">${inputHtml(state.browseTargetLang, vocab[state.browseTargetLang])}</td>
      <td style="padding: 10px 12px; text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
          <button type="button" class="tree-action-btn" title="Save Changes" data-original-base="${esc(vocab[base])}" data-original-target="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" onclick="event.preventDefault(); event.stopPropagation(); window.saveRowChanges(this)">💾</button>
          <button type="button" class="tree-action-btn" title="Delete" style="color: var(--error-color);" data-original-base="${esc(vocab[base])}" data-original-target="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" onclick="event.preventDefault(); event.stopPropagation(); window.triggerDeleteWord(this)">❌</button>
        </div>
      </td>
    `;
    
    wordsTableBody.appendChild(tr);
  });
}

window.saveRowChanges = async function(buttonEl, originalBaseKey, originalTargetKey, isCustom) {
  console.log("=== saveRowChanges triggered ===");
  if (originalBaseKey === undefined) {
    originalBaseKey = buttonEl.dataset.originalBase;
    originalTargetKey = buttonEl.dataset.originalTarget;
    isCustom = buttonEl.dataset.custom === "true";
  }
  console.log("originalBaseKey:", originalBaseKey);
  console.log("originalTargetKey:", originalTargetKey);
  console.log("isCustom:", isCustom);
  
  // CRITICAL: Read input values IMMEDIATELY before any await (Edge compatibility)
  const tr = buttonEl.closest("tr");
  if (!tr) {
    console.error("Row element not found");
    return;
  }
  
  const inputs = tr.querySelectorAll("input.browse-edit-input");
  console.log("Inputs count in row:", inputs.length);
  if (inputs.length < 2) {
    console.error("Required inputs not found in row");
    return;
  }
  
  const baseVal = inputs[0].value.trim();
  const targetVal = inputs[1].value.trim();
  console.log("Read input values -> base:", baseVal, "target:", targetVal);
  
  const base = state.baseLang || "en";
  const target = state.browseTargetLang || "de";
  console.log("Active languages -> baseLang:", base, "browseTargetLang:", target);
  
  if (!baseVal || !targetVal) {
    alert("Both translation fields must have a value.");
    return;
  }
  
  const cleanBaseVal = sanitizeWordTranslation(baseVal, base);
  const cleanTargetVal = sanitizeWordTranslation(targetVal, target);
  console.log("Cleaned values -> base:", cleanBaseVal, "target:", cleanTargetVal);

  // Directly query/request directory write permissions within the click event user gesture context
  if (isCustom && state.icloudHandle) {
    console.log("Checking iCloud/local sync folder write permissions...");
    try {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      console.log("Current permission status:", perm);
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        console.log("Requested permission outcome:", req);
        if (req !== "granted") {
          alert("Directory write permission denied. Changes cannot be saved to folder files.");
          return;
        }
      }
    } catch (err) {
      console.error("FS Permission check error:", err);
    }
  }
  
  // 1. Migrate stats and cache if base word is edited
  if (originalBaseKey !== cleanBaseVal) {
    console.log("Base word edited. Migrating stats & cache...");
    if (state.wordStats[originalBaseKey]) {
      state.wordStats[cleanBaseVal] = state.wordStats[originalBaseKey];
      delete state.wordStats[originalBaseKey];
    }
    if (state.dictionaryCache && state.dictionaryCache[originalBaseKey]) {
      state.dictionaryCache[cleanBaseVal] = state.dictionaryCache[originalBaseKey];
      delete state.dictionaryCache[originalBaseKey];
    }
  }
  
  if (isCustom) {
    const folderId = state.selectedBrowseFolderId;
    console.log("Searching in customVocab for category:", folderId);
    const idx = state.customVocab.findIndex(v => 
      v.category === folderId &&
      (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
      (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase()
    );
    console.log("findIndex result index:", idx);
    
    if (idx !== -1) {
      state.customVocab[idx][base] = cleanBaseVal;
      state.customVocab[idx][target] = cleanTargetVal;
      
      // Keep compatibility fields
      if (base === "en") {
        state.customVocab[idx].en = cleanBaseVal;
        if (state.customVocab[idx].origEn) state.customVocab[idx].origEn = cleanBaseVal;
      }
      if (target === "en") {
        state.customVocab[idx].en = cleanTargetVal;
        if (state.customVocab[idx].origEn) state.customVocab[idx].origEn = cleanTargetVal;
      }
      if (base === state.selectedLang) {
        state.customVocab[idx].target = cleanBaseVal;
      }
      if (target === state.selectedLang) {
        state.customVocab[idx].target = cleanTargetVal;
      }
      
      state.customVocab[idx].lastUpdated = Date.now();
      
      // Auto-save to iCloud if enabled
      if (state.icloudHandle) {
        saveWordlistToICloud(state.customVocab[idx].category);
      }
    } else {
      alert(`Error: Word "${originalBaseKey}" could not be found in custom vocabulary database.`);
      return;
    }
  } else {
    // Standard starter vocabulary:
    if (!state.editedStarters[originalBaseKey]) {
      const starter = STARTER_VOCAB_RAW.find(v => 
        v.category === state.selectedBrowseFolderId &&
        (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase()
      );
      if (starter) {
        state.editedStarters[originalBaseKey] = {
          en: starter.en || starter.origEn || (base === "en" ? originalBaseKey : ""),
          de: starter.de || (base === "de" ? originalBaseKey : ""),
          it: starter.it || (base === "it" ? originalBaseKey : ""),
          es: starter.es || (base === "es" ? originalBaseKey : ""),
          fr: starter.fr || (base === "fr" ? originalBaseKey : ""),
          category: starter.category,
          image: starter.image || starter.en
        };
      }
    }
    
    if (state.editedStarters[originalBaseKey]) {
      state.editedStarters[originalBaseKey][base] = cleanBaseVal;
      state.editedStarters[originalBaseKey][target] = cleanTargetVal;
      if (base === "en") {
        state.editedStarters[originalBaseKey].en = cleanBaseVal;
      }
      if (target === "en") {
        state.editedStarters[originalBaseKey].en = cleanTargetVal;
      }
    } else {
      alert(`Error: Starter word "${originalBaseKey}" could not be resolved.`);
      return;
    }
  }
  
  saveState();

  // Update the row IN-PLACE instead of rebuilding the entire DOM.
  // This avoids Edge's aggressive form-value restoration that reverts input values
  // when the DOM is torn down and rebuilt via renderBrowseList().
  const esc = (s) => (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  
  // Update input default values so they reflect the saved state
  inputs[0].value = cleanBaseVal;
  inputs[0].defaultValue = cleanBaseVal;
  inputs[0].setAttribute("value", cleanBaseVal);
  inputs[1].value = cleanTargetVal;
  inputs[1].defaultValue = cleanTargetVal;
  inputs[1].setAttribute("value", cleanTargetVal);
  
  // Update the save and delete buttons dataset attributes for the next action
  const saveBtn = tr.querySelector('button[title="Save Changes"]');
  if (saveBtn) {
    saveBtn.dataset.originalBase = cleanBaseVal;
    saveBtn.dataset.originalTarget = cleanTargetVal;
  }
  
  const delBtn = tr.querySelector('button[title="Delete"]');
  if (delBtn) {
    delBtn.dataset.originalBase = cleanBaseVal;
    delBtn.dataset.originalTarget = cleanTargetVal;
  }
  
  // Update the checkbox data attributes
  const chk = tr.querySelector(".chk-select-browse");
  if (chk) {
    chk.dataset.baseKey = cleanBaseVal;
    chk.dataset.targetKey = cleanTargetVal;
  }
  
  // Brief visual feedback on the save button
  if (saveBtn) {
    saveBtn.textContent = "✅";
    setTimeout(() => { saveBtn.textContent = "💾"; }, 1200);
  }
  
  updateCategoryCounts();
};


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

// ==========================================
// 11. iCloud / Local Folder Synchronization
// ==========================================
const idb = {
  dbName: "VocTrainerDB",
  storeName: "handles",
  getDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  },
  async set(key, val) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
  }
};

state.icloudHandle = null;
state.backupFileHandle = null;

async function initBackupFile() {
  if (!window.showSaveFilePicker) {
    const statusSpan = document.getElementById("backup-file-status");
    if (statusSpan) {
      statusSpan.textContent = "⚠️ Not supported in this browser/context";
      statusSpan.style.color = "var(--error-color)";
    }
    return;
  }
  try {
    const handle = await idb.get("backup_file_handle");
    if (handle) {
      state.backupFileHandle = handle;
      const statusSpan = document.getElementById("backup-file-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${handle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      const selectBtn = document.getElementById("btn-select-backup-file");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Access";
        selectBtn.className = "btn btn-secondary";
      }
      const changeBtn = document.getElementById("btn-change-backup-file");
      if (changeBtn) {
        changeBtn.style.display = "inline-block";
      }
    }
  } catch (err) {
    console.error("Failed to load backup file handle:", err);
  }
}

window.handleBackupFileButtonClick = async function() {
  if (!window.showSaveFilePicker) {
    alert("Persistent Backup File Access is not supported in this browser or context.\n\nRequirements:\n1. Use a modern desktop browser (Chrome, Edge, Opera).\n2. Access the app via http://localhost:8080 or https:// (secure context).\n\nIf you are on iOS, Safari, or Firefox, please use the standard Export Backup button.");
    return;
  }

  if (!state.backupFileHandle) {
    await window.changeBackupFile();
  } else {
    await window.writeBackupToFile();
  }
};

window.changeBackupFile = async function() {
  if (!window.showSaveFilePicker) {
    alert("Persistent Backup File Access is not supported in this browser.");
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "voctrainer_backup.json",
      types: [{
        description: "JSON Backup File",
        accept: { "application/json": [".json"] }
      }]
    });
    state.backupFileHandle = handle;
    await idb.set("backup_file_handle", handle);
    onBackupFileAccessGranted();
    
    // Auto-save backup after selecting
    await window.writeBackupToFile();
  } catch (err) {
    if (err.name !== "AbortError") {
      alert("Failed to set backup file: " + err.message);
    }
  }
};

window.writeBackupToFile = async function() {
  if (!state.backupFileHandle) return;
  try {
    const perm = await state.backupFileHandle.queryPermission({ mode: "readwrite" });
    let granted = perm === "granted";
    if (!granted) {
      const req = await state.backupFileHandle.requestPermission({ mode: "readwrite" });
      granted = req === "granted";
    }
    if (granted) {
      const writable = await state.backupFileHandle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
      onBackupFileAccessGranted();
      showCustomAlert("🎉 Backup successfully exported and updated in your fixed file!");
    } else {
      alert("Write permission denied. Could not write backup.");
    }
  } catch (err) {
    alert("Failed to write backup: " + err.message);
  }
};

function onBackupFileAccessGranted() {
  const statusSpan = document.getElementById("backup-file-status");
  if (statusSpan && state.backupFileHandle) {
    statusSpan.textContent = `📁 ${state.backupFileHandle.name} (Ready)`;
    statusSpan.style.color = "var(--success-color)";
  }
  const selectBtn = document.getElementById("btn-select-backup-file");
  if (selectBtn) {
    selectBtn.textContent = "💾 Save Backup to File";
    selectBtn.className = "btn btn-primary";
  }
  const changeBtn = document.getElementById("btn-change-backup-file");
  if (changeBtn) {
    changeBtn.style.display = "inline-block";
  }
}


async function initICloudSync() {
  if (!window.showDirectoryPicker) {
    const statusSpan = document.getElementById("icloud-folder-status");
    if (statusSpan) {
      statusSpan.textContent = "❌ Not supported on this browser";
      statusSpan.style.color = "var(--error-color)";
    }
    const selectBtn = document.getElementById("btn-select-icloud-folder");
    if (selectBtn) {
      selectBtn.disabled = true;
      selectBtn.style.opacity = "0.5";
      selectBtn.style.cursor = "not-allowed";
      selectBtn.textContent = "Sync Not Supported";
    }
    return;
  }
  try {
    const handle = await idb.get("icloud_handle");
    if (handle) {
      state.icloudHandle = handle;
      const statusSpan = document.getElementById("icloud-folder-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${handle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      
      const selectBtn = document.getElementById("btn-select-icloud-folder");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Folder Access";
      }

      const syncBtn = document.getElementById("btn-sync-folder-now");
      if (syncBtn) {
        syncBtn.style.display = "inline-flex";
      }
    }
  } catch (err) {
    console.error("Failed to load iCloud handle:", err);
  }
}

async function selectICloudFolder() {
  if (!window.showDirectoryPicker) {
    alert("Folder Syncing (File System Access API) is not supported in this browser. Please use a desktop Chromium browser (e.g. Chrome, Edge) for live folder synchronization. On iOS, Safari, or Firefox, you can use the manual Import/Export backups below.");
    return;
  }
  try {
    if (state.icloudHandle) {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        if (req === "granted") {
          onICloudFolderAccessGranted();
          return;
        }
      }
    }

    const handle = await window.showDirectoryPicker();
    state.icloudHandle = handle;
    await idb.set("icloud_handle", handle);
    onICloudFolderAccessGranted();
  } catch (err) {
    if (err.name !== "AbortError") {
      alert("Failed to access folder: " + err.message);
    }
  }
}

async function onICloudFolderAccessGranted() {
  const statusSpan = document.getElementById("icloud-folder-status");
  if (statusSpan) {
    statusSpan.textContent = `📁 ${state.icloudHandle.name}`;
    statusSpan.style.color = "#4CAF50";
  }
  const selectBtn = document.getElementById("btn-select-icloud-folder");
  if (selectBtn) {
    selectBtn.textContent = "📂 Change Sync Folder";
  }
  const syncBtn = document.getElementById("btn-sync-folder-now");
  if (syncBtn) {
    syncBtn.style.display = "inline-flex";
  }
  
  await syncICloudFolder();
}

async function syncICloudFolder() {
  if (!state.icloudHandle) return;

  const container = document.getElementById("icloud-wordlists-container");
  const tbody = document.getElementById("icloud-lists-table-body");
  if (container) container.style.display = "block";

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-secondary);">Scanning folder...</td></tr>`;
  }

  try {
    const files = [];
    for await (const entry of state.icloudHandle.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".json")) {
        files.push(entry);
      }
    }

    const fileListDetails = [];
    
    // Clear old synced items to sync fresh from folder
    const syncedFolderIds = [];

    for (const entry of files) {
      const file = await entry.getFile();
      const content = await file.text();
      try {
        const parsed = JSON.parse(content);
        let wordCount = 0;
        let folderMeta = null;

        if (Array.isArray(parsed)) {
          wordCount = parsed.length;
        } else if (parsed && Array.isArray(parsed.vocab)) {
          wordCount = parsed.vocab.length;
          folderMeta = parsed.folder;
        }

        const isActive = state.activeICloudLists[entry.name] !== false;
        
        fileListDetails.push({
          filename: entry.name,
          name: entry.name.replace(".json", ""),
          count: wordCount,
          isActive: isActive,
          folder: folderMeta,
          vocab: Array.isArray(parsed) ? parsed : (parsed.vocab || [])
        });

        if (folderMeta) {
          syncedFolderIds.push(folderMeta.id);
        }
      } catch (e) {}
    }

    // Filter out old synced vocabulary and folders
    state.customVocab = state.customVocab.filter(v => !syncedFolderIds.includes(v.category));
    state.customFolders = state.customFolders.filter(f => !syncedFolderIds.includes(f.id));

    // Merge active sets
    fileListDetails.forEach(set => {
      if (set.isActive) {
        if (set.folder) {
          const folderExists = state.customFolders.some(f => f.id === set.folder.id);
          if (!folderExists) {
            state.customFolders.push(set.folder);
          }
        }
        
        set.vocab.forEach(word => {
          const base = state.baseLang || "en";
          const wordText = (word[base] || "").toLowerCase().trim();
          const exists = state.customVocab.some(v => v.category === word.category && (v[base] || "").toLowerCase().trim() === wordText);
          if (!exists) {
            state.customVocab.push(word);
          }
        });
      }
    });

    saveState();
    renderImportedList();
    updateCategoryCounts();

    // Render table
    if (tbody) {
      if (fileListDetails.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-secondary);">No wordlists found in folder.</td></tr>`;
        return;
      }

      tbody.innerHTML = "";
      fileListDetails.forEach(set => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        tr.innerHTML = `
          <td style="padding:10px; text-align:center;">
            <input type="checkbox" ${set.isActive ? "checked" : ""} onchange="window.toggleICloudListSync('${set.filename}', this.checked)" style="width:16px; height:16px; accent-color:var(--accent-color); cursor:pointer;">
          </td>
          <td style="padding:10px; font-weight:600; color:#fff;">📁 ${set.name}</td>
          <td style="padding:10px; text-align:center; color:var(--accent-color); font-weight:600;">${set.count}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("iCloud sync error:", err);
    const isPermissionError = err.name === "NotAllowedError" || err.name === "SecurityError" || err.message.toLowerCase().includes("permission") || err.message.toLowerCase().includes("allow");
    
    if (isPermissionError) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#FF9800;">⚠️ Access permission required. Click "Grant Folder Access" above.</td></tr>`;
      }
      
      const statusSpan = document.getElementById("icloud-folder-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${state.icloudHandle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      
      const selectBtn = document.getElementById("btn-select-icloud-folder");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Folder Access";
      }
    } else {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--error-color);">❌ Sync failed: ${err.message}</td></tr>`;
      }
    }
  }
}

let icloudSaveTimeout = null;
function saveWordlistToICloud(folderId) {
  if (!state.icloudHandle) return;
  
  clearTimeout(icloudSaveTimeout);
  icloudSaveTimeout = setTimeout(async () => {
    try {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        if (req !== "granted") return;
      }

      const folder = state.customFolders.find(f => f.id === folderId);
      if (!folder) return;

      const filename = `${folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "")}.json`;
      const folderWords = state.customVocab.filter(v => v.category === folderId);

      const fileHandle = await state.icloudHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();

      const data = {
        vocab: folderWords,
        folder: folder
      };

      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      state.activeICloudLists[filename] = true;
      saveState();
      
      if (document.getElementById("view-setup").classList.contains("active")) {
        await syncICloudFolder();
      }
    } catch (err) {
      console.error("Failed to auto-save wordlist to folder:", err);
    }
  }, 500);
}

window.toggleICloudListSync = async function(filename, checked) {
  state.activeICloudLists[filename] = checked;
  saveState();
  await syncICloudFolder();
};

window.downloadAndImportCloudSet = () => {};
window.deleteCloudSet = () => {};

// 12. Direct Semicolon CSV Import
async function executeCSVImport() {
  const textInput = document.getElementById("csv-import-text");
  const catInput = document.getElementById("csv-category");
  if (!textInput || !catInput) return;

  const text = textInput.value;
  const category = catInput.value.trim() || "csv-import";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    alert("Please paste some semicolon-separated lines first.");
    return;
  }

  let addedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  const base = state.baseLang || "en";
  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];

  for (const line of lines) {
    const parts = line.split(";").map(p => p.trim());
    if (parts.length < 5) {
      invalidCount++;
      continue;
    }

    const en = parts[0];
    const de = parts[1];
    const it = parts[2];
    const es = parts[3];
    const fr = parts[4];

    if (!en || !de || !it || !es || !fr) {
      invalidCount++;
      continue;
    }

    // Check if word already exists in target customVocab category
    const cleanBaseWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).toLowerCase();
    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanBaseWord && v.category === category;
    });

    if (existsInCustom) {
      duplicateCount++;
      continue;
    }

    // Create new word directly
    const newWord = {
      en: sanitizeWordTranslation(en, "en"),
      de: sanitizeWordTranslation(de, "de"),
      it: sanitizeWordTranslation(it, "it"),
      es: sanitizeWordTranslation(es, "es"),
      fr: sanitizeWordTranslation(fr, "fr"),
      category: category,
      image: en,
      details: {
        articles: {},
        sentences: {
          en: `I see the ${en}.`,
          de: `Ich sehe ${de}.`,
          it: `Vedo ${it}.`,
          es: `Veo ${es}.`,
          fr: `Je vois ${fr}.`
        },
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      },
      lastUpdated: Date.now()
    };

    // Ensure custom category folder exists if not standard
    if (!staticFolders.includes(category)) {
      const folderExists = (state.customFolders || []).some(f => f.id === category || f.name === category);
      if (!folderExists) {
        state.customFolders.push({ id: category, name: category, parentId: null });
      }
    }

    state.customVocab.push(newWord);
    sessionImportedList.push(newWord);
    addedCount++;
  }

  if (addedCount > 0) {
    saveState();
    renderImportedList();
    updateCategoryCounts();
    if (state.icloudHandle) {
      saveWordlistToICloud(category);
    }
    alert(`🎉 CSV Import finished!\nSuccessfully imported: ${addedCount} words.\nDuplicates skipped: ${duplicateCount}.\nInvalid lines: ${invalidCount}.`);
    textInput.value = "";
  } else {
    alert(`No words imported.\nDuplicates skipped: ${duplicateCount}.\nInvalid lines (not 5 columns): ${invalidCount}.`);
  }
}

// ==========================================
// 12. Easy Multi-Device Cloud Sync Logic
// ==========================================
function getSyncApiUrl(suffix = "") {
  if (window.location.hostname.includes("onrender.com") || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/api/vocabdata${suffix}`;
  } else {
    return `https://voctrainer-app.onrender.com/api/vocabdata${suffix}`;
  }
}

function updateCloudSyncUI() {
  const activeZone = document.getElementById("cloud-sync-active-zone");
  const setupZoneEasy = document.getElementById("cloud-sync-setup-zone-easy");
  const setupZoneGithub = document.getElementById("cloud-sync-setup-zone-github");
  const codeDisplay = document.getElementById("cloud-sync-code-display");
  const codeLabel = document.getElementById("cloud-sync-code-label");
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  
  if (!activeZone || !setupZoneEasy || !setupZoneGithub || !codeDisplay) return;

  if (window.location.protocol === "file:" && state.syncProvider === "easy") {
    activeZone.style.display = "none";
    setupZoneEasy.style.display = "flex";
    setupZoneGithub.style.display = "none";
    codeDisplay.textContent = "-";
    if (statusMsg) {
      statusMsg.innerHTML = "⚠️ Cloud Sync is blocked when running via <code>file://</code>. Please open the app via <code>http://localhost:8080</code> instead.";
      statusMsg.style.color = "var(--error-color)";
      statusMsg.parentElement.style.display = "block";
    }
    return;
  }

  // Prefill GitHub inputs if present
  const inputToken = document.getElementById("input-github-token");
  const inputGistId = document.getElementById("input-github-gist-id");
  if (inputToken) inputToken.value = state.githubToken || "";
  if (inputGistId) inputGistId.value = state.githubGistId || "";

  if (state.cloudSyncId) {
    activeZone.style.display = "block";
    setupZoneEasy.style.display = "none";
    setupZoneGithub.style.display = "none";
    codeDisplay.textContent = state.cloudSyncId;
    if (codeLabel) {
      codeLabel.textContent = state.syncProvider === "github" ? "GitHub Gist ID / Sync Code:" : "Your Active Sync Code:";
    }
  } else {
    activeZone.style.display = "none";
    const btnModeEasy = document.getElementById("btn-sync-mode-easy");
    const btnModeGithub = document.getElementById("btn-sync-mode-github");
    
    if (state.syncProvider === "github") {
      if (btnModeGithub) btnModeGithub.classList.add("active");
      if (btnModeEasy) btnModeEasy.classList.remove("active");
      setupZoneEasy.style.display = "none";
      setupZoneGithub.style.display = "flex";
    } else {
      if (btnModeEasy) btnModeEasy.classList.add("active");
      if (btnModeGithub) btnModeGithub.classList.remove("active");
      setupZoneEasy.style.display = "flex";
      setupZoneGithub.style.display = "none";
    }
    codeDisplay.textContent = "-";
  }
}

function getSanitizedSyncPayload() {
  const payload = {
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
    questionTimer: state.questionTimer,
    baseLang: state.baseLang,
    selectedLang: state.selectedLang,
    history: state.history,
    deletedStarters: state.deletedStarters,
    deletedCustomVocab: state.deletedCustomVocab,
    editedStarters: state.editedStarters,
    customFolders: state.customFolders,
    wordStats: state.wordStats,
    testDirection: state.testDirection,
    customVoices: state.customVoices,
    activeICloudLists: state.activeICloudLists
  };

  // Slice history to the last 100 entries to optimize size
  if (payload.history && payload.history.length > 100) {
    payload.history = payload.history.slice(-100);
  }

  let payloadStr = JSON.stringify(payload);
  
  // If still too large (e.g. > 1.2MB), strip audio properties to ensure successful upload
  if (payloadStr.length > 1200000) {
    console.warn(`Sync payload is very large (${payloadStr.length} bytes). Stripping heavy base64 custom voice recordings...`);
    payload.customVocab = state.customVocab.map(item => {
      const copy = { ...item };
      delete copy.audio;
      return copy;
    });
    payload.audioStripped = true;
  }
  
  return payload;
}

async function pushToCloud() {
  if (state.syncProvider === "github") {
    await pushToGitHubGist();
    return;
  }
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!state.cloudSyncId) return;
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Syncing with cloud...";
    statusMsg.style.color = "var(--text-secondary)";
  }
  
  const payload = getSanitizedSyncPayload();

  try {
    const res = await fetch(getSyncApiUrl(`/${state.cloudSyncId}`), {
      method: "PUT",
      mode: "cors",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const isAudioStripped = payload.audioStripped;
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced to cloud ${isAudioStripped ? "(audio skipped)" : ""} at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pushed to Cloud!" + (isAudioStripped ? "\n\n⚠️ Info: Your custom audio recordings were skipped during sync to stay within the free database storage limits." : ""));
    } else {
      throw new Error(`Server returned code ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Upload failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("Cloud Sync failed: " + err.message);
  }
}

async function pullFromCloud() {
  if (state.syncProvider === "github") {
    await pullFromGitHubGist();
    return;
  }
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!state.cloudSyncId) return;
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Fetching from cloud...";
    statusMsg.style.color = "var(--text-secondary)";
  }

  try {
    const res = await fetch(getSyncApiUrl(`/${state.cloudSyncId}`), {
      method: "GET",
      mode: "cors"
    });
    if (!res.ok) throw new Error(`Server returned code ${res.status}`);
    const data = await res.json();
    
    if (data && typeof data === "object") {
      // Overwrite/merge properties
      if (data.xp !== undefined) state.xp = data.xp;
      if (data.streak !== undefined) state.streak = data.streak;
      if (data.hearts !== undefined) state.hearts = data.hearts;
      if (data.level !== undefined) state.level = data.level;
      if (data.deletedCustomVocab !== undefined) state.deletedCustomVocab = data.deletedCustomVocab;
      if (data.customVocab !== undefined) {
        mergeCustomVocab(data.customVocab, data.deletedCustomVocab);
      }
      if (data.mistakes !== undefined) state.mistakes = data.mistakes;
      if (data.openaiKey !== undefined) state.openaiKey = data.openaiKey;
      if (data.grokKey !== undefined) state.grokKey = data.grokKey;
      if (data.geminiKey !== undefined) state.geminiKey = data.geminiKey;
      if (data.anthropicKey !== undefined) state.anthropicKey = data.anthropicKey;
      if (data.audioEngine !== undefined) state.audioEngine = data.audioEngine;
      if (data.allowSynonyms !== undefined) state.allowSynonyms = data.allowSynonyms;
      if (data.questionTimer !== undefined) state.questionTimer = data.questionTimer;
      if (data.baseLang !== undefined) state.baseLang = data.baseLang;
      if (data.selectedLang !== undefined) state.selectedLang = data.selectedLang;
      if (data.history !== undefined) state.history = data.history;
      if (data.deletedStarters !== undefined) state.deletedStarters = data.deletedStarters;
      if (data.editedStarters !== undefined) state.editedStarters = data.editedStarters;
      if (data.customFolders !== undefined) state.customFolders = data.customFolders;
      if (data.wordStats !== undefined) state.wordStats = data.wordStats;
      if (data.testDirection !== undefined) state.testDirection = data.testDirection;
      if (data.customVoices !== undefined) state.customVoices = data.customVoices;
      if (data.activeICloudLists !== undefined) state.activeICloudLists = data.activeICloudLists;
      if (data.dictionaryCache !== undefined) state.dictionaryCache = data.dictionaryCache;
      
      saveState();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced from cloud at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pulled from Cloud!");
    } else {
      throw new Error("Invalid sync file format");
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Download failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("Cloud download failed: " + err.message);
  }
}

async function generateCloudSyncCode() {
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  const btn = document.getElementById("btn-cloud-generate-code");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Generating Code...";
  }

  const payload = getSanitizedSyncPayload();
 
  try {
    console.log("Attempting to connect to Render sync service...");
    const res = await fetch(getSyncApiUrl(), {
      method: "POST",
      mode: "cors",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data || !data.id) {
        throw new Error("Server succeeded but did not return a bin ID.");
      }
      state.cloudSyncId = data.id;
      saveState();
      updateCloudSyncUI();
      const isAudioStripped = payload.audioStripped;
      showCustomAlert("🎉 Sync Code generated! Save this code to link other devices." + (isAudioStripped ? "\n\n⚠️ Info: Your custom audio recordings were skipped during sync to stay within storage limits." : ""));
    } else {
      throw new Error(`Server returned code ${res.status}`);
    }
  } catch (err) {
    console.error("Cloud Sync connection failed:", err);
    alert("Could not generate Sync Code: " + err.message + "\n\n💡 Tip: Your browser or network AdBlocker/Firewall might be blocking the sync service. Try disabling Brave Shields / AdBlocker.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🆕 Generate New Sync Code";
    }
  }
}

async function linkCloudSyncDevice(code) {
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!code) {
    alert("Please enter a Sync Code.");
    return;
  }
  const btn = document.getElementById("btn-cloud-link-code");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Linking...";
  }

  try {
    const res = await fetch(getSyncApiUrl(`/${code}`), {
      method: "GET",
      mode: "cors"
    });
    if (!res.ok) throw new Error("Sync Code not found or expired.");
    const data = await res.json();
    if (data && typeof data === "object") {
      state.cloudSyncId = code;
      
      // Load data
      if (data.xp !== undefined) state.xp = data.xp;
      if (data.streak !== undefined) state.streak = data.streak;
      if (data.hearts !== undefined) state.hearts = data.hearts;
      if (data.level !== undefined) state.level = data.level;
      if (data.deletedCustomVocab !== undefined) state.deletedCustomVocab = data.deletedCustomVocab;
      if (data.customVocab !== undefined) {
        mergeCustomVocab(data.customVocab, data.deletedCustomVocab);
      }
      if (data.mistakes !== undefined) state.mistakes = data.mistakes;
      if (data.openaiKey !== undefined) state.openaiKey = data.openaiKey;
      if (data.grokKey !== undefined) state.grokKey = data.grokKey;
      if (data.geminiKey !== undefined) state.geminiKey = data.geminiKey;
      if (data.anthropicKey !== undefined) state.anthropicKey = data.anthropicKey;
      if (data.audioEngine !== undefined) state.audioEngine = data.audioEngine;
      if (data.allowSynonyms !== undefined) state.allowSynonyms = data.allowSynonyms;
      if (data.questionTimer !== undefined) state.questionTimer = data.questionTimer;
      if (data.baseLang !== undefined) state.baseLang = data.baseLang;
      if (data.selectedLang !== undefined) state.selectedLang = data.selectedLang;
      if (data.history !== undefined) state.history = data.history;
      if (data.deletedStarters !== undefined) state.deletedStarters = data.deletedStarters;
      if (data.editedStarters !== undefined) state.editedStarters = data.editedStarters;
      if (data.customFolders !== undefined) state.customFolders = data.customFolders;
      if (data.wordStats !== undefined) state.wordStats = data.wordStats;
      if (data.testDirection !== undefined) state.testDirection = data.testDirection;
      if (data.customVoices !== undefined) state.customVoices = data.customVoices;
      if (data.activeICloudLists !== undefined) state.activeICloudLists = data.activeICloudLists;
      if (data.dictionaryCache !== undefined) state.dictionaryCache = data.dictionaryCache;
      
      saveState();
      updateCloudSyncUI();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();

      alert("🎉 Device linked successfully! Wordlists and progress synced.");
    }
  } catch (err) {
    alert("Failed to link device: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔗 Link Device";
    }
  }
}

function unlinkCloudSyncDevice() {
  if (confirm("Are you sure you want to disable Cloud Sync? Your current local data will NOT be deleted, but this device will stop syncing with the cloud.")) {
    state.cloudSyncId = "";
    state.githubToken = "";
    state.githubGistId = "";
    state.syncProvider = "easy";
    saveState();
    updateCloudSyncUI();
    showCustomAlert("Cloud Sync disabled.");
  }
}

// ==========================================
// 13. GitHub Gist Cloud Sync Implementation
// ==========================================
async function connectGitHubGist() {
  const token = document.getElementById("input-github-token").value.trim();
  const gistId = document.getElementById("input-github-gist-id").value.trim();
  
  if (!token) {
    alert("Please enter a GitHub Personal Access Token.");
    return;
  }

  const btn = document.getElementById("btn-github-connect");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Connecting...";
  }

  const payload = getSanitizedSyncPayload();

  try {
    if (gistId) {
      // LINKING existing Gist
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "GET",
        headers: {
          "Authorization": `token ${token}`
        }
      });
      if (!res.ok) throw new Error("Could not find Gist. Check Gist ID or Token validity.");
      const data = await res.json();
      
      // Pull data
      const contentStr = data.files["voctrainer_sync.json"].content;
      const parsedData = JSON.parse(contentStr);
      
      state.syncProvider = "github";
      state.githubToken = token;
      state.githubGistId = gistId;
      state.cloudSyncId = gistId;
      
      // Load properties
      if (parsedData.xp !== undefined) state.xp = parsedData.xp;
      if (parsedData.streak !== undefined) state.streak = parsedData.streak;
      if (parsedData.hearts !== undefined) state.hearts = parsedData.hearts;
      if (parsedData.level !== undefined) state.level = parsedData.level;
      if (parsedData.deletedCustomVocab !== undefined) state.deletedCustomVocab = parsedData.deletedCustomVocab;
      if (parsedData.customVocab !== undefined) {
        mergeCustomVocab(parsedData.customVocab, parsedData.deletedCustomVocab);
      }
      if (parsedData.mistakes !== undefined) state.mistakes = parsedData.mistakes;
      if (parsedData.openaiKey !== undefined) state.openaiKey = parsedData.openaiKey;
      if (parsedData.grokKey !== undefined) state.grokKey = parsedData.grokKey;
      if (parsedData.geminiKey !== undefined) state.geminiKey = parsedData.geminiKey;
      if (parsedData.anthropicKey !== undefined) state.anthropicKey = parsedData.anthropicKey;
      if (parsedData.audioEngine !== undefined) state.audioEngine = parsedData.audioEngine;
      if (parsedData.allowSynonyms !== undefined) state.allowSynonyms = parsedData.allowSynonyms;
      if (parsedData.questionTimer !== undefined) state.questionTimer = parsedData.questionTimer;
      if (parsedData.baseLang !== undefined) state.baseLang = parsedData.baseLang;
      if (parsedData.selectedLang !== undefined) state.selectedLang = parsedData.selectedLang;
      if (parsedData.history !== undefined) state.history = parsedData.history;
      if (parsedData.deletedStarters !== undefined) state.deletedStarters = parsedData.deletedStarters;
      if (parsedData.editedStarters !== undefined) state.editedStarters = parsedData.editedStarters;
      if (parsedData.customFolders !== undefined) state.customFolders = parsedData.customFolders;
      if (parsedData.wordStats !== undefined) state.wordStats = parsedData.wordStats;
      if (parsedData.testDirection !== undefined) state.testDirection = parsedData.testDirection;
      if (parsedData.customVoices !== undefined) state.customVoices = parsedData.customVoices;
      if (parsedData.activeICloudLists !== undefined) state.activeICloudLists = parsedData.activeICloudLists;
      
      saveState();
      updateCloudSyncUI();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      
      alert("🎉 Linked to GitHub Gist! Wordlists and progress pulled successfully.");
    } else {
      // CREATING new Gist
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          "Authorization": `token ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          description: "VocTrainer Sync Data",
          public: false,
          files: {
            "voctrainer_sync.json": {
              content: JSON.stringify(payload)
            }
          }
        })
      });
      if (!res.ok) throw new Error("Could not create Gist. Verify Token scopes.");
      const data = await res.json();
      
      state.syncProvider = "github";
      state.githubToken = token;
      state.githubGistId = data.id;
      state.cloudSyncId = data.id;
      
      saveState();
      updateCloudSyncUI();
      alert("🎉 GitHub Gist Sync connected! Copy your Gist ID to sync other devices.");
    }
  } catch (err) {
    alert("Connection to GitHub Gist failed: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🆕 Connect & Sync Gist";
    }
  }
}

async function pushToGitHubGist() {
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Syncing with GitHub Gist...";
    statusMsg.style.color = "var(--text-secondary)";
  }
  
  const payload = getSanitizedSyncPayload();

  try {
    const res = await fetch(`https://api.github.com/gists/${state.githubGistId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${state.githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "voctrainer_sync.json": {
            content: JSON.stringify(payload)
          }
        }
      })
    });
    if (res.ok) {
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced to Gist at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pushed to GitHub Gist!");
    } else {
      throw new Error(`GitHub returned code ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Gist upload failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("GitHub Gist push failed: " + err.message);
  }
}

async function pullFromGitHubGist() {
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Fetching from GitHub Gist...";
    statusMsg.style.color = "var(--text-secondary)";
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${state.githubGistId}`, {
      headers: {
        "Authorization": `token ${state.githubToken}`
      }
    });
    if (!res.ok) throw new Error(`GitHub returned code ${res.status}`);
    const data = await res.json();
    const contentStr = data.files["voctrainer_sync.json"].content;
    const parsedData = JSON.parse(contentStr);
    
    if (parsedData && typeof parsedData === "object") {
      // Overwrite/merge properties
      if (parsedData.xp !== undefined) state.xp = parsedData.xp;
      if (parsedData.streak !== undefined) state.streak = parsedData.streak;
      if (parsedData.hearts !== undefined) state.hearts = parsedData.hearts;
      if (parsedData.level !== undefined) state.level = parsedData.level;
      if (parsedData.deletedCustomVocab !== undefined) state.deletedCustomVocab = parsedData.deletedCustomVocab;
      if (parsedData.customVocab !== undefined) {
        mergeCustomVocab(parsedData.customVocab, parsedData.deletedCustomVocab);
      }
      if (parsedData.mistakes !== undefined) state.mistakes = parsedData.mistakes;
      if (parsedData.openaiKey !== undefined) state.openaiKey = parsedData.openaiKey;
      if (parsedData.grokKey !== undefined) state.grokKey = parsedData.grokKey;
      if (parsedData.geminiKey !== undefined) state.geminiKey = parsedData.geminiKey;
      if (parsedData.anthropicKey !== undefined) state.anthropicKey = parsedData.anthropicKey;
      if (parsedData.audioEngine !== undefined) state.audioEngine = parsedData.audioEngine;
      if (parsedData.allowSynonyms !== undefined) state.allowSynonyms = parsedData.allowSynonyms;
      if (parsedData.questionTimer !== undefined) state.questionTimer = parsedData.questionTimer;
      if (parsedData.baseLang !== undefined) state.baseLang = parsedData.baseLang;
      if (parsedData.selectedLang !== undefined) state.selectedLang = parsedData.selectedLang;
      if (parsedData.history !== undefined) state.history = parsedData.history;
      if (parsedData.deletedStarters !== undefined) state.deletedStarters = parsedData.deletedStarters;
      if (parsedData.editedStarters !== undefined) state.editedStarters = parsedData.editedStarters;
      if (parsedData.customFolders !== undefined) state.customFolders = parsedData.customFolders;
      if (parsedData.wordStats !== undefined) state.wordStats = parsedData.wordStats;
      if (parsedData.testDirection !== undefined) state.testDirection = parsedData.testDirection;
      if (parsedData.customVoices !== undefined) state.customVoices = parsedData.customVoices;
      if (parsedData.activeICloudLists !== undefined) state.activeICloudLists = parsedData.activeICloudLists;
      
      saveState();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced from Gist at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pulled from GitHub Gist!");
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Gist download failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("GitHub Gist pull failed: " + err.message);
  }
}

// Obsolete sync placeholders from previous version to prevent ReferenceErrors
// Obsolete sync placeholders from previous version to prevent ReferenceErrors
function loadCloudWordSets() {
  console.log("loadCloudWordSets placeholder called.");
}
function uploadActiveVocabToCloud() {
  console.log("uploadActiveVocabToCloud placeholder called.");
}

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


