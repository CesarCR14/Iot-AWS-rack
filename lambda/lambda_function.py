"""
Lambda del proyecto IoT-AWS-rack.

Atiende dos rutas que llegan desde API Gateway:
  GET  /datasensors?device_id=esp32_01&limit=100  -> lee las lecturas de DynamoDB
  POST /actuator   body: {"message": "ON"|"OFF"}   -> publica la orden al ESP32 por MQTT

La respuesta de GET usa el mismo formato que el dashboard del profesor:
  {"count": N, "data": [{"device_id", "timestamp", "temperature", "humidity"}]}

Variables de entorno (Configuration -> Environment variables):
  TABLE_NAME    = valores-sensor-rack
  IOT_ENDPOINT  = xxxxx-ats.iot.us-east-1.amazonaws.com   (IoT Core -> Settings)
  ACTUATOR_TOPIC= data/actuators
"""
import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ.get("TABLE_NAME", "valores-sensor-rack")
IOT_ENDPOINT = os.environ.get("IOT_ENDPOINT", "")
ACTUATOR_TOPIC = os.environ.get("ACTUATOR_TOPIC", "data/actuators")
DEFAULT_DEVICE = "esp32_01"
ZONA_LOCAL = timezone(timedelta(hours=-5))  # Colombia (GMT-5)

tabla = boto3.resource("dynamodb").Table(TABLE_NAME)

# Encabezados CORS: permiten que el dashboard (en otro dominio, S3) llame a la API
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def respuesta(status, cuerpo):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **CORS},
        "body": json.dumps(cuerpo),
    }


def a_numero(valor):
    """DynamoDB devuelve números como Decimal; JSON necesita float."""
    if isinstance(valor, Decimal):
        return float(valor)
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def epoch_a_local(ts):
    """1794003882 -> '2026-11-06 17:24:42' en hora de Colombia."""
    try:
        return datetime.fromtimestamp(int(ts), tz=ZONA_LOCAL).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return str(ts)


def leer_datos(params):
    device_id = params.get("device_id") or DEFAULT_DEVICE
    try:
        limite = max(1, min(int(params.get("limit", 100)), 1000))
    except ValueError:
        limite = 100

    # Query: todas las lecturas de ese dispositivo, de la más nueva a la más vieja
    resultado = tabla.query(
        KeyConditionExpression=Key("device_id").eq(device_id),
        ScanIndexForward=False,
        Limit=limite,
    )

    datos = []
    for item in resultado.get("Items", []):
        payload = item.get("payload", {}) or {}
        datos.append({
            "device_id": item.get("device_id"),
            "timestamp": epoch_a_local(item.get("timestamp")),
            "temperature": a_numero(payload.get("temperature")),
            "humidity": a_numero(payload.get("humidity")),
        })

    return respuesta(200, {"count": len(datos), "data": datos})


def enviar_orden(cuerpo_raw):
    try:
        cuerpo = json.loads(cuerpo_raw or "{}")
    except json.JSONDecodeError:
        return respuesta(400, {"error": "El cuerpo debe ser JSON"})

    mensaje = str(cuerpo.get("message", "")).upper()
    if mensaje not in ("ON", "OFF"):
        return respuesta(400, {"error": "message debe ser ON u OFF"})
    if not IOT_ENDPOINT:
        return respuesta(500, {"error": "Falta la variable de entorno IOT_ENDPOINT"})

    iot = boto3.client("iot-data", endpoint_url=f"https://{IOT_ENDPOINT}")
    iot.publish(topic=ACTUATOR_TOPIC, qos=1, payload=json.dumps({"message": mensaje}))
    return respuesta(200, {"ok": True, "topic": ACTUATOR_TOPIC, "message": mensaje})


def lambda_handler(event, context):
    # Sirve tanto para API Gateway HTTP API (v2) como REST API (v1)
    metodo = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    ruta = event.get("rawPath") or event.get("path") or ""
    params = event.get("queryStringParameters") or {}

    try:
        if metodo == "OPTIONS":
            return respuesta(200, {})
        if metodo == "POST" and ruta.endswith("/actuator"):
            return enviar_orden(event.get("body"))
        if metodo == "GET":
            return leer_datos(params)
        return respuesta(404, {"error": f"Ruta no soportada: {metodo} {ruta}"})
    except Exception as e:  # el detalle completo queda en CloudWatch Logs
        print(f"Error: {e}")
        return respuesta(500, {"error": "Error interno", "detalle": str(e)})
