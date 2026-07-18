const ENDPOINTS = {
  hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  significant: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
  month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson'
};
const CACHE_KEY = 'sismoscope-data-v2';
const CACHE_TTL = 5 * 60 * 1000;

class EarthquakeService {
  async getAll(force = false) {
    if (!force) {
      const cached = this.readCache();
      if (cached) return { ...cached, fromCache: true };
    }
    const responses = await Promise.all(Object.values(ENDPOINTS).map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`El servidor USGS respondió con estado ${response.status}.`);
      return response.json();
    }));
    const data = { hour: responses[0], significant: responses[1], month: responses[2], savedAt: Date.now() };
    const compactFeatures = data.month.features.map(feature => ({
      id: feature.id,
      properties: { mag: feature.properties.mag, place: feature.properties.place, time: feature.properties.time, tsunami: feature.properties.tsunami, url: feature.properties.url },
      geometry: { coordinates: feature.geometry.coordinates }
    }));
    const cacheData = { ...data, month: { metadata: data.month.metadata, features: compactFeatures } };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData)); } catch { localStorage.removeItem(CACHE_KEY); }
    return { ...data, fromCache: false };
  }

  readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY));
      return data && Date.now() - data.savedAt < CACHE_TTL ? data : null;
    } catch { return null; }
  }
}

class Earthquake {
  constructor(feature) {
    const [longitude, latitude, depth] = feature.geometry.coordinates;
    Object.assign(this, { id: feature.id, magnitude: feature.properties.mag ?? 0, place: feature.properties.place || 'Ubicación desconocida', time: feature.properties.time, tsunami: feature.properties.tsunami === 1, url: feature.properties.url, longitude, latitude, depth: depth ?? 0 });
  }
}

class DashboardController {
  constructor(service) {
    this.service = service;
    this.hour = [];
    this.significant = [];
    this.month = [];
    this.chart = null;
    this.number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
    this.bindEvents();
    this.setupReveal();
    this.setupEmergencyKit();
    this.liveTimer = setInterval(() => this.init(true, true), CACHE_TTL);
  }

  async init(force = false, silent = false) {
    if (!silent) this.setLoading(true);
    this.hideError();
    try {
      const data = await this.service.getAll(force);
      this.hour = data.hour.features.map(item => new Earthquake(item)).sort((a, b) => b.time - a.time);
      this.significant = data.significant.features.map(item => new Earthquake(item)).sort((a, b) => b.magnitude - a.magnitude);
      this.month = data.month.features.map(item => new Earthquake(item));
      this.renderMetrics();
      this.renderFiltered();
      this.renderUpdated(data.hour.metadata.generated, data.fromCache);
    } catch (error) {
      this.showError(error.message.includes('Failed to fetch') ? 'No fue posible conectar con USGS. Revisa tu conexión e inténtalo nuevamente.' : error.message);
    } finally { if (!silent) this.setLoading(false); }
  }

