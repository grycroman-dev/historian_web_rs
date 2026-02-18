$(document).ready(function () {
  console.log('App init...');

  // Highlighting State
  window.lastMaxId = 0;
  window.isInitialLoad = true;

  // --- Configuration ---
  const CONFIG = {
    NEW_RECORD_HIGHLIGHT_DURATION: 5000, // ms - How long the green highlight stays
    REFRESH_INTERVAL: 5000 // ms
  };

  // --- 1. Theme Toggle Logic ---
  const themeToggle = document.getElementById('themeToggle');
  const body = document.body;

  function updateLogo(isDark) {
    const logo = document.getElementById('logo');
    if (logo) logo.src = isDark ? 'logo-dark.png' : 'logo-light.png';
  }

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    if (themeToggle) themeToggle.checked = true;
    updateLogo(true);
  } else {
    body.classList.remove('dark-mode');
    if (themeToggle) themeToggle.checked = false;
    updateLogo(false);
  }

  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      if (themeToggle.checked) {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        updateLogo(true);
      } else {
        body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        updateLogo(false);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    // Téma: Alt+M
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      if (themeToggle) themeToggle.click();
    }
    // Zrušit filtry: Alt+C
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      $('#btnResetAll').click();
    }
    // Přepnout zdroj dat: Alt+S
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (datasourceToggle) datasourceToggle.click();
    }
    // Přepnout panel filtrů: Alt+P
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      const header = document.getElementById('controlsHeader');
      const content = document.getElementById('controlsContent');
      if (header && content) {
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        const isCollapsed = content.classList.contains('collapsed');
        localStorage.setItem('controls_collapsed', isCollapsed);

        if (!isCollapsed) {
          setTimeout(() => {
            const firstInput = document.getElementById('savedFiltersSelect');
            if (firstInput) firstInput.focus();
          }, 50);
        }
      }
    }

    const ensurePanelExpanded = () => {
      const header = document.getElementById('controlsHeader');
      const content = document.getElementById('controlsContent');
      if (content && content.classList.contains('collapsed')) {
        if (header) header.classList.remove('collapsed');
        content.classList.remove('collapsed');
        localStorage.setItem('controls_collapsed', 'false');
      }
    };

    // Fokus na filtry: Alt+F
    if (e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      ensurePanelExpanded();
      setTimeout(() => {
        const el = document.getElementById('savedFiltersSelect');
        if (el) el.focus();
      }, 50);
    }

    // Fokus na hledání: Alt+H
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      ensurePanelExpanded();
      setTimeout(() => {
        const el = document.getElementById('globalSearch');
        if (el) el.focus();
      }, 50);
    }

    // Auto-Refresh Toggle: Alt+A
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      ensurePanelExpanded();
      setTimeout(() => {
        const el = document.getElementById('autoRefreshToggle');
        if (el) {
          el.click();
          el.focus();
        }
      }, 50);
    }

    // Column Visibility: Alt+V
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      ensurePanelExpanded();
      setTimeout(() => {
        $('#colVisDropdown').toggleClass('show');
      }, 50);
    }

    // Export: Alt+E
    if (e.altKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      ensurePanelExpanded();
      setTimeout(() => {
        const btn = $('#btnExport');
        const dropdown = $('#exportDropdown');

        if (!dropdown.hasClass('show')) {
          btn.trigger('click');
        }

        // Focus the first item
        dropdown.find('.export-item').first().focus();
      }, 50);
    }

  });

  // --- 1.5 Data Source Logic ---
  const datasourceToggle = document.getElementById('datasourceToggle');
  function updateDatasourceUI(isBackup) {
    if (datasourceToggle) datasourceToggle.checked = isBackup;

    // Header styling
    const header = document.querySelector('header');
    if (header) {
      if (isBackup) {
        header.classList.add('header-backup');
      } else {
        header.classList.remove('header-backup');
      }
    }

    // Footer Status & Icon Switch
    const dbText = $('#dbStatusText');
    const dbIconSwitch = $('#dbIconSwitch');

    if (dbText.length) {
      dbText.text(isBackup ? 'Záložní DB' : 'Hlavní DB');
      $('#dbStatus').css('color', isBackup ? '#ff4444' : '#00C851');
    }

    if (dbIconSwitch.length) {
      if (isBackup) {
        dbIconSwitch.addClass('text-danger');
      } else {
        dbIconSwitch.removeClass('text-danger');
      }
    }
  }

  // Load saved state
  const savedSource = localStorage.getItem('dataSource') || 'main'; // 'main' or 'backup'
  updateDatasourceUI(savedSource === 'backup');

  if (datasourceToggle) {
    datasourceToggle.addEventListener('change', () => {
      const isBackup = datasourceToggle.checked;
      const newSource = isBackup ? 'backup' : 'main';
      localStorage.setItem('dataSource', newSource);
      updateDatasourceUI(isBackup);

      // Reload table
      if (typeof table !== 'undefined') {
        table.ajax.reload();
      }
    });
  }

  // --- 1.6 Collapsible Controls Logic ---
  const controlsHeader = document.getElementById('controlsHeader');
  const controlsContent = document.getElementById('controlsContent');

  // Load saved state
  const isControlsCollapsed = localStorage.getItem('controls_collapsed') === 'true';
  if (isControlsCollapsed) {
    if (controlsHeader) controlsHeader.classList.add('collapsed');
    if (controlsContent) controlsContent.classList.add('collapsed');
  }

  if (controlsHeader && controlsContent) {
    controlsHeader.addEventListener('click', () => {
      controlsContent.classList.toggle('collapsed');
      controlsHeader.classList.toggle('collapsed');
      localStorage.setItem('controls_collapsed', controlsContent.classList.contains('collapsed'));
    });
  }

  // Auto-Refresh Logic
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  let autoRefreshInterval;

  function updateAutoRefreshIcon(checked) {
    const icon = document.getElementById('autoRefreshIcon');
    if (icon) {
      if (checked) icon.classList.add('text-danger');
      else icon.classList.remove('text-danger');
    }
  }

  if (autoRefreshToggle) {
    // Init state
    const savedAutoRefresh = localStorage.getItem('historian_auto_refresh') === 'true';
    if (savedAutoRefresh) {
      autoRefreshToggle.checked = true;
    }
    updateAutoRefreshIcon(autoRefreshToggle.checked);

    // Start immediately if saved as true
    if (savedAutoRefresh) {
      autoRefreshInterval = setInterval(() => {
        if (typeof table !== 'undefined') {
          table.ajax.reload(null, false);
        }
      }, CONFIG.REFRESH_INTERVAL);
    }

    autoRefreshToggle.addEventListener('change', () => {
      const isChecked = autoRefreshToggle.checked;
      localStorage.setItem('historian_auto_refresh', isChecked);
      updateAutoRefreshIcon(isChecked);

      if (isChecked) {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
          if (typeof table !== 'undefined') {
            table.ajax.reload(null, false);
          }
        }, CONFIG.REFRESH_INTERVAL);
      } else {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
    });
  }

  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelp = document.getElementById('closeHelp');

  if (helpBtn && helpModal && closeHelp) {
    helpBtn.addEventListener('click', () => {
      helpModal.style.display = 'block';
      closeHelp.focus();
    });
    closeHelp.addEventListener('click', () => {
      helpModal.style.display = 'none';
      helpBtn.focus();
    });
    window.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.style.display = 'none';
    });
    window.addEventListener('keydown', (e) => {
      // Help: Alt+F1
      if (e.altKey && e.key === 'F1') {
        e.preventDefault();
        helpModal.style.display = 'block';
        closeHelp.focus();
      }
      if (e.key === 'Escape' && helpModal.style.display === 'block') {
        helpModal.style.display = 'none';
        helpBtn.focus();
      }
    });
  }

  // --- 2. Saved Filters & Time Ranges Logic ---
  const savedFiltersSelect = $('#savedFiltersSelect');
  const STORAGE_KEY_FILTERS = 'historian_saved_filters';

  // Predefined Ranges
  const timeRanges = [
    { value: 'range_today', label: 'Dnes' },
    { value: 'range_yesterday', label: 'Včera' },
    { value: 'range_week', label: 'Posledních 7 dní' },
    { value: 'range_month', label: 'Tento měsíc' },
    { value: 'time_5m', label: 'Posledních 5 minut' },
    { value: 'time_10m', label: 'Posledních 10 minut' },
    { value: 'time_15m', label: 'Posledních 15 minut' },
    { value: 'time_30m', label: 'Posledních 30 minut' },
    { value: 'time_1h', label: 'Poslední hodina' }
  ];

  function loadFiltersDropdown() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTERS) || '[]');
    const currentVal = savedFiltersSelect.val();

    savedFiltersSelect.empty();
    savedFiltersSelect.append(new Option('-- Filtry a čas --', ''));

    // 1. Time Ranges Group
    const groupTime = $('<optgroup label="Časová období">');
    timeRanges.forEach(r => {
      groupTime.append(new Option(r.label, r.value));
    });
    savedFiltersSelect.append(groupTime);

    // 2. Saved Filters Group
    if (saved.length > 0) {
      const groupSaved = $('<optgroup label="Uložené filtry">');
      saved.forEach(filter => {
        groupSaved.append(new Option(filter.name, 'saved_' + filter.name));
      });
      savedFiltersSelect.append(groupSaved);
    }

    if (currentVal) savedFiltersSelect.val(currentVal);
  }

  loadFiltersDropdown();

  // Apply Filter Logic
  savedFiltersSelect.on('change', function () {
    const val = $(this).val();
    if (!val) return;

    // A) Time Ranges
    if (val.startsWith('range_') || val.startsWith('time_')) {
      const today = new Date();
      let from, to;

      if (val === 'range_today') {
        from = new Date(today.setHours(0, 0, 0, 0));
        to = new Date(today.setHours(23, 59, 59, 999));
      } else if (val === 'range_yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        from = new Date(yesterday.setHours(0, 0, 0, 0));
        to = new Date(yesterday.setHours(23, 59, 59, 999));
      } else if (val === 'range_week') {
        to = new Date(today.setHours(23, 59, 59, 999));
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        from = new Date(lastWeek.setHours(0, 0, 0, 0));
      } else if (val === 'range_month') {
        const year = today.getFullYear();
        const month = today.getMonth();
        from = new Date(year, month, 1);
        to = new Date(year, month + 1, 0, 23, 59, 59);
      }
      // Minutes/Hours - relative to NOW
      else {
        to = new Date();
        from = new Date(to);
        if (val === 'time_5m') from.setMinutes(from.getMinutes() - 5);
        if (val === 'time_10m') from.setMinutes(from.getMinutes() - 10);
        if (val === 'time_15m') from.setMinutes(from.getMinutes() - 15);
        if (val === 'time_30m') from.setMinutes(from.getMinutes() - 30);
        if (val === 'time_1h') from.setHours(from.getHours() - 1);
      }

      // Format Date/Time inputs
      const pad = n => String(n).padStart(2, '0');
      const setInputs = (dFrom, dTo) => {
        $('#dateFrom').val(`${dFrom.getFullYear()}-${pad(dFrom.getMonth() + 1)}-${pad(dFrom.getDate())}`);
        $('#timeFrom').val(`${pad(dFrom.getHours())}:${pad(dFrom.getMinutes())}`);

        $('#dateTo').val(`${dTo.getFullYear()}-${pad(dTo.getMonth() + 1)}-${pad(dTo.getDate())}`);
        $('#timeTo').val(`${pad(dTo.getHours())}:${pad(dTo.getMinutes())}`);
      };

      if (from && to) setInputs(from, to);
      refreshTable();
    }
    // B) Saved Filters
    else if (val.startsWith('saved_')) {
      const name = val.replace('saved_', '');
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTERS) || '[]');
      const textFilter = saved.find(f => f.name === name);

      if (textFilter) {
        const f = textFilter.filters;

        // Restore Checkboxes
        $('.multiselect-dropdown input[type="checkbox"]').prop('checked', false);
        const setCheckboxes = (listId, values) => {
          if (!values) return;
          values.forEach(v => {
            // Escape quotes in value just in case
            $(`${listId} input[value="${v}"]`).prop('checked', true);
          });
        };
        setCheckboxes('#regionList', f.region);
        setCheckboxes('#localityList', f.locality);
        setCheckboxes('#deviceList', f.device); // Added
        setCheckboxes('#frequencyList', f.frequency); // Added
        setCheckboxes('#typeList', f.type);
        setCheckboxes('#propertyList', f.property);

        // Restore Dates
        $('#dateFrom').val(f.dateFrom || '');
        $('#timeFrom').val(f.timeFrom || '');
        $('#dateTo').val(f.dateTo || '');
        $('#timeTo').val(f.timeTo || '');

        // Restore Search
        $('#globalSearch').val(f.search || '');

        // Restore Column Filters
        $('.filter-input').val('');
        if (f.colFilters) {
          Object.keys(f.colFilters).forEach(key => {
            $(`.filter-input`).eq(key).val(f.colFilters[key]);
          });
        }

        // Update Button Texts
        ['#region', '#locality', '#device', '#frequency', '#type', '#property'].forEach(id => {
          // Trigger change event to update button text
          $(`${id}List`).trigger('change', 'input[type="checkbox"]');

          // Manual update fallback
          const list = $(`${id}List`);
          const btn = $(`${id}Btn`);
          const checked = list.find('input:checked');
          const defaultText = btn.text().split(':')[0];
          if (checked.length === 0) btn.text(defaultText + ': Vše');
          else if (checked.length === 1) btn.text(defaultText + ': ' + checked.val());
          else btn.text(defaultText + ': (' + checked.length + ')');
        });

        refreshTable();
      }
    }
  });

  // Save Filter
  $('#btnSaveFilter').on('click', function () {
    const name = prompt('Zadejte název filtru:');
    if (!name) return;

    const currentFilters = {
      region: getSelectedValues('#regionList'),
      locality: getSelectedValues('#localityList'),
      device: getSelectedValues('#deviceList'), // Added
      frequency: getSelectedValues('#frequencyList'), // Added
      type: getSelectedValues('#typeList'),
      property: getSelectedValues('#propertyList'),
      dateFrom: $('#dateFrom').val(),
      timeFrom: $('#timeFrom').val(),
      dateTo: $('#dateTo').val(),
      timeTo: $('#timeTo').val(),
      search: $('#globalSearch').val(),
      colFilters: {}
    };

    $('.filter-input').each(function (i) {
      if ($(this).val()) currentFilters.colFilters[i] = $(this).val();
    });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTERS) || '[]');
    const existingIndex = saved.findIndex(f => f.name === name);
    if (existingIndex >= 0) {
      saved[existingIndex] = { name, filters: currentFilters };
    } else {
      saved.push({ name, filters: currentFilters });
    }

    localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(saved));
    loadFiltersDropdown();
    savedFiltersSelect.val('saved_' + name);
    alert('Filtr uložen.');
  });

  // Rename Filter
  $('#btnRenameFilter').on('click', function () {
    const val = savedFiltersSelect.val();
    if (!val || !val.startsWith('saved_')) {
      alert('Vyberte uložený filtr k přejmenování.');
      return;
    }
    const oldName = val.replace('saved_', '');
    const newName = prompt('Zadejte nový název:', oldName);

    if (newName && newName !== oldName) {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTERS) || '[]');
      const index = saved.findIndex(f => f.name === oldName);
      if (index >= 0) {
        saved[index].name = newName;
        localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(saved));
        loadFiltersDropdown();
        savedFiltersSelect.val('saved_' + newName);
      }
    }
  });

  // Delete Filter
  $('#btnDeleteFilter').on('click', function () {
    const val = savedFiltersSelect.val();
    if (!val || !val.startsWith('saved_')) {
      alert('Vyberte uložený filtr ke smazání.');
      return;
    }
    const name = val.replace('saved_', '');

    if (confirm(`Opravdu smazat filtr "${name}"?`)) {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTERS) || '[]');
      const newSaved = saved.filter(f => f.name !== name);
      localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(newSaved));
      loadFiltersDropdown();
    }
  });

  // --- 3. DataTables & Filters Logic ---



  // --- 3. DataTables & Filters Logic ---

  // UI Logika pro Multi-select
  function setupMultiselect(btnId, listId, defaultText, iconHtml) {
    const btn = $(btnId);
    const list = $(listId);

    // Toggle list
    btn.on('click', function (e) {
      e.stopPropagation();
      // Zavřít ostatní
      $('.multiselect-dropdown').not(list).removeClass('show');
      list.toggleClass('show');
    });

    // Změna v checkboxech
    list.on('change', 'input[type="checkbox"]', function () {
      // Update button text
      const checked = list.find('input:checked');
      if (checked.length === 0) {
        btn.html(iconHtml + ' ' + defaultText + ': Vše');
      } else if (checked.length === 1) {
        btn.html(iconHtml + ' ' + defaultText + ': ' + checked.val());
      } else {
        btn.html(iconHtml + ' ' + defaultText + ': (' + checked.length + ')');
      }
      refreshTable();
    });
  }

  setupMultiselect('#regionBtn', '#regionList', 'Region', '<i class="fas fa-globe-europe"></i>');
  setupMultiselect('#localityBtn', '#localityList', 'Lokalita', '<i class="fas fa-map-marker-alt"></i>');
  setupMultiselect('#deviceBtn', '#deviceList', 'Zařízení', '<i class="fas fa-server"></i>'); // Added
  setupMultiselect('#frequencyBtn', '#frequencyList', 'Frekvence', '<i class="fas fa-wave-square"></i>'); // Added
  setupMultiselect('#typeBtn', '#typeList', 'Typ', '<i class="fas fa-cube"></i>');
  setupMultiselect('#propertyBtn', '#propertyList', 'Vlastnost', '<i class="fas fa-tag"></i>');

  // Zavírání dropdownů při kliku mimo
  $(document).on('click', function () {
    $('.multiselect-dropdown').removeClass('show');
  });

  $('.multiselect-dropdown').on('click', function (e) {
    e.stopPropagation(); // Aby se nezavřelo při kliku dovnitř
  });

  // Helper pro získání vybraných hodnot
  function getSelectedValues(listId) {
    const selected = [];
    $(listId + ' input:checked').each(function () {
      selected.push($(this).val());
    });
    return selected;
  }

  // Inicializace DataTables
  const table = $('#recordsTable').DataTable({
    processing: true,
    serverSide: true,
    pageLength: parseInt(localStorage.getItem('historian_page_len') || '10'),
    ajax: {
      url: '/api/devicedata',
      // traditional: true, // REMOVED: Breaks DataTables nested object params
      data: function (d) {
        // DataSource
        d.dataSource = localStorage.getItem('dataSource') || 'main';

        // Multi-select filtry (posíláme pole)
        d.region = getSelectedValues('#regionList');
        d.locality = getSelectedValues('#localityList');
        d.device = getSelectedValues('#deviceList'); // Added
        d.frequency = getSelectedValues('#frequencyList'); // Added
        d.type = getSelectedValues('#typeList');
        d.property = getSelectedValues('#propertyList');

        // Datum a čas
        d.dateFrom = $('#dateFrom').val();
        d.timeFrom = $('#timeFrom').val();
        d.dateTo = $('#dateTo').val();
        d.timeTo = $('#timeTo').val();

        // Search input
        d.search.value = $('#globalSearch').val();

        // Sloupcové filtry (mapování podle ID pro stabilitu při skrytých sloupcích)
        $('.filter-input').each(function () {
          const val = $(this).val();
          if (val) {
            const id = $(this).attr('id') || '';
            const match = id.match(/filter-col-(\d+)/);
            if (match) {
              d['col' + match[1]] = val;
            }
          }
        });
      }
    },
    columns: [
      { data: 'Id', name: 'Id' },
      {
        data: 'ModifiedOn',
        name: 'ModifiedOn',
        render: function (data) {
          if (!data) return '';
          // Zobrazit v UTC
          const d = new Date(data);
          return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        }
      },
      { data: 'Name', name: 'Name' },
      { data: 'DeviceRegion', name: 'DeviceRegion' },
      { data: 'DeviceLocality', name: 'DeviceLocality' },
      { data: 'Frequency', name: 'Frequency' },
      { data: 'DeviceType', name: 'DeviceType' },
      { data: 'DeviceProperty', name: 'DeviceProperty' },
      { data: 'OldValue', name: 'OldValue' },
      { data: 'NewValue', name: 'NewValue' },
      {
        data: 'OldValueReal', name: 'OldValueReal',
        render: function (data) {
          if (data === null || data === undefined) return '';
          return parseFloat(data).toFixed(2);
        }
      },
      {
        data: 'NewValueReal', name: 'NewValueReal',
        render: function (data) {
          if (data === null || data === undefined) return '';
          return parseFloat(data).toFixed(2);
        }
      }
    ],
    order: [[0, 'desc']],
    orderCellsTop: true,
    dom: 'rt<"bottom"ip><"clear">',
    language: {
      "decimal": "",
      "emptyTable": "Žádná data k dispozici",
      "info": "Zobrazeno _START_ až _END_ z _TOTAL_ záznamů",
      "infoEmpty": "Zobrazeno 0 až 0 z 0 záznamů",
      "infoFiltered": "(filtrováno z celkem _MAX_ záznamů)",
      "infoPostFix": "",
      "thousands": " ",
      "lengthMenu": "Zobrazit _MENU_ záznamů",
      "loadingRecords": "Načítám...",
      "processing": "Zpracovávám...",
      "search": "Hledat:",
      "zeroRecords": "Žádné záznamy nenalezeny",
      "paginate": {
        "first": "První",
        "last": "Poslední",
        "next": "Další",
        "previous": "Předchozí"
      },
      "aria": {
        "sortAscending": ": aktivujte pro řazení vzestupně",
        "sortDescending": ": aktivujte pro řazení sestupně"
      }
    },
    rowCallback: function (row, data) {
      // Check for ID in various cases (Id, ID, id)
      const idVal = data.Id || data.ID || data.id;
      if (idVal) {
        const recordId = parseInt(idVal);

        // Highlight only if NOT initial load AND record is newer than last seen max ID
        // Using ID is more robust than Date for "New Records" check
        if (!window.isInitialLoad && window.lastMaxId > 0 && recordId > window.lastMaxId) {
          $(row).addClass('new-record');
          setTimeout(() => {
            $(row).removeClass('new-record');
          }, CONFIG.NEW_RECORD_HIGHLIGHT_DURATION);
        }
      }
    },
    drawCallback: function (settings) {
      // Find max Id in current data and update watermark
      const api = this.api();
      const rows = api.rows({ page: 'current' }).data();

      let currentMaxId = 0;
      rows.each(function (rowData) {
        const rId = rowData.Id || rowData.ID || rowData.id;
        if (rId) {
          const id = parseInt(rId);
          if (id > currentMaxId) currentMaxId = id;
        }
      });

      // Update the high watermark
      if (currentMaxId > window.lastMaxId) {
        window.lastMaxId = currentMaxId;
      }

      // After first draw, allow highlighting
      if (window.isInitialLoad) {
        window.isInitialLoad = false;
      }

      const body = $('#recordsTable tbody');
      body.unmark();

      const term = $('#globalSearch').val();
      if (term) body.mark(term);

      $('.filter-input').each(function () {
        const val = $(this).val();
        const id = $(this).attr('id') || '';
        const match = id.match(/filter-col-(\d+)/);
        if (val && match) {
          const colIdx = parseInt(match[1]);
          // Zvýraznit pouze v daném sloupci pro přehlednost
          api.column(colIdx).nodes().to$().mark(val);
        }
      });

      // Update Status Bar
      const info = this.api().page.info();
      $('#rowCount').text(info.recordsDisplay.toLocaleString());
      const now = new Date();
      const utcString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      $('#lastUpdate').text(utcString);
    }
  });

  // === Column Visibility ===
  const COL_VIS_KEY = 'historian_column_visibility';
  const columnLabels = [
    'Id', 'Datum', 'Zařízení', 'Region', 'Lokalita',
    'Frekvence', 'Typ', 'Vlastnost', 'Stará hodnota', 'Nová hodnota',
    'Stará hod. (REAL)', 'Nová hod. (REAL)'
  ];

  function buildColVisDropdown() {
    const dd = $('#colVisDropdown');
    dd.empty();
    const saved = JSON.parse(localStorage.getItem(COL_VIS_KEY) || 'null');

    columnLabels.forEach(function (label, idx) {
      const isVisible = saved ? saved[idx] !== false : true;
      const cb = $('<input type="checkbox">')
        .prop('checked', isVisible)
        .on('change', function () {
          const visible = $(this).prop('checked');
          table.column(idx).visible(visible);
          saveColVisibility();
        });
      const lbl = $('<label>').append(cb).append(document.createTextNode(label));
      dd.append(lbl);

      // Apply saved visibility
      table.column(idx).visible(isVisible);
    });

    dd.append('<hr>');
    const resetBtn = $('<button class="btn-reset-cols"><i class="fas fa-undo"></i> Reset sloupců</button>')
      .on('click', function () {
        localStorage.removeItem(COL_VIS_KEY);
        columnLabels.forEach(function (_, idx) {
          table.column(idx).visible(true);
        });
        dd.find('input[type="checkbox"]').prop('checked', true);
      });
    dd.append(resetBtn);
  }

  function saveColVisibility() {
    const vis = [];
    columnLabels.forEach(function (_, idx) {
      vis.push(table.column(idx).visible());
    });
    localStorage.setItem(COL_VIS_KEY, JSON.stringify(vis));
  }

  buildColVisDropdown();

  // Toggle dropdown
  $('#btnColumnVis').on('click', function (e) {
    e.stopPropagation();
    $('#colVisDropdown').toggleClass('show');
  });

  // Close dropdown on outside click
  $(document).on('click', function (e) {
    if (!$(e.target).closest('.col-vis-wrapper').length) {
      $('#colVisDropdown').removeClass('show');
    }
    if (!$(e.target).closest('.export-wrapper').length) {
      $('#exportDropdown').removeClass('show');
    }
  });

  // Zamezení řazení při kliknutí do filtru (delegováno pro stabilitu)
  $('#recordsTable thead').on('click mousedown', 'input.filter-input', function (e) {
    e.stopPropagation();
  });

  function refreshTable() {
    table.draw();
  }

  // Dropdowny už volají refreshTable samy uvnitř setupMultiselect
  // $('#regionSelect, #localitySelect, #typeSelect, #propertySelect').on('change', refreshTable); <-- OLD
  // Date Validation & Refresh
  $('#dateFrom, #timeFrom, #dateTo, #timeTo').on('change', function () {
    const dFrom = $('#dateFrom').val();
    const dTo = $('#dateTo').val();

    // Simple validation: From > To
    if (dFrom && dTo && dFrom > dTo) {
      alert('Chyba: Datum "Od" nemůže být pozdější než datum "Do".');
      // Reset current field
      $(this).val('');
      return;
    }
    refreshTable();
  });

  let searchTimeout;

  // Search Input Logic with X button
  const searchInput = $('#globalSearch');
  const clearSearchBtn = $('#clearSearch');

  function toggleClearSearchBtn() {
    if (searchInput.val().length > 0) {
      clearSearchBtn.show();
    } else {
      clearSearchBtn.hide();
    }
  }

  searchInput.on('keyup', function () {
    toggleClearSearchBtn();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  clearSearchBtn.on('click', function () {
    searchInput.val('');
    toggleClearSearchBtn();
    refreshTable();
  });

  $('.filter-input').on('keyup change', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  const savedPageLen = localStorage.getItem('historian_page_len') || '10';
  $('#pageLengthSelect').val(savedPageLen);

  $('#pageLengthSelect').on('change', function () {
    const len = $(this).val();
    localStorage.setItem('historian_page_len', len);
    table.page.len(len).draw();
  });

  // Reset All Filters Button
  $('#btnResetAll').on('click', function () {
    // Reset checkboxů
    $('.multiselect-dropdown input[type="checkbox"]').prop('checked', false);

    // Reset textů tlačítek
    $('#regionBtn').html('<i class="fas fa-globe-europe"></i> Region: Vše');
    $('#localityBtn').html('<i class="fas fa-map-marker-alt"></i> Lokalita: Vše');
    $('#deviceBtn').html('<i class="fas fa-server"></i> Zařízení: Vše'); // Added
    $('#frequencyBtn').html('<i class="fas fa-wave-square"></i> Frekvence: Vše'); // Added
    $('#typeBtn').html('<i class="fas fa-cube"></i> Typ: Vše');
    $('#propertyBtn').html('<i class="fas fa-tag"></i> Vlastnost: Vše');

    // Reset Saved Filter Dropdown
    $('#savedFiltersSelect').val('');

    // Reset Date/Time
    $('#dateFrom, #timeFrom, #dateTo, #timeTo').val('');

    // Reset Search & Column Filters
    searchInput.val('');
    toggleClearSearchBtn();
    $('.filter-input').val('');

    // Force full reload with reset to page 1
    table.ajax.reload(null, true);
  });

  // Export Dropdown Toggle
  $('#btnExport').on('click', function (e) {
    e.stopPropagation();
    $('#exportDropdown').toggleClass('show');
  });

  $('.export-item').on('click', function () {
    const id = $(this).attr('id');
    const format = id.toLowerCase().includes('csv') ? 'csv' : 'xlsx';
    const exportAll = id.toLowerCase().includes('all');

    const btn = $('#btnExport');
    const originalContent = btn.html();

    // Show Loading in main button
    btn.html('<i class="fas fa-spinner fa-spin"></i> Generuji...');
    btn.addClass('disabled').prop('disabled', true);
    $('#exportDropdown').removeClass('show');

    const params = buildParams(table, exportAll);
    window.location.href = `/api/devicedata/${format}?` + params.toString();

    setTimeout(function () {
      btn.html(originalContent);
      btn.removeClass('disabled').prop('disabled', false);
    }, 4000);
  });

  // Keyboard navigation for Export items
  $('.export-item').on('keydown', function (e) {
    const items = $('.export-item');
    const index = items.index(this);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items.eq((index + 1) % items.length).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items.eq((index - 1 + items.length) % items.length).focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $(this).click();
    } else if (e.key === 'Escape') {
      $('#exportDropdown').removeClass('show');
      $('#btnExport').focus();
    }
  });

  $('#btnExport').on('keydown', function (e) {
    if (e.key === 'ArrowDown' && $('#exportDropdown').hasClass('show')) {
      e.preventDefault();
      $('.export-item').first().focus();
    }
  });



  function buildParams(dt, exportAll = false) {
    const params = new URLSearchParams();
    params.append('dataSource', localStorage.getItem('dataSource') || 'main');

    // Pro array parametry musíme přidat každý zvlášť: region=A&region=B
    const regions = getSelectedValues('#regionList');
    regions.forEach(r => params.append('region', r));

    const localities = getSelectedValues('#localityList');
    localities.forEach(l => params.append('locality', l));

    const devices = getSelectedValues('#deviceList'); // Added
    devices.forEach(d => params.append('device', d));

    const frequencies = getSelectedValues('#frequencyList'); // Added
    frequencies.forEach(f => params.append('frequency', f));

    const types = getSelectedValues('#typeList');
    types.forEach(t => params.append('type', t));

    const properties = getSelectedValues('#propertyList');
    properties.forEach(p => params.append('property', p));

    const dFrom = $('#dateFrom').val(); if (dFrom) params.append('dateFrom', dFrom);
    const tFrom = $('#timeFrom').val(); if (tFrom) params.append('timeFrom', tFrom);
    const dTo = $('#dateTo').val(); if (dTo) params.append('dateTo', dTo);
    const tTo = $('#timeTo').val(); if (tTo) params.append('timeTo', tTo);
    const search = $('#globalSearch').val(); if (search) params.append('search', search);

    // Get sorting info from DataTable
    const order = dt.order()[0];
    if (order) {
      params.append('orderCol', order[0]);
      params.append('orderDir', order[1]);
    }

    // Column Visibility
    if (!exportAll) {
      const visibleCols = [];
      dt.columns().every(function (i) {
        if (this.visible()) {
          visibleCols.push(i);
        }
      });
      params.append('visibleCols', visibleCols.join(','));
    }

    $('.filter-input').each(function () {
      const val = $(this).val();
      if (val) {
        const id = $(this).attr('id') || '';
        const match = id.match(/filter-col-(\d+)/);
        if (match) {
          params.append('col' + match[1], val);
        }
      }
    });
    return params;
  }

  function createCheckboxList(containerId, items) {
    const container = $(containerId);
    container.empty();
    if (!items) return;

    // Search Input
    const searchInput = $('<input>', {
      type: 'text',
      placeholder: 'Hledat...',
      class: 'multiselect-search'
    });

    // Stop propagation to prevent closing dropdown
    searchInput.on('click', function (e) {
      e.stopPropagation();
    });

    // Filter logic
    searchInput.on('keyup', function () {
      const val = $(this).val().toLowerCase();
      container.find('label').each(function () {
        const text = $(this).text().toLowerCase();
        // Check filtering
        if (text.indexOf(val) > -1) {
          $(this).removeClass('hidden');
        } else {
          $(this).addClass('hidden');
        }
      });
    });

    container.append(searchInput);

    items.forEach(item => {
      if (!item) return;
      const label = $('<label>');
      const input = $('<input>', { type: 'checkbox', value: item });
      label.append(input).append(' ' + item);
      container.append(label);
    });
  }

  // Načtení filtrů ze serveru
  $.getJSON('/api/filters', function (data) {
    if (data.regions) createCheckboxList('#regionList', data.regions);
    if (data.localities) createCheckboxList('#localityList', data.localities);
    if (data.devices) createCheckboxList('#deviceList', data.devices); // Added
    if (data.frequencies) createCheckboxList('#frequencyList', data.frequencies); // Added
    if (data.types) createCheckboxList('#typeList', data.types);
    if (data.properties) createCheckboxList('#propertyList', data.properties);
  });

  // Načtení verze aplikace
  $.get('/api/version', function (data) {
    if (data && data.version) {
      const versionEl = $('#appVersion');
      versionEl.text(data.version);

      // Clickable version
      versionEl.css({ 'cursor': 'pointer', 'text-decoration': 'underline' });
      versionEl.attr('title', 'Klikněte pro zobrazení historie změn');

      versionEl.on('click', function () {
        $('#changelogModal').fadeIn();
        $('#changelogContent').text('Načítání...');

        $.get('/api/changelog', function (res) {
          if (res && res.content) {
            // Improved parsing to reduce gaps
            // Improved parsing to reduce gaps
            let html = res.content
              .replace(/\r\n/g, '\n') // Normalize newlines
              .replace(/\n+/g, '\n') // Collapse multiple newlines to one
              .replace(/^# (.*$)/gim, '') // Remove H1 Title
              .replace(/^## (.*$)/gim, '<h3>$1</h3>') // H2 -> H3
              .replace(/^### (.*$)/gim, '<h4>$1</h4>') // H3 -> H4
              .replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>') // List items
              .replace(/<\/ul>\n*<ul>/gim, '') // Merge adjacent lists
              .replace(/([^>])\n/g, '$1<br />'); // Newlines to BR only if NOT after a tag

            $('#changelogContent').html(html);
          } else {
            $('#changelogContent').text('Historie změn není dostupná.');
          }
        }).fail(function () {
          $('#changelogContent').text('Chyba při načítání changelogu.');
        });
      });
    }
  });

  // Close Changelog Modal
  $('#closeChangelog').on('click', function () {
    $('#changelogModal').fadeOut();
  });

  // Close on outside click (generic for both modals)
  $(window).on('click', function (event) {
    if ($(event.target).is('#helpModal')) {
      $('#helpModal').fadeOut();
    }
    if ($(event.target).is('#changelogModal')) {
      $('#changelogModal').fadeOut();
    }
  });

  // Close on ESC key
  $(document).on('keydown', function (e) {
    if (e.key === "Escape") {
      $('#helpModal').fadeOut();
      $('#changelogModal').fadeOut();
      $('#colVisDropdown').removeClass('show');
    }
  });

  $('#currentYear').text(new Date().getFullYear());
});
