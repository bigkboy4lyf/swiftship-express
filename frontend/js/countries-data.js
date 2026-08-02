// =============================================
// WORLD COUNTRY DATA (shared by quote.html and the dashboard Get Quote tab)
// =============================================
// ISO 3166-1 alpha-2 codes + common names, plus a short, editable list of
// destinations our carrier network currently serves with limited/reduced
// capacity. That second list is intentionally small and easy to update here
// in one place rather than scattered across forms.

const ALL_COUNTRIES = [
    ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'],
    ['AO', 'Angola'], ['AG', 'Antigua and Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'],
    ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'],
    ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'],
    ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BT', 'Bhutan'],
    ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'],
    ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
    ['CV', 'Cabo Verde'], ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'],
    ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'],
    ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'Congo (DRC)'],
    ['CR', 'Costa Rica'], ['CI', "Cote d'Ivoire"], ['HR', 'Croatia'], ['CU', 'Cuba'],
    ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['DJ', 'Djibouti'],
    ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt'],
    ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'],
    ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FJ', 'Fiji'], ['FI', 'Finland'],
    ['FR', 'France'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'],
    ['DE', 'Germany'], ['GH', 'Ghana'], ['GR', 'Greece'], ['GD', 'Grenada'],
    ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
    ['HT', 'Haiti'], ['HN', 'Honduras'], ['HU', 'Hungary'], ['IS', 'Iceland'],
    ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'],
    ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'], ['JM', 'Jamaica'],
    ['JP', 'Japan'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'],
    ['KI', 'Kiribati'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'], ['LA', 'Laos'],
    ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LS', 'Lesotho'], ['LR', 'Liberia'],
    ['LY', 'Libya'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
    ['MG', 'Madagascar'], ['MW', 'Malawi'], ['MY', 'Malaysia'], ['MV', 'Maldives'],
    ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MR', 'Mauritania'],
    ['MU', 'Mauritius'], ['MX', 'Mexico'], ['FM', 'Micronesia'], ['MD', 'Moldova'],
    ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'], ['MA', 'Morocco'],
    ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NR', 'Nauru'],
    ['NP', 'Nepal'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'],
    ['NE', 'Niger'], ['NG', 'Nigeria'], ['MK', 'North Macedonia'], ['NO', 'Norway'],
    ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'], ['PA', 'Panama'],
    ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'],
    ['PL', 'Poland'], ['PT', 'Portugal'], ['QA', 'Qatar'], ['RO', 'Romania'],
    ['RU', 'Russia'], ['RW', 'Rwanda'], ['KN', 'Saint Kitts and Nevis'], ['LC', 'Saint Lucia'],
    ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'], ['SM', 'San Marino'],
    ['ST', 'Sao Tome and Principe'], ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'],
    ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SG', 'Singapore'], ['SK', 'Slovakia'],
    ['SI', 'Slovenia'], ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'],
    ['KR', 'South Korea'], ['SS', 'South Sudan'], ['ES', 'Spain'], ['LK', 'Sri Lanka'],
    ['SD', 'Sudan'], ['SR', 'Suriname'], ['SE', 'Sweden'], ['CH', 'Switzerland'],
    ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'],
    ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TO', 'Tonga'],
    ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Turkey'], ['TM', 'Turkmenistan'],
    ['TV', 'Tuvalu'], ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'],
    ['GB', 'United Kingdom'], ['US', 'United States'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'],
    ['VU', 'Vanuatu'], ['VA', 'Vatican City'], ['VE', 'Venezuela'], ['VN', 'Vietnam'],
    ['YE', 'Yemen'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe']
];

// Destinations our network currently ships to with limited or reduced
// capacity (carrier delays, customs holds, partial coverage). Shown with a
// warning marker in the dropdown rather than hidden -- customers can still
// select them, they just know to expect longer handling. Edit this array to
// change which codes are flagged; nothing else needs to change.
const LIMITED_SERVICE_COUNTRIES = new Set(['CU', 'IR', 'KP', 'SY', 'RU', 'BY', 'MM', 'AF', 'YE', 'SO', 'SS', 'SD', 'LY']);

function isLimitedServiceCountry(code) {
    return LIMITED_SERVICE_COUNTRIES.has(String(code || '').toUpperCase());
}

// Reserved payment-account code for the one "parent" bank transfer account
// that acts as the fallback for every destination without its own specific
// account (see admin-ui.js's Payment Accounts tab and dashboard-ui.js's Pay
// Now flow). Shared here since both pages need the exact same value.
const PARENT_ACCOUNT_CODE = 'PARENT';

function getCountryName(code) {
    const match = ALL_COUNTRIES.find(([c]) => c === String(code || '').toUpperCase());
    return match ? match[1] : (code || '');
}

// Fills a <select> with every country, alphabetically, flagging limited-
// service destinations with a warning marker + dedicated class so they can
// be styled or filtered differently from the rest of the list.
function populateCountrySelect(selectEl, placeholder) {
    if (!selectEl) return;

    const sorted = [...ALL_COUNTRIES].sort((a, b) => a[1].localeCompare(b[1]));
    const options = [`<option value="">${placeholder || 'Select country'}</option>`];

    sorted.forEach(([code, name]) => {
        const limited = isLimitedServiceCountry(code);
        const label = limited ? `⚠️ ${name} (Limited Service)` : name;
        options.push(
            `<option value="${code}"${limited ? ' class="limited-service-option" data-limited="true"' : ''}>${label}</option>`
        );
    });

    selectEl.innerHTML = options.join('');
}
