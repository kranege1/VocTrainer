const fs = require('fs');
const path = require('path');
const https = require('https');

const vocabPath = path.join(__dirname, '..', 'vocab', 'vocab.json');
const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function translate(text, targetLang) {
  return new Promise((resolve) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translation = parsed[0][0][0];
          resolve(translation.trim().toLowerCase());
        } catch (e) {
          resolve('');
        }
      });
    }).on('error', () => resolve(''));
  });
}

function getEnglishSynonyms(word) {
  return new Promise((resolve) => {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Get top 4 synonyms
          const syns = parsed.map(w => w.word.toLowerCase()).slice(0, 4);
          resolve(syns);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function enrich() {
  console.log(`Starting synonyms enrichment for ${vocab.length} words...`);
  const batchSize = 10;
  const languages = ['de', 'it', 'es', 'fr'];
  const enrichedVocab = [];

  for (let i = 0; i < vocab.length; i += batchSize) {
    const batch = vocab.slice(i, i + batchSize);
    console.log(`Processing synonyms batch starting at index ${i}...`);

    const results = await Promise.all(batch.map(async (item) => {
      const isVerb = item.en.startsWith('to ');
      const isPhrase = item.category === 'phrases' || item.en.includes('?');

      const details = item.details || { articles: {}, sentences: {}, variations: {} };
      details.synonyms = { en: [] };

      // Initialize language synonyms lists
      for (const lang of languages) {
        details.synonyms[lang] = [];
      }

      if (!isPhrase) {
        const cleanWord = isVerb ? item.en.replace(/^to\s+/, '') : item.en;
        const enSyns = await getEnglishSynonyms(cleanWord);
        
        // Populate English synonyms (adding "to " prefix back for verbs)
        details.synonyms.en = isVerb ? enSyns.map(s => `to ${s}`) : enSyns;

        // Populate translations of synonyms
        if (enSyns.length > 0) {
          await Promise.all(languages.map(async (lang) => {
            const list = [];
            for (const syn of enSyns) {
              const trans = await translate(syn, lang);
              if (trans && trans !== item[lang].toLowerCase()) {
                list.push(trans);
              }
            }
            details.synonyms[lang] = [...new Set(list)];
          }));
        }
      }

      // Special manually added synonyms for key beginners words if Datamuse is sparse:
      // For "city" -> add "town" to English, and "ort"/"kleinstadt" or similar.
      if (item.en === 'city') {
        if (!details.synonyms.en.includes('town')) details.synonyms.en.push('town');
        if (!details.synonyms.de.includes('ort')) details.synonyms.de.push('ort');
        if (!details.synonyms.de.includes('kleinstadt')) details.synonyms.de.push('kleinstadt');
      }
      if (item.en === 'house') {
        if (!details.synonyms.en.includes('home')) details.synonyms.en.push('home');
      }

      return {
        ...item,
        details
      };
    }));

    enrichedVocab.push(...results);
    fs.writeFileSync(vocabPath, JSON.stringify(enrichedVocab, null, 2), 'utf8');
    await sleep(50);
  }

  console.log('Synonyms enrichment completed successfully!');
}

enrich();
