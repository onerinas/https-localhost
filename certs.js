#!/usr/bin/env node

const path = require("path")
const fs = require("fs")
const exec = require("child_process").exec
const https = require("https")
const getAppDataPath = require("appdata-path")

const MKCERT_VERSION = "v1.4.0"
const CERT_PATH = getAppDataPath("https-localhost")

// check for updates
/* istanbul ignore next: cannot test pkg */
function checkUpdates() {
  try {
    const options = {
      host: "api.github.com",
      path: "/repos/daquinoaldo/https-localhost/releases/latest",
      method: "GET",
      headers: { "User-Agent": "node.js" }
    }
    https.request(options, res => {
      let body = ""
      res.on("data", chunk => { body += chunk.toString("utf8") })
      res.on("end", () => {
        const currentVersion = JSON.parse(fs.readFileSync(
          path.resolve(__dirname, "package.json"))).version
        const latestVersion = JSON.parse(body).tag_name.replace("v", "")
        if (currentVersion !== latestVersion)
          console.warn("[https-localhost] New update available.")
      })
    }).end()
  } catch (e) {
    // Just catch everything, this is not a critic part and can fail.
    // It is important to not affect the script behavior.
  }
}

// get the executable name
function getExe() {
  /* istanbul ignore next: tested on all platform on travis */
  switch (process.platform) {
    case "darwin":
      return "mkcert-" + MKCERT_VERSION + "-darwin-amd64"
    case "linux":
      return "mkcert-" + MKCERT_VERSION + "-linux-amd64"
    case "win32":
      return "mkcert-" + MKCERT_VERSION + "-windows-amd64.exe"
    default:
      console.warn("Cannot generate the localhost certificate on your " +
        "platform. Please, consider contacting the developer if you can help.")
      process.exit(0)
  }
}

// download a binary file
function download(url, path) {
  console.log("Downloading the mkcert executable...")
  const file = fs.createWriteStream(path)
  return new Promise(resolve => {
    function get(url, file) {
      https.get(url, (response) => {
        if (response.statusCode === 302) get(response.headers.location, file)
        else response.pipe(file).on("finish", resolve)
      })
    }
    get(url, file)
  })
}

// execute the binary executable to generate the certificates
function mkcert(appDataPath, exe) {
  const logPath = path.join(appDataPath, "mkcert.log")
  const errPath = path.join(appDataPath, "mkcert.err")
  // escape spaces in appDataPath (Mac OS)
  appDataPath = appDataPath.replace(" ", "\\ ")
  const exePath = path.join(appDataPath, exe)
  const crtPath = path.join(appDataPath, "localhost.crt")
  const keyPath = path.join(appDataPath, "localhost.key")
  const cmd = exePath + " -install -cert-file " + crtPath +
    " -key-file " + keyPath + " localhost"
  return new Promise((resolve, reject) => {
    console.log("Running mkcert to generate certificates...")
    exec(cmd, (err, stdout, stderr) => {
      // log
      const errFun = err => {
        /* istanbul ignore if: cannot be tested */
        if (err) console.error(err)
      }
      fs.writeFile(logPath, stdout, errFun)
      fs.writeFile(errPath, stderr, errFun)
      /* istanbul ignore if: cannot be tested */
      if (err) reject(err)
      resolve()
    })
  })
}

async function generate(appDataPath = CERT_PATH) {
  console.info("Generating certificates...")
  console.log("Certificates path: " + appDataPath +
    ". Never modify nor share this files.")
  // mkdir if not exists
  /* istanbul ignore else: not relevant */
  if (!fs.existsSync(appDataPath))
    fs.mkdirSync(appDataPath)
  // build the executable url and path
  const url = "https://github.com/FiloSottile/mkcert/releases/download/" +
    MKCERT_VERSION + "/"
  const exe = getExe()
  const exePath = path.join(appDataPath, exe)
  // download the executable
  await download(url + exe, exePath)
  // make binary executable
  fs.chmodSync(exePath, "0755")
  // execute the binary
  await mkcert(appDataPath, exe)
  console.log("Certificates generated, installed and trusted. Ready to go!")
}

async function getCerts() {
  const certPath = process.env.CERT_PATH || CERT_PATH
  // check for updates if running as executable
  /* istanbul ignore if: cannot test pkg */
  if (process.pkg) checkUpdates()
  // check if a reinstall is forced or needed by a mkcert update
  if (process.env.REINSTALL ||
      !fs.existsSync(path.join(certPath, getExe())))
    await generate(certPath)
  try {
    return {
      key: fs.readFileSync(path.join(certPath, "localhost.key")),
      cert: fs.readFileSync(path.join(certPath, "localhost.crt"))
    }
  } catch (e) {
    /* istanbul ignore else: should never occur */
    if (certPath !== CERT_PATH) {
      console.error("Cannot find localhost.key and localhost.crt in the" +
      " specified path: " + certPath)
      process.exit(1)
    } else {
      // Missing certificates (first run)
      // generate the certificate
      await generate(CERT_PATH)
      // recursive call
      return getCerts()
    }
  }
}

// delete a folder and the file inside it
function remove(appDataPath = CERT_PATH) {
  if (fs.existsSync(appDataPath)) {
    fs.readdirSync(appDataPath)
      .forEach(file => fs.unlinkSync(path.join(appDataPath, file)))
    fs.rmdirSync(appDataPath)
  }
}

// run as script
/* istanbul ignore if: cannot be tested */
if (require.main === module)
  // if run with -u or --uninstall
  if (process.argv.length === 3 &&
    (process.argv[2] === "-u" || process.argv[2] === "--uninstall")) {
    remove()
    console.info("Certificates removed.")
  } else try { // install
    generate()
  } catch (err) { console.error("\nExec error: " + err) }

// export as module
module.exports = {
  getCerts,
  generate,
  remove
}
