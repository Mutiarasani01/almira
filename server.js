const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const defaultData = {
  services: [
    { id: 'copy-bw', name: 'Fotocopy B/W', unit: 'per lembar', price: 300, icon: '▤', impacts: [{ id: 'paper-a4', qty: 1 }] },
    { id: 'copy-color', name: 'Fotocopy warna', unit: 'per lembar', price: 1000, icon: '▧', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-color', qty: .02 }] },
    { id: 'print-bw', name: 'Print B/W', unit: 'per lembar', price: 500, icon: '⌁', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-black', qty: .01 }] },
    { id: 'print-color', name: 'Print warna', unit: 'per lembar', price: 1500, icon: '▣', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-color', qty: .03 }] },
    { id: 'scan', name: 'Scan dokumen', unit: 'per file', price: 2000, icon: '⌕', impacts: [] },
    { id: 'binding', name: 'Jilid spiral', unit: 'per buku', price: 7000, icon: '▥', impacts: [{ id: 'cover', qty: 1 }, { id: 'plastic', qty: 1 }] }
  ],
  inventory: [],
  transactions: [],
  nextReceipt: 1
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) writeStore(defaultData);
}
function readStore() { ensureStore(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeStore(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)); }
function sendFile(res, filePath) { const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }; const extension = path.extname(filePath); res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' }); fs.createReadStream(filePath).pipe(res); }
function body(request) { return new Promise((resolve, reject) => { let raw = ''; request.on('data', (chunk) => { raw += chunk; if (raw.length > 1e6) request.destroy(); }); request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON tidak valid')); } }); request.on('error', reject); }); }
function dateKey() { return new Date().toISOString().slice(0, 10); }
function timeLabel() { return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date()); }

async function handleApi(request, res, pathname) {
  try {
    if (request.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'almira-fotocopy' });
    if (request.method === 'GET' && pathname === '/api/state') return json(res, 200, readStore());
    if (request.method === 'POST' && pathname === '/api/transactions') {
      const payload = await body(request);
      const store = readStore();
      if (!Array.isArray(payload.items) || !payload.items.length || !Number.isFinite(payload.payment)) return json(res, 400, { error: 'Data transaksi belum lengkap.' });
      const items = payload.items.map((item) => { const service = store.services.find((entry) => entry.id === item.serviceId); return service ? { service, quantity: Number(item.quantity) } : null; });
      if (items.some((item) => !item || !Number.isInteger(item.quantity) || item.quantity < 1)) return json(res, 400, { error: 'Layanan atau jumlah tidak valid.' });
      const total = items.reduce((sum, item) => sum + item.service.price * item.quantity, 0);
      if (payload.payment < total) return json(res, 400, { error: `Uang kurang Rp ${(total - payload.payment).toLocaleString('id-ID')}.` });
      items.forEach(({ service, quantity }) => service.impacts.forEach((impact) => { const stock = store.inventory.find((entry) => entry.id === impact.id); if (stock) stock.stock = Math.max(0, stock.stock - impact.qty * quantity); }));
      const transaction = { id: store.nextReceipt, receipt: `#${String(store.nextReceipt).padStart(4, '0')}`, date: dateKey(), time: timeLabel(), total, payment: payload.payment, change: payload.payment - total, items: items.map(({ service, quantity }) => ({ id: service.id, name: service.name, quantity, price: service.price })) };
      store.nextReceipt += 1; store.transactions.unshift(transaction); writeStore(store); return json(res, 201, { transaction, state: store });
    }
    if (request.method === 'POST' && pathname.startsWith('/api/inventory/') && pathname.endsWith('/restock')) {
      const id = pathname.split('/')[3]; const payload = await body(request); const amount = Number(payload.amount); const store = readStore(); const item = store.inventory.find((entry) => entry.id === id);
      if (!item || !Number.isInteger(amount) || amount < 1) return json(res, 400, { error: 'Item atau jumlah stok tidak valid.' }); item.stock += amount; writeStore(store); return json(res, 200, { state: store });
    }
    if (request.method === 'POST' && pathname === '/api/inventory') {
      const payload = await body(request); const store = readStore(); const name = String(payload.name || '').trim(); const unit = String(payload.unit || '').trim(); const stock = Number(payload.stock); const minimum = Number(payload.minimum);
      if (!name || !unit || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(minimum) || minimum < 0) return json(res, 400, { error: 'Nama, satuan, stok awal, dan batas minimum wajib valid.' });
      if (store.inventory.some((item) => item.name.toLowerCase() === name.toLowerCase())) return json(res, 409, { error: 'Bahan dengan nama tersebut sudah ada.' });
      store.inventory.push({ id: `inventory-${crypto.randomUUID()}`, name, unit, stock, minimum }); writeStore(store); return json(res, 201, { state: store });
    }
    if (request.method === 'DELETE' && pathname.startsWith('/api/inventory/')) {
      const id = pathname.split('/')[3]; const store = readStore(); const index = store.inventory.findIndex((item) => item.id === id);
      if (index === -1) return json(res, 404, { error: 'Bahan tidak ditemukan.' });
      store.inventory.splice(index, 1); writeStore(store); return json(res, 200, { state: store });
    }
    if (request.method === 'POST' && pathname === '/api/services') {
      const payload = await body(request); const store = readStore(); const name = String(payload.name || '').trim(); const price = Number(payload.price); if (!name || !Number.isFinite(price) || price < 0) return json(res, 400, { error: 'Nama dan harga layanan wajib diisi.' });
      store.services.push({ id: `service-${crypto.randomUUID()}`, name, price, unit: payload.unit || 'per item', icon: '✦', impacts: [] }); writeStore(store); return json(res, 201, { state: store });
    }
    if (request.method === 'PATCH' && pathname.startsWith('/api/services/')) {
      const id = pathname.split('/')[3]; const payload = await body(request); const store = readStore(); const service = store.services.find((entry) => entry.id === id); if (!service) return json(res, 404, { error: 'Layanan tidak ditemukan.' });
      if (payload.name !== undefined && String(payload.name).trim()) service.name = String(payload.name).trim(); if (payload.price !== undefined && Number.isFinite(Number(payload.price)) && Number(payload.price) >= 0) service.price = Number(payload.price); if (payload.unit) service.unit = String(payload.unit); writeStore(store); return json(res, 200, { state: store });
    }
    if (request.method === 'DELETE' && pathname.startsWith('/api/services/')) {
      const id = pathname.split('/')[3]; const store = readStore(); const index = store.services.findIndex((entry) => entry.id === id);
      if (index === -1) return json(res, 404, { error: 'Layanan tidak ditemukan.' });
      store.services.splice(index, 1); writeStore(store); return json(res, 200, { state: store });
    }
    if (request.method === 'POST' && pathname === '/api/reset') { writeStore(defaultData); return json(res, 200, { state: readStore() }); }
    return json(res, 404, { error: 'Endpoint tidak ditemukan.' });
  } catch (error) { return json(res, 500, { error: error.message || 'Terjadi kesalahan server.' }); }
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname.startsWith('/api/')) return handleApi(request, response, pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(response, 404, { error: 'Halaman tidak ditemukan.' });
  sendFile(response, filePath);
});

ensureStore();
server.listen(PORT, () => console.log(`Almira Fotocopy berjalan di http://localhost:${PORT}`));
