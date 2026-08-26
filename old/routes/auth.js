const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/init');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/app');
  }
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('login', { error: 'Email o password non corretti' });
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect(user.role === 'admin' ? '/admin' : '/app');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
