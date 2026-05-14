import path from "node:path";
import { performance } from "node:perf_hooks";
import cliProgress from "cli-progress";
import {
  IModelHost,
  SnapshotDb,
  Subject,
  withEditTxn,
} from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";

export interface TransformOptions {
  sourcePath: string;
  outputPath: string;
  batchSize?: number;
}

export interface TransformResult {
  elementCount: number;
  elapsedMs: number;
}

const DEFAULT_BATCH_SIZE = 50_000;
const PROGRESS_UPDATE_INTERVAL = 1_000;

async function countElements(sourceDb: SnapshotDb): Promise<number> {
  const reader = sourceDb.createQueryReader(
    "SELECT COUNT(*) AS cnt FROM bis.Element",
  );

  if (await reader.step()) {
    return reader.current.cnt as number;
  }

  return 0;
}

export async function transformIModel(
  options: TransformOptions,
): Promise<TransformResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const rootSubjectName =
    path.parse(options.outputPath).name || "TransformedIModel";

  await IModelHost.startup();

  const sourceDb = SnapshotDb.openFile(options.sourcePath);
  const totalElements = await countElements(sourceDb);

  console.log(`Source iModel contains ${totalElements} elements.`);

  const targetDb = SnapshotDb.createEmpty(options.outputPath, {
    rootSubject: { name: rootSubjectName },
  });

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Transforming |{bar}| {percentage}% || {value}/{total} elements",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(totalElements, 0);

  const startTime = performance.now();
  let processed = 0;

  try {
    await withEditTxn(targetDb, "Transform elements to subjects", async (txn) => {
      const reader = sourceDb.createQueryReader(
        "SELECT ECInstanceId FROM bis.Element",
      );

      while (await reader.step()) {
        const elementId = reader.current.ECInstanceId as string;
        const sourceElement = sourceDb.elements.getElement(elementId);

        const codeValue = sourceElement.code.value || `Element-${processed + 1}`;
        Subject.insert(txn, IModel.rootSubjectId, codeValue);

        processed += 1;

        if (processed % batchSize === 0) {
          txn.saveChanges(`Transformed ${processed} elements`);
        }

        if (
          processed % PROGRESS_UPDATE_INTERVAL === 0 ||
          processed % batchSize === 0 ||
          processed === totalElements
        ) {
          progressBar.update(processed);
        }
      }
    });
  } finally {
    progressBar.stop();
    targetDb.close();
    sourceDb.close();
    await IModelHost.shutdown();
  }

  const elapsedMs = performance.now() - startTime;

  return { elementCount: processed, elapsedMs };
}
