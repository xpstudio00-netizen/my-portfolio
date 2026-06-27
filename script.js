/**
 * MEDICHEN Warehouse & Dashboard - Frontend Script
 * ✨ อัปเดตแก้บั๊กตัวแปร Undefined และเพิ่มระบบ Auto-Forward ไปคิวจัดส่งเมื่อกดยืนยันออเดอร์
 */

const API_URL = "https://script.google.com/macros/s/AKfycbzUSfC0UMS1rLJTpVBbL1koAKUkHZcLIlQvLz98J2UzSwFUo-2sdqckWaiXNoEGgWJd/exec"; 

let state = { stock: [], purchase: [], shipping: [], line: [] };
let stockChartInstance = null;
let dynamicChartInstance = null; 
let isEditing = false; 
let currentDashboardType = null;
let previousLineCount = 0;
let lastNewOrderCount = 0;
let currentLineEditingIndex = null; // ตัวแปรใหม่สำหรับดักจับสถานะก่อนหน้า

document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener(
        'click',
        () => {
            const audio = document.getElementById('notification-sound');
            if(audio){
                audio.play()
                .then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                })
                .catch(() => {});
            }
        },
        { once:true }
    );

    // 🔑 ระบบ Simple Login (ข้ามได้ถ้ารหัสตรง)
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const email = document.getElementById('loginUser').value.trim();
            const pass = document.getElementById('loginPass').value.trim();
            if (email === "admin@medichen.com" && pass === "123456") {
                document.getElementById('loginPage').style.display = 'none';
                showToast('success', 'เข้าสู่ระบบสำเร็จ', 'ยินดีต้อนรับเข้าสู่ระบบ MEDICHEN');
            } else {
                showToast('error', 'เข้าสู่ระบบล้มเหลว', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
            }
        });
    }

    fetchAllData();
    setInterval(() => {
        if (!isEditing) fetchAllData();
    }, 5000);
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    if(targetTab) targetTab.classList.add('active');
    
    const sidebarButtons = document.querySelectorAll('.sidebar-menu .menu-item');
    sidebarButtons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });
    
    if (tabId === 'dashboard') {
        const defaultView = document.getElementById('dashboard-default-view');
        const listContainer = document.getElementById('dashboard-list-container');
        if (defaultView) defaultView.style.display = 'block';
        if (listContainer) listContainer.style.display = 'none';
        currentDashboardType = null;
        renderDashboard(); 
    } else {
        currentDashboardType = null;
    }
    
    const titles = { dashboard: '📊 แดชบอร์ด', line: '📱 ออเดอร์จาก LINE', stock: '📦 คลังสินค้า', purchase: '🛒 รายการสั่งซื้อ', shipping: '🚚 รายการจัดส่ง' };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.innerText = titles[tabId];
}

function getStatusBadge(status) {
    const safeStatus = status || 'ไม่มีสถานะ';
    if (['ปกติ', 'จ่ายแล้ว', 'จัดส่งเสร็จแล้ว', 'ยืนยันออเดอร์'].includes(safeStatus)) return `<span class="badge badge-success">${safeStatus}</span>`;
    if (['ใกล้หมด', 'รอโอน', 'จัดส่ง', 'กำลังจัดส่ง', 'รอระบุข้อมูล'].includes(safeStatus)) return `<span class="badge badge-warning">${safeStatus}</span>`;
    if (['ออเดอร์ใหม่'].includes(safeStatus)) return `<span class="badge badge-line">${safeStatus}</span>`;
    return `<span class="badge badge-danger">${safeStatus}</span>`;
}

async function fetchAllData() {
    try {
        const [stkRes, purRes, shpRes, lineRes] = await Promise.all([
            callAPI('getStock'),
            callAPI('getPurchase'),
            callAPI('getShipping'),
            callAPI('getLineOrders')
        ]);

        if (stkRes.status === 'success') state.stock = stkRes.data;
        if (purRes.status === 'success') state.purchase = purRes.data;
        if (shpRes.status === 'success') state.shipping = shpRes.data;
        if (lineRes.status === 'success') state.line = lineRes.data;

        renderDashboard();
        renderLineTable();
        renderStockTable();
        renderPurchaseTable();
        renderShippingTable();
        updateNotificationBell();
        
        if (currentDashboardType) {
            showDashboardList(currentDashboardType);
        }
    } catch (err) {
        console.error("Data Fetch Error: ", err);
    }
}

