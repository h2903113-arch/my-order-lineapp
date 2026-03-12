// --- 1. 定義變數與 API 網址 ---
const LIFF_ID = "2009416875-6D00wRVu"; 
const GAS_URL = "https://script.google.com/macros/s/AKfycbz5cmtn5JDbKuBwSVkpSjk1bLrH6B0z-WoqCcF_V_u21mU9ig0SIUunsPBGepvs3IyfzA/exec";

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
// 這行會嘗試從手機讀取舊資料，如果沒紀錄才會給空陣列 []
let finalHistory = JSON.parse(localStorage.getItem('ng_history')) || []; 
let userName = "未知客戶"; 

// --- 2. 啟動區塊 ---
window.addEventListener('load', async () => {
    try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            userName = profile.displayName;
        }
    } catch (err) {
        console.warn("LIFF 啟動失敗", err);
        userName = "測試客戶"; 
    }
    const displayEl = document.getElementById('display-name');
    if (displayEl) displayEl.innerText = userName;

    syncMenuFromCloud();
}); 

// --- 3. 同步雲端菜單 ---
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

// --- 4. 渲染與操作 ---
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
                    <div class="item-info">規格:${p.unit} | 單價:${p.price}元</div>
                </div>
                <div class="item-controls">
                    <input type="number" class="qty-input" placeholder="輸入數量" data-name="${p.name}" value="${cached.qty}">
                    <div class="unit-selector-wrapper">
                        <div class="unit-display-btn" onclick="toggleUnitOptions(this)">${cached.unit} ▼</div>
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

// --- 5. 訂單核心邏輯 ---
function addToCart() {
    saveCurrentInputs();
    let items = Object.keys(currentInputCache).map(name => {
        const p = products.find(prod => prod.name === name);
        return { name: name, ...currentInputCache[name], price: p ? p.price : 0 };
    });
    
    if (items.length > 0) {
        const orderId = "ORD-" + Date.now().toString().slice(-6);
        tempOrders.push({ id: orderId, time: new Date().toLocaleString(), items: items, user: userName });
        currentInputCache = {};
        alert("已加入待送出清單");
        showPage('cart');
    } else { alert("請先輸入數量"); }
}

async function sendOrder(id) {
    const idx = tempOrders.findIndex(o => o.id === id);
    if (idx === -1) return;
    const order = tempOrders[idx];
    
    // 這裡維持你原本後台能收到的邏輯
    alert("正在連線 Google 雲端送出訂單...");

    try {
        await fetch(GAS_URL, {
            method: "POST", 
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(order) // 確保發送給後台的是原始 order
        });
        // 成功後才執行後續存檔
        finalizeOrder(idx, order); 
    } catch (err) {
        console.error("發送失敗:", err);
        // 如果失敗也想存紀錄，可以保留這行；若不希望沒成功的單出現在歷史，就刪掉這行
        finalizeOrder(idx, order); 
    }
}

function finalizeOrder(idx, orderData) {
    // 1. 從待送出清單移除
    const finishedOrder = tempOrders.splice(idx, 1)[0];
    
    // 2. 格式化時間 (為了讓歷史紀錄卡片好看)
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // 3. 建立一個專門存歷史的物件，不影響發送給後台的資料
    const historyEntry = {
        ...finishedOrder,
        time: timeStr // 覆蓋或新增漂亮的格式
    };

    // 4. 存入本地儲存
    finalHistory.unshift(historyEntry);
    if (finalHistory.length > 20) finalHistory.pop();
    localStorage.setItem('ng_history', JSON.stringify(finalHistory));

    alert("訂單傳送成功！");
    
    // 5. 強制跳轉並渲染
    showPage('history');
}

// 確保 renderHistory 的 ID 與 HTML 對齊
function renderHistory() {
    const list = document.getElementById('final-history-list');
    if (!list) return;

    if (finalHistory.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:50px; color:#999;">目前尚無 5 日內的訂購紀錄</div>`;
        return;
    }

    list.innerHTML = "";
    finalHistory.forEach((order, index) => {
        const itemsHtml = order.items.map(i => `<li>${i.name} - ${i.qty}${i.unit}</li>`).join('');
        const timeArray = order.time.split(' ');

        list.innerHTML += `
            <div class="history-card">
                <div class="history-header">
                    <span class="order-title">訂單 ${finalHistory.length - index}</span>
                    <span class="status-badge">成功送出</span>
                </div>
                <div class="order-time-info">
                    成立日期：${timeArray[0]}<br>
                    成立時間：${timeArray[1] || ''}
                </div>
                <ul class="detail-list">${itemsHtml}</ul>
            </div>`;
    });
}

