/**
 * CSV Studio Pro - Główna aplikacja (Excel Edition)
 * Niezawodny natychmiastowy zapis i przywracanie stanu dokumentów po odświeżeniu (F5)
 */

class CSVApp {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.tabCounter = 1;

    // Elementy DOM
    this.gridContainer = document.getElementById('gridContainer');
    this.emptyState = document.getElementById('emptyState');
    this.tabsContainer = document.getElementById('tabsContainer');
    this.fileInput = document.getElementById('fileInput');
    this.formulaInput = document.getElementById('formulaInput');
    this.cellAddressBox = document.getElementById('cellAddressBox');
    
    // Pasek statusu
    this.statusRowCol = document.getElementById('statusRowCol');
    this.statusSelection = document.getElementById('statusSelection');
    this.statusStats = document.getElementById('statusStats');
    this.statusDelimiter = document.getElementById('statusDelimiter');
    this.statusEncoding = document.getElementById('statusEncoding');
    
    // Szybki wybór
    this.quickDelimiterSelect = document.getElementById('quickDelimiterSelect');
    this.quickEncodingSelect = document.getElementById('quickEncodingSelect');

    // Modale & Powiadomienia
    this.toastContainer = document.getElementById('toastContainer');
    this.statsDrawer = document.getElementById('statsDrawer');

    // Opcje wyszukiwania
    this.searchOptions = { exactCell: false, caseSensitive: false, isRegex: false };

    // Inicjalizacja siatki
    this.grid = new CSVGrid(this.gridContainer, {
      onSelectionChange: (info) => this.handleSelectionChange(info),
      onCellChange: (r, c, oldVal, newVal) => this.handleCellChange(r, c, oldVal, newVal),
      onStructureChange: (action) => this.handleStructureChange(action),
      onContextMenu: (action, target) => this.handleContextMenuAction(action, target),
      onFilterClick: (col, btnEl) => this.openColumnFilterPopup(col, btnEl)
    });

    this.initTheme();
    this.bindEvents();
    this.bindModals();
    this.bindShortcuts();

    // IndexedDB jest kopią zapasową dla sesji większych niż limit localStorage.
    CSVStorage.initIndexedDB();

