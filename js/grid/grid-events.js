(function() {
  const TargetGrid = (typeof window !== 'undefined' && window.CSVGrid) || (typeof global !== 'undefined' && global.CSVGrid);
  if (!TargetGrid) return;

  Object.assign(TargetGrid.prototype, {
  bindEvents() {
    let scrollTimeout = null;
    this.wrapper.addEventListener('scroll', () => {
      if (this.isEditing) {
        this.updateEditorPosition();
      }
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(() => {
        this.render();
      });
    }, { passive: true });

    // Obsługa kliknięć
    this.table.addEventListener('mousedown', (e) => {
      if (this.isEditing) {
        this.commitEdit();
      }

      // Upewnij się, że siatka zawsze otrzymuje fokus klawiatury
      this.wrapper.focus({ preventScroll: true });

      // Kliknięcie w przycisk filtra w nagłówku
      const filterBtn = e.target.closest('.col-filter-btn');
      if (filterBtn) {
        e.stopPropagation();
        e.preventDefault();
        const col = parseInt(filterBtn.dataset.filterCol, 10);
        if (this.onFilterClick) {
          this.onFilterClick(col, filterBtn);
        }
        return;
      }

      // Resizing kolumny
      const resizeHandle = e.target.closest('.col-resize-handle');
      if (resizeHandle) {
        e.stopPropagation();
        e.preventDefault();
        const col = parseInt(resizeHandle.dataset.col, 10);
        this.startColumnResize(col, e.clientX);
        return;
      }

      // Kliknięcie w lewy górny róg
      const cornerTh = e.target.closest('.csv-th-corner');
      if (cornerTh) {
        this.selectAll();
        return;
      }

      // Kliknięcie w nagłówek kolumny
      const colTh = e.target.closest('.csv-th-col');
      if (colTh) {
        const col = parseInt(colTh.dataset.col, 10);
        if (e.button === 0) {
          this.selectColumn(col, e.shiftKey);
          this.isSelecting = true;
          this.selectionType = 'col';
        }
        return;
      }

      // Kliknięcie w nagłówek wiersza
      const rowTh = e.target.closest('.csv-th-row');
      if (rowTh) {
        const row = parseInt(rowTh.dataset.row, 10);
        if (e.button === 0) {
          this.selectRow(row, e.shiftKey);
          this.isSelecting = true;
          this.selectionType = 'row';
        }
        return;
      }

      // Kliknięcie w komórkę danych
      const td = e.target.closest('.csv-td');
      if (td) {
        if (e.button !== 0) return;
        const row = parseInt(td.dataset.row, 10);
        const col = parseInt(td.dataset.col, 10);

        if (e.shiftKey) {
          this.extendSelection(row, col);
        } else {
          this.selectCell(row, col);
          this.isSelecting = true;
          this.selectionType = 'cell';
        }
      }
    });

    // Własne menu kontekstowe PPM (blokuje domyślne menu przeglądarki)
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const colTh = e.target.closest('.csv-th-col');
      if (colTh) {
        const col = parseInt(colTh.dataset.col, 10);
        const { minCol, maxCol } = this.getNormalizedSelection();
        // Jeśli kliknięta kolumna NIE jest wewnątrz aktualnego zaznaczenia kolumn, zaznacz tę jedną
        if (!(this.selectionType === 'col' && col >= minCol && col <= maxCol)) {
          this.selectColumn(col);
        }
        this.showContextMenu(e, 'col', { col });
        return;
      }

      const rowTh = e.target.closest('.csv-th-row');
      if (rowTh) {
        const row = parseInt(rowTh.dataset.row, 10);
        const { minRow, maxRow } = this.getNormalizedSelection();
        // Jeśli kliknięty wiersz NIE jest wewnątrz aktualnego zaznaczenia wierszy, zaznacz ten jeden
        if (!(this.selectionType === 'row' && row >= minRow && row <= maxRow)) {
          this.selectRow(row);
        }
        this.showContextMenu(e, 'row', { row });
        return;
      }

      const td = e.target.closest('.csv-td');
      if (td) {
        const row = parseInt(td.dataset.row, 10);
        const col = parseInt(td.dataset.col, 10);
        const { minRow, maxRow, minCol, maxCol } = this.getNormalizedSelection();
        if (!(row >= minRow && row <= maxRow && col >= minCol && col <= maxCol)) {
          this.selectCell(row, col);
        }
        this.showContextMenu(e, 'cell', { row, col });
        return;
      }
    });

    this.table.addEventListener('mousemove', (e) => {
      if (!this.isSelecting) return;

      if (this.selectionType === 'row') {
        const rowTarget = e.target.closest('.csv-th-row, .csv-td');
        if (rowTarget && rowTarget.dataset.row !== undefined) {
          const row = parseInt(rowTarget.dataset.row, 10);
          if (!isNaN(row)) {
            this.selectRow(row, true, true);
          }
        }
      } else if (this.selectionType === 'col') {
        const colTarget = e.target.closest('.csv-th-col, .csv-td');
        if (colTarget && colTarget.dataset.col !== undefined) {
          const col = parseInt(colTarget.dataset.col, 10);
          if (!isNaN(col)) {
            this.selectColumn(col, true, true);
          }
        }
      } else {
        const td = e.target.closest('.csv-td');
        if (td && td.dataset.row !== undefined && td.dataset.col !== undefined) {
          const row = parseInt(td.dataset.row, 10);
          const col = parseInt(td.dataset.col, 10);
          if (!isNaN(row) && !isNaN(col)) {
            this.extendSelection(row, col);
          }
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.isSelecting = false;
    });

    // Podwójne kliknięcie (start edycji komórki lub auto-fit nagłówka)
    this.table.addEventListener('dblclick', (e) => {
      const resizeHandle = e.target.closest('.col-resize-handle');
      if (resizeHandle) {
        const col = parseInt(resizeHandle.dataset.col, 10);
        this.autoFitColumn(col);
        return;
      }

      const cornerTh = e.target.closest('.csv-th-corner');
      if (cornerTh) {
        this.autoFitAllColumns();
        return;
      }

      const td = e.target.closest('.csv-td');
      if (td) {
        const row = parseInt(td.dataset.row, 10);
        const col = parseInt(td.dataset.col, 10);
        this.startEditing(row, col);
      }
    });

    // Klawiatura w arkuszu
    this.wrapper.addEventListener('keydown', (e) => {
      if (this.isEditing) return;

      const { row, col } = this.activeCell;
      const maxR = this.getRowCount() - 1;
      const maxC = this.getColCount() - 1;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          this.clearCopiedIndicator();
          break;

        case 'ArrowUp':
          e.preventDefault();
          {
            const targetR = isCtrlOrMeta ? 0 : Math.max(0, (e.shiftKey ? this.selection.endRow : row) - 1);
            if (e.shiftKey) this.extendSelection(targetR, this.selection.endCol);
            else this.navigateCell(targetR, col);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          {
            const targetR = isCtrlOrMeta ? maxR : Math.min(maxR, (e.shiftKey ? this.selection.endRow : row) + 1);
            if (e.shiftKey) this.extendSelection(targetR, this.selection.endCol);
            else this.navigateCell(targetR, col);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          {
            const targetC = isCtrlOrMeta ? 0 : Math.max(0, (e.shiftKey ? this.selection.endCol : col) - 1);
            if (e.shiftKey) this.extendSelection(this.selection.endRow, targetC);
            else this.navigateCell(row, targetC);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          {
            const targetC = isCtrlOrMeta ? maxC : Math.min(maxC, (e.shiftKey ? this.selection.endCol : col) + 1);
            if (e.shiftKey) this.extendSelection(this.selection.endRow, targetC);
            else this.navigateCell(row, targetC);
          }
          break;

        case 'Home':
          e.preventDefault();
          if (isCtrlOrMeta) {
            if (e.shiftKey) this.extendSelection(0, 0);
            else this.navigateCell(0, 0);
          } else {
            if (e.shiftKey) this.extendSelection(this.selection.endRow, 0);
            else this.navigateCell(row, 0);
          }
          break;

        case 'End':
          e.preventDefault();
          if (isCtrlOrMeta) {
            if (e.shiftKey) this.extendSelection(maxR, maxC);
            else this.navigateCell(maxR, maxC);
          } else {
            if (e.shiftKey) this.extendSelection(this.selection.endRow, maxC);
            else this.navigateCell(row, maxC);
          }
          break;

        case 'PageUp':
          e.preventDefault();
          {
            const targetR = Math.max(0, (e.shiftKey ? this.selection.endRow : row) - 20);
            if (e.shiftKey) this.extendSelection(targetR, this.selection.endCol);
            else this.navigateCell(targetR, col);
          }
          break;

        case 'PageDown':
          e.preventDefault();
          {
            const targetR = Math.min(maxR, (e.shiftKey ? this.selection.endRow : row) + 20);
            if (e.shiftKey) this.extendSelection(targetR, this.selection.endCol);
            else this.navigateCell(targetR, col);
          }
          break;

        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) this.navigateCell(row, Math.max(0, col - 1));
          else this.navigateCell(row, Math.min(maxC, col + 1));
          break;

        case 'Enter':
          e.preventDefault();
          if (e.shiftKey) this.navigateCell(Math.max(0, row - 1), col);
          else this.navigateCell(Math.min(maxR, row + 1), col);
          break;

        case 'F2':
          e.preventDefault();
          this.startEditing(row, col, null, true);
          break;

        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this.clearSelection();
          if (window.app) window.app.saveNow();
          break;

        case 'd':
        case 'D':
          if (isCtrlOrMeta) {
            e.preventDefault();
            this.executeFillDown(this.getNormalizedSelection(), this.getNormalizedSelection().maxRow);
            if (window.app) {
              window.app.saveNow();
              window.app.showToast('Wypełniono komórki w dół (Ctrl+D)', 'info');
            }
          }
          break;

        case 'a':
        case 'A':
          if (isCtrlOrMeta) {
            e.preventDefault();
            this.selectAll();
          }
          break;

        case 'c':
        case 'C':
          if (isCtrlOrMeta) {
            e.preventDefault();
            this.copySelection();
            if (window.app) window.app.showToast('Skopiowano do schowka', 'info');
          }
          break;

        case 'x':
        case 'X':
          if (isCtrlOrMeta) {
            e.preventDefault();
            this.cutSelection();
            if (window.app) {
              window.app.saveNow();
              window.app.showToast('Wycięto do schowka', 'info');
            }
          }
          break;

        case 'v':
        case 'V':
          if (isCtrlOrMeta) {
            e.preventDefault();
            if (navigator.clipboard && navigator.clipboard.readText) {
              navigator.clipboard.readText().then(text => {
                if (text) {
                  this.pasteData(text);
                  if (window.app) {
                    window.app.saveNow();
                    window.app.showToast('Wklejono dane ze schowka', 'info');
                  }
                }
              }).catch(() => {
                // Gdy brak uprawnień asynchronicznych, zdarzenie natywne paste obsłuży to
              });
            }
          }
          break;

        default:
          if (!isCtrlOrMeta && !e.altKey && e.key.length === 1) {
            e.preventDefault();
            this.startEditing(row, col, e.key);
          }
          break;
      }
    });

    // Edytor komórki
    this.editor.addEventListener('keydown', (e) => {
      if (!this.isEditing) return;

      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.commitEdit();
        this.navigateCell(Math.min(this.getRowCount() - 1, this.activeCell.row + 1), this.activeCell.col);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.commitEdit();
        this.navigateCell(this.activeCell.row, Math.min(this.getColCount() - 1, this.activeCell.col + 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit();
      }
    });

    this.editor.addEventListener('blur', () => {
      if (this.isEditing) {
        this.commitEdit();
      }
    });

    // Zamykanie context menu
    const dismissContextMenu = () => {
      if (this.contextMenu) {
        this.contextMenu.classList.remove('show');
        this.contextMenu.style.display = 'none';
      }
    };
    this.dismissContextMenu = dismissContextMenu;

    const onOutsideAction = (e) => {
      if (!this.contextMenu || this.contextMenu.style.display === 'none') return;
      if (!e.target.closest('#gridContextMenu')) {
        dismissContextMenu();
      }
    };

    document.addEventListener('pointerdown', onOutsideAction, true);
    document.addEventListener('mousedown', onOutsideAction, true);
    window.addEventListener('blur', dismissContextMenu);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dismissContextMenu();
    });
    this.wrapper.addEventListener('scroll', dismissContextMenu, { passive: true });

    this.contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-item');
      if (item && !item.classList.contains('disabled')) {
        const action = item.dataset.action;
        dismissContextMenu();
        if (this.onContextMenu) {
          this.onContextMenu(action, this.contextMenuTarget);
        }
      }
    });
  },

  startColumnResize(col, startX) {
    this.resizingCol = col;
    this.resizeStartX = startX;
    this.resizeStartWidth = this.getColWidth(col);

    document.body.classList.add('col-resizing');

    const onMouseMove = (e) => {
      if (this.resizingCol === null) return;
      const diff = e.clientX - this.resizeStartX;
      const newWidth = Math.max(40, this.resizeStartWidth + diff);
      this.colWidths[this.resizingCol] = newWidth;
      this.updateDimensions();
      this.render();
    };

    const onMouseUp = () => {
      this.resizingCol = null;
      document.body.classList.remove('col-resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (this.onStructureChange) {
        this.onStructureChange({ type: 'COL_RESIZED' });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
});
})();
