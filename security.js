// Security utilities for client-side protection
class SecurityUtils {
    /**
     * Sanitize text content to prevent XSS
     * @param {string} text - Text to sanitize
     * @returns {string} - Sanitized text
     */
    static sanitizeText(text) {
        if (typeof text !== 'string') return '';
        
        // Create a temporary div to leverage browser's text parsing
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Validate URL to prevent malicious redirects
     * @param {string} url - URL to validate
     * @returns {boolean} - Whether URL is safe
     */
    static isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            // Only allow http/https protocols
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }
    
    /**
     * Validate user input for length and content
     * @param {string} input - Input to validate
     * @param {number} maxLength - Maximum allowed length
     * @returns {boolean} - Whether input is valid
     */
    static validateInput(input, maxLength = 1000) {
        if (typeof input !== 'string') return false;
        if (input.length > maxLength) return false;
        
        // Check for potentially malicious patterns
        const maliciousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i,
            /<embed/i
        ];
        
        return !maliciousPatterns.some(pattern => pattern.test(input));
    }
    
    /**
     * Rate limiting for client-side operations
     */
    static createRateLimiter(maxRequests = 5, windowMs = 60000) {
        const requests = [];
        
        return function() {
            const now = Date.now();
            // Remove old requests outside the window
            while (requests.length > 0 && requests[0] < now - windowMs) {
                requests.shift();
            }
            
            if (requests.length >= maxRequests) {
                return false; // Rate limit exceeded
            }
            
            requests.push(now);
            return true; // Request allowed
        };
    }
}

// Export for use in other scripts
window.SecurityUtils = SecurityUtils;

console.log('🔒 Security utilities loaded');