async function callAPI(action, data = {}) {
    const response = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, data })
    });
    return await response.json();
}

// 🛠️ แก้ไขการดึงตัวแปรให้ตรงกับฐานข้อมูลหลังบ้าน
function renderLineTable() {
    const tbody = document.querySelector('#table-line tbody');
    if (!tbody) return;
    tbody.innerHTML = state.line.map((i, index) => {
        // แก้การแมปปิ้งตัวแปรให้ตรงกับ Apps Script ที่ส่งมา
        const dateDisplay = i.confirmDate || 'รอระบุ';
        const itemDisplay = i.items || i.product || '-';
        const amountDisplay = i.totalAmount && i.totalAmount !== '0' ? parseInt(i.totalAmount).toLocaleString() + ' บ.' : '-';
        const destinationDisplay = i.hospitalName || i.address || '-';

        return `
        <tr>
            <td>${i.id}</td>
            <td>${dateDisplay}</td>
            <td style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><b>${itemDisplay}</b></td>
            <td>-</td>
            <td>${amountDisplay}</td>
            <td>${destinationDisplay}</td>
            <td>${getStatusBadge(i.status || 'ออเดอร์ใหม่')}</td>
            <td>
                <button class="btn btn-primary" onclick="openLineModal(${index})">📝 แยกข้อมูล / ดู</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteLineOrder', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `}).join('');
}

function openLineModal(index) {
    isEditing = true; 
    currentLineEditingIndex = index; // จำไว้ว่ากำลังแก้ไขรายการไหนอยู่
    const item = state.line[index];
    if (!item) return;

    // โหลดข้อมูลใส่ Form ฟิลด์ต่างๆ โดยใช้ Key ที่ถูกต้อง
    document.getElementById('edit-line-id').value = item.id;
    document.getElementById('edit-line-date').value = formatSafeDate(item.confirmDate || '');
    document.getElementById('edit-line-price').value = item.totalAmount || '';
    document.getElementById('edit-line-destination').value = item.hospitalName || item.address || '';
    document.getElementById('edit-line-status').value = item.status || 'ออเดอร์ใหม่';
    document.getElementById('edit-line-company').value = ''; // ขนส่งเป็นข้อมูลใหม่ ต้องกรอกเพิ่มเอง
    document.getElementById('edit-line-product').value = item.items || item.product || ''; 

    // แตกแถวสินค้าไดนามิก
    const container = document.getElementById('modal-dynamic-items-container');
    if (container) {
        container.innerHTML = ''; 
        const rawProductText = item.items || item.product || '';
        
        if (rawProductText) {
            const lines = rawProductText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            lines.forEach(line => {
                let cleanLine = line.replace(/^\d+[\.\s\-:\)]+\s*/, '').trim();
                let name = cleanLine;
                let qty = '';
                let unit = '';

                let matchQuantity = cleanLine.match(/(.*?)\s+จำนวน\s*([\d\.,]+)\s*(\S*)/i);
                if (matchQuantity) {
                    name = matchQuantity[1].trim();
                    qty = matchQuantity[2].trim();
                    unit = matchQuantity[3].trim();
                } else {
                    let matchSimple = cleanLine.match(/(.*?)\s+([\d\.,]+)\s*([^\d\s\.,]+)$/);
                    if (matchSimple) {
                        name = matchSimple[1].trim();
                        qty = matchSimple[2].trim();
                        unit = matchSimple[3].trim();
                    }
                }
                if (typeof addModalItemRow === 'function') {
                    addModalItemRow(name, qty, unit);
                }
            });
        }
        if (typeof checkModalItemsCount === 'function') {
            checkModalItemsCount();
        }
    }

    document.getElementById('line-modal').style.display = 'flex';
}

function closeLineModal() {
    document.getElementById('line-modal').style.display = 'none';
    document.getElementById('form-edit-line').reset();
    const container = document.getElementById('modal-dynamic-items-container');
    if (container) container.innerHTML = '';
    isEditing = false;
    currentLineEditingIndex = null;
}

