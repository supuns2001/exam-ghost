const fs = require('fs');

const logPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\3c7a0158-433d-453c-a74b-74a38d2fbfe7\\.system_generated\\logs\\transcript_full.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const jsonLines = content.split('\n');

const lineMap = {};
let step = 0;

for (const jl of jsonLines) {
  if (!jl.trim()) continue;
  step++;
  // Only process uncorrupted steps before the server crash at step 1250
  if (step > 1250) break;

  try {
    const obj = JSON.parse(jl);
    if (obj.content && typeof obj.content === 'string') {
      if (obj.content.includes('File Path: `file:///f:/Learning/extensions/test01/src/content/content.js`') ||
          obj.content.includes('File Path: `file:///F:/Learning/extensions/test01/src/content/content.js`')) {
        const lines = obj.content.split('\n');
        for (const line of lines) {
          const m = line.match(/^(\d+):\s(.*)$/);
          if (m) {
            const num = parseInt(m[1]);
            const val = m[2];
            if (!val.includes('\u0000') && val.length < 2000) {
              lineMap[num] = val;
            }
          }
        }
      }
    }
  } catch (e) {}
}

const keys = Object.keys(lineMap).map(Number).sort((a,b) => a-b);
console.log('Uncorrupted content.js lines count:', keys.length, 'Min:', keys[0], 'Max:', keys[keys.length - 1]);

const missing = [];
const restored = [];
for (let i = 1; i <= keys[keys.length - 1]; i++) {
  if (lineMap[i] === undefined) {
    missing.push(i);
    restored.push('');
  } else {
    restored.push(lineMap[i]);
  }
}

console.log('Missing count:', missing.length, 'Missing lines:', missing);

if (missing.length === 0) {
  fs.writeFileSync('src/content/content.js', restored.join('\n'), 'utf8');
  console.log('Successfully wrote exact clean src/content/content.js!');
}
