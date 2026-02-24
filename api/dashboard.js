export default async function handler(req, res) {

  const RSS_URL = process.env.RSS_URL;
  const WEATHER_KEY = process.env.WEATHER_KEY;
  const CITY = "Pori";

  // ---- FETCH WEATHER ----
  const weatherRes = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&appid=${WEATHER_KEY}`
  );
  const weather = await weatherRes.json();

  // ---- FETCH RSS ----
  const feedRes = await fetch(RSS_URL);
  const xml = await feedRes.text();

  // ---- PARSE RSS ITEMS ----
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 5)
    .map(block => {
      const title = block[1].match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const desc = block[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";

      return {
        title: title.replace(/<!\[CDATA\[|\]\]>/g, ""),
        desc: desc.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
      };
    });

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
      width: 65%;
    }

    .item {
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid black;
    }

    .title {
      font-weight: bold;
      font-size: 18px;
      margin-bottom: 5px;
    }

    .desc {
      font-size: 15px;
      line-height: 1.4;
    }

    .weather {
      width: 30%;
      text-align: right;
    }

    .temp {
      font-size: 54px;
      font-weight: bold;
      margin-top: 20px;
    }

    .location {
      font-size: 20px;
      margin-bottom: 10px;
    }

  </style>
  </head>
  <body>

    <div class="menu">
      <h2>Lounaslista</h2>

      ${items.map(i => `
        <div class="item">
          <div class="title">${i.title}</div>
          <div class="desc">${i.desc}</div>
        </div>
      `).join("")}

    </div>

    <div class="weather">
      <div class="location">${weather.name}</div>
      <div class="temp">${Math.round(weather.main.temp)}°C</div>
      <div>${weather.weather[0].description}</div>
    </div>

  </body>
  </html>
  `);
}
