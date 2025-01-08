import chromium from "@sparticuz/chromium"
import { Request } from "express"
import puppeteer, { Page } from "puppeteer"
import puppeteerCore from "puppeteer-core"
import { Endpoint } from "./utility/endpoints"
import { Logger, LogLevel } from "./utility/logger"
import {
  AfterInitialization,
  AvailableExam,
  Browser,
  ExamStatus,
  SnipeExam,
  Utility,
} from "./utility/utility"

export class Sniper {
  public exams = [] as SnipeExam[]
  public availableExams = [] as AvailableExam[]

  private _browser!: Browser
  private _page!: Page
  private _signedExams = [] as SnipeExam[]

  constructor(private _req: Request) {
    const { secret, data } = this._req.query

    if (
      !secret ||
      !data ||
      typeof secret !== "string" ||
      typeof data !== "string"
    ) {
      throw new Error("Invalid request")
    }

    if (!this._validateSecret(secret)) {
      throw new Error("Invalid secret")
    }

    this.exams = JSON.parse(data) as SnipeExam[]
  }

  public async init(): Promise<AfterInitialization> {
    await this._openBrowser()
    await this._openPage()

    Logger.log("----- Sniper initialized -----", LogLevel.SNIPER)

    return {
      browser: this._browser,
      page: this._page,
    }
  }

  public async login(username: string, password: string): Promise<void> {
    Logger.log("Logging in to kos.cvut.cz...")

    if (!this._page) throw new Error("Sniper is not initialized")
    if (!username || !password)
      throw new Error("Username or password is missing")

    await this._page.goto(Endpoint.LOGIN)
    await this._page.locator('input[id="username"]').fill(username)
    await this._page.locator('input[id="password"]').fill(password)

    await Promise.all([
      this._page.click('button[type="submit"]'),
      this._page.waitForNavigation({ waitUntil: "networkidle2" }),
    ])
  }

  public async loadExams(): Promise<boolean> {
    await this._page.goto(Endpoint.EXAMS)
    Logger.log("Loading available exams...")

    await this._page.waitForSelector("svg.loading-spinner-md", {
      visible: true,
    })
    await this._page.waitForSelector("svg.loading-spinner-md", { hidden: true })

    const rows = await this._page.$$(".row-headline")
    Logger.log(`Found ${rows.length} available exams`, LogLevel.SNIPER)

    this.availableExams = await Utility.parseAvailableExams(rows)
    this._signedExams = Utility.getAlreadySignedExams(
      this.exams,
      this.availableExams
    )

    return this._signedExams.length === this.exams.length
  }

  public async snipeExam(): Promise<AvailableExam | null> {
    for (const exam of this.exams) {
      if (this._signedExams.find((e) => e.code === exam.code)) continue

      const availableExam = this.availableExams.find(
        (e) => e.code === exam.code && e.status === ExamStatus.AVAILABLE
      )

      if (!availableExam) {
        Logger.log(
          `No exam with code ${exam.code} is available`,
          LogLevel.SNIPER
        )
        continue
      }

      for (const date of exam.dates) {
        const toSnipe = this.availableExams.find(
          (e) =>
            e.date === date &&
            e.code === exam.code &&
            e.status === ExamStatus.AVAILABLE
        )

        if (!toSnipe) continue

        Logger.log(
          `Sniping ${toSnipe.code} on ${toSnipe.date}`,
          LogLevel.SNIPER
        )

        await toSnipe.element.click()
        await this._page.waitForSelector("button.btn-primary", {
          visible: true,
          timeout: 1000,
        })

        const button = await Utility.getSignUpButton(this._page)
        if (!button) {
          Logger.log("Cannot find sign up button", LogLevel.WARN)

          await toSnipe.element.click()
          await this._page.waitForSelector("button.btn-primary", {
            hidden: true,
            timeout: 1000,
          })

          continue
        }

        await button.click()

        await this._page.waitForSelector("svg.loading-spinner-md", {
          visible: true,
        })
        await this._page.waitForSelector("svg.loading-spinner-md", {
          hidden: true,
        })

        Logger.log(
          `You should be signed up for ${toSnipe.code} on ${toSnipe.date}`,
          LogLevel.SUCCESS
        )

        return toSnipe
      }
    }

    return null
  }

  public async destroy(): Promise<void> {
    Logger.log("Terminating services...")
    if (this._browser) await this._browser.close()
  }

  private _validateSecret(secret: string): boolean {
    if (!process.env.SECRET) {
      Logger.log("Secret environment variable is not set!", LogLevel.ERROR)
      return false
    }

    return secret === process.env.SECRET
  }

  private async _openBrowser(): Promise<void> {
    if (process.env.VERCEL_ENV === "production") {
      const executablePath = await chromium.executablePath()
      this._browser = await puppeteerCore.launch({
        executablePath,
        args: chromium.args,
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
      })

      Logger.log("Running in production mode")
    } else {
      this._browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })

      Logger.log("Running in developer mode")
    }
  }

  private async _openPage(): Promise<void> {
    if (!this._browser) throw new Error("Browser is not opened")
    this._page = (await this._browser.newPage()) as Page
  }
}
