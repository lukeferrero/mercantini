// Express 4 non inoltra automaticamente le eccezioni/promise rejection di
// handler async al middleware di errore: bisogna farlo esplicitamente.
// Uso: router.get('/x', asyncHandler(async (req, res) => { ... }))
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
