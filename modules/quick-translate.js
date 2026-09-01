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

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

    // On iOS/iPadOS WebKit, requesting getUserMedia while SpeechRecognition starts can trigger WebKit view reset.
    // Wrap safely so it never throws an uncaught exception or interrupts active view.
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
      console.warn("Mic level stream skipped on this device:", err);
      return null;
    });

    if (!audioStream) return;

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

let accumulatedSpeechText = "";
let speechStartTime = 0;
let speechTelemetryInterval = null;

function updateSpeechTelemetryBar(liveText = "") {
  if (!isQuickTranslateListening) return;
  const elapsedSec = Math.floor((Date.now() - speechStartTime) / 1000);
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');

  const cleanWords = liveText.trim();
  let wordInfo = "0 words";
  let snippet = "";
  if (cleanWords) {
    const words = cleanWords.split(/\s+/).filter(Boolean);
    wordInfo = `${words.length} ${words.length === 1 ? 'word' : 'words'}`;
    snippet = cleanWords.length > 22 ? `"${cleanWords.substring(0, 19)}..."` : `"${cleanWords}"`;
  }

  const infoStr = snippet ? `Duration ${mins}:${secs} (${wordInfo}) | ${snippet}` : `Duration ${mins}:${secs} (${wordInfo})`;

  if (window.triggerAPITelemetry) {
    window.triggerAPITelemetry({
      color: "green",
      icon: "🎙️",
      title: "Speech Recording",
      infoText: infoStr,
      durationMs: 4000
    });
  }
}

function startSpeechTelemetry() {
  speechStartTime = Date.now();
  document.body.classList.add("api-active-green");
  updateSpeechTelemetryBar("");

  if (speechTelemetryInterval) clearInterval(speechTelemetryInterval);
  speechTelemetryInterval = setInterval(() => {
    if (isQuickTranslateListening) {
      const inputEl = document.getElementById("quick-translate-text-input");
      updateSpeechTelemetryBar(inputEl ? inputEl.value : "");
    }
  }, 1000);
}

function stopSpeechTelemetry() {
  if (speechTelemetryInterval) {
    clearInterval(speechTelemetryInterval);
    speechTelemetryInterval = null;
  }
  document.body.classList.remove("api-active-green");
  const bar = document.getElementById("api-usage-info-bar");
  if (bar) {
    bar.classList.add("api-info-bar-hidden");
  }
}

export function initQuickTranslateSpeech() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    return;
  }
  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  quickTranslateRecognition = new SpeechGen();
  quickTranslateRecognition.continuous = true;
  quickTranslateRecognition.interimResults = true;

  quickTranslateRecognition.onstart = () => {
    isQuickTranslateListening = true;
    const inputEl = document.getElementById("quick-translate-text-input");
    const displayEl = document.getElementById("quick-translate-input-display");
    const resultsGrid = document.getElementById("quick-translate-results");
    const saveBox = document.getElementById("quick-translate-save-box");

    // Clear textbox & previous results to start fresh for new voice recording
    accumulatedSpeechText = "";
    if (inputEl) inputEl.value = "";
    if (displayEl) displayEl.textContent = "...";
    if (resultsGrid) resultsGrid.innerHTML = "";
    if (saveBox) saveBox.style.display = "none";

    const micBtn = document.getElementById("btn-quick-translate-mic");
    const status = document.getElementById("quick-translate-status");
    const pulse = document.getElementById("quick-translate-pulse");
    if (micBtn) micBtn.classList.add("listening");
    if (status) status.textContent = "Listening continuously... Speak now!";
    if (pulse) pulse.classList.add("listening");
    startMicLevelAnalyser();
    startSpeechTelemetry();
  };

  quickTranslateRecognition.onresult = async (event) => {
    let interimText = "";
    let finalChunk = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) {
        finalChunk += " " + res[0].transcript.trim();
      } else {
        interimText += res[0].transcript;
      }
    }

    if (finalChunk.trim()) {
      accumulatedSpeechText = (accumulatedSpeechText + " " + finalChunk.trim()).trim();
    }

    const currentLiveText = (accumulatedSpeechText + " " + interimText).trim();

    const inputEl = document.getElementById("quick-translate-text-input");
    const displayEl = document.getElementById("quick-translate-input-display");

    if (inputEl) {
      inputEl.value = currentLiveText;
    }
    if (displayEl) {
      displayEl.textContent = currentLiveText || "...";
    }

    updateSpeechTelemetryBar(currentLiveText);
  };

  quickTranslateRecognition.onerror = (e) => {
    console.error("Quick translate speech error:", e);
    const status = document.getElementById("quick-translate-status");
    if (status) {
      if (e.error === 'network') {
        status.textContent = "Network Error: Check connection.";
        alert("🎙️ Speech Recognition Network Error.\n\nOn Edge/Chrome, the browser sends voice data to speech servers (Google/Microsoft). Please check your internet connection or try using Google Chrome if Microsoft Edge's speech service is temporarily unavailable.");
        stopQuickTranslateSpeech();
      } else if (e.error !== 'no-speech') {
        status.textContent = "Error: Try speaking again.";
      }
    }
  };

  quickTranslateRecognition.onend = () => {
    // Keep continuous recording active until user explicitly clicks mic button to stop
    if (isQuickTranslateListening) {
      try {
        const speakLang = document.getElementById("quick-translate-lang")?.value || "en";
        quickTranslateRecognition.lang = speakLang;
        quickTranslateRecognition.start();
      } catch (e) {
        // Ignored if recognition is already running
      }
    } else {
      stopQuickTranslateSpeech();
    }
  };
}

