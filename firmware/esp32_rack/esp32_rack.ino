// =====================================================================
// IoT-AWS-rack · Firmware final del ESP32-S3
// Monitorea temperatura y humedad de un rack de TI y las envía a AWS IoT Core
// por MQTT. Recibe órdenes ON/OFF desde el dashboard para el LED (actuador).
//
// Basado en aws_esp32.ino del profesor (jhorvi24/aws-serverless-architecture-IoT),
// adaptado a: ESP32-S3 + DHT22 (pin 4) + LED RGB integrado (pin 48).
//
// Librerías (Arduino IDE > Library Manager):
//   - DHTNEW (Rob Tillaart)
//   - Adafruit NeoPixel
//   - PubSubClient (Nick O'Leary)
//   - ArduinoJson (Benoit Blanchon) v7
// Placa: ESP32S3 Dev Module · Flash 16MB · PSRAM OPI · Monitor Serie 115200
// =====================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <dhtnew.h>
#include <Adafruit_NeoPixel.h>
#include <time.h>
#include "credentials.h"   // WiFi, endpoint y certificados (NO se sube a GitHub)

// ---------- Hardware ----------
#define DHT_PIN   4        // DATA del DHT22
#define LED_PIN   48       // LED RGB integrado de la placa

// ---------- MQTT ----------
#define TOPIC_DATOS   "esp32-datos-rack"   // placa -> nube (lecturas)
#define TOPIC_ORDENES "data/actuators"     // nube -> placa ({"message":"ON"|"OFF"})
#define DEVICE_ID     "esp32_01"

const unsigned long INTERVALO_ENVIO_MS = 15000;  // cada cuánto se publica una lectura

WiFiClientSecure clienteSeguro;
PubSubClient mqtt(clienteSeguro);
DHTNEW dht(DHT_PIN);
Adafruit_NeoPixel led(1, LED_PIN, NEO_GRB + NEO_KHZ800);

unsigned long ultimoEnvio = 0;

// ---------------------------------------------------------------------
void ledColor(uint8_t r, uint8_t g, uint8_t b) {
  led.setPixelColor(0, led.Color(r, g, b));
  led.show();
}

// ---------------------------------------------------------------------
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Conectando a WiFi ");
  Serial.print(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\nWiFi conectado. IP: ");
  Serial.println(WiFi.localIP());
}

// Sincroniza la hora por internet (NTP) para que el timestamp sea real
void sincronizarHora() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");   // epoch en UTC
  Serial.print("Sincronizando hora");
  time_t ahora = time(nullptr);
  int intentos = 0;
  while (ahora < 1700000000 && intentos < 40) {   // espera hasta tener una fecha válida
    delay(250);
    Serial.print(".");
    ahora = time(nullptr);
    intentos++;
  }
  Serial.println(ahora > 1700000000 ? " OK" : " (sin hora, se intentará luego)");
}

// ---------------------------------------------------------------------
// Se ejecuta cada vez que llega un mensaje al topic de órdenes
void alRecibirMensaje(char* topic, byte* payload, unsigned int length) {
  Serial.print("Mensaje recibido en ");
  Serial.println(topic);

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.println("  JSON inválido, se ignora");
    return;
  }

  const char* orden = doc["message"] | "";   // "" si no viene el campo
  if (strcmp(orden, "ON") == 0) {
    ledColor(0, 255, 0);
    Serial.println("  LED ENCENDIDO");
  } else if (strcmp(orden, "OFF") == 0) {
    ledColor(0, 0, 0);
    Serial.println("  LED APAGADO");
  } else {
    Serial.println("  Orden desconocida");
  }
}

// ---------------------------------------------------------------------
// Conecta (o reconecta) a AWS IoT y SIEMPRE se vuelve a suscribir
void conectarAWS() {
  while (!mqtt.connected()) {
    Serial.print("Conectando a AWS IoT... ");
    if (mqtt.connect(THINGSNAME)) {
      Serial.println("conectado");
      mqtt.subscribe(TOPIC_ORDENES, 1);
      Serial.print("Suscrito a ");
      Serial.println(TOPIC_ORDENES);
      ledColor(0, 0, 40);  delay(300);  ledColor(0, 0, 0);   // parpadeo azul = conectado
    } else {
      Serial.print("falló (rc=");
      Serial.print(mqtt.state());
      Serial.println("). Reintento en 5 s");
      delay(5000);
    }
  }
}

// ---------------------------------------------------------------------
void publicarLectura() {
  int estado = dht.read();
  if (estado != DHTLIB_OK) {
    Serial.printf("Error leyendo el DHT22 (código %d), no se envía\n", estado);
    return;
  }

  JsonDocument doc;
  doc["timestamp"]   = (long) time(nullptr);
  doc["temperature"] = round(dht.getTemperature() * 10) / 10.0;
  doc["humidity"]    = round(dht.getHumidity() * 10) / 10.0;
  doc["device_id"]   = DEVICE_ID;

  char buffer[256];
  serializeJson(doc, buffer);

  if (mqtt.publish(TOPIC_DATOS, buffer)) {
    Serial.print("Enviado: ");
    Serial.println(buffer);
  } else {
    Serial.println("No se pudo publicar");
  }
}

// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== IoT-AWS-rack ===");

  led.begin();
  led.setBrightness(40);
  ledColor(0, 0, 0);

  dht.setDisableIRQ(true);   // lectura del sensor con timing exacto

  conectarWiFi();
  sincronizarHora();

  // Certificados para la conexión segura (TLS) con AWS IoT
  clienteSeguro.setCACert(AWS_CERT_CA);
  clienteSeguro.setCertificate(AWS_CERT_CRT);
  clienteSeguro.setPrivateKey(AWS_CERT_PRIVATE);

  mqtt.setServer(AWS_IoT_Endpoint, 8883);
  mqtt.setCallback(alRecibirMensaje);
  mqtt.setKeepAlive(60);
  mqtt.setBufferSize(512);

  conectarAWS();
}

void loop() {
  // Si se cae algo, reconectar (y volver a suscribirse)
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  if (!mqtt.connected()) conectarAWS();

  // Atender MQTT en CADA vuelta: así las órdenes llegan al instante
  mqtt.loop();

  // Publicar una lectura cada INTERVALO_ENVIO_MS, sin bloquear con delay()
  if (millis() - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = millis();
    publicarLectura();
  }
}
