const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const db = require('./db/init'); // inizializza schema + admin di default
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

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
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

app.listen(PORT, () => {
  console.log(`Reno Manager avviato su http://localhost:${PORT}`);
});
