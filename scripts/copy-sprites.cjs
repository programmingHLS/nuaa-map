const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '../assets/map/buildings');
const dest = path.join(__dirname, '../frontend/public/buildings/sprites');
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
const files = fs.readdirSync(src).filter(f => f.endsWith('.png'));
files.forEach(f => {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  console.log('Copied: ' + f);
});
console.log('Done: ' + files.length + ' files');
