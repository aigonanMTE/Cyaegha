const express = require("express")
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const app = express()
const port = process.env.PORT
const staticdir = path.join(__dirname, '../frontend')

app.use(express.static(staticdir))

app.get("/" , (res,req) =>{
  req.redirect("/main/main.html")
})

app.get("/api/reserve/date", async (req, res) => {

    const { date } = req.query;

    const response = await fetch(
        `https://cygame.world/api/reserve/date?date=${date}`
    );

    const data = await response.json();

    res.json(data);
});

app.get('/api/reserve/timetable/type', async (req, res) => {
  const { type, date } = req.query
  const query = new URLSearchParams({ type, date })
  const response = await fetch(`https://cygame.world/api/reserve/timetable/type?${query}`)
  const data = await response.json()

  res.json(data)
})

app.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});