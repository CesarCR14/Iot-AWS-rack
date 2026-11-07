// UI module for IoT Dashboard
// Handles DOM manipulation, formatting, and user interface updates

class UIManager {
    constructor() {
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    // Initialize DOM element references
    initializeElements() {
        return {
            deviceSelect: document.getElementById('device-select'),
            refreshBtn: document.getElementById('refresh-btn'),
            apiStatusBadge: document.getElementById('api-status-badge'),
            lastRefresh: document.getElementById('last-refresh'),
            tempCard: document.getElementById('temp-card'),
            humidityCard: document.getElementById('humidity-card'),
            timestampCard: document.getElementById('timestamp-card'),
            sensorChart: document.getElementById('sensor-chart'),
            chartLoading: document.getElementById('chart-loading'),
            historyTable: document.getElementById('history-table'),
            historyTbody: document.getElementById('history-tbody'),
            historyLoading: document.getElementById('history-loading'),
            loadMoreBtn: document.getElementById('load-more-btn'),
            resetHistoryBtn: document.getElementById('reset-history-btn'),
            exportCsvBtn: document.getElementById('export-csv-btn'),
            errorModal: document.getElementById('error-modal'),
            errorMessage: document.getElementById('error-message')
        };
    }

    // Setup event listeners
    setupEventListeners() {
        // Close error modal
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideError());
        }

        // Close modal on outside click
        this.elements.errorModal.addEventListener('click', (e) => {
            if (e.target === this.elements.errorModal) {
                this.hideError();
            }
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideError();
            }
        });
    }

    // Initialize device select dropdown
    initializeDeviceSelect() {
        this.elements.deviceSelect.innerHTML = '';
        
        APP_CONFIG.availableDevices.forEach(deviceId => {
            const option = document.createElement('option');
            option.value = deviceId;
            option.textContent = deviceId;
            if (deviceId === APP_CONFIG.defaultDeviceId) {
                option.selected = true;
            }
            this.elements.deviceSelect.appendChild(option);
        });
    }

    // Update API status badge
    updateApiStatus(status, message = '') {
        const badge = this.elements.apiStatusBadge;
        badge.className = 'status-badge';
        
        switch (status) {
            case 'ok':
                badge.classList.add('ok');
                badge.innerHTML = '✓ API OK';
                break;
            case 'error':
                badge.classList.add('error');
                badge.innerHTML = '✗ API Down';
                if (message) {
                    badge.title = message;
                }
                break;
            case 'loading':
                badge.classList.add('loading');
                badge.innerHTML = '<span class="spinner"></span> Checking...';
                break;
        }
    }

    // Update summary cards
    updateSummaryCards(data) {
        if (!data) return;

        // Temperature card
        const tempValue = this.elements.tempCard.querySelector('.value');
        tempValue.textContent = data.temperature.toFixed(1);

        // Humidity card
        const humidityValue = this.elements.humidityCard.querySelector('.value');
        humidityValue.textContent = data.humidity.toFixed(1);

        // Timestamp card
        const timestampValue = this.elements.timestampCard.querySelector('.value');
        const relativeTime = this.elements.timestampCard.querySelector('.relative-time');
        
        timestampValue.textContent = this.formatDateTime(data.timestampMs);
        relativeTime.textContent = this.formatRelativeTime(data.timestampMs);
    }

    // Show loading state for summary cards
    showSummaryLoading() {
        const cards = [this.elements.tempCard, this.elements.humidityCard, this.elements.timestampCard];
        cards.forEach(card => {
            const value = card.querySelector('.value');
            value.innerHTML = '<span class="spinner"></span>';
            const relativeTime = card.querySelector('.relative-time');
            if (relativeTime) {
                relativeTime.textContent = '';
            }
        });
    }

    // Show/hide chart loading
    showChartLoading(show = true) {
        this.elements.chartLoading.style.display = show ? 'flex' : 'none';
    }

    // Show/hide history loading
    showHistoryLoading(show = true) {
        this.elements.historyLoading.style.display = show ? 'flex' : 'none';
    }

    // Clear history table
    clearHistoryTable() {
        this.elements.historyTbody.innerHTML = '';
    }

    // Add rows to history table
    addHistoryRows(items) {
        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.formatDateTime(item.timestampMs)}</td>
                <td>${item.temperature.toFixed(1)}</td>
                <td>${item.humidity.toFixed(1)}</td>
                <td>${this.escapeHtml(item.device_id)}</td>
            `;
            this.elements.historyTbody.appendChild(row);
        });
    }

    // Update history table with only the latest 10 records
    updateHistoryTable(allItems) {
        this.clearHistoryTable();
        // Show only the latest 10 records (already sorted newest first)
        const latestItems = allItems.slice(0, 10);
        this.addHistoryRows(latestItems);
    }

    // Show/hide load more button
    showLoadMoreButton(show = true) {
        this.elements.loadMoreBtn.style.display = show ? 'inline-block' : 'none';
    }

    // Set button loading state
    setButtonLoading(button, loading = true) {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.innerHTML = '<span class="spinner"></span> Loading...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent.replace('Loading...', '').trim();
        }
    }

    // Show error modal
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.style.display = 'flex';
    }

    // Hide error modal
    hideError() {
        this.elements.errorModal.style.display = 'none';
    }

    // Format timestamp to local date/time string
    formatDateTime(timestampMs) {
        try {
            const date = new Date(timestampMs);
            return date.toLocaleString();
        } catch (error) {
            return 'Invalid date';
        }
    }

    // Format relative time (e.g., "3 minutes ago")
    formatRelativeTime(timestampMs) {
        try {
            const now = Date.now();
            const diff = now - timestampMs;
            
            if (diff < 0) return 'In the future';
            
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (seconds < 60) return `hace ${seconds} s`;
            if (minutes < 60) return `hace ${minutes} min`;
            if (hours < 24) return `hace ${hours} h`;
            return `hace ${days} día${days > 1 ? 's' : ''}`;
        } catch (error) {
            return 'Unknown';
        }
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Export history data to CSV
    exportHistoryToCSV(historyData) {
        if (!historyData || historyData.length === 0) {
            this.showError('No hay datos para exportar');
            return;
        }

        const headers = ['Fecha/Hora', 'Temperatura (°C)', 'Humedad (%)', 'Dispositivo'];
        const csvContent = [
            headers.join(','),
            ...historyData.map(item => [
                `"${this.formatDateTime(item.timestampMs)}"`,
                item.temperature.toFixed(1),
                item.humidity.toFixed(1),
                `"${item.device_id}"`
            ].join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `iot-sensor-data-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }

    // Get current selected device ID
    getCurrentDeviceId() {
        return this.elements.deviceSelect.value;
    }

    // Update last refresh time indicator
    updateLastRefreshTime(timestamp = null) {
        const refreshElement = this.elements.lastRefresh;
        const textElement = refreshElement.querySelector('.refresh-text');
        
        if (!timestamp) {
            textElement.textContent = 'Nunca';
            return;
        }
        
        const now = new Date(timestamp);
        const timeString = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        textElement.textContent = timeString;
        refreshElement.title = `Last refreshed at ${now.toLocaleString()}`;
    }

    // Validate device ID input
    validateDeviceId(deviceId) {
        if (!deviceId || typeof deviceId !== 'string') {
            return false;
        }
        return /^[a-zA-Z0-9_-]+$/.test(deviceId);
    }
}

// Create global UI manager instance
const uiManager = new UIManager();