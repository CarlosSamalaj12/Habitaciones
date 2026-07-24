// Elimina los 6 addEventListener de los botones de accion (bOcc/bLimp/bMant/bRep/bFree/bPrio)
// que quedaron en app.js despues de la refactorizacion parcial.

const fs = require('fs');
const path = 'C:\\Users\\samal\\Documents\\HABITACIONES\\Habitaciones\\app.js';
let s = fs.readFileSync(path, 'utf8');

// Inicio: primer bOcc.addEventListener dentro de renderRooms
const startMarker = '    bOcc.addEventListener("click", (e) => {';
const startIdx = s.indexOf(startMarker);
if (startIdx === -1) {
  console.error('No se encontro bOcc.addEventListener');
  process.exit(1);
}

// Debug: mostrar los ultimos 200 chars del bloque que buscamos
const tail = s.slice(s.indexOf('bPrio.disabled = false', startIdx), s.indexOf('bPrio.disabled = false', startIdx) + 200);
console.log('=== Texto desde bPrio.disabled = false ===');
console.log(JSON.stringify(tail));
console.log('=== Fin debug ===');

// Final: cierre del listener de bPrio
// Probamos varias variantes
const candidates = [
  '      bPrio.disabled = false;\n      }\n    });',
  '      bPrio.disabled = false;\r\n      }\r\n    });',
  '      bPrio.disabled = false;\n    }\n    });',
  '        bPrio.disabled = false;\n      }\n    });',
  '        bPrio.disabled = false;\n        }\n    });',
];

let endIdx = -1;
let endNeedle = null;
for (const c of candidates) {
  const idx = s.indexOf(c, startIdx);
  if (idx !== -1) {
    endIdx = idx;
    endNeedle = c;
    console.log('ENCONTRADO con candidato:', JSON.stringify(c));
    break;
  }
}

if (endIdx === -1) {
  console.error('No se encontro fin de bPrio listener con ningun candidato');
  process.exit(1);
}
const endOfBlock = endIdx + endNeedle.length;

// Reemplazar el bloque por un comentario explicativo
const replacement = '    // Los 6 botones de accion (ocupado, limpieza, mant, repaso, liberar, prio)\n    // y el obsPeekBtn se manejan via event delegation en roomsGrid (ver setupGridDelegation).';

const before = s.slice(0, startIdx);
const after = s.slice(endOfBlock);
const newContent = before + replacement + after;

if (newContent === s) {
  console.error('No se realizo ningun cambio');
  process.exit(1);
}

fs.writeFileSync(path, newContent, 'utf8');
console.log('OK: bloque de listeners eliminado.');
console.log('Caracteres quitados:', endOfBlock - startIdx);
console.log('Lineas quitadas (aprox):', s.slice(startIdx, endOfBlock).split('\n').length);
