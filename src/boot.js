// Startfil: huvudstudion är ett helt separat testläge med egen renderare, så den laddas i stället för
// spelet när den är vald. Allt annat startar spelet som vanligt.
let mode = null;
try {
  mode = JSON.parse(localStorage.getItem('virtual-room-settings') || '{}').mode;
} catch {
  // Lagringen är blockerad: starta spelet
}
if (mode === 'studio') import('./studio/studio.js');
else import('./main.js');
