/**
 * Stats & Analytics Helper - Błyskawiczne statystyki zaznaczenia i kolumn
 */

const CSVStats = {
  /**
   * Sprawdza czy string reprezentuje poprawną liczbę (obsługuje przecinek i kropkę jako separator dziesiętny)
   */
  parseNumber(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return null;
    const clean = String(str).trim().replace(/\s/g, '').replace(',', '.');
    if (clean === '') return null;
    const num = Number(clean);
    return isNaN(num) ? null : num;
  },

  /**
   * Oblicza statystyki dla zestawu komórek
   */
  calculate(values = []) {
    let totalCount = values.length;
    let filledCount = 0;
    let emptyCount = 0;
    let numbers = [];
    const frequency = new Map();

    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      const str = (raw === null || raw === undefined) ? '' : String(raw).trim();

      if (str === '') {
        emptyCount++;
      } else {
        filledCount++;
        frequency.set(str, (frequency.get(str) || 0) + 1);

        const num = this.parseNumber(str);
        if (num !== null) {
          numbers.push(num);
        }
      }
    }

    const uniqueCount = frequency.size;
    const isNumeric = numbers.length > 0 && numbers.length >= filledCount * 0.7; // jeśli większość to liczby

    let sum = 0;
    let avg = 0;
    let min = null;
    let max = null;

    if (numbers.length > 0) {
      sum = numbers.reduce((a, b) => a + b, 0);
      avg = sum / numbers.length;
      min = Math.min(...numbers);
      max = Math.max(...numbers);
    }

    // Top 5 najczęstszych wartości
    const topValues = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([val, count]) => ({
        value: val,
        count: count,
        percent: ((count / Math.max(filledCount, 1)) * 100).toFixed(1)
      }));

    return {
      totalCount,
      filledCount,
      emptyCount,
      uniqueCount,
      numericCount: numbers.length,
      isNumeric,
      sum: numbers.length > 0 ? sum : null,
      avg: numbers.length > 0 ? avg : null,
      min,
      max,
      topValues
    };
  },

  /**
   * Formatuje liczbę do ładnego wyświetlania (np. 1 234,56)
   */
  formatNumber(val) {
    if (val === null || val === undefined) return '-';
    // Zaokrąglenie do 4 miejsc po przecinku jeśli to ułamek
    const rounded = Math.abs(val) < 0.0001 && val !== 0 ? val.toExponential(2) : Number(val.toFixed(4)).toString();
    const parts = rounded.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',');
  }
};

if (typeof window !== 'undefined') {
  window.CSVStats = CSVStats;
}
