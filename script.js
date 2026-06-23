/**
 * MEDICHEN Warehouse & Dashboard - Frontend Script
 * ✨ อัปเดตระบบรองรับตัวแปรใหม่จาก Backend (Gemini V2.3) + แก้ไขบัค undefined
 */

const API_URL = "https://script.google.com/macros/s/AKfycbzUSfC0UMS1rLJTpVBbL1koAKUkHZcLIlQvLz98J2UzSwFUo-2sdqckWaiXNoEGgWJd/exec"; 

let state = { stock: [], purchase: [], shipping: [], line: [] };
let stockChartInstance = null;
let dynamicChartInstance = null; 
let isEditing = false; 
let currentDashboardType = null;
let previousLineCount = 0;
let lastNewOrderCount = 0;

// 1. ตรวจสอบตอนเปิดหน้าเว็บขึ้นมาใหม่ว่าเคยล็อกอินหรือยัง
document.addEventListener("DOMContentLoaded", () => {
    const sessionToken = localStorage.getItem("medichen_token");
    const loginPage = document.getElementById("loginPage");
    if (sessionToken && loginPage) {
        loginPage.style.display = "none";
    }
});

// 2. ดักจับเหตุการณ์การกดส่งฟอร์ม Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const user = document.getElementById("loginUser").value;
        const pass = document.getElementById("loginPass").value;
        
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "login",
                    data: { username: user, password: pass }
                })
            });
            
            const result = await response.json();
            
            if (result.status === "success" && result.data.loginSuccess) {
                localStorage.setItem("medichen_token", result.data.token);
                alert("ยินดีต้อนรับเข้าสู่ระบบ: " + result.data.adminName);
                document.getElementById("loginPage").style.display = "none";
                location.reload(); 
            } else {
                alert(result.message);
            }
        } catch (err) {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อระบบหลังบ้าน: " + err);
        }
    });
}

// 3. ฟังก์ชันสำหรับการทำปุ่ม Log out
function handleLogout() {
    localStorage.removeItem("medichen_token");
    location.reload();
}

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
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titles[tabId];
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

function getStatusBadge(status) {
    const safeStatus = status || 'ไม่มีสถานะ';
    if (['ปกติ', 'จ่ายแล้ว', 'จัดส่งเสร็จแล้ว', 'ยืนยันออเดอร์', 'AI สแกนสำเร็จ', 'AI รีสแกนสำเร็จ'].includes(safeStatus)) return `<span class="badge badge-success">${safeStatus}</span>`;
    if (['ใกล้หมด', 'รอโอน', 'จัดส่ง', 'กำลังจัดส่ง', 'รอระบุข้อมูล', 'AI สแกนแล้วรอตรวจ'].includes(safeStatus)) return `<span class="badge badge-warning">${safeStatus}</span>`;
    if (['ออเดอร์ใหม่'].includes(safeStatus)) return `<span class="badge badge-line">${safeStatus}</span>`;
    return `<span class="badge badge-danger">${safeStatus}</span>`;
}

// 📱 1. แสดงตารางออเดอร์จาก LINE (แก้ไขตัวแปรให้ตรงกับ App Script)
function renderLineTable() {
    const tbody = document.querySelector('#table-line tbody');
    if (!tbody) return;

    // กรองเอาเฉพาะรายการที่สถานะ "ไม่ใช่" ยืนยันออเดอร์แล้ว (เพราะกดยืนยันแล้วจะย้ายไปหน้าขนส่ง)
    const activeLineOrders = state.line.filter(i => i.status !== 'ยืนยันออเดอร์แล้ว');

    tbody.innerHTML = activeLineOrders.map((i) => {
        // ใช้ confirmDate หรือถ้ายังว่างอยู่ให้แสดงเป็น "รอตรวจสอบ"
        let displayDate = i.confirmDate ? i.confirmDate : "รอตรวจสอบ";
        // AI จะสรุปสินค้ามาให้ใน items ส่วนถ้าพิมพ์ปกติจากไลน์จะอยู่ใน notes
        let displayItems = i.items ? i.items : (i.notes ? i.notes : "-");
        
        return `
        <tr>
            <td>${displayDate}</td>
            <td style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><b>${displayItems}</b></td>
            <td>${i.address || '-'}</td>
            <td>${getStatusBadge(i.status || 'ออเดอร์ใหม่')}</td>
            <td>
                <button class="btn btn-primary" onclick="openLineModal('${i.id}')">📝 แยกข้อมูล / ดู</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteLineOrder', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `}).join('');
}

function openLineModal(id) {
    isEditing = true; 
    const item = state.line.find(x => String(x.id) === String(id));
    if (!item) return;

    // แมปตัวแปรใหม่จาก App Script เข้าหน้าฟอร์ม (ถ้าตัวไหนไม่มีให้ปล่อยว่าง)
    document.getElementById('edit-line-id').value = item.id;
    document.getElementById('edit-line-date').value = formatSafeDate(item.confirmDate);
    
    // ช่องรายละเอียดสินค้า รวมทั้งจาก AI (items) และไลน์ปกติ (notes)
    document.getElementById('edit-line-product').value = item.items || item.notes || '';
    
    // กรณีที่ HTML ยังมีช่อง Qty และ Unit ให้เคลียร์ค่าเป็นว่างไว้ เนื่องจาก AI สรุปรวมมาให้ใน Product แล้ว
    const qtyEl = document.getElementById('edit-line-qty');
    const unitEl = document.getElementById('edit-line-unit');
    if(qtyEl) qtyEl.value = '';
    if(unitEl) unitEl.value = '';

    document.getElementById('edit-line-price').value = item.totalAmount || '';
    document.getElementById('edit-line-company').value = item.hospitalName || '';
    document.getElementById('edit-line-destination').value = item.address || '';
    document.getElementById('edit-line-status').value = item.status || 'ออเดอร์ใหม่';

    document.getElementById('line-modal').style.display = 'flex';
}

