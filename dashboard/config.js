// Configuración del dashboard IoT-AWS-rack
// Este es el ÚNICO archivo que hay que editar si cambia la API (por ejemplo, al reiniciar el Learner Lab).

const APP_CONFIG = {
    // Invoke URL de API Gateway (incluye el stage, ej: /prod)
    apiBaseUrl: "https://ijjg5qcsw7.execute-api.us-east-1.amazonaws.com/prod",

    // Rutas de la API
    dataPath: "/valuesensors",     // GET  -> lecturas desde DynamoDB
    actuatorPath: "/actuator",     // POST -> {"message": "ON"|"OFF"} hacia el ESP32

    // Dispositivo por defecto (debe coincidir con device_id que envía el ESP32)
    defaultDeviceId: "esp32_01",

    // Cantidad de registros a pedir para la gráfica e historial
    pageLimit: 100,

    // Actualización automática
    autoRefresh: {
        enabled: true,
        intervalSeconds: 30,
        latestDataOnly: true,
        pauseOnError: true
    },

    // Dispositivos disponibles en el selector
    availableDevices: [
        "esp32_01"
    ]
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = APP_CONFIG;
}
