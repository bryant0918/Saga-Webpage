// config.js - Frontend configuration management
class AppConfig {
    constructor() {
        this.config = null;
    }

    getConfig() {
        if (this.config) {
            return this.config;
        }

        // Check if APP_CONFIG is loaded
        if (!window.APP_CONFIG || !window.APP_CONFIG.FAMILYSEARCH) {
            throw new Error('Configuration not loaded. Make sure app-config.js is included before this script.');
        }

        const fsConfig = window.APP_CONFIG.FAMILYSEARCH;
        
        // Auto-configure URLs based on environment
        const isProduction = fsConfig.ENVIRONMENT === 'production';
        
        this.config = {
            client_id: fsConfig.CLIENT_ID,
            redirect_uri: fsConfig.REDIRECT_URI,
            environment: fsConfig.ENVIRONMENT,
            base_url: isProduction ? 'https://ident.familysearch.org' : 'https://identbeta.familysearch.org',
            api_base_url: isProduction ? 'https://api.familysearch.org' : 'https://apibeta.familysearch.org',
            token_url: isProduction ? 'https://ident.familysearch.org/cis-web/oauth2/v3/token' : 'https://identbeta.familysearch.org/cis-web/oauth2/v3/token'
        };

        return this.config;
    }

    async exchangeToken(code, state) {
        try {
            const config = this.getConfig();
            
            // Exchange authorization code for access token directly with FamilySearch
            const tokenData = {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirect_uri,
                client_id: config.client_id
            };

            const response = await fetch(config.token_url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(tokenData)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('Token exchange failed:', errorData);
                throw new Error(`Token exchange failed: ${response.status}`);
            }

            const tokenResponse = await response.json();
            
            if (!tokenResponse.access_token) {
                throw new Error('No access token received');
            }

            return {
                access_token: tokenResponse.access_token,
                expires_in: tokenResponse.expires_in || 3600
            };
            
        } catch (error) {
            console.error('Token exchange failed:', error);
            throw error;
        }
    }
}

// Create global instance
window.appConfig = new AppConfig();

// For backward compatibility
window.secureConfig = window.appConfig;
