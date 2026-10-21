const STORAGE_KEY = "morrow-budget-dashboard-v1";
const CENTS = 100;
const DEFAULT_CATEGORIES = ["Housing", "Food", "Transport", "Utilities", "Health", "Other"];
const state = loadState();

const elements = {
  month: document.querySelector("#month-picker"),
  budget: document.querySelector("#monthly-budget-value"),
  spent: document.querySelector("#spent-value"),
  remaining: document.querySelector("#remaining-value"),
  goals: document.querySelector("#goals-value"),
  savings: document.querySelector("#savings-value"),
  investments: document.querySelector("#investments-value"),
  progress: document.querySelector("#budget-progress"),
  progressCopy: document.querySelector("#budget-progress-copy"),
  spentCount: document.querySelector("#spent-count"),
  remainingCopy: document.querySelector("#remaining-copy"),
  categoryList: document.querySelector("#category-list"),
  recurringList: document.querySelector("#recurring-list"),
  transactionRows: document.querySelector("#transaction-rows"),
  transactionEmpty: document.querySelector("#transaction-empty"),
  alertStrip: document.querySelector("#alert-strip"),
  alertCopy: document.querySelector("#alert-copy"),
  transactionDialog: document.querySelector("#transaction-dialog"),
  budgetDialog: document.querySelector("#budget-dialog"),
  categoriesDialog: document.querySelector("#categories-dialog"),
  recurringDialog: document.querySelector("#recurring-dialog"),
  toast: document.querySelector("#toast"),
};

function emptyState() {
  return {
    version: 1,
    monthlyBudgetCents: 0,
    categories: DEFAULT_CATEGORIES.map((name) => ({ name, budgetCents: 0 })),
    transactions: [],
    recurring: [],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1) return emptyState();
    return {
      ...emptyState(),
      ...saved,
      categories: Array.isArray(saved.categories) ? saved.categories : [],
      transactions: Array.isArray(saved.transactions) ? saved.transactions : [],
      recurring: Array.isArray(saved.recurring) ? saved.recurring : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(cents) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
    .format((Number(cents) || 0) / CENTS);
}

function parseCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount + Number.EPSILON) * CENTS);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return localDateString().slice(0, 7);
}

function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function selectedTransactions() {
  return state.transactions.filter((item) => item.date.slice(0, 7) === elements.month.value);
}

function sumKind(transactions, kind) {
  return transactions.reduce((total, item) => total + (item.type === kind ? item.amountCents : 0), 0);
}

function categorySpent(transactions, categoryName) {
  const category = categoryName.toLocaleLowerCase();
  return transactions.reduce((total, item) => (
    item.type === "expense" && (item.category || "").toLocaleLowerCase() === category
      ? total + item.amountCents
      : total
  ), 0);
}

function applyRecurring() {
  const today = new Date();
  const month = currentMonth();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let added = 0;

  for (const item of state.recurring) {
    const dueDay = Math.min(Math.max(1, Number(item.dueDay) || 1), lastDay);
    if (today.getDate() < dueDay || item.lastAppliedMonth === month) continue;

    state.transactions.push({
      id: crypto.randomUUID(),
      type: "expense",
      description: item.description,
      category: item.category,
      amountCents: item.amountCents,
      date: `${month}-${String(dueDay).padStart(2, "0")}`,
      recurringId: item.id,
    });
    item.lastAppliedMonth = month;
    added += 1;
  }

  if (added > 0) {
    saveState();
    showToast(`${added} recurring ${added === 1 ? "expense was" : "expenses were"} added for this month.`);
  }
}

function renderSummary() {
  const transactions = selectedTransactions();
  const expenses = sumKind(transactions, "expense");
  const savings = sumKind(transactions, "savings");
  const investments = sumKind(transactions, "investment");
  const outflow = expenses + savings + investments;
  const remaining = state.monthlyBudgetCents - outflow;
  const usedPercent = state.monthlyBudgetCents > 0
    ? Math.min(100, Math.max(0, outflow / state.monthlyBudgetCents * 100))
    : 0;

  document.querySelector("#month-eyebrow").textContent = monthLabel(elements.month.value).toLocaleUpperCase() + " OVERVIEW";
  elements.budget.textContent = money(state.monthlyBudgetCents);
  elements.spent.textContent = money(expenses);
  elements.remaining.textContent = money(remaining);
  elements.remaining.classList.toggle("is-negative", remaining < 0);
  elements.goals.textContent = money(savings + investments);
  elements.savings.textContent = `Savings ${money(savings)}`;
  elements.investments.textContent = `Invested ${money(investments)}`;
  elements.progress.style.width = `${usedPercent}%`;
  elements.progressCopy.textContent = state.monthlyBudgetCents > 0
    ? `${Math.round(usedPercent)}% of monthly plan used`
    : "Set your monthly plan";
  elements.spentCount.textContent = `${transactions.filter((item) => item.type === "expense").length} expense${transactions.filter((item) => item.type === "expense").length === 1 ? "" : "s"} recorded`;
  elements.remainingCopy.textContent = remaining < 0 ? "You are over your monthly plan" : "After expenses and contributions";
}

