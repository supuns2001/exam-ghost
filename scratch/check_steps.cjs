const fs = require('fs');

const logPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\3c7a0158-433d-453c-a74b-74a38d2fbfe7\\.system_generated\\logs\\transcript_full.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const jsonLines = content.split('\n');

// Find step 1055: where lines 1-100 were viewed
// Find step 946: 400-450
// Find step 948: 500-600
// Find step 952: 190-260
// Find step 954: 260-300
// Find step 934: 600-680
// Find step 984: 680-715
// Find step 986: 755-775
// Find step 1106: 800-850 (with dropdown extraction)
// Find step 994: 895-945 (with radio enhancement)
// Find step 914: 931-990
// Find step 930: 980-1050
// Find step 922: 1050-1150
// Find step 924: 1150-1260
// Find step 916: 1350-1410
// Find step 998: 1410-1435 (with snip stealth)
// Find step 928: 1410-1500
// Find step 962: 1480-1540
// Find step 964: 1530-1589

console.log('Script loaded successfully.');
