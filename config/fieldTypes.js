// Tipi di controllo supportati dal renderer dei campi dinamici
// (views/partials/dynamic-fields.ejs). Usato dal pannello admin per popolare
// il selettore "tipo di controllo" quando si crea un nuovo campo, sia per un
// tipo di stanza sia per le caratteristiche dell'unità.
module.exports = [
  { value: 'catalog_select', label: 'Selezione da catalogo (con foto)', needsCatalog: true },
  { value: 'catalog_select_optional', label: 'Selezione da catalogo + "Non presente"', needsCatalog: true },
  { value: 'catalog_select_note', label: 'Selezione da catalogo + note', needsCatalog: true },
  { value: 'catalog_select_color_note', label: 'Selezione da catalogo + colore + note', needsCatalog: true },
  { value: 'number', label: 'Numero', needsCatalog: false },
  { value: 'boolean', label: 'Sì / No', needsCatalog: false },
  { value: 'text', label: 'Testo libero', needsCatalog: false },
  { value: 'text_note', label: 'Testo (tipo) + note', needsCatalog: false },
  { value: 'text_note_pdf', label: 'Testo (tipo) + note + PDF', needsCatalog: false },
  { value: 'notes', label: 'Note (testo lungo)', needsCatalog: false },
  { value: 'note_pdf', label: 'Note + PDF', needsCatalog: false },
  { value: 'bool_note_pdf', label: 'Sì/No + note + PDF', needsCatalog: false },
  { value: 'count_or_none_pdf', label: 'Numero oppure "non presente" + PDF', needsCatalog: false },
  { value: 'attachments', label: 'Allegati liberi (foto/file multipli)', needsCatalog: false },
];
