import { Browser as DevBrowser, ElementHandle, Page } from "puppeteer"
import { Browser as ProductionBrowser } from "puppeteer-core"
import { Logger, LogLevel } from "./logger"

export type Browser = DevBrowser | ProductionBrowser
export enum ExamStatus {
  NOT_AVAILABLE = 0,
  AVAILABLE = 1,
  SIGNED = 2,
}

export interface AfterInitialization {
  browser: Browser
  page: Page
}

export interface SnipeExam {
  code: string
  dates: string[]
}

export interface AvailableExam {
  code: string
  date: string
  element: ElementHandle<Element>
  status: ExamStatus
}

export interface LoadedExams {
  exams: AvailableExam[]
  isAlreadySigned: boolean
}

export interface Config {
  username: string
  password: string
  targets: SnipeExam[]
}

export class Utility {
  public static async parseAvailableExams(
    rows: ElementHandle<Element>[]
  ): Promise<AvailableExam[]> {
    const exams = [] as AvailableExam[]

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
        Logger.log(`Detected invalid exam record`, LogLevel.WARN)
        continue
      }

      const date = Utility.parseExamDate(dateRaw)

      if (!date) {
        Logger.log(`Cannot parse exam starting date`, LogLevel.WARN)
        continue
      }

      let status = ExamStatus.NOT_AVAILABLE

      const signed = await row.$("span.signed-up")
      if (signed) status = ExamStatus.SIGNED

      const available = await row.$("span.available")
      if (available) status = ExamStatus.AVAILABLE

      exams.push({
        code: courseCode,
        date,
        status,
        element: row,
      })
    }

    return exams
  }

  public static parseExamDate(dateRaw: string): string | null {
    const datePart = dateRaw.split(" - ")[0]

    if (!datePart) {
      Logger.log("Date format is invalid in exam record", LogLevel.WARN)
      return null
    }

    return datePart
  }

  public static getAlreadySignedExams(
    snipeExams: SnipeExam[],
    availableExams: AvailableExam[]
  ): SnipeExam[] {
    const alreadySignedExams = [] as SnipeExam[]

    for (const snipeExam of snipeExams) {
      for (const availableExam of availableExams) {
        if (
          availableExam.code === snipeExam.code &&
          availableExam.status === ExamStatus.SIGNED &&
          snipeExam.dates.includes(availableExam.date)
        ) {
          Logger.log(
            `You are already signed up for exam ${snipeExam.code}`,
            LogLevel.SNIPER
          )

          alreadySignedExams.push(snipeExam)
          break
        }
      }
    }

    return alreadySignedExams
  }

  public static async getSignUpButton(
    page: Page
  ): Promise<ElementHandle<HTMLButtonElement> | undefined> {
    const buttons = await page.$$("button.btn-primary")

    for (const button of buttons) {
      const text = await button.evaluate((el: Element) =>
        el.textContent?.trim()
      )

      if (text === "Přihlásit") return button
    }
  }
}
