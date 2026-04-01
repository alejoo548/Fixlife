const fs = require('fs');
const file = 'src/pages/PaymentCheckoutPage.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace deep blues with slate-900 (Uber style)
code = code.replace(/bg-gradient-to-br from-bird-blue via-bird-darkBlue to-blue-900/g, 'bg-gray-50');
code = code.replace(/text-white/g, 'text-slate-900');
code = code.replace(/text-blue-50/g, 'text-slate-500');
code = code.replace(/border-white\/20/g, 'border-gray-200');
code = code.replace(/bg-white\/10/g, 'bg-white');
code = code.replace(/border-white\/70 bg-white\/90/g, 'border-gray-100 bg-white');
code = code.replace(/text-bird-blue/g, 'text-slate-900');
code = code.replace(/bg-bird-blue hover:bg-bird-darkBlue/g, 'bg-slate-900 hover:bg-black text-white');
code = code.replace(/bg-bird-orange hover:bg-orange-600/g, 'bg-slate-900 hover:bg-black text-white');

fs.writeFileSync(file, code);
console.log('Payment checkout styling updated.');
