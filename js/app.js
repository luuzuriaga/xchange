/**
 * X-Change Currency Converter
 * Vanilla JavaScript Implementation
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration & Constants ---
    const API_URL = 'https://cdn.moneyconvert.net/api/latest.json';
    const FALLBACK_URL = 'assets/fallback-rates.json';
    const MAX_HISTORY = 10;

    // --- State ---
    let state = {
        base: 'USD',
        rates: {},
        lastUpdated: null,
        history: JSON.parse(localStorage.getItem('xchange_history')) || []
    };

    // --- DOM Elements ---
    const amountInput = document.getElementById('amount');
    const fromSelect = document.getElementById('from-currency');
    const toSelect = document.getElementById('to-currency');
    const swapBtn = document.getElementById('swap-currencies');
    const resultDisplay = document.getElementById('result-display');
    const historyToggle = document.getElementById('history-toggle');
    const historyContent = document.getElementById('history-content');
    const historyList = document.getElementById('history-list');
    const updateTimeSpan = document.getElementById('update-time');
    const loader = document.getElementById('loader');

    // --- Initialization ---
    async function init() {
        showLoader(true);
        try {
            await fetchRates();
            populateCurrencies();
            setInitialCurrencies();
            setupEventListeners();
            renderHistory();
            performConversion(); // Initial conversion
        } catch (error) {
            console.error('Initialization failed:', error);
            showUserFeedback('Error al cargar la aplicación. Por favor, recarga.');
        } finally {
            showLoader(false);
        }
    }

    // --- API & Data Handling ---
    async function fetchRates() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            updateState(data);
        } catch (error) {
            console.warn('API Fetch failed, using fallback:', error);
            try {
                const fallbackResponse = await fetch(FALLBACK_URL);
                const fallbackData = await fallbackResponse.json();
                updateState(fallbackData);
                showUserFeedback('Usando datos locales (Sin conexión)');
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                throw fallbackError;
            }
        }
    }

    function updateState(data) {
        state.base = data.base;
        state.rates = data.rates;
        state.lastUpdated = new Date(data.ts || Date.now());

        // Add USD to rates if missing (since it's the base)
        if (!state.rates['USD']) state.rates['USD'] = 1;

        // Update UI timestamp
        const options = { dateStyle: 'medium', timeStyle: 'short' };
        updateTimeSpan.textContent = state.lastUpdated.toLocaleString(navigator.language, options);
    }

    function populateCurrencies() {
        const currencies = Object.keys(state.rates).sort();

        // Clean and fill selects
        [fromSelect, toSelect].forEach(select => {
            select.textContent = ''; // Clear options

            currencies.forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = `${code} - ${getCurrencyName(code)}`;
                select.appendChild(option);
            });
        });
    }

    function setInitialCurrencies() {
        let detectedFrom = 'EUR';
        try {
            const locale = navigator.language;
            const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).resolvedOptions().currency;

            // getTimezoneOffset() returns minutes (positive for West of UTC)
            // Peru is UTC-5, so offset is 300 minutes -> 300/60 = 5
            const offset = new Date().getTimezoneOffset() / 60;

            if (locale.includes('PE')) {
                detectedFrom = 'PEN';
            } else if (currency && currency !== 'USD') {
                detectedFrom = currency;
            } else if (locale.startsWith('es')) {
                // Heuristic for Spanish-speaking countries
                if (Math.abs(offset - 5) < 0.1) { // Peru, Colombia, Ecuador, Panama, etc.
                    detectedFrom = locale.includes('CO') ? 'COP' : 'PEN';
                } else if (Math.abs(offset - 4) < 0.1) { // Chile, Bolivia, etc.
                    detectedFrom = locale.includes('CL') ? 'CLP' : 'BOB';
                } else if (Math.abs(offset - 3) < 0.1) { // Argentina, Uruguay, etc.
                    detectedFrom = locale.includes('UY') ? 'UYU' : 'ARS';
                } else if (locale.includes('MX')) {
                    detectedFrom = 'MXN';
                } else if (locale.includes('ES')) {
                    detectedFrom = 'EUR';
                } else {
                    detectedFrom = 'EUR';
                }
            } else {
                detectedFrom = currency || 'EUR';
            }
        } catch (e) { console.warn('Detection failed'); }

        // Final safety check: if detected currency isn't in our list, fallback to EUR
        if (!state.rates[detectedFrom]) {
            detectedFrom = 'EUR';
        }

        fromSelect.value = detectedFrom;
        toSelect.value = 'USD';
    }

    // Helper for currency names
    function getCurrencyName(code) {
        const names = {
            'USD': 'Dólar Estadounidense',
            'EUR': 'Euro',
            'GBP': 'Libra Esterlina',
            'JPY': 'Yen Japonés',
            'MXN': 'Peso Mexicano',
            'ARS': 'Peso Argentino',
            'COP': 'Peso Colombiano',
            'CLP': 'Peso Chileno',
            'BRL': 'Real Brasileño',
            'CAD': 'Dólar Canadiense',
            'AUD': 'Dólar Australiano',
            'CHF': 'Franco Suizo',
            'CNY': 'Yuan Chino',
            'PEN': 'Sol Peruano',
            'UYU': 'Peso Uruguayo'
        };
        return names[code] || code;
    }

    // Helper for currency symbols
    function getCurrencySymbol(code) {
        const symbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥',
            'PEN': 'S/',
            'ARS': '$',
            'COP': '$',
            'CLP': '$',
            'MXN': '$',
            'BRL': 'R$',
            'CAD': '$',
            'AUD': '$',
            'CHF': 'CHF',
            'CNY': '¥'
        };
        return symbols[code] || code;
    }

    // --- Logic ---
    function updateCurrencySymbol() {
        const symbolSpan = document.querySelector('.currency-symbol');
        if (symbolSpan) {
            symbolSpan.textContent = getCurrencySymbol(fromSelect.value);
        }
    }

    function performConversion() {
        updateCurrencySymbol();
        const amount = parseFloat(amountInput.value);
        const from = fromSelect.value;
        const to = toSelect.value;

        if (isNaN(amount) || amount < 0) {
            updateResultUI(0, from, to, 0);
            return;
        }

        const rateFrom = state.rates[from];
        const rateTo = state.rates[to];

        const amountInUSD = amount / rateFrom;
        const result = amountInUSD * rateTo;
        const effectiveRate = rateTo / rateFrom;

        updateResultUI(amount, from, to, result, effectiveRate);
        addToHistory(amount, from, to, result, effectiveRate);
    }

    function updateResultUI(amount, from, to, result, rate) {
        const valSpan = resultDisplay.querySelector('.result-value');
        const codeSpan = resultDisplay.querySelector('.result-code');
        const textP = resultDisplay.querySelector('.conversion-text');
        const rateInfoP = resultDisplay.querySelector('.rate-info');

        const locale = navigator.language;
        valSpan.textContent = result.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        codeSpan.textContent = to;
        textP.textContent = `${amount.toLocaleString(locale)} ${getCurrencyName(from)} =`;
        rateInfoP.textContent = `1 ${from} = ${rate.toFixed(5)} ${to}`;
    }

    function addToHistory(amount, from, to, result, rate) {
        const lastEntry = state.history[0];
        if (lastEntry && lastEntry.amount === amount && lastEntry.from === from && lastEntry.to === to) return;

        const entry = {
            id: Date.now(),
            amount,
            from,
            to,
            result,
            rate,
            date: new Date().toLocaleString(navigator.language)
        };

        state.history.unshift(entry);
        if (state.history.length > MAX_HISTORY) state.history.pop();

        localStorage.setItem('xchange_history', JSON.stringify(state.history));
        renderHistory();
    }

    function renderHistory() {
        historyList.textContent = '';
        if (state.history.length === 0) {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.textContent = 'No hay conversiones recientes.';
            historyList.appendChild(li);
            return;
        }

        state.history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';

            const detailDiv = document.createElement('div');
            detailDiv.className = 'history-detail';

            const convP = document.createElement('p');
            convP.className = 'history-conversion';
            convP.textContent = `${item.amount.toLocaleString()} ${item.from} ➔ ${item.result.toLocaleString(navigator.language, { maximumFractionDigits: 2 })} ${item.to}`;

            const rateP = document.createElement('p');
            rateP.className = 'history-rate';
            rateP.textContent = `Tasa: 1 ${item.from} = ${item.rate.toFixed(4)} ${item.to}`;

            detailDiv.appendChild(convP);
            detailDiv.appendChild(rateP);

            const dateSpan = document.createElement('span');
            dateSpan.className = 'history-date';
            dateSpan.textContent = item.date;

            li.appendChild(detailDiv);
            li.appendChild(dateSpan);
            historyList.appendChild(li);
        });
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        amountInput.addEventListener('input', performConversion);
        fromSelect.addEventListener('change', performConversion);
        toSelect.addEventListener('change', performConversion);

        swapBtn.addEventListener('click', () => {
            const temp = fromSelect.value;
            fromSelect.value = toSelect.value;
            toSelect.value = temp;
            performConversion();
        });

        historyToggle.addEventListener('click', () => {
            historyContent.classList.toggle('hidden');
            historyToggle.classList.toggle('active');
        });
    }

    // --- UI Helpers ---
    function showLoader(show) {
        if (show) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    function showUserFeedback(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem;
            background: var(--primary-color); color: white;
            padding: 1rem 2rem; border-radius: 0.8rem;
            box-shadow: var(--shadow-lg); z-index: 3000;
            animation: fadeIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // --- Trend Chart ---
    async function fetchHistoricalData(from = 'USD', to = 'PEN') {
        const container = document.getElementById('chart-container');
        container.innerHTML = '<div class="chart-loader">Cargando tendencia...</div>';

        try {
            // Try real API first (Frankfurter)
            const latestRes = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
            if (latestRes.ok) {
                const latestData = await latestRes.json();
                const endDate = latestData.date;
                const actualLatestDate = new Date(endDate);
                const thirtyDaysAgo = new Date(actualLatestDate.getTime() - 30 * 24 * 60 * 60 * 1000);
                const startDate = thirtyDaysAgo.toISOString().split('T')[0];

                const response = await fetch(`https://api.frankfurter.app/${startDate}..${endDate}?from=${from}&to=${to}`);
                if (response.ok) {
                    const data = await response.json();
                    renderChart(data.rates, from, to);
                    return;
                }
            }
            throw new Error('Real API not available for this pair');
        } catch (error) {
            console.warn('Using simulated trend for', from, to);
            const simulatedRates = generateSimulatedHistory(from, to);
            renderChart(simulatedRates, from, to);
        }
    }

    function generateSimulatedHistory(from, to) {
        // Generate a realistic random walk based on current rate
        const currentRate = (state.rates[to] || 1) / (state.rates[from] || 1);
        const rates = {};
        const now = new Date();

        for (let i = 30; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            // Variance: +/- 1% total over 30 days
            const variance = 1 + (Math.random() - 0.5) * 0.02;
            const trend = 1 + (Math.sin(i / 5) * 0.01); // Subtle wave
            rates[date] = { [to]: currentRate * variance * trend };
        }
        return rates;
    }

    function renderChart(historicalRates, from, to) {
        const container = document.getElementById('chart-container');
        const pairDisplay = document.getElementById('chart-pair-text');
        pairDisplay.textContent = `${from} / ${to}`;

        const dates = Object.keys(historicalRates).sort();
        const values = dates.map(date => historicalRates[date][to]);

        if (values.length === 0) {
            container.innerHTML = '<div class="chart-loader">Sin datos para este periodo.</div>';
            return;
        }

        const min = Math.min(...values) * 0.999;
        const max = Math.max(...values) * 1.001;
        const range = max - min;

        const width = container.clientWidth;
        const height = container.clientHeight;
        const padding = 40;

        const points = values.map((val, i) => {
            const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((val - min) / range) * (height - 2 * padding);
            return { x, y, val, date: dates[i] };
        });

        const pathData = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
        const areaData = `${pathData} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`;

        const svg = `
            <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--primary-color)" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                
                <!-- Grid lines (Horizontal) -->
                <line class="chart-axis" x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" />
                <line class="chart-axis" x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" />
                <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
                
                <!-- Max/Min Labels -->
                <text class="chart-label" x="${padding - 5}" y="${padding}" text-anchor="end">${max.toFixed(2)}</text>
                <text class="chart-label" x="${padding - 5}" y="${height - padding}" text-anchor="end">${min.toFixed(2)}</text>
                
                <path class="chart-area" d="${areaData}" />
                <path class="chart-path" d="${pathData}" />
                
                ${points.map((p, i) => i % 5 === 0 || i === points.length - 1 ? `
                    <circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4" title="${p.date}: ${p.val.toFixed(4)}">
                        <title>${new Date(p.date).toLocaleDateString()}: ${p.val.toFixed(4)} ${to}</title>
                    </circle>
                    <text class="chart-label" x="${p.x}" y="${height - padding + 20}" text-anchor="middle">
                        ${new Date(p.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </text>
                ` : '').join('')}
            </svg>
        `;

        container.innerHTML = svg;
    }

    // Start
    init();

    // Initial chart load (USD to PEN as requested)
    setTimeout(() => fetchHistoricalData('USD', 'PEN'), 1000);
});
