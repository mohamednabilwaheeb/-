const fs=require('fs'),path=require('path');
const out=path.join(__dirname,'..','www','lib');fs.mkdirSync(out,{recursive:true});
const c=(src,dst)=>fs.copyFileSync(path.join(__dirname,'..','node_modules',src),path.join(out,dst));
c('exceljs/dist/exceljs.min.js','exceljs.min.js');
c('jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js');
c('jszip/dist/jszip.min.js','jszip.min.js');
for(const w of ['400','700'])for(const s of ['arabic','latin'])c(`@fontsource/cairo/files/cairo-${s}-${w}-normal.woff2`,`cairo-${s}-${w}.woff2`);
for(const f of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-firestore-compat.js'])c('firebase/'+f,f);
console.log('libs copied');
