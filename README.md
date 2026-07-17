# SismoScope - Explorador de Datos Sísmicos

Dashboard responsive construido con HTML5, Tailwind CSS por CDN y JavaScript puro. Consume datos GeoJSON públicos del USGS y cumple los criterios Bronce, Plata y Oro del Proyecto Dato Global AU.

Incluye además un atlas educativo con seis ilustraciones originales sobre corteza, magnitud, ondas sísmicas, profundidad, fallas y tsunamis.

## Cómo ejecutarlo

Abre `index.html` mediante un servidor local (por ejemplo, la extensión Live Server de VS Code). El proyecto no requiere instalación ni claves de API.

## Arquitectura explicada

- `EarthquakeService`: consulta tres endpoints en paralelo con `Promise.all()`, valida respuestas y conserva los datos cinco minutos en `localStorage`.
- `Earthquake`: transforma cada `feature` GeoJSON en un objeto simple y fácil de usar.
- `DashboardController`: maneja eventos, filtros, tema, métricas y renderizado del DOM y de Chart.js.
- Los filtros de magnitud, ubicación y Chile trabajan sobre datos ya descargados, sin recargar la página.

## Endpoints

- Todos los sismos de la última hora.
- Sismos significativos de los últimos 30 días.
- Todos los sismos de los últimos 30 días.

## Publicación en GitHub Pages

1. Sube estos archivos a un repositorio público llamado `proyectodatoglobalau`.
2. En GitHub, entra a **Settings > Pages**.
3. Selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
4. Verifica la URL publicada en una ventana de incógnito.

Los datos pertenecen al [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/).

## Cumplimiento de la rúbrica

### Nivel Bronce

- `fetch()`, `async/await` y `try/catch` para consumir USGS.
- Cuatro métricas dinámicas: total, mayor magnitud, evento reciente y alertas de tsunami.
- Clases `EarthquakeService`, `Earthquake` y `DashboardController`.
- Renderizado del DOM, spinner, error amigable y botón de actualización.
- HTML semántico con `header`, `main`, `section` y `footer`; Tailwind CSS por CDN.
- Autor en cabecera visual y pie con atribución explícita a USGS.

### Nivel Plata

- Tres endpoints distintos consultados en paralelo.
- Filtros locales de magnitud, país y ubicación sin recargar la página.
- Uso explícito de `map()`, `filter()`, `sort()` y `find()`.
- Barras comparativas de profundidad calculadas con JavaScript.
- Elementos `article`, `nav` y `aside`, con clases responsive `md:` y `lg:`.

### Nivel Oro

- Histograma reactivo construido con Chart.js.
- Apartado dedicado a Chile mediante filtrado local.
- `Promise.all()` y responsabilidades POO separadas.
- Fechas y cifras con `toLocaleString()` e `Intl.NumberFormat`.
- Caché de datos por cinco minutos y tema persistente mediante `localStorage`.
- Hora exacta de actualización procesada desde `metadata.updated`.
- Tema claro/oscuro, transiciones, efectos hover y animaciones al hacer scroll.
- Galería educativa responsive con seis ilustraciones originales.
- Publicación pública mediante GitHub Pages desde `main`.

## Preparación ante emergencias

El módulo educativo adicional se basa en las recomendaciones oficiales de SENAPRED e incluye actuación durante un sismo, checklist persistente del kit, mapa familiar ilustrativo y números de emergencia de Chile.
