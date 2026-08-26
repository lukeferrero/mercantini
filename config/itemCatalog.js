// Elenco delle "voci" per cui l'admin definisce fino a 10 opzioni (ognuna con foto)
// selezionabili poi dal frontend nei campi delle stanze.
module.exports = [
  { type: 'piastrelle_pavimento_bagno', label: 'Piastrelle pavimento bagno' },
  { type: 'piastrelle_pareti_bagno', label: 'Piastrelle pareti bagno' },
  { type: 'piastrelle_pareti_doccia', label: 'Piastrelle pareti doccia' },
  { type: 'piastrelle_pavimento_doccia', label: 'Piastrelle pavimento doccia' },
  { type: 'sanitari', label: 'Sanitari' },
  { type: 'rubinetteria_lavandino', label: 'Rubinetteria lavandino' },
  { type: 'rubinetteria_doccia', label: 'Rubinetteria doccia' },
  { type: 'mobile_bagno', label: 'Mobile bagno' },
  { type: 'lavandino', label: 'Lavandino' },
  { type: 'box_doccia', label: 'Box doccia' },
  { type: 'termoarredo', label: 'Termoarredo' },
  { type: 'specchio', label: 'Specchio' },
  { type: 'zoccolo', label: 'Zoccolo' },
  { type: 'illuminazione_bagno', label: 'Illuminazione bagno' },
  { type: 'illuminazione_doccia', label: 'Illuminazione doccia' },
  { type: 'boiler', label: 'Boiler' },
  { type: 'porte', label: 'Porte' },
  { type: 'pavimento', label: 'Pavimento' },
  { type: 'aria_condizionata', label: 'Aria condizionata' },
  { type: 'illuminazione', label: 'Illuminazione' },
  { type: 'maniglie', label: 'Maniglie' },
  { type: 'portoncino_blindato', label: 'Portoncino blindato' },
  { type: 'disposizione_pavimento', label: 'Disposizione pavimento' },
];

// MAX_OPTIONS per voce di catalogo
module.exports.MAX_OPTIONS = 10;
