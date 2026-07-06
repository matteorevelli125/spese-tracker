// Categorie: subset di Wallet, personalizzabile.
// Ogni macro categoria ha icona (emoji), colore e sottocategorie.
// NOTA: gli id sono salvati nei movimenti — non cambiarli; per rinominare
// una categoria basta cambiare `name` (es. viaggi → "Vacanze").
const CATEGORIES = [
  { id: 'auto', name: 'Automobile', icon: '🚗', color: '#e74c3c',
    subs: ['Carburante', 'Pedaggi', 'Parcheggio', 'Manutenzione', 'Assicurazione', 'Bollo', 'Finanziamento', 'Altro'] },
  { id: 'cibo', name: 'Cibo e bevande', icon: '🍽️', color: '#e67e22',
    subs: ['Spesa', 'Ristorante', 'Bar e caffè', 'Take away', 'Altro'] },
  { id: 'casa', name: 'Casa', icon: '🏠', color: '#3498db',
    subs: ['Affitto / Mutuo', 'Bollette', 'Arredamento', 'Manutenzione', 'Condominio', 'Altro'] },
  { id: 'abbonamenti', name: 'Abbonamenti', icon: '🔁', color: '#6c5ce7',
    subs: ['Streaming', 'Telefonia e internet', 'Software e AI', 'Altro'] },
  { id: 'svago', name: 'Svago', icon: '🎉', color: '#9b59b6',
    subs: ['Cinema e eventi', 'Sport', 'Hobby', 'Elettronica', 'Libri e giochi', 'Altro'] },
  { id: 'salute', name: 'Salute', icon: '💊', color: '#1abc9c',
    subs: ['Farmacia', 'Visite mediche', 'Cura personale', 'Altro'] },
  { id: 'abbigliamento', name: 'Abbigliamento', icon: '👕', color: '#f39c12',
    subs: ['Vestiti', 'Scarpe', 'Accessori', 'Tintoria', 'Altro'] },
  { id: 'trasporti', name: 'Trasporti', icon: '🚆', color: '#2ecc71',
    subs: ['Treno', 'Bus e metro', 'Taxi', 'Car sharing', 'Altro'] },
  { id: 'viaggi', name: 'Vacanze', icon: '✈️', color: '#16a085',
    subs: ['Alloggio', 'Trasporto', 'Attività', 'Cibo', 'Altro'] },
  { id: 'regali', name: 'Regali', icon: '🎁', color: '#e84393',
    subs: ['Regali', 'Donazioni', 'Altro'] },
  { id: 'altro', name: 'Altro', icon: '📦', color: '#7f8c8d',
    subs: ['Varie', 'Commissioni bancarie', 'Tasse'] },
];
const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

// Categorie di entrata (piatte: nessuna sottocategoria).
const INCOME_CATEGORIES = [
  { id: 'stipendio', name: 'Stipendio', icon: '💰', color: '#27ae60' },
  { id: 'buoni-pasto', name: 'Buoni pasto', icon: '🎫', color: '#f39c12' },
  { id: 'bonus', name: 'Bonus', icon: '✨', color: '#8e44ad' },
  { id: 'entrate-altro', name: 'Altre entrate', icon: '📈', color: '#7f8c8d' },
];
const incomeCatById = id => INCOME_CATEGORIES.find(c => c.id === id) || INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1];
