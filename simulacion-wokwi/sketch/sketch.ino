// Prueba local: DHT22 + LED RGB integrado (sin nube todavía)
// Placa: ESP32-S3-N16R8 genérica
// Librerías (Arduino IDE > Herramientas > Administrar bibliotecas):
//   - "DHTNEW" (autor: Rob Tillaart)
//   - "Adafruit NeoPixel"

#include <dhtnew.h>
#include <Adafruit_NeoPixel.h>

#define DHT_PIN   4    // DATA del DHT22
#define LED_PIN   48   // LED RGB integrado de la placa

DHTNEW dht(DHT_PIN);
Adafruit_NeoPixel led(1, LED_PIN, NEO_GRB + NEO_KHZ800);

void ledColor(uint8_t r, uint8_t g, uint8_t b) {
  led.setPixelColor(0, led.Color(r, g, b));
  led.show();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  dht.setDisableIRQ(true);  // no atender otras tareas mientras lee el sensor (timing exacto)
  led.begin();
  led.setBrightness(40);   // 0-255, bajo para no encandilar

  // Saludo: rojo, verde, azul. Si no ves esto, el LED no está respondiendo.
  ledColor(255, 0, 0); delay(400);
  ledColor(0, 255, 0); delay(400);
  ledColor(0, 0, 255); delay(400);
  ledColor(0, 0, 0);

  Serial.println("Listo. Escribe 1 (prender) o 0 (apagar) en el Monitor Serie.");
}

unsigned long ultimaLectura = 0;

void loop() {
  // Actuador: comandos por el Monitor Serie (luego vendrán de AWS por MQTT)
  if (Serial.available()) {
    char c = Serial.read();
    if (c == '1') { ledColor(0, 255, 0); Serial.println("LED ON");  }
    if (c == '0') { ledColor(0, 0, 0);   Serial.println("LED OFF"); }
  }

  // Sensor: la librería exige mínimo 2 s entre lecturas; usamos 3 s para tener margen
  if (millis() - ultimaLectura >= 3000) {
    ultimaLectura = millis();
    int estado = dht.read();          // pide una lectura al sensor
    float temp = dht.getTemperature();
    float hum  = dht.getHumidity();

    if (estado != DHTLIB_OK) {
      Serial.printf("Error leyendo el DHT22 (codigo %d): revisa cables y pin\n", estado);
    } else {
      // Mismo formato JSON que luego mandaremos a AWS
      Serial.printf("{\"temp\": %.1f, \"hum\": %.1f}\n", temp, hum);
    }
  }
}
