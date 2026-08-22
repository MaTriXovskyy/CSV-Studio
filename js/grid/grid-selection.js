(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  selectCell(row, col, focus = true) {
    this.activeCell = { row, col };
    this.selection = { startRow: row, startCol: col, endRow: row, endCol: col };
    this.selectionType = 'cell';
    this.render();
    this.notifySelection();
    if (focus && this.wrapper) {
      this.wrapper.focus({ preventScroll: true });
    }
  },

  extendSelection(row, col) {
    this.selection.endRow = row;
    this.selection.endCol = col;
    this.render();
    this.notifySelection();
  },

  navigateCell(row, col) {
    this.selectCell(row, col);
    this.ensureCellVisible(row, col);
  },

  selectRow(row, isShift = false, isDrag = false) {
    if (isShift) {
      this.selection.endRow = row;
      this.selection.endCol = this.getColCount() - 1;
    } else {
      this.activeCell = { row, col: 0 };
      this.selection = { startRow: row, startCol: 0, endRow: row, endCol: this.getColCount() - 1 };
    }
    this.selectionType = 'row';
    this.render();
    this.notifySelection();
    if (!isDrag && this.wrapper) this.wrapper.focus({ preventScroll: true });
  },

  selectColumn(col, isShift = false, isDrag = false) {
    if (isShift) {
      this.selection.endRow = this.getRowCount() - 1;
      this.selection.endCol = col;
    } else {
      this.activeCell = { row: 0, col };
      this.selection = { startRow: 0, startCol: col, endRow: this.getRowCount() - 1, endCol: col };
    }
    this.selectionType = 'col';
    this.render();
    this.notifySelection();
    if (!isDrag && this.wrapper) this.wrapper.focus({ preventScroll: true });
  },

  selectAll() {
    this.activeCell = { row: 0, col: 0 };
    this.selection = {
      startRow: 0,
      startCol: 0,
      endRow: Math.max(0, this.getRowCount() - 1),
      endCol: Math.max(0, this.getColCount() - 1)
    };
    this.selectionType = 'all';
    this.render();
    this.notifySelection();
    if (this.wrapper) this.wrapper.focus({ preventScroll: true });
  },

  ensureCellVisible(row, col) {
    if (!this.wrapper) return;

    let cellLeft = this.headerColWidth;
    for (let c = 0; c < col; c++) {
      if (!this.hiddenCols.has(c)) {
        cellLeft += this.getColWidth(c);
      }
    }
    const cellWidth = this.getColWidth(col);
    const cellRight = cellLeft + cellWidth;

    const cellTop = this.headerRowHeight + row * this.rowHeight;
    const cellBottom = cellTop + this.rowHeight;

    const viewLeft = this.wrapper.scrollLeft;
    const viewRight = this.wrapper.scrollLeft + this.wrapper.clientWidth;
    const viewTop = this.wrapper.scrollTop;
    const viewBottom = this.wrapper.scrollTop + this.wrapper.clientHeight;

    if (cellLeft < viewLeft) {
      this.wrapper.scrollLeft = cellLeft - this.headerColWidth;
    } else if (cellRight > viewRight) {
      this.wrapper.scrollLeft = cellRight - this.wrapper.clientWidth + 20;
    }

    if (cellTop < viewTop) {
      this.wrapper.scrollTop = cellTop - this.headerRowHeight;
    } else if (cellBottom > viewBottom) {
      this.wrapper.scrollTop = cellBottom - this.wrapper.clientHeight + 20;
    }
  },

  getNormalizedSelection() {
    return {
      minRow: Math.min(this.selection.startRow, this.selection.endRow),
      maxRow: Math.max(this.selection.startRow, this.selection.endRow),
      minCol: Math.min(this.selection.startCol, this.selection.endCol),
      maxCol: Math.max(this.selection.startCol, this.selection.endCol)
    };
  },

  isColSelected(col) {
    const { minCol, maxCol, minRow, maxRow } = this.getNormalizedSelection();
    return col >= minCol && col <= maxCol && minRow === 0 && maxRow === this.getRowCount() - 1;
  },

  isRowSelected(row) {
    const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
    return row >= minRow && row <= maxRow && minCol === 0 && maxCol === this.getColCount() - 1;
  },

  notifySelection() {
    if (this.onSelectionChange) {
      const norm = this.getNormalizedSelection();
      const actualActiveR = this.rowIndices[this.activeCell.row] !== undefined ? this.rowIndices[this.activeCell.row] : this.activeCell.row;
      const cellVal = this.data[actualActiveR] ? this.data[actualActiveR][this.activeCell.col] : '';

      this.onSelectionChange({
        activeCell: { ...this.activeCell, actualRow: actualActiveR, value: cellVal },
        selection: norm,
        rowCount: this.getRowCount(),
        colCount: this.getColCount(),
        hiddenColsCount: this.hiddenCols.size,
        totalDataRows: this.data.length
      });
    }
  }
});
})();
