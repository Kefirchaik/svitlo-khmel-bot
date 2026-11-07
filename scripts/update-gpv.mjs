import {fetchGpv} from '../lib/gpv.js';
const secret=process.env.CHECK_SECRET;
if(!secret)throw Error('CHECK_SECRET is required');
const days=await fetchGpv();
if(!Object.keys(days).length)throw Error('No complete dated schedules found on official website');
const response=await fetch('https://svitlo-khmel-bot.vercel.app/api/gpv-update',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({days})});
const result=await response.json();
if(!response.ok||!result.saved)throw Error('GPV update failed: '+JSON.stringify(result));
console.log('Saved official GPV days:',Object.keys(days).join(', '));
