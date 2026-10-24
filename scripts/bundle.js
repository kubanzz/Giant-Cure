// Optional authoring helper. Playing index.html does not require Node or a server.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assetNames = ['entry', 'main', 'heart'];
const sources = Object.fromEntries(assetNames.map(name => {
  const file = path.join(root, 'assets', 'heart-journey', name + '.png');
  if (!fs.existsSync(file)) throw new Error('Missing chapter illustration: ' + file);
  return [name, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')];
}));
const assetScript = read('src/journey-assets.js').replace('/* JOURNEY_IMAGE_DATA */ {}', () => JSON.stringify(sources));
const games = read('src/giant-art.js') + '\n' + assetScript + ['journey-art', 'heart-journey'].map(name => `\n// ===== ${name.toUpperCase()} TREATMENT =====\n${read(`src/${name}.js`)}`).join('\n');
const html = read('src/index.template.html')
  .replace('/* STYLES */', () => read('src/styles.css'))
  .replace('  /* GAMES */', () => games)
  .replace('  /* APP */', () => ['cover', 'clinic-art', 'app'].map(name => read(`src/${name}.js`)).join('\n'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Created standalone index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB)`);
