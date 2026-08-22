/**
 * CSV / DSV Parser & Serializer Engine
 * Bezpieczne parsowanie zachowujące oryginalne typy (zera wiodące, tekst, cudzysłowy)
 */

const CSVParser = {
  // Lista popularnych separatorów
  DELIMITERS: [
    { label: 'Średnik ( ; ) [Zalecany dla PL/Excel]', value: ';' },
    { label: 'Przecinek ( , ) [Standard CSV]', value: ',' },
    { label: 'Tabulator ( \\t ) [TSV]', value: '\t' },
    { label: 'Pionowa kreska ( | ) [Pipe]', value: '|' },
    { label: 'Dwukropek ( : )', value: ':' }
  ],

  // Obsługiwane kodowania znaków
  ENCODINGS: [
    { label: 'UTF-8 (Standardowy)', value: 'utf-8' },
    { label: 'Windows-1250 (Polski CP-1250 / Starsze programy)', value: 'windows-1250' },
    { label: 'ISO-8859-2 (Latin-2 / Unix)', value: 'iso-8859-2' },
    { label: 'Windows-1252 (ANSI / Zachodni)', value: 'windows-1252' },
    { label: 'ASCII', value: 'ascii' }
  ],

  /**
   * Automatyczne wykrywanie separatora na podstawie pierwszych wierszy tekstu
   */
  detectDelimiter(text) {
    if (!text || text.trim().length === 0) return ';';

    const candidates = [';', ',', '\t', '|', ':'];
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).slice(0, 25);
    
    if (lines.length === 0) return ';';

    let bestDelimiter = ';';
    let maxScore = -1;

    for (const delimiter of candidates) {
      let counts = [];
      let valid = true;

      for (const line of lines) {
        // Liczymy separatory poza cudzysłowami
        let inQuotes = false;
        let count = 0;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            count++;
          }
        }
        counts.push(count);
      }

      // Sprawdzamy czy wiersze mają tę samą i niezerową liczbę separatorów
      const nonZero = counts.filter(c => c > 0);
      if (nonZero.length > 0) {
        const firstCount = nonZero[0];
        const allSame = counts.every(c => c === firstCount || c === 0);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        
        // Obliczamy wagę (im większa zgodność między wierszami i większa liczba kolumn, tym lepiej)
        let score = avg * (allSame ? 2.5 : 1.0);
        
        // Średnik w polskim środowisku ma lekki priorytet przy równej liczbie
        if (delimiter === ';' && score > 0) score += 0.1;

        if (score > maxScore && avg >= 1) {
          maxScore = score;
          bestDelimiter = delimiter;
        }
      }
    }

    return bestDelimiter;
  },

  /**
   * Automatyczne wykrywanie kodowania z bufora binarnego (Uint8Array)
   */
  detectEncoding(buffer) {
    const bytes = new Uint8Array(buffer);
    
    // Sprawdź UTF-8 BOM: EF BB BF
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { encoding: 'utf-8', hasBOM: true };
    }
    
    // Sprawdź UTF-16 LE BOM: FF FE
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { encoding: 'utf-16le', hasBOM: true };
    }

    // Heurystyka UTF-8 vs Windows-1250
    let isUtf8Valid = true;
    let utf8MultibyteCount = 0;
    let i = 0;
    const len = Math.min(bytes.length, 50000); // analizujemy do 50KB

    while (i < len) {
      const b = bytes[i];
      if (b <= 0x7F) {
        i++;
      } else if ((b & 0xE0) === 0xC0) {
        if (i + 1 >= len || (bytes[i + 1] & 0xC0) !== 0x80) {
          isUtf8Valid = false;
          break;
        }
        utf8MultibyteCount++;
        i += 2;
      } else if ((b & 0xF0) === 0xE0) {
        if (i + 2 >= len || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) {
          isUtf8Valid = false;
          break;
        }
        utf8MultibyteCount++;
        i += 3;
      } else if ((b & 0xF8) === 0xF0) {
        if (i + 3 >= len || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) {
          isUtf8Valid = false;
          break;
        }
        utf8MultibyteCount++;
        i += 4;
      } else {
        isUtf8Valid = false;
        break;
      }
    }

    if (isUtf8Valid) {
      return { encoding: 'utf-8', hasBOM: false };
    }

    // Sprawdź polskie znaki w standardzie Windows-1250
    // ą=0xb9, ć=0xe6, ę=0xea, ł=0xb3, ń=0xf1, ó=0xf3, ś=0x9c, ź=0x9f, ż=0xbf
    // Ą=0xa5, Ć=0xc6, Ę=0xca, Ł=0xa3, Ń=0xd1, Ó=0xd3, Ś=0x8c, Ź=0x8f, Ż=0xaf
    const win1250PolishBytes = [0xb9, 0xe6, 0xea, 0xb3, 0xf1, 0xf3, 0x9c, 0x9f, 0xbf, 0xa5, 0xc6, 0xca, 0xa3, 0xd1, 0xd3, 0x8c, 0x8f, 0xaf];
    let win1250Count = 0;

    for (let j = 0; j < len; j++) {
      if (win1250PolishBytes.includes(bytes[j])) {
        win1250Count++;
      }
    }

    if (win1250Count > 0) {
      return { encoding: 'windows-1250', hasBOM: false };
    }

    return { encoding: 'utf-8', hasBOM: false };
  },

  /**
   * Dekoduje ArrayBuffer do tekstu na podstawie kodowania
   */
  decodeBuffer(buffer, encoding = 'utf-8') {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      return decoder.decode(buffer);
    } catch (e) {
      console.warn(`Błąd dekodowania z ${encoding}, powrót do utf-8:`, e);
      const fallbackDecoder = new TextDecoder('utf-8', { fatal: false });
      return fallbackDecoder.decode(buffer);
    }
  },

  /**
   * Główna funkcja parsowania CSV/TSV/DSV do dwuwymiarowej tablicy stringów
   * Gwarantuje brak konwersji typów (zachowuje '00123' jako '00123')
   */
  parse(text, options = {}) {
    const delimiter = options.delimiter || this.detectDelimiter(text);
    
    let rawData = [];
    
    // Jeśli PapaParse jest dostępny w oknie, użyj go dla 100% zgodności z RFC 4180
    if (typeof Papa !== 'undefined') {
      const result = Papa.parse(text, {
        delimiter: delimiter,
        dynamicTyping: false, // BARDZO WAŻNE: nie psuje zer wiodących, liczb ani dat!
        skipEmptyLines: false,
        header: false
      });
      rawData = result.data || [];
    } else {
      // Własny lekki fallback parser RFC 4180
      rawData = this.fallbackParse(text, delimiter);
    }

    // Normalizacja tabeli: usuwamy pusty końcowy wiersz jeśli plik kończy się znakiem nowej linii
    if (rawData.length > 1 && rawData[rawData.length - 1].length === 1 && rawData[rawData.length - 1][0] === '') {
      rawData.pop();
    }

    if (rawData.length === 0) {
      rawData = [['']];
    }

    // Oblicz maksymalną liczbę kolumn
    let maxCols = 0;
    for (let r = 0; r < rawData.length; r++) {
      if (Array.isArray(rawData[r])) {
        maxCols = Math.max(maxCols, rawData[r].length);
      } else {
        rawData[r] = [''];
      }
    }
    maxCols = Math.max(maxCols, 1);

    // Wyrównaj wszystkie wiersze do maxCols
    for (let r = 0; r < rawData.length; r++) {
      while (rawData[r].length < maxCols) {
        rawData[r].push('');
      }
      // Upewnij się, że każda komórka to string
      for (let c = 0; c < maxCols; c++) {
        if (rawData[r][c] === null || rawData[r][c] === undefined) {
          rawData[r][c] = '';
        } else {
          rawData[r][c] = String(rawData[r][c]);
        }
      }
    }

    return {
      data: rawData,
      rowCount: rawData.length,
      colCount: maxCols,
      delimiter: delimiter
    };
  },

  /**
   * Fallback parser CSV RFC 4180
   */
  fallbackParse(text, delimiter = ',') {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // pomijamy podwójny cudzysłów
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // pomijamy \n po \r
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  },

  /**
   * Serializuje dwuwymiarową tablicę danych z powrotem do tekstu CSV/DSV
   */
  serialize(data, options = {}) {
    const delimiter = options.delimiter || ';';
    const newline = options.newline || '\r\n'; // CRLF dla zgodności z Windows/Excel
    const quotes = options.quotes || 'needed'; // 'needed', 'all', 'strings'

    if (typeof Papa !== 'undefined') {
      let quotesConfig = false;
      if (quotes === 'all') quotesConfig = true;
      if (quotes === 'needed') {
        quotesConfig = (value) => {
          if (typeof value !== 'string') return false;
          return value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
        };
      }

      return Papa.unparse(data, {
        delimiter: delimiter,
        newline: newline,
        quotes: quotesConfig
      });
    }

    // Fallback serializer
    return data.map(row => {
      return row.map(cell => {
        const str = (cell === null || cell === undefined) ? '' : String(cell);
        const mustQuote = quotes === 'all' || 
                          str.includes(delimiter) || 
                          str.includes('"') || 
                          str.includes('\n') || 
                          str.includes('\r');
        if (mustQuote) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(delimiter);
    }).join(newline);
  },

  /**
   * Generuje litery kolumn jak w Excelu (0 -> A, 1 -> B, ..., 26 -> AA)
   */
  columnIndexToLetter(index) {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  },

  /**
   * Konwertuje literę kolumny Excela na indeks (A -> 0, B -> 1, AA -> 26)
   */
  letterToColumnIndex(letter) {
    let index = 0;
    const str = letter.toUpperCase();
    for (let i = 0; i < str.length; i++) {
      index = index * 26 + (str.charCodeAt(i) - 64);
    }
    return index - 1;
  }
};

if (typeof window !== 'undefined') {
  window.CSVParser = CSVParser;
}