// 💾 บันทึกและ Auto-Forward ส่งเข้าคิวจัดส่ง
async function saveLineOrderEdit(event) {
    event.preventDefault();
    
    const rows = document.querySelectorAll('.modal-dynamic-product-row');
    let combinedItemsArray = [];

    rows.forEach((row, index) => {
        const name = row.querySelector('.modal-input-item-name').value.trim();
        const qty = row.querySelector('.modal-input-item-qty').value.trim();
        const unit = row.querySelector('.modal-input-item-unit').value.trim();
        
        if (name) {
            let itemString = name;
            if (qty) itemString += ` จำนวน ${qty}`;
            if (unit) itemString += ` ${unit}`;
            
            combinedItemsArray.push(`${index + 1}. ${itemString}`);
        }
    });

    const formattedItemsString = combinedItemsArray.join('\n');
    const newStatus = document.getElementById('edit-line-status').value;
    const confirmDateVal = document.getElementById('edit-line-date').value;
    const destinationVal = document.getElementById('edit-line-destination').value;
    const companyVal = document.getElementById('edit-line-company').value;

    let payload = {
        id: document.getElementById('edit-line-id').value,
        confirmDate: confirmDateVal,
        items: formattedItemsString, 
        totalAmount: document.getElementById('edit-line-price').value,
        hospitalName: destinationVal,
        status: newStatus
    };

    const prevStatus = state.line[currentLineEditingIndex].status;
    const loadingToast = showToast('loading', 'กำลังบันทึกข้อมูล', 'กรุณารอสักครู่...');

    try {
        // ✨ Auto-Forward Logic: ถ้ายืนยันออเดอร์ (และก่อนหน้านี้ยังไม่ได้ยืนยัน) ให้ยิงเข้าคิวจัดส่งให้เลย
        if (newStatus === 'ยืนยันออเดอร์' && prevStatus !== 'ยืนยันออเดอร์') {
            await callAPI('addShipping', {
                date: confirmDateVal || new Date().toISOString().split('T')[0],
                product: formattedItemsString,
                company: companyVal || 'รอระบุขนส่ง',
                destination: destinationVal || 'รอระบุปลายทาง',
                status: 'เตรียมสินค้า'
            });
        }

        // อัปเดตข้อมูลในตาราง LINE Orders
        const res = await callAPI('updateLineOrder', payload);
        loadingToast.remove();

        if (res.status === 'success') {
            closeLineModal();
            await fetchAllData();
            showToast('success', 'บันทึกสำเร็จ', 'อัปเดตและคัดแยกออเดอร์เรียบร้อยแล้ว');
        } else {
            showToast('error', 'เกิดข้อผิดพลาด', res.message);
        }
    } catch (error) {
        loadingToast.remove();
        showToast('error', 'เชื่อมต่อล้มเหลว', error.message);
    }
}

