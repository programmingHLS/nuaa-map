const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'frontend', 'src', 'data');
const files = fs.readdirSync(dataDir);
const qaFile = files.find(f => f.startsWith('qa-') && f.endsWith('.json'));
if (!qaFile) {
    console.error('QA JSON file not found');
    process.exit(1);
}
const qaData = JSON.parse(fs.readFileSync(path.join(dataDir, qaFile), 'utf-8'));

async function seed() {
    const url = 'https://nuaa-map.pages.dev/api/qa';
    let success = 0;
    let fail = 0;

    for (const q of qaData.questions) {
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: q.question,
                    answer: q.answer,
                    status: 'resolved',
                }),
            });
            if (resp.ok) {
                success++;
                console.log(`OK: ${q.question}`);
            } else {
                fail++;
                console.error(`FAIL (${resp.status}): ${q.question}`);
            }
        } catch (err) {
            fail++;
            console.error(`ERROR: ${q.question} - ${err.message}`);
        }
    }

    console.log(`\nDone: ${success} success, ${fail} fail`);
}

seed();