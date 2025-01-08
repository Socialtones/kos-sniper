import "dotenv/config"
import express from "express"
import { Sniper } from "./client"
import { Logger, LogLevel } from "./utility/logger"

interface Course {
  code: string
  dates: string[]
}

const app = express()

app.get("/cron", async (req, res) => {
  try {
    const sniper = new Sniper(req)

    await sniper.init()
    await sniper.login(process.env.USERNAME, process.env.PASSWORD)

    const isAlreadySigned = await sniper.loadExams()
    if (isAlreadySigned) {
      await sniper.destroy()
      res.status(200).send("Already signed up for exams").end()
      return
    }

    await sniper.snipeExam()
    await sniper.destroy()
  } catch (err: unknown) {
    Logger.log(err as string, LogLevel.ERROR)
    res.status(400).send("Invalid request").end()
  }
})

app.listen(process.env.PORT, () => {
  Logger.log(`Server is running on port ${process.env.PORT}`)
})
