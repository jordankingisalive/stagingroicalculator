// Global state
let uploadedData = null;
let config = {
    licenseCost: 32,
    professionalRate: 78,
    minutesPerAction: 6,
    analysisWeeks: 26,
    intelligentRecapActions: 0
};

// Initialize upload functionality
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileSelectBtn = document.getElementById('fileSelectBtn');

    // File select button
    fileSelectBtn.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Click to upload
    uploadArea.addEventListener('click', () => {
        if (event.target !== fileSelectBtn) {
            fileInput.click();
        }
    });

    // Config inputs
    document.getElementById('licensesCost').addEventListener('change', (e) => {
        config.licenseCost = parseFloat(e.target.value);
        if (uploadedData) renderResults();
    });

    document.getElementById('professionalRate').addEventListener('change', (e) => {
        config.professionalRate = parseFloat(e.target.value);
        if (uploadedData) renderResults();
    });

    // Minutes per action slider
    const minutesSlider = document.getElementById('minutesPerAction');
    const minutesOutput = document.getElementById('minutesValue');

    minutesSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        minutesOutput.textContent = `${value} min`;
        config.minutesPerAction = value;
        if (uploadedData) renderResults();
    });

    document.getElementById('analysisWeeks').addEventListener('change', (e) => {
        config.analysisWeeks = parseInt(e.target.value);
        if (uploadedData) renderResults();
    });

    document.getElementById('intelligentRecapActions').addEventListener('change', (e) => {
        config.intelligentRecapActions = parseInt(e.target.value) || 0;
        if (uploadedData) renderResults();
    });
});

// Handle file upload
function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
        showError('Please upload a CSV file');
        return;
    }

    showLoading();

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csvData = e.target.result;
            uploadedData = parseCSV(csvData);
            renderResults();
        } catch (error) {
            showError('Error processing file: ' + error.message);
        }
    };
    reader.onerror = () => {
        showError('Error reading file');
    };
    reader.readAsText(file);
}

// Parse CSV and flatten data structure in RAM
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
        throw new Error('CSV file appears to be empty');
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Parse rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }

    if (rows.length === 0) {
        throw new Error('No valid data rows found in CSV');
    }

    // Flatten and normalize data
    return flattenData(rows);
}

// Parse a single CSV line (handles commas in quotes)
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    return values.map(v => v.replace(/^"|"$/g, ''));
}

// Parse date from various formats
function parseDate(dateString) {
    if (!dateString) return null;

    const cleaned = dateString.trim();

    // ISO format: YYYY-MM-DD HH:MM:SS or YYYY-MM-DD
    const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
        return new Date(isoMatch[1], isoMatch[2] - 1, isoMatch[3]);
    }

    // Try MM/DD/YYYY or M/D/YYYY (en-US)
    const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usMatch) {
        return new Date(usMatch[3], usMatch[1] - 1, usMatch[2]);
    }

    // Try DD/MM/YYYY or D/M/YYYY (en-GB)
    const gbMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (gbMatch) {
        // Ambiguous - default to US format handled above
        return new Date(gbMatch[3], gbMatch[1] - 1, gbMatch[2]);
    }

    // Fallback to native Date parsing
    const parsed = new Date(cleaned);
    return isNaN(parsed.getTime()) ? null : parsed;
}

