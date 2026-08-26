# Reno Manager

Tool per la gestione della ristrutturazione di appartamenti: progetti → unità immobiliari → stanze, con campi configurabili per tipo stanza e catalogo opzioni (con foto) gestito dal backend.

## Ruoli
- **admin**: accede a `/admin` (backend) e a `/app` (frontend). Gestisce progetti, unità, stanze, utenti e catalogo opzioni.
- **editor**: accede solo a `/app`, può modificare i campi delle stanze.
- **viewer**: accede solo a `/app`, sola lettura.

## Avvio in locale

```bash
npm install
ADMIN_EMAIL=admin@tuodominio.it ADMIN_PASSWORD=scegli-una-password npm start
```

Al primo avvio viene creato automaticamente un utente admin con le credenziali indicate (o `admin@example.com` / `changeme123` se non specificate — **cambiala subito** dal pannello Utenti).

Il sito sarà su `http://localhost:3000`.

Su Windows, se `npm install` fallisce nel compilare `better-sqlite3` (errori legati a `node-gyp`/Python), assicurati di usare una versione **LTS** di Node.js (18/20/22, non l'ultima "current") — con la LTS npm scarica un binario già pronto e non deve compilare nulla.

## Struttura

```
config/roomFields.js   -> definizione dei campi per ogni tipo di stanza (bagno/soggiorno/cucina/letto/ingresso/altro)
config/itemCatalog.js  -> le 20 voci di catalogo (piastrelle, sanitari, rubinetteria, ecc.) con max 10 opzioni ciascuna
db/schema.sql           -> schema del database SQLite
db/init.js               -> inizializzazione DB + creazione admin di default
routes/admin.js          -> backend (solo admin)
routes/app.js             -> frontend (editor/viewer, form dinamico delle stanze)
routes/auth.js            -> login/logout
views/                     -> template EJS
public/uploads/            -> foto delle opzioni di catalogo + PDF caricati sulle stanze
```

## Aggiungere/modificare campi

Tutti i campi delle stanze sono definiti in `config/roomFields.js` e vengono renderizzati automaticamente dal form (`views/app/room.ejs`) in base al `type` (select da catalogo, numero, si/no, testo+note, note+PDF, ecc.). Per aggiungere un campo basta aggiungerlo all'array del tipo di stanza corrispondente — non serve toccare il database.

## Deploy su Hostinger (Node.js hosting)

Stesso schema usato per l'app Tailwinds:

1. Crea un repo GitHub con questo codice (escludi `node_modules`, `db/*.sqlite*`, `public/uploads/*` — già in `.gitignore`).
2. Nel pannello Hostinger, sezione **Node.js**, crea una nuova applicazione collegata al repo (o fai il deploy via Git come per Tailwinds).
3. Imposta il **file di avvio** su `server.js` e la versione Node.js su 18+.
4. Imposta le variabili d'ambiente:
   - `ADMIN_EMAIL` — email del primo admin
   - `ADMIN_PASSWORD` — password del primo admin
   - `SESSION_SECRET` — una stringa lunga e casuale (obbligatoria in produzione)
   - `PORT` — di solito gestita automaticamente da Hostinger
5. Fai partire il build (`npm install`) e l'avvio (`npm start`).
6. Il database SQLite (`db/data.sqlite`) e gli upload (`public/uploads/`) vivono sul filesystem dell'app: assicurati che la cartella `db/` e `public/uploads/` siano scrivibili e **incluse nei backup** del piano Hostinger (non sono nel repo Git).

### Nota su SQLite in produzione
Va benissimo per un singolo team che usa l'app in modo non massivamente concorrente (come Tailwinds). Se in futuro cresce molto il numero di utenti simultanei in scrittura, si può migrare a MySQL (il DB incluso nei piani Hostinger) cambiando solo `db/init.js` e le query — la struttura di rotte/viste resta identica.

## Sicurezza da sistemare prima di andare online
- Cambia subito la password dell'admin di default.
- Imposta `SESSION_SECRET` a un valore casuale (non lasciare quello di default in `server.js`).
- Valuta di mettere il sito dietro HTTPS (Hostinger fornisce SSL gratuito) e impostare `cookie.secure = true` in `server.js` una volta attivo l'HTTPS.
