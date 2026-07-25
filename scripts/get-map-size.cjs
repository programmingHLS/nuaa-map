const fs = require('fs');
const b = fs.readFileSync('d:/Code/NUAAMap/frontend/public/hand-drawn-map-v1.jpg');
let i = 2;
while (i < b.length) {
  if (b[i] === 0xFF && (b[i+1] === 0xC0 || b[i+1] === 0xC2)) {
    const h = b.readUInt16BE(i + 5);
    const w = b.readUInt16BE(i + 7);
    console.log('Map size: ' + w + 'x' + h);
    break;
  }
  i++;
}
