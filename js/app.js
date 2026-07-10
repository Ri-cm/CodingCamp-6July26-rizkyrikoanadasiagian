/**
 * Expense & Budget Visualizer — app.js
 *
 * Single-file Vanilla JavaScript application.
 * No frameworks, no build tools — runs directly in the browser.
 *
 * Sections:
 *  1. Storage
 *  2. Validator
 *  3. State Manager
 *  4. Balance Renderer
 *  5. Transaction List Renderer
 *  6. Chart Renderer
 *  7. Form Handler
 *  8. App Init
 */

'use strict';

/* ============================================================
   1. STORAGE
   ============================================================ */

const STORAGE_KEY = 'expense_visualizer_transactions';

/**
 * Persist the transactions array to localStorage as JSON.
 * Silently continues in-memory if localStorage is unavailable.
 * @param {Transaction[]} transactions
 */
function saveToStorage(transactions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (err) {
    console.warn('Storage unavailable: could not save transactions.', err);
  }
}

/**
 * Read and parse the stored transactions array.
 * Returns [] when the key is absent, null, or the value is corrupt JSON.
 * Overwrites corrupt data with an empty array before returning.
 * @returns {Transaction[]}
 */
function readFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  try {
    return JSON.parse(raw);
  } catch {
    saveToStorage([]);
    return [];
  }
}

/* ============================================================
   2. VALIDATOR
   ============================================================ */

const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];
const AMOUNT_MIN = 0.01;
const AMOUNT_MAX = 999999.99;

/**
 * Validate raw form values before creating a transaction.
 *
 * @param {{ itemName: string, amount: string, category: string }} values
 * @returns {{ valid: boolean, errors: { itemName?: string, amount?: string, category?: string } }}
 */
