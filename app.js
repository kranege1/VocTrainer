import { state, saveState, loadState, getFolderFullPath, updateCategoryCounts, getFlagHtml } from './modules/state.js';
import {
  importFromUrl,
  renderUrlPreview,
  handleFileSelect,
  renderFilePreview,
  executeFileImport,
  detectLanguage,
  translateAndDetectWithAI,
  addCustomWord,
  sanitizeWordTranslation,
  fillMissingTranslations,
  renderImportedList
} from './modules/import.js';
import { startTestSession, renderQuestion, selectOption, submitTypingAnswer, submitConjugationAnswer, nextQuestion, finishTestSession, quitTestSession, speakCurrentTestWord, repeatMistakes, voteDifficulty, updateDifficultyVoteUI } from './modules/test-runner.js';
import { initApp, renderHistoryList } from './modules/init.js';

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

import {
  showCustomAlert,
  showCustomConfirm,
  testApiKey,
  renderFoldersList,
  buildTreeHTML,
  getFolderWordCountRecursive,
  getFolderWordsRecursive,
  getAllWordsCombined,
  deleteFolderRecursive,
  isDescendantFolder,
  renderStatisticsView,
  renderFolderStatistics,
  callLLM,
  updateDirectionButtonsUI,
  getGrokModel,
  loadOnDeviceVoices
} from './modules/modals.js';
import {
  initQuickTranslateSpeech,
  startQuickTranslateSpeech,
  stopQuickTranslateSpeech,
  toggleQuickTranslateSpeech,
  runQuickTranslate,
  populateQuickTranslateFolders,
  saveQuickTranslateWord,
  normalizeWordCasing,
  isVerbCheck,
  isVerbAnyLanguage,
  detectLanguageAndTranslateToEn,
  fetchSynonymsForTarget
} from './modules/quick-translate.js';

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

function playFeedbackSound(type) {
  playSound("sound-" + type);
}

window.playSound = playSound;
window.playFeedbackSound = playFeedbackSound;

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



window.importFromUrl = importFromUrl;
window.renderUrlPreview = renderUrlPreview;
window.handleFileSelect = handleFileSelect;
window.renderFilePreview = renderFilePreview;
window.executeFileImport = executeFileImport;
window.detectLanguage = detectLanguage;
window.translateAndDetectWithAI = translateAndDetectWithAI;
window.addCustomWord = addCustomWord;
window.sanitizeWordTranslation = sanitizeWordTranslation;
window.fillMissingTranslations = fillMissingTranslations;
window.renderImportedList = renderImportedList;

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



window.showCustomAlert = showCustomAlert;
window.showCustomConfirm = showCustomConfirm;
window.testApiKey = testApiKey;
window.renderFoldersList = renderFoldersList;
window.getFolderWordsRecursive = getFolderWordsRecursive;
window.getAllWordsCombined = getAllWordsCombined;
window.deleteFolderRecursive = deleteFolderRecursive;
window.renderStatisticsView = renderStatisticsView;
window.updateDirectionButtonsUI = updateDirectionButtonsUI;
window.loadOnDeviceVoices = loadOnDeviceVoices;
window.callLLM = callLLM;



window.initQuickTranslateSpeech = initQuickTranslateSpeech;
window.startQuickTranslateSpeech = startQuickTranslateSpeech;
window.stopQuickTranslateSpeech = stopQuickTranslateSpeech;
window.toggleQuickTranslateSpeech = toggleQuickTranslateSpeech;
window.runQuickTranslate = runQuickTranslate;
window.populateQuickTranslateFolders = populateQuickTranslateFolders;
window.saveQuickTranslateWord = saveQuickTranslateWord;
window.normalizeWordCasing = normalizeWordCasing;
window.isVerbCheck = isVerbCheck;
window.isVerbAnyLanguage = isVerbAnyLanguage;
window.detectLanguageAndTranslateToEn = detectLanguageAndTranslateToEn;
window.fetchSynonymsForTarget = fetchSynonymsForTarget;

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
window.speakWord = speakWord;
window.getFlagHtml = getFlagHtml;

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
