// VocTrainer - Import & Scraper Module
import { state, saveState, updateCategoryCounts } from './state.js';

// ==========================================
// 4. Scraper & Custom Add Functionality
// ==========================================
export export let urlScrapedRows = [];
export export let fileScrapedRows = [];

// Configure PDF.js global worker path if available
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

export async function importFromUrl(url, category) {
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

export function renderUrlPreview() {
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
export async function handleFileSelect(file) {
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

export function renderFilePreview() {
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

export async function executeFileImport() {
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

export async function detectLanguage(text) {
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

export async function translateAndDetectWithAI(word) {
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

export async function addCustomWord(english, translation, lang, category, imageUrl = "", audioBase64 = "") {
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

export function sanitizeWordTranslation(text, lang) {
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

export async function fillMissingTranslations(wordObj, sourceLang) {
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

export function renderImportedList() {
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