// Flatten data structure for analysis
function flattenData(rows) {
    const headers = Object.keys(rows[0]);

    // Detect WIDE format: columns like "2025-08-10 Enabled Users"
    const dateColumnPattern = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/;
    const dateMetricMap = {}; // { 'YYYY-MM-DD': { 'Enabled Users': colName, ... } }

    headers.forEach(h => {
        const match = h.match(dateColumnPattern);
        if (match) {
            const date = match[1];
            const metric = match[2];
            if (!dateMetricMap[date]) dateMetricMap[date] = {};
            dateMetricMap[date][metric] = h;
        }
    });

    const sortedDates = Object.keys(dateMetricMap).sort();
    const isWideFormat = sortedDates.length > 0;

    if (isWideFormat) {
        console.log(`Detected WIDE format CSV with ${sortedDates.length} date columns`);

        // Find the org/team column — first column that isn't date-prefixed
        const orgColumn = headers.find(h => !dateColumnPattern.test(h)) || headers[0];

        const orgWeeklyData = {};

        const flattenedData = rows
            .filter(row => {
                const orgName = (row[orgColumn] || '').trim();
                // Exclude empty rows and the pre-aggregated "Total" row
                return orgName && orgName.toLowerCase() !== 'total';
            })
            .map(row => {
                const orgName = (row[orgColumn] || '').trim();

                // For each org, find the most recent date where it actually has Enabled Users data.
                // Many orgs don't report in every week — using a fixed last-column would miss them.
                let bestDate = null;
                for (let i = sortedDates.length - 1; i >= 0; i--) {
                    const cols = dateMetricMap[sortedDates[i]];
                    const val = parseNumber(row[cols['Enabled Users']] || 0);
                    if (val > 0) {
                        bestDate = sortedDates[i];
                        break;
                    }
                }

                if (!bestDate) {
                    // No data for this org at all — return zeroes (will be filtered out below)
                    return { team: orgName, enabledUsers: 0, activeUsers: 0, weeklyActions: 0, monthlyActions: 0, engagement: 0, actionsPerUser: 0, powerUsers: 0 };
                }

                const bestCols = dateMetricMap[bestDate];
                const enabledUsers = parseNumber(row[bestCols['Enabled Users']] || 0);
                const activePercent = parseNumber(row[bestCols['% Active Users']] || 0);
                const actionsPerUser = parseNumber(row[bestCols['Avg Copilot Actions']] || 0);
                const powerUsersPercent = parseNumber(row[bestCols['% Power Users']] || 0);

                const activeUsers = Math.round((enabledUsers * activePercent) / 100);
                const weeklyActions = actionsPerUser * activeUsers;
                const monthlyActions = weeklyActions * 4.33;
                const powerUsersCount = Math.round((activeUsers * powerUsersPercent) / 100);

                // Build weekly history for this org (for peak week calculation)
                orgWeeklyData[orgName] = sortedDates
                    .map(date => {
                        const cols = dateMetricMap[date];
                        const actions = parseNumber(row[cols['Avg Copilot Actions']] || 0);
                        return { date: parseDate(date), actionsPerUser: actions };
                    })
                    .filter(w => w.date !== null && w.actionsPerUser > 0);

                return {
                    team: orgName,
                    enabledUsers,
                    activeUsers,
                    weeklyActions,
                    monthlyActions,
                    engagement: 0,
                    actionsPerUser,
                    powerUsers: powerUsersCount
                };
            })
            .filter(row => row.enabledUsers > 0 || row.activeUsers > 0);

        console.log(`Parsed ${flattenedData.length} organizations from wide format`);
        return { rows: flattenedData, mapping: {}, weeklyData: orgWeeklyData };
    }

    // --- LONG FORMAT fallback ---
    // Try to detect column names (flexible mapping)
    const columnMappings = {
        team: ['Team', 'Division', 'Department', 'Organization', 'Org', 'Team Name', 'Division Name', 'Organization (Aggregated)'],
        enabledUsers: ['Enabled Users', 'Licensed Users', 'Total Users', 'Enabled'],
        activeUsers: ['Active Users', 'Active', 'Users'],
        totalActions: ['Total Actions', 'Actions', 'Total Activity', 'Avg Copilot Actions'],
        monthlyActions: ['Monthly Actions', 'Monthly Activity', 'Actions (Monthly)'],
        engagement: ['Engagement %', 'Engagement', 'Engagement Rate', 'Engagement Percentage'],
        activeUsersPercent: ['% Active Users', 'Active Users %', 'Active %'],
        powerUsers: ['% Power Users', 'Power Users %', 'Power Users'],
        date: ['Date', 'Week', 'Period', 'Week Ending']
    };

    // Find matching columns
    const mapping = {};
    for (const [key, possibleNames] of Object.entries(columnMappings)) {
        for (const name of possibleNames) {
            const found = headers.find(h => h.toLowerCase().includes(name.toLowerCase()));
            if (found) {
                mapping[key] = found;
                break;
            }
        }
    }

    if (!mapping.team) {
        throw new Error('Could not find team/division column in CSV');
    }

    const hasDateColumn = !!mapping.date;
    const orgWeeklyData = {};

    if (hasDateColumn) {
        console.log('Detected LONG format CSV - aggregating by organization...');

        const orgGroups = {};
        rows.forEach(row => {
            const orgName = row[mapping.team];
            if (!orgName) return;
            if (!orgGroups[orgName]) orgGroups[orgName] = [];
            orgGroups[orgName].push(row);
        });

        const aggregatedRows = [];
        for (const [orgName, orgRows] of Object.entries(orgGroups)) {
            const rowsWithDates = orgRows.map(row => ({
                row: row,
                date: parseDate(row[mapping.date])
            })).filter(item => item.date !== null);

            if (rowsWithDates.length === 0) {
                aggregatedRows.push(orgRows[0]);
                continue;
            }

            rowsWithDates.sort((a, b) => b.date - a.date);

            orgWeeklyData[orgName] = rowsWithDates.map(item => ({
                date: item.date,
                actionsPerUser: parseNumber(item.row[mapping.totalActions] || 0)
            }));

            aggregatedRows.push(rowsWithDates[0].row);
        }

        console.log(`Aggregated ${rows.length} rows into ${aggregatedRows.length} organizations`);
        rows = aggregatedRows;
    }

    const flattenedData = rows
        .filter(row => {
            const orgName = (row[mapping.team] || '').trim();
            return orgName && orgName.toLowerCase() !== 'total';
        })
        .map(row => {
            let enabledUsers = parseNumber(row[mapping.enabledUsers] || 0);
            let activeUsers = parseNumber(row[mapping.activeUsers] || 0);

            if (mapping.activeUsersPercent && row[mapping.activeUsersPercent] && enabledUsers > 0) {
                const activePercent = parseNumber(row[mapping.activeUsersPercent]);
                if (activePercent > 0) {
                    activeUsers = Math.round((enabledUsers * activePercent) / 100);
                }
            }

            if (activeUsers === 0 && enabledUsers > 0) {
                activeUsers = enabledUsers;
            }

            const actionsPerUserPerWeek = parseNumber(row[mapping.totalActions] || 0);
            const weeklyActions = actionsPerUserPerWeek * activeUsers;
            const monthlyActions = weeklyActions * 4.33;

            let powerUsersCount = 0;
            if (mapping.powerUsers && row[mapping.powerUsers]) {
                const powerUsersPercent = parseNumber(row[mapping.powerUsers]);
                powerUsersCount = Math.round((activeUsers * powerUsersPercent) / 100);
            }

            return {
                team: row[mapping.team],
                enabledUsers,
                activeUsers,
                weeklyActions,
                monthlyActions,
                engagement: parseNumber(row[mapping.engagement] || 0),
                actionsPerUser: actionsPerUserPerWeek,
                powerUsers: powerUsersCount
            };
        })
        .filter(row => row.enabledUsers > 0 || row.activeUsers > 0);

    return { rows: flattenedData, mapping, weeklyData: orgWeeklyData };
}

