//api openweather
// get geo data using city name => geo data outputs longitude and latitude
// => get weather data using long and lang => weather data is in json format => parse this and display

const cityInput = document.querySelector(".city-input");
const searchButton = document.querySelector(".search-btn");
const apikey = '9f85576d57ed7beda9e58eed5bc54048';

const DEFAULT_CITY = 'Manila';

let tempChart;

//this function is used when page is first loaded (laods default city = manila)
async function loadDefault(){
    try {
        const { lat, lon } = await getGeoData(DEFAULT_CITY);
        const defaultWeatherData = await getWeatherData(lat, lon);
        displayWeatherData(defaultWeatherData);
    } catch (err) {
        console.error('Failed to load default city:', err);
    }
}

//thus fyunction is used when search button is clicked
searchButton.addEventListener("click", async(event) => {
    event.preventDefault();

    try { //in the try block, textbox is trimmed 
        const city = cityInput.value.trim();

        if (!city) {
            alert("Please enter a city name");
            return;
        }

        // geodata returns latitude and longitude to get precise weather data
        const { lat, lon } = await getGeoData(city);

        // using longitiude and latitude as input, getWeatherData retyurns .json file containing weather data of the city
        const weatherData = await getWeatherData(lat, lon);
        
        displayWeatherData(weatherData);
    } catch (error) {
        alert(error.message);
    }
})

//if enter key is pressed then saerch 
cityInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchButton.click();
});

async function getGeoData(city){
    const geoResponse = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${apikey}`);

    if(!geoResponse.ok){
        throw new Error("Failed to fetch geo Data try again");//TODO: PUT ALERT IN EVERY ERROR
    }

    const geoData = await geoResponse.json(); //get json format of geo data (longitude and latitude)

    if(geoData.length === 0){
        throw new Error("city not found"); //if json returned is empty, city was not found
        //TODO: PUT ALERT IN EVERY ERROR
    }

    return { lat: geoData[0].lat, lon: geoData[0].lon }
}

async function getWeatherData(lat, lon){
    const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apikey}`)

    if(!weatherResponse.ok){
        throw new Error("Failed to fetch weather data please try again");//TODO: PUT ALERT IN EVERY ERROR
    }

    const weatherData = await weatherResponse.json();

    if(weatherData.length === 0){
        throw new Error("no weather data");
    }   

    return weatherData;
}

function displayWeatherData(weatherData){

    /* html classes:
    <p> date-today
    <h1> temperature-today
    <h1> weather-emoji-today
    <span> weather-description-today id = weatherDescToday
    
    <h1> current-city-text
    const tempData  = [];

    */

    let temperatureToday = weatherData.list[0].main.temp;
    let descriptionToday = weatherData.list[0].weather[0].main;
    let weatherEmoji = getWeatherEmoji(descriptionToday);

    let dateToday = weatherData.list[0].dt;//convert from unix to date
    dateToday = getDate(dateToday);

    // city/country info comes in the forecast response under weatherData.city
    const cityName = weatherData.city && weatherData.city.name ? weatherData.city.name : '';
    const countryCode = weatherData.city && weatherData.city.country ? weatherData.city.country : '';
    document.querySelector(".current-city-text").textContent = cityName + (countryCode ? `, ${countryCode}` : '');

    //For current weather card (top left most card)
    document.querySelector(".temperature-today").textContent = Math.trunc(temperatureToday - 273.15) + "°C";
    document.querySelector(".weather-emoji-today").textContent = weatherEmoji;
    document.querySelector(".weather-description-today").textContent = descriptionToday.charAt(0).toUpperCase() + descriptionToday.slice(1);
    document.querySelector(".date-today").textContent = dateToday;

    //For temp chart
    updateChartData(weatherData);

    //update 5day forecast
    update5DayForecast(weatherData);

    //update background image
    if(descriptionToday ===  'Mist' || descriptionToday ===  'Fog' || descriptionToday ===  'Haze'){
        document.body.style.background = "url('background-images/Fog.jpg') no-repeat center center";
        document.body.style.backgroundSize = 'cover';
    }else{
        document.body.style.background = `url('background-images/${descriptionToday}.jpg') no-repeat center center`;
        document.body.style.backgroundSize = 'cover';
    }
    
}

