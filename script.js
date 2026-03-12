const LIFF_ID = "2009416875-6D00wRVu"; 
const GAS_URL = "https://script.google.com/macros/s/AKfycbz5cmtn5JDbKuBwSVkpSjk1bLrH6B0z-WoqCcF_V_u21mU9ig0SIUunsPBGepvs3IyfzA/exec";

// 預設菜單，包含菇類與乾貨類
let products = [
    { name: "胡蘿蔔", price: 40, unit: "台斤", cat: "根莖類" },
    { name: "地瓜", price: 50, unit: "台斤", cat: "根莖類" },
    { name: "高麗菜", price: 35, unit: "台斤", cat: "蔬菜類" },
    { name: "小白菜", price: 30, unit: "單包", cat: "蔬菜類" },
    { name: "富士蘋果", price: 120, unit: "台斤", cat: "水果類" },
    { name: "乾香菇", price: 80, unit: "單包100g", cat: "乾貨類" }
];

let currentInputCache = {}; 
let tempOrders = [];   
let finalHistory = JSON.parse(localStorage.getItem('ng_history')) || []; 
let userName = "未知客戶"; 

window.addEventListener('load', async () => {
    try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            userName = profile.displayName;
        }
    } catch (err) {
        userName = "測試客戶"; 
    }
    document.getElementById('display-name').innerText = userName;
    syncMenuFromCloud();
    // 初始化顯示頁面
    showPage('order');
}); 

async function syncMenuFromCloud() {
    try {
        const response = await fetch(GAS_URL + "?type=getMenu");
        if (response.ok) {
            const cloudProducts = await response.json();
            if (cloudProducts.length > 0) products = cloudProducts;
        }
    } catch (err) { console.warn("使用預設菜單"); }
    renderProducts("全部品項");
}

function saveCurrentInputs() {
    document.querySelectorAll('.item-card').forEach(card => {
        const input = card.querySelector('.qty-input');
        if (!input) return;
        const name = input.getAttribute('data-name');
        const qty = input.value;
        const unitEl = card.querySelector('.unit-display-btn');
        const unit = unitEl ? unitEl.innerText.replace(' ▼','') : "台斤";
        if (qty > 0) currentInputCache[name] = { qty: qty, unit: unit };
        else delete currentInputCache[name];
    });
}

function renderProducts(category) {
    const list = document.getElementById('product-list');
    if (!list) return;
    list.innerHTML = ""; 
    
    const filtered = (category === "全部品項") ? products : products.filter(p => p.cat === category);
    
    filtered.forEach(p => {
        const cached = currentInputCache[p.name] || { qty: "", unit: p.unit };
        list.innerHTML += `
            <div class="item-card">
                <div class="item-header">
                    <div class="item-name">${p.name}</div>
                    <div class="item-info">單價: ${p.price}元 / ${p.unit}</div>
                </div>
                
                <div class="item-controls">
                    <input type="number" 
                           class="qty-input" 
                           placeholder="0" 
                           data-name="${p.name}" 
                           value="${cached.qty}"
                           onchange="saveCurrentInputs()">
                           
                    <div class="unit-selector-wrapper">
                        <div class="unit-display-btn" onclick="toggleUnitOptions(this)">
                            ${cached.unit} ▼
                        </div>
                        <div class="unit-options">
                            <div class="unit-option" onclick="selectUnit(this, '台斤')">台斤</div>
                            <div class="unit-option" onclick="selectUnit(this, '單包')">單包</div>
                        </div>
                    </div>
                </div>
            </div>`;
    });
}

function changeCategory(cat, el) {
    saveCurrentInputs();
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('cat-label').innerText = cat;
    renderProducts(cat);
}

function toggleUnitOptions(btn) {
    const options = btn.nextElementSibling;
    options.style.display = (options.style.display === 'block') ? 'none' : 'block';
}

function selectUnit(element, unit) {
    const displayBtn = element.parentElement.previousElementSibling;
    displayBtn.innerText = unit + " ▼";
    element.parentElement.style.display = 'none';
    saveCurrentInputs();
}

// --- 核心邏輯 ---
function addToCart() {
    saveCurrentInputs();
    let items = Object.keys(currentInputCache).map(name => {
        const p = products.find(prod => prod.name === name);
        return { name: name, ...currentInputCache[name], price: p ? p.price : 0 };
    });
    
    if (items.length > 0) {
        const orderId = "ORD-" + Date.now().toString().slice(-6);
        // 使用 ISO 格式確保跨裝置相容性
        tempOrders.push({ id: orderId, time: new Date().toISOString(), items: items, user: userName });
        currentInputCache = {};
        alert("已加入待送出清單");
        showPage('cart');
    } else { alert("請先輸入數量"); }
}

