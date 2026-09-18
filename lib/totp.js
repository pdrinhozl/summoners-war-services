const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += BASE32[parseInt(chunk, 2)];
  }
  return out.replace(/=+$/, '');
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function base32ToBuffer(secret) {
  const clean = String(secret).toUpperCase().replace(/\s+/g, '').replace(/=+$/, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32ToBuffer(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1000000).toString().padStart(6, '0');
}

function totp(secret, timeStep = 30) {
  return hotp(secret, Math.floor(Date.now() / 1000 / timeStep));
}

function verify(secret, code, window = 1, timeStep = 30) {
  const provided = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(provided)) return false;
  const current = Math.floor(Date.now() / 1000 / timeStep);
  for (let i = -window; i <= window; i++) {
    if (totpAt(secret, current + i, timeStep) === provided) return true;
  }
  return false;
}

function totpAt(secret, counter, timeStep) {
  return hotp(secret, counter * timeStep);
}

function otpauthUri(secret, account, issuer = 'Runa Nivel 5') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, totp, verify, otpauthUri, base32ToBuffer };