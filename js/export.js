/**
 * Export & Download Manager - Eksport do CSV, XLSX, JSON, Markdown, HTML
 */

const CSVExporter = {
  /**
   * Pobiera plik w przeglądarce jako Blob
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Eksportuje dane do pliku CSV z pełną konfiguracją
   */
  exportToCSV(data, filename = 'dane.csv', options = {}) {
    const delimiter = options.delimiter || ';';
    const useBOM = options.bom !== undefined ? options.bom : true; // Domyślnie włączony BOM pod Excela!
    const quotes = options.quotes || 'needed';
    const newline = options.newline || '\r\n';

    const csvContent = CSVParser.serialize(data, {
      delimiter,
      quotes,
      newline
    });

    let blob;
    if (useBOM) {
      // Dodajemy Byte Order Mark \uFEFF na początek (dzięki temu Excel od razu widzi polskie znaki bez żadnych ustawień)
      blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    } else {
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    }

    this.downloadBlob(blob, filename);
  },

  /**
   * Eksportuje dane bezpośrednio do natywnego pliku Excela (.xlsx)
   */
  exportToXLSX(data, filename = 'dane.xlsx', sheetName = 'Arkusz 1') {
    if (typeof XLSX === 'undefined') {
      alert('Biblioteka XLSX nie została załadowana. Zapisano jako CSV.');
      this.exportToCSV(data, filename.replace(/\.xlsx$/i, '.csv'));
      return;
    }

    try {
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error('Błąd eksportu do XLSX:', e);
      alert('Wystąpił błąd podczas generowania pliku Excel: ' + e.message);
    }
  },

  /**
   * Eksportuje dane do formatu JSON
   */
  exportToJSON(data, filename = 'dane.json', asObjectArray = true) {
    let jsonString = '';

    if (asObjectArray && data.length > 1) {
      const headers = data[0].map((h, i) => h.trim() || `Kolumna_${i + 1}`);
      const objects = [];

      for (let r = 1; r < data.length; r++) {
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
          obj[headers[c]] = data[r][c] !== undefined ? data[r][c] : '';
        }
        objects.push(obj);
      }

      jsonString = JSON.stringify(objects, null, 2);
    } else {
      jsonString = JSON.stringify(data, null, 2);
    }

    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  },

  /**
   * Eksportuje dane do tabeli Markdown
   */
  exportToMarkdown(data, filename = 'tabela.md') {
    if (!data || data.length === 0) return;

    const headers = data[0];
    let md = '| ' + headers.map(h => String(h || '').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
    md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (let r = 1; r < data.length; r++) {
      md += '| ' + data[r].map(c => String(c || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ') + ' |\n';
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  },

  /**
   * Kopiuje tabelę do schowka w formacie Markdown lub TSV
   */
  async copyToClipboard(data, format = 'tsv') {
    let text = '';
    if (format === 'tsv') {
      text = data.map(row => row.map(cell => String(cell || '').replace(/\t/g, ' ')).join('\t')).join('\r\n');
    } else if (format === 'markdown') {
      const headers = data[0];
      text = '| ' + headers.map(h => String(h || '').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
      text += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
      for (let r = 1; r < data.length; r++) {
        text += '| ' + data[r].map(c => String(c || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ') + ' |\n';
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error('Błąd kopiowania do schowka:', e);
      return false;
    }
  }
};

if (typeof window !== 'undefined') {
  window.CSVExporter = CSVExporter;
}
