class SatelliteTracker {
    constructor() {
        this.map = null;
        this.satellites = [];
        this.trackedSatellites = new Set();
        this.markers = new Map();
        this.selectedSatellite = null;
        this.autoUpdateInterval = null;
        this.isAutoUpdate = true;
        this.orbitPaths = new Map();
        
        this.initializeMap();
        this.loadSatellites();
        this.setupEventListeners();
        
        // Start auto-update
        this.startAutoUpdate();
    }
    
    initializeMap() {
        // Initialize Leaflet map
        this.map = L.map('map').setView([0, 0], 2);
        
        // Add tile layer (dark theme)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            maxZoom: 18,
        }).addTo(this.map);
        
        // Add Earth layer with clouds
        L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid={apiKey}', {
            attribution: '©OpenWeatherMap',
            maxZoom: 18,
            opacity: 0.5,
            apiKey: 'your_api_key_here' // Replace with your OpenWeatherMap API key
        }).addTo(this.map);
    }
    
    async loadSatellites() {
        try {
            const response = await fetch('http://localhost:3000/api/satellites');
            this.satellites = await response.json();
            this.displaySatelliteList();
            document.getElementById('satCount').textContent = this.satellites.length;
            
            if (this.satellites.length > 0) {
                // Auto-track ISS if available
                const iss = this.satellites.find(sat => sat.name.includes('ISS'));
                if (iss) {
                    this.selectSatellite(iss);
                }
            }
        } catch (error) {
            console.error('Error loading satellites:', error);
            this.showNotification('Error loading satellite data', 'error');
        }
    }
    
    displaySatelliteList() {
        const listContainer = document.getElementById('satelliteList');
        listContainer.innerHTML = '';
        
        this.satellites.forEach(satellite => {
            const item = document.createElement('div');
            item.className = 'satellite-item';
            if (this.selectedSatellite && this.selectedSatellite.name === satellite.name) {
                item.classList.add('selected');
            }
            
            item.innerHTML = `
                <div class="satellite-name">${satellite.name}</div>
                <div class="satellite-id">${satellite.tle1.substring(2, 7)}</div>
            `;
            
            item.addEventListener('click', () => this.selectSatellite(satellite));
            listContainer.appendChild(item);
        });
    }
    
    selectSatellite(satellite) {
        this.selectedSatellite = satellite;
        this.displaySatelliteList();
        this.updateSatelliteInfo(satellite);
        this.trackSatellite(satellite);
    }
    
    updateSatelliteInfo(satellite) {
        const infoContainer = document.getElementById('satelliteInfo');
        infoContainer.innerHTML = `
            <div class="satellite-detail">
                <span class="label">Name:</span>
                <span class="value">${satellite.name}</span>
            </div>
            <div class="satellite-detail">
                <span class="label">Catalog Number:</span>
                <span class="value">${satellite.tle1.substring(2, 7)}</span>
            </div>
            <div class="satellite-detail">
                <span class="label">Classification:</span>
                <span class="value">${satellite.tle1.charAt(7) === 'U' ? 'Unclassified' : 'Classified'}</span>
            </div>
            <div class="satellite-detail">
                <span class="label">Launch Year:</span>
                <span class="value">${satellite.tle1.substring(9, 11)}</span>
            </div>
            <div class="satellite-detail">
                <span class="label">Inclination:</span>
                <span class="value">${parseFloat(satellite.tle2.substring(8, 16)).toFixed(2)}°</span>
            </div>
        `;
    }
    
    async trackSatellite(satellite) {
        try {
            const response = await fetch('http://localhost:3000/api/satellite/position', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(satellite)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addSatelliteMarker(data.position, satellite.name);
                this.trackedSatellites.add(satellite.name);
                this.updateTrackedCount();
                
                // Center map on satellite if it's the only one being tracked
                if (this.trackedSatellites.size === 1) {
                    this.map.setView([data.position.latitude, data.position.longitude], 4);
                }
            }
        } catch (error) {
            console.error('Error tracking satellite:', error);
        }
    }
    
    async trackAllSatellites() {
        if (this.satellites.length === 0) return;
        
        // Limit to 20 satellites for performance
        const satellitesToTrack = this.satellites.slice(0, 20);
        
        try {
            const response = await fetch('http://localhost:3000/api/satellites/positions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ satellites: satellitesToTrack })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Clear existing markers
                this.clearMarkers();
                
                // Add new markers
                data.positions.forEach(position => {
                    this.addSatelliteMarker(position, position.name);
                    this.trackedSatellites.add(position.name);
                });
                
                this.updateTrackedCount();
                this.updateLastUpdateTime();
                this.showNotification(`Tracking ${data.positions.length} satellites`, 'success');
            }
        } catch (error) {
            console.error('Error tracking all satellites:', error);
            this.showNotification('Error tracking satellites', 'error');
        }
    }
    
    async trackISS() {
        try {
            const response = await fetch('http://localhost:3000/api/iss');
            const data = await response.json();
            
            if (data.success) {
                // Clear existing markers
                this.clearMarkers();
                
                // Add ISS marker
                this.addSatelliteMarker(data.position, data.name, true);
                this.trackedSatellites.clear();
                this.trackedSatellites.add(data.name);
                
                // Center on ISS
                this.map.setView([data.position.latitude, data.position.longitude], 4);
                
                this.updateTrackedCount();
                this.updateLastUpdateTime();
                this.showNotification('Now tracking International Space Station', 'success');
            }
        } catch (error) {
            console.error('Error tracking ISS:', error);
            this.showNotification('Error tracking ISS', 'error');
        }
    }
    
    addSatelliteMarker(position, name, isISS = false) {
        // Remove existing marker for this satellite
        if (this.markers.has(name)) {
            this.map.removeLayer(this.markers.get(name));
        }
        
        // Create custom icon
        const icon = L.divIcon({
            className: 'satellite-marker',
            html: `<div style="
                background: ${isISS ? 'radial-gradient(circle, #ff9900, #ff5500)' : 'radial-gradient(circle, #00d4ff, #0099ff)'};
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 10px ${isISS ? '#ff9900' : '#00d4ff'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
            ">${isISS ? 'ISS' : 'S'}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        // Create marker
        const marker = L.marker([position.latitude, position.longitude], { icon: icon })
            .addTo(this.map)
            .bindPopup(`
                <h3>${name}</h3>
                <p><strong>Latitude:</strong> ${position.latitude.toFixed(4)}°</p>
                <p><strong>Longitude:</strong> ${position.longitude.toFixed(4)}°</p>
                <p><strong>Altitude:</strong> ${(position.altitude / 1000).toFixed(2)} km</p>
                <p><strong>Time:</strong> ${new Date(position.timestamp).toLocaleTimeString()}</p>
            `);
        
        this.markers.set(name, marker);
        
        // Add orbit path if not exists
        if (!this.orbitPaths.has(name)) {
            this.orbitPaths.set(name, []);
        }
        
        // Add current position to orbit path
        const path = this.orbitPaths.get(name);
        path.push([position.latitude, position.longitude]);
        
        // Keep only last 50 positions for performance
        if (path.length > 50) {
            path.shift();
        }
        
        // Draw orbit path
        this.drawOrbitPath(name);
    }
    
    drawOrbitPath(name) {
        const path = this.orbitPaths.get(name);
        
        if (path.length >= 2) {
            // Remove existing path
            if (this.markers.has(`${name}_path`)) {
                this.map.removeLayer(this.markers.get(`${name}_path`));
            }
            
            // Create new path
            const polyline = L.polyline(path, {
                color: '#00ffaa',
                weight: 2,
                opacity: 0.6,
                dashArray: '5, 5'
            }).addTo(this.map);
            
            this.markers.set(`${name}_path`, polyline);
        }
    }
    
    clearMarkers() {
        // Remove all markers
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        
        this.markers.clear();
        this.trackedSatellites.clear();
        this.orbitPaths.clear();
        this.updateTrackedCount();
    }
    
    updateTrackedCount() {
        document.getElementById('trackedCount').textContent = 
            `Tracking: ${this.trackedSatellites.size} satellite${this.trackedSatellites.size !== 1 ? 's' : ''}`;
    }
    
    updateLastUpdateTime() {
        const now = new Date();
        document.getElementById('lastUpdate').textContent = 
            `Last update: ${now.toLocaleTimeString()}`;
    }
    
    startAutoUpdate() {
        if (this.autoUpdateInterval) {
            clearInterval(this.autoUpdateInterval);
        }
        
        this.autoUpdateInterval = setInterval(() => {
            if (this.isAutoUpdate && this.trackedSatellites.size > 0) {
                this.updateTrackedSatellites();
            }
        }, 5000); // Update every 5 seconds
    }
    
    async updateTrackedSatellites() {
        if (this.trackedSatellites.size === 0) return;
        
        // Get current tracked satellites
        const trackedSats = this.satellites.filter(sat => 
            this.trackedSatellites.has(sat.name)
        );
        
        if (trackedSats.length > 0) {
            try {
                const response = await fetch('http://localhost:3000/api/satellites/positions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ satellites: trackedSats })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    data.positions.forEach(position => {
                        this.addSatelliteMarker(position, position.name, position.name.includes('ISS'));
                    });
                    
                    this.updateLastUpdateTime();
                }
            } catch (error) {
                console.error('Error updating satellite positions:', error);
            }
        }
    }
    
    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadSatellites();
            this.showNotification('Refreshing satellite data...', 'info');
        });
        
        // Track ISS button
        document.getElementById('trackIssBtn').addEventListener('click', () => {
            this.trackISS();
        });
        
        // Track all button
        document.getElementById('trackAllBtn').addEventListener('click', () => {
            this.trackAllSatellites();
        });
        
        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearMarkers();
            this.showNotification('All markers cleared', 'warning');
        });
        
        // Auto update toggle
        document.getElementById('autoUpdateBtn').addEventListener('click', (e) => {
            this.isAutoUpdate = !this.isAutoUpdate;
            e.target.classList.toggle('active');
            e.target.innerHTML = this.isAutoUpdate ? 
                '<i class="fas fa-play"></i> Auto Update' : 
                '<i class="fas fa-pause"></i> Auto Update';
            
            this.showNotification(
                this.isAutoUpdate ? 'Auto-update enabled' : 'Auto-update disabled',
                'info'
            );
        });
        
        // Fullscreen button
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            const elem = document.getElementById('map').parentElement;
            if (!document.fullscreenElement) {
                elem.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });
        
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchSatellites();
        });
        
        document.getElementById('searchSatellite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchSatellites();
            }
        });
        
        // Handle fullscreen change
        document.addEventListener('fullscreenchange', () => {
            const btn = document.getElementById('fullscreenBtn');
            if (document.fullscreenElement) {
                btn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
            } else {
                btn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
            }
        });
    }
    
    searchSatellites() {
        const searchTerm = document.getElementById('searchSatellite').value.toLowerCase();
        const listContainer = document.getElementById('satelliteList');
        const items = listContainer.querySelectorAll('.satellite-item');
        
        items.forEach(item => {
            const satelliteName = item.querySelector('.satellite-name').textContent.toLowerCase();
            if (satelliteName.includes(searchTerm) || searchTerm === '') {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#ff416c' : type === 'success' ? '#00ffaa' : '#00d4ff'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Initialize the tracker when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const tracker = new SatelliteTracker();
    window.satelliteTracker = tracker; // Make available globally for debugging
    
    // Handle offline/online status
    window.addEventListener('online', () => {
        tracker.showNotification('Back online. Refreshing data...', 'success');
        tracker.loadSatellites();
    });
    
    window.addEventListener('offline', () => {
        tracker.showNotification('You are offline. Using cached data.', 'warning');
    });
});