function getWeatherEmoji(string){ //using the descriptionToday variable, this gets the corresponding emoji
    const weatherIconMap = {
            'Thunderstorm': '⛈️ ', 
            'Drizzle':      '🌦️',
            'Rain':         '🌧️',
            'Snow':         '❄️',
            'Clear':        '☀️',
            'Clouds':       '🌥️',
            'Mist':         '🌫️',
            'Fog':          '🌫️',
            'Haze':         '🌫️',
        };    

    return weatherIconMap[string] || '🌤️';
}

function getDate(unixTime){

    let dateObj = new Date(unixTime * 1000);

    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    let dayOfWeek = dateObj.getDay();

    //since getDay() returns 0-6 need to convert this to string sunday - saturday
    const weeks = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    dayOfWeek = weeks[dayOfWeek];
    month = months[month];

    return `${dayOfWeek}, ${month} ${day}`;
}

//===================================
//chart data and initialization
function updateChartData(weatherData){
    const Next24Hours = weatherData.list.slice(0,8);

    const newLabels = Next24Hours.map(item =>{ //12 hour format labels
        const date = new Date(item.dt * 1000);
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; // convert 0 to 12
        return hours + ampm;
    });

    const newTempData = Next24Hours.map(item => Math.trunc(item.main.temp - 273.15));

    if (tempChart) {
        tempChart.data.labels = newLabels;
        tempChart.data.datasets[0].data = newTempData;
        
        const minTemp = Math.min(...newTempData) - 2;
        const maxTemp = Math.max(...newTempData) + 2;
        tempChart.options.scales.y.min = minTemp;
        tempChart.options.scales.y.max = maxTemp;

        tempChart.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // ensure the canvas element is ready and grab its 2D context
    const ctx = document.getElementById('tempChart').getContext('2d');

    // create a gradient using the canvas context
    const gradient = ctx.createLinearGradient(0,0,0,130);
    gradient.addColorStop(0,"rgba(255,255,255,0.02)");
    gradient.addColorStop(1,"rgba(255,255,255,0)");

    // assign to outer-scoped variable so it can be updated later
    tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ["--", "--", "--", "--", "--", "--", "--", "--"],
                datasets: [{
                    data: [0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: 'rgba(255,255,255,0.85)',
                    borderWidth: 2.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.42,
                    pointRadius: 5,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: 'rgba(255,255,255,0.5)',
                    pointBorderWidth: 1.5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#fff',
                }]
            },
            options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 22, right: 10, bottom: 0, left: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(20,20,20,0.9)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    titleFont:  { family: 'Montserrat', size: 11, weight: '600' },
                    bodyFont:   { family: 'Montserrat', size: 12, weight: '700' },
                    titleColor: 'rgba(255,255,255,0.6)',
                    bodyColor:  '#fff',
                    padding: 10,
                    callbacks: {
                        label: ctx => ' ' + ctx.raw + '°C'
                    }
                },

                datalabels: false
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.55)',
                        font: { family: 'Montserrat', size: 11, weight: '500' },
                        padding: 8,
                    }
                },
                y: {
                    display: false,
                    min: 20,
                    max: 32,
                }
            },
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            }
        },
        plugins: [{
            id: 'pointLabels',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                ctx.save();
                const dataset = data.datasets[0];
                const meta    = chart.getDatasetMeta(0);
                meta.data.forEach((point, i) => {
                    const val = dataset.data[i];
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.font      = '600 11px Montserrat, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(val, point.x, point.y - 12);
                });
                ctx.restore();
            }
        }]
    });
});
//================================================

function update5DayForecast(weatherData) {
    const cards = document.querySelectorAll(".day-card");
    
    // Jump by 8 indices to get a reading for each day regardless of time
    const indices = [0, 8, 16, 24, 32]; 

    indices.forEach((dataIndex, i) => {
        if (i >= cards.length) return;
        
        const entry = weatherData.list[dataIndex];
        const card = cards[i];

        if (entry) {
            const temp = Math.trunc(entry.main.temp - 273.15);
            const description = entry.weather[0].main;
            const dateStr = getDate(entry.dt); 
            const dayOfWeek = i === 0 ? "Today" : dateStr.split(',')[0];
            const emoji = getWeatherEmoji(description);

            card.querySelector(".title-card").textContent = dayOfWeek;
            card.querySelector(".emoji-card").textContent = emoji;
            card.querySelector(".temperature-card").textContent = temp + "°C";
            card.querySelector(".description-card").textContent = description;
        }
    });
}