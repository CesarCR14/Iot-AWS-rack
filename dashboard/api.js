// API module for IoT Dashboard
// Handles all API communication with error handling and data normalization

class ApiClient {
    constructor() {
        this.baseUrl = APP_CONFIG.apiBaseUrl;
    }

    // Generic fetch wrapper with error handling
    async fetchWithErrorHandling(url, options = {}) {
        try {
            const response = await fetch(url, {
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Check if response has content before parsing JSON
            const text = await response.text();
            if (!text || text.trim() === '') {
                return {}; // Return empty object for empty responses
            }

            try {
                const parsed = JSON.parse(text);
                
                // Handle Lambda proxy integration format where data is in 'body' field
                if (parsed.body) {
                    if (typeof parsed.body === 'string') {
                        return JSON.parse(parsed.body);
                    }
                    // If body is already an object
                    return parsed.body;
                }
                
                return parsed;
            } catch (jsonError) {
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error - check your internet connection and API CORS settings');
            }
            throw error;
        }
    }

    // Check API health status
    async checkHealth() {
        try {
            // Try to fetch a small amount of data to verify API is working
            const url = `${this.baseUrl}${APP_CONFIG.dataPath}?limit=1`;
            const response = await this.fetchWithErrorHandling(url);
            // If we get data back, API is healthy
            return { status: 'ok', data: response };
        } catch (error) {
            console.error('Health check failed:', error);
            return { status: 'error', error: error.message };
        }
    }

    // Fetch latest reading for a device
    async fetchLatest(deviceId) {
        try {
            // Validate device ID
            if (!this.isValidDeviceId(deviceId)) {
                throw new Error('Invalid device ID format');
            }

            // Fetch more records to ensure we get both temperature and humidity
            const url = `${this.baseUrl}${APP_CONFIG.dataPath}?device_id=${encodeURIComponent(deviceId)}&limit=10`;
            const response = await this.fetchWithErrorHandling(url);
            
            // Check for Timestream format with data array
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                // Find the most recent reading that has both temperature and humidity
                let latestComplete = null;
                let latestTemp = null;
                let latestHumidity = null;
                
                for (const item of response.data) {
                    const hasTemp = item.temperature !== null && item.temperature !== undefined;
                    const hasHum = item.humidity !== null && item.humidity !== undefined;
                    
                    // If we find a complete reading, use it
                    if (hasTemp && hasHum) {
                        latestComplete = item;
                        break;
                    }
                    
                    // Otherwise, track the latest of each
                    if (hasTemp && !latestTemp) {
                        latestTemp = item;
                    }
                    if (hasHum && !latestHumidity) {
                        latestHumidity = item;
                    }
                }
                
                // Use complete reading if available
                if (latestComplete) {
                    return this.normalizeTimestreamReading(latestComplete);
                }
                
                // Otherwise, combine the latest temperature and humidity
                if (latestTemp || latestHumidity) {
                    const combined = {
                        device_id: deviceId,
                        timestamp: (latestTemp || latestHumidity).timestamp,
                        temperature: latestTemp ? latestTemp.temperature : 0,
                        humidity: latestHumidity ? latestHumidity.humidity : 0
                    };
                    return this.normalizeTimestreamReading(combined);
                }
                
                // Fallback to first item
                return this.normalizeTimestreamReading(response.data[0]);
            }
            
            // Fallback to old DynamoDB format with payload
            if (response.payload) {
                return this.normalizeDynamoDBReading(response);
            }
            
            throw new Error('No data received from API');
        } catch (error) {
            console.error('Failed to fetch latest reading:', error);
            throw error;
        }
    }

    // Fetch paginated history for a device
    async fetchHistory(deviceId, pageLimit = 100, cursor = null) {
        try {
            // Validate device ID
            if (!this.isValidDeviceId(deviceId)) {
                throw new Error('Invalid device ID format');
            }

            let url = `${this.baseUrl}${APP_CONFIG.dataPath}?device_id=${encodeURIComponent(deviceId)}`;
            if (pageLimit) {
                url += `&limit=${pageLimit}`;
            }
            if (cursor) {
                url += `&cursor=${encodeURIComponent(cursor)}`;
            }

            const response = await this.fetchWithErrorHandling(url);
            
            // Check for Timestream format with data array
            if (response.data && Array.isArray(response.data)) {
                return this.normalizeTimestreamHistory(response);
            }
            
            // Fallback to old DynamoDB format with items array
            if (response.items && Array.isArray(response.items)) {
                return this.normalizeDynamoDBHistory(response);
            }
            
            throw new Error('Invalid history data format');
        } catch (error) {
            console.error('Failed to fetch history:', error);
            throw error;
        }
    }

    // Validate device ID format (alphanumeric, underscore, hyphen only)
    isValidDeviceId(deviceId) {
        if (!deviceId || typeof deviceId !== 'string') {
            return false;
        }
        return /^[a-zA-Z0-9_-]+$/.test(deviceId);
    }

    // Normalize Timestream reading (new format)
    normalizeTimestreamReading(item) {
        // Handle null values from Lambda (when measure is missing)
        const temperature = item.temperature !== null && item.temperature !== undefined 
            ? parseFloat(item.temperature) 
            : 0;
        const humidity = item.humidity !== null && item.humidity !== undefined 
            ? parseFloat(item.humidity) 
            : 0;
        const device_id = String(item.device_id || '');
        
        // Parse timestamp string to milliseconds
        // Format: "2025-11-24 16:50:37"
        const timestampMs = this.parseTimestampString(item.timestamp);

        return {
            temperature,
            humidity,
            device_id,
            timestampMs
        };
    }

    // Normalize Timestream history (new format)
    normalizeTimestreamHistory(response) {
        const items = response.data || [];
        
        const normalizedItems = items.map(item => {
            // Handle null values from Lambda (when measure is missing)
            const temperature = item.temperature !== null && item.temperature !== undefined 
                ? parseFloat(item.temperature) 
                : null;
            const humidity = item.humidity !== null && item.humidity !== undefined 
                ? parseFloat(item.humidity) 
                : null;
            const device_id = String(item.device_id || '');
            const timestampMs = this.parseTimestampString(item.timestamp);

            return {
                temperature,
                humidity,
                device_id,
                timestampMs,
                hasTemp: temperature !== null,
                hasHum: humidity !== null
            };
        });

        // Filter to only include complete readings (both temp and humidity)
        const completeReadings = normalizedItems.filter(item => item.hasTemp && item.hasHum);
        
        // If we have complete readings, use those
        const finalItems = completeReadings.length > 0 ? completeReadings : normalizedItems;
        
        // Clean up the helper properties and replace null with 0
        const cleanedItems = finalItems.map(item => ({
            temperature: item.temperature || 0,
            humidity: item.humidity || 0,
            device_id: item.device_id,
            timestampMs: item.timestampMs
        }));

        // Sort by timestamp descending for history table (newest first)
        cleanedItems.sort((a, b) => b.timestampMs - a.timestampMs);

        return {
            items: cleanedItems,
            cursor: null, // Timestream doesn't use cursor pagination
            count: cleanedItems.length
        };
    }

    // Normalize DynamoDB reading (old format with payload)
    normalizeDynamoDBReading(data) {
        const actualData = data.payload || data;
        
        const temperature = this.parseNumericValue(actualData.temperature);
        const humidity = this.parseNumericValue(actualData.humidity);
        const timestamp = this.parseNumericValue(actualData.timestamp || data.timestamp);
        const device_id = this.parseStringValue(actualData.device_id || data.device_id);

        // Convert timestamp to milliseconds if it's in seconds
        const timestampMs = timestamp <= 2e10 ? timestamp * 1000 : timestamp;

        return {
            temperature,
            humidity,
            device_id,
            timestampMs
        };
    }

    // Normalize DynamoDB history (old format with items)
    normalizeDynamoDBHistory(data) {
        const normalizedItems = data.items.map(item => {
            const actualItem = item.payload || item;
            
            const temperature = this.parseNumericValue(actualItem.temperature);
            const humidity = this.parseNumericValue(actualItem.humidity);
            const timestamp = this.parseNumericValue(actualItem.timestamp || item.timestamp);
            const device_id = this.parseStringValue(actualItem.device_id || item.device_id);

            const timestampMs = timestamp <= 2e10 ? timestamp * 1000 : timestamp;

            return {
                temperature,
                humidity,
                device_id,
                timestampMs
            };
        });

        // Sort by timestamp descending for history table (newest first)
        normalizedItems.sort((a, b) => b.timestampMs - a.timestampMs);

        return {
            items: normalizedItems,
            cursor: data.cursor || null,
            count: data.count || normalizedItems.length
        };
    }

    // Parse timestamp string to milliseconds
    // Handles formats like "2025-11-24 16:50:37" or ISO format
    parseTimestampString(timeString) {
        if (!timeString) {
            return Date.now();
        }

        try {
            // Replace space with 'T' for ISO format if needed
            const isoString = timeString.includes('T') ? timeString : timeString.replace(' ', 'T');
            const date = new Date(isoString);
            
            if (isNaN(date.getTime())) {
                console.warn('Invalid timestamp:', timeString);
                return Date.now();
            }
            
            return date.getTime();
        } catch (error) {
            console.warn('Failed to parse timestamp:', timeString, error);
            return Date.now();
        }
    }

    // Parse numeric values (handles DynamoDB format and strings)
    parseNumericValue(value) {
        if (value === null || value === undefined) {
            return 0;
        }

        // Handle DynamoDB format { "N": "value" }
        if (typeof value === 'object' && value.N !== undefined) {
            return parseFloat(value.N) || 0;
        }

        // Handle string or number
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    // Parse string values (handles DynamoDB format)
    parseStringValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        // Handle DynamoDB format { "S": "value" }
        if (typeof value === 'object' && value.S !== undefined) {
            return value.S;
        }

        // Handle direct string
        return String(value);
    }

    // Enviar orden al actuador (LED) a través de API Gateway -> Lambda -> AWS IoT
    async sendActuatorCommand(message) {
        const url = `${this.baseUrl}${APP_CONFIG.actuatorPath}`;
        return this.fetchWithErrorHandling(url, {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    }
}

// Create global API client instance
const apiClient = new ApiClient();
