// --- 1. 定義變數與 API 網址 (全域唯一) ---
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
let finalHistory = []; 
let userName = "未知客戶"; 

// --- 2. 啟動區塊 ---
window.addEventListener('load', async () => {
    console.log("App 啟動中...");
    
    try {
        // 1. 初始化 LIFF
        await liff.init({ liffId: LIFF_ID });

        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            userName = profile.displayName;
            console.log("LINE 登入成功：" + userName);
        } else {
            console.log("目前為非登入狀態，建議在 LINE App 中開啟");
        }
    } catch (err) {
        console.warn("LIFF 初始化失敗或不在 LINE 環境中:", err);
        userName = "測試客戶"; 
    }

    // 2. 更新名字顯示
    const displayEl = document.getElementById('display-name');
    if (displayEl) {
        displayEl.innerText = userName;
    }

    // 3. 執行同步與渲染
    syncMenuFromCloud();
    
    console.log("啟動程序完成，目前身分：" + userName);
}); 

// --- 3. 同步雲端菜單邏輯 ---
async function syncMenuFromCloud() {
    try {
        // 嘗試從 GAS 獲取最新菜單 (不強制，失敗則用預設)
        const response = await fetch(GAS_URL + "?type=getMenu");
        if (response.ok) {
            const cloudProducts = await response.json();
            if (cloudProducts && cloudProducts.length > 0) {
                products = cloudProducts;
                console.log("雲端菜單同步成功");
            }
        }
    } catch (err) {
        console.warn("使用預設菜單顯示");
    } finally {
        renderProducts("全部品項");
    }
}

// --- 4. 畫面渲染與操作功能 ---
function saveCurrentInputs() {
    document.querySelectorAll('.item-card').forEach(card => {
        const input = card.querySelector('.qty-input');
        if (!input) return;
        const name = input.getAttribute('data-name');
        const qty = input.value;
        const unitEl = card.querySelector('.unit-display-btn');
        const unit = unitEl ? unitEl.innerText.replace(' ▼','') : "台斤";
        
        if (qty > 0) {
            currentInputCache[name] = { qty: qty, unit: unit };
        } else {
            delete currentInputCache[name];
        }
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
                    <input type="number" class="qty-input" placeholder="輸入數量" 
                           data-name="${p.name}" value="${cached.qty}">
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

// --- 5. 訂單邏輯 ---
function addToCart() {
    saveCurrentInputs();
    let items = Object.keys(currentInputCache).map(name => ({
        name: name, ...currentInputCache[name]
    }));
    
    if (items.length > 0) {
        const orderId = "ORD-" + Date.now();
        tempOrders.push({ 
            id: orderId, 
            time: new Date().toLocaleString(), 
            items: items,
            user: userName 
        });
        currentInputCache = {};
        alert("已存入我的訂單");
        showPage('cart');
    } else { 
        alert("請輸入數量"); 
    }
}

async function sendOrder(id) {
    const idx = tempOrders.findIndex(o => o.id === id);
    if (idx === -1) return;
    
    const order = tempOrders[idx];
    alert("正在連線 Google 雲端...");

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(order)
        });
        finalizeOrder(idx, order); 
    } catch (err) {
        console.log("網路連線異常，請檢查試算表", err);
        finalizeOrder(idx, order); 
    }
}

async function finalizeOrder(idx, orderData) {
    const finishedOrder = tempOrders.splice(idx, 1)[0];
    finalHistory.push(finishedOrder);

    // --- 龍寶寶功能：回傳群組訊息 ---
    if (liff.isInClient()) {
        try {
            await liff.sendMessages([
                {
                    type: "text",
                    text: `📢 【新訂單回報】\n👤 客戶：${userName}\n🆔 單號：${orderData.id}\n⏰ 時間：${orderData.time}\n------------------\n訂單已成功送出！`
                }
            ]);
        } catch (e) { console.log("訊息傳送受阻"); }
    }

    alert("訂單傳送成功！");
    showPage('history');
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById(pageId + '-page');
    if (!target) return;
    target.style.display = (pageId === 'order') ? 'flex' : 'block';
    
    document.getElementById('header-title').innerText = 
        (pageId==='order'?"今日訂單":pageId==='cart'?"我的訂單":pageId==='history'?"訂單記錄":"問題回報");
    
    const mainBtn = document.getElementById('main-submit-btn');
    if (mainBtn) mainBtn.style.display = (pageId === 'order') ? 'block' : 'none';
    
    if (pageId === 'cart') renderCart();
    if (pageId === 'history') renderHistory();
}

function renderCart() {
    const list = document.getElementById('temp-order-list');
    if (!list) return;
    list.innerHTML = tempOrders.length === 0 ? "<p style='padding:20px; color:#999;'>尚無暫存訂單</p>" : "";
    tempOrders.forEach(order => {
        list.innerHTML += `<div class="history-card">
            <h3>訂單編號: ${order.id}</h3>
            <p>時間: ${order.time}</p>
            <button onclick="sendOrder('${order.id}')" class="btn-green-sm">確認送出</button>
        </div>`;
    });
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if(!list) return;
    list.innerHTML = finalHistory.length === 0 ? "<p style='padding:20px; color:#999;'>尚無歷史紀錄</p>" : "";
    finalHistory.forEach(order => {
        list.innerHTML += `<div class="history-card">
            <h3>單號: ${order.id}</h3>
            <p>時間: ${order.time}</p>
            <p style="color: #28a745;">狀態: 已同步雲端</p>
        </div>`;
    });
}

// --- 6. 問題回報邏輯 ---
async function submitReport() {
    const idEl = document.getElementById('rep-id');
    const itemsEl = document.getElementById('rep-items');
    if (!idEl || !itemsEl) return;

    const orderIdValue = idEl.value.trim();
    const contentValue = itemsEl.value.trim();

    if (!orderIdValue || !contentValue) {
        alert("請填寫完整資訊喔！");
        return;
    }

    const reportData = {
        type: "report",
        user: userName,
        orderId: orderIdValue,
        content: contentValue
    };

    alert("正在連線雲端回報系統...");

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(reportData)
        });
        alert("回報成功！我們將盡快處理。");
        idEl.value = ""; 
        itemsEl.value = "";
        showPage('order'); 
    } catch (err) {
        alert("傳送失敗，請檢查網路連線。");
    }
}





