// Currency configuration with symbols, codes, and formatting
const currencies = {
    USD: { symbol: '$', name: 'US Dollar', code: 'USD', locale: 'en-US' },
    EUR: { symbol: '€', name: 'Euro', code: 'EUR', locale: 'de-DE' },
    GBP: { symbol: '£', name: 'British Pound', code: 'GBP', locale: 'en-GB' },
    GHS: { symbol: '₵', name: 'Ghanaian Cedi', code: 'GHS', locale: 'en-GH' },
    NGN: { symbol: '₦', name: 'Nigerian Naira', code: 'NGN', locale: 'en-NG' },
    KES: { symbol: 'KSh', name: 'Kenyan Shilling', code: 'KES', locale: 'en-KE' },
    ZAR: { symbol: 'R', name: 'South African Rand', code: 'ZAR', locale: 'en-ZA' },
    JPY: { symbol: '¥', name: 'Japanese Yen', code: 'JPY', locale: 'ja-JP' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar', code: 'CAD', locale: 'en-CA' },
    AUD: { symbol: 'A$', name: 'Australian Dollar', code: 'AUD', locale: 'en-AU' },
    INR: { symbol: '₹', name: 'Indian Rupee', code: 'INR', locale: 'en-IN' },
    CNY: { symbol: '¥', name: 'Chinese Yuan', code: 'CNY', locale: 'zh-CN' },
};

/**
 * Format amount with currency
 * @param {number} amount 
 * @param {string} currencyCode 
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currencyCode = 'USD') {
    const currency = currencies[currencyCode] || currencies.USD;
    
    try {
        return new Intl.NumberFormat(currency.locale, {
            style: 'currency',
            currency: currency.code,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${currency.symbol}${amount.toFixed(2)}`;
    }
}

/**
 * Get currency symbol
 * @param {string} currencyCode 
 * @returns {string} Currency symbol
 */
function getCurrencySymbol(currencyCode = 'USD') {
    return currencies[currencyCode]?.symbol || '$';
}

/**
 * Get all available currencies
 * @returns {Array} List of currencies
 */
function getAvailableCurrencies() {
    return Object.entries(currencies).map(([code, config]) => ({
        code,
        symbol: config.symbol,
        name: config.name,
        locale: config.locale
    }));
}

module.exports = {
    currencies,
    formatCurrency,
    getCurrencySymbol,
    getAvailableCurrencies
};