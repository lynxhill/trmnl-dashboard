export default async function handler(req, res) {

  const RSS_URL = process.env.RSS_URL;
  const WEATHER_KEY = process.env.WEATHER_KEY;
  const CITY = "Pori";

  function escapeHtml(str = "") {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  
  function simplifyMenuLine(line = "") {

  return line

    // poista allergeenit
    .replace(/\([^)]*\)/g, "")

    // poista tähdet
    .replace(/\*/g, "")

    // poista yleiset lisukkeet
    .replace(/,\s*Sitruunakastike/gi, "")
    .replace(/,\s*Sitrunakastike/gi, "")
    .replace(/,\s*Perunasose/gi, "")
    .replace(/,\s*Perunat/gi, "")
    .replace(/,\s*Riisi/gi, "")

    // siisti välit
    .replace(/\s+/g, " ")
    .trim();
    }

  async function safeFetch(url, timeout = 5000) {
    const controller = new AbortController();

    const id = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } finally {
      clearTimeout(id);
    }
  }

  async function fetchWeather() {
    try {

      const response = await safeFetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&lang=fi&appid=${WEATHER_KEY}`
      );

      const weather = await response.json();

      return {
        ok: true,
        name: weather?.name ?? CITY,
        icon: weather?.weather?.[0]?.icon ?? null,
        description: weather?.weather?.[0]?.description ?? "",
        temp: Math.round(weather?.main?.temp ?? 0),
        feelsLike: Math.round(weather?.main?.feels_like ?? 0),
        tempMin: Math.round(weather?.main?.temp_min ?? 0),
        tempMax: Math.round(weather?.main?.temp_max ?? 0),
        wind: weather?.wind?.speed ?? "-",
        humidity: weather?.main?.humidity ?? "-"
      };

    } catch (err) {

      console.error("Weather fetch failed:", err);

      return {
        ok: false,
        name: CITY
      };
    }
  }

  async function fetchHospitalMenu() {

    try {

      const response = await safeFetch(RSS_URL);

      const xml = await response.text();

      const firstItem =
        [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)][0];

      if (!firstItem) {
        return [];
      }

      const title =
        firstItem[1].match(/<title>(.*?)<\/title>/)?.[1] ?? "";

      let desc =
        firstItem[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";

      desc = desc.replace(/<!\[CDATA\[|\]\]>/g, "");
      desc = desc.replace(/<br\s*\/?>/gi, "\n");
      desc = desc.replace(/<[^>]+>/g, "");

      const lines = desc
        .split("\n")
        .map(x => simplifyMenuLine(x))
        .filter(Boolean);

      return [{
        title,
        lines
      }];

    } catch (err) {

      console.error("RSS fetch failed:", err);

      return [{
        title: "Tyrni",
        lines: ["Ruokalistaa ei saatavilla"]
      }];
    }
  }
    

    
  async function fetchDiakMenu() {

    try {

      const response = await safeFetch(
        "https://www.diakon.fi/juhla/lounas/"
      );

      const html = await response.text();

      const weekdays = [
        "sunnuntai",
        "maanantai",
        "tiistai",
        "keskiviikko",
        "torstai",
        "perjantai",
        "lauantai"
      ];

      const today = weekdays[new Date().getDay()];

      const blocks = [
        ...html.matchAll(
          /<div class="content-lunch">([\s\S]*?)<\/div><!-- \.content-lunch -->/g
        )
      ];

      const todayBlock = blocks.find(block =>
        block[1].toLowerCase().includes(`<h3>${today}`)
      );

      if (!todayBlock) {
        return ["Ruokalistaa ei löytynyt"];
      }

      const pTags = [
        ...todayBlock[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)
      ]
        .map(m =>
          m[1]
            .replace(/<[^>]+>/g, "")
            .trim()
        )
        .filter(Boolean);

      const start = pTags.findIndex(
        x => x === "Pihlajasali"
      );

      const end = pTags.findIndex(
        x => x.includes("********")
      );

      if (start === -1) {
        return ["Ruokalistaa ei löytynyt"];
      }

      return pTags.slice(
        start + 1,
        end > start ? end : undefined
      );

    } catch (err) {

      console.error("Diak fetch failed:", err);

      return ["Ruokalistaa ei saatavilla"];
    }
  }

  const [weather, hospitalMenu, diakMenu] =
    await Promise.all([
      fetchWeather(),
      fetchHospitalMenu(),
      fetchDiakMenu()
    ]);

  const iconUrl =
    weather.ok && weather.icon
      ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png`
      : null;

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

    .menu {
      width: 73%;
    }

    .section-title {
      font-size: 24px;
      margin-bottom: 15px;
    }

    .item {
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid black;
    }

    .title {
      font-weight: bold;
      font-size: 18px;
      margin-bottom: 6px;
    }

    .desc {
      font-size: 15px;
      line-height: 1.4;
      white-space: pre-line;
    }

    .weather {
      width: 20%;
      text-align: right;
      background: #DDDDDD;
      padding: 20px;
    }

    .location {
      font-size: 18px;
      font-weight: bold;
    }

    .icon {
      margin: 10px 0;
      background: #DDDDDD;
      padding: 10px;
    }

    .icon img {
      width: 100px;
      filter: grayscale(100%) contrast(200%);
    }

    .temp {
      font-size: 42px;
      font-weight: bold;
      margin: 10px 0;
    }

    .details {
      font-size: 13px;
      line-height: 1.5;
    }

    .diak {
      margin-top: 24px;
    }

    .diak ul {
      margin: 0;
      padding-left: 20px;
    }

    .diak li {
      margin-bottom: 6px;
      font-size: 15px;
    }

    .menu-list {
      margin: 0;
      padding-left: 18px;
    }

    .menu-list li {
      margin-bottom: 8px;
      font-size: 16px;
      line-height: 1.3;
    }

  </style>
  </head>

  <body>

    <div class="menu">

      <div class="section-title">
        Tyrni
      </div>

      ${hospitalMenu.map(item => `
        <div class="item">

          <div class="title">
            ${escapeHtml(item.title)}
          </div>

          <ul class="menu-list">
            ${item.lines.map(line => `
              <li>${escapeHtml(line)}</li>
            `).join("")}
          </ul>

        </div>
      `).join("")}

      <div class="diak">

        <div class="section-title">
          Pihlajasali
        </div>

        <ul>
          ${diakMenu.map(row => `
            <li>${escapeHtml(row)}</li>
          `).join("")}
        </ul>

      </div>

    </div>

    <div class="weather">

      <div class="location">
        ${escapeHtml(weather.name)}
      </div>

      ${iconUrl ? `
        <div class="icon">
          <img src="${iconUrl}" />
        </div>

        <div class="temp">
          ${weather.temp}°C
        </div>

        <div class="details">
          Tuntuu kuin: ${weather.feelsLike}°C<br>
          Min / Max: ${weather.tempMin}° / ${weather.tempMax}°<br>
          Tuuli: ${weather.wind} m/s<br>
          Kosteus: ${weather.humidity}%<br>
          ${escapeHtml(weather.description)}
        </div>
      ` : `
        <div class="details">
          Säätietoja ei saatavilla
        </div>
      `}

    </div>

  </body>
  </html>
  `);
}
