/**
 * History Manager - Obsługa Cofnij / Ponów (Undo / Redo, Ctrl+Z, Ctrl+Y)
 */

class HistoryManager {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
    this.onChangeCallback = null;
  }

  setChangeCallback(cb) {
    this.onChangeCallback = cb;
  }

  notify() {
    if (this.onChangeCallback) {
      this.onChangeCallback(this.canUndo(), this.canRedo());
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  push(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // wyczyszczenie stosu ponawiania przy nowej akcji
    this.notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(dataset) {
    if (!this.canUndo()) return null;
    const action = this.undoStack.pop();
    this.redoStack.push(action);
    this.applyAction(action, dataset, true);
    this.notify();
    return action;
  }

  redo(dataset) {
    if (!this.canRedo()) return null;
    const action = this.redoStack.pop();
    this.undoStack.push(action);
    this.applyAction(action, dataset, false);
    this.notify();
    return action;
  }

  applyAction(action, dataset, isUndo) {
    switch (action.type) {
      case 'CELL_CHANGE': {
        const val = isUndo ? action.oldValue : action.newValue;
        dataset.setCellValue(action.row, action.col, val, false);
        break;
      }

      case 'RANGE_CHANGE': {
        for (const change of action.changes) {
          const val = isUndo ? change.oldValue : change.newValue;
          dataset.setCellValue(change.row, change.col, val, false);
        }
        break;
      }

      case 'INSERT_ROW': {
        if (isUndo) {
          dataset.removeRowInternal(action.rowIndex, false);
        } else {
          dataset.insertRowInternal(action.rowIndex, action.rowData, false);
        }
        break;
      }

      case 'DELETE_ROWS': {
        if (isUndo) {
          // Odtwarzamy usunięte wiersze w pierwotnej kolejności
          const sorted = [...action.rows].sort((a, b) => a.rowIndex - b.rowIndex);
          for (const item of sorted) {
            dataset.insertRowInternal(item.rowIndex, item.rowData, false);
          }
        } else {
          const indices = action.rows.map(r => r.rowIndex).sort((a, b) => b - a);
          for (const idx of indices) {
            dataset.removeRowInternal(idx, false);
          }
        }
        break;
      }

      case 'INSERT_COL': {
        if (isUndo) {
          dataset.removeColInternal(action.colIndex, false);
        } else {
          dataset.insertColInternal(action.colIndex, action.colData, action.colName, false);
        }
        break;
      }

      case 'DELETE_COLS': {
        if (isUndo) {
          const sorted = [...action.cols].sort((a, b) => a.colIndex - b.colIndex);
          for (const item of sorted) {
            dataset.insertColInternal(item.colIndex, item.colData, item.colName, false);
          }
        } else {
          const indices = action.cols.map(c => c.colIndex).sort((a, b) => b - a);
          for (const idx of indices) {
            dataset.removeColInternal(idx, false);
          }
        }
        break;
      }

      case 'FULL_TABLE_REPLACE': {
        const data = isUndo ? action.oldData : action.newData;
        const headers = isUndo ? action.oldHeaders : action.newHeaders;
        dataset.setFullData(JSON.parse(JSON.stringify(data)), headers ? [...headers] : null, false);
        break;
      }

      case 'FREEZE_PANES': {
        const rows = isUndo ? action.oldRows : action.newRows;
        const cols = isUndo ? action.oldCols : action.newCols;
        if (dataset.setFrozenPanesInternal) {
          dataset.setFrozenPanesInternal(rows, cols);
        }
        break;
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.HistoryManager = HistoryManager;
}
