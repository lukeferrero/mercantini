/*
 * Definizione dei campi per tipo di stanza.
 * Ogni campo ha:
 *  - key: identificativo univoco salvato in room_fields.field_key
 *  - label: etichetta mostrata nel frontend
 *  - type: tipo di controllo, gestito dal renderer del form (views/app/room.ejs + public/js/room-form.js)
 *
 * Tipi di controllo supportati:
 *  - catalog_select            -> picker tra le opzioni definite in admin per quel catalogType (con foto)
 *  - catalog_select_optional   -> come sopra + opzione "Non presente"
 *  - catalog_select_note       -> catalog_select + campo note
 *  - catalog_select_color_note -> catalog_select + colore (testo) + note
 *  - number                    -> numero (con eventuale unit es. cm)
 *  - boolean                   -> si/no
 *  - text                      -> testo libero
 *  - text_note                 -> testo libero (tipo) + note
 *  - notes                     -> textarea note (mostrata sempre per intero)
 *  - note_pdf                  -> textarea note + upload PDF
 *  - bool_note_pdf             -> si/no + note + upload PDF
 *  - count_or_none_pdf         -> numero oppure "non presente" + upload PDF
 *  - attachments               -> upload libero di uno o più file (nessuna restrizione di tipo)
 */

const BASE_ROOM_FIELDS = [
  { key: 'pavimento_tipo', label: 'Pavimento', type: 'catalog_select', catalogType: 'pavimento' },
  { key: 'disposizione_pavimento', label: 'Disposizione pavimento', type: 'catalog_select', catalogType: 'disposizione_pavimento' },
  { key: 'zoccolo_tipo', label: 'Zoccolo', type: 'catalog_select', catalogType: 'zoccolo' },
  { key: 'prese_tv', label: 'Prese TV', type: 'count_or_none_pdf' },
  { key: 'colore_pareti', label: 'Colore pareti', type: 'text_note' },
  { key: 'porte', label: 'Porte', type: 'catalog_select_color_note', catalogType: 'porte' },
  { key: 'illuminazione', label: 'Illuminazione', type: 'note_pdf' },
  { key: 'punti_luce', label: 'Punti luce', type: 'note_pdf' },
  { key: 'prese_elettriche', label: 'Prese elettriche', type: 'text_note_pdf' },
  { key: 'aria_condizionata', label: 'Aria condizionata', type: 'catalog_select_note', catalogType: 'aria_condizionata' },
];

const NOTE_FIELD = { key: 'note', label: 'Note', type: 'notes' };
const ALLEGATI_FIELD = { key: 'allegati', label: 'Allegati', type: 'attachments' };

const ROOM_FIELDS = {
  bagno: [
    { key: 'piastrelle_pavimento_bagno_tipo', label: 'Piastrelle pavimento bagno', type: 'catalog_select', catalogType: 'piastrelle_pavimento_bagno' },
    { key: 'piastrelle_pareti_bagno_tipo', label: 'Piastrelle pareti bagno', type: 'catalog_select', catalogType: 'piastrelle_pareti_bagno' },
    { key: 'altezza_piastrelle_pareti', label: 'Altezza piastrelle pareti', type: 'number', unit: 'cm' },
    { key: 'pareti_piastrellate_tutte', label: 'Tutte le pareti piastrellate?', type: 'boolean' },
    { key: 'piastrelle_pareti_doccia_tipo', label: 'Piastrelle pareti doccia', type: 'catalog_select', catalogType: 'piastrelle_pareti_doccia' },
    { key: 'piastrelle_pavimento_doccia_tipo', label: 'Piastrelle pavimento doccia', type: 'catalog_select', catalogType: 'piastrelle_pavimento_doccia' },
    { key: 'sanitari_tipo', label: 'Sanitari', type: 'catalog_select', catalogType: 'sanitari' },
    { key: 'rubinetteria_lavandino_tipo', label: 'Rubinetteria lavandino', type: 'catalog_select', catalogType: 'rubinetteria_lavandino' },
    { key: 'rubinetteria_doccia_tipo', label: 'Rubinetteria doccia', type: 'catalog_select', catalogType: 'rubinetteria_doccia' },
    { key: 'mobile_bagno_tipo', label: 'Mobile bagno', type: 'catalog_select_optional', catalogType: 'mobile_bagno' },
    { key: 'lavandino_tipo', label: 'Lavandino', type: 'catalog_select_optional', catalogType: 'lavandino' },
    { key: 'box_doccia_tipo', label: 'Box doccia', type: 'catalog_select_optional', catalogType: 'box_doccia' },
    { key: 'termoarredo_tipo', label: 'Termoarredo', type: 'catalog_select', catalogType: 'termoarredo' },
    { key: 'specchio_tipo', label: 'Specchio', type: 'catalog_select_optional', catalogType: 'specchio' },
    { key: 'zoccolo_bagno_tipo', label: 'Zoccolo', type: 'catalog_select_optional', catalogType: 'zoccolo' },
    { key: 'illuminazione_bagno_tipo', label: 'Illuminazione bagno', type: 'catalog_select', catalogType: 'illuminazione_bagno' },
    { key: 'illuminazione_doccia_tipo', label: 'Illuminazione doccia', type: 'catalog_select', catalogType: 'illuminazione_doccia' },
    { key: 'lavatrice', label: 'Lavatrice', type: 'boolean' },
    { key: 'boiler_tipo', label: 'Boiler', type: 'catalog_select', catalogType: 'boiler' },
    { key: 'porte', label: 'Porte', type: 'catalog_select_color_note', catalogType: 'porte' },
    NOTE_FIELD,
    ALLEGATI_FIELD,
  ],

  soggiorno: [...BASE_ROOM_FIELDS, NOTE_FIELD, ALLEGATI_FIELD],

  cucina: [
    ...BASE_ROOM_FIELDS,
    { key: 'attacco_lavastoviglie', label: 'Attacco lavastoviglie', type: 'bool_note_pdf' },
    { key: 'attacco_lavatrice', label: 'Attacco lavatrice', type: 'bool_note_pdf' },
    { key: 'punto_luce_pensili', label: 'Punto luce pensili', type: 'bool_note_pdf' },
    NOTE_FIELD,
    ALLEGATI_FIELD,
  ],

  letto: [
    ...BASE_ROOM_FIELDS,
    { key: 'numero_comodini', label: 'Numero comodini', type: 'number' },
    NOTE_FIELD,
    ALLEGATI_FIELD,
  ],

  ingresso: [
    ...BASE_ROOM_FIELDS.filter(f => f.key !== 'prese_tv'),
    NOTE_FIELD,
    ALLEGATI_FIELD,
  ],

  altro: [
    ...BASE_ROOM_FIELDS.filter(f => f.key !== 'prese_tv'),
    NOTE_FIELD,
    ALLEGATI_FIELD,
  ],
};

module.exports = ROOM_FIELDS;