function renderCategories() {
  const transactions = selectedTransactions();
  const alerts = [];
  elements.categoryList.replaceChildren();

  if (state.categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "category-empty";
    empty.textContent = "Add a category and monthly limit to track spending pace.";
    elements.categoryList.append(empty);
  }

  for (const category of state.categories) {
    const spent = categorySpent(transactions, category.name);
    const limit = Number(category.budgetCents) || 0;
    const percent = limit > 0 ? spent / limit * 100 : 0;
    const row = document.createElement("div");
    row.className = "category-row";

    const name = document.createElement("div");
    name.className = "category-name";
    name.textContent = category.name;

    const track = document.createElement("div");
    track.className = "category-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${category.name} budget used`);
    track.setAttribute("aria-valuenow", String(Math.min(100, Math.round(percent))));
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    const fill = document.createElement("span");
    fill.style.width = `${Math.min(100, percent)}%`;
    if (percent >= 100) fill.classList.add("is-over");
    else if (percent >= 75) fill.classList.add("is-warning");
    track.append(fill);

    const amount = document.createElement("div");
    amount.className = "category-amount";
    amount.textContent = limit > 0 ? `${money(spent)} ` : `${money(spent)} `;
    if (limit > 0) {
      const limitLabel = document.createElement("small");
      limitLabel.textContent = `/ ${money(limit)}`;
      amount.append(limitLabel);
    } else {
      const noLimit = document.createElement("small");
      noLimit.textContent = "/ no limit";
      amount.append(noLimit);
    }

    row.append(name, track, amount);
    if (limit > 0 && percent >= 75) {
      const warning = document.createElement("div");
      warning.className = `category-warning${percent >= 100 ? " is-over" : ""}`;
      warning.textContent = percent >= 100
        ? `Over category limit by ${money(spent - limit)}`
        : `Heads up: ${Math.round(percent)}% of this category limit used`;
      row.append(warning);
      alerts.push(`${category.name} (${Math.round(percent)}%)`);
    }
    elements.categoryList.append(row);
  }

  elements.alertStrip.hidden = alerts.length === 0;
  elements.alertCopy.textContent = alerts.join(" · ");
}

function renderTransactions() {
  const transactions = selectedTransactions().sort((left, right) => right.date.localeCompare(left.date));
  elements.transactionRows.replaceChildren();
  elements.transactionEmpty.hidden = transactions.length > 0;
  document.querySelector(".transaction-table").hidden = transactions.length === 0;

  for (const item of transactions.slice(0, 8)) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const nameWrap = document.createElement("div");
    nameWrap.className = "transaction-name";
    const initials = document.createElement("span");
    initials.className = `transaction-avatar kind-${item.type}`;
    initials.textContent = item.type === "expense" ? (item.category || "E").slice(0, 1) : item.type.slice(0, 1);
    const detail = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.description;
    const subline = document.createElement("small");
    subline.textContent = item.recurringId ? "Recurring expense" : item.type[0].toUpperCase() + item.type.slice(1);
    detail.append(title, subline);
    nameWrap.append(initials, detail);
    nameCell.append(nameWrap);

    const categoryCell = document.createElement("td");
    categoryCell.className = "transaction-category";
    categoryCell.textContent = item.category || (item.type === "savings" ? "Savings" : item.type === "investment" ? "Investments" : "—");
    const dateCell = document.createElement("td");
    dateCell.className = "transaction-date";
    dateCell.textContent = new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const amountCell = document.createElement("td");
    amountCell.className = `transaction-amount ${item.type === "expense" ? "is-expense" : "is-positive"}`;
    amountCell.textContent = `${item.type === "expense" ? "−" : "+"}${money(item.amountCents)}`;
    const actionCell = document.createElement("td");
    actionCell.className = "action-cell";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.dataset.deleteTransaction = item.id;
    deleteButton.setAttribute("aria-label", `Delete ${item.description}`);
    deleteButton.title = "Delete transaction";
    deleteButton.textContent = "×";
    actionCell.append(deleteButton);
    row.append(nameCell, categoryCell, dateCell, amountCell, actionCell);
    elements.transactionRows.append(row);
  }
}

