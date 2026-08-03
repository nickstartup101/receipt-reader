const API_BASE = ""; // served from same origin as backend

// ---------------- state ----------------
let currentFile = null;
let currentResult = null; // full analysis object from /api/analyze
// itemState[idx] = { product_id, matched_name, confirmed: bool, isNew: bool }
let itemState = [];

const AUTO_CONFIRM_SCORE = 0.9; // near-exact match => remember automatically, no click needed
const SHOW_SUGGESTION_SCORE = 0.45; // below this, don't bother suggesting

// ---------------- Helper Functions ສຳລັບ Date/Time Input ----------------
// ແກ້ໄຂ Error: "The string did not match the expected pattern"
function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  const cleaned = String(dateStr).replace(/\//g, "-").trim();
  const parts = cleaned.split("-");
  
  if (parts.length === 3) {
    // ຖ້າເປັນ DD-MM-YYYY (ເຊັ່ນ 25-10-2023) -> ແປງເປັນ YYYY-MM-DD
    if (parts[0].length <= 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    // ຖ້າເປັນ YYYY-MM-DD ຢູ່ແລ້ວ
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  return ""; // ຖ້າ Format ບໍ່ຖືກຕ້ອງໃຫ້ເປັນຄ່າຫວ່າງ ເພື່ອປ້ອງກັນ Browser Crash
}

function formatTimeForInput(timeStr) {
  if (!timeStr) return "";
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return ""; // ຖ້າ Format ບໍ່ຖືກຕ້ອງໃຫ້ເປັນຄ່າຫວ່າງ
}

// ---------------- tabs ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "products") loadProducts();
    if (btn.dataset.view === "history") loadHistory();
  });
});

// ---------------- dropzone ----------------
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const previewImg = document.getElementById("previewImg");
const dropzoneEmpty = document.getElementById("dropzoneEmpty");
const btnAnalyze = document.getElementById("btnAnalyze");
const btnChangeImage = document.getElementById("btnChangeImage");
const analyzeStatus = document.getElementById("analyzeStatus");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
});
btnChangeImage.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });

// Resize/compress in the browser before upload
function compressImage(file, maxDim = 1600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ອ່ານໄຟລ໌ຮູບບໍ່ສຳເລັດ"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("ໂຫລດຮູບບໍ່ສຳເລັດ"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("ບີບອັດຮູບບໍ່ສຳເລັດ"));
            const newName = (file.name || "receipt").replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], newName, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function setFile(file) {
  setStatus(analyzeStatus, "⏳ ກຳລັງກຽມຮູບ...", "");
  try {
    currentFile = await compressImage(file);
  } catch (err) {
    console.warn("compress failed, using original file", err);
    currentFile = file;
  }
  const url = URL.createObjectURL(currentFile);
  previewImg.src = url;
  previewImg.hidden = false;
  dropzoneEmpty.hidden = true;
  btnAnalyze.disabled = false;
  btnChangeImage.hidden = false;
  setStatus(analyzeStatus, "", "");
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.hidden = !msg;
  el.className = "status-line" + (type ? " " + type : "");
}

// ---------------- analyze ----------------
btnAnalyze.addEventListener("click", async () => {
  if (!currentFile) return;
  btnAnalyze.disabled = true;
  setStatus(analyzeStatus, "⏳ ກຳລັງວິເຄາະຮູບດ້ວຍ Gemini... ອາດໃຊ້ເວລາຫຼາຍວິນາທີ", "");

  try {
    const formData = new FormData();
    formData.append("image", currentFile);
    const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ວິເຄາະບໍ່ສຳເລັດ");

    currentResult = data;
    itemState = (data.items || []).map((item) => {
      const best = (item.suggestions || [])[0];
      const autoConfirm = best && best.score >= AUTO_CONFIRM_SCORE;
      return {
        product_id: autoConfirm ? best.product_id : null,
        matched_name: autoConfirm ? best.canonical_name : (item.name || ""),
        confirmed: !!autoConfirm,
        isNew: false,
      };
    });

    renderResults(data);
    setStatus(analyzeStatus, "✅ ວິເຄາະສຳເລັດ", "success");
  } catch (err) {
    console.error(err);
    setStatus(analyzeStatus, "❌ " + err.message, "error");
  } finally {
    btnAnalyze.disabled = false;
  }
});

