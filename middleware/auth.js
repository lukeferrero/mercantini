function requireLogin(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autenticato' });
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autenticato' });
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Permesso negato' });
      return res.status(403).render('error', { message: 'Permesso negato' });
    }
    next();
  };
}

// editor e admin possono scrivere; viewer solo leggere
function requireWrite(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autenticato' });
    return res.redirect('/login');
  }
  if (!['admin', 'editor'].includes(req.session.user.role)) {
    return res.status(403).json({ error: 'Sola lettura per il tuo ruolo' });
  }
  next();
}

module.exports = { requireLogin, requireRole, requireWrite };
