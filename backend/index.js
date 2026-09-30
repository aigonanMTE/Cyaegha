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

app.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});