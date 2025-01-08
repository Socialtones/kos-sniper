import chromium from "@sparticuz/chromium"
import "dotenv/config"
import express from "express"
import puppeteer from "puppeteer"
import puppeteerCore from "puppeteer-core"
import { endpoint } from "./utility/endpoints"
import { Logger, LogLevel } from "./utility/logger"

interface Course {
  code: string
  dates: string[]
}

const app = express()

app.get("/cron", async (req, res) => {
  let { secret, data } = req.query

  Logger.log("Starting cron job...")

  if (secret !== process.env.SECRET) {
    Logger.log("Invalid secret", LogLevel.ERROR)
    res.status(401).send("Invalid request").end()
    return
  }

  const courses = JSON.parse(data as string) as Course[]
  Logger.log("Starting browser...")

  let browser
  if (process.env.VERCEL_ENV === "production") {
    const executablePath = await chromium.executablePath()
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    })
  } else {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
  }

  const page = (await browser.newPage()) as any
  Logger.log("Logging in to KOS...")

  await page.goto(endpoint.LOGIN)
  await page.locator('input[id="username"]').fill(process.env.USERNAME)
  await page.locator('input[id="password"]').fill(process.env.PASSWORD)

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ])
  Logger.log("Logged in to KOS successfully")

  await page.goto("https://www.kos.cvut.cz/terms-offered")
  Logger.log("Waiting for exams to load...")

  await page.waitForSelector("svg.loading-spinner-md", { visible: true })
  await page.waitForSelector("svg.loading-spinner-md", { hidden: true })

  const rows = await page.$$(".row-headline")
  Logger.log(`Found ${rows.length} exams`)

  for (const row of rows) {
    const courseCode = await row
      .$('[data-testid="course-code"]')
      .then((el: any) => el?.getProperty("textContent"))
      .then((handle: any) => handle?.jsonValue())

    const dateRaw = await row
      .$('[data-testid="date"]')
      .then((el: any) => el?.getProperty("textContent"))
      .then((handle: any) => handle?.jsonValue())

    if (!courseCode || !dateRaw) {
      Logger.log("Exam record is invalid", LogLevel.WARN)
      continue
    }

    const datePart = dateRaw.split(" - ")[0]
    const course = courses.find((item) => item.code === courseCode)

    if (!course) {
      Logger.log(`Skipping ${courseCode}...`)
      continue
    }

    if (!datePart) {
      Logger.log("Date format is invalid", LogLevel.WARN)
      continue
    }

    Logger.log(`Checking ${courseCode}...`)

    const candidate = course?.dates.find((item) => item === datePart)

    if (candidate) {
      const signed = await row.$("span.signed-up")

      if (signed) {
        Logger.log(
          `Already signed up for wanted exam ${courseCode} on ${datePart}`,
          LogLevel.SUCCESS
        )
        return
      }
    }
  }

  Logger.log("----- No signed exams found -----")
  let success = false

  for (const row of rows) {
    const courseCode = await row
      .$('[data-testid="course-code"]')
      .then((el: any) => el?.getProperty("textContent"))
      .then((handle: any) => handle?.jsonValue())

    const dateRaw = await row
      .$('[data-testid="date"]')
      .then((el: any) => el?.getProperty("textContent"))
      .then((handle: any) => handle?.jsonValue())

    if (!courseCode || !dateRaw) {
      continue
    }

    const datePart = dateRaw.split(" - ")[0]
    const course = courses.find((item) => item.code === courseCode)

    if (!course) {
      continue
    }

    if (!datePart) {
      continue
    }

    Logger.log(`Processing ${courseCode}...`)

    const candidate = course.dates.find((item) => item === datePart)

    if (candidate) {
      Logger.log(`Found a match for ${courseCode} on ${datePart}`)

      const button = await row.$("button.button-component.btn-primary")

      if (button) {
        await button.click()
        Logger.log(
          `You should be signed up for ${courseCode} on ${datePart}`,
          LogLevel.SUCCESS
        )

        success = true
        break
      } else {
        Logger.log(
          `Failed to sign up for ${courseCode} on ${datePart}`,
          LogLevel.ERROR
        )
      }
    }
  }

  Logger.log("Closing browser and terminating job...")
  await browser.close()

  if (!success) {
    res.status(404).send("No exams found to sign up for").end()
    Logger.log("----- No exams found to sign up for -----", LogLevel.ERROR)
  }

  res.send("Cron job finished successfully").end()
})

app.listen(process.env.PORT, () => {
  Logger.log(`Server is running on port ${process.env.PORT}`)
})
