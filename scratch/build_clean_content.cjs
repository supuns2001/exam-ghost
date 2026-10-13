const fs = require('fs');

const logPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\3c7a0158-433d-453c-a74b-74a38d2fbfe7\\.system_generated\\logs\\transcript_full.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const jsonLines = content.split('\n');

function getBlock(startStep, endStep, matchStr) {
  let step = 0;
  for (const jl of jsonLines) {
    if (!jl.trim()) continue;
    step++;
    if (step >= startStep && step <= endStep) {
      try {
        const obj = JSON.parse(jl);
        if (obj.content && obj.content.includes(matchStr)) {
          return obj.content;
        }
      } catch (e) {}
    }
  }
  return null;
}

console.log('Script ready');
