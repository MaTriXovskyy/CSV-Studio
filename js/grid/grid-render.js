(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  getVisibleRange() {
    if (!this.wrapper) return { startRow: 0, endRow: 50 };

    const scrollTop = this.wrapper.scrollTop;
    const scrollLeft = this.wrapper.scrollLeft;
    const viewportHeight = this.wrapper.clientHeight || 600;
    const rowCount = this.getRowCount();

    const bufferRows = 10;
    let startRow = Math.floor((scrollTop - this.headerRowHeight) / this.rowHeight) - bufferRows;
    startRow = Math.max(0, startRow);

    let endRow = Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + bufferRows;
    endRow = Math.min(rowCount - 1, endRow);

    return { startRow, endRow, scrollTop, scrollLeft };
  },

  render() {
    if (this.data.length === 0) return;

    const { startRow, endRow } = this.getVisibleRange();
    const colCount = this.getColCount();
    const rowCount = this.getRowCount();

    // 1. Oblicz pozycje X kolumn (pomijając ukryte)
    const colLeftOffsets = [];
    let curX = this.headerColWidth;
    for (let c = 0; c < colCount; c++) {
      colLeftOffsets.push(curX);
      if (!this.hiddenCols.has(c)) {
        curX += this.getColWidth(c);
      }
    }

    // 2. Renderowanie <colgroup>
    let colgroupHTML = `<col style="width:${this.headerColWidth}px; min-width:${this.headerColWidth}px; max-width:${this.headerColWidth}px;">`;
    for (let c = 0; c < colCount; c++) {
      if (this.hiddenCols.has(c)) {
        colgroupHTML += `<col style="width:0px; display:none;">`;
      } else {
        const w = this.getColWidth(c);
        colgroupHTML += `<col style="width:${w}px; min-width:${w}px; max-width:${w}px;">`;
      }
    }
    this.colgroup.innerHTML = colgroupHTML;

    // 3. Renderowanie nagłówków kolumn (thead)
    const tableIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`;
    const filterIconSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;

    let theadHTML = `<tr><th class="csv-th-corner" data-type="corner" title="Zaznacz wszystko / Podwójny klik by dopasować kolumny"><div class="corner-content">${tableIconSvg}</div></th>`;
    for (let c = 0; c < colCount; c++) {
      if (this.hiddenCols.has(c)) continue;

      const letter = CSVParser.columnIndexToLetter(c);
      const customName = this.headers && this.headers[c] ? this.headers[c] : '';
      const isSelected = this.isColSelected(c);
      const isFrozen = c < this.frozenCols;
      const isDivider = isFrozen && c === this.frozenCols - 1;
      const hasFilter = this.colFilters.has(c);

      let thStyle = '';
      if (isFrozen) {
        thStyle = `position: sticky; left: ${colLeftOffsets[c]}px; z-index: 35;`;
      }

      theadHTML += `
        <th class="csv-th-col ${isSelected ? 'selected' : ''} ${isFrozen ? 'frozen-col-header' : ''} ${isDivider ? 'freeze-col-divider' : ''}" 
            style="${thStyle}"
            data-col="${c}" 
            title="Prawy przycisk: opcje kolumny">
          <div class="th-content">
            <span class="th-label">${this.escapeHTML(customName || letter)}</span>
            ${customName ? `<span class="th-sublabel">${letter}</span>` : ''}
            ${this.isFilterMode ? `
              <button class="col-filter-btn ${hasFilter ? 'active' : ''}" data-filter-col="${c}" title="Filtruj kolumnę ${letter}">
                ${filterIconSvg}
              </button>
            ` : ''}
            <div class="col-resize-handle" data-col="${c}" title="Przeciągnij lub kliknij dwukrotnie by dopasować"></div>
          </div>
        </th>
      `;
    }
    theadHTML += `</tr>`;
    this.thead.innerHTML = theadHTML;

    // 4. Renderowanie wierszy (z podziałem na wiersze zamrożone i wirtualizowane)
    const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();

    const renderRowHTML = (vr, isFrozenRow = false) => {
      const actualRowIndex = this.rowIndices[vr];
      const rowData = this.data[actualRowIndex] || [];
      const isRowSelected = this.isRowSelected(vr);
      const isRowDivider = isFrozenRow && vr === this.frozenRows - 1;
      const topOffset = this.headerRowHeight + vr * this.rowHeight;

      let rowHTML = `<tr style="height: ${this.rowHeight}px;">`;
      
      let thStyle = '';
      if (isFrozenRow) {
        thStyle = `position: sticky; top: ${topOffset}px; left: 0; z-index: 33;`;
      }
      rowHTML += `<th class="csv-th-row ${isRowSelected ? 'selected' : ''} ${isRowDivider ? 'freeze-row-divider' : ''}" 
                     style="${thStyle}" 
                     data-row="${vr}" 
                     title="Prawy przycisk: opcje wiersza">${actualRowIndex + 1}</th>`;

      for (let c = 0; c < colCount; c++) {
        if (this.hiddenCols.has(c)) continue;

        const cellValue = rowData[c] !== undefined ? rowData[c] : '';
        const isActive = this.activeCell.row === vr && this.activeCell.col === c;
        const isSelected = vr >= minRow && vr <= maxRow && c >= minCol && c <= maxCol;
        
        const isMatch = this.searchMatches.some(m => m.row === actualRowIndex && m.col === c);
        const isCurrentMatch = this.currentSearchIndex >= 0 && 
          this.searchMatches[this.currentSearchIndex] && 
          this.searchMatches[this.currentSearchIndex].row === actualRowIndex && 
          this.searchMatches[this.currentSearchIndex].col === c;

        const isFrozenCol = c < this.frozenCols;
        const isColDivider = isFrozenCol && c === this.frozenCols - 1;

        let cellClasses = ['csv-td'];
        if (isActive) cellClasses.push('active-cell');
        else if (isSelected) cellClasses.push('selected-cell');

        if (isCurrentMatch) cellClasses.push('search-current');
        else if (isMatch) cellClasses.push('search-match');

        if (isFrozenRow && isFrozenCol) cellClasses.push('frozen-intersection');
        else if (isFrozenRow) cellClasses.push('frozen-row');
        else if (isFrozenCol) cellClasses.push('frozen-col');

        if (isColDivider) cellClasses.push('freeze-col-divider');
        if (isRowDivider) cellClasses.push('freeze-row-divider');

        let tdStyle = '';
        if (isFrozenRow && isFrozenCol) {
          tdStyle = `position: sticky; top: ${topOffset}px; left: ${colLeftOffsets[c]}px; z-index: 25;`;
        } else if (isFrozenRow) {
          tdStyle = `position: sticky; top: ${topOffset}px; z-index: 18;`;
        } else if (isFrozenCol) {
          tdStyle = `position: sticky; left: ${colLeftOffsets[c]}px; z-index: 10;`;
        }

        rowHTML += `
          <td class="${cellClasses.join(' ')}" 
              style="${tdStyle}"
              data-row="${vr}" 
              data-col="${c}" 
              title="${this.escapeHTML(String(cellValue))}">
            ${this.escapeHTML(String(cellValue))}
          </td>
        `;
      }

      rowHTML += `</tr>`;
      return rowHTML;
    };

    let tbodyHTML = '';

    // A. Zawsze wyrenderuj zablokowane wiersze
    if (this.frozenRows > 0) {
      const frozenLimit = Math.min(this.frozenRows, rowCount);
      for (let vr = 0; vr < frozenLimit; vr++) {
        tbodyHTML += renderRowHTML(vr, true);
      }
    }

    // B. Oblicz wirtualizację dla pozostałych wierszy
    const calcStart = Math.max(this.frozenRows, startRow);
    const calcEnd = Math.min(rowCount - 1, endRow);

    const topSpacerHeight = Math.max(0, (calcStart - this.frozenRows) * this.rowHeight);
    const bottomSpacerHeight = Math.max(0, (rowCount - 1 - calcEnd) * this.rowHeight);

    if (topSpacerHeight > 0) {
      tbodyHTML += `<tr style="height: ${topSpacerHeight}px;"><td colspan="${colCount + 1}" style="border:none; padding:0; height:${topSpacerHeight}px;"></td></tr>`;
    }

    for (let vr = calcStart; vr <= calcEnd; vr++) {
      tbodyHTML += renderRowHTML(vr, false);
    }

    if (bottomSpacerHeight > 0) {
      tbodyHTML += `<tr style="height: ${bottomSpacerHeight}px;"><td colspan="${colCount + 1}" style="border:none; padding:0; height:${bottomSpacerHeight}px;"></td></tr>`;
    }

    this.tbody.innerHTML = tbodyHTML;

    // 5. Pozycjonuj Excel Fill Handle oraz animowaną ramkę skopiowanego zakresu (Marching Ants)
    this.updateFillHandlePosition();
    this.updateCopiedIndicator();
  }
});
})();
