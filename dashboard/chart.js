// Chart module for IoT Dashboard
// Renders temperature and humidity line chart using native Canvas API

class ChartRenderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.data = null;
        this.tooltip = null;
        
        // Chart configuration
        this.config = {
            padding: { top: 40, right: 80, bottom: 60, left: 60 },
            colors: {
                temperature: '#ff6b6b',
                humidity: '#4ecdc4',
                grid: '#333333',
                text: '#b3b3b3',
                background: '#1a1a1a'
            },
            lineWidth: 2,
            pointRadius: 3,
            fontSize: 12,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif'
        };
        
        this.setupEventListeners();
        this.setupResponsiveResize();
    }

    // Setup mouse event listeners for tooltips
    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
    }

    // Setup responsive canvas resizing
    setupResponsiveResize() {
        const resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
            if (this.data) {
                this.render();
            }
        });
        
        resizeObserver.observe(this.canvas.parentElement);
        this.resizeCanvas();
    }

    // Resize canvas to match container
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Scale context to match device pixel ratio
        this.ctx.scale(dpr, dpr);
        
        // Set CSS size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Store actual drawing dimensions
        this.width = rect.width;
        this.height = rect.height;
    }

    // Main render function
    renderLineChart(data) {
        if (!data || !data.labels || !data.temp || !data.hum) {
            this.renderEmptyState();
            return;
        }

        this.data = data;
        this.render();
    }

    // Render the complete chart
    render() {
        this.clearCanvas();
        
        if (!this.data || this.data.labels.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate chart area
        const chartArea = {
            x: this.config.padding.left,
            y: this.config.padding.top,
            width: this.width - this.config.padding.left - this.config.padding.right,
            height: this.height - this.config.padding.top - this.config.padding.bottom
        };

        // Calculate scales
        const scales = this.calculateScales(chartArea);
        
        // Draw components
        this.drawGrid(chartArea, scales);
        this.drawAxes(chartArea, scales);
        this.drawLines(chartArea, scales);
        this.drawLegend(chartArea);
    }

    // Clear the canvas
    clearCanvas() {
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Calculate X and Y scales
    calculateScales(chartArea) {
        const tempValues = this.data.temp.filter(v => !isNaN(v));
        const humValues = this.data.hum.filter(v => !isNaN(v));
        
        // Time scale (X axis)
        const timeExtent = [
            Math.min(...this.data.labels.map(d => d.getTime())),
            Math.max(...this.data.labels.map(d => d.getTime()))
        ];
        
        // Temperature scale (left Y axis)
        const tempExtent = tempValues.length > 0 ? [
            Math.min(...tempValues),
            Math.max(...tempValues)
        ] : [0, 100];
        
        // Humidity scale (right Y axis) - typically 0-100%
        const humExtent = humValues.length > 0 ? [
            Math.min(0, Math.min(...humValues)),
            Math.max(100, Math.max(...humValues))
        ] : [0, 100];
        
        // Add padding to ranges
        const tempRange = tempExtent[1] - tempExtent[0];
        const humRange = humExtent[1] - humExtent[0];
        
        return {
            x: {
                domain: timeExtent,
                range: [chartArea.x, chartArea.x + chartArea.width]
            },
            yTemp: {
                domain: [
                    tempExtent[0] - tempRange * 0.1,
                    tempExtent[1] + tempRange * 0.1
                ],
                range: [chartArea.y + chartArea.height, chartArea.y]
            },
            yHum: {
                domain: [
                    humExtent[0] - humRange * 0.05,
                    humExtent[1] + humRange * 0.05
                ],
                range: [chartArea.y + chartArea.height, chartArea.y]
            }
        };
    }

    // Draw grid lines
    drawGrid(chartArea, scales) {
        this.ctx.strokeStyle = this.config.colors.grid;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);

        // Vertical grid lines (time)
        const timeStep = (scales.x.domain[1] - scales.x.domain[0]) / 6;
        for (let i = 0; i <= 6; i++) {
            const time = scales.x.domain[0] + (timeStep * i);
            const x = this.scaleValue(time, scales.x);
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, chartArea.y);
            this.ctx.lineTo(x, chartArea.y + chartArea.height);
            this.ctx.stroke();
        }

        // Horizontal grid lines (temperature scale)
        const tempStep = (scales.yTemp.domain[1] - scales.yTemp.domain[0]) / 5;
        for (let i = 0; i <= 5; i++) {
            const temp = scales.yTemp.domain[0] + (tempStep * i);
            const y = this.scaleValue(temp, scales.yTemp);
            
            this.ctx.beginPath();
            this.ctx.moveTo(chartArea.x, y);
            this.ctx.lineTo(chartArea.x + chartArea.width, y);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);
    }

    // Draw axes and labels
    drawAxes(chartArea, scales) {
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        this.ctx.textAlign = 'center';

        // X axis labels (time)
        const timeStep = (scales.x.domain[1] - scales.x.domain[0]) / 6;
        for (let i = 0; i <= 6; i++) {
            const time = scales.x.domain[0] + (timeStep * i);
            const x = this.scaleValue(time, scales.x);
            const date = new Date(time);
            const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            this.ctx.fillText(label, x, chartArea.y + chartArea.height + 20);
        }

        // Left Y axis labels (temperature)
        this.ctx.textAlign = 'right';
        const tempStep = (scales.yTemp.domain[1] - scales.yTemp.domain[0]) / 5;
        for (let i = 0; i <= 5; i++) {
            const temp = scales.yTemp.domain[0] + (tempStep * i);
            const y = this.scaleValue(temp, scales.yTemp);
            
            this.ctx.fillText(`${temp.toFixed(1)}°C`, chartArea.x - 10, y + 4);
        }

        // Right Y axis labels (humidity)
        this.ctx.textAlign = 'left';
        const humStep = (scales.yHum.domain[1] - scales.yHum.domain[0]) / 5;
        for (let i = 0; i <= 5; i++) {
            const hum = scales.yHum.domain[0] + (humStep * i);
            const y = this.scaleValue(hum, scales.yHum);
            
            this.ctx.fillText(`${hum.toFixed(1)}%`, chartArea.x + chartArea.width + 10, y + 4);
        }
    }

    // Draw temperature and humidity lines
    drawLines(chartArea, scales) {
        // Draw temperature line
        this.drawLine(
            this.data.labels,
            this.data.temp,
            scales.x,
            scales.yTemp,
            this.config.colors.temperature
        );

        // Draw humidity line
        this.drawLine(
            this.data.labels,
            this.data.hum,
            scales.x,
            scales.yHum,
            this.config.colors.humidity
        );
    }

    // Draw a single line with points
    drawLine(xData, yData, xScale, yScale, color) {
        if (xData.length === 0 || yData.length === 0) return;

        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = this.config.lineWidth;

        // Draw line
        this.ctx.beginPath();
        let firstPoint = true;
        
        for (let i = 0; i < Math.min(xData.length, yData.length); i++) {
            if (isNaN(yData[i])) continue;
            
            const x = this.scaleValue(xData[i].getTime(), xScale);
            const y = this.scaleValue(yData[i], yScale);
            
            if (firstPoint) {
                this.ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();

        // Draw points
        for (let i = 0; i < Math.min(xData.length, yData.length); i++) {
            if (isNaN(yData[i])) continue;
            
            const x = this.scaleValue(xData[i].getTime(), xScale);
            const y = this.scaleValue(yData[i], yScale);
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.config.pointRadius, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    // Draw legend
    drawLegend(chartArea) {
        const legendY = 20;
        const legendSpacing = 120;
        
        this.ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        
        // Temperature legend
        this.ctx.fillStyle = this.config.colors.temperature;
        this.ctx.fillRect(chartArea.x, legendY - 8, 15, 3);
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Temperatura (°C)', chartArea.x + 20, legendY);
        
        // Humidity legend
        this.ctx.fillStyle = this.config.colors.humidity;
        this.ctx.fillRect(chartArea.x + legendSpacing, legendY - 8, 15, 3);
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.fillText('Humedad (%)', chartArea.x + legendSpacing + 20, legendY);
    }

    // Scale a value from domain to range
    scaleValue(value, scale) {
        const domainRange = scale.domain[1] - scale.domain[0];
        const rangeSpan = scale.range[1] - scale.range[0];
        return scale.range[0] + ((value - scale.domain[0]) / domainRange) * rangeSpan;
    }

    // Handle mouse move for tooltips
    handleMouseMove(e) {
        if (!this.data || this.data.labels.length === 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find closest data point
        const chartArea = {
            x: this.config.padding.left,
            y: this.config.padding.top,
            width: this.width - this.config.padding.left - this.config.padding.right,
            height: this.height - this.config.padding.top - this.config.padding.bottom
        };

        if (x < chartArea.x || x > chartArea.x + chartArea.width ||
            y < chartArea.y || y > chartArea.y + chartArea.height) {
            this.hideTooltip();
            return;
        }

        const scales = this.calculateScales(chartArea);
        let closestIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < this.data.labels.length; i++) {
            const pointX = this.scaleValue(this.data.labels[i].getTime(), scales.x);
            const distance = Math.abs(x - pointX);
            
            if (distance < minDistance && distance < 20) {
                minDistance = distance;
                closestIndex = i;
            }
        }

        if (closestIndex >= 0) {
            this.showTooltip(e, closestIndex);
        } else {
            this.hideTooltip();
        }
    }

    // Show tooltip
    showTooltip(e, dataIndex) {
        if (!this.tooltip) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'chart-tooltip';
            this.tooltip.style.cssText = `
                position: absolute;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 1000;
                white-space: nowrap;
            `;
            document.body.appendChild(this.tooltip);
        }

        const date = this.data.labels[dataIndex];
        const temp = this.data.temp[dataIndex];
        const hum = this.data.hum[dataIndex];

        this.tooltip.innerHTML = `
            <div><strong>${date.toLocaleString()}</strong></div>
            <div>Temperature: ${temp.toFixed(1)}°C</div>
            <div>Humidity: ${hum.toFixed(1)}%</div>
        `;

        this.tooltip.style.left = (e.pageX + 10) + 'px';
        this.tooltip.style.top = (e.pageY - 10) + 'px';
        this.tooltip.style.display = 'block';
    }

    // Hide tooltip
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    // Render empty state
    renderEmptyState() {
        this.clearCanvas();
        
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = `${this.config.fontSize + 2}px ${this.config.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            'Sin datos disponibles',
            this.width / 2,
            this.height / 2
        );
    }
}

// Initialize chart when DOM is ready
let chartRenderer = null;

// Function to render chart (called from main.js)
function renderLineChart(canvasElement, data) {
    if (!chartRenderer) {
        chartRenderer = new ChartRenderer(canvasElement);
    }
    chartRenderer.renderLineChart(data);
}