// ---------------- render results ----------------
const resultsEmpty = document.getElementById("resultsEmpty");
const resultsContent = document.getElementById("resultsContent");
const uncertainBanner = document.getElementById("uncertainBanner");
const uncertainList = document.getElementById("uncertainList");
const itemsBody = document.getElementById("itemsBody");

function markField(input, isMissing) {
  if (input) input.classList.toggle("needs-input", !!isMissing);
}

function renderResults(data) {
  resultsEmpty.hidden = true;
  resultsContent.hidden = false;

  const fStoreName = document.getElementById("fStoreName");
  const fDate = document.getElementById("fDate");
  const fTime = document.getElementById("fTime");
  const fCurrency = document.getElementById("fCurrency");
  const fGrandTotal = document.getElementById("fGrandTotal");

  if (fStoreName) fStoreName.value = data.store_name || "";
  
  // 🔥 ແກ້ໄຂ: ແປງ Format Date ແລະ Time ກ່ອນSet ຄ່າ ເພື່ອປ້ອງກັນ Error DOMException
  if (fDate) fDate.value = formatDateForInput(data.date);
  if (fTime) fTime.value = formatTimeForInput(data.time);
  
  if (fCurrency) fCurrency.value = data.currency || "";
  if (fGrandTotal) fGrandTotal.value = data.grand_total ?? "";

  markField(fStoreName, !data.store_name);
  markField(fDate, !fDate.value);
  markField(fTime, !fTime.value);

  if (data.uncertain_fields && data.uncertain_fields.length) {
    uncertainBanner.hidden = false;
    uncertainList.innerHTML = data.uncertain_fields.map((u) => `<li>${escapeHtml(u)}</li>`).join("");
  } else {
    uncertainBanner.hidden = true;
  }

  itemsBody.innerHTML = "";
  (data.items || []).forEach((item, idx) => itemsBody.appendChild(renderItemRow(item, idx)));
}

function renderItemRow(item, idx) {
  const tr = document.createElement("tr");

  const tdRaw = document.createElement("td");
  tdRaw.className = "raw-text-cell";
  tdRaw.textContent = item.raw_text || "";
  tr.appendChild(tdRaw);

  const tdName = document.createElement("td");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = itemState[idx].matched_name || "";
  nameInput.id = `item-name-${idx}`;
  markField(nameInput, item.confidence === "low");
  nameInput.addEventListener("blur", () => onNameChanged(idx));
  tdName.appendChild(nameInput);

  const matchArea = document.createElement("div");
  matchArea.id = `item-match-${idx}`;
  matchArea.style.marginTop = "4px";
  tdName.appendChild(matchArea);
  tr.appendChild(tdName);

  const tdQty = document.createElement("td");
  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.step = "any";
  qtyInput.value = item.quantity ?? "";
  qtyInput.id = `item-qty-${idx}`;
  markField(qtyInput, item.quantity === null || item.quantity === undefined);
  tdQty.appendChild(qtyInput);
  tr.appendChild(tdQty);

  const tdUnit = document.createElement("td");
  const unitInput = document.createElement("input");
  unitInput.type = "number";
  unitInput.step = "any";
  unitInput.value = item.unit_price ?? "";
  unitInput.id = `item-unit-${idx}`;
  markField(unitInput, item.unit_price === null || item.unit_price === undefined);
  tdUnit.appendChild(unitInput);
  tr.appendChild(tdUnit);

  const tdTotal = document.createElement("td");
  const totalInput = document.createElement("input");
  totalInput.type = "number";
  totalInput.step = "any";
  totalInput.value = item.total_price ?? "";
  totalInput.id = `item-total-${idx}`;
  markField(totalInput, item.total_price === null || item.total_price === undefined);
  tdTotal.appendChild(totalInput);
  tr.appendChild(tdTotal);

  renderMatchArea(idx, item.suggestions || []);
  return tr;
}

