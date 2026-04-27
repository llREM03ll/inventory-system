/**
 * InventorySystem.js
 * Core business logic.
 *
 * Cup sharing (simplified):
 *   M cup  = Milktea M + Iced Coffee M (MC) + Fruit Tea M  — all ₱29
 *   L cup  = Milktea L + Iced Coffee L (LC) + Fruit Tea L  — all ₱39
 *   S cup  = Milktea S  — ₱25
 *   HC cup = Hot Coffee — ₱45
 *
 * Fruit Tea is POS-only for flavor tracking.
 * Its cups are already subtracted from endM/endL by the POS,
 * so inventory just sees them as regular M/L cups sold.
 */

class Item {
  constructor(name, price) {
    this.name     = name;
    this.price    = price;
    this.usedCups = 0;
  }
  get total() { return this.usedCups * this.price; }
}

class InventorySystem {
  constructor() {
    this.M  = new Item("Medium",        29);
    this.L  = new Item("Large",         39);
    this.S  = new Item("Small",         25);
    this.MC = new Item("Iced Coffee M", 35);
    this.LC = new Item("Iced Coffee L", 45);
    this.HC = new Item("Hot Coffee",    45);

    this.expensesList = [];
    this.expenses     = 0;
    this.addons       = 0;
  }

  // ── Cup setters ──────────────────────────────────────────────────────────
  setCupsM(begin, end, tallyMC)  { this.M.usedCups  = (begin - end) - tallyMC; }
  setCupsL(begin, end, tallyLC)  { this.L.usedCups  = (begin - end) - tallyLC; }
  setCupsS(begin, end)           { this.S.usedCups  = (begin - end); }
  setCupsHC(begin, end)          { this.HC.usedCups = (begin - end); }
  setMC(tally)                   { this.MC.usedCups  = tally; }
  setLC(tally)                   { this.LC.usedCups  = tally; }

  // ── Financial setters ────────────────────────────────────────────────────
  setExpenses(list) {
    this.expensesList = list;
    this.expenses     = list.reduce((s, i) => s + i.price, 0);
  }
  setAddons(amount) { this.addons = amount; }

  // ── Computations ─────────────────────────────────────────────────────────
  computeTotalCupSale() {
    return this.M.total + this.L.total + this.S.total +
           this.MC.total + this.LC.total + this.HC.total;
  }

  computeSalaryBonus(totalSales) {
    let salary = 350;
    if (totalSales >= 3000) {
      salary += 50;
      salary += Math.floor((totalSales - 3000) / 1000) * 50;
    }
    return salary;
  }

  computeGrossIncome(salary) {
    return this.computeTotalCupSale() - (this.expenses + salary);
  }

  computeFinalTotal(salary) {
    return this.computeGrossIncome(salary) + this.addons;
  }
}