    this.workspaceReady = this.loadWorkspace();
  }

  captureActiveTabState() {
    const activeTab = this.getActiveTab();
    if (!activeTab || !this.grid) return;

    activeTab.colWidths = [...this.grid.colWidths];
    activeTab.viewState = this.grid.getViewState();
  }

  // Zapisuje aktualny stan do pamięci trwałej (z buforowaniem debounce, aby nie obciążać wątku UI)
  saveNow(immediate = false) {
    this.captureActiveTabState();
    if (immediate) {
      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
      CSVStorage.save(this.tabs, this.activeTabId);
      return;
    }

    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      CSVStorage.save(this.tabs, this.activeTabId);
    }, 400);
  }

  // Odczytuje stan po uruchomieniu / odświeżeniu
  async loadWorkspace() {
    const saved = await CSVStorage.load();

    if (saved && Array.isArray(saved.tabs)) {
      this.tabs = [];
      let maxCounter = 1;

      for (const t of saved.tabs) {
        const tabId = (typeof t.id === 'string' && t.id) ? t.id : `tab_${maxCounter++}`;
        const tab = {
          id: tabId,
          filename: t.filename || 'Arkusz.csv',
          data: (Array.isArray(t.data) && t.data.length > 0) ? t.data : [['']],
          headers: t.headers || null,
          hasHeader: !!t.hasHeader,
          delimiter: t.delimiter || ';',
          encoding: t.encoding || 'utf-8',
          colWidths: t.colWidths || null,
          viewState: t.viewState || null,
          history: new HistoryManager(),
          saved: true
        };

        const match = tabId.match(/tab_(\d+)/);
        if (match) {
          maxCounter = Math.max(maxCounter, parseInt(match[1], 10) + 1);
        }

        tab.history.setChangeCallback((canUndo, canRedo) => {
          if (this.activeTabId === tab.id) {
            document.getElementById('undoBtn').disabled = !canUndo;
            document.getElementById('redoBtn').disabled = !canRedo;
          }
        });

        this.tabs.push(tab);
      }

      this.tabCounter = maxCounter;
      this.renderTabs();

      if (this.tabs.length > 0) {
        const targetTabId = (saved.activeTabId && this.tabs.some(t => t.id === saved.activeTabId))
          ? saved.activeTabId
          : this.tabs[0].id;
        this.switchTab(targetTabId);
      } else {
        this.activeTabId = null;
        this.emptyState.classList.remove('hidden');
        this.gridContainer.style.display = 'none';
        this.clearStatusBar();
      }
    } else {
      // Domyślny arkusz jest tworzony tylko przy pierwszym uruchomieniu.
      this.createNewTab('Arkusz1.csv', this.generateEmptyData(25, 10));
    }

    this.refreshIcons();
  }

  refreshIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('csv_studio_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('csv_studio_theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = theme === 'dark' 
        ? '<i data-lucide="sun"></i><span>Jasny</span>' 
        : '<i data-lucide="moon"></i><span>Ciemny</span>';
      this.refreshIcons();
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'error') iconName = 'alert-triangle';

    toast.innerHTML = `<i data-lucide="${iconName}"></i><div>${message}</div>`;
    this.toastContainer.appendChild(toast);
    this.refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  generateEmptyData(rows = 20, cols = 8) {
    const data = [];
    for (let r = 0; r < rows; r++) {
      data.push(new Array(cols).fill(''));
    }
    return data;
  }

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  createNewTab(filename, data, options = {}) {
    const tabId = 'tab_' + (this.tabCounter++);
    const delimiter = options.delimiter || ';';
    const encoding = options.encoding || 'utf-8';
    const hasHeader = options.hasHeader !== undefined ? options.hasHeader : false;

    const tab = {
      id: tabId,
      filename: filename || `Arkusz_${this.tabCounter}.csv`,
      data: data,
      headers: null,
      hasHeader: hasHeader,
      delimiter: delimiter,
      encoding: encoding,
      colWidths: options.colWidths || null,
      viewState: options.viewState || null,
      history: new HistoryManager(),
      saved: true
    };

    tab.history.setChangeCallback((canUndo, canRedo) => {
      if (this.activeTabId === tab.id) {
        document.getElementById('undoBtn').disabled = !canUndo;
        document.getElementById('redoBtn').disabled = !canRedo;
      }
    });

    this.tabs.push(tab);
    this.renderTabs();
    this.switchTab(tabId);
    this.saveNow();
    return tab;
  }

  switchTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const currentTab = this.getActiveTab();
    if (currentTab && currentTab.id !== tabId) this.captureActiveTabState();

    this.activeTabId = tabId;
    this.renderTabs();

    this.emptyState.classList.add('hidden');
    this.gridContainer.style.display = 'flex';

    this.quickDelimiterSelect.value = tab.delimiter;
    this.quickEncodingSelect.value = tab.encoding;

    document.getElementById('undoBtn').disabled = !tab.history.canUndo();
    document.getElementById('redoBtn').disabled = !tab.history.canRedo();

    this.grid.setData(tab.data, tab.headers, true, tab.colWidths);
    tab.colWidths = [...this.grid.colWidths];
    if (tab.viewState) {
      this.grid.restoreViewState(tab.viewState);
    } else {
      this.grid.isFilterMode = false;
    }
    document.getElementById('wrapTextBtn')?.classList.toggle('active', this.grid.wrapText);
    document.getElementById('filterToggleBtn')?.classList.toggle('active', this.grid.isFilterMode);
    document.getElementById('headerToggleBtn')?.classList.toggle('active', !!tab.hasHeader);
    this.updateFreezeBtnUI();
    this.updateEmptyColsBtnUI();
    this.updateStatusBar();
    this.refreshIcons();
    this.saveNow();
  }

  updateEmptyColsBtnUI() {
    const btn = document.getElementById('toggleEmptyColsBtn');
    const label = document.getElementById('emptyColsBtnLabel');
    if (!btn || !label || !this.grid) return;

    const hiddenCount = this.grid.hiddenCols.size;
    btn.classList.toggle('active', hiddenCount > 0);
    if (hiddenCount > 0) {
      label.textContent = `Ukryte (${hiddenCount})`;
      btn.title = `Kliknij, aby odkryć wszystkie ${hiddenCount} ukrytych kolumn`;
    } else {
      label.textContent = 'Ukryj puste';
      btn.title = 'Ukryj całkowicie puste kolumny (np. nieużywane atrybuty)';
    }
  }

  openColumnFilterPopup(colIndex, anchorEl) {
    const tab = this.getActiveTab();
    if (!tab || !this.grid) return;

    const popup = document.getElementById('filterPopup');
    const title = document.getElementById('filterPopupTitle');
    const searchInput = document.getElementById('filterSearchInput');
    const selectAllCheckbox = document.getElementById('filterSelectAllCheckbox');
    const countLabel = document.getElementById('filterPopupCount');
    const listContainer = document.getElementById('filterValuesList');
    const applyBtn = document.getElementById('applyColFilterBtn');
    const clearBtn = document.getElementById('clearColFilterBtn');
    const closeBtn = document.getElementById('closeFilterPopupBtn');

    if (!popup || !listContainer) return;

    const letter = CSVParser.columnIndexToLetter(colIndex);
    const colName = (tab.headers && tab.headers[colIndex]) || letter;
    title.textContent = `Filtr: ${letter} (${colName})`;

    const uniqueValues = CSVOperations.getUniqueColumnValues(tab.data, colIndex, false);
    const currentActiveFilter = this.grid.colFilters.get(colIndex);

    let selectedValues = currentActiveFilter ? new Set(currentActiveFilter) : new Set(uniqueValues.map(v => v.value));

    const renderList = (filterText = '') => {
      const q = filterText.toLowerCase();
      const filtered = uniqueValues.filter(item => {
        const text = item.value === '' ? '(Puste)' : item.value;
        return text.toLowerCase().includes(q);
      });

      countLabel.textContent = `${filtered.length} pozycji`;

      listContainer.innerHTML = filtered.map(item => {
        const isChecked = selectedValues.has(item.value);
        const displayVal = item.value === '' ? '<i>(Puste)</i>' : this.grid.escapeHTML(item.value);
        return `
          <label class="filter-value-item">
            <input type="checkbox" data-val="${this.grid.escapeHTML(item.value)}" ${isChecked ? 'checked' : ''}>
            <span class="filter-value-text">${displayVal}</span>
            <span class="filter-value-count">(${item.count})</span>
          </label>
        `;
      }).join('');
    };

    renderList();
    searchInput.value = '';

    const onSearch = (e) => renderList(e.target.value);
    searchInput.oninput = onSearch;

    selectAllCheckbox.checked = selectedValues.size === uniqueValues.length;
    selectAllCheckbox.onchange = (e) => {
      if (e.target.checked) {
        selectedValues = new Set(uniqueValues.map(v => v.value));
      } else {
        selectedValues.clear();
      }
      renderList(searchInput.value);
    };

    listContainer.onclick = (e) => {
      const checkbox = e.target.closest('input[type="checkbox"]');
      if (checkbox) {
        const val = checkbox.dataset.val;
        if (checkbox.checked) selectedValues.add(val);
        else selectedValues.delete(val);
        selectAllCheckbox.checked = selectedValues.size === uniqueValues.length;
      }
    };

    const closePopup = () => {
      popup.classList.remove('show');
      window.removeEventListener('click', outsideClick);
    };

    const outsideClick = (e) => {
      if (!e.target.closest('#filterPopup') && !e.target.closest('.col-filter-btn')) {
        closePopup();
      }
    };

    closeBtn.onclick = closePopup;

    applyBtn.onclick = () => {
      if (selectedValues.size === uniqueValues.length) {
        this.grid.clearColumnFilter(colIndex);
        this.showToast(`Zdjęto filtr z kolumny ${letter}`, 'info');
      } else {
        const rowCount = this.grid.applyColumnFilter(colIndex, selectedValues);
        this.showToast(`Przefiltrowano kolumnę ${letter} (widocznych: ${rowCount} wierszy)`, 'info');
      }
      this.updateStatusBar();
      this.saveNow();
      closePopup();
    };

    clearBtn.onclick = () => {
      this.grid.clearColumnFilter(colIndex);
      this.updateStatusBar();
      this.saveNow();
      this.showToast(`Wyczyszczono filtr z kolumny ${letter}`, 'info');
      closePopup();
    };

    popup.classList.add('show');
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      let top = rect.bottom + 4;
      let left = rect.left - 40;

      const popupW = 280;
      if (left + popupW > window.innerWidth) left = window.innerWidth - popupW - 10;
      if (left < 10) left = 10;

      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;
    }

    setTimeout(() => {
      window.addEventListener('click', outsideClick);
      searchInput.focus();
    }, 50);
  }

  updateFreezeBtnUI() {
    const btn = document.getElementById('freezePanesBtn');
    const label = document.getElementById('freezeBtnLabel');
    if (!btn || !label || !this.grid) return;

    const isFrozen = this.grid.frozenRows > 0 || this.grid.frozenCols > 0;
    btn.classList.toggle('active', isFrozen);

    if (this.grid.frozenRows > 0 && this.grid.frozenCols > 0) {
      label.textContent = `Zablokowano (${this.grid.frozenRows}W, ${this.grid.frozenCols}K)`;
    } else if (this.grid.frozenRows > 0) {
      label.textContent = `Zablokowano (${this.grid.frozenRows}W)`;
    } else if (this.grid.frozenCols > 0) {
      label.textContent = `Zablokowano (${this.grid.frozenCols}K)`;
    } else {
      label.textContent = 'Zablokuj okienka';
    }
  }

  setFreezePanesWithHistory(newRows, newCols, toastMsg = null) {
    const tab = this.getActiveTab();
    if (!tab || !this.grid) return;

    const oldRows = this.grid.frozenRows || 0;
    const oldCols = this.grid.frozenCols || 0;

    if (oldRows === newRows && oldCols === newCols) return;

    tab.history.push({
      type: 'FREEZE_PANES',
      oldRows,
      oldCols,
      newRows,
      newCols
    });

    this.grid.setFrozenPanes(newRows, newCols);
    this.updateFreezeBtnUI();
    this.saveNow();

    if (toastMsg) {
      this.showToast(toastMsg, 'info');
    }
  }

  markTabUnsaved(tab = null) {
    const targetTab = tab || this.getActiveTab();
    if (!targetTab) return;
    if (targetTab.saved) {
      targetTab.saved = false;
      this.renderTabs();
    }
  }

  markTabSaved(tab = null) {
    const targetTab = tab || this.getActiveTab();
    if (!targetTab) return;
    targetTab.saved = true;
    this.renderTabs();
  }

  closeTab(tabId, e) {
    if (e) e.stopPropagation();
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (!tab.saved) {
      this.promptUnsavedChanges(tab, () => {
        this.performCloseTab(tabId);
      });
      return;
    }

    this.performCloseTab(tabId);
  }

  performCloseTab(tabId) {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      this.activeTabId = null;
      this.renderTabs();
      this.emptyState.classList.remove('hidden');
      this.gridContainer.style.display = 'none';
      this.clearStatusBar();
      this.saveNow();
    } else {
      const nextIndex = Math.min(index, this.tabs.length - 1);
      this.switchTab(this.tabs[nextIndex].id);
      this.saveNow();
    }
  }

  promptUnsavedChanges(tab, onDiscardCallback) {
    const modal = document.getElementById('unsavedModal');
    const textEl = document.getElementById('unsavedModalText');
    const closeBtn = document.getElementById('closeUnsavedModal');
    const cancelBtn = document.getElementById('unsavedCancelBtn');
    const discardBtn = document.getElementById('unsavedDiscardBtn');
    const saveBtn = document.getElementById('unsavedSaveBtn');

    if (!modal) {
      if (confirm(`Plik "${tab.filename}" zawiera niezapisane zmiany.\n\nCzy na pewno chcesz go zamknąć bez zapisywania?`)) {
        onDiscardCallback();
      }
      return;
    }

    textEl.innerHTML = `Plik <b>${this.grid ? this.grid.escapeHTML(tab.filename) : tab.filename}</b> zawiera niezapisane zmiany.<br><br>Czy chcesz zapisać zmiany przed zamknięciem?`;
    modal.classList.add('active');
    this.refreshIcons();

    const closeModal = () => {
      modal.classList.remove('active');
      cleanup();
      this.grid?.wrapper?.focus({ preventScroll: true });
    };

    const onSave = async () => {
      closeModal();
      if (this.activeTabId !== tab.id) {
        this.switchTab(tab.id);
      }
      await this.saveCurrentTab();
      onDiscardCallback();
    };

    const onDiscard = () => {
      closeModal();
      onDiscardCallback();
    };

    const cleanup = () => {
      saveBtn?.removeEventListener('click', onSave);
      discardBtn?.removeEventListener('click', onDiscard);
      cancelBtn?.removeEventListener('click', closeModal);
      closeBtn?.removeEventListener('click', closeModal);
    };

    saveBtn?.addEventListener('click', onSave);
    discardBtn?.addEventListener('click', onDiscard);
    cancelBtn?.addEventListener('click', closeModal);
    closeBtn?.addEventListener('click', closeModal);
  }

  renderTabs() {
    this.tabsContainer.innerHTML = '';
    for (const tab of this.tabs) {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item ${tab.id === this.activeTabId ? 'active' : ''}`;
      tabEl.innerHTML = `
        <i data-lucide="file-spreadsheet" style="width:14px; height:14px;"></i>
        <span class="tab-name" title="${tab.filename}">${tab.filename}</span>
        ${!tab.saved ? '<span class="tab-unsaved-dot" title="Niezapisane zmiany"></span>' : ''}
        <span class="tab-close-btn" title="Zamknij kartę">&times;</span>
      `;

      tabEl.addEventListener('click', () => this.switchTab(tab.id));
      tabEl.querySelector('.tab-close-btn').addEventListener('click', (e) => this.closeTab(tab.id, e));
      this.tabsContainer.appendChild(tabEl);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'tab-add-btn';
    addBtn.title = 'Nowy arkusz (Ctrl+N)';
    addBtn.innerHTML = '<i data-lucide="plus" style="width:14px; height:14px;"></i>';
    addBtn.addEventListener('click', () => this.createNewTab('Arkusz_' + this.tabCounter + '.csv', this.generateEmptyData(25, 10)));
    this.tabsContainer.appendChild(addBtn);

    this.refreshIcons();
  }

  loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;

      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        this.loadXLSXFile(buffer, file.name);
        return;
      }

      const encInfo = CSVParser.detectEncoding(buffer);
      const text = CSVParser.decodeBuffer(buffer, encInfo.encoding);
      const delimiter = CSVParser.detectDelimiter(text);

      const parsed = CSVParser.parse(text, { delimiter });
      this.createNewTab(file.name, parsed.data, {
        delimiter: delimiter,
        encoding: encInfo.encoding
      });

      this.grid.autoFitAllColumns();
      this.saveNow();
      this.showToast(`Wczytano <b>${file.name}</b> (${parsed.rowCount} wierszy, ${parsed.colCount} kolumn, separator: <code>${delimiter === '\t' ? '\\t' : delimiter}</code>)`, 'success');
    };
    reader.readAsArrayBuffer(file);
  }

  loadXLSXFile(buffer, filename) {
    if (typeof XLSX === 'undefined') {
      this.showToast('Brak biblioteki XLSX do odczytu pliku', 'error');
      return;
    }

    try {
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      this.createNewTab(filename, data, {
        delimiter: ';',
        encoding: 'utf-8'
      });
      this.grid.autoFitAllColumns();
      this.saveNow();
      this.showToast(`Wczytano arkusz <b>${filename}</b>`, 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Błąd odczytu pliku XLSX: ' + e.message, 'error');
    }
  }

  loadFileData(text, filename, filePath = null) {
    const delimiter = CSVParser.detectDelimiter(text);
    const parsed = CSVParser.parse(text, { delimiter });
    this.createNewTab(filename, parsed.data, {
      delimiter: delimiter,
      encoding: 'utf-8',
      filePath: filePath
    });
    this.grid.autoFitAllColumns();
    this.saveNow();
    this.showToast(`Wczytano <b>${filename}</b> (${parsed.rowCount} wierszy, ${parsed.colCount} kolumn)`, 'success');
  }

  loadXLSXData(buffer, filename, filePath = null) {
    if (typeof XLSX === 'undefined') {
      this.showToast('Brak biblioteki XLSX do odczytu pliku', 'error');
      return;
    }

    try {
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      this.createNewTab(filename, data, {
        delimiter: ';',
        encoding: 'utf-8',
        filePath: filePath
      });
      this.grid.autoFitAllColumns();
      this.saveNow();
      this.showToast(`Wczytano arkusz <b>${filename}</b>`, 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Błąd odczytu pliku XLSX: ' + e.message, 'error');
    }
  }

  initPWAAndElectron() {
    // 1. Electron Integration
    if (window.electronAPI && window.electronAPI.isElectron) {
      window.electronAPI.onFileOpenedFromSystem((file) => {
        if (file.isBinary) {
          const binaryString = atob(file.binaryBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.loadXLSXData(bytes.buffer, file.filename, file.filePath);
        } else {
          this.loadFileData(file.content, file.filename, file.filePath);
        }
      });
    }

    // 2. PWA Installation Button
    let deferredPrompt = null;
    const installBtn = document.getElementById('installAppBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.onclick = async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
              installBtn.classList.add('hidden');
              this.showToast('Zainstalowano aplikację CSV Studio na Twoim komputerze!', 'success');
            }
            deferredPrompt = null;
          }
        };
      }
    });

    window.addEventListener('appinstalled', () => {
      if (installBtn) installBtn.classList.add('hidden');
      this.showToast('Aplikacja CSV Studio jest zainstalowana!', 'success');
    });

    // 3. PWA File Handling API (Otwieranie plików z Eksploratora Windows w PWA)
    if ('launchQueue' in window && 'files' in window.LaunchParams.prototype) {
      window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files.length) return;
        for (const handle of launchParams.files) {
          const file = await handle.getFile();
          this.loadFileWithHandle(file, handle);
        }
      });
    }
  }

  async handleOpenFileClick() {
    // A. Jeśli uruchomiono w Electronie
    if (window.electronAPI && window.electronAPI.isElectron) {
      const files = await window.electronAPI.openFileDialog();
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.isBinary) {
            const binaryString = atob(file.binaryBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            this.loadXLSXData(bytes.buffer, file.filename, file.filePath);
          } else {
            this.loadFileData(file.content, file.filename, file.filePath);
          }
        }
      }
      return;
    }

    // B. Nowoczesne przeglądarki / PWA (File System Access API)
    if ('showOpenFilePicker' in window) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Pliki arkuszy kalkulacyjnych',
              accept: {
                'text/csv': ['.csv'],
                'text/tab-separated-values': ['.tsv', '.txt'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
              }
            }
          ]
        });

        for (const handle of handles) {
          const file = await handle.getFile();
          this.loadFileWithHandle(file, handle);
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // Użytkownik anulował wybór
      }
    }

    // C. Tradycyjny fallback input file
    this.fileInput.click();
  }

  loadFileWithHandle(file, handle = null) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;

      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        this.loadXLSXFile(buffer, file.name);
        return;
      }

      const encInfo = CSVParser.detectEncoding(buffer);
      const text = CSVParser.decodeBuffer(buffer, encInfo.encoding);
      const delimiter = CSVParser.detectDelimiter(text);

      const parsed = CSVParser.parse(text, { delimiter });
      const tab = this.createNewTab(file.name, parsed.data, {
        delimiter: delimiter,
        encoding: encInfo.encoding
      });
      if (tab && handle) {
        tab.fileHandle = handle;
      }

      this.grid.autoFitAllColumns();
      this.saveNow();
      this.showToast(`Wczytano <b>${file.name}</b> (${parsed.rowCount} wierszy, ${parsed.colCount} kolumn)`, 'success');
    };
    reader.readAsArrayBuffer(file);
  }

  async saveCurrentTab() {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (tab.filename.toLowerCase().endsWith('.xlsx') || tab.filename.toLowerCase().endsWith('.xls')) {
      this.exportActiveTabXLSX();
      return;
    }

    await this.saveCurrentTabCSV();
  }

  exportActiveTabXLSX() {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (this.grid?.isEditing) {
      this.grid.commitEdit();
    }
    const xlsxName = tab.filename.replace(/\.[^/.]+$/, "") + ".xlsx";
    CSVExporter.exportToXLSX(tab.data, xlsxName, tab.hasHeader);
    this.markTabSaved(tab);
    this.showToast(`Wyeksportowano do pliku: <b>${xlsxName}</b>`, 'success');
  }

  async saveCurrentTabCSV() {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (this.grid?.isEditing) {
      this.grid.commitEdit();
    }

    try {
      const csvContent = CSVParser.serialize(tab.data, {
        delimiter: tab.delimiter
      });

      // 1. Electron Direct Save
      if (window.electronAPI && window.electronAPI.isElectron) {
        if (tab.filePath) {
          const res = await window.electronAPI.saveFileDirect(tab.filePath, csvContent, tab.encoding);
          if (res && res.success) {
            this.markTabSaved(tab);
            this.saveNow();
            this.showToast(`Zapisano zmiany w pliku: <b>${tab.filename}</b>`, 'success');
            return;
          }
        }

        const res = await window.electronAPI.saveFileDialog(tab.filename, csvContent, tab.encoding);
        if (res && res.success) {
          tab.filePath = res.filePath;
          tab.filename = res.filename;
          this.markTabSaved(tab);
          this.saveNow();
          this.showToast(`Zapisano plik jako: <b>${tab.filename}</b>`, 'success');
        }
        return;
      }

      // 2. PWA / Browser File System Access API (Bezpośredni zapis na dysku bez pobierania)
      if (tab.fileHandle && 'createWritable' in tab.fileHandle) {
        try {
          const writable = await tab.fileHandle.createWritable();
          const bom = '\uFEFF';
          await writable.write(bom + csvContent);
          await writable.close();

          this.markTabSaved(tab);
          this.saveNow();
          this.showToast(`Zapisano bezpośrednio na dysku: <b>${tab.filename}</b>`, 'success');
          return;
        } catch (err) {
          console.warn('Błąd bezpośredniego zapisu przez File System Access:', err);
        }
      }

      // 3. Fallback: Standardowe pobranie pliku CSV z BOM
      CSVExporter.exportToCSV(tab.data, tab.filename, {
        delimiter: tab.delimiter,
        bom: true
      });
      this.markTabSaved(tab);
      this.showToast(`Pobrano plik <b>${tab.filename}</b> (z BOM dla Excela)`, 'success');
    } catch (err) {
      console.error('Błąd podczas zapisu pliku CSV:', err);
      this.showToast('Wystąpił błąd podczas zapisu pliku CSV: ' + err.message, 'danger');
    }
  }

  handleContextMenuAction(action, target) {
    const tab = this.getActiveTab();
    if (!tab) return;

    switch (action) {
      case 'autoFitCol': {
        const colSel = this.grid.getNormalizedSelection();
        if (this.grid.selectionType === 'col' && colSel.maxCol > colSel.minCol) {
          for (let c = colSel.minCol; c <= colSel.maxCol; c++) {
            this.grid.autoFitColumn(c, false);
          }
          this.grid.updateDimensions();
          this.grid.render();
          tab.colWidths = [...this.grid.colWidths];
          this.saveNow();
          this.showToast(`Dopasowano szerokość ${colSel.maxCol - colSel.minCol + 1} kolumn`, 'info');
        } else if (target && target.targetData && target.targetData.col !== undefined) {
          this.grid.autoFitColumn(target.targetData.col);
          tab.colWidths = [...this.grid.colWidths];
          this.saveNow();
          this.showToast('Dopasowano szerokość kolumny', 'info');
        }
        break;
      }

      case 'autoFitAll':
        this.grid.autoFitAllColumns();
        tab.colWidths = [...this.grid.colWidths];
        this.saveNow();
        this.showToast('Automatycznie dopasowano wszystkie kolumny', 'info');
        break;

      case 'toggleWrap':
        const isWrap = this.grid.toggleWrapText();
        document.getElementById('wrapTextBtn')?.classList.toggle('active', isWrap);
        this.saveNow();
        this.showToast(isWrap ? 'Włączono zawijanie tekstu' : 'Wyłączono zawijanie tekstu', 'info');
        break;

      case 'insertRowAbove':
        this.insertRow(true);
        break;

      case 'insertRowBelow':
        this.insertRow(false);
        break;

      case 'duplicateRow': {
        const rowSel = this.grid.getNormalizedSelection();
        if (this.grid.selectionType === 'row' && rowSel.maxRow > rowSel.minRow) {
          const rowCount = rowSel.maxRow - rowSel.minRow + 1;
          const copies = [];
          for (let r = rowSel.minRow; r <= rowSel.maxRow; r++) {
            const actualR = this.grid.rowIndices[r];
            copies.push([...tab.data[actualR]]);
          }
          const insertAt = this.grid.rowIndices[rowSel.maxRow] + 1;
          const oldData = JSON.parse(JSON.stringify(tab.data));
          tab.data.splice(insertAt, 0, ...copies);
          tab.history.push({
            type: 'FULL_TABLE_REPLACE',
            oldData,
            newData: JSON.parse(JSON.stringify(tab.data)),
            oldHeaders: tab.headers,
            newHeaders: tab.headers
          });
          this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
          this.saveNow();
          this.showToast(`Zduplikowano ${rowCount} wierszy`, 'info');
        } else if (target && target.targetData && target.targetData.row !== undefined) {
          const actualR = this.grid.rowIndices[target.targetData.row];
          const rowCopy = [...tab.data[actualR]];
          tab.data.splice(actualR + 1, 0, rowCopy);
          tab.history.push({
            type: 'INSERT_ROW',
            rowIndex: actualR + 1,
            rowData: [...rowCopy]
          });
          this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
          this.saveNow();
          this.showToast('Zduplikowano wiersz', 'info');
        }
        break;
      }

      case 'copyRow':
        this.grid.copySelection();
        this.showToast('Skopiowano wiersz do schowka', 'info');
        break;

      case 'cutRow':
        this.grid.cutSelection();
        this.saveNow();
        this.showToast('Wycięto wiersz do schowka', 'info');
        break;

      case 'clearRow':
        this.grid.clearSelection();
        this.saveNow();
        this.showToast('Wyczyszczono zawartość wiersza', 'info');
        break;

      case 'deleteRow':
        this.deleteSelectedRows();
        break;

      case 'insertColLeft':
        this.insertColumn(true);
        break;

      case 'insertColRight':
        this.insertColumn(false);
        break;

      case 'deleteCol':
        this.deleteSelectedColumns();
        break;

      case 'renameCol':
        if (target && target.targetData && target.targetData.col !== undefined) {
          const c = target.targetData.col;
          const currentName = (tab.headers && tab.headers[c]) || CSVParser.columnIndexToLetter(c);
          const newName = prompt(`Podaj nową nazwę dla kolumny ${CSVParser.columnIndexToLetter(c)}:`, currentName);
          if (newName !== null) {
            if (!tab.headers) {
              tab.headers = Array.from({ length: this.grid.getColCount() }, (_, i) => CSVParser.columnIndexToLetter(i));
            }
            const oldName = tab.headers[c];
            tab.headers[c] = newName.trim();
            tab.history.push({
              type: 'RENAME_HEADER',
              colIndex: c,
              oldName,
              newName: tab.headers[c]
            });
            this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
            this.saveNow();
            this.showToast(`Zmieniono nazwę kolumny na: <b>${tab.headers[c]}</b>`, 'info');
          }
        }
        break;

      case 'sortAsc':
        this.sortActiveColumn(true);
        break;

      case 'sortDesc':
        this.sortActiveColumn(false);
        break;

      case 'colStats':
        this.openStatsDrawer();
        break;

      case 'copy':
        this.grid.copySelection();
        this.showToast('Skopiowano do schowka', 'info');
        break;

      case 'cut':
        this.grid.cutSelection();
        this.saveNow();
        this.showToast('Wycięto do schowka', 'info');
        break;

      case 'paste':
        navigator.clipboard.readText().then(text => {
          this.grid.pasteData(text);
          this.saveNow();
          this.showToast('Wklejono dane ze schowka', 'info');
        }).catch(() => {
          this.showToast('Użyj skrótu Ctrl+V do wklejenia', 'info');
        });
        break;

      case 'clear':
        this.grid.clearSelection();
        this.saveNow();
        break;

      case 'trimCell':
        document.getElementById('cleanTrimBtn').click();
        break;

      case 'freezeRowsToHere':
        if (target && target.targetData && target.targetData.row !== undefined) {
          const rowCount = target.targetData.row + 1;
          this.setFreezePanesWithHistory(rowCount, this.grid.frozenCols, `Zablokowano wiersze 1 do ${rowCount}`);
        }
        break;

      case 'unfreezeRows':
        this.setFreezePanesWithHistory(0, this.grid.frozenCols, 'Odblokowano wiersze');
        break;

      case 'freezeColsToHere':
        if (target && target.targetData && target.targetData.col !== undefined) {
          const colCount = target.targetData.col + 1;
          const letter = CSVParser.columnIndexToLetter(target.targetData.col);
          this.setFreezePanesWithHistory(this.grid.frozenRows, colCount, `Zablokowano kolumny A do ${letter}`);
        }
        break;

      case 'unfreezeCols':
        this.setFreezePanesWithHistory(this.grid.frozenRows, 0, 'Odblokowano kolumny');
        break;

      case 'freezePanesHere':
        if (target && target.targetData) {
          const r = target.targetData.row;
          const c = target.targetData.col;
          const letter = CSVParser.columnIndexToLetter(c);
          this.setFreezePanesWithHistory(r, c, `Zablokowano okienka w miejscu kursora (${r} wierszy, kolumny A..${letter})`);
        }
        break;

      case 'unfreezePanes':
        this.setFreezePanesWithHistory(0, 0, 'Odblokowano wszystkie okienka');
        break;

      case 'openColFilter':
        if (target && target.targetData && target.targetData.col !== undefined) {
          const colHeaderEl = document.querySelector(`th.csv-th-col[data-col="${target.targetData.col}"]`);
          this.openColumnFilterPopup(target.targetData.col, colHeaderEl);
        }
        break;

      case 'hideCol': {
        const hideSel = this.grid.getNormalizedSelection();
        if (this.grid.selectionType === 'col' && hideSel.maxCol > hideSel.minCol) {
          for (let c = hideSel.minCol; c <= hideSel.maxCol; c++) {
            this.grid.hideColumn(c);
          }
          this.updateEmptyColsBtnUI();
          this.saveNow();
          this.showToast(`Ukryto ${hideSel.maxCol - hideSel.minCol + 1} kolumn`, 'info');
        } else if (target && target.targetData && target.targetData.col !== undefined) {
          this.grid.hideColumn(target.targetData.col);
          this.updateEmptyColsBtnUI();
          this.saveNow();
          this.showToast('Ukryto wybraną kolumnę', 'info');
        }
        break;
      }

      case 'hideEmptyCols': {
        const emptyCount = this.grid.hideEmptyColumns();
        this.updateEmptyColsBtnUI();
        this.saveNow();
        if (emptyCount > 0) {
          this.showToast(`Ukryto <b>${emptyCount}</b> pustych kolumn`, 'info');
        } else {
          this.showToast('Brak całkowicie pustych kolumn w tym pliku', 'info');
        }
        break;
      }

      case 'showAllCols': {
        const shownCount = this.grid.showAllColumns();
        this.updateEmptyColsBtnUI();
        this.saveNow();
        this.showToast(`Przywrócono wszystkie kolumny (odkryto <b>${shownCount}</b>)`, 'info');
        break;
      }

      case 'fillDown': {
        const norm = this.grid.getNormalizedSelection();
        this.grid.executeFillDown(norm, norm.maxRow);
        this.saveNow();
        this.showToast('Wypełniono wartości w dół', 'info');
        break;
      }

      case 'replaceInSelection':
        this.openReplaceModal('selection');
        break;

      case 'openImageUrlBuilder':
        this.openImageUrlBuilderModal(target?.targetData?.col);
        break;
    }
  }

  handleCellChange(row, col, oldValue, newValue) {
    const tab = this.getActiveTab();
    if (!tab) return;

    this.markTabUnsaved(tab);
    tab.history.push({
      type: 'CELL_CHANGE',
      row,
      col,
      oldValue,
      newValue
    });

    this.formulaInput.value = newValue;
    this.updateStatusBar();
    this.saveNow();
  }

  handleStructureChange(action) {
    const tab = this.getActiveTab();
    if (!tab) return;

    this.markTabUnsaved(tab);
    tab.history.push(action);
    tab.colWidths = [...this.grid.colWidths];
    this.updateStatusBar();
    this.saveNow();
  }

  handleSelectionChange(info) {
    if (!info || !info.activeCell) return;
    const colLetter = CSVParser.columnIndexToLetter(info.activeCell.col);
    const rowNum = info.activeCell.actualRow + 1;
    const address = `${colLetter}${rowNum}`;

    this.cellAddressBox.textContent = address;
    this.formulaInput.value = info.activeCell.value !== undefined ? info.activeCell.value : '';
    this.updateStatusBar(info);
  }

  updateStatusBar(selectionInfo = null) {
    const tab = this.getActiveTab();
    if (!tab) return;

    const rowCount = this.grid.getRowCount();
    const totalDataRows = tab.data.length;
    const colCount = this.grid.getColCount();
    const hiddenColsCount = this.grid.hiddenCols.size;

    let rowColText = `Wiersze: ${rowCount}`;
    if (rowCount < totalDataRows) {
      rowColText += ` z ${totalDataRows} (Przefiltrowano)`;
    }
    rowColText += ` | Kolumny: ${colCount}`;
    if (hiddenColsCount > 0) {
      rowColText += ` (${hiddenColsCount} ukrytych)`;
    }

    this.statusRowCol.textContent = rowColText;
    this.statusDelimiter.textContent = `Separator: [ ${tab.delimiter === '\t' ? 'TAB' : tab.delimiter} ]`;
    this.statusEncoding.textContent = tab.encoding.toUpperCase();
    this.updateEmptyColsBtnUI();

    if (selectionInfo && selectionInfo.selection) {
      const { minRow, maxRow, minCol, maxCol } = selectionInfo.selection;
      const selectedRows = maxRow - minRow + 1;
      const selectedCols = maxCol - minCol + 1;
      const selectedCount = selectedRows * selectedCols;

      if (selectedCount > 1) {
        this.statusSelection.textContent = `Zaznaczono: ${selectedCount} komórek (${selectedRows}W x ${selectedCols}K)`;
      } else {
        this.statusSelection.textContent = '';
      }
    }
  }

  clearStatusBar() {
    this.statusRowCol.textContent = '';
    this.statusSelection.textContent = '';
    this.statusStats.innerHTML = '';
    this.statusDelimiter.textContent = '';
    this.statusEncoding.textContent = '';
  }

  insertRow(above = true) {
    const tab = this.getActiveTab();
    if (!tab) return;

    this.markTabUnsaved(tab);
    const activeR = this.grid.rowIndices[this.grid.activeCell.row];
    const targetR = above ? activeR : activeR + 1;
    const newRow = new Array(this.grid.getColCount()).fill('');

    tab.data.splice(targetR, 0, newRow);
    tab.history.push({
      type: 'INSERT_ROW',
      rowIndex: targetR,
      rowData: [...newRow]
    });

    this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
    this.grid.selectCell(targetR, this.grid.activeCell.col);
    this.saveNow();
    this.showToast('Wstawiono nowy wiersz', 'info');
  }

  deleteSelectedRows() {
    const tab = this.getActiveTab();
    if (!tab || tab.data.length <= 1) return;

    this.markTabUnsaved(tab);
    const { minRow, maxRow } = this.grid.getNormalizedSelection();
    const rowsToDelete = [];

    for (let r = minRow; r <= maxRow; r++) {
      const actualR = this.grid.rowIndices[r];
      rowsToDelete.push({ rowIndex: actualR, rowData: [...tab.data[actualR]] });
    }

    rowsToDelete.sort((a, b) => b.rowIndex - a.rowIndex);
    for (const item of rowsToDelete) {
      tab.data.splice(item.rowIndex, 1);
    }

    tab.history.push({
      type: 'DELETE_ROWS',
      rows: rowsToDelete
    });

    this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
    this.grid.selectCell(Math.min(minRow, tab.data.length - 1), 0);
    this.saveNow();
    this.showToast(`Usunięto ${rowsToDelete.length} wiersz(y)`, 'info');
  }

  insertColumn(left = true) {
    const tab = this.getActiveTab();
    if (!tab) return;

    this.markTabUnsaved(tab);
    const activeC = this.grid.activeCell.col;
    const targetC = left ? activeC : activeC + 1;

    for (let r = 0; r < tab.data.length; r++) {
      tab.data[r].splice(targetC, 0, '');
    }

    tab.history.push({
      type: 'INSERT_COL',
      colIndex: targetC,
      colData: new Array(tab.data.length).fill(''),
      colName: ''
    });

    this.grid.setData(tab.data, tab.headers, false);
    tab.colWidths = [...this.grid.colWidths];
    this.grid.selectCell(this.grid.activeCell.row, targetC);
    this.saveNow();
    this.showToast('Wstawiono nową kolumnę', 'info');
  }

  deleteSelectedColumns() {
    const tab = this.getActiveTab();
    if (!tab || this.grid.getColCount() <= 1) return;

    this.markTabUnsaved(tab);
    const { minCol, maxCol } = this.grid.getNormalizedSelection();
    const colsToDelete = [];

    for (let c = minCol; c <= maxCol; c++) {
      const colData = tab.data.map(row => row[c]);
      colsToDelete.push({ colIndex: c, colData, colName: '' });
    }

    colsToDelete.sort((a, b) => b.colIndex - a.colIndex);
    for (const item of colsToDelete) {
      for (let r = 0; r < tab.data.length; r++) {
        tab.data[r].splice(item.colIndex, 1);
      }
    }

    tab.history.push({
      type: 'DELETE_COLS',
      cols: colsToDelete
    });

    this.grid.setData(tab.data, tab.headers, false);
    tab.colWidths = [...this.grid.colWidths];
    this.grid.selectCell(0, Math.min(minCol, this.grid.getColCount() - 1));
    this.saveNow();
    this.showToast(`Usunięto ${colsToDelete.length} kolumn(y)`, 'info');
  }

  toggleFirstRowAsHeader() {
    const tab = this.getActiveTab();
    if (!tab || tab.data.length < 2) return;

    this.markTabUnsaved(tab);
    if (!tab.hasHeader) {
      tab.headers = [...tab.data[0]];
      const oldData = JSON.parse(JSON.stringify(tab.data));
      tab.data.splice(0, 1);
      tab.hasHeader = true;

      tab.history.push({
        type: 'FULL_TABLE_REPLACE',
        oldData: oldData,
        newData: JSON.parse(JSON.stringify(tab.data)),
        oldHeaders: null,
        newHeaders: [...tab.headers]
      });

      this.showToast('Wiersz 1 został ustawiony jako nagłówek tabeli', 'info');
    } else {
      const oldData = JSON.parse(JSON.stringify(tab.data));
      tab.data.unshift([...tab.headers]);
      tab.headers = null;
      tab.hasHeader = false;

      tab.history.push({
        type: 'FULL_TABLE_REPLACE',
        oldData: oldData,
        newData: JSON.parse(JSON.stringify(tab.data)),
        oldHeaders: tab.headers ? [...tab.headers] : null,
        newHeaders: null
      });

      this.showToast('Nagłówki przywrócone jako zwykły wiersz danych', 'info');
    }

    this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
    document.getElementById('headerToggleBtn')?.classList.toggle('active', !!tab.hasHeader);
    this.saveNow();
  }

  sortActiveColumn(ascending = true) {
    const tab = this.getActiveTab();
    if (!tab) return;

    this.markTabUnsaved(tab);
    const colIndex = this.grid.activeCell.col;
    const oldData = JSON.parse(JSON.stringify(tab.data));

    tab.data = CSVOperations.sort(tab.data, colIndex, ascending, false);

    tab.history.push({
      type: 'FULL_TABLE_REPLACE',
      oldData,
      newData: JSON.parse(JSON.stringify(tab.data)),
      oldHeaders: tab.headers,
      newHeaders: tab.headers
    });

    this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
    const colName = (tab.headers && tab.headers[colIndex]) || CSVParser.columnIndexToLetter(colIndex);
    this.saveNow();
    this.showToast(`Posortowano kolumnę <b>${colName}</b> (${ascending ? 'A-Z' : 'Z-A'})`, 'info');
  }

  performSearch(query, options = {}) {
    const tab = this.getActiveTab();
    if (!tab || query === undefined || query === null || query === '') {
      this.grid.searchMatches = [];
      this.grid.currentSearchIndex = -1;
      this.grid.render();
      document.getElementById('searchCount').textContent = '0 / 0';
      return;
    }

    const mergedOptions = { ...this.searchOptions, ...options };
    const matches = CSVOperations.search(tab.data, query, mergedOptions);
    this.grid.searchMatches = matches;
    this.grid.currentSearchIndex = matches.length > 0 ? 0 : -1;
    this.grid.render();

    const countText = matches.length > 0 ? `1 / ${matches.length}` : '0 / 0';
    document.getElementById('searchCount').textContent = countText;

    if (matches.length > 0) {
      const first = matches[0];
      this.grid.selectCell(first.row, first.col, false);
      this.grid.ensureCellVisible(first.row, first.col);
    }
  }

  nextSearchMatch() {
    if (this.grid.searchMatches.length === 0) return;
    this.grid.currentSearchIndex = (this.grid.currentSearchIndex + 1) % this.grid.searchMatches.length;
    const match = this.grid.searchMatches[this.grid.currentSearchIndex];
    this.grid.selectCell(match.row, match.col, false);
    this.grid.ensureCellVisible(match.row, match.col);
    document.getElementById('searchCount').textContent = `${this.grid.currentSearchIndex + 1} / ${this.grid.searchMatches.length}`;
    this.grid.render();
  }

  prevSearchMatch() {
    if (this.grid.searchMatches.length === 0) return;
    this.grid.currentSearchIndex = (this.grid.currentSearchIndex - 1 + this.grid.searchMatches.length) % this.grid.searchMatches.length;
    const match = this.grid.searchMatches[this.grid.currentSearchIndex];
    this.grid.selectCell(match.row, match.col, false);
    this.grid.ensureCellVisible(match.row, match.col);
    document.getElementById('searchCount').textContent = `${this.grid.currentSearchIndex + 1} / ${this.grid.searchMatches.length}`;
    this.grid.render();
  }

  openStatsDrawer() {
    const tab = this.getActiveTab();
    if (!tab) return;

    const col = this.grid.activeCell.col;
    const colName = (tab.headers && tab.headers[col]) || `Kolumna ${CSVParser.columnIndexToLetter(col)}`;
    const values = tab.data.map(row => row[col]);
    const stats = CSVStats.calculate(values);

    document.getElementById('statColTitle').textContent = colName;
    document.getElementById('statTotalRows').textContent = stats.totalCount;
    document.getElementById('statFilledRows').textContent = stats.filledCount;
    document.getElementById('statEmptyRows').textContent = stats.emptyCount;
    document.getElementById('statUniqueValues').textContent = stats.uniqueCount;

    const numCard = document.getElementById('statNumericCard');
    if (stats.isNumeric) {
      numCard.style.display = 'block';
      document.getElementById('statSum').textContent = CSVStats.formatNumber(stats.sum);
      document.getElementById('statAvg').textContent = CSVStats.formatNumber(stats.avg);
      document.getElementById('statMin').textContent = CSVStats.formatNumber(stats.min);
      document.getElementById('statMax').textContent = CSVStats.formatNumber(stats.max);
    } else {
      numCard.style.display = 'none';
    }

    const topContainer = document.getElementById('statTopValues');
    topContainer.innerHTML = '';
    for (const item of stats.topValues) {
      const div = document.createElement('div');
      div.className = 'shortcut-row';
      div.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;" title="${item.value}">${item.value || '(puste)'}</span>
        <span class="status-badge">${item.count} (${item.percent}%)</span>
      `;
      topContainer.appendChild(div);
    }

    this.statsDrawer.classList.add('open');
    this.refreshIcons();
  }

  closeStatsDrawer() {
    this.statsDrawer.classList.remove('open');
  }

  closeAllDropdowns(except = null) {
    // 1. Zamknij wszystkie otwarte menu górne (.menu-item)
    document.querySelectorAll('.menubar .menu-item.open').forEach(m => {
      if (!except || (!m.contains(except) && m !== except)) {
        m.classList.remove('open');
      }
    });

    // 2. Zamknij menu zapisu (PPM pod Zapisz)
    const saveMenu = document.getElementById('saveContextMenu');
    if (saveMenu && saveMenu.classList.contains('show')) {
      if (!except || (!saveMenu.contains(except) && !except.closest?.('#exportCsvBtn') && except !== saveMenu)) {
        saveMenu.classList.remove('show');
      }
    }

    // 3. Zamknij menu blokowania okienek jeśli istnieje
    const freezeMenu = document.getElementById('freezeDropdownMenu');
    if (freezeMenu && freezeMenu.classList.contains('show')) {
      if (!except || !freezeMenu.contains(except)) {
        freezeMenu.classList.remove('show');
      }
    }
  }

  bindEvents() {
    this.initPWAAndElectron();

    // Całkowita blokada domyślnego menu kontekstowego przeglądarki
    window.addEventListener('contextmenu', (e) => {
      if (!e.target.matches('input, textarea')) {
        e.preventDefault();
      }
    });

    // Globalne przechwytywanie zdarzeń schowka (Copy, Paste, Cut)
    window.addEventListener('copy', (e) => {
      if (e.target.matches('input, textarea') && !e.target.classList.contains('cell-editor')) {
        return;
      }
      const tab = this.getActiveTab();
      if (!tab || !this.grid || this.grid.isEditing) return;

      const text = this.grid.getSelectionText();
      if (text && e.clipboardData) {
        e.clipboardData.setData('text/plain', text);
        e.preventDefault();
        this.grid.copiedRange = { ...this.grid.getNormalizedSelection(), type: this.grid.selectionType };
        this.grid.copiedType = 'copy';
        this.grid.updateCopiedIndicator();
        this.showToast('Skopiowano do schowka', 'info');
      }
    });

    window.addEventListener('cut', (e) => {
      if (e.target.matches('input, textarea') && !e.target.classList.contains('cell-editor')) {
        return;
      }
      const tab = this.getActiveTab();
      if (!tab || !this.grid || this.grid.isEditing) return;

      const text = this.grid.getSelectionText();
      if (text && e.clipboardData) {
        e.clipboardData.setData('text/plain', text);
        e.preventDefault();
        this.grid.copiedRange = { ...this.grid.getNormalizedSelection(), type: this.grid.selectionType };
        this.grid.copiedType = 'cut';
        this.grid.updateCopiedIndicator();
        this.grid.clearSelection();
        this.saveNow();
        this.showToast('Wycięto do schowka', 'info');
      }
    });

    window.addEventListener('paste', (e) => {
      if (e.target.matches('input, textarea') && !e.target.classList.contains('cell-editor')) {
        return;
      }
      const tab = this.getActiveTab();
      if (!tab || !this.grid || this.grid.isEditing) return;

      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if (text) {
        e.preventDefault();
        this.grid.pasteData(text);
        this.saveNow();
        this.showToast('Wklejono dane ze schowka', 'info');
      }
    });

    // Zamykanie modali po kliknięciu w tło (overlay)
    window.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        this.grid?.wrapper?.focus({ preventScroll: true });
      }
    });

    document.getElementById('themeToggleBtn').addEventListener('click', () => this.toggleTheme());

    document.getElementById('openFileBtn').addEventListener('click', () => this.handleOpenFileClick());
    document.getElementById('openFileMenuBtn').addEventListener('click', () => this.handleOpenFileClick());
    document.getElementById('dropzoneOpenBtn').addEventListener('click', () => this.handleOpenFileClick());
    document.getElementById('dropzoneNewBtn').addEventListener('click', () => this.createNewTab('Arkusz1.csv', this.generateEmptyData(25, 10)));

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        for (const file of e.target.files) {
          this.loadFile(file);
        }
      }
      this.fileInput.value = '';
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.getElementById('dropzoneBox')?.classList.add('drag-over');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      document.getElementById('dropzoneBox')?.classList.remove('drag-over');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.getElementById('dropzoneBox')?.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        for (const file of e.dataTransfer.files) {
          this.loadFile(file);
        }
      }
    });

    this.formulaInput.addEventListener('input', (e) => {
      const tab = this.getActiveTab();
      if (!tab) return;
      const actualR = this.grid.rowIndices[this.grid.activeCell.row];
      const col = this.grid.activeCell.col;
      tab.data[actualR][col] = e.target.value;
      this.grid.render();
      this.saveNow();
    });

    this.formulaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.grid.wrapper.focus();
      }
    });

    this.quickDelimiterSelect.addEventListener('change', (e) => {
      const tab = this.getActiveTab();
      if (!tab) return;
      tab.delimiter = e.target.value;
      this.updateStatusBar();
      this.saveNow();
      this.showToast(`Separator zmieniony na <code>${tab.delimiter === '\t' ? '\\t' : tab.delimiter}</code>`, 'info');
    });

    this.quickEncodingSelect.addEventListener('change', (e) => {
      const tab = this.getActiveTab();
      if (!tab) return;
      tab.encoding = e.target.value;
      this.updateStatusBar();
      this.saveNow();
      this.showToast(`Kodowanie zmienione na <b>${tab.encoding.toUpperCase()}</b>`, 'info');
    });

    document.getElementById('newTabBtn').addEventListener('click', () => this.createNewTab('Arkusz_' + this.tabCounter + '.csv', this.generateEmptyData(25, 10)));
    
    document.getElementById('undoBtn').addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (tab) {
        tab.history.undo(this.getDatasetProxy(tab));
        this.grid.render();
        this.updateStatusBar();
        this.saveNow();
      }
    });

    document.getElementById('redoBtn').addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (tab) {
        tab.history.redo(this.getDatasetProxy(tab));
        this.grid.render();
        this.updateStatusBar();
        this.saveNow();
      }
    });

    document.getElementById('autoFitAllBtn')?.addEventListener('click', () => {
      this.grid.autoFitAllColumns();
      const tab = this.getActiveTab();
      if (tab) {
        tab.colWidths = [...this.grid.colWidths];
        this.saveNow();
      }
      this.showToast('Automatycznie dopasowano szerokość wszystkich kolumn', 'info');
    });

    document.getElementById('wrapTextBtn')?.addEventListener('click', () => {
      const isWrap = this.grid.toggleWrapText();
      document.getElementById('wrapTextBtn').classList.toggle('active', isWrap);
      this.saveNow();
      this.showToast(isWrap ? 'Włączono zawijanie tekstu' : 'Wyłączono zawijanie tekstu', 'info');
    });

    const freezeBtn = document.getElementById('freezePanesBtn');
    const freezeDropdown = document.getElementById('freezeDropdownMenu');

    if (freezeBtn && freezeDropdown) {
      freezeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        freezeDropdown.classList.toggle('show');
      });

      freezeDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-action');
        if (!item) return;
        const type = item.dataset.freeze;
        freezeDropdown.classList.remove('show');

        switch (type) {
          case 'top-row-first-col':
            this.setFreezePanesWithHistory(1, 1, 'Zablokowano 1. wiersz i 1. kolumnę');
            break;
          case 'top-row':
            this.setFreezePanesWithHistory(1, 0, 'Zablokowano górny wiersz (wiersz 1)');
            break;
          case 'first-col':
            this.setFreezePanesWithHistory(0, 1, 'Zablokowano pierwszą kolumnę (kolumna A)');
            break;
          case 'to-active':
            this.setFreezePanesWithHistory(this.grid.activeCell.row, this.grid.activeCell.col, `Zablokowano do aktywnej komórki (${this.grid.activeCell.row} wierszy, ${this.grid.activeCell.col} kolumn)`);
            break;
          case 'unfreeze':
            this.setFreezePanesWithHistory(0, 0, 'Odblokowano wszystkie okienka');
            break;
        }
      });

      window.addEventListener('click', (e) => {
        if (!e.target.closest('.toolbar-dropdown-wrapper')) {
          freezeDropdown.classList.remove('show');
        }
      });
    }

    document.getElementById('filterToggleBtn')?.addEventListener('click', () => {
      const isFilter = this.grid.toggleFilterMode();
      document.getElementById('filterToggleBtn').classList.toggle('active', isFilter);
      this.showToast(isFilter ? 'Włączono lejki filtrów w nagłówkach' : 'Wyłączono lejki filtrów', 'info');
      this.saveNow();
    });

    document.getElementById('toggleEmptyColsBtn')?.addEventListener('click', () => {
      if (this.grid.hiddenCols.size > 0) {
        const n = this.grid.showAllColumns();
        this.updateEmptyColsBtnUI();
        this.showToast(`Przywrócono <b>${n}</b> ukrytych kolumn`, 'info');
      } else {
        const n = this.grid.hideEmptyColumns();
        this.updateEmptyColsBtnUI();
        if (n > 0) this.showToast(`Ukryto <b>${n}</b> całkowicie pustych kolumn`, 'info');
        else this.showToast('Brak całkowicie pustych kolumn w tym arkuszu', 'info');
      }
      this.saveNow();
    });

    document.getElementById('fillDownBtn')?.addEventListener('click', () => {
      const norm = this.grid.getNormalizedSelection();
      this.grid.executeFillDown(norm, norm.maxRow);
      this.saveNow();
      this.showToast('Wypełniono komórki w dół (Ctrl+D)', 'info');
    });

    document.getElementById('headerToggleBtn')?.addEventListener('click', () => this.toggleFirstRowAsHeader());

    document.getElementById('sortAscBtn')?.addEventListener('click', () => this.sortActiveColumn(true));
    document.getElementById('sortDescBtn')?.addEventListener('click', () => this.sortActiveColumn(false));

    document.getElementById('statsBtn')?.addEventListener('click', () => this.openStatsDrawer());
    document.getElementById('closeStatsBtn')?.addEventListener('click', () => this.closeStatsDrawer());

    // Obsługa menu górnego (Plik, Edycja, Narzędzia, Pomoc)
    const menuItems = document.querySelectorAll('.menubar .menu-item');
    const isAnyMenuOpen = () => Array.from(menuItems).some(m => m.classList.contains('open'));

    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown-action')) {
          this.closeAllDropdowns();
          return;
        }
        e.stopPropagation();
        const wasOpen = item.classList.contains('open');
        this.closeAllDropdowns();
        if (!wasOpen) {
          item.classList.add('open');
        }
      });

      item.addEventListener('mouseenter', () => {
        if (isAnyMenuOpen()) {
          this.closeAllDropdowns(item);
          item.classList.add('open');
        }
      });
    });

    // Obsługa przycisku Zapisz (LPM standardowy zapis, PPM menu eksportu)
    const saveBtn = document.getElementById('exportCsvBtn');
    const saveMenu = document.getElementById('saveContextMenu');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        this.closeAllDropdowns();
        this.saveCurrentTab();
      });

      saveBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wasShow = saveMenu?.classList.contains('show');
        this.closeAllDropdowns();
        if (!wasShow && saveMenu) {
          saveMenu.classList.add('show');
        }
      });
    }

    document.getElementById('saveMenuXlsxAction')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns();
      this.exportActiveTabXLSX();
    });

    document.getElementById('menuExportXlsxBtn')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.exportActiveTabXLSX();
    });

    document.getElementById('menuCloseTabBtn')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.activeTabId) {
        this.closeTab(this.activeTabId);
      }
    });

    // Uniwersalne zamykanie wszystkich menu i popupów przy kliknięciu gdziekolwiek poza nimi
    const onGlobalDismiss = (e) => {
      this.closeAllDropdowns(e.target);
    };

    document.addEventListener('pointerdown', onGlobalDismiss, true);
    document.addEventListener('mousedown', onGlobalDismiss, true);
    window.addEventListener('blur', () => this.closeAllDropdowns());
    window.addEventListener('resize', () => this.closeAllDropdowns());

    const searchBanner = document.getElementById('searchBanner');
    const searchInput = document.getElementById('searchInput');
    const optExactBtn = document.getElementById('searchOptExact');
    const optCaseBtn = document.getElementById('searchOptCase');
    const optRegexBtn = document.getElementById('searchOptRegex');
    
    document.getElementById('searchBtn')?.addEventListener('click', () => {
      searchBanner.classList.toggle('hidden');
      if (!searchBanner.classList.contains('hidden')) {
        searchInput.focus();
        searchInput.select();
      }
    });

    optExactBtn?.addEventListener('click', () => {
      this.searchOptions.exactCell = !this.searchOptions.exactCell;
      optExactBtn.classList.toggle('active', this.searchOptions.exactCell);
      this.performSearch(searchInput.value);
    });

    optCaseBtn?.addEventListener('click', () => {
      this.searchOptions.caseSensitive = !this.searchOptions.caseSensitive;
      optCaseBtn.classList.toggle('active', this.searchOptions.caseSensitive);
      this.performSearch(searchInput.value);
    });

    optRegexBtn?.addEventListener('click', () => {
      this.searchOptions.isRegex = !this.searchOptions.isRegex;
      optRegexBtn.classList.toggle('active', this.searchOptions.isRegex);
      this.performSearch(searchInput.value);
    });

    searchInput?.addEventListener('input', (e) => this.performSearch(e.target.value));
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) this.prevSearchMatch();
        else this.nextSearchMatch();
      } else if (e.key === 'Escape') {
        searchBanner.classList.add('hidden');
        this.performSearch('');
        this.grid?.wrapper?.focus();
      }
    });

    document.getElementById('searchNextBtn')?.addEventListener('click', () => this.nextSearchMatch());
    document.getElementById('searchPrevBtn')?.addEventListener('click', () => this.prevSearchMatch());
    document.getElementById('searchCloseBtn')?.addEventListener('click', () => {
      searchBanner.classList.add('hidden');
      this.performSearch('');
    });

    // Zamykanie/odświeżanie - zatwierdź komórkę w edycji i ostrzeż jeśli są niezapisane zmiany
    const persistBeforeLeaving = (e) => {
      if (this.grid?.isEditing) this.grid.commitEdit();
      this.saveNow(true);

      const hasUnsaved = this.tabs.some(t => !t.saved);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = 'Plik zawiera niezapisane zmiany. Czy na pewno chcesz opuścić stronę?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', persistBeforeLeaving);
    window.addEventListener('pagehide', (e) => {
      if (this.grid?.isEditing) this.grid.commitEdit();
      this.saveNow(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (this.grid?.isEditing) this.grid.commitEdit();
        this.saveNow(true);
      }
    });
  }

  getDatasetProxy(tab) {
    return {
      setCellValue: (r, c, val) => {
        if (tab.data[r]) tab.data[r][c] = val;
      },
      insertRowInternal: (rowIndex, rowData) => {
        tab.data.splice(rowIndex, 0, [...rowData]);
        this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
      },
      removeRowInternal: (rowIndex) => {
        tab.data.splice(rowIndex, 1);
        this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
      },
      insertColInternal: (colIndex, colData) => {
        for (let r = 0; r < tab.data.length; r++) {
          tab.data[r].splice(colIndex, 0, colData[r] || '');
        }
        this.grid.setData(tab.data, tab.headers, false);
        tab.colWidths = [...this.grid.colWidths];
      },
      removeColInternal: (colIndex) => {
        for (let r = 0; r < tab.data.length; r++) {
          tab.data[r].splice(colIndex, 1);
        }
        this.grid.setData(tab.data, tab.headers, false);
        tab.colWidths = [...this.grid.colWidths];
      },
      setFullData: (data, headers) => {
        tab.data = data;
        tab.headers = headers;
        tab.hasHeader = !!headers;
        this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
      },
      setFrozenPanesInternal: (rows, cols) => {
        this.grid.setFrozenPanes(rows, cols);
        this.updateFreezeBtnUI();
        this.saveNow();
      }
    };
  }

  openReplaceModal(forceScope = null) {
    const replaceModal = document.getElementById('replaceModal');
    const replaceFindInput = document.getElementById('replaceFindInput');
    const replaceWithInput = document.getElementById('replaceWithInput');
    const replaceScopeAll = document.getElementById('replaceScopeAll');
    const replaceScopeSelection = document.getElementById('replaceScopeSelection');
    const replaceSelectionBadge = document.getElementById('replaceSelectionBadge');

    if (!replaceModal) return;
    replaceModal.classList.add('active');

    const searchVal = document.getElementById('searchInput')?.value || '';
    const cellVal = this.grid ? this.grid.getActiveCellValue() : '';
    if (!replaceFindInput.value && (searchVal || cellVal)) {
      replaceFindInput.value = searchVal || cellVal;
    }

    let hasMultiSelection = false;
    if (this.grid) {
      const summary = this.grid.getSelectionSummary();
      if (replaceSelectionBadge) {
        replaceSelectionBadge.textContent = summary.fullLabel;
      }
      hasMultiSelection = summary.cellCount > 1 || this.grid.selectionType === 'row' || this.grid.selectionType === 'col';
    }

    if (forceScope === 'selection') {
      if (replaceScopeSelection) replaceScopeSelection.checked = true;
    } else if (forceScope === 'all') {
      if (replaceScopeAll) replaceScopeAll.checked = true;
    } else {
      if (hasMultiSelection && replaceScopeSelection) {
        replaceScopeSelection.checked = true;
      } else if (replaceScopeAll) {
        replaceScopeAll.checked = true;
      }
    }

    this.updateReplaceBtnLabel();

    setTimeout(() => {
      replaceFindInput.focus();
      replaceFindInput.select();
    }, 50);
  }

  updateReplaceBtnLabel() {
    const doReplaceBtnText = document.getElementById('doReplaceBtnText');
    const replaceScopeSelection = document.getElementById('replaceScopeSelection');
    if (!doReplaceBtnText) return;

    if (replaceScopeSelection && replaceScopeSelection.checked) {
      doReplaceBtnText.textContent = 'Zamień w zaznaczeniu';
    } else {
      doReplaceBtnText.textContent = 'Zamień wszystko (cały arkusz)';
    }
  }

  openImageUrlBuilderModal(targetColIndex = null, initialTab = 'bulk') {
    const tab = this.getActiveTab();
    if (!tab) return;

    const modal = document.getElementById('imageUrlBuilderModal');
    if (!modal) return;

    const bulkBaseTitle = document.getElementById('bulkBaseTitle');
    const bulkBaseSku = document.getElementById('bulkBaseSku');
    const bulkColorsInput = document.getElementById('bulkColorsInput');
    const colSelect = document.getElementById('imgUrlSourceCol');
    const templateInput = document.getElementById('imgUrlTemplate');
    const startIdxInput = document.getElementById('imgUrlStartIdx');
    const endIdxInput = document.getElementById('imgUrlEndIdx');
    const namingSelect = document.getElementById('imgUrlNamingSelect');
    const customPatternWrapper = document.getElementById('customHeaderPatternWrapper');
    const customPatternInput = document.getElementById('imgUrlCustomHeaderPattern');

    // Wypełnij listę dostępnych kolumn dla zakładki istniejących wierszy
    if (colSelect) {
      colSelect.innerHTML = '';
      const colCount = this.grid ? this.grid.getColCount() : (tab.headers ? tab.headers.length : 0);
      let defaultSelected = targetColIndex !== null ? targetColIndex : 0;
      let foundSkuCol = false;

      for (let c = 0; c < colCount; c++) {
        const letter = CSVParser.columnIndexToLetter(c);
        const headerName = (tab.headers && tab.headers[c]) ? tab.headers[c] : letter;
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = `${letter}: ${headerName}`;
        colSelect.appendChild(opt);

        if (targetColIndex === null && !foundSkuCol) {
          const normH = headerName.toLowerCase();
          if (normH.includes('symbol') || normH.includes('sku') || normH.includes('kod') || normH.includes('id') || normH.includes('model')) {
            defaultSelected = c;
            foundSkuCol = true;
          }
        }
      }

      if (targetColIndex !== null) {
        colSelect.value = targetColIndex;
      } else if (foundSkuCol) {
        colSelect.value = defaultSelected;
      } else if (this.grid && this.grid.activeCell && this.grid.activeCell.col !== undefined) {
        colSelect.value = this.grid.activeCell.col;
      }
    }

    // Wczytaj zapamiętane wartości
    const savedTitle = localStorage.getItem('csv_studio_bulk_title');
    if (savedTitle && bulkBaseTitle) bulkBaseTitle.value = savedTitle;

    const savedSku = localStorage.getItem('csv_studio_bulk_sku');
    if (savedSku && bulkBaseSku) bulkBaseSku.value = savedSku;

    const savedColors = localStorage.getItem('csv_studio_bulk_colors');
    if (savedColors && bulkColorsInput) bulkColorsInput.value = savedColors;

    const savedTemplate = localStorage.getItem('csv_studio_img_url_tpl');
    if (savedTemplate && templateInput) {
      templateInput.value = savedTemplate;
    } else if (templateInput && !templateInput.value) {
      templateInput.value = 'https://search.doboxa.biz/upload/adph/PET/PET-ST02/Murando/CORD/{SKU}/{SKU}-{N}.jpg';
    }

    const savedStart = localStorage.getItem('csv_studio_img_url_start');
    if (savedStart && startIdxInput) startIdxInput.value = savedStart;

    const savedEnd = localStorage.getItem('csv_studio_img_url_end');
    if (savedEnd && endIdxInput) endIdxInput.value = savedEnd;

    // Przełącz na odpowiednią zakładkę
    this.setBuilderTab(targetColIndex !== null ? 'existing' : initialTab);

    modal.classList.add('active');
    this.refreshIcons();
    this.updateImageUrlPreview();

    setTimeout(() => {
      if (targetColIndex !== null) {
        templateInput?.focus();
      } else {
        bulkBaseTitle?.focus();
        bulkBaseTitle?.select();
      }
    }, 50);
  }

  setBuilderTab(tabMode) {
    const tabBulkBtn = document.getElementById('tabBulkProducts');
    const tabExistingBtn = document.getElementById('tabExistingCols');
    const bulkSection = document.getElementById('bulkProductSection');
    const existingSection = document.getElementById('existingColSection');
    const doGenerateBtnText = document.getElementById('doGenerateBtnText');

    if (tabMode === 'bulk') {
      tabBulkBtn?.classList.add('active');
      tabExistingBtn?.classList.remove('active');
      if (bulkSection) bulkSection.style.display = 'block';
      if (existingSection) existingSection.style.display = 'none';
      if (doGenerateBtnText) doGenerateBtnText.textContent = '⚡ Generuj masowo warianty';
    } else {
      tabExistingBtn?.classList.add('active');
      tabBulkBtn?.classList.remove('active');
      if (bulkSection) bulkSection.style.display = 'none';
      if (existingSection) existingSection.style.display = 'block';
      if (doGenerateBtnText) doGenerateBtnText.textContent = '🖼️ Wypełnij linki do zdjęć';
    }

    this.updateImageUrlPreview();
  }

  updateImageUrlPreview() {
    const tab = this.getActiveTab();
    const previewBox = document.getElementById('imgUrlPreviewContainer');
    if (!previewBox) return;

    const isBulk = document.getElementById('tabBulkProducts')?.classList.contains('active');
    const templateInput = document.getElementById('imgUrlTemplate');
    const startIdxInput = document.getElementById('imgUrlStartIdx');
    const endIdxInput = document.getElementById('imgUrlEndIdx');
    const namingSelect = document.getElementById('imgUrlNamingSelect');
    const customPatternInput = document.getElementById('imgUrlCustomHeaderPattern');
    const customPatternWrapper = document.getElementById('customHeaderPatternWrapper');
    const doGenerateBtnText = document.getElementById('doGenerateBtnText');

    const template = templateInput?.value?.trim() || '';
    const startIdx = Math.max(1, parseInt(startIdxInput?.value, 10) || 1);
    const endIdx = Math.max(startIdx, parseInt(endIdxInput?.value, 10) || 9);
    const isCustomNaming = namingSelect?.value === 'custom';
    const customPattern = customPatternInput?.value || 'Zdjęcie {N}';

    if (customPatternWrapper) {
      customPatternWrapper.style.display = isCustomNaming ? 'block' : 'none';
    }

    if (isBulk) {
      // 1. Tryb masowego generatora produktów
      const baseTitle = document.getElementById('bulkBaseTitle')?.value || '';
      const baseSku = document.getElementById('bulkBaseSku')?.value || '';
      const colorsInput = document.getElementById('bulkColorsInput')?.value || '';

      const colors = CSVOperations.parseVariantColors(colorsInput);
      const photoCount = endIdx - startIdx + 1;

      if (colors.length === 0) {
        previewBox.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Wpisz co najmniej jeden kod koloru / wariantu (np. <code>C01, C02, C03</code> lub <code>C01-C10</code>)...</div>';
        if (doGenerateBtnText) doGenerateBtnText.textContent = '⚡ Generuj masowo warianty';
        return;
      }

      if (doGenerateBtnText) {
        doGenerateBtnText.textContent = `⚡ Generuj masówkę (${colors.length} wariantów × ${photoCount} zdjęć)`;
      }

      let previewHTML = `<div style="margin-bottom:8px; color:var(--text-secondary); font-size:11px; font-weight:600; display:flex; align-items:center; gap:8px;">
        <span>Warianty: <span class="scope-badge">${colors.length} produktów</span></span>
        <span>Zdjęcia: <span class="scope-badge">${photoCount} na produkt</span></span>
        <span>Razem: <span class="scope-badge" style="background:var(--accent-primary); color:white;">${colors.length * photoCount} linków URL</span></span>
      </div>`;

      const previewColors = colors.slice(0, 3);
      for (const color of previewColors) {
        let title = baseTitle.trim();
        if (title.includes('{KOLOR}') || title.includes('{COLOR}')) {
          title = title.replace(/\{KOLOR\}|\{COLOR\}/gi, color);
        } else if (title) {
          title = title.endsWith(' ') ? title + color : `${title} ${color}`;
        } else {
          title = color;
        }

        let sku = baseSku.trim();
        if (sku.includes('{KOLOR}') || sku.includes('{COLOR}') || sku.includes('{K}')) {
          sku = sku.replace(/\{KOLOR\}|\{COLOR\}|\{K\}/gi, color);
        } else if (sku) {
          sku = (sku.endsWith('-') || sku.endsWith('_')) ? sku + color : `${sku}-${color}`;
        } else {
          sku = color;
        }

        const escapedTitle = this.grid ? this.grid.escapeHTML(title) : title;
        const escapedSku = this.grid ? this.grid.escapeHTML(sku) : sku;

        previewHTML += `
          <div style="background:var(--bg-secondary); border-radius:6px; padding:6px 8px; margin-bottom:6px; border:1px solid var(--border-color);">
            <div style="font-size:11.5px; font-weight:bold; color:var(--accent-primary); margin-bottom:4px;">
              📦 ${escapedTitle} <span style="font-size:10.5px; color:var(--text-muted); font-weight:normal; margin-left:6px;">[Symbol: ${escapedSku}]</span>
            </div>
        `;

        const limitPhotos = Math.min(endIdx, startIdx + 2);
        for (let n = startIdx; n <= limitPhotos; n++) {
          let headerName = '';
          if (!isCustomNaming) {
            headerName = (n === 1) ? 'Zdjęcie główne' : `Zdjęcie dodatkowe ${n - 1}`;
          } else {
            headerName = customPattern.replace(/\{N0\}/g, String(n).padStart(2, '0')).replace(/\{N\}/g, String(n));
          }

          const nStr = String(n);
          const n0Str = String(n).padStart(2, '0');
          let url = template
            .replace(/\{SKU\}|\{VAL\}/gi, sku)
            .replace(/\{KOLOR\}|\{COLOR\}/gi, color)
            .replace(/\{N0\}/g, n0Str)
            .replace(/\{N\}/g, nStr);

          const escapedH = this.grid ? this.grid.escapeHTML(headerName) : headerName;
          const escapedUrl = this.grid ? this.grid.escapeHTML(url) : url;

          previewHTML += `
            <div class="url-preview-item" style="font-size:10.5px;">
              <span class="url-preview-label" style="min-width:110px;">${escapedH}:</span>
              <span class="url-preview-val">${escapedUrl}</span>
            </div>
          `;
        }

        if (endIdx > limitPhotos) {
          previewHTML += `<div style="color:var(--text-muted); font-size:10px; margin-top:2px;">... i jeszcze ${endIdx - limitPhotos} zdjęć</div>`;
        }

        previewHTML += `</div>`;
      }

      if (colors.length > previewColors.length) {
        previewHTML += `<div style="color:var(--text-muted); font-size:10.5px; text-align:center; margin-top:4px;">... oraz ${colors.length - previewColors.length} kolejnych wariantów</div>`;
      }

      previewBox.innerHTML = previewHTML;
      return;
    }

    // 2. Tryb wypełniania istniejącej tabeli
    if (!tab || !tab.data || tab.data.length === 0) {
      previewBox.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Brak danych w arkuszu do podglądu</div>';
      return;
    }

    const colSelect = document.getElementById('imgUrlSourceCol');
    const sourceCol = colSelect ? parseInt(colSelect.value, 10) : 0;

    if (!template) {
      previewBox.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Wpisz szablon adresu URL, aby zobaczyć podgląd linków...</div>';
      return;
    }

    const startRow = tab.hasHeader ? 1 : 0;
    let sampleRow = null;
    for (let r = startRow; r < tab.data.length; r++) {
      if (tab.data[r] && tab.data[r][sourceCol] && String(tab.data[r][sourceCol]).trim() !== '') {
        sampleRow = tab.data[r];
        break;
      }
    }

    if (!sampleRow) {
      sampleRow = tab.data[startRow] || ['P-ST02-30-30-45-C01'];
    }

    const sampleSku = String(sampleRow[sourceCol] || 'P-ST02-30-30-45-C01').trim();
    const rowTitle = (sampleRow[0] && sourceCol !== 0) ? String(sampleRow[0]).trim() : '';

    let previewHTML = `<div style="margin-bottom:6px; color:var(--text-secondary); font-size:11.5px; font-weight:600;">
      Przykładowy produkt: <span style="color:var(--accent-primary); font-family:var(--font-mono);">${this.grid ? this.grid.escapeHTML(sampleSku) : sampleSku}</span>
      ${rowTitle ? `<span style="color:var(--text-muted); font-weight:normal; margin-left:6px;">(${this.grid ? this.grid.escapeHTML(rowTitle) : rowTitle})</span>` : ''}
    </div>`;

    const limit = Math.min(endIdx, startIdx + 7);
    for (let n = startIdx; n <= limit; n++) {
      let headerName = '';
      if (!isCustomNaming) {
        headerName = (n === 1) ? 'Zdjęcie główne (URL)' : `Zdjęcie dodatkowe ${n - 1} (URL)`;
      } else {
        headerName = customPattern.replace(/\{N0\}/g, String(n).padStart(2, '0')).replace(/\{N\}/g, String(n));
      }

      const nStr = String(n);
      const n0Str = String(n).padStart(2, '0');
      let url = template
        .replace(/\{SKU\}|\{VAL\}/gi, sampleSku)
        .replace(/\{N0\}/g, n0Str)
        .replace(/\{N\}/g, nStr);

      if (typeof CSVParser !== 'undefined' && CSVParser.letterToColumnIndex) {
        url = url.replace(/\{COL:([A-Za-z]+)\}/gi, (_, letter) => {
          const cIdx = CSVParser.letterToColumnIndex(letter.toUpperCase());
          return (sampleRow[cIdx] !== undefined && sampleRow[cIdx] !== null) ? String(sampleRow[cIdx]).trim() : '';
        });
      }
      url = url.replace(/\{COL:(\d+)\}/g, (_, idxStr) => {
        const cIdx = parseInt(idxStr, 10);
        return (sampleRow[cIdx] !== undefined && sampleRow[cIdx] !== null) ? String(sampleRow[cIdx]).trim() : '';
      });

      const escapedH = this.grid ? this.grid.escapeHTML(headerName) : headerName;
      const escapedUrl = this.grid ? this.grid.escapeHTML(url) : url;

      previewHTML += `
        <div class="url-preview-item">
          <span class="url-preview-label">${escapedH}:</span>
          <span class="url-preview-val">${escapedUrl}</span>
        </div>
      `;
    }

    if (endIdx > limit) {
      previewHTML += `<div style="color:var(--text-muted); font-size:10px; margin-top:4px;">... oraz ${endIdx - limit} kolejnych zdjęć</div>`;
    }

    previewBox.innerHTML = previewHTML;
  }

  executeGenerateImageUrls() {
    const tab = this.getActiveTab();
    if (!tab) return;

    const isBulk = document.getElementById('tabBulkProducts')?.classList.contains('active');
    const templateInput = document.getElementById('imgUrlTemplate');
    const startIdxInput = document.getElementById('imgUrlStartIdx');
    const endIdxInput = document.getElementById('imgUrlEndIdx');
    const namingSelect = document.getElementById('imgUrlNamingSelect');
    const customPatternInput = document.getElementById('imgUrlCustomHeaderPattern');

    const urlTemplate = templateInput?.value?.trim() || '';
    const startIndex = Math.max(1, parseInt(startIdxInput?.value, 10) || 1);
    const endIndex = Math.max(startIndex, parseInt(endIdxInput?.value, 10) || 9);
    const namingMode = namingSelect?.value === 'custom' ? 'custom' : 'ecommerce';
    const customHeaderPattern = customPatternInput?.value?.trim() || 'Zdjęcie {N}';

    if (!urlTemplate) {
      this.showToast('Wpisz szablon adresu URL zdjęcia', 'warning');
      templateInput?.focus();
      return;
    }

    localStorage.setItem('csv_studio_img_url_tpl', urlTemplate);
    localStorage.setItem('csv_studio_img_url_start', String(startIndex));
    localStorage.setItem('csv_studio_img_url_end', String(endIndex));

    if (isBulk) {
      // 1. Tryb masowego generatora produktów
      const baseTitle = document.getElementById('bulkBaseTitle')?.value || '';
      const baseSku = document.getElementById('bulkBaseSku')?.value || '';
      const colorsInput = document.getElementById('bulkColorsInput')?.value || '';
      const insertAction = document.querySelector('input[name="bulkInsertAction"]:checked')?.value || 'append';

      const colors = CSVOperations.parseVariantColors(colorsInput);
      if (colors.length === 0) {
        this.showToast('Wpisz co najmniej jeden kod koloru / wariantu', 'warning');
        document.getElementById('bulkColorsInput')?.focus();
        return;
      }

      localStorage.setItem('csv_studio_bulk_title', baseTitle);
      localStorage.setItem('csv_studio_bulk_sku', baseSku);
      localStorage.setItem('csv_studio_bulk_colors', colorsInput);

      const bulkRes = CSVOperations.generateBulkProducts({
        baseTitle,
        baseSku,
        colorsInput,
        urlTemplate,
        startIndex,
        endIndex,
        namingMode,
        customHeaderPattern
      });

      if (bulkRes.count === 0) {
        this.showToast('Nie udało się wygenerować wariantów', 'warning');
        return;
      }

      const totalPhotos = endIndex - startIndex + 1;

      if (insertAction === 'newTab') {
        const tabTitle = (baseTitle || 'Warianty').replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 20) + '.csv';
        this.createNewTab(tabTitle, [bulkRes.headers, ...bulkRes.rows]);
        document.getElementById('imageUrlBuilderModal')?.classList.remove('active');
        this.showToast(`Utworzono nowy arkusz z <b>${bulkRes.count}</b> produktami (${totalPhotos} zdjęć każdy)!`, 'success');
        return;
      }

      const oldData = JSON.parse(JSON.stringify(tab.data));
      const oldHeaders = tab.headers ? [...tab.headers] : null;

      // Sprawdź czy bieżący arkusz jest pusty
      const isSheetEmpty = !tab.data || tab.data.length === 0 || 
        (tab.data.length <= 1 && (!tab.data[0] || tab.data[0].every(c => !c || c === ''))) ||
        (tab.data.length === 25 && tab.data.every(r => r.every(c => !c || c === '')));

      if (insertAction === 'replace' || isSheetEmpty) {
        tab.data = [bulkRes.headers, ...bulkRes.rows];
        tab.headers = [...bulkRes.headers];
        tab.hasHeader = true;
      } else {
        // Dopisz do istniejącego arkusza
        if (!tab.headers || tab.headers.length === 0) {
          tab.headers = [...bulkRes.headers];
        } else {
          // Upewnij się, że tabela ma wszystkie potrzebne kolumny
          while (tab.headers.length < bulkRes.headers.length) {
            tab.headers.push(bulkRes.headers[tab.headers.length]);
          }
        }

        // Dopasuj istniejące wiersze do liczby kolumn
        for (const r of tab.data) {
          while (r.length < tab.headers.length) r.push('');
        }

        // Dodaj nowe wiersze
        for (const newRow of bulkRes.rows) {
          const rowPadded = [...newRow];
          while (rowPadded.length < tab.headers.length) rowPadded.push('');
          tab.data.push(rowPadded);
        }
      }

      this.markTabUnsaved(tab);
      tab.history.push({
        type: 'FULL_TABLE_REPLACE',
        oldData,
        newData: JSON.parse(JSON.stringify(tab.data)),
        oldHeaders,
        newHeaders: tab.headers ? [...tab.headers] : null
      });

      this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
      this.grid.autoFitAllColumns();
      this.saveNow();

      document.getElementById('imageUrlBuilderModal')?.classList.remove('active');
      this.grid.wrapper?.focus({ preventScroll: true });
      this.showToast(`Wygenerowano <b>${bulkRes.count}</b> produktów (<b>${bulkRes.count * totalPhotos}</b> linków do zdjęć)!`, 'success');
      return;
    }

    // 2. Tryb wypełniania istniejących wierszy
    const colSelect = document.getElementById('imgUrlSourceCol');
    const scopeSelection = document.getElementById('imgUrlScopeSelection');
    const clearExtraCheckbox = document.getElementById('imgUrlClearExtra');

    const sourceColIndex = colSelect ? parseInt(colSelect.value, 10) : 0;
    const isSelectionScope = scopeSelection?.checked || false;
    const clearExtraImageCols = clearExtraCheckbox ? clearExtraCheckbox.checked : true;

    let rowIndices = null;
    if (isSelectionScope && this.grid) {
      const norm = this.grid.getNormalizedSelection();
      rowIndices = [];
      for (let r = norm.minRow; r <= norm.maxRow; r++) {
        const actualR = this.grid.rowIndices[r];
        if (actualR !== undefined) rowIndices.push(actualR);
      }
    }

    const oldData = JSON.parse(JSON.stringify(tab.data));
    const oldHeaders = tab.headers ? [...tab.headers] : null;

    const result = CSVOperations.generateImageUrls(tab.data, tab.headers, {
      sourceColIndex,
      urlTemplate,
      startIndex,
      endIndex,
      namingMode,
      customHeaderPattern,
      clearExtraImageCols,
      rowIndices,
      hasHeader: tab.hasHeader
    });

    if (result.generatedCount > 0 || (result.headers && (!oldHeaders || result.headers.length !== oldHeaders.length))) {
      tab.data = result.data;
      tab.headers = result.headers;
      this.markTabUnsaved(tab);

      tab.history.push({
        type: 'FULL_TABLE_REPLACE',
        oldData,
        newData: JSON.parse(JSON.stringify(tab.data)),
        oldHeaders,
        newHeaders: tab.headers ? [...tab.headers] : null
      });

      this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
      this.grid.autoFitAllColumns();
      this.saveNow();

      document.getElementById('imageUrlBuilderModal')?.classList.remove('active');
      this.grid.wrapper?.focus({ preventScroll: true });

      const countImages = endIndex - startIndex + 1;
      this.showToast(`Wygenerowano <b>${result.generatedCount}</b> linków do zdjęć (${countImages} na produkt, <b>${result.rowsProcessed}</b> wierszy)!`, 'success');
    } else {
      this.showToast('Nie znaleziono wierszy ze SKU lub linki były już aktualne', 'info');
      document.getElementById('imageUrlBuilderModal')?.classList.remove('active');
    }
  }

  bindModals() {
    const shortcutsModal = document.getElementById('shortcutsModal');
    document.getElementById('shortcutsBtn')?.addEventListener('click', () => {
      shortcutsModal?.classList.add('active');
    });
    document.getElementById('closeShortcutsModal')?.addEventListener('click', () => {
      shortcutsModal?.classList.remove('active');
    });

    const replaceModal = document.getElementById('replaceModal');
    const replaceFindInput = document.getElementById('replaceFindInput');
    const replaceWithInput = document.getElementById('replaceWithInput');

    document.getElementById('replaceScopeAll')?.addEventListener('change', () => this.updateReplaceBtnLabel());
    document.getElementById('replaceScopeSelection')?.addEventListener('change', () => this.updateReplaceBtnLabel());

    document.getElementById('replaceBtn')?.addEventListener('click', () => this.openReplaceModal());
    document.getElementById('closeReplaceModal')?.addEventListener('click', () => {
      replaceModal?.classList.remove('active');
    });
    document.getElementById('cancelReplaceBtn')?.addEventListener('click', () => {
      replaceModal?.classList.remove('active');
    });

    const handleReplaceEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('doReplaceAllBtn')?.click();
      } else if (e.key === 'Escape') {
        replaceModal?.classList.remove('active');
      }
    };

    replaceFindInput?.addEventListener('keydown', handleReplaceEnter);
    replaceWithInput?.addEventListener('keydown', handleReplaceEnter);

    document.getElementById('doReplaceAllBtn')?.addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (!tab) return;

      const findText = replaceFindInput.value;
      const replaceText = replaceWithInput.value;
      const caseSensitive = document.getElementById('replaceCaseSensitive').checked;
      const isRegex = document.getElementById('replaceRegex').checked;
      const exactCell = document.getElementById('replaceExactCell')?.checked || false;
      const isSelectionScope = document.getElementById('replaceScopeSelection')?.checked || false;

      if (!findText) {
        this.showToast('Wpisz frazę do wyszukania', 'warning');
        replaceFindInput.focus();
        return;
      }

      let coords = null;
      if (isSelectionScope && this.grid) {
        coords = this.grid.getSelectedCoordinates();
        if (!coords || coords.length === 0) {
          this.showToast('Brak zaznaczonych komórek do zamiany', 'warning');
          return;
        }
      }

      const result = CSVOperations.replaceAll(tab.data, findText, replaceText, {
        caseSensitive,
        isRegex,
        exactCell,
        coords
      });

      if (result.count > 0) {
        this.markTabUnsaved(tab);
        tab.history.push({
          type: 'RANGE_CHANGE',
          changes: result.changes
        });
        this.grid.render();
        this.saveNow();
        const scopeDesc = isSelectionScope ? 'w zaznaczeniu' : 'w całym arkuszu';
        this.showToast(`Zastąpiono <b>${result.count}</b> wystąpień (${scopeDesc})`, 'success');
        replaceModal.classList.remove('active');
        this.grid.wrapper?.focus({ preventScroll: true });
      } else {
        const scopeDesc = isSelectionScope ? 'w zaznaczonych komórkach' : 'w arkuszu';
        this.showToast(`Nie znaleziono pasujących komórek (${scopeDesc})`, 'info');
      }
    });

    // Image URL Builder bindings
    const imgUrlModal = document.getElementById('imageUrlBuilderModal');
    document.getElementById('imageUrlBuilderBtn')?.addEventListener('click', () => this.openImageUrlBuilderModal(null, 'bulk'));
    document.getElementById('menuImageUrlBuilderBtn')?.addEventListener('click', () => this.openImageUrlBuilderModal(null, 'bulk'));
    document.getElementById('closeImageUrlModal')?.addEventListener('click', () => {
      imgUrlModal?.classList.remove('active');
    });
    document.getElementById('cancelImageUrlBtn')?.addEventListener('click', () => {
      imgUrlModal?.classList.remove('active');
    });
    document.getElementById('doGenerateImgUrlsBtn')?.addEventListener('click', () => this.executeGenerateImageUrls());

    document.getElementById('tabBulkProducts')?.addEventListener('click', () => this.setBuilderTab('bulk'));
    document.getElementById('tabExistingCols')?.addEventListener('click', () => this.setBuilderTab('existing'));

    const updatePreviewHandler = () => this.updateImageUrlPreview();
    document.getElementById('bulkBaseTitle')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('bulkBaseSku')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('bulkColorsInput')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('imgUrlSourceCol')?.addEventListener('change', updatePreviewHandler);
    document.getElementById('imgUrlTemplate')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('imgUrlStartIdx')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('imgUrlEndIdx')?.addEventListener('input', updatePreviewHandler);
    document.getElementById('imgUrlNamingSelect')?.addEventListener('change', updatePreviewHandler);
    document.getElementById('imgUrlCustomHeaderPattern')?.addEventListener('input', updatePreviewHandler);

    document.querySelectorAll('#imageUrlBuilderModal [data-set-colors]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const colors = btn.dataset.setColors;
        const input = document.getElementById('bulkColorsInput');
        if (input && colors) {
          input.value = colors;
          this.updateImageUrlPreview();
        }
      });
    });

    document.querySelectorAll('#imageUrlBuilderModal [data-insert]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const insertText = btn.dataset.insert;
        const input = document.getElementById('imgUrlTemplate');
        if (input && insertText) {
          const start = input.selectionStart || input.value.length;
          const end = input.selectionEnd || input.value.length;
          input.value = input.value.substring(0, start) + insertText + input.value.substring(end);
          input.focus();
          input.selectionStart = input.selectionEnd = start + insertText.length;
          this.updateImageUrlPreview();
        }
      });
    });

    document.getElementById('cleanTrimBtn').addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (!tab) return;
      const coords = this.grid ? this.grid.getSelectedCoordinates() : [];
      const changes = CSVOperations.transformCells(tab.data, coords, 'trim');
      if (changes.length > 0) {
        this.markTabUnsaved(tab);
        for (const ch of changes) tab.data[ch.row][ch.col] = ch.newValue;
        tab.history.push({ type: 'RANGE_CHANGE', changes });
        this.grid.render();
        this.saveNow();
        this.showToast(`Przycięto spacje w <b>${changes.length}</b> komórkach`, 'success');
      }
    });

    document.getElementById('cleanDeduplicateBtn').addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (!tab) return;
      const oldData = JSON.parse(JSON.stringify(tab.data));
      const res = CSVOperations.deduplicate(tab.data, !tab.hasHeader);
      if (res.removedCount > 0) {
        this.markTabUnsaved(tab);
        tab.data = res.data;
        tab.history.push({
          type: 'FULL_TABLE_REPLACE',
          oldData,
          newData: JSON.parse(JSON.stringify(tab.data)),
          oldHeaders: tab.headers,
          newHeaders: tab.headers
        });
        this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
        this.saveNow();
        this.showToast(`Usunięto <b>${res.removedCount}</b> zduplikowanych wierszy`, 'success');
      } else {
        this.showToast('Brak zduplikowanych wierszy', 'info');
      }
    });

    document.getElementById('cleanEmptyRowsBtn').addEventListener('click', () => {
      const tab = this.getActiveTab();
      if (!tab) return;
      const oldData = JSON.parse(JSON.stringify(tab.data));
      const res = CSVOperations.removeEmptyRows(tab.data, !tab.hasHeader);
      if (res.removedCount > 0) {
        this.markTabUnsaved(tab);
        tab.data = res.data;
        tab.history.push({
          type: 'FULL_TABLE_REPLACE',
          oldData,
          newData: JSON.parse(JSON.stringify(tab.data)),
          oldHeaders: tab.headers,
          newHeaders: tab.headers
        });
        this.grid.setData(tab.data, tab.headers, false, tab.colWidths);
        this.saveNow();
        this.showToast(`Usunięto <b>${res.removedCount}</b> pustych wierszy`, 'success');
      } else {
        this.showToast('Brak całkowicie pustych wierszy', 'info');
      }
    });
  }

  bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const isInputFocused = e.target.matches('input, textarea') && !e.target.classList.contains('cell-editor');

      if (isCtrlOrMeta && key === 'o') {
        e.preventDefault();
        this.handleOpenFileClick();
        return;
      }

      if (isCtrlOrMeta && key === 's') {
        e.preventDefault();
        document.getElementById('exportCsvBtn').click();
        return;
      }

      if (isCtrlOrMeta && key === 'n') {
        e.preventDefault();
        this.createNewTab('Arkusz_' + this.tabCounter + '.csv', this.generateEmptyData(25, 10));
        return;
      }

      if (isCtrlOrMeta && key === 'w') {
        e.preventDefault();
        if (this.activeTabId) {
          this.closeTab(this.activeTabId);
        }
        return;
      }

      if (isCtrlOrMeta && key === 'f') {
        if (!e.target.matches('#searchInput, #replaceFindInput, #replaceWithInput')) {
          e.preventDefault();
          document.getElementById('searchBtn').click();
        }
        return;
      }

      if (isCtrlOrMeta && key === 'h') {
        if (!e.target.matches('#replaceFindInput, #replaceWithInput')) {
          e.preventDefault();
          document.getElementById('replaceBtn').click();
        }
        return;
      }

      if (isCtrlOrMeta && key === 'd') {
        if (!isInputFocused) {
          e.preventDefault();
          document.getElementById('fillDownBtn').click();
        }
        return;
      }

      if (isCtrlOrMeta && key === 'z' && !e.shiftKey) {
        if (!this.grid?.isEditing && !isInputFocused) {
          e.preventDefault();
          document.getElementById('undoBtn').click();
        }
        return;
      }

      if ((isCtrlOrMeta && key === 'y') || (isCtrlOrMeta && e.shiftKey && key === 'z')) {
        if (!this.grid?.isEditing && !isInputFocused) {
          e.preventDefault();
          document.getElementById('redoBtn').click();
        }
        return;
      }

      if (isCtrlOrMeta && key === 'a') {
        if (!this.grid?.isEditing && !isInputFocused) {
          e.preventDefault();
          if (this.grid) this.grid.selectAll();
        }
        return;
      }

      if (e.key === 'Escape') {
        // 0. Modal Niezapisane zmiany
        const unsavedModal = document.getElementById('unsavedModal');
        if (unsavedModal && unsavedModal.classList.contains('active')) {
          e.preventDefault();
          document.getElementById('unsavedCancelBtn')?.click();
          return;
        }

        // 1. Modal Znajdź i zamień (Ctrl+H)
        const replaceModal = document.getElementById('replaceModal');
        if (replaceModal && replaceModal.classList.contains('active')) {
          e.preventDefault();
          replaceModal.classList.remove('active');
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 1b. Modal Generator URL Zdjęć
        const imgUrlModal = document.getElementById('imageUrlBuilderModal');
        if (imgUrlModal && imgUrlModal.classList.contains('active')) {
          e.preventDefault();
          imgUrlModal.classList.remove('active');
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 2. Modal Skróty klawiszowe
        const shortcutsModal = document.getElementById('shortcutsModal');
        if (shortcutsModal && shortcutsModal.classList.contains('active')) {
          e.preventDefault();
          shortcutsModal.classList.remove('active');
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 3. Popup filtra kolumny
        const filterPopup = document.getElementById('filterPopup');
        if (filterPopup && filterPopup.classList.contains('show')) {
          e.preventDefault();
          filterPopup.classList.remove('show');
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 4. Panel boczny statystyk
        const statsDrawer = document.getElementById('statsDrawer');
        if (statsDrawer && statsDrawer.classList.contains('open')) {
          e.preventDefault();
          this.closeStatsDrawer();
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 5. Pasek wyszukiwania (Ctrl+F)
        const searchBanner = document.getElementById('searchBanner');
        if (searchBanner && !searchBanner.classList.contains('hidden')) {
          e.preventDefault();
          searchBanner.classList.add('hidden');
          this.performSearch('');
          this.grid?.wrapper?.focus({ preventScroll: true });
          return;
        }

        // 6. Menu dropdown blokowania okienek
        // 6. Zamknięcie wszystkich menu górnych i dropdownów
        this.closeAllDropdowns();

        // 7. Menu kontekstowe siatki
        if (this.grid?.dismissContextMenu) {
          this.grid.dismissContextMenu();
        }

        // 8. Schowek (Marching ants)
        if (this.grid) {
          this.grid.clearCopiedIndicator();
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new CSVApp();
});
