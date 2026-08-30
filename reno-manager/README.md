# Reno Manager

Tool per la gestione della ristrutturazione di appartamenti: progetti → unità immobiliari → stanze, con campi configurabili per tipo stanza e catalogo opzioni (con foto e fornitore) gestito dal backend.

## Ruoli
- **admin**: accede a `/admin` (backend) e a `/app` (frontend). Gestisce progetti, unità, stanze, tipi di stanza, campi, utenti e catalogo opzioni.
- **editor**: accede solo a `/app`, può modificare i campi delle stanze.
- **viewer**: accede solo a `/app`, sola lettura.

## Database: MySQL (non più SQLite)

**Importante**: da questa versione il database è MySQL, non più un file SQLite locale. Su hosting gestito come quello di Hostinger, un file scritto dentro la cartella dell'app NON è garantito persistente tra un deploy e l'altro — è quello che ha causato la perdita dei dati di produzione. MySQL vive fuori dal filesystem dell'app e sopravvive a qualsiasi redeploy.

### Creare il database su Hostinger
1. hPanel → Database → **MySQL**, crea un nuovo database e un utente con tutti i privilegi su di esso.
2. Prendi nota di host, porta (di solito 3306), nome utente, password e nome del database.
3. Nel pannello dell'app Node.js, sezione **Database Connect Wizard** (o Variabili d'ambiente), imposta le variabili — vedi sotto.

### Variabili d'ambiente richieste
Una delle due alternative:

- `DATABASE_URL` — es. `mysql://utente:password@host:3306/nome_database`

oppure, singolarmente:
- `DB_HOST`
- `DB_PORT` (default 3306)
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Più, come prima:
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — credenziali del primo admin (creato automaticamente al primo avvio)
- `SESSION_SECRET` — stringa lunga e casuale, obbligatoria in produzione
- `PORT` — di solito gestita da Hostinger

Al primo avvio, l'app crea da sola tutte le tabelle e popola tipi di stanza/campi/catalogo di base — non serve eseguire script SQL a mano.

## Avvio in locale

```bash
npm install
DATABASE_URL=mysql://utente:password@localhost:3306/reno_manager \
ADMIN_EMAIL=admin@tuodominio.it ADMIN_PASSWORD=scegli-una-password \
npm start
```

Serve un server MySQL/MariaDB raggiungibile (locale o remoto) con il database già creato (vuoto va bene, le tabelle le crea l'app).

## Struttura

```
config/roomFields.js    -> definizione di partenza dei campi per tipo di stanza (usata solo per il seed iniziale)
config/itemCatalog.js   -> voci di catalogo di partenza (usata solo per il seed iniziale)
config/fieldTypes.js    -> tipi di controllo disponibili per i campi creati da pannello
db/schema.sql            -> schema del database MySQL
db/init.js                -> connessione, creazione schema, seed iniziale, admin di default
services/fields.js         -> lettura campi dinamici e valori salvati (stanze + unità)
services/projects.js        -> risalita al progetto di una unità/stanza (per il banner)
routes/admin.js            -> backend (solo admin): progetti, unità, tipi di stanza, campi, catalogo, utenti
routes/app.js                -> frontend (editor/viewer): form dinamico di unità e stanze
routes/auth.js                -> login/logout
views/                          -> template EJS
public/uploads/                  -> foto del catalogo, immagini progetto, PDF caricati
```

## Personalizzare tipi di stanza, campi e catalogo

Non serve più toccare il codice: dal backend puoi creare nuovi **tipi di stanza** (Backend → Tipi di stanza), aggiungere **campi personalizzati** sia per un tipo di stanza sia per le **caratteristiche unità** (Backend → Caratteristiche unità), scegliendo tra 14 tipi di controllo (selezione da catalogo con foto, sì/no, numero, note+PDF, ecc.), e gestire il **catalogo opzioni** (con foto e fornitore) da Backend → Catalogo.

## Immagine del progetto

Da Backend → [progetto] puoi caricare un'immagine che resta visibile in cima a tutte le pagine di quel progetto (unità e stanze, sia backend sia frontend).

## Deploy su Hostinger (Node.js hosting)

1. Crea un repo GitHub con questo codice (escludi `node_modules`, `public/uploads/*` — già in `.gitignore`; non c'è più alcun file di database da escludere, vive su MySQL).
2. Crea il database MySQL su hPanel (vedi sopra) prima del primo deploy.
3. Nel pannello Hostinger, sezione **Node.js**, crea/aggiorna l'applicazione collegata al repo. File di avvio: `server.js`. Node.js 18+.
4. Imposta le variabili d'ambiente elencate sopra (`DATABASE_URL` o `DB_*`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`).
5. Fai partire il build (`npm install`) e l'avvio (`npm start`). Controlla i log: dovresti vedere `[init] Database MySQL pronto.`
6. `public/uploads/` (foto catalogo, immagini progetto, PDF) vive ancora sul filesystem dell'app e **non è garantito persistente tra un deploy e l'altro** su questo tipo di hosting — è un rischio residuo di cui tenere conto: se serve renderlo definitivamente sicuro, il passo successivo è spostare anche gli upload su uno storage esterno persistente.

## Sicurezza da sistemare prima di andare online
- Cambia subito la password dell'admin di default.
- Imposta `SESSION_SECRET` a un valore casuale (non lasciare quello di default in `server.js`).
- Valuta di mettere il sito dietro HTTPS (Hostinger fornisce SSL gratuito) e impostare `cookie.secure = true` in `server.js` una volta attivo l'HTTPS.
