// Main application controller for IoT Dashboard
// Manages application state and coordinates between modules

class IoTDashboard {
    constructor() {
        // Application state
        this.state = {
            currentDeviceId: APP_CONFIG.defaultDeviceId,
            nextCursor: null,
            historyCache: [],
            isLoading: false,
            autoRefreshTimer: null,
            autoRefreshEnabled: APP_CONFIG.autoRefresh.enabled,
            lastRefreshTime: null,
            errorCount: 0
        };

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.stopAutoRefresh();
        });
    }

    // Initialize the application
    async initialize() {
        try {
            // Setup UI
            uiManager.initializeDeviceSelect();
            this.setupEventListeners();

            // Initial data load
            await this.loadInitialData();

            // Start auto-refresh after initial load
            this.startAutoRefresh();
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            uiManager.showError('Failed to initialize dashboard: ' + error.message);
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Device selection change
        uiManager.elements.deviceSelect.addEventListener('change', (e) => {
            this.handleDeviceChange(e.target.value);
        });

        // Refresh button
        uiManager.elements.refreshBtn.addEventListener('click', () => {
            this.handleRefresh();
        });

        // Load more button
        uiManager.elements.loadMoreBtn.addEventListener('click', () => {
            this.handleLoadMore();
        });

        // Reset history button
        uiManager.elements.resetHistoryBtn.addEventListener('click', () => {
            this.handleResetHistory();
        });

        // Export CSV button
        uiManager.elements.exportCsvBtn.addEventListener('click', () => {
            this.handleExportCSV();
        });
    }

    // Load initial data on page load
    async loadInitialData() {
        this.state.isLoading = true;

        try {
            // Check API health (non-blocking)
            this.checkApiHealth(); // Don't await - let it run in background

            // Validate and set device ID
            const deviceId = uiManager.getCurrentDeviceId();
            if (!this.validateDeviceId(deviceId)) {
                throw new Error('Invalid device ID selected');
            }
            this.state.currentDeviceId = deviceId;

            // Load latest reading and history in parallel
            await Promise.all([
                this.loadLatestReading(),
                this.loadHistoryFirstPage()
            ]);

            // Render chart from history data
            this.updateChart();

        } catch (error) {
            console.error('Failed to load initial data:', error);
            uiManager.showError('Failed to load initial data: ' + error.message);
        } finally {
            this.state.isLoading = false;
        }
    }

    // Check API health status
    async checkApiHealth() {
        uiManager.updateApiStatus('loading');

        try {
            const result = await apiClient.checkHealth();
            if (result.status === 'ok') {
                uiManager.updateApiStatus('ok');
            } else {
                uiManager.updateApiStatus('error', result.error);
                // Don't throw error for health check failures - just show status
                console.warn('API health check failed, but continuing with data load');
            }
        } catch (error) {
            uiManager.updateApiStatus('error', error.message);
            console.warn('API health check failed, but continuing with data load');
        }
    }

    // Load latest reading for current device
    async loadLatestReading() {
        uiManager.showSummaryLoading();

        try {
            const data = await apiClient.fetchLatest(this.state.currentDeviceId);
            uiManager.updateSummaryCards(data);
        } catch (error) {
            console.error('Failed to load latest reading:', error);
            uiManager.showError('Failed to load latest reading: ' + error.message);
        }
    }

    // Load first page of history
    async loadHistoryFirstPage() {
        uiManager.showHistoryLoading(true);
        uiManager.clearHistoryTable();

        try {
            // Fetch last 24 hours of data from Timestream
            const result = await apiClient.fetchHistory(this.state.currentDeviceId);

            this.state.historyCache = result.items;
            this.state.nextCursor = null; // Timestream doesn't use cursor pagination

            // Update table with only latest 10 records
            uiManager.updateHistoryTable(this.state.historyCache);
            
            // Hide load more button since we load all data at once
            uiManager.showLoadMoreButton(false);

        } catch (error) {
            console.error('Failed to load history:', error);
            uiManager.showError('Failed to load history: ' + error.message);
        } finally {
            uiManager.showHistoryLoading(false);
        }
    }

    // Load more history (not used with Timestream - loads all data at once)
    async loadMoreHistory() {
        // Timestream loads all data in one query, so this just reloads
        await this.loadHistoryFirstPage();
        this.updateChart();
    }

    // Update chart with current history data
    updateChart() {
        if (this.state.historyCache.length === 0) {
            uiManager.showChartLoading(false);
            renderLineChart(uiManager.elements.sensorChart, null);
            return;
        }

        uiManager.showChartLoading(true);

        try {
            // Sort data ascending by timestamp for proper chart visualization
            const sortedData = [...this.state.historyCache].sort((a, b) => a.timestampMs - b.timestampMs);

            // Prepare chart data
            const chartData = {
                labels: sortedData.map(item => new Date(item.timestampMs)),
                temp: sortedData.map(item => item.temperature),
                hum: sortedData.map(item => item.humidity)
            };

            // Render chart
            renderLineChart(uiManager.elements.sensorChart, chartData);

        } catch (error) {
            console.error('Failed to update chart:', error);
            uiManager.showError('Failed to update chart: ' + error.message);
        } finally {
            uiManager.showChartLoading(false);
        }
    }

    // Handle device selection change
    async handleDeviceChange(newDeviceId) {
        if (!this.validateDeviceId(newDeviceId)) {
            uiManager.showError('Invalid device ID selected');
            return;
        }

        if (newDeviceId === this.state.currentDeviceId) return;

        // Stop auto-refresh during device change
        this.stopAutoRefresh();

        this.state.currentDeviceId = newDeviceId;
        await this.clearStateAndReload();

        // Restart auto-refresh for new device
        this.startAutoRefresh();
    }

    // Handle refresh button click
    async handleRefresh() {
        if (this.state.isLoading) return;

        uiManager.setButtonLoading(uiManager.elements.refreshBtn, true);

        try {
            // Stop auto-refresh during manual refresh
            this.stopAutoRefresh();

            await this.clearStateAndReload();

            // Update refresh time
            this.state.lastRefreshTime = new Date();
            uiManager.updateLastRefreshTime(this.state.lastRefreshTime);

            // Restart auto-refresh after manual refresh
            this.startAutoRefresh();
        } finally {
            uiManager.setButtonLoading(uiManager.elements.refreshBtn, false);
        }
    }

    // Handle load more button click
    async handleLoadMore() {
        await this.loadMoreHistory();
    }

    // Handle reset history button click
    async handleResetHistory() {
        if (this.state.isLoading) return;

        uiManager.setButtonLoading(uiManager.elements.resetHistoryBtn, true);

        try {
            this.state.nextCursor = null;
            this.state.historyCache = [];
            await this.loadHistoryFirstPage();
            this.updateChart();
        } finally {
            uiManager.setButtonLoading(uiManager.elements.resetHistoryBtn, false);
        }
    }

    // Handle export CSV button click
    handleExportCSV() {
        if (this.state.historyCache.length === 0) {
            uiManager.showError('No data to export');
            return;
        }

        try {
            uiManager.exportHistoryToCSV(this.state.historyCache);
        } catch (error) {
            console.error('Failed to export CSV:', error);
            uiManager.showError('Failed to export CSV: ' + error.message);
        }
    }

    // Clear state and reload all data
    async clearStateAndReload() {
        this.state.nextCursor = null;
        this.state.historyCache = [];

        await Promise.all([
            this.checkApiHealth(),
            this.loadLatestReading(),
            this.loadHistoryFirstPage()
        ]);

        this.updateChart();
    }

    // Validate device ID format
    validateDeviceId(deviceId) {
        if (!deviceId || typeof deviceId !== 'string') {
            return false;
        }
        return /^[a-zA-Z0-9_-]+$/.test(deviceId);
    }

    // Auto-refresh functionality
    startAutoRefresh() {
        if (!APP_CONFIG.autoRefresh.enabled || this.state.autoRefreshTimer) {
            return;
        }

        console.log(`Starting auto-refresh every ${APP_CONFIG.autoRefresh.intervalSeconds} seconds`);

        this.state.autoRefreshTimer = setInterval(async () => {
            if (this.state.isLoading) {
                console.log('Skipping auto-refresh - already loading');
                return;
            }

            try {
                await this.autoRefreshData();
                this.state.errorCount = 0; // Reset error count on success
            } catch (error) {
                console.error('Auto-refresh failed:', error);
                this.state.errorCount++;

                // Pause auto-refresh after multiple consecutive errors
                if (APP_CONFIG.autoRefresh.pauseOnError && this.state.errorCount >= 3) {
                    console.warn('Pausing auto-refresh due to consecutive errors');
                    this.stopAutoRefresh();
                    uiManager.showError('Auto-refresh paused due to connection issues. Use manual refresh to resume.');
                }
            }
        }, APP_CONFIG.autoRefresh.intervalSeconds * 1000);

        this.state.autoRefreshEnabled = true;
        this.updateAutoRefreshIndicator();
    }

    stopAutoRefresh() {
        if (this.state.autoRefreshTimer) {
            clearInterval(this.state.autoRefreshTimer);
            this.state.autoRefreshTimer = null;
        }
        this.state.autoRefreshEnabled = false;
        this.updateAutoRefreshIndicator();
        console.log('Auto-refresh stopped');
    }

    async autoRefreshData() {
        console.log('Auto-refreshing data...');
        this.state.lastRefreshTime = new Date();

        if (APP_CONFIG.autoRefresh.latestDataOnly) {
            // Only refresh latest reading and API health
            await Promise.all([
                this.checkApiHealth(),
                this.loadLatestReading()
            ]);
        } else {
            // Full refresh including history
            await this.clearStateAndReload();
        }

        this.updateAutoRefreshIndicator();
        uiManager.updateLastRefreshTime(this.state.lastRefreshTime);
    }

    updateAutoRefreshIndicator() {
        // Update UI to show auto-refresh status
        const refreshBtn = uiManager.elements.refreshBtn;
        const icon = refreshBtn.querySelector('.btn-icon');

        if (this.state.autoRefreshEnabled && this.state.autoRefreshTimer) {
            refreshBtn.classList.add('auto-refresh-active');
            if (icon) {
                icon.style.animation = 'spin 2s linear infinite';
            }
        } else {
            refreshBtn.classList.remove('auto-refresh-active');
            if (icon) {
                icon.style.animation = '';
            }
        }
    }

    // Get current application state (for debugging)
    getState() {
        return {
            ...this.state,
            autoRefreshConfig: APP_CONFIG.autoRefresh
        };
    }
}

// Initialize the dashboard when script loads
const dashboard = new IoTDashboard();

// Expose dashboard instance globally for debugging
window.dashboard = dashboard;