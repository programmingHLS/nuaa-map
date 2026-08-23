const fs = require('fs');

const path = require('path');

const ROOT = __dirname;
const sqlPath = process.argv[2] || path.join(ROOT, 'seed.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.split('\n').filter(l => l.trim().startsWith('INSERT'));
const questions = [];

for (const line of lines) {
    const valsStart = line.indexOf('VALUES (');
    if (valsStart === -1) continue;

    let pos = valsStart + 8;
    const maxPos = line.length;

    function parseExpr() {
        while (pos < maxPos && line[pos] === ' ') pos++;
        let result = '';
        while (pos < maxPos) {
            if (line[pos] === "'") {
                pos++;
                while (pos < maxPos) {
                    if (line[pos] === "'" && pos + 1 < maxPos && line[pos + 1] === "'") {
                        result += "'";
                        pos += 2;
                    } else if (line[pos] === "'") {
                        pos++;
                        break;
                    } else {
                        result += line[pos];
                        pos++;
                    }
                }
            } else if (line.substring(pos, pos + 9) === 'CHAR(10)') {
                result += '\n';
                pos += 9;
            } else if (line[pos] === '|' && pos + 1 < maxPos && line[pos + 1] === '|') {
                pos += 2;
            } else {
                break;
            }
            while (pos < maxPos && line[pos] === ' ') pos++;
        }
        return result;
    }

    function skipComma() {
        while (pos < maxPos && (line[pos] === ' ' || line[pos] === ',')) pos++;
    }

    const id = parseExpr();
    skipComma();
    const question = parseExpr();
    skipComma();
    const answer = parseExpr();

    if (id && question) {
        questions.push({ id, question, answer });
    }
}

console.log('Parsed:', questions.length);

const json = {
    id: 'qa-freshman',
    category: '新生问答',
    description: '南京航空航天大学校园常见问题汇总（' + questions.length + '条）',
    keywords: ['新生', '报到', '校园', 'FAQ', '常见问题'],
    questions
};

const dir = path.join(ROOT, 'frontend/src/data');
const files = fs.readdirSync(dir).filter(f => f.includes('qa-') && f.endsWith('.json'));
console.log('JSON files in dir:', files);

const garbled = files.find(f => f !== 'qa-新生问答.json');
if (garbled) {
    const garbledPath = dir + '/' + garbled;
    console.log('Deleting garbled file:', garbled);
    fs.unlinkSync(garbledPath);
}

const content = JSON.stringify(json, null, 4) + '\n';
const correctFile = files.find(f => f.includes('新生问答'));
const outPath = dir + '/' + correctFile;
fs.writeFileSync(outPath, content, 'utf8');

const verify = JSON.parse(fs.readFileSync(outPath, 'utf8'));
console.log('Written file entries:', verify.questions.length);
console.log('Written file size:', fs.statSync(outPath).size);
console.log('Last entry id:', verify.questions[verify.questions.length - 1].id);