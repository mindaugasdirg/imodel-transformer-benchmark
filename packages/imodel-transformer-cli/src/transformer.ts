import path from "node:path";
import { performance } from "node:perf_hooks";
import { IModelHost, SnapshotDb } from "@itwin/core-backend";
import {
  IModelExporter,
  IModelTransformer,
} from "@itwin/imodel-transformer";
import { DetachedExportElementAspectsStrategy } from "@itwin/imodel-transformer/lib/cjs/DetachedExportElementAspectsStrategy.js";

export interface TransformationOptions {
  sourcePath: string;
  outputPath: string;
}

export interface TransformationResult {
  elapsedMs: number;
}

export async function runTransformation(
  options: TransformationOptions,
): Promise<TransformationResult> {
  const rootSubjectName =
    path.parse(options.outputPath).name || "TransformedIModel";

  await IModelHost.startup();

  const sourceDb = SnapshotDb.openFile(options.sourcePath);

  const targetDb = SnapshotDb.createEmpty(options.outputPath, {
    rootSubject: { name: rootSubjectName },
  });

  const exporter = new IModelExporter(sourceDb, DetachedExportElementAspectsStrategy);
  const transformer = new IModelTransformer(exporter, targetDb);

  const startTime = performance.now();

  try {
    console.log("Processing schemas...");
    await transformer.processSchemas();
    targetDb.saveChanges();

    console.log("Processing elements, relationships, and aspects...");
    await transformer.process();
    targetDb.saveChanges();
  } finally {
    transformer.dispose();
    sourceDb.close();
    targetDb.close();
    await IModelHost.shutdown();
  }

  const elapsedMs = performance.now() - startTime;

  return { elapsedMs };
}
