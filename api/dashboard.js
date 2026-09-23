
export default async function handler(req, res) {
  const RSS_URL = process.env.RSS_URL;
  const WEATHER_KEY = process.env.WEATHER_KEY;
  const CITY = "Pori";

  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function simplifyMenuLine(line = "") {
    return line
      .replace(/\([^)]*\)/g, "")
      .replace(/\*/g, "")
      .replace(/^Lounas\s*1\s*:/i, "1: ")
      .replace(/^Lounas\s*2\s*:/i, "2: ")
      .replace(/^Kasvislounas\s*:/i, "Kasvis: ")
      .replace(/^Salaattilounas\s*:/i, "Salaatti: ")
      .replace(/^Jälkiruoka\s*:/i, "Jälkiruoka: ")
      .replace(/^Kahvio\s+Mocca\s+annossalaatti\s*:/i, "Mocca: ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function safeFetch(url, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

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

      if (!firstItem) return [];

      const title =
        firstItem[1].match(/<title>(.*?)<\/title>/)?.[1] ?? "";

      let desc =
        firstItem[1].match(
          /<description>([\s\S]*?)<\/description>/
        )?.[1] ?? "";

      desc = desc.replace(/<!\[CDATA\[|\]\]>/g, "");
      desc = desc.replace(/<br\s*\/?>/gi, "\n");
      desc = desc.replace(/<[^>]+>/g, "");

      const lines = desc
        .split("\n")
        .map(simplifyMenuLine)
        .filter(Boolean);

      return [{ title, lines }];
    } catch (err) {
      console.error("RSS fetch failed:", err);

      return [{
        title: "Tyrni",
        lines: ["Ruokalistaa ei saatavilla"]
      }];
    }
  }

  const [weather, hospitalMenu] = await Promise.all([
    fetchWeather(),
    fetchHospitalMenu()
  ]);

  const iconUrl =
    weather.ok && weather.icon
      ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png`
      : null;

  function getMenuType(line) {
    if (/^1:/.test(line)) {
      return { icon: "♨", label: "Lounas 1", type: "main" };
    }

    if (/^2:/.test(line)) {
      return { icon: "♨", label: "Lounas 2", type: "main" };
    }

    if (/^Kasvis:/i.test(line)) {
      return { icon: "♧", label: "Kasvis", type: "vegetarian" };
    }

    if (/^Salaatti:/i.test(line)) {
      return { icon: "❋", label: "Salaatti", type: "salad" };
    }

    if (/^Jälkiruoka:/i.test(line)) {
      return { icon: "✿", label: "Jälkiruoka", type: "dessert" };
    }

    if (/^Mocca:/i.test(line)) {
      return { icon: "☕", label: "Mocca", type: "other" };
    }

    return { icon: "•", label: "", type: "other" };
  }

  function menuItemHtml(line) {
    const info = getMenuType(line);
    let description = line;

    if (info.label) {
      description = line.replace(
        new RegExp("^" + info.label + "\\s*:?\\s*", "i"),
        ""
      );

      // Säilytä alkuperäinen numerointi muodossa 1: / 2:
      if (info.label === "Lounas 1") {
        description = line.replace(/^1:\s*/, "");
      } else if (info.label === "Lounas 2") {
        description = line.replace(/^2:\s*/, "");
      }
    }

    return `
      <div class="menu-row ${info.type}">
        <div class="menu-icon">${info.icon}</div>
        <div class="menu-content">
          <div class="menu-label">${escapeHtml(info.label)}</div>
          <div class="menu-description">${escapeHtml(description)}</div>
        </div>
      </div>
    `;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 20px;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #f2f2f2;
  }

  .dashboard {
    width: 100%;
    min-height: 650px;
    display: flex;
    gap: 28px;
    padding: 30px;
    background: #fff;
    border: 2px solid #111;
    border-radius: 18px;
  }

  .menu {
    flex: 1;
    min-width: 0;
  }

  .header-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 20px;
    margin-bottom: 12px;
    border-bottom: 3px solid #111;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-title {
    margin: 0;
    font-size: 48px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: -1px;
  }

  .leaf {
    font-size: 42px;
    line-height: 1;
  }

  .menu-date {
    font-size: 24px;
    font-weight: 700;
    white-space: nowrap;
  }

  .menu-rows {
    display: flex;
    flex-direction: column;
  }

  .menu-row {
    display: grid;
    grid-template-columns: 72px 170px minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    min-height: 105px;
    padding: 16px 0;
    border-bottom: 1px solid #bdbdbd;
  }

  .menu-row:last-child {
    border-bottom: none;
  }

  .menu-icon {
    width: 62px;
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #111;
    border-radius: 50%;
    font-size: 34px;
    font-weight: 700;
    line-height: 1;
  }

  .menu-label {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
  }

  .menu-description {
    font-size: 22px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .main .menu-icon {
    background: #111;
    color: #fff;
  }

  .vegetarian .menu-icon {
    border-style: dashed;
  }

  .salad .menu-icon {
    border-radius: 14px;
  }

  .dessert .menu-icon {
    border-radius: 50% 50% 14px 14px;
  }

  .weather {
    width: 230px;
    flex-shrink: 0;
    padding: 24px 18px;
    text-align: center;
    background: #e5e5e5;
    border-left: 3px solid #111;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .location {
    width: 100%;
    text-align: right;
    font-size: 25px;
    font-weight: 700;
  }

  .weather-icon {
    margin-top: 45px;
    min-height: 125px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weather-icon img {
    width: 115px;
    height: 115px;
    object-fit: contain;
    filter: grayscale(100%) contrast(180%);
  }

  .temp {
    margin: 8px 0 20px;
    font-size: 58px;
    line-height: 1;
    font-weight: 700;
  }

  .details {
    font-size: 17px;
    line-height: 1.65;
  }

  .weather-description {
    margin-top: 6px;
    font-weight: 600;
  }

  .weather-unavailable {
    margin-top: 50px;
    font-size: 18px;
  }

  @media (max-width: 800px) {
    body {
      padding: 10px;
    }

    .dashboard {
      padding: 18px;
      gap: 16px;
    }

    .menu-row {
      grid-template-columns: 48px 110px minmax(0, 1fr);
      gap: 10px;
    }

    .menu-icon {
      width: 44px;
      height: 44px;
      font-size: 24px;
    }

    .menu-description {
      font-size: 17px;
    }

    .menu-label {
      font-size: 16px;
    }

    .weather {
      width: 170px;
      padding: 16px 10px;
    }

    .brand-title {
      font-size: 36px;
    }

    .leaf {
      font-size: 30px;
    }

    .menu-date {
      font-size: 18px;
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
          <div class="menu-date">${escapeHtml(item.title)}</div>
        </header>

        <section class="menu-rows">
          ${item.lines.map(menuItemHtml).join("")}
        </section>
      `).join("")}
    </main>

    <aside class="weather">
      <div class="location">${escapeHtml(weather.name)}</div>

      ${iconUrl ? `
        <div class="weather-icon">
          <img src="${iconUrl}" alt="${escapeHtml(weather.description)}">
        </div>

        <div class="temp">${weather.temp}°C</div>

        <div class="details">
          Tuntuu kuin: ${weather.feelsLike}°C<br>
          Tuuli: ${weather.wind} m/s<br>
          Kosteus: ${weather.humidity}%
          <div class="weather-description">
            ${escapeHtml(weather.description)}
          </div>
        </div>
      ` : `
        <div class="weather-unavailable">
          Säätietoja ei saatavilla
        </div>
      `}
    </aside>
  </div>
</body>
</html>
  `);
}
