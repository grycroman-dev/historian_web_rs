$(document).ready(function () {
  console.log('App init...');

  // --- 1. Theme Toggle Logic ---
  const themeToggle = document.getElementById('themeToggle');
  const body = document.body;

  // Funkce pro nastavení loga (pokud by bylo potřeba)
  function updateLogo(isDark) {
    // const logo = document.getElementById('logo');
    // if(logo) logo.src = isDark ? 'logo-dark.png' : 'logo-light.png';
  }

  // Načíst uložené téma při startu
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

  // Event listener pro checkbox
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

  // Klávesová zkratka Ctrl+M
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      if (themeToggle) themeToggle.click();
    }
  });

  // --- 2. Help Modal Logic ---
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
      if (e.key === 'Escape' && helpModal.style.display === 'block') {
        helpModal.style.display = 'none';
        helpBtn.focus();
      }
    });
  }

  // --- 3. DataTables & Filters Logic ---

  // Načtení filtrů (Region, Locality, Type, Property)
  $.getJSON('/api/filters', function (data) {
    if (data.regions) {
      const sel = $('#regionSelect');
      data.regions.forEach(r => sel.append(new Option(r, r)));
    }
    if (data.localities) {
      const sel = $('#localitySelect');
      data.localities.forEach(l => sel.append(new Option(l, l)));
    }
    if (data.types) {
      const sel = $('#typeSelect');
      data.types.forEach(t => sel.append(new Option(t, t)));
    }
    if (data.properties) {
      const sel = $('#propertySelect');
      data.properties.forEach(p => sel.append(new Option(p, p)));
    }
  }).fail(function (err) {
    console.error('Chyba load filters', err);
  });

  // Inicializace DataTables
  const table = $('#recordsTable').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: '/api/devicedata',
      data: function (d) {
        // Globální dropdown filtry
        d.region = $('#regionSelect').val();
        d.locality = $('#localitySelect').val();
        d.type = $('#typeSelect').val();
        d.property = $('#propertySelect').val();

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
          return new Date(data).toLocaleString();
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
    order: [[0, 'desc']], // default Id desc
    dom: 'rt<"bottom"ip><"clear">', // Vlastní layout
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/cs.json'
    },
    drawCallback: function () {
      // Mark.js - zvýraznění
      const term = $('#globalSearch').val();
      if (term) {
        $('#recordsTable tbody').unmark().mark(term);
      }
    }
  });

  // Obsluha filtrů - refresh tabulky
  function refreshTable() {
    table.draw();
  }

  $('#regionSelect, #localitySelect, #typeSelect, #propertySelect').on('change', refreshTable);
  $('#dateFrom, #timeFrom, #dateTo, #timeTo').on('change', refreshTable);

  // Debounce pro textové inputy
  let searchTimeout;
  $('#globalSearch').on('keyup', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  $('.filter-input').on('keyup change', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshTable, 400);
  });

  // Page length
  $('#pageLengthSelect').on('change', function () {
    table.page.len($(this).val()).draw();
  });

  // Clear filters
  $('#clearFilters').on('click', function () {
    $('#regionSelect, #localitySelect, #typeSelect, #propertySelect').val('');
    $('#dateFrom, #timeFrom, #dateTo, #timeTo').val('');
    $('#globalSearch').val('');
    $('.filter-input').val('');
    refreshTable();
  });

  // Export CSV
  $('#exportCSV').on('click', function () {
    const params = buildParams(table);
    window.location.href = '/api/devicedata/csv?' + params.toString();
  });

  // Export Excel
  $('#exportXLSX').on('click', function () {
    const params = buildParams(table);
    window.location.href = '/api/devicedata/xlsx?' + params.toString();
  });

  // Helper pro sestavení parametrů
  function buildParams(dt) {
    const params = new URLSearchParams();

    const region = $('#regionSelect').val(); if (region) params.append('region', region);
    const locality = $('#localitySelect').val(); if (locality) params.append('locality', locality);
    const type = $('#typeSelect').val(); if (type) params.append('type', type);
    const property = $('#propertySelect').val(); if (property) params.append('property', property);

    const dFrom = $('#dateFrom').val(); if (dFrom) params.append('dateFrom', dFrom);
    const tFrom = $('#timeFrom').val(); if (tFrom) params.append('timeFrom', tFrom);
    const dTo = $('#dateTo').val(); if (dTo) params.append('dateTo', dTo);
    const tTo = $('#timeTo').val(); if (tTo) params.append('timeTo', tTo);

    const search = $('#globalSearch').val(); if (search) params.append('search', search);

    const order = dt.order()[0]; // [colIdx, dir]
    params.append('orderCol', order[0]);
    params.append('orderDir', order[1]);

    $('.filter-input').each(function (i) {
      const val = $(this).val();
      if (val) params.append('col' + i, val);
    });

    return params;
  }

  // Footer year
  $('#currentYear').text(new Date().getFullYear());
});