// Parse number from string (handles percentages, commas, etc.)
function parseNumber(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;

    // Remove commas, spaces, and percentage signs
    const cleaned = value.toString().replace(/[,%\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

// Calculate all ROI metrics
function calculateMetrics(data) {
    const rows = data.rows;

    // Aggregate totals
    const totalEnabledUsers = rows.reduce((sum, row) => sum + row.enabledUsers, 0);
    const totalActiveUsers = rows.reduce((sum, row) => sum + row.activeUsers, 0);
    const totalWeeklyActions = rows.reduce((sum, row) => sum + row.weeklyActions, 0);
    const totalMonthlyActions = rows.reduce((sum, row) => sum + row.monthlyActions, 0);

    // Activation rate
    const activationRate = totalEnabledUsers > 0 ? (totalActiveUsers / totalEnabledUsers) * 100 : 0;

    // Average actions per user
    const avgActionsPerUser = totalActiveUsers > 0 ? totalWeeklyActions / totalActiveUsers : 0;

    // Power users — sum actual power user counts from each team
    const powerUsers = rows.reduce((sum, row) => sum + row.powerUsers, 0);
    const powerUserRate = totalEnabledUsers > 0 ? (powerUsers / totalEnabledUsers) * 100 : 0;

    // Monthly costs
    const monthlyCost = totalEnabledUsers * config.licenseCost;
    const annualCost = monthlyCost * 12;

    // ROI Calculations using configured minutes per action
    const minsPerAction = config.minutesPerAction;
    const hoursPerMonth = (totalMonthlyActions * minsPerAction) / 60;
    const valuePerMonth = hoursPerMonth * config.professionalRate;
    const annualValue = valuePerMonth * 12;
    const roiMultiple = monthlyCost > 0 ? (valuePerMonth / monthlyCost) : 0;

    // Weekly hours saved
    const weeklyHoursSaved = (totalWeeklyActions * minsPerAction) / 60;

    return {
        totalEnabledUsers,
        totalActiveUsers,
        activationRate,
        avgActionsPerUser,
        powerUsers,
        powerUserRate,
        totalWeeklyActions,
        totalMonthlyActions,
        weeklyHoursSaved,
        monthlyCost,
        annualCost,
        minsPerAction,
        hoursPerMonth,
        valuePerMonth,
        annualValue,
        roiMultiple
    };
}

// Render results page
function renderResults() {
    const metrics = calculateMetrics(uploadedData);
    const rows = uploadedData.rows;

    // Calculate Intelligent Recap values
    const INTELLIGENT_RECAP_HOURS_PER_ACTION = 0.5; // 30 minutes median meeting duration
    const recapHoursSaved = config.intelligentRecapActions * INTELLIGENT_RECAP_HOURS_PER_ACTION;
    const recapMonthlyValue = recapHoursSaved * config.professionalRate;
    const recapAnnualValue = recapMonthlyValue * 12;

    // Calculate values with Intelligent Recap
    const valuePerMonthWithRecap = metrics.valuePerMonth + recapMonthlyValue;
    const annualValueWithRecap = metrics.annualValue + recapAnnualValue;
    const roiMultipleWithRecap = valuePerMonthWithRecap / metrics.monthlyCost;

    const showRecap = config.intelligentRecapActions > 0;

    // Sort teams by monthly value using configured minutes per action
    const sortedTeams = rows.map(row => {
        const monthlyValue = (row.monthlyActions * config.minutesPerAction / 60) * config.professionalRate;
        const weeklyHours = (row.weeklyActions * config.minutesPerAction / 60);

        // Find peak performance week for this team
        let peakWeek = null;
        let peakActionsPerUser = row.actionsPerUser;

        if (uploadedData.weeklyData && uploadedData.weeklyData[row.team]) {
            const weeklyData = uploadedData.weeklyData[row.team];
            if (weeklyData.length > 0) {
                // Find the week with highest actionsPerUser
                const peak = weeklyData.reduce((max, week) =>
                    week.actionsPerUser > max.actionsPerUser ? week : max
                , weeklyData[0]);

                peakWeek = peak.date;
                peakActionsPerUser = peak.actionsPerUser;
            }
        }

        return {
            ...row,
            monthlyValue,
            weeklyHours,
            peakWeek,
            peakActionsPerUser
        };
    }).sort((a, b) => b.monthlyValue - a.monthlyValue);

    const html = `
        <div class="results-container">
            <header>
                <h1>M365 Copilot Productivity ROI Analysis Results</h1>
                <p class="subtitle">Based on ${rows.length} teams/divisions • ${config.analysisWeeks} weeks of data</p>
            </header>

            ${showRecap ? `
            <!-- Intelligent Recap Toggle -->
            <div class="recap-toggle-container" id="recapToggleContainer" style="display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 1rem; background: #f0f9ff; border-radius: 8px; margin: 1.5rem 0; border: 2px solid var(--copilot-blue);">
                <span class="recap-toggle-label" style="font-weight: 600; color: var(--dark-blue); font-size: 1rem;">Include Intelligent Recap in ROI:</span>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 60px; height: 30px;">
                    <input type="checkbox" id="recapToggleData" checked onchange="toggleRecapDisplayData()" style="opacity: 0; width: 0; height: 0;">
                    <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--copilot-blue); transition: 0.4s; border-radius: 30px;"></span>
                </label>
                <span class="recap-toggle-label" id="recapToggleStatusData" style="font-weight: 600; color: var(--dark-blue); font-size: 1rem;">Included</span>
            </div>

            <!-- Intelligent Recap Value Display -->
            <div class="recap-value-box" id="recapValueBoxData" style="background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border: 2px solid var(--copilot-blue); border-radius: 12px; padding: 1.5rem; margin: 1rem 0; text-align: center;">
                <h4 style="color: var(--copilot-blue); margin-bottom: 0.5rem; font-size: 0.95rem;">💡 Intelligent Recap Additional Value</h4>
                <div class="value" style="font-size: 2rem; font-weight: bold; color: var(--dark-blue);">$${recapMonthlyValue.toLocaleString(0)}/mo</div>
                <small>${config.intelligentRecapActions.toLocaleString()} actions × 0.5 hours each = ${recapHoursSaved.toLocaleString()} hours/mo</small>
            </div>
            ` : ''}

            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Enabled Users</div>
                    <div class="metric-value">${metrics.totalEnabledUsers.toLocaleString()}</div>
                    <div class="metric-sublabel">Licensed for Copilot</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Activation Rate</div>
                    <div class="metric-value">${metrics.activationRate.toFixed(1)}%</div>
                    <div class="metric-sublabel">${metrics.totalActiveUsers.toLocaleString()} active users</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Weekly Actions per User</div>
                    <div class="metric-value">${metrics.avgActionsPerUser.toFixed(1)}</div>
                    <div class="metric-sublabel">${metrics.totalWeeklyActions.toLocaleString()} total/week</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Weekly Hours Saved</div>
                    <div class="metric-value">${metrics.weeklyHoursSaved.toLocaleString(0)}</div>
                    <div class="metric-sublabel">Conservative estimate</div>
                </div>
            </div>

            <div class="roi-table-container">
                <h2>Productivity ROI Calculation</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Time Savings Assumption</th>
                            <th>Hours/Month</th>
                            <th>Monthly Value</th>
                            <th>Annual Value</th>
                            <th>Monthly ROI Multiple</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="highlight-row">
                            <td><strong>${metrics.minsPerAction} minutes per action</strong><br><small>Configurable setting</small></td>
                            <td>${metrics.hoursPerMonth.toLocaleString(0)} hrs</td>
                            <td id="dataMonthlyValue"
                                data-without-recap="$${metrics.valuePerMonth.toLocaleString(0)}"
                                data-with-recap="$${valuePerMonthWithRecap.toLocaleString(0)}">
                                ${showRecap ? `$${valuePerMonthWithRecap.toLocaleString(0)}` : `$${metrics.valuePerMonth.toLocaleString(0)}`}
                            </td>
                            <td id="dataAnnualValue"
                                data-without-recap="$${metrics.annualValue.toLocaleString(0)}"
                                data-with-recap="$${annualValueWithRecap.toLocaleString(0)}">
                                ${showRecap ? `$${annualValueWithRecap.toLocaleString(0)}` : `$${metrics.annualValue.toLocaleString(0)}`}
                            </td>
                            <td id="dataROIMultiple" style="color: var(--green); font-weight: bold;"
                                data-without-recap="${metrics.roiMultiple.toFixed(1)}x"
                                data-with-recap="${roiMultipleWithRecap.toFixed(1)}x">
                                ${showRecap ? `${roiMultipleWithRecap.toFixed(1)}x` : `${metrics.roiMultiple.toFixed(1)}x`}
                            </td>
                        </tr>
                        <tr>
                            <td colspan="5" style="background: var(--light-gray); padding: 1rem;">
                                <strong>Investment:</strong> $${metrics.monthlyCost.toLocaleString(0)}/month
                                ($${metrics.annualCost.toLocaleString(0)}/year) for ${metrics.totalEnabledUsers.toLocaleString()} licenses at $${config.licenseCost}/user/month<br>
                                <strong>Professional Rate:</strong> $${config.professionalRate}/hour (fully-loaded cost)<br>
                                <strong>Calculation:</strong> ${metrics.totalMonthlyActions.toLocaleString(0)} monthly actions × ${metrics.minsPerAction} min ÷ 60 × $${config.professionalRate}/hr = $${metrics.valuePerMonth.toLocaleString(0)}
                                ${showRecap ? `<br><strong>Intelligent Recap:</strong> ${config.intelligentRecapActions.toLocaleString()} actions × 0.5 hrs × $${config.professionalRate}/hr = $${recapMonthlyValue.toLocaleString(0)}/mo` : ''}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="leaderboard-container">
                <h2>Top 10 Teams by Value Generated</h2>
                ${sortedTeams.slice(0, 10).map((team, index) => `
                    <div class="leaderboard-item">
                        <div class="leaderboard-rank">${index + 1}</div>
                        <div class="leaderboard-name">${team.team}</div>
                        <div>
                            <span class="leaderboard-value">$${team.monthlyValue.toLocaleString(0)}/mo</span>
                            <span class="leaderboard-subvalue">${team.weeklyHours.toFixed(0)} hrs/week</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="leaderboard-container">
                <h2>All Teams Performance</h2>
                <table id="teamsTable" class="sortable-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="team" data-type="string">
                                Team/Division <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="activeUsers" data-type="number">
                                Active Users <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="powerUsers" data-type="number">
                                Power Users <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="weeklyActions" data-type="number">
                                Weekly Actions <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="actionsPerUser" data-type="number">
                                Actions/User <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="peakWeek" data-type="date">
                                Peak Performance Week <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="weeklyHours" data-type="number">
                                Weekly Hours <span class="sort-icon"></span>
                            </th>
                            <th class="sortable" data-column="monthlyValue" data-type="number">
                                Monthly Value <span class="sort-icon"></span>
                            </th>
                        </tr>
                    </thead>
                    <tbody id="teamsTableBody">
                        ${sortedTeams.map(team => {
                            const peakWeekDisplay = team.peakWeek
                                ? `${(team.peakWeek.getMonth() + 1).toString().padStart(2, '0')}/${team.peakWeek.getDate().toString().padStart(2, '0')}/${team.peakWeek.getFullYear()} (${team.peakActionsPerUser.toFixed(1)})`
                                : 'N/A';

                            return `
                            <tr>
                                <td data-value="${team.team}">${team.team}</td>
                                <td data-value="${team.activeUsers}">${team.activeUsers.toLocaleString(0)}</td>
                                <td data-value="${team.powerUsers}">${team.powerUsers} users</td>
                                <td data-value="${team.weeklyActions}">${team.weeklyActions.toLocaleString(0)}</td>
                                <td data-value="${team.actionsPerUser}">${team.actionsPerUser.toFixed(1)}</td>
                                <td data-value="${team.peakWeek ? team.peakWeek.getTime() : 0}">${peakWeekDisplay}</td>
                                <td data-value="${team.weeklyHours}">${team.weeklyHours.toFixed(0)}</td>
                                <td data-value="${team.monthlyValue}"><strong>$${team.monthlyValue.toLocaleString(0)}</strong></td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>

            <div class="info-box" style="margin-top: 2rem;">
                <strong>Calculation Methodology</strong>
                <p>
                    • <strong>Time savings:</strong> ${metrics.minsPerAction} minutes saved per Copilot action (adjustable 1-15 min)<br>
                    • <strong>Professional rate:</strong> $${config.professionalRate}/hour fully-loaded cost (salary + benefits + overhead)<br>
                    • <strong>Analysis period:</strong> ${config.analysisWeeks} weeks of actual usage data<br>
                    • <strong>Productivity ROI Multiple:</strong> Monthly productivity value ÷ monthly license cost<br>
                    • <strong>Reference:</strong> Microsoft research suggests 6 min average; adjust based on your use cases<br>
                    • All data processed locally in your browser - no data transmitted to servers
                </p>
            </div>

            <div style="text-align: center; margin-top: 2rem;">
                <button class="btn-primary" onclick="location.reload()">Analyze Another File</button>
                <button class="btn-secondary" onclick="window.print()">Print Report</button>
                <button class="btn-secondary" onclick="exportToPDF()">Export to PDF</button>
            </div>
        </div>
    `;

    document.getElementById('loadingState').style.display = 'none';
    document.querySelector('.container').innerHTML = html;

    // Initialize table sorting after rendering
    initTableSorting();
}

// Initialize table sorting functionality
function initTableSorting() {
    const table = document.getElementById('teamsTable');
    if (!table) return;

    const headers = table.querySelectorAll('th.sortable');
    let currentSort = { column: null, direction: 'asc' };

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-column');
            const type = header.getAttribute('data-type');

            // Toggle direction if clicking same column, otherwise default to desc
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.direction = 'desc';
            }
            currentSort.column = column;

            // Sort the table
            sortTable(column, type, currentSort.direction);

            // Update visual indicators
            headers.forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
                const icon = h.querySelector('.sort-icon');
                icon.textContent = '';
            });

            header.classList.add(`sort-${currentSort.direction}`);
            const icon = header.querySelector('.sort-icon');
            icon.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
        });
    });
}

