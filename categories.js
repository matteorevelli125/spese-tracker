// Categorie: subset di Wallet, personalizzabile.
// Ogni macro categoria ha icona (emoji), colore e sottocategorie.
const CATEGORIES = [
  { id: 'auto', name: 'Automobile', icon: '🚗', color: '#e74c3c',
    subs: ['Carburante', 'Pedaggi', 'Parcheggio', 'Manutenzione', 'Assicurazione', 'Bollo', 'Finanziamento'] },
  { id: 'cibo', name: 'Cibo e bevande', icon: '🍽️', color: '#e67e22',
    subs: ['Spesa', 'Ristorante', 'Bar e caffè', 'Take away'] },
  { id: 'casa', name: 'Casa', icon: '🏠', color: '#3498db',
    subs: ['Affitto / Mutuo', 'Bollette', 'Arredamento', 'Manutenzione', 'Condominio'] },
  { id: 'svago', name: 'Svago', icon: '🎉', color: '#9b59b6',
    subs: ['Cinema e eventi', 'Sport', 'Hobby', 'Abbonamenti', 'Libri e giochi'] },
  { id: 'salute', name: 'Salute', icon: '💊', color: '#1abc9c',
    subs: ['Farmacia', 'Visite mediche', 'Cura personale'] },
  { id: 'abbigliamento', name: 'Abbigliamento', icon: '👕', color: '#f39c12',
    subs: ['Vestiti', 'Scarpe', 'Accessori'] },
  { id: 'trasporti', name: 'Trasporti', icon: '🚆', color: '#2ecc71',
    subs: ['Treno', 'Bus e metro', 'Taxi'] },
  { id: 'viaggi', name: 'Viaggi', icon: '✈️', color: '#16a085',
    subs: ['Alloggio', 'Trasporto', 'Attività'] },
  { id: 'regali', name: 'Regali', icon: '🎁', color: '#e84393',
    subs: ['Regali', 'Donazioni'] },
  { id: 'altro', name: 'Altro', icon: '📦', color: '#7f8c8d',
    subs: ['Varie', 'Commissioni bancarie', 'Tasse'] },
];
const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
