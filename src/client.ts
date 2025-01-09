import chromium from "@sparticuz/chromium"
import puppeteer, { Page } from "puppeteer"
import puppeteerCore from "puppeteer-core"
import { Endpoint } from "./utility/endpoints"
import { Logger, LogLevel } from "./utility/logger"
import {
  AfterInitialization,
  AvailableExam,
  Browser,
  Config,
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

  constructor(private _config: Config) {}

  public async init(): Promise<AfterInitialization> {
    await this._openBrowser()
    await this._openPage()

    // Logger.log("----- Sniper initialized -----", LogLevel.SNIPER)

    return {
      browser: this._browser,
      page: this._page,
    }
  }

  public async login(): Promise<void> {
    // Logger.log("Logging in to kos.cvut.cz...")

    if (!this._page) throw new Error("Sniper is not initialized")
    if (!this._config.username || !this._config.password)
      throw new Error("Username or password is missing")

    await this._page.goto(Endpoint.LOGIN)
    await this._page.locator('input[id="username"]').fill(this._config.username)
    await this._page.locator('input[id="password"]').fill(this._config.password)

    await Promise.all([
      this._page.click('button[type="submit"]'),
      this._page.waitForNavigation({ waitUntil: "networkidle2" }),
    ])
  }

  public async loadExams(): Promise<boolean> {
    await this._page.goto(Endpoint.EXAMS)
    //Logger.log("Loading available exams...")

    await this._page.waitForSelector("svg.loading-spinner-md", {
      visible: true,
    })
    await this._page.waitForSelector("svg.loading-spinner-md", { hidden: true })

    const rows = await this._page.$$(".row-headline")
    //Logger.log(`Found ${rows.length} available exams`, LogLevel.SNIPER)

    this.availableExams = await Utility.parseAvailableExams(rows)
    this._signedExams = Utility.getAlreadySignedExams(
      this._config.targets,
      this.availableExams
    )

    return this._signedExams.length === this._config.targets.length
  }

  public async snipeExam(): Promise<AvailableExam | null> {
    for (const exam of this._config.targets) {
      if (this._signedExams.find((e) => e.code === exam.code)) continue

      const availableExam = this.availableExams.find(
        (e) => e.code === exam.code && e.status === ExamStatus.AVAILABLE
      )

      if (!availableExam) {
        Logger.log(`No exam with code ${exam.code} is available`)
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
    //Logger.log("Terminating services...")
    if (this._browser) await this._browser.close()
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

      //Logger.log("Running in production mode")
    } else {
      this._browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })

      //Logger.log("Running in developer mode")
    }
  }

  private async _openPage(): Promise<void> {
    if (!this._browser) throw new Error("Browser is not opened")
    this._page = (await this._browser.newPage()) as Page
  }
}