export function startQuickTranslateSpeech() {
  if (!quickTranslateRecognition) {
    initQuickTranslateSpeech();
  }
  if (!quickTranslateRecognition) return;
  
  isQuickTranslateListening = true;
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
  stopSpeechTelemetry();
  const micBtn = document.getElementById("btn-quick-translate-mic");
  const status = document.getElementById("quick-translate-status");
  const pulse = document.getElementById("quick-translate-pulse");
  if (micBtn) micBtn.classList.remove("listening");
  if (status) {
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

export async function fetchFastGTXDetails(text, sourceLang, targetLang) {
  const cleanText = (text || "").replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ").trim();
  if (!cleanText) return { translation: "", article: "", synonyms: [] };

  const cacheKey = `qt_fast_v3_${sourceLang}_${targetLang}_${cleanText.toLowerCase()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.translation) {
        const isUntranslatedSame = (parsed.translation.toLowerCase().trim() === cleanText.toLowerCase());
        if (!isUntranslatedSame || sourceLang === targetLang) {
          return parsed;
        }
      }
    } catch(e) {}
  }

  let resObj = {
    translation: cleanText,
    article: "",
    synonyms: []
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const slParam = (sourceLang && sourceLang !== targetLang) ? sourceLang : "auto";
    // Combine core translation (dt=t), alternative translations (dt=at), and dictionary/gender (dt=bd) into 1 single request
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${slParam}&tl=${targetLang}&dt=t&dt=at&dt=bd&q=${encodeURIComponent(cleanText)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      let data = await res.json();

      // 1. Core Translation
      if (Array.isArray(data) && Array.isArray(data[0])) {
        resObj.translation = data[0].map(item => item[0]).join("");
      }

      // Smart Fallback: If translation returned identical input text unchanged, try auto-detection (sl=auto)
      if (resObj.translation.toLowerCase().trim() === cleanText.toLowerCase()) {
        try {
          const fbUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&dt=at&dt=bd&q=${encodeURIComponent(cleanText)}`;
          const fbRes = await fetch(fbUrl);
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            if (Array.isArray(fbData) && Array.isArray(fbData[0])) {
              const fbTrans = fbData[0].map(item => item[0]).join("");
              if (fbTrans) {
                resObj.translation = fbTrans;
                data = fbData;
              }
            }
          }
        } catch(e) {}
      }

      const cleanTrans = stripArticles(resObj.translation, targetLang).trim();
      const isShortPhrase = cleanText.split(/\s+/).filter(Boolean).length <= 2;

      // 2. Article resolution for nouns
      if (isShortPhrase && !isVerbCheck(cleanTrans, targetLang) && !isVerbCheck(cleanText, targetLang)) {
        const starterRaw = window.STARTER_VOCAB_RAW || [];
        const match = starterRaw.find(v => (v[targetLang] || "").toLowerCase() === cleanTrans.toLowerCase());
        if (match && match.details && match.details.articles && match.details.articles[targetLang]) {
          resObj.article = match.details.articles[targetLang];
        } else if (Array.isArray(data) && Array.isArray(data[1])) {
          for (const entry of data[1]) {
            if (Array.isArray(entry)) {
              const pos = (entry[0] || "").toLowerCase();
              if (pos === "noun" || pos === "substantiv" || pos === "sustantivo" || pos === "sostantivo" || pos === "nom") {
                const genderStr = (entry[3] || "").toLowerCase();
                resObj.article = getArticleFromGender(genderStr, cleanTrans, targetLang);
                if (resObj.article) break;
              }
            }
          }
          if (!resObj.article) {
            resObj.article = getArticleFromGender("", cleanTrans, targetLang);
          }
        }
      }

      // 3. Synonyms / Alternative Translations
      if (isShortPhrase) {
        let alts = [];
        if (Array.isArray(data) && Array.isArray(data[5])) {
          data[5].forEach(group => {
            if (Array.isArray(group) && Array.isArray(group[2])) {
              group[2].forEach(item => {
                if (Array.isArray(item) && typeof item[0] === "string") alts.push(item[0]);
              });
            }
          });
        }
        if (Array.isArray(data) && Array.isArray(data[1])) {
          data[1].forEach(entry => {
            if (Array.isArray(entry) && Array.isArray(entry[1])) {
              entry[1].forEach(word => {
                if (typeof word === "string") alts.push(word);
              });
            }
          });
        }
        const cleanMainLower = stripArticles(resObj.translation, targetLang).toLowerCase().trim();
        resObj.synonyms = [...new Set(alts)].filter(a => {
          const lower = (a || "").toLowerCase().trim();
          return lower && lower !== cleanMainLower && lower !== cleanText.toLowerCase();
        }).slice(0, 5);
      }
    }
  } catch (e) {
    console.warn("fetchFastGTXDetails error for", targetLang, e);
  }

  // Fallback if primary GTX call failed or returned unchanged text for a cross-language request
  if (!resObj.translation || (resObj.translation.toLowerCase().trim() === cleanText.toLowerCase() && sourceLang !== targetLang)) {
    try {
      const altTrans = await translateTextGTX(cleanText, sourceLang, targetLang);
      if (altTrans && altTrans.toLowerCase().trim() !== cleanText.toLowerCase() && !altTrans.includes("PLEASE SELECT")) {
        resObj.translation = altTrans;
      }
    } catch (e) {}
  }

  sessionStorage.setItem(cacheKey, JSON.stringify(resObj));
  return resObj;
}

