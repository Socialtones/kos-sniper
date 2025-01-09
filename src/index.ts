#!/usr/bin/env node

import * as fs from "fs"
import path from "path"
import * as readline from "readline"
import { Sniper } from "./client"
import { Logger, LogLevel } from "./utility/logger"
import { Config } from "./utility/utility"

let intervalId: NodeJS.Timeout | null = null
let logMode = false

Logger.log("Ready to snipe your exam date", LogLevel.SNIPER)
Logger.log("I think you wanted to -> use <config> <interval>", LogLevel.SNIPER)

function stopLoop(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    Logger.log("Service has been stopped", LogLevel.SNIPER)
  } else {
    Logger.log("There's nothing running yet", LogLevel.WARN)
  }

  logMode = false
}

function startLoop(configFile: string, interval: number): void {
  const absolutePath = path.resolve(process.cwd(), configFile)

  if (!fs.existsSync(absolutePath)) {
    console.log(`Config file not found: ${absolutePath}`)
    return
  }

  const configData = fs.readFileSync(absolutePath, "utf-8")
  let config: Config

  try {
    config = JSON.parse(configData)
  } catch (error) {
    console.log("Invalid JSON format in config file")
    return
  }

  if (intervalId) {
    Logger.log("Found existing service, stopping it first")
    stopLoop()
  }

  logMode = true
  readline.cursorTo(process.stdout, 0, 0)
  readline.clearScreenDown(process.stdout)

  Logger.log(`Running sniper every ${interval} seconds...`, LogLevel.SNIPER)

  intervalId = setInterval(async () => {
    try {
      const sniper = new Sniper(config)

      await sniper.init()
      await sniper.login()

      const isAlreadySigned = await sniper.loadExams()
      if (isAlreadySigned) {
        await sniper.destroy()
        return
      }

      await sniper.snipeExam()
      await sniper.destroy()
    } catch (err: unknown) {
      Logger.log(err as string, LogLevel.ERROR)
    }
  }, interval * 1000)
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
})

rl.prompt()
rl.on("line", (line: string) => {
  const [cmd, ...args] = line.trim().split(/\s+/)

  switch (cmd) {
    case "use": {
      const configFile = args[0]
      const interval = parseInt(args[1], 10)

      if (!configFile || isNaN(interval) || interval <= 0) {
        Logger.log("Usage: use <config> <interval>")
      } else {
        startLoop(configFile, interval)
      }
      break
    }

    case "destroy": {
      stopLoop()
      break
    }

    case "exit": {
      rl.close()
      break
    }

    default:
      Logger.log("Unknown command", LogLevel.ERROR)
      break
  }

  if (!logMode) rl.prompt()
}).on("close", () => {
  readline.clearLine(process.stdout, 0)
  readline.cursorTo(process.stdout, 0)

  Logger.log("Goodbye!", LogLevel.SNIPER)
  process.exit(0)
})
