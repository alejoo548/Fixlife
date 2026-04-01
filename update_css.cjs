const fs = require('fs');
const file = 'src/components/modals/ServiceRequestWizard.tsx';
let code = fs.readFileSync(file, 'utf8');

// Step 1 title changes
code = code.replace(/text-3xl font-bold text-gray-900 mb-6[^>]*>\s*Tell us more/g, 'text-2xl font-black text-slate-900 mb-4 tracking-tight">Request Details');
code = code.replace(/border-bird-blue\/20 bg-bird-blue\/5 px-4 py-3/g, 'border-b border-gray-100 pb-4 mb-4');
code = code.replace(/uppercase tracking-wider text-bird-blue/g, 'uppercase tracking-wider text-slate-400 text-[10px]');
code = code.replace(/text-sm font-bold text-gray-900/g, 'text-[15px] font-bold text-slate-800');

// Inputs and buttons
code = code.replace(/rounded-xl border border-gray-200 bg-white/g, 'rounded-2xl border-none bg-gray-50/80 hover:bg-gray-100 transition-colors');
code = code.replace(/focus:border-bird-blue focus:ring-4 focus:ring-bird-blue\/10/g, 'focus:ring-2 focus:ring-slate-900');
code = code.replace(/bg-bird-blue hover:bg-bird-darkBlue/g, 'bg-slate-900 hover:bg-black');
code = code.replace(/Confirm Request/g, 'Confirm Booking');
code = code.replace(/bg-bird-orange hover:bg-orange-600/g, 'bg-slate-900 hover:bg-black');
code = code.replace(/text-bird-blue/g, 'text-slate-900');

fs.writeFileSync(file, code);
console.log('CSS updated successfully.');