async function sendOrder(id) {
    const idx = tempOrders.findIndex(o => o.id === id);
    if (idx === -1) return;
    const order = tempOrders[idx];
    alert("正在連線 Google 雲端...");

    try {
        await fetch(GAS_URL, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(order)
        });
        finalizeOrder(idx); 
    } catch (err) {
        finalizeOrder(idx); 
    }
}

function finalizeOrder(idx) {
    const finishedOrder = tempOrders.splice(idx, 1)[0];
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const historyEntry = { ...finishedOrder, time: timeStr };

    // 修正舊版錯誤：使用 unshift 增加到陣列最前面，而非覆蓋
    finalHistory.unshift(historyEntry); 
    if (finalHistory.length > 20) finalHistory.pop(); 
    localStorage.setItem('ng_history', JSON.stringify(finalHistory));

    if (liff.isInClient()) {
        liff.sendMessages([{
            type: "text",
            text: `✅ 【能高訂單成功】\n客戶：${userName}\n單號：${finishedOrder.id}\n時間：${timeStr}\n\n訂單已進入後台處理中！`
        }]).catch(e => console.log(e));
    }

    alert("訂單傳送成功！");
    showPage('history'); 
}

function renderHistory() {
    const list = document.getElementById('final-history-list');
    if(!list) return;

    if (finalHistory.length === 0) {
        list.innerHTML = "<p style='text-align:center; padding:50px; color:#999;'>尚無歷史紀錄</p>";
        return;
    }

    list.innerHTML = "";
    finalHistory.forEach(order => {
        let itemDetails = order.items.map(i => `<li>${i.name} - ${i.qty}${i.unit}</li>`).join('');
        list.innerHTML += `
            <div class="history-card">
                <div class="history-header">
                    <span class="order-title">單號: ${order.id}</span>
                    <span class="status-badge" style="background:#e67e22; color:white; padding:2px 8px; border-radius:4px; font-size:12px;">成功送出</span>
                </div>
                <div class="order-time-info" style="color:#666; font-size:13px; margin:5px 0;">成立日期：${order.time}</div>
                <ul class="detail-list">${itemDetails}</ul>
            </div>`;
    });
}

function renderCart() {
    const list = document.getElementById('temp-order-list');
    if (!list) return;
    list.innerHTML = tempOrders.length === 0 ? "<p style='text-align:center; padding:50px; color:#999;'>尚無待送出訂單</p>" : "";
    tempOrders.forEach(order => {
        let itemSum = order.items.map(i => `${i.name} x${i.qty}${i.unit}`).join(', ');
        list.innerHTML += `
            <div class="history-card">
                <div class="order-id" style="font-weight:bold;">單號: ${order.id}</div>
                <div class="order-detail" style="margin:10px 0; color:#444;">${itemSum}</div>
                <button onclick="sendOrder('${order.id}')" style="background:#4a6741; color:white; border:none; padding:10px; border-radius:5px; width:100%;">確認送出訂單</button>
            </div>`;
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById(pageId + '-page');
    if (target) {
        target.style.display = (pageId === 'order') ? 'flex' : 'block';
    }
    
    // 更新標題
    const titles = {order:"今日訂單", cart:"待送出清單", history:"訂購記錄", report:"瑕疵回報"};
    document.getElementById('header-title').innerText = titles[pageId];
    
    // 控制橘色圓形浮動按鈕顯示
    const mainBtn = document.getElementById('main-submit-btn');
    if (mainBtn) {
        // 只有在 order 頁面時才顯示為 flex (圓形置中用)，其餘隱藏
        mainBtn.style.setProperty('display', pageId === 'order' ? 'flex' : 'none', 'important');
    }

    document.querySelectorAll('.nav-icon').forEach(icon => {
        icon.classList.remove('active-nav');
        if (icon.getAttribute('onclick').includes(pageId)) icon.classList.add('active-nav');
    });

    if (pageId === 'cart') renderCart();
    if (pageId === 'history') renderHistory();
}

async function submitReport() {
    const idValue = document.getElementById('rep-id').value.trim();
    const contentValue = document.getElementById('rep-items').value.trim();
    if (!idValue || !contentValue) { alert("請填寫完整資訊"); return; }
    try {
        await fetch(GAS_URL, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ type: "report", user: userName, orderId: idValue, content: contentValue })
        });
        alert("回報成功！");
        showPage('order'); 
    } catch (err) { alert("傳送失敗"); }
}

















