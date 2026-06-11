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

    // siisti otsikot
    .replace(/^Lounas\s*1\s*:/i, "1: ")
    .replace(/^Lounas\s*2\s*:/i, "2: ")
    .replace(/^Kasvislounas\s*:/i, "Kasvis: ")
    .replace(/^Salaattilounas\s*:/i, "Salaatti: ")
    .replace(/^Jälkiruoka\s*:/i, "Jälkiruoka: ")
    .replace(/^Kahvio\s+Mocca\s+annossalaatti\s*:/i, "Mocca: ")
    
    // poista yleiset lisukkeet
    //.replace(/,\s*Sitruunakastike/gi, "")
    // .replace(/,\s*lounas/gi, "")
    // .replace(/,\s*Lounas/gi, "")
    //.replace(/,\s*Perunasose/gi, "")
    //.replace(/,\s*Perunat/gi, "")
    //.replace(/,\s*Riisi/gi, "")

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
    


  async function fetchNesteMenu() {

    try {

      const response = await safeFetch(
        "https://www.nestetiilimaki.fi/"
      );

      const html = await response.text();

      const dayMap = {
        1: "MA",
        2: "TI",
        3: "KE",
        4: "TO",
        5: "PE",
        6: "LA",
        0: "SU"
      };

      const today = dayMap[new Date().getDay()];

      const richTextMatch = html.match(
        /<div class="rich-text-block w-richtext">([\s\S]*?)<\/div>/
      );

      if (!richTextMatch) {
        return ["Ruokalistaa ei löytynyt"];
      }

      const pTags = [
        ...richTextMatch[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)
      ]
        .map(m =>
          m[1]
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .trim()
        )
        .filter(Boolean);

      const weekdays = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];

      const start = pTags.findIndex(
        x => x.trim() === today
      );

      if (start === -1) {
        return ["Ruokalistaa ei löytynyt"];
      }

      let end = pTags.length;

      for (let i = start + 1; i < pTags.length; i++) {
        if (weekdays.includes(pTags[i].trim())) {
          end = i;
          break;
        }
      }

      return pTags
        .slice(start + 1, end)

        // poista allergeenit
        .map(line =>
          line
            .replace(/\([^)]*\)/g, "")
            .replace(/\s+/g, " ")
            .trim()
        )

        // poista tyhjät
        .filter(Boolean)

        // poista tarjoukset
        .filter(line =>
          !line.toLowerCase().includes("viikon tarjous")
        )

        // poista tekniset rivit
        .filter(line =>
          !line.toLowerCase().includes("keittiöllä on oikeus")
        );

    } catch (err) {

      console.error("Neste menu failed:", err);

      return ["Ruokalistaa ei saatavilla"];
    }
  }
    

  const [weather, hospitalMenu, nesteMenu] =
    await Promise.all([
      fetchWeather(),
      fetchHospitalMenu(),
      fetchNesteMenu()
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
      padding: 20px;
      display: flex;
      justify-content: space-between;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 10px;
    }  

    .section-title {
      font-size: 24px;
      margin: 0;
    }

    .menu-date {
      font-size: 18px;
      font-weight: bold;
    }

    .menu {
      width: 75%;
    }

    .section-title {
      font-size: 24px;
      margin-bottom: 13px;
    }

    .item {
      margin-bottom: 13px;
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
      width: 17%;
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
      margin-top: 16px;
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
      padding-left: 10px;
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

      ${hospitalMenu.map(item => `
        <div class="section-title">
          Tyrni · ${escapeHtml(item.title)}
        </div>

        <div class="item">

          <ul class="menu-list">
            ${item.lines.map(line => `
              <li>${escapeHtml(line)}</li>
            `).join("")}
          </ul>

        </div>
      `).join("")}

      <div class="diak">

        <div class="section-title">
          Neste Tiilimäki
        </div>

        <ul>
          ${nesteMenu.map(row => `
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
