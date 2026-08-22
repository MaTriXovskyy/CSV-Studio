(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  hideColumn(c) {
    this.hiddenCols.add(c);
    this.updateDimensions();
    this.render();
  },

  showColumn(c) {
    this.hiddenCols.delete(c);
    this.updateDimensions();
    this.render();
  },

  hideEmptyColumns() {
    const empty = CSVOperations.getEmptyColumns(this.data, !!this.headers);
    for (const c of empty) {
      this.hiddenCols.add(c);
    }
    this.updateDimensions();
    this.render();
    return empty.length;
  },

  showAllColumns() {
    const count = this.hiddenCols.size;
    this.hiddenCols.clear();
    this.updateDimensions();
    this.render();
    return count;
  },

  toggleFilterMode() {
    this.isFilterMode = !this.isFilterMode;
    this.render();
    return this.isFilterMode;
  },

  applyColumnFilter(colIndex, allowedValuesSet) {
    if (!allowedValuesSet) {
      this.colFilters.delete(colIndex);
    } else {
      this.colFilters.set(colIndex, allowedValuesSet);
    }

    const { visibleIndices } = CSVOperations.filterByValues(this.data, this.colFilters, false);
    this.setFilteredIndices(visibleIndices);
    return this.rowIndices.length;
  },

  clearColumnFilter(colIndex) {
    this.colFilters.delete(colIndex);
    const { visibleIndices } = CSVOperations.filterByValues(this.data, this.colFilters, false);
    this.setFilteredIndices(visibleIndices);
  },

  clearAllFilters() {
    this.colFilters.clear();
    this.rowIndices = this.data.map((_, i) => i);
    this.updateDimensions();
    this.render();
    this.notifySelection();
  },

  toggleWrapText() {
    this.wrapText = !this.wrapText;
    if (this.wrapText) {
      this.table.classList.add('wrap-text');
    } else {
      this.table.classList.remove('wrap-text');
    }
    this.render();
    return this.wrapText;
  },

  autoFitColumn(c, reRender = true) {
    if (this.hiddenCols.has(c)) return;
    const padding = 20;
    const colName = (this.headers && this.headers[c]) ? this.headers[c] : CSVParser.columnIndexToLetter(c);
    let maxLen = colName.length;

    const sampleLimit = Math.min(this.data.length, 500);
    for (let r = 0; r < sampleLimit; r++) {
      const cellVal = this.data[r][c] !== undefined ? String(this.data[r][c]) : '';
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length;
      }
    }

    const calculatedWidth = Math.max(65, Math.min(600, maxLen * 8.5 + padding));
    this.colWidths[c] = Math.ceil(calculatedWidth);

    if (reRender) {
      this.updateDimensions();
      this.render();
    }
  },

  autoFitAllColumns(reRender = true) {
    const colCount = this.getColCount();
    for (let c = 0; c < colCount; c++) {
      this.autoFitColumn(c, false);
    }
    if (reRender) {
      this.updateDimensions();
      this.render();
    }
  },

  showContextMenu(e, type, targetData) {
    e.preventDefault();
    e.stopPropagation();
    this.contextMenuTarget = { type, targetData };

    let menuHTML = '';

    if (type === 'row') {
      const { minRow, maxRow } = this.getNormalizedSelection();
      const isMultiRow = this.selectionType === 'row' && (maxRow > minRow);
      const selectedRowCount = maxRow - minRow + 1;
      const startRowDisplay = this.rowIndices[minRow] + 1;
      const endRowDisplay = this.rowIndices[maxRow] + 1;

      const headerTitle = isMultiRow
        ? `Wiersze ${startRowDisplay} – ${endRowDisplay} (${selectedRowCount} zaznaczonych)`
        : `Wiersz ${this.rowIndices[targetData.row] + 1}`;

      const deleteLabel = isMultiRow
        ? `Usuń ${selectedRowCount} zaznaczonych wierszy`
        : `Usuń wiersz`;

      const duplicateLabel = isMultiRow
        ? `Duplikuj ${selectedRowCount} zaznaczonych wierszy`
        : `Duplikuj wiersz`;

      const copyLabel = isMultiRow
        ? `Kopiuj ${selectedRowCount} wierszy`
        : `Kopiuj wiersz`;

      const cutLabel = isMultiRow
        ? `Wytnij ${selectedRowCount} wierszy`
        : `Wytnij wiersz`;

      const clearLabel = isMultiRow
        ? `Wyczyść ${selectedRowCount} wierszy`
        : `Wyczyść zawartość`;

      const freezeLabel = isMultiRow
        ? `Zablokuj wiersze (do wiersza ${endRowDisplay})`
        : `Zablokuj wiersze (wiersze 1 do ${this.rowIndices[targetData.row] + 1})`;

      menuHTML = `
        <div class="context-header">${headerTitle}</div>
        <div class="context-item" data-action="insertRowAbove">
          <div class="context-item-left"><i data-lucide="arrow-up-to-line"></i><span>Wstaw wiersz powyżej</span></div>
        </div>
        <div class="context-item" data-action="insertRowBelow">
          <div class="context-item-left"><i data-lucide="arrow-down-to-line"></i><span>Wstaw wiersz poniżej</span></div>
        </div>
        <div class="context-item" data-action="duplicateRow">
          <div class="context-item-left"><i data-lucide="copy-plus"></i><span>${duplicateLabel}</span></div>
        </div>
        <div class="context-divider"></div>
        <div class="context-item" data-action="freezeRowsToHere">
          <div class="context-item-left"><i data-lucide="pin"></i><span>${freezeLabel}</span></div>
        </div>
        ${this.frozenRows > 0 ? `
        <div class="context-item" data-action="unfreezeRows">
          <div class="context-item-left"><i data-lucide="unlock"></i><span>Odblokuj wiersze</span></div>
        </div>` : ''}
        ${(this.frozenRows > 0 || this.frozenCols > 0) ? `
        <div class="context-item" data-action="unfreezePanes">
          <div class="context-item-left"><i data-lucide="unlock"></i><span>Odblokuj wszystkie okienka</span></div>
        </div>` : ''}
        <div class="context-divider"></div>
        <div class="context-item" data-action="copyRow">
          <div class="context-item-left"><i data-lucide="copy"></i><span>${copyLabel}</span></div>
          <span class="shortcut">Ctrl+C</span>
        </div>
        <div class="context-item" data-action="cutRow">
          <div class="context-item-left"><i data-lucide="scissors"></i><span>${cutLabel}</span></div>
          <span class="shortcut">Ctrl+X</span>
        </div>
        <div class="context-item" data-action="paste">
          <div class="context-item-left"><i data-lucide="clipboard-paste"></i><span>Wklej w wiersz</span></div>
          <span class="shortcut">Ctrl+V</span>
        </div>
        <div class="context-item" data-action="clearRow">
          <div class="context-item-left"><i data-lucide="eraser"></i><span>${clearLabel}</span></div>
          <span class="shortcut">Del</span>
        </div>
        <div class="context-divider"></div>
        <div class="context-item danger" data-action="deleteRow">
          <div class="context-item-left"><i data-lucide="trash-2"></i><span>${deleteLabel}</span></div>
        </div>
      `;
    } else if (type === 'col') {
      const { minCol, maxCol } = this.getNormalizedSelection();
      const isMultiCol = this.selectionType === 'col' && (maxCol > minCol);
      const selectedColCount = maxCol - minCol + 1;
      const startColLetter = CSVParser.columnIndexToLetter(minCol);
      const endColLetter = CSVParser.columnIndexToLetter(maxCol);

      const colIndex = targetData.col;
      const letter = CSVParser.columnIndexToLetter(colIndex);
      const colName = (this.headers && this.headers[colIndex]) || letter;

      const headerTitle = isMultiCol
        ? `Kolumny ${startColLetter} – ${endColLetter} (${selectedColCount} zaznaczonych)`
        : `Kolumna ${letter} (${this.escapeHTML(colName)})`;

      const deleteLabel = isMultiCol
        ? `Usuń ${selectedColCount} zaznaczonych kolumn`
        : `Usuń kolumnę`;

      const copyLabel = isMultiCol
        ? `Kopiuj ${selectedColCount} kolumn`
        : `Kopiuj kolumnę`;

      const hideLabel = isMultiCol
        ? `Ukryj ${selectedColCount} zaznaczonych kolumn`
        : `Ukryj tę kolumnę`;

      const autoFitLabel = isMultiCol
        ? `Dopasuj szerokość ${selectedColCount} kolumn`
        : `Dopasuj szerokość tej kolumny`;

      const freezeLabel = isMultiCol
        ? `Zablokuj kolumny (do kolumny ${endColLetter})`
        : `Zablokuj kolumny (kolumny A do ${letter})`;

      menuHTML = `
        <div class="context-header">${headerTitle}</div>
        <div class="context-item" data-action="autoFitCol">
          <div class="context-item-left"><i data-lucide="move-horizontal"></i><span>${autoFitLabel}</span></div>
        </div>
        <div class="context-item" data-action="autoFitAll">
          <div class="context-item-left"><i data-lucide="scaling"></i><span>Dopasuj wszystkie kolumny</span></div>
        </div>
        <div class="context-divider"></div>
        ${!isMultiCol ? `
        <div class="context-item" data-action="openColFilter">
          <div class="context-item-left"><i data-lucide="filter"></i><span>Filtruj wartości w tej kolumnie...</span></div>
        </div>` : ''}
        <div class="context-item" data-action="hideCol">
          <div class="context-item-left"><i data-lucide="eye-off"></i><span>${hideLabel}</span></div>
        </div>
        <div class="context-item" data-action="hideEmptyCols">
          <div class="context-item-left"><i data-lucide="eye-off"></i><span>Ukryj wszystkie puste kolumny</span></div>
        </div>
        ${this.hiddenCols.size > 0 ? `
        <div class="context-item" data-action="showAllCols">
          <div class="context-item-left"><i data-lucide="eye"></i><span>Pokaż wszystkie ukryte kolumny (${this.hiddenCols.size})</span></div>
        </div>` : ''}
        <div class="context-divider"></div>
        <div class="context-item" data-action="freezeColsToHere">
          <div class="context-item-left"><i data-lucide="pin"></i><span>${freezeLabel}</span></div>
        </div>
        ${this.frozenCols > 0 ? `
        <div class="context-item" data-action="unfreezeCols">
          <div class="context-item-left"><i data-lucide="unlock"></i><span>Odblokuj kolumny</span></div>
        </div>` : ''}
        ${(this.frozenRows > 0 || this.frozenCols > 0) ? `
        <div class="context-item" data-action="unfreezePanes">
          <div class="context-item-left"><i data-lucide="unlock"></i><span>Odblokuj wszystkie okienka</span></div>
        </div>` : ''}
        <div class="context-divider"></div>
        <div class="context-item" data-action="copy">
          <div class="context-item-left"><i data-lucide="copy"></i><span>${copyLabel}</span></div>
          <span class="shortcut">Ctrl+C</span>
        </div>
        ${!isMultiCol ? `
        <div class="context-item" data-action="sortAsc">
          <div class="context-item-left"><i data-lucide="arrow-down-a-z"></i><span>Sortuj rosnąco (A-Z / 0-9)</span></div>
        </div>
        <div class="context-item" data-action="sortDesc">
          <div class="context-item-left"><i data-lucide="arrow-up-z-a"></i><span>Sortuj malejąco (Z-A / 9-0)</span></div>
        </div>
        <div class="context-divider"></div>
        <div class="context-item" data-action="insertColLeft">
          <div class="context-item-left"><i data-lucide="arrow-left-to-line"></i><span>Wstaw kolumnę z lewej</span></div>
        </div>
        <div class="context-item" data-action="insertColRight">
          <div class="context-item-left"><i data-lucide="arrow-right-to-line"></i><span>Wstaw kolumnę z prawej</span></div>
        </div>
        <div class="context-item" data-action="renameCol">
          <div class="context-item-left"><i data-lucide="file-pen-line"></i><span>Zmień nazwę nagłówka</span></div>
        </div>
        <div class="context-item" data-action="colStats">
          <div class="context-item-left"><i data-lucide="bar-chart-2"></i><span>Statystyki kolumny</span></div>
        </div>` : `
        <div class="context-divider"></div>
        <div class="context-item" data-action="insertColLeft">
          <div class="context-item-left"><i data-lucide="arrow-left-to-line"></i><span>Wstaw kolumny z lewej</span></div>
        </div>
        <div class="context-item" data-action="insertColRight">
          <div class="context-item-left"><i data-lucide="arrow-right-to-line"></i><span>Wstaw kolumny z prawej</span></div>
        </div>`}
        <div class="context-divider"></div>
        <div class="context-item danger" data-action="deleteCol">
          <div class="context-item-left"><i data-lucide="trash-2"></i><span>${deleteLabel}</span></div>
        </div>
      `;
    } else {
      const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
      const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
      const isMultiCell = cellCount > 1;

      const rowIndex = targetData ? targetData.row : this.activeCell.row;
      const colIndex = targetData ? targetData.col : this.activeCell.col;
      const actualRow = this.rowIndices[rowIndex];
      const letter = CSVParser.columnIndexToLetter(colIndex);

      const startAddr = `${CSVParser.columnIndexToLetter(minCol)}${this.rowIndices[minRow] + 1}`;
      const endAddr = `${CSVParser.columnIndexToLetter(maxCol)}${this.rowIndices[maxRow] + 1}`;
      const headerTitle = isMultiCell
        ? `Zaznaczenie ${startAddr}:${endAddr} (${cellCount} komórek)`
        : `Komórka ${letter}${actualRow + 1}`;

      const clearLabel = isMultiCell
        ? `Wyczyść ${cellCount} zaznaczonych komórek`
        : `Wyczyść komórkę`;

      const copyLabel = isMultiCell
        ? `Kopiuj ${cellCount} komórek`
        : `Kopiuj`;

      const cutLabel = isMultiCell
        ? `Wytnij ${cellCount} komórek`
        : `Wytnij`;

      menuHTML = `
        <div class="context-header">${headerTitle}</div>
        <div class="context-item" data-action="copy">
          <div class="context-item-left"><i data-lucide="copy"></i><span>${copyLabel}</span></div>
          <span class="shortcut">Ctrl+C</span>
        </div>
        <div class="context-item" data-action="cut">
          <div class="context-item-left"><i data-lucide="scissors"></i><span>${cutLabel}</span></div>
          <span class="shortcut">Ctrl+X</span>
        </div>
        <div class="context-item" data-action="paste">
          <div class="context-item-left"><i data-lucide="clipboard-paste"></i><span>Wklej</span></div>
          <span class="shortcut">Ctrl+V</span>
        </div>
        <div class="context-item" data-action="fillDown">
          <div class="context-item-left"><i data-lucide="arrow-down-to-dot"></i><span>Wypełnij w dół</span></div>
          <span class="shortcut">Ctrl+D</span>
        </div>
        <div class="context-item" data-action="clear">
          <div class="context-item-left"><i data-lucide="eraser"></i><span>${clearLabel}</span></div>
          <span class="shortcut">Del</span>
        </div>
        <div class="context-divider"></div>
        <div class="context-item" data-action="freezePanesHere">
          <div class="context-item-left"><i data-lucide="pin"></i><span>Zablokuj okienka tutaj (wiersze 1..${actualRow + 1}, kolumny A..${letter})</span></div>
        </div>
        ${(this.frozenRows > 0 || this.frozenCols > 0) ? `
        <div class="context-item" data-action="unfreezePanes">
          <div class="context-item-left"><i data-lucide="unlock"></i><span>Odblokuj wszystkie okienka</span></div>
        </div>` : ''}
        <div class="context-divider"></div>
        <div class="context-item" data-action="autoFitAll">
          <div class="context-item-left"><i data-lucide="scaling"></i><span>Dopasuj szerokości kolumn</span></div>
        </div>
        <div class="context-item" data-action="hideEmptyCols">
          <div class="context-item-left"><i data-lucide="eye-off"></i><span>Ukryj puste kolumny</span></div>
        </div>
        <div class="context-item" data-action="toggleWrap">
          <div class="context-item-left"><i data-lucide="wrap-text"></i><span>Przełącz zawijanie tekstu</span></div>
        </div>
      `;
    }

    if (this.contextMenu) {
      this.contextMenu.innerHTML = menuHTML;
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({ root: this.contextMenu });
      }

      this.contextMenu.style.display = 'block';
      this.contextMenu.classList.add('show');

      const menuW = this.contextMenu.offsetWidth || 230;
      const menuH = this.contextMenu.offsetHeight || 300;
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let posX = e.clientX;
      let posY = e.clientY;

      if (posX + menuW > winW) posX = winW - menuW - 10;
      if (posY + menuH > winH) posY = winH - menuH - 10;

      this.contextMenu.style.left = `${Math.max(10, posX)}px`;
      this.contextMenu.style.top = `${Math.max(10, posY)}px`;
    }
  }
});
})();
