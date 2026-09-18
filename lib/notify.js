const { run } = require('../db/db');

function notify(userId, text, link = '') {
  if (!userId) return;
  run('INSERT INTO notifications (user_id, text, link) VALUES (?, ?, ?)', [userId, text, link]);
}

module.exports = { notify };