  bindEvents() {
    document.querySelector('#periodFilter').addEventListener('change', () => this.renderFiltered());
    document.querySelector('#magnitudeFilter').addEventListener('change', () => this.renderFiltered());
    document.querySelector('#countryFilter').addEventListener('change', () => this.renderFiltered());
    document.querySelector('#placeFilter').addEventListener('input', () => this.renderFiltered());
    document.querySelector('#themeButton').addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      const dark = document.documentElement.classList.contains('dark');
      localStorage.setItem('sismoscope-theme', dark ? 'dark' : 'light');
      this.updateThemeIcon();
      if (this.chart) this.renderChart(this.filteredEvents());
    });
    this.updateThemeIcon();
  }

  setupEmergencyKit() {
    const storageKey = 'sismoscope-emergency-kit';
    const checkboxes = [...document.querySelectorAll('#kitChecklist input[type="checkbox"]')];
    const progress = document.querySelector('#kitProgress');
    let saved = [];
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      saved = Array.isArray(stored) ? stored : [];
    } catch {
      localStorage.removeItem(storageKey);
    }
    checkboxes.forEach(checkbox => {
      checkbox.checked = saved.includes(checkbox.value);
      checkbox.addEventListener('change', () => {
        const selected = checkboxes.filter(item => item.checked).map(item => item.value);
        localStorage.setItem(storageKey, JSON.stringify(selected));
        updateProgress();
      });
    });
    const updateProgress = () => { progress.textContent = `${checkboxes.filter(item => item.checked).length} de ${checkboxes.length}`; };
    document.querySelector('#resetKitButton').addEventListener('click', () => {
      checkboxes.forEach(item => { item.checked = false; });
      localStorage.removeItem(storageKey);
      updateProgress();
    });
    updateProgress();
  }

  filteredEvents() {
    const days = Number(document.querySelector('#periodFilter').value);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const min = Number(document.querySelector('#magnitudeFilter').value);
    const country = document.querySelector('#countryFilter').value.toLocaleLowerCase('es');
    const query = document.querySelector('#placeFilter').value.trim().toLocaleLowerCase('es');
    return this.month
      .filter(item => item.time >= cutoff)
      .filter(item => item.magnitude >= min)
      .filter(item => !country || item.place.toLocaleLowerCase('es').includes(country))
      .filter(item => item.place.toLocaleLowerCase('es').includes(query))
      .sort((a, b) => b.time - a.time);
  }

  renderFiltered() {
    const events = this.filteredEvents();
    const days = Number(document.querySelector('#periodFilter').value);
    const list = document.querySelector('#eventList');
    document.querySelector('#catalogPeriodLabel').textContent = `Catálogo de los últimos ${days} días`;
    document.querySelector('#chartPeriodLabel').textContent = `Últimos ${days} días`;
    document.querySelector('#chilePeriodText').textContent = `Eventos de los últimos ${days} días representados sobre el territorio.`;
    list.innerHTML = events.length ? events.slice(0, 50).map(item => this.eventCard(item)).join('') : `<p class="rounded-2xl bg-[#e4ddd3] p-8 text-center text-stone-600 dark:bg-white/5 dark:text-stone-300">No se encontraron eventos para esta búsqueda en los últimos ${days} días.</p>`;
    this.renderDepths();
    this.renderChile();
    this.renderChart(events);
  }

  renderMetrics() {
    const strongest = this.hour.find(item => item.magnitude === Math.max(...this.hour.map(item => item.magnitude))) || null;
    const latest = this.hour[0];
    const values = [
      ['Eventos registrados', this.number.format(this.hour.length), 'Última hora', '◉'],
      ['Mayor magnitud', strongest ? this.number.format(strongest.magnitude) : '—', strongest?.place || 'Sin eventos', '↗'],
      ['Evento más reciente', latest ? this.relativeTime(latest.time) : '—', latest?.place || 'Sin eventos', '◷'],
      ['Alertas de tsunami', this.number.format(this.hour.filter(item => item.tsunami).length), 'Reportadas por USGS', '≈']
    ];
    document.querySelector('#metrics').innerHTML = values.map(([label, value, detail, icon]) => `<article class="group rounded-3xl border border-[#d3c8ba] bg-[#f7f3ed] p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#8f7766] dark:border-white/10 dark:bg-white/[.04]"><div class="flex justify-between"><p class="text-sm font-semibold text-stone-500 dark:text-stone-400">${label}</p><span class="text-[#55777a]">${icon}</span></div><strong class="mt-5 block text-4xl font-black tracking-tight">${value}</strong><p class="mt-2 truncate text-xs text-stone-500 dark:text-stone-400" title="${detail}">${detail}</p></article>`).join('');
    document.querySelector('#heroCount').textContent = this.number.format(this.hour.length);
  }

  eventCard(item) {
    const tone = item.magnitude >= 6 ? 'bg-[#9b5149]' : item.magnitude >= 4 ? 'bg-[#9a6b4f]' : 'bg-[#55777a]';
    return `<article class="grid grid-cols-[4rem_1fr] items-center gap-4 rounded-2xl border border-[#d6cbbd] bg-white/55 p-4 transition hover:-translate-y-0.5 hover:border-[#8f7766] hover:bg-white dark:border-white/10 dark:bg-white/[.035] dark:hover:border-[#739396] sm:grid-cols-[4rem_1fr_auto]"><span class="grid h-14 w-14 place-items-center rounded-2xl ${tone} font-black text-white shadow-sm">${this.number.format(item.magnitude)}</span><div class="min-w-0"><a href="${item.url}" target="_blank" rel="noreferrer" class="block truncate font-bold hover:text-[#55777a]">${item.place}</a><p class="mt-1 text-xs text-stone-500 dark:text-stone-400">${this.formatDate(item.time)}</p></div><div class="col-start-2 flex items-center gap-4 text-xs text-stone-500 dark:text-stone-400 sm:col-start-auto sm:text-right"><span><strong class="block text-sm text-stone-800 dark:text-stone-200">${this.number.format(item.depth)} km</strong>profundidad</span><span class="text-xl text-[#8f7766]">↗</span></div></article>`;
  }

  renderDepths() {
    const days = Number(document.querySelector('#periodFilter').value);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const deepest = this.month.filter(item => item.time >= cutoff).sort((a, b) => b.depth - a.depth).slice(0, 5);
    const max = deepest[0]?.depth || 1;
    document.querySelector('#depthBars').innerHTML = deepest.map(item => `<div><div class="mb-2 flex justify-between gap-3 text-sm"><span class="truncate">${item.place}</span><strong>${this.number.format(item.depth)} km</strong></div><div class="h-2 overflow-hidden rounded-full bg-stone-300 dark:bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-[#c0a875] to-[#806642] transition-all duration-700" style="width:${Math.max(4, item.depth / max * 100)}%"></div></div></div>`).join('') || '<p class="text-stone-500 dark:text-stone-400">Sin eventos en el período.</p>';
  }

  renderChile() {
    const days = Number(document.querySelector('#periodFilter').value);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const chile = this.month.filter(item => item.time >= cutoff).filter(item => /chile|atacama|coquimbo|valparaíso|valparaiso|antofagasta|maule|biobío|bio-bio|tarapacá|tarapaca/i.test(item.place)).sort((a, b) => b.time - a.time);
    document.querySelector('#chileCount').textContent = this.number.format(chile.length);
    document.querySelector('#chileList').innerHTML = chile.slice(0, 12).map(item => `<article class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/10 p-4 backdrop-blur transition hover:bg-white/10"><div><h3 class="font-bold">${item.place}</h3><p class="mt-1 text-xs text-stone-300">${this.formatDate(item.time)} · ${this.number.format(item.depth)} km de profundidad</p></div><strong class="rounded-xl bg-[#d9b49f]/15 px-3 py-2 text-lg text-[#e1c1af]">M${this.number.format(item.magnitude)}</strong></article>`).join('') || '<p class="rounded-2xl bg-white/10 p-6">No se encontraron eventos recientes en Chile.</p>';
    document.querySelector('#chileMapDots').innerHTML = chile.slice(0, 18).map(item => {
      const x = Math.max(42, Math.min(118, 80 + (item.longitude + 70) * 5));
      const y = Math.max(18, Math.min(500, 18 + (-17.5 - item.latitude) / 38.5 * 482));
      const radius = Math.max(3, Math.min(8, item.magnitude));
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#b86459" stroke="#f1d7c7" stroke-width="2"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>`;
    }).join('');
  }

  renderChart(events) {
    const bins = ['< 2', '2–2.9', '3–3.9', '4–4.9', '5–5.9', '6+'];
    const counts = [0, 0, 0, 0, 0, 0];
    events.forEach(({ magnitude }) => counts[magnitude < 2 ? 0 : magnitude < 3 ? 1 : magnitude < 4 ? 2 : magnitude < 5 ? 3 : magnitude < 6 ? 4 : 5]++);
    this.chart?.destroy();
    const dark = document.documentElement.classList.contains('dark');
    const tickColor = dark ? '#94a3b8' : '#475569';
    this.chart = new Chart(document.querySelector('#magnitudeChart'), { type: 'bar', data: { labels: bins, datasets: [{ label: 'Cantidad de sismos', data: counts, backgroundColor: ['#c6b287', '#bca474', '#b29663', '#a58954', '#947849', '#806642'], hoverBackgroundColor: '#d2b477', borderRadius: 10 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: tickColor } }, y: { beginAtZero: true, ticks: { precision: 0, color: tickColor }, grid: { color: dark ? '#ffffff12' : '#29282418' } } } } });
  }

  renderUpdated(timestamp, fromCache) {
    document.querySelector('#updateBadge').textContent = `Actualizado ${new Date(timestamp).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}${fromCache ? ' · caché local' : ' · USGS'}`;
  }

  setupReveal() { const observer = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('visible', entry.isIntersecting)), { threshold: .15 }); document.querySelectorAll('.reveal').forEach(item => observer.observe(item)); }
  updateThemeIcon() { document.querySelector('#themeButton').textContent = document.documentElement.classList.contains('dark') ? '☀' : '☾'; }
  setLoading(show) { document.querySelector('#loading').classList.toggle('hidden', !show); }
  showError(message) { const box = document.querySelector('#errorBox'); box.textContent = `⚠ ${message}`; box.classList.remove('hidden'); }
  hideError() { document.querySelector('#errorBox').classList.add('hidden'); }
  formatDate(time) { return new Date(time).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }); }
  relativeTime(time) { const minutes = Math.max(0, Math.round((Date.now() - time) / 60000)); return minutes < 1 ? 'Ahora' : `Hace ${minutes} min`; }
}

new DashboardController(new EarthquakeService()).init();
