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

  // Parse events
  const eventBlocks = [...icsText.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)];

  const events = eventBlocks.map(block => {
    const summary = block[1].match(/SUMMARY:(.*)/)?.[1] ?? "Tapahtuma";
    const dtRaw = block[1].match(/DTSTART.*:(.*)/)?.[1] ?? "";

    // Convert ICS date (YYYYMMDD or YYYYMMDDTHHmmss)
    const year = dtRaw.substring(0,4);
    const month = dtRaw.substring(4,6);
    const day = dtRaw.substring(6,8);

    return {
      summary,
      date: new Date(`${year}-${month}-${day}`)
    };
  });

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startWeekday = firstDay.getDay(); // 0=Sunday
  const totalDays = lastDay.getDate();

  // Build calendar grid
  let daysHtml = "";

  for (let i = 0; i < startWeekday; i++) {
    daysHtml += `<div class="empty"></div>`;
  }

  for (let d = 1; d <= totalDays; d++) {
    const currentDate = new Date(year, month, d);

    const hasEvent = events.some(e =>
      e.date.getFullYear() === currentDate.getFullYear() &&
      e.date.getMonth() === currentDate.getMonth() &&
      e.date.getDate() === currentDate.getDate()
    );

    const isToday =
      currentDate.toDateString() === today.toDateString();

    daysHtml += `
      <div class="day ${hasEvent ? "event" : ""} ${isToday ? "today" : ""}">
        ${d}
      </div>
    `;
  }

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
      width: 60%;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      margin-top: 10px;
    }

    .day {
      border: 1px solid black;
      padding: 10px;
      text-align: center;
    }

    .event {
      background: black;
      color: white;
    }

    .today {
      border: 3px solid black;
    }

    .empty {
      border: none;
    }

    .weather {
      width: 35%;
      text-align: right;
    }

    .temp {
      font-size: 48px;
      font-weight: bold;
    }
  </style>
  </head>
  <body>

    <div class="calendar">
      <h2>${today.toLocaleString("fi-FI", { month: "long", year: "numeric" })}</h2>
      <div class="grid">
        ${daysHtml}
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
