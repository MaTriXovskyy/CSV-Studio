(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  updateCopiedIndicator() {
    if (!this.clipboardAnts) return;
    if (this.data.length === 0 || !this.copiedRange) {
      this.clipboardAnts.style.display = 'none';
      return;
    }

    const { minRow, maxRow, minCol, maxCol } = this.copiedRange;
    const rowCount = this.getRowCount();
    const colCount = this.getColCount();

    if (minRow >= rowCount || minCol >= colCount) {
      this.clipboardAnts.style.display = 'none';
      return;
    }

    const clampedMaxRow = Math.min(maxRow, rowCount - 1);
    const clampedMaxCol = Math.min(maxCol, colCount - 1);

    let left = this.headerColWidth;
    for (let c = 0; c < minCol; c++) {
      if (!this.hiddenCols.has(c)) {
        left += this.getColWidth(c);
      }
    }

    let width = 0;
    for (let c = minCol; c <= clampedMaxCol; c++) {
      if (!this.hiddenCols.has(c)) {
        width += this.getColWidth(c);
      }
    }

    if (width === 0) {
      this.clipboardAnts.style.display = 'none';
      return;
    }

    const top = this.headerRowHeight + minRow * this.rowHeight;
    const height = (clampedMaxRow - minRow + 1) * this.rowHeight;

    this.clipboardAnts.style.left = `${left}px`;
    this.clipboardAnts.style.top = `${top}px`;
    this.clipboardAnts.style.width = `${width}px`;
    this.clipboardAnts.style.height = `${height}px`;
    this.clipboardAnts.style.display = 'block';
  },

  clearCopiedIndicator() {
    this.copiedRange = null;
    this.copiedType = null;
    if (this.clipboardAnts) {
      this.clipboardAnts.style.display = 'none';
    }
  },

  updateFillHandlePosition() {
    if (!this.fillHandle) return;
    if (this.data.length === 0 || this.isEditing) {
      this.fillHandle.style.display = 'none';
      return;
    }

    const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
    if (this.hiddenCols.has(maxCol)) {
      this.fillHandle.style.display = 'none';
      return;
    }

    let leftOffset = this.headerColWidth;
    for (let c = 0; c < maxCol; c++) {
      if (!this.hiddenCols.has(c)) {
        leftOffset += this.getColWidth(c);
      }
    }
    const colW = this.getColWidth(maxCol);
    if (colW === 0) {
      this.fillHandle.style.display = 'none';
      return;
    }

    const x = leftOffset + colW - 4;
    const y = this.headerRowHeight + (maxRow + 1) * this.rowHeight - 4;

    this.fillHandle.style.left = `${x}px`;
    this.fillHandle.style.top = `${y}px`;
    this.fillHandle.style.display = 'block';
  },

  bindFillHandleEvents() {
    if (!this.fillHandle) return;

    this.fillHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();

      this.isFilling = true;
      this.fillSourceSelection = { ...this.getNormalizedSelection() };
      this.fillTargetRange = { ...this.fillSourceSelection };

      const onMouseMove = (moveEvent) => {
        if (!this.isFilling) return;
        moveEvent.preventDefault();

        const rect = this.sizer.getBoundingClientRect();
        const mouseX = moveEvent.clientX - rect.left;
        const mouseY = moveEvent.clientY - rect.top;

        let targetRow = Math.floor((mouseY - this.headerRowHeight) / this.rowHeight);
        targetRow = Math.max(0, Math.min(this.getRowCount() - 1, targetRow));

        let curX = this.headerColWidth;
        let targetCol = 0;
        const colCount = this.getColCount();
        for (let c = 0; c < colCount; c++) {
          if (this.hiddenCols.has(c)) continue;
          const w = this.getColWidth(c);
          if (mouseX >= curX && mouseX <= curX + w) {
            targetCol = c;
            break;
          }
          curX += w;
          targetCol = c;
        }

        const src = this.fillSourceSelection;
        let previewRange;
        if (targetRow > src.maxRow) {
          previewRange = {
            minRow: src.minRow,
            maxRow: targetRow,
            minCol: src.minCol,
            maxCol: src.maxCol,
            direction: 'down'
          };
        } else if (targetCol > src.maxCol) {
          previewRange = {
            minRow: src.minRow,
            maxRow: src.maxRow,
            minCol: src.minCol,
            maxCol: targetCol,
            direction: 'right'
          };
        } else {
          previewRange = { ...src, direction: 'none' };
        }

        this.fillTargetRange = previewRange;
        this.renderFillPreview(previewRange);
      };

      const onMouseUp = () => {
        if (!this.isFilling) return;
        this.isFilling = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (this.fillPreview) this.fillPreview.style.display = 'none';

        const src = this.fillSourceSelection;
        const target = this.fillTargetRange;

        if (target && target.direction === 'down' && target.maxRow > src.maxRow) {
          this.executeFillDown(src, target.maxRow);
        } else if (target && target.direction === 'right' && target.maxCol > src.maxCol) {
          this.executeFillRight(src, target.maxCol);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Podwójne kliknięcie w zielony kwadracik (Excel Auto Fill Down)
    this.fillHandle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.executeAutoFillDown();
    });
  },

  renderFillPreview(range) {
    if (!this.fillPreview || !range) return;

    let left = this.headerColWidth;
    for (let c = 0; c < range.minCol; c++) {
      if (!this.hiddenCols.has(c)) left += this.getColWidth(c);
    }

    let width = 0;
    for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.hiddenCols.has(c)) width += this.getColWidth(c);
    }

    const top = this.headerRowHeight + range.minRow * this.rowHeight;
    const height = (range.maxRow - range.minRow + 1) * this.rowHeight;

    this.fillPreview.style.left = `${left}px`;
    this.fillPreview.style.top = `${top}px`;
    this.fillPreview.style.width = `${width}px`;
    this.fillPreview.style.height = `${height}px`;
    this.fillPreview.style.display = 'block';
  },

  executeFillDown(src, targetMaxRow) {
    const changes = [];
    for (let c = src.minCol; c <= src.maxCol; c++) {
      const sourceValues = [];
      for (let r = src.minRow; r <= src.maxRow; r++) {
        const actualR = this.rowIndices[r];
        sourceValues.push(this.data[actualR][c] || '');
      }

      const countToGenerate = targetMaxRow - src.maxRow;
      const generated = CSVOperations.generateSeries(sourceValues, countToGenerate);

      for (let i = 0; i < countToGenerate; i++) {
        const r = src.maxRow + 1 + i;
        const actualR = this.rowIndices[r];
        const oldVal = this.data[actualR][c] || '';
        const newVal = generated[i] !== undefined ? generated[i] : '';

        if (oldVal !== newVal) {
          this.data[actualR][c] = newVal;
          changes.push({ row: actualR, col: c, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    if (changes.length > 0 && this.onStructureChange) {
      this.onStructureChange({ type: 'RANGE_CHANGE', changes });
    }

    this.selection = {
      startRow: src.minRow,
      startCol: src.minCol,
      endRow: targetMaxRow,
      endCol: src.maxCol
    };
    this.render();
    this.notifySelection();
  },

  executeFillRight(src, targetMaxCol) {
    const changes = [];
    for (let r = src.minRow; r <= src.maxRow; r++) {
      const actualR = this.rowIndices[r];
      const sourceValues = [];
      for (let c = src.minCol; c <= src.maxCol; c++) {
        sourceValues.push(this.data[actualR][c] || '');
      }

      const countToGenerate = targetMaxCol - src.maxCol;
      const generated = CSVOperations.generateSeries(sourceValues, countToGenerate);

      for (let i = 0; i < countToGenerate; i++) {
        const c = src.maxCol + 1 + i;
        const oldVal = this.data[actualR][c] || '';
        const newVal = generated[i] !== undefined ? generated[i] : '';

        if (oldVal !== newVal) {
          this.data[actualR][c] = newVal;
          changes.push({ row: actualR, col: c, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    if (changes.length > 0 && this.onStructureChange) {
      this.onStructureChange({ type: 'RANGE_CHANGE', changes });
    }

    this.selection = {
      startRow: src.minRow,
      startCol: src.minCol,
      endRow: src.maxRow,
      endCol: targetMaxCol
    };
    this.render();
    this.notifySelection();
  },

  executeAutoFillDown() {
    const src = this.getNormalizedSelection();
    const rowCount = this.getRowCount();
    if (src.maxRow >= rowCount - 1) return;

    let targetRow = rowCount - 1;
    const adjCol = src.minCol > 0 ? src.minCol - 1 : (src.maxCol < this.getColCount() - 1 ? src.maxCol + 1 : -1);
    if (adjCol !== -1) {
      for (let r = src.maxRow + 1; r < rowCount; r++) {
        const actualR = this.rowIndices[r];
        if (!this.data[actualR][adjCol] || String(this.data[actualR][adjCol]).trim() === '') {
          targetRow = Math.max(src.maxRow, r - 1);
          break;
        }
      }
    }

    if (targetRow > src.maxRow) {
      this.executeFillDown(src, targetRow);
    }
  },

  getSelectionText() {
    const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
    const rows = [];

    for (let r = minRow; r <= maxRow; r++) {
      const actualR = this.rowIndices[r];
      if (actualR === undefined || !this.data[actualR]) continue;

      const rowVals = [];
      for (let c = minCol; c <= maxCol; c++) {
        if (!this.hiddenCols.has(c)) {
          const val = this.data[actualR][c] !== undefined ? String(this.data[actualR][c]) : '';
          if (val.includes('\t') || val.includes('\n') || val.includes('\r') || val.includes('"')) {
            rowVals.push(`"${val.replace(/"/g, '""')}"`);
          } else {
            rowVals.push(val);
          }
        }
      }
      rows.push(rowVals.join('\t'));
    }

    return rows.join('\r\n');
  },

  async copySelection() {
    const text = this.getSelectionText();
    const norm = this.getNormalizedSelection();
    this.copiedRange = { ...norm, type: this.selectionType };
    this.copiedType = 'copy';
    this.updateCopiedIndicator();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.fallbackCopyText(text);
      }
    } catch (err) {
      this.fallbackCopyText(text);
    }
    return text;
  },

  fallbackCopyText(text) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (e) {
      console.warn('Fallback copy error:', e);
    }
  },

  async cutSelection() {
    const text = await this.copySelection();
    this.copiedType = 'cut';
    this.clearSelection();
    return text;
  },

  pasteData(text) {
    if (!text) return;
    const cleanText = text.replace(/\r?\n$/, '');
    if (cleanText.length === 0) return;

    let parsedMatrix = [];

    if (cleanText.includes('\t')) {
      const parsed = CSVParser.parse(cleanText, { delimiter: '\t' });
      parsedMatrix = parsed.data;
    } else if (cleanText.includes(';') || cleanText.includes(',')) {
      const parsed = CSVParser.parse(cleanText);
      parsedMatrix = parsed.data;
    } else {
      parsedMatrix = cleanText.split(/\r?\n/).map(line => [line]);
    }

    if (!parsedMatrix || parsedMatrix.length === 0) return;

    const { minRow, minCol } = this.getNormalizedSelection();
    const changes = [];
    const isFiltered = this.colFilters.size > 0;

    const pasteRowCount = parsedMatrix.length;
    let maxPasteCols = 0;
    for (const r of parsedMatrix) {
      if (Array.isArray(r)) maxPasteCols = Math.max(maxPasteCols, r.length);
    }
    if (maxPasteCols === 0) maxPasteCols = 1;

    // 1. Automatyczne powiększanie kolumn tabeli (również przy filtrze)
    const neededCols = minCol + maxPasteCols;
    const currentColCount = this.getColCount();
    if (neededCols > currentColCount) {
      for (let r = 0; r < this.data.length; r++) {
        while (this.data[r].length < neededCols) {
          this.data[r].push('');
        }
      }
      while (this.colWidths.length < neededCols) {
        this.colWidths.push(this.defaultColWidth);
      }
      if (this.headers && Array.isArray(this.headers)) {
        while (this.headers.length < neededCols) {
          this.headers.push(CSVParser.columnIndexToLetter(this.headers.length));
        }
      }
    }

    // 2. Automatyczne powiększanie wierszy (gdy brak filtra)
    if (!isFiltered) {
      const neededRows = minRow + pasteRowCount;
      const currentRows = this.data.length;
      if (neededRows > currentRows) {
        const totalCols = this.getColCount();
        for (let i = currentRows; i < neededRows; i++) {
          this.data.push(new Array(totalCols).fill(''));
        }
        this.rowIndices = this.data.map((_, i) => i);
      }
    }

    // 3. Odkryj wszystkie kolumny wklejane, aby dane nie lądowały w ukrytych kolumnach
    for (let c = minCol; c < minCol + maxPasteCols; c++) {
      this.hiddenCols.delete(c);
    }

    const availableRows = this.getRowCount();
    const availableCols = this.getColCount();

    for (let r = 0; r < pasteRowCount; r++) {
      const targetR = minRow + r;
      if (targetR >= availableRows) break;
      const actualR = this.rowIndices[targetR];
      if (actualR === undefined || !this.data[actualR]) continue;
      const rowValues = parsedMatrix[r] || [];

      for (let c = 0; c < rowValues.length; c++) {
        const targetC = minCol + c;
        if (targetC >= availableCols) break;

        const oldVal = this.data[actualR][targetC] !== undefined ? String(this.data[actualR][targetC]) : '';
        const newVal = rowValues[c] !== undefined ? String(rowValues[c]) : '';

        if (oldVal !== newVal) {
          this.data[actualR][targetC] = newVal;
          changes.push({ row: actualR, col: targetC, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    if (this.copiedType === 'cut') {
      this.clearCopiedIndicator();
    }

    // 4. Zaznacz wklejony obszar (jak w Excelu)
    const finalEndRow = Math.min(minRow + pasteRowCount - 1, availableRows - 1);
    const finalEndCol = Math.min(minCol + maxPasteCols - 1, availableCols - 1);
    this.selection = {
      startRow: minRow,
      startCol: minCol,
      endRow: finalEndRow,
      endCol: finalEndCol
    };
    this.selectionType = (pasteRowCount === availableRows && minRow === 0) ? 'col' : 'cell';

    if (changes.length > 0 && this.onStructureChange) {
      this.onStructureChange({ type: 'RANGE_CHANGE', changes });
    }

    this.updateDimensions();
    this.render();
    this.notifySelection();
  },

  clearSelection() {
    const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
    const changes = [];

    for (let r = minRow; r <= maxRow; r++) {
      const actualR = this.rowIndices[r];
      for (let c = minCol; c <= maxCol; c++) {
        const oldVal = this.data[actualR][c];
        if (oldVal !== '') {
          this.data[actualR][c] = '';
          changes.push({ row: actualR, col: c, oldValue: oldVal, newValue: '' });
        }
      }
    }

    if (changes.length > 0 && this.onStructureChange) {
      this.onStructureChange({ type: 'RANGE_CHANGE', changes });
    }

    this.render();
    this.notifySelection();
  }
});
})();
