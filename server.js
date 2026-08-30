const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const db = require('./db/init'); // avvia schema + seed + admin di default (async, vedi db.ready)
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const appRoutes = require('./routes/app');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Finché db.ready non si risolve (o se fallisce), risponde subito con un
// messaggio chiaro invece di lasciare le richieste in attesa di una
// connessione al database che potrebbe non arrivare mai.
app.use((req, res, next) => {
  db.ready
    .then(() => next())
    .catch(() => res.status(503).send('Database non disponibile: controlla le variabili di connessione (DATABASE_URL o DB_HOST/DB_USER/DB_PASSWORD/DB_NAME) e riprova.'));
});

function sessionStoreOptions() {
  if (process.env.DATABASE_URL) {
    // express-mysql-session non legge le connection string: le scompongo.
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

const sessionStore = new MySQLStore({ ...sessionStoreOptions(), createDatabaseTable: true });

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'cambia-questo-secret-in-produzione',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 giorni
}));

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/app', appRoutes);

app.get('/', (req, res) => {
  if (req.session.user && req.session.user.role === 'admin') return res.redirect('/admin');
  res.redirect('/app');
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Pagina non trovata' });
});

// Middleware di errore: cattura le eccezioni/rejection inoltrate da asyncHandler
// (Express 4 non lo fa automaticamente per gli handler async).
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/app/') && req.headers['content-type'] === 'application/json') {
    return res.status(500).json({ error: 'Errore del server' });
  }
  res.status(500).render('error', { message: 'Si è verificato un errore imprevisto.' });
});

// IMPORTANTE: listen() viene chiamato subito, senza aspettare il database.
// Hostinger richiede che l'app chiami listen() entro pochi secondi dall'avvio,
// e un database lento/irraggiungibile non deve far sembrare l'app "non partita"
// (mascherando così il vero errore di connessione nei log).
app.listen(PORT, () => {
  console.log(`Reno Manager avviato su http://localhost:${PORT}`);
});

db.ready
  .then(() => console.log('[init] Database pronto: le richieste verranno servite normalmente.'))
  .catch((err) => {
    console.error('[init] Inizializzazione database fallita:', err.message);
  });
