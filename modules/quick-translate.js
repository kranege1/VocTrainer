// VocTrainer - Quick Translate Module
import { state, saveState, updateCategoryCounts } from './state.js';
import { getConjugationsForVerb, PRONOUNS } from './conjugation.js';

const getLangColor = (...args) => window.getLangColor?.(...args);
const stripArticles = (...args) => window.stripArticles?.(...args);
const translateTextGTX = (...args) => window.translateTextGTX?.(...args);

// ==========================================
// 19. Quick Translate Engine & Controllers
// ==========================================
export let quickTranslateRecognition;
export let isQuickTranslateListening = false;

let audioContext = null;
let audioStream = null;
let levelAnalyserAnimationId = null;

async function startMicLevelAnalyser() {
  try {
    const container = document.getElementById("quick-translate-mic-level-container");
    const fill = document.getElementById("quick-translate-mic-level-fill");
    const label = document.getElementById("quick-translate-mic-level-value");
    if (!container || !fill || !label) return;

    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    container.style.display = "block";

    function updateLevel() {
      if (!isQuickTranslateListening) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      const percent = Math.min(100, Math.round((average / 120) * 100));
      
      fill.style.width = percent + "%";
      label.textContent = percent + "%";

      levelAnalyserAnimationId = requestAnimationFrame(updateLevel);
    }

    updateLevel();
  } catch (err) {
    console.warn("Failed to initialize mic level analyser:", err);
  }
}

function stopMicLevelAnalyser() {
  if (levelAnalyserAnimationId) {
    cancelAnimationFrame(levelAnalyserAnimationId);
    levelAnalyserAnimationId = null;
  }
  if (audioContext) {
    try {
      audioContext.close();
    } catch (e) {}
    audioContext = null;
  }
  if (audioStream) {
    try {
      audioStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    audioStream = null;
  }
  
  const container = document.getElementById("quick-translate-mic-level-container");
  const fill = document.getElementById("quick-translate-mic-level-fill");
  const label = document.getElementById("quick-translate-mic-level-value");
  if (container) container.style.display = "none";
  if (fill) fill.style.width = "0%";
  if (label) label.textContent = "0%";
}

export function initQuickTranslateSpeech() {
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
    startMicLevelAnalyser();
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
    if (status) {
      if (e.error === 'network') {
        status.textContent = "Network Error: Check connection.";
        alert("🎙️ Speech Recognition Network Error.\n\nOn Edge/Chrome, the browser sends voice data to speech servers (Google/Microsoft). Please check your internet connection or try using Google Chrome if Microsoft Edge's speech service is temporarily unavailable.");
      } else {
        status.textContent = "Error: Try speaking again.";
      }
    }
    stopQuickTranslateSpeech();
  };

  quickTranslateRecognition.onend = () => {
    stopQuickTranslateSpeech();
  };
}