function validateTransaction({ itemName, amount, category }) {
  const errors = {};

  // Item name: non-empty after trim, max 100 chars
  if (typeof itemName !== 'string' || itemName.trim().length === 0) {
    errors.itemName = 'Item name is required.';
  } else if (itemName.trim().length > 100) {
    errors.itemName = 'Item name must be 100 characters or fewer.';
  }

  // Amount: parseable number within [0.01, 999999.99]
  const parsed = Number(amount);
  if (amount === '' || amount == null || !isFinite(parsed) || isNaN(parsed)) {
    errors.amount = 'Please enter a valid amount.';
  } else if (parsed < AMOUNT_MIN || parsed > AMOUNT_MAX) {
    errors.amount = `Amount must be between $0.01 and $999,999.99.`;
  }

  // Category: must be one of the three valid options
  if (!VALID_CATEGORIES.includes(category)) {
    errors.category = 'Please select a category.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ============================================================
   3. STATE MANAGER
   ============================================================ */

/**
 * @typedef {{ id: string, itemName: string, amount: number, category: string }} Transaction
 */

/** @type {Transaction[]} Newest-first in-memory list */
let transactions = [];

/**
 * Add a new transaction, persist, and re-render all UI.
 * @param {string} itemName
 * @param {number} amount
 * @param {string} category
 */
function addTransaction(itemName, amount, category) {
  const tx = {
    id: crypto.randomUUID(),
    itemName,
    amount,
    category,
  };
  transactions = [tx, ...transactions]; // prepend → newest at index 0
  saveToStorage(transactions);
  renderList();
  renderBalance();
  renderChart();
}

/**
 * Delete a transaction by ID, persist, and re-render all UI.
 * @param {string} id
 */
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveToStorage(transactions);
  renderList();
  renderBalance();
  renderChart();
}

/* ============================================================
   4. BALANCE RENDERER
   ============================================================ */

/**
 * Sum all amounts, round to 2 dp, return a "$X.XX" string.
 * Returns "$0.00" for an empty array.
 * @param {Transaction[]} txns
 * @returns {string}
 */
function formatBalance(txns) {
  if (!txns || txns.length === 0) return '$0.00';
  const sum = txns.reduce((acc, t) => acc + t.amount, 0);
  return `$${(Math.round(sum * 100) / 100).toFixed(2)}`;
}

/** Update the #balance-display element with the current total. */
function renderBalance() {
  const el = document.getElementById('balance-display');
  if (el) el.textContent = formatBalance(transactions);
}

/* ============================================================
   5. TRANSACTION LIST RENDERER
   ============================================================ */

/**
 * Build a single <li> element for one transaction.
 * @param {Transaction} tx
 * @returns {HTMLLIElement}
 */
function createTransactionElement(tx) {
  const li = document.createElement('li');
  li.className = 'transaction-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'item-name';
  nameSpan.textContent = tx.itemName;

  const amountSpan = document.createElement('span');
  amountSpan.className = 'item-amount';
  amountSpan.textContent = `$${tx.amount.toFixed(2)}`;

  const categorySpan = document.createElement('span');
  const catClass = 'cat-' + tx.category.toLowerCase();
  categorySpan.className = `item-category ${catClass}`;
  categorySpan.textContent = tx.category;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete';
  deleteBtn.dataset.id = tx.id;
  deleteBtn.textContent = 'Delete';
  deleteBtn.setAttribute('aria-label', `Delete ${tx.itemName}`);

  li.append(nameSpan, amountSpan, categorySpan, deleteBtn);
  return li;
}

/** Re-render the full transaction list from the in-memory array. */
function renderList() {
  const container = document.getElementById('transaction-list-container');
  const emptyMsg  = document.getElementById('empty-state-msg');
  if (!container) return;

  // Remove existing items (keep the empty-state paragraph in the DOM)
  container.querySelectorAll('.transaction-item').forEach(el => el.remove());

  if (transactions.length === 0) {
    if (emptyMsg) emptyMsg.style.display = '';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  transactions.forEach(tx => container.appendChild(createTransactionElement(tx)));
}

/* ============================================================
   6. CHART RENDERER
   ============================================================ */

/** @type {import('chart.js').Chart|null} */
let chartInstance = null;

/** Initialise the Chart.js pie instance. Call once on DOMContentLoaded. */
function initChart() {
  const canvas    = document.getElementById('spending-chart');
  const noDataMsg = document.getElementById('no-data-msg');
  const section   = document.getElementById('chart-section');

  try {
    if (typeof window.Chart === 'undefined') throw new Error('Chart.js not loaded');

    chartInstance = new window.Chart(canvas, {
      type: 'pie',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: ['#f59e0b', '#3b82f6', '#ec4899'],
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const val   = ctx.dataset.data[ctx.dataIndex];
                const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return ` ${ctx.label}: $${val.toFixed(2)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.warn('Chart unavailable:', err.message);
    if (canvas)    canvas.style.display = 'none';
    if (noDataMsg) {
      noDataMsg.textContent   = 'Chart unavailable — check your internet connection.';
      noDataMsg.style.display = 'block';
    }
  }
}

/** Update chart data from the current transactions array. */
function renderChart() {
  const canvas    = document.getElementById('spending-chart');
  const noDataMsg = document.getElementById('no-data-msg');
  if (!chartInstance) return;

  // Derive category totals
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  transactions.forEach(t => { if (t.category in totals) totals[t.category] += t.amount; });

  const activeKeys = Object.keys(totals).filter(k => totals[k] > 0);
  const data       = activeKeys.map(k => totals[k]);

  if (activeKeys.length === 0) {
    if (canvas)    canvas.style.display    = 'none';
    if (noDataMsg) noDataMsg.style.display = 'block';
    return;
  }

  if (canvas)    canvas.style.display    = '';
  if (noDataMsg) noDataMsg.style.display = 'none';

  const total  = data.reduce((a, b) => a + b, 0);
  const labels = activeKeys.map(k => {
    const pct = total > 0 ? ((totals[k] / total) * 100).toFixed(1) : '0.0';
    return `${k} ${pct}%`;
  });

  chartInstance.data.labels            = labels;
  chartInstance.data.datasets[0].data  = data;
  chartInstance.update();
}

/* ============================================================
   7. FORM HANDLER
   ============================================================ */

/** Read raw string values from the three form fields. */
function getFormValues() {
  return {
    itemName: document.getElementById('item-name').value,
    amount:   document.getElementById('amount').value,
    category: document.getElementById('category').value,
  };
}

/**
 * Display inline error messages next to invalid fields;
 * clear errors on fields that are now valid.
 * @param {{ itemName?: string, amount?: string, category?: string }} errors
 */
function showErrors(errors) {
  const fields = ['item-name', 'amount', 'category'];
  const errorIds = { 'item-name': 'item-name-error', amount: 'amount-error', category: 'category-error' };
  const errorKeys = { 'item-name': 'itemName', amount: 'amount', category: 'category' };

  fields.forEach(field => {
    const span = document.getElementById(errorIds[field]);
    const key  = errorKeys[field];
    if (!span) return;
    if (errors[key]) {
      span.textContent = errors[key];
      span.classList.add('visible');
    } else {
      span.textContent = '';
      span.classList.remove('visible');
    }
  });
}

/** Reset all form fields to their default/empty state. */
function resetForm() {
  document.getElementById('item-name').value = '';
  document.getElementById('amount').value    = '';
  document.getElementById('category').selectedIndex = 0;
  // Clear any lingering error messages
  showErrors({});
}

/** Attach the submit listener to the form. */
function initForm() {
  const form = document.getElementById('transaction-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = getFormValues();
    const { valid, errors } = validateTransaction(values);

    if (!valid) {
      showErrors(errors);
      return;
    }

    addTransaction(values.itemName.trim(), parseFloat(values.amount), values.category);
    resetForm();
  });

  // Wire delete button clicks via event delegation on the list container
  const container = document.getElementById('transaction-list-container');
  if (container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (btn) deleteTransaction(btn.dataset.id);
    });
  }
}

/* ============================================================
   8. APP INIT
   ============================================================ */

/**
 * Load saved transactions from localStorage, then trigger a full render.
 * Called after initChart() so the chart is ready to receive data.
 */
function loadFromStorage() {
  transactions = readFromStorage();
  renderList();
  renderBalance();
  renderChart();
}

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  loadFromStorage();
  initForm();
});
