const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../assets/map/buildings');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
files.forEach(f => {
  const buf = fs.readFileSync(path.join(dir, f));
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`${f} | ${w}x${h}`);
});