export function startQuickTranslateSpeech() {
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

export function stopQuickTranslateSpeech() {
  isQuickTranslateListening = false;
  stopMicLevelAnalyser();
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

export function toggleQuickTranslateSpeech() {
  if (isQuickTranslateListening) {
    stopQuickTranslateSpeech();
  } else {
    startQuickTranslateSpeech();
  }
}

export async function runQuickTranslate(text) {
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
    if (isSingleWord) {
      
      // Look up in dictionary API for English synonyms
      if (englishBaseWord) {
        try {
          const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(englishBaseWord)}`);
          if (dictRes.ok) {
            const dictData = await dictRes.json();
            const entry = dictData[0];
            if (entry && entry.meanings) {
              entry.meanings.forEach(m => {
                if (m.synonyms) englishSynonyms.push(...m.synonyms);
              });
            }
          }
        } catch (e) {
          console.warn("Dictionary look up failed for synonyms:", e);
        }
      }
      englishSynonyms = [...new Set(englishSynonyms)].slice(0, 5);
    }
    
    // Translate to all other languages in parallel
    const folderId = document.getElementById("quick-translate-save-folder")?.value || "";
    
    // Determine if the input is a verb:
    //  - Folder name explicitly contains "verb"
    //  - OR isVerbCheck confirms it (using the noun-exception-aware version)
    // IMPORTANT: We do NOT rely on the English dictionary part-of-speech any more
    //   because many nouns (garden, water, book) are also valid verbs in dictionaries.
    const isFolderVerb = folderId.toLowerCase().includes("verb");
    const isInputVerb = isVerbCheck(text, sourceLang) || isFolderVerb;
    let translationSource = text;
    let translationSourceLang = sourceLang;
    
    // Only pivot translation through English and prepend "to " when:
    //  - Input is genuinely a verb
    //  - AND we have a valid non-trivial English base word
    const isValidEnglishVerb = englishBaseWord &&
      englishBaseWord.toLowerCase().trim() !== text.toLowerCase().trim();
    
    if (isInputVerb && isValidEnglishVerb) {
      if (!englishBaseWord.toLowerCase().startsWith("to ")) {
        englishBaseWord = "to " + englishBaseWord;
      }
      translationSource = englishBaseWord;
      translationSourceLang = "en";
    }
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
                  ${uniqueSyns.map(s => `<span style="display: inline-block; background: rgba(255,255,255,0.04); color: var(--text-secondary); font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color); font-weight: 500; cursor: pointer;" onclick="speakWord('${s.replace(/'/g, "\\'")}', '${target.code}')" title="Click to hear pronunciation">${s}</span>`).join("")}
                </div>
              </div>
            `;
          }
        }

        // 3. Conjugations — only for confirmed verbs
        let conjugationsHtml = "";
        try {
          // A card is a verb only if:
          //  - English: translation literally starts with "to "
          //  - Other languages: isVerbCheck says true (uses the noun-exception list)
          const isTargetVerb = target.code === "en"
            ? translation.trim().toLowerCase().startsWith("to ")
            : isVerbCheck(translation, target.code);
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
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; width: 100%;">
                <div style="display: flex; align-items: center;">
                  <img src="${flagUrl}" width="16" height="12" style="${flagStyle}">
                  <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">${target.name}</strong>
                </div>
                <button onclick="event.stopPropagation(); window.copyTextToClipboard('${translation.replace(/'/g, "\\'")}', this)" style="border: none; background: transparent; cursor: pointer; color: var(--text-secondary); font-size: 0.95rem; padding: 4px; display: inline-flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.2s; margin-top: -4px;" title="Copy translation">📋</button>
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
    updateDuplicateStatus();
  } catch (err) {
    console.error("runQuickTranslate crash:", err);
    alert("Error: " + err.message + "\nStack: " + err.stack);
  }
}

export function populateQuickTranslateFolders() {
  const selectEl = document.getElementById("quick-translate-save-folder");
  if (!selectEl) return;
  
  // Prioritize currently active Browse folder, then last quick translate selection
  const currentSelection = selectEl.value || state.selectedBrowseFolderId || state.quickTranslateLastFolder;
  
  selectEl.innerHTML = "";
  
  // Custom folders only
  if (state.customFolders && state.customFolders.length > 0) {
    state.customFolders.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = folder.name;
      selectEl.appendChild(opt);
    });
  } else {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(No custom lists found)";
    selectEl.appendChild(opt);
  }
  
  // Restore selection if it exists in the newly built list
  if (currentSelection && Array.from(selectEl.options).some(o => o.value === currentSelection)) {
    selectEl.value = currentSelection;
  }

  // Set onchange handler to save choice and update duplicate status
  selectEl.onchange = () => {
    state.quickTranslateLastFolder = selectEl.value;
    saveState();
    updateDuplicateStatus();
  };
}

export function updateDuplicateStatus() {
  const statusEl = document.getElementById("quick-translate-duplicate-status");
  const saveBtn = document.getElementById("btn-quick-translate-save");
  if (!statusEl) return;
  
  const spokenText = document.getElementById("quick-translate-input-display")?.textContent?.trim() || "";
  const folderEl = document.getElementById("quick-translate-save-folder");
  const folderId = folderEl ? folderEl.value : "";
  
  if (!spokenText || spokenText === "..." || !folderId) {
    statusEl.style.display = "none";
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = "1";
    }
    return;
  }
  
  const isDuplicate = state.customVocab.some(word => {
    if (word.category !== folderId) return false;
    const langs = ["en", "de", "it", "es", "fr"];
    return langs.some(l => (word[l] || "").toLowerCase().trim() === spokenText.toLowerCase());
  });
  
  statusEl.style.display = "inline-flex";
  
  if (isDuplicate) {
    statusEl.innerHTML = `⚠️ Already in list`;
    statusEl.style.color = "#f1c40f";
    statusEl.style.background = "rgba(241, 196, 15, 0.1)";
    statusEl.style.border = "1px solid rgba(241, 196, 15, 0.2)";
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.5";
      saveBtn.title = "Word already in this list";
    }
  } else {
    statusEl.innerHTML = `✨ New Word`;
    statusEl.style.color = "#2ecc71";
    statusEl.style.background = "rgba(46, 204, 113, 0.1)";
    statusEl.style.border = "1px solid rgba(46, 204, 113, 0.2)";
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = "1";
      saveBtn.removeAttribute("title");
    }
  }
}

export async function saveQuickTranslateWord() {
  const spokenText = document.getElementById("quick-translate-input-display").textContent.trim();
  const folderSelect = document.getElementById("quick-translate-save-folder");
  const folderId = folderSelect ? folderSelect.value : "";
  
  if (!spokenText || spokenText === "...") {
    showCustomAlert("Please speak a word or phrase first!");
    return;
  }

  if (!folderId) {
    showCustomAlert("Please select or create a custom list first under the Browse tab!");
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
    
    let success = false;
    state.customVocab.push(newWord);
    state.quickTranslateLastFolder = folderId;
    saveState();
    
    // Sync to iCloud folder if selected
    if (state.icloudHandle) {
      await saveWordlistToICloud(folderId);
    }
    
    success = true;
    
    if (saveBtn) {
      saveBtn.style.background = "#2ecc71";
      saveBtn.style.borderColor = "#2ecc71";
      saveBtn.style.color = "#fff";
      saveBtn.innerHTML = `✅ Saved!`;
      saveBtn.style.transform = "scale(1.05)";
      saveBtn.style.transition = "all 0.2s ease";
    }
    
    const saveBox = document.getElementById("quick-translate-save-box");
    setTimeout(() => {
      if (saveBox) saveBox.style.display = "none";
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
        saveBtn.style.background = "";
        saveBtn.style.borderColor = "";
        saveBtn.style.color = "";
        saveBtn.style.transform = "";
        saveBtn.style.transition = "";
      }
    }, 1200);
  } catch (err) {
    console.error("Failed to save word:", err);
    showCustomAlert("Failed to save word to list.");
  } finally {
    if (!success && saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}


// Common German nouns that end in -en/-eln/-rn (must NOT be classified as verbs).
// Used by both normalizeWordCasing() and isVerbCheck().
const DE_NOUN_EXCEPTIONS = new Set([
  "blumen", "kuchen", "morgen", "garten", "boden", "regen", "schatten", "wagen",
  "zeichen", "zeiten", "welten", "grenzen", "knochen", "breiten",
  "klassen", "fragen", "arten", "stufen", "fäden", "laden",
  "stunden", "wochen", "jahren", "tagen", "monaten", "namen", "nummern",
  "farben", "häuser", "familien", "wörtern", "büchern", "kindern",
  "brüdern", "schwestern", "eltern", "freunden", "städten", "ländern",
  "fenster", "felder", "händen", "füßen", "ohren", "augen", "haaren",
  "dingen", "stellen", "stellen", "gruppen", "ebenen", "hallen", "hallen",
  "rosen", "tannen", "birken", "eichen", "linden", "hecken", "dörfern"
]);

export function normalizeWordCasing(text, lang, category = "") {
  if (!text) return "";
  let clean = text.trim();
  
  const isGerman = (lang === "de");
  
  const lowercaseDeWords = ["und", "oder", "aber", "in", "auf", "unter", "über", "vor", "hinter", "neben", "an", "bei", "mit", "nach", "von", "zu", "aus", "für", "gegen", "ohne", "um", "durch", "ich", "du", "er", "sie", "es", "wir", "ihr", "mein", "dein", "sein", "unser", "euer", "der", "die", "das", "ein", "eine", "einer", "eines", "einem", "einen", "nicht", "sehr", "gut", "schnell", "schön", "neu", "alt", "groß", "klein"];
  
  if (isGerman) {
    const lowerClean = clean.toLowerCase();
    // Use the shared DE_NOUN_EXCEPTIONS list for consistency
    const isVerb = (lowerClean.endsWith("en") || lowerClean.endsWith("eln") || lowerClean.endsWith("rn"))
      && !lowerClean.includes(" ")
      && !DE_NOUN_EXCEPTIONS.has(lowerClean);

    if (!isVerb && !lowercaseDeWords.includes(lowerClean)) {
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    } else {
      return clean.charAt(0).toLowerCase() + clean.slice(1);
    }
  } else {
    if (clean.length > 0) {
      return clean.charAt(0).toLowerCase() + clean.slice(1);
    }
  }
  return clean;
}

// (DE_NOUN_EXCEPTIONS moved above normalizeWordCasing)

export function isVerbCheck(text, lang) {
  if (!text) return false;
  const clean = text.toLowerCase().trim();
  const words = clean.split(/\s+/).filter(Boolean);
  
  if (lang === "en") {
    // Only "to <word>" (exactly 2 words starting with "to") counts as a verb
    return words.length === 2 && words[0] === "to";
  }
  
  if (words.length !== 1) {
    return false;
  }
  
  if (lang === "de") {
    // Explicit "zu ..." prefix marks infinitive
    if (clean.startsWith("zu ")) return true;
    // Ends in -en BUT is not a known noun exception
    if ((clean.endsWith("en") || clean.endsWith("eln") || clean.endsWith("rn")) && !DE_NOUN_EXCEPTIONS.has(clean)) {
      return true;
    }
    return false;
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

export function isVerbAnyLanguage(text) {
  if (!text) return false;
  const langs = ["de", "en", "it", "es", "fr"];
  for (const lang of langs) {
    if (isVerbCheck(text, lang)) return true;
  }
  return false;
}

export async function detectLanguageAndTranslateToEn(text) {
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

export async function fetchSynonymsForTarget(word, targetLang, sourceLang = "de") {
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

window.copyTextToClipboard = function(text, buttonEl) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const origText = buttonEl.textContent;
    buttonEl.textContent = "✅";
    buttonEl.style.color = "#2ecc71";
    buttonEl.style.transform = "scale(1.2)";
    setTimeout(() => {
      buttonEl.textContent = origText;
      buttonEl.style.color = "";
      buttonEl.style.transform = "scale(1)";
    }, 1200);
  }).catch(err => {
    console.error("Failed to copy card text:", err);
  });
};
