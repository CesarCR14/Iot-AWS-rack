// PLANTILLA de credenciales.
// 1. Copia este archivo como "credentials.h" (en esta misma carpeta).
// 2. Llénalo con tus datos. credentials.h está en .gitignore: NUNCA se sube a GitHub.

#include <pgmspace.h>

#define THINGSNAME "NOMBRE_DEL_THING"          // AWS IoT Core -> Manage -> Things

const char* ssid = "NOMBRE_WIFI";               // Red WiFi de 2.4 GHz
const char* password = "CLAVE_WIFI";
const char AWS_IoT_Endpoint[] = "xxxxxxxx-ats.iot.us-east-1.amazonaws.com";  // IoT Core -> Settings

// Amazon Root CA 1 (AmazonRootCA1.pem)
static const char AWS_CERT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)EOF";

// Certificado del dispositivo (xxxx-certificate.pem.crt)
static const char AWS_CERT_CRT[] PROGMEM = R"KEY(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)KEY";

// Llave privada del dispositivo (xxxx-private.pem.key)
static const char AWS_CERT_PRIVATE[] PROGMEM = R"KEY(
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
)KEY";