function closeLineModal() {
    const modal = document.getElementById('line-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('form-edit-line');
    if (form) form.reset();
    isEditing = false;
}

async function saveLineOrderEdit(event) {
    event.preventDefault();
    // ส่ง Key กลับไปให้ตรงกับที่หลังบ้านคาดหวัง เพื่อความสมบูรณ์ 100%
    let payload = {
        id: document.getElementById('edit-line-id').value,
        confirmDate: document.getElementById('edit-line-date').value,
        items: document.getElementById('edit-line-product').value,
        totalAmount: document.getElementById('edit-line-price').value,
        hospitalName: document.getElementById('edit-line-company').value,
        address: document.getElementById('edit-line-destination').value,
        status: document.getElementById('edit-line-status').value
    };

    const loadingToast = showToast('loading', 'กำลังบันทึกข้อมูล', 'กรุณารอสักครู่...');

    try {
        const res = await callAPI('updateLineOrder', payload);
        loadingToast.remove();

        if (res.status === 'success') {
            closeLineModal();
            await fetchAllData();
            showToast('success', 'บันทึกสำเร็จ', 'คัดแยกและแก้ไขออเดอร์เรียบร้อยแล้ว');
        } else {
            showToast('error', 'เกิดข้อผิดพลาด', res.message);
        }
    } catch (error) {
        loadingToast.remove();
        showToast('error', 'เชื่อมต่อล้มเหลว', error.message);
    }
}

// 🚚 2. แสดงหน้ารายการจัดส่ง
function renderShippingTable() {
    const tbody = document.querySelector('#table-shipping tbody');
    if (!tbody) return;

    let html = state.shipping.map((i, index) => `
        <tr id="row-shipping-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-date">${i.date}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-company">${i.company || '-'}</td>
            <td class="cell-destination">${i.destination}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'เตรียมสินค้า')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('shipping', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteShipping', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');

    // ส่วนที่ 2: รายการจาก LINE (ใช้ตัวแปรใหม่ confirmDate, items, hospitalName, address)
    const confirmedLineOrders = state.line.filter(i => i.status === 'ยืนยันออเดอร์');
    
    html += confirmedLineOrders.map((i) => `
        <tr style="background-color: #f1f5f9;">
            <td><span style="font-size:11px; background:#0284c7; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">LINE</span>-${i.id.replace('ORD-','')}</td>
            <td>${i.confirmDate || "รอตรวจสอบ"}</td>
            <td><b>${i.items || i.notes || '-'}</b></td>
            <td>${i.hospitalName || 'รอระบุขนส่ง'}</td>
            <td>${i.address || '-'}</td>
            <td>${getStatusBadge(i.status)}</td>
            <td>
                <button class="btn btn-primary" onclick="openLineModal('${i.id}')">📝 แก้ไขข้อมูลออเดอร์</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteLineOrder', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = html;
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
        const normalShippingRows = state.shipping.map(i => `<tr><td>${i.date}</td><td>${i.product}</td><td>${i.destination}</td><td>${getStatusBadge(i.status || 'เตรียมสินค้า')}</td></tr>`).join('');
        // แมปตัวแปรของ LINE Orders ให้ถูกต้อง (confirmDate, items, address)
        const lineShippingRows = state.line.filter(i => i.status === 'ยืนยันออเดอร์').map(i => `<tr style="background-color: #f1f5f9;"><td>${i.confirmDate || "รอตรวจสอบ"}</td><td>[LINE] ${i.items || i.notes || '-'}</td><td>${i.address || '-'}</td><td>${getStatusBadge(i.status)}</td></tr>`).join('');

        html = `
            <div class="card">
                <h3>🚚 รายการจัดส่งรวมปัจจุบัน</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>วันที่</th><th>สินค้า</th><th>ปลายทาง</th><th>สถานะ</th></tr></thead>
                        <tbody>${normalShippingRows + lineShippingRows}</tbody>
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

    const lineShippingCount = state.line.filter(i => i.status === 'ยืนยันออเดอร์').length;

    const cNormal = document.getElementById('count-normal');
    const cWarning = document.getElementById('count-warning');
    const cCritical = document.getElementById('count-critical');
    const cPurchase = document.getElementById('count-purchase');
    const cShipping = document.getElementById('count-shipping');

    if(cNormal) cNormal.innerText = normal;
    if(cWarning) cWarning.innerText = warning;
    if(cCritical) cCritical.innerText = critical;
    if(cPurchase) cPurchase.innerText = state.purchase.length;
    if(cShipping) cShipping.innerText = state.shipping.length + lineShippingCount;

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
        if(bell) {
            bell.classList.remove('notification-pulse');
            setTimeout(() => {
                bell.classList.add('notification-pulse');
            }, 50);
        }

        showToast(
            'success',
            'ออเดอร์ใหม่',
            `มีออเดอร์ใหม่ ${count - lastNewOrderCount} รายการ`
        );
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

// ========================================================
// 📱 ส่วนเสริมสำหรับ Mobile: ระบบเมนูเปิด-ปิด (Hamburger Menu)
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar'); 

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
    });
});
