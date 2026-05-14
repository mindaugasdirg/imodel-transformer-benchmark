#!/usr/bin/env node

import { access, constants, stat } from "node:fs/promises";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { generateSnapshotIModel } from "./generator";

interface CliArguments {
  output: string;
  count: number;
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
    const code = error instanceof Error && "code" in error ? String(error.code) : undefined;

    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("snapshot-subject-generator")
    .usage("$0 --output <file> [--count <number>]")
    .option("output", {
      alias: "o",
      type: "string",
      demandOption: true,
      describe: "Path and filename for the generated snapshot iModel file",
    })
    .option("count", {
      alias: "n",
      type: "number",
      default: 1_000_000,
      describe: "Number of root-level subjects to insert",
    })
    .check((args) => {
      if (!Number.isInteger(args.count) || args.count < 1) {
        throw new Error("The --count value must be a positive integer.");
      }

      if (typeof args.output !== "string" || args.output.trim() === "") {
        throw new Error("The --output option is required.");
      }

      return true;
    })
    .strict()
    .help()
    .parseAsync();

  const options: CliArguments = {
    output: path.resolve(argv.output),
    count: argv.count,
  };

  await validateOutputPath(options.output);
  await generateSnapshotIModel({
    outputPath: options.output,
    count: options.count,
  });

  console.log(`Created ${options.output} with ${options.count} subjects.`);
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
