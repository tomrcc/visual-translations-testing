import fs from "node:fs"
import path from "node:path"

const locales = ["fr", "de"];
const roseyDir = "rosey";

(async () => {
  const baseJsonPath = path.join(roseyDir, "base.json")
  const baseJsonRaw = await fs.promises.readFile(baseJsonPath);
  const baseJson = JSON.parse(baseJsonRaw).keys;
  console.log(baseJson)
  locales.map(async (locale) => {
    const writeFilePath = path.join(roseyDir, "locales", `${locale}.json`);
    let writeFileData = {};
    const existingLocaleDataRaw = await fs.promises.readFile(writeFilePath);
    writeFileData = JSON.parse(existingLocaleDataRaw);

    for (const [key, value] of Object.entries(baseJson)) {
      console.log(`${key}: ${value.original}`);
      if (!writeFileData[key]) {
        writeFileData[key] = {
          original: value.original,
          value: value.original
        }
      }
    }

    await fs.promises.writeFile(writeFilePath, JSON.stringify(writeFileData));
  })
})()