/**
 * Virtualized Spreadsheet Grid Engine - Core
 * Definicja klasy CSVGrid, inicjalizacja DOM, zarządzanie wymiarami i stanem.
 */

class CSVGrid {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.options = options;

    // Dane tabeli
    this.data = [['']];
    this.headers = null;
    this.rowIndices = [0];
    
    // Wymiary
    this.rowHeight = 28;
    this.headerRowHeight = 28;
    this.headerColWidth = 52;
    this.defaultColWidth = 130;
    this.colWidths = [];
    this.wrapText = false;

    // Zamrażanie okienek (Freeze Panes)
    this.frozenRows = 0;
    this.frozenCols = 0;

    // Ukrywanie kolumn
    this.hiddenCols = new Set();

    // Filtry kolumn (Excel AutoFilter)
    this.colFilters = new Map();
    this.isFilterMode = false;

    // Zaznaczenie i aktywna komórka
    this.activeCell = { row: 0, col: 0 };
    this.selection = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
    this.isSelecting = false;
    this.selectionType = 'cell';

    // Fill Handle przeciągania
    this.isFilling = false;
    this.fillSourceSelection = null;
    this.fillTargetRange = null;

    // Stan edycji
    this.isEditing = false;
    this.editCell = null;
    this.editorEl = null;

    // Wyszukiwanie / podświetlenia
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    // Resizing kolumn
    this.resizingCol = null;
    this.resizeStartX = 0;
    this.resizeStartWidth = 0;

    // Schowek i animowana ramka (Excel Marching Ants)
    this.copiedRange = null;
    this.copiedType = null;

    // Context menu
    this.contextMenuTarget = null;

    // Callbacks
    this.onSelectionChange = options.onSelectionChange || null;
    this.onCellChange = options.onCellChange || null;
    this.onStructureChange = options.onStructureChange || null;
    this.onContextMenu = options.onContextMenu || null;
    this.onFilterClick = options.onFilterClick || null;

