function crc16Ccitt(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}

function buildPayload(options) {
  const {
    key,
    amount,
    name = 'Runa Nivel 5',
    city = 'Sao Paulo',
    txid = '***',
  } = options || {};

  if (!key) throw new Error('Chave Pix não configurada.');

  const cleanName = String(name).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25);
  const cleanCity = String(city).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15);
  const cleanTxid = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const amt = (Number(amount) || 0).toFixed(2);

  let p = '000201';
  p += emv('01', '11');
  p += emv('26', emv('00', 'BR.GOV.BCB.PIX') + emv('01', key));
  p += '52040000';
  p += '5303986';
  p += emv('54', amt);
  p += '5802BR';
  p += emv('59', cleanName);
  p += emv('60', cleanCity);
  p += emv('62', emv('05', cleanTxid));
  p += '6304';
  p += crc16Ccitt(p);

  return p;
}

function generateTxid(orderId) {
  return 'RN5' + String(orderId).padStart(6, '0');
}

module.exports = { buildPayload, generateTxid, crc16Ccitt, emv };