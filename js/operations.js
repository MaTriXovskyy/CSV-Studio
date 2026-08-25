/**
 * Data Operations Engine - Zaawansowane operacje na danych CSV (Excel Edition)
 * Sortowanie, Filtrowanie z listą wartości, Autouzupełnianie serii (Fill Handle),
 * Wykrywanie pustych kolumn, Wypełnianie w dół (Ctrl+D), SKU Builder
 */

const CSVOperations = {
  /**
   * Sortowanie tabeli według wybranej kolumny
   */
  sort(data, colIndex, ascending = true, hasHeader = false) {
    if (!data || data.length === 0) return data;

    const startRow = hasHeader ? 1 : 0;
    const headerRow = hasHeader ? data[0] : null;
    const rowsToSort = data.slice(startRow);

    rowsToSort.sort((rowA, rowB) => {
      const valA = (rowA[colIndex] === null || rowA[colIndex] === undefined) ? '' : String(rowA[colIndex]).trim();
      const valB = (rowB[colIndex] === null || rowB[colIndex] === undefined) ? '' : String(rowB[colIndex]).trim();

      // Puste komórki zawsze na koniec
      if (valA === '' && valB !== '') return 1;
      if (valA !== '' && valB === '') return -1;
      if (valA === '' && valB === '') return 0;

      // Sprawdź czy obie wartości są liczbami
      const numA = CSVStats.parseNumber(valA);
      const numB = CSVStats.parseNumber(valB);

      let comparison = 0;
      if (numA !== null && numB !== null) {
        comparison = numA - numB;
      } else {
        // Porównanie tekstowe z uwzględnieniem polskich znaków (localeCompare)
        comparison = valA.localeCompare(valB, 'pl', { numeric: true, sensitivity: 'base' });
      }

      return ascending ? comparison : -comparison;
    });

    return hasHeader ? [headerRow, ...rowsToSort] : rowsToSort;
  },

  /**
   * Pobiera unikalne wartości dla danej kolumny wraz z liczbą wystąpień (dla filtra Excel)
   */
  getUniqueColumnValues(data, colIndex, hasHeader = false) {
    if (!data || data.length === 0) return [];

    const startRow = hasHeader ? 1 : 0;
    const counts = new Map();

    for (let r = startRow; r < data.length; r++) {
      const val = data[r] && data[r][colIndex] !== undefined ? String(data[r][colIndex]) : '';
      counts.set(val, (counts.get(val) || 0) + 1);
    }

    const result = [];
    counts.forEach((count, value) => {
      result.push({ value, count });
    });

    result.sort((a, b) => {
      if (a.value === '' && b.value !== '') return 1;
      if (a.value !== '' && b.value === '') return -1;
      return a.value.localeCompare(b.value, 'pl', { numeric: true, sensitivity: 'base' });
    });

    return result;
  },

  /**
   * Filtruje wiersze na podstawie aktywnych filtrów (mapa: colIndex -> Set<dozwolone wartości>)
   */
  filterByValues(data, activeFiltersMap, hasHeader = false) {
    if (!data || data.length === 0) return { visibleIndices: [], hiddenCount: 0 };
    if (!activeFiltersMap || activeFiltersMap.size === 0) {
      return {
        visibleIndices: data.map((_, i) => i),
        hiddenCount: 0
      };
    }

    const startRow = hasHeader ? 1 : 0;
    const visibleIndices = [];

    if (hasHeader) {
      visibleIndices.push(0); // nagłówek zawsze widoczny
    }

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      let matches = true;

      for (const [colIndex, allowedValuesSet] of activeFiltersMap.entries()) {
        const cellVal = row && row[colIndex] !== undefined ? String(row[colIndex]) : '';
        if (!allowedValuesSet.has(cellVal)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        visibleIndices.push(r);
      }
    }

    return {
      visibleIndices,
      hiddenCount: data.length - visibleIndices.length
    };
  },

  /**
   * Zwraca listę indeksów kolumn, które są całkowicie puste we wszystkich wierszach danych
   */
  getEmptyColumns(data, hasHeader = true) {
    if (!data || data.length === 0) return [];
    const colCount = data[0] ? data[0].length : 0;
    const startRow = hasHeader ? 1 : 0;
    const emptyCols = [];

    for (let c = 0; c < colCount; c++) {
      let isEmpty = true;
      for (let r = startRow; r < data.length; r++) {
        const val = data[r] && data[r][c] !== undefined ? String(data[r][c]).trim() : '';
        if (val !== '') {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) {
        emptyCols.push(c);
      }
    }

    return emptyCols;
  },

  /**
   * Inteligentne generowanie serii autouzupełniania (Excel Fill Handle)
   */
  generateSeries(sourceValues, targetLength) {
    if (!sourceValues || sourceValues.length === 0 || targetLength <= 0) return [];

    const result = [];

    // Przypadek 1: Pojedyncza wartość źródłowa
    if (sourceValues.length === 1) {
      const val = String(sourceValues[0] || '');
      
      // Sprawdź czy kończy się liczbą (np. "BALOO 01", "ROYAL 06", "W88", "1")
      const numMatch = val.match(/^(.*?)(\d+)$/);

      if (numMatch) {
        const prefix = numMatch[1];
        const numStr = numMatch[2];
        const padLen = numStr.length;
        let currentNum = parseInt(numStr, 10);

        for (let i = 0; i < targetLength; i++) {
          currentNum++;
          const nextStr = String(currentNum).padStart(padLen, '0');
          result.push(prefix + nextStr);
        }
      } else {
        // Zwykły tekst bez liczb na końcu - powielanie wartości
        for (let i = 0; i < targetLength; i++) {
          result.push(val);
        }
      }
      return result;
    }

    // Przypadek 2: Wiele wartości źródłowych (wykrywanie kroku / powielanie wzorca)
    const isAllNumbers = sourceValues.every(v => CSVStats.parseNumber(String(v)) !== null);

    if (isAllNumbers && sourceValues.length >= 2) {
      const numbers = sourceValues.map(v => CSVStats.parseNumber(String(v)));
      const step = (numbers[numbers.length - 1] - numbers[0]) / (numbers.length - 1);
      let last = numbers[numbers.length - 1];

      for (let i = 0; i < targetLength; i++) {
        last += step;
        result.push(Number.isInteger(last) ? String(last) : last.toFixed(2));
      }
      return result;
    }

    // Wzorzec cykliczny (powielanie sekwencji)
    for (let i = 0; i < targetLength; i++) {
      result.push(sourceValues[i % sourceValues.length]);
    }

    return result;
  },

  /**
   * Wypełnianie w dół (Ctrl+D jak w Excelu)
   */
  fillDown(data, selection) {
    if (!data || !selection) return [];
    const { minRow, maxRow, minCol, maxCol } = selection;
    if (minRow === maxRow) {
      // Jeśli zaznaczono 1 wiersz, skopiuj z wiersza powyżej
      if (minRow === 0) return [];
      const changes = [];
      for (let c = minCol; c <= maxCol; c++) {
        const sourceVal = data[minRow - 1][c];
        const oldVal = data[minRow][c];
        if (sourceVal !== oldVal) {
          data[minRow][c] = sourceVal;
          changes.push({ row: minRow, col: c, oldValue: oldVal, newValue: sourceVal });
        }
      }
      return changes;
    }

    const changes = [];
    for (let r = minRow + 1; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const sourceVal = data[minRow][c];
        const oldVal = data[r][c];
        if (sourceVal !== oldVal) {
          data[r][c] = sourceVal;
          changes.push({ row: r, col: c, oldValue: oldVal, newValue: sourceVal });
        }
      }
    }
    return changes;
  },

  /**
   * Wyszukiwanie tekstu w tabeli
   */
  search(data, query, options = {}) {
    if (!data || query === undefined || query === null) return [];
    const rawQuery = String(query);
    if (rawQuery === '') return [];

    let { caseSensitive = false, isRegex = false, exactCell = false, coords = null } = options;
    const matches = [];

    let actualQuery = rawQuery;
    const trimmed = rawQuery.trim();

    // Inteligentne wykrywanie: fraza w cudzysłowie (np. "17") lub z prefiksem = (np. =17)
    // oznacza żądanie dokładnego dopasowania całej wartości komórki!
    if ((trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) || trimmed.startsWith('=')) {
      exactCell = true;
      if (trimmed.startsWith('=')) {
        actualQuery = trimmed.slice(1);
      } else {
        actualQuery = trimmed.slice(1, -1);
      }
    }

    let regex;
    try {
      regex = isRegex ? new RegExp(actualQuery, caseSensitive ? 'g' : 'gi') : null;
    } catch (e) {
      return [];
    }

    if (coords && Array.isArray(coords)) {
      for (const coord of coords) {
        const r = coord.row;
        const c = coord.col;
        if (r < 0 || r >= data.length || !data[r] || c < 0 || c >= data[r].length) continue;
        const cell = String(data[r][c] !== undefined && data[r][c] !== null ? data[r][c] : '');
        let isMatch = false;

        if (regex) {
          isMatch = regex.test(cell);
          regex.lastIndex = 0;
        } else if (exactCell) {
          isMatch = caseSensitive 
            ? cell.trim() === actualQuery.trim() 
            : cell.trim().toLowerCase() === actualQuery.trim().toLowerCase();
        } else {
          isMatch = caseSensitive 
            ? cell.includes(actualQuery) 
            : cell.toLowerCase().includes(actualQuery.toLowerCase());
        }

        if (isMatch) {
          matches.push({ row: r, col: c, value: cell });
        }
      }
      return matches;
    }

    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < data[r].length; c++) {
        const cell = String(data[r][c] !== undefined && data[r][c] !== null ? data[r][c] : '');
        let isMatch = false;

        if (regex) {
          isMatch = regex.test(cell);
          regex.lastIndex = 0;
        } else if (exactCell) {
          isMatch = caseSensitive 
            ? cell.trim() === actualQuery.trim() 
            : cell.trim().toLowerCase() === actualQuery.trim().toLowerCase();
        } else {
          isMatch = caseSensitive 
            ? cell.includes(actualQuery) 
            : cell.toLowerCase().includes(actualQuery.toLowerCase());
        }

        if (isMatch) {
          matches.push({ row: r, col: c, value: cell });
        }
      }
    }

    return matches;
  },

  /**
   * Masowa zamiana tekstu
   */
  replaceAll(data, findText, replaceText, options = {}) {
    if (!data || findText === undefined || findText === null || String(findText) === '') return { count: 0, changes: [] };

    let { caseSensitive = false, isRegex = false, exactCell = false, coords = null } = options;
    const rawFind = String(findText);
    let actualFind = rawFind;
    const trimmed = rawFind.trim();

    if ((trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) || trimmed.startsWith('=')) {
      exactCell = true;
      if (trimmed.startsWith('=')) {
        actualFind = trimmed.slice(1);
      } else {
        actualFind = trimmed.slice(1, -1);
      }
    }

    const matches = this.search(data, actualFind, { caseSensitive, isRegex, exactCell, coords });

    let regex;
    if (isRegex) {
      regex = new RegExp(actualFind, caseSensitive ? 'g' : 'gi');
    } else if (!exactCell) {
      const escaped = actualFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }

    const changes = [];
    for (const match of matches) {
      const oldVal = data[match.row][match.col] !== undefined ? String(data[match.row][match.col]) : '';
      const newVal = exactCell ? replaceText : oldVal.replace(regex, replaceText);
      if (oldVal !== newVal) {
        data[match.row][match.col] = newVal;
        changes.push({
          row: match.row,
          col: match.col,
          oldValue: oldVal,
          newValue: newVal
        });
      }
    }

    return {
      count: changes.length,
      changes
    };
  },

  /**
   * Usuwa zduplikowane wiersze
   */
  deduplicate(data, hasHeader = true) {
    if (!data || data.length === 0) return { data, removedCount: 0 };

    const startRow = hasHeader ? 1 : 0;
    const headerRow = hasHeader ? data[0] : null;
    const seen = new Set();
    const uniqueRows = [];
    let removedCount = 0;

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      } else {
        removedCount++;
      }
    }

    const newData = hasHeader ? [headerRow, ...uniqueRows] : uniqueRows;
    return { data: newData, removedCount };
  },

  /**
   * Usuwa całkowicie puste wiersze
   */
  removeEmptyRows(data, hasHeader = true) {
    if (!data || data.length === 0) return { data, removedCount: 0 };

    const startRow = hasHeader ? 1 : 0;
    const headerRow = hasHeader ? data[0] : null;
    const nonEmptyRows = [];
    let removedCount = 0;

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      const isNotEmpty = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (isNotEmpty) {
        nonEmptyRows.push(row);
      } else {
        removedCount++;
      }
    }

    const newData = hasHeader ? [headerRow, ...nonEmptyRows] : nonEmptyRows;
    return { data: newData, removedCount };
  },

  /**
   * Transformacje komórek (Trim, Wielkość liter)
   */
  transformCells(data, coords, transformType) {
    const changes = [];
    for (const coord of coords) {
      const { row, col } = coord;
      const oldVal = data[row] && data[row][col] !== undefined ? String(data[row][col]) : '';
      let newVal = oldVal;

      switch (transformType) {
        case 'trim':
          newVal = oldVal.trim();
          break;
        case 'uppercase':
          newVal = oldVal.toUpperCase();
          break;
        case 'lowercase':
          newVal = oldVal.toLowerCase();
          break;
        case 'capitalize':
          newVal = oldVal.replace(/\b\w/g, l => l.toUpperCase());
          break;
      }

      if (oldVal !== newVal) {
        data[row][col] = newVal;
        changes.push({ row, col, oldValue: oldVal, newValue: newVal });
      }
    }
    return changes;
  },

  /**
   * Generator symboli SKU (łączy wybrane kolumny z separatorem)
   */
  buildSkuSymbols(data, targetCol, sourceColIndices, separator = '-', hasHeader = true) {
    if (!data || data.length === 0 || !sourceColIndices || sourceColIndices.length === 0) return [];

    const startRow = hasHeader ? 1 : 0;
    const changes = [];

    for (let r = startRow; r < data.length; r++) {
      const parts = sourceColIndices
        .map(c => (data[r] && data[r][c] !== undefined ? String(data[r][c]).trim() : ''))
        .filter(part => part !== '');

      const newSymbol = parts.join(separator);
      const oldVal = data[r][targetCol] || '';

      if (newSymbol !== oldVal) {
        data[r][targetCol] = newSymbol;
        changes.push({ row: r, col: targetCol, oldValue: oldVal, newValue: newSymbol });
      }
    }

    return changes;
  },

  /**
   * Generator linków URL do zdjęć na podstawie SKU i szablonu
   */
  generateImageUrls(data, headers, options = {}) {
    if (!data || data.length === 0) return { data, headers, generatedCount: 0, changes: [], rowsProcessed: 0 };

    const {
      sourceColIndex = 0,
      urlTemplate = '',
      startIndex = 1,
      endIndex = 9,
      namingMode = 'ecommerce', // 'ecommerce' | 'custom'
      customHeaderPattern = 'Zdjęcie {N}',
      clearExtraImageCols = true,
      rowIndices = null,
      hasHeader = true
    } = options;

    if (!urlTemplate) return { data, headers, generatedCount: 0, changes: [], rowsProcessed: 0 };

    const startRow = hasHeader ? 1 : 0;
    const workingData = data;
    let workingHeaders = headers ? [...headers] : (hasHeader && workingData.length > 0 ? [...workingData[0]] : null);

    // 1. Wyznaczenie listy specyfikacji zdjęć: { n, headerName }
    const imageSpecs = [];
    for (let n = startIndex; n <= endIndex; n++) {
      let headerName = '';
      if (namingMode === 'ecommerce') {
        headerName = (n === 1) ? 'Zdjęcie główne (URL)' : `Zdjęcie dodatkowe ${n - 1} (URL)`;
      } else {
        headerName = customHeaderPattern
          .replace(/\{N0\}/g, String(n).padStart(2, '0'))
          .replace(/\{N\}/g, String(n));
      }
      imageSpecs.push({ n, headerName });
    }

    // Funkcja normalizująca nazwy nagłówków do porównań
    const normalizeH = (h) => String(h || '').toLowerCase().replace(/\s*\(url\)\s*/i, '').replace(/[\s_\-]+/g, '');

    // 2. Dopasowanie lub tworzenie kolumn
    const specColIndices = [];

    if (workingHeaders) {
      for (const spec of imageSpecs) {
        const normSpec = normalizeH(spec.headerName);
        let foundCol = workingHeaders.findIndex(h => normalizeH(h) === normSpec);

        if (foundCol === -1 && namingMode === 'ecommerce') {
          if (spec.n === 1) {
            foundCol = workingHeaders.findIndex(h => {
              const nh = normalizeH(h);
              return nh === 'zdjęciegłówne' || nh === 'zdjecieglowne' || nh === 'mainimage' || nh === 'image' || nh === 'zdjęcie1' || nh === 'zdjecie1';
            });
          } else {
            const extraIdx = spec.n - 1;
            foundCol = workingHeaders.findIndex(h => {
              const nh = normalizeH(h);
              return nh === `zdjęciedodatkowe${extraIdx}` || nh === `zdjeciedodatkowe${extraIdx}` || nh === `extraimage${extraIdx}` || nh === `zdjęcie${spec.n}` || nh === `zdjecie${spec.n}`;
            });
          }
        }

        if (foundCol !== -1) {
          specColIndices.push(foundCol);
        } else {
          const newColIdx = workingHeaders.length;
          workingHeaders.push(spec.headerName);
          for (let r = 0; r < workingData.length; r++) {
            while (workingData[r].length < workingHeaders.length) {
              workingData[r].push(r === 0 && hasHeader ? spec.headerName : '');
            }
          }
          specColIndices.push(newColIdx);
        }
      }
    } else {
      let maxCols = workingData[0] ? workingData[0].length : 0;
      for (let i = 0; i < imageSpecs.length; i++) {
        specColIndices.push(maxCols + i);
      }
      for (let r = 0; r < workingData.length; r++) {
        while (workingData[r].length < maxCols + imageSpecs.length) {
          workingData[r].push('');
        }
      }
    }

    // 3. Wykrycie nadmiarowych kolumn ze zdjęciami do wyczyszczenia (jeśli opcja aktywna)
    const extraColsToClear = [];
    if (clearExtraImageCols && workingHeaders) {
      for (let c = 0; c < workingHeaders.length; c++) {
        if (specColIndices.includes(c)) continue;
        const norm = normalizeH(workingHeaders[c]);
        const matchExtra = norm.match(/zdj[eę]ciedodatkowe(\d+)/i);
        if (matchExtra) {
          const num = parseInt(matchExtra[1], 10);
          if (num >= endIndex) {
            extraColsToClear.push(c);
          }
        }
      }
    }

    // 4. Generowanie linków dla wierszy
    const rowsToProcess = rowIndices && Array.isArray(rowIndices)
      ? rowIndices.filter(r => r >= startRow && r < workingData.length)
      : Array.from({ length: Math.max(0, workingData.length - startRow) }, (_, i) => i + startRow);

    let generatedCount = 0;
    const changes = [];

    for (const r of rowsToProcess) {
      const row = workingData[r];
      if (!row) continue;

      const rawSku = (row[sourceColIndex] !== undefined && row[sourceColIndex] !== null)
        ? String(row[sourceColIndex]).trim()
        : '';

      if (!rawSku) continue;

      for (let i = 0; i < imageSpecs.length; i++) {
        const spec = imageSpecs[i];
        const targetCol = specColIndices[i];
        const nStr = String(spec.n);
        const n0Str = String(spec.n).padStart(2, '0');

        let url = urlTemplate
          .replace(/\{SKU\}|\{VAL\}/gi, rawSku)
          .replace(/\{N0\}/g, n0Str)
          .replace(/\{N\}/g, nStr);

        if (typeof CSVParser !== 'undefined' && CSVParser.letterToColumnIndex) {
          url = url.replace(/\{COL:([A-Za-z]+)\}/gi, (_, letter) => {
            const cIdx = CSVParser.letterToColumnIndex(letter.toUpperCase());
            return (row[cIdx] !== undefined && row[cIdx] !== null) ? String(row[cIdx]).trim() : '';
          });
        }
        url = url.replace(/\{COL:(\d+)\}/g, (_, idxStr) => {
          const cIdx = parseInt(idxStr, 10);
          return (row[cIdx] !== undefined && row[cIdx] !== null) ? String(row[cIdx]).trim() : '';
        });

        const oldVal = row[targetCol] || '';
        if (oldVal !== url) {
          row[targetCol] = url;
          changes.push({ row: r, col: targetCol, oldValue: oldVal, newValue: url });
          generatedCount++;
        }
      }

      for (const extraCol of extraColsToClear) {
        const oldVal = row[extraCol] || '';
        if (oldVal !== '') {
          row[extraCol] = '';
          changes.push({ row: r, col: extraCol, oldValue: oldVal, newValue: '' });
        }
      }
    }

    if (hasHeader && workingHeaders && workingData.length > 0) {
      workingData[0] = [...workingHeaders];
    }

    return {
      data: workingData,
      headers: workingHeaders,
      generatedCount,
      changes,
      rowsProcessed: rowsToProcess.length
    };
  }
};

if (typeof window !== 'undefined') {
  window.CSVOperations = CSVOperations;
}
