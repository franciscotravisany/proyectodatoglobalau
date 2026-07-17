# SismoScope - Explorador de Datos Sísmicos

Dashboard responsive construido con HTML5, Tailwind CSS por CDN y JavaScript puro. Consume datos GeoJSON públicos del USGS y cumple los criterios Bronce, Plata y Oro de la hackatón.

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

1. Sube estos archivos a un repositorio público llamado `hackaton-sismografo-global`.
2. En GitHub, entra a **Settings > Pages**.
3. Selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
4. Verifica la URL publicada en una ventana de incógnito.

Los datos pertenecen al [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/).
