const fs = require('fs');
const path = require('path');

const vocabDir = path.join(__dirname, '..', 'vocab');
const de = JSON.parse(fs.readFileSync(path.join(vocabDir, 'de.json'), 'utf8'));
const it = JSON.parse(fs.readFileSync(path.join(vocabDir, 'it.json'), 'utf8'));
const es = JSON.parse(fs.readFileSync(path.join(vocabDir, 'es.json'), 'utf8'));
const fr = JSON.parse(fs.readFileSync(path.join(vocabDir, 'fr.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(vocabDir, 'en.json'), 'utf8'));

console.log('Lengths:', de.length, it.length, es.length, fr.length, en.length);

const unified = [];

for (let i = 0; i < de.length; i++) {
  const englishWord = de[i].en;
  
  // Verify that the English word matches across other target files
  if (it[i].en !== englishWord) {
    console.warn(`Mismatch at index ${i} for IT: expected "${englishWord}", got "${it[i].en}"`);
  }
  if (es[i].en !== englishWord) {
    console.warn(`Mismatch at index ${i} for ES: expected "${englishWord}", got "${es[i].en}"`);
  }
  if (fr[i].en !== englishWord) {
    console.warn(`Mismatch at index ${i} for FR: expected "${englishWord}", got "${fr[i].en}"`);
  }
  
  // For en.json, the key "en" is actually the German word, and the "target" is the English word.
  if (en[i].target !== englishWord) {
    console.warn(`Mismatch at index ${i} for EN: expected "${englishWord}", got "${en[i].target}"`);
  }

  unified.push({
    en: englishWord,
    de: de[i].target,
    it: it[i].target,
    es: es[i].target,
    fr: fr[i].target,
    category: de[i].category,
    image: de[i].image
  });
}

fs.writeFileSync(path.join(vocabDir, 'vocab.json'), JSON.stringify(unified, null, 2), 'utf8');
console.log('Saved unified vocab.json with', unified.length, 'entries.');
