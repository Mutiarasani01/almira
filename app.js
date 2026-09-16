const defaultServices = [
  { id: 'copy-bw', name: 'Fotocopy B/W', unit: 'per lembar', price: 300, icon: '▤', impacts: [{ id: 'paper-a4', qty: 1 }] },
  { id: 'copy-color', name: 'Fotocopy warna', unit: 'per lembar', price: 1000, icon: '▧', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-color', qty: .02 }] },
  { id: 'print-bw', name: 'Print B/W', unit: 'per lembar', price: 500, icon: '⌁', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-black', qty: .01 }] },
  { id: 'print-color', name: 'Print warna', unit: 'per lembar', price: 1500, icon: '▣', impacts: [{ id: 'paper-a4', qty: 1 }, { id: 'ink-color', qty: .03 }] },
  { id: 'scan', name: 'Scan dokumen', unit: 'per file', price: 2000, icon: '⌕', impacts: [] },
  { id: 'binding', name: 'Jilid spiral', unit: 'per buku', price: 7000, icon: '▥', impacts: [{ id: 'cover', qty: 1 }, { id: 'plastic', qty: 1 }] }
];
const defaultInventory = [];
const STORAGE_KEY = 'almira-fotocopy-data-fallback';
const API_BASE = window.location.protocol === 'file:' ? '' : '/api';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let data = null;
let cart = {};
let activeStockFilter = 'all';
let modalMode = '';
let toastTimer;

function fallbackData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return { services: defaultServices, inventory: defaultInventory, transactions: [], nextReceipt: 1 };
}
async function loadData() {
  if (!API_BASE) {
    data = fallbackData();
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/state`);
    if (!response.ok) throw new Error('Backend belum aktif');
    data = await response.json();
  } catch (error) {
    data = fallbackData();
    showToast('Backend belum aktif, memakai data lokal sementara.');
  }
}
async function apiRequest(path, options = {}) {
  if (!API_BASE) {
    const method = options.method || 'GET';
    const payload = options.body ? JSON.parse(options.body) : {};
    if (method === 'POST' && path === '/inventory') {
      const name = String(payload.name || '').trim();
      const unit = String(payload.unit || '').trim();
      const stock = Number(payload.stock);
      const minimum = Number(payload.minimum);
      if (!name || !unit || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(minimum) || minimum < 0) throw new Error('Lengkapi data bahan dengan angka yang valid.');
      if (data.inventory.some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new Error('Bahan dengan nama tersebut sudah ada.');
      data.inventory.push({ id: `inventory-${Date.now()}`, name, unit, stock, minimum });
    } else if (method === 'DELETE' && path.startsWith('/inventory/')) {
      const id = path.split('/')[2];
      data.inventory = data.inventory.filter((item) => item.id !== id);
    } else if (method === 'POST' && path.startsWith('/inventory/') && path.endsWith('/restock')) {
      const id = path.split('/')[2];
      const item = data.inventory.find((entry) => entry.id === id);
      const amount = Number(payload.amount);
      if (!item || !Number.isInteger(amount) || amount < 1) throw new Error('Item atau jumlah stok tidak valid.');
      item.stock += amount;
    } else {
      throw new Error('Buka aplikasi melalui server untuk fitur ini.');
    }
    saveFallback();
    return { state: data };
  }
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Permintaan gagal.');
  return payload;
}
function saveFallback() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function money(value) { return `Rp ${Math.round(value).toLocaleString('id-ID')}`; }
function nowLabel(date = new Date()) { return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function showToast(message) { const toast = $('[data-toast]'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000); }
function setView(view) { $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view)); $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view)); $('[data-breadcrumb]').textContent = ({ overview: 'Ringkasan', cashier: 'Kasir', inventory: 'Stok bahan', services: 'Daftar harga' })[view]; window.scrollTo({ top: 0, behavior: 'smooth' }); if (view === 'overview') renderOverview(); if (view === 'inventory') renderInventory(); if (view === 'services') renderServicesAdmin(); }
function renderOverview() {
  const todayTransactions = data.transactions.filter((transaction) => transaction.date === todayKey());
  const revenue = todayTransactions.reduce((total, transaction) => total + transaction.total, 0);
  const lowStock = data.inventory.filter((item) => item.stock <= item.minimum);
  $('[data-today-revenue]').textContent = money(revenue);
  $('[data-today-count]').textContent = `${todayTransactions.length} transaksi hari ini`;
  $('[data-total-transactions]').textContent = data.transactions.length;
  $('[data-low-stock]').textContent = `${lowStock.length} item`;
  const recent = $('[data-recent-list]');
  recent.innerHTML = data.transactions.length ? data.transactions.slice(0, 5).map((transaction) => `<div class="transaction-row"><span class="transaction-icon">↗</span><div><strong>${transaction.items.map((item) => item.name).join(', ')}</strong><small>${transaction.time} · ${transaction.items.reduce((sum, item) => sum + item.quantity, 0)} item</small></div><b>${money(transaction.total)}</b></div>`).join('') : '<div class="empty-state">Belum ada transaksi. Yuk mulai dari kasir.</div>';
  const stockList = $('[data-low-stock-list]');
  stockList.innerHTML = lowStock.length ? lowStock.map((item) => `<div class="low-stock-item"><div><strong>${item.name}</strong><small>${item.stock} ${item.unit} tersisa</small></div><span class="stock-tag">restock</span></div>`).join('') : '<div class="empty-state">Semua stok masih aman ✦</div>';
}
function renderServices() {
  const grid = $('[data-service-grid]');
  $('[data-service-count]').textContent = `${data.services.length} layanan`;
  grid.innerHTML = data.services.map((service) => `<button class="service-option${cart[service.id] ? ' selected' : ''}" data-service-id="${service.id}"><span class="service-symbol">${service.icon}</span><strong>${service.name}</strong><small>${money(service.price)} ${service.unit}</small><span class="add-sign">${cart[service.id] ? cart[service.id] : '+'}</span></button>`).join('');
  $$('[data-service-id]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.serviceId)));
}
function renderReceipt() {
  const items = Object.entries(cart).map(([id, quantity]) => ({ service: data.services.find((item) => item.id === id), quantity })).filter((item) => item.service);
  const total = items.reduce((sum, item) => sum + item.service.price * item.quantity, 0);
  const itemsContainer = $('[data-receipt-items]');
  itemsContainer.innerHTML = items.length ? items.map(({ service, quantity }) => `<div class="receipt-item"><div><p>${service.name}</p><small>${money(service.price)} / ${service.unit.replace('per ', '')}</small></div><div class="item-right"><b>${money(service.price * quantity)}</b><div class="quantity-control"><button data-quantity="minus" data-id="${service.id}">−</button><span>${quantity}</span><button data-quantity="plus" data-id="${service.id}">＋</button></div></div></div>`).join('') : '<div class="empty-state">Pilih layanan<br />untuk mulai menghitung.</div>';
  $('[data-subtotal]').textContent = money(total); $('[data-total]').textContent = money(total);
  $$('[data-quantity]').forEach((button) => button.addEventListener('click', () => changeQuantity(button.dataset.id, button.dataset.quantity === 'plus' ? 1 : -1)));
  updateChange(total);
}
function addToCart(id) { cart[id] = (cart[id] || 0) + 1; renderServices(); renderReceipt(); }
function changeQuantity(id, difference) { cart[id] = (cart[id] || 0) + difference; if (cart[id] <= 0) delete cart[id]; renderServices(); renderReceipt(); }
function updateChange(total = getCartTotal()) { const payment = Number($('[data-payment]').value || 0); const change = payment - total; const row = $('[data-change]').parentElement; row.classList.toggle('insufficient', payment > 0 && change < 0); $('[data-change-label]').textContent = change < 0 && payment > 0 ? 'Kurang' : 'Kembalian'; $('[data-change]').textContent = money(Math.max(0, change)); }
function getCartTotal() { return Object.entries(cart).reduce((total, [id, quantity]) => total + (data.services.find((service) => service.id === id)?.price || 0) * quantity, 0); }
async function completeTransaction() {
  const total = getCartTotal(); const payment = Number($('[data-payment]').value || 0);
  if (!total) return showToast('Pilih minimal satu layanan dulu.');
  if (payment < total) return showToast(`Uangnya masih kurang ${money(total - payment)}.`);
  try {
    const payload = await apiRequest('/transactions', { method: 'POST', body: JSON.stringify({ payment, items: Object.entries(cart).map(([serviceId, quantity]) => ({ serviceId, quantity })) }) });
    data = payload.state; cart = {}; $('[data-payment]').value = ''; $('[data-receipt-number]').textContent = `#${String(data.nextReceipt).padStart(4, '0')}`; renderServices(); renderReceipt(); renderOverview(); showReceipt(payload.transaction); showToast(`Transaksi tersimpan. Kembalian ${money(payload.transaction.change)}.`);
  } catch (error) { showToast(error.message); }
}
function showReceipt(transaction) { $('[data-print-number]').textContent = transaction.receipt; $('[data-print-date]').textContent = `${transaction.date} · ${transaction.time}`; $('[data-print-items]').innerHTML = transaction.items.map((item) => `<div class="print-item"><div><span>${item.name}</span><small>${item.quantity} × ${money(item.price)}</small></div><b>${money(item.quantity * item.price)}</b></div>`).join(''); $('[data-print-total]').textContent = money(transaction.total); $('[data-print-payment]').textContent = money(transaction.payment); $('[data-print-change]').textContent = money(transaction.change); $('[data-receipt-modal]').hidden = false; }
function closeReceipt() { $('[data-receipt-modal]').hidden = true; }
function renderInventory() {
  const items = data.inventory.filter((item) => activeStockFilter === 'low' ? item.stock <= item.minimum : true);
  $('[data-inventory-count]').textContent = `${items.length} item`;
  $('[data-inventory-table]').innerHTML = items.map((item) => `<tr><td>${item.name}<small>${item.id}</small></td><td><b>${item.stock}</b> ${item.unit}</td><td>${item.minimum} ${item.unit}</td><td><span class="status ${item.stock <= item.minimum ? 'low' : 'safe'}">${item.stock <= item.minimum ? 'Perlu restock' : 'Aman'}</span></td><td><button class="table-action" data-restock="${item.id}">+ restock</button> <button class="table-action danger" data-delete-stock="${item.id}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Tidak ada item dalam filter ini.</div></td></tr>';
  $$('[data-restock]').forEach((button) => button.addEventListener('click', () => openStockModal(button.dataset.restock)));
  $$('[data-delete-stock]').forEach((button) => button.addEventListener('click', () => deleteInventoryItem(button.dataset.deleteStock)));
}
async function deleteInventoryItem(id) {
  const item = data.inventory.find((entry) => entry.id === id);
  if (!item || !confirm(`Hapus bahan "${item.name}"?`)) return;
  try {
    const payload = await apiRequest(`/inventory/${id}`, { method: 'DELETE' });
    data = payload.state;
    renderInventory();
    renderOverview();
    showToast(`${item.name} dihapus.`);
  } catch (error) { showToast(error.message); }
}
function renderServicesAdmin() { $('[data-service-admin]').innerHTML = data.services.map((service) => `<article class="admin-service"><div class="admin-service-head"><span class="service-symbol">${service.icon}</span><span class="count-label">${service.unit}</span></div><h3>${service.name}</h3><p>Bahan otomatis terpakai saat transaksi</p><strong>${money(service.price)}</strong><div class="service-actions"><button class="small-button" data-edit-service="${service.id}">Edit harga</button></div></article>`).join(''); $$('[data-edit-service]').forEach((button) => button.addEventListener('click', () => openServiceModal(button.dataset.editService))); }
function openModal(title, eyebrow, content, mode) { modalMode = mode; $('[data-modal-title]').textContent = title; $('[data-modal-eyebrow]').textContent = eyebrow; $('[data-modal-form]').innerHTML = content; $('[data-modal]').hidden = false; }
function closeModal() { $('[data-modal]').hidden = true; modalMode = ''; }
function openStockModal(id = '') {
  if (id) {
    openModal('Tambah stok', 'Persediaan', `<div class="form-field"><label for="stock-item">Bahan</label><select id="stock-item">${data.inventory.map((stockItem) => `<option value="${stockItem.id}" ${stockItem.id === id ? 'selected' : ''}>${stockItem.name}</option>`).join('')}</select></div><div class="form-field"><label for="stock-amount">Jumlah tambahan</label><input id="stock-amount" type="number" min="1" placeholder="Contoh: 50" /></div><button class="primary-button" type="submit">Simpan stok ↗</button>`, 'stock');
    return;
  }
  openModal('Tambah bahan', 'Persediaan', '<div class="form-field"><label for="inventory-name">Nama bahan</label><input id="inventory-name" placeholder="Contoh: Plastik laminasi" /></div><div class="form-field"><label for="inventory-unit">Satuan</label><input id="inventory-unit" placeholder="Contoh: pcs atau lembar" /></div><div class="form-field"><label for="inventory-stock">Stok awal</label><input id="inventory-stock" type="number" min="0" placeholder="Contoh: 50" /></div><div class="form-field"><label for="inventory-minimum">Batas minimum</label><input id="inventory-minimum" type="number" min="0" placeholder="Contoh: 10" /></div><button class="primary-button" type="submit">Simpan bahan ↗</button>', 'inventory-add');
}
function openServiceModal(id = '') { const service = data.services.find((item) => item.id === id); openModal(service ? 'Edit harga' : 'Tambah layanan', 'Katalog harga', `<div class="form-field"><label for="service-name">Nama layanan</label><input id="service-name" value="${service?.name || ''}" placeholder="Contoh: Laminasi" ${service ? 'disabled' : ''} /></div><div class="form-field"><label for="service-price">Harga per unit</label><input id="service-price" type="number" min="0" value="${service?.price || ''}" placeholder="Contoh: 2000" /></div><div class="form-field"><label for="service-unit">Satuan</label><input id="service-unit" value="${service?.unit || 'per lembar'}" placeholder="per lembar" /></div><button class="primary-button" type="submit">Simpan layanan ↗</button>`, service ? `service-edit:${id}` : 'service-add'); }
async function handleModalSubmit(event) { event.preventDefault(); try { if (modalMode === 'stock') { const id = $('#stock-item').value; const amount = Number($('#stock-amount').value); if (!amount || amount < 1) return showToast('Masukkan jumlah stok yang valid.'); const payload = await apiRequest(`/inventory/${id}/restock`, { method: 'POST', body: JSON.stringify({ amount }) }); data = payload.state; const item = data.inventory.find((stockItem) => stockItem.id === id); renderInventory(); renderOverview(); closeModal(); showToast(`${item.name} bertambah ${amount} ${item.unit}.`); } else if (modalMode.startsWith('service-edit')) { const id = modalMode.split(':')[1]; const payload = await apiRequest(`/services/${id}`, { method: 'PATCH', body: JSON.stringify({ price: Number($('#service-price').value), unit: $('#service-unit').value }) }); data = payload.state; renderServicesAdmin(); renderServices(); closeModal(); showToast('Harga layanan diperbarui.'); } else if (modalMode === 'service-add') { const name = $('#service-name').value.trim(); const price = Number($('#service-price').value); if (!name || !price) return showToast('Lengkapi nama dan harga layanan.'); const payload = await apiRequest('/services', { method: 'POST', body: JSON.stringify({ name, price, unit: $('#service-unit').value || 'per item' }) }); data = payload.state; renderServicesAdmin(); renderServices(); closeModal(); showToast('Layanan baru ditambahkan.'); } } catch (error) { showToast(error.message); } }
async function handleModalSubmit(event) { event.preventDefault(); try { if (modalMode === 'stock') { const id = $('#stock-item').value; const amount = Number($('#stock-amount').value); if (!amount || amount < 1) return showToast('Masukkan jumlah stok yang valid.'); const payload = await apiRequest(`/inventory/${id}/restock`, { method: 'POST', body: JSON.stringify({ amount }) }); data = payload.state; const item = data.inventory.find((stockItem) => stockItem.id === id); renderInventory(); renderOverview(); closeModal(); showToast(`${item.name} bertambah ${amount} ${item.unit}.`); } else if (modalMode === 'inventory-add') { const name = $('#inventory-name').value.trim(); const unit = $('#inventory-unit').value.trim(); const stock = Number($('#inventory-stock').value); const minimum = Number($('#inventory-minimum').value); if (!name || !unit || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(minimum) || minimum < 0) return showToast('Lengkapi data bahan dengan angka yang valid.'); const payload = await apiRequest('/inventory', { method: 'POST', body: JSON.stringify({ name, unit, stock, minimum }) }); data = payload.state; renderInventory(); renderOverview(); closeModal(); showToast('Bahan baru ditambahkan.'); } else if (modalMode.startsWith('service-edit')) { const id = modalMode.split(':')[1]; const payload = await apiRequest(`/services/${id}`, { method: 'PATCH', body: JSON.stringify({ price: Number($('#service-price').value), unit: $('#service-unit').value }) }); data = payload.state; renderServicesAdmin(); renderServices(); closeModal(); showToast('Harga layanan diperbarui.'); } else if (modalMode === 'service-add') { const name = $('#service-name').value.trim(); const price = Number($('#service-price').value); if (!name || !price) return showToast('Lengkapi nama dan harga layanan.'); const payload = await apiRequest('/services', { method: 'POST', body: JSON.stringify({ name, price, unit: $('#service-unit').value || 'per item' }) }); data = payload.state; renderServicesAdmin(); renderServices(); closeModal(); showToast('Layanan baru ditambahkan.'); } } catch (error) { showToast(error.message); } }

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-view-target]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewTarget)));
$('[data-go-cashier]').addEventListener('click', () => setView('cashier'));
$('[data-complete]').addEventListener('click', completeTransaction);
$('[data-payment]').addEventListener('input', () => updateChange());
$('[data-add-stock]').addEventListener('click', () => openStockModal());
$('[data-add-service]').addEventListener('click', () => openServiceModal());
$('[data-modal-form]').addEventListener('submit', handleModalSubmit);
$('[data-close]').addEventListener('click', closeModal);
$('[data-modal]').addEventListener('click', (event) => { if (event.target === $('[data-modal]')) closeModal(); });
$('[data-receipt-modal]').addEventListener('click', (event) => { if (event.target === $('[data-receipt-modal]')) closeReceipt(); });
$$('[data-receipt-close]').forEach((button) => button.addEventListener('click', closeReceipt));
$('[data-print]').addEventListener('click', () => window.print());
$$('[data-stock-filter]').forEach((button) => button.addEventListener('click', () => { activeStockFilter = button.dataset.stockFilter; $$('[data-stock-filter]').forEach((tab) => tab.classList.toggle('active', tab === button)); renderInventory(); }));
$('[data-reset]').addEventListener('click', async () => { if (!confirm('Reset semua transaksi dan stok ke data demo?')) return; try { const payload = await apiRequest('/reset', { method: 'POST' }); data = payload.state; cart = {}; renderOverview(); renderServices(); renderReceipt(); renderInventory(); renderServicesAdmin(); showToast('Data demo dikembalikan.'); } catch (error) { showToast(error.message); } });
$('[data-today]').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
$('[data-modal]').hidden = true;
async function bootstrap() { await loadData(); $('[data-receipt-number]').textContent = `#${String(data.nextReceipt).padStart(4, '0')}`; renderOverview(); renderServices(); renderReceipt(); renderInventory(); renderServicesAdmin(); }
bootstrap();
