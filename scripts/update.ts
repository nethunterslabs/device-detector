import * as YAML from "https://deno.land/std@0.98.0/encoding/yaml.ts";
import * as ensure from "https://deno.land/std@0.98.0/fs/ensure_dir.ts";
import * as exists from "https://deno.land/std@0.98.0/fs/exists.ts";
import * as path from "https://deno.land/std@0.98.0/path/mod.ts";

const objSize = (obj: object) => {
  let size = 0;

  for (const _key of Object.entries(obj)) {
    size++;
  }

  return size;
};

const zip = <A, B>(a: A[], b: B[]) => a.map((k, i) => [k, b[i]]);

const CACHE_DIR = ".cache";
const OUTPUT_FILE = "src/data.rs";

const REPO = "matomo-org/device-detector";
const COMMIT = "d879f07496d6e6ee89cef5bcd925383d9b0c2cc0";

const DATA_FILES: Array<string> = [
  "regexes/bots.yml",
  "regexes/oss.yml",
  "regexes/vendorfragments.yml",
  "regexes/client/browser_engine.yml",
  "regexes/client/browsers.yml",
  "regexes/client/feed_readers.yml",
  "regexes/client/libraries.yml",
  "regexes/client/mediaplayers.yml",
  "regexes/client/mobile_apps.yml",
  "regexes/client/pim.yml",
  "regexes/device/cameras.yml",
  "regexes/device/car_browsers.yml",
  "regexes/device/consoles.yml",
  "regexes/device/mobiles.yml",
  "regexes/device/notebooks.yml",
  "regexes/device/portable_media_player.yml",
  "regexes/device/televisions.yml",
];

const DATA_URLS: Array<string> = DATA_FILES.map((file: string): string => {
  return "https://raw.githubusercontent.com/" + REPO + "/" + COMMIT + "/" +
    file;
});

const download = async () => {
  for (const [file, url] of zip(DATA_FILES, DATA_URLS)) {
    const filePath = path.join(Deno.cwd(), CACHE_DIR, file);

    if (await exists.exists(filePath)) {
      continue;
    }

    await ensure.ensureDir(path.dirname(filePath));

    const res = await fetch(url);

    await Deno.writeTextFile(filePath, await res.text());
  }
};

const escape = (value: unknown, both = false): string | undefined => {
  if (value === undefined) {
    return value;
  }

  if (both) {
    return (value as string).replaceAll("\\", "\\\\");
  } else {
    return (value as string).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
  }
};

const writeSome = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "None"
  } else {
    return `Some(${JSON.stringify(escape(value))})`;
  }
};

const generate = async () => {
  let outputBuffer = `#![allow(dead_code)]

#[derive(Debug)]
pub struct Element {
    pub regex: &'static str,
    pub name: &'static str,
    pub version: Option<&'static str>,
    pub category: Option<&'static str>,
    pub url: Option<&'static str>,
    pub producer: Option<Producer>,
}

#[derive(Debug)]
pub struct Producer {
    pub name: &'static str,
    pub url: &'static str,
}

#[derive(Debug)]
pub struct Brand {
    pub regex: &'static str,
    pub device: Option<&'static str>,
    pub model: Option<&'static str>,
    pub models: Option<&'static [Model]>,
}

#[derive(Debug)]
pub struct Model {
    pub regex: &'static str,
    pub model: &'static str,
}\n\n`;

  for (const file of DATA_FILES) {
    const filePath = path.join(Deno.cwd(), CACHE_DIR, file);

    const upper = path.basename(file).replace(".yml", "").toUpperCase();

    const text = await Deno.readTextFile(filePath);

    const data = YAML.parse(text);

    if (Array.isArray(data)) {
      const count = data.length;

      outputBuffer += `pub static ${upper}: [Element; ${count}] = [\n`;

      for (const element of data) {
        outputBuffer += "    Element {\n";

        outputBuffer += `        regex: "${escape(element.regex)}",\n`;
        outputBuffer += `        name: "${escape(element.name)}",\n`;
        outputBuffer += `        version: ${writeSome(element.version)},\n`;
        outputBuffer += `        category: ${writeSome(element.category)},\n`;
        outputBuffer += `        url: ${writeSome(element.url)},\n`;

        const producer = element.producer;
        if (producer === null || producer === undefined) {
          outputBuffer += "        producer: None,\n";
        } else {
          outputBuffer += "        producer: Some(Producer {\n";
          outputBuffer += `            name: "${escape(producer.name)}",\n`;
          outputBuffer += `            url: "${escape(producer.url)}",\n`;
          outputBuffer += "        }),\n";
        }

        outputBuffer += "    },\n";
      }

      outputBuffer += "];\n";
    } else if (typeof(data) === "object") {
      if (data === null) {
        continue;
      }

      const count = objSize(data);

      outputBuffer += `pub static ${upper}: [(&str, Brand); ${count}] = [\n`;

      for (const [name, brand] of Object.entries(data)) {
        outputBuffer += `    ("${escape(name)}", Brand {\n`;
        outputBuffer += `        regex: "${escape(brand.regex)}",\n`;
        outputBuffer += `        device: ${writeSome(brand.device)},\n`;
        outputBuffer += `        model: ${writeSome(brand.model)},\n`;

        const models = brand.models;
        if (models === null || models === undefined) {
          outputBuffer += "        models: None,\n";
        } else {
          outputBuffer += "        models: Some(&[\n";

          for (const model of models) {
            outputBuffer += "            Model {\n";
            outputBuffer += `                regex: "${escape(model.regex)}",\n`;
            outputBuffer += `                model: "${escape(model.model)}",\n`;
            outputBuffer += "            },\n";
          }

          outputBuffer += "        ]),\n";
        }

        outputBuffer += "    }),\n";
      }

      outputBuffer += "];\n\n"
    }
  }

  const outputPath = path.join(Deno.cwd(), OUTPUT_FILE);

  await Deno.writeTextFile(outputPath, outputBuffer);
};

const command = Deno.args[0];

if (command === "download") {
  await download();
} else if (command === "generate") {
  await generate();
}