// Sort table by column
function sortTable(column, type, direction) {
    const tbody = document.getElementById('teamsTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
        const aCell = a.querySelector(`td[data-value]`);
        const bCell = b.querySelector(`td[data-value]`);

        // Get the data-value attributes based on column position
        const columnIndex = getColumnIndex(column);
        const aValue = a.children[columnIndex].getAttribute('data-value');
        const bValue = b.children[columnIndex].getAttribute('data-value');

        let comparison = 0;

        if (type === 'number' || type === 'date') {
            const aNum = parseFloat(aValue) || 0;
            const bNum = parseFloat(bValue) || 0;
            comparison = aNum - bNum;
        } else {
            // string comparison
            comparison = aValue.localeCompare(bValue);
        }

        return direction === 'asc' ? comparison : -comparison;
    });

    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
}

// Get column index from column name
function getColumnIndex(column) {
    const columnMap = {
        'team': 0,
        'activeUsers': 1,
        'powerUsers': 2,
        'weeklyActions': 3,
        'actionsPerUser': 4,
        'peakWeek': 5,
        'weeklyHours': 6,
        'monthlyValue': 7
    };
    return columnMap[column] || 0;
}

// Show loading state
function showLoading() {
    document.querySelector('.instructions-section').style.display = 'none';
    document.getElementById('loadingState').style.display = 'block';
    document.getElementById('errorState').style.display = 'none';
}

// Show error state
function showError(message) {
    document.querySelector('.instructions-section').style.display = 'none';
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// Toggle Intelligent Recap display for Data Analysis
function toggleRecapDisplayData() {
    const toggle = document.getElementById('recapToggleData');
    const statusText = document.getElementById('recapToggleStatusData');
    const isIncluded = toggle.checked;

    // Update status text
    statusText.textContent = isIncluded ? 'Included' : 'Excluded';

    // Get all elements that need updating
    const elementsToUpdate = [
        'dataMonthlyValue',
        'dataAnnualValue',
        'dataROIMultiple'
    ];

    // Update each element based on toggle state
    elementsToUpdate.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const valueToShow = isIncluded ?
                element.getAttribute('data-with-recap') :
                element.getAttribute('data-without-recap');
            element.textContent = valueToShow;
        }
    });
}