function renderMatchArea(idx, suggestions) {
  const el = document.getElementById(`item-match-${idx}`);
  if (!el) return;
  const state = itemState[idx];

  if (state.confirmed) {
    el.innerHTML = `<span class="confirmed-chip">✔ ຈື່ໄວ້: ${escapeHtml(state.matched_name)}</span>`;
    return;
  }

  const chips = suggestions
    .filter((s) => s.score >= SHOW_SUGGESTION_SCORE)
    .map(
      (s) =>
        `<span class="match-chip" data-pid="${s.product_id}" data-name="${escapeAttr(s.canonical_name)}" data-idx="${idx}">
          🔗 ${escapeHtml(s.canonical_name)} (${Math.round(s.score * 100)}%)
        </span>`
    )
    .join("");

  el.innerHTML = `${chips}<span class="new-chip" data-idx="${idx}" data-action="new">✚ ສິນຄ້າໃໝ່</span>`;

  el.querySelectorAll(".match-chip").forEach((chip) => {
    chip.addEventListener("click", () => confirmExisting(idx, Number(chip.dataset.pid), chip.dataset.name));
  });
  el.querySelectorAll('[data-action="new"]').forEach((chip) => {
    chip.addEventListener("click", () => confirmNew(idx));
  });
}

async function onNameChanged(idx) {
  const nameInput = document.getElementById(`item-name-${idx}`);
  const text = nameInput.value.trim();
  itemState[idx].matched_name = text;
  itemState[idx].confirmed = false;
  itemState[idx].product_id = null;
  if (!text) { renderMatchArea(idx, []); return; }

  try {
    const res = await fetch(`${API_BASE}/api/products/suggest?text=${encodeURIComponent(text)}`);
    const suggestions = await res.json();
    if (currentResult && currentResult.items[idx]) currentResult.items[idx].suggestions = suggestions;
    renderMatchArea(idx, suggestions);
  } catch (err) {
    console.error(err);
  }
}

async function confirmExisting(idx, productId, canonicalName) {
  const rawText = (document.getElementById(`item-name-${idx}`).value || "").trim();
  const storeName = document.getElementById("fStoreName").value || "";
  try {
    await fetch(`${API_BASE}/api/products/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: rawText, store_name: storeName, mode: "existing", product_id: productId }),
    });
    itemState[idx] = { product_id: productId, matched_name: canonicalName, confirmed: true, isNew: false };
    document.getElementById(`item-name-${idx}`).value = canonicalName;
    renderMatchArea(idx, []);
  } catch (err) {
    alert("ບັນທຶກການຈັບຄູ່ບໍ່ສຳເລັດ: " + err.message);
  }
}

async function confirmNew(idx) {
  const nameInput = document.getElementById(`item-name-${idx}`);
  const name = (nameInput.value || "").trim();
  if (!name) { alert("ກະລຸນາໃສ່ຊື່ສິນຄ້າກ່ອນ"); return; }
  const storeName = document.getElementById("fStoreName").value || "";
  try {
    const res = await fetch(`${API_BASE}/api/products/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: name, store_name: storeName, mode: "new", canonical_name: name }),
    });
    const product = await res.json();
    itemState[idx] = { product_id: product.id, matched_name: product.canonical_name, confirmed: true, isNew: true };
    renderMatchArea(idx, []);
  } catch (err) {
    alert("ສ້າງສິນຄ້າໃໝ່ບໍ່ສຳເລັດ: " + err.message);
  }
}