export async function runQuickTranslate(text) {
  try {
    if (!text || !text.trim()) return;
    const targetGrid = document.getElementById("quick-translate-results");
    if (!targetGrid) return;
    
    const sourceLang = document.getElementById("quick-translate-lang")?.value || "en";
    const langNames = { de: "German", en: "English", it: "Italian", es: "Spanish", fr: "French" };
    const sourceLangName = langNames[sourceLang] || sourceLang.toUpperCase();

    targetGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary); font-size: 1.1rem; font-weight: 600;">
        <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 8px;">🔄</span> Translating from ${sourceLangName}...
      </div>
    `;

    const langs = [
      { code: "de", name: "German", flag: "de" },
      { code: "en", name: "English", flag: "gb" },
      { code: "it", name: "Italian", flag: "it" },
      { code: "es", name: "Spanish", flag: "es" },
      { code: "fr", name: "French", flag: "fr" }
    ];
    
    let targets = langs;
    const mode = state.quickTranslateMode || "base_learning";
    if (mode === "base_learning") {
      const base = state.baseLang || "de";
      const learning = state.selectedLang || "it";
      const activeCodes = [...new Set([base, learning])];
      targets = langs.filter(l => activeCodes.includes(l.code));
    }

    const folderId = document.getElementById("quick-translate-save-folder")?.value || "";

    // Parallel 1-shot fetch per target language with fast caching
    const resultsHtml = await Promise.all(targets.map(async (target) => {
      try {
        const details = await fetchFastGTXDetails(text, sourceLang, target.code);
        let rawTrans = details.translation || text;
        let translation = rawTrans;
        if (rawTrans.toLowerCase().trim() !== text.toLowerCase().trim() || target.code === "de") {
          translation = normalizeWordCasing(rawTrans, target.code, folderId);
        }
        let article = details.article;
        let synonyms = details.synonyms || [];

        let synonymsHtml = "";
        if (synonyms.length > 0) {
          const uniqueSyns = synonyms.filter(s => s.toLowerCase() !== translation.toLowerCase());
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

        // Conjugations — for verbs
        let conjugationsHtml = "";
        try {
          const isTargetVerb = target.code === "en"
            ? translation.trim().toLowerCase().startsWith("to ")
            : isVerbCheck(translation, target.code);
          if (isTargetVerb) {
            const fakeWordObj = { target: translation, en: text, category: "verbs" };
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
              <div style="font-size: 1.8rem; font-weight: 800; color: ${langColor}; word-wrap: break-word; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;" onclick="speakWord('${((article ? article + ' ' : '') + translation).replace(/'/g, "\\'")}', '${target.code}')" title="Click to hear pronunciation">
                <span>
                  ${article ? `<span style="font-size: 1.2rem; font-weight: 700; color: var(--text-secondary); opacity: 0.85; margin-right: 6px; text-transform: lowercase;">${article}</span>` : ""}
                  ${translation}
                </span>
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

    const status = document.getElementById("quick-translate-status");
    if (status) status.textContent = "Translation Complete!";

    populateQuickTranslateFolders();
    const saveBox = document.getElementById("quick-translate-save-box");
    if (saveBox) saveBox.style.display = "flex";
    updateDuplicateStatus();
  } catch (err) {
    console.error("runQuickTranslate crash:", err);
    const targetGrid = document.getElementById("quick-translate-results");
    if (targetGrid) {
      targetGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--error-color); font-weight: 600; background: rgba(239, 68, 68, 0.08); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
          ⚠️ Translation encountered an issue (${err.message || "Network timeout"}). Please tap Translate to try again.
        </div>
      `;
    }
    const status = document.getElementById("quick-translate-status");
    if (status) status.textContent = "Tap Translate to try again";
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
  
  const inputVal = document.getElementById("quick-translate-text-input")?.value?.trim();
  const displayVal = document.getElementById("quick-translate-input-display")?.textContent?.trim();
  const spokenText = inputVal || (displayVal !== "..." ? displayVal : "") || "";
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
  const inputVal = document.getElementById("quick-translate-text-input")?.value?.trim();
  const displayVal = document.getElementById("quick-translate-input-display")?.textContent?.trim();
  const spokenText = inputVal || (displayVal !== "..." ? displayVal : "") || "";
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

  const saveBtn = document.getElementById("btn-quick-translate-save");
  const originalHtml = saveBtn ? saveBtn.innerHTML : "";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `🔄 Saving...`;
  }
  
  let success = false;
  try {
    const sourceLang = document.getElementById("quick-translate-lang")?.value || "en";
    let enTranslation = await translateTextGTX(spokenText, sourceLang, "en");
    if (!enTranslation) enTranslation = spokenText;
    
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
  
  const lowercaseDeWords = ["und", "oder", "aber", "in", "auf", "unter", "über", "vor", "hinter", "neben", "an", "bei", "mit", "nach", "von", "zu", "aus", "für", "gegen", "ohne", "um", "durch", "ich", "du", "er", "sie", "es", "wir", "ihr", "mein", "dein", "sein", "unser", "euer", "der", "die", "das", "ein", "eine", "einer", "eines", "einem", "einen", "nicht", "sehr", "gut", "schnell", "schön", "neu", "alt", "groß", "klein", "morgen", "heute", "gestern", "jetzt", "sofort", "bald", "später", "immer", "nie", "oft", "selten", "manchmal", "gern", "hier", "dort", "überall", "nirgends", "etwas", "nichts", "alles", "viele", "alle", "man", "jemand", "niemand", "mehr", "weniger", "genug", "vielleicht", "wahrscheinlich", "besonders", "nur", "sogar", "auch", "noch", "schon", "erst", "fast", "da"];
  
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

function detectLanguageHeuristic(text) {
  if (!text) return "en";
  const clean = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  
  const stopwords = {
    de: ["ich", "du", "er", "sie", "es", "wir", "ihr", "ist", "sind", "bin", "war", "und", "oder", "nicht", "der", "die", "das", "ein", "eine", "einer", "eines", "einem", "einen", "zu", "mit", "auf", "von", "im", "in", "nach", "bei", "an", "aus", "für", "um", "nach", "vor", "hinter", "unter", "über", "gehe", "gehen", "fahren", "reisen", "will", "wollen", "müssen", "können", "heute", "morgen", "schule", "haus", "zeit", "märz"],
    it: ["io", "tu", "lui", "lei", "noi", "voi", "loro", "è", "sono", "sei", "era", "e", "o", "non", "il", "la", "i", "gli", "le", "un", "una", "a", "con", "su", "da", "di", "in", "per", "tra", "fra", "vado", "andare", "guidare", "viaggiare", "voglio", "volere", "devo", "posso", "oggi", "domani", "scuola", "casa", "tempo", "marzo"],
    es: ["yo", "tú", "él", "ella", "nosotros", "vosotros", "ellos", "es", "son", "soy", "era", "y", "o", "no", "el", "la", "los", "las", "un", "una", "a", "con", "en", "de", "por", "para", "sobre", "voy", "ir", "conducir", "viajar", "quiero", "querer", "debo", "puedo", "hoy", "mañana", "escuela", "casa", "tiempo", "marzo"],
    fr: ["je", "tu", "il", "elle", "nous", "vous", "ils", "est", "sont", "suis", "était", "et", "ou", "ne", "pas", "le", "la", "les", "un", "une", "à", "avec", "sur", "de", "en", "dans", "pour", "par", "vais", "aller", "conduire", "voyager", "veux", "vouloir", "dois", "peux", "aujourd", "aujourd'hui", "demain", "ecole", "école", "maison", "temps", "mars"],
    en: ["the", "a", "an", "and", "or", "not", "is", "are", "am", "was", "were", "to", "with", "on", "at", "by", "from", "in", "into", "for", "about", "of", "go", "going", "drive", "driving", "travel", "want", "must", "can", "today", "tomorrow", "school", "house", "time", "march"]
  };

  const counts = { de: 0, it: 0, es: 0, fr: 0, en: 0 };
  
  for (const word of words) {
    for (const lang in stopwords) {
      if (stopwords[lang].includes(word)) {
        counts[lang]++;
      }
    }
  }

  let maxLang = "en";
  let maxCount = 0;
  for (const lang in counts) {
    if (counts[lang] > maxCount) {
      maxCount = counts[lang];
      maxLang = lang;
    }
  }
  
  // Character level overrides
  if (maxCount === 0) {
    if (/[äöüß]/i.test(text)) return "de";
    if (/[éèàùçâêîôûëïüÿœæ]/i.test(text)) return "fr";
    if (/[áíóúñ¿¡]/i.test(text)) return "es";
    if (/[ìòù]/i.test(text)) return "it";
  }

  return maxLang;
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
    console.warn("Language detection failed, trying MyMemory fallback:", e);
  }

  // Fallback to MyMemory with Stopword Heuristic (CORS friendly)
  const detectedLang = detectLanguageHeuristic(text);
  const result = { detectedLang, translation: text };
  
  try {
    // Translate from explicitly detected language to English
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${detectedLang}|en`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const translation = data.responseData?.translatedText || text;
      result.translation = translation;
    }
  } catch (err) {
    console.error("MyMemory language detection fallback failed:", err);
  }

  return result;
}

function getArticleFromGender(gender, cleanWord, targetLang) {
  const w = cleanWord.toLowerCase().trim();
  const isVowelStart = /^[aeiouàèéìòùáéíóúâêîôûäöü]/i.test(w);
  const normalizedGender = (gender || "").toLowerCase().trim();

  if (targetLang === "de") {
    if (normalizedGender === "masculine" || normalizedGender === "m") return "der";
    if (normalizedGender === "feminine" || normalizedGender === "f") return "die";
    if (normalizedGender === "neuter" || normalizedGender === "n") return "das";
    
    // German linguistic noun-ending rules fallback
    if (w.endsWith("ung") || w.endsWith("heit") || w.endsWith("keit") || w.endsWith("schaft") || w.endsWith("tät") || w.endsWith("ik") || w.endsWith("ei") || w.endsWith("ion") || w.endsWith("e")) {
      return "die";
    }
    if (w.endsWith("chen") || w.endsWith("lein") || w.endsWith("ment") || w.endsWith("um") || w.endsWith("tum")) {
      return "das";
    }
    if (w.endsWith("er") || w.endsWith("ling") || w.endsWith("or") || w.endsWith("ismus")) {
      return "der";
    }
    return "der";
  } else if (targetLang === "it") {
    if (isVowelStart) return "l'";
    if (normalizedGender === "feminine" || normalizedGender === "f") return "la";
    if (normalizedGender === "masculine" || normalizedGender === "m") return "il";
    
    // Italian linguistic noun-ending rules fallback
    if (w.endsWith("a")) return "la";
    if (w.endsWith("o") || w.endsWith("e") || w.endsWith("i")) return "il";
    return "il";
  } else if (targetLang === "fr") {
    if (isVowelStart || /^h[aeiouàèéìòù]/i.test(w)) return "l'";
    if (normalizedGender === "feminine" || normalizedGender === "f") return "la";
    if (normalizedGender === "masculine" || normalizedGender === "m") return "le";
    
    // French linguistic noun-ending rules fallback
    if (w.endsWith("e") || w.endsWith("tion") || w.endsWith("ette")) return "la";
    return "le";
  } else if (targetLang === "es") {
    if (normalizedGender === "feminine" || normalizedGender === "f") return "la";
    if (normalizedGender === "masculine" || normalizedGender === "m") return "el";
    
    // Spanish linguistic noun-ending rules fallback
    if (w.endsWith("a") || w.endsWith("ción") || w.endsWith("dad")) return "la";
    return "el";
  } else if (targetLang === "en") {
    return "the";
  }

  return "";
}

export async function getArticleForTranslation(translation, targetLang, sourceText = "") {
  if (!translation) return { article: "", cleanTranslation: "" };
  
  const cleanWord = stripArticles(translation, targetLang).trim();
  
  // If the translation itself already starts with an article (e.g. "der Hund"), extract the article
  if (translation.trim().length > cleanWord.length) {
    const articleStr = translation.trim().substring(0, translation.trim().length - cleanWord.length).trim();
    return { article: articleStr, cleanTranslation: cleanWord };
  }

  // Verbs don't take articles
  if (isVerbCheck(cleanWord, targetLang) || isVerbCheck(sourceText, targetLang)) {
    return { article: "", cleanTranslation: cleanWord };
  }

  // 1. STARTER_VOCAB_RAW Lookup (using window.STARTER_VOCAB_RAW)
  const starterVocabRaw = window.STARTER_VOCAB_RAW || (typeof STARTER_VOCAB_RAW !== "undefined" ? STARTER_VOCAB_RAW : []);
  if (starterVocabRaw.length > 0) {
    const searchStr = cleanWord.toLowerCase();
    const sourceStr = (sourceText || "").toLowerCase().trim();
    const starter = starterVocabRaw.find(v => {
      return (v.en && v.en.toLowerCase() === searchStr) ||
             (v.de && v.de.toLowerCase() === searchStr) ||
             (v.it && v.it.toLowerCase() === searchStr) ||
             (v.es && v.es.toLowerCase() === searchStr) ||
             (v.fr && v.fr.toLowerCase() === searchStr) ||
             (v.en && v.en.toLowerCase() === sourceStr) ||
             (v.de && v.de.toLowerCase() === sourceStr) ||
             (v.it && v.it.toLowerCase() === sourceStr);
    });
    if (starter && starter.details && starter.details.articles && starter.details.articles[targetLang]) {
      return { article: starter.details.articles[targetLang], cleanTranslation: cleanWord };
    }
  }

  // 2. Custom state.vocab lookup
  if (state && state.vocab) {
    for (const cat of Object.keys(state.vocab)) {
      const list = state.vocab[cat] || [];
      const match = list.find(v => {
        return (v.target && v.target.toLowerCase() === cleanWord.toLowerCase()) ||
               (v.en && v.en.toLowerCase() === cleanWord.toLowerCase()) ||
               (v.de && v.de.toLowerCase() === cleanWord.toLowerCase());
      });
      if (match && match.details && match.details.articles && match.details.articles[targetLang]) {
        return { article: match.details.articles[targetLang], cleanTranslation: cleanWord };
      }
    }
  }

  // 3. Google Translate (GTX) part-of-speech dictionary lookup for exact grammatical gender
  const isSingleWord = !cleanWord.includes(" ");
  if (isSingleWord) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${targetLang}&tl=${targetLang}&dt=bd&q=${encodeURIComponent(cleanWord)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          for (const entry of data[1]) {
            if (Array.isArray(entry)) {
              const pos = (entry[0] || "").toLowerCase();
              if (pos === "noun" || pos === "substantiv" || pos === "sustantivo" || pos === "sostantivo" || pos === "nom") {
                const genderStr = (entry[3] || "").toLowerCase();
                const derivedArticle = getArticleFromGender(genderStr, cleanWord, targetLang);
                if (derivedArticle) {
                  return { article: derivedArticle, cleanTranslation: cleanWord };
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("GTX gender fetch failed:", e);
    }

    // 4. Linguistic ending rules fallback
    const fallbackArticle = getArticleFromGender("", cleanWord, targetLang);
    if (fallbackArticle) {
      return { article: fallbackArticle, cleanTranslation: cleanWord };
    }
  }

  return { article: "", cleanTranslation: cleanWord };
}

export async function fetchSynonymsForTarget(sourceText, sourceLang, targetLang, mainTranslation = "") {
  if (!sourceText || sourceText === "...") return [];
  
  const cleanSource = sourceText.trim();
  const cleanMain = stripArticles(mainTranslation, targetLang).toLowerCase().trim();
  
  // Use Google Translate (GTX) alternative translations & dictionary entries (100% free, 0 AI tokens)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=at&dt=bd&q=${encodeURIComponent(cleanSource)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      let alts = [];

      // Check data[5] (alternative translations array)
      if (Array.isArray(data) && Array.isArray(data[5])) {
        data[5].forEach(group => {
          if (Array.isArray(group) && Array.isArray(group[2])) {
            group[2].forEach(item => {
              if (Array.isArray(item) && typeof item[0] === "string") {
                alts.push(item[0]);
              }
            });
          }
        });
      }

      // Check data[1] (dictionary entries by part of speech)
      if (Array.isArray(data) && Array.isArray(data[1])) {
        data[1].forEach(entry => {
          if (Array.isArray(entry)) {
            // entry[1] is array of synonym strings e.g. ["grido", "urlo", "clamore"]
            if (Array.isArray(entry[1])) {
              entry[1].forEach(word => {
                if (typeof word === "string") alts.push(word);
              });
            }
            // entry[2] is detailed sub-array
            if (Array.isArray(entry[2])) {
              entry[2].forEach(sub => {
                if (Array.isArray(sub) && typeof sub[0] === "string") {
                  alts.push(sub[0]);
                }
              });
            }
          }
        });
      }

      const uniqueAlts = [...new Set(alts)].filter(a => {
        const lower = (a || "").toLowerCase().trim();
        return lower && lower !== cleanMain && lower !== cleanSource.toLowerCase();
      });

      if (uniqueAlts.length > 0) {
        return uniqueAlts.slice(0, 5);
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

// ==========================================
// Photo & Image OCR / Vision Translator
// ==========================================
const callLLMVision = (...args) => window.callLLMVision?.(...args);

export async function handlePhotoTranslation(file) {
  if (!file) return;
  const statusEl = document.getElementById("quick-translate-status");
  const inputEl = document.getElementById("quick-translate-text-input");

  const targetLang = document.getElementById("quick-translate-lang")?.value || "de";
  const hasAIKey = !!(state.geminiKey || state.openaiKey || state.grokKey);
  const useAI = hasAIKey;

  if (statusEl) {
    statusEl.textContent = useAI ? "🤖 Analyzing image with AI Vision..." : "💻 Processing image with local OCR (Tesseract.js)...";
    statusEl.style.color = "var(--accent-color)";
  }

  try {
    let extractedText = "";

    if (useAI) {
      if (!hasAIKey) {
        throw new Error("No AI API Key configured. Please select 'Offline OCR' mode or set an API key in Setup & API.");
      }
      // Read file as Base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result;
          const base64 = res.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || "image/jpeg";
      const prompt = `Extract all visible text from this image accurately without omitting any lines or words. Do not add conversational filler, markdown formatting, or explanations. Output ONLY the complete extracted text.`;

      const aiResult = await callLLMVision(prompt, base64Data, mimeType);
      extractedText = (aiResult || "").trim();
    } else {
      // Local Tesseract.js OCR (Offline Engine)
      if (typeof Tesseract === "undefined") {
        throw new Error("Tesseract.js engine failed to load. Please check your internet connection.");
      }

      const sizeKB = Math.round(file.size / 1024);
      if (window.triggerAPITelemetry) {
        window.triggerAPITelemetry({
          color: "purple",
          icon: "💻",
          title: "Tesseract.js OCR",
          infoText: `Offline Local Engine (${sizeKB} KB Image)`,
          durationMs: 4000
        });
      }

      const result = await Tesseract.recognize(
        file,
        "eng+deu+fra+spa+ita",
        {
          logger: m => {
            if (m.status === "recognizing text" && statusEl) {
              const pct = Math.round((m.progress || 0) * 100);
              statusEl.textContent = `💻 Extracting text locally: ${pct}%`;
            }
          }
        }
      );

      extractedText = (result?.data?.text || "").trim();
    }

    if (!extractedText) {
      if (statusEl) {
        statusEl.textContent = "⚠️ No readable text found in the image. Please try a clearer picture.";
        statusEl.style.color = "#f39c12";
      }
      return;
    }

    // Clean whitespace/newlines from OCR output for seamless single word or sentence translation
    const cleanExtracted = extractedText.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

    // Set input text in single unified input box
    if (inputEl) {
      inputEl.value = cleanExtracted;
    }
    const displayEl = document.getElementById("quick-translate-input-display");
    if (displayEl) {
      displayEl.textContent = cleanExtracted;
    }

    if (statusEl) {
      statusEl.textContent = `✅ Text extracted! Tap Translate to translate.`;
      statusEl.style.color = "#2ecc71";
    }

  } catch (err) {
    console.error("Photo translation error:", err);
    if (statusEl) {
      statusEl.textContent = `❌ Photo translate failed: ${err.message}`;
      statusEl.style.color = "#e74c3c";
    }
  }
}

window.handlePhotoTranslation = handlePhotoTranslation;

// ==========================================
// Interactive Image Cropper Modal Handler
// ==========================================
let currentCropperInstance = null;
let currentCropFile = null;

export function openImageCropModal(file) {
  if (!file) return;
  currentCropFile = file;

  const modal = document.getElementById("modal-crop-image");
  const imgTarget = document.getElementById("crop-image-target");
  if (!modal || !imgTarget) {
    handlePhotoTranslation(file);
    return;
  }

  // Destroy previous cropper instance if active
  if (currentCropperInstance) {
    currentCropperInstance.destroy();
    currentCropperInstance = null;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    imgTarget.src = e.target.result;
    modal.style.display = "flex";

    // Initialize Cropper.js instance (Optimized for iOS / Touch gestures)
    if (typeof Cropper !== "undefined") {
      currentCropperInstance = new Cropper(imgTarget, {
        viewMode: 0,
        dragMode: "crop",
        initialAspectRatio: NaN,
        aspectRatio: NaN,
        autoCropArea: 0.75,
        responsive: true,
        background: true,
        zoomable: true,
        rotatable: true,
        touchDragZoom: true,
        toggleDragModeOnDblclick: false
      });
    }

    // Set up button handlers
    const btnSubmit = document.getElementById("btn-crop-submit");
    const btnFull = document.getElementById("btn-crop-full");
    const btnClose = document.getElementById("btn-crop-close");
    const btnRotateLeft = document.getElementById("btn-crop-rotate-left");
    const btnRotateRight = document.getElementById("btn-crop-rotate-right");
    const btnReset = document.getElementById("btn-crop-reset");

    if (btnRotateLeft) btnRotateLeft.onclick = () => currentCropperInstance?.rotate(-90);
    if (btnRotateRight) btnRotateRight.onclick = () => currentCropperInstance?.rotate(90);
    if (btnReset) btnReset.onclick = () => currentCropperInstance?.reset();

    const closeModal = () => {
      modal.style.display = "none";
      if (currentCropperInstance) {
        currentCropperInstance.destroy();
        currentCropperInstance = null;
      }
    };

    if (btnClose) btnClose.onclick = closeModal;

    if (btnFull) {
      btnFull.onclick = () => {
        closeModal();
        handlePhotoTranslation(currentCropFile);
      };
    }

    if (btnSubmit) {
      btnSubmit.onclick = () => {
        if (currentCropperInstance) {
          const canvas = currentCropperInstance.getCroppedCanvas({
            maxWidth: 2048,
            maxHeight: 2048,
            fillColor: "#ffffff"
          });
          if (canvas) {
            canvas.toBlob((blob) => {
              closeModal();
              if (blob) {
                const croppedFile = new File([blob], file.name || "cropped_photo.jpeg", { type: "image/jpeg" });
                handlePhotoTranslation(croppedFile);
              } else {
                handlePhotoTranslation(currentCropFile);
              }
            }, "image/jpeg", 0.92);
            return;
          }
        }
        closeModal();
        handlePhotoTranslation(currentCropFile);
      };
    }
  };

  reader.readAsDataURL(file);
}

window.openImageCropModal = openImageCropModal;


