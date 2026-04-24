const fs = require('fs');
let content = fs.readFileSync('src/components/modals/ServiceRequestWizard.tsx', 'utf-8');

const targets = [
    '{workerProfileRequest && (',
    '{workerProfileRequest && isWorkerPortfolioFullscreen && activeWorkerPortfolioPhoto && (',
    '{ratingModalRequest && (',
    '{pendingRequestAction && ('
];

for (const target of targets) {
    let startIdx = content.indexOf(target);
    if (startIdx === -1) {
        console.log('Skipping', target);
        continue;
    }

    const replaceStr = target.replace(' && (', ' && createPortal(');
    
    const animateCloseIdx = content.indexOf('</AnimatePresence>', startIdx);
    const block = content.slice(startIdx, animateCloseIdx);
    
    // find the last occurrence of `)}` in this block
    const lastClosingIdx = block.lastIndexOf(')}');
    
    if (lastClosingIdx !== -1) {
        const newBlock = block.slice(0, lastClosingIdx) + '), document.body)}' + block.slice(lastClosingIdx + 2);
        
        const finalBlock = newBlock.replace(target, replaceStr);
        content = content.slice(0, startIdx) + finalBlock + content.slice(animateCloseIdx);
        console.log('Processed', target);
    }
}

fs.writeFileSync('src/components/modals/ServiceRequestWizard.tsx', content, 'utf-8');
console.log('Successfully wrapped modals in portals!');