// ---------------- save receipt ----------------
document.getElementById("btnSave").addEventListener("click", async () => {
  if (!currentResult) return;
  const saveStatus = document.getElementById("saveStatus");
  setStatus(saveStatus, "⏳ ກຳລັງບັນທຶກ...", "");

  for (let idx = 0; idx < itemState.length; idx++) {
    if (!itemState[idx].product_id) {
      const nameInput = document.getElementById(`item-name-${idx}`);
      const name = (nameInput.value || "").trim();
      if (name) await confirmNew(idx);
    }
  }

  const items = itemState.map((st, idx) => ({
    product_id: st.product_id,
    raw_text: currentResult.items[idx].raw_text,
    matched_name: document.getElementById(`item-name-${idx}`).value,
    quantity: numOrNull(document.getElementById(`item-qty-${idx}`).value),
    unit_price: numOrNull(document.getElementById(`item-unit-${idx}`).value),
    total_price: numOrNull(document.getElementById(`item-total-${idx}`).value),
    confidence: currentResult.items[idx].confidence,
  }));

  const payload = {
    store_name: document.getElementById("fStoreName").value || null,
    receipt_date: document.getElementById("fDate").value || null,
    receipt_time: document.getElementById("fTime").value || null,
    currency: document.getElementById("fCurrency").value || null,
    grand_total: numOrNull(document.getElementById("fGrandTotal").value),
    raw_json: currentResult,
    image_name: currentResult.image_name || null,
    items,
  };

  try {
    const res = await fetch(`${API_BASE}/api/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || "ບັນທຶກບໍ່ສຳເລັດ");
    setStatus(saveStatus, "✅ ບັນທຶກສຳເລັດ (ລະຫັດໃບບິນ #" + saved.id + ")", "success");
  } catch (err) {
    setStatus(saveStatus, "❌ " + err.message, "error");
  }
});

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// ---------------- products view ----------------
async function loadProducts() {
  const container = document.getElementById("productsList");
  container.innerHTML = "ກຳລັງໂຫລດ...";
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    const products = await res.json();
    if (!products.length) {
      container.innerHTML = '<p class="empty-state">ຍັງບໍ່ມີສິນຄ້າທີ່ຈື່ໄວ້</p>';
      return;
    }
    container.innerHTML = products
      .map(
        (p) => `
      <div class="product-card">
        <div class="product-name">${escapeHtml(p.canonical_name)}</div>
        <div class="product-aliases">
          ${p.aliases.map((a) => `<span class="alias-tag">${escapeHtml(a.alias_text)}${a.store_name ? " · " + escapeHtml(a.store_name) : ""}</span>`).join("") || '<span class="alias-tag">ບໍ່ມີຊື່ອື່ນ</span>'}
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = "ໂຫລດຜິດພາດ: " + err.message;
  }
}

// ---------------- history view ----------------
async function loadHistory() {
  const container = document.getElementById("historyList");
  container.innerHTML = "ກຳລັງໂຫລດ...";
  try {
    const res = await fetch(`${API_BASE}/api/receipts`);
    const receipts = await res.json();
    if (!receipts.length) {
      container.innerHTML = '<p class="empty-state">ຍັງບໍ່ມີໃບບິນທີ່ບັນທຶກໄວ້</p>';
      return;
    }
    container.innerHTML = receipts
      .map(
        (r) => `
      <div class="history-card">
        <div>
          <div><strong>${escapeHtml(r.store_name || "ບໍ່ຮູ້ຮ້ານ")}</strong></div>
          <div class="history-meta">${escapeHtml(r.receipt_date || "-")} ${escapeHtml(r.receipt_time || "")}</div>
        </div>
        <div class="history-total">${r.grand_total ?? "-"} ${escapeHtml(r.currency || "")}</div>
      </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = "ໂຫລດຜິດພາດ: " + err.message;
  }
}

// ---------------- utils ----------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}