    this.initDOM();
    this.bindEvents();
    this.bindFillHandleEvents();
  }

  initDOM() {
    const searchBanner = this.container.querySelector('#searchBanner');

    this.container.innerHTML = `
      <div class="spreadsheet-wrapper" tabindex="0">
        <div class="virtual-grid-sizer">
          <table class="csv-table">
            <colgroup class="csv-colgroup"></colgroup>
            <thead class="csv-thead"></thead>
            <tbody class="csv-tbody"></tbody>
          </table>
          <div class="fill-handle" style="display: none;" title="Przeciągnij w dół, aby powielić / rozszerzyć serię (lub kliknij dwukrotnie)"></div>
          <div class="fill-preview-box" style="display: none;"></div>
          <div class="clipboard-marching-ants" style="display: none;"></div>
        </div>
        <textarea class="cell-editor" style="display: none;"></textarea>
      </div>
      <div class="context-menu" id="gridContextMenu"></div>
    `;

    if (searchBanner) this.container.prepend(searchBanner);

    this.wrapper = this.container.querySelector('.spreadsheet-wrapper');
    this.sizer = this.container.querySelector('.virtual-grid-sizer');
    this.table = this.container.querySelector('.csv-table');
    this.colgroup = this.container.querySelector('.csv-colgroup');
    this.thead = this.container.querySelector('.csv-thead');
    this.tbody = this.container.querySelector('.csv-tbody');
    this.editor = this.container.querySelector('.cell-editor');
    this.fillHandle = this.container.querySelector('.fill-handle');
    this.fillPreview = this.container.querySelector('.fill-preview-box');
    this.clipboardAnts = this.container.querySelector('.clipboard-marching-ants');
    this.contextMenu = document.getElementById('gridContextMenu');
  }

  setData(data, headers = null, resetScroll = true, colWidths = null) {
    this.data = data && data.length > 0 ? data : [['']];
    this.headers = headers;
    this.rowIndices = this.data.map((_, i) => i);
    this.colFilters.clear();
    this.isFilterMode = false;
    this.hiddenCols.clear();
    this.clearCopiedIndicator();
    
    const colCount = this.getColCount();
    if (colWidths && Array.isArray(colWidths) && colWidths.length === colCount) {
      this.colWidths = [...colWidths];
    } else {
      this.colWidths = [];
      for (let c = 0; c < colCount; c++) {
        this.colWidths.push(this.defaultColWidth);
      }
      // Automatycznie dopasuj szerokości kolumn TYLKO jeśli dane nie są puste
      const hasActualContent = this.data.some(row => row.some(v => v !== undefined && v !== null && String(v).trim() !== '')) || 
                               (this.headers && this.headers.some(h => h && String(h).trim() !== ''));
      if (hasActualContent) {
        for (let c = 0; c < colCount; c++) {
          this.autoFitColumn(c, false);
        }
      }
    }

    this.activeCell = { row: 0, col: 0 };
    this.selection = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };

    if (resetScroll && this.wrapper) {
      this.wrapper.scrollTop = 0;
      this.wrapper.scrollLeft = 0;
    }

    this.updateDimensions();
    this.render();
    this.notifySelection();
  }

  setFrozenPanes(rows, cols) {
    this.frozenRows = Math.max(0, Math.min(rows, this.getRowCount()));
    this.frozenCols = Math.max(0, Math.min(cols, this.getColCount()));
    this.render();
  }

  getRowCount() {
    return this.rowIndices.length;
  }

  getColCount() {
    return this.data.length > 0 ? this.data[0].length : 0;
  }

  getColWidth(c) {
    if (this.hiddenCols.has(c)) return 0;
    return this.colWidths[c] || this.defaultColWidth;
  }

  getTotalWidth() {
    let total = this.headerColWidth;
    const colCount = this.getColCount();
    for (let c = 0; c < colCount; c++) {
      if (!this.hiddenCols.has(c)) {
        total += this.getColWidth(c);
      }
    }
    return total;
  }

  getTotalHeight() {
    return this.headerRowHeight + this.getRowCount() * this.rowHeight;
  }

  updateDimensions() {
    const totalW = this.getTotalWidth();
    const totalH = this.getTotalHeight();
    if (this.sizer) {
      this.sizer.style.width = `${totalW}px`;
      this.sizer.style.height = `${totalH}px`;
    }
    if (this.table) {
      this.table.style.width = `${totalW}px`;
    }
  }

  setFilteredIndices(indices) {
    this.rowIndices = indices;
    this.updateDimensions();
    this.render();
    this.notifySelection();
  }

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getViewState() {
    return {
      scrollTop: this.wrapper ? this.wrapper.scrollTop : 0,
      scrollLeft: this.wrapper ? this.wrapper.scrollLeft : 0,
      activeCell: { ...this.activeCell },
      selection: { ...this.selection },
      wrapText: this.wrapText,
      frozenRows: this.frozenRows,
      frozenCols: this.frozenCols,
      hiddenCols: Array.from(this.hiddenCols),
      isFilterMode: this.isFilterMode
    };
  }

  restoreViewState(viewState) {
    if (!viewState) return;

    if (viewState.wrapText !== undefined && viewState.wrapText !== this.wrapText) {
      this.wrapText = viewState.wrapText;
      if (this.wrapText) this.table.classList.add('wrap-text');
      else this.table.classList.remove('wrap-text');
    }

    if (viewState.frozenRows !== undefined) this.frozenRows = viewState.frozenRows;
    if (viewState.frozenCols !== undefined) this.frozenCols = viewState.frozenCols;
    if (viewState.hiddenCols && Array.isArray(viewState.hiddenCols)) {
      this.hiddenCols = new Set(viewState.hiddenCols);
    }
    if (viewState.isFilterMode !== undefined) this.isFilterMode = viewState.isFilterMode;

    if (viewState.activeCell) this.activeCell = { ...viewState.activeCell };
    if (viewState.selection) this.selection = { ...viewState.selection };

    this.updateDimensions();
    this.render();

    if (this.wrapper) {
      if (viewState.scrollTop !== undefined) this.wrapper.scrollTop = viewState.scrollTop;
      if (viewState.scrollLeft !== undefined) this.wrapper.scrollLeft = viewState.scrollLeft;
    }
  }
}

if (typeof window !== 'undefined') {
  window.CSVGrid = CSVGrid;
}
if (typeof global !== 'undefined') {
  global.CSVGrid = CSVGrid;
}
