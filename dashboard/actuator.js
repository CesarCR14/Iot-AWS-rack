// Control del actuador (LED) desde el dashboard
// Botón -> POST /actuator -> Lambda -> AWS IoT (topic data/actuators) -> ESP32

(function () {
    function init() {
        const onBtn = document.getElementById('led-on-btn');
        const offBtn = document.getElementById('led-off-btn');
        const status = document.getElementById('actuator-status');
        const led = document.getElementById('actuator-led');
        if (!onBtn || !offBtn) return;

        async function enviar(message) {
            onBtn.disabled = true;
            offBtn.disabled = true;
            status.textContent = `Enviando ${message}...`;
            try {
                await apiClient.sendActuatorCommand(message);
                const hora = new Date().toLocaleTimeString('es-CO');
                status.textContent = `${message === 'ON' ? 'Encendido' : 'Apagado'} · ${hora}`;
                led.classList.toggle('on', message === 'ON');
            } catch (error) {
                status.textContent = 'Error al enviar la orden';
                uiManager.showError('No se pudo enviar la orden al actuador: ' + error.message);
            } finally {
                onBtn.disabled = false;
                offBtn.disabled = false;
            }
        }

        onBtn.addEventListener('click', () => enviar('ON'));
        offBtn.addEventListener('click', () => enviar('OFF'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
