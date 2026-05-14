#!/usr/bin/env node

import { access, constants, stat } from "node:fs/promises";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { transformIModel } from "./transformer.js";

async function validateSourcePath(sourcePath: string): Promise<void> {
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isDirectory()) {
    throw new Error(`The --source path points to a directory: ${sourcePath}`);
  }

  await access(sourcePath, constants.R_OK);
}

async function validateOutputPath(outputPath: string): Promise<void> {
  if (path.basename(outputPath).trim() === "") {
    throw new Error("The --output value must include a file name.");
  }

  const parentDirectory = path.dirname(outputPath);
  await access(parentDirectory, constants.W_OK);

  try {
    const outputStats = await stat(outputPath);

    if (outputStats.isDirectory()) {
      throw new Error(`The --output path points to a directory: ${outputPath}`);
    }

    throw new Error(`The output file already exists: ${outputPath}`);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : undefined;

    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("imodel-subject-transformer")
    .usage("$0 --source <file> --output <file>")
    .option("source", {
      alias: "s",
      type: "string",
      demandOption: true,
      describe: "Path to the existing iModel file to read elements from",
    })
    .option("output", {
      alias: "o",
      type: "string",
      demandOption: true,
      describe: "Path and filename for the new Snapshot iModel",
    })
    .check((args) => {
      if (typeof args.source !== "string" || args.source.trim() === "") {
        throw new Error("The --source option is required.");
      }

      if (typeof args.output !== "string" || args.output.trim() === "") {
        throw new Error("The --output option is required.");
      }

      return true;
    })
    .strict()
    .help()
    .parseAsync();

  const sourcePath = path.resolve(argv.source);
  const outputPath = path.resolve(argv.output);

  await validateSourcePath(sourcePath);
  await validateOutputPath(outputPath);

  const result = await transformIModel({ sourcePath, outputPath });

  console.log(
    `\nTransformed ${result.elementCount} elements into subjects.`,
  );
  console.log(`Processing time: ${(result.elapsedMs / 1000).toFixed(2)}s`);
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
