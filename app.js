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
  }

  async init(force = false) {
    this.setLoading(true);
    this.hideError();
    try {
      const data = await this.service.getAll(force);
      this.hour = data.hour.features.map(item => new Earthquake(item)).sort((a, b) => b.time - a.time);
      this.significant = data.significant.features.map(item => new Earthquake(item)).sort((a, b) => b.magnitude - a.magnitude);
      this.month = data.month.features.map(item => new Earthquake(item));
      this.renderMetrics();
      this.renderFiltered();
      this.renderDepths();
      this.renderChile();
      this.renderChart(this.significant);
      this.renderUpdated(data.hour.metadata.updated, data.fromCache);
    } catch (error) {
      this.showError(error.message.includes('Failed to fetch') ? 'No fue posible conectar con USGS. Revisa tu conexión e inténtalo nuevamente.' : error.message);
    } finally { this.setLoading(false); }
  }

  bindEvents() {
    document.querySelector('#refreshButton').addEventListener('click', () => this.init(true));
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
    const min = Number(document.querySelector('#magnitudeFilter').value);
    const country = document.querySelector('#countryFilter').value.toLocaleLowerCase('es');
    const query = document.querySelector('#placeFilter').value.trim().toLocaleLowerCase('es');
    return this.month
      .filter(item => item.magnitude >= min)
      .filter(item => !country || item.place.toLocaleLowerCase('es').includes(country))
      .filter(item => item.place.toLocaleLowerCase('es').includes(query))
      .sort((a, b) => b.time - a.time);
  }

  renderFiltered() {
    const events = this.filteredEvents();
    const list = document.querySelector('#eventList');
    list.innerHTML = events.length ? events.slice(0, 40).map(item => this.eventCard(item)).join('') : '<p class="col-span-2 rounded-2xl bg-sky-100 p-8 text-center text-slate-600 dark:bg-white/5 dark:text-slate-300">No se encontraron eventos para esta búsqueda en los últimos 30 días.</p>';
    if (this.chart) this.renderChart(events.length ? events : this.significant);
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
    document.querySelector('#metrics').innerHTML = values.map(([label, value, detail, icon]) => `<article class="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-teal-400 dark:border-white/10 dark:bg-white/[.04]"><div class="flex justify-between"><p class="text-sm font-semibold text-slate-500 dark:text-slate-400">${label}</p><span class="text-teal-500">${icon}</span></div><strong class="mt-5 block text-4xl font-black tracking-tight">${value}</strong><p class="mt-2 truncate text-xs text-slate-500 dark:text-slate-400" title="${detail}">${detail}</p></article>`).join('');
    document.querySelector('#heroCount').textContent = this.number.format(this.hour.length);
  }

  eventCard(item) {
    const tone = item.magnitude >= 6 ? 'bg-red-500' : item.magnitude >= 4 ? 'bg-amber-500' : 'bg-teal-500';
    return `<article class="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-400 dark:border-white/10"><span class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tone} font-black text-white">${this.number.format(item.magnitude)}</span><div class="min-w-0 flex-1"><a href="${item.url}" target="_blank" rel="noreferrer" class="block truncate font-bold hover:text-teal-500">${item.place}</a><p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${this.formatDate(item.time)} · ${this.number.format(item.depth)} km</p></div><span class="text-slate-300">↗</span></article>`;
  }

  renderDepths() {
    const deepest = [...this.significant].sort((a, b) => b.depth - a.depth).slice(0, 5);
    const max = deepest[0]?.depth || 1;
    document.querySelector('#depthBars').innerHTML = deepest.map(item => `<div><div class="mb-2 flex justify-between gap-3 text-sm"><span class="truncate">${item.place}</span><strong>${this.number.format(item.depth)} km</strong></div><div class="h-2 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-teal-400 to-amber-400 transition-all duration-700" style="width:${Math.max(4, item.depth / max * 100)}%"></div></div></div>`).join('') || '<p class="text-slate-400">Sin eventos significativos.</p>';
  }

  renderChile() {
    const chile = this.month.filter(item => /chile|atacama|coquimbo|valparaíso|valparaiso|antofagasta|maule|biobío|bio-bio|tarapacá|tarapaca/i.test(item.place)).sort((a, b) => b.time - a.time);
    document.querySelector('#chileCount').textContent = this.number.format(chile.length);
    document.querySelector('#chileList').innerHTML = chile.slice(0, 12).map(item => `<article class="flex items-center justify-between gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur"><div><h3 class="font-bold">${item.place}</h3><p class="mt-1 text-xs text-cyan-100">${this.formatDate(item.time)} · Prof. ${this.number.format(item.depth)} km</p></div><strong class="text-xl">M${this.number.format(item.magnitude)}</strong></article>`).join('') || '<p class="rounded-2xl bg-white/10 p-6">No se encontraron eventos recientes en Chile.</p>';
  }

  renderChart(events) {
    const bins = ['< 2', '2–2.9', '3–3.9', '4–4.9', '5–5.9', '6+'];
    const counts = [0, 0, 0, 0, 0, 0];
    events.forEach(({ magnitude }) => counts[magnitude < 2 ? 0 : magnitude < 3 ? 1 : magnitude < 4 ? 2 : magnitude < 5 ? 3 : magnitude < 6 ? 4 : 5]++);
    this.chart?.destroy();
    const dark = document.documentElement.classList.contains('dark');
    this.chart = new Chart(document.querySelector('#magnitudeChart'), { type: 'bar', data: { labels: bins, datasets: [{ label: 'Cantidad de sismos', data: counts, backgroundColor: ['#2dd4bf', '#2dd4bf', '#14b8a6', '#fbbf24', '#f97316', '#ef4444'], borderRadius: 10 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8' } }, y: { beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' }, grid: { color: dark ? '#ffffff12' : '#ffffff12' } } } } });
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