function renderRecurring() {
  elements.recurringList.replaceChildren();
  if (state.recurring.length === 0) {
    const empty = document.createElement("p");
    empty.className = "recurring-empty";
    empty.textContent = "Rent, subscriptions, and other monthly expenses can go here.";
    elements.recurringList.append(empty);
    return;
  }

  for (const item of state.recurring) {
    const row = document.createElement("div");
    row.className = "recurring-row";
    const icon = document.createElement("span");
    icon.className = "recurring-icon";
    icon.textContent = String(item.dueDay).padStart(2, "0");
    const info = document.createElement("span");
    info.className = "recurring-info";
    const title = document.createElement("strong");
    title.textContent = item.description;
    const meta = document.createElement("span");
    meta.textContent = `${item.category} · day ${item.dueDay} monthly`;
    info.append(title, meta);
    const amount = document.createElement("span");
    amount.className = "recurring-amount";
    amount.textContent = money(item.amountCents);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "delete-button recurring-delete";
    removeButton.dataset.deleteRecurring = item.id;
    removeButton.setAttribute("aria-label", `Remove recurring expense ${item.description}`);
    removeButton.title = "Remove recurring rule";
    removeButton.textContent = "×";
    row.append(icon, info, amount, removeButton);
    elements.recurringList.append(row);
  }
}

function renderCategorySelects() {
  for (const selector of ["#transaction-category", "#recurring-category"]) {
    const select = document.querySelector(selector);
    const selected = select.value;
    select.replaceChildren();
    for (const category of state.categories) {
      const option = document.createElement("option");
      option.value = category.name;
      option.textContent = category.name;
      select.append(option);
    }
    if (selected && state.categories.some((category) => category.name === selected)) select.value = selected;
  }
}

function render() {
  renderCategorySelects();
  renderSummary();
  renderCategories();
  renderTransactions();
  renderRecurring();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3000);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function initializeMonth() {
  elements.month.value = currentMonth();
  document.querySelector("#transaction-date").value = localDateString();
}

document.querySelectorAll("[data-open-transaction]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#transaction-date").value = localDateString();
    openDialog(elements.transactionDialog);
  });
});

document.querySelectorAll("[data-open-budget]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#monthly-budget-input").value = (state.monthlyBudgetCents / CENTS).toFixed(2);
    openDialog(elements.budgetDialog);
  });
});

document.querySelectorAll("[data-open-categories]").forEach((button) => {
  button.addEventListener("click", () => {
    const fields = document.querySelector("#category-budget-fields");
    fields.replaceChildren();
    for (const category of state.categories) {
      const row = document.createElement("div");
      row.className = "category-budget-row";
      const label = document.createElement("label");
      label.textContent = category.name;
      const amount = document.createElement("div");
      amount.className = "money-input";
      const dollar = document.createElement("span");
      dollar.textContent = "$";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.01";
      input.value = (category.budgetCents / CENTS).toFixed(2);
      input.dataset.category = category.name;
      input.setAttribute("aria-label", `${category.name} monthly limit`);
      amount.append(dollar, input);
      row.append(label, amount);
      fields.append(row);
    }
    openDialog(elements.categoriesDialog);
  });
});

document.querySelectorAll("[data-open-recurring]").forEach((button) => {
  button.addEventListener("click", () => openDialog(elements.recurringDialog));
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => closeDialog(button.closest("dialog")));
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("nav-item")) {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item === button));
    }
    document.querySelector(`#${button.dataset.view}`).scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

elements.transactionRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-transaction]");
  if (!button) return;
  const transaction = state.transactions.find((item) => item.id === button.dataset.deleteTransaction);
  if (!transaction || !window.confirm(`Delete "${transaction.description}"?`)) return;
  state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
  saveState();
  render();
  showToast("Transaction deleted.");
});

elements.recurringList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-recurring]");
  if (!button) return;
  const recurring = state.recurring.find((item) => item.id === button.dataset.deleteRecurring);
  if (!recurring || !window.confirm(`Stop adding "${recurring.description}" in future months? Existing entries will remain.`)) return;
  state.recurring = state.recurring.filter((item) => item.id !== recurring.id);
  saveState();
  render();
  showToast("Recurring rule removed. Existing entries were kept.");
});

