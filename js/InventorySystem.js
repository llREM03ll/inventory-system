/**
 * InventorySystem.js
 * Core business logic — all values read from settings, never hardcoded.
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
  constructor(cfg) {
    // cfg comes from getSettings()
    const p = cfg?.prices || {};
    this.M  = new Item("Medium",        p.M  ?? 29);
    this.L  = new Item("Large",         p.L  ?? 39);
    this.S  = new Item("Small",         p.S  ?? 25);
    this.MC = new Item("Iced Coffee M", p.MC ?? 35);
    this.LC = new Item("Iced Coffee L", p.LC ?? 45);
    this.HC = new Item("Hot Coffee",    p.HC ?? 45);

    this.salaryBase           = cfg?.salaryBase           ?? 350;
    this.salaryBonusThreshold = cfg?.salaryBonusThreshold ?? 3000;
    this.salaryBonusPerK      = cfg?.salaryBonusPerK      ?? 50;

    this.expensesList = [];
    this.expenses     = 0;
    this.addons       = 0;
  }

  setCupsM(begin, end, tallyMC)  { this.M.usedCups  = (begin - end) - tallyMC; }
  setCupsL(begin, end, tallyLC)  { this.L.usedCups  = (begin - end) - tallyLC; }
  setCupsS(begin, end)           { this.S.usedCups  = (begin - end); }
  setCupsHC(begin, end)          { this.HC.usedCups = (begin - end); }
  setMC(tally)                   { this.MC.usedCups = tally; }
  setLC(tally)                   { this.LC.usedCups = tally; }

  setExpenses(list) {
    this.expensesList = list;
    this.expenses     = list.reduce((s, i) => s + i.price, 0);
  }
  setAddons(amount) { this.addons = amount; }

  computeTotalCupSale() {
    return this.M.total + this.L.total + this.S.total +
           this.MC.total + this.LC.total + this.HC.total;
  }

  computeSalaryBonus(totalSales) {
    // No salary if cup sales don't even cover the base wage
    if (totalSales < this.salaryBase) return 0;
    let salary = this.salaryBase;
    if (totalSales >= this.salaryBonusThreshold) {
      salary += this.salaryBonusPerK;
      salary += Math.floor((totalSales - this.salaryBonusThreshold) / 1000) * this.salaryBonusPerK;
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
