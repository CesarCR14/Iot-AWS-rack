# Dashboard IoT-AWS-rack

Página web estática (HTML + CSS + JavaScript) que se publica en un bucket de Amazon S3.

- Muestra la última lectura, la gráfica y el historial de temperatura y humedad del rack.
- Descarga los datos en CSV.
- Controla el LED del ESP32 (actuador) con los botones Encender / Apagar.

Basado en el dashboard del repositorio del profesor (jhorvi24/aws-serverless-architecture-IoT), adaptado a DynamoDB, a la ruta `/valuesensors` y con el panel de actuador agregado.

## Configuración
Solo se edita `config.js`:
- `apiBaseUrl`: Invoke URL de API Gateway (con el stage, ej. `/prod`).
- `dataPath`: ruta GET de lecturas (`/valuesensors`).
- `actuatorPath`: ruta POST del actuador (`/actuator`).

## Archivos
| Archivo | Función |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (tema oscuro) |
| `config.js` | URL de la API y parámetros |
| `api.js` | Llamadas a la API (lecturas y órdenes al actuador) |
| `ui.js` | Tarjetas, tabla y exportación CSV |
| `chart.js` | Gráfica de temperatura y humedad |
| `main.js` | Controlador: carga inicial y auto-refresco |
| `actuator.js` | Botones Encender / Apagar LED |
