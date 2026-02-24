export default async function handler(req, res) {

  const ICS_URL = process.env.ICS_URL;
  const WEATHER_KEY = process.env.WEATHER_KEY;
  const CITY = "Pori";

  // --- FETCH WEATHER ---
  const weatherRes = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&appid=${WEATHER_KEY}`
  );
  const weather = await weatherRes.json();

  // --- FETCH CALENDAR ---
  const icsRes = await fetch(ICS_URL);
  const icsText = await icsRes.text();

  // --- PARSE EVENTS ---
  const eventBlocks = [...icsText.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)];

  const events = eventBlocks.map(block => {
    const summary = block[1].match(/SUMMARY:(.*)/)?.[1] ?? "Tapahtuma";
    const dtStartRaw = block[1].match(/DTSTART.*:(.*)/)?.[1] ?? "";
    const dtEndRaw = block[1].match(/DTEND.*:(.*)/)?.[1] ?? "";

    function parseICSDate(raw) {
      const year = raw.substring(0,4);
      const month = raw.substring(4,6);
      const day = raw.substring(6,8);
      const hour = raw.length > 8 ? raw.substring(9,11) : "00";
      const min = raw.length > 8 ? raw.substring(11,13) : "00";
      return new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
    }

    return {
      summary,
      start: parseICSDate(dtStartRaw),
      end: parseICSDate(dtEndRaw)
    };
  });

  // --- CALCULATE CURRENT WORK WEEK (Mon–Fri) ---
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // Monday=0
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek);

  const workDays = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    workDays.push(d);
  }

  // --- BUILD HTML FOR WEEK ---
  const weekHtml = workDays.map(day => {

    const dayEvents = events
      .filter(e =>
        e.start.getFullYear() === day.getFullYear() &&
        e.start.getMonth() === day.getMonth() &&
        e.start.getDate() === day.getDate()
      )
      .sort((a,b) => a.start - b.start);

    return `
      <div class="day">
        <div class="day-header">
          ${day.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" })}
        </div>

        ${dayEvents.length === 0 ? 
          `<div class="empty">–</div>` :
          dayEvents.map(e => `
            <div class="event">
              <div class="time">
                ${e.start.toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"})}
              </div>
              <div class="title">${e.summary}</div>
            </div>
          `).join("")
        }
      </div>
    `;
  }).join("");

  res.setHeader("Content-Type", "text/html");

  res.send(`
  <html>
  <head>
  <style>
    body {
      font-family: sans-serif;
      padding: 30px;
      display: flex;
      justify-content: space-between;
    }

    .calendar {
      width: 65%;
    }

    .week {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-top: 15px;
    }

    .day {
      border: 2px solid black;
      padding: 10px;
      min-height: 250px;
    }

    .day-header {
      font-weight: bold;
      margin-bottom: 10px;
      border-bottom: 2px solid black;
      padding-bottom: 5px;
    }

    .event {
      margin-bottom: 8px;
    }

    .time {
      font-size: 12px;
      font-weight: bold;
    }

    .title {
      font-size: 14px;
    }

    .empty {
      color: #666;
      font-style: italic;
    }

    .weather {
      width: 30%;
      text-align: right;
    }

    .temp {
      font-size: 52px;
      font-weight: bold;
      margin-top: 20px;
    }
  </style>
  </head>
  <body>

    <div class="calendar">
      <h2>Työviikko</h2>
      <div class="week">
        ${weekHtml}
      </div>
    </div>

    <div class="weather">
      <h2>${weather.name}</h2>
      <div class="temp">${Math.round(weather.main.temp)}°C</div>
      <div>${weather.weather[0].description}</div>
    </div>

  </body>
  </html>
  `);
}
