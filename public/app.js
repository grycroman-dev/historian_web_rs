$(document).ready(function () {
  console.log('App init...');

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
      $('#clearFilters').click();
    }
    // Přepnout zdroj dat: Alt+S
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (datasourceToggle) datasourceToggle.click();
    }
  });
  // --- 1.5 Data Source Logic ---
  const datasourceToggle = document.getElementById('datasourceToggle');
  const datasourceLabel = document.getElementById('datasourceLabel');

  function updateDatasourceUI(isBackup) {
    if (datasourceToggle) datasourceToggle.checked = isBackup;

    // Toggle header class for styling
    const header = document.querySelector('header');
    if (header) {
      if (isBackup) {
        header.classList.add('header-backup');
      } else {
        header.classList.remove('header-backup');
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
      if (e.key === 'Escape' && helpModal.style.display === 'block') {
        helpModal.style.display = 'none';
        helpBtn.focus();
      }
    });
  }

  // --- 3. DataTables & Filters Logic ---

  // Helper pro vytvoření checkbox seznamu
  function createCheckboxList(containerId, items, labelPrefix) {
    const container = $(containerId);
    container.empty();

    // items je pole stringů
    items.forEach(item => {
      if (!item) return; // skip empty/null
      const id = labelPrefix + '_' + item.replace(/\W/g, '_');
      const label = $('<label>');

      // Bezpečné vytvoření elementu s hodnotou
      const checkbox = $('<input>', {
        type: 'checkbox',
        value: item
      });

      label.append(checkbox).append(' ' + item);
      container.append(label);
    });
  }

  // Načtení filtrů
  $.getJSON('/api/filters', function (data) {
    if (data.regions) createCheckboxList('#regionList', data.regions, 'reg');
    if (data.localities) createCheckboxList('#localityList', data.localities, 'loc');
    if (data.types) createCheckboxList('#typeList', data.types, 'typ');
    if (data.properties) createCheckboxList('#propertyList', data.properties, 'prop');
  }).fail(function (err) {
    console.error('Chyba load filters', err);
  });

  // UI Logika pro Multi-select
  function setupMultiselect(btnId, listId, defaultText) {
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
        btn.text(defaultText + ': Vše');
      } else if (checked.length === 1) {
        btn.text(defaultText + ': ' + checked.val());
      } else {
        btn.text(defaultText + ': (' + checked.length + ')');
      }
      refreshTable();
    });
  }

  setupMultiselect('#regionBtn', '#regionList', 'Region');
  setupMultiselect('#localityBtn', '#localityList', 'Lokalita');
  setupMultiselect('#typeBtn', '#typeList', 'Typ');
  setupMultiselect('#propertyBtn', '#propertyList', 'Vlastnost');

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
    ajax: {
      url: '/api/devicedata',
      // traditional: true, // REMOVED: Breaks DataTables nested object params
      data: function (d) {
        // DataSource
        d.dataSource = localStorage.getItem('dataSource') || 'main';

        // Multi-select filtry (posíláme pole)
        d.region = getSelectedValues('#regionList');
        d.locality = getSelectedValues('#localityList');
        d.type = getSelectedValues('#typeList');
        d.property = getSelectedValues('#propertyList');

        // Datum a čas
        d.dateFrom = $('#dateFrom').val();
        d.timeFrom = $('#timeFrom').val();
        d.dateTo = $('#dateTo').val();
        d.timeTo = $('#timeTo').val();

        // Search input
        d.search.value = $('#globalSearch').val();

        // Sloupcové filtry (inputs v thead)
        $('.filter-input').each(function (i) {
          d['col' + i] = $(this).val();
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
      { data: 'NewValue', name: 'NewValue' }
    ],
    order: [[0, 'desc']],
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
    drawCallback: function () {
      const body = $('#recordsTable tbody');
      body.unmark();

      const term = $('#globalSearch').val();
      if (term) body.mark(term);

      $('.filter-input').each(function () {
        const val = $(this).val();
        if (val) body.mark(val);
      });
    }
  });

  // Zamezení řazení při kliknutí do filtru
  $('thead input.filter-input').on('click', function (e) {
    e.stopPropagation();
  });

  function refreshTable() {
    table.draw();
  }

  // Dropdowny už volají refreshTable samy uvnitř setupMultiselect
  // $('#regionSelect, #localitySelect, #typeSelect, #propertySelect').on('change', refreshTable); <-- OLD
  $('#dateFrom, #timeFrom, #dateTo, #timeTo').on('change', refreshTable);

  let searchTimeout;
  $('#globalSearch').on('keyup', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  $('.filter-input').on('keyup change', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  $('#pageLengthSelect').on('change', function () {
    table.page.len($(this).val()).draw();
  });

  $('#clearFilters').on('click', function () {
    // Reset checkboxů
    $('.multiselect-dropdown input[type="checkbox"]').prop('checked', false);

    // Reset textů tlačítek
    $('#regionBtn').text('Region: Vše');
    $('#localityBtn').text('Lokalita: Vše');
    $('#typeBtn').text('Typ: Vše');
    $('#propertyBtn').text('Vlastnost: Vše');

    $('#dateFrom, #timeFrom, #dateTo, #timeTo').val('');
    $('#globalSearch').val('');
    $('.filter-input').val('');
    refreshTable();
  });

  $('#exportCSV').on('click', function () {
    const params = buildParams(table);
    window.location.href = '/api/devicedata/csv?' + params.toString();
  });

  $('#exportXLSX').on('click', function () {
    const params = buildParams(table);
    window.location.href = '/api/devicedata/xlsx?' + params.toString();
  });

  function buildParams(dt) {
    const params = new URLSearchParams();
    params.append('dataSource', localStorage.getItem('dataSource') || 'main');

    // Pro array parametry musíme přidat každý zvlášť: region=A&region=B
    const regions = getSelectedValues('#regionList');
    regions.forEach(r => params.append('region', r));

    const localities = getSelectedValues('#localityList');
    localities.forEach(l => params.append('locality', l));

    const types = getSelectedValues('#typeList');
    types.forEach(t => params.append('type', t));

    const properties = getSelectedValues('#propertyList');
    properties.forEach(p => params.append('property', p));

    const dFrom = $('#dateFrom').val(); if (dFrom) params.append('dateFrom', dFrom);
    const tFrom = $('#timeFrom').val(); if (tFrom) params.append('timeFrom', tFrom);
    const dTo = $('#dateTo').val(); if (dTo) params.append('dateTo', dTo);
    const tTo = $('#timeTo').val(); if (tTo) params.append('timeTo', tTo);
    const search = $('#globalSearch').val(); if (search) params.append('search', search);
    const order = dt.order()[0];
    params.append('orderCol', order[0]);
    params.append('orderDir', order[1]);
    $('.filter-input').each(function (i) {
      const val = $(this).val();
      if (val) params.append('col' + i, val);
    });
    return params;
  }

  $('#currentYear').text(new Date().getFullYear());
});
