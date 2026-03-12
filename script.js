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

// --- 3. 介面渲染與操作 ---
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

// --- 4. 訂單核心邏輯 (最重要修改區) ---

function addToCart() {
    saveCurrentInputs();
    let items = Object.keys(currentInputCache).map(name => {
        const p = products.find(prod => prod.name === name);
        return { name: name, ...currentInputCache[name], price: p ? p.price : 0 };
    });
    
    if (items.length > 0) {
        const orderId = "ORD-" + Date.now().toString().slice(-6);
        // 統一存入 ISO 格式，方便後續 new Date() 解析
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
    
    alert("正在連線 Google 雲端送出訂單...");

    try {
        // 先複製一份乾淨的資料送給後台
        const payload = JSON.stringify(order);
        await fetch(GAS_URL, {
            method: "POST", 
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: payload
        });
        // 發送成功後執行完成邏輯
        finalizeOrder(idx); 
    } catch (err) {
        console.error("發送失敗:", err);
        finalizeOrder(idx); 
    }
}

function finalizeOrder(idx) {
    const finishedOrder = tempOrders.splice(idx, 1)[0];
    
    // 轉換成顯示用的時間格式：YYYY/MM/DD HH:MM
    const now = new Date();
    const displayTime = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const historyEntry = {
        ...finishedOrder,
        time: displayTime 
    };

    finalHistory.unshift(historyEntry);
    if (finalHistory.length > 20) finalHistory.pop();
    localStorage.setItem('ng_history', JSON.stringify(finalHistory));

    // 發送 LINE 通知
    if (liff.isInClient()) {
        liff.sendMessages([{
            type: "text",
            text: `✅ 【能高訂單成功】\n客戶：${userName}\n單號：${finishedOrder.id}\n時間：${displayTime}\n\n訂單已進入後台處理中！`
        }]).catch(e => console.log("LINE通知失敗"));
    }

    alert("訂單傳送成功！");
    showPage('history');
}

// --- 5. 渲染與頁面控制 ---

function renderHistory() {
    const list =











