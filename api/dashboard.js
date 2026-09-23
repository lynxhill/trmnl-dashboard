
export default async function handler(req, res) {
  const RSS_URL = process.env.RSS_URL;
  const WEATHER_KEY = process.env.WEATHER_KEY;
  const CITY = "Pori";

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function simplifyMenuLine(line = "") {
    return line
      // Poista allergeenit
      .replace(/\([^)]*\)/g, "")
      // Poista tähdet
      .replace(/\*/g, "")
      // Siisti ruokalajien nimet
      .replace(/^Lounas\s*1\s*:/i, "1: ")
      .replace(/^Lounas\s*2\s*:/i, "2: ")
      .replace(/^Kasvislounas\s*:/i, "Kasvis: ")
      .replace(/^Salaattilounas\s*:/i, "Salaatti: ")
      .replace(/^Jälkiruoka\s*:/i, "Jälkiruoka: ")
      .replace(
        /^Kahvio\s+Mocca\s+annossalaatti\s*:/i,
        "Mocca: "
      )
      // Siisti välit
      .replace(/\s+/g, " ")
      .trim();
  }

  async function safeFetch(url, timeout = 5000) {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
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
      clearTimeout(timeoutId);
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
      if (!RSS_URL) {
        throw new Error("RSS_URL puuttuu ympäristömuuttujista");
      }

      const response = await safeFetch(RSS_URL);
      const xml = await response.text();

      const firstItem = [
        ...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
      ][0];

      if (!firstItem) {
        return [{
          title: "Tyrni",
          lines: ["Ruokalistaa ei saatavilla"]
        }];
      }

      const itemXml = firstItem[1];

      const title =
        itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";

      let description =
        itemXml.match(
          /<description>([\s\S]*?)<\/description>/
        )?.[1] ?? "";

      description = description
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n")
        .replace(/<[^>]+>/g, "");

      const lines = description
        .split(/\r?\n/)
        .map(simplifyMenuLine)
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

  /*
   * Ruokalajirivin tunnistus.
   * Palauttaa otsikon, kuvauksen ja tyyliluokan.
   */
  function parseMenuLine(line) {
    const patterns = [
      {
        regex: /^1:\s*/i,
        label: "Lounas 1",
        icon: "♨",
        type: "main"
      },
      {
        regex: /^2:\s*/i,
        label: "Lounas 2",
        icon: "♨",
        type: "main"
      },
      {
        regex: /^Kasvis:\s*/i,
        label: "Kasvis",
        icon: "♧",
        type: "vegetarian"
      },
      {
        regex: /^Salaatti:\s*/i,
        label: "Salaatti",
        icon: "❋",
        type: "salad"
      },
      {
        regex: /^Jälkiruoka:\s*/i,
        label: "Jälkiruoka",
        icon: "✿",
        type: "dessert"
      },
      {
        regex: /^Mocca:\s*/i,
        label: "Mocca",
        icon: "☕",
        type: "other"
      }
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        return {
          ...pattern,
          description: line.replace(pattern.regex, "").trim()
        };
      }
    }

    return {
      label: "",
      icon: "•",
      type: "other",
      description: line
    };
  }

  function renderMenuLine(line) {
    const item = parseMenuLine(line);

    return `
      <article class="menu-row ${item.type}">
        <div class="menu-icon" aria-hidden="true">
          ${item.icon}
        </div>

        <div class="menu-content">
          ${
            item.label
              ? `<div class="menu-label">${escapeHtml(item.label)}</div>`
              : ""
          }

          <div class="menu-description">
            ${escapeHtml(item.description)}
          </div>
        </div>
      </article>
    `;
  }

  const [weather, hospitalMenu] = await Promise.all([
    fetchWeather(),
    fetchHospitalMenu()
  ]);

  const iconUrl =
    weather.ok && weather.icon
      ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png`
      : null;

  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );

  res.send(`
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>Tyrni – lounas</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      background: #f2f2f2;
    }

    body {
      padding: 14px;
    }

    .dashboard {
      width: 100%;
      min-height: 0;
      display: flex;
      align-items: stretch;
      gap: 18px;
      padding: 18px 24px;
      background: #fff;
      border: 2px solid #111;
      border-radius: 18px;
    }

    /* -------------------------
       LOUNASLISTA
    ------------------------- */

    .menu {
      flex: 1;
      min-width: 0;
    }

    .header-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      margin-bottom: 4px;
      border-bottom: 3px solid #111;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-title {
      margin: 0;
      font-size: 44px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: -1px;
    }

    .leaf {
      font-size: 34px;
      line-height: 1;
    }

    .menu-date {
      font-size: 22px;
      line-height: 1.2;
      font-weight: 700;
      white-space: nowrap;
    }

    .menu-rows {
      display: flex;
      flex-direction: column;
    }

    .menu-row {
      display: grid;
      grid-template-columns: 58px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-height: 0;
      padding: 12px 0;
      border-bottom: 1px solid #bdbdbd;
    }

    .menu-row:last-child {
      border-bottom: none;
    }

    .menu-content {
      min-width: 0;
    }

    .menu-icon {
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #111;
      border-radius: 50%;
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
    }

    .main .menu-icon {
      color: #fff;
      background: #111;
    }

    .vegetarian .menu-icon {
      border-style: dashed;
    }

    .salad .menu-icon {
      border-radius: 12px;
    }

    .dessert .menu-icon {
      border-radius: 50% 50% 12px 12px;
    }

    .menu-label {
      margin-bottom: 2px;
      font-size: 17px;
      font-weight: 700;
      line-height: 1.15;
    }

    .menu-description {
      font-size: 20px;
      line-height: 1.25;
      overflow-wrap: break-word;
      word-break: normal;
    }

    /* -------------------------
       SÄÄPANEELI
    ------------------------- */

    .weather {
      width: 220px;
      flex-shrink: 0;

      display: flex;
      flex-direction: column;
      align-items: center;

      padding: 18px 12px;
      text-align: center;

      background: #e5e5e5;
      border-left: 3px solid #111;
      border-radius: 10px;
    }

    .location {
      width: 100%;
      text-align: right;

      font-size: 24px;
      font-weight: 700;
    }

    .weather-icon {
      min-height: 112px;
      margin-top: 24px;

      display: flex;
      align-items: center;
      justify-content: center;
    }

    .weather-icon img {
      width: 108px;
      height: 108px;
      object-fit: contain;

      filter: grayscale(100%) contrast(180%);
    }

    .temp {
      margin: 8px 0 18px;

      font-size: 54px;
      line-height: 1;
      font-weight: 700;
    }

    .details {
      font-size: 16px;
      line-height: 1.6;
    }

    .weather-description {
      margin-top: 6px;
      font-weight: 700;
    }

    .weather-unavailable {
      margin-top: 40px;
      font-size: 18px;
    }

    /* -------------------------
       PIENEMMÄT NÄYTÖT
    ------------------------- */

    @media (max-width: 1200px) {
      body {
        padding: 8px;
      }

      .dashboard {
        gap: 12px;
        padding: 14px;
      }

      .header-row {
        gap: 8px;
        padding-bottom: 10px;
      }

      .brand-title {
        font-size: 34px;
      }

      .leaf {
        font-size: 26px;
      }

      .menu-date {
        font-size: 17px;
      }

      .menu-row {
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 8px;
        padding: 7px 0;
      }

      .menu-icon {
        width: 38px;
        height: 38px;
        font-size: 21px;
      }

      .menu-label {
        font-size: 15px;
      }

      .menu-description {
        font-size: 16px;
        line-height: 1.2;
      }

      .weather {
        width: 160px;
        padding: 14px 8px;
      }

      .location {
        font-size: 20px;
      }

      .weather-icon {
        min-height: 85px;
        margin-top: 18px;
      }

      .weather-icon img {
        width: 82px;
        height: 82px;
      }

      .temp {
        font-size: 42px;
        margin-bottom: 14px;
      }

      .details {
        font-size: 13px;
      }
    }
  </style>