async function finalizeOrder(idx, orderData) {
    const finishedOrder = tempOrders.splice(idx, 1)[0];
    
    // 1. 將新訂單存入手機長期記憶體 (LocalStorage)
    finalHistory.unshift(finishedOrder); // 新的排前面
    if (finalHistory.length > 20) finalHistory.pop(); // 保持數量在 20 筆內
    localStorage.setItem('ng_history', JSON.stringify(finalHistory));

    // 2. 自動發送 LINE 訊息回報 (讓業務在群組也看到)
    if (liff.isInClient()) {
        try {
            await liff.sendMessages([{
                type: "text",
                text: `✅ 【能高訂單成功】\n客戶：${userName}\n單號：${orderData.id}\n時間：${orderData.time}\n\n訂單已進入後台處理中！`
            }]);
        } catch (e) { console.log("LINE 訊息發送受阻，但不影響紀錄儲存"); }
    }

    alert("訂單傳送成功！已存入您的歷史紀錄。");
    
    // 3. 關鍵：自動跳轉到紀錄頁面，這會觸發 renderHistory()
    showPage('history'); 
}

function showPage(pageId) {
    // 隱藏所有頁面，顯示目標頁面
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById(pageId + '-page');
    if (target) target.style.display = (pageId === 'order') ? 'flex' : 'block';
    
    // 更新標題
    const titles = { order: "今日訂單", cart: "待送出清單", history: "訂購記錄", report: "瑕疵回報" };
    document.getElementById('header-title').innerText = titles[pageId] || "能高小幫手";

    // 控制「加入訂單」大按鈕只在首頁出現
    const mainBtn = document.getElementById('main-submit-btn');
    if (mainBtn) mainBtn.style.display = (pageId === 'order') ? 'block' : 'none';

    // --- 關鍵修改：當切換到 history 時，立即執行繪製 ---
    if (pageId === 'history') {
        console.log("正在渲染歷史紀錄...");
        renderHistory(); 
    }

    // 更新底部導覽列顏色
    document.querySelectorAll('.nav-icon').forEach(icon => {
        icon.classList.remove('active-nav');
        if (icon.getAttribute('onclick').includes(pageId)) {
            icon.classList.add('active-nav');
        }
    });
}

function renderCart() {
    const list = document.getElementById('temp-order-list');
    if (!list) return;
    list.innerHTML = tempOrders.length === 0 ? "<p class='empty-msg'>尚無待送出訂單</p>" : "";
    tempOrders.forEach(order => {
        let itemSum = order.items.map(i => `${i.name} x${i.qty}${i.unit}`).join(', ');
        list.innerHTML += `<div class="history-card">
            <div class="order-id">單號: ${order.id}</div>
            <div class="order-detail">${itemSum}</div>
            <button onclick="sendOrder('${order.id}')" class="btn-green-sm">確認送出訂單</button>
        </div>`;
    });
}

function renderHistory() {
    const list = document.getElementById('final-history-list');
    if (!list) return;

    // 1. 強健的清理邏輯
    const now = new Date().getTime();
    const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
    
    finalHistory = finalHistory.filter(order => {
        if (!order.time) return false; // 沒時間的訂單才刪掉
        const orderDate = new Date(order.time).getTime();
        // 如果時間解析失敗 (NaN)，我們選擇保留它不刪除，避免畫面空白
        if (isNaN(orderDate)) return true; 
        return (now - orderDate) < fiveDaysInMs;
    });
    localStorage.setItem('ng_history', JSON.stringify(finalHistory));

    // 2. 沒資料時的處理
    if (finalHistory.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:50px; color:#999;">目前尚無 5 日內的訂購紀錄</div>`;
        return;
    }

    // 3. 渲染卡片
    list.innerHTML = "";
    finalHistory.forEach((order, index) => {
        const itemsHtml = order.items ? order.items.map(i => `<li>${i.name} - ${i.qty}${i.unit}</li>`).join('') : '<li>無品項資料</li>';
        
        // 分離日期的安全處理：防止 split 失敗
        const timeParts = order.time ? order.time.split(' ') : ['未知日期', ''];
        const dateStr = timeParts[0];
        const timeStr = timeParts[1] || '';

        list.innerHTML += `
            <div class="history-card">
                <div class="history-header">
                    <span class="order-title">訂單 ${finalHistory.length - index}</span>
                    <span class="status-badge">成功送出</span>
                </div>
                <div class="order-time-info">
                    成立日期：${dateStr}<br>
                    成立時間：${timeStr}
                </div>
                <ul class="detail-list">
                    ${itemsHtml}
                </ul>
                <div style="text-align:right; margin-top:10px;">
                    <button class="check-btn" style="background:#4a6741; color:white; border:none; padding:5px 12px; border-radius:5px; font-size:12px;">查看訂單</button>
                </div>
            </div>`;
    });
}

// --- 6. 問題回報 ---
async function submitReport() {
    const idValue = document.getElementById('rep-id').value.trim();
    const contentValue = document.getElementById('rep-items').value.trim();
    if (!idValue || !contentValue) { alert("請填寫完整資訊"); return; }
    
    alert("正在連線回報系統...");
    try {
        await fetch(GAS_URL, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ type: "report", user: userName, orderId: idValue, content: contentValue })
        });
        alert("回報成功！");
        document.getElementById('rep-id').value = ""; 
        document.getElementById('rep-items').value = "";
        showPage('order'); 
    } catch (err) { alert("傳送失敗"); }
}