document.querySelector("#previous-month").addEventListener("click", () => stepMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => stepMonth(1));
elements.month.addEventListener("change", render);

function stepMonth(amount) {
  const [year, month] = elements.month.value.split("-").map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  elements.month.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  render();
}

document.querySelector("#transaction-type").addEventListener("change", (event) => {
  document.querySelector("#transaction-category-wrap").hidden = event.target.value !== "expense";
});

document.querySelector("#transaction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = document.querySelector("#transaction-type").value;
  const amountCents = parseCents(document.querySelector("#transaction-amount").value);
  if (!amountCents || amountCents < 1) return showToast("Enter an amount greater than zero.");

  const item = {
    id: crypto.randomUUID(),
    type,
    description: document.querySelector("#transaction-description").value.trim(),
    amountCents,
    date: document.querySelector("#transaction-date").value,
  };
  if (type === "expense") item.category = document.querySelector("#transaction-category").value;
  state.transactions.push(item);
  saveState();
  closeDialog(elements.transactionDialog);
  event.currentTarget.reset();
  document.querySelector("#transaction-date").value = localDateString();
  document.querySelector("#transaction-category-wrap").hidden = false;
  render();
  showToast("Transaction saved in this browser.");
});

document.querySelector("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseCents(document.querySelector("#monthly-budget-input").value);
  if (amount === null) return showToast("Enter a valid budget amount.");
  state.monthlyBudgetCents = amount;
  saveState();
  closeDialog(elements.budgetDialog);
  render();
  showToast("Monthly budget saved.");
});

document.querySelector("#categories-form").addEventListener("submit", (event) => {
  event.preventDefault();
  for (const input of document.querySelectorAll("#category-budget-fields input")) {
    const category = state.categories.find((item) => item.name === input.dataset.category);
    const amount = parseCents(input.value);
    if (category && amount !== null) category.budgetCents = amount;
  }

  const nameInput = document.querySelector("#new-category-name");
  const limitInput = document.querySelector("#new-category-limit");
  const name = nameInput.value.trim();
  if (name) {
    const amount = parseCents(limitInput.value || "0");
    if (amount === null) return showToast("Enter a valid category limit.");
    const existing = state.categories.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) existing.budgetCents = amount;
    else state.categories.push({ name, budgetCents: amount });
  }
  saveState();
  closeDialog(elements.categoriesDialog);
  event.currentTarget.reset();
  render();
  showToast("Category limits saved.");
});

document.querySelector("#recurring-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const amountCents = parseCents(document.querySelector("#recurring-amount").value);
  const dueDay = Number(document.querySelector("#recurring-day").value);
  if (!amountCents || amountCents < 1 || dueDay < 1 || dueDay > 31) {
    return showToast("Enter a positive amount and a due day from 1 to 31.");
  }
  state.recurring.push({
    id: crypto.randomUUID(),
    description: document.querySelector("#recurring-description").value.trim(),
    category: document.querySelector("#recurring-category").value,
    amountCents,
    dueDay,
    lastAppliedMonth: "",
  });
  saveState();
  applyRecurring();
  closeDialog(elements.recurringDialog);
  event.currentTarget.reset();
  render();
  showToast("Recurring expense saved.");
});

document.querySelector("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `morrow-budget-${currentMonth()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded.");
});

document.querySelector("#import-data").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (incoming.version !== 1 || !Array.isArray(incoming.categories) || !Array.isArray(incoming.transactions) || !Array.isArray(incoming.recurring)) {
      throw new Error("That file is not a Morrow Budget backup.");
    }
    if (!Number.isInteger(incoming.monthlyBudgetCents)) throw new Error("The backup has an invalid budget.");
    state.monthlyBudgetCents = incoming.monthlyBudgetCents;
    state.categories = incoming.categories;
    state.transactions = incoming.transactions;
    state.recurring = incoming.recurring;
    saveState();
    applyRecurring();
    render();
    showToast("Backup imported into this browser.");
  } catch (error) {
    showToast(error instanceof SyntaxError ? "Could not read that JSON backup." : error.message);
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#clear-data").addEventListener("click", () => {
  if (!window.confirm("Clear all Morrow Budget data stored in this browser? This cannot be undone unless you exported a backup.")) return;
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, emptyState());
  render();
  showToast("Local budget data cleared.");
});

initializeMonth();
applyRecurring();
render();