</head>

<body>
  <div class="dashboard">

    <main class="menu">
      ${hospitalMenu.map(item => `
        <header class="header-row">
          <div class="brand">
            <h1 class="brand-title">Tyrni</h1>
            <span class="leaf" aria-hidden="true">♧</span>
          </div>

          <div class="menu-date">
            ${escapeHtml(item.title)}
          </div>
        </header>

        <section class="menu-rows">
          ${item.lines.map(renderMenuLine).join("")}
        </section>
      `).join("")}
    </main>

    <aside class="weather">
      <div class="location">
        ${escapeHtml(weather.name)}
      </div>

      ${
        iconUrl
          ? `
            <div class="weather-icon">
              <img
                src="${iconUrl}"
                alt="${escapeHtml(weather.description)}"
              >
            </div>

            <div class="temp">
              ${weather.temp}°C
            </div>

            <div class="details">
              Tuntuu kuin: ${weather.feelsLike}°C<br>
              Tuuli: ${weather.wind} m/s<br>
              Kosteus: ${weather.humidity}%

              <div class="weather-description">
                ${escapeHtml(weather.description)}
              </div>
            </div>
          `
          : `
            <div class="weather-unavailable">
              Säätietoja ei saatavilla
            </div>
          `
      }
    </aside>

  </div>
</body>
</html>
  `);
}
