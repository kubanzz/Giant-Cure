// Optional authoring helper. Playing index.html does not require Node or a server.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const games = ['blood', 'spore', 'heart'].map(name => `\n// ===== ${name.toUpperCase()} TREATMENT =====\n${read(`src/${name}.js`)}`).join('\n');
const html = read('src/index.template.html')
  .replace('/* STYLES */', () => read('src/styles.css'))
  .replace('  /* GAMES */', () => games)
  .replace('  /* APP */', () => (fs.existsSync(path.join(root, 'src/cover.js')) ? read('src/cover.js') : '') + '\n' + read('src/app.js'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Created standalone index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB)`);