function showDashboardList(type) {
    currentDashboardType = type;
    const defaultView = document.getElementById('dashboard-default-view');
    if (defaultView) defaultView.style.display = 'none';

    const container = document.getElementById('dashboard-list-container');
    if (!container) return;

    container.style.display = 'block'; 
    let html = '';
    
    if (type === 'stock') {
        html = `
            <div class="card" style="margin-bottom: 20px;">
                <h3>📊 กราฟสรุปจำนวนคลังวัตถุดิบ</h3>
                <canvas id="dynamicStockChart" style="max-height: 300px;"></canvas>
            </div>
            <div class="card">
                <h3>📦 รายการคลังวัตถุดิบ</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>ชื่อสินค้า</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.stock.map(i => `<tr><td>${i.product}</td><td>${i.qty} ${i.unit}</td><td>${getStatusBadge(i.status || 'ปกติ')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
        renderDynamicChart(); 
    } else if (type === 'purchase') {
        html = `
            <div class="card">
                <h3>🛒 รายการสั่งซื้อ</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>วันที่</th><th>ชื่อสินค้า</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.purchase.map(i => `<tr><td>${i.date}</td><td>${i.product}</td><td>${getStatusBadge(i.status || 'รอระบุข้อมูล')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
    } else if (type === 'shipping') {
        html = `
            <div class="card">
                <h3>🚚 รายการจัดส่ง</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>วันที่</th><th>สินค้า</th><th>ปลายทาง</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.shipping.map(i => `<tr><td>${i.date}</td><td>${i.product}</td><td>${i.destination}</td><td>${getStatusBadge(i.status || 'เตรียมสินค้า')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
    }
}

function renderDynamicChart() {
    const canvas = document.getElementById('dynamicStockChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = state.stock.map(i => i.product);
    const dataValues = state.stock.map(i => parseInt(i.qty) || 0);
    const colors = state.stock.map(i => i.status === 'ปกติ' ? '#10b981' : (i.status === 'ใกล้หมด' ? '#f59e0b' : '#ef4444'));

    if (dynamicChartInstance) dynamicChartInstance.destroy();
    dynamicChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'จำนวนสินค้าคงเหลือ', data: dataValues, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function renderDashboard() {
    const normal = state.stock.filter(i => i.status === 'ปกติ').length;
    const warning = state.stock.filter(i => i.status === 'ใกล้หมด').length;
    const critical = state.stock.filter(i => i.status === 'หมด').length;

    const cNormal = document.getElementById('count-normal');
    const cWarning = document.getElementById('count-warning');
    const cCritical = document.getElementById('count-critical');
    const cPurchase = document.getElementById('count-purchase');
    const cShipping = document.getElementById('count-shipping');

    if (cNormal) cNormal.innerText = normal;
    if (cWarning) cWarning.innerText = warning;
    if (cCritical) cCritical.innerText = critical;
    if (cPurchase) cPurchase.innerText = state.purchase.length;
    if (cShipping) cShipping.innerText = state.shipping.length;

    const quickBody = document.querySelector('#quick-stock-table tbody');
    if(quickBody) {
        quickBody.innerHTML = [...state.stock].reverse().map(i => 
            `<tr><td>${i.product}</td><td>${i.qty} ${i.unit}</td><td>${getStatusBadge(i.status)}</td></tr>`
        ).join('');
    }
    renderChart();
}

function renderChart() {
    const chartCanvas = document.getElementById('stockChart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    const labels = state.stock.map(i => i.product);
    const dataValues = state.stock.map(i => parseInt(i.qty) || 0);
    const colors = state.stock.map(i => i.status === 'ปกติ' ? '#10b981' : (i.status === 'ใกล้หมด' ? '#f59e0b' : '#ef4444'));

    if (stockChartInstance) stockChartInstance.destroy();
    stockChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'จำนวนสินค้าคงเหลือ', data: dataValues, backgroundColor: colors }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

function renderStockTable() {
    const tbody = document.querySelector('#table-stock tbody');
    if (!tbody) return;
    tbody.innerHTML = state.stock.map((i, index) => `
        <tr id="row-stock-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-qty">${i.qty}</td>
            <td class="cell-unit">${i.unit}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'ปกติ')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('stock', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteStock', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function renderPurchaseTable() {
    const tbody = document.querySelector('#table-purchase tbody');
    if (!tbody) return;
    tbody.innerHTML = state.purchase.map((i, index) => `
        <tr id="row-purchase-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-date">${i.date}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'ทำเบิก')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('purchase', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deletePurchase', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function renderShippingTable() {
    const tbody = document.querySelector('#table-shipping tbody');
    if (!tbody) return;
    tbody.innerHTML = state.shipping.map((i, index) => `
        <tr id="row-shipping-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-date">${i.date}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-company">${i.company}</td>
            <td class="cell-destination">${i.destination}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'เตรียมสินค้า')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('shipping', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteShipping', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function enableEdit(type, index) {
    isEditing = true; 
    const tr = document.getElementById(`row-${type}-${index}`);
    const item = state[type][index]; 
    if(!item) return; 
    
    if (type === 'stock') {
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-stk-p-${index}">`;
        tr.querySelector('.cell-qty').innerHTML = `<input type="number" value="${item.qty}" id="edit-stk-q-${index}" min="0">`;
        tr.querySelector('.cell-unit').innerHTML = `<input type="text" value="${item.unit}" id="edit-stk-u-${index}">`;
        const currentStatus = item.status || 'ปกติ';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-stk-s-${index}">
                <option value="ปกติ" ${currentStatus === 'ปกติ' ? 'selected' : ''}>ปกติ</option>
                <option value="ใกล้หมด" ${currentStatus === 'ใกล้หมด' ? 'selected' : ''}>ใกล้หมด</option>
                <option value="หมด" ${currentStatus === 'หมด' ? 'selected' : ''}>หมด</option>
            </select>`;
    } else if (type === 'purchase') {
        const safeDate = formatSafeDate(item.date);
        tr.querySelector('.cell-date').innerHTML = `<input type="date" value="${safeDate}" id="edit-pur-d-${index}">`;
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-pur-p-${index}">`;
        const currentStatus = item.status || 'ทำเบิก';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-pur-s-${index}">
                <option value="ทำเบิก" ${currentStatus === 'ทำเบิก' ? 'selected' : ''}>ทำเบิก</option>
                <option value="รอโอน" ${currentStatus === 'รอโอน' ? 'selected' : ''}>รอโอน</option>
                <option value="จ่ายแล้ว" ${currentStatus === 'จ่ายแล้ว' ? 'selected' : ''}>จ่ายแล้ว</option>
            </select>`;
    } else if (type === 'shipping') {
        const safeDate = formatSafeDate(item.date);
        tr.querySelector('.cell-date').innerHTML = `<input type="date" value="${safeDate}" id="edit-shp-d-${index}">`;
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-shp-p-${index}">`;
        tr.querySelector('.cell-company').innerHTML = `<input type="text" value="${item.company}" id="edit-shp-c-${index}">`;
        tr.querySelector('.cell-destination').innerHTML = `<input type="text" value="${item.destination}" id="edit-shp-st-${index}">`;
        const currentStatus = item.status || 'เตรียมสินค้า';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-shp-s-${index}">
                <option value="เตรียมสินค้า" ${currentStatus === 'เตรียมสินค้า' ? 'selected' : ''}>เตรียมสินค้า</option>
                <option value="จัดส่ง" ${currentStatus === 'จัดส่ง' ? 'selected' : ''}>จัดส่ง</option>
                <option value="กำลังจัดส่ง" ${currentStatus === 'กำลังจัดส่ง' ? 'selected' : ''}>กำลังจัดส่ง</option>
                <option value="จัดส่งเสร็จแล้ว" ${currentStatus === 'จัดส่งเสร็จแล้ว' ? 'selected' : ''}>จัดส่งเสร็จแล้ว</option>
                <option value="ติดต่อลูกค้า" ${currentStatus === 'ติดต่อลูกค้า' ? 'selected' : ''}>ติดต่อลูกค้า</option>
            </select>`;
    }

    const actionCell = tr.cells[tr.cells.length - 1];
    actionCell.innerHTML = `
        <button class="btn btn-success" onclick="saveEdit('${type}', ${index})">บันทึก</button>
        <button class="btn btn-danger" onclick="cancelEdit()">ยกเลิก</button>
    `;
}

function formatSafeDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    return dateStr;
}

function cancelEdit() {
    isEditing = false; 
    fetchAllData(); 
}

async function saveEdit(type, index) {
    const item = state[type][index];
    let payload = { id: item.id }; 
    let action = '';
    const loadingToast = showToast('loading', 'กำลังบันทึก', 'กรุณารอสักครู่...');

    try {
        if (type === 'stock') {
            action = 'updateStock';
            payload.product = document.getElementById(`edit-stk-p-${index}`).value;
            payload.qty = document.getElementById(`edit-stk-q-${index}`).value;
            payload.unit = document.getElementById(`edit-stk-u-${index}`).value;
            payload.status = document.getElementById(`edit-stk-s-${index}`).value;
        } else if (type === 'purchase') {
            action = 'updatePurchase';
            payload.date = document.getElementById(`edit-pur-d-${index}`).value;
            payload.product = document.getElementById(`edit-pur-p-${index}`).value;
            payload.status = document.getElementById(`edit-pur-s-${index}`).value;
        } else if (type === 'shipping') {
            action = 'updateShipping';
            payload.date = document.getElementById(`edit-shp-d-${index}`).value;
            payload.product = document.getElementById(`edit-shp-p-${index}`).value;
            payload.company = document.getElementById(`edit-shp-c-${index}`).value;
            payload.destination = document.getElementById(`edit-shp-st-${index}`).value;
            payload.status = document.getElementById(`edit-shp-s-${index}`).value;
        }

        const res = await callAPI(action, payload);
        loadingToast.remove();
        if (res.status === 'success') {
            isEditing = false; 
            await fetchAllData();
            showToast('success', 'บันทึกสำเร็จ', 'บันทึกการแก้ไขข้อมูลเรียบร้อยแล้ว');
        } else {
            showToast('error', 'เกิดข้อผิดพลาด', res.message);
        }
    } catch (error) {
        loadingToast.remove();
        showToast('error', 'เชื่อมต่อไม่สำเร็จ', error.message);
    }
}

async function handleFormSubmit(event, action) {
    event.preventDefault();
    let data = {};
    const loadingToast = showToast('loading', 'กำลังเพิ่มข้อมูล', 'กรุณารอสักครู่...');
    
    try {
        if (action === 'addStock') {
            data = { product: document.getElementById('stk-product').value, qty: document.getElementById('stk-qty').value, unit: document.getElementById('stk-unit').value, status: 'ปกติ' };
        } else if (action === 'addPurchase') {
            data = { date: document.getElementById('pur-date').value, product: document.getElementById('pur-product').value, status: document.getElementById('pur-status').value };
        } else if (action === 'addShipping') {
            data = { date: document.getElementById('shp-date').value, product: document.getElementById('shp-product').value, company: document.getElementById('shp-company').value, destination: document.getElementById('shp-destination').value, status: document.getElementById('shp-status').value };
        }

        const res = await callAPI(action, data);
        loadingToast.remove();
        
        if (res.status === 'success') {
            event.target.reset();
            await fetchAllData();
            showToast('success', 'เพิ่มข้อมูลสำเร็จ', 'เพิ่มข้อมูลเข้าสู่ระบบเรียบร้อยแล้ว');
        } else {
            showToast('error', 'ไม่สามารถเพิ่มข้อมูลได้', res.message);
        }
    } catch (error) {
        loadingToast.remove(); 
        showToast('error', 'เกิดข้อผิดพลาด', error.message);
    }
}

async function handleDelete(action, id) {
    if (confirm("คุณแน่ใจหรือไม่ที่จะลบรายการข้อมูลนี้ออกจากระบบอย่างถาวร?")) {
        const loadingToast = showToast('loading', 'กำลังลบข้อมูล', 'กรุณารอสักครู่...');
        try {
            const res = await callAPI(action, { id });
            loadingToast.remove(); 
            
            if (res.status === 'success') {
                await fetchAllData();
                showToast('success', 'ลบสำเร็จ', 'รายการถูกลบออกจากระบบแล้ว');
            } else {
                showToast('error', 'ไม่สามารถลบข้อมูลได้', res.message);
            }
        } catch (error) {
            loadingToast.remove(); 
            showToast('error', 'เกิดข้อผิดพลาด', error.message);
        }
    }
}

function updateNotificationBell() {
    const count = state.line.filter(
        x => (x.status || 'ออเดอร์ใหม่') === 'ออเดอร์ใหม่'
    ).length;

    const badge = document.getElementById('notification-count');
    if (!badge) return;
    badge.innerText = count;

    if (count > lastNewOrderCount && lastNewOrderCount !== 0) {
        playNotificationSound();
        const bell = document.getElementById('notification-bell');
        if (bell) {
            bell.classList.remove('notification-pulse');
            setTimeout(() => {
                bell.classList.add('notification-pulse');
            }, 50);
        }

        showToast('success', 'ออเดอร์ใหม่', `มีออเดอร์ใหม่ ${count - lastNewOrderCount} รายการ`);
    }

    if(lastNewOrderCount === 0){
        lastNewOrderCount = count;
        return;
    }
    lastNewOrderCount = count;
}

function playNotificationSound(){
    const audio = document.getElementById('notification-sound');
    if(audio){
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

function showToast(type,title,message){
    const container = document.getElementById('toast-container');
    if(!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon='';
    if(type==='loading') icon='<span class="spinner"></span>';
    if(type==='success') icon='✅';
    if(type==='error') icon='❌';

    toast.innerHTML=`
        <div class="toast-title">
            ${icon} ${title}
        </div>
        <div class="toast-message">
            ${message}
        </div>
    `;

    container.appendChild(toast);
    if(type!=='loading'){
        setTimeout(()=>{
            toast.remove();
        },2500);
    }
    return toast;
}
