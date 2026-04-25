const fs = require('fs');
const content = fs.readFileSync('src/components/modals/ServiceRequestWizard.tsx', 'utf-8');
const lines = content.split('\n');

const profileIdx = lines.findIndex(l => l.includes('{workerProfileRequest && ('));
console.log('Profile modal starts at line:', profileIdx + 1);

for(let i = profileIdx - 20; i < profileIdx + 10; i++) {
    console.log(i + 1, lines[i]);
}