(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  startEditing(row, col, initialChar = null, appendToEnd = false) {
    if (this.isEditing) this.commitEdit();
    this.clearCopiedIndicator();

    const actualR = this.rowIndices[row];
    const initialVal = this.data[actualR][col] !== undefined ? String(this.data[actualR][col]) : '';

    this.isEditing = true;
    this.editCell = { row, col, actualR, initialVal };

    this.editor.value = initialChar !== null ? initialChar : initialVal;
    this.editor.style.display = 'block';
    this.updateEditorPosition();
    this.editor.focus();

    if (appendToEnd) {
      const len = this.editor.value.length;
      this.editor.setSelectionRange(len, len);
    } else if (initialChar !== null) {
      this.editor.setSelectionRange(1, 1);
    } else {
      this.editor.select();
    }
  },

  updateEditorPosition() {
    if (!this.isEditing || !this.editCell) return;
    const { row, col } = this.editCell;

    let left = this.headerColWidth;
    for (let c = 0; c < col; c++) {
      if (!this.hiddenCols.has(c)) {
        left += this.getColWidth(c);
      }
    }
    const top = this.headerRowHeight + row * this.rowHeight;
    const width = this.getColWidth(col);
    const height = this.rowHeight;

    this.editor.style.left = `${left}px`;
    this.editor.style.top = `${top}px`;
    this.editor.style.width = `${width}px`;
    this.editor.style.minHeight = `${height}px`;
  },

  commitEdit() {
    if (!this.isEditing || !this.editCell) return;

    const { actualR, col, initialVal } = this.editCell;
    const newVal = this.editor.value;

    this.isEditing = false;
    this.editor.style.display = 'none';
    this.editCell = null;

    if (newVal !== initialVal) {
      this.data[actualR][col] = newVal;
      if (this.onCellChange) {
        this.onCellChange(actualR, col, initialVal, newVal);
      }
      this.render();
      this.notifySelection();
    }

    if (this.wrapper) this.wrapper.focus();
  },

  cancelEdit() {
    if (!this.isEditing) return;
    this.isEditing = false;
    this.editor.style.display = 'none';
    this.editCell = null;
    if (this.wrapper) this.wrapper.focus();
  }
});
})();
